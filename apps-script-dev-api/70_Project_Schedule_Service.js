const QLTD_PROJECT_SCHEDULE_SOURCE = 'project_schedule_v1';
const QLTD_PROJECT_SCHEDULE_LOCK_TIMEOUT_MS = 10000;

function qltdProjectScheduleError_(action, errorCode, stage, message, projectCode) {
  return {
    success: false,
    ok: false,
    source: QLTD_PROJECT_SCHEDULE_SOURCE,
    action: action,
    projectCode: qltdScheduleProjectCode_(projectCode),
    errorCode: errorCode,
    stage: stage,
    message: message || errorCode
  };
}

function qltdProjectScheduleIdentityCode_(identity) {
  if (!identity) return 'AUTHENTICATION_FAILED';
  return String(
    identity.errorCode ||
    identity.code ||
    identity.message ||
    identity.errors && identity.errors[0] && identity.errors[0].code ||
    'AUTHENTICATION_FAILED'
  ).trim().toUpperCase();
}

function qltdProjectScheduleAuthenticate_(payload, action) {
  const identity = qltdFirebaseResolveIdentity_(payload || {}, true);
  if (!identity.success) {
    const code = qltdProjectScheduleIdentityCode_(identity);
    return {
      error: qltdProjectScheduleError_(action, code, 'AUTHENTICATION',
        'Không xác minh được phiên đăng nhập.', payload && payload.projectCode)
    };
  }

  const auth = qltdWorkAuthUser_(identity.email, action, QLTD_PROJECT_SCHEDULE_SOURCE);
  if (auth.error) {
    const firstError = auth.error.errors && auth.error.errors[0] || {};
    return {
      error: qltdProjectScheduleError_(action, firstError.code || 'AUTHENTICATION_FAILED',
        'AUTHENTICATION', firstError.message || 'Không xác thực được người dùng.',
        payload && payload.projectCode)
    };
  }
  return { identity: identity, user: auth.user, email: auth.email, error: null };
}

function qltdProjectScheduleGetStateApi_(payload) {
  const action = 'getProjectScheduleState';
  const auth = qltdProjectScheduleAuthenticate_(payload, action);
  if (auth.error) return auth.error;

  const projectCode = qltdScheduleProjectCode_(payload && payload.projectCode);
  if (!projectCode) {
    return qltdProjectScheduleError_(action, 'PROJECT_CODE_REQUIRED', 'VALIDATION',
      'projectCode là bắt buộc.', projectCode);
  }
  const project = qltdProjectsGetByCode_(projectCode);
  if (!project) {
    return qltdProjectScheduleError_(action, 'PROJECT_NOT_FOUND', 'PROJECT_RESOLVE',
      'Không tìm thấy dự án.', projectCode);
  }

  const state = qltdScheduleGetProjectState_(projectCode);
  return Object.assign({
    success: true,
    ok: true,
    source: QLTD_PROJECT_SCHEDULE_SOURCE,
    action: action
  }, state);
}

function qltdProjectScheduleRecalculate_(payload) {
  const action = 'recalculateProjectSchedule';
  const auth = qltdProjectScheduleAuthenticate_(payload, action);
  if (auth.error) return auth.error;

  const projectCode = qltdScheduleProjectCode_(payload && payload.projectCode);
  if (!projectCode) {
    return qltdProjectScheduleError_(action, 'PROJECT_CODE_REQUIRED', 'VALIDATION',
      'projectCode là bắt buộc.', projectCode);
  }
  if (String(auth.user && auth.user.role || '').trim().toUpperCase() !== 'ADMIN') {
    return qltdProjectScheduleError_(action, 'FORBIDDEN', 'AUTHORIZATION',
      'Chỉ ADMIN được phép tính lại tiến độ dự án.', projectCode);
  }

  const project = qltdProjectsGetByCode_(projectCode);
  if (!project) {
    return qltdProjectScheduleError_(action, 'PROJECT_NOT_FOUND', 'PROJECT_RESOLVE',
      'Không tìm thấy dự án.', projectCode);
  }
  if (!String(project.masterSpreadsheetId || '').trim()) {
    return qltdProjectScheduleError_(action, 'MASTER_NOT_CONFIGURED', 'MASTER_RESOLVE',
      'Dự án chưa cấu hình Master Spreadsheet.', projectCode);
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(String(project.masterSpreadsheetId).trim());
  } catch (error) {
    Logger.log(JSON.stringify({
      action: action,
      projectCode: projectCode,
      stage: 'MASTER_OPEN',
      message: String(error && error.message || error)
    }));
    return qltdProjectScheduleError_(action, 'MASTER_OPEN_FAILED', 'MASTER_OPEN',
      'Không mở được Master Spreadsheet của dự án.', projectCode);
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_PROJECT_SCHEDULE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdProjectScheduleError_(action, 'SCHEDULE_LOCK_TIMEOUT', 'LOCK',
        'Dự án đang được tính lại tiến độ bởi một tiến trình khác.', projectCode);
    }
    return qltdProjectScheduleRecalculateLocked_(projectCode, spreadsheet, auth.email, action);
  } catch (error) {
    Logger.log(JSON.stringify({
      action: action,
      projectCode: projectCode,
      stage: 'LOCK',
      message: String(error && error.message || error)
    }));
    return qltdProjectScheduleError_(action, 'SCHEDULE_RECALCULATE_FAILED', 'LOCK',
      'Không thể hoàn tất tính lại tiến độ dự án.', projectCode);
  } finally {
    if (locked) lock.releaseLock();
  }
}

