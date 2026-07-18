import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../apps-script-dev-api/74_Admin_Approved_Objective_Service.js', import.meta.url), 'utf8');

function extractFunction(source, name, nextName) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.ok(end > start, `${name} boundary must exist`);
  return source.slice(start, end);
}

// Frontend visibility: exact ADMIN + MASTER + APPROVED + unique task/milestone source only.
const visibilityContext = {
  currentUserProfile: { role: 'ADMIN' },
  normalizeRoleKey: (value) => String(value || '').trim().toUpperCase()
};
visibilityContext.canAdmin = () => String(visibilityContext.currentUserProfile?.role || '').toUpperCase() === 'ADMIN';
vm.createContext(visibilityContext);
vm.runInContext(`${extractFunction(appSource, 'canEditApprovedObjective', 'renderWeeklyObjectiveList')}
this.canEdit = canEditApprovedObjective;`, visibilityContext);
const approvedMaster = { itemType: 'MASTER', itemId: 'M1', sourceMappingUnique: true, sourceRowType: 'TASK' };
const approved = { approvalStatus: 'APPROVED' };
const viewContext = { projectCode: 'P1' };
assert.equal(visibilityContext.canEdit(approvedMaster, approved, viewContext, { role: 'ADMIN' }), true);
for (const role of ['PMO', 'EDITOR', 'REPORTER', 'VIEWER']) {
  visibilityContext.currentUserProfile.role = role;
  assert.equal(visibilityContext.canEdit(approvedMaster, approved, viewContext, { role }), false, `${role} must not see edit`);
}
visibilityContext.currentUserProfile.role = 'ADMIN';
assert.equal(visibilityContext.canEdit({ ...approvedMaster, itemType: 'PB_DETAIL' }, approved, viewContext, { role: 'ADMIN' }), false);
assert.equal(visibilityContext.canEdit(approvedMaster, { approvalStatus: 'PENDING' }, viewContext, { role: 'ADMIN' }), false);
assert.equal(visibilityContext.canEdit({ ...approvedMaster, sourceRowType: 'STRUCTURAL_GROUP' }, approved, viewContext, { role: 'ADMIN' }), false);
assert.equal(visibilityContext.canEdit({ ...approvedMaster, sourceMappingUnique: false }, approved, viewContext, { role: 'ADMIN' }), false);

const renderObjectives = extractFunction(appSource, 'renderWeeklyObjectiveList', 'ensureAdminApprovedObjectiveEditor');
assert.match(renderObjectives, /data-admin-edit-objective/);
assert.match(renderObjectives, />Sửa mục tiêu</);

