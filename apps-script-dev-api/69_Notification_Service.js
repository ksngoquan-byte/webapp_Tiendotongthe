const QLTD_NOTIFICATIONS_SOURCE = 'notifications_v1';
const QLTD_NOTIFICATIONS_SHEET = 'NOTIFICATIONS';
const QLTD_NOTIFICATIONS_HEADERS = [
  'NotificationId', 'RecipientEmail', 'RecipientRole', 'Type', 'EntityType', 'EntityId',
  'ProjectCode', 'DepartmentCode', 'WeekStart', 'TabKey', 'ItemKey', 'Title', 'Message',
  'IsRead', 'ReadAt', 'Status', 'CreatedAt', 'ResolvedAt', 'SourceRequestId'
];
const QLTD_NOTIFICATIONS_TYPES = {
  PB_DETAIL_PENDING: 'PB_DETAIL_PENDING',
  MASTER_COMPLETION_PENDING: 'MASTER_COMPLETION_PENDING',
  UPDATE_REJECTED: 'UPDATE_REJECTED',
  UPDATE_APPROVED: 'UPDATE_APPROVED'
};
const QLTD_NOTIFICATIONS_STATUS = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED'
};
const QLTD_NOTIFICATIONS_ENTITY_TYPE = 'WEEKLY_TASK_UPDATE';
const QLTD_NOTIFICATIONS_DEFAULT_LIMIT = 50;
const QLTD_NOTIFICATIONS_MAX_LIMIT = 100;
const QLTD_NOTIFICATIONS_REJECTION_REASON_MAX = 300;
const QLTD_NOTIFICATIONS_SUMMARY_CACHE_TTL_SECONDS = 30;

function setupNotificationsSheetDev() {
  return qltdSetupNotificationsSheet_();
}

function qltdSetupNotificationsSheet_() {
  const spreadsheet = getCurrentSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(QLTD_NOTIFICATIONS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(QLTD_NOTIFICATIONS_SHEET);
    sheet.getRange(1, 1, 1, QLTD_NOTIFICATIONS_HEADERS.length)
      .setValues([QLTD_NOTIFICATIONS_HEADERS])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    return {
      success: true,
      created: true,
      idempotent: true,
      sheetName: QLTD_NOTIFICATIONS_SHEET,
      columnCount: QLTD_NOTIFICATIONS_HEADERS.length,
      headers: QLTD_NOTIFICATIONS_HEADERS.slice()
    };
  }

  const inspection = qltdNotificationsInspectSheet_(sheet);
  if (!inspection.headerMatches) {
    return {
      success: false,
      created: false,
      code: 'NOTIFICATIONS_HEADER_MISMATCH',
      message: 'NOTIFICATIONS headers do not match the approved 19-column schema.',
      expectedColumnCount: QLTD_NOTIFICATIONS_HEADERS.length,
      actualColumnCount: inspection.actualColumnCount,
      mismatches: inspection.mismatches
    };
  }
  return {
    success: true,
    created: false,
    idempotent: true,
    sheetName: QLTD_NOTIFICATIONS_SHEET,
    columnCount: QLTD_NOTIFICATIONS_HEADERS.length,
    headers: QLTD_NOTIFICATIONS_HEADERS.slice()
  };
}

function qltdNotificationsInspectSheet_(sheet) {
  const lastColumn = Number(sheet.getLastColumn() || 0);
  const width = Math.max(lastColumn, QLTD_NOTIFICATIONS_HEADERS.length);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const mismatches = QLTD_NOTIFICATIONS_HEADERS.map(function(expected, index) {
    return current[index] === expected ? null : {
      column: index + 1,
      expected: expected,
      actual: current[index]
    };
  }).filter(Boolean);
  current.slice(QLTD_NOTIFICATIONS_HEADERS.length).forEach(function(value, index) {
    if (value) {
      mismatches.push({
        column: QLTD_NOTIFICATIONS_HEADERS.length + index + 1,
        expected: '',
        actual: value
      });
    }
  });
  if (lastColumn !== QLTD_NOTIFICATIONS_HEADERS.length && !mismatches.length) {
    mismatches.push({
      column: lastColumn,
      expected: QLTD_NOTIFICATIONS_HEADERS.length + ' columns',
      actual: lastColumn + ' columns'
    });
  }
  return {
    headerMatches: lastColumn === QLTD_NOTIFICATIONS_HEADERS.length && !mismatches.length,
    actualColumnCount: lastColumn,
    mismatches: mismatches
  };
}

