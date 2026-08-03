from pathlib import Path

path = Path('firebase-hosting-dev/gantt-request-concurrency.test.mjs')
text = path.read_text(encoding='utf-8-sig')
old = "assert.match(projectOptionsSource, /qltdActiveView === 'dashboard'\\) loadDashboardSummaryForSelectedProject/);"
new = "assert.doesNotMatch(projectOptionsSource, /qltdActiveView === 'dashboard'\\) loadDashboardSummaryForSelectedProject/);\n  assert.match(projectOptionsSource, /renderDashboardIdle\\(selector\\.value/);"
count = text.count(old)
if count != 1:
    raise SystemExit(f'gantt lazy-load assertion: expected 1 match, found {count}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Updated Gantt concurrency lazy-load expectation.')
