/**
 * Dormant one-way Cong_viec -> Project360 client. No trigger/schema/HTTP work on load.
 * Uses its own handlers; the existing Schedule Engine and trigger installers are unchanged.
 */
const P360_SYNC_V1 = {
  CONTRACT: 'ENTIZ_CONG_VIEC_SHEET_V1', SHEET: 'Cong_viec', HEADER_ROW: 4, START_ROW: 5,
  UID_COL: 31, MAX_ROWS: 2000, PREFIX: 'P360_SYNC_', DIRTY: 'P360_SYNC_DIRTY_'
};

function p360SyncProperties_() { return PropertiesService.getScriptProperties(); }

function p360WithLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function p360SyncConfig_() {
  const props = p360SyncProperties_();
  const config = {
    enabled: props.getProperty('P360_SYNC_ENABLED') === 'true',
    fileId: props.getProperty('P360_SYNC_FILE_ID'),
    projectId: props.getProperty('P360_SYNC_PROJECT_ID'),
    sourceId: props.getProperty('P360_SYNC_SOURCE_ID'),
    apiBase: props.getProperty('P360_SYNC_API_BASE'),
    token: props.getProperty('P360_SYNC_TOKEN')
  };
  return config;
}

function p360SyncSheet_() {
  const config = p360SyncConfig_();
  if (!config.fileId) throw new Error('P360 sync: configure FILE_ID explicitly');
  const sheet = SpreadsheetApp.openById(config.fileId).getSheetByName(P360_SYNC_V1.SHEET);
  if (!sheet) throw new Error('P360 sync: Cong_viec missing');
  return sheet;
}

function p360EntityKind_(row) {
  // Reuse the proven classifier, never infer tasks from text alone.
  if (laDongTaskTienDoV1_(row)) return 'WORK_ITEM';
  if (laDongNhomWbsV1_(row)) return 'WBS_NODE';
  return 'RETAIN_ONLY';
}

function ensureCongViecSyncUidSchema() {
  return p360WithLock_(function () {
    const sheet = p360SyncSheet_();
    if (sheet.getMaxColumns() < 31) sheet.insertColumnsAfter(30, 1);
    const header = sheet.getRange(4, 31).getValue();
    if (header && header !== 'SYNC_UID') throw new Error('P360 sync: AE already has another meaning');
    if (!header) sheet.getRange(4, 31).setValue('SYNC_UID');
    sheet.hideColumns(31);
    // Protection is idempotent and does not change A:AD permissions.
    const description = 'Project360 immutable SYNC_UID';
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    let protection = protections.find(function (value) { return value.getDescription() === description; });
    if (!protection) {
      protection = sheet.getRange(4, 31, sheet.getMaxRows() - 3, 1).protect();
      protection.setDescription(description);
    }
    // Google's documented sequence keeps the effective user/owner and removes
    // ordinary range/domain editors. This applies only to the AE protection.
    protection.setWarningOnly(false);
    protection.addEditor(Session.getEffectiveUser());
    protection.removeEditors(protection.getEditors());
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
    return { header: 'SYNC_UID', column: 31 };
  });
}

function p360ReadSnapshot_() {
  const sheet = p360SyncSheet_();
  if (sheet.getMaxColumns() < 31) throw new Error('P360 sync: AE schema not provisioned');
  const count = Math.max(0, sheet.getLastRow() - 4);
  if (count > P360_SYNC_V1.MAX_ROWS) throw new Error('P360 sync: snapshot exceeds 2000-row limit');
  const header = sheet.getRange(4, 1, 1, 31).getDisplayValues()[0];
  if (header[30] !== 'SYNC_UID') throw new Error('P360 sync: AE header mismatch');
  const values = count ? sheet.getRange(5, 1, count, 31).getDisplayValues() : [];
  return { sheet: sheet, header: header, values: values };
}

function p360ValidateUidRows_(values, allowMissing) {
  const seen = {};
  const errors = [];
  values.forEach(function (row, index) {
    const uid = row[30];
    const entity = p360EntityKind_(row) !== 'RETAIN_ONLY';
    if (!uid && (!entity || allowMissing)) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uid)) {
      errors.push({ sourceRow: index + 5, code: 'SYNC_UID_INVALID' });
    }
    if (uid && seen[uid]) errors.push({ sourceRow: index + 5, code: 'SYNC_UID_DUPLICATE' });
    if (uid) seen[uid] = true;
  });
  return errors;
}

