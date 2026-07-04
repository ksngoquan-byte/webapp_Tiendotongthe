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
    performance.sourceCount = performance.sheetCount + 1;
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
      master.zone = '';
      master.loaiCongTrinh = '';
      master.congTrinh = '';
      master.hangMuc = '';
      master.wbs = master.stt || '';
      master.wbsPath = '';
      master.contextPath = '';
      master.mappingWarnings = ['MASTER_TASK_NOT_FOUND'];
      warnings.push({
        type: 'MASTER_TASK_NOT_FOUND',
        projectCode: projectCode,
        masterTaskCode: master.masterCode,
        rowNumber: master.rowIndex
      });
      return;
    }

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
