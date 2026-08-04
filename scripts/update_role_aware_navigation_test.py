from pathlib import Path

path = Path('firebase-hosting-dev/navigation-budget-dashboard.test.mjs')
text = path.read_text(encoding='utf-8-sig')
old = """assert.ok(nav.indexOf('NAV_LABELS.workDashboard') < nav.indexOf('NAV_LABELS.budgetDashboard'));
assert.ok(nav.indexOf('NAV_LABELS.budgetDashboard') < nav.indexOf('NAV_LABELS.gantt'));
assert.ok(nav.indexOf('NAV_LABELS.gantt') < nav.indexOf('NAV_LABELS.help'));
assert.ok(nav.indexOf('NAV_LABELS.help') < nav.indexOf('NAV_LABELS.report'));
assert.ok(nav.indexOf('NAV_LABELS.report') < nav.indexOf('NAV_LABELS.admin'));"""
new = """assert.ok(nav.indexOf('NAV_LABELS.report') < nav.indexOf('NAV_LABELS.gantt'));
assert.ok(nav.indexOf('NAV_LABELS.gantt') < nav.indexOf('NAV_LABELS.workDashboard'));
assert.ok(nav.indexOf('NAV_LABELS.workDashboard') < nav.indexOf('NAV_LABELS.budgetDashboard'));
assert.ok(nav.indexOf('NAV_LABELS.budgetDashboard') < nav.indexOf('NAV_LABELS.help'));
assert.ok(nav.indexOf('NAV_LABELS.help') < nav.indexOf('NAV_LABELS.admin'));"""
if text.count(old) != 1:
    raise SystemExit(f'navigation order assertions: expected 1 match, found {text.count(old)}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Updated navigation order regression expectations.')
