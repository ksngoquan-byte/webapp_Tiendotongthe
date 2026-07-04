var QLTD_PERF_REQUEST_CONTEXT_ = null;

function qltdPerfStartRequest_(action, params) {
  QLTD_PERF_REQUEST_CONTEXT_ = {
    action: String(action || 'unknown').trim() || 'unknown',
    requestId: Utilities.getUuid(),
    startedAt: Date.now(),
    debug: String(params && params.debugPerf || '').trim() === '1'
  };
}

function qltdPerfAttach_(payload) {
  if (!payload || typeof payload !== 'object' || !QLTD_PERF_REQUEST_CONTEXT_) return payload;

  const context = QLTD_PERF_REQUEST_CONTEXT_;
  const existing = payload.performance && typeof payload.performance === 'object'
    ? payload.performance
    : {};
  const rowsRead = Number(existing.rowsRead || 0);
  const columnsRead = Number(existing.columnsRead || 0);
  const performance = Object.assign({}, existing, {
    requestId: context.requestId,
    action: context.action,
    serverMs: Math.max(0, Date.now() - context.startedAt),
    rowsRead: rowsRead,
    cellsRead: Number(existing.cellsRead || (rowsRead && columnsRead ? rowsRead * columnsRead : 0)),
    recordCount: qltdPerfRecordCount_(payload),
    cacheHit: !!existing.cacheHit
  });

  payload.performance = performance;
  return payload;
}

function qltdPerfFinalizeJson_(payload) {
  const observed = qltdPerfAttach_(payload);
  let serialized = JSON.stringify(observed);
  if (observed && observed.performance) {
    observed.performance.responseBytes = qltdPerfUtf8Bytes_(serialized);
    serialized = JSON.stringify(observed);
    observed.performance.responseBytes = qltdPerfUtf8Bytes_(serialized);
    serialized = JSON.stringify(observed);
  }

  if (QLTD_PERF_REQUEST_CONTEXT_ && QLTD_PERF_REQUEST_CONTEXT_.debug && observed && observed.performance) {
    Logger.log(JSON.stringify(observed.performance));
  }
  return serialized;
}

function qltdPerfRecordCount_(payload) {
  if (payload.performance && isFinite(Number(payload.performance.recordCount))) {
    return Math.max(0, Number(payload.performance.recordCount));
  }
  if (Array.isArray(payload.data)) return payload.data.length;
  if (Array.isArray(payload.projects)) return payload.projects.length;
  if (Array.isArray(payload.departments)) return payload.departments.length;
  if (payload.data && Array.isArray(payload.data.notifications)) return payload.data.notifications.length;
  if (payload.data && isFinite(Number(payload.data.totalCount))) return Math.max(0, Number(payload.data.totalCount));
  return 0;
}

function qltdPerfUtf8Bytes_(text) {
  try {
    return Utilities.newBlob(String(text || '')).getBytes().length;
  } catch (error) {
    return String(text || '').length;
  }
}
