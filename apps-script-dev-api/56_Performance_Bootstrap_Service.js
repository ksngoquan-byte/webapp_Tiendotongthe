function qltdDevApiBootstrap_(params) {
  const resolution = resolveCurrentUser_(params);
  if (!resolution.success) return resolution;

  const user = resolution.user;
  const meta = {
    action: 'bootstrap',
    email: user.email
  };

  qltdProjectsEnsureSheet_();
  qltdProjectsSeedDefaultIfMissing_();
  const projects = qltdProjectsListForUser_(user.email).map(function(project) {
    return {
      projectCode: project.projectCode,
      projectName: project.projectName,
      defaultTaskSheet: project.defaultTaskSheet,
      defaultDeptSheet: project.defaultDeptSheet,
      sortOrder: project.sortOrder || ''
    };
  });

  return {
    success: true,
    profile: {
      success: true,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      deptCode: user.deptCode,
      deptName: user.deptName,
      empCode: user.empCode || '',
      permissions: qltdPermissionsForRole_(user.role),
      delegatedScopes: qltdUserProjectDeptAccessResolveAllEffectiveScopes_(user.email),
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    },
    projects: projects,
    apiStatus: 'CONNECTED',
    source: 'users_and_projects_sheets',
    meta: meta
  };
}
