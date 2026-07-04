import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const dispatcher = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const gantt = fs.readFileSync(new URL('../apps-script-dev-api/35_GANTT_DATA_SERVICE.js', import.meta.url), 'utf8');
const observability = fs.readFileSync(new URL('../apps-script-dev-api/72_Performance_Observability.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf(') {', start);
  assert.notEqual(bodyStart, -1, `${name} body must exist`);
  let depth = 0;
  let opened = false;
  for (let index = bodyStart + 2; index < source.length; index += 1) {
    if (source[index] === '{') { depth += 1; opened = true; }
    if (source[index] === '}') depth -= 1;
    if (opened && depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Cannot extract ${name}`);
}

assert.doesNotMatch(functionSource(app, 'fetchBackendProfile'), /health/);
assert.match(functionSource(app, 'renderApp'), /scheduleNotificationsLoad/);
assert.match(functionSource(app, 'scheduleNotificationsLoad'), /requestIdleCallback/);
assert.match(functionSource(app, 'qltdWeb07RequestDashboardPayload'), /dashboardSummary/);
assert.doesNotMatch(functionSource(app, 'loadDashboardDataForSelectedProject'), /ganttData/);
assert.match(dispatcher, /action === 'dashboardsummary'/);
assert.match(gantt, /function qltdDashboardGetSummaryForProject_/);
assert.match(observability, /requestId/);
assert.match(observability, /responseBytes/);
assert.match(observability, /cellsRead/);
assert.match(observability, /cacheHit/);

const sourcePayload = {
  success: true,
  projectCode: 'P1',
  projectName: 'Project 1',
  sourceSheet: 'Cong_viec',
  data: Array.from({ length: 40 }, (_, index) => ({
    id: String(index + 1),
    text: `Task ${index + 1}`,
    code: `T-${index + 1}`,
    wbs: `${index + 1}`,
    status: index % 2 ? 'Đang làm' : 'Hoàn thành',
    progress: index % 2 ? 0.5 : 1,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    owner: 'DEPT',
    raw: { note: 'x'.repeat(500), businessData: 'y'.repeat(500) }
  })),
  links: Array.from({ length: 39 }, (_, index) => ({ source: String(index + 1), target: String(index + 2) })),
  summary: { totalTasks: 40 },
  warnings: [],
  performance: { rowsRead: 41, columnsRead: 30, cacheHit: false },
  apiStatus: 'CONNECTED'
};
const summaryContext = {
  Date,
  Object,
  qltdGanttGetDataForProject_: () => sourcePayload
};
vm.createContext(summaryContext);
vm.runInContext(`${functionSource(gantt, 'qltdDashboardGetSummaryForProject_')}\nthis.buildSummary = qltdDashboardGetSummaryForProject_;`, summaryContext);
const summaryPayload = summaryContext.buildSummary('P1');
assert.equal(summaryPayload.data.length, sourcePayload.data.length);
assert.equal(Object.hasOwn(summaryPayload, 'links'), false);
assert.equal(summaryPayload.performance.fullGanttLinkCount, sourcePayload.links.length);
assert.ok(JSON.stringify(summaryPayload).length < JSON.stringify(sourcePayload).length * 0.35);

console.log('performance-webapp-load-v1.test.mjs: PASS');
