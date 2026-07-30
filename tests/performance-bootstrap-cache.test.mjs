import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, 'apps-script-dev-api', file), 'utf8');
const source = [
  read('72_Performance_Observability.js'),
  read('29_USERS_SERVICE.js'),
  read('31_PROJECTS_SERVICE.js'),
  read('56_Performance_Bootstrap_Service.js')
].join('\n');

function createSheet(rows) {
  return {
    getName: () => 'fixture',
    getLastColumn: () => rows[0].length,
    getLastRow: () => rows.length,
    getRange: (row, column, rowCount = 1, columnCount = 1) => ({
      getValues: () => Array.from({ length: rowCount }, (_, rowOffset) =>
        Array.from({ length: columnCount }, (_, columnOffset) =>
          rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''
        )
      ),
      getDisplayValues: () => Array.from({ length: rowCount }, (_, rowOffset) =>
        Array.from({ length: columnCount }, (_, columnOffset) =>
          String(rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? '')
        )
      )
    })
  };
}

const usersRows = [
  ['Email', 'DisplayName', 'Role', 'Status', 'DeptCode', 'DeptName', 'LastLoginAt', 'Note', 'EmpCode'],
  ['user@example.com', 'User', 'EDITOR', 'ACTIVE', 'PTDA', 'Phòng PTDA', '', '', 'E001']
];
const projectRows = [
  ['ProjectCode', 'ProjectName', 'MasterSpreadsheetId', 'DeptSpreadsheetId', 'DefaultTaskSheet', 'DefaultDeptSheet', 'Status', 'SortOrder', 'Note'],
  ['P1', 'Project 1', 'MASTER-1', 'DEPT-1', 'Cong_viec', '*', 'ACTIVE', 1, '']
];
const usersSheet = createSheet(usersRows);
const projectsSheet = createSheet(projectRows);
let usersOpenCount = 0;
let projectsEnsureCalls = 0;
let projectsSeedCalls = 0;

const context = {
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  String,
  console: { warn() {} },
  isFinite,
  Utilities: {
    getUuid: () => 'REQ-BOOTSTRAP',
    newBlob: (value) => ({ getBytes: () => Buffer.from(String(value), 'utf8') })
  },
  SpreadsheetApp: {
    openById: () => {
      usersOpenCount += 1;
      return { getSheetByName: (name) => name === 'Users' ? usersSheet : null };
    }
  },
  getCurrentSpreadsheet_: () => ({
    getSheetByName: (name) => name === 'Projects' ? projectsSheet : null
  }),
  qltdFirebaseResolveIdentity_: () => ({ success: true, email: 'user@example.com' }),
  qltdPermissionsForRole_: () => ({ dashboard: true, gantt: true }),
  qltdUserProjectDeptAccessResolveAllEffectiveScopes_: () => [],
  QLTD_DEV_API_SOURCE: 'users_sheet',
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  Logger: { log() {} }
};
vm.createContext(context);
vm.runInContext(source, context);
context.qltdProjectsEnsureSheet_ = () => {
  projectsEnsureCalls += 1;
  throw new Error('ensure must not run in bootstrap');
};
context.qltdProjectsSeedDefaultIfMissing_ = () => {
  projectsSeedCalls += 1;
  throw new Error('seed must not run in bootstrap');
};

vm.runInContext("qltdPerfStartRequest_('bootstrap', {})", context);
const result = vm.runInContext('qltdDevApiBootstrap_({ idToken: "verified" })', context);
const observed = vm.runInContext('qltdPerfAttach_(this.__payload)', Object.assign(context, { __payload: result }));

assert.equal(result.success, true);
assert.equal(result.profile.email, 'user@example.com');
assert.deepEqual(Array.from(result.projects, (project) => project.projectCode), ['P1']);
assert.equal(usersOpenCount, 1);
assert.equal(projectsEnsureCalls, 0);
assert.equal(projectsSeedCalls, 0);
assert.equal(observed.performance.counters.usersPhysicalReads, 1);
assert.equal(observed.performance.counters.projectsPhysicalReads, 1);

// A second service lookup in the same request must reuse both physical reads.
assert.equal(vm.runInContext("qltdUsersGetByEmail_('user@example.com').email", context), 'user@example.com');
assert.equal(vm.runInContext("qltdProjectsGetByCode_('P1').projectCode", context), 'P1');
assert.equal(usersOpenCount, 1);
const observedAfterMemo = vm.runInContext('qltdPerfAttach_(this.__payload2)', Object.assign(context, { __payload2: { success: true } }));
assert.equal(observedAfterMemo.performance.counters.usersPhysicalReads, 1);
assert.equal(observedAfterMemo.performance.counters.projectsPhysicalReads, 1);

console.log('performance-bootstrap-cache.test.mjs: PASS');
