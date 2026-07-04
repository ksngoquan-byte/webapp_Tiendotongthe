const QLTD_GANTT_DATA_SOURCE = 'gantt_data_service';
const QLTD_GANTT_FALLBACK_SHEETS = ['Cong_viec', 'Tien_do_tong_hop'];
const QLTD_GANTT_HEADER_SCAN_ROWS = 12;
const QLTD_GANTT_MAX_SCAN_ROWS = 50000;
const QLTD_GANTT_CACHE_VERSION = 'v2';
const QLTD_GANTT_CACHE_TTL_SECONDS = 120;
const QLTD_GANTT_CACHE_CHUNK_CHARS = 25000;
const QLTD_GANTT_CACHE_MAX_CHUNKS = 60;
const QLTD_GANTT_LOCK_WAIT_MS = 15000;

const QLTD_GANTT_HEADER_ALIASES = {
  id: ['uid', 'id', 'taskid', 'task_id', 'so_tham_chieu', 'ref'],
  code: ['ma_cong_viec', 'ma_cv', 'macv', 'code', 'mastercode', 'master_code', 'ma_cong_viec_mau', 'task_code'],
  wbs: ['wbs', 'stt', 'ma_wbs', 'cap_wbs', 'wbs_code'],
  text: ['cong_viec_pham_vi', 'cong_viec', 'ten_cong_viec', 'noi_dung_cong_viec', 'pham_vi_cong_viec', 'noi_dung', 'task', 'task_name', 'ten_task', 'name', 'text', 'muc_tieu', 'ten_muc_tieu', 'hang_muc'],
  hangMuc: ['hang_muc', 'hangmuc'],
  parent: ['parent', 'parent_id', 'parentid', 'ma_cha', 'uid_cha', 'cong_viec_cha', 'parent_uid'],
  owner: ['chu_tri', 'phong_ban_chu_tri', 'don_vi_chu_tri', 'owner', 'department', 'dept', 'deptcode', 'bo_phan', 'phong_ban'],
  status: ['trang_thai', 'status', 'tinh_trang', 'trang_thai_thuc_hien'],
  progress: ['tien_do', 'phan_tram', 'percent', 'percentcomplete', 'percent_complete', 'progress', 'hoan_thanh', 'ty_le_hoan_thanh'],
  startPlan: ['bat_dau_ke_hoach', 'bd_ke_hoach', 'start_plan', 'planned_start', 'start_date', 'bd', 'ngay_bat_dau'],
  endPlan: ['ket_thuc_ke_hoach', 'kt_ke_hoach', 'end_plan', 'planned_end', 'end_date', 'kt', 'deadline', 'ngay_ket_thuc', 'hoan_thanh_ke_hoach'],
  startActual: ['bat_dau_thuc_te', 'bd_thuc_te', 'actual_start', 'start_actual'],
  endActual: ['ket_thuc_thuc_te', 'kt_thuc_te', 'actual_end', 'end_actual', 'hoan_thanh_thuc_te'],
  predecessor: ['cong_viec_lien_ket', 'lien_ket', 'predecessor', 'predecessors', 'phu_thuoc', 'dependency', 'dependencies', 'tien_nhiem'],
  linkType: ['loai_lien_ket', 'link_type', 'dependency_type'],
  milestone: ['moc_chinh', 'milestone', 'is_milestone', 'ma_moc_he_thong'],
  note: ['ghi_chu', 'note'],
  updateNote: ['ghi_chu_cap_nhat', 'update_note', 'cap_nhat']
};

