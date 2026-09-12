'use strict';

/* ============================================================
   Shishu Vikash Mandir - Utility Functions
   ============================================================ */

(function() {

  // Ensure SchoolApp exists
  if (!window.SchoolApp) window.SchoolApp = {};

  window.SchoolApp.utils = {

    // ---------- Excel Export ----------
    exportToExcel: function(data, columns, filename) {
      if (!data || data.length === 0) {
        SchoolApp.showToast('No data to export.', 'warning');
        return;
      }

      try {
        if (typeof XLSX === 'undefined') {
          this.exportToCSV(data, columns, filename.replace('.xlsx', '.csv'));
          return;
        }

        var rows = data.map(function(item) {
          var row = {};
          columns.forEach(function(col) {
            var val = item[col.key];
            if (col.transform) val = col.transform(val, item);
            row[col.header] = val != null ? val : '';
          });
          return row;
        });

        var ws = XLSX.utils.json_to_sheet(rows);

        // Auto-size columns
        var colWidths = columns.map(function(col) {
          var maxLen = col.header.length;
          data.forEach(function(item) {
            var val = item[col.key];
            if (col.transform) val = col.transform(val, item);
            var len = val != null ? String(val).length : 0;
            if (len > maxLen) maxLen = len;
          });
          return { wch: Math.min(maxLen + 4, 50) };
        });
        ws['!cols'] = colWidths;

        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        XLSX.writeFile(wb, filename);

        SchoolApp.showToast('Exported ' + data.length + ' records to ' + filename, 'success');
      } catch (e) {
        console.error('Export error:', e);
        SchoolApp.showToast('Export failed: ' + e.message, 'error');
      }
    },

    // ---------- Excel Import ----------
    importFromExcel: function(file, callback) {
      if (!file) return;

      try {
        var reader = new FileReader();
        reader.onload = function(e) {
          try {
            if (typeof XLSX === 'undefined') {
              SchoolApp.showToast('XLSX library not loaded. Cannot import.', 'error');
              return;
            }

            var data = new Uint8Array(e.target.result);
            // cellDates:true — if a school's spreadsheet app auto-converted a
            // typed date (e.g. Date of Birth) into an actual Excel date cell,
            // this returns it as a JS Date object instead of a raw numeric
            // serial (e.g. 43235), which importer code can then normalize
            // properly instead of storing the meaningless number as text.
            var workbook = XLSX.read(data, { type: 'array', cellDates: true });
            var sheetName = workbook.SheetNames[0];
            var sheet = workbook.Sheets[sheetName];
            var jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            var headers = Object.keys(jsonData[0] || {});

            if (callback) callback(jsonData, headers);
          } catch (err) {
            console.error('Import parse error:', err);
            SchoolApp.showToast('Failed to parse file: ' + err.message, 'error');
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (e) {
        console.error('Import error:', e);
        SchoolApp.showToast('Import failed: ' + e.message, 'error');
      }
    },

    // ---------- CSV Export (fallback) ----------
    exportToCSV: function(data, columns, filename) {
      if (!data || data.length === 0) {
        SchoolApp.showToast('No data to export.', 'warning');
        return;
      }

      var csv = columns.map(function(c) { return '"' + c.header + '"'; }).join(',') + '\n';
      data.forEach(function(item) {
        var row = columns.map(function(col) {
          var val = item[col.key];
          if (col.transform) val = col.transform(val, item);
          val = val != null ? String(val).replace(/"/g, '""') : '';
          return '"' + val + '"';
        });
        csv += row.join(',') + '\n';
      });

      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);

      SchoolApp.showToast('Exported ' + data.length + ' records to CSV.', 'success');
    },

    // ---------- JSON Export ----------
    downloadJSON: function(data, filename) {
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },

    // ---------- JSON Import ----------
    importJSON: function(file, callback) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          if (callback) callback(data);
        } catch (err) {
          SchoolApp.showToast('Invalid JSON file.', 'error');
        }
      };
      reader.readAsText(file);
    },

    // ---------- Validation ----------
    validate: {
      email: function(email) {
        if (!email) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      phone: function(phone) {
        if (!phone) return false;
        var digits = phone.replace(/[\s\-\+\(\)]/g, '');
        return digits.length >= 10 && digits.length <= 13;
      },
      aadhaar: function(aadhaar) {
        if (!aadhaar) return true; // optional field
        var digits = aadhaar.replace(/\s/g, '');
        return /^\d{12}$/.test(digits);
      },
      required: function(value) {
        return value != null && String(value).trim().length > 0;
      },
      minLength: function(value, min) {
        return value != null && String(value).length >= min;
      },
      date: function(dateStr) {
        if (!dateStr) return false;
        var d = new Date(dateStr);
        return !isNaN(d.getTime());
      }
    },

    // ---------- Formatting ----------
    format: {
      phone: function(phone) {
        if (!phone) return '—';
        return phone;
      },
      aadhaar: function(aadhaar) {
        if (!aadhaar) return '—';
        var digits = aadhaar.replace(/\s/g, '');
        if (digits.length !== 12) return aadhaar;
        return digits.substr(0, 4) + ' ' + digits.substr(4, 4) + ' ' + digits.substr(8, 4);
      },
      date: function(dateStr) {
        return SchoolApp.formatDate(dateStr);
      },
      dateRelative: function(dateStr) {
        if (!dateStr) return '—';
        var date = new Date(dateStr);
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        var diff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        if (diff < 7) return diff + ' days ago';
        if (diff < 30) return Math.floor(diff / 7) + ' weeks ago';
        return SchoolApp.formatDate(dateStr);
      },
      percentage: function(value, total) {
        if (!total || total === 0) return '0%';
        return ((value / total) * 100).toFixed(1) + '%';
      },
      truncate: function(str, maxLen) {
        if (!str) return '';
        maxLen = maxLen || 30;
        return str.length > maxLen ? str.substr(0, maxLen) + '...' : str;
      }
    },

    // ---------- Chart Utilities ----------
    chart: {
      renderBarChart: function(containerId, data, options) {
        var container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container || !data || data.length === 0) return;

        options = options || {};
        var maxVal = options.maxValue || Math.max.apply(null, data.map(function(d) { return d.value; }));
        var height = options.height || 180;

        var html = '<div class="chart-container"><div class="chart-bars" style="height: ' + height + 'px">';
        data.forEach(function(d) {
          var barHeight = maxVal > 0 ? Math.max((d.value / maxVal) * (height - 30), 4) : 4;
          var color = d.color || 'var(--accent-gradient)';
          html += '<div class="chart-bar-wrapper">';
          html += '<div class="chart-bar" style="height: ' + barHeight + 'px; background: ' + color + '">';
          html += '<div class="chart-bar-value">' + d.value + (options.suffix || '') + '</div>';
          html += '</div>';
          html += '<div class="chart-label">' + d.label + '</div>';
          html += '</div>';
        });
        html += '</div></div>';
        container.innerHTML = html;
      },

      renderDonutChart: function(containerId, data, options) {
        var container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container || !data || data.length === 0) return;

        options = options || {};
        var total = data.reduce(function(sum, d) { return sum + d.value; }, 0);

        // Build conic-gradient
        var gradientParts = [];
        var cumulative = 0;
        data.forEach(function(d) {
          var start = cumulative;
          cumulative += (d.value / total) * 360;
          gradientParts.push(d.color + ' ' + start + 'deg ' + cumulative + 'deg');
        });

        var html = '<div class="donut-chart" style="background: conic-gradient(' + gradientParts.join(', ') + ')">';
        html += '<div class="donut-center"><span class="donut-value">' + total + '</span><span class="donut-label">' + (options.centerLabel || 'Total') + '</span></div>';
        html += '</div>';

        html += '<div class="chart-legend">';
        data.forEach(function(d) {
          html += '<div class="legend-item"><span class="legend-dot" style="background:' + d.color + '"></span>' + d.label + ' (' + d.value + ')</div>';
        });
        html += '</div>';

        container.innerHTML = html;
      },

      renderProgressBar: function(containerId, value, max, color) {
        var container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return;

        var perc = max > 0 ? Math.round((value / max) * 100) : 0;
        color = color || 'var(--accent-gradient)';

        container.innerHTML = '<div class="progress-bar"><div class="progress-fill" style="width: ' + perc + '%; background: ' + color + '"></div></div>';
      }
    },

    // ---------- Search & Filter ----------
    search: {
      fuzzyMatch: function(query, text) {
        if (!query || !text) return !query;
        query = query.toLowerCase();
        text = text.toLowerCase();
        return text.indexOf(query) !== -1;
      },

      filterArray: function(array, filters) {
        if (!array) return [];
        if (!filters) return array;

        return array.filter(function(item) {
          return Object.keys(filters).every(function(key) {
            var filterVal = filters[key];
            if (!filterVal || filterVal === 'all' || filterVal === '') return true;
            return String(item[key]).toLowerCase() === String(filterVal).toLowerCase();
          });
        });
      }
    },

    // ---------- Date Utilities ----------
    date: {
      today: function() {
        return new Date().toISOString().split('T')[0];
      },

      isWeekday: function(dateStr) {
        var d = new Date(dateStr);
        var day = d.getDay();
        return day !== 0 && day !== 6;
      },

      getPastWeekdays: function(count) {
        var days = [];
        var d = new Date();
        d.setDate(d.getDate() - 1);
        while (days.length < count) {
          if (d.getDay() !== 0 && d.getDay() !== 6) {
            days.push(d.toISOString().split('T')[0]);
          }
          d.setDate(d.getDate() - 1);
        }
        return days;
      },

      formatForDisplay: function(dateStr) {
        return SchoolApp.formatDate(dateStr);
      },

      daysBetween: function(date1, date2) {
        var d1 = new Date(date1);
        var d2 = new Date(date2);
        return Math.floor(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
      },

      isToday: function(dateStr) {
        return dateStr === new Date().toISOString().split('T')[0];
      }
    }
  };

})();
