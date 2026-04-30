/* ============================================================
   DASHBOARD APP
   All state is persisted in localStorage.
   Google Calendar requires a Client ID set in Settings.
============================================================ */

// ============================================================
// DEFAULT CONFIG
// ============================================================

const DEFAULT_SETTINGS = {
  googleClientId: '',
  currentCol: '',
  performanceSheetId: '',
  sdoSheetId: '',
  sdoTab: 'SDO Log',
  wbrConfig: {
    teamName: '',
    authors: '',
    sdrQ1Exit: '',
    sdrQTDPlan: '',
    ad30Q1Exit: '',
    ad30QTDPlan: '',
    ad30Goal: ''
  },
  sdoColumns: {
    READY: 1,
    AGENT: 4,
    DATE: 5,
    RESCHEDULED: 14,
    ZOOM_NOTES: 17,
    DURATION: 23
  },
  meetingFilters: [
    'DoorDash Onboarding Support',
    'Same Day Onboarding Scheduler'
  ],
  categories: [
    'Team Docs',
    'Performance Tracking',
    'Meeting Agendas',
    'Resources and Process Docs',
    'Volume Tracking'
  ],
  metrics: []
};

const DEFAULT_RESOURCES = [
];

// ============================================================
// STATE
// ============================================================

let settings    = loadJSON('dash_settings', DEFAULT_SETTINGS);
let resources   = loadJSON('dash_resources', DEFAULT_RESOURCES);
let collapsed   = loadJSON('dash_collapsed', { meetings: false, resources: false, wbrDraft: false });
let resourcesExpanded = false;
let meetingsExpanded  = false;
let meetings      = [];   // from Google Calendar (runtime only)
let metricValues  = {};   // { metricId: { current, previous, updatedAt } }
let sdoMetrics    = null; // computed from SDO Log sheet
let activeCategory = 'all';
let showFiltered   = false;
let tokenClient    = null;
let accessToken    = null;

// ============================================================
// PERSISTENCE
// ============================================================

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return deepClone(fallback);
    const parsed = JSON.parse(raw);
    // Arrays must be returned as-is — deepMerge would corrupt them into plain objects
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : deepClone(fallback);
    if (typeof parsed !== 'object' || parsed === null) return deepClone(fallback);
    return deepMerge(deepClone(fallback), parsed);
  } catch {
    localStorage.removeItem(key);
    return deepClone(fallback);
  }
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override)) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])
        && base[key] && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

function save() {
  localStorage.setItem('dash_settings', JSON.stringify(settings));
  localStorage.setItem('dash_resources', JSON.stringify(resources));
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
// GOOGLE AUTH
// ============================================================

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/spreadsheets.readonly';

let _gapiReady = false;
let _gisReady  = false;

// Called by onload on the gapi script tag
function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({
      discoveryDocs: [
        'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
        'https://sheets.googleapis.com/$discovery/rest?version=v4'
      ]
    });
    _gapiReady = true;
    initTokenClientIfReady();
  });
}

// Called by onload on the GIS script tag
function gisLoaded() {
  _gisReady = true;
  initTokenClientIfReady();
}

// Set up the token client once both libraries are ready
function initTokenClientIfReady() {
  if (!_gapiReady || !_gisReady || !settings.googleClientId) return;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: settings.googleClientId,
    scope: SCOPES,
    callback: onAuthSuccess,
    error_callback: (err) => {
      // Silent auth failed — user needs to click Connect
      console.log('Silent auth unavailable:', err?.type);
    }
  });

  // prompt:'none' = fully silent, no popup, no browser block.
  // Succeeds only if the user has an active Google session for this app.
  // If it fails, the Connect button stays visible for the user to click once.
  tokenClient.requestAccessToken({ prompt: 'none' });
}

