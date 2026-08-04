from pathlib import Path


def read_text_preserve_bom(path: str):
    raw = Path(path).read_bytes()
    return raw.decode("utf-8-sig"), raw.startswith(b"\xef\xbb\xbf")


def write_text_preserve_bom(path: str, text: str, had_bom: bool):
    payload = text.encode("utf-8")
    if had_bom:
        payload = b"\xef\xbb\xbf" + payload
    Path(path).write_bytes(payload)


def replace_once(text: str, old: str, new: str, label: str):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


app_path = "firebase-hosting-dev/app.js"
app, app_bom = read_text_preserve_bom(app_path)

app = replace_once(
    app,
    "const PROJECT_STORAGE_KEY = 'qltd.selectedProjectCode.v1';",
    """const PROJECT_STORAGE_KEY = 'qltd.selectedProjectCode.v1';
const LAST_VIEW_STORAGE_KEY = 'qltd.lastView.v1';
const DEPT_STORAGE_KEY = 'qltd.selectedDeptCode.v1';""",
    "user-scoped storage constants",
)

app = replace_once(
    app,
    "let qltdActiveView = 'dashboard';",
    "let qltdActiveView = '';",
    "neutral pre-auth active view",
)

app = replace_once(
    app,
    """  nav.innerHTML = [
    NAV_LABELS.workDashboard,
    NAV_LABELS.budgetDashboard,
    NAV_LABELS.gantt,
    NAV_LABELS.help,
    NAV_LABELS.report,
    NAV_LABELS.admin
  ].map((label) => `<button type=\"button\" disabled>${escapeHtml(label)}</button>`).join('');""",
    """  nav.innerHTML = [
    NAV_LABELS.report,
    NAV_LABELS.gantt,
    NAV_LABELS.workDashboard,
    NAV_LABELS.budgetDashboard,
    NAV_LABELS.help,
    NAV_LABELS.admin
  ].map((label) => `<button type=\"button\" disabled>${escapeHtml(label)}</button>`).join('');""",
    "navigation priority order",
)

app = replace_once(
    app,
    """function getStoredProjectCode() {
  try {
    return localStorage.getItem(PROJECT_STORAGE_KEY) || '';
  } catch (error) {
    console.warn('Cannot read selected project from localStorage', error);
    return '';
  }
}

function setStoredProjectCode(projectCode) {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, projectCode || '');
  } catch (error) {
    console.warn('Cannot save selected project to localStorage', error);
  }
}""",
    """function qltdGetStorageUserIdentity(profile = currentUserProfile) {
  return String(profile?.email || auth?.currentUser?.email || '').trim().toLowerCase();
}

function qltdGetUserScopedStorageKey(baseKey, profile = currentUserProfile, scope = '') {
  const identity = qltdGetStorageUserIdentity(profile);
  if (!identity) return '';
  const normalizedScope = String(scope || '').trim().toUpperCase();
  return [baseKey, encodeURIComponent(identity), normalizedScope].filter(Boolean).join('::');
}

function qltdReadUserScopedStorage(baseKey, profile = currentUserProfile, scope = '') {
  const key = qltdGetUserScopedStorageKey(baseKey, profile, scope);
  if (!key) return '';
  try {
    return localStorage.getItem(key) || '';
  } catch (error) {
    console.warn('Cannot read user-scoped localStorage', error);
    return '';
  }
}

function qltdWriteUserScopedStorage(baseKey, value, profile = currentUserProfile, scope = '') {
  const key = qltdGetUserScopedStorageKey(baseKey, profile, scope);
  if (!key) return;
  try {
    localStorage.setItem(key, String(value || ''));
  } catch (error) {
    console.warn('Cannot save user-scoped localStorage', error);
  }
}

function getStoredProjectCode(profile = currentUserProfile) {
  return qltdReadUserScopedStorage(PROJECT_STORAGE_KEY, profile);
}

function setStoredProjectCode(projectCode, profile = currentUserProfile) {
  qltdWriteUserScopedStorage(PROJECT_STORAGE_KEY, projectCode, profile);
}

function getStoredLastView(profile = currentUserProfile) {
  return qltdReadUserScopedStorage(LAST_VIEW_STORAGE_KEY, profile);
}

function setStoredLastView(viewName, profile = currentUserProfile) {
  qltdWriteUserScopedStorage(LAST_VIEW_STORAGE_KEY, viewName, profile);
}

function getStoredDeptCode(projectCode = '', profile = currentUserProfile) {
  return qltdReadUserScopedStorage(DEPT_STORAGE_KEY, profile, projectCode);
}

function setStoredDeptCode(projectCode, deptCode, profile = currentUserProfile) {
  qltdWriteUserScopedStorage(DEPT_STORAGE_KEY, deptCode, profile, projectCode);
}

function qltdCanAccessView(viewName, profile = currentUserProfile, permissions = currentPermissions) {
  const view = String(viewName || '').trim();
  if (view === 'dashboard') return !!permissions?.dashboard;
  if (view === 'budget') return !!permissions?.budgetDashboard;
  if (view === 'gantt') return !!permissions?.gantt;
  if (view === 'help') return !!permissions?.help;
  if (view === 'report') return !!permissions?.reportUpdate;
  if (view === 'admin') return canApprove(profile);
  return false;
}

function qltdRoleDefaultView(role) {
  const roleKey = normalizeRoleKey(role);
  if (['REPORTER', 'EDITOR'].includes(roleKey)) return 'report';
  if (['VIEWER', 'PMO', 'ADMIN'].includes(roleKey)) return 'gantt';
  return '';
}

function resolveInitialViewForUser(profile = currentUserProfile, permissions = currentPermissions) {
  const storedView = getStoredLastView(profile);
  if (storedView && qltdCanAccessView(storedView, profile, permissions)) return storedView;

  const roleDefault = qltdRoleDefaultView(profile?.role);
  if (roleDefault && qltdCanAccessView(roleDefault, profile, permissions)) return roleDefault;

  const fallbackOrder = ['report', 'gantt', 'dashboard', 'budget', 'help', 'admin'];
  return fallbackOrder.find((viewName) => qltdCanAccessView(viewName, profile, permissions)) || '';
}""",
    "user-scoped storage and initial view resolver",
)

