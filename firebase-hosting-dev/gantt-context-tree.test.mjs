import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function functionBlock(name, nextName) {
  const start = app.indexOf(`function ${name}`);
  const end = app.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `Missing ${name}`);
  return app.slice(start, end);
}

const summarySource = functionBlock('qltdRecalculateVisibleStructuralSummaries', 'shouldShowByDepth');
const context = vm.createContext({});
vm.runInContext(summarySource, context);

const tasks = [
  { id: 'z1', parent: '0', rowType: 'ZONE_GROUP', start_date: '', end_date: '', $no_bar: true },
  { id: 'g1', parent: 'z1', rowType: 'STRUCTURAL_GROUP', start_date: '', end_date: '', $no_bar: true },
  { id: 'sg', parent: 'g1', rowType: 'SCHEDULED_GROUP', sourceStart: '2026-01-01', sourceEnd: '2026-01-10', start_date: '2026-01-01', end_date: '2026-01-10' },
  { id: 't1', parent: 'sg', rowType: 'TASK', start_date: '2026-01-02', end_date: '2026-01-20' }
];
const visible = Object.fromEntries(tasks.map((task) => [task.id, true]));
const result = context.qltdRecalculateVisibleStructuralSummaries(tasks, visible);
const byId = Object.fromEntries(result.map((task) => [task.id, task]));

assert.equal(byId.z1.end_date, '2026-01-20');
assert.equal(byId.g1.end_date, '2026-01-20');
assert.equal(byId.sg.end_date, '2026-01-10');
assert.equal(byId.t1.parent, 'sg');

const filterSource = functionBlock('applyGanttFilters', 'qltdRecalculateVisibleStructuralSummaries');
assert.match(filterSource, /while \(current && !guard/);
assert.match(filterSource, /current = byId\[parentId\]/);
assert.doesNotMatch(filterSource, /parent:\s*'0'/);
assert.match(app, /data-dashboard-context-filter/);
assert.match(app, /isNormalizedCountedTask/);
assert.match(app, /renderDeptObjectiveContext/);
assert.doesNotMatch(app, /Chưa xác định Hạng mục/);
assert.doesNotMatch(app, /Công việc chưa được gắn Hạng mục/);
assert.doesNotMatch(app, /Chưa mapping Hạng mục|Cần rà soát context/);
assert.doesNotMatch(app, /HANG_MUC_NOT_RESOLVED/);

console.log('Gantt context tree/filter/dashboard/PB UI: PASS');
