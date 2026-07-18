const QLTD_WORK_TASK_HEADER_SCAN_ROWS = 12;
const QLTD_WORK_TASK_REQUIRED_HEADERS = [
  'Nguoi chu tri',
  'Nguoi phoi hop',
  'Ma cong viec Master',
  'Trang thai thuc hien',
  'Bat dau thuc te',
  'Hoan thanh thuc te',
  'Ghi chu cap nhat'
];

const QLTD_WORK_TASK_OPTIONAL_HEADERS = {
  wbs: 'STT',
  taskName: 'Noi dung cong viec',
  rowType: 'Loai dong',
  detailTaskId: 'DetailTaskId',
  planStart: 'Ngay bat dau ke hoach',
  planFinish: 'Ngay ket thuc ke hoach',
  progress: '% Hoan thanh',
  budgetPlan: 'Ke hoach ngan sach',
  budgetActual: 'Ngan sach thuc te'
};

const QLTD_WORK_TASK_UPDATE_HEADERS = {
  status: 'Trang thai thuc hien',
  actualStart: 'Bat dau thuc te',
  actualFinish: 'Hoan thanh thuc te',
  updateNote: 'Ghi chu cap nhat',
  progress: '% Hoan thanh'
};

function qltdWorkGetMyTasks_(params) {
  const action = 'work_getMyTasks';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WORK_TASK_SOURCE);
  if (auth.error) return auth.error;

  const filterProjectCode = qltdWorkNormalizeCode_(params && params.projectCode);
  const filterDeptCode = qltdWorkNormalizeCode_(params && params.deptCode);
  const meta = {
    email: auth.email,
    projectCode: filterProjectCode,
    deptCode: filterDeptCode
  };

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'PROJECTS_UNAVAILABLE', 'Cannot read Projects.', meta, projectsResult.warnings || []);
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'PROJECT_DEPTS_UNAVAILABLE', 'Cannot read Project_Depts.', meta, (projectsResult.warnings || []).concat(deptsResult.warnings || []));
  }

  const warnings = (projectsResult.warnings || []).concat(deptsResult.warnings || []);
  if (filterProjectCode && filterDeptCode) {
    const filteredProjectDepts = deptsResult.departments.filter(function(dept) {
      return dept.projectCode === filterProjectCode && dept.status === 'ACTIVE';
    });
    const filteredDept = qltdBudgetFindProjectDept_(filteredProjectDepts, filterDeptCode);
    if (!filteredDept || !qltdCanReadProjectDept_(auth.user, filterProjectCode, filteredDept.deptCode, filteredDept)) {
      return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ACCESS_DENIED', 'Bạn không có quyền truy cập dữ liệu của phòng/ban này.', meta, warnings);
    }
  }
  const tasks = [];
  const spreadsheetCache = {};

  projectsResult.projects.filter(function(project) {
    if (project.status !== 'ACTIVE') return false;
    if (filterProjectCode && project.projectCode !== filterProjectCode) return false;
    return true;
  }).forEach(function(project) {
    if (!project.deptSpreadsheetId) {
      warnings.push(qltdWorkWarning_('DEPT_SPREADSHEET_ID_MISSING', 'Project has no DeptSpreadsheetId.', {
        projectCode: project.projectCode
      }));
      return;
    }

    const projectDepts = deptsResult.departments.filter(function(dept) {
      if (dept.projectCode !== project.projectCode || dept.status !== 'ACTIVE') return false;
      if (!qltdCanReadProjectDept_(auth.user, project.projectCode, dept.deptCode, dept)) return false;
      if (
        filterDeptCode &&
        qltdWorkNormalizeCode_(dept.deptCode) !== filterDeptCode &&
        qltdWorkNormalizeCode_(dept.projectUnitCode) !== filterDeptCode &&
        qltdMasterDeptCanonicalCode_(dept.masterDeptCode || dept.deptCode || dept.projectUnitCode) !== qltdMasterDeptCanonicalCode_(filterDeptCode)
      ) return false;
      return true;
    });

    projectDepts.forEach(function(dept) {
      const context = qltdWorkBuildDeptContext_(project, dept, dept.deptCode, []);
      const readResult = qltdWorkReadDeptTasksForContext_(context, spreadsheetCache, action);
      if (readResult.error) {
        warnings.push.apply(warnings, readResult.warnings || []);
        warnings.push(qltdWorkWarning_('DEPT_TASK_READ_SKIPPED', 'Cannot read dept tasks.', {
          projectCode: project.projectCode,
          deptCode: dept.deptCode,
          errors: readResult.error.errors || []
        }));
        return;
      }

      readResult.tasks.forEach(function(task) {
        qltdWorkAttachTaskAssignees_(task, context.deptCode, warnings);
        if (!qltdWorkUserMatchesAssignees_(auth.email, task.ownerResolution) && !qltdWorkUserMatchesAssignees_(auth.email, task.coordinatorResolution)) {
          return;
        }
        tasks.push(qltdWorkBuildTaskDto_(task, context, auth.email));
      });
      warnings.push.apply(warnings, readResult.warnings || []);
    });
  });

  return qltdWorkOk_(QLTD_WORK_TASK_SOURCE, action, {
    tasks: tasks,
    count: tasks.length
  }, warnings, meta);
}

