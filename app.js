// ===== Avito Parser PRO — Telegram Mini App =====
// Подключается к боту на ПК через Cloudflare Tunnel / Localhost / Telegram WebApp sendData

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const isTgWebApp = !!(window.Telegram?.WebApp?.initDataUnsafe?.user?.id);

function resolveUserId() {
  try {
    // 1. Внутри Telegram на смартфоне — 100% строгая изоляция по данным Telegram SDK
    const fromTg = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (fromTg) {
      return parseInt(fromTg);
    }
    // 2. В ссылке передан персональный user_id от бота
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('user_id');
    if (fromUrl) {
      return parseInt(fromUrl);
    }
    // 3. Только на ПК в обычном браузере — локально выбранный аккаунт для администрирования
    const fromStorage = localStorage.getItem('desktop_admin_selected_user_id');
    if (fromStorage) {
      return parseInt(fromStorage);
    }
  } catch (e) {}
  return 0;
}

let userId = resolveUserId();
const userName = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || '';
const STORAGE_KEY = 'avito_parser_config';

async function updateUserIdDisplay() {
  const displayEl = document.getElementById('user-id-display');
  const dropdownEl = document.getElementById('user-selector-dropdown');
  const changeBtn = document.getElementById('change-user-btn');
  const pcBar = document.getElementById('pc-api-setup-bar');
  const pcStatus = document.getElementById('pc-api-status-label');
  const pcInput = document.getElementById('pc-api-url-input');

  if (isTgWebApp) {
    // На смартфоне в Telegram — строго фиксированный профиль текущего пользователя
    if (displayEl) displayEl.textContent = userId + (userName ? ' (' + userName + ')' : '');
    if (dropdownEl) dropdownEl.style.display = 'none';
    if (changeBtn) changeBtn.style.display = 'none';
    if (pcBar) pcBar.style.display = 'none';
  } else {
    // На ПК в обычном браузере — админ-режим со списком пользователей
    if (displayEl) displayEl.textContent = userId ? userId : 'Не выбран';
    if (changeBtn) changeBtn.style.display = 'inline-block';
    
    // Показываем панель подключения к серверу
    if (pcBar) pcBar.style.display = 'flex';
    
    const targetApi = getTargetApi();
    if (pcInput && !pcInput.value) {
      pcInput.value = localStorage.getItem('desktop_admin_custom_api_url') || '';
    }

    if (targetApi !== null) {
      if (pcStatus) {
        pcStatus.textContent = '🟢 Подключен ' + (targetApi === '' ? '(Localhost)' : '(Туннель)');
        pcStatus.style.color = 'var(--success-color)';
      }
      if (dropdownEl) {
        try {
          const url = (targetApi === '') ? '/api/users' : (targetApi + '/api/users');
          const res = await customFetch(url);
          const data = await res.json();
          if (data && data.ok && data.users && data.users.length) {
            dropdownEl.innerHTML = '<option value="">-- Выберите профиль ПК --</option>';
            data.users.forEach(u => {
              const opt = document.createElement('option');
              opt.value = u.user_id;
              opt.textContent = (u.first_name || u.username || 'ID ' + u.user_id) + ' (' + u.user_id + ')';
              if (u.user_id == userId) opt.selected = true;
              dropdownEl.appendChild(opt);
            });
            dropdownEl.style.display = 'inline-block';
          }
        } catch(e) {
          if (pcStatus) {
            pcStatus.textContent = '🔴 Ошибка подключения';
            pcStatus.style.color = 'var(--danger-color)';
          }
        }
      }
    } else {
      if (pcStatus) {
        pcStatus.textContent = '🔴 Не подключен';
        pcStatus.style.color = 'var(--danger-color)';
      }
    }
  }
}

function onUserSelectChange(val) {
  if (!val) return;
  const uid = parseInt(val);
  userId = uid;
  localStorage.setItem('desktop_admin_selected_user_id', uid);
  loadConfig();
}

function promptChangeUserId() {
  const input = prompt('Введите Telegram ID пользователя для просмотра на ПК:', userId || '');
  if (input !== null) {
    const uid = parseInt(input.trim());
    if (uid && !isNaN(uid)) {
      userId = uid;
      localStorage.setItem('desktop_admin_selected_user_id', uid);
      updateUserIdDisplay();
      loadConfig();
    }
  }
}

let API_BASE = null; // Будет определён динамически

// ===== Извлечение api_url из параметров URL или initData =====
function getApiUrlFromParams() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramUrl = urlParams.get('api_url');
    if (paramUrl && (paramUrl.startsWith('https://') || paramUrl.startsWith('http://'))) {
      return paramUrl.replace(/\/$/, '');
    }
  } catch (e) {}
  return null;
}

