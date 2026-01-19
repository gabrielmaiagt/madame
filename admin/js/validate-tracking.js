/**
 * Script de Validação do Tracking do Funil
 * 
 * Cole este código no console do navegador para testar as correções
 */

console.log('🧪 Iniciando validação do tracking...\n');

// 1. Limpa dados antigos
console.log('1️⃣ Limpando dados antigos...');
MadamesTracking.clearEvents();
localStorage.clear();
sessionStorage.clear();
console.log('✅ Dados limpos\n');

// 2. Simula navegação pelo funil
console.log('2️⃣ Simulando navegação pelo funil...');

const pages = [
    '/app/',
    '/register/step1/',
    '/register/step2/',
    '/welcome/',
    '/discover/',
    '/chat/'
];

pages.forEach((page, index) => {
    console.log(`   Visitando: ${page}`);
    MadamesTracking.trackPageView(page);
});

console.log('✅ Navegação completa simulada\n');

// 3. Testa deduplicação com time-window
console.log('3️⃣ Testando deduplicação de page_view...');
console.log('   Tentando trackear /discover/ novamente (deve ser ignorado)...');
MadamesTracking.trackPageView('/discover/');

const summary = MadamesTracking.getTrackingSummary();
console.log('   Page views de /discover/:', summary.pages['/discover/'].pageviews);
console.log('   Sessões únicas em /discover/:', summary.pages['/discover/'].uniqueSessions);

if (summary.pages['/discover/'].pageviews === 1) {
    console.log('✅ Deduplicação funcionando corretamente\n');
} else {
    console.error('❌ ERRO: Deduplicação não está funcionando!\n');
}

// 4. Valida consistência dos dados
console.log('4️⃣ Validando consistência dos dados...');
const sessionsByPage = MadamesTracking.getSessionsByPage();

let allConsistent = true;
Object.keys(sessionsByPage).forEach(page => {
    const data = sessionsByPage[page];
    const summaryData = summary.pages[page];

    if (data.uniqueSessions !== summaryData.uniqueSessions) {
        console.error(`❌ ERRO em ${page}: sessões inconsistentes`);
        allConsistent = false;
    }
});

if (allConsistent) {
    console.log('✅ Todos os dados estão consistentes\n');
}

// 5. Exibe resumo completo
console.log('5️⃣ Resumo completo do tracking:');
console.table([
    { Métrica: 'Total de Eventos', Valor: summary.totalEvents },
    { Métrica: 'Sessões Únicas', Valor: summary.uniqueSessions },
    { Métrica: 'Page Views', Valor: summary.eventTypes.page_view || 0 }
]);

console.log('\n📊 Page Views por Página:');
const pagesTable = Object.keys(summary.pages).map(page => ({
    Página: page,
    PageViews: summary.pages[page].pageviews,
    'Sessões Únicas': summary.pages[page].uniqueSessions,
    'Consistente?': summary.pages[page].pageviews >= summary.pages[page].uniqueSessions ? '✅' : '❌'
}));
console.table(pagesTable);

// 6. Calcula conversões (deve ser <= 100%)
console.log('\n6️⃣ Validando conversões (devem ser <= 100%):');
const landingVisitors = summary.pages['/app/']?.uniqueSessions || 0;
const chatVisitors = summary.pages['/chat/']?.uniqueSessions || 0;
const conversion = landingVisitors > 0 ? (chatVisitors / landingVisitors * 100).toFixed(1) : 0;

console.log(`   Landing → Chat: ${conversion}%`);

if (conversion <= 100) {
    console.log('✅ Conversão está dentro do esperado (<= 100%)\n');
} else {
    console.error('❌ ERRO: Conversão impossível (> 100%)!\n');
}

// 7. Testa funções de debug
console.log('7️⃣ Testando funções de debug:');
console.log('   - getEventsByType("page_view"):', MadamesTracking.getEventsByType('page_view').length, 'eventos');
console.log('   - getSessionsByPage():', Object.keys(sessionsByPage).length, 'páginas');
console.log('   - getTrackingSummary():', summary.uniqueSessions, 'sessões únicas');
console.log('✅ Funções de debug funcionando\n');

// Resultado final
console.log('═══════════════════════════════════════');
console.log('🎉 VALIDAÇÃO COMPLETA!');
console.log('═══════════════════════════════════════');
console.log('\n💡 Próximos passos:');
console.log('1. Navegue manualmente pelo funil no site');
console.log('2. Abra /admin/ e verifique o dashboard');
console.log('3. Confirme que as conversões estão corretas');
console.log('4. Teste recarregar /discover/ várias vezes');
console.log('5. Aguarde 31+ minutos e recarregue novamente\n');