function qltdWorkGetDeptTasks_(params) {
  const action = 'work_getDeptTasks';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WORK_TASK_SOURCE);
  if (auth.error) return auth.error;

  const contextResult = qltdWorkResolveProjectDept_(action, params || {}, QLTD_WORK_TASK_SOURCE, {
    requireDeptSpreadsheet: true,
    actorUser: auth.user,
    meta: {
      email: auth.email
    }
  });
  if (contextResult.error) {
    const contextCode = contextResult.error.errors && contextResult.error.errors[0] && contextResult.error.errors[0].code;
    if (contextCode === 'PROJECT_DEPT_NOT_ASSIGNED') {
      return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ACCESS_DENIED', 'Bạn không có quyền truy cập dữ liệu của phòng/ban này.', {
        email: auth.email,
        projectCode: qltdWorkNormalizeCode_(params && params.projectCode),
        deptCode: qltdWorkNormalizeCode_(params && params.deptCode)
      });
    }
    return contextResult.error;
  }

  const context = qltdWorkBuildDeptContext_(contextResult.project, contextResult.dept, contextResult.requestedDeptCode, contextResult.warnings || []);
  const role = qltdWorkNormalizeRole_(auth.user.role);
  if (!qltdCanReadProjectDept_(auth.user, context.projectCode, context.deptCode, context.dept)) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ACCESS_DENIED', 'Bạn không có quyền truy cập dữ liệu của phòng/ban này.', {
      email: auth.email,
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      role: role
    }, context.warnings);
  }

  const readResult = qltdWorkReadDeptTasksForContext_(context, {}, action);
  if (readResult.error) return readResult.error;

  const tasks = [];
  readResult.tasks.forEach(function(task) {
    qltdWorkAttachTaskAssignees_(task, context.deptCode, readResult.warnings);
    if (role === 'REPORTER') {
      if (!qltdWorkUserMatchesAssignees_(auth.email, task.ownerResolution) && !qltdWorkUserMatchesAssignees_(auth.email, task.coordinatorResolution)) return;
    }
    tasks.push(qltdWorkBuildTaskDto_(task, context, auth.email));
  });

  return qltdWorkOk_(QLTD_WORK_TASK_SOURCE, action, {
    projectCode: context.projectCode,
    projectName: context.project.projectName,
    deptCode: context.deptCode,
    deptName: context.dept.deptName || '',
    sourceSheet: readResult.sourceSheet,
    tasks: tasks,
    count: tasks.length
  }, readResult.warnings, {
    email: auth.email,
    projectCode: context.projectCode,
    deptCode: context.deptCode,
    role: role
  });
}

