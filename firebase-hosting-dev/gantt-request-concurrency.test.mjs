import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function isIdentifierChar(char) {
  return !!char && /[A-Za-z0-9_$]/.test(char);
}

function skipQuotedString(source, start, quote) {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === quote) return index + 1;
  }
  throw new Error(`Unclosed ${quote} string at ${start}`);
}

function skipLineComment(source, start) {
  const end = source.indexOf('\n', start + 2);
  return end < 0 ? source.length : end + 1;
}

function skipBlockComment(source, start) {
  const end = source.indexOf('*/', start + 2);
  if (end < 0) throw new Error(`Unclosed block comment at ${start}`);
  return end + 2;
}

function skipTemplateExpression(source, start) {
  let depth = 1;
  for (let index = start; index < source.length;) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  throw new Error(`Unclosed template expression at ${start - 2}`);
}

function skipTemplateLiteral(source, start) {
  for (let index = start + 1; index < source.length;) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '`') return index + 1;
    if (source[index] === '$' && source[index + 1] === '{') {
      index = skipTemplateExpression(source, index + 2);
      continue;
    }
    index += 1;
  }
  throw new Error(`Unclosed template literal at ${start}`);
}

function skipNonCode(source, index) {
  if (source[index] === "'" || source[index] === '"') {
    return skipQuotedString(source, index, source[index]);
  }
  if (source[index] === '`') return skipTemplateLiteral(source, index);
  if (source[index] === '/' && source[index + 1] === '/') return skipLineComment(source, index);
  if (source[index] === '/' && source[index + 1] === '*') return skipBlockComment(source, index);
  return index;
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    const skipped = skipNonCode(source, index);
    if (skipped === index) return index;
    index = skipped;
  }
  return index;
}

function findMatchingDelimiter(source, start, open, close) {
  assert.equal(source[start], open, `Expected ${open} at ${start}`);
  let depth = 0;
  for (let index = start; index < source.length;) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  throw new Error(`Unclosed ${open} at ${start}`);
}

function findFunctionDeclaration(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPattern = new RegExp(`^(async\\s+)?function\\s+${escapedName}\\s*\\(`, 'gm');
  const matches = Array.from(source.matchAll(declarationPattern));
  assert.equal(matches.length, 1, `Expected one top-level function ${name}, found ${matches.length}`);
  const start = matches[0].index;
  const functionStart = source.indexOf('function', start);
  const nameStart = source.indexOf(name, functionStart + 'function'.length);
  assert.equal(isIdentifierChar(source[nameStart + name.length]), false, `Invalid function name boundary for ${name}`);
  return { start, functionStart, nameEnd: nameStart + name.length };
}

function extractFunction(source, name) {
  const declaration = findFunctionDeclaration(source, name);
  const parametersStart = skipTrivia(source, declaration.nameEnd);
  assert.equal(source[parametersStart], '(', `Missing parameters for ${name}`);
  const parametersEnd = findMatchingDelimiter(source, parametersStart, '(', ')');
  const bodyStart = skipTrivia(source, parametersEnd + 1);
  assert.equal(source[bodyStart], '{', `Missing body for ${name}`);
  const bodyEnd = findMatchingDelimiter(source, bodyStart, '{', '}');
  return source.slice(declaration.start, bodyEnd + 1);
}

const helpersSource = [
  'const qltdGanttDataRequests = new Map();',
  'let qltdGanttRequestTail = Promise.resolve();',
  'const QLTD_GANTT_REQUEST_TIMEOUT_MS = 40000;',
  'const QLTD_GANTT_BUSY_RETRY_DELAY_MS = 1500;',
  'const QLTD_GANTT_BUSY_MAX_DELAY_MS = 6000;',
  'const QLTD_GANTT_BUSY_MAX_ATTEMPTS = 4;',
  extractFunction(appSource, 'qltdWeb07GetOrCreateGanttRequest'),
  extractFunction(appSource, 'qltdWeb07IsGanttBusyResponse'),
  extractFunction(appSource, 'qltdWeb07Delay'),
  extractFunction(appSource, 'qltdWeb07GetGanttBusyRetryDelay'),
  extractFunction(appSource, 'qltdWeb07FetchGanttPayload'),
  extractFunction(appSource, 'qltdWeb07RequestGanttPayload')
].join('\n');

