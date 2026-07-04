import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Không tìm thấy hàm ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the complete function declaration is found.
    }
  }
  throw new Error(`Hàm ${name} chưa đóng`);
}

const helperContext = {
  QLTD_NOTIFICATION_TYPE_LABELS: {
    PB_DETAIL_PENDING: 'Cập nhật công việc chờ duyệt',
    MASTER_COMPLETION_PENDING: 'Hoàn thành mục tiêu chờ duyệt',
    UPDATE_APPROVED: 'Cập nhật đã được duyệt',
    UPDATE_REJECTED: 'Cập nhật bị trả lại'
  }
};
vm.createContext(helperContext);
vm.runInContext([
  extractFunction(app, 'formatNotificationBadgeCount'),
  extractFunction(app, 'formatNotificationType'),
  extractFunction(app, 'getNotificationTypeTone'),
  extractFunction(app, 'getNotificationTypeIcon'),
  extractFunction(app, 'normalizeNotificationItem'),
  extractFunction(app, 'sortNotificationsNewest'),
  extractFunction(app, 'isNotificationActionType'),
  extractFunction(app, 'getNotificationWeekId'),
  extractFunction(app, 'getNotificationDeepLinkKind'),
  extractFunction(app, 'notificationMatchesApprovalItem')
].join('\n'), helperContext);

assert.equal(helperContext.formatNotificationBadgeCount(0), '0');
assert.equal(helperContext.formatNotificationBadgeCount(12), '12');
assert.equal(helperContext.formatNotificationBadgeCount(100), '99+');
assert.equal(helperContext.formatNotificationType('PB_DETAIL_PENDING'), 'Cập nhật công việc chờ duyệt');
assert.equal(helperContext.formatNotificationType('MASTER_COMPLETION_PENDING'), 'Hoàn thành mục tiêu chờ duyệt');
assert.equal(helperContext.formatNotificationType('UPDATE_APPROVED'), 'Cập nhật đã được duyệt');
assert.equal(helperContext.formatNotificationType('UPDATE_REJECTED'), 'Cập nhật bị trả lại');
assert.doesNotMatch(helperContext.formatNotificationType('UNKNOWN'), /UNKNOWN/);
assert.equal(helperContext.getNotificationTypeTone('PB_DETAIL_PENDING'), 'pending');
assert.equal(helperContext.getNotificationTypeTone('MASTER_COMPLETION_PENDING'), 'master');
assert.equal(helperContext.getNotificationTypeTone('UPDATE_APPROVED'), 'approved');
assert.equal(helperContext.getNotificationTypeTone('UPDATE_REJECTED'), 'rejected');
assert.match(helperContext.getNotificationTypeIcon('UPDATE_APPROVED'), /<svg/);
assert.equal(helperContext.isNotificationActionType('PB_DETAIL_PENDING'), true);
assert.equal(helperContext.isNotificationActionType('UPDATE_APPROVED'), false);
assert.equal(helperContext.getNotificationWeekId({ weekStart: '2026-06-22T00:00:00.000Z' }), 'WEEK-2026-06-22');
assert.equal(helperContext.getNotificationWeekId({ weekStart: 'bad' }), '');
assert.deepEqual(
  Array.from(helperContext.sortNotificationsNewest([
    { notificationId: 'old', createdAt: '2026-06-20T00:00:00Z' },
    { notificationId: 'new', createdAt: '2026-06-29T00:00:00Z' }
  ]), (item) => item.notificationId),
  ['new', 'old']
);
assert.equal(helperContext.getNotificationDeepLinkKind('PB_DETAIL_PENDING'), 'PB_APPROVAL');
assert.equal(helperContext.getNotificationDeepLinkKind('MASTER_COMPLETION_PENDING'), 'MASTER_APPROVAL');
assert.equal(helperContext.getNotificationDeepLinkKind('UPDATE_APPROVED'), 'WEEKLY_APPROVED');
assert.equal(helperContext.getNotificationDeepLinkKind('UPDATE_REJECTED'), 'WEEKLY_REJECTED');
assert.equal(helperContext.notificationMatchesApprovalItem({ sourceRequestId: 'REQ-1' }, { updateId: 'REQ-1' }), true);
assert.equal(helperContext.notificationMatchesApprovalItem({ entityId: 'REQ-2' }, { updateId: 'REQ-2' }), true);
assert.equal(helperContext.notificationMatchesApprovalItem({ itemKey: 'ITEM-1' }, { itemId: 'ITEM-1' }), true);