function qltdWorkAssignTask_(payload) {
  const action = 'work_assignTask';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WORK_TASK_SOURCE);
  if (auth.error) return auth.error;

  const taskCode = qltdWorkNormalizeTaskCode_(payload && payload.masterTaskCode);
  if (!taskCode) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'MASTER_TASK_CODE_REQUIRED', 'masterTaskCode is required.', {
      email: auth.email
    });
  }

  const contextResult = qltdWorkResolveProjectDept_(action, payload || {}, QLTD_WORK_TASK_SOURCE, {
    requireDeptSpreadsheet: true,
    actorUser: auth.user,
    meta: {
      email: auth.email,
      masterTaskCode: taskCode
    }
  });
  if (contextResult.error) return contextResult.error;

  const context = qltdWorkBuildDeptContext_(contextResult.project, contextResult.dept, contextResult.requestedDeptCode, contextResult.warnings || []);
  if (!qltdCanManageProjectDept_(auth.user, context.projectCode, context.deptCode, context.dept)) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ACCESS_DENIED', 'User cannot assign tasks in this department.', {
      email: auth.email,
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      role: auth.user.role
    }, context.warnings);
  }

  const ownerProvided = qltdWorkPayloadHasAny_(payload, ['owner', 'ownerText', 'ownerEmail', 'assignee', 'assigneeEmail', 'primaryAssignee']);
  const coordinatorProvided = qltdWorkPayloadHasAny_(payload, ['coordinator', 'coordinatorText', 'coordinatorEmail', 'collaborator', 'collaboratorEmail', 'supporter']);
  if (!ownerProvided && !coordinatorProvided) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ASSIGNEE_REQUIRED', 'owner or coordinator is required.', {
      email: auth.email,
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      masterTaskCode: taskCode
    }, context.warnings);
  }

  const ownerValue = qltdWorkFirstPayloadValue_(payload, ['owner', 'ownerText', 'ownerEmail', 'assignee', 'assigneeEmail', 'primaryAssignee']);
  const coordinatorValue = qltdWorkFirstPayloadValue_(payload, ['coordinator', 'coordinatorText', 'coordinatorEmail', 'collaborator', 'collaboratorEmail', 'supporter']);
  const ownerResolution = ownerProvided ? qltdWorkResolveAssignees_(ownerValue, context.deptCode) : null;
  const coordinatorResolution = coordinatorProvided ? qltdWorkResolveAssignees_(coordinatorValue, context.deptCode) : null;
  const meta = {
    email: auth.email,
    projectCode: context.projectCode,
    deptCode: context.deptCode,
    masterTaskCode: taskCode
  };

  if (ownerResolution && !ownerResolution.ok) {
    return qltdWorkAssigneeResolutionError_(QLTD_WORK_TASK_SOURCE, action, 'owner', ownerResolution, meta, context.warnings);
  }
  if (ownerResolution && ownerResolution.users.length !== 1) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ASSIGNEE_UNRESOLVED', 'Owner must resolve to exactly one active user.', meta, context.warnings, {
      field: 'owner',
      raw: ownerResolution.raw || ''
    });
  }
  if (ownerResolution && qltdWorkFindAssigneeDeptMismatches_(ownerResolution, context.deptCode).length) {
    return qltdWorkAssigneeDeptMismatchError_(QLTD_WORK_TASK_SOURCE, action, 'owner', ownerResolution, context.deptCode, meta, context.warnings);
  }
  if (coordinatorResolution && !coordinatorResolution.ok) {
    return qltdWorkAssigneeResolutionError_(QLTD_WORK_TASK_SOURCE, action, 'coordinator', coordinatorResolution, meta, context.warnings);
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire task write lock.', meta, context.warnings);
    }

    const targetResult = qltdWorkReadTaskTarget_(context, taskCode, action);
    if (targetResult.error) return targetResult.error;

    const changes = [];
    if (ownerProvided) {
      changes.push(qltdWorkSetTaskCell_(targetResult, qltdWorkTaskOwnerHeader_(), ownerResolution.canonicalText));
    }
    if (coordinatorProvided) {
      changes.push(qltdWorkSetTaskCell_(targetResult, qltdWorkTaskCoordinatorHeader_(), coordinatorResolution.canonicalText));
    }

    return qltdWorkOk_(QLTD_WORK_TASK_SOURCE, action, {
      key: qltdWorkBuildTaskKey_(context.projectCode, context.deptCode, taskCode),
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      masterTaskCode: taskCode,
      sourceSheet: targetResult.sheet.getName(),
      rowNumber: targetResult.task.rowNumber,
      changes: changes
    }, targetResult.warnings, meta);
  } catch (error) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), meta, context.warnings);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdWorkUpdateTask_(payload) {
  const action = 'work_updateTask';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WORK_TASK_SOURCE);
  if (auth.error) return auth.error;

  const taskCode = qltdWorkNormalizeTaskCode_(payload && payload.masterTaskCode);
  if (!taskCode) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'MASTER_TASK_CODE_REQUIRED', 'masterTaskCode is required.', {
      email: auth.email
    });
  }

  const normalizedUpdate = qltdWorkNormalizeTaskUpdatePayload_(payload || {});
  if (normalizedUpdate.unknownFields.length) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'FIELD_NOT_ALLOWED', 'Task update contains fields outside the allowlist.', {
      email: auth.email,
      unknownFields: normalizedUpdate.unknownFields
    });
  }
  if (!normalizedUpdate.fields.length) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'UPDATE_FIELD_REQUIRED', 'At least one update field is required.', {
      email: auth.email
    });
  }

  const contextResult = qltdWorkResolveProjectDept_(action, payload || {}, QLTD_WORK_TASK_SOURCE, {
    requireDeptSpreadsheet: true,
    actorUser: auth.user,
    meta: {
      email: auth.email,
      masterTaskCode: taskCode
    }
  });
  if (contextResult.error) return contextResult.error;

  const context = qltdWorkBuildDeptContext_(contextResult.project, contextResult.dept, contextResult.requestedDeptCode, contextResult.warnings || []);
  const role = qltdWorkNormalizeRole_(auth.user.role);
  const managerPermission = qltdResolveDeptManagerPermission_(
    auth.user,
    context.projectCode,
    context.deptCode,
    context.dept
  );
  if (role === 'VIEWER' && !qltdUserProjectDeptAccessDecisionIsDeptManager_(managerPermission)) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ACCESS_DENIED', 'Viewer cannot update tasks.', {
      email: auth.email,
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      role: role
    }, context.warnings);
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire task write lock.', {
        email: auth.email,
        projectCode: context.projectCode,
        deptCode: context.deptCode,
        masterTaskCode: taskCode
      }, context.warnings);
    }

    const targetResult = qltdWorkReadTaskTarget_(context, taskCode, action);
    if (targetResult.error) return targetResult.error;
    qltdWorkAttachTaskAssignees_(targetResult.task, context.deptCode, targetResult.warnings);

    const progressPermission = qltdResolveDeptProgressPermission_(
      auth.user,
      context.projectCode,
      context.deptCode,
      context.dept,
      'work_updatetask'
    );
    const delegatedFieldError = qltdUserProjectDeptAccessValidateDelegatedPayload_(
      'work_updatetask',
      payload || {},
      progressPermission
    );
    if (delegatedFieldError) {
      return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, delegatedFieldError.code, delegatedFieldError.message, {
        email: auth.email,
        projectCode: context.projectCode,
        deptCode: context.deptCode,
        masterTaskCode: taskCode,
        forbiddenFields: delegatedFieldError.forbiddenFields
      }, targetResult.warnings);
    }
    const isManager = qltdCanManageProjectDept_(auth.user, context.projectCode, context.deptCode, context.dept) ||
      progressPermission.source === 'DELEGATED_ACCESS';
    const isOwner = qltdWorkUserMatchesAssignees_(auth.email, targetResult.task.ownerResolution);
    const isCoordinator = qltdWorkUserMatchesAssignees_(auth.email, targetResult.task.coordinatorResolution);
    if (!isManager && !isOwner && !isCoordinator) {
      return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'ACCESS_DENIED', 'User can only update assigned tasks.', {
        email: auth.email,
        projectCode: context.projectCode,
        deptCode: context.deptCode,
        masterTaskCode: taskCode,
        role: role
      }, targetResult.warnings);
    }

    if (!isManager && !isOwner && isCoordinator) {
      const disallowed = normalizedUpdate.fields.filter(function(field) {
        return field !== 'updateNote';
      });
      if (disallowed.length) {
        return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'COORDINATOR_NOTE_ONLY', 'Coordinator can only append update notes in MVP.', {
          email: auth.email,
          projectCode: context.projectCode,
          deptCode: context.deptCode,
          masterTaskCode: taskCode,
          disallowedFields: disallowed
        }, targetResult.warnings);
      }
    }

    const changes = qltdWorkApplyTaskUpdates_(targetResult, normalizedUpdate, auth.email, {
      manager: isManager,
      owner: isOwner,
      coordinator: isCoordinator
    });

    return qltdWorkOk_(QLTD_WORK_TASK_SOURCE, action, {
      key: qltdWorkBuildTaskKey_(context.projectCode, context.deptCode, taskCode),
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      masterTaskCode: taskCode,
      sourceSheet: targetResult.sheet.getName(),
      rowNumber: targetResult.task.rowNumber,
      changes: changes
    }, targetResult.warnings, {
      email: auth.email,
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      masterTaskCode: taskCode,
      role: role
    });
  } catch (error) {
    return qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), {
      email: auth.email,
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      masterTaskCode: taskCode
    }, context.warnings);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdWorkBuildDeptContext_(project, dept, requestedDeptCode, warnings) {
  return {
    project: project,
    dept: dept,
    projectCode: project.projectCode,
    deptCode: qltdWorkNormalizeCode_(dept.deptCode || requestedDeptCode),
    masterDeptCode: qltdMasterDeptCanonicalCode_(dept.masterDeptCode || dept.deptCode || requestedDeptCode),
    requestedDeptCode: requestedDeptCode || dept.deptCode,
    warnings: warnings || []
  };
}