const context = {
  AbortController,
  Error,
  Map,
  Math,
  Number,
  Promise,
  String,
  console: { warn() {} },
  window: { setTimeout, clearTimeout },
  fetchBackendJson: () => { throw new Error('A test fetcher is required'); }
};
vm.createContext(context);
assert.doesNotThrow(() => new vm.Script(helpersSource));
vm.runInContext(`${helpersSource}\nthis.api = { qltdWeb07GetOrCreateGanttRequest, qltdWeb07FetchGanttPayload, qltdWeb07RequestGanttPayload };`, context);

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createMainMilestoneSaveHarness({
  initialProject = 'P1',
  initialIds = [],
  persistSnapshot = async () => ({ success: true })
} = {}) {
  const cacheWrites = [];
  const milestoneSaveContext = {
    Array,
    Boolean,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    initialProject,
    initialIds,
    persistSnapshot,
    currentUserProfile: { email: 'admin@example.com' },
    getMainMilestoneProjectKey: (projectCode) => String(projectCode || ''),
    cacheMainMilestonesForProject: (projectKey, _payload, snapshot) => {
      cacheWrites.push({
        projectKey,
        ids: Array.from(snapshot.ids),
        orphanKeys: Array.from(snapshot.orphanKeys)
      });
    }
  };
  vm.createContext(milestoneSaveContext);
  vm.runInContext(
    [
      'const qltdGanttPayload = null;',
      'let qltdCurrentMainMilestoneProjectKey = initialProject;',
      'let qltdMainMilestoneKeys = new Set(initialIds);',
      'let qltdMainMilestoneOrphanKeys = new Set();',
      'let qltdMainMilestoneMigration = { validCount: qltdMainMilestoneKeys.size };',
      'const qltdMainMilestoneSaveQueues = new Map();',
      'async function qltdMainMilestonePersistSaveSnapshot(snapshot) { return persistSnapshot(snapshot); }',
      extractFunction(appSource, 'qltdMainMilestoneCloneIds'),
      extractFunction(appSource, 'qltdMainMilestoneGetSaveQueue'),
      extractFunction(appSource, 'qltdMainMilestoneCreateSaveSnapshot'),
      extractFunction(appSource, 'qltdMainMilestoneEnqueueSave'),
      extractFunction(appSource, 'saveMainMilestonesForProject'),
      extractFunction(appSource, 'qltdMainMilestoneApplySaveResult'),
      `this.api = {
        createSnapshot: qltdMainMilestoneCreateSaveSnapshot,
        enqueue: qltdMainMilestoneEnqueueSave,
        save: saveMainMilestonesForProject,
        apply: qltdMainMilestoneApplySaveResult,
        setCurrentProject(projectKey) {
          qltdCurrentMainMilestoneProjectKey = projectKey;
        },
        setState(ids) {
          qltdMainMilestoneKeys = new Set(ids);
          qltdMainMilestoneMigration.validCount = qltdMainMilestoneKeys.size;
        },
        getState() {
          return {
            projectKey: qltdCurrentMainMilestoneProjectKey,
            ids: Array.from(qltdMainMilestoneKeys),
            validCount: qltdMainMilestoneMigration.validCount
          };
        }
      };`
    ].join('\n'),
    milestoneSaveContext
  );
  return { api: milestoneSaveContext.api, cacheWrites };
}

test('extractor handles async defaults and ignores comment/string lookalikes', () => {
  const fixture = [
    '// function target(options = {}) { return "comment"; }',
    'const stringCopy = "function target(options = {}) { return string; }";',
    'const templateCopy = `function target(options = {}) { return template; }`;',
    'async function target(options = { nested: true }) {',
    '  const value = `nested ${{ key: "value" }.key}`;',
    '  return options.nested ? value : "}";',
    '}'
  ].join('\n');
  const extracted = extractFunction(fixture, 'target');
  assert.match(extracted, /^async function target\(options = \{ nested: true \}\)/);
  assert.doesNotMatch(extracted, /comment|stringCopy|templateCopy/);
  assert.doesNotThrow(() => new vm.Script(extracted));
});

test('two calls for one project share a single physical request', async () => {
  let factoryCalls = 0;
  let resolveRequest;
  const factory = () => {
    factoryCalls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };
  const first = context.api.qltdWeb07GetOrCreateGanttRequest('P1', factory);
  const second = context.api.qltdWeb07GetOrCreateGanttRequest('P1', factory);
  assert.equal(first, second);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(factoryCalls, 1);
  resolveRequest({ success: true });
  await first;

  const third = context.api.qltdWeb07GetOrCreateGanttRequest('P1', async () => {
    factoryCalls += 1;
    return { success: true };
  });
  await third;
  assert.equal(factoryCalls, 2);
});

