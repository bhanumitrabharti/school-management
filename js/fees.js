'use strict';

/* ============================================================
   Shishu Vikash Mandir - Fee Management Module
   ============================================================ */

(function() {

  var state = {
    searchQuery: '',
    classFilter: 'all',
    sectionFilter: 'all',
    statusFilter: 'all', // 'all' | 'unpaid' | 'paid'
    currentPage: 1,
    perPage: 10,
    activeTab: 'students', // 'students' | 'history' | 'ledger'
    historyClassFilter: 'all',
    historyTypeFilter: 'all',
    historySearchQuery: '',
    historyStartDate: '',
    historyEndDate: '',
    historyCurrentPage: 1,
    ledgerSearchQuery: ''
  };

  function calculateFeeLedgerStats() {
    var fees = SchoolApp.store.fees || [];
    var now = new Date();
    var todayStr = now.toISOString().split('T')[0];
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();

    var todaysCollection = 0;
    var mtdCollection = 0;
    var cashInHand = 0;
    var todayTransactions = [];

    fees.forEach(function(f) {
      if (f.type === 'payment') {
        var amt = parseFloat(f.amount || 0);
        var fDateStr = f.date ? f.date.split('T')[0] : '';
        var dateParts = fDateStr.split('-');
        var fYear = dateParts.length === 3 ? parseInt(dateParts[0], 10) : now.getFullYear();
        var fMonth = dateParts.length === 3 ? parseInt(dateParts[1], 10) - 1 : now.getMonth();

        if (fDateStr === todayStr) {
          todaysCollection += amt;
          todayTransactions.push(f);
          if ((f.mode || '').toLowerCase() === 'cash') {
            cashInHand += amt;
          }
        }

        if (fYear === currentYear && fMonth === currentMonth) {
          mtdCollection += amt;
        }
      }
    });

    return {
      todaysCollection: todaysCollection,
      mtdCollection: mtdCollection,
      cashInHand: cashInHand,
      todayTransactions: todayTransactions
    };
  }

  async function checkAndRunAutoCharge() {
    var settings = SchoolApp.store.settings || {};
    if (!settings.autoChargeEnabled) return;

    var triggerDay = parseInt(settings.autoChargeTriggerDate || 1, 10);
    var now = new Date();
    var currentDay = now.getDate();
    var currentMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    if (currentDay >= triggerDay && settings.autoChargeLastRun !== currentMonthKey) {
      var students = SchoolApp.store.students || [];
      if (!students.length) return;

      if (!SchoolApp.store.fees) SchoolApp.store.fees = [];
      if (!SchoolApp.store.feeActivityLog) SchoolApp.store.feeActivityLog = [];

      var chargedCount = 0;
      var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      var billingPeriod = "Auto Monthly Tuition - " + monthNames[now.getMonth()] + " " + now.getFullYear();
      var todayStr = now.toISOString().split('T')[0];

      var feeHeads = getActiveFeeHeads();
      var tuitionHead = null;

      if (settings.autoChargeFeeHeadId) {
        tuitionHead = feeHeads.find(function(fh) { return fh.id === settings.autoChargeFeeHeadId; });
      }

      if (!tuitionHead) {
        tuitionHead = feeHeads.find(function(fh) {
          return fh.name.toLowerCase().indexOf('tuition') !== -1 || fh.name.toLowerCase().indexOf('monthly') !== -1;
        });
      }

      if (!tuitionHead) {
        console.warn('Auto Charge skipped: No tuition or monthly fee head configured.');
        return;
      }

      students.forEach(function(s) {
        var amt = getFeeAmount(s.class, tuitionHead.id);
        if (amt > 0) {
          SchoolApp.store.fees.push({
            id: SchoolApp.generateId(),
            studentId: s.id,
            schoolId: SchoolApp.currentSchoolId,
            type: 'due',
            feeHeadId: tuitionHead.id,
            amount: amt,
            date: todayStr,
            description: billingPeriod
          });
          chargedCount++;
        }
      });

      if (chargedCount > 0) {
        if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
        SchoolApp.store.settings.autoChargeLastRun = currentMonthKey;
        await SchoolApp.save();
        SchoolApp.showToast('Automated monthly fee generated for ' + chargedCount + ' students.', 'info');
      }
    }
  }

  function renderLedgerTab(dataContainer) {
    var stats = calculateFeeLedgerStats();
    var todayColl = document.getElementById('ledger-today-collection');
    if (todayColl) todayColl.textContent = '₹' + stats.todaysCollection.toLocaleString('en-IN');
    
    var mtdColl = document.getElementById('ledger-mtd-collection');
    if (mtdColl) mtdColl.textContent = '₹' + stats.mtdCollection.toLocaleString('en-IN');
    
    var cashHand = document.getElementById('ledger-cash-in-hand');
    if (cashHand) cashHand.textContent = '₹' + stats.cashInHand.toLocaleString('en-IN');

    var studentMap = {};
    (SchoolApp.store.students || []).forEach(function(s) {
      studentMap[s.id] = s;
    });

    var transactions = stats.todayTransactions;
    if (state.ledgerSearchQuery) {
      var q = state.ledgerSearchQuery.toLowerCase();
      transactions = transactions.filter(function(t) {
        var st = studentMap[t.studentId];
        var name = st ? (st.firstName + ' ' + st.lastName).toLowerCase() : '';
        return name.indexOf(q) !== -1 || (t.mode || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    var html = '';
    if (transactions.length === 0) {
      html += '<div class="empty-state" style="padding: 40px; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); margin-top: 16px; border: 1px dashed var(--border-color);">';
      html += '<span class="material-icons-round" style="font-size: 48px; color: var(--text-tertiary); margin-bottom: 12px;">receipt_long</span>';
      html += '<h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">No transactions today</h3>';
      html += '<p style="color: var(--text-secondary); font-size: 14px;">There are no fee payments recorded for today yet.</p>';
      html += '</div>';
    } else {
      html += '<div class="table-container" style="margin-top:16px;"><table class="data-table"><thead><tr>';
      html += '<th>Student Name</th><th>Class & Sec</th><th>Amount Paid</th><th>Payment Mode</th><th>Date & Time</th><th>Receipt / Tx ID</th>';
      html += '</tr></thead><tbody>';

      transactions.forEach(function(t) {
        var st = studentMap[t.studentId];
        var name = st ? escapeHTML(st.firstName + ' ' + st.lastName) : 'Unknown Student';
        var cls = st ? (st.class + '-' + st.section) : '—';
        var amt = parseFloat(t.amount || 0);
        var dt = t.date ? new Date(t.date).toLocaleString('en-IN') : '—';

        html += '<tr>';
        html += '<td><strong style="color:var(--accent-primary);">' + name + '</strong></td>';
        html += '<td><span class="badge badge-info">' + cls + '</span></td>';
        html += '<td><strong style="color:var(--success);">₹' + amt.toLocaleString('en-IN') + '</strong></td>';
        html += '<td><span class="badge badge-secondary">' + (t.mode || 'Cash') + '</span></td>';
        html += '<td>' + dt + '</td>';
        html += '<td><code>' + (t.id ? t.id.substring(0, 8) : '—') + '</code></td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    }

    dataContainer.innerHTML = html;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getFeeAmount(className, feeHeadId) {
    var key = feeHeadId;
    if (feeHeadId === 'fh_tuition') key = 'tuition';
    else if (feeHeadId === 'fh_transport') key = 'transport';
    else if (feeHeadId === 'fh_exam') key = 'exam';
    else if (feeHeadId === 'fh_fine') key = 'fine';
    else if (feeHeadId === 'fh_annual') key = 'annual';
    
    if (key.startsWith('fh_')) {
      key = key.replace('fh_', '');
    }

    var settings = SchoolApp.store.settings;
    if (settings && settings.feeStructure && settings.feeStructure[className]) {
      var clsFees = settings.feeStructure[className];
      var val = clsFees[feeHeadId] !== undefined ? clsFees[feeHeadId] : (clsFees[key] !== undefined ? clsFees[key] : clsFees['fh_' + key]);
      if (val !== undefined && val !== null) {
        return parseFloat(val);
      }
    }

    var oldStructures = SchoolApp.store.feeStructures;
    if (oldStructures && oldStructures[className]) {
      var oldVal = oldStructures[className][feeHeadId] || oldStructures[className][key];
      if (oldVal !== undefined && oldVal !== null) {
        return parseFloat(oldVal);
      }
    }

    return 0;
  }

  function getActiveFeeHeads() {
    var settings = SchoolApp.store.settings || {};
    var heads = JSON.parse(JSON.stringify(settings.feeHeads || SchoolApp.store.feeHeads || []));
    if (settings && settings.feeStructure) {
      var keys = new Set();
      Object.values(settings.feeStructure).forEach(function(clsFees) {
        Object.keys(clsFees).forEach(function(k) {
          keys.add(k);
        });
      });
      
      keys.forEach(function(k) {
        var headId = k;
        if (k === 'tuition') headId = 'fh_tuition';
        else if (k === 'transport') headId = 'fh_transport';
        else if (k === 'exam') headId = 'fh_exam';
        else if (k === 'fine') headId = 'fh_fine';
        else if (k === 'annual') headId = 'fh_annual';
        else {
          headId = 'fh_' + k;
        }

        var exists = heads.some(function(h) { return h.id === headId || h.name.toLowerCase() === k.toLowerCase(); });
        if (!exists) {
          heads.push({
            id: headId,
            name: k.charAt(0).toUpperCase() + k.slice(1)
          });
        }
      });
    }
    return heads;
  }

  function getStudentParentPhone(student) {
    if (!student) return '';
    var raw = student.parentPhone || student.parentMobile || student.fatherMobile || student.motherMobile || student.phone || student.contactNumber || '';
    return String(raw).replace(/\D/g, '');
  }

  function getUncoveredTuitionMonths(tuitionCharges, payments, totalPaid, totalCharged) {
    if (!tuitionCharges || !tuitionCharges.length) return '';
    
    var sorted = tuitionCharges.slice().sort(function(a, b) {
      return new Date(a.date) - new Date(b.date);
    });
    
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    
    var labels = [];
    sorted.forEach(function(d) {
      if (!d.date) return;
      var dt = new Date(d.date);
      if (isNaN(dt.getTime())) return;
      var lbl = monthNames[dt.getMonth()] + ' ' + dt.getFullYear();
      if (labels.indexOf(lbl) === -1) {
        labels.push(lbl);
      }
    });

    if (labels.length === 0) return '';
    if (labels.length === 1 || labels[0] === labels[labels.length - 1]) return labels[0];
    return labels[0] + ' – ' + labels[labels.length - 1];
  }

  function calculateMonthsOverdue(dues, payments) {
    var tuitionDues = (dues || []).filter(function(d) {
      return d.feeHeadId === 'fh_tuition';
    }).sort(function(a, b) {
      return new Date(a.date) - new Date(b.date);
    });
    
    if (!tuitionDues.length) return 0;
    
    var totalTuitionCharged = tuitionDues.reduce(function(sum, d) {
      return sum + (Number(d.amount) || 0);
    }, 0);
    var totalPaid = (payments || []).reduce(function(sum, p) {
      return sum + (Number(p.amount) || 0);
    }, 0);
    
    // If fully paid or overpaid, 0 months overdue
    if (totalPaid >= totalTuitionCharged) return 0;
    
    var remaining = totalTuitionCharged - totalPaid;
    var avgMonthlyCharge = totalTuitionCharged / tuitionDues.length;
    if (avgMonthlyCharge <= 0) return 0;
    var monthsUncovered = Math.floor(remaining / avgMonthlyCharge);
    
    return monthsUncovered;
  }

  function formatDateDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    var clean = String(dateStr).split('T')[0];
    var parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return parts[2].padStart(2, '0') + '/' + parts[1].padStart(2, '0') + '/' + parts[0];
    }
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  function generateFeeStatement(studentId) {
    var sId = (studentId && typeof studentId === 'object') ? studentId.id : studentId;
    var student = (SchoolApp.store.students || []).find(function(s) { return s.id === sId; });
    if (!student) return null;

    if (!student.name) {
      student.name = SchoolApp.getStudentFullName ? SchoolApp.getStudentFullName(student) : ((student.firstName + ' ' + (student.lastName || '')).trim());
    }

    var allRecords = (SchoolApp.store.fees || []).filter(function(f) {
      return f.studentId === sId;
    });

    var dues = allRecords.filter(function(f) { return f.type === 'due'; });
    var payments = allRecords.filter(function(f) { return f.type === 'payment'; });

    var totalCharged = dues.reduce(function(sum, d) { return sum + (Number(d.amount) || 0); }, 0);
    var totalPaid = payments.reduce(function(sum, p) { return sum + (Number(p.amount) || 0); }, 0);
    var netDue = totalCharged - totalPaid;

    // Current month charges (itemized by fee head)
    var today = new Date();
    var currentMonthStart = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-01';

    var currentMonthCharges = dues.filter(function(d) { return d.date >= currentMonthStart; });
    var priorCharges = dues.filter(function(d) { return d.date < currentMonthStart; });

    var priorChargesTotal = priorCharges.reduce(function(sum, d) { return sum + (Number(d.amount) || 0); }, 0);

    // Group current month charges by fee head
    var feeHeadsList = getActiveFeeHeads();
    var currentMonthGrouped = {};
    currentMonthCharges.forEach(function(d) {
      var fh = feeHeadsList.find(function(h) { return h.id === d.feeHeadId; });
      var headName = fh ? fh.name : (d.description || 'Custom Charge');
      if (!currentMonthGrouped[headName]) currentMonthGrouped[headName] = 0;
      currentMonthGrouped[headName] += Number(d.amount) || 0;
    });

    // Tuition month(s) covered — derive from tuition due record dates
    var tuitionCharges = dues.filter(function(d) { return d.feeHeadId === 'fh_tuition'; });
    var tuitionMonths = getUncoveredTuitionMonths(tuitionCharges, payments, totalPaid, totalCharged);

    // Last payment date
    var sortedPayments = payments.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    var lastPaymentDate = sortedPayments.length > 0 ? sortedPayments[0].date : null;

    // Months overdue (for late fine note)
    var monthsOverdue = calculateMonthsOverdue(dues, payments);

    return {
      student: student,
      rollNumber: student.rollNumber || student.rollNo || '',
      currentMonthGrouped: currentMonthGrouped,
      currentMonthTotal: Object.values(currentMonthGrouped).reduce(function(a, b) { return a + b; }, 0),
      priorChargesTotal: priorChargesTotal,
      totalCharged: totalCharged,
      totalDues: totalCharged,
      totalPaid: totalPaid,
      netDue: netDue,
      outstanding: netDue,
      lastPaymentDate: lastPaymentDate,
      monthsOverdue: monthsOverdue,
      tuitionMonths: tuitionMonths
    };
  }

  function getStudentFeeStats(studentId) {
    var stmt = generateFeeStatement(studentId);
    if (!stmt) {
      return { totalDues: 0, totalPaid: 0, outstanding: 0 };
    }
    return {
      totalDues: stmt.totalCharged,
      totalPaid: stmt.totalPaid,
      outstanding: stmt.netDue
    };
  }

  function buildFeeReminderMessage(statement, schoolSettings) {
    var s = statement;
    var schoolName = (schoolSettings && (schoolSettings.schoolName || (schoolSettings.schoolInfo && schoolSettings.schoolInfo.name))) || 'School';
    var upiId = (schoolSettings && (schoolSettings.upiId || (schoolSettings.schoolInfo && schoolSettings.schoolInfo.upiId))) ? String(schoolSettings.upiId || schoolSettings.schoolInfo.upiId).trim() : '';

    var studentName = s.student.name || (SchoolApp.getStudentFullName ? SchoolApp.getStudentFullName(s.student) : ((s.student.firstName + ' ' + (s.student.lastName || '')).trim()));

    var msg = '*Fee Reminder — ' + studentName + '*\n';
    msg += 'Class: ' + s.student.class + 
      (s.student.section ? ' / Sec: ' + s.student.section : '') + 
      ' | Roll No: ' + (s.rollNumber || '-') + '\n\n';
    
    // Itemized current month charges
    var groupedKeys = Object.keys(s.currentMonthGrouped || {});
    if (groupedKeys.length > 0) {
      msg += '*Is Mahine Ke Charges:*\n';
      groupedKeys.forEach(function(head) {
        var label = head;
        if ((head === 'Tuition Fee' || head.toLowerCase().indexOf('tuition') !== -1) && s.tuitionMonths) {
          label = head + ' (' + s.tuitionMonths + ')';
        }
        msg += '• ' + label + ': ₹' + s.currentMonthGrouped[head] + '\n';
      });
      msg += 'Is Mahine Ka Total: ₹' + s.currentMonthTotal + '\n\n';
    }
    
    if (s.priorChargesTotal > 0) {
      msg += 'Pichla Baaki: ₹' + s.priorChargesTotal + '\n';
    }
    
    msg += 'Total Paid Till Date: ₹' + s.totalPaid + '\n';
    
    if (s.lastPaymentDate) {
      msg += 'Last Payment: ' + formatDateDDMMYYYY(s.lastPaymentDate) + '\n';
    }
    
    msg += '\n*Total Due: ₹' + s.netDue + '*\n';
    
    if (upiId) {
      msg += '\nPayment ke liye UPI: ' + upiId + '\n';
    }
    
    if (s.monthsOverdue >= 3) {
      msg += '\n_Note: 3 mahine se zyada baaki hone par ₹20/mahina late fine lagu ho sakta hai._\n';
    }
    
    msg += '\n- ' + schoolName;
    
    return msg;
  }

  function buildFeeReminderSMS(statement, schoolSettings) {
    var s = statement;
    var studentName = s.student.name || (SchoolApp.getStudentFullName ? SchoolApp.getStudentFullName(s.student) : ((s.student.firstName + ' ' + (s.student.lastName || '')).trim()));
    var schoolName = (schoolSettings && (schoolSettings.schoolName || (schoolSettings.schoolInfo && schoolSettings.schoolInfo.name))) || 'School';
    var upiId = (schoolSettings && (schoolSettings.upiId || (schoolSettings.schoolInfo && schoolSettings.schoolInfo.upiId))) ? String(schoolSettings.upiId || schoolSettings.schoolInfo.upiId).trim() : '';

    return studentName + 
      ' (Class ' + s.student.class + 
      ') — Fee Due: ₹' + s.netDue + 
      '. ' + 
      (upiId ? 'UPI: ' + upiId + '. ' : '') +
      '- ' + schoolName;
  }

  function logFeeReminder(studentId, channel, status) {
    if (!SchoolApp.store.feeReminderLog) {
      SchoolApp.store.feeReminderLog = [];
    }
    SchoolApp.store.feeReminderLog.push({
      studentId: studentId,
      date: new Date().toISOString().split('T')[0],
      channel: channel,
      status: status,
      sentBy: (SchoolApp.currentUser && SchoolApp.currentUser.username) || 'unknown',
      sentAt: new Date().toISOString()
    });
    SchoolApp.save(true);
  }

  async function sendFeeSMS(phone, message, studentId, studentName) {
    var apiKey = SchoolApp.store.settings && SchoolApp.store.settings.fast2smsApiKey;
    if (!apiKey) {
      SchoolApp.showToast('SMS not configured. Please enter Fast2SMS API key in School Settings.', 'error');
      return false;
    }

    if (!phone || phone.length < 10) {
      SchoolApp.showToast('No valid 10-digit mobile number found for ' + studentName, 'error');
      return false;
    }

    try {
      SchoolApp.showToast('Sending SMS to parent of ' + studentName + '...', 'info');
      var response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'q',
          message: message,
          language: 'english',
          flash: 0,
          numbers: phone
        })
      });
      var result = await response.json();
      var isSent = result && result.return === true;
      if (isSent) {
        SchoolApp.showToast('SMS sent successfully for ' + studentName, 'success');
        logFeeReminder(studentId, 'sms', 'sent');
        return true;
      } else {
        SchoolApp.showToast('SMS failed: ' + (result.message || 'API error'), 'error');
        logFeeReminder(studentId, 'sms', 'failed');
        return false;
      }
    } catch (e) {
      SchoolApp.showToast('SMS dispatch error for ' + studentName, 'error');
      logFeeReminder(studentId, 'sms', 'failed');
      return false;
    }
  }

  function showFeeReminderPreviewModal(studentId) {
    var stmt = generateFeeStatement(studentId);
    if (!stmt) {
      SchoolApp.showToast('Student fee record not found.', 'error');
      return;
    }

    if (stmt.netDue <= 0) {
      SchoolApp.showToast('This student has no outstanding dues.', 'info');
      return;
    }

    var s = stmt.student;
    var sName = s.name || (SchoolApp.getStudentFullName ? SchoolApp.getStudentFullName(s) : (s.firstName + ' ' + (s.lastName || '')).trim());
    var parentPhone = getStudentParentPhone(s);
    var settings = SchoolApp.store.settings || {};
    var hasSMS = Boolean(settings.fast2smsApiKey && settings.fast2smsApiKey.trim() !== '');
    var defaultMsg = buildFeeReminderMessage(stmt, settings);
    var defaultSMS = buildFeeReminderSMS(stmt, settings);

    var bodyHTML = '<div class="fee-reminder-preview-view">';
    
    // Student summary header card
    bodyHTML += '<div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">';
    bodyHTML += '<div>';
    bodyHTML += '<h4 style="margin:0 0 4px 0; font-size:15px; color:var(--text-primary);">' + escapeHTML(sName) + '</h4>';
    bodyHTML += '<span style="font-size:12.5px; color:var(--text-secondary);">Class: ' + escapeHTML(s.class) + (s.section ? ' - ' + escapeHTML(s.section) : '') + ' · Roll: ' + escapeHTML(stmt.rollNumber || '—') + '</span>';
    bodyHTML += '</div>';
    bodyHTML += '<div style="text-align:right;">';
    bodyHTML += '<div style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Parent Phone</div>';
    bodyHTML += '<div style="font-size:13px; font-weight:600; color:' + (parentPhone.length >= 10 ? 'var(--text-primary)' : 'var(--danger)') + ';">' + (parentPhone.length >= 10 ? parentPhone : 'No valid 10-digit phone') + '</div>';
    bodyHTML += '</div>';
    bodyHTML += '</div>';

    // Message preview box & edit toggle
    bodyHTML += '<div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">';
    bodyHTML += '<label style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.3px;">WhatsApp Reminder Message</label>';
    bodyHTML += '<button type="button" class="btn btn-sm btn-secondary" id="toggle-edit-reminder-btn" style="padding:2px 8px; font-size:11px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:13px">edit</span> ✏️ Edit before sending</button>';
    bodyHTML += '</div>';

    bodyHTML += '<pre id="reminder-preview-box" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:12px; font-size:12.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word; max-height:220px; overflow-y:auto; margin:0 0 12px 0; color:var(--text-primary); font-family:inherit;">' + escapeHTML(defaultMsg) + '</pre>';

    bodyHTML += '<div id="reminder-edit-container" style="display:none; margin-bottom:12px;">';
    bodyHTML += '<textarea id="reminder-custom-textarea" class="form-textarea" style="width:100%; height:160px; font-family:inherit; font-size:12.5px; line-height:1.5; resize:vertical;">' + escapeHTML(defaultMsg) + '</textarea>';
    bodyHTML += '<small style="color:var(--text-muted); font-size:11px; display:block; margin-top:4px;">You can customize the WhatsApp text above prior to clicking "Send WhatsApp".</small>';
    bodyHTML += '</div>';

    // SMS preview info
    bodyHTML += '<div style="background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.18); border-radius:8px; padding:10px 12px; font-size:12px; color:var(--text-secondary);">';
    bodyHTML += '<div style="font-weight:600; color:var(--accent-primary); margin-bottom:3px; display:flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:15px">sms</span> SMS Preview (Fast2SMS route):</div>';
    bodyHTML += '<div style="font-style:italic;">"' + escapeHTML(defaultSMS) + '"</div>';
    if (!hasSMS) {
      bodyHTML += '<div style="color:var(--text-muted); font-size:11px; margin-top:4px;">⚠️ Fast2SMS API key is not configured in School Settings. SMS button is disabled.</div>';
    }
    bodyHTML += '</div>';

    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    
    if (hasSMS) {
      footerHTML += '<button class="btn btn-primary" id="preview-send-sms-btn" style="display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px">sms</span> 💬 Send SMS</button>';
    } else {
      footerHTML += '<button class="btn btn-secondary" id="preview-send-sms-btn" disabled title="SMS not configured in School Settings" style="opacity:0.5; cursor:not-allowed; display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px">sms</span> 💬 Send SMS</button>';
    }

    footerHTML += '<button class="btn btn-secondary" id="preview-send-wa-btn" style="background:#25D366; color:#fff; border:none; display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px">send</span> 📱 Send WhatsApp</button>';

    SchoolApp.showModal('Fee Reminder Preview — ' + escapeHTML(sName), bodyHTML, footerHTML);

    // Edit toggle logic
    var toggleBtn = document.getElementById('toggle-edit-reminder-btn');
    var previewBox = document.getElementById('reminder-preview-box');
    var editContainer = document.getElementById('reminder-edit-container');
    var editArea = document.getElementById('reminder-custom-textarea');

    var isEditing = false;
    if (toggleBtn && previewBox && editContainer && editArea) {
      toggleBtn.addEventListener('click', function() {
        isEditing = !isEditing;
        if (isEditing) {
          previewBox.style.display = 'none';
          editContainer.style.display = 'block';
          toggleBtn.innerHTML = '<span class="material-icons-round" style="font-size:13px">visibility</span> 👁️ View preview';
          editArea.focus();
        } else {
          previewBox.textContent = editArea.value;
          previewBox.style.display = 'block';
          editContainer.style.display = 'none';
          toggleBtn.innerHTML = '<span class="material-icons-round" style="font-size:13px">edit</span> ✏️ Edit before sending';
        }
      });
    }

    // WhatsApp send handler
    var waBtn = document.getElementById('preview-send-wa-btn');
    if (waBtn) {
      waBtn.addEventListener('click', function() {
        var finalMsg = (isEditing && editArea) ? editArea.value.trim() : (editArea ? editArea.value.trim() : defaultMsg);
        if (!parentPhone || parentPhone.length < 10) {
          SchoolApp.showToast('No valid 10-digit parent mobile number found for ' + sName, 'error');
          return;
        }
        var sent = SchoolApp.shareOnWhatsApp(parentPhone, finalMsg);
        if (sent) {
          logFeeReminder(s.id, 'whatsapp', 'sent');
          SchoolApp.closeModal();
        }
      });
    }

    // SMS send handler
    var smsBtn = document.getElementById('preview-send-sms-btn');
    if (smsBtn && hasSMS) {
      smsBtn.addEventListener('click', async function() {
        if (!parentPhone || parentPhone.length < 10) {
          SchoolApp.showToast('No valid 10-digit parent mobile number found for ' + sName, 'error');
          return;
        }
        var finalSMS = defaultSMS;
        smsBtn.disabled = true;
        smsBtn.textContent = 'Sending...';
        var ok = await sendFeeSMS(parentPhone, finalSMS, s.id, sName);
        smsBtn.disabled = false;
        smsBtn.innerHTML = '<span class="material-icons-round" style="font-size:16px">sms</span> 💬 Send SMS';
        if (ok) {
          SchoolApp.closeModal();
        }
      });
    }
  }

  function showBulkFeeRemindersModal() {
    var students = SchoolApp.store.students || [];
    var defaulters = [];

    students.forEach(function(s) {
      if (s.status === 'Inactive') return;
      var stmt = generateFeeStatement(s.id);
      if (stmt && stmt.netDue > 0) {
        defaulters.push({
          student: s,
          statement: stmt
        });
      }
    });

    if (defaulters.length === 0) {
      SchoolApp.showToast('No students with outstanding dues found.', 'info');
      return;
    }

    // Sort defaulters by class, then roll
    defaulters.sort(function(a, b) {
      if (a.student.class !== b.student.class) {
        return String(a.student.class).localeCompare(String(b.student.class), undefined, { numeric: true });
      }
      return (parseInt(a.statement.rollNumber, 10) || 0) - (parseInt(b.statement.rollNumber, 10) || 0);
    });

    var schoolSettings = SchoolApp.store.settings || {};
    var hasSMS = Boolean(schoolSettings.fast2smsApiKey && schoolSettings.fast2smsApiKey.trim() !== '');

    var bodyHTML = '<div class="bulk-reminders-modal-view">';

    bodyHTML += '<div style="background:rgba(37,211,102,0.08); border:1px solid rgba(37,211,102,0.25); padding:12px 16px; border-radius:8px; margin-bottom:16px; display:flex; align-items:center; gap:12px;">';
    bodyHTML += '<span class="material-icons-round" style="color:#25D366; font-size:28px;">campaign</span>';
    bodyHTML += '<div>';
    bodyHTML += '<h4 style="margin:0; color:var(--text-primary); font-size:15px;">📢 Bulk Fee Reminders Queue (' + defaulters.length + ' Students)</h4>';
    bodyHTML += '<p style="margin:2px 0 0 0; color:var(--text-secondary); font-size:12px;">Click to send WhatsApp or SMS one student at a time. WhatsApp Web will open with a pre-filled itemized statement.</p>';
    bodyHTML += '</div></div>';

    bodyHTML += '<div class="table-container" style="max-height:380px; overflow-y:auto;">';
    bodyHTML += '<table class="data-table"><thead><tr>';
    bodyHTML += '<th>Student</th><th>Class</th><th>Total Due</th><th>Parent Contact</th><th>Actions</th><th>Status</th>';
    bodyHTML += '</tr></thead><tbody>';

    defaulters.forEach(function(d) {
      var s = d.student;
      var stmt = d.statement;
      var sName = s.name || (SchoolApp.getStudentFullName ? SchoolApp.getStudentFullName(s) : (s.firstName + ' ' + (s.lastName || '')).trim());
      var phone = getStudentParentPhone(s);
      var displayPhone = (phone && phone.length >= 10) ? phone : '<span style="color:var(--danger)">No Phone</span>';

      bodyHTML += '<tr class="bulk-reminder-row-' + s.id + '">';
      bodyHTML += '<td><strong>' + escapeHTML(sName) + '</strong>' + (stmt.rollNumber ? '<br><span style="font-size:11px; color:var(--text-muted);">Roll: ' + escapeHTML(stmt.rollNumber) + '</span>' : '') + '</td>';
      bodyHTML += '<td><span class="badge badge-info">' + escapeHTML(s.class) + (s.section ? '-' + escapeHTML(s.section) : '') + '</span></td>';
      bodyHTML += '<td><strong style="color:var(--danger);">₹' + stmt.netDue.toLocaleString('en-IN') + '</strong></td>';
      bodyHTML += '<td style="font-size:12px;">' + displayPhone + '</td>';
      bodyHTML += '<td><div style="display:flex; gap:6px; align-items:center;">';
      bodyHTML += '<button class="btn btn-sm bulk-wa-btn" data-student-id="' + s.id + '" style="background:#25D366; color:#fff; border:none; padding:4px 10px; font-size:12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px">send</span> 📱 WhatsApp</button>';

      if (hasSMS) {
        bodyHTML += '<button class="btn btn-sm btn-primary bulk-sms-btn" data-student-id="' + s.id + '" style="padding:4px 10px; font-size:12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px">sms</span> 💬 SMS</button>';
      } else {
        bodyHTML += '<button class="btn btn-sm btn-secondary bulk-sms-btn" disabled title="SMS not configured in settings" style="padding:4px 10px; font-size:12px; opacity:0.5; cursor:not-allowed; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px">sms</span> 💬 SMS</button>';
      }

      bodyHTML += '</div></td>';
      bodyHTML += '<td><span class="status-badge status-badge-' + s.id + ' badge badge-secondary" style="font-size:11px;">⬜ Pending</span></td>';
      bodyHTML += '</tr>';
    });

    bodyHTML += '</tbody></table></div>';
    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';

    SchoolApp.showModal('📢 Send Bulk Fee Reminders', bodyHTML, footerHTML);

    // Wire row click events
    document.querySelectorAll('.bulk-wa-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sId = this.getAttribute('data-student-id');
        var item = defaulters.find(function(x) { return x.student.id === sId; });
        if (!item) return;

        var phone = getStudentParentPhone(item.student);
        var sName = item.student.name || (item.student.firstName + ' ' + (item.student.lastName || '')).trim();
        if (!phone || phone.length < 10) {
          SchoolApp.showToast('No valid 10-digit mobile number for ' + sName, 'error');
          return;
        }

        var msg = buildFeeReminderMessage(item.statement, SchoolApp.store.settings || {});
        var sent = SchoolApp.shareOnWhatsApp(phone, msg);
        if (sent) {
          var badge = document.querySelector('.status-badge-' + sId);
          if (badge) {
            badge.className = 'status-badge status-badge-' + sId + ' badge badge-success';
            badge.innerHTML = '✅ WhatsApp Sent';
          }
          logFeeReminder(sId, 'whatsapp', 'sent');
        }
      });
    });

    document.querySelectorAll('.bulk-sms-btn').forEach(function(btn) {
      if (!hasSMS) return;
      btn.addEventListener('click', async function() {
        var sId = this.getAttribute('data-student-id');
        var item = defaulters.find(function(x) { return x.student.id === sId; });
        if (!item) return;

        var phone = getStudentParentPhone(item.student);
        var sName = item.student.name || (item.student.firstName + ' ' + (item.student.lastName || '')).trim();
        if (!phone || phone.length < 10) {
          SchoolApp.showToast('No valid 10-digit mobile number for ' + sName, 'error');
          return;
        }

        var smsMsg = buildFeeReminderSMS(item.statement, SchoolApp.store.settings || {});
        btn.disabled = true;
        btn.textContent = 'Sending...';
        var ok = await sendFeeSMS(phone, smsMsg, sId, sName);
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round" style="font-size:14px">sms</span> 💬 SMS';

        var badge = document.querySelector('.status-badge-' + sId);
        if (badge) {
          if (ok) {
            badge.className = 'status-badge status-badge-' + sId + ' badge badge-success';
            badge.innerHTML = '✅ SMS Sent';
          } else {
            badge.className = 'status-badge status-badge-' + sId + ' badge badge-danger';
            badge.innerHTML = '❌ SMS Failed';
          }
        }
      });
    });
  }

  function getFilteredStudents() {
    var students = SchoolApp.store.students || [];

    // Teacher restrictions: only assigned classes
    if (SchoolApp.isTeacher() && SchoolApp.currentUser.assignedClasses) {
      var ac = SchoolApp.currentUser.assignedClasses;
      students = students.filter(function(s) {
        return ac.some(function(c) { return c.class === s.class && c.section === s.section; });
      });
    }

    // Class filter
    if (state.classFilter !== 'all') {
      students = students.filter(function(s) { return s.class === state.classFilter; });
    }

    // Section filter
    if (state.sectionFilter !== 'all') {
      students = students.filter(function(s) { return s.section === state.sectionFilter; });
    }

    // Fee Status filter
    if (state.statusFilter !== 'all') {
      students = students.filter(function(s) {
        var stats = getStudentFeeStats(s.id);
        if (state.statusFilter === 'unpaid') {
          return stats.outstanding > 0;
        } else if (state.statusFilter === 'paid') {
          return stats.outstanding <= 0;
        }
        return true;
      });
    }

    // Search query
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      students = students.filter(function(s) {
        return (s.firstName + ' ' + s.lastName).toLowerCase().indexOf(q) !== -1 ||
               s.rollNumber.toLowerCase().indexOf(q) !== -1;
      });
    }

    return students;
  }

  function exportHistoryToExcel() {
    var students = SchoolApp.store.students || [];
    var studentMap = {};
    students.forEach(function(s) {
      studentMap[s.id] = s;
    });

    var logs = (SchoolApp.store.feeActivityLog || []).filter(function(log) {
      return !!studentMap[log.studentId];
    });

    if (state.historyClassFilter !== 'all') {
      logs = logs.filter(function(log) {
        var student = studentMap[log.studentId];
        var sClass = student ? student.class : (log.className ? log.className.split('-')[0] : '');
        return sClass === state.historyClassFilter;
      });
    }

    if (state.historyTypeFilter !== 'all') {
      logs = logs.filter(function(log) {
        return log.feeHeadName === state.historyTypeFilter;
      });
    }

    if (state.historySearchQuery) {
      var q = state.historySearchQuery.toLowerCase();
      logs = logs.filter(function(log) {
        var student = studentMap[log.studentId];
        var studentName = log.studentName || (student ? (student.firstName + ' ' + student.lastName) : '');
        var roll = student ? student.rollNumber : '';
        return studentName.toLowerCase().indexOf(q) !== -1 || roll.toLowerCase().indexOf(q) !== -1;
      });
    }

    if (state.historyStartDate) {
      var startLimit = new Date(state.historyStartDate + 'T00:00:00');
      logs = logs.filter(function(log) {
        return new Date(log.timestamp) >= startLimit;
      });
    }
    if (state.historyEndDate) {
      var endLimit = new Date(state.historyEndDate + 'T23:59:59');
      logs = logs.filter(function(log) {
        return new Date(log.timestamp) <= endLimit;
      });
    }

    logs.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    var columns = [
      {
        header: 'Timestamp',
        key: 'timestamp',
        transform: function(val) {
          return SchoolApp.formatDate(val.split('T')[0]) + ' ' + new Date(val).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
      },
      {
        header: 'Student Name',
        key: 'studentName'
      },
      {
        header: 'Class-Section',
        key: 'className'
      },
      {
        header: 'Fee Type / Head',
        key: 'feeHeadName'
      },
      {
        header: 'Amount (₹)',
        key: 'amount'
      },
      {
        header: 'Added By',
        key: 'addedBy'
      },
      {
        header: 'Note / Reason',
        key: 'note'
      }
    ];

    SchoolApp.utils.exportToExcel(
      logs,
      columns,
      'fee_activity_history_' + new Date().toISOString().split('T')[0] + '.xlsx'
    );
  }

  function exportHistoryToPDF() {
    var students = SchoolApp.store.students || [];
    var studentMap = {};
    students.forEach(function(s) {
      studentMap[s.id] = s;
    });

    var logs = (SchoolApp.store.feeActivityLog || []).filter(function(log) {
      return !!studentMap[log.studentId];
    });

    if (state.historyClassFilter !== 'all') {
      logs = logs.filter(function(log) {
        var student = studentMap[log.studentId];
        var sClass = student ? student.class : (log.className ? log.className.split('-')[0] : '');
        return sClass === state.historyClassFilter;
      });
    }

    if (state.historyTypeFilter !== 'all') {
      logs = logs.filter(function(log) {
        return log.feeHeadName === state.historyTypeFilter;
      });
    }

    if (state.historySearchQuery) {
      var q = state.historySearchQuery.toLowerCase();
      logs = logs.filter(function(log) {
        var student = studentMap[log.studentId];
        var studentName = log.studentName || (student ? (student.firstName + ' ' + student.lastName) : '');
        var roll = student ? student.rollNumber : '';
        return studentName.toLowerCase().indexOf(q) !== -1 || roll.toLowerCase().indexOf(q) !== -1;
      });
    }

    if (state.historyStartDate) {
      var startLimit = new Date(state.historyStartDate + 'T00:00:00');
      logs = logs.filter(function(log) {
        return new Date(log.timestamp) >= startLimit;
      });
    }
    if (state.historyEndDate) {
      var endLimit = new Date(state.historyEndDate + 'T23:59:59');
      logs = logs.filter(function(log) {
        return new Date(log.timestamp) <= endLimit;
      });
    }

    logs.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    if (logs.length === 0) {
      SchoolApp.showToast('No data to export.', 'warning');
      return;
    }

    var printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      SchoolApp.showToast('Popup blocker prevented opening PDF/Print view. Please allow popups for this site.', 'warning');
      return;
    }

    var settings = SchoolApp.store.settings || {};
    var info = settings.schoolInfo || {};
    var logoUrl = settings.logoUrl || info.logoUrl || '';
    if (!logoUrl) {
      logoUrl = new URL('school-logo-updated.jpg', window.location.href).href + '?t=' + new Date().getTime();
    }

    var html = '<html><head><title>Fee Activity Report</title>';
    html += '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';
    html += '<style>';
    html += 'body { font-family: "Inter", sans-serif; padding: 30px; color: #333; }';
    html += '.header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }';
    html += '.header-left { display: flex; align-items: center; gap: 15px; }';
    html += '.logo { height: 60px; width: auto; object-fit: contain; }';
    html += '.school-title { font-size: 20px; font-weight: 700; margin: 0; }';
    html += '.report-title { font-size: 24px; font-weight: 700; margin: 0; text-align: right; }';
    html += '.info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; font-size: 13px; background: #f9f9f9; padding: 15px; border-radius: 6px; border: 1px solid #ddd; }';
    html += '.info-item span { font-weight: 600; }';
    html += '.summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 25px; }';
    html += '.summary-card { border: 1px solid #ccc; padding: 15px; border-radius: 6px; text-align: center; background: #fff; }';
    html += '.summary-val { font-size: 22px; font-weight: 700; color: #7c3aed; }';
    html += '.summary-lbl { font-size: 12px; color: #666; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.5px; }';
    html += '.report-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }';
    html += '.report-table th, .report-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }';
    html += '.report-table th { background: #f2f2f2; font-weight: 600; }';
    html += '.report-table tr:nth-child(even) { background: #fafafa; }';
    html += '@media print {';
    html += '  body { padding: 10mm; }';
    html += '  .summary-card { border: 1px solid #000; }';
    html += '  .summary-val { color: #000; }';
    html += '}';
    html += '</style></head><body>';

    // Header
    html += '<div class="header">';
    html += '<div class="header-left">';
    html += '<img src="' + logoUrl + '" class="logo">';
    html += '<div>';
    html += '<h1 class="school-title">' + (settings.schoolName || 'Shishu Vikash Mandir') + '</h1>';
    if (info.tagline) html += '<p style="margin: 3px 0 0 0; font-size: 11px; color: #666;">' + info.tagline + '</p>';
    html += '</div></div>';
    html += '<h2 class="report-title">Fee Activity Report</h2>';
    html += '</div>';

    // Info block
    html += '<div class="info-grid">';
    html += '<div class="info-item"><span>Generated On:</span> ' + new Date().toLocaleString() + '</div>';
    html += '<div class="info-item"><span>Class Filter:</span> ' + (state.historyClassFilter === 'all' ? 'All Classes' : 'Class ' + state.historyClassFilter) + '</div>';
    html += '<div class="info-item"><span>Fee Type Filter:</span> ' + (state.historyTypeFilter === 'all' ? 'All Types' : state.historyTypeFilter) + '</div>';
    var dateRangeStr = 'All Time';
    if (state.historyStartDate || state.historyEndDate) {
      dateRangeStr = (state.historyStartDate || 'Beginning') + ' to ' + (state.historyEndDate || 'Today');
    }
    html += '<div class="info-item"><span>Date Range:</span> ' + dateRangeStr + '</div>';
    html += '</div>';

    // Summary
    var totalAmount = logs.reduce(function(sum, item) { return sum + parseFloat(item.amount || 0); }, 0);
    html += '<div class="summary-grid">';
    html += '<div class="summary-card"><div class="summary-val">₹' + totalAmount.toLocaleString('en-IN') + '</div><div class="summary-lbl">Total Filtered Charges</div></div>';
    html += '<div class="summary-card"><div class="summary-val">' + logs.length + '</div><div class="summary-lbl">Total Logged Entries</div></div>';
    html += '</div>';

    // Table
    html += '<table class="report-table"><thead><tr>';
    html += '<th>Date & Time</th><th>Student Name</th><th>Class</th><th>Fee Head</th><th>Amount</th><th>Added By</th><th>Note / Reason</th>';
    html += '</tr></thead><tbody>';

    logs.forEach(function(log) {
      var logDateStr = SchoolApp.formatDate(log.timestamp.split('T')[0]) + ' ' + new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      html += '<tr>';
      html += '<td>' + logDateStr + '</td>';
      html += '<td>' + log.studentName + '</td>';
      html += '<td>' + log.className + '</td>';
      html += '<td>' + log.feeHeadName + '</td>';
      html += '<td>₹' + parseFloat(log.amount || 0).toLocaleString('en-IN') + '</td>';
      html += '<td>' + log.addedBy + '</td>';
      html += '<td>' + (log.note || '—') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></body></html>';

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(function() {
      printWindow.print();
      printWindow.close();
    }, 500);
  }

  function renderHistoryTab(dataContainer) {
    var students = SchoolApp.store.students || [];
    var studentMap = {};
    students.forEach(function(s) {
      studentMap[s.id] = s;
    });

    var logs = (SchoolApp.store.feeActivityLog || []).filter(function(log) {
      return !!studentMap[log.studentId];
    });

    if (state.historyClassFilter !== 'all') {
      logs = logs.filter(function(log) {
        var student = studentMap[log.studentId];
        var sClass = student ? student.class : (log.className ? log.className.split('-')[0] : '');
        return sClass === state.historyClassFilter;
      });
    }

    if (state.historyTypeFilter !== 'all') {
      logs = logs.filter(function(log) {
        return log.feeHeadName === state.historyTypeFilter;
      });
    }

    if (state.historySearchQuery) {
      var q = state.historySearchQuery.toLowerCase();
      logs = logs.filter(function(log) {
        var student = studentMap[log.studentId];
        var studentName = log.studentName || (student ? (student.firstName + ' ' + student.lastName) : '');
        var roll = student ? student.rollNumber : '';
        return studentName.toLowerCase().indexOf(q) !== -1 || roll.toLowerCase().indexOf(q) !== -1;
      });
    }

    if (state.historyStartDate) {
      var startLimit = new Date(state.historyStartDate + 'T00:00:00');
      logs = logs.filter(function(log) {
        return new Date(log.timestamp) >= startLimit;
      });
    }
    if (state.historyEndDate) {
      var endLimit = new Date(state.historyEndDate + 'T23:59:59');
      logs = logs.filter(function(log) {
        return new Date(log.timestamp) <= endLimit;
      });
    }

    logs.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    var totalAmount = logs.reduce(function(sum, log) { return sum + parseFloat(log.amount || 0); }, 0);
    var totalCount = logs.length;

    var amtEl = document.getElementById('history-amount-value');
    if (amtEl) amtEl.textContent = '₹' + totalAmount.toLocaleString('en-IN');
    var countEl = document.getElementById('history-count-value');
    if (countEl) countEl.textContent = totalCount.toString();

    var totalPages = Math.ceil(logs.length / state.perPage);
    if (state.historyCurrentPage > totalPages && totalPages > 0) state.historyCurrentPage = totalPages;
    var start = (state.historyCurrentPage - 1) * state.perPage;
    var pageLogs = logs.slice(start, start + state.perPage);

    var html = '';
    if (pageLogs.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>Date & Time</th><th>Student</th><th>Class</th><th>Fee Head</th><th>Amount</th><th>Added By</th><th>Note / Reason</th>';
      html += '</tr></thead><tbody>';

      pageLogs.forEach(function(log) {
        var logDateStr = SchoolApp.formatDate(log.timestamp.split('T')[0]) + ' ' + new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        html += '<tr>';
        html += '<td>' + logDateStr + '</td>';
        html += '<td><strong style="color:var(--accent-primary); text-decoration:underline; cursor:pointer;" onclick="openStudentProfile(\'' + log.studentId + '\')">' + escapeHTML(log.studentName) + '</strong></td>';
        html += '<td><span class="badge badge-info">' + log.className + '</span></td>';
        html += '<td>' + log.feeHeadName + '</td>';
        html += '<td>₹' + parseFloat(log.amount || 0).toLocaleString('en-IN') + '</td>';
        html += '<td><span class="badge badge-secondary">' + log.addedBy + '</span></td>';
        html += '<td><span style="font-size: 12px; color: var(--text-secondary);">' + (log.note || '—') + '</span></td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';

      html += '<div class="pagination">';
      html += '<span class="pagination-info">Showing ' + (start + 1) + ' to ' + Math.min(start + state.perPage, logs.length) + ' of ' + logs.length + ' entries</span>';
      html += '<button class="pagination-btn" ' + (state.historyCurrentPage <= 1 ? 'disabled' : '') + ' data-page="prev"><span class="material-icons-round">chevron_left</span></button>';
      for (var i = 1; i <= totalPages; i++) {
        html += '<button class="pagination-btn' + (i === state.historyCurrentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
      }
      html += '<button class="pagination-btn" ' + (state.historyCurrentPage >= totalPages ? 'disabled' : '') + ' data-page="next"><span class="material-icons-round">chevron_right</span></button>';
      html += '</div>';

    } else {
      html += '<div class="empty-state"><span class="material-icons-round">history</span><h3>No History Found</h3><p>No activity match your current filters.</p></div>';
    }

    dataContainer.innerHTML = html;

    dataContainer.querySelectorAll('.pagination-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var page = this.getAttribute('data-page');
        if (page === 'prev') {
          state.historyCurrentPage--;
        } else if (page === 'next') {
          state.historyCurrentPage++;
        } else {
          state.historyCurrentPage = parseInt(page);
        }
        renderHistoryTab(dataContainer);
      });
    });
  }

  function render() {
    var container = document.getElementById('page-fees');
    if (!container) return;

    if (!window.assertSchoolIsolation(SchoolApp.store.fees, SchoolApp.store.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected in Fees Tab!");
      SchoolApp.showToast("Security error. Please logout and login again.", "error");
      SchoolApp.logout();
      return;
    }

    var filteredStudents = getFilteredStudents();
    var isAdmin = SchoolApp.isAdmin();

    var schoolDues = 0;
    var schoolPaid = 0;
    (SchoolApp.store.fees || []).forEach(function(f) {
      if (f.type === 'due') schoolDues += parseFloat(f.amount || 0);
      else if (f.type === 'payment') schoolPaid += parseFloat(f.amount || 0);
    });
    var outstandingAmt = schoolDues - schoolPaid;

    var dataContainer = document.getElementById('fees-data-container');
    var currentRenderedRole = container.getAttribute('data-rendered-role');
    var userRole = isAdmin ? 'admin' : 'teacher';

    if (!dataContainer || currentRenderedRole !== userRole) {
      container.setAttribute('data-rendered-role', userRole);
      var shellHtml = '';

      shellHtml += '<div class="page-header">';
      shellHtml += '<h2>Fee Management</h2>';
      shellHtml += '<div class="header-actions">';
      if (isAdmin) {
        shellHtml += '<button class="btn btn-primary" id="bulk-charge-fee-btn"><span class="material-icons-round">campaign</span> Bulk Charge Class</button>';
        shellHtml += '<button class="btn btn-secondary bulk-fee-reminders-btn" id="bulk-fee-reminders-btn" style="background:#25D366; color:#fff; border:none; display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:18px">campaign</span> 📢 Send Bulk Fee Reminders</button>';
        shellHtml += '<button class="btn btn-secondary" id="fees-export-pdf-btn" style="display: none;"><span class="material-icons-round">picture_as_pdf</span> Export PDF</button>';
        shellHtml += '<button class="btn btn-secondary" id="fees-export-excel-btn" style="display: none;"><span class="material-icons-round">grid_on</span> Export Excel</button>';
      }
      shellHtml += '</div></div>';

      shellHtml += '<div class="tab-nav">';
      shellHtml += '  <button class="tab-btn active" id="btn-tab-students" data-tab="students"><span class="material-icons-round">payments</span> Student Dues</button>';
      shellHtml += '  <button class="tab-btn" id="btn-tab-history" data-tab="history"><span class="material-icons-round">history</span> Fee History</button>';
      shellHtml += '  <button class="tab-btn" id="btn-tab-ledger" data-tab="ledger"><span class="material-icons-round">account_balance_wallet</span> Fee Ledger</button>';
      shellHtml += '</div>';

      shellHtml += '<div class="stats-grid" id="dues-stats-grid">';
      shellHtml += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">assignment</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="fees-dues-value">₹' + schoolDues.toLocaleString('en-IN') + '</div><div class="stat-label">Total Dues Charged</div></div></div>';
      shellHtml += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">check_circle</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="fees-collected-value">₹' + schoolPaid.toLocaleString('en-IN') + '</div><div class="stat-label">Total Fees Collected</div></div></div>';
      shellHtml += '<div class="stat-card ' + (outstandingAmt > 0 ? 'amber' : 'cyan') + '" id="fees-outstanding-card"><div class="stat-icon"><span class="material-icons-round">error</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="fees-outstanding-value">₹' + outstandingAmt.toLocaleString('en-IN') + '</div><div class="stat-label">Outstanding Balance</div></div></div>';
      shellHtml += '</div>';

      shellHtml += '<div class="stats-grid" id="history-stats-grid" style="display: none;">';
      shellHtml += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">payments</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="history-amount-value">₹0</div><div class="stat-label">Total Filtered Charges</div></div></div>';
      shellHtml += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">history</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="history-count-value">0</div><div class="stat-label">Total Logged Entries</div></div></div>';
      shellHtml += '</div>';

      shellHtml += '<div class="stats-grid" id="ledger-stats-grid" style="display: none;">';
      shellHtml += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">payments</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="ledger-today-collection">₹0</div><div class="stat-label">Today\'s Collection</div></div></div>';
      shellHtml += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">calendar_today</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="ledger-mtd-collection">₹0</div><div class="stat-label">MTD Collection</div></div></div>';
      shellHtml += '<div class="stat-card cyan"><div class="stat-icon"><span class="material-icons-round">account_balance_wallet</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="ledger-cash-in-hand">₹0</div><div class="stat-label">Cash in Hand</div></div></div>';
      shellHtml += '</div>';

      shellHtml += '<div class="toolbar" id="fees-students-toolbar">';
      shellHtml += '<div class="search-wrapper"><span class="material-icons-round">search</span>';
      shellHtml += '<input type="text" id="fees-search" placeholder="Search student by name/roll..." value="' + (state.searchQuery || '') + '">';
      shellHtml += '</div>';

      shellHtml += '<div class="defaulter-toggle-wrapper" style="display:flex; align-items:center; gap:6px; margin-left: 12px; margin-right: auto;">';
      shellHtml += '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600; color:var(--text-secondary);">';
      shellHtml += '<input type="checkbox" id="defaulters-only-toggle"' + (state.statusFilter === 'unpaid' ? ' checked' : '') + ' style="width:16px; height:16px; cursor:pointer; accent-color:var(--danger);">';
      shellHtml += '<span>Show Defaulters</span>';
      shellHtml += '</label>';
      shellHtml += '</div>';

      shellHtml += '<div class="filter-group">';
      
      shellHtml += '<select class="form-select" id="fees-class-filter"><option value="all">All Classes</option>';
      var settings = SchoolApp.store.settings || {};
      var classesList = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];
      classesList.forEach(function(c) {
        shellHtml += '<option value="' + c + '"' + (state.classFilter === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
      });
      shellHtml += '</select>';

      shellHtml += '<select class="form-select" id="fees-section-filter"><option value="all">All Sections</option>';
      var rawSections = settings.sections || {};
      var sections = [];
      if (Array.isArray(rawSections)) {
        sections = rawSections;
      } else if (typeof rawSections === 'object') {
        var allSecs = new Set();
        Object.values(rawSections).forEach(function(arr) {
          if (Array.isArray(arr)) arr.forEach(function(s) { allSecs.add(s); });
        });
        sections = Array.from(allSecs);
      }
      sections.forEach(function(s) {
        shellHtml += '<option value="' + s + '"' + (state.sectionFilter === s ? ' selected' : '') + '>Section ' + s + '</option>';
      });
      shellHtml += '</select>';

      shellHtml += '<select class="form-select" id="fees-status-filter">';
      shellHtml += '<option value="all"' + (state.statusFilter === 'all' ? ' selected' : '') + '>All Statuses</option>';
      shellHtml += '<option value="unpaid"' + (state.statusFilter === 'unpaid' ? ' selected' : '') + '>Outstanding Balance</option>';
      shellHtml += '<option value="paid"' + (state.statusFilter === 'paid' ? ' selected' : '') + '>Fully Paid</option>';
      shellHtml += '</select>';
      shellHtml += '</div></div>';

      shellHtml += '<div class="toolbar" id="fees-history-toolbar" style="display: none; flex-wrap: wrap; gap: 12px; align-items: center;">';
      shellHtml += '<div class="search-wrapper" style="flex: 1; min-width: 200px;"><span class="material-icons-round">search</span>';
      shellHtml += '<input type="text" id="fees-history-search" placeholder="Search student by name/roll..." value="' + (state.historySearchQuery || '') + '">';
      shellHtml += '</div>';

      shellHtml += '<div class="filter-group" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; width: auto; margin-left: auto;">';
      
      shellHtml += '<select class="form-select" id="fees-history-class-filter" style="width: auto; min-width: 130px;"><option value="all">All Classes</option>';
      classesList.forEach(function(c) {
        shellHtml += '<option value="' + c + '"' + (state.historyClassFilter === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
      });
      shellHtml += '</select>';

      shellHtml += '<select class="form-select" id="fees-history-type-filter" style="width: auto; min-width: 150px;"><option value="all">All Fee Types</option>';
      var uniqueTypes = new Set();
      getActiveFeeHeads().forEach(function(h) { uniqueTypes.add(h.name); });
      (SchoolApp.store.feeActivityLog || []).forEach(function(log) {
        if (log.feeHeadName) uniqueTypes.add(log.feeHeadName);
      });
      uniqueTypes.forEach(function(t) {
        shellHtml += '<option value="' + t + '"' + (state.historyTypeFilter === t ? ' selected' : '') + '>' + t + '</option>';
      });
      shellHtml += '</select>';

      shellHtml += '<div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); font-weight: 500;">';
      shellHtml += '<span>From:</span><input type="date" id="fees-history-start-date" class="form-input" style="padding: 6px 10px; font-size: 13px; line-height: 1; width: auto;" value="' + (state.historyStartDate || '') + '">';
      shellHtml += '<span>To:</span><input type="date" id="fees-history-end-date" class="form-input" style="padding: 6px 10px; font-size: 13px; line-height: 1; width: auto;" value="' + (state.historyEndDate || '') + '">';
      shellHtml += '</div>';

      shellHtml += '</div></div>';

      shellHtml += '<div class="toolbar" id="fees-ledger-toolbar" style="display: none; flex-wrap: wrap; gap: 12px; align-items: center;">';
      shellHtml += '<div class="search-wrapper" style="flex: 1; min-width: 200px;"><span class="material-icons-round">search</span>';
      shellHtml += '<input type="text" id="fees-ledger-search" placeholder="Search today\'s payments..." value="' + (state.ledgerSearchQuery || '') + '">';
      shellHtml += '</div>';
      shellHtml += '<button class="btn btn-secondary bulk-fee-reminders-btn" id="bulk-fee-reminders-ledger-btn" style="background:#25D366; color:#fff; border:none; display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:18px">campaign</span> 📢 Send Bulk Fee Reminders</button>';
      shellHtml += '</div>';

      shellHtml += '<div id="fees-data-container"></div>';

      container.innerHTML = shellHtml;
      attachStaticEvents();
      dataContainer = document.getElementById('fees-data-container');
    }

    var duesStatsGrid = document.getElementById('dues-stats-grid');
    var historyStatsGrid = document.getElementById('history-stats-grid');
    var ledgerStatsGrid = document.getElementById('ledger-stats-grid');
    var studentsToolbar = document.getElementById('fees-students-toolbar');
    var historyToolbar = document.getElementById('fees-history-toolbar');
    var ledgerToolbar = document.getElementById('fees-ledger-toolbar');
    var bulkChargeBtn = document.getElementById('bulk-charge-fee-btn');
    var exportPdfBtn = document.getElementById('fees-export-pdf-btn');
    var exportExcelBtn = document.getElementById('fees-export-excel-btn');
    
    var tabBtnStudents = document.getElementById('btn-tab-students');
    var tabBtnHistory = document.getElementById('btn-tab-history');
    var tabBtnLedger = document.getElementById('btn-tab-ledger');

    if (state.activeTab === 'students') {
      if (duesStatsGrid) duesStatsGrid.style.display = 'grid';
      if (historyStatsGrid) historyStatsGrid.style.display = 'none';
      if (ledgerStatsGrid) ledgerStatsGrid.style.display = 'none';
      if (studentsToolbar) studentsToolbar.style.display = 'flex';
      if (historyToolbar) historyToolbar.style.display = 'none';
      if (ledgerToolbar) ledgerToolbar.style.display = 'none';
      if (bulkChargeBtn) bulkChargeBtn.style.display = 'inline-flex';
      if (exportPdfBtn) exportPdfBtn.style.display = 'none';
      if (exportExcelBtn) exportExcelBtn.style.display = 'none';
      
      if (tabBtnStudents) tabBtnStudents.classList.add('active');
      if (tabBtnHistory) tabBtnHistory.classList.remove('active');
      if (tabBtnLedger) tabBtnLedger.classList.remove('active');
    } else if (state.activeTab === 'history') {
      if (duesStatsGrid) duesStatsGrid.style.display = 'none';
      if (historyStatsGrid) historyStatsGrid.style.display = 'grid';
      if (ledgerStatsGrid) ledgerStatsGrid.style.display = 'none';
      if (studentsToolbar) studentsToolbar.style.display = 'none';
      if (historyToolbar) historyToolbar.style.display = 'flex';
      if (ledgerToolbar) ledgerToolbar.style.display = 'none';
      if (bulkChargeBtn) bulkChargeBtn.style.display = 'none';
      if (exportPdfBtn) exportPdfBtn.style.display = 'inline-flex';
      if (exportExcelBtn) exportExcelBtn.style.display = 'inline-flex';
      
      if (tabBtnStudents) tabBtnStudents.classList.remove('active');
      if (tabBtnHistory) tabBtnHistory.classList.add('active');
      if (tabBtnLedger) tabBtnLedger.classList.remove('active');
    } else {
      if (duesStatsGrid) duesStatsGrid.style.display = 'none';
      if (historyStatsGrid) historyStatsGrid.style.display = 'none';
      if (ledgerStatsGrid) ledgerStatsGrid.style.display = 'grid';
      if (studentsToolbar) studentsToolbar.style.display = 'none';
      if (historyToolbar) historyToolbar.style.display = 'none';
      if (ledgerToolbar) ledgerToolbar.style.display = 'flex';
      if (bulkChargeBtn) bulkChargeBtn.style.display = 'none';
      if (exportPdfBtn) exportPdfBtn.style.display = 'none';
      if (exportExcelBtn) exportExcelBtn.style.display = 'none';
      
      if (tabBtnStudents) tabBtnStudents.classList.remove('active');
      if (tabBtnHistory) tabBtnHistory.classList.remove('active');
      if (tabBtnLedger) tabBtnLedger.classList.add('active');
    }

    var searchInput = document.getElementById('fees-search');
    if (searchInput && searchInput.value !== state.searchQuery) {
      searchInput.value = state.searchQuery;
    }
    var defaulterToggle = document.getElementById('defaulters-only-toggle');
    if (defaulterToggle) {
      defaulterToggle.checked = (state.statusFilter === 'unpaid');
    }
    var classFilter = document.getElementById('fees-class-filter');
    if (classFilter && classFilter.value !== state.classFilter) {
      classFilter.value = state.classFilter;
    }
    var sectionFilter = document.getElementById('fees-section-filter');
    if (sectionFilter && sectionFilter.value !== state.sectionFilter) {
      sectionFilter.value = state.sectionFilter;
    }
    var statusFilter = document.getElementById('fees-status-filter');
    if (statusFilter && statusFilter.value !== state.statusFilter) {
      statusFilter.value = state.statusFilter;
    }

    var historySearchInput = document.getElementById('fees-history-search');
    if (historySearchInput && historySearchInput.value !== state.historySearchQuery) {
      historySearchInput.value = state.historySearchQuery;
    }
    var historyClassFilter = document.getElementById('fees-history-class-filter');
    if (historyClassFilter && historyClassFilter.value !== state.historyClassFilter) {
      historyClassFilter.value = state.historyClassFilter;
    }
    var historyTypeFilter = document.getElementById('fees-history-type-filter');
    if (historyTypeFilter && historyTypeFilter.value !== state.historyTypeFilter) {
      historyTypeFilter.value = state.historyTypeFilter;
    }
    var historyStartDate = document.getElementById('fees-history-start-date');
    if (historyStartDate && historyStartDate.value !== state.historyStartDate) {
      historyStartDate.value = state.historyStartDate;
    }
    var historyEndDate = document.getElementById('fees-history-end-date');
    if (historyEndDate && historyEndDate.value !== state.historyEndDate) {
      historyEndDate.value = state.historyEndDate;
    }

    if (state.activeTab === 'students') {
      var duesVal = document.getElementById('fees-dues-value');
      if (duesVal) duesVal.textContent = '₹' + schoolDues.toLocaleString('en-IN');
      
      var colVal = document.getElementById('fees-collected-value');
      if (colVal) colVal.textContent = '₹' + schoolPaid.toLocaleString('en-IN');
      
      var outVal = document.getElementById('fees-outstanding-value');
      if (outVal) outVal.textContent = '₹' + outstandingAmt.toLocaleString('en-IN');
      
      var outCard = document.getElementById('fees-outstanding-card');
      if (outCard) {
        outCard.className = 'stat-card ' + (outstandingAmt > 0 ? 'amber' : 'cyan');
      }

      var totalPages = Math.ceil(filteredStudents.length / state.perPage);
      if (state.currentPage > totalPages && totalPages > 0) state.currentPage = totalPages;
      var start = (state.currentPage - 1) * state.perPage;
      var pageStudents = filteredStudents.slice(start, start + state.perPage);

      var html = '';
      if (pageStudents.length > 0) {
        html += '<div class="table-container"><table class="data-table"><thead><tr>';
        html += '<th>Student</th><th>Class</th><th>Roll No.</th><th>Total Dues</th><th>Total Paid</th><th>Outstanding</th><th>Actions</th>';
        html += '</tr></thead><tbody>';

        pageStudents.forEach(function(s) {
          var initials = SchoolApp.getInitials(s.firstName, s.lastName);
          var color = SchoolApp.getAvatarColor(s.firstName + s.lastName);
          var stats = getStudentFeeStats(s.id);

          html += '<tr>';
          html += '<td><div class="table-student-name"><div class="avatar avatar-sm" data-color="' + color + '">' + initials + '</div><div><strong style="color:var(--accent-primary); text-decoration:underline; cursor:pointer;" onclick="openStudentProfile(\'' + s.id + '\')">' + escapeHTML(SchoolApp.getStudentFullName(s)) + '</strong></div></div></td>';
          html += '<td><span class="badge badge-info">' + s.class + '-' + s.section + '</span></td>';
          html += '<td>' + s.rollNumber + '</td>';
          html += '<td>₹' + stats.totalDues.toLocaleString('en-IN') + '</td>';
          html += '<td>₹' + stats.totalPaid.toLocaleString('en-IN') + '</td>';
          
          var badgeColor = stats.outstanding > 0 ? 'badge-danger' : 'badge-success';
          html += '<td><span class="badge ' + badgeColor + '">₹' + stats.outstanding.toLocaleString('en-IN') + '</span></td>';

          html += '<td><div class="table-actions">';
          html += '<button class="btn-icon fees-collect-btn" data-id="' + s.id + '" title="Record Fee Payment" style="color:var(--success)"><span class="material-icons-round">payments</span></button>';
          html += '<button class="btn-icon fees-ledger-btn" data-id="' + s.id + '" title="View Fee Ledger" style="color:var(--accent-secondary)"><span class="material-icons-round">receipt_long</span></button>';
          if (isAdmin) {
            html += '<button class="btn-icon fees-charge-btn" data-id="' + s.id + '" title="Add Custom Charge/Fine" style="color:var(--accent-primary-light)"><span class="material-icons-round">add_card</span></button>';
          }
          html += '<button class="btn-icon fees-reminder-btn" data-id="' + s.id + '" title="Send Fee Reminder (WhatsApp / SMS)" style="color:#25D366"><span class="material-icons-round">campaign</span></button>';
          html += '</div></td></tr>';
        });

        html += '</tbody></table></div>';

        html += '<div class="pagination">';
        html += '<span class="pagination-info">Showing ' + (start + 1) + ' to ' + Math.min(start + state.perPage, filteredStudents.length) + ' of ' + filteredStudents.length + ' students</span>';
        html += '<button class="pagination-btn" ' + (state.currentPage <= 1 ? 'disabled' : '') + ' data-page="prev"><span class="material-icons-round">chevron_left</span></button>';
        for (var i = 1; i <= totalPages; i++) {
          html += '<button class="pagination-btn' + (i === state.currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
        }
        html += '<button class="pagination-btn" ' + (state.currentPage >= totalPages ? 'disabled' : '') + ' data-page="next"><span class="material-icons-round">chevron_right</span></button>';
        html += '</div>';

      } else {
        html += '<div class="empty-state"><span class="material-icons-round">payments</span><h3>No Students Found</h3><p>No student match your current filters.</p></div>';
      }

      dataContainer.innerHTML = html;
      attachDynamicEvents();
    } else if (state.activeTab === 'history') {
      renderHistoryTab(dataContainer);
    } else {
      renderLedgerTab(dataContainer);
    }
  }

  function getStudentLedger(studentId) {
    var studentFees = (SchoolApp.store.fees || []).filter(function(f) {
      return f.studentId === studentId;
    });

    // Sort chronologically
    studentFees.sort(function(a, b) {
      return new Date(a.date) - new Date(b.date);
    });

    var runningBalance = 0;
    var transactions = studentFees.map(function(t) {
      if (t.type === 'due') {
        runningBalance += parseFloat(t.amount || 0);
      } else {
        runningBalance -= parseFloat(t.amount || 0);
      }

      var headName = '';
      if (t.type === 'due') {
        var fh = getActiveFeeHeads().find(function(x) { return x.id === t.feeHeadId; });
        headName = fh ? fh.name : 'Custom Charge';
      }

      return {
        id: t.id,
        date: t.date,
        type: t.type,
        amount: parseFloat(t.amount || 0),
        description: t.description || (t.type === 'due' ? headName : 'Payment (' + t.mode + ')'),
        mode: t.mode,
        remarks: t.remarks,
        balance: runningBalance
      };
    });

    var stats = getStudentFeeStats(studentId);

    return {
      transactions: transactions,
      totalDues: stats.totalDues,
      totalPaid: stats.totalPaid,
      outstanding: stats.outstanding
    };
  }

  function generateFeeReceiptHTML(txn, student, currentBalance) {
    var settings = SchoolApp.store.settings || {};
    var schoolInfo = settings.schoolInfo || {};

    var schoolName = settings.schoolName || schoolInfo.name || 'Shishu Vikash Mandir';
    var schoolAddress = settings.address || schoolInfo.address || 'Bokaro Steel City, Jharkhand';
    var schoolPhone = settings.phone || schoolInfo.phone || '';
    var schoolEmail = settings.email || schoolInfo.email || '';
    var logoUrl = settings.schoolLogo || settings.logoUrl || schoolInfo.logoUrl || schoolInfo.schoolLogo || '';
    var primaryColor = (settings.branding && settings.branding.primaryColor) || '#1E3A8A';

    var schoolPrefix = (SchoolApp.currentSchoolId || 'SVM').substring(0, 4).toUpperCase();
    var tsStr = txn.id ? txn.id.substring(0, 8).toUpperCase() : Date.now().toString().slice(-6);
    var receiptNo = txn.receiptNo || ('RCP-' + schoolPrefix + '-' + tsStr);

    var studentName = student ? (student.firstName + ' ' + (student.lastName || '')).trim() : 'N/A';
    var classSec = student ? ('Class ' + (student.class || '-') + (student.section ? ' - ' + student.section : '')) : 'N/A';
    var rollNo = student ? (student.rollNumber || student.rollNo || '—') : '—';

    var payDate = txn.date ? SchoolApp.formatDate(txn.date) : SchoolApp.formatDate(new Date().toISOString().split('T')[0]);
    if (txn.timestamp) {
      try {
        var timeStr = new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        payDate += ' ' + timeStr;
      } catch (e) {}
    }

    var amount = Number(txn.amount || 0);
    var mode = txn.mode || 'Cash';
    var remarks = txn.remarks || 'Fee Payment';

    var html = '';
    html += '<div style="max-width:680px; margin:0 auto; padding:24px; border:2px solid ' + primaryColor + '; border-radius:10px; background:#ffffff; font-family:Inter, Arial, sans-serif; color:#1e293b; box-sizing:border-box;">';
    
    // Header section
    html += '  <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid ' + primaryColor + '; padding-bottom:14px; margin-bottom:16px;">';
    html += '    <div style="display:flex; align-items:center; gap:14px;">';
    if (logoUrl) {
      html += '      <img src="' + logoUrl + '" alt="Logo" style="max-height:64px; max-width:64px; object-fit:contain; border-radius:6px;" />';
    } else {
      html += '      <div style="width:52px; height:52px; border-radius:8px; background:' + primaryColor + '; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; font-family:\'Poppins\',sans-serif;">' + escapeHTML(schoolName.charAt(0)) + '</div>';
    }
    html += '      <div>';
    html += '        <h1 style="margin:0; font-size:22px; font-weight:800; color:' + primaryColor + '; font-family:\'Poppins\', sans-serif; text-transform:uppercase; letter-spacing:0.5px;">' + escapeHTML(schoolName) + '</h1>';
    if (schoolAddress) html += '        <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">' + escapeHTML(schoolAddress) + '</p>';
    if (schoolPhone || schoolEmail) {
      var contactParts = [];
      if (schoolPhone) contactParts.push('Ph: ' + escapeHTML(schoolPhone));
      if (schoolEmail) contactParts.push('Email: ' + escapeHTML(schoolEmail));
      html += '        <p style="margin:2px 0 0 0; font-size:11px; color:#64748b;">' + contactParts.join(' | ') + '</p>';
    }
    html += '      </div>';
    html += '    </div>';
    
    html += '    <div style="text-align:right;">';
    html += '      <div style="background:' + primaryColor + '; color:#ffffff; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:700; font-family:\'Poppins\',sans-serif; letter-spacing:1px; display:inline-block;">FEE RECEIPT</div>';
    html += '      <div style="margin-top:6px; font-size:11px; color:#64748b; font-weight:600;">Original Copy</div>';
    html += '    </div>';
    html += '  </div>';

    // Details Grid
    html += '  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; background:#f8fafc; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:16px; font-size:12px;">';
    html += '    <div>';
    html += '      <div style="margin-bottom:4px;"><strong style="color:#475569;">Receipt No:</strong> <span style="font-weight:700; color:' + primaryColor + ';">' + escapeHTML(receiptNo) + '</span></div>';
    html += '      <div style="margin-bottom:4px;"><strong style="color:#475569;">Date & Time:</strong> <span>' + escapeHTML(payDate) + '</span></div>';
    html += '      <div><strong style="color:#475569;">Payment Mode:</strong> <span style="font-weight:600; text-transform:uppercase; color:#059669;">' + escapeHTML(mode) + '</span></div>';
    html += '    </div>';
    html += '    <div>';
    html += '      <div style="margin-bottom:4px;"><strong style="color:#475569;">Student Name:</strong> <span style="font-weight:700; color:#0f172a;">' + escapeHTML(studentName) + '</span></div>';
    html += '      <div style="margin-bottom:4px;"><strong style="color:#475569;">Class & Sec:</strong> <span>' + escapeHTML(classSec) + '</span></div>';
    html += '      <div><strong style="color:#475569;">Roll No:</strong> <span>' + escapeHTML(rollNo) + '</span></div>';
    html += '    </div>';
    html += '  </div>';

    // Table Breakdown
    html += '  <table style="width:100%; border-collapse:collapse; margin-bottom:16px; font-size:13px;">';
    html += '    <thead>';
    html += '      <tr style="background:' + primaryColor + '; color:#ffffff;">';
    html += '        <th style="padding:8px 12px; text-align:left; font-weight:600; border-top-left-radius:6px;">Particulars / Description</th>';
    html += '        <th style="padding:8px 12px; text-align:left; font-weight:600;">Remarks</th>';
    html += '        <th style="padding:8px 12px; text-align:right; font-weight:600; border-top-right-radius:6px;">Amount Paid (₹)</th>';
    html += '      </tr>';
    html += '    </thead>';
    html += '    <tbody>';
    html += '      <tr style="border-bottom:1px solid #e2e8f0;">';
    html += '        <td style="padding:10px 12px; font-weight:500;">School Fee Payment</td>';
    html += '        <td style="padding:10px 12px; color:#64748b;">' + escapeHTML(remarks) + '</td>';
    html += '        <td style="padding:10px 12px; text-align:right; font-weight:700; color:#0f172a;">₹' + amount.toLocaleString('en-IN') + '.00</td>';
    html += '      </tr>';
    html += '      <tr style="background:#f1f5f9; font-weight:700;">';
    html += '        <td colspan="2" style="padding:10px 12px; text-align:right; font-size:13px; color:#334155;">TOTAL RECEIVED:</td>';
    html += '        <td style="padding:10px 12px; text-align:right; font-size:14px; color:' + primaryColor + ';">₹' + amount.toLocaleString('en-IN') + '.00</td>';
    html += '      </tr>';
    if (currentBalance !== undefined && currentBalance !== null) {
      var balColor = currentBalance > 0 ? '#d97706' : '#059669';
      var balText = currentBalance > 0 ? ('₹' + currentBalance.toLocaleString('en-IN') + '.00 Due') : 'Cleared (₹0)';
      html += '      <tr style="background:#fafafa; font-size:12px;">';
      html += '        <td colspan="2" style="padding:8px 12px; text-align:right; color:#64748b; font-weight:600;">Remaining Balance:</td>';
      html += '        <td style="padding:8px 12px; text-align:right; font-weight:700; color:' + balColor + ';">' + balText + '</td>';
      html += '      </tr>';
    }
    html += '    </tbody>';
    html += '  </table>';

    // Signature & Footer
    html += '  <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:28px; padding-top:12px;">';
    html += '    <div style="font-size:11px; color:#94a3b8;">';
    html += '      <div>Txn Ref: ' + escapeHTML(txn.id || 'N/A') + '</div>';
    html += '      <div>This is a computer generated digital fee receipt.</div>';
    html += '    </div>';
    html += '    <div style="text-align:center;">';
    html += '      <div style="width:160px; border-bottom:1.5px dashed #94a3b8; margin-bottom:4px;"></div>';
    html += '      <div style="font-size:11px; font-weight:600; color:#475569;">Authorized Signatory / Cashier</div>';
    html += '    </div>';
    html += '  </div>';

    html += '</div>';

    return html;
  }

  function printFeeReceipt(txnRef, studentRef) {
    var txn = typeof txnRef === 'object' ? txnRef : null;
    var student = typeof studentRef === 'object' ? studentRef : null;

    if (!student && typeof studentRef === 'string') {
      student = SchoolApp.store.students.find(function(x) { return x.id === studentRef; });
    }

    if (!txn && typeof txnRef === 'string') {
      var fees = SchoolApp.store.fees || [];
      txn = fees.find(function(f) { return f.id === txnRef; });
    }

    if (!student && txn) {
      student = SchoolApp.store.students.find(function(x) { return x.id === txn.studentId; });
    }

    if (!txn) {
      SchoolApp.showToast('Transaction details not found.', 'error');
      return;
    }

    var currentBalance = 0;
    if (student) {
      var ledger = getStudentLedger(student.id);
      currentBalance = ledger.outstanding || 0;
    }

    var htmlContent = generateFeeReceiptHTML(txn, student, currentBalance);
    var studentName = student ? (student.firstName + ' ' + (student.lastName || '')).trim() : 'Student';
    var className = student ? student.class : '';

    if (typeof window.printViaBlob === 'function') {
      window.printViaBlob(htmlContent, studentName + '_Fee_Receipt', className);
    } else {
      var printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(htmlContent);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      }
    }
  }

  function showPostPaymentOptionsModal(txn, studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    var studentName = s ? (s.firstName + ' ' + (s.lastName || '')).trim() : 'Student';
    var classSec = s ? ('Class ' + (s.class || '') + (s.section ? ' - ' + s.section : '')) : '';

    var bodyHTML = '<div style="text-align:center; padding: 12px 0;">' +
      '<div style="width:56px; height:56px; border-radius:50%; background:rgba(34,197,94,0.1); color:#22c55e; display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px;">' +
      '<span class="material-icons-round" style="font-size:32px">check_circle</span></div>' +
      '<h3 style="margin:0 0 6px 0; font-size:18px; color:var(--text-primary);">Payment Recorded Successfully!</h3>' +
      '<p style="margin:0 0 16px 0; color:var(--text-secondary); font-size:13px;">Collected <strong>₹' + Number(txn.amount).toLocaleString('en-IN') + '</strong> via <strong>' + (txn.mode || 'Cash') + '</strong> for <strong>' + escapeHTML(studentName) + '</strong> (' + escapeHTML(classSec) + ').</p>' +
      '<div style="display:flex; flex-direction:column; gap:10px; max-width:320px; margin:0 auto;">' +
      '<button class="btn btn-primary" id="post-pay-print-btn" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:10px 16px;">' +
      '<span class="material-icons-round">description</span> 📄 View / Print Receipt PDF</button>' +
      '<button class="btn btn-secondary" id="post-pay-whatsapp-btn" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:10px 16px; background:#25D366; color:#fff; border:none;">' +
      '<span class="material-icons-round">send</span> 📱 Share on WhatsApp</button>' +
      '</div>' +
      '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Skip / Done</button>';

    SchoolApp.showModal('Payment Receipt Actions', bodyHTML, footerHTML);

    var printBtn = document.getElementById('post-pay-print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', function() {
        printFeeReceipt(txn, s);
      });
    }

    var waBtn = document.getElementById('post-pay-whatsapp-btn');
    if (waBtn) {
      waBtn.addEventListener('click', function() {
        sendWhatsAppReceipt(studentId, txn.amount, txn.mode);
      });
    }
  }

  function sendWhatsAppReceipt(studentId, amount, mode) {
    var student = SchoolApp.store.students.find(function(s) { return s.id === studentId; });
    var settings = SchoolApp.store.settings || {};
    var schoolInfo = settings.schoolInfo || {};
    var schoolName = settings.name || settings.schoolName || schoolInfo.name || 'Shishu Vikash Mandir';

    if (!student) {
      SchoolApp.showToast('Student record not found.', 'error');
      return;
    }

    var phone = student.parentPhone || student.phone || student.parentMobile || student.mobile;
    if (!phone) {
      SchoolApp.showToast('No phone number found for ' + (student.firstName || 'student'), 'error');
      return;
    }

    var studentName = ((student.firstName || '') + ' ' + (student.lastName || '')).trim();
    var classSec = 'Class ' + (student.class || '') + (student.section ? ' - ' + student.section : '');
    var receiptNo = SchoolApp.lastReceiptNo || ('RCP-SVM-' + Date.now().toString().slice(-5));
    var totalBalance = typeof SchoolApp.getStudentBalance === 'function' ? SchoolApp.getStudentBalance(studentId) : 0;
    var dateStr = new Date().toLocaleDateString('en-IN');

    var message = 
      'Namaste! 🙏\n' +
      'Payment of ₹' + Number(amount).toLocaleString('en-IN') + ' received for ' + studentName + ' (' + classSec + ').\n\n' +
      'Receipt No: ' + receiptNo + '\n' +
      'Payment Mode: ' + (mode || 'Cash') + '\n' +
      'Date: ' + dateStr + '\n' +
      'Remaining Dues: ₹' + Number(totalBalance).toLocaleString('en-IN') + '\n\n' +
      'Thank you,\n' +
      schoolName;

    var sent = SchoolApp.shareOnWhatsApp(phone, message);
    if (sent) {
      SchoolApp.showToast('Opening WhatsApp receipt link...', 'success');
    }
  }

  function showLedgerModal(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var ledger = getStudentLedger(studentId);
    var isAdmin = SchoolApp.isAdmin();

    var bodyHTML = '<div class="student-ledger-view">';

    // Summary mini cards
    bodyHTML += '<div class="stats-grid mb-3" style="grid-template-columns: repeat(3, 1fr); gap: 12px">';
    bodyHTML += '<div class="stat-card purple" style="padding:14px"><div class="stat-info"><div class="stat-number" style="font-size:18px">₹' + ledger.totalDues.toLocaleString('en-IN') + '</div><div class="stat-label" style="font-size:11px">Total Dues</div></div></div>';
    bodyHTML += '<div class="stat-card green" style="padding:14px"><div class="stat-info"><div class="stat-number" style="font-size:18px">₹' + ledger.totalPaid.toLocaleString('en-IN') + '</div><div class="stat-label" style="font-size:11px">Total Paid</div></div></div>';
    
    var balColor = ledger.outstanding > 0 ? 'amber' : 'cyan';
    bodyHTML += '<div class="stat-card ' + balColor + '" style="padding:14px"><div class="stat-info"><div class="stat-number" style="font-size:18px">₹' + ledger.outstanding.toLocaleString('en-IN') + '</div><div class="stat-label" style="font-size:11px">Outstanding</div></div></div>';
    bodyHTML += '</div>';

    // Ledger transactions table
    if (ledger.transactions.length > 0) {
      bodyHTML += '<div class="table-container" style="max-height: 300px; overflow-y: auto;"><table class="data-table"><thead><tr>';
      bodyHTML += '<th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th>Running Balance</th><th>Action</th>';
      bodyHTML += '</tr></thead><tbody>';

      ledger.transactions.forEach(function(t) {
        bodyHTML += '<tr>';
        bodyHTML += '<td style="font-size:12px">' + t.date + '</td>';
        bodyHTML += '<td><strong>' + t.description + '</strong>' + (t.remarks ? '<br><span style="font-size:11px;color:var(--text-muted)">' + t.remarks + '</span>' : '') + '</td>';
        
        var typeBadge = t.type === 'due' ? 'badge-danger' : 'badge-success';
        bodyHTML += '<td><span class="badge ' + typeBadge + '">' + (t.type === 'due' ? 'Due' : 'Paid') + '</span></td>';
        
        bodyHTML += '<td>₹' + t.amount.toLocaleString('en-IN') + '</td>';
        bodyHTML += '<td><strong>₹' + t.balance.toLocaleString('en-IN') + '</strong></td>';
        
        bodyHTML += '<td><div class="table-actions" style="display:flex; gap:4px; align-items:center;">';
        if (t.type === 'payment') {
          bodyHTML += '<button class="btn-icon fees-print-receipt-btn" data-student-id="' + studentId + '" data-txn-id="' + t.id + '" title="Print Fee Receipt PDF" style="color:var(--accent-secondary); min-width:32px; min-height:32px;"><span class="material-icons-round" style="font-size:18px">description</span></button>';
          bodyHTML += '<button class="btn-icon fees-whatsapp-btn" data-student-id="' + studentId + '" data-amount="' + t.amount + '" data-mode="' + (t.mode || 'Cash') + '" title="Send WhatsApp Receipt" style="color:#25D366; min-width:32px; min-height:32px;"><span class="material-icons-round" style="font-size:18px">send</span></button>';
        }
        if (isAdmin) {
          bodyHTML += '<button class="btn-icon delete-ledger-txn-btn" data-id="' + t.id + '" data-student-id="' + studentId + '" style="color:var(--danger); min-width:32px; min-height:32px;"><span class="material-icons-round" style="font-size:16px">delete</span></button>';
        }
        bodyHTML += '</div></td>';
        bodyHTML += '</tr>';
      });

      bodyHTML += '</tbody></table></div>';
    } else {
      bodyHTML += '<div class="empty-state" style="padding:24px"><span class="material-icons-round">receipt_long</span><h3>Ledger Empty</h3><p>No fee transactions recorded for this student.</p></div>';
    }

    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
    if (ledger.outstanding > 0) {
      footerHTML += '<button class="btn btn-secondary" id="ledger-modal-reminder-btn" style="background:#25D366; color:#fff; border:none; display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px">campaign</span> Send Fee Reminder</button>';
      footerHTML += '<button class="btn btn-primary" id="ledger-modal-collect-btn"><span class="material-icons-round">payments</span> Record Payment</button>';
    }

    SchoolApp.showModal(SchoolApp.getStudentFullName(s) + ' - Fee Ledger (Bahi Khata)', bodyHTML, footerHTML);

    // Event listener for ledger modals
    var colBtn = document.getElementById('ledger-modal-collect-btn');
    if (colBtn) {
      colBtn.addEventListener('click', function() {
        SchoolApp.closeModal();
        setTimeout(function() { showPaymentModal(studentId); }, 200);
      });
    }

    var remBtn = document.getElementById('ledger-modal-reminder-btn');
    if (remBtn) {
      remBtn.addEventListener('click', function() {
        SchoolApp.closeModal();
        setTimeout(function() { showFeeReminderPreviewModal(studentId); }, 200);
      });
    }

    // Ledger deletion click handlers
    document.querySelectorAll('.delete-ledger-txn-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var txnId = this.getAttribute('data-id');
        var sId = this.getAttribute('data-student-id');
        
        SchoolApp.showConfirm('Delete this transaction from the ledger? This will permanently recalculate outstanding balance.', async function() {
          var txn = (SchoolApp.store.fees || []).find(function(f) { return f.id === txnId; });
          if (txn) {
            if (typeof SchoolApp.deleteFeeTransaction === 'function') {
              await SchoolApp.deleteFeeTransaction(txnId, txn.date);
            } else {
              var idx = (SchoolApp.store.fees || []).findIndex(function(f) { return f.id === txnId; });
              if (idx !== -1) SchoolApp.store.fees.splice(idx, 1);
              SchoolApp.save();
            }
            SchoolApp.closeModal();
            SchoolApp.showToast('Transaction removed successfully!', 'success');
            setTimeout(function() { showLedgerModal(sId); }, 200);
            render();
          }
        });
      });
    });
  }

  function showPaymentModal(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var stats = getStudentFeeStats(studentId);

    var bodyHTML = '<form id="collect-payment-form" class="form-grid">';
    
    // Amount to pay
    bodyHTML += '<div class="form-group"><label class="form-label">Payment Amount (₹) *</label>';
    bodyHTML += '<input type="number" id="pay-amount" class="form-input" value="' + stats.outstanding + '" min="1" step="1" max="' + stats.outstanding + '" required>';
    bodyHTML += '</div>';

    // Payment Mode
    bodyHTML += '<div class="form-group"><label class="form-label">Payment Mode *</label>';
    bodyHTML += '<select id="pay-mode" class="form-select" required><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select>';
    bodyHTML += '</div>';

    // Payment Date
    var todayStr = new Date().toISOString().split('T')[0];
    bodyHTML += '<div class="form-group"><label class="form-label">Date *</label>';
    bodyHTML += '<input type="date" id="pay-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    // Remarks
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Remarks / Notes</label>';
    bodyHTML += '<input type="text" id="pay-remarks" class="form-input" placeholder="e.g. Receipt #1234 or UPI Txn ref">';
    bodyHTML += '</div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="collect-payment-save-btn"><span class="material-icons-round">payments</span> Record Payment</button>';

    SchoolApp.showModal('Record Payment - ' + SchoolApp.getStudentFullName(s), bodyHTML, footerHTML);

    var saveBtn = document.getElementById('collect-payment-save-btn');
    var saveBtn = document.getElementById('collect-payment-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var amt = parseFloat(document.getElementById('pay-amount').value);
        var mode = document.getElementById('pay-mode').value;
        var date = document.getElementById('pay-date').value;
        var remarks = document.getElementById('pay-remarks').value.trim();

        if (isNaN(amt) || amt <= 0) {
          SchoolApp.showToast('Please enter a valid payment amount.', 'error');
          return;
        }
        if (!date) {
          SchoolApp.showToast('Please select a payment date.', 'error');
          return;
        }

        var doSave = async function() {
          if (!SchoolApp.store.fees) SchoolApp.store.fees = [];

          var newTxn = {
            id: SchoolApp.generateId(),
            studentId: studentId,
            schoolId: SchoolApp.currentSchoolId,
            type: 'payment',
            amount: amt,
            date: date,
            mode: mode,
            remarks: remarks,
            timestamp: new Date().toISOString()
          };
          SchoolApp.store.fees.push(newTxn);

          SchoolApp.showLoader('Processing...');
          saveBtn.disabled = true;
          saveBtn.textContent = 'Processing...';
          
          var success = false;
          if (typeof SchoolApp.saveFeeTransaction === 'function') {
            success = await SchoolApp.saveFeeTransaction(newTxn);
          } else {
            success = await SchoolApp.save(true);
          }
          
          SchoolApp.hideLoader();
          saveBtn.disabled = false;
          saveBtn.textContent = 'Collect Payment';

          if (success) {
            SchoolApp.closeModal();
            SchoolApp.showToast('Payment of ₹' + amt.toLocaleString('en-IN') + ' recorded successfully!', 'success');
            render();

            // Show Post-Payment Options Modal (Print PDF, WhatsApp, Skip)
            setTimeout(function() {
              showPostPaymentOptionsModal(newTxn, studentId);
            }, 300);
          }
        };

        var ledger = getStudentLedger(studentId);
        if (ledger.outstanding <= 0) {
          var promptMsg = ledger.outstanding < 0
            ? 'This student already has an advance balance of ₹' + Math.abs(ledger.outstanding).toLocaleString('en-IN') + '. Record an additional payment of ₹' + amt.toLocaleString('en-IN') + '?'
            : 'This student has ₹0 outstanding dues. Are you sure you want to record an advance payment of ₹' + amt.toLocaleString('en-IN') + '?';

          SchoolApp.showConfirm(promptMsg, function() {
            doSave();
          });
          return;
        }

        doSave();
      });
    }
  }

  function showSingleChargeModal(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var feeHeads = getActiveFeeHeads();

    var bodyHTML = '<form id="charge-fee-form" class="form-grid">';
    
    // Fee Head Dropdown
    bodyHTML += '<div class="form-group"><label class="form-label">Fee Head Type *</label>';
    bodyHTML += '<select id="charge-feehead" class="form-select">';
    feeHeads.forEach(function(fh) {
      bodyHTML += '<option value="' + fh.id + '">' + fh.name + '</option>';
    });
    bodyHTML += '<option value="custom">Custom Non-Categorized</option>';
    bodyHTML += '</select></div>';

    // Amount
    bodyHTML += '<div class="form-group"><label class="form-label">Charge Amount (₹) *</label>';
    bodyHTML += '<input type="number" id="charge-amount" class="form-input" min="1" step="1" required>';
    bodyHTML += '</div>';

    // Due Date
    var todayStr = new Date().toISOString().split('T')[0];
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Date *</label>';
    bodyHTML += '<input type="date" id="charge-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    // Period / Description
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Billing Period / Description *</label>';
    bodyHTML += '<input type="text" id="charge-desc" class="form-input" placeholder="e.g. Monthly Tuition - June 2026 or Science Lab Fee" list="fee-head-suggestions" required>';
    bodyHTML += '</div>';

    // Note / Reason
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Note / Reason (Optional)</label>';
    bodyHTML += '<input type="text" id="charge-note" class="form-input" placeholder="e.g. Special permission or library fine details">';
    bodyHTML += '</div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="charge-fee-save-btn"><span class="material-icons-round">add_card</span> Charge Fee</button>';

    SchoolApp.showModal('Charge Custom Fee - ' + SchoolApp.getStudentFullName(s), bodyHTML, footerHTML);

    // Auto-complete default fee head amounts on select change
    var fhSelect = document.getElementById('charge-feehead');
    var amtInput = document.getElementById('charge-amount');
    
    function updateDefaultAmount() {
      var headId = fhSelect.value;
      if (headId === 'custom') return;
      var defaultAmt = getFeeAmount(s.class, headId);
      amtInput.value = defaultAmt;
    }
    
    if (fhSelect && amtInput) {
      fhSelect.addEventListener('change', updateDefaultAmount);
      updateDefaultAmount(); // Run once initially
    }

    var saveBtn = document.getElementById('charge-fee-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var headId = document.getElementById('charge-feehead').value;
        var amt = parseFloat(document.getElementById('charge-amount').value);
        var date = document.getElementById('charge-date').value;
        var desc = document.getElementById('charge-desc').value.trim();
        var note = document.getElementById('charge-note') ? document.getElementById('charge-note').value.trim() : '';

        if (isNaN(amt) || amt <= 0) {
          SchoolApp.showToast('Please enter a valid charge amount.', 'error');
          return;
        }
        if (!date) {
          SchoolApp.showToast('Please select a billing date.', 'error');
          return;
        }
        if (!desc) {
          SchoolApp.showToast('Please enter a description/period.', 'error');
          return;
        }

        if (!SchoolApp.store.fees) SchoolApp.store.fees = [];
        if (!SchoolApp.store.feeActivityLog) SchoolApp.store.feeActivityLog = [];

        var studentName = s ? (s.firstName + ' ' + s.lastName) : 'Unknown';
        var className = s ? (s.class + '-' + s.section) : '';
        var fh = getActiveFeeHeads().find(function(x) { return x.id === headId; });
        var feeHeadName = fh ? fh.name : (headId === 'custom' || !headId ? 'Custom Non-Categorized' : headId);

        var dueTxn = {
          id: SchoolApp.generateId(),
          studentId: studentId,
          schoolId: SchoolApp.currentSchoolId,
          type: 'due',
          feeHeadId: headId === 'custom' ? null : headId,
          amount: amt,
          date: date,
          description: desc
        };
        SchoolApp.store.fees.push(dueTxn);

        SchoolApp.store.feeActivityLog.push({
          id: SchoolApp.generateId(),
          timestamp: new Date().toISOString(),
          studentId: studentId,
          studentName: studentName,
          className: className,
          feeHeadName: feeHeadName,
          amount: amt,
          addedBy: SchoolApp.currentUser ? (SchoolApp.currentUser.username || SchoolApp.currentUser.firstName || 'admin') : 'admin',
          note: note
        });

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        var success = false;
        if (typeof SchoolApp.saveFeeTransaction === 'function') {
          success = await SchoolApp.saveFeeTransaction(dueTxn);
        } else {
          success = await SchoolApp.save();
        }
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add Charge';

        if (success) {
          SchoolApp.closeModal();
          SchoolApp.showToast('Fee charged to ledger successfully!', 'success');
          render();
        }
      });
    }
  }

  function showBulkChargeModal() {
    var feeHeads = getActiveFeeHeads();
    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];

    var bodyHTML = '<form id="bulk-charge-form" class="form-grid">';
    
    // Select Class
    bodyHTML += '<div class="form-group"><label class="form-label">Target Class *</label>';
    bodyHTML += '<select id="bulk-class" class="form-select">';
    bodyHTML += '<option value="all">All Classes (Entire School)</option>';
    classes.forEach(function(c) {
      bodyHTML += '<option value="' + c + '">' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
    });
    bodyHTML += '</select></div>';

    // Fee Head
    bodyHTML += '<div class="form-group"><label class="form-label">Fee Head Type *</label>';
    bodyHTML += '<select id="bulk-feehead" class="form-select">';
    feeHeads.forEach(function(fh) {
      bodyHTML += '<option value="' + fh.id + '">' + fh.name + '</option>';
    });
    bodyHTML += '</select></div>';

    // Billing Date
    var todayStr = new Date().toISOString().split('T')[0];
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Date *</label>';
    bodyHTML += '<input type="date" id="bulk-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    // Period / Description
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Period / Description *</label>';
    bodyHTML += '<input type="text" id="bulk-desc" class="form-input" placeholder="e.g. Monthly Tuition - June 2026" list="fee-head-suggestions" required>';
    bodyHTML += '</div>';

    // Note / Reason
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Note / Reason (Optional)</label>';
    bodyHTML += '<input type="text" id="bulk-note" class="form-input" placeholder="e.g. Term charge or annual fine reason">';
    bodyHTML += '</div>';

    // Auto Monthly Fee Controls
    bodyHTML += '<div class="form-group full-width" style="border-top: 1px solid var(--border-color); padding-top: 16px; margin-top: 12px;">';
    bodyHTML += '<h4 style="margin-bottom: 8px; font-size: 14px; font-weight: 600; color: var(--text-primary);">⚡ Automated Monthly Fee Settings</h4>';
    bodyHTML += '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">';
    bodyHTML += '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; cursor: pointer;">';
    bodyHTML += '<input type="checkbox" id="auto-charge-enabled"' + (settings.autoChargeEnabled ? ' checked' : '') + ' style="width: 16px; height: 16px; accent-color: var(--accent-primary);">';
    bodyHTML += '<span>Enable Auto Monthly Fee Charge</span>';
    bodyHTML += '</label>';
    bodyHTML += '</div>';
    bodyHTML += '<div class="form-group" style="margin-bottom: 0;">';
    bodyHTML += '<label class="form-label">Auto-Charge Trigger Day of Month</label>';
    bodyHTML += '<select id="auto-charge-trigger-date" class="form-select">';
    [1, 5, 10, 15, 20, 25].forEach(function(d) {
      bodyHTML += '<option value="' + d + '"' + ((settings.autoChargeTriggerDate || 1) == d ? ' selected' : '') + '>' + d + (d === 1 ? 'st' : 'th') + ' of the month</option>';
    });
    bodyHTML += '</select>';
    bodyHTML += '</div></div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="bulk-charge-save-btn"><span class="material-icons-round">campaign</span> Generate Dues</button>';

    SchoolApp.showModal('Bulk Charge Class Dues', bodyHTML, footerHTML);

    var saveBtn = document.getElementById('bulk-charge-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var cls = document.getElementById('bulk-class').value;
        var headId = document.getElementById('bulk-feehead').value;
        var date = document.getElementById('bulk-date').value;
        var desc = document.getElementById('bulk-desc').value.trim();
        var note = document.getElementById('bulk-note') ? document.getElementById('bulk-note').value.trim() : '';

        var autoEnabled = document.getElementById('auto-charge-enabled') ? document.getElementById('auto-charge-enabled').checked : false;
        var triggerDay = document.getElementById('auto-charge-trigger-date') ? parseInt(document.getElementById('auto-charge-trigger-date').value, 10) : 1;

        if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
        SchoolApp.store.settings.autoChargeEnabled = autoEnabled;
        SchoolApp.store.settings.autoChargeTriggerDate = triggerDay;

        if (!date) {
          SchoolApp.showToast('Please select a billing date.', 'error');
          return;
        }
        if (!desc) {
          SchoolApp.showToast('Please enter a description/period.', 'error');
          return;
        }

        // Get students to charge
        var students = SchoolApp.store.students || [];
        if (cls !== 'all') {
          students = students.filter(function(s) { return s.class === cls; });
        }

        if (students.length === 0) {
          SchoolApp.showToast('No students found in selected class(es).', 'error');
          return;
        }

        if (!SchoolApp.store.fees) SchoolApp.store.fees = [];
        if (!SchoolApp.store.feeActivityLog) SchoolApp.store.feeActivityLog = [];

        var chargedCount = 0;
        var fh = getActiveFeeHeads().find(function(x) { return x.id === headId; });
        var feeHeadName = fh ? fh.name : headId;
        var adminName = SchoolApp.currentUser ? (SchoolApp.currentUser.username || SchoolApp.currentUser.firstName || 'admin') : 'admin';

        SchoolApp.createRestorePoint('Auto-Backup before Bulk Fee Generation for Class ' + cls);

        var generatedTxns = [];
        students.forEach(function(s) {
          var defaultAmt = getFeeAmount(s.class, headId);
          
          if (defaultAmt > 0) {
            var newTxn = {
              id: SchoolApp.generateId(),
              studentId: s.id,
              schoolId: SchoolApp.currentSchoolId,
              type: 'due',
              feeHeadId: headId,
              amount: defaultAmt,
              date: date,
              description: desc
            };
            SchoolApp.store.fees.push(newTxn);
            generatedTxns.push(newTxn);

            SchoolApp.store.feeActivityLog.push({
              id: SchoolApp.generateId(),
              timestamp: new Date().toISOString(),
              studentId: s.id,
              studentName: s.firstName + ' ' + s.lastName,
              className: s.class + '-' + s.section,
              feeHeadName: feeHeadName,
              amount: defaultAmt,
              addedBy: adminName,
              note: note
            });

            chargedCount++;
          }
        });

        if (chargedCount > 0) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
          var success = false;
          if (typeof SchoolApp.saveFeeTransactions === 'function') {
            success = await SchoolApp.saveFeeTransactions(generatedTxns);
          } else {
            success = await SchoolApp.save();
          }
          saveBtn.disabled = false;
          saveBtn.textContent = 'Generate Dues';

          if (success) {
            SchoolApp.closeModal();
            SchoolApp.showToast('Charged default fee dues to ' + chargedCount + ' students successfully!', 'success');
            render();
          }
        } else {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving Settings...';
          await SchoolApp.save();
          saveBtn.disabled = false;
          saveBtn.textContent = 'Generate Dues';
          SchoolApp.closeModal();
          SchoolApp.showToast('Auto-charge settings saved.', 'info');
        }
      });
    }
  }

  function attachStaticEvents() {
    // Tab toggles
    var tabBtnStudents = document.getElementById('btn-tab-students');
    if (tabBtnStudents) {
      tabBtnStudents.addEventListener('click', function() {
        state.activeTab = 'students';
        render();
      });
    }

    var tabBtnHistory = document.getElementById('btn-tab-history');
    if (tabBtnHistory) {
      tabBtnHistory.addEventListener('click', function() {
        state.activeTab = 'history';
        render();
      });
    }

    var tabBtnLedger = document.getElementById('btn-tab-ledger');
    if (tabBtnLedger) {
      tabBtnLedger.addEventListener('click', function() {
        state.activeTab = 'ledger';
        render();
      });
    }

    // Search
    var searchInput = document.getElementById('fees-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        state.searchQuery = this.value;
        state.currentPage = 1;
        render();
      });
    }

    var ledgerSearch = document.getElementById('fees-ledger-search');
    if (ledgerSearch) {
      ledgerSearch.addEventListener('input', function() {
        state.ledgerSearchQuery = this.value;
        render();
      });
    }

    // Defaulters Filter Checkbox Toggle
    var defaulterToggle = document.getElementById('defaulters-only-toggle');
    if (defaulterToggle) {
      defaulterToggle.addEventListener('change', function() {
        state.statusFilter = this.checked ? 'unpaid' : 'all';
        state.currentPage = 1;
        render();
      });
    }

    // Class Filter
    var classFilter = document.getElementById('fees-class-filter');
    if (classFilter) {
      classFilter.addEventListener('change', function() {
        state.classFilter = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Section Filter
    var sectionFilter = document.getElementById('fees-section-filter');
    if (sectionFilter) {
      sectionFilter.addEventListener('change', function() {
        state.sectionFilter = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Fee Status Filter
    var statusFilter = document.getElementById('fees-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function() {
        state.statusFilter = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Bulk Charge
    var bulkChargeBtn = document.getElementById('bulk-charge-fee-btn');
    if (bulkChargeBtn) {
      bulkChargeBtn.addEventListener('click', showBulkChargeModal);
    }

    // Bulk Fee Reminders
    document.querySelectorAll('.bulk-fee-reminders-btn').forEach(function(btn) {
      btn.addEventListener('click', showBulkFeeRemindersModal);
    });

    // --- History Tab Events ---

    // History Search
    var historySearch = document.getElementById('fees-history-search');
    if (historySearch) {
      historySearch.addEventListener('input', function() {
        state.historySearchQuery = this.value;
        state.historyCurrentPage = 1;
        render();
      });
    }

    // History Class Filter
    var historyClass = document.getElementById('fees-history-class-filter');
    if (historyClass) {
      historyClass.addEventListener('change', function() {
        state.historyClassFilter = this.value;
        state.historyCurrentPage = 1;
        render();
      });
    }

    // History Type Filter
    var historyType = document.getElementById('fees-history-type-filter');
    if (historyType) {
      historyType.addEventListener('change', function() {
        state.historyTypeFilter = this.value;
        state.historyCurrentPage = 1;
        render();
      });
    }

    // History Start Date
    var historyStart = document.getElementById('fees-history-start-date');
    if (historyStart) {
      historyStart.addEventListener('input', async function() {
        state.historyStartDate = this.value;
        state.historyCurrentPage = 1;
        var yr = (this.value || '').slice(0, 4);
        if (yr && typeof SchoolApp.loadFeesYear === 'function') {
          await SchoolApp.loadFeesYear(yr);
        }
        render();
      });
    }

    // History End Date
    var historyEnd = document.getElementById('fees-history-end-date');
    if (historyEnd) {
      historyEnd.addEventListener('input', async function() {
        state.historyEndDate = this.value;
        state.historyCurrentPage = 1;
        var yr = (this.value || '').slice(0, 4);
        if (yr && typeof SchoolApp.loadFeesYear === 'function') {
          await SchoolApp.loadFeesYear(yr);
        }
        render();
      });
    }

    // PDF Export
    var exportPdf = document.getElementById('fees-export-pdf-btn');
    if (exportPdf) {
      exportPdf.addEventListener('click', function() {
        exportHistoryToPDF();
      });
    }

    // Excel Export
    var exportExcel = document.getElementById('fees-export-excel-btn');
    if (exportExcel) {
      exportExcel.addEventListener('click', function() {
        exportHistoryToExcel();
      });
    }
  }

  function attachDynamicEvents() {
    // Record Payment
    document.querySelectorAll('.fees-collect-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showPaymentModal(this.getAttribute('data-id'));
      });
    });

    // Send WhatsApp Receipt
    document.querySelectorAll('.fees-whatsapp-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var studentId = this.getAttribute('data-student-id');
        var amount = parseFloat(this.getAttribute('data-amount') || 0);
        var mode = this.getAttribute('data-mode') || 'Cash';
        sendWhatsAppReceipt(studentId, amount, mode);
      });
    });

    // Print Fee Receipt PDF
    document.querySelectorAll('.fees-print-receipt-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var studentId = this.getAttribute('data-student-id');
        var txnId = this.getAttribute('data-txn-id');
        printFeeReceipt(txnId, studentId);
      });
    });

    // View Ledger
    document.querySelectorAll('.fees-ledger-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showLedgerModal(this.getAttribute('data-id'));
      });
    });

    // Charge Custom Fee
    document.querySelectorAll('.fees-charge-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showSingleChargeModal(this.getAttribute('data-id'));
      });
    });

    // Fee Reminder Preview
    document.querySelectorAll('.fees-reminder-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showFeeReminderPreviewModal(this.getAttribute('data-id'));
      });
    });

    // Pagination clicks
    document.querySelectorAll('.pagination-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var page = this.getAttribute('data-page');
        if (page === 'prev') {
          state.currentPage--;
        } else if (page === 'next') {
          state.currentPage++;
        } else {
          state.currentPage = parseInt(page);
        }
        render();
      });
    });
  }

  // Expose Core Calculation Engine & Reminder Helpers
  window.generateFeeStatement = generateFeeStatement;
  window.buildFeeReminderMessage = buildFeeReminderMessage;
  window.buildFeeReminderSMS = buildFeeReminderSMS;
  window.calculateMonthsOverdue = calculateMonthsOverdue;
  window.getUncoveredTuitionMonths = getUncoveredTuitionMonths;
  window.logFeeReminder = logFeeReminder;
  window.showFeeReminderPreviewModal = showFeeReminderPreviewModal;
  window.showBulkFeeRemindersModal = showBulkFeeRemindersModal;

  SchoolApp.generateFeeStatement = generateFeeStatement;
  SchoolApp.buildFeeReminderMessage = buildFeeReminderMessage;
  SchoolApp.buildFeeReminderSMS = buildFeeReminderSMS;
  SchoolApp.showFeeReminderPreviewModal = showFeeReminderPreviewModal;
  SchoolApp.showBulkFeeRemindersModal = showBulkFeeRemindersModal;

  // Register Module
  SchoolApp.registerModule('fees', {
    init: function() {
      checkAndRunAutoCharge();
    },
    render: function(c) {
      checkAndRunAutoCharge();
      render(c);
    },
    cleanup: function() {
      console.log("Fees module unmounted/cleaned up.");
    }
  });

})();

