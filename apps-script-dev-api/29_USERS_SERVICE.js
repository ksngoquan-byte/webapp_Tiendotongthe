const QLTD_USERS_SPREADSHEET_ID = '1ZAZwSjGOvKEp8iLCqLsEiJyJSFBR-jeru0RL25Q4xMM';
const QLTD_USERS_SHEET_NAME = 'Users';
const QLTD_USERS_HEADERS = [
  'Email',
  'DisplayName',
  'Role',
  'Status',
  'DeptCode',
  'DeptName',
  'LastLoginAt',
  'Note',
  'EmpCode'
];
const QLTD_USERS_VALID_ROLES = ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'];
const QLTD_USERS_VALID_STATUSES = ['ACTIVE', 'INACTIVE'];
const QLTD_USERS_INITIAL_ADMIN = {
  email: 'ksngoquan@gmail.com',
  displayName: 'Ngô Quân',
  role: 'ADMIN',
  status: 'ACTIVE',
  deptCode: 'ADMIN',
  deptName: 'Quản trị hệ thống',
  lastLoginAt: '',
  note: 'Initial DEV admin',
  empCode: ''
};

function qltdSetupUsersSheet() {
  const sheet = qltdUsersEnsureSheet_();
  qltdUsersSeedAdminIfMissing_();
  return {
    success: true,
    sheetName: sheet.getName(),
    headers: QLTD_USERS_HEADERS.slice()
  };
}

// Authentication paths are read-only with respect to schema. Missing sheets or
// headers fail closed instead of creating or rewriting the Users sheet.
function qltdUsersEnsureSheet_(options) {
  let spreadsheet;
  try {
    if (typeof qltdPerfIncrement_ === 'function') qltdPerfIncrement_('usersSpreadsheetOpens');
    spreadsheet = SpreadsheetApp.openById(QLTD_USERS_SPREADSHEET_ID);
  } catch (error) {
    throw qltdUsersServiceError_('SOURCE_CONFIGURATION_ERROR', 'Không mở được nguồn người dùng trung tâm.');
  }
  const sheet = spreadsheet.getSheetByName(QLTD_USERS_SHEET_NAME);
  if (!sheet) {
    throw qltdUsersServiceError_('SOURCE_SHEET_NOT_FOUND', 'Không tìm thấy sheet Users.');
  }
  if (!(options && options.skipHeaderValidation)) qltdUsersEnsureHeaders_(sheet);
  return sheet;
}

function qltdUsersEnsureHeaders_(sheet) {
  const headerMap = qltdUsersHeaderMap_(sheet);
  const missingHeaders = QLTD_USERS_HEADERS.filter(function(header) {
    return headerMap[header] === undefined;
  });
  if (missingHeaders.length) {
    throw qltdUsersServiceError_('SOURCE_CONFIGURATION_ERROR', 'Sheet Users thiếu cột bắt buộc.', {
      missingHeaders: missingHeaders
    });
  }
  return headerMap;
}

function qltdUsersHeaderMap_(sheet) {
  const lastColumn = Math.max(Number(sheet.getLastColumn() || 0), QLTD_USERS_HEADERS.length);
  if (typeof qltdPerfIncrement_ === 'function') qltdPerfIncrement_('sheetRangeReads');
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const headerMap = {};
  headers.forEach(function(header, index) {
    if (header && headerMap[header] === undefined) headerMap[header] = index;
  });
  return headerMap;
}

function qltdUsersReadAll_() {
  if (typeof qltdPerfMemoHas_ === 'function' && qltdPerfMemoHas_('users', 'all')) {
    return qltdPerfMemoGet_('users', 'all');
  }
  if (typeof qltdPerfIncrement_ === 'function') qltdPerfIncrement_('usersPhysicalReads');
  const sheet = qltdUsersEnsureSheet_({ skipHeaderValidation: true });
  const headerMap = qltdUsersEnsureHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  const width = Math.max(Number(sheet.getLastColumn() || 0), QLTD_USERS_HEADERS.length);
  if (lastRow < 2) {
    const emptyResult = { sheet: sheet, headerMap: headerMap, width: width, users: [] };
    return typeof qltdPerfMemoSet_ === 'function'
      ? qltdPerfMemoSet_('users', 'all', emptyResult)
      : emptyResult;
  }
  if (typeof qltdPerfIncrement_ === 'function') {
    qltdPerfIncrement_('sheetRangeReads');
    qltdPerfIncrement_('usersRowsRead', lastRow - 1);
  }
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const result = {
    sheet: sheet,
    headerMap: headerMap,
    width: width,
    users: values.map(function(row, index) {
      return qltdUsersParseRow_(row, index + 2, headerMap);
    }).filter(function(user) {
      return !!(user.email || user.empCode);
    })
  };
  return typeof qltdPerfMemoSet_ === 'function'
    ? qltdPerfMemoSet_('users', 'all', result)
    : result;
}

