/**
 * Madames Online - Admin Dashboard Logic
 * Processa eventos e renderiza métricas
 */

(function () {
    'use strict';

    // Configuração das etapas do funil (frontend principal)
    const FUNNEL_STEPS = [
        { path: '/app/', name: 'Landing Page', shortName: '/app' },
        { path: '/register/step1/', name: 'Cadastro - Dados', shortName: '/register/step1' },
        { path: '/register/step2/', name: 'Cadastro - Perfil', shortName: '/register/step2' },
        { path: '/welcome/', name: 'Onboarding', shortName: '/welcome' },
        { path: '/discover/', name: 'Descoberta', shortName: '/discover' },
        { path: '/chat/', name: 'Chat', shortName: '/chat' }
    ];

    // Cores para os gráficos
    const COLORS = {
        primary: '#ec4899',
        success: '#22c55e',
        warning: '#eab308',
        danger: '#ef4444',
        blue: '#3b82f6',
        purple: '#a855f7',
        teal: '#14b8a6',
        orange: '#f97316',
        utmColors: ['#ec4899', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6']
    };

    // =====================
    // Utilidades
    // =====================

    function getStoredEvents() {
        try {
            const data = localStorage.getItem('madames_funnel_events');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Erro ao carregar eventos:', e);
            return [];
        }
    }

    // Fuso de Brasília é sempre UTC-3 (sem horário de verão desde 2019).
    // "Hoje"/"ontem" precisam ser dia-calendário nesse fuso, não "últimas 24h" —
    // senão o número não bate com o que a Utmify (ou qualquer painel de ads) mostra.
    const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

    function startOfBRTDay(ms) {
        const shifted = new Date(ms - BRT_OFFSET_MS);
        const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate();
        return Date.UTC(y, m, d) + BRT_OFFSET_MS;
    }

    // Retorna {startMs, endMs} (endMs exclusivo) para o período escolhido.
    // customStart/customEnd são strings "YYYY-MM-DD" (inputs type=date), usadas só quando period === 'custom'.
    function getPeriodBoundaries(period, customStart, customEnd) {
        const now = Date.now();
        const todayStart = startOfBRTDay(now);
        const DAY = 24 * 60 * 60 * 1000;

        switch (period) {
            case 'today':
                return { startMs: todayStart, endMs: now };
            case 'yesterday':
                return { startMs: todayStart - DAY, endMs: todayStart };
            case '7days':
                return { startMs: todayStart - 6 * DAY, endMs: now };
            case '30days':
                return { startMs: todayStart - 29 * DAY, endMs: now };
            case 'custom':
                if (customStart) {
                    const [sy, sm, sd] = customStart.split('-').map(Number);
                    const startMs = Date.UTC(sy, sm - 1, sd) + BRT_OFFSET_MS;
                    let endMs = now;
                    if (customEnd) {
                        const [ey, em, ed] = customEnd.split('-').map(Number);
                        endMs = Date.UTC(ey, em - 1, ed) + BRT_OFFSET_MS + DAY; // inclui o dia final inteiro
                    }
                    return { startMs, endMs };
                }
                return { startMs: 0, endMs: now };
            default: // 'all'
                return { startMs: 0, endMs: now };
        }
    }

    function filterEventsByPeriod(events, period, customStart, customEnd) {
        const { startMs, endMs } = getPeriodBoundaries(period, customStart, customEnd);
        return events.filter(e => e.timestamp >= startMs && e.timestamp <= endMs);
    }

    // Mesma lógica de boundaries, mas pra dados cujo timestamp vem como string ISO
    // (gateway_created_at das transações/abandonos, que não usam Date.now()).
    function filterByPeriodISO(items, dateField, period, customStart, customEnd) {
        const { startMs, endMs } = getPeriodBoundaries(period, customStart, customEnd);
        if (period === 'all') return items;
        return items.filter(item => {
            const raw = item[dateField];
            if (!raw) return false;
            const ms = new Date(raw).getTime();
            return ms >= startMs && ms <= endMs;
        });
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return seconds + 's';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes < 60) return minutes + 'm ' + remainingSeconds + 's';
        const hours = Math.floor(minutes / 60);
        return hours + 'h ' + (minutes % 60) + 'm';
    }

    function formatDateTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function normalizePath(path) {
        // Normaliza para comparação (remove query params e hash)
        if (!path) return '/';
        path = path.split('?')[0].split('#')[0].toLowerCase();
        if (!path.endsWith('/')) path += '/';
        return path;
    }

    // =====================
    // Cálculo de Métricas
    // =====================

    function calculateMetrics(events) {
        const metrics = {
            totalVisitors: 0,
            uniqueSessions: new Set(),
            funnelSteps: {},
            ctaClicks: {},
            utmSources: {}, // Agora armazena Set de sessions por source
            devices: { browsers: {}, os: {} }, // Agora armazena Set de sessions
            conversions: 0,
            avgTimeByPage: {},
            recentEvents: []
        };

        // Inicializa steps do funil
        FUNNEL_STEPS.forEach(step => {
            metrics.funnelSteps[step.path] = {
                visitors: new Set(),
                pageviews: 0,
                name: step.name,
                shortName: step.shortName
            };
        });

        // Rastreia sessões para UTM e Device (para contar unique visitors)
        const sessionUtms = new Map(); // session_id -> utm_source
        const sessionDevices = new Map(); // session_id -> {browser, os}

        // Processa eventos
        events.forEach(event => {
            // Sessões únicas: só conta quem teve pelo menos um page_view — mesma
            // definição de "visitante" usada no funil e em Campanhas/Criativos.
            // Antes contava qualquer sessão com QUALQUER evento (até um clique
            // isolado), o que fazia esse número não bater com o resto do painel.
            if (event.session_id && event.event_type === 'page_view') {
                metrics.uniqueSessions.add(event.session_id);
            }

            // Page views
            if (event.event_type === 'page_view') {
                metrics.totalVisitors++;

                const normalizedPage = normalizePath(event.page);

                // Mapeia para o step correto do funil
                FUNNEL_STEPS.forEach(step => {
                    if (normalizedPage.includes(step.path.toLowerCase()) ||
                        normalizedPage === step.path.toLowerCase()) {
                        metrics.funnelSteps[step.path].pageviews++;
                        if (event.session_id) {
                            metrics.funnelSteps[step.path].visitors.add(event.session_id);
                        }
                    }
                });
            }

            // CTA clicks
            if (event.event_type === 'cta_click') {
                const ctaName = event.cta_text || event.cta_id || 'desconhecido';
                metrics.ctaClicks[ctaName] = (metrics.ctaClicks[ctaName] || 0) + 1;
            }

            // UTM sources - rastreia por sessão
            if (event.session_id && event.utms && event.utms.utm_source) {
                const source = event.utms.utm_source;
                sessionUtms.set(event.session_id, source);
            }

            // Rastreia sessões sem UTM (tráfego direto/orgânico)
            if (event.session_id && event.event_type === 'page_view') {
                if (!sessionUtms.has(event.session_id) &&
                    (!event.utms || !event.utms.utm_source)) {
                    sessionUtms.set(event.session_id, 'Direto/Orgânico');
                }
            }

            // Devices - rastreia por sessão
            if (event.session_id && event.device) {
                if (!sessionDevices.has(event.session_id)) {
                    sessionDevices.set(event.session_id, {
                        browser: event.device.browser || 'Desconhecido',
                        os: event.device.os || 'Desconhecido'
                    });
                }
            }

            // Conversões
            if (event.event_type === 'conversion') {
                metrics.conversions++;
            }

            // Tempo na página
            if (event.event_type === 'page_exit' && event.time_spent_ms) {
                const page = normalizePath(event.page);
                if (!metrics.avgTimeByPage[page]) {
                    metrics.avgTimeByPage[page] = { total: 0, count: 0 };
                }
                // Cap de 10 minutos (600.000ms) para evitar distorção por abas esquecidas
                const timeSpent = Math.min(event.time_spent_ms, 600000);
                metrics.avgTimeByPage[page].total += timeSpent;
                metrics.avgTimeByPage[page].count++;
            }
        });

        // Calcula médias de tempo
        Object.keys(metrics.avgTimeByPage).forEach(page => {
            const data = metrics.avgTimeByPage[page];
            metrics.avgTimeByPage[page].avg = data.count > 0 ? data.total / data.count : 0;
        });

        // Converte sessionUtms e sessionDevices para contagens únicas
        sessionUtms.forEach((source, sessionId) => {
            if (!metrics.utmSources[source]) {
                metrics.utmSources[source] = new Set();
            }
            metrics.utmSources[source].add(sessionId);
        });

        sessionDevices.forEach((device, sessionId) => {
            if (!metrics.devices.browsers[device.browser]) {
                metrics.devices.browsers[device.browser] = new Set();
            }
            metrics.devices.browsers[device.browser].add(sessionId);

            if (!metrics.devices.os[device.os]) {
                metrics.devices.os[device.os] = new Set();
            }
            metrics.devices.os[device.os].add(sessionId);
        });

        // Validação: alerta se pageviews sem session_id
        Object.keys(metrics.funnelSteps).forEach(path => {
            const step = metrics.funnelSteps[path];
            if (step.pageviews > 0 && step.visitors.size === 0) {
                console.warn(`⚠️ ATENÇÃO: ${path} tem ${step.pageviews} pageviews mas 0 sessões únicas. Eventos sem session_id!`);
            }
        });

        // Eventos recentes (últimos 50)
        metrics.recentEvents = events.slice(-50).reverse();

        return metrics;
    }

    // =====================
    // Cálculo de Gargalo e Métricas Avançadas
    // =====================

    function calculateBottleneckAndAdvanced(events, metrics) {
        const result = {
            // Detecção de Gargalo Principal
            bottleneck: {
                step: null,
                stepName: null,
                dropRate: 0,
                previousStep: null,
                previousVisitors: 0,
                currentVisitors: 0,
                lostUsers: 0,
                severity: 'low' // 'low', 'medium', 'high', 'critical'
            },
            // Bounce Rate por página
            bounceRates: {},
            // Taxa de retorno (visitantes que voltam)
            returnVisitors: {
                total: 0,
                percentage: 0
            },
            // Horários de pico
            peakHours: {},
            // Dias da semana
            peakDays: {},
            // Tempo até conversão
            timeToConversion: {
                avg: 0,
                min: 0,
                max: 0
            },
            // Dispositivo vs Conversão
            deviceConversion: {
                mobile: { visitors: 0, conversions: 0, rate: 0 },
                desktop: { visitors: 0, conversions: 0, rate: 0 }
            },
            // Form abandonment
            formAbandonment: {
                step1: { started: 0, completed: 0, rate: 0 },
                step2: { started: 0, completed: 0, rate: 0 }
            },
            // Todas as quedas do funil ordenadas
            allDropOffs: []
        };

        // Calcula drop-off para cada etapa
        let previousVisitors = null;
        let previousStepName = null;

        FUNNEL_STEPS.forEach((step, index) => {
            const stepData = metrics.funnelSteps[step.path];
            const visitors = stepData.visitors.size; // Sempre usa sessões únicas

            if (previousVisitors !== null && previousVisitors > 0) {
                const dropRate = ((previousVisitors - visitors) / previousVisitors) * 100;
                const lostUsers = previousVisitors - visitors;

                result.allDropOffs.push({
                    index: index,
                    step: step.path,
                    stepName: step.name,
                    previousStep: previousStepName,
                    dropRate: dropRate,
                    lostUsers: lostUsers,
                    previousVisitors: previousVisitors,
                    currentVisitors: visitors
                });

                // Identifica o maior gargalo
                if (dropRate > result.bottleneck.dropRate && visitors > 0) {
                    result.bottleneck = {
                        step: step.path,
                        stepName: step.name,
                        dropRate: Math.round(dropRate),
                        previousStep: previousStepName,
                        previousVisitors: previousVisitors,
                        currentVisitors: visitors,
                        lostUsers: lostUsers,
                        severity: dropRate > 70 ? 'critical' :
                            dropRate > 50 ? 'high' :
                                dropRate > 30 ? 'medium' : 'low'
                    };
                }
            }

            previousVisitors = visitors;
            previousStepName = step.name;
        });

        // Ordena drop-offs por taxa (pior primeiro)
        result.allDropOffs.sort((a, b) => b.dropRate - a.dropRate);

        // Calcula bounce rate (visitou só 1 página)
        const sessionPages = {};
        events.forEach(event => {
            if (event.event_type === 'page_view' && event.session_id) {
                if (!sessionPages[event.session_id]) {
                    sessionPages[event.session_id] = new Set();
                }
                sessionPages[event.session_id].add(event.page);
            }
        });

        // Bounce = sessões com só 1 página
        let bounceSessions = 0;
        const totalSessions = Object.keys(sessionPages).length;
        Object.values(sessionPages).forEach(pages => {
            if (pages.size === 1) bounceSessions++;
        });
        result.bounceRates.overall = totalSessions > 0
            ? Math.round((bounceSessions / totalSessions) * 100)
            : 0;

        // Horários de pico (0-23h)
        events.forEach(event => {
            if (event.timestamp) {
                const hour = new Date(event.timestamp).getHours();
                result.peakHours[hour] = (result.peakHours[hour] || 0) + 1;

                const day = new Date(event.timestamp).getDay(); // 0=Sun, 6=Sat
                const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                result.peakDays[dayNames[day]] = (result.peakDays[dayNames[day]] || 0) + 1;
            }
        });

        // Dispositivo vs Conversão
        const sessionsWithDevice = {};
        const conversions = new Set();

        events.forEach(event => {
            if (event.session_id && event.device) {
                const isMobile = event.device.os === 'Android' || event.device.os === 'iOS';
                sessionsWithDevice[event.session_id] = isMobile ? 'mobile' : 'desktop';
            }
            if (event.event_type === 'conversion') {
                conversions.add(event.session_id);
            }
        });

        Object.entries(sessionsWithDevice).forEach(([sessionId, device]) => {
            result.deviceConversion[device].visitors++;
            if (conversions.has(sessionId)) {
                result.deviceConversion[device].conversions++;
            }
        });

        result.deviceConversion.mobile.rate = result.deviceConversion.mobile.visitors > 0
            ? Math.round((result.deviceConversion.mobile.conversions / result.deviceConversion.mobile.visitors) * 100)
            : 0;
        result.deviceConversion.desktop.rate = result.deviceConversion.desktop.visitors > 0
            ? Math.round((result.deviceConversion.desktop.conversions / result.deviceConversion.desktop.visitors) * 100)
            : 0;

        // Form abandonment
        const step1PageViews = new Set();
        const step2PageViews = new Set();
        const step1Completes = new Set();
        const step2Completes = new Set();

        events.forEach(event => {
            if (event.event_type === 'page_view') {
                if (event.page && event.page.includes('/register/step1')) {
                    step1PageViews.add(event.session_id);
                }
                if (event.page && event.page.includes('/register/step2')) {
                    step2PageViews.add(event.session_id);
                    step1Completes.add(event.session_id); // Chegou no step2 = completou step1
                }
                if (event.page && event.page.includes('/welcome')) {
                    step2Completes.add(event.session_id); // Chegou no welcome = completou step2
                }
            }
        });

        result.formAbandonment.step1.started = step1PageViews.size;
        result.formAbandonment.step1.completed = step1Completes.size;
        result.formAbandonment.step1.rate = step1PageViews.size > 0
            ? Math.round(((step1PageViews.size - step1Completes.size) / step1PageViews.size) * 100)
            : 0;

        result.formAbandonment.step2.started = step2PageViews.size;
        result.formAbandonment.step2.completed = step2Completes.size;
        result.formAbandonment.step2.rate = step2PageViews.size > 0
            ? Math.round(((step2PageViews.size - step2Completes.size) / step2PageViews.size) * 100)
            : 0;

        return result;
    }

    // =====================
    // Cálculo de Métricas Específicas
    // =====================

    function calculateSpecificMetrics(events) {
        const specific = {
            // Métricas de Cadastro
            registration: {
                fieldFocus: {},
                fieldFilled: {},
                formErrors: { password_mismatch: 0, password_short: 0, required_field: 0, other: 0 },
                formAttempts: { success: 0, failed: 0 },
                step1Complete: 0,
                step2Complete: 0,
                photos: { photo_1: 0, photo_2: 0, photo_3: 0 },
                bioFilled: 0,
                interestsTotal: 0,
                interestsAvg: 0,
                interestsList: {}
            },
            // Métricas de Swipe
            swipes: {
                likes: 0,
                dislikes: 0,
                ratio: 0,
                profilesViewed: 0
            },
            // Popup de Saque
            withdraw: {
                opened: 0,
                bySource: { discover: 0, chat: 0, premium_chat: 0 },
                pixEntered: 0
            },
            // Paywall
            paywall: {
                views: 0,
                bySource: { chat: 0, match: 0, recusa_tudo: 0, premium_chat: 0, gift_claim: 0 },
                clickedCheckout: 0
            },
            // Checkout
            checkout: {
                initiated: 0,
                completed: 0,
                abandoned: 0,
                conversionRate: 0,
                totalRevenue: 0
            },
            // Chat
            chat: {
                messagesSent: 0,
                messagesRead: 0,
                giftClaimAttempts: 0
            },
            // Premium Match
            premiumMatch: {
                startChat: 0,
                nextProfile: 0,
                viewContent: 0
            }
        };

        events.forEach(event => {
            switch (event.event_type) {
                case 'field_focus':
                    if (event.field_name) {
                        specific.registration.fieldFocus[event.field_name] =
                            (specific.registration.fieldFocus[event.field_name] || 0) + 1;
                    }
                    break;

                case 'field_filled':
                    if (event.field_name && event.has_value) {
                        specific.registration.fieldFilled[event.field_name] =
                            (specific.registration.fieldFilled[event.field_name] || 0) + 1;
                    }
                    break;

                case 'form_error':
                    const errorType = event.error_type || 'other';
                    if (specific.registration.formErrors[errorType] !== undefined) {
                        specific.registration.formErrors[errorType]++;
                    } else {
                        specific.registration.formErrors.other++;
                    }
                    break;

                case 'form_attempt':
                    if (event.success) {
                        specific.registration.formAttempts.success++;
                    } else {
                        specific.registration.formAttempts.failed++;
                    }
                    break;

                case 'registration_complete':
                    if (event.step === 'step1') specific.registration.step1Complete++;
                    if (event.step === 'step2') specific.registration.step2Complete++;
                    break;

                case 'photo_upload':
                    const photoKey = 'photo_' + (event.photo_index || 1);
                    if (specific.registration.photos[photoKey] !== undefined) {
                        specific.registration.photos[photoKey]++;
                    }
                    break;

                case 'bio_filled':
                    if (event.has_content) specific.registration.bioFilled++;
                    break;

                case 'interests_count':
                    specific.registration.interestsTotal += event.count || 0;
                    if (event.interests) {
                        event.interests.forEach(interest => {
                            specific.registration.interestsList[interest] =
                                (specific.registration.interestsList[interest] || 0) + 1;
                        });
                    }
                    break;

                case 'interest_toggle':
                    if (event.selected && event.interest) {
                        specific.registration.interestsList[event.interest] =
                            (specific.registration.interestsList[event.interest] || 0) + 1;
                    }
                    break;

                case 'swipe':
                    if (event.swipe_action === 'like') specific.swipes.likes++;
                    if (event.swipe_action === 'dislike') specific.swipes.dislikes++;
                    break;

                case 'profile_view':
                    specific.swipes.profilesViewed++;
                    break;

                case 'withdraw_popup':
                    if (event.action === 'open') {
                        specific.withdraw.opened++;
                        const source = event.source || 'discover';
                        if (specific.withdraw.bySource[source] !== undefined) {
                            specific.withdraw.bySource[source]++;
                        }
                    }
                    break;

                case 'pix_key_entered':
                    specific.withdraw.pixEntered++;
                    break;

                case 'paywall':
                    const pwSource = event.source || 'unknown';
                    if (event.action === 'view') {
                        specific.paywall.views++;
                        // Track por source detalhado
                        if (!specific.paywall.bySource[pwSource]) {
                            specific.paywall.bySource[pwSource] = { views: 0, clicks: 0, conversions: 0, revenue: 0 };
                        }
                        specific.paywall.bySource[pwSource].views++;
                    }
                    if (event.action === 'click_checkout') {
                        specific.paywall.clickedCheckout++;
                        if (specific.paywall.bySource[pwSource]) {
                            specific.paywall.bySource[pwSource].clicks++;
                        }
                    }
                    break;

                case 'checkout':
                    if (event.action === 'init' || event.action === 'initiate') {
                        specific.checkout.initiated++;
                    }
                    if (event.action === 'complete') {
                        specific.checkout.completed++;
                        const revenue = event.price || 27.00;
                        specific.checkout.totalRevenue += revenue;

                        // 🎯 Associa conversão ao source do paywall
                        const checkoutSource = event.source || 'direct';
                        if (!specific.paywall.bySource[checkoutSource]) {
                            specific.paywall.bySource[checkoutSource] = { views: 0, clicks: 0, conversions: 0, revenue: 0 };
                        }
                        specific.paywall.bySource[checkoutSource].conversions++;
                        specific.paywall.bySource[checkoutSource].revenue += revenue;
                    }
                    if (event.action === 'abandon') {
                        specific.checkout.abandoned++;
                    }
                    break;
                case 'chat_message':
                    if (event.action === 'sent') specific.chat.messagesSent++;
                    if (event.action === 'read') specific.chat.messagesRead++;
                    break;

                case 'gift_claim':
                    specific.chat.giftClaimAttempts++;
                    break;

                case 'premium_match_action':
                    if (event.action === 'start_chat') specific.premiumMatch.startChat++;
                    if (event.action === 'next_profile') specific.premiumMatch.nextProfile++;
                    if (event.action === 'view_content') specific.premiumMatch.viewContent++;
                    break;
            }
        });

        // Calcula ratios e percentuais
        const totalSwipes = specific.swipes.likes + specific.swipes.dislikes;
        specific.swipes.ratio = totalSwipes > 0
            ? (specific.swipes.likes / specific.swipes.dislikes).toFixed(1)
            : 0;

        specific.checkout.conversionRate = specific.checkout.initiated > 0
            ? ((specific.checkout.completed / specific.checkout.initiated) * 100).toFixed(1)
            : 0;

        // Calcula média de interesses
        const interestEvents = events.filter(e => e.event_type === 'interests_count');
        specific.registration.interestsAvg = interestEvents.length > 0
            ? (specific.registration.interestsTotal / interestEvents.length).toFixed(1)
            : 0;

        return specific;
    }

    // =====================
    // Saldo fictício dos leads (curtidas + presentes) nos momentos-chave do
    // funil, pra saber se as taxas de saque/IOF fazem sentido perto do que a
    // pessoa realmente acumulou. Vem do campo user_balance, presente em todo
    // evento de paywall/checkout/upsell_step desde que essa captura foi ligada.
    // =====================

    function calculateBalanceStats(events) {
        function avg(list) {
            if (list.length === 0) return null;
            return list.reduce((sum, v) => sum + v, 0) / list.length;
        }

        const paywallBalances = events
            .filter(e => e.event_type === 'paywall' && e.action === 'view' && typeof e.user_balance === 'number')
            .map(e => e.user_balance);

        const upsellFirstViewByStep = {};
        events
            .filter(e => e.event_type === 'upsell_step' && e.action === 'view_main' && typeof e.user_balance === 'number')
            .forEach(e => {
                if (!upsellFirstViewByStep[e.step]) upsellFirstViewByStep[e.step] = [];
                upsellFirstViewByStep[e.step].push(e.user_balance);
            });

        const upsellAll = Object.values(upsellFirstViewByStep).flat();

        return {
            paywallAvg: avg(paywallBalances),
            paywallCount: paywallBalances.length,
            upsellAvg: avg(upsellAll),
            upsellCount: upsellAll.length,
            byStep: Object.keys(upsellFirstViewByStep).map(step => ({
                step: step,
                avg: avg(upsellFirstViewByStep[step]),
                count: upsellFirstViewByStep[step].length
            }))
        };
    }

    function renderBalanceStats(stats) {
        const container = document.getElementById('balance-stats');
        if (!container) return;

        const fmt = v => v === null ? 'Sem dados ainda' : 'R$ ' + v.toFixed(2).replace('.', ',');

        const byStepHtml = stats.byStep.length > 0
            ? stats.byStep.map(s => `<li><strong>${s.step}</strong>: ${fmt(s.avg)} (${formatNumber(s.count)} pessoas)</li>`).join('')
            : '<li>Sem dados ainda</li>';

        container.innerHTML = `
            <div class="balance-stats-grid">
                <div class="balance-stat">
                    <span class="balance-stat-value">${fmt(stats.paywallAvg)}</span>
                    <span class="balance-stat-label">Saldo médio ao ver o paywall (${formatNumber(stats.paywallCount)} pessoas)</span>
                </div>
                <div class="balance-stat">
                    <span class="balance-stat-value">${fmt(stats.upsellAvg)}</span>
                    <span class="balance-stat-label">Saldo médio ao entrar em qualquer upsell (${formatNumber(stats.upsellCount)} pessoas)</span>
                </div>
            </div>
            <ul class="balance-stats-bystep">${byStepHtml}</ul>
            <p class="campaign-table-note">Esse dado só existe a partir de quando essa captura foi ligada. Períodos anteriores aparecem sem dados. Serve pra calibrar se as taxas de saque/IOF fazem sentido perto do saldo real que os leads acumulam antes de chegar aqui.</p>
        `;
    }

    // =====================
    // Funil de Upsells (vitalício, taxa de saque, IOF, manutenção...)
    // =====================

    const UPSELL_STEPS = [
        { key: 'backredirect', name: 'Backredirect (recuperação)', mainPrice: 14.90 },
        { key: 'backredirect2', name: 'Backredirect 2 (última chance)', mainPrice: 9.90 },
        { key: 'vitalicio', name: 'Vitalício', mainPrice: 14.70, downsellPrice: 7.35 },
        { key: 'saque', name: 'Taxa de Saque', mainPrice: 19.90, downsellPrice: 9.95 },
        { key: 'iof', name: 'Taxa de IOF', mainPrice: 22.37, downsellPrice: 11.19 },
        { key: 'selo', name: 'Selo de Destaque', mainPrice: 24.90, downsellPrice: 12.45 }
    ];

    // Mapa preço (em reais, com 2 casas) -> etapa/nível, usado pra cruzar transações
    // pagas de verdade (gravadas pelo webhook) com o degrau do funil de upsell.
    // Funciona porque cada oferta/downsell tem um preço único no funil hoje;
    // se dois degraus passarem a ter o mesmo preço, esse cruzamento precisa mudar.
    const PRICE_TO_UPSELL_STEP = {};
    UPSELL_STEPS.forEach(s => {
        PRICE_TO_UPSELL_STEP[s.mainPrice.toFixed(2)] = { key: s.key, tier: 'main' };
        if (s.downsellPrice) {
            PRICE_TO_UPSELL_STEP[s.downsellPrice.toFixed(2)] = { key: s.key, tier: 'downsell' };
        }
    });

    function calculateUpsellFunnel(events, transactionsInPeriod) {
        const byStep = {};
        UPSELL_STEPS.forEach(s => {
            byStep[s.key] = {
                name: s.name,
                views: new Set(),
                acceptMain: 0,
                declineMain: 0,
                viewDownsell: 0,
                acceptDownsell: 0,
                declineDownsell: 0,
                revenue: 0,
                confirmedMain: 0,
                confirmedDownsell: 0,
                confirmedRevenue: 0
            };
        });

        events.forEach(event => {
            if (event.event_type !== 'upsell_step') return;
            const bucket = byStep[event.step];
            if (!bucket) return;

            switch (event.action) {
                case 'view_main':
                    if (event.session_id) bucket.views.add(event.session_id);
                    break;
                case 'accept_main':
                    bucket.acceptMain++;
                    bucket.revenue += event.price || 0;
                    break;
                case 'decline_main':
                    bucket.declineMain++;
                    break;
                case 'view_downsell':
                    bucket.viewDownsell++;
                    break;
                case 'accept_downsell':
                    bucket.acceptDownsell++;
                    bucket.revenue += event.price || 0;
                    break;
                case 'decline_downsell':
                    bucket.declineDownsell++;
                    break;
            }
        });

        // Cruza com transações realmente pagas (webhook do gateway) pelo valor cobrado
        (transactionsInPeriod || []).forEach(tx => {
            if (tx.gateway_status !== 'paid') return;
            const amountReais = ((tx.amount || 0) / 100).toFixed(2);
            const match = PRICE_TO_UPSELL_STEP[amountReais];
            if (!match) return;
            const bucket = byStep[match.key];
            if (!bucket) return;
            if (match.tier === 'main') bucket.confirmedMain++;
            else bucket.confirmedDownsell++;
            bucket.confirmedRevenue += parseFloat(amountReais);
        });

        return UPSELL_STEPS.map(s => {
            const b = byStep[s.key];
            const views = b.views.size;
            const totalAccepted = b.acceptMain + b.acceptDownsell;
            const totalConfirmed = b.confirmedMain + b.confirmedDownsell;
            return {
                key: s.key,
                name: b.name,
                views: views,
                acceptMain: b.acceptMain,
                declineMain: b.declineMain,
                viewDownsell: b.viewDownsell,
                acceptDownsell: b.acceptDownsell,
                declineDownsell: b.declineDownsell,
                totalAccepted: totalAccepted,
                conversionRate: views > 0 ? (totalAccepted / views) * 100 : 0,
                revenue: b.revenue,
                totalConfirmed: totalConfirmed,
                confirmedRevenue: b.confirmedRevenue
            };
        });
    }

    // =====================
    // Análise por Campanha / Criativo
    // =====================

    // Convenção de UTM usada nas campanhas atuais (padrão Meta Ads):
    //   utm_source   = plataforma (ex: "FB")
    //   utm_campaign = "Nome da campanha|id"
    //   utm_medium   = "Nome do conjunto de anúncios (adset)|id"
    //   utm_content  = "Nome do anúncio/criativo|id"
    //   utm_term     = posicionamento (ex: "Facebook_Mobile_Reels")
    // Algumas UTMs chegam mal decodificadas: "+" literal no lugar de espaço (o
    // link do anúncio foi montado com %2B, que decodifica pra "+" de verdade, não
    // espaço), ou até com sequência %XX sobrando (ex.: "an%C3%BAncio" em vez de
    // "anúncio", encoding aplicado 2x). Sem normalizar isso, a mesma campanha
    // aparece duplicada/fragmentada na tabela com grafias diferentes.
    function normalizeUtmValue(value) {
        if (!value) return value;
        let v = value;
        try { v = decodeURIComponent(v); } catch (e) { /* não decodável, usa como está */ }
        return v.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function utmGroupKey(utms) {
        if (!utms || !utms.utm_source) return 'direct';
        return [
            normalizeUtmValue(utms.utm_source),
            normalizeUtmValue(utms.utm_campaign) || '',
            normalizeUtmValue(utms.utm_content) || ''
        ].join('||');
    }

    function stripId(value) {
        if (!value) return null;
        return normalizeUtmValue(value.split('|')[0]);
    }

    function calculateCampaignBreakdown(events, transactionsInPeriod, allUsers) {
        // Mapa de e-mail -> utms, para atribuir vendas que não têm UTM na própria
        // transação (hoje o gateway externo não devolve UTM nenhuma pra nós —
        // então cruzamos pelo e-mail com o lead que se cadastrou no /register/step1).
        const emailToUtms = {};
        (allUsers || []).forEach(u => {
            if (u.email && u.utms && u.utms.utm_source) {
                emailToUtms[u.email.toLowerCase().trim()] = u.utms;
            }
        });

        const groups = {};

        function ensureGroup(key, utms) {
            if (!groups[key]) {
                groups[key] = {
                    key: key,
                    source: (utms && normalizeUtmValue(utms.utm_source)) || 'Direto/Orgânico',
                    campaign: (utms && stripId(utms.utm_campaign)) || '-',
                    adset: (utms && stripId(utms.utm_medium)) || '-',
                    creative: (utms && stripId(utms.utm_content)) || '-',
                    term: (utms && utms.utm_term) || '-',
                    visitors: new Set(),
                    leads: new Set(),
                    checkouts: new Set(),
                    sales: 0,
                    revenue: 0,
                    attributedByEmail: 0
                };
            }
            return groups[key];
        }

        // Visitantes, leads e checkouts vêm dos eventos client-side (já carregam .utms)
        events.forEach(event => {
            if (!event.session_id) return;
            const key = utmGroupKey(event.utms);
            const group = ensureGroup(key, event.utms);

            if (event.event_type === 'page_view') {
                group.visitors.add(event.session_id);
                if (event.page && normalizePath(event.page).includes('/register/step1')) {
                    group.leads.add(event.session_id);
                }
            }
            if (event.event_type === 'checkout' && (event.action === 'init' || event.action === 'initiate')) {
                group.checkouts.add(event.session_id);
            }
        });

        // Vendas vêm das transações reais (fonte de verdade de receita)
        (transactionsInPeriod || []).forEach(tx => {
            if (tx.gateway_status !== 'paid') return;

            let utms = null;
            let attributedByEmail = false;

            if (tx.utm_source) {
                utms = {
                    utm_source: tx.utm_source,
                    utm_campaign: tx.utm_campaign,
                    utm_medium: tx.utm_medium,
                    utm_content: tx.utm_content,
                    utm_term: tx.utm_term
                };
            } else {
                const email = (tx.customer_email || '').toLowerCase().trim();
                if (email && emailToUtms[email]) {
                    utms = emailToUtms[email];
                    attributedByEmail = true;
                }
            }

            const key = utmGroupKey(utms);
            const group = ensureGroup(key, utms);
            group.sales++;
            group.revenue += (tx.amount || 0) / 100; // amount vem em centavos
            if (attributedByEmail) group.attributedByEmail++;
        });

        const rows = Object.values(groups).map(g => {
            const visitors = g.visitors.size;
            const leads = g.leads.size;
            const checkouts = g.checkouts.size;
            return {
                source: g.source,
                campaign: g.campaign,
                adset: g.adset,
                creative: g.creative,
                term: g.term,
                visitors: visitors,
                leads: leads,
                checkouts: checkouts,
                sales: g.sales,
                revenue: g.revenue,
                avgTicket: g.sales > 0 ? g.revenue / g.sales : 0,
                conversionRate: visitors > 0 ? (g.sales / visitors) * 100 : 0,
                attributedByEmail: g.attributedByEmail
            };
        });

        // Ordena por receita (o que mais vende primeiro)
        rows.sort((a, b) => b.revenue - a.revenue || b.visitors - a.visitors);

        return rows;
    }

    // =====================
    // Renderização
    // =====================

    function renderKPIs(metrics) {
        const kpiContainer = document.getElementById('kpi-container');
        if (!kpiContainer) return;

        const uniqueVisitors = metrics.uniqueSessions.size;
        const landingVisitors = metrics.funnelSteps['/app/'].visitors.size;
        const chatVisitors = metrics.funnelSteps['/chat/'].visitors.size;

        const conversionRate = landingVisitors > 0
            ? ((chatVisitors / landingVisitors) * 100).toFixed(1)
            : 0;

        // Calcula tempo médio total
        let totalTime = 0;
        let timeCount = 0;
        Object.values(metrics.avgTimeByPage).forEach(data => {
            if (data.avg) {
                totalTime += data.avg;
                timeCount++;
            }
        });
        const avgTime = timeCount > 0 ? totalTime / timeCount : 0;

        // Conta leads (quem passou pelo step1)
        const leads = metrics.funnelSteps['/register/step1/'].visitors.size;

        kpiContainer.innerHTML = `
      <div class="card kpi-card animate-fadeIn">
        <div class="kpi-icon">📊</div>
        <div class="card-title">Visitantes Únicos</div>
        <div class="card-value">${formatNumber(uniqueVisitors || metrics.totalVisitors)}</div>
        <div class="card-change positive">
          <span>↑</span> Sessões únicas
        </div>
      </div>
      
      <div class="card kpi-card animate-fadeIn" style="animation-delay: 0.1s">
        <div class="kpi-icon">🎯</div>
        <div class="card-title">Taxa de Conversão</div>
        <div class="card-value">${conversionRate}%</div>
        <div class="card-change ${conversionRate >= 20 ? 'positive' : 'negative'}">
          <span>${conversionRate >= 20 ? '↑' : '↓'}</span> Landing → Chat
        </div>
      </div>
      
      <div class="card kpi-card animate-fadeIn" style="animation-delay: 0.2s">
        <div class="kpi-icon">⏱️</div>
        <div class="card-title">Tempo Médio</div>
        <div class="card-value">${formatTime(avgTime) || 'N/A'}</div>
        <div class="card-change">Por página</div>
      </div>
      
      <div class="card kpi-card animate-fadeIn" style="animation-delay: 0.3s">
        <div class="kpi-icon">👤</div>
        <div class="card-title">Leads Captados</div>
        <div class="card-value">${formatNumber(leads)}</div>
        <div class="card-change positive">
          <span>↑</span> Passaram pelo cadastro
        </div>
      </div>
    `;
    }

    function renderFunnel(metrics) {
        const funnelContainer = document.getElementById('funnel-container');
        if (!funnelContainer) return;

        let html = '';
        let previousVisitors = null;

        FUNNEL_STEPS.forEach((step, index) => {
            const stepData = metrics.funnelSteps[step.path];
            const visitors = stepData.visitors.size; // Sempre usa sessões únicas

            // Calcula conversão em relação ao step anterior
            let conversionRate = 100;
            let dropRate = 0;
            if (previousVisitors !== null && previousVisitors > 0) {
                conversionRate = ((visitors / previousVisitors) * 100).toFixed(0);
                dropRate = 100 - conversionRate;
            }

            // Calcula largura da barra (relativo ao primeiro step)
            // BUG FIX: Usa o máximo de visitantes de qualquer etapa para evitar que a barra passe de 100%
            const maxVisitors = Math.max(...FUNNEL_STEPS.map(s =>
                metrics.funnelSteps[s.path].visitors.size || metrics.funnelSteps[s.path].pageviews
            )) || 1;
            const barWidth = Math.max(10, (visitors / maxVisitors) * 100);

            // Determina se é gargalo (drop > 50%)
            const isGargalo = dropRate > 50 && index > 0;

            // Determina cor da conversão
            let conversionClass = 'high';
            if (conversionRate < 70) conversionClass = 'medium';
            if (conversionRate < 50) conversionClass = 'low';

            // Tempo médio nesta página
            let avgTimeStr = 'N/A';
            Object.keys(metrics.avgTimeByPage).forEach(page => {
                if (page.includes(step.path.toLowerCase())) {
                    avgTimeStr = formatTime(metrics.avgTimeByPage[page].avg);
                }
            });

            html += `
        <div class="funnel-step ${isGargalo ? 'gargalo' : ''} animate-fadeIn" style="animation-delay: ${index * 0.1}s">
          <div class="funnel-info">
            <div class="funnel-page">${step.name}</div>
            <div class="funnel-stats">
              ${formatNumber(visitors)} visitantes • ${avgTimeStr}
            </div>
          </div>
          <div class="funnel-bar-container">
            <div class="funnel-bar" style="width: ${barWidth}%">
              <span>${formatNumber(visitors)}</span>
            </div>
          </div>
          ${index > 0 ? `
            <div class="funnel-conversion ${conversionClass}">
              ${conversionRate}%
            </div>
          ` : '<div class="funnel-conversion high">100%</div>'}
        </div>
      `;

            previousVisitors = visitors;
        });

        if (metrics.totalVisitors === 0) {
            html = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <h3>Nenhum dado ainda</h3>
          <p>Navegue pelo funil para gerar dados de tracking</p>
        </div>
      `;
        }

        funnelContainer.innerHTML = html;
    }

    function renderRetentionByStep(metrics) {
        const chartContainer = document.getElementById('retention-chart');
        const tableContainer = document.getElementById('retention-table');
        if (!chartContainer || !tableContainer) return;

        const stepsData = FUNNEL_STEPS.map(step => ({
            name: step.name,
            visitors: metrics.funnelSteps[step.path].visitors.size
        }));

        const firstVisitors = stepsData.length ? stepsData[0].visitors : 0;

        if (!firstVisitors) {
            chartContainer.innerHTML = '<p class="no-data">Sem dados suficientes ainda</p>';
            tableContainer.innerHTML = '';
            return;
        }

        // Calcula retenção etapa-a-etapa e cumulativa, e identifica o maior gargalo
        let previousVisitors = null;
        let worstIndex = -1;
        let worstDropRate = -Infinity;

        const rows = stepsData.map((s, i) => {
            const cumulativePct = (s.visitors / firstVisitors) * 100;
            let stepPct = 100;
            let lost = 0;

            if (previousVisitors !== null) {
                stepPct = previousVisitors > 0 ? (s.visitors / previousVisitors) * 100 : 0;
                lost = previousVisitors - s.visitors;

                const dropRate = 100 - stepPct;
                if (dropRate > worstDropRate) {
                    worstDropRate = dropRate;
                    worstIndex = i;
                }
            }

            previousVisitors = s.visitors;
            return { name: s.name, visitors: s.visitors, cumulativePct: cumulativePct, stepPct: stepPct, lost: lost };
        });

        const maxBarHeight = 140;

        chartContainer.innerHTML = rows.map((r, i) => `
      <div class="retention-bar-col">
        <div class="retention-bar-pct">${r.cumulativePct.toFixed(1)}%</div>
        <div class="retention-bar ${i === worstIndex ? 'worst' : ''}" style="height: ${Math.max(6, (r.cumulativePct / 100) * maxBarHeight)}px"></div>
        <div class="retention-bar-label" title="${r.name}">${r.name}</div>
      </div>
    `).join('');

        tableContainer.innerHTML = rows.map((r, i) => `
      <div class="retention-row">
        <div class="retention-row-name ${i === worstIndex ? 'worst' : ''}">${r.name}</div>
        <div class="retention-row-pct">${r.stepPct.toFixed(0)}%</div>
        <div class="retention-row-bar-container">
          <div class="retention-row-bar ${i === worstIndex ? 'worst' : ''}" style="width: ${Math.max(2, r.stepPct)}%"></div>
        </div>
        <div class="retention-row-meta">
          <strong>${formatNumber(r.visitors)}</strong> (${r.cumulativePct.toFixed(0)}%)
          ${i > 0 ? `<span class="${r.lost > 0 ? 'loss-negative' : 'loss-positive'}">${r.lost > 0 ? '-' : '+'}${formatNumber(Math.abs(r.lost))}</span>` : ''}
        </div>
      </div>
    `).join('');
    }

    function renderUpsellFunnel(rows) {
        const container = document.getElementById('upsell-funnel-table');
        if (!container) return;

        const fmtMoney = v => 'R$ ' + v.toFixed(2).replace('.', ',');
        const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
        const totalConfirmedRevenue = rows.reduce((sum, r) => sum + r.confirmedRevenue, 0);

        const html = `
            <div class="campaign-table-scroll">
                <table class="campaign-table">
                    <thead>
                        <tr>
                            <th>Oferta</th>
                            <th>Visualizações</th>
                            <th>Aceitou (principal)</th>
                            <th>Recusou</th>
                            <th>Viu Downsell</th>
                            <th>Aceitou Downsell</th>
                            <th>Foi pro próximo</th>
                            <th>Conv. total</th>
                            <th>Cliques em "aceitar"</th>
                            <th>Vendas confirmadas</th>
                            <th>Receita confirmada</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td>${r.name}</td>
                                <td>${formatNumber(r.views)}</td>
                                <td>${formatNumber(r.acceptMain)}</td>
                                <td>${formatNumber(r.declineMain)}</td>
                                <td>${formatNumber(r.viewDownsell)}</td>
                                <td>${formatNumber(r.acceptDownsell)}</td>
                                <td>${formatNumber(r.declineDownsell)}</td>
                                <td>${r.conversionRate.toFixed(1)}%</td>
                                <td>${fmtMoney(r.revenue)}</td>
                                <td>${formatNumber(r.totalConfirmed)}</td>
                                <td><strong>${fmtMoney(r.confirmedRevenue)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <p class="campaign-table-note">"Cliques em aceitar" é quanto a pessoa clicou pra pagar (nem sempre conclui no gateway). "Vendas confirmadas" e "Receita confirmada" vêm do cruzamento com a coleção de transações pagas (webhook), casando pelo valor cobrado (${UPSELL_STEPS.map(s => fmtMoney(s.mainPrice) + (s.downsellPrice ? '/' + fmtMoney(s.downsellPrice) : '')).join(', ')}). Receita confirmada total no período: <strong>${fmtMoney(totalConfirmedRevenue)}</strong> (vs. ${fmtMoney(totalRevenue)} em cliques).</p>
        `;

        container.innerHTML = html;
    }

    function renderCampaignBreakdown(rows) {
        const container = document.getElementById('campaign-breakdown-table');
        if (!container) return;

        if (!rows || rows.length === 0) {
            container.innerHTML = '<p class="no-data">Sem dados suficientes ainda</p>';
            return;
        }

        const fmtMoney = v => 'R$ ' + v.toFixed(2).replace('.', ',');

        const bestRevenue = rows[0] ? rows[0].revenue : 0;

        const html = `
            <div class="campaign-table-scroll">
                <table class="campaign-table">
                    <thead>
                        <tr>
                            <th>Origem</th>
                            <th>Campanha</th>
                            <th>Conjunto</th>
                            <th>Criativo</th>
                            <th>Visitantes</th>
                            <th>Leads</th>
                            <th>Checkouts</th>
                            <th>Vendas</th>
                            <th>Receita</th>
                            <th>Conv.</th>
                            <th>Ticket médio</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr class="${r.revenue > 0 && r.revenue === bestRevenue ? 'best-row' : ''}">
                                <td>${r.source}</td>
                                <td title="${r.campaign}">${r.campaign.length > 24 ? r.campaign.substring(0, 24) + '…' : r.campaign}</td>
                                <td title="${r.adset}">${r.adset.length > 20 ? r.adset.substring(0, 20) + '…' : r.adset}</td>
                                <td title="${r.creative}">${r.creative.length > 24 ? r.creative.substring(0, 24) + '…' : r.creative}</td>
                                <td>${formatNumber(r.visitors)}</td>
                                <td>${formatNumber(r.leads)}</td>
                                <td>${formatNumber(r.checkouts)}</td>
                                <td><strong>${formatNumber(r.sales)}</strong></td>
                                <td><strong>${fmtMoney(r.revenue)}</strong></td>
                                <td>${r.conversionRate.toFixed(1)}%</td>
                                <td>${r.sales > 0 ? fmtMoney(r.avgTicket) : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <p class="campaign-table-note">Vendas sem UTM própria na transação são atribuídas pelo e-mail do lead que se cadastrou (o gateway externo ainda não devolve UTM na venda).</p>
        `;

        container.innerHTML = html;
    }

    function renderUTMSources(metrics) {
        const container = document.getElementById('utm-sources');
        if (!container) return;

        // Converte Sets para contagens
        const sourcesWithCounts = Object.entries(metrics.utmSources).map(([source, sessions]) => [
            source,
            sessions.size || sessions // Suporta Set ou número (backward compat)
        ]);

        const sources = sourcesWithCounts
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        const total = sources.reduce((sum, [, count]) => sum + count, 0) || 1;

        if (sources.length === 0) {
            container.innerHTML = `
        <ul class="utm-list">
          <li class="utm-item">
            <span class="utm-source">
              <span class="utm-dot" style="background: ${COLORS.utmColors[0]}"></span>
              <span class="utm-name">Direto / Sem UTM</span>
            </span>
            <span class="utm-value">100%</span>
          </li>
        </ul>
      `;
            return;
        }

        let html = '<ul class="utm-list">';
        sources.forEach(([source, count], index) => {
            const percentage = ((count / total) * 100).toFixed(0);
            html += `
        <li class="utm-item">
          <span class="utm-source">
            <span class="utm-dot" style="background: ${COLORS.utmColors[index % COLORS.utmColors.length]}"></span>
            <span class="utm-name">${source}</span>
          </span>
          <span class="utm-value">${percentage}% (${count})</span>
        </li>
      `;
        });
        html += '</ul>';

        container.innerHTML = html;
    }

    function renderCTAClicks(metrics) {
        const container = document.getElementById('cta-clicks');
        if (!container) return;

        const ctas = Object.entries(metrics.ctaClicks)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        if (ctas.length === 0) {
            container.innerHTML = `
        <div class="empty-state" style="padding: 30px">
          <p>Nenhum clique registrado ainda</p>
        </div>
      `;
            return;
        }

        const maxClicks = ctas[0][1];
        let html = '<div class="cta-list">';
        ctas.forEach(([cta, count], index) => {
            const percentage = (count / maxClicks) * 100;
            html += `
        <div class="utm-item">
          <span class="utm-source">
            <span style="color: var(--text-muted); min-width: 20px;">${index + 1}.</span>
            <span class="utm-name">${cta.substring(0, 30)}${cta.length > 30 ? '...' : ''}</span>
          </span>
          <span class="utm-value">${formatNumber(count)}</span>
        </div>
        <div class="progress-bar" style="margin-bottom: 12px;">
          <div class="progress-bar-fill" style="width: ${percentage}%"></div>
        </div>
      `;
        });
        html += '</div>';

        container.innerHTML = html;
    }

    // Formata a UTM de um evento pra exibição compacta na tabela de eventos recentes.
    // Usa a mesma convenção da tabela de Campanhas (utm_campaign/utm_content vêm
    // como "Nome|id" — stripId tira o "|id" pra ficar legível).
    function formatEventUtm(utms) {
        if (!utms || !utms.utm_source) return '<span class="utm-direct">Direto</span>';
        const parts = [utms.utm_source];
        const campaign = stripId(utms.utm_campaign);
        const content = stripId(utms.utm_content);
        if (campaign) parts.push(campaign);
        if (content) parts.push(content);
        return `<span class="utm-tag" title="${[
            utms.utm_source ? 'source: ' + utms.utm_source : '',
            utms.utm_medium ? 'medium: ' + utms.utm_medium : '',
            utms.utm_campaign ? 'campaign: ' + utms.utm_campaign : '',
            utms.utm_content ? 'content: ' + utms.utm_content : '',
            utms.utm_term ? 'term: ' + utms.utm_term : ''
        ].filter(Boolean).join(' | ')}">${parts.join(' / ')}</span>`;
    }

    function renderRecentEvents(metrics) {
        const container = document.getElementById('events-table-body');
        if (!container) return;

        if (metrics.recentEvents.length === 0) {
            container.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">
            Nenhum evento registrado ainda
          </td>
        </tr>
      `;
            return;
        }

        let html = '';
        // Filtra eventos do admin, mostra apenas eventos do funil
        const funnelEvents = metrics.recentEvents
            .filter(e => !e.page || !e.page.includes('/admin'))
            .slice(0, 30);

        funnelEvents.forEach(event => {
            const eventType = event.event_type || 'unknown';
            const page = event.page || '-';
            const detail = event.cta_text || event.cta_id ||
                event.swipe_action || event.conversion_type || '-';
            const device = event.device ? `${event.device.browser} / ${event.device.os}` : '-';
            const utm = formatEventUtm(event.utms);

            html += `
        <tr>
          <td>${formatDateTime(event.timestamp)}</td>
          <td><span class="event-type-badge ${eventType}">${eventType}</span></td>
          <td>${page}</td>
          <td>${detail}</td>
          <td>${utm}</td>
          <td>${device}</td>
        </tr>
      `;
        });

        container.innerHTML = html;
    }

    function renderDeviceStats(metrics) {
        const container = document.getElementById('device-stats');
        if (!container) return;

        // Converte Sets para contagens
        const browsersWithCounts = Object.entries(metrics.devices.browsers).map(([browser, sessions]) => [
            browser,
            sessions.size || sessions // Suporta Set ou número (backward compat)
        ]);

        const osWithCounts = Object.entries(metrics.devices.os).map(([osName, sessions]) => [
            osName,
            sessions.size || sessions
        ]);

        const browsers = browsersWithCounts
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const os = osWithCounts
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">';

        // Browsers
        html += '<div><h4 style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.85rem;">NAVEGADORES</h4><ul class="utm-list">';
        if (browsers.length === 0) {
            html += '<li class="utm-item"><span class="utm-name">Sem dados</span></li>';
        }
        browsers.forEach(([browser, count], i) => {
            html += `
        <li class="utm-item">
          <span class="utm-source">
            <span class="utm-dot" style="background: ${COLORS.utmColors[i]}"></span>
            <span class="utm-name">${browser}</span>
          </span>
          <span class="utm-value">${count}</span>
        </li>
      `;
        });
        html += '</ul></div>';

        // OS
        html += '<div><h4 style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.85rem;">SISTEMAS</h4><ul class="utm-list">';
        if (os.length === 0) {
            html += '<li class="utm-item"><span class="utm-name">Sem dados</span></li>';
        }
        os.forEach(([osName, count], i) => {
            html += `
        <li class="utm-item">
          <span class="utm-source">
            <span class="utm-dot" style="background: ${COLORS.utmColors[i]}"></span>
            <span class="utm-name">${osName}</span>
          </span>
          <span class="utm-value">${count}</span>
        </li>
      `;
        });
        html += '</ul></div>';

        html += '</div>';
        container.innerHTML = html;
    }

    // =====================
    // Renderização de Métricas Específicas
    // =====================

    function renderBottleneckAlert(advanced) {
        const container = document.getElementById('bottleneck-alert');
        if (!container) return;

        const bn = advanced.bottleneck;

        if (!bn.step || bn.dropRate === 0) {
            container.innerHTML = `
                <div class="bottleneck-card no-issue">
                    <div class="bottleneck-icon">✅</div>
                    <div class="bottleneck-content">
                        <h4>Funil Saudável</h4>
                        <p>Nenhum gargalo crítico detectado</p>
                    </div>
                </div>
            `;
            return;
        }

        const severityColors = {
            low: '#22c55e',
            medium: '#eab308',
            high: '#f97316',
            critical: '#ef4444'
        };

        const severityLabels = {
            low: 'Baixo',
            medium: 'Médio',
            high: 'Alto',
            critical: 'CRÍTICO'
        };

        const html = `
            <div class="bottleneck-card severity-${bn.severity}">
                <div class="bottleneck-header">
                    <span class="bottleneck-icon">🚨</span>
                    <span class="severity-badge" style="background: ${severityColors[bn.severity]}">
                        ${severityLabels[bn.severity]}
                    </span>
                </div>
                <div class="bottleneck-content">
                    <h4>Gargalo: ${bn.stepName}</h4>
                    <div class="bottleneck-flow">
                        <span class="flow-from">${bn.previousStep}</span>
                        <span class="flow-arrow">→</span>
                        <span class="flow-to">${bn.stepName}</span>
                    </div>
                    <div class="bottleneck-stats">
                        <div class="bn-stat">
                            <span class="bn-value" style="color: ${severityColors[bn.severity]}">${bn.dropRate}%</span>
                            <span class="bn-label">Drop-off</span>
                        </div>
                        <div class="bn-stat">
                            <span class="bn-value">${formatNumber(bn.lostUsers)}</span>
                            <span class="bn-label">Usuários perdidos</span>
                        </div>
                        <div class="bn-stat">
                            <span class="bn-value">${formatNumber(bn.previousVisitors)} → ${formatNumber(bn.currentVisitors)}</span>
                            <span class="bn-label">Fluxo</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Drop-offs Ranking -->
            <div class="dropoffs-ranking">
                <h5>📉 Ranking de Quedas</h5>
                <div class="dropoffs-list">
                    ${advanced.allDropOffs.slice(0, 5).map((d, i) => `
                        <div class="dropoff-item ${i === 0 ? 'worst' : ''}">
                            <span class="rank">#${i + 1}</span>
                            <span class="step-name">${d.previousStep} → ${d.stepName}</span>
                            <span class="drop-rate" style="color: ${d.dropRate > 50 ? '#ef4444' : d.dropRate > 30 ? '#eab308' : '#22c55e'}">
                                ${Math.round(d.dropRate)}%
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    function renderAdvancedMetrics(advanced) {
        const container = document.getElementById('advanced-metrics');
        if (!container) return;

        // Encontra hora de pico
        let peakHour = null;
        let peakHourCount = 0;
        Object.entries(advanced.peakHours).forEach(([hour, count]) => {
            if (count > peakHourCount) {
                peakHour = hour;
                peakHourCount = count;
            }
        });

        // Encontra dia de pico
        let peakDay = null;
        let peakDayCount = 0;
        Object.entries(advanced.peakDays).forEach(([day, count]) => {
            if (count > peakDayCount) {
                peakDay = day;
                peakDayCount = count;
            }
        });

        const html = `
            <div class="advanced-grid">
                <div class="advanced-item">
                    <span class="adv-icon">🚪</span>
                    <span class="adv-value">${advanced.bounceRates.overall}%</span>
                    <span class="adv-label">Bounce Rate</span>
                </div>
                <div class="advanced-item">
                    <span class="adv-icon">📱</span>
                    <span class="adv-value">${advanced.deviceConversion.mobile.rate}%</span>
                    <span class="adv-label">Conv. Mobile</span>
                </div>
                <div class="advanced-item">
                    <span class="adv-icon">💻</span>
                    <span class="adv-value">${advanced.deviceConversion.desktop.rate}%</span>
                    <span class="adv-label">Conv. Desktop</span>
                </div>
                <div class="advanced-item">
                    <span class="adv-icon">⏰</span>
                    <span class="adv-value">${peakHour ? peakHour + 'h' : 'N/A'}</span>
                    <span class="adv-label">Hora de Pico</span>
                </div>
                <div class="advanced-item">
                    <span class="adv-icon">📅</span>
                    <span class="adv-value">${peakDay || 'N/A'}</span>
                    <span class="adv-label">Dia de Pico</span>
                </div>
            </div>
            
            <div class="form-abandonment">
                <h5>📋 Abandono de Formulário</h5>
                <div class="abandonment-items">
                    <div class="abandonment-item">
                        <span class="form-name">Step 1 (Dados)</span>
                        <div class="abandonment-bar">
                            <div class="abandonment-fill" style="width: ${advanced.formAbandonment.step1.rate}%"></div>
                        </div>
                        <span class="abandonment-rate">${advanced.formAbandonment.step1.rate}%</span>
                    </div>
                    <div class="abandonment-item">
                        <span class="form-name">Step 2 (Perfil)</span>
                        <div class="abandonment-bar">
                            <div class="abandonment-fill" style="width: ${advanced.formAbandonment.step2.rate}%"></div>
                        </div>
                        <span class="abandonment-rate">${advanced.formAbandonment.step2.rate}%</span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    function renderRegistrationMetrics(specific) {
        const container = document.getElementById('registration-metrics');
        if (!container) return;

        const reg = specific.registration;
        const totalErrors = reg.formErrors.password_mismatch + reg.formErrors.password_short +
            reg.formErrors.required_field + reg.formErrors.other;

        // Calcula % de preenchimento baseado em quem focou vs preencheu
        const fields = ['name', 'email', 'pix_key', 'pixKey', 'password'];
        let fieldStats = '';
        fields.forEach(field => {
            const focused = reg.fieldFocus[field] || 0;
            const filled = reg.fieldFilled[field] || 0;

            // Se for PIX, soma ambos os IDs possíveis para garantir captura
            let actualFocused = focused;
            let actualFilled = filled;
            if (field === 'pix_key' || field === 'pixKey') {
                actualFocused = (reg.fieldFocus['pix_key'] || 0) + (reg.fieldFocus['pixKey'] || 0);
                actualFilled = (reg.fieldFilled['pix_key'] || 0) + (reg.fieldFilled['pixKey'] || 0);
                // Evita duplicar se ambos existirem (um pouco simplista mas funcional)
                if (field === 'pixKey') return;
            }

            const rate = actualFocused > 0 ? Math.round((actualFilled / actualFocused) * 100) : 0;
            const label = (field === 'pix_key' || field === 'pixKey') ? 'Chave PIX' :
                field === 'name' ? 'Nome' :
                    field === 'email' ? 'Email' : 'Senha';
            fieldStats += `
                <div class="metric-row">
                    <span class="metric-label">${label}</span>
                    <div class="metric-bar-container">
                        <div class="metric-bar" style="width: ${rate}%; background: ${COLORS.primary}"></div>
                    </div>
                    <span class="metric-value">${rate}%</span>
                </div>
            `;
        });

        const html = `
            <div class="metric-section">
                <h4>📝 Preenchimento de Campos</h4>
                ${fieldStats || '<p class="no-data">Sem dados ainda</p>'}
            </div>
            <div class="metric-section">
                <h4>⚠️ Erros no Formulário</h4>
                <div class="error-grid">
                    <div class="error-item ${reg.formErrors.password_mismatch > 0 ? 'has-errors' : ''}">
                        <span class="error-count">${reg.formErrors.password_mismatch}</span>
                        <span class="error-label">Senhas diferentes</span>
                    </div>
                    <div class="error-item ${reg.formErrors.password_short > 0 ? 'has-errors' : ''}">
                        <span class="error-count">${reg.formErrors.password_short}</span>
                        <span class="error-label">Senha curta</span>
                    </div>
                    <div class="error-item ${reg.formErrors.required_field > 0 ? 'has-errors' : ''}">
                        <span class="error-count">${reg.formErrors.required_field}</span>
                        <span class="error-label">Campo vazio</span>
                    </div>
                </div>
            </div>
            <div class="metric-section">
                <h4>📷 Upload de Fotos</h4>
                <div class="photo-stats">
                    <div class="photo-stat">
                        <span class="photo-count">${reg.photos.photo_1}</span>
                        <span class="photo-label">Foto 1</span>
                    </div>
                    <div class="photo-stat">
                        <span class="photo-count">${reg.photos.photo_2}</span>
                        <span class="photo-label">Foto 2</span>
                    </div>
                    <div class="photo-stat">
                        <span class="photo-count">${reg.photos.photo_3}</span>
                        <span class="photo-label">Foto 3</span>
                    </div>
                </div>
                <div class="bio-stat">Bio preenchida: <strong>${reg.bioFilled}</strong></div>
            </div>
        `;

        container.innerHTML = html;
    }

    function renderSwipeMetrics(specific) {
        const container = document.getElementById('swipe-metrics');
        if (!container) return;

        const sw = specific.swipes;
        const total = sw.likes + sw.dislikes;
        const likePercent = total > 0 ? Math.round((sw.likes / total) * 100) : 0;
        const dislikePercent = total > 0 ? Math.round((sw.dislikes / total) * 100) : 0;

        const html = `
            <div class="swipe-stats">
                <div class="swipe-stat like">
                    <span class="swipe-icon">❤️</span>
                    <span class="swipe-count">${formatNumber(sw.likes)}</span>
                    <span class="swipe-label">Likes (${likePercent}%)</span>
                </div>
                <div class="swipe-stat dislike">
                    <span class="swipe-icon">❌</span>
                    <span class="swipe-count">${formatNumber(sw.dislikes)}</span>
                    <span class="swipe-label">Dislikes (${dislikePercent}%)</span>
                </div>
            </div>
            <div class="swipe-ratio">
                <span>Ratio: <strong>${sw.ratio}:1</strong></span>
                <span>Perfis vistos: <strong>${formatNumber(sw.profilesViewed)}</strong></span>
            </div>
        `;

        container.innerHTML = html;
    }

    function renderWithdrawMetrics(specific) {
        const container = document.getElementById('withdraw-metrics');
        if (!container) return;

        const w = specific.withdraw;
        const total = w.bySource.discover + w.bySource.chat + w.bySource.premium_chat;
        const discoverPercent = total > 0 ? Math.round((w.bySource.discover / total) * 100) : 0;
        const chatPercent = total > 0 ? Math.round((w.bySource.chat / total) * 100) : 0;
        const premiumPercent = total > 0 ? Math.round((w.bySource.premium_chat / total) * 100) : 0;

        const html = `
            <div class="withdraw-header">
                <span class="withdraw-total">${formatNumber(w.opened)}</span>
                <span class="withdraw-label">Abriram popup</span>
            </div>
            <div class="source-breakdown">
                <div class="source-item">
                    <span class="source-dot" style="background: ${COLORS.blue}"></span>
                    <span class="source-name">Discover</span>
                    <span class="source-value">${w.bySource.discover} (${discoverPercent}%)</span>
                </div>
                <div class="source-item">
                    <span class="source-dot" style="background: ${COLORS.purple}"></span>
                    <span class="source-name">Chat</span>
                    <span class="source-value">${w.bySource.chat} (${chatPercent}%)</span>
                </div>
                <div class="source-item">
                    <span class="source-dot" style="background: ${COLORS.teal}"></span>
                    <span class="source-name">Premium Chat</span>
                    <span class="source-value">${w.bySource.premium_chat} (${premiumPercent}%)</span>
                </div>
            </div>
            <div class="pix-entered">
                Inseriram PIX: <strong>${w.pixEntered}</strong>
                ${w.opened > 0 ? `(${Math.round((w.pixEntered / w.opened) * 100)}%)` : ''}
            </div>
        `;

        container.innerHTML = html;
    }

    function renderPaywallMetrics(specific) {
        const container = document.getElementById('paywall-metrics');
        if (!container) return;

        const pw = specific.paywall;
        const total = Object.values(pw.bySource).reduce((a, b) => a + b, 0);

        let sourceBreakdown = '';
        const sources = [
            { key: 'chat', label: 'Chat', color: COLORS.purple },
            { key: 'match', label: 'Match', color: COLORS.primary },
            { key: 'recusa_tudo', label: 'Recusou Tudo', color: COLORS.danger },
            { key: 'gift_claim', label: 'Presente', color: COLORS.warning }
        ];

        sources.forEach(s => {
            const count = pw.bySource[s.key] || 0;
            const percent = total > 0 ? Math.round((count / total) * 100) : 0;
            if (count > 0) {
                sourceBreakdown += `
                    <div class="source-item">
                        <span class="source-dot" style="background: ${s.color}"></span>
                        <span class="source-name">${s.label}</span>
                        <span class="source-value">${count} (${percent}%)</span>
                    </div>
                `;
            }
        });

        const clickRate = pw.views > 0 ? Math.round((pw.clickedCheckout / pw.views) * 100) : 0;

        const html = `
            <div class="paywall-header">
                <span class="paywall-views">${formatNumber(pw.views)}</span>
                <span class="paywall-label">Visualizações</span>
            </div>
            <div class="source-breakdown">
                ${sourceBreakdown || '<p class="no-data">Sem dados por origem</p>'}
            </div>
            <div class="checkout-click">
                → Checkout: <strong>${pw.clickedCheckout}</strong> (${clickRate}%)
            </div>
        `;

        container.innerHTML = html;
    }

    // completed/revenue vêm da coleção real de transações (fonte de verdade) —
    // o evento client-side "checkout complete" nunca dispara de verdade, porque
    // o pagamento acontece num checkout externo e o navegador não volta pra avisar.
    function renderCheckoutMetrics(specific, transactionsInPeriod) {
        const container = document.getElementById('checkout-metrics');
        if (!container) return;

        const ck = specific.checkout;
        const paid = (transactionsInPeriod || []).filter(t => t.gateway_status === 'paid');
        const completed = paid.length;
        const totalRevenue = paid.reduce((sum, t) => sum + (t.amount || 0), 0) / 100;
        const conversionRate = ck.initiated > 0 ? ((completed / ck.initiated) * 100).toFixed(1) : '0.0';

        const html = `
            <div class="checkout-stats">
                <div class="checkout-stat">
                    <span class="checkout-value">${formatNumber(ck.initiated)}</span>
                    <span class="checkout-label">Iniciou</span>
                </div>
                <div class="checkout-stat success">
                    <span class="checkout-value">${formatNumber(completed)}</span>
                    <span class="checkout-label">Concluiu</span>
                </div>
                <div class="checkout-stat danger">
                    <span class="checkout-value">${formatNumber(ck.abandoned)}</span>
                    <span class="checkout-label">Abandonou</span>
                </div>
            </div>
            <div class="checkout-rate">
                Taxa: <strong>${conversionRate}%</strong>
            </div>
            <div class="checkout-revenue">
                💵 Receita: <strong>R$ ${totalRevenue.toFixed(2).replace('.', ',')}</strong>
            </div>
        `;

        container.innerHTML = html;
    }

    function renderChatMetrics(specific) {
        const container = document.getElementById('chat-engagement-metrics');
        if (!container) return;

        const ch = specific.chat;
        const readRate = ch.messagesSent > 0 ? Math.round((ch.messagesRead / ch.messagesSent) * 100) : 0;

        const html = `
            <div class="chat-stats">
                <div class="chat-stat">
                    <span class="chat-value">${formatNumber(ch.messagesSent)}</span>
                    <span class="chat-label">Msgs enviadas</span>
                </div>
                <div class="chat-stat">
                    <span class="chat-value">${formatNumber(ch.messagesRead)}</span>
                    <span class="chat-label">Msgs lidas</span>
                </div>
            </div>
            <div class="chat-rate">
                Taxa leitura: <strong>${readRate}%</strong>
            </div>
            <div class="gift-claims">
                🎁 Tentativas de resgatar presente: <strong>${ch.giftClaimAttempts}</strong>
            </div>
        `;

        container.innerHTML = html;
    }

    // =====================
    // Inicialização
    // =====================

    // Busca todos os leads (coleção users) pra usar como tabela de atribuição
    // e-mail -> utms. É só uma tabela de lookup, não uma métrica period-bound.
    async function fetchAllUsersForAttribution() {
        if (typeof db === 'undefined' || !db) return [];
        const snapshot = await db.collection('users').limit(3000).get();
        const users = [];
        snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
        return users;
    }

    async function refreshDashboard() {
        const periodSelect = document.getElementById('period-select');
        const period = periodSelect ? periodSelect.value : 'all';
        const customStartInput = document.getElementById('date-start');
        const customEndInput = document.getElementById('date-end');
        const customStart = customStartInput ? customStartInput.value : null;
        const customEnd = customEndInput ? customEndInput.value : null;
        const loadingOverlay = document.getElementById('loading-overlay');

        // Mostra loading se for recarga manual
        if (window.isManualRefresh && loadingOverlay) {
            loadingOverlay.classList.remove('hidden');
        }

        try {
            console.log('🔄 Iniciando atualização do dashboard...');

            const { startMs } = getPeriodBoundaries(period, customStart, customEnd);

            // 1. Busca eventos do Firestore (Fonte da verdade)
            let events = [];

            if (window.MadamesFirestore && window.MadamesFirestore.isReady()) {
                events = await window.MadamesFirestore.getEvents({
                    limit: 5000,
                    startDate: startMs > 0 ? startMs : null
                });

                console.log(`📊 ${events.length} eventos carregados do Firestore`);
            } else {
                console.warn('⚠️ Firestore não pronto, usando localStorage como fallback');
                events = getStoredEvents();
            }

            // 2. Filtra localmente pelo período exato (início E fim — importante pra "ontem"/personalizado)
            if (period !== 'all') {
                events = filterEventsByPeriod(events, period, customStart, customEnd);
            }

            // 2b. Busca transações e leads reais, pra receita/vendas confiáveis e pra
            // análise por campanha/criativo (não depende do evento client-side de "checkout completo",
            // que nunca dispara porque o pagamento acontece fora do site)
            let transactionsInPeriod = [];
            let allUsersForAttribution = [];

            if (window.MadamesFirestore && window.MadamesFirestore.isReady()) {
                try {
                    const allTransactions = await window.MadamesFirestore.getTransactions({ limit: 3000 });
                    transactionsInPeriod = period === 'all'
                        ? allTransactions
                        : filterByPeriodISO(allTransactions, 'gateway_created_at', period, customStart, customEnd);
                } catch (e) {
                    console.error('Erro ao buscar transações para análise:', e);
                }

                try {
                    allUsersForAttribution = await fetchAllUsersForAttribution();
                } catch (e) {
                    console.error('Erro ao buscar leads para atribuição:', e);
                }
            }

            // 3. Calcula métricas
            const metrics = calculateMetrics(events);
            const specificMetrics = calculateSpecificMetrics(events);
            const advancedMetrics = calculateBottleneckAndAdvanced(events, metrics);
            const campaignBreakdown = calculateCampaignBreakdown(events, transactionsInPeriod, allUsersForAttribution);
            const upsellFunnel = calculateUpsellFunnel(events, transactionsInPeriod);
            const balanceStats = calculateBalanceStats(events);

            // 4. Renderiza métricas básicas
            renderKPIs(metrics);
            renderFunnel(metrics);
            renderRetentionByStep(metrics);
            renderUTMSources(metrics);
            renderCTAClicks(metrics);
            renderRecentEvents(metrics);
            renderDeviceStats(metrics);
            renderCampaignBreakdown(campaignBreakdown);
            renderUpsellFunnel(upsellFunnel);
            renderBalanceStats(balanceStats);

            // 5. Renderiza gargalo e métricas avançadas
            renderBottleneckAlert(advancedMetrics);
            renderAdvancedMetrics(advancedMetrics);

            // 6. Renderiza métricas específicas
            renderRegistrationMetrics(specificMetrics);
            renderSwipeMetrics(specificMetrics);
            renderWithdrawMetrics(specificMetrics);
            renderPaywallMetrics(specificMetrics);
            renderCheckoutMetrics(specificMetrics, transactionsInPeriod);
            renderChatMetrics(specificMetrics);

            // 7. Atualiza contador de eventos
            const eventCount = document.getElementById('event-count');
            if (eventCount) {
                eventCount.textContent = events.length + ' eventos processados';
            }

            // 8. Renderiza remarketing do Firestore
            await renderRemarketingData();

        } catch (error) {
            console.error('❌ Erro fatal ao atualizar dashboard:', error);
            // Mostra erro na UI para o admin ver
            const kpiContainer = document.getElementById('kpi-container');
            if (kpiContainer) {
                kpiContainer.innerHTML = `<div class="card error-card" style="grid-column: 1/-1; background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; padding: 20px;">
                    <h3>Erro ao carregar dados</h3>
                    <p>${error.message}</p>
                    <small>Verifique o console para mais detalhes.</small>
                </div>`;
            }
        } finally {
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
            window.isManualRefresh = false;
        }
    }

    // =====================
    // Remarketing (Firestore)
    // =====================

    async function renderRemarketingData() {
        const statusEl = document.getElementById('firestore-status');

        // Verifica se Firestore está disponível
        if (!window.MadamesFirestore || !window.MadamesFirestore.isReady()) {
            if (statusEl) {
                statusEl.innerHTML = '⏳ Aguardando Firestore...';
                statusEl.style.background = 'rgba(234, 179, 8, 0.2)';
                statusEl.style.color = '#facc15';
            }
            // Tenta novamente em 1 segundo (max 10 tentativas para não travar)
            if (!window._firestoreRetryCount) window._firestoreRetryCount = 0;
            if (window._firestoreRetryCount < 10) {
                window._firestoreRetryCount++;
                setTimeout(renderRemarketingData, 1000);
            }
            return;
        }
        window._firestoreRetryCount = 0;

        // Firestore conectado
        if (statusEl) {
            statusEl.innerHTML = '✅ Conectado';
            statusEl.style.background = 'rgba(34, 197, 94, 0.2)';
            statusEl.style.color = '#4ade80';
        }

        // Busca e renderiza leads
        try {
            const users = await window.MadamesFirestore.getUsersForRemarketing({ limit: 20 });
            renderLeadsList(users);
        } catch (e) {
            console.error('Erro ao buscar leads:', e);
        }

        // Busca e renderiza transações
        try {
            const transactions = await window.MadamesFirestore.getTransactions({ limit: 20 });
            renderTransactionsList(transactions);
        } catch (e) {
            console.error('Erro ao buscar transações:', e);
        }

        // Busca e renderiza abandonos
        try {
            const abandons = await getCartAbandons();
            renderAbandonsList(abandons);
        } catch (e) {
            console.error('Erro ao buscar abandonos:', e);
        }
    }

    async function getCartAbandons() {
        if (!window.MadamesFirestore || !window.MadamesFirestore.isReady()) return [];
        // Usa o db diretamente se disponível
        if (typeof db !== 'undefined' && db) {
            const snapshot = await db.collection('cart_abandons')
                .orderBy('gateway_created_at', 'desc')
                .limit(20)
                .get();
            const results = [];
            snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
            return results;
        }
        return [];
    }

    function renderLeadsList(users) {
        const container = document.getElementById('leads-list');
        if (!container) return;

        if (!users || users.length === 0) {
            container.innerHTML = '<p class="no-data">Nenhum lead capturado ainda</p>';
            return;
        }

        const html = `
            <div class="leads-count">
                <span class="lead-total">${users.length}</span>
                <span class="lead-label">leads</span>
            </div>
            <div class="leads-table">
                ${users.slice(0, 10).map(user => `
                    <div class="lead-row">
                        <div class="lead-info">
                            <span class="lead-name">${user.name || 'Sem nome'}</span>
                            <span class="lead-email">${user.email || 'Sem email'}</span>
                        </div>
                        <div class="lead-meta">
                            <span class="lead-stage ${user.funnel_stage || ''}">${user.funnel_stage || '?'}</span>
                            ${user.abandoned ? '<span class="lead-abandoned">Abandonou</span>' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        container.innerHTML = html;
    }

    function renderTransactionsList(transactions) {
        const container = document.getElementById('transactions-list');
        if (!container) return;

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<p class="no-data">Nenhuma transação ainda</p>';
            return;
        }

        // Contadores
        const paid = transactions.filter(t => t.gateway_status === 'paid').length;
        const pending = transactions.filter(t => t.gateway_status === 'waiting_payment').length;
        const totalRevenue = transactions
            .filter(t => t.gateway_status === 'paid')
            .reduce((sum, t) => sum + (t.amount || 0), 0);

        const html = `
            <div class="tx-summary">
                <div class="tx-stat success">
                    <span class="tx-value">${paid}</span>
                    <span class="tx-label">Pagos</span>
                </div>
                <div class="tx-stat pending">
                    <span class="tx-value">${pending}</span>
                    <span class="tx-label">Pendentes</span>
                </div>
                <div class="tx-stat revenue">
                    <span class="tx-value">R$ ${(totalRevenue / 100).toFixed(2).replace('.', ',')}</span>
                    <span class="tx-label">Receita</span>
                </div>
            </div>
            <div class="tx-list">
                ${transactions.slice(0, 5).map(tx => `
                    <div class="tx-row ${tx.gateway_status}">
                        <span class="tx-customer">${tx.customer_name || 'Anônimo'}</span>
                        <span class="tx-amount">${tx.amount_formatted || 'R$ --'}</span>
                        <span class="tx-status ${tx.gateway_status}">${tx.gateway_status}</span>
                    </div>
                `).join('')}
            </div>
        `;
        container.innerHTML = html;
    }

    function renderAbandonsList(abandons) {
        const container = document.getElementById('abandons-list');
        if (!container) return;

        if (!abandons || abandons.length === 0) {
            container.innerHTML = '<p class="no-data">Nenhum abandono registrado</p>';
            return;
        }

        const html = `
            <div class="abandon-count">
                <span class="abandon-total">${abandons.length}</span>
                <span class="abandon-label">abandonos</span>
            </div>
            <div class="abandon-list">
                ${abandons.slice(0, 5).map(a => {
                    const time = a.gateway_created_at ? formatDateTime(new Date(a.gateway_created_at).getTime()) : '-';
                    const offer = a.offer_title || 'oferta desconhecida';
                    const email = a.customer_email || 'sem e-mail';
                    return `
                    <div class="abandon-row">
                        <span class="abandon-time">${time}</span>
                        <span class="abandon-stage">${offer}</span>
                        <span class="abandon-email">${email}</span>
                    </div>
                `;
                }).join('')}
            </div>
        `;
        container.innerHTML = html;
    }

    // =====================
    // Webhook Logs
    // =====================

    async function renderWebhookLogs() {
        if (!window.MadamesFirestore || !window.MadamesFirestore.isReady()) {
            return;
        }

        try {
            // Busca logs de transações (sucesso e erro)
            const db = firebase.firestore();

            // Logs de sucesso (transações recentes)
            const successLogs = await db.collection('transactions')
                .orderBy('gateway_created_at', 'desc')
                .limit(10)
                .get();

            renderWebhookSuccess(successLogs.docs.map(d => ({ id: d.id, ...d.data() })));

            // Logs de erro (se existir coleção webhook_errors)
            try {
                const errorLogs = await db.collection('webhook_errors')
                    .orderBy('gateway_created_at', 'desc')
                    .limit(10)
                    .get();
                renderWebhookErrors(errorLogs.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) {
                // Coleção não existe ainda - mostra vazio
                renderWebhookErrors([]);
            }
        } catch (e) {
            console.error('Erro ao buscar logs:', e);
        }
    }

    function renderWebhookSuccess(logs) {
        const container = document.getElementById('webhook-success');
        if (!container) return;

        if (!logs || logs.length === 0) {
            container.innerHTML = '<p class="no-data">Nenhum log de sucesso ainda</p>';
            return;
        }

        let html = '';
        logs.forEach(log => {
            const time = log.gateway_created_at ?
                formatDateTime(new Date(log.gateway_created_at).getTime()) :
                (log.created_at?.toDate ? formatDateTime(log.created_at.toDate().getTime()) : '-');

            html += `
                <div class="log-item success">
                    <span class="log-time">${time}</span>
                    <span class="log-message">${log.gateway_status || 'webhook'}: ${log.customer_email || 'N/A'}</span>
                    <span class="log-details">${log.amount_formatted || ''} - ${log.method || ''}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    function renderWebhookErrors(errors) {
        const container = document.getElementById('webhook-errors');
        if (!container) return;

        if (!errors || errors.length === 0) {
            container.innerHTML = '<p class="no-data">✅ Nenhum erro registrado</p>';
            return;
        }

        let html = '';
        errors.forEach(err => {
            const time = err.gateway_created_at ?
                formatDateTime(new Date(err.gateway_created_at).getTime()) :
                (err.created_at?.toDate ? formatDateTime(err.created_at.toDate().getTime()) : '-');

            html += `
                <div class="log-item error">
                    <span class="log-time">${time}</span>
                    <span class="log-message">${err.error_type || 'Erro'}</span>
                    <span class="log-details">${err.message || err.details || 'Sem detalhes'}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    function init() {
        // Bind do seletor de período
        const periodSelect = document.getElementById('period-select');
        const customRangeEl = document.getElementById('custom-date-range');
        if (periodSelect) {
            periodSelect.addEventListener('change', () => {
                if (customRangeEl) {
                    customRangeEl.hidden = periodSelect.value !== 'custom';
                }
                // Para "personalizado" só recarrega quando clicar "Aplicar" (senão
                // recarregaria com datas vazias antes do usuário escolher)
                if (periodSelect.value !== 'custom') {
                    window.isManualRefresh = true;
                    refreshDashboard();
                }
            });
        }

        const applyCustomDateBtn = document.getElementById('apply-custom-date-btn');
        if (applyCustomDateBtn) {
            applyCustomDateBtn.addEventListener('click', () => {
                window.isManualRefresh = true;
                refreshDashboard();
            });
        }

        // Bind do botão de exportar
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                if (window.MadamesTracking) {
                    window.MadamesTracking.exportEvents();
                }
            });
        }

        // Bind do botão de limpar
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async function () {
                const confirmPhrase = 'APAGAR TUDO';
                const typed = prompt(
                    '⚠️ PERIGO: isso vai apagar TODOS os dados de PRODUÇÃO (leads, vendas, histórico) ' +
                    'de forma PERMANENTE, sem possibilidade de desfazer.\n\n' +
                    'Para confirmar, digite exatamente: ' + confirmPhrase
                );
                if (typed === confirmPhrase) {
                    const originalText = clearBtn.innerText;
                    clearBtn.innerText = 'Apagando...';
                    clearBtn.disabled = true;

                    try {
                        // Wipes collections
                        await Promise.all([
                            wipeCollection('users'),
                            wipeCollection('events'),
                            wipeCollection('transactions'),
                            wipeCollection('cart_abandons'),
                            wipeCollection('webhook_errors')
                        ]);

                        // Clear local
                        localStorage.removeItem('madames_funnel_events');
                        localStorage.removeItem('madames_user_data');

                        alert('Banco de dados limpo com sucesso!');
                        window.location.reload();
                    } catch (error) {
                        console.error('Erro ao limpar:', error);
                        alert('Erro ao limpar dados: ' + error.message);
                        clearBtn.innerText = originalText;
                        clearBtn.disabled = false;
                    }
                } else if (typed !== null) {
                    alert('Frase incorreta. Nada foi apagado.');
                }
            });
        }
    }

    // Helper para limpar coleção
    // Antes: buscava só 100 docs por vez e apagava um lote de cada vez, esperando
    // cada commit terminar antes de buscar o próximo — pra 1000 docs isso é 10
    // round-trips sequenciais de leitura+escrita. Agora: busca páginas maiores
    // (2000 docs por vez) e dispara vários lotes de apagar em paralelo (o
    // Firestore aceita até 500 deletes por batch, e batches diferentes não
    // dependem entre si). Nota: .select() (projeção de campos) só existe no
    // SDK Admin (servidor) — o SDK client-side do Firestore não tem esse método.
    async function wipeCollection(collectionName) {
        if (!db) {
            console.error(`❌ Erro ao limpar ${collectionName}: Firestore (db) não inicializado`);
            return;
        }

        console.log(`🧹 Limpando coleção: ${collectionName}...`);
        const PAGE_SIZE = 2000;
        const BATCH_SIZE = 500; // limite do Firestore por batch

        try {
            let totalDeleted = 0;
            while (true) {
                const snapshot = await db.collection(collectionName).limit(PAGE_SIZE).get();
                if (snapshot.empty) break;

                const docs = snapshot.docs;
                const chunks = [];
                for (let i = 0; i < docs.length; i += BATCH_SIZE) {
                    chunks.push(docs.slice(i, i + BATCH_SIZE));
                }

                await Promise.all(chunks.map((chunk) => {
                    const batch = db.batch();
                    chunk.forEach((doc) => batch.delete(doc.ref));
                    return batch.commit();
                }));

                totalDeleted += docs.length;
                if (docs.length < PAGE_SIZE) break; // essa foi a última página
            }
            console.log(`✅ Coleção ${collectionName} limpa com sucesso (${totalDeleted} documentos).`);
        } catch (error) {
            console.error(`❌ Erro ao limpar coleção ${collectionName}:`, error);
            throw error; // Repassa para o Promise.all capturar
        }
    }


    // Bind do botão de refresh
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            window.isManualRefresh = true;
            refreshDashboard();
        });
    }

    // Bind do botão de refresh logs
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');
    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', renderWebhookLogs);
    }

    // Inicialização com retry para garantir que o Firebase carregou
    let initAttempts = 0;
    function tryInit() {
        if (window.MadamesFirestore && window.MadamesFirestore.isReady()) {
            console.log('🚀 Firebase pronto, carregando dashboard...');
            init(); // Executa binds (init)
            refreshDashboard(); // Carrega dados
            renderWebhookLogs(); // Carrega logs
        } else {
            initAttempts++;
            if (initAttempts < 20) { // Tenta por ~10 segundos
                setTimeout(tryInit, 500);
            } else {
                console.warn('⚠️ Timeout aguardando Firebase. Carregando modo offline/local.');
                init();
                refreshDashboard(); // Tenta carregar o que der (localStorage)
            }
        }
    }

    // Auto-refresh a cada 120 segundos (otimizado para performance)
    // Debounce para evitar múltiplos refreshes simultâneos
    let lastRefreshTime = 0;
    const MIN_REFRESH_INTERVAL = 5000; // 5 segundos mínimo entre refreshes

    const debouncedRefresh = function () {
        const now = Date.now();
        if (now - lastRefreshTime > MIN_REFRESH_INTERVAL) {
            lastRefreshTime = now;
            refreshDashboard();
        }
    };

    setInterval(debouncedRefresh, 120000);

    // Inicia processo
    tryInit();

    console.log('📊 Dashboard script carregado');

})();
