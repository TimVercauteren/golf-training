/* Golf Training — a small offline-first PWA for logging practice.
   No build step, no dependencies. Data lives in localStorage on the device;
   use Setup → Backup to export/import a JSON copy. */
'use strict';

/* ======================================================================
   Config
   ====================================================================== */
const APP_VERSION = '1.0.0';
const LOCALE = 'en-GB';
const STORE_KEY = 'golftraining.v1';
const DRAFT_KEY = 'golftraining.draft';

const AREAS = [
  { id: 'driver', name: 'Driver' },
  { id: 'woods', name: 'Woods & hybrids' },
  { id: 'irons', name: 'Irons' },
  { id: 'wedges', name: 'Wedges' },
  { id: 'pitching', name: 'Pitching' },
  { id: 'chipping', name: 'Chipping' },
  { id: 'bunker', name: 'Bunker' },
  { id: 'putting', name: 'Putting' },
  { id: 'course', name: 'Playing holes' },
  { id: 'fitness', name: 'Fitness & mobility' },
];
const PLACES = ['Range', 'Short-game area', 'Putting green', 'On the course', 'Simulator', 'Home'];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const FEELS = ['Struggled', 'Off', 'Okay', 'Good', 'Dialed in'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const DEFAULT_DRILLS = [
  { id: 'putt-1m', name: 'Putts from 1 m', area: 'putting', attempts: 10, success: 'Holed' },
  { id: 'putt-2m', name: 'Putts from 2 m', area: 'putting', attempts: 10, success: 'Holed' },
  { id: 'putt-lag', name: 'Lag putts from 10 m', area: 'putting', attempts: 10, success: 'Stops within 1 m' },
  { id: 'chip-1m', name: 'Chips to a 1 m circle', area: 'chipping', attempts: 10, success: 'Finishes inside 1 m' },
  { id: 'pitch-30', name: 'Pitches from 30 m', area: 'pitching', attempts: 10, success: 'Finishes inside 3 m' },
  { id: 'bunker-out', name: 'Bunker escapes', area: 'bunker', attempts: 10, success: 'Out and on the green' },
  { id: 'wedge-ladder', name: 'Wedge ladder 50, 70, 90 m', area: 'wedges', attempts: 9, success: 'Inside 5 m of the target' },
  { id: 'iron-target', name: '7-iron at a target', area: 'irons', attempts: 10, success: 'Inside 10 m of the target' },
  { id: 'driver-corridor', name: 'Driver into a fairway', area: 'driver', attempts: 10, success: 'Inside a 25 m corridor' },
];

/* ======================================================================
   Small utilities
   ====================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (made, attempts) => (attempts ? Math.round((made / attempts) * 100) : 0);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => isoDate(new Date());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parseISO(s).toLocaleDateString(LOCALE, opts);
const fmtShort = (s) => fmtDate(s, { day: 'numeric', month: 'short' });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
function fmtMin(m) {
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
const areaName = (id) => (AREAS.find((a) => a.id === id) || { name: 'Other' }).name;

/* ======================================================================
   Storage
   ====================================================================== */
function freshDB() {
  return {
    version: 1,
    settings: { weeklyGoal: 180, theme: 'system', range: '12w', progressDrill: null, lastBackup: null, installDismissed: false },
    drills: DEFAULT_DRILLS.map((d) => ({ ...d, archived: false })),
    sessions: [],
  };
}
function normalize(d) {
  const f = freshDB();
  return {
    version: 1,
    settings: { ...f.settings, ...(d && d.settings) },
    drills: Array.isArray(d && d.drills) ? d.drills : f.drills,
    sessions: Array.isArray(d && d.sessions) ? d.sessions : [],
  };
}
function loadDB() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return freshDB(); }
  if (!raw) return freshDB();
  try { return normalize(JSON.parse(raw)); }
  catch (e) {
    // Keep the unreadable copy rather than overwriting it.
    try { localStorage.setItem(`${STORE_KEY}.unreadable-${Date.now()}`, raw); } catch (_) {}
    return freshDB();
  }
}
let db = loadDB();
function saveDB() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('Not saved. This browser is blocking storage for the app.'); return false; }
}

function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function saveDraft() {
  if (!form || form.mode !== 'new') return;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch (e) {}
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

async function askPersistentStorage() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
}

/* ======================================================================
   Data helpers
   ====================================================================== */
