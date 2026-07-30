import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servicePath = path.join(repoRoot, 'apps-script-dev-api', '35_GANTT_DATA_SERVICE.js');
const currentSource = fs.readFileSync(servicePath, 'utf8');

function createContext(source = currentSource) {
  const context = {
    console: { warn() {}, log() {}, error() {} },
    Utilities: {
      formatDate(value) {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    CacheService: { getScriptCache: () => ({ get: () => null }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById() { throw new Error('Not used by this test'); } },
    qltdProjectsNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdProjectsGetByCode_: () => null,
    qltdTaskContextResolveDataset_: () => {},
    qltdTaskContextFilterLinks_: (links) => links,
    qltdTaskContextBuildPublicDataset_: (tasks) => tasks
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

function runGetDataScenario({ locked, cacheValues, buildResult, cachePutResult }) {
  const context = createContext();
  let buildCount = 0;
  let releaseCount = 0;
  const cacheQueue = cacheValues.slice();
  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => locked,
      releaseLock: () => { releaseCount += 1; }
    })
  };
  context.qltdGanttCacheGet_ = () => cacheQueue.shift() || null;
  context.qltdGanttBuildDataForProject_ = () => {
    buildCount += 1;
    return buildResult || { success: true, data: [], links: [], warnings: [] };
  };
  context.qltdGanttCachePut_ = () => cachePutResult || ({ stored: true });
  const result = vm.runInContext('qltdGanttGetDataForProject_("P1")', context);
  return { result, buildCount, releaseCount };
}

test('lock acquired builds once and releases the lock', () => {
  const outcome = runGetDataScenario({ locked: true, cacheValues: [null, null] });
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.buildCount, 1);
  assert.equal(outcome.releaseCount, 1);
});

test('lock unavailable uses the cache recheck without rebuilding', () => {
  const cached = {
    success: true,
    data: [{ id: '1' }],
    links: [],
    performance: { cacheHit: true, rowsRead: 10, taskCount: 1 }
  };
  const outcome = runGetDataScenario({ locked: false, cacheValues: [null, cached] });
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.result.performance.cacheHit, true);
  assert.equal(outcome.result.performance.waitedForCache, true);
  assert.equal(outcome.buildCount, 0);
  assert.equal(outcome.releaseCount, 0);
});

test('lock unavailable and empty cache returns controlled busy response', () => {
  const outcome = runGetDataScenario({ locked: false, cacheValues: [null, null] });
  assert.equal(outcome.result.success, false);
  assert.equal(outcome.result.error, 'GANTT_BUSY_RETRY');
  assert.equal(outcome.result.retryAfterMs, 1500);
  assert.equal(outcome.buildCount, 0);
  assert.equal(outcome.releaseCount, 0);
  assert.equal(outcome.result.performance.cacheHit, false);
});

test('oversized CacheService payload falls back with a response warning', () => {
  const context = createContext();
  context.__payload = { success: true, data: 'x'.repeat(25000 * 61), warnings: [] };
  context.CacheService = {
    getScriptCache() {
      throw new Error('CacheService must not be called after the size guard');
    }
  };
  const result = vm.runInContext('qltdGanttCachePut_("P1", __payload)', context);
  assert.equal(result.stored, false);
  assert.equal(result.warning.type, 'GANTT_CACHE_PAYLOAD_TOO_LARGE');
  assert.ok(result.warning.chunkCount > result.warning.maxChunks);
});

test('cache fallback warning is returned without failing valid Gantt data', () => {
  const outcome = runGetDataScenario({
    locked: true,
    cacheValues: [null, null],
    buildResult: { success: true, data: [{ id: '1' }], links: [], warnings: [] },
    cachePutResult: { stored: false, warning: { type: 'GANTT_CACHE_PAYLOAD_TOO_LARGE' } }
  });
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.result.warnings[0].type, 'GANTT_CACHE_PAYLOAD_TOO_LARGE');
});

