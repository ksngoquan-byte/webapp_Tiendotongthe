const QLTD_WEEKLY_TASK_UPDATE_SOURCE = 'weekly_task_updates_v1';
const QLTD_WEEKLY_TASK_UPDATE_SHEET = 'WEEKLY_TASK_UPDATES';
const QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS = [
  'UpdateId', 'ProjectCode', 'DeptCode', 'WeekCode', 'ItemType', 'ItemId',
  'ThisWeekResult', 'ProgressEnd', 'TaskStatus', 'ActualStart', 'ActualFinish',
  'Issue', 'Recommendation', 'BudgetThisWeek', 'BudgetNote', 'UpdatedBy', 'UpdatedAt'
];
const QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS = [
  'ApprovalStatus', 'ReviewReason', 'ReviewedBy', 'ReviewedAt'
];
const QLTD_WEEKLY_TASK_UPDATE_DECISION_HEADERS = [
  'DependencyDecision', 'RecoveryPlan'
];
const QLTD_WEEKLY_TASK_UPDATE_REVIEW_HEADERS = QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.concat(QLTD_WEEKLY_TASK_UPDATE_DECISION_HEADERS);
const QLTD_WEEKLY_TASK_UPDATE_HEADERS = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.concat(QLTD_WEEKLY_TASK_UPDATE_REVIEW_HEADERS);
const QLTD_WEEKLY_TASK_APPROVAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};
const QLTD_WEEKLY_MASTER_IMPACT_MODE = {
  KEEP_PLAN: 'KEEP_PLAN',
  PROPAGATE_ACTUAL: 'PROPAGATE_ACTUAL'
};
const QLTD_WEEKLY_MASTER_HEADER_SCAN_ROWS = 12;
const QLTD_WEEKLY_MASTER_UPDATE_HEADERS = {
  taskCode: 'Ma cong viec',
  status: 'Trang thai thuc hien',
  actualStart: 'Bat dau thuc te',
  actualFinish: 'Hoan thanh thuc te',
  updateNote: 'Ghi chu cap nhat',
  updatedAt: 'Ngay cap nhat',
  impactMode: 'Dieu chinh lien ket?'
};

function qltdSetupWeeklyTaskUpdatesSheetDryRun() {
  const spreadsheet = getCurrentSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(QLTD_WEEKLY_TASK_UPDATE_SHEET);
  if (!sheet) {
    const missingResult = {
      success: true,
      safeToCreate: true,
      exists: false,
      expectedColumnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
      impact: 'CREATE_SHEET_ONLY'
    };
    Logger.log(JSON.stringify(missingResult));
    return missingResult;
  }

  const inspection = qltdWeeklyTaskUpdatesInspectSheet_(sheet);
  const existingResult = {
    success: inspection.headerMatches || inspection.canAppendApprovalColumns,
    safeToCreate: false,
    exists: true,
    headerMatches: inspection.headerMatches,
    canAppendApprovalColumns: inspection.canAppendApprovalColumns,
    approvalHeadersPresent: inspection.approvalHeadersPresent,
    decisionHeadersPresent: inspection.decisionHeadersPresent,
    expectedColumnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
    actualColumnCount: sheet.getLastColumn(),
    lastRow: sheet.getLastRow(),
    mismatches: inspection.mismatches,
    appendHeaders: inspection.appendHeaders,
    impact: inspection.headerMatches ? 'NO_CHANGE' : (inspection.canAppendApprovalColumns ? inspection.impact : 'STOP_HEADER_MISMATCH')
  };
  Logger.log(JSON.stringify(existingResult));
  return existingResult;
}

function qltdSetupWeeklyTaskUpdatesSheet() {
  const dryRun = qltdSetupWeeklyTaskUpdatesSheetDryRun();
  Logger.log(JSON.stringify(dryRun));
  if (dryRun.exists) {
    if (dryRun.headerMatches) return Object.assign({}, dryRun, { created: false, migrated: false, idempotent: true });
    if (!dryRun.canAppendApprovalColumns) throw new Error('WEEKLY_TASK_UPDATES_HEADER_MISMATCH');
    const sheet = getCurrentSpreadsheet_().getSheetByName(QLTD_WEEKLY_TASK_UPDATE_SHEET);
    const startColumn = dryRun.actualColumnCount + 1;
    const appendHeaders = dryRun.appendHeaders || [];
    sheet.getRange(1, startColumn, 1, appendHeaders.length)
      .setValues([appendHeaders])
      .setFontWeight('bold');
    return Object.assign({}, dryRun, {
      success: true,
      created: false,
      migrated: true,
      idempotent: true,
      columnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
      headers: QLTD_WEEKLY_TASK_UPDATE_HEADERS.slice(),
      impact: dryRun.impact
    });
  }
  if (!dryRun.safeToCreate) throw new Error('WEEKLY_TASK_UPDATES_SETUP_NOT_SAFE');

  const spreadsheet = getCurrentSpreadsheet_();
  const sheet = spreadsheet.insertSheet(QLTD_WEEKLY_TASK_UPDATE_SHEET);
  sheet.getRange(1, 1, 1, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length)
    .setValues([QLTD_WEEKLY_TASK_UPDATE_HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  return {
    success: true,
    created: true,
    sheetName: sheet.getName(),
    columnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
    headers: QLTD_WEEKLY_TASK_UPDATE_HEADERS.slice()
  };
}

function qltdWeeklyTaskUpdatesSetupDryRunApi_(params) {
  const action = 'weekly_taskupdates_setup_dryrun';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only Admin/PMO can inspect weekly task update schema.', { email: auth.email });
  }
  return qltdSetupWeeklyTaskUpdatesSheetDryRun();
}

function qltdWeeklyTaskUpdatesSetupApi_(payload) {
  const action = 'weekly_taskupdates_setup';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only Admin/PMO can migrate weekly task update schema.', { email: auth.email });
  }
  return qltdSetupWeeklyTaskUpdatesSheet();
}

function qltdWeeklyTaskUpdatesGet_(params) {
  const action = 'weekly_taskupdates_get';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const scope = qltdWeeklyTaskUpdatesResolveScope_(action, params || {}, auth);
  if (scope.error) return scope.error;
  const read = qltdWeeklyTaskUpdatesRead_();
  if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, scope.meta, scope.warnings);

  const itemType = qltdWeeklyTaskUpdatesNormalizeType_(params.itemType);
  const itemId = String(params.itemId || '').trim();
  const role = qltdWorkNormalizeRole_(auth.user && auth.user.role);
  const managerPermission = qltdResolveDeptManagerPermission_(
    auth.user,
    scope.projectCode,
    scope.deptCode,
    scope.dept
  );
  const delegatedDeptManager = qltdUserProjectDeptAccessDecisionIsDeptManager_(managerPermission);
  const updates = read.updates.filter(function(update) {
    const inScope = update.projectCode === scope.projectCode && update.deptCode === scope.deptCode &&
      update.weekCode === scope.weekCode && (!itemType || update.itemType === itemType) &&
      (!itemId || update.itemId === itemId);
    if (!inScope) return false;
    return delegatedDeptManager || role !== 'REPORTER' || update.itemType !== 'PB_DETAIL' || update.updatedBy === auth.email;
  });
  updates.forEach(function(update) {
    update.budgetCumulative = read.updates.filter(function(candidate) {
      return candidate.projectCode === update.projectCode && candidate.deptCode === update.deptCode &&
        candidate.itemType === update.itemType && candidate.itemId === update.itemId;
    }).reduce(function(total, candidate) {
      return total + Number(candidate.budgetThisWeek || 0);
    }, 0);
  });
  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    projectCode: scope.projectCode,
    deptCode: scope.deptCode,
    weekCode: scope.weekCode,
    updates: updates,
    count: updates.length
  }, scope.warnings, scope.meta);
}

function qltdWeeklyMasterApprovalsGet_(params) {
  const action = 'weekly_masterapprovals_get';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only Admin/PMO can review MASTER completion approvals.', { email: auth.email });
  }
  const read = qltdWeeklyTaskUpdatesRead_();
  if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, { email: auth.email });

  const statusFilter = qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(params && params.status) || QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING;
  const projectFilter = qltdWorkNormalizeCode_(params && params.projectCode);
  const deptFilter = qltdWorkNormalizeCode_(params && params.deptCode);
  const projectCache = {};
  const approvals = read.updates.filter(function(update) {
    if (update.itemType !== 'MASTER') return false;
    if (!update.approvalStatus) return false;
    if (statusFilter && update.approvalStatus !== statusFilter) return false;
    if (projectFilter && update.projectCode !== projectFilter) return false;
    if (deptFilter && update.deptCode !== deptFilter) return false;
    return true;
  }).map(function(update) {
    return qltdWeeklyTaskUpdatesBuildApprovalDto_(update, projectCache);
  });

  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    approvals: approvals,
    count: approvals.length,
    status: statusFilter
  }, [], { email: auth.email });
}

function qltdWeeklyPbDetailApprovalsGet_(params) {
  const action = 'weekly_pbdetailapprovals_get';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const directEditor = qltdWorkNormalizeRole_(auth.user && auth.user.role) === 'EDITOR';
  const delegatedManagerScopes = qltdUserProjectDeptAccessResolveEffectiveScopes_(
    auth.email,
    QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION.DEPT_MANAGER
  );
  if (!directEditor && !delegatedManagerScopes.length) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only same-department Editors can review PB_DETAIL updates.', { email: auth.email });
  }
  const read = qltdWeeklyTaskUpdatesRead_();
  if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, { email: auth.email });

  const projectCode = qltdWorkNormalizeCode_(params && params.projectCode);
  const status = qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(params && params.status) || QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING;
  const candidates = read.updates.filter(function(update) {
    return update.itemType === 'PB_DETAIL' &&
      update.approvalStatus === status &&
      (!projectCode || update.projectCode === projectCode);
  });
  const detailCache = {};
  const approvals = [];
  candidates.forEach(function(update) {
    const cacheKey = update.projectCode + '|' + update.deptCode;
    if (!Object.prototype.hasOwnProperty.call(detailCache, cacheKey)) {
      const resolved = qltdWorkResolveProjectDept_(action, update, QLTD_WEEKLY_TASK_UPDATE_SOURCE, {
        requireDeptSpreadsheet: true,
        actorUser: auth.user,
        meta: { email: auth.email, projectCode: update.projectCode, deptCode: update.deptCode }
      });
      if (resolved.error || !qltdCanManageProjectDept_(auth.user, resolved.projectCode, resolved.deptCode, resolved.dept)) {
        detailCache[cacheKey] = null;
      } else {
        const context = Object.assign({}, resolved, {
          meta: { email: auth.email, projectCode: resolved.projectCode, deptCode: resolved.deptCode },
          warnings: resolved.warnings || []
        });
        const sheetContext = qltdPbDetailBuildSheetContext_(action, context);
        const map = {};
        if (!sheetContext.error) {
          sheetContext.dataRows.forEach(function(row) {
            if (row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL) {
              const dto = qltdPbDetailBuildDetailDto_(row, sheetContext.columns);
              map[dto.detailTaskId] = dto;
            }
          });
        }
        detailCache[cacheKey] = map;
      }
    }
    const official = detailCache[cacheKey] && detailCache[cacheKey][update.itemId];
    if (!official) return;
    approvals.push(Object.assign({}, update, {
      wbs: official.wbs,
      taskName: official.taskName,
      owner: official.owner,
      officialProgress: official.progress,
      officialStatus: official.status,
      officialActualStart: official.actualStart,
      officialActualFinish: official.actualFinish
    }));
  });
  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    approvals: approvals,
    count: approvals.length,
    status: status
  }, [], { email: auth.email, projectCode: projectCode });
}

