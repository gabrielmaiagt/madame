/**
 * Tracking para página /discover (Swipe)
 * Adiciona tracking manual de swipe, profile views e ações
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
        console.log('✅ Discover tracking inicializado');

        // Contador de perfis visualizados
        let profilesViewed = 0;

        // 🎯 CONTADORES DE SWIPE para tracking de paywall source
        let likeCount = 0;
        let dislikeCount = 0;
        const SWIPE_THRESHOLD = 5; // Após 5 swipes seguidos, track paywall source

        // Helper para detectar e track paywall por source
        function trackPaywallIfNeeded(source) {
            if (window.MadamesTracking) {
                window.MadamesTracking.trackPaywall('view', source, 19.90);
                console.log('🎯 Paywall source tracked:', source);
            }
        }

        // Detecta botões de swipe
        function setupSwipeTracking() {
            // Botão de Like (Coração)
            const likeButtons = document.querySelectorAll('button.bg-primary-500, button:has(svg path[d*="M19 14c1.49"])');
            likeButtons.forEach((btn) => {
                if (!btn.dataset.trackingAdded) {
                    btn.dataset.trackingAdded = 'true';
                    btn.addEventListener('click', function () {
                        const profileName = document.querySelector('h2.text-2xl')?.textContent?.split(',')[0] || 'Profile';
                        profilesViewed++;
                        likeCount++;
                        dislikeCount = 0; // Reset dislike counter

                        window.MadamesTracking.trackSwipe('like', `profile-${profilesViewed}`, profileName);
                        window.MadamesTracking.trackProfileView(`profile-${profilesViewed}`, profileName, profilesViewed);

                        // Track paywall source se curtiu muitos seguidos
                        if (likeCount >= SWIPE_THRESHOLD) {
                            trackPaywallIfNeeded('discover_like_todas');
                            likeCount = 0; // Reset para não disparar toda hora
                        }

                        console.log('👍 Swipe LIKE:', profileName, `(${likeCount} likes seguidos)`);
                    });
                }
            });

            // Botão de Dislike (X)
            const dislikeButtons = document.querySelectorAll('button:has(svg path[d*="M18 6 6 18"])');
            dislikeButtons.forEach((btn) => {
                if (!btn.dataset.trackingAdded) {
                    btn.dataset.trackingAdded = 'true';
                    btn.addEventListener('click', function () {
                        const profileName = document.querySelector('h2.text-2xl')?.textContent?.split(',')[0] || 'Profile';
                        profilesViewed++;
                        dislikeCount++;
                        likeCount = 0; // Reset like counter

                        window.MadamesTracking.trackSwipe('dislike', `profile-${profilesViewed}`, profileName);
                        window.MadamesTracking.trackProfileView(`profile-${profilesViewed}`, profileName, profilesViewed);

                        // Track paywall source se recusou muitos seguidos
                        if (dislikeCount >= SWIPE_THRESHOLD) {
                            trackPaywallIfNeeded('discover_recusa_todas');
                            dislikeCount = 0; // Reset
                        }

                        console.log('👎 Swipe DISLIKE:', profileName, `(${dislikeCount} dislikes seguidos)`);
                    });
                }
            });
            // Botão de Voltar
            const backButtons = document.querySelectorAll('button:has(svg path[d*="m12 19-7-7 7-7"])');
            backButtons.forEach((btn) => {
                if (!btn.dataset.trackingAdded) {
                    btn.dataset.trackingAdded = 'true';
                    btn.addEventListener('click', function () {
                        console.log('⬅️ Voltar perfil');
                    });
                }
            });
        }

        // Setup inicial
        setupSwipeTracking();

        // Re-aplica quando DOM mudar (Next.js pode re-renderizar)
        const observer = new MutationObserver(function () {
            setupSwipeTracking();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Tracking de abrir popup de saldo
        const saldoBtn = document.querySelector('button:has(span:contains("Seu saldo"))') ||
            document.querySelector('button:has(span:contains("R$"))');
        if (saldoBtn && !saldoBtn.dataset.saldoTrackingAdded) {
            saldoBtn.dataset.saldoTrackingAdded = 'true';
            saldoBtn.addEventListener('click', function () {
                window.MadamesTracking.trackWithdrawPopup('open', 'discover');

                // 🎯 Track paywall source - clicou no saldo
                trackPaywallIfNeeded('discover_saldo_click');

                console.log('💰 Abriu popup de saldo (source: discover_saldo_click)');
            });
        }
    });
})();
