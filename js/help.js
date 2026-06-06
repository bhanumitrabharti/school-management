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
        title: "How to view and change timetables",
        description: "Learn how to view class timetables and make changes to daily schedules.",
        steps: [
          "Go to the **Timetable** page from the left menu.",
          "Use the **Class View** / **Teacher View** buttons at the top to switch layouts.",
          "In **Class View**, select a Class, Section, and Day to see the periods.",
          "In **Teacher View**, any free period has a green **[+ Assign]** button.",
          "Click the **[+ Assign]** button to open the schedule box.",
          "Select the Class, Section, and Subject for the teacher, then click **Save Assignment**.",
          "If you see a yellow dashed border around a class block, it means the changes are not saved yet."
        ]
      },
      {
        title: "How to set school timings",
        description: "Set when school starts and ends, and let the system calculate period timings for you.",
        steps: [
          "Click the blue **Timing Settings** gear button on the Timetable page.",
          "Enter the **School Start Time** (like 08:00) and **School End Time** (like 14:00).",
          "Enter the **Total Periods** count for normal weekdays and Saturdays.",
          "Set the **Lunch Break** period offset and duration in minutes.",
          "Click **Save Settings**. The system will automatically divide the school day into equal periods and assign the start and end times for each period."
        ]
      },
      {
        title: "How to auto-generate class schedules",
        description: "Let the system automatically fill in empty periods with qualified teachers and subjects.",
        steps: [
          "Click the purple **Auto-Generate Draft** lightning button.",
          "Click **Confirm** in the popup box. This will create a fresh draft timetable for the whole school.",
          "The system works in two passes: first it tries to schedule subjects that haven't been taught today. If there are still empty periods, it repeats subjects but ensures they are not consecutive.",
          "If a teacher is already busy in another class, the system will leave the period empty so you can manually assign it later."
        ]
      },
      {
        title: "How to reset or clear timetables",
        description: "Wipe schedules clean if you want to start over.",
        steps: [
          "Click the red **Reset Timetable** trash button.",
          "If you are in **Class View**, this will clear the schedule only for the selected class.",
          "If you are in **Teacher View**, this will clear the schedule for the **entire school**. Be careful, as this cannot be undone.",
          "Confirm the warning popup to clear the schedule slots. This does not change your timing settings."
        ]
      }
    ],
    students: [
      {
        title: "How to add a new student",
        description: "Add a new student profile to the school records.",
        steps: [
          "Go to the **Students** page from the left menu.",
          "Click the green **+ Add Student** button at the top.",
          "Fill in the student's name, class, section, roll number, and parent's phone number.",
          "Click **Save Student** to save the record."
        ]
      },
      {
        title: "How to change or delete student info",
        description: "Update student details or remove a student from the list.",
        steps: [
          "Go to the **Students** list and find the student.",
          "Click the blue edit icon (pencil symbol) in the student's row.",
          "Change any details in the form and click **Save Student** to update.",
          "To delete a student, click the red trash icon in their row. This moves the student to the Recycle Bin."
        ]
      },
      {
        title: "How to upload students using Excel",
        description: "Add a large list of students all at once using an Excel spreadsheet.",
        steps: [
          "On the **Students** page, click the **Import Excel** button.",
          "Choose the Excel file from your computer.",
          "The system will read the columns (like Name, Class, Section, Roll No, and Phone Number) and add all students to the system automatically."
        ]
      },
      {
        title: "How to download student lists",
        description: "Save your student roster as an Excel spreadsheet.",
        steps: [
          "Go to the **Students** page.",
          "Use the filters to choose a specific class or section, or leave it empty to get all students.",
          "Click the **Export Excel** button to download the file to your computer."
        ]
      }
    ],
    teachers: [
      {
        title: "How to add a new teacher",
        description: "Create a login account and profile for a new teacher.",
        steps: [
          "Go to the **Admin Panel** and select the **User Management** tab.",
          "Scroll to the teacher list and click **Add Teacher**.",
          "Enter the teacher's name, email, password, and the subjects they teach.",
          "Click **Save Account**."
        ]
      },
      {
        title: "How to assign classes and subjects to teachers",
        description: "Assign classes, map subjects, and set who is the class teacher.",
        steps: [
          "In the **User Management** tab under Admin Panel, click the blue edit icon next to the teacher's name.",
          "Check the boxes for the classes and sections they will teach.",
          "Below each checked class, select the subjects they will teach.",
          "If they are the primary class teacher for a section, check the **Class Teacher** box.",
          "Note: Only one teacher can be the class teacher for any section. The system will show a warning if you try to assign two class teachers.",
          "Click **Save Assignments** to save changes."
        ]
      }
    ],
    fees: [
      {
        title: "How to collect fees",
        description: "Record fee payments from parents and update their account balances.",
        steps: [
          "Go to the **Fees** page from the left menu.",
          "Find the student and click the green pay icon (currency symbol) in their row.",
          "Verify how much they owe, select the payment method (Cash, UPI, or Bank Transfer), enter the amount paid, and click **Record Payment**."
        ]
      },
      {
        title: "How to send receipts on WhatsApp",
        description: "Send a payment receipt message in English and Hindi to the parent's phone.",
        steps: [
          "After saving a fee payment, click **Confirm** on the popup to send a receipt.",
          "Alternatively, open the student's fee ledger and click the green **WhatsApp** icon next to any previous payment.",
          "The system will automatically write a bilingual message with the receipt number, amount paid, and remaining balance, and open WhatsApp for you to send it."
        ]
      },
      {
        title: "How to charge fees in bulk and auto-bill",
        description: "Apply monthly fees to a whole class at once and let the system bill recurring fees.",
        steps: [
          "Click **Bulk Charge Class** at the top of the Fees page.",
          "Select the class, choose the fee type (like Tuition Fee), enter the amount, and click **Apply Charge**.",
          "The system also bills tuition fees automatically at the start of each month in the background and displays a message when you log in."
        ]
      }
    ],
    attendance: [
      {
        title: "How to mark student attendance",
        description: "Record who is present, absent, or late for class today.",
        steps: [
          "Go to the **Attendance** page from the left menu.",
          "Select the Class, Section, and Date, then click **Mark Attendance**.",
          "Click **P** for present, **A** for absent, or **L** for late for each student.",
          "You can use **Mark All Present** or **Mark All Absent** to set everyone at once.",
          "Click **Submit Attendance** at the bottom to save."
        ]
      },
      {
        title: "How to view attendance history",
        description: "Check attendance records from previous days.",
        steps: [
          "On the **Attendance** page, select the **History** tab at the top.",
          "Choose the dates and the Class/Section to see the records.",
          "Click the blue view icon (eye symbol) on any row to see the attendance list for that day."
        ]
      },
      {
        title: "How teachers mark their own attendance with GPS",
        description: "How staff check in and check out using their phone's location.",
        steps: [
          "Teachers can click **Punch In** or **Punch Out** on their dashboard.",
          "The browser will check their device location. They must be within **200 meters** of the school campus to check in.",
          "If check-in fails or they forget, teachers can submit a **Correction Request** with the correct times.",
          "Admins can review, approve, or reject these requests under the User Management or logs tab."
        ]
      }
    ],
    exams: [
      {
        title: "How to set up exams and subjects",
        description: "Set up academic terms and subject passing marks for each class.",
        steps: [
          "Go to the **Admin Panel** -> **Examinations** tab.",
          "Click **Add Exam Term** to create an exam term (like Mid-Term or Annual Exam).",
          "Select a class, click **Add Subject Mapping**, type the subject name, and enter the Max Marks and Passing Marks.",
          "Click **Save Mapping**."
        ]
      },
      {
        title: "How to enter exam marks",
        description: "Enter test scores for students and calculate grades.",
        steps: [
          "Go to the **Exams** page from the left menu.",
          "Select the Exam Term, Class, and Section.",
          "Type in the marks for each student. The system will automatically calculate total marks, percentages, pass/fail status, and letter grades (like A, B, C, F).",
          "Click **Save Marks** to save."
        ]
      },
      {
        title: "How to print report cards",
        description: "Generate print-ready A4 report cards for parents.",
        steps: [
          "Open the **Exams** marks page for a class.",
          "Click the green **Report Card** button next to a student's name.",
          "A preview will pop up showing their scores, rank, grades, and signature boxes. Click **Print** to print it out or save it as a PDF.",
          "You can also click **Consolidated View** to compare and print marks from two terms side-by-side."
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
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Timetable & Classes</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">How to set timings, schedule periods, auto-fill classes, and clear schedules.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="students" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">🎓</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Student Details & Admissions</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">How to add new students, change their details, and upload lists using Excel.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="teachers" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">🏫</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Teachers & Subjects</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">How to add teachers, assign their classes, map subjects, and set class teachers.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="fees" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">💰</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Fees & Payments</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">How to collect payments, check outstanding dues, and send WhatsApp receipts.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="attendance" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📅</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Attendance Tracking</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">How to mark student attendance daily, check past logs, and punch in with GPS.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="exams" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📝</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Exams & Results</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">How to set up exams, enter subject marks, and print A4 student report cards.</p>';
    html += '  </div>';

    html += '</div>';
    return html;
  }

  function renderCategoryDetail() {
    var cat = state.selectedCategory;
    var list = articles[cat] || [];
    var catNames = {
      timetable: '📅 Timetable & Classes Help',
      students: '🎓 Student Details & Admissions Help',
      teachers: '🏫 Teachers & Subjects Help',
      fees: '💰 Fees & Payments Help',
      attendance: '📅 Attendance Tracking Help',
      exams: '📝 Exams & Results Help'
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
    html += '          <select id="ticket-category" class="form-select" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border-light); border-radius: 6px; color: var(--text-primary); font-size: 13px;">';
    html += '            <option value="timetable">Timetable & Classes</option>';
    html += '            <option value="students">Student Details & Admissions</option>';
    html += '            <option value="teachers">Teachers & Subjects</option>';
    html += '            <option value="fees">Fees & Payments</option>';
    html += '            <option value="attendance">Attendance Tracking</option>';
    html += '            <option value="exams">Exams & Results</option>';
    html += '            <option value="other">Other Help</option>';
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
