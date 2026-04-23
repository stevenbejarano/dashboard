/* ============================================================
   DASHBOARD APP
   All state is persisted in localStorage.
   Google Calendar requires a Client ID set in Settings.
============================================================ */

// ============================================================
// DEFAULT CONFIG
// ============================================================

const SHEET_ID = '17felUngAmt-TYcnrKfjKME3vftwi67hqVt1NJPwas4U';

const DEFAULT_SETTINGS = {
  googleClientId: '',
  currentCol: '',   // Column letter for this week's data, e.g. "I", "J", "K"
  meetingFilters: [
    'DoorDash Onboarding Support',
    'Same Day Onboarding Scheduler'
  ],
  categories: [
    'Team Docs',
    'Performance Tracking',
    'Meeting Agendas',
    'Resources and Process Docs'
  ],
  wbr: {
    merchant: { dayOfWeek: 1 },   // Monday — change in Settings
    iops:     { dayOfWeek: 3 }    // Wednesday — change in Settings
  },
  // Each metric fetches a full row range and uses the last non-empty cell as current week.
  // Add more metrics here as Sigma data moves into Sheets.
  metrics: [
    { id: 'same_day_ready', label: 'Same Day Ready',    tab: 'Q2 Weekly Trackers', row: 37, startCol: 'I', endCol: 'AZ' },
    { id: 'active_day30',   label: 'Active by Day 30',  tab: 'Q2 Weekly Trackers', row: 94, startCol: 'I', endCol: 'AZ' }
  ]
};

const DEFAULT_RESOURCES = [];

// ============================================================
// STATE
// ============================================================

let settings    = loadJSON('dash_settings', DEFAULT_SETTINGS);
let resources   = loadJSON('dash_resources', DEFAULT_RESOURCES);
let wbrState    = loadJSON('dash_wbr_state', { merchant: null, iops: null }); // lastCompleted dates
// Stores the current week's doc URL, pasted in by the user each week
let wbrLinks    = loadJSON('dash_wbr_links', { merchant: '', iops: '' });
let meetings      = [];   // from Google Calendar (runtime only)
let metricValues  = {};   // { metricId: { current, previous, updatedAt } }
let activeCategory = 'all';
let showFiltered   = false;
let gapiReady      = false;
let tokenClient    = null;
let accessToken    = null;

// ============================================================
// PERSISTENCE
// ============================================================

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return JSON.parse(JSON.stringify(fallback));
    const parsed = JSON.parse(raw);
    // Merge top-level keys from fallback if missing
    return { ...JSON.parse(JSON.stringify(fallback)), ...parsed };
  } catch { return JSON.parse(JSON.stringify(fallback)); }
}

function save() {
  localStorage.setItem('dash_settings', JSON.stringify(settings));
  localStorage.setItem('dash_resources', JSON.stringify(resources));
  localStorage.setItem('dash_wbr_state', JSON.stringify(wbrState));
}

// ============================================================
// DATE / TIME
// ============================================================