const drillById = (id) => db.drills.find((d) => d.id === id);
const activeDrills = () => db.drills.filter((d) => !d.archived);
const sessionsDesc = () => [...db.sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
const sessionsAsc = () => sessionsDesc().reverse();
const minutesOn = (iso) => db.sessions.filter((s) => s.date === iso).reduce((t, s) => t + (s.minutes || 0), 0);

function minutesInRange(fromISO, toISO) {
  return db.sessions.filter((s) => s.date >= fromISO && s.date <= toISO).reduce((t, s) => t + (s.minutes || 0), 0);
}
function drillSeries(drillId, fromISO = '0000-00-00') {
  const out = [];
  for (const s of sessionsAsc()) {
    if (s.date < fromISO) continue;
    for (const e of s.drills || []) {
      if (e.drillId === drillId && e.attempts > 0) out.push({ date: s.date, sessionId: s.id, made: e.made, attempts: e.attempts, v: e.made / e.attempts });
    }
  }
  return out;
}
const drillUseCount = (drillId) => db.sessions.reduce((n, s) => n + (s.drills || []).filter((e) => e.drillId === drillId).length, 0);

function goalStreak() {
  // Consecutive weeks that met the goal, counting back from last week (plus this week if already met).
  const goal = db.settings.weeklyGoal;
  if (!goal) return 0;
  let ws = startOfWeek(new Date());
  let n = minutesInRange(isoDate(ws), isoDate(addDays(ws, 6))) >= goal ? 1 : 0;
  for (let i = 0; i < 520; i++) {
    ws = addDays(ws, -7);
    if (minutesInRange(isoDate(ws), isoDate(addDays(ws, 6))) >= goal) n++;
    else break;
  }
  return n;
}

function rangeStart(range) {
  const now = new Date();
  if (range === '4w') return addDays(startOfWeek(now), -21);
  if (range === '1y') return new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return addDays(startOfWeek(now), -77); // 12 weeks
}

/* ======================================================================
   The session form (new = persisted draft, edit = in-memory copy)
   ====================================================================== */
let form = null;
let pickerOpen = false;
let formError = '';

function newDraft() {
  return { mode: 'new', startedAt: Date.now(), date: todayISO(), place: null, minutes: null, minutesSource: null, areas: [], drills: [], feel: null, notes: '' };
}
function ensureNewForm() {
  if (form && form.mode === 'new') return;
  form = loadDraft() || newDraft();
  pickerOpen = false; formError = '';
  saveDraft();
}
function ensureEditForm(id) {
  if (form && form.mode === 'edit' && form.id === id) return true;
  const s = db.sessions.find((x) => x.id === id);
  if (!s) return false;
  form = {
    mode: 'edit', id: s.id, date: s.date, place: s.place, minutes: s.minutes, minutesSource: 'custom',
    areas: [...(s.areas || [])], feel: s.feel, notes: s.notes || '',
    drills: (s.drills || []).map((e) => ({
      key: uid(), drillId: e.drillId,
      marks: Array.isArray(e.marks) ? [...e.marks] : [],
      typed: !Array.isArray(e.marks) || e.marks.length !== e.attempts,
      made: e.made, attempts: e.attempts,
    })),
  };
  pickerOpen = false; formError = '';
  return true;
}
const timerMinutes = () => (form && form.mode === 'new' ? Math.max(1, Math.round((Date.now() - form.startedAt) / 60000)) : 0);
const timerUsable = () => form && form.mode === 'new' && Date.now() - form.startedAt < 12 * 3600 * 1000 && Date.now() - form.startedAt >= 60000;

function entryScore(en) {
  if (en.typed) {
    const a = toInt(en.attempts);
    return { made: Math.min(toInt(en.made), a), attempts: a };
  }
  return { made: en.marks.filter((m) => m === 1).length, attempts: en.marks.length };
}

/* ======================================================================
   Router
   ====================================================================== */
const view = $('#view');
let lastRouteKey = '';

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return { name: parts[0] || 'today', id: parts[1] ? decodeURIComponent(parts[1]) : null };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function render() {
  const r = route();
  const v = VIEWS[r.name] ? r.name : 'today';
  const tab = { today: 'today', history: 'history', session: 'history', progress: 'progress', setup: 'setup' }[v];
  document.body.classList.toggle('no-tabbar', v === 'log' || v === 'edit');
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const html = VIEWS[v].html(r);
  if (html === null) return; // view redirected
  view.innerHTML = html;
  VIEWS[v].mount && VIEWS[v].mount(r);
  const key = `${v}/${r.id || ''}`;
  if (key !== lastRouteKey) { window.scrollTo(0, 0); lastRouteKey = key; }
}
window.addEventListener('hashchange', render);

/* ======================================================================
   Shared fragments
   ====================================================================== */
const ICON = {
  chev: '<svg class="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  made: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="made" cx="10" cy="10" r="7"/></svg>',
  miss: '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="miss" d="M5 15L15 5"/></svg>',
  makeBtn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/></svg>',
  missBtn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6"/></svg>',
};

let freshBox = null; // the box that just changed, so only it animates
function boxesHTML(marks, base, key) {
  const interactive = key != null;
  // Lay the boxes out like a scorecard: rows of at most 10, split evenly (12 shots = 2 rows of 6).
  base = base > 0 ? base : 10;
  const cols = base <= 10 ? base : Math.ceil(base / Math.ceil(base / 10));
  const total = Math.max(cols, Math.ceil(Math.max(interactive ? base : 0, marks.length) / cols) * cols);
  let h = `<div class="boxes${interactive ? '' : ' readonly'}" style="grid-template-columns:repeat(${cols},1fr)">`;
  for (let i = 0; i < total; i++) {
    const m = i < marks.length ? marks[i] : null;
    const inner = m === 1 ? ICON.made : m === 0 ? ICON.miss : '';
    const label = `Shot ${i + 1}: ${m === 1 ? 'make' : m === 0 ? 'miss' : 'not played'}`;
    if (interactive) {
      const fresh = freshBox && freshBox.key === key && freshBox.i === i;
      h += `<button type="button" class="box${i === marks.length ? ' next' : ''}${fresh ? ' fresh' : ''}" data-act="box" data-key="${key}" data-i="${i}" aria-label="${label}">${inner}</button>`;
    } else {
      h += `<div class="box" role="img" aria-label="${label}">${inner}</div>`;
    }
  }
  return h + '</div>';
}

function sessionRow(s) {
  const d = parseISO(s.date);
  const areas = (s.areas || []).map(areaName).join(', ');
  const drills = (s.drills || []).length;
  const meta = [areas, drills ? plural(drills, 'drill') : ''].filter(Boolean).join(', ') || 'No details';
  return `<li><a class="row" href="#/session/${encodeURIComponent(s.id)}">
    <div class="datebox"><b>${d.getDate()}</b><small>${d.toLocaleDateString(LOCALE, { weekday: 'short' })}</small></div>
    <div class="grow"><div class="title">${esc(s.place || 'Practice')}</div><div class="meta">${esc(meta)}</div></div>
    <div class="end"><div class="big">${s.minutes}</div><div class="meta">min</div></div>
    ${ICON.chev}
  </a></li>`;
}

function sparkSVG(series) {
  const pts = series.slice(-12);
  if (pts.length < 2) return '<svg class="spark" aria-hidden="true"></svg>';
  const W = 72, H = 24, p = 3;
  const x = (i) => p + (i * (W - 2 * p)) / (pts.length - 1);
  const y = (v) => H - p - v * (H - 2 * p);
  const line = pts.map((q, i) => `${x(i).toFixed(1)},${y(q.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${line}"/><circle cx="${x(pts.length - 1)}" cy="${y(last.v)}" r="2.6"/></svg>`;
}

/* ======================================================================
   Views
   ====================================================================== */
const VIEWS = {};

/* ---------- Today ---------- */
VIEWS.today = {
  html() {
    const ws = startOfWeek(new Date());
    const tISO = todayISO();
    const days = [...Array(7)].map((_, i) => addDays(ws, i));
    const mins = days.map((d) => minutesOn(isoDate(d)));
    const total = mins.reduce((a, b) => a + b, 0);
    const goal = db.settings.weeklyGoal;
    const left = Math.max(0, goal - total);
    const done = goal > 0 && total >= goal;
    const streak = goalStreak();
    const range = `${days[0].toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })} to ${days[6].toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}`;

    const cells = days.map((d, i) => {
      const iso = isoDate(d);
      const cls = [iso === tISO ? 'today' : '', iso > tISO ? 'future' : ''].filter(Boolean).join(' ');
      const v = mins[i] ? mins[i] : iso >= tISO ? '' : '–';
      return { cls, v, date: d.getDate() };
    });

    const draft = loadDraft();
    const draftLabel = draft ? (Date.now() - draft.startedAt < 12 * 3600 * 1000 ? `Started ${fmtTime(draft.startedAt)}` : `Draft from ${fmtDate(draft.date)}`) : '';

    const recent = sessionsDesc().slice(0, 3);
    const drillRows = db.drills
      .map((d) => ({ d, s: drillSeries(d.id) }))
      .filter((x) => x.s.length)
      .sort((a, b) => (a.s[a.s.length - 1].date < b.s[b.s.length - 1].date ? 1 : -1))
      .slice(0, 5);

    const needsBackup = db.sessions.length >= 5 && (!db.settings.lastBackup || Date.now() - db.settings.lastBackup > 30 * 864e5);
    const showInstall = !isStandalone() && !db.settings.installDismissed;

    return `
      <header class="topbar">
        <div><h1>This week</h1><div class="sub">${range}</div></div>
      </header>

      <section class="scorecard" aria-label="Practice minutes this week">
        <table>
          <thead><tr><th scope="col">Day</th>${WEEKDAYS.map((w) => `<th scope="col">${w}</th>`).join('')}<th scope="col" class="total">Week</th></tr></thead>
          <tbody>
            <tr class="dates"><th scope="row">Date</th>${cells.map((c) => `<td class="${c.cls}">${c.date}</td>`).join('')}<td class="total"></td></tr>
            <tr class="mins"><th scope="row">Min</th>${cells.map((c) => `<td class="${c.cls}">${c.v}</td>`).join('')}<td class="total">${total}</td></tr>
          </tbody>
        </table>
        <div class="scorecard-foot">
          <span><span class="num">${total}</span> of ${goal} min</span>
          <span class="goalbar${done ? ' done' : ''}" role="img" aria-label="${goal ? Math.min(100, pct(total, goal)) : 0}% of weekly goal"><i style="width:${goal ? Math.min(100, (total / goal) * 100) : 0}%"></i></span>
          <span>${done ? 'Goal reached' : `${left} min to go`}</span>
        </div>
      </section>
      ${streak >= 2 ? `<p class="small muted" style="margin-top:8px">Weekly goal met ${streak} weeks in a row.</p>` : ''}

      <div style="margin-top:18px">
        ${draft
          ? `<a class="btn block" href="#/log">Continue session</a><p class="small muted" style="text-align:center;margin-top:6px">${esc(draftLabel)}</p>`
          : `<a class="btn block" href="#/log">${ICON.plus}Log practice</a>`}
      </div>

      ${needsBackup ? `<div class="notice"><p>Your log is stored only on this phone.</p><a class="linkbtn" href="#/setup">Export a backup</a></div>` : ''}
      ${showInstall && !needsBackup ? `<div class="notice"><p>${isIOS()
          ? 'Add Golf Training to your home screen before you start logging. On iPhone the home-screen app keeps its own data, so sessions saved here in Safari won\'t carry over.'
          : 'Add Golf Training to your home screen so it opens full screen and works offline.'}</p>
        <a class="linkbtn" href="#/setup">How to install</a> <button class="linkbtn" style="margin-left:16px;color:var(--ink-2)" data-act="dismiss-install">Not now</button></div>` : ''}

      ${drillRows.length ? `
        <div class="section-head"><h2>Your drills</h2><a class="linkbtn" href="#/progress">Progress</a></div>
        <ul class="list">${drillRows.map(({ d, s }) => {
          const last = s[s.length - 1];
          return `<li><a class="row" href="#/progress/${encodeURIComponent(d.id)}">
            <div class="grow"><div class="title">${esc(d.name)}</div><div class="meta">Last ${last.made} of ${last.attempts} on ${fmtShort(last.date)}</div></div>
            ${sparkSVG(s)}
            <div class="end"><div class="big">${pct(last.made, last.attempts)}%</div></div>
          </a></li>`;
        }).join('')}</ul>` : ''}

      <div class="section-head"><h2>Recent sessions</h2>${db.sessions.length > 3 ? '<a class="linkbtn" href="#/history">See all</a>' : ''}</div>
      ${recent.length ? `<ul class="list">${recent.map(sessionRow).join('')}</ul>`
        : `<div class="empty"><p>Nothing logged yet.</p><p>Tap Log practice when you start your next session. You can score drills shot by shot as you go.</p></div>`}
    `;
  },
};

/* ---------- History ---------- */
VIEWS.history = {
  html() {
    const list = sessionsDesc();
    if (!list.length) {
      return `<header class="topbar"><h1>History</h1></header>
        <div class="empty"><p>No sessions yet.</p><p>Every session you log shows up here, newest first.</p></div>
        <a class="btn block" style="margin-top:16px" href="#/log">${ICON.plus}Log practice</a>`;
    }
    const groups = [];
    for (const s of list) {
      const key = s.date.slice(0, 7);
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) { g = { key, items: [] }; groups.push(g); }
      g.items.push(s);
    }
    const totalMin = list.reduce((t, s) => t + s.minutes, 0);
    return `
      <header class="topbar">
        <div><h1>History</h1><div class="sub">${plural(list.length, 'session')}, ${fmtMin(totalMin)} in total</div></div>
        <a class="btn small" href="#/log">${ICON.plus}Log</a>
      </header>
      ${groups.map((g) => {
        const m = g.items.reduce((t, s) => t + s.minutes, 0);
        const label = parseISO(g.key + '-01').toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
        return `<div class="month-head">${label}<span>${plural(g.items.length, 'session')}, ${fmtMin(m)}</span></div>
          <ul class="list">${g.items.map(sessionRow).join('')}</ul>`;
      }).join('')}
    `;
  },
};

/* ---------- Session detail ---------- */
VIEWS.session = {
  html(r) {
    const s = db.sessions.find((x) => x.id === r.id);
    if (!s) return `<header class="topbar"><h1>Session not found</h1></header><p class="muted">It may have been deleted.</p><a class="linkbtn" href="#/history">Back to history</a>`;
    const drills = s.drills || [];
    const totalMade = drills.reduce((t, e) => t + e.made, 0), totalAtt = drills.reduce((t, e) => t + e.attempts, 0);
    return `
      <a class="linkbtn" href="#/history">History</a>
      <header class="topbar">
        <div><h1>${fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h1><div class="sub">${esc(s.place || 'Practice')}</div></div>
        <a class="btn small secondary" href="#/edit/${encodeURIComponent(s.id)}">Edit</a>
      </header>
      <dl class="facts">
        <div><dt>Time</dt><dd>${fmtMin(s.minutes)}</dd></div>
        <div><dt>Drill shots</dt><dd>${totalAtt ? `${totalMade}/${totalAtt}` : '–'}</dd></div>
        <div><dt>Feel</dt><dd>${s.feel ? FEELS[s.feel - 1] : '–'}</dd></div>
      </dl>
      ${(s.areas || []).length ? `<h2>Worked on</h2><p>${esc(s.areas.map(areaName).join(', '))}</p>` : ''}
      ${drills.length ? `<h2>Drills</h2>${drills.map((e) => {
        const d = drillById(e.drillId) || { name: 'Deleted drill', attempts: 10, success: '' };
        return `<div class="drill">
          <div class="drill-head">
            <div class="grow"><div class="name">${esc(d.name)}</div>${d.success ? `<div class="success">Make: ${esc(d.success.toLowerCase())}</div>` : ''}</div>
            <div class="score"><b>${e.made}/${e.attempts}</b><small>${pct(e.made, e.attempts)}%</small></div>
          </div>
          ${Array.isArray(e.marks) && e.marks.length ? boxesHTML(e.marks, d.attempts || 10, null) : ''}
        </div>`;
      }).join('')}` : ''}
      ${s.notes ? `<h2>Notes</h2><div class="notes-text">${esc(s.notes)}</div>` : ''}
      <div class="actions-row">
        <button class="btn danger" data-act="delete-session" data-id="${esc(s.id)}" data-confirm="Tap again to delete">Delete session</button>
      </div>
    `;
  },
};

/* ---------- Log / edit ---------- */
function logViewHTML() {
  const isNew = form.mode === 'new';
  const draftAge = isNew ? Date.now() - form.startedAt : 0;
  const sub = isNew ? (draftAge < 12 * 3600 * 1000 ? `Started ${fmtTime(form.startedAt)}` : `Draft from ${fmtDate(form.date)}`) : fmtDate(form.date);
  const custom = form.minutes && form.minutesSource === 'custom' ? form.minutes : '';
  return `
    <header class="topbar">
      <div><h1>${isNew ? 'New session' : 'Edit session'}</h1><div class="sub" id="log-sub">${esc(sub)}</div></div>
      <a class="linkbtn" href="${isNew ? '#/today' : `#/session/${encodeURIComponent(form.id)}`}" data-act="close-form">${isNew ? 'Close' : 'Cancel'}</a>
    </header>

    <div class="field" style="margin-top:4px">
      <label for="f-date">Date</label>
      <input id="f-date" class="input" type="date" value="${form.date}" max="${todayISO()}" data-input="date">
    </div>

    <div class="field">
      <span class="label" id="l-place">Where</span>
      <div class="chips" role="group" aria-labelledby="l-place">
        ${PLACES.map((p) => `<button type="button" class="chip" data-act="place" data-v="${esc(p)}" aria-pressed="${form.place === p}">${esc(p)}</button>`).join('')}
      </div>
    </div>

    <div class="field" id="f-duration">
      <span class="label" id="l-dur">How long</span>
      <div class="chips" role="group" aria-labelledby="l-dur">
        ${isNew ? `<button type="button" class="chip timer" data-act="duration-timer" aria-pressed="${form.minutesSource === 'timer'}" ${timerUsable() ? '' : 'hidden'}>Timer: <span id="timer-min">${timerMinutes()}</span> min</button>` : ''}
        ${DURATIONS.map((m) => `<button type="button" class="chip" data-act="duration" data-v="${m}" aria-pressed="${form.minutesSource === 'chip' && form.minutes === m}">${m < 60 ? `${m} min` : fmtMin(m)}</button>`).join('')}
      </div>
      <div class="inline-inputs" style="margin-top:10px">
        <input id="f-min" class="input" type="number" inputmode="numeric" min="1" max="600" placeholder="Other" value="${custom}" data-input="minutes" aria-label="Minutes, other amount">
        <span class="muted">minutes</span>
      </div>
      ${formError ? `<div class="error" role="alert">${esc(formError)}</div>` : ''}
    </div>

    <div class="field">
      <span class="label" id="l-areas">What you worked on</span>
      <div class="chips" role="group" aria-labelledby="l-areas" id="area-chips">${areaChipsHTML()}</div>
    </div>

    <div class="field">
      <span class="label">Drills</span>
      <div id="drills">${drillCardsHTML()}</div>
      <div id="picker-wrap">${pickerHTML()}</div>
    </div>

    <div class="field">
      <span class="label" id="l-feel">How did it go?</span>
      <div class="feel" role="group" aria-labelledby="l-feel">
        ${FEELS.map((f, i) => `<button type="button" class="chip" data-act="feel" data-v="${i + 1}" aria-pressed="${form.feel === i + 1}"><b>${i + 1}</b><small>${f}</small></button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label for="f-notes">Notes</label>
      <textarea id="f-notes" class="input" data-input="notes" placeholder="Swing thoughts, what clicked, what to work on next time">${esc(form.notes)}</textarea>
    </div>

    ${isNew ? `<div style="margin-top:28px"><button class="linkbtn danger" data-act="discard" data-confirm="Tap again to discard">Discard this session</button></div>` : ''}

    <div class="sticky-save"><div class="inner">
      <button class="btn" data-act="save-session">${isNew ? 'Save session' : 'Save changes'}</button>
    </div></div>
  `;
}

function areaChipsHTML() {
  return AREAS.map((a) => `<button type="button" class="chip" data-act="area" data-v="${a.id}" aria-pressed="${form.areas.includes(a.id)}">${esc(a.name)}</button>`).join('');
}

function drillCardsHTML() {
  if (!form.drills.length) return '<p class="hint" style="margin-top:0">Add a drill to score it shot by shot. Tap Make or Miss after each attempt.</p>';
  return form.drills.map(drillCardHTML).join('');
}
function drillCardHTML(en) {
  const d = drillById(en.drillId) || { name: 'Deleted drill', attempts: 10, success: '' };
  const sc = entryScore(en);
  const body = en.typed
    ? `<div class="drill-count">
        <input class="input" type="number" inputmode="numeric" min="0" value="${en.made === '' ? '' : toInt(en.made) || 0}" data-input="typed-made" data-key="${en.key}" aria-label="Makes">
        <span class="muted">made of</span>
        <input class="input" type="number" inputmode="numeric" min="0" value="${en.attempts === '' ? '' : toInt(en.attempts) || 0}" data-input="typed-attempts" data-key="${en.key}" aria-label="Attempts">
      </div>`
    : `${boxesHTML(en.marks, d.attempts || 10, en.key)}
      <div class="drill-actions">
        <button type="button" class="btn" data-act="mark" data-v="1" data-key="${en.key}">${ICON.makeBtn}Make</button>
        <button type="button" class="btn secondary" data-act="mark" data-v="0" data-key="${en.key}">${ICON.missBtn}Miss</button>
      </div>`;
  return `<div class="drill" data-key="${en.key}">
    <div class="drill-head">
      <div class="grow"><div class="name">${esc(d.name)}</div>${d.success ? `<div class="success">Make: ${esc(d.success.toLowerCase())}</div>` : ''}</div>
      <div class="score" id="score-${en.key}">${scoreHTML(sc)}</div>
    </div>
    ${body}
    <div class="drill-foot">
      ${en.typed ? '<span></span>' : `<button type="button" class="linkbtn" data-act="undo" data-key="${en.key}" ${en.marks.length ? '' : 'disabled style="opacity:.4"'}>Undo</button>`}
      <button type="button" class="linkbtn" data-act="toggle-typed" data-key="${en.key}">${en.typed ? 'Score shot by shot' : 'Type a count'}</button>
      <button type="button" class="linkbtn danger" data-act="remove-drill" data-key="${en.key}">Remove</button>
    </div>
  </div>`;
}
const scoreHTML = (sc) => (sc.attempts ? `<b>${sc.made}/${sc.attempts}</b><small>${pct(sc.made, sc.attempts)}%</small>` : `<b>–</b><small>no shots</small>`);

function pickerHTML() {
  if (!pickerOpen) return `<button type="button" class="btn secondary block" style="margin-top:12px" data-act="open-picker">${ICON.plus}Add a drill</button>`;
  const used = new Set(form.drills.map((e) => e.drillId));
  const order = [...form.areas, ...AREAS.map((a) => a.id).filter((id) => !form.areas.includes(id))];
  const groups = order
    .map((areaId) => ({ areaId, drills: activeDrills().filter((d) => d.area === areaId) }))
    .filter((g) => g.drills.length);
  return `<div class="picker">
    ${groups.map((g) => `<h3>${esc(areaName(g.areaId))}</h3><div class="chips">${g.drills.map((d) =>
      `<button type="button" class="chip" data-act="add-drill" data-id="${esc(d.id)}" ${used.has(d.id) ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>${esc(d.name)}</button>`).join('')}</div>`).join('')}
    <p class="hint" style="margin-top:12px">Need a different drill? Create it in Setup. This session stays saved as a draft.</p>
    <button type="button" class="linkbtn" data-act="close-picker">Done</button>
  </div>`;
}

function refreshDrills() {
  $('#drills').innerHTML = drillCardsHTML();
  $('#picker-wrap').innerHTML = pickerHTML();
}
function refreshDrillCard(key) {
  const en = form.drills.find((e) => e.key === key);
  const el = view.querySelector(`.drill[data-key="${key}"]`);
  if (en && el) el.outerHTML = drillCardHTML(en);
  freshBox = null;
}

VIEWS.log = {
  html() { ensureNewForm(); return logViewHTML(); },
  mount() { startTimerTicker(); },
};
VIEWS.edit = {
  html(r) {
    if (!ensureEditForm(r.id)) { go('#/history'); return null; }
    return logViewHTML();
  },
};

let timerTicker = null;
function startTimerTicker() {
  clearInterval(timerTicker);
  timerTicker = setInterval(() => {
    if (route().name !== 'log' || !form || form.mode !== 'new') { clearInterval(timerTicker); return; }
    updateTimerUI();
  }, 15000);
}
function updateTimerUI() {
  const chip = $('[data-act="duration-timer"]');
  if (!chip) return;
  chip.hidden = !timerUsable();
  const t = $('#timer-min'); if (t) t.textContent = timerMinutes();
  if (form.minutesSource === 'timer') { form.minutes = timerMinutes(); saveDraft(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && route().name === 'log') updateTimerUI(); });

/* ---------- Progress ---------- */
VIEWS.progress = {
  html(r) {
    if (r.id && drillById(r.id)) { db.settings.progressDrill = r.id; saveDB(); }
    const range = db.settings.range;
    const from = isoDate(rangeStart(range));
    const withData = db.drills.filter((d) => drillSeries(d.id).length);
    let sel = db.settings.progressDrill;
    if (!withData.find((d) => d.id === sel)) sel = withData[0] ? withData[0].id : null;
    const series = sel ? drillSeries(sel, from) : [];
    const last5 = series.slice(-5), prev5 = series.slice(-10, -5);
    const avg = (arr) => (arr.length ? Math.round((arr.reduce((t, q) => t + q.made, 0) / arr.reduce((t, q) => t + q.attempts, 0)) * 100) : null);
    const best = series.length ? Math.max(...series.map((q) => pct(q.made, q.attempts))) : null;
    const d = sel ? drillById(sel) : null;
    const rangeLabel = { '4w': 'last 4 weeks', '12w': 'last 12 weeks', '1y': 'last 12 months' }[range];
    const inRange = db.sessions.filter((s) => s.date >= from);

    return `
      <header class="topbar"><div><h1>Progress</h1><div class="sub">${plural(inRange.length, 'session')} in the ${rangeLabel}</div></div></header>
      <div class="filters">
        <div class="seg" role="group" aria-label="Time range">
          ${[['4w', '4 weeks'], ['12w', '12 weeks'], ['1y', '12 months']].map(([k, l]) => `<button type="button" data-act="range" data-v="${k}" aria-pressed="${range === k}">${l}</button>`).join('')}
        </div>
      </div>

      <h2 class="chart-title">Drill scores</h2>
      ${withData.length ? `
        <select class="input" data-change="pick-drill" aria-label="Drill" style="margin:6px 0 8px">
          ${withData.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
        </select>
        ${d && d.success ? `<p class="chart-sub">Make: ${esc(d.success.toLowerCase())}. Each dot is one session.</p>` : ''}
        ${series.length ? `
          <div class="chart-frame"><div class="chart" id="chart-drill"></div>
          ${series.length >= 3 ? `<div class="legend"><span><i class="k-dot"></i>Session score</span><span><i class="k-line"></i>5-session average</span></div>` : ''}</div>
          <dl class="stats">
            <div><dt>Last 5</dt><dd>${avg(last5) ?? '–'}${avg(last5) != null ? '<small>%</small>' : ''}</dd></div>
            <div><dt>5 before that</dt><dd>${avg(prev5) ?? '–'}${avg(prev5) != null ? '<small>%</small>' : ''}</dd></div>
            <div><dt>Best session</dt><dd>${best ?? '–'}${best != null ? '<small>%</small>' : ''}</dd></div>
          </dl>
          <details class="table-view"><summary>Show sessions as a table</summary>
            <table><thead><tr><th>Date</th><th>Made</th><th>Rate</th></tr></thead><tbody>
            ${[...series].reverse().map((q) => `<tr><td>${fmtDate(q.date)}</td><td>${q.made} of ${q.attempts}</td><td>${pct(q.made, q.attempts)}%</td></tr>`).join('')}
            </tbody></table></details>`
        : `<div class="empty"><p>No scores for this drill in the ${rangeLabel}. Pick a longer range above.</p></div>`}
      ` : `<div class="empty"><p>No drill scores yet.</p><p>Add a drill while logging a session and score it shot by shot. Your success rate shows up here.</p></div>`}

      <h2 class="chart-title">Practice time</h2>
      <p class="chart-sub">${range === '1y' ? 'Minutes per month' : `Minutes per week, against your ${db.settings.weeklyGoal} min goal`}</p>
      <div class="chart-frame"><div class="chart" id="chart-time"></div></div>
      <details class="table-view"><summary>Show as a table</summary><div id="time-table"></div></details>

      <h2 class="chart-title">Where the time went</h2>
      <p class="chart-sub">Each session's time is split evenly across the areas you picked.</p>
      <div id="area-bars"></div>
    `;
  },
  mount() { drawProgressCharts(); },
};

function timeBuckets(range) {
  const now = new Date();
  const out = [];
  if (range === '1y') {
    for (let i = 11; i >= 0; i--) {
      const a = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      out.push({ label: a.toLocaleDateString(LOCALE, { month: 'short' }), long: a.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }), value: minutesInRange(isoDate(a), isoDate(b)) });
    }
  } else {
    const n = range === '4w' ? 4 : 12;
    const ws = startOfWeek(now);
    for (let i = n - 1; i >= 0; i--) {
      const a = addDays(ws, -7 * i), b = addDays(a, 6);
      out.push({ label: a.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }), long: `Week of ${a.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}`, value: minutesInRange(isoDate(a), isoDate(b)) });
    }
  }
  return out;
}

