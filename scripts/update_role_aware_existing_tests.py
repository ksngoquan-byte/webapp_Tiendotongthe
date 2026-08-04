from pathlib import Path

path = Path('firebase-hosting-dev/auth-registration-projects.test.mjs')
text = path.read_text(encoding='utf-8-sig')

old_assert = "assert.match(extractFunction(appSource, 'renderApp'), /showWeb07View\\('dashboard', \\{ skipDataLoad: true \\}\\)/);"
new_assert = "assert.match(extractFunction(appSource, 'renderApp'), /resolveInitialViewForUser\\(effectiveProfile, currentPermissions\\)/);\nassert.doesNotMatch(extractFunction(appSource, 'renderApp'), /showWeb07View\\('dashboard'/);"
if text.count(old_assert) != 1:
    raise SystemExit(f'auth render assertion: expected 1 match, found {text.count(old_assert)}')
text = text.replace(old_assert, new_assert, 1)

old_context = """  formatRole: (role) => role,
  applyPermissions() {},
  ensureWeb07Panels() {},
  bindWeb07Navigation() {},
  showWeb07View() {},
  qltdProjectRegistry: [],"""
new_context = """  formatRole: (role) => role,
  currentPermissions: { dashboard: true, budgetDashboard: true, gantt: true, help: true, reportUpdate: true, admin: false },
  applyPermissions() {},
  ensureWeb07Panels() {},
  bindWeb07Navigation() {},
  resolveInitialViewForUser: (profile) => ['REPORTER', 'EDITOR'].includes(String(profile?.role || '').toUpperCase()) ? 'report' : 'gantt',
  showWeb07View() {},
  qltdProjectRegistry: [],"""
if text.count(old_context) != 1:
    raise SystemExit(f'auth render context: expected 1 match, found {text.count(old_context)}')
text = text.replace(old_context, new_context, 1)

path.write_text(text, encoding='utf-8')
print('Updated auth registration project routing expectations.')
