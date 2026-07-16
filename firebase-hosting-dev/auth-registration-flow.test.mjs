import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { installApiReadCache } from './api-read-cache.js';
import { getRegistrationErrorMessage } from './registration-gate.js';

const usersSource = fs.readFileSync(new URL('../apps-script-dev-api/29_USERS_SERVICE.js', import.meta.url), 'utf8');
const employeeSource = fs.readFileSync(new URL('../apps-script-dev-api/74_EMPLOYEE_REGISTRATION_SERVICE.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

let rangeWriteCount = 0;
let appendCount = 0;
let employeeOpenCount = 0;
let flushCount = 0;

class MockRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }
  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.getCell(this.row + rowOffset, this.column + columnOffset)
      )
    );
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => String(value ?? '')));
  }
  setValue(value) {
    rangeWriteCount += 1;
    this.sheet.setCell(this.row, this.column, value);
    return this;
  }
}

class MockSheet {
  constructor(name, rows) {
    this.name = name;
    this.rows = rows.map((row) => row.slice());
  }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((width, row) => Math.max(width, row.length), 0); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new MockRange(this, row, column, rowCount, columnCount);
  }
  getCell(row, column) { return this.rows[row - 1]?.[column - 1] ?? ''; }
  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
  appendRow(row) {
    appendCount += 1;
    this.rows.push(row.slice());
  }
}

const userHeaders = ['Email', 'DisplayName', 'Role', 'Status', 'DeptCode', 'DeptName', 'LastLoginAt', 'Note', 'EmpCode'];
const baseUserRows = [
  userHeaders,
  ['Existing.User@Example.com', 'Existing User', 'REPORTER', 'ACTIVE', 'KINHDOANH', 'Phòng Kinh doanh', '', '', 'E-EXISTING']
];
const usersSheet = new MockSheet('Users', baseUserRows);

const employeeHeaders = [
  'EMP_CODE', 'FULL_NAME', 'EMAIL', 'COMPANY_SOURCE', 'BLOCK_SOURCE', 'DEPT_SOURCE',
  'POSITION_SOURCE', 'LOCATION', 'EMPLOYMENT_TYPE', 'COMPANY_CODE', 'DEPT_CODE',
  'ROLE_CODE', 'ACTIVE_STATUS', 'NOTE'
];
const employeeSheet = new MockSheet('USERS_SOFTWARE', [
  employeeHeaders,
  ['E2501001', 'Nguyễn Công Châu', 'chaunc@entizgroup.com', '', '', 'Ban Quản lý Dự án', 'Trưởng ban QLDA', '', '', '', 'QLDA', 'Trưởng ban QLDA', 'Đang làm việc', ''],
  ['E2501002', 'Nguyên Công Châu', 'other@entizgroup.com', '', '', 'Ban Quản lý Dự án', 'Chuyên viên', '', '', '', 'QLDA', 'Chuyên viên', 'Đang làm việc', ''],
  ['E-AWAY', 'Người Nghỉ Việc', 'away@entizgroup.com', '', '', 'Kinh doanh', 'Chuyên viên', '', '', '', 'KINHDOANH', 'Chuyên viên', 'Đã nghỉ việc', ''],
  ['E-NODEPT', 'Thiếu Phòng Ban', 'nodept@entizgroup.com', '', '', '', 'Chuyên viên', '', '', '', '', 'Chuyên viên', 'Đang làm việc', ''],
  ['E-DUP', 'Nhân Sự Trùng Mã', 'dup1@entizgroup.com', '', '', 'Kinh doanh', 'Chuyên viên', '', '', '', 'KINHDOANH', 'Chuyên viên', 'Đang làm việc', ''],
  ['E-DUP', 'Nhân Sự Trùng Mã Khác', 'dup2@entizgroup.com', '', '', 'Kinh doanh', 'Chuyên viên', '', '', '', 'KINHDOANH', 'Chuyên viên', 'Đang làm việc', ''],
  ['E-PERSONAL', 'Người Dùng Gmail Cá Nhân', 'corporate@entizgroup.com', '', '', 'Kế hoạch', 'Trợ lý TGĐ', '', '', '', 'KEHOACH', 'Trợ lý TGĐ', 'Đang làm việc', ''],
  ['E-REPORTER', 'Nhân Viên Báo Cáo', 'reporter@entizgroup.com', '', '', 'Kinh doanh', 'Chuyên viên', '', '', '', 'KINHDOANH', 'Chuyên viên', 'Đang làm việc', '']
]);

