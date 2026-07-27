const QLTD_GANTT_BASELINE_SOURCE = 'gantt_baseline_service';
const QLTD_GANTT_BASELINE_SHEET = 'Ke_hoach_goc';
const QLTD_GANTT_BASELINE_HISTORY_SHEET = 'Ke_hoach_goc_history';
const QLTD_GANTT_BASELINE_PROJECTS_SHEET = 'Projects';
const QLTD_GANTT_BASELINE_HEADER_ROW = 4;
const QLTD_GANTT_BASELINE_DATA_ROW = 5;
const QLTD_GANTT_BASELINE_COLUMN_COUNT = 14;
const QLTD_GANTT_BASELINE_HEADERS = [
  'Ref gốc',
  'Công việc / Phạm vi',
  'Chủ trì',
  'Bắt đầu gốc',
  'Kết thúc gốc',
  'Ngày gốc',
  'Liên kết gốc',
  'Mốc/Gate',
  'Ghi chú gốc',
  'Mã công việc',
  'Baseline version',
  'Baseline type',
  'Baseline status',
  'Created at'
];
const QLTD_GANTT_BASELINE_PROJECT_HEADERS = [
  'ProjectCode',
  'ProjectName',
  'MasterSpreadsheetId',
  'Status'
];
const QLTD_GANTT_BASELINE_HISTORY_HEADERS = [
  'Mã baseline',
  'Tên sheet lưu trữ',
  'Trạng thái',
  'Ngày lưu',
  'Số dòng công việc',
  'Ghi chú'
];

function qltdGanttBaselineGet_(params) {
  const input = params && typeof params === 'object' ? params : {};
  const projectCode = qltdGanttBaselineNormalizeCode_(input.projectCode);

  if (!projectCode) {
    return qltdGanttBaselineError_(
      'MISSING_PROJECT_CODE',
      'Missing projectCode',
      '',
      []
    );
  }

  const resolution = resolveCurrentUser_(input);
  if (!resolution || resolution.success !== true) {
    return qltdGanttBaselineAuthError_(resolution, projectCode);
  }

  const projectResult = qltdGanttBaselineResolveProjectReadonly_(projectCode, resolution.user);
  if (projectResult.error) {
    return qltdGanttBaselineError_(
      projectResult.error.code,
      projectResult.error.message,
      projectCode,
      projectResult.warnings || [],
      projectResult.error.details || {}
    );
  }

  let masterSpreadsheet;
  try {
    masterSpreadsheet = SpreadsheetApp.openById(projectResult.project.masterSpreadsheetId);
  } catch (error) {
    return qltdGanttBaselineError_(
      'MASTER_SPREADSHEET_OPEN_FAILED',
      error && error.message || String(error),
      projectCode,
      []
    );
  }

  try {
    return qltdGanttBaselineReadActive_(masterSpreadsheet, projectCode);
  } catch (error) {
    return qltdGanttBaselineError_(
      error && error.code || 'BASELINE_READ_FAILED',
      error && error.message || String(error),
      projectCode,
      [],
      error && error.details || {}
    );
  }
}

function qltdGanttBaselineResolveProjectReadonly_(projectCode, user) {
  const readResult = qltdGanttBaselineReadProjectsReadonly_();
  if (readResult.error) return readResult;

  const requested = (readResult.projects || []).filter(function(project) {
    return project.projectCode === projectCode;
  });

  if (requested.length > 1) {
    return {
      project: null,
      warnings: readResult.warnings || [],
      error: {
        code: 'PROJECT_ACCESS_AMBIGUOUS',
        message: 'Project registry contains duplicate ProjectCode values.',
        details: { projectCode: projectCode, matchCount: requested.length }
      }
    };
  }

  if (!requested.length || requested[0].status !== 'ACTIVE') {
    return {
      project: null,
      warnings: readResult.warnings || [],
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or inactive.',
        details: { projectCode: projectCode }
      }
    };
  }

  const visibleProjects = qltdGanttBaselineListProjectsForUserReadonly_(user, readResult.projects || []);
  const visible = visibleProjects.some(function(project) {
    return project.projectCode === projectCode;
  });

  if (!visible) {
    return {
      project: null,
      warnings: readResult.warnings || [],
      error: {
        code: 'PROJECT_ACCESS_DENIED',
        message: 'User cannot view this project.',
        details: { projectCode: projectCode }
      }
    };
  }

  if (!requested[0].masterSpreadsheetId) {
    return {
      project: null,
      warnings: readResult.warnings || [],
      error: {
        code: 'MASTER_SPREADSHEET_ID_MISSING',
        message: 'Project MasterSpreadsheetId is missing.',
        details: { projectCode: projectCode }
      }
    };
  }

  return {
    project: requested[0],
    warnings: readResult.warnings || [],
    error: null
  };
}

