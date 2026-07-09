import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  buildRegistrationDepartments,
  buildRegistrationPositions,
  getRegistrationErrorMessage
} from './registration-gate.js';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const gateSource = fs.readFileSync(new URL('./registration-gate.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const usersSource = fs.readFileSync(new URL('../apps-script-dev-api/29_USERS_SERVICE.js', import.meta.url), 'utf8');
const projectsSource = fs.readFileSync(new URL('../apps-script-dev-api/31_PROJECTS_SERVICE.js', import.meta.url), 'utf8');
const scopeSource = fs.readFileSync(new URL('../apps-script-dev-api/37_SELF_REGISTRATION_SCOPE.js', import.meta.url), 'utf8');
const firebaseConfig = JSON.parse(fs.readFileSync(new URL('./firebase.json', import.meta.url), 'utf8'));

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
      // Continue until the parser sees a complete declaration.
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const activeProjects = [
  { projectCode: '37-5.HL1', status: 'ACTIVE' },
  { projectCode: '24-1.ĐB', status: 'ACTIVE' }
];
const users = new Map();
const projectContext = vm.createContext({
  qltdUsersNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdUsersGetByEmail_: (email) => users.get(email) || null,
  qltdUsersIsValidRole_: (role) => ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'].includes(role),
  qltdProjectsListActive_: () => activeProjects.slice()
});
vm.runInContext(extractFunction(projectsSource, 'qltdProjectsListForUser_'), projectContext);

for (const role of ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER']) {
  const email = `${role.toLowerCase()}@example.com`;
  users.set(email, { email, role, status: 'ACTIVE', deptCode: 'NO_MAPPING' });
  assert.deepEqual(
    Array.from(projectContext.qltdProjectsListForUser_(email), (project) => project.projectCode),
    ['37-5.HL1', '24-1.ĐB'],
    `${role} must see every ACTIVE project`
  );
}
users.set('inactive@example.com', { role: 'VIEWER', status: 'INACTIVE' });
users.set('invalid@example.com', { role: 'OWNER', status: 'ACTIVE' });
assert.equal(projectContext.qltdProjectsListForUser_('missing@example.com').length, 0);
assert.equal(projectContext.qltdProjectsListForUser_('inactive@example.com').length, 0);
assert.equal(projectContext.qltdProjectsListForUser_('invalid@example.com').length, 0);
assert.doesNotMatch(extractFunction(projectsSource, 'qltdProjectsListForUser_'), /ProjectDepts|AllowedProjectCodes/);

assert.match(apiSource, /if \(action === 'listprojects'\) \{\s*return qltdDevApiListProjects_\(params\)/);
assert.match(extractFunction(apiSource, 'qltdDevApiListProjects_'), /qltdFirebaseResolveIdentity_\(params, true\)/);
assert.match(extractFunction(apiSource, 'qltdDevApiListProjects_'), /USER_INACTIVE/);
assert.match(extractFunction(apiSource, 'qltdDevApiListProjects_'), /INVALID_ROLE/);

assert.match(usersSource, /BAN_LANH_DAO:\s*'PMO'/);
assert.match(usersSource, /DEPT_MANAGER:\s*'EDITOR'/);
assert.match(usersSource, /EMPLOYEE:\s*'REPORTER'/);
assert.doesNotMatch(extractFunction(usersSource, 'qltdUsersRegister_'), /payload\s*&&\s*payload\.role/);
assert.match(extractFunction(usersSource, 'qltdUsersRegister_'), /LockService\.getScriptLock/);
assert.match(extractFunction(usersSource, 'qltdUsersRegister_'), /if \(existing\)/);

assert.match(scopeSource, /function qltdFirebaseResolveIdentity_/);
assert.match(scopeSource, /function qltdDeptScopeAuthorizeWrite_/);
assert.match(apiSource, /qltdDeptScopeAuthorizeWrite_\(payload, action\)/);
assert.match(extractFunction(apiSource, 'qltdDevApiHandlePost_'), /action === 'profile'[\s\S]*action === 'bootstrap'[\s\S]*action === 'user_lookupemployees'/);
assert.match(extractFunction(apiSource, 'qltdDevApiProfile_'), /empCode:\s*user\.empCode \|\| ''/);
assert.doesNotMatch(apiSource, /user_getregistrationoptions/);
assert.match(apiSource, /weekly_masterapprovals_get:\s*true/);
assert.match(apiSource, /weekly_pbdetailapprovals_get:\s*true/);
assert.match(apiSource, /notifications_list:\s*true/);
assert.match(scopeSource, /weekly_pbdetailapproval_review:\s*\['EDITOR'\]/);

let identityResponse = { statusCode: 200, payload: { users: [{ email: 'admin@example.com', displayName: 'Admin', localId: 'UID-1', emailVerified: true }] } };
const identityContext = vm.createContext({
  qltdUsersNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdUsersBuildAuthError_: (code, message, extra = {}) => ({ success: false, message: code, errorMessage: message, ...extra }),
  qltdFirebaseGetWebApiKey_: () => 'test-api-key',
  UrlFetchApp: {
    fetch: () => ({
      getResponseCode: () => identityResponse.statusCode,
      getContentText: () => JSON.stringify(identityResponse.payload)
    })
  }
});
vm.runInContext(extractFunction(scopeSource, 'qltdFirebaseResolveIdentity_'), identityContext);
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com' }, true).message, 'ID_TOKEN_REQUIRED');
identityResponse = { statusCode: 400, payload: { error: { message: 'INVALID_ID_TOKEN' } } };
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com', idToken: 'invalid' }, true).message, 'ID_TOKEN_INVALID');
identityResponse = { statusCode: 200, payload: { users: [{ email: 'admin@example.com', displayName: 'Admin', localId: '', emailVerified: true }] } };
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com', idToken: 'valid' }, true).message, 'ID_TOKEN_INVALID');
identityResponse = { statusCode: 200, payload: { users: [{ email: 'admin@example.com', displayName: 'Admin', localId: 'UID-1', emailVerified: false }] } };
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com', idToken: 'valid' }, true).message, 'EMAIL_NOT_VERIFIED');
identityResponse = { statusCode: 200, payload: { users: [{ email: 'admin@example.com', displayName: 'Admin', localId: 'UID-1', emailVerified: true }] } };
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'other@example.com', idToken: 'valid' }, true).message, 'EMAIL_MISMATCH');
const verifiedIdentity = identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com', idToken: 'valid' }, true);
assert.equal(verifiedIdentity.success, true);
assert.equal(verifiedIdentity.email, 'admin@example.com');
assert.equal(verifiedIdentity.localId, 'UID-1');