app = replace_once(
    app,
    """function showWeb07View(viewName, options = {}) {
  let viewLoadPromise = null;
  qltdActiveView = viewName;""",
    """function showWeb07View(viewName, options = {}) {
  viewName = String(viewName || '').trim();
  if (!qltdCanAccessView(viewName)) return null;
  let viewLoadPromise = null;
  qltdActiveView = viewName;
  if (!options.skipPersist) setStoredLastView(viewName);""",
    "view permission gate and last-view persistence",
)

app = replace_once(
    app,
    """  applyPermissions(effectiveProfile);
  ensureWeb07Panels();
  bindWeb07Navigation();
  showWeb07View('dashboard', { skipDataLoad: true });
  renderProjectOptions(Array.isArray(projects) ? projects : []);""",
    """  applyPermissions(effectiveProfile);
  ensureWeb07Panels();
  bindWeb07Navigation();
  const initialView = resolveInitialViewForUser(effectiveProfile, currentPermissions);
  showWeb07View(initialView, { skipDataLoad: true, skipPersist: true });
  renderProjectOptions(Array.isArray(projects) ? projects : []);""",
    "role-aware initial view in renderApp",
)

app = replace_once(
    app,
    """  setStoredProjectCode(selector.value);
  if (qltdActiveView === 'dashboard') {
    qltdDashboardPayload = null;
    qltdDashboardLoadRequestSeq += 1;
    renderDashboardIdle(selector.value);
  }
  if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);""",
    """  setStoredProjectCode(selector.value);
  if (qltdActiveView === 'report') loadDeptPlansForSelectedProject(selector.value);
  if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);
  if (qltdActiveView === 'budget') loadBudgetDashboardForSelectedProject();
  if (qltdActiveView === 'admin') loadAdminMasterApprovals();
  if (qltdActiveView === 'dashboard') {
    qltdDashboardPayload = null;
    qltdDashboardLoadRequestSeq += 1;
    renderDashboardIdle(selector.value);
  }""",
    "initial project load follows active view only",
)

app = replace_once(
    app,
    """  const hasSelected = departments.some((dept) => (dept.deptCode || dept.sheetName) === qltdSelectedDeptCode);
  qltdSelectedDeptCode = hasSelected ? qltdSelectedDeptCode : (departments[0].deptCode || departments[0].sheetName || '');
  deptSelector.value = qltdSelectedDeptCode;
  deptSelector.disabled = false;
  deptSelector.onchange = () => {
    content.innerHTML = '';
    resetDeptScopedSelectionState();
    qltdSelectedDeptCode = deptSelector.value;
    renderSelectedDeptPlan();
  };""",
    """  const projectCode = String(payload.projectCode || getStoredProjectCode() || '').trim();
  const storedDeptCode = getStoredDeptCode(projectCode);
  const preferredDeptCode = qltdSelectedDeptCode || storedDeptCode;
  const hasSelected = departments.some((dept) => (dept.deptCode || dept.sheetName) === preferredDeptCode);
  qltdSelectedDeptCode = hasSelected ? preferredDeptCode : (departments[0].deptCode || departments[0].sheetName || '');
  setStoredDeptCode(projectCode, qltdSelectedDeptCode);
  deptSelector.value = qltdSelectedDeptCode;
  deptSelector.disabled = false;
  deptSelector.onchange = () => {
    content.innerHTML = '';
    resetDeptScopedSelectionState();
    qltdSelectedDeptCode = deptSelector.value;
    setStoredDeptCode(projectCode, qltdSelectedDeptCode);
    renderSelectedDeptPlan();
  };""",
    "project-scoped department persistence",
)

