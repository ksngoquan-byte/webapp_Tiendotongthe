import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  buildMainMilestoneFilteredView,
  getMainMilestoneStableKey,
  isMainMilestoneKeySelected
} from './main-milestone-logic.js';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

const context = vm.createContext({});
vm.runInContext(extractFunction(app, 'isGanttBusinessRow'), context);
assert.equal(context.isGanttBusinessRow({ rowType: 'TASK' }, 'main-milestones'), true);
assert.equal(context.isGanttBusinessRow({ rowType: 'MILESTONE' }, 'main-milestones'), true);
assert.equal(context.isGanttBusinessRow({ rowType: 'SCHEDULED_GROUP' }, 'main-milestones'), true);
assert.equal(context.isGanttBusinessRow({ rowType: 'STRUCTURAL_GROUP' }, 'main-milestones'), false);

const projectCode = '37-5.HL';
const tasks = [
  { id: 'zone', taskId: 'zone', parent: '0', rowType: 'ZONE_GROUP', text: 'Zone 1', congViecZone: ' zone   1 ', owner: '' },
  { id: 'lk', taskId: 'lk', parent: 'zone', rowType: 'STRUCTURAL_GROUP', text: 'LK02', congViecHangMuc: 'lk02', owner: '' },
  { id: 'noise', taskId: 'noise', parent: 'lk', rowType: 'STRUCTURAL_GROUP', text: 'Parent name', congViecHangMuc: 'LK99', owner: '' },
  { id: 'group', taskId: 'group', parent: 'noise', rowType: 'SCHEDULED_GROUP', owner: 'KinhDoanh' },
  { id: 'task', taskId: 'task', parent: 'group', rowType: 'TASK', owner: 'KinhDoanh' }
];
const selectedKeys = new Set([
  getMainMilestoneStableKey(tasks[3], projectCode),
  getMainMilestoneStableKey(tasks[4], projectCode)
]);
const directlyMatched = tasks.filter((task) =>
  task.owner === 'KinhDoanh' &&
  context.isGanttBusinessRow(task, 'main-milestones') &&
  isMainMilestoneKeySelected(selectedKeys, task, projectCode)
);
assert.deepEqual(directlyMatched.map((task) => task.id), ['group', 'task']);

const filteredView = buildMainMilestoneFilteredView(tasks, directlyMatched);
assert.deepEqual(filteredView.map((task) => task.id), ['lk', 'group', 'task']);
assert.equal(filteredView.find((task) => task.id === 'lk').parent, '0');
assert.equal(filteredView.find((task) => task.id === 'group').parent, 'lk');
assert.equal(filteredView.find((task) => task.id === 'task').parent, 'lk');
assert.equal(tasks.find((task) => task.id === 'group').parent, 'noise');

const visibleIds = new Set(filteredView.map((task) => task.id));
const links = [
  { source: 'group', target: 'task' },
  { source: 'noise', target: 'task' }
].filter((link) => visibleIds.has(link.source) && visibleIds.has(link.target));
assert.deepEqual(links, [{ source: 'group', target: 'task' }]);

assert.match(app, /buildMainMilestoneFilteredView\(allTasks, matchedTasks\)/);
assert.match(app, /visibleIds\[String\(link\.source\)\] && visibleIds\[String\(link\.target\)\]/);
assert.match(app, /function isNormalizedCountedTask[\s\S]*rowType === 'TASK' \|\| rowType === 'MILESTONE'/);

console.log('Gantt main milestone exact structural/reparent/link filter: PASS');