function qltdGanttBaselineReadProjectsReadonly_() {
  let spreadsheet;
  try {
    spreadsheet = getCurrentSpreadsheet_();
  } catch (error) {
    return {
      projects: [],
      warnings: [],
      error: {
        code: 'PROJECT_REGISTRY_OPEN_FAILED',
        message: error && error.message || String(error)
      }
    };
  }

  const sheet = spreadsheet.getSheetByName(QLTD_GANTT_BASELINE_PROJECTS_SHEET);
  if (!sheet) {
    return {
      projects: [],
      warnings: [],
      error: {
        code: 'PROJECT_REGISTRY_NOT_FOUND',
        message: 'Projects sheet was not found.'
      }
    };
  }

  const values = sheet.getDataRange().getValues();
  if (!values || !values.length) {
    return {
      projects: [],
      warnings: [],
      error: {
        code: 'PROJECT_REGISTRY_SCHEMA_INVALID',
        message: 'Projects sheet is empty.'
      }
    };
  }

  const headerResult = qltdGanttBaselineBuildHeaderMap_(
    values[0],
    QLTD_GANTT_BASELINE_PROJECT_HEADERS,
    false
  );
  if (headerResult.error) {
    return {
      projects: [],
      warnings: [],
      error: {
        code: 'PROJECT_REGISTRY_SCHEMA_INVALID',
        message: headerResult.error.message,
        details: headerResult.error.details
      }
    };
  }

  const projects = [];
  for (let index = 1; index < values.length; index += 1) {
    const row = values[index];
    if (!qltdGanttBaselineRowHasValue_(row)) continue;
    const projectCode = qltdGanttBaselineNormalizeCode_(
      qltdGanttBaselineCell_(row, headerResult.headerMap, 'ProjectCode')
    );
    const projectName = String(
      qltdGanttBaselineCell_(row, headerResult.headerMap, 'ProjectName') || ''
    ).trim();
    if (!projectCode || !projectName) continue;
    projects.push({
      projectCode: projectCode,
      projectName: projectName,
      masterSpreadsheetId: String(
        qltdGanttBaselineCell_(row, headerResult.headerMap, 'MasterSpreadsheetId') || ''
      ).trim(),
      status: String(qltdGanttBaselineCell_(row, headerResult.headerMap, 'Status') || 'ACTIVE')
        .trim()
        .toUpperCase()
    });
  }

  return {
    projects: projects,
    warnings: [],
    error: null
  };
}

function qltdGanttBaselineListProjectsForUserReadonly_(user, projects) {
  if (
    !user ||
    String(user.status || '').trim().toUpperCase() !== 'ACTIVE' ||
    typeof qltdUsersIsValidRole_ !== 'function' ||
    !qltdUsersIsValidRole_(user.role)
  ) {
    return [];
  }

  // This mirrors qltdProjectsListForUser_ today: every ACTIVE, valid user can
  // view every ACTIVE project. It deliberately avoids the mutating
  // qltdProjectsEnsureSheet_/seed path used by that legacy helper.
  return (projects || []).filter(function(project) {
    return project && project.status === 'ACTIVE';
  });
}