function qltdGanttGetDataForProject_(projectCode) {
  const startedAt = Date.now();
  const code = qltdProjectsNormalizeCode_(projectCode);

  if (!code) {
    return qltdGanttError_('MISSING_PROJECT_CODE', 'Missing projectCode', [], {
      performance: qltdGanttPerformance_(startedAt, false, 0, 0, 0)
    });
  }

  const cached = qltdGanttCacheGet_(code);
  if (cached) {
    cached.performance = Object.assign({}, cached.performance || {}, {
      cacheHit: true,
      requestDurationMs: Date.now() - startedAt
    });
    return cached;
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_GANTT_LOCK_WAIT_MS);

    const cachedAfterWait = qltdGanttCacheGet_(code);
    if (cachedAfterWait) {
      cachedAfterWait.performance = Object.assign({}, cachedAfterWait.performance || {}, {
        cacheHit: true,
        waitedForCache: true,
        requestDurationMs: Date.now() - startedAt
      });
      return cachedAfterWait;
    }

    if (!locked) {
      return qltdGanttError_('GANTT_BUSY_RETRY', 'Gantt data is being prepared by another request. Please retry shortly.', [{
        type: 'GANTT_BUSY_RETRY',
        projectCode: code,
        retryAfterMs: 1500
      }], {
        projectCode: code,
        retryAfterMs: 1500,
        performance: qltdGanttPerformance_(startedAt, false, 0, 0, 0)
      });
    }

    const result = qltdGanttBuildDataForProject_(code, startedAt);
    if (result && result.success !== false) {
      const cacheResult = qltdGanttCachePut_(code, result);
      if (cacheResult && cacheResult.warning) {
        result.warnings = (result.warnings || []).concat([cacheResult.warning]);
      }
    }
    return result;
  } catch (error) {
    return qltdGanttError_('GANTT_BUILD_FAILED', error.message || String(error), [], {
      projectCode: code,
      performance: qltdGanttPerformance_(startedAt, false, 0, 0, 0)
    });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdGanttBuildDataForProject_(code, startedAt) {
  const warnings = [];
  const project = qltdProjectsGetByCode_(code);
  if (!project || !project.masterSpreadsheetId) {
    return qltdGanttError_('PROJECT_OR_MASTER_NOT_FOUND', 'Project not found or MasterSpreadsheetId is missing', warnings, {
      projectCode: code,
      performance: qltdGanttPerformance_(startedAt, false, 0, 0, 0)
    });
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(project.masterSpreadsheetId);
  } catch (error) {
    return qltdGanttError_('MASTER_SPREADSHEET_OPEN_FAILED', error.message || String(error), warnings, {
      projectCode: project.projectCode,
      projectName: project.projectName || '',
      performance: qltdGanttPerformance_(startedAt, false, 0, 0, 0)
    });
  }

  const sheetResult = qltdGanttFindSourceSheet_(spreadsheet, project, warnings);
  if (!sheetResult.sheet) {
    return qltdGanttError_('TASK_SHEET_NOT_FOUND', 'Neither default task sheet nor fallback task sheet exists', warnings, {
      projectCode: project.projectCode,
      projectName: project.projectName || '',
      performance: qltdGanttPerformance_(startedAt, false, 0, 0, 0)
    });
  }

  const readResult = qltdGanttReadSourceValues_(sheetResult.sheet, warnings);
  const values = readResult.values;
  const emptySummary = qltdGanttSummarizeTasks_([]);
  if (!values || values.length < 2) {
    warnings.push({ type: 'TASK_SHEET_EMPTY', sheetName: sheetResult.sheetName });
    return qltdGanttSuccess_(project, sheetResult.sheetName, [], [], emptySummary, warnings,
      qltdGanttPerformance_(startedAt, false, readResult.rowsRead, readResult.columnsRead, 0));
  }

  const detected = qltdGanttDetectHeader_(values);
  if (!detected) {
    warnings.push({ type: 'GANTT_HEADER_NOT_FOUND', sheetName: sheetResult.sheetName });
    return qltdGanttSuccess_(project, sheetResult.sheetName, [], [], emptySummary, warnings,
      qltdGanttPerformance_(startedAt, false, readResult.rowsRead, readResult.columnsRead, 0));
  }

  ['id', 'text', 'startPlan', 'endPlan'].forEach(function(group) {
    if (qltdGanttFindAliasIndex_(detected.headerIndex, group) < 0) {
      warnings.push({ type: 'MISSING_IMPORTANT_COLUMN', columnGroup: group, sheetName: sheetResult.sheetName });
    }
  });

  const tasks = qltdGanttBuildTasks_(values, detected, warnings, sheetResult.sheetName);
  qltdTaskContextResolveDataset_(tasks, { projectCode: project.projectCode }, warnings);
  const links = qltdTaskContextFilterLinks_(qltdGanttBuildLinks_(tasks, warnings), tasks, warnings);
  tasks.forEach(function(task) {
    delete task._predecessor;
    delete task._linkType;
  });

  return qltdGanttSuccess_(project, sheetResult.sheetName, qltdTaskContextBuildPublicDataset_(tasks), links,
    qltdGanttSummarizeTasks_(tasks), warnings,
    qltdGanttPerformance_(startedAt, false, readResult.rowsRead, readResult.columnsRead, tasks.length));
}

function qltdGanttReadSourceValues_(sheet, warnings) {
  const maxRows = sheet.getMaxRows();
  const maxColumns = sheet.getMaxColumns();
  const lastColumn = Math.max(1, Math.min(sheet.getLastColumn() || maxColumns || 1, maxColumns || 1));
  const headerRowCount = Math.max(1, Math.min(QLTD_GANTT_HEADER_SCAN_ROWS, maxRows));
  const headerValues = sheet.getRange(1, 1, headerRowCount, lastColumn).getValues();
  const detected = qltdGanttDetectHeader_(headerValues);

  if (!detected) {
    const fallbackLastRow = Math.max(1, Math.min(sheet.getLastRow() || headerRowCount, QLTD_GANTT_MAX_SCAN_ROWS));
    return {
      values: sheet.getRange(1, 1, fallbackLastRow, lastColumn).getValues(),
      rowsRead: fallbackLastRow,
      columnsRead: lastColumn
    };
  }

  const idColumnIndex = qltdGanttFindAliasIndex_(detected.headerIndex, 'id');
  const textColumnIndex = qltdGanttFindAliasIndex_(detected.headerIndex, 'text');
  const dataStartRow = detected.rowIndex + 2;
  const availableRows = Math.max(0, maxRows - dataStartRow + 1);
  const scanRows = Math.min(availableRows, QLTD_GANTT_MAX_SCAN_ROWS);

  if (availableRows > QLTD_GANTT_MAX_SCAN_ROWS) {
    warnings.push({ type: 'GANTT_SCAN_ROW_LIMIT_APPLIED', sheetName: sheet.getName(), maxRows: maxRows, scanRows: scanRows });
  }

  let lastDataRow = detected.rowIndex + 1;
  if (scanRows > 0 && (idColumnIndex >= 0 || textColumnIndex >= 0)) {
    const validIndexes = [idColumnIndex, textColumnIndex].filter(function(index) { return index >= 0; });
    const scanStartColumnIndex = Math.min.apply(null, validIndexes);
    const scanEndColumnIndex = Math.max.apply(null, validIndexes);
    const scanWidth = scanEndColumnIndex - scanStartColumnIndex + 1;
    const scanValues = sheet.getRange(dataStartRow, scanStartColumnIndex + 1, scanRows, scanWidth).getDisplayValues();
    const idOffset = idColumnIndex >= 0 ? idColumnIndex - scanStartColumnIndex : -1;
    const textOffset = textColumnIndex >= 0 ? textColumnIndex - scanStartColumnIndex : -1;

    for (let index = scanValues.length - 1; index >= 0; index -= 1) {
      const row = scanValues[index];
      const hasId = idOffset >= 0 && String(row[idOffset] || '').trim() !== '';
      const hasText = textOffset >= 0 && String(row[textOffset] || '').trim() !== '';
      if (hasId || hasText) {
        lastDataRow = dataStartRow + index;
        break;
      }
    }
  } else {
    lastDataRow = Math.max(detected.rowIndex + 1,
      Math.min(sheet.getLastRow() || headerRowCount, QLTD_GANTT_MAX_SCAN_ROWS));
  }

  const rowsRead = Math.max(detected.rowIndex + 1, lastDataRow);
  return {
    values: sheet.getRange(1, 1, rowsRead, lastColumn).getValues(),
    rowsRead: rowsRead,
    columnsRead: lastColumn
  };
}

function qltdGanttPerformance_(startedAt, cacheHit, rowsRead, columnsRead, taskCount) {
  return {
    cacheVersion: QLTD_GANTT_CACHE_VERSION,
    cacheHit: !!cacheHit,
    generatedAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - Number(startedAt || Date.now())),
    rowsRead: Number(rowsRead || 0),
    columnsRead: Number(columnsRead || 0),
    taskCount: Number(taskCount || 0)
  };
}

