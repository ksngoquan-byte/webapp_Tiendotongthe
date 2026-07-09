import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pbSource = fs.readFileSync(new URL('./pb-detail-ui.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const signatures = [`async function ${name}`, `function ${name}`];
  const start = signatures.map((signature) => source.indexOf(signature)).find((index) => index >= 0);
  assert.ok(start >= 0, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the declaration is complete.
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const transportStart = appSource.indexOf('class QltdApiTransportError');
const transportEnd = appSource.indexOf('window.__QLTD_API = Object.freeze', transportStart);
assert.ok(transportStart >= 0 && transportEnd > transportStart, 'Shared API transport must be declared');
const transportSource = appSource.slice(transportStart, transportEnd);

assert.equal((appSource.match(/https:\/\/script\.google\.com\/macros\/s\//g) || []).length, 1);
assert.doesNotMatch(pbSource, /QLTD_PB_DETAIL_API_URL|script\.google\.com\/macros\/s|__qltdGetAuthContext|fetch\s*\(/);
assert.match(pbSource, /window\.__QLTD_API/);
assert.match(indexSource, /app\.js\?v=HANGMUC_DISPLAY_DASHBOARD_V5&amp;pb=PB_DETAIL_SHARED_API_V6/);
assert.match(indexSource, /pb-detail-ui\.js\?v=PB_DETAIL_SHARED_API_V6/);

let fetchCalls = [];
let tokenCalls = [];
let nextResponse = new Response(JSON.stringify({ success: true, data: {} }), {
  status: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
});
const apiContext = vm.createContext({
  URL,
  JSON,
  Object,
  String,
  Array,
  Error,
  console: { error: () => {} },
  performance: { now: () => 1 },
  APPS_SCRIPT_DEV_URL: 'https://api.example.test/exec',
  auth: {
    currentUser: {
      email: 'editor@example.com',
      getIdToken: async (forceRefresh) => {
        tokenCalls.push(forceRefresh);
        return forceRefresh ? 'fresh-token' : 'valid-token';
      }
    }
  },
  fetch: async (url, options) => {
    fetchCalls.push({ url, options });
    return nextResponse;
  },
  qltdDevPerfEnabled: () => false,
  qltdLogBackendPerformance: () => {}
});
vm.runInContext(transportSource, apiContext);

await apiContext.requestBackendJson('work_getdetailtasks', {
  projectCode: '37-5.HL',
  deptCode: 'THIETKE',
  masterTaskCode: 'VI.1'
}, { method: 'GET', auth: true });
assert.equal(fetchCalls[0].options.method, 'GET');
assert.equal(new URL(fetchCalls[0].url).origin, 'https://api.example.test');
assert.equal(new URL(fetchCalls[0].url).searchParams.get('idToken'), 'valid-token');

fetchCalls = [];
tokenCalls = [];
nextResponse = new Response(JSON.stringify({ success: true, data: {} }), {
  status: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
});
await apiContext.requestBackendJson('work_createdetailtask', {
  projectCode: '37-5.HL',
  deptCode: 'THIETKE',
  masterTaskCode: 'VI.1',
  idToken: 'caller-token-must-not-pass'
}, { method: 'POST', auth: true });
const postCall = fetchCalls[0];
const postBody = JSON.parse(postCall.options.body);
assert.equal(postCall.url, 'https://api.example.test/exec');
assert.equal(postCall.options.method, 'POST');
assert.equal(postCall.options.redirect, 'follow');
assert.equal(postCall.options.headers['Content-Type'], 'text/plain;charset=utf-8');
assert.deepEqual(tokenCalls, [false]);
assert.equal(postBody.action, 'work_createdetailtask');
assert.equal(postBody.projectCode, '37-5.HL');
assert.equal(postBody.deptCode, 'THIETKE');
assert.equal(postBody.masterTaskCode, 'VI.1');
assert.equal(postBody.idToken, 'valid-token');
assert.equal((postCall.options.body.match(/"idToken"/g) || []).length, 1);

nextResponse = new Response('<!doctype html><title>Not found</title>', {
  status: 404,
  headers: { 'Content-Type': 'text/html; charset=utf-8' }
});
Object.defineProperty(nextResponse, 'redirected', { value: true });
await assert.rejects(
  apiContext.requestBackendJson('work_createdetailtask', {}, { method: 'POST', auth: false }),
  (error) => error.kind === 'deployment' && error.status === 404 && /HTML|trang HTML/.test(error.message)
);

nextResponse = new Response(JSON.stringify({
  success: false,
  errors: [{ code: 'ACCESS_DENIED', message: 'Không có quyền tạo việc chi tiết.' }]
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});
const deniedPayload = await apiContext.requestBackendJson('work_createdetailtask', {}, { method: 'POST', auth: false });
assert.equal(deniedPayload.success, false);
assert.equal(deniedPayload.errors[0].message, 'Không có quyền tạo việc chi tiết.');

const pbCalls = [];
const pbContext = vm.createContext({
  window: {
    __QLTD_API: {
      get: async (action, params, options) => {
        pbCalls.push({ method: 'GET', action, params, options });
        return { success: true, data: { detailTasks: [] } };
      },
      post: async (action, params, options) => {
        pbCalls.push({ method: 'POST', action, params, options });
        return { success: true, data: { detailTaskId: 'DT-1' } };
      }
    }
  },
  String,
  Error
});
vm.runInContext([
  extractFunction(pbSource, 'qltdPbDetailGetApiClient'),
  extractFunction(pbSource, 'qltdPbDetailFetchGet'),
  extractFunction(pbSource, 'qltdPbDetailFetchAssignees'),
  extractFunction(pbSource, 'qltdPbDetailFetchPost')
].join('\n'), pbContext);

const pbRequestContext = {
  email: 'editor@example.com',
  projectCode: '37-5.HL',
  deptCode: 'THIETKE',
  masterTaskCode: 'VI.1'
};
await pbContext.qltdPbDetailFetchGet(pbRequestContext);
await pbContext.qltdPbDetailFetchAssignees(pbRequestContext);
await pbContext.qltdPbDetailFetchPost({
  action: 'work_createdetailtask',
  projectCode: '37-5.HL',
  deptCode: 'THIETKE',
  masterTaskCode: 'VI.1'
});
await pbContext.qltdPbDetailFetchPost({
  action: 'work_updatedetailtask',
  projectCode: '37-5.HL',
  deptCode: 'THIETKE',
  detailTaskId: 'DT-1'
});
assert.deepEqual(pbCalls.map((call) => [call.method, call.action]), [
  ['GET', 'work_getdetailtasks'],
  ['GET', 'work_listassignees'],
  ['POST', 'work_createdetailtask'],
  ['POST', 'work_updatedetailtask']
]);
assert.equal(pbCalls[2].params.masterTaskCode, 'VI.1');
assert.equal(pbCalls[2].options.auth, true);

let resolveSave;
let savePostCount = 0;
const saveContext = vm.createContext({
  qltdPbDetailState: {
    formMode: 'create',
    editingId: '',
    saving: false,
    loading: false,
    message: '',
    messageType: '',
    masterTask: {},
    detailTasks: []
  },
  qltdPbDetailGetContext: () => ({
    canWrite: true,
    projectCode: '37-5.HL',
    deptCode: 'THIETKE',
    masterTaskCode: 'VI.1'
  }),
  qltdPbDetailCaptureFormDraft: () => {},
  qltdPbDetailReadFormPayload: () => ({
    projectCode: '37-5.HL',
    deptCode: 'THIETKE'
  }),
  qltdPbDetailFetchPost: () => {
    savePostCount += 1;
    return new Promise((resolve) => { resolveSave = resolve; });
  },
  qltdPbDetailExtractError: (payload) => payload.message,
  qltdPbDetailRender: () => {},
  qltdPbDetailLoad: async () => {},
  document: { dispatchEvent: () => {} },
  CustomEvent: class {},
  Error,
  String
});
vm.runInContext(extractFunction(pbSource, 'qltdPbDetailSave'), saveContext);
const firstSave = saveContext.qltdPbDetailSave();
const secondSave = saveContext.qltdPbDetailSave();
assert.equal(savePostCount, 1, 'Double-click must send only one POST');
assert.equal(saveContext.qltdPbDetailState.saving, true);
resolveSave({ success: true, data: { detailTaskId: 'DT-1' } });
await Promise.all([firstSave, secondSave]);
assert.equal(saveContext.qltdPbDetailState.saving, false);

console.log('PB_DETAIL shared API transport tests: PASS');
