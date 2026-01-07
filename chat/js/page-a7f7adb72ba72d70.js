(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[929],{4449:function(e,t,r){Promise.resolve().then(r.bind(r,6756))},6756:function(e,t,r){"use strict";r.r(t),r.d(t,{default:function(){return C}});var a=r(6102),s=r(3906),l=r(8492),i=r(9568),n=r(9918),o=r(1047),c=r(1227),d=r(7693),m=r(1277),x=r(7174),u=r(3557),h=r(9183);let p=x.forwardRef((e,t)=>{let{className:r,children:s,...l}=e;return(0,a.jsxs)(u.fC,{ref:t,className:(0,h.cn)("relative overflow-hidden",r),...l,children:[(0,a.jsx)(u.l_,{className:"h-full w-full rounded-[inherit]",children:s}),(0,a.jsx)(f,{}),(0,a.jsx)(u.Ns,{})]})});p.displayName=u.fC.displayName;let f=x.forwardRef((e,t)=>{let{className:r,orientation:s="vertical",...l}=e;return(0,a.jsx)(u.gb,{ref:t,orientation:s,className:(0,h.cn)("flex touch-none select-none transition-colors","vertical"===s&&"h-full w-2.5 border-l border-l-transparent p-[1px]","horizontal"===s&&"h-2.5 flex-col border-t border-t-transparent p-[1px]",r),...l,children:(0,a.jsx)(u.q4,{className:"relative flex-1 rounded-full bg-border"})})});f.displayName=u.gb.displayName;var g=r(3727),b=r(4880),j=r(6627),y=r(4665),N=r(4432),v=r(2821);function w(e){let{avatar:t,name:r,audioUrl:s,isLastAudio:i=!1,onAudioPlayStarted:l}=e,[n,c]=(0,x.useState)(!1),[d,u]=(0,x.useState)(!1),{setPremiumShown:h}=(0,v.a)(),[p,f]=(0,x.useState)(!1),g=(0,x.useRef)(null),audioRef=(0,x.useRef)(null),notifiedRef=(0,x.useRef)(!1);const b=()=>{let e=document.getElementsByTagName("audio");for(let t=0;t<e.length;t++)e[t].pause();g.current&&clearTimeout(g.current);g.current=null;u(!1);if(audioRef.current){audioRef.current.pause()}};(0,x.useEffect)(()=>()=>{g.current&&clearTimeout(g.current);if(audioRef.current){audioRef.current.pause();audioRef.current=null}},[]);const audioHeights=(0,x.useMemo)(()=>Array.from({length:20},()=>4+Math.floor(Math.random()*20)),[]);return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("div",{className:"flex items-center bg-white text-gray-900 rounded-xl p-2 max-w-[80%]",children:[(0,a.jsxs)("div",{className:"relative",children:[(0,a.jsxs)(m.qE,{className:"h-10 w-10 mr-2",children:[(0,a.jsx)(m.F$,{src:t||"/placeholder.svg",alt:r}),(0,a.jsx)(m.Q5,{className:"bg-primary-900 text-white",children:(0,a.jsx)(o.Z,{className:"h-5 w-5"})})]}),(0,a.jsx)("div",{className:"absolute bottom-0 right-2 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white"})]}),(0,a.jsx)("button",{onClick:()=>{if(s){if(d){b()}else{if(!audioRef.current){audioRef.current=new Audio(s);audioRef.current.onplay=()=>{u(!0);i&&!notifiedRef.current&&(notifiedRef.current=!0,f(!0),l&&l())};audioRef.current.onended=()=>{u(!1);audioRef.current.currentTime=0}}audioRef.current.play().catch(e=>{console.error("Erro ao reproduzir áudio:",e);u(!1)})}}else{h(!0);localStorage.setItem("premiumShown","true");c(!0)}},className:"h-10 w-10 rounded-full bg-primary-500 flex items-center justify-center mr-2 flex-shrink-0",children:d?(0,a.jsx)(j.Z,{className:"h-5 w-5 text-white"}):(0,a.jsx)(y.Z,{className:"h-5 w-5 text-white fill-current"})}),(0,a.jsxs)("div",{className:"flex flex-col flex-1 min-w-0",children:[(0,a.jsx)("span",{className:"text-xs text-gray-600 mb-1",children:"Mensagem de voz"}),(0,a.jsx)("div",{className:"flex items-center",children:(0,a.jsx)("div",{className:"flex-1 h-8",children:(0,a.jsx)("div",{className:"flex items-center h-full space-x-[2px]",children:audioHeights.map((h,t)=>(0,a.jsx)("div",{style:{height:"".concat(h,"px"),backgroundColor:d?"":"#9ca3af"},className:"w-[2px] rounded-full ".concat(d?t%2==0?"bg-primary-500 animate-pulse":"bg-primary-400 animate-pulse":"")},t))})})})]})]}),(0,a.jsx)(N.J,{isOpen:n,onClose:()=>c(!1)})]})}var S=r(3715);function C(){let e=(0,g.useSearchParams)().get("profile_id"),t=e?Number.parseInt(e,10):null,{getProfileById:r}=(0,b.n)(),{setPremiumShown:u}=(0,v.a)(),[h,f]=(0,x.useState)(null),[j,y]=(0,x.useState)([]),[C,T]=(0,x.useState)(""),[k,_]=(0,x.useState)(!0),[E,z]=(0,x.useState)("Gravando áudio"),[R,I]=(0,x.useState)(!1),O=(0,x.useRef)(null),[Z,A]=(0,x.useState)(0),[M,q]=(0,x.useState)(!1),[vipUnlocked,setVipUnlocked]=(0,x.useState)(!1),[F,L]=(0,x.useState)([]);

// Prevenção de zoom em dispositivos móveis
(0,x.useEffect)(()=>{
// Adiciona meta tag viewport se não existir
if (!document.querySelector('meta[name="viewport"]')) {
const metaViewport = document.createElement('meta');
metaViewport.name = 'viewport';
metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
document.head.appendChild(metaViewport);
}

// Adiciona CSS para prevenir zoom em inputs
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
header {
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 1000;
  background-color: black; /* Adicionado para garantir que o fundo seja preto */
}
main {
  padding-top: 70px; /* Adiciona espaço para compensar o header fixo */
}
/* Ajustar apenas o botão de enviar para ter a mesma altura da barra de digitação */
.flex.gap-2.pb-safe button {
  height: 48px !important; /* Altura para corresponder ao input padrão */
  width: 48px !important;
  flex-shrink: 0;
}
`;
document.head.appendChild(style);

// Previne zoom por gestos
const preventZoom = (e) => {
if (e.touches.length > 1) {
e.preventDefault();
}
};

const preventDoubleTapZoom = (e) => {
e.preventDefault();
};

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
},[]);

(0,x.useEffect)(()=>{u(!0);localStorage.setItem("premiumShown","true");let e=localStorage.getItem("userBalance");e&&A(Number.parseFloat(e))},[u]),(0,x.useEffect)(()=>{if(t){let e=r(t);e&&f(e)}},[t,r]);let U=e=>{let t={...e,id:Date.now().toString(),time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};y(e=>[...e,t]),setTimeout(()=>{if(O.current){let e=O.current.querySelector("[data-radix-scroll-area-viewport]");e&&(e.scrollTop=e.scrollHeight)}},100)},$=()=>{setTimeout(()=>{U({sender:"other",type:"gift",content:"".concat(h.name," te enviou um presente de R$50,00")})},5e3)};(0,x.useEffect)(()=>{let e=setTimeout(()=>{z("Online"),_(!1),U({sender:"other",type:"audio",content:"Mensagem de áudio",audioUrl:"https://opoderdaoracao.vercel.app/001.mp3"})},5e3);return()=>clearTimeout(e)},[]);let P=e=>{let{content:t,onClick:r,messageId:s}=e,l=t.split("te enviou um presente de")[0].trim(),n=F.includes(s);return(0,a.jsxs)("div",{className:"flex flex-col bg-gradient-to-r ".concat(n?"from-gray-700/30 to-gray-800/30 border-gray-600/50 cursor-default":"from-amber-500/30 to-amber-600/30 border-amber-500/50 cursor-pointer hover:bg-amber-500/40"," rounded-lg p-4 max-w-[80%] border transition-colors shadow-[0_0_15px_rgba(255,191,0,0.2)]"),onClick:()=>{if(n)return;let e=Z+50;A(e),localStorage.setItem("userBalance",e.toString()),L(e=>[...e,s]),q(!0),setVipUnlocked(!0)},children:[(0,a.jsxs)("div",{className:"flex flex-col items-center mb-3",children:[(0,a.jsx)("div",{className:"mb-2 ".concat(n?"bg-gradient-to-br from-gray-400 to-gray-600":"bg-gradient-to-br from-amber-400 to-amber-600"," p-2 rounded-full shadow-[0_0_10px_rgba(255,191,0,0.5)]"),children:(0,a.jsx)(i.Z,{className:"h-5 w-5 text-white"})}),(0,a.jsx)("div",{children:(0,a.jsxs)("span",{className:"text-white text-sm",children:[l," te enviou um presente"]})})]}),(0,a.jsx)("div",{className:"".concat(n?"bg-black/20":"bg-black/30"," rounded-lg p-3 mb-2 border ").concat(n?"border-gray-600/30":"border-amber-500/30"," flex items-center justify-center"),children:(0,a.jsx)("span",{className:"".concat(n?"text-gray-400":"text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-500 to-amber-300"," text-2xl font-bold"),children:"R$50,00"})}),(0,a.jsx)("div",{className:"flex justify-center",children:(0,a.jsx)("span",{className:"text-sm font-medium ".concat(n?"bg-gray-700 text-gray-300":"bg-white text-gray-900 animate-pulse"," px-4 py-1.5 rounded-full border ").concat(n?"border-gray-600/30":"border-amber-500/30"),children:n?"Resgatado":"Clique para resgatar"})})]})};return h?(0,a.jsxs)("div",{className:"mobile-viewport bg-black flex flex-col",children:[(0,a.jsxs)("header",{className:"p-3 border-b border-gray-800 flex justify-between items-center",children:[(0,a.jsxs)("div",{className:"flex items-center",children:[(0,a.jsx)(d.default,{href:"/discover",children:(0,a.jsx)(s.z,{variant:"ghost",size:"icon",className:"text-primary-400 hover:text-primary-300 hover:bg-gray-800 mr-2",children:(0,a.jsx)(n.Z,{className:"h-5 w-5"})})}),(0,a.jsxs)(m.qE,{className:"h-10 w-10 mr-3",children:[(0,a.jsx)(m.F$,{src:h.image||"/placeholder.svg",alt:h.name}),(0,a.jsx)(m.Q5,{className:"bg-primary-900 text-white",children:(0,a.jsx)(o.Z,{className:"h-5 w-5"})})]}),(0,a.jsxs)("div",{className:"flex flex-col",children:[(0,a.jsx)("span",{className:"font-medium text-white text-lg",children:h.name}),(0,a.jsx)("span",{className:"text-xs text-green-500",children:E})]})]}),(0,a.jsxs)("button",{onClick:()=>q(!0),className:"px-3 py-1.5 flex items-center bg-gray-900/60 rounded-full border border-gray-800 hover:bg-gray-800/60 transition-colors",children:[(0,a.jsx)("span",{className:"text-sm text-gray-300 mr-1",children:"Seu saldo:"}),(0,a.jsxs)("span",{className:"text-sm font-bold text-white",children:["R$",Z.toFixed(2)]})]})]}),(0,a.jsxs)("main",{className:"flex-1 flex flex-col overflow-hidden",children:[(0,a.jsx)(p,{className:"flex-1 p-3",ref:O,children:(0,a.jsx)("div",{className:"space-y-4",children:j.map(e=>"text"===e.type?(0,a.jsx)("div",{className:"flex ".concat("me"===e.sender?"justify-end":"justify-start"),children:(0,a.jsxs)("div",{className:"max-w-[80%] rounded-2xl px-4 py-2 ".concat("me"===e.sender?"bg-primary-500 text-white":"bg-gray-800 text-gray-200"),children:[(0,a.jsx)("p",{children:e.content}),(0,a.jsx)("p",{className:"text-xs mt-1 ".concat("me"===e.sender?"text-primary-200":"text-gray-400"),children:e.time})]})},e.id):"audio"===e.type?(0,a.jsx)("div",{className:"flex justify-start",children:(0,a.jsx)(w,{avatar:h.image,name:h.name,audioUrl:e.audioUrl,isLastAudio:e.isLastAudio,onAudioPlayStarted:e.isLastAudio?$:void 0})},e.id):"gift"===e.type?(0,a.jsx)("div",{className:"flex justify-start",children:(0,a.jsx)(P,{content:e.content,onClick:()=>I(!0),messageId:e.id})},e.id):null)})}),(0,a.jsxs)("div",{className:"p-3 border-t border-gray-800 flex gap-2 pb-safe",children:[(0,a.jsx)(l.I,{placeholder:vipUnlocked?"Libere o acesso VIP para continuar...":"Digite sua mensagem...",className:"bg-gray-900 border-gray-800 text-white",value:C,onChange:e=>T(e.target.value),disabled:k,style:{fontSize:"16px"}}),(0,a.jsx)(s.z,{size:"icon",className:vipUnlocked?"text-white h-10 w-10 font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 shadow-[0_0_10px_rgba(255,191,0,0.5)] border border-amber-300 transition-colors":"text-white h-10 w-10 bg-primary-500 hover:bg-primary-600",onClick:()=>{if(vipUnlocked){setVipUnlocked(!0),I(!0)}else{if(!C.trim()||k)return;U({sender:"me",type:"text",content:C}),T(""),_(!0),setTimeout(()=>{z("Gravando áudio")},1e3);let e=setTimeout(()=>{U({sender:"other",type:"audio",content:"Mensagem de áudio",audioUrl:"https://opoderdaoracao.vercel.app/002.mp3"});let e=setTimeout(()=>(z("Online"),U({sender:"other",type:"audio",content:"Mensagem de áudio",audioUrl:"https://opoderdaoracao.vercel.app/003.mp3",isLastAudio:!0}),()=>clearTimeout(e)),1e4);return()=>clearTimeout(e)},5e3);return()=>clearTimeout(e)}},disabled:!vipUnlocked&&(k||!C.trim()),children:vipUnlocked?(0,a.jsx)("span",{style:{fontSize:"20px"},children:(0,a.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"currentColor",style:{width:"24px",height:"24px"},children:(0,a.jsx)("path",{d:"M5 16h14l2-9-5 3-4-6-4 6-5-3 2 9zm0 2v2h14v-2H5z"})})}):(0,a.jsx)(c.Z,{className:"text-white",style:{width:"24px",height:"24px"}})})]})]}),(0,a.jsx)(N.J,{isOpen:R,onClose:()=>I(!1)}),(0,a.jsx)(S.Y,{isOpen:M,onClose:()=>q(!1),balance:Z,onShowPremium:()=>I(!0)})]}):(0,a.jsx)("div",{className:"mobile-viewport bg-black flex flex-col items-center justify-center p-4",children:(0,a.jsxs)("div",{className:"text-center",children:[(0,a.jsx)("h2",{className:"text-xl font-bold text-white mb-4",children:"Nenhum chat selecionado"}),(0,a.jsx)("p",{className:"text-gray-400 mb-6",children:"Selecione um chat para começar a conversar"}),(0,a.jsx)(s.z,{asChild:!0,className:"bg-primary-500 hover:bg-primary-600",children:(0,a.jsx)(d.default,{href:"/discover",children:"Voltar para descobrir"})})]})})}}},function(e){e.O(0,[112,693,471,234,859,553,923,744],function(){return e(e.s=4449)}),_N_E=e.O()}]);