const cache = new Map();
let identityEmail = 'new@example.com';
let lockAvailable = true;
let employeeOpenFails = false;
let employeeSheetMissing = false;

function authError(code, message = code, extra = {}) {
  return {
    success: false,
    error: { code, message },
    message: code,
    errorCode: code,
    errorMessage: message,
    ...extra
  };
}

const context = vm.createContext({
  Array,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  String,
  console: { warn() {}, error() {}, log() {} },
  SpreadsheetApp: {
    openById(id) {
      if (id === '1ZAZwSjGOvKEp8iLCqLsEiJyJSFBR-jeru0RL25Q4xMM') {
        return { getSheetByName: (name) => name === 'Users' ? usersSheet : null };
      }
      if (id === '1Tu3t6RyNJC3dkpnlBobdjR2yvP17UYrfish9jlXoQ3g') {
        employeeOpenCount += 1;
        if (employeeOpenFails) throw new Error('permission denied');
        return { getSheetByName: (name) => !employeeSheetMissing && name === 'USERS_SOFTWARE' ? employeeSheet : null };
      }
      throw new Error('unexpected spreadsheet id');
    },
    flush() { flushCount += 1; }
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cache.has(key) ? cache.get(key) : null,
      put: (key, value) => cache.set(key, value)
    })
  },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => lockAvailable,
      releaseLock() {}
    })
  },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  Utilities: {
    formatDate: (date) => date.toISOString().slice(0, 19)
  },
  qltdPermissionsForRole_: (role) => ({ role }),
  qltdFirebaseResolveIdentity_: (payload) => {
    if (!payload?.idToken) return authError('ID_TOKEN_REQUIRED');
    if (payload.idToken === 'invalid') return authError('ID_TOKEN_INVALID');
    const requested = String(payload.email || '').trim().toLowerCase();
    if (requested && requested !== identityEmail.toLowerCase()) return authError('EMAIL_MISMATCH');
    return {
      success: true,
      email: identityEmail,
      localId: `uid:${identityEmail}`,
      authMode: 'FIREBASE_ID_TOKEN'
    };
  }
});
vm.runInContext(`${usersSource}\n${employeeSource}`, context);

function resetUsers(rows = baseUserRows) {
  usersSheet.rows = rows.map((row) => row.slice());
  rangeWriteCount = 0;
  appendCount = 0;
  flushCount = 0;
  lockAvailable = true;
}

function lookup(fullName, email = 'new@example.com') {
  identityEmail = email;
  return context.qltdUsersLookupEmployees_({ idToken: 'valid', email, fullName });
}

// Existing users resolve directly, case-insensitively, without touching HR.
resetUsers();
employeeOpenCount = 0;
identityEmail = 'existing.user@example.com';
let result = context.resolveCurrentUser_({ idToken: 'valid', email: 'EXISTING.USER@EXAMPLE.COM' });
assert.equal(result.success, true);
assert.equal(result.user.displayName, 'Existing User');
assert.equal(employeeOpenCount, 0);

usersSheet.rows.push(['inactive@example.com', 'Inactive', 'REPORTER', 'INACTIVE', 'KINHDOANH', 'Kinh doanh', '', '', 'E-INACTIVE']);
identityEmail = 'inactive@example.com';
assert.equal(context.resolveCurrentUser_({ idToken: 'valid' }).errorCode, 'USER_INACTIVE');
usersSheet.rows.push(['DUP@example.com', 'Duplicate 1', 'REPORTER', 'ACTIVE', 'D1', 'D1', '', '', 'E-D1']);
usersSheet.rows.push(['dup@example.com', 'Duplicate 2', 'REPORTER', 'ACTIVE', 'D1', 'D1', '', '', 'E-D2']);
identityEmail = 'dup@example.com';
assert.equal(context.resolveCurrentUser_({ idToken: 'valid' }).errorCode, 'USER_DUPLICATE');

// Vietnamese name normalization: NFC/case/whitespace and accent-insensitive candidates.
resetUsers();
cache.clear();
for (const name of ['Nguyễn Công Châu', 'nguyễn công châu', 'NGUYỄN CÔNG CHÂU', 'Nguyễn  Công  Châu']) {
  result = lookup(name);
  assert.equal(result.success, true, name);
  assert.equal(result.matchMode, 'EXACT');
  assert.deepEqual(Array.from(result.profiles, (profile) => profile.empCode), ['E2501001']);
}
result = lookup('Nguyen Cong Chau');
assert.equal(result.success, true);
assert.equal(result.matchMode, 'ACCENT_INSENSITIVE');
assert.equal(result.selectionRequired, true);
assert.deepEqual(Array.from(result.profiles, (profile) => profile.empCode), ['E2501001', 'E2501002']);
assert.equal(lookup('Người Nghỉ Việc').errorCode, 'EMPLOYEE_NOT_FOUND');
assert.equal(lookup('Thiếu Phòng Ban').errorCode, 'EMPLOYEE_NOT_FOUND');
assert.equal(appendCount, 0, 'employee lookup must not append Users');
assert.equal(rangeWriteCount, 0, 'employee lookup must not write any cells');

