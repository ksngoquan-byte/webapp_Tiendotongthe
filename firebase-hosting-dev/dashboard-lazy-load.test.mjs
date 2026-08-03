import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const dispatcher = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');

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

const projectOptions = extractFunction(app, 'renderProjectOptions');
const showView = extractFunction(app, 'showWeb07View');
const dashboardRequest = extractFunction(app, 'qltdRequestDashboardSummary');
const dashboardIdle = extractFunction(app, 'renderDashboardIdle');
const dashboardError = extractFunction(app, 'renderDashboardError');
const backendHandler = extractFunction(dispatcher, 'qltdDevApiDashboardSummary_');

assert.doesNotMatch(projectOptions, /loadDashboardSummaryForSelectedProject\(selector\.value\)/);
assert.match(projectOptions, /renderDashboardIdle\(selector\.value/);
assert.match(showView, /viewName === 'dashboard'[\s\S]*loadDashboardSummaryForSelectedProject/);
assert.match(dashboardRequest, /loadDashboard:\s*'1'/);
assert.match(dashboardIdle, /dashboardLoadButton/);
assert.match(dashboardError, /dashboardRetryButton/);
assert.match(backendHandler, /DASHBOARD_LOAD_INTENT_REQUIRED/);
assert.ok(
  backendHandler.indexOf('DASHBOARD_LOAD_INTENT_REQUIRED') < backendHandler.indexOf('resolveCurrentUser_'),
  'intent gate must run before auth/project/data work'
);
assert.ok(
  backendHandler.indexOf('DASHBOARD_LOAD_INTENT_REQUIRED') < backendHandler.indexOf('qltdDashboardGetSummaryForProject_'),
  'intent gate must run before Dashboard dataset build'
);

console.log('dashboard-lazy-load.test.mjs: PASS');