function qltdWorkReadDeptTasksForContext_(context, spreadsheetCache, action) {
  const meta = {
    projectCode: context.projectCode,
    deptCode: context.deptCode
  };
  const warnings = (context.warnings || []).slice();

  let spreadsheet = spreadsheetCache[context.project.deptSpreadsheetId];
  if (!spreadsheet) {
    try {
      spreadsheet = SpreadsheetApp.openById(context.project.deptSpreadsheetId);
      spreadsheetCache[context.project.deptSpreadsheetId] = spreadsheet;
    } catch (error) {
      return {
        tasks: [],
        warnings: warnings,
        error: qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'DEPT_SPREADSHEET_OPEN_FAILED', qltdBudgetSafeErrorMessage_(error), meta, warnings)
      };
    }
  }

  const sheetResult = qltdBudgetFindDeptSheet_(spreadsheet, context.dept, context.requestedDeptCode || context.deptCode);
  warnings.push.apply(warnings, sheetResult.warnings || []);
  if (!sheetResult.sheet) {
    return {
      tasks: [],
      warnings: warnings,
      error: qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'DEPT_SHEET_NOT_FOUND', 'Department sheet not found.', meta, warnings)
    };
  }

  const parseResult = qltdWorkParseDeptTaskSheet_(sheetResult.sheet);
  warnings.push.apply(warnings, parseResult.warnings || []);
  if (parseResult.error) {
    return {
      tasks: [],
      warnings: warnings,
      sourceSheet: sheetResult.sheet.getName(),
      error: qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, parseResult.error.code, parseResult.error.message, Object.assign({
        sourceSheet: sheetResult.sheet.getName()
      }, meta), warnings, parseResult.error.extra || {})
    };
  }

  return {
    tasks: parseResult.tasks,
    parsed: parseResult.parsed,
    headerRow: parseResult.headerRow,
    sourceSheet: sheetResult.sheet.getName(),
    sheet: sheetResult.sheet,
    warnings: warnings,
    error: null
  };
}