// Source failures remain distinct from employee-not-found.
cache.clear();
employeeSheetMissing = true;
assert.equal(lookup('Nguyễn Công Châu').errorCode, 'SOURCE_SHEET_NOT_FOUND');
employeeSheetMissing = false;
employeeOpenFails = true;
assert.equal(lookup('Nguyễn Công Châu').errorCode, 'SOURCE_CONFIGURATION_ERROR');
employeeOpenFails = false;

// Registration trusts backend employee data and ignores client Role/DeptCode.
resetUsers();
identityEmail = 'chaunc@entizgroup.com';
result = context.qltdUsersRegister_({
  idToken: 'valid',
  email: identityEmail,
  empCode: 'E2501001',
  role: 'ADMIN',
  deptCode: 'ADMIN'
});
assert.equal(result.success, true);
assert.equal(result.role, 'EDITOR');
assert.equal(result.deptCode, 'QLDA');
assert.equal(result.empCode, 'E2501001');
assert.equal(appendCount, 1);
assert.equal(flushCount, 1);
const rowsAfterFirstRegistration = usersSheet.rows.length;
result = context.qltdUsersRegister_({ idToken: 'valid', email: identityEmail, empCode: 'E2501001' });
assert.equal(result.success, true);
assert.equal(result.alreadyExists, true);
assert.equal(usersSheet.rows.length, rowsAfterFirstRegistration);
assert.equal(appendCount, 1, 'idempotent retry must not append a duplicate');

// Existing policy permits a verified personal Gmail to link by unique EmpCode.
resetUsers();
identityEmail = 'personal.account@gmail.com';
result = context.qltdUsersRegister_({ idToken: 'valid', email: identityEmail, empCode: 'E-PERSONAL' });
assert.equal(result.success, true);
assert.equal(result.email, 'personal.account@gmail.com');
assert.equal(result.role, 'PMO');

// Duplicate/link/conflict and no-write failure cases.
resetUsers([
  ...baseUserRows,
  ['linked@example.com', 'Linked', 'REPORTER', 'ACTIVE', 'KINHDOANH', 'Kinh doanh', '', '', 'E-REPORTER']
]);
identityEmail = 'other@example.com';
result = context.qltdUsersRegister_({ idToken: 'valid', email: identityEmail, empCode: 'E-REPORTER' });
assert.equal(result.errorCode, 'EMP_CODE_ALREADY_LINKED');
assert.equal(appendCount, 0);

resetUsers();
identityEmail = 'duplicate-source@example.com';
assert.equal(context.qltdUsersRegister_({ idToken: 'valid', empCode: 'E-DUP' }).errorCode, 'EMPLOYEE_DUPLICATE');
assert.equal(appendCount, 0);

resetUsers();
identityEmail = 'inactive-employee@example.com';
assert.equal(context.qltdUsersRegister_({ idToken: 'valid', empCode: 'E-AWAY' }).errorCode, 'EMPLOYEE_INACTIVE');
assert.equal(appendCount, 0);

resetUsers();
identityEmail = 'missing@example.com';
assert.equal(context.qltdUsersRegister_({ idToken: 'valid', empCode: 'DOES-NOT-EXIST' }).errorCode, 'EMPLOYEE_NOT_FOUND');
assert.equal(appendCount, 0);

resetUsers();
identityEmail = 'concurrent@example.com';
lockAvailable = false;
assert.equal(context.qltdUsersRegister_({ idToken: 'valid', empCode: 'E-REPORTER' }).errorCode, 'REGISTRATION_CONFLICT');
assert.equal(appendCount, 0);

resetUsers();
identityEmail = 'invalid-token@example.com';
assert.equal(context.qltdUsersRegister_({ idToken: 'invalid', empCode: 'E-REPORTER' }).errorCode, 'ID_TOKEN_INVALID');
assert.equal(appendCount, 0);
assert.equal(context.qltdUsersRegister_({ empCode: 'E-REPORTER' }).errorCode, 'ID_TOKEN_REQUIRED');
assert.equal(appendCount, 0);
assert.equal(
  context.qltdUsersRegister_({ idToken: 'valid', email: 'spoofed@example.com', empCode: 'E-REPORTER' }).errorCode,
  'EMAIL_MISMATCH'
);
assert.equal(appendCount, 0);

