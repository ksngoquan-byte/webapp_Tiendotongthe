import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const dispatcherSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.ok(end > start, `${name} boundary must exist`);
  return source.slice(start, end);
}

const renderControl = extractFunction(appSource, 'renderProjectScheduleControl', 'handleProjectScheduleRecalculate');
assert.match(renderControl, /Tiến độ dự án chưa được tính lại\./);
assert.match(renderControl, /Tiến độ dự án đã được tính lại\./);
assert.match(renderControl, /canAdmin\(\)/);
assert.match(renderControl, /projectScheduleRecalculateButton/);
assert.match(renderControl, /running \? 'disabled'/);

const recalculate = extractFunction(appSource, 'handleProjectScheduleRecalculate', 'qltdWeb07GetOrCreateGanttRequest');
assert.match(recalculate, /qltdProjectScheduleRecalcInFlight\.has\(code\)/);
assert.match(recalculate, /qltdProjectScheduleRecalcInFlight\.add\(code\)/);
assert.equal((recalculate.match(/postBackendJson\(/g) || []).length, 1, 'Double-click guard must lead to one POST.');
assert.match(recalculate, /action:\s*'recalculateProjectSchedule'/);
assert.match(recalculate, /qltdDepartmentDashboardCache\.delete\(code\)/);
assert.match(recalculate, /loadGanttDataForSelectedProject\(code,\s*\{\s*forceRefresh:\s*true\s*\}\)/);
assert.match(recalculate, /scheduleState:\s*'DIRTY'/);
assert.match(recalculate, /qltdProjectScheduleRecalcInFlight\.delete\(code\)/);
assert.equal((recalculate.match(/refreshProjectScheduleControlInPlace\(code\)/g) || []).length, 2);
assert.doesNotMatch(recalculate, /renderGanttPanel\(/, 'Schedule state updates must not reset DHTMLX.');

const scheduleControlRefresh = extractFunction(appSource, 'refreshProjectScheduleControlInPlace', 'handleProjectScheduleRecalculate');
assert.match(scheduleControlRefresh, /control\.outerHTML = renderProjectScheduleControl\(code\)/);
assert.match(scheduleControlRefresh, /bindProjectScheduleRecalculateButton\(code\)/);
assert.doesNotMatch(scheduleControlRefresh, /resetWeb07DhtmlxGantt|renderGanttPanel|clearAll/);

const viewLifecycle = extractFunction(appSource, 'showWeb07View', 'bindWeb07Navigation');
assert.match(viewLifecycle, /viewName === 'gantt' && !options\.skipDataLoad/);
assert.match(viewLifecycle, /viewLoadPromise = loadGanttDataForSelectedProject\(projectCode\)/);
assert.match(viewLifecycle, /viewName === 'dashboard'[\s\S]*loadDashboardSummaryForSelectedProject\(projectCode\)/);
assert.doesNotMatch(viewLifecycle, /setTimeout\(/, 'Gantt activation must not rely on an arbitrary render timeout.');

const loadGantt = extractFunction(appSource, 'qltdWeb07LoadGanttDataForSelectedProject', 'renderDashboardLoading');
assert.match(loadGantt, /loadProjectScheduleState\(projectCode,\s*\{\s*render:\s*false\s*\}\)/);
assert.doesNotMatch(loadGantt, /await scheduleStateRequest/, 'Schedule state must not block the first Gantt render.');
assert.match(
  loadGantt,
  /await loadMainMilestonesForProject\(projectCode,\s*payload\);\s*if \(!qltdWeb07IsCurrentGanttLoad\(projectCode,\s*requestSeq\)\) return payload;/,
  'Recalc reload must not render a stale project after milestone hydration.'
);

const approvalDirty = extractFunction(appSource, 'markMasterApprovalDataDirty', 'escapeHtml');
assert.match(approvalDirty, /scheduleState:\s*'DIRTY'/);
assert.doesNotMatch(approvalDirty, /handleProjectScheduleRecalculate|recalculateProjectSchedule/);

assert.match(dispatcherSource, /action === 'getprojectschedulestate'/);
assert.match(dispatcherSource, /qltdProjectScheduleGetStateApi_/);
assert.match(dispatcherSource, /action === 'recalculateprojectschedule'/);
assert.match(dispatcherSource, /qltdProjectScheduleRecalculate_/);
assert.match(indexSource, /app\.js\?v=GANTT_REQUEST_RACE_HOTFIX_3/);
assert.match(indexSource, /MAIN_MILESTONE_UID_V4/);
assert.match(indexSource, /__QLTD_GANTT_PATCH_ROUND__ = 'GANTT_REQUEST_RACE_HOTFIX_3'/);

console.log('Project schedule recalculation frontend: PASS');