function updateClock() {
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('date-display').textContent =
    `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  document.getElementById('time-display').textContent =
    now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ============================================================
// GOOGLE CALENDAR
// ============================================================

function connectCalendar() {
  if (!settings.googleClientId) {
    openSettings();
    alert('Please enter your Google Client ID in Settings first.');
    return;
  }
  if (!gapiReady) {
    gapi.load('client', async () => {
      await gapi.client.init({
        discoveryDocs: [
          'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
          'https://sheets.googleapis.com/$discovery/rest?version=v4'
        ]
      });
      gapiReady = true;
      initTokenClient();
    });
  } else {
    initTokenClient();
  }
}

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: settings.googleClientId,
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    callback: async (tokenResponse) => {
      if (tokenResponse.error) return;
      accessToken = tokenResponse.access_token;
      gapi.client.setToken({ access_token: accessToken });
      document.getElementById('btn-calendar-connect').classList.add('hidden');
      document.getElementById('calendar-connected-badge').classList.remove('hidden');
      document.getElementById('calendar-prompt').classList.add('hidden');
      document.getElementById('meetings-list').classList.remove('hidden');
      await Promise.all([fetchMeetings(), fetchSheetMetrics()]);
    }
  });
  tokenClient.requestAccessToken({ prompt: '' });
}

async function fetchMeetings() {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end   = new Date(now); end.setHours(23, 59, 59, 999);

  try {
    const res = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 30
    });
    meetings = res.result.items || [];
    renderMeetings();
    renderSuggested();
    renderWBR();
  } catch (e) {
    console.error('Calendar fetch failed', e);
  }
}

// ============================================================
// MEETING RENDERING
// ============================================================

function isFiltered(meeting) {
  const title = (meeting.summary || '').toLowerCase();
  return settings.meetingFilters.some(f => title.includes(f.toLowerCase()));
}

function formatTime(dateTimeStr) {
  if (!dateTimeStr) return '';
  const d = new Date(dateTimeStr);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getDuration(start, end) {
  if (!start || !end) return '';
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function isNow(meeting) {
  const now = Date.now();
  const s = meeting.start?.dateTime;
  const e = meeting.end?.dateTime;
  if (!s || !e) return false;
  return now >= new Date(s) && now <= new Date(e);
}

function findAgendaLink(meeting) {
  const desc = meeting.description || '';
  const urlMatch = desc.match(/https?:\/\/docs\.google\.com\/[^\s<"]+/);
  return urlMatch ? urlMatch[0] : (meeting.hangoutLink || null);
}

function renderMeetings() {
  const list = document.getElementById('meetings-list');
  const filteredList = document.getElementById('filtered-list');
  const filteredToggle = document.getElementById('filtered-toggle');
  const countBadge = document.getElementById('meeting-count');

  const visible  = meetings.filter(m => !isFiltered(m));
  const filtered = meetings.filter(m => isFiltered(m));

  countBadge.textContent = visible.length || '';
  countBadge.classList.toggle('hidden', !visible.length);

  list.innerHTML = visible.length
    ? visible.map(m => meetingHTML(m)).join('')
    : '<div style="padding:12px 0;color:var(--text-muted);font-size:13px;">No meetings today.</div>';

  if (filtered.length) {
    filteredToggle.classList.remove('hidden');
    document.getElementById('filtered-label').textContent =
      showFiltered ? `Hide ${filtered.length} filtered meeting${filtered.length > 1 ? 's' : ''}` : `Show ${filtered.length} hidden meeting${filtered.length > 1 ? 's' : ''}`;
    filteredList.innerHTML = filtered.map(m => meetingHTML(m, true)).join('');
    filteredList.classList.toggle('hidden', !showFiltered);
  } else {
    filteredToggle.classList.add('hidden');
  }
}

function meetingHTML(m, dimmed = false) {
  const time     = formatTime(m.start?.dateTime || m.start?.date);
  const duration = getDuration(m.start?.dateTime, m.end?.dateTime);
  const now      = isNow(m);
  const agenda   = findAgendaLink(m);
  const title    = m.summary || '(No title)';

  return `
    <div class="meeting-item${dimmed ? ' is-filtered' : ''}">
      <span class="meeting-time">${time}</span>
      <span class="meeting-dot" style="${m.colorId ? `background:${calendarColor(m.colorId)}` : ''}"></span>
      <div class="meeting-body">
        <div class="meeting-title" title="${escHtml(title)}">${escHtml(title)}</div>
        <div class="meeting-meta">
          ${duration ? `<span class="meeting-duration">${duration}</span>` : ''}
          ${agenda ? `<a class="meeting-agenda-link" href="${escAttr(agenda)}" target="_blank">Agenda ↗</a>` : ''}
          ${now ? `<span class="meeting-now">Now</span>` : ''}
        </div>
      </div>
    </div>`;
}

function calendarColor(id) {
  const colors = { 1:'#7986CB', 2:'#33B679', 3:'#8E24AA', 4:'#E67C73',
                   5:'#F6BF26', 6:'#F4511E', 7:'#039BE5', 8:'#616161',
                   9:'#3F51B5', 10:'#0B8043', 11:'#D50000' };
  return colors[id] || '#6366F1';
}

function toggleFiltered() {
  showFiltered = !showFiltered;
  renderMeetings();
}

// ============================================================
// GOOGLE SHEETS — PERFORMANCE METRICS
// ============================================================

// Convert column letter(s) to a 1-based number and back
function colToNum(col) {
  return col.toUpperCase().split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}
function numToCol(n) {
  let s = '';
  while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function prevColumn(col) {
  const n = colToNum(col);
  return n > 1 ? numToCol(n - 1) : null;
}

async function fetchSheetMetrics() {
  const metrics = settings.metrics || [];
  const col = (settings.currentCol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();

  if (!metrics.length) return;

  if (!col) {
    renderMetricsNeedColumn();
    return;
  }

  renderMetricsLoading();

  const prev = prevColumn(col);

  // Build one range per metric for current week, plus one for previous week (trend)
  const currRanges = metrics.map(m => `'${m.tab}'!${col}${m.row}`);
  const prevRanges = prev ? metrics.map(m => `'${m.tab}'!${prev}${m.row}`) : [];
  const allRanges  = [...currRanges, ...prevRanges];

  try {
    const res = await gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges: allRanges,
      valueRenderOption: 'FORMATTED_VALUE'   // get "34.4%" not "0.344"
    });

    const vrs = res.result.valueRanges || [];
    metrics.forEach((m, i) => {
      const current  = vrs[i]?.values?.[0]?.[0] ?? '—';
      const previous = prev ? (vrs[metrics.length + i]?.values?.[0]?.[0] ?? null) : null;
      metricValues[m.id] = { current, previous, updatedAt: new Date() };
    });

    renderPerformanceWidget();
  } catch (e) {
    console.error('Sheets fetch failed', e);
    renderMetricsError();
  }
}

function renderMetricsNeedColumn() {
  const bar = document.getElementById('performance-bar');
  if (!bar) return;
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="performance-header">
      <span class="section-label" style="margin:0">Performance</span>
    </div>
    <div class="metrics-setup-prompt">
      Set this week's column in <button class="btn-inline-link" onclick="openSettings()">⚙ Settings → Current Week Column</button> to load your metrics.
    </div>`;
}