// API errors retain the editor and form data; success refreshes Gantt, Dashboard-derived cache and objective data.
function createFrontendSaveContext(postResult) {
  const elements = {
    adminObjectiveTaskName: { value: 'Mục tiêu mới' },
    adminObjectiveDuration: { value: '5' },
    adminObjectivePredecessor: { value: '' },
    adminObjectiveAnchorStart: { value: '2026-07-20' },
    adminObjectiveReason: { value: 'Điều chỉnh kế hoạch' },
    adminObjectiveSaveStatus: { textContent: '' },
    saveAdminApprovedObjectiveButton: { disabled: false, textContent: 'Lưu thay đổi' }
  };
  const calls = { close: 0, toast: 0, gantt: 0, weekly: 0, dashboardDelete: 0 };
  const context = {
    console,
    qltdAdminObjectiveEditState: {
      projectCode: 'P1', masterTaskCode: 'M1', loading: false, saving: false, error: '',
      objective: { version: 'v1-current' }, requestId: 'ADMIN-OBJ-12345678'
    },
    canAdmin: () => true,
    document: { getElementById: (id) => elements[id] || null },
    window: { confirm: () => true },
    getAdminObjectiveRequestId: () => 'ADMIN-OBJ-12345678',
    postBackendJson: async () => postResult,
    getBackendErrorMessage: () => 'API failure',
    closeAdminApprovedObjectiveEditor: () => { calls.close += 1; },
    showWeeklyToast: () => { calls.toast += 1; },
    qltdDepartmentDashboardCache: { delete: () => { calls.dashboardDelete += 1; } },
    qltdGanttDirtyProjects: { add: () => {} },
    qltdGanttForceRefreshProjects: { add: () => {} },
    loadGanttDataForSelectedProject: async () => { calls.gantt += 1; },
    loadWeeklyTaskDataForCurrent: async () => { calls.weekly += 1; }
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(appSource, 'saveAdminApprovedObjective', 'renderWeeklyTaskList')}
this.save = saveAdminApprovedObjective;`, context);
  return { context, elements, calls };
}

let frontend = createFrontendSaveContext({ success: false, errorCode: 'WRITE_ERROR' });
await frontend.context.save();
assert.equal(frontend.calls.close, 0);
assert.equal(frontend.calls.toast, 0);
assert.equal(frontend.elements.adminObjectiveTaskName.value, 'Mục tiêu mới');
assert.equal(frontend.elements.adminObjectiveSaveStatus.textContent, 'API failure');
assert.equal(frontend.elements.saveAdminApprovedObjectiveButton.disabled, false);

frontend = createFrontendSaveContext({ success: true, data: { scheduleChanged: true } });
await frontend.context.save();
assert.equal(frontend.calls.close, 1);
assert.equal(frontend.calls.toast, 1);
assert.equal(frontend.calls.dashboardDelete, 1);
assert.equal(frontend.calls.gantt, 1);
assert.equal(frontend.calls.weekly, 1);

const saveFrontend = extractFunction(appSource, 'saveAdminApprovedObjective', 'renderWeeklyTaskList');
assert.match(saveFrontend, /Việc sửa mục tiêu có thể làm thay đổi tiến độ các công việc liên quan\. Hệ thống sẽ tự động tính lại tiến độ dự án\. Bạn có xác nhận tiếp tục không\?/);
assert.match(saveFrontend, /admin_update_approved_objective/);
assert.match(extractFunction(appSource, 'openAdminApprovedObjectiveEditor', 'getAdminObjectiveRequestId'), /admin_get_approved_objective/);

function iso(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

class MockSheet {
  constructor(raw) { this.raw = raw; }
  getLastRow() { return 5; }
  getLastColumn() { return this.raw.length; }
  getRange(row, column, numRows = 1, numColumns = 1) {
    assert.equal(row, 5);
    const sheet = this;
    return {
      getValue: () => sheet.raw[column - 1],
      setValue(value) { sheet.raw[column - 1] = value; return this; },
      getValues: () => [sheet.raw.slice(column - 1, column - 1 + numColumns)],
      setValues(values) {
        values[0].forEach((value, index) => { sheet.raw[column - 1 + index] = value; });
        return this;
      }
    };
  }
}

function createBackendRuntime(options = {}) {
  const raw = Array(23).fill('');
  raw[0] = 'M1';
  raw[1] = '1';
  raw[6] = '1';
  raw[7] = 'Mục tiêu cũ';
  raw[8] = 'BQLDA';
  raw[9] = 3;
  raw[10] = '';
  raw[11] = new Date(2026, 6, 18);
  raw[12] = new Date(2026, 6, 20);
  raw[17] = 'Hoàn thành';
  raw[18] = new Date(2026, 6, 18);
  raw[19] = new Date(2026, 6, 20);
  raw[20] = 'approval note';
  raw[21] = '2026-07-18T00:00:00.000Z';
  raw[22] = 'Có';
  const sheet = new MockSheet(raw);
  const calls = { engine: 0, cache: 0, dirty: 0, lock: 0, release: 0, flush: 0 };
  let role = options.role || 'ADMIN';
  let approvalStatus = options.approvalStatus || 'APPROVED';
  let recalcFails = false;
  const resolved = {
    project: { projectCode: 'P1', status: 'ACTIVE', masterSpreadsheetId: 'MASTER-1' },
    spreadsheet: { id: 'MASTER-1' },
    sheet,
    parsed: { columns: { updateNote: 20, updatedAt: 21 } },
    task: { masterTaskCode: 'M1', rowNumber: 5, raw },
    sourceTask: { id: 'REF-1', code: 'M1', wbs: 'I.1', rowType: 'TASK', sourceRow: 5 },
    rowType: 'TASK',
    error: null
  };
  const context = {
    console,
    Logger: { log: () => {} },
    Math,
    Date,
    QLTD_WEEKLY_TASK_APPROVAL_STATUS: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' },
    QLTD_WORK_WRITE_LOCK_TIMEOUT_MS: 10000,
    QLTD_PROJECT_SCHEDULE_STATE_V1: { DIRTY: 'DIRTY', CLEAN: 'CLEAN' },
    SCHEDULE_ENGINE_V1: {
      START_ROW: 5,
      COL: { MA_CONG_VIEC_MAU: 1, MA_CAU_TRUC: 2, REF: 7, TASK_NAME: 8, DURATION: 10, PREDECESSOR: 11, START: 12, END: 13, ERROR: 17, STATUS: 18, ACTUAL_START: 19, ACTUAL_FINISH: 20, ADJUST_LINK: 23 }
    },
    qltdFirebaseResolveIdentity_: () => ({ success: true, email: 'admin@example.com' }),
    qltdWorkAuthUser_: () => ({ user: { email: 'admin@example.com', role, status: 'ACTIVE' }, email: 'admin@example.com', error: null }),
    qltdWorkNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
    qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdScheduleProjectCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdWeeklyTaskUpdatesNormalizeTaskCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdWeeklyTaskUpdatesDate_: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null,
    qltdBudgetFormatDate_: iso,
    qltdWorkNowIso_: () => '2026-07-18T10:00:00.000Z',
    qltdWorkAppendTaskNote_: (before, note) => `${before || ''} | ${note}`,
    qltdWorkError_: (source, action, code, message, meta, warnings, extra) => ({ success: false, source, action, data: null, warnings: warnings || [], errors: [{ code, message, ...(extra || {}) }], meta }),
    qltdWorkOk_: (source, action, data, warnings, meta) => ({ success: true, source, action, data, warnings: warnings || [], errors: [], meta }),
    qltdWeeklyTaskUpdatesRead_: () => ({ updates: [{
      itemType: 'MASTER', itemId: 'M1', projectCode: 'P1', approvalStatus,
      reviewedAt: '2026-07-18T09:00:00.000Z', reviewedBy: 'approver@example.com', rowNumber: 2
    }], error: null }),
    qltdScheduleGetProjectState_: () => ({ scheduleState: 'CLEAN' }),
    LockService: { getScriptLock: () => ({
      tryLock: () => { calls.lock += 1; return true; },
      releaseLock: () => { calls.release += 1; }
    }) },
    SpreadsheetApp: { flush: () => { calls.flush += 1; } },
    qltdScheduleMarkProjectDirty_: () => { calls.dirty += 1; return { scheduleState: 'DIRTY' }; },
    qltdProjectScheduleRecalculateLocked_: () => {
      calls.engine += 1;
      if (recalcFails) return { success: false, ok: false, errorCode: 'SCHEDULE_ENGINE_FAILED', stage: 'ENGINE', message: 'engine failed' };
      calls.cache += 1;
      return { success: true, ok: true, scheduleState: 'CLEAN', processedTaskCount: 1 };
    },
    qltdGanttInvalidateCache_: () => { calls.cache += 1; return { success: true }; },
    laDongCongViecScheduleV1_: () => true,
    chuanHoaRefV1_: (value) => String(value || '').trim(),
    phanTichTienNhiemV1_: (value, currentRef) => {
      const text = String(value || '').trim();
      if (!text) return { items: [], errors: [] };
      const ref = text.replace(/(FS|SS|FF).*$/i, '');
      return ref === currentRef ? { items: [], errors: [`ERR_SELF_LOOP: ${ref}`] } : { items: [{ ref }], errors: [] };
    },
    danhDauLoiVongLapV1_: () => {}
  };
  vm.createContext(context);
  vm.runInContext(`${serviceSource}
this.adminApi = {
  get: qltdAdminObjectiveGet_, update: qltdAdminObjectiveUpdate_,
  validate: qltdAdminObjectiveValidatePayload_, resolveTarget: qltdAdminObjectiveResolveTarget_,
  error: qltdAdminObjectiveError_, version: qltdAdminObjectiveVersion_
};`, context);
  context.qltdAdminObjectiveResolveTarget_ = () => resolved;
  return {
    context,
    api: context.adminApi,
    raw,
    calls,
    resolved,
    setRole: (value) => { role = value; },
    setApprovalStatus: (value) => { approvalStatus = value; },
    setRecalcFails: (value) => { recalcFails = value; }
  };
}

function updatePayload(runtime, patch = {}) {
  return {
    action: 'admin_update_approved_objective',
    projectCode: 'P1',
    masterTaskCode: 'M1',
    requestId: 'ADMIN-OBJ-12345678',
    expectedVersion: runtime.api.version(runtime.raw),
    reason: 'Điều chỉnh theo quyết định ADMIN',
    updates: { taskName: 'Mục tiêu mới', durationDays: 5, predecessor: '', anchorStart: '2026-07-18' },
    ...patch
  };
}

// Backend rejects every non-ADMIN role, missing reason, unapproved state and forbidden fields.
let backend = createBackendRuntime();
for (const role of ['PMO', 'EDITOR', 'REPORTER', 'VIEWER']) {
  backend.setRole(role);
  assert.equal(backend.api.update(updatePayload(backend)).errorCode, 'FORBIDDEN');
}
backend.setRole('ADMIN');
assert.equal(backend.api.update(updatePayload(backend, { reason: '' })).errorCode, 'ADJUSTMENT_REASON_REQUIRED');
backend.setApprovalStatus('PENDING');
assert.equal(backend.api.update(updatePayload(backend)).errorCode, 'OBJECTIVE_NOT_APPROVED');
backend.setApprovalStatus('APPROVED');
let result = backend.api.update(updatePayload(backend, { updates: { actualStart: '2026-07-01' } }));
assert.equal(result.errorCode, 'OBJECTIVE_FIELDS_FORBIDDEN');
assert.deepEqual(Array.from(result.errors[0].forbiddenFields), ['updates.actualStart']);

// Schedule-driving edits write only whitelisted planning cells, run one recalc/cache and are idempotent.
backend = createBackendRuntime();
const protectedBefore = { code: backend.raw[0], ref: backend.raw[6], finish: backend.raw[12], status: backend.raw[17], actualStart: backend.raw[18], actualFinish: backend.raw[19], impact: backend.raw[22] };
const firstPayload = updatePayload(backend);
result = backend.api.update(firstPayload);
assert.equal(result.success, true);
assert.equal(result.data.scheduleChanged, true);
assert.equal(backend.calls.engine, 1);
assert.equal(backend.calls.cache, 1);
assert.equal(backend.calls.dirty, 1);
assert.equal(backend.raw[7], 'Mục tiêu mới');
assert.equal(backend.raw[9], 5);
assert.deepEqual({ code: backend.raw[0], ref: backend.raw[6], finish: backend.raw[12], status: backend.raw[17], actualStart: backend.raw[18], actualFinish: backend.raw[19], impact: backend.raw[22] }, protectedBefore);
result = backend.api.update(firstPayload);
assert.equal(result.success, true);
assert.equal(result.data.idempotent, true);
assert.equal(backend.calls.engine, 1, 'same requestId must not recalculate twice');

// Stale form data is rejected before any new write.
result = backend.api.update(updatePayload(backend, { requestId: 'ADMIN-OBJ-STALE-1', expectedVersion: 'v1-stale' }));
assert.equal(result.errorCode, 'OBJECTIVE_STALE');

// Content-only edit skips the engine but still invalidates Gantt cache.
backend = createBackendRuntime();
result = backend.api.update(updatePayload(backend, {
  requestId: 'ADMIN-OBJ-CONTENT-1',
  updates: { taskName: 'Chỉ đổi tên' }
}));
assert.equal(result.success, true);
assert.equal(result.data.scheduleChanged, false);
assert.equal(backend.calls.engine, 0);
assert.equal(backend.calls.cache, 1);

// Dependency cycle is rejected before write/recalculation.
backend = createBackendRuntime();
backend.context.qltdAdminObjectiveValidateDependencies_ = (resolved, predecessor, action, meta) => ({
  error: backend.context.qltdAdminObjectiveError_(action, 'DEPENDENCY_CYCLE', 'VALIDATION', 'cycle', meta)
});
result = backend.api.update(updatePayload(backend, { updates: { predecessor: '1FS', durationDays: 5, taskName: 'Cycle', anchorStart: '' } }));
assert.equal(result.errorCode, 'DEPENDENCY_CYCLE');
assert.equal(backend.calls.engine, 0);

// Recalculation failure never returns success and leaves a retryable WRITE marker.
backend = createBackendRuntime();
backend.setRecalcFails(true);
const failingPayload = updatePayload(backend, { requestId: 'ADMIN-OBJ-FAIL-0001' });
result = backend.api.update(failingPayload);
assert.equal(result.success, false);
assert.equal(result.errorCode, 'SCHEDULE_ENGINE_FAILED');
assert.match(String(backend.raw[20]), /WRITE:SCHEDULE/);
assert.doesNotMatch(String(backend.raw[20]), /:SUCCESS\]/);
backend.setRecalcFails(false);
result = backend.api.update(failingPayload);
assert.equal(result.success, true);
assert.equal(result.data.resumed, true);
assert.match(String(backend.raw[20]), /:SUCCESS\]/);

// Real source resolver uses projectCode + masterTaskCode, requires one source row and blocks group rows.
function createResolverRuntime(ganttData) {
  const raw = Array(23).fill(''); raw[0] = 'M1';
  const sheet = { getSheetByName: undefined };
  const spreadsheet = { getSheetByName: (name) => name === 'Cong_viec' ? sheet : null };
  const context = {
    console, Logger: { log: () => {} }, Date, Math,
    QLTD_WEEKLY_TASK_APPROVAL_STATUS: { APPROVED: 'APPROVED' },
    qltdWorkError_: (source, action, code, message, meta, warnings, extra) => ({ success: false, errors: [{ code, message, ...(extra || {}) }], meta }),
    qltdWorkOk_: () => ({ success: true }),
    qltdScheduleProjectCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdWeeklyTaskUpdatesNormalizeTaskCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdProjectsGetByCode_: () => ({ projectCode: 'P1', status: 'ACTIVE', masterSpreadsheetId: 'MASTER-1' }),
    SpreadsheetApp: { openById: () => spreadsheet },
    qltdWeeklyMasterParseCongViec_: () => ({ tasks: [{ masterTaskCode: 'M1', rowNumber: 5, raw }], columns: {}, error: null }),
    qltdWeeklyTaskUpdatesFindSingleMasterTask_: (tasks, code) => code === 'M1' ? { task: tasks[0], error: null } : { error: { code: 'MASTER_TASK_NOT_FOUND', message: 'missing' } },
    SCHEDULE_ENGINE_V1: { COL: { REF: 7, TASK_NAME: 8, DURATION: 10, PREDECESSOR: 11, START: 12, END: 13 } },
    qltdGanttBuildDataForProject_: () => ({ success: true, data: ganttData })
  };
  vm.createContext(context);
  vm.runInContext(`${serviceSource}
this.resolve = qltdAdminObjectiveResolveTarget_;`, context);
  return context;
}

let resolver = createResolverRuntime([{ code: 'M1', id: '1', rowType: 'TASK', sourceRow: 5 }]);
assert.equal(resolver.resolve('P1', 'M1', 'test', {}).rowType, 'TASK');
resolver = createResolverRuntime([
  { code: 'M1', id: '1', rowType: 'TASK', sourceRow: 5 },
  { code: 'M1', id: '2', rowType: 'TASK', sourceRow: 6 }
]);
assert.equal(resolver.resolve('P1', 'M1', 'test', {}).error.errorCode, 'MASTER_TASK_DUPLICATED');
resolver = createResolverRuntime([{ code: 'M1', id: '1', rowType: 'STRUCTURAL_GROUP', sourceRow: 5 }]);
assert.equal(resolver.resolve('P1', 'M1', 'test', {}).error.errorCode, 'OBJECTIVE_ROW_TYPE_FORBIDDEN');

// Dispatcher routes bypass shared department write scope and the service never writes protected columns.
const postRoute = apiSource.indexOf("action === 'admin_update_approved_objective'");
const sharedScope = apiSource.indexOf('qltdDeptScopeAuthorizeWrite_');
assert.ok(postRoute >= 0 && postRoute < sharedScope);
assert.match(apiSource, /admin_get_approved_objective/);
assert.doesNotMatch(serviceSource, /getRange\([^\n]*col\.END\)\.setValue/);
assert.doesNotMatch(serviceSource, /getRange\([^\n]*col\.ACTUAL_(?:START|FINISH)\)\.setValue/);
assert.doesNotMatch(serviceSource, /Ke_hoach_goc|baseline/i);

console.log('Admin approved objective tests: PASS');
