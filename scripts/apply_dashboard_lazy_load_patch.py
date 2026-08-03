from pathlib import Path


def read_text_preserve_bom(path: str):
    raw = Path(path).read_bytes()
    return raw.decode("utf-8-sig"), raw.startswith(b"\xef\xbb\xbf")


def write_text_preserve_bom(path: str, text: str, had_bom: bool):
    payload = text.encode("utf-8")
    if had_bom:
        payload = b"\xef\xbb\xbf" + payload
    Path(path).write_bytes(payload)


def replace_once(text: str, old: str, new: str, label: str):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


app_path = "firebase-hosting-dev/app.js"
app, app_bom = read_text_preserve_bom(app_path)

app = replace_once(
    app,
    """  setStoredProjectCode(selector.value);\n  if (qltdActiveView === 'dashboard') loadDashboardSummaryForSelectedProject(selector.value);\n  if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);""",
    """  setStoredProjectCode(selector.value);\n  if (qltdActiveView === 'dashboard') {\n    qltdDashboardPayload = null;\n    qltdDashboardLoadRequestSeq += 1;\n    renderDashboardIdle(selector.value);\n  }\n  if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);""",
    "initial project render must not load Dashboard",
)

app = replace_once(
    app,
    """    if (qltdActiveView === 'admin') loadAdminMasterApprovals();\n    if (qltdActiveView === 'dashboard') loadDashboardSummaryForSelectedProject(selector.value);\n    if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);""",
    """    if (qltdActiveView === 'admin') loadAdminMasterApprovals();\n    if (qltdActiveView === 'dashboard') {\n      qltdDashboardPayload = null;\n      qltdDashboardLoadRequestSeq += 1;\n      renderDashboardIdle(selector.value);\n    }\n    if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);""",
    "project selection must not load Dashboard",
)

app = replace_once(
    app,
    """  const request = fetchBackendJson('dashboardSummary', {\n    projectCode: code,\n    forceRefresh: options.forceRefresh ? '1' : ''\n  }, { auth: true }).then((payload) => {""",
    """  const request = fetchBackendJson('dashboardSummary', {\n    projectCode: code,\n    loadDashboard: '1',\n    forceRefresh: options.forceRefresh ? '1' : ''\n  }, { auth: true }).then((payload) => {""",
    "manual Dashboard request intent flag",
)

app = replace_once(
    app,
    """    } else if (qltdActiveView === 'dashboard') {\n      await loadDashboardSummaryForSelectedProject(projectCode, { forceRefresh: true });\n    }\n    await loadWeeklyTaskDataForCurrent({ force: true });""",
    """    } else if (qltdActiveView === 'dashboard') {\n      qltdDashboardPayload = null;\n      qltdDashboardLoadRequestSeq += 1;\n      renderDashboardIdle(projectCode, 'Dữ liệu đã thay đổi. Bấm “Tải Dashboard” để cập nhật.');\n    }\n    await loadWeeklyTaskDataForCurrent({ force: true });""",
    "objective save must not auto-refresh Dashboard",
)

app = replace_once(
    app,
    """  } else if (selectedProjectCode === projectCode && qltdActiveView === 'dashboard') {\n    await loadDashboardSummaryForSelectedProject(projectCode, { forceRefresh: true });\n  }\n}""",
    """  } else if (selectedProjectCode === projectCode && qltdActiveView === 'dashboard') {\n    qltdDashboardPayload = null;\n    qltdDashboardLoadRequestSeq += 1;\n    renderDashboardIdle(projectCode, 'Tiến độ đã thay đổi. Bấm “Tải Dashboard” để cập nhật.');\n  }\n}""",
    "schedule state change must not auto-refresh Dashboard",
)