test('requests for different projects and force refreshes run in one physical lane', async () => {
  const events = [];
  let releaseFirst;
  const first = context.api.qltdWeb07GetOrCreateGanttRequest('P1', () => {
    events.push('P1:start');
    return new Promise((resolve) => {
      releaseFirst = () => {
        events.push('P1:end');
        resolve({ success: true });
      };
    });
  });
  const second = context.api.qltdWeb07GetOrCreateGanttRequest('P2', async () => {
    events.push('P2:start');
    return { success: true };
  });
  const forced = context.api.qltdWeb07GetOrCreateGanttRequest('P2::force', async () => {
    events.push('P2:force:start');
    return { success: true };
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ['P1:start']);
  releaseFirst();
  await Promise.all([first, second, forced]);
  assert.deepEqual(events, ['P1:start', 'P1:end', 'P2:start', 'P2:force:start']);
});

test('a failed physical request does not block the next project', async () => {
  const events = [];
  const failed = context.api.qltdWeb07GetOrCreateGanttRequest('FAIL', async () => {
    events.push('FAIL');
    throw new Error('expected failure');
  });
  const next = context.api.qltdWeb07GetOrCreateGanttRequest('NEXT', async () => {
    events.push('NEXT');
    return { success: true };
  });

  await assert.rejects(failed, /expected failure/);
  assert.equal((await next).success, true);
  assert.deepEqual(events, ['FAIL', 'NEXT']);
});

test('Gantt request aborts with a controlled timeout', async () => {
  const fetcher = (action, params, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(
    context.api.qltdWeb07FetchGanttPayload('P1', { timeoutMs: 10, fetcher, delay: async () => {} }),
    (error) => error.code === 'GANTT_REQUEST_TIMEOUT' && /Quá thời gian tải Gantt/.test(error.message)
  );
});

test('GANTT_BUSY_RETRY three times then succeeds on the fourth attempt', async () => {
  let requestCount = 0;
  let delayCount = 0;
  const delayValues = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const result = await context.api.qltdWeb07FetchGanttPayload('P1', {
    timeoutMs: 1000,
    fetcher: async () => {
      requestCount += 1;
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return requestCount < 4
        ? { success: false, error: 'GANTT_BUSY_RETRY', retryAfterMs: 1 }
        : { success: true, data: [{ id: '1' }] };
    },
    delay: async (ms) => {
      delayCount += 1;
      delayValues.push(ms);
    }
  });
  assert.equal(result.success, true);
  assert.equal(requestCount, 4);
  assert.equal(delayCount, 3);
  assert.deepEqual(delayValues, [1500, 3000, 6000]);
  assert.equal(maxActiveRequests, 1);
});

test('GANTT_BUSY_RETRY stops at the bounded maximum', async () => {
  let requestCount = 0;
  let retryNotices = 0;
  await assert.rejects(
    context.api.qltdWeb07FetchGanttPayload('P1', {
      timeoutMs: 1000,
      fetcher: async () => {
        requestCount += 1;
        return { success: false, error: 'GANTT_BUSY_RETRY' };
      },
      delay: async () => {},
      onBusyRetry: () => { retryNotices += 1; }
    }),
    (error) => error.code === 'GANTT_BUSY_RETRY'
  );
  assert.equal(requestCount, 4);
  assert.equal(retryNotices, 3);
});

test('ganttData fetch passes AbortController signal and auto-load is view scoped', () => {
  const fetchSource = extractFunction(appSource, 'fetchBackendJson');
  assert.match(fetchSource, /signal: options\.signal/);
  const projectOptionsSource = extractFunction(appSource, 'renderProjectOptions');
  assert.match(projectOptionsSource, /qltdActiveView === 'dashboard'\) loadDashboardSummaryForSelectedProject/);
  assert.match(projectOptionsSource, /qltdActiveView === 'gantt'\) loadGanttDataForSelectedProject/);
});

