import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const ganttDataServiceSource = fs.readFileSync(
  new URL('../apps-script-dev-api/35_GANTT_DATA_SERVICE.js', import.meta.url),
  'utf8'
);
const taskContextResolverSource = fs.readFileSync(
  new URL('../apps-script-dev-api/35_TASK_CONTEXT_RESOLVER.js', import.meta.url),
  'utf8'
);
const baselineSnapshotSource = fs.readFileSync(
  new URL('../apps-script-dev-api/08_Chot_Ke_hoach_Goc.js', import.meta.url),
  'utf8'
);
const baselineServiceSource = fs.readFileSync(
  new URL('../apps-script-dev-api/75_GANTT_BASELINE_SERVICE.js', import.meta.url),
  'utf8'
);
const configSource = fs.readFileSync(
  new URL('../apps-script-dev-api/00_config.js', import.meta.url),
  'utf8'
);
const templateSource = fs.readFileSync(
  new URL('../apps-script-dev-api/13_Hoan_thien_Template_Goc.js', import.meta.url),
  'utf8'
);

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

function extractFunction(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(async\\s+)?function\\s+${escapedName}\\s*\\(`, 'gm');
  const matches = Array.from(source.matchAll(pattern));
  assert.equal(matches.length, 1, `Expected one function ${name}, found ${matches.length}`);
  const start = matches[0].index;
  const functionStart = source.indexOf('function', start);
  const nameStart = source.indexOf(name, functionStart + 8);
  assert.equal(isIdentifierChar(source[nameStart + name.length]), false);
  const parametersStart = skipTrivia(source, nameStart + name.length);
  const parametersEnd = findMatchingDelimiter(source, parametersStart, '(', ')');
  const bodyStart = skipTrivia(source, parametersEnd + 1);
  const bodyEnd = findMatchingDelimiter(source, bodyStart, '{', '}');
  return source.slice(start, bodyEnd + 1);
}

const comparisonFunctionNames = [
  'qltdGanttBaselineNormalizeTaskCode_',
  'qltdGanttBaselineNormalizeRef_',
  'qltdGanttBaselineIsCurrentBusinessTask_',
  'qltdGanttBaselineCurrentTaskCode_',
  'qltdGanttBaselineCurrentRef_',
  'qltdGanttBaselineCurrentStart_',
  'qltdGanttBaselineCurrentEnd_',
  'qltdGanttBaselineParseIsoUtc_',
  'qltdGanttBaselineDateForGantt_',
  'qltdGanttBaselineBuildIndex_',
  'qltdGanttBaselineUniqueCandidates_',
  'qltdGanttBaselineEvaluateMatched_',
  'qltdGanttBaselineBuildComparisonModel_',
  'qltdGanttBaselineBuildKpis_',
  'qltdGanttBaselineApplyComparisonToTasks_',
  'qltdGanttBaselineFilterMatches_'
];

const comparisonContext = {
  Array,
  Date,
  Map,
  Math,
  Number,
  Object,
  Set,
  String
};
vm.createContext(comparisonContext);
vm.runInContext(
  `${comparisonFunctionNames.map((name) => extractFunction(appSource, name)).join('\n')}
this.api = {
  parse: qltdGanttBaselineParseIsoUtc_,
  build: qltdGanttBaselineBuildComparisonModel_,
  kpis: qltdGanttBaselineBuildKpis_,
  apply: qltdGanttBaselineApplyComparisonToTasks_,
  filterMatches: qltdGanttBaselineFilterMatches_
};`,
  comparisonContext
);

function currentTask(overrides = {}) {
  return {
    id: 'R1',
    code: 'CV-001',
    rowType: 'TASK',
    text: 'Công việc hiện hành',
    baselineStart: '2026-01-01',
    baselineEnd: '2026-01-10',
    start_date: '2026-01-03',
    end_date: '2026-01-12',
    type: 'task',
    mainMilestone: false,
    ...overrides
  };
}

function baselineTask(overrides = {}) {
  return {
    taskCode: 'CV-001',
    refId: 'R1',
    text: 'Công việc baseline',
    baselineStart: '2026-01-01',
    baselineEnd: '2026-01-10',
    milestoneCode: '',
    ...overrides
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('BL004 unique taskCode matches before refId', () => {
  const model = comparisonContext.api.build(
    [currentTask({ id: 'CURRENT-REF', code: 'CV-004' })],
    [baselineTask({ refId: 'BASELINE-REF', taskCode: 'CV-004' })],
    { version: 'BL004', type: 'DIEU_CHINH', status: 'REPLACED' }
  );
  assert.equal(model.currentResults[0].matchType, 'MATCHED_BY_TASK_CODE');
  assert.equal(model.currentResults[0].status, 'UNCHANGED');
});

test('BL001 duplicate taskCode falls back to unique refId for each record', () => {
  const model = comparisonContext.api.build(
    [
      currentTask({ id: 'R1', code: 'DUP' }),
      currentTask({ id: 'R2', code: 'DUP' })
    ],
    [
      baselineTask({ refId: 'R1', taskCode: 'DUP' }),
      baselineTask({ refId: 'R2', taskCode: 'DUP' })
    ],
    { version: 'BL001', type: 'LAN_DAU', status: 'REPLACED_INITIAL' }
  );
  assert.deepEqual(
    Array.from(model.currentResults, (item) => item.matchType),
    ['MATCHED_BY_REF_ID', 'MATCHED_BY_REF_ID']
  );
  assert.equal(model.baselineOnly.length, 0);
});

test('duplicate taskCode plus ambiguous ref never chooses first or last', () => {
  const model = comparisonContext.api.build(
    [
      currentTask({ id: 'R1', code: 'DUP' }),
      currentTask({ id: 'R1', code: 'DUP' })
    ],
    [
      baselineTask({ refId: 'R1', taskCode: 'DUP' }),
      baselineTask({ refId: 'R1', taskCode: 'DUP' })
    ],
    { version: 'BL001' }
  );
  assert.ok(model.currentResults.every((item) => item.status === 'AMBIGUOUS'));
  assert.equal(model.baselineOnly.length, 0);
  assert.equal(model.ambiguousBaselineRecords.length, 2);
});

test('synthetic ROW identifiers are never used for matching', () => {
  const model = comparisonContext.api.build(
    [currentTask({ id: 'ROW-47', code: '' })],
    [baselineTask({ refId: 'ROW-47', taskCode: '' })],
    { version: 'BL004' }
  );
  assert.equal(model.currentResults[0].status, 'AMBIGUOUS');
  assert.equal(model.currentResults[0].matchType, 'AMBIGUOUS');
  assert.equal(model.baselineOnly.length, 1);
});

test('ganttData task.id contract is the canonical Cong_viec Ref copied into baseline refId', () => {
  const mapperSource = extractFunction(ganttDataServiceSource, 'qltdGanttBuildTasks_');
  const resolverSource = extractFunction(taskContextResolverSource, 'qltdTaskContextResolveDataset_');
  const publicMapperSource = extractFunction(taskContextResolverSource, 'qltdTaskContextBuildPublicDataset_');
  const snapshotMapperSource = extractFunction(baselineSnapshotSource, 'chotKeHoachGocCoreV1_');
  const baselineRecordSource = extractFunction(baselineServiceSource, 'qltdGanttBaselineBuildRecords_');
  const frontendRefSource = extractFunction(appSource, 'qltdGanttBaselineCurrentRef_');

  assert.match(templateSource, /QLTD_TEMPLATE_CONG_VIEC_30_HEADERS_V1[\s\S]*?'ID'/);
  assert.match(configSource, /SO_THAM_CHIEU:\s*7/);
  assert.match(
    ganttDataServiceSource,
    /id:\s*\[[^\]]*'uid'[^\]]*'id'[^\]]*'so_tham_chieu'[^\]]*'ref'[^\]]*\]/
  );
  assert.match(
    mapperSource,
    /let id = String\(qltdGanttCell_\(row, headerIndex, 'id'\) \|\| ''\)\.trim\(\)/
  );
  assert.match(mapperSource, /tasks\.push\(\{\s*id:\s*id,/);
  assert.match(resolverSource, /task\.refId = String\(task\.id\)/);
  assert.match(publicMapperSource, /'refId'/);
  assert.match(publicMapperSource, /delete publicTask\[key\]/);
  assert.match(snapshotMapperSource, /const soThamChieu = row\[6\]/);
  assert.match(snapshotMapperSource, /output\.push\(\[\s*soThamChieu,/);
  assert.match(
    baselineRecordSource,
    /qltdGanttBaselineCell_\(row, headerMap, 'Ref gốc'\)/
  );
  assert.match(frontendRefSource, /task\?\.id/);
  assert.match(frontendRefSource, /\^ROW-\\d\+\$/);
});

test('current-only and baseline-only stay separate without fake Gantt rows', () => {
  const current = [currentTask({ id: 'NEW', code: 'NEW' })];
  const model = comparisonContext.api.build(
    current,
    [baselineTask({ refId: 'REMOVED', taskCode: 'REMOVED' })],
    { version: 'BL004' }
  );
  assert.equal(model.currentResults[0].status, 'CURRENT_ONLY');
  assert.equal(model.currentResults[0].label, 'Phát sinh sau BL004');
  assert.equal(model.baselineOnly.length, 1);
  const applied = comparisonContext.api.apply(current, model);
  assert.equal(applied.length, current.length);
  assert.ok(applied.every((task) => !String(task.id).includes('REMOVED')));
});

test('end delta negative, zero and positive use plan-change labels without Chậm', () => {
  const baseline = [baselineTask()];
  const scenarios = [
    ['2026-01-08', 'SHORTENED', -2],
    ['2026-01-10', 'UNCHANGED', 0],
    ['2026-01-13', 'DELAYED', 3]
  ];
  scenarios.forEach(([end, status, delta]) => {
    const model = comparisonContext.api.build(
      [currentTask({ baselineEnd: end })],
      baseline,
      { version: 'BL005' }
    );
    assert.equal(model.currentResults[0].status, status);
    assert.equal(model.currentResults[0].endDeltaDays, delta);
    assert.doesNotMatch(model.currentResults[0].label, /Chậm/i);
  });
});

test('start shift with unchanged end keeps the deadline classification', () => {
  const model = comparisonContext.api.build(
    [currentTask({ baselineStart: '2026-01-04', baselineEnd: '2026-01-10' })],
    [baselineTask()],
    { version: 'BL005' }
  );
  assert.equal(model.currentResults[0].status, 'START_SHIFT_SAME_END');
  assert.equal(model.currentResults[0].startDeltaDays, 3);
  assert.equal(model.currentResults[0].endDeltaDays, 0);
});

test('manual Date.UTC parser rejects invalid dates and is timezone independent', () => {
  const parsed = comparisonContext.api.parse('2026-03-01');
  assert.equal(parsed.ordinal, Date.UTC(2026, 2, 1) / 86400000);
  assert.equal(comparisonContext.api.parse('2026-02-30'), null);
  assert.match(extractFunction(appSource, 'qltdGanttBaselineParseIsoUtc_'), /Date\.UTC/);
});

test('AMBIGUOUS is excluded from the KPI evaluation denominator', () => {
  const model = comparisonContext.api.build(
    [
      currentTask({ id: 'R1', code: 'DUP' }),
      currentTask({ id: 'R1', code: 'DUP' }),
      currentTask({ id: 'R3', code: 'UNIQUE' })
    ],
    [
      baselineTask({ refId: 'R1', taskCode: 'DUP' }),
      baselineTask({ refId: 'R1', taskCode: 'DUP' }),
      baselineTask({ refId: 'R3', taskCode: 'UNIQUE' })
    ],
    { version: 'BL001' }
  );
  const kpis = comparisonContext.api.kpis(model);
  assert.equal(kpis.counts.AMBIGUOUS, 2);
  assert.equal(kpis.evaluationDenominator, 1);
  assert.equal(kpis.ambiguousExcluded, 2);
});

test('KPI denominator contains only matched tasks with evaluable dates', () => {
  const statuses = [
    'UNCHANGED',
    'DELAYED',
    'SHORTENED',
    'START_SHIFT_SAME_END',
    'CURRENT_ONLY',
    'INSUFFICIENT_DATES',
    'AMBIGUOUS'
  ];
  const kpis = comparisonContext.api.kpis({
    currentResults: statuses.map((status) => ({ status, matchType: status })),
    baselineOnly: [{ status: 'BASELINE_ONLY' }]
  });

  assert.equal(kpis.evaluationDenominator, 4);
  assert.equal(kpis.counts.CURRENT_ONLY, 1);
  assert.equal(kpis.counts.BASELINE_ONLY, 1);
  assert.equal(kpis.counts.INSUFFICIENT_DATES, 1);
  assert.equal(kpis.counts.AMBIGUOUS, 1);
});

test('comparison mode uses current planned dates, not actual dates, and preserves milestone fields', () => {
  const task = currentTask({
    type: 'milestone',
    mainMilestone: true,
    baselineStart: '2026-02-01',
    baselineEnd: '2026-02-02',
    start_date: '2026-03-01',
    end_date: '2026-03-02',
    actualStart: '2026-03-01',
    actualEnd: '2026-03-02'
  });
  const model = comparisonContext.api.build(
    [task],
    [baselineTask({ baselineStart: '2026-01-01', baselineEnd: '2026-01-02' })],
    { version: 'BL005' }
  );
  const applied = comparisonContext.api.apply([task], model)[0];
  assert.equal(applied.start_date, '2026-02-01');
  assert.equal(applied.end_date, '2026-02-02');
  assert.equal(applied.type, 'milestone');
  assert.equal(applied.mainMilestone, true);
});

test('task comparison leaves link arrays and source tasks unchanged', () => {
  const tasks = [currentTask()];
  const links = [{ id: 'L1', source: 'R1', target: 'R2', type: '0' }];
  const tasksBefore = structuredClone(tasks);
  const linksBefore = structuredClone(links);
  const model = comparisonContext.api.build(tasks, [baselineTask()], { version: 'BL005' });
  comparisonContext.api.apply(tasks, model);
  assert.deepEqual(tasks, tasksBefore);
  assert.deepEqual(links, linksBefore);
});

test('qltdGanttBaselineGetModel_ uses its projectCode parameter without a free code variable', () => {
  const modelContext = {
    Array,
    Object,
    String
  };
  vm.createContext(modelContext);
  vm.runInContext(
    `
const state = {
  selectedVersion: 'BL005',
  payload: {
    baseline: { version: 'BL005', status: 'ACTIVE' },
    data: [{ taskCode: 'CV-001' }]
  },
  model: null,
  modelCurrentTasks: null
};
let buildCalls = 0;
function qltdGanttBaselineGetProjectState_(projectCode) {
  if (projectCode !== '24-1.ĐB') throw new Error('wrong projectCode');
  return state;
}
function qltdGanttBaselineBuildComparisonModel_(currentTasks, baselineData, baselineMeta) {
  buildCalls += 1;
  return {
    version: baselineMeta.version,
    currentTasks,
    baselineData,
    baselineMeta
  };
}
${extractFunction(appSource, 'qltdGanttBaselineGetModel_')}
this.result = qltdGanttBaselineGetModel_('24-1.ĐB', [{ id: 'R1' }]);
this.state = state;
this.buildCalls = buildCalls;`,
    modelContext
  );
  assert.equal(Object.hasOwn(modelContext, 'code'), false);
  assert.equal(modelContext.buildCalls, 1);
  assert.equal(modelContext.result.baselineMeta.projectCode, '24-1.ĐB');
  assert.equal(modelContext.state.modelCurrentTasks[0].id, 'R1');
  assert.doesNotMatch(
    extractFunction(appSource, 'qltdGanttBaselineGetModel_'),
    /projectCode\s*:\s*code\b/
  );
});

function createControllerHarness() {
  let selectedProject = 'P1';
  const renderEvents = [];
  const fetchCalls = [];
  const controllerContext = {
    Array,
    Date,
    Error,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    console: { warn() {} },
    document: {
      getElementById(id) {
        if (id === 'projectSelector') return { value: selectedProject };
        return null;
      }
    },
    getStoredProjectCode: () => selectedProject,
    renderEvents,
    fetchCalls
  };
  vm.createContext(controllerContext);
  const controllerFunctions = [
    'qltdGanttBaselineCreateProjectState_',
    'qltdGanttBaselineGetProjectState_',
    'qltdGanttBaselinePayloadKey_',
    'qltdGanttBaselineGetOrCreateRequest_',
    'qltdGanttBaselineFetchVersions_',
    'qltdGanttBaselineFetchPayload_',
    'qltdGanttBaselineSelectedProjectCode_',
    'qltdGanttBaselineOwnsRequest_',
    'qltdGanttBaselineLoadSelectedVersion_',
    'qltdGanttBaselineActivateProject_',
    'qltdGanttBaselineToggle_',
    'qltdGanttBaselineSelectVersion_',
    'qltdGanttBaselineHandleProjectChange_'
  ];
  vm.runInContext(
    `
let qltdGanttBaselineComparisonEnabled = false;
let qltdGanttBaselineRequestSeq = 0;
const qltdGanttBaselineProjectStates = new Map();
const qltdGanttBaselineVersionsCache = new Map();
const qltdGanttBaselinePayloadCache = new Map();
const qltdGanttBaselineRequests = new Map();
let qltdGanttViewMode = 'progress';
function qltdGanttBaselineRenderCurrentProject_(projectCode) { renderEvents.push(projectCode); }
${controllerFunctions.map((name) => extractFunction(appSource, name)).join('\n')}
this.api = {
  activate: qltdGanttBaselineActivateProject_,
  toggle: qltdGanttBaselineToggle_,
  selectVersion: qltdGanttBaselineSelectVersion_,
  projectChange: qltdGanttBaselineHandleProjectChange_,
  state: qltdGanttBaselineGetProjectState_,
  setEnabled(value) { qltdGanttBaselineComparisonEnabled = !!value; },
  setProject(value) { selectedProject = value; },
  setMode(value) { qltdGanttViewMode = value; },
  sequence() { return qltdGanttBaselineRequestSeq; },
  caches() {
    return {
      versions: qltdGanttBaselineVersionsCache.size,
      payloads: qltdGanttBaselinePayloadCache.size
    };
  }
};`,
    controllerContext
  );
  controllerContext.api.setProject = (value) => {
    selectedProject = value;
  };
  return { context: controllerContext, api: controllerContext.api, fetchCalls };
}

function versionsResponse(activeVersion = 'BL005') {
  return {
    success: true,
    projectCode: 'P1',
    activeVersion,
    versions: [
      { version: activeVersion, type: 'DIEU_CHINH', status: 'ACTIVE', taskCount: 1, available: true },
      { version: 'BL001', type: 'LAN_DAU', status: 'REPLACED_INITIAL', taskCount: 1, available: true },
      { version: 'BL002', type: 'DIEU_CHINH', status: 'UNAVAILABLE', taskCount: 1, available: false },
      { version: 'BL004', type: 'DIEU_CHINH', status: 'REPLACED', taskCount: 1, available: true }
    ]
  };
}

function payloadResponse(version) {
  return {
    success: true,
    available: true,
    baseline: { version, type: version === 'BL001' ? 'LAN_DAU' : 'DIEU_CHINH', status: version === 'BL005' ? 'ACTIVE' : 'REPLACED' },
    data: [baselineTask({ taskCode: version })]
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('toggle OFF and project changes do not request baseline', async () => {
  const { api, fetchCalls } = createControllerHarness();
  api.projectChange('P1');
  await Promise.resolve();
  assert.equal(fetchCalls.length, 0);
});

test('toggle ON loads version list once and defaults to activeVersion', async () => {
  const { api, fetchCalls } = createControllerHarness();
  const fetcher = async (action, params) => {
    fetchCalls.push({ action, params });
    return action === 'ganttBaselineVersions'
      ? versionsResponse('BL005')
      : payloadResponse(params.version);
  };
  await api.toggle('P1', { fetcher });
  assert.equal(api.state('P1').activeVersion, 'BL005');
  assert.equal(api.state('P1').selectedVersion, 'BL005');
  assert.equal(api.state('P1').payload.baseline.version, 'BL005');
  assert.equal(fetchCalls.filter((call) => call.action === 'ganttBaselineVersions').length, 1);
  await api.activate('P1', { resetToActive: true, fetcher });
  assert.equal(fetchCalls.filter((call) => call.action === 'ganttBaselineVersions').length, 1);
});

test('selecting BL001 requests the exact version and unavailable versions are ignored', async () => {
  const { api, fetchCalls } = createControllerHarness();
  api.setEnabled(true);
  const fetcher = async (action, params) => {
    fetchCalls.push({ action, params });
    return action === 'ganttBaselineVersions'
      ? versionsResponse('BL005')
      : payloadResponse(params.version);
  };
  await api.activate('P1', { resetToActive: true, fetcher });
  await api.selectVersion('P1', 'BL001', { fetcher });
  assert.equal(api.state('P1').selectedVersion, 'BL001');
  assert.equal(
    fetchCalls.some((call) => call.action === 'ganttBaseline' && call.params.version === 'BL001'),
    true
  );
  api.selectVersion('P1', 'BL002', { fetcher });
  assert.equal(api.state('P1').selectedVersion, 'BL001');
});

test('rapid toggle OFF prevents a pending baseline response from rendering', async () => {
  const { api } = createControllerHarness();
  api.setEnabled(true);
  const pendingPayload = createDeferred();
  const fetcher = async (action, params) => (
    action === 'ganttBaselineVersions'
      ? versionsResponse('BL005')
      : pendingPayload.promise.then(() => payloadResponse(params.version))
  );
  const activation = api.activate('P1', { resetToActive: true, fetcher });
  await Promise.resolve();
  await Promise.resolve();
  api.toggle('P1');
  pendingPayload.resolve();
  await activation;
  assert.equal(api.state('P1').payload, null);
});

test('rapid BL001 to BL004 switch cannot let BL001 overwrite BL004', async () => {
  const { api } = createControllerHarness();
  api.setEnabled(true);
  const pending = {
    BL001: createDeferred(),
    BL004: createDeferred()
  };
  const fetcher = async (action, params) => {
    if (action === 'ganttBaselineVersions') return versionsResponse('BL005');
    if (params.version === 'BL005') return payloadResponse('BL005');
    return pending[params.version].promise.then(() => payloadResponse(params.version));
  };
  await api.activate('P1', { resetToActive: true, fetcher });
  const first = api.selectVersion('P1', 'BL001', { fetcher });
  const second = api.selectVersion('P1', 'BL004', { fetcher });
  pending.BL004.resolve();
  await second;
  assert.equal(api.state('P1').payload.baseline.version, 'BL004');
  pending.BL001.resolve();
  await first;
  assert.equal(api.state('P1').payload.baseline.version, 'BL004');
});

test('cache keys include projectCode and version without render-triggered requests', async () => {
  const { api, fetchCalls } = createControllerHarness();
  api.setEnabled(true);
  const fetcher = async (action, params) => {
    fetchCalls.push({ action, params });
    return action === 'ganttBaselineVersions'
      ? versionsResponse('BL005')
      : payloadResponse(params.version);
  };
  await api.activate('P1', { resetToActive: true, fetcher });
  await api.selectVersion('P1', 'BL001', { fetcher });
  await api.selectVersion('P1', 'BL005', { fetcher });
  assert.deepEqual(plain(api.caches()), { versions: 1, payloads: 2 });
  assert.equal(
    fetchCalls.filter((call) => call.action === 'ganttBaseline' && call.params.version === 'BL005').length,
    1
  );
  const filterSource = extractFunction(appSource, 'applyGanttFilters');
  const initSource = extractFunction(appSource, 'initDhtmlxGantt');
  assert.doesNotMatch(filterSource + initSource, /ganttBaselineVersions|fetchBackendJson\(\s*'ganttBaseline'/);
});

test('project A response cannot write into B and B resets to its activeVersion', async () => {
  const { api } = createControllerHarness();
  api.setEnabled(true);
  const pendingA = createDeferred();
  const fetcherA = async (action, params) => (
    action === 'ganttBaselineVersions'
      ? versionsResponse('BL005')
      : pendingA.promise.then(() => payloadResponse(params.version))
  );
  const activationA = api.activate('P1', { resetToActive: true, fetcher: fetcherA });
  await Promise.resolve();
  await Promise.resolve();

  api.setProject('P2');
  const sequenceBeforeProjectChange = api.sequence();
  const fetcherB = async (action, params) => (
    action === 'ganttBaselineVersions'
      ? versionsResponse('BL009')
      : payloadResponse(params.version)
  );
  await api.projectChange('P2', { fetcher: fetcherB });
  assert.equal(api.sequence(), sequenceBeforeProjectChange + 1);
  assert.equal(api.state('P2').requestSeq, api.sequence());
  assert.equal(api.state('P2').selectedVersion, 'BL009');
  assert.equal(api.state('P2').payload.baseline.version, 'BL009');

  pendingA.resolve();
  await activationA;
  assert.equal(api.state('P1').payload, null);
  assert.equal(api.state('P2').payload.baseline.version, 'BL009');
});

function addScaleDate(date, step, unit) {
  const next = new Date(date.getTime());
  if (unit === 'day') next.setDate(next.getDate() + step);
  else if (unit === 'week') next.setDate(next.getDate() + step * 7);
  else if (unit === 'month') next.setMonth(next.getMonth() + step);
  else if (unit === 'quarter') next.setMonth(next.getMonth() + step * 3);
  else if (unit === 'year') next.setFullYear(next.getFullYear() + step);
  else throw new Error(`Unsupported test scale ${unit}`);
  return next;
}

function createTimelineHarness(options = {}) {
  const supportState = {
    projectCode: 'P1',
    selectedVersion: 'BL005',
    payload: { baseline: { version: 'BL005' } },
    layerSupported: null
  };
  const timelineContext = {
    Array,
    Date,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    console: { warn() {} },
    document: {
      getElementById() {
        return null;
      }
    },
    supportState
  };
  vm.createContext(timelineContext);
  vm.runInContext(
    `
let qltdGanttBaselineComparisonEnabled = true;
let qltdGanttViewMode = 'progress';
let qltdActiveView = 'gantt';
let qltdGanttBaselineTimelineTemplateBinding = { gantt: null, template: null };
let qltdGanttPayload = { projectCode: 'P1' };
function qltdGanttBaselineGetProjectState_() { return supportState; }
${[
  'qltdGanttBaselineIsComparisonCurrent_',
  'qltdGanttBaselineDateToOrdinal_',
  'qltdGanttBaselineGetTimelineCellRange_',
  'qltdGanttBaselineIsTaskVisibleInTree_',
  'qltdGanttBaselineRenderTimelineCell_',
  'qltdGanttBaselineSetVisualSupported_',
  'qltdGanttBaselineEnsureTimelineTemplate_'
].map((name) => extractFunction(appSource, name)).join('\n')}
this.api = {
  ensure: qltdGanttBaselineEnsureTimelineTemplate_,
  render: qltdGanttBaselineRenderTimelineCell_,
  setEnabled(value) { qltdGanttBaselineComparisonEnabled = value; },
  setViewMode(value) { qltdGanttViewMode = value; },
  setActiveView(value) { qltdActiveView = value; },
  setProject(value) { qltdGanttPayload = { projectCode: value }; },
  setVersion(value) {
    supportState.selectedVersion = value;
    supportState.payload = { baseline: { version: value } };
  }
};`,
    timelineContext
  );
  const previousTemplate = Object.prototype.hasOwnProperty.call(options, 'previousTemplate')
    ? options.previousTemplate
    : () => '<em>existing</em>';
  const gantt = {
    config: {
      scales: [{ unit: options.unit || 'day', step: options.step || 1 }]
    },
    templates: {
      timeline_cell_content: previousTemplate
    },
    date: {
      add: addScaleDate
    },
    isTaskVisible: options.isTaskVisible || (() => true)
  };
  return { api: timelineContext.api, supportState, gantt };
}

function matchedTimelineTask(options = {}) {
  const version = options.version || 'BL005';
  const projectCode = options.projectCode || 'P1';
  const current = currentTask(options.current || {});
  const baseline = baselineTask(options.baseline || {});
  const model = comparisonContext.api.build(
    [current],
    [baseline],
    { version, projectCode }
  );
  return comparisonContext.api.apply([current], model)[0];
}

function cssVariable(content, name) {
  const match = String(content).match(new RegExp(`${name}:([0-9.]+)%`));
  return match ? Number(match[1]) : null;
}

test('Community runtime composes timeline_cell_content without addTaskLayer', () => {
  const { api, gantt, supportState } = createTimelineHarness();
  assert.equal(Object.hasOwn(gantt, 'addTaskLayer'), false);
  assert.equal(api.ensure(gantt), true);
  assert.equal(supportState.layerSupported, true);
  const content = gantt.templates.timeline_cell_content(
    matchedTimelineTask({ baseline: { baselineStart: '2026-01-01', baselineEnd: '2026-01-01' } }),
    new Date(2026, 0, 1)
  );
  assert.match(content, /^<em>existing<\/em>/);
  assert.match(content, /qltd-baseline-cell-segment/);
  assert.doesNotMatch(appSource, /\.addTaskLayer\s*\(/);
  assert.doesNotMatch(appSource, /\.removeTaskLayer\s*\(/);
});

test('timeline template preserves prior output, returns it unchanged when OFF and composes once', () => {
  const { api, gantt } = createTimelineHarness({
    previousTemplate: () => '<strong>prior</strong>'
  });
  ['init', 'filter', 'zoom', 'reload', 'reset'].forEach(() => api.ensure(gantt));
  const task = matchedTimelineTask({
    baseline: { baselineStart: '2026-01-01', baselineEnd: '2026-01-01' }
  });
  const onContent = gantt.templates.timeline_cell_content(task, new Date(2026, 0, 1));
  assert.equal(onContent.match(/qltd-baseline-cell-segment/g)?.length, 1);
  api.setEnabled(false);
  assert.equal(
    gantt.templates.timeline_cell_content(task, new Date(2026, 0, 1)),
    '<strong>prior</strong>'
  );
  api.setEnabled(true);
  api.setViewMode('budget');
  assert.equal(
    gantt.templates.timeline_cell_content(task, new Date(2026, 0, 1)),
    '<strong>prior</strong>'
  );
});

test('day cells render inclusive baseline once per covered day without a boundary gap', () => {
  const { api, gantt } = createTimelineHarness({ unit: 'day' });
  api.ensure(gantt);
  const task = matchedTimelineTask({
    baseline: { baselineStart: '2026-01-01', baselineEnd: '2026-01-03' }
  });
  const contents = [1, 2, 3, 4].map((day) => (
    gantt.templates.timeline_cell_content(task, new Date(2026, 0, day))
  ));
  assert.deepEqual(contents.map((content) => /qltd-baseline-cell-segment/.test(content)), [
    true, true, true, false
  ]);
  assert.equal(cssVariable(contents[0], '--qltd-baseline-left'), 0);
  assert.equal(cssVariable(contents[0], '--qltd-baseline-width'), 100);
  assert.match(contents[0], /is-start/);
  assert.match(contents[2], /is-end/);
});

test('weekly cell computes partial left and width from the configured scale interval', () => {
  const { api, gantt } = createTimelineHarness({ unit: 'week' });
  api.ensure(gantt);
  const task = matchedTimelineTask({
    baseline: { baselineStart: '2026-01-03', baselineEnd: '2026-01-05' }
  });
  const content = gantt.templates.timeline_cell_content(task, new Date(2026, 0, 1));
  assert.ok(Math.abs(cssVariable(content, '--qltd-baseline-left') - (2 / 7 * 100)) < 0.0001);
  assert.ok(Math.abs(cssVariable(content, '--qltd-baseline-width') - (3 / 7 * 100)) < 0.0001);
  assert.match(content, /is-start is-end/);
});

test('multi-cell baseline has partial ends and full middle cells at month zoom', () => {
  const { api, gantt } = createTimelineHarness({ unit: 'month' });
  api.ensure(gantt);
  const task = matchedTimelineTask({
    baseline: { baselineStart: '2026-01-16', baselineEnd: '2026-03-15' }
  });
  const january = gantt.templates.timeline_cell_content(task, new Date(2026, 0, 1));
  const february = gantt.templates.timeline_cell_content(task, new Date(2026, 1, 1));
  const march = gantt.templates.timeline_cell_content(task, new Date(2026, 2, 1));
  assert.equal(cssVariable(january, '--qltd-baseline-left'), Number((15 / 31 * 100).toFixed(6)));
  assert.equal(cssVariable(february, '--qltd-baseline-left'), 0);
  assert.equal(cssVariable(february, '--qltd-baseline-width'), 100);
  assert.equal(cssVariable(march, '--qltd-baseline-width'), Number((15 / 31 * 100).toFixed(6)));
  assert.match(january, /is-start/);
  assert.doesNotMatch(february, /is-start|is-end/);
  assert.match(march, /is-end/);
});

test('quarter and year scales use their configured unit and step', () => {
  for (const scale of [
    { unit: 'month', step: 3, start: new Date(2026, 0, 1) },
    { unit: 'year', step: 1, start: new Date(2026, 0, 1) }
  ]) {
    const { api, gantt } = createTimelineHarness(scale);
    api.ensure(gantt);
    const task = matchedTimelineTask({
      baseline: { baselineStart: '2026-02-01', baselineEnd: '2026-02-28' }
    });
    const content = gantt.templates.timeline_cell_content(task, scale.start);
    assert.match(content, /qltd-baseline-cell-segment/);
    assert.ok(cssVariable(content, '--qltd-baseline-left') > 0);
    assert.ok(cssVariable(content, '--qltd-baseline-width') > 0);
  }
});

test('baseline milestone uses metadata and renders in exactly one boundary cell', () => {
  const { api, gantt } = createTimelineHarness({ unit: 'month' });
  api.ensure(gantt);
  const task = matchedTimelineTask({
    current: { type: 'task', rowType: 'TASK' },
    baseline: {
      baselineStart: '2026-02-01',
      baselineEnd: '2026-02-01',
      milestoneCode: 'M1'
    }
  });
  const january = gantt.templates.timeline_cell_content(task, new Date(2026, 0, 1));
  const february = gantt.templates.timeline_cell_content(task, new Date(2026, 1, 1));
  assert.doesNotMatch(january, /qltd-baseline-cell-milestone/);
  assert.equal(february.match(/qltd-baseline-cell-milestone/g)?.length, 1);
  assert.equal(cssVariable(february, '--qltd-baseline-left'), 0);
});

test('invalid, current-only, ambiguous, stale version and stale project never render fragments', () => {
  const { api, gantt } = createTimelineHarness();
  api.ensure(gantt);
  const invalid = matchedTimelineTask({
    baseline: { baselineStart: '2026-02-30', baselineEnd: '2026-03-01' }
  });
  const currentOnly = {
    ...currentTask(),
    _qltdBaselineComparison: {
      version: 'BL005',
      baselineMeta: { projectCode: 'P1' },
      matchType: 'CURRENT_ONLY',
      baseline: null,
      baselineRenderRange: null
    }
  };
  const ambiguous = {
    ...currentTask(),
    _qltdBaselineComparison: {
      version: 'BL005',
      baselineMeta: { projectCode: 'P1' },
      matchType: 'AMBIGUOUS',
      baseline: baselineTask(),
      baselineRenderRange: { startOrdinal: 20454, endOrdinalExclusive: 20455 }
    }
  };
  for (const task of [invalid, currentOnly, ambiguous]) {
    assert.doesNotMatch(
      gantt.templates.timeline_cell_content(task, new Date(2026, 0, 1)),
      /qltd-baseline-cell-/
    );
  }

  const versionTask = matchedTimelineTask({ version: 'BL001' });
  api.setVersion('BL004');
  assert.doesNotMatch(
    gantt.templates.timeline_cell_content(versionTask, new Date(2026, 0, 1)),
    /qltd-baseline-cell-/
  );

  api.setVersion('BL005');
  const projectTask = matchedTimelineTask({ projectCode: 'P1' });
  api.setProject('P2');
  assert.doesNotMatch(
    gantt.templates.timeline_cell_content(projectTask, new Date(2026, 0, 1)),
    /qltd-baseline-cell-/
  );
});

test('collapsed or filtered tasks follow DHTMLX visibility without DOM traversal', () => {
  const { api, gantt } = createTimelineHarness({ isTaskVisible: () => false });
  api.ensure(gantt);
  const content = gantt.templates.timeline_cell_content(
    matchedTimelineTask(),
    new Date(2026, 0, 1)
  );
  assert.equal(content, '<em>existing</em>');
  const visibleSource = extractFunction(appSource, 'qltdGanttBaselineIsTaskVisibleInTree_');
  assert.match(visibleSource, /isTaskVisible/);
  assert.doesNotMatch(visibleSource, /querySelector|getTask\(|parent/);
});

test('timeline cell renderer is O(1) and does not parse, rematch, request or query DOM', () => {
  const { api, gantt } = createTimelineHarness({ unit: 'day' });
  api.ensure(gantt);
  const tasks = Array.from({ length: 124 }, (_, index) => matchedTimelineTask({
    current: { id: `R${index + 1}` },
    baseline: {
      refId: `R${index + 1}`,
      baselineStart: '2026-01-01',
      baselineEnd: '2026-06-30'
    }
  }));
  let fragments = 0;
  for (const task of tasks) {
    for (let day = 0; day < 365; day += 1) {
      const date = new Date(2026, 0, 1);
      date.setDate(date.getDate() + day);
      if (/qltd-baseline-cell-/.test(gantt.templates.timeline_cell_content(task, date))) {
        fragments += 1;
      }
    }
  }
  assert.equal(fragments, 124 * 181);
  const source = extractFunction(appSource, 'qltdGanttBaselineRenderTimelineCell_');
  assert.doesNotMatch(
    source,
    /ParseIsoUtc|BuildComparison|BuildIndex|querySelector|querySelectorAll|fetch\(|apiRequest/
  );
  assert.match(source, /baselineRenderRange/);
});

test('missing timeline template surface is controlled and leaves KPI state available', () => {
  const { api, supportState } = createTimelineHarness();
  assert.equal(api.ensure({}), false);
  assert.equal(supportState.layerSupported, false);
});

test('an absent timeline_cell_content template is installed without a PRO API', () => {
  const { api, gantt } = createTimelineHarness({ previousTemplate: undefined });
  delete gantt.templates.timeline_cell_content;
  assert.equal(api.ensure(gantt), true);
  assert.equal(typeof gantt.templates.timeline_cell_content, 'function');
  assert.match(
    gantt.templates.timeline_cell_content(
      matchedTimelineTask({
        baseline: { baselineStart: '2026-01-01', baselineEnd: '2026-01-01' }
      }),
      new Date(2026, 0, 1)
    ),
    /^<span class="qltd-baseline-cell-segment/
  );
});

test('baseline dates extend the timeline with a bounded guard for corrupt extremes', () => {
  const rangeContext = {
    Array,
    Date,
    Math,
    Number,
    Object,
    String,
    toIsoDateLocal: (date) => [
      String(date.getFullYear()).padStart(4, '0'),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-')
  };
  vm.createContext(rangeContext);
  vm.runInContext(
    `let qltdGanttPayload = { projectCode: 'P1' };
const rangeState = {
  selectedVersion: 'BL005',
  payload: { baseline: { version: 'BL005' } }
};
function qltdGanttBaselineGetProjectState_() { return rangeState; }
${[
      'qltdGanttBaselineParseIsoUtc_',
      'qltdGanttBaselineDateForGantt_',
      'qltdGanttBaselineIsComparisonCurrent_',
      'qltdGanttBaselineGetRenderRange_'
    ].map((name) => extractFunction(appSource, name)).join('\n')}
this.getRange = qltdGanttBaselineGetRenderRange_;`,
    rangeContext
  );
  const range = rangeContext.getRange([{
    start_date: '2026-02-01',
    end_date: '2026-02-10',
    _qltdBaselineComparison: {
      version: 'BL005',
      baselineMeta: { projectCode: 'P1' },
      baseline: {
        baselineStart: '2026-01-01',
        baselineEnd: '2026-03-01'
      }
    }
  }]);
  assert.equal(rangeContext.toIsoDateLocal(range.start), '2025-12-25');
  assert.equal(rangeContext.toIsoDateLocal(range.end), '2026-03-08');
  const staleRange = rangeContext.getRange([{
    start_date: '2026-02-01',
    end_date: '2026-02-10',
    _qltdBaselineComparison: {
      version: 'BL001',
      baselineMeta: { projectCode: 'P1' },
      baseline: {
        baselineStart: '2020-01-01',
        baselineEnd: '2020-01-10'
      }
    }
  }]);
  assert.equal(rangeContext.toIsoDateLocal(staleRange.start), '2026-01-25');
  assert.equal(rangeContext.toIsoDateLocal(staleRange.end), '2026-02-17');
  assert.equal(rangeContext.getRange([{
    start_date: '2026-02-01',
    end_date: '2026-02-10',
    _qltdBaselineComparison: {
      version: 'BL005',
      baselineMeta: { projectCode: 'P1' },
      baseline: {
        baselineStart: '1900-01-01',
        baselineEnd: '2100-01-01'
      }
    }
  }]), null);
});

test('UI includes enriched versions, neutral historical warning, dynamic title and all KPI groups', () => {
  const controls = extractFunction(appSource, 'qltdGanttBaselineRenderControls_');
  const summary = extractFunction(appSource, 'qltdGanttBaselineRenderSummary_');
  assert.match(controls, /Đánh giá với KH gốc/);
  assert.match(controls, /entry\.available === false \? 'disabled'/);
  assert.match(appSource, /Kế hoạch lần đầu/);
  assert.match(appSource, /Đang áp dụng/);
  assert.match(summary, /Đang xem phiên bản lịch sử/);
  assert.match(summary, /Chuẩn điều hành hiện hành/);
  assert.match(summary, /So với \$\{escapeHtml\(state\.selectedVersion\)\}/);
  [
    'Không thay đổi',
    'Kế hoạch đã dời',
    'Kế hoạch rút ngắn',
    'Dời ngày bắt đầu, vẫn giữ hạn',
    'Phát sinh sau',
    'Đã loại khỏi kế hoạch hiện hành',
    'Chưa đủ dữ liệu đối chiếu'
  ].forEach((label) => assert.match(summary, new RegExp(label)));
  assert.match(summary, /is-history/);
});

test('budget mode cannot turn comparison on and OFF keeps original Gantt classes/layout', () => {
  const toolbarBinding = extractFunction(appSource, 'bindGanttToolbar');
  const taskClassStart = appSource.indexOf('gantt.templates.task_class');
  const taskClassEnd = appSource.indexOf('gantt.templates.link_class', taskClassStart);
  const taskClassSource = appSource.slice(taskClassStart, taskClassEnd);
  assert.doesNotMatch(toolbarBinding, /qltdGanttBaselineComparisonEnabled\s*=\s*true/);
  assert.match(extractFunction(appSource, 'qltdGanttBaselineToggle_'), /qltdGanttViewMode !== 'progress'/);
  assert.match(extractFunction(appSource, 'qltdGanttBaselineRenderControls_'), /disabledInBudget/);
  assert.doesNotMatch(taskClassSource, /Baseline|baseline/);
  assert.match(appSource, /qltdGanttBaselineIsRenderable_[\s\S]*\? 188 : 0/);
});

test('Excel OFF contract is unchanged and ON adds exactly six comparison columns', () => {
  const exportContext = {
    Array,
    Object,
    qltdGanttViewMode: 'progress',
    comparisonOn: false,
    qltdGanttPayload: { projectCode: 'P1', data: [] },
    qltdGanttBaselineIsRenderable_: () => exportContext.comparisonOn
  };
  vm.createContext(exportContext);
  vm.runInContext(
    `${extractFunction(appSource, 'qltdWeb07BuildGanttDataColumns')}
this.build = qltdWeb07BuildGanttDataColumns;`,
    exportContext
  );
  const offHeaders = Array.from(exportContext.build(), (column) => column.header);
  assert.deepEqual(offHeaders, [
    'WBS',
    'Công việc',
    'Chủ trì',
    'Số ngày',
    'BĐ',
    'KT',
    'Tiền nhiệm',
    'Loại liên kết',
    'Trạng thái',
    'Ghi chú'
  ]);
  exportContext.comparisonOn = true;
  const onHeaders = Array.from(exportContext.build(), (column) => column.header);
  assert.deepEqual(onHeaders.slice(-6), [
    'Baseline version',
    'BĐ baseline',
    'KT baseline',
    'Chênh KT',
    'Đánh giá',
    'Phương thức match'
  ]);
  assert.equal(onHeaders.length, offHeaders.length + 6);
  assert.match(extractFunction(appSource, 'qltdWeb07GetGanttExportRange'), /_qltdBaselineComparison/);
});

test('PNG export keeps timeline-cell baseline DOM by cloning the rendered container', () => {
  const frame = extractFunction(appSource, 'qltdWeb07CreateGanttCaptureFrame');
  const printRoot = extractFunction(appSource, 'qltdWeb07BuildGanttPrintRoot');
  assert.match(frame, /ctx\.container\.cloneNode\(true\)/);
  assert.match(printRoot, /ctx\.container\.cloneNode\(true\)/);
  assert.doesNotMatch(frame + printRoot, /remove.*baseline|querySelector.*baseline/i);
  assert.match(appSource, /qltd-baseline-cell-segment/);
});

test('matching code never uses task name, WBS or row number', () => {
  const source = extractFunction(appSource, 'qltdGanttBaselineBuildComparisonModel_');
  assert.doesNotMatch(source, /\.text|\.wbs|rowNumber|rawRowNumber/);
  assert.match(source, /MATCHED_BY_TASK_CODE/);
  assert.match(source, /MATCHED_BY_REF_ID/);
  assert.match(source, /AMBIGUOUS/);
  assert.match(source, /CURRENT_ONLY/);
  assert.match(source, /BASELINE_ONLY/);
});
