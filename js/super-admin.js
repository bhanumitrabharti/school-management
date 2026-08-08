/**
 * ===================================================
 *  SUPER ADMIN PORTAL — JavaScript Controller
 *  CTRL Shift Solutions — SaaS Control Center
 * ===================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, onSnapshot, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPKi-0EjMjsA9q60rwEHeI2T9HTWPGklo",
  authDomain: "ctrl-shift-solutions.firebaseapp.com",
  projectId: "ctrl-shift-solutions",
  storageBucket: "ctrl-shift-solutions.firebasestorage.app",
  messagingSenderId: "958349968165",
  appId: "1:958349968165:web:e11daa979fcff8f6f0d0cc"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

(function () {
    'use strict';

    // ─── Collapsible Form States ────────────────────────
    var formClasses = [];
    var formSections = {};
    var formFeeStructure = {};
    var formFeeHeads = ["tuition", "transport", "exam"];
    var formExtraCharges = [];
    var currentAdminPasswordHash = '';

    // ─── Constants ──────────────────────────────────────
    var STORAGE_KEY = 'shishuvikash_data';
    var SESSION_KEY = 'sa_session';
    var CREDENTIALS = { username: 'superadmin', password: 'superadmin123' };

    // Expose cache and functions on window
    window.saCache = {
        schools: [],
        recovery_trash: [],
        support_tickets: [],
        audit_logs: []
    };

    var isDataLoaded = false;
    var schoolsUnsub = null;
    var trashUnsub = null;
    var ticketsUnsub = null;
    var logsUnsub = null;

    function cleanupSuperAdminListeners() {
        if (schoolsUnsub) { schoolsUnsub(); schoolsUnsub = null; }
        if (trashUnsub) { trashUnsub(); trashUnsub = null; }
        if (ticketsUnsub) { ticketsUnsub(); ticketsUnsub = null; }
        if (logsUnsub) { logsUnsub(); logsUnsub = null; }
    }

    function triggerSaTabRender() {
        const activeTab = document.querySelector('.sa-nav-item.active');
        if (!activeTab) return;
        const tabId = activeTab.getAttribute('data-tab');
        if (tabId === 'dashboard') {
            renderDashboard();
        } else if (tabId === 'schools') {
            renderSchoolsTab();
        } else if (tabId === 'tickets') {
            renderTicketsTab();
        } else if (tabId === 'recovery') {
            renderRecoveryTab();
        } else if (tabId === 'logs') {
            renderLogsTab();
        }
    }

    async function ensureDataLoaded() {
        if (isDataLoaded) return;
        
        cleanupSuperAdminListeners();

        return new Promise((resolve, reject) => {
            let loadedCount = 0;
            const totalToLoad = 4;
            function checkResolve() {
                loadedCount++;
                if (loadedCount === totalToLoad) {
                    isDataLoaded = true;
                    resolve();
                }
            }

            if (!window.saConnectionEventsBound) {
                window.saConnectionEventsBound = true;
                window.addEventListener('online', function() {
                    updateSaConnectionIndicator(true);
                });
                window.addEventListener('offline', function() {
                    updateSaConnectionIndicator(true);
                });
            }

            function updateSaConnectionIndicator(fromCache) {
                const indicator = document.getElementById('live-indicator');
                const dot = indicator ? indicator.querySelector('.live-dot') : null;
                const text = document.getElementById('live-status-text');
                if (!indicator || !dot || !text) return;
                const isOnline = navigator.onLine;
                if (isOnline && !fromCache) {
                    indicator.style.color = '#10B981';
                    indicator.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
                    indicator.style.borderColor = 'rgba(16, 185, 129, 0.15)';
                    dot.style.backgroundColor = '#10B981';
                    dot.style.boxShadow = '0 0 6px #10B981';
                    dot.style.animation = 'pulse-dot 1.8s infinite';
                    text.textContent = 'Live';
                } else {
                    indicator.style.color = '#F59E0B';
                    indicator.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
                    indicator.style.borderColor = 'rgba(245, 158, 11, 0.15)';
                    dot.style.backgroundColor = '#F59E0B';
                    dot.style.boxShadow = '0 0 6px #F59E0B';
                    dot.style.animation = 'pulse-dot-warning 1.8s infinite';
                    text.textContent = 'Reconnecting...';
                }
            }

            const schoolsCol = collection(db, 'schools');
            schoolsUnsub = onSnapshot(schoolsCol, { includeMetadataChanges: true }, async (snapshot) => {
                updateSaConnectionIndicator(snapshot.metadata.fromCache);
                
                let schoolsList = [];
                snapshot.forEach((docSnap) => {
                    schoolsList.push(docSnap.data());
                });

                if (schoolsList.length === 0) {
                    for (const s of defaultSchools) {
                        await setDoc(doc(db, 'schools', s.school_id), s);
                    }
                    schoolsList = JSON.parse(JSON.stringify(defaultSchools));
                }
                window.saCache.schools = schoolsList;
                
                if (loadedCount >= totalToLoad) {
                    triggerSaTabRender();
                }

                if (loadedCount < totalToLoad) checkResolve();
            }, (error) => {
                console.error("Schools sync error:", error);
                updateSaConnectionIndicator(true);
                if (loadedCount < totalToLoad) checkResolve();
            });

            const trashDocRef = doc(db, 'sa_data', 'recovery_trash');
            trashUnsub = onSnapshot(trashDocRef, { includeMetadataChanges: true }, async (docSnap) => {
                updateSaConnectionIndicator(docSnap.metadata.fromCache);

                if (docSnap.exists()) {
                    window.saCache.recovery_trash = docSnap.data().trash || [];
                } else {
                    await setDoc(trashDocRef, { trash: defaultRecoveryTrash });
                    window.saCache.recovery_trash = JSON.parse(JSON.stringify(defaultRecoveryTrash));
                }

                if (loadedCount >= totalToLoad) {
                    triggerSaTabRender();
                }
                if (loadedCount < totalToLoad) checkResolve();
            }, (error) => {
                console.error("Trash sync error:", error);
                updateSaConnectionIndicator(true);
                if (loadedCount < totalToLoad) checkResolve();
            });

            const ticketsDocRef = doc(db, 'sa_data', 'support_tickets');
            ticketsUnsub = onSnapshot(ticketsDocRef, { includeMetadataChanges: true }, async (docSnap) => {
                updateSaConnectionIndicator(docSnap.metadata.fromCache);

                if (docSnap.exists()) {
                    window.saCache.support_tickets = docSnap.data().tickets || [];
                } else {
                    await setDoc(ticketsDocRef, { tickets: defaultSupportTickets });
                    window.saCache.support_tickets = JSON.parse(JSON.stringify(defaultSupportTickets));
                }

                if (loadedCount >= totalToLoad) {
                    triggerSaTabRender();
                }
                if (loadedCount < totalToLoad) checkResolve();
            }, (error) => {
                console.error("Tickets sync error:", error);
                updateSaConnectionIndicator(true);
                if (loadedCount < totalToLoad) checkResolve();
            });

            const logsDocRef = doc(db, 'sa_data', 'audit_logs');
            logsUnsub = onSnapshot(logsDocRef, { includeMetadataChanges: true }, async (docSnap) => {
                updateSaConnectionIndicator(docSnap.metadata.fromCache);

                if (docSnap.exists()) {
                    window.saCache.audit_logs = docSnap.data().logs || [];
                } else {
                    await setDoc(logsDocRef, { logs: defaultAuditLogs });
                    window.saCache.audit_logs = JSON.parse(JSON.stringify(defaultAuditLogs));
                }

                if (loadedCount >= totalToLoad) {
                    triggerSaTabRender();
                }
                if (loadedCount < totalToLoad) checkResolve();
            }, (error) => {
                console.error("Logs sync error:", error);
                updateSaConnectionIndicator(true);
                if (loadedCount < totalToLoad) checkResolve();
            });
        });
    }

    // Expose globally so dashboard can call it
    window.ensureDataLoaded = ensureDataLoaded;

    // ─── Filter State ───────────────────────────────────
    var state = {
        searchQuery: '',
        statusFilter: 'all' // 'all', 'Active', 'Paused'
    };

    // Feature key → human-readable label map
    var FEATURE_LABELS = {
        dashboard:     'Dashboard',
        students:      'Students & Admissions',
        teachers:      'Teachers & Staff',
        attendance:    'Attendance Tracking',
        fees:          'Fees & Payments',
        fee_ledger:    'Fee Ledger & Transactions',
        print_receipt: 'Print Receipt',
        timetable:     'Timetable & Scheduling',
        exams:         'Exams & Results',
        notices:       'Notice Board',
        promotion:     'Class Promotion',
        users:         'User Management',
        recovery:      'Recovery Center',
        help:          'Help & Support'
    };

    // All toggleable module keys (the 12 core modules)
    var MODULE_KEYS = [
        'students', 'teachers', 'attendance', 'fees',
        'fee_ledger', 'print_receipt', 'timetable', 'exams',
        'notices', 'promotion', 'users', 'recovery'
    ];

    // Mock seed data
    var defaultSchools = [
        {
            school_id: 'svm_bokaro_001',
            school_name: 'Shishu Vikash Mandir (Bokaro)',
            tagline: 'Nurturing Young Minds',
            phone: '+91 98765 43210',
            email: 'bhanu.bharti@ctrlshifts.in',
            address: '123 Education Lane, Bokaro Steel City, Jharkhand 827001',
            subdomain: 'svm-bokaro',
            plan: 'Premium',
            status: 'Active',
            storage_used: '1.2 GB',
            renewal_date: '2026-12-31',
            last_login: '2 hours ago',
            logo_url: './school-logo-updated.jpg',
            allowed_features: ['dashboard','students','teachers','attendance','fees','fee_ledger','print_receipt','timetable','exams','notices','promotion','users','recovery','help']
        },
        {
            school_id: 'dav_ranchi_002',
            school_name: 'DAV Public School (Ranchi)',
            tagline: 'Excellence in Education',
            phone: '+91 98765 11111',
            email: 'admin@davranchi.edu.in',
            address: '45 Knowledge Park, Ranchi, Jharkhand 834002',
            subdomain: 'dav-ranchi',
            plan: 'Pro',
            status: 'Active',
            storage_used: '850 MB',
            renewal_date: '2026-09-15',
            last_login: '5 days ago',
            logo_url: '',
            allowed_features: ['dashboard','students','teachers','attendance','fees','help']
        },
        {
            school_id: 'dps_dhanbad_003',
            school_name: 'DPS Dhanbad',
            tagline: 'Shaping Tomorrow\'s Leaders',
            phone: '+91 98765 22222',
            email: 'admin@dpsdhanbad.edu.in',
            address: '78 Academic Avenue, Dhanbad, Jharkhand 826001',
            subdomain: 'dps-dhanbad',
            plan: 'Basic',
            status: 'Paused',
            storage_used: '200 MB',
            renewal_date: '2026-06-30',
            last_login: 'Inactive for 15 days',
            logo_url: '',
            allowed_features: ['dashboard','students','attendance','help']
        }
    ];

    var defaultRecoveryTrash = [
        {
            id: 'rec_001',
            school_id: 'svm_bokaro_001',
            school_name: 'Shishu Vikash Mandir (Bokaro)',
            data_type: 'Student Profile (Rahul Kumar)',
            deleted_by: 'Teacher - Pooja',
            deleted_time: '2026-06-08 15:30'
        },
        {
            id: 'rec_002',
            school_id: 'dav_ranchi_002',
            school_name: 'DAV Public School (Ranchi)',
            data_type: 'Fee Receipt #1042',
            deleted_by: 'Admin - Sanjay',
            deleted_time: '2026-06-07 11:20'
        },
        {
            id: 'rec_003',
            school_id: 'dps_dhanbad_003',
            school_name: 'DPS Dhanbad',
            data_type: 'Attendance Record (Class X - B)',
            deleted_by: 'Teacher - Anita',
            deleted_time: '2026-06-06 09:15'
        }
    ];

    var defaultSupportTickets = [
        {
            ticket_id: 'TKT-101',
            school_id: 'svm_bokaro_001',
            school_name: 'Shishu Vikash Mandir (Bokaro)',
            priority: 'High',
            issue_description: 'UPI payment gateway failing during peak school fee collection hours.',
            status: 'Open'
        },
        {
            ticket_id: 'TKT-102',
            school_id: 'dav_ranchi_002',
            school_name: 'DAV Public School (Ranchi)',
            priority: 'Medium',
            issue_description: 'Teachers unable to export attendance reports to Excel/CSV format.',
            status: 'Open'
        },
        {
            ticket_id: 'TKT-103',
            school_id: 'dps_dhanbad_003',
            school_name: 'DPS Dhanbad',
            priority: 'Low',
            issue_description: 'Typographical error in student name field for grade promotion module.',
            status: 'Closed'
        }
    ];

    var defaultAuditLogs = [
        {
            school_id: 'svm_bokaro_001',
            timestamp: '2026-06-08 16:45',
            actor: 'Teacher - Pooja',
            action: 'Deleted Student Profile (Rahul Kumar)',
            type: 'delete'
        },
        {
            school_id: 'svm_bokaro_001',
            timestamp: '2026-06-08 14:15',
            actor: 'Admin - Amit',
            action: 'Added Student Profile (Priya Sharma)',
            type: 'add'
        },
        {
            school_id: 'svm_bokaro_001',
            timestamp: '2026-06-08 11:00',
            actor: 'Teacher - Pooja',
            action: 'Updated Attendance Record for Class X',
            type: 'update'
        },
        {
            school_id: 'dav_ranchi_002',
            timestamp: '2026-06-07 12:10',
            actor: 'Admin - Sanjay',
            action: 'Deleted Fee Receipt #1042',
            type: 'delete'
        },
        {
            school_id: 'dav_ranchi_002',
            timestamp: '2026-06-06 09:30',
            actor: 'Teacher - Ritu',
            action: 'Added Exam Marks for Class XII',
            type: 'add'
        },
        {
            school_id: 'dav_ranchi_002',
            timestamp: '2026-06-05 14:22',
            actor: 'Admin - Sanjay',
            action: 'Updated Plan details for Pro status',
            type: 'update'
        },
        {
            school_id: 'dps_dhanbad_003',
            timestamp: '2026-06-06 10:15',
            actor: 'Teacher - Anita',
            action: 'Deleted Attendance Record (Class X - B)',
            type: 'delete'
        },
        {
            school_id: 'dps_dhanbad_003',
            timestamp: '2026-06-05 10:00',
            actor: 'Admin - Kiran',
            action: 'Updated Notice Board announcements',
            type: 'update'
        }
    ];


    // ─── Data Layer ─────────────────────────────────────

    /**
     * Load the entire app data from memory cache.
     */
    function loadData() {
        return {
            schools: window.saCache.schools,
            recovery_trash: window.saCache.recovery_trash,
            support_tickets: window.saCache.support_tickets,
            audit_logs: window.saCache.audit_logs
        };
    }

    /** Persist the data synchronously to memory cache. */
    function saveData(data) {
        window.saCache.schools = data.schools || [];
        window.saCache.recovery_trash = data.recovery_trash || [];
        window.saCache.support_tickets = data.support_tickets || [];
        window.saCache.audit_logs = data.audit_logs || [];
    }


    // ─── DOM References ─────────────────────────────────

    var loginPage      = document.getElementById('sa-login-page');
    var dashboard      = document.getElementById('sa-dashboard');
    var loginForm      = document.getElementById('sa-login-form');
    var loginError     = document.getElementById('sa-login-error');
    var loginErrorMsg  = document.getElementById('sa-login-error-msg');
    var usernameInput  = document.getElementById('sa-username');
    var passwordInput  = document.getElementById('sa-password');
    var pwToggle       = document.getElementById('sa-pw-toggle');
    var metricsGrid    = document.getElementById('sa-metrics-grid');
    var schoolsTbody   = document.getElementById('sa-schools-tbody');
    var btnAddSchool   = document.getElementById('sa-btn-add-school');
    var btnLogout      = document.getElementById('sa-btn-logout');
    var modalOverlay   = document.getElementById('sa-modal-overlay');
    var modalTitleText = document.getElementById('sa-modal-title-text');
    var modalClose     = document.getElementById('sa-modal-close');
    var modalCancel    = document.getElementById('sa-modal-cancel');
    var modalSave      = document.getElementById('sa-modal-save');
    var schoolForm     = document.getElementById('sa-school-form');
    var toastContainer = document.getElementById('sa-toast-container');

    // Sidebar & Tab Pages References
    var sidebarNav     = document.querySelector('.sa-sidebar-nav');
    var tabPages       = document.querySelectorAll('.sa-tab-page');
    var navItems       = document.querySelectorAll('.sa-nav-item');
    var recoveryTbody  = document.getElementById('sa-recovery-tbody');
    var ticketsTbody   = document.getElementById('sa-tickets-tbody');

    // School Profile Modal References
    var profileModalOverlay  = document.getElementById('sa-profile-modal-overlay');
    var profileTitle         = document.getElementById('sa-profile-title');
    var profileModalClose    = document.getElementById('sa-profile-modal-close');
    var profileModalCloseBtn = document.getElementById('sa-profile-modal-close-btn');
    var profileTabBtns       = document.querySelectorAll('.sa-profile-tab-btn');
    var profileTabContents   = document.querySelectorAll('.sa-profile-tab-content');
    var profPlanBadge        = document.getElementById('prof-plan-badge');
    var profStorage          = document.getElementById('prof-storage');
    var profStatusBadge      = document.getElementById('prof-status-badge');
    var profRenewal          = document.getElementById('prof-renewal');
    var profEmail            = document.getElementById('prof-email');
    var profPhone            = document.getElementById('prof-phone');
    var profAddress          = document.getElementById('prof-address');
    var profFeaturesList     = document.getElementById('prof-features-list');
    var auditTbody           = document.getElementById('sa-audit-tbody');


    // ─── Login Logic ────────────────────────────────────

    /** Validate credentials and switch to dashboard. */
    async function saLogin(username, password) {
        if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
            sessionStorage.setItem(SESSION_KEY, 'active');
            loginPage.classList.add('hidden');
            dashboard.classList.add('active');
            loginError.classList.remove('visible');
            loginForm.reset();
            
            showToast('Loading database from Cloud Firestore...', 'info');
            await ensureDataLoaded();
            initLeadsListener();
            
            renderDashboard();
            showToast('Welcome back, Super Admin!', 'success');
            return true;
        } else {
            loginErrorMsg.textContent = 'Invalid username or password. Please try again.';
            loginError.classList.add('visible');
            passwordInput.value = '';
            passwordInput.focus();
            return false;
        }
    }

    /** End session and return to login. */
    function saLogout() {
        sessionStorage.removeItem(SESSION_KEY);
        dashboard.classList.remove('active');
        loginPage.classList.remove('hidden');
        showToast('Logged out successfully', 'info');
        unsubscribeLeads();
        cleanupSuperAdminListeners();
    }

    // ─── Leads & Demos Logic ────────────────────────────
    var unsubscribeLeadsListener = null;
    var leadsCache = [];
    var initialLeadsLoadDone = false;

    function initLeadsListener() {
        if (unsubscribeLeadsListener) return;

        const leadsCol = collection(db, 'demo_requests');
        const q = query(leadsCol, orderBy('createdAt', 'desc'));

        unsubscribeLeadsListener = onSnapshot(q, (snapshot) => {
            let newlyAddedLeads = [];
            
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const leadData = change.doc.data();
                    leadData.id = change.doc.id;
                    newlyAddedLeads.push(leadData);
                }
            });

            // Rebuild cache
            let updatedLeads = [];
            snapshot.forEach((docSnap) => {
                const lead = docSnap.data();
                lead.id = docSnap.id;
                updatedLeads.push(lead);
            });
            leadsCache = updatedLeads;

            // Trigger toast for new leads ONLY after initial load is complete
            if (initialLeadsLoadDone) {
                newlyAddedLeads.forEach((lead) => {
                    showToast(`🔔 New lead from ${lead.schoolName || 'Unknown School'}!`, 'info');
                });
            } else {
                initialLeadsLoadDone = true;
            }

            // Re-render leads tab if it's the active tab, and update metrics cards
            updateLeadsMetrics();
            const activeTab = document.querySelector('.sa-nav-item.active');
            if (activeTab && activeTab.getAttribute('data-tab') === 'leads') {
                renderLeadsTab();
            }
        }, (error) => {
            console.error("Leads real-time sync error:", error);
            showToast("Failed to sync leads in real time.", "error");
        });
    }

    function unsubscribeLeads() {
        if (unsubscribeLeadsListener) {
            unsubscribeLeadsListener();
            unsubscribeLeadsListener = null;
            initialLeadsLoadDone = false;
        }
    }

    function updateLeadsMetrics() {
        const total = leadsCache.length;
        let newCount = 0;
        let contacted = 0;
        let converted = 0;
        let lost = 0;

        leadsCache.forEach((lead) => {
            const status = (lead.status || 'new').toLowerCase();
            if (status === 'new') newCount++;
            else if (status === 'contacted') contacted++;
            else if (status === 'converted') converted++;
            else if (status === 'lost') lost++;
        });

        // Update metric DOM elements
        const totalEl = document.getElementById('sa-leads-total');
        const newEl = document.getElementById('sa-leads-new');
        const contactedEl = document.getElementById('sa-leads-contacted');
        const convertedEl = document.getElementById('sa-leads-converted');
        const lostEl = document.getElementById('sa-leads-lost');

        if (totalEl) totalEl.textContent = total;
        if (newEl) newEl.textContent = newCount;
        if (contactedEl) contactedEl.textContent = contacted;
        if (convertedEl) convertedEl.textContent = converted;
        if (lostEl) lostEl.textContent = lost;
    }

    function renderLeadsTab(searchQuery = '') {
        const tbody = document.getElementById('sa-leads-tbody');
        if (!tbody) return;

        const queryVal = searchQuery.trim().toLowerCase();
        const filteredLeads = leadsCache.filter((lead) => {
            if (!queryVal) return true;
            return (
                (lead.schoolName || '').toLowerCase().includes(queryVal) ||
                (lead.ownerName || '').toLowerCase().includes(queryVal) ||
                (lead.phone || '').toLowerCase().includes(queryVal) ||
                (lead.city || '').toLowerCase().includes(queryVal)
            );
        });

        if (filteredLeads.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="sa-empty-state">
                        <span class="material-icons-round">contact_mail</span>
                        <h3>No leads found</h3>
                        <p>${queryVal ? 'Try a different search query' : 'No demo requests submitted yet'}</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        filteredLeads.forEach((lead) => {
            const tr = document.createElement('tr');
            
            // Format date
            let dateStr = 'N/A';
            if (lead.createdAt) {
                try {
                    const dateObj = new Date(lead.createdAt);
                    dateStr = dateObj.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    }) + ' ' + dateObj.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch (e) {
                    dateStr = lead.createdAt;
                }
            }

            // Status Badge styling
            const status = (lead.status || 'new').toLowerCase();

            // WhatsApp link text
            const waMessage = `Namaste ${lead.ownerName || 'ji'}! Main CTRL Shift Solutions se bol raha hoon. Aapne Paathshala ERP ka demo request kiya tha ${lead.schoolName || ''} ke liye. Kya aap abhi baat kar sakte hain?`;
            const waUrl = `https://wa.me/91${lead.phone}?text=${encodeURIComponent(waMessage)}`;

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td><strong>${lead.schoolName || 'N/A'}</strong></td>
                <td>${lead.ownerName || 'N/A'}</td>
                <td><a href="tel:+91${lead.phone}" style="color:#60a5fa; text-decoration:none;">+91 ${lead.phone}</a></td>
                <td>${lead.city || 'N/A'}</td>
                <td>${lead.studentCount || 'N/A'}</td>
                <td>
                    <select class="sa-lead-status-select" data-lead-id="${lead.id}" style="padding: 4px 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color:#fff; font-size:12px; font-family:'Inter', sans-serif;">
                        <option value="new" ${status === 'new' ? 'selected' : ''}>New</option>
                        <option value="contacted" ${status === 'contacted' ? 'selected' : ''}>Contacted</option>
                        <option value="converted" ${status === 'converted' ? 'selected' : ''}>Converted</option>
                        <option value="lost" ${status === 'lost' ? 'selected' : ''}>Lost</option>
                    </select>
                </td>
                <td>
                    <div class="sa-actions">
                        <a href="tel:+91${lead.phone}" class="sa-action-btn btn-resume" title="Call Lead">
                            <span class="material-icons-round">phone</span>
                        </a>
                        <a href="${waUrl}" target="_blank" class="sa-action-btn btn-impersonate" title="WhatsApp Lead" style="background: rgba(37, 211, 102, 0.1); color: #25D366; border-color: rgba(37, 211, 102, 0.2); text-decoration: none;">
                            <span class="fab fa-whatsapp"></span>
                        </a>
                        <button class="sa-action-btn btn-edit btn-view-lead" data-lead-id="${lead.id}" title="View Details">
                            <span class="material-icons-round">visibility</span>
                        </button>
                        <button class="sa-action-btn btn-pause btn-delete-lead" data-lead-id="${lead.id}" title="Delete Lead">
                            <span class="material-icons-round">delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add event listeners to inline status dropdowns
        tbody.querySelectorAll('.sa-lead-status-select').forEach((select) => {
            select.addEventListener('change', async (e) => {
                const leadId = e.currentTarget.getAttribute('data-lead-id');
                const newStatus = e.currentTarget.value;
                try {
                    const docRef = doc(db, 'demo_requests', leadId);
                    await updateDoc(docRef, { status: newStatus });
                    showToast("Lead status updated successfully", "success");
                } catch (err) {
                    console.error("Error updating lead status:", err);
                    showToast("Failed to update lead status.", "error");
                }
            });
        });

        // Add event listeners to view/delete buttons
        tbody.querySelectorAll('.btn-view-lead').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const leadId = e.currentTarget.getAttribute('data-lead-id');
                viewLeadDetails(leadId);
            });
        });

        tbody.querySelectorAll('.btn-delete-lead').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const leadId = e.currentTarget.getAttribute('data-lead-id');
                deleteLeadRequest(leadId);
            });
        });
    }

    function viewLeadDetails(leadId) {
        const lead = leadsCache.find((l) => l.id === leadId);
        if (!lead) return;

        const body = document.getElementById('sa-lead-modal-body');
        if (!body) return;

        let dateStr = 'N/A';
        if (lead.createdAt) {
            try {
                const dateObj = new Date(lead.createdAt);
                dateStr = dateObj.toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                dateStr = lead.createdAt;
            }
        }

        body.innerHTML = `
            <div class="lead-detail-grid">
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Submitted At</div>
                    <div class="lead-detail-val">${dateStr}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">School Name</div>
                    <div class="lead-detail-val" style="font-weight:700;">${lead.schoolName || 'N/A'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Contact Person</div>
                    <div class="lead-detail-val">${lead.ownerName || 'N/A'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Phone Number</div>
                    <div class="lead-detail-val"><a href="tel:+91${lead.phone}" style="color:#60a5fa; text-decoration:none;">+91 ${lead.phone}</a></div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">City / District</div>
                    <div class="lead-detail-val">${lead.city || 'N/A'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Board / Affiliation</div>
                    <div class="lead-detail-val">${lead.board || 'N/A'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Student Count</div>
                    <div class="lead-detail-val">${lead.studentCount || 'N/A'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Current Setup</div>
                    <div class="lead-detail-val">${lead.currentMethod || 'N/A'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Best Time To Call</div>
                    <div class="lead-detail-val">${lead.bestTimeToCall || 'N/A'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Message</div>
                    <div class="lead-detail-val" style="white-space: pre-wrap;">${lead.message || 'No specific questions submitted.'}</div>
                </div>
                <div class="lead-detail-divider"></div>
                <div class="lead-detail-row">
                    <div class="lead-detail-label">Lead Status</div>
                    <div class="lead-detail-val" style="text-transform: capitalize;">${lead.status || 'New'}</div>
                </div>
            </div>
        `;

        const overlay = document.getElementById('sa-lead-modal-overlay');
        if (overlay) {
            overlay.classList.add('active');
        }
    }

    async function deleteLeadRequest(leadId) {
        if (confirm("Are you sure you want to delete this lead? This action cannot be undone.")) {
            try {
                const docRef = doc(db, 'demo_requests', leadId);
                await deleteDoc(docRef);
                showToast("Lead deleted successfully", "success");
            } catch (err) {
                console.error("Error deleting lead:", err);
                showToast("Failed to delete lead.", "error");
            }
        }
    }

    /** Toggle password visibility. */
    function togglePasswordVisibility() {
        var isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        var icon = pwToggle.querySelector('i');
        icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    }


    // ─── Dashboard Rendering ────────────────────────────

    /** Compute metrics and render the full dashboard. */
    function renderDashboard() {
        var data = loadData();
        var schools = data.schools || [];

        var total    = schools.length;
        var active   = 0;
        var paused   = 0;
        var lastActivity = 'No data';

        schools.forEach(function (s) {
            if (s.status === 'Active') active++;
            else paused++;
        });

        // Find the most recent last_login for activity monitor
        for (var i = 0; i < schools.length; i++) {
            if (schools[i].status === 'Active' && schools[i].last_login) {
                lastActivity = schools[i].last_login;
                break;
            }
        }

        renderMetricsCards(total, active, paused, lastActivity);

        // Apply filters
        var filteredSchools = schools;
        if (state.statusFilter !== 'all') {
            filteredSchools = filteredSchools.filter(function(s) {
                return s.status === state.statusFilter;
            });
        }
        if (state.searchQuery) {
            var q = state.searchQuery.toLowerCase();
            filteredSchools = filteredSchools.filter(function(s) {
                return s.school_name.toLowerCase().indexOf(q) !== -1 ||
                       s.subdomain.toLowerCase().indexOf(q) !== -1 ||
                       (s.email && s.email.toLowerCase().indexOf(q) !== -1);
            });
        }

        renderSchoolsTable(filteredSchools);
    }

    /** Render the 4 metric cards. */
    function renderMetricsCards(total, active, paused, lastActivity) {
        metricsGrid.innerHTML = '' +
            '<div class="sa-metric-card mc-total' + (state.statusFilter === 'all' ? ' active-filter' : '') + '" style="cursor: pointer;" data-filter="all">' +
                '<div class="sa-metric-icon"><span class="material-icons-round">domain</span></div>' +
                '<div class="sa-metric-value">' + total + '</div>' +
                '<div class="sa-metric-label">Total Schools</div>' +
            '</div>' +
            '<div class="sa-metric-card mc-active' + (state.statusFilter === 'Active' ? ' active-filter' : '') + '" style="cursor: pointer;" data-filter="Active">' +
                '<div class="sa-metric-icon"><span class="material-icons-round">check_circle</span></div>' +
                '<div class="sa-metric-value">' + active + '</div>' +
                '<div class="sa-metric-label">Active Schools</div>' +
            '</div>' +
            '<div class="sa-metric-card mc-paused' + (state.statusFilter === 'Paused' ? ' active-filter' : '') + '" style="cursor: pointer;" data-filter="Paused">' +
                '<div class="sa-metric-icon"><span class="material-icons-round">pause_circle</span></div>' +
                '<div class="sa-metric-value">' + paused + '</div>' +
                '<div class="sa-metric-label">Inactive / Paused</div>' +
            '</div>' +
            '<div class="sa-metric-card mc-monitor" style="cursor: pointer;" id="sa-trigger-activity-monitor">' +
                '<div class="sa-metric-icon"><span class="material-icons-round">monitoring</span></div>' +
                '<div class="sa-metric-value" style="font-size:1.15rem;line-height:1.4">' + escapeHTML(lastActivity) + '</div>' +
                '<div class="sa-metric-label">Activity Monitor</div>' +
            '</div>';
    }

    /** Build the schools directory table with expandable rows. */
    function renderSchoolsTable(schools) {
        if (!schools || schools.length === 0) {
            schoolsTbody.innerHTML =
                '<tr><td colspan="5">' +
                    '<div class="sa-empty-state">' +
                        '<span class="material-icons-round">school</span>' +
                        '<h3>No Schools Onboarded Yet</h3>' +
                        '<p>Click "Onboard School" to add your first tenant.</p>' +
                    '</div>' +
                '</td></tr>';
            return;
        }

        var data = loadData();
        var html = '';

        schools.forEach(function (school, idx) {
            var planClass = school.plan === 'Premium' ? 'sa-badge-premium' :
                            school.plan === 'Pro'     ? 'sa-badge-pro' : 'sa-badge-basic';
            var statusClass = school.status === 'Active' ? 'sa-badge-active' : 'sa-badge-paused';
            var statusIcon  = school.status === 'Active' ? 'fiber_manual_record' : 'pause_circle';
            var featureCount = (school.allowed_features || []).length;

            // Compute rough stats from main data if available
            var studentCount = 0;
            var teacherCount = 0;
            if (data.students && Array.isArray(data.students)) {
                studentCount = data.students.length;
            }
            if (data.teachers && Array.isArray(data.teachers)) {
                teacherCount = data.teachers.length;
            }

            // Main row
            html += '<tr class="sa-school-row" data-school-id="' + escapeAttr(school.school_id) + '" data-idx="' + idx + '">' +
                '<td>' +
                    '<div class="sa-school-info">' +
                        '<span class="sa-school-name">' + escapeHTML(school.school_name) + '</span>' +
                        '<a href="' + (window.location.hostname === 'localhost' ? 'http://' + school.subdomain + '.localhost:3000' : 'https://' + school.subdomain + '.ctrlshifts.in') + '" target="_blank" class="sa-subdomain-link" data-school-id="' + escapeAttr(school.school_id) + '">' + escapeHTML(school.subdomain) + '.ctrlshifts.in</a>' +
                    '</div>' +
                '</td>' +
                '<td>' +
                    '<span class="sa-badge ' + planClass + '">' + escapeHTML(school.plan) + '</span>' +
                    '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">' + escapeHTML(school.storage_used || '—') + '</div>' +
                '</td>' +
                '<td>' +
                    '<span class="sa-badge ' + statusClass + '">' +
                        '<span class="material-icons-round" style="font-size:0.6rem">' + statusIcon + '</span> ' +
                        escapeHTML(school.status) +
                    '</span>' +
                '</td>' +
                '<td>' +
                    '<span class="sa-features-count">' + featureCount + ' modules</span>' +
                '</td>' +
                '<td>' +
                    '<div class="sa-actions">' +
                        '<button class="sa-action-btn btn-edit" data-action="edit" data-school-id="' + escapeAttr(school.school_id) + '" title="Edit School">' +
                            '<span class="material-icons-round">edit</span> Edit' +
                        '</button>' +
                        (school.status === 'Active'
                            ? '<button class="sa-action-btn btn-pause" data-action="toggle-status" data-school-id="' + escapeAttr(school.school_id) + '" title="Pause School"><span class="material-icons-round">pause</span> Pause</button>'
                            : '<button class="sa-action-btn btn-resume" data-action="toggle-status" data-school-id="' + escapeAttr(school.school_id) + '" title="Resume School"><span class="material-icons-round">play_arrow</span> Resume</button>'
                        ) +
                        '<button class="sa-action-btn btn-impersonate" data-action="impersonate" data-school-id="' + escapeAttr(school.school_id) + '" data-role="admin" title="Login as Admin">' +
                            '<span class="material-icons-round">admin_panel_settings</span> Admin' +
                        '</button>' +
                        '<button class="sa-action-btn btn-impersonate" data-action="impersonate" data-school-id="' + escapeAttr(school.school_id) + '" data-role="teacher" title="Login as Teacher">' +
                            '<span class="material-icons-round">person</span> Teacher' +
                        '</button>' +
                    '</div>' +
                '</td>' +
            '</tr>';

            // Expandable detail row
            var featurePills = '';
            (school.allowed_features || []).forEach(function (f) {
                var label = FEATURE_LABELS[f] || f;
                featurePills += '<span class="sa-feature-pill">' + escapeHTML(label) + '</span>';
            });

            html += '<tr class="sa-expand-row" data-expand-for="' + escapeAttr(school.school_id) + '">' +
                '<td colspan="5">' +
                    '<div class="sa-expand-content">' +
                        '<div class="sa-expand-inner">' +
                            '<div class="sa-expand-section">' +
                                '<h4>Enabled Features</h4>' +
                                '<div class="sa-feature-pills">' + featurePills + '</div>' +
                            '</div>' +
                            '<div class="sa-expand-section">' +
                                '<h4>Database Stats</h4>' +
                                '<div class="sa-expand-stat">' +
                                    '<span class="material-icons-round">groups</span>' +
                                    'Students: <strong>' + studentCount + '</strong>' +
                                '</div>' +
                                '<div class="sa-expand-stat">' +
                                    '<span class="material-icons-round">school</span>' +
                                    'Teachers: <strong>' + teacherCount + '</strong>' +
                                '</div>' +
                                '<div class="sa-expand-stat">' +
                                    '<span class="material-icons-round">event</span>' +
                                    'Renewal: <strong>' + escapeHTML(school.renewal_date || '—') + '</strong>' +
                                '</div>' +
                            '</div>' +
                            '<div class="sa-expand-section">' +
                                '<h4>Storage &amp; Activity</h4>' +
                                '<div class="sa-expand-stat">' +
                                    '<span class="material-icons-round">cloud</span>' +
                                    'Used: <strong>' + escapeHTML(school.storage_used || '—') + '</strong>' +
                                '</div>' +
                                '<div class="sa-expand-stat">' +
                                    '<span class="material-icons-round">schedule</span>' +
                                    'Last Login: <strong>' + escapeHTML(school.last_login || '—') + '</strong>' +
                                '</div>' +
                                '<div class="sa-expand-stat">' +
                                    '<span class="material-icons-round">mail</span>' +
                                    escapeHTML(school.email || '—') +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</td>' +
            '</tr>';
        });

        schoolsTbody.innerHTML = html;
    }

    /** Render the Recovery Center soft-deleted records. */
    function renderRecoveryCenter() {
        var data = loadData();
        var trash = data.recovery_trash || [];
        if (trash.length === 0) {
            recoveryTbody.innerHTML = 
                '<tr><td colspan="5">' +
                    '<div class="sa-empty-state">' +
                        '<span class="material-icons-round">delete_outline</span>' +
                        '<h3>Recovery Center Empty</h3>' +
                        '<p>No recently soft-deleted records found across schools.</p>' +
                    '</div>' +
                '</td></tr>';
            return;
        }

        var html = '';
        trash.forEach(function (item) {
            html += '<tr>' +
                '<td><strong style="color:inherit;">' + escapeHTML(item.school_name) + '</strong></td>' +
                '<td>' + escapeHTML(item.data_type) + '</td>' +
                '<td>' + escapeHTML(item.deleted_by) + '</td>' +
                '<td>' + escapeHTML(item.deleted_time) + '</td>' +
                '<td>' +
                    '<button class="sa-btn sa-btn-primary sa-btn-xs btn-restore" data-item-id="' + escapeAttr(item.id) + '">' +
                        '⚡ 1-Click Restore' +
                    '</button>' +
                '</td>' +
            '</tr>';
        });
        recoveryTbody.innerHTML = html;
    }

    /** Restore a soft-deleted item. */
    async function restoreTrashItem(itemId) {
        await ensureDataLoaded();
        var data = loadData();
        var trash = data.recovery_trash || [];
        var restoredItem = null;

        var filteredTrash = trash.filter(function (item) {
            if (item.id === itemId) {
                restoredItem = item;
                return false; // remove it
            }
            return true;
        });

        if (restoredItem) {
            data.recovery_trash = filteredTrash;
            
            // Add a log in detailed audit logs for that school about the restoration
            if (!data.audit_logs) data.audit_logs = [];
            data.audit_logs.unshift({
                school_id: restoredItem.school_id,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
                actor: 'Super Admin',
                action: 'Restored ' + restoredItem.data_type,
                type: 'add' // green badge
            });

            saveData(data);
            try {
                await setDoc(doc(db, 'sa_data', 'recovery_trash'), { trash: data.recovery_trash });
                await setDoc(doc(db, 'sa_data', 'audit_logs'), { logs: data.audit_logs });
            } catch(e) {
                console.error('Failed to save restoration to Firestore:', e);
            }
            showToast('⚡ ' + restoredItem.data_type + ' restored successfully!', 'success');
            renderRecoveryCenter();
            renderDashboard(); // Re-render directory stats if any
        }
    }

    /** Render the Support Tickets workspace. */
    function renderSupportTickets() {
        var data = loadData();
        var tickets = data.support_tickets || [];
        if (tickets.length === 0) {
            ticketsTbody.innerHTML = 
                '<tr><td colspan="6">' +
                    '<div class="sa-empty-state">' +
                        '<span class="material-icons-round">confirmation_number</span>' +
                        '<h3>No Tickets Found</h3>' +
                        '<p>All clean! No after-sales support tickets available.</p>' +
                    '</div>' +
                '</td></tr>';
            return;
        }

        var html = '';
        tickets.forEach(function (t) {
            var priorityClass = 'sa-badge-low';
            if (t.priority === 'High') priorityClass = 'sa-badge-high';
            else if (t.priority === 'Medium') priorityClass = 'sa-badge-medium';

            var statusClass = t.status === 'Open' ? 'sa-badge-open' : 'sa-badge-closed';

            html += '<tr>' +
                '<td><code style="font-size:12px;font-weight:700;">' + escapeHTML(t.ticket_id) + '</code></td>' +
                '<td><strong style="color:inherit;">' + escapeHTML(t.school_name) + '</strong></td>' +
                '<td><span class="sa-badge ' + priorityClass + '">' + escapeHTML(t.priority) + '</span></td>' +
                '<td>' + escapeHTML(t.issue_description) + '</td>' +
                '<td><span class="sa-badge ' + statusClass + '">' + escapeHTML(t.status) + '</span></td>' +
                '<td>' +
                    (t.status === 'Open' 
                        ? '<button class="sa-btn sa-btn-secondary sa-btn-xs btn-reply" data-ticket-id="' + escapeAttr(t.ticket_id) + '">' +
                            '<span class="material-icons-round" style="font-size:12px;vertical-align:middle;margin-right:2px;">reply</span> Quick Reply' +
                          '</button>'
                        : '<span style="color:rgba(255,255,255,0.4);font-size:12px;">Resolved</span>'
                    ) +
                '</td>' +
            '</tr>';
        });
        ticketsTbody.innerHTML = html;
    }

    /** Handle Support Ticket Quick Reply. */
    async function quickReplyTicket(ticketId) {
        await ensureDataLoaded();
        var data = loadData();
        var tickets = data.support_tickets || [];
        var ticket = null;
        for (var i = 0; i < tickets.length; i++) {
            if (tickets[i].ticket_id === ticketId) {
                ticket = tickets[i];
                break;
            }
        }

        if (!ticket) {
            showToast('Ticket not found.', 'error');
            return;
        }

        var replyText = prompt('Enter your Quick Reply for ' + ticket.school_name + ' (Ticket ' + ticket.ticket_id + '):');
        if (replyText === null) return; // user cancelled

        replyText = replyText.trim();
        if (!replyText) {
            showToast('Reply message cannot be empty.', 'error');
            return;
        }

        // Update ticket status to Closed
        ticket.status = 'Closed';
        
        // Log the event in detailed school audit logs
        if (!data.audit_logs) data.audit_logs = [];
        data.audit_logs.unshift({
            school_id: ticket.school_id,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            actor: 'Super Admin',
            action: 'Replied to Ticket ' + ticket.ticket_id + ': "' + replyText.substring(0, 30) + (replyText.length > 30 ? '...' : '') + '"',
            type: 'update' // amber badge
        });

        saveData(data);
        try {
            await setDoc(doc(db, 'sa_data', 'support_tickets'), { tickets: data.support_tickets });
            await setDoc(doc(db, 'sa_data', 'audit_logs'), { logs: data.audit_logs });
        } catch(e) {
            console.error('Failed to save ticket reply to Firestore:', e);
        }
        showToast('Reply sent! Ticket ' + ticket.ticket_id + ' marked as Closed/Resolved.', 'success');
        renderSupportTickets();
    }

    var currentProfileSchoolId = null;

    /** Open the School Profile Modal and render the active tab content. */
    function openSchoolProfileModal(schoolId) {
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        if (!school) {
            showToast('School not found.', 'error');
            return;
        }

        currentProfileSchoolId = schoolId;
        profileTitle.textContent = school.school_name + ' Profile';

        // 1. Populate Overview Tab details
        var planClass = school.plan === 'Premium' ? 'sa-badge-premium' :
                        school.plan === 'Pro'     ? 'sa-badge-pro' : 'sa-badge-basic';
        profPlanBadge.className = 'sa-badge ' + planClass;
        profPlanBadge.textContent = school.plan;

        profStorage.textContent = school.storage_used || '0 MB';

        var statusClass = school.status === 'Active' ? 'sa-badge-active' : 'sa-badge-paused';
        profStatusBadge.className = 'sa-badge ' + statusClass;
        profStatusBadge.textContent = school.status;

        profRenewal.textContent = school.renewal_date || '—';
        profEmail.textContent = school.email || '—';
        profPhone.textContent = school.phone || '—';
        profAddress.textContent = school.address || '—';

        // Populate Features List
        var featureHtml = '';
        (school.allowed_features || []).forEach(function (f) {
            var label = FEATURE_LABELS[f] || f;
            featureHtml += '<span class="sa-feature-pill">' + escapeHTML(label) + '</span>';
        });
        profFeaturesList.innerHTML = featureHtml || '<span style="color:rgba(255,255,255,0.4);font-size:12px;">No features allowed.</span>';

        // 2. Populate Detailed Audit Logs Tab
        renderProfileAuditLogs(schoolId);

        // Reset to first tab (Overview)
        profileTabBtns.forEach(function (btn) {
            if (btn.getAttribute('data-profile-tab') === 'overview') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        profileTabContents.forEach(function (content) {
            if (content.id === 'profile-tab-overview') {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        profileModalOverlay.classList.add('active');
    }

    /** Close the School Profile Modal. */
    function closeSchoolProfileModal() {
        profileModalOverlay.classList.remove('active');
        currentProfileSchoolId = null;
    }

    /** Switch tabs inside the School Profile Modal. */
    function switchProfileModalTab(tabName) {
        profileTabBtns.forEach(function (btn) {
            if (btn.getAttribute('data-profile-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        profileTabContents.forEach(function (content) {
            if (content.id === 'profile-tab-' + tabName) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }

    /** Render Audit Logs strictly for a specific school. */
    function renderProfileAuditLogs(schoolId) {
        var data = loadData();
        var allLogs = data.audit_logs || [];
        var schoolLogs = allLogs.filter(function (log) {
            return log.school_id === schoolId;
        });

        if (schoolLogs.length === 0) {
            auditTbody.innerHTML = 
                '<tr><td colspan="4" style="text-align:center; padding:30px 10px; color:rgba(255,255,255,0.4); font-size:13px;">' +
                    '<span class="material-icons-round" style="font-size:24px;vertical-align:middle;margin-right:6px;">history</span> No audit logs recorded for this school.' +
                '</td></tr>';
            return;
        }

        var html = '';
        schoolLogs.forEach(function (log) {
            var badgeClass = 'sa-audit-badge-update'; // default amber
            var badgeLabel = 'Update';
            if (log.type === 'add') {
                badgeClass = 'sa-audit-badge-add';
                badgeLabel = 'Addition';
            } else if (log.type === 'delete') {
                badgeClass = 'sa-audit-badge-delete';
                badgeLabel = 'Deletion';
            }

            html += '<tr>' +
                '<td style="font-size:12px;color:rgba(255,255,255,0.6);">' + escapeHTML(log.timestamp) + '</td>' +
                '<td><strong style="color:inherit;">' + escapeHTML(log.actor) + '</strong></td>' +
                '<td>' + escapeHTML(log.action) + '</td>' +
                '<td><span class="sa-audit-badge ' + badgeClass + '">' + badgeLabel + '</span></td>' +
            '</tr>';
        });
        auditTbody.innerHTML = html;
    }


    // ─── School Modal ───────────────────────────────────

    // ─── Collapsible Onboarding UI Renderers ────────────

    function renderClassesSection() {
        var container = document.getElementById('sf-classes-container');
        if (!container) return;
        
        var html = '';
        formClasses.forEach(function(c) {
            var sections = formSections[c] || [];
            var id = 'class-row-' + c.replace(/\s+/g, '_');
            
            html += '<div class="class-structure-row" id="' + id + '" style="display:flex; align-items:center; justify-content:space-between; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; gap:12px; margin-bottom:8px;">';
            html += '  <div style="width:120px; font-weight:700;">' + escapeHTML(c) + '</div>';
            html += '  <div class="section-tags-container" style="display:flex; flex-wrap:wrap; gap:6px; flex-grow:1;">';
            sections.forEach(function(sec) {
                html += '    <span class="section-tag" style="display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; background:rgba(37,99,235,0.15); color:#60a5fa; font-size:11px; font-weight:700; border: 1px solid rgba(37, 99, 235, 0.25);">' + escapeHTML(sec);
                html += '      <span class="remove-section-btn" data-class="' + escapeAttr(c) + '" data-section="' + escapeAttr(sec) + '" style="cursor:pointer; font-size:12px; color:rgba(255,255,255,0.5); font-weight:bold; margin-left:4px;">&times;</span>';
                html += '    </span>';
            });
            html += '  </div>';
            html += '  <div style="display:flex; gap:6px; align-items:center;">';
            html += '    <button type="button" class="sa-btn sa-btn-secondary sa-btn-xs add-section-btn" data-class="' + escapeAttr(c) + '">+ Section</button>';
            html += '    <button type="button" class="sa-btn sa-btn-danger sa-btn-xs delete-class-btn" data-class="' + escapeAttr(c) + '"><span class="material-icons-round" style="font-size:14px;">delete</span></button>';
            html += '  </div>';
            html += '</div>';
        });
        
        if (formClasses.length === 0) {
            html = '<div style="text-align:center; padding:12px; color:rgba(255,255,255,0.4); font-size:12px;">No classes added yet. Use Add Class or Quick Fill.</div>';
        }
        
        container.innerHTML = html;
        
        // Attach tag event listeners
        container.querySelectorAll('.remove-section-btn').forEach(function(el) {
            el.addEventListener('click', function(e) {
                var cName = this.getAttribute('data-class');
                var secName = this.getAttribute('data-section');
                if (formSections[cName]) {
                    formSections[cName] = formSections[cName].filter(function(s) { return s !== secName; });
                    renderClassesSection();
                }
            });
        });
        
        container.querySelectorAll('.add-section-btn').forEach(function(el) {
            el.addEventListener('click', function(e) {
                var cName = this.getAttribute('data-class');
                var sec = prompt("Enter section name (e.g. A, B, C):");
                if (sec) {
                    sec = sec.trim().toUpperCase();
                    if (!formSections[cName]) formSections[cName] = [];
                    if (formSections[cName].indexOf(sec) === -1) {
                        formSections[cName].push(sec);
                        renderClassesSection();
                    }
                }
            });
        });
        
        container.querySelectorAll('.delete-class-btn').forEach(function(el) {
            el.addEventListener('click', function(e) {
                var cName = this.getAttribute('data-class');
                formClasses = formClasses.filter(function(c) { return c !== cName; });
                delete formSections[cName];
                delete formFeeStructure[cName];
                renderClassesSection();
                renderFeesSection();
            });
        });
    }

    function renderFeesSection() {
        var thead = document.getElementById('sf-fee-table-header');
        var tbody = document.getElementById('sf-fee-table-body');
        if (!thead || !tbody) return;

        // Build header
        var headerHtml = '<th>Class</th>';
        formFeeHeads.forEach(function(h) {
            headerHtml += '<th style="text-transform: capitalize;">' + escapeHTML(h) + '</th>';
        });
        thead.innerHTML = headerHtml;

        // Build Apply to All row
        var applyAllHtml = '<tr style="background:rgba(37,99,235,0.1); font-weight:bold;">';
        applyAllHtml += '  <td>Apply to All</td>';
        formFeeHeads.forEach(function(h) {
            applyAllHtml += '  <td><input type="number" class="fee-apply-all-input sa-form-input" data-head="' + escapeAttr(h) + '" style="padding:6px; width:90px; font-size:12px;" min="0"></td>';
        });
        applyAllHtml += '</tr>';

        // Build rows
        var rowsHtml = '';
        formClasses.forEach(function(c) {
            rowsHtml += '<tr>';
            rowsHtml += '  <td style="font-weight:600;">' + escapeHTML(c) + '</td>';
            formFeeHeads.forEach(function(h) {
                var val = (formFeeStructure[c] && formFeeStructure[c][h]) || 0;
                rowsHtml += '  <td><input type="number" class="class-fee-input sa-form-input" data-class="' + escapeAttr(c) + '" data-head="' + escapeAttr(h) + '" value="' + val + '" style="padding:6px; width:90px; font-size:12px;" min="0"></td>';
            });
            rowsHtml += '</tr>';
        });

        tbody.innerHTML = applyAllHtml + rowsHtml;
    }

    function renderExtraChargesSection() {
        var container = document.getElementById('sf-charges-list');
        if (!container) return;

        if (formExtraCharges.length === 0) {
            container.innerHTML = '<span style="color:rgba(255,255,255,0.4); font-size:12px;">No extra charges added yet.</span>';
            return;
        }

        var html = '';
        formExtraCharges.forEach(function(item) {
            html += '<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; margin-bottom:6px;">';
            html += '  <div><strong style="color:#fff;">' + escapeHTML(item.name) + '</strong> <span style="font-size:11px; color:rgba(255,255,255,0.4);">(' + escapeHTML(item.type) + ')</span></div>';
            html += '  <div style="display:flex; align-items:center; gap:12px;">';
            html += '    <strong style="color:#60a5fa;">₹' + item.amount + '</strong>';
            html += '    <span class="remove-charge-btn" data-id="' + escapeAttr(item.id) + '" style="cursor:pointer; font-size:18px; color:#f87171; font-weight:bold;">&times;</span>';
            html += '  </div>';
            html += '</div>';
        });
        container.innerHTML = html;
        
        container.querySelectorAll('.remove-charge-btn').forEach(function(el) {
            el.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                formExtraCharges = formExtraCharges.filter(function(item) { return item.id !== id; });
                renderExtraChargesSection();
            });
        });
    }

    // ─── School Modal ───────────────────────────────────

    /**
     * Open the modal for add or edit.
     * @param {string|null} schoolId – null for new school, id for edit
     */
    async function showSchoolModal(schoolId) {
        schoolForm.reset();
        document.getElementById('sf-school-id').value = '';

        // Reset states
        formClasses = [];
        formSections = {};
        formFeeStructure = {};
        formFeeHeads = ["tuition", "transport", "exam"];
        formExtraCharges = [];
        currentAdminPasswordHash = '';

        // Reset all feature checkboxes
        var checkboxes = document.querySelectorAll('#sf-features-grid input[type="checkbox"]');
        checkboxes.forEach(function (cb) { cb.checked = false; });

        document.getElementById('sf-admin-password').placeholder = '••••••••';
        document.getElementById('sf-admin-password').required = true;

        if (schoolId) {
            // Edit mode — populate fields
            var data = loadData();
            var school = findSchoolById(data.schools, schoolId);
            if (!school) {
                showToast('School not found.', 'error');
                return;
            }
            modalTitleText.textContent = 'Edit School';
            document.getElementById('sf-school-id').value = school.school_id;
            document.getElementById('sf-name').value      = school.school_name || '';
            document.getElementById('sf-tagline').value   = school.tagline || '';
            document.getElementById('sf-phone').value     = school.phone || '';
            document.getElementById('sf-email').value     = school.email || '';
            document.getElementById('sf-address').value   = school.address || '';
            document.getElementById('sf-subdomain').value = school.subdomain || '';
            document.getElementById('sf-plan').value      = school.plan || 'Basic';
            document.getElementById('sf-status').value    = school.status || 'Active';
            document.getElementById('sf-renewal').value   = school.renewal_date || '';
            document.getElementById('sf-logo-url').value  = school.logo_url || '';

            // Check matching feature toggles
            var features = school.allowed_features || [];
            checkboxes.forEach(function (cb) {
                if (cb.value === 'admin') {
                    cb.checked = true;
                } else if (cb.value === 'teacher-attendance') {
                    cb.checked = features.indexOf('teachers') !== -1;
                } else {
                    cb.checked = features.indexOf(cb.value) !== -1;
                }
            });

            // Fetch settings configuration from tenant_data
            try {
                showToast('Fetching settings...', 'info');
                const tenantSnap = await getDoc(doc(db, 'tenant_data', schoolId));
                if (tenantSnap.exists()) {
                    var tenantData = tenantSnap.data();
                    var s = tenantData.settings || {};
                    
                    document.getElementById('sf-affiliation').value = (s.schoolInfo && s.schoolInfo.affiliation) || '';
                    document.getElementById('sf-udise-code').value = (s.schoolInfo && s.schoolInfo.udiseCode) || '';
                    document.getElementById('sf-admin-username').value = s.adminUsername || '';
                    document.getElementById('sf-admin-password').value = '********'; // masked
                    document.getElementById('sf-admin-password').required = false; // not required if unchanged
                    document.getElementById('sf-admin-email').value = s.adminEmail || '';
                    
                    currentAdminPasswordHash = s.adminPassword || '';
                    
                    formClasses = s.classes || [];
                    formSections = s.sections || {};
                    formFeeStructure = s.feeStructure || {};
                    formExtraCharges = s.extraCharges || [];
                    
                    // Collect fee head keys
                    var headsSet = new Set(["tuition", "transport", "exam"]);
                    Object.values(formFeeStructure).forEach(function(clsFees) {
                        Object.keys(clsFees).forEach(function(k) {
                            headsSet.add(k);
                        });
                    });
                    formFeeHeads = Array.from(headsSet);
                } else {
                    document.getElementById('sf-admin-username').value = 'admin';
                    document.getElementById('sf-admin-password').value = '';
                    document.getElementById('sf-admin-email').value = school.email || '';
                }
            } catch(e) {
                console.error('Failed to load school settings from tenant_data:', e);
                showToast('Could not load detailed setup from Cloud Firestore.', 'warning');
            }
        } else {
            modalTitleText.textContent = 'Onboard New School';
            // Default: check first 4 features
            var defaults = ['students', 'teachers', 'attendance', 'fees'];
            checkboxes.forEach(function (cb) {
                if (cb.value === 'admin') {
                    cb.checked = true;
                } else if (cb.value === 'teacher-attendance') {
                    cb.checked = true; // since 'teachers' is checked by default
                } else {
                    cb.checked = defaults.indexOf(cb.value) !== -1;
                }
            });
            
            document.getElementById('sf-admin-username').value = 'admin';
            document.getElementById('sf-admin-password').value = '';
            document.getElementById('sf-admin-email').value = '';
            document.getElementById('sf-affiliation').value = '';
            document.getElementById('sf-udise-code').value = '';
        }

        renderClassesSection();
        renderFeesSection();
        renderExtraChargesSection();

        modalOverlay.classList.add('active');
        setTimeout(function () {
            document.getElementById('sf-name').focus();
        }, 150);
    }

    /** Save (create or update) school from modal form. */
    async function saveSchool() {
        var name      = document.getElementById('sf-name').value.trim();
        var email     = document.getElementById('sf-email').value.trim();
        var subdomain = document.getElementById('sf-subdomain').value.trim();

        // Validation
        if (!name) { showToast('School name is required.', 'error'); return; }
        if (!email) { showToast('Email is required.', 'error'); return; }
        if (!subdomain) { showToast('Subdomain is required.', 'error'); return; }

        // Validate subdomain format
        if (!/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(subdomain) && subdomain.length > 1) {
            showToast('Subdomain must be lowercase letters, numbers, and hyphens only.', 'error');
            return;
        }

        // Section 2 validation
        var adminUsername = document.getElementById('sf-admin-username').value.trim();
        var adminPasswordInput = document.getElementById('sf-admin-password').value;
        var adminEmail = document.getElementById('sf-admin-email').value.trim();

        if (!adminUsername) { showToast('Admin Username is required.', 'error'); return; }
        if (!adminEmail) { showToast('Admin Email is required.', 'error'); return; }

        await ensureDataLoaded();
        var data = loadData();
        var schoolId = document.getElementById('sf-school-id').value;
        var isEdit = !!schoolId;

        var adminPasswordHashed = currentAdminPasswordHash;
        if (adminPasswordInput && adminPasswordInput !== '********') {
            if (window.AuthUtils && window.AuthUtils.hashPassword) {
                adminPasswordHashed = await window.AuthUtils.hashPassword(adminPasswordInput);
            } else {
                console.error('AuthUtils.hashPassword not loaded. Saving plain text.');
                adminPasswordHashed = adminPasswordInput;
            }
        } else if (!isEdit && !adminPasswordInput) {
            showToast('Admin password is required for onboarding.', 'error');
            return;
        }

        // Gather selected features
        var selectedFeatures = ['dashboard', 'admin']; // always include dashboard and admin
        var checkboxes = document.querySelectorAll('#sf-features-grid input[type="checkbox"]');
        checkboxes.forEach(function (cb) {
            if (cb.checked || cb.value === 'admin') {
                selectedFeatures.push(cb.value);
            }
        });

        // Enforce dependencies before saving (saving-side validation)
        var dependencies = {
            'print_receipt': ['fees'],
            'fee_ledger': ['fees'],
            'attendance': ['students'],
            'exams': ['students'],
            'promotion': ['students', 'exams'],
            'teacher-attendance': ['teachers'],
            'timetable': ['teachers'],
            'report_cards': ['exams']
        };

        var validatedFeatures = ['dashboard', 'admin'];
        if (selectedFeatures.indexOf('teachers') !== -1) {
            validatedFeatures.push('teacher-attendance');
        }

        selectedFeatures.forEach(function(f) {
            if (f === 'dashboard' || f === 'admin' || f === 'teacher-attendance') return;
            var parents = dependencies[f];
            var allParentsMet = true;
            if (parents) {
                parents.forEach(function(p) {
                    if (selectedFeatures.indexOf(p) === -1) {
                        allParentsMet = false;
                    }
                });
            }
            if (allParentsMet) {
                validatedFeatures.push(f);
            }
        });

        selectedFeatures = validatedFeatures;
        selectedFeatures.push('help'); // always include help
        selectedFeatures = selectedFeatures.filter(function (v, i, a) { return a.indexOf(v) === i; });

        var tagline = document.getElementById('sf-tagline').value.trim();
        var phone = document.getElementById('sf-phone').value.trim();
        var address = document.getElementById('sf-address').value.trim();
        var plan = document.getElementById('sf-plan').value;
        var status = document.getElementById('sf-status').value;
        var renewal = document.getElementById('sf-renewal').value || '';
        var logoUrl = document.getElementById('sf-logo-url').value.trim();
        var affiliation = document.getElementById('sf-affiliation').value.trim();
        var udiseCode = document.getElementById('sf-udise-code').value.trim();

        if (isEdit) {
            // Update existing school
            var idx = -1;
            for (var i = 0; i < data.schools.length; i++) {
                if (data.schools[i].school_id === schoolId) { idx = i; break; }
            }
            if (idx === -1) { showToast('School not found for update.', 'error'); return; }

            data.schools[idx].school_name       = name;
            data.schools[idx].tagline            = tagline;
            data.schools[idx].phone              = phone;
            data.schools[idx].email              = email;
            data.schools[idx].address            = address;
            data.schools[idx].subdomain          = subdomain;
            data.schools[idx].plan               = plan;
            data.schools[idx].status             = status;
            data.schools[idx].renewal_date       = renewal;
            data.schools[idx].logo_url           = logoUrl;
            data.schools[idx].allowed_features   = selectedFeatures;
            data.schools[idx].settings           = {
                schoolInfo: { name: name, tagline: tagline, logoUrl: logoUrl, phone: phone, email: email, address: address, affiliation: affiliation, udiseCode: udiseCode },
                adminUsername: adminUsername,
                adminPassword: adminPasswordHashed,
                adminEmail: adminEmail,
                classes: formClasses,
                sections: formSections,
                feeStructure: formFeeStructure,
                extraCharges: formExtraCharges,
                setupCompletedBySuperAdmin: true,
                clientCanEdit: true,
                theme: (data.schools[idx].settings && data.schools[idx].settings.theme) || 'dark',
                attendanceTime: (data.schools[idx].settings && data.schools[idx].settings.attendanceTime) || '09:00',
                academicYear: (data.schools[idx].settings && data.schools[idx].settings.academicYear) || '2025-2026'
            };

            saveData(data);
            try {
                // Save to metadata collection
                await setDoc(doc(db, 'schools', schoolId), data.schools[idx]);
                
                // Fetch existing tenant data or set defaults
                const tenantSnap = await getDoc(doc(db, 'tenant_data', schoolId));
                var tenantData = tenantSnap.exists() ? tenantSnap.data() : {
                    seederVersion: 2,
                    students: [],
                    teachers: [],
                    attendance: [],
                    trash: [],
                    feeHeads: [
                        { id: 'fh_tuition', name: 'Tuition Fee' },
                        { id: 'fh_transport', name: 'Transport Fee' },
                        { id: 'fh_exam', name: 'Examination Fee' },
                        { id: 'fh_fine', name: 'Late Fee / Fine' },
                        { id: 'fh_annual', name: 'Annual Development Fee' }
                    ],
                    feeStructures: {},
                    fees: [],
                    exams: [],
                    subjectMapping: {},
                    timetable: { settings: { startTime: "08:00", endTime: "14:00", totalPeriods: 8, lunchAfterPeriod: 4, lunchDuration: 30, satStartTime: "08:00", satEndTime: "12:30", satTotalPeriods: 6, satLunchAfterPeriod: 0 } },
                    marks: [],
                    notices: [],
                    lastAutomatedFeeRun: '2026-04',
                    notifications: [],
                    currentSchoolId: schoolId
                };

                // Merge settings
                tenantData.settings = {
                    schoolInfo: { name: name, tagline: tagline, logoUrl: logoUrl, phone: phone, email: email, address: address, affiliation: affiliation, udiseCode: udiseCode },
                    adminUsername: adminUsername,
                    adminPassword: adminPasswordHashed,
                    adminEmail: adminEmail,
                    classes: formClasses,
                    sections: formSections,
                    feeStructure: formFeeStructure,
                    extraCharges: formExtraCharges,
                    setupCompletedBySuperAdmin: true,
                    clientCanEdit: true,
                    // Keep compatibility settings
                    theme: (tenantData.settings && tenantData.settings.theme) || 'dark',
                    attendanceTime: (tenantData.settings && tenantData.settings.attendanceTime) || '09:00',
                    academicYear: (tenantData.settings && tenantData.settings.academicYear) || '2025-2026'
                };

                await setDoc(doc(db, 'tenant_data', schoolId), tenantData);

            } catch(e) {
                console.error('Failed to update school/tenant settings in Firestore:', e);
            }
            closeModal();
            renderDashboard();
            showToast('School "' + name + '" updated successfully!', 'success');
        } else {
            // Check for duplicate subdomain
            var duplicate = false;
            data.schools.forEach(function (s) {
                if (s.subdomain === subdomain) duplicate = true;
            });
            if (duplicate) {
                showToast('A school with subdomain "' + subdomain + '" already exists.', 'error');
                return;
            }

            // Create new school metadata
            var newSchoolId = generateSchoolId(subdomain);
            var newSchool = {
                school_id:        newSchoolId,
                school_name:      name,
                tagline:          tagline,
                phone:            phone,
                email:            email,
                address:          address,
                subdomain:        subdomain,
                plan:             plan,
                status:           status,
                storage_used:     '0 MB',
                renewal_date:     renewal,
                last_login:       'Never',
                logo_url:         logoUrl,
                allowed_features: selectedFeatures,
                settings: {
                    schoolInfo: { name: name, tagline: tagline, logoUrl: logoUrl, phone: phone, email: email, address: address, affiliation: affiliation, udiseCode: udiseCode },
                    adminUsername: adminUsername,
                    adminPassword: adminPasswordHashed,
                    adminEmail: adminEmail,
                    classes: formClasses,
                    sections: formSections,
                    feeStructure: formFeeStructure,
                    extraCharges: formExtraCharges,
                    setupCompletedBySuperAdmin: true,
                    clientCanEdit: true,
                    theme: 'dark',
                    attendanceTime: '09:00',
                    academicYear: '2025-2026'
                }
            };

            data.schools.push(newSchool);
            saveData(data);
            try {
                // Save metadata
                await setDoc(doc(db, 'schools', newSchoolId), newSchool);
                
                // Save fresh settings in tenant_data (merge: false)
                var legacyFeeStructures = {};
                if (formFeeStructure) {
                    Object.keys(formFeeStructure).forEach(function(c) {
                        var clsFees = formFeeStructure[c] || {};
                        var legacyFees = {};
                        Object.keys(clsFees).forEach(function(k) {
                            var legacyKey = k;
                            if (k === 'tuition') legacyKey = 'fh_tuition';
                            else if (k === 'transport') legacyKey = 'fh_transport';
                            else if (k === 'exam') legacyKey = 'fh_exam';
                            else if (k === 'fine') legacyKey = 'fh_fine';
                            else if (k === 'annual') legacyKey = 'fh_annual';
                            else if (!k.startsWith('fh_')) legacyKey = 'fh_' + k;
                            legacyFees[legacyKey] = clsFees[k];
                        });
                        legacyFeeStructures[c] = legacyFees;
                    });
                }

                var tenantData = {
                    settings: {
                        schoolInfo: { name: name, tagline: tagline, logoUrl: logoUrl, phone: phone, email: email, address: address, affiliation: affiliation, udiseCode: udiseCode },
                        adminUsername: adminUsername,
                        adminPassword: adminPasswordHashed,
                        adminEmail: adminEmail,
                        classes: formClasses,
                        sections: formSections,
                        feeStructure: formFeeStructure,
                        extraCharges: formExtraCharges,
                        setupCompletedBySuperAdmin: true,
                        clientCanEdit: true,
                        theme: 'dark',
                        attendanceTime: '09:00',
                        academicYear: '2025-2026'
                    },
                    students: [],
                    teachers: [],
                    attendance: [],
                    fees: [],
                    feeHeads: [
                        { id: 'fh_tuition', name: 'Tuition Fee' },
                        { id: 'fh_transport', name: 'Transport Fee' },
                        { id: 'fh_exam', name: 'Examination Fee' },
                        { id: 'fh_fine', name: 'Late Fee / Fine' },
                        { id: 'fh_annual', name: 'Annual Development Fee' }
                    ],
                    feeStructures: legacyFeeStructures,
                    exams: [],
                    marks: [],
                    notices: [],
                    timetable: {},
                    subjectMapping: {},
                    notifications: [],
                    trash: [],
                    lastAutomatedFeeRun: ""
                };
                await setDoc(doc(db, 'tenant_data', newSchoolId), tenantData, { merge: false });

            } catch(e) {
                console.error('Failed to save new school/tenant to Firestore:', e);
            }
            closeModal();
            renderDashboard();
            showToast('School "' + name + '" onboarded successfully!', 'success');
        }
    }


    // ─── Tenant Actions ─────────────────────────────────

    /** Toggle a school's status between Active and Paused. */
    async function toggleSchoolStatus(schoolId) {
        await ensureDataLoaded();
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        if (!school) { showToast('School not found.', 'error'); return; }

        var oldStatus = school.status;
        school.status = (oldStatus === 'Active') ? 'Paused' : 'Active';

        saveData(data);
        try {
            await setDoc(doc(db, 'schools', schoolId), school);
        } catch(e) {
            console.error('Failed to toggle school status in Firestore:', e);
        }
        renderDashboard();

        if (school.status === 'Active') {
            showToast('"' + school.school_name + '" has been resumed.', 'success');
        } else {
            showToast('"' + school.school_name + '" has been paused.', 'warning');
        }
    }

    /**
     * Impersonate a school by saving context to localStorage and redirecting.
     * @param {string} schoolId
     * @param {string} role – 'admin' or 'teacher'
     */
    function impersonateSchool(schoolId, role) {
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        if (!school) { showToast('School not found.', 'error'); return; }

        if (school.status === 'Paused') {
            showToast('Cannot impersonate a paused school. Resume it first.', 'error');
            return;
        }

        localStorage.setItem('impersonate_school_id', schoolId);
        localStorage.setItem('impersonate_role', role);
        sessionStorage.setItem('isImpersonating', 'true');

        showToast('Redirecting as ' + role + ' of "' + school.school_name + '"…', 'info');

        setTimeout(function () {
            window.location.href = 'index.html';
        }, 800);
    }


    // ─── UI Helpers ─────────────────────────────────────

    /**
     * Show a toast notification.
     * @param {string} msg – message text
     * @param {string} type – 'success', 'error', 'info', 'warning'
     */
    function showToast(msg, type) {
        type = type || 'info';
        var iconMap = {
            success: 'check_circle',
            error:   'error',
            info:    'info',
            warning: 'warning'
        };
        var toast = document.createElement('div');
        toast.className = 'sa-toast toast-' + type;
        toast.innerHTML = '<span class="material-icons-round" style="font-size:1.1rem">' +
            (iconMap[type] || 'info') + '</span>' + escapeHTML(msg);
        toastContainer.appendChild(toast);

        // Auto-remove
        setTimeout(function () {
            toast.style.animation = 'toastOut 0.3s ease-out forwards';
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3500);
    }

    /** Close the modal. */
    function closeModal() {
        modalOverlay.classList.remove('active');
    }

    /** Toggle expandable detail row. */
    function toggleExpandRow(schoolId) {
        var expandRow = document.querySelector('.sa-expand-row[data-expand-for="' + schoolId + '"]');
        var mainRow   = document.querySelector('.sa-school-row[data-school-id="' + schoolId + '"]');
        if (!expandRow) return;

        var isOpen = expandRow.classList.contains('open');

        // Close all open rows first
        document.querySelectorAll('.sa-expand-row.open').forEach(function (r) {
            r.classList.remove('open');
        });
        document.querySelectorAll('.sa-school-row.expanded').forEach(function (r) {
            r.classList.remove('expanded');
        });

        // Toggle the clicked one
        if (!isOpen) {
            expandRow.classList.add('open');
            if (mainRow) mainRow.classList.add('expanded');
        }
    }


    // ─── Utility Functions ──────────────────────────────

    function escapeHTML(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function findSchoolById(schools, id) {
        for (var i = 0; i < schools.length; i++) {
            if (schools[i].school_id === id) return schools[i];
        }
        return null;
    }

    function generateSchoolId(subdomain) {
        var slug = subdomain.replace(/[^a-z0-9]/g, '_');
        return slug + '_' + Date.now().toString(36);
    }

    // ─── Sales Activity Monitor Modal ───────────────────
    var activityModal    = document.getElementById('sa-activity-modal-overlay');
    var activityClose    = document.getElementById('sa-activity-modal-close');
    var activityCloseBtn = document.getElementById('sa-activity-modal-close-btn');

    function openActivityModal() {
        renderActivityLogs();
        if (activityModal) activityModal.classList.add('active');
    }

    function closeActivityModal() {
        if (activityModal) activityModal.classList.remove('active');
    }

    function renderActivityLogs() {
        var data = loadData();
        var schools = data.schools || [];
        var logsContainer = document.getElementById('sa-activity-logs');
        if (!logsContainer) return;

        var templates = [
            { text: "{name} upgraded to Premium subscription plan", tag: "Billing Alert", type: "activity", time: "Just now" },
            { text: "High Churn Risk: {name} inactive for 7 days", tag: "Churn Risk", type: "churn", time: "15 mins ago" },
            { text: "High Storage Alert: {name} system storage usage crossed 90%", tag: "Warning", type: "warning", time: "2 hours ago" },
            { text: "Subscription renewal due in 3 days for {name}", tag: "Warning", type: "warning", time: "4 hours ago" },
            { text: "Security Alert: Multiple failed admin login attempts on {name}", tag: "Warning", type: "warning", time: "1 day ago" },
            { text: "{name} successfully onboarded to Pro plan", tag: "Billing Alert", type: "activity", time: "2 days ago" }
        ];

        var html = '';
        
        schools.forEach(function (school, sIdx) {
            var numLogs = school.status === 'Paused' ? 1 : 2;
            for (var j = 0; j < numLogs; j++) {
                var template = templates[(sIdx * 2 + j) % templates.length];
                var tagClass = 'sa-tag-' + template.type;
                var text = template.text.replace('{name}', school.school_name);
                
                var currentTag = template.tag;
                var currentTypeClass = tagClass;
                var currentText = text;
                
                if (school.status === 'Paused' && j === 0) {
                    currentTag = 'Churn Risk';
                    currentTypeClass = 'sa-tag-churn';
                    currentText = 'High Churn Risk: ' + school.school_name + ' is paused and inactive for 15 days';
                }

                html += '<div class="sa-activity-item">' +
                    '<span class="sa-activity-tag ' + currentTypeClass + '">' + currentTag + '</span>' +
                    '<div style="font-size:13px; font-weight:600; line-height:1.4; color: inherit;">' + escapeHTML(currentText) + '</div>' +
                    '<span class="sa-activity-time">' + template.time + '</span>' +
                '</div>';
            }
        });

        if (schools.length === 0) {
            html = '<div style="text-align:center; padding: 24px; color:rgba(255,255,255,0.4)">No active alerts. Onboard a school to see logs.</div>';
        }

        logsContainer.innerHTML = html;
    }

    // ─── Event Listeners ────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {
        // Load theme preference
        var theme = localStorage.getItem('sa_theme') || 'dark';
        if (theme === 'light') {
            document.body.classList.add('sa-light-theme');
            var themeIcon = document.getElementById('sa-theme-icon');
            if (themeIcon) themeIcon.textContent = 'dark_mode';
        }

        // Theme toggle listener
        var themeToggle = document.getElementById('sa-theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', function () {
                var isLight = document.body.classList.toggle('sa-light-theme');
                var themeIcon = document.getElementById('sa-theme-icon');
                if (themeIcon) {
                    themeIcon.textContent = isLight ? 'dark_mode' : 'light_mode';
                }
                localStorage.setItem('sa_theme', isLight ? 'light' : 'dark');
                showToast('Theme switched to ' + (isLight ? 'Light' : 'Dark') + ' mode.', 'info');
            });
        }

        // Global Sidebar Nav Tab switching
        if (sidebarNav) {
            sidebarNav.addEventListener('click', function (e) {
                var item = e.target.closest('.sa-nav-item');
                if (!item) return;

                e.preventDefault();

                // Toggle active sidebar link styling
                document.querySelectorAll('.sa-nav-item').forEach(function (link) {
                    link.classList.remove('active');
                });
                item.classList.add('active');

                // Toggle active page panel
                var targetTab = item.getAttribute('data-tab');
                tabPages.forEach(function (page) {
                    if (page.id === 'tab-' + targetTab) {
                        page.classList.add('active');
                    } else {
                        page.classList.remove('active');
                    }
                });

                // Load active tab data
                if (targetTab === 'recovery') {
                    renderRecoveryCenter();
                } else if (targetTab === 'tickets') {
                    renderSupportTickets();
                } else if (targetTab === 'dashboard') {
                    renderDashboard();
                } else if (targetTab === 'leads') {
                    renderLeadsTab();
                }
            });
        }

        // Recovery Center Table events (⚡ 1-Click Restore)
        if (recoveryTbody) {
            recoveryTbody.addEventListener('click', function (e) {
                var btn = e.target.closest('.btn-restore');
                if (btn) {
                    var itemId = btn.getAttribute('data-item-id');
                    if (itemId) restoreTrashItem(itemId);
                }
            });
        }

        // Support Tickets Table events (Quick Reply)
        if (ticketsTbody) {
            ticketsTbody.addEventListener('click', function (e) {
                var btn = e.target.closest('.btn-reply');
                if (btn) {
                    var ticketId = btn.getAttribute('data-ticket-id');
                    if (ticketId) quickReplyTicket(ticketId);
                }
            });
        }

        // School Profile Modal events
        if (profileModalClose) profileModalClose.addEventListener('click', closeSchoolProfileModal);
        if (profileModalCloseBtn) profileModalCloseBtn.addEventListener('click', closeSchoolProfileModal);
        if (profileModalOverlay) {
            profileModalOverlay.addEventListener('click', function (e) {
                if (e.target === profileModalOverlay) closeSchoolProfileModal();
            });
        }

        // Inner profile tabs switcher
        var profileTabsContainer = document.querySelector('.sa-profile-tabs');
        if (profileTabsContainer) {
            profileTabsContainer.addEventListener('click', function (e) {
                var btn = e.target.closest('.sa-profile-tab-btn');
                if (btn) {
                    var tabName = btn.getAttribute('data-profile-tab');
                    switchProfileModalTab(tabName);
                }
            });
        }

        // Click metrics to filter OR open activity monitor
        metricsGrid.addEventListener('click', function (e) {
            var card = e.target.closest('.sa-metric-card');
            if (card) {
                if (card.classList.contains('mc-monitor')) {
                    openActivityModal();
                } else {
                    var filter = card.getAttribute('data-filter');
                    if (filter) {
                        state.statusFilter = filter;
                        renderDashboard();
                    }
                }
            }
        });

        // Search input
        var searchInput = document.getElementById('sa-search');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                state.searchQuery = this.value;
                renderDashboard();
            });
        }

        // Check for existing session
        if (sessionStorage.getItem(SESSION_KEY) === 'active') {
            loginPage.classList.add('hidden');
            dashboard.classList.add('active');
            (async function() {
                showToast('Loading database from Cloud Firestore...', 'info');
                await ensureDataLoaded();
                initLeadsListener();
                renderDashboard();
            })();
        }

        // Login form submit
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await saLogin(usernameInput.value.trim(), passwordInput.value);
        });

        // Password toggle
        pwToggle.addEventListener('click', function (e) {
            e.preventDefault();
            togglePasswordVisibility();
        });

        // Logout
        btnLogout.addEventListener('click', function () {
            saLogout();
        });

        // Add School button
        btnAddSchool.addEventListener('click', function () {
            showSchoolModal(null);
        });

        // Modal close / cancel
        modalClose.addEventListener('click', closeModal);
        modalCancel.addEventListener('click', closeModal);

        // Close modal on overlay click
        modalOverlay.addEventListener('click', function (e) {
            if (e.target === modalOverlay) closeModal();
        });

        // Close activity modal
        var activityClose = document.getElementById('sa-activity-modal-close');
        var activityCloseBtn = document.getElementById('sa-activity-modal-close-btn');
        if (activityClose) activityClose.addEventListener('click', closeActivityModal);
        if (activityCloseBtn) activityCloseBtn.addEventListener('click', closeActivityModal);
        if (activityModal) {
            activityModal.addEventListener('click', function(e) {
                if (e.target === activityModal) closeActivityModal();
            });
        }

        // Close modal on Escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (modalOverlay.classList.contains('active')) closeModal();
                if (activityModal && activityModal.classList.contains('active')) closeActivityModal();
                if (profileModalOverlay && profileModalOverlay.classList.contains('active')) closeSchoolProfileModal();
                if (leadModalOverlay && leadModalOverlay.classList.contains('active')) closeLeadModal();
            }
        });

        // Lead details modal Escape key close
        const leadModalOverlay = document.getElementById('sa-lead-modal-overlay');
        const leadModalCloseBtn = document.getElementById('sa-lead-modal-close');
        const leadModalFooterCloseBtn = document.getElementById('sa-lead-modal-close-btn');

        const closeLeadModal = () => {
            if (leadModalOverlay) leadModalOverlay.classList.remove('active');
        };

        if (leadModalCloseBtn) leadModalCloseBtn.onclick = closeLeadModal;
        if (leadModalFooterCloseBtn) leadModalFooterCloseBtn.onclick = closeLeadModal;
        if (leadModalOverlay) {
            leadModalOverlay.onclick = (e) => {
                if (e.target === leadModalOverlay) closeLeadModal();
            };
        }

        // Leads Search input
        var leadsSearchInput = document.getElementById('sa-leads-search');
        if (leadsSearchInput) {
            leadsSearchInput.addEventListener('input', function () {
                renderLeadsTab(this.value);
            });
        }

        // Modal save
        modalSave.addEventListener('click', function () {
            saveSchool();
        });

        // SECTION 3 EVENTS: Add Class
        var btnAddClass = document.getElementById('sf-btn-add-class');
        if (btnAddClass) {
            btnAddClass.addEventListener('click', function() {
                var input = document.getElementById('sf-new-class-input');
                var cName = input ? input.value.trim() : '';
                if (!cName) {
                    showToast('Class name cannot be empty.', 'error');
                    return;
                }
                if (formClasses.indexOf(cName) !== -1) {
                    showToast('Class already exists.', 'error');
                    return;
                }
                formClasses.push(cName);
                formSections[cName] = ["A"]; // default A
                if (!formFeeStructure[cName]) {
                    formFeeStructure[cName] = {};
                    formFeeHeads.forEach(function(h) {
                        formFeeStructure[cName][h] = 0;
                    });
                }
                if (input) input.value = '';
                renderClassesSection();
                renderFeesSection();
            });
        }

        // SECTION 3 EVENTS: Quick Fill
        var btnQuickFill = document.getElementById('sf-btn-quick-fill');
        if (btnQuickFill) {
            btnQuickFill.addEventListener('click', function() {
                formClasses = ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
                formClasses.forEach(function(c) {
                    formSections[c] = ["A"];
                    if (!formFeeStructure[c]) {
                        formFeeStructure[c] = {};
                        formFeeHeads.forEach(function(h) {
                            formFeeStructure[c][h] = 0;
                        });
                    }
                });
                renderClassesSection();
                renderFeesSection();
            });
        }

        // SECTION 4 EVENTS: Add Fee Head
        var btnAddFeehead = document.getElementById('sf-btn-add-feehead');
        if (btnAddFeehead) {
            btnAddFeehead.addEventListener('click', function() {
                var input = document.getElementById('sf-new-feehead-input');
                var fhName = input ? input.value.trim() : '';
                if (!fhName) {
                    showToast('Fee head name cannot be empty.', 'error');
                    return;
                }
                var key = fhName.toLowerCase();
                if (formFeeHeads.indexOf(key) !== -1) {
                    showToast('Fee head already exists.', 'error');
                    return;
                }
                formFeeHeads.push(key);
                formClasses.forEach(function(c) {
                    if (!formFeeStructure[c]) formFeeStructure[c] = {};
                    formFeeStructure[c][key] = 0;
                });
                if (input) input.value = '';
                renderFeesSection();
            });
        }

        // SECTION 4 EVENTS: Fee Inputs (event delegation)
        var feeTableBody = document.getElementById('sf-fee-table-body');
        if (feeTableBody) {
            feeTableBody.addEventListener('input', function(e) {
                if (e.target.classList.contains('class-fee-input')) {
                    var c = e.target.getAttribute('data-class');
                    var h = e.target.getAttribute('data-head');
                    var val = parseFloat(e.target.value) || 0;
                    if (val < 0) val = 0;
                    if (!formFeeStructure[c]) formFeeStructure[c] = {};
                    formFeeStructure[c][h] = val;
                } else if (e.target.classList.contains('fee-apply-all-input')) {
                    var h = e.target.getAttribute('data-head');
                    var val = parseFloat(e.target.value) || 0;
                    if (val < 0) val = 0;
                    
                    formClasses.forEach(function(c) {
                        if (!formFeeStructure[c]) formFeeStructure[c] = {};
                        formFeeStructure[c][h] = val;
                    });
                    
                    var inputs = feeTableBody.querySelectorAll('.class-fee-input[data-head="' + h + '"]');
                    inputs.forEach(function(input) {
                        input.value = val;
                    });
                }
            });
        }

        // SECTION 5 EVENTS: Add Charge
        var btnAddCharge = document.getElementById('sf-btn-add-charge');
        if (btnAddCharge) {
            btnAddCharge.addEventListener('click', function() {
                var nameInput = document.getElementById('sf-charge-name');
                var amtInput = document.getElementById('sf-charge-amount');
                var typeSelect = document.getElementById('sf-charge-type');
                
                var name = nameInput ? nameInput.value.trim() : '';
                var amount = amtInput ? parseFloat(amtInput.value) : 0;
                var type = typeSelect ? typeSelect.value : 'one-time';
                
                if (!name) {
                    showToast('Charge name is required.', 'error');
                    return;
                }
                if (isNaN(amount) || amount <= 0) {
                    showToast('Please enter a valid amount.', 'error');
                    return;
                }
                
                formExtraCharges.push({
                    id: 'charge_' + Date.now(),
                    name: name,
                    amount: amount,
                    type: type
                });
                
                if (nameInput) nameInput.value = '';
                if (amtInput) amtInput.value = '';
                
                renderExtraChargesSection();
            });
        }

        // Delegated events on the schools table
        schoolsTbody.addEventListener('click', function (e) {
            var target = e.target;

            // Find the closest subdomain link
            var subdomainLink = target.closest('.sa-subdomain-link');
            if (subdomainLink) {
                e.preventDefault();
                e.stopPropagation();
                var schoolId = subdomainLink.getAttribute('data-school-id');
                var data = loadData();
                var school = findSchoolById(data.schools, schoolId);
                if (school) {
                    var host = window.location.host;
                    var redirectUrl;
                    if (host.includes('localhost') || host.includes('127.0.0.1')) {
                        var port = window.location.port ? (':' + window.location.port) : '';
                        redirectUrl = 'http://' + school.subdomain + '.localhost' + port;
                    } else {
                        redirectUrl = 'https://' + school.subdomain + '.ctrlshifts.in';
                    }
                    showToast('Opening tenant workspace: ' + redirectUrl, 'info');
                    setTimeout(function() {
                        window.location.href = redirectUrl;
                    }, 800);
                } else {
                    showToast('School configuration not found.', 'error');
                }
                return;
            }

            // Find the closest action button
            var actionBtn = target.closest('.sa-action-btn');
            if (actionBtn) {
                e.stopPropagation();
                var action   = actionBtn.getAttribute('data-action');
                var schoolId = actionBtn.getAttribute('data-school-id');
                var role     = actionBtn.getAttribute('data-role');

                switch (action) {
                    case 'edit':
                        showSchoolModal(schoolId);
                        break;
                    case 'toggle-status':
                        toggleSchoolStatus(schoolId);
                        break;
                    case 'impersonate':
                        impersonateSchool(schoolId, role);
                        break;
                }
                return;
            }

            // Row click: Open Detailed School Profile Modal
            var schoolRow = target.closest('.sa-school-row');
            if (schoolRow) {
                var sid = schoolRow.getAttribute('data-school-id');
                openSchoolProfileModal(sid);
            }
        });

        // Initialize feature dependencies
        setupFeatureDependencies();

    }); // END DOMContentLoaded

    function setupFeatureDependencies() {
        var grid = document.getElementById('sf-features-grid');
        if (!grid) return;

        // Map child feature to parent requirements
        var dependencies = {
            'print_receipt': ['fees'],
            'fee_ledger': ['fees'],
            'attendance': ['students'],
            'exams': ['students'],
            'promotion': ['students', 'exams'],
            'teacher-attendance': ['teachers'],
            'timetable': ['teachers'],
            'report_cards': ['exams']
        };

        // Map parent feature to lists of child features
        var childFeatures = {
            'fees': ['print_receipt', 'fee_ledger'],
            'students': ['attendance', 'exams', 'promotion'],
            'exams': ['promotion', 'report_cards'],
            'teachers': ['teacher-attendance', 'timetable']
        };

        var labels = {
            'fees': 'Fees & Payments',
            'students': 'Students & Admissions',
            'exams': 'Exams & Results',
            'teachers': 'Teachers & Staff',
            'print_receipt': 'Print Receipt',
            'fee_ledger': 'Fee Ledger & Transactions',
            'attendance': 'Attendance Tracking',
            'timetable': 'Timetable & Scheduling',
            'promotion': 'Class Promotion',
            'report_cards': 'Report Cards',
            'teacher-attendance': 'My Attendance'
        };

        grid.addEventListener('change', function(e) {
            if (e.target.tagName !== 'INPUT' || e.target.type !== 'checkbox') return;
            var cb = e.target;
            var val = cb.value;

            if (cb.checked) {
                // Check parent features
                var parents = dependencies[val];
                if (parents) {
                    parents.forEach(function(parentVal) {
                        var parentCb = grid.querySelector('input[value="' + parentVal + '"]');
                        if (parentCb && !parentCb.checked) {
                            parentCb.checked = true;
                            // Trigger change event recursively for parent to ensure its parents are checked too
                            var event = new Event('change', { bubbles: true });
                            parentCb.dispatchEvent(event);
                        }
                    });
                }
            } else {
                // Uncheck child features
                var children = childFeatures[val];
                if (children) {
                    children.forEach(function(childVal) {
                        var childCb = grid.querySelector('input[value="' + childVal + '"]');
                        if (childCb && childCb.checked) {
                            childCb.checked = false;
                            
                            // Show message / toast to explain auto-uncheck
                            showToast(labels[val] + ' must be enabled to use ' + labels[childVal], 'info');
                            
                            // Trigger change event recursively for child to uncheck its sub-children
                            var event = new Event('change', { bubbles: true });
                            childCb.dispatchEvent(event);
                        }
                    });
                }
            }

            // Sync System feature "My Attendance" locked state visually
            var teachersCb = grid.querySelector('input[value="teachers"]');
            var myAttendanceCb = grid.querySelector('input[value="teacher-attendance"]');
            if (teachersCb && myAttendanceCb) {
                myAttendanceCb.checked = teachersCb.checked;
            }
        });
    }

})();
