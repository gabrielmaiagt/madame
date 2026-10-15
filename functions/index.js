/**
 * Madames Online - Cloud Functions
 * Webhook para receber eventos de pagamento do gateway
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { defineSecret } = require('firebase-functions/params');

// Inicializa Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Token da API Frendz, guardado no Secret Manager (nunca no código nem no
// bundle do site). Configurar com:
//   firebase functions:secrets:set FRENDZ_API_TOKEN
const frendzApiToken = defineSecret('FRENDZ_API_TOKEN');

// =====================
// PIX ONE CLICK (upsells)
// =====================

const FRENDZ_BASE_URL = 'https://api.frendz.com.br/api/public/v1';

// Preço e identificação de cada oferta que usa PIX gerado direto na página
// (sem redirecionar pro checkout hospedado da Frendz). O valor cobrado
// sempre vem daqui, nunca do que o cliente manda na requisição.
const PIX_CHARGES = {
    front_main: { productHash: 'rpw2z4szxq', offerHash: 'rknfx', title: 'Acesso VIP', amount: 2700 },
    iof_main: { productHash: 'hha7uooi3x', offerHash: 'ukgihx3fvt', title: 'Taxa de IOF', amount: 2178 },
    saque_main: { productHash: 'e2x0rqabne', offerHash: 'a9reeqwbim', title: 'Liberação de Saque', amount: 1700 },
    saque_downsell: { productHash: 'e2x0rqabne', offerHash: 'ibeil', title: 'Liberação de Saque (desconto)', amount: 995 },
    selo_main: { productHash: 'x5mpnyubmp', offerHash: '8whgzth5cp', title: 'Selo de Destaque', amount: 1500 },
    selo_downsell: { productHash: 'x5mpnyubmp', offerHash: 'fhm9k', title: 'Selo de Destaque (desconto)', amount: 1245 },
    antecipacao_main: { productHash: 'ch5adpzx1u', offerHash: 'dxas6', title: 'Antecipação de Saque', amount: 1790 }
};

// A Frendz exige dados de cliente (nome, email, telefone, documento) pra
// criar a transação, mas o funil não coleta isso do lead antes do upsell.
// Usa dados fictícios só pro formato passar na validação da API; o email
// varia por transação pra não colapsar compradores diferentes no mesmo
// registro de "usuário" no webhook (que indexa por email).
function mockCustomer() {
    const rand = Math.random().toString(36).slice(2, 10);
    return {
        name: 'Cliente Madames Online',
        email: `cliente.${rand}@madamesonline.com`,
        phone_number: '11999999999',
        document: '09115751031'
    };
}

// Valida cada campo do cliente mandado pela página (nome/email reais do
// cadastro, no checkout do front) e completa com o mock só o que faltar —
// a Frendz exige esses campos, mas não precisam ser reais pra gerar o PIX.
// A chave Pix nunca vai pra Frendz: só fica salva na nossa própria ordem
// (coleção pix_orders), pra referência.
function resolveCustomer(raw) {
    raw = raw || {};
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const email = typeof raw.email === 'string' ? raw.email.trim() : '';
    const pixKey = typeof raw.pixKey === 'string' ? raw.pixKey.trim() : '';

    const validName = name.length >= 3;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const mock = mockCustomer();
    return {
        name: validName ? name : mock.name,
        email: validEmail ? email : mock.email,
        phone_number: mock.phone_number,
        document: mock.document,
        pixKey: pixKey || null
    };
}

/**
 * Endpoint: POST /createPixCharge
 * Cria uma transação PIX na Frendz e devolve o QR code + código copia-e-cola
 * direto pra página, sem sair do funil.
 * Body: { chargeKey: 'iof_main' | 'saque_main' | ..., tracking?: {...utms} }
 */
