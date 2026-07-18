const QLTD_ADMIN_OBJECTIVE_SOURCE = 'admin_approved_objective_v1';
const QLTD_ADMIN_OBJECTIVE_GET_ACTION = 'admin_get_approved_objective';
const QLTD_ADMIN_OBJECTIVE_UPDATE_ACTION = 'admin_update_approved_objective';
const QLTD_ADMIN_OBJECTIVE_ALLOWED_ROW_TYPES = ['TASK', 'MILESTONE'];
const QLTD_ADMIN_OBJECTIVE_ALLOWED_UPDATE_FIELDS = {
  taskName: true,
  durationDays: true,
  predecessor: true,
  anchorStart: true
};

function qltdAdminObjectiveError_(action, code, stage, message, meta, extra) {
  const response = qltdWorkError_(QLTD_ADMIN_OBJECTIVE_SOURCE, action, code, message, Object.assign({}, meta || {}, {
    stage: stage
  }), [], extra || {});
  response.ok = false;
  response.errorCode = code;
  response.stage = stage;
  response.message = message || code;
  return response;
}

function qltdAdminObjectiveIdentityCode_(identity) {
  if (!identity) return 'AUTHENTICATION_FAILED';
  return String(
    identity.errorCode || identity.code || identity.message ||
    identity.errors && identity.errors[0] && identity.errors[0].code ||
    'AUTHENTICATION_FAILED'
  ).trim().toUpperCase();
}

function qltdAdminObjectiveAuthenticate_(input, action) {
  const identity = qltdFirebaseResolveIdentity_(input || {}, true);
  if (!identity || identity.success !== true) {
    return {
      error: qltdAdminObjectiveError_(action, qltdAdminObjectiveIdentityCode_(identity), 'AUTHENTICATION',
        'Không xác minh được phiên đăng nhập.', {})
    };
  }
  const auth = qltdWorkAuthUser_(identity.email, action, QLTD_ADMIN_OBJECTIVE_SOURCE);
  if (auth.error) {
    const firstError = auth.error.errors && auth.error.errors[0] || {};
    return {
      error: qltdAdminObjectiveError_(action, firstError.code || 'AUTHENTICATION_FAILED', 'AUTHENTICATION',
        firstError.message || 'Không xác thực được người dùng.', { email: identity.email || '' })
    };
  }
  if (qltdWorkNormalizeRole_(auth.user && auth.user.role) !== 'ADMIN') {
    return {
      error: qltdAdminObjectiveError_(action, 'FORBIDDEN', 'AUTHORIZATION',
        'Chỉ tài khoản ADMIN được sửa mục tiêu đã phê duyệt.', { email: auth.email })
    };
  }
  return { identity: identity, user: auth.user, email: auth.email, error: null };
}

