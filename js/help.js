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
        steps: [
          "Navigate to the **Timetable** module from the left menu panel.",
          "Use the **Class View** / **Teacher View** toggle buttons at the top right to swap layouts.",
          "In **Teacher View**, empty periods are highlighted with a green dashed **[+ Assign]** button.",
          "Click the **[+ Assign]** button to open the scheduling modal.",
          "Select the target class-section and subject for that teacher, then click **Save Assignment**.",
          "Any newly added draft allocations will display with a **dashed yellow border** representing an unsaved draft."
        ]
      },
      {
        title: "How to Configure Smart Timing Settings",
        steps: [
          "Click the blue **Timing Settings** gear button in the Timetable toolbar.",
          "Input the **School Start Time**, **School End Time**, and the **Total Periods** count separately for Weekdays and Saturdays.",
          "Configure the **Lunch Break Offset** (after which period) and **Lunch Duration**.",
          "Click **Save Settings**. The timing calculation engine will automatically determine period durations.",
          "Note: Remaining minutes are automatically distributed to the last period so the day ends exactly at your School End Time."
        ]
      },
      {
        title: "How to Auto-Generate School Timetable Drafts",
        steps: [
          "Click the purple **Auto-Generate Draft** lightning button in the Timetable toolbar.",
          "Read and click **Confirm** in the popup warning prompt.",
          "The system will execute a **Two-Pass Algorithm** globally for all class sections:",
          "- **Pass 1 (Strict Uniqueness)**: Assigns subjects that have not yet been taught today.",
          "- **Pass 2 (Smart Fallback)**: If unique subjects are exhausted, allows repetitions as long as they are non-consecutive.",
          "The algorithm automatically checks teacher conflicts globally to avoid double-bookings and leaves irresolvable slots blank."
        ]
      },
      {
        title: "How to Reset or Clear Schedules",
        steps: [
          "Locate and click the red **Reset Timetable** trash icon button in the Timetable toolbar.",
          "Wipe behavior changes dynamically depending on your active view mode:",
          "- **Class View**: Prompts to wipe the entire week's schedule for the selected class section.",
          "- **Teacher View**: Shows a high-warning prompt to completely clear schedules for the **ENTIRE SCHOOL**.",
          "Note: Resetting always preserves timing settings. Wiped drafts sync instantly to the database."
        ]
      }
    ],
    students: [
      {
        title: "How to Admit a New Student",
        steps: [
          "Click on the **Students** button on the left sidebar menu.",
          "Click the **+ Add Student** button at the top of the page.",
          "Fill out the student's personal details (Name, Class, Section, Roll No., Parent Phone) and click **Save Student**."
        ]
      },
      {
        title: "How to Import Students in Bulk",
        steps: [
          "Go to the **Students** page.",
          "Click the **Import Excel** button at the top.",
          "Choose your `.xlsx`, `.xls`, or `.csv` file and upload. The system will automatically map the details and add the students."
        ]
      },
      {
        title: "How to Use Bulk Student Operations",
        steps: [
          "Open the **Students** page.",
          "Select multiple students by ticking the checkboxes on the left of their names, or tick the header checkbox to select all.",
          "Click the **Bulk Delete Selected** or **Export Selected** button at the bottom of the table."
        ]
      }
    ],
    teachers: [
      {
        title: "How to Assign Classes and Subjects to a Teacher",
        steps: [
          "Navigate to the **Admin Panel** or **Teachers** section.",
          "Click the blue edit icon (**edit** symbol) on a teacher's row or profile card.",
          "In the Class Assignment grid, tick the class-section checkboxes.",
          "Under class checkmarks, map specific subjects for each section and select if they are the Class Teacher.",
          "Note: Only one teacher can be designated as the Class Teacher for a class section. The system will block saving and show a warning toast if a duplicate assignment is attempted."
        ]
      }
    ],
    fees: [
      {
        title: "How to Record Fee Payments",
        steps: [
          "Go to the **Fees** module from the left menu.",
          "Find the target student and click the green pay icon (**payments** symbol) in their row.",
          "Verify the outstanding balance, select the **Payment Mode** (Cash, UPI, or Bank Transfer), enter the amount, and click **Record Payment**."
        ]
      },
      {
        title: "How to Send WhatsApp Bilingual Fee Receipts",
        steps: [
          "When recording a fee payment, confirm the pop-up prompt to send a WhatsApp receipt.",
          "Alternatively, click the green WhatsApp icon next to any receipt transaction inside the student's digital ledger modal.",
          "The system will encode a bilingual English-Hindi receipt message with payment details and redirect to WhatsApp."
        ]
      },
      {
        title: "How to Bulk Charge Classes & Auto-Reconcile Dues",
        steps: [
          "To charge a cohort, click **Bulk Charge Class** at the top of the Fees page, select the class, choose the fee head, and apply.",
          "The **Auto-Fee Catch-Up Engine** automatically runs in the background. If the system month advances, it auto-charges standard class tuition rates to student ledgers and displays a toast on admin login."
        ]
      }
    ],
    attendance: [
      {
        title: "How to Mark Daily Attendance",
        steps: [
          "Click on the **Attendance** link in the left menu.",
          "Select the Class, Section, and Date, then click **Mark Attendance** to load the student cards.",
          "Choose the status button for each student (Present: **P**, Absent: **A**, Late: **L**) and click **Submit Attendance** at the bottom."
        ]
      },
      {
        title: "How to Manage Teacher Attendance and GPS Geofencing",
        steps: [
          "Teachers can punch in/out on their dashboard using browser GPS location checks.",
          "Checks verify the teacher is within **200 meters** of school coordinates before recording.",
          "If check-ins are missed, teachers can submit a Correction Request with reasons.",
          "Admins can review, approve, or reject correction logs under the User Management or logs tab."
        ]
      }
    ],
    exams: [
      {
        title: "How to Enter Exam Marks & Print Report Cards",
        steps: [
          "Go to the **Exams** tab from the left sidebar.",
          "Select the Exam Term, Class, and Section, then input marks for subjects. Click **Save Marks**.",
          "Click the green **Report Card** button next to any student to load printable A4 marksheet layouts.",
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
    html += '  <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary);">Documentation & Guides</h1>';
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
    html += '  <div class="accordion-panel hidden" id="panel-' + id + '" style="padding: 0 20px 16px 20px; border-top: 1px solid rgba(255,255,255,0.04); display: none;">';
    html += '    <div class="accordion-steps" style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">';
    art.steps.forEach(function(step) {
      var formatted = step.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--accent-primary-light);">$1</strong>');
      html += '    <div class="step-row" style="display:flex; gap:8px; align-items: flex-start; font-size: 13px; color: var(--text-secondary); line-height: 1.5;"><span class="step-bullet" style="color: var(--accent-primary); font-weight:700;">•</span><span>' + formatted + '</span></div>';
    });
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
          var isHidden = (panel.style.display === 'none' || panel.style.display === '');
          panel.style.display = isHidden ? 'block' : 'none';
          if (arrow) {
            arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
          }
        }
      });
    });
  }

  SchoolApp.registerModule('help', {
    init: function() {},
    render: render
  });

})();
