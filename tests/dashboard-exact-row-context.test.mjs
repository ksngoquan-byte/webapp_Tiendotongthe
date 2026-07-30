import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../apps-script-dev-api/35_GANTT_DATA_SERVICE.js', import.meta.url),
  'utf8'
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

const context = vm.createContext({
  Date,
  QLTD_DASHBOARD_CACHE_TTL_SECONDS: 60,
  qltdProjectsNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdGanttCacheGet_: () => null,
  qltdGanttBuildDataForProject_: () => ({
    success: true,
    projectCode: '37-5.HL',
    data: [{
      id: 'UID-1',
      text: 'Hoàn thành phần móng',
      taskName: 'Hoàn thành phần móng',
      congViecZone: '',
      congViecHangMuc: '',
      ownZone: '',
      ownHangMuc: '',
      contextZone: 'Zone 1',
      contextHangMuc: 'LK02',
      zone: 'Zone 1',
      hangMuc: 'LK02'
    }],
    links: [],
    performance: {}
  }),
  qltdGanttCachePut_: () => ({ stored: true })
});
vm.runInContext(extractFunction('qltdDashboardCacheAccessContext_'), context);
vm.runInContext(extractFunction('qltdDashboardProjectTasks_'), context);
vm.runInContext(extractFunction('qltdDashboardGetSummaryForProject_'), context);

const result = context.qltdDashboardGetSummaryForProject_('37-5.HL');
assert.equal(result.data[0].taskName, 'Hoàn thành phần móng');
assert.equal(result.data[0].ownZone, '');
assert.equal(result.data[0].ownHangMuc, '');
assert.equal(result.data[0].congViecHangMuc, '');
assert.equal(result.data[0].contextZone, 'Zone 1');
assert.equal(result.data[0].contextHangMuc, 'LK02');

console.log('Dashboard exact-row context DTO: PASS');
