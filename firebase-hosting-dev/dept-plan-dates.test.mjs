import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/32_DEPT_PLAN_SERVICE.js', import.meta.url), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(`${source}\nthis.api = { parse: qltdDeptPlanParseSheet_, map: qltdDeptPlanBuildColumnMap_, normalize: qltdDeptPlanNormalizeHeader_ };`, context);

const headers = ['STT', 'Nội dung công việc', 'Ngày bắt đầu kế hoạch', 'Ngày kết thúc kế hoạch', 'Mã công việc Master', 'Loại dòng'];
const dates = [
  ['V.1.1', 'Công việc 1', '2026-06-08', '2026-06-10', 'M-1', 'MASTER'],
  ['V.1.4', 'Công việc 2', '2026-06-11', '2026-06-11', 'M-2', 'MASTER'],
  ['V.1.5', 'Công việc 3', '2026-06-12', '2026-06-26', 'M-3', 'MASTER'],
  ['V.3.1', 'Công việc 4', '2026-06-10', '2026-06-11', 'M-4', 'MASTER'],
  ['V.3.2', 'Công việc 5', '2026-06-12', '2026-07-11', 'M-5', 'MASTER']
];
const values = [headers, ...dates];
const sheet = {
  getName: () => 'PTDA',
  getLastRow: () => values.length,
  getLastColumn: () => headers.length,
  getRange: () => ({ getValues: () => values })
};
const parsed = context.api.parse(sheet, { projectCode: '24-1.ĐB' });

assert.equal(context.api.normalize('Ngày bắt đầu kế hoạch'), 'NGAYBATDAUKEHOACH');
assert.equal(context.api.map(headers).planStart, 2);
assert.equal(context.api.map(['Bắt đầu KH']).planStart, 0);
assert.equal(context.api.map(['Kết thúc KH']).planFinish, 0);
assert.equal(parsed.masters.length, 5);
assert.deepEqual(Array.from(parsed.masters, (item) => item.planStart), dates.map((row) => row[2]));
assert.deepEqual(Array.from(parsed.masters, (item) => item.planFinish), dates.map((row) => row[3]));
assert.ok(parsed.masters.every((item) => item.planStart && item.planFinish));

console.log('Dept plan date parser/DTO: 5/5 masters passed.');

const pbBackendSource = fs.readFileSync(new URL('../apps-script-dev-api/64_PB_Detail_Task_Service.js', import.meta.url), 'utf8');
const pbUiSource = fs.readFileSync(new URL('./pb-detail-ui.js', import.meta.url), 'utf8');