app = replace_once(
    app,
    """function renderDashboardLoading(projectCode) {\n  const panel = document.getElementById('web07DashboardPanel');""",
    """function renderDashboardIdle(projectCode, message = '') {\n  const panel = document.getElementById('web07DashboardPanel');\n  if (!panel) return;\n  const code = String(projectCode || '').trim();\n  panel.innerHTML = `\n    <div class=\"web07-card\">\n      <p class=\"empty-state\">${escapeHtml(message || (code ? `Đã chọn dự án ${code}. Dashboard chưa được tải.` : 'Dashboard chưa được tải.'))}</p>\n      <p class=\"web07-muted\">Dữ liệu Dashboard chỉ được gọi khi bạn yêu cầu.</p>\n      <button id=\"dashboardLoadButton\" type=\"button\">Tải Dashboard</button>\n    </div>\n  `;\n  const loadButton = document.getElementById('dashboardLoadButton');\n  if (loadButton) {\n    loadButton.onclick = () => {\n      const selectedProjectCode = document.getElementById('projectSelector')?.value || code || getStoredProjectCode() || '';\n      if (!selectedProjectCode) return;\n      loadButton.disabled = true;\n      loadDashboardSummaryForSelectedProject(selectedProjectCode);\n    };\n  }\n}\n\nfunction renderDashboardLoading(projectCode) {\n  const panel = document.getElementById('web07DashboardPanel');""",
    "Dashboard idle state with explicit load button",
)

app = replace_once(
    app,
    """function renderDashboardError(error) {\n  const panel = document.getElementById('web07DashboardPanel');\n  if (!panel) return;\n  panel.innerHTML = `\n    <div class=\"web07-card\">\n      <p class=\"empty-state\">Không tải được Dashboard từ Apps Script API.</p>\n      <p class=\"web07-muted\">${escapeHtml(error.message || error)}</p>\n    </div>\n  `;\n}""",
    """function renderDashboardError(error) {\n  const panel = document.getElementById('web07DashboardPanel');\n  if (!panel) return;\n  panel.innerHTML = `\n    <div class=\"web07-card\">\n      <p class=\"empty-state\">Không tải được Dashboard từ Apps Script API.</p>\n      <p class=\"web07-muted\">${escapeHtml(error.message || error)}</p>\n      <button id=\"dashboardRetryButton\" type=\"button\">Thử lại</button>\n    </div>\n  `;\n  const retryButton = document.getElementById('dashboardRetryButton');\n  if (retryButton) {\n    retryButton.onclick = () => {\n      const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';\n      if (!projectCode) return;\n      retryButton.disabled = true;\n      loadDashboardSummaryForSelectedProject(projectCode, { forceRefresh: true });\n    };\n  }\n}""",
    "Dashboard retry must be explicit user action",
)

write_text_preserve_bom(app_path, app, app_bom)

api_path = "apps-script-dev-api/28_DEV_API.js"
api, api_bom = read_text_preserve_bom(api_path)
api = replace_once(
    api,
    """function qltdDevApiDashboardSummary_(params) {\n  const projectCode = params && params.projectCode;\n  const resolution = resolveCurrentUser_(params);""",
    """function qltdDevApiDashboardSummary_(params) {\n  const loadDashboard = String(params && params.loadDashboard || '').trim();\n  if (loadDashboard !== '1') {\n    return qltdDevApiJson_({\n      success: false,\n      code: 'DASHBOARD_LOAD_INTENT_REQUIRED',\n      message: 'Dashboard chỉ được tải khi người dùng yêu cầu.',\n      apiStatus: 'CONNECTED'\n    });\n  }\n  const projectCode = params && params.projectCode;\n  const resolution = resolveCurrentUser_(params);""",
    "backend Dashboard intent gate",
)
write_text_preserve_bom(api_path, api, api_bom)