function qltdNotificationsList_(params) {
  const action = 'notifications_list';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_NOTIFICATIONS_SOURCE);
  if (auth.error) return auth.error;
  const read = qltdNotificationsRead_();
  if (read.error) {
    return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, read.error.code, read.error.message, { email: auth.email });
  }
  const requestedLimit = Number(params && params.limit);
  const limit = isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), QLTD_NOTIFICATIONS_MAX_LIMIT)
    : QLTD_NOTIFICATIONS_DEFAULT_LIMIT;
  const collected = qltdNotificationsCollectForUser_(read.notifications, auth.email, limit);
  const result = qltdWorkOk_(QLTD_NOTIFICATIONS_SOURCE, action, {
    notifications: collected.notifications,
    unreadCount: collected.unreadCount,
    actionRequiredCount: collected.actionRequiredCount,
    totalCount: collected.totalCount,
    limit: limit
  }, [], { email: auth.email });
  result.performance = {
    rowsRead: read.rawRows.length,
    columnsRead: QLTD_NOTIFICATIONS_HEADERS.length,
    cellsRead: read.rawRows.length * QLTD_NOTIFICATIONS_HEADERS.length,
    recordCount: collected.totalCount,
    sheetCount: 1,
    sourceCount: 1,
    cacheHit: false
  };
  return result;
}

function qltdNotificationsSummary_(params) {
  const action = 'notifications_summary';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_NOTIFICATIONS_SOURCE);
  if (auth.error) return auth.error;
  const role = auth.user && auth.user.role || '';
  const cached = qltdNotificationsSummaryCacheGet_(auth.email, role);
  if (cached) {
    const cachedResult = qltdWorkOk_(QLTD_NOTIFICATIONS_SOURCE, action, cached, [], { email: auth.email });
    cachedResult.performance = {
      rowsRead: 0,
      columnsRead: 0,
      cellsRead: 0,
      recordCount: Number(cached.totalCount || 0),
      sheetCount: 0,
      sourceCount: 0,
      cacheHit: true
    };
    return cachedResult;
  }
  const read = qltdNotificationsRead_();
  if (read.error) {
    return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, read.error.code, read.error.message, { email: auth.email });
  }
  const collected = qltdNotificationsCollectForUser_(read.notifications, auth.email, 0);
  const summary = {
    unreadCount: collected.unreadCount,
    actionRequiredCount: collected.actionRequiredCount,
    totalCount: collected.totalCount
  };
  qltdNotificationsSummaryCachePut_(auth.email, role, summary);
  const result = qltdWorkOk_(QLTD_NOTIFICATIONS_SOURCE, action, summary, [], { email: auth.email });
  result.performance = {
    rowsRead: read.rawRows.length,
    columnsRead: QLTD_NOTIFICATIONS_HEADERS.length,
    cellsRead: read.rawRows.length * QLTD_NOTIFICATIONS_HEADERS.length,
    recordCount: collected.totalCount,
    sheetCount: 1,
    sourceCount: 1,
    cacheHit: false
  };
  return result;
}

function qltdNotificationsCollectForUser_(notifications, email, limit) {
  const normalizedEmail = qltdWorkNormalizeEmail_(email);
  const boundedLimit = Math.max(0, Math.min(Number(limit || 0), QLTD_NOTIFICATIONS_MAX_LIMIT));
  const selected = [];
  let unreadCount = 0;
  let actionRequiredCount = 0;
  let totalCount = 0;
  (notifications || []).forEach(function(notification) {
    if (notification.recipientEmail !== normalizedEmail) return;
    totalCount += 1;
    if (!notification.isRead) unreadCount += 1;
    if (notification.status === QLTD_NOTIFICATIONS_STATUS.OPEN &&
      [QLTD_NOTIFICATIONS_TYPES.PB_DETAIL_PENDING, QLTD_NOTIFICATIONS_TYPES.MASTER_COMPLETION_PENDING].indexOf(notification.type) !== -1) {
      actionRequiredCount += 1;
    }
    if (!boundedLimit) return;
    selected.push(notification);
    selected.sort(qltdNotificationsNewestFirst_);
    if (selected.length > boundedLimit) selected.pop();
  });
  return {
    notifications: selected,
    unreadCount: unreadCount,
    actionRequiredCount: actionRequiredCount,
    totalCount: totalCount
  };
}

