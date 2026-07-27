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
    const fromTg = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (fromTg) return parseInt(fromTg);
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('user_id');
    if (fromUrl) return parseInt(fromUrl);
    const fromStorage = localStorage.getItem('desktop_admin_selected_user_id');
    if (fromStorage) return parseInt(fromStorage);
  } catch (e) {}
  return 0;
}

let userId = resolveUserId();
const userName = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || '';
const STORAGE_KEY = 'avito_parser_config';
let API_BASE = null;
let currentUrls = [];

// ===== Утилиты =====
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

function getTargetApi() {
  if (API_BASE !== null) return API_BASE;
  return getApiUrlFromParams();
}

function customFetch(url, options = {}) {
  options.headers = Object.assign({
    'Content-Type': 'application/json',
    'bypass-tunnel-reminder': 'true',
    'ngrok-skip-browser-warning': 'true'
  }, options.headers || {});
  return fetch(url, options);
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { return {}; }
}
function saveLocal(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

// ===== Детекция API =====
async function detectAPI() {
  const paramApi = getApiUrlFromParams();

  // Если Mini App открыт по адресу localhost или напрямую по адресу туннеля (trycloudflare, lhr.life, serveo, serveousercontent и т.д.)
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('trycloudflare.com') || h.endsWith('lhr.life') || h.endsWith('lhrtunnel.link') || h.endsWith('serveo.net') || h.endsWith('serveousercontent.com') || h.endsWith('pinggy.link') || h.endsWith('ngrok-free.app')) {
    API_BASE = '';
    console.log('[MiniApp] Работаем напрямую (Same-Origin / Localhost)');
    return;
  }

  // Если передан api_url в параметрах (при запуске с GitHub Pages)
  if (paramApi) {
    API_BASE = paramApi;
    console.log('[MiniApp] Обнаружен API URL из параметров:', paramApi);
    return;
  }

  // GitHub Pages на ПК — кастомный URL из localStorage
  const customApi = localStorage.getItem('desktop_admin_custom_api_url');
  if (customApi) {
    API_BASE = customApi.trim().replace(/\/$/, '');
    return;
  }

  API_BASE = null;
}

function saveCustomApiUrl() {
  const val = document.getElementById('pc-api-url-input').value.trim();
  if (val) {
    localStorage.setItem('desktop_admin_custom_api_url', val);
    API_BASE = val.trim().replace(/\/$/, '');
    alert('✅ URL API сохранён! Переподключение...');
  } else {
    localStorage.removeItem('desktop_admin_custom_api_url');
    API_BASE = null;
    alert('URL сброшен.');
  }
  loadConfig();
}