function qltdGanttCacheBaseKey_(projectCode) {
  const safeCode = String(projectCode || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  return 'QLTD_GANTT_' + QLTD_GANTT_CACHE_VERSION + '_' + safeCode;
}

function qltdGanttCacheGet_(projectCode) {
  try {
    const cache = CacheService.getScriptCache();
    const baseKey = qltdGanttCacheBaseKey_(projectCode);
    const manifestText = cache.get(baseKey + '_M');
    if (!manifestText) return null;

    const manifest = JSON.parse(manifestText);
    const chunkCount = Number(manifest.chunkCount || 0);
    if (!chunkCount || chunkCount > QLTD_GANTT_CACHE_MAX_CHUNKS) return null;

    const keys = [];
    for (let index = 0; index < chunkCount; index += 1) keys.push(baseKey + '_C' + index);
    const chunks = cache.getAll(keys);
    const parts = [];
    for (let index = 0; index < keys.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(chunks, keys[index])) return null;
      parts.push(chunks[keys[index]]);
    }

    const payload = JSON.parse(parts.join(''));
    payload.performance = Object.assign({}, payload.performance || {}, {
      cacheHit: true,
      cacheAgeMs: manifest.cachedAt ? Math.max(0, Date.now() - Number(manifest.cachedAt)) : null
    });
    return payload;
  } catch (error) {
    console.warn('Gantt cache read failed', error);
    return null;
  }
}