function qltdWeeklyMasterApprovalReview_(payload) {
  const action = 'weekly_masterapproval_review';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return qltdWeeklyMasterApprovalDecorateError_(auth.error, 'AUTHENTICATION');
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWeeklyMasterApprovalError_(action, 'ACCESS_DENIED', 'Only Admin/PMO can review MASTER completion approvals.', 'AUTHORIZATION', { email: auth.email });
  }
  const updateId = String(payload && payload.updateId || '').trim();
  const nextStatus = qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(payload && payload.approvalStatus || payload && payload.status);
  const reason = String(payload && (payload.reviewReason || payload.reason) || '').trim();
  const impactMode = qltdWeeklyTaskUpdatesNormalizeImpactMode_(payload && payload.impactMode);
  const dependencyDecision = nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED ? impactMode : '';
  const recoveryPlan = '';
  const meta = { email: auth.email, updateId: updateId, approvalStatus: nextStatus, impactMode: impactMode };
  if (!updateId) return qltdWeeklyMasterApprovalError_(action, 'UPDATE_ID_REQUIRED', 'updateId is required.', 'VALIDATION', meta);
  if ([QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED, QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED].indexOf(nextStatus) === -1) {
    return qltdWeeklyMasterApprovalError_(action, 'APPROVAL_STATUS_INVALID', 'Approval status must be APPROVED or REJECTED.', 'VALIDATION', meta);
  }
  if (nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED && !impactMode) {
    return qltdWeeklyMasterApprovalError_(action, 'INVALID_IMPACT_MODE', 'impactMode must be KEEP_PLAN or PROPAGATE_ACTUAL.', 'VALIDATION', meta);
  }
  if (nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED && !reason) {
    return qltdWeeklyMasterApprovalError_(action, 'REVIEW_REASON_REQUIRED', 'ReviewReason is required when rejecting.', 'VALIDATION', meta);
  }
  const lock = LockService.getScriptLock();
  let locked = false;
  let target;
  let now;
  let masterSync = null;
  let stage = 'WRITE_LOCK';
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) return qltdWeeklyMasterApprovalError_(action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire approval review lock.', 'WRITE_LOCK', meta);
    stage = 'APPROVAL_READ';
    const read = qltdWeeklyTaskUpdatesRead_();
    if (read.error) return qltdWeeklyMasterApprovalError_(action, read.error.code, read.error.message, 'APPROVAL_READ', meta);
    target = read.updates.find(function(update) { return update.updateId === updateId; });
    if (!target || target.itemType !== 'MASTER' || !target.approvalStatus) {
      return qltdWeeklyMasterApprovalError_(action, 'APPROVAL_NOT_FOUND', 'MASTER completion approval request not found.', 'APPROVAL_READ', meta);
    }
    if (target.approvalStatus !== QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING) {
      return qltdWeeklyMasterApprovalError_(action, 'APPROVAL_NOT_PENDING', 'Only PENDING approval requests can be reviewed.', 'APPROVAL_READ', Object.assign({ currentStatus: target.approvalStatus }, meta));
    }
    now = qltdWorkNowIso_();
    if (nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED) {
      stage = 'MASTER_WRITE';
      masterSync = qltdWeeklyMasterApprovalApplyToMaster_(target, auth, dependencyDecision, recoveryPlan, now, action, meta);
      if (masterSync.error) return masterSync.error;
    }
    stage = 'APPROVAL_STATUS_WRITE';
    const startColumn = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + 1;
    read.sheet.getRange(target.rowNumber, startColumn, 1, QLTD_WEEKLY_TASK_UPDATE_REVIEW_HEADERS.length)
      .setValues([[nextStatus, reason, auth.email, now, dependencyDecision, recoveryPlan]]);
    const reviewed = Object.assign({}, target, {
      approvalStatus: nextStatus,
      reviewReason: reason,
      reviewedBy: auth.email,
      reviewedAt: now,
      dependencyDecision: dependencyDecision,
      impactMode: impactMode,
      recoveryPlan: recoveryPlan
    });
    const notificationResult = qltdNotificationsTryFinalizeReviewNoLock_(reviewed);
    return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
      approval: reviewed,
      masterAutoUpdated: !!masterSync,
      congViecUpdated: !!(masterSync && masterSync.congViecUpdated),
      columnWUpdated: !!(masterSync && masterSync.columnWUpdated),
      dependencyDecision: dependencyDecision,
      impactMode: impactMode,
      recoveryPlanSaved: !!recoveryPlan,
      recalcTriggered: !!(masterSync && masterSync.recalcTriggered),
      affectedProjectCode: target.projectCode,
      affectedMasterTaskCode: target.itemId,
      masterSync: masterSync,
      notifications: notificationResult,
      weeklyUpdateSaved: true,
      approvalStatus: reviewed.approvalStatus,
      masterWriteback: qltdWeeklyTaskUpdatesBuildMasterWritebackResponse_(masterSync, target),
      ganttRefreshRequired: false,
      dashboardRefreshRequired: false,
      projectDirty: nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED &&
        !!(masterSync && masterSync.scheduleState === QLTD_PROJECT_SCHEDULE_STATE_V1.DIRTY),
      scheduleState: masterSync && masterSync.scheduleState || '',
      scheduleRecalculationRequired: nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED,
      ok: true,
      partialSuccess: false
    }, (masterSync && masterSync.warnings || []).concat(notificationResult.warnings || []), meta);
  } catch (error) {
    Logger.log(JSON.stringify({
      action: action,
      code: 'APPROVAL_REVIEW_FAILED',
      stage: stage,
      projectCode: target && target.projectCode || '',
      itemId: target && target.itemId || '',
      message: qltdBudgetSafeErrorMessage_(error)
    }));
    return qltdWeeklyMasterApprovalError_(action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), stage, meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdWeeklyPbDetailApprovalReview_(payload) {
  const action = 'weekly_pbdetailapproval_review';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const updateId = String(payload && payload.updateId || '').trim();
  const nextStatus = qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(payload && (payload.approvalStatus || payload.status));
  const reason = String(payload && (payload.reviewReason || payload.reason) || '').trim();
  const meta = { email: auth.email, updateId: updateId, approvalStatus: nextStatus };
  if (!updateId) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'UPDATE_ID_REQUIRED', 'updateId is required.', meta);
  if ([QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED, QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED].indexOf(nextStatus) === -1) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'APPROVAL_STATUS_INVALID', 'Approval status must be APPROVED or REJECTED.', meta);
  }
  if (nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED && !reason) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'REVIEW_REASON_REQUIRED', 'ReviewReason is required when rejecting.', meta);
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire approval review lock.', meta);
    const read = qltdWeeklyTaskUpdatesRead_();
    if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, meta);
    const target = read.updates.find(function(update) { return update.updateId === updateId; });
    if (!target || target.itemType !== 'PB_DETAIL' || !target.approvalStatus) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'APPROVAL_NOT_FOUND', 'PB_DETAIL approval request not found.', meta);
    }
    if (target.approvalStatus !== QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'APPROVAL_NOT_PENDING', 'Only PENDING approval requests can be reviewed.', Object.assign({ currentStatus: target.approvalStatus }, meta));
    }
    const submitter = qltdUsersGetByEmail_(target.updatedBy);
    if (!submitter || submitter.status !== 'ACTIVE' || qltdWorkNormalizeRole_(submitter.role) !== 'REPORTER') {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PROPOSAL_SUBMITTER_INVALID', 'PB_DETAIL proposal submitter is not an active Reporter.', meta);
    }
    const scope = qltdWeeklyTaskUpdatesResolveScope_(action, target, auth);
    if (scope.error) return scope.error;
    if (!qltdCanManageProjectDept_(auth.user, scope.projectCode, scope.deptCode, scope.dept)) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Editor cannot review another department.', scope.meta, scope.warnings);
    }

    const detailContext = qltdPbDetailBuildSheetContext_(action, Object.assign({}, scope, { meta: scope.meta }));
    if (detailContext.error) return detailContext.error;
    const detailRow = detailContext.dataRows.find(function(row) {
      return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL && row.detailTaskId === target.itemId;
    });
    if (!detailRow) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PB_DETAIL_NOT_FOUND', 'PB_DETAIL task not found.', scope.meta, scope.warnings);
    }
    const currentDetail = qltdPbDetailBuildDetailDto_(detailRow, detailContext.columns);

    let officialWrite = null;
    if (nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED) {
      const ownership = qltdWeeklyTaskUpdatesValidateReporterOwnership_(currentDetail, { email: target.updatedBy }, scope, action);
      if (ownership.error) return ownership.error;
      officialWrite = qltdPbDetailApplyUpdateNoLock_('work_updateDetailTask', {
        projectCode: target.projectCode,
        deptCode: target.deptCode,
        detailTaskId: target.itemId,
        progress: target.progressEnd,
        status: qltdWeeklyTaskUpdatesMapPbDetailStatus_(target.taskStatus),
        actualStart: target.actualStart,
        actualFinish: target.actualFinish
      }, scope, detailContext, detailContext.warnings.slice());
      if (!officialWrite || !officialWrite.success) return officialWrite;
    }

    const now = qltdWorkNowIso_();
    const startColumn = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + 1;
    read.sheet.getRange(target.rowNumber, startColumn, 1, QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.length)
      .setValues([[nextStatus, reason, auth.email, now]]);
    const reviewed = Object.assign({}, target, {
      approvalStatus: nextStatus,
      reviewReason: reason,
      reviewedBy: auth.email,
      reviewedAt: now
    });
    const notificationResult = qltdNotificationsTryFinalizeReviewNoLock_(reviewed);
    return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
      approval: reviewed,
      pbDetailUpdated: !!officialWrite,
      affectedProjectCode: target.projectCode,
      affectedDeptCode: target.deptCode,
      affectedDetailTaskId: target.itemId,
      notifications: notificationResult
    }, (officialWrite && officialWrite.warnings || []).concat(notificationResult.warnings || []), meta);
  } catch (error) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdWeeklyTaskUpdatesSave_(payload) {
  const action = 'weekly_taskupdates_save';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const scope = qltdWeeklyTaskUpdatesResolveScope_(action, payload || {}, auth);
  if (scope.error) return scope.error;
  const progressPermission = qltdResolveDeptProgressPermission_(
    auth.user,
    scope.projectCode,
    scope.deptCode,
    scope.dept,
    action
  );
  if (!progressPermission.allowed) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PROJECT_DEPT_UPDATE_FORBIDDEN', 'User cannot update progress for this project department.', scope.meta, scope.warnings);
  }
  const delegatedFieldError = qltdUserProjectDeptAccessValidateDelegatedPayload_(action, payload || {}, progressPermission);
  if (delegatedFieldError) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, delegatedFieldError.code, delegatedFieldError.message, Object.assign({}, scope.meta, {
      forbiddenFields: delegatedFieldError.forbiddenFields
    }), scope.warnings);
  }
  const validation = qltdWeeklyTaskUpdatesValidatePayload_(payload || {}, scope);
  if (validation.error) return validation.error;
  const role = qltdWorkNormalizeRole_(auth.user && auth.user.role);
  const delegatedDeptManager = qltdUserProjectDeptAccessDecisionIsDeptManager_(progressPermission);
  const reporterProposal = role === 'REPORTER' && !delegatedDeptManager;
  if (reporterProposal && validation.itemType !== 'PB_DETAIL') {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'REPORTER_PB_DETAIL_ONLY', 'Reporter can only submit assigned PB_DETAIL updates.', scope.meta, scope.warnings);
  }
  if (role === 'VIEWER' && !delegatedDeptManager) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Viewer cannot submit weekly updates.', scope.meta, scope.warnings);
  }
  const currentItem = qltdWeeklyTaskUpdatesFindCurrentItem_(validation.itemType, validation.itemId, scope, action);
  if (reporterProposal) {
    const ownership = qltdWeeklyTaskUpdatesValidateReporterOwnership_(currentItem, auth, scope, action);
    if (ownership.error) return ownership.error;
  }
  const transition = qltdWeeklyTaskUpdatesValidateMasterStatusTransition_(validation, currentItem, auth, scope);
  if (transition.error) return transition.error;
  const lifecycle = qltdWeeklyTaskUpdatesResolveActualDateLifecycle_(payload || {}, validation, currentItem, scope);
  if (lifecycle.error) return lifecycle.error;
  if (qltdWeeklyTaskUpdatesIsCompletionProposal_(validation) && !validation.thisWeekResult) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'RESULT_REQUIRED', 'ThisWeekResult is required when MASTER status is Hoàn thành.', scope.meta, scope.warnings);
  }
  if (currentItem && validation.progressEnd < Number(currentItem.progress || 0) && !payload.confirmProgressDecrease) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PROGRESS_DECREASE_CONFIRM_REQUIRED', 'Progress is lower than current task progress. Confirmation is required.', scope.meta, scope.warnings, {
      currentProgress: Number(currentItem.progress || 0),
      requestedProgress: validation.progressEnd
    });
  }
  const budgetPreparation = reporterProposal
    ? { writes: [], skippedZeroCount: 0, error: null }
    : qltdWeeklyTaskUpdatesPrepareBudgetWrites_(payload || {}, scope, auth);
  if (budgetPreparation.error) return budgetPreparation.error;

  const lock = LockService.getScriptLock();
  let locked = false;
  let saved;
  let notificationResult = null;
  const budgetResults = [];
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire weekly task update lock.', scope.meta, scope.warnings);
    const read = qltdWeeklyTaskUpdatesRead_();
    if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, scope.meta, scope.warnings);
    const key = qltdWeeklyTaskUpdatesBuildKey_(scope.projectCode, scope.deptCode, scope.weekCode, validation.itemType, validation.itemId);
    const pending = reporterProposal ? read.updates.find(function(update) {
      return update.key === key &&
        update.updatedBy === auth.email &&
        update.approvalStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING;
    }) : null;
    if (pending) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PB_DETAIL_APPROVAL_ALREADY_PENDING', 'A PB_DETAIL proposal is already pending for this week.', scope.meta, scope.warnings, {
        existingUpdate: pending
      });
    }
    const existing = reporterProposal ? null : read.updates.find(function(update) {
      return update.key === key && (validation.itemType === 'MASTER' || !update.approvalStatus);
    });
    if (existing && validation.progressEnd < existing.progressEnd && !payload.confirmProgressDecrease) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PROGRESS_DECREASE_CONFIRM_REQUIRED', 'Progress is lower than the saved value. Confirmation is required.', scope.meta, scope.warnings, {
        currentProgress: existing.progressEnd,
        requestedProgress: validation.progressEnd
      });
    }
    const budgetLimitCheck = qltdWeeklyTaskUpdatesValidateBudgetActualLimits_(budgetPreparation.writes, scope);
    if (budgetLimitCheck.error) return budgetLimitCheck.error;
    for (let budgetIndex = 0; budgetIndex < budgetPreparation.writes.length; budgetIndex += 1) {
      const preparedBudget = budgetPreparation.writes[budgetIndex];
      const budgetResult = qltdBudgetExecutePreparedWriteNoLock_(preparedBudget);
      if (!budgetResult || !budgetResult.success) {
        return qltdWeeklyTaskUpdatesPartialWriteError_(
          payload,
          scope,
          'BUDGET_WRITE',
          budgetResults,
          budgetResult,
          false
        );
      }
      const builtBudgetResult = qltdWeeklyTaskUpdatesBuildBudgetResult_(preparedBudget, budgetResult);
      budgetResults.push(builtBudgetResult);
      if (typeof qltdBudgetRefreshAggregateForWriteNoLock_ === 'function') {
        try {
          builtBudgetResult.aggregate = qltdBudgetRefreshAggregateForWriteNoLock_(preparedBudget);
        } catch (aggregateError) {
          return qltdWeeklyTaskUpdatesPartialWriteError_(
            payload,
            scope,
            'AGGREGATE',
            budgetResults,
            {
              code: aggregateError && aggregateError.code || 'AGGREGATE_REFRESH_FAILED',
              message: qltdBudgetSafeErrorMessage_(aggregateError),
              budgetItemCode: preparedBudget.weeklyBudgetMeta && preparedBudget.weeklyBudgetMeta.budgetItemCode || '',
              reportId: preparedBudget.reportId,
              requestId: preparedBudget.requestId,
              details: aggregateError && aggregateError.details || null
            },
            false
          );
        }
      }
    }
    const now = qltdWorkNowIso_();
    const completionProposal = qltdWeeklyTaskUpdatesIsCompletionProposal_(validation);
    const approvalRequired = reporterProposal || completionProposal;
    const rowObject = {
      UpdateId: existing ? existing.updateId : 'WTU_' + Utilities.getUuid(),
      ProjectCode: scope.projectCode,
      DeptCode: scope.deptCode,
      WeekCode: scope.weekCode,
      ItemType: validation.itemType,
      ItemId: validation.itemId,
      ThisWeekResult: validation.thisWeekResult,
      ProgressEnd: validation.progressEnd,
      TaskStatus: validation.taskStatus,
      ActualStart: validation.actualStart,
      ActualFinish: validation.actualFinish,
      Issue: validation.issue,
      Recommendation: validation.recommendation,
      BudgetThisWeek: validation.budgetThisWeek,
      BudgetNote: validation.budgetNote,
      UpdatedBy: auth.email,
      UpdatedAt: now,
      ApprovalStatus: approvalRequired ? QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING : '',
      ReviewReason: '',
      ReviewedBy: '',
      ReviewedAt: '',
      DependencyDecision: '',
      RecoveryPlan: ''
    };
    const rowNumber = existing ? existing.rowNumber : Math.max(read.sheet.getLastRow() + 1, 2);
    read.sheet.getRange(rowNumber, 1, 1, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length).setValues([
      QLTD_WEEKLY_TASK_UPDATE_HEADERS.map(function(header) { return rowObject[header]; })
    ]);
    saved = {
      inserted: !existing,
      duplicatePrevented: !!existing,
      update: qltdWeeklyTaskUpdatesNormalize_(rowObject, rowNumber),
      warnings: scope.warnings.slice()
    };
    if (approvalRequired) {
      notificationResult = qltdNotificationsTryCreatePendingNoLock_(saved.update);
      saved.warnings.push.apply(saved.warnings, notificationResult.warnings || []);
    }
  } catch (error) {
    if (budgetPreparation.writes.length) {
      return qltdWeeklyTaskUpdatesPartialWriteError_(payload, scope, 'WEEKLY_ROW_WRITE', budgetResults, {
        errors: [{ code: 'WEEKLY_ROW_WRITE_FAILED', message: qltdBudgetSafeErrorMessage_(error) }]
      }, false);
    }
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), scope.meta, scope.warnings);
  } finally {
    if (locked) lock.releaseLock();
  }

  const sync = qltdWeeklyTaskUpdatesSyncTask_(payload, validation, scope, auth, saved.update);
  if (sync.warning) saved.warnings.push(sync.warning);
  if (budgetPreparation.writes.length && sync.warning) {
    return qltdWeeklyTaskUpdatesPartialWriteError_(payload, scope, 'TASK_SYNC', budgetResults, sync.result, true);
  }
  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    inserted: saved.inserted,
    duplicatePrevented: saved.duplicatePrevented,
    update: saved.update,
    taskSync: sync.result,
    notifications: notificationResult,
    masterWriteback: sync.masterWriteback || null,
    ganttRefreshRequired: !!(sync.masterWriteback && sync.masterWriteback.applied),
    dashboardRefreshRequired: !!(sync.masterWriteback && sync.masterWriteback.applied),
    weeklyUpdateSaved: true,
    approvalStatus: saved.update.approvalStatus || '',
    partialSuccess: !!(sync.masterWriteback && sync.masterWriteback.success === false),
    task: {
      saved: true,
      inserted: saved.inserted,
      duplicatePrevented: saved.duplicatePrevented,
      update: saved.update,
      sync: sync.result
    },
    budget: {
      saved: budgetResults.length > 0,
      savedCount: budgetResults.filter(function(result) { return !result.duplicate; }).length,
      duplicateCount: budgetResults.filter(function(result) { return result.duplicate; }).length,
      skippedZeroCount: budgetPreparation.skippedZeroCount,
      results: budgetResults
    }
  }, saved.warnings, scope.meta);
}

