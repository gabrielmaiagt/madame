/**
 * Madames Online - Firebase Configuration
 * Configuração do Firebase e Firestore para tracking e remarketing
 */

// Firebase CDN imports (para uso em browser sem bundler)
// Carregado via script tags no HTML

// Configuração Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDO6BIsWhsh-hLCEnH_HfS40kQ1Y5YLMHM",
    authDomain: "madame-67e19.firebaseapp.com",
    projectId: "madame-67e19",
    storageBucket: "madame-67e19.firebasestorage.app",
    messagingSenderId: "254536715494",
    appId: "1:254536715494:web:7dde40f415c3d04d9cbf27",
    measurementId: "G-90871MQ0BN"
};

// Inicialização será feita após carregar os scripts do Firebase
let db = null;
let analytics = null;

// Inicializa Firebase quando os scripts estiverem carregados
function initializeFirebase() {
    if (typeof firebase !== 'undefined') {
        try {
            // Inicializa o app
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            // Inicializa Firestore
            db = firebase.firestore();

            // Inicializa Analytics (opcional)
            if (firebase.analytics) {
                analytics = firebase.analytics();
            }

            console.log('🔥 Firebase inicializado com sucesso');
            return true;
        } catch (error) {
            console.error('Erro ao inicializar Firebase:', error);
            return false;
        }
    } else {
        console.warn('Firebase SDK não carregado');
        return false;
    }
}

// =====================
// Firestore Helper Functions
// =====================

const MadamesFirestore = {
    // Verifica se o Firestore está disponível
    isReady: function () {
        return db !== null;
    },

    // Salva evento de tracking
    saveEvent: async function (eventData) {
        if (!this.isReady()) {
            console.warn('Firestore não disponível, salvando localmente');
            return false;
        }

        try {
            const docRef = await db.collection('events').add({
                ...eventData,
                server_timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('📊 Evento salvo no Firestore:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Erro ao salvar evento:', error);
            return false;
        }
    },

    // Salva ou atualiza dados do usuário (para remarketing)
    saveUser: async function (sessionId, userData) {
        if (!this.isReady()) {
            console.warn('Firestore não disponível');
            return false;
        }

        try {
            // Remove dados sensíveis
            const safeData = { ...userData };
            delete safeData.password;
            delete safeData.confirmPassword;

            await db.collection('users').doc(sessionId).set({
                ...safeData,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log('👤 Dados do usuário salvos:', sessionId);
            return true;
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            return false;
        }
    },

    // Atualiza a etapa do funil do usuário
    updateFunnelStage: async function (sessionId, stage, additionalData = {}) {
        if (!this.isReady()) return false;

        try {
            await db.collection('users').doc(sessionId).set({
                funnel_stage: stage,
                funnel_stage_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                ...additionalData
            }, { merge: true });

            console.log('🎯 Funil atualizado:', stage);
            return true;
        } catch (error) {
            console.error('Erro ao atualizar funil:', error);
            return false;
        }
    },

    // Marca usuário como abandonou
    markAsAbandoned: async function (sessionId, stage) {
        if (!this.isReady()) return false;

        try {
            await db.collection('users').doc(sessionId).set({
                abandoned: true,
                abandoned_at: firebase.firestore.FieldValue.serverTimestamp(),
                abandoned_stage: stage
            }, { merge: true });

            console.log('⚠️ Abandono registrado:', stage);
            return true;
        } catch (error) {
            console.error('Erro ao marcar abandono:', error);
            return false;
        }
    },

    // Busca eventos (para o dashboard)
    getEvents: async function (options = {}) {
        if (!this.isReady()) return [];

        try {
            let query = db.collection('events');

            // Filtro por período
            if (options.startDate) {
                query = query.where('timestamp', '>=', options.startDate);
            }

            // Limite
            query = query.orderBy('timestamp', 'desc').limit(options.limit || 1000);

            const snapshot = await query.get();
            const events = [];
            snapshot.forEach(doc => {
                events.push({ id: doc.id, ...doc.data() });
            });

            return events;
        } catch (error) {
            console.error('Erro ao buscar eventos:', error);
            return [];
        }
    },

    // Busca transações (para métricas de checkout)
    getTransactions: async function (options = {}) {
        if (!this.isReady()) return [];

        try {
            let query = db.collection('transactions');

            if (options.status) {
                query = query.where('status', '==', options.status);
            }

            query = query.orderBy('created_at', 'desc').limit(options.limit || 500);

            const snapshot = await query.get();
            const transactions = [];
            snapshot.forEach(doc => {
                transactions.push({ id: doc.id, ...doc.data() });
            });

            return transactions;
        } catch (error) {
            console.error('Erro ao buscar transações:', error);
            return [];
        }
    },

    // Busca usuários para remarketing
    getUsersForRemarketing: async function (filter = {}) {
        if (!this.isReady()) return [];

        try {
            let query = db.collection('users');

            // Filtro por etapa do funil
            if (filter.funnel_stage) {
                query = query.where('funnel_stage', '==', filter.funnel_stage);
            }

            // Apenas abandonados
            if (filter.abandoned) {
                query = query.where('abandoned', '==', true);
            }

            query = query.limit(filter.limit || 500);

            const snapshot = await query.get();
            const users = [];
            snapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });

            return users;
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
            return [];
        }
    }
};

// Exporta para uso global
window.MadamesFirestore = MadamesFirestore;
window.initializeFirebase = initializeFirebase;

// Auto-inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function () {
    // Aguarda os scripts do Firebase carregarem
    setTimeout(initializeFirebase, 100);
});
