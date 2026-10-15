/**
 * Madames Online - Cloud Functions
 * Webhook para receber eventos de pagamento do gateway
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { defineSecret } = require('firebase-functions/params');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const QRCode = require('qrcode');

// Inicializa Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Token da API Frendz, guardado no Secret Manager (nunca no código nem no
// bundle do site). Configurar com:
//   firebase functions:secrets:set FRENDZ_API_TOKEN
// Ainda usado só pelo checkout externo do ticket do front (não pelos upsells,
// que migraram pra Omega).
const frendzApiToken = defineSecret('FRENDZ_API_TOKEN');

// Credenciais da API Omega, guardadas no Secret Manager. Configurar com:
//   firebase functions:secrets:set OMEGA_PUBLIC_KEY
//   firebase functions:secrets:set OMEGA_SECRET_KEY
const omegaPublicKey = defineSecret('OMEGA_PUBLIC_KEY');
const omegaSecretKey = defineSecret('OMEGA_SECRET_KEY');

// Token da API de "Envio de Vendas" da Utmify, guardado no Secret Manager.
// Configurar com:
//   firebase functions:secrets:set UTMIFY_API_TOKEN
// Isso é inteiramente separado da Omega: a Utmify não lê nada do gateway,
// a venda é reportada direto pra API deles (POST /api-credentials/orders),
// com as UTMs que a gente já guarda. Ver docs.utmify.com.br/envio-de-vendas.
const utmifyApiToken = defineSecret('UTMIFY_API_TOKEN');

// =====================
// PIX ONE CLICK (upsells)
// =====================

const OMEGA_BASE_URL = 'https://app.omegapayments.com.br/api/v1';
const OMEGA_WEBHOOK_URL = 'https://us-central1-madame-67e19.cloudfunctions.net/omegaWebhook';

// Preço e identificação de cada oferta que usa PIX gerado direto na página
// (sem redirecionar pro checkout hospedado). O valor cobrado sempre vem
// daqui, nunca do que o cliente manda na requisição. Amount em centavos,
// igual ao resto do projeto (tracking, admin); convertido pra reais só na
// hora de montar o payload da Omega.
const PIX_CHARGES = {
    front_main: { title: 'Acesso VIP', amount: 1998 },
    iof_main: { title: 'Taxa de IOF', amount: 2349 },
    saque_main: { title: 'Liberação de Saque', amount: 1990 },
    saque_downsell: { title: 'Liberação de Saque (desconto)', amount: 995 },
    selo_main: { title: 'Selo de Destaque', amount: 2490 },
    selo_downsell: { title: 'Selo de Destaque (desconto)', amount: 1245 },
    antecipacao_main: { title: 'Antecipação de Saque', amount: 1790 }
};

// A Omega exige dados de cliente (nome, email, telefone, documento) pra
// criar a transação, mas o funil não coleta isso do lead antes do upsell.
// Usa dados fictícios só pro formato passar na validação da API; o email
// varia por transação pra não colapsar compradores diferentes no mesmo
// registro de "usuário" no Firestore.
function mockCustomer() {
    const rand = Math.random().toString(36).slice(2, 10);
    return {
        name: 'Cliente Madames Online',
        email: `cliente.${rand}@madamesonline.com`,
        phone: '(11) 99999-9999',
        document: '091.157.510-31'
    };
}

// O checkout do front (/checkout/) coleta os dados de verdade do lead antes
// de gerar o PIX; os upsells continuam sem coletar nada e usam mockCustomer.
// Valida no servidor pra nunca mandar pra Omega um dado visivelmente inválido
// (ex: o cliente adulterando a requisição direto, sem passar pelo formulário).
function resolveCustomer(rawCustomer) {
    const c = rawCustomer || {};
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    const email = typeof c.email === 'string' ? c.email.trim() : '';
    const phone = typeof c.phone === 'string' ? c.phone.trim() : '';
    const document = typeof c.document === 'string' ? c.document.trim() : '';

    const validName = name.length >= 3;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const validPhone = phone.replace(/\D/g, '').length >= 10;
    const validDocument = document.replace(/\D/g, '').length === 11;

    // Cada campo é validado (e aproveitado) individualmente, não tudo-ou-nada:
    // o checkout do front não coleta mais CPF, então o documento sempre cai
    // pro mock, mas isso não pode jogar fora nome/email/telefone reais.
    const mock = mockCustomer();
    return {
        name: validName ? name : mock.name,
        email: validEmail ? email : mock.email,
        phone: validPhone ? phone : mock.phone,
        document: validDocument ? document : mock.document,
        isReal: validName && validEmail && validPhone
    };
}

// Formata uma data em UTC 0 no formato "YYYY-MM-DD HH:MM:SS" exigido pela
// Utmify. new Date().toISOString() já é UTC, só troca o "T" por espaço e
// corta os milissegundos/Z.
function utmifyTimestamp(date) {
    return (date || new Date()).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Reporta uma venda pra API de "Envio de Vendas" da Utmify
 * (docs.utmify.com.br/envio-de-vendas). Não tem nenhuma relação com a Omega:
 * é um envio direto, nosso, com as UTMs que a gente mesmo guarda. Chamado na
 * criação do PIX (status waiting_payment) e de novo quando o status mudar
 * (paid/refused/refunded/chargedback), sempre com o mesmo orderId e createdAt.
 * Nunca deixa uma falha aqui derrubar o fluxo principal (PIX pro cliente).
 */