function qltdWorkListWeeklyItems_(params) {
  const action = 'work_listweeklyitems';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const scope = qltdWeeklyTaskUpdatesResolveScope_(action, params || {}, auth);
  if (scope.error) return scope.error;
  const weekStart = qltdWeeklyTaskUpdatesDate_(params.weekStart);
  const weekEnd = qltdWeeklyTaskUpdatesDate_(params.weekEnd);
  if (!weekStart || !weekEnd || weekEnd < weekStart) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'INVALID_WEEK_RANGE', 'weekStart/weekEnd must be valid yyyy-MM-dd dates.', scope.meta, scope.warnings);

  const context = qltdWorkBuildDeptContext_(scope.project, scope.dept, scope.requestedDeptCode, scope.warnings);
  const masterRead = qltdWorkReadDeptTasksForContext_(context, {}, action);
  if (masterRead.error) return masterRead.error;
  const deptMasterSources = qltdWeeklyTaskUpdatesSelectDeptMasterSources_(masterRead.tasks);
  const officialMasters = qltdWeeklyTaskUpdatesReadOfficialMasters_(scope, deptMasterSources.tasks, action);
  if (officialMasters.error) return officialMasters.error;
  const progressPermission = qltdResolveDeptProgressPermission_(
    auth.user,
    scope.projectCode,
    scope.deptCode,
    scope.dept,
    'weekly_taskupdates_save'
  );
  const delegatedDeptManager = qltdUserProjectDeptAccessDecisionIsDeptManager_(progressPermission);
  const restrictedDelegatedUpdate = progressPermission.source === 'DELEGATED_ACCESS' && !delegatedDeptManager;
  const budgetContext = restrictedDelegatedUpdate
    ? { taskLinkedByMaster: {}, standaloneItems: [], warnings: [] }
    : qltdWeeklyTaskUpdatesReadBudgetContext_(scope);
  const detailContext = qltdPbDetailBuildSheetContext_(action, Object.assign({}, scope, { meta: scope.meta }));
  const detailsByMaster = {};
  const incompleteDetailsByMaster = {};
  const detailItems = [];
  const officialMasterByCode = {};
  officialMasters.tasks.forEach(function(task) {
    officialMasterByCode[qltdWeeklyTaskUpdatesNormalizeTaskCode_(task.masterTaskCode)] = task;
  });
  if (!detailContext.error) {
    detailContext.dataRows.filter(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL; }).forEach(function(row) {
      const dto = qltdPbDetailBuildDetailDto_(row, detailContext.columns);
      const officialMaster = officialMasterByCode[qltdWeeklyTaskUpdatesNormalizeTaskCode_(dto.masterTaskCode)] || {};
      qltdWeeklyTaskUpdatesApplyMasterExactRowContext_(dto, officialMaster);
      qltdWeeklyTaskUpdatesAttachBudgetContext_(dto, budgetContext, dto.masterTaskCode);
      detailsByMaster[dto.masterTaskCode] = (detailsByMaster[dto.masterTaskCode] || 0) + 1;
      if (Number(dto.progress || 0) < 100 && !qltdWeeklyTaskUpdatesIsOfficialComplete_(dto)) {
        incompleteDetailsByMaster[dto.masterTaskCode] = (incompleteDetailsByMaster[dto.masterTaskCode] || 0) + 1;
      }
      detailItems.push(qltdWeeklyTaskUpdatesBuildItem_('PB_DETAIL', dto.detailTaskId, dto, weekStart, weekEnd, params.search));
    });
  }
  const masterItems = officialMasters.tasks.map(function(task) {
    qltdWeeklyTaskUpdatesAttachBudgetContext_(task, budgetContext, task.masterTaskCode);
    const item = qltdWeeklyTaskUpdatesBuildItem_('MASTER', task.masterTaskCode, task, weekStart, weekEnd, params.search, !!detailsByMaster[task.masterTaskCode]);
    item.incompleteDetailCount = incompleteDetailsByMaster[task.masterTaskCode] || 0;
    return item;
  });
  const role = qltdWorkNormalizeRole_(auth.user && auth.user.role);
  const canManage = qltdCanManageProjectDept_(auth.user, scope.projectCode, scope.deptCode, scope.dept) ||
    progressPermission.source === 'DELEGATED_ACCESS';
  let items = masterItems.concat(detailItems).filter(function(item) { return item.eligible; });
  items.forEach(function(item) {
    item.canUpdate = canManage || (
      role === 'REPORTER' &&
      item.itemType === 'PB_DETAIL' &&
      qltdWeeklyTaskUpdatesReporterOwnsItem_(item, auth.email, scope.deptCode)
    );
  });
  const group = String(params.group || '').trim().toUpperCase();
  if (group && group !== 'ALL') items = items.filter(function(item) { return item.eligibleReason === group; });
  items.sort(qltdWeeklyTaskUpdatesSortItems_);
  const summary = { overdue: 0, inProgress: 0, planned: 0, completedThisWeek: 0 };
  items.forEach(function(item) {
    if (item.eligibleReason === 'OVERDUE') summary.overdue += 1;
    else if (item.eligibleReason === 'IN_PROGRESS') summary.inProgress += 1;
    else if (item.eligibleReason === 'PLANNED') summary.planned += 1;
    else if (item.eligibleReason === 'COMPLETED_THIS_WEEK') summary.completedThisWeek += 1;
  });
  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    projectCode: scope.projectCode,
    deptCode: scope.deptCode,
    weekCode: scope.weekCode,
    items: items.map(function(item) { delete item.eligible; return item; }),
    summary: summary,
    capabilities: {
      canUpdate: canManage || role === 'REPORTER',
      canReviewWeekly: qltdCanManageProjectDept_(auth.user, scope.projectCode, scope.deptCode, scope.dept),
      role: qltdWorkNormalizeRole_(auth.user && auth.user.role),
      permissionSource: progressPermission.source,
      permissionCode: progressPermission.permissionCode,
      canWriteBudget: !restrictedDelegatedUpdate && (role !== 'REPORTER' || delegatedDeptManager)
    },
    standaloneBudgetItems: restrictedDelegatedUpdate ? [] : (budgetContext.standaloneItems || [])
  }, scope.warnings.concat(deptMasterSources.warnings || []).concat(officialMasters.warnings || []).concat(budgetContext.warnings || []).concat(detailContext.error ? [qltdWorkWarning_('PB_DETAIL_UNAVAILABLE', 'PB_DETAIL items could not be loaded.')] : []), scope.meta);
}

function qltdWeeklyTaskUpdatesSelectDeptMasterSources_(deptTasks) {
  const groups = {};
  const groupOrder = [];
  const warnings = [];

  (deptTasks || []).forEach(function(task) {
    const masterTaskCode = qltdWeeklyTaskUpdatesNormalizeTaskCode_(task && task.masterTaskCode);
    const rowType = String(task && task.rowType || '').trim().toUpperCase();
    const detailTaskId = String(task && task.detailTaskId || '').trim();
    if (!masterTaskCode || detailTaskId) return;
    if (rowType && rowType !== 'MASTER') return;
    if (!groups[masterTaskCode]) {
      groups[masterTaskCode] = [];
      groupOrder.push(masterTaskCode);
    }
    groups[masterTaskCode].push(task);
  });

  const tasks = groupOrder.map(function(masterTaskCode) {
    const matches = groups[masterTaskCode];
    const rowNumbers = matches.map(function(task) {
      return Number(task && task.rowNumber || 0);
    }).filter(function(rowNumber) {
      return rowNumber > 0;
    });
    const sourceMappingUnique = matches.length === 1;
    if (!sourceMappingUnique) {
      warnings.push(qltdWorkWarning_('DEPT_MASTER_DUPLICATED', 'More than one department MASTER row uses this masterTaskCode; source mapping is not safe for editing.', {
        masterTaskCode: masterTaskCode,
        matchCount: matches.length,
        rowNumbers: rowNumbers
      }));
    }
    return Object.assign({}, matches[0], {
      masterTaskCode: masterTaskCode,
      sourceMappingUnique: sourceMappingUnique,
      deptMasterMatchCount: matches.length,
      deptMasterRowNumbers: rowNumbers
    });
  });

  return {
    tasks: tasks,
    warnings: warnings
  };
}

function qltdWeeklyTaskUpdatesReadOfficialMasters_(scope, deptMasterRows, action) {
  const warnings = [];
  const result = qltdGanttGetDataForProject_(scope.projectCode);
  if (!result || result.success === false || !Array.isArray(result.data)) {
    return {
      tasks: [],
      warnings: warnings,
      error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'GANTT_PAYLOAD_UNAVAILABLE', 'Official MASTER payload from Cong_viec is unavailable.', scope.meta, scope.warnings)
    };
  }
  const officialByCode = {};
  result.data.forEach(function(task) {
    [task.code, task.id].forEach(function(value) {
      const key = qltdWeeklyTaskUpdatesNormalizeTaskCode_(value);
      if (!key) return;
      officialByCode[key] = officialByCode[key] || [];
      if (officialByCode[key].indexOf(task) === -1) officialByCode[key].push(task);
    });
  });
  const tasks = (deptMasterRows || []).map(function(deptTask) {
    const code = qltdWeeklyTaskUpdatesNormalizeTaskCode_(deptTask.masterTaskCode);
    const matches = officialByCode[code] || [];
    const official = matches.length === 1 ? matches[0] : null;
    if (!official) {
      warnings.push(qltdWorkWarning_(matches.length > 1 ? 'OFFICIAL_MASTER_DUPLICATED' : 'OFFICIAL_MASTER_NOT_FOUND', matches.length > 1
        ? 'More than one MASTER row matched this masterTaskCode; source mapping is not safe for editing.'
        : 'MASTER not found in Gantt/Cong_viec payload; using dept reference fields for this item only.', {
        masterTaskCode: deptTask.masterTaskCode,
        matchCount: matches.length
      }));
      return Object.assign({}, deptTask, {
        ownZone: '',
        ownHangMuc: '',
        zone: '',
        hangMuc: '',
        sourceMappingUnique: false,
        sourceRowType: ''
      });
    }
    return qltdWeeklyTaskUpdatesBuildOfficialMasterDto_(official, deptTask);
  });
  return {
    tasks: tasks,
    warnings: warnings,
    error: null
  };
}

function qltdWeeklyTaskUpdatesBuildOfficialMasterDto_(official, deptTask) {
  const progress = Number(official.percent !== undefined ? official.percent : Math.round(Number(official.progress || 0) * 100));
  return {
    masterTaskCode: String(deptTask.masterTaskCode || official.code || official.id || '').trim(),
    wbs: String(official.wbs || deptTask.wbs || '').trim(),
    taskName: String(official.taskName || '').trim(),
    congViecZone: String(official.congViecZone || '').trim(),
    congViecHangMuc: String(official.congViecHangMuc || '').trim(),
    ownZone: String(official.congViecZone || '').trim(),
    ownHangMuc: String(official.congViecHangMuc || '').trim(),
    zone: String(official.congViecZone || '').trim(),
    hangMuc: String(official.congViecHangMuc || '').trim(),
    rowType: deptTask.rowType || 'MASTER',
    planStart: qltdBudgetFormatDate_(official.baselineStart || official.startPlan || official.start_date || deptTask.planStart),
    planFinish: qltdBudgetFormatDate_(official.baselineEnd || official.endPlan || official.end_date || official.deadline || deptTask.planFinish),
    status: String(official.status || deptTask.status || '').trim(),
    actualStart: qltdBudgetFormatDate_(official.actualStart || official.startActual || deptTask.actualStart),
    actualFinish: qltdBudgetFormatDate_(official.actualFinish || official.actualEnd || official.endActual || deptTask.actualFinish),
    progress: isNaN(progress) ? Number(deptTask.progress || 0) : Math.max(0, Math.min(100, progress)),
    budgetPlan: Number(deptTask.budgetPlan || 0),
    budgetActual: Number(deptTask.budgetActual || 0),
    ownerText: String(official.owner || deptTask.ownerText || '').trim(),
    coordinatorText: deptTask.coordinatorText || '',
    officialSource: 'GANTT_CONG_VIEC',
    sourceMappingUnique: deptTask.sourceMappingUnique !== false,
    sourceRowType: String(official.rowType || '').trim().toUpperCase()
  };
}