function qltdAdminObjectiveGet_(params) {
  const action = QLTD_ADMIN_OBJECTIVE_GET_ACTION;
  const auth = qltdAdminObjectiveAuthenticate_(params, action);
  if (auth.error) return auth.error;
  const key = qltdAdminObjectiveValidateKey_(params, action, auth.email);
  if (key.error) return key.error;

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdAdminObjectiveError_(action, 'WRITE_LOCK_TIMEOUT', 'WRITE_LOCK',
        'Không thể đọc ổn định dữ liệu mục tiêu vì hệ thống đang xử lý một thay đổi khác.', key.meta);
    }
    const resolved = qltdAdminObjectiveResolveTarget_(key.projectCode, key.masterTaskCode, action, key.meta);
    if (resolved.error) return resolved.error;
    const approval = qltdAdminObjectiveResolveApproval_(key.projectCode, key.masterTaskCode, action, key.meta);
    if (approval.error) return approval.error;
    const response = qltdWorkOk_(QLTD_ADMIN_OBJECTIVE_SOURCE, action, {
      objective: qltdAdminObjectiveBuildDto_(resolved, approval.approval)
    }, [], key.meta);
    response.ok = true;
    return response;
  } catch (error) {
    Logger.log(JSON.stringify(Object.assign({}, key.meta, {
      action: action,
      stage: 'READ',
      result: 'FAILED',
      error: String(error && error.message || error)
    })));
    return qltdAdminObjectiveError_(action, 'OBJECTIVE_READ_FAILED', 'READ',
      'Không thể tải dữ liệu mục tiêu mới nhất.', key.meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdAdminObjectiveUpdate_(payload) {
  const action = QLTD_ADMIN_OBJECTIVE_UPDATE_ACTION;
  const auth = qltdAdminObjectiveAuthenticate_(payload, action);
  if (auth.error) return auth.error;
  const key = qltdAdminObjectiveValidateKey_(payload, action, auth.email);
  if (key.error) return key.error;
  const validation = qltdAdminObjectiveValidatePayload_(payload, action, key.meta);
  if (validation.error) return validation.error;

  const lock = LockService.getScriptLock();
  let locked = false;
  let stage = 'WRITE_LOCK';
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdAdminObjectiveError_(action, 'WRITE_LOCK_TIMEOUT', stage,
        'Mục tiêu đang được một ADMIN khác cập nhật.', key.meta);
    }

    stage = 'TARGET_READ';
    const resolved = qltdAdminObjectiveResolveTarget_(key.projectCode, key.masterTaskCode, action, key.meta);
    if (resolved.error) return resolved.error;
    const approval = qltdAdminObjectiveResolveApproval_(key.projectCode, key.masterTaskCode, action, key.meta);
    if (approval.error) return approval.error;

    const markers = qltdAdminObjectiveMarkers_(validation.requestId);
    const currentNote = qltdAdminObjectiveCurrentNote_(resolved);
    if (currentNote.indexOf(markers.success) !== -1) {
      return qltdAdminObjectiveSuccess_(action, resolved, approval.approval, validation.requestId, {
        idempotent: true,
        scheduleChanged: currentNote.indexOf(markers.scheduleWrite) !== -1,
        recalculation: null,
        changes: {}
      }, key.meta);
    }

    if (currentNote.indexOf(markers.scheduleWrite) !== -1 || currentNote.indexOf(markers.contentWrite) !== -1) {
      const schedulePending = currentNote.indexOf(markers.scheduleWrite) !== -1;
      return qltdAdminObjectiveResume_(action, resolved, approval.approval, auth, validation, schedulePending, key.meta);
    }

    const currentVersion = qltdAdminObjectiveVersion_(resolved.task.raw);
    if (!validation.expectedVersion || validation.expectedVersion !== currentVersion) {
      return qltdAdminObjectiveError_(action, 'OBJECTIVE_STALE', 'CONCURRENCY',
        'Dữ liệu mục tiêu đã thay đổi sau khi mở biểu mẫu. Vui lòng tải lại trước khi lưu.', Object.assign({
          currentVersion: currentVersion
        }, key.meta));
    }

    stage = 'VALIDATION';
    const plan = qltdAdminObjectiveBuildChangePlan_(resolved, validation.updates, action, key.meta);
    if (plan.error) return plan.error;
    if (!Object.keys(plan.changes).length) {
      return qltdAdminObjectiveSuccess_(action, resolved, approval.approval, validation.requestId, {
        idempotent: true,
        scheduleChanged: false,
        recalculation: null,
        changes: {}
      }, key.meta);
    }
    if (plan.scheduleChanged) {
      const dependencyCheck = qltdAdminObjectiveValidateDependencies_(resolved, plan.predecessor, action, key.meta);
      if (dependencyCheck.error) return dependencyCheck.error;
    }

    stage = 'MASTER_WRITE';
    qltdAdminObjectiveApplyPlan_(resolved, plan, auth.email, validation.reason, markers, validation.requestId);
    const verify = qltdAdminObjectiveVerifyPlan_(resolved, plan);
    if (!verify.success) {
      return qltdAdminObjectiveError_(action, 'OBJECTIVE_VERIFY_FAILED', 'MASTER_VERIFY',
        'Không xác nhận được dữ liệu mục tiêu sau khi ghi.', key.meta, verify);
    }

    if (plan.scheduleChanged) {
      stage = 'MARK_DIRTY';
      qltdScheduleMarkProjectDirty_(key.projectCode, 'ADMIN_APPROVED_OBJECTIVE_EDIT', auth.email, {
        masterTaskCode: key.masterTaskCode,
        requestId: validation.requestId,
        fields: Object.keys(plan.changes)
      });
      stage = 'RECALCULATION';
      const recalculation = qltdProjectScheduleRecalculateLocked_(
        key.projectCode,
        resolved.spreadsheet,
        auth.email,
        action
      );
      if (!recalculation || recalculation.ok !== true) {
        qltdAdminObjectiveAudit_(action, auth.email, key, validation.reason, plan.changes, recalculation, 'FAILED');
        return qltdAdminObjectiveError_(action,
          recalculation && recalculation.errorCode || 'SCHEDULE_RECALCULATE_FAILED',
          recalculation && recalculation.stage || stage,
          recalculation && recalculation.message || 'Không thể tính lại tiến độ dự án.', key.meta);
      }
      qltdAdminObjectiveFinalize_(resolved, auth.email, markers.success);
      qltdAdminObjectiveRefreshRaw_(resolved);
      qltdAdminObjectiveAudit_(action, auth.email, key, validation.reason, plan.changes, recalculation, 'SUCCESS');
      return qltdAdminObjectiveSuccess_(action, resolved, approval.approval, validation.requestId, {
        idempotent: false,
        scheduleChanged: true,
        recalculation: recalculation,
        changes: plan.changes
      }, key.meta);
    }

    stage = 'CACHE_INVALIDATE';
    const cacheResult = qltdGanttInvalidateCache_(key.projectCode);
    if (!cacheResult || cacheResult.success !== true) {
      qltdAdminObjectiveAudit_(action, auth.email, key, validation.reason, plan.changes, cacheResult, 'FAILED');
      return qltdAdminObjectiveError_(action,
        cacheResult && cacheResult.code || 'GANTT_CACHE_INVALIDATE_FAILED', stage,
        'Đã ghi mục tiêu nhưng không thể làm mới cache Gantt.', key.meta);
    }
    qltdAdminObjectiveFinalize_(resolved, auth.email, markers.success);
    qltdAdminObjectiveRefreshRaw_(resolved);
    qltdAdminObjectiveAudit_(action, auth.email, key, validation.reason, plan.changes, cacheResult, 'SUCCESS');
    return qltdAdminObjectiveSuccess_(action, resolved, approval.approval, validation.requestId, {
      idempotent: false,
      scheduleChanged: false,
      recalculation: null,
      changes: plan.changes
    }, key.meta);
  } catch (error) {
    Logger.log(JSON.stringify(Object.assign({}, key.meta, {
      action: action,
      stage: stage,
      result: 'FAILED',
      error: String(error && error.message || error)
    })));
    return qltdAdminObjectiveError_(action, 'OBJECTIVE_UPDATE_FAILED', stage,
      'Không thể hoàn tất cập nhật mục tiêu.', key.meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdAdminObjectiveValidateKey_(input, action, email) {
  const projectCode = qltdScheduleProjectCode_(input && input.projectCode);
  const masterTaskCode = qltdWeeklyTaskUpdatesNormalizeTaskCode_(input && input.masterTaskCode);
  const meta = { email: email || '', projectCode: projectCode, masterTaskCode: masterTaskCode };
  if (!projectCode) {
    return { error: qltdAdminObjectiveError_(action, 'PROJECT_CODE_REQUIRED', 'VALIDATION', 'projectCode là bắt buộc.', meta) };
  }
  if (!masterTaskCode) {
    return { error: qltdAdminObjectiveError_(action, 'MASTER_TASK_CODE_REQUIRED', 'VALIDATION', 'masterTaskCode là bắt buộc.', meta) };
  }
  return { projectCode: projectCode, masterTaskCode: masterTaskCode, meta: meta, error: null };
}

function qltdAdminObjectiveValidatePayload_(payload, action, meta) {
  const allowedTopLevel = {
    action: true, email: true, actorEmail: true, idToken: true,
    projectCode: true, masterTaskCode: true, requestId: true,
    expectedVersion: true, reason: true, updates: true
  };
  const forbiddenFields = Object.keys(payload || {}).filter(function(key) { return !allowedTopLevel[key]; });
  const updates = payload && payload.updates;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { error: qltdAdminObjectiveError_(action, 'UPDATES_REQUIRED', 'VALIDATION', 'updates là bắt buộc.', meta) };
  }
  Object.keys(updates).forEach(function(key) {
    if (!QLTD_ADMIN_OBJECTIVE_ALLOWED_UPDATE_FIELDS[key]) forbiddenFields.push('updates.' + key);
  });
  if (forbiddenFields.length) {
    return { error: qltdAdminObjectiveError_(action, 'OBJECTIVE_FIELDS_FORBIDDEN', 'VALIDATION',
      'Payload chứa trường ngoài whitelist.', meta, { forbiddenFields: forbiddenFields }) };
  }
  if (!Object.keys(updates).length) {
    return { error: qltdAdminObjectiveError_(action, 'NO_EDIT_FIELDS', 'VALIDATION', 'Không có trường được phép sửa.', meta) };
  }
  const reason = String(payload && payload.reason || '').trim();
  if (!reason) {
    return { error: qltdAdminObjectiveError_(action, 'ADJUSTMENT_REASON_REQUIRED', 'VALIDATION', 'Lý do điều chỉnh là bắt buộc.', meta) };
  }
  if (reason.length > 1000) {
    return { error: qltdAdminObjectiveError_(action, 'ADJUSTMENT_REASON_TOO_LONG', 'VALIDATION', 'Lý do điều chỉnh quá dài.', meta) };
  }
  const requestId = String(payload && payload.requestId || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) {
    return { error: qltdAdminObjectiveError_(action, 'REQUEST_ID_INVALID', 'VALIDATION', 'requestId không hợp lệ.', meta) };
  }
  return {
    updates: updates,
    reason: reason,
    requestId: requestId,
    expectedVersion: String(payload && payload.expectedVersion || '').trim(),
    error: null
  };
}

function qltdAdminObjectiveResolveTarget_(projectCode, masterTaskCode, action, meta) {
  const project = qltdProjectsGetByCode_(projectCode);
  if (!project || project.status && String(project.status).trim().toUpperCase() !== 'ACTIVE') {
    return { error: qltdAdminObjectiveError_(action, 'PROJECT_NOT_FOUND', 'PROJECT_RESOLVE', 'Không tìm thấy dự án đang hoạt động.', meta) };
  }
  if (!String(project.masterSpreadsheetId || '').trim()) {
    return { error: qltdAdminObjectiveError_(action, 'MASTER_NOT_CONFIGURED', 'MASTER_RESOLVE', 'Dự án chưa cấu hình Master Spreadsheet.', meta) };
  }
  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(String(project.masterSpreadsheetId).trim());
  } catch (error) {
    return { error: qltdAdminObjectiveError_(action, 'MASTER_OPEN_FAILED', 'MASTER_OPEN', 'Không mở được Master Spreadsheet.', meta) };
  }
  const sheet = spreadsheet.getSheetByName('Cong_viec');
  if (!sheet) {
    return { error: qltdAdminObjectiveError_(action, 'CONG_VIEC_SHEET_NOT_FOUND', 'MASTER_OPEN', 'Không tìm thấy sheet Cong_viec.', meta) };
  }
  const parsed = qltdWeeklyMasterParseCongViec_(sheet);
  if (parsed.error) {
    return { error: qltdAdminObjectiveError_(action, parsed.error.code, 'MASTER_PARSE', parsed.error.message, meta, parsed.error.extra || {}) };
  }
  const lookup = qltdWeeklyTaskUpdatesFindSingleMasterTask_(parsed.tasks, masterTaskCode);
  if (lookup.error) {
    return { error: qltdAdminObjectiveError_(action, lookup.error.code, 'MASTER_LOOKUP', lookup.error.message, meta) };
  }
  if (typeof SCHEDULE_ENGINE_V1 !== 'object' || !SCHEDULE_ENGINE_V1.COL) {
    return { error: qltdAdminObjectiveError_(action, 'SCHEDULE_CONFIG_UNAVAILABLE', 'MASTER_PARSE', 'Không đọc được cấu hình cột Schedule Engine.', meta) };
  }
  const gantt = qltdGanttBuildDataForProject_(projectCode, Date.now());
  if (!gantt || gantt.success === false || !Array.isArray(gantt.data)) {
    return { error: qltdAdminObjectiveError_(action, 'OBJECTIVE_SOURCE_UNAVAILABLE', 'MASTER_LOOKUP', 'Không đọc được dữ liệu nguồn MASTER.', meta) };
  }
  const matches = gantt.data.filter(function(item) {
    const code = qltdWeeklyTaskUpdatesNormalizeTaskCode_(item && item.code);
    const id = qltdWeeklyTaskUpdatesNormalizeTaskCode_(item && item.id);
    return code === masterTaskCode || id === masterTaskCode;
  });
  if (matches.length !== 1) {
    return { error: qltdAdminObjectiveError_(action,
      matches.length ? 'MASTER_TASK_DUPLICATED' : 'MASTER_TASK_NOT_FOUND', 'MASTER_LOOKUP',
      matches.length ? 'Mục tiêu không map duy nhất về dữ liệu nguồn.' : 'Không tìm thấy mục tiêu trong dữ liệu nguồn.', meta,
      { matchCount: matches.length }) };
  }
  const sourceTask = matches[0];
  const rowType = String(sourceTask.rowType || '').trim().toUpperCase();
  if (QLTD_ADMIN_OBJECTIVE_ALLOWED_ROW_TYPES.indexOf(rowType) === -1) {
    return { error: qltdAdminObjectiveError_(action, 'OBJECTIVE_ROW_TYPE_FORBIDDEN', 'MASTER_LOOKUP',
      'Chỉ mục tiêu MASTER, không phải dòng nhóm hay nhiệm vụ chi tiết, mới được sửa.', meta, { rowType: rowType }) };
  }
  if (Number(sourceTask.sourceRow || 0) !== Number(lookup.task.rowNumber || 0)) {
    return { error: qltdAdminObjectiveError_(action, 'OBJECTIVE_SOURCE_ROW_MISMATCH', 'MASTER_LOOKUP',
      'Dữ liệu nguồn không map về cùng một dòng MASTER.', meta) };
  }
  return {
    project: project,
    spreadsheet: spreadsheet,
    sheet: sheet,
    parsed: parsed,
    task: lookup.task,
    sourceTask: sourceTask,
    rowType: rowType,
    error: null
  };
}

function qltdAdminObjectiveResolveApproval_(projectCode, masterTaskCode, action, meta) {
  const read = qltdWeeklyTaskUpdatesRead_();
  if (read.error) {
    return { error: qltdAdminObjectiveError_(action, read.error.code, 'APPROVAL_READ', read.error.message, meta) };
  }
  const candidates = (read.updates || []).filter(function(update) {
    return update.itemType === 'MASTER' &&
      qltdScheduleProjectCode_(update.projectCode) === projectCode &&
      qltdWeeklyTaskUpdatesNormalizeTaskCode_(update.itemId) === masterTaskCode &&
      !!update.approvalStatus;
  }).sort(function(left, right) {
    const leftTime = Date.parse(left.reviewedAt || left.updatedAt || '') || 0;
    const rightTime = Date.parse(right.reviewedAt || right.updatedAt || '') || 0;
    return rightTime - leftTime || Number(right.rowNumber || 0) - Number(left.rowNumber || 0);
  });
  const approval = candidates[0];
  if (!approval || approval.approvalStatus !== QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED) {
    return { error: qltdAdminObjectiveError_(action, 'OBJECTIVE_NOT_APPROVED', 'APPROVAL_READ',
      'Mục tiêu chưa có trạng thái APPROVED hợp lệ.', meta, { currentApprovalStatus: approval && approval.approvalStatus || '' }) };
  }
  return { approval: approval, error: null };
}

function qltdAdminObjectiveBuildDto_(resolved, approval) {
  const col = SCHEDULE_ENGINE_V1.COL;
  const raw = resolved.task.raw || [];
  return {
    projectCode: qltdScheduleProjectCode_(resolved.project && resolved.project.projectCode),
    masterTaskCode: qltdWeeklyTaskUpdatesNormalizeTaskCode_(resolved.task.masterTaskCode),
    rowType: resolved.rowType,
    wbs: String(resolved.sourceTask && resolved.sourceTask.wbs || '').trim(),
    ref: String(raw[col.REF - 1] || '').trim(),
    taskName: String(raw[col.TASK_NAME - 1] || '').trim(),
    durationDays: Number(raw[col.DURATION - 1] || 0),
    predecessor: String(raw[col.PREDECESSOR - 1] || '').trim(),
    anchorStart: qltdBudgetFormatDate_(raw[col.START - 1]),
    planFinish: qltdBudgetFormatDate_(raw[col.END - 1]),
    approvalStatus: approval && approval.approvalStatus || '',
    approvedBy: approval && approval.reviewedBy || '',
    approvedAt: approval && approval.reviewedAt || '',
    version: qltdAdminObjectiveVersion_(raw),
    scheduleState: qltdScheduleGetProjectState_(resolved.project && resolved.project.projectCode).scheduleState
  };
}

function qltdAdminObjectiveVersion_(raw) {
  const serialized = (raw || []).map(function(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') return value.toISOString();
    return String(value === null || value === undefined ? '' : value);
  }).join('\u001f');
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'v1-' + (hash >>> 0).toString(16).padStart(8, '0');
}

function qltdAdminObjectiveBuildChangePlan_(resolved, updates, action, meta) {
  const col = SCHEDULE_ENGINE_V1.COL;
  const raw = resolved.task.raw || [];
  const has = function(key) { return Object.prototype.hasOwnProperty.call(updates, key); };
  const currentTaskName = String(raw[col.TASK_NAME - 1] || '').trim();
  const currentDuration = Number(raw[col.DURATION - 1] || 0);
  const currentPredecessor = String(raw[col.PREDECESSOR - 1] || '').trim();
  const currentAnchor = qltdBudgetFormatDate_(raw[col.START - 1]);
  const taskName = has('taskName') ? String(updates.taskName || '').trim() : currentTaskName;
  const duration = has('durationDays') ? Number(updates.durationDays) : currentDuration;
  const predecessor = has('predecessor') ? String(updates.predecessor || '').trim() : currentPredecessor;
  const anchorStart = has('anchorStart') ? String(updates.anchorStart || '').trim() : currentAnchor;

  if (!taskName || taskName.length > 500) {
    return { error: qltdAdminObjectiveError_(action, 'TASK_NAME_INVALID', 'VALIDATION', 'Tên/nội dung mục tiêu không hợp lệ.', meta) };
  }
  if (!Number.isFinite(duration) || duration <= 0 || Math.floor(duration) !== duration) {
    return { error: qltdAdminObjectiveError_(action, 'DURATION_INVALID', 'VALIDATION', 'Số ngày kế hoạch phải là số nguyên dương.', meta) };
  }
  if (predecessor.length > 500) {
    return { error: qltdAdminObjectiveError_(action, 'PREDECESSOR_TOO_LONG', 'VALIDATION', 'Công việc tiền nhiệm quá dài.', meta) };
  }
  if (!predecessor && !qltdWeeklyTaskUpdatesDate_(anchorStart)) {
    return { error: qltdAdminObjectiveError_(action, 'ANCHOR_START_REQUIRED', 'VALIDATION',
      'Mục tiêu không có tiền nhiệm phải có ngày bắt đầu neo hợp lệ.', meta) };
  }

  const changes = {};
  function record(field, before, after) {
    if (String(before) !== String(after)) changes[field] = { before: before, after: after };
  }
  record('taskName', currentTaskName, taskName);
  record('durationDays', currentDuration, duration);
  record('predecessor', currentPredecessor, predecessor);
  if (!predecessor) record('anchorStart', currentAnchor, anchorStart);
  return {
    taskName: taskName,
    durationDays: duration,
    predecessor: predecessor,
    anchorStart: predecessor ? currentAnchor : anchorStart,
    changes: changes,
    scheduleChanged: ['durationDays', 'predecessor', 'anchorStart'].some(function(field) {
      return Object.prototype.hasOwnProperty.call(changes, field);
    }),
    error: null
  };
}

function qltdAdminObjectiveValidateDependencies_(resolved, proposedPredecessor, action, meta) {
  if (typeof phanTichTienNhiemV1_ !== 'function' || typeof danhDauLoiVongLapV1_ !== 'function') {
    return { error: qltdAdminObjectiveError_(action, 'DEPENDENCY_VALIDATOR_UNAVAILABLE', 'VALIDATION',
      'Không thể kiểm tra công việc tiền nhiệm bằng Schedule Engine hiện hữu.', meta) };
  }
  const cfg = SCHEDULE_ENGINE_V1;
  const lastRow = resolved.sheet.getLastRow();
  if (lastRow < cfg.START_ROW) return { error: null };
  const numRows = lastRow - cfg.START_ROW + 1;
  const width = Math.max(resolved.sheet.getLastColumn(), cfg.COL.ADJUST_LINK);
  const rows = resolved.sheet.getRange(cfg.START_ROW, 1, numRows, width).getValues();
  const tasks = [];
  const taskByRef = {};
  let targetTask = null;
  rows.forEach(function(row, index) {
    if (typeof laDongCongViecScheduleV1_ === 'function' && !laDongCongViecScheduleV1_(row)) return;
    const rowNumber = cfg.START_ROW + index;
    const ref = chuanHoaRefV1_(row[cfg.COL.REF - 1]) || 'ROW_' + rowNumber;
    const task = {
      ref: ref,
      predecessors: [],
      errors: [],
      predecessorText: rowNumber === resolved.task.rowNumber ? proposedPredecessor : row[cfg.COL.PREDECESSOR - 1]
    };
    tasks.push(task);
    if (!taskByRef[ref]) taskByRef[ref] = task;
    if (rowNumber === resolved.task.rowNumber) targetTask = task;
  });
  tasks.forEach(function(task) {
    const parsed = phanTichTienNhiemV1_(task.predecessorText, task.ref);
    task.predecessors = parsed.items;
    Array.prototype.push.apply(task.errors, parsed.errors || []);
    task.predecessors.forEach(function(predecessor) {
      if (!taskByRef[predecessor.ref]) task.errors.push('ERR_REF_NOT_FOUND: ' + predecessor.ref);
    });
  });
  danhDauLoiVongLapV1_(tasks, taskByRef);
  const errors = targetTask && targetTask.errors || ['ERR_TARGET_NOT_SCHEDULED'];
  if (errors.length) {
    return { error: qltdAdminObjectiveError_(action,
      errors.some(function(code) { return String(code).indexOf('ERR_CYCLE') === 0; }) ? 'DEPENDENCY_CYCLE' : 'DEPENDENCY_INVALID',
      'VALIDATION', 'Công việc tiền nhiệm không hợp lệ hoặc tạo vòng lặp.', meta, { dependencyErrors: errors }) };
  }
  return { error: null };
}

function qltdAdminObjectiveApplyPlan_(resolved, plan, email, reason, markers, requestId) {
  const col = SCHEDULE_ENGINE_V1.COL;
  const row = resolved.task.rowNumber;
  if (plan.changes.taskName) resolved.sheet.getRange(row, col.TASK_NAME).setValue(plan.taskName);
  if (plan.changes.durationDays) resolved.sheet.getRange(row, col.DURATION).setValue(plan.durationDays);
  if (plan.changes.predecessor) resolved.sheet.getRange(row, col.PREDECESSOR).setValue(plan.predecessor);
  if (plan.changes.anchorStart) resolved.sheet.getRange(row, col.START).setValue(qltdAdminObjectiveDateValue_(plan.anchorStart));
  const marker = plan.scheduleChanged ? markers.scheduleWrite : markers.contentWrite;
  const auditText = [
    marker,
    'ADMIN sửa mục tiêu đã phê duyệt',
    'RequestId: ' + requestId,
    'Lý do: ' + reason,
    'Trường thay đổi: ' + Object.keys(plan.changes).join(', '),
    'Trước/sau: ' + JSON.stringify(plan.changes)
  ].join(' | ');
  const noteColumn = resolved.parsed.columns.updateNote + 1;
  const updatedAtColumn = resolved.parsed.columns.updatedAt + 1;
  const currentNote = String(resolved.sheet.getRange(row, noteColumn).getValue() || '');
  resolved.sheet.getRange(row, noteColumn).setValue(qltdWorkAppendTaskNote_(currentNote, auditText, email));
  resolved.sheet.getRange(row, updatedAtColumn).setValue(qltdWorkNowIso_());
  SpreadsheetApp.flush();
}

function qltdAdminObjectiveVerifyPlan_(resolved, plan) {
  qltdAdminObjectiveRefreshRaw_(resolved);
  const col = SCHEDULE_ENGINE_V1.COL;
  const raw = resolved.task.raw;
  const mismatches = [];
  if (plan.changes.taskName && String(raw[col.TASK_NAME - 1] || '').trim() !== plan.taskName) mismatches.push('taskName');
  if (plan.changes.durationDays && Number(raw[col.DURATION - 1] || 0) !== plan.durationDays) mismatches.push('durationDays');
  if (plan.changes.predecessor && String(raw[col.PREDECESSOR - 1] || '').trim() !== plan.predecessor) mismatches.push('predecessor');
  if (plan.changes.anchorStart && qltdBudgetFormatDate_(raw[col.START - 1]) !== plan.anchorStart) mismatches.push('anchorStart');
  return { success: !mismatches.length, mismatches: mismatches };
}

function qltdAdminObjectiveResume_(action, resolved, approval, auth, validation, schedulePending, meta) {
  const markers = qltdAdminObjectiveMarkers_(validation.requestId);
  let result;
  if (schedulePending) {
    qltdScheduleMarkProjectDirty_(meta.projectCode, 'ADMIN_APPROVED_OBJECTIVE_EDIT_RETRY', auth.email, {
      masterTaskCode: meta.masterTaskCode,
      requestId: validation.requestId
    });
    result = qltdProjectScheduleRecalculateLocked_(meta.projectCode, resolved.spreadsheet, auth.email, action);
    if (!result || result.ok !== true) {
      return qltdAdminObjectiveError_(action, result && result.errorCode || 'SCHEDULE_RECALCULATE_FAILED',
        result && result.stage || 'RECALCULATION', result && result.message || 'Không thể tính lại tiến độ dự án.', meta);
    }
  } else {
    result = qltdGanttInvalidateCache_(meta.projectCode);
    if (!result || result.success !== true) {
      return qltdAdminObjectiveError_(action, result && result.code || 'GANTT_CACHE_INVALIDATE_FAILED',
        'CACHE_INVALIDATE', 'Không thể làm mới cache Gantt.', meta);
    }
  }
  qltdAdminObjectiveFinalize_(resolved, auth.email, markers.success);
  qltdAdminObjectiveRefreshRaw_(resolved);
  return qltdAdminObjectiveSuccess_(action, resolved, approval, validation.requestId, {
    idempotent: true,
    resumed: true,
    scheduleChanged: schedulePending,
    recalculation: schedulePending ? result : null,
    changes: {}
  }, meta);
}

function qltdAdminObjectiveSuccess_(action, resolved, approval, requestId, details, meta) {
  const response = qltdWorkOk_(QLTD_ADMIN_OBJECTIVE_SOURCE, action, {
    objective: qltdAdminObjectiveBuildDto_(resolved, approval),
    requestId: requestId,
    idempotent: !!details.idempotent,
    resumed: !!details.resumed,
    changes: details.changes || {},
    scheduleChanged: !!details.scheduleChanged,
    recalculation: details.recalculation || null,
    ganttCacheInvalidated: true,
    ganttRefreshRequired: true,
    dashboardRefreshRequired: true
  }, [], meta);
  response.ok = true;
  return response;
}

function qltdAdminObjectiveMarkers_(requestId) {
  const base = '[AdminObjective:' + requestId;
  return {
    scheduleWrite: base + ':WRITE:SCHEDULE]',
    contentWrite: base + ':WRITE:CONTENT]',
    success: base + ':SUCCESS]'
  };
}

function qltdAdminObjectiveCurrentNote_(resolved) {
  return String(resolved.task.raw[resolved.parsed.columns.updateNote] || '');
}

function qltdAdminObjectiveFinalize_(resolved, email, successMarker) {
  const row = resolved.task.rowNumber;
  const noteColumn = resolved.parsed.columns.updateNote + 1;
  const updatedAtColumn = resolved.parsed.columns.updatedAt + 1;
  const currentNote = String(resolved.sheet.getRange(row, noteColumn).getValue() || '');
  if (currentNote.indexOf(successMarker) === -1) {
    resolved.sheet.getRange(row, noteColumn).setValue(qltdWorkAppendTaskNote_(currentNote, successMarker, email));
    resolved.sheet.getRange(row, updatedAtColumn).setValue(qltdWorkNowIso_());
    SpreadsheetApp.flush();
  }
}

function qltdAdminObjectiveRefreshRaw_(resolved) {
  resolved.task.raw = resolved.sheet.getRange(
    resolved.task.rowNumber,
    1,
    1,
    resolved.sheet.getLastColumn()
  ).getValues()[0];
  return resolved.task.raw;
}

function qltdAdminObjectiveDateValue_(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function qltdAdminObjectiveAudit_(action, email, key, reason, changes, recalculation, result) {
  Logger.log(JSON.stringify({
    action: action,
    projectCode: key.projectCode,
    masterTaskCode: key.masterTaskCode,
    editedBy: email,
    editedAt: qltdWorkNowIso_(),
    reason: reason,
    changedFields: Object.keys(changes || {}),
    beforeAfter: changes || {},
    recalculation: recalculation || null,
    result: result
  }));
}
