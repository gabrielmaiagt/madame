<?php
/**
 * Cria uma transação PIX na Frendz e devolve o QR code + código copia-e-cola
 * direto pra página, sem redirecionar pra nenhum checkout externo.
 *
 * POST, body JSON: { "chargeKey": "iof_main", "customer"?: {...}, "tracking"?: {...} }
 */

// Garante que nenhum warning/notice do PHP (de qualquer versão de hospedagem)
// vaze pro output e quebre o JSON — só loga em error_log, nunca imprime.
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

require __DIR__ . '/frendz-config.php';
require __DIR__ . '/helpers.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];

$chargeKey = $input['chargeKey'] ?? null;
$charges = PIX_CHARGES;

if (!$chargeKey || !isset($charges[$chargeKey])) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_charge_key']);
    exit;
}

$charge = $charges[$chargeKey];
$tracking = is_array($input['tracking'] ?? null) ? $input['tracking'] : [];
$customer = resolve_customer($input['customer'] ?? null);

// A Frendz quer telefone e documento só com dígitos, sem máscara.
$customerPhoneDigits = preg_replace('/\D/', '', (string) $customer['phone']);
$customerDocumentDigits = preg_replace('/\D/', '', (string) $customer['document']);

$payload = [
    'amount' => $charge['amount'],
    'offer_hash' => $charge['offer_hash'],
    'payment_method' => 'pix',
    'customer' => [
        'name' => $customer['name'],
        'email' => $customer['email'],
        'phone_number' => $customerPhoneDigits,
        'document' => $customerDocumentDigits,
    ],
    'cart' => [[
        'product_hash' => $charge['product_hash'],
        'title' => $charge['title'],
        'cover' => null,
        'price' => $charge['amount'],
        'quantity' => 1,
        'operation_type' => 1,
        'tangible' => false,
    ]],
    'expire_in_days' => 1,
    'transaction_origin' => 'api',
    // A Frendz não ecoa de volta tracking de transações criadas via API, por
    // isso a atribuição é gravada localmente (ver save_pending_order abaixo)
    // em vez de depender do que o webhook manda de volta.
    'postback_url' => site_base_url() . '/api/frendz-webhook.php',
    'tracking' => [
        'src' => $tracking['src'] ?? '',
        'utm_source' => $tracking['utm_source'] ?? '',
        'utm_medium' => $tracking['utm_medium'] ?? '',
        'utm_campaign' => $tracking['utm_campaign'] ?? '',
        'utm_term' => $tracking['utm_term'] ?? '',
        'utm_content' => $tracking['utm_content'] ?? '',
    ],
];

$ch = curl_init(FRENDZ_BASE_URL . '/transactions?api_token=' . urlencode(FRENDZ_API_TOKEN));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json',
    ],
    CURLOPT_TIMEOUT => 20,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);

if ($curlError) {
    error_log('Frendz create-pix.php erro de conexão: ' . $curlError);
    http_response_code(500);
    echo json_encode(['error' => 'frendz_connection_error']);
    exit;
}

$data = json_decode($response, true);

// A resposta real da Frendz não segue o formato documentado por eles: os
// campos vêm direto na raiz (hash, pix.pix_url, pix.pix_qr_code), não dentro
// de um envelope {success, data: {...}}.
if ($httpCode < 200 || $httpCode >= 300 || empty($data['hash']) || empty($data['pix']['pix_qr_code'])) {
    error_log('Frendz create-pix.php falhou: ' . $httpCode . ' ' . substr((string) $response, 0, 500));
    http_response_code($httpCode >= 400 ? $httpCode : 500);
    echo json_encode(['error' => 'frendz_error']);
    exit;
}

$hash = $data['hash'];
$netAmountCents = isset($data['amount_liquid']) ? (int) $data['amount_liquid'] : $charge['amount'];
$createdAt = gmdate('Y-m-d H:i:s');

save_pending_order($hash, [
    'chargeKey' => $chargeKey,
    'title' => $charge['title'],
    'amount' => $charge['amount'],
    'net_amount' => $netAmountCents,
    'customer' => $customer,
    'tracking' => $tracking,
    'createdAt' => $createdAt,
    'status' => 'PENDING',
    'last_gateway_check' => time(),
]);

// Reporta a venda pra Utmify como "gerada". Isso não tem nada a ver com a
// Frendz: é a gente mesmo reportando direto pra API deles, com as UTMs que o
// navegador mandou. Uma falha aqui nunca derruba a geração do PIX.
send_to_utmify(build_utmify_order($hash, [
    'chargeKey' => $chargeKey,
    'title' => $charge['title'],
    'amount' => $charge['amount'],
    'net_amount' => $netAmountCents,
    'customer' => $customer,
    'tracking' => $tracking,
    'createdAt' => $createdAt,
], 'waiting_payment'));

// A Frendz usa mais de uma adquirente por trás dos panos: algumas devolvem o
// QR code pronto em imagem (pix_url), outras devolvem só o código copia-e-
// cola com pix_url nulo. Quando faltar a imagem, gera ela aqui mesmo a
// partir do código (serviço público, só recebe o código Pix, que já é
// público por natureza de qualquer forma).
$qrCodeUrl = $data['pix']['pix_url'];
if (empty($qrCodeUrl)) {
    $qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' . urlencode($data['pix']['pix_qr_code']);
}

echo json_encode([
    'success' => true,
    'hash' => $hash,
    'qr_code' => $qrCodeUrl,
    'pix_code' => $data['pix']['pix_qr_code'],
    'amount' => $charge['amount'],
]);
