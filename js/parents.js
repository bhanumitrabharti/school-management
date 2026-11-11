/**
 * js/parents.js
 * Paathshala Parent Portal — Lightweight Client Controller
 * Version: v86
 *
 * Handles:
 *   - Turnstile verification
 *   - Email OTP request & verification
 *   - Firebase custom token authentication
 *   - Real-time parent context loading
 *   - Multi-school & multi-child navigation (sibling switcher)
 *   - Dynamic school feature module toggles (cards only for enabled modules)
 *   - Lazy module views: Attendance, Timetable, Notices, Exams & Results
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

// Firebase Client Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAPKi-0EjMjsA9q60rwEHeI2T9HTWPGklo",
  authDomain: "ctrl-shift-solutions.firebaseapp.com",
  projectId: "ctrl-shift-solutions",
  storageBucket: "ctrl-shift-solutions.firebasestorage.app",
  messagingSenderId: "148856611397",
  appId: "1:148856611397:web:0f41ab3bc09e99eb03108c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Application State
const state = {
  email: '',
  sessionId: '',
  resendCooldownSeconds: 60,
  resendTimerId: null,
  schools: [],
  activeSchoolId: null,
  activeStudentId: null,
  activeModule: null, // null = home, 'attendance' | 'timetable' | 'notices' | 'exams'
  turnstileWidgetId: null,
  turnstileToken: '',
  attendanceMonth: null,
  timetableDay: null,
  examTermId: null
};

// --- Context Caching (C3: Parent Portal Quick Open) ---
const PARENT_CONTEXT_CACHE_KEY = 'paathshala_parent_context_v1';

function sanitizeContextForCache(schools) {
  if (!Array.isArray(schools)) return [];
  return schools.map(s => ({
    schoolId: s.schoolId,
    schoolName: s.schoolName,
    portalSettings: {
      theme: s.portalSettings && s.portalSettings.theme,
      branding: s.portalSettings && s.portalSettings.branding,
      modules: s.portalSettings && s.portalSettings.modules
    },
    students: (s.students || []).map(stu => ({
      id: stu.id,
      name: stu.name,
      class: stu.class,
      section: stu.section,
      rollNumber: stu.rollNumber,
      admissionNumber: stu.admissionNumber,
      photoUrl: stu.photoUrl
    }))
  }));
}

function saveCachedContext(schools, selectedSchoolId) {
  try {
    const cleanSchools = sanitizeContextForCache(schools);
    const payload = {
      schools: cleanSchools,
      selectedSchoolId: selectedSchoolId || (cleanSchools[0] && cleanSchools[0].schoolId),
      timestamp: Date.now()
    };
    localStorage.setItem(PARENT_CONTEXT_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[Parents] Failed to save context cache:', e);
  }
}

function clearCachedContext() {
  try {
    localStorage.removeItem(PARENT_CONTEXT_CACHE_KEY);
  } catch (_) {}
}

// DOM Elements
const elements = {
  viewEmail: document.getElementById('view-email'),
  viewOtp: document.getElementById('view-otp'),
  viewSchoolSelect: document.getElementById('view-school-select'),
  viewParentApp: document.getElementById('view-parent-app'),
  sectionHomeDashboard: document.getElementById('section-home-dashboard'),
  sectionModuleSubview: document.getElementById('section-module-subview'),
  
  formEmail: document.getElementById('form-email'),
  inputEmail: document.getElementById('input-email'),
  btnSendOtp: document.getElementById('btn-send-otp'),
  emailAlert: document.getElementById('email-alert'),
  
  formOtp: document.getElementById('form-otp'),
  inputOtp: document.getElementById('input-otp'),
  btnVerifyOtp: document.getElementById('btn-verify-otp'),
  btnResendOtp: document.getElementById('btn-resend-otp'),
  resendCountdown: document.getElementById('resend-countdown'),
  otpSentEmail: document.getElementById('otp-sent-email'),
  otpAlert: document.getElementById('otp-alert'),
  linkChangeEmail: document.getElementById('link-change-email'),
  
  schoolsList: document.getElementById('schools-list'),
  activeSchoolName: document.getElementById('active-school-name'),
  btnSwitchSchool: document.getElementById('btn-switch-school'),
  childPills: document.getElementById('child-pills'),
  
  studentName: document.getElementById('student-name'),
  studentSchoolDisplay: document.getElementById('student-school-display'),
  tagClassSec: document.getElementById('tag-class-sec'),
  tagRoll: document.getElementById('tag-roll'),
  tagAdm: document.getElementById('tag-adm'),
  avatarBox: document.getElementById('student-avatar-box'),
  avatarFallback: document.getElementById('student-avatar-fallback'),
  avatarImg: document.getElementById('student-avatar-img'),
  modulesContainer: document.getElementById('modules-container'),

  btnBackDashboard: document.getElementById('btn-back-dashboard'),
  subviewHeaderTitle: document.getElementById('subview-header-title'),
  
  subviewAttendance: document.getElementById('subview-attendance'),
  attendanceMonthSelect: document.getElementById('attendance-month-select'),
  attendanceStatusBadge: document.getElementById('attendance-status-badge'),
  attKpiPct: document.getElementById('att-kpi-pct'),
  attKpiTotal: document.getElementById('att-kpi-total'),
  attKpiPresent: document.getElementById('att-kpi-present'),
  attKpiAbsent: document.getElementById('att-kpi-absent'),
  attKpiLate: document.getElementById('att-kpi-late'),
  attendanceContentContainer: document.getElementById('attendance-content-container'),
  
  subviewTimetable: document.getElementById('subview-timetable'),
  timetableDayPills: document.getElementById('timetable-day-pills'),
  timetableContentContainer: document.getElementById('timetable-content-container'),
  
  subviewNotices: document.getElementById('subview-notices'),
  noticesContentContainer: document.getElementById('notices-content-container'),
  modalNoticeOverlay: document.getElementById('modal-notice-overlay'),
  modalNoticeTitle: document.getElementById('modal-notice-title'),
  modalNoticeDate: document.getElementById('modal-notice-date'),
  modalNoticePriority: document.getElementById('modal-notice-priority'),
  modalNoticeMessage: document.getElementById('modal-notice-message'),
  btnCloseNoticeModal: document.getElementById('btn-close-notice-modal'),
  btnCloseNoticeModal2: document.getElementById('btn-close-notice-modal-2'),

  subviewExams: document.getElementById('subview-exams'),
  examTermSelect: document.getElementById('exam-term-select'),
  examResultsContainer: document.getElementById('exam-results-container'),
  
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),
  btnLogout: document.getElementById('btn-logout'),
  brandLink: document.getElementById('brand-link')
};

// --- Theme Management ---
function initTheme() {
  const saved = localStorage.getItem('paathshala_parent_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('paathshala_parent_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  if (elements.themeIcon) {
    elements.themeIcon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  }
}

// --- Navigation / Views ---
function showView(viewName) {
  [elements.viewEmail, elements.viewOtp, elements.viewSchoolSelect, elements.viewParentApp].forEach(el => {
    if (el) el.classList.add('hidden');
  });

  if (viewName === 'email') elements.viewEmail.classList.remove('hidden');
  if (viewName === 'otp') elements.viewOtp.classList.remove('hidden');
  if (viewName === 'school-select') elements.viewSchoolSelect.classList.remove('hidden');
  if (viewName === 'dashboard' || viewName === 'parent-app') {
    elements.viewParentApp.classList.remove('hidden');
    elements.btnLogout.classList.remove('hidden');
  } else {
    elements.btnLogout.classList.add('hidden');
  }
}

function showAlert(alertEl, message, type = 'danger') {
  if (!alertEl) return;
  alertEl.className = `alert alert-${type}`;
  alertEl.innerHTML = `<span class="material-icons-round" style="font-size:18px;">${type === 'danger' ? 'error' : (type === 'success' ? 'check_circle' : 'info')}</span><span>${escapeHTML(message)}</span>`;
  alertEl.classList.remove('hidden');
}

function hideAlert(alertEl) {
  if (alertEl) alertEl.classList.add('hidden');
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function formatNoticeDate(rawDate) {
  if (!rawDate) return '';
  try {
    const d = new Date(rawDate.includes('T') ? rawDate : rawDate + 'T00:00:00');
    if (isNaN(d.getTime())) return rawDate;
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d).replace('Sept', 'Sep');
  } catch (_) {
    return rawDate;
  }
}

export function getPeriodTimeStr(pNum, dayName, settings = {}) {
  const p = parseInt(pNum, 10);
  if (isNaN(p) || p <= 0) return '';

  if (settings.periodTimes && (settings.periodTimes[pNum] || settings.periodTimes[String(pNum)])) {
    const pt = settings.periodTimes[pNum] || settings.periodTimes[String(pNum)];
    if (typeof pt === 'string') return pt;
    if (pt && pt.start && pt.end) return `${pt.start} - ${pt.end}`;
  }

  const isSaturday = String(dayName || '').toLowerCase().startsWith('sat');
  const startTime = isSaturday ? (settings.satStartTime || "08:00") : (settings.startTime || (settings.startHour ? `${String(settings.startHour).padStart(2, '0')}:00` : "08:00"));
  const endTime = isSaturday ? (settings.satEndTime || "12:30") : (settings.endTime || "14:00");
  const totalPeriods = parseInt(isSaturday ? (settings.satTotalPeriods || 6) : (settings.totalPeriods || 8), 10) || 8;
  const lunchAfter = parseInt(isSaturday ? (settings.satLunchAfterPeriod || 0) : (settings.lunchAfterPeriod !== undefined ? settings.lunchAfterPeriod : 4), 10);
  const lunchDur = parseInt(isSaturday ? (settings.satLunchDuration !== undefined ? settings.satLunchDuration : (settings.lunchDuration || 0)) : (settings.lunchDuration !== undefined ? settings.lunchDuration : 30), 10);

  function timeToMin(timeStr) {
    const parts = String(timeStr || "08:00").split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
  }

  const startMin = timeToMin(startTime);
  const endMin = timeToMin(endTime);
  const effectiveLunchDur = (lunchAfter > 0 && lunchAfter < totalPeriods && !isNaN(lunchDur)) ? lunchDur : 0;
  const totalAvailMin = endMin - startMin;
  const totalTeachingMin = totalAvailMin - effectiveLunchDur;
  const periodDur = Math.floor(totalTeachingMin / totalPeriods);
  const remainder = totalTeachingMin % totalPeriods;

  let currentMin = startMin;
  let pStart = startMin;
  let pEnd = startMin;

  for (let i = 1; i <= totalPeriods; i++) {
    let currentPeriodDur = periodDur;
    if (i === totalPeriods) {
      currentPeriodDur += remainder;
    }
    const startOfPeriod = currentMin;
    const endOfPeriod = currentMin + currentPeriodDur;
    if (i === p) {
      pStart = startOfPeriod;
      pEnd = endOfPeriod;
      break;
    }
    currentMin = endOfPeriod;
    if (lunchAfter > 0 && i === lunchAfter && !isNaN(lunchDur)) {
      currentMin += lunchDur;
    }
  }

  function formatTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    let dispHours = hours % 12;
    if (dispHours === 0) dispHours = 12;
    const dispMinStr = minutes < 10 ? '0' + minutes : minutes;
    const dispHourStr = dispHours < 10 ? '0' + dispHours : dispHours;
    return `${dispHourStr}:${dispMinStr} ${ampm}`;
  }

  return `${formatTime(pStart)} - ${formatTime(pEnd)}`;
}

async function loadDashboardSummaries(student, school) {
  const toggles = school.toggles || {};
  const studentId = student.id;

  // 1. Attendance Summary
  if (toggles.attendance !== false) {
    (async () => {
      const summaryEl = document.getElementById('card-summary-attendance');
      if (!summaryEl) return;
      try {
        const att = await callParentApi('attendance');
        if (state.activeStudentId !== studentId) return;
        if (Number(att.totalDays) === 0) {
          summaryEl.innerHTML = `<span style="color:var(--muted);"><span class="material-icons-round" style="font-size:14px;vertical-align:-2px;margin-right:2px;">info</span>No attendance recorded this month</span>`;
        } else {
          const color = att.percentage >= 75 ? 'var(--green)' : (att.percentage >= 60 ? 'var(--amber)' : 'var(--red)');
          summaryEl.innerHTML = `<span>This month: <strong style="color:${color}">${att.percentage}%</strong> (${att.presentDays}/${att.totalDays} days present)</span>`;
        }
      } catch (_) {
        summaryEl.innerHTML = `<span style="color:var(--muted);opacity:0.7;">Attendance summary unavailable</span>`;
      }
    })();
  }

  // 2. Timetable Summary (Today's 1st period)
  if (toggles.timetable !== false) {
    (async () => {
      const summaryEl = document.getElementById('card-summary-timetable');
      if (!summaryEl) return;
      try {
        const tt = await callParentApi('timetable');
        if (state.activeStudentId !== studentId) return;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayIndex = new Date().getDay();
        const todayName = (todayIndex >= 1 && todayIndex <= 6) ? days[todayIndex - 1] : 'Monday';
        const schedule = tt.schedule || {};
        const todayPeriods = schedule[todayName] || {};
        const pKeys = Object.keys(todayPeriods).sort((a, b) => Number(a) - Number(b));

        if (todayIndex === 0) {
          summaryEl.innerHTML = `<span style="color:var(--muted);"><span class="material-icons-round" style="font-size:14px;vertical-align:-2px;margin-right:2px;">wb_sunny</span>Sunday: School closed</span>`;
        } else if (pKeys.length === 0) {
          summaryEl.innerHTML = `<span style="color:var(--muted);">No classes scheduled for today (${todayName})</span>`;
        } else {
          const firstP = todayPeriods[pKeys[0]];
          const sub = (typeof firstP === 'object' && firstP ? firstP.subject : firstP) || '—';
          const timeStr = getPeriodTimeStr(pKeys[0], todayName, tt.settings || {});
          summaryEl.innerHTML = `<span>Today's 1st period: <strong>${escapeHTML(sub)}</strong>${timeStr ? ` <span style="color:var(--muted);font-size:0.75rem;">(${escapeHTML(timeStr)})</span>` : ''}</span>`;
        }
      } catch (_) {
        summaryEl.innerHTML = `<span style="color:var(--muted);opacity:0.7;">Timetable summary unavailable</span>`;
      }
    })();
  }

  // 3. Notices Summary (Latest notice title)
  if (toggles.notices !== false) {
    (async () => {
      const summaryEl = document.getElementById('card-summary-notices');
      if (!summaryEl) return;
      try {
        const res = await callParentApi('notices');
        if (state.activeStudentId !== studentId) return;
        const notices = res.notices || [];
        if (notices.length === 0) {
          summaryEl.innerHTML = `<span style="color:var(--muted);">No active circulars</span>`;
        } else {
          const latest = notices[0];
          summaryEl.innerHTML = `<span>Latest: <strong>${escapeHTML(latest.title || 'Notice')}</strong></span>`;
        }
      } catch (_) {
        summaryEl.innerHTML = `<span style="color:var(--muted);opacity:0.7;">Notices summary unavailable</span>`;
      }
    })();
  }

  // 4. Exams Summary (Latest visible term)
  if (toggles.exams === true) {
    (async () => {
      const summaryEl = document.getElementById('card-summary-exams');
      if (!summaryEl) return;
      try {
        const res = await callParentApi('exams');
        if (state.activeStudentId !== studentId) return;
        const terms = res.terms || [];
        if (terms.length === 0) {
          summaryEl.innerHTML = `<span style="color:var(--muted);">No terms published yet</span>`;
        } else {
          const latestTerm = terms[terms.length - 1];
          summaryEl.innerHTML = `<span>Latest Term: <strong>${escapeHTML(latestTerm.name || latestTerm.shortName || 'Term')}</strong></span>`;
        }
      } catch (_) {
        summaryEl.innerHTML = `<span style="color:var(--muted);opacity:0.7;">Exams summary unavailable</span>`;
      }
    })();
  }
}

// --- Turnstile Setup ---
function setupTurnstile() {
  const container = document.getElementById('turnstile-widget');
  if (!container) return;

  // Turnstile must not block a signed-in reopen or dashboard view
  if (state.schools && state.schools.length > 0 && elements.viewParentApp && !elements.viewParentApp.classList.contains('hidden')) {
    return;
  }

  if (state.turnstileWidgetId !== null) return;

  if (!window.turnstile) {
    if (!state._turnstileRetryCount) state._turnstileRetryCount = 0;
    if (state._turnstileRetryCount < 30) {
      state._turnstileRetryCount++;
      setTimeout(setupTurnstile, 200);
    }
    return;
  }

  const isLocalhost = window.__FORCE_PROD_MODE__ ? false : (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  let sitekey = window.TURNSTILE_SITE_KEY;
  if (isLocalhost) {
    sitekey = '1x00000000000000000000AA';
  }

  if (!sitekey) {
    console.warn('[Parents] Turnstile site key missing.');
    return;
  }

  try {
    state.turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
      sitekey: sitekey,
      theme: document.documentElement.getAttribute('data-theme') || 'auto',
      callback: function(token) {
        state.turnstileToken = token;
        hideAlert(elements.emailAlert);
      },
      'expired-callback': function() {
        state.turnstileToken = '';
      },
      'error-callback': function() {
        state.turnstileToken = '';
      }
    });
  } catch (e) {
    console.warn('[Parents] Turnstile render warning:', e);
  }
}

window.onloadTurnstileCallback = setupTurnstile;

// --- Timer Utilities ---
function startResendCountdown(seconds) {
  clearInterval(state.resendTimerId);
  state.resendCooldownSeconds = seconds;
  elements.btnResendOtp.disabled = true;
  elements.resendCountdown.textContent = `(${state.resendCooldownSeconds}s)`;

  state.resendTimerId = setInterval(() => {
    state.resendCooldownSeconds--;
    if (state.resendCooldownSeconds <= 0) {
      clearInterval(state.resendTimerId);
      elements.btnResendOtp.disabled = false;
      elements.resendCountdown.textContent = '';
    } else {
      elements.resendCountdown.textContent = `(${state.resendCooldownSeconds}s)`;
    }
  }, 1000);
}

// --- API Helpers ---
async function callParentApi(action, params = {}) {
  const user = auth.currentUser;
  let idToken = '';
  if (user) {
    try {
      idToken = await user.getIdToken();
    } catch (_) {}
  }

  const payload = {
    schoolId: state.activeSchoolId,
    studentId: state.activeStudentId,
    ...params
  };

  const resp = await fetch(`/api/parents?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'x-parent-email': state.email || (user ? user.email : '')
    },
    body: JSON.stringify(payload)
  });

  if (resp.status === 401) {
    clearCachedContext();
    showView('email');
    setupTurnstile();
    showAlert(elements.emailAlert, 'Session expired. Please request a new verification code.');
    try { await signOut(auth); } catch (_) {}
    throw new Error('Session expired (401)');
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Request failed (${resp.status})`);
  }
  return data;
}

// --- Auth Handlers ---
async function handleSendOtp(e) {
  if (e) e.preventDefault();
  hideAlert(elements.emailAlert);

  const email = (elements.inputEmail.value || '').trim();
  if (!email || !email.includes('@')) {
    showAlert(elements.emailAlert, 'Please enter a valid email address.');
    return;
  }

  const isLocalhost = window.__FORCE_PROD_MODE__ ? false : (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  if (!state.turnstileToken && !isLocalhost) {
    showAlert(elements.emailAlert, 'Please complete the security check.');
    return;
  }

  state.email = email;
  elements.btnSendOtp.disabled = true;
  elements.btnSendOtp.innerHTML = '<span>Sending code...</span>';

  try {
    const resp = await fetch('/api/parents?action=send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        turnstileToken: state.turnstileToken || (isLocalhost ? 'mock-client-token' : '')
      })
    });

    let data;
    try {
      data = await resp.json();
    } catch (parseErr) {
      data = {};
    }

    if (!resp.ok) {
      throw new Error(data.error || ('Failed to send verification code (' + resp.status + ').'));
    }

    state.sessionId = data.sessionId;
    elements.otpSentEmail.textContent = email;
    elements.inputOtp.value = '';
    showView('otp');
    startResendCountdown(data.resendCooldownSeconds || 60);
  } catch (err) {
    showAlert(elements.emailAlert, err.message || 'Failed to send verification code. Please try again.');
    if (window.turnstile && state.turnstileWidgetId !== null) {
      try {
        window.turnstile.reset(state.turnstileWidgetId);
        state.turnstileToken = '';
      } catch (rstErr) {
        // ignore
      }
    }
  } finally {
    elements.btnSendOtp.disabled = false;
    elements.btnSendOtp.innerHTML = '<span>Send Verification Code</span><span class="material-icons-round" style="font-size:18px;">arrow_forward</span>';
  }
}

async function handleVerifyOtp(e) {
  if (e) e.preventDefault();
  hideAlert(elements.otpAlert);

  const otp = (elements.inputOtp.value || '').trim();
  if (!otp || otp.length !== 6) {
    showAlert(elements.otpAlert, 'Please enter the complete 6-digit code.');
    return;
  }

  elements.btnVerifyOtp.disabled = true;
  elements.btnVerifyOtp.innerHTML = '<span>Verifying...</span>';

  try {
    const resp = await fetch('/api/parents?action=verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        otp: otp
      })
    });

    let data;
    try {
      data = await resp.json();
    } catch (parseErr) {
      data = {};
    }

    if (!resp.ok) {
      throw new Error(data.error || ('Verification failed. Please check your code. (' + resp.status + ')'));
    }

    if (data.notFound) {
      showAlert(elements.otpAlert, data.message || 'No student records associated with this email.', 'info');
      return;
    }

    if (!data.customToken) {
      throw new Error('Authentication token missing from server response.');
    }

    // Sign in to Firebase Auth with custom token
    await signInWithCustomToken(auth, data.customToken);
  } catch (err) {
    showAlert(elements.otpAlert, err.message || 'Verification failed. Please try again.');
  } finally {
    elements.btnVerifyOtp.disabled = false;
    elements.btnVerifyOtp.innerHTML = '<span>Verify & Log In</span><span class="material-icons-round" style="font-size:18px;">check</span>';
  }
}

async function fetchContextAndLoad() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const idToken = await user.getIdToken();
    const resp = await fetch('/api/parents?action=context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
        'x-parent-email': state.email || user.email || ''
      }
    });

    if (resp.status === 401) {
      clearCachedContext();
      showView('email');
      setupTurnstile();
      showAlert(elements.emailAlert, 'Session expired or invalid. Please request a new code.');
      await signOut(auth);
      return;
    }

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || 'Failed to load student records.');
    }

    state.schools = data.schools || [];

    if (state.schools.length === 0) {
      clearCachedContext();
      showView('email');
      setupTurnstile();
      showAlert(elements.emailAlert, 'No active student records found for your account. Please check with your school administrator.', 'info');
      await signOut(auth);
      return;
    }

    // Persist latest context to cache (C3)
    saveCachedContext(state.schools, state.activeSchoolId);

    // Auto-select school if only 1, otherwise prompt selection
    if (state.schools.length === 1) {
      selectSchool(state.schools[0].schoolId);
    } else {
      if (!state.activeSchoolId) {
        renderSchoolSelection();
        showView('school-select');
      } else {
        selectSchool(state.activeSchoolId);
      }
    }
  } catch (err) {
    console.error('[Parents] Context loading error:', err);
    if (!state.schools || state.schools.length === 0) {
      clearCachedContext();
      showView('email');
      setupTurnstile();
      showAlert(elements.emailAlert, 'Session expired or invalid. Please request a new code.');
      await signOut(auth);
    }
  }
}

function renderSchoolSelection() {
  elements.schoolsList.innerHTML = '';
  state.schools.forEach(school => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '20px';
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.15s';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.gap = '14px';

    card.innerHTML = `
      <div style="width:48px;height:48px;border-radius:8px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">
        ${school.logoUrl ? `<img src="${escapeHTML(school.logoUrl)}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">` : `<span class="material-icons-round">school</span>`}
      </div>
      <div style="flex:1;">
        <h3 style="font-size:1.05rem;font-weight:700;">${escapeHTML(school.schoolName)}</h3>
        <p style="font-size:0.84rem;color:var(--muted);">${school.students.length} child(ren) enrolled</p>
      </div>
      <span class="material-icons-round" style="color:var(--primary);">arrow_forward_ios</span>
    `;

    card.addEventListener('click', () => selectSchool(school.schoolId));
    elements.schoolsList.appendChild(card);
  });
}

function selectSchool(schoolId) {
  state.activeSchoolId = schoolId;
  const school = state.schools.find(s => s.schoolId === schoolId);
  if (!school) return;

  saveCachedContext(state.schools, schoolId);

  elements.activeSchoolName.textContent = school.schoolName;

  if (state.schools.length > 1) {
    elements.btnSwitchSchool.classList.remove('hidden');
  } else {
    elements.btnSwitchSchool.classList.add('hidden');
  }

  // Select first child by default if current selection is invalid
  const hasChild = school.students.some(st => st.id === state.activeStudentId);
  if (!hasChild && school.students.length > 0) {
    state.activeStudentId = school.students[0].id;
  }

  renderChildSwitcher(school);
  if (state.activeModule) {
    openModuleView(state.activeModule, true);
  } else {
    renderStudentDashboard(school);
  }
  showView('parent-app');
}

function renderChildSwitcher(school) {
  elements.childPills.innerHTML = '';
  if (school.students.length <= 1) {
    elements.childPills.parentElement.classList.add('hidden');
    return;
  }

  elements.childPills.parentElement.classList.remove('hidden');
  school.students.forEach(student => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `child-pill ${student.id === state.activeStudentId ? 'active' : ''}`;
    pill.innerHTML = `
      <span class="material-icons-round" style="font-size:16px;">face</span>
      <span>${escapeHTML(student.name)}</span>
    `;
    pill.addEventListener('click', () => {
      state.activeStudentId = student.id;
      renderChildSwitcher(school);
      if (state.activeModule) {
        openModuleView(state.activeModule, true);
      } else {
        renderStudentDashboard(school);
      }
    });
    elements.childPills.appendChild(pill);
  });
}

// --- Home Dashboard Rendering ---
function renderStudentDashboard(school) {
  state.activeModule = null;
  elements.sectionHomeDashboard.classList.remove('hidden');
  elements.sectionModuleSubview.classList.add('hidden');

  const student = school.students.find(s => s.id === state.activeStudentId) || school.students[0];
  if (!student) return;

  elements.studentName.textContent = student.name;
  elements.studentSchoolDisplay.textContent = school.schoolName;
  elements.tagClassSec.innerHTML = `<span class="material-icons-round" style="font-size:14px;">class</span> Class ${escapeHTML(student.class)}${student.section ? ` - ${escapeHTML(student.section)}` : ''}`;
  elements.tagRoll.innerHTML = `<span class="material-icons-round" style="font-size:14px;">numbers</span> Roll #${escapeHTML(student.rollNumber || '—')}`;
  elements.tagAdm.innerHTML = `<span class="material-icons-round" style="font-size:14px;">badge</span> Adm #${escapeHTML(student.admissionNumber || '—')}`;

  if (student.photoUrl) {
    elements.avatarImg.src = student.photoUrl;
    elements.avatarImg.classList.remove('hidden');
    elements.avatarFallback.classList.add('hidden');
  } else {
    elements.avatarImg.classList.add('hidden');
    elements.avatarFallback.classList.remove('hidden');
  }

  // Render ONLY Enabled Module Cards (per Step 5 requirement)
  const toggles = school.toggles || {};
  const modulesDef = [
    {
      key: 'attendance',
      name: 'Attendance Record',
      icon: 'event_available',
      desc: 'View monthly attendance percentage, daily punch logs, and present/absent summary.',
      active: toggles.attendance !== false
    },
    {
      key: 'timetable',
      name: 'Class Timetable',
      icon: 'calendar_month',
      desc: 'Weekly lecture schedule with period timings and assigned subject teachers.',
      active: toggles.timetable !== false
    },
    {
      key: 'notices',
      name: 'Notices & Circulars',
      icon: 'campaign',
      desc: 'Official school circulars, holiday announcements, and event updates.',
      active: toggles.notices !== false
    },
    {
      key: 'exams',
      name: 'Exams & Results',
      icon: 'fact_check',
      desc: 'Subject marks, overall percentage, grades, division, and class ranking.',
      active: toggles.exams === true
    }
  ];

  elements.modulesContainer.innerHTML = '';
  const enabledModules = modulesDef.filter(m => m.active);

  if (enabledModules.length === 0) {
    elements.modulesContainer.innerHTML = `
      <div class="state-container" style="grid-column: 1 / -1;">
        <span class="material-icons-round">lock</span>
        <h4>No Academic Modules Enabled</h4>
        <p>The school administration has not enabled any modules for the parent portal yet.</p>
      </div>
    `;
    return;
  }

  enabledModules.forEach(mod => {
    const card = document.createElement('div');
    card.className = 'module-card';
    card.innerHTML = `
      <div class="module-header">
        <div class="module-icon">
          <span class="material-icons-round">${mod.icon}</span>
        </div>
        <div class="module-info">
          <h3>${escapeHTML(mod.name)}</h3>
          <p>${escapeHTML(mod.desc)}</p>
        </div>
      </div>
      <div class="module-summary" id="card-summary-${mod.key}" style="margin:8px 0 10px 0;padding:6px 10px;background:var(--surface-subtle);border-radius:6px;font-size:0.82rem;color:var(--ink-secondary);min-height:28px;display:flex;align-items:center;">
        <span class="summary-loading" style="font-size:0.75rem;color:var(--muted);opacity:0.7;">Loading summary...</span>
      </div>
      <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border);">
        <span style="font-size:0.8rem;font-weight:700;color:var(--primary);display:inline-flex;align-items:center;gap:4px;">
          <span>View Details</span>
          <span class="material-icons-round" style="font-size:16px;">arrow_forward</span>
        </span>
      </div>
    `;

    card.addEventListener('click', () => openModuleView(mod.key));
    elements.modulesContainer.appendChild(card);
  });

  // Load one-line summary per enabled module lazily
  loadDashboardSummaries(student, school);
}

// --- Subview Navigation ---
function openModuleView(moduleKey, forceReload = false) {
  state.activeModule = moduleKey;
  elements.sectionHomeDashboard.classList.add('hidden');
  elements.sectionModuleSubview.classList.remove('hidden');

  // Hide all subview content containers
  [
    elements.subviewAttendance,
    elements.subviewTimetable,
    elements.subviewNotices,
    elements.subviewExams
  ].forEach(el => el.classList.add('hidden'));

  const titles = {
    attendance: '📅 Attendance Record',
    timetable: '🗓️ Class Timetable',
    notices: '📢 Notices & Circulars',
    exams: '📊 Examination Results'
  };
  elements.subviewHeaderTitle.textContent = titles[moduleKey] || 'Module Details';

  if (moduleKey === 'attendance') {
    elements.subviewAttendance.classList.remove('hidden');
    loadAttendanceView(forceReload);
  } else if (moduleKey === 'timetable') {
    elements.subviewTimetable.classList.remove('hidden');
    loadTimetableView(forceReload);
  } else if (moduleKey === 'notices') {
    elements.subviewNotices.classList.remove('hidden');
    loadNoticesView(forceReload);
  } else if (moduleKey === 'exams') {
    elements.subviewExams.classList.remove('hidden');
    loadExamsView(forceReload);
  }
}

// --- SUBVIEW 1: Attendance Loader ---
async function loadAttendanceView(forceReload = false) {
  const container = elements.attendanceContentContainer;
  container.innerHTML = '<div class="state-container"><span class="material-icons-round">sync</span><h4>Loading Attendance...</h4></div>';

  try {
    const data = await callParentApi('attendance', { month: state.attendanceMonth || undefined });
    
    // Update KPI grid
    const totalDays = Number(data.totalDays) || 0;
    const pct = Number(data.percentage) || 0;

    if (totalDays === 0) {
      elements.attKpiPct.textContent = '—';
      elements.attKpiPct.style.color = 'var(--muted)';
      elements.attendanceStatusBadge.innerHTML = '<span class="badge badge-secondary">No attendance recorded</span>';
    } else {
      elements.attKpiPct.textContent = `${pct}%`;
      elements.attKpiPct.style.color = pct >= 75 ? 'var(--green)' : (pct >= 60 ? 'var(--amber)' : 'var(--red)');
      const badgeType = pct >= 75 ? 'badge-success' : 'badge-danger';
      const badgeText = pct >= 75 ? 'Meets Requirement (≥75%)' : 'Attendance Shortage (<75%)';
      elements.attendanceStatusBadge.innerHTML = `<span class="badge ${badgeType}">${badgeText}</span>`;
    }

    elements.attKpiTotal.textContent = totalDays;
    elements.attKpiPresent.textContent = data.presentDays || 0;
    elements.attKpiAbsent.textContent = data.absentDays || 0;
    elements.attKpiLate.textContent = data.lateDays || 0;

    // Month Selector Options
    const avail = data.availableMonths || [data.month];
    elements.attendanceMonthSelect.innerHTML = avail.map(m => {
      const [y, mm] = m.split('-');
      const d = new Date(Number(y), Number(mm) - 1, 1);
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return `<option value="${m}" ${m === data.month ? 'selected' : ''}>${label}</option>`;
    }).join('');

    state.attendanceMonth = data.month;

    // Daily records table
    if (!data.daily || data.daily.length === 0) {
      container.innerHTML = `
        <div class="state-container">
          <span class="material-icons-round">event_busy</span>
          <h4>No Attendance Recorded</h4>
          <p>No daily attendance logs exist for this month.</p>
        </div>
      `;
      return;
    }

    let tableHtml = `
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th class="center">Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    data.daily.forEach(d => {
      const dt = new Date(d.date + 'T00:00:00');
      const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
      const formattedDate = dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      
      let badgeClass = 'badge-secondary';
      let statusLabel = 'Absent';
      if (d.status === 'present') {
        badgeClass = 'badge-success';
        statusLabel = 'Present';
      } else if (d.status === 'late') {
        badgeClass = 'badge-warning';
        statusLabel = 'Late';
      } else {
        badgeClass = 'badge-danger';
        statusLabel = 'Absent';
      }

      tableHtml += `
        <tr>
          <td><strong>${formattedDate}</strong></td>
          <td style="color:var(--muted);">${dayName}</td>
          <td class="center"><span class="badge ${badgeClass}">${statusLabel}</span></td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table></div>`;
    container.innerHTML = tableHtml;
  } catch (err) {
    container.innerHTML = `
      <div class="state-container">
        <span class="material-icons-round" style="color:var(--red);">error_outline</span>
        <h4>Failed to Load Attendance</h4>
        <p>${escapeHTML(err.message)}</p>
      </div>
    `;
  }
}

// --- SUBVIEW 2: Timetable Loader ---
async function loadTimetableView(forceReload = false) {
  const container = elements.timetableContentContainer;
  container.innerHTML = '<div class="state-container"><span class="material-icons-round">sync</span><h4>Loading Timetable...</h4></div>';

  try {
    const data = await callParentApi('timetable');
    const schedule = data.schedule || {};
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Determine default day (today if Mon-Sat, else Monday)
    const todayIndex = new Date().getDay(); // 0 is Sunday, 1 is Monday
    const todayName = (todayIndex >= 1 && todayIndex <= 6) ? days[todayIndex - 1] : 'Monday';
    if (!state.timetableDay || !days.includes(state.timetableDay)) {
      state.timetableDay = todayName;
    }

    // Render Day Pills
    elements.timetableDayPills.innerHTML = '';
    days.forEach(day => {
      const isToday = (day === todayName);
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `day-pill ${day === state.timetableDay ? 'active' : ''}`;
      pill.innerHTML = `${day} ${isToday ? '<span style="font-size:10px;background:rgba(255,255,255,0.3);padding:2px 4px;border-radius:4px;margin-left:4px;">Today</span>' : ''}`;
      pill.addEventListener('click', () => {
        state.timetableDay = day;
        renderDaySchedule(schedule[day] || {}, day, data.settings || {});
        // Update active class on pills
        document.querySelectorAll('.day-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
      elements.timetableDayPills.appendChild(pill);
    });

    renderDaySchedule(schedule[state.timetableDay] || {}, state.timetableDay, data.settings || {});
  } catch (err) {
    container.innerHTML = `
      <div class="state-container">
        <span class="material-icons-round" style="color:var(--red);">error_outline</span>
        <h4>Failed to Load Timetable</h4>
        <p>${escapeHTML(err.message)}</p>
      </div>
    `;
  }
}

function renderDaySchedule(dayPeriods, dayName, settings) {
  const container = elements.timetableContentContainer;
  const periodKeys = Object.keys(dayPeriods).sort((a, b) => Number(a) - Number(b));

  if (periodKeys.length === 0) {
    container.innerHTML = `
      <div class="state-container">
        <span class="material-icons-round">free_breakfast</span>
        <h4>No Classes Scheduled</h4>
        <p>There are no timetable periods configured for ${escapeHTML(dayName)}.</p>
      </div>
    `;
    return;
  }

  let tableHtml = `
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:140px;">Period</th>
            <th>Subject</th>
            <th>Teacher</th>
          </tr>
        </thead>
        <tbody>
  `;

  periodKeys.forEach(pNum => {
    const p = dayPeriods[pNum];
    const subject = (typeof p === 'object' && p ? p.subject : p) || '—';
    const teacher = (typeof p === 'object' && p ? p.teacherName : '') || '—';

    const timeStr = getPeriodTimeStr(pNum, dayName, settings);
    tableHtml += `
      <tr>
        <td>
          <strong>Period ${escapeHTML(pNum)}</strong>
          ${timeStr ? `<div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">${escapeHTML(timeStr)}</div>` : ''}
        </td>
        <td><strong style="color:var(--primary);">${escapeHTML(subject)}</strong></td>
        <td style="color:var(--ink-secondary);">${escapeHTML(teacher)}</td>
      </tr>
    `;
  });

  tableHtml += `</tbody></table></div>`;
  container.innerHTML = tableHtml;
}

// --- SUBVIEW 3: Notices Loader ---
async function loadNoticesView(forceReload = false) {
  const container = elements.noticesContentContainer;
  container.innerHTML = '<div class="state-container"><span class="material-icons-round">sync</span><h4>Loading Notices...</h4></div>';

  try {
    const data = await callParentApi('notices');
    const notices = data.notices || [];

    if (notices.length === 0) {
      container.innerHTML = `
        <div class="state-container">
          <span class="material-icons-round">campaign</span>
          <h4>No Announcements Published</h4>
          <p>There are no active school notices for parents at this time.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    notices.forEach(notice => {
      const isUrgent = (notice.priority === 'Urgent');
      const card = document.createElement('div');
      card.className = 'notice-item';
      card.innerHTML = `
        <div class="notice-item-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge ${isUrgent ? 'badge-danger' : 'badge-info'}">${escapeHTML(notice.priority)}</span>
            <span class="notice-item-title">${escapeHTML(notice.title)}</span>
          </div>
          <span class="notice-item-date">${escapeHTML(formatNoticeDate(notice.date))}</span>
        </div>
        <div class="notice-item-body">${escapeHTML(notice.message || '')}</div>
        <div style="display:flex;justify-content:flex-end;">
          <span style="font-size:0.78rem;font-weight:700;color:var(--primary);">Read Full Circular &rarr;</span>
        </div>
      `;

      card.addEventListener('click', () => {
        elements.modalNoticeTitle.textContent = notice.title;
        elements.modalNoticeDate.textContent = notice.date ? `Published: ${formatNoticeDate(notice.date)}` : '';
        elements.modalNoticePriority.textContent = notice.priority;
        elements.modalNoticePriority.className = `badge ${isUrgent ? 'badge-danger' : 'badge-info'}`;
        elements.modalNoticeMessage.textContent = notice.message;
        elements.modalNoticeOverlay.classList.remove('hidden');
      });

      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `
      <div class="state-container">
        <span class="material-icons-round" style="color:var(--red);">error_outline</span>
        <h4>Failed to Load Notices</h4>
        <p>${escapeHTML(err.message)}</p>
      </div>
    `;
  }
}

// --- SUBVIEW 4: Exams & Results Loader ---
async function loadExamsView(forceReload = false) {
  const container = elements.examResultsContainer;
  container.innerHTML = '<div class="state-container"><span class="material-icons-round">sync</span><h4>Loading Exam Terms...</h4></div>';

  try {
    const data = await callParentApi('exams');
    const terms = data.terms || [];

    if (terms.length === 0) {
      elements.examTermSelect.innerHTML = '<option value="">No terms published</option>';
      container.innerHTML = `
        <div class="state-container">
          <span class="material-icons-round">fact_check</span>
          <h4>No Examination Results Published</h4>
          <p>The school has not published results for any examination terms yet.</p>
        </div>
      `;
      return;
    }

    elements.examTermSelect.innerHTML = terms.map(t => {
      return `<option value="${escapeHTML(t.id)}" ${t.id === state.examTermId ? 'selected' : ''}>${escapeHTML(t.name)}${t.isFinal ? ' (Final)' : ''}</option>`;
    }).join('');

    if (!state.examTermId || !terms.some(t => t.id === state.examTermId)) {
      state.examTermId = terms[0].id;
    }

    loadTermResult(state.examTermId);
  } catch (err) {
    container.innerHTML = `
      <div class="state-container">
        <span class="material-icons-round" style="color:var(--red);">error_outline</span>
        <h4>Failed to Load Examination Terms</h4>
        <p>${escapeHTML(err.message)}</p>
      </div>
    `;
  }
}

async function loadTermResult(termId) {
  const container = elements.examResultsContainer;
  container.innerHTML = '<div class="state-container"><span class="material-icons-round">sync</span><h4>Calculating Results...</h4></div>';

  try {
    const data = await callParentApi('exam-result', { termId });

    if (!data.hasResult) {
      container.innerHTML = `
        <div class="state-container">
          <span class="material-icons-round">pending_actions</span>
          <h4>Results Incomplete</h4>
          <p>${escapeHTML(data.message || 'Marks for this term are still being recorded.')}</p>
        </div>
      `;
      return;
    }

    const sm = data.summary || {};
    const subjects = data.subjects || [];
    const isPass = (sm.result === 'PASS');
    const isFail = (sm.result === 'FAIL');

    let html = `
      <!-- Result KPI Summary -->
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-label">Total Score</div>
          <div class="stat-value" style="color:var(--primary);">${escapeHTML(sm.totalObtained)} / ${escapeHTML(sm.maxTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Percentage</div>
          <div class="stat-value" style="color:${isPass ? 'var(--green)' : (isFail ? 'var(--red)' : 'var(--amber)')};">${escapeHTML(sm.displayPercentage)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Grade</div>
          <div class="stat-value">${escapeHTML(sm.grade)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Division</div>
          <div class="stat-value" style="font-size:1.1rem;margin-top:6px;">${escapeHTML(sm.division)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Final Result</div>
          <div class="stat-value" style="color:${isPass ? 'var(--green)' : (isFail ? 'var(--red)' : 'var(--amber)')};font-size:1.25rem;margin-top:4px;">
            ${escapeHTML(sm.result)}
          </div>
        </div>
        ${sm.rank !== null ? `
        <div class="stat-card">
          <div class="stat-label">Class Rank</div>
          <div class="stat-value" style="color:var(--accent);">#${escapeHTML(sm.rank)}</div>
        </div>` : ''}
      </div>

      <!-- Subject Marks Table -->
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th class="center">Full Marks</th>
              <th class="center">Pass Marks</th>
              <th class="center">Marks Obtained</th>
              <th class="center">Grade</th>
              <th class="center">Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    subjects.forEach(sub => {
      let statusBadge = `<span class="badge badge-success">Pass</span>`;
      if (sub.isNotEntered || sub.obtained === '—') {
        statusBadge = `<span class="badge" style="background:var(--surface-muted);color:var(--ink-muted);">Not entered</span>`;
      } else if (sub.isExempted) {
        statusBadge = `<span class="badge badge-info">Exempted</span>`;
      } else if (!sub.isPass) {
        statusBadge = `<span class="badge badge-danger">${sub.isAbsent ? 'Absent' : 'Fail'}</span>`;
      }

      const obtColor = (sub.isNotEntered || sub.obtained === '—') ? 'var(--ink-muted)' : (sub.isPass ? 'var(--ink)' : 'var(--red)');

      html += `
        <tr>
          <td>
            <strong>${escapeHTML(sub.name)}</strong>
            ${sub.isOptional ? '<span class="tag" style="margin-left:6px;font-size:10px;">Optional</span>' : ''}
          </td>
          <td class="center">${escapeHTML(sub.fullMarks)}</td>
          <td class="center">${escapeHTML(sub.passMarks)}</td>
          <td class="center"><strong style="font-size:1rem;color:${obtColor};">${escapeHTML(sub.obtained)}</strong></td>
          <td class="center"><strong>${escapeHTML(sub.grade)}</strong></td>
          <td class="center">${statusBadge}</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `
      <div class="state-container">
        <span class="material-icons-round" style="color:var(--red);">error_outline</span>
        <h4>Failed to Calculate Result</h4>
        <p>${escapeHTML(err.message)}</p>
      </div>
    `;
  }
}

// --- Event Listeners Setup ---
function setupListeners() {
  elements.btnThemeToggle.addEventListener('click', toggleTheme);

  elements.formEmail.addEventListener('submit', handleSendOtp);
  elements.formOtp.addEventListener('submit', handleVerifyOtp);

  elements.btnResendOtp.addEventListener('click', handleSendOtp);

  elements.linkChangeEmail.addEventListener('click', (e) => {
    e.preventDefault();
    clearInterval(state.resendTimerId);
    showView('email');
  });

  elements.btnSwitchSchool.addEventListener('click', () => {
    renderSchoolSelection();
    showView('school-select');
  });

  elements.btnLogout.addEventListener('click', async () => {
    clearCachedContext();
    try {
      await signOut(auth);
    } catch (_) {}
    state.schools = [];
    state.activeSchoolId = null;
    state.activeStudentId = null;
    state.activeModule = null;
    state.email = '';
    elements.inputEmail.value = '';
    elements.inputOtp.value = '';
    showView('email');
    setupTurnstile();
  });

  elements.btnBackDashboard.addEventListener('click', () => {
    const school = state.schools.find(s => s.schoolId === state.activeSchoolId);
    if (school) renderStudentDashboard(school);
  });

  elements.attendanceMonthSelect.addEventListener('change', (e) => {
    state.attendanceMonth = e.target.value;
    loadAttendanceView(true);
  });

  elements.examTermSelect.addEventListener('change', (e) => {
    state.examTermId = e.target.value;
    loadTermResult(state.examTermId);
  });

  // Notice modal close handlers
  elements.btnCloseNoticeModal.addEventListener('click', () => {
    elements.modalNoticeOverlay.classList.add('hidden');
  });
  elements.btnCloseNoticeModal2.addEventListener('click', () => {
    elements.modalNoticeOverlay.classList.add('hidden');
  });
  elements.modalNoticeOverlay.addEventListener('click', (e) => {
    if (e.target === elements.modalNoticeOverlay) {
      elements.modalNoticeOverlay.classList.add('hidden');
    }
  });

  // Auth State Listener
  onAuthStateChanged(auth, user => {
    if (user) {
      fetchContextAndLoad();
    } else {
      clearCachedContext();
      showView('email');
      setupTurnstile();
    }
  });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupListeners();

  // Quick Open (C3): restore context from cache immediately (0 ms perceived latency)
  let renderedFromCache = false;
  try {
    const cachedStr = localStorage.getItem(PARENT_CONTEXT_CACHE_KEY);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (cached && Array.isArray(cached.schools) && cached.schools.length > 0) {
        state.schools = cached.schools;
        const targetSchoolId = cached.selectedSchoolId || cached.schools[0].schoolId;
        if (cached.schools.length === 1 || targetSchoolId) {
          selectSchool(targetSchoolId);
        } else {
          renderSchoolSelection();
          showView('school-select');
        }
        renderedFromCache = true;
      }
    }
  } catch (e) {
    console.warn('[Parents] Error restoring cached context:', e);
  }

  // Turnstile must not block a signed-in reopen
  if (!renderedFromCache) {
    setupTurnstile();
  }
});