let routeIdentity = { success: false, message: 'ID_TOKEN_REQUIRED' };
let approvalParams = null;
let pbApprovalParams = null;
let notificationParams = null;
const approvalRouteContext = vm.createContext({
  qltdFirebaseResolveIdentity_: () => routeIdentity,
  qltdDevApiJson_: (payload) => payload,
  qltdWeeklyMasterApprovalsGet_: (params) => { approvalParams = { ...params }; return { success: true }; },
  qltdWeeklyPbDetailApprovalsGet_: (params) => { pbApprovalParams = { ...params }; return { success: true }; },
  qltdNotificationsList_: (params) => { notificationParams = { ...params }; return { success: true }; }
});
const readActionDeclaration = apiSource.slice(apiSource.indexOf('const QLTD_DEV_DEPT_READ_ACTIONS'), apiSource.indexOf('function qltdDevApiHandleGet'));
vm.runInContext(`${readActionDeclaration}\n${extractFunction(apiSource, 'qltdDevApiHandleGet')}`, approvalRouteContext);
assert.equal(
  approvalRouteContext.qltdDevApiHandleGet({ parameter: { action: 'weekly_masterapprovals_get', email: 'admin@example.com' } }).message,
  'ID_TOKEN_REQUIRED'
);
routeIdentity = { success: true, email: 'pmo@example.com' };
approvalRouteContext.qltdDevApiHandleGet({
  parameter: { action: 'weekly_masterapprovals_get', email: 'spoofed@example.com', idToken: 'valid', projectCode: 'P1', deptCode: 'D1', status: 'PENDING' }
});
assert.equal(approvalParams.email, 'pmo@example.com');
assert.equal(approvalParams.projectCode, 'P1');
assert.equal(approvalParams.deptCode, 'D1');
assert.equal(approvalParams.status, 'PENDING');
approvalRouteContext.qltdDevApiHandleGet({
  parameter: { action: 'weekly_pbdetailapprovals_get', email: 'spoofed@example.com', idToken: 'valid', projectCode: 'P1', status: 'PENDING' }
});
assert.equal(pbApprovalParams.email, 'pmo@example.com');
assert.equal(pbApprovalParams.projectCode, 'P1');
assert.equal(pbApprovalParams.status, 'PENDING');
approvalRouteContext.qltdDevApiHandleGet({
  parameter: { action: 'notifications_list', email: 'spoofed@example.com', idToken: 'valid', limit: '25' }
});
assert.equal(notificationParams.email, 'pmo@example.com');
assert.equal(notificationParams.limit, '25');

