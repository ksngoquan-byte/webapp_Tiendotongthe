const QLTD_EMPLOYEE_SOURCE_SPREADSHEET_ID = '1Tu3t6RyNJC3dkpnlBobdjR2yvP17UYrfish9jlXoQ3g';
const QLTD_EMPLOYEE_SOURCE_SHEET = 'USERS_SOFTWARE';
const QLTD_EMPLOYEE_REQUIRED_HEADERS = [
  'EMP_CODE',
  'FULL_NAME',
  'EMAIL',
  'DEPT_SOURCE',
  'POSITION_SOURCE',
  'DEPT_CODE',
  'ROLE_CODE',
  'ACTIVE_STATUS'
];
const QLTD_EMPLOYEE_ACTIVE_STATUS = 'Đang làm việc';
const QLTD_EMPLOYEE_CACHE_KEY = 'eligible_employee_profiles_v3';
const QLTD_EMPLOYEE_CACHE_TTL_SECONDS = 300;
const QLTD_EMPLOYEE_CACHE_MAX_CHARS = 90000;
const QLTD_EMPLOYEE_REGISTRATION_LOCK_TIMEOUT_MS = 10000;

function normalizeEmployeeName_(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi-VN');
}

function qltdEmployeesNormalizeNameSearchKey_(value) {
  return normalizeEmployeeName_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function qltdEmployeesNormalizeRoleText_(value) {
  return qltdEmployeesNormalizeNameSearchKey_(value);
}

function qltdEmployeesNormalizeCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function readEligibleEmployeeProfiles_(options) {
  const useCache = !options || options.useCache !== false;
  const cache = CacheService.getScriptCache();
  if (useCache) {
    const cached = cache.get(QLTD_EMPLOYEE_CACHE_KEY);
    if (cached) {
      try {
        return {
          success: true,
          rows: JSON.parse(cached),
          cacheHit: true,
          rowsRead: 0,
          columnsRead: 0
        };
      } catch (ignore) {
        // Invalid cache entries are treated as misses.
      }
    }
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(QLTD_EMPLOYEE_SOURCE_SPREADSHEET_ID);
  } catch (error) {
    return qltdUsersBuildAuthError_('SOURCE_CONFIGURATION_ERROR', 'Không mở được nguồn nhân sự đã cấu hình.');
  }
  const sheet = spreadsheet.getSheetByName(QLTD_EMPLOYEE_SOURCE_SHEET);
  if (!sheet) {
    return qltdUsersBuildAuthError_('SOURCE_SHEET_NOT_FOUND', 'Không tìm thấy sheet USERS_SOFTWARE.');
  }

  try {
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) {
      return qltdUsersBuildAuthError_('SOURCE_CONFIGURATION_ERROR', 'Nguồn nhân sự đang trống.');
    }
    const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
    const headers = values[0].map(function(value) { return String(value || '').trim(); });
    const headerMap = {};
    headers.forEach(function(header, index) {
      if (header && headerMap[header] === undefined) headerMap[header] = index;
    });
    const missingHeaders = QLTD_EMPLOYEE_REQUIRED_HEADERS.filter(function(header) {
      return headerMap[header] === undefined;
    });
    if (missingHeaders.length) {
      return qltdUsersBuildAuthError_('SOURCE_CONFIGURATION_ERROR', 'Nguồn nhân sự thiếu cột bắt buộc.', {
        missingHeaders: missingHeaders
      });
    }

    const rows = values.slice(1).map(function(row) {
      return {
        empCode: qltdEmployeesNormalizeCode_(row[headerMap.EMP_CODE]),
        fullName: String(row[headerMap.FULL_NAME] || '').normalize('NFC').trim().replace(/\s+/g, ' '),
        employeeEmail: qltdUsersNormalizeEmail_(row[headerMap.EMAIL]),
        deptName: String(row[headerMap.DEPT_SOURCE] || '').trim(),
        position: String(row[headerMap.POSITION_SOURCE] || '').trim(),
        deptCode: qltdEmployeesNormalizeCode_(row[headerMap.DEPT_CODE]),
        roleCode: String(row[headerMap.ROLE_CODE] || '').trim(),
        activeStatus: String(row[headerMap.ACTIVE_STATUS] || '').trim()
      };
    }).filter(function(employee) {
      return !!(employee.empCode || employee.fullName);
    });

    const serialized = JSON.stringify(rows);
    if (useCache && serialized.length <= QLTD_EMPLOYEE_CACHE_MAX_CHARS) {
      cache.put(QLTD_EMPLOYEE_CACHE_KEY, serialized, QLTD_EMPLOYEE_CACHE_TTL_SECONDS);
    }
    return {
      success: true,
      rows: rows,
      cacheHit: false,
      rowsRead: lastRow,
      columnsRead: lastColumn
    };
  } catch (error) {
    qltdAuthLog_('INTERNAL_ERROR', 'read_employee_source');
    return qltdUsersBuildAuthError_('INTERNAL_ERROR', 'Không thể đọc nguồn nhân sự.');
  }
}