function qltdWeeklyTaskUpdatesApplyMasterExactRowContext_(target, officialMaster) {
  const dto = target || {};
  const official = officialMaster || {};
  dto.congViecZone = String(official.congViecZone || official.ownZone || '').trim();
  dto.congViecHangMuc = String(official.congViecHangMuc || official.ownHangMuc || '').trim();
  dto.ownZone = dto.congViecZone;
  dto.ownHangMuc = dto.congViecHangMuc;
  return dto;
}

function qltdWeeklyTaskUpdatesBuildApprovalDto_(update, projectCache) {
  const dto = Object.assign({}, update);
  const projectCode = update.projectCode;
  let official = null;
  if (projectCode) {
    if (!Object.prototype.hasOwnProperty.call(projectCache, projectCode)) {
      const result = qltdGanttGetDataForProject_(projectCode);
      const map = {};
      if (result && result.success !== false && Array.isArray(result.data)) {
        result.data.forEach(function(task) {
          [task.code, task.id].forEach(function(value) {
            const key = qltdWeeklyTaskUpdatesNormalizeTaskCode_(value);
            if (key && !map[key]) map[key] = task;
          });
        });
      }
      projectCache[projectCode] = map;
    }
    official = projectCache[projectCode][qltdWeeklyTaskUpdatesNormalizeTaskCode_(update.itemId)];
  }
  if (official) {
    dto.wbs = String(official.wbs || '').trim();
    dto.taskName = String(official.taskName || '').trim();
    dto.ownZone = String(official.congViecZone || '').trim();
    dto.ownHangMuc = String(official.congViecHangMuc || '').trim();
    dto.zone = dto.ownZone;
    dto.hangMuc = dto.ownHangMuc;
    dto.planStart = qltdBudgetFormatDate_(official.baselineStart || official.start_date || '');
    dto.planFinish = qltdBudgetFormatDate_(official.baselineEnd || official.end_date || official.deadline || '');
    dto.officialStatus = String(official.status || '').trim();
    dto.officialProgress = Number(official.percent !== undefined ? official.percent : Math.round(Number(official.progress || 0) * 100));
    dto.officialActualFinish = qltdBudgetFormatDate_(official.actualFinish || official.actualEnd || '');
  }
  return dto;
}

function qltdWeeklyTaskUpdatesReadBudgetContext_(scope) {
  const empty = { taskLinkedByMaster: {}, standaloneItems: [], warnings: [] };
  if (typeof qltdBudgetReadBudgetItems_ !== 'function') return empty;
  const result = qltdBudgetReadBudgetItems_();
  const warnings = result.warnings || [];
  const allocationsResult = typeof qltdBudgetReadAllocations_ === 'function' ? qltdBudgetReadAllocations_() : { allocations: [], warnings: [] };
  const allocationsByCode = {};
  (allocationsResult.allocations || []).forEach(function(allocation) {
    allocationsByCode[qltdBudgetNormalizeCode_(allocation.allocationCode)] = allocation;
  });
  const actuals = qltdWeeklyTaskUpdatesReadBudgetActualIndex_(scope);
  const projectCode = qltdBudgetNormalizeCode_(scope.projectCode);
  const deptCode = qltdBudgetNormalizeCode_(scope.deptCode);
  (result.items || []).forEach(function(item) {
    if (item.status !== 'ACTIVE') return;
    if (qltdBudgetNormalizeCode_(item.projectCode) !== projectCode) return;
    if (qltdBudgetNormalizeCode_(item.deptCode) !== deptCode) return;
    const flowType = qltdWeeklyTaskUpdatesResolveCashFlowType_(item);
    const allocation = allocationsByCode[qltdBudgetNormalizeCode_(item.allocationCode)] || null;
    if (item.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED && !allocation) return;
    if (allocation && (
      allocation.status !== 'CONFIRMED' ||
      qltdBudgetNormalizeCode_(allocation.projectCode) !== projectCode ||
      qltdBudgetNormalizeCode_(allocation.deptCode) !== deptCode ||
      allocation.flowType !== flowType
    )) return;
    const itemKey = qltdWeeklyTaskUpdatesBudgetItemKey_(item.projectCode, item.budgetItemCode, item.allocationCode, flowType);
    const weekActual = actuals.byItemWeek[itemKey] || { amount: 0, note: '' };
    const cumulative = Number(actuals.byItem[itemKey] || 0);
    const approvedBudget = Number(item.approvedBudget || 0);
    const dto = {
      budgetItemCode: item.budgetItemCode,
      budgetItemName: item.budgetItemName,
      budgetType: item.budgetType,
      budgetGroup: item.budgetGroup,
      budgetStage: item.budgetStage,
      approvedBudget: approvedBudget,
      allocatedAmount: allocation ? Number(allocation.allocatedAmount || 0) : '',
      allocationCode: item.allocationCode || '',
      flowType: flowType,
      budgetFlowType: flowType,
      masterTaskCode: item.masterTaskCode || '',
      pbTaskCode: item.pbTaskCode || '',
      actualThisWeek: Number(weekActual.amount || 0),
      actualCumulative: cumulative,
      cumulativeActual: cumulative,
      remainingBudget: Math.max(0, approvedBudget - cumulative),
      remaining: Math.max(0, approvedBudget - cumulative),
      budgetNote: weekActual.note || ''
    };
    if (item.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED && item.masterTaskCode) {
      const key = qltdWeeklyTaskUpdatesNormalizeTaskCode_(item.masterTaskCode);
      if (!empty.taskLinkedByMaster[key]) empty.taskLinkedByMaster[key] = [];
      empty.taskLinkedByMaster[key].push(dto);
    } else if (item.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE) {
      empty.standaloneItems.push(dto);
    }
  });
  empty.warnings = warnings.concat(allocationsResult.warnings || []).concat(actuals.warnings || []);
  return empty;
}

function qltdWeeklyTaskUpdatesAttachBudgetContext_(target, budgetContext, masterTaskCode) {
  const items = budgetContext && budgetContext.taskLinkedByMaster &&
    budgetContext.taskLinkedByMaster[qltdWeeklyTaskUpdatesNormalizeTaskCode_(masterTaskCode)];
  if (!items || !items.length) return target;
  const item = items[0];
  const approvedTotal = items.reduce(function(total, candidate) { return total + Number(candidate.approvedBudget || 0); }, 0);
  const actualThisWeekTotal = items.reduce(function(total, candidate) { return total + Number(candidate.actualThisWeek || 0); }, 0);
  const cumulativeTotal = items.reduce(function(total, candidate) { return total + Number(candidate.actualCumulative || candidate.cumulativeActual || 0); }, 0);
  target.taskLinkedBudgetItems = items.slice();
  target.taskLinkedBudgetThisWeek = actualThisWeekTotal;
  target.taskLinkedBudgetCumulative = cumulativeTotal;
  target.budgetItemCode = item.budgetItemCode;
  target.budgetItemName = item.budgetItemName;
  target.budgetType = item.budgetType;
  target.budgetGroup = item.budgetGroup;
  target.budgetStage = item.budgetStage;
  target.budgetFlowType = item.budgetFlowType;
  if (approvedTotal) target.budgetPlan = approvedTotal;
  if (cumulativeTotal) target.budgetActual = cumulativeTotal;
  return target;
}

function qltdWeeklyTaskUpdatesResolveCashFlowType_(source) {
  const direct = String(source && (source.budgetFlowType || source.cashFlowType || source.flowType) || '').trim().toUpperCase();
  if (direct === 'THU' || direct === 'CHI') return direct;
  const text = [
    source && source.budgetFlowType,
    source && source.cashFlowType,
    source && source.flowType,
    source && source.budgetGroup,
    source && source.budgetStage,
    source && source.budgetItemName,
    source && source.taskName
  ].join(' ');
  const key = qltdWeeklyTaskUpdatesNormalizeStatusKey_(text);
  if (key.indexOf('khoanthu') >= 0 || key.indexOf('dongthu') >= 0 || key.indexOf('doanhthu') >= 0 || /(^|[^a-z])thu([^a-z]|$)/.test(key)) return 'THU';
  if (key.indexOf('khoanchi') >= 0 || key.indexOf('dongchi') >= 0 || key.indexOf('chiphi') >= 0 || /(^|[^a-z])chi([^a-z]|$)/.test(key)) return 'CHI';
  return '';
}

function qltdWeeklyTaskUpdatesResolveScope_(action, input, auth) {
  const weekCode = qltdWorkNormalizeWeekCode_(input.weekCode);
  if (!weekCode) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WEEK_CODE_REQUIRED', 'weekCode is required.', { email: auth.email }) };
  const resolved = qltdWorkResolveProjectDept_(action, input, QLTD_WEEKLY_TASK_UPDATE_SOURCE, { requireDeptSpreadsheet: true, actorUser: auth.user, meta: { email: auth.email, weekCode: weekCode } });
  if (resolved.error) {
    const resolvedCode = resolved.error.errors && resolved.error.errors[0] && resolved.error.errors[0].code;
    if (resolvedCode === 'PROJECT_DEPT_NOT_ASSIGNED') {
      return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Bạn không được cấp quyền truy cập vào dữ liệu phòng/ban này.', { email: auth.email, deptCode: qltdWorkNormalizeCode_(input.deptCode) }) };
    }
    return { error: resolved.error };
  }
  if (!qltdCanReadProjectDept_(auth.user, resolved.projectCode, resolved.deptCode, resolved.dept)) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Bạn không được cấp quyền truy cập vào dữ liệu phòng/ban này.', { email: auth.email, projectCode: resolved.projectCode, deptCode: resolved.deptCode }, resolved.warnings) };
  return Object.assign({}, resolved, {
    weekCode: weekCode,
    warnings: resolved.warnings || [],
    meta: { email: auth.email, projectCode: resolved.projectCode, deptCode: resolved.deptCode, weekCode: weekCode },
    error: null
  });
}

function qltdWeeklyTaskUpdatesValidatePayload_(payload, scope) {
  const itemType = qltdWeeklyTaskUpdatesNormalizeType_(payload.itemType);
  const itemId = String(payload.itemId || '').trim();
  const progressEnd = Number(payload.progressEnd);
  const taskStatus = qltdWeeklyTaskUpdatesCanonicalTaskStatus_(payload.taskStatus);
  const actualStart = qltdWeeklyTaskUpdatesDate_(payload.actualStart, true);
  const actualFinish = qltdWeeklyTaskUpdatesDate_(payload.actualFinish, true);
  const budgetThisWeek = String(payload.budgetThisWeek || '').trim() === '' ? '' : Number(payload.budgetThisWeek);
  if (!itemType || !itemId) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'ITEM_REQUIRED', 'itemType and itemId are required.', scope.meta, scope.warnings) };
  if (isNaN(progressEnd) || progressEnd < 0 || progressEnd > 100) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'INVALID_PROGRESS', 'progressEnd must be between 0 and 100.', scope.meta, scope.warnings) };
  if (payload.actualStart && !actualStart || payload.actualFinish && !actualFinish) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'INVALID_DATE', 'Actual dates must use yyyy-MM-dd.', scope.meta, scope.warnings) };
  if (budgetThisWeek !== '' && (isNaN(budgetThisWeek) || budgetThisWeek < 0)) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'INVALID_BUDGET', 'budgetThisWeek must be non-negative.', scope.meta, scope.warnings) };
  return {
    itemType: itemType, itemId: itemId,
    thisWeekResult: String(payload.thisWeekResult || '').trim(), progressEnd: progressEnd,
    taskStatus: taskStatus, actualStart: actualStart, actualFinish: actualFinish,
    issue: String(payload.issue || '').trim(), recommendation: String(payload.recommendation || '').trim(),
    budgetThisWeek: budgetThisWeek, budgetNote: String(payload.budgetNote || '').trim(), error: null
  };
}

function qltdWeeklyTaskUpdatesPrepareBudgetWrites_(payload, scope, auth) {
  const updates = payload.budgetUpdates;
  if (updates === undefined || updates === null) {
    return { writes: [], skippedZeroCount: 0, error: null };
  }
  if (!Array.isArray(updates)) {
    return {
      writes: [],
      skippedZeroCount: 0,
      error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_UPDATES_INVALID', 'budgetUpdates must be an array.', -1, '')
    };
  }
  if (!updates.length) return { writes: [], skippedZeroCount: 0, error: null };

  const baseRequestId = String(payload.requestId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(baseRequestId)) {
    return {
      writes: [],
      skippedZeroCount: 0,
      error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_REQUEST_ID_INVALID', 'requestId is required for budgetUpdates and must be 8-80 safe characters.', -1, '')
    };
  }

  const writes = [];
  const seenBudgetItems = {};
  let skippedZeroCount = 0;
  for (let index = 0; index < updates.length; index += 1) {
    const entry = updates[index] || {};
    const rawAmount = entry.actualAmount;
    if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === '') {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_AMOUNT_REQUIRED', 'actualAmount is required for each budget update.', index, entry.budgetItemCode)
      };
    }
    const amount = qltdBudgetNormalizeAmount_(rawAmount);
    if (amount.error) {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, amount.error.code, amount.error.message, index, entry.budgetItemCode)
      };
    }
    if (amount.value === 0) {
      skippedZeroCount += 1;
      continue;
    }

    const budgetItemCode = String(entry.budgetItemCode || '').trim();
    const normalizedBudgetItemCode = qltdBudgetNormalizeCode_(budgetItemCode);
    if (!normalizedBudgetItemCode) {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_ITEM_CODE_REQUIRED', 'budgetItemCode is required.', index, budgetItemCode)
      };
    }
    if (seenBudgetItems[normalizedBudgetItemCode]) {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_UPDATE_DUPLICATE_ITEM', 'A budget item can appear only once in budgetUpdates.', index, budgetItemCode)
      };
    }
    seenBudgetItems[normalizedBudgetItemCode] = true;

    if (entry.projectCode && qltdBudgetNormalizeCode_(entry.projectCode) !== qltdBudgetNormalizeCode_(scope.projectCode)) {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'ALLOCATION_PROJECT_MISMATCH', 'Budget update projectCode does not match weekly scope.', index, budgetItemCode)
      };
    }
    if (entry.deptCode && qltdBudgetNormalizeCode_(entry.deptCode) !== qltdBudgetNormalizeCode_(scope.deptCode)) {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'ALLOCATION_DEPT_MISMATCH', 'Budget update deptCode does not match weekly scope.', index, budgetItemCode)
      };
    }
    const periodType = qltdBudgetNormalizePeriodType_(entry.periodType || 'WEEK');
    if (periodType.error || periodType.value !== 'WEEK') {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_PERIOD_MISMATCH', 'Weekly budget update must use periodType WEEK.', index, budgetItemCode)
      };
    }
    if (entry.periodCode && qltdWorkNormalizeWeekCode_(entry.periodCode) !== scope.weekCode) {
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_PERIOD_MISMATCH', 'Budget periodCode does not match weekly scope.', index, budgetItemCode)
      };
    }

    const budgetType = String(entry.budgetType || '').trim().toUpperCase();
    const budgetRequestId = qltdWeeklyTaskUpdatesBuildBudgetRequestId_(baseRequestId, budgetItemCode);
    const budgetPayload = {
      confirm: QLTD_BUDGET_WRITE_CONFIRM_TOKEN,
      requestId: budgetRequestId,
      email: auth.email,
      projectCode: scope.projectCode,
      deptCode: scope.deptCode,
      budgetType: budgetType,
      budgetItemCode: budgetItemCode,
      allocationCode: String(entry.allocationCode || '').trim(),
      flowType: String(entry.flowType || '').trim(),
      masterTaskCode: budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE ? '' : String(entry.masterTaskCode || '').trim(),
      periodType: 'WEEK',
      periodCode: scope.weekCode,
      amount: amount.value,
      note: String(entry.note || '').trim(),
      basis: 'WEEKLY_TASK_UPDATE'
    };
    const prepared = qltdBudgetPrepareWrite_(budgetPayload, 'ACTUAL', 'weekly_taskupdates_save');
    if (prepared.error) {
      const budgetError = qltdWeeklyTaskUpdatesFirstBudgetError_(prepared.error);
      return {
        writes: [],
        skippedZeroCount: skippedZeroCount,
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, budgetError.code, budgetError.message, index, budgetItemCode, budgetError)
      };
    }
    prepared.value.weeklyBudgetMeta = {
      index: index,
      budgetItemCode: budgetItemCode,
      actualAmount: amount.value,
      note: String(entry.note || '').trim()
    };
    writes.push(prepared.value);
  }

  const limitCheck = qltdWeeklyTaskUpdatesValidateBudgetActualLimits_(writes, scope);
  if (limitCheck.error) return { writes: [], skippedZeroCount: skippedZeroCount, error: limitCheck.error };
  return { writes: writes, skippedZeroCount: skippedZeroCount, error: null };
}

