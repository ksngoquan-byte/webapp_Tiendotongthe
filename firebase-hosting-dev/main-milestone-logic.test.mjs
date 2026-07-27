import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMainMilestoneTaskIndex,
  getMainMilestoneStableKey,
  isMainMilestoneKeySelected,
  migrateMainMilestoneKeys,
  resolveLegacyMainMilestoneKey,
  toggleMainMilestoneTaskKey
} from './main-milestone-logic.js';

const projectCode = '37-5.HL';
const tasks = [
  { id: 'A-ID', code: 'A-CODE', masterTaskCode: 'A-MASTER', owner: 'KinhDoanh', wbs: 'I.1' },
  { id: 'B-ID', code: 'B-CODE', masterTaskCode: 'B-MASTER', owner: 'KinhDoanh', parent: 'A-ID', wbs: 'I.2' },
  { id: 'C-ID', code: 'C-CODE', masterTaskCode: 'C-MASTER', owner: 'BQLDA', wbs: 'II.1' },
  { id: 'D-ID', code: 'DUPLICATE', masterTaskCode: 'D-MASTER' },
  { id: 'E-ID', code: 'DUPLICATE', masterTaskCode: 'E-MASTER' },
  { id: 'DUP-ID', code: 'F-CODE', masterTaskCode: 'F-MASTER' },
  { id: 'DUP-ID', code: 'G-CODE', masterTaskCode: 'G-MASTER' },
  { id: 'ROW-9', code: 'ROW-CODE', masterTaskCode: 'ROW-MASTER' },
  { code: 'NO-UID-CODE', masterTaskCode: 'NO-UID-MASTER' }
];

assert.equal(getMainMilestoneStableKey(tasks[0], projectCode), '37-5.HL|UID:A-ID');
assert.equal(
  getMainMilestoneStableKey({ id: 'PRIMARY', taskId: 'SECONDARY' }, projectCode),
  '37-5.HL|UID:PRIMARY',
  'task.id from Cong_viec column G is the canonical UID'
);
assert.equal(
  getMainMilestoneStableKey({ id: 'UID:62' }, projectCode),
  '37-5.HL|UID:62',
  'UID prefix must not be duplicated'
);
assert.equal(getMainMilestoneStableKey(tasks[7], projectCode), '', 'ROW-n is never stable');
assert.equal(getMainMilestoneStableKey(tasks[8], projectCode), '', 'code alone is compatibility-only');

const migration = migrateMainMilestoneKeys(
  [
    '37-5.HL|UID:A-ID',
    '37-5.HL|B-MASTER',
    'C-ID',
    'C-CODE',
    'DUPLICATE',
    'missing-key',
    'ROW-9',
    'OTHER|UID:A-ID'
  ],
  tasks,
  projectCode
);
assert.deepEqual([...migration.keys], [
  '37-5.HL|UID:A-ID',
  '37-5.HL|UID:B-ID',
  '37-5.HL|UID:C-ID'
]);
assert.deepEqual(
  [...migration.orphanKeys],
  ['DUPLICATE', 'missing-key', 'ROW-9', 'OTHER|UID:A-ID']
);
assert.equal(migration.migratedCount, 3);
assert.equal(migration.ambiguousCount, 1);
assert.equal(migration.orphanCount, 4);
assert.deepEqual(
  migration.warnings.map((warning) => warning.code),
  [
    'MAIN_MILESTONE_AMBIGUOUS_KEY',
    'MAIN_MILESTONE_ORPHAN_KEY',
    'MAIN_MILESTONE_UNSTABLE_ROW_KEY',
    'MAIN_MILESTONE_PROJECT_KEY_MISMATCH'
  ]
);

const index = buildMainMilestoneTaskIndex(tasks, projectCode);
assert.equal(resolveLegacyMainMilestoneKey('37-5.HL|UID:A-ID', index, projectCode).status, 'STABLE');
assert.equal(resolveLegacyMainMilestoneKey('37-5.HL|B-MASTER', index, projectCode).status, 'MIGRATED');
assert.equal(resolveLegacyMainMilestoneKey('A-ID', index, projectCode).status, 'MIGRATED');
assert.equal(resolveLegacyMainMilestoneKey('A-CODE', index, projectCode).status, 'MIGRATED');
assert.equal(resolveLegacyMainMilestoneKey('DUPLICATE', index, projectCode).status, 'AMBIGUOUS');
assert.equal(resolveLegacyMainMilestoneKey('UID:DUP-ID', index, projectCode).status, 'AMBIGUOUS');
assert.equal(resolveLegacyMainMilestoneKey('ROW-9', index, projectCode).status, 'UNSTABLE_ROW_KEY');
assert.equal(resolveLegacyMainMilestoneKey('NO-UID-MASTER', index, projectCode).status, 'UID_REQUIRED');

const selected = new Set(migration.keys);
assert.equal(isMainMilestoneKeySelected(selected, tasks[0], projectCode), true);
toggleMainMilestoneTaskKey(selected, tasks[0], projectCode);
assert.equal(isMainMilestoneKeySelected(selected, tasks[0], projectCode), false);
toggleMainMilestoneTaskKey(selected, tasks[0], projectCode);

const changedTreeTask = {
  ...tasks[0],
  code: 'NEW-CODE',
  masterTaskCode: 'NEW-MASTER',
  parent: 'NEW-PARENT',
  wbs: 'XX.9'
};
assert.equal(
  isMainMilestoneKeySelected(selected, changedTreeTask, projectCode),
  true,
  'canonical UID survives code/parent/WBS changes'
);
assert.equal(
  isMainMilestoneKeySelected(selected, { ...changedTreeTask, id: 'NEW-ID' }, projectCode),
  false,
  'changing the canonical UID changes the selected task identity'
);

