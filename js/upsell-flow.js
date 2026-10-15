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

    var acceptMain = document.getElementById('accept-main');
    var declineMain = document.getElementById('decline-main');
    var acceptDownsell = document.getElementById('accept-downsell');
    var declineDownsell = document.getElementById('decline-downsell');
    var mainOffer = document.getElementById('main-offer');
    var downsellOffer = document.getElementById('downsell-offer');

    // PIX gerado direto na página (sem redirecionar pro checkout hospedado).
    // Só existe nas páginas que declaram cfg.pix e têm o painel no HTML.
    var pixPanel = document.getElementById('pix-panel');
    var pixQrImg = document.getElementById('pix-qr-img');
    var pixQrBox = document.getElementById('pix-qr-box');
    var pixCodeInput = document.getElementById('pix-code-input');
    var pixCodeRow = document.getElementById('pix-code-row');
    var pixCopyBtn = document.getElementById('pix-copy-btn');
    var pixCopiedFeedback = document.getElementById('pix-copied-feedback');
    var pixStatusText = document.getElementById('pix-status-text');
    var pixErrorText = document.getElementById('pix-error-text');
    var pixPollTimer = null;
    var pixCopiedFeedbackTimer = null;

    function trackingPayload() {
      var params = new URLSearchParams(checkoutQueryString());
      return {
        src: params.get('src') || '',
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
        utm_term: params.get('utm_term') || '',
        utm_content: params.get('utm_content') || ''
      };
    }

    function stopPixPolling() {
      if (pixPollTimer) {
        clearInterval(pixPollTimer);
        pixPollTimer = null;
      }
    }

    function pollPixStatus(hash, price, action) {
      stopPixPolling();
      pixPollTimer = setInterval(function () {
        fetch('/api/check-pix-status.php?hash=' + encodeURIComponent(hash))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            // check-pix-status.php normaliza o status do gateway pra esse enum.
            if (data && data.status === 'COMPLETED') {
              stopPixPolling();
              if (pixStatusText) pixStatusText.textContent = 'Pagamento confirmado! Redirecionando...';
              if (window.MadamesTracking) {
                window.MadamesTracking.trackCheckout('complete', 'upsell_' + cfg.step, price);
              }
              setTimeout(function () {
                window.location.href = cfg.nextUrl + checkoutQueryString();
              }, 1200);
            } else if (data && (data.status === 'FAILED' || data.status === 'REFUNDED' || data.status === 'CHARGED_BACK')) {
              stopPixPolling();
              if (pixStatusText) pixStatusText.textContent = 'Esse PIX não foi aprovado. Recarregue a página pra gerar outro.';
            }
          })
          .catch(function (err) {
            console.error('upsell-flow: erro ao consultar status do PIX', err);
          });
      }, 4000);
    }

    function startPixCheckout(chargeKey, price, action, button) {
      var fallbackUrl = action === 'accept_downsell' ? cfg.downsellCheckoutUrl : cfg.mainCheckoutUrl;
      if (!chargeKey || !pixPanel || !cfg.pix) {
        goToCheckout(fallbackUrl, price, action);
        return;
      }

      track(action, price);
      if (window.MadamesTracking) {
        window.MadamesTracking.trackPaywall('click_checkout', 'upsell_' + cfg.step, price);
        window.MadamesTracking.trackCheckout('init', 'upsell_' + cfg.step);
      }

      var originalLabel = button ? button.textContent : null;
      if (button) {
        button.textContent = 'Gerando PIX...';
        button.setAttribute('disabled', '');
      }

      fetch('/api/create-pix.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeKey: chargeKey, tracking: trackingPayload() })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.success) throw new Error('pix_creation_failed');
          if (mainOffer) mainOffer.hidden = true;
          if (downsellOffer) downsellOffer.hidden = true;
          pixPanel.hidden = false;
          if (pixQrImg) pixQrImg.src = data.qr_code;
          if (pixCodeInput) pixCodeInput.value = data.pix_code;
          if (pixStatusText) pixStatusText.textContent = 'Aguardando pagamento...';
          window.scrollTo(0, 0);
          pollPixStatus(data.hash, price, action);
        })
        .catch(function (err) {
          console.error('upsell-flow: falha ao gerar PIX, caindo pro checkout externo', err);
          if (button) {
            button.removeAttribute('disabled');
            if (originalLabel) button.textContent = originalLabel;
          }
          if (pixErrorText) {
            pixErrorText.hidden = false;
            pixErrorText.textContent = 'Não deu pra gerar o PIX agora. Redirecionando pro checkout...';
          }
          goToCheckout(fallbackUrl, price, action);
        });
    }

    function copyPixCode() {
      if (!pixCodeInput || !pixCodeInput.value) return;
      pixCodeInput.focus();
      pixCodeInput.select();
      pixCodeInput.setSelectionRange(0, 99999);
      var copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pixCodeInput.value);
          copied = true;
        }
      } catch (e) { /* segue pro fallback abaixo */ }
      if (!copied) {
        try { document.execCommand('copy'); } catch (e) { /* nada mais a fazer */ }
      }
      if (pixCopyBtn) {
        var original = pixCopyBtn.textContent;
        pixCopyBtn.textContent = 'Copiado!';
        setTimeout(function () { pixCopyBtn.textContent = original; }, 2000);
      }
      if (pixCopiedFeedback) {
        pixCopiedFeedback.hidden = false;
        clearTimeout(pixCopiedFeedbackTimer);
        pixCopiedFeedbackTimer = setTimeout(function () { pixCopiedFeedback.hidden = true; }, 2000);
      }
    }

    // Clicar em qualquer parte do QR ou do campo do código também copia, não
    // só o botão "Copiar" — facilita quem não presta atenção no botão.
    if (pixCopyBtn) pixCopyBtn.addEventListener('click', copyPixCode);
    if (pixQrBox) pixQrBox.addEventListener('click', copyPixCode);
    if (pixCodeRow) pixCodeRow.addEventListener('click', copyPixCode);

    function showDownsell(source) {
      if (!downsellOffer) return;
      if (mainOffer) mainOffer.hidden = true;
      downsellOffer.hidden = false;
      window.scrollTo(0, 0);
      track('view_downsell', cfg.downsellPrice);
      if (window.MadamesTracking) {
        window.MadamesTracking.trackPaywall('view', 'upsell_' + cfg.step + '_downsell', cfg.downsellPrice);
      }
      console.log('upsell-flow: mostrando downsell (motivo: ' + source + ')');
    }

    // Entrar direto no downsell via URL (?downsell=1) — usado como redirect de
    // abandono de checkout configurado no gateway (a pessoa foi pro checkout da
    // oferta principal, saiu sem pagar, e o gateway manda ela de volta aqui já
    // caindo direto na tela de downsell, sem ver a oferta principal de novo).
    var startsOnDownsell = downsellOffer && new URLSearchParams(window.location.search).get('downsell') === '1';

    // Tracking de visualização
    if (window.MadamesTracking) {
      window.MadamesTracking.trackPageView(cfg.pagePath);
    }
    if (startsOnDownsell) {
      showDownsell('url_param');
    } else {
      if (window.MadamesTracking) {
        window.MadamesTracking.trackPaywall('view', 'upsell_' + cfg.step, cfg.mainPrice);
      }
      track('view_main', cfg.mainPrice);
    }

    // Exit intent via botão "voltar" do navegador, em duas etapas:
    // 1ª tentativa de voltar (na oferta principal) -> mostra o downsell.
    // 2ª tentativa de voltar (já no downsell) -> manda pro próximo upsell da
    // cadeia, igual clicar em "recusar" o downsell. Só na 3ª ela sai de verdade.
    // Se a página já abriu direto no downsell (via ?downsell=1), a 1ª tentativa
    // de voltar já manda direto pro próximo upsell.
    if (downsellOffer) {
      var exitStage = startsOnDownsell ? 1 : 0;
      history.pushState({ madamesUpsellGuard: true }, '', window.location.href);
      window.addEventListener('popstate', function () {
        if (exitStage === 0) {
          exitStage = 1;
          track('exit_intent', cfg.mainPrice);
          showDownsell('back_button');
          // Empurra outro estado pra capturar a próxima tentativa de voltar também.
          history.pushState({ madamesUpsellGuard: true }, '', window.location.href);
        } else if (exitStage === 1) {
          exitStage = 2;
          track('exit_intent_downsell', cfg.downsellPrice);
          track('decline_downsell', cfg.downsellPrice);
          window.location.href = cfg.nextUrl;
        }
        // exitStage === 2: navegação pro próximo upsell já em andamento, ignora.
      });
    }

    if (acceptMain) {
      acceptMain.addEventListener('click', function (e) {
        e.preventDefault();
        var chargeKey = cfg.pix && cfg.pix.mainChargeKey;
        if (chargeKey) {
          startPixCheckout(chargeKey, cfg.mainPrice, 'accept_main', acceptMain);
        } else {
          goToCheckout(cfg.mainCheckoutUrl, cfg.mainPrice, 'accept_main');
        }
      });
    }

    if (declineMain) {
      declineMain.addEventListener('click', function (e) {
        e.preventDefault();
        track('decline_main', cfg.mainPrice);
        if (downsellOffer) {
          showDownsell('decline_button');
        } else if (cfg.nextUrl) {
          // Página sem downsell (ex: backredirect): recusar já manda pro destino final
          window.location.href = cfg.nextUrl;
        }
      });
    }

    if (acceptDownsell) {
      acceptDownsell.addEventListener('click', function (e) {
        e.preventDefault();
        var chargeKey = cfg.pix && cfg.pix.downsellChargeKey;
        if (chargeKey) {
          startPixCheckout(chargeKey, cfg.downsellPrice, 'accept_downsell', acceptDownsell);
        } else {
          goToCheckout(cfg.downsellCheckoutUrl, cfg.downsellPrice, 'accept_downsell');
        }
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