assert.match(html, /id="notificationBellButton"/);
assert.match(html, /id="notificationBadge" class="notification-badge hidden"/);
assert.match(html, /Bạn có 0 thông báo chưa đọc/);
assert.match(html, /class="notification-bell-icon"[^>]*viewBox/);
assert.doesNotMatch(html, /🔔/);
assert.match(html, /aria-controls="notificationPanel"/);
assert.match(html, /id="notificationUnreadSummary">0/);
assert.match(html, /id="notificationActionSummary">0/);
assert.match(html, /<small>Chưa đọc<\/small>/);
assert.match(html, /<small>Cần xử lý<\/small>/);
assert.match(html, /id="notificationReloadButton"/);
assert.match(html, /Theo dõi yêu cầu cần xử lý và các cập nhật mới\./);
assert.match(html, /id="notificationCloseButton"[\s\S]*?<svg/);
assert.match(html, /id="notificationReloadButton"[\s\S]*?<svg/);
assert.match(styles, /\.notification-item\.is-unread/);
assert.match(styles, /\.is-notification-target/);
assert.match(styles, /\.notification-panel\.is-open/);
assert.match(styles, /\.notification-backdrop\.is-open/);
assert.match(styles, /@media \(max-width: 560px\)/);
assert.match(styles, /\.notification-bell-button:focus-visible/);

const renderSource = extractFunction(app, 'renderNotificationCenter');
assert.match(renderSource, /unreadCount === 0/);
assert.match(renderSource, /formatNotificationBadgeCount\(unreadCount\)/);
assert.match(renderSource, /classList\.toggle\('hidden', unreadCount === 0\)/);
assert.match(renderSource, /Bạn có \$\{unreadCount\} thông báo chưa đọc/);
assert.match(renderSource, /reloadLabel\.textContent = state\.loading \? 'Đang tải\.\.\.' : 'Tải lại'/);
assert.match(renderSource, /Đang tải thông báo\.\.\./);
assert.match(renderSource, /Bạn chưa có thông báo/);
assert.match(renderSource, /Các yêu cầu phê duyệt và cập nhật mới sẽ hiển thị tại đây\./);
assert.match(renderSource, /Không tải được thông báo/);
assert.match(renderSource, /data-notification-retry/);
assert.match(renderSource, /Thử lại/);
assert.match(renderSource, /sortNotificationsNewest/);
assert.match(renderSource, /notification\.isRead \? 'is-read' : 'is-unread'/);
assert.match(renderSource, /notification\.status === 'RESOLVED'/);
assert.match(renderSource, /\[notification\.projectCode, notification\.departmentCode\]\.filter\(Boolean\)\.join\(' · '\)/);
assert.match(renderSource, /notification-type-pill/);
assert.match(renderSource, /notification-unread-dot/);
assert.match(renderSource, /notification-item-arrow/);
assert.match(styles, /\.notification-item\.is-pending/);
assert.match(styles, /\.notification-item\.is-master/);
assert.match(styles, /\.notification-item\.is-approved/);
assert.match(styles, /\.notification-item\.is-rejected/);

const panelSource = extractFunction(app, 'setNotificationPanelOpen');
assert.match(panelSource, /notificationCloseButton\.focus/);
assert.match(panelSource, /if \(open\) loadNotifications\(\)/);
assert.match(app, /notificationBackdrop\) els\.notificationBackdrop\.addEventListener\('click', \(\) => setNotificationPanelOpen\(false\)\)/);
assert.match(app, /event\.key === 'Escape' && qltdNotificationState\.open/);

const clearSource = extractFunction(app, 'clearNotificationState');
assert.match(clearSource, /unreadCount: 0/);
assert.match(clearSource, /actionRequiredCount: 0/);
assert.match(clearSource, /open: false/);
const signedOutSource = extractFunction(app, 'renderSignedOut');
assert.match(signedOutSource, /clearNotificationState\(\)/);

