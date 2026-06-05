'use strict';

/* ============================================================
   Shishu Vikash Mandir - Teacher Attendance & GPS Geofence Module
   ============================================================ */

(function() {

  // Default Coordinates: Shishu Vikash Mandir in Chandrapura
  var SCHOOL_LAT = 23.7588;
  var SCHOOL_LON = 86.1179;
  var GEOFENCE_RADIUS = 200; // Radius in meters (roughly 200m)

  var state = {
    activeTab: 'approvals', // 'approvals' | 'logs'
    selectedDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    clockInterval: null,
    lastCapturedLocation: null
  };

  // Haversine formula to compute distance between coordinates in meters
  function calculateDistance(lat1, lon1, lat2, lon2) {
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
    var todayStr = new Date().toISOString().split('T')[0];
    var punches = (SchoolApp.store.teacherAttendance || []).filter(function(p) {
      return p.teacherId === teacherId && p.date === todayStr;
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

    SchoolApp.showToast('Capturing GPS coordinates...', 'info');

    navigator.geolocation.getCurrentPosition(function(position) {
      var lat = position.coords.latitude;
      var lon = position.coords.longitude;
      
      var distance = calculateDistance(lat, lon, SCHOOL_LAT, SCHOOL_LON);
      var isInside = distance <= GEOFENCE_RADIUS;
      var geofenceStatus = isInside ? 'Inside Geofence' : 'Outside Geofence';

      var todayStr = new Date().toISOString().split('T')[0];
      var timeStr = new Date().toTimeString().split(' ')[0]; // HH:MM:SS

      var punchRecord = {
        id: SchoolApp.generateId(),
        teacherId: SchoolApp.currentUser.id,
        teacherName: SchoolApp.currentUser.firstName + ' ' + SchoolApp.currentUser.lastName,
        date: todayStr,
        type: type,
        time: timeStr,
        timestamp: new Date().toISOString(),
        latitude: lat,
        longitude: lon,
        distance: Math.round(distance),
        geofenceStatus: geofenceStatus,
        method: 'GPS'
      };

      if (!SchoolApp.store.teacherAttendance) {
        SchoolApp.store.teacherAttendance = [];
      }

      SchoolApp.store.teacherAttendance.push(punchRecord);
      SchoolApp.save();

      state.lastCapturedLocation = {
        latitude: lat.toFixed(5),
        longitude: lon.toFixed(5),
        distance: Math.round(distance),
        status: geofenceStatus
      };

      var successMsg = 'Attendance marked: Checked ' + (type === 'in' ? 'In' : 'Out') + '. Status: ' + geofenceStatus;
      SchoolApp.showToast(successMsg, isInside ? 'success' : 'warning');
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

  function showCorrectionModal() {
    var todayStr = new Date().toISOString().split('T')[0];

    var bodyHTML = '<form id="correction-request-form" class="form-grid">';
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Select Correction Date *</label>';
    bodyHTML += '<input type="date" id="corr-date" class="form-input" max="' + todayStr + '" required></div>';
    
    bodyHTML += '<div class="form-group"><label class="form-label">Requested Time In *</label>';
    bodyHTML += '<input type="time" id="corr-time-in" class="form-input" required></div>';
    
    bodyHTML += '<div class="form-group"><label class="form-label">Requested Time Out *</label>';
    bodyHTML += '<input type="time" id="corr-time-out" class="form-input" required></div>';
    
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Reason / Justification *</label>';
    bodyHTML += '<textarea id="corr-reason" class="form-textarea" rows="3" placeholder="e.g. Forgot to check in at morning assembly or medical leave half-day" required></textarea></div>';
    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="submit-correction-btn"><span class="material-icons-round">send</span> Submit Request</button>';

    SchoolApp.showModal('Request Attendance Correction', bodyHTML, footerHTML);

    document.getElementById('submit-correction-btn').addEventListener('click', function() {
      var dateVal = document.getElementById('corr-date').value;
      var timeInVal = document.getElementById('corr-time-in').value;
      var timeOutVal = document.getElementById('corr-time-out').value;
      var reasonVal = document.getElementById('corr-reason').value.trim();

      if (!dateVal || !timeInVal || !timeOutVal || !reasonVal) {
        SchoolApp.showToast('Please fill in all requested fields correctly.', 'error');
        return;
      }

      var request = {
        id: SchoolApp.generateId(),
        teacherId: SchoolApp.currentUser.id,
        teacherName: SchoolApp.currentUser.firstName + ' ' + SchoolApp.currentUser.lastName,
        date: dateVal,
        timeIn: timeInVal,
        timeOut: timeOutVal,
        reason: reasonVal,
        status: 'Pending',
        submittedAt: new Date().toISOString()
      };

      if (!SchoolApp.store.teacherCorrectionRequests) {
        SchoolApp.store.teacherCorrectionRequests = [];
      }

      SchoolApp.store.teacherCorrectionRequests.push(request);
      SchoolApp.save();
      SchoolApp.closeModal();
      SchoolApp.showToast('Correction request submitted for approval.', 'success');
      render();
    });
  }

  function processCorrection(requestId, approve) {
    if (!SchoolApp.store.teacherCorrectionRequests) return;

    var reqIdx = SchoolApp.store.teacherCorrectionRequests.findIndex(function(r) { return r.id === requestId; });
    if (reqIdx === -1) return;

    var request = SchoolApp.store.teacherCorrectionRequests[reqIdx];
    
    if (approve) {
      request.status = 'Approved';

      // Insert Punch In log entry
      var inRecord = {
        id: SchoolApp.generateId(),
        teacherId: request.teacherId,
        teacherName: request.teacherName,
        date: request.date,
        type: 'in',
        time: request.timeIn + ':00',
        timestamp: request.date + 'T' + request.timeIn + ':00.000Z',
        latitude: null,
        longitude: null,
        distance: 0,
        geofenceStatus: 'Inside Geofence (Manual Correction)',
        method: 'Manual'
      };

      // Insert Punch Out log entry
      var outRecord = {
        id: SchoolApp.generateId(),
        teacherId: request.teacherId,
        teacherName: request.teacherName,
        date: request.date,
        type: 'out',
        time: request.timeOut + ':00',
        timestamp: request.date + 'T' + request.timeOut + ':00.000Z',
        latitude: null,
        longitude: null,
        distance: 0,
        geofenceStatus: 'Inside Geofence (Manual Correction)',
        method: 'Manual'
      };

      if (!SchoolApp.store.teacherAttendance) SchoolApp.store.teacherAttendance = [];
      SchoolApp.store.teacherAttendance.push(inRecord);
      SchoolApp.store.teacherAttendance.push(outRecord);

      SchoolApp.showToast('Correction approved and punches injected successfully.', 'success');
    } else {
      request.status = 'Rejected';
      SchoolApp.showToast('Correction request rejected.', 'warning');
    }

    request.reviewedAt = new Date().toISOString();
    SchoolApp.save();
    render();
  }

  function renderTeacherUI(container) {
    var teacherId = SchoolApp.currentUser.id;
    var status = getTodayPunchStatus(teacherId);

    var disableIn = !!status.punchIn;
    var disableOut = !status.punchIn || !!status.punchOut;

    var todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    var html = '<div class="teacher-attendance-portal">';

    // Punch Box UI
    html += '<div class="punch-card-wrapper">';
    html += '<div class="punch-clock" id="punch-live-clock">00:00:00</div>';
    html += '<div class="punch-date">' + todayStr + '</div>';
    
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

    // GPS visual indicator
    if (state.lastCapturedLocation) {
      var loc = state.lastCapturedLocation;
      var badgeClass = loc.status === 'Inside Geofence' ? 'inside' : 'outside';
      var badgeIcon = loc.status === 'Inside Geofence' ? 'check_circle' : 'warning';
      html += '<div class="geofence-badge ' + badgeClass + '"><span class="material-icons-round">' + badgeIcon + '</span>' + loc.status + '</div>';
      html += '<div class="gps-info-text">Last Punch GPS: ' + loc.latitude + ', ' + loc.longitude + ' (' + loc.distance + 'm from school)</div>';
    } else {
      // Default info indicator
      html += '<div class="gps-info-text"><span class="material-icons-round" style="font-size:14px; vertical-align:middle;">location_on</span> SVM Geofence Radius: 200m</div>';
    }

    html += '<button class="btn btn-secondary btn-sm" id="corr-request-btn" style="margin-top: 16px;"><span class="material-icons-round">history_toggle_off</span> Request Correction</button>';
    html += '</div>'; // End punch-card-wrapper

    // Personal Logs List
    html += '<div class="card mb-4"><div class="card-header"><h3><span class="material-icons-round">history</span> My Punch Logs (Last 30 Days)</h3></div>';
    html += '<div class="card-body">';
    
    var myPunches = (SchoolApp.store.teacherAttendance || []).filter(function(p) { return p.teacherId === teacherId; });
    myPunches.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

    if (myPunches.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>Date</th><th>Time</th><th>Type</th><th>Geofence Status</th><th>Coordinates</th><th>Method</th>';
      html += '</tr></thead><tbody>';
      myPunches.forEach(function(p) {
        var typeColor = p.type === 'in' ? 'badge-success' : 'badge-danger';
        var geoColor = p.geofenceStatus.indexOf('Inside') !== -1 ? 'badge-success' : 'badge-danger';
        var coordsText = p.latitude ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : '—';
        
        html += '<tr>';
        html += '<td>' + SchoolApp.formatDate(p.date) + '</td>';
        html += '<td><strong>' + p.time + '</strong></td>';
        html += '<td><span class="badge ' + typeColor + '">Punch ' + p.type.toUpperCase() + '</span></td>';
        html += '<td><span class="badge ' + geoColor + '">' + p.geofenceStatus + '</span></td>';
        html += '<td>' + coordsText + '</td>';
        html += '<td><span class="badge badge-info">' + p.method + '</span></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding: 24px;"><span class="material-icons-round">fingerprint</span><h3>No Punches Recorded</h3><p>You have not registered any punch logs yet.</p></div>';
    }
    html += '</div></div>';

    // Pending Correction Requests
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">edit_calendar</span> My Correction Requests</h3></div>';
    html += '<div class="card-body">';
    var myRequests = (SchoolApp.store.teacherCorrectionRequests || []).filter(function(r) { return r.teacherId === teacherId; });
    myRequests.sort(function(a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });

    if (myRequests.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>Requested Date</th><th>In / Out Time</th><th>Reason</th><th>Status</th>';
      html += '</tr></thead><tbody>';
      myRequests.forEach(function(r) {
        var statusColor = 'badge-purple';
        if (r.status === 'Approved') statusColor = 'badge-success';
        if (r.status === 'Rejected') statusColor = 'badge-danger';
        
        html += '<tr>';
        html += '<td>' + SchoolApp.formatDate(r.date) + '</td>';
        html += '<td><strong>' + r.timeIn + ' - ' + r.timeOut + '</strong></td>';
        html += '<td>' + r.reason + '</td>';
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
        var time = new Date().toTimeString().split(' ')[0];
        clockEl.textContent = time;
      }
    }, 1000);

    // Initial clock setup
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
  }

  function renderAdminUI(container) {
    if (state.clockInterval) {
      clearInterval(state.clockInterval);
      state.clockInterval = null;
    }

    var html = '<div class="admin-teacher-attendance">';

    // Tabs
    html += '<div class="teacher-att-tabs">';
    html += '<button class="teacher-att-tab ' + (state.activeTab === 'approvals' ? 'active' : '') + '" id="tab-btn-approvals">Correction Requests</button>';
    html += '<button class="teacher-att-tab ' + (state.activeTab === 'logs' ? 'active' : '') + '" id="tab-btn-logs">Daily GPS Logs</button>';
    html += '</div>';

    if (state.activeTab === 'approvals') {
      html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">checklist</span> Pending Correction Requests</h3></div>';
      html += '<div class="card-body">';

      var pending = (SchoolApp.store.teacherCorrectionRequests || []).filter(function(r) { return r.status === 'Pending'; });
      
      if (pending.length > 0) {
        html += '<div class="table-container"><table class="data-table"><thead><tr>';
        html += '<th>Teacher Name</th><th>Requested Date</th><th>In / Out Time</th><th>Reason</th><th>Submitted At</th><th>Actions</th>';
        html += '</tr></thead><tbody>';

        pending.forEach(function(r) {
          html += '<tr>';
          html += '<td><strong>' + r.teacherName + '</strong></td>';
          html += '<td>' + SchoolApp.formatDate(r.date) + '</td>';
          html += '<td><strong>' + r.timeIn + ' - ' + r.timeOut + '</strong></td>';
          html += '<td>' + r.reason + '</td>';
          html += '<td>' + new Date(r.submittedAt).toLocaleString('en-IN') + '</td>';
          html += '<td><div class="table-actions">';
          html += '<button class="btn-icon approve-request-btn" data-id="' + r.id + '" title="Approve" style="color:var(--success); font-size: 22px;"><span class="material-icons-round">check_circle</span></button>';
          html += '<button class="btn-icon reject-request-btn" data-id="' + r.id + '" title="Reject" style="color:var(--danger); font-size: 22px;"><span class="material-icons-round">cancel</span></button>';
          html += '</div></td>';
          html += '</tr>';
        });

        html += '</tbody></table></div>';
      } else {
        html += '<div class="empty-state" style="padding: 24px;"><span class="material-icons-round">playlist_add_check</span><h3>No Pending Requests</h3><p>All teacher correction requests have been processed.</p></div>';
      }

      html += '</div></div>';
    } else {
      // Daily GPS Logs tab
      html += '<div class="card"><div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">';
      html += '<h3><span class="material-icons-round">history</span> Daily GPS Punch Logs</h3>';
      html += '<div class="filter-group" style="margin: 0;"><input type="date" id="admin-log-date-picker" class="form-input" value="' + state.selectedDate + '" style="max-width:180px;"></div>';
      html += '</div>';
      
      html += '<div class="card-body">';

      var dayLogs = (SchoolApp.store.teacherAttendance || []).filter(function(l) { return l.date === state.selectedDate; });
      dayLogs.sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });

      if (dayLogs.length > 0) {
        html += '<div class="table-container"><table class="data-table"><thead><tr>';
        html += '<th>Teacher Name</th><th>Time</th><th>Type</th><th>Geofence Status</th><th>Coordinates</th><th>Method</th>';
        html += '</tr></thead><tbody>';

        dayLogs.forEach(function(l) {
          var typeColor = l.type === 'in' ? 'badge-success' : 'badge-danger';
          var geoColor = l.geofenceStatus.indexOf('Inside') !== -1 ? 'badge-success' : 'badge-danger';
          var coordsText = l.latitude ? l.latitude.toFixed(5) + ', ' + l.longitude.toFixed(5) + ' (' + l.distance + 'm)' : '—';

          html += '<tr>';
          html += '<td><strong>' + l.teacherName + '</strong></td>';
          html += '<td>' + l.time + '</td>';
          html += '<td><span class="badge ' + typeColor + '">Punch ' + l.type.toUpperCase() + '</span></td>';
          html += '<td><span class="badge ' + geoColor + '">' + l.geofenceStatus + '</span></td>';
          html += '<td>' + coordsText + '</td>';
          html += '<td><span class="badge badge-info">' + l.method + '</span></td>';
          html += '</tr>';
        });

        html += '</tbody></table></div>';
      } else {
        html += '<div class="empty-state" style="padding:24px;"><span class="material-icons-round">date_range</span><h3>No Punches on ' + SchoolApp.formatDate(state.selectedDate) + '</h3><p>Try selecting another date to view logs.</p></div>';
      }

      html += '</div></div>';
    }

    html += '</div>';

    container.innerHTML = html;

    // Attach listeners
    var approvalsBtn = document.getElementById('tab-btn-approvals');
    if (approvalsBtn) {
      approvalsBtn.addEventListener('click', function() {
        state.activeTab = 'approvals';
        render();
      });
    }

    var logsBtn = document.getElementById('tab-btn-logs');
    if (logsBtn) {
      logsBtn.addEventListener('click', function() {
        state.activeTab = 'logs';
        render();
      });
    }

    if (state.activeTab === 'approvals') {
      document.querySelectorAll('.approve-request-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = this.getAttribute('data-id');
          SchoolApp.showConfirm('Approve this attendance correction request?', function() {
            processCorrection(id, true);
          });
        });
      });

      document.querySelectorAll('.reject-request-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = this.getAttribute('data-id');
          SchoolApp.showConfirm('Reject this attendance correction request?', function() {
            processCorrection(id, false);
          });
        });
      });
    } else {
      var datePicker = document.getElementById('admin-log-date-picker');
      if (datePicker) {
        datePicker.addEventListener('change', function() {
          state.selectedDate = this.value;
          render();
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

})();
