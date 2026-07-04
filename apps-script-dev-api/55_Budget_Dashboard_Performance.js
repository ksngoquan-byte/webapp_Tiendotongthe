function qltdBudgetGetLiveDashboardOptimized_(params) {
  const action = 'budget_getLiveDashboard';
  const email = qltdDevApiNormalizeEmail_(params && params.email);
  const projectCode = qltdBudgetNormalizeCode_(params && params.projectCode);
  const deptCode = qltdBudgetNormalizeCode_(params && params.deptCode);
  const view = qltdBudgetNormalizeKey_(params && (params.view || params.scope)) === 'department' || deptCode ? 'department' : 'project';
  const meta = {
    action: action,
    email: email || 'anonymous',
    projectCode: projectCode,
    deptCode: deptCode,
    view: view,
    optimized: true
  };

  if (!email) return qltdBudgetError_(action, 'EMAIL_REQUIRED', 'email la bat buoc.', meta);
  const user = qltdUsersGetByEmail_(email);
  if (!qltdCanUseGeneralFeature_(user)) {
    return qltdBudgetError_(action, 'ACCESS_DENIED', 'Chi user ACTIVE duoc xem Dashboard ngan sach.', meta);
  }
  if (!projectCode) return qltdBudgetError_(action, 'PROJECT_CODE_REQUIRED', 'Thieu projectCode.', meta);

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return projectsResult.error;
  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return qltdBudgetError_(action, 'PROJECT_NOT_FOUND', 'Khong tim thay du an ACTIVE.', meta, projectsResult.warnings);
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  const deptWarnings = deptsResult.error ? [
    qltdBudgetWarning_('PROJECT_DEPTS_UNAVAILABLE', 'Khong doc duoc Project_Depts.', {
      projectCode: projectCode
    })
  ] : (deptsResult.warnings || []);
  const departments = (deptsResult.departments || []).filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });
  if (deptCode && !qltdBudgetFindProjectDept_(departments, deptCode)) {
    return qltdBudgetError_(action, 'DEPT_NOT_FOUND', 'Khong tim thay phong/ban ACTIVE.', meta, (projectsResult.warnings || []).concat(deptWarnings));
  }

  const itemsResult = qltdBudgetReadBudgetItems_();
  const allocationsResult = qltdBudgetReadAllocations_();
  const rawResult = qltdBudgetLiveDashboardReadRaw_();
  const sharedInput = {
    project: project,
    departments: departments,
    items: itemsResult.items || [],
    allocations: allocationsResult.allocations || [],
    rawRows: rawResult.rows || [],
    rawHeaderMap: rawResult.headerMap || {},
    projectCode: projectCode,
    meta: meta
  };

  const model = qltdBudgetBuildLiveDashboardModel_(Object.assign({}, sharedInput, {
    deptCode: deptCode,
    view: view
  }));

  if (view === 'project') {
    const departmentViews = {};
    departments.forEach(function(dept) {
      const code = qltdBudgetNormalizeCode_(dept.deptCode);
      if (!code) return;
      departmentViews[code] = qltdBudgetBuildLiveDashboardModel_(Object.assign({}, sharedInput, {
        deptCode: code,
        view: 'department',
        meta: Object.assign({}, meta, { deptCode: code, view: 'department' })
      }));
    });
    model.departmentViews = departmentViews;
    model.departmentViewCount = Object.keys(departmentViews).length;
  }

  const result = qltdBudgetOk_(action, model, (projectsResult.warnings || [])
    .concat(deptWarnings)
    .concat(itemsResult.warnings || [])
    .concat(allocationsResult.warnings || [])
    .concat(rawResult.warnings || []), meta);
  result.performance = {
    rowsRead: (projectsResult.projects || []).length +
      (deptsResult.departments || []).length +
      (itemsResult.items || []).length +
      (allocationsResult.allocations || []).length +
      (rawResult.rows || []).length,
    recordCount: Number(model && model.departmentViewCount || 0),
    sheetCount: 5,
    sourceCount: 5,
    cacheHit: false
  };
  return result;
}
