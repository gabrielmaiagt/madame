/**
 * Mobile Touch Optimization Script
 * Adiciona passive event listeners para melhorar scroll performance
 */

(function () {
    'use strict';

    // Detecta se é mobile
    const isMobile = window.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!isMobile) return; // Otimizações só para mobile

    // Passive event listeners para scroll e touch
    const addPassiveListeners = () => {
        let supportsPassive = false;
        try {
            const opts = Object.defineProperty({}, 'passive', {
                get: function () {
                    supportsPassive = true;
                }
            });
            window.addEventListener("testPassive", null, opts);
            window.removeEventListener("testPassive", null, opts);
        } catch (e) { }

        if (!supportsPassive) return;

        // Sobrescreve addEventListener para touch/wheel/scroll events
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const passiveEvents = ['touchstart', 'touchmove', 'touchend', 'wheel', 'scroll'];

        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (passiveEvents.includes(type)) {
                if (typeof options === 'boolean') {
                    options = { capture: options, passive: true };
                } else if (typeof options === 'object' && options.passive === undefined) {
                    options.passive = true;
                } else if (!options) {
                    options = { passive: true };
                }
            }
            return originalAddEventListener.call(this, type, listener, options);
        };
    };

    // Lazy loading para imagens
    const setupLazyLoading = () => {
        if ('loading' in HTMLImageElement.prototype) {
            // Navegador suporta lazy loading nativo
            const images = document.querySelectorAll('img:not([loading])');
            images.forEach(img => {
                if (!img.hasAttribute('fetchpriority') || img.getAttribute('fetchpriority') !== 'high') {
                    img.setAttribute('loading', 'lazy');
                }
            });
        } else {
            // Fallback para navegadores antigos
            const lazyImages = document.querySelectorAll('img[loading="lazy"]');
            if ('IntersectionObserver' in window) {
                const imageObserver = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            if (img.dataset.src) {
                                img.src = img.dataset.src;
                            }
                            img.classList.add('loaded');
                            observer.unobserve(img);
                        }
                    });
                }, {
                    rootMargin: '50px'
                });

                lazyImages.forEach(img => imageObserver.observe(img));
            }
        }
    };

    // Otimiza interações com swipe
    const optimizeSwipe = () => {
        const swipeables = document.querySelectorAll('.swipeable, [data-swipeable="true"]');
        swipeables.forEach(el => {
            // Previne scroll durante swipe
            let touchStartY = 0;

            el.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            }, { passive: true });

            el.addEventListener('touchmove', (e) => {
                const touchY = e.touches[0].clientY;
                const diff = Math.abs(touchY - touchStartY);

                // Se movimento é principalmente horizontal, previne scroll vertical
                if (diff < 10) {
                    e.preventDefault();
                }
            }, { passive: false }); // Não passive para permitir preventDefault
        });
    };

    // Reduz motion se preferido
    const respectMotionPreference = () => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

        if (prefersReducedMotion.matches) {
            document.documentElement.style.setProperty('--animation-duration', '0.01m s!important');
            document.documentElement.style.setProperty('--transition-duration', '0.01ms!important');
        }
    };

    // Otimiza scroll performance
    const optimizeScroll = () => {
        const scrollContainers = document.querySelectorAll('.overflow-auto, .overflow-y-auto, .scrollable');
        scrollContainers.forEach(container => {
            container.style.webkitOverflowScrolling = 'touch';
            container.style.overscrollBehavior = 'contain';
        });
    };

    // Inicializa otimizações quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            addPassiveListeners();
            setupLazyLoading();
            optimizeSwipe();
            respectMotionPreference();
            optimizeScroll();
        }, { once: true, passive: true });
    } else {
        addPassiveListeners();
        setupLazyLoading();
        optimizeSwipe();
        respectMotionPreference();
        optimizeScroll();
    }

    // Re-aplica para conteúdo dinâmico
    const observer = new MutationObserver(() => {
        setupLazyLoading();
        optimizeSwipe();
        optimizeScroll();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('✅ Mobile optimizations loaded');
})();