function createMarkContext(postImplementation, unreadCount = 1) {
  const context = {
    qltdNotificationState: {
      notifications: [{ notificationId: 'N-1', isRead: false }],
      unreadCount,
      warning: ''
    },
    qltdNotificationMarkingIds: new Set(),
    renderNotificationCenter: () => { context.renderCount += 1; },
    showWeeklyToast: (message) => { context.toasts.push(message); },
    postBackendJson: async (payload) => {
      context.posts.push(payload);
      return postImplementation(payload);
    },
    getBackendErrorMessage: (_result, fallback) => fallback,
    posts: [],
    toasts: [],
    renderCount: 0
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(app, 'markNotificationReadOptimistically')}\nthis.callMark = markNotificationReadOptimistically;`, context);
  return context;
}

const markSuccess = createMarkContext(async () => ({ success: true }));
assert.equal(await markSuccess.callMark('N-1'), true);
assert.equal(markSuccess.qltdNotificationState.notifications[0].isRead, true);
assert.equal(markSuccess.qltdNotificationState.unreadCount, 0);
assert.equal(await markSuccess.callMark('N-1'), false);
assert.equal(markSuccess.posts.length, 1);
assert.equal(JSON.stringify(markSuccess.posts[0]), JSON.stringify({ action: 'notifications_markread', NotificationId: 'N-1' }));

const noNegative = createMarkContext(async () => ({ success: true }), 0);
await noNegative.callMark('N-1');
assert.equal(noNegative.qltdNotificationState.unreadCount, 0);

const markFailure = createMarkContext(async () => { throw new Error('Mất mạng'); });
assert.equal(await markFailure.callMark('N-1'), false);
assert.equal(markFailure.qltdNotificationState.notifications[0].isRead, false);
assert.equal(markFailure.qltdNotificationState.unreadCount, 1);
assert.match(markFailure.qltdNotificationState.warning, /Mất mạng/);

const clickSource = extractFunction(app, 'handleNotificationClick');
assert.match(clickSource, /void markNotificationReadOptimistically/);
assert.match(clickSource, /await navigateNotificationDeepLink/);
assert.ok(clickSource.indexOf('void markNotificationReadOptimistically') < clickSource.indexOf('await navigateNotificationDeepLink'));
assert.doesNotMatch(clickSource, /location\.reload|window\.location/);

const loadSource = extractFunction(app, 'loadNotifications');
assert.match(loadSource, /notifications_list/);
assert.match(loadSource, /\{ auth: true \}/);
assert.match(loadSource, /qltdNotificationLoadPromise/);
assert.match(loadSource, /notifications: \[\]/);
const renderAppSource = extractFunction(app, 'renderApp');
assert.match(renderAppSource, /scheduleNotificationsLoad\(\)/);

const approvalDeepLink = extractFunction(app, 'navigateNotificationApproval');
assert.match(approvalDeepLink, /selectNotificationProject/);
assert.match(approvalDeepLink, /showWeb07View\('admin'\)/);
assert.match(approvalDeepLink, /qltdPbDetailApprovalView/);
assert.match(approvalDeepLink, /qltdAdminApprovalView/);
assert.match(approvalDeepLink, /RESOLVED/);
const weeklyDeepLink = extractFunction(app, 'navigateNotificationWeekly');
assert.match(weeklyDeepLink, /getNotificationWeekId/);
assert.match(weeklyDeepLink, /qltdSelectedDeptCode/);
assert.match(weeklyDeepLink, /qltdSelectedWeekId = weekId/);
assert.match(weeklyDeepLink, /showWeb07View\('report'\)/);
assert.match(weeklyDeepLink, /qltdReportSubTab = 'weekly'/);
assert.match(weeklyDeepLink, /qltdWeeklyEditingItemKey = itemKey/);
assert.match(weeklyDeepLink, /qltdWeeklyNotificationDetailItemKey = itemKey/);
assert.match(weeklyDeepLink, /canUpdateWeeklyItem/);
assert.doesNotMatch(weeklyDeepLink, /location\.reload|loadGanttDataForSelectedProject|loadBudgetDashboardForSelectedProject/);

function createApprovalNavigationContext({ role = 'EDITOR', approvals = [], status = 'OPEN' } = {}) {
  const context = {
    currentUserProfile: { role },
    normalizeRoleKey: (value) => String(value || '').toUpperCase(),
    isNotificationNavigationCurrent: () => true,
    selectNotificationProject: async () => { context.projectSelected += 1; return true; },
    qltdSelectedDeptCode: '',
    qltdNotificationHighlight: null,
    showWeb07View: async (view) => { context.views.push(view); },
    qltdPbDetailApprovalView: { approvals: role === 'EDITOR' ? approvals : [] },
    qltdAdminApprovalView: { approvals: role !== 'EDITOR' ? approvals : [] },
    notificationMatchesApprovalItem: (notification, item) => item.updateId === notification.sourceRequestId || item.itemId === notification.itemKey,
    renderAdminPanel: () => { context.renderCount += 1; },
    scrollToNotificationTarget: (...args) => { context.scrollArgs = args; },
    QLTD_NOTIFICATION_FALLBACK_MESSAGE: 'FALLBACK',
    QLTD_NOTIFICATION_RESOLVED_MESSAGE: 'RESOLVED',
    projectSelected: 0,
    views: [],
    renderCount: 0,
    scrollArgs: null,
    status
  };
  vm.createContext(context);
  vm.runInContext(`${approvalDeepLink}\nthis.navigateApproval = navigateNotificationApproval;`, context);
  return context;
}

const pbApprovalContext = createApprovalNavigationContext({ approvals: [{ updateId: 'REQ-PB', itemId: 'PB-1' }] });
const pbApprovalResult = await pbApprovalContext.navigateApproval({ projectCode: 'P1', departmentCode: 'D1', sourceRequestId: 'REQ-PB', itemKey: 'PB-1', status: 'OPEN' }, 'PB_DETAIL');
assert.equal(pbApprovalResult.success, true);
assert.equal(pbApprovalContext.qltdSelectedDeptCode, 'D1');
assert.deepEqual(Array.from(pbApprovalContext.views), ['admin']);
assert.deepEqual(Array.from(pbApprovalContext.scrollArgs), ['approval', 'REQ-PB']);

const masterApprovalContext = createApprovalNavigationContext({ role: 'ADMIN', approvals: [{ updateId: 'REQ-M', itemId: 'M-1' }] });
assert.equal((await masterApprovalContext.navigateApproval({ projectCode: 'P1', sourceRequestId: 'REQ-M', itemKey: 'M-1', status: 'OPEN' }, 'MASTER')).success, true);
const resolvedApprovalContext = createApprovalNavigationContext({ approvals: [] });
assert.equal((await resolvedApprovalContext.navigateApproval({ projectCode: 'P1', status: 'RESOLVED' }, 'PB_DETAIL')).message, 'RESOLVED');
const missingApprovalContext = createApprovalNavigationContext({ approvals: [] });
assert.equal((await missingApprovalContext.navigateApproval({ projectCode: 'P1', status: 'OPEN' }, 'PB_DETAIL')).message, 'FALLBACK');
const lostApprovalPermission = createApprovalNavigationContext({ role: 'REPORTER', approvals: [{ updateId: 'REQ-PB' }] });
assert.equal((await lostApprovalPermission.navigateApproval({ projectCode: 'P1', sourceRequestId: 'REQ-PB' }, 'PB_DETAIL')).success, false);
assert.equal(lostApprovalPermission.projectSelected, 0);

function createWeeklyNavigationContext({ canUpdate = true, includeItem = true, accessDenied = false } = {}) {
  const update = { updateId: 'REQ-W', itemId: 'DT-1', itemType: 'PB_DETAIL', approvalStatus: 'REJECTED', reviewReason: 'Bổ sung hồ sơ' };
  const item = { itemType: 'PB_DETAIL', itemId: 'DT-1', canUpdate };
  const context = {
    selectNotificationProject: async () => true,
    isNotificationNavigationCurrent: () => true,
    getNotificationWeekId: () => 'WEEK-2026-06-22',
    qltdReportSubTab: 'plan',
    qltdSelectedWeekId: '',
    qltdNotificationHighlight: null,
    showWeb07View: async (view) => {
      context.views.push(view);
      context.qltdDeptPlanPayload = { success: true, projectCode: 'P1', departments: [{ deptCode: 'D1' }] };
    },
    qltdDeptPlanPayload: null,
    qltdSelectedDeptCode: '',
    document: { getElementById: () => context.deptSelector },
    deptSelector: { value: '' },
    qltdSelectedWeeklyItemKey: '',
    qltdWeeklyEditingItemKey: '',
    qltdWeeklyNotificationDetailItemKey: '',
    renderSelectedDeptPlan: () => { context.planRenderCount += 1; },
    loadWeeklyTaskDataForCurrent: async () => {},
    qltdWeeklyTaskView: {
      updates: [update],
      items: includeItem ? [item] : [],
      capabilities: { canUpdate },
      accessDenied,
      error: ''
    },
    qltdWeeklyWorkspaceTab: 'objectives',
    canUpdateWeeklyItem: (candidate) => !!candidate?.canUpdate,
    renderWeeklyTaskRegion: () => { context.weeklyRenderCount += 1; },
    scrollToNotificationTarget: (...args) => { context.scrollArgs = args; },
    QLTD_NOTIFICATION_FALLBACK_MESSAGE: 'FALLBACK',
    views: [],
    planRenderCount: 0,
    weeklyRenderCount: 0,
    scrollArgs: null
  };
  vm.createContext(context);
  vm.runInContext(`${weeklyDeepLink}\nthis.navigateWeekly = navigateNotificationWeekly;`, context);
  return context;
}

const approvedContext = createWeeklyNavigationContext();
const approvedResult = await approvedContext.navigateWeekly({ projectCode: 'P1', departmentCode: 'D1', weekStart: '2026-06-22', sourceRequestId: 'REQ-W', itemKey: 'DT-1' }, false);
assert.equal(approvedResult.success, true);
assert.equal(approvedContext.qltdSelectedDeptCode, 'D1');
assert.equal(approvedContext.qltdSelectedWeekId, 'WEEK-2026-06-22');
assert.equal(approvedContext.qltdSelectedWeeklyItemKey, 'PB_DETAIL:DT-1');
assert.equal(approvedContext.qltdWeeklyEditingItemKey, '');
assert.equal(approvedContext.qltdWeeklyNotificationDetailItemKey, 'PB_DETAIL:DT-1');
assert.deepEqual(Array.from(approvedContext.scrollArgs), ['weekly', 'PB_DETAIL:DT-1']);

const rejectedContext = createWeeklyNavigationContext();
assert.equal((await rejectedContext.navigateWeekly({ projectCode: 'P1', departmentCode: 'D1', weekStart: '2026-06-22', sourceRequestId: 'REQ-W', itemKey: 'DT-1' }, true)).success, true);
assert.equal(rejectedContext.qltdWeeklyEditingItemKey, 'PB_DETAIL:DT-1');
assert.equal(rejectedContext.qltdWeeklyNotificationDetailItemKey, '');
const missingWeeklyContext = createWeeklyNavigationContext({ includeItem: false });
assert.equal((await missingWeeklyContext.navigateWeekly({ projectCode: 'P1', departmentCode: 'D1', weekStart: '2026-06-22', sourceRequestId: 'REQ-W', itemKey: 'DT-1' }, false)).message, 'FALLBACK');
const lostWeeklyPermission = createWeeklyNavigationContext({ canUpdate: false });
assert.equal((await lostWeeklyPermission.navigateWeekly({ projectCode: 'P1', departmentCode: 'D1', weekStart: '2026-06-22', sourceRequestId: 'REQ-W', itemKey: 'DT-1' }, true)).message, 'FALLBACK');
const deniedWeeklyContext = createWeeklyNavigationContext({ accessDenied: true });
assert.equal((await deniedWeeklyContext.navigateWeekly({ projectCode: 'P1', departmentCode: 'D1', weekStart: '2026-06-22', sourceRequestId: 'REQ-W', itemKey: 'DT-1' }, false)).message, 'FALLBACK');

const notificationCoreBlock = app.slice(app.indexOf('function formatNotificationBadgeCount'), app.indexOf('function getNavButtonByLabel'));
const notificationDeepLinkBlock = app.slice(app.indexOf('async function selectNotificationProject'), app.indexOf('async function reviewMasterApproval'));
assert.doesNotMatch(notificationCoreBlock, /setInterval|loadGanttDataForSelectedProject|loadBudgetDashboardForSelectedProject/);
assert.doesNotMatch(notificationDeepLinkBlock, /setInterval|loadGanttDataForSelectedProject|loadBudgetDashboardForSelectedProject/);
assert.match(app, /QLTD_NOTIFICATION_FALLBACK_MESSAGE = 'Không thể mở đúng nội dung của thông báo\. Dữ liệu có thể đã thay đổi hoặc bạn không còn quyền truy cập\.'/);
assert.match(app, /QLTD_NOTIFICATION_RESOLVED_MESSAGE = 'Yêu cầu này đã được xử lý\.'/);
assert.doesNotMatch(app, /mark all read|notifications_markall/i);

console.log('Notification frontend tests: PASS');
