import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const serviceSource = fs.readFileSync(
  path.join(repoRoot, 'apps-script-dev-api', '75_GANTT_BASELINE_SERVICE.js'),
  'utf8'
);
const dispatcherSource = fs.readFileSync(
  path.join(repoRoot, 'apps-script-dev-api', '28_DEV_API.js'),
  'utf8'
);
const plain = value => JSON.parse(JSON.stringify(value));

const BASELINE_HEADERS = [
  'Ref gốc',
  'Công việc / Phạm vi',
  'Chủ trì',
  'Bắt đầu gốc',
  'Kết thúc gốc',
  'Ngày gốc',
  'Liên kết gốc',
  'Mốc/Gate',
  'Ghi chú gốc',
  'Mã công việc',
  'Baseline version',
  'Baseline type',
  'Baseline status',
  'Created at'
];

const PROJECT_HEADERS = [
  'ProjectCode',
  'ProjectName',
  'MasterSpreadsheetId',
  'DeptSpreadsheetId',
  'DefaultTaskSheet',
  'DefaultDeptSheet',
  'Status',
  'SortOrder',
  'Note'
];

const HISTORY_HEADERS = [
  'Mã baseline',
  'Tên sheet lưu trữ',
  'Trạng thái',
  'Ngày lưu',
  'Số dòng công việc',
  'Ghi chú'
];

function baselineTask(overrides = {}) {
  const value = {
    refId: '47',
    text: 'Thi công móng',
    owner: 'BQLDA',
    start: '2026-06-12',
    end: '2026-06-26',
    storedDuration: 99,
    predecessor: '',
    milestoneCode: '',
    note: '',
    taskCode: 'CV-047',
    version: 'BL005',
    type: 'DIEU_CHINH',
    status: 'ACTIVE',
    createdAt: '2026-06-01T02:00:00.000Z',
    ...overrides
  };
  return [
    value.refId,
    value.text,
    value.owner,
    value.start,
    value.end,
    value.storedDuration,
    value.predecessor,
    value.milestoneCode,
    value.note,
    value.taskCode,
    value.version,
    value.type,
    value.status,
    value.createdAt
  ];
}

function defaultBaselineRows(taskRows = [
  baselineTask(),
  baselineTask({
    refId: '48',
    text: 'Nghiệm thu',
    taskCode: 'CV-048',
    start: '2026-06-27',
    end: '2026-06-27',
    milestoneCode: 'MOC-01'
  })
], metadataOverrides = {}) {
  const metadata = {
    version: 'BL005',
    createdAt: '2026-06-01T02:00:00.000Z',
    type: 'DIEU_CHINH',
    taskCount: taskRows.length,
    status: 'ACTIVE',
    ...metadataOverrides
  };
  return [
    ['KẾ HOẠCH GỐC / BASELINE ACTIVE'],
    [
      'Phiên bản',
      metadata.version,
      'Ngày chốt',
      metadata.createdAt,
      'Loại',
      metadata.type,
      'Số việc',
      metadata.taskCount,
      metadata.status
    ],
    [],
    BASELINE_HEADERS.slice(),
    ...taskRows
  ];
}

function defaultProjectRows(overrides = {}) {
  const project = {
    projectCode: 'P1',
    projectName: 'Project One',
    masterSpreadsheetId: 'MASTER-P1',
    status: 'ACTIVE',
    ...overrides
  };
  return [
    PROJECT_HEADERS.slice(),
    [
      project.projectCode,
      project.projectName,
      project.masterSpreadsheetId,
      '',
      'Cong_viec',
      '*',
      project.status,
      1,
      ''
    ]
  ];
}

function defaultHistoryRows(activeRows = [
  ['BL005', 'KH_goc_BL005_01062026', 'Đang áp dụng', '2026-06-01T02:00:00.000Z', 2, '']
]) {
  return [HISTORY_HEADERS.slice(), ...activeRows];
}

function historicalSnapshotRows({
  version,
  type = 'DIEU_CHINH',
  createdAt,
  taskRows
}) {
  const rows = taskRows || [
    baselineTask({
      version,
      type,
      status: 'ACTIVE',
      createdAt,
      refId: version.slice(2),
      taskCode: `${version}-TASK`,
      text: `Công việc ${version}`
    })
  ];
  return defaultBaselineRows(rows, {
    version,
    type,
    createdAt,
    taskCount: rows.length,
    status: 'ACTIVE'
  });
}

