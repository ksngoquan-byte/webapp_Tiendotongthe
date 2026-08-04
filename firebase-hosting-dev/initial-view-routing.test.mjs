import assert from 'node:assert/strict';
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
