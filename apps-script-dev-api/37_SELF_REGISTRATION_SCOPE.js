const QLTD_FIREBASE_WEB_API_KEY_PROPERTY = 'QLTD_FIREBASE_WEB_API_KEY';
const QLTD_DEPT_SCOPE_ACTION_RULES = {
  work_assigntask: ['ADMIN', 'PMO', 'EDITOR'],
  work_updatetask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  work_createdetailtask: ['ADMIN', 'PMO', 'EDITOR'],
  work_updatedetailtask: ['ADMIN', 'PMO', 'EDITOR'],
  weekly_taskupdates_save: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_masterapproval_review: ['ADMIN', 'PMO', 'EDITOR'],
  weekly_pbdetailapproval_review: ['EDITOR'],
  weekly_savedraft: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_submit: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_review: ['ADMIN', 'PMO', 'EDITOR']
};

function qltdFirebaseGetWebApiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty(QLTD_FIREBASE_WEB_API_KEY_PROPERTY) || '').trim();
}

function qltdFirebaseResolveIdentity_(payload, tokenRequired) {
  const rawPayload = payload && typeof payload === 'object' ? payload : {};
  const idToken = String(rawPayload.idToken || '').trim();
  const requestedEmail = qltdUsersNormalizeEmail_(rawPayload.email);

  if (!idToken) {
    return tokenRequired
      ? qltdUsersBuildAuthError_('ID_TOKEN_REQUIRED', 'Khong xac minh duoc phien dang nhap Google. Vui long dang nhap lai.')
      : {
        success: true,
        email: requestedEmail,
        authMode: 'LEGACY_EMAIL'
      };
  }

  const firebaseApiKey = qltdFirebaseGetWebApiKey_();
  if (!firebaseApiKey) {
    qltdAuthLog_('SOURCE_CONFIGURATION_ERROR', 'firebase_identity_configuration');
    return qltdUsersBuildAuthError_('SOURCE_CONFIGURATION_ERROR', 'Apps Script chưa được cấu hình xác minh Firebase.');
  }

  try {
    const response = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(firebaseApiKey),
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );
    const statusCode = response.getResponseCode();
    let data;
    try {
      data = JSON.parse(response.getContentText() || '{}');
    } catch (parseError) {
      qltdAuthLog_('INTERNAL_ERROR', 'firebase_identity_parse');
      return qltdUsersBuildAuthError_('INTERNAL_ERROR', 'Không thể xác minh phiên đăng nhập Google.');
    }
    const firebaseUser = data && data.users && data.users[0];
    const verifiedEmail = qltdUsersNormalizeEmail_(firebaseUser && firebaseUser.email);
    const localId = String(firebaseUser && firebaseUser.localId || '').trim();

    if (statusCode < 200 || statusCode >= 300 || !verifiedEmail || !localId) {
      return qltdUsersBuildAuthError_('ID_TOKEN_INVALID', 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.', {
        retryable: true
      });
    }
    if (firebaseUser.emailVerified !== true) {
      return qltdUsersBuildAuthError_('EMAIL_NOT_VERIFIED', 'Email Google chưa được xác minh.');
    }
    if (requestedEmail && requestedEmail !== verifiedEmail) {
      return qltdUsersBuildAuthError_('EMAIL_MISMATCH', 'Email gửi lên không khớp tài khoản Google đang đăng nhập.');
    }

    return {
      success: true,
      email: verifiedEmail,
      displayName: String(firebaseUser.displayName || '').trim(),
      localId: localId,
      authMode: 'FIREBASE_ID_TOKEN'
    };
  } catch (error) {
    qltdAuthLog_('INTERNAL_ERROR', 'firebase_identity_fetch');
    return qltdUsersBuildAuthError_('INTERNAL_ERROR', 'Không thể xác minh phiên đăng nhập Google.');
  }
}