function qltdWorkReadTaskTarget_(context, masterTaskCode, action) {
  const readResult = qltdWorkReadDeptTasksForContext_(context, {}, action);
  if (readResult.error) return readResult;

  const task = qltdWorkFindTaskByCode_(readResult.tasks, masterTaskCode);
  if (!task) {
    return {
      error: qltdWorkError_(QLTD_WORK_TASK_SOURCE, action, 'TASK_NOT_FOUND', 'Task not found by masterTaskCode.', {
        projectCode: context.projectCode,
        deptCode: context.deptCode,
        masterTaskCode: masterTaskCode,
        sourceSheet: readResult.sourceSheet
      }, readResult.warnings)
    };
  }

  return {
    task: task,
    sheet: readResult.sheet,
    parsed: readResult.parsed,
    headerRow: readResult.headerRow,
    sourceSheet: readResult.sourceSheet,
    warnings: readResult.warnings,
    error: null
  };
}

function qltdWorkDetectTaskHeader_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return null;

  const scanRows = Math.min(lastRow, QLTD_WORK_TASK_HEADER_SCAN_ROWS);
  const values = sheet.getRange(1, 1, scanRows, lastCol).getValues();
  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const headers = values[rowIndex].map(function(value) {
      return String(value || '').trim();
    });
    const headerMap = qltdBudgetBuildHeaderMap_(headers);
    const hasMaster = qltdBudgetFindHeaderIndex_(headerMap, 'Ma cong viec Master') >= 0;
    const hasAssignment = qltdBudgetFindHeaderIndex_(headerMap, 'Nguoi chu tri') >= 0 || qltdBudgetFindHeaderIndex_(headerMap, 'Nguoi phoi hop') >= 0;
    const hasStatus = qltdBudgetFindHeaderIndex_(headerMap, 'Trang thai thuc hien') >= 0;
    if (hasMaster && (hasAssignment || hasStatus)) {
      return {
        headerRow: rowIndex + 1,
        headers: headers,
        headerMap: headerMap
      };
    }
  }
  return null;
}