function qltdUsersParseRow_(row, rowIndex, headerMap) {
  return {
    rowIndex: rowIndex,
    email: qltdUsersNormalizeEmail_(row[headerMap.Email]),
    displayName: String(row[headerMap.DisplayName] || '').trim(),
    role: qltdUsersNormalizeRole_(row[headerMap.Role]),
    status: qltdUsersNormalizeStatus_(row[headerMap.Status]),
    deptCode: String(row[headerMap.DeptCode] || '').trim(),
    deptName: String(row[headerMap.DeptName] || '').trim(),
    lastLoginAt: row[headerMap.LastLoginAt] || '',
    note: String(row[headerMap.Note] || '').trim(),
    empCode: qltdUsersNormalizeEmpCode_(row[headerMap.EmpCode])
  };
}

function qltdUsersFindAllByEmail_(email, readResult) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  if (!normalizedEmail) return [];
  const source = readResult || qltdUsersReadAll_();
  return source.users.filter(function(user) {
    return user.email === normalizedEmail;
  });
}

function qltdUsersFindAllByEmpCode_(empCode, readResult) {
  const normalizedEmpCode = qltdUsersNormalizeEmpCode_(empCode);
  if (!normalizedEmpCode) return [];
  const source = readResult || qltdUsersReadAll_();
  return source.users.filter(function(user) {
    return user.empCode === normalizedEmpCode;
  });
}

// Legacy callers receive a user only when the identity is unique. This changes
// duplicate data from fail-open (first row wins) to fail-closed.
function qltdUsersGetByEmail_(email) {
  try {
    const matches = qltdUsersFindAllByEmail_(email);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) qltdAuthLog_('USER_DUPLICATE', 'users_get_by_email');
    return null;
  } catch (error) {
    qltdAuthLog_(error && error.code || 'INTERNAL_ERROR', 'users_get_by_email');
    return null;
  }
}

function resolveCurrentUser_(payload, verifiedIdentity) {
  const identity = verifiedIdentity || qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return identity;

  try {
    const matches = qltdUsersFindAllByEmail_(identity.email);
    if (!matches.length) {
      return qltdUsersBuildAuthError_('USER_NOT_REGISTERED', 'Tài khoản chưa được đăng ký trên hệ thống.', {
        requiresRegistration: true
      });
    }
    if (matches.length > 1) {
      qltdAuthLog_('USER_DUPLICATE', 'resolve_current_user');
      return qltdUsersBuildAuthError_('USER_DUPLICATE', 'Dữ liệu tài khoản bị trùng. Vui lòng liên hệ quản trị.');
    }

    const user = matches[0];
    if (user.status !== 'ACTIVE') {
      const code = user.status === 'DISABLED' ? 'USER_DISABLED' : 'USER_INACTIVE';
      return qltdUsersBuildAuthError_(code, 'Tài khoản đang bị khóa hoặc không còn hoạt động.');
    }
    if (!qltdUsersIsValidRole_(user.role)) {
      return qltdUsersBuildAuthError_('INVALID_ROLE', 'Vai trò tài khoản không hợp lệ.');
    }

    return {
      success: true,
      identity: identity,
      user: user
    };
  } catch (error) {
    return qltdUsersErrorFromException_(error, 'resolve_current_user');
  }
}

function qltdUsersBuildRow_(sheet, valuesByHeader) {
  const headerMap = qltdUsersEnsureHeaders_(sheet);
  const width = Math.max(Number(sheet.getLastColumn() || 0), QLTD_USERS_HEADERS.length);
  const row = new Array(width).fill('');
  Object.keys(valuesByHeader || {}).forEach(function(header) {
    if (headerMap[header] !== undefined) row[headerMap[header]] = valuesByHeader[header];
  });
  return row;
}