function qltdGanttBaselineReadActive_(spreadsheet, projectCode) {
  const sheet = spreadsheet.getSheetByName(QLTD_GANTT_BASELINE_SHEET);
  if (!sheet || sheet.getLastRow() < QLTD_GANTT_BASELINE_DATA_ROW) {
    return qltdGanttBaselineUnavailable_(projectCode);
  }

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(
    2,
    1,
    lastRow - 1,
    QLTD_GANTT_BASELINE_COLUMN_COUNT
  ).getValues();
  const metadataRow = values[0] || [];
  const headerRow = values[QLTD_GANTT_BASELINE_HEADER_ROW - 2] || [];
  const rows = values.slice(QLTD_GANTT_BASELINE_DATA_ROW - 2);

  if (!rows.some(qltdGanttBaselineRowHasValue_)) {
    return qltdGanttBaselineUnavailable_(projectCode);
  }

  const headerResult = qltdGanttBaselineBuildHeaderMap_(
    headerRow,
    QLTD_GANTT_BASELINE_HEADERS,
    true
  );
  if (headerResult.error) {
    return qltdGanttBaselineError_(
      'BASELINE_SCHEMA_INVALID',
      headerResult.error.message,
      projectCode,
      [],
      headerResult.error.details
    );
  }

  const activeRows = rows.filter(function(row) {
    if (!qltdGanttBaselineRowHasValue_(row)) return false;
    return String(
      qltdGanttBaselineCell_(row, headerResult.headerMap, 'Baseline status') || ''
    ).trim().toUpperCase() === 'ACTIVE';
  });

  if (!activeRows.length) {
    return qltdGanttBaselineError_(
      'BASELINE_ACTIVE_NOT_FOUND',
      'No ACTIVE baseline records were found.',
      projectCode,
      []
    );
  }

  const versionState = qltdGanttBaselineUniqueValues_(
    activeRows,
    headerResult.headerMap,
    'Baseline version',
    true
  );
  if (!versionState.values.length) {
    return qltdGanttBaselineError_(
      'BASELINE_ACTIVE_NOT_FOUND',
      'ACTIVE baseline records do not contain a version.',
      projectCode,
      []
    );
  }
  if (versionState.values.length > 1) {
    return qltdGanttBaselineError_(
      'BASELINE_ACTIVE_AMBIGUOUS',
      'More than one ACTIVE baseline version was found.',
      projectCode,
      [],
      { activeVersions: versionState.values }
    );
  }
  if (versionState.blankCount > 0) {
    return qltdGanttBaselineError_(
      'BASELINE_METADATA_MISMATCH',
      'Some ACTIVE baseline records have an empty version.',
      projectCode,
      [],
      { blankVersionCount: versionState.blankCount }
    );
  }

  const version = versionState.values[0];
  const metadataVersion = String(metadataRow[1] || '').trim();
  const metadataStatus = String(metadataRow[8] || '').trim().toUpperCase();
  if (metadataVersion !== version || metadataStatus !== 'ACTIVE') {
    return qltdGanttBaselineError_(
      'BASELINE_METADATA_MISMATCH',
      'Baseline metadata does not match the ACTIVE data version.',
      projectCode,
      [],
      {
        activeVersion: version,
        metadataVersion: metadataVersion,
        metadataStatus: metadataStatus
      }
    );
  }

  const historyResult = qltdGanttBaselineValidateHistory_(spreadsheet, version);
  if (historyResult.error) {
    return qltdGanttBaselineError_(
      historyResult.error.code,
      historyResult.error.message,
      projectCode,
      historyResult.warnings || [],
      historyResult.error.details || {}
    );
  }

  const warnings = (historyResult.warnings || []).slice();
  const data = qltdGanttBaselineBuildRecords_(
    activeRows,
    headerResult.headerMap,
    version,
    warnings
  );
  const diagnostics = {
    duplicateTaskCodes: qltdGanttBaselineFindDuplicates_(data, 'taskCode', true),
    duplicateRefs: qltdGanttBaselineFindDuplicates_(data, 'refId', false)
  };
  const typeState = qltdGanttBaselineUniqueValues_(
    activeRows,
    headerResult.headerMap,
    'Baseline type',
    false
  );
  if (typeState.values.length > 1) {
    warnings.push({
      code: 'BASELINE_TYPE_AMBIGUOUS',
      values: typeState.values
    });
  }

  const declaredTaskCount = Number(metadataRow[7]);
  if (Number.isFinite(declaredTaskCount) && declaredTaskCount >= 0 && declaredTaskCount !== data.length) {
    warnings.push({
      code: 'BASELINE_TASK_COUNT_MISMATCH',
      declaredTaskCount: declaredTaskCount,
      returnedTaskCount: data.length
    });
  }

  const createdAt = qltdGanttBaselineResolveCreatedAt_(
    activeRows,
    headerResult.headerMap,
    metadataRow[3],
    warnings
  );

  return {
    success: true,
    available: true,
    projectCode: projectCode,
    sourceSheet: QLTD_GANTT_BASELINE_SHEET,
    baseline: {
      version: version,
      type: typeState.values[0] || String(metadataRow[5] || '').trim(),
      status: 'ACTIVE',
      createdAt: createdAt,
      taskCount: data.length
    },
    data: data,
    diagnostics: diagnostics,
    warnings: warnings,
    apiStatus: 'CONNECTED',
    source: QLTD_GANTT_BASELINE_SOURCE
  };
}

