(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[583],{3318:function(e,t,s){Promise.resolve().then(s.bind(s,741))},741:function(e,t,s){"use strict";s.r(t),s.d(t,{default:function(){return S}});var a=s(6102),r=s(7174),l=s(3906),n=s(1047),i=s(9599),o=s(3190),c=s(2192),d=s(9918),m=s(5852);let u=(0,m.Z)("Heart",[["path",{d:"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",key:"c3ymky"}]]);var x=s(8654),h=s(1407),f=s(4432),p=s(2821),g=s(4880),b=s(6944),j=s(1277);function A(e){let{type:t,profileId:s,count:r}=e,{getProfileById:l}=(0,g.n)(),i=s?l(s):null;return(0,a.jsx)("div",{className:"fixed top-4 inset-x-0 mx-auto z-[9999] w-auto max-w-[280px] px-4",children:(0,a.jsx)("div",{className:"bg-black/95 border border-gray-800 rounded-full shadow-lg backdrop-blur-sm shadow-[0_0_15px_rgba(0,0,0,0.5)] overflow-hidden",children:(0,a.jsxs)("div",{className:"flex items-center py-2 px-4 gap-3",children:[(()=>{switch(t){case"online":case"like":if(!i)return null;return(0,a.jsxs)(j.qE,{className:"h-10 w-10 flex-shrink-0 border-2 border-primary-500",children:[(0,a.jsx)(j.F$,{src:i.image||"/placeholder.svg",alt:i.name}),(0,a.jsx)(j.Q5,{className:"bg-primary-900 text-white",children:(0,a.jsx)(n.Z,{className:"h-5 w-5"})})]});case"nearby":return(0,a.jsx)("div",{className:"h-10 w-10 flex-shrink-0 rounded-full bg-primary-500 flex items-center justify-center",children:(0,a.jsx)(c.Z,{className:"h-5 w-5 text-black"})});default:return null}})(),(0,a.jsx)("div",{className:"flex flex-col min-w-0 flex-shrink",children:(()=>{switch(t){case"online":if(!i)return null;return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("p",{className:"text-sm font-medium text-white whitespace-nowrap",children:[(0,a.jsx)("span",{className:"font-bold",children:i.name})," está online"]}),(0,a.jsxs)("div",{className:"flex items-center",children:[(0,a.jsx)("span",{className:"h-2 w-2 rounded-full bg-primary-500 mr-1.5"}),(0,a.jsx)("span",{className:"text-xs text-primary-400",children:"Agora mesmo"})]})]});case"nearby":return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("p",{className:"text-sm font-medium text-white whitespace-nowrap",children:[(0,a.jsx)("span",{className:"font-bold",children:r})," mulheres próximas"]}),(0,a.jsxs)("div",{className:"flex items-center",children:[(0,a.jsx)("span",{className:"h-2 w-2 rounded-full bg-primary-500 mr-1.5"}),(0,a.jsx)("span",{className:"text-xs text-primary-400",children:"Agora mesmo"})]})]});case"like":if(!i)return null;return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("p",{className:"text-sm font-medium text-white whitespace-nowrap",children:[(0,a.jsx)("span",{className:"font-bold",children:i.name})," curtiu você"]}),(0,a.jsxs)("div",{className:"flex items-center",children:[(0,a.jsx)(u,{className:"h-3 w-3 text-primary-500 mr-1.5 fill-current"}),(0,a.jsx)("span",{className:"text-xs text-primary-400",children:"Agora mesmo"})]})]});default:return null}})()})]})})})}var N=s(2081);let w=(0,m.Z)("CircleCheck",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);

// ===== SISTEMA DE PRÉ-CARREGAMENTO DE ÁUDIO =====
// Cache global para áudios pré-carregados
const audioCache = new Map();
const audioPreloadQueue = new Set();