function qltdEmployeesIsActive_(employee) {
  return normalizeEmployeeName_(employee && employee.activeStatus) === normalizeEmployeeName_(QLTD_EMPLOYEE_ACTIVE_STATUS);
}

function qltdEmployeesIsEligible_(employee) {
  return !!(employee && employee.empCode && employee.fullName && employee.deptCode && qltdEmployeesIsActive_(employee));
}

function matchEmployeeProfiles_(fullName, employees) {
  const exactKey = normalizeEmployeeName_(fullName);
  const searchKey = qltdEmployeesNormalizeNameSearchKey_(fullName);
  const eligible = (employees || []).filter(qltdEmployeesIsEligible_);
  const exactMatches = eligible.filter(function(employee) {
    return normalizeEmployeeName_(employee.fullName) === exactKey;
  });
  if (exactMatches.length) return { matches: exactMatches, matchMode: 'EXACT' };
  const accentInsensitiveMatches = eligible.filter(function(employee) {
    return qltdEmployeesNormalizeNameSearchKey_(employee.fullName) === searchKey;
  });
  return { matches: accentInsensitiveMatches, matchMode: 'ACCENT_INSENSITIVE' };
}

function qltdEmployeesPublicProfile_(employee) {
  return {
    empCode: employee.empCode,
    fullName: employee.fullName,
    deptCode: employee.deptCode,
    deptName: employee.deptName,
    position: employee.position
  };
}

function qltdUsersLookupEmployees_(payload) {
  const resolution = resolveCurrentUser_(payload);
  if (resolution.success) {
    return qltdUsersBuildAuthError_('REGISTRATION_CONFLICT', 'Tài khoản đã được đăng ký.', {
      alreadyRegistered: true,
      profile: qltdUsersRegistrationSuccess_(resolution.user, false, true)
    });
  }
  if (resolution.errorCode !== 'USER_NOT_REGISTERED') return resolution;

  const fullName = String(payload && payload.fullName || '').trim();
  if (!fullName) {
    return qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Vui lòng nhập họ và tên.', { profiles: [] });
  }
  const source = readEligibleEmployeeProfiles_({ useCache: true });
  if (!source.success) return source;
  const matched = matchEmployeeProfiles_(fullName, source.rows);
  const profiles = matched.matches.map(qltdEmployeesPublicProfile_);
  if (!profiles.length) {
    return qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Không tìm thấy nhân sự phù hợp.', { profiles: [] });
  }
  return {
    success: true,
    profiles: profiles,
    matchCount: profiles.length,
    matchMode: matched.matchMode,
    selectionRequired: profiles.length > 1 || matched.matchMode === 'ACCENT_INSENSITIVE',
    apiStatus: 'CONNECTED',
    source: 'users_software',
    performance: {
      rowsRead: Number(source.rowsRead || 0),
      columnsRead: Number(source.columnsRead || 0),
      cacheHit: !!source.cacheHit
    }
  };
}

function qltdEmployeesReadByCodeFresh_(empCode) {
  const targetCode = qltdEmployeesNormalizeCode_(empCode);
  if (!targetCode) {
    return qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Vui lòng chọn đúng hồ sơ nhân sự.');
  }
  const source = readEligibleEmployeeProfiles_({ useCache: false });
  if (!source.success) return source;
  const matches = source.rows.filter(function(employee) {
    return employee.empCode === targetCode;
  });
  if (!matches.length) {
    return qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Không tìm thấy hồ sơ nhân sự.');
  }
  if (matches.length > 1) {
    return qltdUsersBuildAuthError_('EMPLOYEE_DUPLICATE', 'Mã nhân sự đang trùng trong nguồn nhân sự.');
  }
  const employee = matches[0];
  if (!qltdEmployeesIsActive_(employee)) {
    return qltdUsersBuildAuthError_('EMPLOYEE_INACTIVE', 'Hồ sơ không còn trạng thái làm việc.');
  }
  if (!employee.fullName || !employee.deptCode || !employee.deptName) {
    return qltdUsersBuildAuthError_('SOURCE_CONFIGURATION_ERROR', 'Hồ sơ nhân sự thiếu thông tin Phòng/Ban bắt buộc.');
  }
  return { success: true, employee: employee };
}

// Preserve the employee-to-role policy from the previous verified registration
// implementation. ADMIN and VIEWER are never self-provisioned.
function qltdEmployeesRoleFor_(employee) {
  const empCode = qltdEmployeesNormalizeCode_(employee && employee.empCode);
  const deptCode = qltdEmployeesNormalizeCode_(employee && employee.deptCode);
  const roleCode = qltdEmployeesNormalizeRoleText_(employee && employee.roleCode);
  if (empCode === 'E2510050') return 'EDITOR';
  if (deptCode === 'BLD' || deptCode === 'KEHOACH') return 'PMO';
  if (deptCode === 'PHAPCHE') return 'EDITOR';
  if (deptCode === 'KYTHUAT' && /^truong bo phan(?:\s|$)/.test(roleCode)) return 'EDITOR';
  if (
    roleCode === 'truong phong' ||
    /^truong phong kiem(?:\s|$)/.test(roleCode) ||
    roleCode === 'pho phong' ||
    roleCode === 'chanh van phong' ||
    roleCode === 'truong ban qlda' ||
    /^phu trach phong(?:\s|$)/.test(roleCode) ||
    roleCode === 'giam doc marketing'
  ) return 'EDITOR';
  return 'REPORTER';
}

