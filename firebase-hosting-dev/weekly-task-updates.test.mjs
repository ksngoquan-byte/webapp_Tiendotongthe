import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const sheetRows = [];
const detailSyncCalls = [];
const masterApprovalSyncCalls = [];
const masterProgressWritebackCalls = [];
const ganttInvalidateCalls = [];
const budgetReportIds = new Set();
const budgetWriteCalls = [];
const aggregateCalls = [];
const notificationPendingCalls = [];
const notificationFinalizeCalls = [];
const rawBudgetRows = [];
let budgetItems = [];
let allocations = [];
let failBudgetItemCode = '';
let failAggregateBudgetItemCode = '';
let failNextApprovalReviewWrite = false;
let authRole = 'ADMIN';
let authEmail = 'user@example.com';
let delegatedManagerMode = false;
let notificationFailureMode = false;
const officialDetailWrites = [];
const detailDtos = [
  { detailTaskId: 'DT-REPORTER', masterTaskCode: 'M1', owner: 'Reporter <reporter@example.com>', wbs: '1.1', taskName: 'Reporter task', progress: 10, status: 'Äang lÃ m', actualStart: '2026-06-01', actualFinish: '' },
  { detailTaskId: 'DT-OTHER', masterTaskCode: 'M1', owner: 'Other <other@example.com>', wbs: '1.2', taskName: 'Other task', progress: 10, status: 'Äang lÃ m', actualStart: '2026-06-01', actualFinish: '' },
  { detailTaskId: 'DT-EDITOR', masterTaskCode: 'M1', owner: '', wbs: '1.3', taskName: 'Editor task', progress: 10, status: 'Äang lÃ m', actualStart: '2026-06-01', actualFinish: '' }
];
const RAW_BUDGET_HEADERS = [
  'Report ID', 'Ma du an', 'Trang thai xac nhan', 'Sync status', 'Loai ban ghi',
  'Ma khoan ngan sach', 'Ma phan bo', 'Huong dong tien', 'Gia tri thuc hien ky nay',
  'Loai ky', 'Ma ky', 'Vuong mac/Ghi chu', 'Sync error'
];
const mockSheet = {
  getLastColumn: () => sheetRows[0]?.length || 0,
  getLastRow: () => sheetRows.length,
  getRange: (row, column, rowCount, columnCount) => ({
    getValues: () => Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => sheetRows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? '')),
    setValues: (values) => {
      if (failNextApprovalReviewWrite && column === 18) {
        failNextApprovalReviewWrite = false;
        throw new Error('approval status write failed');
      }
      values.forEach((sourceRow, rowOffset) => { const target = sheetRows[row - 1 + rowOffset] || []; sourceRow.forEach((value, columnOffset) => { target[column - 1 + columnOffset] = value; }); sheetRows[row - 1 + rowOffset] = target; });
      return mockSheet.getRange(row, column, rowCount, columnCount);
    },
    setFontWeight: () => mockSheet.getRange(row, column, rowCount, columnCount)
  }),
  setFrozenRows: () => {}
};
const context = {
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeWeekCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdBudgetFormatDate_: (value) => String(value || '').slice(0, 10),
  qltdBudgetToNumber_: (value) => Number(value || 0),
  qltdWeeklyCellText_: (value) => String(value || ''),
  getCurrentSpreadsheet_: () => ({ getSheetByName: () => mockSheet }),
  qltdWorkAuthUser_: () => ({ email: authEmail, user: { role: authRole, deptCode: 'PTDA' } }),
  qltdWorkNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkResolveProjectDept_: (_action, payload = {}) => {
    const projectCode = String(payload.projectCode || 'P1').toUpperCase();
    const deptCode = String(payload.deptCode || 'PTDA').toUpperCase();
    return { projectCode, deptCode, project: { projectCode }, dept: { deptCode }, requestedDeptCode: deptCode, warnings: [] };
  },
  qltdWorkCanReadDept_: () => true,
  qltdCanReadProjectDept_: () => true,
  qltdResolveDeptProgressPermission_: () => delegatedManagerMode
    ? { allowed: true, source: 'DELEGATED_ACCESS', permissionCode: 'DEPT_MANAGER' }
    : { allowed: true, source: 'HOME_DEPT', permissionCode: '' },
  qltdResolveDeptManagerPermission_: () => delegatedManagerMode
    ? { allowed: true, source: 'DELEGATED_ACCESS', permissionCode: 'DEPT_MANAGER' }
    : { allowed: false, source: '', permissionCode: '' },
  qltdUserProjectDeptAccessDecisionIsDeptManager_: (decision) => decision?.permissionCode === 'DEPT_MANAGER',
  qltdUserProjectDeptAccessValidateDelegatedPayload_: () => null,
  qltdWorkNowIso_: () => '2026-06-20T00:00:00.000Z',
  qltdWorkOk_: (_source, _action, data, warnings) => ({ success: true, ...data, warnings }),
  qltdWorkError_: (_source, _action, code, message, _meta, _warnings, extra = {}) => ({ success: false, code, message, ...extra }),
  qltdWorkWarning_: (code, message) => ({ code, message }),
  qltdBudgetSafeErrorMessage_: (error) => error.message,
  qltdWorkBuildDeptContext_: () => ({}),
  qltdWorkReadTaskTarget_: () => ({ error: true }),
  qltdPbDetailBuildSheetContext_: () => ({
    error: null,
    columns: {},
    warnings: [],
    dataRows: detailDtos.map((dto, index) => ({ rowType: 'PB_DETAIL', detailTaskId: dto.detailTaskId, rowNumber: index + 2, dto }))
  }),
  qltdPbDetailBuildDetailDto_: (row) => ({ ...row.dto }),
  QLTD_PB_DETAIL_ROW_TYPE_DETAIL: 'PB_DETAIL',
  qltdGanttGetDataForProject_: () => ({ success: true, data: [] }),
  qltdGanttInvalidateCache_: (projectCode) => { ganttInvalidateCalls.push(projectCode); return { success: true }; },
  QLTD_PROJECT_SCHEDULE_STATE_V1: { DIRTY: 'DIRTY', CLEAN: 'CLEAN' },
  qltdScheduleMarkProjectDirty_: (projectCode) => ({
    success: true,
    projectCode,
    scheduleState: 'DIRTY',
    markedAt: '2026-06-20T00:00:00.000Z'
  }),
  qltdBudgetReadBudgetItems_: () => ({ items: budgetItems, warnings: [] }),
  qltdBudgetReadAllocations_: () => ({ allocations, warnings: [] }),
  qltdWorkIsAdminScope_: (user) => ['ADMIN', 'PMO'].includes(String(user?.role || '').toUpperCase()),
  qltdMasterDeptCanonicalCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkSameDept_: (user, deptCode) => String(user?.deptCode || '').toUpperCase() === String(deptCode || '').toUpperCase(),
  QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION: { DEPT_MANAGER: 'DEPT_MANAGER', UPDATE_PROGRESS: 'UPDATE_PROGRESS' },
  qltdUserProjectDeptAccessResolveEffectiveScopes_: () => delegatedManagerMode
    ? [{ projectCode: 'P1', deptCode: 'PTDA', permissionCode: 'DEPT_MANAGER' }]
    : [],
  qltdCanManageProjectDept_: (user, _projectCode, deptCode) => (delegatedManagerMode && String(deptCode || '').toUpperCase() === 'PTDA') ||
    ['ADMIN', 'PMO'].includes(String(user?.role || '').toUpperCase()) ||
    (String(user?.role || '').toUpperCase() === 'EDITOR' && String(user?.deptCode || '').toUpperCase() === String(deptCode || '').toUpperCase()),
  qltdWorkResolveAssignees_: (value) => {
    const match = String(value || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return { ok: !!match, users: match ? [{ email: match[0].toLowerCase() }] : [], unresolved: match ? [] : [value] };
  },
  qltdWorkUserMatchesAssignees_: (email, resolution) => resolution.users.some((user) => user.email === String(email || '').toLowerCase()),
  qltdUsersGetByEmail_: (email) => ({ email, role: 'REPORTER', status: 'ACTIVE', deptCode: 'PTDA' }),
  qltdPbDetailApplyUpdateNoLock_: (_action, payload) => {
    officialDetailWrites.push({ ...payload });
    return { success: true, warnings: [] };
  },
  qltdNotificationsTryCreatePendingNoLock_: (update) => {
    notificationPendingCalls.push({ ...update });
    return notificationFailureMode
      ? { createdCount: 0, warnings: [{ code: 'NOTIFICATION_CREATE_FAILED' }] }
      : { createdCount: 1, warnings: [] };
  },
  qltdNotificationsTryFinalizeReviewNoLock_: (update) => {
    notificationFinalizeCalls.push({ ...update });
    return notificationFailureMode
      ? { resolvedCount: 0, createdCount: 0, warnings: [{ code: 'NOTIFICATION_RESOLVE_FAILED' }] }
      : { resolvedCount: 1, createdCount: 1, warnings: [] };
  },
  qltdBudgetNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdBudgetNormalizeKey_: (value) => String(value || '').trim().toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''),
  qltdBudgetNormalizeAmount_: (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return { error: { code: 'AMOUNT_INVALID', message: 'Amount is invalid.' } };
    if (amount < 0) return { error: { code: 'AMOUNT_NEGATIVE', message: 'Amount must not be negative.' } };
    return { value: amount, error: null };
  },
  qltdBudgetNormalizePeriodType_: (value) => ({ value: String(value || '').trim().toUpperCase(), error: null }),
  qltdBudgetGetReadonlySheet_: () => ({ getName: () => 'CENTRAL_NS_Raw' }),
  qltdBudgetGetSheetSchema_: () => ({ headerRow: 4 }),
  qltdBudgetBuildHeaderMap_: (headers) => headers.reduce((map, header, index) => { const key = context.qltdBudgetNormalizeKey_(header); if (key && map[key] === undefined) map[key] = index; return map; }, {}),
  qltdBudgetFindHeaderIndex_: (headerMap, header) => {
    const key = context.qltdBudgetNormalizeKey_(header);
    return Object.prototype.hasOwnProperty.call(headerMap, key) ? headerMap[key] : -1;
  },
  qltdBudgetReadSheetAsObjects_: () => ({
    headers: RAW_BUDGET_HEADERS,
    headerMap: RAW_BUDGET_HEADERS.reduce((map, header, index) => { map[String(header).toLowerCase()] = index; return map; }, {}),
    rows: rawBudgetRows.map((raw, index) => ({ raw, rowNumber: index + 5 }))
  }),
  qltdBudgetGetCell_: (row, headerMap, header, fallback = '') => {
    const index = headerMap[String(header).toLowerCase()];
    return index === undefined ? fallback : row[index];
  },
  QLTD_BUDGET_SHEET: { CENTRAL_RAW: 'CENTRAL_NS_Raw' },
  QLTD_BUDGET_WRITE_CONFIRM_TOKEN: 'CONFIRM',
  QLTD_BUDGET_TYPE: { TASK_LINKED: 'TASK_LINKED', DEPT_STANDALONE: 'DEPT_STANDALONE' },
  qltdBudgetPrepareWrite_: (payload) => {
    if (payload.flowType !== 'CHI') return { error: { code: 'FLOW_TYPE_MISMATCH', message: 'Wrong flow.' } };
    if (payload.budgetType === 'TASK_LINKED') {
      if (payload.masterTaskCode !== 'D5-036') return { error: { code: 'TASK_LINKED_MASTER_MISMATCH', message: 'Wrong master.' } };
      if (payload.allocationCode !== 'ALLOC-TL') return { error: { code: 'ALLOCATION_CODE_MISMATCH', message: 'Wrong allocation.' } };
    } else {
      if (payload.allocationCode !== 'ALLOC-1') return { error: { code: 'ALLOCATION_CODE_MISMATCH', message: 'Wrong allocation.' } };
      if (payload.budgetType !== 'DEPT_STANDALONE') return { error: { code: 'BUDGET_TYPE_MISMATCH', message: 'Wrong budget type.' } };
    }
    const approvedBudget = payload.budgetType === 'TASK_LINKED' ? 12015541930 : payload.budgetItemCode === 'NS-2' ? 1000000 : 2000000;
    const allocationCode = payload.budgetType === 'TASK_LINKED' ? 'ALLOC-TL' : 'ALLOC-1';
    return { value: {
      requestId: payload.requestId,
      reportId: `REPORT-${payload.requestId}`,
      allocationContext: {
        item: { projectCode: 'P1', budgetItemCode: payload.budgetItemCode, allocationCode, flowType: 'CHI', approvedBudget, hasApprovedBudget: true },
        allocation: { projectCode: 'P1', allocationCode, flowType: 'CHI', allocatedAmount: payload.budgetType === 'TASK_LINKED' ? 12015541930 : 3000000 }
      }
    } };
  },
  qltdBudgetExecutePreparedWriteNoLock_: (prepared) => {
    if (prepared.weeklyBudgetMeta.budgetItemCode === failBudgetItemCode) return { success: false, code: 'RAW_APPEND_FAILED', message: 'Raw append failed.' };
    const duplicate = budgetReportIds.has(prepared.reportId);
    if (!duplicate) {
      budgetReportIds.add(prepared.reportId);
      budgetWriteCalls.push(prepared.weeklyBudgetMeta.budgetItemCode);
    }
    return { success: true, data: { duplicate, syncStatus: 'SYNCED', centralRawRowNumber: budgetWriteCalls.length + 1 } };
  },
  qltdBudgetRefreshAggregateForWriteNoLock_: (prepared) => {
    aggregateCalls.push({
      budgetItemCode: prepared.weeklyBudgetMeta.budgetItemCode,
      reportId: prepared.reportId
    });
    if (prepared.weeklyBudgetMeta.budgetItemCode === failAggregateBudgetItemCode) {
      const error = new Error('Aggregate refresh failed.');
      error.code = 'AGGREGATE_REFRESH_FAILED';
      error.details = { budgetItemCode: prepared.weeklyBudgetMeta.budgetItemCode };
      throw error;
    }
    return { success: true, summaryRowsWritten: 1, dashboardRowsWritten: 7 };
  },
  qltdWorkUpdateTask_: () => ({ success: true }),
  qltdWorkUpdateDetailTask_: (payload) => { detailSyncCalls.push(payload); return { success: true }; },
  QLTD_WORK_WRITE_LOCK_TIMEOUT_MS: 1000,
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { getUuid: (() => { let id = 0; return () => `UUID-${++id}`; })() },
  Logger: { log: () => {} },
  console
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.api = { headers: QLTD_WEEKLY_TASK_UPDATE_HEADERS, baseHeaders: QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS, buildKey: qltdWeeklyTaskUpdatesBuildKey_, buildItem: qltdWeeklyTaskUpdatesBuildItem_, sortItems: qltdWeeklyTaskUpdatesSortItems_, date: qltdWeeklyTaskUpdatesDate_, inspect: qltdWeeklyTaskUpdatesInspectSheet_, save: qltdWeeklyTaskUpdatesSave_, get: qltdWeeklyTaskUpdatesGet_, canonicalWeek: qltdWeeklyTaskUpdatesCanonicalWeekCode_, buildProgressStates: qltdWeeklyTaskUpdatesBuildProgressStates_, getApprovals: qltdWeeklyMasterApprovalsGet_, review: qltdWeeklyMasterApprovalReview_, getPbApprovals: qltdWeeklyPbDetailApprovalsGet_, reviewPb: qltdWeeklyPbDetailApprovalReview_, resolveActualDate: qltdWeeklyTaskUpdatesResolveActualDateLifecycle_, validateTransition: qltdWeeklyTaskUpdatesValidateMasterStatusTransition_, mapPbDetailStatus: qltdWeeklyTaskUpdatesMapPbDetailStatus_, syncTask: qltdWeeklyTaskUpdatesSyncTask_, readBudgetActualIndex: qltdWeeklyTaskUpdatesReadBudgetActualIndex_, readBudgetContext: qltdWeeklyTaskUpdatesReadBudgetContext_, invalidateCache: qltdWeeklyTaskUpdatesInvalidateGanttCache_, parseMaster: qltdWeeklyMasterParseCongViec_, applyMaster: qltdWeeklyMasterApprovalApplyToMaster_, findSingleMaster: qltdWeeklyTaskUpdatesFindSingleMasterTask_ };`, context);
const { headers, baseHeaders, buildKey, buildItem, sortItems, date, inspect, save, get, canonicalWeek, buildProgressStates, getApprovals, review, getPbApprovals, reviewPb, resolveActualDate, validateTransition, mapPbDetailStatus, syncTask, readBudgetActualIndex, readBudgetContext, invalidateCache, parseMaster, applyMaster, findSingleMaster } = context.api;
const stubMasterApprovalApply = (target, auth, dependencyDecision, recoveryPlan) => {
  masterApprovalSyncCalls.push({ target, auth, dependencyDecision, recoveryPlan });
  return {
    success: true,
    status: 'UPDATED',
    congViecUpdated: true,
    columnWUpdated: true,
    recalcTriggered: false,
    ganttCacheInvalidated: true,
    ganttRefreshRequired: false,
    dashboardRefreshRequired: false,
    scheduleState: 'DIRTY',
    warnings: []
  };
};
context.qltdWeeklyMasterApprovalApplyToMaster_ = stubMasterApprovalApply;
context.qltdWeeklyMasterProgressWriteback_ = (update, auth, requestId) => {
  masterProgressWritebackCalls.push({ update, auth, requestId });
  return {
    success: true,
    applied: true,
    status: 'UPDATED',
    idempotent: true,
    duplicateNote: false,
    changes: [],
    ganttCacheInvalidated: true,
    ganttRefreshRequired: true,
    dashboardRefreshRequired: true
  };
};

let masterRows = [];
let failMasterVerify = false;
let masterFlushCount = 0;
function resetMasterRows(taskCodes = ['CV-200']) {
  const headers = new Array(23).fill('');
  headers[0] = 'STT';
  headers[14] = 'Mã công việc';
  headers[16] = '% Hoàn thành';
  headers[17] = 'Trạng thái thực hiện';
  headers[18] = 'Bắt đầu thực tế';
  headers[19] = 'Hoàn thành thực tế';
  headers[20] = 'Ghi chú cập nhật';
  headers[21] = 'Ngày cập nhật';
  headers[22] = 'Điều chỉnh liên kết?';
  masterRows = [
    ['Hoa'],
    [],
    [],
    headers,
    ...taskCodes.map((code, index) => {
      const row = new Array(23).fill('');
      row[0] = index + 1;
      row[14] = code;
      row[16] = 77;
      row[17] = 'Đang làm';
      row[18] = '2026-06-01';
      return row;
    })
  ];
  failMasterVerify = false;
  masterFlushCount = 0;
}
function masterRange(row, column, rowCount = 1, columnCount = 1) {
  return {
    getValues: () => {
      const values = Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => masterRows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''));
      if (failMasterVerify && column === 18 && columnCount === 6 && rowCount === 1) values[0][5] = 'BROKEN';
      return values;
    },
    setValues: (values) => {
      values.forEach((sourceRow, rowOffset) => {
        const target = masterRows[row - 1 + rowOffset] || [];
        sourceRow.forEach((value, columnOffset) => { target[column - 1 + columnOffset] = value; });
        masterRows[row - 1 + rowOffset] = target;
      });
      return masterRange(row, column, rowCount, columnCount);
    },
    getA1Notation: () => `R${row}:W${row}`
  };
}
const masterSheet = {
  getName: () => 'Cong_viec',
  getLastRow: () => masterRows.length,
  getLastColumn: () => Math.max(0, ...masterRows.map((row) => row.length)),
  getRange: masterRange
};
resetMasterRows();
context.qltdProjectsGetByCode_ = () => ({ masterSpreadsheetId: 'MASTER-1', defaultTaskSheet: 'Cong_viec' });
context.SpreadsheetApp = {
  openById: () => ({ getSheetByName: (name) => name === 'Cong_viec' ? masterSheet : null }),
  flush: () => { masterFlushCount += 1; }
};
context.qltdWorkAppendTaskNote_ = (before, note, email) => [String(before || '').trim(), `${note} [${email}]`].filter(Boolean).join('\n');

assert.equal(buildKey('p1', 'ptda', 'week-2026-06-01', 'master', 'CV-1'), 'P1|PTDA|WEEK-2026-06-01|MASTER|CV-1');
assert.equal(canonicalWeek('WEEK-2026-06-28'), 'WEEK-2026-06-29');
assert.equal(canonicalWeek('WEEK-2026-06-29'), 'WEEK-2026-06-29');
assert.equal(buildKey('37-5.HL', 'Thietke', 'WEEK-2026-06-28', 'MASTER', 'CV-1'), '37-5.HL|THIETKE|WEEK-2026-06-29|MASTER|CV-1');
assert.equal(date('2026-06-01'), '2026-06-01');
assert.equal(date('2026-02-30'), null);

const lifecycleScope = { meta: {}, warnings: [] };
assert.equal(validateTransition({ itemType: 'MASTER', taskStatus: 'Đang làm' }, { status: 'Chưa bắt đầu' }, { user: { role: 'EDITOR' } }, lifecycleScope).error, null);
assert.equal(validateTransition({ itemType: 'MASTER', taskStatus: 'Tạm dừng' }, { status: 'Đang làm' }, { user: { role: 'EDITOR' } }, lifecycleScope).error, null);
assert.equal(validateTransition({ itemType: 'MASTER', taskStatus: 'Đang làm' }, { status: 'Tạm dừng' }, { user: { role: 'EDITOR' } }, lifecycleScope).error, null);
assert.equal(validateTransition({ itemType: 'MASTER', taskStatus: 'Hoàn thành' }, { status: 'Đang làm' }, { user: { role: 'EDITOR' } }, lifecycleScope).error, null);
assert.equal(validateTransition({ itemType: 'MASTER', taskStatus: 'Hoàn thành' }, { status: 'Tạm dừng' }, { user: { role: 'EDITOR' } }, lifecycleScope).error, null);
assert.equal(validateTransition({ itemType: 'MASTER', taskStatus: 'Đang làm' }, { status: 'Hoàn thành' }, { user: { role: 'EDITOR' } }, lifecycleScope).error.code, 'COMPLETED_STATUS_ADMIN_REQUIRED');
assert.equal(validateTransition({ itemType: 'MASTER', taskStatus: 'Đang làm' }, { status: 'Hoàn thành' }, { user: { role: 'PMO' } }, lifecycleScope).error, null);
const lifecycleValidation = { progressEnd: 60, taskStatus: 'Đang thực hiện', actualStart: '', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleValidation, { actualStart: '2026-06-01', actualFinish: '' }, lifecycleScope).error, null);
assert.equal(lifecycleValidation.actualStart, '2026-06-01');
assert.equal(lifecycleValidation.actualStartShouldWrite, false);
const lifecycleExistingFinish = { progressEnd: 60, taskStatus: 'Đang thực hiện', actualStart: '', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleExistingFinish, { actualStart: '2026-06-01', actualFinish: '2026-06-20' }, lifecycleScope).error, null);
assert.equal(lifecycleExistingFinish.actualFinish, '');
assert.equal(lifecycleExistingFinish.actualFinishShouldWrite, false);
const lifecycleMissingStart = { progressEnd: 50, taskStatus: 'Đang thực hiện', actualStart: '', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleMissingStart, {}, lifecycleScope).error.code, 'ACTUAL_START_REQUIRED');
const lifecycleProgress100Doing = { progressEnd: 100, taskStatus: 'Đang làm', actualStart: '2026-06-01', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleProgress100Doing, {}, lifecycleScope).error, null);
assert.equal(lifecycleProgress100Doing.actualFinishShouldWrite, false);
const lifecycleProgress100Paused = { progressEnd: 100, taskStatus: 'Tạm dừng', actualStart: '2026-06-01', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleProgress100Paused, {}, lifecycleScope).error, null);
assert.equal(lifecycleProgress100Paused.actualFinishShouldWrite, false);
const lifecycleMissingFinish = { progressEnd: 100, taskStatus: 'Hoàn thành', actualStart: '2026-06-01', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleMissingFinish, {}, lifecycleScope).error.code, 'ACTUAL_FINISH_REQUIRED');
const lifecycleFinish = { progressEnd: 100, taskStatus: 'Hoàn thành', actualStart: '2026-06-01', actualFinish: '2026-06-20' };
assert.equal(resolveActualDate({}, lifecycleFinish, {}, lifecycleScope).error, null);
assert.equal(lifecycleFinish.actualFinishShouldWrite, true);

assert.equal(mapPbDetailStatus('Đang thực hiện'), 'Đang làm');
assert.equal(mapPbDetailStatus('Đang làm'), 'Đang làm');
assert.equal(mapPbDetailStatus('Tạm dừng'), 'Tạm dừng');
const pbSyncValidation = { itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 1, taskStatus: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '', actualStartShouldWrite: true, actualFinishShouldWrite: false };
const pbSyncScope = { projectCode: 'P1', deptCode: 'PTDA', meta: {}, warnings: [] };
assert.equal(syncTask({}, pbSyncValidation, pbSyncScope, { email: 'user@example.com' }).result.success, true);
assert.equal(detailSyncCalls.at(-1).status, 'Đang làm');
assert.equal(detailSyncCalls.at(-1).progress, 1);
assert.equal(detailSyncCalls.at(-1).actualStart, '2026-06-21');
context.qltdWorkUpdateDetailTask_ = () => { throw new Error('validation rejected'); };
const partialSync = syncTask({}, pbSyncValidation, pbSyncScope, { email: 'user@example.com' });
assert.equal(partialSync.result.success, false);
assert.equal(partialSync.result.code, 'PB_DETAIL_SYNC_EXCEPTION');
assert.equal(partialSync.warning.code, 'TASK_SYNC_PARTIAL');
context.qltdWorkUpdateDetailTask_ = (payload) => { detailSyncCalls.push(payload); return { success: true }; };

const base = { wbs: '1.1', taskName: 'Công việc', planStart: '2026-06-01', planFinish: '2026-06-30', progress: 20 };
assert.equal(buildItem('MASTER', 'CV-1', base, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('PB_DETAIL', 'DT-START', { ...base, planStart: '2026-06-10', planFinish: '2026-07-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('PB_DETAIL', 'DT-FINISH', { ...base, planStart: '2026-06-01', planFinish: '2026-06-12' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('PB_DETAIL', 'DT-CROSS', { ...base, planStart: '2026-06-01', planFinish: '2026-07-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '2026-06-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'OVERDUE');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, actualStart: '2026-05-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'IN_PROGRESS');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, progress: 100, actualFinish: '2026-06-10' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'COMPLETED_THIS_WEEK');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, status: 'Hoàn thành', progress: 0, actualFinish: '' }, '2026-07-06', '2026-07-12', '').eligible, false);
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '' }, '2026-07-06', '2026-07-12', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '', progress: 100 }, '2026-07-06', '2026-07-12', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { wbs: '1', taskName: 'Không lịch', progress: 0 }, '2026-06-08', '2026-06-14', '').eligible, false);
assert.equal(buildItem('MASTER', 'CV-1', { wbs: '1', taskName: 'Không lịch', progress: 0 }, '2026-06-08', '2026-06-14', 'không lịch').eligibleReason, 'UNSCHEDULED');
assert.equal(buildItem('MASTER', 'CV-1', base, '2026-06-08', '2026-06-14', 'không khớp').eligible, false);
assert.equal(buildItem('PB_DETAIL', 'DT-COORD', { ...base, coordinatorText: 'user@example.com; other@example.com' }, '2026-06-08', '2026-06-14', '').coordinator, 'user@example.com; other@example.com');
assert.match(source, /capabilities:\s*\{/);
assert.match(source, /canUpdate:\s*canManage \|\| role === 'REPORTER'/);
assert.match(source, /canReviewWeekly:\s*qltdCanManageProjectDept_/);
const weeklySaveSource = source.slice(source.indexOf('function qltdWeeklyTaskUpdatesSave_'), source.indexOf('function qltdWorkListWeeklyItems_'));
assert.ok(weeklySaveSource.indexOf('.setValues([') < weeklySaveSource.indexOf('qltdNotificationsTryCreatePendingNoLock_'));

const sorted = [
  { eligibleReason: 'PLANNED', planFinish: '2026-06-12', wbs: '2' },
  { eligibleReason: 'OVERDUE', planFinish: '2026-06-01', wbs: '1' },
  { eligibleReason: 'IN_PROGRESS', planFinish: '2026-06-20', wbs: '3' }
].sort(sortItems);
assert.deepEqual(sorted.map((item) => item.eligibleReason), ['OVERDUE', 'IN_PROGRESS', 'PLANNED']);

const sheet = { getRange: () => ({ getValues: () => [headers] }), getLastColumn: () => 17 };
assert.equal(inspect(sheet).headerMatches, false);
assert.equal(inspect(sheet).canAppendApprovalColumns, false);
const readySheet = { getRange: () => ({ getValues: () => [headers] }), getLastColumn: () => headers.length };
assert.equal(inspect(readySheet).headerMatches, true);
const oldSheet = { getRange: () => ({ getValues: () => [baseHeaders] }), getLastColumn: () => 17 };
assert.equal(inspect(oldSheet).canAppendApprovalColumns, true);
const legacyHeaders = headers.slice(0, 21);
const legacySheet = { getRange: () => ({ getValues: () => [legacyHeaders] }), getLastColumn: () => legacyHeaders.length };
assert.equal(inspect(legacySheet).canAppendApprovalColumns, true);
assert.deepEqual(Array.from(inspect(legacySheet).appendHeaders), ['DependencyDecision', 'RecoveryPlan']);
const badSheet = { getRange: () => ({ getValues: () => [[...headers.slice(0, headers.length - 1), 'Wrong']] }), getLastColumn: () => headers.length };
assert.equal(inspect(badSheet).headerMatches, false);

sheetRows.push(headers.slice());
const saveBase = { email: 'user@example.com', projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-01', itemType: 'MASTER', itemId: 'CV-1', progressEnd: 30, taskStatus: 'Đang thực hiện', actualStart: '2026-06-01', thisWeekResult: 'Đã làm' };
assert.equal(save({ ...saveBase, itemId: 'CV-INVALID-HIGH', progressEnd: 101 }).code, 'INVALID_PROGRESS');
assert.equal(save({ ...saveBase, itemId: 'CV-INVALID-LOW', progressEnd: -1 }).code, 'INVALID_PROGRESS');
const firstSave = save({ ...saveBase, requestId: 'weekly-progress-001' });
assert.equal(firstSave.inserted, true);
assert.equal(firstSave.masterWriteback.applied, true);
assert.equal(firstSave.ganttRefreshRequired, true);
assert.equal(firstSave.dashboardRefreshRequired, true);
assert.equal(firstSave.weeklyUpdateSaved, true);
assert.equal(masterProgressWritebackCalls.at(-1).requestId, 'weekly-progress-001');
assert.equal(sheetRows.length, 2);
assert.equal(save({ ...saveBase, progressEnd: 55 }).duplicatePrevented, true);
assert.equal(sheetRows.length, 2);
assert.equal(save({ ...saveBase, itemId: 'CV-2' }).inserted, true);
assert.equal(sheetRows.length, 3);
assert.equal(save({ ...saveBase, weekCode: 'WEEK-2026-06-08' }).inserted, true);
assert.equal(sheetRows.length, 4);

const cumulativeBase = {
  ...saveBase,
  projectCode: '37-5.HL',
  deptCode: 'Thietke',
  itemId: 'CV-CUMULATIVE',
  weekCode: 'WEEK-2026-06-29',
  progressEnd: 80,
  requestId: 'weekly-cumulative-027'
};
assert.equal(get({ email: 'user@example.com', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-06', itemType: 'MASTER', itemId: 'CV-NO-HISTORY' }).progressStates.length, 0);
assert.equal(save(cumulativeBase).inserted, true);
const week27State = get({ email: 'user@example.com', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'CV-CUMULATIVE' });
assert.equal(week27State.updates.length, 1);
assert.deepEqual(
  { ...week27State.progressStates[0] },
  {
    projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'CV-CUMULATIVE',
    currentProgress: 80, currentWeekProgress: 80, effectiveProgress: 80, previousProgress: null, progressDelta: null,
    hasCurrentWeekUpdate: true, latestUpdateWeek: 'WEEK-2026-06-29', latestUpdatedWeek: 'WEEK-2026-06-29', latestUpdatedAt: '2026-06-20T00:00:00.000Z',
    effectiveTaskStatus: 'Đang làm', effectiveApprovalStatus: '', effectiveUpdateId: 'WTU_UUID-4', effectiveRowNumber: 5
  }
);
const week28Inherited = get({ email: 'user@example.com', projectCode: '37-5.HL', deptCode: 'thietke', weekCode: 'WEEK-2026-07-06', itemType: 'MASTER', itemId: 'CV-CUMULATIVE' });
assert.equal(week28Inherited.updates.length, 0);
assert.equal(week28Inherited.progressStates[0].currentProgress, 80);
assert.equal(week28Inherited.progressStates[0].currentWeekProgress, null);
assert.equal(week28Inherited.progressStates[0].effectiveProgress, 80);
assert.equal(week28Inherited.progressStates[0].previousProgress, 80);
assert.equal(week28Inherited.progressStates[0].hasCurrentWeekUpdate, false);
const rowsBeforeWeek28Save = sheetRows.length;
assert.equal(save({ ...cumulativeBase, weekCode: 'WEEK-2026-07-06', progressEnd: 90, requestId: 'weekly-cumulative-028' }).inserted, true);
assert.equal(sheetRows.length, rowsBeforeWeek28Save + 1);
const week28Saved = get({ email: 'user@example.com', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-06', itemType: 'MASTER', itemId: 'CV-CUMULATIVE' });
assert.equal(week28Saved.progressStates[0].currentProgress, 90);
assert.equal(week28Saved.progressStates[0].effectiveProgress, 90);
assert.equal(week28Saved.progressStates[0].previousProgress, 80);
assert.equal(week28Saved.progressStates[0].progressDelta, 10);
assert.equal(week28Saved.progressStates[0].hasCurrentWeekUpdate, true);
assert.equal(get({ email: 'user@example.com', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'CV-CUMULATIVE' }).updates[0].progressEnd, 80);
assert.equal(save({ ...cumulativeBase, weekCode: 'WEEK-2026-07-06', progressEnd: 95, requestId: 'weekly-cumulative-028-edit' }).duplicatePrevented, true);
assert.equal(sheetRows.length, rowsBeforeWeek28Save + 1);
assert.equal(get({ email: 'user@example.com', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-06', itemType: 'MASTER', itemId: 'CV-CUMULATIVE' }).updates[0].progressEnd, 95);
assert.equal(get({ email: 'user@example.com', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'CV-CUMULATIVE' }).updates[0].progressEnd, 80);

const isolatedStates = Array.from(buildProgressStates([
  { projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'SAME-NAME-A', progressEnd: 30, updatedAt: '2026-06-20', rowNumber: 1 },
  { projectCode: '37-5.HL', deptCode: 'Thietke', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'SAME-NAME-B', progressEnd: 40, updatedAt: '2026-06-20', rowNumber: 2 },
  { projectCode: '37-5.HL1', deptCode: 'THIETKE', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'SAME-NAME-A', progressEnd: 70, updatedAt: '2026-06-20', rowNumber: 3 }
], 'WEEK-2026-07-06'));
assert.equal(isolatedStates.length, 3);
assert.equal(isolatedStates.find((state) => state.projectCode === '37-5.HL' && state.itemId === 'SAME-NAME-A').effectiveProgress, 30);
assert.equal(isolatedStates.find((state) => state.projectCode === '37-5.HL' && state.itemId === 'SAME-NAME-B').effectiveProgress, 40);
assert.equal(isolatedStates.find((state) => state.projectCode === '37-5.HL1' && state.itemId === 'SAME-NAME-A').effectiveProgress, 70);

const approvalFilteredStates = Array.from(buildProgressStates([
  { updateId: 'BASE-PENDING', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-13', itemType: 'MASTER', itemId: 'PENDING-100', progressEnd: 95, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-16T01:00:00.000Z', rowNumber: 80 },
  { updateId: 'CURRENT-PENDING', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-20', itemType: 'MASTER', itemId: 'PENDING-100', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'PENDING', updatedAt: '2026-07-22T01:00:00.000Z', rowNumber: 120 },
  { updateId: 'BASE-REJECTED', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-13', itemType: 'MASTER', itemId: 'REJECTED-100', progressEnd: 70, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-16T02:00:00.000Z', rowNumber: 81 },
  { updateId: 'CURRENT-REJECTED', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-20', itemType: 'MASTER', itemId: 'REJECTED-100', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'REJECTED', updatedAt: '2026-07-22T02:00:00.000Z', rowNumber: 121 },
  { updateId: 'CURRENT-APPROVED', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-20', itemType: 'MASTER', itemId: 'APPROVED-100', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'APPROVED', updatedAt: '2026-07-22T03:00:00.000Z', rowNumber: 122 }
], 'WEEK-2026-07-20'));
const pendingState = approvalFilteredStates.find((state) => state.itemId === 'PENDING-100');
assert.equal(pendingState.currentWeekProgress, 100);
assert.equal(pendingState.effectiveProgress, 95);
assert.equal(pendingState.effectiveUpdateId, 'BASE-PENDING');
const rejectedState = approvalFilteredStates.find((state) => state.itemId === 'REJECTED-100');
assert.equal(rejectedState.currentWeekProgress, 100);
assert.equal(rejectedState.effectiveProgress, 70);
assert.equal(rejectedState.effectiveUpdateId, 'BASE-REJECTED');
const approvedState = approvalFilteredStates.find((state) => state.itemId === 'APPROVED-100');
assert.equal(approvedState.effectiveProgress, 100);
assert.equal(approvedState.effectiveApprovalStatus, 'APPROVED');

const legacyCoexistence = Array.from(buildProgressStates([
  { projectCode: 'P-LEGACY', deptCode: 'D1', weekCode: canonicalWeek('WEEK-2026-06-28'), itemType: 'MASTER', itemId: 'M1', progressEnd: 75, updatedAt: '2026-06-29T01:00:00.000Z', rowNumber: 10 },
  { projectCode: 'P-LEGACY', deptCode: 'D1', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'M1', progressEnd: 80, updatedAt: '2026-06-29T02:00:00.000Z', rowNumber: 11 }
], 'WEEK-2026-06-29'));
assert.equal(legacyCoexistence.length, 1);
assert.equal(legacyCoexistence[0].currentProgress, 80);

const doingAt100Writebacks = masterProgressWritebackCalls.length;
const doingAt100 = save({ ...saveBase, itemId: 'CV-100-DOING', requestId: 'weekly-100-doing-001', progressEnd: 100, taskStatus: 'Đang làm', actualStart: '2026-06-01', actualFinish: '' });
assert.equal(doingAt100.success, true);
assert.equal(doingAt100.update.approvalStatus, '');
assert.equal(doingAt100.taskSync.approvalRequired, undefined);
assert.equal(doingAt100.masterWriteback.applied, true);
assert.equal(masterProgressWritebackCalls.length, doingAt100Writebacks + 1);
assert.equal(masterProgressWritebackCalls.at(-1).update.taskStatus, 'Đang làm');

const pausedAt100 = save({ ...saveBase, itemId: 'CV-100-PAUSED', requestId: 'weekly-100-paused-001', progressEnd: 100, taskStatus: 'Tạm dừng', actualStart: '2026-06-01', actualFinish: '2026-06-30' });
assert.equal(pausedAt100.success, true);
assert.equal(pausedAt100.update.approvalStatus, '');
assert.equal(pausedAt100.update.actualFinish, '');
assert.equal(pausedAt100.masterWriteback.applied, true);
assert.equal(masterProgressWritebackCalls.at(-1).update.taskStatus, 'Tạm dừng');

const completeBelow100 = save({ ...saveBase, itemId: 'CV-COMPLETE-80', requestId: 'weekly-complete-80-001', progressEnd: 80, taskStatus: 'Hoàn thành', actualFinish: '2026-06-25', thisWeekResult: 'Hoàn tất nghiệm thu' });
assert.equal(completeBelow100.success, true);
assert.equal(completeBelow100.update.approvalStatus, 'PENDING');
assert.equal(completeBelow100.taskSync.approvalRequired, true);
assert.equal(completeBelow100.masterWriteback.applied, false);

const pauseFlow = save({ ...saveBase, itemId: 'CV-PAUSE-FLOW', requestId: 'weekly-pause-flow-001', progressEnd: 40, taskStatus: 'Đang làm', actualStart: '2026-06-01' });
assert.equal(pauseFlow.success, true);
const pausedFlow = save({ ...saveBase, itemId: 'CV-PAUSE-FLOW', requestId: 'weekly-pause-flow-002', progressEnd: 40, taskStatus: 'Tạm dừng', actualStart: '2026-06-01' });
assert.equal(pausedFlow.success, true);
assert.equal(pausedFlow.update.approvalStatus, '');
assert.equal(masterProgressWritebackCalls.at(-1).update.taskStatus, 'Tạm dừng');

const resumeFlow = save({ ...saveBase, itemId: 'CV-RESUME-FLOW', requestId: 'weekly-resume-flow-001', progressEnd: 0, taskStatus: 'Tạm dừng' });
assert.equal(resumeFlow.success, true);
const resumedFlow = save({ ...saveBase, itemId: 'CV-RESUME-FLOW', requestId: 'weekly-resume-flow-002', progressEnd: 1, taskStatus: 'Đang làm', actualStart: '2026-06-02' });
assert.equal(resumedFlow.success, true);
assert.equal(resumedFlow.update.approvalStatus, '');
assert.equal(resumedFlow.update.actualStart, '2026-06-02');
assert.equal(masterProgressWritebackCalls.at(-1).update.taskStatus, 'Đang làm');

const startFlow = save({ ...saveBase, itemId: 'CV-START-FLOW', requestId: 'weekly-start-flow-001', progressEnd: 0, taskStatus: 'Đang làm', actualStart: '2026-06-03' });
assert.equal(startFlow.success, true);
assert.equal(startFlow.update.actualStart, '2026-06-03');
assert.equal(startFlow.update.approvalStatus, '');

const completeMissingFinish = save({ ...saveBase, itemId: 'CV-COMPLETE-NO-FINISH', requestId: 'weekly-complete-no-finish-001', progressEnd: 80, taskStatus: 'Hoàn thành', actualFinish: '', thisWeekResult: 'Hoàn tất' });
assert.equal(completeMissingFinish.success, false);
assert.equal(completeMissingFinish.code, 'ACTUAL_FINISH_REQUIRED');
const completeMissingResult = save({ ...saveBase, itemId: 'CV-COMPLETE-NO-RESULT', requestId: 'weekly-complete-no-result-001', progressEnd: 80, taskStatus: 'Hoàn thành', actualFinish: '2026-06-26', thisWeekResult: '' });
assert.equal(completeMissingResult.success, false);
assert.equal(completeMissingResult.code, 'RESULT_REQUIRED');

const standaloneBudget = { budgetItemCode: 'NS-1', allocationCode: 'ALLOC-1', budgetType: 'DEPT_STANDALONE', flowType: 'CHI', projectCode: 'P1', deptCode: 'PTDA', periodType: 'WEEK', periodCode: 'WEEK-2026-06-01', actualAmount: 500000, note: 'Chi tuần', masterTaskCode: '', pbTaskCode: '' };
const combinedBase = { ...saveBase, itemId: 'CV-BUDGET', requestId: 'weekly-request-001', budgetUpdates: [standaloneBudget] };
const beforeCombinedRows = sheetRows.length;
const combined = save(combinedBase);
assert.equal(combined.success, true);
assert.equal(combined.task.saved, true);
assert.equal(combined.budget.savedCount, 1);
assert.equal(combined.budget.results[0].metrics.cumulative, 500000);
assert.equal(combined.budget.results[0].aggregate.summaryRowsWritten, 1);
assert.equal(sheetRows.length, beforeCombinedRows + 1);
assert.equal(budgetWriteCalls.length, 1);
assert.equal(aggregateCalls.length, 1);

const retry = save(combinedBase);
assert.equal(retry.success, true);
assert.equal(retry.budget.savedCount, 0);
assert.equal(retry.budget.duplicateCount, 1);
assert.equal(budgetWriteCalls.length, 1);
assert.equal(aggregateCalls.length, 2);

budgetItems = [
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'TASK_LINKED', masterTaskCode: 'D5-036', budgetItemCode: 'TL-1', budgetItemName: 'Mong 1', approvedBudget: 12015541930, allocationCode: 'ALLOC-TL', flowType: 'CHI' },
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'TASK_LINKED', masterTaskCode: 'D5-036', budgetItemCode: 'TL-2', budgetItemName: 'Mong 2', approvedBudget: 1000000, allocationCode: 'ALLOC-TL', flowType: 'CHI' },
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'TASK_LINKED', masterTaskCode: 'OTHER', budgetItemCode: 'TL-OTHER', budgetItemName: 'Other', approvedBudget: 1000000, allocationCode: 'ALLOC-TL', flowType: 'CHI' },
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'DEPT_STANDALONE', masterTaskCode: '', budgetItemCode: 'NS-STANDALONE', budgetItemName: 'Standalone', approvedBudget: 2000000, allocationCode: 'ALLOC-1', flowType: 'CHI' }
];
allocations = [
  { allocationCode: 'ALLOC-TL', projectCode: 'P1', deptCode: 'PTDA', flowType: 'CHI', allocatedAmount: 12015541930, status: 'CONFIRMED' },
  { allocationCode: 'ALLOC-1', projectCode: 'P1', deptCode: 'PTDA', flowType: 'CHI', allocatedAmount: 3000000, status: 'CONFIRMED' }
];
rawBudgetRows.push(['RAW-TL', 'P1', 'daxacnhan', 'SYNCED', 'PERFORMANCE_ACTUAL', 'TL-1', 'ALLOC-TL', 'CHI', 1000000, 'WEEK', 'WEEK-2026-06-01', 'Chi mong', '']);
const budgetContext = readBudgetContext({ projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-01' });
assert.equal(budgetContext.taskLinkedByMaster['D5-036'].length, 2);
assert.equal(budgetContext.taskLinkedByMaster['OTHER'].length, 1);
assert.equal(budgetContext.standaloneItems.length, 1);
assert.equal(budgetContext.taskLinkedByMaster['D5-036'][0].actualThisWeek, 1000000);
rawBudgetRows.length = 0;

const taskLinkedBudget = { budgetItemCode: 'TL-1', allocationCode: 'ALLOC-TL', budgetType: 'TASK_LINKED', flowType: 'CHI', projectCode: 'P1', deptCode: 'PTDA', periodType: 'WEEK', periodCode: 'WEEK-2026-06-01', actualAmount: 1000000, note: 'Chi mong', masterTaskCode: 'D5-036', pbTaskCode: '' };
const taskLinkedBase = { ...saveBase, itemId: 'D5-036', requestId: 'weekly-tasklinked-001', budgetUpdates: [taskLinkedBudget] };
const beforeTaskLinkedRows = sheetRows.length;
const taskLinked = save(taskLinkedBase);
assert.equal(taskLinked.success, true);
assert.equal(taskLinked.budget.savedCount, 1);
assert.equal(taskLinked.budget.results[0].metrics.cumulative, 1000000);
assert.equal(taskLinked.budget.results[0].metrics.remaining, 12014541930);
assert.equal(sheetRows.length, beforeTaskLinkedRows + 1);
const taskLinkedRetry = save(taskLinkedBase);
assert.equal(taskLinkedRetry.success, true);
assert.equal(taskLinkedRetry.budget.duplicateCount, 1);
assert.equal(budgetWriteCalls.filter((code) => code === 'TL-1').length, 1);
const wrongMaster = save({ ...saveBase, itemId: 'D5-036-WRONG', requestId: 'weekly-tasklinked-wrong-001', budgetUpdates: [{ ...taskLinkedBudget, masterTaskCode: 'OTHER' }] });
assert.equal(wrongMaster.success, false);
assert.equal(wrongMaster.code, 'TASK_LINKED_MASTER_MISMATCH');

for (const [change, code] of [
  [{ allocationCode: 'WRONG' }, 'ALLOCATION_CODE_MISMATCH'],
  [{ deptCode: 'OTHER' }, 'ALLOCATION_DEPT_MISMATCH'],
  [{ flowType: 'THU' }, 'FLOW_TYPE_MISMATCH'],
  [{ actualAmount: 2000001 }, 'BUDGET_ITEM_LIMIT_EXCEEDED'],
  [{ actualAmount: -1 }, 'AMOUNT_NEGATIVE']
]) {
  const rowCount = sheetRows.length;
  const writeCount = budgetWriteCalls.length;
  const invalid = save({ ...saveBase, itemId: `CV-${code}`, requestId: `weekly-${code}-001`, budgetUpdates: [{ ...standaloneBudget, ...change }] });
  assert.equal(invalid.success, false);
  assert.equal(invalid.code, code);
  assert.equal(sheetRows.length, rowCount);
  assert.equal(budgetWriteCalls.length, writeCount);
}

failBudgetItemCode = 'NS-2';
const partialRowCount = sheetRows.length;
const partial = save({ ...saveBase, itemId: 'CV-PARTIAL', requestId: 'weekly-partial-001', budgetUpdates: [standaloneBudget, { ...standaloneBudget, budgetItemCode: 'NS-2', actualAmount: 250000 }] });
assert.equal(partial.success, false);
assert.equal(partial.code, 'PARTIAL_WRITE');
assert.equal(partial.stage, 'BUDGET_WRITE');
assert.equal(partial.budgetResults.length, 1);
assert.equal(sheetRows.length, partialRowCount);
failBudgetItemCode = '';

failAggregateBudgetItemCode = 'NS-1';
const aggregatePartialRowCount = sheetRows.length;
const aggregatePartialWriteCount = budgetWriteCalls.length;
const aggregatePartial = save({ ...saveBase, itemId: 'CV-AGGREGATE-PARTIAL', requestId: 'weekly-aggregate-001', budgetUpdates: [standaloneBudget] });
assert.equal(aggregatePartial.success, false);
assert.equal(aggregatePartial.code, 'PARTIAL_WRITE');
assert.equal(aggregatePartial.stage, 'AGGREGATE');
assert.equal(aggregatePartial.budgetItemCode, 'NS-1');
assert.equal(aggregatePartial.budgetResults.length, 1);
assert.equal(budgetWriteCalls.length, aggregatePartialWriteCount + 1);
assert.equal(sheetRows.length, aggregatePartialRowCount);
failAggregateBudgetItemCode = '';

rawBudgetRows.push(
  ['RAW-MONTH', 'P1', 'daxacnhan', 'SYNCED', 'PERFORMANCE_ACTUAL', 'NS-1', 'ALLOC-1', 'CHI', 1200000, 'MONTH', '2026-06', 'Chi tháng', ''],
  ['RAW-WEEK', 'P1', 'daxacnhan', 'SYNCED', 'PERFORMANCE_ACTUAL', 'NS-1', 'ALLOC-1', 'CHI', 500000, 'WEEK', 'WEEK-2026-06-01', 'Chi tuần', '']
);
const weeklyActuals = readBudgetActualIndex({ projectCode: 'P1', weekCode: 'WEEK-2026-06-01' });
const weeklyActualKey = context.qltdWeeklyTaskUpdatesBudgetItemKey_('P1', 'NS-1', 'ALLOC-1', 'CHI');
assert.equal(weeklyActuals.byItem[weeklyActualKey], 500000);
assert.equal(weeklyActuals.byItemWeek[weeklyActualKey].amount, 500000);
rawBudgetRows.length = 0;

const beforePendingRows = sheetRows.length;
const beforePendingWritebacks = masterProgressWritebackCalls.length;
const beforeMasterNotifications = notificationPendingCalls.length;
const pending = save({ ...saveBase, itemId: 'CV-100', progressEnd: 100, taskStatus: 'Hoàn thành', actualFinish: '2026-06-20' });
assert.equal(pending.update.approvalStatus, 'PENDING');
assert.equal(pending.taskSync.approvalRequired, true);
assert.equal(pending.masterWriteback.applied, false);
assert.equal(pending.masterWriteback.reason, 'APPROVAL_REQUIRED');
assert.equal(pending.ganttRefreshRequired, false);
assert.equal(masterProgressWritebackCalls.length, beforePendingWritebacks);
assert.equal(sheetRows.length, beforePendingRows + 1);
assert.equal(notificationPendingCalls.length, beforeMasterNotifications + 1);
assert.equal(notificationPendingCalls.at(-1).updateId, pending.update.updateId);
const reviewResult = review({
  email: 'admin@example.com',
  updateId: pending.update.updateId,
  approvalStatus: 'APPROVED',
  impactMode: 'KEEP_PLAN'
});
assert.equal(reviewResult.approval.approvalStatus, 'APPROVED');
assert.equal(reviewResult.masterAutoUpdated, true);
assert.equal(reviewResult.congViecUpdated, true);
assert.equal(reviewResult.columnWUpdated, true);
assert.equal(reviewResult.recalcTriggered, false);
assert.equal(reviewResult.ganttRefreshRequired, false);
assert.equal(reviewResult.dashboardRefreshRequired, false);
assert.equal(reviewResult.projectDirty, true);
assert.equal(reviewResult.scheduleRecalculationRequired, true);
assert.equal(reviewResult.masterWriteback.status, 'UPDATED');
assert.equal(reviewResult.weeklyUpdateSaved, true);
assert.equal(masterApprovalSyncCalls.length, 1);
assert.equal(masterApprovalSyncCalls[0].dependencyDecision, 'KEEP_PLAN');
assert.equal(masterApprovalSyncCalls[0].recoveryPlan, '');
assert.equal(notificationFinalizeCalls.at(-1).updateId, pending.update.updateId);
assert.equal(notificationFinalizeCalls.at(-1).approvalStatus, 'APPROVED');
const duplicateMasterApprove = review({ email: 'admin@example.com', updateId: pending.update.updateId, approvalStatus: 'APPROVED', impactMode: 'KEEP_PLAN' });
assert.equal(duplicateMasterApprove.code, 'APPROVAL_NOT_PENDING');
assert.equal(masterApprovalSyncCalls.length, 1);

const invalidImpactPending = save({ ...saveBase, itemId: 'CV-101', progressEnd: 100, taskStatus: 'Hoàn thành', actualFinish: '2026-06-21' });
const missingImpactReview = review({
  email: 'admin@example.com',
  updateId: invalidImpactPending.update.updateId,
  approvalStatus: 'APPROVED'
});
assert.equal(missingImpactReview.success, false);
assert.equal(missingImpactReview.errorCode, 'INVALID_IMPACT_MODE');
assert.equal(missingImpactReview.stage, 'VALIDATION');
assert.equal(sheetRows.find((row) => row[0] === invalidImpactPending.update.updateId)[17], 'PENDING');
const invalidImpactReview = review({ email: 'admin@example.com', updateId: invalidImpactPending.update.updateId, approvalStatus: 'APPROVED', impactMode: 'OTHER' });
assert.equal(invalidImpactReview.errorCode, 'INVALID_IMPACT_MODE');
const validImpactReview = review({ email: 'admin@example.com', updateId: invalidImpactPending.update.updateId, approvalStatus: 'APPROVED', impactMode: 'PROPAGATE_ACTUAL' });
assert.equal(validImpactReview.success, true);
assert.equal(masterApprovalSyncCalls.at(-1).dependencyDecision, 'PROPAGATE_ACTUAL');

const failingStatusPending = save({ ...saveBase, itemId: 'CV-102', progressEnd: 100, taskStatus: 'Hoàn thành', actualFinish: '2026-06-22' });
const syncCountBeforeStatusFailure = masterApprovalSyncCalls.length;
failNextApprovalReviewWrite = true;
const failedStatusReview = review({ email: 'admin@example.com', updateId: failingStatusPending.update.updateId, approvalStatus: 'APPROVED', impactMode: 'KEEP_PLAN' });
assert.equal(failedStatusReview.success, false);
assert.equal(failedStatusReview.code, 'WRITE_ERROR');
assert.equal(masterApprovalSyncCalls.length, syncCountBeforeStatusFailure + 1);
assert.equal(sheetRows.find((row) => row[0] === failingStatusPending.update.updateId)[17], 'PENDING');
const recoveredStatusReview = review({ email: 'admin@example.com', updateId: failingStatusPending.update.updateId, approvalStatus: 'APPROVED', impactMode: 'KEEP_PLAN' });
assert.equal(recoveredStatusReview.success, true);
assert.equal(sheetRows.find((row) => row[0] === failingStatusPending.update.updateId)[17], 'APPROVED');

const cacheSuccess = invalidateCache('P1');
assert.equal(cacheSuccess.success, true);
assert.equal(ganttInvalidateCalls.at(-1), 'P1');
context.qltdGanttInvalidateCache_ = () => { throw new Error('cache unavailable'); };
const cacheFail = invalidateCache('P1');
assert.equal(cacheFail.success, false);
assert.equal(cacheFail.code, 'GANTT_INVALIDATE_FAILED');
context.qltdGanttInvalidateCache_ = (projectCode) => { ganttInvalidateCalls.push(projectCode); return { success: true }; };

const rejectPending = save({ ...saveBase, itemId: 'CV-REJECT', progressEnd: 100, taskStatus: 'Hoàn thành', actualFinish: '2026-06-23' });
const syncCountBeforeReject = masterApprovalSyncCalls.length;
const rejectedMaster = review({ email: 'admin@example.com', updateId: rejectPending.update.updateId, approvalStatus: 'REJECTED', reviewReason: 'Chưa đủ hồ sơ' });
assert.equal(rejectedMaster.success, true);
assert.equal(rejectedMaster.approval.approvalStatus, 'REJECTED');
assert.equal(masterApprovalSyncCalls.length, syncCountBeforeReject);

resetMasterRows(['CV-200']);
const parsedMaster = parseMaster(masterSheet);
assert.equal(parsedMaster.error, null);
assert.equal(parsedMaster.headerRow, 4);
assert.equal(parsedMaster.tasks.length, 1);
assert.equal(parsedMaster.tasks[0].masterTaskCode, 'CV-200');
assert.equal(masterRows[3].includes('Mã công việc Master'), false);
assert.equal(findSingleMaster(parsedMaster.tasks, 'NOT-FOUND').error.code, 'MASTER_TASK_NOT_FOUND');
resetMasterRows(['CV-DUP', 'CV-DUP']);
assert.equal(findSingleMaster(parseMaster(masterSheet).tasks, 'CV-DUP').error.code, 'MASTER_TASK_DUPLICATED');

const masterTarget = {
  updateId: 'WTU-MASTER-200',
  projectCode: 'P1',
  itemId: 'CV-200',
  taskStatus: 'Hoàn thành',
  actualStart: '',
  actualFinish: '2026-06-26',
  progressEnd: 100,
  thisWeekResult: 'Đã hoàn thành',
  updatedBy: 'reporter@example.com'
};
const masterAuth = { email: 'admin@example.com' };
resetMasterRows(['CV-200']);
const keepPlanResult = applyMaster(masterTarget, masterAuth, 'KEEP_PLAN', '', '2026-06-30T08:00:00.000Z', 'weekly_masterapproval_review', {});
assert.equal(keepPlanResult.success, true);
assert.equal(masterRows[4][17], 'Hoàn thành');
assert.equal(masterRows[4][18], '2026-06-01');
assert.equal(masterRows[4][19], '2026-06-26');
assert.equal(masterRows[4][21], '2026-06-30T08:00:00.000Z');
assert.equal(masterRows[4][22], 'Không');
assert.equal(masterRows[4][16], 77);
assert.equal(masterFlushCount, 1);
const firstApprovalNote = masterRows[4][20];
const keepPlanRetry = applyMaster(masterTarget, masterAuth, 'KEEP_PLAN', '', '2026-06-30T08:00:00.000Z', 'weekly_masterapproval_review', {});
assert.equal(keepPlanRetry.success, true);
assert.equal((masterRows[4][20].match(/\[WeeklyApproval:WTU-MASTER-200\]/g) || []).length, 1);
assert.equal(masterRows[4][20], firstApprovalNote);

resetMasterRows(['CV-200']);
const propagateResult = applyMaster(masterTarget, masterAuth, 'PROPAGATE_ACTUAL', '', '2026-06-30T08:00:00.000Z', 'weekly_masterapproval_review', {});
assert.equal(propagateResult.success, true);
assert.equal(masterRows[4][22], 'Có');

resetMasterRows(['CV-VERIFY']);
const verifyPending = save({ ...saveBase, itemId: 'CV-VERIFY', progressEnd: 100, taskStatus: 'Hoàn thành', actualFinish: '2026-06-26' });
context.qltdWeeklyMasterApprovalApplyToMaster_ = applyMaster;
failMasterVerify = true;
const verifyFailed = review({ email: 'admin@example.com', updateId: verifyPending.update.updateId, approvalStatus: 'APPROVED', impactMode: 'KEEP_PLAN' });
assert.equal(verifyFailed.success, false);
assert.equal(verifyFailed.errorCode, 'MASTER_VERIFY_FAILED');
assert.equal(verifyFailed.stage, 'MASTER_VERIFY');
assert.equal(sheetRows.find((row) => row[0] === verifyPending.update.updateId)[17], 'PENDING');
context.qltdWeeklyMasterApprovalApplyToMaster_ = stubMasterApprovalApply;
failMasterVerify = false;

resetMasterRows(['CV-200']);
context.qltdGanttInvalidateCache_ = () => undefined;
const cacheWarningResult = applyMaster(masterTarget, masterAuth, 'KEEP_PLAN', '', '2026-06-30T08:00:00.000Z', 'weekly_masterapproval_review', {});
assert.equal(cacheWarningResult.success, true);
assert.equal(cacheWarningResult.ganttCacheInvalidated, false);
assert.ok(cacheWarningResult.warnings.some((warning) => warning.code === 'GANTT_INVALIDATE_UNVERIFIED'));
context.qltdGanttInvalidateCache_ = (projectCode) => { ganttInvalidateCalls.push(projectCode); return { success: true }; };

for (const role of ['ADMIN', 'PMO']) {
  authRole = role;
  const approvals = getApprovals({ projectCode: 'P1', deptCode: 'PTDA', status: 'APPROVED' });
  assert.equal(approvals.success, true);
  assert.equal(approvals.count, 3);
  assert.ok(approvals.approvals.some((item) => item.updateId === pending.update.updateId));
  assert.equal(getApprovals({ projectCode: 'OTHER', deptCode: 'PTDA', status: 'APPROVED' }).count, 0);
  assert.equal(getApprovals({ projectCode: 'P1', deptCode: 'OTHER', status: 'APPROVED' }).count, 0);
}
for (const role of ['EDITOR', 'REPORTER', 'VIEWER']) {
  authRole = role;
  const denied = getApprovals({ projectCode: 'P1', deptCode: 'PTDA', status: 'APPROVED' });
  assert.equal(denied.success, false);
  assert.equal(denied.code, 'ACCESS_DENIED');
}
authRole = 'ADMIN';

authRole = 'REPORTER';
authEmail = 'reporter@example.com';
const reporterBase = {
  email: authEmail,
  projectCode: 'P1',
  deptCode: 'PTDA',
  weekCode: 'WEEK-2026-06-22',
  itemType: 'PB_DETAIL',
  itemId: 'DT-REPORTER',
  progressEnd: 35,
  taskStatus: 'Äang thá»±c hiá»‡n',
  actualStart: '2026-06-01',
  thisWeekResult: 'Reporter update'
};
const syncCountBeforeReporter = detailSyncCalls.length;
const budgetWriteCountBeforeReporter = budgetWriteCalls.length;
const reporterPending = save({ ...reporterBase, budgetUpdates: [standaloneBudget] });
assert.equal(reporterPending.success, true);
assert.equal(reporterPending.inserted, true);
assert.equal(reporterPending.update.approvalStatus, 'PENDING');
assert.equal(reporterPending.taskSync.skippedPbDetailSync, true);
assert.equal(detailSyncCalls.length, syncCountBeforeReporter);
assert.equal(budgetWriteCalls.length, budgetWriteCountBeforeReporter);
assert.equal(notificationPendingCalls.at(-1).updateId, reporterPending.update.updateId);
assert.equal(notificationPendingCalls.at(-1).itemType, 'PB_DETAIL');
const reporterCurrentRead = get({ email: authEmail, projectCode: 'P1', deptCode: 'PTDA', weekCode: reporterBase.weekCode, itemType: 'PB_DETAIL', itemId: 'DT-REPORTER' });
assert.equal(reporterCurrentRead.updates.length, 1);
assert.equal(reporterCurrentRead.progressStates[0].currentWeekProgress, 35);
assert.equal(reporterCurrentRead.progressStates[0].effectiveProgress, null);
assert.equal(get({ email: authEmail, projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-29', itemType: 'PB_DETAIL', itemId: 'DT-REPORTER' }).progressStates.length, 0);
authEmail = 'other@example.com';
const otherReporterRead = get({ email: authEmail, projectCode: 'P1', deptCode: 'PTDA', weekCode: reporterBase.weekCode, itemType: 'PB_DETAIL', itemId: 'DT-REPORTER' });
assert.equal(otherReporterRead.updates.length, 0);
assert.equal(otherReporterRead.progressStates.length, 0);
authEmail = 'reporter@example.com';
const duplicatePending = save({ ...reporterBase, progressEnd: 40 });
assert.equal(duplicatePending.success, false);
assert.equal(duplicatePending.code, 'PB_DETAIL_APPROVAL_ALREADY_PENDING');
assert.equal(duplicatePending.existingUpdate.updateId, reporterPending.update.updateId);
assert.equal(save({ ...reporterBase, itemType: 'MASTER', itemId: 'M1' }).code, 'REPORTER_PB_DETAIL_ONLY');
assert.equal(save({ ...reporterBase, itemId: 'DT-OTHER' }).code, 'PB_DETAIL_NOT_ASSIGNED');
const otherDeptPending = {
  UpdateId: 'WTU-OTHER-DEPT', ProjectCode: 'P1', DeptCode: 'OTHER', WeekCode: reporterBase.weekCode,
  ItemType: 'PB_DETAIL', ItemId: 'DT-REPORTER', ProgressEnd: 50, TaskStatus: 'Äang thá»±c hiá»‡n',
  UpdatedBy: 'other@example.com', UpdatedAt: '2026-06-20T00:00:00.000Z', ApprovalStatus: 'PENDING'
};
sheetRows.push(headers.map((header) => otherDeptPending[header] || ''));

authRole = 'EDITOR';
authEmail = 'editor@example.com';
const pendingList = getPbApprovals({ projectCode: 'P1', status: 'PENDING' });
assert.equal(pendingList.success, true);
assert.equal(pendingList.count, 1);
assert.equal(pendingList.approvals[0].officialProgress, 10);
authRole = 'REPORTER';
authEmail = 'manager.delegate@example.com';
delegatedManagerMode = true;
const delegatedManagerPendingList = getPbApprovals({ projectCode: 'P1', status: 'PENDING' });
assert.equal(delegatedManagerPendingList.success, true);
assert.equal(delegatedManagerPendingList.count, 1);
delegatedManagerMode = false;
authRole = 'ADMIN';
assert.equal(getPbApprovals({ projectCode: 'P1', status: 'PENDING' }).code, 'ACCESS_DENIED');
authRole = 'EDITOR';
const officialWritesBeforeReject = officialDetailWrites.length;
const rejected = reviewPb({
  email: authEmail,
  updateId: reporterPending.update.updateId,
  approvalStatus: 'REJECTED',
  reviewReason: 'Bá»• sung káº¿t quáº£'
});
assert.equal(rejected.success, true);
assert.equal(rejected.approval.approvalStatus, 'REJECTED');
assert.equal(rejected.approval.reviewedBy, authEmail);
assert.equal(officialDetailWrites.length, officialWritesBeforeReject);
assert.equal(notificationFinalizeCalls.at(-1).approvalStatus, 'REJECTED');

authRole = 'REPORTER';
authEmail = 'reporter@example.com';
const resubmitted = save({ ...reporterBase, progressEnd: 45, thisWeekResult: 'Reporter resubmit' });
assert.equal(resubmitted.success, true);
assert.notEqual(resubmitted.update.updateId, reporterPending.update.updateId);
assert.equal(sheetRows.find((row) => row[0] === reporterPending.update.updateId)[17], 'REJECTED');
assert.equal(sheetRows.find((row) => row[0] === resubmitted.update.updateId)[17], 'PENDING');

authRole = 'REPORTER';
authEmail = 'manager.delegate@example.com';
delegatedManagerMode = true;
const missingRejectReason = reviewPb({ email: authEmail, updateId: resubmitted.update.updateId, approvalStatus: 'REJECTED' });
assert.equal(missingRejectReason.code, 'REVIEW_REASON_REQUIRED');
const approvedPb = reviewPb({ email: authEmail, updateId: resubmitted.update.updateId, approvalStatus: 'APPROVED' });
assert.equal(approvedPb.success, true);
assert.equal(approvedPb.pbDetailUpdated, true);
assert.equal(officialDetailWrites.at(-1).detailTaskId, 'DT-REPORTER');
assert.equal(officialDetailWrites.at(-1).progress, 45);
assert.equal(notificationFinalizeCalls.at(-1).approvalStatus, 'APPROVED');
assert.equal(reviewPb({ email: authEmail, updateId: resubmitted.update.updateId, approvalStatus: 'APPROVED' }).code, 'APPROVAL_NOT_PENDING');
delegatedManagerMode = false;
authRole = 'EDITOR';
authEmail = 'editor@example.com';
const directEditor = save({ ...reporterBase, email: authEmail, itemId: 'DT-EDITOR', progressEnd: 30, thisWeekResult: 'Editor direct' });
assert.equal(directEditor.success, true);
assert.equal(directEditor.update.approvalStatus, '');
assert.equal(detailSyncCalls.at(-1).detailTaskId, 'DT-EDITOR');

authRole = 'REPORTER';
authEmail = 'manager.delegate@example.com';
delegatedManagerMode = true;
const delegatedManagerSave = save({ ...reporterBase, email: authEmail, itemId: 'DT-EDITOR', progressEnd: 35, thisWeekResult: 'Delegated manager direct save' });
assert.equal(delegatedManagerSave.success, true);
assert.equal(delegatedManagerSave.update.approvalStatus, '');
assert.equal(detailSyncCalls.at(-1).detailTaskId, 'DT-EDITOR');
authRole = 'VIEWER';
const delegatedViewerManagerSave = save({ ...reporterBase, email: authEmail, itemId: 'DT-EDITOR', progressEnd: 40, thisWeekResult: 'Delegated manager with viewer base role' });
assert.equal(delegatedViewerManagerSave.success, true);
assert.equal(delegatedViewerManagerSave.update.approvalStatus, '');
delegatedManagerMode = false;

notificationFailureMode = true;
authRole = 'REPORTER';
authEmail = 'reporter@example.com';
const notificationFailurePending = save({ ...reporterBase, weekCode: 'WEEK-2026-06-29', progressEnd: 55 });
assert.equal(notificationFailurePending.success, true);
assert.ok(notificationFailurePending.warnings.some((warning) => warning.code === 'NOTIFICATION_CREATE_FAILED'));
authRole = 'EDITOR';
authEmail = 'editor@example.com';
const notificationFailureReview = reviewPb({
  email: authEmail,
  updateId: notificationFailurePending.update.updateId,
  approvalStatus: 'REJECTED',
  reviewReason: 'Trả lại nhưng notification hỏng'
});
assert.equal(notificationFailureReview.success, true);
assert.ok(notificationFailureReview.warnings.some((warning) => warning.code === 'NOTIFICATION_RESOLVE_FAILED'));
notificationFailureMode = false;

authRole = 'VIEWER';
authEmail = 'viewer@example.com';
assert.equal(save({ ...reporterBase, email: authEmail }).code, 'ACCESS_DENIED');
authRole = 'ADMIN';
authEmail = 'user@example.com';

assert.match(source, /function qltdWeeklyMasterProgressWriteback_/);
assert.match(source, /if \(update\.actualStart\) changes\.push/);
assert.doesNotMatch(source.match(/function qltdWeeklyMasterProgressWriteback_[\s\S]*?function qltdWeeklyMasterApprovalApplyToMaster_/)[0], /planStart|planFinish|predecessor|baseline/);
const masterApprovalApplySource = source.match(/function qltdWeeklyMasterApprovalApplyToMaster_[\s\S]*?function qltdWeeklyMasterParseCongViec_/)[0];
assert.doesNotMatch(masterApprovalApplySource, /qltdWorkParseDeptTaskSheet_|progressEnd|% Hoan thanh|chayScheduleEngineV1/);
assert.match(masterApprovalApplySource, /writeRange\.setValues\(\[nextValues\]\)/);
assert.match(masterApprovalApplySource, /SpreadsheetApp\.flush\(\)/);
assert.match(masterApprovalApplySource, /MASTER_VERIFY_FAILED/);
assert.match(source, /QLTD_WEEKLY_MASTER_IMPACT_MODE\.KEEP_PLAN/);
assert.match(source, /QLTD_WEEKLY_MASTER_IMPACT_MODE\.PROPAGATE_ACTUAL/);
assert.match(source, /function qltdWeeklyMasterParseCongViec_/);
assert.doesNotMatch(source, /KEEP_CURRENT|RECALCULATE_DEPENDENCIES/);
assert.match(source, /function qltdWeeklyMasterApprovalMarker_/);
assert.match(source, /GANTT_INVALIDATE_FAILED/);
assert.match(source, /ganttRefreshRequired:\s*!!\(sync\.masterWriteback && sync\.masterWriteback\.applied\)/);
assert.match(source, /dashboardRefreshRequired:\s*!!\(sync\.masterWriteback && sync\.masterWriteback\.applied\)/);
assert.match(appSource, /requestId:\s*getWeeklySaveRequestId\(\)/);
assert.match(appSource, /\['TASK_SYNC_PARTIAL', 'MASTER_WRITEBACK_PARTIAL'\]\.includes\(warning\?\.code\)/);
assert.match(appSource, /data-master-impact-mode/);
assert.match(appSource, /value="KEEP_PLAN"/);
assert.match(appSource, /value="PROPAGATE_ACTUAL"/);
assert.match(appSource, /impactMode:\s*approvalStatus === 'APPROVED' \? impactMode : ''/);
assert.match(appSource, /Vui lòng chọn mức ảnh hưởng đến công việc liên kết sau/);
assert.match(appSource, /formatMasterApprovalBackendError/);
assert.match(appSource, /errorCode:/);
assert.match(appSource, /stage:/);
assert.match(appSource, /Tiến độ dự án chưa được tính lại\./);
assert.doesNotMatch(appSource, /KEEP_CURRENT|RECALCULATE_DEPENDENCIES|data-master-dependency-decision|data-master-recovery-plan|Biện pháp bù tiến độ/);
assert.match(appSource, /qltdGanttForceRefreshProjects/);
assert.match(appSource, /qltdGanttDirtyProjects\.add\(projectCode\)/);
assert.match(appSource, /Chỉ khi chọn trạng thái Hoàn thành, hệ thống mới gửi Admin\/PMO phê duyệt/);
assert.match(appSource, /Tỷ lệ hoàn thành chỉ dùng để báo cáo tiến độ/);
assert.doesNotMatch(appSource, /Nếu đề xuất 100%|tiến độ đạt 100%|Number\(progress\.value\)[\s\S]{0,120}Hoàn thành/);
assert.match(source, /const taskStatus = qltdWeeklyTaskUpdatesCanonicalTaskStatus_\(payload\.taskStatus\)/);
assert.doesNotMatch(source, /progressEnd === 100 \? 'Hoàn thành'/);

console.log('weekly-task-updates tests: PASS');
