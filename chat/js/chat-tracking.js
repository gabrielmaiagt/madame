/**
 * Tracking para página /chat (Conversas)
 * Tracking de mensagens, profile_id, e engajamento
 */

(function () {
    'use strict';

    // Aguarda o MadamesTracking estar disponível
    function waitForTracking(callback) {
        if (window.MadamesTracking) {
            callback();
        } else {
            setTimeout(() => waitForTracking(callback), 100);
        }
    }

    waitForTracking(function () {
        console.log('✅ Chat tracking inicializado');

        // Pega profile_id da URL
        const urlParams = new URLSearchParams(window.location.search);
        const profileId = urlParams.get('profile_id') || 'unknown';

        console.log('💬 Chat com profile_id:', profileId);

        // Track página específica com profile_id
        if (profileId !== 'unknown') {
            // Cria evento customizado para diferenciar chats
            window.MadamesTracking.trackCustom('chat_opened', {
                profile_id: profileId,
                chat_url: window.location.pathname + window.location.search
            });
        }

        // Contador de mensagens
        let messagesSent = 0;

        // Detecta campo de mensagem e botão de envio
        function setupMessageTracking() {
            // Input de mensagem
            const messageInput = document.querySelector('textarea, input[type="text"]');

            // Botão de enviar (geralmente tem um SVG de "send" ou ícone de enviar)
            const sendButtons = document.querySelectorAll('button[type="submit"], button:has(svg)');

            sendButtons.forEach((btn) => {
                if (!btn.dataset.chatTrackingAdded) {
                    btn.dataset.chatTrackingAdded = 'true';
                    btn.addEventListener('click', function () {
                        const message = messageInput?.value || '';
                        if (message.trim().length > 0) {
                            messagesSent++;
                            window.MadamesTracking.trackChatMessage('sent', 'text', 'chat');
                            window.MadamesTracking.trackCustom('chat_message_sent', {
                                profile_id: profileId,
                                message_length: message.length,
                                message_number: messagesSent
                            });
                            console.log(`📤 Mensagem enviada #${messagesSent} (${message.length} chars) para profile ${profileId}`);
                        }
                    });
                }
            });

            // Detecta ENTER no textarea
            if (messageInput && !messageInput.dataset.chatTrackingAdded) {
                messageInput.dataset.chatTrackingAdded = 'true';
                messageInput.addEventListener('keypress', function (e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        const message = this.value || '';
                        if (message.trim().length > 0) {
                            messagesSent++;
                            window.MadamesTracking.trackChatMessage('sent', 'text', 'chat');
                            window.MadamesTracking.trackCustom('chat_message_sent', {
                                profile_id: profileId,
                                message_length: message.length,
                                message_number: messagesSent
                            });
                            console.log(`📤 Mensagem enviada #${messagesSent} (Enter) para profile ${profileId}`);
                        }
                    }
                });
            }
        }

        // Detecta mensagens recebidas (observando DOM)
        let messagesReceived = 0;
        const messageObserver = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) {
                        // Busca por elementos que parecem mensagens
                        // Ajuste os seletores de acordo com sua estrutura
                        const isMessage = node.classList?.contains('message') ||
                            node.classList?.contains('chat-message') ||
                            node.querySelector('[class*="message"]');

                        if (isMessage) {
                            messagesReceived++;
                            window.MadamesTracking.trackChatMessage('received', 'text', 'chat');
                            window.MadamesTracking.trackCustom('chat_message_received', {
                                profile_id: profileId,
                                message_number: messagesReceived
                            });
                            console.log(`📥 Mensagem recebida #${messagesReceived} de profile ${profileId}`);
                        }
                    }
                });
            });
        });

        // Observa container de mensagens
        const chatContainer = document.querySelector('[class*="messages"], [class*="chat-container"], main');
        if (chatContainer) {
            messageObserver.observe(chatContainer, {
                childList: true,
                subtree: true
            });
        }

        // Setup inicial
        setupMessageTracking();

        // Re-aplica quando DOM mudar
        const uiObserver = new MutationObserver(function () {
            setupMessageTracking();
        });

        uiObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Tracking de scroll (engajamento)
        let hasScrolled = false;
        if (chatContainer) {
            chatContainer.addEventListener('scroll', function () {
                if (!hasScrolled) {
                    hasScrolled = true;
                    window.MadamesTracking.trackContentScroll('chat', 50);
                    console.log('📜 Usuário scrollou o chat');
                }
            }, { passive: true });
        }

        // Tracking de botão de presente (se existir)
        const giftButtons = document.querySelectorAll('button:has(svg[class*="gift"]), button:contains("Presente")');
        giftButtons.forEach((btn) => {
            if (!btn.dataset.giftTrackingAdded) {
                btn.dataset.giftTrackingAdded = 'true';
                btn.addEventListener('click', function () {
                    window.MadamesTracking.trackGiftClaim('auto', 50, 'chat');

                    // 🎯 Track paywall source - tentou resgatar presente
                    if (window.MadamesTracking) {
                        window.MadamesTracking.trackPaywall('view', 'chat_gift_claim', 19.90);
                    }

                    console.log('🎁 Clicou em presente no chat (source: chat_gift_claim)');
                });
            }
        });

        // 🎯 Tracking de botão de saldo no chat
        const saldoBtn = document.querySelector('button:has(span:contains("saldo"))') ||
            document.querySelector('button:has(span:contains("R$"))');
        if (saldoBtn && !saldoBtn.dataset.saldoTrackingAdded) {
            saldoBtn.dataset.saldoTrackingAdded = 'true';
            saldoBtn.addEventListener('click', function () {
                window.MadamesTracking.trackWithdrawPopup('open', 'chat');

                // Track paywall source - clicou no saldo no chat
                if (window.MadamesTracking) {
                    window.MadamesTracking.trackPaywall('view', 'chat_saldo_click', 19.90);
                }

                console.log('💰 Clicou no saldo (source: chat_saldo_click)');
            });
        }

        // Tracking de saída do chat (tempo gasto)
        window.addEventListener('beforeunload', function () {
            console.log(`👋 Saindo do chat com profile ${profileId}. Mensagens enviadas: ${messagesSent}, recebidas: ${messagesReceived}`);
        });
    });
})();