test('performance payload keeps cache, duration, row and task metrics', () => {
  const context = createContext();
  const performance = vm.runInContext('qltdGanttPerformance_(Date.now() - 25, false, 141, 10, 140)', context);
  assert.equal(performance.cacheHit, false);
  assert.ok(performance.durationMs >= 0);
  assert.equal(performance.rowsRead, 141);
  assert.equal(performance.taskCount, 140);
});

test('sheet read stops at the last task row instead of reading the whole sheet', () => {
  const context = createContext();
  const headers = ['id', 'cong_viec', 'bat_dau_ke_hoach', 'ket_thuc_ke_hoach'];
  const dataRows = [
    ['1', 'Task 1', '2026-01-01', '2026-01-02'],
    ['2', 'Task 2', '2026-01-03', '2026-01-04'],
    ['3', 'Task 3', '2026-01-05', '2026-01-06'],
    ['4', 'Task 4', '2026-01-07', '2026-01-08']
  ];
  const calls = [];
  const sheet = {
    getName: () => 'Cong_viec',
    getMaxRows: () => { throw new Error('getMaxRows must not be used'); },
    getMaxColumns: () => 20,
    getLastColumn: () => 4,
    getLastRow: () => 5,
    getRange(row, column, rowCount, columnCount) {
      calls.push({ row, column, rowCount, columnCount });
      return {
        getValues() {
          if (row === 1 && rowCount === 12) {
            return [headers, ...dataRows, ...Array.from({ length: 7 }, () => ['', '', '', ''])];
          }
          return [headers, ...dataRows].slice(0, rowCount);
        },
        getDisplayValues() {
          return [...dataRows.map((item) => item.slice(0, columnCount)),
            ...Array.from({ length: rowCount - dataRows.length }, () => Array(columnCount).fill(''))];
        }
      };
    }
  };
  context.__sheet = sheet;
  context.__warnings = [];
  const result = vm.runInContext('qltdGanttReadSourceValues_(__sheet, __warnings)', context);
  assert.equal(result.rowsRead, 5);
  assert.equal(result.columnsRead, 4);
  assert.deepEqual(calls, [{ row: 1, column: 1, rowCount: 5, columnCount: 4 }]);
});

test('cache keys isolate user, role, project and context', () => {
  const context = createContext();
  const editorP1 = vm.runInContext(
    `qltdGanttCacheBaseKey_('P1', { email: 'user@example.com', role: 'EDITOR', deptCode: 'D1', context: 'PROJECT_DATA' })`,
    context
  );
  const viewerP1 = vm.runInContext(
    `qltdGanttCacheBaseKey_('P1', { email: 'user@example.com', role: 'VIEWER', deptCode: 'D1', context: 'PROJECT_DATA' })`,
    context
  );
  const editorP2 = vm.runInContext(
    `qltdGanttCacheBaseKey_('P2', { email: 'user@example.com', role: 'EDITOR', deptCode: 'D1', context: 'PROJECT_DATA' })`,
    context
  );
  const otherUser = vm.runInContext(
    `qltdGanttCacheBaseKey_('P1', { email: 'other@example.com', role: 'EDITOR', deptCode: 'D1', context: 'PROJECT_DATA' })`,
    context
  );
  assert.notEqual(editorP1, viewerP1);
  assert.notEqual(editorP1, editorP2);
  assert.notEqual(editorP1, otherUser);
});