function findTrend(current, previous) {
  if (previous == null) return null;
  // Strip % and commas, parse as float
  const parse = v => parseFloat(String(v).replace(/[%,]/g, ''));
  const curr = parse(current);
  const prev = parse(previous);
  if (isNaN(curr) || isNaN(prev)) return null;
  const diff   = curr - prev;
  const isPerc = String(current).includes('%');
  const fmt    = n => `${Math.abs(n).toFixed(1)}${isPerc ? '%' : ''}`;
  if (Math.abs(diff) < 0.05) return { dir: 'neutral', label: '→ No change' };
  return diff > 0
    ? { dir: 'up',   label: `↑ ${fmt(diff)} vs last week` }
    : { dir: 'down', label: `↓ ${fmt(diff)} vs last week` };
}

function renderPerformanceWidget() {
  const bar = document.getElementById('performance-bar');
  if (!bar) return;
  const metrics = settings.metrics || [];

  if (!metrics.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');

  const cards = metrics.map(m => {
    const val   = metricValues[m.id];
    const value = val?.current ?? '—';
    const trend = val ? findTrend(val.current, val.previous) : null;
    const trendHtml = trend
      ? `<span class="metric-trend trend-${trend.dir}">${trend.label}</span>`
      : '';
    const updated = val?.updatedAt
      ? `<span class="metric-updated">Updated ${formatRelativeTime(val.updatedAt)}</span>`
      : '';

    return `
      <div class="metric-card">
        <div class="metric-value">${escHtml(String(value))}</div>
        <div class="metric-label">${escHtml(m.label)}</div>
        ${trendHtml}
        ${updated}
      </div>`;
  }).join('');

  bar.innerHTML = `
    <div class="performance-header">
      <span class="section-label" style="margin:0">Performance</span>
      <button class="btn-refresh-metrics" onclick="fetchSheetMetrics()" title="Refresh">↻ Refresh</button>
    </div>
    <div class="metric-cards">${cards}</div>`;
}

function renderMetricsLoading() {
  const bar = document.getElementById('performance-bar');
  if (!bar) return;
  bar.classList.remove('hidden');
  const cards = (settings.metrics || []).map(() =>
    `<div class="metric-card metric-loading">
      <div class="metric-value">…</div>
      <div class="metric-label">Loading</div>
    </div>`
  ).join('');
  bar.innerHTML = `
    <div class="performance-header">
      <span class="section-label" style="margin:0">Performance</span>
    </div>
    <div class="metric-cards">${cards}</div>`;
}

function renderMetricsError() {
  const bar = document.getElementById('performance-bar');
  if (!bar) return;
  bar.innerHTML += `<p class="metrics-error">Could not load Sheet data. Check that Google Sheets API is enabled in your Cloud project.</p>`;
}

function formatRelativeTime(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ============================================================
// SMART RESOURCE RANKING
// ============================================================

function rankResources(subset) {
  const today  = new Date().getDay();
  const titles = meetings.map(m => (m.summary || '').toLowerCase());

  return subset.map(r => {
    let score = 0;

    // Frequency: up to 40 pts
    score += Math.min((r.clickCount || 0) * 3, 40);

    // Recency: up to 20 pts
    if (r.lastUsed) {
      const days = (Date.now() - new Date(r.lastUsed)) / 86400000;
      score += Math.max(0, 20 - days * 3);
    }

    // Day of week match: 30 pts
    if ((r.daysOfWeek || []).includes(today)) score += 30;

    // Calendar keyword match: 50 pts (highest weight)
    const calMatch = (r.calendarKeywords || []).some(kw =>
      titles.some(t => t.includes(kw.toLowerCase()))
    );
    if (calMatch) score += 50;

    return { ...r, _score: score, _calMatch: calMatch, _dayMatch: (r.daysOfWeek || []).includes(today) };
  }).sort((a, b) => b._score - a._score);
}

// ============================================================
// RESOURCE RENDERING
// ============================================================

function getCategoryIndex(cat) {
  return settings.categories.indexOf(cat) % 6;
}

function usageDots(count) {
  const filled = Math.min(Math.ceil((count || 0) / 2), 5);
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="usage-dot${i < filled ? ' filled' : ''}"></span>`
  ).join('');
}

function renderSuggested() {
  const ranked = rankResources(resources).slice(0, 6);
  const el = document.getElementById('suggested-list');
  const sec = document.getElementById('suggested-section');

  if (!ranked.length) { sec.style.display = 'none'; return; }
  sec.style.display = '';

  el.innerHTML = ranked.map(r => {
    const dotClass = r._calMatch ? 'matched' : r._dayMatch ? 'day-match' : '';
    return `<a class="resource-chip" href="${escAttr(r.url)}" target="_blank" onclick="trackClick('${r.id}')">
      <span class="chip-dot ${dotClass}"></span>${escHtml(r.title)}
    </a>`;
  }).join('');
}

function renderCategoryTabs() {
  const tabs = document.getElementById('category-tabs');
  const all = [{ id: 'all', label: 'All' }, ...settings.categories.map(c => ({ id: c, label: c }))];
  tabs.innerHTML = all.map(t =>
    `<button class="tab-btn${activeCategory === t.id ? ' active' : ''}" onclick="setCategory('${escAttr(t.id)}')">${escHtml(t.label)}</button>`
  ).join('');
}

function renderResources() {
  const query = (document.getElementById('resource-search')?.value || '').toLowerCase();
  let subset = resources;

  if (activeCategory !== 'all') subset = subset.filter(r => r.category === activeCategory);
  if (query) subset = subset.filter(r =>
    r.title.toLowerCase().includes(query) ||
    r.tags?.some(t => t.toLowerCase().includes(query)) ||
    r.category?.toLowerCase().includes(query)
  );

  const ranked = rankResources(subset);
  const grid = document.getElementById('resource-grid');
  const empty = document.getElementById('empty-resources');

  if (!ranked.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = ranked.map(r => {
    const catIdx = getCategoryIndex(r.category);
    const tags   = (r.tags || []).slice(0, 3).map(t => `<span class="resource-tag">${escHtml(t)}</span>`).join('');
    return `
      <a class="resource-card" href="${escAttr(r.url)}" target="_blank" onclick="trackClick('${r.id}')">
        <div class="resource-card-header">
          <span class="resource-card-title">${escHtml(r.title)}</span>
          <button class="resource-card-edit" onclick="editResource(event,'${r.id}')">✎</button>
        </div>
        <span class="resource-card-category cat-${catIdx}">${escHtml(r.category || '')}</span>
        <div class="resource-card-footer">
          <div class="usage-dots">${usageDots(r.clickCount)}</div>
        </div>
        ${tags ? `<div class="resource-tags">${tags}</div>` : ''}
      </a>`;
  }).join('');
}

function setCategory(cat) {
  activeCategory = cat;
  renderCategoryTabs();
  renderResources();
}

function trackClick(id) {
  const r = resources.find(x => x.id === id);
  if (!r) return;
  r.clickCount = (r.clickCount || 0) + 1;
  r.lastUsed = new Date().toISOString();
  save();
  // Re-render suggested asynchronously so the link click fires first
  setTimeout(() => { renderSuggested(); renderResources(); }, 100);
}

// ============================================================
// WBR LOGIC
// ============================================================

function isWBRDueToday(type) {
  const today = new Date().getDay();
  if (type === 'merchant') {
    return today === (settings.wbr.merchant.dayOfWeek ?? 1);
  }
  if (type === 'iops') {
    if (today !== (settings.wbr.iops.dayOfWeek ?? 3)) return false;
    const last = wbrState.iops ? new Date(wbrState.iops) : null;
    if (!last) return true;
    return (Date.now() - last) / 86400000 >= 13;
  }
  return false;
}

function renderWBR() {
  const container = document.getElementById('wbr-cards');
  // Cards are always visible — due day just highlights them
  container.innerHTML = [
    wbrCardHTML('merchant', 'Merchant WBR', 'Weekly'),
    wbrCardHTML('iops',     'Iops WBR',     'Bi-Weekly')
  ].join('');
}

function wbrCardHTML(type, name, freq) {
  const savedDraft = localStorage.getItem(`wbr_draft_${type}`) || '';
  const savedLink  = wbrLinks[type] || '';
  const due        = isWBRDueToday(type);
  const openBtn    = savedLink
    ? `<a class="wbr-open-link" href="${escAttr(savedLink)}" target="_blank">Open this week's doc ↗</a>`
    : `<span class="wbr-open-link" style="color:var(--text-light);cursor:default;">Paste this week's link below</span>`;

  return `
    <div class="wbr-card${due ? ' wbr-due' : ''}" id="wbr-${type}">
      <div class="wbr-card-header">
        <span class="wbr-card-title">📊 ${escHtml(name)}</span>
        <span class="wbr-badge">${due ? '🔴 Due Today' : escHtml(freq)}</span>
      </div>
      ${openBtn}
      <div class="wbr-link-row">
        <input
          type="url"
          id="wbr-link-${type}"
          class="wbr-link-input"
          placeholder="Paste this week's Google Doc link…"
          value="${escAttr(savedLink)}"
          oninput="saveWBRLink('${type}')"
        >
      </div>
      <textarea
        id="wbr-draft-${type}"
        placeholder="Draft your commentary here — key trends, highlights, risks, and actions…"
        oninput="saveDraft('${type}')"
      >${escHtml(savedDraft)}</textarea>
      <div class="wbr-actions">
        <button class="btn-copy" id="wbr-copy-${type}" onclick="copyCommentary('${type}')">Copy Commentary</button>
        <button class="btn-complete" onclick="markWBRComplete('${type}')">Dismiss ✕</button>
      </div>
    </div>`;
}

function saveWBRLink(type) {
  const val = document.getElementById(`wbr-link-${type}`)?.value.trim() || '';
  wbrLinks[type] = val;
  localStorage.setItem('dash_wbr_links', JSON.stringify(wbrLinks));
  // Update the open link in place
  const card = document.getElementById(`wbr-${type}`);
  if (!card) return;
  const openEl = card.querySelector('.wbr-open-link');
  if (!openEl) return;
  if (val) {
    openEl.outerHTML = `<a class="wbr-open-link" href="${escAttr(val)}" target="_blank">Open this week's doc ↗</a>`;
  }
}

function saveDraft(type) {
  const val = document.getElementById(`wbr-draft-${type}`)?.value || '';
  localStorage.setItem(`wbr_draft_${type}`, val);
}

function copyCommentary(type) {
  const text = document.getElementById(`wbr-draft-${type}`)?.value || '';
  if (!text.trim()) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById(`wbr-copy-${type}`);
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy Commentary'; btn.classList.remove('copied'); }, 2000);
  });
}

