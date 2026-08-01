const QLTD_DEPT_PLAN_ROW_TYPE_CONTEXT = 'CONTEXT';
const QLTD_DEPT_PLAN_ROW_TYPE_MASTER = 'MASTER';
const QLTD_DEPT_PLAN_ROW_TYPE_DETAIL_SLOT = 'DETAIL_SLOT';
const QLTD_DEPT_PLAN_ROW_TYPE_PB_DETAIL = 'PB_DETAIL';

function qltdDeptPlanListForProject_(projectCode, actorUser, actorEmail, requestedDeptCode) {
  const action = 'listDeptPlans';
  const performance = { rowsRead: 0, columnsRead: 0, cellsRead: 0, sheetCount: 0, sourceCount: 0 };
  const project = qltdProjectsGetByCode_(projectCode);

  if (!project) {
    return {
      success: false,
      message: 'PROJECT_NOT_FOUND',
      projectCode: qltdProjectsNormalizeCode_(projectCode),
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service'
    };
  }

  if (project.status !== 'ACTIVE') {
    return {
      success: false,
      message: 'PROJECT_INACTIVE',
      projectCode: project.projectCode,
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service'
    };
  }

  if (!project.deptSpreadsheetId) {
    return {
      success: false,
      message: 'PROJECT_DEPT_SPREADSHEET_ID_MISSING',
      projectCode: project.projectCode,
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service'
    };
  }

  const departments = [];
  const warnings = [];
  const allMappedDepts = qltdProjectDeptsListActive_().filter(function(row) {
    return row.projectCode === project.projectCode;
  });
  const requestedCode = qltdWorkNormalizeCode_(requestedDeptCode);
  const mappedDepts = requestedCode
    ? allMappedDepts.filter(function(dept) {
      return qltdDeptPlanMatchesRequestedDept_(dept, requestedCode);
    })
    : allMappedDepts;
  const isAdminScope = qltdWorkIsAdminScope_(actorUser);
  const allowedMappedDepts = isAdminScope
    ? mappedDepts
    : mappedDepts.filter(function(dept) {
      return qltdCanReadProjectDept_(actorUser, project.projectCode, dept.deptCode, dept);
    });

  if (!isAdminScope && !allowedMappedDepts.length) {
    return qltdWorkError_(
      'dept_plan_service',
      action,
      'ACCESS_DENIED',
      'Bạn không có quyền truy cập dữ liệu của phòng/ban này.',
      {
        email: actorEmail || actorUser && actorUser.email || '',
        projectCode: project.projectCode,
        deptCode: requestedCode
      }
    );
  }

  const masterContextResult = qltdDeptPlanBuildMasterContextMap_(project.projectCode);
  if (masterContextResult.warning) warnings.push(masterContextResult.warning);
  const weeklyProgressResult = qltdDeptPlanReadWeeklyProgressStateMap_(project.projectCode);
  if (weeklyProgressResult.warning) warnings.push(weeklyProgressResult.warning);
  performance.weeklyUpdateRowsRead = weeklyProgressResult.rowsRead;
  performance.weeklyProgressStateCount = weeklyProgressResult.stateCount;
  performance.weeklySourceCount = weeklyProgressResult.sourceRead ? 1 : 0;
  const ss = SpreadsheetApp.openById(project.deptSpreadsheetId);

  if (allowedMappedDepts.length) {
    allowedMappedDepts.forEach(function(dept) {
      const sheet = qltdDeptPlanFindMappedSheet_(ss, dept);

      if (!sheet) {
        warnings.push({
          type: 'DEPT_SHEET_MISSING',
          projectCode: project.projectCode,
          deptCode: dept.deptCode,
          projectUnitCode: dept.projectUnitCode,
          sheetName: dept.projectUnitCode || dept.deptCode
        });
        return;
      }

      const deptPlan = qltdDeptPlanParseSheet_(sheet, project, performance);

      if (!deptPlan) {
        warnings.push({
          type: 'DEPT_SHEET_LAYOUT_UNSUPPORTED',
          projectCode: project.projectCode,
          deptCode: dept.deptCode,
          sheetName: sheet.getName(),
          message: 'Missing required headers: Noi dung cong viec, Ma cong viec master, Loai dong'
        });
        return;
      }

      deptPlan.deptCode = dept.deptCode || deptPlan.deptCode;
      deptPlan.deptCodeRaw = dept.deptCodeRaw || deptPlan.deptCode;
      deptPlan.deptName = dept.deptName || deptPlan.deptCode;
      deptPlan.projectUnitCode = dept.projectUnitCode || '';
      deptPlan.projectUnitCodeRaw = dept.projectUnitCodeRaw || deptPlan.projectUnitCode;
      const readPermission = qltdResolveDeptReadPermission_(
        actorUser,
        project.projectCode,
        dept.deptCode,
        dept
      );
      deptPlan.permissionSource = readPermission.source;
      deptPlan.permissionCode = readPermission.permissionCode;
      deptPlan.canUpdateProgress = readPermission.source === 'DELEGATED_ACCESS' ||
        qltdCanUpdateDeptProgress_(actorUser, project.projectCode, dept.deptCode, dept, 'work_updatetask');
      qltdDeptPlanEnrichWithMasterContext_(
        deptPlan,
        masterContextResult.byCode,
        warnings,
        project.projectCode
      );
      qltdDeptPlanApplyWeeklyProgressStates_(
        deptPlan,
        project.projectCode,
        weeklyProgressResult.byKey
      );

      if (deptPlan.masterCount > 0) {
        departments.push(deptPlan);
      } else {
        warnings.push({
          type: 'DEPT_SHEET_EMPTY',
          projectCode: project.projectCode,
          deptCode: dept.deptCode,
          sheetName: sheet.getName()
        });
      }
    });
  } else if (isAdminScope && !requestedCode) {
    ss.getSheets().forEach(function(sheet) {
      const deptPlan = qltdDeptPlanParseSheet_(sheet, project, performance);
      if (deptPlan && deptPlan.masterCount > 0) {
        qltdDeptPlanEnrichWithMasterContext_(
          deptPlan,
          masterContextResult.byCode,
          warnings,
          project.projectCode
        );
        qltdDeptPlanApplyWeeklyProgressStates_(
          deptPlan,
          project.projectCode,
          weeklyProgressResult.byKey
        );
        departments.push(deptPlan);
      }
    });
  }

  if (mappedDepts.length && !departments.length && warnings.length) {
    return {
      success: true,
      projectCode: project.projectCode,
      projectName: project.projectName,
      departments: departments,
      warnings: warnings,
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service',
      performance: Object.assign(performance, { recordCount: departments.length })
    };
  }

  departments.sort(function(a, b) {
    const aOrder = qltdDeptPlanFindMappedSortOrder_(allowedMappedDepts, a);
    const bOrder = qltdDeptPlanFindMappedSortOrder_(allowedMappedDepts, b);

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return String(a.deptCode || '').localeCompare(String(b.deptCode || ''));
  });

  return {
    success: true,
    projectCode: project.projectCode,
    projectName: project.projectName,
    departments: departments,
    warnings: warnings,
    apiStatus: 'CONNECTED',
    source: 'dept_plan_service',
    performance: Object.assign(performance, { recordCount: departments.length })
  };
}

