import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const workSource = fs.readFileSync(new URL('../apps-script-dev-api/62_Work_Task_Service.js', import.meta.url), 'utf8');
const weeklySource = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');
const pbDetailSource = fs.readFileSync(new URL('../apps-script-dev-api/64_PB_Detail_Task_Service.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function buildHeaderMap(headers) {
  return headers.reduce((map, header, index) => {
    const key = normalizeHeader(header);
    if (key && map[key] === undefined) map[key] = index;
    return map;
  }, {});
}

function createSheet(values) {
  return {
    values,
    getLastRow: () => values.length,
    getLastColumn: () => Math.max(0, ...values.map((row) => row.length)),
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => Array.from({ length: rowCount }, (_, rowOffset) =>
        Array.from({ length: columnCount }, (_, columnOffset) =>
          values[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''))
    })
  };
}

const workContext = {
  qltdBudgetBuildHeaderMap_: buildHeaderMap,
  qltdBudgetFindHeaderIndex_: (headerMap, header) => {
    const key = normalizeHeader(header);
    return Object.prototype.hasOwnProperty.call(headerMap, key) ? headerMap[key] : -1;
  },
  qltdBudgetFindMissingHeaders_: (headerMap, requiredHeaders) => requiredHeaders.filter((header) =>
    !Object.prototype.hasOwnProperty.call(headerMap, normalizeHeader(header))),
  qltdBudgetReadSheetAsObjects_: (sheet, headerRow) => {
    const headers = sheet.values[headerRow - 1].slice();
    return {
      headers,
      headerMap: buildHeaderMap(headers),
      rows: sheet.values.slice(headerRow).map((raw, index) => ({ raw, rowNumber: headerRow + index + 1 }))
    };
  },
  qltdBudgetGetCell_: (row, headerMap, header, fallback = '') => {
    const index = headerMap[normalizeHeader(header)];
    return index === undefined ? fallback : row[index];
  },
  qltdBudgetFormatDate_: (value) => String(value || '').slice(0, 10),
  qltdBudgetToNumber_: (value) => Number(value || 0),
  qltdWorkNormalizeTaskCode_: (value) => String(value || '').trim(),
  console
};
vm.createContext(workContext);
vm.runInContext(`${workSource}\nthis.api = { parseDeptTasks: qltdWorkParseDeptTaskSheet_ };`, workContext);

const headers = [
  'STT', 'Noi dung cong viec', 'Ngay bat dau ke hoach', 'Ngay ket thuc ke hoach',
  'Ke hoach ngan sach', 'Trang thai thuc hien', 'Bat dau thuc te', 'Hoan thanh thuc te',
  'Ngan sach thuc te', 'Nguoi chu tri', 'Nguoi phoi hop', 'Dieu kien dau vao',
  'Ghi chu cap nhat', 'Ma cong viec Master', 'Loai dong', 'DetailTaskId',
  '% Hoan thanh', 'Trong so'
];

function deptRow({
  wbs = '', taskName = '', masterTaskCode = '', rowType = '', detailTaskId = '',
  planStart = '2026-07-20', planFinish = '2026-07-24', progress = 0
} = {}) {
  const row = new Array(headers.length).fill('');
  row[0] = wbs;
  row[1] = taskName;
  row[2] = planStart;
  row[3] = planFinish;
  row[5] = 'IN_PROGRESS';
  row[13] = masterTaskCode;
  row[14] = rowType;
  row[15] = detailTaskId;
  row[16] = progress;
  return row;
}

const cocLeuRows = [
  headers,
  deptRow({ wbs: 'IV.2', taskName: 'Master CV-037', masterTaskCode: 'CV-037', rowType: 'MASTER' }),
  ...Array.from({ length: 30 }, (_, index) => deptRow({
    wbs: `IV.2.D${String(index + 1).padStart(2, '0')}`,
    taskName: `Detail ${index + 1}`,
    masterTaskCode: 'CV-037',
    rowType: 'PB_DETAIL',
    detailTaskId: `DT-CV037-${String(index + 1).padStart(2, '0')}`,
    progress: index
  }))
];
const parsed = workContext.api.parseDeptTasks(createSheet(cocLeuRows));
assert.equal(parsed.error, null);
assert.equal(parsed.tasks.length, 31, 'The shared parser must continue returning the existing task rows.');
assert.equal(parsed.tasks.filter((task) => task.rowType === 'PB_DETAIL').length, 30);
assert.equal(parsed.tasks.filter((task) => task.detailTaskId).length, 30);

