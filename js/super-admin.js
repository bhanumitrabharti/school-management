/**
 * ===================================================
 *  SUPER ADMIN PORTAL — JavaScript Controller
 *  CTRL Shift Solutions — SaaS Control Center
 * ===================================================
 */

(function () {
    'use strict';

    // ─── Constants ──────────────────────────────────────
    var STORAGE_KEY = 'shishuvikash_data';
    var SESSION_KEY = 'sa_session';
    var CREDENTIALS = { username: 'superadmin', password: 'superadmin123' };

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
            email: 'admin@shishuvikash.edu.in',
            address: '123 Education Lane, Bokaro Steel City, Jharkhand 827001',
            subdomain: 'svm-bokaro',
            plan: 'Premium',
            status: 'Active',
            storage_used: '1.2 GB',
            renewal_date: '2026-12-31',
            last_login: '2 hours ago',
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
     * Load the entire app data from localStorage.
     * Seeds schools array if it doesn't exist.
     */
    function loadData() {
        var raw = localStorage.getItem(STORAGE_KEY);
        var data;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch (e) {
            data = {};
        }
        if (!data.schools || !Array.isArray(data.schools) || data.schools.length === 0) {
            data.schools = JSON.parse(JSON.stringify(defaultSchools));
            saveData(data);
        }
        if (!data.recovery_trash || !Array.isArray(data.recovery_trash)) {
            data.recovery_trash = JSON.parse(JSON.stringify(defaultRecoveryTrash));
            saveData(data);
        }
        if (!data.support_tickets || !Array.isArray(data.support_tickets)) {
            data.support_tickets = JSON.parse(JSON.stringify(defaultSupportTickets));
            saveData(data);
        }
        if (!data.audit_logs || !Array.isArray(data.audit_logs)) {
            data.audit_logs = JSON.parse(JSON.stringify(defaultAuditLogs));
            saveData(data);
        }
        return data;
    }

    /** Persist the full data object back to localStorage. */
    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    function saLogin(username, password) {
        if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
            sessionStorage.setItem(SESSION_KEY, 'active');
            loginPage.classList.add('hidden');
            dashboard.classList.add('active');
            loginError.classList.remove('visible');
            loginForm.reset();
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
                        '<span class="sa-school-subdomain">' + escapeHTML(school.subdomain) + '.ctrlshift.app</span>' +
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
    function restoreTrashItem(itemId) {
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
    function quickReplyTicket(ticketId) {
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

    /**
     * Open the modal for add or edit.
     * @param {string|null} schoolId – null for new school, id for edit
     */
    function showSchoolModal(schoolId) {
        schoolForm.reset();
        document.getElementById('sf-school-id').value = '';

        // Reset all feature checkboxes
        var checkboxes = document.querySelectorAll('#sf-features-grid input[type="checkbox"]');
        checkboxes.forEach(function (cb) { cb.checked = false; });

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

            // Check matching feature toggles
            var features = school.allowed_features || [];
            checkboxes.forEach(function (cb) {
                cb.checked = features.indexOf(cb.value) !== -1;
            });
        } else {
            modalTitleText.textContent = 'Onboard New School';
            // Default: check first 4 features
            var defaults = ['students', 'teachers', 'attendance', 'fees'];
            checkboxes.forEach(function (cb) {
                cb.checked = defaults.indexOf(cb.value) !== -1;
            });
        }

        modalOverlay.classList.add('active');
        setTimeout(function () {
            document.getElementById('sf-name').focus();
        }, 150);
    }

    /** Save (create or update) school from modal form. */
    function saveSchool() {
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

        var data = loadData();
        var schoolId = document.getElementById('sf-school-id').value;
        var isEdit = !!schoolId;

        // Gather selected features
        var selectedFeatures = ['dashboard']; // always include dashboard
        var checkboxes = document.querySelectorAll('#sf-features-grid input[type="checkbox"]');
        checkboxes.forEach(function (cb) {
            if (cb.checked) selectedFeatures.push(cb.value);
        });
        selectedFeatures.push('help'); // always include help

        // Deduplicate
        selectedFeatures = selectedFeatures.filter(function (v, i, a) { return a.indexOf(v) === i; });

        if (isEdit) {
            // Update existing school
            var idx = -1;
            for (var i = 0; i < data.schools.length; i++) {
                if (data.schools[i].school_id === schoolId) { idx = i; break; }
            }
            if (idx === -1) { showToast('School not found for update.', 'error'); return; }

            data.schools[idx].school_name       = name;
            data.schools[idx].tagline            = document.getElementById('sf-tagline').value.trim();
            data.schools[idx].phone              = document.getElementById('sf-phone').value.trim();
            data.schools[idx].email              = email;
            data.schools[idx].address            = document.getElementById('sf-address').value.trim();
            data.schools[idx].subdomain          = subdomain;
            data.schools[idx].plan               = document.getElementById('sf-plan').value;
            data.schools[idx].status             = document.getElementById('sf-status').value;
            data.schools[idx].renewal_date       = document.getElementById('sf-renewal').value || '';
            data.schools[idx].allowed_features   = selectedFeatures;

            saveData(data);
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

            // Create new school
            var newSchool = {
                school_id:        generateSchoolId(subdomain),
                school_name:      name,
                tagline:          document.getElementById('sf-tagline').value.trim(),
                phone:            document.getElementById('sf-phone').value.trim(),
                email:            email,
                address:          document.getElementById('sf-address').value.trim(),
                subdomain:        subdomain,
                plan:             document.getElementById('sf-plan').value,
                status:           document.getElementById('sf-status').value,
                storage_used:     '0 MB',
                renewal_date:     document.getElementById('sf-renewal').value || '',
                last_login:       'Never',
                allowed_features: selectedFeatures
            };

            data.schools.push(newSchool);
            saveData(data);
            closeModal();
            renderDashboard();
            showToast('School "' + name + '" onboarded successfully!', 'success');
        }
    }


    // ─── Tenant Actions ─────────────────────────────────

    /** Toggle a school's status between Active and Paused. */
    function toggleSchoolStatus(schoolId) {
        var data = loadData();
        var school = findSchoolById(data.schools, schoolId);
        if (!school) { showToast('School not found.', 'error'); return; }

        var oldStatus = school.status;
        school.status = (oldStatus === 'Active') ? 'Paused' : 'Active';

        saveData(data);
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
            renderDashboard();
        }

        // Login form submit
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            saLogin(usernameInput.value.trim(), passwordInput.value);
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
            }
        });

        // Modal save
        modalSave.addEventListener('click', function () {
            saveSchool();
        });

        // Delegated events on the schools table
        schoolsTbody.addEventListener('click', function (e) {
            var target = e.target;

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

    }); // END DOMContentLoaded

})();