exports.createPixCharge = functions.https.onRequest({ secrets: [frendzApiToken] }, (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const chargeKey = req.body && req.body.chargeKey;
            const charge = PIX_CHARGES[chargeKey];
            if (!charge) {
                return res.status(400).json({ error: 'invalid_charge_key' });
            }

            const tracking = (req.body && req.body.tracking) || {};
            const customer = resolveCustomer(req.body && req.body.customer);

            const payload = {
                amount: charge.amount,
                offer_hash: charge.offerHash,
                payment_method: 'pix',
                customer: {
                    name: customer.name,
                    email: customer.email,
                    phone_number: customer.phone_number,
                    document: customer.document
                },
                cart: [{
                    product_hash: charge.productHash,
                    title: charge.title,
                    cover: null,
                    price: charge.amount,
                    quantity: 1,
                    operation_type: 1,
                    tangible: false
                }],
                expire_in_days: 1,
                transaction_origin: 'api',
                // Sem isso a Frendz não avisa ninguém quando o PIX é pago: a venda
                // nunca cairia na coleção transactions e sumiria das métricas do admin.
                postback_url: 'https://us-central1-madame-67e19.cloudfunctions.net/paymentWebhook',
                tracking: {
                    src: tracking.src || '',
                    utm_source: tracking.utm_source || '',
                    utm_medium: tracking.utm_medium || '',
                    utm_campaign: tracking.utm_campaign || '',
                    utm_term: tracking.utm_term || '',
                    utm_content: tracking.utm_content || ''
                }
            };

            const frendzRes = await fetch(`${FRENDZ_BASE_URL}/transactions?api_token=${frendzApiToken.value()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await frendzRes.json();

            // A resposta real da Frendz não segue o formato documentado
            // ({success, data: {...}}): os campos vêm direto na raiz, e o
            // QR code é uma URL de imagem (data.pix.pix_url), não base64.
            if (!frendzRes.ok || !data.hash || !data.pix) {
                console.error('Frendz createPixCharge falhou:', frendzRes.status, JSON.stringify(data).substring(0, 500));
                return res.status(frendzRes.status || 500).json({ error: 'frendz_error' });
            }

            // Guarda a chave Pix da pessoa (nunca mandada pra Frendz) junto do
            // resto do pedido, pra referência — não bloqueia a resposta do PIX
            // se der erro de gravação.
            try {
                await db.collection('pix_orders').doc(data.hash).set({
                    chargeKey: chargeKey,
                    title: charge.title,
                    amount: charge.amount,
                    customer_name: customer.name,
                    customer_email: customer.email,
                    pix_key: customer.pixKey,
                    tracking: tracking,
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (saveError) {
                console.error('Falha ao salvar pix_orders:', saveError);
            }

            return res.status(200).json({
                success: true,
                hash: data.hash,
                qr_code: data.pix.pix_url,
                pix_code: data.pix.pix_qr_code,
                amount: charge.amount
            });
        } catch (error) {
            console.error('Erro em createPixCharge:', error);
            return res.status(500).json({ error: 'internal_error' });
        }
    });
});

/**
 * Endpoint: GET/POST /checkPixStatus?hash=...
 * Consulta o status atual de uma transação PIX na Frendz (proxy, pra não
 * expor o api_token no navegador). Usado pela página de upsell pra fazer
 * polling até o pagamento confirmar.
 */
exports.checkPixStatus = functions.https.onRequest({ secrets: [frendzApiToken] }, (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const hash = req.method === 'GET' ? req.query.hash : (req.body && req.body.hash);
            if (!hash) {
                return res.status(400).json({ error: 'missing_hash' });
            }

            const frendzRes = await fetch(`${FRENDZ_BASE_URL}/transactions/${encodeURIComponent(hash)}?api_token=${frendzApiToken.value()}`, {
                headers: { Accept: 'application/json' }
            });
            const data = await frendzRes.json();

            if (!frendzRes.ok) {
                return res.status(frendzRes.status).json({ error: 'frendz_error' });
            }

            // Campo real é payment_status (ex: waiting_payment, paid, refused,
            // cancelled, refunded, chargeback), não "status" como a doc mostrava.
            return res.status(200).json({
                success: true,
                status: data.payment_status || null
            });
        } catch (error) {
            console.error('Erro em checkPixStatus:', error);
            return res.status(500).json({ error: 'internal_error' });
        }
    });
});

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

            // Registra o erro no Firestore para aparecer no painel admin
            // (antes disso, a coleção webhook_errors nunca era escrita)
            try {
                await db.collection('webhook_errors').add({
                    error_type: error.name || 'Error',
                    message: error.message || String(error),
                    payload_preview: JSON.stringify(req.body || {}).substring(0, 500),
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                    gateway_created_at: new Date().toISOString()
                });
            } catch (logError) {
                console.error('Falha ao registrar erro do webhook:', logError);
            }

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
    // A Frendz manda dois formatos de payload dependendo de como a transação
    // foi criada: o formato antigo (checkout hospedado) tem status/method/
    // transaction.{id,amount,...} soltos; o formato novo (ex: transação criada
    // via API) tem payment_status/payment_method e os campos (hash, amount,
    // pix, offer, tracking) direto na raiz, igual ao GET /transactions/{hash}.
    // payload.token é o id da CONTA (sempre o mesmo em toda transação), nunca
    // pode ser usado como id do documento — foi o bug que fazia toda venda
    // nova sobrescrever a mesma linha no Firestore.
    const legacyTransaction = payload.transaction || {};
    const customer = payload.customer || {};
    const tracking = payload.tracking || {};
    const offer = payload.offer || {};
    const pixData = payload.pix || legacyTransaction.pix || {};

    const gatewayStatus = payload.payment_status || payload.status;
    const method = payload.payment_method || payload.method;
    const amount = (typeof payload.amount === 'number' ? payload.amount : legacyTransaction.amount) || 0;
    const netAmount = (typeof payload.amount_liquid === 'number' ? payload.amount_liquid : legacyTransaction.net_amount) || 0;

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

    const internalStatus = statusMap[gatewayStatus] || gatewayStatus;

    // Dados para salvar
    const transactionData = {
        // Identificadores
        transaction_id: payload.hash || legacyTransaction.id || payload.token,
        token: payload.token || null,

        // Status e método
        gateway_status: gatewayStatus,
        internal_status: internalStatus,
        method: method,

        // Valores (em centavos)
        amount: amount,
        net_amount: netAmount,
        amount_formatted: `R$ ${(amount / 100).toFixed(2).replace('.', ',')}`,

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
        checkout_url: legacyTransaction.checkout_url || null,
        payment_url: legacyTransaction.url || null,

        // PIX específico
        pix_code: method === 'pix' ? (pixData.pix_qr_code || pixData.code || null) : null,
        pix_url: method === 'pix' ? (pixData.pix_url || pixData.url || null) : null,

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
        is_conversion: gatewayStatus === 'paid',
        is_pix: method === 'pix',
        is_pending: gatewayStatus === 'waiting_payment'
    };

    // Remove undefined
    const cleanData = cleanUndefined(transactionData);

    // Salva ou atualiza transação. NUNCA cair pro payload.token aqui: é o id
    // da conta, igual em toda transação, e faria uma sobrescrever a outra.
    const docId = payload.hash || legacyTransaction.id || `tx_${Date.now()}`;
    await db.collection('transactions').doc(docId).set(cleanData, { merge: true });
    console.log('💳 Transação salva:', docId, internalStatus);

    // Se for PIX pago, salva evento de conversão
    if (gatewayStatus === 'paid' && method === 'pix') {
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
