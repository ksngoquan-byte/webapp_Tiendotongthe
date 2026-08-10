import assert from 'node:assert/strict';
import { getGanttVisibleRange, patchGanttVisibleRange } from './gantt-visible-range.js';

function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

{
  const range = getGanttVisibleRange([
    { start_date: '2026-03-13', end_date: '2026-09-30' },
    { start_date: '2031-01-01', end_date: '2031-08-02' }
  ], 'year');
  assert.equal(iso(range.start), '2026-01-01');
  assert.equal(iso(range.end), '2032-01-01');
}

{
  const range = getGanttVisibleRange([
    { start_date: '2026-03-13', end_date: '2026-09-30' }
  ], 'year');
  assert.equal(iso(range.start), '2026-01-01');
  assert.equal(iso(range.end), '2027-01-01');
}

{
  const range = getGanttVisibleRange([
    { start_date: '2026-03-13', end_date: '2027-01-02' }
  ], 'quarter');
  assert.equal(iso(range.start), '2026-01-01');
  assert.equal(iso(range.end), '2027-04-01');
}

{
  const range = getGanttVisibleRange([
    { start_date: '2026-03-13', end_date: '2026-08-02' }
  ], 'month');
  assert.equal(iso(range.start), '2026-03-01');
  assert.equal(iso(range.end), '2026-09-01');
}

{
  const range = getGanttVisibleRange([
    { start_date: '2026-03-18', end_date: '2026-03-18' }
  ], 'week');
  assert.equal(iso(range.start), '2026-03-16');
  assert.equal(iso(range.end), '2026-03-23');
}

{
  const range = getGanttVisibleRange([
    { start_date: '2025-01-01', end_date: '2025-12-31', $no_bar: true },
    { start_date: '2026-03-13', end_date: '2026-09-30' }
  ], 'year');
  assert.equal(iso(range.start), '2026-01-01');
}

{
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      if (id === 'ganttZoomSelect') return { value: 'year' };
      if (id === 'ganttBaselineComparisonToggle') return null;
      return null;
    }
  };
  let receivedPayload = null;
  const gantt = {
    config: { fit_tasks: true },
    parse(payload) { receivedPayload = payload; return 'ok'; }
  };
  assert.equal(patchGanttVisibleRange(gantt), true);
  const result = gantt.parse({ data: [{ start_date: '2026-03-13', end_date: '2026-09-30' }] });
  assert.equal(result, 'ok');
  assert.ok(receivedPayload);
  assert.equal(gantt.config.fit_tasks, false);
  assert.equal(iso(gantt.config.start_date), '2026-01-01');
  assert.equal(iso(gantt.config.end_date), '2027-01-01');
  globalThis.document = originalDocument;
}

{
  const originalDocument = globalThis.document;
  const existingStart = new Date(2025, 0, 1);
  const existingEnd = new Date(2030, 0, 1);
  globalThis.document = {
    getElementById(id) {
      if (id === 'ganttZoomSelect') return { value: 'year' };
      if (id === 'ganttBaselineComparisonToggle') {
        return {
          getAttribute(name) { return name === 'aria-pressed' ? 'true' : null; },
          classList: { contains() { return true; } }
        };
      }
      return null;
    }
  };
  const gantt = {
    config: { fit_tasks: false, start_date: existingStart, end_date: existingEnd },
    parse() { return 'baseline-ok'; }
  };
  patchGanttVisibleRange(gantt);
  assert.equal(gantt.parse({ data: [{ start_date: '2026-03-13', end_date: '2026-09-30' }] }), 'baseline-ok');
  assert.equal(gantt.config.start_date, existingStart, 'baseline range must remain owned by existing baseline logic');
  assert.equal(gantt.config.end_date, existingEnd, 'baseline range must remain owned by existing baseline logic');
  globalThis.document = originalDocument;
}

console.log('gantt-visible-range.test.mjs PASS');