// Função para pré-carregar áudio com prioridade
const preloadAudio = (src, priority = 'high') => {
    return new Promise((resolve, reject) => {
        // Se já está no cache, resolve imediatamente
        if (audioCache.has(src)) {
            const cachedAudio = audioCache.get(src);
            // Reseta o áudio para o início para garantir reprodução completa
            cachedAudio.currentTime = 0;
            resolve(cachedAudio);
            return;
        }

        // Se já está sendo carregado, aguarda o carregamento
        if (audioPreloadQueue.has(src)) {
            // Aguarda um pouco e tenta novamente
            setTimeout(() => {
                if (audioCache.has(src)) {
                    const cachedAudio = audioCache.get(src);
                    cachedAudio.currentTime = 0;
                    resolve(cachedAudio);
                } else {
                    resolve(null);
                }
            }, 100);
            return;
        }

        audioPreloadQueue.add(src);
        
        const audio = new Audio();
        
        // Configurações otimizadas para mobile
        audio.preload = 'auto';
        audio.volume = 0.8;
        
        // Configurações específicas para iOS/Safari
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            audio.muted = false;
            audio.playsInline = true;
        }
        
        const onCanPlayThrough = () => {
            audioCache.set(src, audio);
            audioPreloadQueue.delete(src);
            audio.removeEventListener('canplaythrough', onCanPlayThrough);
            audio.removeEventListener('error', onError);
            resolve(audio);
        };
        
        const onError = (error) => {
            audioPreloadQueue.delete(src);
            audio.removeEventListener('canplaythrough', onCanPlayThrough);
            audio.removeEventListener('error', onError);
            console.warn(`Falha ao pré-carregar áudio: ${src}`, error);
            reject(error);
        };
        
        audio.addEventListener('canplaythrough', onCanPlayThrough);
        audio.addEventListener('error', onError);
        
        // Inicia o carregamento
        audio.src = src;
        audio.load();
    });
};

// Função para reproduzir áudio pré-carregado com fallback
const playPreloadedAudio = async (src) => {
    try {
        let audio = audioCache.get(src);
        
        if (!audio) {
            // Se não está no cache, tenta pré-carregar rapidamente
            audio = await preloadAudio(src);
        }
        
        if (audio) {
            // Reseta para o início
            audio.currentTime = 0;
            
            // Tenta reproduzir
            const playPromise = audio.play();
            
            if (playPromise !== undefined) {
                await playPromise;
            }
            
            return audio; // Retorna a instância do áudio para controle posterior
        }
    } catch (error) {
        console.warn('Erro ao reproduzir áudio:', error);
        
        // Fallback: cria um novo elemento audio e tenta reproduzir
        try {
            const fallbackAudio = new Audio(src);
            fallbackAudio.volume = 0.8;
            await fallbackAudio.play();
            return fallbackAudio; // Retorna a instância do fallback
        } catch (fallbackError) {
            console.error('Falha no fallback de áudio:', fallbackError);
            return null;
        }
    }
    
    return null;
};

// NOVA FUNÇÃO: Para parar o áudio
const stopAudio = (audioInstance) => {
    if (audioInstance) {
        try {
            audioInstance.pause();
            audioInstance.currentTime = 0;
        } catch (error) {
            console.warn('Erro ao parar áudio:', error);
        }
    }
};

// Hook para gerenciar pré-carregamento de áudio
const useAudioPreloader = () => {
    const [audioReady, setAudioReady] = (0,r.useState)(false);
    
    (0,r.useEffect)(() => {
        // Pré-carrega o áudio do PIX imediatamente quando o componente monta
        const initAudio = async () => {
            try {
                await preloadAudio('/discover/sounds/dinheiro.mp3', 'high');
                setAudioReady(true);
            } catch (error) {
                console.warn('Falha no pré-carregamento inicial do áudio:', error);
                // Mesmo com falha, marca como pronto para tentar o fallback
                setAudioReady(true);
            }
        };
        
        initAudio();
    }, []);
    
    return { audioReady, playPreloadedAudio, stopAudio };
};