function qltdWeeklyTaskUpdatesBuildBudgetRequestId_(baseRequestId, budgetItemCode) {
  const normalizedCode = qltdBudgetNormalizeCode_(budgetItemCode);
  const safeCode = normalizedCode.replace(/[^A-Z0-9_-]/g, '_').slice(0, 24) || 'ITEM';
  let hash = 0;
  for (let index = 0; index < normalizedCode.length; index += 1) {
    hash = ((hash << 5) - hash + normalizedCode.charCodeAt(index)) | 0;
  }
  const suffix = '_BUDGET_' + safeCode + '_' + Math.abs(hash).toString(36).toUpperCase();
  return String(baseRequestId || '').slice(0, Math.max(1, 80 - suffix.length)) + suffix;
}

function qltdWeeklyTaskUpdatesFirstBudgetError_(response) {
  const errors = response && response.errors || [];
  if (errors.length) return {
    code: errors[0].code || 'BUDGET_UPDATE_INVALID',
    message: errors[0].message || errors[0].code || 'Budget update is invalid.'
  };
  return {
    code: response && (response.code || response.error && response.error.code) || 'BUDGET_UPDATE_INVALID',
    message: response && (response.message || response.error && response.error.message) || 'Budget update is invalid.'
  };
}

function qltdWeeklyTaskUpdatesBudgetError_(scope, code, message, index, budgetItemCode, budgetError) {
  return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', code, message, scope.meta, scope.warnings, {
    budgetIndex: index,
    budgetItemCode: String(budgetItemCode || '').trim(),
    budgetError: budgetError || null
  });
}

function qltdWeeklyTaskUpdatesBudgetItemKey_(projectCode, budgetItemCode, allocationCode, flowType) {
  return [
    qltdBudgetNormalizeCode_(projectCode),
    qltdBudgetNormalizeCode_(budgetItemCode),
    qltdBudgetNormalizeCode_(allocationCode),
    String(flowType || '').trim().toUpperCase()
  ].join('|');
}

function qltdWeeklyTaskUpdatesBudgetAllocationKey_(projectCode, allocationCode, flowType) {
  return [
    qltdBudgetNormalizeCode_(projectCode),
    qltdBudgetNormalizeCode_(allocationCode),
    String(flowType || '').trim().toUpperCase()
  ].join('|');
}

function qltdWeeklyTaskUpdatesReadBudgetActualIndex_(scope) {
  const result = { byItem: {}, byAllocation: {}, byItemWeek: {}, reports: {}, warnings: [] };
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  if (!sheet) {
    result.warnings.push(qltdWorkWarning_('CENTRAL_RAW_NOT_FOUND', 'CENTRAL_NS_Raw is unavailable for weekly budget totals.'));
    return result;
  }
  const schema = qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  (parsed.rows || []).forEach(function(item) {
    const row = item.raw;
    const reportId = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Report ID', '') || '').trim();
    const syncStatus = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Sync status', '') || '').trim().toUpperCase();
    if (reportId) {
      result.reports[reportId] = {
        syncStatus: syncStatus,
        rowNumber: item.rowNumber,
        syncError: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Sync error', '') || '').trim()
      };
    }
    if (syncStatus !== 'SYNCED') return;
    if (qltdBudgetNormalizeKey_(qltdBudgetGetCell_(row, parsed.headerMap, 'Trang thai xac nhan', '')) !== 'daxacnhan') return;
    if (String(qltdBudgetGetCell_(row, parsed.headerMap, 'Loai ban ghi', '') || '').trim().toUpperCase() !== 'PERFORMANCE_ACTUAL') return;
    const projectCode = qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma du an', ''));
    if (projectCode !== qltdBudgetNormalizeCode_(scope.projectCode)) return;
    const budgetItemCode = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma khoan ngan sach', '') || '').trim();
    const allocationCode = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma phan bo', '') || '').trim();
    const flowType = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Huong dong tien', '') || '').trim().toUpperCase();
    if (!budgetItemCode || !allocationCode || !flowType) return;
    const amount = qltdBudgetToNumber_(qltdBudgetGetCell_(row, parsed.headerMap, 'Gia tri thuc hien ky nay', 0));
    const itemKey = qltdWeeklyTaskUpdatesBudgetItemKey_(projectCode, budgetItemCode, allocationCode, flowType);
    const allocationKey = qltdWeeklyTaskUpdatesBudgetAllocationKey_(projectCode, allocationCode, flowType);
    const periodType = qltdBudgetNormalizePeriodType_(qltdBudgetGetCell_(row, parsed.headerMap, 'Loai ky', ''));
    const periodCode = qltdWorkNormalizeWeekCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma ky', ''));
    if (!periodType.error && periodType.value === 'WEEK') {
      result.byItem[itemKey] = Number(result.byItem[itemKey] || 0) + amount;
      result.byAllocation[allocationKey] = Number(result.byAllocation[allocationKey] || 0) + amount;
    }
    if (!periodType.error && periodType.value === 'WEEK' && periodCode === scope.weekCode) {
      const current = result.byItemWeek[itemKey] || { amount: 0, note: '' };
      current.amount += amount;
      current.note = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Vuong mac/Ghi chu', '') || current.note || '').trim();
      result.byItemWeek[itemKey] = current;
    }
  });
  return result;
}

function qltdWeeklyTaskUpdatesValidateBudgetActualLimits_(writes, scope) {
  if (!writes || !writes.length) return { error: null };
  const actuals = qltdWeeklyTaskUpdatesReadBudgetActualIndex_(scope);
  const proposedByItem = {};
  const proposedByAllocation = {};
  for (let index = 0; index < writes.length; index += 1) {
    const prepared = writes[index];
    const duplicate = actuals.reports[prepared.reportId];
    if (duplicate && duplicate.syncStatus !== 'SYNCED') {
      return {
        error: qltdWeeklyTaskUpdatesBudgetError_(
          scope,
          duplicate.syncStatus === 'ERROR' ? 'DUPLICATE_REQUEST_ERROR' : 'DUPLICATE_REQUEST_PENDING',
          'A previous budget request with the same id is not safely completed.',
          prepared.weeklyBudgetMeta.index,
          prepared.weeklyBudgetMeta.budgetItemCode,
          duplicate
        )
      };
    }
    prepared.weeklyDuplicate = !!duplicate;
    const context = prepared.allocationContext || {};
    const item = context.item || {};
    const allocation = context.allocation || {};
    const itemKey = qltdWeeklyTaskUpdatesBudgetItemKey_(item.projectCode, item.budgetItemCode, item.allocationCode, item.flowType);
    const allocationKey = qltdWeeklyTaskUpdatesBudgetAllocationKey_(allocation.projectCode, allocation.allocationCode, allocation.flowType);
    const contribution = prepared.weeklyDuplicate ? 0 : Number(prepared.weeklyBudgetMeta.actualAmount || 0);
    proposedByItem[itemKey] = Number(proposedByItem[itemKey] || 0) + contribution;
    proposedByAllocation[allocationKey] = Number(proposedByAllocation[allocationKey] || 0) + contribution;
    const itemAfter = Number(actuals.byItem[itemKey] || 0) + proposedByItem[itemKey];
    const itemLimit = Number(item.approvedBudget || 0);
    if (!item.hasApprovedBudget || itemAfter > itemLimit) {
      return {
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'BUDGET_ITEM_LIMIT_EXCEEDED', 'Budget actual exceeds the approved Budget Item amount.', prepared.weeklyBudgetMeta.index, item.budgetItemCode, {
          currentAmount: Number(actuals.byItem[itemKey] || 0),
          proposedAmount: proposedByItem[itemKey],
          limit: itemLimit
        })
      };
    }
    const allocationAfter = Number(actuals.byAllocation[allocationKey] || 0) + proposedByAllocation[allocationKey];
    const allocationLimit = Number(allocation.allocatedAmount || 0);
    if (allocationAfter > allocationLimit) {
      return {
        error: qltdWeeklyTaskUpdatesBudgetError_(scope, 'ALLOCATION_LIMIT_EXCEEDED', 'Budget actual exceeds the allocation amount.', prepared.weeklyBudgetMeta.index, item.budgetItemCode, {
          currentAmount: Number(actuals.byAllocation[allocationKey] || 0),
          proposedAmount: proposedByAllocation[allocationKey],
          limit: allocationLimit
        })
      };
    }
    prepared.weeklyBudgetMetrics = {
      actualThisWeek: Number(actuals.byItemWeek[itemKey] && actuals.byItemWeek[itemKey].amount || 0) + contribution,
      cumulative: itemAfter,
      remaining: Math.max(0, itemLimit - itemAfter),
      approvedBudget: itemLimit,
      allocationRemaining: Math.max(0, allocationLimit - allocationAfter)
    };
  }
  return { error: null };
}

function qltdWeeklyTaskUpdatesBuildBudgetResult_(prepared, result) {
  return {
    budgetItemCode: prepared.weeklyBudgetMeta.budgetItemCode,
    requestId: prepared.requestId,
    reportId: prepared.reportId,
    duplicate: !!(result.data && result.data.duplicate),
    syncStatus: result.data && result.data.syncStatus || '',
    centralRawRowNumber: result.data && result.data.centralRawRowNumber || '',
    metrics: prepared.weeklyBudgetMetrics || {}
  };
}

function qltdWeeklyTaskUpdatesPartialWriteError_(payload, scope, stage, budgetResults, failedResult, taskSaved) {
  const failed = qltdWeeklyTaskUpdatesFirstBudgetError_(failedResult || {});
  const details = {
    stage: stage,
    requestId: String(payload && payload.requestId || '').trim(),
    reportId: failedResult && failedResult.reportId || '',
    budgetItemCode: failedResult && failedResult.budgetItemCode || '',
    taskSaved: !!taskSaved,
    budgetResults: budgetResults || [],
    failedCode: failed.code,
    failedMessage: failed.message
  };
  Logger.log(JSON.stringify(Object.assign({ action: 'weekly_taskupdates_save', code: 'PARTIAL_WRITE' }, details)));
  return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'PARTIAL_WRITE', 'Weekly save completed only partially. Review logged rows before retrying.', scope.meta, scope.warnings, details);
}

function qltdWeeklyTaskUpdatesResolveActualDateLifecycle_(payload, validation, currentItem, scope) {
  const action = 'weekly_taskupdates_save';
  const existingStart = qltdBudgetFormatDate_(currentItem && currentItem.actualStart);
  const existingFinish = qltdBudgetFormatDate_(currentItem && currentItem.actualFinish);
  const startEditRequested = qltdWeeklyTaskUpdatesActualDateEditRequested_(payload, 'actualStart');
  const finishEditRequested = qltdWeeklyTaskUpdatesActualDateEditRequested_(payload, 'actualFinish');
  const completionState = qltdWeeklyTaskUpdatesIsCompletionState_(validation);

  if (!validation.actualStart && existingStart) validation.actualStart = existingStart;
  if (!validation.actualFinish && existingFinish) validation.actualFinish = existingFinish;

  if (startEditRequested && !validation.actualStart) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACTUAL_START_REQUIRED', 'ActualStart is required when user confirms or edits the actual start date.', scope.meta, scope.warnings) };
  }
  if (qltdWeeklyTaskUpdatesIsStartedStatus_(validation.taskStatus) && !validation.actualStart) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACTUAL_START_REQUIRED', 'ActualStart is required when task status is Đang làm.', scope.meta, scope.warnings) };
  }
  if (completionState && !validation.actualFinish) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACTUAL_FINISH_REQUIRED', 'ActualFinish is required when task status is Hoàn thành.', scope.meta, scope.warnings) };
  }
  if (!completionState) {
    validation.actualFinish = '';
  }

  validation.actualStartShouldWrite = !!validation.actualStart && (!existingStart || startEditRequested);
  validation.actualFinishShouldWrite = completionState && !!validation.actualFinish && (!existingFinish || finishEditRequested);
  validation.existingActualStart = existingStart;
  validation.existingActualFinish = existingFinish;
  return { error: null };
}

function qltdWeeklyTaskUpdatesActualDateEditRequested_(payload, field) {
  const editKey = field + 'Edit';
  const modeKey = field + 'Mode';
  const editValue = String(payload && payload[editKey] || '').trim().toLowerCase();
  const modeValue = String(payload && payload[modeKey] || '').trim().toLowerCase();
  return qltdWeeklyTaskUpdatesTruthy_(payload && payload[editKey]) ||
    editValue === 'edit' || editValue === 'confirm' || editValue === 'complete' ||
    modeValue === 'edit' || modeValue === 'confirm' || modeValue === 'complete';
}