// Devolve true/false (nunca lança) pra quem chama poder marcar no Firestore
// se esse envio específico deu certo ou ficou pendente de reconciliação.
async function sendToUtmify(order) {
    try {
        const token = utmifyApiToken.value();
        if (!token) return false;

        const res = await fetch('https://api.utmify.com.br/api-credentials/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-token': token },
            body: JSON.stringify(order)
        });

        if (!res.ok) {
            const body = await res.text();
            console.error('Utmify recusou o envio:', res.status, body.substring(0, 300));
            return false;
        }
        return true;
    } catch (error) {
        console.error('Erro ao enviar venda pra Utmify:', error);
        return false;
    }
}

/**
 * Monta o payload padrão de "order" da Utmify a partir dos dados já
 * guardados no Firestore pra essa transação (gravados no createPixCharge,
 * complementados pelo webhook quando pago).
 */
function buildUtmifyOrder(data, status) {
    return {
        orderId: data.transaction_id,
        platform: 'MadamesOnline',
        paymentMethod: 'pix',
        status,
        createdAt: data.utmify_created_at,
        approvedDate: status === 'paid' ? utmifyTimestamp() : null,
        refundedAt: status === 'refunded' || status === 'chargedback' ? utmifyTimestamp() : null,
        customer: {
            name: data.customer_name || 'Cliente Madames Online',
            email: data.customer_email || 'contato@madamesonline.com',
            phone: (data.customer_phone || '').replace(/\D/g, '') || null,
            document: (data.customer_document || '').replace(/\D/g, '') || null,
            country: 'BR'
        },
        products: [{
            id: data.offer_hash,
            name: data.offer_title,
            planId: null,
            planName: null,
            quantity: 1,
            priceInCents: data.amount
        }],
        trackingParameters: {
            src: data.src || null,
            sck: null,
            utm_source: data.utm_source || null,
            utm_campaign: data.utm_campaign || null,
            utm_medium: data.utm_medium || null,
            utm_content: data.utm_content || null,
            utm_term: data.utm_term || null
        },
        commission: {
            totalPriceInCents: data.amount,
            gatewayFeeInCents: data.amount - data.net_amount,
            userCommissionInCents: data.net_amount
        },
        isTest: false
    };
}

/**
 * Endpoint: POST /createPixCharge
 * Cria uma transação PIX na Omega e devolve o QR code + código copia-e-cola
 * direto pra página, sem sair do funil.
 * Body: { chargeKey: 'iof_main' | 'saque_main' | ..., tracking?: {...utms} }
 */