write_text_preserve_bom(app_path, app, app_bom)


test_path = Path("firebase-hosting-dev/initial-view-routing.test.mjs")
test_path.write_text(r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const expression = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = expression.exec(source);
  assert.ok(match, `Missing ${name}`);
  const start = match.index;
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the complete declaration parses.
    }
  }
  throw new Error(`Unclosed ${name}`);
}

const roleDefaultSource = extractFunction(app, 'qltdRoleDefaultView');
const resolverSource = extractFunction(app, 'resolveInitialViewForUser');
const renderAppSource = extractFunction(app, 'renderApp');
const projectOptionsSource = extractFunction(app, 'renderProjectOptions');
const showViewSource = extractFunction(app, 'showWeb07View');
const navSource = extractFunction(app, 'ensureTopNavigation');
const storageKeySource = extractFunction(app, 'qltdGetUserScopedStorageKey');
const renderDeptPlansSource = extractFunction(app, 'renderDeptPlans');

const context = {
  normalizeRoleKey: (value) => String(value || '').trim().toUpperCase(),
  getStoredLastView: () => '',
  qltdCanAccessView: (viewName) => ['report', 'gantt', 'dashboard'].includes(viewName)
};
vm.createContext(context);
vm.runInContext(`${roleDefaultSource}\n${resolverSource}`, context);

assert.equal(context.qltdRoleDefaultView('REPORTER'), 'report');
assert.equal(context.qltdRoleDefaultView('EDITOR'), 'report');
assert.equal(context.qltdRoleDefaultView('VIEWER'), 'gantt');
assert.equal(context.qltdRoleDefaultView('PMO'), 'gantt');
assert.equal(context.qltdRoleDefaultView('ADMIN'), 'gantt');

assert.equal(context.resolveInitialViewForUser({ role: 'REPORTER' }, {}), 'report');
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'report');
assert.equal(context.resolveInitialViewForUser({ role: 'ADMIN' }, {}), 'gantt');
context.getStoredLastView = () => 'dashboard';
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'dashboard');
context.getStoredLastView = () => 'budget';
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'report');

assert.match(renderAppSource, /resolveInitialViewForUser\(effectiveProfile, currentPermissions\)/);
assert.doesNotMatch(renderAppSource, /showWeb07View\('dashboard'/);
assert.match(renderAppSource, /skipDataLoad:\s*true,\s*skipPersist:\s*true/);

assert.match(projectOptionsSource, /qltdActiveView === 'report'\) loadDeptPlansForSelectedProject/);
assert.match(projectOptionsSource, /qltdActiveView === 'gantt'\) loadGanttDataForSelectedProject/);
assert.match(projectOptionsSource, /qltdActiveView === 'budget'\) loadBudgetDashboardForSelectedProject/);
assert.match(projectOptionsSource, /qltdActiveView === 'admin'\) loadAdminMasterApprovals/);
assert.doesNotMatch(projectOptionsSource, /qltdActiveView === 'dashboard'\) loadDashboardSummaryForSelectedProject/);
assert.match(projectOptionsSource, /renderDashboardIdle\(selector\.value\)/);

assert.match(showViewSource, /qltdCanAccessView\(viewName\)/);
assert.match(showViewSource, /setStoredLastView\(viewName\)/);
assert.match(storageKeySource, /encodeURIComponent\(identity\)/);
assert.match(storageKeySource, /normalizedScope/);
assert.match(renderDeptPlansSource, /getStoredDeptCode\(projectCode\)/);
assert.match(renderDeptPlansSource, /setStoredDeptCode\(projectCode, qltdSelectedDeptCode\)/);

const reportIndex = navSource.indexOf('NAV_LABELS.report');
const ganttIndex = navSource.indexOf('NAV_LABELS.gantt');
const dashboardIndex = navSource.indexOf('NAV_LABELS.workDashboard');
assert.ok(reportIndex >= 0 && ganttIndex > reportIndex && dashboardIndex > ganttIndex, 'Operational views must precede Dashboard');

console.log('initial-view-routing.test.mjs: PASS');
''', encoding="utf-8")

package_path = "firebase-hosting-dev/package.json"
package_text, package_bom = read_text_preserve_bom(package_path)
package_text = replace_once(
    package_text,
    "node dashboard-lazy-load.test.mjs && node weekly-periods.test.mjs",
    "node dashboard-lazy-load.test.mjs && node initial-view-routing.test.mjs && node weekly-periods.test.mjs",
    "register initial view routing test",
)
write_text_preserve_bom(package_path, package_text, package_bom)

print("Role-aware initial view patch applied.")