function qltdWeeklyTaskUpdatesTruthy_(value) {
  const text = String(value || '').trim().toLowerCase();
  return value === true || value === 1 || text === '1' || text === 'true' || text === 'yes';
}

function qltdWeeklyTaskUpdatesMapPbDetailStatus_(value) {
  const status = String(value || '').trim();
  const key = qltdWeeklyTaskUpdatesNormalizeStatusKey_(status);
  if (key === 'dangthuchien' || key === 'danglam') return 'Đang làm';
  if (key === 'chuabatdau') return 'Chưa bắt đầu';
  if (key === 'tamdung') return 'Tạm dừng';
  if (key === 'hoanthanh') return 'Hoàn thành';
  return status;
}

function qltdWeeklyTaskUpdatesSyncTask_(payload, validation, scope, auth, savedUpdate) {
  const updates = { status: validation.taskStatus };
  if (validation.actualStartShouldWrite) updates.actualStart = validation.actualStart;
  if (validation.actualFinishShouldWrite) updates.actualFinish = validation.actualFinish;
  if (validation.itemType === 'PB_DETAIL') {
    if (savedUpdate && savedUpdate.approvalStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING) {
      return {
        result: {
          success: true,
          approvalRequired: true,
          approvalStatus: QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING,
          skippedPbDetailSync: true
        }
      };
    }
    updates.status = qltdWeeklyTaskUpdatesMapPbDetailStatus_(validation.taskStatus);
    updates.action = 'work_updatedetailtask'; updates.email = auth.email; updates.projectCode = scope.projectCode;
    updates.deptCode = scope.deptCode; updates.detailTaskId = validation.itemId; updates.progress = validation.progressEnd;
    let result;
    try {
      result = qltdWorkUpdateDetailTask_(updates);
    } catch (error) {
      result = {
        success: false,
        code: 'PB_DETAIL_SYNC_EXCEPTION',
        message: qltdBudgetSafeErrorMessage_(error)
      };
      Logger.log(JSON.stringify({
        action: 'weekly_taskupdates_save',
        code: 'PB_DETAIL_SYNC_EXCEPTION',
        detailTaskId: validation.itemId,
        message: result.message
      }));
    }
    return result && result.success ? { result: result } : {
      result: result,
      warning: qltdWorkWarning_('TASK_SYNC_PARTIAL', 'Weekly update was saved but PB_DETAIL sync failed.', {
        detailTaskId: validation.itemId,
        syncCode: result && (result.code || result.error && result.error.code) || '',
        syncMessage: result && (result.message || result.error && result.error.message) || ''
      })
    };
  }
  if (qltdWeeklyTaskUpdatesIsCompletionProposal_(validation)) {
    return {
      result: {
        success: true,
        approvalRequired: true,
        approvalStatus: QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING,
        skippedMasterSync: true,
        message: 'MASTER completion proposal saved for Admin approval. Cong_viec was not updated.'
      },
      masterWriteback: {
        applied: false,
        approvalStatus: QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING,
        reason: 'APPROVAL_REQUIRED'
      },
      warning: qltdWorkWarning_('MASTER_COMPLETION_APPROVAL_PENDING', 'MASTER completion proposal saved; Admin/PMO approval is required before Cong_viec completion writeback.')
    };
  }
  const detailContext = qltdPbDetailBuildSheetContext_('weekly_taskupdates_save', Object.assign({}, scope, { meta: scope.meta }));
  let sourceSyncResult;
  let sourceSyncWarning = null;
  if (!detailContext.error && detailContext.dataRows.some(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL && row.masterTaskCode === validation.itemId; })) {
    sourceSyncResult = { success: true, progressReadonly: true };
    sourceSyncWarning = qltdWorkWarning_('MASTER_PROGRESS_READONLY', 'MASTER has PB_DETAIL; department-sheet progress remains derived from PB_DETAIL.');
  } else {
    updates.action = 'work_updatetask'; updates.email = auth.email; updates.projectCode = scope.projectCode;
    updates.deptCode = scope.deptCode; updates.masterTaskCode = validation.itemId; updates.progress = validation.progressEnd;
    sourceSyncResult = qltdWorkUpdateTask_(updates);
    if (!sourceSyncResult || !sourceSyncResult.success) {
      sourceSyncWarning = qltdWorkWarning_('TASK_SYNC_PARTIAL', 'Weekly update was saved but department-sheet MASTER sync was not completed.');
    }
  }

  const masterWriteback = qltdWeeklyMasterProgressWriteback_(savedUpdate || {
    updateId: '',
    projectCode: scope.projectCode,
    itemId: validation.itemId,
    taskStatus: validation.taskStatus,
    progressEnd: validation.progressEnd,
    actualStart: validation.actualStart,
    actualFinish: validation.actualFinish,
    thisWeekResult: validation.thisWeekResult,
    issue: validation.issue,
    recommendation: validation.recommendation,
    updatedBy: auth.email
  }, auth, String(payload && payload.requestId || '').trim(), scope.meta);
  if (!masterWriteback.success) {
    return {
      result: sourceSyncResult,
      masterWriteback: masterWriteback,
      warning: qltdWorkWarning_('MASTER_WRITEBACK_PARTIAL', 'Weekly update was saved but Cong_viec writeback failed.', {
        code: masterWriteback.code || masterWriteback.error && masterWriteback.error.code || ''
      })
    };
  }
  return {
    result: sourceSyncResult,
    masterWriteback: masterWriteback,
    warning: sourceSyncWarning
  };
}

function qltdWeeklyTaskUpdatesFindCurrentItem_(itemType, itemId, scope, action) {
  if (itemType === 'PB_DETAIL') {
    const detailContext = qltdPbDetailBuildSheetContext_(action, Object.assign({}, scope, { meta: scope.meta }));
    if (detailContext.error) return null;
    const row = detailContext.dataRows.find(function(candidate) {
      return candidate.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL && candidate.detailTaskId === itemId;
    });
    return row ? qltdPbDetailBuildDetailDto_(row, detailContext.columns) : null;
  }
  const context = qltdWorkBuildDeptContext_(scope.project, scope.dept, scope.requestedDeptCode, scope.warnings);
  const target = qltdWorkReadTaskTarget_(context, itemId, action);
  if (target.error) return null;
  const official = qltdWeeklyTaskUpdatesReadOfficialMasters_(scope, [target.task], action);
  return official.error || !official.tasks.length ? target.task : official.tasks[0];
}

function qltdWeeklyTaskUpdatesReporterOwnsItem_(item, email, deptCode) {
  const owner = String(item && (item.owner || item.ownerText) || '').trim();
  if (!owner) return false;
  const resolution = qltdWorkResolveAssignees_(owner, deptCode);
  return !!resolution.ok && resolution.users.length === 1 && qltdWorkUserMatchesAssignees_(email, resolution);
}

function qltdWeeklyTaskUpdatesValidateReporterOwnership_(item, auth, scope, action) {
  if (!item) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PB_DETAIL_NOT_FOUND', 'PB_DETAIL task not found.', scope.meta, scope.warnings) };
  }
  if (!qltdWeeklyTaskUpdatesReporterOwnsItem_(item, auth.email, scope.deptCode)) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PB_DETAIL_NOT_ASSIGNED', 'Reporter is not the primary owner of this PB_DETAIL task.', scope.meta, scope.warnings) };
  }
  return { error: null };
}

function qltdWeeklyTaskUpdatesRead_() {
  const sheet = getCurrentSpreadsheet_().getSheetByName(QLTD_WEEKLY_TASK_UPDATE_SHEET);
  if (!sheet) return { error: { code: 'WEEKLY_TASK_UPDATES_NOT_READY', message: 'WEEKLY_TASK_UPDATES has not been set up.' } };
  const inspection = qltdWeeklyTaskUpdatesInspectSheet_(sheet);
  if (!inspection.headerMatches) return { error: { code: 'WEEKLY_TASK_UPDATES_HEADER_MISMATCH', message: 'WEEKLY_TASK_UPDATES headers do not match.' } };
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length).getValues() : [];
  return { sheet: sheet, updates: rows.map(function(row, index) {
    const object = {}; QLTD_WEEKLY_TASK_UPDATE_HEADERS.forEach(function(header, column) { object[header] = row[column]; });
    return qltdWeeklyTaskUpdatesNormalize_(object, index + 2);
  }).filter(function(update) { return !!update.updateId; }), error: null };
}