function onAuthSuccess(tokenResponse) {
  if (tokenResponse.error) return;
  accessToken = tokenResponse.access_token;
  gapi.client.setToken({ access_token: accessToken });

  document.getElementById('btn-calendar-connect').classList.add('hidden');
  document.getElementById('calendar-connected-badge').classList.remove('hidden');
  document.getElementById('calendar-prompt').classList.add('hidden');
  document.getElementById('meetings-list').classList.remove('hidden');

  Promise.all([fetchMeetings(), fetchSheetMetrics(), fetchSDOMetrics()]);

  // Auto-refresh token 5 min before expiry (tokens last ~1 hour)
  const refreshIn = ((tokenResponse.expires_in || 3600) - 300) * 1000;
  setTimeout(() => {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: 'none' });
  }, refreshIn);
}

// Connect button — user-triggered so browser allows the popup
function connectCalendar() {
  if (!settings.googleClientId) {
    openSettings();
    alert('Enter your Google Client ID in Settings first.');
    return;
  }
  if (!tokenClient) {
    alert('Still loading — please try again in a moment.');
    return;
  }
  // User gesture = browser allows popup; select_account lets them pick their account
  tokenClient.requestAccessToken({ prompt: 'select_account' });
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
    const raw = res.result.items || [];

    // Deduplicate by event ID (same event can appear from multiple calendars)
    const seen = new Set();
    const deduped = raw.filter(m => {
      const key = m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Drop all-day events (no dateTime = not a scheduled meeting)
    // Drop events the user has declined
    meetings = deduped.filter(m => {
      if (!m.start?.dateTime) return false; // all-day / date-only event
      const self = (m.attendees || []).find(a => a.self);
      if (self?.responseStatus === 'declined') return false;
      return true;
    });

    meetingsExpanded = false; // reset to compact view on fresh load
    renderMeetings();
    renderSuggested();
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

  // Collapsed view: next 4 upcoming meetings (now or future)
  const MEET_LIMIT = 4;
  let toShow = visible;
  let hiddenCount = 0;
  if (!meetingsExpanded && visible.length > MEET_LIMIT) {
    const now = Date.now();
    // upcoming = happening now or not yet ended
    const upcoming = visible.filter(m => {
      const end = m.end?.dateTime ? new Date(m.end.dateTime).getTime() : Infinity;
      return end >= now;
    });
    toShow = upcoming.length ? upcoming.slice(0, MEET_LIMIT) : visible.slice(0, MEET_LIMIT);
    hiddenCount = visible.length - toShow.length;
  }

  list.innerHTML = toShow.length
    ? toShow.map(m => meetingHTML(m)).join('')
    : '<div style="padding:12px 0;color:var(--text-muted);font-size:13px;">No meetings today.</div>';

  // Show-more toggle
  const existingToggle = document.getElementById('meetings-show-more');
  if (existingToggle) existingToggle.remove();
  if (visible.length > MEET_LIMIT) {
    const btn = document.createElement('button');
    btn.id = 'meetings-show-more';
    btn.className = 'btn-show-more';
    btn.textContent = meetingsExpanded
      ? 'Show less'
      : `Show full day (${hiddenCount} more)`;
    btn.onclick = () => { meetingsExpanded = !meetingsExpanded; renderMeetings(); };
    list.after(btn);
  }

  // Filtered (hidden) meetings — only shown when expanded
  if (filtered.length && meetingsExpanded) {
    filteredToggle.classList.remove('hidden');
    document.getElementById('filtered-label').textContent =
      showFiltered ? `Hide ${filtered.length} filtered meeting${filtered.length > 1 ? 's' : ''}` : `Show ${filtered.length} hidden meeting${filtered.length > 1 ? 's' : ''}`;
    filteredList.innerHTML = filtered.map(m => meetingHTML(m, true)).join('');
    filteredList.classList.toggle('hidden', !showFiltered);
  } else {
    filteredToggle.classList.add('hidden');
    filteredList.classList.add('hidden');
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
  const metrics = (settings.metrics || []).filter(m => m.tab && m.row);
  const col = (settings.currentCol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();

  if (!metrics.length) return;

  if (!settings.performanceSheetId) {
    renderMetricsNeedSetup();
    return;
  }

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
      spreadsheetId: settings.performanceSheetId,
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

function renderMetricsNeedSetup() {
  const bar = document.getElementById('performance-bar');
  if (!bar) return;
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="performance-header">
      <span class="section-label" style="margin:0">Performance</span>
    </div>
    <div class="metrics-setup-prompt">
      Add your sheet info in <button class="btn-inline-link" onclick="openSettings()">⚙ Settings → Data Sources</button> to load metrics.
    </div>`;
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

// ============================================================
// SDO LOG METRICS
// ============================================================

let sdoFilter   = 'this-week';  // 'this-week' | 'last-week' | 'last-month'
let sdoAllRows  = [];           // cached raw rows from last fetch

const SDO_FILTER_LABELS = { 'this-week': 'This Week', 'last-week': 'Last Week', 'last-month': 'Last Month' };

async function fetchSDOMetrics() {
  if (!accessToken) return;
  if (!settings.sdoSheetId) return;
  const el = document.getElementById('sdo-section');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="performance-header">
      <span class="section-label" style="margin:0">Same Day Onboarding</span>
    </div>
    <div class="metric-cards">${[1,2,3,4,5].map(() =>
      '<div class="metric-card metric-loading"><div class="metric-value">…</div><div class="metric-label">Loading</div></div>'
    ).join('')}</div>`;
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: settings.sdoSheetId,
      range: `'${settings.sdoTab || 'SDO Log'}'!A2:Y`,
      valueRenderOption: 'FORMATTED_VALUE'
    });
    sdoAllRows = res.result.values || [];
    sdoMetrics = computeSDOMetrics(sdoAllRows, sdoFilter);
    renderSDOWidget();
  } catch (e) {
    console.error('SDO fetch failed', e);
    el.innerHTML += `<p class="metrics-error">Could not load SDO Log data.</p>`;
  }
}

function setSDOFilter(filter) {
  sdoFilter = filter;
  sdoMetrics = computeSDOMetrics(sdoAllRows, sdoFilter);
  renderSDOWidget();
}

function getDateBounds(filter) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun

  if (filter === 'this-week') {
    const start = new Date(now);
    start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (filter === 'last-week') {
    const start = new Date(now);
    start.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (filter === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  }

  return { start: new Date(0), end: new Date() };
}

function computeSDOMetrics(rows, filter) {
  const cols = settings.sdoColumns;
  const { start, end } = getDateBounds(filter);
  const subset = rows.filter(row => {
    const d = new Date(row[cols.DATE] || '');
    return !isNaN(d) && d >= start && d <= end;
  });

  const scheduled   = subset.length;
  const activated   = subset.filter(r => (r[cols.READY] || '').toUpperCase() === 'YES').length;
  const isNoShow    = r => /no.?show/i.test(r[cols.ZOOM_NOTES] || '');
  const canceled    = subset.filter(isNoShow).length;
  const rescheduled = subset.filter(r => (r[cols.RESCHEDULED] || '').toUpperCase() === 'YES').length;
  const rate        = scheduled > 0 ? Math.round((activated / scheduled) * 100) : 0;

  const agentMap = {};
  subset.forEach(r => {
    const name = (r[cols.AGENT] || 'Unknown').trim();
    if (!agentMap[name]) agentMap[name] = { scheduled: 0, activated: 0, canceled: 0 };
    agentMap[name].scheduled++;
    if ((r[cols.READY] || '').toUpperCase() === 'YES') agentMap[name].activated++;
    if (isNoShow(r)) agentMap[name].canceled++;
  });

  const agents = Object.entries(agentMap)
    .map(([name, s]) => ({ name, ...s, rate: s.scheduled > 0 ? Math.round((s.activated / s.scheduled) * 100) : 0 }))
    .sort((a, b) => b.scheduled - a.scheduled);

  return { scheduled, activated, canceled, rescheduled, rate, agents };
}

function renderSDOWidget() {
  const el = document.getElementById('sdo-section');
  if (!el || !sdoMetrics) return;
  const { scheduled, activated, canceled, rescheduled, rate, agents } = sdoMetrics;

  const filterBtns = Object.entries(SDO_FILTER_LABELS).map(([key, label]) =>
    `<button class="tab-btn${sdoFilter === key ? ' active' : ''}" onclick="setSDOFilter('${key}')">${label}</button>`
  ).join('');

  const agentRows = agents.map(a => `
    <tr>
      <td>${escHtml(a.name)}</td>
      <td class="num">${a.scheduled}</td>
      <td class="num">${a.activated}</td>
      <td class="num">${a.canceled}</td>
      <td class="num"><span class="rate-badge ${a.rate >= 70 ? 'rate-good' : a.rate >= 40 ? 'rate-ok' : 'rate-low'}">${a.rate}%</span></td>
    </tr>`).join('');

  el.innerHTML = `
    <div class="performance-header">
      <span class="section-label" style="margin:0">Same Day Onboarding</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="sdo-filter-tabs">${filterBtns}</div>
        <button class="btn-refresh-metrics" onclick="fetchSDOMetrics()" title="Refresh">&#8635;</button>
      </div>
    </div>
    <div class="metric-cards">
      <div class="metric-card"><div class="metric-value">${scheduled}</div><div class="metric-label">Scheduled</div></div>
      <div class="metric-card"><div class="metric-value">${activated}</div><div class="metric-label">Activated</div></div>
      <div class="metric-card"><div class="metric-value">${canceled}</div><div class="metric-label">No Shows</div></div>
      <div class="metric-card"><div class="metric-value">${rescheduled}</div><div class="metric-label">Rescheduled</div></div>
      <div class="metric-card"><div class="metric-value">${rate}%</div><div class="metric-label">Activation Rate</div></div>
    </div>
    ${agents.length ? `
    <div class="sdo-table-wrap">
      <table class="sdo-table">
        <thead><tr><th>Agent</th><th>Scheduled</th><th>Activated</th><th>No Shows</th><th>Rate</th></tr></thead>
        <tbody>${agentRows}</tbody>
      </table>
    </div>` : ''}`;
}

// ============================================================
// WBR DRAFT GENERATOR
// ============================================================

function generateWBRDraft() {
  const wbr     = settings.wbrConfig || {};
  const metrics = settings.metrics || [];
  const m0      = metrics[0] || {};
  const m1      = metrics[1] || {};
  const sdrVal  = metricValues[m0.id];
  const ad30Val = metricValues[m1.id];
  const sdr     = sdrVal?.current  ?? null;
  const sdrPrev = sdrVal?.previous ?? null;
  const ad30    = ad30Val?.current ?? null;

  // WoW change
  const toNum  = v => v ? parseFloat(String(v).replace(/[%,]/g, '')) : null;
  const sdrNum = toNum(sdr);
  const preNum = toNum(sdrPrev);
  const diff   = sdrNum !== null && preNum !== null && !isNaN(sdrNum) && !isNaN(preNum)
    ? sdrNum - preNum : null;
  const wowLabel = diff !== null
    ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pp`
    : '[WoW change]';
  const wowInline = diff !== null ? ` ${wowLabel} WoW` : '';

  // Trend word for TLDR
  const trend = diff === null ? 'holding steady'
    : diff >  0.5 ? 'improving'
    : diff < -0.5 ? 'under pressure'
    : 'holding steady';

  // SDO last-week data
  const sdo       = computeSDOMetrics(sdoAllRows, 'last-week');
  const hasSDO    = sdo.scheduled > 0;
  const noShowRisk = sdo.canceled > 0
    ? ` This was primarily driven by ${sdo.canceled} Mx no-shows in SDO.`
    : '';

  const sdrDisplay  = sdr  ? String(sdr)  : '[Metric 1 value]';
  const ad30Display = ad30 ? String(ad30) : '[Metric 2 value]';
  const teamName    = wbr.teamName || '[TEAM NAME]';
  const authors     = wbr.authors  || '[Authors]';
  const m0label     = m0.label || 'Metric 1';
  const m1label     = m1.label || 'Metric 2';

  const draft =
`${teamName}  ${authors}
TLDR: Performance is ${trend} with ${m0label} at ${sdrDisplay}${wowInline} and ${m1label} at ${ad30Display}${hasSDO ? `. SDO saw ${sdo.scheduled} bookings with ${sdo.activated} activations (${sdo.rate}% activation rate)` : ''}.
Risks: None at this time

North Star OKR	Prior Qtr Exit	QTD Plan	This Week	WoW Change
${m0label}	${wbr.sdrQ1Exit || '[Prior Exit]'}	${wbr.sdrQTDPlan || '[QTD Plan]'}	${sdrDisplay}	${wowLabel}

Team OKR	Prior Qtr Exit	QTD Plan	QTD Actual	Quarter Goal
${m1label}	${wbr.ad30Q1Exit || '[Prior Exit]'}	${wbr.ad30QTDPlan || '[QTD Plan]'}	${ad30Display}	${wbr.ad30Goal || '[Goal]'}


Pacing
${m0label}, ${m1label} Updates:
TL;DR - This week onboarding landed at ${sdrDisplay}${wowInline} and ${ad30Display} ${m1label}.${noShowRisk}
Impact/Risk - [Add impact/risk narrative]
Next Steps - [Add next steps]

Top Things to Know
${hasSDO ? `SDO Volume: ${sdo.scheduled} bookings scheduled last week; ${sdo.activated} were same-day ready (${sdo.rate}%), and ${sdo.canceled} no-shows.` : 'SDO Volume: [bookings] scheduled — connect calendar to load live data.'}
[Add additional key point]
[Add additional key point]`;

  const saved = localStorage.getItem('wbr_commentary_draft');
  const body  = document.getElementById('wbr-draft-body');
  body.innerHTML = `
    <textarea
      id="wbr-commentary-text"
      class="wbr-commentary-textarea"
      oninput="localStorage.setItem('wbr_commentary_draft', this.value)"
    >${escHtml(draft)}</textarea>
    <div class="wbr-draft-actions">
      <button class="btn btn-ghost btn-sm" onclick="clearWBRDraft()">Clear</button>
      <button id="wbr-copy-btn" class="btn btn-primary btn-sm" onclick="copyWBRDraft()">Copy Commentary</button>
    </div>`;
}

function loadSavedWBRDraft() {
  const saved = localStorage.getItem('wbr_commentary_draft');
  if (!saved) return;
  const body = document.getElementById('wbr-draft-body');
  body.innerHTML = `
    <textarea
      id="wbr-commentary-text"
      class="wbr-commentary-textarea"
      oninput="localStorage.setItem('wbr_commentary_draft', this.value)"
    >${escHtml(saved)}</textarea>
    <div class="wbr-draft-actions">
      <button class="btn btn-ghost btn-sm" onclick="clearWBRDraft()">Clear</button>
      <button id="wbr-copy-btn" class="btn btn-primary btn-sm" onclick="copyWBRDraft()">Copy Commentary</button>
    </div>`;
}

function copyWBRDraft() {
  const text = document.getElementById('wbr-commentary-text')?.value || '';
  if (!text.trim()) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('wbr-copy-btn');
    if (!btn) return;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Commentary'; }, 2000);
  });
}

function clearWBRDraft() {
  localStorage.removeItem('wbr_commentary_draft');
  document.getElementById('wbr-draft-body').innerHTML =
    '<p class="empty-state-hint">Click Generate Draft to build this week\'s commentary from live data.</p>';
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
    parseTags(r.tags).some(t => t.toLowerCase().includes(query)) ||
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

  const PAGE = 8;
  const visible = resourcesExpanded ? ranked : ranked.slice(0, PAGE);

  grid.innerHTML = visible.map(r => {
    const catIdx = getCategoryIndex(r.category);
    const tags   = parseTags(r.tags).slice(0, 3).map(t => `<span class="resource-tag">${escHtml(t)}</span>`).join('');
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

  // Show more / show less button
  const existingToggle = document.getElementById('resources-show-more');
  if (existingToggle) existingToggle.remove();
  if (ranked.length > PAGE) {
    const btn = document.createElement('button');
    btn.id = 'resources-show-more';
    btn.className = 'btn-show-more';
    btn.textContent = resourcesExpanded
      ? 'Show less'
      : `Show ${ranked.length - PAGE} more…`;
    btn.onclick = () => { resourcesExpanded = !resourcesExpanded; renderResources(); };
    grid.after(btn);
  }
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
  document.getElementById('resource-tags').value = parseTags(r.tags).join(', ');
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
  document.getElementById('setting-perf-sheet-id').value = settings.performanceSheetId || '';
  document.getElementById('setting-sdo-sheet-id').value = settings.sdoSheetId || '';
  document.getElementById('setting-sdo-tab').value = settings.sdoTab || 'SDO Log';
  const wbr = settings.wbrConfig || {};
  document.getElementById('setting-wbr-team').value    = wbr.teamName   || '';
  document.getElementById('setting-wbr-authors').value = wbr.authors    || '';
  document.getElementById('setting-wbr-sdr-exit').value  = wbr.sdrQ1Exit  || '';
  document.getElementById('setting-wbr-sdr-qtd').value   = wbr.sdrQTDPlan || '';
  document.getElementById('setting-wbr-ad30-exit').value = wbr.ad30Q1Exit || '';
  document.getElementById('setting-wbr-ad30-qtd').value  = wbr.ad30QTDPlan || '';
  document.getElementById('setting-wbr-ad30-goal').value = wbr.ad30Goal   || '';
  const cols = settings.sdoColumns || {};
  document.getElementById('setting-sdo-col-ready').value       = cols.READY       ?? 1;
  document.getElementById('setting-sdo-col-agent').value       = cols.AGENT       ?? 4;
  document.getElementById('setting-sdo-col-date').value        = cols.DATE        ?? 5;
  document.getElementById('setting-sdo-col-reschedule').value  = cols.RESCHEDULED ?? 14;
  document.getElementById('setting-sdo-col-zoom').value        = cols.ZOOM_NOTES  ?? 17;
  renderMetricsSettings();
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
  settings.googleClientId      = document.getElementById('setting-client-id').value.trim();
  settings.currentCol          = document.getElementById('setting-current-col').value.replace(/[^a-zA-Z]/g, '').toUpperCase();
  settings.performanceSheetId  = document.getElementById('setting-perf-sheet-id').value.trim();
  settings.sdoSheetId          = document.getElementById('setting-sdo-sheet-id').value.trim();
  settings.sdoTab              = document.getElementById('setting-sdo-tab').value.trim() || 'SDO Log';
  settings.wbrConfig = {
    teamName:    document.getElementById('setting-wbr-team').value.trim(),
    authors:     document.getElementById('setting-wbr-authors').value.trim(),
    sdrQ1Exit:   document.getElementById('setting-wbr-sdr-exit').value.trim(),
    sdrQTDPlan:  document.getElementById('setting-wbr-sdr-qtd').value.trim(),
    ad30Q1Exit:  document.getElementById('setting-wbr-ad30-exit').value.trim(),
    ad30QTDPlan: document.getElementById('setting-wbr-ad30-qtd').value.trim(),
    ad30Goal:    document.getElementById('setting-wbr-ad30-goal').value.trim()
  };
  settings.sdoColumns = {
    READY:       parseInt(document.getElementById('setting-sdo-col-ready').value)      || 1,
    AGENT:       parseInt(document.getElementById('setting-sdo-col-agent').value)      || 4,
    DATE:        parseInt(document.getElementById('setting-sdo-col-date').value)       || 5,
    RESCHEDULED: parseInt(document.getElementById('setting-sdo-col-reschedule').value) || 14,
    ZOOM_NOTES:  parseInt(document.getElementById('setting-sdo-col-zoom').value)       || 17,
    DURATION:    23
  };
  saveMetricsFromSettings();
  save();
  closeModal();
  renderCategoryTabs();
  renderResources();
  renderMeetings();
  if (accessToken) { fetchSheetMetrics(); fetchSDOMetrics(); }
  else if (!settings.performanceSheetId) renderMetricsNeedSetup();
  else renderMetricsNeedColumn();
}

function renderMetricsSettings() {
  const list = document.getElementById('metrics-settings-list');
  if (!list) return;
  const metrics = settings.metrics || [];
  list.innerHTML = metrics.map((m, i) => `
    <div class="metric-settings-row">
      <input type="text" class="ms-label" value="${escHtml(m.label)}" placeholder="Label (e.g. Same Day Ready)">
      <input type="text" class="ms-tab" value="${escHtml(m.tab || '')}" placeholder="Sheet tab name">
      <input type="number" class="ms-row" value="${m.row || ''}" placeholder="Row #" min="1">
      <button class="btn btn-sm btn-ghost" style="color:var(--danger);flex-shrink:0" onclick="removeMetricSetting(${i})">✕</button>
    </div>`
  ).join('');
}

function addMetricSetting() {
  if (!settings.metrics) settings.metrics = [];
  settings.metrics.push({ id: 'metric_' + Date.now(), label: '', tab: '', row: 1 });
  renderMetricsSettings();
}

function removeMetricSetting(i) {
  settings.metrics.splice(i, 1);
  renderMetricsSettings();
}

function saveMetricsFromSettings() {
  const rows = document.querySelectorAll('.metric-settings-row');
  settings.metrics = [...rows].map((row, i) => {
    const existingId = (settings.metrics[i] || {}).id || ('metric_' + Date.now() + '_' + i);
    return {
      id:    existingId,
      label: row.querySelector('.ms-label').value.trim(),
      tab:   row.querySelector('.ms-tab').value.trim(),
      row:   parseInt(row.querySelector('.ms-row').value) || 1
    };
  }).filter(m => m.label && m.tab);
}

// ============================================================
// SIGMA EMBED
// ============================================================

function sigmaLoaded() {
  // iframe loaded — Sigma may still be blocking silently (blank frame)
  // Nothing to do; if it renders, great
}

function sigmaBlocked() {
  document.getElementById('sigma-iframe').classList.add('hidden');
  document.getElementById('sigma-blocked').classList.remove('hidden');
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

// ============================================================
// DARK MODE
// ============================================================

function applyTheme() {
  const dark = localStorage.getItem('dash_dark') === '1';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = document.getElementById('btn-dark-mode');
  if (btn) btn.textContent = dark ? '☀' : '🌙';
}

function toggleDarkMode() {
  const dark = localStorage.getItem('dash_dark') === '1';
  localStorage.setItem('dash_dark', dark ? '0' : '1');
  applyTheme();
}

// ============================================================
// COLLAPSIBLE PANELS
// ============================================================

function togglePanel(key) {
  collapsed[key] = !collapsed[key];
  localStorage.setItem('dash_collapsed', JSON.stringify(collapsed));
  applyCollapsed();
}

function applyCollapsed() {
  ['meetings', 'resources', 'wbrDraft'].forEach(key => {
    const el = document.getElementById(`panel-body-${key}`);
    const btn = document.getElementById(`collapse-btn-${key}`);
    if (!el) return;
    if (collapsed[key]) {
      el.classList.add('panel-collapsed');
      if (btn) btn.textContent = '▶';
    } else {
      el.classList.remove('panel-collapsed');
      if (btn) btn.textContent = '▼';
    }
  });
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string' && tags.trim()) return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

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
      fetchSDOMetrics();
    }
  }, 300000);

  applyTheme();
  renderCategoryTabs();
  renderResources();
  renderSuggested();
  if (!settings.performanceSheetId) renderMetricsNeedSetup();
  else renderMetricsNeedColumn();
  loadSavedWBRDraft();
  applyCollapsed();

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

document.addEventListener('DOMContentLoaded', init);