function drawProgressCharts() {
  const range = db.settings.range;
  const from = isoDate(rangeStart(range));

  const buckets = timeBuckets(range);
  const timeEl = $('#chart-time');
  if (timeEl) {
    columnChart(timeEl, {
      labels: buckets.map((b) => b.label),
      values: buckets.map((b) => b.value),
      goal: range === '1y' ? null : db.settings.weeklyGoal,
      tip: (i) => `${esc(buckets[i].long)}<br><b>${fmtMin(buckets[i].value)}</b>`,
    });
    $('#time-table').innerHTML = `<table><thead><tr><th>${range === '1y' ? 'Month' : 'Week of'}</th><th>Minutes</th></tr></thead><tbody>
      ${[...buckets].reverse().map((b) => `<tr><td>${esc(b.label)}</td><td>${b.value}</td></tr>`).join('')}</tbody></table>`;
  }

  const areaEl = $('#area-bars');
  if (areaEl) {
    const totals = {};
    for (const s of db.sessions) {
      if (s.date < from) continue;
      const areas = s.areas && s.areas.length ? s.areas : ['_none'];
      for (const a of areas) totals[a] = (totals[a] || 0) + s.minutes / areas.length;
    }
    const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 0;
    areaEl.innerHTML = rows.length
      ? `<ul class="hbars">${rows.map(([id, m]) => `<li><div class="lbl"><span>${id === '_none' ? 'Not specified' : esc(areaName(id))}</span><span>${fmtMin(m)}</span></div>
          <div class="track"><div class="fill" style="width:${(m / max) * 100}%"></div></div></li>`).join('')}</ul>`
      : `<div class="empty"><p>No sessions in this range yet.</p></div>`;
  }

  const drillEl = $('#chart-drill');
  if (drillEl) {
    const sel = $('[data-change="pick-drill"]').value;
    const series = drillSeries(sel, from);
    lineChart(drillEl, series);
  }
}