function qltdGanttCachePut_(projectCode, payload) {
  try {
    const serialized = JSON.stringify(payload);
    const chunks = [];
    for (let offset = 0; offset < serialized.length; offset += QLTD_GANTT_CACHE_CHUNK_CHARS) {
      chunks.push(serialized.slice(offset, offset + QLTD_GANTT_CACHE_CHUNK_CHARS));
    }
    if (!chunks.length || chunks.length > QLTD_GANTT_CACHE_MAX_CHUNKS) {
      console.warn('Gantt cache skipped because payload is too large', projectCode, serialized.length, chunks.length);
      return {
        stored: false,
        warning: {
          type: 'GANTT_CACHE_PAYLOAD_TOO_LARGE',
          projectCode: projectCode,
          charLength: serialized.length,
          chunkCount: chunks.length,
          maxChunks: QLTD_GANTT_CACHE_MAX_CHUNKS,
          message: 'Gantt response is valid but was not cached because the payload exceeds CacheService limits.'
        }
      };
    }

    const cache = CacheService.getScriptCache();
    const baseKey = qltdGanttCacheBaseKey_(projectCode);
    const entries = {};
    chunks.forEach(function(chunk, index) { entries[baseKey + '_C' + index] = chunk; });
    cache.putAll(entries, QLTD_GANTT_CACHE_TTL_SECONDS);
    cache.put(baseKey + '_M', JSON.stringify({
      chunkCount: chunks.length,
      cachedAt: Date.now(),
      charLength: serialized.length
    }), QLTD_GANTT_CACHE_TTL_SECONDS);
    return { stored: true };
  } catch (error) {
    console.warn('Gantt cache write failed', error);
    return {
      stored: false,
      warning: {
        type: 'GANTT_CACHE_WRITE_FAILED',
        projectCode: projectCode,
        message: error.message || String(error)
      }
    };
  }
}

function qltdGanttInvalidateCache_(projectCode) {
  try {
    const cache = CacheService.getScriptCache();
    const baseKey = qltdGanttCacheBaseKey_(projectCode);
    const manifestText = cache.get(baseKey + '_M');
    const keys = [baseKey + '_M'];
    if (manifestText) {
      const manifest = JSON.parse(manifestText);
      const chunkCount = Math.min(Number(manifest.chunkCount || 0), QLTD_GANTT_CACHE_MAX_CHUNKS);
      for (let index = 0; index < chunkCount; index += 1) keys.push(baseKey + '_C' + index);
    }
    cache.removeAll(keys);
    return {
      success: true,
      projectCode: String(projectCode || '').trim(),
      removedKeyCount: keys.length
    };
  } catch (error) {
    console.warn('Gantt cache invalidation failed', error);
    return {
      success: false,
      code: 'GANTT_CACHE_INVALIDATE_FAILED',
      message: error && error.message || String(error)
    };
  }
}