function validateCongViecSyncUid() {
  return p360ValidateUidRows_(p360ReadSnapshot_().values, false);
}

function backfillCongViecSyncUid() {
  return p360WithLock_(function () {
    const snapshot = p360ReadSnapshot_();
    const errors = p360ValidateUidRows_(snapshot.values, true);
    if (errors.length) throw new Error('P360 sync: invalid/duplicate UID; no backfill written');
    let generated = 0;
    const writes = [];
    snapshot.values.forEach(function (row, index) {
      if (!row[30] && p360EntityKind_(row) !== 'RETAIN_ONLY') {
        const uid = Utilities.getUuid().toLowerCase(); generated++;
        const previous = writes[writes.length - 1];
        if (previous && previous.row + previous.values.length === index + 5) previous.values.push([uid]);
        else writes.push({ row: index + 5, values: [[uid]] });
      }
    });
    writes.forEach(function (write) { snapshot.sheet.getRange(write.row, 31, write.values.length, 1).setValues(write.values); });
    return { generated: generated };
  });
}

function project360CongViecOnEdit(e) {
  if (!e || !e.range || !p360SyncConfig_().enabled) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'Cong_viec' || sheet.getParent().getId() !== p360SyncConfig_().fileId) return;
  const first = Math.max(5, e.range.getRow());
  const last = e.range.getRow() + e.range.getNumRows() - 1;
  if (last < first || e.range.getColumn() > 31) return;
  const rows = sheet.getRange(first, 1, last - first + 1, 31).getDisplayValues();
  p360WithLock_(function () {
    const props = p360SyncProperties_();
    rows.forEach(function (row) {
      if (p360EntityKind_(row) !== 'RETAIN_ONLY' && row[30]) {
        props.setProperty(P360_SYNC_V1.DIRTY + row[30], Utilities.getUuid());
      }
    });
    // Missing UIDs/classification changes are captured by reconciliation, without HTTP on edit.
  });
}

function p360Digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function p360SnapshotPayload_(snapshot) {
  const config = p360SyncConfig_();
  return {
    contractVersion: P360_SYNC_V1.CONTRACT, externalFileId: config.fileId, sheetName: 'Cong_viec',
    fullSnapshot: true, header: snapshot.header,
    rows: snapshot.values.map(function (cells, index) {
      return { sourceRow: index + 5, cells: cells, rowHash: p360Digest_(JSON.stringify(cells.slice(0, 30))) };
    })
  };
}

function p360LogSync_(record) {
  // Aggregate counters only. Never log token, URL headers, source notes, or remote error body.
  console.log(JSON.stringify(record));
}

