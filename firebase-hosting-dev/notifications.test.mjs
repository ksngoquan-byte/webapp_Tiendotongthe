import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/69_Notification_Service.js', import.meta.url), 'utf8');

function createSheet(name, initialRows = []) {
  const rows = initialRows.map((row) => row.slice());
  return {
    rows,
    frozenRows: 0,
    getName: () => name,
    getLastColumn: () => rows[0]?.length || 0,
    getLastRow: () => rows.length,
    getRange: (row, column, rowCount = 1, columnCount = 1) => {
      const range = {
        getValues: () => Array.from({ length: rowCount }, (_, rowOffset) =>
          Array.from({ length: columnCount }, (_, columnOffset) => rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? '')
        ),
        setValues: (values) => {
          values.forEach((sourceRow, rowOffset) => {
            const target = rows[row - 1 + rowOffset] || [];
            sourceRow.forEach((value, columnOffset) => { target[column - 1 + columnOffset] = value; });
            rows[row - 1 + rowOffset] = target;
          });
          return range;
        },
        setFontWeight: () => range
      };
      return range;
    },
    getRangeList: (addresses) => ({
      setValue: (value) => {
        addresses.forEach((address) => {
          const match = String(address).match(/^([A-Z]+)(\d+)$/);
          let column = 0;
          for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
          const row = Number(match[2]);
          const target = rows[row - 1] || [];
          target[column - 1] = value;
          rows[row - 1] = target;
        });
      }
    }),
    setFrozenRows: (count) => { rows.frozenRows = count; }
  };
}

function createSpreadsheet(initialSheets = {}) {
  const sheets = { ...initialSheets };
  let insertCount = 0;
  return {
    sheets,
    get insertCount() { return insertCount; },
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      insertCount += 1;
      const sheet = createSheet(name);
      sheets[name] = sheet;
      return sheet;
    }
  };
}

