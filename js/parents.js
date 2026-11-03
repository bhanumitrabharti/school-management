/**
 * js/parents.js
 * Paathshala Parent Portal — Lightweight Client Controller
 * Version: v78
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

// --- Turnstile Setup ---
function setupTurnstile() {
  const container = document.getElementById('turnstile-widget');
  if (!container) return;

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

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || 'Failed to load student records.');
    }

    state.schools = data.schools || [];

    if (state.schools.length === 0) {
      showView('email');
      showAlert(elements.emailAlert, 'No active student records found for your account. Please check with your school administrator.', 'info');
      await signOut(auth);
      return;
    }

    // Auto-select school if only 1, otherwise prompt selection
    if (state.schools.length === 1) {
      selectSchool(state.schools[0].schoolId);
    } else {
      renderSchoolSelection();
      showView('school-select');
    }
  } catch (err) {
    console.error('[Parents] Context loading error:', err);
    showView('email');
    showAlert(elements.emailAlert, 'Session expired or invalid. Please request a new code.');
    await signOut(auth);
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
    const pct = Number(data.percentage) || 0;
    elements.attKpiPct.textContent = `${pct}%`;
    elements.attKpiPct.style.color = pct >= 75 ? 'var(--green)' : (pct >= 60 ? 'var(--amber)' : 'var(--red)');
    elements.attKpiTotal.textContent = data.totalDays || 0;
    elements.attKpiPresent.textContent = data.presentDays || 0;
    elements.attKpiAbsent.textContent = data.absentDays || 0;
    elements.attKpiLate.textContent = data.lateDays || 0;

    // Status badge
    const badgeType = pct >= 75 ? 'badge-success' : 'badge-danger';
    const badgeText = pct >= 75 ? 'Meets Requirement (≥75%)' : 'Attendance Shortage (<75%)';
    elements.attendanceStatusBadge.innerHTML = `<span class="badge ${badgeType}">${badgeText}</span>`;

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
            <th style="width:100px;">Period</th>
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

    tableHtml += `
      <tr>
        <td><strong>Period ${escapeHTML(pNum)}</strong></td>
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
          <span class="notice-item-date">${escapeHTML(notice.date || '')}</span>
        </div>
        <div class="notice-item-body">${escapeHTML(notice.message || '')}</div>
        <div style="display:flex;justify-content:flex-end;">
          <span style="font-size:0.78rem;font-weight:700;color:var(--primary);">Read Full Circular &rarr;</span>
        </div>
      `;

      card.addEventListener('click', () => {
        elements.modalNoticeTitle.textContent = notice.title;
        elements.modalNoticeDate.textContent = notice.date ? `Published: ${notice.date}` : '';
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
      if (!sub.isPass) {
        statusBadge = `<span class="badge badge-danger">${sub.isAbsent ? 'Absent' : 'Fail'}</span>`;
      } else if (sub.isExempted) {
        statusBadge = `<span class="badge badge-info">Exempted</span>`;
      }

      html += `
        <tr>
          <td>
            <strong>${escapeHTML(sub.name)}</strong>
            ${sub.isOptional ? '<span class="tag" style="margin-left:6px;font-size:10px;">Optional</span>' : ''}
          </td>
          <td class="center">${escapeHTML(sub.fullMarks)}</td>
          <td class="center">${escapeHTML(sub.passMarks)}</td>
          <td class="center"><strong style="font-size:1rem;color:${sub.isPass ? 'var(--ink)' : 'var(--red)'};">${escapeHTML(sub.obtained)}</strong></td>
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
      showView('email');
    }
  });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupListeners();
  setupTurnstile();
});
