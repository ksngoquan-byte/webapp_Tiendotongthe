import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const observabilitySource = fs.readFileSync(
  new URL('../apps-script-dev-api/72_Performance_Observability.js', import.meta.url),
  'utf8'
);
const ganttServiceSource = fs.readFileSync(
  new URL('../apps-script-dev-api/35_GANTT_DATA_SERVICE.js', import.meta.url),
  'utf8'
);

const context = {
  Date,
  JSON,
  Math,
  Number,
  Object,
  String,
  Utilities: {
    getUuid: () => 'PERF-REQUEST-1',
    newBlob: (value) => ({ getBytes: () => Buffer.from(String(value), 'utf8') })
  },
  Logger: { log() {} },
  isFinite
};
vm.createContext(context);
vm.runInContext(
  `${observabilitySource}
   this.api = {
     start: qltdPerfStartRequest_,
     memoHas: qltdPerfMemoHas_,
     memoGet: qltdPerfMemoGet_,
     memoSet: qltdPerfMemoSet_,
     increment: qltdPerfIncrement_,
     finalize: qltdPerfFinalizeJson_
   };`,
  context
);

context.api.start('bootstrap', {});
assert.equal(context.api.memoHas('users', 'all'), false);
context.api.memoSet('users', 'all', [{ email: 'user@example.com' }]);
assert.equal(context.api.memoHas('users', 'all'), true);
assert.equal(context.api.memoGet('users', 'all').length, 1);
context.api.increment('usersPhysicalReads');
context.api.increment('projectsPhysicalReads');
context.api.increment('sheetRangeReads', 2);
const observed = JSON.parse(context.api.finalize({ success: true, projects: [{ projectCode: 'P1' }] }));
assert.deepEqual(observed.performance.counters, {
  usersPhysicalReads: 1,
  projectsPhysicalReads: 1,
  sheetRangeReads: 2
});
assert.equal(observed.performance.recordCount, 1);
assert.ok(observed.performance.responseBytes > 0);

const sourceTask = {
  id: 'TASK-1',
  text: 'Thi công',
  taskName: 'Thi công',
  code: 'CV-1',
  masterTaskCode: 'CV-1',
  wbs: 'I.1',
  wbsLevel: 2,
  parent: 'GROUP-1',
  rowType: 'TASK',
  type: 'task',
  status: 'IN_PROGRESS',
  progress: 0.5,
  start_date: '2026-07-01',
  end_date: '2026-07-31',
  deadline: '2026-07-31',
  duration: 30,
  baselineStart: '2026-07-01',
  baselineEnd: '2026-07-31',
  actualStart: '2026-07-02',
  actualFinish: '',
  actualEnd: '',
  owner: 'PTDA',
  deptCode: 'PTDA',
  deptName: 'Phòng PTDA',
  zone: 'Z1',
  ownZone: 'Z1',
  contextZone: 'Z1',
  loaiCongTrinh: 'Hạ tầng',
  congTrinh: 'Công trình 1',
  hangMuc: 'HM1',
  congViecZone: 'Z1',
  congViecHangMuc: 'HM1',
  ownHangMuc: 'HM1',
  contextHangMuc: 'HM1',
  contextPath: ['Z1', 'HM1'],
  isCategoryRow: false,
  is_milestone: false,
  milestone: false,
  ma_moc: '',
  loai_cong_viec: 'TASK',
  sourceStart: '2026-07-01',
  sourceEnd: '2026-07-31',
  rollupStart: '2026-07-01',
  rollupEnd: '2026-07-31',
  _predecessor: 'TASK-0',
  _linkType: 'FS',
  raw: {
    UID: 'TASK-1',
    InternalNote: 'not-for-dashboard',
    SpreadsheetRow: 42,
    Dependency: 'TASK-0FS',
    UpdateNote: 'fixture operational note',
    FormulaState: 'computed'
  }
};
const fixtureTaskCount = 12;
const ganttPayload = {
  success: true,
  projectCode: 'P1',
  projectName: 'Project 1',
  sourceSheet: 'Cong_viec',
  data: Array.from({ length: fixtureTaskCount }, (_, index) => ({
    ...sourceTask,
    id: `TASK-${index + 1}`,
    code: `CV-${index + 1}`,
    masterTaskCode: `CV-${index + 1}`,
    raw: { ...sourceTask.raw, UID: `TASK-${index + 1}`, SpreadsheetRow: index + 42 }
  })),
  links: Array.from({ length: fixtureTaskCount - 1 }, (_, index) => ({
    id: `L${index + 1}`,
    source: `TASK-${index + 1}`,
    target: `TASK-${index + 2}`,
    type: '0'
  })),
  summary: { total: fixtureTaskCount, inProgress: fixtureTaskCount },
  warnings: [],
  performance: { generatedAt: '2026-07-30T00:00:00.000Z' },
  apiStatus: 'CONNECTED'
};
const ganttContext = {
  Date,
  JSON,
  Math,
  Number,
  Object,
  String,
  console: { warn() {} },
  isFinite,
  qltdProjectsNormalizeCode_: (value) => String(value || '').toUpperCase(),
  qltdProjectsGetByCode_: () => null,
  qltdTaskContextResolveDataset_: () => {},
  qltdTaskContextFilterLinks_: (links) => links,
  qltdTaskContextBuildPublicDataset_: (tasks) => tasks
};
vm.createContext(ganttContext);
vm.runInContext(ganttServiceSource, ganttContext);
let dashboardBuildOptions;
ganttContext.qltdGanttCacheGet_ = () => null;
ganttContext.qltdGanttBuildDataForProject_ = (_projectCode, _startedAt, options) => {
  dashboardBuildOptions = options;
  return JSON.parse(JSON.stringify(ganttPayload));
};
ganttContext.qltdGanttCachePut_ = () => ({ stored: true });
const dashboardPayload = vm.runInContext("qltdDashboardGetSummaryForProject_('P1', {})", ganttContext);
const utf8Bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const benchmark = {
  criticalRequestsBefore: ['bootstrap', 'ganttData', 'getProjectScheduleState', 'notifications_list'],
  criticalRequestsAfter: ['bootstrap', 'dashboardSummary'],
  ganttBytes: utf8Bytes(ganttPayload),
  dashboardBytes: utf8Bytes(dashboardPayload),
  ganttTaskFields: Object.keys(ganttPayload.data[0]).length,
  dashboardTaskFields: Object.keys(dashboardPayload.data[0]).length,
  fixtureTasks: fixtureTaskCount,
  fixtureLinks: ganttPayload.links.length,
  hiddenGanttRenderBefore: 1,
  hiddenGanttRenderAfter: 0
};

assert.equal(benchmark.criticalRequestsBefore.length, 4);
assert.equal(benchmark.criticalRequestsAfter.length, 2);
assert.ok(benchmark.dashboardBytes < benchmark.ganttBytes);
assert.ok(benchmark.dashboardTaskFields < benchmark.ganttTaskFields);
assert.equal(benchmark.hiddenGanttRenderAfter, 0);
assert.deepEqual(
  JSON.parse(JSON.stringify(dashboardBuildOptions)),
  { includeLinks: false, dashboardProjection: true }
);
assert.equal(dashboardPayload.links, undefined);
assert.equal(dashboardPayload.data[0].raw, undefined);
assert.equal(dashboardPayload.performance.linksBuilt, 0);
assert.equal(dashboardPayload.performance.rawRowsReturned, 0);
assert.deepEqual(JSON.parse(JSON.stringify(dashboardPayload.summary)), ganttPayload.summary);

console.log('performance-critical-boot.test.mjs: PASS', JSON.stringify(benchmark));
