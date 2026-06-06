'use strict';

/* ============================================================
   HELP CENTER SYNC PROTOCOL (CRITICAL)
   ----------------------------------
   Going forward, whenever the AI coding assistant (Antigravity)
   adds a new feature, updates an existing module, or optimizes
   any ERP workflow, this file (js/help.js) must be updated
   automatically to modify or add user-facing guide documentation
   covering the new functionality.
   ============================================================ */

(function() {
  var state = {
    searchQuery: '',
    selectedCategory: null
  };

  var articles = {
    timetable: [
      {
        title: "How to use the Interactive Timetable Grid & Views",
        description: "The Timetable Management module offers a real-time scheduling dashboard with dual perspectives: a Class-specific grid and an interactive Teacher-centric schedule matrix.",
        steps: [
          "Click on the **Timetable** module from the left menu panel.",
          "Use the **Class View** / **Teacher View** toggle buttons in the toolbar to swap layouts.",
          "In **Class View**, select a Class, Section, and Day to inspect periods and schedule slots.",
          "In **Teacher View**, empty periods for any teacher are highlighted with a green dashed **[+ Assign]** button.",
          "Click the **[+ Assign]** button to launch the interactive scheduling modal.",
          "Select the target class-section and subject for that teacher, then click **Save Assignment**.",
          "Any unsaved modifications or newly added draft slots will display with a **dashed yellow border** representing their active local draft state."
        ]
      },
      {
        title: "How to Configure Smart Timing Settings",
        description: "Instead of manually calculating period durations, input the school hours and total periods to let the timing engine automatically configure slot lengths.",
        steps: [
          "Click the blue **Timing Settings** gear button in the Timetable toolbar.",
          "Input the **School Start Time**, **School End Time**, and the **Total Periods** count separately for Weekdays and Saturdays.",
          "Configure the **Lunch Break Offset** (after which period lunch starts) and **Lunch Duration** in minutes.",
          "Click **Save Settings**. The timing engine automatically calculates matching period durations.",
          "Note: Any remaining minutes after division are automatically distributed to the last period so the day ends exactly at your specified School End Time."
        ]
      },
      {
        title: "How to Auto-Generate School Timetable Drafts",
        description: "Generate a conflict-free draft for the entire school using a two-pass scheduling algorithm that respects teacher availability and subject limits.",
        steps: [
          "Click the purple **Auto-Generate Draft** lightning button in the Timetable toolbar.",
          "Confirm the action in the prompt. This clears existing unsaved timetable drafts.",
          "The system will execute a **Two-Pass Algorithm** globally for all class sections:",
          "- **Pass 1 (Strict Uniqueness)**: Assigns subjects that have not yet been taught today.",
          "- **Pass 2 (Smart Fallback)**: If unique subjects are exhausted, allows repetitions as long as they are non-consecutive.",
          "The algorithm automatically checks teacher conflicts globally to prevent double-bookings, leaving irresolvable slots blank for manual review."
        ]
      },
      {
        title: "How to Reset or Clear Schedules",
        description: "Clean up draft and committed schedules at the class level or across the entire school.",
        steps: [
          "Locate and click the red **Reset Timetable** trash icon button in the Timetable toolbar.",
          "Wipe behavior changes dynamically depending on your active view mode:",
          "- **Class View**: Prompts to wipe the entire week's schedule for the selected class section.",
          "- **Teacher View**: Shows a high-warning prompt to completely clear schedules for the **ENTIRE SCHOOL**.",
          "Confirm the dialog to execute the clear operation. Resetting always preserves timing configurations."
        ]
      }
    ],
    students: [
      {
        title: "How to Admit a New Student",
        description: "Add individual student profiles to the school database with their parent contact details.",
        steps: [
          "Click on the **Students** button on the left sidebar menu.",
          "Click the green **+ Add Student** button at the top of the roster view.",
          "Fill out the student's details: **Name**, **Class**, **Section**, **Roll No.**, and **Parent Phone**.",
          "Click **Save Student** to submit. The student is immediately registered in the active database."
        ]
      },
      {
        title: "How to Edit and Manage Student Profiles",
        description: "Update details or delete student records from the roster as needed.",
        steps: [
          "Navigate to the **Students** roster list and locate the student using the search input.",
          "Click the blue edit icon (**edit** symbol) in that student's row.",
          "Modify the student's details in the modal form and click **Save Student**.",
          "To delete a student, click the red trash icon (**delete** symbol). The student record is safely sent to the Recycle Bin."
        ]
      },
      {
        title: "How to Import Students in Bulk",
        description: "Save time by uploading a spreadsheet file to admit entire class sections at once.",
        steps: [
          "Go to the **Students** page.",
          "Click the **Import Excel** button at the top of the toolbar.",
          "Select your `.xlsx`, `.xls`, or `.csv` spreadsheet file from your local computer.",
          "The import engine maps the columns (Name, Class, Section, Roll No, Parent Phone) and creates student profiles automatically."
        ]
      },
      {
        title: "How to Export the Student Roster",
        description: "Export filtered student records into an Excel spreadsheet file for records or printing.",
        steps: [
          "Go to the **Students** page.",
          "Use the Class and Section dropdown filters to narrow down the student list, or leave them blank for the full list.",
          "Click the **Export Excel** button to download the spreadsheet file to your device."
        ]
      }
    ],
    teachers: [
      {
        title: "How to Add and Manage Teacher Accounts",
        description: "Create user credentials and manage active statuses for teachers in the system.",
        steps: [
          "Navigate to the **Admin Panel** from the sidebar menu.",
          "Select the **User Management** tab at the top of the admin page.",
          "Scroll to the teacher list, click **Add Teacher**, fill in their details (Name, Email, password) and select their default qualifying subjects.",
          "Save the account. You can reset teacher passwords or toggle their Active status from this same list."
        ]
      },
      {
        title: "How to Assign Classes, Mapped Subjects, and Designated Class Teachers",
        description: "Configure subject assignments for teachers and enforce the single Class Teacher business rule.",
        steps: [
          "Open the **User Management** tab in the Admin Panel.",
          "Click the blue edit icon (**edit** symbol) on a teacher's row.",
          "In the Class Assignment grid, tick the class-section checkboxes representing their assignments.",
          "Under the class checkmarks, map specific subjects for each section.",
          "Toggle if they are the **Class Teacher** for that section.",
          "Note: Only one teacher can be designated as the Class Teacher for a class section. The system will block saving and show a warning toast if a duplicate assignment is attempted."
        ]
      }
    ],
    fees: [
      {
        title: "How to Record Fee Payments",
        description: "Track student outstanding dues, record incoming payments, and keep student ledgers up to date.",
        steps: [
          "Go to the **Fees** module from the left menu.",
          "Find the target student and click the green pay icon (**payments** symbol) in their row.",
          "Verify the outstanding balance, select the **Payment Mode** (Cash, UPI, or Bank Transfer), enter the amount paid, and click **Record Payment**."
        ]
      },
      {
        title: "How to Send WhatsApp Bilingual Fee Receipts",
        description: "Send professional English-Hindi transaction invoices directly to parent contact numbers.",
        steps: [
          "When recording a fee payment, confirm the pop-up prompt to send a WhatsApp receipt.",
          "Alternatively, click the green WhatsApp icon next to any receipt transaction inside the student's digital ledger modal.",
          "The system will encode a bilingual English-Hindi receipt message with payment details and redirect to WhatsApp Web or application with parent phone prefilled."
        ]
      },
      {
        title: "How to Bulk Charge Classes & Auto-Reconcile Dues",
        description: "Apply fee heads across entire classes and let the background billing scheduler manage recurring charges.",
        steps: [
          "To charge a cohort, click **Bulk Charge Class** at the top of the Fees page, select the target class, choose the fee head, and apply.",
          "The **Auto-Fee Catch-Up Engine** automatically runs in the background. If the system month advances, it auto-charges standard class tuition rates to student ledgers and displays a toast on admin login."
        ]
      }
    ],
    attendance: [
      {
        title: "How to Mark Daily Student Attendance",
        description: "Record daily student rosters and mark presents, absents, or lates.",
        steps: [
          "Click on the **Attendance** link in the left menu.",
          "Select the Class, Section, and Date, then click **Mark Attendance** to load the student cards.",
          "Choose the status button for each student (Present: **P**, Absent: **A**, Late: **L**).",
          "Quick controls like **Mark All Present** or **Mark All Absent** can be used to set all statuses at once.",
          "Click **Submit Attendance** at the bottom to commit the register."
        ]
      },
      {
        title: "How to Check Attendance History Logs",
        description: "Retrieve historical registers and print daily lists.",
        steps: [
          "Go to the **Attendance** page and select the **History** tab at the top.",
          "Set the date filters (**From Date**, **To Date**), and select the Class/Section to load the records list.",
          "Click the blue view icon (**visibility** symbol) on any row to open the detailed student attendance register."
        ]
      },
      {
        title: "How to Use Teacher Punch GPS Geofencing",
        description: "Enforce location checks to verify teachers are on campus during punch in/out actions.",
        steps: [
          "Teachers can punch in/out on their dashboard using browser GPS location checks.",
          "Checks verify the teacher is within **200 meters** of school coordinates before recording.",
          "If check-ins are missed or GPS coordinate fetching fails, teachers can submit a Correction Request with reasons.",
          "Admins can review, approve, or reject correction logs under the User Management or logs tab."
        ]
      }
    ],
    exams: [
      {
        title: "How to Configure Exam Terms and Mapped Class Subjects",
        description: "Configure academic terms, passing marks, and subject limits.",
        steps: [
          "Open **Admin Panel** -> **Examinations** tab.",
          "Click **Add Exam Term** to create an academic term (e.g., Annual Exams).",
          "Select a Class, click **Add Subject Mapping**, type the subject name, set the Max and Passing Marks, and click **Save Mapping**."
        ]
      },
      {
        title: "How to Enter Student Exam Marks",
        description: "Record marks for student test scores and automatically recalculate statistics.",
        steps: [
          "Go to the **Exams** tab from the left sidebar.",
          "Select the Exam Term, Class, and Section, then input marks for subjects.",
          "Click **Save Marks**. Note: Inputting scores recalculates totals, percentages, results status, and grades dynamically."
        ]
      },
      {
        title: "How to Generate and Print A4 Report Cards",
        description: "Generate report card layouts with school logos, passing criteria, and rankings.",
        steps: [
          "Open the **Exams** page and load the marks matrix for a class.",
          "Click the green **Report Card** button next to a student's row.",
          "Verify the official school branding, grading legend, trophy rank badge, and structured signature boxes in the popup, then click **Print**.",
          "Use the **Consolidated View** button to view side-by-side term comparisons and print combined marks sheets."
        ]
      }
    ]
  };

  function render() {
    var container = document.getElementById('page-help');
    if (!container) return;

    var html = '';

    // Hero Search Section
    html += '<div class="support-hero" style="text-align: center; margin-bottom: 30px;">';
    html += '  <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary);">Documentation & Support</h1>';
    html += '  <p style="color: var(--text-secondary); margin-bottom: 20px;">Search our self-help guides to understand timetable settings, scheduling rules, and ERP modules.</p>';
    html += '  <div class="support-search-bar" style="max-width: 600px; margin: 0 auto; position: relative;">';
    html += '    <input type="text" id="help-search-input" placeholder="Search documentation (e.g. timetable, auto-generate, reset)..." value="' + state.searchQuery + '" style="width:100%; padding: 12px 16px 12px 40px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 8px; color: var(--text-primary);">';
    html += '    <span class="material-icons-round" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted);">search</span>';
    html += '  </div>';
    html += '</div>';

    if (state.searchQuery) {
      html += renderSearchResults();
    } else if (state.selectedCategory) {
      html += renderCategoryDetail();
    } else {
      html += renderCategoryGrid();
    }

    // Append visually distinct Contact Technical Support Section at the bottom of the page
    html += renderContactSupportSection();

    container.innerHTML = html;
    attachEvents();
  }

  function renderCategoryGrid() {
    var html = '';
    html += '<div class="support-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">';

    html += '  <div class="support-card" data-category="timetable" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📅</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Timetable & Grid Scheduling</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Configure school start/end times, auto-generate school drafts, and reset timetable schedules.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="students" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">🎓</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Student Roster CRUD</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Admit student profiles, import Excel spreadsheets in bulk, and execute bulk exports.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="teachers" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">🏫</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Teachers & Assignments</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Set Class Teachers, map subject credentials, and assign teacher classrooms.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="fees" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">💰</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Fees & Ledgers</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Record dues, trace student ledger balances, and dispatch Hindi-English receipts on WhatsApp.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="attendance" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📅</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Attendance & GPS Geofence</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Mark daily student rosters, monitor geo-fenced teacher punch registers, and correct missed logs.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="exams" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📝</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Exams & Report Cards</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Record term marks, calculate passing grades, print marksheets, and view consolidated matrices.</p>';
    html += '  </div>';

    html += '</div>';
    return html;
  }

  function renderCategoryDetail() {
    var cat = state.selectedCategory;
    var list = articles[cat] || [];
    var catNames = {
      timetable: '📅 Timetable & Grid Scheduling Help',
      students: '🎓 Student Management Help',
      teachers: '🏫 Teachers & Staff Help',
      fees: '💰 Fees, Ledgers & WhatsApp Billing Help',
      attendance: '📅 Attendance registers & GPS Geofence Help',
      exams: '📝 Exams & A4 Report Cards Help'
    };

    var html = '';
    html += '<div class="support-detail-header" style="display:flex; align-items:center; gap:16px; margin-bottom: 20px;">';
    html += '  <button class="btn btn-secondary btn-sm" id="help-back-btn" style="display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">arrow_back</span> Back</button>';
    html += '  <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: var(--text-primary);">' + catNames[cat] + '</h2>';
    html += '</div>';

    html += '<div class="support-accordion-list" style="display:flex; flex-direction:column; gap:12px;">';
    list.forEach(function(art, index) {
      html += renderAccordionItem(art, cat + '-' + index);
    });
    html += '</div>';

    return html;
  }

  function renderSearchResults() {
    var query = state.searchQuery.toLowerCase().trim();
    var found = [];

    Object.keys(articles).forEach(function(cat) {
      articles[cat].forEach(function(art, index) {
        if (art.title.toLowerCase().indexOf(query) !== -1 || 
            (art.description && art.description.toLowerCase().indexOf(query) !== -1) ||
            art.steps.some(function(s) { return s.toLowerCase().indexOf(query) !== -1; })) {
          found.push({ art: art, id: cat + '-' + index });
        }
      });
    });

    var html = '';
    html += '<div class="support-detail-header" style="margin-bottom: 20px;">';
    html += '  <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">Search Results for "' + state.searchQuery + '"</h2>';
    html += '</div>';

    if (found.length > 0) {
      html += '<div class="support-accordion-list" style="display:flex; flex-direction:column; gap:12px;">';
      found.forEach(function(item) {
        html += renderAccordionItem(item.art, item.id);
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state" style="text-align:center; padding: 40px; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-light); border-radius: 8px;">';
      html += '  <span class="material-icons-round" style="font-size: 48px; color: var(--text-muted); margin-bottom: 12px; display:block;">search_off</span>';
      html += '  <h3 style="font-size:16px; margin-bottom:8px; font-weight:700;">No Guides Found</h3>';
      html += '  <p style="font-size:13px; color: var(--text-muted);">Please try alternative keywords, or switch categories.</p>';
      html += '</div>';
    }

    return html;
  }

  function renderAccordionItem(art, id) {
    var html = '';
    html += '<div class="accordion-item" id="accordion-' + id + '" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 8px; overflow:hidden;">';
    html += '  <button class="accordion-trigger" data-target="' + id + '" style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: transparent; border: none; color: var(--text-primary); cursor: pointer; text-align: left; font-weight: 600; font-size: 14px;">';
    html += '    <span>' + art.title + '</span>';
    html += '    <span class="material-icons-round arrow-icon" style="transition: transform 0.2s;">expand_more</span>';
    html += '  </button>';
    html += '  <div class="accordion-panel" id="panel-' + id + '" style="padding: 0 20px 16px 20px; border-top: 1px solid rgba(255,255,255,0.04); display: none;">';
    
    if (art.description) {
      html += '    <p style="font-size: 13px; color: var(--text-primary); margin: 14px 0 8px 0; line-height: 1.5; font-weight: 500;">' + art.description + '</p>';
    }
    
    html += '    <div class="accordion-steps" style="display:flex; flex-direction:column; gap:8px; margin-top:10px; margin-bottom:12px;">';
    art.steps.forEach(function(step) {
      var formatted = step.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--accent-primary-light);">$1</strong>');
      html += '    <div class="step-row" style="display:flex; gap:8px; align-items: flex-start; font-size: 13px; color: var(--text-secondary); line-height: 1.5;"><span class="step-bullet" style="color: var(--accent-primary); font-weight:700;">•</span><span>' + formatted + '</span></div>';
    });
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    return html;
  }

  function renderContactSupportSection() {
    var html = '';
    html += '<div id="contact-technical-support" style="margin-top: 40px; padding-top: 30px; border-top: 1px solid var(--border-light);">';
    html += '  <div style="background: linear-gradient(135deg, rgba(108, 92, 231, 0.04) 0%, rgba(0, 206, 201, 0.04) 100%); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 16px; padding: 28px; text-align: center; backdrop-filter: blur(10px);">';
    html += '    <span class="material-icons-round" style="font-size: 44px; color: var(--accent-secondary); margin-bottom: 12px; display: block;">support_agent</span>';
    html += '    <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: var(--text-primary);">Didn\'t find what you were looking for? We are here to help.</h3>';
    html += '    <p style="font-size: 13.5px; color: var(--text-secondary); max-width: 600px; margin: 0 auto 20px auto; line-height: 1.6;">If our self-help guides and documentation didn\'t resolve your issue, please contact SVM Technical Support directly or raise a ticket.</p>';
    
    // Support Details Grid
    html += '    <div class="support-details-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; max-width: 750px; margin: 0 auto 24px auto; text-align: left; font-size: 13px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); border-radius: 12px; padding: 16px;">';
    html += '      <div style="display: flex; align-items: center; gap: 10px;"><span class="material-icons-round" style="color: var(--success); font-size: 20px;">call</span><div><div style="font-size: 10.5px; color: var(--text-muted); font-weight:600;">PHONE / WHATSAPP</div><div style="font-weight: 600;">+91 91555 15505</div></div></div>';
    html += '      <div style="display: flex; align-items: center; gap: 10px;"><span class="material-icons-round" style="color: var(--info); font-size: 20px;">email</span><div><div style="font-size: 10.5px; color: var(--text-muted); font-weight:600;">EMAIL SUPPORT</div><div style="font-weight: 600;">admin@shishuvikash.edu.in</div></div></div>';
    html += '      <div style="display: flex; align-items: center; gap: 10px;"><span class="material-icons-round" style="color: var(--warning); font-size: 20px;">schedule</span><div><div style="font-size: 10.5px; color: var(--text-muted); font-weight:600;">OFFICE HOURS</div><div style="font-weight: 600;">Mon-Sat (9:00 AM - 5:00 PM)</div></div></div>';
    html += '    </div>';

    // Call-to-action buttons
    html += '    <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-bottom: 28px;">';
    html += '      <a href="https://wa.me/919155515505" target="_blank" class="btn btn-primary" style="background: #25D366; border: none; color: white; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; padding: 10px 20px; border-radius: 8px; text-decoration: none; transition: transform 0.2s; box-shadow: 0 4px 14px rgba(37,211,102,0.2);">';
    html += '        <span class="material-icons-round">chat</span> WhatsApp Support';
    html += '      </a>';
    html += '      <a href="mailto:admin@shishuvikash.edu.in?subject=SVM%20ERP%20Support%20Request" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; padding: 10px 20px; border-radius: 8px; text-decoration: none;">';
    html += '        <span class="material-icons-round">email</span> Email Support';
    html += '      </a>';
    html += '    </div>';

    // Support Ticket Form
    html += '    <div style="max-width: 500px; margin: 0 auto; text-align: left; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">';
    html += '      <h4 style="font-size: 13.5px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 18px; color: var(--accent-secondary);">confirmation_number</span> Raise a Support Ticket</h4>';
    html += '      <form id="support-ticket-form">';
    html += '        <div class="form-group" style="margin-bottom: 12px;">';
    html += '          <label class="form-label" style="font-size: 11px; margin-bottom: 6px; display: block; color: var(--text-muted); font-weight:600;">Category</label>';
    html += '          <select id="ticket-category" class="form-input" style="width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 6px; color: var(--text-primary); font-size: 13px;">';
    html += '            <option value="timetable">Timetable & Scheduling</option>';
    html += '            <option value="students">Students Roster & CRUD</option>';
    html += '            <option value="teachers">Teachers & Mappings</option>';
    html += '            <option value="fees">Fees & Ledgers</option>';
    html += '            <option value="attendance">Attendance & GPS Geofence</option>';
    html += '            <option value="exams">Exams & Report Cards</option>';
    html += '            <option value="other">Other Technical Issue</option>';
    html += '          </select>';
    html += '        </div>';
    html += '        <div class="form-group" style="margin-bottom: 12px;">';
    html += '          <label class="form-label" style="font-size: 11px; margin-bottom: 6px; display: block; color: var(--text-muted); font-weight:600;">Subject</label>';
    html += '          <input type="text" id="ticket-subject" placeholder="Summarize the issue..." required class="form-input" style="width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 6px; color: var(--text-primary); font-size: 13px;">';
    html += '        </div>';
    html += '        <div class="form-group" style="margin-bottom: 16px;">';
    html += '          <label class="form-label" style="font-size: 11px; margin-bottom: 6px; display: block; color: var(--text-muted); font-weight:600;">Description</label>';
    html += '          <textarea id="ticket-description" rows="3" placeholder="Describe the problem or help required..." required class="form-input" style="width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 6px; color: var(--text-primary); resize: vertical; font-family: inherit; font-size: 13px;"></textarea>';
    html += '        </div>';
    html += '        <button type="submit" class="btn btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; padding: 10px 16px; border-radius: 6px;">';
    html += '          <span class="material-icons-round" style="font-size: 18px;">send</span> Submit Support Ticket';
    html += '          <div id="ticket-spinner" class="spinner spinner-sm hidden" style="border-top-color: white; margin-left: 8px;"></div>';
    html += '        </button>';
    html += '      </form>';
    html += '    </div>';

    html += '  </div>';
    html += '</div>';
    return html;
  }

  function attachEvents() {
    var searchInput = document.getElementById('help-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        state.searchQuery = this.value;
        render();
        var len = this.value.length;
        var inp = document.getElementById('help-search-input');
        if (inp) {
          inp.setSelectionRange(len, len);
          inp.focus();
        }
      });
    }

    var backBtn = document.getElementById('help-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        state.selectedCategory = null;
        state.searchQuery = '';
        render();
      });
    }

    document.querySelectorAll('.support-card').forEach(function(card) {
      card.addEventListener('click', function() {
        state.selectedCategory = this.getAttribute('data-category');
        state.searchQuery = '';
        render();
      });
    });

    document.querySelectorAll('.accordion-trigger').forEach(function(trigger) {
      trigger.addEventListener('click', function() {
        var id = this.getAttribute('data-target');
        var panel = document.getElementById('panel-' + id);
        var arrow = this.querySelector('.arrow-icon');
        
        if (panel) {
          var isActive = panel.classList.contains('active');
          panel.classList.toggle('active', !isActive);
          if (arrow) {
            arrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
          }
        }
      });
    });

    // Support Ticket Form Submit Event Listener
    var ticketForm = document.getElementById('support-ticket-form');
    if (ticketForm) {
      ticketForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var category = document.getElementById('ticket-category').value;
        var subject = document.getElementById('ticket-subject').value.trim();
        var description = document.getElementById('ticket-description').value.trim();
        
        if (!subject || !description) return;

        var btn = ticketForm.querySelector('button[type="submit"]');
        var spinner = document.getElementById('ticket-spinner');
        if (btn) btn.disabled = true;
        if (spinner) spinner.classList.remove('hidden');

        setTimeout(function() {
          if (window.SchoolApp) {
            if (!SchoolApp.store) SchoolApp.store = {};
            if (!SchoolApp.store.supportTickets) SchoolApp.store.supportTickets = [];
            
            var newTicket = {
              id: 'TCK-' + Date.now().toString().slice(-6),
              user: SchoolApp.currentUser ? SchoolApp.currentUser.name : 'Unknown User',
              role: SchoolApp.currentUser ? SchoolApp.currentUser.role : 'Guest',
              category: category,
              subject: subject,
              description: description,
              status: 'Open',
              createdAt: new Date().toISOString()
            };

            SchoolApp.store.supportTickets.unshift(newTicket);
            
            // Log to system notifications so admins see it
            if (!SchoolApp.store.notifications) SchoolApp.store.notifications = [];
            SchoolApp.store.notifications.unshift({
              id: 'NOT-' + Date.now(),
              title: 'New Support Ticket Raised',
              description: 'Ticket ' + newTicket.id + ' (' + newTicket.category + ') by ' + newTicket.user + ': ' + subject,
              time: new Date().toISOString(),
              unread: true,
              type: 'system'
            });

            SchoolApp.saveStore();
            SchoolApp.showToast('Support ticket ' + newTicket.id + ' submitted successfully!', 'success');
          }

          ticketForm.reset();
          if (btn) btn.disabled = false;
          if (spinner) spinner.classList.add('hidden');
        }, 800);
      });
    }

    // Scroll Contact Button click listener
    var contactBtn = document.getElementById('contact-admin-btn');
    if (contactBtn) {
      // Clean up previous listeners
      var newContactBtn = contactBtn.cloneNode(true);
      contactBtn.parentNode.replaceChild(newContactBtn, contactBtn);
      newContactBtn.addEventListener('click', function() {
        var el = document.getElementById('contact-technical-support');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  SchoolApp.registerModule('help', {
    init: function() {},
    render: render,
    selectCategory: function(cat) {
      state.selectedCategory = cat;
      state.searchQuery = '';
      SchoolApp.navigate('help');
      render();
    },
    openContactModal: function() {
      SchoolApp.navigate('help');
      setTimeout(function() {
        var el = document.getElementById('contact-technical-support');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  });

})();
