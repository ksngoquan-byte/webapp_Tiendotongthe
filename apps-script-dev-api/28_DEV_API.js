const QLTD_DEV_API_SERVICE = 'QLTD_DEV_API';
const QLTD_DEV_API_SOURCE = 'users_sheet';
const QLTD_DEV_DEPT_READ_ACTIONS = {
  work_getmytasks: true,
  work_getdepttasks: true,
  work_getdetailtasks: true,
  work_auditdetailtaskparentfinish: true,
  work_listweeklyitems: true,
  work_listassignees: true,
  weekly_taskupdates_get: true,
  weekly_masterapprovals_get: true,
  weekly_pbdetailapprovals_get: true,
  notifications_list: true,
  weekly_getmyreports: true,
  weekly_getdeptreports: true,
  listdeptplans: true
};

function qltdDevApiHandleGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').trim().toLowerCase();
  if (typeof qltdPerfStartRequest_ === 'function') qltdPerfStartRequest_(action, params);

  if (action === 'health') {
    return qltdDevApiJson_({
      success: true,
      service: QLTD_DEV_API_SERVICE,
      status: 'OK'
    });
  }

  if (action === 'profile') {
    return qltdDevApiProfile_(params);
  }

  if (action === 'bootstrap') {
    return qltdDevApiJson_(qltdDevApiBootstrap_(params));
  }

  if (QLTD_DEV_DEPT_READ_ACTIONS[action]) {
    const readIdentity = qltdFirebaseResolveIdentity_(params, true);
    if (!readIdentity.success) return qltdDevApiJson_(readIdentity);
    params.email = readIdentity.email;
    params.actorEmail = readIdentity.email;
  }

  if (action === 'budget_getprojects') {
    return qltdDevApiJson_(qltdBudgetGetProjects_(params));
  }

  if (action === 'budget_getprojectdepts') {
    return qltdDevApiJson_(qltdBudgetGetProjectDepts_(params));
  }

  if (action === 'budget_getdepttasks') {
    return qltdDevApiJson_(qltdBudgetGetDeptTasks_(params));
  }

  if (action === 'budget_getdashboard') {
    return qltdDevApiJson_(qltdBudgetGetDashboard_(params));
  }

  if (action === 'budget_getlivedashboard') {
    return qltdDevApiJson_(qltdBudgetGetLiveDashboardOptimized_(params));
  }

  if (action === 'budget_gettaskbudgetmap') {
    return qltdDevApiJson_(qltdBudgetGetTaskBudgetMap_(params));
  }

  if (action === 'budget_syncapprovedtaskbudgets') {
    return qltdDevApiJson_(qltdBudgetSyncApprovedTaskBudgets_(params));
  }

  if (action === 'budget_getsummary') {
    return qltdDevApiJson_(qltdBudgetGetSummary_(params));
  }

  if (action === 'budget_getbudgetitems') {
    return qltdDevApiJson_(qltdBudgetGetBudgetItems_(params));
  }

  if (action === 'budget_getallocations') {
    return qltdDevApiJson_(qltdBudgetGetAllocations_(params));
  }

  if (action === 'budget_checkallocation') {
    return qltdDevApiJson_(qltdBudgetCheckAllocation_(params));
  }

  if (action === 'budget_checktwolayerschema') {
    return qltdDevApiJson_(qltdBudgetCheckTwoLayerSchema_(params));
  }

  if (action === 'budget_setuptwolayerschemadryrun') {
    return qltdDevApiJson_(qltdBudgetSetupTwoLayerSchemaDryRun_(params));
  }

  if (action === 'budget_submitplandryrun') {
    return qltdDevApiJson_(qltdBudgetSubmitPlanDryRun_(params));
  }

  if (action === 'budget_submitactualdryrun') {
    return qltdDevApiJson_(qltdBudgetSubmitActualDryRun_(params));
  }

  if (action === 'work_getmytasks') {
    return qltdDevApiJson_(qltdWorkGetMyTasks_(params));
  }

  if (action === 'work_getdepttasks') {
    return qltdDevApiJson_(qltdWorkGetDeptTasks_(params));
  }

  if (action === 'work_getdetailtasks') {
    return qltdDevApiJson_(qltdWorkGetDetailTasks_(params));
  }

  if (action === 'work_auditdetailtaskparentfinish') {
    return qltdDevApiJson_(qltdWorkAuditDetailTaskParentFinish_(params));
  }

  if (action === 'work_listweeklyitems') {
    return qltdDevApiJson_(qltdWorkListWeeklyItems_(params));
  }

  if (action === 'weekly_taskupdates_setup_dryrun') {
    return qltdDevApiJson_(qltdWeeklyTaskUpdatesSetupDryRunApi_(params));
  }

  if (action === 'weekly_taskupdates_get') {
    return qltdDevApiJson_(qltdWeeklyTaskUpdatesGet_(params));
  }

  if (action === 'weekly_masterapprovals_get') {
    return qltdDevApiJson_(qltdWeeklyMasterApprovalsGet_(params));
  }

  if (action === 'weekly_pbdetailapprovals_get') {
    return qltdDevApiJson_(qltdWeeklyPbDetailApprovalsGet_(params));
  }

  if (action === 'getprojectschedulestate') {
    return qltdDevApiJson_(qltdProjectScheduleGetStateApi_(params));
  }

  if (action === 'notifications_list') {
    return qltdDevApiJson_(qltdNotificationsList_(params));
  }

  if (action === 'work_listassignees') {
    return qltdDevApiJson_(qltdWorkListAssignees_(params));
  }

  if (action === 'weekly_getmyreports') {
    return qltdDevApiJson_(qltdWeeklyGetMyReports_(params));
  }

  if (action === 'weekly_getdeptreports') {
    return qltdDevApiJson_(qltdWeeklyGetDeptReports_(params));
  }

  if (action === 'listprojects') {
    return qltdDevApiListProjects_(params);
  }

  if (action === 'listdeptplans') {
    return qltdDevApiListDeptPlans_(params);
  }

  if (action === 'ganttdata') {
    return qltdDevApiGanttData_(params);
  }

  if (action === 'dashboardsummary') {
    return qltdDevApiDashboardSummary_(params);
  }

  if (action === 'getmainmilestones') {
    return qltdDevApiJson_(qltdMainMilestonesGet_(params.projectCode, params.email));
  }

  if (action === 'savemainmilestones') {
    return qltdDevApiJson_(qltdMainMilestonesSave_(
      params.projectCode,
      params.ids || params.milestoneIds,
      params.codes || params.milestoneCodes,
      params.email
    ));
  }

  if (action === 'resetmainmilestones') {
    return qltdDevApiJson_(qltdMainMilestonesReset_(params.projectCode, params.email));
  }

  if (action === 'setupprojectdepts') {
    qltdSetupProjectDeptsSheet();
    return qltdDevApiJson_({
      success: true,
      message: 'PROJECT_DEPTS_SETUP_DONE',
      apiStatus: 'CONNECTED',
      source: 'project_depts_sheet'
    });
  }

  if (action === 'web06bseedregistry') {
    const result = web06bSeedProjectRegistry();
    result.apiStatus = 'CONNECTED';
    result.source = 'web06b_project_registry_seed';
    return qltdDevApiJson_(result);
  }

  if (action === 'projectdepts_masterdept_dryrun') {
    return qltdDevApiJson_(qltdProjectDeptsMasterDeptDryRun_());
  }

  return qltdDevApiJson_({
    success: false,
    message: 'UNKNOWN_ACTION'
  });
}