test('loader protects current project from stale success and stale error rendering', () => {
  const loaderSource = extractFunction(appSource, 'qltdWeb07LoadGanttDataForSelectedProject');
  assert.match(loaderSource, /const requestSeq = \+\+qltdGanttLoadRequestSeq/);
  assert.equal(
    (loaderSource.match(/!qltdWeb07IsCurrentGanttLoad\(projectCode, requestSeq\)/g) || []).length,
    3,
    'Success before/after milestone hydration and the error path must reject stale UI writes.'
  );
  assert.match(
    loaderSource,
    /await loadMainMilestonesForProject\(projectCode, payload\);\s+if \(!qltdWeb07IsCurrentGanttLoad\(projectCode, requestSeq\)\) return payload;/
  );
  assert.match(loaderSource, /return payload/);
  assert.match(loaderSource, /return null/);
  assert.match(loaderSource, /onBusyRetry/);
  assert.match(loaderSource, /renderGanttBusyRetry\(projectCode, retryState\)/);
});

test('main milestone loader rejects a stale project response before state/cache mutation', async () => {
  let resolveA;
  let resolveB;
  const applied = [];
  const cached = [];
  const milestoneContext = {
    Promise,
    String,
    console: { log() {}, warn() {} },
    qltdGanttPayload: null,
    currentUserProfile: { email: 'admin@example.com' },
    db: null,
    getMainMilestoneProjectKey: (projectCode) => String(projectCode || ''),
    getMainMilestoneProjectKeyAliases: (projectCode) => [String(projectCode || '')],
    getMainMilestonesFromApiPayload: (payload) => payload?.mainMilestoneIds || [],
    readCachedMainMilestones: () => [],
    applyMainMilestoneMigration: (values, _tasks, projectKey, source) => {
      applied.push({ projectKey, source, values: [...values] });
      return { migratedCount: 0 };
    },
    fetchBackendJson: (_action, params) => new Promise((resolve) => {
      if (params.projectCode === 'A') resolveA = resolve;
      else if (params.projectCode === 'B') resolveB = resolve;
    }),
    cacheMainMilestonesForProject: (projectKey) => cached.push(projectKey),
    hasMainMilestoneApiSource: (payload) => payload?.mainMilestoneSource === 'GOOGLE_SHEET',
    getDoc: () => { throw new Error('Firestore must not be reached'); },
    getMainMilestoneDocRef: () => null
  };
  vm.createContext(milestoneContext);
  vm.runInContext(
    [
      "let qltdCurrentMainMilestoneProjectKey = '';",
      'let qltdMainMilestoneLoadRequestSeq = 0;',
      extractFunction(appSource, 'isCurrentMainMilestoneLoad'),
      extractFunction(appSource, 'loadMainMilestonesForProject'),
      'this.loadMainMilestones = loadMainMilestonesForProject;',
      'this.getCurrentProject = () => qltdCurrentMainMilestoneProjectKey;'
    ].join('\n'),
    milestoneContext
  );

  const loadA = milestoneContext.loadMainMilestones('A', {
    projectCode: 'A',
    data: [{ id: '1' }]
  });
  const loadB = milestoneContext.loadMainMilestones('B', {
    projectCode: 'B',
    data: [{ id: '2' }]
  });

  assert.equal(typeof resolveA, 'function');
  assert.equal(typeof resolveB, 'function');
  resolveB({ success: true, ids: ['B|UID:2'], mainMilestoneIds: ['B|UID:2'] });
  await loadB;
  resolveA({ success: true, ids: ['A|UID:1'], mainMilestoneIds: ['A|UID:1'] });
  await loadA;

  assert.equal(milestoneContext.getCurrentProject(), 'B');
  assert.deepEqual(
    applied.map(({ projectKey, source }) => [projectKey, source]),
    [
      ['A', 'LOCAL_STORAGE'],
      ['B', 'LOCAL_STORAGE'],
      ['B', 'APPS_SCRIPT_API']
    ]
  );
  assert.deepEqual(cached, ['B']);
});

test('main milestone save snapshots are immutable and do not retain a mutable Set reference', () => {
  const { api } = createMainMilestoneSaveHarness();
  const ids = new Set(['P1|UID:A']);
  const previousIds = new Set(['P1|UID:BEFORE']);
  const snapshot = api.createSnapshot('P1', ids, previousIds, { actorEmail: 'owner@example.com' });

  ids.add('P1|UID:B');
  previousIds.clear();

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.ids), true);
  assert.equal(Object.isFrozen(snapshot.previousIds), true);
  assert.deepEqual(Array.from(snapshot.ids), ['P1|UID:A']);
  assert.deepEqual(Array.from(snapshot.previousIds), ['P1|UID:BEFORE']);
  assert.equal(snapshot.projectKey, 'P1');
  assert.equal(snapshot.sequence, 1);
});