function qltdWorkParseDeptTaskSheet_(sheet) {
  const detected = qltdWorkDetectTaskHeader_(sheet);
  if (!detected) {
    return {
      tasks: [],
      warnings: [],
      error: {
        code: 'TASK_HEADER_NOT_FOUND',
        message: 'Cannot detect task header row.'
      }
    };
  }

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, detected.headerRow);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_WORK_TASK_REQUIRED_HEADERS);
  if (missingHeaders.length) {
    return {
      tasks: [],
      warnings: [],
      error: {
        code: 'REQUIRED_HEADER_MISSING',
        message: 'Department task sheet is missing required headers.',
        extra: {
          missingHeaders: missingHeaders
        }
      }
    };
  }

  const tasks = parsed.rows.map(function(item) {
    const row = item.raw;
    const masterTaskCode = qltdWorkNormalizeTaskCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma cong viec Master', ''));
    if (!masterTaskCode) return null;
    return {
      masterTaskCode: masterTaskCode,
      wbs: String(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.wbs, '') || '').trim(),
      taskName: String(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.taskName, '') || '').trim(),
      rowType: String(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.rowType, '') || '').trim(),
      detailTaskId: String(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.detailTaskId, '') || '').trim(),
      planStart: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.planStart, '')),
      planFinish: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.planFinish, '')),
      status: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Trang thai thuc hien', '') || '').trim(),
      actualStart: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, 'Bat dau thuc te', '')),
      actualFinish: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, 'Hoan thanh thuc te', '')),
      updateNote: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ghi chu cap nhat', '') || '').trim(),
      progress: qltdBudgetToNumber_(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.progress, 0)),
      budgetPlan: qltdBudgetToNumber_(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.budgetPlan, 0)),
      budgetActual: qltdBudgetToNumber_(qltdBudgetGetCell_(row, parsed.headerMap, QLTD_WORK_TASK_OPTIONAL_HEADERS.budgetActual, 0)),
      ownerText: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Nguoi chu tri', '') || '').trim(),
      coordinatorText: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Nguoi phoi hop', '') || '').trim(),
      rowNumber: item.rowNumber,
      raw: row
    };
  }).filter(function(task) {
    return !!task;
  });

  return {
    tasks: tasks,
    parsed: parsed,
    headerRow: detected.headerRow,
    warnings: [],
    error: null
  };
}

