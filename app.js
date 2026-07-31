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
  } catch (e) {}
  return 0;
}

let userId = resolveUserId();
const userName = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || '';
const userUsername = window.Telegram?.WebApp?.initDataUnsafe?.user?.username || '';
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

function buildApiUrl(endpoint, params = {}) {
  const targetApi = getTargetApi();
  let baseUrl = endpoint;
  if (targetApi !== null && targetApi !== '') {
    baseUrl = targetApi + endpoint;
  }
  const u = new URL(baseUrl, window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, v);
  }
  u.searchParams.set('bypass-tunnel-reminder', 'true');
  u.searchParams.set('ngrok-skip-browser-warning', 'true');
  return u.toString();
}

function customFetch(url, options = {}) {
  options.headers = Object.assign({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
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

// ===== Кросс-девайсная синхронизация (Telegram CloudStorage + LocalStorage) =====
function syncSaveCloud(cfg) {
  if (!cfg) return;
  saveLocal(cfg);
  try {
    if (tg?.CloudStorage?.setItem) {
      tg.CloudStorage.setItem(STORAGE_KEY, JSON.stringify(cfg), (err) => {
        if (err) console.warn('[CloudStorage] Ошибка сохранения в облако Telegram:', err);
        else console.log('[CloudStorage] ✅ Успешно синхронизировано в облако Telegram!');
      });
    }
  } catch(e) {
    console.warn('[CloudStorage] Ошибка вызова CloudStorage:', e);
  }
}

async function syncLoadCloud() {
  return new Promise((resolve) => {
    try {
      if (tg?.CloudStorage?.getItem) {
        tg.CloudStorage.getItem(STORAGE_KEY, (err, value) => {
          if (!err && value) {
            try {
              const cloudCfg = JSON.parse(value);
              console.log('[CloudStorage] ☁️ Получены настройки из облака Telegram!');
              resolve(cloudCfg);
              return;
            } catch(e) {}
          }
          resolve(null);
        });
      } else {
        resolve(null);
      }
    } catch(e) {
      resolve(null);
    }
  });
}

// ===== Детекция API =====
async function detectAPI() {
  const paramApi = getApiUrlFromParams();

  // 1. Если Mini App открыт по адресу localhost или напрямую по адресу туннеля
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('trycloudflare.com') || h.endsWith('lhr.life') || h.endsWith('lhrtunnel.link') || h.endsWith('serveo.net') || h.endsWith('serveousercontent.com') || h.endsWith('pinggy.link') || h.endsWith('ngrok-free.app')) {
    API_BASE = '';
    console.log('[MiniApp] Работаем напрямую (Same-Origin / Localhost)');
    return;
  }

  // 2. Если передан api_url в параметрах URL (при открытии по ссылке или через инлайн-кнопки)
  if (paramApi) {
    API_BASE = paramApi;
    try { localStorage.setItem('last_api_url', paramApi); } catch(e) {}
    try { if (tg?.CloudStorage?.setItem) tg.CloudStorage.setItem('last_api_url', paramApi); } catch(e) {}
    console.log('[MiniApp] Обнаружен API URL из параметров:', paramApi);
    return;
  }

  // 3. Если api_url отсутствует в параметрах (при открытии из кэшированной кнопки меню внизу чата)
  let storedApi = null;
  try { storedApi = localStorage.getItem('last_api_url'); } catch(e) {}
  if (!storedApi && tg?.CloudStorage?.getItem) {
    storedApi = await new Promise(resolve => {
      try {
        tg.CloudStorage.getItem('last_api_url', (err, val) => resolve(err ? null : val));
      } catch(e) { resolve(null); }
    });
  }

  if (storedApi && (storedApi.startsWith('https://') || storedApi.startsWith('http://'))) {
    API_BASE = storedApi.replace(/\/$/, '');
    console.log('[MiniApp] Загружен сохраненный API URL из кэша/облака:', API_BASE);
    return;
  }

  API_BASE = null;
}

// ===== UI: профиль пользователя =====
async function updateUserIdDisplay() {
  const displayEl = document.getElementById('user-id-display');
  const pcStatus = document.getElementById('pc-api-status-label');

  if (userId && userId > 0) {
    if (displayEl) displayEl.textContent = userId + (userName ? ' (' + userName + ')' : '');
  } else {
    if (displayEl) displayEl.textContent = '🔒 Запустите через бота Telegram';
  }

  const targetApi = getTargetApi();
  if (pcStatus) {
    pcStatus.textContent = '🟢 Активно';
    pcStatus.style.color = 'var(--success-color)';
  }
}

let isSubActive = true;

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
  // 1. Мгновенно показываем локальный кэш
  let currentCfg = loadLocal();
  fillForm(currentCfg);
  
  const badge = document.getElementById('sub-badge');
  const subTitle = document.getElementById('sub-title');
  const subIcon = document.getElementById('sub-icon');
  const subDesc = document.getElementById('sub-desc');
  const saveBtn = document.getElementById('save-btn');

  if (badge) badge.textContent = userName ? ('👋 ' + userName) : '📱 Mini App';
  if (badge) badge.className = 'badge badge-active';

  // 2. Подгружаем из Telegram CloudStorage (с таймаутом 2сек — не зависаем)
  try {
    const cloudCfg = await Promise.race([
      syncLoadCloud(),
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ]);
    if (cloudCfg && cloudCfg.urls) {
      const localTs = currentCfg.updated_at || 0;
      const cloudTs = cloudCfg.updated_at || 0;
      if (cloudTs >= localTs) {
        currentCfg = cloudCfg;
        fillForm(currentCfg);
        saveLocal(currentCfg);
        console.log('[MiniApp] ☁️ Синхронизовали из Telegram CloudStorage');
      }
    }
  } catch(e) {
    console.warn('[MiniApp] CloudStorage не удался:', e);
  }

  await detectAPI();
  updateUserIdDisplay();

  // 3. Запрашиваем сервер ПК — самая свежая БД
  const targetApi = getTargetApi();
  let serverReached = false;

  if (userId && userId > 0 && targetApi !== null) {
    try {
      const url = buildApiUrl('/api/config', { user_id: userId });
      console.log('[MiniApp] Запрос к серверу:', url);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await customFetch(url, {
        method: 'GET',
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch(err) {
          console.warn('[MiniApp] Ответ не JSON:', text.slice(0, 200));
        }

        if (data && data.ok) {
          serverReached = true;
          const serverCfg = data.config || {};
          const serverTs = serverCfg.updated_at || 0;
          const localTs = currentCfg.updated_at || 0;

          // Сервер — главный источник истины, если есть хоть какие-то данные
          if (serverTs >= localTs || !currentCfg.urls || currentCfg.urls.length === 0) {
            currentCfg = serverCfg;
            fillForm(currentCfg);
            syncSaveCloud(currentCfg);
          }

          isSubActive = !!data.is_sub_active;
          const subExpiresAt = data.sub_expires_at;

          if (isSubActive) {
            if (subIcon) subIcon.textContent = '🟢';
            if (subTitle) subTitle.textContent = 'Подписка активна!';
            if (subDesc) subDesc.textContent = 'До: ' + (subExpiresAt ? String(subExpiresAt).slice(0,10) : 'Бессрочно');
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.style.opacity = '1';
              saveBtn.style.cursor = 'pointer';
              saveBtn.textContent = '💾 Сохранить настройки';
            }
          } else {
            if (subIcon) subIcon.textContent = '🔒';
            if (subTitle) subTitle.textContent = 'Подписка не активна';
            if (subDesc) subDesc.textContent = 'Активируйте промокод через /promo в боте!';
            if (saveBtn) {
              saveBtn.disabled = true;
              saveBtn.style.opacity = '0.5';
              saveBtn.style.cursor = 'not-allowed';
              saveBtn.textContent = '🔒 Подписка не активна (Заблокировано)';
            }
          }

          const pcStatus = document.getElementById('pc-api-status-label');
          if (pcStatus) {
            pcStatus.textContent = '🟢 Активно';
            pcStatus.style.color = 'var(--success-color)';
          }
        }
      }
    } catch(e) {
      console.warn('[MiniApp] Сервер недоступен:', e.message);
    }
  }

  // 4. Если сервер не ответил — всё равно обновляем UI подписки (не зависаем на "Загрузка...")
  if (!serverReached) {
    if (subIcon) subIcon.textContent = '📱';
    if (subTitle) subTitle.textContent = 'Работа через Telegram';
    if (subDesc) subDesc.textContent = 'Сервер не подключен. Сохранение через бота.';
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
      saveBtn.style.cursor = 'pointer';
      saveBtn.textContent = '💾 Сохранить настройки';
    }

    const pcStatus = document.getElementById('pc-api-status-label');
    if (pcStatus) {
      if (targetApi === null) {
        pcStatus.textContent = '⚠️ Нет ссылки на сервер';
        pcStatus.style.color = '#F59E0B';
      } else {
        pcStatus.textContent = '🔴 Недоступен';
        pcStatus.style.color = '#EF4444';
      }
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

// ===== Управление ссылками и персональными фильтрами =====
let editingLinkIndex = null;

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
  currentUrls.forEach((item, index) => {
    const isObj = typeof item === 'object' && item !== null;
    const url = isObj ? item.url : item;

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

    let customTag = '';
    if (isObj) {
      const parts = [];
      if (item.min_price || (item.max_price && item.max_price < 90000000)) {
        parts.push(`💰 ${item.min_price || 0}–${item.max_price < 90000000 ? item.max_price.toLocaleString() : '∞'} ₽`);
      }
      if (item.location_filter && item.location_filter.length) {
        parts.push(`📍 ${item.location_filter.length} гор.`);
      }
      if (item.count && item.count > 1) {
        parts.push(`📄 ${item.count} стр.`);
      }
      if (item.keys_word_white_list && item.keys_word_white_list.length) {
        parts.push(`⚪ ${item.keys_word_white_list.length} белых слов`);
      }
      if (item.keys_word_black_list && item.keys_word_black_list.length) {
        parts.push(`⚫ ${item.keys_word_black_list.length} минус-слов`);
      }
      customTag = `<div style="font-size:11px; color:#10B981; margin-top:4px; font-weight:500;">⚙️ Фильтры: ${parts.join(' | ') || 'Настроены'}</div>`;
    } else {
      customTag = `<div style="font-size:11px; color:#94A3B8; margin-top:4px;">⚙️ Нажмите ⚙️ справа чтобы настроить цену, города и фильтры этой ссылки</div>`;
    }

    const row = document.createElement('div');
    row.className = 'url-item';
    row.innerHTML = `
      <div class="url-text-wrapper" style="flex:1;">
        <span class="url-text-title">${title}</span>
        <a href="${url}" target="_blank" class="url-text-link">${url}</a>
        ${customTag}
      </div>
      <div style="display:flex; gap:4px; align-items:center;">
        <button type="button" onclick="openLinkFilterModal(${index})" title="Настроить фильтры этой ссылки" style="background:#334155; color:#FFF; border:none; padding:4px 8px; border-radius:6px; font-size:12px; cursor:pointer;">⚙️</button>
        <button type="button" class="delete-url-btn" onclick="deleteLinkUrl(${index})" title="Удалить">🗑️</button>
      </div>
    `;
    container.appendChild(row);
  });

  if (hiddenInput) {
    hiddenInput.value = currentUrls.map(u => typeof u === 'object' ? u.url : u).join('\n');
  }
}

let modalSelectedCities = [];

function onModalCitySearchInput(query) {
  const dropdown = document.getElementById('modal-link-city-suggestions-dropdown');
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
      <div class="city-item" onclick="selectModalCity('${c.name.replace(/'/g, "\\'")}')">
        <span>📍 ${c.name}</span>
        <span class="city-item-subject">${c.subject || ''}</span>
      </div>
    `;
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function selectModalCity(cityName) {
  if (!modalSelectedCities.includes(cityName)) {
    modalSelectedCities.push(cityName);
  }
  const input = document.getElementById('modal-link-city-search-input');
  if (input) input.value = '';
  const dropdown = document.getElementById('modal-link-city-suggestions-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
  renderModalSelectedCities();
}

function removeModalCityTag(index) {
  modalSelectedCities.splice(index, 1);
  renderModalSelectedCities();
}

function renderModalSelectedCities() {
  const container = document.getElementById('modal-link-selected-cities-tags');
  if (!container) return;

  if (!modalSelectedCities.length) {
    container.innerHTML = '<span style="font-size:11px; color:#64748B;">Города не выбраны (поиск по всем)</span>';
    return;
  }

  let html = '';
  modalSelectedCities.forEach((city, index) => {
    html += `
      <span class="city-tag" style="font-size:11px; padding:3px 8px; border-radius:6px; background:#334155; color:#F8FAFC; display:inline-flex; align-items:center; gap:4px; margin:2px;">
        📍 ${city}
        <button type="button" onclick="removeModalCityTag(${index})" style="background:transparent; border:none; color:#EF4444; font-weight:bold; cursor:pointer;">×</button>
      </span>
    `;
  });
  container.innerHTML = html;
}

function openLinkFilterModal(index) {
  editingLinkIndex = index;
  const item = currentUrls[index];
  if (!item) return;

  const modal = document.getElementById('link-filter-modal');
  const urlEl = document.getElementById('link-filter-modal-url');
  
  const urlStr = typeof item === 'object' ? item.url : item;
  if (urlEl) urlEl.textContent = urlStr;

  const isObj = typeof item === 'object' && item !== null;

  const minP = isObj && item.min_price !== undefined ? item.min_price : '';
  const maxP = isObj && item.max_price !== undefined ? item.max_price : '';
  const cnt = isObj && item.count !== undefined ? item.count : 1;
  modalSelectedCities = isObj && Array.isArray(item.location_filter) ? [...item.location_filter] : [];
  const maxAge = isObj && item.max_age !== undefined ? item.max_age : '';
  const maxAgeUnit = isObj && item.max_age_unit ? item.max_age_unit : 'minutes';
  const whiteWords = isObj && item.keys_word_white_list ? item.keys_word_white_list.join(', ') : '';
  const blackWords = isObj && item.keys_word_black_list ? item.keys_word_black_list.join(', ') : '';
  const reservMode = isObj && item.reserv_mode ? item.reserv_mode : 'all';
  const onlyDiscount = isObj && item.only_with_discount !== undefined ? !!item.only_with_discount : false;
  const onlyPhoto = isObj && item.only_with_photo !== undefined ? !!item.only_with_photo : false;

  if (document.getElementById('modal-link-min-price')) document.getElementById('modal-link-min-price').value = minP;
  if (document.getElementById('modal-link-max-price')) document.getElementById('modal-link-max-price').value = maxP;
  if (document.getElementById('modal-link-count')) document.getElementById('modal-link-count').value = cnt;
  if (document.getElementById('modal-link-max-age')) document.getElementById('modal-link-max-age').value = maxAge;
  if (document.getElementById('modal-link-max-age-unit')) document.getElementById('modal-link-max-age-unit').value = maxAgeUnit;
  if (document.getElementById('modal-link-white-words')) document.getElementById('modal-link-white-words').value = whiteWords;
  if (document.getElementById('modal-link-black-words')) document.getElementById('modal-link-black-words').value = blackWords;
  if (document.getElementById('modal-link-reserv-mode')) document.getElementById('modal-link-reserv-mode').value = reservMode;
  if (document.getElementById('modal-link-only-discount')) document.getElementById('modal-link-only-discount').checked = onlyDiscount;
  if (document.getElementById('modal-link-only-photo')) document.getElementById('modal-link-only-photo').checked = onlyPhoto;

  renderModalSelectedCities();

  if (modal) modal.style.display = 'flex';
}

function closeLinkFilterModal() {
  const modal = document.getElementById('link-filter-modal');
  if (modal) modal.style.display = 'none';
  editingLinkIndex = null;
}

function saveLinkFilterModal() {
  if (editingLinkIndex === null) return;
  const oldItem = currentUrls[editingLinkIndex];
  const urlStr = typeof oldItem === 'object' ? oldItem.url : oldItem;

  const minP = parseInt(document.getElementById('modal-link-min-price')?.value) || 0;
  const maxP = parseInt(document.getElementById('modal-link-max-price')?.value) || 99999999;
  const cnt = parseInt(document.getElementById('modal-link-count')?.value) || 1;
  const maxAge = parseInt(document.getElementById('modal-link-max-age')?.value) || 0;
  const maxAgeUnit = document.getElementById('modal-link-max-age-unit')?.value || 'minutes';
  const whiteWords = (document.getElementById('modal-link-white-words')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const blackWords = (document.getElementById('modal-link-black-words')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const reservMode = document.getElementById('modal-link-reserv-mode')?.value || 'all';
  const onlyDiscount = !!document.getElementById('modal-link-only-discount')?.checked;
  const onlyPhoto = !!document.getElementById('modal-link-only-photo')?.checked;

  currentUrls[editingLinkIndex] = {
    url: urlStr,
    min_price: minP,
    max_price: maxP,
    count: cnt,
    location_filter: [...modalSelectedCities],
    max_age: maxAge,
    max_age_unit: maxAgeUnit,
    keys_word_white_list: whiteWords,
    keys_word_black_list: blackWords,
    reserv_mode: reservMode,
    only_with_discount: onlyDiscount,
    only_with_photo: onlyPhoto
  };

  renderUrlsList();
  closeLinkFilterModal();
}

function resetLinkFilterModal() {
  if (editingLinkIndex === null) return;
  const oldItem = currentUrls[editingLinkIndex];
  const urlStr = typeof oldItem === 'object' ? oldItem.url : oldItem;
  currentUrls[editingLinkIndex] = urlStr;
  renderUrlsList();
  closeLinkFilterModal();
}

function addLinkUrl() {
  const input = document.getElementById('new-url-input');
  const url = input.value.trim();
  if (!url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('Введите корректную ссылку (http:// или https://)');
    return;
  }

  const existingUrls = currentUrls.map(u => (typeof u === 'object' && u !== null) ? u.url : u);
  if (existingUrls.includes(url)) {
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
}

function collectForm() {
  return {
    user_id: userId,
    first_name: userName,
    username: userUsername,
    updated_at: Date.now(),
    urls: Array.isArray(currentUrls) ? currentUrls : []
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
  if (!isSubActive) {
    alert('🔒 У вас нет активной подписки!\nСохранение параметров и сбор объявлений заблокированы.\nАктивируйте промокод через /promo в Telegram боте.');
    return;
  }

  const btn = document.getElementById('save-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  let savedOnServer = false;

  try {
    const payload = collectForm();
    console.log('[MiniApp] Сохраняем настройки:', JSON.stringify({user_id: payload.user_id, urls_count: payload.urls.length}));

    // 1. Сохраняем в локальный кэш + облако Telegram CloudStorage
    syncSaveCloud(payload);

    // 2. Отправка прямого HTTP POST к серверу (выполняется ВСЕГДА!)
    const targetApi = getTargetApi();
    if (targetApi !== null) {
      try {
        const url = (targetApi === '') ? '/api/config' : (targetApi + '/api/config');
        console.log('[MiniApp] HTTP POST к', url);
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