test('two rapid milestone toggles cannot persist in reverse response order', async () => {
  const firstResponse = createDeferred();
  const secondResponse = createDeferred();
  const events = [];
  let backendIds = [];
  const { api } = createMainMilestoneSaveHarness({
    persistSnapshot: async (snapshot) => {
      events.push(`start:${snapshot.sequence}`);
      const result = await (snapshot.sequence === 1 ? firstResponse.promise : secondResponse.promise);
      if (result.success) backendIds = Array.from(snapshot.ids);
      events.push(`end:${snapshot.sequence}`);
      return result;
    }
  });
  const firstSnapshot = api.createSnapshot('P1', ['P1|UID:A'], []);
  const secondSnapshot = api.createSnapshot('P1', ['P1|UID:A', 'P1|UID:B'], ['P1|UID:A']);
  const firstSave = api.enqueue(firstSnapshot);
  const secondSave = api.enqueue(secondSnapshot);

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ['start:1']);

  secondResponse.resolve({ success: true });
  await Promise.resolve();
  assert.deepEqual(events, ['start:1'], 'second write is not dispatched while the first write is pending');

  firstResponse.resolve({ success: true });
  const [firstResult, secondResult] = await Promise.all([firstSave, secondSave]);

  assert.deepEqual(events, ['start:1', 'end:1', 'start:2', 'end:2']);
  assert.equal(firstResult.isLatest, false);
  assert.equal(secondResult.isLatest, true);
  assert.deepEqual(backendIds, ['P1|UID:A', 'P1|UID:B']);
  assert.deepEqual(Array.from(secondResult.finalIds), backendIds);
});

test('two rapid milestone toggles keep the first successful state when the latest save fails', async () => {
  let backendIds = [];
  const { api, cacheWrites } = createMainMilestoneSaveHarness({
    persistSnapshot: async (snapshot) => {
      if (snapshot.sequence === 2) return { success: false, message: 'SECOND_FAILED' };
      backendIds = Array.from(snapshot.ids);
      return { success: true };
    }
  });

  const firstSave = api.save('P1', { projectCode: 'P1' }, {
    ids: ['P1|UID:A'],
    previousIds: [],
    orphanCount: 0
  });
  const secondSave = api.save('P1', { projectCode: 'P1' }, {
    ids: ['P1|UID:A', 'P1|UID:B'],
    previousIds: ['P1|UID:A'],
    orphanCount: 0
  });
  api.setState(['P1|UID:A', 'P1|UID:B']);

  const firstResult = await firstSave;
  assert.equal(api.apply(firstResult, 'P1'), false, 'an older success cannot replace newer optimistic UI');
  const secondResult = await secondSave;
  assert.equal(api.apply(secondResult, 'P1'), true);

  assert.equal(firstResult.success, true);
  assert.equal(firstResult.isLatest, false);
  assert.equal(secondResult.success, false);
  assert.equal(secondResult.isLatest, true);
  assert.deepEqual(Array.from(secondResult.finalIds), ['P1|UID:A']);
  assert.deepEqual(backendIds, ['P1|UID:A']);
  assert.deepEqual(Array.from(api.getState().ids), ['P1|UID:A']);
  assert.deepEqual(cacheWrites, [{
    projectKey: 'P1',
    ids: ['P1|UID:A'],
    orphanKeys: []
  }]);
});

test('two rapid milestone toggles keep the latest successful state after the first save fails', async () => {
  let backendIds = [];
  const { api, cacheWrites } = createMainMilestoneSaveHarness({
    persistSnapshot: async (snapshot) => {
      if (snapshot.sequence === 1) return { success: false, message: 'FIRST_FAILED' };
      backendIds = Array.from(snapshot.ids);
      return { success: true };
    }
  });

  const firstSave = api.save('P1', { projectCode: 'P1' }, {
    ids: ['P1|UID:A'],
    previousIds: [],
    orphanCount: 0
  });
  const secondSave = api.save('P1', { projectCode: 'P1' }, {
    ids: ['P1|UID:A', 'P1|UID:B'],
    previousIds: ['P1|UID:A'],
    orphanCount: 0
  });
  api.setState(['P1|UID:A', 'P1|UID:B']);

  const firstResult = await firstSave;
  assert.equal(api.apply(firstResult, 'P1'), false, 'an older failure cannot roll back newer optimistic UI');
  const secondResult = await secondSave;
  assert.equal(api.apply(secondResult, 'P1'), true);

  assert.equal(firstResult.success, false);
  assert.equal(firstResult.isLatest, false);
  assert.equal(secondResult.success, true);
  assert.equal(secondResult.isLatest, true);
  assert.deepEqual(Array.from(secondResult.finalIds), ['P1|UID:A', 'P1|UID:B']);
  assert.deepEqual(backendIds, ['P1|UID:A', 'P1|UID:B']);
  assert.deepEqual(Array.from(api.getState().ids), backendIds);
  assert.deepEqual(cacheWrites, [{
    projectKey: 'P1',
    ids: ['P1|UID:A', 'P1|UID:B'],
    orphanKeys: []
  }]);
});

