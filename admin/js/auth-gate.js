/**
 * Madames Online - Admin Auth Gate
 *
 * Proteção simples de acesso ao painel. Não é um sistema de autenticação real
 * (não há backend/servidor de auth aqui, é um site estático) — é uma barreira
 * para impedir que qualquer pessoa que descubra a URL do /admin veja dados
 * de clientes ou consiga apagar o banco de produção sem saber a senha.
 *
 * A senha nunca fica em texto puro no código: comparamos o hash SHA-256 dela.
 * Para trocar a senha, gere um novo hash (ex: no console do navegador rode
 * `crypto.subtle.digest('SHA-256', new TextEncoder().encode('nova-senha'))`
 * e converta o resultado para hex) e substitua ADMIN_PASSWORD_HASH abaixo.
 */
(function () {
  'use strict';

  var ADMIN_PASSWORD_HASH = 'e5f6d6aab0ee3f65995f17688c5687eca1c73e5b3a0a651b31f45a15be5116b7';
  var SESSION_KEY = 'madames_admin_authed';

  function alreadyAuthed() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function markAuthed() {
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch (e) { /* ignora se storage bloqueado */ }
  }

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var bytes = Array.from(new Uint8Array(buf));
      return bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'admin-auth-gate';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999', 'background:#0a0a0a',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif'
    ].join(';');

    overlay.innerHTML =
      '<form id="admin-auth-form" style="background:rgba(20,20,25,0.9);border:1px solid rgba(255,255,255,0.1);' +
      'border-radius:16px;padding:32px;width:min(90vw,340px);text-align:center;">' +
      '<div style="font-size:2rem;margin-bottom:8px;">🔒</div>' +
      '<h1 style="color:#fff;font-size:1.1rem;margin:0 0 20px;">Acesso restrito</h1>' +
      '<input type="password" id="admin-auth-input" placeholder="Senha do painel" autocomplete="current-password" ' +
      'style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);' +
      'background:rgba(255,255,255,0.05);color:#fff;font-size:0.95rem;box-sizing:border-box;outline:none;" />' +
      '<p id="admin-auth-error" style="color:#f87171;font-size:0.8rem;min-height:18px;margin:8px 0 4px;"></p>' +
      '<button type="submit" style="width:100%;margin-top:8px;padding:12px;border-radius:10px;border:none;' +
      'background:#ec4899;color:#fff;font-weight:600;font-size:0.95rem;cursor:pointer;">Entrar</button>' +
      '</form>';

    return overlay;
  }

  function init() {
    if (alreadyAuthed()) return;

    // Esconde o conteúdo real até autenticar
    var style = document.createElement('style');
    style.textContent = 'body > *:not(#admin-auth-gate){visibility:hidden!important;}';
    document.head.appendChild(style);

    var overlay = buildOverlay();
    document.body.appendChild(overlay);

    var form = document.getElementById('admin-auth-form');
    var input = document.getElementById('admin-auth-input');
    var errorEl = document.getElementById('admin-auth-error');
    input.focus();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sha256Hex(input.value).then(function (hash) {
        if (hash === ADMIN_PASSWORD_HASH) {
          markAuthed();
          style.remove();
          overlay.remove();
        } else {
          errorEl.textContent = 'Senha incorreta.';
          input.value = '';
          input.focus();
        }
      });
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