function qltdWeeklyMasterProgressWriteback_(update, auth, requestId, meta) {
  const action = 'weekly_master_progress_writeback';
  const stageMeta = Object.assign({
    projectCode: update.projectCode,
    itemId: update.itemId,
    updateId: update.updateId || '',
    requestId: requestId || ''
  }, meta || {});
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return { success: false, applied: false, code: 'WRITE_LOCK_TIMEOUT', message: 'Cannot acquire Master progress writeback lock.' };
    }
    const project = qltdProjectsGetByCode_(update.projectCode);
    if (!project || !project.masterSpreadsheetId) {
      return { success: false, applied: false, code: 'MASTER_PROJECT_CONFIG_MISSING', message: 'Project MasterSpreadsheetId is missing.' };
    }
    const spreadsheet = SpreadsheetApp.openById(project.masterSpreadsheetId);
    const sheetName = String(project.defaultTaskSheet || 'Cong_viec').trim() || 'Cong_viec';
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.getSheetByName('Cong_viec');
    if (!sheet) return { success: false, applied: false, code: 'CONG_VIEC_SHEET_NOT_FOUND', message: 'Cannot find Cong_viec in Master spreadsheet.' };
    const parseResult = qltdWorkParseDeptTaskSheet_(sheet);
    if (parseResult.error) {
      return {
        success: false,
        applied: false,
        code: parseResult.error.code,
        message: parseResult.error.message
      };
    }
    const targetLookup = qltdWeeklyTaskUpdatesFindSingleMasterTask_(parseResult.tasks, update.itemId);
    if (targetLookup.error) return Object.assign({
      success: false,
      applied: false,
      status: 'ERROR',
      projectCode: update.projectCode,
      masterTaskCode: update.itemId
    }, targetLookup.error);
    const task = targetLookup.task;
    const targetResult = {
      task: task,
      sheet: sheet,
      parsed: parseResult.parsed,
      headerRow: parseResult.headerRow,
      sourceSheet: sheet.getName(),
      warnings: parseResult.warnings || []
    };
    const changes = [];
    changes.push(qltdWorkSetTaskCell_(targetResult, QLTD_WORK_TASK_UPDATE_HEADERS.status, update.taskStatus));
    if (update.actualStart) changes.push(qltdWorkSetTaskCell_(targetResult, QLTD_WORK_TASK_UPDATE_HEADERS.actualStart, update.actualStart));
    if (qltdBudgetFindHeaderIndex_(targetResult.parsed.headerMap, QLTD_WORK_TASK_UPDATE_HEADERS.progress) >= 0) {
      changes.push(qltdWorkSetTaskCell_(targetResult, QLTD_WORK_TASK_UPDATE_HEADERS.progress, Number(update.progressEnd || 0)));
    } else {
      targetResult.warnings.push(qltdWorkWarning_('MASTER_PROGRESS_HEADER_MISSING', 'MASTER progress header is missing; progress was not synced.'));
    }

    const idempotencyKey = String(requestId || update.updateId || '').trim();
    const marker = idempotencyKey ? '[WeeklyRequest:' + idempotencyKey + ']' : '';
    const previousNote = String(task.updateNote || '');
    const duplicateNote = !!marker && previousNote.indexOf(marker) !== -1;
    if (!duplicateNote) {
      const noteParts = [
        marker,
        'Kết quả tuần: ' + String(update.thisWeekResult || '').trim(),
        update.issue ? 'Vướng mắc: ' + String(update.issue).trim() : '',
        update.recommendation ? 'Kiến nghị: ' + String(update.recommendation).trim() : ''
      ].filter(function(value) { return !!value; });
      const nextNote = qltdWorkAppendTaskNote_(previousNote, noteParts.join(' | '), auth.email);
      if (nextNote !== previousNote) {
        changes.push(qltdWorkSetTaskCell_(targetResult, QLTD_WORK_TASK_UPDATE_HEADERS.updateNote, nextNote));
      }
    }

    Logger.log(JSON.stringify(Object.assign({}, stageMeta, {
      action: action,
      applied: true,
      duplicateNote: duplicateNote,
      changeCount: changes.length
    })));
    const cacheResult = qltdWeeklyTaskUpdatesInvalidateGanttCache_(update.projectCode);
    if (!cacheResult.success) targetResult.warnings.push(qltdWorkWarning_(cacheResult.code || 'GANTT_CACHE_INVALIDATE_FAILED',
      'Master was updated, but Gantt cache could not be invalidated automatically.', {
        projectCode: update.projectCode,
        message: cacheResult.message || ''
      }));
    return {
      success: true,
      applied: true,
      status: 'UPDATED',
      idempotent: true,
      duplicateNote: duplicateNote,
      projectCode: update.projectCode,
      masterTaskCode: update.itemId,
      sourceSheet: sheet.getName(),
      rowNumber: task.rowNumber,
      changes: changes,
      ganttCacheInvalidated: cacheResult.success,
      ganttRefreshRequired: true,
      dashboardRefreshRequired: true,
      message: cacheResult.success
        ? 'Master task was updated in Cong_viec and Gantt cache was invalidated.'
        : 'Master task was updated in Cong_viec, but Gantt cache could not be invalidated automatically.',
      warnings: targetResult.warnings
    };
  } catch (error) {
    Logger.log(JSON.stringify(Object.assign({}, stageMeta, {
      action: action,
      applied: false,
      message: qltdBudgetSafeErrorMessage_(error)
    })));
    return {
      success: false,
      applied: false,
      status: 'ERROR',
      code: 'MASTER_WRITEBACK_FAILED',
      errorCode: 'MASTER_WRITEBACK_FAILED',
      message: qltdBudgetSafeErrorMessage_(error)
    };
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdWeeklyMasterApprovalApplyToMaster_(target, auth, impactMode, recoveryPlan, reviewedAt, action, meta) {
  const stageMeta = Object.assign({ projectCode: target.projectCode, itemId: target.itemId }, meta || {});
  try {
    const project = qltdProjectsGetByCode_(target.projectCode);
    if (!project) {
      return { error: qltdWeeklyMasterApprovalError_(action, 'PROJECT_NOT_FOUND', 'Project not found for MASTER approval sync.', 'MASTER_OPEN', stageMeta) };
    }
    if (!project.masterSpreadsheetId) {
      return { error: qltdWeeklyMasterApprovalError_(action, 'MASTER_SPREADSHEET_ID_MISSING', 'Project has no MasterSpreadsheetId.', 'MASTER_OPEN', stageMeta) };
    }
    const spreadsheet = SpreadsheetApp.openById(project.masterSpreadsheetId);
    const sheet = spreadsheet.getSheetByName('Cong_viec');
    if (!sheet) {
      return { error: qltdWeeklyMasterApprovalError_(action, 'CONG_VIEC_SHEET_NOT_FOUND', 'Cannot find Cong_viec in Master spreadsheet.', 'MASTER_OPEN', stageMeta) };
    }

    const parseResult = qltdWeeklyMasterParseCongViec_(sheet);
    if (parseResult.error) {
      return { error: qltdWeeklyMasterApprovalError_(action, parseResult.error.code, parseResult.error.message, 'MASTER_PARSE', Object.assign({ sourceSheet: sheet.getName() }, stageMeta), [], parseResult.error.extra || {}) };
    }
    const targetLookup = qltdWeeklyTaskUpdatesFindSingleMasterTask_(parseResult.tasks, target.itemId);
    if (targetLookup.error) {
      return { error: qltdWeeklyMasterApprovalError_(action, targetLookup.error.code, targetLookup.error.message, 'MASTER_LOOKUP', Object.assign({ sourceSheet: sheet.getName() }, stageMeta), [], {
        masterWriteback: qltdWeeklyTaskUpdatesBuildMasterWritebackResponse_(targetLookup.error, target)
      }) };
    }

    const task = targetLookup.task;
    const writeRange = sheet.getRange(task.rowNumber, parseResult.columns.status + 1, 1, 6);
    const previousValues = writeRange.getValues()[0];
    const previousNote = String(previousValues[3] || '');
    const approvalMarker = qltdWeeklyMasterApprovalMarker_(target.updateId);
    const duplicateApprovalNote = !!approvalMarker && previousNote.indexOf(approvalMarker) !== -1;
    const actualStart = qltdWeeklyTaskUpdatesDate_(target.actualStart, true) || previousValues[1];
    const actualFinish = qltdWeeklyTaskUpdatesDate_(target.actualFinish, true);
    if (!actualFinish) {
      return { error: qltdWeeklyMasterApprovalError_(action, 'MASTER_ACTUAL_FINISH_REQUIRED', 'Approved MASTER completion requires a valid ActualFinish.', 'VALIDATION', stageMeta) };
    }
    const impactValue = impactMode === QLTD_WEEKLY_MASTER_IMPACT_MODE.PROPAGATE_ACTUAL ? 'Có' : 'Không';
    const note = qltdWeeklyMasterApprovalBuildUpdateNote_(target, auth, impactMode, recoveryPlan, reviewedAt);
    const nextNote = duplicateApprovalNote ? previousNote : qltdWorkAppendTaskNote_(previousNote, note, auth.email);
    const nextValues = ['Hoàn thành', actualStart, actualFinish, nextNote, reviewedAt, impactValue];

    writeRange.setValues([nextValues]);
    SpreadsheetApp.flush();

    const verifiedValues = writeRange.getValues()[0];
    const verifiedStatus = String(verifiedValues[0] || '').trim();
    const verifiedFinish = qltdBudgetFormatDate_(verifiedValues[2]);
    const verifiedImpact = String(verifiedValues[5] || '').trim();
    if (verifiedStatus !== 'Hoàn thành' || verifiedFinish !== actualFinish || verifiedImpact !== impactValue) {
      return { error: qltdWeeklyMasterApprovalError_(action, 'MASTER_VERIFY_FAILED', 'Master writeback verification failed for R, T or W.', 'MASTER_VERIFY', Object.assign({
        expected: { status: 'Hoàn thành', actualFinish: actualFinish, impactValue: impactValue },
        actual: { status: verifiedStatus, actualFinish: verifiedFinish, impactValue: verifiedImpact }
      }, stageMeta)) };
    }

    const warnings = parseResult.warnings || [];
    const cacheResult = qltdWeeklyTaskUpdatesInvalidateGanttCache_(target.projectCode);
    if (!cacheResult.success) warnings.push(qltdWorkWarning_(cacheResult.code || 'GANTT_CACHE_INVALIDATE_FAILED',
      'Master was approved, but Gantt cache invalidation could not be confirmed.', {
        projectCode: target.projectCode,
        message: cacheResult.message || ''
      }));
    const dirtyState = qltdScheduleMarkProjectDirty_(
      target.projectCode,
      'WEEKLY_MASTER_APPROVED',
      auth.email,
      {
        updateId: target.updateId || '',
        masterTaskCode: target.itemId || '',
        impactMode: impactMode
      }
    );
    return {
      success: true,
      stage: 'DONE',
      status: 'UPDATED',
      projectCode: target.projectCode,
      masterTaskCode: target.itemId,
      sourceSheet: sheet.getName(),
      rowNumber: task.rowNumber,
      congViecUpdated: true,
      columnWUpdated: true,
      dependencyDecision: impactMode,
      impactMode: impactMode,
      recoveryPlanSaved: false,
      duplicateApprovalNote: duplicateApprovalNote,
      recalcTriggered: false,
      ganttCacheInvalidated: cacheResult.success,
      ganttRefreshRequired: false,
      dashboardRefreshRequired: false,
      projectDirty: dirtyState.scheduleState === QLTD_PROJECT_SCHEDULE_STATE_V1.DIRTY,
      scheduleState: dirtyState.scheduleState,
      scheduleMarkedAt: dirtyState.markedAt,
      scheduleRecalculationRequired: true,
      message: cacheResult.success
        ? 'Master completion was approved in Cong_viec. Project schedule must be recalculated.'
        : 'Master completion was approved in Cong_viec. Project schedule must be recalculated; Gantt cache invalidation was not confirmed.',
      changes: {
        rangeA1: writeRange.getA1Notation ? writeRange.getA1Notation() : '',
        before: previousValues,
        after: nextValues
      },
      warnings: warnings
    };
  } catch (error) {
    Logger.log(JSON.stringify(Object.assign({}, stageMeta, { stage: 'MASTER_WRITE', message: qltdBudgetSafeErrorMessage_(error) })));
    return { error: qltdWeeklyMasterApprovalError_(action, 'MASTER_SYNC_FAILED', qltdBudgetSafeErrorMessage_(error), 'MASTER_WRITE', stageMeta) };
  }
}

function qltdWeeklyMasterParseCongViec_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    return { tasks: [], warnings: [], error: { code: 'MASTER_HEADER_NOT_FOUND', message: 'Cong_viec is empty.' } };
  }

  const scanRows = Math.min(lastRow, QLTD_WEEKLY_MASTER_HEADER_SCAN_ROWS);
  const headerValues = sheet.getRange(1, 1, scanRows, lastColumn).getValues();
  let detected = null;
  for (let rowIndex = 0; rowIndex < headerValues.length; rowIndex += 1) {
    const headers = headerValues[rowIndex].map(function(value) { return String(value || '').trim(); });
    const headerMap = qltdBudgetBuildHeaderMap_(headers);
    if (qltdBudgetFindHeaderIndex_(headerMap, QLTD_WEEKLY_MASTER_UPDATE_HEADERS.taskCode) >= 0 &&
        qltdBudgetFindHeaderIndex_(headerMap, QLTD_WEEKLY_MASTER_UPDATE_HEADERS.status) >= 0) {
      detected = { headerRow: rowIndex + 1, headerMap: headerMap };
      break;
    }
  }
  if (!detected) {
    return { tasks: [], warnings: [], error: { code: 'MASTER_HEADER_NOT_FOUND', message: 'Cannot detect Cong_viec header row with Ma cong viec.' } };
  }

  const columns = {};
  Object.keys(QLTD_WEEKLY_MASTER_UPDATE_HEADERS).forEach(function(key) {
    columns[key] = qltdBudgetFindHeaderIndex_(detected.headerMap, QLTD_WEEKLY_MASTER_UPDATE_HEADERS[key]);
  });
  const missingHeaders = Object.keys(columns).filter(function(key) { return columns[key] < 0; });
  if (missingHeaders.length) {
    return { tasks: [], warnings: [], error: {
      code: 'MASTER_REQUIRED_HEADER_MISSING',
      message: 'Cong_viec is missing required Master writeback headers.',
      extra: { missingHeaders: missingHeaders.map(function(key) { return QLTD_WEEKLY_MASTER_UPDATE_HEADERS[key]; }) }
    } };
  }
  const writeColumns = [columns.status, columns.actualStart, columns.actualFinish, columns.updateNote, columns.updatedAt, columns.impactMode];
  if (!writeColumns.every(function(column, index) { return column === columns.status + index; })) {
    return { tasks: [], warnings: [], error: { code: 'MASTER_WRITE_RANGE_INVALID', message: 'Master columns R:W must be contiguous and in the expected order.' } };
  }

  const values = lastRow > detected.headerRow
    ? sheet.getRange(detected.headerRow + 1, 1, lastRow - detected.headerRow, lastColumn).getValues()
    : [];
  const tasks = values.map(function(row, index) {
    const masterTaskCode = qltdWeeklyTaskUpdatesNormalizeTaskCode_(row[columns.taskCode]);
    return masterTaskCode ? { masterTaskCode: masterTaskCode, rowNumber: detected.headerRow + index + 1, raw: row } : null;
  }).filter(function(task) { return !!task; });

  return { tasks: tasks, headerRow: detected.headerRow, headerMap: detected.headerMap, columns: columns, warnings: [], error: null };
}

function qltdWeeklyTaskUpdatesFindSingleMasterTask_(tasks, masterTaskCode) {
  const target = qltdWeeklyTaskUpdatesNormalizeTaskCode_(masterTaskCode);
  const matches = (tasks || []).filter(function(task) {
    return qltdWeeklyTaskUpdatesNormalizeTaskCode_(task && task.masterTaskCode) === target;
  });
  if (!matches.length) {
    return {
      error: {
        code: 'MASTER_TASK_NOT_FOUND',
        errorCode: 'MASTER_TASK_NOT_FOUND',
        message: 'Cannot find MASTER task in Cong_viec by masterTaskCode.'
      }
    };
  }
  if (matches.length > 1) {
    return {
      error: {
        code: 'MASTER_TASK_DUPLICATED',
        errorCode: 'MASTER_TASK_DUPLICATED',
        message: 'More than one MASTER task was found in Cong_viec by masterTaskCode.'
      }
    };
  }
  const task = matches[0];
  const rowType = String(task.rowType || '').trim().toUpperCase();
  const allowed = !rowType || ['MASTER', 'TASK', 'MILESTONE', 'SCHEDULED_GROUP'].indexOf(rowType) !== -1;
  if (!allowed) {
    return {
      error: {
        code: 'INVALID_MASTER_TASK_TYPE',
        errorCode: 'INVALID_MASTER_TASK_TYPE',
        message: 'Matched row is not an allowed MASTER task row type.',
        rowType: rowType
      }
    };
  }
  return { task: task, error: null };
}

function qltdWeeklyTaskUpdatesInvalidateGanttCache_(projectCode) {
  if (typeof qltdGanttInvalidateCache_ !== 'function') {
    return { success: false, code: 'GANTT_INVALIDATE_UNAVAILABLE' };
  }
  try {
    const result = qltdGanttInvalidateCache_(projectCode);
    if (result && result.success === true) return { success: true };
    if (result && result.success === false) {
      return { success: false, code: result.code || 'GANTT_INVALIDATE_FAILED', message: result.message || '' };
    }
    return {
      success: false,
      code: 'GANTT_INVALIDATE_UNVERIFIED',
      message: 'Gantt cache helper did not confirm invalidation.'
    };
  } catch (error) {
    Logger.log(JSON.stringify({
      action: 'weekly_gantt_cache_invalidate',
      projectCode: projectCode,
      message: qltdBudgetSafeErrorMessage_(error)
    }));
    return { success: false, code: 'GANTT_INVALIDATE_FAILED', message: qltdBudgetSafeErrorMessage_(error) };
  }
}

function qltdWeeklyMasterApprovalError_(action, code, message, stage, meta, warnings, extra) {
  const response = qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, code, message, Object.assign({}, meta || {}, {
    stage: stage
  }), warnings || [], extra || {});
  response.ok = false;
  response.errorCode = code;
  response.stage = stage;
  response.message = message || code;
  if (warnings && warnings.length) response.warning = warnings[0];
  return response;
}

function qltdWeeklyMasterApprovalDecorateError_(response, stage) {
  const result = response || {};
  const detail = result.errors && result.errors[0] || result.error || {};
  result.ok = false;
  result.errorCode = detail.code || result.errorCode || result.code || 'UNKNOWN_ERROR';
  result.stage = stage;
  result.message = detail.message || result.message || result.errorCode;
  result.meta = Object.assign({}, result.meta || {}, { stage: stage });
  if (result.warnings && result.warnings.length) result.warning = result.warnings[0];
  return result;
}

function qltdWeeklyTaskUpdatesBuildMasterWritebackResponse_(result, fallback) {
  const source = result || {};
  return {
    status: source.status || (source.success ? 'UPDATED' : (source.applied === false ? 'SKIPPED' : 'UNKNOWN')),
    projectCode: source.projectCode || fallback && fallback.projectCode || '',
    masterTaskCode: source.masterTaskCode || fallback && fallback.itemId || '',
    errorCode: source.errorCode || source.code || '',
    message: source.message || '',
    applied: !!source.applied || !!source.congViecUpdated,
    ganttCacheInvalidated: !!source.ganttCacheInvalidated,
    forceRefreshRecommended: !!(source.success && source.ganttCacheInvalidated === false)
  };
}

function qltdWeeklyMasterApprovalBuildUpdateNote_(target, auth, dependencyDecision, recoveryPlan, reviewedAt) {
  const marker = qltdWeeklyMasterApprovalMarker_(target && target.updateId);
  const lines = [
    marker,
    'Weekly MASTER approval',
    'Nguoi bao cao: ' + (target.updatedBy || ''),
    'Nguoi duyet: ' + (auth.email || ''),
    'Thoi diem duyet: ' + (reviewedAt || ''),
    'Quyet dinh lien ket: ' + dependencyDecision
  ];
  if (target.thisWeekResult) lines.push('Ket qua tuan: ' + target.thisWeekResult);
  if (target.issue) lines.push('Vuong mac: ' + target.issue);
  if (target.recommendation) lines.push('Kien nghi: ' + target.recommendation);
  if (recoveryPlan) lines.push('Bien phap bu tien do: ' + recoveryPlan);
  return lines.join(' | ');
}

