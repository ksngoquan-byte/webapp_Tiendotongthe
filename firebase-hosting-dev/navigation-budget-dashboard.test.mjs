import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function latestFunction(name, nextName) {
  const start = app.lastIndexOf(`function ${name}`);
  const end = nextName ? app.indexOf(`function ${nextName}`, start + 1) : app.length;
  assert.ok(start >= 0 && end > start, `Khong tim thay ham ${name}`);
  return app.slice(start, end);
}

assert.match(app, /workDashboard: 'Dashboard c\\u00f4ng vi\\u1ec7c'/);
assert.match(app, /budgetDashboard: 'Dashboard ng\\u00e2n s\\u00e1ch'/);
assert.match(app, /help: 'H\\u01b0\\u1edbng d\\u1eabn s\\u1eed d\\u1ee5ng'/);
assert.match(app, /report: 'L\\u1eadp & c\\u1eadp nh\\u1eadt c\\u00f4ng vi\\u1ec7c'/);

const permissions = latestFunction('normalizePermissions', 'setApiStatus');
assert.match(permissions, /budgetDashboard: !!permissions\.budgetDashboard \|\| canViewCore/);
assert.match(permissions, /help: !!permissions\.help \|\| canViewCore/);
assert.match(permissions, /reportUpdate: !!permissions\.reportUpdate \|\| canViewCore/);

const applyPermissions = latestFunction('applyPermissions', 'getStoredProjectCode');
assert.match(applyPermissions, /ensureTopNavigation\(\)/);
assert.match(applyPermissions, /NAV_LABELS\.workDashboard/);
assert.match(applyPermissions, /NAV_LABELS\.budgetDashboard/);
assert.match(applyPermissions, /NAV_LABELS\.help/);
assert.match(applyPermissions, /NAV_LABELS\.report/);

const nav = latestFunction('ensureTopNavigation', 'ensureProjectSelector');
assert.ok(nav.indexOf('NAV_LABELS.report') < nav.indexOf('NAV_LABELS.gantt'));
assert.ok(nav.indexOf('NAV_LABELS.gantt') < nav.indexOf('NAV_LABELS.workDashboard'));
assert.ok(nav.indexOf('NAV_LABELS.workDashboard') < nav.indexOf('NAV_LABELS.budgetDashboard'));
assert.ok(nav.indexOf('NAV_LABELS.budgetDashboard') < nav.indexOf('NAV_LABELS.help'));
assert.ok(nav.indexOf('NAV_LABELS.help') < nav.indexOf('NAV_LABELS.admin'));

const projectSelector = latestFunction('ensureProjectSelector', 'ensureDeptSelector');
assert.match(projectSelector, /insertBefore\(wrapper, adminButton\)/);

const renderProjects = latestFunction('renderProjectOptions', 'loadProjectsForSelector');
assert.match(renderProjects, /loadBudgetDashboardForSelectedProject\(\{ force: true \}\)/);
assert.match(renderProjects, /renderNoProjectBudgetDashboardState\(\)/);

const panels = latestFunction('ensureWeb07Panels', 'showWeb07View');
assert.match(panels, /web07BudgetDashboardPanel/);
assert.match(panels, /web07HelpPanel/);

const router = latestFunction('showWeb07View', 'bindWeb07Navigation');
assert.match(router, /qltd-budget-mode/);
assert.match(router, /qltd-help-mode/);
assert.match(router, /loadBudgetDashboardForSelectedProject\(\)/);
assert.match(router, /renderHelpPanel\(\)/);

const bindings = latestFunction('bindWeb07Navigation', 'renderNoProjectBudgetDashboardState');
assert.match(bindings, /\[NAV_LABELS\.budgetDashboard, 'budget'\]/);
assert.match(bindings, /\[NAV_LABELS\.help, 'help'\]/);
assert.match(bindings, /\[NAV_LABELS\.report, 'report'\]/);