function doPost(e) {
  try {
    return qltdDevApiHandlePost_(e);
  } catch (error) {
    let action = '';
    try {
      const raw = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
      action = String(raw.action || '').trim();
    } catch (parseError) {
      action = 'POST_PARSE';
    }
    return qltdDevApiJson_(qltdBudgetWriteResponse_(false, 'WRITE_ERROR', action, null, [], [{
      code: 'UNEXPECTED_POST_ERROR',
      message: qltdBudgetSafeErrorMessage_(error)
    }], {
      action: action
    }));
  }
}

function qltdDevApiHandlePost_(e) {
  const parseResult = qltdBudgetParsePostJson_(e);
  if (parseResult.error) {
    return qltdDevApiJson_(parseResult.error);
  }

  const payload = parseResult.payload;
  const action = String(payload.action || '').trim().toLowerCase();
  if (typeof qltdPerfStartRequest_ === 'function') qltdPerfStartRequest_(action, payload);

  if (action === 'profile') {
    return qltdDevApiProfile_(payload);
  }

  if (action === 'bootstrap') {
    return qltdDevApiJson_(qltdDevApiBootstrap_(payload));
  }

  if (action === 'user_lookupemployees') {
    return qltdDevApiJson_(qltdUsersLookupEmployees_(payload));
  }

  if (action === 'user_register') {
    return qltdDevApiJson_(qltdUsersRegister_(payload));
  }

  if (action === 'notifications_markread') {
    const notificationIdentity = qltdFirebaseResolveIdentity_(payload, true);
    if (!notificationIdentity.success) return qltdDevApiJson_(notificationIdentity);
    payload.email = notificationIdentity.email;
    payload.actorEmail = notificationIdentity.email;
    return qltdDevApiJson_(qltdNotificationsMarkRead_(payload));
  }

  if (action === 'recalculateprojectschedule') {
    return qltdDevApiJson_(qltdProjectScheduleRecalculate_(payload));
  }

  const scopeResult = qltdDeptScopeAuthorizeWrite_(payload, action);
  if (!scopeResult.allowed) {
    return qltdDevApiJson_(scopeResult.response);
  }

  if (action === 'budget_submitplan') {
    return qltdDevApiJson_(qltdBudgetSubmitPlan_(payload));
  }

  if (action === 'budget_submitactual') {
    return qltdDevApiJson_(qltdBudgetSubmitActual_(payload));
  }

  if (action === 'budget_rebuildaggregates') {
    return qltdDevApiJson_(qltdBudgetRebuildAggregates_(payload));
  }

  if (action === 'budget_checkallocation') {
    return qltdDevApiJson_(qltdBudgetCheckAllocation_(payload));
  }

  if (action === 'budget_upsertallocation') {
    return qltdDevApiJson_(qltdBudgetUpsertAllocation_(payload));
  }

  if (action === 'budget_syncapprovedtaskbudgets') {
    return qltdDevApiJson_(qltdBudgetSyncApprovedTaskBudgets_(payload));
  }

  if (action === 'work_assigntask') {
    return qltdDevApiJson_(qltdWorkAssignTask_(payload));
  }

  if (action === 'work_updatetask') {
    return qltdDevApiJson_(qltdDeptScopeFinalizeWrite_(scopeResult, action, payload, qltdWorkUpdateTask_(payload)));
  }

  if (action === 'work_createdetailtask') {
    return qltdDevApiJson_(qltdWorkCreateDetailTask_(payload));
  }

  if (action === 'work_updatedetailtask') {
    return qltdDevApiJson_(qltdDeptScopeFinalizeWrite_(scopeResult, action, payload, qltdWorkUpdateDetailTask_(payload)));
  }

  if (action === 'weekly_taskupdates_save') {
    return qltdDevApiJson_(qltdDeptScopeFinalizeWrite_(scopeResult, action, payload, qltdWeeklyTaskUpdatesSave_(payload)));
  }

  if (action === 'weekly_taskupdates_setup') {
    return qltdDevApiJson_(qltdWeeklyTaskUpdatesSetupApi_(payload));
  }

  if (action === 'weekly_masterapproval_review') {
    return qltdDevApiJson_(qltdWeeklyMasterApprovalReview_(payload));
  }

  if (action === 'weekly_pbdetailapproval_review') {
    return qltdDevApiJson_(qltdWeeklyPbDetailApprovalReview_(payload));
  }

  if (action === 'weekly_savedraft') {
    return qltdDevApiJson_(qltdDeptScopeFinalizeWrite_(scopeResult, action, payload, qltdWeeklySaveDraft_(payload)));
  }

  if (action === 'weekly_submit') {
    return qltdDevApiJson_(qltdDeptScopeFinalizeWrite_(scopeResult, action, payload, qltdWeeklySubmit_(payload)));
  }

  if (action === 'weekly_review') {
    return qltdDevApiJson_(qltdWeeklyReview_(payload));
  }

  if (action === 'projectdepts_masterdept_apply') {
    return qltdDevApiJson_(qltdProjectDeptsMasterDeptApply_(payload));
  }

  return qltdDevApiJson_(qltdBudgetWriteError_('UNKNOWN_POST_ACTION', 'UNKNOWN_POST_ACTION', 'Post action khong hop le.', {
    action: payload.action || ''
  }));
}