test('switching project while an old milestone save is pending cannot mutate the new project', async () => {
  const oldProjectResponse = createDeferred();
  const { api, cacheWrites } = createMainMilestoneSaveHarness({
    persistSnapshot: () => oldProjectResponse.promise
  });

  const oldProjectSave = api.save('P1', { projectCode: 'P1' }, {
    ids: ['P1|UID:A'],
    previousIds: [],
    orphanCount: 0
  });
  api.setCurrentProject('P2');
  api.setState(['P2|UID:X']);
  oldProjectResponse.resolve({ success: true });

  const result = await oldProjectSave;
  assert.equal(result.isLatest, true);
  assert.equal(api.apply(result, 'P1'), false);
  assert.deepEqual(Array.from(api.getState().ids), ['P2|UID:X']);
  assert.equal(api.getState().projectKey, 'P2');
  assert.deepEqual(cacheWrites, []);

  const toggleSource = extractFunction(appSource, 'toggleMainMilestone');
  assert.match(
    toggleSource,
    /if \(!qltdMainMilestoneApplySaveResult\(result, projectKey\)\) return;\s+if \(!result\.success\)/
  );
  assert.match(toggleSource, /updateMainMilestoneToolbarState\(\);\s+renderDashboardFromGanttData/);
});

test('A becomes stale during backoff and only the newly selected B is current', () => {
  let selectedProjectCode = 'A';
  const staleContext = {
    String,
    document: {
      getElementById: () => ({ get value() { return selectedProjectCode; } })
    },
    getStoredProjectCode: () => ''
  };
  vm.createContext(staleContext);
  vm.runInContext(`let qltdGanttLoadRequestSeq = 1;\n${extractFunction(appSource, 'qltdWeb07IsCurrentGanttLoad')}\nthis.isCurrent = qltdWeb07IsCurrentGanttLoad;\nthis.nextRequest = () => { qltdGanttLoadRequestSeq += 1; };`, staleContext);

  assert.equal(staleContext.isCurrent('A', 1), true);
  selectedProjectCode = 'B';
  assert.equal(staleContext.isCurrent('A', 1), false);
  staleContext.nextRequest();
  assert.equal(staleContext.isCurrent('B', 2), true);
});