function qltdDeptPlanMatchesRequestedDept_(dept, requestedCode) {
  const normalized = qltdWorkNormalizeCode_(requestedCode);
  const canonical = qltdMasterDeptCanonicalCode_(requestedCode);
  return [
    dept && dept.deptCode,
    dept && dept.deptCodeRaw,
    dept && dept.projectUnitCode,
    dept && dept.projectUnitCodeRaw
  ].some(function(value) {
    return qltdWorkNormalizeCode_(value) === normalized;
  }) || (!!canonical && qltdMasterDeptCanonicalCode_(
    dept && (dept.masterDeptCode || dept.deptCode || dept.projectUnitCode)
  ) === canonical);
}

function qltdDeptPlanFindMappedSheet_(ss, dept) {
  const candidates = [
    dept.projectUnitCodeRaw,
    dept.projectUnitCode,
    dept.deptCodeRaw,
    dept.deptCode,
    dept.deptName
  ].filter(function(value) {
    return !!String(value || '').trim();
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const sheet = ss.getSheetByName(candidates[index]);
    if (sheet) return sheet;
  }

  return null;
}

function qltdDeptPlanFindMappedSortOrder_(mappedDepts, deptPlan) {
  const match = mappedDepts.find(function(row) {
    return row.deptCode === deptPlan.deptCode ||
      row.projectUnitCode === deptPlan.projectUnitCode ||
      row.deptCodeRaw === deptPlan.deptCodeRaw ||
      row.projectUnitCodeRaw === deptPlan.projectUnitCodeRaw ||
      row.deptName === deptPlan.deptName;
  });

  return Number(match && match.sortOrder || 9999);
}

function qltdDeptPlanParseSheet_(sheet, project, performance) {
  const lastRow = Math.max(1, sheet.getLastRow());
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  if (performance) {
    performance.rowsRead += lastRow;
    performance.columnsRead = Math.max(performance.columnsRead, lastColumn);
    performance.cellsRead += lastRow * lastColumn;
    performance.sheetCount += 1;
    performance.sourceCount = performance.sheetCount + 1 + Number(performance.weeklySourceCount || 0);
  }
  if (!values || values.length < 3) return null;

  const deptCode = qltdDeptPlanFindDeptCode_(values, sheet.getName());
  const headerRowIndex = qltdDeptPlanFindHeaderRowIndex_(values);
  if (headerRowIndex < 0) return null;

  const headers = values[headerRowIndex].map(function(value) {
    return String(value || '').trim();
  });
  const columnMap = qltdDeptPlanBuildColumnMap_(headers);

  if (columnMap.masterCode < 0 || columnMap.rowType < 0) {
    return null;
  }

  const contexts = [];
  const masters = [];
  let currentContext = null;
  let currentMaster = null;

  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const rowType = qltdDeptPlanNormalizeRowType_(row[columnMap.rowType]);
    const masterCode = String(row[columnMap.masterCode] || '').trim();
    const taskName = columnMap.taskName >= 0 ? String(row[columnMap.taskName] || '').trim() : '';

    if (!rowType && !masterCode && !taskName) continue;

    const item = {
      rowIndex: rowIndex + 1,
      stt: columnMap.stt >= 0 ? String(row[columnMap.stt] || '').trim() : '',
      taskName: taskName,
      planStart: columnMap.planStart >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.planStart]) : '',
      planFinish: columnMap.planFinish >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.planFinish]) : '',
      budgetPlan: columnMap.budgetPlan >= 0 ? row[columnMap.budgetPlan] : '',
      status: columnMap.status >= 0 ? String(row[columnMap.status] || '').trim() : '',
      actualStart: columnMap.actualStart >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.actualStart]) : '',
      actualFinish: columnMap.actualFinish >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.actualFinish]) : '',
      budgetActual: columnMap.budgetActual >= 0 ? row[columnMap.budgetActual] : '',
      owner: columnMap.owner >= 0 ? String(row[columnMap.owner] || '').trim() : '',
      coordinator: columnMap.coordinator >= 0 ? String(row[columnMap.coordinator] || '').trim() : '',
      condition: columnMap.condition >= 0 ? String(row[columnMap.condition] || '').trim() : '',
      note: columnMap.note >= 0 ? String(row[columnMap.note] || '').trim() : '',
      masterCode: masterCode,
      rowType: rowType,
      detailTaskId: columnMap.detailTaskId >= 0 ? String(row[columnMap.detailTaskId] || '').trim() : '',
      progress: columnMap.progress >= 0 ? row[columnMap.progress] : '',
      weight: columnMap.weight >= 0 ? row[columnMap.weight] : ''
    };

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_CONTEXT) {
      currentContext = item;
      currentMaster = null;
      contexts.push(currentContext);
      continue;
    }

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_MASTER) {
      currentMaster = item;
      currentMaster.detailSlots = [];
      currentMaster.details = [];
      currentMaster.contextMasterCode = currentContext ? currentContext.masterCode : '';
      currentMaster.contextName = currentContext ? currentContext.taskName : '';
      masters.push(currentMaster);
      continue;
    }

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_DETAIL_SLOT) {
      item.slotNo = qltdDeptPlanExtractSlotNo_(masterCode);
      item.parentMasterCode = qltdDeptPlanExtractParentMasterCode_(masterCode);

      if (currentMaster) {
        currentMaster.detailSlots.push(item);
      }
    }

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_PB_DETAIL && currentMaster) {
      item.parentMasterCode = masterCode;
      currentMaster.details.push(item);
    }
  }

  return {
    deptCode: deptCode,
    sheetName: sheet.getName(),
    masterCount: masters.length,
    contextCount: contexts.length,
    contexts: contexts,
    masters: masters
  };
}