function extractFunction(functionSource, name) {
  const start = functionSource.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const bodyStart = functionSource.indexOf('{', start);
  for (let index = bodyStart; index < functionSource.length; index += 1) {
    if (functionSource[index] !== '}') continue;
    const candidate = functionSource.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the function declaration is complete.
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const pbContext = {
  qltdBudgetFormatDate_: (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
  qltdPbDetailNormalizeTaskCode_: (value) => String(value || '').trim(),
  console
};
vm.createContext(pbContext);
vm.runInContext([
  extractFunction(pbBackendSource, 'qltdPbDetailParseIsoDate_'),
  extractFunction(pbBackendSource, 'qltdPbDetailDateIso_'),
  extractFunction(pbBackendSource, 'qltdPbDetailValidateParentFinish_')
].join('\n'), pbContext);

for (const iso of ['2026-01-02', '2026-02-01', '2026-11-12', '2026-12-11']) {
  assert.equal(pbContext.qltdPbDetailDateIso_(pbContext.qltdPbDetailParseIsoDate_(iso)), iso);
}
assert.equal(pbContext.qltdPbDetailParseIsoDate_('2026-02-30'), null);

const masterRow = { masterTaskCode: 'M-1', values: ['', '', '', '2026-06-20'] };
const pbColumns = { planFinish: 3 };
assert.equal(pbContext.qltdPbDetailValidateParentFinish_('2026-06-19', masterRow, pbColumns, 'M-1'), null);
assert.equal(pbContext.qltdPbDetailValidateParentFinish_('2026-06-20', masterRow, pbColumns, 'M-1'), null);
const parentError = pbContext.qltdPbDetailValidateParentFinish_('2026-06-21', masterRow, pbColumns, 'M-1');
assert.equal(parentError.code, 'DETAIL_PLAN_FINISH_EXCEEDS_MASTER');
assert.equal(parentError.extra.parentPlanFinish, '2026-06-20');
assert.equal(parentError.extra.requestedPlanFinish, '2026-06-21');
assert.equal(parentError.extra.masterTaskCode, 'M-1');
assert.match(parentError.message, /Ngày kết thúc việc con 2026-06-21/);

const pbUiContext = { Date, Number, String, console };
vm.createContext(pbUiContext);
vm.runInContext([
  extractFunction(pbUiSource, 'qltdPbDetailParseIsoDateParts'),
  extractFunction(pbUiSource, 'qltdPbDetailFormatDisplayDate'),
  extractFunction(pbUiSource, 'qltdPbDetailFormatTableDate')
].join('\n'), pbUiContext);
assert.equal(pbUiContext.qltdPbDetailFormatDisplayDate('2026-01-02'), '02/01/2026');
assert.equal(pbUiContext.qltdPbDetailFormatDisplayDate('2026-02-01'), '01/02/2026');
assert.equal(pbUiContext.qltdPbDetailFormatDisplayDate('2026-11-12'), '12/11/2026');
assert.equal(pbUiContext.qltdPbDetailFormatDisplayDate('2026-12-11'), '11/12/2026');
assert.equal(pbUiContext.qltdPbDetailFormatDisplayDate('2026-02-30'), '2026-02-30');
assert.equal(pbUiContext.qltdPbDetailFormatTableDate('2026-01-02'), '02/01/2026');
assert.equal(pbUiContext.qltdPbDetailFormatTableDate(''), '—');
assert.equal(pbUiContext.qltdPbDetailFormatTableDate(null), '—');
assert.equal(pbUiContext.qltdPbDetailFormatTableDate(undefined), '—');
assert.equal(pbUiContext.qltdPbDetailFormatTableDate('2026-02-30'), '—');
assert.equal(pbUiContext.qltdPbDetailFormatTableDate('not-a-date'), '—');
const formatDatePair = (planStart, planFinish) => [
  pbUiContext.qltdPbDetailFormatTableDate(planStart),
  pbUiContext.qltdPbDetailFormatTableDate(planFinish)
];
assert.deepEqual(formatDatePair('2026-01-02', '2026-12-11'), ['02/01/2026', '11/12/2026']);
assert.deepEqual(formatDatePair('2026-01-02', ''), ['02/01/2026', '—']);
assert.deepEqual(formatDatePair('', '2026-12-11'), ['—', '11/12/2026']);
assert.deepEqual(formatDatePair('', ''), ['—', '—']);
assert.deepEqual(formatDatePair('invalid-start', '2026-02-30'), ['—', '—']);

assert.match(pbBackendSource, /qltdPbDetailValidateParentFinish_\(\s*validation\.updates\.planFinish/);
assert.match(pbBackendSource, /qltdPbDetailValidateParentFinish_\(\s*row\[sheetContext\.columns\.planFinish\]/);
assert.match(pbBackendSource, /function qltdWorkAuditDetailTaskParentFinish_/);
assert.doesNotMatch(extractFunction(pbBackendSource, 'qltdPbDetailAuditParentFinishViolations_'), /setValue|setValues|appendRow|deleteRow/);
assert.match(pbBackendSource, /\['action', 'email', 'actorEmail', 'idToken', 'projectCode', 'deptCode', 'masterTaskCode'\]/);
const pbRenderSource = extractFunction(pbUiSource, 'qltdPbDetailRender');
const pbRowsSource = pbRenderSource.slice(pbRenderSource.indexOf('const rowsHtml'), pbRenderSource.indexOf('panel.innerHTML'));
const pbTableHeaderSource = pbRenderSource.slice(pbRenderSource.indexOf('<thead>'), pbRenderSource.indexOf('</thead>'));
assert.match(pbRowsSource, /qltdPbDetailFormatTableDate\(task\.planStart\)/);
assert.match(pbRowsSource, /qltdPbDetailFormatTableDate\(task\.planFinish\)/);
assert.doesNotMatch(pbRowsSource, /→|undefined|null|Invalid Date|NaN/);
assert.match(pbTableHeaderSource, /<th>Bắt đầu<\/th>/);
assert.match(pbTableHeaderSource, /<th>Kết thúc<\/th>/);
assert.doesNotMatch(pbTableHeaderSource, /<th>Kế hoạch<\/th>/);
assert.equal((pbRowsSource.match(/<td(?:\s|>)/g) || []).length, (pbTableHeaderSource.match(/<th(?:\s|>)/g) || []).length);
assert.match(pbUiSource, /data-pb-detail-action="edit"/);
assert.match(pbUiSource, /\+ Thêm việc chi tiết/);
assert.match(pbUiSource, /vượt ngày kết thúc việc cha/);
assert.match(pbUiSource, /idToken:\s*authContext\.idToken/);

console.log('PB_DETAIL date and parent finish tests: PASS');