test('scoped invalidation preserves registry entries for other access contexts', () => {
  const context = createContext();
  const values = new Map();
  context.CacheService = {
    getScriptCache: () => ({
      get: (key) => values.get(key) || null,
      put: (key, value) => values.set(key, value),
      remove: (key) => values.delete(key),
      removeAll: (keys) => keys.forEach((key) => values.delete(key))
    })
  };
  const editorContext = {
    email: 'user@example.com', role: 'EDITOR', deptCode: 'D1', context: 'PROJECT_DATA'
  };
  const viewerContext = {
    email: 'viewer@example.com', role: 'VIEWER', deptCode: 'D1', context: 'PROJECT_DATA'
  };
  context.__editorContext = editorContext;
  context.__viewerContext = viewerContext;
  const editorBase = vm.runInContext("qltdGanttCacheBaseKey_('P1', __editorContext)", context);
  const viewerBase = vm.runInContext("qltdGanttCacheBaseKey_('P1', __viewerContext)", context);
  const registryKey = vm.runInContext("qltdGanttCacheRegistryKey_('P1')", context);
  values.set(registryKey, JSON.stringify([editorBase, viewerBase]));
  values.set(`${editorBase}_M`, JSON.stringify({ chunkCount: 1 }));
  values.set(`${editorBase}_C0`, 'editor');
  values.set(`${viewerBase}_M`, JSON.stringify({ chunkCount: 1 }));
  values.set(`${viewerBase}_C0`, 'viewer');

  const result = vm.runInContext("qltdGanttInvalidateCache_('P1', __editorContext)", context);

  assert.equal(result.success, true);
  assert.equal(values.has(`${editorBase}_M`), false);
  assert.equal(values.has(`${editorBase}_C0`), false);
  assert.equal(values.has(`${viewerBase}_M`), true);
  assert.equal(values.has(`${viewerBase}_C0`), true);
  assert.deepEqual(JSON.parse(values.get(registryKey)), [viewerBase]);
});

test('dashboard projection cache is isolated from Gantt and uses a 60 second payload TTL', () => {
  const context = createContext();
  const writes = [];
  const values = new Map();
  context.CacheService = {
    getScriptCache: () => ({
      get: (key) => values.get(key) || null,
      putAll: (entries, ttl) => {
        writes.push({ type: 'chunks', ttl });
        Object.entries(entries).forEach(([key, value]) => values.set(key, value));
      },
      put: (key, value, ttl) => {
        writes.push({ type: key.endsWith('_M') ? 'manifest' : 'registry', ttl });
        values.set(key, value);
      }
    })
  };
  context.__accessContext = {
    email: 'user@example.com', role: 'EDITOR', deptCode: 'D1', context: 'PROJECT_DATA'
  };
  context.__payload = { success: true, projectCode: 'P1', data: [{ id: 'T1' }] };
  const ganttBase = vm.runInContext("qltdGanttCacheBaseKey_('P1', __accessContext)", context);
  const dashboardBase = vm.runInContext(
    "qltdGanttCacheBaseKey_('P1', qltdDashboardCacheAccessContext_(__accessContext))",
    context
  );
  const result = vm.runInContext(
    "qltdGanttCachePut_('P1', __payload, qltdDashboardCacheAccessContext_(__accessContext), QLTD_DASHBOARD_CACHE_TTL_SECONDS)",
    context
  );

  assert.equal(result.stored, true);
  assert.notEqual(ganttBase, dashboardBase);
  assert.deepEqual(writes.filter((write) => write.type !== 'registry').map((write) => write.ttl), [60, 60]);
});

test('dashboard summary preserves KPI summary and excludes raw rows and links', () => {
  const context = createContext();
  let buildOptions;
  context.qltdGanttCacheGet_ = () => null;
  context.qltdGanttBuildDataForProject_ = (_projectCode, _startedAt, options) => {
    buildOptions = options;
    return {
    success: true,
    projectCode: 'P1',
    projectName: 'Project 1',
    sourceSheet: 'Cong_viec',
    data: [{
      id: 'T1',
      text: 'Task 1',
      code: 'CV1',
      status: 'IN_PROGRESS',
      progress: 0.5,
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      owner: 'PTDA',
      zone: 'Z1',
      hangMuc: 'HM1',
      raw: { Internal: 'must not leak' }
    }],
    links: [{ id: 'L1', source: 'T1', target: 'T2' }],
    summary: { total: 1, inProgress: 1 },
    warnings: [],
    performance: { generatedAt: '2026-07-30T00:00:00.000Z' },
    apiStatus: 'CONNECTED'
    };
  };
  context.qltdGanttCachePut_ = () => ({ stored: true });
  const result = vm.runInContext(`qltdDashboardGetSummaryForProject_('P1', {
    email: 'user@example.com', role: 'EDITOR', deptCode: 'D1', context: 'PROJECT_DATA'
  })`, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildOptions)),
    { includeLinks: false, dashboardProjection: true }
  );
  assert.deepEqual(result.summary, { total: 1, inProgress: 1 });
  assert.equal(result.links, undefined);
  assert.equal(result.data[0].raw, undefined);
  assert.equal(result.data[0].text, 'Task 1');
  assert.equal(result.performance.fullGanttTaskCount, 1);
  assert.equal(result.performance.fullGanttLinkCount, 0);
  assert.equal(result.performance.linksBuilt, 0);
  assert.equal(result.performance.rawRowsReturned, 0);
});