function v(e){let{amount:t,onClose:s,isOpen:n}=e,[i,c]=(0,r.useState)("entering"),d=(0,r.useRef)(null);
    
    // Usa o hook de áudio
    const { audioReady, playPreloadedAudio: playAudio, stopAudio } = useAudioPreloader();
    
    // NOVA ADIÇÃO: Referência para controlar a instância do áudio
    const currentAudioRef = (0,r.useRef)(null);

    // NOVA FUNÇÃO: Para parar o áudio quando a notificação fechar
    const handleClose = () => {
        // Para o áudio antes de fechar
        if (currentAudioRef.current) {
            stopAudio(currentAudioRef.current);
            currentAudioRef.current = null;
        }
        s();
    };

    return((0,r.useEffect)(()=>{if(n){c("entering");
        
        // CORREÇÃO PRINCIPAL: Reproduz o áudio assim que a notificação abre
        const playNotificationSound = async () => {
            if (audioReady) {
                const audioInstance = await playAudio('/discover/sounds/dinheiro.mp3');
                // Armazena a referência do áudio para poder pará-lo depois
                currentAudioRef.current = audioInstance;
            }
        };
        
        // Pequeno delay para garantir que o modal esteja visível
        setTimeout(() => {
            playNotificationSound();
            c("visible");
        }, 100);
        
        return;
    } else {
        // NOVA ADIÇÃO: Para o áudio quando a notificação é fechada
        if (currentAudioRef.current) {
            stopAudio(currentAudioRef.current);
            currentAudioRef.current = null;
        }
    }
    c("exiting")},[n, audioReady, playAudio]),(0,r.useEffect)(()=>(d.current=document.createElement("style"),d.current.innerHTML="@keyframes fadeIn {\n  from { opacity: 0; transform: translateY(10px); }\n  to { opacity: 1; transform: translateY(0); }\n}",document.head.appendChild(d.current),()=>{d.current&&document.head.removeChild(d.current)}),[]),n)?(0,a.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm",onClick:e=>{e.target===e.currentTarget&&handleClose()},children:(0,a.jsx)("div",{className:"w-full max-w-xs p-3 transition-all duration-300 ".concat({entering:"opacity-0 scale-95 translate-y-4",visible:"opacity-100 scale-100 translate-y-0",exiting:"opacity-0 scale-95 translate-y-4"}[i]),children:(0,a.jsxs)(N.Zb,{className:"w-full bg-gradient-to-b from-gray-900 to-gray-950 border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)] overflow-hidden",children:[(0,a.jsx)("div",{className:"h-1 w-full bg-gradient-to-r from-green-400 via-green-500 to-green-400"}),(0,a.jsxs)("div",{className:"p-4 flex flex-col items-center",children:[(0,a.jsx)("div",{className:"w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mb-4 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-[spin_1s_ease-in-out]",children:(0,a.jsx)(o.Z,{className:"h-8 w-8 text-white"})}),(0,a.jsx)("div",{className:"animate-bounce mb-2",children:(0,a.jsx)(w,{className:"h-6 w-6 text-green-500"})}),(0,a.jsx)("h2",{className:"text-xl font-bold text-white mb-1 animate-[fadeIn_0.5s_ease-in-out]",children:"PIX Recebido!"}),
                
                // REMOÇÃO: Remove o elemento audio antigo que dependia de autoPlay
                // O áudio agora é reproduzido programaticamente via JavaScript
                
                (0,a.jsx)("div",{className:"bg-black/30 rounded-lg py-3 px-6 mb-4 border border-green-500/30 flex items-center justify-center animate-[pulse_2s_infinite]",children:(0,a.jsxs)("span",{className:"text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-green-500 to-green-300 text-3xl font-bold",children:["R$ ",t.toFixed(2)]})}),(0,a.jsxs)("p",{className:"text-sm text-gray-300 mb-4 text-center animate-[fadeIn_0.7s_ease-in-out]",children:["As madames ",(0,a.jsx)("span",{className:"text-green-400",children:"AMAM"})," receber curtidas... e pagam por isso!"]}),(0,a.jsxs)("div",{className:"flex items-center justify-center mb-4 text-xs text-green-400 animate-[fadeIn_0.9s_ease-in-out]",children:[(0,a.jsx)(u,{className:"h-3 w-3 mr-1 fill-current animate-pulse"}),(0,a.jsx)("span",{children:"Continue curtindo para turbinar seu saldo!"})]}),(0,a.jsx)(l.z,{onClick:handleClose,className:"w-full py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-full shadow-[0_0_10px_rgba(34,197,94,0.3)] border border-green-400/50 animate-[fadeIn_1.1s_ease-in-out]",children:"CONTINUAR CURTINDO"})]}),(0,a.jsx)("div",{className:"h-1 w-full bg-gradient-to-r from-green-400 via-green-500 to-green-400"})]})})}):null}var y=s(3715),E=s(3727),Q=s(8273);function B(e){let{isOpen:t,onClose:s,userImage:n,matchProfileId:i}=e,o=(0,E.useRouter)(),{getProfileById:c,profiles:d}=(0,g.n)(),[m,u]=(0,r.useState)(""),x=i?c(i):null;if(!x){let e=d.filter(e=>14!==e.id),t=Math.floor(Math.random()*e.length);x=e[t]}return((0,r.useEffect)(()=>{t?u("animate-fadeIn"):u("")},[t]),t&&x)?(0,a.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm",onClick:e=>{e.target===e.currentTarget&&s()},children:(0,a.jsx)("div",{className:"w-full max-w-sm p-4 relative ".concat(m),children:(0,a.jsxs)("div",{className:"bg-gradient-to-b from-primary-500/90 to-gray-900/90 rounded-xl overflow-hidden border border-primary-400/50 shadow-[0_0_20px_rgba(253,100,196,0.5)]",children:[(0,a.jsxs)("div",{className:"relative py-6 text-center",children:[(0,a.jsxs)("div",{className:"absolute top-0 left-0 w-full h-full overflow-hidden opacity-20",children:[(0,a.jsx)("div",{className:"absolute top-1/4 left-1/4 w-1 h-1 bg-white rounded-full animate-pulse"}),(0,a.jsx)("div",{className:"absolute top-1/3 left-2/3 w-2 h-2 bg-amber-300 rounded-full animate-pulse"}),(0,a.jsx)("div",{className:"absolute top-2/3 left-1/5 w-1.5 h-1.5 bg-primary-300 rounded-full animate-pulse"}),(0,a.jsx)("div",{className:"absolute top-1/2 left-3/4 w-1 h-1 bg-white rounded-full animate-pulse"})]}),(0,a.jsx)("h2",{className:"text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-primary-400 to-amber-300 mb-1",children:"Match!"}),(0,a.jsx)("p",{className:"text-white text-sm px-8",children:"Vocês se conectaram! Agora é sua chance de iniciar uma conversa inesquecível."})]}),(0,a.jsxs)("div",{className:"flex justify-center items-center gap-4 px-8 py-4",children:[(0,a.jsx)("div",{className:"relative w-32 h-32 rounded-full overflow-hidden border-2 border-primary-400 shadow-[0_0_10px_rgba(253,100,196,0.5)]",children:(0,a.jsx)(h.default,{src:n||"/placeholder.svg?height=128&width=128&query=user",alt:"Seu perfil",fill:!0,className:"object-cover"})}),(0,a.jsx)("div",{className:"relative",children:(0,a.jsx)("svg",{width:"40",height:"40",viewBox:"0 0 24 24",className:"text-pink-500 animate-pulse",children:(0,a.jsx)("path",{fill:"currentColor",d:"M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"})})}),(0,a.jsx)("div",{className:"relative w-32 h-32 rounded-full overflow-hidden border-2 border-primary-400 shadow-[0_0_10px_rgba(253,100,196,0.5)]",children:(0,a.jsx)(h.default,{src:x.image||"/placeholder.svg?height=128&width=128&query=match",alt:x.name,fill:!0,className:"object-cover"})})]}),(0,a.jsx)("div",{className:"px-6 py-2",children:(0,a.jsxs)("div",{className:"bg-black/30 rounded-lg p-3 mb-4 border border-primary-400/20",children:[(0,a.jsxs)("h3",{className:"text-lg font-semibold text-white mb-1",children:[x.name,", ",x.age]}),(0,a.jsxs)("p",{className:"text-sm text-gray-300 mb-2",children:[x.bio.substring(0,100),"..."]}),(0,a.jsx)("div",{className:"flex flex-wrap gap-1",children:x.interests.slice(0,3).map(e=>(0,a.jsx)("span",{className:"px-2 py-0.5 bg-primary-500/20 text-primary-300 rounded-full text-xs",children:e},e))})]})}),(0,a.jsx)("div",{className:"p-6 pt-0 grid grid-cols-1 gap-3",children:(0,a.jsxs)(l.z,{onClick:()=>{s(),o.push("/chat?profile_id=".concat(x.id))},className:"w-full py-6 bg-gradient-to-r from-primary-500 to-pink-500 hover:from-primary-600 hover:to-pink-600 rounded-full text-white font-bold shadow-lg",children:[(0,a.jsx)(Q.Z,{className:"h-5 w-5 mr-2"})," Conversar agora"]})})]})})}):null}

// ===== PRÉ-CARREGAMENTO INTELIGENTE DE IMAGENS =====
// Sistema de cache para imagens pré-carregadas
const imageCache = new Map();
const preloadQueue = new Set();

// Função para pré-carregar uma imagem
const preloadImage = (src) => {
    return new Promise((resolve, reject) => {
        // Se já está no cache, resolve imediatamente
        if (imageCache.has(src)) {
            resolve(src);
            return;
        }

        // Se já está sendo carregada, não duplica o request
        if (preloadQueue.has(src)) {
            resolve(src);
            return;
        }

        preloadQueue.add(src);
        
        const img = new Image();
        
        img.onload = () => {
            imageCache.set(src, true);
            preloadQueue.delete(src);
            resolve(src);
        };
        
        img.onerror = () => {
            preloadQueue.delete(src);
            reject(new Error(`Failed to preload image: ${src}`));
        };
        
        // Configurações para otimizar carregamento mobile
        img.loading = 'eager';
        img.decoding = 'async';
        img.src = src;
    });
};

// Função para pré-carregar múltiplas imagens em lote
const preloadImageBatch = async (imageSources, maxConcurrent = 2) => {
    const chunks = [];
    for (let i = 0; i < imageSources.length; i += maxConcurrent) {
        chunks.push(imageSources.slice(i, i + maxConcurrent));
    }
    
    for (const chunk of chunks) {
        try {
            await Promise.allSettled(chunk.map(src => preloadImage(src)));
        } catch (error) {
            console.warn('Batch preload warning:', error);
        }
    }
};

// Hook personalizado para gerenciar pré-carregamento
const useImagePreloader = (profiles, currentIndex) => {
    const [preloadedImages, setPreloadedImages] = (0,r.useState)(new Set());
    
    (0,r.useEffect)(() => {
        if (!profiles || profiles.length === 0) return;
        
        const preloadNextImages = async () => {
            // Determina quais imagens pré-carregar (próximas 3)
            const imagesToPreload = [];
            const preloadCount = Math.min(3, profiles.length);
            
            for (let i = 1; i <= preloadCount; i++) {
                const nextIndex = (currentIndex + i) % profiles.length;
                const nextProfile = profiles[nextIndex];
                if (nextProfile?.image && !preloadedImages.has(nextProfile.image)) {
                    imagesToPreload.push(nextProfile.image);
                }
            }
            
            if (imagesToPreload.length > 0) {
                try {
                    await preloadImageBatch(imagesToPreload);
                    setPreloadedImages(prev => {
                        const newSet = new Set(prev);
                        imagesToPreload.forEach(img => newSet.add(img));
                        return newSet;
                    });
                } catch (error) {
                    console.warn('Preload error:', error);
                }
            }
        };
        
        // Debounce para evitar muitas chamadas
        const timeoutId = setTimeout(preloadNextImages, 100);
        return () => clearTimeout(timeoutId);
    }, [profiles, currentIndex, preloadedImages]);
    
    return { preloadedImages };
};

function S(){let{userImages:e,userName:t,premiumShown:s,setPremiumShown:m}=(0,p.a)(),{profiles:j}=(0,g.n)(),{toast:N}=(0,b.pm)(),[w,E]=(0,r.useState)(0),[Q,S]=(0,r.useState)(!1),[k,_]=(0,r.useState)("none"),[I,M]=(0,r.useState)(!1),[T,C]=(0,r.useState)(!1),[O,R]=(0,r.useState)([]),[Z,D]=(0,r.useState)(j),[P,z]=(0,r.useState)(!1),[J,U]=(0,r.useState)(0),[F,L]=(0,r.useState)(!1),[K,q]=(0,r.useState)(!1),[V,H]=(0,r.useState)([]),[W,Y]=(0,r.useState)(0),[G,X]=(0,r.useState)(null),[$,ee]=(0,r.useState)(0),[et,es]=(0,r.useState)(!1),[ea,er]=(0,r.useState)("heart"),[el,en]=(0,r.useState)(!1),ei=(0,r.useRef)(null),eo=localStorage.getItem("leadImage")||null,leadName=localStorage.getItem("leadName")||"Usuário";

// Implementa o pré-carregamento inteligente
const { preloadedImages } = useImagePreloader(Z, w);

// ADIÇÃO: Inicializa o sistema de áudio
const { audioReady } = useAudioPreloader();

// Bloquear zoom em dispositivos móveis
    (0,r.useEffect)(() => {
        if (!document.querySelector('meta[name="viewport"]')) {
            const metaViewport = document.createElement('meta');
            metaViewport.name = 'viewport';
            metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(metaViewport);
        }

        const style = document.createElement('style');
        style.textContent = `
            input, textarea, select {
                font-size: 16px !important;
                transform-origin: left top;
            }
            @media screen and (max-width: 768px) {
                input, textarea, select {
                    font-size: 16px !important;
                }
            }
        `;
        document.head.appendChild(style);

        const preventZoom = (e) => {
            if (e.touches.length > 1) e.preventDefault();
        };
        const preventDoubleTapZoom = (e) => e.preventDefault();

        document.addEventListener('touchstart', preventZoom, { passive: false });
        document.addEventListener('touchmove', preventZoom, { passive: false });
        document.addEventListener('gesturestart', preventDoubleTapZoom);
        document.addEventListener('gesturechange', preventDoubleTapZoom);
        document.addEventListener('gestureend', preventDoubleTapZoom);

        return () => {
            document.removeEventListener('touchstart', preventZoom);
            document.removeEventListener('touchmove', preventZoom);
            document.removeEventListener('gesturestart', preventDoubleTapZoom);
            document.removeEventListener('gesturechange', preventDoubleTapZoom);
            document.removeEventListener('gestureend', preventDoubleTapZoom);
        };
    }, []);

(0,r.useEffect)(()=>{let e=localStorage.getItem("viewedProfiles");e&&R(JSON.parse(e));let t=localStorage.getItem("likedProfiles");if(t){let e=JSON.parse(t);H(e),Y(e.length)}let s=localStorage.getItem("userBalance");s&&U(Number.parseFloat(s))},[]),(0,r.useEffect)(()=>{D(j.filter(e=>!O.includes(e.id)))},[j,O]),(0,r.useEffect)(()=>{"true"===localStorage.getItem("premiumShown")&&m(!0)},[m]);

// CORREÇÃO PRINCIPAL: Lógica de transição melhorada
const moveToNextProfile = () => {
    // Adiciona o perfil atual aos visualizados
    const currentProfile = Z[w];
    if (currentProfile) {
        const updatedViewed = [...O, currentProfile.id];
        R(updatedViewed);
        localStorage.setItem("viewedProfiles", JSON.stringify(updatedViewed));
        
        // Filtra os perfis disponíveis (remove os já visualizados)
        const availableProfiles = j.filter(profile => !updatedViewed.includes(profile.id));
        
        if (availableProfiles.length > 0) {
            // Atualiza a lista de perfis disponíveis
            D(availableProfiles);
            // Reseta o índice para 0 para mostrar o primeiro perfil disponível
            E(0);
        } else {
            // Se não há mais perfis, mostra a tela de limite
            S(true);
        }
    }
};

(0,r.useEffect)(()=>{
    if("right"===k||"left"===k){
        let e=setTimeout(()=>{
            if("right"===k){
                if(!K){
                    let e=Math.round(100*(8+7*Math.random()))/100;
                    ee(e),z(!0);
                    let t=J+e;
                    U(t),localStorage.setItem("userBalance",t.toString())
                }
            }
            
            // CORREÇÃO: Move para o próximo perfil imediatamente após a ação
            moveToNextProfile();
            _("none"),M(!1)
        },300);
        return()=>clearTimeout(e)
    }
},[k,w,Z,O,J,K,j]);

(0,r.useEffect)(()=>{if(et){let e=setTimeout(()=>{es(!1)},1e3);return()=>clearTimeout(e)}},[et]);let ec=e=>{return;},ed=()=>{return;};(0,r.useEffect)(()=>{return()=>{ei.current&&clearTimeout(ei.current)}},[]);let em=()=>{if(0===V.length){let e=Math.floor(Math.random()*j.length);return j[e].id}let e=Math.floor(Math.random()*V.length);return V[e]},eu=0===Z.length||w>=Z.length,ex=eu?null:Z[w];return(0,a.jsxs)("div",{className:"mobile-viewport bg-black flex flex-col overflow-hidden",children:[(0,a.jsxs)("header",{className:"absolute top-0 left-0 right-0 z-10 p-3 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pb-10",children:[(0,a.jsxs)("div",{className:"flex items-center",children:[(0,a.jsx)("div",{className:"h-10 w-10 rounded-full overflow-hidden bg-gray-800 mr-2 border border-primary-500/50",children:eo?(0,a.jsx)(h.default,{src:eo||"/placeholder.svg",alt:"Seu perfil",width:40,height:40,className:"object-cover w-full h-full"}):(0,a.jsx)("div",{className:"w-full h-full flex items-center justify-center text-primary-400",children:(0,a.jsx)(n.Z,{className:"h-5 w-5"})})}),(0,a.jsx)("span",{className:"text-white font-medium text-sm",children:leadName})]}),(0,a.jsxs)("button",{onClick:()=>L(!0),className:"px-3 py-1.5 flex items-center bg-gray-900/60 rounded-full border border-gray-800 hover:bg-gray-800/60 transition-colors",children:[(0,a.jsx)("span",{className:"text-sm text-gray-300 mr-1",children:"Seu saldo:"}),(0,a.jsxs)("span",{className:"text-sm font-bold text-white",children:["R$",J.toFixed(2)]})]})]}),(0,a.jsx)("main",{className:"flex-1 relative overflow-hidden flex flex-col",children:eu?(0,a.jsx)("div",{className:"flex-1 flex items-center justify-center p-6 pt-20",children:(0,a.jsxs)("div",{className:"text-center max-w-xs",children:[(0,a.jsx)("div",{className:"flex justify-center mb-4",children:(0,a.jsx)("div",{className:"h-16 w-16 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_0_15px_rgba(255,191,0,0.7)]",children:(0,a.jsx)(i.Z,{className:"h-8 w-8 text-gray-900"})})}),(0,a.jsx)("h2",{className:"text-2xl font-bold text-white mb-2",children:"Limite de Uso Atingido"}),(0,a.jsxs)("p",{className:"text-gray-400 mb-6",children:["Aumente a distância para encontrar mais"," ",(0,a.jsx)("span",{className:"text-amber-400 font-medium",children:"madames ricas"})," ","dispostas a te enviar PIX."]}),(0,a.jsxs)("div",{className:"bg-gray-900/60 rounded-lg p-3 mb-6 border border-amber-500/30",children:[(0,a.jsx)("p",{className:"text-sm text-amber-300 mb-2",children:"Com o Premium você tem acesso a:"}),(0,a.jsxs)("ul",{className:"text-sm text-white text-left space-y-2",children:[(0,a.jsxs)("li",{className:"flex items-center",children:[(0,a.jsx)("div",{className:"w-1.5 h-1.5 rounded-full bg-amber-400 mr-2"}),(0,a.jsx)("span",{children:"Perfis em um raio de até 100km"})]}),(0,a.jsxs)("li",{className:"flex items-center",children:[(0,a.jsx)("div",{className:"w-1.5 h-1.5 rounded-full bg-amber-400 mr-2"}),(0,a.jsx)("span",{children:"Conversas ilimitadas"})]}),(0,a.jsxs)("li",{className:"flex items-center",children:[(0,a.jsx)("div",{className:"w-1.5 h-1.5 rounded-full bg-amber-400 mr-2"}),(0,a.jsx)("span",{children:"Visualização de fotos e vídeos"})]})]})]}),(0,a.jsxs)(l.z,{onClick:()=>{window.location.href="https://go.frendz.com.br/rknfx"+window.location.search},className:"w-full py-6 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-gray-900 font-bold rounded-full shadow-[0_0_10px_rgba(255,191,0,0.5)] border border-amber-300/50",children:[(0,a.jsx)(o.Z,{className:"h-5 w-5 mr-2"})," DESBLOQUEAR PREMIUM"]}),(0,a.jsx)("p",{className:"text-xs text-gray-500 mt-4",children:"Pagamento único de R$ 19,90 - Sem renovação automática"})]})}):(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("div",{className:"relative h-full w-full ".concat((()=>{switch(k){case"right":return"animate-swipe-right";case"left":return"animate-swipe-left";default:return""}})()),children:[T&&(0,a.jsx)("div",{className:"absolute inset-0 bg-gray-900/70 z-10 flex items-center justify-center backdrop-blur-sm",children:(0,a.jsx)("div",{className:"w-12 h-12 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"})}),(0,a.jsx)(h.default,{src:(null==ex?void 0:ex.image)||"/placeholder.svg",alt:(null==ex?void 0:ex.name)||"",fill:!0,className:"object-cover",priority:!0,onLoadingComplete:()=>C(!1),placeholder:"blur",blurDataURL:"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAIAAoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN1dnd4eXqgoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsLExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+Pz9nf9mfwD8Qvgz4P8WeJtM1GfxJrVrd3N81rqt3p8Bl+23tuBHBZTwRKqwJCpKxhmLO7EkYA/Qa/wD2Vfgj/wA+fiD/AMKnVP8A5W0UVtKpJttt7t/mfGYTLMHQo0qdOlZQhGK96o9Ekv8Ap4//2Q==",
                // MELHORIA: Adiciona loading otimizado para mobile
                loading: preloadedImages.has((null==ex?void 0:ex.image)) ? 'eager' : 'lazy',
                sizes: "(max-width: 768px) 100vw, 50vw"
            }),(0,a.jsxs)("div",{className:"absolute top-16 left-0 right-0 p-0",children:[(0,a.jsx)("div",{className:"flex justify-end"}),(0,a.jsx)("div",{className:"w-full h-px bg-white/30 mt-0"})]}),(0,a.jsxs)("div",{className:"absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent pt-16 pb-8",children:[(0,a.jsxs)("div",{className:"flex items-center mb-1",children:[(0,a.jsxs)("h2",{className:"text-2xl font-bold text-white mr-2",children:[null==ex?void 0:ex.name,", ",null==ex?void 0:ex.age]}),(null==ex?void 0:ex.online)&&(0,a.jsx)("span",{className:"h-2 w-2 rounded-full bg-green-500"})]}),(0,a.jsxs)("div",{className:"flex items-center mb-2 text-gray-300",children:[(0,a.jsx)(c.Z,{className:"h-4 w-4 mr-1 text-primary-400"}),(0,a.jsxs)("span",{className:"text-sm",children:["a ",null==ex?void 0:ex.distance,"km de você"]})]}),(0,a.jsx)("div",{className:"flex flex-wrap gap-2 mb-2",children:null==ex?void 0:ex.interests.map(e=>(0,a.jsx)("span",{className:"px-3 py-1 bg-black/60 text-white rounded-full text-sm",children:e},e))}),(0,a.jsx)("p",{className:"text-white mb-8 text-sm",children:null==ex?void 0:ex.bio}),(0,a.jsxs)("div",{className:"flex justify-center items-center mb-2 gap-4",children:[(0,a.jsx)(l.z,{variant:"outline",size:"icon",className:"h-10 w-10 rounded-full bg-gray-900/60 border-none hover:bg-gray-800/60 cursor-not-allowed opacity-70",onClick:()=>{w>0&&!I&&E(w-1)},disabled:!0,children:(0,a.jsx)(d.Z,{className:"h-5 w-5 text-blue-300"})}),(0,a.jsx)("button",{type:"button",className:"h-14 w-14 rounded-full bg-primary-500 border-none text-white hover:bg-primary-600 flex items-center justify-center",onClick:()=>{if(s){S(!0);return}if(I)return;M(!0),_("right"),er("heart"),es(!0);let e=[...V,Z[w].id];H(e),localStorage.setItem("likedProfiles",JSON.stringify(e));let t=W+1;Y(t),5===t&&(X(em()),setTimeout(()=>{q(!0)},500))},disabled:I,children:(0,a.jsx)(u,{className:"h-8 w-8 fill-current"})}),(0,a.jsx)(l.z,{variant:"outline",size:"icon",className:"h-10 w-10 rounded-full bg-gray-900/60 border-none hover:bg-gray-800/60",onClick:()=>{I||(M(!0),_("left"),er("x"),es(!0))},disabled:I,children:(0,a.jsx)(x.Z,{className:"h-5 w-5 text-red-500"})})]})]})]}),et&&(0,a.jsx)("div",{className:"fixed inset-0 pointer-events-none z-50 flex items-center justify-center",children:(0,a.jsx)("div",{className:"absolute top-1/2 left-1/2 animate-float-emoji",children:(0,a.jsx)("span",{className:"text-7xl",children:"heart"===ea?"❤️":"❌"})})})]})}),(0,a.jsx)(v,{isOpen:P,onClose:()=>{z(!1)},amount:$}),(0,a.jsx)(B,{isOpen:K,onClose:()=>{q(!1);
// CORREÇÃO: Remove a lógica de incremento manual do índice
// A função moveToNextProfile já cuida da transição
},userImage:eo,matchProfileId:G||14}),(0,a.jsx)(y.Y,{isOpen:F,onClose:()=>L(!1),balance:J,onShowPremium:()=>S(!0)}),(0,a.jsx)(f.J,{isOpen:Q,onClose:()=>{S(!1);
// CORREÇÃO: Remove a lógica de incremento manual do índice
// A função moveToNextProfile já cuida da transição
}})]})}},6944:function(e,t,s){"use strict";s.d(t,{pm:function(){return u}});var a=s(7174);let r=0,l=new Map,n=e=>{if(l.has(e))return;let t=setTimeout(()=>{l.delete(e),d({type:"REMOVE_TOAST",toastId:e})},1e6);l.set(e,t)},i=(e,t)=>{switch(t.type){case"ADD_TOAST":return{...e,toasts:[t.toast,...e.toasts].slice(0,1)};case"UPDATE_TOAST":return{...e,toasts:e.toasts.map(e=>e.id===t.toast.id?{...e,...t.toast}:e)};case"DISMISS_TOAST":{let{toastId:s}=t;return s?n(s):e.toasts.forEach(e=>{n(e.id)}),{...e,toasts:e.toasts.map(e=>e.id===s||void 0===s?{...e,open:!1}:e)}}case"REMOVE_TOAST":if(void 0===t.toastId)return{...e,toasts:[]};return{...e,toasts:e.toasts.filter(e=>e.id!==t.toastId)}}},o=[],c={toasts:[]};function d(e){c=i(c,e),o.forEach(e=>{e(c)})}function m(e){let{...t}=e,s=(r=(r+1)%Number.MAX_SAFE_INTEGER).toString(),a=()=>d({type:"DISMISS_TOAST",toastId:s});return d({type:"ADD_TOAST",toast:{...t,id:s,open:!0,onOpenChange:e=>{e||a()}}}),{id:s,dismiss:a,update:e=>d({type:"UPDATE_TOAST",toast:{...e,id:s}})}}function u(){let[e,t]=a.useState(c);return a.useEffect(()=>(o.push(t),()=>{let e=o.indexOf(t);e>-1&&o.splice(e,1)}),[e]),{...e,toast:m,dismiss:e=>d({type:"DISMISS_TOAST",toastId:e})}}},9599:function(e,t,s){"use strict";s.d(t,{Z:function(){return a}});let a=(0,s(5852).Z)("Crown",[["path",{d:"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",key:"1vdc57"}],["path",{d:"M5 21h14",key:"11awu3"}]])},2192:function(e,t,s){"use strict";s.d(t,{Z:function(){return a}});let a=(0,s(5852).Z)("MapPin",[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",key:"1r0f0z"}],["circle",{cx:"12",cy:"10",r:"3",key:"ilqhr7"}]])},8273:function(e,t,s){"use strict";s.d(t,{Z:function(){return a}});let a=(0,s(5852).Z)("MessageCircle",[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z",key:"vv11sd"}]])}},function(e){e.O(0,[112,122,471,859,553,923,744],function(){return e(e.s=3318)}),_N_E=e.O()}]);