function qltdUsersSeedAdminIfMissing_() {
  const matches = qltdUsersFindAllByEmail_(QLTD_USERS_INITIAL_ADMIN.email);
  if (matches.length) return false;
  const sheet = qltdUsersEnsureSheet_();
  sheet.appendRow(qltdUsersBuildRow_(sheet, {
    Email: QLTD_USERS_INITIAL_ADMIN.email,
    DisplayName: QLTD_USERS_INITIAL_ADMIN.displayName,
    Role: QLTD_USERS_INITIAL_ADMIN.role,
    Status: QLTD_USERS_INITIAL_ADMIN.status,
    DeptCode: QLTD_USERS_INITIAL_ADMIN.deptCode,
    DeptName: QLTD_USERS_INITIAL_ADMIN.deptName,
    LastLoginAt: QLTD_USERS_INITIAL_ADMIN.lastLoginAt,
    Note: QLTD_USERS_INITIAL_ADMIN.note,
    EmpCode: QLTD_USERS_INITIAL_ADMIN.empCode
  }));
  return true;
}

function qltdUsersBuildAuthError_(code, message, extra) {
  const safeCode = String(code || 'INTERNAL_ERROR').trim().toUpperCase();
  const safeMessage = String(message || 'Không thể hoàn tất yêu cầu.').trim();
  const response = {
    success: false,
    error: {
      code: safeCode,
      message: safeMessage
    },
    // Legacy fields remain during the compatibility window.
    message: safeCode,
    errorCode: safeCode,
    errorMessage: safeMessage,
    apiStatus: 'CONNECTED',
    source: 'auth_registration_v3'
  };
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function(key) {
      if (key !== 'error' && key !== 'idToken') response[key] = extra[key];
    });
  }
  return response;
}

function qltdUsersRegistrationSuccess_(user, created, alreadyExists) {
  return {
    success: true,
    created: !!created,
    alreadyExists: !!alreadyExists,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    deptCode: user.deptCode,
    deptName: user.deptName,
    empCode: user.empCode || '',
    permissions: qltdPermissionsForRole_(user.role),
    apiStatus: 'CONNECTED',
    source: 'auth_registration_v3'
  };
}

function qltdUsersTouchLastLogin_(rowIndex) {
  const row = Number(rowIndex || 0);
  if (row < 2) return false;
  try {
    const sheet = qltdUsersEnsureSheet_();
    const headerMap = qltdUsersEnsureHeaders_(sheet);
    sheet.getRange(row, headerMap.LastLoginAt + 1).setValue(new Date());
    return true;
  } catch (error) {
    qltdAuthLog_(error && error.code || 'INTERNAL_ERROR', 'touch_last_login');
    return false;
  }
}

function qltdUsersServiceError_(code, message, details) {
  const error = new Error(message || code);
  error.code = code;
  error.safeMessage = message || code;
  error.safeDetails = details || null;
  return error;
}

function qltdUsersErrorFromException_(error, stage) {
  const code = error && error.code || 'INTERNAL_ERROR';
  const allowedCode = [
    'SOURCE_SHEET_NOT_FOUND',
    'SOURCE_CONFIGURATION_ERROR'
  ].indexOf(code) !== -1 ? code : 'INTERNAL_ERROR';
  qltdAuthLog_(allowedCode, stage);
  return qltdUsersBuildAuthError_(
    allowedCode,
    allowedCode === 'INTERNAL_ERROR'
      ? 'Hệ thống không thể hoàn tất yêu cầu.'
      : String(error && error.safeMessage || 'Cấu hình nguồn dữ liệu không hợp lệ.'),
    error && error.safeDetails ? error.safeDetails : null
  );
}

function qltdAuthLog_(code, stage, extra) {
  const requestId = typeof QLTD_PERF_REQUEST_CONTEXT_ !== 'undefined' && QLTD_PERF_REQUEST_CONTEXT_
    ? String(QLTD_PERF_REQUEST_CONTEXT_.requestId || '')
    : '';
  const entry = Object.assign({
    requestId: requestId,
    stage: String(stage || ''),
    code: String(code || 'INTERNAL_ERROR')
  }, extra || {});
  console.warn(JSON.stringify(entry));
}

function qltdUsersNormalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function qltdUsersNormalizeEmpCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdUsersNormalizeRole_(role) {
  return String(role || '').trim().toUpperCase();
}

function qltdUsersNormalizeStatus_(status) {
  return String(status || '').trim().toUpperCase();
}

function qltdUsersIsValidRole_(role) {
  return QLTD_USERS_VALID_ROLES.indexOf(qltdUsersNormalizeRole_(role)) !== -1;
}

function qltdUsersIsValidStatus_(status) {
  return QLTD_USERS_VALID_STATUSES.indexOf(qltdUsersNormalizeStatus_(status)) !== -1;
}

function qltdUsersFormatIsoLocal_(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const timezone = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  return Utilities.formatDate(date, timezone, "yyyy-MM-dd'T'HH:mm:ss");
}