let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (route().name === 'progress') drawProgressCharts(); }, 150);
});

/* ---------- Setup ---------- */
let drillEdit = null;     // { id?, name, area, attempts, success }
let pendingImport = null; // normalized db waiting for confirmation
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function drillFormHTML() {
  if (!drillEdit) return '';
  const isEdit = !!drillEdit.id;
  const used = isEdit ? drillUseCount(drillEdit.id) : 0;
  const archived = isEdit && drillById(drillEdit.id).archived;
  return `<div class="form-card" id="drill-form">
    <div class="field"><label for="d-name">Drill name</label>
      <input id="d-name" class="input" data-input="de-name" value="${esc(drillEdit.name)}" placeholder="For example: Putts from 3 m" maxlength="60"></div>
    <div class="field"><label for="d-area">Area</label>
      <select id="d-area" class="input" data-change="de-area">${AREAS.map((a) => `<option value="${a.id}" ${a.id === drillEdit.area ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="d-success">What counts as a make</label>
      <input id="d-success" class="input" data-input="de-success" value="${esc(drillEdit.success)}" placeholder="For example: Holed, or Inside 2 m" maxlength="60"></div>
    <div class="field"><label for="d-att">Shots per set</label>
      <input id="d-att" class="input" style="width:110px" type="number" inputmode="numeric" min="1" max="50" data-input="de-attempts" value="${drillEdit.attempts}">
      <div class="hint">How many boxes to show. You can always hit more.</div></div>
    ${drillEdit.error ? `<div class="error" role="alert">${esc(drillEdit.error)}</div>` : ''}
    <div class="btns">
      <button class="btn" data-act="save-drill">${isEdit ? 'Save drill' : 'Add drill'}</button>
      <button class="btn secondary" data-act="cancel-drill">Cancel</button>
    </div>
    ${isEdit ? `<div style="margin-top:14px">
      ${used
        ? `<button class="linkbtn" data-act="archive-drill" data-id="${esc(drillEdit.id)}">${archived ? 'Restore drill' : 'Archive drill'}</button>
           <div class="hint">${archived ? 'Archived drills are hidden when logging.' : `Used in ${plural(used, 'session')}. Archiving hides it when logging but keeps its history.`}</div>`
        : `<button class="linkbtn danger" data-act="delete-drill" data-id="${esc(drillEdit.id)}" data-confirm="Tap again to delete">Delete drill</button>`}
    </div>` : ''}
  </div>`;
}

VIEWS.setup = {
  html() {
    const st = db.settings;
    const byArea = (list) => [...list].sort((a, b) => AREAS.findIndex((x) => x.id === a.area) - AREAS.findIndex((x) => x.id === b.area));
    const drillRow = (d) => `<li><button class="row" style="width:100%;background:none;border:0;text-align:left;cursor:pointer" data-act="edit-drill" data-id="${esc(d.id)}">
        <div class="grow"><div class="title">${esc(d.name)}</div><div class="meta">${esc(areaName(d.area))}, ${d.attempts} shots${d.success ? `, ${esc(d.success.toLowerCase())}` : ''}</div></div>${ICON.chev}</button></li>`;
    const active = byArea(db.drills.filter((d) => !d.archived));
    const archived = byArea(db.drills.filter((d) => d.archived));

    let installHTML;
    if (isStandalone()) installHTML = `<p>Installed. Golf Training opens from your home screen and works without a connection.</p>`;
    else if (installEvt) installHTML = `<p>Install the app to open it from your home screen and use it offline.</p><button class="btn" data-act="install">Install app</button>`;
    else if (isIOS()) installHTML = `<ol class="steps"><li>Open this page in Safari.</li><li>Tap the Share button.</li><li>Choose Add to Home Screen, then Add.</li><li>From then on, open Golf Training from your home screen. It keeps its own data, separate from Safari.</li></ol>`;
    else installHTML = `<ol class="steps"><li>Open this page in Chrome on your phone.</li><li>Open the menu (three dots).</li><li>Choose Install app or Add to Home screen.</li></ol>`;

    return `
      <header class="topbar"><h1>Setup</h1></header>

      <h2>Weekly goal</h2>
      <div class="setting">
        <div class="grow">Practice minutes per week</div>
        <div class="stepper">
          <button type="button" data-act="goal" data-v="-15" aria-label="15 minutes less">−</button>
          <output id="goal-out" aria-live="polite">${st.weeklyGoal}</output>
          <button type="button" data-act="goal" data-v="15" aria-label="15 minutes more">+</button>
        </div>
      </div>

      <div class="section-head"><h2>Drills</h2>${drillEdit && !drillEdit.id ? '' : `<button class="btn small secondary" data-act="new-drill">${ICON.plus}New drill</button>`}</div>
      ${drillEdit && !drillEdit.id ? drillFormHTML() : ''}
      <ul class="list" style="margin-top:8px">${active.map((d) => (drillEdit && drillEdit.id === d.id ? `<li>${drillFormHTML()}</li>` : drillRow(d))).join('')}</ul>
      ${archived.length ? `<h2 style="font-size:16px" class="muted">Archived</h2><ul class="list">${archived.map((d) => (drillEdit && drillEdit.id === d.id ? `<li>${drillFormHTML()}</li>` : drillRow(d))).join('')}</ul>` : ''}

      <h2>Backup</h2>
      <p>Your log is stored only on this phone. Export a backup now and then, and keep it somewhere safe.${isIOS() ? ' Export opens the share sheet: choose Save to Files, or send it to yourself.' : ''}</p>
      <p class="small muted">Last backup: ${st.lastBackup ? new Date(st.lastBackup).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : 'never'}</p>
      <div class="actions-row" style="margin-top:10px">
        <button class="btn" data-act="export">Export backup</button>
        <label class="btn secondary" for="import-file">Import backup</label>
      </div>
      <input type="file" id="import-file" class="visually-hidden" accept="application/json,.json" data-change="import-file">
      ${pendingImport ? `<div class="notice" style="border-left-color:var(--danger)">
        <p>This backup has ${plural(pendingImport.sessions.length, 'session')} and ${plural(pendingImport.drills.length, 'drill')}.
        Importing replaces the ${plural(db.sessions.length, 'session')} on this phone.</p>
        <div class="actions-row" style="margin-top:10px"><button class="btn danger" data-act="confirm-import">Replace my data</button><button class="btn secondary" data-act="cancel-import">Cancel</button></div>
      </div>` : ''}

      <h2>Appearance</h2>
      <div class="seg" role="group" aria-label="Theme">
        ${[['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-act="theme" data-v="${k}" aria-pressed="${st.theme === k}">${l}</button>`).join('')}
      </div>
      <p class="hint">Light is easiest to read in bright sun.</p>

      <h2>Install on your phone</h2>
      ${installHTML}

      <h2>Start over</h2>
      <p class="small muted">Deletes every session and resets the drill list. Export a backup first if you might want it back.</p>
      <button class="btn danger" data-act="erase" data-confirm="Tap again to erase everything">Erase all data</button>

      <p class="small muted" style="margin-top:32px">Golf Training ${APP_VERSION}</p>
    `;
  },
};

/* ======================================================================
   Charts (plain SVG, no library)
   ====================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
function niceStep(max, count) {
  const raw = max / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function colPath(x, y0, w, h, r) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  const y = y0 - h;
  return `M${x},${y0}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y0}Z`;
}
function makeTooltip(el) {
  const tip = document.createElement('div');
  tip.className = 'tooltip'; tip.hidden = true;
  el.appendChild(tip);
  return tip;
}
function bindHover(el, svg, { indexAt, show, hide }) {
  const handler = (e) => {
    const rect = svg.getBoundingClientRect();
    const i = indexAt(e.clientX - rect.left);
    if (i == null) hide(); else show(i);
  };
  svg.addEventListener('pointermove', handler);
  svg.addEventListener('pointerdown', handler);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
}

function columnChart(el, { labels, values, goal, tip }) {
  const W = Math.max(260, el.clientWidth), H = 190;
  const m = { l: 36, r: 6, t: 16, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const top = Math.max(1, ...values, goal || 0);
  const step = niceStep(top, 4);
  const yMax = Math.ceil(top / step) * step;
  const y = (v) => m.t + ph - (v / yMax) * ph;
  const n = values.length, slot = pw / n, bw = Math.min(24, Math.max(4, slot * 0.6));
  const every = Math.ceil(n / 6);

  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Column chart of practice minutes">`;
  s += '<g class="grid">';
  for (let v = step; v <= yMax + 1e-9; v += step) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
  s += '</g><g class="axis">';
  for (let v = 0; v <= yMax + 1e-9; v += step) s += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  labels.forEach((l, i) => {
    if ((n - 1 - i) % every === 0) s += `<text x="${m.l + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`;
  });
  s += '</g>';
  values.forEach((v, i) => {
    const x = m.l + i * slot + (slot - bw) / 2;
    s += `<path class="bar" data-i="${i}" d="${colPath(x, y(0), bw, y(0) - y(v), 4)}"/>`;
  });
  s += `<line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  if (goal) {
    s += `<line class="goal-line" x1="${m.l}" x2="${W - m.r}" y1="${y(goal)}" y2="${y(goal)}"/>`;
    s += `<text class="goal-label" x="${W - m.r}" y="${y(goal) - 5}" text-anchor="end">Goal ${goal}</text>`;
  }
  s += `<rect class="hit" x="${m.l}" y="0" width="${pw}" height="${H}"/></svg>`;
  el.innerHTML = s;

  const svg = el.querySelector('svg');
  const t = makeTooltip(el);
  const bars = el.querySelectorAll('.bar');
  bindHover(el, svg, {
    indexAt: (x) => { const i = Math.floor((x - m.l) / slot); return i >= 0 && i < n ? i : null; },
    show: (i) => {
      bars.forEach((b, j) => b.classList.toggle('dim', j !== i));
      t.innerHTML = tip(i);
      t.style.left = `${clamp(m.l + i * slot + slot / 2, 70, W - 70)}px`;
      const top = Math.min(y(values[i]), y(0) - 4);
      t.style.top = `${top}px`;
      t.classList.toggle('below', top < 64);
      t.hidden = false;
    },
    hide: () => { bars.forEach((b) => b.classList.remove('dim')); t.hidden = true; },
  });
}

function lineChart(el, series) {
  const W = Math.max(260, el.clientWidth), H = 200;
  const m = { l: 38, r: 38, t: 14, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const n = series.length;
  const x = (i) => (n === 1 ? m.l + pw / 2 : m.l + (i * pw) / (n - 1));
  const y = (v) => m.t + ph - v * ph;
  const avg = series.map((_, i) => {
    const w = series.slice(Math.max(0, i - 4), i + 1);
    return w.reduce((t, q) => t + q.made, 0) / w.reduce((t, q) => t + q.attempts, 0);
  });
  const showAvg = n >= 3;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Drill success rate per session">`;
  s += '<g class="grid">';
  [0.25, 0.5, 0.75, 1].forEach((v) => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`; });
  s += '</g><g class="axis">';
  [0, 0.25, 0.5, 0.75, 1].forEach((v) => { s += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`; });
  if (n >= 1) s += `<text x="${n === 1 ? x(0) : m.l}" y="${H - 6}" text-anchor="${n === 1 ? 'middle' : 'start'}">${fmtShort(series[0].date)}</text>`;
  if (n >= 2) s += `<text x="${W - m.r}" y="${H - 6}" text-anchor="end">${fmtShort(series[n - 1].date)}</text>`;
  s += '</g>';
  s += `<line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  s += `<line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${y(0)}" visibility="hidden"/>`;
  if (showAvg) {
    s += `<path class="area" d="M${x(0)},${y(0)} ${avg.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)}Z"/>`;
    s += `<polyline class="avg-line" points="${avg.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;
  }
  const r = n > 40 ? 3 : 4;
  series.forEach((q, i) => { s += `<circle class="pt${!showAvg && i === n - 1 ? ' last' : ''}" cx="${x(i)}" cy="${y(q.v)}" r="${r}"/>`; });
  const endV = showAvg ? avg[n - 1] : series[n - 1].v;
  s += `<text class="endlabel" x="${x(n - 1) + 8}" y="${y(endV) + 4}">${Math.round(endV * 100)}%</text>`;
  s += `<circle class="hover-dot" r="6" fill="var(--fairway)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`;
  s += `<rect class="hit" x="0" y="0" width="${W}" height="${H}"/></svg>`;
  el.innerHTML = s;

  const svg = el.querySelector('svg');
  const cross = svg.querySelector('.crosshair');
  const hdot = svg.querySelector('.hover-dot');
  const t = makeTooltip(el);
  bindHover(el, svg, {
    indexAt: (px) => {
      if (n === 1) return 0;
      const i = Math.round(((px - m.l) / pw) * (n - 1));
      return clamp(i, 0, n - 1);
    },
    show: (i) => {
      const q = series[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      hdot.setAttribute('cx', x(i)); hdot.setAttribute('cy', y(q.v)); hdot.setAttribute('visibility', 'visible');
      t.innerHTML = `${fmtDate(q.date)}<br><b>${q.made} of ${q.attempts}</b> (${pct(q.made, q.attempts)}%)${showAvg ? `<br>Average ${Math.round(avg[i] * 100)}%` : ''}`;
      t.style.left = `${clamp(x(i), 75, W - 75)}px`;
      const top = Math.min(y(q.v), showAvg ? y(avg[i]) : y(q.v));
      const below = top < 72;
      t.style.top = `${below ? Math.max(y(q.v), showAvg ? y(avg[i]) : y(q.v)) : top}px`;
      t.classList.toggle('below', below);
      t.hidden = false;
    },
    hide: () => { cross.setAttribute('visibility', 'hidden'); hdot.setAttribute('visibility', 'hidden'); t.hidden = true; },
  });
}

/* ======================================================================
   Actions
   ====================================================================== */
function findEntry(key) { return form && form.drills.find((e) => e.key === key); }
function setPressed(btn, on) { btn.setAttribute('aria-pressed', String(!!on)); }

const ACTIONS = {
  /* Today */
  'dismiss-install'() { db.settings.installDismissed = true; saveDB(); render(); },

  /* Session form */
  place(t) {
    const v = t.dataset.v;
    form.place = form.place === v ? null : v;
    t.parentElement.querySelectorAll('.chip').forEach((c) => setPressed(c, c.dataset.v === form.place));
    saveDraft();
  },
  duration(t) {
    const v = Number(t.dataset.v);
    const on = !(form.minutesSource === 'chip' && form.minutes === v);
    form.minutes = on ? v : null; form.minutesSource = on ? 'chip' : null;
    syncDurationUI(); saveDraft();
  },
  'duration-timer'() {
    const on = form.minutesSource !== 'timer';
    form.minutes = on ? timerMinutes() : null; form.minutesSource = on ? 'timer' : null;
    syncDurationUI(); saveDraft();
  },
  area(t) {
    const v = t.dataset.v;
    form.areas = form.areas.includes(v) ? form.areas.filter((a) => a !== v) : [...form.areas, v];
    setPressed(t, form.areas.includes(v));
    if (pickerOpen) $('#picker-wrap').innerHTML = pickerHTML();
    saveDraft();
  },
  feel(t) {
    const v = Number(t.dataset.v);
    form.feel = form.feel === v ? null : v;
    t.parentElement.querySelectorAll('.chip').forEach((c) => setPressed(c, Number(c.dataset.v) === form.feel));
    saveDraft();
  },
  'open-picker'() { pickerOpen = true; $('#picker-wrap').innerHTML = pickerHTML(); },
  'close-picker'() { pickerOpen = false; $('#picker-wrap').innerHTML = pickerHTML(); },
  'add-drill'(t) {
    const d = drillById(t.dataset.id);
    if (!d) return;
    form.drills.push({ key: uid(), drillId: d.id, marks: [], typed: false, made: '', attempts: '' });
    if (!form.areas.includes(d.area)) {
      form.areas.push(d.area);
      $('#area-chips').innerHTML = areaChipsHTML();
    }
    pickerOpen = false;
    refreshDrills(); saveDraft();
    const card = view.querySelector(`.drill[data-key="${form.drills[form.drills.length - 1].key}"]`);
    if (card) card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  },
  mark(t) {
    const en = findEntry(t.dataset.key); if (!en) return;
    en.marks.push(Number(t.dataset.v));
    freshBox = { key: en.key, i: en.marks.length - 1 };
    if (navigator.vibrate) { try { navigator.vibrate(Number(t.dataset.v) ? 12 : [6, 40, 6]); } catch (e) {} }
    refreshDrillCard(en.key); saveDraft();
  },
  box(t) {
    const en = findEntry(t.dataset.key); if (!en) return;
    const i = Number(t.dataset.i);
    if (i < en.marks.length) en.marks[i] = en.marks[i] ? 0 : 1; else en.marks.push(1);
    freshBox = { key: en.key, i: Math.min(i, en.marks.length - 1) };
    refreshDrillCard(en.key); saveDraft();
  },
  undo(t) {
    const en = findEntry(t.dataset.key); if (!en || !en.marks.length) return;
    en.marks.pop(); refreshDrillCard(en.key); saveDraft();
  },
  'toggle-typed'(t) {
    const en = findEntry(t.dataset.key); if (!en) return;
    if (!en.typed) { const sc = entryScore(en); en.made = sc.attempts ? sc.made : ''; en.attempts = sc.attempts || ''; en.typed = true; }
    else { en.typed = false; }
    refreshDrillCard(en.key); saveDraft();
  },
  'remove-drill'(t) {
    form.drills = form.drills.filter((e) => e.key !== t.dataset.key);
    refreshDrills(); saveDraft();
  },
  discard() {
    clearDraft(); form = null;
    go('#/today'); toast('Session discarded');
  },
  'close-form'() {
    // Keep a started draft for "Continue session"; drop an untouched one and any edit copy.
    if (form && form.mode === 'edit') form = null;
    else if (form && !form.place && !form.minutes && !form.areas.length && !form.drills.length && !form.feel && !form.notes.trim()) { clearDraft(); form = null; }
  },
  'save-session'() {
    let minutes = form.minutesSource === 'timer' ? timerMinutes() : toInt(form.minutes);
    if (!minutes) {
      formError = 'Add how long you practiced.';
      const f = $('#f-duration');
      if (f) { f.querySelector('.error')?.remove(); f.insertAdjacentHTML('beforeend', `<div class="error" role="alert">${formError}</div>`); f.scrollIntoView({ block: 'center' }); }
      return;
    }
    const drills = form.drills.map((en) => {
      const sc = entryScore(en);
      const out = { drillId: en.drillId, made: sc.made, attempts: sc.attempts };
      if (!en.typed) out.marks = [...en.marks];
      return out;
    }).filter((e) => e.attempts > 0);
    const now = Date.now();
    const data = { date: form.date || todayISO(), place: form.place, minutes: clamp(minutes, 1, 900), areas: [...form.areas], drills, feel: form.feel, notes: (form.notes || '').trim() };
    if (form.mode === 'new') {
      const isFirst = db.sessions.length === 0;
      db.sessions.push({ id: uid(), ...data, createdAt: now, updatedAt: now });
      if (!saveDB()) return;
      clearDraft(); form = null; formError = '';
      if (isFirst) askPersistentStorage();
      go('#/today'); toast('Session saved');
    } else {
      const s = db.sessions.find((x) => x.id === form.id);
      if (!s) return;
      Object.assign(s, data, { updatedAt: now });
      if (!saveDB()) return;
      const id = form.id; form = null; formError = '';
      go(`#/session/${encodeURIComponent(id)}`); toast('Changes saved');
    }
  },

  /* Session detail */
  'delete-session'(t) {
    db.sessions = db.sessions.filter((s) => s.id !== t.dataset.id);
    saveDB(); go('#/history'); toast('Session deleted');
  },

  /* Progress */
  range(t) { db.settings.range = t.dataset.v; saveDB(); render(); },

  /* Setup */
  goal(t) {
    db.settings.weeklyGoal = clamp(db.settings.weeklyGoal + Number(t.dataset.v), 15, 1500);
    saveDB(); $('#goal-out').textContent = db.settings.weeklyGoal;
  },
  'new-drill'() { drillEdit = { name: '', area: 'putting', attempts: 10, success: '' }; render(); $('#d-name')?.focus(); },
  'edit-drill'(t) { const d = drillById(t.dataset.id); if (!d) return; drillEdit = { id: d.id, name: d.name, area: d.area, attempts: d.attempts, success: d.success || '' }; render(); $('#drill-form')?.scrollIntoView({ block: 'center' }); },
  'cancel-drill'() { drillEdit = null; render(); },
  'save-drill'() {
    const name = (drillEdit.name || '').trim();
    const attempts = clamp(toInt(drillEdit.attempts) || 10, 1, 50);
    if (!name) { drillEdit.error = 'Give the drill a name.'; render(); $('#d-name')?.focus(); return; }
    if (drillEdit.id) {
      Object.assign(drillById(drillEdit.id), { name, area: drillEdit.area, attempts, success: (drillEdit.success || '').trim() });
      toast('Drill saved');
    } else {
      db.drills.push({ id: uid(), name, area: drillEdit.area, attempts, success: (drillEdit.success || '').trim(), archived: false });
      toast('Drill added');
    }
    saveDB(); drillEdit = null; render();
  },
  'archive-drill'(t) {
    const d = drillById(t.dataset.id); if (!d) return;
    d.archived = !d.archived; saveDB(); drillEdit = null; render();
    toast(d.archived ? 'Drill archived' : 'Drill restored');
  },
  'delete-drill'(t) {
    db.drills = db.drills.filter((d) => d.id !== t.dataset.id);
    saveDB(); drillEdit = null; render(); toast('Drill deleted');
  },
  theme(t) { db.settings.theme = t.dataset.v; saveDB(); applyTheme(); render(); },
  export() { exportBackup(); },
  'confirm-import'() {
    db = pendingImport; pendingImport = null; form = null;
    saveDB(); applyTheme(); render(); toast('Backup imported');
  },
  'cancel-import'() { pendingImport = null; render(); },
  erase() {
    db = freshDB(); clearDraft(); form = null;
    saveDB(); applyTheme(); render(); toast('All data erased');
  },
  async install() {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) {}
    installEvt = null; render();
  },
};

function syncDurationUI() {
  document.querySelectorAll('[data-act="duration"]').forEach((c) => setPressed(c, form.minutesSource === 'chip' && form.minutes === Number(c.dataset.v)));
  const tc = $('[data-act="duration-timer"]'); if (tc) setPressed(tc, form.minutesSource === 'timer');
  const inp = $('#f-min'); if (inp && form.minutesSource !== 'custom') inp.value = '';
  if (form.minutes) { formError = ''; $('#f-duration .error')?.remove(); }
}

const INPUTS = {
  date(t) { form.date = t.value || todayISO(); saveDraft(); },
  minutes(t) {
    const v = toInt(t.value);
    form.minutes = v || null; form.minutesSource = v ? 'custom' : null;
    syncDurationUI(); saveDraft();
  },
  notes(t) { form.notes = t.value; saveDraft(); },
  'typed-made'(t) { const en = findEntry(t.dataset.key); if (!en) return; en.made = t.value; updateScore(en); saveDraft(); },
  'typed-attempts'(t) { const en = findEntry(t.dataset.key); if (!en) return; en.attempts = t.value; updateScore(en); saveDraft(); },
  'de-name'(t) { drillEdit.name = t.value; },
  'de-success'(t) { drillEdit.success = t.value; },
  'de-attempts'(t) { drillEdit.attempts = t.value; },
};
function updateScore(en) { const el = $(`#score-${en.key}`); if (el) el.innerHTML = scoreHTML(entryScore(en)); }

const CHANGES = {
  'pick-drill'(t) { db.settings.progressDrill = t.value; saveDB(); render(); },
  'de-area'(t) { drillEdit.area = t.value; },
  'import-file'(t) {
    const file = t.files && t.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed && parsed.data ? parsed.data : parsed;
        if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.drills)) throw new Error('shape');
        pendingImport = normalize(data);
        render();
      } catch (e) {
        toast('That file is not a Golf Training backup.');
      }
      t.value = '';
    };
    reader.readAsText(file);
  },
};