function qltdDeptPlanBuildMasterContextMap_(projectCode) {
  const byCode = {};
  const result = qltdGanttGetDataForProject_(projectCode);
  if (!result || result.success === false || !Array.isArray(result.data)) {
    return {
      byCode: byCode,
      warning: {
        type: 'MASTER_CONTEXT_UNAVAILABLE',
        projectCode: projectCode
      }
    };
  }
  result.data.forEach(function(task) {
    [task.masterTaskCode, task.code, task.taskId, task.id].forEach(function(value) {
      const key = qltdDeptPlanNormalizeMasterCode_(value);
      if (key && !byCode[key]) byCode[key] = task;
    });
  });
  return { byCode: byCode, warning: null };
}

function qltdDeptPlanEnrichWithMasterContext_(deptPlan, masterByCode, warnings, projectCode) {
  (deptPlan && deptPlan.masters || []).forEach(function(master) {
    const key = qltdDeptPlanNormalizeMasterCode_(master.masterCode);
    const official = masterByCode && masterByCode[key];
    if (!official) {
      master.ownZone = '';
      master.ownHangMuc = '';
      master.contextZone = '';
      master.contextHangMuc = '';
      master.zone = '';
      master.loaiCongTrinh = '';
      master.congTrinh = '';
      master.hangMuc = '';
      master.wbs = master.stt || '';
      master.wbsPath = '';
      master.contextPath = '';
      master.mappingWarnings = ['MASTER_TASK_NOT_FOUND'];
      (master.details || []).forEach(function(detail) {
        detail.ownZone = String(detail.ownZone || '').trim();
        detail.ownHangMuc = String(detail.ownHangMuc || '').trim();
        detail.contextZone = '';
        detail.contextHangMuc = '';
      });
      warnings.push({
        type: 'MASTER_TASK_NOT_FOUND',
        projectCode: projectCode,
        masterTaskCode: master.masterCode,
        rowNumber: master.rowIndex
      });
      return;
    }

    master.congViecZone = official.congViecZone || '';
    master.congViecHangMuc = official.congViecHangMuc || '';
    master.ownZone = master.congViecZone;
    master.ownHangMuc = master.congViecHangMuc;
    master.taskName = official.taskName || '';
    master.contextZone = official.contextZone || official.zone || '';
    master.contextHangMuc = official.contextHangMuc || official.hangMuc || '';
    master.zone = official.zone || '';
    master.loaiCongTrinh = official.loaiCongTrinh || '';
    master.congTrinh = official.congTrinh || '';
    master.hangMuc = official.hangMuc || '';
    master.wbs = official.wbs || master.stt || '';
    master.wbsPath = official.wbsPath || '';
    master.contextPath = official.contextPath || '';
    master.mappingWarnings = Array.isArray(official.mappingWarnings)
      ? official.mappingWarnings.slice()
      : [];

    (master.details || []).forEach(function(detail) {
      detail.congViecZone = master.congViecZone;
      detail.congViecHangMuc = master.congViecHangMuc;
      detail.ownZone = master.ownZone;
      detail.ownHangMuc = master.ownHangMuc;
      detail.contextZone = master.contextZone;
      detail.contextHangMuc = master.contextHangMuc;
      detail.zone = master.zone;
      detail.loaiCongTrinh = master.loaiCongTrinh;
      detail.congTrinh = master.congTrinh;
      detail.hangMuc = master.hangMuc;
      detail.wbsPath = master.wbsPath;
      detail.contextPath = master.contextPath;
      detail.mappingWarnings = master.mappingWarnings.slice();
    });
  });
  return deptPlan;
}

