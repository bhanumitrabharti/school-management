import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPKi-0EjMjsA9q60rwEHeI2T9HTWPGklo",
  authDomain: "ctrl-shift-solutions.firebaseapp.com",
  projectId: "ctrl-shift-solutions",
  storageBucket: "ctrl-shift-solutions.firebasestorage.app",
  messagingSenderId: "958349968165",
  appId: "1:958349968165:web:e11daa979fcff8f6f0d0cc"
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Expose Firestore and Auth globally for any non-module components
window.db = db;
window.auth = auth;
window.firestore = { doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot };
window.openStudentProfile = function(studentId) {
  if (typeof window.openStudentFinancialProfile === 'function') {
    return window.openStudentFinancialProfile(studentId);
  }
  if (window.SchoolApp && typeof window.SchoolApp.openStudentFinancialProfile === 'function') {
    return window.SchoolApp.openStudentFinancialProfile(studentId);
  }
  if (window.SchoolApp && typeof window.SchoolApp.openStudentProfile === 'function') {
    window.SchoolApp.openStudentProfile(studentId);
  }
};


window.SchoolApp = {
  // ---------- Data Store ----------
  store: {
    seederVersion: 2,
    students: [],
    teachers: [],
    attendance: [],
    trash: [],
    feeHeads: [],
    feeStructures: {},
    fees: [],
    feeActivityLog: [],
    exams: [],
    subjectMapping: {},
    timetable: {
      settings: {
        startTime: "08:00",
        endTime: "14:00",
        totalPeriods: 8,
        lunchAfterPeriod: 4,
        lunchDuration: 30,
        satStartTime: "08:00",
        satEndTime: "12:30",
        satTotalPeriods: 6,
        satLunchAfterPeriod: 0
      }
    },
    marks: [],
    notices: [],
    lastAutomatedFeeRun: '',
    notifications: [],
    schools: [],
    currentSchoolId: '',
    settings: {
      // FIX: these 4 fields used to default to Bhanu's own real school's name,
      // address, phone AND personal email. Any brand-new tenant that hadn't
      // yet filled in Settings — or any load that hit this placeholder before
      // real Firestore data arrived — could show another real customer's
      // identity, or Bhanu's own personal email, as "their" school's contact
      // info. Blank is the only safe default; the UI already treats these as
      // not-yet-configured rather than showing a placeholder value.
      schoolName: '',
      academicYear: '2025-2026',
      address: '',
      phone: '',
      email: '',
      classes: ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      sections: ['A','B','C'],
      attendanceTime: '09:00',
      theme: 'dark',
      adminUsername: '',
      adminPassword: '',
      enableCloudSync: false,
      firebaseConfig: '',
      feeHeads: [
        { id: 'fh_tuition', name: 'Tuition Fee' },
        { id: 'fh_transport', name: 'Transport Fee' },
        { id: 'fh_exam', name: 'Examination Fee' },
        { id: 'fh_fine', name: 'Late Fee / Fine' },
        { id: 'fh_annual', name: 'Annual Development Fee' }
      ],
      feeStructure: {}
    }
  },

  getInitialStore: function() {
    return {
      seederVersion: 2,
      students: [],
      teachers: [],
      attendance: [],
      trash: [],
      feeHeads: [],
      feeStructures: {},
      fees: [],
      feeActivityLog: [],
      exams: [],
      subjectMapping: {},
      timetable: {
        settings: {
          startTime: "08:00",
          endTime: "14:00",
          totalPeriods: 8,
          lunchAfterPeriod: 4,
          lunchDuration: 30,
          satStartTime: "08:00",
          satEndTime: "12:30",
          satTotalPeriods: 6,
          satLunchAfterPeriod: 0
        }
      },
      marks: [],
      notices: [],
      lastAutomatedFeeRun: '',
      notifications: [],
      schools: [],
      currentSchoolId: '',
      settings: {
        // FIX: same identity-leak default as SchoolApp.store above — blank is
        // the only safe fallback here too.
        schoolName: '',
        academicYear: '2025-2026',
        address: '',
        phone: '',
        email: '',
        classes: ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        sections: ['A','B','C'],
        attendanceTime: '09:00',
        theme: 'dark',
        adminUsername: '',
        adminPassword: '',
        enableCloudSync: false,
        firebaseConfig: '',
        feeHeads: [
          { id: 'fh_tuition', name: 'Tuition Fee' },
          { id: 'fh_transport', name: 'Transport Fee' },
          { id: 'fh_exam', name: 'Examination Fee' },
          { id: 'fh_fine', name: 'Late Fee / Fine' },
          { id: 'fh_annual', name: 'Annual Development Fee' }
        ],
        feeStructure: {}
      }
    };
  },

  get currentSchoolId() {
    return (this.store && this.store.currentSchoolId) || '';
  },

  assertSchoolIsolation: function(data, schoolId) {
    if (!data) return true;
    if (Array.isArray(data)) {
      return data.every(function(item) {
        if (!item) return true;
        var sId = item.schoolId || item.school_id;
        return !sId || sId === schoolId;
      });
    }
    var sId = data.schoolId || data.school_id;
    return !sId || sId === schoolId;
  },

  shareOnWhatsApp: function(phone, message) {
    if (!phone) {
      this.showToast('No parent phone number found.', 'error');
      return false;
    }
    var cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
    if (cleanPhone.length < 10) {
      this.showToast('Invalid 10-digit mobile number for WhatsApp.', 'error');
      return false;
    }
    var waLink = 'https://wa.me/91' + cleanPhone + '?text=' + encodeURIComponent(message);
    window.open(waLink, '_blank');
    return true;
  },

  currentUser: null,
  currentPage: 'dashboard',
  sidebarCollapsed: false,
  modules: {},
  feesGeneratedMsg: null,
  adminIsDirty: false,
  pendingNavigation: null,
  lastCleanTab: 'settings',
  onSaveSuccessNavigate: null,

  // ---------- Data Persistence ----------
  // ---------- Data Persistence ----------
  showLoader: function(message) {
    message = message || 'Loading...';
    var loader = document.getElementById('app-loading-overlay');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'app-loading-overlay';
      loader.innerHTML = `
        <div class="app-loader-content">
          <div class="app-loader-spinner"></div>
          <div class="app-loader-text"></div>
        </div>
      `;
      document.body.appendChild(loader);
    }
    loader.querySelector('.app-loader-text').textContent = message;
    loader.classList.add('active');
  },

  hideLoader: function() {
    var loader = document.getElementById('app-loading-overlay');
    if (loader) {
      loader.classList.remove('active');
    }
  },

  saveWithRetry: async function(fn, attempts = 3) {
    // Errors that will NEVER succeed on retry (document too large, permission
    // denied, etc). Retrying these just burns ~6 extra seconds while the
    // "Saving..." UI sits stuck on a request that was always going to fail.
    var nonRetryableCodes = ['invalid-argument', 'resource-exhausted', 'permission-denied', 'unauthenticated', 'failed-precondition'];
    for (let i = 0; i < attempts; i++) {
      try {
        await fn();
        return true;
      } catch(e) {
        var code = e && e.code;
        if (nonRetryableCodes.indexOf(code) !== -1) {
          console.error('[Save] Non-retryable Firestore error:', code, e && e.message);
          if (code === 'invalid-argument' || code === 'resource-exhausted') {
            this.showToast('❌ Your school\'s data has reached its storage limit. This change was NOT saved — please contact support.', 'error');
          } else {
            this.showToast('❌ Save failed: ' + (e && e.message ? e.message : 'permission error') + '.', 'error');
          }
          return false;
        }
        if (i === attempts - 1) {
          this.showToast(
            '❌ Save failed. Check connection.',
            'error');
          return false;
        }
        await new Promise(r =>
          setTimeout(r, 1000 * (i + 1)));
      }
    }
  },

  save: async function(bypassLoader, options) {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
      console.warn("[Security] Write blocked: Super Admin impersonation mode.");
      this.showToast("View-only mode. Changes not saved during impersonation.", "warning");
      return false;
    }
    if (!bypassLoader) {
      this.showLoader('Saving...');
    }
    try {
      var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
      if (!currentSchoolId) {
        console.error('[Security] Save blocked: No active school ID context.');
        if (!bypassLoader) this.hideLoader();
        this.showToast('Save failed: No active school identified.', 'error');
        return false;
      }
      const docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId);
      const payload = JSON.parse(JSON.stringify(this.store));
      if (!payload.settings) payload.settings = {};

      // HARD FAILSAFE 1: Refuse to save if tenant data has not finished loading from Firestore
      if (!this.tenantInitialized) {
        console.error('[SAFETY GUARD BLOCKED SAVE] Blocked attempt to save before tenant data has loaded on ' + currentSchoolId);
        if (!bypassLoader) this.hideLoader();
        return false;
      }

      // DELIBERATE OVERRIDE ESCAPE HATCH:
      // Genuine administrative resets (e.g. academic session rollover / roster re-import)
      // can pass options.allowCollectionWipe == true or set store.allowCollectionWipe == true.
      // This is forwarded in payload to satisfy Firestore rules (notWipingRoster/notWipingLedger).
      var allowWipe = (options && options.allowCollectionWipe === true) || (payload.allowCollectionWipe === true) || (this.allowCollectionWipe === true);
      if (allowWipe) {
        payload.allowCollectionWipe = true;
        console.warn('[Security Override] allowCollectionWipe active for ' + currentSchoolId + '. Bypassing roster and ledger wipe guards.');
      }

      if (!allowWipe) {
        // HARD FAILSAFE 2: Refuse to wipe populated students or teachers from live server baseline
        var serverStudentBaseline = (this.liveServerStudentCount !== undefined) ? this.liveServerStudentCount : (this.initialServerStudentCount || 0);
        var serverTeacherBaseline = (this.liveServerTeacherCount !== undefined) ? this.liveServerTeacherCount : (this.initialServerTeacherCount || 0);

        if (serverStudentBaseline > 0 && (!payload.students || payload.students.length === 0)) {
          console.error('[SAFETY GUARD BLOCKED SAVE] Blocked attempt to wipe students (' + serverStudentBaseline + ' items -> 0) on ' + currentSchoolId);
          this.showToast('Save blocked: Potential data loss detected. Please refresh the page.', 'error');
          if (!bypassLoader) this.hideLoader();
          return false;
        }
        if (serverTeacherBaseline > 0 && (!payload.teachers || payload.teachers.length === 0)) {
          console.error('[SAFETY GUARD BLOCKED SAVE] Blocked attempt to wipe teachers (' + serverTeacherBaseline + ' items -> 0) on ' + currentSchoolId);
          this.showToast('Save blocked: Potential data loss detected. Please refresh the page.', 'error');
          if (!bypassLoader) this.hideLoader();
          return false;
        }
      }
      
      // Canonicalize logo to payload.settings.logoUrl and prune duplicate base64 keys
      var canonicalLogo = payload.settings.logoUrl || payload.settings.schoolLogo || (payload.settings.schoolInfo && payload.settings.schoolInfo.logoUrl) || '';
      if (!canonicalLogo) {
        try {
          var cachedRaw = localStorage.getItem('cached_tenant_data_' + currentSchoolId);
          if (cachedRaw) {
            var cached = JSON.parse(cachedRaw);
            if (cached && cached.settings) {
              canonicalLogo = cached.settings.logoUrl || cached.settings.schoolLogo || (cached.settings.schoolInfo && cached.settings.schoolInfo.logoUrl) || '';
            }
          }
        } catch (err) {
          console.warn('Failed to preserve logo from cache:', err);
        }
      }
      if (canonicalLogo) {
        payload.settings.logoUrl = canonicalLogo;
      }
      delete payload.settings.schoolLogo;
      if (payload.settings.schoolInfo) {
        delete payload.settings.schoolInfo.schoolLogo;
        delete payload.settings.schoolInfo.logoUrl;
      }

      // RESTORE ARCHITECTURE: If tenant is restructured, prune unbounded fields
      // from main tenant doc payload so they are NEVER re-written or merged into
      // tenant_data/{schoolId}. Their single source of truth is their subcollections.
      if (this.isRestructured(currentSchoolId)) {
        delete payload.attendance;
        delete payload.fees;
        delete payload.examMarks;
      }

      // Safety guard against accidental erasure of examTerms / examSubjects
      var serverExamTermsBaseline = this.initialServerExamTermsCount || 0;
      if (!allowWipe && serverExamTermsBaseline > 0) {
        if (!payload.examTerms || Object.keys(payload.examTerms).length === 0) {
          console.warn('[SAFETY GUARD] Prevented erasing examTerms on save (' + serverExamTermsBaseline + ' terms on server). Keeping server terms.');
          delete payload.examTerms;
          delete payload.examSubjects;
        }
      }

      // Storage Limit Safety Alert: Warn when approaching 900KB (85% of 1MB limit)
      var payloadStr = JSON.stringify(payload);
      var estimatedBytes = (typeof Blob !== 'undefined') ? new Blob([payloadStr]).size : payloadStr.length;
      var estimatedWireBytes = Math.round(estimatedBytes * 1.12); // Accounts for Protobuf map framing overhead

      // HARD STOP: Firestore's document limit is 1,048,576 bytes. Attempting the
      // write anyway just wastes 3 retries (~6s of "Saving..." stuck on screen)
      // on a request that is guaranteed to fail. Fail fast instead.
      if (estimatedWireBytes >= 1000000) {
        console.error("[Storage Limit Alert] BLOCKED save for " + currentSchoolId + " — estimated ~" + Math.round(estimatedWireBytes / 1024) + " KB, at/over the safe threshold.");
        this.showToast("❌ Your school's data has reached its storage limit. This change was NOT saved — please contact support immediately.", "error");
        if (!bypassLoader) this.hideLoader();
        return false;
      }

      if (estimatedBytes >= 900000 || estimatedWireBytes >= 900000) {
        console.warn("[Storage Limit Alert] Tenant document size for " + currentSchoolId + " is approaching limit: ~" + Math.round(estimatedWireBytes / 1024) + " KB (" + Math.round((estimatedWireBytes / 1048576) * 100) + "% of 1MB limit).");
        this.showToast("Your school's data is approaching storage limits. Please contact support.", "warning");
      }

      const saveFn = () => window.firestore.setDoc(docRef, payload, { merge: true });
      const success = await this.saveWithRetry(saveFn);
      if (!success) {
        if (!bypassLoader) this.hideLoader();
        return false;
      }
      
      console.log('Successfully saved tenant data to Cloud Firestore for: ' + currentSchoolId);
      if (allowWipe) {
        delete this.store.allowCollectionWipe;
        delete this.allowCollectionWipe;
      }
      
      // Update localStorage cache to match
      try {
        localStorage.setItem('cached_tenant_data_' + currentSchoolId, JSON.stringify(payload));
      } catch (err) {
        console.warn('Failed to write secondary cache to localStorage:', err);
      }
      
      if (!bypassLoader) {
        this.hideLoader();
      }
      this.adminIsDirty = false;
      this.updateDirtyIndicator();
      if (this.onSaveSuccessNavigate) {
        var cb = this.onSaveSuccessNavigate;
        this.onSaveSuccessNavigate = null;
        cb();
      }
      return true;
    } catch (e) {
      console.error('Failed to save data to Firestore:', e);
      if (!bypassLoader) {
        this.hideLoader();
      }
      this.showToast('Failed to save changes to Firestore. Please check your connection.', 'error');
      return false;
    }
  },

  resetTenantSession: function(newSchoolId) {
    console.log('[Tenant Isolation] Tearing down tenant session. Transitioning to:', newSchoolId || 'none');

    // 1. Unsubscribe main tenant listener
    if (this.tenantListenerUnsubscribe) {
      try { this.tenantListenerUnsubscribe(); } catch (e) { console.warn('Error unsubscribing tenantListener:', e); }
      this.tenantListenerUnsubscribe = null;
    }

    // 2. Unsubscribe and clear all attendance subcollection listeners
    if (this._attendanceListeners) {
      var aKeys = Object.keys(this._attendanceListeners);
      for (var i = 0; i < aKeys.length; i++) {
        if (typeof this._attendanceListeners[aKeys[i]] === 'function') {
          try { this._attendanceListeners[aKeys[i]](); } catch (e) { console.warn('Error unsubscribing attendance listener:', e); }
        }
      }
    }
    this._attendanceListeners = {};
    this._attendanceMonths = {};

    // 3. Unsubscribe and clear all fee subcollection listeners
    if (this._feesListeners) {
      var fKeys = Object.keys(this._feesListeners);
      for (var j = 0; j < fKeys.length; j++) {
        if (typeof this._feesListeners[fKeys[j]] === 'function') {
          try { this._feesListeners[fKeys[j]](); } catch (e) { console.warn('Error unsubscribing fee listener:', e); }
        }
      }
    }
    this._feesListeners = {};
    this._feesYears = {};

    // 4. Purge local tenant storage caches to prevent cross-school contamination
    try {
      for (var k = localStorage.length - 1; k >= 0; k--) {
        var keyName = localStorage.key(k);
        if (keyName && keyName.startsWith('cached_tenant_data_')) {
          localStorage.removeItem(keyName);
        }
      }
    } catch (e) {
      console.warn('Error clearing cached_tenant_data_ from localStorage:', e);
    }

    // 5. Hard reset in-memory store to pristine baseline
    var preservedSchools = (this.store && this.store.schools) ? this.store.schools : [];
    this.store = this.getInitialStore();
    this.store.schools = preservedSchools;
    this.store.currentSchoolId = newSchoolId || '';
    this.currentUser = null;
    this.tenantInitialized = false;
    this.initialServerStudentCount = 0;
    this.initialServerTeacherCount = 0;
    this.liveServerStudentCount = 0;
    this.liveServerTeacherCount = 0;
  },

  // ---------- Subcollection Compatibility Layer (Dual-Read / Single-Write) ----------
  _attendanceMonths: {},
  _attendanceListeners: {},
  _feesYears: {},
  _feesListeners: {},

  isRestructured: function(schoolId) {
    var sid = schoolId || (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id');
    if (this.store && this.store.settings && this.store.settings.restructured === true) {
      return true;
    }
    if (this.store && this.store.restructured === true) {
      return true;
    }
    return false;
  },

  /* ===== ATTENDANCE DUAL-READ / SINGLE-WRITE ===== */
  loadAttendanceMonth: async function(yearMonth) {
    if (!yearMonth) {
      yearMonth = new Date().toISOString().slice(0, 7);
    }
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) return [];

    // 1. If in local memory cache, return it
    if (this._attendanceMonths[yearMonth]) {
      return this._attendanceMonths[yearMonth];
    }

    // 2. Dual-read: try reading from subcollection: tenant_data/{schoolId}/attendance_months/{yearMonth}/classes
    try {
      if (window.firestore && window.db) {
        var classesColl = window.firestore.collection(window.db, 'tenant_data', currentSchoolId, 'attendance_months', yearMonth, 'classes');
        var snap = await window.firestore.getDocs(classesColl);
        if (snap && !snap.empty) {
          var records = [];
          snap.forEach(function(docSnap) {
            var data = docSnap.data() || {};
            if (Array.isArray(data.records)) {
              records = records.concat(data.records);
            }
          });
          this._attendanceMonths[yearMonth] = records;
          this._mergeAttendanceRecordsIntoStore(yearMonth, records);
          return records;
        }

        // Backward compatibility: check if un-sharded month document exists
        var legacyDocRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'attendance_months', yearMonth);
        var legacySnap = await window.firestore.getDoc(legacyDocRef);
        if (legacySnap && legacySnap.exists()) {
          var legData = legacySnap.data() || {};
          var legRecords = Array.isArray(legData.records) ? legData.records : [];
          this._attendanceMonths[yearMonth] = legRecords;
          this._mergeAttendanceRecordsIntoStore(yearMonth, legRecords);
          return legRecords;
        }
      }
    } catch (err) {
      console.warn('[Attendance] Error fetching attendance_months/' + yearMonth + '/classes:', err);
    }

    // 3. Fallback: check cold storage archive if configured and within date range
    if (this.store && this.store.settings && this.store.settings.attendanceArchive && this.store.settings.attendanceArchive.documentId) {
      try {
        if (window.firestore && window.db) {
          var archDocRef = window.firestore.doc(window.db, 'tenant_data', this.store.settings.attendanceArchive.documentId);
          var archSnap = await window.firestore.getDoc(archDocRef);
          if (archSnap && archSnap.exists()) {
            var archData = archSnap.data() || {};
            var archAtt = Array.isArray(archData.attendance) ? archData.attendance : [];
            var matchedArch = archAtt.filter(function(a) { return a.date && a.date.startsWith(yearMonth); });
            if (matchedArch.length > 0) {
              this._attendanceMonths[yearMonth] = matchedArch;
              this._mergeAttendanceRecordsIntoStore(yearMonth, matchedArch);
              return matchedArch;
            }
          }
        }
      } catch (archErr) {
        console.warn('[Attendance] Error checking archive document:', archErr);
      }
    }

    // 4. Fallback: if not in subcollection or tenant not restructured, fall back to legacy array
    var legacy = (this.store && this.store.attendance) || [];
    var matched = legacy.filter(function(a) { return a.date && a.date.startsWith(yearMonth); });
    this._attendanceMonths[yearMonth] = matched;
    return matched;
  },

  _mergeAttendanceRecordsIntoStore: function(yearMonth, records) {
    if (!this.store) return;
    if (!this.store.attendance) this.store.attendance = [];
    this.store.attendance = this.store.attendance.filter(function(a) {
      return !(a.date && a.date.startsWith(yearMonth));
    });
    for (var i = 0; i < records.length; i++) {
      this.store.attendance.push(records[i]);
    }
  },

  listenToAttendanceMonth: function(yearMonth) {
    if (!yearMonth) yearMonth = new Date().toISOString().slice(0, 7);
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId || !this.isRestructured(currentSchoolId)) return;
    if (this._attendanceListeners[yearMonth]) return;

    if (window.firestore && window.db && window.firestore.onSnapshot && window.firestore.collection) {
      var self = this;
      var classesColl = window.firestore.collection(window.db, 'tenant_data', currentSchoolId, 'attendance_months', yearMonth, 'classes');
      var unsub = window.firestore.onSnapshot(classesColl, function(snap) {
        if (snap && !snap.empty) {
          var records = [];
          snap.forEach(function(docSnap) {
            var data = docSnap.data() || {};
            if (Array.isArray(data.records)) {
              records = records.concat(data.records);
            }
          });
          self._attendanceMonths[yearMonth] = records;
          self._mergeAttendanceRecordsIntoStore(yearMonth, records);
          if (self.currentPage === 'attendance' && window.AttendanceModule && typeof window.AttendanceModule.render === 'function') {
            window.AttendanceModule.render();
          } else if (self.currentPage === 'dashboard') {
            self.renderDashboard();
          }
        }
      }, function(err) {
        console.warn('[Attendance Listener] error on ' + yearMonth + ':', err);
      });
      this._attendanceListeners[yearMonth] = unsub;
    }
  },

  saveAttendanceRecord: async function(record, bypassLoader) {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
      console.warn("[Security] Write blocked: Super Admin impersonation mode.");
      this.showToast("View-only mode. Changes not saved during impersonation.", "warning");
      return false;
    }
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) {
      console.error('[Attendance] Save blocked: No active school context.');
      return false;
    }
    var ym = (record && record.date ? record.date : new Date().toISOString().split('T')[0]).slice(0, 7);

    // Update in-memory store
    if (!this.store.attendance) this.store.attendance = [];
    var idx = this.store.attendance.findIndex(function(a) {
      return a.id === record.id || (a.date === record.date &&
        String(a.class).toLowerCase().trim() === String(record.class).toLowerCase().trim() &&
        String(a.section).toLowerCase().trim() === String(record.section).toLowerCase().trim());
    });
    if (idx !== -1) {
      this.store.attendance[idx] = record;
    } else {
      this.store.attendance.push(record);
    }

    // Update in-memory month cache
    if (!this._attendanceMonths[ym]) {
      this._attendanceMonths[ym] = this.store.attendance.filter(function(a) { return a.date && a.date.startsWith(ym); });
    } else {
      var mIdx = this._attendanceMonths[ym].findIndex(function(a) {
        return a.id === record.id || (a.date === record.date &&
          String(a.class).toLowerCase().trim() === String(record.class).toLowerCase().trim() &&
          String(a.section).toLowerCase().trim() === String(record.section).toLowerCase().trim());
      });
      if (mIdx !== -1) {
        this._attendanceMonths[ym][mIdx] = record;
      } else {
        this._attendanceMonths[ym].push(record);
      }
    }

    // Single-write: If restructured, write targeted document to attendance_months/{ym}/classes/{classId}
    if (this.isRestructured(currentSchoolId)) {
      if (!bypassLoader) this.showLoader('Saving attendance...');
      try {
        var classId = String(record.class);
        var docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'attendance_months', ym, 'classes', classId);
        var classRecords = (this._attendanceMonths[ym] || []).filter(function(a) {
          return String(a.class) === String(record.class);
        });
        var saveFn = () => window.firestore.setDoc(docRef, { records: JSON.parse(JSON.stringify(classRecords)) });
        var success = await this.saveWithRetry(saveFn);
        if (success) {
          console.log('[Attendance] Successfully saved class ' + classId + ' attendance to attendance_months/' + ym + '/classes/' + classId);
          return true;
        }
        return false;
      } catch (err) {
        console.error('[Attendance] Save failed:', err);
        this.showToast('Save failed: ' + (err.message || 'Check connection'), 'error');
        return false;
      } finally {
        if (!bypassLoader) this.hideLoader();
      }
    }

    // Fallback: If not restructured, use legacy full document save
    return await this.save(bypassLoader);
  },

  deleteAttendanceRecord: async function(recordOrId, bypassLoader) {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
      console.warn("[Security] Write blocked: Super Admin impersonation mode.");
      this.showToast("View-only mode. Changes not saved during impersonation.", "warning");
      return false;
    }
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) {
      console.error('[Attendance] Delete blocked: No active school context.');
      return false;
    }
    var record = typeof recordOrId === 'object' && recordOrId !== null ? recordOrId :
      (this.store.attendance || []).find(function(a) { return a.id === recordOrId; });
    if (!record) return false;

    var id = record.id;
    var ym = (record.date || '').slice(0, 7);

    // Move to trash
    this.moveToTrash('attendance', id, 'Attendance: Class ' + record.class + '-' + record.section, this.formatDate(record.date), record);

    // Remove from in-memory store
    this.store.attendance = (this.store.attendance || []).filter(function(a) { return a.id !== id; });

    // Remove from in-memory month cache
    if (ym && this._attendanceMonths[ym]) {
      this._attendanceMonths[ym] = this._attendanceMonths[ym].filter(function(a) { return a.id !== id; });
    }

    if (!bypassLoader) this.showLoader('Deleting attendance record...');
    // Single-write: If restructured, update attendance_months/{ym}/classes/{classId} AND save trash to tenant doc
    if (this.isRestructured(currentSchoolId)) {
      try {
        if (ym && record.class) {
          var classId = String(record.class);
          var docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'attendance_months', ym, 'classes', classId);
          var classRecords = (this._attendanceMonths[ym] || []).filter(function(a) {
            return String(a.class) === String(record.class);
          });
          await window.firestore.setDoc(docRef, { records: JSON.parse(JSON.stringify(classRecords)) });
        }
        await this.save(true);
        return true;
      } catch (err) {
        console.error('[Attendance] Delete failed:', err);
        return false;
      } finally {
        if (!bypassLoader) this.hideLoader();
      }
    }

    try {
      return await this.save(true);
    } finally {
      if (!bypassLoader) this.hideLoader();
    }
  },

  /* ===== FEES DUAL-READ / SINGLE-WRITE ===== */
  loadFeesYear: async function(year) {
    if (!year) {
      year = String(new Date().getFullYear());
    }
    year = String(year);
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) return [];

    if (this._feesYears[year]) {
      this._mergeFeesIntoStore(year, this._feesYears[year]);
      return this._feesYears[year];
    }

    // Dual-read: try reading from subcollection: tenant_data/{schoolId}/fees_years/{year}
    // Dual-read: try reading from subcollection: tenant_data/{schoolId}/fees_years/{year}/months
    try {
      if (window.firestore && window.db) {
        var monthsColl = window.firestore.collection(window.db, 'tenant_data', currentSchoolId, 'fees_years', year, 'months');
        var snap = await window.firestore.getDocs(monthsColl);
        if (snap && !snap.empty) {
          var transactions = [];
          snap.forEach(function(docSnap) {
            var data = docSnap.data() || {};
            if (Array.isArray(data.transactions)) {
              transactions = transactions.concat(data.transactions);
            }
          });
          this._feesYears[year] = transactions;
          this._mergeFeesIntoStore(year, transactions);
          return transactions;
        }

        // Backward compatibility: check if un-sharded year document exists
        var legacyDocRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'fees_years', year);
        var legacySnap = await window.firestore.getDoc(legacyDocRef);
        if (legacySnap && legacySnap.exists()) {
          var legData = legacySnap.data() || {};
          var legTxns = Array.isArray(legData.transactions) ? legData.transactions : [];
          this._feesYears[year] = legTxns;
          this._mergeFeesIntoStore(year, legTxns);
          return legTxns;
        }
      }
    } catch (err) {
      console.warn('[Fees] Error fetching fees_years/' + year + '/months:', err);
    }

    // Fallback: legacy array
    var legacy = (this.store && this.store.fees) || [];
    var matched = legacy.filter(function(f) { return f.date && String(f.date).startsWith(year); });
    this._feesYears[year] = matched;
    this._mergeFeesIntoStore(year, matched);
    return matched;
  },

  _mergeFeesIntoStore: function(year, transactions) {
    if (!this.store) return;
    if (!this.store.fees) this.store.fees = [];
    if (!Array.isArray(transactions)) return;

    var incomingMap = {};
    for (var i = 0; i < transactions.length; i++) {
      var t = transactions[i];
      if (t && t.id) {
        incomingMap[t.id] = t;
      }
    }

    // Update existing records in store.fees in-place to support updates/status changes
    var updatedIds = new Set();
    for (var j = 0; j < this.store.fees.length; j++) {
      var existing = this.store.fees[j];
      if (existing && existing.id && incomingMap[existing.id]) {
        this.store.fees[j] = incomingMap[existing.id];
        updatedIds.add(existing.id);
      }
    }

    // Append newly inserted records that don't exist yet
    for (var k = 0; k < transactions.length; k++) {
      var incoming = transactions[k];
      if (incoming && incoming.id && !updatedIds.has(incoming.id)) {
        this.store.fees.push(incoming);
        updatedIds.add(incoming.id);
      }
    }

    // Keep _feesYears synchronized with current store.fees
    this._feesYears[year] = this.store.fees.filter(function(f) {
      return f.date && String(f.date).startsWith(year);
    });
  },

  listenToFeesYear: function(year) {
    if (!year) year = String(new Date().getFullYear());
    year = String(year);
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId || !this.isRestructured(currentSchoolId)) return;
    if (this._feesListeners[year]) return;

    if (window.firestore && window.db && window.firestore.onSnapshot && window.firestore.collection) {
      var self = this;
      var monthsColl = window.firestore.collection(window.db, 'tenant_data', currentSchoolId, 'fees_years', year, 'months');
      var unsub = window.firestore.onSnapshot(monthsColl, function(snap) {
        if (snap && !snap.empty) {
          var transactions = [];
          snap.forEach(function(docSnap) {
            var data = docSnap.data() || {};
            if (Array.isArray(data.transactions)) {
              transactions = transactions.concat(data.transactions);
            }
          });
          self._mergeFeesIntoStore(year, transactions);
          if (self.currentPage === 'fees' && window.FeesModule && typeof window.FeesModule.render === 'function') {
            window.FeesModule.render();
          } else if (self.currentPage === 'dashboard') {
            self.renderDashboard();
          }
        }
      }, function(err) {
        console.warn('[Fees Listener] error on ' + year + ':', err);
      });
      this._feesListeners[year] = unsub;
    }
  },

  saveFeeTransaction: async function(txn, bypassLoader) {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
      console.warn("[Security] Write blocked: Super Admin impersonation mode.");
      this.showToast("View-only mode. Changes not saved during impersonation.", "warning");
      return false;
    }
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) {
      console.error('[Fees] Save blocked: No active school context.');
      return false;
    }
    var yr = String((txn && txn.date ? txn.date : new Date().toISOString()).slice(0, 4));
    var mo = String((txn && txn.date ? txn.date : new Date().toISOString()).slice(5, 7)) || 'unknown';

    if (!this.store.fees) this.store.fees = [];
    var idx = this.store.fees.findIndex(function(f) { return f.id === txn.id; });
    if (idx !== -1) {
      this.store.fees[idx] = txn;
    } else {
      this.store.fees.push(txn);
    }

    if (!this._feesYears[yr]) {
      this._feesYears[yr] = this.store.fees.filter(function(f) { return f.date && String(f.date).startsWith(yr); });
    } else {
      var yIdx = this._feesYears[yr].findIndex(function(f) { return f.id === txn.id; });
      if (yIdx !== -1) {
        this._feesYears[yr][yIdx] = txn;
      } else {
        this._feesYears[yr].push(txn);
      }
    }

    // Single-write: If restructured, write targeted doc to fees_years/{yr}/months/{mo}
    if (this.isRestructured(currentSchoolId)) {
      if (!bypassLoader) this.showLoader('Recording fee transaction...');
      try {
        var docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'fees_years', yr, 'months', mo);
        var ymPrefix = yr + '-' + mo;
        var monthTxns = (this._feesYears[yr] || []).filter(function(f) {
          return f.date && String(f.date).startsWith(ymPrefix);
        });
        var saveFn = () => window.firestore.setDoc(docRef, { transactions: JSON.parse(JSON.stringify(monthTxns)) });
        var success = await this.saveWithRetry(saveFn);
        if (success) {
          console.log('[Fees] Successfully saved transaction to fees_years/' + yr + '/months/' + mo);
          if (this.store.feeActivityLog) {
            await this.save(true);
          }
          return true;
        }
        return false;
      } catch (err) {
        console.error('[Fees] Save failed:', err);
        this.showToast('Save failed: ' + (err.message || 'Check connection'), 'error');
        return false;
      } finally {
        if (!bypassLoader) this.hideLoader();
      }
    }

    return await this.save(bypassLoader);
  },

  saveFeeTransactions: async function(txns, bypassLoader) {
    if (!Array.isArray(txns) || txns.length === 0) return true;
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) {
      console.error('[Fees] Bulk save blocked: No active school context.');
      return false;
    }
    var self = this;

    if (!this.store.fees) this.store.fees = [];

    // Group by yr and mo
    var byYearMonth = {};
    for (var i = 0; i < txns.length; i++) {
      var txn = txns[i];
      var yr = String((txn && txn.date ? txn.date : new Date().toISOString()).slice(0, 4));
      var mo = String((txn && txn.date ? txn.date : new Date().toISOString()).slice(5, 7)) || 'unknown';
      if (!byYearMonth[yr]) byYearMonth[yr] = {};
      if (!byYearMonth[yr][mo]) byYearMonth[yr][mo] = [];
      byYearMonth[yr][mo].push(txn);
    }

    if (this.isRestructured(currentSchoolId)) {
      if (!bypassLoader) this.showLoader('Saving ' + txns.length + ' fee transactions...');
      try {
        var yearKeys = Object.keys(byYearMonth);
        for (var y = 0; y < yearKeys.length; y++) {
          var yKey = yearKeys[y];
          if (!self._feesYears[yKey]) {
            self._feesYears[yKey] = self.store.fees.filter(function(f) { return f.date && String(f.date).startsWith(yKey); });
          }
          var monthKeys = Object.keys(byYearMonth[yKey]);
          for (var m = 0; m < monthKeys.length; m++) {
            var mKey = monthKeys[m];
            var newItems = byYearMonth[yKey][mKey];
            for (var k = 0; k < newItems.length; k++) {
              var foundIdx = self._feesYears[yKey].findIndex(function(f) { return f.id === newItems[k].id; });
              if (foundIdx !== -1) {
                self._feesYears[yKey][foundIdx] = newItems[k];
              } else {
                self._feesYears[yKey].push(newItems[k]);
              }
              var storeIdx = self.store.fees.findIndex(function(f) { return f.id === newItems[k].id; });
              if (storeIdx !== -1) {
                self.store.fees[storeIdx] = newItems[k];
              } else {
                self.store.fees.push(newItems[k]);
              }
            }
            var ymPrefix = yKey + '-' + mKey;
            var monthTxns = self._feesYears[yKey].filter(function(f) {
              return f.date && String(f.date).startsWith(ymPrefix);
            });
            var docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'fees_years', yKey, 'months', mKey);
            await window.firestore.setDoc(docRef, { transactions: JSON.parse(JSON.stringify(monthTxns)) });
          }
        }
        console.log('[Fees] Bulk saved ' + txns.length + ' transactions across months.');
        if (self.store.feeActivityLog) {
          await self.save(true);
        }
        return true;
      } catch (err) {
        console.error('[Fees] Bulk save failed:', err);
        return false;
      } finally {
        if (!bypassLoader) this.hideLoader();
      }
    }

    return await this.save(bypassLoader);
  },

  deleteFeeTransaction: async function(txnId, txnDate, bypassLoader) {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
      console.warn("[Security] Write blocked: Super Admin impersonation mode.");
      this.showToast("View-only mode. Changes not saved during impersonation.", "warning");
      return false;
    }
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) {
      console.error('[Fees] Delete blocked: No active school context.');
      return false;
    }
    var yr = txnDate ? String(txnDate).slice(0, 4) : '';
    var mo = txnDate ? String(txnDate).slice(5, 7) : 'unknown';

    this.store.fees = (this.store.fees || []).filter(function(f) {
      if (f.id === txnId) {
        if (!yr && f.date) yr = String(f.date).slice(0, 4);
        if (mo === 'unknown' && f.date) mo = String(f.date).slice(5, 7) || 'unknown';
        return false;
      }
      return true;
    });

    if (yr && this._feesYears[yr]) {
      this._feesYears[yr] = this._feesYears[yr].filter(function(f) { return f.id !== txnId; });
    }

    if (!bypassLoader) this.showLoader('Deleting fee transaction...');
    if (this.isRestructured(currentSchoolId)) {
      try {
        if (yr) {
          var ymPrefix = yr + '-' + mo;
          var monthTxns = (this._feesYears[yr] || []).filter(function(f) {
            return f.date && String(f.date).startsWith(ymPrefix);
          });
          var docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'fees_years', yr, 'months', mo);
          await window.firestore.setDoc(docRef, { transactions: monthTxns });
        }
        return true;
      } catch (err) {
        console.error('[Fees] Delete failed:', err);
        return false;
      } finally {
        if (!bypassLoader) this.hideLoader();
      }
    }

    try {
      return await this.save(true);
    } finally {
      if (!bypassLoader) this.hideLoader();
    }
  },

  /* ===== EXAM MARKS DUAL-READ / SINGLE-WRITE ===== */
  loadExamMarksTerm: async function(termId) {
    if (!termId) return {};
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) return {};

    if (this.store.examMarks && this.store.examMarks[termId] && Object.keys(this.store.examMarks[termId]).length > 0) {
      return this.store.examMarks[termId];
    }

    // Dual-read: try reading from subcollection: tenant_data/{schoolId}/exam_marks/{termId}
    try {
      if (window.firestore && window.db) {
        var docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'exam_marks', termId);
        var snap = await window.firestore.getDoc(docRef);
        if (snap && snap.exists()) {
          var termData = snap.data() || {};
          if (!this.store.examMarks) this.store.examMarks = {};
          this.store.examMarks[termId] = termData;
          return termData;
        }
      }
    } catch (err) {
      console.warn('[Exam Marks] Error fetching exam_marks/' + termId + ':', err);
    }

    // Fallback: legacy examMarks object on store
    if (!this.store.examMarks) this.store.examMarks = {};
    return this.store.examMarks[termId] || {};
  },

  deleteExamMarksTerm: async function(termId) {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
      console.warn("[Security] Write blocked: Super Admin impersonation mode.");
      this.showToast("View-only mode. Changes not saved during impersonation.", "warning");
      return false;
    }
    var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
    if (!currentSchoolId) {
      console.error('[Exam Marks] Delete blocked: No active school context.');
      return false;
    }

    if (this.store.examMarks && this.store.examMarks[termId]) {
      delete this.store.examMarks[termId];
    }

    if (this.isRestructured(currentSchoolId)) {
      try {
        if (window.firestore && window.firestore.deleteDoc) {
          var docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'exam_marks', termId);
          await window.firestore.deleteDoc(docRef);
          console.log('[Exam Marks] Successfully deleted term doc: exam_marks/' + termId);
        }
        await this.save(true);
        return true;
      } catch (err) {
        console.error('[Exam Marks] Delete term failed:', err);
        return false;
      }
    }

    return await this.save();
  },

  saveMarks: async function(termId, classId, sectionId, studentId, markEntry) {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
      console.warn("[Security] Write blocked: Super Admin impersonation mode.");
      this.showToast("View-only mode. Changes not saved during impersonation.", "warning");
      return false;
    }
    try {
      var currentSchoolId = (this.store && this.store.currentSchoolId) || localStorage.getItem('impersonate_school_id') || '';
      if (!currentSchoolId) {
        console.error('[Exam Marks] Save blocked: No active school context.');
        return false;
      }

      // Update in-memory store
      if (!this.store.examMarks) this.store.examMarks = {};
      if (!this.store.examMarks[termId]) this.store.examMarks[termId] = {};
      if (!this.store.examMarks[termId][classId]) this.store.examMarks[termId][classId] = {};
      if (!this.store.examMarks[termId][classId][sectionId]) this.store.examMarks[termId][classId][sectionId] = {};
      this.store.examMarks[termId][classId][sectionId][studentId] = markEntry;

      // Restructured write path -> tenant_data/{schoolId}/exam_marks/{termId}
      if (this.isRestructured(currentSchoolId)) {
        const termDocRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId, 'exam_marks', termId);
        const markSubPath = classId + '.' + sectionId + '.' + studentId;
        console.log('[saveMarks:subcollection] path:', 'exam_marks/' + termId + ' -> ' + markSubPath);
        try {
          await window.firestore.updateDoc(termDocRef, { [markSubPath]: markEntry });
          console.log('[saveMarks:subcollection] updateDoc SUCCESS');
        } catch (updateErr) {
          console.warn('[saveMarks:subcollection] updateDoc failed, retrying setDoc merge...');
          var nested = {};
          nested[classId] = {};
          nested[classId][sectionId] = {};
          nested[classId][sectionId][studentId] = markEntry;
          await window.firestore.setDoc(termDocRef, nested, { merge: true });
          console.log('[saveMarks:subcollection] setDoc merge SUCCESS');
        }
        return true;
      }

      // Legacy write path -> tenant_data/{schoolId}
      const docRef = window.firestore.doc(window.db, 'tenant_data', currentSchoolId);
      const markPath = 'examMarks.' + termId + '.' + classId + '.' + sectionId + '.' + studentId;

      console.log('[saveMarks:legacy] path:', markPath);

      try {
        await window.firestore.updateDoc(docRef, { [markPath]: markEntry });
        console.log('[saveMarks:legacy] updateDoc SUCCESS');
      } catch (updateErr) {
        console.warn('[saveMarks:legacy] updateDoc failed (' + (updateErr.code || updateErr.message) + '), retrying with setDoc merge...');
        var nested = {};
        nested['examMarks'] = {};
        nested['examMarks'][termId] = {};
        nested['examMarks'][termId][classId] = {};
        nested['examMarks'][termId][classId][sectionId] = {};
        nested['examMarks'][termId][classId][sectionId][studentId] = markEntry;
        await window.firestore.setDoc(docRef, nested, { merge: true });
        console.log('[saveMarks:legacy] setDoc merge SUCCESS');
      }

      try {
        const payload = JSON.parse(JSON.stringify(this.store));
        localStorage.setItem('cached_tenant_data_' + currentSchoolId, JSON.stringify(payload));
      } catch (err) {
        console.warn('Failed to write secondary cache to localStorage:', err);
      }
      return true;
    } catch (e) {
      console.error('[saveMarks] FAILED:', e.code, e.message);
      this.showToast('Save failed: ' + (e.message || 'Check connection'), 'error');
      return false;
    }
  },

  tenantListenerUnsubscribe: null,
  schoolsListenerUnsubscribe: null,

  updateConnectionIndicator: function(fromCache) {
    const indicator = document.getElementById('live-indicator');
    const dot = indicator ? indicator.querySelector('.live-dot') : null;
    const text = document.getElementById('live-status-text');
    
    if (!indicator || !dot || !text) return;
    
    const isOnline = navigator.onLine;
    if (isOnline && !fromCache) {
      indicator.style.color = 'var(--success)';
      indicator.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
      indicator.style.borderColor = 'rgba(16, 185, 129, 0.15)';
      dot.style.backgroundColor = 'var(--success)';
      dot.style.boxShadow = '0 0 6px var(--success)';
      dot.style.animation = 'pulse-dot 1.8s infinite';
      text.textContent = 'Live';
    } else {
      indicator.style.color = 'var(--warning)';
      indicator.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
      indicator.style.borderColor = 'rgba(245, 158, 11, 0.15)';
      dot.style.backgroundColor = 'var(--warning)';
      dot.style.boxShadow = '0 0 6px var(--warning)';
      dot.style.animation = 'pulse-dot-warning 1.8s infinite';
      text.textContent = 'Reconnecting...';
    }
  },

  load: async function(bypassLoader) {
    if (!bypassLoader) {
      this.showLoader('Loading...');
    }

    var self = this;
    
    if (!window.connectionEventsBound) {
      window.connectionEventsBound = true;
      window.addEventListener('online', function() {
        self.updateConnectionIndicator(true);
      });
      window.addEventListener('offline', function() {
        self.updateConnectionIndicator(true);
      });
    }

    return new Promise((resolve) => {
      var hostname = window.location.hostname.toLowerCase();
      var sub = null;
      if (hostname.endsWith('.ctrlshifts.in') && hostname !== 'ctrlshifts.in') {
        sub = hostname.substring(0, hostname.indexOf('.ctrlshifts.in'));
      } else if (hostname.endsWith('.shishu-vikash-mandir.vercel.app')) {
        sub = hostname.substring(0, hostname.indexOf('.shishu-vikash-mandir.vercel.app'));
      } else if (hostname.endsWith('.localhost')) {
        sub = hostname.substring(0, hostname.indexOf('.localhost'));
      }

      if (self.schoolsListenerUnsubscribe) {
        self.schoolsListenerUnsubscribe();
      }
      
      const schoolsCol = window.firestore.collection(window.db, 'schools');
      self.schoolsListenerUnsubscribe = window.firestore.onSnapshot(schoolsCol, (querySnapshot) => {
        var schoolsList = [];
        querySnapshot.forEach((doc) => {
          schoolsList.push(doc.data());
        });
        self.store.schools = schoolsList;
        
        var activeSchoolId = null;
        var matchedSchool = null;
        if (sub) {
          matchedSchool = schoolsList.find(function(s) {
            return s.subdomain === sub;
          });
          if (matchedSchool) {
            activeSchoolId = matchedSchool.school_id;
            console.log('Detected school context from subdomain: ' + sub + ' -> ' + activeSchoolId);
          } else {
            console.warn('Subdomain context detected but no matching school found in Firestore: ' + sub);
          }
        }

        var urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
        var querySchoolId = urlParams ? urlParams.get('impersonate_school_id') : null;
        if (!sub && !activeSchoolId) {
          activeSchoolId = querySchoolId || localStorage.getItem('impersonate_school_id') || null;
        }

        var previousSchoolId = (self.store && self.store.currentSchoolId) ? self.store.currentSchoolId : '';

        // Clean teardown before attaching new tenant listener ONLY if switching to a DIFFERENT school
        if (activeSchoolId) {
          if (previousSchoolId && previousSchoolId !== activeSchoolId) {
            self.resetTenantSession(activeSchoolId);
          } else {
            self.store.currentSchoolId = activeSchoolId;
          }
        }

        if (activeSchoolId) {
          var firstResolveCalled = false;

          // If already listening to this exact school and initialized, do not tear down or re-attach
          if (self.tenantListenerUnsubscribe && previousSchoolId === activeSchoolId && self.tenantInitialized) {
            if (!bypassLoader) self.hideLoader();
            resolve(true);
            return;
          }

          const docRef = window.firestore.doc(window.db, 'tenant_data', activeSchoolId);

          // ISSUE 2 FIX: Declare render guard OUTSIDE onSnapshot callback so it persists
          var _examsRenderLock = false;
          var _lastExamsRender = 0;
          var EXAMS_RENDER_THROTTLE = 5000;

          self.tenantListenerUnsubscribe = window.firestore.onSnapshot(docRef, { includeMetadataChanges: true }, async (docSnap) => {
            self.updateConnectionIndicator(docSnap.metadata.fromCache);

            var parsed = null;
            var docExists = docSnap.exists();
            if (docExists) {
              parsed = docSnap.data();
            }

            // SAFEGUARD: Never auto-create or overwrite tenant document from a client onSnapshot event.
            // If the document is not found, simply wait for the next snapshot from server.
            if (!docExists) {
              console.warn('Document not found on snapshot for ' + activeSchoolId + ' — waiting for next snapshot, NOT auto-initializing.');
              return;
            }

            if (parsed) {
              // Clean replacement from initial baseline + server snapshot (NO MERGING with stale state)
              var preservedSchools = (self.store && self.store.schools) ? self.store.schools : [];
              var preservedFees = (self.store && self.store.fees && self.store.fees.length > 0 && (!parsed.fees || parsed.fees.length === 0)) ? self.store.fees : [];
              var preservedAttendance = (self.store && self.store.attendance && self.store.attendance.length > 0 && (!parsed.attendance || parsed.attendance.length === 0)) ? self.store.attendance : [];
              var preservedExamMarks = (self.store && self.store.examMarks && Object.keys(self.store.examMarks).length > 0 && (!parsed.examMarks || Object.keys(parsed.examMarks).length === 0)) ? self.store.examMarks : {};

              self.store = Object.assign(self.getInitialStore(), parsed, {
                currentSchoolId: activeSchoolId
              });
              self.store.schools = preservedSchools;
              if (preservedFees.length > 0) self.store.fees = preservedFees;
              if (preservedAttendance.length > 0) self.store.attendance = preservedAttendance;
              if (Object.keys(preservedExamMarks).length > 0) self.store.examMarks = preservedExamMarks;

              self.initialServerStudentCount = (parsed.students || []).length;
              self.initialServerTeacherCount = (parsed.teachers || []).length;
              self.initialServerExamTermsCount = Object.keys(parsed.examTerms || {}).length;
              self.liveServerStudentCount = (parsed.students || []).length;
              self.liveServerTeacherCount = (parsed.teachers || []).length;
              self.tenantInitialized = true;
              self.enableLoginButton();
            }

            // Populate default arrays/objects if missing
            if (!self.store.students) self.store.students = [];
            if (!self.store.teachers) self.store.teachers = [];
            if (!self.store.attendance) self.store.attendance = [];
            if (!self.store.trash) self.store.trash = [];
            if (!self.store.feeHeads) self.store.feeHeads = [];
            if (!self.store.feeStructures) self.store.feeStructures = {};
            if (!self.store.fees) self.store.fees = [];
            if (!self.store.feeActivityLog) self.store.feeActivityLog = [];
            if (!self.store.exams) self.store.exams = [];
            if (!self.store.subjectMapping) self.store.subjectMapping = {};
            if (!self.store.marks) self.store.marks = [];
            if (!self.store.notices) self.store.notices = [];
            if (!self.store.timetable) self.store.timetable = {};

            if (!self.store.settings) self.store.settings = {};

            // Migrate or initialize settings.feeHeads from store.feeHeads
            if (!self.store.settings.feeHeads) {
              if (self.store.feeHeads && self.store.feeHeads.length > 0) {
                self.store.settings.feeHeads = JSON.parse(JSON.stringify(self.store.feeHeads));
              } else {
                self.store.settings.feeHeads = [
                  { id: 'fh_tuition', name: 'Tuition Fee' },
                  { id: 'fh_transport', name: 'Transport Fee' },
                  { id: 'fh_exam', name: 'Examination Fee' },
                  { id: 'fh_fine', name: 'Late Fee / Fine' },
                  { id: 'fh_annual', name: 'Annual Development Fee' }
                ];
              }
            }
            self.store.feeHeads = self.store.settings.feeHeads;

            // Migrate or initialize settings.feeStructure from store.feeStructures
            if (!self.store.settings.feeStructure) {
              if (self.store.feeStructures && Object.keys(self.store.feeStructures).length > 0) {
                self.store.settings.feeStructure = {};
                var fs = self.store.feeStructures;
                Object.keys(fs).forEach(function(cls) {
                  self.store.settings.feeStructure[cls] = {};
                  var clsFees = fs[cls] || {};
                  Object.keys(clsFees).forEach(function(feeId) {
                    var cleanId = feeId;
                    if (feeId === 'fh_tuition') cleanId = 'tuition';
                    else if (feeId === 'fh_transport') cleanId = 'transport';
                    else if (feeId === 'fh_exam') cleanId = 'exam';
                    else if (feeId === 'fh_fine') cleanId = 'fine';
                    else if (feeId === 'fh_annual') cleanId = 'annual';
                    else if (feeId.startsWith('fh_')) cleanId = feeId.substring(3);
                    self.store.settings.feeStructure[cls][cleanId] = clsFees[feeId];
                  });
                });
              }
            }

            // Default subjects
            if (!self.store.settings.subjects) {
              self.store.settings.subjects = ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'Computer Science', 'Sanskrit', 'Art'];
            }
            if (!self.store.settings.schoolInfo) {
              self.store.settings.schoolInfo = {
                name: self.store.settings.schoolName || '',
                tagline: '',
                logoUrl: self.store.settings.logoUrl || '',
                phone: self.store.settings.phone || '',
                email: self.store.settings.email || '',
                address: self.store.settings.address || '',
                affiliation: '',
                udiseCode: ''
              };
            } else if (self.store.settings.schoolInfo.udiseCode === undefined) {
              self.store.settings.schoolInfo.udiseCode = '';
            }

            // SYNC FIX: Super Admin onboarding/edit writes settings.schoolInfo.*
            // (nested). The School Admin Settings form reads/writes the FLAT
            // fields (settings.schoolName, settings.phone, etc). Without this,
            // a school onboarded (or last edited) from Super Admin shows a
            // BLANK Settings form until the admin manually retypes everything
            // that was already entered during onboarding. Backfill any missing
            // flat field from schoolInfo — never overwrite a flat value the
            // admin already set themselves.
            (function syncFlatSettingsFromSchoolInfo() {
              var si = self.store.settings.schoolInfo;
              var s = self.store.settings;
              var ms = matchedSchool || (self.store.schools || []).find(function(sch) { return sch.school_id === activeSchoolId; });

              // Authoritative fallback chain for schoolName:
              // settings.schoolName -> settings.schoolInfo.name -> matchedSchool.school_name
              if (!s.schoolName) {
                if (si && si.name) s.schoolName = si.name;
                else if (ms && ms.school_name) s.schoolName = ms.school_name;
              }
              if (si) {
                if (!si.name && s.schoolName) si.name = s.schoolName;
                else if (!si.name && ms && ms.school_name) si.name = ms.school_name;
              }

              if (si) {
                if (!s.tagline && si.tagline) s.tagline = si.tagline;
                if (!s.phone && si.phone) s.phone = si.phone;
                if (!s.email && si.email) s.email = si.email;
                if (!s.address && si.address) s.address = si.address;
                if (!s.affiliation && si.affiliation) s.affiliation = si.affiliation;
                if (!s.udiseCode && si.udiseCode) s.udiseCode = si.udiseCode;
                if (!s.logoUrl && si.logoUrl) s.logoUrl = si.logoUrl;
              }
            })();

            // Reactively update brand UI whenever tenant settings load or change
            self.updateBrandUI();

            // RESTORE ARCHITECTURE: If tenant is restructured, automatically load & listen
            // to the current month's attendance and current year's fees
            if (self.isRestructured(activeSchoolId)) {
              var currentYM = new Date().toISOString().slice(0, 7);
              var currentYr = String(new Date().getFullYear());
              self.loadAttendanceMonth(currentYM).then(function() {
                self.listenToAttendanceMonth(currentYM);
              });
              self.loadFeesYear(currentYr).then(function() {
                self.listenToFeesYear(currentYr);
                if (self.currentPage === 'fees' && window.FeesModule && typeof window.FeesModule.render === 'function') {
                  window.FeesModule.render();
                }
              });
            }
            if (self.currentPage && firstResolveCalled) {
              console.log("Auto-refreshing active page: " + self.currentPage);
              if (self.currentPage === 'dashboard') {
                self.renderDashboard();
              } else if (self.currentPage === 'exams') {
                // ISSUE 2 FIX: onSnapshot NEVER triggers full module re-render.
                // Only call refreshMarksTable (lightweight, guarded inside exams.js)
                if (typeof window.renderMarksTable === 'function') {
                  var _now = Date.now();
                  if (!_examsRenderLock && (_now - _lastExamsRender > EXAMS_RENDER_THROTTLE)) {
                    _examsRenderLock = true;
                    _lastExamsRender = _now;
                    try { window.renderMarksTable(); } finally { _examsRenderLock = false; }
                  } else {
                    console.log('Exams render throttled (' + (Date.now() - _lastExamsRender) + 'ms since last)');
                  }
                }
              } else if (self.modules[self.currentPage] && self.modules[self.currentPage].render) {
                self.modules[self.currentPage].render();
              }
            }

            if (!firstResolveCalled) {
              firstResolveCalled = true;
              if (!bypassLoader) self.hideLoader();
              resolve(true);
            }
          }, (error) => {
            console.error("Firestore tenant onSnapshot error:", error);
            self.updateConnectionIndicator(true);

            if (!firstResolveCalled) {
              firstResolveCalled = true;
              if (!bypassLoader) self.hideLoader();
              resolve(false);
            }
          });
        } else {
          if (!bypassLoader) self.hideLoader();
          self.setupLoginButtonGate();
          resolve(false);
        }
      }, (error) => {
        console.error('Failed to sync schools in real-time:', error);
        if (!bypassLoader) self.hideLoader();
        self.setupLoginButtonGate();
        resolve(false);
      });
    });
  },



  updateBrandUI: function() {
    var settings = this.store.settings || {};
    var info = settings.schoolInfo || {};
    var currentSchoolId = this.store.currentSchoolId;
    var ms = this.matchedSchool || (this.store.schools || []).find(function(sch) { return sch.school_id === currentSchoolId; });
    var schoolName = settings.schoolName || info.name || (ms && ms.school_name) || '';

    // Update title — "Paathshala ERP | <School Name>", or just "Paathshala ERP"
    // before the school name has loaded.
    document.title = schoolName ? ("Paathshala ERP | " + schoolName) : "Paathshala ERP";

    // Update text names
    document.querySelectorAll('.login-title').forEach(function(el) {
      el.textContent = schoolName;
    });
    document.querySelectorAll('.logo-text, .mobile-school-name').forEach(function(el) {
      el.textContent = schoolName;
    });

    // On login page & sidebar → if logoUrl exists show it, else show nothing (no placeholder, no SVM logo)
    var logoUrl = (settings.logoUrl && settings.logoUrl.trim() !== "") ? settings.logoUrl : ((info.logoUrl && info.logoUrl.trim() !== "") ? info.logoUrl : ((ms && ms.logo_url && ms.logo_url.trim() !== "") ? ms.logo_url : ""));
    if (logoUrl && logoUrl.trim() !== "") {
      document.querySelectorAll('.login-logo-img, .logo-img').forEach(function(img) {
        img.src = logoUrl.trim();
        img.style.display = 'block';
      });
    } else {
      document.querySelectorAll('.logo-img, .login-logo-img').forEach(function(img) {
        img.src = '';
        img.style.display = 'none';
      });
    }
  },

  applyUserTheme: function() {
    var theme = 'dark';
    var firestoreTheme = (this.store && this.store.settings) ? this.store.settings.theme : null;
    
    if (this.currentUser && this.currentUser.id) {
      theme = localStorage.getItem('erp_theme_preference_' + this.currentUser.id) || 
              localStorage.getItem('erp_theme_preference') || 
              firestoreTheme || 
              'dark';
    } else {
      theme = localStorage.getItem('erp_theme_preference') || 
              firestoreTheme || 
              'dark';
    }
    
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      document.documentElement.classList.add('light-theme');
      document.body.setAttribute('data-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      document.documentElement.classList.remove('light-theme');
      document.body.setAttribute('data-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    var themeIcon = document.getElementById('app-theme-icon');
    if (themeIcon) {
      themeIcon.textContent = (theme === 'light') ? 'dark_mode' : 'light_mode';
    }

    var themeSelect = document.querySelector('select[name="theme"]');
    if (themeSelect) {
      themeSelect.value = theme;
    }
  },

  toggleTheme: function() {
    var isLight = document.body.classList.toggle('light-theme');
    document.documentElement.classList.toggle('light-theme', isLight);
    var theme = isLight ? 'light' : 'dark';
    document.body.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    
    // Save to global preference
    localStorage.setItem('erp_theme_preference', theme);
    
    // Save to user preference if logged in
    if (this.currentUser && this.currentUser.id) {
      localStorage.setItem('erp_theme_preference_' + this.currentUser.id, theme);
    }
    
    // Update theme toggle icon in header
    var themeIcon = document.getElementById('app-theme-icon');
    if (themeIcon) {
      themeIcon.textContent = isLight ? 'dark_mode' : 'light_mode';
    }
    
    // Also update any theme select dropdown in settings if visible
    var themeSelect = document.querySelector('select[name="theme"]');
    if (themeSelect) {
      themeSelect.value = theme;
    }
  },


  generateId: function() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  },

  moveToTrash: function(type, id, name, details, data) {
    if (!this.store.trash) this.store.trash = [];
    this.store.trash.push({
      id: id,
      type: type, // 'student' | 'teacher' | 'attendance'
      name: name,
      details: details,
      deletedAt: new Date().toISOString(),
      data: data
    });
    this.save(true);
  },

  createRestorePoint: function(description) {
    try {
      var restorePoints = [];
      var existing = localStorage.getItem('shishuvikash_restore_points');
      if (existing) {
        restorePoints = JSON.parse(existing);
      }
      restorePoints.unshift({
        id: 'rp_' + Date.now().toString(36),
        timestamp: new Date().toISOString(),
        description: description,
        store: JSON.parse(JSON.stringify(this.store))
      });
      // Limit to 5 restore points to save browser localStorage space
      if (restorePoints.length > 5) {
        restorePoints = restorePoints.slice(0, 5);
      }
      localStorage.setItem('shishuvikash_restore_points', JSON.stringify(restorePoints));
      console.log('System Restore Point created: ' + description);
    } catch (e) {
      console.error('Failed to create Restore Point:', e);
    }
  },

  evaluateAutoFeeDues: function(options) {
    options = options || {};
    var evalDate = options.simulateDate ? new Date(options.simulateDate) : new Date();
    if (isNaN(evalDate.getTime())) evalDate = new Date();

    var evalYear = evalDate.getFullYear();
    var evalMonth = evalDate.getMonth() + 1; // 1-12
    var evalDay = evalDate.getDate();
    var currentPeriod = evalYear + '-' + (evalMonth < 10 ? '0' + evalMonth : evalMonth); // YYYY-MM
    var evalDateStr = evalYear + '-' + (evalMonth < 10 ? '0' + evalMonth : evalMonth) + '-' + (evalDay < 10 ? '0' + evalDay : evalDay);

    var result = {
      simulatedDate: evalDateStr,
      currentPeriod: currentPeriod,
      tuitionDues: [],
      extraChargeDues: [],
      lateFeeDues: [],
      allProjected: [],
      backfillWarnings: [],
      updatedExtraChargesState: [],
      summary: {
        totalStudentsEvaluated: 0,
        tuitionCount: 0,
        tuitionTotal: 0,
        extraChargesCount: 0,
        extraChargesTotal: 0,
        lateFeesCount: 0,
        lateFeesTotal: 0,
        grandTotalCount: 0,
        grandTotalAmount: 0
      }
    };

    if (!this.store || !this.store.students || this.store.students.length === 0) {
      return result;
    }

    var activeStudents = this.store.students.filter(function(s) { return s.status === 'Active'; });
    result.summary.totalStudentsEvaluated = activeStudents.length;

    var settings = this.store.settings || {};
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var self = this;

    // =========================================================================
    // 1. EVALUATE TUITION DUES
    // =========================================================================
    var lastRun = settings.autoChargeLastRun || this.store.lastAutomatedFeeRun || '';
    if (lastRun && currentPeriod > lastRun) {
      var parts = lastRun.split('-');
      var lastYear = parseInt(parts[0], 10);
      var lastMonth = parseInt(parts[1], 10);

      var missedMonths = [];
      var year = lastYear;
      var month = lastMonth + 1;

      while (true) {
        if (month > 12) {
          month = 1;
          year++;
        }
        var period = year + '-' + (month < 10 ? '0' + month : month);
        if (period > currentPeriod) break;
        missedMonths.push({ period: period, year: year, month: month });
        month++;
      }

      missedMonths.forEach(function(m) {
        var monthName = monthNames[m.month - 1];
        var desc = 'Monthly Tuition Fee - ' + monthName + ' ' + m.year;
        var chargeDate = m.year + '-' + (m.month < 10 ? '0' + m.month : m.month) + '-05';

        activeStudents.forEach(function(s) {
          var alreadyBilled = (self.store.fees || []).some(function(f) {
            return f.studentId === s.id && f.type === 'due' && f.feeHeadId === 'fh_tuition' &&
              (f.billingPeriod === m.period || (f.date && f.date.startsWith(m.period)));
          });
          if (alreadyBilled) return;

          var tuitionAmt = 1000;
          if (settings.feeStructure && settings.feeStructure[s.class]) {
            tuitionAmt = parseFloat(settings.feeStructure[s.class].tuition || 0);
          } else {
            var classStruct = (self.store.feeStructures || {})[s.class] || {};
            tuitionAmt = parseFloat(classStruct.fh_tuition || 1000);
          }

          result.tuitionDues.push({
            id: self.generateId(),
            studentId: s.id,
            schoolId: self.currentSchoolId,
            type: 'due',
            feeHeadId: 'fh_tuition',
            amount: tuitionAmt,
            date: chargeDate,
            description: desc,
            billingPeriod: m.period,
            timestamp: new Date().toISOString()
          });
        });
      });
    }

    // =========================================================================
    // 2. EVALUATE FLEXIBLE EXTRA CHARGES (Part A)
    // =========================================================================
    var extraCharges = settings.extraCharges || [];
    var currentQuarterNum = Math.floor((evalMonth - 1) / 3) + 1;
    var currentQuarterPeriod = evalYear + '-Q' + currentQuarterNum;

    extraCharges.forEach(function(ec) {
      if (!ec.id || !ec.amount || parseFloat(ec.amount) <= 0) return;
      var interval = ec.interval || ec.type || 'one-time';
      if (interval === 'annual') interval = 'custom';
      var amt = parseFloat(ec.amount);
      var feeHeadId = ec.feeHeadId || 'fh_extra';
      var dueDay = parseInt(ec.dueDay, 10) || 5;
      if (dueDay < 1) dueDay = 1;
      if (dueDay > 28) dueDay = 28;

      var targetedStudents = activeStudents.filter(function(s) {
        if (!ec.targetClasses || ec.targetClasses === 'all' || ec.targetClasses.length === 0) return true;
        if (Array.isArray(ec.targetClasses)) return ec.targetClasses.indexOf(s.class) !== -1;
        return ec.targetClasses === s.class;
      });
      if (targetedStudents.length === 0) return;

      if (interval === 'one-time') {
        if (ec.lastBilledPeriod === 'billed') return;
        var startD = ec.startDate || '1970-01-01';
        if (evalDateStr >= startD) {
          targetedStudents.forEach(function(s) {
            var alreadyBilled = (self.store.fees || []).some(function(f) {
              return f.studentId === s.id && f.extraChargeId === ec.id;
            });
            if (alreadyBilled) return;

            result.extraChargeDues.push({
              id: self.generateId(),
              studentId: s.id,
              schoolId: self.currentSchoolId,
              type: 'due',
              feeHeadId: feeHeadId,
              amount: amt,
              date: ec.startDate || evalDateStr,
              description: ec.name + ' (One-time)',
              extraChargeId: ec.id,
              billingPeriod: 'one-time',
              timestamp: new Date().toISOString()
            });
          });
          result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: 'billed' });
        }
      } else if (interval === 'custom') {
        if (ec.lastBilledPeriod === 'billed') return;
        var startD = ec.startDate || '1970-01-01';
        if (evalDateStr >= startD) {
          targetedStudents.forEach(function(s) {
            var alreadyBilled = (self.store.fees || []).some(function(f) {
              return f.studentId === s.id && f.extraChargeId === ec.id;
            });
            if (alreadyBilled) return;

            result.extraChargeDues.push({
              id: self.generateId(),
              studentId: s.id,
              schoolId: self.currentSchoolId,
              type: 'due',
              feeHeadId: feeHeadId,
              amount: amt,
              date: ec.startDate || evalDateStr,
              description: ec.name,
              extraChargeId: ec.id,
              billingPeriod: ec.startDate || 'custom',
              timestamp: new Date().toISOString()
            });
          });
          result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: 'billed' });
        }
      } else if (interval === 'monthly') {
        var startPeriod = ec.startDate ? ec.startDate.substring(0, 7) : currentPeriod;
        var lastBilled = ec.lastBilledPeriod;
        var missed = [];

        if (!lastBilled) {
          if (!ec.allowBackfill) {
            // DEFAULT: Start billing from NEXT cycle!
            result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: currentPeriod });
          } else {
            // Explicit opt-in: Backfill missed periods capped at max 3
            var sParts = startPeriod.split('-');
            var sY = parseInt(sParts[0], 10);
            var sM = parseInt(sParts[1], 10);
            var candidateMonths = [];
            var loopY = sY;
            var loopM = sM;
            while (true) {
              var p = loopY + '-' + (loopM < 10 ? '0' + loopM : loopM);
              if (p > currentPeriod) break;
              candidateMonths.push({ period: p, year: loopY, month: loopM });
              loopM++;
              if (loopM > 12) { loopM = 1; loopY++; }
            }
            var rawCount = candidateMonths.length;
            if (rawCount > 3) {
              candidateMonths = candidateMonths.slice(-3);
              result.backfillWarnings.push({
                chargeId: ec.id,
                name: ec.name,
                missedCount: 3,
                rawCount: rawCount,
                capped: true,
                message: 'Backfill capped at max 3 periods for ' + ec.name + ' (' + rawCount + ' elapsed periods detected).'
              });
            } else if (rawCount > 0) {
              result.backfillWarnings.push({
                chargeId: ec.id,
                name: ec.name,
                missedCount: rawCount,
                rawCount: rawCount,
                capped: false,
                message: 'Backfill active: ' + rawCount + ' missed period(s) for ' + ec.name + '.'
              });
            }
            missed = candidateMonths;
            result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: currentPeriod });
          }
        } else if (currentPeriod > lastBilled) {
          var lbParts = lastBilled.split('-');
          var lbY = parseInt(lbParts[0], 10);
          var lbM = parseInt(lbParts[1], 10);
          var curMloop = lbM + 1;
          var curYloop = lbY;
          var runningCandidates = [];
          while (true) {
            if (curMloop > 12) { curMloop = 1; curYloop++; }
            var p = curYloop + '-' + (curMloop < 10 ? '0' + curMloop : curMloop);
            if (p > currentPeriod) break;
            runningCandidates.push({ period: p, year: curYloop, month: curMloop });
            curMloop++;
          }
          if (ec.allowBackfill && runningCandidates.length > 3) {
            var rawLen = runningCandidates.length;
            runningCandidates = runningCandidates.slice(-3);
            result.backfillWarnings.push({
              chargeId: ec.id,
              name: ec.name,
              missedCount: 3,
              rawCount: rawLen,
              capped: true,
              message: 'Backfill capped at max 3 periods for ' + ec.name + '.'
            });
          }
          missed = runningCandidates;
          result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: currentPeriod });
        }

        missed.forEach(function(m) {
          var mName = monthNames[m.month - 1];
          var chargeDayStr = dueDay < 10 ? '0' + dueDay : '' + dueDay;
          var cDate = m.year + '-' + (m.month < 10 ? '0' + m.month : m.month) + '-' + chargeDayStr;
          var desc = ec.name + ' - ' + mName + ' ' + m.year;

          targetedStudents.forEach(function(s) {
            var alreadyBilled = (self.store.fees || []).some(function(f) {
              return f.studentId === s.id && f.extraChargeId === ec.id && f.billingPeriod === m.period;
            });
            if (alreadyBilled) return;

            result.extraChargeDues.push({
              id: self.generateId(),
              studentId: s.id,
              schoolId: self.currentSchoolId,
              type: 'due',
              feeHeadId: feeHeadId,
              amount: amt,
              date: cDate,
              description: desc,
              extraChargeId: ec.id,
              billingPeriod: m.period,
              timestamp: new Date().toISOString()
            });
          });
        });
      } else if (interval === 'quarterly') {
        var lastBilledQ = ec.lastBilledPeriod;
        var missedQ = [];
        if (!lastBilledQ) {
          if (!ec.allowBackfill) {
            result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: currentQuarterPeriod });
          } else {
            var startD = ec.startDate || evalDateStr;
            var sYear = parseInt(startD.substring(0, 4), 10);
            var sMonth = parseInt(startD.substring(5, 7), 10);
            var sQ = Math.floor((sMonth - 1) / 3) + 1;

            var qCandidates = [];
            var yLoop = sYear;
            var qLoop = sQ;
            while (true) {
              var qStr = yLoop + '-Q' + qLoop;
              if (qStr > currentQuarterPeriod) break;
              qCandidates.push({ period: qStr, year: yLoop, quarter: qLoop });
              qLoop++;
              if (qLoop > 4) { qLoop = 1; yLoop++; }
            }
            if (qCandidates.length > 3) {
              var rawQLen = qCandidates.length;
              qCandidates = qCandidates.slice(-3);
              result.backfillWarnings.push({
                chargeId: ec.id,
                name: ec.name,
                missedCount: 3,
                rawCount: rawQLen,
                capped: true,
                message: 'Quarterly backfill capped at max 3 quarters for ' + ec.name + '.'
              });
            } else if (qCandidates.length > 0) {
              result.backfillWarnings.push({
                chargeId: ec.id,
                name: ec.name,
                missedCount: qCandidates.length,
                rawCount: qCandidates.length,
                capped: false,
                message: 'Quarterly backfill active: ' + qCandidates.length + ' quarter(s) for ' + ec.name + '.'
              });
            }
            missedQ = qCandidates;
            result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: currentQuarterPeriod });
          }
        } else if (currentQuarterPeriod > lastBilledQ) {
          var lbQParts = lastBilledQ.split('-Q');
          var lQy = parseInt(lbQParts[0], 10);
          var lQq = parseInt(lbQParts[1], 10);
          var qRun = lQq + 1;
          var yRun = lQy;
          var runningQ = [];
          while (true) {
            if (qRun > 4) { qRun = 1; yRun++; }
            var qStr = yRun + '-Q' + qRun;
            if (qStr > currentQuarterPeriod) break;
            runningQ.push({ period: qStr, year: yRun, quarter: qRun });
            qRun++;
          }
          if (ec.allowBackfill && runningQ.length > 3) {
            var rawQLen2 = runningQ.length;
            runningQ = runningQ.slice(-3);
            result.backfillWarnings.push({
              chargeId: ec.id,
              name: ec.name,
              missedCount: 3,
              rawCount: rawQLen2,
              capped: true,
              message: 'Quarterly backfill capped at max 3 quarters for ' + ec.name + '.'
            });
          }
          missedQ = runningQ;
          result.updatedExtraChargesState.push({ id: ec.id, lastBilledPeriod: currentQuarterPeriod });
        }

        missedQ.forEach(function(qObj) {
          var qMonths = { 1: 'Jan-Mar', 2: 'Apr-Jun', 3: 'Jul-Sep', 4: 'Oct-Dec' };
          var desc = ec.name + ' - Q' + qObj.quarter + ' (' + (qMonths[qObj.quarter] || '') + ' ' + qObj.year + ')';
          var startMonthOfQ = (qObj.quarter - 1) * 3 + 1;
          var chargeDayStr = dueDay < 10 ? '0' + dueDay : '' + dueDay;
          var cDate = qObj.year + '-' + (startMonthOfQ < 10 ? '0' + startMonthOfQ : startMonthOfQ) + '-' + chargeDayStr;

          targetedStudents.forEach(function(s) {
            var alreadyBilled = (self.store.fees || []).some(function(f) {
              return f.studentId === s.id && f.extraChargeId === ec.id && f.billingPeriod === qObj.period;
            });
            if (alreadyBilled) return;

            result.extraChargeDues.push({
              id: self.generateId(),
              studentId: s.id,
              schoolId: self.currentSchoolId,
              type: 'due',
              feeHeadId: feeHeadId,
              amount: amt,
              date: cDate,
              description: desc,
              extraChargeId: ec.id,
              billingPeriod: qObj.period,
              timestamp: new Date().toISOString()
            });
          });
        });
      }
    });

    // =========================================================================
    // 3. EVALUATE AUTOMATIC LATE FEES (Part B - Strictly One-Shot per Due)
    // =========================================================================
    var lateConfig = settings.lateFeeConfig || {};
    if (lateConfig.enabled === true) {
      var fineHeadId = lateConfig.feeHeadId || 'fh_fine';
      var graceDays = parseInt(lateConfig.gracePeriodDays, 10);
      if (isNaN(graceDays) || graceDays < 0) graceDays = 10;
      var fineType = lateConfig.type === 'percentage' ? 'percentage' : 'flat';
      var fineVal = parseFloat(lateConfig.value) || 0;
      var maxCap = parseFloat(lateConfig.maxCap) || 0;

      if (fineVal > 0) {
        var fees = this.store.fees || [];
        var finedDueIds = new Set();
        fees.forEach(function(f) {
          if (f.originatingDueId) finedDueIds.add(f.originatingDueId);
        });

        var allocationsByDue = {};
        var studentTotalPaid = {};
        var studentTotalDues = {};

        fees.forEach(function(f) {
          if (f.type === 'due') {
            studentTotalDues[f.studentId] = (studentTotalDues[f.studentId] || 0) + (parseFloat(f.amount) || 0);
          } else if (f.type === 'payment') {
            var grossSettled = (parseFloat(f.amount) || 0) + (parseFloat(f.discountAmount) || 0);
            studentTotalPaid[f.studentId] = (studentTotalPaid[f.studentId] || 0) + grossSettled;
            if (Array.isArray(f.allocations)) {
              f.allocations.forEach(function(a) {
                if (a.dueId) {
                  allocationsByDue[a.dueId] = (allocationsByDue[a.dueId] || 0) + (parseFloat(a.amount) || 0);
                }
              });
            }
          }
        });

        var activeStudentMap = {};
        activeStudents.forEach(function(s) { activeStudentMap[s.id] = s; });

        fees.forEach(function(due) {
          if (due.type !== 'due') return;
          if (!activeStudentMap[due.studentId]) return;
          if (due.feeHeadId === fineHeadId) return; // Do not fine a fine!
          if (due.originatingDueId) return; // Do not fine a fine transaction!
          if (finedDueIds.has(due.id)) return; // ONE-SHOT GUARANTEE: Already fined!

          var dueTime = new Date(due.date).getTime();
          if (isNaN(dueTime)) return;

          var overdueDeadline = dueTime + (graceDays * 86400000);
          if (evalDate.getTime() <= overdueDeadline) return; // Grace period active

          var studentDues = studentTotalDues[due.studentId] || 0;
          var studentPaid = studentTotalPaid[due.studentId] || 0;
          var netBalance = studentDues - studentPaid;
          if (netBalance <= 0) return; // Student owes 0 balance overall!

          var allocated = allocationsByDue[due.id] || 0;
          var dueAmt = parseFloat(due.amount) || 0;
          var dueUnpaid = Math.max(0, dueAmt - allocated);
          var effectiveUnpaid = Math.min(dueUnpaid, netBalance);
          if (effectiveUnpaid <= 0) return; // Fully settled

          var fine = 0;
          if (fineType === 'percentage') {
            fine = Math.round((effectiveUnpaid * fineVal) / 100);
          } else {
            fine = fineVal;
          }
          if (maxCap > 0 && fine > maxCap) fine = maxCap;
          if (fine <= 0) return;

          var fineTxn = {
            id: self.generateId(),
            studentId: due.studentId,
            schoolId: self.currentSchoolId,
            type: 'due',
            feeHeadId: fineHeadId,
            amount: fine,
            date: evalDateStr,
            description: 'Late Fee (' + (fineType === 'percentage' ? fineVal + '%' : '₹' + fineVal) + ') for ' + (due.description || 'Due (' + due.date + ')'),
            originatingDueId: due.id, // STRICT ONE-SHOT LINK
            timestamp: new Date().toISOString()
          };

          result.lateFeeDues.push(fineTxn);
          finedDueIds.add(due.id);
        });
      }
    }

    // =========================================================================
    // 4. AGGREGATE SUMMARY
    // =========================================================================
    result.allProjected = result.tuitionDues.concat(result.extraChargeDues).concat(result.lateFeeDues);
    result.summary.tuitionCount = result.tuitionDues.length;
    result.summary.tuitionTotal = result.tuitionDues.reduce(function(sum, d) { return sum + d.amount; }, 0);
    result.summary.extraChargesCount = result.extraChargeDues.length;
    result.summary.extraChargesTotal = result.extraChargeDues.reduce(function(sum, d) { return sum + d.amount; }, 0);
    result.summary.lateFeesCount = result.lateFeeDues.length;
    result.summary.lateFeesTotal = result.lateFeeDues.reduce(function(sum, d) { return sum + d.amount; }, 0);
    result.summary.grandTotalCount = result.allProjected.length;
    result.summary.grandTotalAmount = result.summary.tuitionTotal + result.summary.extraChargesTotal + result.summary.lateFeesTotal;

    return result;
  },

  // Dry-Run Preview: Pure read-only simulation, no writes or mutations
  previewAutoFeeReconciliation: async function(options) {
    return this.evaluateAutoFeeDues(options || {});
  },

  // Consolidated Auto-Fee Execution Engine
  runAutoFeeReconciliation: async function(options) {
    try {
      if (!this.store || !this.store.students || this.store.students.length === 0) return;

      var evalResult = this.evaluateAutoFeeDues(options || {});
      var newDueTxns = evalResult.allProjected;
      var currentPeriod = evalResult.currentPeriod;

      if (!this.store.settings) this.store.settings = {};
      var settings = this.store.settings;

      // Baseline initialization if tracking key is empty
      var isFirstInitialization = !settings.autoChargeLastRun && !this.store.lastAutomatedFeeRun;
      if (isFirstInitialization) {
        settings.autoChargeLastRun = currentPeriod;
        this.store.lastAutomatedFeeRun = currentPeriod;
        if (newDueTxns.length === 0) {
          await this.save(true);
          return;
        }
      }

      if (newDueTxns.length === 0) return;

      // Create backup before bulk creation
      this.createRestorePoint('Auto-Backup before Auto-Fee Reconciliation');

      // Update in-memory fee list
      if (!this.store.fees) this.store.fees = [];
      for (var i = 0; i < newDueTxns.length; i++) {
        this.store.fees.push(newDueTxns[i]);
      }

      // Restructured-aware persistence
      if (typeof this.saveFeeTransactions === 'function') {
        await this.saveFeeTransactions(newDueTxns, true);
      } else {
        await this.save(true);
      }

      // Update tracking keys
      settings.autoChargeLastRun = currentPeriod;
      this.store.lastAutomatedFeeRun = currentPeriod;

      // Update extra charges state
      if (evalResult.updatedExtraChargesState && evalResult.updatedExtraChargesState.length > 0) {
        var extraCharges = settings.extraCharges || [];
        evalResult.updatedExtraChargesState.forEach(function(up) {
          var found = extraCharges.find(function(ec) { return ec.id === up.id; });
          if (found) found.lastBilledPeriod = up.lastBilledPeriod;
        });
      }

      await this.save(true);

      var parts = [];
      if (evalResult.summary.tuitionCount > 0) parts.push(evalResult.summary.tuitionCount + ' Tuition dues (₹' + evalResult.summary.tuitionTotal + ')');
      if (evalResult.summary.extraChargesCount > 0) parts.push(evalResult.summary.extraChargesCount + ' Extra Charges (₹' + evalResult.summary.extraChargesTotal + ')');
      if (evalResult.summary.lateFeesCount > 0) parts.push(evalResult.summary.lateFeesCount + ' Late Fees (₹' + evalResult.summary.lateFeesTotal + ')');

      this.feesGeneratedMsg = 'Automated Billing Engine: Generated ' + parts.join(', ') + ' successfully.';

    } catch (e) {
      console.error('Error running Auto-Fee Engine:', e);
    }
  },

  // ---------- Authentication ----------
  login: async function(role, credentials) {
    this._loginInProgress = true;
    console.log("Login attempt started");

    // Ensure Firebase config is still correct and not accidentally changed
    if (!firebaseConfig || firebaseConfig.apiKey !== "AIzaSyAPKi-0EjMjsA9q60rwEHeI2T9HTWPGklo" || firebaseConfig.authDomain !== "ctrl-shift-solutions.firebaseapp.com") {
      console.error("Firebase config is incorrect or altered!");
    }

    // Verify that the auth module is properly initialized before login function is called
    if (typeof auth === 'undefined' || !auth) {
      console.error("Firebase Auth module not initialized!");
    }

    // HARD SECURITY GATE: Refuse authentication if tenant is not loaded or currentSchoolId is missing
    if (!this.tenantInitialized || !this.store || !this.store.currentSchoolId) {
      console.warn('[Auth Security] Login attempted before tenant data finished loading. Waiting for sync...');
      this.showLoader('Connecting to school...');
      var loadSuccess = await Promise.race([
        this.load(true),
        new Promise(function(resolve) { setTimeout(function() { resolve(false); }, 7000); })
      ]);
      if (!loadSuccess || !this.tenantInitialized || !this.store || !this.store.currentSchoolId) {
        this.hideLoader();
        this.enableLoginButton();
        var btnTxt = document.getElementById('login-btn-text');
        if (btnTxt) btnTxt.textContent = 'Retry Sign In';
        throw new Error('School system could not connect. Please check your internet connection and try again.');
      }
    }

    this.showLoader('Loading...');
    // ALWAYS load fresh from Firestore first as source of truth
    await this.load(true);
    var schoolData = this.store;

    // CREDENTIAL-CHECK FRESHNESS FIX: this.load() resolves on the first
    // onSnapshot event for the tenant document, which can — after a very
    // recent password change from Super Admin — briefly replay a cached
    // version from the Firestore client SDK's own internal watch cache
    // (a page-lifetime singleton) before the live update reconciles. That
    // is fine for normal app usage, but for a LOGIN it means the OLD
    // password can keep "working" (and the new one keep failing) for an
    // unpredictable stretch. Force one direct, uncached server read of the
    // tenant document specifically for the auth check, so login always
    // validates against the true current password.
    if (schoolData && schoolData.currentSchoolId && window.firestore && window.firestore.getDocFromServer) {
      try {
        var freshSnap = await window.firestore.getDocFromServer(window.firestore.doc(window.db, 'tenant_data', schoolData.currentSchoolId));
        if (freshSnap.exists()) {
          schoolData = Object.assign({}, schoolData, freshSnap.data());
        }
      } catch (freshErr) {
        console.warn('Could not force a fresh server read for login (likely offline) — falling back to cached data:', freshErr && freshErr.code);
      }
    }

    let firebaseResult = null;
    let firebaseError = null;

    console.log("Firebase auth called");
    try {
      const email = role === 'admin' ? 
        (credentials.username.includes('@') ? credentials.username : `${credentials.username}@ctrlshifts.in`) : 
        credentials.email;
      const password = credentials.password;

      firebaseResult = await signInWithEmailAndPassword(auth, email, password);
      console.log("Success/Error: " + JSON.stringify(firebaseResult));
    } catch (err) {
      firebaseError = err;
      console.log("Success/Error: " + (err.code || err.message || err));
    }

    if (!schoolData || !schoolData.currentSchoolId || !this.tenantInitialized) {
      this.hideLoader();
      this.enableLoginButton();
      var btnTxtPost = document.getElementById('login-btn-text');
      if (btnTxtPost) btnTxtPost.textContent = 'Retry Sign In';
      throw new Error('School system could not connect. Please check your internet connection and try again.');
    }

    let customResult = null;
    if (role === 'admin') {
      customResult = await AuthUtils.login("admin", credentials.username, credentials.password, schoolData);
    } else if (role === 'teacher') {
      customResult = await AuthUtils.login("teacher", credentials.email, credentials.password, schoolData);
    }

    this.hideLoader();

    if ((firebaseResult && firebaseResult.user) || (customResult && customResult.success)) {
      if (role === 'admin') {
        const userObj = (customResult && customResult.user) ? customResult.user : {};
        this.currentUser = {
          id: 'admin',
          firstName: userObj.firstName || 'Admin',
          lastName: userObj.lastName || 'User',
          role: 'admin'
        };
      } else if (role === 'teacher') {
        const teacher = (customResult && customResult.user) ? customResult.user : {};
        var classTeacherOf = Array.isArray(teacher.classTeacherOf) ? teacher.classTeacherOf : (teacher.assignedClasses && teacher.assignedClasses.length > 0 ? [teacher.assignedClasses[0]] : []);
        var subjectTeacherOf = Array.isArray(teacher.subjectTeacherOf) ? teacher.subjectTeacherOf : (teacher.assignedClasses || []).map(function(ac) {
          return { class: ac.class, section: ac.section, subject: teacher.subject };
        });

        this.currentUser = {
          id: teacher.id || 'teacher',
          firstName: teacher.firstName || 'Teacher',
          lastName: teacher.lastName || '',
          role: 'teacher',
          email: teacher.email || credentials.email,
          subject: teacher.subject || '',
          assignedClasses: teacher.assignedClasses || [],
          classTeacherOf: classTeacherOf,
          subjectTeacherOf: subjectTeacherOf
        };
      }
      this.applyUserTheme();
      this._loginInProgress = false;
      return true;
    } else {
      this._loginInProgress = false;
      // Prioritize firebaseError if any, fallback to custom error
      const finalError = firebaseError || new Error((customResult && customResult.message) ? customResult.message : "Invalid credentials.");
      throw finalError;
    }
  },

  logout: function() {
    this.adminIsDirty = false;
    this.currentUser = null;
    this.currentPage = 'dashboard';
    
    // Hard session teardown: unsubscribe listeners, clear caches and reset store
    this.resetTenantSession('');

    if (this.schoolsListenerUnsubscribe) {
      try { this.schoolsListenerUnsubscribe(); } catch (e) {}
      this.schoolsListenerUnsubscribe = null;
    }

    // Reset sidebar nav to default template
    var navContainer = document.querySelector('.sidebar-nav');
    if (navContainer && this.sidebarNavTemplate) {
      navContainer.innerHTML = this.sidebarNavTemplate;
    }
    
    // Clear any cached school/tenant data from localStorage (keep only theme preference)
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var key = localStorage.key(i);
      if (key && !key.startsWith('erp_theme_preference') && key !== 'sa_theme') {
        localStorage.removeItem(key);
      }
    }
    
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('isImpersonating');
    }
    var banner = document.getElementById('impersonation-banner');
    if (banner && typeof banner.remove === 'function') banner.remove();
    var appLayout = document.getElementById('app-layout');
    if (appLayout) appLayout.style.marginTop = '';
    document.getElementById('app-layout').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
    // Reset login form
    var loginForm = document.getElementById('login-form');
    if (loginForm && typeof loginForm.reset === 'function') {
      loginForm.reset();
    }
    
    this.applyUserTheme();
    
    // Security reset: Clear the store fully to prevent any residual data leak
    this.store = this.getInitialStore();
    
    // Restore school branding
    this.updateBrandUI();
  },

  showMyProfileModal: function() {
    var self = this;
    var user = this.currentUser;
    if (!user) return;

    var bodyHTML = '<form id="my-profile-form" class="form-grid">';
    
    if (this.isAdmin()) {
      var settings = this.store.settings;
      bodyHTML += '<div class="form-group"><label class="form-label">Username *</label><input type="text" class="form-input" name="adminUsername" value="' + (settings.adminUsername || 'admin') + '" required></div>';
      bodyHTML += '<div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-input" name="email" value="' + (settings.email || '') + '" required></div>';
      bodyHTML += '<div class="form-group"><label class="form-label">Phone *</label><input type="text" class="form-input" name="phone" value="' + (settings.phone || '') + '" required></div>';
      bodyHTML += '<div class="form-group"><label class="form-label">Password *</label><div class="password-wrapper"><input type="password" class="form-input" name="adminPassword" value="' + (settings.adminPassword || '') + '" required><i class="fa fa-eye toggle-password"></i></div></div>';
    } else {
      // Teacher
      var teacher = this.store.teachers.find(function(t) { return t.id === user.id; });
      if (!teacher) {
        self.showToast('Profile error: teacher record not found.', 'error');
        return;
      }
      bodyHTML += '<div class="form-group"><label class="form-label">First Name *</label><input type="text" class="form-input" name="firstName" value="' + (teacher.firstName || '') + '" required></div>';
      bodyHTML += '<div class="form-group"><label class="form-label">Last Name *</label><input type="text" class="form-input" name="lastName" value="' + (teacher.lastName || '') + '" required></div>';
      bodyHTML += '<div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-input" name="email" value="' + (teacher.email || '') + '" required></div>';
      bodyHTML += '<div class="form-group"><label class="form-label">Phone *</label><input type="text" class="form-input" name="phone" value="' + (teacher.phone || '') + '" required></div>';
      bodyHTML += '<div class="form-group"><label class="form-label">Password *</label><div class="password-wrapper"><input type="password" class="form-input" name="password" value="' + (teacher.password || '') + '" required><i class="fa fa-eye toggle-password"></i></div></div>';
    }
    
    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="my-profile-save-btn"><span class="material-icons-round">save</span> Save Changes</button>';

    this.showModal('My Profile', bodyHTML, footerHTML);

    document.getElementById('my-profile-save-btn').addEventListener('click', async function() {
      var form = document.getElementById('my-profile-form');
      if (!form) return;

      var inputs = form.querySelectorAll('input');
      var valid = true;
      var fields = {};
      inputs.forEach(function(input) {
        var val = input.value.trim();
        fields[input.name] = val;
        if (input.required && !val) {
          input.closest('.form-group').classList.add('error');
          valid = false;
        } else {
          input.closest('.form-group').classList.remove('error');
        }
      });

      if (!valid) {
        self.showToast('Please fill all required fields correctly.', 'error');
        return;
      }

      if (self.isAdmin()) {
        self.store.settings.adminUsername = fields.adminUsername;
        self.store.settings.email = fields.email;
        self.store.settings.phone = fields.phone;
        if (fields.adminPassword && !AuthUtils.isHashed(fields.adminPassword)) {
          self.store.settings.adminPassword = await AuthUtils.hashPassword(fields.adminPassword);
        } else {
          self.store.settings.adminPassword = fields.adminPassword;
        }
        self.currentUser.firstName = fields.adminUsername;
        self.currentUser.email = fields.email;
      } else {
        // Teacher
        var teacherIdx = self.store.teachers.findIndex(function(t) { return t.id === user.id; });
        if (teacherIdx !== -1) {
          if (fields.password && !AuthUtils.isHashed(fields.password)) {
            fields.password = await AuthUtils.hashPassword(fields.password);
          }
          Object.assign(self.store.teachers[teacherIdx], fields);
          // Sync currentUser
          self.currentUser.firstName = fields.firstName;
          self.currentUser.lastName = fields.lastName;
          self.currentUser.email = fields.email;
        }
      }

      self.save();
      // Update UI displays
      var initials = self.getInitials(self.currentUser.firstName, self.currentUser.lastName);
      var headerAvatarEl = document.getElementById('header-avatar');
      if (headerAvatarEl) {
        headerAvatarEl.textContent = initials;
      }
      var sidebarAvatarEl = document.getElementById('sidebar-avatar');
      if (sidebarAvatarEl) {
        sidebarAvatarEl.textContent = initials;
      }
      var sidebarNameEl = document.getElementById('sidebar-user-name');
      if (sidebarNameEl) {
        sidebarNameEl.textContent = self.currentUser.firstName + ' ' + (self.currentUser.lastName || '');
      }

      self.showToast('Profile details updated successfully.', 'success');
      self.closeModal();
      
      // If current page is dashboard, re-render it
      if (self.currentPage === 'dashboard') {
        self.renderDashboard();
      }
    });
  },

  isAdmin: function() {
    return this.currentUser && this.currentUser.role === 'admin';
  },

  isTeacher: function() {
    return this.currentUser && this.currentUser.role === 'teacher';
  },

  sidebarNavTemplate: null,

  renderSidebarNav: function() {
    var navContainer = document.querySelector('.sidebar-nav');
    if (!navContainer) return;

    if (!this.sidebarNavTemplate) {
      this.sidebarNavTemplate = navContainer.innerHTML;
    }

    var parser = new DOMParser();
    var doc = parser.parseFromString('<nav class="sidebar-nav">' + this.sidebarNavTemplate + '</nav>', 'text/html');
    var navItems = doc.querySelectorAll('.nav-item');

    var self = this;
    navItems.forEach(function(item) {
      var page = item.getAttribute('data-page');
      var shouldRemove = false;

      if (self.isTeacher()) {
        if (page === 'fees' || page === 'admin' || page === 'teachers') {
          shouldRemove = true;
        }
      }

      if (shouldRemove) {
        item.remove();
      }
    });

    navContainer.innerHTML = doc.querySelector('.sidebar-nav').innerHTML;

    // Re-attach click event listeners to the new nav items
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        var page = this.getAttribute('data-page');
        if (page && !self.checkFeatureAccess(page)) {
          e.preventDefault();
          e.stopPropagation();
          self.showUpsellModal(page);
          return;
        }
        e.preventDefault();
        if (page) {
          self.navigate(page);
        }
      });
    });

    this.updateSidebarLockBadges();
  },

  // ---------- Navigation ----------
  navigate: function(pageName, fromHistory) {
    var self = this;
    if (this.adminIsDirty && pageName !== this.currentPage) {
      this.pendingNavigation = { page: pageName, fromHistory: fromHistory };
      this.confirmUnsavedChanges(function() {
        self.navigate(pageName, fromHistory);
      });
      return;
    }

    // Graceful redirection of old support route to unified help route
    if (pageName === 'support') {
      pageName = 'help';
    }

    // Strict role check
    var adminOnlyPages = ['admin', 'fees'];
    if (this.isTeacher() && pageName === 'teachers') {
      this.showToast('Access Denied: You do not have permission to view this page.', 'error');
      this.navigate('dashboard');
      return;
    }
    if (adminOnlyPages.indexOf(pageName) !== -1 && !this.isAdmin()) {
      this.showToast('Access Denied: You do not have permission to view this page.', 'error');
      this.navigate('dashboard');
      return;
    }

    // Strict paywall logic
    if (pageName && !this.checkFeatureAccess(pageName)) {
      this.showUpsellModal(pageName);
      return;
    }

    // Call cleanup of current module before navigating away
    var oldPage = this.currentPage;
    if (oldPage && this.modules[oldPage] && typeof this.modules[oldPage].cleanup === 'function') {
      try {
        console.log("Cleaning up module: " + oldPage);
        this.modules[oldPage].cleanup();
      } catch (e) {
        console.error("Error during module cleanup:", e);
      }
    }

    // Manage HTML5 History API
    if (this.currentUser && window.history) {
      if (!fromHistory) {
        if (pageName === 'dashboard') {
          window.history.replaceState({page: 'dashboard'}, '', '#dashboard');
        } else {
          var tab = undefined;
          if (pageName === 'admin') {
            var adminModule = this.modules['admin'];
            if (adminModule && typeof adminModule.getActiveTab === 'function') {
              tab = adminModule.getActiveTab() || 'settings';
            }
          }
          var hash = (pageName === 'admin' && tab && tab !== 'settings') ? '#admin-' + tab : '#' + pageName;
          if (oldPage && oldPage !== 'dashboard' && oldPage !== 'login') {
            window.history.replaceState({page: pageName, tab: tab}, '', hash);
          } else {
            window.history.pushState({page: pageName, tab: tab}, '', hash);
          }
        }
      }
    }

    this.currentPage = pageName;


    // Hide all pages
    var pages = document.querySelectorAll('.page');
    pages.forEach(function(p) { p.classList.remove('active'); });

    // Show target page
    var target = document.getElementById('page-' + pageName);
    if (target) target.classList.add('active');

    // Update sidebar
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-page') === pageName);
    });

    // Update header
    var titles = {
      dashboard: 'Dashboard',
      students: 'Students',
      teachers: 'Teachers',
      attendance: 'Attendance',
      fees: 'Fee Management',
      timetable: 'Timetable Management',
      exams: 'Exams',
      admin: 'Admin Panel',
      help: 'Help & Support',
      'teacher-attendance': 'Teacher Attendance'
    };
    var pageTitle = titles[pageName] || 'Dashboard';
    if (pageName === 'exams' && !this.isAdmin()) {
      pageTitle = 'Marks Entry';
    }
    this.updateHeader(pageTitle);
    this.updateBrandUI();

    // Toggle floating Contact Admin button visibility (only on unified help page)
    var contactBtn = document.getElementById('contact-admin-btn');
    if (contactBtn) {
      contactBtn.style.display = (pageName === 'help') ? 'flex' : 'none';
    }

    // Render module with transition loader
    var self = this;
    if (pageName === 'dashboard') {
      this.showLoader('Loading...');
      setTimeout(function() {
        self.renderDashboard();
        self.hideLoader();
      }, 200);
    } else if (this.modules[pageName] && this.modules[pageName].render) {
      this.showLoader('Loading...');
      setTimeout(function() {
        self.modules[pageName].render();
        self.hideLoader();
      }, 200);
    }

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('mobile-open');
  },

  updateDirtyIndicator: function() {
    var existingDots = document.querySelectorAll('.dirty-dot');
    existingDots.forEach(function(dot) {
      dot.remove();
    });

    if (this.adminIsDirty) {
      var activeTabBtn = document.querySelector('.admin-sidebar .tab-btn.active');
      if (activeTabBtn) {
        var dot = document.createElement('span');
        dot.className = 'dirty-dot';
        dot.style.color = '#f97316';
        dot.style.marginLeft = '6px';
        dot.style.fontSize = '18px';
        dot.style.lineHeight = '1';
        dot.style.verticalAlign = 'middle';
        dot.innerHTML = '•';
        activeTabBtn.appendChild(dot);
      }
    }
  },

  markAdminDirty: function(e) {
    var target = e.target;
    if (!target) return;

    var excludedIds = [
      'admin-exams-term-select',
      'admin-exams-class-select',
      'promotion-source-class',
      'promotion-dest-class',
      'txn-search',
      'txn-start-date',
      'txn-end-date'
    ];
    if (excludedIds.indexOf(target.id) !== -1) {
      return;
    }

    if (target.classList.contains('promotion-student-cb') || target.id === 'promotion-toggle-all') {
      return;
    }

    this.adminIsDirty = true;
    this.updateDirtyIndicator();
  },

  triggerAdminSave: function() {
    var adminModule = this.modules['admin'];
    var activeTab = adminModule ? adminModule.getActiveTab() : 'settings';
    var saveBtn = null;
    
    if (activeTab === 'settings') {
      saveBtn = document.getElementById('save-settings-btn');
    } else if (activeTab === 'users') {
      saveBtn = document.getElementById('save-admin-creds');
    } else if (activeTab === 'fees') {
      saveBtn = document.getElementById('setup-save-fees-btn') || document.getElementById('setup-save-charges-btn');
    } else if (activeTab === 'notices') {
      saveBtn = document.getElementById('admin-notice-submit-btn');
    }

    if (saveBtn) {
      saveBtn.click();
    } else {
      // Fallback if no button found
      this.adminIsDirty = false;
      this.updateDirtyIndicator();
      if (this.onSaveSuccessNavigate) {
        var cb = this.onSaveSuccessNavigate;
        this.onSaveSuccessNavigate = null;
        cb();
      }
    }
  },

  confirmUnsavedChanges: function(onProceed) {
    var dialog = document.getElementById('unsaved-changes-dialog');
    if (!dialog) {
      this.adminIsDirty = false;
      if (onProceed) onProceed();
      return;
    }

    dialog.classList.add('active');

    var saveBtn = document.getElementById('unsaved-save-btn');
    var discardBtn = document.getElementById('unsaved-discard-btn');
    var stayBtn = document.getElementById('unsaved-stay-btn');
    var self = this;

    function cleanup() {
      dialog.classList.remove('active');
      var newSave = saveBtn.cloneNode(true);
      var newDiscard = discardBtn.cloneNode(true);
      var newStay = stayBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSave, saveBtn);
      discardBtn.parentNode.replaceChild(newDiscard, discardBtn);
      stayBtn.parentNode.replaceChild(newStay, stayBtn);
    }

    document.getElementById('unsaved-save-btn').addEventListener('click', function() {
      cleanup();
      self.onSaveSuccessNavigate = function() {
        if (onProceed) onProceed();
      };
      self.triggerAdminSave();
    }, { once: true });

    document.getElementById('unsaved-discard-btn').addEventListener('click', function() {
      cleanup();
      self.adminIsDirty = false;
      self.updateDirtyIndicator();
      if (onProceed) onProceed();
    }, { once: true });

    document.getElementById('unsaved-stay-btn').addEventListener('click', function() {
      cleanup();
      if (self.pendingNavigation && self.pendingNavigation.fromHistory) {
        var prevHash = (self.currentPage === 'admin' && self.lastCleanTab && self.lastCleanTab !== 'settings') ? '#admin-' + self.lastCleanTab : '#' + self.currentPage;
        window.history.pushState({page: self.currentPage, tab: self.lastCleanTab}, '', prevHash);
      }
      self.pendingNavigation = null;
    }, { once: true });
  },

  updateHeader: function(title) {
    var el = document.getElementById('header-title');
    if (el) el.textContent = title;
  },

  // ---------- UI Utilities ----------
  showToast: function(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;

    // Log system action to notifications store
    if (this.store) {
      if (!this.store.notifications) this.store.notifications = [];
      
      this.store.notifications.unshift({
        id: this.generateId(),
        message: message,
        type: type,
        timestamp: new Date().toISOString(),
        read: false
      });

      // Keep only last 50 logs
      if (this.store.notifications.length > 50) {
        this.store.notifications = this.store.notifications.slice(0, 50);
      }

      this.updateNotificationBadge();
      
      // If dropdown is open, re-render it in real time
      var dropdown = document.getElementById('notification-dropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        this.renderNotificationDropdown();
      }
    }

    var container = document.getElementById('toast-container');
    var icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML =
      '<div class="toast-icon"><span class="material-icons-round">' + icons[type] + '</span></div>' +
      '<div class="toast-content"><div class="toast-message">' + message + '</div></div>' +
      '<button class="toast-close" onclick="this.closest(\'.toast\').remove()"><span class="material-icons-round">close</span></button>' +
      '<div class="toast-progress" style="animation-duration: ' + duration + 'ms"></div>';

    container.appendChild(toast);

    setTimeout(function() {
      toast.classList.add('removing');
      setTimeout(function() { toast.remove(); }, 300);
    }, duration);
  },

  showModal: function(title, bodyHTML, footerHTML) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML || '';
    document.getElementById('modal-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeModal: function() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
    var container = document.getElementById('modal-container');
    if (container) {
      container.style.maxWidth = '';
    }
  },

  showConfirm: function(message, onConfirm, title) {
    var dialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-message').textContent = message;
    if (title) document.getElementById('confirm-title').textContent = title;
    dialog.classList.add('active');

    var confirmBtn = document.getElementById('confirm-ok');
    var cancelBtn = document.getElementById('confirm-cancel');

    function cleanup() {
      dialog.classList.remove('active');
      confirmBtn.replaceWith(confirmBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    }

    confirmBtn.addEventListener('click', function() {
      cleanup();
      if (onConfirm) onConfirm();
    }, { once: true });

    cancelBtn.addEventListener('click', function() {
      cleanup();
    }, { once: true });
  },

  checkFeatureAccess: function(page) {
    // PAUSED (2026-09-12): Per-school Pro/locked-feature paywall is switched
    // off for now — every school gets every feature by default until this is
    // explicitly turned back on. The original allowed_features check is kept
    // below, unreachable, so re-enabling later is a one-line revert (delete
    // this early return) rather than rebuilding the gating logic from scratch.
    return true;

    if (page === 'admin') return true;
    if (page === 'teacher-attendance') {
      return true;
    }
    if (!this.store.schools) return true;
    var currentSchoolId = (this.store && this.store.currentSchoolId) || "";
    var school = this.store.schools.find(function(s) { return s.school_id === currentSchoolId; });
    if (!school) return true;
    if (school.allowed_features && school.allowed_features.indexOf(page) === -1) {
      return false;
    }
    return true;
  },

  updateSidebarLockBadges: function() {
    var self = this;
    var currentSchoolId = (this.store && this.store.currentSchoolId) || "";
    var isSVM = currentSchoolId === "svm_bokaro_001";

    document.querySelectorAll('.nav-item').forEach(function(item) {
      var page = item.getAttribute('data-page');
      
      // Remove any existing badges
      var existingLockBadge = item.querySelector('.sidebar-lock-badge');
      if (existingLockBadge) existingLockBadge.remove();
      var existingProBadge = item.querySelector('.pro-badge');
      if (existingProBadge) existingProBadge.remove();
      
      // SVM must show zero badges
      if (isSVM) {
        return;
      }
      
      if (page && !self.checkFeatureAccess(page)) {
        var badge = document.createElement('span');
        badge.className = 'badge badge-warning sidebar-lock-badge pro-badge';
        badge.style.cssText = 'margin-left: auto; font-size: 10px; padding: 2px 6px; background-color: var(--warning) !important; color: #000; border-radius: 4px; font-weight: bold; display: inline-block;';
        badge.innerHTML = '🔒 Pro';
        item.appendChild(badge);
      }
    });
  },

  showUpsellModal: function(page) {
    var titles = {
      students: 'Advanced Student Admissions & Roster',
      teachers: 'Teacher Grid & Qualification Matrix',
      attendance: 'GPS Geofenced Attendance Tracker',
      fees: 'Multi-Tenant Fee Setup & Ledgers',
      timetable: '1-Click Automated AI Timetable Scheduler',
      exams: 'Official Marksheets & Printable Report Cards'
    };
    var featureName = titles[page] || page;
    
    var modal = document.getElementById('upsell-modal');
    if (!modal) return;
    
    var element = document.getElementById('upsell-feature-name');
    if (element) element.innerText = featureName;
    
    modal.classList.add('active');
  },

  toggleNotificationDropdown: function() {
    var dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    
    var isHidden = dropdown.classList.contains('hidden');
    
    if (isHidden) {
      // Mark all logs as read
      if (this.store && this.store.notifications) {
        this.store.notifications.forEach(function(n) { n.read = true; });
        this.save(true);
        this.updateNotificationBadge();
      }
      
      this.renderNotificationDropdown();
      dropdown.classList.remove('hidden');
    } else {
      dropdown.classList.add('hidden');
    }
  },
  
  isNoticeVisibleForUser: function(notice) {
    if (!notice || notice.status !== 'published') return false;
    if (this.isAdmin()) return true;

    var aud = notice.audience || ['everyone'];
    if (!Array.isArray(aud)) aud = [aud];

    if (this.isTeacher()) {
      return aud.indexOf('everyone') !== -1 || aud.indexOf('teachers') !== -1;
    }

    return aud.indexOf('everyone') !== -1 || aud.indexOf('students') !== -1;
  },

  renderNotificationDropdown: function() {
    if (!this.assertSchoolIsolation(this.store.notifications, this.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected!");
      this.showToast("Security error. Please logout and login again.", "error");
      this.logout();
      return;
    }
    var dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    
    var html = '';
    
    // Header
    html += '<div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; background: rgba(18, 18, 28, 0.4);">';
    html += '<span style="font-weight: 700; font-size: 13px; color: var(--text-primary);">Action Center</span>';
    html += '<span style="font-size: 11px; color: var(--accent-secondary); cursor: pointer;" onclick="SchoolApp.clearNotifications()">Clear All</span>';
    html += '</div>';
    
    html += '<div style="max-height: 380px; overflow-y: auto;">';
    
    // Section A: Recent Notices (3 most recently published)
    html += '<div style="padding: 10px 16px 4px 16px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.03);">Recent Notices</div>';
    
    var self = this;
    var noticesList = (this.store.notices || []).filter(function(n) {
      return self.isNoticeVisibleForUser(n);
    });
    noticesList = noticesList.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    }).slice(0, 3);
    
    if (noticesList.length > 0) {
      noticesList.forEach(function(n) {
        var priorityBg = n.priority === 'Urgent' ? 'rgba(239, 83, 80, 0.15)' : 'rgba(108, 92, 231, 0.15)';
        var priorityText = n.priority === 'Urgent' ? '#ef5350' : '#6c5ce7';
        html += '<div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; flex-direction: column; gap: 4px;">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">';
        html += '<span style="font-weight: 600; font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">' + n.title + '</span>';
        html += '<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ' + priorityBg + '; color: ' + priorityText + '; font-weight: 700;">' + n.priority + '</span>';
        html += '</div>';
        html += '<p style="margin: 0; font-size: 11px; color: var(--text-secondary); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">' + n.message + '</p>';
        html += '<span style="font-size: 9px; color: var(--text-muted);">' + SchoolApp.formatDate(n.date) + '</span>';
        html += '</div>';
      });
    } else {
      html += '<div style="padding: 16px; text-align: center; font-size: 11px; color: var(--text-muted);">No active notices.</div>';
    }
    
    // Section B: Recent System Action Logs (5 most recent)
    html += '<div style="padding: 12px 16px 4px 16px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.03); margin-top: 4px;">System Action Logs</div>';
    
    var logs = (this.store.notifications || []).slice(0, 5);
    if (logs.length > 0) {
      logs.forEach(function(l) {
        var timeAgo = SchoolApp.formatTimeAgo(l.timestamp);
        var icon = 'info';
        var iconColor = 'var(--accent-secondary)';
        if (l.type === 'success') {
          icon = 'check_circle';
          iconColor = 'var(--success)';
        } else if (l.type === 'error') {
          icon = 'error';
          iconColor = 'var(--danger)';
        } else if (l.type === 'warning') {
          icon = 'warning';
          iconColor = 'var(--warning)';
        }
        
        html += '<div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; gap: 10px; align-items: flex-start;">';
        html += '<span class="material-icons-round" style="font-size: 15px; color: ' + iconColor + '; margin-top: 1px;">' + icon + '</span>';
        html += '<div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">';
        html += '<span style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">' + l.message + '</span>';
        html += '<span style="font-size: 9px; color: var(--text-muted);">' + timeAgo + '</span>';
        html += '</div>';
        html += '</div>';
      });
    } else {
      html += '<div style="padding: 16px; text-align: center; font-size: 11px; color: var(--text-muted);">No system actions recorded.</div>';
    }
    
    html += '</div>';
    
    dropdown.innerHTML = html;
  },
  
  clearNotifications: function() {
    if (this.store) {
      this.store.notifications = [];
      this.save(true);
      this.updateNotificationBadge();
      this.renderNotificationDropdown();
    }
  },
  
  updateNotificationBadge: function() {
    var badge = document.getElementById('notification-badge');
    if (!badge) return;
    
    var unreadCount = 0;
    if (this.store && this.store.notifications) {
      unreadCount = this.store.notifications.filter(function(n) { return !n.read; }).length;
    }
    
    badge.textContent = unreadCount;
    badge.style.display = unreadCount === 0 ? 'none' : 'flex';
  },
  
  formatTimeAgo: function(isoString) {
    if (!isoString) return '';
    var date = new Date(isoString);
    var seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return 'Just now';
    var interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval + ' yr ago';
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return interval + ' mo ago';
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return interval + ' d ago';
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return interval + ' hr ago';
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return interval + ' min ago';
    return seconds + ' sec ago';
  },

  normalizeAttendanceRecords: function(records) {
    if (Array.isArray(records)) return records;
    if (records && typeof records === 'object') {
      return Object.keys(records).map(function(k) {
        var val = records[k];
        var status = 'absent';
        if (typeof val === 'string') {
          var vLower = val.toLowerCase().trim();
          if (vLower === 'p' || vLower === 'present') status = 'present';
          else if (vLower === 'l' || vLower === 'late') status = 'late';
          else if (vLower === 'a' || vLower === 'absent') status = 'absent';
          else status = val;
        } else if (val && typeof val === 'object' && val.status) {
          status = val.status;
        }
        return { studentId: k, status: status };
      });
    }
    return [];
  },

  formatDate: function(dateStr) {
    if (!dateStr) return '—';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  },

  getPeriodTimeStr: function(p, day) {
    var settings = (this.store && this.store.timetable && this.store.timetable.settings) || {
      startTime: "08:00",
      endTime: "14:00",
      totalPeriods: 8,
      lunchAfterPeriod: 4,
      lunchDuration: 30,
      satStartTime: "08:00",
      satEndTime: "12:30",
      satTotalPeriods: 6,
      satLunchAfterPeriod: 0
    };

    var isSaturday = false;
    if (day) {
      var dStr = String(day).toLowerCase().trim();
      if (dStr === 'saturday' || dStr === 'sat' || dStr === '6') {
        isSaturday = true;
      }
    }

    var startTime = isSaturday ? (settings.satStartTime || "08:00") : (settings.startTime || "08:00");
    var endTime = isSaturday ? (settings.satEndTime || "12:30") : (settings.endTime || "14:00");
    var totalPeriods = parseInt(isSaturday ? (settings.satTotalPeriods || 6) : (settings.totalPeriods || 8)) || 8;
    var lunchAfter = parseInt(isSaturday ? settings.satLunchAfterPeriod : settings.lunchAfterPeriod);
    if (isNaN(lunchAfter)) lunchAfter = 0;
    var lunchDur = parseInt(isSaturday ? (settings.satLunchDuration !== undefined ? settings.satLunchDuration : (settings.lunchDuration || 0)) : (settings.lunchDuration || 0));
    if (isNaN(lunchDur)) lunchDur = 0;

    function timeToMin(timeStr) {
      var parts = String(timeStr || "08:00").split(':');
      var hours = parseInt(parts[0]) || 0;
      var minutes = parseInt(parts[1]) || 0;
      return hours * 60 + minutes;
    }

    var startMin = timeToMin(startTime);
    var endMin = timeToMin(endTime);
    var effectiveLunchDur = (lunchAfter > 0 && lunchAfter < totalPeriods) ? lunchDur : 0;
    
    var totalAvailMin = endMin - startMin;
    var totalTeachingMin = totalAvailMin - effectiveLunchDur;
    var periodDur = Math.floor(totalTeachingMin / totalPeriods);
    var remainder = totalTeachingMin % totalPeriods;

    var currentMin = startMin;
    var pStart = startMin;
    var pEnd = startMin;

    for (var i = 1; i <= totalPeriods; i++) {
      var currentPeriodDur = periodDur;
      if (i === totalPeriods) {
        currentPeriodDur += remainder;
      }
      
      var startOfPeriod = currentMin;
      var endOfPeriod = currentMin + currentPeriodDur;
      
      if (i === p) {
        pStart = startOfPeriod;
        pEnd = endOfPeriod;
        break;
      }
      
      currentMin = endOfPeriod;
      if (lunchAfter > 0 && i === lunchAfter) {
        currentMin += lunchDur;
      }
    }

    function formatTime(totalMinutes) {
      var hours = Math.floor(totalMinutes / 60) % 24;
      var minutes = totalMinutes % 60;
      var ampm = hours >= 12 ? 'PM' : 'AM';
      var dispHours = hours % 12;
      if (dispHours === 0) dispHours = 12;
      var dispMinStr = minutes < 10 ? '0' + minutes : minutes;
      var dispHourStr = dispHours < 10 ? '0' + dispHours : dispHours;
      return dispHourStr + ':' + dispMinStr + ' ' + ampm;
    }

    return formatTime(pStart) + ' - ' + formatTime(pEnd);
  },

  getStudentFullName: function(student) {
    if (!student) return 'Unknown';
    if (student.name && String(student.name).trim()) return String(student.name).trim();
    if (student.firstName || student.lastName) {
      return ((student.firstName || '') + ' ' + (student.lastName || '')).trim();
    }
    return 'Unknown';
  },

  getInitials: function(firstName, lastName) {
    if (firstName && !lastName && firstName.includes(' ')) {
      var parts = firstName.trim().split(/\s+/);
      return ((parts[0] || '')[0] || '') + ((parts[parts.length - 1] || '')[0] || '');
    }
    return ((firstName || '')[0] || '') + ((lastName || '')[0] || '');
  },

  getAvatarColor: function(name) {
    if (!name) return '1';
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (Math.abs(hash) % 8 + 1).toString();
  },

  // ---------- Module System ----------
  registerModule: function(name, module) {
    this.modules[name] = module;
  },

  openStudentProfile: function(studentId) {
    if (typeof this.openStudentFinancialProfile === 'function') {
      return this.openStudentFinancialProfile(studentId);
    }
    if (typeof window.openStudentFinancialProfile === 'function') {
      return window.openStudentFinancialProfile(studentId);
    }
    var student = (window.SchoolApp.store.students || []).find(function(s) {
      return s.id === studentId;
    });
    if (!student) {
      window.SchoolApp.showToast('Student not found.', 'error');
      return;
    }

    var escapeHTML = function(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    var sFullName = this.getStudentFullName(student);
    var displayClass = ['Nursery','LKG','UKG'].indexOf(student.class) !== -1 ? student.class : 'Class ' + student.class;
    var initials = this.getInitials(sFullName);
    
    var avatarHTML = '';
    if (student.photoUrl) {
      avatarHTML = '<img src="' + student.photoUrl + '" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:3px solid var(--accent-primary);">';
    } else {
      var colors = ["#e74c3c","#3498db","#2ecc71","#9b59b6","#f39c12","#1abc9c"];
      var color = colors[escapeHTML(sFullName).charCodeAt(0) % colors.length] || 'var(--accent-primary)';
      avatarHTML = '<div style="width:80px; height:80px; border-radius:50%; background:' + color + '; color:#fff; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:700; border:2px solid var(--border-color);">' + escapeHTML(initials.toUpperCase()) + '</div>';
    }

    var bodyHTML = '<div style="display:flex; flex-direction:column; gap:20px; color:var(--text-primary); font-size:13px; max-height:450px; overflow-y:auto; padding:5px;">';
    
    // Header section
    bodyHTML += '  <div style="display:flex; align-items:center; gap:20px; border-bottom:1px solid var(--border-color); padding-bottom:16px;">';
    bodyHTML += '    ' + avatarHTML;
    bodyHTML += '    <div>';
    bodyHTML += '      <h3 style="margin:0 0 4px 0; font-size:18px; color:var(--accent-primary); font-weight:700;">' + escapeHTML(sFullName) + '</h3>';
    bodyHTML += '      <div style="display:flex; gap:8px; align-items:center; margin:6px 0;">';
    bodyHTML += '        <span class="badge ' + (student.status === 'Active' ? 'badge-success' : 'badge-danger') + '" style="font-size:10px; padding:3px 8px;">' + student.status + '</span>';
    bodyHTML += '        <span style="color:var(--text-secondary); font-size:11px;">Roll No: ' + escapeHTML(student.rollNumber || '—') + '</span>';
    bodyHTML += '      </div>';
    bodyHTML += '      <div style="font-size:12px; color:var(--text-secondary);">' + displayClass + ' • Section ' + escapeHTML(student.section || '—') + '</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';

    // Details Grid
    bodyHTML += '  <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:16px; display:grid;">';
    bodyHTML += '    <div><label style="font-weight:700; color:var(--text-secondary); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.3px;">Date of Birth</label><div style="font-size:13px; font-weight:500;">' + escapeHTML(student.dateOfBirth || student.dob || '—') + '</div></div>';
    bodyHTML += '    <div><label style="font-weight:700; color:var(--text-secondary); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.3px;">Admission Date</label><div style="font-size:13px; font-weight:500;">' + escapeHTML(student.admissionDate || '—') + '</div></div>';
    bodyHTML += '    <div><label style="font-weight:700; color:var(--text-secondary); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.3px;">Parent/Guardian Name</label><div style="font-size:13px; font-weight:500;">' + escapeHTML(student.parentName || '—') + '</div></div>';
    bodyHTML += '    <div><label style="font-weight:700; color:var(--text-secondary); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.3px;">Parent Phone / WhatsApp</label><div style="font-size:13px; font-weight:500;">' + escapeHTML(student.parentPhone || '—') + '</div></div>';
    bodyHTML += '    <div style="grid-column:span 2;"><label style="font-weight:700; color:var(--text-secondary); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.3px;">Parent Email</label><div style="font-size:13px; font-weight:500;">' + escapeHTML(student.parentEmail || '—') + '</div></div>';
    bodyHTML += '    <div style="grid-column:span 2;"><label style="font-weight:700; color:var(--text-secondary); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.3px;">Address</label><div style="font-size:13px; font-weight:500; line-height:1.4;">' + escapeHTML(student.address || '—') + '</div></div>';
    bodyHTML += '  </div>';
    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="window.SchoolApp.closeModal()">Close</button>';
    footerHTML += '<button class="btn btn-primary" id="quick-view-full-profile-btn" style="display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">visibility</span> View Full Profile</button>';

    window.SchoolApp.showModal('Student Quick Profile', bodyHTML, footerHTML);

    var viewFullBtn = document.getElementById('quick-view-full-profile-btn');
    if (viewFullBtn) {
      viewFullBtn.addEventListener('click', function() {
        window.SchoolApp.closeModal();
        window.SchoolApp.preselectedStudent = student;
        window.SchoolApp.navigate('students');
      });
    }
  },

  // ---------- Demo Data Generation ---------
  generateDemoData: function() {
    var self = this;
    if (self.currentSchoolId !== 'svm_bokaro_001') {
      return; // Never seed demo data for other schools
    }

    var firstNamesBoys = ['Aarav', 'Rahul', 'Vikram', 'Arjun', 'Karan', 'Aditya', 'Rohan', 'Ishan', 'Dev', 'Amit', 'Kabir', 'Vihaan', 'Krishna', 'Yash', 'Kunal', 'Pranav', 'Samar', 'Dhruv', 'Aaryan', 'Rudra'];
    var firstNamesGirls = ['Priya', 'Ananya', 'Sneha', 'Meera', 'Divya', 'Riya', 'Kavya', 'Diya', 'Ishita', 'Tanvi', 'Shreya', 'Neha', 'Aisha', 'Pooja', 'Simran', 'Myra', 'Zara', 'Kiara', 'Anika', 'Aanya'];
    var lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Gupta', 'Nair', 'Iyer', 'Verma', 'Joshi', 'Mehta', 'Rao', 'Bhat', 'Das', 'Roy', 'Sen', 'Trivedi', 'Saxena', 'Choudhury', 'Pillai'];

    var studentsList = [];
    var baseYear = 2026;

    var allClasses = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    var classCodes = {
      'Nursery': '01', 'LKG': '02', 'UKG': '03', '1': '04', '2': '05', '3': '06', '4': '07', '5': '08', '6': '09', '7': '10', '8': '11', '9': '12', '10': '13', '11': '14', '12': '15'
    };
    var ageMap = {
      'Nursery': 3, 'LKG': 4, 'UKG': 5, '1': 6, '2': 7, '3': 8, '4': 9, '5': 10, '6': 11, '7': 12, '8': 13, '9': 14, '10': 15, '11': 16, '12': 17
    };

    allClasses.forEach(function(className) {
      // Generate randomized number of students between 12 and 25
      var studentCount = Math.floor(Math.random() * (25 - 12 + 1)) + 12;
      var classCode = classCodes[className] || '99';
      var age = ageMap[className] || 6;

      for (var i = 0; i < studentCount; i++) {
        var isBoy = (i % 2 === 0);
        var fn = isBoy ? firstNamesBoys[Math.floor(Math.random() * firstNamesBoys.length)] : firstNamesGirls[Math.floor(Math.random() * firstNamesGirls.length)];
        var ln = lastNames[Math.floor(Math.random() * lastNames.length)];
        var gender = isBoy ? 'Male' : 'Female';
        var rollNum = '2026' + classCode + String(i + 1).padStart(2, '0');
        
        var birthYear = baseYear - age;
        var month = String((i % 12) + 1).padStart(2, '0');
        var day = String((i * 3 % 28) + 1).padStart(2, '0');
        
        var aadhaar = Math.floor(1000 + Math.random() * 9000) + ' ' + Math.floor(1000 + Math.random() * 9000) + ' ' + Math.floor(1000 + Math.random() * 9000);
        var parentFn = firstNamesBoys[Math.floor(Math.random() * firstNamesBoys.length)];
        var parentName = 'Mr. ' + parentFn + ' ' + ln;
        var parentPhone = '+91 98765 ' + String(10000 + Math.floor(Math.random() * 90000));
        var parentEmail = parentFn.toLowerCase() + '.' + ln.toLowerCase() + '@example.com';

        studentsList.push({
          id: self.generateId(),
          firstName: fn,
          lastName: ln,
          class: className,
          section: 'A',
          rollNumber: rollNum,
          dateOfBirth: birthYear + '-' + month + '-' + day,
          gender: gender,
          aadhaarNumber: aadhaar,
          address: 'Street No. ' + (i + 1) + ', Indiranagar, Bangalore',
          parentName: parentName,
          parentPhone: parentPhone,
          parentEmail: parentEmail,
          admissionDate: '2025-04-01',
          status: 'Active'
        });
      }
    });
    this.store.students = studentsList;

    var rawTeachers = [
      { fn: 'Rajesh', ln: 'Menon', globalSubs: ['Mathematics', 'Science'], qual: 'M.Sc., B.Ed., Ph.D.', jd: '2018-06-15' },
      { fn: 'Sunita', ln: 'Sharma', globalSubs: ['Science'], qual: 'M.Sc., B.Ed.', jd: '2019-04-01' },
      { fn: 'Amit', ln: 'Desai', globalSubs: ['English'], qual: 'M.A., B.Ed.', jd: '2020-07-15' },
      { fn: 'Priyanka', ln: 'Nair', globalSubs: ['Social Studies'], qual: 'M.A., M.Ed.', jd: '2017-06-01' },
      { fn: 'Vikram', ln: 'Singh', globalSubs: ['Hindi'], qual: 'M.A., B.Ed.', jd: '2021-04-01' },
      { fn: 'Neha', ln: 'Gupta', globalSubs: ['Hindi'], qual: 'B.A., B.Ed.', jd: '2022-08-10' },
      { fn: 'Manoj', ln: 'Bajpayee', globalSubs: ['Computer Science', 'Science'], qual: 'B.Tech, B.Ed.', jd: '2021-06-12' },
      { fn: 'Kavita', ln: 'Krishnan', globalSubs: ['English'], qual: 'M.A., M.Phil.', jd: '2020-09-05' },
      { fn: 'Arvind', ln: 'Kejriwal', globalSubs: ['Mathematics'], qual: 'B.Tech, IIT KGP', jd: '2015-05-15' },
      { fn: 'Shashi', ln: 'Tharoor', globalSubs: ['English'], qual: 'Ph.D., St. Stephen\'s', jd: '2016-01-10' },
      { fn: 'Mamta', ln: 'Banerjee', globalSubs: ['Art', 'Hindi'], qual: 'B.A., B.Ed.', jd: '2018-07-20' },
      { fn: 'Narendra', ln: 'Modi', globalSubs: ['Social Studies'], qual: 'M.A., Political Science', jd: '2014-05-26' },
      { fn: 'Rahul', ln: 'Gandhi', globalSubs: ['Physical Education', 'Science'], qual: 'M.Phil, Cambridge', jd: '2019-12-01' },
      { fn: 'Smriti', ln: 'Irani', globalSubs: ['Hindi'], qual: 'B.Com.', jd: '2020-05-30' },
      { fn: 'Nirmala', ln: 'Sitharaman', globalSubs: ['Mathematics', 'Social Studies'], qual: 'M.A., JNU', jd: '2017-09-18' }
    ];

    var teacherSpecs = {
      0: { // Rajesh Menon
        assigned: [{class: 'Nursery', section: 'A'}, {class: '9', section: 'A'}, {class: '10', section: 'A'}],
        subTeacherOf: [
          {class: 'Nursery', section: 'A', subject: 'Mathematics'},
          {class: '9', section: 'A', subject: 'Mathematics'},
          {class: '9', section: 'A', subject: 'Science'},
          {class: '10', section: 'A', subject: 'Mathematics'},
          {class: '10', section: 'A', subject: 'Science'}
        ]
      },
      1: { // Sunita Sharma
        assigned: [{class: 'LKG', section: 'A'}, {class: '7', section: 'A'}, {class: '8', section: 'A'}],
        subTeacherOf: [
          {class: 'LKG', section: 'A', subject: 'Drawing'},
          {class: '7', section: 'A', subject: 'Science'},
          {class: '8', section: 'A', subject: 'Science'}
        ]
      },
      2: { // Amit Desai
        assigned: [{class: 'UKG', section: 'A'}, {class: '6', section: 'A'}, {class: '7', section: 'A'}],
        subTeacherOf: [
          {class: 'UKG', section: 'A', subject: 'English'},
          {class: '6', section: 'A', subject: 'English'},
          {class: '7', section: 'A', subject: 'English'}
        ]
      },
      3: { // Priyanka Nair
        assigned: [{class: '1', section: 'A'}, {class: '8', section: 'A'}, {class: '9', section: 'A'}],
        subTeacherOf: [
          {class: '1', section: 'A', subject: 'Social Studies'},
          {class: '8', section: 'A', subject: 'Social Studies'},
          {class: '9', section: 'A', subject: 'Social Studies'}
        ]
      },
      4: { // Vikram Singh
        assigned: [{class: '1', section: 'A'}, {class: '2', section: 'A'}, {class: '6', section: 'A'}],
        subTeacherOf: [
          {class: '1', section: 'A', subject: 'Hindi'},
          {class: '2', section: 'A', subject: 'Hindi'},
          {class: '6', section: 'A', subject: 'Hindi'}
        ]
      },
      5: { // Neha Gupta
        assigned: [{class: '2', section: 'A'}, {class: '3', section: 'A'}, {class: '7', section: 'A'}],
        subTeacherOf: [
          {class: '2', section: 'A', subject: 'Hindi'},
          {class: '3', section: 'A', subject: 'Hindi'},
          {class: '7', section: 'A', subject: 'Hindi'}
        ]
      },
      6: { // Manoj Bajpayee
        assigned: [{class: '4', section: 'A'}, {class: '5', section: 'A'}],
        subTeacherOf: [
          {class: '4', section: 'A', subject: 'Science'},
          {class: '5', section: 'A', subject: 'Science'}
        ]
      },
      7: { // Kavita Krishnan
        assigned: [{class: '5', section: 'A'}, {class: '8', section: 'A'}],
        subTeacherOf: [
          {class: '5', section: 'A', subject: 'English'},
          {class: '8', section: 'A', subject: 'English'}
        ]
      },
      8: { // Arvind Kejriwal
        assigned: [{class: '6', section: 'A'}, {class: '11', section: 'A'}],
        subTeacherOf: [
          {class: '6', section: 'A', subject: 'Mathematics'},
          {class: '11', section: 'A', subject: 'Mathematics'}
        ]
      },
      9: { // Shashi Tharoor
        assigned: [{class: '7', section: 'A'}, {class: '12', section: 'A'}],
        subTeacherOf: [
          {class: '7', section: 'A', subject: 'English'},
          {class: '12', section: 'A', subject: 'English'}
        ]
      },
      10: { // Mamta Banerjee
        assigned: [{class: '8', section: 'A'}, {class: 'Nursery', section: 'A'}],
        subTeacherOf: [
          {class: '8', section: 'A', subject: 'Hindi'},
          {class: 'Nursery', section: 'A', subject: 'Drawing'}
        ]
      },
      11: { // Narendra Modi
        assigned: [{class: '9', section: 'A'}, {class: '10', section: 'A'}],
        subTeacherOf: [
          {class: '9', section: 'A', subject: 'Social Studies'},
          {class: '10', section: 'A', subject: 'Social Studies'}
        ]
      },
      12: { // Rahul Gandhi
        assigned: [{class: '10', section: 'A'}, {class: '6', section: 'A'}],
        subTeacherOf: [
          {class: '10', section: 'A', subject: 'Science'},
          {class: '6', section: 'A', subject: 'Science'}
        ]
      },
      13: { // Smriti Irani
        assigned: [{class: '11', section: 'A'}, {class: '12', section: 'A'}],
        subTeacherOf: [
          {class: '11', section: 'A', subject: 'Hindi'},
          {class: '12', section: 'A', subject: 'Hindi'}
        ]
      },
      14: { // Nirmala Sitharaman
        assigned: [{class: '12', section: 'A'}, {class: '5', section: 'A'}],
        subTeacherOf: [
          {class: '12', section: 'A', subject: 'Mathematics'},
          {class: '5', section: 'A', subject: 'Mathematics'}
        ]
      }
    };

    var teachersList = rawTeachers.map(function(t, idx) {
      var email = (t.fn.toLowerCase() + '.' + t.ln.toLowerCase()) + '@shishuvikash.edu.in';
      var className = allClasses[idx];
      var classTeacherOf = [{ class: className, section: 'A' }];
      
      var spec = teacherSpecs[idx] || { assigned: [{ class: className, section: 'A' }], subTeacherOf: [] };
      var assignedClasses = spec.assigned.slice();
      var hasCtClass = assignedClasses.some(function(ac) {
        return ac.class === className && ac.section === 'A';
      });
      if (!hasCtClass) {
        assignedClasses.push({ class: className, section: 'A' });
      }

      var subjectTeacherOf = spec.subTeacherOf.slice();

      return {
        id: self.generateId(),
        firstName: t.fn,
        lastName: t.ln,
        email: email,
        phone: '+91 98765 ' + String(20000 + Math.floor(Math.random() * 80000)),
        subject: t.globalSubs.join(', '),
        qualification: t.qual,
        assignedClasses: assignedClasses,
        classTeacherOf: classTeacherOf,
        subjectTeacherOf: subjectTeacherOf,
        joiningDate: t.jd,
        status: 'Active',
        password: 'teacher123'
      };
    });
    this.store.teachers = teachersList;

    // Generate Attendance Data (last 5 weekdays) for classes 6-A and 7-A
    var today = new Date();
    var weekdays = [];
    var dObj = new Date(today);
    dObj.setDate(dObj.getDate() - 1);
    while (weekdays.length < 5) {
      if (dObj.getDay() !== 0 && dObj.getDay() !== 6) {
        weekdays.push(new Date(dObj));
      }
      dObj.setDate(dObj.getDate() - 1);
    }

    var classesToTrack = [
      { class: '6', section: 'A' },
      { class: '7', section: 'A' }
    ];

    this.store.attendance = [];
    var teachersList = this.store.teachers;
    var studentsListForAttendance = this.store.students;

    weekdays.forEach(function(wd) {
      var dateStr = wd.toISOString().split('T')[0];
      classesToTrack.forEach(function(cls) {
        var teacher = teachersList.find(function(t) {
          return t.assignedClasses.some(function(ac) {
            return ac.class === cls.class && ac.section === cls.section;
          });
        });
        if (!teacher) return;

        var classStudents = studentsListForAttendance.filter(function(s) {
          return s.class === cls.class && s.section === cls.section;
        });

        var records = classStudents.map(function(s) {
          var rand = Math.random();
          var status = rand < 0.85 ? 'present' : (rand < 0.95 ? 'absent' : 'late');
          return { studentId: s.id, status: status };
        });

        self.store.attendance.push({
          id: self.generateId(),
          date: dateStr,
          class: cls.class,
          section: cls.section,
          teacherId: teacher.id,
          records: records,
          timestamp: wd.toISOString()
        });
      });
    });

    // Customizable Fee Heads
    this.store.feeHeads = [
      { id: 'fh_tuition', name: 'Monthly Tuition' },
      { id: 'fh_exam', name: 'Exam Fee' },
      { id: 'fh_transport', name: 'Transport Fee' },
      { id: 'fh_fine', name: 'Late Fine' },
      { id: 'fh_annual', name: 'Annual Charges' }
    ];

    // Seed default fee structures for all classes Nursery, LKG, UKG, and 1 to 12
    this.store.feeStructures = {};
    var allClasses = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    allClasses.forEach(function(clsName) {
      var cNum = parseInt(clsName);
      if (isNaN(cNum)) cNum = 1;
      
      // Dynamic random default amounts based on class levels
      var tuition = 1000 + (cNum * 100) + (indexMod(clsName) * 50);
      var exam = 200 + (cNum * 20) + (indexMod(clsName) * 20);
      var transport = 300 + (indexMod(clsName) * 50);
      var fine = 50 + (indexMod(clsName) * 10);
      var annual = 1500 + (cNum * 150) + (indexMod(clsName) * 100);

      self.store.feeStructures[clsName] = {
        'fh_tuition': String(tuition),
        'fh_exam': String(exam),
        'fh_transport': String(transport),
        'fh_fine': String(fine),
        'fh_annual': String(annual)
      };
    });

    function indexMod(str) {
      var s = 0;
      for (var k = 0; k < str.length; k++) s += str.charCodeAt(k);
      return s % 3;
    }

    // Seed student dues and randomized fee ledgers
    this.store.fees = [];
    this.store.students.forEach(function(s, index) {
      var classStruct = self.store.feeStructures[s.class] || {};
      var annualAmt = parseFloat(classStruct.fh_annual || 2000);
      var tuitionAmt = parseFloat(classStruct.fh_tuition || 1500);
      var examAmt = parseFloat(classStruct.fh_exam || 300);

      // 1. Charge Annual Dues
      self.store.fees.push({
        id: self.generateId(),
        studentId: s.id,
        schoolId: 'svm_bokaro_001',
        type: 'due',
        feeHeadId: 'fh_annual',
        amount: annualAmt,
        description: 'Annual Charges 2025-2026',
        date: '2025-04-01'
      });

      // 2. Charge April Tuition
      self.store.fees.push({
        id: self.generateId(),
        studentId: s.id,
        schoolId: 'svm_bokaro_001',
        type: 'due',
        feeHeadId: 'fh_tuition',
        amount: tuitionAmt,
        description: 'Monthly Tuition - April 2025',
        date: '2025-04-05'
      });

      // 3. Charge Exam Fee
      self.store.fees.push({
        id: self.generateId(),
        studentId: s.id,
        schoolId: 'svm_bokaro_001',
        type: 'due',
        feeHeadId: 'fh_exam',
        amount: examAmt,
        description: 'Term 1 Exam Fee',
        date: '2025-04-15'
      });

      // 4. Charge May Tuition
      self.store.fees.push({
        id: self.generateId(),
        studentId: s.id,
        schoolId: 'svm_bokaro_001',
        type: 'due',
        feeHeadId: 'fh_tuition',
        amount: tuitionAmt,
        description: 'Monthly Tuition - May 2025',
        date: '2025-05-05'
      });

      // Total Ledger Balance = annualAmt + tuitionAmt * 2 + examAmt
      // Randomize ledger state into 3 distinct cohorts
      var rVal = (index % 3);
      if (rVal === 0) {
        // Cohort A: Fully Paid (0 balance)
        self.store.fees.push({
          id: self.generateId(),
          studentId: s.id,
          schoolId: 'svm_bokaro_001',
          type: 'payment',
          amount: annualAmt,
          date: '2025-04-02',
          mode: 'UPI',
          remarks: 'Annual fees paid via UPI'
        });
        self.store.fees.push({
          id: self.generateId(),
          studentId: s.id,
          schoolId: 'svm_bokaro_001',
          type: 'payment',
          amount: tuitionAmt * 2 + examAmt,
          date: '2025-05-12',
          mode: 'Cash',
          remarks: 'Tuitions & Exam fees paid at counter'
        });
      } else if (rVal === 1) {
        // Cohort B: Partially Paid
        self.store.fees.push({
          id: self.generateId(),
          studentId: s.id,
          schoolId: 'svm_bokaro_001',
          type: 'payment',
          amount: annualAmt,
          date: '2025-04-02',
          mode: 'Bank',
          remarks: 'Direct IMPS Bank Transfer'
        });
        self.store.fees.push({
          id: self.generateId(),
          studentId: s.id,
          schoolId: 'svm_bokaro_001',
          type: 'payment',
          amount: tuitionAmt,
          date: '2025-04-10',
          mode: 'UPI',
          remarks: 'April tuition paid GPay Ref: 80942'
        });
      } else {
        // Cohort C: Full Dues Remaining (No payments)
      }
    });

    // Seed default Exam Terms
    this.store.exams = [
      { id: 'exam_halfyearly', name: 'Half-Yearly Examination' },
      { id: 'exam_annual', name: 'Annual Examination' }
    ];

    // Seed default Subject Class Mapping
    this.store.subjectMapping = {};
    var allCls = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    allCls.forEach(function(cls) {
      if (['Nursery', 'LKG', 'UKG'].indexOf(cls) !== -1) {
        self.store.subjectMapping[cls] = [
          { id: 'sub_english', name: 'English', maxMarks: 100, passMarks: 33 },
          { id: 'sub_maths', name: 'Mathematics', maxMarks: 100, passMarks: 33 },
          { id: 'sub_drawing', name: 'Drawing', maxMarks: 100, passMarks: 33 },
          { id: 'sub_rhymes', name: 'Rhymes', maxMarks: 100, passMarks: 33 }
        ];
      } else {
        self.store.subjectMapping[cls] = [
          { id: 'sub_english', name: 'English', maxMarks: 100, passMarks: 33 },
          { id: 'sub_maths', name: 'Mathematics', maxMarks: 100, passMarks: 33 },
          { id: 'sub_science', name: 'Science', maxMarks: 100, passMarks: 33 },
          { id: 'sub_sst', name: 'Social Studies', maxMarks: 100, passMarks: 33 },
          { id: 'sub_hindi', name: 'Hindi', maxMarks: 100, passMarks: 33 }
        ];
      }
    });

    // Seed realistic Marks entries for demonstration
    this.store.marks = [];
    this.store.students.forEach(function(s, idx) {
      if (idx % 10 < 3) {
        var mapping = self.store.subjectMapping[s.class] || [];
        var scores = {};
        var totalScored = 0;
        var maxTotal = 0;
        var passedAll = true;

        mapping.forEach(function(sub) {
          var score = 60 + ((idx * 7 + sub.name.length) % 36);
          scores[sub.id] = String(score);
          totalScored += score;
          maxTotal += sub.maxMarks;
          if (score < sub.passMarks) passedAll = false;
        });

        var percentage = Math.round((totalScored / maxTotal) * 100);
        var grade = 'F';
        if (percentage >= 90) grade = 'A+';
        else if (percentage >= 80) grade = 'A';
        else if (percentage >= 70) grade = 'B';
        else if (percentage >= 50) grade = 'C';

        self.store.marks.push({
          id: self.generateId(),
          studentId: s.id,
          examId: 'exam_halfyearly',
          class: s.class,
          section: s.section,
          scores: scores,
          totalScored: totalScored,
          maxTotal: maxTotal,
          percentage: percentage,
          grade: grade,
          status: passedAll ? 'Pass' : 'Fail'
        });
      }
    });

    // Seed default Digital Notices
    this.store.notices = [
      {
        id: 'notice_1',
        title: 'Summer Vacation Announcement',
        message: 'The school will remain closed for summer vacation from June 10th to July 5th. Normal classes will resume on July 6th. Have a safe and happy summer vacation!',
        date: '2026-05-25',
        priority: 'Normal',
        status: 'published'
      },
      {
        id: 'notice_2',
        title: 'Urgent: Terminal Examination Schedule Update',
        message: 'The Class 10 Term 1 examination scheduled for Monday has been postponed to next Friday due to local administrative elections. Please check the updated timetable sheet.',
        date: '2026-05-30',
        priority: 'Urgent',
        status: 'published'
      },
      {
        id: 'notice_3',
        title: 'Annual Science Exhibition 2026',
        message: 'All students are invited to register their working models for the Annual Science Exhibition by June 4th. Prizes will be awarded to top 3 innovative ideas.',
        date: '2026-05-28',
        priority: 'Normal',
        status: 'published'
      }
    ];
    this.store.lastAutomatedFeeRun = '';
  },

  // ---------- Dashboard ----------
  renderDashboard: function() {
    var container = document.getElementById('page-dashboard');
    if (!container) return;

    const isClean = this.assertSchoolIsolation(this.store.students, this.currentSchoolId) &&
                    this.assertSchoolIsolation(this.store.teachers, this.currentSchoolId) &&
                    this.assertSchoolIsolation(this.store.attendance, this.currentSchoolId) &&
                    this.assertSchoolIsolation(this.store.fees, this.currentSchoolId);
    if (!isClean) {
      console.error("[SECURITY] Data isolation breach detected!");
      this.showToast("Security error. Please logout and login again.", "error");
      this.logout();
      return;
    }

    if (this.isTeacher()) {
      this.renderTeacherDashboard(container);
      return;
    }

    // Securely run auto-fee reconciliation and display toast feedback to Admin on Dashboard load
    if (this.isAdmin()) {
      var self = this;
      this.runAutoFeeReconciliation().then(function() {
        if (self.feesGeneratedMsg) {
          var msg = self.feesGeneratedMsg;
          self.feesGeneratedMsg = null; // Clear immediately to prevent multiple popups
          setTimeout(function() {
            self.showToast(msg, 'success');
          }, 1000);
        }
      }).catch(function(err) {
        console.error('runAutoFeeReconciliation error:', err);
      });
    }

    var totalStudents = (this.store.students || []).length;
    var totalTeachers = (this.store.teachers || []).length;
    var settings = this.store.settings || {};
    var totalClasses = (settings.classes || []).length;

    // Calculate today's attendance
    var todayStr = new Date().toISOString().split('T')[0];
    var todayRecords = (this.store.attendance || []).filter(function(a) { return a.date === todayStr; });
    var todayPresent = 0, todayTotal = 0;
    var self = this;
    todayRecords.forEach(function(r) {
      var recList = self.normalizeAttendanceRecords(r.records);
      recList.forEach(function(rec) {
        todayTotal++;
        if (rec.status === 'present' || rec.status === 'late') todayPresent++;
      });
    });
    var attendancePerc = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;

    // Attendance chart data (last 7 entries)
    var attData = (this.store.attendance || []).slice(-7).map(function(a) {
      var recList = self.normalizeAttendanceRecords(a.records);
      var present = recList.filter(function(r) { return r.status === 'present' || r.status === 'late'; }).length;
      var total = recList.length;
      return {
        label: a.date ? a.date.substr(5) : '',
        value: total > 0 ? Math.round((present / total) * 100) : 0
      };
    });

    // Class distribution
    var classDist = {};
    (this.store.students || []).forEach(function(s) {
      var key = 'Class ' + s.class;
      classDist[key] = (classDist[key] || 0) + 1;
    });

    // Recent activity
    var recentAtt = (this.store.attendance || []).slice(-5).reverse();
    var teachers = this.store.teachers || [];
    var self = this;

    var html = '';

    // Stats Grid
    html += '<div class="stats-grid">';
    html += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">groups</span></div><div class="stat-info"><div class="stat-number" data-count="' + totalStudents + '">0</div><div class="stat-label">Total Students</div></div></div>';
    html += '<div class="stat-card cyan"><div class="stat-icon"><span class="material-icons-round">person</span></div><div class="stat-info"><div class="stat-number" data-count="' + totalTeachers + '">0</div><div class="stat-label">Total Teachers</div></div></div>';
    html += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">check_circle</span></div><div class="stat-info"><div class="stat-number" data-count="' + attendancePerc + '">0</div><div class="stat-label">Today\'s Attendance %</div></div></div>';
    html += '<div class="stat-card amber"><div class="stat-icon"><span class="material-icons-round">class</span></div><div class="stat-info"><div class="stat-number" data-count="' + totalClasses + '">0</div><div class="stat-label">Total Classes</div></div></div>';
    html += '</div>';

    // Digital Notice Board Widget
    html += '<div class="card mb-3"><div class="card-header"><h3><span class="material-icons-round">campaign</span> Digital Notice Board</h3></div>';
    html += '<div class="card-body" style="max-height: 250px; overflow-y: auto; padding: 16px;">';
    
    var noticesList = (this.store.notices || []).filter(function(n) {
      return self.isNoticeVisibleForUser(n);
    });
    // Sort by date newest first
    noticesList = noticesList.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    if (noticesList.length > 0) {
      html += '<div class="notices-dashboard-list" style="display:flex; flex-direction:column; gap:12px;">';
      noticesList.forEach(function(notice) {
        var priorityClass = notice.priority === 'Urgent' ? 'urgent-notice' : 'normal-notice';
        var dateFormatted = self.formatDate(notice.date);
        
        var audArr = notice.audience || ['everyone'];
        if (!Array.isArray(audArr)) audArr = [audArr];
        var audLabel = '👥 Everyone';
        var audBadge = 'badge-info';
        if (audArr.indexOf('teachers') !== -1) {
          audLabel = '👨‍🏫 Teachers';
          audBadge = 'badge-purple';
        } else if (audArr.indexOf('students') !== -1) {
          audLabel = '🎓 Students';
          audBadge = 'badge-cyan';
        }

        html += '<div class="notice-item ' + priorityClass + '" style="padding:14px; border-radius:8px; border-left:4px solid; transition:all var(--transition-fast);">';
        html += '<div class="flex justify-between" style="align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">';
        html += '<h4 style="margin:0; font-size:14px; font-weight:700;">' + notice.title + '</h4>';
        
        var badgeColor = notice.priority === 'Urgent' ? 'badge-danger' : 'badge-purple';
        html += '<div class="flex gap-2" style="align-items:center;">';
        html += '<span class="badge ' + audBadge + '" style="font-size:10px;">' + audLabel + '</span>';
        html += '<span class="badge ' + badgeColor + '">' + notice.priority + '</span>';
        html += '<span style="font-size:11px; color:var(--text-muted);">' + dateFormatted + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<p style="margin:0; font-size:13px; color:var(--text-secondary); line-height:1.5;">' + notice.message + '</p>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state" style="padding: 20px 0;"><span class="material-icons-round" style="font-size:36px; opacity:0.3;">campaign</span><p>No active announcements currently.</p></div>';
    }
    html += '</div></div>';

    // Charts Row
    html += '<div class="dashboard-grid">';

    // Attendance Chart
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">bar_chart</span> Attendance Overview</h3></div><div class="card-body">';
    if (attData.length > 0) {
      html += '<div class="chart-container"><div class="chart-bars">';
      attData.forEach(function(d) {
        var height = Math.max(d.value * 1.6, 4);
        html += '<div class="chart-bar-wrapper"><div class="chart-bar" style="height: ' + height + 'px"><div class="chart-bar-value">' + d.value + '%</div></div><div class="chart-label">' + d.label + '</div></div>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">bar_chart</span><h3>No Data Yet</h3><p>Attendance data will appear here once recorded.</p></div>';
    }
    html += '</div></div>';

    // Class Distribution
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">pie_chart</span> Class Distribution</h3></div><div class="card-body">';
    var classKeys = Object.keys(classDist);
    if (classKeys.length > 0) {
      html += '<div class="chart-container"><div class="chart-bars">';
      var maxStudents = Math.max.apply(null, classKeys.map(function(k) { return classDist[k]; }));
      classKeys.forEach(function(k) {
        var val = classDist[k];
        var height = Math.max((val / maxStudents) * 160, 4);
        html += '<div class="chart-bar-wrapper"><div class="chart-bar" style="height: ' + height + 'px; background: linear-gradient(180deg, var(--accent-secondary), var(--accent-primary))"><div class="chart-bar-value">' + val + '</div></div><div class="chart-label">' + k + '</div></div>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">pie_chart</span><h3>No Students</h3><p>Add students to see the distribution.</p></div>';
    }
    html += '</div></div>';

    html += '</div>'; // End dashboard-grid

    // Bottom Row
    html += '<div class="dashboard-grid mt-3">';

    // Recent Activity
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">history</span> Recent Activity</h3></div><div class="card-body"><div class="activity-list">';
    if (recentAtt.length > 0) {
      recentAtt.forEach(function(a) {
        var teacher = teachers.find(function(t) { return t.id === a.teacherId; });
        var teacherName = teacher ? teacher.firstName + ' ' + teacher.lastName : 'Unknown';
        var recList = self.normalizeAttendanceRecords(a.records);
        var presentCount = recList.filter(function(r) { return r.status === 'present'; }).length;
        html += '<div class="activity-item"><div class="activity-icon green"><span class="material-icons-round">fact_check</span></div><div class="activity-text"><strong>' + teacherName + '</strong> marked attendance for Class ' + a.class + '-' + a.section + '<br><span class="activity-time">' + self.formatDate(a.date) + ' · ' + presentCount + '/' + recList.length + ' present</span></div></div>';
      });
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">history</span><p>No recent activity</p></div>';
    }
    html += '</div></div></div>';

    // Quick Actions
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">flash_on</span> Quick Actions</h3></div><div class="card-body"><div class="quick-actions-grid">';
    html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'students\')"><span class="material-icons-round">person_add</span>Manage Students</button>';
    html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'attendance\')"><span class="material-icons-round">fact_check</span>Mark Attendance</button>';
    html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'teachers\')"><span class="material-icons-round">group</span>View Teachers</button>';
    if (this.isAdmin()) {
      html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'admin\')"><span class="material-icons-round">settings</span>Admin Settings</button>';
    } else {
      html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'attendance\')"><span class="material-icons-round">history</span>View History</button>';
    }
    html += '</div></div></div>';

    html += '</div>'; // End bottom dashboard-grid

    container.innerHTML = html;

    // Animate stat counters
    setTimeout(function() {
      var counters = container.querySelectorAll('.stat-number[data-count]');
      counters.forEach(function(el) {
        var target = parseInt(el.getAttribute('data-count'));
        var current = 0;
        var step = Math.max(1, Math.floor(target / 30));
        var interval = setInterval(function() {
          current += step;
          if (current >= target) {
            current = target;
            clearInterval(interval);
          }
          el.textContent = current;
        }, 30);
      });
    }, 100);
  },

  renderTeacherDashboard: function(container) {
    var self = this;
    
    const isClean = this.assertSchoolIsolation(this.store.students, this.currentSchoolId) &&
                    this.assertSchoolIsolation(this.store.attendance, this.currentSchoolId);
    if (!isClean) {
      console.error("[SECURITY] Data isolation breach detected!");
      this.showToast("Security error. Please logout and login again.", "error");
      this.logout();
      return;
    }
    
    var ctClasses = this.currentUser.classTeacherOf || [];
    var stClasses = this.currentUser.subjectTeacherOf || [];

    // 1. My Class Strength: Count unique students belonging to any class/section in classTeacherOf
    var classTeacherStudents = this.store.students.filter(function(s) {
      return ctClasses.some(function(ct) {
        return String(s.class).toLowerCase().trim() === String(ct.class).toLowerCase().trim() &&
               String(s.section).toLowerCase().trim() === String(ct.section).toLowerCase().trim();
      });
    });
    var classStrength = classTeacherStudents.length;

    // 2. Class Attendance % (Today) for Class Teacher classes
    var todayStr = new Date().toISOString().split('T')[0];
    var ctAttendanceRecords = this.store.attendance.filter(function(a) {
      return a.date === todayStr && ctClasses.some(function(ct) {
        return String(a.class).toLowerCase().trim() === String(ct.class).toLowerCase().trim() &&
               String(a.section).toLowerCase().trim() === String(ct.section).toLowerCase().trim();
      });
    });
    var ctPresent = 0, ctTotal = 0;
    ctAttendanceRecords.forEach(function(r) {
      var recList = self.normalizeAttendanceRecords(r.records);
      recList.forEach(function(rec) {
        ctTotal++;
        if (rec.status === 'present' || rec.status === 'late') ctPresent++;
      });
    });
    var ctAttendancePerc = ctTotal > 0 ? Math.round((ctPresent / ctTotal) * 100) : 0;

    // 3. My Teaching Periods: Count of subjectTeacherOf classes
    var upcomingCount = stClasses.length;

    // 4. My Attendance (This Month %): Teacher's own attendance
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth(); // 0-11
    
    var currentMonthPunches = (this.store.teacherAttendance || []).filter(function(p) {
      var pDate = new Date(p.date);
      return p.teacherId === self.currentUser.id &&
             p.type === 'in' &&
             pDate.getFullYear() === currentYear &&
             pDate.getMonth() === currentMonth;
    });

    var uniqueDays = {};
    currentMonthPunches.forEach(function(p) {
      uniqueDays[p.date] = true;
    });
    var presentDays = Object.keys(uniqueDays).length;

    var workingDays = 0;
    var todayDay = now.getDate();
    for (var d = 1; d <= todayDay; d++) {
      var checkDate = new Date(currentYear, currentMonth, d);
      if (checkDate.getDay() !== 0) { // Exclude Sundays
        workingDays++;
      }
    }
    var teacherAttendancePerc = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;
    if (teacherAttendancePerc > 100) teacherAttendancePerc = 100;

    var html = '';

    // Stats Grid
    html += '<div class="stats-grid">';
    
    // Class Strength Card
    var classLabel = ctClasses.length > 0 ? 'My Class Strength (' + ctClasses.map(function(c) { return c.class + '-' + c.section; }).join(', ') + ')' : 'My Class Strength';
    html += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">groups</span></div><div class="stat-info"><div class="stat-number" data-count="' + classStrength + '">0</div><div class="stat-label">' + classLabel + '</div></div></div>';
    
    // Class Attendance Card
    html += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">check_circle</span></div><div class="stat-info"><div class="stat-number" data-count="' + ctAttendancePerc + '">0</div><div class="stat-label">Class Attendance (Today)</div></div></div>';
    
    // Teaching Periods Card
    html += '<div class="stat-card amber"><div class="stat-icon"><span class="material-icons-round">class</span></div><div class="stat-info"><div class="stat-number" data-count="' + upcomingCount + '">0</div><div class="stat-label">My Teaching Periods</div></div></div>';
    
    // Teacher's own Attendance Card
    html += '<div class="stat-card cyan"><div class="stat-icon"><span class="material-icons-round">fingerprint</span></div><div class="stat-info"><div class="stat-number" data-count="' + teacherAttendancePerc + '">0</div><div class="stat-label">My Attendance % (This Month)</div></div></div>';
    html += '</div>';

    // Digital Notice Board Widget (published notices only)
    html += '<div class="card mb-3"><div class="card-header"><h3><span class="material-icons-round">campaign</span> Digital Notice Board</h3></div>';
    html += '<div class="card-body" style="max-height: 250px; overflow-y: auto; padding: 16px;">';
    
    var noticesList = (this.store.notices || []).filter(function(n) {
      return n.status === 'published' && self.isNoticeVisibleForUser(n);
    });
    noticesList = noticesList.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    if (noticesList.length > 0) {
      html += '<div class="notices-dashboard-list" style="display:flex; flex-direction:column; gap:12px;">';
      noticesList.forEach(function(notice) {
        var priorityClass = notice.priority === 'Urgent' ? 'urgent-notice' : 'normal-notice';
        var dateFormatted = self.formatDate(notice.date);
        
        html += '<div class="notice-item ' + priorityClass + '" style="padding:14px; border-radius:8px; border-left:4px solid; transition:all var(--transition-fast);">';
        html += '<div class="flex justify-between" style="align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">';
        html += '<h4 style="margin:0; font-size:14px; font-weight:700;">' + notice.title + '</h4>';
        
        var badgeColor = notice.priority === 'Urgent' ? 'badge-danger' : 'badge-purple';
        html += '<div class="flex gap-2" style="align-items:center;">';
        html += '<span class="badge ' + badgeColor + '">' + notice.priority + '</span>';
        html += '<span style="font-size:11px; color:var(--text-muted);">' + dateFormatted + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<p style="margin:0; font-size:13px; color:var(--text-secondary); line-height:1.5;">' + notice.message + '</p>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state" style="padding: 20px 0;"><span class="material-icons-round" style="font-size:36px; opacity:0.3;">campaign</span><p>No active announcements currently.</p></div>';
    }
    html += '</div></div>';

    // Columns Row: Teaching Schedule & Class Attendance Summary
    html += '<div class="dashboard-grid">';

    // Dynamic Timetable-based Schedule Card
    var daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var currentDayName = daysOfWeek[new Date().getDay()];
    if (currentDayName === 'Sunday') {
      currentDayName = 'Monday'; // Default to Monday on weekends
    }

    var teacherSchedule = [];
    var timetable = this.store.timetable || {};
    for (var classSection in timetable) {
      var daySchedule = timetable[classSection][currentDayName];
      if (daySchedule) {
        for (var period in daySchedule) {
          var slot = daySchedule[period];
          if (slot && slot.teacherId === this.currentUser.id) {
            teacherSchedule.push({
              period: parseInt(period),
              classSection: classSection,
              subject: slot.subject
            });
          }
        }
      }
    }

    teacherSchedule.sort(function(a, b) { return a.period - b.period; });

    var dayLabelText = (daysOfWeek[new Date().getDay()] === 'Sunday') ? 'Monday (Next Week)' : currentDayName;
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">schedule</span> Today\'s Schedule (' + dayLabelText + ')</h3></div><div class="card-body" style="padding: 16px 24px;">';
    if (teacherSchedule.length > 0) {
      html += '<div class="activity-list" style="display:flex; flex-direction:column; gap:16px;">';
      teacherSchedule.forEach(function(item) {
        var timeStr = self.getPeriodTimeStr(item.period, currentDayName);
        html += '<div class="activity-item" style="display:flex; align-items:flex-start; gap:12px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.04);">';
        html += '<div class="activity-icon purple" style="width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; background:rgba(124,58,237,0.15); color:var(--accent-primary-light);"><span class="material-icons-round" style="font-size:18px;">class</span></div>';
        html += '<div class="activity-text" style="font-size:13px; line-height:1.4;"><strong style="font-size:14px; color:var(--text-primary);">Period ' + item.period + ' · Class ' + item.classSection + '</strong><br><span style="color:var(--text-muted); font-size:11px;">' + timeStr + '</span> · <span class="badge badge-purple" style="font-size:9.5px; padding:2px 6px;">' + item.subject + '</span></div>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">calendar_today</span><h3>No Periods Scheduled</h3><p>You have no teaching periods scheduled for ' + (daysOfWeek[new Date().getDay()] === 'Sunday' ? 'Monday' : 'today') + '.</p></div>';
    }
    html += '</div></div>';

    // My Class Attendance Summary Card
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">fact_check</span> Class Attendance (Today)</h3></div><div class="card-body" style="padding: 16px 24px;">';
    
    if (ctClasses.length > 0) {
      html += '<div class="activity-list" style="display:flex; flex-direction:column; gap:16px;">';
      ctClasses.forEach(function(ac) {
        var record = self.store.attendance.find(function(a) {
          return a.date === todayStr &&
                 String(a.class).toLowerCase().trim() === String(ac.class).toLowerCase().trim() &&
                 String(a.section).toLowerCase().trim() === String(ac.section).toLowerCase().trim();
        });

        html += '<div class="activity-item" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.04);">';
        html += '<div style="display:flex; align-items:center; gap:12px;">';
        html += '<div class="activity-icon cyan" style="width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; background:rgba(6,182,212,0.15); color:var(--accent-secondary);"><span class="material-icons-round" style="font-size:18px;">people</span></div>';
        html += '<div style="font-size:13px;"><strong style="color:var(--text-primary);">Class ' + ac.class + '-' + ac.section + '</strong></div>';
        html += '</div>';

        if (record) {
          var present = record.records.filter(function(r) { return r.status === 'present' || r.status === 'late'; }).length;
          var total = record.records.length;
          var rate = total > 0 ? Math.round((present / total) * 100) : 0;
          html += '<div><span class="badge badge-success" style="font-size:11px; padding:4px 8px;">' + rate + '% Marked</span></div>';
        } else {
          html += '<div><button class="btn btn-secondary btn-xs" onclick="SchoolApp.navigate(\'attendance\')" style="font-size:10.5px; padding:4px 8px;">Mark Now</button></div>';
        }
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">fact_check</span><h3>No Class Assigned</h3><p>You are not assigned as Class Teacher for any class. Attendance is restricted to Class Teachers.</p></div>';
    }
    html += '</div></div>';

    html += '</div>'; // End dashboard-grid

    // Custom Quick Actions
    html += '<div class="card mt-3"><div class="card-header"><h3><span class="material-icons-round">flash_on</span> Quick Actions</h3></div><div class="card-body"><div class="quick-actions-grid">';
    html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'students\')"><span class="material-icons-round">school</span>My Students</button>';
    html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'attendance\')"><span class="material-icons-round">fact_check</span>Mark Attendance</button>';
    html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'teacher-attendance\')"><span class="material-icons-round">fingerprint</span>My Attendance</button>';
    html += '<button class="quick-action-btn" onclick="SchoolApp.navigate(\'help\')"><span class="material-icons-round">support</span>Help & Support</button>';
    html += '</div></div></div>';

    container.innerHTML = html;

    // Animate stat counters
    setTimeout(function() {
      var counters = container.querySelectorAll('.stat-number[data-count]');
      counters.forEach(function(el) {
        var target = parseInt(el.getAttribute('data-count'));
        var current = 0;
        var step = Math.max(1, Math.floor(target / 30));
        var interval = setInterval(function() {
          current += step;
          if (current >= target) {
            current = target;
            clearInterval(interval);
          }
          el.textContent = current + (el.parentElement.querySelector('.stat-label').textContent.indexOf('%') !== -1 ? '%' : '');
        }, 30);
      });
    }, 100);
  },

  // ---------- UI Setup ----------
  enableLoginButton: function() {
    if (this._loginButtonTimeout) {
      clearTimeout(this._loginButtonTimeout);
      this._loginButtonTimeout = null;
    }
    var btn = document.getElementById('login-submit-btn');
    var txt = document.getElementById('login-btn-text');
    if (btn) btn.disabled = false;
    if (txt) txt.textContent = 'Sign In';
  },

  setupLoginButtonGate: function() {
    var self = this;
    var btn = document.getElementById('login-submit-btn');
    var txt = document.getElementById('login-btn-text');
    var err = document.getElementById('login-error-msg');
    if (this.tenantInitialized) {
      this.enableLoginButton();
      return;
    }
    if (btn) btn.disabled = true;
    if (txt) txt.textContent = 'Connecting...';

    if (this._loginButtonTimeout) clearTimeout(this._loginButtonTimeout);
    this._loginButtonTimeout = setTimeout(function() {
      if (!self.tenantInitialized) {
        if (btn) btn.disabled = false;
        if (txt) txt.textContent = 'Retry Sign In';
        if (err) {
          err.style.display = 'block';
          err.textContent = 'Connecting is taking longer than usual. Tap Retry Sign In to connect.';
        }
      }
    }, 6000);
  },

  showLoginPage: function() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
    this.setupLoginButtonGate();
  },

  showApp: function() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-layout').classList.remove('hidden');

    this.updateBrandUI();

    // Update user info in sidebar
    if (this.currentUser) {
      var initials = this.getInitials(this.currentUser.firstName, this.currentUser.lastName);
      document.getElementById('sidebar-avatar').textContent = initials;
      document.getElementById('sidebar-avatar').setAttribute('data-color', this.getAvatarColor(this.currentUser.firstName));
      document.getElementById('header-avatar').textContent = initials;
      document.getElementById('header-avatar').setAttribute('data-color', this.getAvatarColor(this.currentUser.firstName));
      document.getElementById('sidebar-user-name').textContent = this.currentUser.firstName + ' ' + this.currentUser.lastName;
      document.getElementById('sidebar-user-role').textContent = this.currentUser.role === 'admin' ? 'Admin' : 'Teacher';
    }

    // Render filtered sidebar nav
    this.renderSidebarNav();

    // Show/hide admin nav
    var self = this;
    var adminNavs = document.querySelectorAll('.nav-admin-only');
    adminNavs.forEach(function(el) {
      if (self.isAdmin()) {
        el.style.display = '';
        el.classList.remove('hidden');
      } else {
        el.style.display = 'none';
        el.classList.add('hidden');
      }
    });

    // Show/hide My Attendance based on Teachers & Staff module
    var myAttendanceNav = document.querySelector('[data-page="teacher-attendance"]');
    if (myAttendanceNav) {
      if (self.checkFeatureAccess('teachers')) {
        myAttendanceNav.style.display = '';
        myAttendanceNav.classList.remove('hidden');
      } else {
        myAttendanceNav.style.display = 'none';
        myAttendanceNav.classList.add('hidden');
      }
    }

    // Check current hash on app load/login and navigate to correct page
    var hash = window.location.hash;
    var targetPage = 'dashboard';
    var targetTab = null;

    if (hash) {
      var parts = hash.substring(1).split('-');
      targetPage = parts[0];
      if (parts[1]) {
        targetTab = parts[1];
      }
    }

    // List of valid pages
    var validPages = ['dashboard', 'students', 'teachers', 'attendance', 'fees', 'timetable', 'exams', 'admin', 'help', 'teacher-attendance'];
    if (validPages.indexOf(targetPage) === -1) {
      targetPage = 'dashboard';
    }

    if (targetPage === 'admin' && targetTab) {
      var adminModule = this.modules['admin'];
      if (adminModule && typeof adminModule.setActiveTab === 'function') {
        adminModule.setActiveTab(targetTab);
      }
    }

    this.adminIsDirty = false;
    this.lastCleanTab = targetTab || 'settings';

    // Navigate to target page (passing fromHistory=true to avoid double pushing state on initial load)
    this.navigate(targetPage, true);
    
    // Ensure we have the correct initial history state set
    if (window.history) {
      var initialHash = (targetPage === 'admin' && targetTab && targetTab !== 'settings') ? '#admin-' + targetTab : '#' + targetPage;
      window.history.replaceState({page: targetPage, tab: targetTab}, '', initialHash);
    }
  },

  // ---------- Event Listeners ----------
  setupEventListeners: function() {
    var self = this;

    // Listen to changes inside admin page to track dirty state
    var pageAdmin = document.getElementById('page-admin');
    if (pageAdmin) {
      pageAdmin.addEventListener('input', function(e) {
        self.markAdminDirty(e);
      });
      pageAdmin.addEventListener('change', function(e) {
        self.markAdminDirty(e);
      });
    }

    // Intercept refresh and close attempts
    window.addEventListener('beforeunload', function(e) {
      if (self.adminIsDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Popstate event listener for browser back/forward buttons
    window.addEventListener('popstate', function(event) {
      if (self.currentUser) {
        if (event.state && event.state.page) {
          var page = event.state.page;
          var tab = event.state.tab;
          
          if (self.adminIsDirty) {
            self.pendingNavigation = { page: page, tab: tab, fromHistory: true };
            self.confirmUnsavedChanges(function() {
              if (page === 'admin') {
                var adminModule = self.modules['admin'];
                if (adminModule && typeof adminModule.setActiveTab === 'function') {
                  adminModule.setActiveTab(tab || 'settings');
                }
              }
              self.navigate(page, true);
            });
            return;
          }

          if (page === 'admin') {
            var adminModule = self.modules['admin'];
            if (adminModule && typeof adminModule.setActiveTab === 'function') {
              adminModule.setActiveTab(tab || 'settings');
            }
          }
          
          self.navigate(page, true);
        } else {
          // Fallback to dashboard if state is empty/null
          if (self.adminIsDirty) {
            self.pendingNavigation = { page: 'dashboard', tab: null, fromHistory: true };
            self.confirmUnsavedChanges(function() {
              self.navigate('dashboard', true);
            });
            return;
          }
          self.navigate('dashboard', true);
        }
      }
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async function(event) {
      event.preventDefault();
      
      const errorMsgEl = document.getElementById('login-error-msg');
      const submitBtn = document.getElementById('login-submit-btn');
      const btnText = document.getElementById('login-btn-text');

      // Clear previous error message
      if (errorMsgEl) {
        errorMsgEl.style.display = 'none';
        errorMsgEl.textContent = '';
      }

      // Show loading state: disable button, change text
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      if (btnText) {
        btnText.textContent = 'Signing in...';
      }

      var activeTab = document.querySelector('.login-tab.active');
      var role = activeTab ? activeTab.getAttribute('data-role') : 'admin';

      var credentials = {};
      if (role === 'admin') {
        credentials.username = document.getElementById('admin-username').value.trim();
        credentials.password = document.getElementById('admin-password').value;
      } else {
        credentials.email = document.getElementById('teacher-email').value.trim();
        credentials.password = document.getElementById('teacher-password').value;
      }

      try {
        const success = await self.login(role, credentials);
        if (success) {
          self.showToast('Welcome back, ' + self.currentUser.firstName + '!', 'success');
          self.showApp();
        } else {
          throw new Error("Login failed");
        }
      } catch (error) {
        console.error("Login attempt failed:", error);
        
        let friendlyMsg = "Login failed. Please try again.";
        const errMsg = (error && error.message) ? error.message.toLowerCase() : String(error).toLowerCase();
        const errCode = (error && error.code) ? error.code.toLowerCase() : '';

        // Check network status
        if (
          !navigator.onLine ||
          errCode.includes('network') ||
          errMsg.includes('network') ||
          errMsg.includes('connection') ||
          errMsg.includes('offline') ||
          errMsg.includes('internet') ||
          errMsg.includes('fetch')
        ) {
          friendlyMsg = "Connection error. Check your internet.";
        } else if (
          errCode === 'auth/wrong-password' ||
          errCode === 'auth/invalid-credential' ||
          errMsg.includes('wrong-password') ||
          errMsg.includes('incorrect password') ||
          errMsg.includes('invalid admin password') ||
          errMsg.includes('invalid password')
        ) {
          friendlyMsg = "Incorrect password. Please try again.";
        } else if (
          errCode === 'auth/user-not-found' ||
          errCode === 'auth/invalid-email' ||
          errMsg.includes('user-not-found') ||
          errMsg.includes('invalid-email') ||
          errMsg.includes('account not found') ||
          errMsg.includes('invalid admin username') ||
          errMsg.includes('no teacher found')
        ) {
          friendlyMsg = "Account not found. Check your credentials.";
        }

        // Show error message on screen below login button
        if (errorMsgEl) {
          errorMsgEl.textContent = friendlyMsg;
          errorMsgEl.style.display = 'block';
        }

        // Shake card feedback
        var card = document.querySelector('.login-card');
        if (card) {
          card.classList.add('shake');
          setTimeout(function() { card.classList.remove('shake'); }, 500);
        }
      } finally {
        // Restore button state
        if (submitBtn) {
          submitBtn.disabled = false;
        }
        if (btnText) {
          btnText.textContent = 'Sign In';
        }
      }
    });

    // Login tab switching
    document.querySelectorAll('.login-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        var role = this.getAttribute('data-role');
        document.getElementById('admin-fields').classList.toggle('hidden', role !== 'admin');
        document.getElementById('teacher-fields').classList.toggle('hidden', role !== 'teacher');
      });
    });

    // Theme toggle button click
    var themeToggleBtn = document.getElementById('app-theme-toggle');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', function() {
        self.toggleTheme();
      });
    }

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        var page = this.getAttribute('data-page');
        if (page && !self.checkFeatureAccess(page)) {
          e.preventDefault();
          e.stopPropagation();
          self.showUpsellModal(page);
          return;
        }
        e.preventDefault();
        if (page) {
          self.navigate(page);
        }
      });
    });

    var upsellTrialBtn = document.getElementById('upsell-trial-btn');
    if (upsellTrialBtn) {
      upsellTrialBtn.addEventListener('click', function() {
        document.getElementById('upsell-modal').classList.remove('active');
        SchoolApp.showToast("Your trial request has been submitted! Our support team will contact you shortly.", "success");
      });
    }

    // Sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', function() {
      var sidebar = document.getElementById('sidebar');
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('mobile-open');
      } else {
        self.sidebarCollapsed = !self.sidebarCollapsed;
        sidebar.classList.toggle('collapsed', self.sidebarCollapsed);
      }
    });

    // Mobile menu
    var mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', function() {
        document.getElementById('sidebar').classList.toggle('mobile-open');
      });
    }

    // Sidebar Overlay Click
    var overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', function() {
        document.getElementById('sidebar').classList.remove('mobile-open');
      });
    }

    // Logout
    document.getElementById('logout-btn').addEventListener('click', function() {
      self.showConfirm('Are you sure you want to logout?', function() {
        self.logout();
        self.showToast('Logged out successfully.', 'info');
      });
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', function() {
      self.closeModal();
    });
    document.getElementById('modal-overlay').addEventListener('click', function(e) {
      if (e.target === this) self.closeModal();
    });

    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', function(e) {
      var sidebar = document.getElementById('sidebar');
      var mobileBtn = document.getElementById('mobile-menu-btn');
      if (sidebar.classList.contains('mobile-open') &&
          !sidebar.contains(e.target) &&
          !mobileBtn.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        self.closeModal();
        var confirm = document.getElementById('confirm-dialog');
        if (confirm.classList.contains('active')) {
          confirm.classList.remove('active');
        }
      }
    });

    // Notification Toggle Click
    var bellBtn = document.getElementById('notification-btn');
    if (bellBtn) {
      bellBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.toggleNotificationDropdown();
      });
    }

    // Close notification dropdown when clicking outside
    document.addEventListener('click', function(e) {
      var dropdown = document.getElementById('notification-dropdown');
      var btn = document.getElementById('notification-btn');
      if (dropdown && !dropdown.classList.contains('hidden') &&
          !dropdown.contains(e.target) &&
          (!btn || !btn.contains(e.target))) {
        dropdown.classList.add('hidden');
      }

      var profileDropdown = document.getElementById('profile-dropdown');
      var headerAvatar = document.getElementById('header-avatar');
      if (profileDropdown && !profileDropdown.classList.contains('hidden') &&
          !profileDropdown.contains(e.target) &&
          (!headerAvatar || !headerAvatar.contains(e.target))) {
        profileDropdown.classList.add('hidden');
      }
    });

    // Profile Avatar Dropdown Click
    var headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) {
      headerAvatar.addEventListener('click', function(e) {
        e.stopPropagation();
        var dropdown = document.getElementById('profile-dropdown');
        if (dropdown) {
          dropdown.classList.toggle('hidden');
        }
      });
    }

    // Profile Dropdown items click listeners
    var profileMyProfile = document.getElementById('profile-my-profile');
    if (profileMyProfile) {
      profileMyProfile.addEventListener('click', function(e) {
        e.preventDefault();
        var dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        self.showMyProfileModal();
      });
    }

    var profileLogout = document.getElementById('profile-logout');
    if (profileLogout) {
      profileLogout.addEventListener('click', function(e) {
        e.preventDefault();
        var dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        self.showConfirm('Are you sure you want to logout?', function() {
          self.logout();
          self.showToast('Logged out successfully.', 'info');
        });
      });
    }

    // Global quick search logic
    var globalSearch = document.getElementById('global-search');
    if (globalSearch) {
      globalSearch.addEventListener('input', function(e) {
        var query = this.value.trim().toLowerCase();
        
        // Remove existing dropdown first
        var existingDropdown = document.querySelector('.global-search-results');
        if (existingDropdown) {
          existingDropdown.remove();
        }

        if (query.length < 2) return;

        // Search students
        var students = self.store.students || [];
        // Teacher class assignment filter
        if (self.isTeacher() && self.currentUser.assignedClasses) {
          var ac = self.currentUser.assignedClasses;
          students = students.filter(function(s) {
            return ac.some(function(c) { return c.class === s.class && c.section === s.section; });
          });
        }
        var matchedStudents = students.filter(function(s) {
          return (s.firstName + ' ' + s.lastName).toLowerCase().indexOf(query) !== -1 ||
                 s.rollNumber.toLowerCase().indexOf(query) !== -1;
        }).map(function(s) {
          return {
            id: s.id,
            name: s.firstName + ' ' + s.lastName,
            role: 'Student · Class ' + s.class + '-' + s.section,
            type: 'student'
          };
        });

        // Search teachers
        var teachers = self.store.teachers || [];
        var matchedTeachers = teachers.filter(function(t) {
          return (t.firstName + ' ' + t.lastName).toLowerCase().indexOf(query) !== -1 ||
                 t.subject.toLowerCase().indexOf(query) !== -1;
        }).map(function(t) {
          return {
            id: t.id,
            name: t.firstName + ' ' + t.lastName,
            role: 'Teacher · ' + t.subject,
            type: 'teacher'
          };
        });

        var matches = matchedStudents.concat(matchedTeachers).slice(0, 10);

        // Render search results dropdown
        var dropdown = document.createElement('div');
        dropdown.className = 'global-search-results';

        if (matches.length > 0) {
          matches.forEach(function(item) {
            var initials = self.getInitials(item.name.split(' ')[0], item.name.split(' ')[1] || '');
            var color = self.getAvatarColor(item.name);

            var itemEl = document.createElement('div');
            itemEl.className = 'global-search-item';
            itemEl.innerHTML = 
              '<div class="avatar avatar-sm" data-color="' + color + '">' + initials + '</div>' +
              '<div class="info">' +
                '<span class="name">' + item.name + '</span>' +
                '<span class="role">' + item.role + '</span>' +
              '</div>';

            itemEl.addEventListener('click', function() {
              self.navigate(item.type === 'student' ? 'students' : 'teachers');
              
              // Trigger detail modal display
              setTimeout(function() {
                if (item.type === 'student' && self.modules.students && self.modules.students.viewStudent) {
                  self.modules.students.viewStudent(item.id);
                } else if (item.type === 'teacher' && self.modules.teachers && self.modules.teachers.viewTeacher) {
                  self.modules.teachers.viewTeacher(item.id);
                }
              }, 100);

              globalSearch.value = '';
              dropdown.remove();
            });

            dropdown.appendChild(itemEl);
          });
        } else {
          var noResults = document.createElement('div');
          noResults.className = 'global-search-no-results';
          noResults.textContent = 'No results found';
          dropdown.appendChild(noResults);
        }

        var searchWrapper = globalSearch.closest('.header-search');
        if (searchWrapper) {
          searchWrapper.appendChild(dropdown);
        }
      });
    }

    // Close global search dropdown on clicking outside or pressing Escape
    document.addEventListener('click', function(e) {
      var searchWrapper = document.querySelector('.header-search');
      if (searchWrapper && !searchWrapper.contains(e.target)) {
        var dropdown = document.querySelector('.global-search-results');
        if (dropdown) {
          dropdown.remove();
        }
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var dropdown = document.querySelector('.global-search-results');
        if (dropdown) {
          dropdown.remove();
        }
      }
    });

    // Delegated click listener for password fields toggle icons
    document.addEventListener('click', function(e) {
      if (e.target && e.target.classList.contains('toggle-password')) {
        var icon = e.target;
        var wrapper = icon.closest('.password-wrapper');
        if (wrapper) {
          var input = wrapper.querySelector('input');
          if (input) {
            if (input.type === 'password') {
              input.type = 'text';
              icon.classList.remove('fa-eye');
              icon.classList.add('fa-eye-slash');
            } else {
              input.type = 'password';
              icon.classList.remove('fa-eye-slash');
              icon.classList.add('fa-eye');
            }
          }
        }
      }
    });
  },

  showImpersonationBanner: function(schoolName, role) {
    // Remove existing banner if any
    var existing = document.getElementById('impersonation-banner');
    if (existing) existing.remove();
    
    var banner = document.createElement('div');
    banner.id = 'impersonation-banner';
    banner.className = 'impersonation-banner';
    banner.innerHTML = '<div class="imp-banner-content">' +
      '<span class="imp-banner-icon">⚡</span>' +
      '<span class="imp-banner-text">Impersonating <strong>' + schoolName + '</strong> as <strong>' + (role === 'teacher' ? 'Teacher' : 'Administrator') + '</strong> (View-Only Mode)</span>' +
      '<button class="imp-banner-exit" id="exit-impersonation-btn">Exit Impersonation</button>' +
      '</div>';
    
    document.body.insertBefore(banner, document.body.firstChild);
    
    // Shift app layout down
    var appLayout = document.getElementById('app-layout');
    if (appLayout) {
      appLayout.style.marginTop = '48px';
    }
    
    // Bind exit button
    document.getElementById('exit-impersonation-btn').addEventListener('click', function() {
      localStorage.removeItem('impersonate_school_id');
      localStorage.removeItem('impersonate_role');
      sessionStorage.removeItem('isImpersonating');
      var isProd = window.location.hostname.endsWith('ctrlshifts.in');
      if (isProd) {
        window.location.href = 'https://ctrlshifts.in/super-admin.html';
      } else {
        window.location.href = 'super-admin.html';
      }
    });
  }
};

