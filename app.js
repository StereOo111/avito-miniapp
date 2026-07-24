// Telegram WebApp Initialization
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const userId = tg?.initDataUnsafe?.user?.id || 123456789;

// Авто-определение API хоста (если фронтенд на статической площадке)
const API_BASE = (location.hostname === 'stereoo111.github.io' || location.protocol === 'file:')
  ? 'http://localhost:8080'
  : '';

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  if (event && event.target) {
    event.target.classList.add('active');
  }
  const targetContent = document.getElementById(`tab-${tabId}`);
  if (targetContent) targetContent.classList.add('active');

  if (tabId === 'leads') {
    loadLeads();
  }
}

async function loadConfig() {
  const badge = document.getElementById('sub-badge');
  const subTitle = document.getElementById('sub-title');
  const subIcon = document.getElementById('sub-icon');
  const subDesc = document.getElementById('sub-desc');

  try {
    const res = await fetch(`${API_BASE}/api/config?user_id=${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const config = data.config || {};
    const isSubActive = data.is_sub_active;

    if (isSubActive) {
      badge.textContent = '🟢 Подписка активна';
      badge.className = 'badge badge-active';
      subIcon.textContent = '🟢';
      subTitle.textContent = 'Ваша подписка активна!';
      subDesc.textContent = `Доступ до: ${data.sub_expires_at ? data.sub_expires_at.slice(0, 10) : 'Бессрочно'}`;
    } else {
      badge.textContent = '🔴 Подписка не активна';
      badge.className = 'badge badge-inactive';
      subIcon.textContent = '🔴';
      subTitle.textContent = 'Подписка не активна';
      subDesc.textContent = 'Активируйте промокод или обратитесь к администратору.';
    }

    // Populate Fields
    document.getElementById('urls-input').value = (config.urls || []).join('\n');
    document.getElementById('min-price').value = config.min_price || 0;
    document.getElementById('max-price').value = config.max_price || 99999999;
    document.getElementById('count-page').value = config.count || 1;

    document.getElementById('max-age').value = config.max_age || 0;
    document.getElementById('max-age-unit').value = config.max_age_unit || 'minutes';
    document.getElementById('reserv-mode').value = config.reserv_mode || 'ignore';

    document.getElementById('only-discount').checked = !!config.only_with_discount;
    document.getElementById('only-photo').checked = !!config.only_with_photo;

    document.getElementById('white-list').value = (config.keys_word_white_list || []).join('\n');
    document.getElementById('black-list').value = (config.keys_word_black_list || []).join('\n');

  } catch (err) {
    console.warn('Локальный API сервер пока недоступен, режим ожидания:', err);
    badge.textContent = '🟢 Сервис активен';
    badge.className = 'badge badge-active';
    subIcon.textContent = '🟢';
    subTitle.textContent = 'Сервис активен';
    subDesc.textContent = 'Запустите AvitoParser.py для синхронизации всех параметров.';
  }
}

async function saveSettings() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '💾 Сохранение...';

  const urls = document.getElementById('urls-input').value.split('\n').filter(u => u.trim());
  const minPrice = parseInt(document.getElementById('min-price').value) || 0;
  const maxPrice = parseInt(document.getElementById('max-price').value) || 99999999;
  const countPage = parseInt(document.getElementById('count-page').value) || 1;

  const maxAge = parseInt(document.getElementById('max-age').value) || 0;
  const maxAgeUnit = document.getElementById('max-age-unit').value;
  const reservMode = document.getElementById('reserv-mode').value;

  const onlyDiscount = document.getElementById('only-discount').checked;
  const onlyPhoto = document.getElementById('only-photo').checked;

  const whiteList = document.getElementById('white-list').value.split('\n').filter(w => w.trim());
  const blackList = document.getElementById('black-list').value.split('\n').filter(b => b.trim());

  const payload = {
    user_id: userId,
    urls: urls,
    min_price: minPrice,
    max_price: maxPrice,
    count: countPage,
    max_age: maxAge,
    max_age_unit: maxAgeUnit,
    reserv_mode: reservMode,
    only_with_discount: onlyDiscount,
    only_with_photo: onlyPhoto,
    keys_word_white_list: whiteList,
    keys_word_black_list: blackList,
  };

  try {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      saveBtn.textContent = '✅ Настройки сохранены!';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Сохранить настройки';
      }, 2000);
    }
  } catch (err) {
    console.error('Ошибка сохранения:', err);
    saveBtn.disabled = false;
    saveBtn.textContent = '❌ Запустите AvitoParser.py на ПК';
  }
}

async function loadLeads() {
  const container = document.getElementById('leads-container');
  container.innerHTML = '<div class="empty-state">Загрузка лидов...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/leads?user_id=${userId}`);
    const data = await res.json();
    const leads = data.leads || [];

    if (leads.length === 0) {
      container.innerHTML = '<div class="empty-state">Найденных объявлений пока нет.</div>';
      return;
    }

    container.innerHTML = '';
    leads.forEach(lead => {
      const item = document.createElement('div');
      item.className = 'lead-item';
      item.innerHTML = `
        <a href="${lead.url}" target="_blank" class="lead-title">${lead.title || 'Объявление'}</a>
        <div class="lead-price">${lead.price ? lead.price.toLocaleString('ru-RU') + ' ₽' : 'Цена не указана'}</div>
        <div class="lead-meta">📍 ${lead.location || 'Регион не указан'} | 🕒 ${lead.created_at ? lead.created_at.slice(0, 16).replace('T', ' ') : ''}</div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Найденные объявления будут отображаться здесь при запуске парсера.</div>';
  }
}

async function redeemPromo() {
  const promoInput = document.getElementById('promo-input');
  const resultDiv = document.getElementById('promo-result');
  const code = promoInput.value.trim();

  if (!code) return;

  try {
    const res = await fetch(`${API_BASE}/api/redeem_promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, code: code })
    });
    const data = await res.json();

    if (data.ok) {
      resultDiv.style.color = '#10B981';
      resultDiv.textContent = data.message;
      promoInput.value = '';
      loadConfig();
    } else {
      resultDiv.style.color = '#EF4444';
      resultDiv.textContent = data.message;
    }
  } catch (err) {
    resultDiv.style.color = '#EF4444';
    resultDiv.textContent = 'Ошибка обращения к серверу.';
  }
}

// Initial Load
document.addEventListener('DOMContentLoaded', loadConfig);