function qltdDeptPlanReadWeeklyProgressStateMap_(projectCode) {
  const empty = { byKey: {}, rowsRead: 0, stateCount: 0, sourceRead: false, warning: null };
  if (typeof qltdWeeklyTaskUpdatesRead_ !== 'function' || typeof qltdWeeklyTaskUpdatesBuildProgressStates_ !== 'function') {
    return Object.assign({}, empty, {
      warning: {
        type: 'WEEKLY_PROGRESS_UNAVAILABLE',
        projectCode: projectCode,
        message: 'Weekly progress service is unavailable; department source progress was retained.'
      }
    });
  }

  const read = qltdWeeklyTaskUpdatesRead_();
  if (!read || read.error) {
    return Object.assign({}, empty, {
      sourceRead: !!read,
      warning: {
        type: 'WEEKLY_PROGRESS_UNAVAILABLE',
        projectCode: projectCode,
        code: read && read.error && read.error.code || '',
        message: 'Weekly progress could not be read; department source progress was retained.'
      }
    });
  }

  const updates = Array.isArray(read.updates) ? read.updates : [];
  const byKey = qltdDeptPlanBuildWeeklyProgressStateMap_(
    projectCode,
    updates,
    qltdDeptPlanCurrentWeekCode_()
  );
  return {
    byKey: byKey,
    rowsRead: updates.length,
    stateCount: Object.keys(byKey).length,
    sourceRead: true,
    warning: null
  };
}

