/**
 * Madames Online - Cloud Functions
 * Webhook para receber eventos de pagamento do gateway
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Inicializa Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// =====================
// WEBHOOK DE PAGAMENTOS
// =====================

/**
 * Endpoint: POST /paymentWebhook
 * Recebe eventos de transação e abandono de checkout do gateway
 * 
 * Eventos suportados:
 * - transaction: status waiting_payment, paid, cancelled, refunded
 * - cart.abandoned: abandono de checkout
 */
exports.paymentWebhook = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        // Só aceita POST
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const payload = req.body;
            console.log('📦 Webhook recebido:', JSON.stringify(payload).substring(0, 500));

            // Identifica o tipo de evento
            const eventType = payload.event || 'transaction';

            if (eventType === 'cart.abandoned') {
                // Evento de abandono de checkout
                await handleCartAbandoned(payload);
            } else if (eventType === 'transaction') {
                // Evento de transação
                await handleTransaction(payload);
            } else {
                console.log('Evento desconhecido:', eventType);
            }

            // Retorna 200 para confirmar recebimento
            return res.status(200).json({
                success: true,
                message: 'Webhook processed',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Erro no webhook:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });
});


// =====================
// UTILS
// =====================

/**
 * Remove chaves com valor undefined de um objeto
 * Firestore não aceita undefined
 */
