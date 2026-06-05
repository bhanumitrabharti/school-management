'use strict';

(function() {
  var state = {
    searchQuery: '',
    selectedCategory: null
  };

  var articles = {
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
        title: "How to View the Student List",
        steps: [
          "Click on the **Students** button on the left sidebar menu.",
          "Use the **Search Bar** at the top to search by student name or roll number.",
          "Filter the list by **Class** or **Section** using the dropdown menus in the toolbar."
        ]
      },
      {
        title: "How to Edit Student Information",
        steps: [
          "Go to the **Students** list and find the student you want to update.",
          "Click the blue edit icon (**edit** symbol) in that student's row.",
          "Modify any details in the form and click **Save Student** to submit."
        ]
      },
      {
        title: "How to Delete a Student",
        steps: [
          "Navigate to the **Students** page.",
          "Find the student and click the red trash icon (**delete** symbol) on the right side of their row.",
          "Click **Confirm** in the popup to send them to the Recycle Bin."
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
        title: "How to Export the Student Roster",
        steps: [
          "Go to the **Students** page.",
          "Use filters to choose the students you want, or leave filters empty for all students.",
          "Click the **Export Excel** button to download the spreadsheet file."
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
    fees: [
      {
        title: "How to Collect Individual Fees",
        steps: [
          "Go to the **Fees** module from the left menu.",
          "Find the target student and click the green pay icon (**payments** symbol) in their row.",
          "Verify the outstanding balance, select the **Payment Mode** (Cash, UPI, or Bank Transfer), enter the amount, and click **Record Payment**."
        ]
      },
      {
        title: "How to Use the 'Bulk Charge Class' Feature",
        steps: [
          "Navigate to the **Fees** page and click the **Bulk Charge Class** button at the top.",
          "Select the target class (or **All Classes**), choose the **Fee Head Type**, specify the billing date, and write a description.",
          "Click **Generate Dues** to automatically apply the fee structure to all students in that class cohort."
        ]
      },
      {
        title: "How to Check Outstanding Dues",
        steps: [
          "Open the **Fees** module from the sidebar.",
          "Check the **Show Defaulters** toggle checkbox in the toolbar to filter the table immediately to students with outstanding balances.",
          "Alternatively, select **Outstanding Balance** from the status dropdown menu to display the same cohort."
        ]
      },
      {
        title: "How to Add a Custom Charge or Fine",
        steps: [
          "Open the **Fees** page and locate the student.",
          "Click the purple charge icon (**add_circle** symbol) in their row.",
          "Choose the **Fee Head**, enter the billing amount, set the date, and click **Apply Charge**."
        ]
      },
      {
        title: "How to View a Student Fee Ledger",
        steps: [
          "Go to the **Fees** page and locate the student.",
          "Click the blue ledger icon (**receipt_long** symbol) in their row to view their running balance (Bahi Khata).",
          "You can review all payments, delete incorrect charges using the **Delete Transaction** button, or check outstanding balances."
        ]
      },
      {
        title: "How to Send a WhatsApp Fee Receipt",
        steps: [
          "When recording a fee payment, click **Confirm** on the WhatsApp receipt prompt.",
          "Alternatively, click the green WhatsApp icon (**send** symbol) next to a payment inside the student's digital ledger modal.",
          "Enter the parent's phone number if prompted, and click **Send WhatsApp** to launch the bilingual receipt message redirect."
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
        title: "How to Use Attendance Quick Controls",
        steps: [
          "Load the attendance marking cards for a class.",
          "Click the **Mark All Present** or **Mark All Absent** buttons at the top of the roster list.",
          "Use the **Reset** button to reset all students back to the default Present status."
        ]
      },
      {
        title: "How to View Attendance History Logs",
        steps: [
          "Go to the **Attendance** page and select the **History** tab at the top.",
          "Set the date filters (**From Date**, **To Date**), and select the Class/Section to load the records list.",
          "Click the blue view icon (**visibility** symbol) on any row to open the detailed student attendance register."
        ]
      },
      {
        title: "How to Export and Delete Attendance Records",
        steps: [
          "Under the attendance **History** tab, open a record detail modal.",
          "Click the **Export to Excel** button at the bottom of the modal to save the sheet.",
          "To delete an incorrect record, click the red trash icon (**delete** symbol) in the history table and click **Confirm**."
        ]
      }
    ],
    notices: [
      {
        title: "How to Add a New Digital Announcement",
        steps: [
          "Navigate to the **Admin Panel** from the sidebar and select the **Notice Board** tab.",
          "Fill out the **Publish New Notice** form (Title, Description, Date, Priority status).",
          "Click **Publish Notice** (or **Save Draft**) to register the notice. Mapped drafts can be approved later using the **Approve** action button."
        ]
      },
      {
        title: "How to Approve Draft Notices",
        steps: [
          "Navigate to the **Admin Panel** -> **Notice Board** tab.",
          "Check the Notices list at the bottom for any item with the yellow **DRAFT** badge.",
          "Click the green checkmark button (**done** symbol) to approve and publish it instantly to the main dashboard."
        ]
      },
      {
        title: "How to Edit or Delete Announcements",
        steps: [
          "Go to the **Admin Panel** -> **Notice Board** tab.",
          "To modify, click the blue edit icon (**edit** symbol) in the announcements list, edit details, and click **Update Notice**.",
          "To delete, click the red trash icon (**delete** symbol) and confirm to remove it permanently."
        ]
      }
    ],
    teachers: [
      {
        title: "How to Add a New Teacher to the System",
        steps: [
          "Go to the **Admin Panel** from the sidebar menu.",
          "Navigate to the **User Management** tab at the top of the admin view.",
          "Scroll to the teacher list, click the **Add Teacher** button, input their details (Name, Subject, Email, Classes), and save the account."
        ]
      },
      {
        title: "How to View Teacher Profile Details",
        steps: [
          "Click the **Teachers** page on the sidebar navigation.",
          "Click the blue eye icon (**visibility** symbol) on a teacher card.",
          "You can review their personal details, total students taught, assigned classes list, and active status."
        ]
      },
      {
        title: "How to Assign Classes to a Teacher",
        steps: [
          "Open the **Teachers** tab or go to the **User Management** section in the Admin Panel.",
          "Click the blue edit icon (**edit** symbol) on a teacher's profile.",
          "In the Class Assignment checkbox grid, select the target class and section mappings, then click **Save Teacher**."
        ]
      },
      {
        title: "How to Remove or Export Teachers",
        steps: [
          "Open the **Teachers** page.",
          "To delete, click the red trash icon (**delete** symbol) on their profile card and confirm (recoverable from the Recycle Bin).",
          "Click the **Export Excel** button at the top to download the full teacher list."
        ]
      }
    ],
    dashboard: [
      {
        title: "How to Read Dashboard Stats and Charts",
        steps: [
          "Click the **Dashboard** link on the left sidebar menu.",
          "Observe the 4 counting cards at the top showing dynamic real-time counts.",
          "Hover your cursor over the **Attendance History** bar chart or **Student Distribution** doughnut chart to inspect statistics."
        ]
      },
      {
        title: "How to Use the Notification Center",
        steps: [
          "Locate the bell icon in the top right header. The red badge indicates unread events.",
          "Click the bell icon to toggle the glassmorphic **Notification Dropdown**.",
          "Review the latest 3 announcements and the 5 most recent system actions (logs). Click anywhere outside to close the dropdown."
        ]
      }
    ],
    exams: [
      {
        title: "How to Enter Student Exam Marks",
        steps: [
          "Select the **Exams** tab from the left sidebar.",
          "Choose the Exam Term, Class, and Section from the dropdown menus to load the students marks matrix.",
          "Enter the scores for each subject in the text input cells, then click the **Save Marks** button at the bottom."
        ]
      },
      {
        title: "How to Print a Single Term Report Card",
        steps: [
          "Open the **Exams** page and load the marks matrix for a class.",
          "Click the green **Report Card** button next to a student's row.",
          "Verify the official school branding, grading legend, trophy rank badge, and structured signature boxes in the popup, then click **Print**."
        ]
      },
      {
        title: "How to Toggle Consolidated Combined View",
        steps: [
          "Open the **Exams** page.",
          "Click the **Consolidated View** button in the top toolbar to switch modes.",
          "Select the two terms you want to combine (e.g., Term 1 and Term 2) to display their side-by-side totals and combined grades."
        ]
      },
      {
        title: "How to Print a Combined Term Report Card",
        steps: [
          "Set the Exams view to **Consolidated View** and load the class data.",
          "Click the **Combined Report Card** button next to a student's name.",
          "Verify the dual-term table, cumulative grade, rank trophy, and notes, then click the print action button."
        ]
      }
    ],
    promotion: [
      {
        title: "How to Setup Academic Class Promotion",
        steps: [
          "Navigate to the **Admin Panel** from the sidebar and click the **Class Promotion** tab.",
          "Choose the **Source Class** (where students are now) and the **Destination Class** (where they will move).",
          "The system will automatically suggest the logical next class as the destination (e.g., Class 5 to Class 6)."
        ]
      },
      {
        title: "How to Promote or Retain Students",
        steps: [
          "Load the student checklist for a class in the **Class Promotion** panel.",
          "Click **Select All** to promote the whole class, or uncheck specific students to hold them back in their current class.",
          "Click the **Promote Students** button to process. The system automatically creates a rollback backup before executing."
        ]
      }
    ],
    data: [
      {
        title: "How to Backup and Restore via JSON",
        steps: [
          "Go to the **Admin Panel** -> **Data Management** tab.",
          "Click **Export Backup (JSON)** to download a complete backup file copy of your ERP database.",
          "To restore, click **Import Backup (JSON)**, select your saved backup file, and click **Confirm** in the popup to overwrite and reload."
        ]
      },
      {
        title: "How to Export and Import Data via Excel",
        steps: [
          "Go to **Admin Panel** -> **Data Management** tab.",
          "Under Excel Exports, click **Export Students**, **Export Teachers**, or **Export Attendance** to download spreadsheets.",
          "Click **Import Students (Excel)** to upload new rosters from a spreadsheet."
        ]
      },
      {
        title: "How to Use the Recycle Bin",
        steps: [
          "Go to **Admin Panel** -> **Recovery Center** tab.",
          "Under the Recycle Bin list, locate the deleted student, teacher, or attendance log.",
          "Click the green checkmark button (**restore** symbol) to restore the item, or click the red trash button to delete it permanently."
        ]
      },
      {
        title: "How to Create and Rollback Restore Points",
        steps: [
          "Open **Admin Panel** -> **Recovery Center** and scroll to the Restore Points section.",
          "Enter a description and click **Create Restore Point** to save a manual snapshot of the database.",
          "To undo recent changes, find a snapshot in the list and click **Rollback** (**history** symbol) to restore the database to that state."
        ]
      }
    ],
    admin: [
      {
        title: "How to Change School Details",
        steps: [
          "Go to the **Admin Panel** -> **School Settings** tab.",
          "Update the School Name, Academic Year, and School Address fields.",
          "Click **Save Settings** to apply the updates globally (affects report card headers)."
        ]
      },
      {
        title: "How to Configure Firebase Cloud Sync",
        steps: [
          "Navigate to the **School Settings** tab in the Admin Panel.",
          "Tick the **Enable Firebase Cloud Sync** checkbox and paste your Firebase Database Config JSON in the input field.",
          "Click **Test Connection** to check if it connects, then click **Save Settings** to synchronize your database in real-time."
        ]
      },
      {
        title: "How to Manage User Accounts and Passwords",
        steps: [
          "Navigate to the **Admin Panel** -> **User Management** tab.",
          "Modify the Admin username and password in the settings inputs, then click **Update Credentials**.",
          "Click **Reset All Teacher Passwords** to reset all teacher passwords to \"teacher123\", or toggle the teacher active switch on any row."
        ]
      },
      {
        title: "How to Configure Class Fee Structures",
        steps: [
          "Go to the **Admin Panel** -> **Fee Setup** tab.",
          "To create a fee head, click **Add Custom Fee Head**, fill out the name, and click **Save**.",
          "Click **Edit Structure** next to any class, fill out default fee structures for each head, and click **Save Structure**."
        ]
      },
      {
        title: "How to Configure Exam Terms and Subjects",
        steps: [
          "Open **Admin Panel** -> **Examinations** tab.",
          "Click **Add Exam Term** to create an academic term (e.g., Annual Exams).",
          "Select a Class, click **Add Subject Mapping**, type the subject name, set the Max and Passing Marks, and click **Save Mapping**."
        ]
      },
      {
        title: "How to Seed Demo Exam Data",
        steps: [
          "Open **Admin Panel** -> **Examinations** tab.",
          "Click the **Seed Demo Exam Data** button in the toolbar.",
          "Click **Confirm** in the popup. The system will seed two terms, create Class 1 subjects, enter sample scores, and trigger automatic notice drafts."
        ]
      }
    ],
    chatbot: [
      {
        title: "How to Use the AI Support Chatbot",
        steps: [
          "Click the floating agent icon button (**support_agent** symbol) in the bottom right corner of the screen.",
          "Type your support question in Hindlish, English, or Hindi in the chat input field and press **Enter** (or click the send icon).",
          "The AI assistant will process your request using live Google Gemini API proxying and return helpful guide summaries."
        ]
      }
    ]
  };

  function render() {
    var container = document.getElementById('page-support');
    if (!container) return;

    var html = '';

    // Hero Search Section
    html += '<div class="support-hero">';
    html += '  <h1>How can we help you today?</h1>';
    html += '  <div class="support-search-bar">';
    html += '    <span class="material-icons-round">search</span>';
    html += '    <input type="text" id="support-search-input" placeholder="Search guides by keywords (e.g. dues, admission, notice)..." value="' + state.searchQuery + '">';
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
    html += '<div class="support-grid">';

    // Student Management Card
    html += '  <div class="support-card" data-category="students">';
    html += '    <div class="support-card-icon">🎓</div>';
    html += '    <h3>Student Management</h3>';
    html += '    <p>Admit, view, edit, delete, and bulk import/export student rosters.</p>';
    html += '  </div>';

    // Fee Collection Card
    html += '  <div class="support-card" data-category="fees">';
    html += '    <div class="support-card-icon">💰</div>';
    html += '    <h3>Fee Management</h3>';
    html += '    <p>Record payments, charge classes, print receipts, and track defaulters.</p>';
    html += '  </div>';

    // Attendance Card
    html += '  <div class="support-card" data-category="attendance">';
    html += '    <div class="support-card-icon">📅</div>';
    html += '    <h3>Daily Attendance</h3>';
    html += '    <p>Mark registers, view histories, analyze stats, and export logs.</p>';
    html += '  </div>';

    // Notice Board Card
    html += '  <div class="support-card" data-category="notices">';
    html += '    <div class="support-card-icon">📢</div>';
    html += '    <h3>Notice Board</h3>';
    html += '    <p>Create drafts, publish news, approve posts, and edit notifications.</p>';
    html += '  </div>';

    // Teachers Card
    html += '  <div class="support-card" data-category="teachers">';
    html += '    <div class="support-card-icon">🏫</div>';
    html += '    <h3>Teachers & Staff</h3>';
    html += '    <p>Manage accounts, allocate subjects, assign classes, and view profiles.</p>';
    html += '  </div>';

    // Dashboard Card
    html += '  <div class="support-card" data-category="dashboard">';
    html += '    <div class="support-card-icon">📊</div>';
    html += '    <h3>Dashboard & Notifications</h3>';
    html += '    <p>Monitor metrics, analyze charts, and check system log activity lists.</p>';
    html += '  </div>';

    // Exams Card
    html += '  <div class="support-card" data-category="exams">';
    html += '    <div class="support-card-icon">📝</div>';
    html += '    <h3>Exams & Report Cards</h3>';
    html += '    <p>Enter marks, print A4 report cards, and toggle combined term view.</p>';
    html += '  </div>';

    // Class Promotion Card
    html += '  <div class="support-card" data-category="promotion">';
    html += '    <div class="support-card-icon">📈</div>';
    html += '    <h3>Class Promotion</h3>';
    html += '    <p>Promote cohorts, toggle hold-backs, and backup database states.</p>';
    html += '  </div>';

    // Data Backup Card
    html += '  <div class="support-card" data-category="data">';
    html += '    <div class="support-card-icon">💾</div>';
    html += '    <h3>Data & Recovery</h3>';
    html += '    <p>JSON backups, Recycle Bin recovery, and database rollback snapshots.</p>';
    html += '  </div>';

    // Admin Settings Card
    html += '  <div class="support-card" data-category="admin">';
    html += '    <div class="support-card-icon">⚙️</div>';
    html += '    <h3>Admin Settings & Sync</h3>';
    html += '    <p>School configurations, user logins, fee setups, and Cloud Sync setup.</p>';
    html += '  </div>';

    // Chatbot Card
    html += '  <div class="support-card" data-category="chatbot" style="grid-column: span 2;">';
    html += '    <div class="support-card-icon">🤖</div>';
    html += '    <h3>AI Support Chatbot</h3>';
    html += '    <p>Interact with the conversational Gemini-powered assistant.</p>';
    html += '  </div>';

    html += '</div>';
    return html;
  }

  function renderCategoryDetail() {
    var cat = state.selectedCategory;
    var list = articles[cat] || [];
    var catNames = {
      students: '🎓 Student Management Help',
      fees: '💰 Fee Collection Help',
      attendance: '📅 Daily Attendance Help',
      notices: '📢 Notice Board Help',
      teachers: '🏫 Teachers & Staff Help',
      dashboard: '📊 Dashboard & Notification Center Help',
      exams: '📝 Exams & Report Cards Help',
      promotion: '📈 Class Promotion Help',
      data: '💾 Data Backup & Recovery Help',
      admin: '⚙️ Admin Settings & Sync Help',
      chatbot: '🤖 AI Support Chatbot Help'
    };

    var html = '';
    html += '<div class="support-detail-header">';
    html += '  <button class="btn btn-secondary btn-sm" id="support-back-btn"><span class="material-icons-round">arrow_back</span> Back to Categories</button>';
    html += '  <h2>' + catNames[cat] + '</h2>';
    html += '</div>';

    html += '<div class="support-accordion-list">';
    list.forEach(function(art, index) {
      html += renderAccordionItem(art, cat + '-' + index);
    });
    html += '</div>';

    return html;
  }

  function renderSearchResults() {
    var query = state.searchQuery.toLowerCase();
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
    html += '<div class="support-detail-header">';
    html += '  <h2>Search Results for "' + state.searchQuery + '"</h2>';
    html += '</div>';

    if (found.length > 0) {
      html += '<div class="support-accordion-list">';
      found.forEach(function(item) {
        html += renderAccordionItem(item.art, item.id);
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state">';
      html += '  <span class="material-icons-round">search_off</span>';
      html += '  <h3>No Mapped Guides Found</h3>';
      html += '  <p>Humko aapke search keyword se related koi guide nahi mili. Kripya alternative terms search karein ya direct manual help ke liye Administrator se chat karein!</p>';
      html += '</div>';
    }

    return html;
  }

  function renderAccordionItem(art, id) {
    var html = '';
    html += '<div class="accordion-item" id="accordion-' + id + '">';
    html += '  <button class="accordion-trigger" data-target="' + id + '">';
    html += '    <span>' + art.title + '</span>';
    html += '    <span class="material-icons-round arrow-icon">expand_more</span>';
    html += '  </button>';
    html += '  <div class="accordion-panel hidden" id="panel-' + id + '">';
    html += '    <div class="accordion-steps">';
    art.steps.forEach(function(step) {
      var formatted = step.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html += '    <div class="step-row"><span class="step-bullet">•</span><span>' + formatted + '</span></div>';
    });
    html += '    </div>';
    html += '    <div class="support-guide-video">';
    html += '      <span class="material-icons-round">play_circle_outline</span>';
    html += '      <span>▶️ Watch 10-second Quick Guide</span>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    return html;
  }

  function openContactAdminModal() {
    var bodyHTML = '<div class="contact-admin-modal-view" style="display:flex; flex-direction:column; gap:16px; padding:12px;">';
    bodyHTML += '  <div style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); padding:16px; border-radius:12px;">';
    bodyHTML += '    <span class="material-icons-round" style="font-size:40px; color:var(--accent-secondary)">support_agent</span>';
    bodyHTML += '    <div>';
    bodyHTML += '      <h4 style="margin:0; font-size:16px; font-weight:700;">SVM Administration Office</h4>';
    bodyHTML += '      <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted)">System Developer & Technical Support</p>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="detail-grid" style="display:grid; grid-template-columns:1fr; gap:12px;">';
    bodyHTML += '    <div style="display:flex; align-items:center; gap:12px;"><span class="material-icons-round" style="color:var(--success)">call</span><div><div style="font-size:11px; color:var(--text-muted)">PHONE NUMBER</div><div style="font-size:13px; font-weight:600;">+91 91555 15505</div></div></div>';
    bodyHTML += '    <div style="display:flex; align-items:center; gap:12px;"><span class="material-icons-round" style="color:var(--info)">email</span><div><div style="font-size:11px; color:var(--text-muted)">EMAIL ADDRESS</div><div style="font-size:13px; font-weight:600;">admin@shishuvikash.edu.in</div></div></div>';
    bodyHTML += '    <div style="display:flex; align-items:center; gap:12px;"><span class="material-icons-round" style="color:var(--warning)">location_on</span><div><div style="font-size:11px; color:var(--text-muted)">DEVELOPER ADDRESS</div><div style="font-size:13px; font-weight:600;">Shishu Vikash Mandir Shiv Mandir Road Chandrapura Bokaro 828403</div></div></div>';
    bodyHTML += '    <div style="display:flex; align-items:center; gap:12px;"><span class="material-icons-round" style="color:var(--text-muted)">schedule</span><div><div style="font-size:11px; color:var(--text-muted)">OFFICE HOURS</div><div style="font-size:13px; font-weight:600;">Monday to Saturday (09:00 AM - 05:00 PM)</div></div></div>';
    bodyHTML += '  </div>';
    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
    footerHTML += '<a href="https://wa.me/919155515505" target="_blank" class="btn btn-primary" style="background:#25D366; box-shadow:none;"><span class="material-icons-round">chat</span> Send WhatsApp Message</a>';

    SchoolApp.showModal('Contact System Administrator', bodyHTML, footerHTML);
  }

  function attachEvents() {
    var searchInput = document.getElementById('support-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        state.searchQuery = this.value;
        render();
        var len = this.value.length;
        var inp = document.getElementById('support-search-input');
        if (inp) {
          inp.setSelectionRange(len, len);
          inp.focus();
        }
      });
    }

    var backBtn = document.getElementById('support-back-btn');
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
          var isHidden = panel.classList.contains('hidden');
          panel.classList.toggle('hidden', !isHidden);
          if (arrow) {
            arrow.textContent = isHidden ? 'expand_less' : 'expand_more';
          }
        }
      });
    });

    // Contact Admin Floating Action Button
    var contactBtn = document.getElementById('contact-admin-btn');
    if (contactBtn) {
      contactBtn.addEventListener('click', openContactAdminModal);
    }
  }

  function selectCategory(cat) {
    state.selectedCategory = cat;
    state.searchQuery = '';
    if (SchoolApp.currentPage === 'support') {
      render();
    } else {
      SchoolApp.navigate('support');
    }
  }

  SchoolApp.registerModule('support', {
    init: function() {},
    render: render,
    selectCategory: selectCategory,
    openContactModal: openContactAdminModal
  });

})();