function qltdDeptPlanBuildWeeklyProgressStateMap_(projectCode, updates, targetWeekCode) {
  const normalizedProjectCode = qltdWorkNormalizeCode_(projectCode);
  const scopedUpdates = (Array.isArray(updates) ? updates : []).filter(function(update) {
    return update &&
      qltdWorkNormalizeCode_(update.projectCode) === normalizedProjectCode &&
      String(update.itemType || '').trim().toUpperCase() === QLTD_DEPT_PLAN_ROW_TYPE_MASTER;
  });
  const states = qltdWeeklyTaskUpdatesBuildProgressStates_(scopedUpdates, targetWeekCode);
  return (states || []).reduce(function(byKey, state) {
    const key = qltdDeptPlanWeeklyProgressKey_(
      state.projectCode,
      state.deptCode,
      state.itemType,
      state.itemId
    );
    if (!key) return byKey;
    if (!byKey[key] || qltdDeptPlanIsLaterWeeklyProgressState_(state, byKey[key])) byKey[key] = state;
    return byKey;
  }, {});
}

function qltdDeptPlanApplyWeeklyProgressStates_(deptPlan, projectCode, progressByKey) {
  const source = progressByKey || {};
  const deptCodes = [
    deptPlan && deptPlan.deptCode,
    deptPlan && deptPlan.deptCodeRaw,
    deptPlan && deptPlan.masterDeptCode,
    deptPlan && deptPlan.projectUnitCode,
    deptPlan && deptPlan.projectUnitCodeRaw
  ].filter(function(value, index, values) {
    return !!String(value || '').trim() && values.indexOf(value) === index;
  });

  (deptPlan && deptPlan.masters || []).forEach(function(master) {
    let state = null;
    for (let index = 0; index < deptCodes.length && !state; index += 1) {
      state = source[qltdDeptPlanWeeklyProgressKey_(
        projectCode,
        deptCodes[index],
        QLTD_DEPT_PLAN_ROW_TYPE_MASTER,
        master.masterCode
      )] || null;
    }
    if (!state || state.effectiveProgress === null || state.effectiveProgress === undefined) return;

    const progress = Number(state.effectiveProgress);
    if (!isFinite(progress)) return;
    const effectiveProgress = Math.max(0, Math.min(100, progress));
    const effectiveStatus = qltdDeptPlanResolveEffectiveStatus_(
      effectiveProgress,
      state.effectiveTaskStatus,
      master.status
    );
    master.sourceProgress = master.progress;
    master.sourceStatus = master.status;
    master.progress = effectiveProgress;
    master.status = effectiveStatus;
    master.effectiveProgress = effectiveProgress;
    master.effectiveStatus = effectiveStatus;
    master.effectiveProgressSource = 'WEEKLY_TASK_UPDATES';
    master.latestEffectiveWeek = state.latestUpdatedWeek || state.latestUpdateWeek || '';
    master.latestEffectiveUpdatedAt = state.latestUpdatedAt || '';
    master.effectiveApprovalStatus = state.effectiveApprovalStatus || '';
    master.effectiveUpdateId = state.effectiveUpdateId || '';
  });
  return deptPlan;
}