test('all frontend ganttData physical calls go through the shared coordinator', () => {
  assert.equal((appSource.match(/fetchBackendJson\s*\(\s*['"]ganttData['"]/g) || []).length, 0);
  assert.equal((appSource.match(/fetcher\s*\(\s*['"]ganttData['"]/g) || []).length, 1);
  const departmentSource = extractFunction(appSource, 'getDepartmentDashboardPayloads');
  assert.match(departmentSource, /qltdRequestDashboardSummary\(code/);
  assert.doesNotMatch(departmentSource, /fetchBackendJson\s*\(/);
});

test('department dashboard A/B/C uses summary requests, preserves cache, and continues after error', async () => {
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const requested = [];
  const dashboardContext = {
    AbortController,
    Error,
    Map,
    Math,
    Number,
    Promise,
    String,
    console: { warn() {} },
    window: { setTimeout, clearTimeout },
    qltdProjectRegistry: ['A', 'B', 'C'].map((projectCode) => ({ projectCode })),
    qltdDepartmentDashboardCache: new Map(),
    qltdRequestDashboardSummary: async (projectCode) => {
      requested.push(projectCode);
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      if (projectCode === 'B') throw new Error('B failed');
      return { success: true, projectCode, data: [] };
    }
  };
  vm.createContext(dashboardContext);
  vm.runInContext(`${extractFunction(appSource, 'getDepartmentDashboardPayloads')}\nthis.runDashboard = getDepartmentDashboardPayloads;`, dashboardContext);

  const result = await dashboardContext.runDashboard('', false);
  assert.deepEqual(requested, ['A', 'B', 'C']);
  assert.equal(maxActiveRequests, 3);
  assert.deepEqual(Array.from(dashboardContext.qltdDepartmentDashboardCache.keys()), ['A', 'C']);
  assert.equal(result.payloads.length, 2);
  assert.equal(result.warnings.length, 1);

  requested.length = 0;
  const selectedResult = await dashboardContext.runDashboard('A', true);
  assert.deepEqual(requested, ['A']);
  assert.equal(selectedResult.payloads.length, 1);
});

test('department detail dashboard requests only the selected project and department', async () => {
  const requests = [];
  const dashboardContext = {
    Map,
    Promise,
    String,
    qltdProjectRegistry: ['A', 'B'].map((projectCode) => ({ projectCode })),
    qltdDepartmentDashboardDetailCache: new Map(),
    fetchBackendJson: async (action, params) => {
      requests.push({ action, params });
      return { success: true, projectCode: params.projectCode, departments: [] };
    }
  };
  vm.createContext(dashboardContext);
  vm.runInContext(
    `${extractFunction(appSource, 'getDepartmentDashboardDetailPayloads')}
     this.runDetails = getDepartmentDashboardDetailPayloads;`,
    dashboardContext
  );

  const result = await dashboardContext.runDetails('B', 'PTDA', false);
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{
    action: 'listDeptPlans',
    params: { projectCode: 'B', deptCode: 'PTDA' }
  }]);
  assert.equal(result.payloads.length, 1);
  assert.equal(result.warnings.length, 0);
});

test('terminal error exposes one Retry handler through the current project coordinator', () => {
  const errorSource = extractFunction(appSource, 'renderGanttError');
  assert.match(errorSource, /id="ganttRetryButton"/);
  assert.match(errorSource, /projectSelector/);
  assert.match(errorSource, /loadGanttDataForSelectedProject\(projectCode, \{ forceRefresh: true \}\)/);
  assert.equal((errorSource.match(/loadGanttDataForSelectedProject\(/g) || []).length, 1);

  const loaderSource = extractFunction(appSource, 'qltdWeb07LoadGanttDataForSelectedProject');
  assert.equal((loaderSource.match(/renderGanttError\(error\)/g) || []).length, 1);
});

test('stale project render cannot mutate DHTMLX after the container wait', async () => {
  const oldContainer = { querySelector: () => null };
  const newContainer = { querySelector: () => null };
  let currentContainer = oldContainer;
  let releaseContainerWait;
  let ganttMutations = 0;
  const renderContext = {
    document: {
      getElementById: (id) => id === 'web07GanttContainer' ? currentContainer : null
    },
    qltdWeb07EnsureGanttPolishStyles() {},
    qltdWeb07DecorateGanttToolbar() {},
    qltdWeb07BindExcelButton() {},
    qltdPrepareDhtmlxTask: (task) => task,
    ensureDhtmlxGanttLoaded: async () => ({
      init: () => { ganttMutations += 1; },
      clearAll: () => { ganttMutations += 1; },
      parse: () => { ganttMutations += 1; }
    }),
    qltdWeb07WaitForRenderableGanttContainer: () => new Promise((resolve) => {
      releaseContainerWait = resolve;
    }),
    requestAnimationFrame: () => { throw new Error('stale render must not schedule a final frame'); }
  };
  vm.createContext(renderContext);
  vm.runInContext(`let qltdDhtmlxGanttRenderSeq = 0;\n${extractFunction(appSource, 'qltdWeb07OwnsGanttRender')}\n${extractFunction(appSource, 'initDhtmlxGantt')}\nthis.startRender = initDhtmlxGantt;\nthis.invalidateRender = () => { qltdDhtmlxGanttRenderSeq += 1; };`, renderContext);

  const staleRender = renderContext.startRender([{ id: 'A', text: 'A' }], []);
  for (let index = 0; index < 8 && typeof releaseContainerWait !== 'function'; index += 1) {
    await Promise.resolve();
  }
  assert.equal(typeof releaseContainerWait, 'function');
  currentContainer = newContainer;
  renderContext.invalidateRender();
  releaseContainerWait(true);
  await staleRender;
  assert.equal(ganttMutations, 0);
});