function qltdGanttBaselineValidateHistory_(spreadsheet, activeVersion) {
  const sheet = spreadsheet.getSheetByName(QLTD_GANTT_BASELINE_HISTORY_SHEET);
  if (!sheet) return { warnings: [], error: null };

  const values = sheet.getDataRange().getValues();
  if (!values || !values.length) {
    return {
      warnings: [],
      error: {
        code: 'BASELINE_METADATA_MISMATCH',
        message: 'Baseline history exists but is empty.'
      }
    };
  }

  const headerResult = qltdGanttBaselineBuildHeaderMap_(
    values[0],
    QLTD_GANTT_BASELINE_HISTORY_HEADERS,
    true
  );
  if (headerResult.error) {
    return {
      warnings: [],
      error: {
        code: 'BASELINE_METADATA_MISMATCH',
        message: 'Baseline history header is invalid.',
        details: headerResult.error.details
      }
    };
  }

  const activeRows = values.slice(1).filter(function(row) {
    return qltdGanttBaselineRowHasValue_(row) &&
      String(qltdGanttBaselineCell_(row, headerResult.headerMap, 'Trạng thái') || '').trim() === 'Đang áp dụng';
  });

  if (activeRows.length > 1) {
    return {
      warnings: [],
      error: {
        code: 'BASELINE_ACTIVE_AMBIGUOUS',
        message: 'Baseline history contains more than one active record.',
        details: { activeHistoryCount: activeRows.length }
      }
    };
  }
  if (!activeRows.length) {
    return {
      warnings: [],
      error: {
        code: 'BASELINE_METADATA_MISMATCH',
        message: 'Baseline history does not contain an active record.'
      }
    };
  }

  const historyVersion = String(
    qltdGanttBaselineCell_(activeRows[0], headerResult.headerMap, 'Mã baseline') || ''
  ).trim();
  if (historyVersion !== activeVersion) {
    return {
      warnings: [],
      error: {
        code: 'BASELINE_METADATA_MISMATCH',
        message: 'Baseline history version does not match the active baseline.',
        details: {
          activeVersion: activeVersion,
          historyVersion: historyVersion
        }
      }
    };
  }

  return { warnings: [], error: null };
}

