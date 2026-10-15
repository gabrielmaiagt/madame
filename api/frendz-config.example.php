<?php
/**
 * Configuração da integração de PIX (Frendz) e tracking (Utmify).
 *
 * Copie este arquivo para frendz-config.php (que fica fora do git) e troque
 * os tokens abaixo pelos reais antes de subir pro ar. Nada nesse arquivo
 * depende de Firebase, banco de dados externo ou qualquer conta específica:
 * é só PHP puro, funciona em qualquer hospedagem que tenha PHP com a
 * extensão curl (praticamente todas).
 */

// Frendz: painel > Configurações de API > Gerar token.
define('FRENDZ_API_TOKEN', 'SEU_TOKEN_FRENDZ_AQUI');
define('FRENDZ_BASE_URL', 'https://api.frendz.com.br/api/public/v1');

// Utmify: painel > Integrações > Webhooks > Credenciais de API > Adicionar Credencial.
// Deixe como string vazia ('') se não quiser reportar vendas pra Utmify.
define('UTMIFY_API_TOKEN', 'SEU_TOKEN_UTMIFY_AQUI');

// Preço (em centavos), nome, e identificação de produto/oferta na Frendz pra
// cada chave de cobrança. offer_hash e product_hash têm que existir de
// verdade na sua conta Frendz (painel > Produtos) — são os mesmos hashes
// usados nos links antigos de checkout (go.frendz.com.br/<offer_hash>).
define('PIX_CHARGES', [
    'front_main' => ['title' => 'Acesso VIP', 'amount' => 2700, 'offer_hash' => 'rknfx', 'product_hash' => 'rpw2z4szxq'],
    'iof_main' => ['title' => 'Taxa de IOF', 'amount' => 2178, 'offer_hash' => 'ukgihx3fvt', 'product_hash' => 'hha7uooi3x'],
    'saque_main' => ['title' => 'Liberação de Saque', 'amount' => 1700, 'offer_hash' => 'a9reeqwbim', 'product_hash' => 'e2x0rqabne'],
    'saque_downsell' => ['title' => 'Liberação de Saque (desconto)', 'amount' => 995, 'offer_hash' => 'ibeil', 'product_hash' => 'e2x0rqabne'],
    'selo_main' => ['title' => 'Selo de Destaque', 'amount' => 1500, 'offer_hash' => '8whgzth5cp', 'product_hash' => 'x5mpnyubmp'],
    'selo_downsell' => ['title' => 'Selo de Destaque (desconto)', 'amount' => 1245, 'offer_hash' => 'fhm9k', 'product_hash' => 'x5mpnyubmp'],
    'antecipacao_main' => ['title' => 'Antecipação de Saque', 'amount' => 1790, 'offer_hash' => 'dxas6', 'product_hash' => 'ch5adpzx1u'],
]);