function qltdWorkFindTaskByCode_(tasks, masterTaskCode) {
  const target = qltdWorkNormalizeTaskCode_(masterTaskCode);
  for (let index = 0; index < (tasks || []).length; index += 1) {
    if (qltdWorkNormalizeTaskCode_(tasks[index].masterTaskCode) === target) return tasks[index];
  }
  return null;
}

function qltdWorkAttachTaskAssignees_(task, deptCode, warnings) {
  task.ownerResolution = qltdWorkResolveAssignees_(task.ownerText, deptCode);
  task.coordinatorResolution = qltdWorkResolveAssignees_(task.coordinatorText, deptCode);

  if (!task.ownerResolution.ok) {
    warnings.push(qltdWorkWarning_('ASSIGNEE_UNRESOLVED', 'Owner cannot be resolved.', {
      field: 'owner',
      rowNumber: task.rowNumber,
      masterTaskCode: task.masterTaskCode,
      unresolved: task.ownerResolution.unresolved,
      raw: task.ownerResolution.raw
    }));
  }
  if (!task.coordinatorResolution.ok) {
    warnings.push(qltdWorkWarning_('ASSIGNEE_UNRESOLVED', 'Coordinator cannot be resolved.', {
      field: 'coordinator',
      rowNumber: task.rowNumber,
      masterTaskCode: task.masterTaskCode,
      unresolved: task.coordinatorResolution.unresolved,
      raw: task.coordinatorResolution.raw
    }));
  }
}

function qltdWorkBuildTaskDto_(task, context, currentEmail) {
  const isOwner = qltdWorkUserMatchesAssignees_(currentEmail, task.ownerResolution);
  const isCoordinator = qltdWorkUserMatchesAssignees_(currentEmail, task.coordinatorResolution);
  return {
    key: qltdWorkBuildTaskKey_(context.projectCode, context.deptCode, task.masterTaskCode),
    projectCode: context.projectCode,
    projectName: context.project.projectName,
    deptCode: context.deptCode,
    deptName: context.dept.deptName || '',
    masterTaskCode: task.masterTaskCode,
    wbs: task.wbs,
    taskName: task.taskName,
    rowType: task.rowType,
    planStart: task.planStart,
    planFinish: task.planFinish,
    status: task.status,
    actualStart: task.actualStart,
    actualFinish: task.actualFinish,
    progress: task.progress,
    budgetPlan: task.budgetPlan,
    budgetActual: task.budgetActual,
    updateNote: task.updateNote,
    ownerText: task.ownerText,
    coordinatorText: task.coordinatorText,
    owners: (task.ownerResolution.users || []).map(qltdWorkUserSummary_),
    coordinators: (task.coordinatorResolution.users || []).map(qltdWorkUserSummary_),
    assignmentRole: isOwner ? 'OWNER' : (isCoordinator ? 'COORDINATOR' : ''),
    canCoordinatorComplete: false,
    rowNumber: task.rowNumber
  };
}

function qltdWorkPayloadHasAny_(payload, keys) {
  return (keys || []).some(function(key) {
    return Object.prototype.hasOwnProperty.call(payload || {}, key);
  });
}

function qltdWorkFirstPayloadValue_(payload, keys) {
  for (let index = 0; index < (keys || []).length; index += 1) {
    const key = keys[index];
    if (Object.prototype.hasOwnProperty.call(payload || {}, key)) return payload[key];
  }
  return undefined;
}

function qltdWorkTaskOwnerHeader_() {
  return 'Nguoi chu tri';
}

function qltdWorkTaskCoordinatorHeader_() {
  return 'Nguoi phoi hop';
}

