<?php
/**
 * Recebe as notificações da Frendz quando o status de uma transação muda
 * (pago, recusado, reembolsado, etc). Complementa o fallback de
 * check-pix-status.php: quando esse webhook chega, a próxima consulta já lê
 * o status direto do arquivo local, sem precisar bater na Frendz de novo.
 *
 * Só funciona de verdade quando o site estiver no ar num domínio público (a
 * Frendz precisa conseguir alcançar essa URL pra entregar o webhook). Em
 * localhost, o fallback em check-pix-status.php cobre o teste local.
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

require __DIR__ . '/helpers.php';

function normalize_frendz_status_webhook($paymentStatus) {
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

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) $payload = [];

// Transações criadas via API (nosso caso) mandam o webhook com os campos na
// raiz (hash, payment_status), igual a resposta de criação — não no formato
// antigo {transaction:{...}} documentado pra checkout hospedado.
$hash = $payload['hash'] ?? null;

if (!$hash || !load_pending_order($hash)) {
    http_response_code(200);
    echo json_encode(['success' => true, 'ignored' => true]);
    exit;
}

$status = normalize_frendz_status_webhook($payload['payment_status'] ?? null);
update_order_status($hash, $status);

if ($status === 'COMPLETED') {
    mark_paid_once($hash, function ($order) use ($hash) {
        send_to_utmify(build_utmify_order($hash, $order, 'paid', gmdate('Y-m-d H:i:s')));
    });
}

http_response_code(200);
echo json_encode(['success' => true]);