let spreadsheet = createSpreadsheet();
let authEmail = 'reporter@example.com';
let nowCounter = 0;
let uuidCounter = 0;
const logs = [];
const notificationCache = new Map();
let users = [
  { email: 'reporter@example.com', role: 'REPORTER', status: 'ACTIVE', deptCode: 'PTDA' },
  { email: 'editor1@example.com', role: 'EDITOR', status: 'ACTIVE', deptCode: 'PTDA' },
  { email: 'editor2@example.com', role: 'EDITOR', status: 'ACTIVE', deptCode: 'PTDA' },
  { email: 'editor-other@example.com', role: 'EDITOR', status: 'ACTIVE', deptCode: 'OTHER' },
  { email: 'editor-inactive@example.com', role: 'EDITOR', status: 'INACTIVE', deptCode: 'PTDA' },
  { email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', deptCode: 'ADMIN' },
  { email: 'pmo@example.com', role: 'PMO', status: 'ACTIVE', deptCode: 'BLD' },
  { email: 'viewer@example.com', role: 'VIEWER', status: 'ACTIVE', deptCode: 'PTDA' },
  { email: 'admin-inactive@example.com', role: 'ADMIN', status: 'INACTIVE', deptCode: 'ADMIN' }
];

const context = {
  getCurrentSpreadsheet_: () => spreadsheet,
  qltdWorkNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdWorkNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdMasterDeptCanonicalCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdUsersIsValidRole_: (value) => ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'].includes(String(value || '').toUpperCase()),
  qltdWorkListUsers_: () => users.map((user) => ({ ...user })),
  qltdUsersGetByEmail_: (email) => users.find((user) => user.email === String(email || '').toLowerCase()) || null,
  qltdCanManageProjectDept_: (user, _projectCode, deptCode) =>
    user?.role === 'EDITOR' &&
    String(user?.deptCode || '').toUpperCase() === String(deptCode || '').toUpperCase(),
  qltdWorkAuthUser_: () => {
    const user = users.find((candidate) => candidate.email === authEmail);
    return user && user.status === 'ACTIVE'
      ? { email: authEmail, user }
      : { error: { success: false, code: 'USER_INACTIVE' } };
  },
  qltdWorkNowIso_: () => `2026-06-29T00:00:${String(++nowCounter).padStart(2, '0')}.000Z`,
  qltdWorkOk_: (_source, _action, data, warnings, meta) => ({ success: true, ...data, warnings, meta }),
  qltdWorkError_: (_source, _action, code, message, meta) => ({ success: false, code, message, meta }),
  qltdWorkWarning_: (code, message, extra = {}) => ({ code, message, ...extra }),
  qltdBudgetSafeErrorMessage_: (error) => String(error?.message || error),
  QLTD_WORK_WRITE_LOCK_TIMEOUT_MS: 1000,
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => notificationCache.get(key) || null,
      put: (key, value) => notificationCache.set(key, value),
      remove: (key) => notificationCache.delete(key)
    })
  },
  Utilities: { getUuid: () => `UUID-${++uuidCounter}` },
  Logger: { log: (message) => logs.push(String(message)) },
  isFinite,
  console
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.api = {
  headers: QLTD_NOTIFICATIONS_HEADERS,
  setup: qltdSetupNotificationsSheet_,
  inspect: qltdNotificationsInspectSheet_,
  pending: qltdNotificationsTryCreatePendingNoLock_,
  finalize: qltdNotificationsTryFinalizeReviewNoLock_,
  list: qltdNotificationsList_,
  summary: qltdNotificationsSummary_,
  markRead: qltdNotificationsMarkRead_,
  read: qltdNotificationsRead_
};`, context);
const api = context.api;

assert.equal(api.headers.length, 19);
assert.deepEqual(Array.from(api.headers), [
  'NotificationId', 'RecipientEmail', 'RecipientRole', 'Type', 'EntityType', 'EntityId',
  'ProjectCode', 'DepartmentCode', 'WeekStart', 'TabKey', 'ItemKey', 'Title', 'Message',
  'IsRead', 'ReadAt', 'Status', 'CreatedAt', 'ResolvedAt', 'SourceRequestId'
]);
const setupCreated = api.setup();
assert.equal(setupCreated.success, true);
assert.equal(setupCreated.created, true);
assert.equal(spreadsheet.insertCount, 1);
assert.deepEqual(spreadsheet.sheets.NOTIFICATIONS.rows[0], Array.from(api.headers));
assert.equal(spreadsheet.sheets.NOTIFICATIONS.rows.length, 1);
const setupAgain = api.setup();
assert.equal(setupAgain.success, true);
assert.equal(setupAgain.created, false);
assert.equal(spreadsheet.insertCount, 1);
assert.equal(spreadsheet.sheets.NOTIFICATIONS.rows.length, 1);
const existingRow = Array(19).fill('EXISTING');
spreadsheet.sheets.NOTIFICATIONS.rows.push(existingRow.slice());
assert.equal(api.setup().success, true);
assert.deepEqual(spreadsheet.sheets.NOTIFICATIONS.rows[1], existingRow);
assert.doesNotMatch(source, /ScriptApp|newTrigger|createTrigger/);
assert.doesNotMatch(source, /qltdGantt|Dashboard|setInterval/);

const badHeader = Array.from(api.headers);
badHeader[3] = 'WrongType';
spreadsheet = createSpreadsheet({ NOTIFICATIONS: createSheet('NOTIFICATIONS', [badHeader, ['KEEP-ME']]) });
const badSetup = api.setup();
assert.equal(badSetup.success, false);
assert.equal(badSetup.code, 'NOTIFICATIONS_HEADER_MISMATCH');
assert.equal(spreadsheet.sheets.NOTIFICATIONS.rows[0][3], 'WrongType');
assert.equal(spreadsheet.sheets.NOTIFICATIONS.rows[1][0], 'KEEP-ME');
assert.equal(api.inspect(createSheet('NOTIFICATIONS', [Array.from(api.headers).slice(0, 18)])).headerMatches, false);
assert.equal(api.inspect(createSheet('NOTIFICATIONS', [[...Array.from(api.headers), 'EXTRA']])).headerMatches, false);

spreadsheet = createSpreadsheet();
api.setup();
const pbUpdate = {
  updateId: 'WTU-PB-1', projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-22',
  itemType: 'PB_DETAIL', itemId: 'DT-1', updatedBy: 'reporter@example.com', approvalStatus: 'PENDING'
};
const pbPending = api.pending(pbUpdate);
assert.equal(pbPending.createdCount, 2);
assert.equal(pbPending.duplicateCount, 0);
let notifications = api.read().notifications;
assert.deepEqual(notifications.map((item) => item.recipientEmail).sort(), ['editor1@example.com', 'editor2@example.com']);
assert.ok(notifications.every((item) => item.type === 'PB_DETAIL_PENDING' && item.status === 'OPEN' && !item.isRead));
assert.ok(notifications.every((item) => item.sourceRequestId === 'WTU-PB-1' && item.weekStart === '2026-06-22'));
const duplicatePending = api.pending(pbUpdate);
assert.equal(duplicatePending.createdCount, 0);
assert.equal(duplicatePending.duplicateCount, 2);
assert.equal(api.read().notifications.length, 2);
authEmail = 'editor1@example.com';
const openPendingList = api.list({ limit: 100 });
assert.equal(openPendingList.unreadCount, 1);
assert.equal(openPendingList.actionRequiredCount, 1);
const openPendingSummary = api.summary({});
assert.equal(openPendingSummary.unreadCount, 1);
assert.equal(openPendingSummary.actionRequiredCount, 1);
assert.equal(openPendingSummary.notifications, undefined);

const masterUpdate = {
  updateId: 'WTU-MASTER-1', projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-22',
  itemType: 'MASTER', itemId: 'M1', updatedBy: 'reporter@example.com', approvalStatus: 'PENDING'
};
const masterPending = api.pending(masterUpdate);
assert.equal(masterPending.createdCount, 2);
notifications = api.read().notifications.filter((item) => item.sourceRequestId === 'WTU-MASTER-1');
assert.deepEqual(notifications.map((item) => item.recipientRole).sort(), ['ADMIN', 'PMO']);
const adminSubmittedMaster = api.pending({ ...masterUpdate, updateId: 'WTU-MASTER-ADMIN', updatedBy: 'admin@example.com' });
assert.equal(adminSubmittedMaster.createdCount, 2);
assert.deepEqual(
  api.read().notifications.filter((item) => item.sourceRequestId === 'WTU-MASTER-ADMIN').map((item) => item.recipientEmail).sort(),
  ['admin@example.com', 'pmo@example.com']
);

const rejected = api.finalize({ ...pbUpdate, approvalStatus: 'REJECTED', reviewReason: 'Thiếu hồ sơ\nBổ sung minh chứng' });
assert.equal(rejected.resolvedCount, 2);
assert.equal(rejected.createdCount, 1);
notifications = api.read().notifications;
assert.ok(notifications.filter((item) => item.sourceRequestId === 'WTU-PB-1' && item.type === 'PB_DETAIL_PENDING').every((item) => item.status === 'RESOLVED' && item.resolvedAt));
const rejectionNotice = notifications.find((item) => item.type === 'UPDATE_REJECTED');
assert.equal(rejectionNotice.recipientEmail, 'reporter@example.com');
assert.match(rejectionNotice.message, /Thiếu hồ sơ Bổ sung minh chứng/);

const approved = api.finalize({ ...masterUpdate, approvalStatus: 'APPROVED', reviewReason: '' });
assert.equal(approved.resolvedCount, 2);
assert.equal(approved.createdCount, 1);
assert.equal(api.finalize({ ...masterUpdate, approvalStatus: 'APPROVED' }).duplicateCount, 1);

authEmail = 'reporter@example.com';
let listResult = api.list({ email: 'spoofed@example.com', limit: 100 });
assert.equal(listResult.success, true);
assert.ok(listResult.notifications.every((item) => item.recipientEmail === 'reporter@example.com'));
assert.equal(listResult.unreadCount, 2);
assert.equal(listResult.actionRequiredCount, 0);
assert.equal(listResult.notifications[0].type, 'UPDATE_APPROVED');
authEmail = 'editor1@example.com';
listResult = api.list({ limit: 100 });
assert.equal(listResult.notifications.length, 1);
assert.equal(listResult.unreadCount, 1);
assert.equal(listResult.actionRequiredCount, 0);
const editorNotice = listResult.notifications[0];
const marked = api.markRead({ notificationId: editorNotice.notificationId });
assert.equal(marked.success, true);
assert.equal(marked.updated, true);
assert.equal(marked.notification.isRead, true);
const markedSummary = api.summary({});
assert.equal(markedSummary.unreadCount, 0, 'mark-read must invalidate the user summary cache');
const markedAgain = api.markRead({ notificationId: editorNotice.notificationId });
assert.equal(markedAgain.success, true);
assert.equal(markedAgain.updated, false);
authEmail = 'editor2@example.com';
assert.equal(api.markRead({ notificationId: editorNotice.notificationId }).code, 'ACCESS_DENIED');
for (const email of ['reporter@example.com', 'editor1@example.com', 'admin@example.com', 'pmo@example.com', 'viewer@example.com']) {
  authEmail = email;
  const ownList = api.list({ limit: 100 });
  const ownSummary = api.summary({});
  assert.equal(ownList.success, true);
  assert.ok(ownList.notifications.every((notification) => notification.recipientEmail === email));
  assert.equal(ownSummary.totalCount, ownList.totalCount);
  assert.equal(ownSummary.unreadCount, ownList.unreadCount);
}

spreadsheet = createSpreadsheet();
const failSafe = api.pending({ ...pbUpdate, updateId: 'WTU-NO-SHEET' });
assert.equal(failSafe.createdCount, 0);
assert.equal(failSafe.warnings[0].code, 'NOTIFICATION_CREATE_FAILED');
assert.match(logs.at(-1), /WTU-NO-SHEET/);

console.log('Notification schema/backend tests: PASS');
