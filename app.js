/* ============================================================
   DASHBOARD APP
   All state is persisted in localStorage.
   Google Calendar requires a Client ID set in Settings.
============================================================ */

// ============================================================
// DEFAULT CONFIG
// ============================================================

const SHEET_ID     = '17felUngAmt-TYcnrKfjKME3vftwi67hqVt1NJPwas4U';
const SDO_SHEET_ID = '1Li_WeRTBzItubNghkrX5VLGuuHc4E99hW1qCYI-oarY';
const SDO_TAB      = 'SDO Log';

// SDO Log column indices (0-based)
const SDO = { READY: 1, AGENT: 4, DATE: 5, RESCHEDULED: 14, ZOOM_NOTES: 17, DURATION: 23 };

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
    'Resources and Process Docs',
    'Volume Tracking'
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

const DEFAULT_RESOURCES = [
  {id:'r1',title:'MOE QUEUE',url:'https://doordash.atlassian.net/jira/servicedesk/projects/MSSD/queues/custom/12782',category:'Volume Tracking',tags:['jira','queue','mssd'],days:[],calKeywords:'',clickCount:0},
  {id:'r2',title:'IOSD',url:'https://doordash.atlassian.net/jira/servicedesk/projects/IOSD/queues/custom/4437',category:'Volume Tracking',tags:['jira','queue','iosd'],days:[],calKeywords:'',clickCount:0},
  {id:'r5',title:'Golden POS Support',url:'https://figment.lightning.force.com/lightning/r/Report/00OKd000003ujBkMAI/view?queryScope=userFolders',category:'Volume Tracking',tags:['pos','golden'],days:[],calKeywords:'',clickCount:0},
  {id:'r6',title:'Response Receive',url:'https://doordashmx.lightning.force.com/lightning/o/WorkPlan/list?filterName=Silver_Px_Response_Received',category:'Volume Tracking',tags:['salesforce','silver'],days:[],calKeywords:'',clickCount:0},
  {id:'r7',title:'POS Escalations',url:'https://doordashmx.lightning.force.com/lightning/o/WorkPlan/list?filterName=Silver_POS_escalations',category:'Volume Tracking',tags:['pos','escalations'],days:[],calKeywords:'',clickCount:0},
  {id:'r8',title:'BAT',url:'https://unity.doordash.com/suites/merchant/marketplace-admin/activations/ssio',category:'Volume Tracking',tags:['unity','activations'],days:[],calKeywords:'',clickCount:0},
  {id:'r9',title:'DDXSalesforce',url:'https://doordashmx.lightning.force.com/lightning/o/WorkPlan/list?filterName=IO_Team_Email_Response_Received_Golden',category:'Volume Tracking',tags:['salesforce','golden'],days:[],calKeywords:'',clickCount:0},
  {id:'r11',title:'O and E Weekly Huddle',url:'https://docs.google.com/document/d/17er1Eh-MG6jdWzBXu-dcNoiut1-bW4JU_5Mud-cRZhU/edit?tab=t.vn19nuepkb1a',category:'Meeting Agendas',tags:['huddle','weekly'],days:[],calKeywords:'O&E',clickCount:0},
  {id:'r12',title:'Pre-Live Leads Sync',url:'https://docs.google.com/document/d/1ySkQhk9jrYB8JXYrl6Q6tSreWSWgy9QXgR6ZgZripns/edit',category:'Meeting Agendas',tags:['leads','sync'],days:[1,3],calKeywords:'Pre-Live Leads',clickCount:0},
  {id:'r13',title:'Vibe Check Weekly',url:'https://docs.google.com/document/d/1Cup8oHLyXkN42r34-LzUeuQ889bXufiGtLzkL9cwJug/edit',category:'Meeting Agendas',tags:['vibe','weekly'],days:[],calKeywords:'Vibe Check',clickCount:0},
  {id:'r14',title:'2026 Task Schedule Rx Mkt Integrations',url:'https://docs.google.com/spreadsheets/d/1dgDPKusvaCc1lwRjvbHj1qyOQvflsT8boKKwzPtLj-A/edit',category:'Team Docs',tags:['task','schedule'],days:[],calKeywords:'',clickCount:0},
  {id:'r15',title:'Attendance Occurrence Tracker',url:'https://docs.google.com/spreadsheets/d/1sd4jPV6oHg9d4wfMMyjRUfVLjCMlKgznT_J6_k40jjo/edit',category:'Team Docs',tags:['attendance','tracker'],days:[],calKeywords:'',clickCount:0},
  {id:'r16',title:'Competencies and Responsibilities Framework',url:'https://docs.google.com/spreadsheets/d/1OArfmSpa_rr_aH6771SECyl7-WSQlTBqnBfiaOR_O9A/edit',category:'Team Docs',tags:['competencies','framework'],days:[],calKeywords:'',clickCount:0},
  {id:'r17',title:'I.Ops TL Weekly Notes',url:'https://docs.google.com/document/d/1pcXANo__iO4x9oVqMiL2aPcWn9kPFw0aoCrzh9yd9h8/edit',category:'Team Docs',tags:['tl','notes','weekly'],days:[1,2,3,4,5],calKeywords:'',clickCount:0},
  {id:'r18',title:'Values 2.0',url:'https://docs.google.com/spreadsheets/d/1qtv6gCegnnq9xJfe6w6BBAOiIjOUrv45ppxzzeGjs58/edit',category:'Team Docs',tags:['values'],days:[],calKeywords:'',clickCount:0},
  {id:'r19',title:'I.Ops Jira Board',url:'https://doordash.atlassian.net/jira/core/projects/IOMXS/board',category:'Team Docs',tags:['jira','board'],days:[],calKeywords:'',clickCount:0},
  {id:'r20',title:'I.Ops Reporting by Kohlforce',url:'https://doordash.atlassian.net/jira/dashboards/31198',category:'Team Docs',tags:['jira','reporting'],days:[],calKeywords:'',clickCount:0},
  {id:'r21',title:'Integration Ops Confluence',url:'https://doordash.atlassian.net/wiki/spaces/INTEGRATIO/overview',category:'Team Docs',tags:['confluence','integration'],days:[],calKeywords:'',clickCount:0},
  {id:'r22',title:'Atlassian Wiki Homepage',url:'https://doordash.atlassian.net/wiki/spaces/AT/overview',category:'Team Docs',tags:['confluence','atlassian'],days:[],calKeywords:'',clickCount:0},
  {id:'r23',title:'Team Figment Tracking View',url:'https://figment.lightning.force.com/lightning/r/Report/00OKd000003oBb3MAE/view?queryScope=userFolders',category:'Team Docs',tags:['figment','tracking'],days:[],calKeywords:'',clickCount:0},
  {id:'r24',title:'Drive',url:'https://drive.google.com/drive/home',category:'Team Docs',tags:['drive','google'],days:[1,2,3,4,5],calKeywords:'',clickCount:0},
  {id:'r25',title:'MxOps Workflow Manager',url:'https://app.sigmacomputing.com/doordash/workbook/MxOps-Workflow-Manager-Rx-4XgWfVw4VJgUYETTQpjBhs?:nodeId=5a6zYtDbDU',category:'Team Docs',tags:['sigma','workflow'],days:[],calKeywords:'',clickCount:0},
  {id:'r26',title:'I.Ops Support Hub Sigma',url:'https://app.sigmacomputing.com/doordash/workbook/I-Ops-Support-Hub-2d1XT4htLSnxVB9fdXGKHL',category:'Team Docs',tags:['sigma','support'],days:[1,2,3,4,5],calKeywords:'',clickCount:0},
  {id:'r27',title:'Onboarding Dashboard Sigma',url:'https://app.sigmacomputing.com/doordash/workbook/Onboarding-Dashboard-4bVAz7o1wyUdG4mmJIg2KF?:nodeId=I4eD-KHa8d',category:'Team Docs',tags:['sigma','onboarding'],days:[],calKeywords:'',clickCount:0},
  {id:'r28',title:'CHIP I.Ops Glean',url:'https://app.glean.com/chat/agents/0f153216ecab4c5682cca77e4f362643',category:'Team Docs',tags:['chip','glean'],days:[1,2,3,4,5],calKeywords:'',clickCount:0},
  {id:'r29',title:'DDU LMS',url:'https://doordash.csod.com/phnx/driver.aspx?routename=Learning/Curriculum/CurriculumPlayer&TargetUser=88763&curriculumLoId=4e3611c3-8acb-4f4e-9326-ddf39c544b51',category:'Team Docs',tags:['lms','training'],days:[],calKeywords:'',clickCount:0},
  {id:'r30',title:'2025 MxOps Pre-Live Task Schedule',url:'https://docs.google.com/spreadsheets/d/1c2yoklvAvR8grr38GMU01kMs2fhn7eTZ7YM2n7iAIvs/edit',category:'Performance Tracking',tags:['pre-live','schedule'],days:[],calKeywords:'',clickCount:0},
  {id:'r31',title:'Golden Churn Sheet',url:'https://docs.google.com/spreadsheets/d/1l6werqQPvyf0vceE-d13-PJRc_9fbajWt6b1mnnwFNE/edit',category:'Performance Tracking',tags:['churn','golden'],days:[],calKeywords:'',clickCount:0},
  {id:'r32',title:'Silver Churn Sheet',url:'https://docs.google.com/spreadsheets/d/16tDc92VKLkGq1nkuoaVTIyVWPDgghv8pTlx7k8rHAPU/edit',category:'Performance Tracking',tags:['churn','silver'],days:[],calKeywords:'',clickCount:0},
  {id:'r33',title:'Q2 2025 Onboarding KR Scorecard',url:'https://docs.google.com/spreadsheets/d/1vXSlms2szaxtAkwlcNDcoG9pmtIhm6T1RSdEsETJOiI/edit',category:'Performance Tracking',tags:['kr','scorecard'],days:[],calKeywords:'',clickCount:0},
  {id:'r34',title:'2026 Onboarding KR Scorecard',url:'https://docs.google.com/spreadsheets/d/17felUngAmt-TYcnrKfjKME3vftwi67hqVt1NJPwas4U/edit',category:'Performance Tracking',tags:['kr','scorecard','2026'],days:[1,2,3,4,5],calKeywords:'WBR',clickCount:0},
  {id:'r35',title:'Integrations Onboarding and Support Master Tracker',url:'https://docs.google.com/spreadsheets/d/1ZYHHij8TMFyFYw4zakdLGZeR1UuxnwzSWuM0RtgoN0w/edit',category:'Performance Tracking',tags:['tracker','master'],days:[],calKeywords:'',clickCount:0},
  {id:'r36',title:'Integrations Onboarding QA Dashboard',url:'https://docs.google.com/spreadsheets/d/1at6dGenB8QXrHp1YQcdCe3aHAYScrsylHJXDXhvk58I/edit',category:'Performance Tracking',tags:['qa','dashboard'],days:[],calKeywords:'',clickCount:0},
  {id:'r37',title:'CHIP Usage Tracking',url:'https://docs.google.com/spreadsheets/d/1NF9BG5d68nZOM5YXnsf-ES8WG11zoWlEaGl0-Ku0Ljk/edit',category:'Performance Tracking',tags:['chip','tracking'],days:[],calKeywords:'',clickCount:0},
  {id:'r38',title:'SDO and Operator Tooling Tracker',url:'https://docs.google.com/spreadsheets/d/1mFeNiWDouzAsa023CgQGPGn5cUyB6BAdDD032wugJp0/edit',category:'Performance Tracking',tags:['sdo','tracker'],days:[],calKeywords:'',clickCount:0},
  {id:'r39',title:'Kohls Query Sandbox',url:'https://app.mode.com/editor/doordash/reports/dc6bc333f07c/queries/0b42f1cadfd3',category:'Performance Tracking',tags:['mode','query'],days:[],calKeywords:'',clickCount:0},
  {id:'r40',title:'Integrations Matrix Sigma',url:'https://app.sigmacomputing.com/doordash/workbook/Integrations-Matrix-3SymdkxACGahbSRa73OzEd?:nodeId=TF85f1RiDv',category:'Performance Tracking',tags:['sigma','matrix'],days:[],calKeywords:'',clickCount:0},
  {id:'r41',title:'Figment Case Queue',url:'https://figment.lightning.force.com/lightning/o/Case/list?filterName=00BKd00000CKHUXMA5',category:'Performance Tracking',tags:['figment','cases'],days:[1,2,3,4,5],calKeywords:'',clickCount:0},
  {id:'r42',title:'Integrations Onboarding QA Form',url:'https://docs.google.com/spreadsheets/d/1m8Ir4uOQUl5_fWGcNWi9YrWqFs8R_76yY-6I0-VrVKg/edit',category:'Resources and Process Docs',tags:['qa','form'],days:[],calKeywords:'',clickCount:0},
  {id:'r43',title:'MXO I.OPS Support Playbook',url:'https://docs.google.com/document/d/1PVgLRsL_e7qpcdDCJ_9dGBT4KZ9fQWNg_Q7Jlcqf77Q/edit',category:'Resources and Process Docs',tags:['playbook','support'],days:[],calKeywords:'',clickCount:0},
  {id:'r44',title:'HQRR High Quality Resolution Rate',url:'https://gamma.app/docs/HQRR-High-Quality-Resolution-Rate-kp1zn0xo7fx4rbb?mode=doc',category:'Resources and Process Docs',tags:['hqrr','resolution'],days:[],calKeywords:'',clickCount:0},
  {id:'r45',title:'New Hire Training Schedule',url:'https://docs.google.com/spreadsheets/d/17SeEOMS2b-eExQ0R4nqCG9tR2fuf0aMOEhHXpcrhqWo/edit',category:'Resources and Process Docs',tags:['training'],days:[],calKeywords:'',clickCount:0},
  {id:'r46',title:'Square V1 to V2 Migration Agent Guide',url:'https://docs.google.com/document/d/1RApaTBEbFD4F6mRcvmmw3DHMIN_qCCTx8I7bsnhCE64/edit',category:'Resources and Process Docs',tags:['square','migration'],days:[],calKeywords:'',clickCount:0},
  {id:'r47',title:'IO Rescue Phone Etiquette',url:'https://docs.google.com/presentation/d/1xyYT5vxgSZ2FwZJn74euOs7Hjl0oGcd8VBB8htjq16I/edit',category:'Resources and Process Docs',tags:['phone','etiquette'],days:[],calKeywords:'',clickCount:0},
  {id:'r48',title:'Performance Rating Definitions',url:'https://docs.google.com/document/d/1dCCkLE9_SiQxTM1enVgkEcqgrfuMnnSNSq2_o9DVHhM/edit',category:'Resources and Process Docs',tags:['performance','rating'],days:[],calKeywords:'',clickCount:0},
  {id:'r49',title:'Access Management Permissions',url:'https://unity.doordash.com/suites/admin/access-management/apps',category:'Resources and Process Docs',tags:['access','permissions'],days:[],calKeywords:'',clickCount:0},
  {id:'r50',title:'MultiLOC Deintegration Guide',url:'https://docs.google.com/document/d/1PVgLRsL_e7qpcdDCJ_9dGBT4KZ9fQWNg_Q7Jlcqf77Q/edit?tab=t.v3sen567ts46',category:'Resources and Process Docs',tags:['multiloc','deintegration'],days:[],calKeywords:'',clickCount:0}
];

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