function validateEmployeeRegistration_(identity, employee, usersRead) {
  const email = qltdUsersNormalizeEmail_(identity && identity.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return qltdUsersBuildAuthError_('EMAIL_MISMATCH', 'Email Firebase không hợp lệ cho đăng ký.');
  }

  const emailMatches = qltdUsersFindAllByEmail_(email, usersRead);
  if (emailMatches.length > 1) {
    return qltdUsersBuildAuthError_('USER_DUPLICATE', 'Dữ liệu tài khoản bị trùng. Vui lòng liên hệ quản trị.');
  }
  if (emailMatches.length === 1) {
    const existing = emailMatches[0];
    if (existing.status !== 'ACTIVE') {
      return qltdUsersBuildAuthError_('USER_INACTIVE', 'Tài khoản đang bị khóa.');
    }
    if (!qltdUsersIsValidRole_(existing.role)) {
      return qltdUsersBuildAuthError_('INVALID_ROLE', 'Vai trò tài khoản không hợp lệ.');
    }
    if (existing.empCode === employee.empCode) {
      return { success: true, idempotentUser: existing };
    }
    return qltdUsersBuildAuthError_('REGISTRATION_CONFLICT', 'Email đã được liên kết với hồ sơ nhân sự khác.');
  }

  const empCodeMatches = qltdUsersFindAllByEmpCode_(employee.empCode, usersRead);
  if (empCodeMatches.length > 1) {
    return qltdUsersBuildAuthError_('REGISTRATION_CONFLICT', 'Mã nhân sự đang có nhiều liên kết trong Users.');
  }
  if (empCodeMatches.length === 1 && empCodeMatches[0].email !== email) {
    return qltdUsersBuildAuthError_('EMP_CODE_ALREADY_LINKED', 'Hồ sơ nhân sự đã được liên kết với tài khoản Google khác.');
  }

  const role = qltdEmployeesRoleFor_(employee);
  if (role === 'ADMIN' || role === 'VIEWER' || !qltdUsersIsValidRole_(role)) {
    return qltdUsersBuildAuthError_('SOURCE_CONFIGURATION_ERROR', 'Không thể xác định quyền người dùng an toàn.');
  }
  return { success: true, role: role };
}

function registerUserFromEmployee_(payload) {
  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return identity;
  const empCode = qltdEmployeesNormalizeCode_(payload && payload.empCode);
  if (!empCode) return qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Vui lòng chọn đúng hồ sơ nhân sự.');

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_EMPLOYEE_REGISTRATION_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdUsersBuildAuthError_('REGISTRATION_CONFLICT', 'Một yêu cầu đăng ký khác đang được xử lý. Vui lòng thử lại.');
    }

    const usersRead = qltdUsersReadAll_();
    const employeeResult = qltdEmployeesReadByCodeFresh_(empCode);
    if (!employeeResult.success) return employeeResult;
    const validation = validateEmployeeRegistration_(identity, employeeResult.employee, usersRead);
    if (!validation.success) return validation;
    if (validation.idempotentUser) {
      return qltdUsersRegistrationSuccess_(validation.idempotentUser, false, true);
    }

    const employee = employeeResult.employee;
    const now = new Date();
    const user = {
      email: qltdUsersNormalizeEmail_(identity.email),
      displayName: employee.fullName,
      role: validation.role,
      status: 'ACTIVE',
      deptCode: employee.deptCode,
      deptName: employee.deptName,
      lastLoginAt: now,
      note: [
        'EMPLOYEE_REGISTRATION_V3',
        'EmpCode=' + employee.empCode,
        'AuthMode=' + String(identity.authMode || ''),
        'RegisteredAt=' + qltdUsersFormatIsoLocal_(now)
      ].join(' | '),
      empCode: employee.empCode
    };
    usersRead.sheet.appendRow(qltdUsersBuildRow_(usersRead.sheet, {
      Email: user.email,
      DisplayName: user.displayName,
      Role: user.role,
      Status: user.status,
      DeptCode: user.deptCode,
      DeptName: user.deptName,
      LastLoginAt: user.lastLoginAt,
      Note: user.note,
      EmpCode: user.empCode
    }));
    SpreadsheetApp.flush();
    qltdAuthLog_('SUCCESS', 'register_user_from_employee', { created: true });
    return qltdUsersRegistrationSuccess_(user, true, false);
  } catch (error) {
    return qltdUsersErrorFromException_(error, 'register_user_from_employee');
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }
}

function qltdUsersRegister_(payload) {
  return registerUserFromEmployee_(payload);
}