function historicalVersionsFixture() {
  const definitions = [
    {
      version: 'BL001',
      type: 'LAN_DAU',
      createdAt: '2026-01-01T02:00:00.000Z',
      sourceSheet: 'KH_goc_BL001_01012026'
    },
    {
      version: 'BL002',
      type: 'DIEU_CHINH',
      createdAt: '2026-02-01T02:00:00.000Z',
      sourceSheet: 'KH_goc_BL002_01022026'
    },
    {
      version: 'BL003',
      type: 'DIEU_CHINH',
      createdAt: '2026-03-01T02:00:00.000Z',
      sourceSheet: 'KH_goc_BL003_01032026'
    },
    {
      version: 'BL004',
      type: 'DIEU_CHINH',
      createdAt: '2026-04-01T02:00:00.000Z',
      sourceSheet: 'KH_goc_BL004_01042026'
    }
  ];
  const snapshotRowsByName = {};
  const historyRows = definitions.map((definition) => {
    snapshotRowsByName[definition.sourceSheet] = historicalSnapshotRows(definition);
    return [
      definition.version,
      definition.sourceSheet,
      'Đã thay thế',
      definition.createdAt,
      1,
      ''
    ];
  });
  historyRows.push([
    'BL005',
    'KH_goc_BL005_01062026',
    'Đang áp dụng',
    '2026-06-01T02:00:00.000Z',
    2,
    ''
  ]);
  return {
    definitions,
    historyRows: defaultHistoryRows(historyRows),
    snapshotRowsByName
  };
}

