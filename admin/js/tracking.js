/**
 * Madames Online - Funnel Tracking System
 * Captura eventos do funil e armazena para análise
 */

(function () {
  'use strict';

  // Configuração
  const STORAGE_KEY = 'madames_funnel_events';
  const SESSION_KEY = 'madames_session_id';
  const MAX_EVENTS = 10000; // Limite de eventos no localStorage

  // Gera ou recupera ID da sessão
  function getSessionId() {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  // Obtém informações do dispositivo
  function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Desconhecido';
    let os = 'Desconhecido';

    // Detecta browser
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

    // Detecta OS
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return {
      browser: browser,
      os: os,
      screen: window.innerWidth + 'x' + window.innerHeight,
      userAgent: ua.substring(0, 200)
    };
  }

  // Obtém UTMs da URL ou localStorage
  function getUtmData() {
    const params = new URLSearchParams(window.location.search);
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const utms = {};

    utmKeys.forEach(key => {
      const value = params.get(key) || localStorage.getItem(key);
      if (value) {
        utms[key] = value;
        // Salva no localStorage para persistência
        localStorage.setItem(key, value);
      }
    });

    return utms;
  }

  // Recupera eventos salvos
  function getStoredEvents() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Erro ao recuperar eventos:', e);
      return [];
    }
  }

  // Salva evento (localStorage + Firestore)
  function saveEvent(event) {
    try {
      // 1. Sempre salva no localStorage (fallback)
      let events = getStoredEvents();
      events.push(event);

      // Limita quantidade de eventos
      if (events.length > MAX_EVENTS) {
        events = events.slice(-MAX_EVENTS);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));

      // 2. Tenta salvar no Firestore se disponível
      if (window.MadamesFirestore && window.MadamesFirestore.isReady()) {
        window.MadamesFirestore.saveEvent(event).catch(function (err) {
          console.warn('Falha ao salvar no Firestore:', err);
        });
      }

      // Log para debug
      console.log('📊 Evento registrado:', event.event_type, event.page || event.cta_id);
    } catch (e) {
      console.error('Erro ao salvar evento:', e);
    }
  }

  // Salva dados do usuário para remarketing
  function saveUserData(data) {
    const sessionId = getSessionId();
    const safeData = { ...data };
    delete safeData.password;
    delete safeData.confirmPassword;

    // Salva no localStorage
    const userKey = 'madames_user_data';
    const currentData = JSON.parse(localStorage.getItem(userKey) || '{}');
    const mergedData = { ...currentData, ...safeData, session_id: sessionId };
    localStorage.setItem(userKey, JSON.stringify(mergedData));

    // Salva no Firestore se disponível
    if (window.MadamesFirestore && window.MadamesFirestore.isReady()) {
      window.MadamesFirestore.saveUser(sessionId, {
        ...safeData,
        device: getDeviceInfo(),
        utms: getUtmData()
      });
    }
  }

  // Cria evento base
  function createEvent(eventType, extraData = {}) {
    const baseEvent = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: Date.now(),
      datetime: new Date().toISOString(),
      session_id: getSessionId(),
      event_type: eventType,
      page: window.location.pathname,
      referrer: document.referrer || null,
      device: getDeviceInfo(),
      utms: getUtmData()
    };

    return { ...baseEvent, ...extraData };
  }

  // =====================
  // API PÚBLICA
  // =====================

  window.MadamesTracking = {
    // Registra visualização de página
    trackPageView: function (pageName) {
      const page = pageName || window.location.pathname;
      const event = createEvent('page_view', { page: page });
      saveEvent(event);

      // Inicia timer para tempo na página
      this._pageStartTime = Date.now();
    },

    // Registra clique em CTA
    trackCTA: function (ctaId, ctaText, destinationUrl) {
      const event = createEvent('cta_click', {
        cta_id: ctaId,
        cta_text: ctaText,
        destination_url: destinationUrl || null
      });
      saveEvent(event);
    },

    // Registra envio de formulário
    trackFormSubmit: function (formId, formData) {
      // Remove dados sensíveis antes de salvar
      const safeData = { ...formData };
      delete safeData.password;
      delete safeData.confirmPassword;

      const event = createEvent('form_submit', {
        form_id: formId,
        form_data: safeData
      });
      saveEvent(event);
    },

    // Registra interação de swipe
    trackSwipe: function (action, profileId, profileName) {
      const event = createEvent('swipe', {
        swipe_action: action, // 'like' ou 'dislike'
        profile_id: profileId,
        profile_name: profileName
      });
      saveEvent(event);
    },

    // Registra seleção de interesse
    trackInterest: function (interest, selected) {
      const event = createEvent('interest_toggle', {
        interest: interest,
        selected: selected
      });
      saveEvent(event);
    },

    // Registra upload de foto
    trackPhotoUpload: function (photoIndex) {
      const event = createEvent('photo_upload', {
        photo_index: photoIndex
      });
      saveEvent(event);
    },

    // Registra saída da página (tempo gasto)
    trackPageExit: function () {
      if (this._pageStartTime) {
        const timeSpent = Date.now() - this._pageStartTime;
        const event = createEvent('page_exit', {
          time_spent_ms: timeSpent,
          time_spent_formatted: this._formatTime(timeSpent)
        });
        saveEvent(event);
      }
    },

    // Registra chegada no chat (conversão)
    trackConversion: function (conversionType) {
      const event = createEvent('conversion', {
        conversion_type: conversionType || 'chat_reached'
      });
      saveEvent(event);
    },

    // Registra evento customizado
    trackCustom: function (eventName, data) {
      const event = createEvent(eventName, { custom_data: data });
      saveEvent(event);
    },

    // Obtém todos os eventos (para o admin)
    getAllEvents: function () {
      return getStoredEvents();
    },

    // Limpa todos os eventos (para reset)
    clearEvents: function () {
      localStorage.removeItem(STORAGE_KEY);
      console.log('📊 Eventos limpos');
    },

    // Exporta eventos como JSON
    exportEvents: function () {
      const events = getStoredEvents();
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'madames_events_' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
      URL.revokeObjectURL(url);
    },

    // Salva dados do usuário para remarketing
    saveUserData: function (data) {
      saveUserData(data);
    },

    // Atualiza etapa do funil para remarketing
    updateFunnelStage: function (stage) {
      const sessionId = getSessionId();
      if (window.MadamesFirestore && window.MadamesFirestore.isReady()) {
        window.MadamesFirestore.updateFunnelStage(sessionId, stage);
      }
    },

    // Formata tempo
    _formatTime: function (ms) {
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return minutes + 'm ' + remainingSeconds + 's';
    },

    // =====================
    // MÉTRICAS ESPECÍFICAS DO FUNIL
    // =====================

    // Registra focus em campo de formulário
    trackFieldFocus: function (fieldName) {
      const event = createEvent('field_focus', {
        field_name: fieldName
      });
      saveEvent(event);
    },

    // Registra campo preenchido
    trackFieldFilled: function (fieldName, hasValue) {
      const event = createEvent('field_filled', {
        field_name: fieldName,
        has_value: hasValue
      });
      saveEvent(event);
    },

    // Registra erro de formulário
    trackFormError: function (errorType, details) {
      const event = createEvent('form_error', {
        error_type: errorType, // 'password_mismatch', 'password_short', 'required_field', etc
        error_details: details
      });
      saveEvent(event);
    },

    // Registra tentativa de submit do formulário
    trackFormAttempt: function (formId, success, errorType) {
      const event = createEvent('form_attempt', {
        form_id: formId,
        success: success,
        error_type: errorType || null
      });
      saveEvent(event);
    },

    // Registra cadastro completo
    trackRegistrationComplete: function (step, data) {
      const safeData = { ...data };
      delete safeData.password;
      delete safeData.confirmPassword;

      const event = createEvent('registration_complete', {
        step: step,
        data: safeData
      });
      saveEvent(event);
    },

    // Registra bio preenchida
    trackBioFilled: function (charCount) {
      const event = createEvent('bio_filled', {
        char_count: charCount,
        has_content: charCount > 0
      });
      saveEvent(event);
    },

    // Registra contagem de interesses
    trackInterestsCount: function (count, interests) {
      const event = createEvent('interests_count', {
        count: count,
        interests: interests
      });
      saveEvent(event);
    },

    // Registra visualização de perfil no discover
    trackProfileView: function (profileId, profileName, profileIndex) {
      const event = createEvent('profile_view', {
        profile_id: profileId,
        profile_name: profileName,
        profile_index: profileIndex
      });
      saveEvent(event);
    },

    // Registra popup de saque
    trackWithdrawPopup: function (action, source) {
      const event = createEvent('withdraw_popup', {
        action: action, // 'open', 'close', 'submit_pix'
        source: source  // 'discover', 'chat', 'premium_chat'
      });
      saveEvent(event);
    },

    // Registra ação de inserir PIX
    trackPixKeyEntered: function (source) {
      const event = createEvent('pix_key_entered', {
        source: source
      });
      saveEvent(event);
    },

    // Registra visualização de paywall
    trackPaywall: function (action, source, price) {
      const event = createEvent('paywall', {
        action: action, // 'view', 'dismiss', 'click_checkout'
        source: source, // 'chat', 'match', 'recusa_tudo', 'premium_chat', 'gift_claim'
        price: price || 19.90
      });
      saveEvent(event);
    },

    // Registra ação de checkout
    trackCheckout: function (action, source, price) {
      const event = createEvent('checkout', {
        action: action, // 'init', 'complete', 'abandon'
        source: source,
        price: price || 19.90
      });
      saveEvent(event);
    },

    // Registra tentativa de resgatar presente
    trackGiftClaim: function (giftId, giftValue, source) {
      const event = createEvent('gift_claim', {
        gift_id: giftId,
        gift_value: giftValue,
        source: source
      });
      saveEvent(event);
    },

    // Registra mensagem no chat
    trackChatMessage: function (action, messageType, source) {
      const event = createEvent('chat_message', {
        action: action, // 'sent', 'received', 'read'
        message_type: messageType, // 'text', 'image', 'gift'
        source: source // 'chat', 'premium_chat'
      });
      saveEvent(event);
    },

    // Registra scroll de conteúdo
    trackContentScroll: function (contentType, scrollPercent) {
      const event = createEvent('content_scroll', {
        content_type: contentType,
        scroll_percent: scrollPercent
      });
      saveEvent(event);
    },

    // Registra ação no perfil premium match
    trackPremiumMatchAction: function (action, profileName) {
      const event = createEvent('premium_match_action', {
        action: action, // 'start_chat', 'next_profile', 'view_content'
        profile_name: profileName
      });
      saveEvent(event);
    }
  };

  // =====================
  // AUTO-TRACKING
  // =====================

  // Registra pageview automaticamente
  document.addEventListener('DOMContentLoaded', function () {
    window.MadamesTracking.trackPageView();
  });

  // Registra saída da página
  window.addEventListener('beforeunload', function () {
    window.MadamesTracking.trackPageExit();
  });

  // Auto-tracking de links e botões
  document.addEventListener('click', function (e) {
    // 1. CTA Tracking (data-track-cta)
    const target = e.target.closest('[data-track-cta]');
    if (target) {
      const ctaId = target.getAttribute('data-track-cta');
      const ctaText = target.textContent.trim();
      const href = target.getAttribute('href');
      window.MadamesTracking.trackCTA(ctaId, ctaText, href);
    }

    // 2. Detection of specific funnel actions by text/svg/class
    const btn = e.target.closest('button');
    if (btn) {
      const text = btn.textContent.trim().toLowerCase();
      const svg = btn.querySelector('svg');

      // Detecção de Swipe (Like/Heart)
      if (text.includes('curtir') || (svg && btn.classList.contains('bg-primary-500'))) {
        window.MadamesTracking.trackSwipe('like', 'auto', 'Profile');
      }

      // Detecção de Swipe (Dislike/X)
      if (text === 'x' || (svg && btn.querySelector('path[d*="M18 6 6 18"]'))) {
        window.MadamesTracking.trackSwipe('dislike', 'auto', 'Profile');
      }

      // Detecção de Popup de Saque (Saldo)
      if (text.includes('saldo') || text.includes('r$')) {
        window.MadamesTracking.trackWithdrawPopup('open', 'header');
      }

      // Detecção de Checkout/Paywall
      if (text.includes('liberar') || text.includes('acesso vip') || text.includes('assinar')) {
        window.MadamesTracking.trackPaywall('click_checkout', 'auto_detect');
        window.MadamesTracking.trackCheckout('init', 'auto_detect');
      }

      // Botão de Solicitar Saque dentro do Modal
      if (text.includes('solicitar saque')) {
        window.MadamesTracking.trackWithdrawPopup('submit_pix', 'modal');
      }

      // Detecção de Gift Claim (Resgatar Presente)
      if (text.includes('resgatar') || text.includes('presente')) {
        window.MadamesTracking.trackGiftClaim('auto', 50, 'chat');
      }
    }

    // 3. Fallback para botões dentro de links
    const link = e.target.closest('a');
    if (btn && link && !target) {
      const ctaText = btn.textContent.trim();
      const href = link.getAttribute('href');
      if (ctaText && href) {
        window.MadamesTracking.trackCTA('auto_' + ctaText.toLowerCase().replace(/\s+/g, '_'), ctaText, href);
      }
    }

    // 4. Detecção de cliques em botões desabilitados (pode indicar erro de validação)
    if (e.target.tagName === 'BUTTON' && e.target.disabled) {
      const text = e.target.textContent.trim().toLowerCase();
      if (text.includes('continuar') || text.includes('próximo')) {
        window.MadamesTracking.trackFormError('required_field', 'Tentativa de clique em botão desabilitado');
      }
    }
  });

  // 5. Monitor de Erros Globais (MutationObserver para Toasts/Alertas)
  const errorObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) { // Elemento
            const text = node.innerText ? node.innerText.toLowerCase() : '';
            const isError = text.includes('obrigatório') || text.includes('inválido') ||
              text.includes('curta') || text.includes('erro') ||
              text.includes('não confere');

            if (isError) {
              let errorType = 'other';
              if (text.includes('obrigatório')) errorType = 'required_field';
              if (text.includes('não confere') || text.includes('diferentes')) errorType = 'password_mismatch';
              if (text.includes('curta')) errorType = 'password_short';

              window.MadamesTracking.trackFormError(errorType, text.substring(0, 100));
            }
          }
        });
      }
    });
  });

  errorObserver.observe(document.body, { childList: true, subtree: true });

  // 6. Monitor de inputs de foto e bio (Específico para Step 2)
  document.addEventListener('change', function (e) {
    if (e.target.type === 'file') {
      const label = e.target.closest('label');
      const text = label ? label.textContent.trim().toLowerCase() : '';
      let photoIndex = 1;
      if (text.includes('2')) photoIndex = 2;
      if (text.includes('3')) photoIndex = 3;
      window.MadamesTracking.trackPhotoUpload(photoIndex);
    }
  });

  document.addEventListener('blur', function (e) {
    if (e.target.id === 'bio') {
      window.MadamesTracking.trackBioFilled(e.target.value.length);
    }
  }, true);

  // 7. Monitor de interesses
  document.addEventListener('click', function (e) {
    const interest = e.target.closest('.inline-flex.cursor-pointer');
    if (interest && interest.parentElement && interest.parentElement.classList.contains('flex-wrap')) {
      const name = interest.textContent.trim();
      const isSelected = interest.classList.contains('bg-primary-500');
      window.MadamesTracking.trackInterest(name, !isSelected); // ! porque o clique vai alternar
    }
  });

  // 8. Melhoria na detecção de fonte do Popup de Saque
  const originalTrackWithdrawPopup = window.MadamesTracking.trackWithdrawPopup;
  window.MadamesTracking.trackWithdrawPopup = function (action, source) {
    let detectedSource = source;
    if (source === 'header' || !source) {
      if (window.location.pathname.includes('/chat')) detectedSource = 'chat';
      else if (window.location.pathname.includes('/discover')) detectedSource = 'discover';
    }
    originalTrackWithdrawPopup.call(this, action, detectedSource);
  };

  console.log('📊 Madames Tracking inicializado');
})();