function qltdGanttFindSourceSheet_(spreadsheet, project, warnings) {
  const preferred = String(project.defaultTaskSheet || '').trim();
  const candidates = [];
  if (preferred) candidates.push(preferred);
  QLTD_GANTT_FALLBACK_SHEETS.forEach(function(sheetName) {
    if (candidates.indexOf(sheetName) === -1) candidates.push(sheetName);
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const sheetName = candidates[index];
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (sheet) {
      if (index > 0 && preferred) {
        warnings.push({ type: 'DEFAULT_TASK_SHEET_NOT_FOUND_USING_FALLBACK', requestedSheet: preferred, sourceSheet: sheetName });
      }
      return { sheet: sheet, sheetName: sheetName };
    }
  }

  warnings.push({ type: 'TASK_SHEET_CANDIDATES_NOT_FOUND', sheetNames: candidates });
  return { sheet: null, sheetName: '' };
}

function qltdGanttDetectHeader_(values) {
  const maxRows = Math.min(values.length, QLTD_GANTT_HEADER_SCAN_ROWS);
  let best = null;

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const headerIndex = qltdGanttBuildHeaderIndex_(values[rowIndex]);
    const score = ['id', 'text', 'startPlan', 'endPlan', 'owner', 'status', 'progress', 'wbs'].reduce(function(total, group) {
      return total + (qltdGanttFindAliasIndex_(headerIndex, group) >= 0 ? 1 : 0);
    }, 0);

    if (!best || score > best.score) best = { rowIndex: rowIndex, headerIndex: headerIndex, score: score };
  }

  return best && best.score >= 2 ? best : null;
}

function qltdGanttBuildHeaderIndex_(headers) {
  const index = {};
  (headers || []).forEach(function(header, columnIndex) {
    const key = qltdGanttNormalizeKey_(header);
    if (key && index[key] === undefined) index[key] = columnIndex;
  });
  return index;
}

function qltdGanttFindAliasIndex_(headerIndex, group) {
  const aliases = QLTD_GANTT_HEADER_ALIASES[group] || [];
  for (let index = 0; index < aliases.length; index += 1) {
    const key = qltdGanttNormalizeKey_(aliases[index]);
    if (Object.prototype.hasOwnProperty.call(headerIndex, key)) return headerIndex[key];
  }
  return -1;
}

function qltdGanttCell_(row, headerIndex, group) {
  const columnIndex = qltdGanttFindAliasIndex_(headerIndex, group);
  return columnIndex >= 0 ? row[columnIndex] : '';
}

function qltdGanttBuildTasks_(values, detected, warnings, sourceSheetName) {
  const tasks = [];
  const duplicateIds = {};
  const headerIndex = detected.headerIndex;
  const todayIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');

  for (let rowIndex = detected.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    let id = String(qltdGanttCell_(row, headerIndex, 'id') || '').trim();
    const text = String(qltdGanttCell_(row, headerIndex, 'text') || '').trim();
    const hasAnyValue = row.some(function(value) { return String(value || '').trim() !== ''; });

    if (!hasAnyValue || (!id && !text)) continue;
    if (!id) {
      id = 'ROW-' + (rowIndex + 1);
      warnings.push({ type: 'MISSING_TASK_ID_USING_ROW_ID', row: rowIndex + 1, id: id });
    }
    if (duplicateIds[id]) {
      warnings.push({ type: 'DUPLICATE_TASK_ID_SKIPPED', row: rowIndex + 1, id: id });
      continue;
    }
    duplicateIds[id] = true;

    const startPlan = qltdGanttToIsoDate_(qltdGanttCell_(row, headerIndex, 'startPlan'));
    const endPlan = qltdGanttToIsoDate_(qltdGanttCell_(row, headerIndex, 'endPlan'));
    const startActual = qltdGanttToIsoDate_(qltdGanttCell_(row, headerIndex, 'startActual'));
    const endActual = qltdGanttToIsoDate_(qltdGanttCell_(row, headerIndex, 'endActual'));
    const startIso = startActual || startPlan;
    const endIso = endActual || endPlan;
    const status = String(qltdGanttCell_(row, headerIndex, 'status') || '').trim();
    const progress = qltdGanttToProgress_(qltdGanttCell_(row, headerIndex, 'progress'), status);
    const isMilestone = qltdGanttIsMilestone_(qltdGanttCell_(row, headerIndex, 'milestone'), startIso, endIso);
    const parent = String(qltdGanttCell_(row, headerIndex, 'parent') || '0').trim() || '0';
    const raw = qltdGanttBuildRawRow_(values[detected.rowIndex], row);
    const hangMuc = qltdGanttNormalizeHangMucFromColF_(
      String(sourceSheetName || '').trim() === 'Cong_viec' ? row[5] : qltdGanttCell_(row, headerIndex, 'hangMuc'));
    const predecessor = qltdGanttCell_(row, headerIndex, 'predecessor');

    if (!text) warnings.push({ type: 'MISSING_TASK_TEXT_USING_ID', rowNumber: rowIndex + 1, id: id });
    if (!startIso) warnings.push({ type: 'MISSING_TASK_START_DATE', rowNumber: rowIndex + 1, id: id });
    if (!endIso) warnings.push({ type: 'MISSING_TASK_END_DATE', rowNumber: rowIndex + 1, id: id });

    tasks.push({
      id: id,
      text: text || id,
      code: String(qltdGanttCell_(row, headerIndex, 'code') || '').trim(),
      start_date: startIso,
      end_date: endIso,
      duration: qltdGanttDurationDays_(startIso, endIso),
      progress: progress,
      parent: parent,
      open: true,
      type: isMilestone ? 'milestone' : 'task',
      wbs: String(qltdGanttCell_(row, headerIndex, 'wbs') || '').trim(),
      hangMuc: hangMuc,
      owner: String(qltdGanttCell_(row, headerIndex, 'owner') || '').trim(),
      status: qltdGanttNormalizeStatusLabel_(status, progress),
      percent: Math.round(progress * 100),
      deadline: endIso,
      wbsLevel: qltdGanttGetWbsLevel_(String(qltdGanttCell_(row, headerIndex, 'wbs') || '').trim(), raw),
      baselineStart: startPlan,
      baselineEnd: endPlan,
      actualStart: startActual,
      actualEnd: endActual,
      actualFinish: endActual,
      predecessorRaw: String(predecessor || '').trim(),
      note: String(qltdGanttCell_(row, headerIndex, 'note') || '').trim(),
      updateNote: String(qltdGanttCell_(row, headerIndex, 'updateNote') || '').trim(),
      isOverdue: !!endIso && endIso < todayIso && progress < 1,
      raw: raw,
      rawRowNumber: rowIndex + 1,
      _predecessor: predecessor,
      _linkType: qltdGanttCell_(row, headerIndex, 'linkType')
    });
  }
  return tasks;
}