/* Two-step confirm for destructive buttons: first tap arms, second tap runs. */
function armOrRun(t) {
  if (!t.dataset.confirm) return true;
  if (t.classList.contains('armed')) return true;
  t.dataset.label = t.textContent;
  t.textContent = t.dataset.confirm;
  t.classList.add('armed');
  setTimeout(() => { if (t.isConnected) { t.classList.remove('armed'); t.textContent = t.dataset.label; } }, 4000);
  return false;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = ACTIONS[t.dataset.act];
  if (!fn) return;
  if (!armOrRun(t)) { e.preventDefault(); return; }
  fn(t, e);
});
document.addEventListener('input', (e) => { const t = e.target; const fn = t.dataset && INPUTS[t.dataset.input]; if (fn) fn(t, e); });
document.addEventListener('change', (e) => { const t = e.target; const fn = t.dataset && CHANGES[t.dataset.change]; if (fn) fn(t, e); });

/* ======================================================================
   Backup
   ====================================================================== */
async function exportBackup() {
  const payload = { app: 'golf-training', format: 1, exportedAt: new Date().toISOString(), data: db };
  const json = JSON.stringify(payload, null, 2);
  const name = `golf-training-backup-${todayISO()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const done = () => { db.settings.lastBackup = Date.now(); saveDB(); render(); toast('Backup exported'); };
  if (navigator.canShare && navigator.share && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
    try {
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Golf Training backup' }); done(); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  done();
}

/* ======================================================================
   Theme, toast, PWA plumbing
   ====================================================================== */
function applyTheme() {
  const t = db.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (t === 'system') { m.content = m.media.includes('dark') ? '#0E1712' : '#EEF2EC'; }
    else m.content = dark ? '#0E1712' : '#EEF2EC';
  });
}

let toastT = null;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.run(); };
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, action ? 15000 : 2600);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  if (route().name === 'setup') render();
});
window.addEventListener('appinstalled', () => { installEvt = null; db.settings.installDismissed = true; saveDB(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      let refreshing = false, wanted = false;
      const offer = (worker) => toast('A new version is ready.', { label: 'Reload', run: () => { wanted = true; worker.postMessage('skipWaiting'); } });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!wanted || refreshing) return;
        refreshing = true; location.reload();
      });
    } catch (e) { console.warn('Service worker not registered', e); }
  });
}

/* ======================================================================
   Start
   ====================================================================== */
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
render();