// ===== UI: профиль пользователя =====
async function updateUserIdDisplay() {
  const displayEl = document.getElementById('user-id-display');
  const dropdownEl = document.getElementById('user-selector-dropdown');
  const changeBtn = document.getElementById('change-user-btn');
  const pcBar = document.getElementById('pc-api-setup-bar');
  const pcStatus = document.getElementById('pc-api-status-label');
  const pcInput = document.getElementById('pc-api-url-input');

  if (isTgWebApp) {
    if (displayEl) displayEl.textContent = userId + (userName ? ' (' + userName + ')' : '');
    if (dropdownEl) dropdownEl.style.display = 'none';
    if (changeBtn) changeBtn.style.display = 'none';
    // Мы не скрываем pcBar безусловно здесь, чтобы при ошибке loadConfig мог его показать для отладки
  } else {
    if (displayEl) displayEl.textContent = userId ? userId : 'Не выбран';
    if (changeBtn) changeBtn.style.display = 'inline-block';
    if (pcBar) pcBar.style.display = 'flex';
    
    if (pcInput && !pcInput.value) {
      pcInput.value = localStorage.getItem('desktop_admin_custom_api_url') || '';
    }

    const targetApi = getTargetApi();
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
            dropdownEl.innerHTML = '<option value="">-- Выберите профиль --</option>';
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
  userId = parseInt(val);
  localStorage.setItem('desktop_admin_selected_user_id', userId);
  loadConfig();
}

function promptChangeUserId() {
  const input = prompt('Введите Telegram ID:', userId || '');
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

// ===== Вкладки =====
function switchTab(tabId, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  const t = document.getElementById('tab-' + tabId);
  if (t) t.classList.add('active');
}

// ===== Загрузка конфига =====
async function loadConfig() {
  // Мгновенно показываем локальный кеш
  fillForm(loadLocal());
  
  const badge = document.getElementById('sub-badge');
  const subTitle = document.getElementById('sub-title');
  const subIcon = document.getElementById('sub-icon');
  const subDesc = document.getElementById('sub-desc');

  if (badge) badge.textContent = userName ? ('👋 ' + userName) : '📱 Mini App';
  if (badge) badge.className = 'badge badge-active';

  await detectAPI();
  updateUserIdDisplay();

  const targetApi = getTargetApi();
  if (targetApi !== null && userId) {
    try {
      const url = (targetApi === '') ? ('/api/config?user_id=' + userId) : (targetApi + '/api/config?user_id=' + userId);
      const res = await customFetch(url);
      if (res.ok) {
        const data = await res.json();
        const cfg = data.config || {};
        fillForm(cfg);
        saveLocal(cfg);

        if (data.is_sub_active) {
          if (subIcon) subIcon.textContent = '🟢';
          if (subTitle) subTitle.textContent = 'Подписка активна!';
          if (subDesc) subDesc.textContent = 'До: ' + (data.sub_expires_at ? data.sub_expires_at.slice(0,10) : 'Бессрочно');
        } else {
          if (subIcon) subIcon.textContent = '🔴';
          if (subTitle) subTitle.textContent = 'Подписка не активна';
          if (subDesc) subDesc.textContent = 'Активируйте промокод: /promo в боте.';
        }
        
        // Скрываем панель настройки API, если всё успешно загрузилось (если мы в Telegram)
        if (isTgWebApp) {
          const pcBar = document.getElementById('pc-api-setup-bar');
          if (pcBar) pcBar.style.display = 'none';
        }
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch(e) {
      console.warn('[MiniApp] Загрузка конфига не удалась:', e.message);
      const pcBar = document.getElementById('pc-api-setup-bar');
      if (pcBar) pcBar.style.display = 'flex';
      const pcStatus = document.getElementById('pc-api-status-label');
      if (pcStatus) {
        pcStatus.textContent = '🔴 Ошибка соединения';
        pcStatus.style.color = 'var(--danger-color)';
      }
    }
  } else {
    const pcBar = document.getElementById('pc-api-setup-bar');
    if (pcBar) pcBar.style.display = 'flex';
    const pcStatus = document.getElementById('pc-api-status-label');
    if (pcStatus) {
      pcStatus.textContent = '🔴 Не подключен (Нет API URL)';
      pcStatus.style.color = 'var(--danger-color)';
    }
  }
}

function showOutdatedModal() {
  const modal = document.getElementById('outdated-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function reconnectApp() {
  localStorage.removeItem('desktop_admin_custom_api_url');
  const modal = document.getElementById('outdated-modal');
  if (modal) modal.style.display = 'none';
  loadConfig();
}

function closeApp() {
  if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.close === 'function') {
    window.Telegram.WebApp.close();
  } else {
    const modal = document.getElementById('outdated-modal');
    if (modal) modal.style.display = 'none';
  }
}

// ===== Управление ссылками =====
function renderUrlsList() {
  const container = document.getElementById('urls-list-container');
  const hiddenInput = document.getElementById('urls-input');
  if (!container) return;

  if (currentUrls.length === 0) {
    container.innerHTML = '<div class="text-center" style="padding:15px; color:var(--text-muted); font-size:12px;">Список ссылок пуст. Вставьте ссылку выше и нажмите кнопку.</div>';
    if (hiddenInput) hiddenInput.value = '';
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
      <button type="button" class="delete-url-btn" onclick="deleteLinkUrl(${index})" title="Удалить">🗑️</button>
    `;
    container.appendChild(item);
  });

  if (hiddenInput) hiddenInput.value = currentUrls.join('\n');
}

function addLinkUrl() {
  const input = document.getElementById('new-url-input');
  const url = input.value.trim();
  if (!url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('Введите корректную ссылку (http:// или https://)');
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

  selectedCities = cfg.location_filter || [];
  renderSelectedCities();

  const el = (id) => document.getElementById(id);
  if (el('min-price')) el('min-price').value = cfg.min_price || 0;
  if (el('max-price')) el('max-price').value = cfg.max_price || 99999999;
  if (el('count-page')) el('count-page').value = cfg.count || 1;
  if (el('max-age')) el('max-age').value = cfg.max_age || 0;
  if (el('max-age-unit')) el('max-age-unit').value = cfg.max_age_unit || 'minutes';
  if (el('reserv-mode')) el('reserv-mode').value = cfg.reserv_mode || 'ignore';
  if (el('only-discount')) el('only-discount').checked = !!cfg.only_with_discount;
  if (el('only-photo')) el('only-photo').checked = !!cfg.only_with_photo;
  if (el('white-list')) el('white-list').value = (cfg.keys_word_white_list || []).join('\n');
  if (el('black-list')) el('black-list').value = (cfg.keys_word_black_list || []).join('\n');
}

function collectForm() {
  const el = (id) => document.getElementById(id);
  const parseVal = (id, fallback) => {
    const elem = el(id);
    if (!elem) return fallback;
    const val = parseInt(elem.value);
    return isNaN(val) ? fallback : val;
  };
  const strVal = (id, fallback) => {
    const elem = el(id);
    return elem ? elem.value : fallback;
  };
  const boolVal = (id) => {
    const elem = el(id);
    return elem ? !!elem.checked : false;
  };
  const listVal = (id) => {
    const elem = el(id);
    if (!elem || !elem.value) return [];
    return elem.value.split('\n').map(s => s.trim()).filter(Boolean);
  };

  return {
    user_id: userId,
    urls: Array.isArray(currentUrls) ? currentUrls : [],
    min_price: parseVal('min-price', 0),
    max_price: parseVal('max-price', 99999999),
    count: parseVal('count-page', 1),
    max_age: parseVal('max-age', 0),
    max_age_unit: strVal('max-age-unit', 'minutes'),
    reserv_mode: strVal('reserv-mode', 'ignore'),
    only_with_discount: boolVal('only-discount'),
    only_with_photo: boolVal('only-photo'),
    keys_word_white_list: listVal('white-list'),
    keys_word_black_list: listVal('black-list'),
    location_filter: Array.isArray(selectedCities) ? selectedCities : [],
  };
}

// ===== ФИЛЬТР ПО ГОРОДАМ / АВТОДОПОЛНЕНИЕ =====
let allCities = [];
let selectedCities = [];

async function loadCitiesData() {
  try {
    const res = await fetch('cities.json');
    if (res.ok) {
      allCities = await res.json();
      console.log('[MiniApp] Загружена база городов:', allCities.length);
    }
  } catch(e) {
    console.warn('[MiniApp] Загрузка cities.json не удалась:', e);
  }
}
loadCitiesData();

function onCitySearchInput(query) {
  const dropdown = document.getElementById('city-suggestions-dropdown');
  if (!dropdown) return;

  const q = query.trim().toLowerCase();
  if (!q || q.length < 1) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    return;
  }

  const matches = allCities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 15);
  if (!matches.length) {
    dropdown.innerHTML = '<div class="city-item" style="color:#94A3B8; cursor:default;">Ничего не найдено</div>';
    dropdown.style.display = 'block';
    return;
  }

  let html = '';
  matches.forEach(c => {
    html += `
      <div class="city-item" onclick="selectCity('${c.name.replace(/'/g, "\\'")}')">
        <span>📍 ${c.name}</span>
        <span class="city-item-subject">${c.subject || ''}</span>
      </div>
    `;
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function selectCity(cityName) {
  if (!selectedCities.includes(cityName)) {
    selectedCities.push(cityName);
  }
  const input = document.getElementById('city-search-input');
  if (input) input.value = '';
  const dropdown = document.getElementById('city-suggestions-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
  renderSelectedCities();
}

function removeCityTag(index) {
  selectedCities.splice(index, 1);
  renderSelectedCities();
}

function renderSelectedCities() {
  const container = document.getElementById('selected-cities-tags');
  if (!container) return;

  if (!selectedCities.length) {
    container.innerHTML = '<span style="font-size:12px; color:#64748B;">Города не выбраны (поиск по всем локациям)</span>';
    return;
  }

  let html = '';
  selectedCities.forEach((city, index) => {
    html += `
      <span class="city-tag">
        📍 ${city}
        <span class="city-tag-remove" onclick="removeCityTag(${index})" title="Удалить">×</span>
      </span>
    `;
  });
  container.innerHTML = html;
}

document.addEventListener('click', (e) => {
  const input = document.getElementById('city-search-input');
  const dropdown = document.getElementById('city-suggestions-dropdown');
  if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ===== СОХРАНЕНИЕ =====
async function saveSettings() {
  const btn = document.getElementById('save-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  let savedOnServer = false;

  try {
    const payload = collectForm();
    console.log('[MiniApp] Сохраняем настройки:', JSON.stringify({user_id: payload.user_id, urls_count: payload.urls.length}));

    // 1. Сохраняем в локальный кэш
    saveLocal(payload);

    const tg = window.Telegram?.WebApp;
    const tgPayload = Object.assign({ action: 'save_config' }, payload);

    // 2. МГНОВЕННЫЙ нативный отправщик Telegram WebApp (не требует туннелей и портов!)
    if (tg && typeof tg.sendData === 'function') {
      try {
        console.log('[MiniApp] Нативная отправка через Telegram.WebApp.sendData()...');
        tg.sendData(JSON.stringify(tgPayload));
        savedOnServer = true;
      } catch(e) {
        console.warn('[MiniApp] sendData error:', e);
      }
    }

    // 3. Параллельный HTTP POST к серверу (для работы из браузера на ПК)
    const targetApi = getTargetApi();
    if (targetApi !== null && !savedOnServer) {
      try {
        const url = (targetApi === '') ? '/api/config' : (targetApi + '/api/config');
        console.log('[MiniApp] POST к', url);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await customFetch(url, {
          method: 'POST',
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok) savedOnServer = true;
        }
      } catch(e) {
        console.warn('[MiniApp] HTTP POST fallback error:', e);
      }
    }

    // 4. Индикация результата
    if (savedOnServer) {
      btn.textContent = '✅ Сохранено!';
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      if (tg?.close) {
        setTimeout(() => tg.close(), 400);
      }
    } else {
      btn.textContent = '⚠️ Нет связи';
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
      alert('⚠️ Не удалось передать настройки в Telegram бот.\nУбедитесь, что вы открыли Mini App через кнопку в Telegram!');
    }
  } catch(err) {
    console.error('[MiniApp] Ошибка функции сохранения:', err);
    btn.textContent = '⚠️ Ошибка!';
    alert('❌ Ошибка сохранения: ' + err.message);
  } finally {
    // В любом случае разблокируем кнопку через 2.5 сек
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 Сохранить настройки';
      }
    }, 2500);
  }
}



// ===== Активация промокода =====
async function redeemPromo() {
  const input = document.getElementById('promo-input');
  const result = document.getElementById('promo-result');
  const code = input.value.trim();
  if (!code) return;

  const targetApi = getTargetApi();

  if (targetApi !== null) {
    try {
      const url = (targetApi === '') ? '/api/redeem_promo' : (targetApi + '/api/redeem_promo');
      const res = await customFetch(url, {
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

  if (isTgWebApp && tg && tg.sendData) {
    tg.sendData(JSON.stringify({ action: 'redeem_promo', user_id: userId, code: code }));
    result.style.color = '#10B981';
    result.textContent = '🎁 Промокод отправлен боту!';
    return;
  }

  result.style.color = '#EF4444';
  result.textContent = 'Используйте /promo ' + code + ' в чате с ботом.';
}

document.addEventListener('DOMContentLoaded', loadConfig);