function qltdGanttApplyWbsParents_(tasks, warnings) {
  const wbsToId = {};
  tasks.forEach(function(task) { if (task.wbs) wbsToId[String(task.wbs).trim()] = String(task.id); });
  tasks.forEach(function(task) {
    const explicitParent = String(task.parent || '').trim();
    if (explicitParent && explicitParent !== '0') return;
    const parentWbs = qltdGanttGetParentWbs_(task.wbs);
    if (!parentWbs) { task.parent = '0'; return; }
    if (wbsToId[parentWbs]) { task.parent = wbsToId[parentWbs]; return; }
    task.parent = '0';
    warnings.push({ type: 'WBS_PARENT_NOT_FOUND', wbs: task.wbs, parentWbs: parentWbs,
      taskId: task.id, rowNumber: task.rawRowNumber });
  });
}

function qltdGanttGetParentWbs_(wbs) {
  const text = String(wbs || '').trim();
  if (!text || text.indexOf('.') < 0) return '';
  return text.slice(0, text.lastIndexOf('.'));
}

function qltdGanttBuildRawRow_(headers, row) {
  const raw = {};
  (headers || []).forEach(function(header, index) {
    const key = String(header || '').trim() || ('COL_' + (index + 1));
    const value = row[index];
    raw[key] = value instanceof Date ? qltdGanttToIsoDate_(value) : value;
  });
  return raw;
}

function qltdGanttNormalizeHangMucFromColF_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function qltdGanttBuildLinks_(tasks, warnings) {
  const links = [];
  const taskById = {};
  tasks.forEach(function(task) { taskById[String(task.id)] = true; });
  tasks.forEach(function(task) {
    Array.prototype.push.apply(links,
      qltdGanttParseDependencyCell_(task._predecessor, task.id, taskById, warnings, task.rawRowNumber));
  });
  return links;
}