test_path = "firebase-hosting-dev/dashboard-critical-path.test.mjs"
test, test_bom = read_text_preserve_bom(test_path)
test = replace_once(
    test,
    """const dashboardLoader = extractFunction(app, 'loadDashboardSummaryForSelectedProject');\nconst ganttLoader""",
    """const dashboardLoader = extractFunction(app, 'loadDashboardSummaryForSelectedProject');\nconst dashboardRequest = extractFunction(app, 'qltdRequestDashboardSummary');\nconst dashboardIdle = extractFunction(app, 'renderDashboardIdle');\nconst dashboardError = extractFunction(app, 'renderDashboardError');\nconst ganttLoader""",
    "dashboard test function inventory",
)
test = replace_once(
    test,
    """assert.match(projectOptions, /qltdActiveView === 'dashboard'\\) loadDashboardSummaryForSelectedProject/);\nassert.match(projectOptions, /qltdActiveView === 'gantt'\\) loadGanttDataForSelectedProject/);""",
    """assert.doesNotMatch(projectOptions, /qltdActiveView === 'dashboard'\\) loadDashboardSummaryForSelectedProject/);\nassert.match(projectOptions, /renderDashboardIdle\\(selector\\.value/);\nassert.match(projectOptions, /qltdActiveView === 'gantt'\\) loadGanttDataForSelectedProject/);""",
    "dashboard critical path project assertions",
)
test = replace_once(
    test,
    """assert.doesNotMatch(dashboardLoader, /ganttData|getProjectScheduleState|loadMainMilestonesForProject|renderGanttPanel/);\nassert.match(ganttLoader""",
    """assert.doesNotMatch(dashboardLoader, /ganttData|getProjectScheduleState|loadMainMilestonesForProject|renderGanttPanel/);\nassert.match(dashboardRequest, /loadDashboard:\\s*'1'/);\nassert.match(dashboardIdle, /dashboardLoadButton/);\nassert.match(dashboardError, /dashboardRetryButton/);\nassert.match(ganttLoader""",
    "dashboard manual intent assertions",
)
write_text_preserve_bom(test_path, test, test_bom)

perf_path = "firebase-hosting-dev/performance-critical-boot.test.mjs"
perf, perf_bom = read_text_preserve_bom(perf_path)
perf = replace_once(
    perf,
    "criticalRequestsAfter: ['bootstrap', 'dashboardSummary'],",
    "criticalRequestsAfter: ['bootstrap'],",
    "critical boot request list",
)
perf = replace_once(
    perf,
    "assert.equal(benchmark.criticalRequestsAfter.length, 2);",
    "assert.equal(benchmark.criticalRequestsAfter.length, 1);",
    "critical boot request count",
)
write_text_preserve_bom(perf_path, perf, perf_bom)

lazy_test = r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const dispatcher = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const expression = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = expression.exec(source);
  assert.ok(match, `Missing ${name}`);
  const start = match.index;
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the complete declaration parses.
    }
  }
  throw new Error(`Unclosed ${name}`);
}

const projectOptions = extractFunction(app, 'renderProjectOptions');
const showView = extractFunction(app, 'showWeb07View');
const dashboardRequest = extractFunction(app, 'qltdRequestDashboardSummary');
const dashboardIdle = extractFunction(app, 'renderDashboardIdle');
const dashboardError = extractFunction(app, 'renderDashboardError');
const backendHandler = extractFunction(dispatcher, 'qltdDevApiDashboardSummary_');

assert.doesNotMatch(projectOptions, /loadDashboardSummaryForSelectedProject\\(selector\\.value\\)/);
assert.match(projectOptions, /renderDashboardIdle\\(selector\\.value/);
assert.match(showView, /viewName === 'dashboard'[\\s\\S]*loadDashboardSummaryForSelectedProject/);
assert.match(dashboardRequest, /loadDashboard:\\s*'1'/);
assert.match(dashboardIdle, /dashboardLoadButton/);
assert.match(dashboardError, /dashboardRetryButton/);
assert.match(backendHandler, /DASHBOARD_LOAD_INTENT_REQUIRED/);
assert.ok(
  backendHandler.indexOf('DASHBOARD_LOAD_INTENT_REQUIRED') < backendHandler.indexOf('resolveCurrentUser_'),
  'intent gate must run before auth/project/data work'
);
assert.ok(
  backendHandler.indexOf('DASHBOARD_LOAD_INTENT_REQUIRED') < backendHandler.indexOf('qltdDashboardGetSummaryForProject_'),
  'intent gate must run before Dashboard dataset build'
);

console.log('dashboard-lazy-load.test.mjs: PASS');
'''
Path("firebase-hosting-dev/dashboard-lazy-load.test.mjs").write_text(lazy_test, encoding="utf-8")

package_path = "firebase-hosting-dev/package.json"
package_text, package_bom = read_text_preserve_bom(package_path)
package_text = replace_once(
    package_text,
    "node dashboard-critical-path.test.mjs && node weekly-periods.test.mjs",
    "node dashboard-critical-path.test.mjs && node dashboard-lazy-load.test.mjs && node weekly-periods.test.mjs",
    "package test registration",
)
write_text_preserve_bom(package_path, package_text, package_bom)

print("Dashboard lazy-load patch applied.")
