import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pb = fs.readFileSync(new URL('./pb-detail-ui.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function latestFunction(name, nextName) {
  const start = app.lastIndexOf(`function ${name}`);
  const end = app.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `Không tìm thấy hàm ${name}`);
  return app.slice(start, end);
}

function extractFunction(source, name) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Không tìm thấy hàm ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the function declaration is complete.
    }
  }
  throw new Error(`Hàm ${name} chưa đóng`);
}

const selectedPlan = latestFunction('renderSelectedDeptPlan()', 'renderDeptPlanTab');
assert.match(selectedPlan, /KẾ HOẠCH PHÒNG\/BAN/);
assert.match(selectedPlan, /CẬP NHẬT TUẦN/);
assert.doesNotMatch(selectedPlan, /KPI|getMonthWeekPeriods|renderWeekPeriodsHtml/);

const planTab = latestFunction('renderDeptPlanTab', 'renderMasterDetailCount');
assert.match(planTab, /Bắt đầu KH/);
assert.match(planTab, /Kết thúc KH/);
assert.match(planTab, /Việc chi tiết/);
assert.match(planTab, /data-detail-popup/);
assert.match(planTab, /formatIsoDateVi\(master\.planStart/);
assert.match(planTab, /formatIsoDateVi\(master\.planFinish/);
assert.match(planTab, /Hiển thị \$\{masterList\.visible\.length\}\/\$\{masterList\.total\} mục tiêu/);
assert.match(planTab, /data-dept-master-list-toggle/);
assert.match(planTab, /masterList\.total > 5/);
assert.match(planTab, /dept-overdue-badge/);

const masterListContext = {
  normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
};
vm.createContext(masterListContext);
vm.runInContext([
  extractFunction(app, 'getDeptObjectiveProgress'),
  extractFunction(app, 'getDeptObjectiveStatusClass'),
  extractFunction(app, 'qltdDeptPlanParseIsoDate'),
  extractFunction(app, 'qltdDeptPlanIsOverdue'),
  extractFunction(app, 'qltdDeptPlanSortForDisplay'),
  extractFunction(app, 'qltdDeptPlanBuildListView')
].join('\n'), masterListContext);
const masterItems = [
  { id: 'normal-1', planFinish: '2026-07-01', progress: 20, status: 'Đang thực hiện' },
  { id: 'overdue-recent', planFinish: '2026-06-20', progress: 20, status: 'Đang thực hiện' },
  { id: 'completed-old', planFinish: '2026-01-01', progress: 20, status: 'Hoàn thành' },
  { id: 'overdue-old', planFinish: '2026-01-01', progress: 20, status: 'Đang thực hiện' },
  { id: 'invalid-date', planFinish: '2026-02-30', progress: 20, status: 'Đang thực hiện' },
  { id: 'progress-100', planFinish: '2026-01-01', progress: 100, status: 'Đang thực hiện' },
  { id: 'normal-2', planFinish: '', progress: 0, status: 'Chưa bắt đầu' }
];
const originalMasterOrder = masterItems.map((item) => item.id);
const collapsedMasters = masterListContext.qltdDeptPlanBuildListView(masterItems, false, '2026-06-28');
assert.equal(collapsedMasters.visible.length, 5);
assert.equal(collapsedMasters.total, 7);
assert.equal(collapsedMasters.remaining, 2);
assert.deepEqual(Array.from(collapsedMasters.visible, (item) => item.id), ['overdue-old', 'overdue-recent', 'normal-1', 'completed-old', 'invalid-date']);
assert.deepEqual(masterItems.map((item) => item.id), originalMasterOrder);
const expandedMasters = masterListContext.qltdDeptPlanBuildListView(masterItems, true, '2026-06-28');
assert.equal(expandedMasters.visible.length, 7);
assert.equal(expandedMasters.remaining, 0);
assert.equal(masterListContext.qltdDeptPlanBuildListView(masterItems.slice(0, 5), false, '2026-06-28').total, 5);

const masterToggle = {};
const masterToggleContext = {
  document: {
    querySelectorAll: () => [],
    getElementById: () => null,
    querySelector: () => masterToggle
  },
  qltdReportSubTab: 'plan',
  qltdDeptMasterListExpanded: false,
  renderSelectedDeptPlan: () => { masterToggleContext.renderCount += 1; },
  dispatchDeptPlanRendered: () => {},
  renderCount: 0
};
vm.createContext(masterToggleContext);
vm.runInContext(extractFunction(app, 'bindReportSubTabControls'), masterToggleContext);
masterToggleContext.bindReportSubTabControls({}, {}, {}, {});
masterToggle.onclick();
assert.equal(masterToggleContext.qltdDeptMasterListExpanded, true);
masterToggle.onclick();
assert.equal(masterToggleContext.qltdDeptMasterListExpanded, false);
assert.equal(masterToggleContext.renderCount, 2);

const approvalRoleContext = { normalizeRoleKey: (value) => String(value || '').trim().toUpperCase() };
vm.createContext(approvalRoleContext);
vm.runInContext([
  extractFunction(app, 'getDelegatedDeptManagerScopes'),
  extractFunction(app, 'canApprove')
].join('\n'), approvalRoleContext);
assert.equal(approvalRoleContext.canApprove({ role: 'ADMIN' }), true);
assert.equal(approvalRoleContext.canApprove({ role: 'PMO' }), true);
assert.equal(approvalRoleContext.canApprove({ role: 'EDITOR' }), true);
for (const role of ['REPORTER', 'VIEWER']) assert.equal(approvalRoleContext.canApprove({ role }), false);
assert.equal(approvalRoleContext.canApprove({
  role: 'REPORTER',
  delegatedScopes: [{ projectCode: '37-5.HL', deptCode: 'KINHDOANH', permissionCode: 'DEPT_MANAGER' }]
}), true);
assert.match(app, /admin:\s*'Phê duyệt'/);

const permissionsBinding = latestFunction('applyPermissions', 'getStoredProjectCode');
assert.match(permissionsBinding, /setNavVisibility\(NAV_LABELS\.admin, canApprove\(profile\)\)/);
const adminPanelSource = latestFunction('renderAdminPanel', 'renderAdminMasterApprovals');
assert.match(adminPanelSource, /if \(!canApprove\(\)\)/);
assert.match(adminPanelSource, /yêu cầu đang chờ/);
const approvalLoaderSource = latestFunction('loadAdminMasterApprovals', 'reviewMasterApproval');
assert.match(approvalLoaderSource, /weekly_masterapprovals_get/);
assert.match(approvalLoaderSource, /\{ auth: true \}/);
const approvalReviewSource = latestFunction('reviewMasterApproval', 'markMasterApprovalDataDirty');
assert.match(approvalReviewSource, /qltdAdminApprovalView\.reviewing/);
assert.match(approvalReviewSource, /finally/);
assert.match(approvalReviewSource, /APPROVAL_NOT_PENDING/);
assert.doesNotMatch(approvalReviewSource, /loadAdminMasterApprovals|loadGanttDataForSelectedProject|location\.reload/);
const approvalDirtySource = latestFunction('markMasterApprovalDataDirty', 'escapeHtml');
assert.match(approvalDirtySource, /qltdGanttDirtyProjects\.add/);
assert.doesNotMatch(approvalDirtySource, /loadWeeklyTaskDataForCurrent|loadGanttDataForSelectedProject/);
const pbApprovalLoaderSource = app.slice(app.indexOf('async function loadPbDetailApprovals'), app.indexOf('async function reviewPbDetailApproval'));
assert.match(pbApprovalLoaderSource, /weekly_pbdetailapprovals_get/);
assert.match(pbApprovalLoaderSource, /\{ auth: true \}/);
const pbApprovalReviewSource = extractFunction(app, 'reviewPbDetailApproval');
assert.match(pbApprovalReviewSource, /qltdPbDetailApprovalView\.reviewing/);
assert.match(pbApprovalReviewSource, /APPROVAL_NOT_PENDING/);
assert.match(pbApprovalReviewSource, /finally/);
assert.doesNotMatch(pbApprovalReviewSource, /loadWeeklyTaskDataForCurrent|loadGanttDataForSelectedProject|qltdGanttDirtyProjects|location\.reload/);

function createPbApprovalReviewContext({ result, delayed = false } = {}) {
  let releasePost;
  const context = {
    qltdPbDetailApprovalReviewSeq: 0,
    qltdPbDetailApprovalView: {
      projectCode: 'P1',
      approvals: [{ updateId: 'PB1', projectCode: 'P1', deptCode: 'D1', weekCode: 'W1' }],
      reviewing: null,
      error: ''
    },
    currentUserProfile: { email: 'editor@example.com' },
    postCount: 0,
    postBackendJson: async () => {
      context.postCount += 1;
      if (delayed) await new Promise((resolve) => { releasePost = resolve; });
      return result || { success: true, data: { approval: { updateId: 'PB1', projectCode: 'P1', deptCode: 'D1', weekCode: 'W1', approvalStatus: 'APPROVED' } } };
    },
    getBackendErrorCode: (payload) => payload?.errors?.[0]?.code || payload?.code || '',
    getBackendErrorMessage: (payload, fallback) => payload?.errors?.[0]?.message || payload?.message || fallback,
    applyCount: 0,
    applyWeeklySavedUpdateToView: () => { context.applyCount += 1; return { applied: true }; },
    invalidateWeeklyTaskCacheKey: () => {},
    getWeeklyTaskCacheKey: () => 'P1::D1::W1',
    renderCount: 0,
    renderAdminPanel: () => { context.renderCount += 1; }
  };
  context.releasePost = () => releasePost?.();
  vm.createContext(context);
  vm.runInContext(pbApprovalReviewSource, context);
  return context;
}

const duplicatePbReviewContext = createPbApprovalReviewContext({ delayed: true });
const firstPbReview = duplicatePbReviewContext.reviewPbDetailApproval('PB1', 'APPROVED');
await Promise.resolve();
const duplicatePbReview = duplicatePbReviewContext.reviewPbDetailApproval('PB1', 'REJECTED', 'Trả lại');
assert.equal(duplicatePbReviewContext.postCount, 1);
assert.equal(duplicatePbReviewContext.qltdPbDetailApprovalView.reviewing.approvalStatus, 'APPROVED');
duplicatePbReviewContext.releasePost();
await Promise.all([firstPbReview, duplicatePbReview]);
assert.equal(duplicatePbReviewContext.applyCount, 1);
assert.equal(duplicatePbReviewContext.qltdPbDetailApprovalView.approvals.length, 0);
assert.equal(duplicatePbReviewContext.qltdPbDetailApprovalView.reviewing, null);

const failedPbReviewContext = createPbApprovalReviewContext({ result: { success: false, code: 'WRITE_ERROR', message: 'Không ghi được' } });
await failedPbReviewContext.reviewPbDetailApproval('PB1', 'REJECTED', 'Thiếu dữ liệu');
assert.equal(failedPbReviewContext.qltdPbDetailApprovalView.approvals.length, 1);
assert.equal(failedPbReviewContext.qltdPbDetailApprovalView.reviewing, null);
assert.equal(failedPbReviewContext.qltdPbDetailApprovalView.error, 'Không ghi được');

const approvalRenderContext = {
  qltdAdminApprovalView: {
    reviewing: { updateId: 'A1', approvalStatus: 'APPROVED' }
  },
  escapeHtml: (value) => String(value ?? ''),
  formatIsoDateVi: (value) => String(value || ''),
  formatApprovalStatus: (value) => String(value || ''),
  isNotificationApprovalHighlight: () => false,
  renderMasterApprovalDependencyControls: () => '<CONTROLS>'
};
vm.createContext(approvalRenderContext);
vm.runInContext(extractFunction(app, 'renderAdminMasterApprovals'), approvalRenderContext);
const approvingHtml = approvalRenderContext.renderAdminMasterApprovals([{ updateId: 'A1', approvalStatus: 'PENDING' }]);
assert.match(approvingHtml, /Đang duyệt\.\.\./);
assert.equal((approvingHtml.match(/disabled/g) || []).length, 2);
approvalRenderContext.qltdAdminApprovalView.reviewing = { updateId: 'A1', approvalStatus: 'REJECTED' };
assert.match(approvalRenderContext.renderAdminMasterApprovals([{ updateId: 'A1', approvalStatus: 'PENDING' }]), /Đang trả lại\.\.\./);

function createApprovalReviewContext({ result, delayed = false } = {}) {
  let releasePost;
  const context = {
    qltdAdminApprovalReviewSeq: 0,
    qltdAdminApprovalView: {
      projectCode: 'P1',
      approvals: [{ updateId: 'A1', projectCode: 'P1', deptCode: 'D1', weekCode: 'W1' }],
      reviewing: null,
      reviewDrafts: { A1: { impactMode: 'KEEP_PLAN' } },
      error: ''
    },
    currentUserProfile: { email: 'admin@example.com' },
    window: { confirm: () => true },
    postCount: 0,
    lastPayload: null,
    postBackendJson: async (payload) => {
      context.postCount += 1;
      context.lastPayload = payload;
      if (delayed) await new Promise((resolve) => { releasePost = resolve; });
      return result || { success: true, data: { approval: { updateId: 'A1', projectCode: 'P1', deptCode: 'D1', weekCode: 'W1', approvalStatus: 'APPROVED' } } };
    },
    updateMasterApprovalDraft: (updateId, patch) => {
      context.qltdAdminApprovalView.reviewDrafts[updateId] = {
        ...(context.qltdAdminApprovalView.reviewDrafts[updateId] || {}),
        ...patch
      };
    },
    removeMasterApprovalDraft: (updateId) => { delete context.qltdAdminApprovalView.reviewDrafts[updateId]; },
    getBackendErrorCode: (payload) => payload?.errors?.[0]?.code || payload?.code || '',
    getBackendErrorMessage: (payload, fallback) => payload?.errors?.[0]?.message || payload?.message || fallback,
    dirtyCount: 0,
    markMasterApprovalDataDirty: () => { context.dirtyCount += 1; },
    renderCount: 0,
    renderAdminPanel: () => { context.renderCount += 1; }
  };
  context.releasePost = () => releasePost?.();
  vm.createContext(context);
  vm.runInContext(`async ${approvalReviewSource}`, context);
  return context;
}

const missingImpactContext = createApprovalReviewContext();
await missingImpactContext.reviewMasterApproval('A1', 'APPROVED');
assert.equal(missingImpactContext.postCount, 0);
assert.equal(missingImpactContext.qltdAdminApprovalView.error, 'Vui lòng chọn mức ảnh hưởng đến công việc liên kết sau.');

const duplicateApprovalContext = createApprovalReviewContext({ delayed: true });
const firstApproval = duplicateApprovalContext.reviewMasterApproval('A1', 'APPROVED', '', { impactMode: 'KEEP_PLAN' });
await Promise.resolve();
const duplicateApproval = duplicateApprovalContext.reviewMasterApproval('A1', 'APPROVED', '', { impactMode: 'KEEP_PLAN' });
const oppositeApproval = duplicateApprovalContext.reviewMasterApproval('A1', 'REJECTED', 'Trả lại');
assert.equal(duplicateApprovalContext.postCount, 1);
assert.equal(duplicateApprovalContext.qltdAdminApprovalView.reviewing.approvalStatus, 'APPROVED');
assert.equal(duplicateApprovalContext.lastPayload.impactMode, 'KEEP_PLAN');
duplicateApprovalContext.releasePost();
await Promise.all([firstApproval, duplicateApproval, oppositeApproval]);
assert.equal(duplicateApprovalContext.postCount, 1);
assert.equal(duplicateApprovalContext.qltdAdminApprovalView.approvals.length, 0);
assert.equal(duplicateApprovalContext.qltdAdminApprovalView.reviewing, null);
assert.equal(duplicateApprovalContext.dirtyCount, 1);

const failedApprovalContext = createApprovalReviewContext({
  result: { success: false, errors: [{ code: 'WRITE_ERROR', message: 'Không duyệt được' }] }
});
await failedApprovalContext.reviewMasterApproval('A1', 'REJECTED', 'Cần bổ sung');
assert.equal(failedApprovalContext.qltdAdminApprovalView.approvals.length, 1);
assert.equal(failedApprovalContext.qltdAdminApprovalView.reviewing, null);
assert.equal(failedApprovalContext.qltdAdminApprovalView.error, 'Không duyệt được · errorCode: WRITE_ERROR');
assert.equal(failedApprovalContext.qltdAdminApprovalView.reviewDrafts.A1.reviewReason, 'Cần bổ sung');
assert.equal(failedApprovalContext.qltdAdminApprovalView.reviewDrafts.A1.impactMode, 'KEEP_PLAN');

const alreadyHandledContext = createApprovalReviewContext({
  result: { success: false, errors: [{ code: 'APPROVAL_NOT_PENDING', message: 'Already handled' }] }
});
await alreadyHandledContext.reviewMasterApproval('A1', 'REJECTED', 'Cần bổ sung');
assert.equal(alreadyHandledContext.qltdAdminApprovalView.approvals.length, 0);
assert.equal(alreadyHandledContext.qltdAdminApprovalView.error, 'Yêu cầu này đã được người khác xử lý.');
assert.equal(alreadyHandledContext.qltdAdminApprovalView.reviewing, null);

const staleApprovalContext = createApprovalReviewContext({ delayed: true });
const staleApproval = staleApprovalContext.reviewMasterApproval('A1', 'APPROVED', '', { impactMode: 'PROPAGATE_ACTUAL' });
await Promise.resolve();
assert.equal(staleApprovalContext.lastPayload.impactMode, 'PROPAGATE_ACTUAL');
staleApprovalContext.qltdAdminApprovalView.projectCode = 'P2';
staleApprovalContext.qltdAdminApprovalView.approvals = [{ updateId: 'B1', projectCode: 'P2' }];
staleApprovalContext.releasePost();
await staleApproval;
assert.deepEqual(Array.from(staleApprovalContext.qltdAdminApprovalView.approvals, (item) => item.updateId), ['B1']);
assert.equal(staleApprovalContext.qltdAdminApprovalView.reviewing, null);

const weeklyPanel = latestFunction('renderWeeklyTaskUpdatePanel', 'renderWeeklyTaskList');
assert.match(weeklyPanel, /single-week-toolbar/);
assert.match(weeklyPanel, /Thứ Hai – Chủ nhật/);
assert.match(weeklyPanel, /editorOpen && canUpdateSelected \? renderWeeklySelectedForm/);
assert.match(weeklyPanel, /selected && canUpdateSelected \? renderWeeklySavedSelectionPlaceholder/);
assert.match(weeklyPanel, /qltdWeeklyEditingItemKey === qltdSelectedWeeklyItemKey/);
assert.match(weeklyPanel, /renderStandaloneBudgetWeeklyBlock/);
assert.match(weeklyPanel, /weekly-split-view/);
assert.match(weeklyPanel, /data-weekly-workspace-tab="objectives"/);
assert.match(weeklyPanel, /data-weekly-workspace-tab="tasks"/);
assert.match(weeklyPanel, /weeklyWeekPicker/);
assert.match(weeklyPanel, /weekly-summary-grid/);
assert.match(weeklyPanel, /weekly-loading-state/);
assert.match(weeklyPanel, /data-weekly-retry/);
assert.match(weeklyPanel, /state\.capabilities\?\.canUpdate/);
assert.doesNotMatch(weeklyPanel, /renderWeekPeriodsHtml|renderWeeklyNextItems/);
assert.match(weeklyPanel, /findWeeklySavedUpdate/);
assert.match(weeklyPanel, /updateContext/);
assert.match(weeklyPanel, /weeklyExcelButton/);
assert.ok(weeklyPanel.includes('Xuất Excel'));
assert.ok(weeklyPanel.indexOf('renderWeeklySelectedForm') < weeklyPanel.indexOf('renderStandaloneBudgetWeeklyBlock'));
assert.ok(weeklyPanel.indexOf('renderStandaloneBudgetWeeklyBlock') < weeklyPanel.indexOf('renderWeeklySaveActions'));
assert.ok(weeklyPanel.indexOf('renderWeeklySaveActions') < weeklyPanel.indexOf('renderWeeklySavedUpdates'));
assert.equal((weeklyPanel.match(/renderWeeklySaveActions/g) || []).length, 1);
assert.match(extractFunction(app, 'renderWeeklySavedSelectionPlaceholder'), /Đã lưu cập nhật.*Bấm “Cập nhật” để mở lại biểu mẫu/);

const panelItem = { itemType: 'PB_DETAIL', itemId: 'DT-LOCAL', taskName: 'Việc local' };
const panelSaved = { itemType: 'PB_DETAIL', itemId: 'DT-LOCAL', thisWeekResult: 'Kết quả vừa lưu' };
const weeklyPanelContext = {
  QLTD_WEEKLY_DEPT_ACCESS_MESSAGE: 'Không có quyền',
  qltdWeeklyTaskView: {
    key: 'P1::D1::W1',
    items: [panelItem],
    updates: [panelSaved],
    standaloneBudgetItems: [],
    capabilities: { canUpdate: true, role: 'EDITOR' },
    loading: false,
    error: ''
  },
  qltdWeeklyTaskFilters: { search: 'giữ nguyên', ownership: 'OWNED', statuses: ['NOT_UPDATED'] },
  qltdWeeklyWorkspaceTab: 'tasks',
  qltdSelectedWeeklyItemKey: 'PB_DETAIL:DT-LOCAL',
  qltdWeeklyEditingItemKey: '',
  qltdWeeklyNotificationDetailItemKey: '',
  currentUserProfile: { email: 'user@example.com', role: 'EDITOR' },
  normalizeRoleKey: (value) => String(value || '').trim().toUpperCase(),
  getWeeklyTaskCacheKey: () => 'P1::D1::W1',
  qltdWeeklyBuildWorkspaceModel: () => ({ objectives: [], tasks: [panelItem], visibleTasks: [], notUpdated: 0, pending: 0 }),
  findWeeklySavedUpdate: () => panelSaved,
  qltdWeeklyGetIsoWeekInfo: () => ({ weekNo: 1, year: 2026 }),
  formatRole: () => 'Biên tập',
  qltdWeeklyGetOverdueMetric: () => ({ label: 'Công việc quá hạn', count: 0 }),
  escapeHtml: (value) => String(value ?? ''),
  formatIsoDateVi: (value) => String(value || ''),
  renderWeeklyTaskFilters: (model) => `<FILTER:${model.visibleTasks.length}>`,
  renderWeeklyObjectiveList: () => '',
  renderWeeklyTaskList: (items) => `<ROW:${items[0]?.itemId}:${weeklyPanelContext.qltdSelectedWeeklyItemKey}>`,
  renderWeeklySelectedForm: (_item, saved) => `<FORM:${saved.thisWeekResult}>`,
  renderWeeklyReadonlySelection: () => '<READONLY>',
  renderWeeklyNotificationSelection: () => '<NOTIFICATION-DETAIL>',
  renderStandaloneBudgetWeeklyBlock: () => '',
  renderWeeklySavedUpdates: () => '<HISTORY>'
};
vm.createContext(weeklyPanelContext);
vm.runInContext(`${[
  extractFunction(app, 'canUpdateWeeklyItem'),
  extractFunction(app, 'renderWeeklySavedSelectionPlaceholder'),
  extractFunction(app, 'renderWeeklySaveActions'),
  extractFunction(app.slice(app.lastIndexOf('function renderWeeklyTaskUpdatePanel')), 'renderWeeklyTaskUpdatePanel')
].join('\n')}\nthis.renderPanel = renderWeeklyTaskUpdatePanel;`, weeklyPanelContext);
const closedPanelHtml = weeklyPanelContext.renderPanel({ projectCode: 'P1' }, { deptCode: 'D1' }, {}, { weekId: 'W1', weekStart: '2026-06-22', weekEnd: '2026-06-28' });
assert.match(closedPanelHtml, /ĐÃ LƯU CẬP NHẬT/);
assert.match(closedPanelHtml, /ROW:DT-LOCAL:PB_DETAIL:DT-LOCAL/);
assert.match(closedPanelHtml, /FILTER:1/);
assert.doesNotMatch(closedPanelHtml, /FORM:|saveWeeklyTaskUpdateButton/);
weeklyPanelContext.qltdWeeklyEditingItemKey = 'PB_DETAIL:DT-LOCAL';
const reopenedPanelHtml = weeklyPanelContext.renderPanel({ projectCode: 'P1' }, { deptCode: 'D1' }, {}, { weekId: 'W1', weekStart: '2026-06-22', weekEnd: '2026-06-28' });
assert.match(reopenedPanelHtml, /FORM:Kết quả vừa lưu/);
assert.match(reopenedPanelHtml, /saveWeeklyTaskUpdateButton/);

const weeklyStateSource = app.slice(app.indexOf('function normalizeWeeklyUpdateMatchValue'), app.indexOf('function renderWeeklyTaskUpdatePanel('));
const weeklyStateContext = {};
vm.createContext(weeklyStateContext);
vm.runInContext(`${weeklyStateSource}\nthis.findSaved = findWeeklySavedUpdate; this.effective = getWeeklyEffectiveTaskState;`, weeklyStateContext);
const weeklyItem = { itemType: 'PB_DETAIL', itemId: 'DT-1', progress: 0, status: 'Chưa bắt đầu', actualStart: '', actualFinish: '' };
const weeklySaved = { projectCode: 'P1', deptCode: 'KEHOACH', weekCode: 'WEEK-1', itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 1, taskStatus: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '' };
assert.equal(weeklyStateContext.findSaved([weeklySaved], weeklyItem, { projectCode: 'p1', deptCode: 'kehoach', weekCode: 'week-1' }), weeklySaved);
assert.equal(weeklyStateContext.findSaved([weeklySaved], weeklyItem, { projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-1' }), null);
assert.deepEqual({ ...weeklyStateContext.effective(weeklyItem, weeklySaved) }, { progress: 1, status: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '' });
const rejectedRound = { ...weeklySaved, updateId: 'OLD', updatedAt: '2026-06-20T00:00:00.000Z', rowNumber: 2, approvalStatus: 'REJECTED', progressEnd: 40 };
const pendingRound = { ...weeklySaved, updateId: 'NEW', updatedAt: '2026-06-21T00:00:00.000Z', rowNumber: 3, approvalStatus: 'PENDING', progressEnd: 60 };
assert.equal(weeklyStateContext.findSaved([rejectedRound, pendingRound], weeklyItem, { projectCode: 'P1', deptCode: 'KEHOACH', weekCode: 'WEEK-1' }).updateId, 'NEW');
assert.deepEqual(
  { ...weeklyStateContext.effective(weeklyItem, pendingRound) },
  { progress: 0, status: 'Chưa bắt đầu', actualStart: '', actualFinish: '' }
);

const weekContext = { pad2: (value) => String(value).padStart(2, '0'), qltdSelectedWeekId: 'WEEK-2026-06-29', qltdSelectedWeeklyItemKey: 'PB_DETAIL:DT-1', qltdWeeklyForcedItem: {} };
vm.createContext(weekContext);
vm.runInContext([
  extractFunction(app, 'qltdWeekPeriodFromId'),
  extractFunction(app, 'qltdGetSelectedWeekPeriod'),
  extractFunction(app, 'qltdShiftSelectedWeek'),
  extractFunction(app, 'qltdWeekPeriodFromDateValue'),
  extractFunction(app, 'qltdWeeklyGetIsoWeekInfo')
].join('\n'), weekContext);
weekContext.qltdShiftSelectedWeek(-7);
assert.equal(weekContext.qltdSelectedWeekId, 'WEEK-2026-06-22');
weekContext.qltdShiftSelectedWeek(7);
assert.equal(weekContext.qltdSelectedWeekId, 'WEEK-2026-06-29');
assert.deepEqual({ ...weekContext.qltdWeekPeriodFromDateValue('2026-07-01') }, { weekId: 'WEEK-2026-06-29', weekStart: '2026-06-29', weekEnd: '2026-07-05' });
assert.deepEqual({ ...weekContext.qltdWeekPeriodFromDateValue('2027-01-01') }, { weekId: 'WEEK-2026-12-28', weekStart: '2026-12-28', weekEnd: '2027-01-03' });
assert.deepEqual({ ...weekContext.qltdWeeklyGetIsoWeekInfo({ weekStart: '2026-06-29' }) }, { weekNo: 27, year: 2026 });

const weeklyModelContext = { normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd') };
vm.createContext(weeklyModelContext);
vm.runInContext([
  extractFunction(app, 'normalizeWeeklyUpdateMatchValue'),
  extractFunction(app, 'findWeeklySavedUpdate'),
  extractFunction(app, 'getWeeklyEffectiveTaskState'),
  extractFunction(app, 'normalizeWeeklyStatusKey'),
  extractFunction(app, 'isWeeklyCompletionValue'),
  extractFunction(app, 'qltdWeeklyPersonHasEmail'),
  extractFunction(app, 'qltdWeeklyIsOverdue'),
  extractFunction(app, 'qltdWeeklyIsDue'),
  extractFunction(app, 'qltdWeeklyTaskMatchesStatus'),
  extractFunction(app, 'qltdWeeklySortWorkItems'),
  extractFunction(app, 'qltdWeeklyFilterWorkItems'),
  extractFunction(app, 'qltdWeeklyBuildWorkspaceModel'),
  extractFunction(app, 'qltdWeeklyGetOverdueMetric')
].join('\n'), weeklyModelContext);
const modelContext = { projectCode: 'P1', deptCode: 'D1', weekCode: 'WEEK-2026-06-08' };
const modelWeek = { weekStart: '2026-06-08', weekEnd: '2026-06-14' };
const modelItems = [
  { itemType: 'MASTER', itemId: 'M1', taskName: 'Mục tiêu', planStart: '2026-06-01', planFinish: '2026-06-30', progress: 20 },
  { itemType: 'MASTER', itemId: 'M-OVERDUE', taskName: 'Mục tiêu quá hạn', planStart: '2026-05-01', planFinish: '2026-06-01', progress: 50 },
  { itemType: 'MASTER', itemId: 'M-COMPLETED', taskName: 'Mục tiêu hoàn thành', planStart: '2026-05-01', planFinish: '2026-06-01', progress: 100, status: 'Hoàn thành' },
  { itemType: 'PB_DETAIL', itemId: 'REJECTED', taskName: 'Bị trả lại', planFinish: '2026-07-01', progress: 20, owner: 'a@example.com', coordinator: 'user@example.com' },
  { itemType: 'PB_DETAIL', itemId: 'OVERDUE', taskName: 'Quá hạn', planFinish: '2026-06-01', progress: 20, owner: 'user@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'MISSING', taskName: 'Chưa cập nhật', planFinish: '2026-07-01', progress: 20, owner: 'user@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'DUE', taskName: 'Đến hạn', planFinish: '2026-06-12', progress: 20, owner: 'a@example.com', coordinator: 'user@example.com' },
  { itemType: 'PB_DETAIL', itemId: 'PENDING', taskName: 'Chờ duyệt', planFinish: '2026-07-01', progress: 20, owner: 'a@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'APPROVED', taskName: 'Đã duyệt', planFinish: '2026-07-01', progress: 20, owner: 'a@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'COMPLETED', taskName: 'Hoàn thành', planFinish: '2026-06-01', progress: 100, status: 'Hoàn thành', owner: 'a@example.com', coordinator: '' }
];
const modelUpdates = [
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'REJECTED', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'REJECTED' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'OVERDUE', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'APPROVED' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'DUE', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: '' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'PENDING', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'PENDING' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'APPROVED', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'APPROVED' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'COMPLETED', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'APPROVED' }
];
const originalModelOrder = modelItems.map((item) => item.itemId);
const allModel = weeklyModelContext.qltdWeeklyBuildWorkspaceModel(modelItems, modelUpdates, modelContext, modelWeek, { search: '', ownership: 'ALL', statuses: [] }, 'user@example.com');
assert.deepEqual(Array.from(allModel.objectives, (item) => item.itemId), ['M1', 'M-OVERDUE', 'M-COMPLETED']);
assert.deepEqual(Array.from(allModel.visibleTasks, (item) => item.itemId), ['REJECTED', 'OVERDUE', 'MISSING', 'DUE', 'PENDING', 'APPROVED', 'COMPLETED']);
assert.equal(allModel.objectiveOverdue, 1);
assert.equal(allModel.taskOverdue, 1);
assert.deepEqual({ ...weeklyModelContext.qltdWeeklyGetOverdueMetric(allModel, 'objectives') }, { label: 'Mục tiêu quá hạn', count: 1 });
assert.deepEqual({ ...weeklyModelContext.qltdWeeklyGetOverdueMetric(allModel, 'tasks') }, { label: 'Công việc quá hạn', count: 1 });
assert.match(extractFunction(app, 'renderWeeklyWorkflowBadges'), /qltdWeeklyIsOverdue\(item, saved, week\)/);
assert.equal(allModel.notUpdated, 1);
assert.deepEqual(modelItems.map((item) => item.itemId), originalModelOrder);
const filterIds = (filters) => Array.from(weeklyModelContext.qltdWeeklyFilterWorkItems(modelItems, modelUpdates, modelContext, modelWeek, filters, 'user@example.com'), (item) => item.itemId);
assert.deepEqual(filterIds({ ownership: 'OWNED', statuses: [] }), ['OVERDUE', 'MISSING']);
assert.deepEqual(filterIds({ ownership: 'COORDINATED', statuses: [] }), ['REJECTED', 'DUE']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['NOT_UPDATED'] }), ['MISSING']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['OVERDUE'] }), ['OVERDUE']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['DUE'] }), ['DUE']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['PENDING'] }), ['PENDING']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['REJECTED'] }), ['REJECTED']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['APPROVED'] }), ['OVERDUE', 'APPROVED', 'COMPLETED']);
assert.deepEqual(filterIds({ search: 'khong co', ownership: 'ALL', statuses: [] }), []);

