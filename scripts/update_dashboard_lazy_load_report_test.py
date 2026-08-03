from pathlib import Path

path = Path('firebase-hosting-dev/report-ux.test.mjs')
text = path.read_text(encoding='utf-8-sig')

old_context = """  qltdActiveView: 'report',\n  loadCount: 0,\n  dashboardLoadCount: 0,\n  document: { getElementById: () => ({ value: 'P1' }) },\n  getStoredProjectCode: () => '',\n  qltdInvalidateDashboardCacheForProject: () => {},\n  loadGanttDataForSelectedProject: async () => { ganttDirtyContext.loadCount += 1; },\n  loadDashboardSummaryForSelectedProject: async () => { ganttDirtyContext.dashboardLoadCount += 1; }"""
new_context = """  qltdActiveView: 'report',\n  qltdDashboardLoadRequestSeq: 0,\n  loadCount: 0,\n  dashboardLoadCount: 0,\n  dashboardIdleCount: 0,\n  document: { getElementById: () => ({ value: 'P1' }) },\n  getStoredProjectCode: () => '',\n  qltdInvalidateDashboardCacheForProject: () => {},\n  renderDashboardIdle: () => { ganttDirtyContext.dashboardIdleCount += 1; },\n  loadGanttDataForSelectedProject: async () => { ganttDirtyContext.loadCount += 1; },\n  loadDashboardSummaryForSelectedProject: async () => { ganttDirtyContext.dashboardLoadCount += 1; }"""
if text.count(old_context) != 1:
    raise SystemExit(f'report context: expected 1 match, found {text.count(old_context)}')
text = text.replace(old_context, new_context, 1)

old_assert = """ganttDirtyContext.qltdActiveView = 'dashboard';\nawait ganttDirtyContext.markWeeklyGanttRefreshRequired('P1');\nassert.equal(ganttDirtyContext.dashboardLoadCount, 1);"""
new_assert = """ganttDirtyContext.qltdActiveView = 'dashboard';\nawait ganttDirtyContext.markWeeklyGanttRefreshRequired('P1');\nassert.equal(ganttDirtyContext.dashboardLoadCount, 0);\nassert.equal(ganttDirtyContext.dashboardIdleCount, 1);\nassert.equal(ganttDirtyContext.qltdDashboardLoadRequestSeq, 1);"""
if text.count(old_assert) != 1:
    raise SystemExit(f'report assertion: expected 1 match, found {text.count(old_assert)}')
text = text.replace(old_assert, new_assert, 1)

path.write_text(text, encoding='utf-8')
print('Updated report refresh lazy-load expectation.')