function qltdGanttBaselineBuildRecords_(rows, headerMap, version, warnings) {
  const data = [];

  (rows || []).forEach(function(row, index) {
    const taskCode = String(qltdGanttBaselineCell_(row, headerMap, 'Mã công việc') || '').trim();
    const refId = qltdGanttBaselineNormalizeRef_(
      qltdGanttBaselineCell_(row, headerMap, 'Ref gốc')
    );
    const warningContext = {
      recordOrdinal: index + 1,
      baselineVersion: version,
      taskCode: taskCode,
      refId: refId
    };
    let invalidIdentity = false;

    if (!taskCode) {
      warnings.push(Object.assign({
        code: 'BASELINE_TASK_CODE_MISSING'
      }, warningContext));
      invalidIdentity = true;
    }
    if (!refId) {
      warnings.push(Object.assign({
        code: 'BASELINE_REF_MISSING'
      }, warningContext));
      invalidIdentity = true;
    }

    const startResult = qltdGanttBaselineDateValue_(
      qltdGanttBaselineCell_(row, headerMap, 'Bắt đầu gốc')
    );
    const endResult = qltdGanttBaselineDateValue_(
      qltdGanttBaselineCell_(row, headerMap, 'Kết thúc gốc')
    );

    if (!startResult) {
      warnings.push(Object.assign({
        code: 'BASELINE_DATE_INVALID',
        field: 'baselineStart'
      }, warningContext));
    }
    if (!endResult) {
      warnings.push(Object.assign({
        code: 'BASELINE_DATE_INVALID',
        field: 'baselineEnd'
      }, warningContext));
    }
    if (invalidIdentity || !startResult || !endResult) return;

    if (endResult.ordinal < startResult.ordinal) {
      warnings.push(Object.assign({
        code: 'BASELINE_DATE_RANGE_INVALID',
        baselineStart: startResult.iso,
        baselineEnd: endResult.iso
      }, warningContext));
      return;
    }

    data.push({
      taskCode: taskCode,
      refId: refId,
      text: String(qltdGanttBaselineCell_(row, headerMap, 'Công việc / Phạm vi') || '').trim(),
      owner: String(qltdGanttBaselineCell_(row, headerMap, 'Chủ trì') || '').trim(),
      baselineStart: startResult.iso,
      baselineEnd: endResult.iso,
      durationDays: endResult.ordinal - startResult.ordinal + 1,
      milestoneCode: String(qltdGanttBaselineCell_(row, headerMap, 'Mốc/Gate') || '').trim()
    });
  });

  return data;
}

function qltdGanttBaselineResolveCreatedAt_(rows, headerMap, metadataValue, warnings) {
  const rowValues = [];
  (rows || []).forEach(function(row) {
    const serialized = qltdGanttBaselineTimestamp_(
      qltdGanttBaselineCell_(row, headerMap, 'Created at')
    );
    if (serialized && rowValues.indexOf(serialized) === -1) rowValues.push(serialized);
  });

  if (rowValues.length > 1) {
    warnings.push({
      code: 'BASELINE_CREATED_AT_AMBIGUOUS',
      values: rowValues
    });
  }

  const metadataTimestamp = qltdGanttBaselineTimestamp_(metadataValue);
  if (!rowValues.length && metadataValue && !metadataTimestamp) {
    warnings.push({ code: 'BASELINE_CREATED_AT_INVALID' });
  }
  return rowValues[0] || metadataTimestamp || '';
}

function qltdGanttBaselineBuildHeaderMap_(headers, requiredHeaders, requireExactPositions) {
  const headerMap = {};
  const duplicates = [];
  (headers || []).forEach(function(value, index) {
    const header = String(value || '').trim();
    if (!header) return;
    if (Object.prototype.hasOwnProperty.call(headerMap, header)) {
      duplicates.push(header);
      return;
    }
    headerMap[header] = index;
  });

  const missing = (requiredHeaders || []).filter(function(header) {
    return !Object.prototype.hasOwnProperty.call(headerMap, header);
  });
  const misplaced = [];
  if (requireExactPositions) {
    (requiredHeaders || []).forEach(function(header, index) {
      if (headerMap[header] !== undefined && headerMap[header] !== index) {
        misplaced.push({
          header: header,
          expectedColumn: index + 1,
          actualColumn: headerMap[header] + 1
        });
      }
    });
  }

  if (missing.length || duplicates.length || misplaced.length) {
    return {
      headerMap: headerMap,
      error: {
        message: 'Required header mapping is invalid.',
        details: {
          missingHeaders: missing,
          duplicateHeaders: duplicates,
          misplacedHeaders: misplaced
        }
      }
    };
  }

  return { headerMap: headerMap, error: null };
}