function qltdNotificationsNewestFirst_(left, right) {
  return String(right.createdAt || '').localeCompare(String(left.createdAt || '')) ||
    Number(right.rowNumber || 0) - Number(left.rowNumber || 0);
}

function qltdNotificationsSummaryCacheKey_(email, role) {
  return 'QLTD_NTF_SUMMARY_V1_' +
    qltdWorkNormalizeEmail_(email).replace(/[^a-z0-9]/g, '_').slice(0, 80) + '_' +
    qltdWorkNormalizeRole_(role).replace(/[^A-Z0-9_]/g, '_').slice(0, 20);
}

function qltdNotificationsSummaryCacheGet_(email, role) {
  try {
    if (typeof CacheService === 'undefined') return null;
    const text = CacheService.getScriptCache().get(qltdNotificationsSummaryCacheKey_(email, role));
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

function qltdNotificationsSummaryCachePut_(email, role, summary) {
  try {
    if (typeof CacheService === 'undefined') return false;
    CacheService.getScriptCache().put(
      qltdNotificationsSummaryCacheKey_(email, role),
      JSON.stringify(summary),
      QLTD_NOTIFICATIONS_SUMMARY_CACHE_TTL_SECONDS
    );
    return true;
  } catch (error) {
    return false;
  }
}

function qltdNotificationsSummaryCacheInvalidate_(email, role) {
  try {
    if (typeof CacheService === 'undefined') return false;
    CacheService.getScriptCache().remove(qltdNotificationsSummaryCacheKey_(email, role));
    return true;
  } catch (error) {
    return false;
  }
}

function qltdNotificationsMarkRead_(payload) {
  const action = 'notifications_markread';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_NOTIFICATIONS_SOURCE);
  if (auth.error) return auth.error;
  const notificationId = String(payload && (payload.notificationId || payload.NotificationId) || '').trim();
  if (!notificationId) {
    return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, 'NOTIFICATION_ID_REQUIRED', 'NotificationId is required.', { email: auth.email });
  }
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire notification write lock.', { email: auth.email, notificationId: notificationId });
    }
    const read = qltdNotificationsRead_();
    if (read.error) {
      return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, read.error.code, read.error.message, { email: auth.email, notificationId: notificationId });
    }
    const target = read.notifications.find(function(notification) { return notification.notificationId === notificationId; });
    if (!target) {
      return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, 'NOTIFICATION_NOT_FOUND', 'Notification not found.', { email: auth.email, notificationId: notificationId });
    }
    if (target.recipientEmail !== auth.email) {
      return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, 'ACCESS_DENIED', 'You cannot update another user notification.', { email: auth.email, notificationId: notificationId });
    }
    if (target.isRead) {
      return qltdWorkOk_(QLTD_NOTIFICATIONS_SOURCE, action, {
        notification: target,
        updated: false,
        idempotent: true
      }, [], { email: auth.email, notificationId: notificationId });
    }
    const readAt = qltdWorkNowIso_();
    read.sheet.getRange(target.rowNumber, 14, 1, 2).setValues([[true, readAt]]);
    qltdNotificationsSummaryCacheInvalidate_(auth.email, auth.user && auth.user.role || target.recipientRole);
    return qltdWorkOk_(QLTD_NOTIFICATIONS_SOURCE, action, {
      notification: Object.assign({}, target, { isRead: true, readAt: readAt }),
      updated: true,
      idempotent: false
    }, [], { email: auth.email, notificationId: notificationId });
  } catch (error) {
    return qltdWorkError_(QLTD_NOTIFICATIONS_SOURCE, action, 'NOTIFICATION_MARK_READ_FAILED', qltdBudgetSafeErrorMessage_(error), { email: auth.email, notificationId: notificationId });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdNotificationsTryCreatePendingNoLock_(update) {
  const type = update && update.itemType === 'PB_DETAIL'
    ? QLTD_NOTIFICATIONS_TYPES.PB_DETAIL_PENDING
    : QLTD_NOTIFICATIONS_TYPES.MASTER_COMPLETION_PENDING;
  const action = 'notification_create_pending';
  try {
    const users = qltdWorkListUsers_().filter(function(user) {
      if (user.status !== 'ACTIVE') return false;
      if (type === QLTD_NOTIFICATIONS_TYPES.PB_DETAIL_PENDING) {
        return user.email !== update.updatedBy &&
          qltdCanManageProjectDept_(user, update.projectCode, update.deptCode, null);
      }
      return user.role === 'ADMIN' || user.role === 'PMO';
    });
    return qltdNotificationsTryCreateNoLock_(action, type, update, users, {});
  } catch (error) {
    return qltdNotificationsSafeFailure_(action, type, update && update.updateId, 'NOTIFICATION_RECIPIENT_LOOKUP_FAILED', error);
  }
}

function qltdNotificationsTryFinalizeReviewNoLock_(update) {
  const action = 'notification_finalize_review';
  const sourceRequestId = update && update.updateId;
  const resolveResult = qltdNotificationsTryResolveNoLock_(action, update);
  const type = update && update.approvalStatus === 'APPROVED'
    ? QLTD_NOTIFICATIONS_TYPES.UPDATE_APPROVED
    : QLTD_NOTIFICATIONS_TYPES.UPDATE_REJECTED;
  let createResult;
  try {
    const submitter = qltdUsersGetByEmail_(update && update.updatedBy);
    const recipients = submitter && submitter.status === 'ACTIVE' ? [submitter] : [];
    createResult = qltdNotificationsTryCreateNoLock_(action, type, update, recipients, {
      reviewReason: update && update.reviewReason
    });
  } catch (error) {
    createResult = qltdNotificationsSafeFailure_(action, type, sourceRequestId, 'NOTIFICATION_RESULT_CREATE_FAILED', error);
  }
  return {
    resolvedCount: Number(resolveResult.resolvedCount || 0),
    createdCount: Number(createResult.createdCount || 0),
    duplicateCount: Number(createResult.duplicateCount || 0),
    warnings: (resolveResult.warnings || []).concat(createResult.warnings || [])
  };
}

function qltdNotificationsTryResolveNoLock_(action, update) {
  try {
    return qltdNotificationsResolveNoLock_(update);
  } catch (error) {
    return qltdNotificationsSafeFailure_(action, 'PENDING', update && update.updateId, 'NOTIFICATION_RESOLVE_FAILED', error);
  }
}

function qltdNotificationsTryCreateNoLock_(action, type, update, recipients, options) {
  try {
    return qltdNotificationsCreateNoLock_(type, update, recipients || [], options || {});
  } catch (error) {
    return qltdNotificationsSafeFailure_(action, type, update && update.updateId, 'NOTIFICATION_CREATE_FAILED', error);
  }
}

function qltdNotificationsCreateNoLock_(type, update, recipients, options) {
  if (!QLTD_NOTIFICATIONS_TYPES[type]) throw new Error('NOTIFICATION_TYPE_INVALID');
  if (!update || !update.updateId) throw new Error('NOTIFICATION_SOURCE_REQUEST_REQUIRED');
  const read = qltdNotificationsRead_();
  if (read.error) throw new Error(read.error.code + ': ' + read.error.message);
  const seen = {};
  read.notifications.forEach(function(notification) {
    seen[qltdNotificationsDuplicateKey_(notification.recipientEmail, notification.type, notification.sourceRequestId)] = true;
  });
  const now = qltdWorkNowIso_();
  const rows = [];
  let duplicateCount = 0;
  (recipients || []).forEach(function(user) {
    const email = qltdWorkNormalizeEmail_(user && user.email);
    const role = qltdWorkNormalizeRole_(user && user.role);
    if (!email || user.status !== 'ACTIVE' || !qltdUsersIsValidRole_(role)) return;
    const key = qltdNotificationsDuplicateKey_(email, type, update.updateId);
    if (seen[key]) {
      duplicateCount += 1;
      return;
    }
    seen[key] = true;
    const content = qltdNotificationsContent_(type, update, options || {});
    const rowObject = {
      NotificationId: 'NTF_' + Utilities.getUuid(),
      RecipientEmail: email,
      RecipientRole: role,
      Type: type,
      EntityType: QLTD_NOTIFICATIONS_ENTITY_TYPE,
      EntityId: update.updateId,
      ProjectCode: qltdWorkNormalizeCode_(update.projectCode),
      DepartmentCode: qltdWorkNormalizeCode_(update.deptCode),
      WeekStart: qltdNotificationsWeekStart_(update.weekCode),
      TabKey: type === QLTD_NOTIFICATIONS_TYPES.PB_DETAIL_PENDING || type === QLTD_NOTIFICATIONS_TYPES.MASTER_COMPLETION_PENDING ? 'APPROVALS' : 'WEEKLY_UPDATE',
      ItemKey: String(update.itemId || '').trim(),
      Title: content.title,
      Message: content.message,
      IsRead: false,
      ReadAt: '',
      Status: QLTD_NOTIFICATIONS_STATUS.OPEN,
      CreatedAt: now,
      ResolvedAt: '',
      SourceRequestId: update.updateId
    };
    rows.push(QLTD_NOTIFICATIONS_HEADERS.map(function(header) { return rowObject[header]; }));
  });
  if (rows.length) {
    const startRow = Math.max(read.sheet.getLastRow() + 1, 2);
    read.sheet.getRange(startRow, 1, rows.length, QLTD_NOTIFICATIONS_HEADERS.length).setValues(rows);
    (recipients || []).forEach(function(user) {
      qltdNotificationsSummaryCacheInvalidate_(user && user.email, user && user.role);
    });
  }
  return {
    createdCount: rows.length,
    duplicateCount: duplicateCount,
    skipped: !rows.length,
    warnings: []
  };
}

function qltdNotificationsResolveNoLock_(update) {
  if (!update || !update.updateId) throw new Error('NOTIFICATION_SOURCE_REQUEST_REQUIRED');
  const read = qltdNotificationsRead_();
  if (read.error) throw new Error(read.error.code + ': ' + read.error.message);
  const now = qltdWorkNowIso_();
  const rowNumbers = [];
  const affectedRecipients = {};
  read.notifications.forEach(function(notification) {
    const pendingType = notification.type === QLTD_NOTIFICATIONS_TYPES.PB_DETAIL_PENDING ||
      notification.type === QLTD_NOTIFICATIONS_TYPES.MASTER_COMPLETION_PENDING;
    if (notification.sourceRequestId !== update.updateId || !pendingType || notification.status !== QLTD_NOTIFICATIONS_STATUS.OPEN) return;
    rowNumbers.push(notification.rowNumber);
    affectedRecipients[notification.recipientEmail] = notification.recipientRole;
  });
  if (rowNumbers.length) {
    read.sheet.getRangeList(rowNumbers.map(function(rowNumber) { return 'P' + rowNumber; }))
      .setValue(QLTD_NOTIFICATIONS_STATUS.RESOLVED);
    read.sheet.getRangeList(rowNumbers.map(function(rowNumber) { return 'R' + rowNumber; }))
      .setValue(now);
    Object.keys(affectedRecipients).forEach(function(email) {
      qltdNotificationsSummaryCacheInvalidate_(email, affectedRecipients[email]);
    });
  }
  return { resolvedCount: rowNumbers.length, warnings: [] };
}

function qltdNotificationsRead_() {
  const sheet = getCurrentSpreadsheet_().getSheetByName(QLTD_NOTIFICATIONS_SHEET);
  if (!sheet) return { error: { code: 'NOTIFICATIONS_NOT_READY', message: 'NOTIFICATIONS sheet has not been set up.' } };
  const inspection = qltdNotificationsInspectSheet_(sheet);
  if (!inspection.headerMatches) return { error: { code: 'NOTIFICATIONS_HEADER_MISMATCH', message: 'NOTIFICATIONS headers do not match.' } };
  const lastRow = sheet.getLastRow();
  const rawRows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, QLTD_NOTIFICATIONS_HEADERS.length).getValues()
    : [];
  if (typeof qltdPerfIncrement_ === 'function' && rawRows.length) {
    qltdPerfIncrement_('sheetRangeReads');
    qltdPerfIncrement_('notificationRowsRead', rawRows.length);
  }
  const notifications = rawRows.map(function(row, index) {
    const object = {};
    QLTD_NOTIFICATIONS_HEADERS.forEach(function(header, column) { object[header] = row[column]; });
    return qltdNotificationsNormalize_(object, index + 2);
  }).filter(function(notification) { return !!notification.notificationId; });
  return { sheet: sheet, rawRows: rawRows, notifications: notifications, error: null };
}