let ganttRows = [{
  code: 'CV-037', id: 'CV-037', taskName: 'Master CV-037', wbs: 'IV.2',
  baselineStart: '2026-07-20', baselineEnd: '2026-07-24', status: 'IN_PROGRESS',
  percent: 25, rowType: 'TASK'
}];
let currentDeptTasks = parsed.tasks;
let currentDetailRows = parsed.tasks.filter((task) => task.rowType === 'PB_DETAIL').map((task) => ({
  rowType: 'PB_DETAIL',
  masterTaskCode: task.masterTaskCode,
  detailTaskId: task.detailTaskId,
  dto: { ...task }
}));

const weeklyContext = {
  QLTD_PB_DETAIL_ROW_TYPE_DETAIL: 'PB_DETAIL',
  qltdBudgetFormatDate_: (value) => String(value || '').slice(0, 10),
  qltdWorkWarning_: (code, message, extra = {}) => ({ code, message, ...extra }),
  qltdWorkAuthUser_: () => ({ email: 'admin@example.com', user: { role: 'ADMIN', deptCode: 'BQLDA' } }),
  qltdWorkNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
  qltdResolveDeptProgressPermission_: () => ({ source: 'HOME_DEPT', permissionCode: '' }),
  qltdUserProjectDeptAccessDecisionIsDeptManager_: () => false,
  qltdCanManageProjectDept_: () => true,
  qltdWorkOk_: (_source, _action, data, warnings) => ({ success: true, ...data, warnings }),
  qltdWorkError_: (_source, _action, code, message, _meta, warnings = [], extra = {}) => ({ success: false, code, message, warnings, ...extra }),
  qltdGanttGetDataForProject_: () => ({ success: true, data: ganttRows }),
  qltdWorkBuildDeptContext_: () => ({}),
  qltdWorkReadDeptTasksForContext_: () => ({ tasks: currentDeptTasks, warnings: [], error: null }),
  qltdPbDetailBuildSheetContext_: () => ({ dataRows: currentDetailRows, columns: {}, warnings: [], error: null }),
  qltdPbDetailBuildDetailDto_: (row) => ({ ...row.dto }),
  console
};
vm.createContext(weeklyContext);
vm.runInContext(`${weeklySource}\nthis.api = {
  selectDeptMasters: qltdWeeklyTaskUpdatesSelectDeptMasterSources_,
  readOfficialMasters: qltdWeeklyTaskUpdatesReadOfficialMasters_,
  buildOfficialMaster: qltdWeeklyTaskUpdatesBuildOfficialMasterDto_,
  buildItem: qltdWeeklyTaskUpdatesBuildItem_,
  listWeeklyItems: qltdWorkListWeeklyItems_
};`, weeklyContext);

weeklyContext.qltdWeeklyTaskUpdatesResolveScope_ = () => ({
  projectCode: '24-1.DB', deptCode: 'BQLDA', weekCode: 'WEEK-2026-07-20',
  project: { projectCode: '24-1.DB' }, dept: { deptCode: 'BQLDA' }, requestedDeptCode: 'BQLDA',
  warnings: [], meta: {}, error: null
});
weeklyContext.qltdWeeklyTaskUpdatesReadBudgetContext_ = () => ({ taskLinkedByMaster: {}, standaloneItems: [], warnings: [] });
weeklyContext.qltdWeeklyTaskUpdatesAttachBudgetContext_ = (target) => target;

const selected = weeklyContext.api.selectDeptMasters(parsed.tasks);
assert.equal(selected.tasks.length, 1);
assert.equal(selected.tasks[0].masterTaskCode, 'CV-037');
assert.equal(selected.tasks[0].sourceMappingUnique, true);
assert.equal(selected.warnings.length, 0);

const weeklyItems = weeklyContext.api.listWeeklyItems({
  projectCode: '24-1.DB', deptCode: 'BQLDA', weekStart: '2026-07-20', weekEnd: '2026-07-26'
});
assert.equal(weeklyItems.success, true);
assert.equal(weeklyItems.items.filter((item) => item.itemType === 'MASTER' && item.itemId === 'CV-037').length, 1);
assert.equal(weeklyItems.items.filter((item) => item.itemType === 'PB_DETAIL').length, 30);
assert.equal(weeklyItems.warnings.some((warning) => warning.code === 'DEPT_MASTER_DUPLICATED'), false);
assert.equal(weeklyItems.items.find((item) => item.itemType === 'MASTER').sourceMappingUnique, true);

