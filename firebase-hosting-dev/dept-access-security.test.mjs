import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const scopeSource = fs.readFileSync(new URL('../apps-script-dev-api/37_SELF_REGISTRATION_SCOPE.js', import.meta.url), 'utf8');
const planSource = fs.readFileSync(new URL('../apps-script-dev-api/32_DEPT_PLAN_SERVICE.js', import.meta.url), 'utf8');
const permissionSource = fs.readFileSync(new URL('../apps-script-dev-api/61_Work_Permission_Helper.js', import.meta.url), 'utf8');
const workTaskSource = fs.readFileSync(new URL('../apps-script-dev-api/62_Work_Task_Service.js', import.meta.url), 'utf8');
const weeklyReportSource = fs.readFileSync(new URL('../apps-script-dev-api/63_Weekly_Report_Service.js', import.meta.url), 'utf8');
const detailTaskSource = fs.readFileSync(new URL('../apps-script-dev-api/64_PB_Detail_Task_Service.js', import.meta.url), 'utf8');
const weeklySource = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pbDetailUiSource = fs.readFileSync(new URL('./pb-detail-ui.js', import.meta.url), 'utf8');
const stylesSource = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const matches = Array.from(source.matchAll(new RegExp(`(?:^|\\n)(?:async )?function ${name}\\(`, 'g')));
  const lastMatch = matches.at(-1);
  const start = lastMatch ? lastMatch.index + (lastMatch[0].startsWith('\n') ? 1 : 0) : -1;
  assert.ok(start >= 0, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the full declaration parses.
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const unitsByEmail = {
  'scope@example.com': 'UNIT_B'
};
const permissionContext = vm.createContext({
  qltdWorkNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkIsAdminScope_: (user) => ['ADMIN', 'PMO'].includes(String(user?.role || '').toUpperCase()),
  qltdWorkSameDept_: (user, deptCode, dept) => String(user?.deptCode || '').toUpperCase() === String(dept?.masterDeptCode || deptCode || '').toUpperCase(),
  qltdProjectDeptsNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdProjectDeptsGetUserProjectUnitCode_: (email) => unitsByEmail[email] || ''
});
vm.runInContext(extractFunction(permissionSource, 'qltdWorkCanReadDept_'), permissionContext);

const deptA = { deptCode: 'A', masterDeptCode: 'A', projectUnitCode: 'UNIT_A' };
const deptB = { deptCode: 'B', masterDeptCode: 'B', projectUnitCode: 'UNIT_B' };
const deptC = { deptCode: 'C', masterDeptCode: 'C', projectUnitCode: 'UNIT_C' };
assert.equal(permissionContext.qltdWorkCanReadDept_({ role: 'ADMIN', deptCode: 'X' }, 'C', deptC), true);
assert.equal(permissionContext.qltdWorkCanReadDept_({ role: 'PMO', deptCode: 'X' }, 'C', deptC), true);
assert.equal(permissionContext.qltdWorkCanReadDept_({ role: 'EDITOR', deptCode: 'A', email: 'a@example.com' }, 'A', deptA), true);
assert.equal(permissionContext.qltdWorkCanReadDept_({ role: 'REPORTER', deptCode: 'A', email: 'scope@example.com' }, 'B', deptB), true);
assert.equal(permissionContext.qltdWorkCanReadDept_({ role: 'VIEWER', deptCode: 'A', email: 'a@example.com' }, 'C', deptC), false);

const actionRulesSource = scopeSource.match(/const QLTD_DEPT_SCOPE_ACTION_RULES = \{[\s\S]*?\n\};/)?.[0] || '';
assert.match(actionRulesSource, /work_createdetailtask:\s*\['ADMIN', 'PMO', 'EDITOR'\]/);
assert.match(actionRulesSource, /work_updatedetailtask:\s*\['ADMIN', 'PMO', 'EDITOR'\]/);
assert.doesNotMatch(actionRulesSource.match(/work_(?:create|update)detailtask:[^\n]+/g)?.join('\n') || '', /REPORTER/);

let scopedUser = { email: 'editor@example.com', role: 'EDITOR', status: 'ACTIVE', deptCode: 'D1' };
const scopeContext = vm.createContext({
  qltdFirebaseResolveIdentity_: () => ({ success: true, email: scopedUser.email, localId: 'UID-EDITOR' }),
  qltdUsersGetByEmail_: () => ({ ...scopedUser }),
  qltdUsersBuildAuthError_: (code, message, extra = {}) => ({ success: false, errorCode: code, message, ...extra }),
  qltdUsersNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
  qltdMasterDeptCanonicalCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdDeptScopeFindPayloadDept_: (payload) => String(payload?.deptCode || '').trim().toUpperCase(),
  qltdDeptScopeResolveProjectDeptForTarget_: (payload, targetDept) => ({ success: true, projectCode: payload.projectCode, dept: { deptCode: targetDept, deptName: `Dept ${targetDept}`, projectUnitCode: `UNIT_${targetDept}` } }),
  qltdResolveDeptProgressPermission_: (user, projectCode, deptCode, _dept, action) => ({ allowed: user.deptCode === deptCode, source: user.deptCode === deptCode ? 'HOME_DEPT' : '', permissionCode: '', projectCode, deptCode, action }),
  qltdUserProjectDeptAccessDecisionIsDeptManager_: () => false,
  qltdUserProjectDeptAccessActionAllowed_: (action) => ['work_updatetask', 'work_updatedetailtask', 'weekly_taskupdates_save', 'weekly_savedraft', 'weekly_submit'].includes(String(action).toLowerCase()),
  qltdUserProjectDeptAccessValidateDelegatedPayload_: () => null,
  qltdUserProjectDeptAccessLog_: () => ({}),
  qltdDeptScopeTaskOrReportId_: () => '',
  QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION: { DEPT_MANAGER: 'DEPT_MANAGER', UPDATE_PROGRESS: 'UPDATE_PROGRESS' },
  qltdDeptScopeNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdDeptScopeReadRawPayloadDept_: (payload) => String(payload?.deptCode || ''),
  qltdDeptScopeForcePayloadDept_: (payload, deptCode, deptName) => {
    payload.deptCode = deptCode;
    payload.deptName = deptName;
    if (payload.detailTask) {
      payload.detailTask.deptCode = deptCode;
      payload.detailTask.deptName = deptName;
    }
  }
});
vm.runInContext(`${actionRulesSource}\n${extractFunction(scopeSource, 'qltdDeptScopeAuthorizeWrite_')}`, scopeContext);

for (const action of ['work_createdetailtask', 'work_updatedetailtask']) {
  scopedUser = { email: 'reporter@example.com', role: 'REPORTER', status: 'ACTIVE', deptCode: 'D1' };
  const reporterPayload = { action, idToken: 'valid', email: 'spoofed@example.com', actorEmail: 'spoofed@example.com', role: 'EDITOR', projectCode: 'P1', deptCode: 'D1' };
  const reporterResult = scopeContext.qltdDeptScopeAuthorizeWrite_(reporterPayload, action);
  assert.equal(reporterResult.allowed, false);
  assert.equal(reporterResult.response.errorCode, 'ACCESS_DENIED');

  scopedUser = { email: 'editor@example.com', role: 'EDITOR', status: 'ACTIVE', deptCode: 'D1' };
  const editorPayload = { action, idToken: 'valid', email: 'spoofed@example.com', actorEmail: 'spoofed@example.com', role: 'REPORTER', projectCode: 'P1', deptCode: 'D1', detailTask: { deptCode: 'D2' } };
  const editorResult = scopeContext.qltdDeptScopeAuthorizeWrite_(editorPayload, action);
  assert.equal(editorResult.allowed, true);
  assert.equal(editorPayload.email, 'editor@example.com');
  assert.equal(editorPayload.actorEmail, 'editor@example.com');
  assert.equal(editorPayload.deptCode, 'D1');
  assert.equal(editorPayload.detailTask.deptCode, 'D1');

  const otherDeptPayload = { action, idToken: 'valid', projectCode: 'P1', deptCode: 'D2' };
  const otherDeptResult = scopeContext.qltdDeptScopeAuthorizeWrite_(otherDeptPayload, action);
  assert.equal(otherDeptResult.allowed, false);
  assert.equal(otherDeptResult.response.errorCode, action === 'work_updatedetailtask' ? 'PROJECT_DEPT_UPDATE_FORBIDDEN' : 'ACCESS_DENIED');
}

const innerWriteContext = vm.createContext({
  QLTD_PB_DETAIL_TASK_SOURCE: 'pb_detail_tasks_v1',
  QLTD_WORK_WRITE_LOCK_TIMEOUT_MS: 1000,
  currentUser: { role: 'EDITOR', deptCode: 'D1' },
  qltdWorkAuthUser_: (_email, _action, _source, _meta) => ({ user: innerWriteContext.currentUser, error: null }),
  qltdPbDetailResolveContext_: () => ({ projectCode: 'P1', deptCode: 'D1', dept: { masterDeptCode: 'D1' }, meta: {}, warnings: [], error: null }),
  qltdWorkCanManageDept_: (user, deptCode) => ['ADMIN', 'PMO'].includes(user.role) || (user.role === 'EDITOR' && user.deptCode === deptCode),
  qltdCanManageProjectDept_: (user, _projectCode, deptCode) => ['ADMIN', 'PMO'].includes(user.role) || (user.role === 'EDITOR' && user.deptCode === deptCode),
  qltdResolveDeptProgressPermission_: (user, projectCode, deptCode) => ({ allowed: user.deptCode === deptCode, source: user.deptCode === deptCode ? 'HOME_DEPT' : '', projectCode, deptCode }),
  qltdUserProjectDeptAccessValidateDelegatedPayload_: () => null,
  qltdWorkError_: (_source, _action, code) => ({ success: false, errors: [{ code }] }),
  qltdPbDetailBuildSheetContext_: () => ({ warnings: [], error: null }),
  qltdBudgetSafeErrorMessage_: (error) => String(error?.message || error),
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
});
vm.runInContext(extractFunction(detailTaskSource, 'qltdPbDetailWriteWithLock_'), innerWriteContext);
assert.equal(innerWriteContext.qltdPbDetailWriteWithLock_('work_createDetailTask', { email: 'editor@example.com' }, () => ({ success: true })).success, true);
innerWriteContext.currentUser = { role: 'REPORTER', deptCode: 'D1' };
assert.equal(innerWriteContext.qltdPbDetailWriteWithLock_('work_createDetailTask', { email: 'reporter@example.com' }, () => ({ success: true })).errors[0].code, 'ACCESS_DENIED');
innerWriteContext.currentUser = { role: 'EDITOR', deptCode: 'D2' };
assert.equal(innerWriteContext.qltdPbDetailWriteWithLock_('work_updateDetailTask', { email: 'other@example.com' }, () => ({ success: true })).errors[0].code, 'ACCESS_DENIED');

const pbRoleContext = vm.createContext({});
vm.runInContext(`${extractFunction(pbDetailUiSource, 'qltdPbDetailNormalize')}\n${extractFunction(pbDetailUiSource, 'qltdPbDetailCanWrite')}`, pbRoleContext);
for (const role of ['ADMIN', 'PMO', 'EDITOR']) assert.equal(pbRoleContext.qltdPbDetailCanWrite(role), true);
for (const role of ['REPORTER', 'VIEWER', '']) assert.equal(pbRoleContext.qltdPbDetailCanWrite(role), false);

const pbPanel = { innerHTML: '' };
let pbCanWrite = false;
const pbRenderContext = vm.createContext({
  qltdPbDetailState: { masterTask: null, detailTasks: [{ detailTaskId: 'DT-1', taskName: 'Task' }], listExpanded: false, loading: false, message: '', messageType: 'info' },
  qltdPbDetailEnsurePanel: () => pbPanel,
  qltdPbDetailGetContext: () => ({ canWrite: pbCanWrite, canCreate: pbCanWrite, deptCode: 'D1', masterWbs: 'I.1', masterTaskName: 'Master' }),
  qltdPbDetailTodayIso: () => '2026-07-02',
  qltdPbDetailBuildListView: (tasks) => ({ visible: tasks, total: tasks.length, remaining: 0 }),
  qltdPbDetailIsOverdue: () => false,
  qltdPbDetailEscapeHtml: (value) => String(value ?? ''),
  qltdPbDetailFormatTableDate: (value) => String(value || ''),
  qltdPbDetailGetStatusClass: () => '',
  qltdPbDetailFormatNumber: (value) => String(value || ''),
  qltdPbDetailRenderForm: () => ''
});
vm.runInContext(extractFunction(pbDetailUiSource, 'qltdPbDetailRender'), pbRenderContext);
pbRenderContext.qltdPbDetailRender();
assert.doesNotMatch(pbPanel.innerHTML, /data-pb-detail-action="(?:add|edit)"/);
assert.match(pbPanel.innerHTML, /pb-detail-readonly-note/);
pbCanWrite = true;
pbRenderContext.qltdPbDetailRender();
assert.match(pbPanel.innerHTML, /data-pb-detail-action="add"/);
assert.match(pbPanel.innerHTML, /data-pb-detail-action="edit"/);

let spreadsheetOpenCount = 0;
const mappedDepts = [deptA, deptB, deptC].map((dept, index) => ({
  ...dept,
  projectCode: 'P1',
  projectUnitCodeRaw: dept.projectUnitCode,
  deptCodeRaw: dept.deptCode,
  deptName: `Phòng ${dept.deptCode}`,
  status: 'ACTIVE',
  sortOrder: index + 1
}));
const planContext = vm.createContext({
  qltdProjectsGetByCode_: () => ({ projectCode: 'P1', projectName: 'Dự án 1', status: 'ACTIVE', deptSpreadsheetId: 'DEPT_FILE' }),
  qltdProjectsNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdProjectDeptsListActive_: () => mappedDepts,
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdMasterDeptCanonicalCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkIsAdminScope_: permissionContext.qltdWorkIsAdminScope_,
  qltdWorkCanReadDept_: permissionContext.qltdWorkCanReadDept_,
  qltdCanReadProjectDept_: (user, _projectCode, deptCode, dept) => permissionContext.qltdWorkCanReadDept_(user, deptCode, dept),
  qltdResolveDeptReadPermission_: (user, _projectCode, deptCode, dept) => ({ allowed: permissionContext.qltdWorkCanReadDept_(user, deptCode, dept), source: permissionContext.qltdWorkIsAdminScope_(user) ? 'ADMIN_SCOPE' : 'HOME_DEPT', permissionCode: '' }),
  qltdCanUpdateDeptProgress_: (user, _projectCode, deptCode, dept) => permissionContext.qltdWorkCanReadDept_(user, deptCode, dept),
  qltdWorkError_: (source, action, code, message, meta) => ({
    success: false,
    apiStatus: 'ERROR',
    source,
    data: null,
    warnings: [],
    errors: [{ code, message }],
    meta
  }),
  SpreadsheetApp: {
    openById: () => {
      spreadsheetOpenCount += 1;
      return { getSheets: () => [] };
    }
  },
  qltdDeptPlanFindMappedSheet_: (_ss, dept) => ({ getName: () => dept.deptCode }),
  qltdDeptPlanParseSheet_: (sheet) => ({
    deptCode: sheet.getName(),
    sheetName: sheet.getName(),
    masterCount: 1,
    contextCount: 0,
    contexts: [],
    masters: [{ masterCode: `${sheet.getName()}-1` }]
  }),
  qltdDeptPlanFindMappedSortOrder_: (_depts, dept) => mappedDepts.find((item) => item.deptCode === dept.deptCode)?.sortOrder || 9999,
  qltdDeptPlanBuildMasterContextMap_: () => ({ byCode: {}, warning: null }),
  qltdDeptPlanEnrichWithMasterContext_: (deptPlan) => deptPlan,
  qltdDeptPlanReadWeeklyProgressStateMap_: () => ({ byKey: {}, rowsRead: 0, stateCount: 0, sourceRead: false, warning: null }),
  qltdDeptPlanApplyWeeklyProgressStates_: (deptPlan) => deptPlan
});
vm.runInContext(extractFunction(planSource, 'qltdDeptPlanMatchesRequestedDept_'), planContext);
vm.runInContext(extractFunction(planSource, 'qltdDeptPlanListForProject_'), planContext);

const adminPlan = planContext.qltdDeptPlanListForProject_('P1', { role: 'ADMIN', deptCode: 'X', email: 'admin@example.com' }, 'admin@example.com');
assert.deepEqual(Array.from(adminPlan.departments, (dept) => dept.deptCode), ['A', 'B', 'C']);
const pmoPlan = planContext.qltdDeptPlanListForProject_('P1', { role: 'PMO', deptCode: 'X', email: 'pmo@example.com' }, 'pmo@example.com');
assert.equal(pmoPlan.departments.length, 3);
const ownPlan = planContext.qltdDeptPlanListForProject_('P1', { role: 'EDITOR', deptCode: 'A', email: 'a@example.com' }, 'a@example.com');
assert.deepEqual(Array.from(ownPlan.departments, (dept) => dept.deptCode), ['A']);
const scopedPlan = planContext.qltdDeptPlanListForProject_('P1', { role: 'REPORTER', deptCode: 'A', email: 'scope@example.com' }, 'scope@example.com');
assert.deepEqual(Array.from(scopedPlan.departments, (dept) => dept.deptCode), ['A', 'B']);

spreadsheetOpenCount = 0;
const deniedPlan = planContext.qltdDeptPlanListForProject_(
  'P1',
  { role: 'VIEWER', deptCode: 'A', email: 'a@example.com' },
  'a@example.com',
  'C'
);
assert.equal(deniedPlan.success, false);
assert.equal(deniedPlan.data, null);
assert.deepEqual(Object.keys(deniedPlan).sort(), ['apiStatus', 'data', 'errors', 'meta', 'source', 'success', 'warnings']);
assert.equal(deniedPlan.errors[0].code, 'ACCESS_DENIED');
assert.equal(deniedPlan.errors[0].message, 'Bạn không có quyền truy cập dữ liệu của phòng/ban này.');
assert.equal(spreadsheetOpenCount, 0, 'deny must happen before opening the department spreadsheet');

const workTaskContext = vm.createContext({
  QLTD_WORK_TASK_SOURCE: 'work_tasks_v1',
  qltdWorkAuthUser_: () => ({
    email: 'a@example.com',
    user: { role: 'VIEWER', deptCode: 'A', email: 'a@example.com' },
    error: null
  }),
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdBudgetReadProjects_: () => ({
    projects: [{ projectCode: 'P1', status: 'ACTIVE', deptSpreadsheetId: 'DEPT_FILE' }],
    warnings: [],
    error: null
  }),
  qltdBudgetReadProjectDepts_: () => ({ departments: mappedDepts, warnings: [], error: null }),
  qltdBudgetFindProjectDept_: (departments, code) => departments.find((dept) => dept.deptCode === code),
  qltdWorkCanReadDept_: permissionContext.qltdWorkCanReadDept_,
  qltdCanReadProjectDept_: (user, _projectCode, deptCode, dept) => permissionContext.qltdWorkCanReadDept_(user, deptCode, dept),
  qltdWorkError_: planContext.qltdWorkError_
});
vm.runInContext(extractFunction(workTaskSource, 'qltdWorkGetMyTasks_'), workTaskContext);
const deniedMyTasks = workTaskContext.qltdWorkGetMyTasks_({
  email: 'a@example.com',
  projectCode: 'P1',
  deptCode: 'C'
});
assert.equal(deniedMyTasks.data, null);
assert.equal(deniedMyTasks.errors[0].code, 'ACCESS_DENIED');
assert.equal(deniedMyTasks.errors[0].message, 'Bạn không có quyền truy cập dữ liệu của phòng/ban này.');
const unmappedMyTasks = workTaskContext.qltdWorkGetMyTasks_({
  email: 'a@example.com',
  projectCode: 'P1',
  deptCode: 'UNMAPPED'
});
assert.equal(unmappedMyTasks.data, null);
assert.equal(unmappedMyTasks.errors[0].code, 'ACCESS_DENIED');

const weeklyContext = vm.createContext({
  QLTD_WEEKLY_TASK_UPDATE_SOURCE: 'weekly_task_updates_v1',
  qltdWorkNormalizeWeekCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkResolveProjectDept_: () => ({ projectCode: 'P1', deptCode: 'C', dept: deptC, warnings: [], error: null }),
  qltdWorkCanReadDept_: permissionContext.qltdWorkCanReadDept_,
  qltdCanReadProjectDept_: (user, _projectCode, deptCode, dept) => permissionContext.qltdWorkCanReadDept_(user, deptCode, dept),
  qltdWorkError_: planContext.qltdWorkError_
});
vm.runInContext(`${extractFunction(weeklySource, 'qltdWeeklyTaskUpdatesCanonicalWeekCode_')}\n${extractFunction(weeklySource, 'qltdWeeklyTaskUpdatesResolveScope_')}`, weeklyContext);
const deniedWeekly = weeklyContext.qltdWeeklyTaskUpdatesResolveScope_(
  'work_listweeklyitems',
  { weekCode: 'WEEK-2026-06-22' },
  { email: 'a@example.com', user: { role: 'REPORTER', deptCode: 'A', email: 'a@example.com' } }
);
assert.equal(deniedWeekly.error.data, null);
assert.equal(deniedWeekly.error.errors[0].code, 'ACCESS_DENIED');
assert.equal(deniedWeekly.error.errors[0].message, 'Bạn không được cấp quyền truy cập vào dữ liệu phòng/ban này.');

weeklyContext.qltdWorkResolveProjectDept_ = () => ({
  error: planContext.qltdWorkError_(
    'weekly_task_updates_v1',
    'work_listweeklyitems',
    'PROJECT_DEPT_NOT_ASSIGNED',
    'not assigned',
    {}
  )
});
const missingDeptWeekly = weeklyContext.qltdWeeklyTaskUpdatesResolveScope_(
  'work_listweeklyitems',
  { weekCode: 'WEEK-2026-06-22', deptCode: 'C' },
  { email: 'a@example.com', user: { role: 'REPORTER', deptCode: 'A', email: 'a@example.com' } }
);
assert.equal(missingDeptWeekly.error.data, null);
assert.equal(missingDeptWeekly.error.errors[0].code, 'ACCESS_DENIED');
assert.equal(missingDeptWeekly.error.errors[0].message, 'Bạn không được cấp quyền truy cập vào dữ liệu phòng/ban này.');

assert.match(extractFunction(workTaskSource, 'qltdWorkGetDeptTasks_'), /PROJECT_DEPT_NOT_ASSIGNED[\s\S]*ACCESS_DENIED/);
assert.match(extractFunction(weeklyReportSource, 'qltdWeeklyGetDeptReports_'), /PROJECT_DEPT_NOT_ASSIGNED[\s\S]*ACCESS_DENIED/);
assert.match(extractFunction(detailTaskSource, 'qltdWorkGetDetailTasks_'), /PROJECT_DEPT_NOT_ASSIGNED[\s\S]*ACCESS_DENIED/);
assert.match(extractFunction(detailTaskSource, 'qltdWorkAuditDetailTaskParentFinish_'), /PROJECT_DEPT_NOT_ASSIGNED[\s\S]*ACCESS_DENIED/);

assert.match(apiSource, /QLTD_DEV_DEPT_READ_ACTIONS/);
assert.match(apiSource, /qltdFirebaseResolveIdentity_\(params, true\)/);
assert.match(apiSource, /params\.email = readIdentity\.email/);
assert.match(extractFunction(apiSource, 'qltdDevApiListDeptPlans_'), /qltdWorkAuthUser_/);

const cardContext = vm.createContext({
  qltdSelectedMasterCode: 'MASTER-1',
  escapeHtml: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  getDeptPlanMasterWbs: (master) => String(master?.wbs || ''),
  formatIsoDateVi: (value) => value ? String(value).split('-').reverse().join('/') : '',
  normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'),
  qltdDeptMasterListExpanded: false,
  qltdDeptPlanTodayIso: () => '2026-06-28',
  qltdDeptPlanBuildListView: (items) => ({ visible: items.slice(0, 5), total: items.length, remaining: Math.max(0, items.length - 5) }),
  qltdDeptPlanIsOverdue: () => false,
  renderMasterCompletionWarning: () => '',
  renderMasterDetailCount: () => '0 việc',
  renderDeptObjectiveContext: () => ''
});
vm.runInContext(extractFunction(appSource, 'getDeptObjectiveProgress'), cardContext);
vm.runInContext(extractFunction(appSource, 'getDeptObjectiveStatusClass'), cardContext);
vm.runInContext(extractFunction(appSource, 'renderDeptPlanTab'), cardContext);
const longName = 'Mục tiêu có tên rất dài để kiểm tra giao diện không bị tràn khỏi card trên màn hình hẹp';
const cardHtml = cardContext.renderDeptPlanTab({}, {}, [{
  masterCode: 'MASTER-1',
  wbs: 'I.1',
  taskName: longName,
  planStart: '2026-06-01',
  planFinish: '2026-12-31',
  status: 'Đang thực hiện',
  progress: 45
}], {
  masterCode: 'MASTER-1',
  wbs: 'I.1',
  taskName: longName,
  planStart: '2026-06-01',
  planFinish: '2026-12-31',
  status: 'Đang thực hiện',
  progress: 45
});
assert.match(cardHtml, /Mục tiêu đang chọn/);
assert.match(cardHtml, /dept-objective-card/);
assert.match(cardHtml, /I\.1/);
assert.match(cardHtml, /01\/06\/2026/);
assert.match(cardHtml, /31\/12\/2026/);
assert.match(cardHtml, /dept-objective-status is-in-progress/);
assert.match(cardHtml, /role="progressbar"/);
assert.match(cardHtml, /aria-valuenow="45"/);
assert.ok(cardHtml.includes(longName));

const resetSource = extractFunction(appSource, 'resetDeptScopedSelectionState');
assert.match(resetSource, /qltdWeeklyTaskView =/);
assert.doesNotMatch(resetSource, /qltdWeeklyTaskCache\.clear\(\)/);
assert.match(resetSource, /qltdDetailPopupCache\.clear\(\)/);
assert.match(resetSource, /qltd:dept-plan-rendered/);
const weeklyLoader = extractFunction(appSource, 'loadWeeklyTaskData');
assert.match(weeklyLoader, /\{ auth: true \}/);
assert.match(weeklyLoader, /qltdWeeklyTaskCache\.get/);
assert.match(weeklyLoader, /accessDenied/);
const planLoader = extractFunction(appSource, 'loadDeptPlansForSelectedProject');
assert.match(planLoader, /resetDeptScopedClientState\(\)/);
assert.match(planLoader, /fetchBackendJson\('listDeptPlans', \{ projectCode \}, \{ auth: true \}\)/);
const detailPopup = extractFunction(appSource, 'openDetailStatusPopup');
assert.doesNotMatch(detailPopup, /qltdDetailPopupCache\.has/);
assert.match(detailPopup, /renderDeptPlanUnavailable\(error\.backendResult\)/);

assert.match(stylesSource, /\.dept-objective-card/);
assert.match(stylesSource, /\.dept-objective-hierarchy/);
assert.match(stylesSource, /\.dept-objective-progress-track/);
assert.match(stylesSource, /\.dept-access-denied/);
assert.match(stylesSource, /@media \(max-width: 560px\)/);

console.log('Department access security and objective card tests: PASS');