function qltdDeptPlanResolveEffectiveStatus_(progress, weeklyStatus, fallbackStatus) {
  if (Number(progress) >= 100) return 'Hoàn thành';
  const status = String(weeklyStatus || fallbackStatus || '').trim();
  const normalized = qltdDeptPlanNormalizeHeader_(status);
  if (normalized === 'HOANTHANH' || normalized === 'COMPLETE' || normalized === 'DONE') {
    return Number(progress) > 0 ? 'Đang làm' : 'Chưa bắt đầu';
  }
  if (status) return status;
  return Number(progress) > 0 ? 'Đang làm' : 'Chưa bắt đầu';
}

function qltdDeptPlanWeeklyProgressKey_(projectCode, deptCode, itemType, itemId) {
  const project = qltdWorkNormalizeCode_(projectCode);
  const dept = qltdDeptPlanCanonicalDeptCode_(deptCode);
  const type = String(itemType || '').trim().toUpperCase();
  const id = qltdDeptPlanNormalizeMasterCode_(itemId);
  return project && dept && type && id ? [project, dept, type, id].join('|') : '';
}

function qltdDeptPlanCanonicalDeptCode_(value) {
  const normalized = qltdWorkNormalizeCode_(value);
  if (!normalized) return '';
  const canonical = typeof qltdMasterDeptCanonicalCode_ === 'function'
    ? qltdMasterDeptCanonicalCode_(normalized)
    : '';
  return canonical || normalized;
}

function qltdDeptPlanIsLaterWeeklyProgressState_(candidate, current) {
  const weekOrder = String(candidate && (candidate.latestUpdatedWeek || candidate.latestUpdateWeek) || '')
    .localeCompare(String(current && (current.latestUpdatedWeek || current.latestUpdateWeek) || ''));
  if (weekOrder) return weekOrder > 0;
  const timeOrder = String(candidate && candidate.latestUpdatedAt || '')
    .localeCompare(String(current && current.latestUpdatedAt || ''));
  if (timeOrder) return timeOrder > 0;
  const rowOrder = Number(candidate && candidate.effectiveRowNumber || 0) - Number(current && current.effectiveRowNumber || 0);
  if (rowOrder) return rowOrder > 0;
  return String(candidate && candidate.effectiveUpdateId || '') > String(current && current.effectiveUpdateId || '');
}

function qltdDeptPlanCurrentWeekCode_(now) {
  const timeZone = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  const today = Utilities.formatDate(now || new Date(), timeZone, 'yyyy-MM-dd');
  const parts = today.split('-').map(Number);
  const monday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekday = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - weekday + 1);
  return 'WEEK-' + monday.getUTCFullYear() + '-' +
    String(monday.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(monday.getUTCDate()).padStart(2, '0');
}

function qltdDeptPlanNormalizeMasterCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdDeptPlanFindDeptCode_(values, fallbackSheetName) {
  for (let row = 0; row < Math.min(values.length, 5); row += 1) {
    for (let col = 0; col < Math.min(values[row].length, 5); col += 1) {
      const text = String(values[row][col] || '').trim();
      const match = text.match(/PHÃƒÆ’Ã¢â‚¬â„¢NG\/BAN:\s*(.+)$/i) || text.match(/PHONG\/BAN:\s*(.+)$/i);
      if (match && match[1]) {
        return String(match[1] || '').trim();
      }
    }
  }
  return String(fallbackSheetName || '').trim();
}

function qltdDeptPlanFindHeaderRowIndex_(values) {
  for (let row = 0; row < Math.min(values.length, 10); row += 1) {
    const normalized = values[row].map(function(value) {
      return qltdDeptPlanNormalizeHeader_(value);
    });

    if (
      normalized.indexOf('NOIDUNGCONGVIEC') !== -1 &&
      normalized.indexOf('MACONGVIECMASTER') !== -1 &&
      normalized.indexOf('LOAIDONG') !== -1
    ) {
      return row;
    }
  }

  return -1;
}

function qltdDeptPlanBuildColumnMap_(headers) {
  const normalizedHeaders = headers.map(function(header) {
    return qltdDeptPlanNormalizeHeader_(header);
  });

  return {
    stt: normalizedHeaders.indexOf('STT'),
    taskName: normalizedHeaders.indexOf('NOIDUNGCONGVIEC'),
    planStart: qltdDeptPlanFindHeaderAlias_(normalizedHeaders, [
      'NGAYBATDAUKEHOACH', 'BATDAUKEHOACH', 'NGAYBATDAUKH', 'BATDAUKH'
    ]),
    planFinish: qltdDeptPlanFindHeaderAlias_(normalizedHeaders, [
      'NGAYKETTHUCKEHOACH', 'KETTHUCKEHOACH', 'NGAYKETTHUCKH', 'KETTHUCKH'
    ]),
    budgetPlan: normalizedHeaders.indexOf('KEHOACHNGANSACH'),
    status: normalizedHeaders.indexOf('TRANGTHAITHUCHIEN'),
    actualStart: normalizedHeaders.indexOf('BATDAUTHUCTE'),
    actualFinish: normalizedHeaders.indexOf('HOANTHANHTHUCTE'),
    budgetActual: normalizedHeaders.indexOf('NGANSACHTHUCTE'),
    owner: normalizedHeaders.indexOf('NGUOICHUTRI'),
    coordinator: normalizedHeaders.indexOf('NGUOIPHOIHOP'),
    condition: normalizedHeaders.indexOf('DIEUKIENDAUVAO'),
    note: normalizedHeaders.indexOf('GHICHUCAPNHAT'),
    masterCode: normalizedHeaders.indexOf('MACONGVIECMASTER'),
    rowType: normalizedHeaders.indexOf('LOAIDONG'),
    detailTaskId: normalizedHeaders.indexOf('DETAILTASKID'),
    progress: normalizedHeaders.indexOf('HOANTHANH'),
    weight: normalizedHeaders.indexOf('TRONGSO')
  };
}

function qltdDeptPlanFindHeaderAlias_(normalizedHeaders, aliases) {
  for (let index = 0; index < aliases.length; index += 1) {
    const column = normalizedHeaders.indexOf(aliases[index]);
    if (column >= 0) return column;
  }
  return -1;
}

function qltdDeptPlanNormalizeHeader_(value) {
  return String(value || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ãƒâ€žÃ¢â‚¬Ëœ/g, 'd')
    .replace(/Ãƒâ€žÃ‚Â/g, 'D')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function qltdDeptPlanNormalizeRowType_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdDeptPlanExtractSlotNo_(masterCode) {
  const match = String(masterCode || '').match(/::(\d+)$/);
  return match ? match[1] : '';
}

function qltdDeptPlanExtractParentMasterCode_(masterCode) {
  const match = String(masterCode || '').match(/^DETAIL::(.+)::\d+$/);
  return match ? match[1] : '';
}

function qltdDeptPlanFormatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}
