'use strict';

/* ============================================================
   Shishu Vikash Mandir - Teacher Attendance & GPS Geofence Module
   Area 3: Geofence Policy Mode, Enhanced Correction Audit Trail,
   and Downloadable Attendance Reports
   ============================================================ */

(function() {

  // Dynamic Coordinates & Geofence Settings Loader
  function getGeofenceSettings() {
    var s = SchoolApp.store.settings || {};
    var g = s.geofence;
    
    // If SVM and geofence is not set, initialize it with Chandrapura coordinates
    var isSVM = SchoolApp.store.currentSchoolId === 'svm_bokaro_001';
    if (!g && isSVM) {
      return {
        lat: 23.7588,
        lng: 86.1179,
        radius: 200,
        policy: 'lenient'
      };
    }
    
    return {
      lat: g && g.lat !== undefined && g.lat !== null && g.lat !== '' ? parseFloat(g.lat) : null,
      lng: g && g.lng !== undefined && g.lng !== null && g.lng !== '' ? parseFloat(g.lng) : null,
      radius: g && g.radius !== undefined && g.radius !== null && g.radius !== '' ? parseInt(g.radius, 10) : 200,
      policy: (g && g.policy) ? g.policy : 'lenient' // Explicitly defaults to 'lenient' for backwards compatibility
    };
  }

  var todayStr = new Date().toISOString().split('T')[0];
  var firstDayOfMonth = todayStr.substring(0, 8) + '01';

  var state = {
    activeTab: 'approvals', // 'approvals' | 'logs' | 'summary'
    selectedDate: todayStr, // YYYY-MM-DD for single day log
    teacherFilter: 'all',
    geoFilter: 'all',
    reqStatusFilter: 'Pending',
    adminStartDate: firstDayOfMonth,
    adminEndDate: todayStr,
    teacherStartDate: firstDayOfMonth,
    teacherEndDate: todayStr,
    clockInterval: null,
    lastCapturedLocation: null
  };

  // Haversine formula to compute distance between coordinates in meters
  function calculateDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return 0;
    var R = 6371e3; // Earth radius in meters
    var phi1 = lat1 * Math.PI / 180;
    var phi2 = lat2 * Math.PI / 180;
    var deltaPhi = (lat2 - lat1) * Math.PI / 180;
    var deltaLambda = (lon2 - lon1) * Math.PI / 180;

    var a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // In meters
  }

  function getTodayPunchStatus(teacherId) {
    var curToday = new Date().toISOString().split('T')[0];
    var punches = (SchoolApp.store.teacherAttendance || []).filter(function(p) {
      return p.teacherId === teacherId && p.date === curToday;
    });

    punches.sort(function(a, b) {
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    var punchIn = punches.find(function(p) { return p.type === 'in'; });
    var punchOut = punches.find(function(p) { return p.type === 'out'; });

    return {
      punchIn: punchIn,
      punchOut: punchOut
    };
  }

  function punch(type) {
    if (!navigator.geolocation) {
      SchoolApp.showToast('Geolocation is not supported by your browser.', 'error');
      return;
    }

    var geo = getGeofenceSettings();
    if (geo.lat === null || geo.lng === null) {
      SchoolApp.showToast('School location has not been configured by the administrator yet. Please configure it in Geofence Settings.', 'error');
      return;
    }

    SchoolApp.showToast('Capturing GPS coordinates...', 'info');

    navigator.geolocation.getCurrentPosition(function(position) {
      var lat = position.coords.latitude;
      var lon = position.coords.longitude;
      
      var distance = calculateDistance(lat, lon, geo.lat, geo.lng);
      var isInside = distance <= geo.radius;
      var geofenceStatus = isInside ? 'Inside Geofence' : 'Outside Geofence';

      var curDate = new Date().toISOString().split('T')[0];
      var timeStr = new Date().toTimeString().split(' ')[0]; // HH:MM:SS

      state.lastCapturedLocation = {
        latitude: lat.toFixed(5),
        longitude: lon.toFixed(5),
        distance: Math.round(distance),
        status: geofenceStatus
      };

      // STEP 2B: Location Enforcement
      if (!isInside) {
        if (type === 'in') {
          // Punch In outside location: DO NOT auto-mark attendance
          render();
          showOutsideLocationPrompt(Math.round(distance), geo.radius, {
            latitude: lat,
            longitude: lon,
            distance: Math.round(distance)
          }, curDate, timeStr.substring(0, 5));
          return;
        } else {
          // Punch Out outside location: ALLOW (to prevent teacher from being stuck)
          var punchOutRecord = {
            id: SchoolApp.generateId(),
            teacherId: SchoolApp.currentUser.id,
            teacherName: (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim(),
            date: curDate,
            type: 'out',
            time: timeStr,
            timestamp: new Date().toISOString(),
            latitude: lat,
            longitude: lon,
            distance: Math.round(distance),
            geofenceStatus: geofenceStatus,
            outsideGeofence: true,
            outsideLocationFlag: true,
            markedVia: 'location_auto',
            method: 'GPS',
            isCorrected: false
          };

          if (!SchoolApp.store.teacherAttendance) {
            SchoolApp.store.teacherAttendance = [];
          }
          SchoolApp.store.teacherAttendance.push(punchOutRecord);
          SchoolApp.save();

          SchoolApp.showToast('Checked Out outside school radius (' + Math.round(distance) + 'm). Attendance locked.', 'warning');
          render();
          return;
        }
      }

      // Inside Geofence: Auto-mark attendance
      var punchRecord = {
        id: SchoolApp.generateId(),
        teacherId: SchoolApp.currentUser.id,
        teacherName: (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim(),
        date: curDate,
        type: type,
        time: timeStr,
        timestamp: new Date().toISOString(),
        latitude: lat,
        longitude: lon,
        distance: Math.round(distance),
        geofenceStatus: geofenceStatus,
        outsideGeofence: false,
        outsideLocationFlag: false,
        markedVia: 'location_auto',
        method: 'GPS',
        isCorrected: false
      };

      if (!SchoolApp.store.teacherAttendance) {
        SchoolApp.store.teacherAttendance = [];
      }

      SchoolApp.store.teacherAttendance.push(punchRecord);
      SchoolApp.save();

      var successMsg = 'Attendance marked: Checked ' + (type === 'in' ? 'In' : 'Out') + '. Status: ' + geofenceStatus;
      SchoolApp.showToast(successMsg, 'success');
      render();
    }, function(error) {
      console.error('Geolocation failure:', error);
      var errorMsg = 'Failed to capture GPS coordinates. Please check your browser location access settings.';
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = 'Location permission was denied. Please allow location access to register punches.';
      }
      SchoolApp.showToast(errorMsg, 'error');
    });
  }

  // STEP 2B: Outside Location Bilingual Prompt
  function showOutsideLocationPrompt(distance, allowedRadius, coords, date, timeIn) {
    var bodyHTML = '<div style="text-align:center; padding: 12px 6px;">';
    bodyHTML += '  <div style="width:64px; height:64px; border-radius:50%; background:rgba(239, 68, 68, 0.12); color:var(--danger); display:grid; place-items:center; margin:0 auto 16px auto;">';
    bodyHTML += '    <span class="material-icons-round" style="font-size:36px;">wrong_location</span>';
    bodyHTML += '  </div>';
    bodyHTML += '  <h3 style="margin-bottom:8px; font-size:17px; color:var(--text-primary);">School Location se Bahar Hain</h3>';
    bodyHTML += '  <p style="font-size:14px; color:var(--text-secondary); line-height:1.5; margin-bottom:14px;">';
    bodyHTML += '    Aap school location se <strong>' + distance + 'm</strong> door hain (Allowed radius: <strong>' + allowedRadius + 'm</strong>).<br>Attendance automatically mark nahi ho sakti.';
    bodyHTML += '  </p>';
    bodyHTML += '  <p style="font-size:13.5px; font-weight:600; color:var(--text-primary); margin-bottom:0;">';
    bodyHTML += '    Kya aap <strong>Attendance Regularization Request</strong> submit karna chahte hain?';
    bodyHTML += '  </p>';
    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="btn-prompt-submit-req"><span class="material-icons-round">edit_calendar</span> Submit Request</button>';

    SchoolApp.showModal('Location Check Alert', bodyHTML, footerHTML);

    document.getElementById('btn-prompt-submit-req').addEventListener('click', function() {
      SchoolApp.closeModal();
      setTimeout(function() {
        showRegularizationModal({
          date: date,
          timeIn: timeIn,
          coords: coords
        });
      }, 200);
    });
  }

  // Admin Geofence Settings Modal (Area 3a)
  function showGeofenceSettingsModal() {
    var geo = getGeofenceSettings();
    var curLat = geo.lat !== null ? geo.lat : '';
    var curLng = geo.lng !== null ? geo.lng : '';
    var curRadius = geo.radius || 200;
    var curPolicy = geo.policy || 'strict';

    var bodyHTML = '<form id="geofence-settings-form" class="form-grid" style="display:flex; flex-direction:column; gap:16px;">';
    
    bodyHTML += '  <div style="background:rgba(6, 182, 212, 0.08); border:1px solid rgba(6, 182, 212, 0.25); border-radius:8px; padding:12px 16px; font-size:13px; color:var(--text-secondary); line-height:1.5;">';
    bodyHTML += '    <strong style="color:var(--text-primary); display:flex; align-items:center; gap:6px; margin-bottom:4px;"><span class="material-icons-round" style="color:#06b6d4; font-size:18px;">my_location</span> School Location & Radius</strong>';
    bodyHTML += '    Teachers must be within this geographic boundary to mark attendance. Punches outside the radius are enforced according to the selected policy.';
    bodyHTML += '  </div>';

    bodyHTML += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size:11.5px; font-weight:700;">School Latitude *</label>';
    bodyHTML += '      <input type="number" step="any" id="geo-lat" class="form-input" value="' + curLat + '" placeholder="e.g. 23.7588" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size:11.5px; font-weight:700;">School Longitude *</label>';
    bodyHTML += '      <input type="number" step="any" id="geo-lng" class="form-input" value="' + curLng + '" placeholder="e.g. 86.1179" required>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div style="text-align:right;">';
    bodyHTML += '    <button type="button" class="btn btn-secondary btn-xs" id="btn-detect-gps-loc" style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px;"><span class="material-icons-round" style="font-size:14px;">gps_fixed</span> Use My Current Location</button>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:11.5px; font-weight:700;">Allowed Geofence Radius (meters) *</label>';
    bodyHTML += '    <input type="number" id="geo-radius" class="form-input" min="20" max="5000" value="' + curRadius + '" required>';
    bodyHTML += '    <div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">Recommended: 200m for campus area.</div>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:11.5px; font-weight:700;">Enforcement Policy Mode *</label>';
    bodyHTML += '    <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">';
    bodyHTML += '      <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; cursor:pointer;">';
    bodyHTML += '        <input type="radio" name="geo-policy" value="strict" ' + (curPolicy === 'strict' ? 'checked' : '') + ' style="margin-top:2px;">';
    bodyHTML += '        <div><strong style="color:var(--danger);">Strict Mode (Recommended)</strong><div style="font-size:11.5px; color:var(--text-muted);">Blocks punches if teacher is outside the radius. Teacher must submit manual correction request.</div></div>';
    bodyHTML += '      </label>';
    bodyHTML += '      <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; cursor:pointer;">';
    bodyHTML += '        <input type="radio" name="geo-policy" value="lenient" ' + (curPolicy === 'lenient' ? 'checked' : '') + ' style="margin-top:2px;">';
    bodyHTML += '        <div><strong style="color:var(--warning);">Lenient Mode</strong><div style="font-size:11.5px; color:var(--text-muted);">Allows punches from anywhere, but flags outside punches with warning tags for admin audit.</div></div>';
    bodyHTML += '      </label>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="btn-save-geofence-settings"><span class="material-icons-round">save</span> Save Settings</button>';

    SchoolApp.showModal('Geofence & Location Settings', bodyHTML, footerHTML);

    document.getElementById('btn-detect-gps-loc').addEventListener('click', function() {
      if (!navigator.geolocation) {
        SchoolApp.showToast('Geolocation not supported on this device.', 'error');
        return;
      }
      SchoolApp.showToast('Detecting GPS location...', 'info');
      navigator.geolocation.getCurrentPosition(function(pos) {
        document.getElementById('geo-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('geo-lng').value = pos.coords.longitude.toFixed(6);
        SchoolApp.showToast('Location coordinates detected.', 'success');
      }, function(err) {
        SchoolApp.showToast('Could not fetch location: ' + err.message, 'error');
      });
    });

    document.getElementById('btn-save-geofence-settings').addEventListener('click', function() {
      var latVal = parseFloat(document.getElementById('geo-lat').value);
      var lngVal = parseFloat(document.getElementById('geo-lng').value);
      var radiusVal = parseInt(document.getElementById('geo-radius').value, 10);
      var selectedRadio = document.querySelector('input[name="geo-policy"]:checked');
      var policyVal = selectedRadio ? selectedRadio.value : 'strict';

      if (isNaN(latVal) || isNaN(lngVal) || isNaN(radiusVal) || radiusVal <= 0) {
        SchoolApp.showToast('Please enter valid latitude, longitude, and positive radius.', 'error');
        return;
      }

      if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
      SchoolApp.store.settings.geofence = {
        lat: latVal,
        lng: lngVal,
        radius: radiusVal,
        policy: policyVal
      };

      SchoolApp.save(true);
      SchoolApp.closeModal();
      SchoolApp.showToast('Geofence settings updated successfully.', 'success');
      render();
    });
  }

  // STEP 2C: Teacher Regularization Request Modal
  function showRegularizationModal(prefill) {
    prefill = prefill || {};
    var curToday = new Date().toISOString().split('T')[0];
    var reqDate = prefill.date || curToday;
    var reqTimeIn = prefill.timeIn || '08:00';
    var reqTimeOut = prefill.timeOut || '';
    var coords = prefill.coords || (state.lastCapturedLocation ? {
      latitude: parseFloat(state.lastCapturedLocation.latitude),
      longitude: parseFloat(state.lastCapturedLocation.longitude),
      distance: state.lastCapturedLocation.distance
    } : null);

    var bodyHTML = '<form id="regularization-request-form" class="form-grid" style="display:flex; flex-direction:column; gap:14px;">';
    
    bodyHTML += '  <div style="background:rgba(6, 182, 212, 0.08); border:1px solid rgba(6, 182, 212, 0.25); border-radius:8px; padding:12px 14px; font-size:12.5px; color:var(--text-secondary); line-height:1.5;">';
    bodyHTML += '    <strong style="color:var(--text-primary); display:flex; align-items:center; gap:6px; margin-bottom:4px;"><span class="material-icons-round" style="color:#06b6d4; font-size:18px;">assignment</span> Attendance Regularization Request</strong>';
    bodyHTML += '    Submit your actual work times and reason for administrator review and approval.';
    if (coords && !isNaN(coords.distance)) {
      bodyHTML += '    <div style="margin-top:6px; font-size:11.5px; color:var(--text-muted);"><span class="material-icons-round" style="font-size:13px; vertical-align:middle;">pin_drop</span> Outside Radius: ' + coords.latitude + ', ' + coords.longitude + ' (' + coords.distance + 'm from campus)</div>';
    }
    bodyHTML += '  </div>';

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:12px; font-weight:700;">Date *</label>';
    bodyHTML += '    <input type="date" id="req-date" class="form-input" max="' + curToday + '" value="' + reqDate + '" required>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size:12px; font-weight:700;">Punch In Time *</label>';
    bodyHTML += '      <input type="time" id="req-time-in" class="form-input" value="' + reqTimeIn + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size:12px; font-weight:700;">Punch Out Time (Optional)</label>';
    bodyHTML += '      <input type="time" id="req-time-out" class="form-input" value="' + reqTimeOut + '">';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:12px; font-weight:700;">Reason for Regularization * (Min 10 characters)</label>';
    bodyHTML += '    <textarea id="req-reason" class="form-textarea" rows="3" placeholder="e.g. Field duty assignment, official school visit, or GPS error" required minlength="10"></textarea>';
    bodyHTML += '  </div>';
    
    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="btn-submit-regularization"><span class="material-icons-round">send</span> Submit Request</button>';

    SchoolApp.showModal('Attendance Regularization Request', bodyHTML, footerHTML);

    document.getElementById('btn-submit-regularization').addEventListener('click', function() {
      var dateVal = document.getElementById('req-date').value;
      var timeInVal = document.getElementById('req-time-in').value;
      var timeOutVal = document.getElementById('req-time-out').value;
      var reasonVal = (document.getElementById('req-reason').value || '').trim();

      if (!dateVal || !timeInVal) {
        SchoolApp.showToast('Please specify date and Punch In time.', 'error');
        return;
      }

      if (reasonVal.length < 10) {
        SchoolApp.showToast('Please enter a detailed reason (minimum 10 characters).', 'error');
        return;
      }

      var teacherId = SchoolApp.currentUser.id;

      // Duplicate request check for same date (Pending)
      var allRequests = SchoolApp.store.attendanceRequests || SchoolApp.store.teacherCorrectionRequests || [];
      var isDuplicate = allRequests.some(function(r) {
        var rD = r.requestDate || r.date;
        var rS = (r.status || '').toLowerCase();
        return r.teacherId === teacherId && rD === dateVal && rS === 'pending';
      });

      if (isDuplicate) {
        SchoolApp.showToast('A pending regularization request for ' + SchoolApp.formatDate(dateVal) + ' already exists. Duplicate requests are not allowed.', 'warning');
        return;
      }

      var request = {
        id: SchoolApp.generateId(),
        teacherId: teacherId,
        teacherName: (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim(),
        requestDate: dateVal,
        date: dateVal,
        requestedPunchIn: timeInVal,
        timeIn: timeInVal,
        requestedPunchOut: timeOutVal || null,
        timeOut: timeOutVal || null,
        statusRequested: 'Present',
        reason: reasonVal,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        adminNote: null,
        adminNotes: null,
        outsideLocationCoords: coords || null
      };

      if (!SchoolApp.store.attendanceRequests) SchoolApp.store.attendanceRequests = [];
      if (!SchoolApp.store.teacherCorrectionRequests) SchoolApp.store.teacherCorrectionRequests = [];

      SchoolApp.store.attendanceRequests.push(request);
      SchoolApp.store.teacherCorrectionRequests.push(request);

      SchoolApp.save();
      SchoolApp.closeModal();
      SchoolApp.showToast('Request submitted. Pending Admin approval.', 'success');
      render();
    });
  }

  function showCorrectionModal() {
    showRegularizationModal();
  }

  function showGpsFallbackModal() {
    showRegularizationModal();
  }

  // Admin Review / Approval with full audit trail (Step 2D)
  function showReviewCorrectionModal(requestId, approve) {
    var allRequests = SchoolApp.store.attendanceRequests || SchoolApp.store.teacherCorrectionRequests || [];
    var request = allRequests.find(function(r) { return r.id === requestId; });
    if (!request) {
      SchoolApp.showToast('Request not found.', 'error');
      return;
    }

    var reqDate = request.requestDate || request.date;
    var timeIn = request.requestedPunchIn || request.timeIn || '—';
    var timeOut = request.requestedPunchOut || request.timeOut || '—';
    var loc = request.outsideLocationCoords;

    // Check for existing punches on this date (conflict detection)
    var existingPunches = (SchoolApp.store.teacherAttendance || []).filter(function(p) {
      return p.teacherId === request.teacherId && p.date === reqDate;
    });

    var bodyHTML = '<div class="form-grid" style="display:flex; flex-direction:column; gap:14px;">';

    // Summary Card
    bodyHTML += '  <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:8px; padding:12px 14px; font-size:13px; line-height:1.6;">';
    bodyHTML += '    <div><strong>Teacher:</strong> ' + request.teacherName + '</div>';
    bodyHTML += '    <div><strong>Date:</strong> ' + SchoolApp.formatDate(reqDate) + '</div>';
    bodyHTML += '    <div><strong>Time:</strong> Punch In: ' + timeIn + ' | Punch Out: ' + timeOut + '</div>';
    bodyHTML += '    <div><strong>Reason:</strong> <span style="color:var(--text-secondary);">' + request.reason + '</span></div>';
    if (loc && loc.distance) {
      bodyHTML += '    <div style="margin-top:4px; font-size:12px; color:var(--text-muted);"><span class="material-icons-round" style="font-size:13px; vertical-align:middle;">pin_drop</span> GPS: ' + loc.latitude + ', ' + loc.longitude + ' (' + loc.distance + 'm outside campus)</div>';
    }
    bodyHTML += '  </div>';

    // Conflict Warning if existing punches found
    if (approve && existingPunches.length > 0) {
      bodyHTML += '  <div style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.3); border-radius:8px; padding:10px 14px; font-size:12px; color:#f59e0b; line-height:1.4;">';
      bodyHTML += '    <strong style="display:flex; align-items:center; gap:6px; margin-bottom:2px;"><span class="material-icons-round" style="font-size:16px;">warning</span> Conflict Notice</strong>';
      bodyHTML += '    This teacher already has <strong>' + existingPunches.length + '</strong> punch record(s) on this date. Approving will record this approved regularization and preserve previous records in the audit history.';
      bodyHTML += '  </div>';
    }

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:12px; font-weight:700;">Admin Review Note (Optional)</label>';
    bodyHTML += '    <textarea id="admin-review-note" class="form-textarea" rows="2" placeholder="' + (approve ? 'e.g. Approved as per official duty slip' : 'e.g. Outside campus without prior authorization') + '"></textarea>';
    bodyHTML += '  </div>';
    bodyHTML += '</div>';

    var actionBtnColor = approve ? 'btn-primary' : 'btn-danger';
    var actionBtnIcon = approve ? 'check_circle' : 'cancel';
    var actionBtnLabel = approve ? 'Approve Regularization' : 'Reject Request';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn ' + actionBtnColor + '" id="btn-confirm-review-action"><span class="material-icons-round">' + actionBtnIcon + '</span> ' + actionBtnLabel + '</button>';

    var modalTitle = approve ? 'Approve Attendance Regularization' : 'Reject Regularization Request';
    SchoolApp.showModal(modalTitle, bodyHTML, footerHTML);

    document.getElementById('btn-confirm-review-action').addEventListener('click', function() {
      var noteVal = (document.getElementById('admin-review-note').value || '').trim();
      SchoolApp.closeModal();
      processCorrection(requestId, approve, noteVal);
    });
  }

  function processCorrection(requestId, approve, reviewNotes) {
    var adminName = (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim() || SchoolApp.currentUser.username || 'Administrator';
    var nowISO = new Date().toISOString();

    // Ensure collections exist
    if (!SchoolApp.store.attendanceRequests) SchoolApp.store.attendanceRequests = [];
    if (!SchoolApp.store.teacherCorrectionRequests) SchoolApp.store.teacherCorrectionRequests = [];
    if (!SchoolApp.store.teacherAttendance) SchoolApp.store.teacherAttendance = [];

    var reqIdx1 = SchoolApp.store.attendanceRequests.findIndex(function(r) { return r.id === requestId; });
    var reqIdx2 = SchoolApp.store.teacherCorrectionRequests.findIndex(function(r) { return r.id === requestId; });

    var request = (reqIdx1 !== -1) ? SchoolApp.store.attendanceRequests[reqIdx1] : (reqIdx2 !== -1 ? SchoolApp.store.teacherCorrectionRequests[reqIdx2] : null);
    if (!request) {
      SchoolApp.showToast('Request record not found.', 'error');
      return;
    }

    var targetStatus = approve ? 'approved' : 'rejected';
    var targetStatusUpper = approve ? 'Approved' : 'Rejected';
    var finalNote = reviewNotes || (approve ? 'Approved by Admin' : 'Rejected by Admin');

    // Update in both arrays
    [SchoolApp.store.attendanceRequests, SchoolApp.store.teacherCorrectionRequests].forEach(function(arr) {
      arr.forEach(function(r) {
        if (r.id === requestId) {
          r.status = targetStatusUpper;
          r.reviewedBy = adminName;
          r.reviewedAt = nowISO;
          r.adminNote = finalNote;
          r.adminNotes = finalNote;
        }
      });
    });

    if (approve) {
      var reqDate = request.requestDate || request.date;
      var timeIn = request.requestedPunchIn || request.timeIn;
      var timeOut = request.requestedPunchOut || request.timeOut;

      // Capture existing punches for this date as audit trail snapshot
      var existingPunches = SchoolApp.store.teacherAttendance.filter(function(p) {
        return p.teacherId === request.teacherId && p.date === reqDate;
      });

      var originalPunchesSnapshot = existingPunches.map(function(p) {
        return {
          id: p.id,
          time: p.time,
          type: p.type,
          geofenceStatus: p.geofenceStatus,
          method: p.method,
          distance: p.distance,
          markedVia: p.markedVia || 'location_auto'
        };
      });

      var auditData = {
        requestId: request.id,
        correctedBy: adminName,
        correctedAt: nowISO,
        reason: request.reason,
        adminNotes: finalNote,
        originalPunches: originalPunchesSnapshot,
        approvedStatus: request.statusRequested || 'Present'
      };

      // Insert Punch In with markedVia = 'admin_approved_request'
      if (timeIn) {
        var inRecord = {
          id: SchoolApp.generateId(),
          teacherId: request.teacherId,
          teacherName: request.teacherName,
          date: reqDate,
          type: 'in',
          time: timeIn + (timeIn.length === 5 ? ':00' : ''),
          timestamp: reqDate + 'T' + timeIn + (timeIn.length === 5 ? ':00' : '') + '.000Z',
          latitude: null,
          longitude: null,
          distance: 0,
          geofenceStatus: 'Inside Geofence (Admin Regularization)',
          outsideGeofence: false,
          outsideLocationFlag: false,
          markedVia: 'admin_approved_request',
          requestId: request.id,
          method: 'Manual',
          isCorrected: true,
          correctionAudit: auditData
        };
        SchoolApp.store.teacherAttendance.push(inRecord);
      }

      // Insert Punch Out with markedVia = 'admin_approved_request'
      if (timeOut) {
        var outRecord = {
          id: SchoolApp.generateId(),
          teacherId: request.teacherId,
          teacherName: request.teacherName,
          date: reqDate,
          type: 'out',
          time: timeOut + (timeOut.length === 5 ? ':00' : ''),
          timestamp: reqDate + 'T' + timeOut + (timeOut.length === 5 ? ':00' : '') + '.000Z',
          latitude: null,
          longitude: null,
          distance: 0,
          geofenceStatus: 'Inside Geofence (Admin Regularization)',
          outsideGeofence: false,
          outsideLocationFlag: false,
          markedVia: 'admin_approved_request',
          requestId: request.id,
          method: 'Manual',
          isCorrected: true,
          correctionAudit: auditData
        };
        SchoolApp.store.teacherAttendance.push(outRecord);
      }

      SchoolApp.showToast('Regularization approved. Attendance marked via admin approval.', 'success');
    } else {
      SchoolApp.showToast('Regularization request rejected.', 'warning');
    }

    SchoolApp.save();
    render();
  }

  // Admin Direct Manual Attendance Modal (Area 3b)
  function showAdminDirectPunchModal() {
    var teachers = SchoolApp.store.teachers || [];
    var curToday = new Date().toISOString().split('T')[0];

    var bodyHTML = '<form id="admin-direct-punch-form" class="form-grid" style="display:flex; flex-direction:column; gap:14px;">';
    
    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:11.5px; font-weight:700;">Select Teacher *</label>';
    bodyHTML += '    <select id="direct-teacher-id" class="form-select" required>';
    teachers.forEach(function(t) {
      bodyHTML += '<option value="' + t.id + '">' + t.firstName + ' ' + (t.lastName || '') + ' (' + (t.subject || 'Teacher') + ')</option>';
    });
    bodyHTML += '    </select>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:11.5px; font-weight:700;">Date *</label>';
    bodyHTML += '    <input type="date" id="direct-date" class="form-input" value="' + curToday + '" max="' + curToday + '" required>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size:11.5px; font-weight:700;">Punch In Time</label>';
    bodyHTML += '      <input type="time" id="direct-time-in" class="form-input" value="08:00">';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size:11.5px; font-weight:700;">Punch Out Time</label>';
    bodyHTML += '      <input type="time" id="direct-time-out" class="form-input" value="14:00">';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size:11.5px; font-weight:700;">Correction Reason / Admin Justification *</label>';
    bodyHTML += '    <textarea id="direct-reason" class="form-textarea" rows="2" placeholder="e.g. Official Duty / Manual administrative override" required></textarea>';
    bodyHTML += '  </div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="btn-save-direct-punch"><span class="material-icons-round">save</span> Save Attendance</button>';

    SchoolApp.showModal('Manual Teacher Attendance Entry', bodyHTML, footerHTML);

    document.getElementById('btn-save-direct-punch').addEventListener('click', function() {
      var tId = document.getElementById('direct-teacher-id').value;
      var dateVal = document.getElementById('direct-date').value;
      var timeInVal = document.getElementById('direct-time-in').value;
      var timeOutVal = document.getElementById('direct-time-out').value;
      var reasonVal = document.getElementById('direct-reason').value.trim();

      if (!tId || !dateVal || !reasonVal) {
        SchoolApp.showToast('Please select teacher, date, and provide justification.', 'error');
        return;
      }

      var teacherObj = teachers.find(function(t) { return t.id === tId; });
      var teacherName = teacherObj ? (teacherObj.firstName + ' ' + (teacherObj.lastName || '')).trim() : 'Teacher';
      var adminName = (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim() || SchoolApp.currentUser.username || 'Administrator';
      var nowISO = new Date().toISOString();

      var auditData = {
        correctedBy: adminName,
        correctedAt: nowISO,
        reason: reasonVal,
        directEntry: true,
        approvedStatus: 'Present'
      };

      if (!SchoolApp.store.teacherAttendance) SchoolApp.store.teacherAttendance = [];

      if (timeInVal) {
        SchoolApp.store.teacherAttendance.push({
          id: SchoolApp.generateId(),
          teacherId: tId,
          teacherName: teacherName,
          date: dateVal,
          type: 'in',
          time: timeInVal + (timeInVal.length === 5 ? ':00' : ''),
          timestamp: dateVal + 'T' + timeInVal + (timeInVal.length === 5 ? ':00' : '') + '.000Z',
          latitude: null,
          longitude: null,
          distance: 0,
          geofenceStatus: 'Inside Geofence (Manual Correction)',
          outsideGeofence: false,
          method: 'Manual',
          isCorrected: true,
          correctionAudit: auditData
        });
      }

      if (timeOutVal) {
        SchoolApp.store.teacherAttendance.push({
          id: SchoolApp.generateId(),
          teacherId: tId,
          teacherName: teacherName,
          date: dateVal,
          type: 'out',
          time: timeOutVal + (timeOutVal.length === 5 ? ':00' : ''),
          timestamp: dateVal + 'T' + timeOutVal + (timeOutVal.length === 5 ? ':00' : '') + '.000Z',
          latitude: null,
          longitude: null,
          distance: 0,
          geofenceStatus: 'Inside Geofence (Manual Correction)',
          outsideGeofence: false,
          method: 'Manual',
          isCorrected: true,
          correctionAudit: auditData
        });
      }

      SchoolApp.save();
      SchoolApp.closeModal();
      SchoolApp.showToast('Attendance recorded with audit trail for ' + teacherName, 'success');
      render();
    });
  }

  // Export functions (Step 2E)
  function exportTeacherAttendanceExcel(teacherId) {
    var allPunches = SchoolApp.store.teacherAttendance || [];
    var filtered = allPunches;

    if (teacherId) {
      filtered = filtered.filter(function(p) { return p.teacherId === teacherId; });
    }

    if (state.teacherStartDate && state.teacherEndDate) {
      filtered = filtered.filter(function(p) {
        return p.date >= state.teacherStartDate && p.date <= state.teacherEndDate;
      });
    }

    filtered.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

    var rows = filtered.map(function(p) {
      var audit = p.correctionAudit || {};
      var markedViaText = 'Location Auto';
      if (p.markedVia === 'admin_approved_request' || p.isCorrected) {
        markedViaText = 'Admin Approved';
      } else if (p.outsideLocationFlag || p.outsideGeofence) {
        markedViaText = 'Outside Radius (Flagged)';
      }

      return {
        'Date': p.date,
        'Teacher Name': p.teacherName,
        'Punch Type': p.type ? p.type.toUpperCase() : '—',
        'Punch Time': p.time,
        'Attendance Type / Marked Via': markedViaText,
        'Geofence Status': p.geofenceStatus || '—',
        'Distance (m)': p.distance !== undefined ? p.distance : '—',
        'Latitude': p.latitude ? p.latitude.toFixed(5) : '—',
        'Longitude': p.longitude ? p.longitude.toFixed(5) : '—',
        'Method': p.method || 'GPS',
        'Is Corrected / Regularized': (p.isCorrected || p.markedVia === 'admin_approved_request') ? 'YES' : 'NO',
        'Approved / Corrected By': audit.correctedBy || '—',
        'Review / Request Note': audit.adminNotes || audit.reason || '—'
      };
    });

    var headers = [
      { header: 'Date', key: 'Date' },
      { header: 'Teacher Name', key: 'Teacher Name' },
      { header: 'Punch Type', key: 'Punch Type' },
      { header: 'Punch Time', key: 'Punch Time' },
      { header: 'Attendance Type / Marked Via', key: 'Attendance Type / Marked Via' },
      { header: 'Geofence Status', key: 'Geofence Status' },
      { header: 'Distance (m)', key: 'Distance (m)' },
      { header: 'Latitude', key: 'Latitude' },
      { header: 'Longitude', key: 'Longitude' },
      { header: 'Method', key: 'Method' },
      { header: 'Is Corrected / Regularized', key: 'Is Corrected / Regularized' },
      { header: 'Approved / Corrected By', key: 'Approved / Corrected By' },
      { header: 'Review / Request Note', key: 'Review / Request Note' }
    ];

    var teacherNameSlug = teacherId ? (SchoolApp.currentUser.firstName || 'Teacher') : 'All_Teachers';
    var fileName = 'Teacher_Attendance_' + teacherNameSlug + '_' + (state.teacherStartDate || 'All') + '_to_' + (state.teacherEndDate || 'All') + '.xlsx';
    SchoolApp.utils.exportToExcel(rows, headers, fileName);
  }

  function exportAdminSummaryExcel() {
    var allPunches = SchoolApp.store.teacherAttendance || [];
    var teachers = SchoolApp.store.teachers || [];
    var startDate = state.adminStartDate || '2026-01-01';
    var endDate = state.adminEndDate || todayStr;

    var filtered = allPunches.filter(function(p) {
      return p.date >= startDate && p.date <= endDate;
    });

    // Group by teacher
    var rows = teachers.map(function(t) {
      var tPunches = filtered.filter(function(p) { return p.teacherId === t.id; });
      var inPunches = tPunches.filter(function(p) { return p.type === 'in'; });
      var locationAutoCount = tPunches.filter(function(p) { return (p.markedVia === 'location_auto' || !p.markedVia) && !p.outsideLocationFlag && !p.isCorrected; }).length;
      var adminApprovedCount = tPunches.filter(function(p) { return p.markedVia === 'admin_approved_request' || p.isCorrected === true; }).length;
      var outsideCount = tPunches.filter(function(p) { return p.outsideLocationFlag || (p.geofenceStatus && p.geofenceStatus.indexOf('Outside') !== -1 && !p.isCorrected); }).length;
      var totalLogs = tPunches.length;
      var complianceRate = totalLogs > 0 ? Math.round((locationAutoCount / totalLogs) * 100) : 100;

      return {
        'Teacher Name': t.firstName + ' ' + (t.lastName || ''),
        'Subject': t.subject || '—',
        'Status': t.status,
        'Total Punches': totalLogs,
        'Days Present (In)': inPunches.length,
        'Location Auto (Inside)': locationAutoCount,
        'Admin Approved': adminApprovedCount,
        'Outside Geofence': outsideCount,
        'Geofence Compliance': complianceRate + '%'
      };
    });

    var headers = [
      { header: 'Teacher Name', key: 'Teacher Name' },
      { header: 'Subject', key: 'Subject' },
      { header: 'Status', key: 'Status' },
      { header: 'Total Punches', key: 'Total Punches' },
      { header: 'Days Present (In)', key: 'Days Present (In)' },
      { header: 'Location Auto (Inside)', key: 'Location Auto (Inside)' },
      { header: 'Admin Approved', key: 'Admin Approved' },
      { header: 'Outside Geofence', key: 'Outside Geofence' },
      { header: 'Geofence Compliance', key: 'Geofence Compliance' }
    ];

    var fileName = 'Teacher_Attendance_Audit_Summary_' + startDate + '_to_' + endDate + '.xlsx';
    SchoolApp.utils.exportToExcel(rows, headers, fileName);
  }

  // Teacher UI Rendering
  function renderTeacherUI(container) {
    var teacherId = SchoolApp.currentUser.id;
    var status = getTodayPunchStatus(teacherId);

    var disableIn = !!status.punchIn;
    var disableOut = !status.punchIn || !!status.punchOut;

    var dateDisplay = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    var html = '<div class="teacher-attendance-portal">';

    // Punch Box UI
    html += '<div class="punch-card-wrapper">';
    html += '<div class="punch-clock" id="punch-live-clock">00:00:00</div>';
    html += '<div class="punch-date">' + dateDisplay + '</div>';
    
    html += '<div class="punch-buttons">';
    html += '<button class="btn-punch btn-punch-in" id="punch-in-btn" ' + (disableIn ? 'disabled' : '') + '>';
    html += '<span class="material-icons-round">fingerprint</span>Punch In</button>';
    html += '<button class="btn-punch btn-punch-out" id="punch-out-btn" ' + (disableOut ? 'disabled' : '') + '>';
    html += '<span class="material-icons-round">logout</span>Punch Out</button>';
    html += '</div>';

    // Status message
    var statusText = 'Not checked in yet today.';
    if (status.punchIn && !status.punchOut) {
      statusText = 'Checked In today at ' + status.punchIn.time + ' (' + status.punchIn.geofenceStatus + ').';
    } else if (status.punchIn && status.punchOut) {
      statusText = 'Checked Out today at ' + status.punchOut.time + '. Duty completed.';
    }
    html += '<div class="punch-status-text">' + statusText + '</div>';

    // GPS visual indicator & Geofence Diagnostics
    var geo = getGeofenceSettings();
    if (state.lastCapturedLocation) {
      var loc = state.lastCapturedLocation;
      var badgeClass = loc.status.indexOf('Inside') !== -1 ? 'inside' : 'outside';
      var badgeIcon = loc.status.indexOf('Inside') !== -1 ? 'check_circle' : 'warning';
      html += '<div class="geofence-badge ' + badgeClass + '"><span class="material-icons-round">' + badgeIcon + '</span>' + loc.status + '</div>';
      html += '<div class="gps-info-text">Last Punch GPS: ' + loc.latitude + ', ' + loc.longitude + ' (' + loc.distance + 'm from school, policy: ' + geo.policy + ')</div>';
    } else {
      var radiusMsg = (geo.lat === null || geo.lng === null) ? 'Not Configured' : (geo.radius + 'm (' + (geo.policy === 'strict' ? 'Strict' : 'Lenient') + ')');
      var schoolName = (SchoolApp.store.settings && SchoolApp.store.settings.schoolName) || 'School';
      html += '<div class="gps-info-text"><span class="material-icons-round" style="font-size:14px; vertical-align:middle;">location_on</span> ' + schoolName + ' Geofence Radius: ' + radiusMsg + '</div>';
    }

    html += '<button class="btn btn-secondary btn-sm" id="corr-request-btn" style="margin-top: 16px;"><span class="material-icons-round">history_toggle_off</span> Request Correction</button>';
    html += '<div style="margin-top: 12px; text-align: center;"><a href="#" id="gps-fallback-btn" style="font-size: 13px; color: var(--accent-secondary); text-decoration: underline;">GPS not working? Request manual approval</a></div>';
    html += '</div>'; // End punch-card-wrapper

    // Personal Logs & History with Filters (Area 3c)
    html += '<div class="card mb-4">';
    html += '  <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
    html += '    <h3 style="margin:0;"><span class="material-icons-round">history</span> My Attendance History & Reports</h3>';
    html += '    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">';
    html += '      <button class="btn btn-secondary btn-xs" id="quick-filter-month">This Month</button>';
    html += '      <button class="btn btn-secondary btn-xs" id="quick-filter-30d">Last 30 Days</button>';
    html += '      <button class="btn btn-secondary btn-xs" id="quick-filter-all">All</button>';
    html += '      <button class="btn btn-primary btn-sm" id="btn-export-my-attendance" style="display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">table_view</span> Export Excel</button>';
    html += '    </div>';
    html += '  </div>';

    // Filter toolbar
    html += '  <div style="padding:12px 20px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border-light); display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap;">';
    html += '    <div style="min-width:140px;">';
    html += '      <label class="form-label" style="font-size:11px; margin-bottom:4px;">From Date</label>';
    html += '      <input type="date" id="teacher-filter-start" class="form-input" value="' + state.teacherStartDate + '">';
    html += '    </div>';
    html += '    <div style="min-width:140px;">';
    html += '      <label class="form-label" style="font-size:11px; margin-bottom:4px;">To Date</label>';
    html += '      <input type="date" id="teacher-filter-end" class="form-input" value="' + state.teacherEndDate + '">';
    html += '    </div>';
    html += '    <div>';
    html += '      <button class="btn btn-secondary btn-sm" id="btn-apply-teacher-filter">Apply Filter</button>';
    html += '    </div>';
    html += '  </div>';

    // Summary Stat KPI Cards for Teacher
    var allMyPunches = (SchoolApp.store.teacherAttendance || []).filter(function(p) { return p.teacherId === teacherId; });
    var filteredMyPunches = allMyPunches.filter(function(p) {
      if (state.teacherStartDate && p.date < state.teacherStartDate) return false;
      if (state.teacherEndDate && p.date > state.teacherEndDate) return false;
      return true;
    });
    filteredMyPunches.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

    var totalPunches = filteredMyPunches.length;
    var insidePunches = filteredMyPunches.filter(function(p) { return p.geofenceStatus && p.geofenceStatus.indexOf('Inside') !== -1; }).length;
    var outsidePunches = filteredMyPunches.filter(function(p) { return p.geofenceStatus && p.geofenceStatus.indexOf('Outside') !== -1; }).length;
    var correctedPunches = filteredMyPunches.filter(function(p) { return p.isCorrected === true; }).length;
    var compliancePct = totalPunches > 0 ? Math.round((insidePunches / totalPunches) * 100) : 100;

    html += '  <div class="kpi-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; padding:16px 20px;">';
    html += '    <div class="kpi-card" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:8px; padding:14px;">';
    html += '      <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Total Logs</div>';
    html += '      <div style="font-size:24px; font-weight:700; color:var(--text-primary); margin-top:4px;">' + totalPunches + '</div>';
    html += '    </div>';
    html += '    <div class="kpi-card" style="background:rgba(16, 185, 129, 0.06); border:1px solid rgba(16, 185, 129, 0.2); border-radius:8px; padding:14px;">';
    html += '      <div style="font-size:11px; color:#10b981; text-transform:uppercase; font-weight:700;">Inside Geofence</div>';
    html += '      <div style="font-size:24px; font-weight:700; color:#10b981; margin-top:4px;">' + insidePunches + ' <span style="font-size:13px; font-weight:400;">(' + compliancePct + '%)</span></div>';
    html += '    </div>';
    html += '    <div class="kpi-card" style="background:rgba(239, 68, 68, 0.06); border:1px solid rgba(239, 68, 68, 0.2); border-radius:8px; padding:14px;">';
    html += '      <div style="font-size:11px; color:#ef4444; text-transform:uppercase; font-weight:700;">Outside Geofence</div>';
    html += '      <div style="font-size:24px; font-weight:700; color:#ef4444; margin-top:4px;">' + outsidePunches + '</div>';
    html += '    </div>';
    html += '    <div class="kpi-card" style="background:rgba(59, 130, 246, 0.06); border:1px solid rgba(59, 130, 246, 0.2); border-radius:8px; padding:14px;">';
    html += '      <div style="font-size:11px; color:#3b82f6; text-transform:uppercase; font-weight:700;">Admin Corrected</div>';
    html += '      <div style="font-size:24px; font-weight:700; color:#3b82f6; margin-top:4px;">' + correctedPunches + '</div>';
    html += '    </div>';
    html += '  </div>';

    html += '  <div class="card-body" style="padding:0 20px 20px 20px;">';
    if (filteredMyPunches.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>Date</th><th>Time</th><th>Type</th><th>Geofence Status</th><th>Coordinates</th><th>Method</th><th>Audit Trail</th>';
      html += '</tr></thead><tbody>';
      filteredMyPunches.forEach(function(p) {
        var typeColor = p.type === 'in' ? 'badge-success' : 'badge-danger';
        var geoColor = (p.geofenceStatus && p.geofenceStatus.indexOf('Inside') !== -1) ? 'badge-success' : 'badge-danger';
        var coordsText = p.latitude ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : '—';
        var audit = p.correctionAudit || {};
        var auditTag = p.isCorrected ? '<span class="badge badge-info" title="Corrected by ' + (audit.correctedBy || 'Admin') + ' on ' + (audit.correctedAt ? new Date(audit.correctedAt).toLocaleDateString('en-IN') : '—') + ': ' + (audit.reason || '') + '"><span class="material-icons-round" style="font-size:11px; vertical-align:middle;">verified</span> Corrected</span>' : '<span style="color:var(--text-muted); font-size:12px;">Standard</span>';
        
        html += '<tr>';
        html += '<td>' + SchoolApp.formatDate(p.date) + '</td>';
        html += '<td><strong>' + p.time + '</strong></td>';
        html += '<td><span class="badge ' + typeColor + '">Punch ' + p.type.toUpperCase() + '</span></td>';
        html += '<td><span class="badge ' + geoColor + '">' + p.geofenceStatus + '</span></td>';
        html += '<td>' + coordsText + '</td>';
        html += '<td><span class="badge badge-info">' + (p.method || 'GPS') + '</span></td>';
        html += '<td>' + auditTag + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding: 24px;"><span class="material-icons-round">fingerprint</span><h3>No Punches in Selected Range</h3><p>No punch logs match the selected date range.</p></div>';
    }
    html += '  </div>';
    html += '</div>';

    // Pending Correction Requests
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">edit_calendar</span> My Correction Requests</h3></div>';
    html += '<div class="card-body">';
    var myRequests = (SchoolApp.store.teacherCorrectionRequests || []).filter(function(r) { return r.teacherId === teacherId; });
    myRequests.sort(function(a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });

    if (myRequests.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>Requested Date</th><th>In / Out Time</th><th>Status Requested</th><th>Reason</th><th>Admin Review</th><th>Status</th>';
      html += '</tr></thead><tbody>';
      myRequests.forEach(function(r) {
        var statusColor = 'badge-purple';
        if (r.status === 'Approved') statusColor = 'badge-success';
        if (r.status === 'Rejected') statusColor = 'badge-danger';
        
        var reviewText = r.reviewedBy ? ('Reviewed by ' + r.reviewedBy + (r.adminNotes ? ' (' + r.adminNotes + ')' : '')) : 'Pending review';

        html += '<tr>';
        html += '<td>' + SchoolApp.formatDate(r.date) + '</td>';
        var timeText = '';
        if (r.timeIn && r.timeOut) {
          timeText = r.timeIn + ' - ' + r.timeOut;
        } else if (r.timeIn) {
          timeText = 'Punch In: ' + r.timeIn;
        } else if (r.timeOut) {
          timeText = 'Punch Out: ' + r.timeOut;
        }
        html += '<td><strong>' + (timeText || '—') + '</strong></td>';
        html += '<td><span class="badge badge-info">' + (r.statusRequested || 'Present') + '</span></td>';
        html += '<td>' + r.reason + '</td>';
        html += '<td style="font-size:12px; color:var(--text-secondary);">' + reviewText + '</td>';
        html += '<td><span class="badge ' + statusColor + '">' + r.status + '</span></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<p style="color:var(--text-secondary); text-align:center; padding:16px;">No correction requests found.</p>';
    }
    html += '</div></div>';

    html += '</div>';

    container.innerHTML = html;

    // Start Live Clock
    if (state.clockInterval) clearInterval(state.clockInterval);
    state.clockInterval = setInterval(function() {
      var clockEl = document.getElementById('punch-live-clock');
      if (clockEl) {
        clockEl.textContent = new Date().toTimeString().split(' ')[0];
      }
    }, 1000);

    var clockEl = document.getElementById('punch-live-clock');
    if (clockEl) {
      clockEl.textContent = new Date().toTimeString().split(' ')[0];
    }

    // Attach listeners
    var inBtn = document.getElementById('punch-in-btn');
    if (inBtn) inBtn.addEventListener('click', function() { punch('in'); });

    var outBtn = document.getElementById('punch-out-btn');
    if (outBtn) outBtn.addEventListener('click', function() { punch('out'); });

    var corrBtn = document.getElementById('corr-request-btn');
    if (corrBtn) corrBtn.addEventListener('click', showCorrectionModal);

    var fallbackBtn = document.getElementById('gps-fallback-btn');
    if (fallbackBtn) {
      fallbackBtn.addEventListener('click', function(e) {
        e.preventDefault();
        showGpsFallbackModal();
      });
    }

    var exportBtn = document.getElementById('btn-export-my-attendance');
    if (exportBtn) exportBtn.addEventListener('click', function() { exportTeacherAttendanceExcel(teacherId); });

    var btnApplyFilter = document.getElementById('btn-apply-teacher-filter');
    if (btnApplyFilter) {
      btnApplyFilter.addEventListener('click', function() {
        state.teacherStartDate = document.getElementById('teacher-filter-start').value;
        state.teacherEndDate = document.getElementById('teacher-filter-end').value;
        render();
      });
    }

    var btnMonth = document.getElementById('quick-filter-month');
    if (btnMonth) {
      btnMonth.addEventListener('click', function() {
        state.teacherStartDate = firstDayOfMonth;
        state.teacherEndDate = todayStr;
        render();
      });
    }

    var btn30d = document.getElementById('quick-filter-30d');
    if (btn30d) {
      btn30d.addEventListener('click', function() {
        var d = new Date();
        d.setDate(d.getDate() - 30);
        state.teacherStartDate = d.toISOString().split('T')[0];
        state.teacherEndDate = todayStr;
        render();
      });
    }

    var btnAll = document.getElementById('quick-filter-all');
    if (btnAll) {
      btnAll.addEventListener('click', function() {
        state.teacherStartDate = '';
        state.teacherEndDate = '';
        render();
      });
    }
  }

  // Admin UI Rendering
  function renderAdminUI(container) {
    if (state.clockInterval) {
      clearInterval(state.clockInterval);
      state.clockInterval = null;
    }

    var teachers = SchoolApp.store.teachers || [];
    var geo = getGeofenceSettings();

    var html = '<div class="admin-teacher-attendance">';

    // Page Header with Action Buttons
    html += '<div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">';
    html += '  <h2><span class="material-icons-round">fingerprint</span> Staff Attendance & GPS Geofence</h2>';
    html += '  <div class="header-actions" style="display:flex; gap:8px; flex-wrap:wrap;">';
    html += '    <button class="btn btn-secondary btn-sm" id="btn-admin-geofence-settings" style="display:inline-flex; align-items:center; gap:6px; background:rgba(6, 182, 212, 0.15); color:#06b6d4; border:1px solid rgba(6, 182, 212, 0.3);"><span class="material-icons-round" style="font-size:16px;">settings_suggest</span> Geofence Settings (' + (geo.policy === 'strict' ? 'Strict' : 'Lenient') + ')</button>';
    html += '    <button class="btn btn-secondary btn-sm" id="btn-admin-manual-punch" style="display:inline-flex; align-items:center; gap:6px; background:rgba(108, 92, 231, 0.15); color:#a29bfe; border:1px solid rgba(108, 92, 231, 0.3);"><span class="material-icons-round" style="font-size:16px;">add_circle</span> Manual Override / Add</button>';
    html += '  </div>';
    html += '</div>';

    // Tabs
    html += '<div class="teacher-att-tabs" style="display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid var(--border-light); padding-bottom:8px;">';
    html += '  <button class="teacher-att-tab btn btn-sm ' + (state.activeTab === 'approvals' ? 'btn-primary' : 'btn-secondary') + '" id="tab-btn-approvals"><span class="material-icons-round" style="font-size:15px; vertical-align:middle; margin-right:4px;">checklist</span> Correction Requests</button>';
    html += '  <button class="teacher-att-tab btn btn-sm ' + (state.activeTab === 'logs' ? 'btn-primary' : 'btn-secondary') + '" id="tab-btn-logs"><span class="material-icons-round" style="font-size:15px; vertical-align:middle; margin-right:4px;">history</span> Daily GPS Logs</button>';
    html += '  <button class="teacher-att-tab btn btn-sm ' + (state.activeTab === 'summary' ? 'btn-primary' : 'btn-secondary') + '" id="tab-btn-summary"><span class="material-icons-round" style="font-size:15px; vertical-align:middle; margin-right:4px;">analytics</span> Audit Summary Report</button>';
    html += '</div>';

    if (state.activeTab === 'approvals') {
      // Requests Tab (Step 2D)
      var allRequests = SchoolApp.store.attendanceRequests || SchoolApp.store.teacherCorrectionRequests || [];
      var filteredRequests = allRequests;
      if (state.reqStatusFilter !== 'all') {
        filteredRequests = filteredRequests.filter(function(r) {
          return (r.status || '').toLowerCase() === state.reqStatusFilter.toLowerCase();
        });
      }
      filteredRequests.sort(function(a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });

      html += '<div class="card">';
      html += '  <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
      html += '    <h3 style="margin:0;"><span class="material-icons-round">checklist</span> Teacher Regularization & Approval Requests</h3>';
      html += '    <div style="display:flex; gap:10px; align-items:center;">';
      html += '      <label style="font-size:12px; color:var(--text-secondary);">Status Filter:</label>';
      html += '      <select id="admin-req-status-filter" class="form-select" style="max-width:140px;">';
      html += '        <option value="pending"' + (state.reqStatusFilter.toLowerCase() === 'pending' ? ' selected' : '') + '>Pending Only</option>';
      html += '        <option value="approved"' + (state.reqStatusFilter.toLowerCase() === 'approved' ? ' selected' : '') + '>Approved</option>';
      html += '        <option value="rejected"' + (state.reqStatusFilter.toLowerCase() === 'rejected' ? ' selected' : '') + '>Rejected</option>';
      html += '        <option value="all"' + (state.reqStatusFilter === 'all' ? ' selected' : '') + '>All Requests</option>';
      html += '      </select>';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="card-body">';
      if (filteredRequests.length > 0) {
        html += '<div class="table-container"><table class="data-table"><thead><tr>';
        html += '<th>Teacher Name</th><th>Requested Date</th><th>In / Out Time</th><th>Reason</th><th>Location Data</th><th>Review Audit</th><th>Status</th><th>Actions</th>';
        html += '</tr></thead><tbody>';

        filteredRequests.forEach(function(r) {
          var rStat = (r.status || 'Pending').toLowerCase();
          var statusColor = 'badge-purple';
          if (rStat === 'approved') statusColor = 'badge-success';
          if (rStat === 'rejected') statusColor = 'badge-danger';

          var rDate = r.requestDate || r.date;
          var timeIn = r.requestedPunchIn || r.timeIn;
          var timeOut = r.requestedPunchOut || r.timeOut;

          var timeText = '';
          if (timeIn && timeOut) {
            timeText = timeIn + ' - ' + timeOut;
          } else if (timeIn) {
            timeText = 'In: ' + timeIn;
          } else if (timeOut) {
            timeText = 'Out: ' + timeOut;
          }

          var loc = r.outsideLocationCoords;
          var locText = loc ? ('<span class="badge badge-warning" style="font-size:11px;" title="' + loc.latitude + ', ' + loc.longitude + '"><span class="material-icons-round" style="font-size:12px; vertical-align:middle;">pin_drop</span> ' + (loc.distance ? loc.distance + 'm outside' : 'GPS attached') + '</span>') : '<span style="color:var(--text-muted); font-size:11.5px;">Manual/None</span>';

          var adminNotes = r.adminNote || r.adminNotes;
          var auditText = r.reviewedBy ? (r.reviewedBy + ' (' + new Date(r.reviewedAt).toLocaleDateString('en-IN') + ')' + (adminNotes ? '<br><small style="color:var(--text-muted);">' + adminNotes + '</small>' : '')) : '<span style="color:var(--text-muted);">Pending</span>';

          html += '<tr>';
          html += '<td><strong>' + r.teacherName + '</strong></td>';
          html += '<td>' + SchoolApp.formatDate(rDate) + '</td>';
          html += '<td><strong>' + (timeText || '—') + '</strong></td>';
          html += '<td>' + r.reason + '</td>';
          html += '<td>' + locText + '</td>';
          html += '<td style="font-size:12px; color:var(--text-secondary);">' + auditText + '</td>';
          html += '<td><span class="badge ' + statusColor + '">' + (rStat === 'approved' ? 'Approved' : (rStat === 'rejected' ? 'Rejected' : 'Pending')) + '</span></td>';
          html += '<td><div class="table-actions">';
          if (rStat === 'pending') {
            html += '<button class="btn-icon approve-request-btn" data-id="' + r.id + '" title="Review & Approve" style="color:var(--success); font-size: 22px;"><span class="material-icons-round">check_circle</span></button>';
            html += '<button class="btn-icon reject-request-btn" data-id="' + r.id + '" title="Review & Reject" style="color:var(--danger); font-size: 22px;"><span class="material-icons-round">cancel</span></button>';
          } else {
            html += '<span style="font-size:11.5px; color:var(--text-muted);">Processed</span>';
          }
          html += '</div></td>';
          html += '</tr>';
        });

        html += '</tbody></table></div>';
      } else {
        html += '<div class="empty-state" style="padding: 24px;"><span class="material-icons-round">playlist_add_check</span><h3>No Requests Found</h3><p>No teacher regularization requests match your filter.</p></div>';
      }
      html += '  </div>';
      html += '</div>';

    } else if (state.activeTab === 'logs') {
      // Daily Attendance & GPS Logs Tab (Step 2E)
      var allDayLogs = (SchoolApp.store.teacherAttendance || []).filter(function(l) { return l.date === state.selectedDate; });
      var dayLogs = allDayLogs;
      if (state.teacherFilter !== 'all') {
        dayLogs = dayLogs.filter(function(l) { return l.teacherId === state.teacherFilter; });
      }
      if (state.geoFilter === 'inside') {
        dayLogs = dayLogs.filter(function(l) { return (l.markedVia === 'location_auto' || !l.markedVia) && !l.outsideLocationFlag && !l.isCorrected; });
      } else if (state.geoFilter === 'outside') {
        dayLogs = dayLogs.filter(function(l) { return l.outsideLocationFlag || (l.geofenceStatus && l.geofenceStatus.indexOf('Outside') !== -1 && !l.isCorrected); });
      } else if (state.geoFilter === 'corrected') {
        dayLogs = dayLogs.filter(function(l) { return l.markedVia === 'admin_approved_request' || l.isCorrected === true; });
      }

      dayLogs.sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });

      var countTotal = dayLogs.length;
      var countAuto = dayLogs.filter(function(l) { return (l.markedVia === 'location_auto' || !l.markedVia) && !l.outsideLocationFlag && !l.isCorrected; }).length;
      var countApproved = dayLogs.filter(function(l) { return l.markedVia === 'admin_approved_request' || l.isCorrected === true; }).length;
      var countOutside = dayLogs.filter(function(l) { return l.outsideLocationFlag || (l.geofenceStatus && l.geofenceStatus.indexOf('Outside') !== -1 && !l.isCorrected); }).length;

      html += '<div class="card">';
      html += '  <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">';
      html += '    <h3 style="margin:0;"><span class="material-icons-round">history</span> Daily Attendance & GPS Punch Logs</h3>';
      html += '    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">';
      html += '      <input type="date" id="admin-log-date-picker" class="form-input" value="' + state.selectedDate + '" style="max-width:160px;">';
      html += '      <select id="admin-log-teacher-filter" class="form-select" style="max-width:180px;">';
      html += '        <option value="all">All Teachers</option>';
      teachers.forEach(function(t) {
        html += '<option value="' + t.id + '"' + (state.teacherFilter === t.id ? ' selected' : '') + '>' + t.firstName + ' ' + (t.lastName || '') + '</option>';
      });
      html += '      </select>';
      html += '      <select id="admin-log-geo-filter" class="form-select" style="max-width:170px;">';
      html += '        <option value="all"' + (state.geoFilter === 'all' ? ' selected' : '') + '>All Attendance Types</option>';
      html += '        <option value="inside"' + (state.geoFilter === 'inside' ? ' selected' : '') + '>📍 Location Auto</option>';
      html += '        <option value="corrected"' + (state.geoFilter === 'corrected' ? ' selected' : '') + '>✅ Admin Approved</option>';
      html += '        <option value="outside"' + (state.geoFilter === 'outside' ? ' selected' : '') + '>⚠️ Outside Radius</option>';
      html += '      </select>';
      html += '      <button class="btn btn-secondary btn-sm" id="btn-export-daily-logs" style="display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:16px;">table_view</span> Export Logs</button>';
      html += '    </div>';
      html += '  </div>';

      // KPI Summary for Date
      html += '  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; padding:12px 20px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border-light);">';
      html += '    <div style="font-size:12px; color:var(--text-secondary);">Total Punches: <strong style="color:var(--text-primary); font-size:14px;">' + countTotal + '</strong></div>';
      html += '    <div style="font-size:12px; color:#10b981;">📍 Location Auto: <strong style="font-size:14px;">' + countAuto + '</strong></div>';
      html += '    <div style="font-size:12px; color:#3b82f6;">✅ Admin Approved: <strong style="font-size:14px;">' + countApproved + '</strong></div>';
      html += '    <div style="font-size:12px; color:#f59e0b;">⚠️ Outside Radius: <strong style="font-size:14px;">' + countOutside + '</strong></div>';
      html += '  </div>';

      html += '  <div class="card-body">';
      if (dayLogs.length > 0) {
        html += '<div class="table-container"><table class="data-table"><thead><tr>';
        html += '<th>Teacher Name</th><th>Time</th><th>Punch Type</th><th>Attendance Type</th><th>Geofence & Distance</th><th>Coordinates</th><th>Method</th><th>Audit / Review</th>';
        html += '</tr></thead><tbody>';

        dayLogs.forEach(function(l) {
          var typeColor = l.type === 'in' ? 'badge-success' : 'badge-danger';
          var coordsText = l.latitude ? l.latitude.toFixed(5) + ', ' + l.longitude.toFixed(5) : '—';
          var distanceText = l.distance !== undefined ? (l.distance + 'm') : '—';
          var audit = l.correctionAudit || {};

          var typeBadge = '<span class="badge badge-info" style="display:inline-flex; align-items:center; gap:3px;"><span class="material-icons-round" style="font-size:12px;">my_location</span> Location Auto</span>';
          if (l.markedVia === 'admin_approved_request' || l.isCorrected) {
            typeBadge = '<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:3px;"><span class="material-icons-round" style="font-size:12px;">verified</span> Admin Approved</span>';
          } else if (l.outsideLocationFlag || (l.geofenceStatus && l.geofenceStatus.indexOf('Outside') !== -1)) {
            typeBadge = '<span class="badge badge-warning" style="display:inline-flex; align-items:center; gap:3px;"><span class="material-icons-round" style="font-size:12px;">wrong_location</span> Outside Radius</span>';
          }

          var auditText = '<span style="color:var(--text-muted); font-size:11.5px;">Auto GPS</span>';
          if (l.isCorrected || l.markedVia === 'admin_approved_request') {
            auditText = '<span style="font-size:11.5px; color:#3b82f6;">Approved by ' + (audit.correctedBy || 'Admin') + (audit.adminNotes ? '<br><small style="color:var(--text-muted);">' + audit.adminNotes + '</small>' : '') + '</span>';
          }

          html += '<tr>';
          html += '<td><strong>' + l.teacherName + '</strong></td>';
          html += '<td>' + l.time + '</td>';
          html += '<td><span class="badge ' + typeColor + '">Punch ' + (l.type || 'IN').toUpperCase() + '</span></td>';
          html += '<td>' + typeBadge + '</td>';
          html += '<td>' + (l.geofenceStatus || '—') + ' (' + distanceText + ')</td>';
          html += '<td>' + coordsText + '</td>';
          html += '<td><span class="badge badge-info">' + (l.method || 'GPS') + '</span></td>';
          html += '<td>' + auditText + '</td>';
          html += '</tr>';
        });

        html += '</tbody></table></div>';
      } else {
        html += '<div class="empty-state" style="padding:24px;"><span class="material-icons-round">date_range</span><h3>No Punches on ' + SchoolApp.formatDate(state.selectedDate) + '</h3><p>Try selecting another date or clear your filters to view logs.</p></div>';
      }
      html += '  </div>';
      html += '</div>';

    } else if (state.activeTab === 'summary') {
      // Multi-Range Audit Summary Report Tab (Step 2E)
      html += '<div class="card">';
      html += '  <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">';
      html += '    <h3 style="margin:0;"><span class="material-icons-round">analytics</span> Staff Attendance Audit Summary Report</h3>';
      html += '    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">';
      html += '      <label style="font-size:12px; color:var(--text-secondary);">From:</label>';
      html += '      <input type="date" id="admin-summary-start" class="form-input" value="' + state.adminStartDate + '" style="max-width:145px;">';
      html += '      <label style="font-size:12px; color:var(--text-secondary);">To:</label>';
      html += '      <input type="date" id="admin-summary-end" class="form-input" value="' + state.adminEndDate + '" style="max-width:145px;">';
      html += '      <button class="btn btn-secondary btn-sm" id="btn-apply-admin-summary">Apply</button>';
      html += '      <button class="btn btn-primary btn-sm" id="btn-export-admin-summary" style="display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:16px;">table_view</span> Export Audit Sheet</button>';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="card-body">';
      var allPunches = SchoolApp.store.teacherAttendance || [];
      var filteredPunches = allPunches.filter(function(p) {
        return p.date >= state.adminStartDate && p.date <= state.adminEndDate;
      });

      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>Teacher Name</th><th>Subject</th><th>Status</th><th>Total Punches</th><th>Days Present</th><th>Location Auto</th><th>Admin Approved</th><th>Outside Radius</th><th>Compliance Rate</th>';
      html += '</tr></thead><tbody>';

      teachers.forEach(function(t) {
        var tPunches = filteredPunches.filter(function(p) { return p.teacherId === t.id; });
        var inPunches = tPunches.filter(function(p) { return p.type === 'in'; });
        var locationAutoCount = tPunches.filter(function(p) { return (p.markedVia === 'location_auto' || !p.markedVia) && !p.outsideLocationFlag && !p.isCorrected; }).length;
        var adminApprovedCount = tPunches.filter(function(p) { return p.markedVia === 'admin_approved_request' || p.isCorrected === true; }).length;
        var outsideCount = tPunches.filter(function(p) { return p.outsideLocationFlag || (p.geofenceStatus && p.geofenceStatus.indexOf('Outside') !== -1 && !p.isCorrected); }).length;
        var totalLogs = tPunches.length;
        var complianceRate = totalLogs > 0 ? Math.round((locationAutoCount / totalLogs) * 100) : 100;
        var compColor = complianceRate >= 85 ? 'badge-success' : (complianceRate >= 60 ? 'badge-warning' : 'badge-danger');

        html += '<tr>';
        html += '<td><strong>' + t.firstName + ' ' + (t.lastName || '') + '</strong></td>';
        html += '<td>' + (t.subject || '—') + '</td>';
        html += '<td><span class="badge ' + (t.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + t.status + '</span></td>';
        html += '<td><strong>' + totalLogs + '</strong></td>';
        html += '<td>' + inPunches.length + '</td>';
        html += '<td><span style="color:#10b981; font-weight:600;">' + locationAutoCount + '</span></td>';
        html += '<td><span style="color:#3b82f6; font-weight:600;">' + adminApprovedCount + '</span></td>';
        html += '<td><span style="color:#f59e0b; font-weight:600;">' + outsideCount + '</span></td>';
        html += '<td><span class="badge ' + compColor + '">' + complianceRate + '%</span></td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
      html += '  </div>';
      html += '</div>';
    }

    html += '</div>';

    container.innerHTML = html;

    // Attach listeners
    var btnGeofenceSettings = document.getElementById('btn-admin-geofence-settings');
    if (btnGeofenceSettings) btnGeofenceSettings.addEventListener('click', showGeofenceSettingsModal);

    var btnManualPunch = document.getElementById('btn-admin-manual-punch');
    if (btnManualPunch) btnManualPunch.addEventListener('click', showAdminDirectPunchModal);

    var approvalsTabBtn = document.getElementById('tab-btn-approvals');
    if (approvalsTabBtn) {
      approvalsTabBtn.addEventListener('click', function() {
        state.activeTab = 'approvals';
        render();
      });
    }

    var logsTabBtn = document.getElementById('tab-btn-logs');
    if (logsTabBtn) {
      logsTabBtn.addEventListener('click', function() {
        state.activeTab = 'logs';
        render();
      });
    }

    var summaryTabBtn = document.getElementById('tab-btn-summary');
    if (summaryTabBtn) {
      summaryTabBtn.addEventListener('click', function() {
        state.activeTab = 'summary';
        render();
      });
    }

    if (state.activeTab === 'approvals') {
      var reqStatusFilterEl = document.getElementById('admin-req-status-filter');
      if (reqStatusFilterEl) {
        reqStatusFilterEl.addEventListener('change', function() {
          state.reqStatusFilter = this.value;
          render();
        });
      }

      document.querySelectorAll('.approve-request-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = this.getAttribute('data-id');
          showReviewCorrectionModal(id, true);
        });
      });

      document.querySelectorAll('.reject-request-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = this.getAttribute('data-id');
          showReviewCorrectionModal(id, false);
        });
      });
    } else if (state.activeTab === 'logs') {
      var datePicker = document.getElementById('admin-log-date-picker');
      if (datePicker) {
        datePicker.addEventListener('change', function() {
          state.selectedDate = this.value;
          render();
        });
      }

      var teacherFilterEl = document.getElementById('admin-log-teacher-filter');
      if (teacherFilterEl) {
        teacherFilterEl.addEventListener('change', function() {
          state.teacherFilter = this.value;
          render();
        });
      }

      var geoFilterEl = document.getElementById('admin-log-geo-filter');
      if (geoFilterEl) {
        geoFilterEl.addEventListener('change', function() {
          state.geoFilter = this.value;
          render();
        });
      }

      var exportLogsBtn = document.getElementById('btn-export-daily-logs');
      if (exportLogsBtn) {
        exportLogsBtn.addEventListener('click', function() {
          exportTeacherAttendanceExcel(null);
        });
      }
    } else if (state.activeTab === 'summary') {
      var btnApplySummary = document.getElementById('btn-apply-admin-summary');
      if (btnApplySummary) {
        btnApplySummary.addEventListener('click', function() {
          state.adminStartDate = document.getElementById('admin-summary-start').value;
          state.adminEndDate = document.getElementById('admin-summary-end').value;
          render();
        });
      }

      var exportSummaryBtn = document.getElementById('btn-export-admin-summary');
      if (exportSummaryBtn) {
        exportSummaryBtn.addEventListener('click', function() {
          exportAdminSummaryExcel();
        });
      }
    }
  }

  function render() {
    var container = document.getElementById('page-teacher-attendance');
    if (!container) return;

    if (SchoolApp.isAdmin()) {
      renderAdminUI(container);
    } else if (SchoolApp.isTeacher()) {
      renderTeacherUI(container);
    } else {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-round">error</span><h3>Access Restricted</h3><p>Please log in as a Teacher or Admin to access this module.</p></div>';
    }
  }

  // Register Module inside SVM core
  SchoolApp.registerModule('teacher-attendance', {
    init: function() {
      if (!SchoolApp.store.teacherAttendance) {
        SchoolApp.store.teacherAttendance = [];
      }
      if (!SchoolApp.store.teacherCorrectionRequests) {
        SchoolApp.store.teacherCorrectionRequests = [];
      }
    },
    render: render
  });

  window.TeacherAttendanceModule = {
    state: state,
    punch: punch,
    calculateDistance: calculateDistance,
    getGeofenceSettings: getGeofenceSettings,
    getTodayPunchStatus: getTodayPunchStatus,
    processCorrection: processCorrection,
    exportTeacherAttendanceExcel: exportTeacherAttendanceExcel,
    exportAdminSummaryExcel: exportAdminSummaryExcel,
    render: render
  };

})();