const weeklyBindings = app.slice(app.lastIndexOf('function bindWeeklyTaskUpdateControls'), app.indexOf('const QLTD_WEEKLY_EXPORT_HEADERS'));
assert.match(weeklyBindings, /data-week-nav/);
assert.match(weeklyBindings, /qltdCurrentWeekPeriod\(\)\.weekId/);
assert.match(weeklyBindings, /qltdWeekPeriodFromDateValue/);
assert.match(weeklyBindings, /qltdWeeklyResetTaskFilters/);
assert.match(weeklyBindings, /data-weekly-clear-filters/);
assert.match(weeklyBindings, /data-weekly-filter-status/);
assert.doesNotMatch(weeklyBindings, /loadWeeklyTaskDataForCurrent\(\{ search:/);
const weeklyTabBinding = weeklyBindings.slice(weeklyBindings.indexOf("document.querySelectorAll('[data-weekly-workspace-tab]')"), weeklyBindings.indexOf("document.querySelectorAll('[data-weekly-select]')"));
assert.match(weeklyTabBinding, /renderWeeklyTaskRegion\(\)/);
assert.doesNotMatch(weeklyTabBinding, /loadWeeklyTaskData|fetchBackendJson/);
assert.match(weeklyPanel, /qltdWeeklyGetOverdueMetric\(model, qltdWeeklyWorkspaceTab\)/);

const weeklyRow = latestFunction('renderWeeklyTaskRow', 'getWeeklyTaskBadgeClass');
assert.match(weeklyRow, /getWeeklyEffectiveTaskState\(item, saved\)/);
assert.match(weeklyRow, /effective\.progress/);
assert.match(weeklyRow, /effective\.status/);
assert.match(weeklyRow, /options\.canUpdate/);
assert.match(weeklyRow, /weekly-readonly-action/);
assert.match(weeklyRow, /item\.coordinator/);
assert.match(weeklyRow, /Mục tiêu cha/);
const weeklyList = latestFunction('renderWeeklyTaskList', 'renderWeeklyTaskRow');
assert.match(weeklyList, /Không có kết quả phù hợp với bộ lọc/);
assert.match(weeklyList, /Không có công việc liên quan đến tuần này/);
const objectiveRenderContext = {
  normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Ä‘/g, 'd'),
  findWeeklySavedUpdate: () => null,
  getWeeklyEffectiveTaskState: (item) => ({ progress: item.progress || 0, status: item.status || 'Chưa bắt đầu' }),
  escapeHtml: (value) => String(value ?? ''),
  formatIsoDateVi: (value) => String(value || ''),
  renderWeeklyWorkflowBadges: () => '',
  isNotificationWeeklyHighlight: () => false,
  qltdSelectedWeeklyItemKey: ''
};
vm.createContext(objectiveRenderContext);
vm.runInContext([
  extractFunction(app, 'normalizeWeeklyUpdateMatchValue'),
  extractFunction(app, 'qltdWeeklyCategoryName'),
  extractFunction(app, 'qltdWeeklyDisplayTitle'),
  extractFunction(app, 'renderWeeklyZoneBadge'),
  extractFunction(app, 'canUpdateWeeklyItem'),
  extractFunction(app, 'renderWeeklyObjectiveList')
].join('\n'), objectiveRenderContext);
const readonlyObjective = objectiveRenderContext.renderWeeklyObjectiveList([{ itemType: 'MASTER', itemId: 'M1', taskName: 'Mục tiêu', progress: 20 }], [], {}, {}, false);
assert.match(readonlyObjective, /Chỉ xem/);
assert.doesNotMatch(readonlyObjective, /data-weekly-select/);
const editableObjective = objectiveRenderContext.renderWeeklyObjectiveList([{ itemType: 'MASTER', itemId: 'M1', taskName: 'Mục tiêu', progress: 20 }], [], {}, {}, true);
assert.match(editableObjective, /data-weekly-select="MASTER:M1"/);
const categoryObjective = objectiveRenderContext.renderWeeklyObjectiveList([{ itemType: 'MASTER', itemId: 'M2', taskName: 'Duplicate name', hangMuc: 'LK02', progress: 20 }], [], {}, {}, true);
assert.match(categoryObjective, /Duplicate name — LK02/);
assert.equal(objectiveRenderContext.qltdWeeklyDisplayTitle({ taskName: 'Tên công việc', hangMuc: '' }), 'Tên công việc');
assert.equal(objectiveRenderContext.qltdWeeklyDisplayTitle({ taskName: 'Tên công việc — LK02', hangMuc: 'LK02' }), 'Tên công việc — LK02');
assert.equal(objectiveRenderContext.qltdWeeklyDisplayTitle({ taskName: 'Tên công việc', hangMuc: '', parentMasterTaskCode: 'M-PARENT' }, { hangMuc: 'PARENT' }), 'Tên công việc');

const savedUpdatesSource = app.slice(app.indexOf('function renderWeeklySavedUpdates'), app.indexOf('function renderWeeklyNextItems'));
const savedUpdatesContext = {
  escapeHtml: (value) => String(value ?? ''),
  qltdWeeklyDisplayTitle: (item) => item?.displayTitle || item?.taskName || item?.itemId || '',
  formatApprovalStatus: (value) => String(value || ''),
  formatWeeklyDateTime: (value) => String(value || ''),
  formatWeeklyCurrency: (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`
};
vm.createContext(savedUpdatesContext);
vm.runInContext(`${savedUpdatesSource}\nthis.renderSavedUpdates = renderWeeklySavedUpdates;`, savedUpdatesContext);
const savedStandaloneHtml = savedUpdatesContext.renderSavedUpdates([
  { itemType: 'PB_DETAIL', itemId: 'DT-1', thisWeekResult: 'Done', progressEnd: 10, taskStatus: 'Doing', budgetThisWeek: 0, updatedBy: 'u', updatedAt: 't' }
], [{ itemType: 'PB_DETAIL', itemId: 'DT-1', taskName: 'Task', budgetType: '', budgetItemCode: '' }]);
assert.match(savedStandaloneHtml, /<td>—<\/td>/);
assert.doesNotMatch(savedStandaloneHtml, /0 đ/);
const savedTaskBudgetHtml = savedUpdatesContext.renderSavedUpdates([
  { itemType: 'PB_DETAIL', itemId: 'DT-2', thisWeekResult: 'Done', progressEnd: 10, taskStatus: 'Doing', budgetThisWeek: 500000, updatedBy: 'u', updatedAt: 't' }
], [{ itemType: 'PB_DETAIL', itemId: 'DT-2', taskName: 'Task', budgetType: 'TASK_LINKED', budgetItemCode: 'BI1' }]);
assert.match(savedTaskBudgetHtml, /500\.000 đ/);

const savedMultiTaskBudgetHtml = savedUpdatesContext.renderSavedUpdates([
  { itemType: 'MASTER', itemId: 'D5-036', thisWeekResult: 'Done', progressEnd: 10, taskStatus: 'Doing', updatedBy: 'u', updatedAt: 't' }
], [{ itemType: 'MASTER', itemId: 'D5-036', taskName: 'Task', taskLinkedBudgetItems: [{ actualThisWeek: 400000 }, { actualThisWeek: 600000 }] }]);
assert.match(savedMultiTaskBudgetHtml, /1\.000\.000/);
const readonlyHistoryHtml = savedUpdatesContext.renderSavedUpdates([
  { itemType: 'MASTER', itemId: 'M-READONLY', thisWeekResult: 'Done', progressEnd: 10, taskStatus: 'Doing', updatedBy: 'u', updatedAt: 't' }
], [{ itemType: 'MASTER', itemId: 'M-READONLY', taskName: 'Readonly', canUpdate: false }], true);
assert.doesNotMatch(readonlyHistoryHtml, /data-weekly-item=/);

const weeklyExportStart = app.indexOf('const QLTD_WEEKLY_EXPORT_HEADERS');
const weeklyExportEnd = app.indexOf('async function exportWeeklyReportExcel', weeklyExportStart);
const weeklyExportSource = app.slice(weeklyExportStart, weeklyExportEnd);
const weeklyExportContext = {
  normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Ä‘/g, 'd'),
  normalizeWeeklyUpdateMatchValue: (value) => String(value || '').trim().toUpperCase(),
  getDeptPlanMasterWbs: (master) => String(master?.officialWbs || master?.stt || master?.wbs || '').trim(),
  getWeeklyEffectiveTaskState: (item, update) => ({
    progress: update?.progressEnd ?? item.progress ?? 0,
    status: update?.taskStatus || item.status || 'Chưa cập nhật',
    actualFinish: update?.actualFinish || item.actualFinish || ''
  }),
  qltdWeeklyIsOverdue: (item) => item.eligibleReason === 'OVERDUE',
  getWeeklyPersonDisplay: (value) => String(value || '').replace(/\s*<[^>]*>/g, '').trim(),
  formatApprovalStatus: (value, compact) => compact ? ({ PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Bị trả lại' }[value] || '') : value
};
vm.createContext(weeklyExportContext);
vm.runInContext([
  extractFunction(app, 'qltdWeeklyCategoryName'),
  extractFunction(app, 'qltdWeeklyDisplayTitle'),
  extractFunction(app, 'qltdWeeklyEnrichItemsForDisplay'),
  weeklyExportSource,
  'this.enrichItems = qltdWeeklyEnrichExportItemsWithParentMasters; this.buildExportModel = qltdWeeklyBuildExportModel; this.styleReport = qltdWeeklyStyleReportSheet; this.naturalWbsCompare = qltdWeeklyNaturalWbsCompare; this.planGroupLabel = qltdWeeklyNextPlanGroupLabel; this.exportDateValue = qltdWeeklyExportDateValue; this.exportHeaders = QLTD_WEEKLY_EXPORT_HEADERS; this.nextExportHeaders = QLTD_WEEKLY_NEXT_EXPORT_HEADERS;'
].join('\n'), weeklyExportContext);
assert.ok(weeklyExportContext.naturalWbsCompare('V.2', 'V.10') < 0);
assert.ok(weeklyExportContext.naturalWbsCompare('1.2', '1.11') < 0);
const exportContext = { projectCode: 'P1', deptCode: 'D1', weekCode: 'WEEK-2026-06-22' };
const exportWeek = { weekStart: '2026-06-22', weekEnd: '2026-06-28' };
const exportItems = [
  { itemType: 'MASTER', itemId: 'M10', masterTaskCode: 'M10', wbs: 'V.10', taskName: 'Mục tiêu 10', planStart: '2026-06-01', planFinish: '2026-06-30', progress: 10, status: 'Đang thực hiện' },
  { itemType: 'PB_DETAIL', itemId: 'D10', parentMasterTaskCode: 'M10', wbs: 'V.10.1', taskName: 'Việc 10', planFinish: '2026-06-30' },
  { itemType: 'PB_DETAIL', itemId: 'D2B', parentMasterTaskCode: 'M2', wbs: 'V.2.10', taskName: 'Việc cùng tên', planFinish: '2026-06-27' },
  { itemType: 'PB_DETAIL', itemId: 'D2A', parentMasterTaskCode: ' m2 ', wbs: 'V.2.2', taskName: 'Việc 2', planStart: '2026-06-23', planFinish: '2026-06-26', owner: 'Nguyễn A <a@example.com>' },
  { itemType: 'PB_DETAIL', itemId: 'D2A', parentMasterTaskCode: 'M2', wbs: 'V.2.2', taskName: 'Bản trùng không xuất' },
  { itemType: 'PB_DETAIL', itemId: 'D2C', parentMasterTaskCode: '', masterTaskCode: 'M2', wbs: 'V.2.10', taskName: 'Việc cùng tên', planFinish: '2026-06-25' },
  { itemType: 'MASTER', itemId: 'M3', masterTaskCode: 'M3', wbs: 'V.3', taskName: 'Mục tiêu độc lập' },
  { itemType: 'PB_DETAIL', itemId: 'ORPHAN', parentMasterTaskCode: 'M404', wbs: 'V.99', taskName: 'Việc mồ côi', eligibleReason: 'OVERDUE' }
];
const deptMasters = [
  { masterCode: 'M2', officialWbs: 'V.2', taskName: 'Mục tiêu 2', planStart: '2026-06-02', planFinish: '2026-06-28', progress: 20, status: 'Đang thực hiện', owner: 'Chủ trì M2' },
  { masterCode: 'M10', officialWbs: 'V.10-X', taskName: 'Không được ghi đè MASTER API' },
  { masterCode: 'M99', officialWbs: 'V.99-X', taskName: 'Không được thêm vì không có con tham chiếu' }
];
const exportUpdates = [
  { ...exportContext, itemType: 'PB_DETAIL', itemId: 'D2A', thisWeekResult: 'Bản cũ', progressEnd: 30, approvalStatus: 'PENDING', updatedAt: '2026-06-27T08:00:00+07:00' },
  { ...exportContext, itemType: 'PB_DETAIL', itemId: 'D2A', thisWeekResult: 'Bản mới cùng giờ', progressEnd: 50, taskStatus: 'Đang làm', approvalStatus: 'REJECTED', reviewReason: 'Cần bổ sung', updatedBy: 'user@example.com', updatedAt: '2026-06-28T09:00:00+07:00' },
  { ...exportContext, itemType: 'PB_DETAIL', itemId: 'D2A', thisWeekResult: 'Bản cuối khi bằng giờ', progressEnd: 50, taskStatus: 'Đang làm', approvalStatus: 'REJECTED', issue: 'Vướng mới', recommendation: 'Giải pháp mới', reviewReason: 'Cần bổ sung', updatedBy: 'user@example.com', updatedAt: '2026-06-28T09:00:00+07:00' },
  { projectCode: 'P2', deptCode: 'D1', weekCode: 'WEEK-2026-06-22', itemType: 'PB_DETAIL', itemId: 'D2A', thisWeekResult: 'Sai dự án', updatedAt: '2026-06-29T09:00:00+07:00' }
];
const originalItems = JSON.stringify(exportItems);
const originalUpdates = JSON.stringify(exportUpdates);
const originalMasters = JSON.stringify(deptMasters);
const categoryExportItems = weeklyExportContext.enrichItems([
  { itemType: 'PB_DETAIL', itemId: 'D-CAT', parentMasterTaskCode: 'M-CAT', taskName: 'Detail', zone: 'Zone 1', hangMuc: 'LK02' }
], [{ masterCode: 'M-CAT', taskName: 'Duplicate objective', hangMuc: 'LK02' }]);
assert.equal(categoryExportItems.find((item) => item.itemId === 'M-CAT').taskName, 'Duplicate objective');
assert.equal(categoryExportItems.find((item) => item.itemId === 'M-CAT').hangMuc, undefined);
assert.equal(categoryExportItems.find((item) => item.itemId === 'D-CAT').displayTitle, 'Detail — LK02');
const categoryExportRow = weeklyExportContext.buildExportModel(
  categoryExportItems,
  [],
  exportContext,
  exportWeek
).rows.find((row) => row.item.itemId === 'D-CAT');
assert.equal(categoryExportRow.values[2], 'Zone 1');
assert.equal(categoryExportRow.values[3], 'LK02');
assert.equal(categoryExportRow.values[4], 'Detail — LK02');
const enrichedItems = weeklyExportContext.enrichItems(exportItems, deptMasters);
assert.equal(enrichedItems.filter((item) => item.itemType === 'MASTER' && item.itemId === 'M2').length, 1);
assert.equal(enrichedItems.find((item) => item.itemId === 'M2').wbs, 'V.2');
assert.equal(enrichedItems.find((item) => item.itemId === 'M10').taskName, 'Mục tiêu 10');
assert.equal(enrichedItems.some((item) => item.itemId === 'M99'), false);
const exportModel = weeklyExportContext.buildExportModel(enrichedItems, exportUpdates, exportContext, exportWeek);
assert.deepEqual(Array.from(exportModel.rows, (row) => row.item.itemId), ['M2', 'D2A', 'D2C', 'D2B', 'M3', 'M10', 'D10', 'ORPHAN']);
assert.equal(exportModel.rows.find((row) => row.item.itemId === 'D2A').orphan, false);
assert.equal(exportModel.rows.find((row) => row.item.itemId === 'D2C').orphan, false);
assert.equal(exportModel.rows[0].values[4], 'Mục tiêu 2');
assert.equal(exportModel.rows[1].values[9], 'Bản cuối khi bằng giờ');
assert.equal(exportModel.rows[1].values[10], 50);
assert.equal(exportModel.rows[1].values[12], 'Vướng mới');
assert.equal(exportModel.rows[1].values[13], 'Giải pháp mới');
assert.equal(exportModel.rows.filter((row) => row.values[4] === 'Việc cùng tên').length, 2);
assert.equal(exportModel.rows.at(-1).orphan, true);
assert.equal(exportModel.warnings.length, 1);
assert.equal(Object.prototype.toString.call(exportModel.rows[1].values[7]), '[object Date]');
assert.equal(exportModel.rows[1].values[7].toISOString().slice(0, 10), '2026-06-23');
const dateCases = [
  ['06/07/2026', '2026-07-06'],
  ['07/06/2026', '2026-06-07'],
  ['31/12/2026', '2026-12-31'],
  ['01/02/2027', '2027-02-01'],
  ['29/02/2028', '2028-02-29'],
  ['2026-07-06', '2026-07-06']
];
dateCases.forEach(([input, expectedIso]) => {
  const parsed = weeklyExportContext.exportDateValue(input);
  assert.equal(Object.prototype.toString.call(parsed), '[object Date]');
  assert.equal(parsed.toISOString().slice(0, 10), expectedIso);
});
assert.equal(weeklyExportContext.exportDateValue(''), '');
assert.equal(weeklyExportContext.exportDateValue('31/02/2026'), '');
assert.equal(weeklyExportContext.exportDateValue('06/31/2026'), '');
assert.equal(JSON.stringify(exportItems), originalItems);
assert.equal(JSON.stringify(exportUpdates), originalUpdates);
assert.equal(JSON.stringify(deptMasters), originalMasters);
assert.deepEqual(Array.from(weeklyExportContext.exportHeaders), ['STT', 'WBS', 'Zone', 'Hạng mục', 'Nội dung mục tiêu/công việc', 'Chủ trì', 'Phối hợp', 'Bắt đầu KH', 'Kết thúc KH', 'Kết quả thực hiện trong tuần', 'Tiến độ cuối tuần', 'Trạng thái công việc', 'Vướng mắc/Rủi ro', 'Giải pháp/Đề xuất']);
assert.deepEqual(Array.from(weeklyExportContext.nextExportHeaders), ['STT', 'WBS', 'Zone', 'Hạng mục', 'Nội dung mục tiêu/công việc', 'Chủ trì', 'Phối hợp', 'Bắt đầu KH', 'Kết thúc KH', 'Tiến độ hiện tại', 'Trạng thái hiện tại', 'Nhóm kế hoạch tuần sau', 'Vướng mắc/Rủi ro hiện tại', 'Giải pháp/Đề xuất']);
assert.equal(weeklyExportContext.exportHeaders.length, 14);
assert.equal(weeklyExportContext.nextExportHeaders.length, 14);
const forbiddenExportHeaders = /Cấp|Mục tiêu cha|Kiểm soát báo cáo|Cập nhật cuối|itemId|itemType|masterTaskCode|parentMasterTaskCode|eligibleReason|requestId/i;
assert.doesNotMatch(weeklyExportContext.exportHeaders.concat(weeklyExportContext.nextExportHeaders).join('|'), forbiddenExportHeaders);
assert.doesNotMatch(exportModel.rows.flatMap((row) => row.values).join('|'), /MASTER|PB_DETAIL/);
const blankBusinessRow = exportModel.rows.find((row) => row.item.itemId === 'D2C');
assert.equal(blankBusinessRow.values[5], '');
assert.equal(blankBusinessRow.values[6], '');
assert.equal(blankBusinessRow.values[9], '');
assert.equal(blankBusinessRow.values[12], '');
assert.equal(blankBusinessRow.values[13], '');
assert.doesNotMatch(blankBusinessRow.values.join('|'), /34|sourceIndex|metadata/i);

const nextWeekItems = weeklyExportContext.enrichItems([
  { itemType: 'PB_DETAIL', itemId: 'D2A', parentMasterTaskCode: 'M2', wbs: 'V.2.2', taskName: 'Việc 2 tuần sau', progress: 25, status: 'Đang thực hiện', eligibleReason: 'PLANNED' },
  { itemType: 'PB_DETAIL', itemId: 'NEXT-ORPHAN', parentMasterTaskCode: 'M404', wbs: 'V.99', taskName: 'Orphan tuần sau', eligibleReason: 'OVERDUE' }
], deptMasters);
const nextExportModel = weeklyExportContext.buildExportModel(nextWeekItems, exportUpdates, exportContext, { weekStart: '2026-06-29', weekEnd: '2026-07-05' }, 'NEXT');
assert.deepEqual(Array.from(nextExportModel.rows, (row) => row.item.itemId), ['M2', 'D2A', 'NEXT-ORPHAN']);
assert.equal(nextExportModel.rows[1].values[9], 25);
assert.equal(nextExportModel.rows[1].values[11], 'Bắt đầu/Thực hiện trong tuần sau');
assert.equal(nextExportModel.rows[1].values[12], 'Vướng mới');
assert.equal(nextExportModel.rows[1].values[13], 'Giải pháp mới');
assert.equal(nextExportModel.rows.at(-1).orphan, true);
assert.equal(weeklyExportContext.planGroupLabel('OVERDUE'), 'Quá hạn chuyển tiếp');
assert.equal(weeklyExportContext.planGroupLabel('IN_PROGRESS'), 'Tiếp tục thực hiện');
assert.equal(weeklyExportContext.planGroupLabel('COMPLETED_THIS_WEEK'), 'Dự kiến hoàn thành trong tuần sau');
assert.equal(weeklyExportContext.planGroupLabel('INTERNAL_CODE'), 'Kế hoạch khác');

class MockCell { constructor(value = '') { this.value = value; } }
class MockRow {
  constructor(number, values) { this.number = number; this.values = values; this.cells = Array.from({ length: 14 }, (_, index) => new MockCell(values[index] ?? '')); }
  getCell(index) { return this.cells[index - 1]; }
  eachCell(_options, callback) { this.cells.forEach(callback); }
}
class MockSheet {
  constructor() { this.rows = []; this.columns = Array.from({ length: 14 }, () => ({})); }
  addRow(values) { const row = new MockRow(this.rows.length + 1, values); this.rows.push(row); return row; }
  mergeCells() {}
  get rowCount() { return this.rows.length; }
  getCell(row, column) { return this.rows[row - 1].getCell(column); }
  getColumn(index) { return this.columns[index - 1]; }
}
const exportMetadata = [
  ['Dự án', 'P1'],
  ['Phòng/ban', 'D1'],
  ['Tuần số / năm', 'Tuần 26 / 2026'],
  ['Từ ngày – đến ngày', '22/06/2026 – 28/06/2026'],
  ['Thời điểm xuất', new Date(), 'dd/mm/yyyy hh:mm'],
  ['Người xuất', 'User']
];
const mockSheet = new MockSheet();
weeklyExportContext.styleReport(mockSheet, exportMetadata, exportModel.rows);
assert.equal(mockSheet.views[0].ySplit, 9);
assert.deepEqual({ ...mockSheet.autoFilter.from }, { row: 9, column: 1 });
assert.deepEqual({ ...mockSheet.autoFilter.to }, { row: 9, column: 14 });
assert.equal(mockSheet.getCell(6, 2).numFmt, 'dd/mm/yyyy hh:mm');
assert.notEqual(mockSheet.getCell(6, 2).numFmt, '0"%"');
assert.equal(mockSheet.getCell(10, 2).numFmt, '@');
assert.equal(mockSheet.getCell(10, 8).numFmt, 'dd/mm/yyyy');
assert.equal(mockSheet.getCell(10, 9).numFmt, 'dd/mm/yyyy');
assert.equal(mockSheet.getCell(10, 11).numFmt, '0"%"');
assert.equal(mockSheet.getCell(9, 11).numFmt, undefined);
assert.equal(mockSheet.rows[10].getCell(5).alignment.indent, 1);
const mockNextSheet = new MockSheet();
weeklyExportContext.styleReport(mockNextSheet, exportMetadata, nextExportModel.rows, { headers: weeklyExportContext.nextExportHeaders, progressColumn: 10, statusColumn: 11 });
assert.equal(mockNextSheet.getCell(6, 2).numFmt, 'dd/mm/yyyy hh:mm');
assert.equal(mockNextSheet.getCell(10, 10).numFmt, '0"%"');
assert.equal(mockNextSheet.getCell(9, 10).numFmt, undefined);
const expectedExportWidths = [7, 14, 16, 18, 44, 22, 22, 16, 16, 38, 18, 22, 32, 32];
assert.deepEqual(mockSheet.columns.map((column) => column.width), expectedExportWidths);
assert.deepEqual(mockNextSheet.columns.map((column) => column.width), expectedExportWidths);

const weeklyExcel = latestFunction('exportWeeklyReportExcel()', 'getTodayIsoLocal');
assert.match(weeklyExcel, /fetchBackendJson\('work_listweeklyitems'/);
assert.ok(weeklyExcel.includes("'Kết quả tuần này'"));
assert.ok(weeklyExcel.includes("'Kế hoạch tuần sau'"));
assert.equal((weeklyExcel.match(/addWorksheet\(/g) || []).length, 2);
assert.match(weeklyExcel, /qltdWeeklyTaskView\.items/);
assert.match(weeklyExcel, /qltdWeeklyTaskView\.updates/);
assert.match(weeklyExcel, /dept\.masters/);
assert.match(weeklyExcel, /getNextWeeklyPeriod\(week\)/);
assert.doesNotMatch(weeklyExcel, /qltdWeeklyWorkspaceTab|qltdWeeklyTaskFilters/);
assert.doesNotMatch(weeklyExcel, /search:|group:|standaloneBudgetItems/);
assert.match(weeklyExcel, /Bao_cao_tuan_/);
assert.match(weeklyExcel, /qltdWeb07LoadExcelJs/);
assert.match(weeklyExcel, /qltdWeb07DownloadBlob/);

const exportCalls = [];
const exportDownloads = [];
const exportAlerts = [];
let exportWorkbook = null;
class FakeExportWorkbook {
  constructor() { this.sheetNames = []; this.xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) }; exportWorkbook = this; }
  addWorksheet(name) { this.sheetNames.push(name); return { name }; }
}
const exportExecutionContext = {
  canExportExcel: () => true,
  document: { getElementById: () => ({ disabled: false, textContent: 'Xuất Excel' }) },
  qltdDeptPlanPayload: { projectCode: 'P1', projectName: 'Dự án 1', departments: [{ deptCode: 'D1', deptName: 'Phòng 1', masters: deptMasters }] },
  qltdSelectedDeptCode: 'D1',
  currentUserProfile: { email: 'user@example.com', fullName: 'User' },
  qltdWeeklyTaskView: { items: exportItems, updates: exportUpdates },
  qltdGetSelectedWeekPeriod: () => exportWeek,
  getNextWeeklyPeriod: () => ({ weekId: 'WEEK-2026-06-29', weekStart: '2026-06-29', weekEnd: '2026-07-05' }),
  fetchBackendJson: async (action, params, options) => { exportCalls.push({ action, params, options }); return { success: true, data: { items: nextWeekItems } }; },
  getBackendErrorMessage: (result, fallback) => result.message || fallback,
  qltdWeb07LoadExcelJs: async () => ({ Workbook: FakeExportWorkbook }),
  qltdWeeklyEnrichExportItemsWithParentMasters: (items) => items,
  qltdWeeklyBuildExportModel: () => ({ rows: [], warnings: [] }),
  qltdWeeklyBuildExportMetadata: () => [],
  qltdWeeklyStyleReportSheet: () => {},
  QLTD_WEEKLY_EXPORT_HEADERS: weeklyExportContext.exportHeaders,
  QLTD_WEEKLY_NEXT_EXPORT_HEADERS: weeklyExportContext.nextExportHeaders,
  qltdWeb07SafeFilename: (value) => value,
  qltdWeb07DownloadBlob: (_blob, filename) => exportDownloads.push(filename),
  Blob,
  alert: (message) => exportAlerts.push(message),
  console: { error() {}, warn() {} }
};
vm.createContext(exportExecutionContext);
const weeklyExcelExecutable = app.slice(app.lastIndexOf('async function exportWeeklyReportExcel'), app.indexOf('function getTodayIsoLocal'));
vm.runInContext(`${weeklyExcelExecutable}\nthis.runExport = exportWeeklyReportExcel;`, exportExecutionContext);
assert.equal(exportCalls.length, 0);
await exportExecutionContext.runExport();
assert.equal(exportCalls.length, 1);
assert.equal(JSON.stringify(exportCalls[0]), JSON.stringify({
  action: 'work_listweeklyitems',
  params: { email: 'user@example.com', projectCode: 'P1', deptCode: 'D1', weekCode: 'WEEK-2026-06-29', weekStart: '2026-06-29', weekEnd: '2026-07-05' },
  options: { auth: true }
}));
assert.deepEqual(exportWorkbook.sheetNames, ['Kết quả tuần này', 'Kế hoạch tuần sau']);
assert.equal(exportDownloads.length, 1);
exportExecutionContext.fetchBackendJson = async () => ({ success: false, message: 'Lỗi tuần sau' });
await exportExecutionContext.runExport();
assert.equal(exportDownloads.length, 1);
assert.match(exportAlerts.at(-1), /Lỗi tuần sau/);
const safeFilenameSource = app.slice(app.indexOf('function qltdWeb07SafeFilename'), app.indexOf('function qltdWeb07DownloadBlob'));
const safeFilenameContext = {};
vm.createContext(safeFilenameContext);
vm.runInContext(`${safeFilenameSource}\nthis.safeFilename = qltdWeb07SafeFilename;`, safeFilenameContext);
assert.equal(safeFilenameContext.safeFilename('DA:01/Phòng*Ban?'), 'DA_01_Phong_Ban');
assert.doesNotMatch(safeFilenameContext.safeFilename('DA:01/Phòng*Ban?'), /[<>:"/\\|?*]/);

const weeklyForm = latestFunction('renderWeeklySelectedForm', 'bindWeeklyTaskUpdateControls');
assert.match(weeklyForm, /THÔNG TIN CÔNG VIỆC/);
assert.match(weeklyForm, /KẾT QUẢ THỰC HIỆN TRONG TUẦN/);
assert.match(weeklyForm, /TÌNH TRẠNG CÔNG VIỆC/);
assert.match(weeklyForm, /Mức hoàn thành đến hết tuần/);
assert.match(weeklyForm, /renderWeeklyActualDateLifecycle/);
assert.match(weeklyForm, /weekly-form-close/);
assert.match(weeklyForm, /Chỉ khi chọn trạng thái Hoàn thành/);
assert.match(weeklyForm, /Tỷ lệ hoàn thành chỉ dùng để báo cáo tiến độ/);
assert.equal((weeklyForm.match(/saveWeeklyTaskUpdateButton/g) || []).length, 1);
assert.match(weeklyForm, /Lý do trả lại/);
const weeklySaveActionsSource = extractFunction(app, 'renderWeeklySaveActions');
assert.match(weeklySaveActionsSource, /Gửi duyệt/);
assert.match(weeklySaveActionsSource, /data-default-label/);

const taskBudget = latestFunction('renderWeeklyBudgetBlock', 'renderStandaloneBudgetWeeklyBlock');
assert.match(taskBudget, /data-task-budget-item-code/);
assert.match(taskBudget, /TASK_LINKED/);
assert.match(taskBudget, /getTaskLinkedBudgetItems/);

const standaloneBudget = latestFunction('renderStandaloneBudgetWeeklyBlock', 'normalizeWeeklyBudgetAmount');
assert.match(standaloneBudget, /data-weekly-budget-amount/);
assert.match(standaloneBudget, /data-weekly-budget-note/);
assert.match(standaloneBudget, /Chi thực hiện tuần này/);
assert.match(standaloneBudget, /Thu thực hiện tuần này/);

const budgetPayloadSource = app.slice(app.indexOf('function normalizeWeeklyBudgetAmount'), app.indexOf('function getWeeklySaveRequestId'));
const budgetPayloadContext = {
  qltdWeeklyTaskView: {
    standaloneBudgetItems: [{ budgetItemCode: 'NS-1', allocationCode: 'ALLOC-1', flowType: 'CHI' }],
    budgetDrafts: { 'NS-1': { amount: '500.000', note: 'Chi tuần', dirty: true } }
  },
  getBudgetFlowType: (item) => item.flowType
};
budgetPayloadContext.qltdWeeklyTaskView.budgetDrafts['TL-1'] = { amount: '1.000.000', note: 'Chi mong', dirty: true };
budgetPayloadContext.getTaskLinkedBudgetItems = (item) => item?.taskLinkedBudgetItems || [];
vm.createContext(budgetPayloadContext);
vm.runInContext(`${budgetPayloadSource}\nthis.normalizeAmount = normalizeWeeklyBudgetAmount; this.buildBudgetUpdates = buildWeeklyBudgetUpdates;`, budgetPayloadContext);
assert.equal(budgetPayloadContext.normalizeAmount('500.000').value, 500000);
assert.equal(budgetPayloadContext.normalizeAmount('-1').error, 'Số tiền ngân sách không được âm.');
const builtBudget = budgetPayloadContext.buildBudgetUpdates('P1', 'PTDA', 'WEEK-1');
assert.equal(builtBudget.updates.length, 1);
assert.deepEqual({ ...builtBudget.updates[0] }, { budgetItemCode: 'NS-1', allocationCode: 'ALLOC-1', budgetType: 'DEPT_STANDALONE', flowType: 'CHI', projectCode: 'P1', deptCode: 'PTDA', periodType: 'WEEK', periodCode: 'WEEK-1', actualAmount: 500000, note: 'Chi tuần', masterTaskCode: '', pbTaskCode: '' });
const builtTaskLinkedBudget = budgetPayloadContext.buildBudgetUpdates('P1', 'BQLDA', 'WEEK-1', {
  masterTaskCode: 'D5-036',
  taskLinkedBudgetItems: [{ budgetItemCode: 'TL-1', allocationCode: 'ALLOC-TL', budgetType: 'TASK_LINKED', flowType: 'CHI', masterTaskCode: 'D5-036', pbTaskCode: '' }]
});
assert.deepEqual({ ...builtTaskLinkedBudget.updates[0] }, { budgetItemCode: 'TL-1', allocationCode: 'ALLOC-TL', budgetType: 'TASK_LINKED', flowType: 'CHI', projectCode: 'P1', deptCode: 'BQLDA', periodType: 'WEEK', periodCode: 'WEEK-1', actualAmount: 1000000, note: 'Chi mong', masterTaskCode: 'D5-036', pbTaskCode: '' });
budgetPayloadContext.qltdWeeklyTaskView.budgetDrafts['NS-1'].dirty = false;
budgetPayloadContext.qltdWeeklyTaskView.budgetDrafts['TL-1'].dirty = false;
assert.equal(budgetPayloadContext.buildBudgetUpdates('P1', 'PTDA', 'WEEK-1').updates.length, 0);

const loader = latestFunction('loadWeeklyTaskData(', 'loadWeeklyTaskDataForCurrent');
const weeklyRetryLoader = extractFunction(app, 'qltdWeeklyFetchTaskPayloadWithRetry');
assert.match(loader, /qltdWeeklyFetchTaskPayloadWithRetry/);
assert.equal((weeklyRetryLoader.match(/fetchBackendJson\(/g) || []).length, 2);
assert.match(loader, /itemsResult\.data \|\| itemsResult/);
assert.match(loader, /updatesResult\.data \|\| updatesResult/);
assert.doesNotMatch(loader, /nextResult|getNextWeeklyPeriod/);
assert.doesNotMatch(loader, /qltdWeeklyTaskCache\.delete\(key\)/);
assert.match(loader, /qltdWeeklyTaskCache\.get\(key\)/);
assert.match(loader, /qltdWeeklyTaskInFlight\.get\(key\)/);
assert.match(loader, /qltdWeeklyTaskInFlight\.set\(key, requestPromise\)/);
assert.match(loader, /qltdWeeklyTaskInFlight\.delete\(key\)/);
assert.match(loader, /filters\.force/);
assert.doesNotMatch(loader, /search:|group:|ownership|statuses/);
assert.equal((weeklyRetryLoader.match(/\{ auth: true \}/g) || []).length, 2);
assert.match(loader, /accessDenied/);
assert.match(loader, /qltdWeeklyTaskContextError/);
assert.match(loader, /requestStillCurrent/);
assert.match(weeklyRetryLoader, /QLTD_WEEKLY_TASK_RETRY_DELAYS_MS/);

const weeklyLoaderContext = {
  Date,
  Promise,
  setTimeout,
  performance: { now: () => 0 },
  console: { info() {}, warn() {} },
  QLTD_WEEKLY_TASK_RETRY_DELAYS_MS: [0, 0],
  qltdWeeklyTaskCache: new Map(),
  qltdWeeklyTaskInFlight: new Map(),
  qltdWeeklyTaskCacheVersions: new Map(),
  qltdWeeklyTaskRequestSeq: 0,
  qltdWeeklyTaskSessionVersion: 1,
  qltdWeeklyTaskView: { key: '', items: [], updates: [], budgetDrafts: {} },
  qltdWeeklyForcedItem: null,
  currentUserProfile: { email: 'user@example.com' },
  QLTD_WEEKLY_DEPT_ACCESS_MESSAGE: 'Không có quyền',
  renderCount: 0,
  apiCalls: [],
  renderWeeklyTaskRegion: () => { weeklyLoaderContext.renderCount += 1; },
  getBackendErrorMessage: (result, fallback) => result.message || fallback,
  isDeptAccessDenied: (result) => result?.code === 'ACCESS_DENIED',
  normalizeSearchText: (value) => String(value || '').toLowerCase(),
  fetchBackendJson: async (action, params) => {
    weeklyLoaderContext.apiCalls.push({ action, params });
    if (weeklyLoaderContext.denied) return { success: false, code: 'ACCESS_DENIED', message: 'Không có quyền' };
    if (weeklyLoaderContext.failRefresh) return { success: false, code: 'TEMPORARY', message: 'Lỗi tạm thời' };
    if (weeklyLoaderContext.failOnce && action === 'work_listweeklyitems') {
      weeklyLoaderContext.failOnce = false;
      return { success: false, code: 'TEMPORARY', message: 'Temporary failure' };
    }
    if (action === 'work_listweeklyitems') return { success: true, data: { items: [{ itemType: 'PB_DETAIL', itemId: `${params.projectCode}-${params.deptCode}-${params.weekCode}` }], standaloneBudgetItems: [], capabilities: { canUpdate: true } } };
    return { success: true, data: { updates: [] } };
  }
};
vm.createContext(weeklyLoaderContext);
vm.runInContext([
  extractFunction(app, 'getWeeklyTaskCacheKey'),
  extractFunction(app, 'cloneWeeklyTaskState'),
  extractFunction(app, 'getWeeklyTaskCacheVersion'),
  extractFunction(app, 'invalidateWeeklyTaskCacheKey'),
  extractFunction(app, 'qltdWeeklyTaskAuthReady'),
  extractFunction(app, 'qltdWeeklyTaskContextError'),
  extractFunction(app, 'qltdWeeklyTaskErrorCode'),
  extractFunction(app, 'qltdWeeklyTaskShouldRetry'),
  extractFunction(app, 'qltdWeeklyTaskRetryDelay'),
  extractFunction(app, 'qltdWeeklyTaskNowMs'),
  extractFunction(app, 'qltdWeeklyTaskLog'),
  extractFunction(app, 'qltdWeeklyFetchTaskPayloadWithRetry'),
  extractFunction(app, 'normalizeWeeklyUpdateMatchValue'),
  extractFunction(app, 'qltdWeeklyCategoryName'),
  extractFunction(app, 'qltdWeeklyDisplayTitle'),
  extractFunction(app, 'qltdWeeklyEnrichItemsForDisplay'),
  `async ${loader}`
].join('\n'), weeklyLoaderContext);
const weeklyPayload = (projectCode) => ({ projectCode });
const weeklyDept = (deptCode) => ({ deptCode });
const weeklyPeriod = (weekId) => ({ weekId, weekStart: '2026-06-22', weekEnd: '2026-06-28' });
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload(''), weeklyDept('D1'), weeklyPeriod('W0'), []);
assert.equal(weeklyLoaderContext.apiCalls.length, 0);
assert.match(weeklyLoaderContext.qltdWeeklyTaskView.error, /dự án|du an|project/i);
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W1'), []);
assert.deepEqual(weeklyLoaderContext.apiCalls.map((call) => call.action), ['work_listweeklyitems', 'weekly_taskupdates_get']);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskInFlight.size, 0);
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W1'), []);
assert.equal(weeklyLoaderContext.apiCalls.length, 2);
const forceA = weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W1'), [], { force: true });
const forceB = weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W1'), [], { force: true });
await Promise.all([forceA, forceB]);
assert.equal(weeklyLoaderContext.apiCalls.length, 4);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskInFlight.size, 0);
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W2'), []);
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D2'), weeklyPeriod('W2'), []);
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P2'), weeklyDept('D2'), weeklyPeriod('W2'), []);
assert.equal(weeklyLoaderContext.apiCalls.length, 10);
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W2'), []);
assert.equal(weeklyLoaderContext.apiCalls.length, 10);
assert.equal(weeklyLoaderContext.apiCalls.some((call) => 'search' in call.params || 'group' in call.params), false);
weeklyLoaderContext.failOnce = true;
const beforeRetryApiCalls = weeklyLoaderContext.apiCalls.length;
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W4'), []);
assert.equal(weeklyLoaderContext.apiCalls.length, beforeRetryApiCalls + 4);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.items[0].itemId, 'P1-D1-W4');
weeklyLoaderContext.denied = true;
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W1'), [], { force: true });
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.accessDenied, true);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskCache.has('P1::D1::W1'), false);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskInFlight.size, 0);
weeklyLoaderContext.denied = false;
weeklyLoaderContext.failRefresh = true;
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('P1'), weeklyDept('D1'), weeklyPeriod('W2'), [], { force: true });
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.items.length, 1);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.refreshWarning, 'Lỗi tạm thời');
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.accessDenied, false);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskInFlight.size, 0);
weeklyLoaderContext.failRefresh = false;

const staleResolvers = [];
weeklyLoaderContext.fetchBackendJson = (action, params) => {
  weeklyLoaderContext.apiCalls.push({ action, params });
  if (params.projectCode === 'STALE') return new Promise((resolve) => staleResolvers.push(() => resolve(action === 'work_listweeklyitems' ? { success: true, data: { items: [{ itemId: 'STALE' }], capabilities: {} } } : { success: true, data: { updates: [] } })));
  return Promise.resolve(action === 'work_listweeklyitems' ? { success: true, data: { items: [{ itemId: 'CURRENT' }], capabilities: {} } } : { success: true, data: { updates: [] } });
};
const staleLoad = weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('STALE'), weeklyDept('D1'), weeklyPeriod('W3'), []);
await weeklyLoaderContext.loadWeeklyTaskData(weeklyPayload('CURRENT'), weeklyDept('D1'), weeklyPeriod('W3'), []);
staleResolvers.forEach((resolve) => resolve());
await staleLoad;
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.key, 'CURRENT::D1::W3');
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.items[0].itemId, 'CURRENT');
assert.equal(weeklyLoaderContext.qltdWeeklyTaskInFlight.size, 0);
weeklyLoaderContext.qltdWeeklyTaskCache.set('TEMP', { key: 'TEMP' });
weeklyLoaderContext.qltdWeeklyTaskInFlight.set('TEMP', Promise.resolve());
vm.runInContext(extractFunction(app, 'clearWeeklyTaskSessionState'), weeklyLoaderContext);
weeklyLoaderContext.clearWeeklyTaskSessionState();
assert.equal(weeklyLoaderContext.qltdWeeklyTaskCache.size, 0);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskInFlight.size, 0);
assert.equal(weeklyLoaderContext.qltdWeeklyTaskView.key, '');
const permissionsSource = latestFunction('applyPermissions', 'getStoredProjectCode');
assert.match(permissionsSource, /qltdWeeklyTaskCacheIdentity !== nextWeeklyIdentity/);
assert.match(permissionsSource, /clearWeeklyTaskSessionState\(\)/);
const signedOutSource = latestFunction('renderSignedOut', 'renderDenied');
assert.match(signedOutSource, /clearWeeklyTaskSessionState\(\)/);
const weeklyBinding = latestFunction('bindWeeklyTaskUpdateControls()', 'qltdWeeklyExportItemKey');
assert.equal((weeklyBinding.match(/data-weekly-retry/g) || []).length, 1);
assert.equal((weeklyBinding.match(/loadWeeklyTaskDataForCurrent\(\{ force: true \}\)/g) || []).length, 1);
assert.doesNotMatch(weeklyBinding.slice(weeklyBinding.indexOf("data-weekly-workspace-tab"), weeklyBinding.indexOf("data-weekly-master-details")), /loadWeeklyTaskData/);
assert.doesNotMatch(weeklyBinding.slice(weeklyBinding.indexOf("weeklyTaskSearch"), weeklyBinding.indexOf("const retry")), /loadWeeklyTaskData/);
assert.match(weeklyBinding, /qltdWeeklyEditingItemKey = qltdSelectedWeeklyItemKey/);
const selectButton = { dataset: { weeklySelect: 'PB_DETAIL:DT-LOCAL' }, onclick: null };
const weeklyBindingContext = {
  document: {
    querySelectorAll: (selector) => selector === '[data-weekly-select]' ? [selectButton] : [],
    getElementById: () => null,
    querySelector: () => null
  },
  qltdSelectedWeeklyItemKey: '',
  qltdWeeklyEditingItemKey: '',
  renderCount: 0,
  renderWeeklyTaskRegion: () => { weeklyBindingContext.renderCount += 1; },
  syncWeeklyActualDateLifecycle: () => {},
  syncWeeklyBudgetValidation: () => {}
};
vm.createContext(weeklyBindingContext);
vm.runInContext(extractFunction(app.slice(app.lastIndexOf('function bindWeeklyTaskUpdateControls')), 'bindWeeklyTaskUpdateControls'), weeklyBindingContext);
weeklyBindingContext.bindWeeklyTaskUpdateControls();
selectButton.onclick();
assert.equal(weeklyBindingContext.qltdSelectedWeeklyItemKey, 'PB_DETAIL:DT-LOCAL');
assert.equal(weeklyBindingContext.qltdWeeklyEditingItemKey, 'PB_DETAIL:DT-LOCAL');
assert.equal(weeklyBindingContext.renderCount, 1);

const weeklySave = latestFunction('saveWeeklyTaskUpdate()', 'showWeeklyToast');
assert.match(weeklySave, /verifyWeeklyTaskUpdateSaved\(body\)/);
assert.match(weeklySave, /Đã lưu cập nhật tuần, nhưng phản hồi kết nối bị gián đoạn\./);
assert.match(weeklySave, /error\.backendResult/);
assert.match(weeklySave, /button\?\.dataset\.saving === '1'/);
assert.match(weeklySave, /budgetUpdates: budgetPayload\.updates/);
assert.match(weeklySave, /getWeeklyEffectiveTaskState\(item, currentUpdate\)/);
assert.match(weeklySave, /applyWeeklySavedUpdateToView\(body, data\.update/);
assert.match(weeklySave, /renderWeeklyTaskRegion\(\)/);
assert.match(weeklySave, /qltdWeeklyEditingItemKey = ''/);
assert.doesNotMatch(weeklySave, /renderedStatus/);
assert.doesNotMatch(weeklySave, /status\.textContent = 'Đang lưu\.\.\.'/);
assert.equal((weeklySave.match(/loadWeeklyTaskDataForCurrent\(\{ force: true \}\)/g) || []).length, 1);
assert.match(weeklySave, /budgetPayload\.updates\.length && !localRefresh\.budgetComplete/);
const verifiedSaveBranch = weeklySave.slice(weeklySave.indexOf('if (verified)'));
assert.doesNotMatch(verifiedSaveBranch, /loadWeeklyTaskDataForCurrent/);
assert.match(verifiedSaveBranch, /qltdGanttDirtyProjects\.add\(projectCode\)/);
assert.match(extractFunction(app, 'resetDeptScopedSelectionState'), /qltdWeeklyEditingItemKey = ''/);
assert.match(extractFunction(app, 'clearWeeklyTaskSessionState'), /qltdWeeklyEditingItemKey = ''/);
assert.match(extractFunction(app, 'qltdShiftSelectedWeek'), /qltdWeeklyEditingItemKey = ''/);

function createWeeklySaveContext({ postResult, postError = null, verified = null, delayed = false, role = 'EDITOR', permissionCode = '', budgetUpdates = [] } = {}) {
  const button = { disabled: false, dataset: role === 'REPORTER' ? { defaultLabel: 'Gửi duyệt' } : {}, textContent: role === 'REPORTER' ? 'Gửi duyệt' : 'Lưu báo cáo tuần' };
  const status = { textContent: '' };
  const inputs = {
    saveWeeklyTaskUpdateButton: button,
    weeklyTaskSaveStatus: status,
    weeklyTaskResult: { value: 'Dữ liệu người dùng' },
    weeklyTaskIssue: { value: 'Vướng mắc' },
    weeklyTaskRecommendation: { value: 'Kiến nghị' },
    weeklyTaskBudget: { value: '' },
    weeklyTaskBudgetNote: { value: '' }
  };
  let releasePost;
  const context = {
    qltdWeeklyTaskView: { items: [{ itemType: 'PB_DETAIL', itemId: 'DT-1', progress: 20 }], updates: [], capabilities: { role, permissionCode } },
    qltdSelectedWeeklyItemKey: 'PB_DETAIL:DT-1',
    qltdWeeklyEditingItemKey: 'PB_DETAIL:DT-1',
    qltdDeptPlanPayload: { projectCode: 'P1', departments: [{ deptCode: 'D1' }] },
    qltdSelectedDeptCode: 'D1',
    qltdSelectedWeekId: 'W1',
    qltdWeeklyForcedItem: {},
    qltdWeeklySaveRequestId: 'REQ-1',
    qltdWeeklyTaskFilters: { search: 'không đổi', ownership: 'OWNED', statuses: ['NOT_UPDATED'] },
    qltdWeeklyWorkspaceTab: 'tasks',
    currentUserProfile: { email: 'user@example.com', role },
    normalizeRoleKey: (value) => String(value || '').trim().toUpperCase(),
    qltdWeeklyIsDelegatedManager: (capabilities) => String(capabilities?.permissionCode || '').toUpperCase() === 'DEPT_MANAGER',
    qltdGanttDirtyProjects: new Set(),
    document: { getElementById: (id) => inputs[id] || null },
    window: { confirm: () => true },
    validateWeeklyTaskForm: () => ({ error: '', progressEnd: 30, status: 'Đang thực hiện', dates: { actualStart: '', actualFinish: '', actualStartEdit: '', actualFinishEdit: '' } }),
    buildWeeklyBudgetUpdates: () => ({ error: '', updates: budgetUpdates.slice() }),
    findWeeklySavedUpdate: () => null,
    getWeeklyEffectiveTaskState: () => ({ progress: 20 }),
    getWeeklySaveRequestId: () => 'REQ-1',
    postCount: 0,
    postedBodies: [],
    postBackendJson: async (body) => {
      context.postCount += 1;
      context.postedBodies.push(body);
      if (delayed) await new Promise((resolve) => { releasePost = resolve; });
      if (postError) throw postError;
      return postResult || { success: true, data: { update: { projectCode: 'P1', deptCode: 'D1', weekCode: 'W1', itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 30, approvalStatus: '' }, budget: { savedCount: 0, results: [] } } };
    },
    getBackendErrorMessage: (payload, fallback) => payload?.errors?.[0]?.message || payload?.message || fallback,
    appliedUpdates: [],
    applyWeeklySavedUpdateToView: (_body, update) => {
      context.appliedUpdates.push(update);
      context.qltdWeeklyTaskView.updates = [update];
      return { applied: true, budgetComplete: true };
    },
    getWeeklySyncWarning: () => null,
    toastMessages: [],
    showWeeklyToast: (message) => context.toastMessages.push(message),
    renderCount: 0,
    renderWeeklyTaskRegion: () => { context.renderCount += 1; },
    loadCount: 0,
    loadWeeklyTaskDataForCurrent: async () => { context.loadCount += 1; },
    ganttMarkCount: 0,
    markWeeklyGanttRefreshRequired: async () => { context.ganttMarkCount += 1; },
    verifyCount: 0,
    verifyWeeklyTaskUpdateSaved: async () => { context.verifyCount += 1; return verified; },
    console
  };
  context.releasePost = () => releasePost?.();
  vm.createContext(context);
  vm.runInContext(`async ${weeklySave}`, context);
  return { context, button, status, inputs };
}

const successfulSave = createWeeklySaveContext();
await successfulSave.context.saveWeeklyTaskUpdate();
assert.equal(successfulSave.context.postCount, 1);
assert.equal(successfulSave.context.verifyCount, 0);
assert.equal(successfulSave.context.qltdSelectedWeeklyItemKey, 'PB_DETAIL:DT-1');
assert.equal(successfulSave.context.qltdWeeklyEditingItemKey, '');
assert.equal(successfulSave.context.renderCount, 1);
assert.equal(successfulSave.context.toastMessages.length, 1);
assert.equal(successfulSave.context.loadCount, 0);
assert.equal(successfulSave.context.appliedUpdates.length, 1);
assert.equal(successfulSave.context.qltdWeeklyTaskFilters.search, 'không đổi');
assert.equal(successfulSave.context.qltdWeeklyWorkspaceTab, 'tasks');
assert.equal(successfulSave.status.textContent, '');

const pendingSave = createWeeklySaveContext({
  postResult: { success: true, data: { update: { itemType: 'MASTER', itemId: 'M1', approvalStatus: 'PENDING', officialComplete: false }, budget: { savedCount: 0, results: [] } } }
});
await pendingSave.context.saveWeeklyTaskUpdate();
assert.equal(pendingSave.context.appliedUpdates[0].approvalStatus, 'PENDING');
assert.equal(pendingSave.context.appliedUpdates[0].officialComplete, false);

const reporterSave = createWeeklySaveContext({
  role: 'REPORTER',
  budgetUpdates: [{ budgetItemCode: 'IGNORED-FOR-APPROVAL' }],
  postResult: { success: true, data: { update: { updateId: 'PB-PENDING', projectCode: 'P1', deptCode: 'D1', weekCode: 'W1', itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 30, approvalStatus: 'PENDING' }, budget: { savedCount: 0, results: [] }, ganttRefreshRequired: false } }
});
await reporterSave.context.saveWeeklyTaskUpdate();
assert.equal(reporterSave.context.qltdSelectedWeeklyItemKey, 'PB_DETAIL:DT-1');
assert.equal(reporterSave.context.qltdWeeklyEditingItemKey, '');
assert.equal(reporterSave.context.appliedUpdates[0].approvalStatus, 'PENDING');
assert.equal(reporterSave.context.ganttMarkCount, 0);
assert.equal(reporterSave.context.postedBodies[0].budgetUpdates.length, 0);
assert.equal(reporterSave.context.postedBodies[0].expectedApprovalStatus, 'PENDING');
assert.match(reporterSave.context.toastMessages[0], /Trưởng\/Phó phòng duyệt/);

const delegatedManagerSave = createWeeklySaveContext({
  role: 'REPORTER',
  permissionCode: 'DEPT_MANAGER',
  budgetUpdates: [{ budgetItemCode: 'MANAGER-BUDGET' }]
});
await delegatedManagerSave.context.saveWeeklyTaskUpdate();
assert.equal(delegatedManagerSave.context.postedBodies[0].budgetUpdates.length, 1);
assert.equal(delegatedManagerSave.context.postedBodies[0].expectedApprovalStatus, '');

const backendFailure = createWeeklySaveContext({ postResult: { success: false, message: 'Backend từ chối' } });
await backendFailure.context.saveWeeklyTaskUpdate();
assert.equal(backendFailure.context.qltdWeeklyEditingItemKey, 'PB_DETAIL:DT-1');
assert.equal(backendFailure.inputs.weeklyTaskResult.value, 'Dữ liệu người dùng');
assert.equal(backendFailure.button.disabled, false);
assert.equal(backendFailure.status.textContent, 'Backend từ chối');
assert.equal(backendFailure.context.appliedUpdates.length, 0);
assert.equal(backendFailure.context.toastMessages.length, 0);

const recoveredUpdate = { projectCode: 'P1', deptCode: 'D1', weekCode: 'W1', itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 30 };
const interruptedSave = createWeeklySaveContext({ postError: new Error('Mất kết nối'), verified: recoveredUpdate });
await interruptedSave.context.saveWeeklyTaskUpdate();
assert.equal(interruptedSave.context.verifyCount, 1);
assert.equal(interruptedSave.context.qltdWeeklyEditingItemKey, '');
assert.equal(interruptedSave.context.qltdSelectedWeeklyItemKey, 'PB_DETAIL:DT-1');
assert.equal(interruptedSave.context.toastMessages.length, 1);
assert.equal(interruptedSave.context.renderCount, 1);
assert.equal(interruptedSave.context.loadCount, 0);

const unverifiedSave = createWeeklySaveContext({ postError: new Error('Mất kết nối'), verified: null });
await unverifiedSave.context.saveWeeklyTaskUpdate();
assert.equal(unverifiedSave.context.qltdWeeklyEditingItemKey, 'PB_DETAIL:DT-1');
assert.equal(unverifiedSave.inputs.weeklyTaskResult.value, 'Dữ liệu người dùng');
assert.equal(unverifiedSave.button.disabled, false);
assert.equal(unverifiedSave.context.renderCount, 0);
assert.equal(unverifiedSave.context.toastMessages.length, 0);

const doubleSave = createWeeklySaveContext({ delayed: true });
const firstSubmit = doubleSave.context.saveWeeklyTaskUpdate();
await Promise.resolve();
const secondSubmit = doubleSave.context.saveWeeklyTaskUpdate();
assert.equal(doubleSave.context.postCount, 1);
doubleSave.context.releasePost();
await Promise.all([firstSubmit, secondSubmit]);
assert.equal(doubleSave.context.postCount, 1);

const localApplyContext = {
  qltdWeeklyTaskCache: new Map(),
  qltdWeeklyTaskView: {
    key: 'P1::D1::W1',
    items: [{ itemType: 'PB_DETAIL', itemId: 'T1', progress: 10, status: 'Đang làm', taskLinkedBudgetItems: [{ budgetItemCode: 'TL-1', actualThisWeek: 100, actualCumulative: 500, remainingBudget: 500 }] }],
    updates: [{ updateId: 'OLD', projectCode: 'P1', deptCode: 'D1', weekCode: 'W1', itemType: 'PB_DETAIL', itemId: 'T1', progressEnd: 20, approvalStatus: 'REJECTED' }],
    standaloneBudgetItems: [{ budgetItemCode: 'ST-1', actualThisWeek: 50, actualCumulative: 200, remainingBudget: 800 }],
    budgetDrafts: { 'TL-1': { amount: '300', dirty: true } },
    capabilities: { canUpdate: true }
  },
  normalizeWeeklyUpdateMatchValue: (value) => String(value || '').trim().toUpperCase()
};
vm.createContext(localApplyContext);
vm.runInContext([
  extractFunction(app, 'getWeeklyTaskCacheKey'),
  extractFunction(app, 'cloneWeeklyTaskState'),
  extractFunction(app, 'patchWeeklyBudgetItemFromResult'),
  extractFunction(app, 'patchWeeklyBudgetState'),
  extractFunction(app, 'applyWeeklySavedUpdateToView')
].join('\n'), localApplyContext);
const localPayload = { projectCode: 'P1', deptCode: 'D1', weekCode: 'W1' };
const localSaved = { updateId: 'NEW', ...localPayload, itemType: 'PB_DETAIL', itemId: 'T1', progressEnd: 60, taskStatus: 'Đang thực hiện', approvalStatus: 'PENDING', actualStart: '2026-06-22' };
const localResult = localApplyContext.applyWeeklySavedUpdateToView(localPayload, localSaved, {
  budgetUpdates: [{ budgetItemCode: 'TL-1' }, { budgetItemCode: 'ST-1' }],
  budgetResults: [
    { budgetItemCode: 'TL-1', metrics: { actualThisWeek: 300, cumulative: 700, remaining: 300, approvedBudget: 1000 } },
    { budgetItemCode: 'ST-1', metrics: { actualThisWeek: 80, cumulative: 230, remaining: 770, approvedBudget: 1000 } }
  ],
  clearBudgetDrafts: true
});
assert.deepEqual({ ...localResult }, { applied: true, budgetComplete: true });
assert.equal(localApplyContext.qltdWeeklyTaskView.updates.length, 2);
assert.equal(localApplyContext.qltdWeeklyTaskView.updates[1].progressEnd, 60);
assert.equal(localApplyContext.qltdWeeklyTaskView.updates[1].approvalStatus, 'PENDING');
assert.equal(localApplyContext.qltdWeeklyTaskView.updates[0].approvalStatus, 'REJECTED');
assert.equal(localApplyContext.qltdWeeklyTaskView.items[0].taskLinkedBudgetItems[0].actualCumulative, 700);
assert.equal(localApplyContext.qltdWeeklyTaskView.standaloneBudgetItems[0].remainingBudget, 770);
assert.deepEqual({ ...localApplyContext.qltdWeeklyTaskView.budgetDrafts }, {});
assert.deepEqual(localApplyContext.qltdWeeklyTaskCache.get('P1::D1::W1'), localApplyContext.qltdWeeklyTaskView);
assert.notEqual(localApplyContext.qltdWeeklyTaskCache.get('P1::D1::W1'), localApplyContext.qltdWeeklyTaskView);
localApplyContext.applyWeeklySavedUpdateToView(localPayload, { ...localSaved, progressEnd: 65 }, { clearBudgetDrafts: true });
assert.equal(localApplyContext.qltdWeeklyTaskView.updates.length, 2);
assert.equal(localApplyContext.qltdWeeklyTaskView.updates[1].progressEnd, 65);

const ganttDirtyContext = {
  qltdGanttDirtyProjects: new Set(),
  qltdActiveView: 'report',
  loadCount: 0,
  document: { getElementById: () => ({ value: 'P1' }) },
  getStoredProjectCode: () => '',
  loadGanttDataForSelectedProject: async () => { ganttDirtyContext.loadCount += 1; }
};
vm.createContext(ganttDirtyContext);
const markGanttDirtySource = app.slice(app.indexOf('function markWeeklyGanttRefreshRequired'), app.indexOf('function qltdWeb07GetOrCreateGanttRequest'));
vm.runInContext(`async ${markGanttDirtySource}`, ganttDirtyContext);
await ganttDirtyContext.markWeeklyGanttRefreshRequired('P1');
assert.equal(ganttDirtyContext.qltdGanttDirtyProjects.has('P1'), true);
assert.equal(ganttDirtyContext.loadCount, 0);
ganttDirtyContext.qltdActiveView = 'gantt';
await ganttDirtyContext.markWeeklyGanttRefreshRequired('P1');
assert.equal(ganttDirtyContext.loadCount, 1);
await ganttDirtyContext.markWeeklyGanttRefreshRequired('P2');
assert.equal(ganttDirtyContext.loadCount, 1);
const showViewSource = latestFunction('showWeb07View', 'bindWeb07Navigation');
assert.match(showViewSource, /qltdGanttDirtyProjects\.has\(projectCode\)/);
assert.match(showViewSource, /viewName === 'dashboard'/);
assert.match(showViewSource, /viewName === 'gantt'/);
const ganttLoaderSource = app.slice(app.indexOf('async function qltdWeb07LoadGanttDataForSelectedProject'), app.indexOf('function renderDashboardLoading'));
assert.match(ganttLoaderSource, /qltdGanttDirtyProjects\.delete\(projectCode\)/);
assert.ok(ganttLoaderSource.indexOf('qltdGanttDirtyProjects.delete(projectCode)') < ganttLoaderSource.indexOf('} catch (error)'));
const verifySource = app.slice(app.indexOf('function weeklySavedUpdateMatchesPayload'), app.indexOf('function getWeeklySyncWarning'));
assert.match(verifySource, /weekly_taskupdates_get/);
assert.match(verifySource, /weeklySavedUpdateMatchesPayload/);
const recoveryCalls = [];
const recoveryContext = {
  normalizeWeeklyUpdateMatchValue: (value) => String(value || '').trim().toUpperCase(),
  fetchBackendJson: async (action, params) => {
    recoveryCalls.push({ action, params });
    return { success: true, updates: [weeklySaved] };
  },
  console
};
vm.createContext(recoveryContext);
vm.runInContext(`${verifySource}\nthis.verifySaved = verifyWeeklyTaskUpdateSaved;`, recoveryContext);
const recovered = await recoveryContext.verifySaved({ ...weeklySaved, email: 'user@example.com', thisWeekResult: '' });
assert.equal(recovered.itemId, 'DT-1');
assert.deepEqual(recoveryCalls.map((call) => call.action), ['weekly_taskupdates_get']);
assert.equal(recoveryCalls[0].params.weekCode, 'WEEK-1');

const popup = latestFunction('openDetailStatusPopup', 'renderWeeklyTaskUpdatePanel');
assert.match(popup, /work_getdetailtasks/);
assert.match(popup, /qltdDetailPopupCache/);
assert.match(app, /Chi tiết công việc thuộc mục tiêu/);
assert.match(app, /Chọn để cập nhật/);
assert.match(app, /qltdReportSubTab = 'weekly'/);
assert.match(app, /itemType: 'PB_DETAIL'/);
const summarySource = app.slice(app.indexOf('function getDetailTaskVisualState'), app.indexOf('function renderDetailStatusPopup'));
const summaryContext = {};
vm.createContext(summaryContext);
vm.runInContext(`${summarySource}\nthis.buildSummary = buildDetailStatusSummary;`, summaryContext);
const summary = summaryContext.buildSummary([
  { progress: 100, status: 'Hoàn thành', budgetPlan: 100, budgetActual: 90 },
  { progress: 50, actualStart: '2026-06-01', budgetPlan: 200, budgetActual: 80 },
  { progress: 0, planFinish: '2020-01-01', budgetPlan: 50 },
  { progress: 0, status: 'Chưa bắt đầu' }
]);
assert.deepEqual({ total: summary.total, completed: summary.completed, inProgress: summary.inProgress, notStarted: summary.notStarted, overdue: summary.overdue, progress: summary.progress }, { total: 4, completed: 1, inProgress: 1, notStarted: 1, overdue: 1, progress: 38 });
assert.equal(summary.budgetPlan, 350);
assert.equal(summary.budgetActual, 170);

assert.match(styles, /\.report-subtabs/);
assert.match(styles, /\.detail-status-overlay/);
assert.match(styles, /\.detail-status-badge\.is-overdue/);
assert.match(styles, /\.weekly-task-row/);
assert.match(styles, /\.weekly-split-view/);
assert.match(styles, /\.weekly-actual-date-lifecycle/);
assert.match(styles, /\.weekly-toast/);
assert.match(styles, /\.admin-approval-card/);
assert.match(styles, /\.budget-flow-badge\.is-thu/);
assert.match(styles, /\.master-completion-warning/);
assert.match(styles, /body\.qltd-report-mode \.dept-plan-panel\.compact/);
assert.match(styles, /overflow-x: hidden/);

const contextHandler = pb.slice(pb.indexOf('function qltdPbDetailHandleDeptPlanRendered'), pb.indexOf('function qltdPbDetailBoot'));
assert.doesNotMatch(contextHandler, /qltdPbDetailLoadAssignees/);
assert.match(contextHandler, /qltdPbDetailState\.listExpanded = false/);
assert.match(pb, /qltdPbDetailAssigneeCache = new Map/);
assert.match(pb, /Hiển thị \$\{detailList\.visible\.length\}\/\$\{detailList\.total\} công việc/);
assert.match(pb, /detailList\.total > 5/);
assert.match(pb, /data-pb-detail-action="toggle-list"/);
assert.match(pb, /pb-detail-overdue-badge/);
assert.match(pb, /data-pb-detail-action="edit"/);
assert.match(pb, /\+ Thêm việc chi tiết/);

const detailListContext = {};
vm.createContext(detailListContext);
vm.runInContext([
  extractFunction(pb, 'qltdPbDetailNormalize'),
  extractFunction(pb, 'qltdPbDetailGetStatusClass'),
  extractFunction(pb, 'qltdPbDetailParseIsoDateParts'),
  extractFunction(pb, 'qltdPbDetailIsOverdue'),
  extractFunction(pb, 'qltdPbDetailSortForDisplay'),
  extractFunction(pb, 'qltdPbDetailBuildListView')
].join('\n'), detailListContext);
const detailItems = masterItems.map((item, index) => ({ ...item, detailTaskId: `DT-${index + 1}` }));
const originalDetailOrder = detailItems.map((item) => item.id);
const collapsedDetails = detailListContext.qltdPbDetailBuildListView(detailItems, false, '2026-06-28');
assert.equal(collapsedDetails.visible.length, 5);
assert.equal(collapsedDetails.remaining, 2);
assert.deepEqual(Array.from(collapsedDetails.visible, (item) => item.id), ['overdue-old', 'overdue-recent', 'normal-1', 'completed-old', 'invalid-date']);
assert.deepEqual(detailItems.map((item) => item.id), originalDetailOrder);
assert.equal(detailListContext.qltdPbDetailBuildListView(detailItems, true, '2026-06-28').visible.length, 7);
assert.equal(detailListContext.qltdPbDetailBuildListView(detailItems.slice(0, 5), false, '2026-06-28').total, 5);

const detailToggleContext = {
  qltdPbDetailState: { listExpanded: false },
  qltdPbDetailRender: () => { detailToggleContext.renderCount += 1; },
  renderCount: 0
};
vm.createContext(detailToggleContext);
vm.runInContext(extractFunction(pb, 'qltdPbDetailHandleClick'), detailToggleContext);
const detailToggleButton = { dataset: { pbDetailAction: 'toggle-list' } };
const detailToggleEvent = { target: { closest: () => detailToggleButton } };
detailToggleContext.qltdPbDetailHandleClick(detailToggleEvent);
assert.equal(detailToggleContext.qltdPbDetailState.listExpanded, true);
detailToggleContext.qltdPbDetailHandleClick(detailToggleEvent);
assert.equal(detailToggleContext.qltdPbDetailState.listExpanded, false);
assert.equal(detailToggleContext.renderCount, 2);

const detailResetContext = {
  qltdPbDetailState: { contextKey: 'old', listExpanded: true },
  qltdPbDetailGetContext: () => ({ projectCode: 'P1', deptCode: 'D1', masterTaskCode: 'M2', email: 'user@example.com', key: 'new' }),
  qltdPbDetailEnsurePanel: () => ({}),
  qltdPbDetailLoad: () => { detailResetContext.loaded = true; },
  loaded: false
};
vm.createContext(detailResetContext);
vm.runInContext(extractFunction(pb, 'qltdPbDetailHandleDeptPlanRendered'), detailResetContext);
detailResetContext.qltdPbDetailHandleDeptPlanRendered({ detail: { projectCode: 'P1', deptCode: 'D1', masterTaskCode: 'M2' } });
assert.equal(detailResetContext.qltdPbDetailState.listExpanded, false);
assert.equal(detailResetContext.loaded, true);

const resetDeptState = extractFunction(app, 'resetDeptScopedSelectionState');
assert.match(resetDeptState, /qltdDeptMasterListExpanded = false/);
assert.match(styles, /\.report-summary-section/);
assert.match(styles, /\.report-master-row\.is-overdue/);
assert.match(styles, /\.dept-plan-list-toggle/);

console.log('Report UX/request contract: PASS');
