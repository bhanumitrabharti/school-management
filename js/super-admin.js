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
    var currentEditRequestId = 0;
    var currentEditingSchoolId = null;
    var currentEditingTenantData = null;

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
        console.log('SA login attempt started');
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
        var allSchools = data.schools || [];
        var schools = allSchools.filter(function (s) {
            return s.archived !== true;
        });

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
                        '<button class="sa-action-btn btn-archive" data-action="archive" data-school-id="' + escapeAttr(school.school_id) + '" title="Archive School">' +
                            '<span class="material-icons-round">archive</span> Archive' +
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

    /** Render the Archived Schools table in tab-archived. */
    function renderArchivedSchools() {
        var tbody = document.getElementById('sa-archived-tbody');
        if (!tbody) return;

        var data = loadData();
        var allSchools = data.schools || [];
        var archivedSchools = allSchools.filter(function (s) {
            return s.archived === true;
        });

        var queryInput = document.getElementById('sa-archived-search');
        if (queryInput && queryInput.value.trim()) {
            var q = queryInput.value.trim().toLowerCase();
            archivedSchools = archivedSchools.filter(function (s) {
                return (s.school_name && s.school_name.toLowerCase().indexOf(q) !== -1) ||
                       (s.subdomain && s.subdomain.toLowerCase().indexOf(q) !== -1) ||
                       (s.archiveReason && s.archiveReason.toLowerCase().indexOf(q) !== -1);
            });
        }

        if (archivedSchools.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="6">' +
                    '<div class="sa-empty-state" style="padding: 40px 20px; text-align: center;">' +
                        '<span class="material-icons-round" style="font-size: 48px; opacity: 0.4;">archive</span>' +
                        '<h3 style="margin: 12px 0 6px 0;">No Archived Schools</h3>' +
                        '<p style="opacity: 0.6; margin: 0;">Schools that are archived will appear here for restoration.</p>' +
                    '</div>' +
                '</td></tr>';
            return;
        }

        var html = '';
        archivedSchools.forEach(function (school) {
            var dateStr = school.archivedAt ? new Date(school.archivedAt).toLocaleString() : '—';
            var archivedBy = school.archivedBy || 'Super Admin';
            var reason = school.archiveReason || 'No reason provided';

            html += '<tr>' +
                '<td>' +
                    '<div style="font-weight: 600; color: var(--text-primary, #fff);">' + escapeHTML(school.school_name) + '</div>' +
                '</td>' +
                '<td><code>' + escapeHTML(school.subdomain) + '</code></td>' +
                '<td>' + escapeHTML(dateStr) + '</td>' +
                '<td>' + escapeHTML(archivedBy) + '</td>' +
                '<td>' + escapeHTML(reason) + '</td>' +
                '<td>' +
                    '<button class="sa-btn sa-btn-primary sa-btn-sm btn-restore-school" data-school-id="' + escapeAttr(school.school_id) + '" style="background: var(--accent-primary, #3b82f6); display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 12px;">' +
                        '<span class="material-icons-round" style="font-size: 14px;">unarchive</span> Restore' +
                    '</button>' +
                '</td>' +
            '</tr>';
        });

        tbody.innerHTML = html;
    }

    /** Open the Archive Confirmation Modal. */
    function showArchiveModal(schoolId) {
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        if (!school) {
            showToast('School not found', 'error');
            return;
        }

        document.getElementById('sa-archive-school-id').value = school.school_id;
        document.getElementById('sa-archive-school-name').textContent = school.school_name;
        document.getElementById('sa-archive-reason').value = '';

        var overlay = document.getElementById('sa-archive-modal-overlay');
        if (overlay) {
            overlay.classList.add('active');
        }
    }

    /** Confirm archiving of a school. */
    async function confirmArchiveSchool() {
        var schoolId = document.getElementById('sa-archive-school-id').value;
        var reason = document.getElementById('sa-archive-reason').value.trim();

        await ensureDataLoaded();
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        if (!school) {
            showToast('School not found', 'error');
            return;
        }

        var currentUserEmail = (saCache.currentUser && saCache.currentUser.email) || 'Super Admin';
        school.archived = true;
        school.archivedAt = new Date().toISOString();
        school.archivedBy = currentUserEmail;
        school.archiveReason = reason;

        // Log the event in detailed school audit logs (matching existing recovery/ticket pattern)
        if (!data.audit_logs) data.audit_logs = [];
        data.audit_logs.unshift({
            school_id: schoolId,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            actor: currentUserEmail,
            action: 'Archived school' + (reason ? ': ' + reason : ''),
            type: 'delete' // red badge
        });

        saveData(data);
        try {
            await setDoc(doc(db, 'schools', schoolId), school);
            await setDoc(doc(db, 'sa_data', 'audit_logs'), { logs: data.audit_logs });
        } catch (e) {
            console.error('Failed to save archive state to Firestore:', e);
            showToast('Failed to save archive state to cloud database.', 'error');
            return;
        }

        showToast('School "' + school.school_name + '" archived successfully.', 'success');

        var overlay = document.getElementById('sa-archive-modal-overlay');
        if (overlay) overlay.classList.remove('active');

        renderDashboard();
        renderArchivedSchools();
    }

    /** Restore an archived school back to active directory. */
    async function restoreSchool(schoolId) {
        await ensureDataLoaded();
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        if (!school) {
            showToast('School not found', 'error');
            return;
        }

        var currentUserEmail = (saCache.currentUser && saCache.currentUser.email) || 'Super Admin';
        school.archived = false;
        school.restoredAt = new Date().toISOString();

        // Log the event in detailed school audit logs (matching existing recovery/ticket pattern)
        if (!data.audit_logs) data.audit_logs = [];
        data.audit_logs.unshift({
            school_id: schoolId,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            actor: currentUserEmail,
            action: 'Restored school to active directory',
            type: 'add' // green badge
        });

        saveData(data);
        try {
            await setDoc(doc(db, 'schools', schoolId), school);
            await setDoc(doc(db, 'sa_data', 'audit_logs'), { logs: data.audit_logs });
        } catch (e) {
            console.error('Failed to save restore state to Firestore:', e);
            showToast('Failed to save restore state to cloud database.', 'error');
            return;
        }

        showToast('School "' + school.school_name + '" restored to active directory.', 'success');

        renderDashboard();
        renderArchivedSchools();
    }

    // ─── Billing & Agreement Generator ──────────────────────────

    /** Render Billing & Agreements Tab Table */
    function renderBillingTab() {
        var tbody = document.getElementById('sa-agreements-tbody');
        if (!tbody) return;

        var data = loadData();
        var agreements = data.agreements || [];

        var queryInput = document.getElementById('sa-billing-search');
        if (queryInput && queryInput.value.trim()) {
            var q = queryInput.value.trim().toLowerCase();
            agreements = agreements.filter(function(a) {
                return (a.refNo && a.refNo.toLowerCase().indexOf(q) !== -1) ||
                       (a.schoolName && a.schoolName.toLowerCase().indexOf(q) !== -1) ||
                       (a.plan && a.plan.toLowerCase().indexOf(q) !== -1);
            });
        }

        if (agreements.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="7">' +
                    '<div class="sa-empty-state" style="padding: 40px 20px; text-align: center;">' +
                        '<span class="material-icons-round" style="font-size: 48px; opacity: 0.4;">receipt_long</span>' +
                        '<h3 style="margin: 12px 0 6px 0;">No Agreements Created Yet</h3>' +
                        '<p style="opacity: 0.6; margin: 0;">Click "Generate New Agreement" to create client contracts and billing invoices.</p>' +
                    '</div>' +
                '</td></tr>';
            return;
        }

        var html = '';
        agreements.forEach(function(ag) {
            var statusBadge = ag.status === 'Active' ? 'sa-badge-active' :
                              ag.status === 'Sent'   ? 'sa-badge-pro' : 'sa-badge-basic';

            html += '<tr>' +
                '<td><strong style="color: var(--primary-light, #60a5fa);">' + escapeHTML(ag.refNo) + '</strong></td>' +
                '<td>' + escapeHTML(ag.schoolName) + '</td>' +
                '<td><span class="sa-badge ' + statusBadge + '">' + escapeHTML(ag.plan || 'Standard') + ' (' + escapeHTML(ag.cycle || 'Annual') + ')</span></td>' +
                '<td>' + escapeHTML(ag.startDate || '—') + ' to ' + escapeHTML(ag.endDate || '—') + '</td>' +
                '<td><strong style="color:#34d399;">₹' + Number(ag.netTotal || 0).toLocaleString('en-IN') + '</strong></td>' +
                '<td><span class="sa-badge ' + statusBadge + '">' + escapeHTML(ag.status || 'Draft') + '</span></td>' +
                '<td>' +
                    '<div style="display:flex; gap:6px;">' +
                        '<button class="sa-action-btn btn-edit-ag" data-id="' + escapeAttr(ag.id) + '" title="Edit Agreement">' +
                            '<span class="material-icons-round">edit</span> Edit' +
                        '</button>' +
                        '<button class="sa-action-btn btn-print-ag" data-id="' + escapeAttr(ag.id) + '" title="Print PDF">' +
                            '<span class="material-icons-round">print</span> Print' +
                        '</button>' +
                        '<button class="sa-action-btn btn-delete-ag" data-id="' + escapeAttr(ag.id) + '" title="Delete Agreement" style="color:#ef4444; border-color:rgba(239,68,68,0.3);">' +
                            '<span class="material-icons-round">delete</span>' +
                        '</button>' +
                    '</div>' +
                '</td>' +
            '</tr>';
        });

        tbody.innerHTML = html;
    }

    /** Compute and update live pricing calculations in Agreement Generator Modal. */
    function updateAgreementLivePricing() {
        var baseFee = parseFloat(document.getElementById('sf-ag-base-fee').value) || 0;
        var perStudentFee = parseFloat(document.getElementById('sf-ag-per-student-fee').value) || 0;
        var studentCount = parseInt(document.getElementById('sf-ag-student-count').value, 10) || 0;
        var discountPct = parseFloat(document.getElementById('sf-ag-discount-pct').value) || 0;
        var taxPct = parseFloat(document.getElementById('sf-ag-tax-pct').value) || 0;

        var studentTotal = perStudentFee * studentCount;
        var subtotal = baseFee + studentTotal;
        var discountAmt = subtotal * (discountPct / 100);
        var taxableAmt = subtotal - discountAmt;
        var taxAmt = taxableAmt * (taxPct / 100);
        var netTotal = Math.round(taxableAmt + taxAmt);

        var breakdownText = 'Base ₹' + baseFee.toLocaleString('en-IN') +
            ' + (' + studentCount + ' × ₹' + perStudentFee + ' = ₹' + studentTotal.toLocaleString('en-IN') + ')' +
            (discountPct > 0 ? (' - ' + discountPct + '% Disc') : '') +
            ' + ' + taxPct + '% GST';

        var breakdownEl = document.getElementById('sa-ag-calc-breakdown');
        var netTotalEl = document.getElementById('sa-ag-net-total');

        if (breakdownEl) breakdownEl.textContent = breakdownText;
        if (netTotalEl) netTotalEl.textContent = '₹' + netTotal.toLocaleString('en-IN');

        return {
            subtotal: subtotal,
            discountAmt: discountAmt,
            taxableAmt: taxableAmt,
            taxAmt: taxAmt,
            netTotal: netTotal
        };
    }

    /** Open the Agreement Generator Modal. */
    function showAgreementModal(agreementId) {
        var data = loadData();
        var schools = (data.schools || []).filter(function(s) { return s.archived !== true; });

        var schoolSelect = document.getElementById('sf-ag-school-id');
        if (schoolSelect) {
            schoolSelect.innerHTML = schools.map(function(s) {
                return '<option value="' + escapeAttr(s.school_id) + '">' + escapeHTML(s.school_name) + ' (' + escapeHTML(s.subdomain) + ')</option>';
            }).join('');
        }

        var today = new Date();
        var nextYear = new Date();
        nextYear.setFullYear(today.getFullYear() + 1);

        var todayStr = today.toISOString().split('T')[0];
        var nextYearStr = nextYear.toISOString().split('T')[0];

        if (agreementId) {
            var agreements = data.agreements || [];
            var ag = agreements.find(function(item) { return item.id === agreementId; });
            if (ag) {
                document.getElementById('sf-ag-id').value = ag.id;
                document.getElementById('sf-ag-ref-no').value = ag.refNo;
                document.getElementById('sf-ag-school-id').value = ag.schoolId;
                document.getElementById('sf-ag-plan').value = ag.plan || 'Pro';
                document.getElementById('sf-ag-cycle').value = ag.cycle || 'Annual';
                document.getElementById('sf-ag-start-date').value = ag.startDate || todayStr;
                document.getElementById('sf-ag-end-date').value = ag.endDate || nextYearStr;
                document.getElementById('sf-ag-base-fee').value = ag.baseFee !== undefined ? ag.baseFee : 25000;
                document.getElementById('sf-ag-per-student-fee').value = ag.perStudentFee !== undefined ? ag.perStudentFee : 50;
                document.getElementById('sf-ag-student-count').value = ag.studentCount !== undefined ? ag.studentCount : 500;
                document.getElementById('sf-ag-discount-pct').value = ag.discountPct !== undefined ? ag.discountPct : 10;
                document.getElementById('sf-ag-tax-pct').value = ag.taxPct !== undefined ? ag.taxPct : 18;
                document.getElementById('sf-ag-status').value = ag.status || 'Active';
                document.getElementById('sf-ag-notes').value = ag.notes || '';
                document.getElementById('sa-ag-modal-title').textContent = 'Edit SaaS Agreement — ' + ag.refNo;
            }
        } else {
            var newRef = 'AGR-' + today.getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
            document.getElementById('sf-ag-id').value = '';
            document.getElementById('sf-ag-ref-no').value = newRef;
            document.getElementById('sf-ag-plan').value = 'Pro';
            document.getElementById('sf-ag-cycle').value = 'Annual';
            document.getElementById('sf-ag-start-date').value = todayStr;
            document.getElementById('sf-ag-end-date').value = nextYearStr;
            document.getElementById('sf-ag-base-fee').value = 25000;
            document.getElementById('sf-ag-per-student-fee').value = 50;
            document.getElementById('sf-ag-student-count').value = 500;
            document.getElementById('sf-ag-discount-pct').value = 10;
            document.getElementById('sf-ag-tax-pct').value = 18;
            document.getElementById('sf-ag-status').value = 'Active';
            document.getElementById('sf-ag-notes').value = 'Payment due within 15 days of invoice date. Support includes priority SLA resolution.';
            document.getElementById('sa-ag-modal-title').textContent = 'Generate SaaS Agreement / Contract';
        }

        updateAgreementLivePricing();

        var overlay = document.getElementById('sa-agreement-modal-overlay');
        if (overlay) overlay.classList.add('active');
    }

    /** Save an Agreement entry. */
    async function saveAgreement() {
        var schoolId = document.getElementById('sf-ag-school-id').value;
        if (!schoolId) {
            showToast('Please select a target school tenant.', 'error');
            return;
        }

        await ensureDataLoaded();
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        var schoolName = school ? school.school_name : 'Unknown School';

        var calc = updateAgreementLivePricing();
        var agId = document.getElementById('sf-ag-id').value || ('ag_' + Date.now());
        var refNo = document.getElementById('sf-ag-ref-no').value || ('AGR-' + Date.now());

        var newAgreement = {
            id: agId,
            refNo: refNo,
            schoolId: schoolId,
            schoolName: schoolName,
            plan: document.getElementById('sf-ag-plan').value,
            cycle: document.getElementById('sf-ag-cycle').value,
            startDate: document.getElementById('sf-ag-start-date').value,
            endDate: document.getElementById('sf-ag-end-date').value,
            baseFee: parseFloat(document.getElementById('sf-ag-base-fee').value) || 0,
            perStudentFee: parseFloat(document.getElementById('sf-ag-per-student-fee').value) || 0,
            studentCount: parseInt(document.getElementById('sf-ag-student-count').value, 10) || 0,
            discountPct: parseFloat(document.getElementById('sf-ag-discount-pct').value) || 0,
            taxPct: parseFloat(document.getElementById('sf-ag-tax-pct').value) || 0,
            subtotal: calc.subtotal,
            discountAmt: calc.discountAmt,
            taxableAmt: calc.taxableAmt,
            taxAmt: calc.taxAmt,
            netTotal: calc.netTotal,
            status: document.getElementById('sf-ag-status').value,
            notes: document.getElementById('sf-ag-notes').value.trim(),
            createdAt: new Date().toISOString()
        };

        if (!data.agreements) data.agreements = [];
        var idx = data.agreements.findIndex(function(a) { return a.id === agId; });
        if (idx !== -1) {
            data.agreements[idx] = newAgreement;
        } else {
            data.agreements.unshift(newAgreement);
        }

        await saveData(data);
        showToast('Agreement ' + refNo + ' saved successfully.', 'success');

        var overlay = document.getElementById('sa-agreement-modal-overlay');
        if (overlay) overlay.classList.remove('active');

        renderBillingTab();
    }

    /** Print / Export Agreement PDF via Printable Blob Window */
    function exportAgreementPDF(agreementId) {
        var data = loadData();
        var ag = null;

        if (agreementId) {
            ag = (data.agreements || []).find(function(a) { return a.id === agreementId; });
        }

        if (!ag) {
            // Build temporary object from open modal inputs
            var schoolId = document.getElementById('sf-ag-school-id').value;
            var school = findSchoolById(data.schools, schoolId);
            var calc = updateAgreementLivePricing();
            ag = {
                refNo: document.getElementById('sf-ag-ref-no').value,
                schoolName: school ? school.school_name : 'School Tenant',
                plan: document.getElementById('sf-ag-plan').value,
                cycle: document.getElementById('sf-ag-cycle').value,
                startDate: document.getElementById('sf-ag-start-date').value,
                endDate: document.getElementById('sf-ag-end-date').value,
                baseFee: parseFloat(document.getElementById('sf-ag-base-fee').value) || 0,
                perStudentFee: parseFloat(document.getElementById('sf-ag-per-student-fee').value) || 0,
                studentCount: parseInt(document.getElementById('sf-ag-student-count').value, 10) || 0,
                discountPct: parseFloat(document.getElementById('sf-ag-discount-pct').value) || 0,
                taxPct: parseFloat(document.getElementById('sf-ag-tax-pct').value) || 0,
                subtotal: calc.subtotal,
                discountAmt: calc.discountAmt,
                taxableAmt: calc.taxableAmt,
                taxAmt: calc.taxAmt,
                netTotal: calc.netTotal,
                status: document.getElementById('sf-ag-status').value,
                notes: document.getElementById('sf-ag-notes').value.trim()
            };
        }

        var contractHTML =
            '<div style="max-width: 800px; margin: 0 auto; padding: 24px; font-family: Inter, Arial, sans-serif; color: #1e293b;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #2563eb; padding-bottom:16px; margin-bottom:24px;">' +
                    '<div>' +
                        '<h1 style="margin:0; font-size:24px; color:#1e3a8a;">CTRL SHIFT SOLUTIONS</h1>' +
                        '<p style="margin:4px 0 0 0; font-size:13px; color:#64748b;">Software as a Service (SaaS) Agreement</p>' +
                    '</div>' +
                    '<div style="text-align:right;">' +
                        '<h3 style="margin:0; font-size:16px; color:#2563eb;">' + escapeHTML(ag.refNo) + '</h3>' +
                        '<p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">Date: ' + new Date().toLocaleDateString() + '</p>' +
                    '</div>' +
                '</div>' +

                '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin-bottom:24px;">' +
                    '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px;">' +
                        '<h4 style="margin:0 0 8px 0; color:#1e3a8a; font-size:13px; text-transform:uppercase;">PROVIDER (LICENSOR)</h4>' +
                        '<strong style="font-size:14px;">CTRL Shift Solutions Private Limited</strong><br>' +
                        '<span style="font-size:12px; color:#475569;">Email: support@ctrlshifts.in</span><br>' +
                        '<span style="font-size:12px; color:#475569;">Web: ctrlshifts.in</span>' +
                    '</div>' +
                    '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px;">' +
                        '<h4 style="margin:0 0 8px 0; color:#1e3a8a; font-size:13px; text-transform:uppercase;">CLIENT (TENANT)</h4>' +
                        '<strong style="font-size:14px;">' + escapeHTML(ag.schoolName) + '</strong><br>' +
                        '<span style="font-size:12px; color:#475569;">Plan: ' + escapeHTML(ag.plan) + ' (' + escapeHTML(ag.cycle) + ')</span><br>' +
                        '<span style="font-size:12px; color:#475569;">Contract Term: ' + escapeHTML(ag.startDate || '—') + ' to ' + escapeHTML(ag.endDate || '—') + '</span>' +
                    '</div>' +
                '</div>' +

                '<h3 style="color:#1e3a8a; font-size:16px; border-bottom:1px solid #cbd5e1; padding-bottom:6px;">1. Commercial &amp; Pricing Schedule</h3>' +
                '<table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:13px;">' +
                    '<thead>' +
                        '<tr style="background:#1e3a8a; color:#fff;">' +
                            '<th style="padding:10px; text-align:left;">Description</th>' +
                            '<th style="padding:10px; text-align:center;">Qty / Units</th>' +
                            '<th style="padding:10px; text-align:right;">Rate (₹)</th>' +
                            '<th style="padding:10px; text-align:right;">Amount (₹)</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' +
                        '<tr style="border-bottom:1px solid #e2e8f0;">' +
                            '<td style="padding:10px;">Base Platform Subscription License (' + escapeHTML(ag.plan) + ')</td>' +
                            '<td style="padding:10px; text-align:center;">1 Year</td>' +
                            '<td style="padding:10px; text-align:right;">₹' + Number(ag.baseFee || 0).toLocaleString('en-IN') + '</td>' +
                            '<td style="padding:10px; text-align:right;">₹' + Number(ag.baseFee || 0).toLocaleString('en-IN') + '</td>' +
                        '</tr>' +
                        '<tr style="border-bottom:1px solid #e2e8f0;">' +
                            '<td style="padding:10px;">Student Active User Licenses</td>' +
                            '<td style="padding:10px; text-align:center;">' + (ag.studentCount || 0) + ' Students</td>' +
                            '<td style="padding:10px; text-align:right;">₹' + (ag.perStudentFee || 0) + '/student</td>' +
                            '<td style="padding:10px; text-align:right;">₹' + Number((ag.perStudentFee || 0) * (ag.studentCount || 0)).toLocaleString('en-IN') + '</td>' +
                        '</tr>' +
                        '<tr style="border-bottom:1px solid #e2e8f0; font-weight:600; background:#f8fafc;">' +
                            '<td colspan="3" style="padding:10px; text-align:right;">Subtotal</td>' +
                            '<td style="padding:10px; text-align:right;">₹' + Number(ag.subtotal || 0).toLocaleString('en-IN') + '</td>' +
                        '</tr>' +
                        (ag.discountAmt > 0 ?
                        '<tr style="border-bottom:1px solid #e2e8f0; color:#dc2626;">' +
                            '<td colspan="3" style="padding:10px; text-align:right;">Discount (' + (ag.discountPct || 0) + '%)</td>' +
                            '<td style="padding:10px; text-align:right;">-₹' + Number(ag.discountAmt || 0).toLocaleString('en-IN') + '</td>' +
                        '</tr>' : '') +
                        '<tr style="border-bottom:1px solid #e2e8f0;">' +
                            '<td colspan="3" style="padding:10px; text-align:right;">GST / Applicable Taxes (' + (ag.taxPct || 0) + '%)</td>' +
                            '<td style="padding:10px; text-align:right;">+₹' + Number(ag.taxAmt || 0).toLocaleString('en-IN') + '</td>' +
                        '</tr>' +
                        '<tr style="background:#1e3a8a; color:#fff; font-size:15px; font-weight:700;">' +
                            '<td colspan="3" style="padding:12px; text-align:right;">Total Annual Payable Amount</td>' +
                            '<td style="padding:12px; text-align:right;">₹' + Number(ag.netTotal || 0).toLocaleString('en-IN') + '</td>' +
                        '</tr>' +
                    '</tbody>' +
                '</table>' +

                '<h3 style="color:#1e3a8a; font-size:16px; border-bottom:1px solid #cbd5e1; padding-bottom:6px;">2. Terms &amp; Conditions</h3>' +
                '<p style="font-size:13px; line-height:1.6; color:#475569;">' +
                    (ag.notes ? escapeHTML(ag.notes) : 'Standard terms apply. Payment is due within 15 days of invoice date. CTRL Shift Solutions guarantees 99.9% uptime SLA.') +
                '</p>' +

                '<div style="display:flex; justify-content:space-between; margin-top:60px; padding-top:20px; border-top:1px solid #e2e8f0;">' +
                    '<div style="text-align:center; width:220px;">' +
                        '<div style="height:40px; border-bottom:1px dashed #94a3b8; margin-bottom:8px;"></div>' +
                        '<strong style="font-size:13px;">Authorized Signatory</strong><br>' +
                        '<span style="font-size:11px; color:#64748b;">CTRL Shift Solutions</span>' +
                    '</div>' +
                    '<div style="text-align:center; width:220px;">' +
                        '<div style="height:40px; border-bottom:1px dashed #94a3b8; margin-bottom:8px;"></div>' +
                        '<strong style="font-size:13px;">Authorized Signatory</strong><br>' +
                        '<span style="font-size:11px; color:#64748b;">' + escapeHTML(ag.schoolName) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SaaS_Agreement_' + ag.refNo + '</title>' +
            '<style>@page{size:A4 portrait;margin:12mm;} body{margin:0;padding:0;font-family:Inter,Arial,sans-serif;}</style>' +
            '</head><body>' + contractHTML + '</body></html>';

        var blob = new Blob([fullHtml], {type: 'text/html'});
        var url = URL.createObjectURL(blob);
        var printWin = window.open(url, '_blank', 'width=900,height=800');
        if (printWin) {
            printWin.onload = function() {
                printWin.print();
            };
        } else {
            showToast('Popup blocked. Please allow popups to print agreement.', 'warning');
        }
    }

    /** Delete an agreement entry */
    async function deleteAgreement(agreementId) {
        if (!confirm('Are you sure you want to delete this agreement contract?')) return;

        await ensureDataLoaded();
        var data = loadData();
        if (data.agreements) {
            data.agreements = data.agreements.filter(function(a) { return a.id !== agreementId; });
            await saveData(data);
            showToast('Agreement deleted.', 'info');
            renderBillingTab();
        }
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

    /**
     * Full 12-store cascade migration for class rename in Super Admin.
     * Creates a restore point BEFORE executing and updates all affected stores in Firestore.
     */
    async function executeSuperAdminClassRename(oldClass, newClass) {
        if (!oldClass || !newClass || oldClass === newClass) return;
        
        var cleanNew = String(newClass).trim();
        if (!cleanNew) {
            showToast('Class name cannot be empty.', 'error');
            return;
        }

        // Check if cleanNew already exists
        if (formClasses.indexOf(cleanNew) !== -1) {
            showToast("Class '" + cleanNew + "' already exists.", 'error');
            return;
        }

        var schoolId = currentEditingSchoolId;
        var data = loadData();
        var school = schoolId ? findSchoolById(data.schools, schoolId) : null;
        var schoolName = school ? school.school_name : 'New School';
        var currentUserEmail = (saCache.currentUser && saCache.currentUser.email) || 'Super Admin';

        var affectedCount = 0;
        if (currentEditingTenantData && currentEditingTenantData.students) {
            affectedCount = currentEditingTenantData.students.filter(function(s) {
                return String(s.class || '').trim() === String(oldClass).trim();
            }).length;
        }

        var confirmMsg = "Rename class '" + oldClass + "' to '" + cleanNew + "'?\n\n";
        if (affectedCount > 0) {
            confirmMsg += "This will automatically cascade and update " + affectedCount + " enrolled student(s), attendance records, exam subjects, marks, fee ledger activity, and timetable.";
        } else {
            confirmMsg += "This class currently has 0 enrolled students. Structure and fee settings will be updated.";
        }

        if (!confirm(confirmMsg)) {
            return;
        }

        // 1. If existing school in Firestore, perform full cascade migration with restore point
        if (schoolId) {
            showToast("Creating restore point and cascading class rename...", "info");

            try {
                // Load fresh tenant_data from Firestore
                var tenantRef = doc(db, 'tenant_data', schoolId);
                var tenantSnap = await getDoc(tenantRef);
                var tenantData = tenantSnap.exists() ? tenantSnap.data() : (currentEditingTenantData || {});

                // Create Restore Point BEFORE cascade executes
                if (!tenantData.trash) tenantData.trash = [];
                var restorePointId = 'rp_' + Date.now().toString(36);
                tenantData.trash.unshift({
                    id: restorePointId,
                    timestamp: new Date().toISOString(),
                    description: "Auto-Backup before renaming class '" + oldClass + "' to '" + cleanNew + "' in " + schoolName,
                    type: 'restore_point',
                    schoolId: schoolId,
                    snapshot: JSON.parse(JSON.stringify(tenantData))
                });
                if (tenantData.trash.length > 10) tenantData.trash = tenantData.trash.slice(0, 10);

                // Mirror restore point to recovery_trash for Super Admin inspectability
                if (!data.recovery_trash) data.recovery_trash = [];
                data.recovery_trash.unshift({
                    id: 'rec_' + Date.now().toString(36),
                    school_id: schoolId,
                    school_name: schoolName,
                    data_type: "Class Rename Snapshot ('" + oldClass + "' → '" + cleanNew + "')",
                    deleted_by: currentUserEmail,
                    deleted_time: new Date().toISOString().replace('T', ' ').substring(0, 16)
                });
                if (data.recovery_trash.length > 20) data.recovery_trash = data.recovery_trash.slice(0, 20);

                // Cascade Migration Across All 12 Stores:
                // 1. settings.classes
                if (tenantData.settings && tenantData.settings.classes) {
                    var cIdx = tenantData.settings.classes.indexOf(oldClass);
                    if (cIdx !== -1) tenantData.settings.classes[cIdx] = cleanNew;
                }

                // 2. settings.sections
                // Skip when sections is still the legacy flat shared array (not a
                // per-class map) — renaming a class doesn't need to touch it (the
                // same shared list still applies to the renamed class), and
                // indexing/deleting into it by class name could corrupt the array
                // if the class name happens to look like a numeric index.
                if (tenantData.settings && tenantData.settings.sections && !Array.isArray(tenantData.settings.sections) && tenantData.settings.sections[oldClass]) {
                    tenantData.settings.sections[cleanNew] = tenantData.settings.sections[oldClass];
                    delete tenantData.settings.sections[oldClass];
                }

                // 3. settings.feeStructure
                if (tenantData.settings && tenantData.settings.feeStructure && tenantData.settings.feeStructure[oldClass]) {
                    tenantData.settings.feeStructure[cleanNew] = tenantData.settings.feeStructure[oldClass];
                    delete tenantData.settings.feeStructure[oldClass];
                }

                // 4. feeStructures (legacy)
                if (tenantData.feeStructures && tenantData.feeStructures[oldClass]) {
                    tenantData.feeStructures[cleanNew] = tenantData.feeStructures[oldClass];
                    delete tenantData.feeStructures[oldClass];
                }

                // 5. students (student.class)
                var migratedStudents = 0;
                if (tenantData.students) {
                    tenantData.students.forEach(function(s) {
                        if (String(s.class || '').trim() === String(oldClass).trim()) {
                            s.class = cleanNew;
                            migratedStudents++;
                        }
                    });
                }

                // 6. teachers (assignedClasses, classTeacherOf, subjectTeacherOf)
                if (tenantData.teachers) {
                    tenantData.teachers.forEach(function(t) {
                        (t.assignedClasses || []).forEach(function(ac, idx) {
                            if (typeof ac === 'string' && ac.trim() === oldClass.trim()) {
                                t.assignedClasses[idx] = cleanNew;
                            } else if (ac && typeof ac === 'object' && String(ac.class || '').trim() === String(oldClass).trim()) {
                                ac.class = cleanNew;
                            }
                        });
                        (t.classTeacherOf || []).forEach(function(ct, idx) {
                            if (typeof ct === 'string' && ct.trim() === oldClass.trim()) {
                                t.classTeacherOf[idx] = cleanNew;
                            } else if (ct && typeof ct === 'object' && String(ct.class || '').trim() === String(oldClass).trim()) {
                                ct.class = cleanNew;
                            }
                        });
                        (t.subjectTeacherOf || []).forEach(function(st, idx) {
                            if (typeof st === 'string' && st.trim() === oldClass.trim()) {
                                t.subjectTeacherOf[idx] = cleanNew;
                            } else if (st && typeof st === 'object' && String(st.class || '').trim() === String(oldClass).trim()) {
                                st.class = cleanNew;
                            }
                        });
                    });
                }

                // 7. attendance (class, classId)
                if (tenantData.attendance) {
                    tenantData.attendance.forEach(function(rec) {
                        if (String(rec.class || '').trim() === String(oldClass).trim()) rec.class = cleanNew;
                        if (String(rec.classId || '').trim() === String(oldClass).trim()) rec.classId = cleanNew;
                    });
                }

                // 8. examSubjects (examSubjects[termId][classId])
                if (tenantData.examSubjects) {
                    Object.keys(tenantData.examSubjects).forEach(function(termId) {
                        if (tenantData.examSubjects[termId] && tenantData.examSubjects[termId][oldClass]) {
                            tenantData.examSubjects[termId][cleanNew] = tenantData.examSubjects[termId][oldClass];
                            delete tenantData.examSubjects[termId][oldClass];
                        }
                    });
                }

                // 9. examMarks (examMarks[termId][classId])
                if (tenantData.examMarks) {
                    Object.keys(tenantData.examMarks).forEach(function(termId) {
                        if (tenantData.examMarks[termId] && tenantData.examMarks[termId][oldClass]) {
                            tenantData.examMarks[termId][cleanNew] = tenantData.examMarks[termId][oldClass];
                            delete tenantData.examMarks[termId][oldClass];
                        }
                    });
                }

                // 10. subjectMapping (direct key & composite term_class keys)
                if (tenantData.subjectMapping) {
                    if (tenantData.subjectMapping[oldClass]) {
                        tenantData.subjectMapping[cleanNew] = tenantData.subjectMapping[oldClass];
                        delete tenantData.subjectMapping[oldClass];
                    }
                    Object.keys(tenantData.subjectMapping).forEach(function(k) {
                        if (k.endsWith('_' + oldClass)) {
                            var prefix = k.substring(0, k.length - oldClass.length);
                            tenantData.subjectMapping[prefix + cleanNew] = tenantData.subjectMapping[k];
                            delete tenantData.subjectMapping[k];
                        }
                    });
                }

                // 11. timetable (classSection keys: "oldClass-A" -> "newClass-A")
                if (tenantData.timetable) {
                    Object.keys(tenantData.timetable).forEach(function(k) {
                        if (k !== 'settings') {
                            if (k === oldClass) {
                                tenantData.timetable[cleanNew] = tenantData.timetable[k];
                                delete tenantData.timetable[k];
                            } else if (k.startsWith(oldClass + '-')) {
                                var newKey = cleanNew + '-' + k.substring(oldClass.length + 1);
                                tenantData.timetable[newKey] = tenantData.timetable[k];
                                delete tenantData.timetable[k];
                            }
                        }
                    });
                }

                // 12. feeActivityLog (className: "oldClass-A" -> "newClass-A")
                if (tenantData.feeActivityLog) {
                    tenantData.feeActivityLog.forEach(function(log) {
                        if (log.className) {
                            if (log.className === oldClass) {
                                log.className = cleanNew;
                            } else if (log.className.startsWith(oldClass + '-')) {
                                log.className = cleanNew + '-' + log.className.substring(oldClass.length + 1);
                            }
                        }
                    });
                }

                // Persist migrated tenantData to Firestore
                await setDoc(tenantRef, tenantData);

                // Update school metadata in schools/{schoolId}
                if (school) {
                    if (!school.settings) school.settings = {};
                    school.settings.classes = tenantData.settings.classes;
                    school.settings.sections = tenantData.settings.sections;
                    school.settings.feeStructure = tenantData.settings.feeStructure;
                    await setDoc(doc(db, 'schools', schoolId), school);
                }

                // Persist recovery trash and audit log
                if (!data.audit_logs) data.audit_logs = [];
                data.audit_logs.unshift({
                    school_id: schoolId,
                    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
                    actor: currentUserEmail,
                    action: "Renamed class '" + oldClass + "' → '" + cleanNew + "' (" + migratedStudents + " students migrated)",
                    type: 'update'
                });
                saveData(data);
                await setDoc(doc(db, 'sa_data', 'recovery_trash'), { trash: data.recovery_trash });
                await setDoc(doc(db, 'sa_data', 'audit_logs'), { logs: data.audit_logs });

                currentEditingTenantData = tenantData;
                showToast("Class '" + oldClass + "' renamed to '" + cleanNew + "'! " + migratedStudents + " student records updated.", "success");

            } catch (err) {
                console.error("Failed to cascade class rename:", err);
                showToast("Failed to rename class in cloud storage: " + err.message, "error");
                return;
            }
        }

        // Update modal in-memory state
        var idx = formClasses.indexOf(oldClass);
        if (idx !== -1) formClasses[idx] = cleanNew;
        if (formSections[oldClass]) {
            formSections[cleanNew] = formSections[oldClass];
            delete formSections[oldClass];
        }
        if (formFeeStructure[oldClass]) {
            formFeeStructure[cleanNew] = formFeeStructure[oldClass];
            delete formFeeStructure[oldClass];
        }

        renderClassesSection();
        renderFeesSection();
    }

    function renderClassesSection() {
        var container = document.getElementById('sf-classes-container');
        if (!container) return;
        
        var html = '';
        formClasses.forEach(function(c, i) {
            var sections = formSections[c] || [];
            var id = 'class-row-' + c.replace(/\s+/g, '_');
            
            html += '<div class="class-structure-row" id="' + id + '" style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; gap:8px; margin-bottom:8px;">';
            
            // Left: Class name display & inline rename container
            html += '  <div class="class-name-container" data-class="' + escapeAttr(c) + '" style="min-width:145px; display:flex; align-items:center; gap:6px; flex-shrink:0;">';
            html += '    <span class="class-name-text" style="font-weight:700; font-size:13px; color:#fff;">' + escapeHTML(c) + '</span>';
            html += '  </div>';

            // Middle: Section tags
            html += '  <div class="section-tags-container" style="display:flex; flex-wrap:wrap; gap:6px; flex-grow:1;">';
            sections.forEach(function(sec) {
                html += '    <span class="section-tag" style="display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; background:rgba(37,99,235,0.15); color:#60a5fa; font-size:11px; font-weight:700; border: 1px solid rgba(37, 99, 235, 0.25);">' + escapeHTML(sec);
                html += '      <span class="remove-section-btn" data-class="' + escapeAttr(c) + '" data-section="' + escapeAttr(sec) + '" style="cursor:pointer; font-size:12px; color:rgba(255,255,255,0.5); font-weight:bold; margin-left:4px;">&times;</span>';
                html += '    </span>';
            });
            html += '  </div>';

            // Right: Action controls (Move Up, Move Down, Edit, + Sec, Delete)
            html += '  <div class="class-actions-bar" style="display:flex; gap:4px; align-items:center; flex-shrink:0;">';
            html += '    <button type="button" class="sa-btn sa-btn-secondary sa-btn-xs move-up-class-btn" data-index="' + i + '" title="Move Up"' + (i === 0 ? ' disabled style="opacity:0.3; cursor:not-allowed;"' : '') + '><span class="material-icons-round" style="font-size:14px;">arrow_upward</span></button>';
            html += '    <button type="button" class="sa-btn sa-btn-secondary sa-btn-xs move-down-class-btn" data-index="' + i + '" title="Move Down"' + (i === formClasses.length - 1 ? ' disabled style="opacity:0.3; cursor:not-allowed;"' : '') + '><span class="material-icons-round" style="font-size:14px;">arrow_downward</span></button>';
            html += '    <button type="button" class="sa-btn sa-btn-secondary sa-btn-xs edit-class-btn" data-class="' + escapeAttr(c) + '" title="Rename Class"><span class="material-icons-round" style="font-size:13px; margin-right:2px;">edit</span>Edit</button>';
            html += '    <button type="button" class="sa-btn sa-btn-secondary sa-btn-xs add-section-btn" data-class="' + escapeAttr(c) + '">+ Sec</button>';
            html += '    <button type="button" class="sa-btn sa-btn-danger sa-btn-xs delete-class-btn" data-class="' + escapeAttr(c) + '" title="Delete Class"><span class="material-icons-round" style="font-size:14px;">delete</span></button>';
            html += '  </div>';
            html += '</div>';
        });
        
        if (formClasses.length === 0) {
            html = '<div style="text-align:center; padding:12px; color:rgba(255,255,255,0.4); font-size:12px;">No classes added yet. Use Add Class or Quick Fill.</div>';
        }
        
        container.innerHTML = html;
        attachClassesSectionEvents();
    }

    function attachClassesSectionEvents() {
        var container = document.getElementById('sf-classes-container');
        if (!container) return;

        // 1. Move Up
        container.querySelectorAll('.move-up-class-btn').forEach(function(el) {
            el.addEventListener('click', function() {
                var idx = parseInt(this.getAttribute('data-index'), 10);
                if (idx > 0) {
                    var temp = formClasses[idx - 1];
                    formClasses[idx - 1] = formClasses[idx];
                    formClasses[idx] = temp;
                    renderClassesSection();
                    renderFeesSection();
                }
            });
        });

        // 2. Move Down
        container.querySelectorAll('.move-down-class-btn').forEach(function(el) {
            el.addEventListener('click', function() {
                var idx = parseInt(this.getAttribute('data-index'), 10);
                if (idx < formClasses.length - 1) {
                    var temp = formClasses[idx + 1];
                    formClasses[idx + 1] = formClasses[idx];
                    formClasses[idx] = temp;
                    renderClassesSection();
                    renderFeesSection();
                }
            });
        });

        // 3. Edit / Rename (Inline input)
        container.querySelectorAll('.edit-class-btn').forEach(function(el) {
            el.addEventListener('click', function() {
                var oldC = this.getAttribute('data-class');
                var nameContainer = container.querySelector('.class-name-container[data-class="' + oldC.replace(/"/g, '\\"') + '"]');
                if (!nameContainer) return;

                nameContainer.innerHTML = 
                    '<input type="text" class="sa-form-input sa-class-rename-input" value="' + escapeAttr(oldC) + '" data-old="' + escapeAttr(oldC) + '" style="width:100px; padding:3px 6px; font-size:12px; font-weight:700; height:28px; background:rgba(255,255,255,0.1); border:1px solid #60a5fa; color:#fff; border-radius:4px; outline:none;">' +
                    '<button type="button" class="sa-btn sa-btn-primary sa-btn-xs sa-class-save-rename-btn" data-old="' + escapeAttr(oldC) + '" title="Save Name" style="padding:2px 5px;"><span class="material-icons-round" style="font-size:13px;">check</span></button>' +
                    '<button type="button" class="sa-btn sa-btn-secondary sa-btn-xs sa-class-cancel-rename-btn" data-old="' + escapeAttr(oldC) + '" title="Cancel" style="padding:2px 5px;"><span class="material-icons-round" style="font-size:13px;">close</span></button>';

                var input = nameContainer.querySelector('.sa-class-rename-input');
                if (input) {
                    input.focus();
                    input.select();

                    input.addEventListener('keydown', async function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            var newC = input.value.trim();
                            if (newC && newC !== oldC) {
                                await executeSuperAdminClassRename(oldC, newC);
                            } else {
                                renderClassesSection();
                            }
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            renderClassesSection();
                        }
                    });
                }

                var saveBtn = nameContainer.querySelector('.sa-class-save-rename-btn');
                if (saveBtn) {
                    saveBtn.addEventListener('click', async function() {
                        var newC = input ? input.value.trim() : '';
                        if (newC && newC !== oldC) {
                            await executeSuperAdminClassRename(oldC, newC);
                        } else {
                            renderClassesSection();
                        }
                    });
                }

                var cancelBtn = nameContainer.querySelector('.sa-class-cancel-rename-btn');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', function() {
                        renderClassesSection();
                    });
                }
            });
        });

        // 4. Remove Section tag
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

        // 5. Add Section button
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

        // 6. Delete Class with ENROLLED STUDENT SAFEGUARD (Hard block)
        container.querySelectorAll('.delete-class-btn').forEach(function(el) {
            el.addEventListener('click', function(e) {
                var cName = this.getAttribute('data-class');

                // Safeguard: Check if students are enrolled in this class
                if (currentEditingTenantData && currentEditingTenantData.students) {
                    var enrolled = currentEditingTenantData.students.filter(function(s) {
                        return String(s.class || '').trim().toLowerCase() === String(cName).trim().toLowerCase();
                    });
                    if (enrolled.length > 0) {
                        alert("Cannot delete class '" + cName + "': " + enrolled.length + " student(s) currently enrolled in this class.\n\nTo prevent ghost students, you must either reassign these students first or use the Edit button to rename the class.");
                        showToast("Cannot delete: " + enrolled.length + " students enrolled in class " + cName, "error");
                        return;
                    }
                }

                formClasses = formClasses.filter(function(c) { return c !== cName; });
                delete formSections[cName];
                delete formFeeStructure[cName];
                renderClassesSection();
                renderFeesSection();
                showToast("Class '" + cName + "' removed.", "info");
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
        currentEditingSchoolId = schoolId || null;
        currentEditingTenantData = null;

        // Reset states
        formClasses = [];
        formSections = {};
        formFeeStructure = {};
        formFeeHeads = ["tuition", "transport", "exam"];
        formExtraCharges = [];
        currentAdminPasswordHash = '';

        // Reset all feature checkboxes - default to ALL CHECKED (New Business Rule: All features ON by default)
        var checkboxes = document.querySelectorAll('#sf-features-grid input[type="checkbox"]');
        checkboxes.forEach(function (cb) { cb.checked = true; });

        document.getElementById('sf-admin-password').placeholder = '••••••••';
        document.getElementById('sf-admin-password').required = true;

        var requestId = ++currentEditRequestId;

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

            // Check matching feature toggles if school already has explicit allowed_features
            var features = school.allowed_features;
            if (Array.isArray(features) && features.length > 0) {
                checkboxes.forEach(function (cb) {
                    if (cb.value === 'admin') {
                        cb.checked = true;
                    } else if (cb.value === 'teacher-attendance') {
                        cb.checked = features.indexOf('teachers') !== -1;
                    } else {
                        cb.checked = features.indexOf(cb.value) !== -1;
                    }
                });
            }

            // Show modal IMMEDIATELY so user never waits on blank screen
            modalOverlay.classList.add('active');

            // Show loading placeholder in classes section
            var classesContainer = document.getElementById('sf-classes-container');
            if (classesContainer) {
                classesContainer.innerHTML = '<div style="text-align:center; padding:16px; color:#60a5fa; font-size:13px; font-weight:600;"><span class="material-icons-round" style="animation:spin 1s linear infinite; vertical-align:middle; margin-right:6px;">sync</span> Fetching settings from cloud...</div>';
            }

            // Fetch settings configuration from tenant_data asynchronously
            (async function() {
                var isTimedOut = false;
                var timeoutTimer = setTimeout(function() {
                    isTimedOut = true;
                    if (requestId !== currentEditRequestId) return;
                    if (classesContainer) {
                        classesContainer.innerHTML = '<div style="background:rgba(234,179,8,0.1); border:1px solid rgba(234,179,8,0.3); padding:12px; border-radius:8px; margin-bottom:12px;">' +
                            '<div style="font-weight:700; color:#facc15; font-size:13px; margin-bottom:4px;">⚠️ Taking longer than expected</div>' +
                            '<p style="margin:0 0 8px 0; font-size:12px; color:rgba(255,255,255,0.7);">Cloud storage did not respond within 8 seconds.</p>' +
                            '<button type="button" class="sa-btn sa-btn-secondary sa-btn-xs" id="btn-retry-edit-fetch">🔄 Retry Fetching Settings</button>' +
                            '</div>';
                        var retryBtn = document.getElementById('btn-retry-edit-fetch');
                        if (retryBtn) {
                            retryBtn.addEventListener('click', function() { showSchoolModal(schoolId); });
                        }
                    }
                }, 8000);

                try {
                    const tenantSnap = await getDoc(doc(db, 'tenant_data', schoolId));
                    clearTimeout(timeoutTimer);
                    if (isTimedOut || requestId !== currentEditRequestId) return;

                    if (tenantSnap.exists()) {
                        var tenantData = tenantSnap.data();
                        currentEditingTenantData = tenantData;
                        var s = tenantData.settings || {};
                        
                        document.getElementById('sf-affiliation').value = (s.schoolInfo && s.schoolInfo.affiliation) || '';
                        document.getElementById('sf-udise-code').value = (s.schoolInfo && s.schoolInfo.udiseCode) || '';
                        document.getElementById('sf-admin-username').value = s.adminUsername || '';
                        document.getElementById('sf-admin-password').value = '********'; // masked
                        document.getElementById('sf-admin-password').required = false;
                        document.getElementById('sf-admin-email').value = s.adminEmail || '';
                        
                        currentAdminPasswordHash = s.adminPassword || '';
                        
                        formClasses = s.classes || [];
                        formSections = s.sections || {};
                        // FIX: most live schools still store settings.sections as ONE
                        // flat array shared by every class (e.g. ['A','B','C']) — the
                        // Class Structure editor below (renderClassesSection) assumes a
                        // per-class map ({ class: [...] }) and never handled the flat
                        // array, so opening this modal for such a school crashed with
                        // "sections.forEach is not a function" (e.g. for a class named
                        // "1", formSections["1"] resolved to the array's index-1 element
                        // — a single letter string — and .forEach() on a string throws).
                        // Converting once here gives every existing class the exact same
                        // sections it already had; nothing changes for the school unless
                        // this modal is actually saved.
                        if (Array.isArray(formSections)) {
                            var sharedSections = formSections;
                            formSections = {};
                            formClasses.forEach(function(c) { formSections[c] = sharedSections.slice(); });
                        }
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

                        renderClassesSection();
                        renderFeesSection();
                        renderExtraChargesSection();

                    } else {
                        // School has no tenant_data (e.g. Dugda School)
                        document.getElementById('sf-admin-username').value = 'admin';
                        document.getElementById('sf-admin-password').value = '';
                        document.getElementById('sf-admin-email').value = school.email || '';

                        formClasses = [];
                        formSections = {};
                        formFeeStructure = {};
                        formExtraCharges = [];
                        renderExtraChargesSection();
                        renderFeesSection();

                        if (classesContainer) {
                            classesContainer.innerHTML = '<div style="background:rgba(234,179,8,0.1); border:1px solid rgba(234,179,8,0.3); padding:16px; border-radius:8px; margin-bottom:12px;">' +
                                '<div style="font-weight:700; color:#facc15; font-size:14px; margin-bottom:4px;">⚠️ Missing Cloud Configuration</div>' +
                                '<p style="margin:0 0 12px 0; color:rgba(255,255,255,0.8); font-size:13px;">This school has no ERP tenant settings configured in Firestore yet.</p>' +
                                '<button type="button" class="sa-btn sa-btn-primary sa-btn-sm" id="btn-init-default-settings" style="display:inline-flex; align-items:center; gap:6px;">' +
                                '<span class="material-icons-round" style="font-size:16px;">auto_fix_high</span> Initialize Default Settings</button>' +
                                '</div>';

                            var initBtn = document.getElementById('btn-init-default-settings');
                            if (initBtn) {
                                initBtn.addEventListener('click', function() {
                                    formClasses = ["Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
                                    formSections = {};
                                    formFeeStructure = {};
                                    formClasses.forEach(function(c) {
                                        formSections[c] = ["A"];
                                        formFeeStructure[c] = { tuition: 500, transport: 0, exam: 100 };
                                    });
                                    formFeeHeads = ["tuition", "transport", "exam"];
                                    renderClassesSection();
                                    renderFeesSection();
                                    showToast('Default settings initialized! Review and save.', 'info');
                                });
                            }
                        }
                    }
                } catch(e) {
                    clearTimeout(timeoutTimer);
                    if (requestId !== currentEditRequestId) return;
                    console.error('Failed to load school settings from tenant_data:', e);
                    if (classesContainer) {
                        classesContainer.innerHTML = '<div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:12px; border-radius:8px;">' +
                            '<div style="font-weight:700; color:#f87171; font-size:13px; margin-bottom:4px;">Failed to load cloud settings</div>' +
                            '<p style="margin:0 0 8px 0; font-size:12px; color:rgba(255,255,255,0.7);">' + escapeHTML(e.message || 'Cloud Firestore error') + '</p>' +
                            '<button type="button" class="sa-btn sa-btn-secondary sa-btn-xs" id="btn-retry-edit-error">🔄 Retry Loading Settings</button>' +
                            '</div>';
                        var retryBtn = document.getElementById('btn-retry-edit-error');
                        if (retryBtn) {
                            retryBtn.addEventListener('click', function() { showSchoolModal(schoolId); });
                        }
                    }
                }
            })();

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

            renderClassesSection();
            renderFeesSection();
            renderExtraChargesSection();

            modalOverlay.classList.add('active');
        }

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

        var classes = formClasses;
        if (!classes || classes.length === 0) {
            showError('Please configure at least one class before creating this school. Classes cannot be empty.');
            return; // block creation
        }

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
                // Also write the FLAT fields — the School Admin Settings page
                // (admin.js) reads/writes settings.schoolName / .phone / etc
                // directly, not settings.schoolInfo.*. Without these, a newly
                // onboarded school's Settings form shows blank until the admin
                // manually retypes everything already entered here.
                schoolName: name,
                tagline: tagline,
                phone: phone,
                email: email,
                address: address,
                affiliation: affiliation,
                udiseCode: udiseCode,
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
                    // Was hardcoded to a fixed past month ('2026-04'), which made the
                    // auto-fee engine think months had been missed and immediately
                    // generate backdated dues the first time this fallback ever ran.
                    // Use the real current month instead.
                    lastAutomatedFeeRun: (function() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })(),
                    notifications: [],
                    currentSchoolId: schoolId
                };

                // Merge settings
                tenantData.settings = {
                    schoolInfo: { name: name, tagline: tagline, logoUrl: logoUrl, phone: phone, email: email, address: address, affiliation: affiliation, udiseCode: udiseCode },
                // Also write the FLAT fields — the School Admin Settings page
                // (admin.js) reads/writes settings.schoolName / .phone / etc
                // directly, not settings.schoolInfo.*. Without these, a newly
                // onboarded school's Settings form shows blank until the admin
                // manually retypes everything already entered here.
                schoolName: name,
                tagline: tagline,
                phone: phone,
                email: email,
                address: address,
                affiliation: affiliation,
                udiseCode: udiseCode,
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
                // Also write the FLAT fields — the School Admin Settings page
                // (admin.js) reads/writes settings.schoolName / .phone / etc
                // directly, not settings.schoolInfo.*. Without these, a newly
                // onboarded school's Settings form shows blank until the admin
                // manually retypes everything already entered here.
                schoolName: name,
                tagline: tagline,
                phone: phone,
                email: email,
                address: address,
                affiliation: affiliation,
                udiseCode: udiseCode,
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
                // Also write the FLAT fields — the School Admin Settings page
                // (admin.js) reads/writes settings.schoolName / .phone / etc
                // directly, not settings.schoolInfo.*. Without these, a newly
                // onboarded school's Settings form shows blank until the admin
                // manually retypes everything already entered here.
                schoolName: name,
                tagline: tagline,
                phone: phone,
                email: email,
                address: address,
                affiliation: affiliation,
                udiseCode: udiseCode,
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

        if (school.archived) {
            showToast('Cannot impersonate an archived school. Restore it first.', 'error');
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

    function showError(msg) {
        showToast(msg, 'error');
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

                // Auto close mobile drawer on tab navigation
                if (sidebar) sidebar.classList.remove('mobile-open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');

                // Load active tab data
                if (targetTab === 'recovery') {
                    renderRecoveryCenter();
                } else if (targetTab === 'tickets') {
                    renderSupportTickets();
                } else if (targetTab === 'dashboard') {
                    renderDashboard();
                } else if (targetTab === 'leads') {
                    renderLeadsTab();
                } else if (targetTab === 'archived') {
                    renderArchivedSchools();
                } else if (targetTab === 'billing') {
                    renderBillingTab();
                }
            });
        }

        // Mobile Sidebar Drawer Toggle
        var mobileToggleBtn = document.getElementById('sa-mobile-toggle');
        var sidebarOverlay = document.getElementById('sa-sidebar-overlay');
        var sidebar = document.querySelector('.sa-sidebar');

        if (mobileToggleBtn && sidebar) {
            mobileToggleBtn.addEventListener('click', function () {
                sidebar.classList.toggle('mobile-open');
                if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
            });
        }
        if (sidebarOverlay && sidebar) {
            sidebarOverlay.addEventListener('click', function () {
                sidebar.classList.remove('mobile-open');
                sidebarOverlay.classList.remove('active');
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
                    case 'archive':
                        showArchiveModal(schoolId);
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

        // Archive modal listeners
        var archiveModalOverlay = document.getElementById('sa-archive-modal-overlay');
        var archiveCloseBtn = document.getElementById('sa-archive-modal-close');
        var archiveCancelBtn = document.getElementById('sa-archive-modal-cancel');
        var archiveConfirmBtn = document.getElementById('sa-archive-modal-confirm');
        var archivedSearchInput = document.getElementById('sa-archived-search');
        var archivedTbody = document.getElementById('sa-archived-tbody');

        if (archiveCloseBtn && archiveModalOverlay) {
            archiveCloseBtn.addEventListener('click', function() {
                archiveModalOverlay.classList.remove('active');
            });
        }
        if (archiveCancelBtn && archiveModalOverlay) {
            archiveCancelBtn.addEventListener('click', function() {
                archiveModalOverlay.classList.remove('active');
            });
        }
        if (archiveConfirmBtn) {
            archiveConfirmBtn.addEventListener('click', function() {
                confirmArchiveSchool();
            });
        }
        if (archivedSearchInput) {
            archivedSearchInput.addEventListener('input', function() {
                renderArchivedSchools();
            });
        }
        if (archivedTbody) {
            archivedTbody.addEventListener('click', function(e) {
                var restoreBtn = e.target.closest('.btn-restore-school');
                if (restoreBtn) {
                    var sid = restoreBtn.getAttribute('data-school-id');
                    if (sid) restoreSchool(sid);
                }
            });
        }

        // Billing & Agreement event listeners
        var btnNewAgreement = document.getElementById('sa-btn-new-agreement');
        var agModalOverlay = document.getElementById('sa-agreement-modal-overlay');
        var agModalClose = document.getElementById('sa-ag-modal-close');
        var agModalCancel = document.getElementById('sa-ag-modal-cancel');
        var agBtnSave = document.getElementById('sa-ag-btn-save');
        var agBtnExport = document.getElementById('sa-ag-btn-export');
        var agSearchInput = document.getElementById('sa-billing-search');
        var agTbody = document.getElementById('sa-agreements-tbody');

        if (btnNewAgreement) {
            btnNewAgreement.addEventListener('click', function() {
                showAgreementModal(null);
            });
        }
        if (agModalClose && agModalOverlay) {
            agModalClose.addEventListener('click', function() {
                agModalOverlay.classList.remove('active');
            });
        }
        if (agModalCancel && agModalOverlay) {
            agModalCancel.addEventListener('click', function() {
                agModalOverlay.classList.remove('active');
            });
        }
        if (agBtnSave) {
            agBtnSave.addEventListener('click', function(e) {
                e.preventDefault();
                saveAgreement();
            });
        }
        if (agBtnExport) {
            agBtnExport.addEventListener('click', function(e) {
                e.preventDefault();
                exportAgreementPDF(null);
            });
        }
        if (agSearchInput) {
            agSearchInput.addEventListener('input', function() {
                renderBillingTab();
            });
        }

        // Pricing inputs change listener for live calculations
        ['sf-ag-base-fee', 'sf-ag-per-student-fee', 'sf-ag-student-count', 'sf-ag-discount-pct', 'sf-ag-tax-pct'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateAgreementLivePricing);
            }
        });

        // Agreements table action delegation
        if (agTbody) {
            agTbody.addEventListener('click', function(e) {
                var editBtn = e.target.closest('.btn-edit-ag');
                var printBtn = e.target.closest('.btn-print-ag');
                var deleteBtn = e.target.closest('.btn-delete-ag');

                if (editBtn) {
                    var agId = editBtn.getAttribute('data-id');
                    showAgreementModal(agId);
                } else if (printBtn) {
                    var agId = printBtn.getAttribute('data-id');
                    exportAgreementPDF(agId);
                } else if (deleteBtn) {
                    var agId = deleteBtn.getAttribute('data-id');
                    deleteAgreement(agId);
                }
            });
        }

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