function qltdDeptScopeAuthorizeWrite_(payload, actionValue) {
  const action = String(actionValue || '').trim().toLowerCase();
  const allowedRoles = QLTD_DEPT_SCOPE_ACTION_RULES[action];

  if (!allowedRoles) {
    return { allowed: true, response: null };
  }

  delete payload._qltdPermissionSource;
  delete payload._qltdPermissionCode;
  delete payload._qltdActorHomeDeptCode;
  delete payload._qltdActorDisplayName;

  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) {
    return { allowed: false, response: identity };
  }

  const user = qltdUsersGetByEmail_(identity.email);
  if (!user) {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('USER_NOT_FOUND', 'Tai khoan chua duoc dang ky tren he thong.')
    };
  }
  if (user.status !== 'ACTIVE') {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('USER_INACTIVE', 'Tai khoan dang bi khoa.')
    };
  }

  const role = qltdUsersNormalizeRole_(user.role);
  payload.email = user.email;
  payload.actorEmail = user.email;

  if (role === 'ADMIN' || role === 'PMO') {
    if (allowedRoles.indexOf(role) === -1) {
      return {
        allowed: false,
        response: qltdUsersBuildAuthError_('ROLE_SCOPE_DENIED', 'Vai tro hien tai khong duoc phep thuc hien thao tac nay.', {
          action: action,
          role: role
        })
      };
    }
    return { allowed: true, response: null, user: user, permissionSource: 'ADMIN_SCOPE' };
  }

  const actorMasterDeptCode = qltdMasterDeptCanonicalCode_(user.deptCode);
  const targetDept = qltdDeptScopeFindPayloadDept_(payload);

  if (!actorMasterDeptCode) {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('USER_DEPT_MISSING', 'Tai khoan chua duoc gan phong/ban. Vui long lien he quan tri.')
    };
  }

  if (!targetDept) {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('DEPT_CODE_REQUIRED', 'Thieu ma phong/ban dich.', {
        action: action
      })
    };
  }

  const routeResult = qltdDeptScopeResolveProjectDeptForTarget_(payload, targetDept);
  if (!routeResult.success) {
    return {
      allowed: false,
      response: routeResult.response
    };
  }

  const projectDept = routeResult.dept;
  const projectCode = routeResult.projectCode;
  const permissionDecision = qltdResolveDeptProgressPermission_(
    user,
    projectCode,
    projectDept.deptCode,
    projectDept,
    action
  );
  const delegatedManager = qltdUserProjectDeptAccessDecisionIsDeptManager_(permissionDecision);
  if (allowedRoles.indexOf(role) === -1 && !delegatedManager) {
    const isPbDetailWrite = action === 'work_createdetailtask' || action === 'work_updatedetailtask';
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_(isPbDetailWrite ? 'ACCESS_DENIED' : 'ROLE_SCOPE_DENIED', 'Vai tro hien tai khong duoc phep thuc hien thao tac nay.', {
        action: action,
        role: role
      })
    };
  }
  if (!permissionDecision.allowed) {
    const isPbDetailWrite = action === 'work_createdetailtask' || action === 'work_updatedetailtask';
    const errorCode = qltdUserProjectDeptAccessActionAllowed_(action)
      ? 'PROJECT_DEPT_UPDATE_FORBIDDEN'
      : (isPbDetailWrite ? 'ACCESS_DENIED' : 'DEPT_SCOPE_DENIED');
    if (qltdUserProjectDeptAccessActionAllowed_(action)) {
      qltdUserProjectDeptAccessLog_({
        action: action,
        email: user.email,
        displayName: user.displayName,
        projectCode: projectCode,
        deptCode: projectDept.deptCode,
        taskOrReportId: qltdDeptScopeTaskOrReportId_(payload),
        periodCode: payload.weekCode || payload.periodCode || '',
        permissionCode: QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION.UPDATE_PROGRESS,
        permissionSource: 'DELEGATED_ACCESS',
        homeDeptCode: user.deptCode,
        actingForDept: projectDept.deptCode,
        result: 'DENIED',
        error: errorCode
      });
    }
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_(errorCode, 'Ban khong co quyen cap nhat tien do cho phong/ban nay trong du an da chon.', {
        action: action,
        userDeptCode: user.deptCode,
        actorMasterDeptCode: actorMasterDeptCode,
        requestedDeptCode: qltdDeptScopeReadRawPayloadDept_(payload)
      })
    };
  }

  const fieldError = qltdUserProjectDeptAccessValidateDelegatedPayload_(action, payload, permissionDecision);
  if (fieldError) {
    qltdUserProjectDeptAccessLog_({
      action: action,
      email: user.email,
      displayName: user.displayName,
      projectCode: projectCode,
      deptCode: projectDept.deptCode,
      taskOrReportId: qltdDeptScopeTaskOrReportId_(payload),
      periodCode: payload.weekCode || payload.periodCode || '',
      permissionCode: permissionDecision.permissionCode,
      permissionSource: permissionDecision.source,
      homeDeptCode: user.deptCode,
      actingForDept: projectDept.deptCode,
      result: 'DENIED',
      error: fieldError.code + ':' + fieldError.forbiddenFields.join(',')
    });
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_(fieldError.code, fieldError.message, {
        action: action,
        forbiddenFields: fieldError.forbiddenFields
      })
    };
  }

  payload._qltdPermissionSource = permissionDecision.source;
  payload._qltdPermissionCode = permissionDecision.permissionCode;
  payload._qltdActorHomeDeptCode = user.deptCode;
  payload._qltdActorDisplayName = user.displayName;
  qltdDeptScopeForcePayloadDept_(payload, projectDept.deptCode, projectDept.deptName);
  return {
    allowed: true,
    response: null,
    user: user,
    projectCode: projectCode,
    dept: projectDept,
    permissionSource: permissionDecision.source,
    permissionCode: permissionDecision.permissionCode
  };
}