function qltdGanttParseDependencyCell_(value, targetId, idSet, warnings, rowNumber) {
  const out = [];
  const raw = String(value || '').trim();
  if (!raw) return out;
  const typeMap = { FS: '0', SS: '1', FF: '2', SF: '3' };
  raw.split(/[;,\n]+/).map(function(part) { return part.trim(); }).filter(Boolean).forEach(function(part, index) {
    const match = part.match(/^\s*(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*$/i);
    if (!match) {
      warnings.push({ type: 'LINK_PARSE_FAILED', raw: part, target: String(targetId), rowNumber: rowNumber });
      return;
    }
    const source = String(match[1]);
    const depType = String(match[2] || 'FS').toUpperCase();
    const lagText = match[3] ? String(match[3]).replace(/\s+/g, '') : '';
    const lagDays = lagText ? Number(lagText) : 0;
    if (!idSet[source]) {
      warnings.push({ type: 'LINK_SOURCE_NOT_FOUND', source: source, target: String(targetId), raw: part, rowNumber: rowNumber });
      return;
    }
    out.push({ id: 'L' + source + '_' + targetId + '_' + index, source: source, target: String(targetId),
      type: typeMap[depType] || '0', lag: isNaN(lagDays) ? 0 : lagDays, relation: depType, raw: part });
  });
  return out;
}

function qltdGanttSummarizeTasks_(tasks) {
  const todayIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  const summary = {
    totalTasks: tasks.length, totalRows: tasks.length, realTasks: 0, scheduledGroups: 0,
    structuralGroups: 0, zoneGroups: 0, completed: 0, inProgress: 0, notStarted: 0,
    overdue: 0, milestones: 0, missingStartDate: 0, missingEndDate: 0, byStatus: {}, byOwner: {}
  };
  tasks.forEach(function(task) {
    if (task.rowType === 'ZONE_GROUP') { summary.zoneGroups += 1; return; }
    if (task.rowType === 'STRUCTURAL_GROUP') { summary.structuralGroups += 1; return; }
    if (task.rowType === 'SCHEDULED_GROUP') { summary.scheduledGroups += 1; return; }
    summary.realTasks += 1;
    const status = task.status || 'Chua ro';
    const owner = task.owner || 'Chua ro';
    const normalizedStatus = qltdGanttNormalizeKey_(status);
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    summary.byOwner[owner] = (summary.byOwner[owner] || 0) + 1;
    if (task.type === 'milestone') summary.milestones += 1;
    if (!task.start_date) summary.missingStartDate += 1;
    if (!task.end_date) summary.missingEndDate += 1;
    if (task.progress >= 1 || normalizedStatus.indexOf('hoanthanh') >= 0 ||
        normalizedStatus.indexOf('done') >= 0 || normalizedStatus.indexOf('complete') >= 0) summary.completed += 1;
    else if (task.progress > 0 || normalizedStatus.indexOf('dang') >= 0 ||
             normalizedStatus.indexOf('progress') >= 0) summary.inProgress += 1;
    else summary.notStarted += 1;
    if (task.end_date && task.end_date < todayIso && task.progress < 1) summary.overdue += 1;
  });
  return summary;
}

function qltdGanttToIsoDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return iso[1] + '-' + ('0' + iso[2]).slice(-2) + '-' + ('0' + iso[3]).slice(-2);
  const vi = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (vi) return vi[3] + '-' + ('0' + vi[2]).slice(-2) + '-' + ('0' + vi[1]).slice(-2);
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed,
    Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  return '';
}

function qltdGanttToProgress_(value, status) {
  const normalizedStatus = qltdGanttNormalizeKey_(status);
  if (value === null || value === undefined || value === '') {
    if (normalizedStatus.indexOf('hoanthanh') >= 0 || normalizedStatus.indexOf('done') >= 0 ||
        normalizedStatus.indexOf('complete') >= 0) return 1;
    return 0;
  }
  let text = String(value).replace('%', '').replace(',', '.').trim();
  let number = Number(text);
  if (isNaN(number)) {
    if (normalizedStatus.indexOf('hoanthanh') >= 0 || normalizedStatus.indexOf('done') >= 0 ||
        normalizedStatus.indexOf('complete') >= 0) return 1;
    return 0;
  }
  if (number > 1) number = number / 100;
  if (number < 0) number = 0;
  if (number > 1) number = 1;
  return number;
}

function qltdGanttNormalizeStatusLabel_(status, progress) {
  const normalized = qltdGanttNormalizeKey_(status);
  if (normalized.indexOf('hoanthanh') >= 0 || normalized.indexOf('done') >= 0 ||
      normalized.indexOf('complete') >= 0 || progress >= 1) return 'Hoàn thành';
  if (normalized.indexOf('tamdung') >= 0 || normalized.indexOf('paused') >= 0) return 'Tạm dừng';
  if (normalized.indexOf('quahan') >= 0 || normalized.indexOf('overdue') >= 0) return 'Quá hạn';
  if (normalized.indexOf('dang') >= 0 || normalized.indexOf('progress') >= 0 || progress > 0) return 'Đang làm';
  if (normalized.indexOf('chuabatdau') >= 0 || normalized.indexOf('notstarted') >= 0) return 'Chưa bắt đầu';
  return status || 'Chưa rõ';
}

