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
        token: payload.token,

        // Status e método
        gateway_status: payload.status,
        internal_status: internalStatus,
        method: payload.method,

        // Valores (em centavos)
        amount: transaction.amount || 0,
        net_amount: transaction.net_amount || 0,
        amount_formatted: `R$ ${((transaction.amount || 0) / 100).toFixed(2).replace('.', ',')}`,

        // Cliente
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone || customer.phone_number,
        customer_document: customer.document,
        customer_city: customer.city,
        customer_state: customer.state,

        // Offer / Produto
        offer_hash: offer.hash,
        offer_title: offer.title,
        offer_price: offer.price,

        // URLs
        checkout_url: transaction.checkout_url,
        payment_url: transaction.url,

        // PIX específico
        pix_code: payload.method === 'pix' ? transaction.pix?.code : null,
        pix_url: payload.method === 'pix' ? transaction.pix?.url : null,

        // Tracking / UTMs
        utm_source: tracking.utm_source,
        utm_medium: tracking.utm_medium,
        utm_campaign: tracking.utm_campaign,
        utm_term: tracking.utm_term,
        utm_content: tracking.utm_content,
        src: tracking.src,

        // Metadata
        ip: payload.ip,
        fbp: payload.fbp,
        fbc: payload.fbc,
        platform: payload.platform,

        // Timestamps
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        gateway_created_at: payload.created_at,
        paid_at: payload.paid_at,
        refund_at: payload.refund_at,

        // Para queries
        is_conversion: payload.status === 'paid',
        is_pix: payload.method === 'pix',
        is_pending: payload.status === 'waiting_payment'
    };

    // Salva ou atualiza transação
    const docId = transaction.id || payload.token || `tx_${Date.now()}`;
    await db.collection('transactions').doc(docId).set(transactionData, { merge: true });
    console.log('💳 Transação salva:', docId, internalStatus);

    // Se for PIX pago, salva evento de conversão
    if (payload.status === 'paid' && payload.method === 'pix') {
        await saveConversionEvent(transactionData);
    }

    // Atualiza usuário se tiver email
    if (customer.email) {
        await updateUserFromTransaction(customer, transactionData);
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
        customer_hash: customer.hash,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone || customer.phone_number,
        customer_document: customer.document,

        // Offer
        offer_hash: offer.hash,
        offer_title: offer.title,
        offer_price: offer.price,

        // URLs
        checkout_url: payload.checkout_url,

        // Tracking
        utm_source: tracking.utm_source,
        utm_medium: tracking.utm_medium,
        utm_campaign: tracking.utm_campaign,
        src: tracking.src,

        // Metadata
        ip: payload.ip,
        platform: payload.platform,

        // Timestamps
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        gateway_created_at: payload.created_at
    };

    const docId = `abandon_${payload.abandoned_id || Date.now()}`;
    await db.collection('cart_abandons').doc(docId).set(abandonData);
    console.log('🛒 Abandono salvo:', docId, customer.email);

    // Marca usuário como abandonou checkout
    if (customer.email) {
        await markUserAsCheckoutAbandoned(customer, abandonData);
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

    await db.collection('events').add(event);
    console.log('🎉 Conversão registrada:', transactionData.transaction_id);
}

/**
 * Atualiza dados do usuário a partir da transação
 */
async function updateUserFromTransaction(customer, transactionData) {
    const userData = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || customer.phone_number,
        document: customer.document,
        city: customer.city,
        state: customer.state,

        // Status de compra
        has_purchase: transactionData.is_conversion,
        last_transaction_at: admin.firestore.FieldValue.serverTimestamp(),
        last_transaction_status: transactionData.gateway_status,

        // UTMs da compra
        purchase_utm_source: transactionData.utm_source,
        purchase_utm_campaign: transactionData.utm_campaign
    };

    // Usa email como ID do documento
    const docId = customer.email.replace(/[^a-zA-Z0-9]/g, '_');
    await db.collection('users').doc(docId).set(userData, { merge: true });
}

/**
 * Marca usuário como abandono de checkout
 */
async function markUserAsCheckoutAbandoned(customer, abandonData) {
    const userData = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || customer.phone_number,

        // Status de abandono
        checkout_abandoned: true,
        checkout_abandoned_at: admin.firestore.FieldValue.serverTimestamp(),
        abandoned_offer: abandonData.offer_title,
        abandoned_price: abandonData.offer_price
    };

    const docId = customer.email.replace(/[^a-zA-Z0-9]/g, '_');
    await db.collection('users').doc(docId).set(userData, { merge: true });
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
