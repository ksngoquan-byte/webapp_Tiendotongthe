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

const renderApp = extractFunction(app, 'renderApp');
const projectOptions = extractFunction(app, 'renderProjectOptions');
const showView = extractFunction(app, 'showWeb07View');
const dashboardLoader = extractFunction(app, 'loadDashboardSummaryForSelectedProject');
const dashboardRequest = extractFunction(app, 'qltdRequestDashboardSummary');
const dashboardIdle = extractFunction(app, 'renderDashboardIdle');
const dashboardError = extractFunction(app, 'renderDashboardError');
const ganttLoader = extractFunction(app, 'qltdWeb07LoadGanttDataForSelectedProject');
const ganttRender = extractFunction(app, 'renderGanttPanel');

assert.match(renderApp, /renderProjectOptions\(Array\.isArray\(projects\)/);
assert.doesNotMatch(renderApp, /listProjects|loadNotifications|ganttData|getProjectScheduleState/);
assert.doesNotMatch(projectOptions, /qltdActiveView === 'dashboard'\) loadDashboardSummaryForSelectedProject/);
assert.match(projectOptions, /renderDashboardIdle\(selector\.value/);
assert.match(projectOptions, /qltdActiveView === 'gantt'\) loadGanttDataForSelectedProject/);
assert.match(showView, /viewName === 'dashboard'[\s\S]*loadDashboardSummaryForSelectedProject/);
assert.match(showView, /viewName === 'gantt'[\s\S]*loadGanttDataForSelectedProject/);
assert.doesNotMatch(dashboardLoader, /ganttData|getProjectScheduleState|loadMainMilestonesForProject|renderGanttPanel/);
assert.match(dashboardRequest, /loadDashboard:\s*'1'/);
assert.match(dashboardIdle, /dashboardLoadButton/);
assert.match(dashboardError, /dashboardRetryButton/);
assert.match(ganttLoader, /loadProjectScheduleState/);
assert.doesNotMatch(ganttLoader, /await scheduleStateRequest/);
assert.doesNotMatch(ganttLoader, /renderDashboardFromGanttData|renderDashboardError/);
assert.match(ganttRender, /^function renderGanttPanel\(payload\) \{\s+if \(qltdActiveView !== 'gantt'\) return;/);
assert.match(extractFunction(app, 'loadNotificationSummary'), /notifications_summary/);
assert.match(extractFunction(app, 'loadNotifications'), /notifications_list/);
assert.match(extractFunction(app, 'setNotificationPanelOpen'), /if \(open\) loadNotifications\(\)/);

let physicalRequests = 0;
let releaseFirst;
const context = {
  Date,
  Error,
  Map,
  Promise,
  String,
  auth: { currentUser: { email: 'user@example.com' } },
  currentUserProfile: { email: 'user@example.com', role: 'EDITOR' },
  normalizeRoleKey: (value) => String(value || '').toUpperCase(),
  fetchBackendJson: async (_action, params) => {
    physicalRequests += 1;
    if (physicalRequests === 1) {
      await new Promise((resolve) => { releaseFirst = resolve; });
    }
    return { success: true, projectCode: params.projectCode, data: [] };
  }
};
vm.createContext(context);
vm.runInContext(
  [
    'const qltdDashboardCache = new Map();',
    'const qltdDashboardRequests = new Map();',
    'const QLTD_DASHBOARD_CACHE_TTL_MS = 60000;',
    extractFunction(app, 'qltdDashboardAccessKey'),
    extractFunction(app, 'qltdRequestDashboardSummary'),
    'this.api = { request: qltdRequestDashboardSummary, cache: qltdDashboardCache };'
  ].join('\n'),
  context
);

const first = context.api.request('P1');
const duplicate = context.api.request('P1');
assert.equal(first, duplicate);
await Promise.resolve();
assert.equal(physicalRequests, 1);
releaseFirst();
await Promise.all([first, duplicate]);
await context.api.request('P1');
assert.equal(physicalRequests, 1, 'warm cache must avoid a second physical request');

context.currentUserProfile = { email: 'user@example.com', role: 'VIEWER' };
await context.api.request('P1');
assert.equal(physicalRequests, 2, 'role change must use an isolated cache key');
context.currentUserProfile = { email: 'other@example.com', role: 'VIEWER' };
await context.api.request('P1');
assert.equal(physicalRequests, 3, 'user change must use an isolated cache key');
await context.api.request('P2');
assert.equal(physicalRequests, 4, 'project change must use an isolated cache key');

let selectedProject = 'A';
const staleContext = {
  document: { getElementById: () => ({ get value() { return selectedProject; } }) },
  getStoredProjectCode: () => '',
  qltdActiveView: 'dashboard'
};
vm.createContext(staleContext);
vm.runInContext(
  `let qltdDashboardLoadRequestSeq = 1;
   ${extractFunction(app, 'qltdIsCurrentDashboardLoad')}
   this.isCurrent = qltdIsCurrentDashboardLoad;
   this.next = () => { qltdDashboardLoadRequestSeq += 1; };`,
  staleContext
);
assert.equal(staleContext.isCurrent('A', 1), true);
selectedProject = 'B';
assert.equal(staleContext.isCurrent('A', 1), false);
staleContext.next();
assert.equal(staleContext.isCurrent('B', 2), true);
staleContext.qltdActiveView = 'gantt';
assert.equal(staleContext.isCurrent('B', 2), false);

console.log('dashboard-critical-path.test.mjs: PASS');
