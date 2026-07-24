// ===== Avito Parser PRO — Telegram Mini App =====
// Работает автономно на GitHub Pages без бэкенда.
// Настройки сохраняются в localStorage + отправляются боту через sendData().

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const userId = tg?.initDataUnsafe?.user?.id || 0;
const userName = tg?.initDataUnsafe?.user?.first_name || '';
const STORAGE_KEY = 'avito_parser_config';

// ===== Определяем, есть ли локальный API =====
let API_BASE = null; // null = оффлайн режим (GitHub Pages)

async function detectAPI() {
  // Проверяем, доступен ли локальный сервер (только если мы на localhost)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    API_BASE = '';
    return;
  }
  // С GitHub Pages пробуем достучаться до localhost (работает только на том же ПК)
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1500);
    const res = await fetch('http://localhost:8080/api/config?user_id=0', { signal: controller.signal });
    if (res.ok) { API_BASE = 'http://localhost:8080'; return; }
  } catch (e) { /* не доступен */ }
  API_BASE = null; // оффлайн
}

// ===== localStorage =====
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { return {}; }
}
function saveLocal(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

// ===== Переключение вкладок =====
function switchTab(tabId, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  const t = document.getElementById('tab-' + tabId);
  if (t) t.classList.add('active');
  if (tabId === 'leads') loadLeads();
}

// ===== Загрузка конфига =====
async function loadConfig() {
  await detectAPI();

  const badge = document.getElementById('sub-badge');
  const subTitle = document.getElementById('sub-title');
  const subIcon = document.getElementById('sub-icon');
  const subDesc = document.getElementById('sub-desc');
  const connStatus = document.getElementById('conn-status');

  if (API_BASE !== null) {
    // Онлайн — загружаем с сервера
    connStatus.textContent = '🟢 Подключён к ПК';
    connStatus.className = 'conn-badge conn-online';
    try {
      const res = await fetch(API_BASE + '/api/config?user_id=' + userId);
      const data = await res.json();
      const cfg = data.config || {};
      fillForm(cfg);
      saveLocal(cfg); // кешируем

      if (data.is_sub_active) {
        badge.textContent = '🟢 Подписка активна';
        badge.className = 'badge badge-active';
        subIcon.textContent = '🟢';
        subTitle.textContent = 'Подписка активна!';
        subDesc.textContent = 'До: ' + (data.sub_expires_at ? data.sub_expires_at.slice(0,10) : 'Бессрочно');
      } else {
        badge.textContent = '🔴 Нет подписки';
        badge.className = 'badge badge-inactive';
        subIcon.textContent = '🔴';
        subTitle.textContent = 'Подписка не активна';
        subDesc.textContent = 'Активируйте промокод через бота командой /promo';
      }
    } catch(e) {
      connStatus.textContent = '⚪ Оффлайн';
      connStatus.className = 'conn-badge conn-offline';
      fillForm(loadLocal());
    }
  } else {
    // Оффлайн — загружаем из localStorage
    connStatus.textContent = '📱 Автономный режим';
    connStatus.className = 'conn-badge conn-offline';
    fillForm(loadLocal());
    badge.textContent = userName ? ('👋 ' + userName) : '📱 Mini App';
    badge.className = 'badge badge-active';
    subIcon.textContent = '📱';
    subTitle.textContent = 'Автономный режим';
    subDesc.textContent = 'Настройки сохраняются локально и отправляются боту при сохранении.';
  }
}

function fillForm(cfg) {
  if (!cfg) return;
  document.getElementById('urls-input').value = (cfg.urls || []).join('\n');
  document.getElementById('min-price').value = cfg.min_price || 0;
  document.getElementById('max-price').value = cfg.max_price || 99999999;
  document.getElementById('count-page').value = cfg.count || 1;
  document.getElementById('max-age').value = cfg.max_age || 0;
  document.getElementById('max-age-unit').value = cfg.max_age_unit || 'minutes';
  document.getElementById('reserv-mode').value = cfg.reserv_mode || 'ignore';
  document.getElementById('only-discount').checked = !!cfg.only_with_discount;
  document.getElementById('only-photo').checked = !!cfg.only_with_photo;
  document.getElementById('white-list').value = (cfg.keys_word_white_list || []).join('\n');
  document.getElementById('black-list').value = (cfg.keys_word_black_list || []).join('\n');
}

function collectForm() {
  return {
    user_id: userId,
    urls: document.getElementById('urls-input').value.split('\n').filter(u => u.trim()),
    min_price: parseInt(document.getElementById('min-price').value) || 0,
    max_price: parseInt(document.getElementById('max-price').value) || 99999999,
    count: parseInt(document.getElementById('count-page').value) || 1,
    max_age: parseInt(document.getElementById('max-age').value) || 0,
    max_age_unit: document.getElementById('max-age-unit').value,
    reserv_mode: document.getElementById('reserv-mode').value,
    only_with_discount: document.getElementById('only-discount').checked,
    only_with_photo: document.getElementById('only-photo').checked,
    keys_word_white_list: document.getElementById('white-list').value.split('\n').filter(w => w.trim()),
    keys_word_black_list: document.getElementById('black-list').value.split('\n').filter(b => b.trim()),
  };
}

// ===== Сохранение =====
async function saveSettings() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  const payload = collectForm();
  saveLocal(payload); // всегда кешируем локально

  let saved = false;

  // Попытка 1: отправить на локальный API (если доступен)
  if (API_BASE !== null) {
    try {
      const res = await fetch(API_BASE + '/api/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) saved = true;
    } catch(e) { /* API недоступен */ }
  }

  // Попытка 2: отправить через Telegram WebApp sendData (если открыто в Telegram)
  if (!saved && tg && tg.sendData) {
    try {
      tg.sendData(JSON.stringify({ action: 'save_config', ...payload }));
      // sendData закроет Mini App — это нормальное поведение Telegram
      return;
    } catch(e) { /* не удалось */ }
  }

  if (saved) {
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    btn.textContent = '✅ Сохранено!';
  } else {
    btn.textContent = '💾 Сохранено локально';
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Сохранить настройки'; }, 2000);
}

// ===== Лиды =====
async function loadLeads() {
  const box = document.getElementById('leads-container');

  if (API_BASE === null) {
    box.innerHTML = '<div class="empty-state">📱 Лиды доступны при подключении к ПК или через сообщения бота.</div>';
    return;
  }

  box.innerHTML = '<div class="empty-state">⏳ Загрузка...</div>';
  try {
    const res = await fetch(API_BASE + '/api/leads?user_id=' + userId);
    const data = await res.json();
    const leads = data.leads || [];
    if (!leads.length) {
      box.innerHTML = '<div class="empty-state">Объявлений пока нет. Запустите парсер на ПК.</div>';
      return;
    }
    box.innerHTML = '';
    leads.forEach(l => {
      const el = document.createElement('div');
      el.className = 'lead-item';
      el.innerHTML =
        '<a href="' + (l.url||'#') + '" target="_blank" class="lead-title">' + (l.title || 'Объявление') + '</a>' +
        '<div class="lead-price">' + (l.price ? Number(l.price).toLocaleString('ru-RU') + ' ₽' : '—') + '</div>' +
        '<div class="lead-meta">📍 ' + (l.location || '—') + '</div>';
      box.appendChild(el);
    });
  } catch(e) {
    box.innerHTML = '<div class="empty-state">Не удалось загрузить лиды.</div>';
  }
}

// ===== Промокод =====
async function redeemPromo() {
  const input = document.getElementById('promo-input');
  const result = document.getElementById('promo-result');
  const code = input.value.trim();
  if (!code) return;

  // Через API
  if (API_BASE !== null) {
    try {
      const res = await fetch(API_BASE + '/api/redeem_promo', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({user_id: userId, code: code})
      });
      const data = await res.json();
      result.style.color = data.ok ? '#10B981' : '#EF4444';
      result.textContent = data.message;
      if (data.ok) { input.value = ''; loadConfig(); }
      return;
    } catch(e) {}
  }

  // Через sendData
  if (tg && tg.sendData) {
    tg.sendData(JSON.stringify({ action: 'redeem_promo', user_id: userId, code: code }));
    return;
  }

  result.style.color = '#EF4444';
  result.textContent = 'Используйте команду /promo ' + code + ' в боте.';
}

document.addEventListener('DOMContentLoaded', loadConfig);