window.assertSchoolIsolation = window.SchoolApp.assertSchoolIsolation;

// ---------- Initialization ----------
document.addEventListener('DOMContentLoaded', async function() {
  var hasData = await SchoolApp.load();
  SchoolApp.updateBrandUI();

  // Apply saved theme on page load
  SchoolApp.applyUserTheme();

  // ---- Impersonation Auto-Login Check ----
  var urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
  var impSchoolId = (urlParams ? urlParams.get('impersonate_school_id') : null) || localStorage.getItem('impersonate_school_id');
  var impRole = (urlParams ? urlParams.get('impersonate_role') : null) || localStorage.getItem('impersonate_role');
  if (impSchoolId && impRole) {
    localStorage.setItem('impersonate_school_id', impSchoolId);
    localStorage.setItem('impersonate_role', impRole);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('isImpersonating', 'true');
    }
    var allSchools = SchoolApp.store.schools || [];
    var targetSchool = null;
    for (var i = 0; i < allSchools.length; i++) {
      if (allSchools[i].school_id === impSchoolId) {
        targetSchool = allSchools[i];
        break;
      }
    }
    if (targetSchool) {
      // Override school settings for impersonation
      SchoolApp.store.currentSchoolId = impSchoolId;
      if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
      SchoolApp.store.settings.schoolName = targetSchool.school_name;
      if (!SchoolApp.store.settings.schoolInfo) SchoolApp.store.settings.schoolInfo = {};
      SchoolApp.store.settings.schoolInfo.name = targetSchool.school_name;
      SchoolApp.store.settings.schoolInfo.logoUrl = targetSchool.logo_url;
      SchoolApp.store.settings.logoUrl = targetSchool.logo_url;
      if (targetSchool.address) SchoolApp.store.settings.address = targetSchool.address;
      if (targetSchool.phone) SchoolApp.store.settings.phone = targetSchool.phone;
      if (targetSchool.email) SchoolApp.store.settings.email = targetSchool.email;
      
      SchoolApp.updateBrandUI();

      // Set user session based on role
      if (impRole === 'teacher') {
        var teachers = SchoolApp.store.teachers || [];
        SchoolApp.currentUser = {
          role: 'teacher',
          id: teachers.length > 0 ? teachers[0].id : 'imp_teacher',
          name: teachers.length > 0 ? teachers[0].name : 'Impersonated Teacher',
          email: teachers.length > 0 ? teachers[0].email : 'teacher@school.edu.in'
        };
      } else {
        SchoolApp.currentUser = {
          role: 'admin',
          name: 'Administrator',
          username: SchoolApp.store.settings.adminUsername || 'admin'
        };
      }
      
      // Skip login, go directly to app
      SchoolApp.applyUserTheme();
      SchoolApp.setupEventListeners();
      SchoolApp.updateSidebarLockBadges();
      SchoolApp.updateNotificationBadge();
      SchoolApp.runAutoFeeReconciliation();
      setTimeout(function() {
        Object.keys(SchoolApp.modules).forEach(function(name) {
          var mod = SchoolApp.modules[name];
          if (mod.init) mod.init();
        });
      }, 50);
      SchoolApp.showApp();
      SchoolApp.navigate('dashboard');
      
      // Show impersonation banner
      SchoolApp.showImpersonationBanner(targetSchool.school_name, impRole);
      return; // Skip normal login flow
    }
  }

  // SAFEGUARD: Auto-client seeding of svm_bokaro_001 disabled to prevent accidental wipes.
  // Greenwood Public School now has its dedicated professional dataset.

  // Setup event listeners
  SchoolApp.setupEventListeners();

  // Update sidebar lock badges on startup
  SchoolApp.updateSidebarLockBadges();

  // Update notification badge on load
  SchoolApp.updateNotificationBadge();

  // Securely run auto-fee reconciliation on app startup
  SchoolApp.runAutoFeeReconciliation();

  // Initialize registered modules
  setTimeout(function() {
    Object.keys(SchoolApp.modules).forEach(function(name) {
      var mod = SchoolApp.modules[name];
      if (mod.init) mod.init();
    });
  }, 50);

  // Show login page
  SchoolApp.showLoginPage();
});
