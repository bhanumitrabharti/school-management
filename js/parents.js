/**
 * js/parents.js
 * Paathshala Parent Portal — Lightweight Client Controller
 * Version: v75
 *
 * Handles:
 *   - Turnstile verification
 *   - Email OTP request & verification
 *   - Firebase custom token authentication
 *   - Real-time parent context loading
 *   - Multi-school & multi-child navigation (sibling switcher)
 *   - Dynamic school feature module toggles
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
  turnstileWidgetId: null,
  turnstileToken: ''
};

// DOM Elements
const elements = {
  viewEmail: document.getElementById('view-email'),
  viewOtp: document.getElementById('view-otp'),
  viewSchoolSelect: document.getElementById('view-school-select'),
  viewDashboard: document.getElementById('view-dashboard'),
  
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
  [elements.viewEmail, elements.viewOtp, elements.viewSchoolSelect, elements.viewDashboard].forEach(el => {
    if (el) el.classList.add('hidden');
  });

  if (viewName === 'email') elements.viewEmail.classList.remove('hidden');
  if (viewName === 'otp') elements.viewOtp.classList.remove('hidden');
  if (viewName === 'school-select') elements.viewSchoolSelect.classList.remove('hidden');
  if (viewName === 'dashboard') elements.viewDashboard.classList.remove('hidden');

  if (viewName === 'dashboard') {
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

// --- API Calls ---
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
    
    // Auth state observer will automatically trigger fetchContextAndLoad()
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
  renderStudentDashboard(school);
  showView('dashboard');
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
      renderStudentDashboard(school);
    });
    elements.childPills.appendChild(pill);
  });
}

function renderStudentDashboard(school) {
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

  // Render Module Cards based on school permissions
  const toggles = school.toggles || {};
  const modules = [
    { key: 'profile', name: 'Student Profile', icon: 'person', desc: 'Personal details, emergency contacts, and blood group', active: toggles.profile !== false },
    { key: 'attendance', name: 'Attendance Record', icon: 'event_available', desc: 'Daily punch logs, monthly calendar, and percentage', active: toggles.attendance !== false },
    { key: 'timetable', name: 'Class Timetable', icon: 'calendar_month', desc: 'Weekly schedule of lectures and teachers', active: toggles.timetable !== false },
    { key: 'exams', name: 'Exams & Marks', icon: 'fact_check', desc: 'Subject marks, rank, and grading overview', active: toggles.exams === true },
    { key: 'reportCards', name: 'Report Cards', icon: 'workspace_premium', desc: 'Official signed term progress reports for download', active: toggles.reportCards === true },
    { key: 'notices', name: 'Notices & Circulars', icon: 'campaign', desc: 'School announcements, holidays, and circulars', active: toggles.notices !== false },
    { key: 'fees', name: 'Fee Ledger', icon: 'account_balance_wallet', desc: 'Installment breakdown, fee receipts, and dues status', active: toggles.fees !== false },
    { key: 'feePayment', name: 'Pay Online (UPI)', icon: 'qr_code_scanner', desc: 'Instant UPI QR code payment and UTR submission', active: toggles.feePayment !== false }
  ];

  elements.modulesContainer.innerHTML = '';
  modules.forEach(mod => {
    const card = document.createElement('div');
    card.className = 'module-card';
    if (!mod.active) {
      card.style.opacity = '0.6';
    }

    card.innerHTML = `
      <div class="module-header">
        <div class="module-icon" style="${!mod.active ? 'background:var(--surface-subtle);color:var(--muted);' : ''}">
          <span class="material-icons-round">${mod.icon}</span>
        </div>
        <div class="module-info">
          <h3>${escapeHTML(mod.name)}</h3>
          <p>${escapeHTML(mod.desc)}</p>
        </div>
        ${!mod.active ? `<span class="badge-disabled">Disabled</span>` : ''}
      </div>
      <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:0.78rem;font-weight:600;color:${mod.active ? 'var(--primary)' : 'var(--muted)'};">
          ${mod.active ? 'Available in Phase B2 &rarr;' : 'Module Inactive'}
        </span>
      </div>
    `;
    elements.modulesContainer.appendChild(card);
  });
}

// --- Event Listeners ---
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
    state.email = '';
    elements.inputEmail.value = '';
    elements.inputOtp.value = '';
    showView('email');
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