function qltdDeptScopeResolveProjectDeptForTarget_(payload, targetDeptCode) {
  const projectCode = qltdBudgetNormalizeCode_(qltdDeptScopeReadRawPayloadProject_(payload));
  if (!projectCode) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_CODE_REQUIRED', 'Thieu ma du an.')
    };
  }
  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_DEPTS_UNAVAILABLE', 'Khong doc duoc Project_Depts.', {
        upstreamErrors: deptsResult.error.errors || []
      })
    };
  }
  const projectDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });
  const dept = qltdBudgetFindProjectDept_(projectDepts, targetDeptCode);
  if (!dept) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_DEPT_NOT_ASSIGNED', 'Phong/ban khong ton tai hoac khong ACTIVE trong du an.', {
        projectCode: projectCode,
        requestedDeptCode: targetDeptCode
      })
    };
  }
  return { success: true, projectCode: projectCode, dept: dept };
}

function qltdDeptScopeTaskOrReportId_(payload) {
  return String(payload && (
    payload.masterTaskCode || payload.detailTaskId || payload.itemId || payload.taskId ||
    payload.reportId || payload.updateId || payload.uid
  ) || '').trim();
}

function qltdDeptScopeFinalizeWrite_(scopeResult, action, payload, result) {
  if (scopeResult && scopeResult.permissionSource === 'DELEGATED_ACCESS') {
    const error = result && result.errors && result.errors[0]
      ? result.errors[0].code || result.errors[0].message
      : result && (result.errorCode || result.message) || '';
    qltdUserProjectDeptAccessLog_({
      action: action,
      email: scopeResult.user && scopeResult.user.email,
      displayName: scopeResult.user && scopeResult.user.displayName,
      projectCode: scopeResult.projectCode,
      deptCode: scopeResult.dept && scopeResult.dept.deptCode,
      taskOrReportId: qltdDeptScopeTaskOrReportId_(payload),
      periodCode: payload && (payload.weekCode || payload.periodCode) || '',
      permissionCode: scopeResult.permissionCode,
      permissionSource: scopeResult.permissionSource,
      homeDeptCode: scopeResult.user && scopeResult.user.deptCode,
      actingForDept: scopeResult.dept && scopeResult.dept.deptCode,
      result: result && result.success !== false ? 'SUCCESS' : 'FAILED',
      error: error
    });
  }
  return result;
}

function qltdDeptScopeResolveProjectDeptForActor_(payload, actorMasterDeptCode) {
  const projectCode = qltdBudgetNormalizeCode_(qltdDeptScopeReadRawPayloadProject_(payload));
  if (!projectCode) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_CODE_REQUIRED', 'Thieu ma du an.')
    };
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_DEPTS_UNAVAILABLE', 'Khong doc duoc Project_Depts.', {
        upstreamErrors: deptsResult.error.errors || []
      })
    };
  }

  const projectDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });
  const dept = qltdBudgetFindProjectDeptByMasterDeptCode_(projectDepts, actorMasterDeptCode);
  if (!dept) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_DEPT_NOT_ASSIGNED', 'Phong/ban cua ban chua duoc phan cong tham gia du an nay.', {
        projectCode: projectCode,
        actorMasterDeptCode: actorMasterDeptCode
      })
    };
  }

  return {
    success: true,
    dept: dept
  };
}

function qltdDeptScopeFindPayloadDept_(payload) {
  return qltdDeptScopeNormalizeCode_(qltdDeptScopeReadRawPayloadDept_(payload));
}

function qltdDeptScopeReadRawPayloadDept_(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const directKeys = ['deptCode', 'departmentCode', 'ownerDeptCode', 'reportDeptCode'];
  for (let index = 0; index < directKeys.length; index += 1) {
    const value = payload[directKeys[index]];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const nestedKeys = ['task', 'detailTask', 'item', 'report', 'data', 'payload'];
  for (let index = 0; index < nestedKeys.length; index += 1) {
    const nested = payload[nestedKeys[index]];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
    for (let keyIndex = 0; keyIndex < directKeys.length; keyIndex += 1) {
      const value = nested[directKeys[keyIndex]];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
  }

  return '';
}

function qltdDeptScopeReadRawPayloadProject_(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const directKeys = ['projectCode', 'projectId'];
  for (let index = 0; index < directKeys.length; index += 1) {
    const value = payload[directKeys[index]];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const nestedKeys = ['task', 'detailTask', 'item', 'report', 'data', 'payload'];
  for (let index = 0; index < nestedKeys.length; index += 1) {
    const nested = payload[nestedKeys[index]];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
    for (let keyIndex = 0; keyIndex < directKeys.length; keyIndex += 1) {
      const value = nested[directKeys[keyIndex]];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
  }

  return '';
}

function qltdDeptScopeForcePayloadDept_(payload, deptCode, deptName) {
  payload.deptCode = deptCode;
  payload.deptName = deptName;

  ['task', 'detailTask', 'item', 'report', 'data', 'payload'].forEach(function(key) {
    const nested = payload[key];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return;
    if (Object.prototype.hasOwnProperty.call(nested, 'deptCode')) nested.deptCode = deptCode;
    if (Object.prototype.hasOwnProperty.call(nested, 'departmentCode')) nested.departmentCode = deptCode;
    if (Object.prototype.hasOwnProperty.call(nested, 'deptName')) nested.deptName = deptName;
  });
}

function qltdDeptScopeNormalizeCode_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}