function qltdWorkSetTaskCell_(targetResult, headerName, value) {
  const columnIndex = qltdBudgetFindHeaderIndex_(targetResult.parsed.headerMap, headerName) + 1;
  if (columnIndex < 1) throw new Error('Missing task header: ' + headerName);
  const range = targetResult.sheet.getRange(targetResult.task.rowNumber, columnIndex);
  const before = range.getValue();
  range.setValue(value);
  return {
    field: headerName,
    rowNumber: targetResult.task.rowNumber,
    columnNumber: columnIndex,
    before: before,
    after: value
  };
}

function qltdWorkNormalizeTaskUpdatePayload_(payload) {
  const input = payload && payload.updates && typeof payload.updates === 'object' ? payload.updates : payload;
  const metaFields = {
    action: true,
    email: true,
    actorEmail: true,
    idToken: true,
    projectCode: true,
    deptCode: true,
    masterTaskCode: true,
    requestId: true,
    confirm: true,
    updates: true,
    noteMode: true,
    replaceNote: true,
    _qltdPermissionSource: true,
    _qltdPermissionCode: true,
    _qltdActorHomeDeptCode: true,
    _qltdActorDisplayName: true
  };
  const aliases = {
    status: 'status',
    actualStart: 'actualStart',
    actualFinish: 'actualFinish',
    progress: 'progress',
    updateNote: 'updateNote',
    note: 'updateNote'
  };
  const updates = {};
  const fields = [];
  const unknownFields = [];

  Object.keys(input || {}).forEach(function(key) {
    if (metaFields[key]) return;
    if (!Object.prototype.hasOwnProperty.call(aliases, key)) {
      unknownFields.push(key);
      return;
    }
    const field = aliases[key];
    if (field === 'progress') {
      const progress = Number(input[key]);
      if (isNaN(progress) || progress < 0 || progress > 100) {
        unknownFields.push('progress:INVALID_PERCENT');
        return;
      }
      input[key] = progress;
    }
    updates[field] = input[key];
    if (fields.indexOf(field) === -1) fields.push(field);
  });

  return {
    updates: updates,
    fields: fields,
    unknownFields: unknownFields,
    noteMode: String((payload && payload.noteMode) || (input && input.noteMode) || '').trim().toLowerCase(),
    replaceNote: !!(payload && payload.replaceNote)
  };
}

function qltdWorkApplyTaskUpdates_(targetResult, normalizedUpdate, email, relationship) {
  const changes = [];
  const updates = normalizedUpdate.updates || {};
  ['status', 'actualStart', 'actualFinish', 'progress'].forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) return;
    if (field === 'progress' && qltdBudgetFindHeaderIndex_(targetResult.parsed.headerMap, QLTD_WORK_TASK_UPDATE_HEADERS.progress) < 0) {
      targetResult.warnings.push(qltdWorkWarning_('MASTER_PROGRESS_HEADER_MISSING', 'MASTER progress header is missing; progress was not synced.'));
      return;
    }
    changes.push(qltdWorkSetTaskCell_(targetResult, QLTD_WORK_TASK_UPDATE_HEADERS[field], updates[field]));
  });

  if (Object.prototype.hasOwnProperty.call(updates, 'updateNote')) {
    const canReplace = !!(relationship && (relationship.manager || relationship.owner));
    const replace = canReplace && (normalizedUpdate.noteMode === 'replace' || normalizedUpdate.replaceNote);
    const before = targetResult.task.updateNote || '';
    const after = replace ? String(updates.updateNote || '') : qltdWorkAppendTaskNote_(before, updates.updateNote, email);
    if (after !== before) {
      changes.push(qltdWorkSetTaskCell_(targetResult, QLTD_WORK_TASK_UPDATE_HEADERS.updateNote, after));
    }
  }

  return changes;
}

function qltdWorkAppendTaskNote_(before, note, email) {
  const text = String(note || '').trim();
  if (!text) return String(before || '');
  const line = '[' + qltdWorkNowIso_() + ' ' + qltdWorkNormalizeEmail_(email) + '] ' + text;
  const previous = String(before || '').trim();
  return previous ? previous + '\n' + line : line;
}
