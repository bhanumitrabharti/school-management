'use strict';

(function() {
  var chatbotOpen = false;
  var chatbotContainer = null;

  // Knowledge Base extracted from verified js/help.js topics
  var TOPICS = [
    {
      id: 'student-add',
      category: 'students',
      title: 'Naya Student Profile Add Karna',
      description: 'School record me naye student ki complete profile, parent details aur admission info register karta hai.',
      keywords: ['student', 'studnt', 'add', 'naya', 'enroll', 'register', 'admission', 'profile', 'create', 'banaye', 'entry'],
      steps: [
        'Left navigation menu se **Students** page par jayein.',
        'Top right corner me green **+ Add Student** button par click karein.',
        'Form me student ka **Full Name**, **Class**, **Section**, **Roll Number**, **DOB**, aur **Parent Phone** fill karein.',
        'Modal bottom me **Save Student** click karke save karein.'
      ],
      notes: ['Roll Number + Class + Section unique hona chahiye.', 'Mandatory fields khali nahi chhod sakte.']
    },
    {
      id: 'student-import',
      category: 'students',
      title: 'Excel File Se Bulk Student Import Karna',
      description: 'Ek saath poori class ya saare students ki list Excel sheet se system me import karta hai.',
      keywords: ['excel', 'import', 'bulk', 'csv', 'sheet', 'upload', 'export', 'roster', 'list', 'file'],
      steps: [
        '**Students** page par header par **Import Excel** button click karein.',
        'Computer se `.xlsx` ya `.csv` file select karein.',
        'System columns map karega. Preview check karke **Confirm & Import** click karein.',
        'Roster download karne ke liye **Export Excel** use karein.'
      ],
      notes: ['Excel headers me standard column names zaroori hain.']
    },
    {
      id: 'student-delete',
      category: 'students',
      title: 'Student Soft Delete Aur Recycle Bin Se Restore',
      description: 'Unused ya left-school student record ko safe tareeqe se hide karta hai bina permanent deletion ke.',
      keywords: ['delete', 'restore', 'recycle', 'bin', 'trash', 'remove', 'wapas', 'hatao', 'deleted', 'left'],
      steps: [
        '**Students** list me student row ke aage red **Trash** (delete) icon click karein.',
        'Confirmation me **Delete Student** click karein (Recycle Bin me jayega).',
        'Restore karne ke liye **Admin Panel** -> **Recycle Bin** tab me **Restore** click karein.'
      ],
      notes: ['Delete se data turant permanent erase nahi hota, Recycle Bin me safe rehta hai.']
    },
    {
      id: 'att-mark',
      category: 'attendance',
      title: 'Daily Student Attendance Mark Karna (P / A / L)',
      description: 'Class-wise daily attendance register update karta hai jisme Present, Absent aur Late marking hoti hai.',
      keywords: ['attendance', 'attandence', 'atendance', 'mark', 'present', 'absent', 'late', 'haziri', 'haazri', 'daily', 'kre', 'kare'],
      steps: [
        'Left menu se **Attendance** page par jayein.',
        'Class, Section, aur Date select karke **Mark Attendance** click karein.',
        'Har student ke samne **P** (Present), **A** (Absent), ya **L** (Late) status chunein.',
        'Bottom me **Submit Attendance** button press karein.'
      ],
      notes: ['Late (L) status present count me include hota hai lekin late flag rehta hai.']
    },
    {
      id: 'att-bulk',
      category: 'attendance',
      title: 'Bulk All Present Ya All Absent Mark Karna',
      description: 'Poori class ko ek saath Present ya Absent set karta hai taaki time bache.',
      keywords: ['bulk', 'all', 'present', 'mark all', 'sabko', 'ek saath', 'everyone', 'saare'],
      steps: [
        'Attendance grid ke top panel par jayein.',
        '**Mark All Present** ya **Mark All Absent** button par click karein.',
        'Absent/Late baccho ka status manually update karke **Submit Attendance** click karein.'
      ],
      notes: ['Bulk click saare rows ka status overwrite kar deta hai.']
    },
    {
      id: 'att-intimation',
      category: 'attendance',
      title: 'Absent Student Parent Intimation (WhatsApp / SMS)',
      description: 'Attendance submit hote hi absent baccho ke parents ko automatic notification bhejne me madad karta hai.',
      keywords: ['absent', 'parent', 'whatsapp', 'msg', 'message', 'bheje', 'bhejna', 'intimation', 'sms', 'bacho', 'baccho', 'notify', 'absentees', 'notification'],
      steps: [
        'Attendance submit karte hi **Absent Student Intimation** popup open hoga.',
        'Har absent student ke aage green **WhatsApp** button par click karein. Pre-filled Hinglish message load hoga.',
        'SMS API configured hone par **SMS** button active rehta hai.',
        '**History** tab me **Notify Absentees** se manual trigger bhi kar sakte hain.'
      ],
      notes: ['Per-student intimation log maintain hota hai taaki baar-baar message na jaye.']
    },
    {
      id: 'att-history',
      category: 'attendance',
      title: 'Past Attendance History Aur Summary Reports Dekhna',
      description: 'Purani dates ki attendance logs aur class-wise monthly reports view karta hai.',
      keywords: ['history', 'report', 'past', 'purani', 'logs', 'view', 'month', 'monthly', 'record'],
      steps: [
        '**Attendance** page par top tab **History** select karein.',
        'Date Range, Class, aur Section filter apply karein.',
        'Target date ke aage **View** (eye icon) click karke detail sheet dekhein.'
      ],
      notes: ['History records audit trial ke sath read-only display hote hain.']
    },
    {
      id: 'fee-collect',
      category: 'fees',
      title: 'Student Fee Collection Aur Payment Record',
      description: 'Parents se received fee amount collect karke student account balance update karta hai.',
      keywords: ['fee', 'fees', 'collect', 'collection', 'pay', 'payment', 'dues', 'jama', 'paisa', 'record'],
      steps: [
        'Left menu se **Fees** page par jayein aur student search karein.',
        'Student row ke right side green **Pay Fee** (₹) icon par click karein.',
        '**Fee Head** aur **Payment Mode** (Cash/UPI/Bank) select karein.',
        '**Amount Paid** enter karke **Record Payment** click karein.'
      ],
      notes: ['Zero dues walon par overpayment warning prompt aata hai.']
    },
    {
      id: 'fee-receipt',
      category: 'fees',
      title: 'Fee Receipt PDF Generate Aur Print Karna',
      description: 'Clean A4 print-ready fee receipt PDF create karta hai standard receipt number format me.',
      keywords: ['receipt', 'recipt', 'pdf', 'print', 'niklega', 'nikale', 'generate', 'download', 'rcp', 'bill', 'slip'],
      steps: [
        'Payment save hone ke baad Post-Pay Modal me **View / Print Receipt** chunein.',
        'PDF generator preview open karega (format **RCP-SVM-xxxxx**).',
        '**Print** ya **Download PDF** click karein.',
        'Fee Ledger me past transaction ke Print icon se bhi download kar sakte hain.'
      ],
      notes: ['Receipt me Student Name, Class, Amount, aur Remaining Balance automatically load hota hai.']
    },
    {
      id: 'fee-whatsapp',
      category: 'fees',
      title: 'Payment Receipt Direct WhatsApp Par Share Karna',
      description: 'Parent ke mobile number par Hindi/English bilingual payment confirmation message aur receipt details bhejta hai.',
      keywords: ['whatsapp', 'share', 'bhej', 'bhejna', 'receipt', 'confirmation', 'mobile', 'phone'],
      steps: [
        'Payment record hone ke baad Post-Pay Modal me **Share WhatsApp** click karein.',
        'Ya Fee Ledger me transaction ke aage green **WhatsApp** icon click karein.',
        'WhatsApp App automatically parent number par pre-filled text ke sath open hoga.'
      ],
      notes: ['Parent ke verified mobile number par direct message load hota hai.']
    },
    {
      id: 'fee-bulk',
      category: 'fees',
      title: 'Bulk Charge Class - Ek Saath Poori Class Par Fee Apply Karna',
      description: 'Poori class ya multiple sections ke sabhi students par monthly fee head due add karta hai.',
      keywords: ['bulk', 'charge', 'monthly', 'class', 'fee head', 'apply', 'due', 'sabko'],
      steps: [
        '**Fees** page par header par **Bulk Charge Class** button click karein.',
        'Class, Section, Fee Head, aur Amount specify karein.',
        '**Apply Charge** click karein. Active students ke ledger me fee add ho jayegi.'
      ],
      notes: ['Soft deleted ya left students skip ho jate hain.']
    },
    {
      id: 'fee-auto',
      category: 'fees',
      title: 'Automated Monthly Recurring Fee Charging Setup',
      description: 'Har mahine ki fixed date ko recurring tuition fee automatically sabhi active students par charge karta hai.',
      keywords: ['auto', 'charge', 'recurring', 'automatic', 'monthly', 'date', 'schedule', 'setup'],
      steps: [
        '**Fees** -> **Fee Settings** par jayein.',
        '**Auto Charge Date** aur default Fee Head configure karein.',
        'Fixed date ko login par system auto-charge process run karega.'
      ],
      notes: ['Explicit fee head selection zaroori hai.']
    },
    {
      id: 'fee-ledger',
      category: 'fees',
      title: 'Fee Ledger Summary Cards Aur Filter Analytics',
      description: 'Daily collection, MTD (Month-To-Date), aur Cash-In-Hand balances ko live recalculate karta hai.',
      keywords: ['ledger', 'today', 'mtd', 'collection', 'cash', 'hand', 'summary', 'analytics', 'total', 'hisab'],
      steps: [
        '**Fees** dashboard par Summary Cards dekhein: **Today Collection**, **MTD Collection**, **Cash-in-Hand**.',
        'Naya payment collect hote hi numbers live update hote hain.',
        'Date Range & Payment Mode filter use karein.'
      ],
      notes: ['Timezone-safe calculation midnight totals ko accurate rakhti hai.']
    },
    {
      id: 'exam-term',
      category: 'exams',
      title: 'Naya Academic Exam Term Create Karna',
      description: 'Session ke examinations (jaise Mid-Term, Final Exam, Unit Test) define karta hai.',
      keywords: ['exam', 'term', 'create', 'add', 'midterm', 'unit', 'test', 'annual', 'session'],
      steps: [
        '**Admin Panel** -> **Examinations** tab par jayein.',
        '**Add Exam Term** button click karein.',
        'Term Title, Start Date, aur Session fill karke **Save Term** click karein.'
      ],
      notes: ['Active term hi marks entry screen par appear hota hai.']
    },
    {
      id: 'exam-subject',
      category: 'exams',
      title: 'Class-Wise Exam Subject & Marks Mapping Configure Karna',
      description: 'Har class ke liye subjects, Maximum Marks aur Passing Marks set karta hai.',
      keywords: ['subject', 'mapping', 'max', 'pass', 'marks', 'configure', 'theory', 'practical', 'code'],
      steps: [
        '**Admin Panel** -> **Examinations** tab me Class select karein.',
        '**Add Subject Mapping** button click karein.',
        'Subject Name, Max Marks, aur Pass Marks fill karke **Save Mapping** click karein.'
      ],
      notes: ['Report card me subjects mapped order me hi display hote hain.']
    },
    {
      id: 'exam-marks',
      category: 'exams',
      title: 'Student Exam Marks Entry & Auto-Grade Calculation',
      description: 'Students ke subject marks enter karta hai aur total, percentage, grade, aur pass/fail compute karta hai.',
      keywords: ['marks', 'entry', 'score', 'marksheet', 'enter', 'input', 'fill', 'grade', 'nambar'],
      steps: [
        'Left menu se **Exams** page par jayein.',
        'Exam Term, Class, Section, aur Subject select karein.',
        'Grid me marks/absent fill karein. System auto-grade calculate karega. Click **Save Marks**.'
      ],
      notes: ['Max marks se zyada digits enter karne par validation error alert aata hai.']
    },
    {
      id: 'exam-reportcard',
      category: 'exams',
      title: 'Student A4 Print-Ready Report Card Generate Karna',
      description: 'Complete Academic Performance Report Card generate karta hai with Grades, Ranks aur Remarks.',
      keywords: ['report', 'card', 'reportcard', 'bnaye', 'banaye', 'print', 'generate', 'result', 'marksheet', 'nikale', 'create'],
      steps: [
        '**Exams** marks sheet ya **Report Cards** tab me student ke aage green **Report Card** button click karein.',
        'Modal preview me **Print Report Card** par click karke A4 PDF nikalein.',
        'Multiple terms compare karne ke liye **Consolidated View** chunein.'
      ],
      notes: ['Consolidated view me 2 terms ke scores side-by-side display hote hain.']
    },
    {
      id: 'exam-designer',
      category: 'exams',
      title: 'Report Card Designer - Layout, Logo & Smart Remarks Setup',
      description: 'Report card layout, school logo, custom fields, aur automated Smart Remarks conditions customize karta hai.',
      keywords: ['designer', 'logo', 'template', 'remarks', 'smart', 'customize', 'layout', 'header'],
      steps: [
        '**Admin Panel** -> **Report Card Designer** tab par jayein.',
        'Logo toggle, Header Address, aur **Smart Remarks Rules** configure karein.',
        '**Save Designer Settings** click karein.'
      ],
      notes: ['Smart Remarks rules percentage bracket ke according intelligent comments assign karti hain.']
    },
    {
      id: 'tt-auto',
      category: 'timetable',
      title: 'Automatic Timetable Solver (Fill Empty Slots vs Complete Reset)',
      description: '3-Step intelligent constraint solver se bina teacher conflict ke school timetable generate karta hai.',
      keywords: ['timetable', 'table', 'schedule', 'auto', 'generate', 'solver', 'bnaye', 'banaye', 'make', 'create', 'routine'],
      steps: [
        'Left menu se **Timetable** page par jayein.',
        'Header par purple **Auto-Generate Draft** button click karein.',
        '**Fill Empty Slots Only** ya **Reset & Re-generate All** select karke **Generate Timetable** click karein.'
      ],
      notes: ['Conflict detection engine double-booking roktam karta hai.']
    },
    {
      id: 'tt-edit',
      category: 'timetable',
      title: 'Timetable Grid Manual Editing & Assigning',
      description: 'Specific class period ya teacher slot me subject aur teacher change karne ke liye.',
      keywords: ['manual', 'edit', 'assign', 'slot', 'period', 'change', 'grid'],
      steps: [
        '**Class View** cell click karein ya **Teacher View** me **[+ Assign]** click karein.',
        'Subject aur Teacher select karke **Save Assignment** click karein.',
        'Main header se **Save Timetable** press karein.'
      ],
      notes: ['Unsaved changes yellow dashed border se highlight hote hain.']
    },
    {
      id: 'tt-myschedule',
      category: 'timetable',
      title: 'Teacher Portal - "My Schedule" View',
      description: 'Logged-in teacher ko unka daily aur weekly teaching schedule direct dikhata hai.',
      keywords: ['teacher', 'schedule', 'my schedule', 'routine', 'classes', 'my'],
      steps: [
        'Teacher login karke Dashboard ya **Timetable** page par jayein.',
        '**My Schedule** tab par click karein.',
        'Logged-in teacher ko sirf unke assigned periods ki matrix list dikhegi.'
      ],
      notes: ['Teacher view direct master timetable store se sync hota hai.']
    },
    {
      id: 'notice-pub',
      category: 'notice',
      title: 'School Notice Board Par Notice Publish Karna',
      description: 'Important circulars, event alerts aur holiday notices publish karta hai.',
      keywords: ['notice', 'board', 'publish', 'circular', 'announcement', 'alert', 'news'],
      steps: [
        '**Admin Panel** -> **Notice Board** tab par jayein.',
        '**Create Notice** button click karein.',
        'Title, Content, Priority fill karke status **Published** select karein.'
      ],
      notes: ['High Priority notices top alert banner ke roop me float hoti hain.']
    },
    {
      id: 'notice-aud',
      category: 'notice',
      title: 'Notice Audience Targeting (Everyone / Teachers / Students)',
      description: 'Notice ki visibility select karne ki azadi deta hai ki kiske dashboard par notice dikhega.',
      keywords: ['audience', 'target', 'everyone', 'teacher', 'student', 'visibility', 'leakage', 'kiske'],
      steps: [
        'Notice creation modal me **Target Audience** checkboxes select karein (**Everyone**, **Teachers**, **Students**).',
        '**Publish Notice** click karein.'
      ],
      notes: ['Student-only notices Teacher dashboard par visible nahi hoti hain.']
    },
    {
      id: 'staff-gps',
      category: 'staff',
      title: 'Staff Mobile GPS Location Punch In & Punch Out',
      description: 'Mobile device GPS location verify karke school campus boundary ke andar teacher attendance mark karta hai.',
      keywords: ['gps', 'punch', 'staff', 'location', 'in', 'out', 'campus', 'geofence', 'mobile'],
      steps: [
        'Staff member dashboard open karein.',
        'Subah aane par green **Punch In** click karein aur Location permission **Allow** karein.',
        'Successful check-in (within 200m) par time save ho jayega. Sham ko **Punch Out** click karein.'
      ],
      notes: ['200m boundary check fail hone par alert aata hai.']
    },
    {
      id: 'staff-correction',
      category: 'staff',
      title: 'GPS Location Error & Manual Correction Request',
      description: 'Location permission deny hone ya desktop me GPS na hone par attendance issue resolve karne ke liye.',
      keywords: ['correction', 'request', 'permission', 'gps error', 'denied', 'manual punch', 'reason'],
      steps: [
        'Punch panel ke niche **Submit Correction Request** link click karein.',
        'Punch In/Out Time aur Reason fill karke submit karein.',
        'Admin -> **Staff Attendance Logs** tab me Admin Approve/Reject karega.'
      ],
      notes: ['Manual correction requests ka proper audit trail rehta hai.']
    }
  ];

  // STEP 2: Normalize input & Score matching function
  function normalizeText(text) {
    if (!text) return '';
    var str = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    var replacements = [
      [/\battandence\b|\batendance\b|\bhaziri\b|\bhaazri\b|\battendence\b/g, 'attendance'],
      [/\brecipt\b|\breciept\b|\bbill\b|\bslip\b/g, 'receipt'],
      [/\bstudnt\b|\bstudent\b/g, 'student'],
      [/\bmsg\b|\bmessge\b|\bmsges\b/g, 'message'],
      [/\bbnaye\b|\bbanae\b|\bbanao\b|\bmake\b|\bcreate\b/g, 'bnaye'],
      [/\bbheje\b|\bbhej\b|\bsend\b/g, 'bheje'],
      [/\bbaccho\b|\bbacho\b|\bbachon\b|\bkids\b/g, 'bacho'],
      [/\bkre\b|\bkare\b|\bkaro\b/g, 'kre'],
      [/\bniklega\b|\bnikale\b|\bdownload\b/g, 'niklega'],
      [/\breportcard\b/g, 'report card']
    ];

    replacements.forEach(function(r) {
      str = str.replace(r[0], r[1]);
    });

    return str;
  }

  function scoreTopics(query) {
    var norm = normalizeText(query);
    if (!norm) return [];

    var tokens = norm.split(' ').filter(function(t) { return t.length > 1; });

    var scores = TOPICS.map(function(topic) {
      var score = 0;
      var matchedKeywords = [];

      // Phrase matches
      if (norm.indexOf('fee receipt') !== -1 && (topic.id === 'fee-receipt' || topic.id === 'fee-whatsapp')) {
        score += 2;
      }
      if (norm.indexOf('report card') !== -1 && (topic.id === 'exam-reportcard' || topic.id === 'exam-designer')) {
        score += 2;
      }
      if (norm.indexOf('absent') !== -1 && (norm.indexOf('msg') !== -1 || norm.indexOf('bheje') !== -1 || norm.indexOf('message') !== -1) && topic.id === 'att-intimation') {
        score += 3;
      }

      tokens.forEach(function(token) {
        if (topic.keywords.indexOf(token) !== -1) {
          if (matchedKeywords.indexOf(token) === -1) {
            matchedKeywords.push(token);
            score += 1;
          }
        } else {
          topic.keywords.forEach(function(kw) {
            if (kw.length >= 4 && (token.indexOf(kw) !== -1 || kw.indexOf(token) !== -1)) {
              if (matchedKeywords.indexOf(kw) === -1) {
                matchedKeywords.push(kw);
                score += 1;
              }
            }
          });
        }
      });

      return {
        topic: topic,
        score: score,
        matchedKeywords: matchedKeywords
      };
    });

    scores.sort(function(a, b) { return b.score - a.score; });
    return scores;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function init() {
    createChatbotDOM();
    attachEvents();
  }

  function createChatbotDOM() {
    var layout = document.getElementById('app-layout');
    if (!layout) return;

    chatbotContainer = document.createElement('div');
    chatbotContainer.id = 'svm-chatbot-widget';
    chatbotContainer.className = 'svm-chatbot-widget';
    chatbotContainer.innerHTML = `
      <!-- Floating Action Button -->
      <button id="chatbot-toggle-btn" class="chatbot-toggle-btn" title="Open ERP Support Chat">
        <span class="material-icons-round">support_agent</span>
      </button>

      <!-- Chat Window -->
      <div id="chatbot-window" class="chatbot-window hidden">
        <div class="chatbot-header">
          <div class="chatbot-header-info">
            <span class="material-icons-round header-icon">support_agent</span>
            <div>
              <h4 class="chatbot-header-title">SVM ERP Smart Support</h4>
              <p class="chatbot-header-status"><span class="status-dot"></span> Online Assistant</p>
            </div>
          </div>
          <button id="chatbot-close-btn" class="chatbot-close-btn" title="Close Chat">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <div id="chatbot-messages" class="chatbot-messages">
          <div class="chatbot-message bot-message">
            <p style="margin: 0 0 12px 0;">Namaste! 🙏 Main Shishu Vikash Mandir ERP Support Assistant hoon. Aap Mujhse Fees, Attendance, Timetable, Exams ya Report Card ke baare me kuch bhi pooch sakte hain:</p>
            <div class="chatbot-options" style="display: flex; flex-direction: column; gap: 6px;">
              <button class="chatbot-opt-btn" data-action="cat:fees">
                <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">payments</span> Fees & Receipt Guides
              </button>
              <button class="chatbot-opt-btn" data-action="cat:attendance">
                <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">fact_check</span> Attendance & WhatsApp Alerts
              </button>
              <button class="chatbot-opt-btn" data-action="cat:exams">
                <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">description</span> Exams & Report Cards
              </button>
              <button class="chatbot-opt-btn" data-action="cat:timetable">
                <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">event</span> Timetable & Schedules
              </button>
            </div>
          </div>
        </div>
        <div class="chatbot-input-area">
          <input type="text" id="chatbot-input" class="chatbot-input" placeholder="Poochhein (e.g. fee receipt, report card)..." autocomplete="off">
          <button id="chatbot-send-btn" class="chatbot-send-btn" title="Send Message">
            <span class="material-icons-round">send</span>
          </button>
        </div>
      </div>
    `;
    layout.appendChild(chatbotContainer);
  }

  function attachEvents() {
    var toggleBtn = document.getElementById('chatbot-toggle-btn');
    var closeBtn = document.getElementById('chatbot-close-btn');
    var sendBtn = document.getElementById('chatbot-send-btn');
    var inputField = document.getElementById('chatbot-input');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleChatbot);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', toggleChatbot);
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', handleSendMessage);
    }
    if (inputField) {
      inputField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          handleSendMessage();
        }
      });
    }

    var messagesContainer = document.getElementById('chatbot-messages');
    if (messagesContainer) {
      messagesContainer.addEventListener('click', function(e) {
        var btn = e.target.closest('.chatbot-opt-btn');
        if (btn) {
          var action = btn.getAttribute('data-action');
          handleOptionClick(action);
        }
      });
    }
  }

  function toggleChatbot() {
    var chatWindow = document.getElementById('chatbot-window');
    if (!chatWindow) return;
    chatbotOpen = !chatbotOpen;
    if (chatbotOpen) {
      chatWindow.classList.remove('hidden');
      document.getElementById('chatbot-input').focus();
    } else {
      chatWindow.classList.add('hidden');
    }
  }

  function appendMessage(text, sender) {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-message ' + sender + '-message';
    msgDiv.textContent = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showTypingIndicator() {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var loaderDiv = document.createElement('div');
    loaderDiv.id = 'chatbot-typing-indicator';
    loaderDiv.className = 'chatbot-message bot-message typing-indicator';
    loaderDiv.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
    `;
    messagesContainer.appendChild(loaderDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function removeTypingIndicator() {
    var loaderDiv = document.getElementById('chatbot-typing-indicator');
    if (loaderDiv) {
      loaderDiv.remove();
    }
  }

  function handleSendMessage() {
    var inputField = document.getElementById('chatbot-input');
    if (!inputField) return;

    var text = inputField.value.trim();
    if (!text) return;

    inputField.value = '';
    appendMessage(text, 'user');
    showTypingIndicator();

    setTimeout(function() {
      removeTypingIndicator();
      processBotResponse(text);
    }, 400);
  }

  // STEP 3: Response logic based on fuzzy score
  function processBotResponse(query) {
    var scored = scoreTopics(query);
    var topMatch = scored[0];

    if (topMatch && topMatch.score >= 2) {
      // Confident match (score >= 2) -> direct answer
      appendBotTopicGuide(topMatch.topic);
    } else if (topMatch && topMatch.score === 1) {
      // Weak match (score === 1) -> show top 3 suggestions
      var suggestions = scored.filter(function(s) { return s.score >= 1; }).slice(0, 3).map(function(s) { return s.topic; });
      appendBotSuggestions(suggestions, 'Aapke sawal ke aadhar par ye guides madad kar sakti hain:');
    } else {
      // No match (score === 0) -> generic fallback with common topics
      appendBotFallbackResponse();
    }
  }

  function appendBotTopicGuide(topic) {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-message bot-message';
    
    var html = '';
    html += '<h5 style="margin: 0 0 6px 0; font-size: 13.5px; font-weight: 700; color: var(--accent-primary-light);">' + escapeHTML(topic.title) + '</h5>';
    html += '<p style="margin: 0 0 10px 0; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">' + escapeHTML(topic.description) + '</p>';

    if (topic.steps && topic.steps.length > 0) {
      html += '<div style="font-size: 11.5px; font-weight: 700; color: var(--accent-secondary); margin-bottom: 4px;">Kaise Use Karein:</div>';
      html += '<div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">';
      topic.steps.forEach(function(step, idx) {
        var formatted = escapeHTML(step).replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--accent-primary-light);">$1</strong>');
        html += '  <div style="font-size: 12px; color: var(--text-primary); line-height: 1.4;"><span style="color: var(--accent-primary); font-weight:700;">' + (idx + 1) + '.</span> ' + formatted + '</div>';
      });
      html += '</div>';
    }

    if (topic.notes && topic.notes.length > 0) {
      html += '<div style="padding: 8px 10px; background: rgba(255, 193, 7, 0.08); border-left: 3px solid var(--warning); border-radius: 4px; margin-bottom: 10px;">';
      html += '  <strong style="color: var(--warning); font-size: 11px; display: block; margin-bottom: 2px;">Zaroori Baatein:</strong>';
      topic.notes.forEach(function(note) {
        html += '  <div style="font-size: 11.5px; color: var(--text-secondary); line-height: 1.3;">• ' + escapeHTML(note) + '</div>';
      });
      html += '</div>';
    }

    html += '<div style="display: flex; gap: 6px; margin-top: 8px;">';
    html += '  <button class="chatbot-opt-btn" data-action="cat:' + topic.category + '" style="flex:1;">';
    html += '    <span class="material-icons-round" style="font-size: 14px;">open_in_new</span> Help Center me Dekhein';
    html += '  </button>';
    html += '</div>';

    msgDiv.innerHTML = html;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function appendBotSuggestions(suggestedTopics, introText) {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-message bot-message';

    var html = '';
    html += '<p style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary); line-height: 1.4;">' + escapeHTML(introText) + '</p>';
    html += '<div class="chatbot-options" style="display: flex; flex-direction: column; gap: 6px;">';
    suggestedTopics.forEach(function(topic) {
      html += '  <button class="chatbot-opt-btn" data-action="topic:' + topic.id + '" style="text-align: left;">';
      html += '    <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">help_outline</span> ' + escapeHTML(topic.title);
      html += '  </button>';
    });
    html += '</div>';

    msgDiv.innerHTML = html;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function appendBotFallbackResponse() {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-message bot-message';
    msgDiv.innerHTML = `
      <p style="margin: 0 0 10px 0; font-size: 12.5px; line-height: 1.4;">Maaf kijiye, main aapka sawal poori tarah samajh nahi paya. Kripya niche diye gaye common topics me se chunnein ya Technical Support se sampark karein:</p>
      <div class="chatbot-options" style="display: flex; flex-direction: column; gap: 6px;">
        <button class="chatbot-opt-btn" data-action="cat:fees">
          <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">payments</span> Fees & Receipt Guides
        </button>
        <button class="chatbot-opt-btn" data-action="cat:attendance">
          <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">fact_check</span> Attendance & WhatsApp Alerts
        </button>
        <button class="chatbot-opt-btn" data-action="cat:exams">
          <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">description</span> Exams & Report Cards
        </button>
        <button class="chatbot-opt-btn" data-action="cat:timetable">
          <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">event</span> Timetable & Schedules
        </button>
        <button class="chatbot-opt-btn" data-action="contact-dev">
          <span class="material-icons-round" style="font-size: 15px; color: var(--accent-secondary)">support_agent</span> Contact Technical Support
        </button>
      </div>
    `;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function handleOptionClick(action) {
    if (!action) return;

    if (action.indexOf('topic:') === 0) {
      var topicId = action.split(':')[1];
      var foundTopic = TOPICS.find(function(t) { return t.id === topicId; });
      if (foundTopic) {
        appendBotTopicGuide(foundTopic);
      }
    } else if (action.indexOf('cat:') === 0) {
      var cat = action.split(':')[1];
      if (window.SchoolApp && window.SchoolApp.modules.help) {
        window.SchoolApp.modules.help.selectCategory(cat);
        toggleChatbot();
      }
    } else if (action === 'fee-help') {
      if (window.SchoolApp && window.SchoolApp.modules.help) {
        window.SchoolApp.modules.help.selectCategory('fees');
        toggleChatbot();
      }
    } else if (action === 'attendance-help') {
      if (window.SchoolApp && window.SchoolApp.modules.help) {
        window.SchoolApp.modules.help.selectCategory('attendance');
        toggleChatbot();
      }
    } else if (action === 'contact-dev') {
      if (window.SchoolApp && window.SchoolApp.modules.help) {
        window.SchoolApp.modules.help.openContactModal();
        toggleChatbot();
      }
    }
  }

  window.addEventListener('DOMContentLoaded', init);

})();