test('dashboard context rows keep only hierarchy fields needed by the resolver', () => {
  const context = createContext();
  context.__headers = [
    'UID', 'Zone', 'Loai cong trinh', 'Cong trinh', 'Hang muc/Tang', 'WBS_LEVEL_SYS', 'InternalNote'
  ];
  context.__row = ['T1', 'Z1', 'Háº¡ táº§ng', 'CT1', 'HM1', 2, 'must not copy'];
  const result = JSON.parse(vm.runInContext(
    'JSON.stringify(qltdGanttBuildContextRawRow_(__headers, __row))',
    context
  ));
  assert.deepEqual(result, {
    Zone: 'Z1',
    'Loai cong trinh': 'Háº¡ táº§ng',
    'Cong trinh': 'CT1',
    'Hang muc/Tang': 'HM1',
    WBS_LEVEL_SYS: 2
  });
});

function buildFixtureProjection(source) {
  const context = createContext(source);
  context.__values = [
    ['id', 'wbs', 'cong_viec', 'bat_dau_ke_hoach', 'ket_thuc_ke_hoach', 'predecessor', 'milestone', 'parent'],
    ['1', 'I', 'Nhóm LK 01', '2026-01-01', '2026-01-10', '', '', '0'],
    ['2', 'I.1', 'Thi công móng', '2026-01-02', '2026-01-05', '1FS', '', '0'],
    ['3', 'I.2', 'Mốc nghiệm thu', '2026-01-10', '2026-01-10', '2FS', 'TRUE', '0']
  ];
  return JSON.parse(vm.runInContext(`(() => {
    const warnings = [];
    const detected = qltdGanttDetectHeader_(__values);
    const tasks = qltdGanttBuildTasks_(__values, detected, warnings, 'Tien_do_tong_hop');
    qltdGanttApplyWbsParents_(tasks, warnings);
    const links = qltdGanttBuildLinks_(tasks, warnings);
    return JSON.stringify({
      taskCount: tasks.length,
      linkCount: links.length,
      milestoneCount: tasks.filter((task) => task.type === 'milestone').length,
      tasks: tasks.map((task) => ({ id: task.id, wbs: task.wbs, parent: task.parent, text: task.text, type: task.type })),
      links: links.map((link) => ({ source: link.source, target: link.target, relation: link.relation }))
    });
  })()`, context));
}

test('task, link, WBS, milestone and task names match the stable fixture', () => {
  const expectedProjection = {
    taskCount: 3,
    linkCount: 2,
    milestoneCount: 1,
    tasks: [
      { id: '1', wbs: 'I', parent: '0', text: 'Nhóm LK 01', type: 'task' },
      { id: '2', wbs: 'I.1', parent: '1', text: 'Thi công móng', type: 'task' },
      { id: '3', wbs: 'I.2', parent: '1', text: 'Mốc nghiệm thu', type: 'milestone' }
    ],
    links: [
      { source: '1', target: '2', relation: 'FS' },
      { source: '2', target: '3', relation: 'FS' }
    ]
  };
  assert.deepEqual(buildFixtureProjection(currentSource), expectedProjection);
});

test('Gantt Apps Script service does not declare duplicate named functions', () => {
  const names = Array.from(currentSource.matchAll(/^\s*function\s+([A-Za-z0-9_$]+)\s*\(/gm), (match) => match[1]);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(duplicates, []);
});