const visibleKinhDoanh = tasks.filter((task) =>
  task.owner === 'KinhDoanh' &&
  isMainMilestoneKeySelected(selected, task, projectCode)
);
assert.deepEqual(visibleKinhDoanh.map((task) => task.id), ['A-ID', 'B-ID']);

const cached = JSON.stringify({ keys: [...selected], orphanKeys: [...migration.orphanKeys] });
const reloaded = JSON.parse(cached);
const afterReload = migrateMainMilestoneKeys(
  [...reloaded.keys, ...reloaded.orphanKeys],
  tasks,
  projectCode
);
assert.deepEqual([...afterReload.keys], [...selected]);
assert.deepEqual([...afterReload.orphanKeys], [...migration.orphanKeys]);

const liveProjectCode = '24-1.ĐB';
const liveUidCodePairs = [
  ['62', 'CV-063'], ['51', 'E0.2.3.1-052'], ['47', 'CV-047'], ['52', 'CV-053'],
  ['55', 'E0.4-056'], ['56', 'F5-057'], ['84', 'CV-090'], ['92', 'F7.3-097'],
  ['93', 'F7.4-098'], ['94', 'F7.5-099'], ['95', 'CV-100'], ['67', 'B7-069'],
  ['96', 'CV-101'], ['17', 'CV-017'], ['37', 'CV-037'], ['38', 'CV-038'],
  ['104', 'CV-111'], ['112', 'CV-119'], ['113', 'CV-120'], ['120', 'CV-143']
];
const liveTasks = liveUidCodePairs.map(([id, code]) => ({
  id,
  code,
  masterTaskCode: code,
  start_date: '2026-01-01',
  end_date: '2026-01-02'
}));
const liveUidKeys = liveUidCodePairs.map(([id]) => `${liveProjectCode}|UID:${id}`);
const payloadRehydrate = migrateMainMilestoneKeys(liveUidKeys, liveTasks, liveProjectCode);
const apiRehydrate = migrateMainMilestoneKeys(liveUidKeys, liveTasks, liveProjectCode);
for (const result of [payloadRehydrate, apiRehydrate]) {
  assert.equal(result.rawCount, 20);
  assert.equal(result.validCount, 20);
  assert.equal(result.orphanCount, 0);
  assert.equal(result.ambiguousCount, 0);
  assert.equal(result.migratedCount, 0);
}

const recalcTasks = liveTasks.map((task, index) => ({
  ...task,
  start_date: `2026-02-${String((index % 20) + 1).padStart(2, '0')}`,
  end_date: `2026-03-${String((index % 20) + 1).padStart(2, '0')}`
}));
const afterRecalc = migrateMainMilestoneKeys(liveUidKeys, recalcTasks, liveProjectCode);
assert.deepEqual([...afterRecalc.keys], [...payloadRehydrate.keys]);
assert.equal(afterRecalc.validCount, 20);
assert.equal(afterRecalc.orphanCount, 0);

const fullTaskSnapshot = [
  ...liveTasks,
  ...Array.from({ length: 104 }, (_, index) => ({
    id: `EXTRA-${index + 1}`,
    code: `EXTRA-CODE-${index + 1}`,
    masterTaskCode: `EXTRA-CODE-${index + 1}`
  }))
];
const fullLinkSnapshot = Array.from({ length: 139 }, (_, index) => ({
  id: `LINK-${index + 1}`,
  source: String((index % 123) + 1),
  target: String((index % 123) + 2)
}));
migrateMainMilestoneKeys(liveUidKeys, fullTaskSnapshot, liveProjectCode);
assert.equal(fullTaskSnapshot.length, 124, 'milestone rehydrate must not change task count');
assert.equal(fullLinkSnapshot.length, 139, 'milestone rehydrate must not change link count');

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const loadStart = app.indexOf('async function loadMainMilestonesForProject');
const saveHelperStart = app.indexOf('function qltdMainMilestoneCloneIds', loadStart);
const persistStart = app.indexOf('async function qltdMainMilestonePersistSaveSnapshot', saveHelperStart);
const saveStart = app.indexOf('async function saveMainMilestonesForProject', loadStart);
const resetStart = app.indexOf('async function resetMainMilestonesForProject', saveStart);
assert.ok(
  loadStart >= 0 &&
  saveHelperStart > loadStart &&
  persistStart > saveHelperStart &&
  saveStart > persistStart &&
  resetStart > saveStart
);
const loadSource = app.slice(loadStart, saveHelperStart);
const persistSource = app.slice(persistStart, saveStart);
const saveSource = app.slice(saveStart, resetStart);

assert.doesNotMatch(app, /qltdMainMilestoneIds/);
assert.doesNotMatch(
  loadSource,
  /saveMainMilestonesForProject\s*\(/,
  'read/rehydrate must never write migration'
);
assert.match(loadSource, /isCurrentMainMilestoneLoad\(requestSeq, projectKey\)/);
assert.match(persistSource, /codes:\s*JSON\.stringify\(\[\]\)/);
assert.match(saveSource, /orphanCount > 0/);
assert.match(saveSource, /qltdMainMilestoneOrphanKeys\.size/);
assert.match(saveSource, /expectedPrefix = `\$\{projectKey\}\|UID:`/);
assert.match(app, /keys: \[\],\s+orphanKeys: \[\],\s+milestoneIds: \[\]/);
assert.match(app, /main-milestone-logic\.js\?v=MAIN_MILESTONE_UID_V4/);
assert.match(app, /version:\s*3/);
assert.match(app, /if \(!canSelectMainMilestone\(\)\) return;/);
assert.match(app, /if \(!canResetMainMilestone\(\)\) return;/);

console.log('Main milestone UID canonical/migration/recalc/rehydrate: all cases passed.');