function qltdNotificationsNormalize_(object, rowNumber) {
  return {
    notificationId: String(object.NotificationId || '').trim(),
    recipientEmail: qltdWorkNormalizeEmail_(object.RecipientEmail),
    recipientRole: qltdWorkNormalizeRole_(object.RecipientRole),
    type: String(object.Type || '').trim().toUpperCase(),
    entityType: String(object.EntityType || '').trim().toUpperCase(),
    entityId: String(object.EntityId || '').trim(),
    projectCode: qltdWorkNormalizeCode_(object.ProjectCode),
    departmentCode: qltdWorkNormalizeCode_(object.DepartmentCode),
    weekStart: qltdNotificationsCellText_(object.WeekStart),
    tabKey: String(object.TabKey || '').trim().toUpperCase(),
    itemKey: String(object.ItemKey || '').trim(),
    title: String(object.Title || ''),
    message: String(object.Message || ''),
    isRead: object.IsRead === true || String(object.IsRead || '').trim().toUpperCase() === 'TRUE',
    readAt: qltdNotificationsCellText_(object.ReadAt),
    status: String(object.Status || '').trim().toUpperCase(),
    createdAt: qltdNotificationsCellText_(object.CreatedAt),
    resolvedAt: qltdNotificationsCellText_(object.ResolvedAt),
    sourceRequestId: String(object.SourceRequestId || '').trim(),
    rowNumber: rowNumber
  };
}

