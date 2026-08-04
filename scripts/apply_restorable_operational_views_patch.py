from pathlib import Path


def read_text(path: str):
    raw = Path(path).read_bytes()
    return raw.decode('utf-8-sig'), raw.startswith(b'\xef\xbb\xbf')


def write_text(path: str, text: str, had_bom: bool):
    payload = text.encode('utf-8')
    if had_bom:
        payload = b'\xef\xbb\xbf' + payload
    Path(path).write_bytes(payload)


def replace_once(text: str, old: str, new: str, label: str):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


app_path = 'firebase-hosting-dev/app.js'
app, app_bom = read_text(app_path)

app = replace_once(
    app,
    "const DEPT_STORAGE_KEY = 'qltd.selectedDeptCode.v1';",
    "const DEPT_STORAGE_KEY = 'qltd.selectedDeptCode.v1';\nconst QLTD_RESTORABLE_INITIAL_VIEWS = new Set(['report', 'gantt']);",
    'restorable view allow-list',
)

app = replace_once(
    app,
    "if (storedView && qltdCanAccessView(storedView, profile, permissions)) return storedView;",
    "if (storedView && QLTD_RESTORABLE_INITIAL_VIEWS.has(storedView) && qltdCanAccessView(storedView, profile, permissions)) return storedView;",
    'stored view resolver guard',
)

write_text(app_path, app, app_bom)


test_path = 'firebase-hosting-dev/initial-view-routing.test.mjs'
test, test_bom = read_text(test_path)

test = replace_once(
    test,
    """const context = {
  normalizeRoleKey: (value) => String(value || '').trim().toUpperCase(),
  getStoredLastView: () => '',
  qltdCanAccessView: (viewName) => ['report', 'gantt', 'dashboard'].includes(viewName)
};""",
    """const context = {
  normalizeRoleKey: (value) => String(value || '').trim().toUpperCase(),
  getStoredLastView: () => '',
  QLTD_RESTORABLE_INITIAL_VIEWS: new Set(['report', 'gantt']),
  qltdCanAccessView: (viewName) => ['report', 'gantt', 'dashboard'].includes(viewName)
};""",
    'test context allow-list',
)

test = replace_once(
    test,
    """context.getStoredLastView = () => 'dashboard';
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'dashboard');
context.getStoredLastView = () => 'budget';
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'report');""",
    """context.getStoredLastView = () => 'dashboard';
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'report');
assert.equal(context.resolveInitialViewForUser({ role: 'ADMIN' }, {}), 'gantt');
context.getStoredLastView = () => 'gantt';
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'gantt');
context.getStoredLastView = () => 'budget';
assert.equal(context.resolveInitialViewForUser({ role: 'EDITOR' }, {}), 'report');""",
    'dashboard non-restorable assertions',
)

test = replace_once(
    test,
    "assert.match(renderAppSource, /skipDataLoad:\\s*true,\\s*skipPersist:\\s*true/);",
    "assert.match(renderAppSource, /skipDataLoad:\\s*true,\\s*skipPersist:\\s*true/);\nassert.match(app, /const QLTD_RESTORABLE_INITIAL_VIEWS = new Set\\(\\['report', 'gantt'\\]\\)/);\nassert.match(resolverSource, /QLTD_RESTORABLE_INITIAL_VIEWS\\.has\\(storedView\\)/);",
    'allow-list source assertions',
)

write_text(test_path, test, test_bom)

print('Restorable operational views patch applied.')
