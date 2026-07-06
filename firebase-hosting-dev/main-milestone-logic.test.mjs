import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMainMilestoneFilteredView,
  buildMainMilestoneTaskIndex,
  getMainMilestoneStableKey,
  isAllowedMainMilestoneStructuralRow,
  isMainMilestoneKeySelected,
  migrateMainMilestoneKeys,
  resolveLegacyMainMilestoneKey,
  toggleMainMilestoneTaskKey
} from './main-milestone-logic.js';

const projectCode = '37-5.HL';
const tasks = [
  { id: 'A-ID', taskId: 'A-ID', code: 'A-CODE', masterTaskCode: 'A-MASTER', owner: 'KinhDoanh', wbs: 'I.1' },
  { id: 'B-ID', taskId: 'B-ID', code: 'B-CODE', masterTaskCode: 'B-MASTER', owner: 'KinhDoanh', parent: 'A-ID', wbs: 'I.2' },
  { id: 'C-ID', taskId: 'C-ID', code: 'C-CODE', masterTaskCode: 'C-MASTER', owner: 'BQLDA', wbs: 'II.1' },
  { id: 'D-ID', taskId: 'D-ID', code: 'DUPLICATE', masterTaskCode: 'D-MASTER' },
  { id: 'E-ID', taskId: 'E-ID', code: 'DUPLICATE', masterTaskCode: 'E-MASTER' }
];

assert.equal(getMainMilestoneStableKey(tasks[0], projectCode), '37-5.HL|UID:A-ID');
assert.equal(getMainMilestoneStableKey({ text: 'No UID' }, projectCode), '');

const migration = migrateMainMilestoneKeys(
  ['A-ID', 'B-MASTER', 'C-CODE', '37-5.HL|A-MASTER', 'DUPLICATE', 'missing-key'],
  tasks,
  projectCode
);
assert.deepEqual([...migration.keys], [
  '37-5.HL|UID:A-ID',
  '37-5.HL|UID:B-ID',
  '37-5.HL|UID:C-ID'
]);
assert.deepEqual([...migration.orphanKeys], ['DUPLICATE', 'missing-key']);
assert.equal(migration.migratedCount, 4);
assert.equal(migration.ambiguousCount, 1);

const index = buildMainMilestoneTaskIndex(tasks, projectCode);
assert.equal(resolveLegacyMainMilestoneKey('A-ID', index, projectCode).status, 'MIGRATED');
assert.equal(resolveLegacyMainMilestoneKey('37-5.HL|A-MASTER', index, projectCode).status, 'MIGRATED');
assert.equal(resolveLegacyMainMilestoneKey('DUPLICATE', index, projectCode).status, 'AMBIGUOUS');

const selected = new Set(migration.keys);
assert.equal(isMainMilestoneKeySelected(selected, tasks[0], projectCode), true);
toggleMainMilestoneTaskKey(selected, tasks[0], projectCode);
assert.equal(isMainMilestoneKeySelected(selected, tasks[0], projectCode), false);
toggleMainMilestoneTaskKey(selected, tasks[0], projectCode);

const changedTreeTask = {
  ...tasks[0],
  id: 'NEW-ROW-ID',
  parent: 'NEW-PARENT',
  wbs: 'XX.9',
  text: 'Renamed'
};
assert.equal(
  isMainMilestoneKeySelected(selected, changedTreeTask, projectCode),
  true,
  'stable taskId survives row id/parent/WBS/title changes'
);

const structuralTasks = [
  { id: 'zone', parent: '0', rowType: 'ZONE_GROUP', text: '  Zone   1 ', congViecZone: 'zone 1' },
  { id: 'category', parent: 'zone', rowType: 'STRUCTURAL_GROUP', text: 'LK02', congViecHangMuc: ' lk02 ' },
  { id: 'unrelated', parent: 'category', rowType: 'STRUCTURAL_GROUP', text: 'Parent label', congViecHangMuc: 'LK03' },
  { id: 'selected', taskId: 'selected', parent: 'unrelated', rowType: 'TASK', text: 'Milestone' }
];
assert.equal(isAllowedMainMilestoneStructuralRow(structuralTasks[0]), true);
assert.equal(isAllowedMainMilestoneStructuralRow(structuralTasks[1]), true);
assert.equal(isAllowedMainMilestoneStructuralRow(structuralTasks[2]), false);
const filteredView = buildMainMilestoneFilteredView(structuralTasks, [structuralTasks[3]]);
assert.deepEqual(filteredView.map((task) => task.id), ['category', 'selected']);
assert.equal(filteredView.find((task) => task.id === 'category').parent, '0');
assert.equal(filteredView.find((task) => task.id === 'selected').parent, 'category');
assert.equal(structuralTasks[3].parent, 'unrelated', 'source parent is preserved');

const cached = JSON.stringify({ keys: [...selected], orphanKeys: [...migration.orphanKeys] });
const reloaded = JSON.parse(cached);
const afterReload = migrateMainMilestoneKeys(
  [...reloaded.keys, ...reloaded.orphanKeys],
  tasks,
  projectCode
);
assert.deepEqual([...afterReload.keys], [...selected]);
assert.deepEqual([...afterReload.orphanKeys], [...migration.orphanKeys]);

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
assert.doesNotMatch(app, /qltdMainMilestoneIds/);
assert.match(app, /ids: JSON\.stringify\(ids\)/);
assert.match(app, /codes: JSON\.stringify\(codes\)/);
assert.doesNotMatch(app, /compatibility source[\s\S]{0,400}qltdMainMilestoneKeys = new Set\(\)/);
assert.match(app, /Công việc chưa có UID ổn định nên chưa thể chọn làm mốc chính\./);
assert.match(app, /confirmed: '1'/);
assert.match(app, /if \(!options\.confirmed\) return false;/);
assert.match(app, /const requestSeq = \+\+qltdMainMilestoneLoadRequestSeq/);
assert.match(app, /if \(!isCurrentMainMilestoneLoad\(requestSeq, projectKey\)\) return;/);
assert.match(app, /if \(qltdCurrentMainMilestoneProjectKey !== projectKey\) return true;/);
assert.match(app, /if \(!canSelectMainMilestone\(\)\) return;/);
assert.match(app, /if \(!canResetMainMilestone\(\)\) return;/);

console.log('Main milestone UID key/migration/filter/reload guards: PASS');
