/**
 * Madames Online - Motor genérico de página de upsell/downsell
 *
 * Cada página de upsell declara um `window.UPSELL_CONFIG` antes de carregar
 * este script, com o formato:
 *
 *   window.UPSELL_CONFIG = {
 *     step: 'vitalicio',                 // id usado no tracking (admin)
 *     pagePath: '/vitalicio/',
 *     mainPrice: 14.70,
 *     downsellPrice: 7.35,
 *     mainCheckoutUrl: '#CHECKOUT-...',   // link real do gateway (trocar depois)
 *     downsellCheckoutUrl: '#CHECKOUT-...',
 *     nextUrl: '/upsell-saque/'           // pra onde vai se recusar tudo
 *   };
 *
 * HTML esperado na página:
 *   - #main-offer      : bloco da oferta principal
 *   - #downsell-offer  : bloco do downsell (começa escondido, com [hidden])
 *   - #accept-main     : botão "aceitar" da oferta principal
 *   - #decline-main    : link/botão "recusar" da oferta principal
 *   - #accept-downsell : botão "aceitar" do downsell
 *   - #decline-downsell: link/botão "recusar" do downsell
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var cfg = window.UPSELL_CONFIG;
    if (!cfg) {
      console.error('upsell-flow.js: window.UPSELL_CONFIG não foi definido nessa página.');
      return;
    }

    function track(action, price) {
      if (window.MadamesTracking && window.MadamesTracking.trackUpsellStep) {
        window.MadamesTracking.trackUpsellStep(cfg.step, action, price);
      }
    }

    function checkoutQueryString() {
      return (window.MadamesTracking && window.MadamesTracking.getCheckoutQueryString)
        ? window.MadamesTracking.getCheckoutQueryString()
        : window.location.search;
    }

    function goToCheckout(url, price, action) {
      if (!url || url.indexOf('PENDENTE') !== -1) {
        alert('Checkout ainda não configurado pra essa oferta — avise o desenvolvedor pra colocar o link real.');
        return;
      }
      track(action, price);
      if (window.MadamesTracking) {
        window.MadamesTracking.trackPaywall('click_checkout', 'upsell_' + cfg.step, price);
        window.MadamesTracking.trackCheckout('init', 'upsell_' + cfg.step);
      }
      window.location.href = url + checkoutQueryString();
    }

    // Tracking de visualização da oferta principal
    if (window.MadamesTracking) {
      window.MadamesTracking.trackPageView(cfg.pagePath);
      window.MadamesTracking.trackPaywall('view', 'upsell_' + cfg.step, cfg.mainPrice);
    }
    track('view_main', cfg.mainPrice);

    var acceptMain = document.getElementById('accept-main');
    var declineMain = document.getElementById('decline-main');
    var acceptDownsell = document.getElementById('accept-downsell');
    var declineDownsell = document.getElementById('decline-downsell');
    var mainOffer = document.getElementById('main-offer');
    var downsellOffer = document.getElementById('downsell-offer');

    if (acceptMain) {
      acceptMain.addEventListener('click', function (e) {
        e.preventDefault();
        goToCheckout(cfg.mainCheckoutUrl, cfg.mainPrice, 'accept_main');
      });
    }

    if (declineMain) {
      declineMain.addEventListener('click', function (e) {
        e.preventDefault();
        track('decline_main', cfg.mainPrice);
        if (downsellOffer) {
          if (mainOffer) mainOffer.hidden = true;
          downsellOffer.hidden = false;
          window.scrollTo(0, 0);
          track('view_downsell', cfg.downsellPrice);
          if (window.MadamesTracking) {
            window.MadamesTracking.trackPaywall('view', 'upsell_' + cfg.step + '_downsell', cfg.downsellPrice);
          }
        } else if (cfg.nextUrl) {
          // Página sem downsell (ex: backredirect): recusar já manda pro destino final
          window.location.href = cfg.nextUrl;
        }
      });
    }

    if (acceptDownsell) {
      acceptDownsell.addEventListener('click', function (e) {
        e.preventDefault();
        goToCheckout(cfg.downsellCheckoutUrl, cfg.downsellPrice, 'accept_downsell');
      });
    }

    if (declineDownsell) {
      declineDownsell.addEventListener('click', function (e) {
        e.preventDefault();
        track('decline_downsell', cfg.downsellPrice);
        window.location.href = cfg.nextUrl;
      });
    }
  });
})();