function qltdGanttDurationDays_(startIso, endIso) {
  if (!startIso || !endIso) return 1;
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function qltdGanttGetWbsLevel_(wbs, raw) {
  const rawLevel = raw && raw.WBS_LEVEL_SYS !== undefined ? Number(raw.WBS_LEVEL_SYS) : 0;
  if (rawLevel > 0) return rawLevel;
  const text = String(wbs || '').trim();
  if (!text) return 999;
  if (/^[IVXLCDM]+(\.\d+)*$/i.test(text) || /^\d+(\.\d+)*$/.test(text)) return text.split('.').length;
  return 999;
}

function qltdGanttIsMilestone_(value, startIso, endIso) {
  const text = qltdGanttNormalizeKey_(value);
  if (['1', 'true', 'yes', 'x', 'co', 'milestone', 'moc', 'mocchinh'].indexOf(text) >= 0) return true;
  return !!startIso && !!endIso && startIso === endIso;
}

function qltdGanttNormalizeKey_(value) {
  return String(value || '').trim().toLowerCase().replace(/\u0111/g, 'd').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function qltdGanttSuccess_(project, sourceSheet, data, links, summary, warnings, performance) {
  return {
    success: true,
    projectCode: project.projectCode,
    projectName: project.projectName || '',
    sourceSheet: sourceSheet,
    data: data,
    links: links,
    summary: summary,
    warnings: warnings,
    performance: performance || {},
    apiStatus: 'CONNECTED',
    source: QLTD_GANTT_DATA_SOURCE
  };
}

function qltdDashboardGetSummaryForProject_(projectCode) {
  const source = qltdGanttGetDataForProject_(projectCode);
  if (!source || source.success === false) return source;

  const data = (source.data || []).map(function(task) {
    return {
      id: task.id,
      text: task.text,
      code: task.code,
      masterTaskCode: task.masterTaskCode,
      wbs: task.wbs,
      wbsLevel: task.wbsLevel,
      parent: task.parent,
      rowType: task.rowType,
      type: task.type,
      status: task.status,
      progress: task.progress,
      start_date: task.start_date,
      end_date: task.end_date,
      deadline: task.deadline,
      duration: task.duration,
      baselineStart: task.baselineStart,
      baselineEnd: task.baselineEnd,
      actualStart: task.actualStart,
      actualFinish: task.actualFinish,
      actualEnd: task.actualEnd,
      owner: task.owner,
      deptCode: task.deptCode,
      deptName: task.deptName,
      zone: task.zone,
      loaiCongTrinh: task.loaiCongTrinh,
      congTrinh: task.congTrinh,
      hangMuc: task.hangMuc,
      contextPath: task.contextPath,
      isCategoryRow: task.isCategoryRow,
      is_milestone: task.is_milestone,
      milestone: task.milestone,
      ma_moc: task.ma_moc,
      loai_cong_viec: task.loai_cong_viec
    };
  });
  const performance = Object.assign({}, source.performance || {}, {
    recordCount: data.length,
    sourceCount: 1,
    fullGanttTaskCount: (source.data || []).length,
    fullGanttLinkCount: (source.links || []).length
  });

  return {
    success: true,
    projectCode: source.projectCode,
    projectName: source.projectName,
    sourceSheet: source.sourceSheet,
    data: data,
    summary: source.summary,
    warnings: source.warnings || [],
    generatedAt: performance.generatedAt || new Date().toISOString(),
    performance: performance,
    apiStatus: source.apiStatus,
    source: 'dashboard_summary_from_gantt'
  };
}

function qltdGanttError_(error, message, warnings, extra) {
  const payload = Object.assign({
    success: false,
    error: error,
    message: message,
    warnings: warnings || [],
    apiStatus: 'ERROR',
    source: QLTD_GANTT_DATA_SOURCE
  }, extra || {});
  if (!payload.summary) payload.summary = qltdGanttSummarizeTasks_([]);
  if (!payload.data) payload.data = [];
  if (!payload.links) payload.links = [];
  return payload;
}