function project360CongViecSyncWorker() {
  const config = p360SyncConfig_();
  if (!config.enabled) return { status: 'DISABLED' };
  if (!config.token || !config.projectId || !config.sourceId ||
      !/^https:\/\//.test(config.apiBase || '')) throw new Error('P360 sync: incomplete HTTPS configuration');
  const started = Date.now();
  const lease = Utilities.getUuid();
  const acquired = p360WithLock_(function () {
    const props = p360SyncProperties_();
    const busy = Number(props.getProperty('P360_SYNC_WORKER_UNTIL') || '0');
    if (busy > Date.now()) return false;
    props.setProperty('P360_SYNC_WORKER_LEASE', lease);
    props.setProperty('P360_SYNC_WORKER_UNTIL', String(Date.now() + 360000));
    return true;
  });
  if (!acquired) return { status: 'BUSY' };
  try {
    const snapshot = p360ReadSnapshot_();
    const errors = p360ValidateUidRows_(snapshot.values, false);
    if (errors.length) {
      p360LogSync_({ event: 'sync_end', status: 'BLOCKED_UID', errors: errors.length,
        durationMs: Date.now() - started });
      return { status: 'BLOCKED_UID', errors: errors };
    }
    const payload = p360SnapshotPayload_(snapshot);
    const hash = p360Digest_(JSON.stringify(payload));
    const state = p360WithLock_(function () {
      const props = p360SyncProperties_();
      const all = props.getProperties();
      const dirty = {};
      Object.keys(all).filter(function (key) { return key.indexOf(P360_SYNC_V1.DIRTY) === 0; })
        .forEach(function (key) { dirty[key.slice(P360_SYNC_V1.DIRTY.length)] = all[key]; });
      if (props.getProperty('P360_SYNC_ACK_HASH') === hash && !Object.keys(dirty).length) return null;
      let pending = JSON.parse(props.getProperty('P360_SYNC_PENDING') || 'null');
      if (!pending || pending.hash !== hash) {
        const revision = Number(props.getProperty('P360_SYNC_REVISION') || '0') + 1;
        props.setProperty('P360_SYNC_REVISION', String(revision));
        pending = { hash: hash, revision: revision, requestId: Utilities.getUuid() };
        props.setProperty('P360_SYNC_PENDING', JSON.stringify(pending));
      }
      return { pending: pending, dirty: dirty };
    });
    if (!state) return { status: 'UNCHANGED' };
    payload.sourceRevision = state.pending.revision;
    payload.requestId = state.pending.requestId;
    p360LogSync_({ event: 'sync_start', revision: payload.sourceRevision, requestId: payload.requestId,
      rows: payload.rows.length });
    const url = config.apiBase.replace(/\/$/, '') + '/api/entiz/projects/' +
      encodeURIComponent(config.projectId) + '/schedule-sources/' + encodeURIComponent(config.sourceId) + '/sync';
    const response = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + config.token }, payload: JSON.stringify(payload),
      muteHttpExceptions: true, followRedirects: false
    });
    const http = response.getResponseCode();
    if (http !== 200) {
      p360LogSync_({ event: 'sync_end', http: http, status: 'RETRY', durationMs: Date.now() - started });
      return { status: 'RETRY', http: http };
    }
    const result = JSON.parse(response.getContentText());
    if (!Array.isArray(result.ackUids) || !result.committable) {
      p360LogSync_({ event: 'sync_end', status: 'BLOCKED_BATCH', http: http,
        summary: result.summary, durationMs: Date.now() - started });
      return { status: 'BLOCKED_BATCH' };
    }
    p360WithLock_(function () {
      const props = p360SyncProperties_();
      result.ackUids.concat(result.ackMissingUids || []).forEach(function (uid) {
        const key = P360_SYNC_V1.DIRTY + uid;
        if (state.dirty[uid] && props.getProperty(key) === state.dirty[uid]) props.deleteProperty(key);
      });
      const pending = JSON.parse(props.getProperty('P360_SYNC_PENDING') || 'null');
      if (pending && pending.requestId === payload.requestId) {
        props.setProperty('P360_SYNC_ACK_HASH', hash);
        props.deleteProperty('P360_SYNC_PENDING');
      }
    });
    p360LogSync_({ event: 'sync_end', revision: payload.sourceRevision, http: http,
      summary: result.summary, durationMs: Date.now() - started });
    return { status: 'SYNCED', summary: result.summary };
  } catch (_error) {
    // A transport exception may contain request details. Retain queue/pending state
    // and log only a fixed code, never the exception message or remote body.
    p360LogSync_({ event: 'sync_end', status: 'RETRY', errorCode: 'TRANSPORT_OR_CLIENT_ERROR',
      durationMs: Date.now() - started });
    return { status: 'RETRY' };
  } finally {
    p360WithLock_(function () {
      const props = p360SyncProperties_();
      if (props.getProperty('P360_SYNC_WORKER_LEASE') === lease) {
        props.deleteProperty('P360_SYNC_WORKER_LEASE');
        props.deleteProperty('P360_SYNC_WORKER_UNTIL');
      }
    });
  }
}

function project360CongViecReconcile() {
  // Same full-snapshot hash detects script edits, missing rows, sort, and missed onEdit.
  return project360CongViecSyncWorker();
}

function installProject360CongViecSyncTriggers() {
  const config = p360SyncConfig_();
  if (!config.enabled) throw new Error('P360 sync: activation must be explicit');
  const existing = ScriptApp.getProjectTriggers().map(function (trigger) { return trigger.getHandlerFunction(); });
  if (existing.indexOf('project360CongViecOnEdit') < 0) {
    ScriptApp.newTrigger('project360CongViecOnEdit').forSpreadsheet(config.fileId).onEdit().create();
  }
  [['project360CongViecSyncWorker', 1], ['project360CongViecReconcile', 10]].forEach(function (entry) {
    if (existing.indexOf(entry[0]) < 0) ScriptApp.newTrigger(entry[0]).timeBased().everyMinutes(entry[1]).create();
  });
  return { installed: true };
}