function qltdDevApiIsActionRequest(e) {
  return !!(e && e.parameter && e.parameter.action);
}

function qltdDevApiProfile_(params) {
  const identity = qltdFirebaseResolveIdentity_(params, true);
  if (!identity.success) {
    return qltdDevApiJson_(identity);
  }

  const email = qltdDevApiNormalizeEmail_(identity.email || (params && params.email));

  qltdUsersEnsureSheet_();
  qltdUsersSeedAdminIfMissing_();

  const user = qltdUsersGetByEmail_(email);

  if (!user) {
    return qltdDevApiJson_({
      success: false,
      message: 'USER_NOT_FOUND',
      requiresRegistration: true,
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    });
  }

  if (!qltdUsersIsValidStatus_(user.status) || user.status !== 'ACTIVE') {
    return qltdDevApiJson_({
      success: false,
      message: 'USER_INACTIVE',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    });
  }

  if (!qltdUsersIsValidRole_(user.role)) {
    return qltdDevApiJson_({
      success: false,
      message: 'INVALID_ROLE',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    });
  }

  qltdUsersTouchLastLogin_(user.rowIndex);

  return qltdDevApiJson_({
    success: true,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    deptCode: user.deptCode,
    deptName: user.deptName,
    empCode: user.empCode || '',
    permissions: qltdPermissionsForRole_(user.role),
    apiStatus: 'CONNECTED',
    source: QLTD_DEV_API_SOURCE
  });
}

