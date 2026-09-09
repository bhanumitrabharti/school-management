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
    students: [
      {
        title: "Naya Student Profile Add Karna",
        description: "School record me naye student ki complete profile, parent details aur admission info register karta hai.",
        steps: [
          "Left navigation menu se **Students** page par jayein.",
          "Top right corner me green **+ Add Student** button par click karein.",
          "Form me student ka **Full Name**, **Class**, **Section**, **Roll Number**, **Date of Birth**, aur **Parent Phone Number** fill karein.",
          "Modal ke bottom me **Save Student** button par click karke record save karein."
        ],
        notes: [
          "Roll Number, Class aur Section ka combination unique hona chahiye taaki conflicts na hon.",
          "Mandatory fields (Name, Class, Phone) ko khali nahi chhod sakte."
        ]
      },
      {
        title: "Excel File Se Bulk Student Import Karna",
        description: "Ek saath poori class ya saare students ki list Excel sheet se system me import karta hai.",
        steps: [
          "**Students** page par jayein aur top header par **Import Excel** button par click karein.",
          "Computer se apni `.xlsx` ya `.csv` student file select karein.",
          "System automatically columns (Full Name, Class, Section, Roll Number, Parent Phone) map kar lega.",
          "Preview check karke **Confirm & Import** par click karein. Complete roster download karne ke liye **Export Excel** button use karein."
        ],
        notes: [
          "Excel headers me standard column names (Full Name, Class, Section, Roll Number, Parent Phone) hona zaroori hain.",
          "Invalid formatting ya incomplete data waali rows skip ho jati hain."
        ]
      },
      {
        title: "Student Soft Delete Aur Recycle Bin Se Restore",
        description: "Unused ya left-school student record ko safe tareeqe se hide karta hai bina permanent deletion ke.",
        steps: [
          "**Students** list me student row ke aage red **Trash** (delete) icon par click karein.",
          "Confirmation prompt me **Delete Student** confirm karein. Record list se hat kar Recycle Bin me chala jayega.",
          "Student ko wapas lane ke liye **Admin Panel** -> **Recycle Bin** tab par jayein.",
          "Student ke aage **Restore** button par click karein. Agar permanently delete karna ho toh **Permanently Delete** chunein."
        ],
        notes: [
          "Normal delete se data turant permanently nahi mita, balki Recycle Bin me safe rehta hai jahan se kabhi bhi Restore ho sakta hai.",
          "Permanently Delete karne par hi record database se Hamesha ke liye mit-ta hai."
        ]
      }
    ],
    attendance: [
      {
        title: "Daily Student Attendance Mark Karna (P / A / L)",
        description: "Class-wise daily attendance register update karta hai jisme Present, Absent aur Late marking hoti hai.",
        steps: [
          "Left menu se **Attendance** page par jayein.",
          "Dropdown se **Class**, **Section**, aur **Date** select karke **Mark Attendance** par click karein.",
          "Har student ke samne **P** (Present), **A** (Absent), ya **L** (Late) button par click karein.",
          "Bottom me **Submit Attendance** button par click karke records save karein."
        ],
        notes: [
          "**L** (Late) status ko present counts me include kiya jata hai par stats me late flag alag rehta hai.",
          "Same Class aur Date par dobara submit karne par duplicate entry nahi banti, existing record update ho jata hai."
        ]
      },
      {
        title: "Bulk All Present Ya All Absent Mark Karna",
        description: "Poori class ko ek saath Present ya Absent set karta hai taaki time bache.",
        steps: [
          "Attendance grid ke top panel par jayein.",
          "Agar zyadatar bacche aaye hain toh **Mark All Present** button par click karein.",
          "Jo bacche absent hain, unka status manually **A** ya **L** me change karein.",
          "Final checks ke baad **Submit Attendance** button press karein."
        ],
        notes: [
          "Bulk button click karne se saare rows ka status current selection se overwrite ho jata hai.",
          "Submit karne se pehle individual changes zaroor check karein."
        ]
      },
      {
        title: "Absent Student Parent Intimation (WhatsApp / SMS)",
        description: "Attendance submit hote hi absent baccho ke parents ko automatic notification bhejne me madad karta hai.",
        steps: [
          "Attendance submit karte hi **Absent Student Intimation** popup automatically open hoga.",
          "Popup me har absent student ke aage green **WhatsApp** button par click karein. Direct pre-filled Hinglish message parent number par open hoga.",
          "Agar SMS API integrated hai toh **SMS** button active rahega, warna disabled/hidden rehta hai.",
          "**History** tab me kisi bhi date ki row par **Notify Absentees** click karke manual trigger bhi kar sakte hain."
        ],
        notes: [
          "Per-student intimation log (`absenceIntimationLog`) maintain hota hai taaki ek hi din baar-baar message na jaye.",
          "WhatsApp send karne ke liye WhatsApp Web ya Desktop/Mobile app logged in hona chahiye."
        ]
      },
      {
        title: "Past Attendance History Aur Summary Reports Dekhna",
        description: "Purani dates ki attendance logs aur class-wise monthly reports view karta hai.",
        steps: [
          "**Attendance** page par top tab **History** select karein.",
          "**Date Range**, **Class**, aur **Section** filter apply karein.",
          "Target date ke aage blue **View** (eye icon) button par click karke detailed student-wise attendance sheet dekhein.",
          "Overall monthly percentage aur total present/absent counts visual summary me dekhein."
        ],
        notes: [
          "History records audit trial ke sath read-only display hote hain.",
          "Specific date par re-submit karne par past attendance history overwrite hokar correction ho jati hai."
        ]
      }
    ],
    fees: [
      {
        title: "Student Fee Collection Aur Payment Record",
        description: "Parents se received fee amount collect karke student account balance update karta hai.",
        steps: [
          "Left menu se **Fees** page par jayein aur student search karein.",
          "Student row ke right side green **Pay Fee** (currency symbol ₹) icon par click karein.",
          "Payment collection modal me **Fee Head** (Tuition Fee, Transport Fee etc.) aur **Payment Mode** (Cash, UPI, Bank Transfer) select karein.",
          "**Amount Paid** enter karein aur **Record Payment** button par click karein."
        ],
        notes: [
          "Zero dues wale student par overpayment warning prompt aata hai.",
          "Payment record hote hi student ka outstanding balance automatically recalculate ho jata hai."
        ]
      },
      {
        title: "Fee Receipt PDF Generate Aur Print Karna",
        description: "Clean A4 print-ready fee receipt PDF create karta hai standard receipt number format me.",
        steps: [
          "Payment save hone ke baad dikhne wale Post-Pay Modal me **View / Print Receipt** option select karein.",
          "Automatic PDF generator print preview open karega jisme receipt number **RCP-SVM-xxxxx** format me rahega.",
          "Print lene ke liye **Print** ya PDF file save karne ke liye **Download PDF** click karein.",
          "Student Fee Ledger se kisi bhi past payment ke **Print** icon par click karke bhi purani receipt download kar sakte hain."
        ],
        notes: [
          "Receipt me Student Name, Class, Roll No, Amount Paid, Total Remaining Balance, aur Date automatically populate hoti hain."
        ]
      },
      {
        title: "Payment Receipt Direct WhatsApp Par Share Karna",
        description: "Parent ke mobile number par Hindi/English bilingual payment confirmation message aur receipt details bhejta hai.",
        steps: [
          "Payment record karne ke baad Post-Pay Modal me **Share WhatsApp** button par click karein.",
          "Ya Fee Ledger me kisi bhi payment transaction ke aage green **WhatsApp** icon par click karein.",
          "WhatsApp App automatically open ho jayega jisme parent ka phone number aur pre-filled text hoga. Send hit karein."
        ],
        notes: [
          "Direct parent ke verified phone number par formatted message load hota hai."
        ]
      },
      {
        title: "Bulk Charge Class - Ek Saath Poori Class Par Fee Apply Karna",
        description: "Poori class ya multiple sections ke sabhi students par monthly fee head due add karta hai.",
        steps: [
          "**Fees** page par top header par **Bulk Charge Class** button par click karein.",
          "Target **Class** & **Section** select karein.",
          "**Fee Head** (jaise Tuition Fee) aur **Amount** (jaise ₹1200) specify karein.",
          "**Apply Charge** click karein. Class ke sabhi active students ke ledger me fee amount add ho jayega."
        ],
        notes: [
          "Bulk charge sirf active status wale students par apply hota hai; left ya deleted students skip ho jate hain."
        ]
      },
      {
        title: "Automated Monthly Recurring Fee Charging Setup",
        description: "Har mahine ki fixed date ko recurring tuition fee automatically sabhi active students par charge karta hai.",
        steps: [
          "**Fees** page par **Fee Settings** (Auto Charge config) par jayein.",
          "**Auto Charge Date** (jaise 1st of every month) aur default **Fee Head** configure karein.",
          "Settings save karein.",
          "Har mahine ki fixed date ko login karne par system background me auto-charge run karega aur notice dikhayega."
        ],
        notes: [
          "Explicit fee head selection required hai taaki silent wrong-head guessing na ho."
        ]
      },
      {
        title: "Fee Ledger Summary Cards Aur Filter Analytics",
        description: "Daily collection, MTD (Month-To-Date), aur Cash-In-Hand balances ko live recalculate karta hai.",
        steps: [
          "**Fees** dashboard kholte hi top par Summary Cards dekhein: **Today Collection**, **MTD Collection**, aur **Cash-in-Hand**.",
          "Naya payment collect hote hi yeh figures bina page refresh kiye live update hoti hain.",
          "Specific duration ke liye **Date Range Filter** aur payment mode ke liye **Payment Mode Filter** (Cash / UPI / Bank) choose karein."
        ],
        notes: [
          "Timezone-safe calculation ensure karti hai ki midnight ke baad daily totals bilkul accurate rahein."
        ]
      }
    ],
    exams: [
      {
        title: "Naya Academic Exam Term Create Karna",
        description: "Session ke examinations (jaise Mid-Term, Final Exam, Unit Test) define karta hai.",
        steps: [
          "**Admin Panel** -> **Examinations** tab par jayein.",
          "Top right corner me **Add Exam Term** button click karein.",
          "Term Title (e.g. `Mid-Term Exam 2026`), Start Date, aur Academic Session select karein.",
          "**Save Term** par click karein."
        ],
        notes: [
          "Exam Term active hone par hi marks entry screen par dropdown me appear hota hai."
        ]
      },
      {
        title: "Class-Wise Exam Subject & Marks Mapping Configure Karna",
        description: "Har class ke liye subjects, Maximum Marks aur Passing Marks set karta hai.",
        steps: [
          "**Admin Panel** -> **Examinations** tab me target Class select karein.",
          "**Add Subject Mapping** button click karein.",
          "Subject Name (e.g. Mathematics, Science), **Max Marks** (e.g. 100), aur **Pass Marks** (e.g. 33) fill karein.",
          "**Save Mapping** par click karein."
        ],
        notes: [
          "Report card generation me subjects mapped order me hi display hote hain."
        ]
      },
      {
        title: "Student Exam Marks Entry & Auto-Grade Calculation",
        description: "Students ke subject marks enter karta hai aur total, percentage, grade, aur pass/fail compute karta hai.",
        steps: [
          "Left menu se **Exams** page par jayein.",
          "Top bar se **Exam Term**, **Class**, aur **Section** select karein.",
          "Grid me har student ke subjects ke samne obtained marks type karein. Absent hone par **A** type karein.",
          "Total Marks, Percentage, aur Letter Grade (A+, A, B, C, F) system real-time compute karega.",
          "Bottom par **Save Marks** button par click karein."
        ],
        notes: [
          "Max marks se zyada digits enter karne par validation alert aata hai."
        ]
      },
      {
        title: "Student A4 Print-Ready Report Card Generate Karna",
        description: "Complete Academic Performance Report Card generate karta hai with Grades, Ranks aur Remarks.",
        steps: [
          "**Exams** marks entry sheet me student row ke aage green **Report Card** button click karein.",
          "Modal popup me formatted print preview open hoga.",
          "**Print Report Card** par click karke physical print lein ya PDF save karein.",
          "Multiple terms compare karne ke liye **Consolidated View** button select karke multi-term report card nikalein."
        ],
        notes: [
          "Consolidated view me 2 terms ke scores side-by-side display hote hain aur aggregate result compute hota hai."
        ]
      },
      {
        title: "Report Card Designer - Layout, Logo & Smart Remarks Setup",
        description: "Report card layout, school logo, custom fields, aur automated Smart Remarks conditions customize karta hai.",
        steps: [
          "**Admin Panel** -> **Report Card Designer** tab par jayein.",
          "School Logo toggle enable karein, Header Address, Affiliation No fill karein.",
          "**Smart Remarks Rules** section me percentage criteria set karein (e.g. >90% -> 'Outstanding student with excellent analytical skills').",
          "**Save Designer Settings** click karein."
        ],
        notes: [
          "Smart Remarks rules student percentage bracket ke hisab se automatic intelligent remarks assign karti hain."
        ]
      }
    ],
    timetable: [
      {
        title: "Automatic Timetable Solver (Fill Empty Slots vs Complete Reset)",
        description: "3-Step intelligent constraint solver se bina teacher conflict ke school timetable generate karta hai.",
        steps: [
          "Left menu se **Timetable** page par jayein.",
          "Header par purple **Auto-Generate Draft** button par click karein.",
          "Popup modal me 2 options me se chunein:",
          "  - **Fill Empty Slots Only**: Pehle se manually setup kiye slots ko maintain rakhega, baaki khali slots fill karega.",
          "  - **Reset & Re-generate All**: Purana saara schedule clear karke poori school ka naya draft banaye ga.",
          "**Generate Timetable** par click karein."
        ],
        notes: [
          "Conflict detection engine ensure karta hai ki koi bhi teacher same period me 2 alag classes me double-book na ho."
        ]
      },
      {
        title: "Timetable Grid Manual Editing & Assigning",
        description: "Specific class period ya teacher slot me subject aur teacher change karne ke liye.",
        steps: [
          "**Class View** me kisi bhi period cell par click karein, ya **Teacher View** me green **[+ Assign]** button click karein.",
          "Popup me **Subject** aur **Teacher** select karein.",
          "**Save Assignment** click karein.",
          "Grid me unsaved slot yellow dashed border ke sath highlight hoga. Main header se **Save Timetable** click karein."
        ],
        notes: [
          "Inactive teachers jinke paas slots baaki hain unki columns visually gray badge se alag highlight hoti hain taaki orphaned slots na rahein."
        ]
      },
      {
        title: "Teacher Portal - 'My Schedule' View",
        description: "Logged-in teacher ko unka daily aur weekly teaching schedule direct dikhata hai.",
        steps: [
          "Teacher login karne ke baad Dashboard ya **Timetable** page par jayein.",
          "**My Schedule** tab par click karein.",
          "Logged-in teacher ko sirf unke assigned periods, classes, aur sections ki matrix list dikhayi degi."
        ],
        notes: [
          "Teacher view direct master timetable store se live sync hota hai; stale mismatch nahi hota."
        ]
      }
    ],
    notice: [
      {
        title: "School Notice Board Par Notice Publish Karna",
        description: "Important circulars, event alerts aur holiday notices publish karta hai.",
        steps: [
          "**Admin Panel** -> **Notice Board** tab par jayein (ya left menu Notice Board).",
          "Top right corner me **Create Notice** button click karein.",
          "**Title**, **Content**, aur Priority (**Normal / High**) fill karein.",
          "Status **Published** select karke **Publish Notice** button click karein."
        ],
        notes: [
          "High Priority notices user dashboards par top alert banner ke roop me float hoti hain."
        ]
      },
      {
        title: "Notice Audience Targeting (Everyone / Teachers / Students)",
        description: "Notice ki visibility select karne ki azadi deta hai ki kiske dashboard par notice dikhega.",
        steps: [
          "Notice creation modal me **Target Audience** section par dhyaan dein.",
          "Checkboxes select karein: **Everyone** (sabke liye), **Teachers** (sirf staff ke liye), ya **Students** (sirf student portal ke liye).",
          "Selection ke baad **Publish Notice** par click karein."
        ],
        notes: [
          "Student-only notices Teacher dashboard par leakage nahi karti (`isNoticeVisibleForUser` restriction).",
          "Purani notice bina audience tag ke default Everyone treat hoti hain."
        ]
      }
    ],
    staff: [
      {
        title: "Staff Mobile GPS Location Punch In & Punch Out",
        description: "Mobile device GPS location verify karke school campus boundary ke andar teacher attendance mark karta hai.",
        steps: [
          "Logged-in Teacher / Staff member dashboard open karein.",
          "Subah aane par green **Punch In** button par click karein.",
          "Browser device location access ka permission maangega - **Allow** click karein.",
          "Location check successfully hone par (within 200m campus radius) Punch-In time save ho jayega. Sham ko jane waqt red **Punch Out** click karein."
        ],
        notes: [
          "Geofencing radius (200m) check fail hone par alert aata hai ki aap school campus ke bahar hain."
        ]
      },
      {
        title: "GPS Location Error & Manual Correction Request",
        description: "Location permission deny hone ya desktop me GPS na hone par attendance issue resolve karne ke liye.",
        steps: [
          "Agar GPS fetch error aaye ya location denied ho, toh Punch panel ke niche **Submit Correction Request** link par click karein.",
          "Form me actual **Punch In Time**, **Punch Out Time**, aur valid **Reason** (e.g. 'GPS location access denied on browser') enter karein.",
          "**Submit Request** par click karein.",
          "Admin -> **Staff Attendance Logs** tab me Admin request review karke **Approve** ya **Reject** karega. Approve hote hi attendance valid ho jaayegi."
        ],
        notes: [
          "Manual correction requests ka proper audit trail rehta hai taaki proxy attendance na lag sake."
        ]
      }
    ],
    teachers: [
      {
        title: "Naya Teacher Profile Aur Account Banayein",
        description: "Teacher Profile add karta hai aur unka login credential setup karta hai.",
        steps: [
          "**Admin Panel** -> **User Management** tab par jayein.",
          "**Add Teacher** button click karein.",
          "Teacher Name, Email, Password, aur Designation fill karein.",
          "**Save Teacher** par click karein."
        ],
        notes: [
          "Password edit karte waqt khali chhodne par purana password hash retain rehta hai."
        ]
      },
      {
        title: "Class Teacher Aur Subjects Assign Karna",
        description: "Teacher ko unki assigned classes, subjects, aur primary Class Teacher role allocate karta hai.",
        steps: [
          "**User Management** me teacher row ke aage edit icon par click karein.",
          "Assigned Classes & Sections check karein aur unke subjects map karein.",
          "Agar Section ke primary class teacher hain toh **Class Teacher** box check karein.",
          "**Save Assignments** click karein."
        ],
        notes: [
          "Ek section ka sirf ek hi Class Teacher ho sakta hai. Duplicate assignment par warning milti hai."
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
    html += '  <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary);">Documentation & Help Center</h1>';
    html += '  <p style="color: var(--text-secondary); margin-bottom: 20px;">Search user guides in simple Hinglish to learn how to manage students, fees, attendance, exams, and timetables.</p>';
    html += '  <div class="support-search-bar" style="max-width: 600px; margin: 0 auto; position: relative;">';
    html += '    <input type="text" id="help-search-input" placeholder="Search guides (e.g. fee collection, attendance, timetable, report card)..." value="' + state.searchQuery + '" style="width:100%; padding: 12px 16px 12px 40px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 8px; color: var(--text-primary);">';
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

    html += '  <div class="support-card" data-category="students" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">🎓</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Students & Admissions</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Naya student add karna, Excel bulk import, aur Recycle Bin se restore karna.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="attendance" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📋</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Student Attendance</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Attendance P/A/L mark karna, Bulk present, aur WhatsApp/SMS intimation.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="fees" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">💰</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Fees & Ledger</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Fee collection, PDF receipts, WhatsApp sharing, Bulk charge, aur live ledger.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="exams" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📝</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Exams & Report Cards</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Exam terms, marks entry, A4 Report Cards, aur Designer customization.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="timetable" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📅</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Timetable & Schedules</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Auto-generate draft solver, manual edit, aur Teacher "My Schedule" view.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="notice" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">📢</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Notice Board</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Notice publish karna aur audience targeting (Everyone/Teachers/Students).</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="staff" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">⏱️</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Staff GPS Attendance</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">GPS location se punch in/out karna aur manual correction request submit karna.</p>';
    html += '  </div>';

    html += '  <div class="support-card" data-category="teachers" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s;">';
    html += '    <div style="font-size: 32px; margin-bottom: 10px;">🏫</div>';
    html += '    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Teachers & Staff</h3>';
    html += '    <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">Teacher profile, credentials reset, aur Class Teacher assignment.</p>';
    html += '  </div>';

    html += '</div>';
    return html;
  }

  function renderCategoryDetail() {
    var cat = state.selectedCategory;
    var list = articles[cat] || [];
    var catNames = {
      students: '🎓 Student Details & Admissions Help',
      attendance: '📋 Student Attendance Help',
      fees: '💰 Fees & Ledger Help',
      exams: '📝 Exams & Report Cards Help',
      timetable: '📅 Timetable & Schedule Help',
      notice: '📢 Notice Board & Audience Targeting Help',
      staff: '⏱️ Staff Attendance & GPS Help',
      teachers: '🏫 Teachers & Staff Management Help'
    };

    var html = '';
    html += '<div class="support-detail-header" style="display:flex; align-items:center; gap:16px; margin-bottom: 20px;">';
    html += '  <button class="btn btn-secondary btn-sm" id="help-back-btn" style="display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">arrow_back</span> Back</button>';
    html += '  <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: var(--text-primary);">' + (catNames[cat] || 'Help Topics') + '</h2>';
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
            (art.steps && art.steps.some(function(s) { return s.toLowerCase().indexOf(query) !== -1; })) ||
            (art.notes && art.notes.some(function(n) { return n.toLowerCase().indexOf(query) !== -1; }))) {
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
      html += '    <p style="font-size: 13.5px; color: var(--text-primary); margin: 14px 0 10px 0; line-height: 1.5; font-weight: 500;">' + art.description + '</p>';
    }
    
    if (art.steps && art.steps.length > 0) {
      html += '    <div style="font-size: 12.5px; font-weight: 700; color: var(--accent-primary-light); margin-top: 10px; margin-bottom: 6px;">Kaise Use Karein:</div>';
      html += '    <div class="accordion-steps" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">';
      art.steps.forEach(function(step, idx) {
        var formatted = step.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--accent-primary-light);">$1</strong>');
        html += '    <div class="step-row" style="display:flex; gap:8px; align-items: flex-start; font-size: 13px; color: var(--text-secondary); line-height: 1.5;"><span class="step-bullet" style="color: var(--accent-primary); font-weight:700;">' + (idx + 1) + '.</span><span>' + formatted + '</span></div>';
      });
      html += '    </div>';
    }

    if (art.notes && art.notes.length > 0) {
      html += '    <div style="margin-top: 12px; padding: 12px 14px; background: rgba(255, 193, 7, 0.08); border-left: 3px solid var(--warning); border-radius: 6px;">';
      html += '      <strong style="color: var(--warning); font-size: 12.5px; display: block; margin-bottom: 6px;">Zaroori Baatein:</strong>';
      html += '      <div style="display:flex; flex-direction:column; gap:6px;">';
      art.notes.forEach(function(note) {
        var formattedNote = note.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html += '        <div style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; display:flex; gap:6px;"><span style="color: var(--warning);">•</span><span>' + formattedNote + '</span></div>';
      });
      html += '      </div>';
      html += '    </div>';
    }
    
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
    html += '      <div style="display: flex; align-items: center; gap: 10px;"><span class="material-icons-round" style="color: var(--info); font-size: 20px;">email</span><div><div style="font-size: 10.5px; color: var(--text-muted); font-weight:600;">EMAIL SUPPORT</div><div style="font-weight: 600;">bhanu.bharti@ctrlshifts.in</div></div></div>';
    html += '      <div style="display: flex; align-items: center; gap: 10px;"><span class="material-icons-round" style="color: var(--warning); font-size: 20px;">schedule</span><div><div style="font-size: 10.5px; color: var(--text-muted); font-weight:600;">OFFICE HOURS</div><div style="font-weight: 600;">Mon-Sat (9:00 AM - 5:00 PM)</div></div></div>';
    html += '    </div>';

    // Call-to-action buttons
    html += '    <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-bottom: 28px;">';
    html += '      <a href="https://wa.me/919155515505" target="_blank" class="btn btn-primary" style="background: #25D366; border: none; color: white; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; padding: 10px 20px; border-radius: 8px; text-decoration: none; transition: transform 0.2s; box-shadow: 0 4px 14px rgba(37,211,102,0.2);">';
    html += '        <span class="material-icons-round">chat</span> WhatsApp Support';
    html += '      </a>';
    html += '      <a href="mailto:bhanu.bharti@ctrlshifts.in?subject=SVM%20ERP%20Support%20Request" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; padding: 10px 20px; border-radius: 8px; text-decoration: none;">';
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
    html += '            <option value="students">Student Details & Admissions</option>';
    html += '            <option value="attendance">Student Attendance</option>';
    html += '            <option value="fees">Fees & Ledger</option>';
    html += '            <option value="exams">Exams & Report Cards</option>';
    html += '            <option value="timetable">Timetable & Schedule</option>';
    html += '            <option value="notice">Notice Board</option>';
    html += '            <option value="staff">Staff Attendance & GPS</option>';
    html += '            <option value="teachers">Teachers & Staff</option>';
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
