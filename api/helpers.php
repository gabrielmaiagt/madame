<?php
/**
 * Funções compartilhadas pelos endpoints de PIX (create-pix.php e
 * check-pix-status.php). Nenhuma depende de banco de dados: a "memória" de
 * cada transação é um arquivo JSON simples em api/data/orders/.
 */

/**
 * Dados fictícios usados só quando o formulário não manda um cliente válido
 * (ex: os upsells, que não coletam nada do lead). A Frendz exige esses campos
 * pra criar a transação, mas eles não precisam ser reais pra gerar o PIX.
 */
function mock_customer() {
    $rand = substr(md5(mt_rand()), 0, 8);
    return [
        'name' => 'Cliente Madames Online',
        'email' => "cliente.$rand@madamesonline.com",
        'phone' => '11999999999',
        'document' => '09115751031',
    ];
}

/**
 * Valida cada campo do cliente individualmente (não tudo-ou-nada): se o
 * formulário coletou nome/email/telefone reais mas não pediu CPF, por
 * exemplo, mantém os campos reais e só completa o que faltar com o mock.
 */
function resolve_customer($raw) {
    $raw = is_array($raw) ? $raw : [];
    $name = isset($raw['name']) ? trim((string) $raw['name']) : '';
    $email = isset($raw['email']) ? trim((string) $raw['email']) : '';
    $phone = isset($raw['phone']) ? trim((string) $raw['phone']) : '';
    $document = isset($raw['document']) ? trim((string) $raw['document']) : '';
    // Chave Pix da própria pessoa (pra receber o "saque" fictício do app).
    // Não é um campo que a Frendz aceita no cliente da transação: só fica
    // guardado no registro local da venda, pra referência.
    $pixKey = isset($raw['pixKey']) ? trim((string) $raw['pixKey']) : '';

    $validName = mb_strlen($name) >= 3;
    $validEmail = (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email);
    $validPhone = strlen(preg_replace('/\D/', '', $phone)) >= 10;
    $validDocument = strlen(preg_replace('/\D/', '', $document)) === 11;

    $mock = mock_customer();
    return [
        'name' => $validName ? $name : $mock['name'],
        'email' => $validEmail ? $email : $mock['email'],
        'phone' => $validPhone ? $phone : $mock['phone'],
        'document' => $validDocument ? $document : $mock['document'],
        'pixKey' => $pixKey !== '' ? $pixKey : null,
    ];
}

/** Caminho do arquivo onde a transação $hash fica guardada. */
function order_file_path($hash) {
    $safeHash = preg_replace('/[^a-zA-Z0-9_-]/', '', $hash);
    return __DIR__ . '/data/orders/' . $safeHash . '.json';
}

/** Salva os dados da transação recém-criada (pra o polling conseguir reportar pra Utmify quando pagar). */
function save_pending_order($hash, $order) {
    $dir = __DIR__ . '/data/orders';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    file_put_contents(order_file_path($hash), json_encode($order));
}

/** Lê os dados salvos de uma transação. Retorna null se não existir. */
function load_pending_order($hash) {
    $path = order_file_path($hash);
    if (!file_exists($path)) return null;
    $content = file_get_contents($path);
    $data = json_decode($content, true);
    return is_array($data) ? $data : null;
}

/**
 * Atualiza só o status de uma transação salva (chamado pelo webhook quando a
 * Frendz avisa que mudou, ou pelo fallback de consulta em check-pix-status.php).
 */
function update_order_status($hash, $status) {
    $order = load_pending_order($hash);
    if (!$order) return;
    $order['status'] = $status;
    file_put_contents(order_file_path($hash), json_encode($order));
}

/** Marca quando foi a última vez que consultamos a Frendz de verdade por essa transação. */
function update_order_last_check($hash, $timestamp) {
    $order = load_pending_order($hash);
    if (!$order) return;
    $order['last_gateway_check'] = $timestamp;
    file_put_contents(order_file_path($hash), json_encode($order));
}

/**
 * Monta a URL base do site a partir da própria requisição (sem precisar
 * configurar nada à mão) — usada pro postback_url do webhook da Frendz.
 */
function site_base_url() {
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}

/**
 * Executa $callback só na primeira vez que essa transação for detectada como
 * paga (evita reportar "paid" pra Utmify repetidas vezes, já que o polling
 * chama checkPixStatus a cada poucos segundos até confirmar).
 */
function mark_paid_once($hash, $callback) {
    $order = load_pending_order($hash);
    if (!$order) return;
    if (!empty($order['utmify_paid_sent'])) return;

    $callback($order);

    $order['utmify_paid_sent'] = true;
    file_put_contents(order_file_path($hash), json_encode($order));
}

/**
 * Reporta uma venda pra API de "Envio de Vendas" da Utmify
 * (docs.utmify.com.br/envio-de-vendas). Nunca lança erro: uma falha aqui não
 * pode travar a geração do PIX nem o redirecionamento do cliente.
 */
function send_to_utmify($order) {
    if (!defined('UTMIFY_API_TOKEN') || UTMIFY_API_TOKEN === '' || UTMIFY_API_TOKEN === 'SEU_TOKEN_UTMIFY_AQUI') {
        return false;
    }

    $ch = curl_init('https://api.utmify.com.br/api-credentials/orders');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($order),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-api-token: ' . UTMIFY_API_TOKEN,
        ],
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    if ($curlError || $httpCode < 200 || $httpCode >= 300) {
        error_log('Utmify recusou o envio: ' . $httpCode . ' ' . $curlError . ' ' . substr((string) $response, 0, 300));
        return false;
    }
    return true;
}

/** Monta o payload padrão de "order" da Utmify a partir dos dados salvos localmente. */
function build_utmify_order($hash, $order, $status, $approvedAt = null) {
    $tracking = $order['tracking'] ?? [];
    $customer = $order['customer'] ?? mock_customer();
    $amount = $order['amount'] ?? 0;
    $netAmount = $order['net_amount'] ?? $amount;

    return [
        'orderId' => $hash,
        'platform' => 'MadamesOnline',
        'paymentMethod' => 'pix',
        'status' => $status,
        'createdAt' => $order['createdAt'],
        'approvedDate' => $approvedAt,
        'refundedAt' => null,
        'customer' => [
            'name' => $customer['name'],
            'email' => $customer['email'],
            'phone' => preg_replace('/\D/', '', (string) ($customer['phone'] ?? '')) ?: null,
            'document' => preg_replace('/\D/', '', (string) ($customer['document'] ?? '')) ?: null,
            'country' => 'BR',
        ],
        'products' => [[
            'id' => $order['chargeKey'] ?? 'produto',
            'name' => $order['title'] ?? 'Produto',
            'planId' => null,
            'planName' => null,
            'quantity' => 1,
            'priceInCents' => $amount,
        ]],
        'trackingParameters' => [
            'src' => $tracking['src'] ?? null,
            'sck' => null,
            'utm_source' => $tracking['utm_source'] ?? null,
            'utm_campaign' => $tracking['utm_campaign'] ?? null,
            'utm_medium' => $tracking['utm_medium'] ?? null,
            'utm_content' => $tracking['utm_content'] ?? null,
            'utm_term' => $tracking['utm_term'] ?? null,
        ],
        'commission' => [
            'totalPriceInCents' => $amount,
            'gatewayFeeInCents' => $amount - $netAmount,
            'userCommissionInCents' => $netAmount,
        ],
        'isTest' => false,
    ];
}
