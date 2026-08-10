function parseLocalDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeekMonday(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function startOfQuarter(date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

export function getGanttVisibleRange(tasks = [], zoom = 'month') {
  let minDate = null;
  let maxDate = null;

  (tasks || []).forEach((task) => {
    if (!task || task.$no_bar) return;
    const start = parseLocalDate(task.start_date || task.sourceStart || task.displayStart);
    const end = parseLocalDate(task.end_date || task.sourceEnd || task.displayEnd);
    if (!start || !end) return;
    if (!minDate || start < minDate) minDate = start;
    if (!maxDate || end > maxDate) maxDate = end;
  });

  if (!minDate || !maxDate) return null;
  if (maxDate < minDate) maxDate = minDate;

  if (zoom === 'day') {
    return { start: minDate, end: addDays(maxDate, 1) };
  }

  if (zoom === 'week') {
    const start = startOfWeekMonday(minDate);
    const endWeek = startOfWeekMonday(maxDate);
    return { start, end: addDays(endWeek, 7) };
  }

  if (zoom === 'quarter') {
    const start = startOfQuarter(minDate);
    const endQuarter = startOfQuarter(maxDate);
    return { start, end: new Date(endQuarter.getFullYear(), endQuarter.getMonth() + 3, 1) };
  }

  if (zoom === 'year') {
    return {
      start: new Date(minDate.getFullYear(), 0, 1),
      end: new Date(maxDate.getFullYear() + 1, 0, 1)
    };
  }

  return {
    start: new Date(minDate.getFullYear(), minDate.getMonth(), 1),
    end: new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1)
  };
}

function isBaselineComparisonActive() {
  if (typeof document === 'undefined') return false;
  const toggle = document.getElementById('ganttBaselineComparisonToggle');
  if (!toggle) return false;
  return toggle.getAttribute('aria-pressed') === 'true' || toggle.classList.contains('active');
}

function getCurrentZoom() {
  if (typeof document === 'undefined') return 'month';
  return document.getElementById('ganttZoomSelect')?.value || 'month';
}

export function patchGanttVisibleRange(gantt) {
  if (!gantt || typeof gantt.parse !== 'function' || gantt.__qltdVisibleRangeV1) return false;
  const originalParse = gantt.parse;

  gantt.parse = function(payload) {
    if (!isBaselineComparisonActive()) {
      const range = getGanttVisibleRange(payload && payload.data || [], getCurrentZoom());
      if (range && this.config) {
        this.config.fit_tasks = false;
        this.config.start_date = range.start;
        this.config.end_date = range.end;
      }
    }
    return originalParse.apply(this, arguments);
  };

  gantt.__qltdVisibleRangeV1 = true;
  return true;
}

export function installGanttVisibleRangePatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const tryPatch = () => patchGanttVisibleRange(
    window.gantt || (window.dhtmlxgantt && window.dhtmlxgantt.gantt)
  );

  if (tryPatch()) return true;
  if (!document.head || typeof MutationObserver === 'undefined') return false;

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      Array.from(record.addedNodes || []).forEach((node) => {
        if (
          node &&
          String(node.tagName || '').toUpperCase() === 'SCRIPT' &&
          String(node.src || '').includes('dhtmlxgantt.js')
        ) {
          node.addEventListener('load', () => {
            if (tryPatch()) observer.disconnect();
          }, { once: true });
        }
      });
    });
    if (tryPatch()) observer.disconnect();
  });

  observer.observe(document.head, { childList: true });
  return true;
}

installGanttVisibleRangePatch();