// ============================================================
// SDO LOG METRICS
// ============================================================

let sdoFilter   = 'this-week';  // 'this-week' | 'last-week' | 'last-month'
let sdoAllRows  = [];           // cached raw rows from last fetch

const SDO_FILTER_LABELS = { 'this-week': 'This Week', 'last-week': 'Last Week', 'last-month': 'Last Month' };

async function fetchSDOMetrics() {
  if (!accessToken) return;
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
      spreadsheetId: SDO_SHEET_ID,
      range: `'${SDO_TAB}'!A2:Y`,
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
  const { start, end } = getDateBounds(filter);
  const subset = rows.filter(row => {
    const d = new Date(row[SDO.DATE] || '');
    return !isNaN(d) && d >= start && d <= end;
  });

  const scheduled   = subset.length;
  const activated   = subset.filter(r => (r[SDO.READY] || '').toUpperCase() === 'YES').length;
  const canceled    = subset.filter(r => (r[SDO.ZOOM_NOTES] || '').toLowerCase().includes('cancel')).length;
  const rescheduled = subset.filter(r => (r[SDO.RESCHEDULED] || '').toUpperCase() === 'YES').length;
  const rate        = scheduled > 0 ? Math.round((activated / scheduled) * 100) : 0;

  const agentMap = {};
  subset.forEach(r => {
    const name = (r[SDO.AGENT] || 'Unknown').trim();
    if (!agentMap[name]) agentMap[name] = { scheduled: 0, activated: 0, canceled: 0 };
    agentMap[name].scheduled++;
    if ((r[SDO.READY] || '').toUpperCase() === 'YES') agentMap[name].activated++;
    if ((r[SDO.ZOOM_NOTES] || '').toLowerCase().includes('cancel')) agentMap[name].canceled++;
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
      <div class="metric-card"><div class="metric-value">${canceled}</div><div class="metric-label">Canceled</div></div>
      <div class="metric-card"><div class="metric-value">${rescheduled}</div><div class="metric-label">Rescheduled</div></div>
      <div class="metric-card"><div class="metric-value">${rate}%</div><div class="metric-label">Activation Rate</div></div>
    </div>
    ${agents.length ? `
    <div class="sdo-table-wrap">
      <table class="sdo-table">
        <thead><tr><th>Agent</th><th>Scheduled</th><th>Activated</th><th>Canceled</th><th>Rate</th></tr></thead>
        <tbody>${agentRows}</tbody>
      </table>
    </div>` : ''}`;
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

  grid.innerHTML = ranked.map(r => {
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

  renderCategoryTabs();
  renderResources();
  renderSuggested();
  renderWBR();
  renderMetricsNeedColumn(); // Show performance bar immediately; updates after auth + column set

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

document.addEventListener('DOMContentLoaded', init);