const duplicated = weeklyContext.api.selectDeptMasters([
  { masterTaskCode: ' cv-037 ', rowType: ' master ', detailTaskId: '', rowNumber: 4 },
  { masterTaskCode: 'CV-037', rowType: 'MASTER', detailTaskId: '', rowNumber: 8 },
  { masterTaskCode: 'CV-037', rowType: 'PB_DETAIL', detailTaskId: 'DT-1', rowNumber: 9 }
]);
assert.equal(duplicated.tasks.length, 1);
assert.equal(duplicated.tasks[0].masterTaskCode, 'CV-037');
assert.equal(duplicated.tasks[0].sourceMappingUnique, false);
assert.equal(duplicated.warnings.length, 1);
assert.equal(duplicated.warnings[0].code, 'DEPT_MASTER_DUPLICATED');
assert.equal(duplicated.warnings[0].masterTaskCode, 'CV-037');
assert.equal(duplicated.warnings[0].matchCount, 2);
assert.deepEqual(Array.from(duplicated.warnings[0].rowNumbers), [4, 8]);

const duplicateMapped = weeklyContext.api.buildOfficialMaster(ganttRows[0], duplicated.tasks[0]);
assert.equal(duplicateMapped.sourceMappingUnique, false, 'Official mapping must not overwrite unsafe department mapping.');
assert.equal(duplicateMapped.sourceRowType, 'TASK');

const canEditStart = appSource.indexOf('function canEditApprovedObjective');
const canEditEnd = appSource.indexOf('function renderWeeklyObjectiveList', canEditStart);
assert.ok(canEditStart >= 0 && canEditEnd > canEditStart);
const editContext = {
  currentUserProfile: { role: 'ADMIN' },
  normalizeRoleKey: (value) => String(value || '').trim().toUpperCase(),
  canAdmin: () => true
};
vm.createContext(editContext);
vm.runInContext(`${appSource.slice(canEditStart, canEditEnd)}\nthis.canEdit = canEditApprovedObjective;`, editContext);
const duplicateItem = weeklyContext.api.buildItem(
  'MASTER', 'CV-037', duplicateMapped, '2026-07-20', '2026-07-26', '', false
);
assert.equal(editContext.canEdit(duplicateItem, null, { projectCode: '24-1.DB' }, { role: 'ADMIN' }), false);

const legacy = weeklyContext.api.selectDeptMasters([
  { masterTaskCode: ' CV-LEGACY ', rowType: '   ', detailTaskId: '', rowNumber: 12 }
]);
assert.equal(legacy.tasks.length, 1);
assert.equal(legacy.tasks[0].masterTaskCode, 'CV-LEGACY');
assert.equal(legacy.tasks[0].sourceMappingUnique, true);

const rejectedRows = weeklyContext.api.selectDeptMasters([
  { masterTaskCode: 'CV-LEGACY-DETAIL', rowType: '', detailTaskId: 'DT-LEGACY', rowNumber: 13 },
  { masterTaskCode: 'CV-PB', rowType: 'PB_DETAIL', detailTaskId: '', rowNumber: 14 },
  { masterTaskCode: 'CV-SLOT', rowType: 'DETAIL_SLOT', detailTaskId: '', rowNumber: 15 },
  { masterTaskCode: 'CV-CONTEXT', rowType: 'CONTEXT', detailTaskId: '', rowNumber: 16 },
  { masterTaskCode: 'CV-OTHER', rowType: 'GROUP', detailTaskId: '', rowNumber: 17 },
  { masterTaskCode: '   ', rowType: 'MASTER', detailTaskId: '', rowNumber: 18 }
]);
assert.equal(rejectedRows.tasks.length, 0);
assert.equal(rejectedRows.warnings.length, 0);

ganttRows = [
  { ...ganttRows[0], id: 'OFFICIAL-1' },
  { ...ganttRows[0], id: 'OFFICIAL-2' }
];
const officialDuplicate = weeklyContext.api.readOfficialMasters({ projectCode: '24-1.DB', meta: {}, warnings: [] }, selected.tasks, 'work_listweeklyitems');
assert.equal(officialDuplicate.tasks.length, 1);
assert.equal(officialDuplicate.tasks[0].sourceMappingUnique, false);
assert.ok(officialDuplicate.warnings.some((warning) => warning.code === 'OFFICIAL_MASTER_DUPLICATED'));

const buildTaskDtoStart = workSource.indexOf('function qltdWorkBuildTaskDto_');
const buildTaskDtoEnd = workSource.indexOf('function qltdWorkPayloadHasAny_', buildTaskDtoStart);
assert.doesNotMatch(workSource.slice(buildTaskDtoStart, buildTaskDtoEnd), /detailTaskId/,
  'DetailTaskId must remain internal to the shared parser and not change other task API DTOs.');
assert.match(pbDetailSource, /row\.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL/);

console.log('weekly MASTER source dedup tests: PASS');