function customFetch(url, options = {}) {
  options.headers = Object.assign({
    'Content-Type': 'application/json',
    'bypass-tunnel-reminder': 'true',
    'ngrok-skip-browser-warning': 'true'
  }, options.headers || {});
  return fetch(url, options);
}

// ===== Детекция подключенного сервера на ПК =====
async function detectAPI() {
  const paramApi = getApiUrlFromParams();

  // Если запущено на смартфоне в Telegram WebApp
  if (isTgWebApp) {
    API_BASE = paramApi || null;
    return;
  }

  // Если запущено прямо на самом ПК в браузере (localhost)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    API_BASE = '';
    return;
  }

  // Если открыто в обычном браузере на ПК с внешнего хостинга (например, GitHub Pages)
  const customApi = localStorage.getItem('desktop_admin_custom_api_url');
  if (customApi) {
    API_BASE = customApi.trim().replace(/\/$/, '');
    return;
  }

  API_BASE = paramApi || null;
}

function saveCustomApiUrl() {
  const val = document.getElementById('pc-api-url-input').value.trim();
  if (val) {
    localStorage.setItem('desktop_admin_custom_api_url', val);
    alert('URL кастомного API сохранен! Переподключение...');
  } else {
    localStorage.removeItem('desktop_admin_custom_api_url');
    alert('Кастомный URL сброшен. Используется стандартное подключение.');
  }
  loadConfig();
}

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
  updateUserIdDisplay();

  // 1. Мгновенно выводим сохранённые данные из памяти — 0 мс ожидания!
  fillForm(loadLocal());

  const badge = document.getElementById('sub-badge');
  const subTitle = document.getElementById('sub-title');
  const subIcon = document.getElementById('sub-icon');
  const subDesc = document.getElementById('sub-desc');
  const connStatus = document.getElementById('conn-status');

  badge.textContent = userName ? ('👋 ' + userName) : '📱 Mini App';
  badge.className = 'badge badge-active';
  connStatus.textContent = '🟢 Подключено к боту';
  connStatus.className = 'conn-badge conn-online';

  await detectAPI();

  const targetApi = getTargetApi();
  if (targetApi !== null) {
    try {
      const url = (targetApi === '') ? ('/api/config?user_id=' + userId) : (targetApi + '/api/config?user_id=' + userId);
      const res = await customFetch(url);
      if (res.ok) {
        const data = await res.json();
        const cfg = data.config || {};
        fillForm(cfg);
        saveLocal(cfg);

        if (data.is_sub_active) {
          subIcon.textContent = '🟢';
          subTitle.textContent = 'Подписка активна!';
          subDesc.textContent = 'До: ' + (data.sub_expires_at ? data.sub_expires_at.slice(0,10) : 'Бессрочно');
        } else {
          subIcon.textContent = '🔴';
          subTitle.textContent = 'Подписка не активна';
          subDesc.textContent = 'Активируйте промокод командой /promo в боте.';
        }
      }
    } catch(e) {
      console.warn('[MiniApp] Загрузка сервера в фоновом режиме:', e.message);
    }
  }
}

let currentUrls = [];

function renderUrlsList() {
  const container = document.getElementById('urls-list-container');
  if (!container) return;

  if (currentUrls.length === 0) {
    container.innerHTML = '<div class="text-center" style="padding:15px; color:var(--text-muted); font-size:12px;">Список ссылок пуст. Вставьте ссылку выше и нажмите кнопку.</div>';
    document.getElementById('urls-input').value = '';
    return;
  }

  container.innerHTML = '';
  currentUrls.forEach((url, index) => {
    let title = "Авито Поиск";
    try {
      const u = new URL(url);
      const q = u.searchParams.get('q');
      if (q) {
        title = `🔍 Поиск: "${decodeURIComponent(q)}"`;
      } else {
        const pathParts = u.pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
          title = decodeURIComponent(pathParts[pathParts.length - 1]).replace(/_/g, ' ');
        }
      }
    } catch(e) {}

    const item = document.createElement('div');
    item.className = 'url-item';
    item.innerHTML = `
      <div class="url-text-wrapper">
        <span class="url-text-title">${title}</span>
        <a href="${url}" target="_blank" class="url-text-link">${url}</a>
      </div>
      <button type="button" class="delete-url-btn" onclick="deleteLinkUrl(${index})" title="Удалить ссылку">🗑️</button>
    `;
    container.appendChild(item);
  });

  // Синхронизируем для отправки формы
  document.getElementById('urls-input').value = currentUrls.join('\n');
}