resetUsers([
  ...baseUserRows,
  ['same@example.com', 'Duplicate A', 'REPORTER', 'ACTIVE', 'D1', 'D1', '', '', 'E-X1'],
  ['SAME@example.com', 'Duplicate B', 'REPORTER', 'ACTIVE', 'D1', 'D1', '', '', 'E-X2']
]);
identityEmail = 'same@example.com';
assert.equal(context.qltdUsersRegister_({ idToken: 'valid', empCode: 'E-REPORTER' }).errorCode, 'USER_DUPLICATE');
assert.equal(appendCount, 0);

// Standard error contract and frontend code-specific messaging.
const standardized = context.qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Không tìm thấy.');
assert.deepEqual(
  JSON.parse(JSON.stringify(standardized.error)),
  { code: 'EMPLOYEE_NOT_FOUND', message: 'Không tìm thấy.' }
);
for (const code of [
  'ID_TOKEN_REQUIRED', 'ID_TOKEN_INVALID', 'USER_NOT_REGISTERED', 'USER_INACTIVE',
  'USER_DUPLICATE', 'EMPLOYEE_NOT_FOUND', 'EMPLOYEE_INACTIVE', 'EMPLOYEE_DUPLICATE',
  'EMAIL_MISMATCH', 'EMP_CODE_ALREADY_LINKED', 'REGISTRATION_CONFLICT',
  'SOURCE_SHEET_NOT_FOUND', 'SOURCE_CONFIGURATION_ERROR', 'INTERNAL_ERROR'
]) {
  const message = getRegistrationErrorMessage({ error: { code, message: 'fallback' } });
  assert.notEqual(message, 'fallback', `frontend must map ${code}`);
}

// Static guardrails for source selection, token routing and Registration Gate.
assert.match(usersSource, /SpreadsheetApp\.openById\(QLTD_USERS_SPREADSHEET_ID\)/);
assert.match(employeeSource, /SpreadsheetApp\.openById\(QLTD_EMPLOYEE_SOURCE_SPREADSHEET_ID\)/);
assert.match(employeeSource, /QLTD_EMPLOYEE_SOURCE_SHEET\s*=\s*'USERS_SOFTWARE'/);
assert.doesNotMatch(employeeSource, /NS_RAW_ENTIZ|NS_MAPPING/,
  'include/exclude policy must remain owned by the curated USERS_SOFTWARE view');
assert.doesNotMatch(employeeSource, /getActiveSpreadsheet/);
assert.doesNotMatch(employeeSource, /payload\s*&&\s*payload\.(?:role|deptCode)/);
assert.match(apiSource, /qltdUsersLookupEmployees_\(payload\)/);
assert.match(apiSource, /qltdUsersRegister_\(payload\)/);
assert.match(apiSource, /resolveCurrentUser_\(params\)/);
assert.match(appSource, /code === 'USER_NOT_REGISTERED'/);
assert.match(appSource, /profile\.requiresRegistration === true/);
assert.match(appSource, /getIdToken\(forceRefresh\)/);

// The existing profile-through-bootstrap read-cache adapter must preserve the
// verified identity parameters now that bootstrap requires a Firebase token.
const forwardedReadUrls = [];
const readCacheTarget = {
  fetch: async (input) => {
    forwardedReadUrls.push(String(input));
    return new Response(JSON.stringify({
      success: true,
      profile: { success: true, email: 'legacy@example.com', role: 'REPORTER', status: 'ACTIVE' },
      projects: []
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
};
installApiReadCache(readCacheTarget);
const legacyProfileResponse = await readCacheTarget.fetch(
  'https://script.google.com/macros/s/test/exec?action=profile&email=legacy%40example.com&idToken=verified-token'
);
const forwardedBootstrapUrl = new URL(forwardedReadUrls[0]);
assert.equal(forwardedBootstrapUrl.searchParams.get('action'), 'bootstrap');
assert.equal(forwardedBootstrapUrl.searchParams.get('email'), 'legacy@example.com');
assert.equal(forwardedBootstrapUrl.searchParams.get('idToken'), 'verified-token');
assert.equal((await legacyProfileResponse.json()).email, 'legacy@example.com');

console.log('Controlled auth/registration flow tests: PASS');