function qltdGanttBaselineCell_(row, headerMap, header) {
  const index = headerMap && headerMap[header];
  return index === undefined || !row ? '' : row[index];
}

function qltdGanttBaselineUniqueValues_(rows, headerMap, header, normalizeUppercase) {
  const values = [];
  let blankCount = 0;
  (rows || []).forEach(function(row) {
    let value = String(qltdGanttBaselineCell_(row, headerMap, header) || '').trim();
    if (normalizeUppercase) value = value.toUpperCase();
    if (!value) {
      blankCount += 1;
      return;
    }
    if (values.indexOf(value) === -1) values.push(value);
  });
  return { values: values, blankCount: blankCount };
}

function qltdGanttBaselineFindDuplicates_(records, field, normalizeUppercase) {
  const counts = {};
  (records || []).forEach(function(record) {
    let value = String(record && record[field] || '').trim();
    if (normalizeUppercase) value = value.toUpperCase();
    if (!value) return;
    counts[value] = Number(counts[value] || 0) + 1;
  });
  return Object.keys(counts).filter(function(value) {
    return counts[value] > 1;
  }).sort();
}

function qltdGanttBaselineDateValue_(value) {
  let iso = '';
  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    iso = Utilities.formatDate(
      value,
      Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh',
      'yyyy-MM-dd'
    );
  } else {
    iso = String(value || '').trim();
  }

  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    iso: match[1] + '-' + match[2] + '-' + match[3],
    ordinal: Math.floor(date.getTime() / 86400000)
  };
}

function qltdGanttBaselineTimestamp_(value) {
  if (!value) return '';
  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return value.toISOString();
  }
  const text = String(value || '').trim();
  if (!text) return '';
  const timestamp = new Date(text);
  return isNaN(timestamp.getTime()) ? '' : timestamp.toISOString();
}

function qltdGanttBaselineNormalizeCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdGanttBaselineNormalizeRef_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  const text = String(value).trim();
  return text;
}

function qltdGanttBaselineRowHasValue_(row) {
  return Array.isArray(row) && row.some(function(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

function qltdGanttBaselineUnavailable_(projectCode) {
  return {
    success: true,
    available: false,
    projectCode: projectCode,
    sourceSheet: QLTD_GANTT_BASELINE_SHEET,
    baseline: null,
    data: [],
    diagnostics: {
      duplicateTaskCodes: [],
      duplicateRefs: []
    },
    warnings: [],
    apiStatus: 'CONNECTED',
    source: QLTD_GANTT_BASELINE_SOURCE
  };
}

function qltdGanttBaselineAuthError_(resolution, projectCode) {
  const errorObject = resolution && resolution.error || {};
  const code = String(
    errorObject.code ||
    resolution && resolution.errorCode ||
    resolution && resolution.message ||
    'ACCESS_DENIED'
  ).trim().toUpperCase();
  const message = String(
    errorObject.message ||
    resolution && resolution.errorMessage ||
    'User authentication failed.'
  ).trim();
  return qltdGanttBaselineError_(code, message, projectCode, []);
}

function qltdGanttBaselineError_(code, message, projectCode, warnings, extra) {
  const safeCode = String(code || 'BASELINE_READ_FAILED').trim().toUpperCase();
  const safeMessage = String(message || 'Baseline request failed.').trim();
  const payload = {
    success: false,
    available: false,
    projectCode: projectCode || '',
    sourceSheet: QLTD_GANTT_BASELINE_SHEET,
    baseline: null,
    data: [],
    diagnostics: {
      duplicateTaskCodes: [],
      duplicateRefs: []
    },
    warnings: warnings || [],
    error: {
      code: safeCode,
      message: safeMessage
    },
    errorCode: safeCode,
    errorMessage: safeMessage,
    message: safeCode,
    apiStatus: 'CONNECTED',
    source: QLTD_GANTT_BASELINE_SOURCE
  };
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function(key) {
      if (key !== 'error' && key !== 'idToken') payload[key] = extra[key];
    });
  }
  return payload;
}
