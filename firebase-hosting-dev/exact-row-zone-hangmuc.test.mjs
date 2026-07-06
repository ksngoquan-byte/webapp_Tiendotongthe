import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = app.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = app.indexOf('{', start);
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] !== '}') continue;
    const candidate = app.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the complete declaration parses.
    }
  }
  throw new Error(`Unclosed ${name}`);
}

const context = vm.createContext({
  escapeHtml: (value) => String(value ?? ''),
  formatIsoDateVi: (value) => String(value || ''),
  getDeptPlanMasterWbs: (master) => String(master?.wbs || ''),
  getDeptObjectiveProgress: (master) => Number(master?.progress || 0),
  getDeptObjectiveStatusClass: () => '',
  qltdDeptPlanTodayIso: () => '2026-07-07',
  qltdDeptPlanBuildListView: (items) => ({ visible: items, total: items.length, remaining: 0 }),
  qltdDeptPlanIsOverdue: () => false,
  renderMasterCompletionWarning: () => '',
  renderMasterDetailCount: () => '0 việc',
  qltdDeptMasterListExpanded: false,
  qltdSelectedMasterCode: 'CV-1',
  toIsoDateLocal: () => '2026-07-31',
  normalizeWeeklyStatusKey: () => ''
});
vm.runInContext([
  extractFunction('normalizeTaskCode'),
  extractFunction('getOfficialMasterMapFromGantt'),
  extractFunction('isOfficialMasterComplete'),
  extractFunction('enrichDeptPlanPayloadWithOfficialMasters'),
  extractFunction('qltdExactRowOwnZone'),
  extractFunction('qltdExactRowOwnHangMuc'),
  extractFunction('qltdNormalizeExactRowTitlePart'),
  extractFunction('qltdExactRowDisplayTitle'),
  extractFunction('qltdWeeklyCategoryName'),
  extractFunction('qltdWeeklyDisplayTitle'),
  extractFunction('renderDeptObjectiveOwnZone'),
  extractFunction('renderDeptPlanTab'),
  extractFunction('renderExecutiveOverdueRow')
].join('\n'), context);

context.qltdGanttPayload = {
  data: [{
    id: 'UID-1',
    code: 'CV-1',
    text: 'Display fallback',
    taskName: 'Tiến độ thi công',
    ownZone: 'Zone 2',
    ownHangMuc: 'LK14',
    zone: 'Inherited Zone',
    hangMuc: 'Inherited category'
  }]
};
const enrichedDeptPlan = context.enrichDeptPlanPayloadWithOfficialMasters({
  success: true,
  departments: [{ masters: [{ masterCode: 'CV-1', taskName: 'Old', ownHangMuc: 'Old category' }] }]
});
assert.equal(enrichedDeptPlan.departments[0].masters[0].taskName, 'Tiến độ thi công');
assert.equal(enrichedDeptPlan.departments[0].masters[0].ownZone, 'Zone 2');
assert.equal(enrichedDeptPlan.departments[0].masters[0].ownHangMuc, 'LK14');
assert.equal(enrichedDeptPlan.departments[0].masters[0].congViecHangMuc, 'LK14');

assert.equal(
  context.qltdWeeklyDisplayTitle({
    taskName: 'Hoàn thành kết cấu phần thân',
    ownHangMuc: 'LK02',
    hangMuc: 'Inherited parent'
  }),
  'Hoàn thành kết cấu phần thân - LK02'
);
assert.equal(
  context.qltdWeeklyDisplayTitle({
    taskName: 'Hoàn thành kết cấu phần thân - lk02',
    ownHangMuc: ' LK02 '
  }),
  'Hoàn thành kết cấu phần thân - lk02'
);
assert.equal(
  context.qltdWeeklyDisplayTitle({
    taskName: 'Hoàn thành kết cấu phần thân',
    ownHangMuc: '',
    hangMuc: 'Inherited LK02'
  }),
  'Hoàn thành kết cấu phần thân'
);
assert.equal(
  context.qltdWeeklyDisplayTitle({
    taskName: 'MãXLK02',
    ownHangMuc: 'LK02'
  }),
  'MãXLK02 - LK02'
);
assert.equal(
  context.qltdWeeklyDisplayTitle({
    taskName: 'Hoàn thành phần cọc',
    congViecHangMuc: 'LK14',
    hangMuc: 'Inherited LK05'
  }),
  'Hoàn thành phần cọc - LK14'
);

const master = {
  masterCode: 'CV-1',
  wbs: 'III.3',
  taskName: 'Tiến độ thi công',
  ownZone: 'Zone 2',
  ownHangMuc: 'LK14',
  zone: 'Inherited Zone',
  hangMuc: 'Inherited category',
  contextPath: 'Parent > Child',
  planStart: '2026-07-01',
  planFinish: '2026-07-31',
  progress: 25,
  status: 'Đang thực hiện'
};
const deptHtml = context.renderDeptPlanTab({}, {}, [master], master);
assert.match(deptHtml, /III\.3 · Tiến độ thi công - LK14/);
assert.match(deptHtml, /<div class="task-title">Tiến độ thi công - LK14<\/div>/);
assert.match(deptHtml, /\[Zone 2\]/);
assert.doesNotMatch(deptHtml, /Inherited Zone|Inherited category|Parent &gt; Child|Parent > Child/);

const dashboardHtml = context.renderExecutiveOverdueRow({
  id: 'UID-1',
  text: 'Hoàn thành phần móng',
  ownHangMuc: '',
  hangMuc: 'Hoàn thành phê duyệt điều chỉnh',
  contextPath: 'Parent > Child',
  priorityIcon: '',
  owner: 'PTDA',
  endDate: new Date(2026, 6, 31),
  lateDays: 3
});
assert.match(dashboardHtml, /<td class="exec-context" title="—">—<\/td>/);
assert.doesNotMatch(dashboardHtml, /Hoàn thành phê duyệt điều chỉnh|Parent &gt; Child/);

console.log('Exact-row Weekly, Dept Plan, and Dashboard rendering: PASS');