let markReadPayload = null;
let markReadIdentity = { success: true, email: 'viewer@example.com' };
const markReadRouteContext = vm.createContext({
  qltdBudgetParsePostJson_: (event) => ({ payload: { ...event.payload } }),
  qltdFirebaseResolveIdentity_: () => markReadIdentity,
  qltdDevApiJson_: (payload) => payload,
  qltdNotificationsMarkRead_: (payload) => { markReadPayload = { ...payload }; return { success: true }; },
  qltdDeptScopeAuthorizeWrite_: () => { throw new Error('notification mark-read must not require project/dept scope'); }
});
vm.runInContext(extractFunction(apiSource, 'qltdDevApiHandlePost_'), markReadRouteContext);
const markReadResult = markReadRouteContext.qltdDevApiHandlePost_({ payload: {
  action: 'notifications_markread', email: 'spoofed@example.com', idToken: 'valid', notificationId: 'NTF-1'
} });
assert.equal(markReadResult.success, true);
assert.equal(markReadPayload.email, 'viewer@example.com');
assert.equal(markReadPayload.notificationId, 'NTF-1');
markReadIdentity = { success: false, message: 'ID_TOKEN_INVALID' };
assert.equal(markReadRouteContext.qltdDevApiHandlePost_({ payload: {
  action: 'notifications_markread', email: 'spoofed@example.com', idToken: 'invalid', notificationId: 'NTF-1'
} }).message, 'ID_TOKEN_INVALID');