function rowHasValue(row) {
  return Array.isArray(row) && row.some((value) => {
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

function makeReadonlySurface(target, writeCalls, label) {
  [
    'setValue',
    'setValues',
    'appendRow',
    'insertSheet',
    'insertRows',
    'insertColumnsAfter',
    'clear',
    'clearContent',
    'deleteColumn',
    'deleteColumns',
    'deleteRow',
    'deleteRows',
    'protect',
    'setProperty',
    'setProperties'
  ].forEach((method) => {
    target[method] = (...args) => {
      writeCalls.push({ label, method, args });
      throw new Error(`Write method must not be called: ${label}.${method}`);
    };
  });
  return target;
}

function makeSheet(rows, counters, writeCalls, label) {
  const sourceRows = (rows || []).map((row) => Array.isArray(row) ? row.slice() : []);

  function rangeValues(startRow, startColumn, rowCount, columnCount) {
    const output = [];
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      const source = sourceRows[startRow - 1 + rowOffset] || [];
      const row = [];
      for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
        row.push(source[startColumn - 1 + columnOffset] ?? '');
      }
      output.push(row);
    }
    return output;
  }

  const sheet = {
    getLastRow() {
      counters[`${label}.getLastRow`] = (counters[`${label}.getLastRow`] || 0) + 1;
      for (let index = sourceRows.length - 1; index >= 0; index -= 1) {
        if (rowHasValue(sourceRows[index])) return index + 1;
      }
      return 0;
    },
    getRange(startRow, startColumn, rowCount, columnCount) {
      counters[`${label}.getRange`] = (counters[`${label}.getRange`] || 0) + 1;
      const range = {
        getValues() {
          counters[`${label}.range.getValues`] = (counters[`${label}.range.getValues`] || 0) + 1;
          return rangeValues(startRow, startColumn, rowCount, columnCount);
        }
      };
      return makeReadonlySurface(range, writeCalls, `${label}.range`);
    },
    getDataRange() {
      counters[`${label}.getDataRange`] = (counters[`${label}.getDataRange`] || 0) + 1;
      const width = Math.max(1, ...sourceRows.map((row) => row.length));
      const height = Math.max(1, sourceRows.length);
      const range = {
        getValues() {
          counters[`${label}.dataRange.getValues`] =
            (counters[`${label}.dataRange.getValues`] || 0) + 1;
          return rangeValues(1, 1, height, width);
        }
      };
      return makeReadonlySurface(range, writeCalls, `${label}.dataRange`);
    }
  };
  return makeReadonlySurface(sheet, writeCalls, label);
}

function makeSpreadsheet(sheetEntries, counters, writeCalls, label) {
  const sheets = { ...sheetEntries };
  const spreadsheet = {
    getSheetByName(name) {
      counters[`${label}.getSheetByName`] = (counters[`${label}.getSheetByName`] || 0) + 1;
      return sheets[name] || null;
    }
  };
  return makeReadonlySurface(spreadsheet, writeCalls, label);
}

function authFailure(code, message = code) {
  return {
    success: false,
    error: { code, message },
    errorCode: code,
    errorMessage: message,
    message: code
  };
}

function createHarness(options = {}) {
  const counters = {};
  const writeCalls = [];
  const projectSheet = options.projectSheetMissing
    ? null
    : makeSheet(
      options.projectRows || defaultProjectRows(options.projectOverrides),
      counters,
      writeCalls,
      'Projects'
    );
  const registrySpreadsheet = makeSpreadsheet(
    projectSheet ? { Projects: projectSheet } : {},
    counters,
    writeCalls,
    'RegistrySpreadsheet'
  );

  const baselineSheet = options.baselineSheetMissing
    ? null
    : makeSheet(
      options.baselineRows || defaultBaselineRows(),
      counters,
      writeCalls,
      'Ke_hoach_goc'
    );
  const historySheet = options.historySheetMissing
    ? null
    : makeSheet(
      options.historyRows || defaultHistoryRows(),
      counters,
      writeCalls,
      'Ke_hoach_goc_history'
    );
  const masterSheets = {};
  if (baselineSheet) masterSheets.Ke_hoach_goc = baselineSheet;
  if (historySheet) masterSheets.Ke_hoach_goc_history = historySheet;
  Object.entries(options.snapshotRowsByName || {}).forEach(([sheetName, rows]) => {
    masterSheets[sheetName] = makeSheet(
      rows,
      counters,
      writeCalls,
      sheetName
    );
  });
  const masterSpreadsheet = makeSpreadsheet(
    masterSheets,
    counters,
    writeCalls,
    'MasterSpreadsheet'
  );

  const context = {
    console,
    Session: {
      getScriptTimeZone: () => 'Asia/Ho_Chi_Minh'
    },
    Utilities: {
      formatDate(value, _timezone, pattern) {
        assert.equal(pattern, 'yyyy-MM-dd');
        const shifted = new Date(value.getTime() + 7 * 60 * 60 * 1000);
        const year = shifted.getUTCFullYear();
        const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
        const day = String(shifted.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    },
    SpreadsheetApp: {
      openById(id) {
        counters['SpreadsheetApp.openById'] = (counters['SpreadsheetApp.openById'] || 0) + 1;
        if (options.openMasterError) throw new Error('Cannot open master');
        assert.equal(id, options.expectedMasterId || 'MASTER-P1');
        return masterSpreadsheet;
      }
    },
    getCurrentSpreadsheet_: () => registrySpreadsheet,
    qltdUsersIsValidRole_: (role) => (
      ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'].includes(String(role || '').toUpperCase())
    ),
    resolveCurrentUser_(input) {
      const token = String(input?.idToken || '');
      if (!token) return authFailure('ID_TOKEN_REQUIRED');
      if (token === 'invalid') return authFailure('ID_TOKEN_INVALID');
      if (token === 'expired') return authFailure('ID_TOKEN_EXPIRED');
      if (token === 'inactive') return authFailure('USER_INACTIVE');
      if (token === 'duplicate') return authFailure('USER_DUPLICATE');
      return {
        success: true,
        user: {
          email: 'user@example.com',
          status: 'ACTIVE',
          role: options.userRole || 'VIEWER'
        }
      };
    },
    chotBaselineLanDauV1: (...args) => {
      writeCalls.push({ label: 'global', method: 'chotBaselineLanDauV1', args });
    },
    chotBaselineDieuChinhV1: (...args) => {
      writeCalls.push({ label: 'global', method: 'chotBaselineDieuChinhV1', args });
    },
    chotKeHoachGocV1: (...args) => {
      writeCalls.push({ label: 'global', method: 'chotKeHoachGocV1', args });
    },
    chotKeHoachGocCoreV1_: (...args) => {
      writeCalls.push({ label: 'global', method: 'chotKeHoachGocCoreV1_', args });
    },
    migrateBaseline_: (...args) => {
      writeCalls.push({ label: 'global', method: 'migrateBaseline_', args });
    }
  };
  vm.createContext(context);
  vm.runInContext(
    `${serviceSource}
this.api = {
  get: qltdGanttBaselineGet_,
  versions: qltdGanttBaselineVersionsGet_,
  readActive: qltdGanttBaselineReadActive_,
  buildRecords: qltdGanttBaselineBuildRecords_
};`,
    context
  );
  if (options.denyProjectVisibility) {
    vm.runInContext(
      'qltdGanttBaselineListProjectsForUserReadonly_ = function() { return []; };',
      context
    );
  }

  return {
    api: context.api,
    counters,
    writeCalls
  };
}

function request(overrides = {}) {
  return {
    action: 'ganttBaseline',
    projectCode: 'p1',
    email: 'user@example.com',
    idToken: 'valid',
    ...overrides
  };
}

test('dispatcher accepts ganttBaseline without case sensitivity', () => {
  let calls = 0;
  const context = {
    console,
    qltdGanttBaselineGet_(params) {
      calls += 1;
      return { success: true, projectCode: params.projectCode };
    }
  };
  vm.createContext(context);
  vm.runInContext(
    `${dispatcherSource}
qltdDevApiJson_ = function(payload) { return payload; };
this.dispatch = qltdDevApiHandleGet;`,
    context
  );
  const response = context.dispatch({
    parameter: {
      action: 'GaNtTbAsElInE',
      projectCode: 'P1'
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(response, { success: true, projectCode: 'P1' });
});

test('dispatcher accepts ganttBaselineVersions without case sensitivity', () => {
  let calls = 0;
  const context = {
    console,
    qltdGanttBaselineVersionsGet_(params) {
      calls += 1;
      return { success: true, projectCode: params.projectCode, versions: [] };
    }
  };
  vm.createContext(context);
  vm.runInContext(
    `${dispatcherSource}
qltdDevApiJson_ = function(payload) { return payload; };
this.dispatch = qltdDevApiHandleGet;`,
    context
  );
  const response = context.dispatch({
    parameter: {
      action: 'GaNtTbAsElInEvErSiOnS',
      projectCode: 'P1'
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(response, { success: true, projectCode: 'P1', versions: [] });
});

test('missing, invalid and expired tokens keep controlled auth codes', () => {
  const { api } = createHarness();
  assert.equal(api.get(request({ idToken: '' })).errorCode, 'ID_TOKEN_REQUIRED');
  assert.equal(api.get(request({ idToken: 'invalid' })).errorCode, 'ID_TOKEN_INVALID');
  assert.equal(api.get(request({ idToken: 'expired' })).errorCode, 'ID_TOKEN_EXPIRED');
});

test('inactive and duplicate users are rejected', () => {
  const { api } = createHarness();
  assert.equal(api.get(request({ idToken: 'inactive' })).errorCode, 'USER_INACTIVE');
  assert.equal(api.get(request({ idToken: 'duplicate' })).errorCode, 'USER_DUPLICATE');
});

test('missing project code is rejected before reading Sheets', () => {
  const { api, counters } = createHarness();
  const response = api.get(request({ projectCode: '' }));
  assert.equal(response.errorCode, 'MISSING_PROJECT_CODE');
  assert.equal(counters['Projects.getDataRange'] || 0, 0);
});

test('missing and inactive projects fail closed', () => {
  const missing = createHarness({
    projectRows: [PROJECT_HEADERS.slice()]
  }).api.get(request());
  assert.equal(missing.errorCode, 'PROJECT_NOT_FOUND');

  const inactive = createHarness({
    projectOverrides: { status: 'INACTIVE' }
  }).api.get(request());
  assert.equal(inactive.errorCode, 'PROJECT_NOT_FOUND');
});

test('legacy blank project status follows the current selector ACTIVE default', () => {
  const { api } = createHarness({
    projectOverrides: { status: '' }
  });
  const response = api.get(request());
  assert.equal(response.success, true);
  assert.equal(response.available, true);
});

test('a project excluded by the view policy is denied', () => {
  const { api } = createHarness({ denyProjectVisibility: true });
  const response = api.get(request());
  assert.equal(response.errorCode, 'PROJECT_ACCESS_DENIED');
});

test('missing Ke_hoach_goc returns available false instead of a system error', () => {
  const { api } = createHarness({
    baselineSheetMissing: true,
    historySheetMissing: true
  });
  const response = api.get(request());
  assert.equal(response.success, true);
  assert.equal(response.available, false);
  assert.equal(response.projectCode, 'P1');
  assert.deepEqual(plain(response.data), []);
});

test('empty Ke_hoach_goc returns available false', () => {
  const { api } = createHarness({
    baselineRows: defaultBaselineRows([]),
    historySheetMissing: true
  });
  const response = api.get(request());
  assert.equal(response.success, true);
  assert.equal(response.available, false);
  assert.deepEqual(plain(response.data), []);
});

test('one active version returns the stable read-only contract', () => {
  const { api } = createHarness();
  const response = api.get(request());
  assert.equal(response.success, true);
  assert.equal(response.available, true);
  assert.equal(response.projectCode, 'P1');
  assert.equal(response.sourceSheet, 'Ke_hoach_goc');
  assert.deepEqual(plain(response.baseline), {
    version: 'BL005',
    type: 'DIEU_CHINH',
    status: 'ACTIVE',
    createdAt: '2026-06-01T02:00:00.000Z',
    taskCount: 2
  });
  assert.deepEqual(plain(response.data[0]), {
    taskCode: 'CV-047',
    refId: '47',
    text: 'Thi công móng',
    owner: 'BQLDA',
    baselineStart: '2026-06-12',
    baselineEnd: '2026-06-26',
    durationDays: 15,
    milestoneCode: ''
  });
  assert.deepEqual(plain(response.diagnostics), {
    duplicateTaskCodes: [],
    duplicateRefs: []
  });
  assert.equal(response.apiStatus, 'CONNECTED');
  assert.equal(response.source, 'gantt_baseline_service');
});

test('omitting version still returns the ACTIVE BL005 baseline', () => {
  const fixture = historicalVersionsFixture();
  const { api } = createHarness(fixture);
  const response = api.get(request());
  assert.equal(response.success, true);
  assert.equal(response.baseline.version, 'BL005');
  assert.equal(response.baseline.status, 'ACTIVE');
  assert.equal(response.sourceSheet, 'Ke_hoach_goc');
});

test('requesting the active version explicitly still reads Ke_hoach_goc', () => {
  const fixture = historicalVersionsFixture();
  const { api } = createHarness(fixture);
  const response = api.get(request({ version: 'BL005' }));
  assert.equal(response.success, true);
  assert.equal(response.baseline.version, 'BL005');
  assert.equal(response.baseline.status, 'ACTIVE');
  assert.equal(response.sourceSheet, 'Ke_hoach_goc');
  assert.equal(response.data.length, 2);
});

test('versions lists BL001 through BL005 with BL005 as the active version', () => {
  const fixture = historicalVersionsFixture();
  const { api } = createHarness(fixture);
  const response = api.versions(request({ action: 'ganttBaselineVersions' }));
  assert.equal(response.success, true);
  assert.equal(response.activeVersion, 'BL005');
  assert.deepEqual(
    Array.from(response.versions, (entry) => entry.version),
    ['BL005', 'BL004', 'BL003', 'BL002', 'BL001']
  );
  assert.deepEqual(
    Array.from(response.versions, (entry) => entry.status),
    ['ACTIVE', 'REPLACED', 'REPLACED', 'REPLACED', 'REPLACED_INITIAL']
  );
  assert.ok(response.versions.every((entry) => entry.available === true));
  assert.equal(response.versions[0].sourceSheet, 'Ke_hoach_goc');
  assert.equal(response.versions[1].sourceSheet, 'KH_goc_BL004_01042026');
});

test('BL001 and BL004 are read only from their history-proven snapshots', () => {
  const fixture = historicalVersionsFixture();
  const { api } = createHarness(fixture);

  const initial = api.get(request({ version: 'bl001' }));
  assert.equal(initial.success, true);
  assert.equal(initial.baseline.version, 'BL001');
  assert.equal(initial.baseline.type, 'LAN_DAU');
  assert.equal(initial.baseline.status, 'REPLACED_INITIAL');
  assert.equal(initial.sourceSheet, 'KH_goc_BL001_01012026');
  assert.equal(initial.data[0].taskCode, 'BL001-TASK');

  const adjusted = api.get(request({ version: 'BL004' }));
  assert.equal(adjusted.success, true);
  assert.equal(adjusted.baseline.version, 'BL004');
  assert.equal(adjusted.baseline.type, 'DIEU_CHINH');
  assert.equal(adjusted.baseline.status, 'REPLACED');
  assert.equal(adjusted.sourceSheet, 'KH_goc_BL004_01042026');
  assert.equal(adjusted.data[0].taskCode, 'BL004-TASK');
});

test('a missing requested version never falls back to ACTIVE', () => {
  const fixture = historicalVersionsFixture();
  const { api } = createHarness(fixture);
  const response = api.get(request({ version: 'BL999' }));
  assert.equal(response.success, false);
  assert.equal(response.errorCode, 'BASELINE_VERSION_NOT_FOUND');
  assert.equal(response.requestedVersion, 'BL999');
  assert.equal(response.baseline, null);
});

test('an explicitly supplied malformed or blank version is rejected before auth or Sheets', () => {
  const { api, counters } = createHarness();
  assert.equal(
    api.get(request({ version: 'BL-001', idToken: '' })).errorCode,
    'BASELINE_VERSION_INVALID'
  );
  assert.equal(api.get(request({ version: '' })).errorCode, 'BASELINE_VERSION_INVALID');
  assert.equal(counters['Projects.getDataRange'] || 0, 0);
});

test('history version with a missing snapshot is listed unavailable and direct read is controlled', () => {
  const fixture = historicalVersionsFixture();
  delete fixture.snapshotRowsByName.KH_goc_BL004_01042026;
  const { api } = createHarness(fixture);

  const listResponse = api.versions(request({ action: 'ganttBaselineVersions' }));
  const listed = listResponse.versions.find((entry) => entry.version === 'BL004');
  assert.deepEqual(plain(listed), {
    version: 'BL004',
    type: '',
    status: 'UNAVAILABLE',
    createdAt: '2026-04-01T02:00:00.000Z',
    taskCount: 1,
    available: false,
    sourceSheet: 'KH_goc_BL004_01042026'
  });

  const directResponse = api.get(request({ version: 'BL004' }));
  assert.equal(directResponse.errorCode, 'BASELINE_VERSION_NOT_AVAILABLE');
  assert.equal(directResponse.reasonCode, 'BASELINE_SNAPSHOT_MISSING');
  assert.equal(directResponse.sourceSheet, 'KH_goc_BL004_01042026');
});

test('snapshot version mismatch with history fails closed', () => {
  const fixture = historicalVersionsFixture();
  fixture.snapshotRowsByName.KH_goc_BL004_01042026 = historicalSnapshotRows({
    version: 'BL003',
    createdAt: '2026-04-01T02:00:00.000Z'
  });
  const { api } = createHarness(fixture);

  const directResponse = api.get(request({ version: 'BL004' }));
  assert.equal(directResponse.errorCode, 'BASELINE_VERSION_NOT_AVAILABLE');
  assert.equal(directResponse.reasonCode, 'BASELINE_SNAPSHOT_METADATA_MISMATCH');

  const listResponse = api.versions(request({ action: 'ganttBaselineVersions' }));
  const listed = listResponse.versions.find((entry) => entry.version === 'BL004');
  assert.equal(listed.available, false);
  assert.equal(listed.status, 'UNAVAILABLE');
});

test('historical snapshot with header drift is unavailable', () => {
  const fixture = historicalVersionsFixture();
  const rows = fixture.snapshotRowsByName.KH_goc_BL004_01042026;
  [rows[3][0], rows[3][1]] = [rows[3][1], rows[3][0]];
  const { api } = createHarness(fixture);
  const response = api.get(request({ version: 'BL004' }));
  assert.equal(response.errorCode, 'BASELINE_VERSION_NOT_AVAILABLE');
  assert.equal(response.reasonCode, 'BASELINE_SNAPSHOT_SCHEMA_INVALID');
});

test('historical duplicate taskCode and ref records are preserved and diagnosed', () => {
  const fixture = historicalVersionsFixture();
  const createdAt = '2026-04-01T02:00:00.000Z';
  const duplicateRows = [
    baselineTask({
      version: 'BL004',
      createdAt,
      refId: '0047',
      taskCode: 'CV-DUP'
    }),
    baselineTask({
      version: 'BL004',
      createdAt,
      refId: '0047',
      taskCode: 'cv-dup'
    })
  ];
  fixture.snapshotRowsByName.KH_goc_BL004_01042026 = historicalSnapshotRows({
    version: 'BL004',
    createdAt,
    taskRows: duplicateRows
  });
  fixture.historyRows[4][4] = 2;
  const { api } = createHarness(fixture);
  const response = api.get(request({ version: 'BL004' }));
  assert.equal(response.success, true);
  assert.equal(response.data.length, 2);
  assert.deepEqual(Array.from(response.diagnostics.duplicateTaskCodes), ['CV-DUP']);
  assert.deepEqual(Array.from(response.diagnostics.duplicateRefs), ['0047']);
});

test('historical snapshot with an invalid date is unavailable', () => {
  const fixture = historicalVersionsFixture();
  fixture.snapshotRowsByName.KH_goc_BL004_01042026 = historicalSnapshotRows({
    version: 'BL004',
    createdAt: '2026-04-01T02:00:00.000Z',
    taskRows: [
      baselineTask({
        version: 'BL004',
        createdAt: '2026-04-01T02:00:00.000Z',
        start: '2026-02-30'
      })
    ]
  });
  const { api } = createHarness(fixture);
  const response = api.get(request({ version: 'BL004' }));
  assert.equal(response.errorCode, 'BASELINE_VERSION_NOT_AVAILABLE');
  assert.equal(response.reasonCode, 'BASELINE_SNAPSHOT_DATA_INVALID');
});

test('versioned and versions APIs reuse the existing auth and project visibility policy', () => {
  const fixture = historicalVersionsFixture();
  const denied = createHarness({
    ...fixture,
    denyProjectVisibility: true
  }).api;
  assert.equal(
    denied.get(request({ version: 'BL001' })).errorCode,
    'PROJECT_ACCESS_DENIED'
  );
  assert.equal(
    denied.versions(request({ action: 'ganttBaselineVersions' })).errorCode,
    'PROJECT_ACCESS_DENIED'
  );

  const unauthenticated = createHarness(fixture).api;
  assert.equal(
    unauthenticated.versions(request({
      action: 'ganttBaselineVersions',
      idToken: ''
    })).errorCode,
    'ID_TOKEN_REQUIRED'
  );
});

test('active baseline remains readable when history is absent', () => {
  const { api } = createHarness({ historySheetMissing: true });
  const active = api.get(request());
  assert.equal(active.success, true);
  assert.equal(active.baseline.version, 'BL005');

  const listResponse = api.versions(request({ action: 'ganttBaselineVersions' }));
  assert.equal(listResponse.activeVersion, 'BL005');
  assert.deepEqual(
    Array.from(listResponse.versions, (entry) => entry.version),
    ['BL005']
  );

  const historical = api.get(request({ version: 'BL001' }));
  assert.equal(historical.errorCode, 'BASELINE_VERSION_NOT_FOUND');
});

test('history is not used as a fallback when ACTIVE baseline data is absent', () => {
  const fixture = historicalVersionsFixture();
  const noActiveRows = defaultBaselineRows([
    baselineTask({ status: 'REPLACED' })
  ], { taskCount: 1 });
  const { api } = createHarness({
    ...fixture,
    baselineRows: noActiveRows
  });
  assert.equal(
    api.get(request({ version: 'BL001' })).errorCode,
    'BASELINE_ACTIVE_NOT_FOUND'
  );
  assert.equal(
    api.versions(request({ action: 'ganttBaselineVersions' })).errorCode,
    'BASELINE_ACTIVE_NOT_FOUND'
  );
});

test('historical reads are batched and never call a write-capable surface', () => {
  const fixture = historicalVersionsFixture();
  const directHarness = createHarness(fixture);
  const direct = directHarness.api.get(request({ version: 'BL004' }));
  assert.equal(direct.success, true);
  assert.equal(directHarness.counters['Ke_hoach_goc.getRange'], 1);
  assert.equal(directHarness.counters['Ke_hoach_goc_history.getDataRange'], 1);
  assert.equal(directHarness.counters['KH_goc_BL004_01042026.getRange'], 1);
  assert.equal(directHarness.counters['KH_goc_BL004_01042026.range.getValues'], 1);
  assert.deepEqual(directHarness.writeCalls, []);

  const listHarness = createHarness(historicalVersionsFixture());
  const listResponse = listHarness.api.versions(
    request({ action: 'ganttBaselineVersions' })
  );
  assert.equal(listResponse.success, true);
  assert.equal(listHarness.counters['Ke_hoach_goc.getRange'], 1);
  assert.equal(listHarness.counters['Ke_hoach_goc_history.getDataRange'], 1);
  ['BL001', 'BL002', 'BL003', 'BL004'].forEach((version) => {
    const definition = historicalVersionsFixture().definitions.find(
      (entry) => entry.version === version
    );
    assert.equal(listHarness.counters[`${definition.sourceSheet}.getRange`], 1);
    assert.equal(listHarness.counters[`${definition.sourceSheet}.range.getValues`], 1);
  });
  assert.deepEqual(listHarness.writeCalls, []);
});

test('date serialization uses the script timezone without shifting the calendar day', () => {
  const dateAtVietnamMidnight = new Date('2026-06-11T17:00:00.000Z');
  const rows = defaultBaselineRows([
    baselineTask({
      start: dateAtVietnamMidnight,
      end: dateAtVietnamMidnight
    })
  ], { taskCount: 1 });
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.equal(response.data[0].baselineStart, '2026-06-12');
  assert.equal(response.data[0].baselineEnd, '2026-06-12');
  assert.equal(response.data[0].durationDays, 1);
});

test('no ACTIVE records returns BASELINE_ACTIVE_NOT_FOUND', () => {
  const rows = defaultBaselineRows([
    baselineTask({ status: 'REPLACED' })
  ], { taskCount: 1 });
  const { api } = createHarness({ baselineRows: rows });
  assert.equal(api.get(request()).errorCode, 'BASELINE_ACTIVE_NOT_FOUND');
});

test('multiple ACTIVE versions return BASELINE_ACTIVE_AMBIGUOUS', () => {
  const rows = defaultBaselineRows([
    baselineTask(),
    baselineTask({ refId: '48', taskCode: 'CV-048', version: 'BL006' })
  ]);
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.equal(response.errorCode, 'BASELINE_ACTIVE_AMBIGUOUS');
  assert.deepEqual(Array.from(response.activeVersions), ['BL005', 'BL006']);
});

test('an invalid ACTIVE version format fails closed', () => {
  const rows = defaultBaselineRows([
    baselineTask({ version: 'BASELINE-5' })
  ], {
    version: 'BASELINE-5',
    taskCount: 1
  });
  const { api } = createHarness({ baselineRows: rows });
  assert.equal(api.get(request()).errorCode, 'BASELINE_VERSION_INVALID');
});

test('metadata B2 and I2 mismatches are rejected', () => {
  const versionMismatch = createHarness({
    baselineRows: defaultBaselineRows(undefined, { version: 'BL004' })
  }).api.get(request());
  assert.equal(versionMismatch.errorCode, 'BASELINE_METADATA_MISMATCH');

  const statusMismatch = createHarness({
    baselineRows: defaultBaselineRows(undefined, { status: 'INACTIVE' })
  }).api.get(request());
  assert.equal(statusMismatch.errorCode, 'BASELINE_METADATA_MISMATCH');
});

test('history mismatch and duplicate active rows fail closed', () => {
  const mismatch = createHarness({
    historyRows: defaultHistoryRows([
      ['BL004', 'KH_goc_BL004_01062026', 'Đang áp dụng', '', 2, '']
    ])
  }).api.get(request());
  assert.equal(mismatch.errorCode, 'BASELINE_METADATA_MISMATCH');

  const duplicate = createHarness({
    historyRows: defaultHistoryRows([
      ['BL005', 'S1', 'Đang áp dụng', '', 2, ''],
      ['BL005', 'S2', 'Đang áp dụng', '', 2, '']
    ])
  }).api.get(request());
  assert.equal(duplicate.errorCode, 'BASELINE_ACTIVE_AMBIGUOUS');
});

test('duplicate taskCode records are preserved and reported', () => {
  const rows = defaultBaselineRows([
    baselineTask({ refId: '47', taskCode: 'CV-047' }),
    baselineTask({ refId: '48', taskCode: 'cv-047' })
  ]);
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.equal(response.data.length, 2);
  assert.deepEqual(Array.from(response.diagnostics.duplicateTaskCodes), ['CV-047']);
});

test('duplicate refId records are preserved and reported', () => {
  const rows = defaultBaselineRows([
    baselineTask({ refId: '47', taskCode: 'CV-047' }),
    baselineTask({ refId: 47, taskCode: 'CV-048' })
  ]);
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.equal(response.data.length, 2);
  assert.deepEqual(Array.from(response.diagnostics.duplicateRefs), ['47']);
});

test('text Ref/UID keeps leading zeroes for exact fallback matching', () => {
  const rows = defaultBaselineRows([
    baselineTask({ refId: '0047' })
  ], { taskCount: 1 });
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.equal(response.data[0].refId, '0047');
});

test('invalid dates and rows without a schedule are skipped with clear warnings', () => {
  const rows = defaultBaselineRows([
    baselineTask({ taskCode: 'CV-BAD', refId: '1', start: '2026-02-30' }),
    baselineTask({ taskCode: 'CV-GROUP', refId: '2', start: '', end: '' }),
    baselineTask({ taskCode: 'CV-GOOD', refId: '3', start: '2026-03-01', end: '2026-03-02' })
  ], { taskCount: 3 });
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.deepEqual(Array.from(response.data, (item) => item.taskCode), ['CV-GOOD']);
  assert.ok(response.warnings.some((warning) => (
    warning.code === 'BASELINE_DATE_INVALID' && warning.taskCode === 'CV-BAD'
  )));
  assert.equal(
    response.warnings.filter((warning) => (
      warning.code === 'BASELINE_DATE_INVALID' && warning.taskCode === 'CV-GROUP'
    )).length,
    2
  );
});

test('tasks missing code or ref are skipped and reported without row-number matching', () => {
  const rows = defaultBaselineRows([
    baselineTask({ taskCode: '', refId: '1' }),
    baselineTask({ taskCode: 'CV-002', refId: '' }),
    baselineTask({ taskCode: 'CV-003', refId: '3' })
  ], { taskCount: 3 });
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.deepEqual(Array.from(response.data, (item) => item.taskCode), ['CV-003']);
  assert.ok(response.warnings.some((warning) => warning.code === 'BASELINE_TASK_CODE_MISSING'));
  assert.ok(response.warnings.some((warning) => warning.code === 'BASELINE_REF_MISSING'));
  assert.ok(response.warnings.every((warning) => !Object.hasOwn(warning, 'rowNumber')));
});

test('baseline header drift is rejected instead of guessing column positions', () => {
  const rows = defaultBaselineRows();
  [rows[3][0], rows[3][1]] = [rows[3][1], rows[3][0]];
  const { api } = createHarness({ baselineRows: rows });
  const response = api.get(request());
  assert.equal(response.errorCode, 'BASELINE_SCHEMA_INVALID');
  assert.equal(response.misplacedHeaders.length, 2);
});

test('baseline data is batch-read once and no write-capable surface is called', () => {
  const { api, counters, writeCalls } = createHarness();
  const response = api.get(request());
  assert.equal(response.success, true);
  assert.equal(counters['Ke_hoach_goc.getRange'], 1);
  assert.equal(counters['Ke_hoach_goc.range.getValues'], 1);
  assert.equal(counters['Projects.getDataRange'], 1);
  assert.equal(counters['Ke_hoach_goc_history.getDataRange'], 1);
  assert.deepEqual(writeCalls, []);
});

test('error and unavailable responses keep stable baseline contract fields', () => {
  const errorResponse = createHarness({
    baselineRows: defaultBaselineRows([
      baselineTask({ status: 'REPLACED' })
    ], { taskCount: 1 })
  }).api.get(request());
  assert.deepEqual(Object.keys(errorResponse).sort(), [
    'apiStatus',
    'available',
    'baseline',
    'data',
    'diagnostics',
    'error',
    'errorCode',
    'errorMessage',
    'message',
    'projectCode',
    'source',
    'sourceSheet',
    'success',
    'warnings'
  ].sort());

  const unavailableResponse = createHarness({
    baselineSheetMissing: true,
    historySheetMissing: true
  }).api.get(request());
  assert.deepEqual(Object.keys(unavailableResponse).sort(), [
    'apiStatus',
    'available',
    'baseline',
    'data',
    'diagnostics',
    'projectCode',
    'source',
    'sourceSheet',
    'success',
    'warnings'
  ].sort());
});