exports.createPixCharge = functions.https.onRequest({ secrets: [omegaPublicKey, omegaSecretKey, utmifyApiToken] }, (req, res) => {
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
            const amountReais = charge.amount / 100;
            const identifier = `${chargeKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const customer = resolveCustomer(req.body && req.body.customer);

            const payload = {
                identifier,
                amount: amountReais,
                client: { name: customer.name, email: customer.email, phone: customer.phone, document: customer.document },
                products: [{ id: chargeKey, name: charge.title, quantity: 1, price: amountReais }],
                callbackUrl: OMEGA_WEBHOOK_URL
            };

            const omegaRes = await fetch(`${OMEGA_BASE_URL}/gateway/pix/receive`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-public-key': omegaPublicKey.value(),
                    'x-secret-key': omegaSecretKey.value()
                },
                body: JSON.stringify(payload)
            });
            const data = await omegaRes.json();

            if (!omegaRes.ok || !data.transactionId || !data.pix) {
                console.error('Omega createPixCharge falhou:', omegaRes.status, JSON.stringify(data).substring(0, 500));
                return res.status(omegaRes.status || 500).json({ error: 'omega_error' });
            }

            // A Omega não devolve QR code em imagem/base64 pronto (só o código
            // copia-e-cola), então gera o PNG aqui mesmo pra manter a mesma
            // interface que a página já espera (um src de imagem usável direto).
            const qrCodeDataUri = await QRCode.toDataURL(data.pix.code, { width: 280, margin: 1 });

            const netAmountCents = Math.round((amountReais - (data.fee || 0)) * 100);
            const utmifyCreatedAt = utmifyTimestamp();

            // Grava já aqui a atribuição completa (UTMs, valor, etapa do funil):
            // o webhook da Omega não ecoa de volta tracking de transações criadas
            // via API (só em vendas pelo checkout hospedado deles), então é aqui
            // que garantimos que a venda não fique "órfã" de UTM quando for paga.
            const transactionDoc = cleanUndefined({
                transaction_id: data.transactionId,
                gateway: 'omega',
                gateway_status: 'PENDING',
                internal_status: 'checkout_initiated',
                method: 'pix',
                amount: charge.amount,
                net_amount: netAmountCents,
                amount_formatted: `R$ ${amountReais.toFixed(2).replace('.', ',')}`,
                offer_hash: chargeKey,
                offer_title: charge.title,
                offer_price: charge.amount,
                customer_name: customer.name,
                customer_email: customer.email,
                customer_phone: customer.phone,
                customer_document: customer.document,
                pix_code: data.pix.code,
                pix_url: null,
                utm_source: tracking.utm_source || null,
                utm_medium: tracking.utm_medium || null,
                utm_campaign: tracking.utm_campaign || null,
                utm_term: tracking.utm_term || null,
                utm_content: tracking.utm_content || null,
                src: tracking.src || null,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                gateway_created_at: new Date().toISOString(),
                utmify_created_at: utmifyCreatedAt,
                paid_at: null,
                refund_at: null,
                is_conversion: false,
                is_pix: true,
                is_pending: true,
                // Fica false até a Utmify confirmar o recebimento. A function
                // reconcileUtmify (agendada) reenvia o que ficar pendente, pra
                // uma falha na chamada não significar perder a venda pra sempre.
                utmify_synced: false,
                utmify_last_status: 'waiting_payment'
            });
            await db.collection('transactions').doc(data.transactionId).set(transactionDoc);

            // Reporta a venda pra Utmify como "gerada" (waiting_payment). Não
            // depende da Omega em nada; se falhar, não trava o PIX do cliente
            // (fica marcada como pendente pra reconcileUtmify tentar de novo).
            const syncedNow = await sendToUtmify(buildUtmifyOrder(transactionDoc, 'waiting_payment'));
            if (syncedNow) {
                await db.collection('transactions').doc(data.transactionId).update({ utmify_synced: true });
            }

            return res.status(200).json({
                success: true,
                hash: data.transactionId,
                qr_code: qrCodeDataUri,
                pix_code: data.pix.code,
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
 * Consulta o status atual de uma transação PIX na Omega (proxy, pra não
 * expor as chaves no navegador). Usado pela página de upsell pra fazer
 * polling até o pagamento confirmar.
 */
exports.checkPixStatus = functions.https.onRequest({ secrets: [omegaPublicKey, omegaSecretKey] }, (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const hash = req.method === 'GET' ? req.query.hash : (req.body && req.body.hash);
            if (!hash) {
                return res.status(400).json({ error: 'missing_hash' });
            }

            const omegaRes = await fetch(`${OMEGA_BASE_URL}/gateway/transactions?id=${encodeURIComponent(hash)}`, {
                headers: {
                    'x-public-key': omegaPublicKey.value(),
                    'x-secret-key': omegaSecretKey.value()
                }
            });
            const data = await omegaRes.json();

            if (!omegaRes.ok) {
                return res.status(omegaRes.status).json({ error: 'omega_error' });
            }

            // Valores possíveis: PENDING, COMPLETED, FAILED, REFUNDED, CHARGED_BACK.
            return res.status(200).json({
                success: true,
                status: data.status || null
            });
        } catch (error) {
            console.error('Erro em checkPixStatus:', error);
            return res.status(500).json({ error: 'internal_error' });
        }
    });
});

/**
 * Endpoint: POST /omegaWebhook
 * Recebe eventos de transação da Omega (upsells com PIX one click).
 * Eventos: TRANSACTION_CREATED, TRANSACTION_PAID, TRANSACTION_CANCELED,
 * TRANSACTION_REFUNDED, TRANSACTION_CHARGED_BACK.
 * A atribuição (UTMs/valor/etapa) já foi gravada no createPixCharge; aqui só
 * atualiza o status, sem sobrescrever o resto (merge).
 */
exports.omegaWebhook = functions.https.onRequest({ secrets: [utmifyApiToken] }, (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const payload = req.body || {};
            console.log('📦 Webhook Omega recebido:', JSON.stringify(payload).substring(0, 500));

            const transaction = payload.transaction || {};
            const client = payload.client || {};
            const eventStatusMap = {
                TRANSACTION_CREATED: 'checkout_initiated',
                TRANSACTION_PAID: 'checkout_completed',
                TRANSACTION_CANCELED: 'checkout_cancelled',
                TRANSACTION_REFUNDED: 'checkout_refunded',
                TRANSACTION_CHARGED_BACK: 'checkout_chargeback'
            };
            const internalStatus = eventStatusMap[payload.event] || null;
            const docId = transaction.id;

            if (!docId) {
                console.error('Webhook Omega sem transaction.id, ignorando:', JSON.stringify(payload).substring(0, 300));
                return res.status(200).json({ success: true, ignored: true });
            }

            // client.name/email/etc podem vir ausentes no webhook (a Omega só
            // preenche isso de verdade em vendas pelo checkout hospedado). Usa
            // undefined (removido pelo cleanUndefined) em vez de null, pra não
            // sobrescrever com nada os dados reais já gravados no createPixCharge.
            const updateData = cleanUndefined({
                transaction_id: docId,
                gateway: 'omega',
                gateway_status: transaction.status || null,
                internal_status: internalStatus || undefined,
                method: 'pix',
                customer_name: client.name || undefined,
                customer_email: client.email || undefined,
                customer_phone: client.phone || undefined,
                customer_document: client.cpf || client.cnpj || undefined,
                paid_at: transaction.payedAt || (payload.event === 'TRANSACTION_PAID' ? new Date().toISOString() : null),
                is_conversion: payload.event === 'TRANSACTION_PAID',
                is_pending: transaction.status === 'PENDING'
            });

            await db.collection('transactions').doc(docId).set(updateData, { merge: true });
            console.log('💳 Transação Omega atualizada:', docId, payload.event);

            // Reporta a mudança de status pra Utmify (paid/refused/refunded/
            // chargedback), reaproveitando o mesmo orderId e createdAt do envio
            // original. TRANSACTION_CREATED não entra aqui: já foi reportado
            // como waiting_payment direto no createPixCharge.
            const utmifyStatusMap = {
                TRANSACTION_PAID: 'paid',
                TRANSACTION_CANCELED: 'refused',
                TRANSACTION_REFUNDED: 'refunded',
                TRANSACTION_CHARGED_BACK: 'chargedback'
            };
            const utmifyStatus = utmifyStatusMap[payload.event];

            if (utmifyStatus) {
                const snap = await db.collection('transactions').doc(docId).get();
                const full = snap.data() || {};
                const syncedNow = await sendToUtmify(buildUtmifyOrder(full, utmifyStatus));
                await db.collection('transactions').doc(docId).update({
                    utmify_synced: syncedNow,
                    utmify_last_status: utmifyStatus
                });

                if (payload.event === 'TRANSACTION_PAID') {
                    await saveConversionEvent(full);
                    await saveCheckoutCompletionTracking(full);
                }
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Erro em omegaWebhook:', error);
            return res.status(500).json({ error: 'internal_error' });
        }
    });
});

/**
 * Agendada: roda a cada 30 minutos.
 * Reenvia pra Utmify qualquer transação marcada como utmify_synced=false
 * (a chamada original falhou por algum motivo: Utmify fora do ar, rate
 * limit, etc). Sem isso, uma falha pontual na chamada à Utmify perderia a
 * atribuição daquela venda pra sempre, mesmo com a venda em si intacta na
 * Omega e no nosso Firestore. A Utmify só aceita pedidos de até 7 dias.
 */
exports.reconcileUtmify = onSchedule({ schedule: 'every 30 minutes', secrets: [utmifyApiToken] }, async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snap = await db.collection('transactions')
        .where('utmify_synced', '==', false)
        .limit(100)
        .get();

    let resent = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        const createdAtDate = data.created_at && data.created_at.toDate ? data.created_at.toDate() : null;
        if (createdAtDate && createdAtDate < sevenDaysAgo) {
            skipped++;
            continue;
        }
        const status = data.utmify_last_status || 'waiting_payment';
        const synced = await sendToUtmify(buildUtmifyOrder(data, status));
        if (synced) {
            await doc.ref.update({ utmify_synced: true });
            resent++;
        }
    }
    console.log(`🔁 reconcileUtmify: ${resent} reenviadas, ${skipped} fora do prazo de 7 dias, ${snap.size - resent - skipped} ainda pendentes.`);
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
