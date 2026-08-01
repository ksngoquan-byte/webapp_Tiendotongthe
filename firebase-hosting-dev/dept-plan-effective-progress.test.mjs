import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const deptPlanSource = fs.readFileSync(
  new URL('../apps-script-dev-api/32_DEPT_PLAN_SERVICE.js', import.meta.url),
  'utf8'
);
const weeklySource = fs.readFileSync(
  new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url),
  'utf8'
);
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(match?.index !== undefined, `Missing function ${name}`);
  const start = match.index;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const canonicalDept = (value) => {
  const normalized = normalizeCode(value).replace(/Đ/g, 'D').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
  if (['THIETKE', 'THIETKEKYTHUAT'].includes(normalized)) return 'THIETKE';
  return normalized;
};
const context = vm.createContext({
  console,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  isFinite,
  qltdWorkNormalizeCode_: normalizeCode,
  qltdWorkNormalizeWeekCode_: normalizeCode,
  qltdMasterDeptCanonicalCode_: canonicalDept,
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  Utilities: { formatDate: (value) => new Date(value).toISOString().slice(0, 10) },
  normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
});
vm.runInContext(`${weeklySource}\n${deptPlanSource}`, context);
vm.runInContext([
  extractFunction(appSource, 'getDeptObjectiveProgress'),
  extractFunction(appSource, 'getDeptObjectiveStatusClass'),
  extractFunction(appSource, 'qltdDeptPlanParseIsoDate'),
  extractFunction(appSource, 'qltdDeptPlanIsOverdue')
].join('\n'), context);

const updates = [
  { updateId: 'CV186-W29', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-13', itemType: 'MASTER', itemId: 'CV-186', progressEnd: 95, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-16T02:04:41.473Z', rowNumber: 86 },
  { updateId: 'CV186-W31-APPROVED', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-27', itemType: 'MASTER', itemId: 'CV-186', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'APPROVED', updatedAt: '2026-07-31T10:28:54.684Z', rowNumber: 148 },
  { updateId: 'PENDING-BASE', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-13', itemType: 'MASTER', itemId: 'CV-PENDING', progressEnd: 95, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-16T02:10:00.000Z', rowNumber: 87 },
  { updateId: 'PENDING-100', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-27', itemType: 'MASTER', itemId: 'CV-PENDING', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'PENDING', updatedAt: '2026-07-31T11:00:00.000Z', rowNumber: 149 },
  { updateId: 'REJECTED-BASE', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-13', itemType: 'MASTER', itemId: 'CV-REJECTED', progressEnd: 70, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-16T02:20:00.000Z', rowNumber: 88 },
  { updateId: 'REJECTED-100', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-27', itemType: 'MASTER', itemId: 'CV-REJECTED', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'REJECTED', updatedAt: '2026-07-31T12:00:00.000Z', rowNumber: 150 },
  { updateId: 'SAME-A', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-27', itemType: 'MASTER', itemId: 'SAME-A', progressEnd: 30, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-31T13:00:00.000Z', rowNumber: 151 },
  { updateId: 'SAME-B', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-27', itemType: 'MASTER', itemId: 'SAME-B', progressEnd: 40, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-31T14:00:00.000Z', rowNumber: 152 },
  { updateId: 'OTHER-PROJECT', projectCode: '37-5.HL1', deptCode: 'THIETKE', weekCode: 'WEEK-2026-07-27', itemType: 'MASTER', itemId: 'CV-186', progressEnd: 55, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-31T15:00:00.000Z', rowNumber: 153 },
  { updateId: 'OTHER-DEPT', projectCode: '37-5.HL', deptCode: 'KINHDOANH', weekCode: 'WEEK-2026-07-27', itemType: 'MASTER', itemId: 'CV-186', progressEnd: 60, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-07-31T16:00:00.000Z', rowNumber: 154 },
  { updateId: 'FUTURE', projectCode: '37-5.HL', deptCode: 'THIETKE', weekCode: 'WEEK-2026-08-03', itemType: 'MASTER', itemId: 'CV-186', progressEnd: 20, taskStatus: 'Đang làm', approvalStatus: '', updatedAt: '2026-08-03T01:00:00.000Z', rowNumber: 155 }
];

const progressByKey = context.qltdDeptPlanBuildWeeklyProgressStateMap_(
  '37-5.HL',
  updates,
  'WEEK-2026-07-27'
);
const deptPlan = {
  deptCode: 'Thietke',
  deptCodeRaw: 'Thietke',
  masters: [
    { masterCode: 'CV-186', taskName: 'Hoàn thành phê duyệt đ/c TKBVTC', planFinish: '2026-07-15', progress: 95, status: 'Đang làm' },
    { masterCode: 'CV-PENDING', taskName: 'Pending completion', planFinish: '2026-07-15', progress: 95, status: 'Đang làm' },
    { masterCode: 'CV-REJECTED', taskName: 'Rejected completion', planFinish: '2026-07-15', progress: 70, status: 'Đang làm' },
    { masterCode: 'NO-WEEKLY', taskName: 'No weekly fallback', planFinish: '2026-07-15', progress: 42, status: 'Tạm dừng' },
    { masterCode: 'SAME-A', taskName: 'Trùng tên', planFinish: '2026-07-15', progress: 0, status: '' },
    { masterCode: 'SAME-B', taskName: 'Trùng tên', planFinish: '2026-07-15', progress: 0, status: '' }
  ]
};
context.qltdDeptPlanApplyWeeklyProgressStates_(deptPlan, '37-5.HL', progressByKey);

assert.equal(deptPlan.masters[0].progress, 100);
assert.equal(deptPlan.masters[0].status, 'Hoàn thành');
assert.equal(deptPlan.masters[0].sourceProgress, 95);
assert.equal(deptPlan.masters[0].effectiveApprovalStatus, 'APPROVED');
assert.equal(deptPlan.masters[0].effectiveUpdateId, 'CV186-W31-APPROVED');
assert.equal(context.qltdDeptPlanIsOverdue(deptPlan.masters[0], '2026-08-01'), false);

assert.equal(deptPlan.masters[1].progress, 95);
assert.equal(deptPlan.masters[1].status, 'Đang làm');
assert.equal(deptPlan.masters[1].effectiveUpdateId, 'PENDING-BASE');
assert.equal(context.qltdDeptPlanIsOverdue(deptPlan.masters[1], '2026-08-01'), true);

assert.equal(deptPlan.masters[2].progress, 70);
assert.equal(deptPlan.masters[2].effectiveUpdateId, 'REJECTED-BASE');
assert.equal(deptPlan.masters[3].progress, 42);
assert.equal(deptPlan.masters[3].status, 'Tạm dừng');
assert.equal(deptPlan.masters[3].effectiveProgressSource, undefined);
assert.equal(deptPlan.masters[4].progress, 30);
assert.equal(deptPlan.masters[5].progress, 40);
assert.equal(context.qltdDeptPlanCurrentWeekCode_(new Date('2026-08-01T03:00:00.000Z')), 'WEEK-2026-07-27');

console.log('Department plan effective weekly progress: PASS');