const loader = latestFunction('loadBudgetDashboardForSelectedProject', 'renderBudgetDashboardPanel');
assert.match(loader, /budget_getLiveDashboard/);
assert.match(loader, /deptCode: requestDeptCode/);
assert.match(loader, /normalizeBudgetDeptCode\(qltdBudgetDashboardView\.deptCode/);
assert.match(loader, /responseDeptCode && responseDeptCode !== requestDeptCode/);
assert.match(loader, /keeping requested deptCode/);
assert.match(loader, /scope === 'department'/);

const budgetRenderer = latestFunction('renderBudgetDashboardPanel', 'renderBudgetDashboardContent');
assert.doesNotMatch(budgetRenderer, /Nguồn: CENTRAL_NS_Items/);
assert.match(budgetRenderer, /budgetDashboardDeptFilter/);
assert.match(budgetRenderer, /normalizedDeptCodes/);
assert.match(budgetRenderer, /optionDeptCode === deptCode/);
assert.doesNotMatch(budgetRenderer, /dept\.deptCode === deptCode/);
assert.match(budgetRenderer, /Dashboard dự án/);
assert.match(budgetRenderer, /Dashboard phòng\/ban/);

const budgetContent = latestFunction('renderBudgetDashboardContent', 'renderBudgetFlowCard');
assert.match(budgetContent, /renderBudgetFlowCard\('THU'/);
assert.match(budgetContent, /renderBudgetFlowCard\('CHI'/);
assert.match(budgetContent, /renderBudgetBalanceCard/);
assert.match(budgetContent, /renderBudgetAlerts/);
assert.match(budgetContent, /renderBudgetItemsTable/);
assert.match(budgetContent, /Kế hoạch dự thu/);
assert.match(budgetContent, /Đã ghi nhận/);
assert.match(budgetContent, /Đã thực hiện/);
assert.match(budgetContent, /Số liệu phản ánh mức thực hiện\/ghi nhận ngân sách/);

const flowCard = latestFunction('renderBudgetFlowCard', 'renderBudgetBalanceCard');
assert.match(flowCard, /formatCompactBudgetAmount/);
assert.match(flowCard, /Còn phải ghi nhận/);
assert.match(flowCard, /Còn được chi/);
assert.match(flowCard, /Vượt kế hoạch/);
assert.match(flowCard, /Vượt trần/);

const balanceCard = latestFunction('renderBudgetBalanceCard', 'renderBudgetAlerts');
assert.match(balanceCard, /Cân đối kế hoạch ngân sách/);
assert.match(balanceCard, /Cân đối thực hiện ngân sách/);
assert.match(balanceCard, /Chưa phát sinh chi/);
assert.doesNotMatch(balanceCard, /Kế hoạch THU - CHI/);
assert.doesNotMatch(balanceCard, /Thực tế THU - CHI/);

const alerts = app.slice(app.indexOf('function renderBudgetAlerts'), app.indexOf('function renderBudgetItemsTable'));
assert.match(alerts, /Cảnh báo ngân sách/);
assert.match(alerts, /Cảnh báo dữ liệu/);
assert.match(alerts, /Nghiêm trọng/);
assert.match(alerts, /Cần xử lý/);
assert.match(alerts, /Cần theo dõi/);
assert.match(alerts, /Bình thường/);
assert.match(alerts, /groupBudgetAlerts/);
assert.match(alerts, /Xem tất cả/);
assert.doesNotMatch(alerts, /alert\.code/);
assert.doesNotMatch(alerts, /CRITICAL/);
assert.doesNotMatch(alerts, /WARNING/);
assert.doesNotMatch(alerts, /INFO/);
assert.doesNotMatch(alerts, /NORMAL/);

const alertMapping = app.slice(app.indexOf('function normalizeBudgetAlertCode'), app.indexOf('function bindBudgetAlertShowAllButtons'));
assert.match(alertMapping, /RAW_NOT_CONFIRMED: 'Giao dịch chưa được xác nhận'/);
assert.match(alertMapping, /RAW_NOT_SYNCED: 'Giao dịch chưa đồng bộ'/);
assert.match(alertMapping, /ITEM_ACTIVE_NO_CONFIRMED_ALLOCATION: 'Khoản ngân sách chưa có phân bổ đã chốt'/);
assert.match(alertMapping, /RAW_WITHOUT_BUDGET_ITEM: 'Giao dịch chưa gắn khoản ngân sách'/);
assert.match(alertMapping, /FLOW_TYPE_MISMATCH: 'Loại THU\/CHI không khớp'/);
assert.match(alertMapping, /TASK_LINKED_MASTER_MISMATCH: 'Khoản ngân sách không khớp công việc Master'/);
assert.match(alertMapping, /INACTIVE_ITEM_HAS_ACTUAL: 'Khoản ngừng hoạt động vẫn phát sinh thực hiện'/);
assert.match(alertMapping, /DUPLICATE_REPORT_ID: 'Có nguy cơ trùng bản ghi báo cáo'/);
assert.match(alertMapping, /MASTER_TASK_NOT_FOUND: 'Không tìm thấy công việc Master'/);

const numberFormatting = app.slice(app.indexOf('function normalizeBudgetRate'), app.indexOf('function groupBudgetAlerts'));
assert.match(numberFormatting, /Number\.isFinite/);
assert.match(numberFormatting, /formatCompactBudgetAmount/);

const styles = app.slice(app.indexOf('.budget-dashboard'), app.indexOf('@media (max-width: 900px)'));
assert.match(styles, /--budget-thu/);
assert.match(styles, /--budget-thu-inner/);
assert.match(styles, /--budget-chi/);
assert.match(styles, /--budget-chi-inner/);
assert.match(styles, /--budget-positive-inner/);
assert.match(styles, /--budget-negative-inner/);
assert.match(styles, /conic-gradient/);
assert.match(styles, /--ring-rest/);
assert.match(styles, /--inner-bg/);
assert.match(styles, /clamp\(210px/);
assert.match(styles, /\.budget-dashboard-table/);
assert.match(styles, /\.budget-alert-list/);
assert.match(styles, /\.budget-scope-tabs/);

console.log('Navigation and budget dashboard UI: PASS');