function addLinkUrl() {
  const input = document.getElementById('new-url-input');
  const url = input.value.trim();
  if (!url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('Пожалуйста, введите корректную ссылку, начинающуюся с http:// или https://');
    return;
  }

  if (currentUrls.includes(url)) {
    alert('Эта ссылка уже добавлена!');
    return;
  }

  currentUrls.push(url);
  input.value = '';
  renderUrlsList();
}

function deleteLinkUrl(index) {
  currentUrls.splice(index, 1);
  renderUrlsList();
}

function fillForm(cfg) {
  if (!cfg) return;
  currentUrls = cfg.urls || [];
  renderUrlsList();

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

function getTargetApi() {
  if (API_BASE !== null) return API_BASE;
  return getApiUrlFromParams();
}

// ===== Сохранение =====
async function saveSettings() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  const payload = collectForm();
  saveLocal(payload);

  let savedOnServer = false;
  let serverError = null;
  const targetApi = getTargetApi();

  // Прямой HTTP POST к боту на ПК (через Cloudflare Tunnel / Localhost)
  if (targetApi !== null) {
    try {
      const url = (targetApi === '') ? '/api/config' : (targetApi + '/api/config');
      const res = await customFetch(url, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.ok) {
        savedOnServer = true;
      } else if (data && data.message) {
        serverError = data.message;
      }
    } catch(e) {
      console.warn('[MiniApp] POST error:', e.message);
    }
  }

  // Резервный способ: Telegram WebApp sendData (ТОЛЬКО если HTTP POST не удался)
  if (!savedOnServer && !serverError && tg && tg.sendData) {
    try {
      tg.sendData(JSON.stringify({ action: 'save_config', ...payload }));
      btn.textContent = '✅ Передано через Telegram!';
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      savedOnServer = true;
    } catch(e) {
      console.warn('[MiniApp] sendData unsupported in this context:', e.message);
    }
  }

  if (savedOnServer) {
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    btn.textContent = '✅ Сохранено на ПК!';
  } else {
    btn.textContent = '⚠️ Ошибка!';
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    if (serverError) {
      alert('⚠️ Ошибка сервера: ' + serverError);
    } else {
      alert('⚠️ Внимание: Подключение к ПК отсутствует!\n\nНовые ссылки НЕ были сохранены на сервере. Пожалуйста, зайдите в Telegram-бот на телефоне, отправьте команду /start или /menu и откройте Mini App заново через новую присланную кнопку, чтобы обновить адрес подключения.');
    }
  }

  // Восстанавливаем кнопку через 2 секунды, чтобы можно было сохранять многократно
  setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Сохранить настройки'; }, 2000);
}

// ===== Загрузка Лидов =====
async function loadLeads() {
  const box = document.getElementById('leads-container');
  const targetApi = getTargetApi();

  if (targetApi === null) {
    box.innerHTML = '<div class="empty-state">📊 Заявки транслируются прямо в бот Telegram. Нажмите "📲 Подключить заявки" в меню бота.</div>';
    return;
  }

  box.innerHTML = '<div class="empty-state">⏳ Загрузка лидов с ПК...</div>';
  try {
    const url = (targetApi === '') ? ('/api/leads?user_id=' + userId) : (targetApi + '/api/leads?user_id=' + userId);
    const res = await customFetch(url);
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
    box.innerHTML = '<div class="empty-state">Не удалось загрузить лиды с ПК.</div>';
  }
}

// ===== Активация промокода =====
async function redeemPromo() {
  const input = document.getElementById('promo-input');
  const result = document.getElementById('promo-result');
  const code = input.value.trim();
  if (!code) return;

  const targetApi = API_BASE || getApiUrlFromParams();

  if (targetApi) {
    try {
      const res = await customFetch(targetApi + '/api/redeem_promo', {
        method: 'POST',
        body: JSON.stringify({user_id: userId, code: code})
      });
      const data = await res.json();
      result.style.color = data.ok ? '#10B981' : '#EF4444';
      result.textContent = data.message;
      if (data.ok) { input.value = ''; loadConfig(); }
      return;
    } catch(e) {}
  }

  if (tg && tg.sendData) {
    tg.sendData(JSON.stringify({ action: 'redeem_promo', user_id: userId, code: code }));
    result.style.color = '#10B981';
    result.textContent = '🎁 Промокод отправлен боту!';
    return;
  }

  result.style.color = '#EF4444';
  result.textContent = 'Используйте команду /promo ' + code + ' в чате с ботом.';
}

document.addEventListener('DOMContentLoaded', loadConfig);