function qltdNotificationsContent_(type, update, options) {
  if (type === QLTD_NOTIFICATIONS_TYPES.PB_DETAIL_PENDING) {
    return { title: 'Có cập nhật công việc chờ duyệt', message: 'Công việc ' + String(update.itemId || '') + ' có cập nhật tuần mới chờ duyệt.' };
  }
  if (type === QLTD_NOTIFICATIONS_TYPES.MASTER_COMPLETION_PENDING) {
    return { title: 'Cập nhật hoàn thành mục tiêu chờ duyệt', message: 'Mục tiêu ' + String(update.itemId || '') + ' có đề xuất hoàn thành chờ duyệt.' };
  }
  if (type === QLTD_NOTIFICATIONS_TYPES.UPDATE_APPROVED) {
    return { title: 'Cập nhật của bạn đã được duyệt', message: 'Cập nhật tuần cho ' + String(update.itemId || '') + ' đã được duyệt.' };
  }
  const reason = String(options && options.reviewReason || '').trim().replace(/[\r\n]+/g, ' ').slice(0, QLTD_NOTIFICATIONS_REJECTION_REASON_MAX);
  return {
    title: 'Cập nhật của bạn đã bị trả lại',
    message: 'Cập nhật tuần cho ' + String(update.itemId || '') + ' đã bị trả lại.' + (reason ? ' Lý do: ' + reason : '')
  };
}

function qltdNotificationsWeekStart_(weekCode) {
  const text = String(weekCode || '').trim().toUpperCase().replace(/^WEEK-/, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function qltdNotificationsDuplicateKey_(email, type, sourceRequestId) {
  return [qltdWorkNormalizeEmail_(email), String(type || '').trim().toUpperCase(), String(sourceRequestId || '').trim()].join('|');
}

function qltdNotificationsCellText_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  return String(value || '').trim();
}

function qltdNotificationsSafeFailure_(action, type, sourceRequestId, code, error) {
  const detail = qltdBudgetSafeErrorMessage_(error);
  Logger.log(JSON.stringify({
    action: action,
    type: type,
    sourceRequestId: String(sourceRequestId || ''),
    code: code,
    message: detail
  }));
  return {
    createdCount: 0,
    resolvedCount: 0,
    duplicateCount: 0,
    warnings: [qltdWorkWarning_(code, 'Notification processing failed; the main workflow was kept successful.', {
      type: type,
      sourceRequestId: String(sourceRequestId || ''),
      detail: detail
    })]
  };
}