function cleanUndefined(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// =====================
// HANDLERS
// =====================

/**
 * Processa transação de pagamento
 */
async function handleTransaction(payload) {
    const transaction = payload.transaction || {};
    const customer = payload.customer || {};
    const tracking = payload.tracking || {};
    const offer = payload.offer || {};

    // Mapeia status para nossa métrica
    const statusMap = {
        'waiting_payment': 'checkout_initiated',
        'processing': 'checkout_processing',
        'authorized': 'checkout_authorized',
        'paid': 'checkout_completed',
        'refused': 'checkout_refused',
        'cancelled': 'checkout_cancelled',
        'refunded': 'checkout_refunded',
        'chargeback': 'checkout_chargeback'
    };

    const internalStatus = statusMap[payload.status] || payload.status;

    // Dados para salvar
    const transactionData = {
        // Identificadores
        transaction_id: transaction.id || payload.token,
        token: payload.token || null,

        // Status e método
        gateway_status: payload.status,
        internal_status: internalStatus,
        method: payload.method,

        // Valores (em centavos)
        amount: transaction.amount || 0,
        net_amount: transaction.net_amount || 0,
        amount_formatted: `R$ ${((transaction.amount || 0) / 100).toFixed(2).replace('.', ',')}`,

        // Cliente
        customer_id: customer.id || null,
        customer_name: customer.name || null,
        customer_email: customer.email || null,
        customer_phone: customer.phone || customer.phone_number || null,
        customer_document: customer.document || null,
        customer_city: customer.city || null,
        customer_state: customer.state || null,

        // Offer / Produto
        offer_hash: offer.hash || null,
        offer_title: offer.title || null,
        offer_price: offer.price || null,

        // URLs
        checkout_url: transaction.checkout_url || null,
        payment_url: transaction.url || null,

        // PIX específico
        pix_code: payload.method === 'pix' ? (transaction.pix?.code || null) : null,
        pix_url: payload.method === 'pix' ? (transaction.pix?.url || null) : null,

        // Tracking / UTMs
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_term: tracking.utm_term || null,
        utm_content: tracking.utm_content || null,
        src: tracking.src || null,

        // Metadata
        ip: payload.ip || null,
        fbp: payload.fbp || null,
        fbc: payload.fbc || null,
        platform: payload.platform || null,

        // Timestamps
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        gateway_created_at: payload.created_at || null,
        paid_at: payload.paid_at || null,
        refund_at: payload.refund_at || null,

        // Para queries
        is_conversion: payload.status === 'paid',
        is_pix: payload.method === 'pix',
        is_pending: payload.status === 'waiting_payment'
    };

    // Remove undefined
    const cleanData = cleanUndefined(transactionData);

    // Salva ou atualiza transação
    const docId = transaction.id || payload.token || `tx_${Date.now()}`;
    await db.collection('transactions').doc(docId).set(cleanData, { merge: true });
    console.log('💳 Transação salva:', docId, internalStatus);

    // Se for PIX pago, salva evento de conversão
    if (payload.status === 'paid' && payload.method === 'pix') {
        await saveConversionEvent(cleanData);

        // ✨ TRACKING: Registra checkout completion
        await saveCheckoutCompletionTracking(cleanData);
    }

    // Atualiza usuário se tiver email
    if (customer.email) {
        await updateUserFromTransaction(customer, cleanData);
    }

    return docId;
}

/**
 * Processa abandono de checkout
 */
async function handleCartAbandoned(payload) {
    const customer = payload.customer || {};
    const offer = payload.offer || {};
    const tracking = payload.tracking || {};

    const abandonData = {
        abandoned_id: payload.abandoned_id,

        // Cliente
        customer_hash: customer.hash || null,
        customer_name: customer.name || null,
        customer_email: customer.email || null,
        customer_phone: customer.phone || customer.phone_number || null,
        customer_document: customer.document || null,

        // Offer
        offer_hash: offer.hash || null,
        offer_title: offer.title || null,
        offer_price: offer.price || null,

        // URLs
        checkout_url: payload.checkout_url || null,

        // Tracking
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        src: tracking.src || null,

        // Metadata
        ip: payload.ip || null,
        platform: payload.platform || null,

        // Timestamps
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        gateway_created_at: payload.created_at || null
    };

    const cleanData = cleanUndefined(abandonData);
    const docId = `abandon_${payload.abandoned_id || Date.now()}`;
    await db.collection('cart_abandons').doc(docId).set(cleanData);
    console.log('🛒 Abandono salvo:', docId, customer.email);

    // Marca usuário como abandonou checkout
    if (customer.email) {
        await markUserAsCheckoutAbandoned(customer, cleanData);
    }

    return docId;
}

/**
 * Salva evento de conversão (PIX pago)
 */
async function saveConversionEvent(transactionData) {
    const event = {
        event_type: 'conversion',
        conversion_type: 'pix_paid',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        transaction_id: transactionData.transaction_id,
        amount: transactionData.amount,
        customer_email: transactionData.customer_email,
        utm_source: transactionData.utm_source,
        utm_medium: transactionData.utm_medium,
        utm_campaign: transactionData.utm_campaign,
        server_timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    // cleanUndefined não é necessário aqui pois construímos o objeto explicitamente,
    // mas transactionData já está limpo.
    await db.collection('events').add(cleanUndefined(event));
    console.log('🎉 Conversão registrada:', transactionData.transaction_id);
}

/**
 * Salva evento de checkout completion (para tracking)
 * Integra com MadamesTracking backend
 */
async function saveCheckoutCompletionTracking(transactionData) {
    const event = {
        event_type: 'checkout',
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now(),
        datetime: new Date().toISOString(),

        // Dados específicos do checkout
        action: 'complete',
        source: 'paywall',
        price: (transactionData.amount || 0) / 100, // Converte de centavos para reais

        // Dados da transação
        transaction_id: transactionData.transaction_id,
        payment_method: 'pix',

        // Cliente
        customer_email: transactionData.customer_email,
        customer_name: transactionData.customer_name,

        // UTMs
        utms: {
            utm_source: transactionData.utm_source,
            utm_medium: transactionData.utm_medium,
            utm_campaign: transactionData.utm_campaign,
            utm_term: transactionData.utm_term,
            utm_content: transactionData.utm_content
        },

        // Device info (do webhook)
        device: {
            platform: transactionData.platform || 'unknown',
            ip: transactionData.ip
        },

        // Metadata
        page: '/checkout',
        referrer: null,

        // Timestamp do servidor
        server_timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('events').add(cleanUndefined(event));
    console.log('✅ Checkout completion tracking salvo:', transactionData.transaction_id);
}

/**
 * Atualiza dados do usuário a partir da transação
 */
async function updateUserFromTransaction(customer, transactionData) {
    const userData = {
        name: customer.name || null,
        email: customer.email || null,
        phone: customer.phone || customer.phone_number || null,
        document: customer.document || null,
        city: customer.city || null,
        state: customer.state || null,

        // Status de compra
        has_purchase: transactionData.is_conversion,
        last_transaction_at: admin.firestore.FieldValue.serverTimestamp(),
        last_transaction_status: transactionData.gateway_status,

        // UTMs da compra
        purchase_utm_source: transactionData.utm_source || null,
        purchase_utm_campaign: transactionData.utm_campaign || null
    };

    // Usa email como ID do documento
    const docId = customer.email.replace(/[^a-zA-Z0-9]/g, '_');
    await db.collection('users').doc(docId).set(cleanUndefined(userData), { merge: true });
}

/**
 * Marca usuário como abandono de checkout
 */
async function markUserAsCheckoutAbandoned(customer, abandonData) {
    const userData = {
        name: customer.name || null,
        email: customer.email || null,
        phone: customer.phone || customer.phone_number || null,

        // Status de abandono
        checkout_abandoned: true,
        checkout_abandoned_at: admin.firestore.FieldValue.serverTimestamp(),
        abandoned_offer: abandonData.offer_title || null,
        abandoned_price: abandonData.offer_price || null
    };

    const docId = customer.email.replace(/[^a-zA-Z0-9]/g, '_');
    await db.collection('users').doc(docId).set(cleanUndefined(userData), { merge: true });
}

// =====================
// HEALTH CHECK
// =====================

exports.health = functions.https.onRequest((req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Madames Webhook'
    });
});