/**
 * Reuses the approved project recalculation pipeline while the caller owns the
 * ScriptLock. This keeps Sheet writes and recalculation in one critical section.
 */
function qltdProjectScheduleRecalculateLocked_(projectCode, spreadsheet, actorEmail, actionName) {
  const action = String(actionName || 'recalculateProjectSchedule');
  let stage = 'ENGINE';
  try {
    if (typeof chayScheduleEngineV1NoLockForSpreadsheet_ !== 'function') {
      return qltdProjectScheduleError_(action, 'SCHEDULE_ENGINE_UNAVAILABLE', stage,
        'Schedule Engine chưa sẵn sàng.', projectCode);
    }
    const summary = chayScheduleEngineV1NoLockForSpreadsheet_(spreadsheet, {
      normalizeFormat: false,
      debugPerf: false
    });
    if (!summary || summary.ok !== true) {
      return qltdProjectScheduleError_(action, 'SCHEDULE_ENGINE_FAILED', stage,
        'Schedule Engine không xác nhận hoàn tất.', projectCode);
    }

    stage = 'CACHE_INVALIDATE';
    const cacheResult = qltdGanttInvalidateCache_(projectCode);
    if (!cacheResult || cacheResult.success !== true) {
      return qltdProjectScheduleError_(action,
        cacheResult && cacheResult.code || 'SCHEDULE_CACHE_INVALIDATE_FAILED',
        stage, 'Không thể làm mới cache tiến độ dự án.', projectCode);
    }

    stage = 'MARK_CLEAN';
    const cleanState = qltdScheduleMarkProjectClean_(projectCode, actorEmail, {
      changedDurationCount: Number(summary.changedDurationCount || 0),
      changedStartCount: Number(summary.changedStartCount || 0),
      changedFinishCount: Number(summary.changedFinishCount || 0),
      changedErrorCount: Number(summary.changedErrorCount || 0),
      processedTaskCount: Number(summary.processedTaskCount || 0),
      durationMs: Number(summary.durationMs || 0)
    });
    if (!cleanState || cleanState.scheduleState !== QLTD_PROJECT_SCHEDULE_STATE_V1.CLEAN) {
      return qltdProjectScheduleError_(action, 'SCHEDULE_MARK_CLEAN_FAILED', stage,
        'Không thể xác nhận trạng thái CLEAN.', projectCode);
    }

    return {
      success: true,
      ok: true,
      source: QLTD_PROJECT_SCHEDULE_SOURCE,
      action: action,
      projectCode: projectCode,
      scheduleState: QLTD_PROJECT_SCHEDULE_STATE_V1.CLEAN,
      changedDurationCount: Number(summary.changedDurationCount || 0),
      changedStartCount: Number(summary.changedStartCount || 0),
      changedFinishCount: Number(summary.changedFinishCount || 0),
      changedErrorCount: Number(summary.changedErrorCount || 0),
      processedTaskCount: Number(summary.processedTaskCount || 0),
      durationMs: Number(summary.durationMs || 0),
      recalculatedAt: cleanState.recalculatedAt,
      recalculatedBy: cleanState.recalculatedBy,
      invalidatedCaches: ['GANTT', 'DASHBOARD_DERIVED']
    };
  } catch (error) {
    Logger.log(JSON.stringify({
      action: action,
      projectCode: qltdScheduleProjectCode_(projectCode),
      stage: stage,
      message: String(error && error.message || error)
    }));
    return qltdProjectScheduleError_(action,
      stage === 'ENGINE' ? 'SCHEDULE_ENGINE_EXCEPTION' : 'SCHEDULE_RECALCULATE_FAILED',
      stage, stage === 'ENGINE'
        ? 'Schedule Engine phát sinh lỗi.'
        : 'Không thể hoàn tất tính lại tiến độ dự án.',
      projectCode);
  }
}