function markWBRComplete(type) {
  wbrState[type] = new Date().toISOString();
  save();
  document.getElementById(`wbr-${type}`)?.remove();
}

// ============================================================
// RESOURCE MODAL (ADD / EDIT)
// ============================================================

function openAddResource() {
  document.getElementById('modal-resource-title').textContent = 'Add Resource';
  document.getElementById('resource-id').value = '';
  document.getElementById('resource-title').value = '';
  document.getElementById('resource-url').value = '';
  document.getElementById('resource-tags').value = '';
  document.getElementById('resource-cal-keywords').value = '';
  document.getElementById('btn-delete-resource').classList.add('hidden');

  populateCategorySelect();
  clearDayCheckboxes();
  openModal('modal-resource');
}

function editResource(e, id) {
  e.preventDefault();
  e.stopPropagation();
  const r = resources.find(x => x.id === id);
  if (!r) return;

  document.getElementById('modal-resource-title').textContent = 'Edit Resource';
  document.getElementById('resource-id').value = r.id;
  document.getElementById('resource-title').value = r.title;
  document.getElementById('resource-url').value = r.url;
  document.getElementById('resource-tags').value = (r.tags || []).join(', ');
  document.getElementById('resource-cal-keywords').value = (r.calendarKeywords || []).join(', ');
  document.getElementById('btn-delete-resource').classList.remove('hidden');

  populateCategorySelect(r.category);
  setDayCheckboxes(r.daysOfWeek || []);
  openModal('modal-resource');
}

