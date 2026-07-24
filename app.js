// Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const userId = tg?.initDataUnsafe?.user?.id || 0;

// API_BASE: если фронтенд открыт НЕ с localhost — значит он на GitHub Pages
// и API запросы пойдут на localhost:8080 (работает только с того же ПК)
const isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
const API_BASE = isLocal ? '' : 'http://localhost:8080';

function switchTab(tabId, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  const target = document.getElementById('tab-' + tabId);
  if (target) target.classList.add('active');
  if (tabId === 'leads') loadLeads();
}

async function loadConfig() {
  const badge = document.getElementById('sub-badge');
  const subTitle = document.getElementById('sub-title');
  const subIcon = document.getElementById('sub-icon');
  const subDesc = document.getElementById('sub-desc');

  try {
    const res = await fetch(API_BASE + '/api/config?user_id=' + userId);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const cfg = data.config || {};

    // Подписка
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
      subDesc.textContent = 'Активируйте промокод или обратитесь к админу.';
    }

    // Заполняем поля
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

  } catch (err) {
    console.warn('API недоступен:', err.message);
    badge.textContent = '⚪ Оффлайн';
    badge.className = 'badge badge-active';
    subIcon.textContent = '⚪';
    subTitle.textContent = 'Оффлайн режим';
    subDesc.textContent = 'Запустите AvitoParser.py на ПК для синхронизации.';
  }
}

async function saveSettings() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  const payload = {
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

  try {
    const res = await fetch(API_BASE + '/api/config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      btn.textContent = '✅ Сохранено!';
    }
  } catch (err) {
    btn.textContent = '❌ Нет связи с ПК';
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Сохранить настройки'; }, 2000);
}

async function loadLeads() {
  const box = document.getElementById('leads-container');
  box.innerHTML = '<div class="empty-state">⏳ Загрузка...</div>';
  try {
    const res = await fetch(API_BASE + '/api/leads?user_id=' + userId);
    const data = await res.json();
    const leads = data.leads || [];
    if (!leads.length) {
      box.innerHTML = '<div class="empty-state">Пока нет объявлений. Запустите парсер.</div>';
      return;
    }
    box.innerHTML = '';
    leads.forEach(l => {
      const el = document.createElement('div');
      el.className = 'lead-item';
      el.innerHTML =
        '<a href="' + l.url + '" target="_blank" class="lead-title">' + (l.title || 'Объявление') + '</a>' +
        '<div class="lead-price">' + (l.price ? Number(l.price).toLocaleString('ru-RU') + ' ₽' : '—') + '</div>' +
        '<div class="lead-meta">📍 ' + (l.location || '—') + ' | 🕒 ' + (l.created_at ? l.created_at.slice(0,16).replace('T',' ') : '') + '</div>';
      box.appendChild(el);
    });
  } catch (err) {
    box.innerHTML = '<div class="empty-state">Запустите AvitoParser.py для загрузки данных.</div>';
  }
}

async function redeemPromo() {
  const input = document.getElementById('promo-input');
  const result = document.getElementById('promo-result');
  const code = input.value.trim();
  if (!code) return;

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
  } catch (err) {
    result.style.color = '#EF4444';
    result.textContent = 'Нет связи с сервером.';
  }
}

document.addEventListener('DOMContentLoaded', loadConfig);
