/**
 * Tracking para Modal de Saque PIX
 * Adicionar tracking quando usuário insere chave PIX e solicita saque
 */

(function () {
    'use strict';

    console.log('💰 PIX Modal tracking inicializado');

    // Função para adicionar tracking ao modal de saque
    function setupPixModalTracking() {
        // Procura pelo botão "SOLICITAR SAQUE"
        const solicitarSaqueBtn = document.querySelector('button:has-text("SOLICITAR SAQUE")') ||
            Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.toUpperCase().includes('SOLICITAR SAQUE')
            );

        if (solicitarSaqueBtn && !solicitarSaqueBtn.dataset.pixTrackingAdded) {
            solicitarSaqueBtn.dataset.pixTrackingAdded = 'true';

            solicitarSaqueBtn.addEventListener('click', function () {
                // Procura pelo input de CPF/CNPJ
                const cpfInput = document.querySelector('input[placeholder*="CPF"]') ||
                    document.querySelector('input[placeholder*="CNPJ"]') ||
                    document.querySelector('input[type="text"]');

                const pixKey = cpfInput?.value || '';

                if (pixKey && pixKey.length > 0) {
                    // Detecta origem do modal
                    let source = 'unknown';
                    if (window.location.pathname.includes('/discover')) source = 'discover';
                    else if (window.location.pathname.includes('/chat')) source = 'chat';
                    else if (window.location.pathname.includes('/premium')) source = 'premium_chat';

                    // Track PIX key entered
                    if (window.MadamesTracking) {
                        window.MadamesTracking.trackPixKeyEntered(source);
                        window.MadamesTracking.trackWithdrawPopup('submit_pix', source);

                        console.log('🔑 PIX key inserida:', pixKey.substring(0, 3) + '***', 'fonte:', source);
                    }
                }
            });
        }

        // Também monitora submit do formulário (caso tenha form)
        const pixForm = document.querySelector('form');
        if (pixForm && !pixForm.dataset.pixTrackingAdded) {
            pixForm.dataset.pixTrackingAdded = 'true';

            pixForm.addEventListener('submit', function (e) {
                const cpfInput = this.querySelector('input[type="text"]');
                const pixKey = cpfInput?.value || '';

                if (pixKey && pixKey.length > 0) {
                    let source = 'unknown';
                    if (window.location.pathname.includes('/discover')) source = 'discover';
                    else if (window.location.pathname.includes('/chat')) source = 'chat';
                    else if (window.location.pathname.includes('/premium')) source = 'premium_chat';

                    if (window.MadamesTracking) {
                        window.MadamesTracking.trackPixKeyEntered(source);
                        console.log('🔑 PIX key inserida (form submit)');
                    }
                }
            });
        }
    }

    // Setup inicial
    setupPixModalTracking();

    // Re-aplica quando modal abre (MutationObserver)
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType === 1) {
                    // Detecta se é o modal de saque
                    const isSaqueModal = node.textContent?.includes('Saque PIX') ||
                        node.textContent?.includes('SOLICITAR SAQUE') ||
                        node.querySelector('[placeholder*="CPF"]');

                    if (isSaqueModal) {
                        console.log('💰 Modal de Saque PIX aberto');
                        setTimeout(setupPixModalTracking, 100); // Aguarda render
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
