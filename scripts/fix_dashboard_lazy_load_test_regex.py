from pathlib import Path

path = Path('firebase-hosting-dev/dashboard-lazy-load.test.mjs')
text = path.read_text(encoding='utf-8')
replacements = {
    r"/loadDashboardSummaryForSelectedProject\\(selector\\.value\\)/": r"/loadDashboardSummaryForSelectedProject\(selector\.value\)/",
    r"/renderDashboardIdle\\(selector\\.value/": r"/renderDashboardIdle\(selector\.value/",
    r"/viewName === 'dashboard'[\\s\\S]*loadDashboardSummaryForSelectedProject/": r"/viewName === 'dashboard'[\s\S]*loadDashboardSummaryForSelectedProject/",
    r"/loadDashboard:\\s*'1'/": r"/loadDashboard:\s*'1'/",
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Missing generated regex literal: {old}')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Fixed generated Dashboard lazy-load regex literals.')