function qltdWeeklyMasterApprovalMarker_(updateId) {
  const value = String(updateId || '').trim();
  return value ? '[WeeklyApproval:' + value + ']' : '';
}

function qltdWeeklyTaskUpdatesInspectSheet_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const width = Math.max(lastColumn, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(function(value) { return String(value || '').trim(); });
  const baseMismatches = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.map(function(expected, index) {
    return current[index] === expected ? null : { column: index + 1, expected: expected, actual: current[index] };
  }).filter(Boolean);
  const approvalMismatches = QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.map(function(expected, index) {
    const column = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + index;
    return current[column] === expected ? null : { column: column + 1, expected: expected, actual: current[column] };
  }).filter(Boolean);
  const decisionMismatches = QLTD_WEEKLY_TASK_UPDATE_DECISION_HEADERS.map(function(expected, index) {
    const column = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.length + index;
    return current[column] === expected ? null : { column: column + 1, expected: expected, actual: current[column] };
  }).filter(Boolean);
  const extraHeaders = current.slice(QLTD_WEEKLY_TASK_UPDATE_HEADERS.length).filter(function(value) { return !!value; });
  const approvalHeadersPresent = !approvalMismatches.length && lastColumn >= QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.length;
  const legacyApprovalHeadersPresent = !approvalMismatches.length && lastColumn === QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.length;
  const decisionHeadersPresent = !decisionMismatches.length && lastColumn >= QLTD_WEEKLY_TASK_UPDATE_HEADERS.length;
  const headerMatches = !baseMismatches.length && approvalHeadersPresent && decisionHeadersPresent && !extraHeaders.length && lastColumn === QLTD_WEEKLY_TASK_UPDATE_HEADERS.length;
  const baseOnlyHeaderMatches = !baseMismatches.length && lastColumn === QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length &&
    !QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.some(function(header) { return current.indexOf(header) !== -1; });
  const legacyHeaderMatches = !baseMismatches.length && legacyApprovalHeadersPresent &&
    !QLTD_WEEKLY_TASK_UPDATE_DECISION_HEADERS.some(function(header) { return current.indexOf(header) !== -1; });
  const appendHeaders = baseOnlyHeaderMatches ? QLTD_WEEKLY_TASK_UPDATE_REVIEW_HEADERS.slice() :
    (legacyHeaderMatches ? QLTD_WEEKLY_TASK_UPDATE_DECISION_HEADERS.slice() : []);
  return {
    headerMatches: headerMatches,
    canAppendApprovalColumns: baseOnlyHeaderMatches || legacyHeaderMatches,
    approvalHeadersPresent: approvalHeadersPresent,
    decisionHeadersPresent: decisionHeadersPresent,
    appendHeaders: appendHeaders,
    impact: baseOnlyHeaderMatches ? 'APPEND_APPROVAL_AND_DECISION_COLUMNS' :
      (legacyHeaderMatches ? 'APPEND_DECISION_COLUMNS_ONLY' : (headerMatches ? 'NO_CHANGE' : 'STOP_HEADER_MISMATCH')),
    mismatches: headerMatches || baseOnlyHeaderMatches || legacyHeaderMatches ? [] : baseMismatches.concat(approvalMismatches).concat(decisionMismatches)
  };
}

function qltdWeeklyTaskUpdatesNormalize_(object, rowNumber) {
  const update = {
    updateId: String(object.UpdateId || '').trim(), projectCode: qltdWorkNormalizeCode_(object.ProjectCode), deptCode: qltdWorkNormalizeCode_(object.DeptCode),
    weekCode: qltdWorkNormalizeWeekCode_(object.WeekCode), itemType: qltdWeeklyTaskUpdatesNormalizeType_(object.ItemType), itemId: String(object.ItemId || '').trim(),
    thisWeekResult: String(object.ThisWeekResult || ''), progressEnd: Number(object.ProgressEnd || 0), taskStatus: String(object.TaskStatus || ''),
    actualStart: qltdBudgetFormatDate_(object.ActualStart), actualFinish: qltdBudgetFormatDate_(object.ActualFinish), issue: String(object.Issue || ''),
    recommendation: String(object.Recommendation || ''), budgetThisWeek: qltdBudgetToNumber_(object.BudgetThisWeek), budgetNote: String(object.BudgetNote || ''),
    updatedBy: qltdWorkNormalizeEmail_(object.UpdatedBy), updatedAt: qltdWeeklyCellText_(object.UpdatedAt),
    approvalStatus: qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(object.ApprovalStatus),
    reviewReason: String(object.ReviewReason || ''),
    reviewedBy: qltdWorkNormalizeEmail_(object.ReviewedBy),
    reviewedAt: qltdWeeklyCellText_(object.ReviewedAt),
    dependencyDecision: qltdWeeklyTaskUpdatesNormalizeDependencyDecision_(object.DependencyDecision),
    recoveryPlan: String(object.RecoveryPlan || ''),
    rowNumber: rowNumber
  };
  update.key = qltdWeeklyTaskUpdatesBuildKey_(update.projectCode, update.deptCode, update.weekCode, update.itemType, update.itemId);
  return update;
}

function qltdWeeklyTaskUpdatesBuildItem_(type, id, source, weekStart, weekEnd, search, hasDetails) {
  const progress = Number(source.progress || 0); const planStart = qltdBudgetFormatDate_(source.planStart); const planFinish = qltdBudgetFormatDate_(source.planFinish);
  const actualStart = qltdBudgetFormatDate_(source.actualStart); const actualFinish = qltdBudgetFormatDate_(source.actualFinish);
  const ownZone = String(source.ownZone || '').trim(); const ownHangMuc = String(source.ownHangMuc || '').trim();
  const text = [source.wbs, source.taskName, ownZone, ownHangMuc, id].join(' ').toLowerCase(); const query = String(search || '').trim().toLowerCase();
  const officialComplete = qltdWeeklyTaskUpdatesIsOfficialComplete_(source);
  let reason = '';
  if (officialComplete && actualFinish && actualFinish >= weekStart && actualFinish <= weekEnd) reason = 'COMPLETED_THIS_WEEK';
  else if (!officialComplete && planFinish && planFinish < weekStart) reason = 'OVERDUE';
  else if (!officialComplete && actualStart) reason = 'IN_PROGRESS';
  else if (!officialComplete && planStart && planStart <= weekEnd) reason = 'PLANNED';
  else if (query && text.indexOf(query) !== -1 && !planStart && !planFinish) reason = 'UNSCHEDULED';
  if (query && text.indexOf(query) === -1) reason = '';
  return {
    itemType: type, itemId: id, masterTaskCode: type === 'MASTER' ? id : source.masterTaskCode,
    detailTaskId: type === 'PB_DETAIL' ? id : '', parentMasterTaskCode: type === 'PB_DETAIL' ? source.masterTaskCode : '',
    wbs: source.wbs || '', taskName: source.taskName || '', ownZone: ownZone, ownHangMuc: ownHangMuc, zone: ownZone, hangMuc: ownHangMuc, planStart: planStart, planFinish: planFinish,
    actualStart: actualStart, actualFinish: actualFinish, progress: officialComplete ? Math.max(progress, 100) : progress, status: officialComplete ? 'Hoàn thành' : (source.status || ''),
    owner: source.owner || source.ownerText || '', coordinator: source.coordinator || source.coordinatorText || '', plannedBudget: Number(source.budgetPlan || source.plannedBudget || 0),
    actualBudget: Number(source.budgetActual || source.actualBudget || 0), hasBudget: (source.taskLinkedBudgetItems || []).length > 0 || Number(source.budgetPlan || source.plannedBudget || 0) > 0 || Number(source.budgetActual || source.actualBudget || 0) > 0,
    taskLinkedBudgetItems: (source.taskLinkedBudgetItems || []).slice(),
    taskLinkedBudgetThisWeek: Number(source.taskLinkedBudgetThisWeek || 0),
    taskLinkedBudgetCumulative: Number(source.taskLinkedBudgetCumulative || 0),
    budgetItemCode: source.budgetItemCode || '',
    budgetItemName: source.budgetItemName || '',
    budgetType: source.budgetType || '',
    budgetGroup: source.budgetGroup || '',
    budgetStage: source.budgetStage || '',
    budgetFlowType: qltdWeeklyTaskUpdatesResolveCashFlowType_(source),
    hasDetails: !!hasDetails, progressReadonly: type === 'MASTER' && !!hasDetails, officialComplete: !!officialComplete,
    sourceMappingUnique: source.sourceMappingUnique === true,
    sourceRowType: String(source.sourceRowType || '').trim().toUpperCase(),
    eligibleReason: reason, eligible: !!reason
  };
}

function qltdWeeklyTaskUpdatesSortItems_(a, b) {
  const order = { OVERDUE: 1, IN_PROGRESS: 2, PLANNED: 3, COMPLETED_THIS_WEEK: 4, UNSCHEDULED: 5 };
  return (order[a.eligibleReason] || 9) - (order[b.eligibleReason] || 9) || String(a.planFinish || '9999').localeCompare(String(b.planFinish || '9999')) || String(a.wbs || '').localeCompare(String(b.wbs || ''), 'vi', { numeric: true });
}

function qltdWeeklyTaskUpdatesNormalizeType_(value) { const type = String(value || '').trim().toUpperCase(); return type === 'MASTER' || type === 'PB_DETAIL' ? type : ''; }
function qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(value) {
  const status = String(value || '').trim().toUpperCase();
  return status === QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING ||
    status === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED ||
    status === QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED ? status : '';
}
function qltdWeeklyTaskUpdatesNormalizeImpactMode_(value) {
  const mode = String(value || '').trim().toUpperCase();
  return mode === QLTD_WEEKLY_MASTER_IMPACT_MODE.KEEP_PLAN ||
    mode === QLTD_WEEKLY_MASTER_IMPACT_MODE.PROPAGATE_ACTUAL ? mode : '';
}
function qltdWeeklyTaskUpdatesNormalizeDependencyDecision_(value) {
  return qltdWeeklyTaskUpdatesNormalizeImpactMode_(value);
}
function qltdWeeklyTaskUpdatesNormalizeTaskCode_(value) {
  return String(value || '').trim().toUpperCase();
}
function qltdWeeklyTaskUpdatesNormalizeStatusKey_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function qltdWeeklyTaskUpdatesCanonicalTaskStatus_(value) {
  const status = String(value || '').trim();
  const key = qltdWeeklyTaskUpdatesNormalizeStatusKey_(status);
  if (key === 'chuabatdau') return 'Chưa bắt đầu';
  if (key === 'danglam' || key === 'dangthuchien') return 'Đang làm';
  if (key === 'tamdung') return 'Tạm dừng';
  if (key === 'hoanthanh' || key === 'complete' || key === 'done') return 'Hoàn thành';
  return status;
}
function qltdWeeklyTaskUpdatesStatusWorkflowKey_(value) {
  const key = qltdWeeklyTaskUpdatesNormalizeStatusKey_(value);
  if (key === 'dangthuchien') return 'danglam';
  if (key === 'complete' || key === 'done') return 'hoanthanh';
  if (key === 'chuabatdau' || key === 'danglam' || key === 'tamdung' || key === 'hoanthanh') return key;
  return '';
}
function qltdWeeklyTaskUpdatesIsStartedStatus_(value) {
  return qltdWeeklyTaskUpdatesStatusWorkflowKey_(value) === 'danglam';
}
function qltdWeeklyTaskUpdatesValidateMasterStatusTransition_(validation, currentItem, auth, scope) {
  const action = 'weekly_taskupdates_save';
  if (!validation || validation.itemType !== 'MASTER') return { error: null };
  const nextKey = qltdWeeklyTaskUpdatesStatusWorkflowKey_(validation.taskStatus);
  if (!nextKey) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'INVALID_MASTER_STATUS', 'MASTER status must be one of Chưa bắt đầu, Đang làm, Tạm dừng, Hoàn thành.', scope.meta, scope.warnings) };
  }
  const currentKey = qltdWeeklyTaskUpdatesStatusWorkflowKey_(currentItem && (currentItem.status || currentItem.taskStatus));
  if (!currentKey || currentKey === nextKey) return { error: null };
  if (currentKey === 'hoanthanh' && nextKey !== 'hoanthanh') {
    if (qltdWorkIsAdminScope_(auth && auth.user)) return { error: null };
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'COMPLETED_STATUS_ADMIN_REQUIRED', 'Only Admin/PMO can move a completed MASTER back to another status.', scope.meta, scope.warnings) };
  }
  const allowed = {
    chuabatdau: { danglam: true, tamdung: true, hoanthanh: true },
    danglam: { tamdung: true, hoanthanh: true },
    tamdung: { danglam: true, hoanthanh: true }
  };
  if (allowed[currentKey] && allowed[currentKey][nextKey]) return { error: null };
  return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'MASTER_STATUS_TRANSITION_NOT_ALLOWED', 'MASTER status transition is not allowed.', scope.meta, scope.warnings, { currentStatus: currentItem && currentItem.status || '', requestedStatus: validation.taskStatus }) };
}
function qltdWeeklyTaskUpdatesIsCompletionProposal_(validation) {
  if (!validation || validation.itemType !== 'MASTER') return false;
  return qltdWeeklyTaskUpdatesIsCompletionState_(validation);
}
function qltdWeeklyTaskUpdatesIsCompletionState_(validation) {
  if (!validation) return false;
  return qltdWeeklyTaskUpdatesStatusWorkflowKey_(validation.taskStatus) === 'hoanthanh';
}
function qltdWeeklyTaskUpdatesIsOfficialComplete_(source) {
  if (!source) return false;
  const statusKey = qltdWeeklyTaskUpdatesNormalizeStatusKey_(source.status || source.taskStatus || '');
  return !!qltdBudgetFormatDate_(source.actualFinish || source.actualEnd || source.endActual || '') ||
    statusKey.indexOf('hoanthanh') >= 0 ||
    statusKey.indexOf('complete') >= 0 ||
    statusKey.indexOf('done') >= 0;
}
function qltdWeeklyTaskUpdatesDate_(value, allowBlank) { const text = String(value || '').trim(); if (!text) return allowBlank ? '' : null; const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return null; const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); const date = new Date(year, month - 1, day); return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? text : null; }
function qltdWeeklyTaskUpdatesBuildKey_(projectCode, deptCode, weekCode, itemType, itemId) { return [qltdWorkNormalizeCode_(projectCode), qltdWorkNormalizeCode_(deptCode), qltdWorkNormalizeWeekCode_(weekCode), qltdWeeklyTaskUpdatesNormalizeType_(itemType), String(itemId || '').trim()].join('|'); }