function populateCategorySelect(selected) {
  const sel = document.getElementById('resource-category');
  sel.innerHTML = settings.categories.map(c =>
    `<option value="${escAttr(c)}"${c === selected ? ' selected' : ''}>${escHtml(c)}</option>`
  ).join('');
}

function clearDayCheckboxes() {
  document.querySelectorAll('#resource-days input[type="checkbox"]').forEach(cb => cb.checked = false);
}

function setDayCheckboxes(days) {
  document.querySelectorAll('#resource-days input[type="checkbox"]').forEach(cb => {
    cb.checked = days.includes(parseInt(cb.value));
  });
}

function getCheckedDays() {
  return [...document.querySelectorAll('#resource-days input[type="checkbox"]:checked')]
    .map(cb => parseInt(cb.value));
}

function saveResource() {
  const id    = document.getElementById('resource-id').value;
  const title = document.getElementById('resource-title').value.trim();
  const url   = document.getElementById('resource-url').value.trim();
  if (!title || !url) { alert('Title and URL are required.'); return; }

  const tags     = document.getElementById('resource-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const calKws   = document.getElementById('resource-cal-keywords').value.split(',').map(t => t.trim()).filter(Boolean);
  const category = document.getElementById('resource-category').value;
  const days     = getCheckedDays();

  if (id) {
    const r = resources.find(x => x.id === id);
    if (r) Object.assign(r, { title, url, category, tags, daysOfWeek: days, calendarKeywords: calKws });
  } else {
    resources.push({
      id: 'r_' + Date.now(),
      title, url, category, tags,
      daysOfWeek: days,
      calendarKeywords: calKws,
      clickCount: 0,
      lastUsed: null
    });
  }

  save();
  closeModal();
  renderSuggested();
  renderResources();
}

function deleteResource() {
  const id = document.getElementById('resource-id').value;
  if (!id || !confirm('Delete this resource?')) return;
  resources = resources.filter(r => r.id !== id);
  save();
  closeModal();
  renderSuggested();
  renderResources();
}

// ============================================================
// SETTINGS MODAL
// ============================================================

function openSettings() {
  document.getElementById('setting-client-id').value = settings.googleClientId || '';
  document.getElementById('setting-current-col').value = settings.currentCol || '';
  document.getElementById('setting-merchant-day').value = settings.wbr.merchant.dayOfWeek ?? 1;
  document.getElementById('setting-iops-day').value = settings.wbr.iops.dayOfWeek ?? 3;
  renderFilterTags();
  renderCategoryTagsInSettings();
  openModal('modal-settings');
}

function renderFilterTags() {
  document.getElementById('filter-tags').innerHTML =
    (settings.meetingFilters || []).map((f, i) =>
      `<span class="tag-chip">${escHtml(f)}<button onclick="removeFilter(${i})">×</button></span>`
    ).join('');
}

function renderCategoryTagsInSettings() {
  document.getElementById('category-tags').innerHTML =
    (settings.categories || []).map((c, i) =>
      `<span class="tag-chip">${escHtml(c)}<button onclick="removeCat(${i})">×</button></span>`
    ).join('');
}

function addFilter() {
  const inp = document.getElementById('new-filter-input');
  const val = inp.value.trim();
  if (!val) return;
  settings.meetingFilters = [...new Set([...(settings.meetingFilters || []), val])];
  inp.value = '';
  renderFilterTags();
}

function removeFilter(i) {
  settings.meetingFilters.splice(i, 1);
  renderFilterTags();
}

function addCategory() {
  const inp = document.getElementById('new-category-input');
  const val = inp.value.trim();
  if (!val) return;
  settings.categories = [...new Set([...(settings.categories || []), val])];
  inp.value = '';
  renderCategoryTagsInSettings();
}

function removeCat(i) {
  settings.categories.splice(i, 1);
  renderCategoryTagsInSettings();
}

function saveSettings() {
  settings.googleClientId         = document.getElementById('setting-client-id').value.trim();
  settings.currentCol             = document.getElementById('setting-current-col').value.replace(/[^a-zA-Z]/g, '').toUpperCase();
  settings.wbr.merchant.dayOfWeek = parseInt(document.getElementById('setting-merchant-day').value);
  settings.wbr.iops.dayOfWeek     = parseInt(document.getElementById('setting-iops-day').value);
  save();
  closeModal();
  renderCategoryTabs();
  renderResources();
  renderWBR();
  renderMeetings();
  // Re-fetch metrics with updated column
  if (accessToken) fetchSheetMetrics();
  else renderMetricsNeedColumn();
}

// ============================================================
// MODAL HELPERS
// ============================================================

function openModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ============================================================
// UTILS
// ============================================================

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================
// INIT
// ============================================================

function init() {
  updateClock();
  setInterval(updateClock, 30000);

  // Auto-refresh meetings + metrics every 5 min if connected
  setInterval(() => {
    if (accessToken) {
      fetchMeetings();
      fetchSheetMetrics();
    }
  }, 300000);

  renderCategoryTabs();
  renderResources();
  renderSuggested();
  renderWBR();
  renderMetricsNeedColumn(); // Show performance bar immediately; updates after auth + column set

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

document.addEventListener('DOMContentLoaded', init);
