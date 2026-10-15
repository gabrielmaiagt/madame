<?php
/**
 * Devolve o status atual de uma transação PIX pra página fazer polling.
 *
 * Lê primeiro o status local (atualizado por frendz-webhook.php assim que a
 * Frendz avisa) e só bate na Frendz de verdade como fallback, no máximo 1 vez
 * a cada 20 segundos por transação — cobre tanto produção (via webhook)
 * quanto teste local (onde o webhook nunca chega, só o fallback funciona),
 * sem gerar tráfego excessivo pro gateway em nenhum dos dois casos.
 *
 * GET ?hash=...
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require __DIR__ . '/frendz-config.php';
require __DIR__ . '/helpers.php';

// A Frendz manda o status em minúsculas (waiting_payment, paid, refused,
// cancelled, refunded, chargeback) — normaliza pro mesmo enum que o
// front-end já espera, pra não precisar mexer em nenhum JS.
function normalize_frendz_status($paymentStatus) {
    $map = [
        'waiting_payment' => 'PENDING',
        'paid' => 'COMPLETED',
        'refused' => 'FAILED',
        'cancelled' => 'FAILED',
        'refunded' => 'REFUNDED',
        'chargeback' => 'CHARGED_BACK',
    ];
    return $map[$paymentStatus] ?? 'PENDING';
}

$hash = $_GET['hash'] ?? null;
if (!$hash) {
    http_response_code(400);
    echo json_encode(['error' => 'missing_hash']);
    exit;
}

$order = load_pending_order($hash);
if (!$order) {
    http_response_code(404);
    echo json_encode(['error' => 'order_not_found']);
    exit;
}

$status = $order['status'] ?? 'PENDING';

// Já temos um status final (chegou via webhook ou consulta anterior) — não
// precisa bater na Frendz de novo, só devolve o que já sabemos.
if ($status !== 'PENDING') {
    echo json_encode(['success' => true, 'status' => $status]);
    exit;
}

// Ainda PENDING: só consulta a Frendz de verdade se já faz 20s+ desde a
// última consulta real (o navegador faz polling a cada 4s, mas aqui a gente
// filtra isso pra não gerar tráfego excessivo pro gateway).
$now = time();
$lastChecked = (int) ($order['last_gateway_check'] ?? 0);
if (($now - $lastChecked) < 20) {
    echo json_encode(['success' => true, 'status' => $status]);
    exit;
}

update_order_last_check($hash, $now);

$ch = curl_init(FRENDZ_BASE_URL . '/transactions/' . urlencode($hash) . '?api_token=' . urlencode(FRENDZ_API_TOKEN));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
    CURLOPT_TIMEOUT => 15,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);

// Falha na consulta de fallback: não derruba o fluxo, só devolve o último
// status conhecido e tenta de novo daqui a 20s.
if ($curlError || $httpCode < 200 || $httpCode >= 300) {
    if ($curlError) {
        error_log('Frendz check-pix-status.php erro de conexão: ' . $curlError);
    } else {
        error_log('Frendz check-pix-status.php fallback falhou: HTTP ' . $httpCode);
    }
    echo json_encode(['success' => true, 'status' => $status]);
    exit;
}

$data = json_decode($response, true);
$newStatus = normalize_frendz_status($data['payment_status'] ?? null);
update_order_status($hash, $newStatus);

if ($newStatus === 'COMPLETED') {
    mark_paid_once($hash, function ($order2) use ($hash) {
        send_to_utmify(build_utmify_order($hash, $order2, 'paid', gmdate('Y-m-d H:i:s')));
    });
}

echo json_encode(['success' => true, 'status' => $newStatus]);