function qltdDevApiNormalizeEmail_(emailValue) {
  return String(emailValue || '').trim().toLowerCase();
}

function qltdDevApiJson_(payload) {
  const serialized = typeof qltdPerfFinalizeJson_ === 'function'
    ? qltdPerfFinalizeJson_(payload)
    : JSON.stringify(payload);
  return ContentService
    .createTextOutput(serialized)
    .setMimeType(ContentService.MimeType.JSON);
}


function qltdDevApiListProjects_(params) {
  const identity = qltdFirebaseResolveIdentity_(params, true);
  if (!identity.success) return qltdDevApiJson_(identity);

  const user = qltdUsersGetByEmail_(identity.email);
  if (!user) {
    return qltdDevApiJson_(qltdUsersBuildAuthError_('USER_NOT_FOUND', 'Tai khoan chua duoc dang ky tren he thong.', {
      requiresRegistration: true
    }));
  }
  if (user.status !== 'ACTIVE') {
    return qltdDevApiJson_(qltdUsersBuildAuthError_('USER_INACTIVE', 'Tai khoan dang bi khoa.'));
  }
  if (!qltdUsersIsValidRole_(user.role)) {
    return qltdDevApiJson_(qltdUsersBuildAuthError_('INVALID_ROLE', 'Vai tro tai khoan khong hop le.'));
  }

  qltdProjectsEnsureSheet_();
  qltdProjectsSeedDefaultIfMissing_();

  const projects = qltdProjectsListForUser_(user.email).map(function(project) {
    return {
      projectCode: project.projectCode,
      projectName: project.projectName,
      defaultTaskSheet: project.defaultTaskSheet,
      defaultDeptSheet: project.defaultDeptSheet,
      sortOrder: project.sortOrder || ''
    };
  });

  return qltdDevApiJson_({
    success: true,
    projects: projects,
    apiStatus: 'CONNECTED',
    source: 'projects_sheet'
  });
}
function qltdDevApiListDeptPlans_(params) {
  const action = 'listDeptPlans';
  const auth = qltdWorkAuthUser_(params && params.email, action, 'dept_plan_service');
  if (auth.error) return qltdDevApiJson_(auth.error);
  return qltdDevApiJson_(qltdDeptPlanListForProject_(
    params && params.projectCode,
    auth.user,
    auth.email,
    params && params.deptCode
  ));
}

function qltdDevApiGanttData_(params) {
  const projectCode = params && params.projectCode;
  const forceRefresh = String(params && (params.forceRefresh || params.bypassCache) || '').trim() === '1' ||
    String(params && (params.forceRefresh || params.bypassCache) || '').trim().toLowerCase() === 'true';
  if (forceRefresh && typeof qltdGanttInvalidateCache_ === 'function') {
    try {
      qltdGanttInvalidateCache_(projectCode);
    } catch (error) {
      Logger.log(JSON.stringify({
        action: 'ganttData',
        stage: 'FORCE_REFRESH_INVALIDATE',
        projectCode: projectCode,
        message: error && error.message || String(error)
      }));
    }
  }
  const result = qltdGanttGetDataForProject_(projectCode);
  if (result && result.success !== false) {
    const milestones = qltdMainMilestonesGet_(projectCode, 'gantt-data@authenticated.local', true);
    result.mainMilestoneSource = 'GOOGLE_SHEET';
    result.mainMilestoneIds = milestones.ids || [];
    result.mainMilestoneCodes = milestones.codes || [];
  }
  return qltdDevApiJson_(result);
}

function qltdDevApiDashboardSummary_(params) {
  const projectCode = params && params.projectCode;
  const forceRefresh = String(params && (params.forceRefresh || params.bypassCache) || '').trim() === '1' ||
    String(params && (params.forceRefresh || params.bypassCache) || '').trim().toLowerCase() === 'true';
  if (forceRefresh && typeof qltdGanttInvalidateCache_ === 'function') {
    qltdGanttInvalidateCache_(projectCode);
  }
  const result = qltdDashboardGetSummaryForProject_(projectCode);
  if (result && result.success !== false) {
    const milestones = qltdMainMilestonesGet_(projectCode, 'dashboard-summary@authenticated.local', true);
    result.mainMilestoneSource = 'GOOGLE_SHEET';
    result.mainMilestoneIds = milestones.ids || [];
    result.mainMilestoneCodes = milestones.codes || [];
  }
  return qltdDevApiJson_(result);
}