assert.doesNotMatch(indexSource, /id="registrationView"/);
assert.equal((indexSource.match(/src="\/assets\/entiz-logo\.png"/g) || []).length, 2);
assert.match(indexSource, /<link rel="preload" as="image" href="\/assets\/entiz-logo\.png" fetchpriority="high">/);
assert.match(indexSource, /class="entiz-logo"[^>]*width="607"[^>]*height="317"[^>]*loading="eager"[^>]*fetchpriority="high"[^>]*decoding="async"/);
assert.doesNotMatch(indexSource, /entiz-logo\.svg|\.\/entiz-logo\.png/);
assert.deepEqual(firebaseConfig.hosting.headers, [{
  source: '/assets/**',
  headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }]
}]);
assert.match(gateSource, /export function createRegistrationGate/);
assert.match(gateSource, /qltdRegistrationName/);
assert.match(gateSource, /qltdRegistrationDept/);
assert.match(gateSource, /qltdRegistrationPosition/);
assert.doesNotMatch(gateSource, /userGroup|roleGroup|deptCode:\s*requiresDepartment/);
assert.match(appSource, /createRegistrationGate\(\{/);
assert.match(appSource, /user_lookupemployees/);
assert.match(appSource, /postBackendJson\(\{ action: 'user_register', empCode \}\)/);
assert.match(appSource, /onRegistered:\s*resumeAuthenticatedAppAfterRegistration/);
assert.doesNotMatch(appSource, /user_getregistrationoptions|GUEST_VIEWER/);
assert.match(appSource, /code === 'USER_NOT_FOUND' \|\| profile\.requiresRegistration === true/);
assert.match(appSource, /registrationGate\?\.show\(user\)/);
assert.match(extractFunction(appSource, 'fetchBackendJson'), /requestBackendJson/);
assert.match(extractFunction(appSource, 'postBackendJson'), /requestBackendJson/);
assert.match(extractFunction(appSource, 'requestBackendJson'), /const includeAuth = options\.auth !== false && action !== 'health'/);
assert.match(extractFunction(appSource, 'requestBackendJson'), /getIdToken\(forceRefresh\)/);
assert.match(extractFunction(appSource, 'requestBackendJson'), /ID_TOKEN_INVALID/);
assert.match(extractFunction(appSource, 'loadProjectsForSelector'), /fetchBackendJson\('listProjects',[\s\S]*\{ auth: true \}/);
assert.match(extractFunction(appSource, 'renderApp'), /showWeb07View\('dashboard'\)/);
assert.match(extractFunction(appSource, 'renderApp'), /loadProjectsForSelector\(\)/);

const postRegistrationTrace = [];
const registeredUser = {
  getIdToken: async (forceRefresh) => {
    postRegistrationTrace.push(`token:${forceRefresh}`);
    return 'fresh-token';
  }
};
const postRegistrationContext = vm.createContext({
  auth: { currentUser: registeredUser },
  registrationGate: { hide: () => postRegistrationTrace.push('hide') },
  bootstrapAuthenticatedUser: async (user) => {
    assert.equal(user, registeredUser);
    postRegistrationTrace.push('bootstrap');
  }
});
vm.runInContext(extractFunction(appSource, 'resumeAuthenticatedAppAfterRegistration'), postRegistrationContext);
await postRegistrationContext.resumeAuthenticatedAppAfterRegistration();
assert.deepEqual(postRegistrationTrace, ['token:true', 'hide', 'bootstrap']);

const authFlowTrace = [];
let nextProfile = { success: true, status: 'ACTIVE', role: 'PMO', email: 'existing@example.com' };
const authFlowContext = vm.createContext({
  authBootstrapRequestSeq: 0,
  lastAuthenticatedUser: null,
  els: { loginView: {} },
  showOnly: () => {},
  setStatus: () => {},
  fetchBackendProfile: async () => nextProfile,
  getProfileErrorCode: (profile) => String(profile?.errorCode || profile?.message || '').toUpperCase(),
  registrationGate: { show: () => authFlowTrace.push('registration-gate') },
  renderDenied: () => authFlowTrace.push('denied'),
  renderApiError: () => authFlowTrace.push('api-error'),
  isValidAppProfile: (profile) => profile?.success === true && profile?.status === 'ACTIVE',
  renderApp: () => authFlowTrace.push('app')
});
vm.runInContext(extractFunction(appSource, 'bootstrapAuthenticatedUser'), authFlowContext);
const existingUser = { email: 'existing@example.com' };
await authFlowContext.bootstrapAuthenticatedUser(existingUser);
assert.deepEqual(authFlowTrace, ['app'], 'existing user must enter the shared app bootstrap');

nextProfile = { success: false, errorCode: 'USER_NOT_FOUND', requiresRegistration: true };
await authFlowContext.bootstrapAuthenticatedUser({ email: 'new@example.com' });
assert.deepEqual(authFlowTrace, ['app', 'registration-gate'], 'new user must stop at Registration Gate before registration');

nextProfile = { success: true, status: 'ACTIVE', role: 'PMO', email: 'new@example.com' };
await authFlowContext.bootstrapAuthenticatedUser({ email: 'new@example.com' });
assert.deepEqual(authFlowTrace, ['app', 'registration-gate', 'app'], 'a reload after registration must enter the app without reopening the Gate');

const employeeProfiles = [
  { empCode: 'E1', deptCode: 'BLD', deptName: 'Ban lãnh đạo', position: 'Thành viên' },
  { empCode: 'E2', deptCode: 'KINHDOANH', deptName: 'Kinh doanh', position: 'Trưởng phòng' },
  { empCode: 'E3', deptCode: 'KINHDOANH', deptName: 'Kinh doanh', position: 'Chuyên viên' }
];
assert.deepEqual(buildRegistrationDepartments(employeeProfiles), [
  { deptCode: 'BLD', deptName: 'Ban lãnh đạo' },
  { deptCode: 'KINHDOANH', deptName: 'Kinh doanh' }
]);
assert.deepEqual(buildRegistrationPositions(employeeProfiles, 'KINHDOANH'), [
  { empCode: 'E2', label: 'Trưởng phòng' },
  { empCode: 'E3', label: 'Chuyên viên' }
]);
assert.match(getRegistrationErrorMessage({ errorCode: 'EMPLOYEE_ALREADY_LINKED' }), /Google khác/i);

const profileContext = vm.createContext({
  normalizeRoleKey: (role) => String(role || '').trim().toUpperCase()
});
vm.runInContext(extractFunction(appSource, 'isValidAppProfile'), profileContext);
for (const role of ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER']) {
  assert.equal(profileContext.isValidAppProfile({ success: true, status: 'ACTIVE', role }), true);
}
assert.equal(profileContext.isValidAppProfile({ success: true, status: 'INACTIVE', role: 'VIEWER' }), false);
assert.equal(profileContext.isValidAppProfile({ success: true, status: 'ACTIVE', role: 'OWNER' }), false);
assert.equal(profileContext.isValidAppProfile({ success: false, status: 'ACTIVE', role: 'VIEWER' }), false);

console.log('Auth, registration and project visibility tests: PASS');
