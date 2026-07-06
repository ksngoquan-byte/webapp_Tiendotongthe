import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  getExecutiveTaskDueDate,
  isExecutiveCategoryRow,
  isExecutiveTaskCompleted,
  isExecutiveTaskOverdue
} from './dashboard-overdue.js';
import {
  buildMainMilestoneFilteredView,
  getMainMilestoneStableKey,
  isMainMilestoneKeySelected,
  migrateMainMilestoneKeys,
  toggleMainMilestoneTaskKey
} from './main-milestone-logic.js?v=WEEKLY_HANGMUC_MILESTONE_V3';
import { buildDepartmentDashboardModel, getDepartmentOwnerPresentation, getDepartmentPerformancePresentation } from './department-dashboard.js?v=EXACT_ROW_ZONE_HANGMUC_V4';
import { getMonthWeekPeriods } from './weekly-periods.js?v=STEP_3B2E4_ACTUAL_DATE_LIFECYCLE';
import { createRegistrationGate } from './registration-gate.js?v=BUG7_EMPLOYEE_REGISTRATION_1';

window.__QLTD_GANTT_PATCH_ROUND__ = 'GANTT_REQUEST_RACE_HOTFIX_3';

const firebaseConfig = {
  apiKey: 'AIzaSyBWQoAi2VwMG0Aygckuv1H3CrlNgn_MJQY',
  authDomain: 'qltd-entiz-dev-208a3.firebaseapp.com',
  projectId: 'qltd-entiz-dev-208a3',
  storageBucket: 'qltd-entiz-dev-208a3.firebasestorage.app',
  messagingSenderId: '515073275488',
  appId: '1:515073275488:web:d598b3ee1ac939a85e7505',
  measurementId: 'G-Z6FVGBST37'
};

const ADMIN_EMAILS = ['ksngoquan@gmail.com'];
const APPS_SCRIPT_DEV_URL = 'https://script.google.com/macros/s/AKfycbx6iHCEf6Ba05h6u6DiBcqv3kxV79T6RvktzoFsdBJXeQjBaCNMyGQL5akptlX8jGtxpg/exec';

const DEFAULT_PERMISSIONS = {
  dashboard: false,
  budgetDashboard: false,
  gantt: false,
  lookup: false,
  help: false,
  reportUpdate: false,
  admin: false
};

const NAV_LABELS = {
  workDashboard: 'Dashboard c\u00f4ng vi\u1ec7c',
  budgetDashboard: 'Dashboard ng\u00e2n s\u00e1ch',
  gantt: 'Gantt',
  help: 'H\u01b0\u1edbng d\u1eabn s\u1eed d\u1ee5ng',
  report: 'L\u1eadp & c\u1eadp nh\u1eadt c\u00f4ng vi\u1ec7c',
  admin: 'Phê duyệt'
};

const PROJECT_STORAGE_KEY = 'qltd.selectedProjectCode.v1';
let qltdSelectedMonthCode = getDefaultMonthCode();
let qltdSelectedMasterCode = '';
let qltdSelectedWeekId = '';
let qltdGanttPayload = null;
let qltdDashboardPayload = null;
let qltdGanttZoom = 'month';
let qltdGanttShowLinks = true;
let qltdGanttShowDates = true;
let qltdGanttViewMode = 'progress';
let qltdGanttBudgetRequestSeq = 0;
const qltdGanttBudgetCache = new Map();
const qltdGanttBudgetLoadingProjects = new Set();
const qltdGanttDataRequests = new Map();
let qltdGanttRequestTail = Promise.resolve();
let qltdGanttLoadRequestSeq = 0;
let qltdDashboardLoadRequestSeq = 0;
const QLTD_GANTT_REQUEST_TIMEOUT_MS = 40000;
const QLTD_GANTT_BUSY_RETRY_DELAY_MS = 1500;
const QLTD_GANTT_BUSY_MAX_DELAY_MS = 6000;
const QLTD_GANTT_BUSY_MAX_ATTEMPTS = 4;
let qltdBudgetSyncRunning = false;
let qltdActiveView = 'dashboard';
let qltdDhtmlxLoadPromise = null;
let qltdExcelJsLoadPromise = null;
let qltdHtmlToImageLoadPromise = null;
let qltdDhtmlxGanttInitialized = false;
let qltdDhtmlxGanttRenderSeq = 0;
let qltdProjectRegistry = [];
let qltdCurrentMainMilestoneProjectKey = '';
let qltdMainMilestoneKeys = new Set();
let qltdMainMilestoneOrphanKeys = new Set();
let qltdMainMilestoneMigration = {
  rawCount: 0,
  validCount: 0,
  migratedCount: 0,
  orphanCount: 0,
  ambiguousCount: 0,
  warnings: []
};
let qltdMainMilestoneSelectMode = false;
let qltdMainMilestoneGanttClickEventId = null;
let qltdMainMilestoneLoadRequestSeq = 0;
let qltdDashboardMode = 'project';
let qltdDashboardContextFilters = { zone: '', loaiCongTrinh: '', congTrinh: '', hangMuc: '' };
let qltdDepartmentDashboardDeptCode = '';
let qltdDepartmentDashboardProjectCode = '';
let qltdDepartmentDashboardRequestSeq = 0;
const qltdDepartmentDashboardCache = new Map();
const qltdDepartmentDashboardDetailCache = new Map();
const qltdWeeklyDrafts = {};
const qltdWeeklyTaskCache = new Map();
const qltdWeeklyTaskInFlight = new Map();
const qltdWeeklyTaskCacheVersions = new Map();
const QLTD_WEEKLY_TASK_RETRY_DELAYS_MS = [300, 800];
const qltdGanttDirtyProjects = new Set();
const qltdGanttForceRefreshProjects = new Set();
const qltdProjectScheduleStates = new Map();
const qltdProjectScheduleRecalcInFlight = new Set();
let qltdWeeklyTaskRequestSeq = 0;
let qltdWeeklyTaskSessionVersion = 0;
let qltdWeeklyTaskCacheIdentity = '';
let qltdWeeklyTaskView = { key: '', items: [], updates: [], nextItems: [], standaloneBudgetItems: [], budgetDrafts: {}, capabilities: { canUpdate: false, canReviewWeekly: false, role: '' }, loading: false, error: '' };
let qltdWeeklySaveRequestId = '';
let qltdSelectedWeeklyItemKey = '';
let qltdWeeklyEditingItemKey = '';
let qltdWeeklyNotificationDetailItemKey = '';
let qltdWeeklyWorkspaceTab = 'objectives';
let qltdWeeklyTaskFilters = { search: '', ownership: 'ALL', statuses: [] };
let qltdReportSubTab = 'plan';
let qltdDeptMasterListExpanded = false;
let qltdWeeklyForcedItem = null;
const qltdDetailPopupCache = new Map();
let qltdDetailPopupRequestSeq = 0;
let qltdAdminApprovalRequestSeq = 0;
let qltdAdminApprovalReviewSeq = 0;
let qltdAdminApprovalView = { projectCode: '', loading: false, error: '', notice: '', approvals: [], reviewing: null, reviewDrafts: {} };
let qltdPbDetailApprovalRequestSeq = 0;
let qltdPbDetailApprovalReviewSeq = 0;
let qltdPbDetailApprovalView = { projectCode: '', loading: false, error: '', approvals: [], reviewing: null };
let qltdBudgetDashboardRequestSeq = 0;
let qltdBudgetDashboardView = { loading: false, error: '', data: null, deptCode: '', view: 'project', showAllBusinessAlerts: false, showAllDataAlerts: false };
let qltdProjectsLoadPromise = null;
const QLTD_NOTIFICATION_TYPE_LABELS = {
  PB_DETAIL_PENDING: 'Cập nhật công việc chờ duyệt',
  MASTER_COMPLETION_PENDING: 'Hoàn thành mục tiêu chờ duyệt',
  UPDATE_APPROVED: 'Cập nhật đã được duyệt',
  UPDATE_REJECTED: 'Cập nhật bị trả lại'
};
const QLTD_NOTIFICATION_FALLBACK_MESSAGE = 'Không thể mở đúng nội dung của thông báo. Dữ liệu có thể đã thay đổi hoặc bạn không còn quyền truy cập.';
const QLTD_NOTIFICATION_RESOLVED_MESSAGE = 'Yêu cầu này đã được xử lý.';
let qltdNotificationLoadRequestSeq = 0;
let qltdNotificationSessionVersion = 0;
let qltdNotificationNavigationSeq = 0;
let qltdNotificationLoadPromise = null;
const qltdNotificationMarkingIds = new Set();
let qltdNotificationHighlight = null;
let qltdNotificationState = {
  loaded: false,
  loading: false,
  open: false,
  error: '',
  warning: '',
  navigationMessage: '',
  notifications: [],
  unreadCount: 0,
  actionRequiredCount: 0
};

document.addEventListener('qltd:pb-detail-changed', (event) => {
  const detail = event.detail || {};
  const cacheKey = [detail.projectCode || '', detail.deptCode || '', detail.masterTaskCode || ''].join('::');
  qltdDetailPopupCache.delete(cacheKey);
  invalidateWeeklyTaskCachePrefix(`${detail.projectCode || ''}::${detail.deptCode || ''}::`);
  const dept = (qltdDeptPlanPayload?.departments || []).find((item) => (item.deptCode || item.sheetName) === detail.deptCode);
  const master = (dept?.masters || []).find((item) => item.masterCode === detail.masterTaskCode);
  if (master && Array.isArray(detail.detailTasks)) master.details = detail.detailTasks;
  if (qltdReportSubTab === 'plan' && detail.deptCode === qltdSelectedDeptCode && detail.masterTaskCode === qltdSelectedMasterCode) renderSelectedDeptPlan();
});

const els = {
  loginView: document.getElementById('loginView'),
  deniedView: document.getElementById('deniedView'),
  appShell: document.getElementById('appShell'),
  signInButton: document.getElementById('signInButton'),
  signOutButton: document.getElementById('signOutButton'),
  deniedSignOutButton: document.getElementById('deniedSignOutButton'),
  retryProfileButton: document.getElementById('retryProfileButton'),
  loginStatus: document.getElementById('loginStatus'),
  deniedEmail: document.getElementById('deniedEmail'),
  userAvatar: document.getElementById('userAvatar'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),
  userRole: document.getElementById('userRole'),
  notificationBellButton: document.getElementById('notificationBellButton'),
  notificationBadge: document.getElementById('notificationBadge'),
  notificationBackdrop: document.getElementById('notificationBackdrop'),
  notificationPanel: document.getElementById('notificationPanel'),
  notificationCloseButton: document.getElementById('notificationCloseButton'),
  notificationUnreadSummary: document.getElementById('notificationUnreadSummary'),
  notificationActionSummary: document.getElementById('notificationActionSummary'),
  notificationPanelStatus: document.getElementById('notificationPanelStatus'),
  notificationReloadButton: document.getElementById('notificationReloadButton'),
  notificationList: document.getElementById('notificationList'),
  accessStatus: document.getElementById('accessStatus'),
  roleStatus: document.getElementById('roleStatus'),
  apiStatus: document.getElementById('apiStatus')
};

let auth = null;
let db = null;
let currentUserProfile = null;
let currentPermissions = { ...DEFAULT_PERMISSIONS };
let authBootstrapRequestSeq = 0;
let lastAuthenticatedUser = null;
let registrationGate = null;

function getLocalRoleForEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase();

  if (ADMIN_EMAILS.includes(normalizedEmail)) return 'Admin';
  return null;
}

function hasFirebaseConfig(config) {
  return Boolean(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.messagingSenderId &&
    config.appId
  );
}

function setStatus(message, type = 'info') {
  if (!els.loginStatus) return;
  els.loginStatus.textContent = message;
  els.loginStatus.dataset.type = type;
}

function showOnly(view) {
  [els.loginView, els.deniedView, els.appShell].forEach((el) => {
    if (!el) return;
    el.classList.toggle('hidden', el !== view);
  });
}

function renderSignedOut() {
  registrationGate?.hide();
  clearWeeklyTaskSessionState();
  clearNotificationState();
  currentUserProfile = null;
  currentPermissions = { ...DEFAULT_PERMISSIONS };
  lastAuthenticatedUser = null;
  showOnly(els.loginView);
  setStatus(
    hasFirebaseConfig(firebaseConfig)
      ? 'S\u1eb5n s\u00e0ng \u0111\u0103ng nh\u1eadp b\u1eb1ng Google.'
      : 'Thi\u1ebfu Firebase web config DEV.',
    hasFirebaseConfig(firebaseConfig) ? 'success' : 'warning'
  );
}

function renderDenied(user, message = '') {
  registrationGate?.hide();
  showOnly(els.deniedView);

  if (els.deniedEmail) {
    els.deniedEmail.textContent = message || `${user.email || 'Email n\u00e0y'} không thể truy cập hệ thống.`;
  }
}

function formatRole(role) {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'PMO') return 'PMO';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'REPORTER') return 'Reporter';
  if (role === 'VIEWER') return 'Viewer';
  return role || 'Kh\u00f4ng x\u00e1c \u0111\u1ecbnh';
}

function normalizeRoleKey(role) {
  return String(role || '').trim().toUpperCase();
}

function isReadOnlyViewer(profile = currentUserProfile) {
  const role = normalizeRoleKey(profile && profile.role);
  return role === 'VIEWER' || !canEditPlanning(profile);
}

function isAuthenticatedUser(profile = currentUserProfile) {
  return !!(profile && profile.email);
}

function canViewMainMilestoneColumn(profile = currentUserProfile) {
  return isAuthenticatedUser(profile);
}

function canSelectMainMilestone(profile = currentUserProfile) {
  return canEditPlanning(profile);
}

function canResetMainMilestone(profile = currentUserProfile) {
  return canEditPlanning(profile);
}

function canExportExcel(profile = currentUserProfile) {
  return isAuthenticatedUser(profile);
}

function getDelegatedDeptManagerScopes(profile = currentUserProfile) {
  return (Array.isArray(profile?.delegatedScopes) ? profile.delegatedScopes : []).filter((scope) =>
    String(scope?.permissionCode || '').trim().toUpperCase() === 'DEPT_MANAGER'
  );
}

function hasDelegatedDeptManagerScope(projectCode = '', deptCode = '', profile = currentUserProfile) {
  const project = String(projectCode || '').trim().toUpperCase();
  const dept = String(deptCode || '').trim().toUpperCase();
  return getDelegatedDeptManagerScopes(profile).some((scope) =>
    (!project || String(scope.projectCode || '').trim().toUpperCase() === project) &&
    (!dept || String(scope.deptCode || '').trim().toUpperCase() === dept)
  );
}

function canApprove(profile = currentUserProfile) {
  const role = normalizeRoleKey(profile && profile.role);
  return ['ADMIN', 'PMO', 'EDITOR'].includes(role) || getDelegatedDeptManagerScopes(profile).length > 0;
}

function canAdmin(profile = currentUserProfile) {
  return normalizeRoleKey(profile && profile.role) === 'ADMIN';
}

function canEditPlanning(profile = currentUserProfile) {
  const role = normalizeRoleKey(profile && profile.role);
  return ['ADMIN', 'PMO', 'EDITOR'].includes(role);
}

function normalizePermissions(permissions = {}, role = '') {
  const roleKey = normalizeRoleKey(role);
  const canViewCore = ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'].includes(roleKey);

  return {
    dashboard: !!permissions.dashboard || canViewCore,
    budgetDashboard: !!permissions.budgetDashboard || canViewCore,
    gantt: !!permissions.gantt || canViewCore,
    lookup: !!permissions.lookup || canViewCore,
    help: !!permissions.help || canViewCore,
    reportUpdate: !!permissions.reportUpdate || canViewCore,
    admin: canAdmin({ role }) || !!permissions.admin
  };
}

function setApiStatus(message) {
  if (els.apiStatus) els.apiStatus.textContent = message;
}

function formatNotificationBadgeCount(count) {
  const value = Math.max(0, Number(count) || 0);
  return value > 99 ? '99+' : String(value);
}

function formatNotificationType(type) {
  return QLTD_NOTIFICATION_TYPE_LABELS[String(type || '').trim().toUpperCase()] || 'Thông báo hệ thống';
}

function getNotificationTypeTone(type) {
  const code = String(type || '').trim().toUpperCase();
  if (code === 'PB_DETAIL_PENDING') return 'pending';
  if (code === 'MASTER_COMPLETION_PENDING') return 'master';
  if (code === 'UPDATE_APPROVED') return 'approved';
  if (code === 'UPDATE_REJECTED') return 'rejected';
  return 'system';
}

function getNotificationTypeIcon(type) {
  const tone = getNotificationTypeTone(type);
  if (tone === 'pending') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H6a2 2 0 0 0-2 2v12h12v-3M9 3h6v4H9zM13 12l2 2 5-5"/></svg>';
  if (tone === 'master') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m14 10 5-5"/></svg>';
  if (tone === 'approved') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
  if (tone === 'rejected') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h9a5 5 0 0 1 5 5v2"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
}

function normalizeNotificationItem(item = {}) {
  return {
    notificationId: String(item.notificationId || item.NotificationId || '').trim(),
    type: String(item.type || item.Type || '').trim().toUpperCase(),
    entityId: String(item.entityId || item.EntityId || '').trim(),
    projectCode: String(item.projectCode || item.ProjectCode || '').trim(),
    departmentCode: String(item.departmentCode || item.DepartmentCode || '').trim(),
    weekStart: String(item.weekStart || item.WeekStart || '').trim().slice(0, 10),
    tabKey: String(item.tabKey || item.TabKey || '').trim().toUpperCase(),
    itemKey: String(item.itemKey || item.ItemKey || '').trim(),
    title: String(item.title || item.Title || ''),
    message: String(item.message || item.Message || ''),
    isRead: item.isRead === true || item.IsRead === true || String(item.isRead || item.IsRead || '').toUpperCase() === 'TRUE',
    status: String(item.status || item.Status || '').trim().toUpperCase(),
    createdAt: String(item.createdAt || item.CreatedAt || '').trim(),
    sourceRequestId: String(item.sourceRequestId || item.SourceRequestId || '').trim()
  };
}

function sortNotificationsNewest(items = []) {
  return items.slice().sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

function isNotificationActionType(type) {
  return ['PB_DETAIL_PENDING', 'MASTER_COMPLETION_PENDING'].includes(String(type || '').toUpperCase());
}

function getNotificationWeekId(notification = {}) {
  const weekStart = String(notification.weekStart || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? `WEEK-${weekStart}` : '';
}

function getNotificationDeepLinkKind(type) {
  const code = String(type || '').trim().toUpperCase();
  if (code === 'PB_DETAIL_PENDING') return 'PB_APPROVAL';
  if (code === 'MASTER_COMPLETION_PENDING') return 'MASTER_APPROVAL';
  if (code === 'UPDATE_APPROVED') return 'WEEKLY_APPROVED';
  if (code === 'UPDATE_REJECTED') return 'WEEKLY_REJECTED';
  return 'UNKNOWN';
}

function isNotificationNavigationCurrent(navigationSeq) {
  return !navigationSeq || navigationSeq === qltdNotificationNavigationSeq;
}

function renderNotificationCenter() {
  const state = qltdNotificationState;
  const unreadCount = Math.max(0, Number(state.unreadCount) || 0);
  const actionRequiredCount = Math.max(0, Number(state.actionRequiredCount) || 0);
  if (els.notificationBellButton) {
    const tooltip = `Bạn có ${unreadCount} thông báo chưa đọc`;
    els.notificationBellButton.title = tooltip;
    els.notificationBellButton.setAttribute('aria-label', tooltip);
    els.notificationBellButton.setAttribute('aria-expanded', state.open ? 'true' : 'false');
  }
  if (els.notificationBadge) {
    els.notificationBadge.textContent = unreadCount ? formatNotificationBadgeCount(unreadCount) : '';
    els.notificationBadge.classList.toggle('hidden', unreadCount === 0);
  }
  if (els.notificationPanel) {
    els.notificationPanel.classList.remove('hidden');
    els.notificationPanel.classList.toggle('is-open', state.open);
    els.notificationPanel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
  }
  if (els.notificationBackdrop) {
    els.notificationBackdrop.classList.remove('hidden');
    els.notificationBackdrop.classList.toggle('is-open', state.open);
  }
  if (els.notificationUnreadSummary) els.notificationUnreadSummary.textContent = String(unreadCount);
  if (els.notificationActionSummary) els.notificationActionSummary.textContent = String(actionRequiredCount);
  if (els.notificationReloadButton) {
    els.notificationReloadButton.disabled = state.loading;
    els.notificationReloadButton.classList.toggle('is-loading', state.loading);
    const reloadLabel = els.notificationReloadButton.querySelector('span');
    if (reloadLabel) reloadLabel.textContent = state.loading ? 'Đang tải...' : 'Tải lại';
  }
  if (els.notificationPanelStatus) {
    const status = state.navigationMessage || state.warning || state.error || (state.loading ? (state.loaded ? 'Đang tải lại...' : 'Đang tải thông báo...') : '');
    els.notificationPanelStatus.textContent = status;
    els.notificationPanelStatus.className = state.error ? 'is-error' : state.warning ? 'is-warning' : '';
  }
  if (!els.notificationList) return;
  els.notificationList.setAttribute('aria-busy', state.loading ? 'true' : 'false');
  if (state.loading && !state.loaded) {
    els.notificationList.innerHTML = `<div class="notification-state is-loading" role="status">
      <span class="notification-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></span>
      <strong>Đang tải thông báo...</strong>
      <span>Vui lòng chờ trong giây lát.</span>
    </div>`;
    return;
  }
  if (state.error && !state.notifications.length) {
    els.notificationList.innerHTML = `<div class="notification-state is-error" role="alert">
      <span class="notification-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 4h.01M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></span>
      <strong>Không tải được thông báo</strong>
      <span>${escapeHtml(state.error || 'Đã xảy ra lỗi khi kết nối.')}</span>
      <button type="button" class="notification-state-action" data-notification-retry>Thử lại</button>
    </div>`;
    els.notificationList.querySelector('[data-notification-retry]').onclick = () => loadNotifications();
    return;
  }
  if (!state.notifications.length) {
    els.notificationList.innerHTML = `<div class="notification-state is-empty">
      <span class="notification-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span>
      <strong>Bạn chưa có thông báo</strong>
      <span>Các yêu cầu phê duyệt và cập nhật mới sẽ hiển thị tại đây.</span>
    </div>`;
    return;
  }
  els.notificationList.innerHTML = sortNotificationsNewest(state.notifications).map((notification) => {
    const typeLabel = formatNotificationType(notification.type);
    const typeTone = getNotificationTypeTone(notification.type);
    const actionState = isNotificationActionType(notification.type)
      ? `<span class="notification-pill ${notification.status === 'RESOLVED' ? 'is-resolved' : 'is-action'}">${notification.status === 'RESOLVED' ? 'Đã xử lý' : 'Cần xử lý'}</span>`
      : '';
    const createdAt = formatWeeklyDateTime(notification.createdAt) || 'Không rõ thời gian';
    const metadata = [notification.projectCode, notification.departmentCode].filter(Boolean).join(' · ');
    return `<button type="button" class="notification-item is-${typeTone} ${notification.isRead ? 'is-read' : 'is-unread'}" data-notification-id="${escapeHtml(notification.notificationId)}" aria-label="${escapeHtml(`${notification.title || typeLabel}. ${notification.isRead ? 'Đã đọc' : 'Chưa đọc'}`)}">
      <span class="notification-type-icon" aria-hidden="true">${getNotificationTypeIcon(notification.type)}</span>
      <span class="notification-item-content">
        <span class="notification-item-meta"><span class="notification-type-pill">${escapeHtml(typeLabel)}</span><time>${escapeHtml(createdAt)}</time></span>
        <span class="notification-item-heading"><strong>${escapeHtml(notification.title || typeLabel)}</strong>${notification.isRead ? '' : '<span class="notification-unread-dot" title="Chưa đọc"></span>'}</span>
        <span class="notification-item-message">${escapeHtml(notification.message || '')}</span>
        ${metadata ? `<span class="notification-item-context">${escapeHtml(metadata)}</span>` : ''}
        <span class="notification-item-badges"><span class="notification-pill ${notification.isRead ? '' : 'is-unread'}">${notification.isRead ? 'Đã đọc' : 'Chưa đọc'}</span>${actionState}</span>
      </span>
      <span class="notification-item-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>
    </button>`;
  }).join('');
  els.notificationList.querySelectorAll('[data-notification-id]').forEach((button) => {
    button.onclick = () => handleNotificationClick(button.dataset.notificationId || '');
  });
}

function clearNotificationState() {
  qltdNotificationSessionVersion += 1;
  qltdNotificationLoadRequestSeq += 1;
  qltdNotificationNavigationSeq += 1;
  qltdNotificationLoadPromise = null;
  qltdNotificationMarkingIds.clear();
  qltdNotificationHighlight = null;
  qltdNotificationState = {
    loaded: false,
    loading: false,
    open: false,
    error: '',
    warning: '',
    navigationMessage: '',
    notifications: [],
    unreadCount: 0,
    actionRequiredCount: 0
  };
  renderNotificationCenter();
}

async function loadNotifications(options = {}) {
  if (!auth?.currentUser || !isAuthenticatedUser()) return null;
  if (qltdNotificationLoadPromise) return qltdNotificationLoadPromise;
  const requestSeq = ++qltdNotificationLoadRequestSeq;
  const sessionVersion = qltdNotificationSessionVersion;
  qltdNotificationState = { ...qltdNotificationState, loading: true, error: '', warning: options.keepWarning ? qltdNotificationState.warning : '' };
  renderNotificationCenter();
  let requestPromise;
  requestPromise = (async () => {
    try {
      const result = await fetchBackendJson('notifications_list', { limit: 100 }, { auth: true });
      if (!result.success) throw new Error(getBackendErrorMessage(result, 'Không tải được thông báo.'));
      if (requestSeq !== qltdNotificationLoadRequestSeq || sessionVersion !== qltdNotificationSessionVersion) return null;
      const data = result.data || result;
      const notifications = sortNotificationsNewest((Array.isArray(data.notifications) ? data.notifications : []).map(normalizeNotificationItem));
      let unreadCount = Math.max(0, Number(data.unreadCount) || 0);
      notifications.forEach((notification) => {
        if (qltdNotificationMarkingIds.has(notification.notificationId) && !notification.isRead) {
          notification.isRead = true;
          unreadCount = Math.max(0, unreadCount - 1);
        }
      });
      qltdNotificationState = {
        ...qltdNotificationState,
        loaded: true,
        loading: false,
        error: '',
        notifications,
        unreadCount,
        actionRequiredCount: Math.max(0, Number(data.actionRequiredCount) || 0)
      };
      renderNotificationCenter();
      return qltdNotificationState;
    } catch (error) {
      if (requestSeq !== qltdNotificationLoadRequestSeq || sessionVersion !== qltdNotificationSessionVersion) return null;
      qltdNotificationState = {
        ...qltdNotificationState,
        loaded: false,
        loading: false,
        error: error.message || 'Không tải được thông báo.',
        notifications: [],
        unreadCount: 0,
        actionRequiredCount: 0
      };
      renderNotificationCenter();
      return null;
    } finally {
      if (qltdNotificationLoadPromise === requestPromise) qltdNotificationLoadPromise = null;
    }
  })();
  qltdNotificationLoadPromise = requestPromise;
  return requestPromise;
}

function setNotificationPanelOpen(open) {
  const wasOpen = qltdNotificationState.open;
  qltdNotificationState = { ...qltdNotificationState, open: !!open, navigationMessage: open ? qltdNotificationState.navigationMessage : '' };
  renderNotificationCenter();
  if (open && !wasOpen && els.notificationCloseButton) els.notificationCloseButton.focus({ preventScroll: true });
  if (open) loadNotifications();
}

async function markNotificationReadOptimistically(notificationId) {
  const id = String(notificationId || '').trim();
  const notification = qltdNotificationState.notifications.find((item) => item.notificationId === id);
  if (!notification || notification.isRead || qltdNotificationMarkingIds.has(id)) return false;
  qltdNotificationMarkingIds.add(id);
  qltdNotificationState = {
    ...qltdNotificationState,
    notifications: qltdNotificationState.notifications.map((item) => item.notificationId === id ? { ...item, isRead: true } : item),
    unreadCount: Math.max(0, Number(qltdNotificationState.unreadCount || 0) - 1),
    warning: ''
  };
  renderNotificationCenter();
  try {
    const result = await postBackendJson({ action: 'notifications_markread', NotificationId: id });
    if (!result.success) throw new Error(getBackendErrorMessage(result, 'Không đánh dấu được thông báo đã đọc.'));
    return true;
  } catch (error) {
    const hasCurrent = qltdNotificationState.notifications.some((item) => item.notificationId === id);
    qltdNotificationState = {
      ...qltdNotificationState,
      notifications: qltdNotificationState.notifications.map((item) => item.notificationId === id ? { ...item, isRead: false } : item),
      unreadCount: Math.max(0, Number(qltdNotificationState.unreadCount || 0) + (hasCurrent ? 1 : 0)),
      warning: error.message || 'Không đánh dấu được thông báo đã đọc.'
    };
    renderNotificationCenter();
    showWeeklyToast(qltdNotificationState.warning);
    return false;
  } finally {
    qltdNotificationMarkingIds.delete(id);
  }
}

async function handleNotificationClick(notificationId) {
  const notification = qltdNotificationState.notifications.find((item) => item.notificationId === String(notificationId || ''));
  if (!notification) return;
  void markNotificationReadOptimistically(notification.notificationId);
  qltdNotificationState = { ...qltdNotificationState, navigationMessage: 'Đang mở nội dung thông báo...', warning: '' };
  renderNotificationCenter();
  const navigationSeq = ++qltdNotificationNavigationSeq;
  const navigation = await navigateNotificationDeepLink(notification, navigationSeq);
  if (!isNotificationNavigationCurrent(navigationSeq)) return;
  if (navigation.success) {
    setNotificationPanelOpen(false);
    showWeeklyToast(navigation.message || 'Đã mở nội dung thông báo.');
    return;
  }
  qltdNotificationState = { ...qltdNotificationState, navigationMessage: navigation.message || QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  renderNotificationCenter();
  showWeeklyToast(navigation.message || QLTD_NOTIFICATION_FALLBACK_MESSAGE);
}

function getNavButtonByLabel(label) {
  const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  return candidates.find((el) => String(el.textContent || '').trim().toLowerCase() === label.toLowerCase());
}

function setNavVisibility(label, allowed) {
  const el = getNavButtonByLabel(label);
  if (!el) return;

  el.classList.toggle('hidden', !allowed);
  el.hidden = !allowed;
  el.disabled = !allowed;
  el.setAttribute('aria-hidden', allowed ? 'false' : 'true');
}

function applyPermissions(profile = {}) {
  ensureTopNavigation();
  const nextWeeklyIdentity = [
    String(profile.email || '').trim().toLowerCase(),
    normalizeRoleKey(profile.role),
    JSON.stringify(profile.permissions || {}),
    JSON.stringify(profile.delegatedScopes || [])
  ].join('::');
  if (qltdWeeklyTaskCacheIdentity !== nextWeeklyIdentity) clearWeeklyTaskSessionState();
  qltdWeeklyTaskCacheIdentity = nextWeeklyIdentity;
  currentUserProfile = profile;
  currentPermissions = normalizePermissions(profile.permissions || DEFAULT_PERMISSIONS, profile.role);

  setNavVisibility(NAV_LABELS.workDashboard, currentPermissions.dashboard);
  setNavVisibility('Dashboard', false);
  setNavVisibility(NAV_LABELS.budgetDashboard, currentPermissions.budgetDashboard);
  setNavVisibility(NAV_LABELS.gantt, currentPermissions.gantt);
  setNavVisibility('Tra c\u1ee9u', false);
  setNavVisibility(NAV_LABELS.help, currentPermissions.help);
  setNavVisibility('B\u00e1o c\u1eadp nh\u1eadt', false);
  setNavVisibility(NAV_LABELS.report, currentPermissions.reportUpdate);
  setNavVisibility(NAV_LABELS.admin, canApprove(profile));
}


function getStoredProjectCode() {
  try {
    return localStorage.getItem(PROJECT_STORAGE_KEY) || '';
  } catch (error) {
    console.warn('Cannot read selected project from localStorage', error);
    return '';
  }
}

function setStoredProjectCode(projectCode) {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, projectCode || '');
  } catch (error) {
    console.warn('Cannot save selected project to localStorage', error);
  }
}

function findAppHeaderContainer() {
  return document.querySelector('.app-main') ||
    document.querySelector('main') ||
    els.appShell;
}

function renderProjectOptions(projects = []) {
  ensureProjectSelector();
  qltdProjectRegistry = Array.isArray(projects) ? projects : [];

  const selector = document.getElementById('projectSelector');
  const status = document.getElementById('projectSelectorStatus');
  if (!selector) return;

  const storedProjectCode = getStoredProjectCode();
  selector.innerHTML = '';

  if (!projects.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Ch\u01b0a c\u00f3 d\u1ef1 \u00e1n ACTIVE';
    selector.appendChild(option);
    selector.disabled = true;
    qltdGanttPayload = null;
    qltdDashboardPayload = null;
    if (status) {
      status.textContent = 'Ch\u01b0a c\u00f3 d\u1ef1 \u00e1n';
      status.classList.remove('hidden');
    }
    renderNoProjectDashboardState();
    renderNoProjectBudgetDashboardState();
    renderNoProjectGanttState();
    return;
  }

  projects.forEach((project) => {
    const option = document.createElement('option');
    option.value = project.projectCode;
    option.textContent = `${project.projectCode} - ${project.projectName}`;
    selector.appendChild(option);
  });

  const hasStoredProject = projects.some((project) => project.projectCode === storedProjectCode);
  selector.value = hasStoredProject ? storedProjectCode : projects[0].projectCode;
  setStoredProjectCode(selector.value);
  if (qltdActiveView === 'dashboard') loadDashboardDataForSelectedProject(selector.value);
  if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);

  if (status) {
    status.textContent = '';
    status.classList.add('hidden');
  }

  selector.disabled = false;
  selector.onchange = () => {
    setStoredProjectCode(selector.value);
    if (qltdActiveView === 'report') loadDeptPlansForSelectedProject(selector.value);
    if (qltdActiveView === 'budget') loadBudgetDashboardForSelectedProject({ force: true });
    if (qltdActiveView === 'admin') loadAdminMasterApprovals();
    if (qltdActiveView === 'dashboard') loadDashboardDataForSelectedProject(selector.value);
    if (qltdActiveView === 'gantt') loadGanttDataForSelectedProject(selector.value);
  };
}

async function loadProjectsForSelector() {
  try {
    const payload = await fetchBackendJson('listProjects', {
      email: currentUserProfile?.email || ''
    }, { auth: true });
    if (!payload.success) {
      throw new Error(payload.message || 'listProjects failed');
    }
    renderProjectOptions(payload.projects || []);
  } catch (error) {
    console.error('Cannot load project registry', error);
    ensureProjectSelector();
    qltdProjectRegistry = [];
    const selector = document.getElementById('projectSelector');
    const status = document.getElementById('projectSelectorStatus');
    if (selector) {
      selector.innerHTML = '<option value="">Không tải được danh sách dự án</option>';
      selector.value = '';
      selector.disabled = true;
    }
    if (status) {
      status.textContent = 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c danh s\u00e1ch d\u1ef1 \u00e1n';
      status.classList.remove('hidden');
    }
    renderDashboardError(error);
    renderBudgetDashboardError(error);
    renderGanttError(error);
  }
}



// WEB-04B.2 compact UI overrides
let qltdDeptPlanPayload = null;
let qltdSelectedDeptCode = '';
let qltdDeptPlanRequestSeq = 0;
const qltdDeptPlanCache = new Map();
const QLTD_WEEKLY_DEPT_ACCESS_MESSAGE = 'Bạn không được cấp quyền truy cập vào dữ liệu phòng/ban này.';
const QLTD_PLAN_DEPT_ACCESS_MESSAGE = 'Bạn không có quyền truy cập dữ liệu của phòng/ban này.';

function qltdDevPerfEnabled() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
    new URLSearchParams(window.location.search).get('debugPerf') === '1';
}

function qltdLogBackendPerformance(action, totalMs, payload) {
  if (!qltdDevPerfEnabled()) return;
  const server = payload && payload.performance || {};
  console.info('[QLTD PERF]', {
    requestId: server.requestId || '',
    action,
    totalMs: Math.round(totalMs),
    serverMs: Number(server.serverMs || server.durationMs || 0),
    responseBytes: Number(server.responseBytes || 0),
    rowsRead: Number(server.rowsRead || 0),
    cellsRead: Number(server.cellsRead || 0),
    recordCount: Number(server.recordCount || 0),
    cacheHit: !!server.cacheHit,
    sourceCount: Number(server.sourceCount || 0),
    sheetCount: Number(server.sheetCount || 0)
  });
}

function findPrimaryNavContainer() {
  const labels = [NAV_LABELS.workDashboard, NAV_LABELS.budgetDashboard, NAV_LABELS.gantt, NAV_LABELS.report, NAV_LABELS.admin, 'Dashboard'];
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  const dashboardButton = buttons.find((el) => labels.indexOf(String(el.textContent || '').trim()) !== -1);

  if (dashboardButton && dashboardButton.parentElement) {
    return dashboardButton.parentElement;
  }

  return document.querySelector('nav') || document.querySelector('.nav') || els.appShell;
}

function ensureTopNavigation() {
  const nav = document.querySelector('nav.tabs');
  if (!nav || nav.dataset.qltdFinalNav === '1') return nav;
  nav.innerHTML = [
    NAV_LABELS.workDashboard,
    NAV_LABELS.budgetDashboard,
    NAV_LABELS.gantt,
    NAV_LABELS.help,
    NAV_LABELS.report,
    NAV_LABELS.admin
  ].map((label) => `<button type="button" disabled>${escapeHtml(label)}</button>`).join('');
  nav.dataset.qltdFinalNav = '1';
  return nav;
}

function ensureProjectSelector() {
  if (!els.appShell) return null;
  ensureTopNavigation();

  let wrapper = document.getElementById('projectSelectorPanel');
  if (wrapper) return wrapper;

  wrapper = document.createElement('div');
  wrapper.id = 'projectSelectorPanel';
  wrapper.className = 'nav-control nav-project-control';
  wrapper.innerHTML = `
    <label class="nav-control-label" for="projectSelector">D\u1ef1 \u00e1n</label>
    <select id="projectSelector" class="nav-control-select">
      <option value="">\u0110ang t\u1ea3i...</option>
    </select>
    <span id="projectSelectorStatus" class="nav-control-status hidden"></span>
  `;

  const nav = findPrimaryNavContainer();
  if (nav) {
    const adminButton = getNavButtonByLabel(NAV_LABELS.admin);
    if (adminButton && adminButton.parentElement === nav) nav.insertBefore(wrapper, adminButton);
    else nav.appendChild(wrapper);
  }

  return wrapper;
}

function ensureDeptSelector() {
  ensureDeptPlanPanel();
  return document.getElementById('deptSelectorPanel');
}

function ensureDeptPlanPanel() {
  if (!els.appShell) return null;

  let panel = document.getElementById('deptPlanPanel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'deptPlanPanel';
  panel.className = `dept-plan-panel compact ${qltdActiveView === 'report' ? '' : 'hidden'}`;
  panel.innerHTML = `
    <div class="dept-plan-card">
      <div class="dept-plan-header">
        <div>
          <h2>Ph\u00e2n b\u1ed5 ph\u00f2ng/ban theo d\u1ef1 \u00e1n</h2>
          <p id="deptPlanSubTitle" class="dept-plan-subtitle">Ch\u1ecdn d\u1ef1 \u00e1n v\u00e0 ph\u00f2ng/ban \u0111\u1ec3 xem danh s\u00e1ch m\u1ee5c ti\u00eau.</p>
        </div>
        <span id="deptPlanStatus" class="dept-plan-status">Ch\u01b0a t\u1ea3i d\u1eef li\u1ec7u</span>
      </div>
      <div id="deptSelectorPanel" class="dept-plan-filter">
        <label for="deptSelector">Ph\u00f2ng/ban</label>
        <select id="deptSelector" disabled>
          <option value="">Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u</option>
        </select>
      </div>
      <div id="deptPlanContent" class="dept-plan-content"></div>
    </div>
  `;

  els.appShell.appendChild(panel);

  return panel;
}

function ensureWeb07InlineStyles() {
  if (document.getElementById('web07InlineStyles')) return;

  const style = document.createElement('style');
  style.id = 'web07InlineStyles';
  style.textContent = `
    .web07-panel {
      width: min(1800px, calc(100vw - 48px));
      max-width: none;
      margin: 18px auto 40px;
    }

    body.qltd-dashboard-mode #web07DashboardPanel {
      width: calc(100vw - 56px);
      max-width: none;
      margin: 18px auto 40px;
    }

    body.qltd-gantt-mode .web07-panel {
      width: min(1800px, calc(100vw - 48px));
      max-width: none;
    }

    body.qltd-gantt-mode #web07GanttPanel {
      width: calc(100vw - 32px);
      max-width: none;
      margin: 12px auto;
    }

    body.qltd-budget-mode #web07BudgetDashboardPanel,
    body.qltd-help-mode #web07HelpPanel {
      width: calc(100vw - 56px);
      max-width: none;
      margin: 18px auto 40px;
    }

    body.qltd-gantt-mode #web07GanttPanel .web07-card {
      padding: 14px;
    }

    .web07-card {
      border: 1px solid #d7e0ea;
      border-radius: 14px;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(16, 32, 51, .06);
      padding: 20px;
    }

    .web07-header,
    .web07-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .web07-toolbar-group,
    .web07-link-legend {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
    }

    .web07-header h2 {
      margin: 0 0 5px;
      color: #102033;
      font-size: 20px;
    }

    .web07-subtitle,
    .web07-muted {
      margin: 0;
      color: #67738a;
      font-size: 13px;
    }

    .web07-chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border-radius: 999px;
      background: #e8f4f1;
      color: #0c7164;
      font-size: 12px;
      font-weight: 800;
      padding: 5px 10px;
      white-space: nowrap;
    }

    .web07-schedule-state {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin: 0 0 14px;
      border: 1px solid #f2c46d;
      border-radius: 10px;
      background: #fff8e6;
      color: #8a4b08;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 700;
    }

    .web07-schedule-state.is-clean {
      border-color: #9dd8c8;
      background: #ecfdf5;
      color: #0f6a55;
    }

    .web07-schedule-state button {
      min-height: 32px;
      border: 0;
      border-radius: 8px;
      background: #0b3ea8;
      color: #ffffff;
      padding: 6px 12px;
      font: inherit;
      cursor: pointer;
    }

    .web07-schedule-state button:disabled {
      cursor: wait;
      opacity: .65;
    }

    .web07-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .web07-table th,
    .web07-table td {
      border-bottom: 1px solid #edf1f5;
      padding: 8px 7px;
      text-align: left;
      vertical-align: top;
    }

    .web07-toolbar input,
    .web07-toolbar select {
      height: 32px;
      border: 1px solid #cbd6e2;
      border-radius: 8px;
      padding: 0 9px;
      background: #ffffff;
      color: #102033;
      font: inherit;
      font-size: 13px;
    }

    .web07-toolbar button {
      height: 32px;
      border: 1px solid #cbd6e2;
      border-radius: 8px;
      padding: 0 10px;
      background: #ffffff;
      color: #102033;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    .web07-toolbar button.active {
      border-color: #0f766e;
      background: #0f766e;
      color: #ffffff;
    }

    .gantt-mode-tabs {
      display: inline-flex;
      border: 1px solid #d7e0ea;
      border-radius: 8px;
      background: #f8fafc;
      padding: 3px;
      gap: 3px;
    }

    .gantt-mode-tabs button {
      border: 0;
      background: transparent;
      height: 30px;
    }

    .gantt-mode-tabs button.active {
      background: #ffffff;
      color: #102033;
      box-shadow: 0 4px 12px rgba(16, 32, 51, .08);
    }

    .web07-link-legend {
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }

    .web07-link-legend.is-muted {
      opacity: .45;
    }

    .web07-link-sample {
      width: 20px;
      height: 3px;
      border-radius: 999px;
      display: inline-block;
      background: #64748b;
    }

    .web07-link-sample.ss { background: #2563eb; }
    .web07-link-sample.ff { background: #7c3aed; }
    .web07-link-sample.sf { background: #ef4444; }

    .web07-gantt-box {
      width: 100%;
      height: calc(100vh - 260px);
      min-height: 620px;
      border: 1px solid #d7e0ea;
      border-radius: 10px;
      overflow: hidden;
    }

    body.qltd-gantt-mode .web07-gantt-box {
      height: calc(100vh - 230px);
      min-height: 680px;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-done {
      background: #16a34a;
      border-color: #15803d;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-active {
      background: #0f766e;
      border-color: #0f766e;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-overdue {
      background: #dc2626;
      border-color: #b91c1c;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-paused {
      background: #a16207;
      border-color: #854d0e;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-not-started {
      background: #64748b;
      border-color: #475569;
    }

    #web07GanttContainer .gantt_task_line.qltd-gantt-milestone {
      background: #7c3aed;
      border-color: #6d28d9;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-unknown {
      background: #98a2b3;
      border-color: #667085;
    }

    #web07GanttContainer .gantt_row.main-milestone-row .gantt_cell,
    #web07GanttContainer .gantt_task_row.main-milestone-row {
      background: #fff7ed !important;
    }

    .main-milestone-cell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      color: #64748b;
      font-size: 15px;
      cursor: pointer;
      user-select: none;
    }

    .main-milestone-cell.is-selected {
      color: #d97706;
    }

    .main-milestone-cell.is-readonly {
      cursor: default;
    }

    #web07GanttContainer .gantt_task_progress {
      background: rgba(255, 255, 255, .28);
    }

    .gantt-budget-money {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      width: 100%;
      min-width: 0;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .gantt-budget-money.is-chi {
      color: #c2410c;
    }

    .gantt-budget-money.is-thu {
      color: #0f766e;
    }

    .gantt-budget-empty {
      color: #94a3b8;
      font-weight: 700;
    }

    .web07-alert-row {
      cursor: pointer;
    }

    .web07-alert-row:hover td {
      background: #f8fafc;
    }

    .web07-gantt-box.is-fallback {
      height: min(68vh, 720px);
      min-height: 480px;
    }

    #web07GanttContainer .gantt_task_link {
      --dependency-link-color: #64748b;
      opacity: .68 !important;
    }

    #web07GanttContainer .gantt_task_link.qltd-link-fs { --dependency-link-color: #64748b; }
    #web07GanttContainer .gantt_task_link.qltd-link-ss { --dependency-link-color: #2563eb; }
    #web07GanttContainer .gantt_task_link.qltd-link-ff { --dependency-link-color: #7c3aed; }
    #web07GanttContainer .gantt_task_link.qltd-link-sf { --dependency-link-color: #ef4444; }

    #web07GanttContainer .gantt_task_link .gantt_line_wrapper {
      background: transparent !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_line_wrapper div {
      background-color: var(--dependency-link-color) !important;
      border-color: var(--dependency-link-color) !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_right {
      border-left-color: var(--dependency-link-color) !important;
      border-right-color: transparent !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_left {
      border-right-color: var(--dependency-link-color) !important;
      border-left-color: transparent !important;
    }

    body.qltd-printing > :not(.qltd-gantt-print-root) {
      display: none !important;
    }

    @media print {
      @page {
        size: A4 landscape;
        margin: 8mm;
      }

      body.qltd-printing > :not(.qltd-gantt-print-root) {
        display: none !important;
      }

      body.qltd-printing {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }

      .qltd-gantt-print-root {
        display: block !important;
        position: static !important;
        width: max-content !important;
        min-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      .qltd-gantt-print-title {
        margin: 0 0 8px !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        line-height: 1.25 !important;
        color: #111827 !important;
      }

      .qltd-gantt-print-root .web07-toolbar {
        display: none !important;
      }

      .qltd-gantt-print-root #web07GanttPanel,
      .qltd-gantt-print-root #web07GanttContainer {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
    }

    .web07-fallback-table-wrap {
      max-height: 520px;
      overflow: auto;
      border: 1px solid #e1e8ef;
      border-radius: 10px;
    }

    .web07-warning-list {
      margin: 10px 0 0;
      padding-left: 18px;
      color: #a15c07;
      font-size: 13px;
    }

    .budget-dashboard {
      --budget-thu: #0f766e;
      --budget-thu-soft: #dff7ef;
      --budget-thu-inner: #ccfbf1;
      --budget-chi: #d97706;
      --budget-chi-soft: #fff3d6;
      --budget-chi-inner: #ffedd5;
      --budget-positive: #15803d;
      --budget-positive-inner: #dcfce7;
      --budget-near-zero: #ca8a04;
      --budget-near-zero-inner: #fef9c3;
      --budget-negative: #dc2626;
      --budget-negative-inner: #fee2e2;
      --budget-ink: #102033;
      --budget-muted: #64748b;
      --budget-border: #d7e0ea;
      display: grid;
      gap: 14px;
    }

    .budget-scope-tabs {
      display: inline-flex;
      border: 1px solid var(--budget-border);
      border-radius: 8px;
      background: #f8fafc;
      padding: 3px;
      gap: 3px;
    }

    .budget-scope-tabs button {
      height: 34px;
      border: 0;
      border-radius: 6px;
      padding: 0 12px;
      background: transparent;
      color: #475569;
      font: inherit;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }

    .budget-scope-tabs button.active {
      background: #ffffff;
      color: var(--budget-ink);
      box-shadow: 0 4px 12px rgba(16, 32, 51, .08);
    }

    .budget-filter-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .budget-filter-row label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--budget-muted);
      font-weight: 800;
      font-size: 13px;
    }

    .budget-filter-row select,
    .budget-filter-row button {
      height: 34px;
      border: 1px solid var(--budget-border);
      border-radius: 8px;
      padding: 0 10px;
      background: #fff;
      color: var(--budget-ink);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
    }

    .budget-flow-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      align-items: stretch;
    }

    .budget-flow-grid.is-department-single {
      grid-template-columns: minmax(280px, 520px);
    }

    .budget-flow-grid.is-department-double {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .budget-flow-card,
    .budget-balance-card,
    .budget-alerts-card,
    .budget-items-card {
      border: 1px solid var(--budget-border);
      border-radius: 8px;
      background: #fff;
      padding: 18px;
      box-shadow: 0 8px 22px rgba(16, 32, 51, .05);
      min-height: 100%;
    }

    .budget-flow-card header,
    .budget-balance-card header,
    .budget-alerts-card header,
    .budget-items-card header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .budget-flow-card h3,
    .budget-balance-card h3,
    .budget-alerts-card h3,
    .budget-items-card h3 {
      margin: 0;
      font-size: 16px;
      color: var(--budget-ink);
    }

    .budget-gauge {
      --value: 0deg;
      --ring-color: var(--budget-thu);
      --ring-rest: var(--budget-thu-soft);
      --inner-bg: var(--budget-thu-inner);
      --gauge-text: var(--budget-thu);
      width: clamp(210px, 17vw, 250px);
      aspect-ratio: 1;
      border-radius: 50%;
      background: conic-gradient(var(--ring-color) var(--value), var(--ring-rest) 0);
      display: grid;
      place-items: center;
      margin: 6px auto 16px;
      box-shadow: inset 0 0 0 1px rgba(16, 32, 51, .04);
    }

    .budget-flow-card.is-chi .budget-gauge {
      --ring-color: var(--budget-chi);
      --ring-rest: var(--budget-chi-soft);
      --inner-bg: var(--budget-chi-inner);
      --gauge-text: var(--budget-chi);
    }

    .budget-balance-card.is-positive .budget-gauge {
      --ring-color: var(--budget-positive);
      --ring-rest: #dcfce7;
      --inner-bg: var(--budget-positive-inner);
      --gauge-text: var(--budget-positive);
    }

    .budget-balance-card.is-near-zero .budget-gauge {
      --ring-color: var(--budget-near-zero);
      --ring-rest: #fef9c3;
      --inner-bg: var(--budget-near-zero-inner);
      --gauge-text: var(--budget-near-zero);
    }

    .budget-balance-card.is-negative .budget-gauge {
      --ring-color: var(--budget-negative);
      --ring-rest: #fee2e2;
      --inner-bg: var(--budget-negative-inner);
      --gauge-text: var(--budget-negative);
    }

    .budget-gauge span {
      width: 66%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--inner-bg);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--gauge-text);
      text-align: center;
      padding: 10px;
      box-sizing: border-box;
      line-height: 1.18;
      box-shadow: 0 4px 16px rgba(16, 32, 51, .06);
    }

    .budget-gauge strong {
      font-size: clamp(20px, 2.2vw, 30px);
      font-weight: 900;
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    .budget-gauge em {
      margin-top: 4px;
      font-size: 14px;
      font-style: normal;
      font-weight: 900;
      color: var(--gauge-text);
    }

    .budget-gauge small {
      margin-top: 4px;
      font-size: 12px;
      font-weight: 800;
      color: var(--gauge-text);
    }

    .budget-number-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .budget-number-grid div {
      border: 1px solid #edf1f5;
      border-radius: 8px;
      padding: 10px;
      min-width: 0;
    }

    .budget-number-grid span {
      display: block;
      color: var(--budget-muted);
      font-size: 12px;
      font-weight: 800;
    }

    .budget-number-grid strong {
      display: block;
      color: var(--budget-ink);
      font-size: 15px;
      margin-top: 4px;
      overflow-wrap: anywhere;
    }

    .budget-note {
      margin: 0;
      color: var(--budget-muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .budget-status-pill {
      display: inline-flex;
      min-height: 24px;
      align-items: center;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 900;
      background: #e2e8f0;
      color: #334155;
    }

    .budget-status-pill.is-critical,
    .budget-status-pill.is-data {
      background: #fee2e2;
      color: #991b1b;
    }

    .budget-status-pill.is-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .budget-status-pill.is-info {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .budget-status-pill.is-normal {
      background: #dcfce7;
      color: #166534;
    }

    .budget-dashboard-table-wrap {
      overflow: auto;
      border: 1px solid #edf1f5;
      border-radius: 8px;
    }

    .budget-dashboard-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      min-width: 980px;
    }

    .budget-dashboard-table th,
    .budget-dashboard-table td {
      border-bottom: 1px solid #edf1f5;
      padding: 9px 8px;
      text-align: left;
      vertical-align: top;
    }

    .budget-dashboard-table td.is-number,
    .budget-dashboard-table th.is-number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .budget-alert-list {
      display: grid;
      gap: 8px;
    }

    .budget-alert-row {
      border: 1px solid #edf1f5;
      border-radius: 8px;
      padding: 9px;
    }

    .budget-alert-row strong,
    .budget-alert-row span {
      display: block;
    }

    .budget-alert-row span {
      color: #64748b;
      font-size: 12px;
      margin-top: 3px;
    }

    .budget-alert-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }

    .budget-alert-summary div {
      border: 1px solid #edf1f5;
      border-radius: 8px;
      padding: 10px;
    }

    .budget-alert-summary span {
      display: block;
      color: var(--budget-muted);
      font-size: 12px;
      font-weight: 800;
    }

    .budget-alert-summary strong {
      display: block;
      margin-top: 4px;
      color: var(--budget-ink);
      font-size: 18px;
    }

    .budget-show-all {
      margin-top: 10px;
      height: 32px;
      border: 1px solid var(--budget-border);
      border-radius: 8px;
      background: #fff;
      color: var(--budget-ink);
      font: inherit;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }

    .help-panel-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .help-panel-grid article {
      border: 1px solid #d7e0ea;
      border-radius: 8px;
      background: #fff;
      padding: 16px;
    }

    .help-panel-grid h3 {
      margin: 0 0 8px;
      font-size: 16px;
      color: #102033;
    }

    .help-panel-grid p {
      margin: 0;
      color: #475569;
      line-height: 1.5;
      font-size: 13px;
    }

    @media (max-width: 900px) {
      .web07-panel {
        width: calc(100vw - 28px);
      }

      .web07-gantt-box {
        min-height: 420px;
      }

      .budget-flow-grid,
      .budget-flow-grid.is-department-single,
      .budget-flow-grid.is-department-double,
      .help-panel-grid {
        grid-template-columns: 1fr;
      }

      .budget-gauge {
        width: clamp(170px, 58vw, 210px);
      }

      .budget-alert-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureWeb07Panels() {
  if (!els.appShell) return;
  ensureWeb07InlineStyles();

  let dashboard = document.getElementById('web07DashboardPanel');
  if (!dashboard) {
    dashboard = document.createElement('section');
    dashboard.id = 'web07DashboardPanel';
    dashboard.className = 'web07-panel';
    dashboard.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị Dashboard...</p></div>';
    els.appShell.appendChild(dashboard);
  }

  let ganttPanel = document.getElementById('web07GanttPanel');
  if (!ganttPanel) {
    ganttPanel = document.createElement('section');
    ganttPanel.id = 'web07GanttPanel';
    ganttPanel.className = 'web07-panel hidden';
    ganttPanel.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị Gantt...</p></div>';
    els.appShell.appendChild(ganttPanel);
  }

  let budgetPanel = document.getElementById('web07BudgetDashboardPanel');
  if (!budgetPanel) {
    budgetPanel = document.createElement('section');
    budgetPanel.id = 'web07BudgetDashboardPanel';
    budgetPanel.className = 'web07-panel hidden';
    budgetPanel.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị Dashboard ngân sách...</p></div>';
    els.appShell.appendChild(budgetPanel);
  }

  let helpPanel = document.getElementById('web07HelpPanel');
  if (!helpPanel) {
    helpPanel = document.createElement('section');
    helpPanel.id = 'web07HelpPanel';
    helpPanel.className = 'web07-panel hidden';
    helpPanel.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị hướng dẫn sử dụng...</p></div>';
    els.appShell.appendChild(helpPanel);
  }

  let adminPanel = document.getElementById('web07AdminPanel');
  if (!adminPanel) {
    adminPanel = document.createElement('section');
    adminPanel.id = 'web07AdminPanel';
    adminPanel.className = 'web07-panel admin-panel hidden';
    adminPanel.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị Admin...</p></div>';
    els.appShell.appendChild(adminPanel);
  }
}

function showWeb07View(viewName, options = {}) {
  let viewLoadPromise = null;
  let ganttLoadStarted = false;
  qltdActiveView = viewName;
  ensureWeb07Panels();
  if (viewName === 'report') ensureDeptPlanPanel();
  document.body.classList.toggle('qltd-dashboard-mode', viewName === 'dashboard');
  document.body.classList.toggle('qltd-budget-mode', viewName === 'budget');
  document.body.classList.toggle('qltd-gantt-mode', viewName === 'gantt');
  document.body.classList.toggle('qltd-help-mode', viewName === 'help');
  document.body.classList.toggle('qltd-report-mode', viewName === 'report');
  document.body.classList.toggle('qltd-admin-mode', viewName === 'admin');

  const dashboard = document.getElementById('web07DashboardPanel');
  const budgetPanel = document.getElementById('web07BudgetDashboardPanel');
  const ganttPanel = document.getElementById('web07GanttPanel');
  const helpPanel = document.getElementById('web07HelpPanel');
  const adminPanel = document.getElementById('web07AdminPanel');
  const deptPanel = document.getElementById('deptPlanPanel');
  const placeholder = document.querySelector('.placeholder-panel');
  const summary = document.querySelector('.content-grid');

  if (summary) summary.classList.add('hidden');
  if (placeholder) placeholder.classList.add('hidden');
  if (dashboard) dashboard.classList.toggle('hidden', viewName !== 'dashboard');
  if (budgetPanel) budgetPanel.classList.toggle('hidden', viewName !== 'budget');
  if (ganttPanel) ganttPanel.classList.toggle('hidden', viewName !== 'gantt');
  if (helpPanel) helpPanel.classList.toggle('hidden', viewName !== 'help');
  if (adminPanel) adminPanel.classList.toggle('hidden', viewName !== 'admin');
  if (deptPanel) deptPanel.classList.toggle('hidden', viewName !== 'report');

  [NAV_LABELS.workDashboard, NAV_LABELS.budgetDashboard, NAV_LABELS.gantt, NAV_LABELS.help, NAV_LABELS.report, NAV_LABELS.admin].forEach((label) => {
    const button = getNavButtonByLabel(label);
    if (button) button.classList.toggle('active', (
      (label === NAV_LABELS.workDashboard && viewName === 'dashboard') ||
      (label === NAV_LABELS.budgetDashboard && viewName === 'budget') ||
      (label === NAV_LABELS.gantt && viewName === 'gantt') ||
      (label === NAV_LABELS.help && viewName === 'help') ||
      (label === NAV_LABELS.report && viewName === 'report') ||
      (label === NAV_LABELS.admin && viewName === 'admin')
    ));
  });

  if (viewName === 'dashboard') {
    const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
    const needsDashboardData = projectCode && (
      qltdGanttDirtyProjects.has(projectCode) ||
      !qltdDashboardPayload ||
      String(qltdDashboardPayload.projectCode || '') !== String(projectCode)
    );
    if (needsDashboardData) viewLoadPromise = loadDashboardDataForSelectedProject(projectCode);
    else renderDashboardFromGanttData(qltdDashboardPayload);
  }

  if (viewName === 'gantt') {
    const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
    const needsGanttData = projectCode && (
      qltdGanttDirtyProjects.has(projectCode) ||
      !qltdGanttPayload ||
      String(qltdGanttPayload.projectCode || '') !== String(projectCode)
    );
    if (needsGanttData) {
      ganttLoadStarted = true;
      viewLoadPromise = loadGanttDataForSelectedProject(projectCode);
    }
  }

  if (viewName === 'gantt' && !ganttLoadStarted) {
    const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
    if (qltdGanttPayload && String(qltdGanttPayload.projectCode || '') === String(projectCode)) {
      renderGanttPanel(qltdGanttPayload);
    }
  }

  if (viewName === 'report') {
    const projectCode = document.getElementById('projectSelector')?.value || '';
    if (projectCode && !options.skipDataLoad) viewLoadPromise = loadDeptPlansForSelectedProject(projectCode);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (viewName === 'budget') {
    renderBudgetDashboardPanel();
    loadBudgetDashboardForSelectedProject();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (viewName === 'help') {
    renderHelpPanel();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (viewName === 'admin') {
    renderAdminPanel();
    if (!options.skipDataLoad) viewLoadPromise = loadAdminMasterApprovals();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  return viewLoadPromise;
}

function bindWeb07Navigation() {
  ensureTopNavigation();
  const bindings = [
    [NAV_LABELS.workDashboard, 'dashboard'],
    [NAV_LABELS.budgetDashboard, 'budget'],
    [NAV_LABELS.gantt, 'gantt'],
    [NAV_LABELS.help, 'help'],
    [NAV_LABELS.report, 'report'],
    [NAV_LABELS.admin, 'admin']
  ];

  bindings.forEach(([label, viewName]) => {
    const button = getNavButtonByLabel(label);
    if (!button || button.dataset.web07Bound === '1') return;
    button.dataset.web07Bound = '1';
    button.addEventListener('click', () => {
      showWeb07View(viewName);
    });
  });
}

function renderNoProjectBudgetDashboardState() {
  const panel = document.getElementById('web07BudgetDashboardPanel');
  if (!panel) return;
  panel.innerHTML = '<div class="web07-card"><p class="empty-state">Chưa có dự án ACTIVE để xem ngân sách.</p></div>';
}

function normalizeBudgetDeptCode(value) {
  return String(value || '').trim().toUpperCase();
}

async function loadBudgetDashboardForSelectedProject(options = {}) {
  const panel = document.getElementById('web07BudgetDashboardPanel');
  if (!panel) return;
  const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  if (!projectCode) {
    qltdBudgetDashboardView = { loading: false, error: '', data: null, deptCode: '', view: 'project', showAllBusinessAlerts: false, showAllDataAlerts: false };
    renderNoProjectBudgetDashboardState();
    return;
  }

  const seq = ++qltdBudgetDashboardRequestSeq;
  const scope = qltdBudgetDashboardView.view === 'department' ? 'department' : 'project';
  const requestDeptCode = scope === 'department' ? normalizeBudgetDeptCode(qltdBudgetDashboardView.deptCode || '') : '';
  qltdBudgetDashboardView = Object.assign({}, qltdBudgetDashboardView, {
    loading: true,
    error: '',
    projectCode,
    deptCode: requestDeptCode,
    view: scope
  });
  renderBudgetDashboardPanel();

  try {
    const result = await fetchBackendJson('budget_getLiveDashboard', {
      email: currentUserProfile?.email || '',
      projectCode,
      deptCode: requestDeptCode,
      view: scope,
      force: options.force ? '1' : ''
    });
    if (seq !== qltdBudgetDashboardRequestSeq) return;
    if (!result.success) throw new Error(result.message || result.errors?.[0]?.message || result.errors?.[0]?.code || 'Không tải được dashboard ngân sách.');
    const data = result.data || result;
    const responseDeptCode = normalizeBudgetDeptCode(data.department?.deptCode || '');
    let nextDeptCode = '';
    if (scope === 'department') {
      nextDeptCode = requestDeptCode;
      if (responseDeptCode && responseDeptCode !== requestDeptCode) {
        console.warn('Budget dashboard response deptCode mismatch; keeping requested deptCode', {
          requestDeptCode,
          responseDeptCode
        });
      } else if (responseDeptCode) {
        nextDeptCode = responseDeptCode;
      }
    }
    qltdBudgetDashboardView = {
      loading: false,
      error: '',
      data,
      deptCode: nextDeptCode,
      projectCode,
      view: scope,
      showAllBusinessAlerts: qltdBudgetDashboardView.showAllBusinessAlerts || false,
      showAllDataAlerts: qltdBudgetDashboardView.showAllDataAlerts || false
    };
  } catch (error) {
    if (seq !== qltdBudgetDashboardRequestSeq) return;
    qltdBudgetDashboardView = Object.assign({}, qltdBudgetDashboardView, {
      loading: false,
      error: error.message || 'Không tải được dashboard ngân sách.'
    });
  }
  renderBudgetDashboardPanel();
}

function renderBudgetDashboardPanel() {
  const panel = document.getElementById('web07BudgetDashboardPanel');
  if (!panel) return;
  const state = qltdBudgetDashboardView;
  const data = state.data || {};
  const scope = state.view === 'department' ? 'department' : 'project';
  const projectCode = document.getElementById('projectSelector')?.value || state.projectCode || getStoredProjectCode() || '';
  const projectName = data.project?.projectName || qltdProjectRegistry.find((project) => String(project.projectCode) === String(projectCode))?.projectName || '';
  const depts = Array.isArray(data.departments) ? data.departments : [];
  const normalizedDeptCodes = new Set(depts.map((dept) => normalizeBudgetDeptCode(dept.deptCode)).filter(Boolean));
  const stateDeptCode = normalizeBudgetDeptCode(state.deptCode);
  const responseDeptCode = normalizeBudgetDeptCode(data.department?.deptCode);
  const firstDeptCode = normalizeBudgetDeptCode(depts[0]?.deptCode);
  let deptCode = '';
  if (scope === 'department') {
    if (stateDeptCode && (!normalizedDeptCodes.size || normalizedDeptCodes.has(stateDeptCode))) deptCode = stateDeptCode;
    else if (responseDeptCode && normalizedDeptCodes.has(responseDeptCode)) deptCode = responseDeptCode;
    else deptCode = firstDeptCode;
  }
  const selectedDept = depts.find((dept) => normalizeBudgetDeptCode(dept.deptCode) === deptCode) || data.department || null;

  panel.innerHTML = `<div class="budget-dashboard">
    <section class="exec-header">
      <div>
        <p class="exec-eyebrow">Dashboard ngân sách</p>
        <h2>${escapeHtml(projectName || projectCode || 'Dự án')}</h2>
        <p class="exec-subtitle">${escapeHtml(projectCode || '')}${scope === 'department' && selectedDept ? ` · ${escapeHtml(selectedDept.deptName || selectedDept.deptCode || '')}` : ' · Toàn dự án'}${data.updatedAt ? ` · Cập nhật ${escapeHtml(formatWeeklyDateTime(data.updatedAt))}` : ''}</p>
      </div>
      <button id="budgetDashboardRefresh" class="exec-refresh" type="button">${state.loading ? 'Đang tải...' : 'Refresh'}</button>
    </section>
    <section class="budget-filter-row">
      <nav class="budget-scope-tabs" aria-label="Chế độ Dashboard ngân sách">
        <button type="button" data-budget-scope="project" class="${scope === 'project' ? 'active' : ''}">Dashboard dự án</button>
        <button type="button" data-budget-scope="department" class="${scope === 'department' ? 'active' : ''}">Dashboard phòng/ban</button>
      </nav>
      ${scope === 'department' ? `<label>Phòng/Ban<select id="budgetDashboardDeptFilter">${depts.map((dept) => {
        const optionDeptCode = normalizeBudgetDeptCode(dept.deptCode);
        return `<option value="${escapeHtml(optionDeptCode)}" ${optionDeptCode === deptCode ? 'selected' : ''}>${escapeHtml(dept.deptCode || '')} - ${escapeHtml(dept.deptName || dept.deptCode || '')}</option>`;
      }).join('')}</select></label>` : ''}
    </section>
    ${state.error ? `<div class="web07-card"><p class="empty-state">${escapeHtml(state.error)}</p></div>` : ''}
    ${state.loading && !state.data ? '<div class="web07-card"><p class="empty-state">Đang tổng hợp ngân sách...</p></div>' : ''}
    ${data.thu && data.chi ? renderBudgetDashboardContent(data, scope) : ''}
  </div>`;

  const refresh = document.getElementById('budgetDashboardRefresh');
  if (refresh) refresh.onclick = () => loadBudgetDashboardForSelectedProject({ force: true });
  document.querySelectorAll('[data-budget-scope]').forEach((button) => {
    button.onclick = () => {
      const nextScope = button.dataset.budgetScope === 'department' ? 'department' : 'project';
      if (nextScope === qltdBudgetDashboardView.view) return;
      const currentDeptCode = normalizeBudgetDeptCode(qltdBudgetDashboardView.deptCode);
      const nextDeptCode = nextScope === 'department'
        ? (currentDeptCode && normalizedDeptCodes.has(currentDeptCode) ? currentDeptCode : firstDeptCode)
        : '';
      qltdBudgetDashboardView = Object.assign({}, qltdBudgetDashboardView, {
        view: nextScope,
        deptCode: nextDeptCode,
        showAllBusinessAlerts: false,
        showAllDataAlerts: false
      });
      loadBudgetDashboardForSelectedProject({ force: true });
    };
  });
  const deptFilter = document.getElementById('budgetDashboardDeptFilter');
  if (deptFilter) {
    deptFilter.onchange = (event) => {
      const nextDeptCode = normalizeBudgetDeptCode(event.target.value || '');
      qltdBudgetDashboardView = Object.assign({}, qltdBudgetDashboardView, {
        deptCode: nextDeptCode,
        view: 'department',
        showAllBusinessAlerts: false,
        showAllDataAlerts: false
      });
      loadBudgetDashboardForSelectedProject({ force: true });
    };
  }
  bindBudgetAlertShowAllButtons();
}

function renderBudgetDashboardContent(data, scope) {
  const isDepartment = scope === 'department';
  const hasThu = budgetFlowHasValue(data.thu);
  const hasChi = budgetFlowHasValue(data.chi);
  const flowCards = isDepartment
    ? [
      hasThu || !hasChi ? renderBudgetFlowCard('THU', data.thu, 'Kế hoạch dự thu', 'Đã ghi nhận') : '',
      hasChi || !hasThu ? renderBudgetFlowCard('CHI', data.chi, 'Kế hoạch chi', 'Đã thực hiện') : ''
    ].filter(Boolean)
    : [
      renderBudgetFlowCard('THU', data.thu, 'Kế hoạch dự thu', 'Đã ghi nhận'),
      renderBudgetFlowCard('CHI', data.chi, 'Kế hoạch chi', 'Đã thực hiện'),
      renderBudgetBalanceCard(data.balance || {})
    ];
  const gridClass = isDepartment
    ? (flowCards.length === 1 ? 'budget-flow-grid is-department-single' : 'budget-flow-grid is-department-double')
    : 'budget-flow-grid';
  return `
    <section class="${gridClass}">
      ${flowCards.join('')}
    </section>
    <p class="budget-note">Số liệu phản ánh mức thực hiện/ghi nhận ngân sách, chưa phải dòng tiền thực tế.</p>
    ${renderBudgetAlerts(data.alerts || [])}
    ${renderBudgetItemsTable(data.items || [])}
  `;
}

function renderBudgetFlowCard(flowLabel, flow, planLabel, actualLabel) {
  const rate = normalizeBudgetRate(flow?.usageRate);
  const percent = formatBudgetPercent(flow?.usageRate);
  const deg = budgetRingDegrees(rate);
  const tone = flowLabel === 'CHI' ? 'is-chi' : 'is-thu';
  const actual = Number(flow?.actualAmount || 0);
  const over = Number(flow?.overAmount || 0);
  const remainingLabel = flowLabel === 'CHI' ? 'Còn được chi' : 'Còn phải ghi nhận';
  const overLabel = flowLabel === 'CHI' ? 'Vượt trần' : 'Vượt kế hoạch';
  return `<article class="budget-flow-card ${tone}">
    <header><h3>${escapeHtml(flowLabel)}</h3><span class="budget-status-pill is-${over > 0 ? 'warning' : 'normal'}">${escapeHtml(percent)}</span></header>
    <div class="budget-gauge" style="--value: ${deg}deg" title="${escapeHtml(formatWeeklyCurrency(actual))}">
      <span><strong>${escapeHtml(formatCompactBudgetAmount(actual))}</strong><em>${escapeHtml(percent)}</em><small>${escapeHtml(actualLabel)}</small></span>
    </div>
    <div class="budget-number-grid">
      <div><span>${escapeHtml(planLabel)}</span><strong title="${escapeHtml(formatWeeklyCurrency(flow?.planAmount || 0))}">${formatCompactBudgetAmount(flow?.planAmount || 0)}</strong></div>
      <div><span>${escapeHtml(remainingLabel)}</span><strong title="${escapeHtml(formatWeeklyCurrency(flow?.remainingAmount || 0))}">${formatCompactBudgetAmount(flow?.remainingAmount || 0)}</strong></div>
      ${over > 0 ? `<div><span>${escapeHtml(overLabel)}</span><strong title="${escapeHtml(formatWeeklyCurrency(over))}">${formatCompactBudgetAmount(over)}</strong></div>` : ''}
    </div>
  </article>`;
}

function renderBudgetBalanceCard(balance) {
  const actualBalance = Number(balance.actualBalance || 0);
  const tone = actualBalance < 0 ? 'negative' : Math.abs(actualBalance) < 1 ? 'near-zero' : 'positive';
  const coverage = balance.coverageRate === null || balance.coverageRate === undefined ? 'Chưa phát sinh chi' : formatBudgetPercent(balance.coverageRate);
  const deg = balance.coverageRate === null || balance.coverageRate === undefined ? 0 : budgetRingDegrees(normalizeBudgetRate(balance.coverageRate));
  return `<article class="budget-balance-card is-${tone}">
    <header><h3>Cân đối</h3><span class="budget-status-pill is-${tone === 'negative' ? 'critical' : tone === 'near-zero' ? 'warning' : 'normal'}">${escapeHtml(coverage)}</span></header>
    <div class="budget-gauge" style="--value: ${deg}deg" title="${escapeHtml(formatWeeklyCurrency(actualBalance))}">
      <span><strong>${escapeHtml(formatCompactBudgetAmount(actualBalance))}</strong><small>Cân đối thực hiện ngân sách</small></span>
    </div>
    <div class="budget-number-grid">
      <div><span>Cân đối kế hoạch ngân sách</span><strong title="${escapeHtml(formatWeeklyCurrency(balance.plannedBalance || 0))}">${formatCompactBudgetAmount(balance.plannedBalance || 0)}</strong></div>
      <div><span>Tỷ lệ bao phủ chi</span><strong>${escapeHtml(coverage)}</strong></div>
    </div>
  </article>`;
}

function renderBudgetAlerts(alerts) {
  const grouped = groupBudgetAlerts(alerts);
  const summary = summarizeGroupedBudgetAlerts(grouped.all);
  return `
    <section class="budget-alerts-card">
      <header><h3>Cảnh báo ngân sách</h3><span class="budget-status-pill is-${summary.critical ? 'critical' : summary.warning ? 'warning' : summary.info ? 'info' : 'normal'}">${escapeHtml(grouped.business.length)} cảnh báo</span></header>
      ${renderBudgetAlertSummary(summary)}
      ${renderBudgetAlertList(grouped.business, qltdBudgetDashboardView.showAllBusinessAlerts, 'business')}
    </section>
    <section class="budget-alerts-card">
      <header><h3>Cảnh báo dữ liệu</h3><span class="budget-status-pill is-${grouped.data.length ? 'warning' : 'normal'}">${escapeHtml(grouped.data.length)} cảnh báo</span></header>
      ${renderBudgetAlertList(grouped.data, qltdBudgetDashboardView.showAllDataAlerts, 'data')}
    </section>
  `;
}

function renderBudgetAlertSummary(summary) {
  return `<div class="budget-alert-summary">
    <div><span>Nghiêm trọng</span><strong>${escapeHtml(summary.critical)}</strong></div>
    <div><span>Cần xử lý</span><strong>${escapeHtml(summary.warning)}</strong></div>
    <div><span>Cần theo dõi</span><strong>${escapeHtml(summary.info)}</strong></div>
    <div><span>Bình thường</span><strong>${escapeHtml(summary.normal)}</strong></div>
  </div>`;
}

function renderBudgetAlertList(alerts, showAll, kind) {
  if (!alerts.length) return '<p class="exec-empty">Không có cảnh báo.</p>';
  const rows = (showAll ? alerts : alerts.slice(0, 5)).map(renderBudgetAlertRow).join('');
  const button = alerts.length > 5
    ? `<button type="button" class="budget-show-all" data-budget-alert-show="${escapeHtml(kind)}">${showAll ? 'Thu gọn' : 'Xem tất cả'}</button>`
    : '';
  return `<div class="budget-alert-list">${rows}</div>${button}`;
}

function renderBudgetAlertRow(alert) {
  return `<article class="budget-alert-row">
    <strong><span class="budget-status-pill is-${escapeHtml(alert.severityClass)}">${escapeHtml(alert.severityLabel)}</span> ${escapeHtml(alert.flowLabel)}</strong>
    <span>${escapeHtml(alert.itemLabel)}${alert.deptCode ? ` · ${escapeHtml(alert.deptCode)}` : ''}</span>
    <span>${escapeHtml(alert.message)}${alert.valueText ? ` · ${escapeHtml(alert.valueText)}` : ''}</span>
    <span>${escapeHtml(alert.count)} bản ghi được gom</span>
  </article>`;
}

function renderBudgetItemsTable(items) {
  return `<section class="budget-items-card">
    <header><h3>Khoản mục ngân sách</h3><span class="budget-status-pill is-normal">${escapeHtml(items.length)} khoản</span></header>
    <div class="budget-dashboard-table-wrap">
      <table class="budget-dashboard-table">
        <thead><tr><th>THU/CHI</th><th>Phòng/Ban</th><th>Khoản mục</th><th class="is-number">Kế hoạch</th><th class="is-number">Đã ghi nhận/thực hiện</th><th class="is-number">Còn lại</th><th class="is-number">Tỷ lệ</th><th>Trạng thái</th></tr></thead>
        <tbody>${items.map(renderBudgetItemRow).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function renderBudgetItemRow(item) {
  const severity = String(item.severity || 'NORMAL').toLowerCase();
  const rate = formatBudgetPercent(item.usageRate);
  return `<tr>
    <td><span class="budget-flow-badge is-${escapeHtml(String(item.flowType || '').toLowerCase() || 'unknown')}">${escapeHtml(item.flowType || '')}</span></td>
    <td>${escapeHtml(item.deptCode || '')}</td>
    <td><strong title="${escapeHtml(item.budgetItemCode || '')}">${escapeHtml(item.budgetItemName || item.budgetItemCode || '')}</strong></td>
    <td class="is-number" title="${escapeHtml(formatWeeklyCurrency(item.plannedAmount || 0))}">${formatCompactBudgetAmount(item.plannedAmount || 0)}</td>
    <td class="is-number" title="${escapeHtml(formatWeeklyCurrency(item.actualAmount || 0))}">${formatCompactBudgetAmount(item.actualAmount || 0)}</td>
    <td class="is-number" title="${escapeHtml(formatWeeklyCurrency(item.remainingAmount || 0))}">${formatCompactBudgetAmount(item.remainingAmount || 0)}</td>
    <td class="is-number">${escapeHtml(rate)}</td>
    <td><span class="budget-status-pill is-${escapeHtml(severity)}">${escapeHtml(formatBudgetItemStatus(item.statusLabel || severity))}</span></td>
  </tr>`;
}

function budgetFlowHasValue(flow) {
  return Number(flow?.planAmount || 0) > 0 || Number(flow?.actualAmount || 0) > 0;
}

function normalizeBudgetRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function budgetRingDegrees(rate) {
  return Math.max(0, Math.min(360, normalizeBudgetRate(rate) * 360));
}

function formatBudgetPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0%';
  const percent = number * 100;
  const digits = percent < 1 ? 2 : percent < 10 ? 1 : 0;
  return `${percent.toLocaleString('vi-VN', { maximumFractionDigits: digits })}%`;
}

function formatCompactBudgetAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  const sign = number < 0 ? '-' : '';
  const abs = Math.abs(number);
  if (abs >= 1000000000) return `${sign}${(abs / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn`;
  return `${sign}${abs.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}`;
}

function groupBudgetAlerts(alerts = []) {
  const groups = {};
  (alerts || []).forEach((alert) => {
    const mapped = mapBudgetAlert(alert);
    const key = [mapped.category, mapped.normalizedCode, mapped.budgetItemCode, mapped.deptCode].join('|');
    if (!groups[key]) groups[key] = mapped;
    else {
      groups[key].count += 1;
      groups[key].rawAlerts.push(alert);
      if (!groups[key].valueText && mapped.valueText) groups[key].valueText = mapped.valueText;
    }
  });
  const all = Object.values(groups).sort(compareBudgetAlertGroups);
  return {
    all,
    business: all.filter((alert) => alert.category === 'BUSINESS'),
    data: all.filter((alert) => alert.category === 'DATA')
  };
}

function mapBudgetAlert(alert = {}) {
  const normalizedCode = normalizeBudgetAlertCode(alert.code);
  const severity = mapBudgetAlertSeverity(alert, normalizedCode);
  return {
    category: alert.category === 'DATA' ? 'DATA' : 'BUSINESS',
    normalizedCode,
    severity,
    severityClass: severity.toLowerCase(),
    severityLabel: mapBudgetSeverityLabel(severity),
    flowLabel: alert.category === 'DATA' ? 'Dữ liệu' : (alert.flowType || 'Ngân sách'),
    itemLabel: alert.budgetItemName || alert.budgetItemCode || alert.allocationCode || 'Khoản ngân sách',
    deptCode: alert.deptCode || '',
    budgetItemCode: alert.budgetItemCode || '',
    message: mapBudgetAlertMessage(normalizedCode, alert.message),
    valueText: formatBudgetAlertValue(alert),
    count: 1,
    rawAlerts: [alert]
  };
}

function normalizeBudgetAlertCode(code) {
  const key = String(code || '').trim().toUpperCase();
  const aliases = {
    ALLOCATION_NOT_FOUND: 'ITEM_ACTIVE_NO_CONFIRMED_ALLOCATION',
    ITEM_ALLOCATION_MISSING: 'ITEM_ACTIVE_NO_CONFIRMED_ALLOCATION',
    ALLOCATION_NOT_CONFIRMED: 'ITEM_ACTIVE_NO_CONFIRMED_ALLOCATION',
    RAW_WITHOUT_ACTIVE_ITEM: 'RAW_WITHOUT_BUDGET_ITEM',
    RAW_FLOW_MISMATCH: 'FLOW_TYPE_MISMATCH',
    ALLOCATION_FLOW_MISMATCH: 'FLOW_TYPE_MISMATCH',
    RAW_REPORT_ID_DUPLICATE: 'DUPLICATE_REPORT_ID',
    ALLOCATION_CODE_DUPLICATE: 'DUPLICATE_REPORT_ID'
  };
  return aliases[key] || key;
}

function mapBudgetAlertMessage(code, fallback) {
  const labels = {
    RAW_NOT_CONFIRMED: 'Giao dịch chưa được xác nhận',
    RAW_NOT_SYNCED: 'Giao dịch chưa đồng bộ',
    ITEM_ACTIVE_NO_CONFIRMED_ALLOCATION: 'Khoản ngân sách chưa có phân bổ đã chốt',
    RAW_WITHOUT_BUDGET_ITEM: 'Giao dịch chưa gắn khoản ngân sách',
    FLOW_TYPE_MISMATCH: 'Loại THU/CHI không khớp',
    TASK_LINKED_MASTER_MISMATCH: 'Khoản ngân sách không khớp công việc Master',
    INACTIVE_ITEM_HAS_ACTUAL: 'Khoản ngừng hoạt động vẫn phát sinh thực hiện',
    DUPLICATE_REPORT_ID: 'Có nguy cơ trùng bản ghi báo cáo',
    MASTER_TASK_NOT_FOUND: 'Không tìm thấy công việc Master',
    VUOT_TRAN: 'Vượt trần',
    SAP_HET_NGAN_SACH: 'Sắp hết ngân sách',
    CAN_CHU_Y: 'Cần chú ý',
    CHUA_THUC_HIEN: 'Chưa thực hiện',
    CHUA_GHI_NHAN_THU: 'Chưa ghi nhận',
    DAT_KE_HOACH: 'Đạt kế hoạch',
    VUOT_KE_HOACH: 'Vượt kế hoạch'
  };
  return labels[code] || fallback || 'Cảnh báo cần kiểm tra';
}

function mapBudgetAlertSeverity(alert, normalizedCode) {
  const raw = String(alert.severity || '').toUpperCase();
  if (raw === 'CRITICAL' || normalizedCode === 'VUOT_TRAN') return 'CRITICAL';
  if (raw === 'WARNING' || alert.category === 'DATA') return 'WARNING';
  if (raw === 'INFO') return 'INFO';
  return 'NORMAL';
}

function mapBudgetSeverityLabel(severity) {
  const map = {
    CRITICAL: 'Nghiêm trọng',
    WARNING: 'Cần xử lý',
    INFO: 'Cần theo dõi',
    NORMAL: 'Bình thường'
  };
  return map[severity] || map.NORMAL;
}

function compareBudgetAlertGroups(a, b) {
  const rank = { CRITICAL: 0, WARNING: 1, INFO: 2, NORMAL: 3 };
  const severityDiff = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  if (severityDiff) return severityDiff;
  return String(a.itemLabel || '').localeCompare(String(b.itemLabel || ''), 'vi');
}

function summarizeGroupedBudgetAlerts(alerts) {
  const summary = { critical: 0, warning: 0, info: 0, normal: 0 };
  alerts.forEach((alert) => {
    if (alert.severity === 'CRITICAL') summary.critical += 1;
    else if (alert.severity === 'WARNING') summary.warning += 1;
    else if (alert.severity === 'INFO') summary.info += 1;
    else summary.normal += 1;
  });
  return summary;
}

function formatBudgetAlertValue(alert) {
  const amount = alert.actualAmount ?? alert.plannedAmount ?? alert.currentAmount ?? alert.proposedAmount;
  return amount === undefined || amount === null || amount === '' ? '' : formatCompactBudgetAmount(amount);
}

function formatBudgetItemStatus(value) {
  const key = qltdNormalizeTextKey(value);
  const map = {
    chuathuchien: 'Chưa thực hiện',
    chuaghinhan: 'Chưa ghi nhận',
    datkehoach: 'Đạt kế hoạch',
    vuotkehoach: 'Vượt kế hoạch',
    vuottran: 'Vượt trần',
    saphetngansach: 'Sắp hết ngân sách',
    canchuy: 'Cần chú ý',
    trongnguong: 'Trong ngưỡng',
    dangghinhan: 'Đang ghi nhận',
    datablocked: 'Cần xử lý dữ liệu',
    normal: 'Bình thường',
    info: 'Cần theo dõi',
    warning: 'Cần xử lý',
    critical: 'Nghiêm trọng'
  };
  return map[key] || String(value || 'Bình thường');
}

function qltdNormalizeTextKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function bindBudgetAlertShowAllButtons() {
  document.querySelectorAll('[data-budget-alert-show]').forEach((button) => {
    button.onclick = () => {
      const kind = button.dataset.budgetAlertShow;
      if (kind === 'business') {
        qltdBudgetDashboardView.showAllBusinessAlerts = !qltdBudgetDashboardView.showAllBusinessAlerts;
      } else if (kind === 'data') {
        qltdBudgetDashboardView.showAllDataAlerts = !qltdBudgetDashboardView.showAllDataAlerts;
      }
      renderBudgetDashboardPanel();
    };
  });
}

function renderHelpPanel() {
  const panel = document.getElementById('web07HelpPanel');
  if (!panel) return;
  panel.innerHTML = `<div class="web07-card">
    <section class="exec-header"><div><p class="exec-eyebrow">Hướng dẫn sử dụng</p><h2>QLTD Entiz DEV</h2><p class="exec-subtitle">Các luồng chính đang dùng chung dự án được chọn ở thanh điều hướng.</p></div></section>
    <section class="help-panel-grid">
      <article><h3>Dashboard công việc</h3><p>Theo dõi tiến độ, quá hạn, mốc chính và kết quả tháng từ dữ liệu Gantt hiện hành.</p></article>
      <article><h3>Dashboard ngân sách</h3><p>Theo dõi THU/CHI, cân đối và cảnh báo từ Items, Allocations, Raw đã xác nhận.</p></article>
      <article><h3>Lập & cập nhật công việc</h3><p>Cập nhật tuần theo phòng/ban, gắn ngân sách từng khoản và lưu một lần cho công việc.</p></article>
    </section>
  </div>`;
}

function getMasterApprovalDraft(updateId) {
  return qltdAdminApprovalView.reviewDrafts?.[String(updateId || '')] || {};
}

function updateMasterApprovalDraft(updateId, patch = {}) {
  const key = String(updateId || '');
  if (!key) return;
  qltdAdminApprovalView = {
    ...qltdAdminApprovalView,
    reviewDrafts: {
      ...(qltdAdminApprovalView.reviewDrafts || {}),
      [key]: { ...getMasterApprovalDraft(key), ...patch }
    }
  };
}

function removeMasterApprovalDraft(updateId) {
  const key = String(updateId || '');
  const reviewDrafts = { ...(qltdAdminApprovalView.reviewDrafts || {}) };
  delete reviewDrafts[key];
  qltdAdminApprovalView = { ...qltdAdminApprovalView, reviewDrafts };
}

function isNotificationApprovalHighlight(section, item) {
  const highlight = qltdNotificationHighlight;
  if (!highlight || highlight.kind !== 'approval' || highlight.section !== section) return false;
  if (highlight.targetId) return String(item?.updateId || '') === String(highlight.targetId);
  return notificationMatchesApprovalItem(highlight.notification || {}, item);
}

function renderAdminPanel() {
  const panel = document.getElementById('web07AdminPanel');
  if (!panel) return;
  if (!canApprove()) {
    panel.innerHTML = '<div class="web07-card"><p class="empty-state">Bạn không có quyền phê duyệt.</p></div>';
    return;
  }
  const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  if (normalizeRoleKey(currentUserProfile?.role) === 'EDITOR' || hasDelegatedDeptManagerScope(projectCode)) {
    renderPbDetailApprovalPanel(panel);
    return;
  }
  const state = qltdAdminApprovalView;
  panel.innerHTML = `<div class="web07-card admin-approval-card">
    <div class="admin-approval-heading">
      <div><span>Weekly workflow · ${state.approvals.length} yêu cầu đang chờ</span><h2>YÊU CẦU CẬP NHẬT HOÀN THÀNH MASTER</h2><p>Duyệt sẽ cập nhật Master. Tiến độ liên kết chưa được tính lại và dự án sẽ chuyển sang trạng thái cần tính lại.</p></div>
      <button type="button" class="secondary-button" id="reloadMasterApprovalsButton" ${state.loading || state.reviewing ? 'disabled' : ''}>${state.loading ? 'Đang tải...' : 'Tải lại'}</button>
    </div>
    ${state.error ? `<p class="weekly-update-note is-error">${escapeHtml(state.error)}</p>` : ''}
    ${state.notice ? `<p class="weekly-update-note">${escapeHtml(state.notice)}</p>` : ''}
    ${renderAdminMasterApprovals(state.approvals || [])}
  </div>`;
  const reload = document.getElementById('reloadMasterApprovalsButton');
  if (reload) reload.onclick = () => { if (!qltdAdminApprovalView.reviewing) loadAdminMasterApprovals({ force: true }); };
  document.querySelectorAll('[data-master-approval-approve]').forEach((button) => {
    button.onclick = () => {
      const updateId = button.dataset.masterApprovalApprove || '';
      const impactMode = button.closest('tr')?.querySelector('[data-master-impact-mode]')?.value || '';
      if (!impactMode) {
        qltdAdminApprovalView = { ...qltdAdminApprovalView, error: 'Vui lòng chọn mức ảnh hưởng đến công việc liên kết sau.' };
        renderAdminPanel();
        return;
      }
      updateMasterApprovalDraft(updateId, { impactMode });
      reviewMasterApproval(updateId, 'APPROVED', '', { impactMode });
    };
  });
  document.querySelectorAll('[data-master-impact-mode]').forEach((select) => {
    select.onchange = () => updateMasterApprovalDraft(select.dataset.masterImpactMode || '', { impactMode: select.value || '' });
  });
  document.querySelectorAll('[data-master-approval-reject]').forEach((button) => {
    button.onclick = () => {
      const updateId = button.dataset.masterApprovalReject || '';
      const reason = window.prompt('Nhập lý do không duyệt yêu cầu hoàn thành MASTER:', getMasterApprovalDraft(updateId).reviewReason || '');
      if (!String(reason || '').trim()) return;
      updateMasterApprovalDraft(updateId, { reviewReason: String(reason).trim() });
      reviewMasterApproval(updateId, 'REJECTED', reason);
    };
  });
}

function renderAdminMasterApprovals(approvals) {
  if (!approvals.length) return '<p class="empty-state">Không có yêu cầu PENDING.</p>';
  const reviewing = qltdAdminApprovalView.reviewing;
  return `<div class="admin-approval-table-wrap"><table class="dept-plan-table admin-approval-table"><thead><tr><th>Dự án</th><th>Phòng/Ban</th><th>WBS</th><th>Công việc</th><th>Trạng thái đề xuất</th><th>Ngày HT đề xuất</th><th>Người gửi</th><th>Ảnh hưởng liên kết</th><th>Trạng thái duyệt</th><th>Thao tác</th></tr></thead><tbody>${approvals.map((item) => {
    const isCurrent = reviewing?.updateId === item.updateId;
    const approveLabel = isCurrent && reviewing.approvalStatus === 'APPROVED' ? 'Đang duyệt...' : 'Duyệt';
    const rejectLabel = isCurrent && reviewing.approvalStatus === 'REJECTED' ? 'Đang trả lại...' : 'Không duyệt';
    const disabled = reviewing ? 'disabled' : '';
    const impactMode = qltdAdminApprovalView.reviewDrafts?.[String(item.updateId || '')]?.impactMode || '';
    return `<tr class="${isNotificationApprovalHighlight('MASTER', item) ? 'is-notification-target' : ''}" data-notification-approval-id="${escapeHtml(item.updateId || '')}"><td>${escapeHtml(item.projectCode || '')}</td><td>${escapeHtml(item.deptCode || '')}</td><td class="mono">${escapeHtml(item.wbs || '')}</td><td>${escapeHtml(item.taskName || item.itemId || '')}</td><td>${escapeHtml(item.taskStatus || '')} · ${escapeHtml(item.progressEnd ?? '')}%</td><td>${escapeHtml(formatIsoDateVi(item.actualFinish || '') || '—')}</td><td>${escapeHtml(item.updatedBy || '')}</td><td><select data-master-impact-mode="${escapeHtml(item.updateId || '')}"><option value="">Chọn ảnh hưởng</option><option value="KEEP_PLAN" ${impactMode === 'KEEP_PLAN' ? 'selected' : ''}>Không ảnh hưởng đến công việc liên kết sau</option><option value="PROPAGATE_ACTUAL" ${impactMode === 'PROPAGATE_ACTUAL' ? 'selected' : ''}>Có ảnh hưởng đến công việc liên kết sau</option></select></td><td><span class="approval-status-badge is-${escapeHtml(String(item.approvalStatus || '').toLowerCase())}">${escapeHtml(formatApprovalStatus(item.approvalStatus))}</span></td><td><div class="admin-approval-actions"><button type="button" class="weekly-update-button" data-master-approval-approve="${escapeHtml(item.updateId || '')}" ${disabled}>${approveLabel}</button><button type="button" class="secondary-button" data-master-approval-reject="${escapeHtml(item.updateId || '')}" ${disabled}>${rejectLabel}</button></div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function formatApprovalStatus(status, compact = false) {
  const code = String(status || '').toUpperCase();
  if (compact) {
    if (code === 'PENDING') return 'Chờ duyệt';
    if (code === 'APPROVED') return 'Đã duyệt';
    if (code === 'REJECTED') return 'Trả lại';
    return '';
  }
  if (code === 'PENDING') return 'Chờ duyệt';
  if (code === 'APPROVED') return 'Đã duyệt';
  if (code === 'REJECTED') return 'Trả lại';
  return '—';
}

async function loadAdminMasterApprovals() {
  if (!canApprove()) return;
  const selectedProjectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  if (normalizeRoleKey(currentUserProfile?.role) === 'EDITOR' || hasDelegatedDeptManagerScope(selectedProjectCode)) {
    return loadPbDetailApprovals();
  }
  const seq = ++qltdAdminApprovalRequestSeq;
  const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  qltdAdminApprovalView = { ...qltdAdminApprovalView, projectCode, loading: true, error: '', approvals: qltdAdminApprovalView.approvals || [] };
  renderAdminPanel();
  try {
    const result = await fetchBackendJson('weekly_masterapprovals_get', { email: currentUserProfile?.email || '', projectCode, status: 'PENDING' }, { auth: true });
    if (seq !== qltdAdminApprovalRequestSeq) return;
    if (!result.success) throw new Error(result.message || result.error?.message || result.code || result.error?.code || 'Không tải được yêu cầu duyệt.');
    const data = result.data || result;
    qltdAdminApprovalView = { ...qltdAdminApprovalView, projectCode, loading: false, error: '', approvals: Array.isArray(data.approvals) ? data.approvals : [] };
  } catch (error) {
    if (seq !== qltdAdminApprovalRequestSeq) return;
    qltdAdminApprovalView = { ...qltdAdminApprovalView, projectCode, loading: false, error: error.message || 'Không tải được yêu cầu duyệt.', approvals: [] };
  }
  renderAdminPanel();
}

function renderPbDetailApprovalPanel(panel) {
  const state = qltdPbDetailApprovalView;
  panel.innerHTML = `<div class="web07-card admin-approval-card">
    <div class="admin-approval-heading">
      <div><span>Weekly workflow · ${state.approvals.length} yêu cầu đang chờ</span><h2>CẬP NHẬT PB_DETAIL CHỜ DUYỆT</h2><p>Duyệt sẽ ghi tiến độ và trạng thái đề xuất vào PB_DETAIL chính thức. Trả lại không thay đổi dữ liệu chính thức.</p></div>
      <button type="button" class="secondary-button" id="reloadPbDetailApprovalsButton" ${state.loading || state.reviewing ? 'disabled' : ''}>${state.loading ? 'Đang tải...' : 'Tải lại'}</button>
    </div>
    ${state.error ? `<p class="weekly-update-note is-error">${escapeHtml(state.error)}</p>` : ''}
    ${renderPbDetailApprovals(state.approvals || [])}
  </div>`;
  const reload = document.getElementById('reloadPbDetailApprovalsButton');
  if (reload) reload.onclick = () => { if (!qltdPbDetailApprovalView.reviewing) loadPbDetailApprovals({ force: true }); };
  document.querySelectorAll('[data-pb-detail-approval-approve]').forEach((button) => {
    button.onclick = () => reviewPbDetailApproval(button.dataset.pbDetailApprovalApprove || '', 'APPROVED');
  });
  document.querySelectorAll('[data-pb-detail-approval-reject]').forEach((button) => {
    button.onclick = () => {
      const reason = window.prompt('Nhập lý do trả lại cập nhật PB_DETAIL:', '');
      if (!String(reason || '').trim()) return;
      reviewPbDetailApproval(button.dataset.pbDetailApprovalReject || '', 'REJECTED', String(reason).trim());
    };
  });
}

function renderPbDetailApprovals(approvals) {
  if (!approvals.length) return '<p class="empty-state">Không có cập nhật PB_DETAIL đang chờ duyệt.</p>';
  const reviewing = qltdPbDetailApprovalView.reviewing;
  return `<div class="admin-approval-table-wrap"><table class="dept-plan-table admin-approval-table"><thead><tr><th>Dự án</th><th>Mã/WBS</th><th>Công việc</th><th>Người gửi</th><th>Thời điểm</th><th>Chính thức</th><th>Đề xuất</th><th>Kết quả tuần</th><th>Vấn đề/Giải pháp</th><th>Thao tác</th></tr></thead><tbody>${approvals.map((item) => {
    const isCurrent = reviewing?.updateId === item.updateId;
    const disabled = reviewing ? 'disabled' : '';
    const approveLabel = isCurrent && reviewing.approvalStatus === 'APPROVED' ? 'Đang duyệt...' : 'Duyệt';
    const rejectLabel = isCurrent && reviewing.approvalStatus === 'REJECTED' ? 'Đang trả lại...' : 'Trả lại';
    return `<tr class="${isNotificationApprovalHighlight('PB_DETAIL', item) ? 'is-notification-target' : ''}" data-notification-approval-id="${escapeHtml(item.updateId || '')}"><td>${escapeHtml(item.projectCode || '')}</td><td class="mono">${escapeHtml(item.wbs || item.itemId || '')}</td><td>${escapeHtml(item.taskName || item.itemId || '')}</td><td>${escapeHtml(item.updatedBy || '')}</td><td>${escapeHtml(formatWeeklyDateTime(item.updatedAt))}</td><td>${escapeHtml(item.officialProgress ?? 0)}% · ${escapeHtml(item.officialStatus || '—')}</td><td>${escapeHtml(item.progressEnd ?? 0)}% · ${escapeHtml(item.taskStatus || '—')}</td><td>${escapeHtml(item.thisWeekResult || '—')}</td><td>${escapeHtml(item.issue || '—')}<br><small>${escapeHtml(item.recommendation || '—')}</small></td><td><div class="admin-approval-actions"><button type="button" class="weekly-update-button" data-pb-detail-approval-approve="${escapeHtml(item.updateId || '')}" ${disabled}>${approveLabel}</button><button type="button" class="secondary-button" data-pb-detail-approval-reject="${escapeHtml(item.updateId || '')}" ${disabled}>${rejectLabel}</button></div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

async function loadPbDetailApprovals() {
  const selectedProjectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  if (normalizeRoleKey(currentUserProfile?.role) !== 'EDITOR' && !hasDelegatedDeptManagerScope(selectedProjectCode)) return;
  const seq = ++qltdPbDetailApprovalRequestSeq;
  const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  qltdPbDetailApprovalView = { ...qltdPbDetailApprovalView, projectCode, loading: true, error: '' };
  renderAdminPanel();
  try {
    const result = await fetchBackendJson('weekly_pbdetailapprovals_get', {
      email: currentUserProfile?.email || '',
      projectCode,
      status: 'PENDING'
    }, { auth: true });
    if (seq !== qltdPbDetailApprovalRequestSeq) return;
    if (!result.success) throw new Error(getBackendErrorMessage(result, 'Không tải được cập nhật PB_DETAIL chờ duyệt.'));
    const data = result.data || result;
    qltdPbDetailApprovalView = { ...qltdPbDetailApprovalView, projectCode, loading: false, error: '', approvals: Array.isArray(data.approvals) ? data.approvals : [] };
  } catch (error) {
    if (seq !== qltdPbDetailApprovalRequestSeq) return;
    qltdPbDetailApprovalView = { ...qltdPbDetailApprovalView, projectCode, loading: false, error: error.message || 'Không tải được cập nhật PB_DETAIL chờ duyệt.', approvals: [] };
  }
  renderAdminPanel();
}

async function reviewPbDetailApproval(updateId, approvalStatus, reviewReason = '') {
  if (!updateId || qltdPbDetailApprovalView.reviewing) return;
  const sourceProjectCode = qltdPbDetailApprovalView.projectCode;
  const reviewSeq = ++qltdPbDetailApprovalReviewSeq;
  qltdPbDetailApprovalView = {
    ...qltdPbDetailApprovalView,
    error: '',
    reviewing: { seq: reviewSeq, updateId, approvalStatus }
  };
  renderAdminPanel();
  try {
    const target = (qltdPbDetailApprovalView.approvals || []).find((item) => item.updateId === updateId) || {};
    const result = await postBackendJson({
      action: 'weekly_pbdetailapproval_review',
      email: currentUserProfile?.email || '',
      projectCode: target.projectCode || qltdPbDetailApprovalView.projectCode || '',
      deptCode: target.deptCode || '',
      updateId,
      approvalStatus,
      reviewReason
    });
    if (!result.success) {
      if (getBackendErrorCode(result) === 'APPROVAL_NOT_PENDING') {
        if (qltdPbDetailApprovalView.projectCode === sourceProjectCode) {
          qltdPbDetailApprovalView = {
            ...qltdPbDetailApprovalView,
            approvals: (qltdPbDetailApprovalView.approvals || []).filter((item) => item.updateId !== updateId),
            error: 'Yêu cầu này đã được người khác xử lý.'
          };
        }
        return;
      }
      const backendError = new Error(getBackendErrorMessage(result, 'Không cập nhật được trạng thái duyệt.'));
      backendError.backendResult = result;
      throw backendError;
    }
    const data = result.data || result;
    const approval = data.approval || {};
    const local = applyWeeklySavedUpdateToView(approval, approval);
    if (!local.applied && approval.projectCode && approval.deptCode && approval.weekCode) {
      invalidateWeeklyTaskCacheKey(getWeeklyTaskCacheKey(approval.projectCode, approval.deptCode, approval.weekCode));
    }
    if (qltdPbDetailApprovalView.projectCode === sourceProjectCode) {
      qltdPbDetailApprovalView = {
        ...qltdPbDetailApprovalView,
        approvals: (qltdPbDetailApprovalView.approvals || []).filter((item) => item.updateId !== updateId),
        error: ''
      };
    }
  } catch (error) {
    if (qltdPbDetailApprovalView.reviewing?.seq === reviewSeq) {
      qltdPbDetailApprovalView = { ...qltdPbDetailApprovalView, error: error.message || 'Không cập nhật được trạng thái duyệt.' };
    }
  } finally {
    if (qltdPbDetailApprovalView.reviewing?.seq === reviewSeq) {
      qltdPbDetailApprovalView = { ...qltdPbDetailApprovalView, reviewing: null };
      renderAdminPanel();
    }
  }
}

async function selectNotificationProject(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code) return false;
  if (qltdProjectsLoadPromise) await qltdProjectsLoadPromise;
  if (!qltdProjectRegistry.length) {
    qltdProjectsLoadPromise = loadProjectsForSelector();
    await qltdProjectsLoadPromise;
  }
  const selector = document.getElementById('projectSelector');
  const allowedProject = qltdProjectRegistry.find((project) => String(project.projectCode || '').toUpperCase() === code.toUpperCase());
  const selectedCode = String(allowedProject?.projectCode || '');
  const allowed = !!selectedCode;
  if (!selector || !allowed) return false;
  selector.value = selectedCode;
  setStoredProjectCode(selectedCode);
  return selector.value === selectedCode;
}

function notificationMatchesApprovalItem(notification, item) {
  const sourceKeys = [notification.sourceRequestId, notification.entityId].filter(Boolean);
  if (sourceKeys.includes(String(item?.updateId || ''))) return true;
  if (!notification.itemKey || String(item?.itemId || '') !== notification.itemKey) return false;
  return !notification.departmentCode || String(item?.deptCode || '').toUpperCase() === String(notification.departmentCode || '').toUpperCase();
}

function scrollToNotificationTarget(kind, targetId) {
  window.setTimeout(() => {
    const attribute = kind === 'approval' ? 'data-notification-approval-id' : 'data-notification-weekly-key';
    const target = Array.from(document.querySelectorAll(`[${attribute}]`))
      .find((element) => element.getAttribute(attribute) === String(targetId || ''));
    if (!target) return;
    target.classList.add('is-notification-target');
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 40);
}

async function navigateNotificationApproval(notification, section, navigationSeq) {
  const role = normalizeRoleKey(currentUserProfile?.role);
  const delegatedManager = section === 'PB_DETAIL' &&
    hasDelegatedDeptManagerScope(notification.projectCode, notification.departmentCode);
  if ((section === 'PB_DETAIL' && role !== 'EDITOR' && !delegatedManager) || (section === 'MASTER' && !['ADMIN', 'PMO'].includes(role))) {
    return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  }
  if (!await selectNotificationProject(notification.projectCode)) {
    showWeb07View('admin', { skipDataLoad: true });
    return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  }
  if (!isNotificationNavigationCurrent(navigationSeq)) return { success: false, stale: true, message: '' };
  if (section === 'PB_DETAIL') qltdSelectedDeptCode = String(notification.departmentCode || '');
  qltdNotificationHighlight = { kind: 'approval', section, notification };
  await showWeb07View('admin');
  if (!isNotificationNavigationCurrent(navigationSeq)) return { success: false, stale: true, message: '' };
  const approvals = section === 'PB_DETAIL' ? qltdPbDetailApprovalView.approvals : qltdAdminApprovalView.approvals;
  const target = (approvals || []).find((item) => notificationMatchesApprovalItem(notification, item));
  if (!target) {
    return {
      success: false,
      message: notification.status === 'RESOLVED' ? QLTD_NOTIFICATION_RESOLVED_MESSAGE : QLTD_NOTIFICATION_FALLBACK_MESSAGE
    };
  }
  qltdNotificationHighlight = { kind: 'approval', section, notification, targetId: target.updateId };
  renderAdminPanel();
  scrollToNotificationTarget('approval', target.updateId);
  return { success: true, message: 'Đã mở yêu cầu chờ duyệt.' };
}

async function navigateNotificationWeekly(notification, openEditor, navigationSeq) {
  if (!await selectNotificationProject(notification.projectCode)) {
    qltdReportSubTab = 'weekly';
    showWeb07View('report', { skipDataLoad: true });
    return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  }
  if (!isNotificationNavigationCurrent(navigationSeq)) return { success: false, stale: true, message: '' };
  const weekId = getNotificationWeekId(notification);
  if (!weekId) {
    qltdReportSubTab = 'weekly';
    showWeb07View('report', { skipDataLoad: true });
    return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  }
  qltdReportSubTab = 'weekly';
  qltdSelectedWeekId = weekId;
  qltdNotificationHighlight = { kind: 'weekly', notification };
  await showWeb07View('report');
  if (!isNotificationNavigationCurrent(navigationSeq)) return { success: false, stale: true, message: '' };
  const payload = qltdDeptPlanPayload;
  if (!payload?.success || String(payload.projectCode || '').toUpperCase() !== String(notification.projectCode || '').toUpperCase()) {
    return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  }
  const departments = payload.departments || [];
  const department = notification.departmentCode
    ? departments.find((item) => String(item.deptCode || item.sheetName || '').toUpperCase() === String(notification.departmentCode || '').toUpperCase())
    : departments[0];
  if (!department) return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  qltdSelectedDeptCode = department.deptCode || department.sheetName || '';
  const deptSelector = document.getElementById('deptSelector');
  if (deptSelector) deptSelector.value = qltdSelectedDeptCode;
  qltdReportSubTab = 'weekly';
  qltdSelectedWeekId = weekId;
  qltdSelectedWeeklyItemKey = '';
  qltdWeeklyEditingItemKey = '';
  qltdWeeklyNotificationDetailItemKey = '';
  renderSelectedDeptPlan();
  await loadWeeklyTaskDataForCurrent();
  if (!isNotificationNavigationCurrent(navigationSeq)) return { success: false, stale: true, message: '' };
  if (qltdWeeklyTaskView.accessDenied || qltdWeeklyTaskView.error) {
    return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  }
  const update = (qltdWeeklyTaskView.updates || []).find((item) =>
    [notification.sourceRequestId, notification.entityId].filter(Boolean).includes(String(item.updateId || ''))
  ) || (qltdWeeklyTaskView.updates || []).find((item) => String(item.itemId || '') === notification.itemKey);
  const itemId = String(update?.itemId || notification.itemKey || '');
  const item = (qltdWeeklyTaskView.items || []).find((candidate) => String(candidate.itemId || '') === itemId);
  if (!item || !update) return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
  const itemKey = `${item.itemType}:${item.itemId}`;
  qltdWeeklyWorkspaceTab = item.itemType === 'PB_DETAIL' ? 'tasks' : 'objectives';
  qltdSelectedWeeklyItemKey = itemKey;
  if (openEditor) {
    if (!canUpdateWeeklyItem(item, qltdWeeklyTaskView.capabilities)) {
      qltdWeeklyNotificationDetailItemKey = itemKey;
      renderWeeklyTaskRegion();
      return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
    }
    qltdWeeklyEditingItemKey = itemKey;
  } else {
    qltdWeeklyNotificationDetailItemKey = itemKey;
  }
  qltdNotificationHighlight = { kind: 'weekly', notification, targetId: itemKey };
  renderWeeklyTaskRegion();
  scrollToNotificationTarget('weekly', itemKey);
  return { success: true, message: openEditor ? 'Đã mở lại cập nhật bị trả lại.' : 'Đã mở chi tiết cập nhật đã duyệt.' };
}

async function navigateNotificationDeepLink(notification, navigationSeq) {
  const kind = getNotificationDeepLinkKind(notification?.type);
  if (kind === 'PB_APPROVAL') return navigateNotificationApproval(notification, 'PB_DETAIL', navigationSeq);
  if (kind === 'MASTER_APPROVAL') return navigateNotificationApproval(notification, 'MASTER', navigationSeq);
  if (kind === 'WEEKLY_APPROVED') return navigateNotificationWeekly(notification, false, navigationSeq);
  if (kind === 'WEEKLY_REJECTED') return navigateNotificationWeekly(notification, true, navigationSeq);
  return { success: false, message: QLTD_NOTIFICATION_FALLBACK_MESSAGE };
}

async function reviewMasterApproval(updateId, approvalStatus, reviewReason = '', reviewOptions = {}) {
  if (!updateId || qltdAdminApprovalView.reviewing) return;
  const impactMode = String(reviewOptions.impactMode || '').trim().toUpperCase();
  if (approvalStatus === 'APPROVED') {
    if (!['KEEP_PLAN', 'PROPAGATE_ACTUAL'].includes(impactMode)) {
      qltdAdminApprovalView = { ...qltdAdminApprovalView, error: 'Vui lòng chọn mức ảnh hưởng đến công việc liên kết sau.' };
      renderAdminPanel();
      return;
    }
    const ok = window.confirm('Hệ thống chỉ cập nhật Master. Tiến độ công việc liên kết chưa được tính lại và dự án sẽ ở trạng thái cần tính lại. Tiếp tục?');
    if (!ok) return;
  }
  const approval = (qltdAdminApprovalView.approvals || []).find((item) => item.updateId === updateId) || {};
  const sourceProjectCode = qltdAdminApprovalView.projectCode;
  const reviewSeq = ++qltdAdminApprovalReviewSeq;
  const draftPatch = { reviewReason: String(reviewReason || '').trim() };
  if (approvalStatus === 'APPROVED') {
    draftPatch.impactMode = impactMode;
  }
  updateMasterApprovalDraft(updateId, draftPatch);
  qltdAdminApprovalView = {
    ...qltdAdminApprovalView,
    error: '',
    notice: '',
    reviewing: { seq: reviewSeq, updateId, approvalStatus }
  };
  renderAdminPanel();
  try {
    const result = await postBackendJson({
      action: 'weekly_masterapproval_review',
      email: currentUserProfile?.email || '',
      updateId,
      approvalStatus,
      reviewReason,
      impactMode: approvalStatus === 'APPROVED' ? impactMode : ''
    });
    if (!result.success) {
      if (getBackendErrorCode(result) === 'APPROVAL_NOT_PENDING') {
        markMasterApprovalDataDirty(result.data || result, approval);
        removeMasterApprovalDraft(updateId);
        if (qltdAdminApprovalView.projectCode === sourceProjectCode) {
          qltdAdminApprovalView = {
            ...qltdAdminApprovalView,
            approvals: (qltdAdminApprovalView.approvals || []).filter((item) => item.updateId !== updateId),
            error: 'Yêu cầu này đã được người khác xử lý.'
          };
        }
        return;
      }
      const backendError = new Error(formatMasterApprovalBackendError(result, 'Không cập nhật được trạng thái duyệt.'));
      backendError.backendResult = result;
      throw backendError;
    }
    const data = result.data || result;
    markMasterApprovalDataDirty(data, approval);
    removeMasterApprovalDraft(updateId);
    if (qltdAdminApprovalView.projectCode === sourceProjectCode) {
      qltdAdminApprovalView = {
        ...qltdAdminApprovalView,
        approvals: (qltdAdminApprovalView.approvals || []).filter((item) => item.updateId !== updateId),
        error: '',
        notice: approvalStatus === 'APPROVED' ? 'Tiến độ dự án chưa được tính lại.' : ''
      };
    }
  } catch (error) {
    if (qltdAdminApprovalView.reviewing?.seq === reviewSeq) {
      qltdAdminApprovalView = {
        ...qltdAdminApprovalView,
        error: error.message || 'Không cập nhật được trạng thái duyệt.'
      };
    }
  } finally {
    if (qltdAdminApprovalView.reviewing?.seq === reviewSeq) {
      qltdAdminApprovalView = { ...qltdAdminApprovalView, reviewing: null };
      renderAdminPanel();
    }
  }
}

function formatMasterApprovalBackendError(result, fallback) {
  const message = getBackendErrorMessage(result, fallback);
  const errorCode = getBackendErrorCode(result);
  const stage = String(result?.stage || result?.meta?.stage || result?.data?.stage || '').trim();
  return [message, errorCode ? `errorCode: ${errorCode}` : '', stage ? `stage: ${stage}` : ''].filter(Boolean).join(' · ');
}

function markMasterApprovalDataDirty(result, fallbackApproval = {}) {
  const approval = result?.approval || fallbackApproval || {};
  const projectCode = result?.affectedProjectCode || approval.projectCode || '';
  const deptCode = approval.deptCode || '';
  const weekCode = approval.weekCode || '';
  if (result?.approval && projectCode && deptCode && weekCode) {
    const local = applyWeeklySavedUpdateToView(approval, approval);
    if (!local.applied) invalidateWeeklyTaskCacheKey(getWeeklyTaskCacheKey(projectCode, deptCode, weekCode));
  } else if (projectCode && deptCode && weekCode) {
    invalidateWeeklyTaskCacheKey(getWeeklyTaskCacheKey(projectCode, deptCode, weekCode));
  }
  if (projectCode) qltdGanttDirtyProjects.add(projectCode);
  if (projectCode) {
    qltdProjectScheduleStates.set(String(projectCode), {
      projectCode: String(projectCode),
      scheduleState: 'DIRTY',
      reason: 'WEEKLY_MASTER_APPROVED',
      markedAt: result?.masterSync?.scheduleMarkedAt || new Date().toISOString(),
      recalculatedAt: '',
      error: ''
    });
  }
  if (projectCode && result?.masterWriteback?.ganttCacheInvalidated === false) qltdGanttForceRefreshProjects.add(projectCode);
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getDefaultMonthCode(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function toIsoDateLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function ensureDeptPlanInlineStyles() {
  if (document.getElementById('deptPlanInlineStyles')) return;

  const style = document.createElement('style');
  style.id = 'deptPlanInlineStyles';
  style.textContent = `
    .dept-plan-period-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin: 12px 0 14px;
      padding: 10px 12px;
      border: 1px solid #bfdbfe;
      border-left: 4px solid var(--qltd-period-accent);
      border-radius: 14px;
      background: #f8fbff;
    }

    .dept-plan-period-toolbar input[type="month"] {
      min-width: 170px;
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 0 10px;
      background: #ffffff;
      font-weight: 600;
      color: #0f172a;
    }

    .week-period-section {
      margin: 8px 0 18px;
      padding: 14px;
      border: 1px solid #bfdbfe;
      border-left: 4px solid var(--qltd-period-accent);
      border-radius: 16px;
      background: #f8fbff;
    }

    .week-period-section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .week-period-kicker {
      font-size: 11px;
      color: #64748b;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .week-period-title-main {
      margin-top: 3px;
      color: #0f172a;
      font-weight: 800;
      font-size: 15px;
    }

    .week-period-legend {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .week-period-chip {
      display: inline-flex;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 700;
      background: #e0f2fe;
      color: #075985;
      border: 1px solid #bae6fd;
      white-space: nowrap;
    }

    .week-period-chip.partial {
      background: #fff7ed;
      color: #9a3412;
      border-color: #fed7aa;
    }

    .week-period-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 10px;
    }

    .week-period-card {
      border: 1px solid #dbe6f1;
      border-radius: 14px;
      background: #ffffff;
      padding: 12px;
      box-shadow: 0 6px 16px rgba(15, 23, 42, .05);
    }

    .week-period-card.is-selected {
      border-color: var(--qltd-period-accent);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, .12);
    }

    .week-period-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .week-period-badge {
      display: inline-flex;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 800;
      background: #ecfeff;
      color: #0f766e;
      border: 1px solid #99f6e4;
    }

    .week-period-days {
      font-size: 12px;
      color: #64748b;
      font-weight: 700;
    }

    .week-period-range {
      font-size: 18px;
      line-height: 1.25;
      color: #0f172a;
      font-weight: 900;
      margin-bottom: 10px;
    }

    .week-period-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-top: 1px dashed #e2e8f0;
      padding-top: 7px;
      margin-top: 7px;
      font-size: 12px;
      color: #64748b;
    }

    .week-period-row strong {
      color: #334155;
      font-weight: 700;
      text-align: right;
    }

    .week-cross-month { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #92400e; font-size: 11px; }

    .weekly-update-panel {
      margin: 14px 0 18px;
      padding: 14px;
      border: 1px solid #fde68a;
      border-left: 4px solid var(--qltd-weekly-accent);
      border-radius: 16px;
      background: #fffbeb;
    }

    .weekly-update-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .weekly-period-control { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .weekly-period-control label { color: #78350f; font-size: 12px; font-weight: 900; }
    .weekly-period-control select { min-width: 230px; min-height: 36px; border: 1px solid #fbbf24; border-radius: 10px; background: #fff; padding: 0 10px; font: inherit; font-weight: 700; }

    .weekly-update-title {
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
    }

    .weekly-update-meta {
      margin-top: 4px;
      font-size: 12px;
      color: #64748b;
    }

    .weekly-update-grid {
      display: grid;
      grid-template-columns: 1fr 180px;
      gap: 12px;
      margin-bottom: 12px;
    }

    .weekly-update-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .weekly-update-field label {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
    }

    .weekly-update-field textarea,
    .weekly-update-field input,
    .weekly-update-field select {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 10px 11px;
      font: inherit;
      color: #0f172a;
      background: #ffffff;
      box-sizing: border-box;
    }

    .weekly-update-field textarea {
      min-height: 74px;
      resize: vertical;
    }

    .weekly-update-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      border-top: 1px dashed #bfdbfe;
      padding-top: 12px;
    }

    .weekly-update-button {
      border: 0;
      border-radius: 999px;
      padding: 9px 14px;
      font-weight: 800;
      cursor: pointer;
      background: #0f766e;
      color: #ffffff;
      box-shadow: 0 8px 18px rgba(15, 118, 110, .18);
    }

    .weekly-update-note {
      font-size: 12px;
      color: #64748b;
    }

    .weekly-target-toolbar {
      display: grid;
      grid-template-columns: minmax(300px, 2fr) minmax(220px, 1fr);
      gap: 10px;
      margin: 0 0 12px;
      padding: 12px;
      border: 1px solid #ddd6fe;
      border-left: 4px solid var(--qltd-master-accent);
      border-radius: 16px;
      background: #faf8ff;
    }

    .master-plan-period { display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 8px 12px; border-radius: 12px; background: #fff; border: 1px solid #ede9fe; }
    .master-plan-period span { color: #6d28d9; font-size: 12px; font-weight: 800; }
    .master-plan-period strong { color: #312e81; font-size: 14px; }
    .report-summary-section { margin: 14px 0 0; border: 1px solid #cbd5e1; border-left: 4px solid var(--qltd-summary-accent); border-radius: 14px; overflow: hidden; background: #fff; }
    .report-section-heading { padding: 11px 14px; background: #f8fafc; color: #334155; font-size: 14px; font-weight: 900; border-bottom: 1px solid #e2e8f0; }

    @media (max-width: 760px) {
      .weekly-update-grid,
      .weekly-target-toolbar {
        grid-template-columns: 1fr;
      }
      .weekly-update-header { flex-direction: column; }
      .weekly-period-control { width: 100%; justify-content: flex-start; }
      .weekly-period-control select { width: 100%; }
    }

    .week-period-id {
      margin-top: 8px;
      padding: 7px 8px;
      border-radius: 10px;
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      word-break: break-all;
    }
  `;

  document.head.appendChild(style);
}

function formatIsoDateVi(isoDate) {
  if (isoDate instanceof Date && !isNaN(isoDate.getTime())) {
    return `${pad2(isoDate.getDate())}/${pad2(isoDate.getMonth() + 1)}/${isoDate.getFullYear()}`;
  }
  const text = String(isoDate || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate || '';
  const iso = qltdWeeklyDatePartsToIso(Number(match[1]), Number(match[2]), Number(match[3]));
  return iso ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function qltdWeeklyDatePartsToIso(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function qltdWeeklyNormalizeDateOnly(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return qltdWeeklyDatePartsToIso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return qltdWeeklyDatePartsToIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const vi = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if (vi) return qltdWeeklyDatePartsToIso(Number(vi[3]), Number(vi[2]), Number(vi[1]));
  return '';
}

function qltdWeeklyDateOnlyToLocalNoon(value) {
  const iso = qltdWeeklyNormalizeDateOnly(value);
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
}

function qltdWeeklyDateInputValue(value) {
  return qltdWeeklyNormalizeDateOnly(value);
}

function qltdWeeklyFormatDateOnlyVi(value) {
  const iso = qltdWeeklyNormalizeDateOnly(value);
  return iso ? formatIsoDateVi(iso) : String(value || '');
}

function renderWeekPeriodsHtml(periods) {
  ensureDeptPlanInlineStyles();

  if (!Array.isArray(periods) || !periods.length) {
    return '<p class="empty-state">Không sinh được kỳ tuần cho tháng đang chọn.</p>';
  }

  const crossMonthCount = periods.filter((period) => period.isCrossMonth).length;

  return `
    <section class="week-period-section">
      <div class="week-period-section-header">
        <div>
          <div class="week-period-kicker">WEB-05A · Kỳ báo cáo động</div>
          <div class="week-period-title-main">${periods.length} kỳ tuần trong tháng đang xem</div>
        </div>
        <div class="week-period-legend">
          <span class="week-period-chip">${periods.length} tuần đủ 7 ngày</span>
          ${crossMonthCount ? `<span class="week-period-chip partial">${crossMonthCount} tuần giao tháng</span>` : ''}
        </div>
      </div>

      <div class="week-period-grid">
        ${periods.map((period) => {
          const isCrossMonth = !!period.isCrossMonth;
          return `
            <article class="week-period-card ${period.weekId === qltdSelectedWeekId ? 'is-selected' : ''}" data-week-id="${escapeHtml(period.weekId)}">
              <div class="week-period-card-top">
                <span class="week-period-badge">Tuần ${escapeHtml(period.weekNoInMonth)}</span>
                <span class="week-period-days">7 / 7 ngày</span>
              </div>

              <div class="week-period-range">
                ${escapeHtml(formatIsoDateVi(period.weekStart))} – ${escapeHtml(formatIsoDateVi(period.weekEnd))}
              </div>

              ${isCrossMonth ? `<div class="week-cross-month"><span class="week-period-chip partial">Tuần giao tháng</span><span>${escapeHtml(period.crossMonthDescription)}</span></div>` : ''}

              <div class="week-period-row">
                <span>Thứ Hai → Chủ nhật</span>
                <strong>${escapeHtml(formatIsoDateVi(period.weekStart))} → ${escapeHtml(formatIsoDateVi(period.weekEnd))}</strong>
              </div>

              <div class="week-period-id mono">
                ${escapeHtml(period.weekId)}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function getBackendErrorCode(payload) {
  return String(
    payload?.errorCode ||
    payload?.code ||
    payload?.errors?.[0]?.code ||
    payload?.error?.code ||
    payload?.message ||
    ''
  ).trim().toUpperCase();
}

function getBackendErrorMessage(payload, fallback) {
  return String(
    payload?.errorMessage ||
    payload?.errors?.[0]?.message ||
    payload?.error?.message ||
    (getBackendErrorCode(payload) !== String(payload?.message || '').trim().toUpperCase() ? payload?.message : '') ||
    fallback ||
    ''
  ).trim();
}

function isDeptAccessDenied(payload) {
  return ['ACCESS_DENIED', 'PERMISSION_DENIED', 'DEPT_SCOPE_DENIED', 'PROJECT_DEPT_NOT_ASSIGNED', 'PROJECT_DEPT_UPDATE_FORBIDDEN', 'DELEGATED_PROGRESS_FIELDS_FORBIDDEN'].includes(getBackendErrorCode(payload));
}

function resetDeptScopedSelectionState() {
  qltdSelectedMasterCode = '';
  qltdDeptMasterListExpanded = false;
  qltdSelectedWeeklyItemKey = '';
  qltdWeeklyEditingItemKey = '';
  qltdWeeklyNotificationDetailItemKey = '';
  qltdWeeklyWorkspaceTab = 'objectives';
  qltdWeeklyTaskFilters = { search: '', ownership: 'ALL', statuses: [] };
  qltdWeeklyForcedItem = null;
  qltdWeeklySaveRequestId = '';
  qltdWeeklyTaskRequestSeq += 1;
  qltdDetailPopupRequestSeq += 1;
  qltdWeeklyTaskView = {
    key: '',
    items: [],
    updates: [],
    nextItems: [],
    standaloneBudgetItems: [],
    budgetDrafts: {},
    capabilities: { canUpdate: false, canReviewWeekly: false, role: '' },
    loading: false,
    error: '',
    accessDenied: false
  };
  qltdDetailPopupCache.clear();
  Object.keys(qltdWeeklyDrafts).forEach((key) => delete qltdWeeklyDrafts[key]);
  closeDetailStatusPopup();
  document.dispatchEvent(new CustomEvent('qltd:dept-plan-rendered', {
    detail: {
      projectCode: '',
      deptCode: '',
      masterTaskCode: '',
      masterWbs: '',
      masterTaskName: ''
    }
  }));
}

function resetDeptScopedClientState() {
  qltdDeptPlanPayload = null;
  qltdSelectedDeptCode = '';
  qltdDeptPlanCache.clear();
  resetDeptScopedSelectionState();
}

function renderDeptPlanUnavailable(payload) {
  resetDeptScopedClientState();
  ensureDeptSelector();
  ensureDeptPlanPanel();
  const denied = isDeptAccessDenied(payload);
  const message = denied
    ? QLTD_PLAN_DEPT_ACCESS_MESSAGE
    : getBackendErrorMessage(payload, 'Không tải được dữ liệu phòng/ban.');
  const deptSelector = document.getElementById('deptSelector');
  const status = document.getElementById('deptPlanStatus');
  const content = document.getElementById('deptPlanContent');
  if (deptSelector) {
    deptSelector.innerHTML = '<option value="">Không có dữ liệu được phép</option>';
    deptSelector.value = '';
    deptSelector.disabled = true;
    deptSelector.onchange = null;
  }
  if (status) status.textContent = denied ? 'Không có quyền truy cập' : 'Không tải được dữ liệu';
  if (content) content.innerHTML = `<div class="dept-access-denied" role="alert">${escapeHtml(message)}</div>`;
}

function renderDeptPlans(payload) {
  ensureDeptSelector();
  ensureDeptPlanPanel();

  const deptSelector = document.getElementById('deptSelector');
  const status = document.getElementById('deptPlanStatus');
  const content = document.getElementById('deptPlanContent');

  if (!content || !deptSelector) return;

  if (!payload || !payload.success) {
    renderDeptPlanUnavailable(payload);
    return;
  }

  qltdDeptPlanPayload = enrichDeptPlanPayloadWithOfficialMasters(payload);
  payload = qltdDeptPlanPayload;
  const departments = payload.departments || [];
  deptSelector.innerHTML = '';

  if (!departments.length) {
    qltdSelectedDeptCode = '';
    resetDeptScopedSelectionState();
    deptSelector.innerHTML = '<option value="">Ch\u01b0a c\u00f3 ph\u00f2ng/ban</option>';
    deptSelector.disabled = true;
    if (status) status.textContent = '0 ph\u00f2ng/ban';
    content.innerHTML = '<p class="empty-state">Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u ph\u00f2ng/ban cho d\u1ef1 \u00e1n n\u00e0y.</p>';
    return;
  }

  departments.forEach((dept) => {
    const option = document.createElement('option');
    const deptCode = dept.deptCode || dept.sheetName || '';
    const deptName = dept.deptName || '';
    option.value = deptCode;
    option.textContent = deptName && deptName !== deptCode ? `${deptName} (${deptCode})` : deptCode || 'Ph\u00f2ng/ban';
    deptSelector.appendChild(option);
  });

  const hasSelected = departments.some((dept) => (dept.deptCode || dept.sheetName) === qltdSelectedDeptCode);
  qltdSelectedDeptCode = hasSelected ? qltdSelectedDeptCode : (departments[0].deptCode || departments[0].sheetName || '');
  deptSelector.value = qltdSelectedDeptCode;
  deptSelector.disabled = false;
  deptSelector.onchange = () => {
    content.innerHTML = '';
    resetDeptScopedSelectionState();
    qltdSelectedDeptCode = deptSelector.value;
    renderSelectedDeptPlan();
  };

  renderSelectedDeptPlan();
}

function renderMasterPlanPeriod(master) {
  const start = formatIsoDateVi(master?.planStart || '');
  const finish = formatIsoDateVi(master?.planFinish || '');
  return `BĐ: ${escapeHtml(start || 'Chưa xác định')} · KT: ${escapeHtml(finish || 'Chưa xác định')}`;
}

function getDeptPlanMasterWbs(master) {
  return String(master?.officialWbs || master?.stt || master?.wbs || '').trim();
}

function normalizeTaskCode(value) {
  return String(value || '').trim().toUpperCase();
}

function getOfficialMasterMapFromGantt(payload = qltdGanttPayload) {
  const map = new Map();
  (payload?.data || []).forEach((task) => {
    [task.code, task.id].forEach((value) => {
      const key = normalizeTaskCode(value);
      if (key && !map.has(key)) map.set(key, task);
    });
  });
  return map;
}

function isOfficialMasterComplete(task) {
  const status = normalizeWeeklyStatusKey(task?.status || '');
  return !!(task?.actualFinish || task?.actualEnd) || status.includes('hoanthanh') || status.includes('complete') || status.includes('done');
}

function enrichDeptPlanPayloadWithOfficialMasters(payload) {
  if (!payload?.success || !Array.isArray(payload.departments) || !qltdGanttPayload?.data?.length) return payload;
  const officialMap = getOfficialMasterMapFromGantt();
  return {
    ...payload,
    departments: payload.departments.map((dept) => ({
      ...dept,
      masters: (dept.masters || []).map((master) => {
        const official = officialMap.get(normalizeTaskCode(master.masterCode));
        if (!official) return master;
        const progress = Number(official.percent ?? Math.round(Number(official.progress || 0) * 100));
        return {
          ...master,
          taskName: official.taskName || '',
          ownZone: String(official.ownZone || '').trim(),
          ownHangMuc: String(official.ownHangMuc || '').trim(),
          officialWbs: official.wbs || master.stt || '',
          planStart: official.baselineStart || official.start_date || master.planStart || '',
          planFinish: official.baselineEnd || official.end_date || official.deadline || master.planFinish || '',
          actualStart: official.actualStart || master.actualStart || '',
          actualFinish: official.actualFinish || official.actualEnd || master.actualFinish || '',
          progress: isNaN(progress) ? Number(master.progress || 0) : Math.max(0, Math.min(100, progress)),
          status: isOfficialMasterComplete(official) ? 'Hoàn thành' : (official.status || master.status || ''),
          officialSource: 'GANTT_CONG_VIEC',
          officialComplete: isOfficialMasterComplete(official)
        };
      })
    }))
  };
}

function dispatchDeptPlanRendered(payload, dept, master) {
  document.dispatchEvent(new CustomEvent('qltd:dept-plan-rendered', {
    detail: {
      projectCode: payload?.projectCode || '',
      deptCode: dept?.deptCode || dept?.sheetName || '',
      masterTaskCode: master?.masterCode || '',
      masterWbs: getDeptPlanMasterWbs(master),
      masterTaskName: master?.taskName || '',
      permissionSource: dept?.permissionSource || '',
      permissionCode: dept?.permissionCode || '',
      canUpdateProgress: !!dept?.canUpdateProgress
    }
  }));
}

function renderSelectedDeptPlanLegacy() {
  const payload = qltdDeptPlanPayload;
  const status = document.getElementById('deptPlanStatus');
  const subtitle = document.getElementById('deptPlanSubTitle');
  const content = document.getElementById('deptPlanContent');

  if (!payload || !payload.success || !content) return;

  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0];

  if (!dept) {
    content.innerHTML = '<p class="empty-state">Chưa chọn phòng/ban.</p>';
    return;
  }

  const masters = dept.masters || [];
  const monthCode = qltdSelectedMonthCode || getDefaultMonthCode();
  const weekPeriods = getMonthWeekPeriods(monthCode);

  if (!masters.some((master) => master.masterCode === qltdSelectedMasterCode)) {
    qltdSelectedMasterCode = masters[0] ? masters[0].masterCode : '';
  }

  if (!weekPeriods.some((period) => period.weekId === qltdSelectedWeekId)) {
    qltdSelectedWeekId = weekPeriods[0] ? weekPeriods[0].weekId : '';
  }

  const selectedMaster = masters.find((master) => master.masterCode === qltdSelectedMasterCode) || masters[0] || null;
  const selectedWeek = weekPeriods.find((period) => period.weekId === qltdSelectedWeekId) || weekPeriods[0] || null;

  if (status) {
    status.textContent = `${departments.length} phòng/ban · đang xem ${dept.deptCode || dept.sheetName} · ${masters.length} mục tiêu · ${weekPeriods.length} kỳ tuần`;
  }

  if (subtitle) {
    subtitle.textContent = `${payload.projectCode || ''} - ${payload.projectName || ''}`;
  }

  const periodToolbarHtml = `
    <div class="dept-plan-period-toolbar">
      <label class="nav-control-label" for="reportMonthSelector">Tháng báo cáo</label>
      <input id="reportMonthSelector" class="nav-control-select" type="month" value="${escapeHtml(monthCode)}">
      <span class="dept-plan-subtitle">Tuần vận hành: Thứ 2–Chủ nhật. Tháng chỉ là lát cắt hiển thị.</span>
    </div>
    ${renderWeekPeriodsHtml(weekPeriods)}
  `;

  const weeklyTargetToolbarHtml = masters.length && weekPeriods.length ? `
    <div class="weekly-target-toolbar">
      <div class="weekly-update-field">
        <label for="weeklyMasterSelector">Mục tiêu/Công việc gốc</label>
        <select id="weeklyMasterSelector">
          ${masters.map((master) => `
            <option value="${escapeHtml(master.masterCode || '')}" ${master.masterCode === qltdSelectedMasterCode ? 'selected' : ''}>
              ${getDeptPlanMasterWbs(master) ? `${escapeHtml(getDeptPlanMasterWbs(master))} · ` : ''}${escapeHtml(qltdExactRowDisplayTitle(master))}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="master-plan-period">
        <span>Thời gian kế hoạch</span>
        <strong>${renderMasterPlanPeriod(selectedMaster)}</strong>
      </div>
    </div>
  ` : '';

  if (!masters.length) {
    content.innerHTML = `
      ${periodToolbarHtml}
      <p class="empty-state">Phòng/ban này chưa có mục tiêu/công việc gốc.</p>
    `;
    bindDeptPlanInteractiveControls();
    dispatchDeptPlanRendered(payload, dept, null);
    return;
  }

  content.innerHTML = `
    ${periodToolbarHtml}
    ${weeklyTargetToolbarHtml}
    <div id="pbDetailMount" class="pb-detail-mount" aria-live="polite"></div>
    <div id="weeklyUpdateMount">${renderWeeklyTaskUpdatePanel(payload, dept, selectedMaster, selectedWeek, weekPeriods)}</div>

    <section class="report-summary-section">
      <div class="report-section-heading">Tổng hợp mục tiêu phòng/ban</div>
      <div class="dept-plan-table-wrap">
      <table class="dept-plan-table">
        <thead>
          <tr>
            <th>WBS</th>
            <th>Mục tiêu/công việc gốc</th>
            <th>Hạn hoàn thành</th>
            <th>Slot chi tiết</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${masters.map((master) => {
            const slots = master.detailSlots || [];
            return `
              <tr>
                <td class="mono" title="Mã kỹ thuật: ${escapeHtml(master.masterCode || '')}">${escapeHtml(getDeptPlanMasterWbs(master))}</td>
                <td>
                  <div class="task-title">${escapeHtml(qltdExactRowDisplayTitle(master))}</div>
                </td>
                <td>${escapeHtml(master.planFinish || '')}</td>
                <td>${escapeHtml(slots.length || 0)}</td>
                <td>${escapeHtml(master.status || 'Chưa cập nhật')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      </div>
    </section>
  `;

  bindDeptPlanInteractiveControls();
  bindWeeklyTaskUpdateControls();
  loadWeeklyTaskData(payload, dept, selectedWeek, weekPeriods);
  dispatchDeptPlanRendered(payload, dept, selectedMaster);
}

function getWeeklyDraftKey(projectCode, deptCode, masterCode, weekId) {
  return [projectCode || '', deptCode || '', masterCode || '', weekId || ''].join('::');
}

function renderWeeklyUpdatePanel(payload, dept, master, week, weekPeriods = []) {
  if (!master || !week) {
    return '<p class="empty-state">Chưa đủ dữ liệu để mở khung cập nhật tuần.</p>';
  }

  const deptCode = dept.deptCode || dept.sheetName || '';
  const draftKey = getWeeklyDraftKey(payload.projectCode, deptCode, master.masterCode, week.weekId);
  const draft = qltdWeeklyDrafts[draftKey] || {};

  return `
    <section class="weekly-update-panel">
      <div class="weekly-update-header">
        <div>
          <div class="weekly-update-title">Cập nhật kết quả tuần</div>
          <div class="weekly-update-meta">
            ${escapeHtml(deptCode)} · ${getDeptPlanMasterWbs(master) ? `${escapeHtml(getDeptPlanMasterWbs(master))} · ` : ''}${escapeHtml(master.taskName || '')}
          </div>
        </div>
        <div class="weekly-period-control">
          <label for="weeklyPeriodSelector">Kỳ tuần</label>
          <select id="weeklyPeriodSelector">
            ${weekPeriods.map((period) => `
              <option value="${escapeHtml(period.weekId)}" ${period.weekId === qltdSelectedWeekId ? 'selected' : ''}>
                Tuần ${escapeHtml(period.weekNoInMonth)} · ${escapeHtml(formatIsoDateVi(period.weekStart))}–${escapeHtml(formatIsoDateVi(period.weekEnd))}
              </option>
            `).join('')}
          </select>
          <span class="week-period-chip partial">Mock frontend · chưa ghi Sheet</span>
        </div>
      </div>

      <div class="weekly-update-grid">
        <div class="weekly-update-field">
          <label for="weeklyResultInput">Kết quả tuần</label>
          <textarea id="weeklyResultInput" placeholder="Nhập kết quả đã thực hiện trong kỳ tuần...">${escapeHtml(draft.result || '')}</textarea>
        </div>

        <div class="weekly-update-field">
          <label for="weeklyPercentInput">% hoàn thành</label>
          <input id="weeklyPercentInput" type="number" min="0" max="100" step="1" value="${escapeHtml(draft.percent || '')}" placeholder="0–100">
        </div>

        <div class="weekly-update-field">
          <label for="weeklyIssueInput">Vướng mắc/rủi ro</label>
          <textarea id="weeklyIssueInput" placeholder="Nêu vướng mắc, nguyên nhân, tác động nếu có...">${escapeHtml(draft.issue || '')}</textarea>
        </div>

        <div class="weekly-update-field">
          <label for="weeklyNextPlanInput">Kế hoạch tuần sau</label>
          <textarea id="weeklyNextPlanInput" placeholder="Nêu việc trọng tâm tuần sau...">${escapeHtml(draft.nextPlan || '')}</textarea>
        </div>
        <div class="weekly-update-field">
          <label for="weeklyRecommendationInput">Kiến nghị</label>
          <textarea id="weeklyRecommendationInput" placeholder="Nêu kiến nghị cần xử lý nếu có...">${escapeHtml(draft.recommendation || '')}</textarea>
        </div>
      </div>

      <div class="weekly-update-actions">
        <button id="saveWeeklyDraftButton" type="button" class="weekly-update-button">Lưu nháp báo cáo</button>
        <button id="submitWeeklyReportButton" type="button" class="weekly-update-button">Gửi báo cáo</button>
        <span id="weeklyDraftStatus" class="weekly-update-note">Báo cáo chưa được lưu.</span>
      </div>
    </section>
  `;
}

function captureWeeklyDraft() {
  if (!qltdSelectedMasterCode || !qltdSelectedWeekId) return;
  const payload = qltdDeptPlanPayload || {};
  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0] || {};
  const deptCode = dept.deptCode || dept.sheetName || '';
  const hasFields = document.getElementById('weeklyResultInput');
  if (!hasFields) return;
  qltdWeeklyDrafts[getWeeklyDraftKey(payload.projectCode, deptCode, qltdSelectedMasterCode, qltdSelectedWeekId)] = {
    result: document.getElementById('weeklyResultInput')?.value || '',
    percent: document.getElementById('weeklyPercentInput')?.value || '',
    issue: document.getElementById('weeklyIssueInput')?.value || '',
    nextPlan: document.getElementById('weeklyNextPlanInput')?.value || '',
    recommendation: document.getElementById('weeklyRecommendationInput')?.value || ''
  };
}

function renderWeeklyUpdateRegion() {
  const mount = document.getElementById('weeklyUpdateMount');
  const payload = qltdDeptPlanPayload;
  if (!mount || !payload?.success) return;
  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0];
  const masters = dept?.masters || [];
  const master = masters.find((item) => item.masterCode === qltdSelectedMasterCode) || masters[0] || null;
  const periods = getMonthWeekPeriods(qltdSelectedMonthCode || getDefaultMonthCode());
  const week = periods.find((item) => item.weekId === qltdSelectedWeekId) || periods[0] || null;
  mount.innerHTML = renderWeeklyUpdatePanel(payload, dept || {}, master, week, periods);
  bindWeeklyUpdateControls();
}

function bindDeptPlanInteractiveControls() {
  const monthSelector = document.getElementById('reportMonthSelector');
  if (monthSelector) {
    monthSelector.onchange = () => {
      captureWeeklyDraft();
      qltdSelectedMonthCode = monthSelector.value || getDefaultMonthCode();
      qltdSelectedWeekId = '';
      renderSelectedDeptPlan();
    };
  }

  const masterSelector = document.getElementById('weeklyMasterSelector');
  if (masterSelector) {
    masterSelector.onchange = () => {
      captureWeeklyDraft();
      qltdSelectedMasterCode = masterSelector.value || '';
      renderSelectedDeptPlan();
    };
  }

  bindWeeklyTaskUpdateControls();
}

function bindWeeklyUpdateControls() {
  const weekSelector = document.getElementById('weeklyPeriodSelector');
  if (weekSelector) {
    weekSelector.onchange = () => {
      captureWeeklyDraft();
      qltdSelectedWeekId = weekSelector.value || '';
      document.querySelectorAll('.week-period-card[data-week-id]').forEach((card) => {
        card.classList.toggle('is-selected', card.getAttribute('data-week-id') === qltdSelectedWeekId);
      });
      renderWeeklyUpdateRegion();
    };
  }

  const saveWeeklyReport = async (action) => {
      const payload = qltdDeptPlanPayload || {};
      const departments = payload.departments || [];
      const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0] || {};
      const deptCode = dept.deptCode || dept.sheetName || '';
      const draftKey = getWeeklyDraftKey(payload.projectCode, deptCode, qltdSelectedMasterCode, qltdSelectedWeekId);
      const draft = {
        result: document.getElementById('weeklyResultInput')?.value || '',
        percent: document.getElementById('weeklyPercentInput')?.value || '',
        issue: document.getElementById('weeklyIssueInput')?.value || '',
        nextPlan: document.getElementById('weeklyNextPlanInput')?.value || '',
        recommendation: document.getElementById('weeklyRecommendationInput')?.value || '',
        savedAt: new Date().toISOString()
      };
      qltdWeeklyDrafts[draftKey] = draft;
      const draftStatus = document.getElementById('weeklyDraftStatus');
      const delegatedProgress = dept.permissionSource === 'DELEGATED_ACCESS';
      const request = {
        action,
        email: currentUserProfile?.email || '',
        userEmail: currentUserProfile?.email || '',
        projectCode: payload.projectCode || '',
        deptCode,
        weekCode: qltdSelectedWeekId,
        thisWeekResult: draft.result,
        issue: draft.issue,
        recommendation: draft.recommendation,
        taskCodes: qltdSelectedMasterCode || ''
      };
      if (!delegatedProgress) request.nextWeekPlan = draft.nextPlan;
      if (draftStatus) draftStatus.textContent = action === 'weekly_submit' ? 'Đang gửi báo cáo...' : 'Đang lưu nháp...';
      try {
        const result = await postBackendJson(request);
        if (!result.success) {
          const backendError = new Error(getBackendErrorMessage(result, 'Không lưu được báo cáo tuần.'));
          backendError.backendResult = result;
          throw backendError;
        }
        const report = result.data?.report || result.report || {};
        if (draftStatus) {
          draftStatus.textContent = action === 'weekly_submit'
            ? `Đã gửi báo cáo lúc ${new Date().toLocaleTimeString('vi-VN')} bởi ${report.submittedBy || currentUserProfile?.email || ''}.`
            : `Đã lưu nháp lúc ${new Date().toLocaleTimeString('vi-VN')} bởi ${report.preparedBy || currentUserProfile?.email || ''}.`;
        }
      } catch (error) {
        if (draftStatus) draftStatus.textContent = error.message || 'Không lưu được báo cáo tuần.';
      }
  };
  const saveButton = document.getElementById('saveWeeklyDraftButton');
  if (saveButton) saveButton.onclick = () => saveWeeklyReport('weekly_savedraft');
  const submitButton = document.getElementById('submitWeeklyReportButton');
  if (submitButton) submitButton.onclick = () => saveWeeklyReport('weekly_submit');
}

function getWeeklyTaskCacheKey(projectCode, deptCode, weekCode) {
  return [projectCode || '', deptCode || '', weekCode || ''].join('::');
}

function cloneWeeklyTaskState(state = {}) {
  return JSON.parse(JSON.stringify(state));
}

function getWeeklyTaskCacheVersion(key) {
  return Number(qltdWeeklyTaskCacheVersions.get(key) || 0);
}

function invalidateWeeklyTaskCacheKey(key) {
  if (!key) return;
  qltdWeeklyTaskCache.delete(key);
  qltdWeeklyTaskCacheVersions.set(key, getWeeklyTaskCacheVersion(key) + 1);
}

function invalidateWeeklyTaskCachePrefix(prefix) {
  const keys = new Set([...qltdWeeklyTaskCache.keys(), ...qltdWeeklyTaskInFlight.keys()]);
  keys.forEach((key) => {
    if (key.startsWith(prefix)) invalidateWeeklyTaskCacheKey(key);
  });
}

function clearWeeklyTaskSessionState() {
  qltdWeeklyTaskSessionVersion += 1;
  qltdWeeklyTaskRequestSeq += 1;
  qltdWeeklyTaskCache.clear();
  qltdWeeklyTaskInFlight.clear();
  qltdWeeklyTaskCacheVersions.clear();
  qltdWeeklyTaskCacheIdentity = '';
  qltdSelectedWeeklyItemKey = '';
  qltdWeeklyEditingItemKey = '';
  qltdWeeklyWorkspaceTab = 'objectives';
  qltdWeeklyTaskFilters = { search: '', ownership: 'ALL', statuses: [] };
  qltdWeeklySaveRequestId = '';
  qltdWeeklyForcedItem = null;
  qltdWeeklyTaskView = {
    key: '',
    items: [],
    updates: [],
    nextItems: [],
    standaloneBudgetItems: [],
    budgetDrafts: {},
    capabilities: { canUpdate: false, canReviewWeekly: false, role: '' },
    loading: false,
    refreshing: false,
    error: '',
    refreshWarning: '',
    accessDenied: false
  };
}

function renderWeeklyTaskUpdatePanelLegacy(payload, dept, master, week, periods = []) {
  if (!master || !week) return '<p class="empty-state">Chưa đủ dữ liệu để mở khung cập nhật tuần.</p>';
  const deptCode = dept.deptCode || dept.sheetName || '';
  const key = getWeeklyTaskCacheKey(payload.projectCode, deptCode, week.weekId);
  const state = qltdWeeklyTaskView.key === key ? qltdWeeklyTaskView : { items: [], updates: [], nextItems: [], loading: true, error: '' };
  const selected = state.items.find((item) => `${item.itemType}:${item.itemId}` === qltdSelectedWeeklyItemKey) || state.items[0] || null;
  if (selected) qltdSelectedWeeklyItemKey = `${selected.itemType}:${selected.itemId}`;
  const saved = selected ? state.updates.find((update) => update.itemType === selected.itemType && update.itemId === selected.itemId) : null;
  const masterItems = state.items.filter((item) => item.itemType === 'MASTER');
  const detailItems = state.items.filter((item) => item.itemType === 'PB_DETAIL');
  const itemOptions = (items) => items.map((item) => `<option value="${escapeHtml(`${item.itemType}:${item.itemId}`)}" ${selected && item.itemType === selected.itemType && item.itemId === selected.itemId ? 'selected' : ''}>${escapeHtml(item.wbs ? `${item.wbs} · ${item.taskName}` : item.taskName)}</option>`).join('');
  return `
    <section class="weekly-update-panel">
      <div class="weekly-update-header"><div><div class="weekly-update-title">Cập nhật kết quả tuần</div><div class="weekly-update-meta">${escapeHtml(deptCode)} · cập nhật theo từng công việc</div></div>
        <div class="weekly-period-control"><label for="weeklyTaskPeriodSelector">Kỳ tuần</label><select id="weeklyTaskPeriodSelector">${periods.map((period) => `<option value="${escapeHtml(period.weekId)}" ${period.weekId === week.weekId ? 'selected' : ''}>Tuần ${escapeHtml(period.weekNoInMonth)} · ${escapeHtml(formatIsoDateVi(period.weekStart))}–${escapeHtml(formatIsoDateVi(period.weekEnd))}</option>`).join('')}</select><span class="week-period-chip ${state.error ? 'partial' : ''}">${state.loading ? 'Đang tải...' : state.error ? 'Có lỗi tải dữ liệu' : `${state.items.length} công việc`}</span></div>
      </div>
      ${state.error ? `<p class="weekly-update-note">${escapeHtml(state.error)}</p>` : ''}
      <div class="weekly-filter-row"><input id="weeklyTaskSearch" type="search" placeholder="Tìm WBS, tên hoặc mã..."><select id="weeklyTaskGroup"><option value="ALL">Tất cả</option><option value="OVERDUE">Quá hạn</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="PLANNED">Trong kế hoạch tuần</option><option value="COMPLETED_THIS_WEEK">Hoàn thành trong tuần</option></select><select id="weeklyTaskItemSelector" ${!state.items.length ? 'disabled' : ''}>${masterItems.length ? `<optgroup label="MỤC TIÊU/CÔNG VIỆC GỐC">${itemOptions(masterItems)}</optgroup>` : ''}${detailItems.length ? `<optgroup label="VIỆC CHI TIẾT PHÒNG/BAN">${itemOptions(detailItems)}</optgroup>` : ''}</select></div>
      ${selected ? `<div class="weekly-selected-summary"><strong>${escapeHtml(selected.wbs ? `${selected.wbs} · ${selected.taskName}` : selected.taskName)}</strong><span>${renderMasterPlanPeriod(selected)}</span><span>${escapeHtml(selected.eligibleReason)}</span></div>` : '<p class="empty-state">Không có công việc cần cập nhật trong tuần này.</p>'}
      <div class="weekly-update-grid">
        <div class="weekly-update-field"><label for="weeklyTaskResult">Kết quả thực hiện trong tuần</label><textarea id="weeklyTaskResult" ${!selected ? 'disabled' : ''}>${escapeHtml(saved?.thisWeekResult || '')}</textarea></div>
        <div class="weekly-update-field"><label for="weeklyTaskProgress">Tiến độ lũy kế cuối tuần</label><input id="weeklyTaskProgress" type="number" min="0" max="100" value="${escapeHtml(saved?.progressEnd ?? selected?.progress ?? '')}" ${selected?.progressReadonly || !selected ? 'readonly' : ''}>${selected?.progressReadonly ? '<small>Readonly: MASTER có PB_DETAIL.</small>' : ''}</div>
        <div class="weekly-update-field"><label for="weeklyTaskStatus">Trạng thái</label><input id="weeklyTaskStatus" value="${escapeHtml(saved?.taskStatus || selected?.status || '')}" ${!selected ? 'disabled' : ''}></div>
        <div class="weekly-update-field"><label for="weeklyTaskIssue">Vướng mắc/Rủi ro</label><textarea id="weeklyTaskIssue" ${!selected ? 'disabled' : ''}>${escapeHtml(saved?.issue || '')}</textarea></div>
        <div class="weekly-update-field"><label for="weeklyTaskRecommendation">Giải pháp/Đề xuất</label><textarea id="weeklyTaskRecommendation" ${!selected ? 'disabled' : ''}>${escapeHtml(saved?.recommendation || '')}</textarea></div>
        <div class="weekly-update-field"><label for="weeklyTaskActualStart">Ngày bắt đầu thực tế</label><input id="weeklyTaskActualStart" type="date" value="${escapeHtml(saved?.actualStart || selected?.actualStart || '')}" ${!selected ? 'disabled' : ''}></div>
        <div class="weekly-update-field"><label for="weeklyTaskActualFinish">Ngày hoàn thành thực tế</label><input id="weeklyTaskActualFinish" type="date" value="${escapeHtml(saved?.actualFinish || selected?.actualFinish || '')}" ${!selected ? 'disabled' : ''}></div>
        ${selected?.hasBudget ? `<div class="weekly-budget-block"><div><span>Ngân sách kế hoạch</span><strong>${formatWeeklyCurrency(selected.plannedBudget)}</strong></div><div class="weekly-update-field"><label for="weeklyTaskBudget">Ngân sách tuần</label><input id="weeklyTaskBudget" type="number" min="0" value="${escapeHtml(saved?.budgetThisWeek || '')}"></div><div class="weekly-update-field"><label for="weeklyTaskBudgetNote">Ghi chú ngân sách</label><input id="weeklyTaskBudgetNote" value="${escapeHtml(saved?.budgetNote || '')}"></div><div><span>Lũy kế thực hiện</span><strong>${formatWeeklyCurrency(saved?.budgetCumulative || 0)}</strong></div></div>` : ''}
      </div>
      <div class="weekly-update-actions"><button id="saveWeeklyTaskUpdateButton" type="button" class="weekly-update-button" ${!selected ? 'disabled' : ''}>Lưu cập nhật tuần</button><span id="weeklyTaskSaveStatus" class="weekly-update-note">Không có form kế hoạch tuần sau.</span></div>
      ${renderWeeklySavedUpdates(state.updates, state.items)}
      ${renderWeeklyNextItems(state.nextItems)}
    </section>`;
}

function renderWeeklySavedUpdates(updates, items, canUpdate = true) {
  if (!updates.length) return '<section class="weekly-saved-section"><h3>Các cập nhật đã lưu trong tuần</h3><p class="empty-state">Chưa có cập nhật trong tuần.</p></section>';
  return `<section class="weekly-saved-section"><h3>Các cập nhật đã lưu trong tuần</h3><div class="dept-plan-table-wrap"><table class="dept-plan-table"><thead><tr><th>Loại</th><th>WBS</th><th>Công việc</th><th>Kết quả tuần</th><th>Tiến độ</th><th>Trạng thái</th><th>Duyệt</th><th>Ngân sách tuần</th><th>Người cập nhật</th><th>Thời điểm</th><th>Thao tác</th></tr></thead><tbody>${updates.map((update) => { const item = items.find((candidate) => candidate.itemType === update.itemType && candidate.itemId === update.itemId) || {}; const itemCanUpdate = item.canUpdate !== undefined ? !!item.canUpdate : canUpdate; return `<tr><td>${escapeHtml(update.itemType)}</td><td>${escapeHtml(item.wbs || '')}</td><td>${escapeHtml(qltdWeeklyDisplayTitle(item) || update.itemId)}</td><td>${escapeHtml(update.thisWeekResult)}</td><td>${escapeHtml(update.progressEnd)}%</td><td>${escapeHtml(update.taskStatus)}</td><td>${update.approvalStatus ? `<span class="approval-status-badge is-${escapeHtml(String(update.approvalStatus).toLowerCase())}">${escapeHtml(formatApprovalStatus(update.approvalStatus))}</span>${update.reviewReason ? `<small class="review-reason">${escapeHtml(update.reviewReason)}</small>` : ''}` : '—'}</td><td>${renderWeeklySavedBudgetCell(update, item)}</td><td>${escapeHtml(update.updatedBy)}</td><td>${escapeHtml(formatWeeklyDateTime(update.updatedAt))}</td><td>${itemCanUpdate ? `<button class="weekly-edit-button" type="button" data-weekly-item="${escapeHtml(`${update.itemType}:${update.itemId}`)}" data-weekly-item-type="${escapeHtml(update.itemType)}">Sửa</button>` : '—'}</td></tr>`; }).join('')}</tbody></table></div></section>`;
}

function renderWeeklySavedBudgetCell(update, item) {
  const amount = getWeeklySavedBudgetAmount(update, item);
  return amount === null ? '—' : formatWeeklyCurrency(amount);
}

function getWeeklySavedBudgetAmount(update, item) {
  const taskLinkedItems = Array.isArray(item?.taskLinkedBudgetItems) ? item.taskLinkedBudgetItems : [];
  if (taskLinkedItems.length) {
    return taskLinkedItems.reduce((total, budgetItem) => total + Number(budgetItem.actualThisWeek || 0), 0);
  }
  const hasTaskLinkedBudget = String(item?.budgetType || '').trim().toUpperCase() === 'TASK_LINKED' && String(item?.budgetItemCode || '').trim();
  if (!hasTaskLinkedBudget) return null;
  return Number(update?.budgetThisWeek || 0);
}

function renderWeeklyNextItems(items) {
  return `<section class="weekly-next-section"><h3>Công việc dự kiến tuần tới</h3>${items.length ? `<div class="weekly-next-grid">${items.map((item) => `<article><span class="week-period-chip">${escapeHtml(item.eligibleReason === 'OVERDUE' ? 'Quá hạn' : item.eligibleReason === 'IN_PROGRESS' ? 'Tiếp tục' : 'Bắt đầu trong tuần')}</span><strong>${escapeHtml(item.wbs ? `${item.wbs} · ${qltdWeeklyDisplayTitle(item)}` : qltdWeeklyDisplayTitle(item))}</strong><small>${renderMasterPlanPeriod(item)} · ${escapeHtml(item.progress)}% · ${escapeHtml(item.status || 'Chưa cập nhật')}</small><small>${escapeHtml(item.owner || '')}${item.hasBudget ? ` · ${formatWeeklyCurrency(item.plannedBudget)}` : ''}</small></article>`).join('')}</div>` : '<p class="empty-state">Không có công việc dự kiến.</p>'}</section>`;
}

function bindWeeklyTaskUpdateControlsLegacy() {
  const weekSelector = document.getElementById('weeklyTaskPeriodSelector');
  if (weekSelector) weekSelector.onchange = () => {
    qltdSelectedWeekId = weekSelector.value;
    qltdSelectedWeeklyItemKey = '';
    document.querySelectorAll('.week-period-card[data-week-id]').forEach((card) => {
      card.classList.toggle('is-selected', card.getAttribute('data-week-id') === qltdSelectedWeekId);
    });
    renderWeeklyTaskRegion();
    loadWeeklyTaskDataForCurrent();
  };
  const itemSelector = document.getElementById('weeklyTaskItemSelector');
  if (itemSelector) itemSelector.onchange = () => { qltdSelectedWeeklyItemKey = itemSelector.value; renderWeeklyTaskRegion(); };
  document.querySelectorAll('[data-weekly-item]').forEach((button) => { button.onclick = () => { qltdSelectedWeeklyItemKey = button.dataset.weeklyItem || ''; renderWeeklyTaskRegion(); }; });
  const search = document.getElementById('weeklyTaskSearch'); const group = document.getElementById('weeklyTaskGroup');
  const filter = () => loadWeeklyTaskDataForCurrent({ search: search?.value || '', group: group?.value || 'ALL', force: true });
  if (search) search.onchange = filter; if (group) group.onchange = filter;
  const progress = document.getElementById('weeklyTaskProgress');
  if (progress) progress.onchange = () => {};
  const save = document.getElementById('saveWeeklyTaskUpdateButton'); if (save) save.onclick = saveWeeklyTaskUpdate;
}

function renderWeeklyTaskRegionLegacy() {
  const mount = document.getElementById('weeklyUpdateMount'); const payload = qltdDeptPlanPayload; if (!mount || !payload?.success) return;
  const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || (payload.departments || [])[0] || {};
  const master = (dept.masters || []).find((item) => item.masterCode === qltdSelectedMasterCode) || (dept.masters || [])[0] || null;
  const periods = getMonthWeekPeriods(qltdSelectedMonthCode || getDefaultMonthCode()); const week = periods.find((item) => item.weekId === qltdSelectedWeekId) || periods[0];
  mount.innerHTML = renderWeeklyTaskUpdatePanel(payload, dept, master, week, periods); bindWeeklyTaskUpdateControls();
}

async function loadWeeklyTaskDataLegacy(payload, dept, week, periods, filters = {}) {
  if (!payload?.projectCode || !dept || !week) return;
  const deptCode = dept.deptCode || dept.sheetName || ''; const key = getWeeklyTaskCacheKey(payload.projectCode, deptCode, week.weekId); const cached = qltdWeeklyTaskCache.get(key);
  if (cached && !filters.force) { qltdWeeklyTaskView = cached; renderWeeklyTaskRegion(); return; }
  const seq = ++qltdWeeklyTaskRequestSeq; qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], standaloneBudgetItems: [], loading: true, error: '' }; renderWeeklyTaskRegion();
  const currentIndex = periods.findIndex((period) => period.weekId === week.weekId); const next = periods[currentIndex + 1] || getNextWeeklyPeriod(week);
  const common = { email: currentUserProfile?.email || '', projectCode: payload.projectCode, deptCode, weekCode: week.weekId };
  try {
    const [itemsResult, updatesResult, nextResult] = await Promise.all([
      fetchBackendJson('work_listweeklyitems', { ...common, weekStart: week.weekStart, weekEnd: week.weekEnd, search: filters.search || '', group: filters.group || 'ALL' }),
      fetchBackendJson('weekly_taskupdates_get', common),
      fetchBackendJson('work_listweeklyitems', { ...common, weekCode: next.weekId, weekStart: next.weekStart, weekEnd: next.weekEnd })
    ]);
    if (seq !== qltdWeeklyTaskRequestSeq) return;
    if (!itemsResult.success || !updatesResult.success) throw new Error(itemsResult.message || updatesResult.message || 'Không tải được dữ liệu Weekly.');
    qltdWeeklyTaskView = { key, items: itemsResult.items || [], updates: updatesResult.updates || [], nextItems: nextResult.items || [], loading: false, error: '' };
    if (!filters.force) qltdWeeklyTaskCache.set(key, qltdWeeklyTaskView);
  } catch (error) {
    if (seq !== qltdWeeklyTaskRequestSeq) return;
    qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], loading: false, error: error.message || 'Không tải được dữ liệu Weekly.' };
  }
  renderWeeklyTaskRegion();
}

function qltdWeekPeriodFromId(weekId) {
  const match = String(weekId || '').match(/^WEEK-(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const iso = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return { weekId: `WEEK-${iso(start)}`, weekStart: iso(start), weekEnd: iso(end) };
}

function qltdCurrentWeekPeriod() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() + (monday.getDay() === 0 ? -6 : 1 - monday.getDay()));
  const iso = `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`;
  return qltdWeekPeriodFromId(`WEEK-${iso}`);
}

function qltdGetSelectedWeekPeriod() {
  let period = qltdWeekPeriodFromId(qltdSelectedWeekId);
  if (!period) {
    period = qltdCurrentWeekPeriod();
    qltdSelectedWeekId = period.weekId;
  }
  return period;
}

function qltdShiftSelectedWeek(days) {
  const current = qltdGetSelectedWeekPeriod();
  const date = new Date(`${current.weekStart}T12:00:00`); date.setDate(date.getDate() + days);
  qltdSelectedWeekId = `WEEK-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  qltdSelectedWeeklyItemKey = '';
  qltdWeeklyEditingItemKey = '';
  qltdWeeklyNotificationDetailItemKey = '';
  qltdWeeklyForcedItem = null;
}

function renderSelectedDeptPlan() {
  const payload = qltdDeptPlanPayload;
  const content = document.getElementById('deptPlanContent');
  if (!payload?.success || !content) return;
  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0];
  if (!dept) { content.innerHTML = '<p class="empty-state">Chưa chọn phòng/ban.</p>'; return; }
  const masters = dept.masters || [];
  if (!masters.some((master) => master.masterCode === qltdSelectedMasterCode)) qltdSelectedMasterCode = masters[0]?.masterCode || '';
  const selectedMaster = masters.find((master) => master.masterCode === qltdSelectedMasterCode) || masters[0] || null;
  const week = qltdGetSelectedWeekPeriod();
  const status = document.getElementById('deptPlanStatus');
  const subtitle = document.getElementById('deptPlanSubTitle');
  if (status) status.textContent = `${departments.length} phòng/ban · đang xem ${dept.deptCode || dept.sheetName} · ${masters.length} mục tiêu`;
  if (subtitle) subtitle.textContent = `${payload.projectCode || ''} - ${payload.projectName || ''}`;

  content.innerHTML = `
    <div class="report-subtabs" role="tablist" aria-label="Báo cập nhật">
      <button type="button" role="tab" data-report-tab="plan" aria-selected="${qltdReportSubTab === 'plan'}" class="${qltdReportSubTab === 'plan' ? 'is-active' : ''}">KẾ HOẠCH PHÒNG/BAN</button>
      <button type="button" role="tab" data-report-tab="weekly" aria-selected="${qltdReportSubTab === 'weekly'}" class="${qltdReportSubTab === 'weekly' ? 'is-active' : ''}">CẬP NHẬT TUẦN</button>
    </div>
    ${qltdReportSubTab === 'plan'
      ? renderDeptPlanTab(payload, dept, masters, selectedMaster)
      : `<div id="weeklyUpdateMount">${renderWeeklyTaskUpdatePanel(payload, dept, selectedMaster, week)}</div>`}
  `;
  bindReportSubTabControls(payload, dept, selectedMaster, week);
}

function getDeptObjectiveProgress(master) {
  const progress = Number(master?.progress || 0);
  return isNaN(progress) ? 0 : Math.max(0, Math.min(100, progress));
}

function getDeptObjectiveStatusClass(status) {
  const key = normalizeSearchText(status).replace(/[^a-z0-9]/g, '');
  if (key.includes('hoanthanh') || key.includes('complete') || key.includes('done')) return 'is-completed';
  if (key.includes('dang') || key.includes('progress')) return 'is-in-progress';
  if (key.includes('tamdung') || key.includes('paused')) return 'is-paused';
  return 'is-not-started';
}

function qltdDeptPlanParseIsoDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return text;
}

function qltdDeptPlanTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function qltdDeptPlanIsOverdue(item, todayIso = qltdDeptPlanTodayIso()) {
  const finish = qltdDeptPlanParseIsoDate(item?.planFinish);
  if (!finish || finish >= todayIso) return false;
  return getDeptObjectiveProgress(item) < 100 && getDeptObjectiveStatusClass(item?.status) !== 'is-completed';
}

function qltdDeptPlanSortForDisplay(items, todayIso = qltdDeptPlanTodayIso()) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index, finish: qltdDeptPlanParseIsoDate(item?.planFinish), overdue: qltdDeptPlanIsOverdue(item, todayIso) }))
    .sort((left, right) => {
      if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
      if (left.overdue && left.finish !== right.finish) return left.finish.localeCompare(right.finish);
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

function qltdDeptPlanBuildListView(items, expanded, todayIso = qltdDeptPlanTodayIso()) {
  const sorted = qltdDeptPlanSortForDisplay(items, todayIso);
  const visible = expanded ? sorted : sorted.slice(0, 5);
  return { visible, total: sorted.length, remaining: Math.max(0, sorted.length - visible.length) };
}

function renderDeptPlanTab(payload, dept, masters, selectedMaster) {
  if (!masters.length) return '<p class="empty-state">Phòng/ban này chưa có mục tiêu/công việc gốc.</p>';
  const progress = getDeptObjectiveProgress(selectedMaster);
  const todayIso = qltdDeptPlanTodayIso();
  const masterList = qltdDeptPlanBuildListView(masters, qltdDeptMasterListExpanded, todayIso);
  return `
    <section class="dept-objective-card" aria-label="Mục tiêu đang chọn">
      <div class="dept-objective-card-heading"><div class="report-section-heading">Mục tiêu đang chọn</div></div>
      <div class="dept-objective-selector">
        <label for="weeklyMasterSelector">Chọn mục tiêu</label>
        <select id="weeklyMasterSelector" title="${escapeHtml(qltdExactRowDisplayTitle(selectedMaster))}">${masters.map((master) => `<option value="${escapeHtml(master.masterCode || '')}" ${master.masterCode === qltdSelectedMasterCode ? 'selected' : ''}>${escapeHtml(getDeptPlanMasterWbs(master) ? `${getDeptPlanMasterWbs(master)} · ${qltdExactRowDisplayTitle(master)}` : qltdExactRowDisplayTitle(master))}</option>`).join('')}</select>
      </div>
      <div class="task-title">${escapeHtml(qltdExactRowDisplayTitle(selectedMaster))}</div>
      ${renderDeptObjectiveOwnZone(selectedMaster)}
      <div class="dept-objective-hierarchy">
        <div><span>WBS</span><strong class="mono">${escapeHtml(getDeptPlanMasterWbs(selectedMaster) || '—')}</strong></div>
        <div><span>Bắt đầu</span><strong>${escapeHtml(formatIsoDateVi(selectedMaster?.planStart || '') || '—')}</strong></div>
        <div><span>Kết thúc</span><strong>${escapeHtml(formatIsoDateVi(selectedMaster?.planFinish || '') || '—')}</strong></div>
        <div><span>Trạng thái</span><strong class="dept-objective-status ${getDeptObjectiveStatusClass(selectedMaster?.status)}">${escapeHtml(selectedMaster?.status || 'Chưa cập nhật')}</strong></div>
        <div class="dept-objective-progress"><span>Tiến độ</span><strong>${escapeHtml(progress)}%</strong><div class="dept-objective-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(progress)}"><i style="width:${escapeHtml(progress)}%"></i></div></div>
      </div>
    </section>
    ${renderMasterCompletionWarning(selectedMaster)}
    <div id="pbDetailMount" class="pb-detail-mount" aria-live="polite"></div>
    <section class="report-summary-section">
      <div class="report-section-header">
        <div class="report-section-heading">Tổng hợp mục tiêu phòng/ban</div>
        <span class="report-list-count">Hiển thị ${masterList.visible.length}/${masterList.total} mục tiêu</span>
      </div>
      <div class="dept-plan-table-wrap"><table class="dept-plan-table report-master-table"><thead><tr><th>WBS</th><th>Mục tiêu/Công việc gốc</th><th>Bắt đầu KH</th><th>Kết thúc KH</th><th>Việc chi tiết</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead><tbody>
        ${masterList.visible.map((master) => {
          const overdue = qltdDeptPlanIsOverdue(master, todayIso);
          return `<tr data-master-select="${escapeHtml(master.masterCode || '')}" class="report-master-row ${overdue ? 'is-overdue' : ''}"><td class="mono">${escapeHtml(getDeptPlanMasterWbs(master))}</td><td><div class="task-title">${escapeHtml(qltdExactRowDisplayTitle(master))}</div>${renderMasterCompletionWarning(master, true)}</td><td>${escapeHtml(formatIsoDateVi(master.planStart || '') || '—')}</td><td>${escapeHtml(formatIsoDateVi(master.planFinish || '') || '—')}</td><td><button type="button" class="detail-count-button" data-detail-popup="${escapeHtml(master.masterCode || '')}">${renderMasterDetailCount(master)}</button></td><td>${escapeHtml(master.progress ?? 0)}%</td><td>${escapeHtml(master.status || 'Chưa cập nhật')}${overdue ? '<span class="dept-overdue-badge">Quá hạn</span>' : ''}</td></tr>`;
        }).join('')}
      </tbody></table></div>
      ${masterList.total > 5 ? `<div class="dept-plan-list-footer"><button type="button" class="dept-plan-list-toggle" data-dept-master-list-toggle aria-expanded="${qltdDeptMasterListExpanded}">${qltdDeptMasterListExpanded ? 'Thu gọn' : `Xem thêm ${masterList.remaining} mục tiêu`}</button></div>` : ''}
    </section>`;
}

function renderDeptObjectiveContext(master, compact = false) {
  if (!master) return '';
  const badges = [master.ownZone, master.ownHangMuc].filter((value, index, values) => value && values.indexOf(value) === index);
  const warning = (master.mappingWarnings || []).includes('MASTER_TASK_NOT_FOUND')
    ? 'Không tìm thấy mã Master để resolve context.'
    : '';
  if (!badges.length && !warning) return '';
  return `<div class="task-context ${compact ? 'compact' : ''}" title="${escapeHtml(warning)}">
    ${badges.map((badge) => `<span class="web07-chip">[${escapeHtml(badge)}]</span>`).join(' ')}
    ${warning ? `<span>${escapeHtml(warning)}</span>` : ''}
  </div>`;
}

function renderMasterDetailCount(master) {
  const details = Array.isArray(master.details) ? master.details : [];
  const total = details.length || (master.detailSlots || []).length;
  if (!details.length) return `${total} việc`;
  const completed = details.filter((item) => Number(item.progress || 0) >= 100).length;
  const overdue = details.filter((item) => Number(item.progress || 0) < 100 && item.planFinish && item.planFinish < new Date().toISOString().slice(0, 10)).length;
  return overdue ? `${completed}/${total} hoàn thành · ${overdue} quá hạn` : `${completed}/${total} hoàn thành`;
}

function countIncompleteDetails(master) {
  return (Array.isArray(master?.details) ? master.details : []).filter((item) => Number(item.progress || 0) < 100 && !String(item.status || '').toLocaleLowerCase('vi-VN').includes('hoàn thành') && !item.actualFinish).length;
}

function renderMasterCompletionWarning(master, compact = false) {
  if (!master?.officialComplete) return '';
  const count = countIncompleteDetails(master);
  if (!count) return '';
  const text = `Mục tiêu gốc đã hoàn thành nhưng còn ${count} việc chi tiết chưa hoàn thành.`;
  return compact ? `<div class="master-completion-warning compact">${escapeHtml(text)}</div>` : `<div class="master-completion-warning">${escapeHtml(text)}</div>`;
}

function bindReportSubTabControls(payload, dept, selectedMaster, week) {
  document.querySelectorAll('[data-report-tab]').forEach((button) => {
    button.onclick = () => { qltdReportSubTab = button.dataset.reportTab || 'plan'; renderSelectedDeptPlan(); };
  });
  const selector = document.getElementById('weeklyMasterSelector');
  if (selector) selector.onchange = () => { qltdSelectedMasterCode = selector.value || ''; renderSelectedDeptPlan(); };
  const masterListToggle = document.querySelector('[data-dept-master-list-toggle]');
  if (masterListToggle) masterListToggle.onclick = () => { qltdDeptMasterListExpanded = !qltdDeptMasterListExpanded; renderSelectedDeptPlan(); };
  document.querySelectorAll('[data-master-select]').forEach((row) => {
    row.onclick = (event) => { if (event.target.closest('[data-detail-popup]')) return; qltdSelectedMasterCode = row.dataset.masterSelect || ''; renderSelectedDeptPlan(); };
  });
  document.querySelectorAll('[data-detail-popup]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); openDetailStatusPopup(payload, dept, button.dataset.detailPopup || ''); };
  });
  if (qltdReportSubTab === 'weekly') {
    bindWeeklyTaskUpdateControls();
    loadWeeklyTaskData(payload, dept, week, [week]);
  } else {
    dispatchDeptPlanRendered(payload, dept, selectedMaster);
  }
}

function ensureDetailStatusPopup() {
  let modal = document.getElementById('detailStatusPopup');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'detailStatusPopup';
  modal.className = 'detail-status-overlay';
  modal.hidden = true;
  modal.innerHTML = '<div class="detail-status-dialog" role="dialog" aria-modal="true" aria-labelledby="detailStatusTitle"><div id="detailStatusContent"></div></div>';
  modal.onclick = (event) => { if (event.target === modal) closeDetailStatusPopup(); };
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeDetailStatusPopup(); });
  document.body.appendChild(modal);
  return modal;
}

function closeDetailStatusPopup() {
  const modal = document.getElementById('detailStatusPopup');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('has-detail-status-popup');
}

function getDetailTaskVisualState(task) {
  const progress = Number(task.progress || 0);
  const status = String(task.status || '').toLocaleLowerCase('vi-VN');
  const today = new Date().toISOString().slice(0, 10);
  if (progress >= 100 || status.includes('hoàn thành')) return { code: 'completed', label: 'Hoàn thành' };
  if (task.planFinish && task.planFinish < today) return { code: 'overdue', label: 'Quá hạn' };
  if (status.includes('tạm dừng') || status.includes('vướng') || status.includes('rủi ro')) return { code: 'paused', label: task.status || 'Có vướng mắc' };
  if (progress > 0 || task.actualStart) return { code: 'in-progress', label: task.status || 'Đang thực hiện' };
  return { code: 'not-started', label: task.status || 'Chưa bắt đầu' };
}

function buildDetailStatusSummary(tasks) {
  const summary = { total: tasks.length, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, progress: 0, budgetPlan: 0, budgetActual: 0 };
  let weightedProgress = 0;
  tasks.forEach((task) => {
    const visual = getDetailTaskVisualState(task);
    if (visual.code === 'completed') summary.completed += 1;
    else if (visual.code === 'overdue') summary.overdue += 1;
    else if (visual.code === 'not-started') summary.notStarted += 1;
    else summary.inProgress += 1;
    weightedProgress += Number(task.progress || 0);
    summary.budgetPlan += Number(task.budgetPlan || 0);
    summary.budgetActual += Number(task.budgetActual || 0);
  });
  summary.progress = tasks.length ? Math.round(weightedProgress / tasks.length) : 0;
  return summary;
}

function renderDetailStatusPopup(payload, dept, masterCode, result) {
  const modal = ensureDetailStatusPopup();
  const content = modal.querySelector('#detailStatusContent');
  const data = result.data || result;
  const master = (dept.masters || []).find((item) => item.masterCode === masterCode) || data.masterTask || {};
  const tasks = Array.isArray(data.detailTasks) ? data.detailTasks : [];
  const summary = buildDetailStatusSummary(tasks);
  content.innerHTML = `<div class="detail-status-header"><div><span>Chi tiết công việc thuộc mục tiêu</span><h2 id="detailStatusTitle">${escapeHtml(getDeptPlanMasterWbs(master) ? `${getDeptPlanMasterWbs(master)} · ${master.taskName || ''}` : master.taskName || masterCode)}</h2><small>BĐ KH: ${escapeHtml(formatIsoDateVi(master.planStart) || '—')} · KT KH: ${escapeHtml(formatIsoDateVi(master.planFinish) || '—')}</small></div><button type="button" class="detail-status-close" data-detail-close aria-label="Đóng">×</button></div>
    <div class="detail-status-summary"><div><span>Tổng số việc</span><strong>${summary.total}</strong></div><div><span>Đã hoàn thành</span><strong>${summary.completed}</strong></div><div><span>Đang thực hiện</span><strong>${summary.inProgress}</strong></div><div><span>Chưa bắt đầu</span><strong>${summary.notStarted}</strong></div><div><span>Quá hạn</span><strong>${summary.overdue}</strong></div><div><span>Tiến độ tổng hợp</span><strong>${summary.progress}%</strong></div><div><span>Ngân sách kế hoạch</span><strong>${formatWeeklyCurrency(summary.budgetPlan)}</strong></div><div><span>Ngân sách thực hiện</span><strong>${formatWeeklyCurrency(summary.budgetActual)}</strong></div></div>
    ${tasks.length ? `<div class="detail-status-table-wrap"><table class="detail-status-table"><thead><tr><th>WBS</th><th>Công việc chi tiết</th><th>Chủ trì</th><th>BĐ KH</th><th>KT KH</th><th>Tiến độ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${tasks.map((task) => { const visual = getDetailTaskVisualState(task); return `<tr><td class="mono">${escapeHtml(task.wbs || '')}</td><td>${escapeHtml(task.taskName || '')}</td><td>${escapeHtml(task.owner || '—')}</td><td>${escapeHtml(formatIsoDateVi(task.planStart) || '—')}</td><td>${escapeHtml(formatIsoDateVi(task.planFinish) || '—')}</td><td>${escapeHtml(task.progress ?? 0)}%</td><td><span class="detail-status-badge is-${escapeHtml(visual.code)}">${escapeHtml(visual.label)}</span></td><td><div class="detail-status-actions"><button type="button" data-detail-view="${escapeHtml(masterCode)}">Xem</button><button type="button" class="primary" data-detail-update="${escapeHtml(task.detailTaskId || '')}">Chọn để cập nhật</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty-state">Mục tiêu này chưa có việc chi tiết.</p>'}`;
  content.querySelector('[data-detail-close]').onclick = closeDetailStatusPopup;
  content.querySelectorAll('[data-detail-view]').forEach((button) => { button.onclick = () => { qltdSelectedMasterCode = button.dataset.detailView || masterCode; qltdReportSubTab = 'plan'; closeDetailStatusPopup(); renderSelectedDeptPlan(); }; });
  content.querySelectorAll('[data-detail-update]').forEach((button) => {
    button.onclick = () => {
      const task = tasks.find((item) => item.detailTaskId === button.dataset.detailUpdate);
      if (!task) return;
      const deptCode = dept.deptCode || dept.sheetName || '';
      const selectedWeek = qltdGetSelectedWeekPeriod();
      qltdWeeklyForcedItem = { projectCode: payload.projectCode, deptCode, weekCode: selectedWeek.weekId, itemType: 'PB_DETAIL', itemId: task.detailTaskId, detailTaskId: task.detailTaskId, masterTaskCode: task.masterTaskCode || masterCode, parentMasterTaskCode: task.masterTaskCode || masterCode, wbs: task.wbs || '', taskName: task.taskName || '', planStart: task.planStart || '', planFinish: task.planFinish || '', actualStart: task.actualStart || '', actualFinish: task.actualFinish || '', progress: Number(task.progress || 0), status: task.status || '', owner: task.owner || '', plannedBudget: Number(task.budgetPlan || 0), actualBudget: Number(task.budgetActual || 0), hasBudget: Number(task.budgetPlan || 0) > 0 || Number(task.budgetActual || 0) > 0, hasDetails: false, progressReadonly: false, eligibleReason: 'PLANNED', eligible: true };
      invalidateWeeklyTaskCacheKey(getWeeklyTaskCacheKey(payload.projectCode, deptCode, selectedWeek.weekId));
      qltdSelectedWeeklyItemKey = `PB_DETAIL:${task.detailTaskId}`;
      qltdWeeklyEditingItemKey = qltdSelectedWeeklyItemKey;
      qltdSelectedMasterCode = task.masterTaskCode || masterCode;
      qltdReportSubTab = 'weekly';
      closeDetailStatusPopup();
      renderSelectedDeptPlan();
    };
  });
}

async function openDetailStatusPopup(payload, dept, masterCode) {
  if (!payload?.projectCode || !masterCode) return;
  const deptCode = dept.deptCode || dept.sheetName || '';
  const cacheKey = [payload.projectCode, deptCode, masterCode].join('::');
  const modal = ensureDetailStatusPopup();
  const content = modal.querySelector('#detailStatusContent');
  modal.hidden = false;
  document.body.classList.add('has-detail-status-popup');
  qltdDetailPopupCache.delete(cacheKey);
  content.innerHTML = '<div class="detail-status-loading">Đang tải việc chi tiết...</div>';
  const seq = ++qltdDetailPopupRequestSeq;
  try {
    const result = await fetchBackendJson('work_getdetailtasks', { email: currentUserProfile?.email || '', projectCode: payload.projectCode, deptCode, masterTaskCode: masterCode }, { auth: true });
    if (seq !== qltdDetailPopupRequestSeq || modal.hidden) return;
    if (!result.success) {
      const backendError = new Error(getBackendErrorMessage(result, 'Không tải được việc chi tiết.'));
      backendError.backendResult = result;
      throw backendError;
    }
    renderDetailStatusPopup(payload, dept, masterCode, result);
  } catch (error) {
    if (seq !== qltdDetailPopupRequestSeq) return;
    if (isDeptAccessDenied(error.backendResult)) {
      closeDetailStatusPopup();
      renderDeptPlanUnavailable(error.backendResult);
      return;
    }
    content.innerHTML = `<div class="detail-status-error"><p>${escapeHtml(error.message || 'Không tải được việc chi tiết.')}</p><button type="button" data-detail-close>Đóng</button></div>`;
    content.querySelector('[data-detail-close]').onclick = closeDetailStatusPopup;
  }
}

function normalizeWeeklyUpdateMatchValue(value) {
  return String(value || '').trim().toUpperCase();
}

function findWeeklySavedUpdate(updates, item, context = {}) {
  if (!item || !Array.isArray(updates)) return null;
  const matches = updates.filter((update) =>
    update.itemType === item.itemType &&
    update.itemId === item.itemId &&
    normalizeWeeklyUpdateMatchValue(update.projectCode) === normalizeWeeklyUpdateMatchValue(context.projectCode) &&
    normalizeWeeklyUpdateMatchValue(update.deptCode) === normalizeWeeklyUpdateMatchValue(context.deptCode) &&
    normalizeWeeklyUpdateMatchValue(update.weekCode) === normalizeWeeklyUpdateMatchValue(context.weekCode)
  );
  matches.sort((left, right) => {
    const timeOrder = String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
    return timeOrder || Number(right.rowNumber || 0) - Number(left.rowNumber || 0);
  });
  return matches[0] || null;
}

function getWeeklyEffectiveTaskState(item, saved) {
  const source = item || {};
  const proposalOnly = saved?.itemType === 'PB_DETAIL' && ['PENDING', 'REJECTED'].includes(String(saved.approvalStatus || '').toUpperCase());
  const effectiveSaved = proposalOnly ? null : saved;
  const progress = effectiveSaved && effectiveSaved.progressEnd !== undefined && effectiveSaved.progressEnd !== null
    ? Number(effectiveSaved.progressEnd)
    : Number(source.progress || 0);
  return {
    progress: isNaN(progress) ? Number(source.progress || 0) : progress,
    status: String(effectiveSaved?.taskStatus || source.status || 'Chưa cập nhật').trim(),
    actualStart: effectiveSaved?.actualStart || source.actualStart || '',
    actualFinish: effectiveSaved?.actualFinish || source.actualFinish || ''
  };
}

function qltdExactRowOwnZone(item = {}) {
  return String(item?.ownZone || '').trim();
}

function qltdExactRowOwnHangMuc(item = {}) {
  return String(item?.ownHangMuc || '').trim();
}

function qltdNormalizeExactRowTitlePart(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN').replace(/\s*-\s*/g, '-');
}

function qltdExactRowDisplayTitle(item = {}) {
  const base = String(item?.taskName || item?.itemName || item?.itemId || '').trim().replace(/\s+/g, ' ');
  const hangMuc = qltdExactRowOwnHangMuc(item).replace(/\s+/g, ' ');
  if (!base || !hangMuc) return base;
  if (qltdNormalizeExactRowTitlePart(base).endsWith(qltdNormalizeExactRowTitlePart(hangMuc))) return base;
  return `${base} - ${hangMuc}`;
}

function renderDeptObjectiveOwnZone(master) {
  const zone = qltdExactRowOwnZone(master);
  return zone ? `<div class="task-context compact"><span class="web07-chip">[${escapeHtml(zone)}]</span></div>` : '';
}

function qltdWeeklyCategoryName(item = {}) {
  return qltdExactRowOwnHangMuc(item);
}

function qltdWeeklyDisplayTitle(item = {}) {
  return qltdExactRowDisplayTitle(item);
}

function qltdWeeklyEnrichItemsForDisplay(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const copy = { ...item };
    copy.displayTitle = qltdWeeklyDisplayTitle(copy);
    return copy;
  });
}

function renderWeeklyZoneBadge(item = {}) {
  const zone = qltdExactRowOwnZone(item);
  return zone ? `<span class="weekly-workflow-badge is-zone">${escapeHtml(zone)}</span>` : '';
}

function qltdWeeklyIsDelegatedManager(capabilities = qltdWeeklyTaskView.capabilities) {
  return String(capabilities?.permissionCode || '').trim().toUpperCase() === 'DEPT_MANAGER';
}

function canUpdateWeeklyItem(item, capabilities = {}) {
  if (!item) return false;
  if (item.canUpdate !== undefined) return !!item.canUpdate;
  if (typeof capabilities === 'boolean') return capabilities;
  return !!capabilities.canUpdate;
}

function qltdWeeklyResetTaskFilters() {
  qltdWeeklyTaskFilters = { search: '', ownership: 'ALL', statuses: [] };
}

function qltdWeeklyGetIsoWeekInfo(period) {
  const match = String(period?.weekStart || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { weekNo: '', year: '' };
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date - firstDay) / 86400000) + 1) / 7);
  return { weekNo, year };
}

function qltdWeekPeriodFromDateValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  date.setDate(date.getDate() + (date.getDay() === 0 ? -6 : 1 - date.getDay()));
  const start = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return qltdWeekPeriodFromId(`WEEK-${start}`);
}

function qltdWeeklyPersonHasEmail(value, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;
  return String(value || '').toLowerCase().split(/[;,\n]/).some((part) => {
    const match = part.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return String(match?.[0] || part).trim().toLowerCase() === target;
  });
}

function qltdWeeklyIsOverdue(item, saved, week) {
  const effective = getWeeklyEffectiveTaskState(item, saved);
  if (isWeeklyCompletionValue(effective.progress, effective.status, effective.actualFinish)) return false;
  const finish = String(item?.planFinish || '');
  return item?.eligibleReason === 'OVERDUE' || !!finish && finish < String(week?.weekStart || '');
}

function qltdWeeklyIsDue(item, saved, week) {
  const effective = getWeeklyEffectiveTaskState(item, saved);
  if (isWeeklyCompletionValue(effective.progress, effective.status, effective.actualFinish)) return false;
  const finish = String(item?.planFinish || '');
  return !!finish && finish >= String(week?.weekStart || '') && finish <= String(week?.weekEnd || '');
}

function qltdWeeklyTaskMatchesStatus(code, item, saved, week) {
  const approval = String(saved?.approvalStatus || '').trim().toUpperCase();
  if (code === 'NOT_UPDATED') return !saved;
  if (code === 'OVERDUE') return qltdWeeklyIsOverdue(item, saved, week);
  if (code === 'DUE') return qltdWeeklyIsDue(item, saved, week);
  if (code === 'PENDING' || code === 'REJECTED' || code === 'APPROVED') return approval === code;
  return false;
}

function qltdWeeklySortWorkItems(items, updates, context, week) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const saved = findWeeklySavedUpdate(updates, item, context);
    const approval = String(saved?.approvalStatus || '').toUpperCase();
    const priority = approval === 'REJECTED' ? 1 : qltdWeeklyIsOverdue(item, saved, week) ? 2 : !saved ? 3 : qltdWeeklyIsDue(item, saved, week) ? 4 : approval === 'PENDING' ? 5 : 6;
    return { item, index, priority };
  }).sort((left, right) => left.priority - right.priority || left.index - right.index).map((entry) => entry.item);
}

function qltdWeeklyFilterWorkItems(items, updates, context, week, filters, userEmail) {
  const source = (Array.isArray(items) ? items : []).filter((item) => item.itemType === 'PB_DETAIL');
  const search = normalizeSearchText(filters?.search || '');
  const ownership = String(filters?.ownership || 'ALL');
  const statuses = Array.isArray(filters?.statuses) ? filters.statuses : [];
  const filtered = source.filter((item) => {
    const saved = findWeeklySavedUpdate(updates, item, context);
    const haystack = normalizeSearchText([item.wbs, item.taskName, item.displayTitle, item.ownZone, item.ownHangMuc, item.itemId, item.masterTaskCode, item.owner, item.coordinator].join(' '));
    if (search && !haystack.includes(search)) return false;
    if (ownership === 'OWNED' && !qltdWeeklyPersonHasEmail(item.owner, userEmail)) return false;
    if (ownership === 'COORDINATED' && !qltdWeeklyPersonHasEmail(item.coordinator, userEmail)) return false;
    if (statuses.length && !statuses.some((code) => qltdWeeklyTaskMatchesStatus(code, item, saved, week))) return false;
    return true;
  });
  return qltdWeeklySortWorkItems(filtered, updates, context, week);
}

function qltdWeeklyBuildWorkspaceModel(items, updates, context, week, filters, userEmail) {
  const source = Array.isArray(items) ? items : [];
  const objectives = source.filter((item) => item.itemType === 'MASTER');
  const tasks = source.filter((item) => item.itemType === 'PB_DETAIL');
  const visibleTasks = qltdWeeklyFilterWorkItems(tasks, updates, context, week, filters, userEmail);
  const objectiveOverdue = objectives.filter((item) => qltdWeeklyIsOverdue(item, findWeeklySavedUpdate(updates, item, context), week)).length;
  const taskOverdue = tasks.filter((item) => qltdWeeklyIsOverdue(item, findWeeklySavedUpdate(updates, item, context), week)).length;
  return {
    objectives,
    tasks,
    visibleTasks,
    notUpdated: tasks.filter((item) => !findWeeklySavedUpdate(updates, item, context)).length,
    objectiveOverdue,
    taskOverdue,
    pending: (updates || []).filter((update) => String(update.approvalStatus || '').toUpperCase() === 'PENDING').length
  };
}

function qltdWeeklyGetOverdueMetric(model, workspaceTab) {
  return workspaceTab === 'tasks'
    ? { label: 'Công việc quá hạn', count: Number(model?.taskOverdue || 0) }
    : { label: 'Mục tiêu quá hạn', count: Number(model?.objectiveOverdue || 0) };
}

function renderWeeklyWorkflowBadges(item, saved, week) {
  const badges = [];
  if (saved) badges.push('<span class="weekly-workflow-badge is-updated">Đã cập nhật</span>');
  else badges.push('<span class="weekly-workflow-badge is-missing">Chưa cập nhật</span>');
  if (qltdWeeklyIsOverdue(item, saved, week)) badges.push('<span class="weekly-workflow-badge is-overdue">Quá hạn</span>');
  if (qltdWeeklyIsDue(item, saved, week)) badges.push('<span class="weekly-workflow-badge is-due">Đến hạn</span>');
  if (saved?.approvalStatus) {
    const approvalCode = String(saved.approvalStatus).toUpperCase();
    const approvalLabel = approvalCode === 'REJECTED' ? 'Trả lại' : formatApprovalStatus(approvalCode);
    badges.push(`<span class="weekly-workflow-badge is-${escapeHtml(approvalCode.toLowerCase())}">${escapeHtml(approvalLabel)}</span>`);
  }
  return badges.join('');
}

function renderWeeklyTaskUpdatePanel(payload, dept, master, week) {
  const key = getWeeklyTaskCacheKey(payload.projectCode, dept.deptCode || dept.sheetName || '', week.weekId);
  const state = qltdWeeklyTaskView.key === key ? qltdWeeklyTaskView : { items: [], updates: [], standaloneBudgetItems: [], capabilities: { canUpdate: false, role: '' }, loading: true, error: '' };
  if (state.accessDenied) {
    return `<section class="dept-access-denied" role="alert">${escapeHtml(QLTD_WEEKLY_DEPT_ACCESS_MESSAGE)}</section>`;
  }
  const updateContext = { projectCode: payload.projectCode, deptCode: dept.deptCode || dept.sheetName || '', weekCode: week.weekId };
  const model = qltdWeeklyBuildWorkspaceModel(state.items, state.updates, updateContext, week, qltdWeeklyTaskFilters, currentUserProfile?.email || '');
  const activeItems = qltdWeeklyWorkspaceTab === 'objectives' ? model.objectives : model.tasks;
  const selected = activeItems.find((item) => `${item.itemType}:${item.itemId}` === qltdSelectedWeeklyItemKey) || null;
  const visibleTasks = selected && qltdWeeklyWorkspaceTab === 'tasks' && !model.visibleTasks.some((item) => `${item.itemType}:${item.itemId}` === qltdSelectedWeeklyItemKey)
    ? [selected].concat(model.visibleTasks)
    : model.visibleTasks;
  const visibleModel = visibleTasks === model.visibleTasks ? model : { ...model, visibleTasks };
  const saved = selected ? findWeeklySavedUpdate(state.updates, selected, updateContext) : null;
  const editorOpen = !!selected && qltdWeeklyEditingItemKey === qltdSelectedWeeklyItemKey;
  const deptName = dept.deptName || dept.displayName || dept.name || dept.deptCode || dept.sheetName || '';
  const projectName = payload.projectName || payload.projectCode || '';
  const weekInfo = qltdWeeklyGetIsoWeekInfo(week);
  const canUpdate = !!state.capabilities?.canUpdate;
  const canUpdateSelected = canUpdateWeeklyItem(selected, state.capabilities);
  const roleLabel = formatRole(state.capabilities?.role || currentUserProfile?.role || '');
  const overdueMetric = qltdWeeklyGetOverdueMetric(model, qltdWeeklyWorkspaceTab);
  const showLoadedWorkspace = !state.loading || state.refreshing || state.items.length || state.updates.length;
  return `<section class="weekly-update-panel" aria-label="Cập nhật kết quả tuần">
    <header class="weekly-page-header">
      <div>
        <p class="weekly-eyebrow">Báo cập nhật</p>
        <h2>CẬP NHẬT KẾT QUẢ TUẦN</h2>
        <span>${escapeHtml(projectName)}${deptName ? ` · ${escapeHtml(deptName)}` : ''} · ${escapeHtml(roleLabel)} · ${canUpdate ? 'Được cập nhật trong phạm vi phòng/ban' : 'Chỉ xem theo quyền hiện tại'}</span>
      </div>
      <div class="single-week-toolbar">
        <button type="button" data-week-nav="prev" aria-label="Tuần trước">← Tuần trước</button>
        <div><span>Tuần ${escapeHtml(weekInfo.weekNo)} · ${escapeHtml(weekInfo.year)}</span><strong>${escapeHtml(formatIsoDateVi(week.weekStart))} – ${escapeHtml(formatIsoDateVi(week.weekEnd))}</strong><small>Thứ Hai – Chủ nhật</small></div>
        <button type="button" data-week-nav="today">Tuần hiện tại</button>
        <button type="button" data-week-nav="next" aria-label="Tuần sau">Tuần sau →</button>
        <label class="weekly-week-picker">Chọn tuần<input id="weeklyWeekPicker" type="date" value="${escapeHtml(week.weekStart)}"></label>
        <button id="weeklyExcelButton" type="button" ${state.loading || state.error ? 'disabled' : ''}>Xuất Excel</button>
      </div>
    </header>
    ${showLoadedWorkspace ? `<div class="weekly-summary-grid"><article><span>Mục tiêu</span><strong>${model.objectives.length}</strong></article><article><span>Công việc</span><strong>${model.tasks.length}</strong></article><article><span>Chưa cập nhật</span><strong>${model.notUpdated}</strong></article><article><span>${escapeHtml(overdueMetric.label)}</span><strong>${overdueMetric.count}</strong></article><article><span>Chờ duyệt</span><strong>${model.pending}</strong></article></div>
    <div class="weekly-workspace-tabs" role="tablist" aria-label="Không gian cập nhật tuần"><button type="button" role="tab" data-weekly-workspace-tab="objectives" aria-selected="${qltdWeeklyWorkspaceTab === 'objectives'}" class="${qltdWeeklyWorkspaceTab === 'objectives' ? 'is-active' : ''}">MỤC TIÊU <span>${model.objectives.length}</span></button><button type="button" role="tab" data-weekly-workspace-tab="tasks" aria-selected="${qltdWeeklyWorkspaceTab === 'tasks'}" class="${qltdWeeklyWorkspaceTab === 'tasks' ? 'is-active' : ''}">CÔNG VIỆC <span>${model.tasks.length}</span></button></div>` : ''}
    ${state.loading ? '<div class="weekly-loading-state" role="status">Đang tải dữ liệu tuần mới...</div>' : ''}
    ${state.refreshing ? '<div class="weekly-loading-state" role="status">Đang làm mới dữ liệu tuần...</div>' : ''}
    ${state.refreshWarning ? `<div class="weekly-error-state" role="alert"><p>${escapeHtml(state.refreshWarning)}</p><button type="button" class="secondary-button" data-weekly-retry>Thử lại</button></div>` : ''}
    ${state.error ? `<div class="weekly-error-state" role="alert"><p>${escapeHtml(state.error)}</p><button type="button" class="secondary-button" data-weekly-retry>Tải lại</button></div>` : ''}
    ${!state.loading && !state.error ? `${qltdWeeklyWorkspaceTab === 'tasks' ? renderWeeklyTaskFilters(visibleModel) : ''}<div class="weekly-split-view"><aside class="weekly-list-panel" aria-label="${qltdWeeklyWorkspaceTab === 'objectives' ? 'Danh sách mục tiêu' : 'Danh sách công việc'}"><div class="weekly-list-toolbar"><div><h3>${qltdWeeklyWorkspaceTab === 'objectives' ? 'MỤC TIÊU' : 'CÔNG VIỆC'}</h3><span>${qltdWeeklyWorkspaceTab === 'objectives' ? `${model.objectives.length} mục tiêu` : `Hiển thị ${visibleTasks.length}/${model.tasks.length} công việc`}</span></div></div>${qltdWeeklyWorkspaceTab === 'objectives' ? renderWeeklyObjectiveList(model.objectives, state.updates, updateContext, week, state.capabilities) : renderWeeklyTaskList(visibleTasks, state.updates, updateContext, week, { capabilities: state.capabilities, objectives: model.objectives, filtered: visibleTasks.length !== model.tasks.length })}</aside><main class="weekly-detail-panel" aria-label="Chi tiết cập nhật">${editorOpen && canUpdateSelected ? renderWeeklySelectedForm(selected, saved) : selected && qltdWeeklyNotificationDetailItemKey === qltdSelectedWeeklyItemKey ? renderWeeklyNotificationSelection(selected, saved, week) : selected && canUpdateSelected ? renderWeeklySavedSelectionPlaceholder() : selected ? renderWeeklyReadonlySelection(selected, saved, week) : `<div class="weekly-form-placeholder"><strong>CHI TIẾT ${qltdWeeklyWorkspaceTab === 'objectives' ? 'MỤC TIÊU' : 'CÔNG VIỆC'}</strong><span>${canUpdate ? 'Chọn “Cập nhật” để mở biểu mẫu.' : 'Tài khoản hiện tại chỉ có quyền xem.'}</span></div>`}${renderStandaloneBudgetWeeklyBlock(canUpdate && normalizeRoleKey(state.capabilities?.role) !== 'REPORTER' ? state.standaloneBudgetItems || [] : [])}${editorOpen && canUpdateSelected ? renderWeeklySaveActions(selected, state.capabilities) : ''}</main></div><details class="weekly-history"><summary>Các cập nhật đã lưu trong tuần (${state.updates.length})</summary>${renderWeeklySavedUpdates(state.updates, state.items, canUpdate)}</details>` : ''}
  </section>`;
}

function renderWeeklyTaskFilters(model) {
  const selected = new Set(qltdWeeklyTaskFilters.statuses || []);
  const options = [['NOT_UPDATED', 'Chưa cập nhật'], ['OVERDUE', 'Quá hạn'], ['DUE', 'Đến hạn'], ['PENDING', 'Chờ duyệt'], ['REJECTED', 'Trả lại'], ['APPROVED', 'Đã duyệt']];
  return `<section class="weekly-filter-bar" aria-label="Bộ lọc công việc"><input id="weeklyTaskSearch" type="search" value="${escapeHtml(qltdWeeklyTaskFilters.search || '')}" placeholder="Tìm WBS, tên, mã, người thực hiện..."><select id="weeklyTaskOwnership"><option value="ALL" ${qltdWeeklyTaskFilters.ownership === 'ALL' ? 'selected' : ''}>Việc của phòng</option><option value="OWNED" ${qltdWeeklyTaskFilters.ownership === 'OWNED' ? 'selected' : ''}>Tôi chủ trì</option><option value="COORDINATED" ${qltdWeeklyTaskFilters.ownership === 'COORDINATED' ? 'selected' : ''}>Tôi phối hợp</option></select><div class="weekly-filter-chips">${options.map(([code, label]) => `<label><input type="checkbox" data-weekly-filter-status="${code}" ${selected.has(code) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><button type="button" class="secondary-button" data-weekly-clear-filters>Xóa bộ lọc</button><span class="weekly-filter-result">${model.visibleTasks.length}/${model.tasks.length} kết quả</span></section>`;
}

function isNotificationWeeklyHighlight(itemKey) {
  return qltdNotificationHighlight?.kind === 'weekly' && String(qltdNotificationHighlight.targetId || '') === String(itemKey || '');
}

function renderWeeklyObjectiveList(items, updates, context, week, capabilities) {
  if (!items.length) return '<p class="empty-state">Không có mục tiêu liên quan đến tuần này.</p>';
  return `<div class="weekly-objective-list">${items.map((item) => {
    const saved = findWeeklySavedUpdate(updates, item, context);
    const effective = getWeeklyEffectiveTaskState(item, saved);
    const key = `${item.itemType}:${item.itemId}`;
    const canUpdate = canUpdateWeeklyItem(item, capabilities);
    return `<article class="weekly-objective-row ${key === qltdSelectedWeeklyItemKey ? 'is-selected' : ''} ${isNotificationWeeklyHighlight(key) ? 'is-notification-target' : ''}" data-notification-weekly-key="${escapeHtml(key)}"><div><span class="mono">${escapeHtml(item.wbs || item.itemId)}</span><strong>${escapeHtml(qltdWeeklyDisplayTitle(item) || item.itemId)}</strong><div class="weekly-workflow-badges">${renderWeeklyZoneBadge(item)}</div><small>${escapeHtml(formatIsoDateVi(item.planStart) || '—')} – ${escapeHtml(formatIsoDateVi(item.planFinish) || '—')}</small></div><div><strong>${escapeHtml(effective.progress)}%</strong><span>${escapeHtml(effective.status)}</span><div class="weekly-workflow-badges">${renderWeeklyWorkflowBadges(item, saved, week)}</div></div><div>${canUpdate ? `<button type="button" class="weekly-update-button" data-weekly-select="${escapeHtml(key)}">${saved ? 'Sửa cập nhật' : 'Cập nhật'}</button>` : '<span class="weekly-readonly-action">Chỉ xem</span>'}</div></article>`;
  }).join('')}</div>`;
}

function renderWeeklyTaskList(items, updates, context, week, options = {}) {
  if (!items.length) return `<p class="empty-state">${options.filtered ? 'Không có kết quả phù hợp với bộ lọc.' : 'Không có công việc liên quan đến tuần này.'}</p>`;
  const parentNames = new Map((options.objectives || []).map((item) => [item.itemId, qltdWeeklyDisplayTitle(item) || item.itemId]));
  return `<div class="weekly-task-groups">${items.map((item) => renderWeeklyTaskRow(item, findWeeklySavedUpdate(updates, item, context), { canUpdate: canUpdateWeeklyItem(item, options.capabilities), week, parentName: parentNames.get(item.parentMasterTaskCode || item.masterTaskCode) || item.parentMasterTaskCode || item.masterTaskCode || '—' })).join('')}</div>`;
}

function renderWeeklyTaskRow(item, saved, options = {}) {
  const updated = !!saved;
  const effective = getWeeklyEffectiveTaskState(item, saved);
  const overdueFinishDate = qltdWeeklyDateOnlyToLocalNoon(item.planFinish);
  const overdueDays = item.eligibleReason === 'OVERDUE' && overdueFinishDate ? Math.max(1, Math.floor((Date.now() - overdueFinishDate.getTime()) / 86400000)) : 0;
  const statusText = item.officialComplete ? 'Hoàn thành — 100%' : effective.status;
  const badge = updated ? 'Đã cập nhật tuần này' : overdueDays ? `Quá hạn ${overdueDays} ngày` : item.eligibleReason === 'IN_PROGRESS' ? 'Đang thực hiện' : item.eligibleReason === 'COMPLETED_THIS_WEEK' ? 'Hoàn thành trong tuần' : 'Theo kế hoạch';
  const key = `${item.itemType}:${item.itemId}`;
  const ownerDisplay = getWeeklyPersonDisplay(item.owner);
  const rowClass = [
    'weekly-task-row',
    item.progressReadonly ? 'is-summary' : '',
    key === qltdSelectedWeeklyItemKey ? 'is-selected' : '',
    isNotificationWeeklyHighlight(key) ? 'is-notification-target' : ''
  ].filter(Boolean).join(' ');
  const coordinatorDisplay = getWeeklyPersonDisplay(item.coordinator);
  return `<article class="${rowClass}" data-notification-weekly-key="${escapeHtml(key)}"><div class="weekly-task-main"><div class="weekly-task-kicker"><span class="weekly-item-type">CÔNG VIỆC</span>${renderWeeklyZoneBadge(item)}${renderBudgetFlowBadge(item)}</div><strong>${escapeHtml(item.wbs ? `${item.wbs} · ${qltdWeeklyDisplayTitle(item)}` : qltdWeeklyDisplayTitle(item))}</strong><small>Mục tiêu cha: ${escapeHtml(options.parentName || '—')}</small><small>BĐ: ${escapeHtml(formatIsoDateVi(item.planStart) || '—')} · KT: ${escapeHtml(formatIsoDateVi(item.planFinish) || '—')}</small><small title="${escapeHtml(item.owner || '')}">Chủ trì: ${escapeHtml(ownerDisplay)} · Phối hợp: ${escapeHtml(coordinatorDisplay)}</small></div><div class="weekly-task-state"><span>${escapeHtml(item.officialComplete ? 100 : effective.progress)}%</span><small>${escapeHtml(statusText)}</small><div class="weekly-workflow-badges">${renderWeeklyWorkflowBadges(item, saved, options.week)}</div><em class="weekly-task-badge ${escapeHtml(getWeeklyTaskBadgeClass(item, updated, overdueDays))}">${escapeHtml(badge)}</em></div><div class="weekly-task-actions">${options.canUpdate ? `<button type="button" class="weekly-update-button" data-weekly-select="${escapeHtml(key)}">${updated ? 'Sửa cập nhật' : 'Cập nhật'}</button>` : '<span class="weekly-readonly-action">Chỉ xem</span>'}</div></article>`;
}

function renderWeeklyReadonlySelection(selected, saved, week) {
  const effective = getWeeklyEffectiveTaskState(selected, saved);
  return `<section class="weekly-readonly-card"><strong>${escapeHtml(selected.wbs ? `${selected.wbs} · ${qltdWeeklyDisplayTitle(selected)}` : qltdWeeklyDisplayTitle(selected))}</strong><span>Tiến độ: ${escapeHtml(effective.progress)}% · ${escapeHtml(effective.status)}</span><div class="weekly-workflow-badges">${renderWeeklyWorkflowBadges(selected, saved, week)}</div><p>Bạn có thể xem dữ liệu nhưng không có quyền cập nhật trong phạm vi này.</p></section>`;
}

function renderWeeklyNotificationSelection(selected, saved, week) {
  const effective = getWeeklyEffectiveTaskState(selected, saved);
  return `<section class="weekly-readonly-card weekly-notification-detail">
    <strong>${escapeHtml(selected.wbs ? `${selected.wbs} · ${qltdWeeklyDisplayTitle(selected)}` : qltdWeeklyDisplayTitle(selected))}</strong>
    <div class="weekly-workflow-badges">${renderWeeklyWorkflowBadges(selected, saved, week)}</div>
    <span>Kết quả tuần: ${escapeHtml(saved?.thisWeekResult || '—')}</span>
    <span>Tiến độ đề xuất: ${escapeHtml(saved?.progressEnd ?? effective.progress)}% · ${escapeHtml(saved?.taskStatus || effective.status || '—')}</span>
    <span>Vướng mắc: ${escapeHtml(saved?.issue || '—')}</span>
    <span>Giải pháp/Đề xuất: ${escapeHtml(saved?.recommendation || '—')}</span>
    ${saved?.reviewReason ? `<p><strong>Lý do trả lại:</strong> ${escapeHtml(saved.reviewReason)}</p>` : ''}
  </section>`;
}

function renderWeeklySavedSelectionPlaceholder() {
  return '<div class="weekly-form-placeholder"><strong>ĐÃ LƯU CẬP NHẬT</strong><span>Đã lưu cập nhật. Bấm “Cập nhật” để mở lại biểu mẫu.</span></div>';
}

function getWeeklyTaskBadgeClass(item, updated, overdueDays) {
  if (updated) return 'is-updated';
  if (overdueDays) return 'is-overdue';
  if (item.eligibleReason === 'IN_PROGRESS') return 'is-in-progress';
  if (item.eligibleReason === 'COMPLETED_THIS_WEEK') return 'is-completed';
  return 'is-planned';
}

function getWeeklyPersonDisplay(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  const withoutAngles = text.replace(/\s*<[^>]*>/g, '');
  const withoutEmails = withoutAngles.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '');
  return withoutEmails.replace(/\s{2,}/g, ' ').replace(/\s+[,;]\s*$/g, '').trim() || '—';
}

function getBudgetFlowType(item) {
  const raw = String(item?.budgetFlowType || item?.cashFlowType || item?.flowType || item?.budgetGroup || item?.budgetStage || item?.budgetItemName || '').trim().toUpperCase();
  if (raw.includes('THU') || raw.includes('DOANH')) return 'THU';
  if (raw.includes('CHI') || raw.includes('PHÍ') || raw.includes('PHI')) return 'CHI';
  return '';
}

function getBudgetFlowLabels(item) {
  const flow = getBudgetFlowType(item);
  if (flow === 'THU') {
    return { flow, badge: 'KHOẢN THU', plan: 'Kế hoạch thu', actual: 'Thu thực tế trong tuần', cumulative: 'Lũy kế đã thu', remaining: 'Còn phải thu', note: 'Giải trình/Ghi chú khoản thu' };
  }
  if (flow === 'CHI') {
    return { flow, badge: 'KHOẢN CHI', plan: 'Kế hoạch chi', actual: 'Chi thực tế trong tuần', cumulative: 'Lũy kế đã chi', remaining: 'Ngân sách còn lại', note: 'Giải trình/Ghi chú khoản chi' };
  }
  return { flow: '', badge: 'CHƯA PHÂN LOẠI THU/CHI', plan: 'Kế hoạch ngân sách', actual: 'Giá trị thực tế trong tuần', cumulative: 'Lũy kế thực hiện', remaining: 'Còn lại', note: 'Giải trình/Ghi chú ngân sách' };
}

function renderBudgetFlowBadge(item) {
  if (!item?.hasBudget && !item?.approvedBudget) return '';
  const labels = getBudgetFlowLabels(item);
  return `<span class="budget-flow-badge ${labels.flow ? `is-${labels.flow.toLowerCase()}` : 'is-unknown'}">${escapeHtml(labels.badge)}</span>`;
}

function renderWeeklyBudgetBlock(selected, saved) {
  const items = getTaskLinkedBudgetItems(selected);
  if (!items.length) {
    return '<section class="weekly-form-section weekly-budget-section"><div class="weekly-form-section-title"><span>NGÂN SÁCH GẮN CÔNG VIỆC</span></div><p class="weekly-update-note">Chưa có khoản ngân sách gắn công việc</p></section>';
  }
  const drafts = qltdWeeklyTaskView.budgetDrafts || {};
  return `<section class="weekly-form-section weekly-budget-section"><div class="weekly-form-section-title"><span>NGÂN SÁCH GẮN CÔNG VIỆC</span></div><div class="weekly-standalone-budget-grid">${items.map((item) => {
    const labels = getBudgetFlowLabels(item);
    const code = String(item.budgetItemCode || '').trim();
    const draft = drafts[code] || {};
    const actualLabel = labels.flow === 'CHI' ? 'Chi thực hiện tuần này' : labels.flow === 'THU' ? 'Thu thực hiện tuần này' : 'Thực hiện tuần này';
    const noteLabel = labels.flow === 'CHI' ? 'Ghi chú chi' : labels.flow === 'THU' ? 'Ghi chú thu' : 'Ghi chú ngân sách';
    const plan = Number(item.approvedBudget || item.allocatedAmount || 0);
    const cumulative = Number(item.actualCumulative || item.cumulativeActual || 0);
    const remaining = Number(item.remainingBudget ?? item.remaining ?? Math.max(0, plan - cumulative));
    return `<article data-task-budget-item-code="${escapeHtml(code)}">${renderBudgetFlowBadge(item)}<strong>${escapeHtml(item.budgetItemName || code)}</strong><span>Khoản: ${escapeHtml(item.budgetItemName || code)}</span><span>Trần được giao: ${formatWeeklyCurrency(plan)}</span><span>${escapeHtml(actualLabel)}: ${formatWeeklyCurrency(item.actualThisWeek || 0)}</span><span>${escapeHtml(labels.cumulative)}: ${formatWeeklyCurrency(cumulative)}</span><span>${escapeHtml(labels.remaining)}: ${formatWeeklyCurrency(remaining)}</span><div class="weekly-update-field"><label>${escapeHtml(actualLabel)}</label><input type="text" inputmode="decimal" autocomplete="off" data-weekly-budget-amount="${escapeHtml(code)}" value="${escapeHtml(draft.amount || '')}"></div><div class="weekly-update-field"><label>${escapeHtml(noteLabel)}</label><textarea data-weekly-budget-note="${escapeHtml(code)}">${escapeHtml(draft.note || '')}</textarea></div><small>${escapeHtml(item.budgetGroup || item.budgetStage || '')}</small></article>`;
  }).join('')}</div></section>`;
}

function getTaskLinkedBudgetItems(selected) {
  if (Array.isArray(selected?.taskLinkedBudgetItems) && selected.taskLinkedBudgetItems.length) return selected.taskLinkedBudgetItems;
  if (String(selected?.budgetType || '').trim().toUpperCase() !== 'TASK_LINKED' || !selected?.budgetItemCode) return [];
  return [{
    budgetItemCode: selected.budgetItemCode,
    budgetItemName: selected.budgetItemName,
    budgetType: selected.budgetType,
    budgetGroup: selected.budgetGroup,
    budgetStage: selected.budgetStage,
    approvedBudget: selected.plannedBudget,
    allocationCode: selected.allocationCode || '',
    flowType: selected.budgetFlowType || '',
    budgetFlowType: selected.budgetFlowType || '',
    masterTaskCode: selected.masterTaskCode || '',
    pbTaskCode: selected.pbTaskCode || '',
    actualThisWeek: selected.taskLinkedBudgetThisWeek || 0,
    actualCumulative: selected.taskLinkedBudgetCumulative || selected.actualBudget || 0,
    remainingBudget: Math.max(0, Number(selected.plannedBudget || 0) - Number(selected.actualBudget || 0))
  }];
}

function renderStandaloneBudgetWeeklyBlock(items) {
  if (!Array.isArray(items) || !items.length) return '';
  const drafts = qltdWeeklyTaskView.budgetDrafts || {};
  return `<section class="weekly-standalone-budget"><h3>Ngân sách độc lập phòng/ban trong tuần</h3><div class="weekly-standalone-budget-grid">${items.map((item) => {
    const labels = getBudgetFlowLabels(item);
    const code = String(item.budgetItemCode || '').trim();
    const draft = drafts[code] || {};
    const actualLabel = labels.flow === 'CHI' ? 'Chi thực hiện tuần này' : labels.flow === 'THU' ? 'Thu thực hiện tuần này' : 'Thực hiện tuần này';
    const noteLabel = labels.flow === 'CHI' ? 'Ghi chú chi' : labels.flow === 'THU' ? 'Ghi chú thu' : 'Ghi chú ngân sách';
    return `<article data-budget-item-code="${escapeHtml(code)}">${renderBudgetFlowBadge(item)}<strong>${escapeHtml(item.budgetItemName || code)}</strong><span>${escapeHtml(labels.plan)}: ${formatWeeklyCurrency(item.approvedBudget || 0)}</span><span>${escapeHtml(actualLabel)}: ${formatWeeklyCurrency(item.actualThisWeek || 0)}</span><span>${escapeHtml(labels.cumulative)}: ${formatWeeklyCurrency(item.actualCumulative || 0)}</span><span>${escapeHtml(labels.remaining)}: ${formatWeeklyCurrency(item.remainingBudget ?? item.approvedBudget ?? 0)}</span><div class="weekly-update-field"><label>${escapeHtml(actualLabel)}</label><input type="text" inputmode="decimal" autocomplete="off" data-weekly-budget-amount="${escapeHtml(code)}" value="${escapeHtml(draft.amount || '')}"></div><div class="weekly-update-field"><label>${escapeHtml(noteLabel)}</label><textarea data-weekly-budget-note="${escapeHtml(code)}">${escapeHtml(draft.note || '')}</textarea></div><small>${escapeHtml(item.budgetGroup || item.budgetStage || '')}</small></article>`;
  }).join('')}</div></section>`;
}

function normalizeWeeklyBudgetAmount(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: 0, empty: true, error: '' };
  let normalized = raw.replace(/\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(normalized)) normalized = normalized.replace(/,/g, '');
  else normalized = normalized.replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return { value: 0, empty: false, error: 'Số tiền ngân sách không hợp lệ.' };
  if (amount < 0) return { value: amount, empty: false, error: 'Số tiền ngân sách không được âm.' };
  return { value: amount, empty: false, error: '' };
}

function buildWeeklyBudgetUpdates(projectCode, deptCode, weekCode, selectedItem = null) {
  const drafts = qltdWeeklyTaskView.budgetDrafts || {};
  const updates = [];
  const appendBudgetUpdate = (item, budgetType, masterTaskCode, pbTaskCode) => {
    const code = String(item.budgetItemCode || '').trim();
    const draft = drafts[code];
    if (!draft?.dirty) return '';
    const amount = normalizeWeeklyBudgetAmount(draft.amount);
    if (amount.error) return `${item.budgetItemName || code}: ${amount.error}`;
    if (amount.empty || amount.value === 0) return '';
    updates.push({
      budgetItemCode: code,
      allocationCode: item.allocationCode || '',
      budgetType,
      flowType: getBudgetFlowType(item),
      projectCode,
      deptCode,
      periodType: 'WEEK',
      periodCode: weekCode,
      actualAmount: amount.value,
      note: String(draft.note || '').trim(),
      masterTaskCode: masterTaskCode || '',
      pbTaskCode: pbTaskCode || ''
    });
    return '';
  };
  for (const item of getTaskLinkedBudgetItems(selectedItem)) {
    const error = appendBudgetUpdate(item, 'TASK_LINKED', item.masterTaskCode || selectedItem?.masterTaskCode || selectedItem?.itemId || '', item.pbTaskCode || '');
    if (error) return { updates: [], error };
  }
  for (const item of qltdWeeklyTaskView.standaloneBudgetItems || []) {
    const error = appendBudgetUpdate(item, 'DEPT_STANDALONE', '', '');
    if (error) return { updates: [], error };
  }
  return { updates, error: '' };
}

function getWeeklySaveRequestId() {
  if (!qltdWeeklySaveRequestId) {
    const token = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    qltdWeeklySaveRequestId = `weekly_${token}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  }
  return qltdWeeklySaveRequestId;
}

function normalizeWeeklyStatusKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function isWeeklyCompletionValue(progress, status, actualFinish = '') {
  const key = normalizeWeeklyStatusKey(status);
  return key.includes('hoanthanh') || key.includes('complete') || key.includes('done');
}

function isWeeklyStartedValue(status) {
  const key = normalizeWeeklyStatusKey(status);
  return key.includes('danglam') || key.includes('dangthuchien');
}

function renderWeeklyStatusSelect(currentStatus) {
  const options = ['Chưa bắt đầu', 'Đang làm', 'Tạm dừng', 'Hoàn thành'];
  const current = String(currentStatus || '').trim();
  const values = current && !options.includes(current) ? options.concat([current]) : options;
  return `<select id="weeklyTaskStatus">${values.map((status) => `<option value="${escapeHtml(status)}" ${status === current ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select>`;
}

function renderWeeklyActualDateLifecycle(selected, saved, progressValue, statusValue) {
  const actualStart = qltdWeeklyDateInputValue(saved?.actualStart || selected.actualStart || '');
  const actualFinish = qltdWeeklyDateInputValue(saved?.actualFinish || selected.actualFinish || '');
  const isCompleted = isWeeklyCompletionValue(progressValue, statusValue, actualFinish);
  return `<div id="weeklyActualDateLifecycle" class="weekly-actual-date-lifecycle" data-existing-start="${escapeHtml(actualStart)}" data-existing-finish="${escapeHtml(actualFinish)}" data-completed="${isCompleted ? '1' : '0'}">
    <input id="weeklyTaskActualStartEdit" type="hidden" value="">
    <input id="weeklyTaskActualFinishEdit" type="hidden" value="">
    <div id="weeklyActualStartNotStarted" class="weekly-actual-state">
      <div><strong>Công việc chưa bắt đầu thực tế</strong><span>Chỉ xác nhận khi công việc đã bắt đầu.</span></div>
      <button type="button" class="secondary-button" data-actual-start-confirm>Xác nhận bắt đầu công việc</button>
    </div>
    <div id="weeklyActualStartReadonly" class="weekly-actual-state" hidden>
      <div><strong>Đã bắt đầu từ ${escapeHtml(formatIsoDateVi(actualStart) || '—')}</strong><span>Tuần sau không cần nhập lại ngày bắt đầu.</span></div>
      ${actualStart && !isCompleted ? '<button type="button" class="secondary-button" data-actual-start-edit>Sửa ngày</button>' : ''}
    </div>
    <div id="weeklyActualStartInputWrap" class="weekly-update-field" hidden>
      <label for="weeklyTaskActualStart">Ngày bắt đầu thực tế *</label>
      <input id="weeklyTaskActualStart" type="date" value="${escapeHtml(actualStart)}">
      <small>Chỉ ghi khi chưa có ngày hoặc bạn chủ động bấm “Sửa ngày”.</small>
    </div>
    <div id="weeklyActualFinishHidden" class="weekly-actual-state is-muted">
      <div><strong>Ngày hoàn thành thực tế chưa mở</strong><span>Chỉ xuất hiện khi trạng thái là Hoàn thành.</span></div>
    </div>
    <div id="weeklyActualFinishReadonly" class="weekly-actual-state" hidden>
      <div><strong>Đã hoàn thành từ ${escapeHtml(formatIsoDateVi(actualFinish) || '—')}</strong><span>Ngày hoàn thành đang ở chế độ chỉ đọc.</span></div>
    </div>
    <div id="weeklyActualFinishInputWrap" class="weekly-update-field" hidden>
      <label for="weeklyTaskActualFinish">Ngày hoàn thành thực tế *</label>
      <input id="weeklyTaskActualFinish" type="date" value="${escapeHtml(actualFinish)}">
      <small>Bắt buộc khi chọn trạng thái Hoàn thành.</small>
    </div>
  </div>`;
}

function renderWeeklySelectedForm(selected, saved) {
  const completionHint = selected.itemType === 'MASTER' ? '<p class="weekly-approval-hint">Chỉ khi chọn trạng thái Hoàn thành, hệ thống mới gửi Admin/PMO phê duyệt. Tỷ lệ hoàn thành chỉ dùng để báo cáo tiến độ.</p>' : '';
  const progressValue = saved?.progressEnd ?? selected.progress ?? 0;
  const statusValue = saved?.taskStatus || selected.status || 'Chưa bắt đầu';
  const effectiveState = getWeeklyEffectiveTaskState(selected, saved);
  const currentStatusDisplay = selected.officialComplete ? 'Hoàn thành — 100%' : `${effectiveState.status} — ${effectiveState.progress}%`;
  const ownerDisplay = getWeeklyPersonDisplay(selected.owner);
  return `<section class="weekly-inline-form"><div class="weekly-form-topbar"><div><div class="weekly-update-title">${escapeHtml(selected.wbs ? `${selected.wbs} · ${qltdWeeklyDisplayTitle(selected)}` : qltdWeeklyDisplayTitle(selected))}</div><div class="weekly-update-meta">${escapeHtml(selected.itemType)} · ${renderMasterPlanPeriod(selected)}</div></div><button type="button" class="weekly-form-close" data-weekly-close-form aria-label="Đóng">×</button></div>
    <section class="weekly-form-section weekly-task-info"><div class="weekly-form-section-title"><span>THÔNG TIN CÔNG VIỆC</span>${renderBudgetFlowBadge(selected)}</div><div class="weekly-info-grid"><div><span>Loại</span><strong>${escapeHtml(selected.itemType)}</strong></div><div title="${escapeHtml(selected.owner || '')}"><span>Chủ trì</span><strong>${escapeHtml(ownerDisplay)}</strong></div><div><span>Kế hoạch</span><strong>${escapeHtml(formatIsoDateVi(selected.planStart) || '—')} – ${escapeHtml(formatIsoDateVi(selected.planFinish) || '—')}</strong></div><div><span>Trạng thái hiện tại</span><strong>${escapeHtml(currentStatusDisplay)}</strong></div><div><span>Ngân sách gắn công việc</span><strong>${getTaskLinkedBudgetItems(selected).length ? formatWeeklyCurrency(selected.plannedBudget) : 'Chưa có khoản'}</strong></div></div>${completionHint}${saved?.approvalStatus === 'REJECTED' && saved.reviewReason ? `<p class="weekly-approval-hint">Lý do trả lại: ${escapeHtml(saved.reviewReason)}</p>` : ''}</section>
    <section class="weekly-form-section weekly-result-section"><div class="weekly-form-section-title"><span>KẾT QUẢ THỰC HIỆN TRONG TUẦN</span></div><div class="weekly-update-field"><label for="weeklyTaskResult">Kết quả thực hiện trong tuần</label><textarea id="weeklyTaskResult" placeholder="Nêu kết quả đã hoàn thành, sản phẩm đầu ra, mốc đã chốt...">${escapeHtml(saved?.thisWeekResult || '')}</textarea></div></section>
    <section class="weekly-form-section"><div class="weekly-form-section-title"><span>TÌNH TRẠNG CÔNG VIỆC</span></div><div class="weekly-update-grid"><div class="weekly-update-field"><label for="weeklyTaskProgress">Mức hoàn thành đến hết tuần (%)</label><input id="weeklyTaskProgress" type="number" min="0" max="100" step="1" value="${escapeHtml(progressValue)}"></div><div class="weekly-update-field"><label for="weeklyTaskStatus">Trạng thái công việc</label>${renderWeeklyStatusSelect(statusValue)}</div>${renderWeeklyActualDateLifecycle(selected, saved, progressValue, statusValue)}</div></section>
    <section class="weekly-form-section weekly-issue-section"><div class="weekly-form-section-title"><span>VƯỚNG MẮC VÀ XỬ LÝ</span></div><div class="weekly-update-grid"><div class="weekly-update-field"><label for="weeklyTaskIssue">Vướng mắc/Rủi ro</label><textarea id="weeklyTaskIssue" placeholder="Nêu vướng mắc, nguyên nhân, tác động nếu có...">${escapeHtml(saved?.issue || '')}</textarea></div><div class="weekly-update-field"><label for="weeklyTaskRecommendation">Giải pháp/Đề xuất</label><textarea id="weeklyTaskRecommendation" placeholder="Nêu hướng xử lý, người/phòng cần phối hợp, đề xuất quyết định...">${escapeHtml(saved?.recommendation || '')}</textarea></div></div></section>
    ${qltdWeeklyTaskView.capabilities?.canWriteBudget === false ? '' : renderWeeklyBudgetBlock(selected, saved)}</section>`;
}

function renderWeeklySaveActions(selected, capabilities = {}) {
  const submitForApproval = normalizeRoleKey(capabilities.role || currentUserProfile?.role) === 'REPORTER' &&
    !qltdWeeklyIsDelegatedManager(capabilities) &&
    selected?.itemType === 'PB_DETAIL';
  return `<div class="weekly-update-actions"><button type="button" class="secondary-button" data-weekly-close-form>Hủy thay đổi</button><div><button id="saveWeeklyTaskUpdateButton" type="button" class="weekly-update-button" data-default-label="${submitForApproval ? 'Gửi duyệt' : 'Lưu báo cáo tuần'}">${submitForApproval ? 'Gửi duyệt' : 'Lưu báo cáo tuần'}</button><span id="weeklyTaskSaveStatus" class="weekly-update-note"></span></div></div>`;
}

function bindWeeklyTaskUpdateControls() {
  document.querySelectorAll('[data-week-nav]').forEach((button) => {
    button.onclick = () => { if (button.dataset.weekNav === 'today') { qltdSelectedWeekId = qltdCurrentWeekPeriod().weekId; qltdSelectedWeeklyItemKey = ''; qltdWeeklyEditingItemKey = ''; qltdWeeklyNotificationDetailItemKey = ''; qltdWeeklyForcedItem = null; } else qltdShiftSelectedWeek(button.dataset.weekNav === 'prev' ? -7 : 7); qltdWeeklyResetTaskFilters(); renderWeeklyTaskRegion(); loadWeeklyTaskDataForCurrent(); };
  });
  const weekPicker = document.getElementById('weeklyWeekPicker');
  if (weekPicker) weekPicker.onchange = () => {
    const period = qltdWeekPeriodFromDateValue(weekPicker.value);
    if (!period) return;
    qltdSelectedWeekId = period.weekId;
    qltdSelectedWeeklyItemKey = '';
    qltdWeeklyEditingItemKey = '';
    qltdWeeklyNotificationDetailItemKey = '';
    qltdWeeklyForcedItem = null;
    qltdWeeklyResetTaskFilters();
    renderWeeklyTaskRegion();
    loadWeeklyTaskDataForCurrent();
  };
  document.querySelectorAll('[data-weekly-workspace-tab]').forEach((button) => {
    button.onclick = () => {
      qltdWeeklyWorkspaceTab = button.dataset.weeklyWorkspaceTab === 'tasks' ? 'tasks' : 'objectives';
      qltdSelectedWeeklyItemKey = '';
      qltdWeeklyEditingItemKey = '';
      qltdWeeklyNotificationDetailItemKey = '';
      renderWeeklyTaskRegion();
    };
  });
  document.querySelectorAll('[data-weekly-select]').forEach((button) => { button.onclick = () => { qltdSelectedWeeklyItemKey = button.dataset.weeklySelect || ''; qltdWeeklyEditingItemKey = qltdSelectedWeeklyItemKey; qltdWeeklyNotificationDetailItemKey = ''; renderWeeklyTaskRegion(); }; });
  document.querySelectorAll('[data-weekly-master-details]').forEach((button) => { button.onclick = () => { const payload = qltdDeptPlanPayload || {}; const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || {}; openDetailStatusPopup(payload, dept, button.dataset.weeklyMasterDetails || ''); }; });
  document.querySelectorAll('[data-weekly-item]').forEach((button) => { button.onclick = () => { qltdWeeklyWorkspaceTab = button.dataset.weeklyItemType === 'PB_DETAIL' ? 'tasks' : 'objectives'; if (qltdWeeklyWorkspaceTab === 'tasks') qltdWeeklyResetTaskFilters(); qltdSelectedWeeklyItemKey = button.dataset.weeklyItem || ''; qltdWeeklyEditingItemKey = qltdSelectedWeeklyItemKey; qltdWeeklyNotificationDetailItemKey = ''; renderWeeklyTaskRegion(); }; });
  const close = document.querySelector('[data-weekly-close-form]'); if (close) close.onclick = () => { qltdSelectedWeeklyItemKey = ''; qltdWeeklyEditingItemKey = ''; qltdWeeklyNotificationDetailItemKey = ''; renderWeeklyTaskRegion(); };
  const search = document.getElementById('weeklyTaskSearch');
  if (search) search.onchange = () => { qltdWeeklyTaskFilters.search = search.value || ''; renderWeeklyTaskRegion(); };
  const ownership = document.getElementById('weeklyTaskOwnership');
  if (ownership) ownership.onchange = () => { qltdWeeklyTaskFilters.ownership = ownership.value || 'ALL'; renderWeeklyTaskRegion(); };
  document.querySelectorAll('[data-weekly-filter-status]').forEach((input) => {
    input.onchange = () => {
      qltdWeeklyTaskFilters.statuses = Array.from(document.querySelectorAll('[data-weekly-filter-status]:checked')).map((item) => item.dataset.weeklyFilterStatus);
      renderWeeklyTaskRegion();
    };
  });
  const clearFilters = document.querySelector('[data-weekly-clear-filters]');
  if (clearFilters) clearFilters.onclick = () => { qltdWeeklyResetTaskFilters(); renderWeeklyTaskRegion(); };
  const retry = document.querySelector('[data-weekly-retry]');
  if (retry) retry.onclick = () => loadWeeklyTaskDataForCurrent({ force: true });
  const progress = document.getElementById('weeklyTaskProgress');
  const status = document.getElementById('weeklyTaskStatus');
  if (progress) progress.oninput = () => { syncWeeklyActualDateLifecycle(); syncWeeklyBudgetValidation(); };
  if (status) status.onchange = () => {
    const startInput = document.getElementById('weeklyTaskActualStart');
    const startEdit = document.getElementById('weeklyTaskActualStartEdit');
    const root = document.getElementById('weeklyActualDateLifecycle');
    if (isWeeklyStartedValue(status.value) && !root?.dataset.existingStart) {
      if (startEdit) startEdit.value = 'confirm';
      if (startInput && !startInput.value) startInput.value = getTodayIsoLocal();
    }
    syncWeeklyActualDateLifecycle();
  };
  document.querySelectorAll('[data-actual-start-confirm]').forEach((button) => {
    button.onclick = () => {
      const edit = document.getElementById('weeklyTaskActualStartEdit');
      const input = document.getElementById('weeklyTaskActualStart');
      if (edit) edit.value = 'confirm';
      if (progress && Number(progress.value || 0) <= 0) progress.value = '1';
      if (input && !input.value) input.value = getTodayIsoLocal();
      syncWeeklyActualDateLifecycle();
      input?.focus();
    };
  });
  document.querySelectorAll('[data-actual-start-edit]').forEach((button) => {
    button.onclick = () => {
      const edit = document.getElementById('weeklyTaskActualStartEdit');
      const input = document.getElementById('weeklyTaskActualStart');
      if (edit) edit.value = 'edit';
      syncWeeklyActualDateLifecycle();
      input?.focus();
    };
  });
  const budget = document.getElementById('weeklyTaskBudget');
  if (budget) budget.oninput = syncWeeklyBudgetValidation;
  document.querySelectorAll('[data-weekly-budget-amount], [data-weekly-budget-note]').forEach((input) => {
    input.oninput = () => {
      const code = input.dataset.weeklyBudgetAmount || input.dataset.weeklyBudgetNote || '';
      const drafts = qltdWeeklyTaskView.budgetDrafts || (qltdWeeklyTaskView.budgetDrafts = {});
      const draft = drafts[code] || (drafts[code] = { amount: '', note: '', dirty: false });
      if (input.dataset.weeklyBudgetAmount !== undefined) draft.amount = input.value;
      else draft.note = input.value;
      draft.dirty = true;
      qltdWeeklySaveRequestId = '';
    };
  });
  syncWeeklyActualDateLifecycle();
  syncWeeklyBudgetValidation();
  const save = document.getElementById('saveWeeklyTaskUpdateButton'); if (save) save.onclick = saveWeeklyTaskUpdate;
  const excel = document.getElementById('weeklyExcelButton'); if (excel) excel.onclick = exportWeeklyReportExcel;
}

const QLTD_WEEKLY_EXPORT_HEADERS = [
  'STT', 'WBS', 'Zone', 'Hạng mục', 'Nội dung mục tiêu/công việc', 'Chủ trì', 'Phối hợp',
  'Bắt đầu KH', 'Kết thúc KH', 'Kết quả thực hiện trong tuần',
  'Tiến độ cuối tuần', 'Trạng thái công việc', 'Vướng mắc/Rủi ro', 'Giải pháp/Đề xuất'
];
const QLTD_WEEKLY_EXPORT_KEYS = [
  'sequence', 'wbs', 'zone', 'hangMuc', 'content', 'owner', 'coordinator', 'planStart',
  'planFinish', 'weekResult', 'progress', 'status', 'issue', 'recommendation'
];

const QLTD_WEEKLY_NEXT_EXPORT_HEADERS = [
  'STT', 'WBS', 'Zone', 'Hạng mục', 'Nội dung mục tiêu/công việc', 'Chủ trì', 'Phối hợp',
  'Bắt đầu KH', 'Kết thúc KH', 'Tiến độ hiện tại', 'Trạng thái hiện tại',
  'Nhóm kế hoạch tuần sau', 'Vướng mắc/Rủi ro hiện tại', 'Giải pháp/Đề xuất'
];
const QLTD_WEEKLY_NEXT_EXPORT_KEYS = [
  'sequence', 'wbs', 'zone', 'hangMuc', 'content', 'owner', 'coordinator', 'planStart',
  'planFinish', 'progress', 'status', 'planGroup', 'issue', 'recommendation'
];

function qltdWeeklyExportItemKey(item) {
  const type = String(item?.itemType || '').trim().toUpperCase();
  const itemId = String(item?.itemId || '').trim();
  return type && itemId ? `${type}:${itemId}` : '';
}

function qltdWeeklyEnrichExportItemsWithParentMasters(items, masters) {
  const sourceItems = qltdWeeklyEnrichItemsForDisplay(Array.isArray(items) ? items.slice() : [], { masters });
  const existingMasterCodes = new Set();
  sourceItems.forEach((item) => {
    if (String(item?.itemType || '').trim().toUpperCase() !== 'MASTER') return;
    [item.itemId, item.masterTaskCode].forEach((value) => {
      const key = normalizeWeeklyUpdateMatchValue(value);
      if (key) existingMasterCodes.add(key);
    });
  });
  const referencedParentCodes = new Set();
  sourceItems.forEach((item) => {
    if (String(item?.itemType || '').trim().toUpperCase() !== 'PB_DETAIL') return;
    const key = normalizeWeeklyUpdateMatchValue(item.parentMasterTaskCode || item.masterTaskCode);
    if (key) referencedParentCodes.add(key);
  });
  const deptMastersByCode = new Map();
  (Array.isArray(masters) ? masters : []).forEach((master) => {
    const key = normalizeWeeklyUpdateMatchValue(master?.masterCode);
    if (key && !deptMastersByCode.has(key)) deptMastersByCode.set(key, master);
  });
  const additions = [];
  referencedParentCodes.forEach((parentCode) => {
    if (existingMasterCodes.has(parentCode)) return;
    const master = deptMastersByCode.get(parentCode);
    if (!master) return;
    const masterCode = String(master.masterCode || '').trim();
    const exportItem = {
      itemType: 'MASTER',
      itemId: masterCode,
      masterTaskCode: masterCode,
      wbs: getDeptPlanMasterWbs(master) || String(master.wbs || '').trim(),
      taskName: master.taskName || '',
      planStart: master.planStart || '',
      planFinish: master.planFinish || '',
      actualStart: master.actualStart || '',
      actualFinish: master.actualFinish || '',
      progress: Number.isFinite(Number(master.progress)) ? Number(master.progress) : 0,
      status: master.status || '',
      owner: master.owner || '',
      coordinator: master.coordinator || ''
    };
    if (master.officialComplete !== undefined) exportItem.officialComplete = !!master.officialComplete;
    additions.push(exportItem);
    existingMasterCodes.add(parentCode);
  });
  return sourceItems.concat(additions);
}

function qltdWeeklyNaturalWbsCompare(left, right) {
  const tokenize = (value) => String(value || '').trim().toLocaleUpperCase('vi-VN').match(/\d+|\D+/g) || [];
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const length = Math.max(leftTokens.length, rightTokens.length);
  for (let index = 0; index < length; index += 1) {
    if (leftTokens[index] === undefined) return -1;
    if (rightTokens[index] === undefined) return 1;
    const leftNumber = /^\d+$/.test(leftTokens[index]) ? Number(leftTokens[index]) : null;
    const rightNumber = /^\d+$/.test(rightTokens[index]) ? Number(rightTokens[index]) : null;
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
    const compared = leftTokens[index].localeCompare(rightTokens[index], 'vi', { sensitivity: 'base' });
    if (compared) return compared;
  }
  return 0;
}

function qltdWeeklyExportDateValue(value, includeTime = false) {
  const fromLocalClock = (date) => new Date(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    includeTime ? date.getHours() : 0,
    includeTime ? date.getMinutes() : 0,
    includeTime ? date.getSeconds() : 0
  ));
  const fromParts = (year, month, day, hour = 0, minute = 0, second = 0) => {
    const date = new Date(Date.UTC(year, month - 1, day, includeTime ? hour : 0, includeTime ? minute : 0, includeTime ? second : 0));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : '';
  };
  if (value instanceof Date && !isNaN(value.getTime())) return fromLocalClock(value);
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (iso) {
    if (includeTime && text.includes('T') && (text.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(text))) {
      const parsed = new Date(text);
      if (!isNaN(parsed.getTime())) return fromLocalClock(parsed);
    }
    return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0));
  }
  const vi = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (vi) return fromParts(Number(vi[3]), Number(vi[2]), Number(vi[1]), Number(vi[4] || 0), Number(vi[5] || 0), Number(vi[6] || 0));
  return text;
}

function qltdWeeklyExportTimestamp(value) {
  const parsed = qltdWeeklyExportDateValue(value, true);
  return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed.getTime() : null;
}

function qltdWeeklyLatestExportUpdates(updates, context) {
  const expected = {
    projectCode: normalizeWeeklyUpdateMatchValue(context?.projectCode),
    deptCode: normalizeWeeklyUpdateMatchValue(context?.deptCode),
    weekCode: normalizeWeeklyUpdateMatchValue(context?.weekCode)
  };
  const selected = new Map();
  (Array.isArray(updates) ? updates : []).forEach((update, sourceIndex) => {
    if (normalizeWeeklyUpdateMatchValue(update?.projectCode) !== expected.projectCode ||
        normalizeWeeklyUpdateMatchValue(update?.deptCode) !== expected.deptCode ||
        normalizeWeeklyUpdateMatchValue(update?.weekCode) !== expected.weekCode) return;
    const key = qltdWeeklyExportItemKey(update);
    if (!key) return;
    const timestamp = qltdWeeklyExportTimestamp(update.updatedAt);
    const current = selected.get(key);
    const shouldReplace = !current ||
      timestamp !== null && (current.timestamp === null || timestamp >= current.timestamp) ||
      timestamp === null && current.timestamp === null && sourceIndex > current.sourceIndex;
    if (shouldReplace) selected.set(key, { update, timestamp, sourceIndex });
  });
  return new Map(Array.from(selected, ([key, entry]) => [key, entry.update]));
}

function qltdWeeklyNextPlanGroupLabel(value) {
  const code = String(value || '').trim().toUpperCase();
  if (code === 'OVERDUE') return 'Quá hạn chuyển tiếp';
  if (code === 'IN_PROGRESS') return 'Tiếp tục thực hiện';
  if (code === 'PLANNED') return 'Bắt đầu/Thực hiện trong tuần sau';
  if (code === 'COMPLETED_THIS_WEEK') return 'Dự kiến hoàn thành trong tuần sau';
  return code ? 'Kế hoạch khác' : 'Theo kế hoạch';
}

function qltdWeeklyBuildExportModel(items, updates, context, week, reportType = 'CURRENT') {
  const uniqueItems = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item, sourceIndex) => {
    const key = qltdWeeklyExportItemKey(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueItems.push({ item, sourceIndex });
  });
  const latestUpdates = qltdWeeklyLatestExportUpdates(updates, context);
  const masters = uniqueItems.filter((entry) => String(entry.item.itemType || '').toUpperCase() === 'MASTER');
  const details = uniqueItems.filter((entry) => String(entry.item.itemType || '').toUpperCase() === 'PB_DETAIL');
  const compareWbs = (left, right) => {
    const leftWbs = String(left.item.wbs || '').trim();
    const rightWbs = String(right.item.wbs || '').trim();
    if (leftWbs && rightWbs) return qltdWeeklyNaturalWbsCompare(leftWbs, rightWbs) || left.sourceIndex - right.sourceIndex;
    if (leftWbs) return -1;
    if (rightWbs) return 1;
    return left.sourceIndex - right.sourceIndex;
  };
  masters.sort(compareWbs);

  const masterAliases = new Map();
  masters.forEach((entry) => {
    [entry.item.itemId, entry.item.masterTaskCode].forEach((value) => {
      const key = normalizeWeeklyUpdateMatchValue(value);
      if (key && !masterAliases.has(key)) masterAliases.set(key, entry);
    });
  });
  const children = new Map(masters.map((entry) => [entry, []]));
  const orphans = [];
  details.forEach((entry) => {
    const parentKey = normalizeWeeklyUpdateMatchValue(entry.item.parentMasterTaskCode || entry.item.masterTaskCode);
    const parent = masterAliases.get(parentKey);
    if (parent) children.get(parent).push(entry);
    else orphans.push(entry);
  });
  const compareDetails = (left, right) => {
    const leftWbs = String(left.item.wbs || '').trim();
    const rightWbs = String(right.item.wbs || '').trim();
    if (leftWbs && rightWbs) {
      const byWbs = qltdWeeklyNaturalWbsCompare(leftWbs, rightWbs);
      if (byWbs) return byWbs;
    } else if (leftWbs) return -1;
    else if (rightWbs) return 1;
    const leftFinish = String(left.item.planFinish || '9999-12-31');
    const rightFinish = String(right.item.planFinish || '9999-12-31');
    return leftFinish.localeCompare(rightFinish) || left.sourceIndex - right.sourceIndex;
  };
  children.forEach((entries) => entries.sort(compareDetails));
  orphans.sort(compareDetails);

  const ordered = [];
  masters.forEach((master) => {
    ordered.push({ ...master, level: 0, parent: null, orphan: false });
    children.get(master).forEach((detail) => ordered.push({ ...detail, level: 1, parent: master.item, orphan: false }));
  });
  orphans.forEach((detail) => ordered.push({ ...detail, level: 1, parent: null, orphan: true }));

  const rows = ordered.map((entry, index) => {
    const item = entry.item;
    const update = latestUpdates.get(qltdWeeklyExportItemKey(item)) || null;
    const effective = getWeeklyEffectiveTaskState(item, update);
    const person = (value) => String(value || '').trim() ? getWeeklyPersonDisplay(value) : '';
    const text = (value) => value === undefined || value === null ? '' : String(value);
    const isNextWeek = reportType === 'NEXT';
    const itemProgress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0;
    const overdue = isNextWeek
      ? String(item.eligibleReason || '').trim().toUpperCase() === 'OVERDUE'
      : qltdWeeklyIsOverdue(item, update, week);
    const cells = {
      sequence: index + 1,
      wbs: text(item.wbs),
      zone: text(item.ownZone),
      hangMuc: text(item.ownHangMuc),
      content: text(qltdWeeklyDisplayTitle(item, entry.parent) || item.taskName),
      owner: person(item.owner),
      coordinator: person(item.coordinator),
      planStart: qltdWeeklyExportDateValue(item.planStart),
      planFinish: qltdWeeklyExportDateValue(item.planFinish),
      progress: isNextWeek ? itemProgress : (Number.isFinite(Number(effective.progress)) ? Number(effective.progress) : 0),
      status: text(isNextWeek ? item.status : effective.status),
      weekResult: isNextWeek ? '' : text(update?.thisWeekResult),
      planGroup: isNextWeek ? qltdWeeklyNextPlanGroupLabel(item.eligibleReason) : '',
      issue: text(update?.issue),
      recommendation: text(update?.recommendation)
    };
    const keys = isNextWeek ? QLTD_WEEKLY_NEXT_EXPORT_KEYS : QLTD_WEEKLY_EXPORT_KEYS;
    const values = keys.map((key) => cells[key]);
    return {
      item,
      update,
      level: entry.level,
      orphan: entry.orphan,
      overdue,
      values
    };
  });
  return {
    rows,
    warnings: orphans.map((entry) => `PB_DETAIL không tìm thấy MASTER cha: ${entry.item.itemId || entry.item.wbs || '(không mã)'}`)
  };
}

function qltdWeeklyStyleReportSheet(sheet, metadata, reportRows, options = {}) {
  const headers = options.headers || QLTD_WEEKLY_EXPORT_HEADERS;
  const columnCount = headers.length;
  const titleRow = sheet.addRow([options.title || 'BÁO CÁO KẾT QUẢ TUẦN NÀY']);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
  titleRow.height = 30;
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  metadata.forEach(([label, value, numberFormat]) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: 'FF17365D' } };
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    if (numberFormat) row.getCell(2).numFmt = numberFormat;
    sheet.mergeCells(row.number, 2, row.number, columnCount);
  });
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.height = 34;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  reportRows.forEach((entry) => {
    const row = sheet.addRow(entry.values);
    row.height = entry.level === 0 ? 25 : 30;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9E1EA' } },
        left: { style: 'thin', color: { argb: 'FFD9E1EA' } },
        bottom: { style: 'thin', color: { argb: 'FFD9E1EA' } },
        right: { style: 'thin', color: { argb: 'FFD9E1EA' } }
      };
    });
    if (entry.level === 0) {
      row.font = { bold: true, color: { argb: 'FF17365D' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } };
    } else {
      row.getCell(5).alignment = { vertical: 'top', wrapText: true, indent: 1 };
    }
    if (entry.orphan) row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    if (entry.overdue) row.getCell(options.statusColumn || 12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  });
  const dataStartRow = headerRow.number + 1;
  const dataEndRow = sheet.rowCount;
  if (dataEndRow >= dataStartRow) {
    for (let rowNumber = dataStartRow; rowNumber <= dataEndRow; rowNumber += 1) {
      sheet.getCell(rowNumber, 2).numFmt = '@';
      sheet.getCell(rowNumber, 8).numFmt = 'dd/mm/yyyy';
      sheet.getCell(rowNumber, 9).numFmt = 'dd/mm/yyyy';
      sheet.getCell(rowNumber, options.progressColumn || 11).numFmt = '0"%"';
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number, showGridLines: false }];
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: columnCount }
  };
  (options.widths || [7, 14, 16, 18, 44, 22, 22, 16, 16, 38, 18, 22, 32, 32])
    .forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function qltdWeeklyBuildExportMetadata(payload, dept, week, exportedAt) {
  const weekInfo = qltdWeeklyGetIsoWeekInfo(week);
  const projectCode = String(payload?.projectCode || '').trim();
  const deptCode = String(dept?.deptCode || dept?.sheetName || '').trim();
  return [
    ['Dự án', payload?.projectName || projectCode],
    ['Phòng/ban', dept?.deptName || dept?.displayName || dept?.name || deptCode],
    ['Tuần số / năm', `Tuần ${weekInfo.weekNo} / ${weekInfo.year}`],
    ['Từ ngày – đến ngày', `${formatIsoDateVi(week.weekStart)} – ${formatIsoDateVi(week.weekEnd)}`],
    ['Thời điểm xuất', qltdWeeklyExportDateValue(exportedAt, true), 'dd/mm/yyyy hh:mm'],
    ['Người xuất', currentUserProfile?.fullName || currentUserProfile?.name || currentUserProfile?.email || '']
  ];
}

async function exportWeeklyReportExcel() {
  if (!canExportExcel()) {
    alert('Bạn cần đăng nhập để xuất Excel.');
    return;
  }
  const button = document.getElementById('weeklyExcelButton');
  const previousText = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Đang xuất...';
  }
  try {
    const payload = qltdDeptPlanPayload || {};
    const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || {};
    const projectCode = String(payload.projectCode || '').trim();
    const deptCode = String(dept.deptCode || dept.sheetName || '').trim();
    const week = qltdGetSelectedWeekPeriod();
    if (!projectCode || !deptCode || !week) throw new Error('Chưa đủ dự án, phòng/ban hoặc kỳ tuần để xuất.');

    const nextWeek = getNextWeeklyPeriod(week);
    const nextResult = await fetchBackendJson('work_listweeklyitems', {
      email: currentUserProfile?.email || '',
      projectCode,
      deptCode,
      weekCode: nextWeek.weekId,
      weekStart: nextWeek.weekStart,
      weekEnd: nextWeek.weekEnd
    }, { auth: true });
    if (!nextResult?.success) throw new Error(getBackendErrorMessage(nextResult, 'Không tải được dữ liệu kế hoạch tuần sau.'));
    const nextData = nextResult.data || nextResult;

    const ExcelJS = await qltdWeb07LoadExcelJs();
    if (!ExcelJS) throw new Error('Thư viện ExcelJS chưa sẵn sàng.');

    const exportedAt = new Date();
    const currentItems = qltdWeeklyEnrichExportItemsWithParentMasters(qltdWeeklyTaskView.items, dept.masters);
    const nextItems = qltdWeeklyEnrichExportItemsWithParentMasters(nextData.items, dept.masters);
    const updateContext = { projectCode, deptCode, weekCode: week.weekId };
    const currentReport = qltdWeeklyBuildExportModel(
      currentItems,
      qltdWeeklyTaskView.updates,
      updateContext,
      week
    );
    const nextReport = qltdWeeklyBuildExportModel(
      nextItems,
      qltdWeeklyTaskView.updates,
      updateContext,
      nextWeek,
      'NEXT'
    );
    currentReport.warnings.forEach((warning) => console.warn('[Weekly Excel][Kết quả tuần này]', warning));
    nextReport.warnings.forEach((warning) => console.warn('[Weekly Excel][Kế hoạch tuần sau]', warning));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = currentUserProfile?.email || 'QLTD Firebase WebApp';
    workbook.created = exportedAt;
    workbook.modified = exportedAt;

    const currentSheet = workbook.addWorksheet('Kết quả tuần này');
    qltdWeeklyStyleReportSheet(currentSheet, qltdWeeklyBuildExportMetadata(payload, dept, week, exportedAt), currentReport.rows, {
      headers: QLTD_WEEKLY_EXPORT_HEADERS,
      title: 'BÁO CÁO KẾT QUẢ TUẦN NÀY',
      progressColumn: 11,
      statusColumn: 12
    });
    const nextSheet = workbook.addWorksheet('Kế hoạch tuần sau');
    qltdWeeklyStyleReportSheet(nextSheet, qltdWeeklyBuildExportMetadata(payload, dept, nextWeek, exportedAt), nextReport.rows, {
      headers: QLTD_WEEKLY_NEXT_EXPORT_HEADERS,
      title: 'KẾ HOẠCH TUẦN SAU',
      progressColumn: 10,
      statusColumn: 11
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Bao_cao_tuan_${qltdWeb07SafeFilename(projectCode)}_${qltdWeb07SafeFilename(deptCode)}_${qltdWeb07SafeFilename(week.weekId)}.xlsx`;
    qltdWeb07DownloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename
    );
  } catch (error) {
    console.error('Cannot export weekly report Excel', error);
    alert(`Không xuất được Excel báo cáo tuần: ${error.message || error}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText || 'Xuất Excel';
    }
  }
}

function getTodayIsoLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function setElementHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function syncWeeklyActualDateLifecycle() {
  const root = document.getElementById('weeklyActualDateLifecycle');
  if (!root) return;
  const progress = Number(document.getElementById('weeklyTaskProgress')?.value || 0);
  const status = document.getElementById('weeklyTaskStatus')?.value || '';
  const existingStart = root.dataset.existingStart || '';
  const existingFinish = root.dataset.existingFinish || '';
  const startEdit = document.getElementById('weeklyTaskActualStartEdit')?.value || '';
  const finishEdit = document.getElementById('weeklyTaskActualFinishEdit')?.value || '';
  const complete = isWeeklyCompletionValue(progress, status, existingFinish);
  const startInput = document.getElementById('weeklyTaskActualStart');
  const finishInput = document.getElementById('weeklyTaskActualFinish');
  const started = isWeeklyStartedValue(status);
  const showStartInput = !!startEdit || (!existingStart && started);
  const showStartReadonly = !!existingStart && !startEdit;
  const showNotStarted = !existingStart && !showStartInput && !started;
  const showFinishInput = complete && (!existingFinish || !!finishEdit);
  const showFinishReadonly = complete && !!existingFinish && !finishEdit;
  setElementHidden(document.getElementById('weeklyActualStartNotStarted'), !showNotStarted);
  setElementHidden(document.getElementById('weeklyActualStartReadonly'), !showStartReadonly);
  setElementHidden(document.getElementById('weeklyActualStartInputWrap'), !showStartInput);
  setElementHidden(document.getElementById('weeklyActualFinishHidden'), complete);
  setElementHidden(document.getElementById('weeklyActualFinishReadonly'), !showFinishReadonly);
  setElementHidden(document.getElementById('weeklyActualFinishInputWrap'), !showFinishInput);
  if (startInput) {
    startInput.disabled = !showStartInput;
    startInput.required = showStartInput && started;
    if (showStartInput && existingStart && !startInput.value) startInput.value = existingStart;
  }
  if (finishInput) {
    finishInput.disabled = !showFinishInput;
    finishInput.required = showFinishInput;
    if (showFinishInput && existingFinish && !finishInput.value) finishInput.value = existingFinish;
  }
}

function getWeeklyActualDatePayload() {
  const root = document.getElementById('weeklyActualDateLifecycle');
  const startInput = document.getElementById('weeklyTaskActualStart');
  const finishInput = document.getElementById('weeklyTaskActualFinish');
  const status = document.getElementById('weeklyTaskStatus')?.value || '';
  const startEdit = document.getElementById('weeklyTaskActualStartEdit')?.value || '';
  const finishEdit = document.getElementById('weeklyTaskActualFinishEdit')?.value || '';
  const existingStart = root?.dataset.existingStart || '';
  const existingFinish = root?.dataset.existingFinish || '';
  const complete = isWeeklyCompletionValue(0, status, existingFinish);
  return {
    actualStart: qltdWeeklyDateInputValue(startInput && !startInput.disabled ? startInput.value : existingStart),
    actualFinish: complete ? qltdWeeklyDateInputValue(finishInput && !finishInput.disabled ? finishInput.value : existingFinish) : '',
    actualStartEdit: startEdit,
    actualFinishEdit: finishEdit
  };
}

function syncWeeklyBudgetValidation() {
  const input = document.getElementById('weeklyTaskBudget');
  const warning = document.getElementById('weeklyBudgetLiveWarning');
  if (!input || !warning) return true;
  const raw = String(input.value || '').trim();
  const plan = Number(document.querySelector('.weekly-budget-section')?.dataset.budgetPlan || 0);
  let message = '';
  if (raw && isNaN(Number(raw))) message = 'Giá trị ngân sách không đúng định dạng.';
  else if (raw && Number(raw) < 0) message = 'Giá trị ngân sách không được âm.';
  else if (raw && plan > 0 && Number(raw) > plan) message = 'Cảnh báo: giá trị thực tế trong tuần vượt kế hoạch ngân sách.';
  warning.textContent = message;
  warning.hidden = !message;
  return !message || message.startsWith('Cảnh báo');
}

function validateWeeklyTaskForm(item) {
  const progressEnd = Number(document.getElementById('weeklyTaskProgress')?.value || 0);
  const status = document.getElementById('weeklyTaskStatus')?.value || '';
  const dates = getWeeklyActualDatePayload();
  if (isNaN(progressEnd) || progressEnd < 0 || progressEnd > 100) return { error: 'Mức hoàn thành phải nằm trong khoảng 0–100%.' };
  if (isWeeklyStartedValue(status) && !dates.actualStart) return { error: 'Vui lòng nhập ngày bắt đầu thực tế khi chuyển sang Đang làm.' };
  if (isWeeklyCompletionValue(progressEnd, status) && !dates.actualFinish) return { error: 'Vui lòng nhập ngày hoàn thành thực tế khi báo hoàn thành.' };
  if (item?.itemType === 'MASTER' && isWeeklyCompletionValue(progressEnd, status) && !String(document.getElementById('weeklyTaskResult')?.value || '').trim()) return { error: 'Vui lòng nhập kết quả thực hiện khi chọn trạng thái Hoàn thành.' };
  if (!syncWeeklyBudgetValidation()) return { error: 'Vui lòng kiểm tra lại ngân sách tuần.' };
  const budgetRaw = String(document.getElementById('weeklyTaskBudget')?.value || '').trim();
  if (budgetRaw && (isNaN(Number(budgetRaw)) || Number(budgetRaw) < 0)) return { error: 'Ngân sách tuần phải là số không âm.' };
  return { error: '', progressEnd, status, dates, item };
}

function renderWeeklyTaskRegion() {
  const mount = document.getElementById('weeklyUpdateMount'); const payload = qltdDeptPlanPayload; if (!mount || !payload?.success) return;
  const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || (payload.departments || [])[0] || {};
  const master = (dept.masters || []).find((item) => item.masterCode === qltdSelectedMasterCode) || (dept.masters || [])[0] || null;
  mount.innerHTML = renderWeeklyTaskUpdatePanel(payload, dept, master, qltdGetSelectedWeekPeriod()); bindWeeklyTaskUpdateControls();
}

function qltdWeeklyTaskAuthReady() {
  return !!String(currentUserProfile?.email || auth?.currentUser?.email || '').trim();
}

function qltdWeeklyTaskContextError(payload, dept, week) {
  if (!qltdWeeklyTaskAuthReady()) return 'Chưa sẵn sàng xác thực người dùng. Bấm Thử lại sau vài giây.';
  if (!String(payload?.projectCode || '').trim()) return 'Chưa chọn dự án để tải cập nhật tuần.';
  if (!String(dept?.deptCode || dept?.sheetName || '').trim()) return 'Chưa chọn phòng/ban để tải cập nhật tuần.';
  if (!String(week?.weekId || '').trim() || !String(week?.weekStart || '').trim() || !String(week?.weekEnd || '').trim()) return 'Chưa đủ kỳ tuần để tải cập nhật.';
  return '';
}

function qltdWeeklyTaskErrorCode(result) {
  return String(result?.code || result?.errorCode || result?.error || '').trim().toUpperCase();
}

function qltdWeeklyTaskShouldRetry(error) {
  const result = error?.backendResult || {};
  const code = qltdWeeklyTaskErrorCode(result);
  if (isDeptAccessDenied(result)) return false;
  if ([
    'ACCESS_DENIED',
    'PERMISSION_DENIED',
    'DEPT_SCOPE_DENIED',
    'PROJECT_DEPT_NOT_ASSIGNED',
    'PROJECT_DEPT_UPDATE_FORBIDDEN',
    'DELEGATED_PROGRESS_FIELDS_FORBIDDEN',
    'PROJECT_NOT_FOUND',
    'DEPT_NOT_FOUND',
    'INVALID_SCOPE',
    'SCOPE_INVALID',
    'VALIDATION_ERROR',
    'GANTT_PAYLOAD_UNAVAILABLE',
    'OFFICIAL_MASTER_PAYLOAD_UNAVAILABLE',
    'OFFICIAL_MASTER_NOT_FOUND'
  ].includes(code)) return false;
  const message = String(error?.message || result?.message || '').toLowerCase();
  if (/official master payload|cong_viec is unavailable|source data|không tồn tại|khong ton tai|không được cấp quyền|khong duoc cap quyen/.test(message)) return false;
  if (!error?.backendResult) return true;
  return /temporary|timeout|busy|network|fetch|temporar|tạm thời|tam thoi|gián đoạn|gian doan/.test(message) ||
    ['TEMPORARY', 'TIMEOUT', 'BUSY', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR'].includes(code);
}

function qltdWeeklyTaskRetryDelay(attemptIndex) {
  const delay = QLTD_WEEKLY_TASK_RETRY_DELAYS_MS[attemptIndex] || 0;
  return new Promise((resolve) => {
    const scheduler = typeof window !== 'undefined' && window.setTimeout ? window.setTimeout.bind(window) : setTimeout;
    scheduler(resolve, delay);
  });
}

function qltdWeeklyTaskNowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function qltdWeeklyTaskLog(level, detail) {
  const logger = console?.[level] || console?.info;
  if (!logger) return;
  logger.call(console, '[QLTD WEEKLY LOAD]', detail);
}

async function qltdWeeklyFetchTaskPayloadWithRetry(common, week, requestId) {
  let lastError = null;
  for (let attemptIndex = 0; attemptIndex <= QLTD_WEEKLY_TASK_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    const attempt = attemptIndex + 1;
    const startedAt = qltdWeeklyTaskNowMs();
    try {
      const [itemsResult, updatesResult] = await Promise.all([
        fetchBackendJson('work_listweeklyitems', { ...common, weekStart: week.weekStart, weekEnd: week.weekEnd }, { auth: true }),
        fetchBackendJson('weekly_taskupdates_get', common, { auth: true })
      ]);
      if (!itemsResult.success || !updatesResult.success) {
        const failedResult = !itemsResult.success ? itemsResult : updatesResult;
        const backendError = new Error(getBackendErrorMessage(failedResult, 'Không tải được dữ liệu Weekly.'));
        backendError.backendResult = failedResult;
        throw backendError;
      }
      qltdWeeklyTaskLog('info', {
        projectCode: common.projectCode,
        deptCode: common.deptCode,
        attempt,
        requestId,
        elapsedMs: Math.round(qltdWeeklyTaskNowMs() - startedAt),
        success: true
      });
      return { itemsResult, updatesResult };
    } catch (error) {
      lastError = error;
      const retryable = qltdWeeklyTaskShouldRetry(error);
      qltdWeeklyTaskLog(retryable ? 'warn' : 'info', {
        projectCode: common.projectCode,
        deptCode: common.deptCode,
        attempt,
        requestId,
        elapsedMs: Math.round(qltdWeeklyTaskNowMs() - startedAt),
        success: false,
        retryable,
        code: qltdWeeklyTaskErrorCode(error?.backendResult),
        message: error?.message || ''
      });
      if (!retryable || attemptIndex >= QLTD_WEEKLY_TASK_RETRY_DELAYS_MS.length) break;
      await qltdWeeklyTaskRetryDelay(attemptIndex);
    }
  }
  throw lastError || new Error('Không tải được dữ liệu Weekly.');
}

async function loadWeeklyTaskData(payload, dept, week, periods, filters = {}) {
  const contextError = qltdWeeklyTaskContextError(payload, dept, week);
  const deptCode = dept?.deptCode || dept?.sheetName || '';
  const key = getWeeklyTaskCacheKey(payload?.projectCode || '', deptCode, week?.weekId || '');
  if (contextError) {
    if (key) {
      qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], standaloneBudgetItems: [], budgetDrafts: {}, capabilities: { canUpdate: false, canReviewWeekly: false, role: '' }, loading: false, refreshing: false, error: contextError, refreshWarning: '', accessDenied: false };
      renderWeeklyTaskRegion();
    }
    return null;
  }
  const cached = qltdWeeklyTaskCache.get(key);
  const currentForKey = qltdWeeklyTaskView.key === key ? qltdWeeklyTaskView : null;
  const previousDrafts = currentForKey?.budgetDrafts || cached?.budgetDrafts || {};
  if (cached && !filters.force) {
    qltdWeeklyTaskView = { ...cloneWeeklyTaskState(cached), loading: false, refreshing: false, error: '', refreshWarning: cached.refreshWarning || '', accessDenied: false };
    renderWeeklyTaskRegion();
    return qltdWeeklyTaskView;
  }
  const pending = qltdWeeklyTaskInFlight.get(key);
  if (pending) {
    if (qltdWeeklyTaskView.key !== key) {
      qltdWeeklyTaskView = cached
        ? { ...cloneWeeklyTaskState(cached), loading: false, refreshing: true, error: '', refreshWarning: '', accessDenied: false }
        : { key, items: [], updates: [], nextItems: [], standaloneBudgetItems: [], budgetDrafts: previousDrafts, capabilities: { canUpdate: false, canReviewWeekly: false, role: '' }, loading: true, refreshing: false, error: '', refreshWarning: '', accessDenied: false };
      renderWeeklyTaskRegion();
    }
    return pending;
  }
  const requestSeq = ++qltdWeeklyTaskRequestSeq;
  const requestId = `weekly-load-${Date.now()}-${requestSeq}`;
  const retained = cached || currentForKey;
  qltdWeeklyTaskView = retained
    ? { ...cloneWeeklyTaskState(retained), key, budgetDrafts: cloneWeeklyTaskState(previousDrafts), loading: false, refreshing: true, error: '', refreshWarning: '', accessDenied: false }
    : { key, items: [], updates: [], nextItems: [], standaloneBudgetItems: [], budgetDrafts: previousDrafts, capabilities: { canUpdate: false, canReviewWeekly: false, role: '' }, loading: true, refreshing: false, error: '', refreshWarning: '', accessDenied: false };
  renderWeeklyTaskRegion();
  const common = { email: currentUserProfile?.email || '', projectCode: payload.projectCode, deptCode, weekCode: week.weekId };
  const requestSessionVersion = qltdWeeklyTaskSessionVersion;
  const requestCacheVersion = getWeeklyTaskCacheVersion(key);
  const requestStillCurrent = () => requestSeq === qltdWeeklyTaskRequestSeq &&
    requestSessionVersion === qltdWeeklyTaskSessionVersion &&
    requestCacheVersion === getWeeklyTaskCacheVersion(key);
  let requestPromise;
  requestPromise = (async () => {
    try {
      const { itemsResult, updatesResult } = await qltdWeeklyFetchTaskPayloadWithRetry(common, week, requestId);
      if (!requestStillCurrent()) return null;
      const itemData = itemsResult.data || itemsResult; const updateData = updatesResult.data || updatesResult;
      const items = qltdWeeklyEnrichItemsForDisplay(Array.isArray(itemData.items) ? itemData.items.slice() : [], dept);
      if (qltdWeeklyForcedItem && qltdWeeklyForcedItem.projectCode === payload.projectCode && qltdWeeklyForcedItem.deptCode === deptCode && qltdWeeklyForcedItem.weekCode === week.weekId && !items.some((item) => item.itemType === qltdWeeklyForcedItem.itemType && item.itemId === qltdWeeklyForcedItem.itemId)) {
        items.push(qltdWeeklyEnrichItemsForDisplay([qltdWeeklyForcedItem], dept)[0]);
      }
      const nextState = { key, items, updates: updateData.updates || [], nextItems: [], standaloneBudgetItems: itemData.standaloneBudgetItems || [], budgetDrafts: previousDrafts, capabilities: itemData.capabilities || { canUpdate: false, canReviewWeekly: false, role: '' }, loading: false, refreshing: false, error: '', refreshWarning: '', accessDenied: false };
      qltdWeeklyTaskCache.set(key, cloneWeeklyTaskState(nextState));
      if (qltdWeeklyTaskView.key === key) {
        qltdWeeklyTaskView = cloneWeeklyTaskState(nextState);
        renderWeeklyTaskRegion();
      }
      return cloneWeeklyTaskState(nextState);
    } catch (error) {
      if (!requestStillCurrent()) return null;
      const accessDenied = isDeptAccessDenied(error.backendResult);
      if (accessDenied) invalidateWeeklyTaskCacheKey(key);
      if (qltdWeeklyTaskView.key === key) {
        if (!accessDenied && retained) {
          qltdWeeklyTaskView = { ...cloneWeeklyTaskState(retained), key, budgetDrafts: cloneWeeklyTaskState(previousDrafts), loading: false, refreshing: false, error: '', refreshWarning: error.message || 'Không làm mới được dữ liệu Weekly.', accessDenied: false };
        } else {
          qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], standaloneBudgetItems: [], budgetDrafts: {}, capabilities: { canUpdate: false, canReviewWeekly: false, role: '' }, loading: false, refreshing: false, error: accessDenied ? QLTD_WEEKLY_DEPT_ACCESS_MESSAGE : error.message || 'Không tải được dữ liệu Weekly.', refreshWarning: '', accessDenied };
        }
        renderWeeklyTaskRegion();
      }
      return null;
    } finally {
      if (qltdWeeklyTaskInFlight.get(key) === requestPromise) qltdWeeklyTaskInFlight.delete(key);
    }
  })();
  qltdWeeklyTaskInFlight.set(key, requestPromise);
  return requestPromise;
}

function loadWeeklyTaskDataForCurrent(filters = {}) {
  const payload = qltdDeptPlanPayload || {}; const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || (payload.departments || [])[0];
  const week = qltdGetSelectedWeekPeriod();
  return loadWeeklyTaskData(payload, dept, week, [week], filters);
}

function weeklySavedUpdateMatchesPayload(update, payload) {
  if (!update || !payload) return false;
  return normalizeWeeklyUpdateMatchValue(update.projectCode) === normalizeWeeklyUpdateMatchValue(payload.projectCode) &&
    normalizeWeeklyUpdateMatchValue(update.deptCode) === normalizeWeeklyUpdateMatchValue(payload.deptCode) &&
    normalizeWeeklyUpdateMatchValue(update.weekCode) === normalizeWeeklyUpdateMatchValue(payload.weekCode) &&
    update.itemType === payload.itemType &&
    update.itemId === payload.itemId &&
    Number(update.progressEnd) === Number(payload.progressEnd) &&
    String(update.taskStatus || '').trim() === String(payload.taskStatus || '').trim() &&
    String(update.actualStart || '') === String(payload.actualStart || '') &&
    String(update.actualFinish || '') === String(payload.actualFinish || '') &&
    String(update.thisWeekResult || '') === String(payload.thisWeekResult || '') &&
    (!payload.expectedApprovalStatus || String(update.approvalStatus || '').toUpperCase() === String(payload.expectedApprovalStatus).toUpperCase());
}

async function verifyWeeklyTaskUpdateSaved(payload) {
  try {
    const result = await fetchBackendJson('weekly_taskupdates_get', {
      email: payload.email || '',
      projectCode: payload.projectCode,
      deptCode: payload.deptCode,
      weekCode: payload.weekCode
    }, { auth: true });
    if (!result.success) return null;
    const data = result.data || result;
    return (data.updates || []).find((update) => weeklySavedUpdateMatchesPayload(update, payload)) || null;
  } catch (error) {
    console.warn('Cannot verify weekly update after POST interruption', error);
    return null;
  }
}

function getWeeklySyncWarning(result) {
  const warnings = result?.warnings || result?.data?.warnings || [];
  return warnings.find((warning) => ['TASK_SYNC_PARTIAL', 'MASTER_WRITEBACK_PARTIAL'].includes(warning?.code)) || null;
}

function patchWeeklyBudgetItemFromResult(item, result) {
  const metrics = result?.metrics;
  if (!metrics) return item;
  return {
    ...item,
    actualThisWeek: Number(metrics.actualThisWeek ?? item.actualThisWeek ?? 0),
    actualCumulative: Number(metrics.cumulative ?? item.actualCumulative ?? 0),
    cumulativeActual: Number(metrics.cumulative ?? item.cumulativeActual ?? 0),
    remainingBudget: Number(metrics.remaining ?? item.remainingBudget ?? 0),
    remaining: Number(metrics.remaining ?? item.remaining ?? 0),
    approvedBudget: Number(metrics.approvedBudget ?? item.approvedBudget ?? 0),
    allocationRemaining: Number(metrics.allocationRemaining ?? item.allocationRemaining ?? 0)
  };
}

function patchWeeklyBudgetState(state, budgetResults = []) {
  const resultByCode = new Map((budgetResults || []).filter((result) => result?.metrics).map((result) => [String(result.budgetItemCode || '').trim(), result]));
  const patchItem = (item) => {
    const result = resultByCode.get(String(item?.budgetItemCode || '').trim());
    if (!result) return item;
    const patched = patchWeeklyBudgetItemFromResult(item, result);
    if (Array.isArray(item.taskLinkedBudgetItems)) patched.taskLinkedBudgetItems = item.taskLinkedBudgetItems.map(patchItem);
    if (String(item.budgetType || '').trim().toUpperCase() === 'TASK_LINKED') {
      patched.taskLinkedBudgetThisWeek = patched.actualThisWeek;
      patched.taskLinkedBudgetCumulative = patched.actualCumulative;
      patched.actualBudget = patched.actualCumulative;
      patched.plannedBudget = patched.approvedBudget || item.plannedBudget;
    }
    return patched;
  };
  return {
    ...state,
    items: (state.items || []).map((item) => {
      const patched = patchItem(item);
      if (patched === item && Array.isArray(item.taskLinkedBudgetItems)) return { ...item, taskLinkedBudgetItems: item.taskLinkedBudgetItems.map(patchItem) };
      return patched;
    }),
    standaloneBudgetItems: (state.standaloneBudgetItems || []).map(patchItem)
  };
}

function applyWeeklySavedUpdateToView(payload, update, options = {}) {
  const key = getWeeklyTaskCacheKey(payload.projectCode, payload.deptCode, payload.weekCode);
  if (!update) return { applied: false, budgetComplete: !(options.budgetUpdates || []).length };
  const source = qltdWeeklyTaskView.key === key ? qltdWeeklyTaskView : qltdWeeklyTaskCache.get(key);
  if (!source) return { applied: false, budgetComplete: !(options.budgetUpdates || []).length };
  const updates = (source.updates || []).filter((item) => !(update.updateId && item.updateId === update.updateId));
  const requestedBudgetCodes = new Set((options.budgetUpdates || []).map((item) => String(item.budgetItemCode || '').trim()).filter(Boolean));
  const returnedBudgetCodes = new Set((options.budgetResults || []).filter((item) => item?.metrics).map((item) => String(item.budgetItemCode || '').trim()));
  const budgetComplete = Array.from(requestedBudgetCodes).every((code) => returnedBudgetCodes.has(code));
  let nextState = { ...cloneWeeklyTaskState(source), updates: updates.concat([cloneWeeklyTaskState(update)]), budgetDrafts: options.clearBudgetDrafts ? {} : cloneWeeklyTaskState(source.budgetDrafts || {}), loading: false, refreshing: false, error: '', refreshWarning: budgetComplete ? '' : 'Dữ liệu ngân sách cần được làm mới để xác nhận số lũy kế.', accessDenied: false };
  if (options.budgetResults?.length) nextState = patchWeeklyBudgetState(nextState, options.budgetResults);
  qltdWeeklyTaskCache.set(key, cloneWeeklyTaskState(nextState));
  if (qltdWeeklyTaskView.key === key) qltdWeeklyTaskView = cloneWeeklyTaskState(nextState);
  return { applied: true, budgetComplete };
}

async function saveWeeklyTaskUpdate() {
  const item = qltdWeeklyTaskView.items.find((candidate) => `${candidate.itemType}:${candidate.itemId}` === qltdWeeklyEditingItemKey); if (!item) return;
  const payload = qltdDeptPlanPayload || {}; const dept = (payload.departments || []).find((candidate) => (candidate.deptCode || candidate.sheetName) === qltdSelectedDeptCode) || {};
  const status = document.getElementById('weeklyTaskSaveStatus');
  const button = document.getElementById('saveWeeklyTaskUpdateButton');
  const defaultButtonLabel = button?.dataset.defaultLabel || 'Lưu báo cáo tuần';
  if (button?.dataset.saving === '1') return;
  const validation = validateWeeklyTaskForm(item);
  if (validation.error) { if (status) status.textContent = validation.error; return; }
  const projectCode = payload.projectCode;
  const deptCode = dept.deptCode || dept.sheetName || '';
  const delegatedProgress = qltdWeeklyTaskView.capabilities?.permissionSource === 'DELEGATED_ACCESS' || dept.permissionSource === 'DELEGATED_ACCESS';
  const budgetPayload = delegatedProgress
    ? { updates: [] }
    : buildWeeklyBudgetUpdates(projectCode, deptCode, qltdSelectedWeekId, item);
  if (budgetPayload.error) { if (status) status.textContent = budgetPayload.error; return; }
  const reporterProposal = normalizeRoleKey(qltdWeeklyTaskView.capabilities?.role || currentUserProfile?.role) === 'REPORTER' &&
    !qltdWeeklyIsDelegatedManager(qltdWeeklyTaskView.capabilities) &&
    item.itemType === 'PB_DETAIL';
  if (reporterProposal) budgetPayload.updates = [];
  const currentUpdate = findWeeklySavedUpdate(qltdWeeklyTaskView.updates, item, { projectCode, deptCode, weekCode: qltdSelectedWeekId });
  const currentEffectiveState = getWeeklyEffectiveTaskState(item, currentUpdate);
  const progressEnd = validation.progressEnd; let confirmProgressDecrease = false;
  if (progressEnd < Number(currentEffectiveState.progress || 0)) { confirmProgressDecrease = window.confirm(`Tiến độ mới ${progressEnd}% thấp hơn tiến độ hiện tại ${currentEffectiveState.progress}%. Bạn có xác nhận?`); if (!confirmProgressDecrease) return; }
  const body = { action: 'weekly_taskupdates_save', email: currentUserProfile?.email || '', projectCode, deptCode, weekCode: qltdSelectedWeekId, itemType: item.itemType, itemId: item.itemId, thisWeekResult: document.getElementById('weeklyTaskResult')?.value || '', progressEnd, taskStatus: validation.status || '', actualStart: validation.dates.actualStart || '', actualFinish: validation.dates.actualFinish || '', actualStartEdit: validation.dates.actualStartEdit || '', actualFinishEdit: validation.dates.actualFinishEdit || '', issue: document.getElementById('weeklyTaskIssue')?.value || '', recommendation: document.getElementById('weeklyTaskRecommendation')?.value || '', confirmProgressDecrease, requestId: getWeeklySaveRequestId(), expectedApprovalStatus: reporterProposal ? 'PENDING' : '' };
  if (!delegatedProgress) {
    body.budgetThisWeek = document.getElementById('weeklyTaskBudget')?.value || '';
    body.budgetNote = document.getElementById('weeklyTaskBudgetNote')?.value || '';
    body.budgetUpdates = budgetPayload.updates;
  }
  if (button) { button.disabled = true; button.dataset.saving = '1'; button.textContent = reporterProposal ? 'Đang gửi...' : 'Đang lưu...'; }
  try {
    const result = await postBackendJson(body);
    if (!result.success) {
      const backendError = new Error(getBackendErrorMessage(result, 'Lưu thất bại.'));
      backendError.backendResult = result;
      throw backendError;
    }
    const data = result.data || result;
    qltdWeeklyForcedItem = null;
    const localRefresh = applyWeeklySavedUpdateToView(body, data.update, { budgetUpdates: budgetPayload.updates, budgetResults: data.budget?.results || [], clearBudgetDrafts: true });
    const syncWarning = getWeeklySyncWarning(result);
    const budgetSaved = Number(data.budget?.savedCount || 0);
    const message = reporterProposal
      ? 'Đã gửi cập nhật PB_DETAIL để Trưởng/Phó phòng duyệt.'
      : syncWarning
        ? `Công việc đã lưu; ${budgetSaved} khoản ngân sách đã lưu, nhưng đồng bộ trạng thái nguồn chưa hoàn tất.`
        : data.update?.approvalStatus === 'PENDING'
          ? 'Đã gửi đề nghị hoàn thành mục tiêu, chờ Admin/PMO phê duyệt.'
          : 'Đã cập nhật kết quả mục tiêu và làm mới Gantt.';
    qltdWeeklyEditingItemKey = '';
    showWeeklyToast(message);
    qltdWeeklySaveRequestId = '';
    renderWeeklyTaskRegion();
    if (budgetPayload.updates.length && !localRefresh.budgetComplete) await loadWeeklyTaskDataForCurrent({ force: true });
    if (data.ganttRefreshRequired && projectCode) await markWeeklyGanttRefreshRequired(projectCode);
  } catch (error) {
    if (error.backendResult) {
      if (status) status.textContent = error.message;
      if (button) { button.disabled = false; button.dataset.saving = ''; button.textContent = defaultButtonLabel; }
      return;
    }
    const verified = await verifyWeeklyTaskUpdateSaved(body);
    if (verified) {
      qltdWeeklyForcedItem = null;
      applyWeeklySavedUpdateToView(body, verified, { budgetUpdates: budgetPayload.updates, budgetResults: [], clearBudgetDrafts: true });
      const message = reporterProposal ? 'Đã gửi duyệt, nhưng phản hồi kết nối bị gián đoạn.' : 'Đã lưu cập nhật tuần, nhưng phản hồi kết nối bị gián đoạn.';
      qltdWeeklyEditingItemKey = '';
      showWeeklyToast(message);
      qltdWeeklySaveRequestId = '';
      renderWeeklyTaskRegion();
      if (!reporterProposal && projectCode) qltdGanttDirtyProjects.add(projectCode);
      return;
    }
    if (status) status.textContent = 'Không thể xác nhận kết quả lưu. Vui lòng kiểm tra kết nối và tải lại dữ liệu.';
    if (button) { button.disabled = false; button.dataset.saving = ''; button.textContent = defaultButtonLabel; }
  }
}

function showWeeklyToast(message) {
  const toast = document.createElement('div');
  toast.className = 'weekly-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.classList.add('is-visible'), 20);
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

async function postBackendJson(payload) {
  let forceRefresh = false;

  while (true) {
    const requestPayload = { ...(payload || {}) };
    if (auth && auth.currentUser) {
      requestPayload.email = auth.currentUser.email || requestPayload.email || '';
      requestPayload.idToken = await auth.currentUser.getIdToken(forceRefresh);
    }

    const response = await fetch(APPS_SCRIPT_DEV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(requestPayload)
    });
    if (!response.ok) throw new Error(`Apps Script API POST failed: ${response.status}`);

    const result = await response.json();
    const message = String(result?.errorCode || result?.message || '').trim().toUpperCase();
    if (forceRefresh === false && (message === 'ID_TOKEN_INVALID' || message === 'ID_TOKEN_EXPIRED')) {
      forceRefresh = true;
      continue;
    }
    return result;
  }
}

function getNextWeeklyPeriod(week) { const start = new Date(`${week.weekStart}T12:00:00`); start.setDate(start.getDate() + 7); const end = new Date(start); end.setDate(end.getDate() + 6); const iso = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; return { weekId: `WEEK-${iso(start)}`, weekStart: iso(start), weekEnd: iso(end) }; }
function formatWeeklyCurrency(value) { return Number(value || 0).toLocaleString('vi-VN') + ' ₫'; }
function formatWeeklyDateTime(value) {
  if (!value) return '';
  const dateOnly = qltdWeeklyNormalizeDateOnly(value);
  const text = String(value || '').trim();
  if (dateOnly && !/[T\s]\d{1,2}:\d{2}/.test(text)) return formatIsoDateVi(dateOnly);
  const isoDateTime = text.match(/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/);
  if (!isoDateTime) return String(value);
  const date = new Date(text);
  return isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function markWeeklyGanttRefreshRequired(projectCode, options = {}) {
  if (!projectCode) return;
  qltdGanttDirtyProjects.add(projectCode);
  if (options.forceRefresh) qltdGanttForceRefreshProjects.add(projectCode);
  const selectedProjectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  if (selectedProjectCode === projectCode && (qltdActiveView === 'dashboard' || qltdActiveView === 'gantt')) {
    await loadGanttDataForSelectedProject(projectCode, { forceRefresh: !!options.forceRefresh });
  }
}

function normalizeProjectScheduleState(result, projectCode) {
  return {
    projectCode: String(result?.projectCode || projectCode || ''),
    scheduleState: String(result?.scheduleState || 'DIRTY').toUpperCase() === 'CLEAN' ? 'CLEAN' : 'DIRTY',
    reason: String(result?.reason || ''),
    markedAt: String(result?.markedAt || ''),
    markedBy: String(result?.markedBy || ''),
    recalculatedAt: String(result?.recalculatedAt || ''),
    recalculatedBy: String(result?.recalculatedBy || ''),
    error: ''
  };
}

async function loadProjectScheduleState(projectCode, options = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return null;
  try {
    const result = await fetchBackendJson('getProjectScheduleState', { projectCode: code }, { auth: true });
    if (!result?.ok) {
      const error = new Error(formatMasterApprovalBackendError(result, 'Không đọc được trạng thái tiến độ dự án.'));
      error.backendResult = result;
      throw error;
    }
    const state = normalizeProjectScheduleState(result, code);
    qltdProjectScheduleStates.set(code, state);
    if (options.render !== false) refreshProjectScheduleControlInPlace(code);
    return state;
  } catch (error) {
    const previous = qltdProjectScheduleStates.get(code) || {
      projectCode: code,
      scheduleState: 'DIRTY',
      reason: 'STATE_READ_FAILED',
      markedAt: '',
      recalculatedAt: ''
    };
    qltdProjectScheduleStates.set(code, { ...previous, error: error.message || String(error) });
    if (options.render !== false) refreshProjectScheduleControlInPlace(code);
    return null;
  }
}

function renderProjectScheduleControl(projectCode) {
  const code = String(projectCode || '').trim();
  const state = qltdProjectScheduleStates.get(code);
  const running = qltdProjectScheduleRecalcInFlight.has(code);
  const isClean = state?.scheduleState === 'CLEAN';
  const statusText = isClean
    ? 'Tiến độ dự án đã được tính lại.'
    : 'Tiến độ dự án chưa được tính lại.';
  const timestamp = isClean && state?.recalculatedAt
    ? ` Cập nhật: ${formatWeeklyDateTime(state.recalculatedAt)}.`
    : '';
  const error = state?.error
    ? `<span class="web07-muted">${escapeHtml(state.error)}</span>`
    : '';
  return `
    <div id="projectScheduleControl" class="web07-schedule-state ${isClean ? 'is-clean' : 'is-dirty'}">
      <span>${escapeHtml(statusText + timestamp)}</span>
      ${error}
      ${canAdmin() ? `<button id="projectScheduleRecalculateButton" type="button" ${running ? 'disabled' : ''}>${running ? 'Đang tính lại...' : 'Tính lại tiến độ dự án'}</button>` : ''}
    </div>
  `;
}

function bindProjectScheduleRecalculateButton(projectCode) {
  const code = String(projectCode || '').trim();
  const button = document.getElementById('projectScheduleRecalculateButton');
  if (!button || !code) return;
  button.onclick = () => handleProjectScheduleRecalculate(code);
}

function refreshProjectScheduleControlInPlace(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code || qltdGanttPayload?.projectCode !== code) return false;
  const control = document.getElementById('projectScheduleControl');
  if (!control) return false;
  control.outerHTML = renderProjectScheduleControl(code);
  bindProjectScheduleRecalculateButton(code);
  return true;
}

async function handleProjectScheduleRecalculate(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code || !canAdmin() || qltdProjectScheduleRecalcInFlight.has(code)) return;
  qltdProjectScheduleRecalcInFlight.add(code);
  refreshProjectScheduleControlInPlace(code);

  try {
    const result = await postBackendJson({
      action: 'recalculateProjectSchedule',
      projectCode: code
    });
    if (!result?.ok) {
      const error = new Error(formatMasterApprovalBackendError(result, 'Không thể tính lại tiến độ dự án.'));
      error.backendResult = result;
      throw error;
    }

    qltdProjectScheduleStates.set(code, normalizeProjectScheduleState(result, code));
    qltdGanttDirtyProjects.add(code);
    qltdGanttForceRefreshProjects.add(code);
    qltdDepartmentDashboardCache.delete(code);
    await loadGanttDataForSelectedProject(code, { forceRefresh: true });
    window.alert([
      'Đã tính lại tiến độ dự án.',
      `Công việc xử lý: ${Number(result.processedTaskCount || 0)}`,
      `J thay đổi: ${Number(result.changedDurationCount || 0)}`,
      `L thay đổi: ${Number(result.changedStartCount || 0)}`,
      `M thay đổi: ${Number(result.changedFinishCount || 0)}`,
      `Q thay đổi: ${Number(result.changedErrorCount || 0)}`
    ].join('\n'));
  } catch (error) {
    const previous = qltdProjectScheduleStates.get(code) || { projectCode: code };
    qltdProjectScheduleStates.set(code, {
      ...previous,
      scheduleState: 'DIRTY',
      error: error.message || String(error)
    });
  } finally {
    qltdProjectScheduleRecalcInFlight.delete(code);
    refreshProjectScheduleControlInPlace(code);
  }
}

function qltdWeb07GetOrCreateGanttRequest(projectCode, factory) {
  const code = String(projectCode || '').trim();
  if (!code) return Promise.resolve(null);
  const inFlight = qltdGanttDataRequests.get(code);
  if (inFlight) return inFlight;

  const startRequest = () => Promise.resolve().then(factory);
  const request = qltdGanttRequestTail.then(startRequest, startRequest);
  qltdGanttRequestTail = request.catch(() => null);
  qltdGanttDataRequests.set(code, request);
  const clearRequest = () => {
    if (qltdGanttDataRequests.get(code) === request) qltdGanttDataRequests.delete(code);
  };
  request.then(clearRequest, clearRequest);
  return request;
}

function qltdWeb07IsGanttBusyResponse(payload) {
  const code = String(payload && (payload.error || payload.errorCode || payload.code || payload.message) || '')
    .trim()
    .toUpperCase();
  return code === 'GANTT_BUSY_RETRY';
}

function qltdWeb07Delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function qltdWeb07GetGanttBusyRetryDelay(payload, attempt) {
  const backoffMs = QLTD_GANTT_BUSY_RETRY_DELAY_MS * Math.pow(2, Math.max(0, Number(attempt || 1) - 1));
  const retryAfterMs = Number(payload?.retryAfterMs || 0);
  const preferredMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.max(retryAfterMs, backoffMs)
    : backoffMs;
  return Math.min(QLTD_GANTT_BUSY_MAX_DELAY_MS, preferredMs);
}

function qltdWeb07IsCurrentGanttLoad(projectCode, requestSeq) {
  const selectedProjectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  return requestSeq === qltdGanttLoadRequestSeq &&
    (!selectedProjectCode || String(selectedProjectCode) === String(projectCode));
}

async function qltdWeb07FetchGanttPayload(projectCode, options = {}) {
  const timeoutMs = Number(options.timeoutMs || QLTD_GANTT_REQUEST_TIMEOUT_MS);
  const requestedMaxAttempts = Number(options.maxAttempts || QLTD_GANTT_BUSY_MAX_ATTEMPTS);
  const maxAttempts = Number.isFinite(requestedMaxAttempts) && requestedMaxAttempts > 0
    ? Math.floor(requestedMaxAttempts)
    : QLTD_GANTT_BUSY_MAX_ATTEMPTS;
  const fetcher = options.fetcher || fetchBackendJson;
  const delay = options.delay || qltdWeb07Delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    let payload;
    try {
      payload = await fetcher('ganttData', {
        projectCode,
        forceRefresh: options.forceRefresh ? '1' : ''
      }, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error(`Quá thời gian tải Gantt sau ${Math.round(timeoutMs / 1000)} giây. Vui lòng thử lại.`);
        timeoutError.code = 'GANTT_REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!qltdWeb07IsGanttBusyResponse(payload)) return payload;
    if (attempt < maxAttempts) {
      const configuredDelayMs = Number(options.retryDelayMs || 0);
      const delayMs = Number.isFinite(configuredDelayMs) && configuredDelayMs > 0
        ? Math.min(QLTD_GANTT_BUSY_MAX_DELAY_MS, configuredDelayMs)
        : qltdWeb07GetGanttBusyRetryDelay(payload, attempt);
      console.warn('WEB07F: ganttData busy, retrying', {
        projectCode,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs
      });
      if (typeof options.onBusyRetry === 'function') {
        options.onBusyRetry({ projectCode, attempt, nextAttempt: attempt + 1, maxAttempts, delayMs });
      }
      await delay(delayMs);
      continue;
    }

    const busyError = new Error('Gantt đang được một yêu cầu khác chuẩn bị. Vui lòng đợi vài giây rồi thử lại.');
    busyError.code = 'GANTT_BUSY_RETRY';
    throw busyError;
  }

  return null;
}

function qltdWeb07RequestGanttPayload(projectCode, options = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return Promise.resolve(null);
  const requestKey = options.forceRefresh ? code + '::force' : code;
  return qltdWeb07GetOrCreateGanttRequest(requestKey, () => qltdWeb07FetchGanttPayload(code, options));
}

function qltdWeb07RequestDashboardPayload(projectCode, options = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return Promise.resolve(null);
  const requestKey = options.forceRefresh ? code + '::force' : code;
  return qltdWeb07GetOrCreateGanttRequest('dashboard::' + requestKey, () => fetchBackendJson('dashboardSummary', {
    projectCode: code,
    forceRefresh: options.forceRefresh ? '1' : ''
  }, { auth: true }));
}

async function loadDashboardDataForSelectedProject(projectCode, options = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return null;
  const selectedProjectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  if (selectedProjectCode && String(selectedProjectCode) !== code) return null;
  const requestSeq = ++qltdDashboardLoadRequestSeq;
  if (options.forceRefresh && qltdGanttPayload && String(qltdGanttPayload.projectCode || '') === code) {
    qltdGanttPayload = null;
  }
  renderDashboardLoading(code);
  try {
    const payload = await qltdWeb07RequestDashboardPayload(code, options);
    if (requestSeq !== qltdDashboardLoadRequestSeq || qltdActiveView !== 'dashboard') return payload;
    qltdDashboardPayload = payload;
    await loadMainMilestonesForProject(code, payload);
    if (requestSeq !== qltdDashboardLoadRequestSeq || qltdActiveView !== 'dashboard') return payload;
    renderDashboardFromGanttData(payload);
    return payload;
  } catch (error) {
    if (requestSeq === qltdDashboardLoadRequestSeq && qltdActiveView === 'dashboard') renderDashboardError(error);
    return null;
  }
}

function loadGanttDataForSelectedProject(projectCode, options = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return Promise.resolve(null);
  const shouldForceRefresh = !!options.forceRefresh || qltdGanttForceRefreshProjects.has(code);
  return qltdWeb07LoadGanttDataForSelectedProject(code, Object.assign({}, options, {
    forceRefresh: shouldForceRefresh
  }));
}

async function qltdWeb07LoadGanttDataForSelectedProject(projectCode, options = {}) {
  const selectedProjectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
  if (selectedProjectCode && String(selectedProjectCode) !== String(projectCode)) return null;
  const requestSeq = ++qltdGanttLoadRequestSeq;
  ensureWeb07Panels();
  renderGanttLoading(projectCode);

  try {
    const scheduleStateRequest = loadProjectScheduleState(projectCode, { render: false });
    const payload = await qltdWeb07RequestGanttPayload(projectCode, {
      forceRefresh: !!options.forceRefresh,
      onBusyRetry: (retryState) => {
        if (qltdWeb07IsCurrentGanttLoad(projectCode, requestSeq)) {
          renderGanttBusyRetry(projectCode, retryState);
        }
      }
    });
    await scheduleStateRequest;
    if (!qltdWeb07IsCurrentGanttLoad(projectCode, requestSeq)) return payload;
    qltdGanttPayload = payload;
    qltdDashboardPayload = payload;
    if (qltdActiveView === 'report' && qltdDeptPlanPayload?.success) renderDeptPlans(qltdDeptPlanPayload);
    await loadMainMilestonesForProject(projectCode, payload);
    if (!qltdWeb07IsCurrentGanttLoad(projectCode, requestSeq)) return payload;
    if (qltdActiveView === 'dashboard') renderDashboardFromGanttData(payload);
    renderGanttPanel(payload);
    qltdGanttDirtyProjects.delete(projectCode);
    qltdGanttForceRefreshProjects.delete(projectCode);
    return payload;
  } catch (error) {
    console.error('Cannot load gantt data', error);
    if (!qltdWeb07IsCurrentGanttLoad(projectCode, requestSeq)) return null;
    qltdGanttPayload = null;
    if (qltdActiveView === 'dashboard') renderDashboardError(error);
    renderGanttError(error);
    return null;
  }
}

function renderDashboardLoading(projectCode) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Đang tải Dashboard cho ${escapeHtml(projectCode)}...</p>
    </div>
  `;
}

function renderNoProjectDashboardState() {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Chưa có dự án ACTIVE.</p>
    </div>
  `;
}

function renderNoProjectGanttState() {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderNoProjectGanttState');
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Chưa có dự án ACTIVE.</p>
    </div>
  `;
}

function resetWeb07DhtmlxGantt(reason = '') {
  qltdDhtmlxGanttRenderSeq += 1;
  const gantt = getDhtmlxGanttInstance();
  if (!gantt) {
    qltdDhtmlxGanttInitialized = false;
    return;
  }

  try {
    if (typeof gantt.clearAll === 'function') {
      gantt.clearAll();
    }
  } catch (error) {
    console.warn('WEB07F: ignored gantt.clearAll during reset', reason, error);
  }

  qltdDhtmlxGanttInitialized = false;
}

function getGanttScrollState() {
  const gantt = getDhtmlxGanttInstance();
  if (!gantt || typeof gantt.getScrollState !== 'function') return null;

  try {
    return gantt.getScrollState();
  } catch (error) {
    console.warn('Cannot read gantt scroll state', error);
    return null;
  }
}

function restoreGanttScrollState(scroll) {
  if (!scroll) return;

  const gantt = getDhtmlxGanttInstance();
  if (!gantt || typeof gantt.scrollTo !== 'function') return;

  requestAnimationFrame(() => {
    try {
      gantt.scrollTo(scroll.x || 0, scroll.y || 0);
    } catch (error) {
      console.warn('Cannot restore gantt scroll state', error);
    }
  });
}

function ensureVisibleGanttContainer(container) {
  if (!container) return false;
  container.classList.remove('is-fallback');
  container.hidden = false;
  if (!container.style.height) {
    container.style.height = 'calc(100vh - 245px)';
  }
  if (!container.style.minHeight) {
    container.style.minHeight = '640px';
  }
  return true;
}

function qltdWeb07NextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function qltdWeb07WaitForRenderableGanttContainer(container) {
  ensureVisibleGanttContainer(container);

  for (let i = 0; i < 4; i += 1) {
    await qltdWeb07NextFrame();
    const rect = container.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 120) {
      return true;
    }
    container.style.height = 'calc(100vh - 230px)';
    container.style.minHeight = '680px';
  }

  return false;
}
function renderGanttLoading(projectCode) {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderGanttLoading');
  panel.innerHTML = `
    <div class="web07-card">
      <p id="ganttLoadingMessage" class="empty-state">Đang tải Gantt cho ${escapeHtml(projectCode)}...</p>
    </div>
  `;
}

function renderGanttBusyRetry(projectCode, retryState = {}) {
  const message = document.getElementById('ganttLoadingMessage');
  if (!message) return;
  message.textContent = `Gantt ${projectCode} đang được chuẩn bị, hệ thống đang thử lại (${Number(retryState.nextAttempt || 1)}/${Number(retryState.maxAttempts || QLTD_GANTT_BUSY_MAX_ATTEMPTS)})...`;
}

function renderDashboardError(error) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Không tải được Dashboard từ Apps Script API.</p>
      <p class="web07-muted">${escapeHtml(error.message || error)}</p>
    </div>
  `;
}

function renderBudgetDashboardError(error) {
  const panel = document.getElementById('web07BudgetDashboardPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Không tải được Dashboard ngân sách từ Apps Script API.</p>
      <p class="web07-muted">${escapeHtml(error.message || error)}</p>
    </div>
  `;
}

function renderGanttError(error) {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderGanttError');
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Không tải được Gantt từ Apps Script API.</p>
      <p class="web07-muted">${escapeHtml(error.message || error)}</p>
      <button id="ganttRetryButton" type="button">Thử lại</button>
    </div>
  `;
  const retryButton = document.getElementById('ganttRetryButton');
  if (retryButton) {
    retryButton.onclick = () => {
      const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
      if (!projectCode) return;
      retryButton.disabled = true;
      loadGanttDataForSelectedProject(projectCode, { forceRefresh: true });
    };
  }
}

function renderDashboardFromGanttData(payload) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;

  if (!payload || !payload.success) {
    panel.innerHTML = `
      <div class="web07-card">
        <p class="empty-state">Endpoint ganttData chưa trả dữ liệu hợp lệ.</p>
        <p class="web07-muted">${escapeHtml(payload && (payload.message || payload.error) || '')}</p>
      </div>
    `;
    return;
  }

  if (payload.projectCode) qltdDepartmentDashboardCache.set(String(payload.projectCode), payload);
  if (qltdDashboardMode === 'department') {
    loadAndRenderDepartmentDashboard();
    return;
  }

  const dashboardFilterTasks = (payload.data || []).filter(isNormalizedCountedTask);
  qltdDashboardContextFilters = qltdNormalizeDashboardContextFilters(
    dashboardFilterTasks,
    qltdDashboardContextFilters
  );
  const model = buildExecutiveDashboardModel(payload, qltdDashboardContextFilters);

  panel.innerHTML = `
    <div class="exec-dashboard">
      ${renderDashboardModeSwitch('project')}
      <section class="exec-header">
        <div>
          <p class="exec-eyebrow">Dashboard điều hành dự án</p>
          <h2>${escapeHtml(payload.projectName || payload.projectCode || 'Dự án')}</h2>
          <p class="exec-subtitle">
            ${escapeHtml(payload.projectCode || '')}
            ${payload.sourceSheet ? ` · ${escapeHtml(payload.sourceSheet)}` : ''}
            · Cập nhật ${escapeHtml(model.updatedAtLabel)}
          </p>
        </div>
        <button id="execRefreshButton" class="exec-refresh" type="button">Refresh</button>
      </section>
      ${renderDashboardContextFilters(dashboardFilterTasks)}

      <section class="exec-kpi-grid" aria-label="KPI điều hành">
        ${renderExecutiveKpiCard('Tổng công việc', model.kpis.totalTasks, '100% dữ liệu thật', 'info')}
        ${renderExecutiveKpiCard('Hoàn thành', model.kpis.completed, `${model.completionPercent}% tổng số`, 'green')}
        ${renderExecutiveKpiCard('Đang thực hiện', model.kpis.inProgress, `${model.inProgressPercent}% tổng số`, 'blue')}
        ${renderExecutiveKpiCard('Chưa bắt đầu', model.kpis.notStarted, `${model.notStartedPercent}% tổng số`, 'gray')}
        ${renderExecutiveKpiCard('Quá hạn', model.kpis.overdue, `${model.overduePercent}% tổng số`, 'red')}
        ${renderExecutiveKpiCard('Mốc lớn đang thực hiện', model.kpis.activeMilestones, model.usedMilestoneFallback ? 'WBS cấp I/II/III' : 'Mốc lớn hệ thống', 'blue')}
        ${model.kpis.unmappedContext > 0 ? renderExecutiveKpiCard('Chưa xác định Hạng mục', model.kpis.unmappedContext, 'Công việc chưa được gắn Hạng mục', 'red') : ''}
      </section>

      ${renderExecutiveAlerts(model.alerts)}

      <section class="exec-grid">
        ${renderExecutiveListSection('Top 5 quá hạn', ['Hạng mục', 'Công việc', 'Chủ trì', 'Ngày kết thúc', 'Số ngày trễ'], model.overdue, renderExecutiveOverdueRow, 'Không có việc quá hạn.', 'red')}
        ${renderExecutiveListSection('Mốc lớn đang thực hiện', ['Hạng mục/Mốc lớn', 'Công việc/Mốc', 'Chủ trì', 'Ngày kết thúc', 'Còn lại hoặc trễ'], model.activeMilestones, renderExecutiveMilestoneRow, 'Không có mốc lớn đang thực hiện.', 'blue')}
        ${renderExecutiveListSection('Đến hạn trong 14 ngày tới', ['Hạng mục', 'Công việc', 'Chủ trì', 'Ngày kết thúc', 'Còn lại'], model.upcoming, renderExecutiveUpcomingRow, 'Không có việc đến hạn trong 14 ngày tới.', 'blue')}
        ${renderExecutiveCompletedSection(model.completedThisMonth)}
      </section>
    </div>
  `;

  bindDashboardTaskLinks();
  bindDashboardModeSwitch();
  bindDashboardContextFilters(payload);
  const refreshButton = document.getElementById('execRefreshButton');
  if (refreshButton) {
    refreshButton.onclick = () => loadDashboardDataForSelectedProject(
      payload.projectCode || getStoredProjectCode(),
      { forceRefresh: true }
    );
  }
}

function renderDashboardModeSwitch(activeMode) {
  return `<nav class="dept-dashboard-switch" aria-label="Chế độ Dashboard">
    <button type="button" data-dashboard-mode="project" class="${activeMode === 'project' ? 'active' : ''}">Dashboard dự án</button>
    <button type="button" data-dashboard-mode="department" class="${activeMode === 'department' ? 'active' : ''}">Dashboard phòng/ban</button>
  </nav>`;
}

function bindDashboardModeSwitch() {
  document.querySelectorAll('[data-dashboard-mode]').forEach((button) => {
    button.onclick = () => {
      const mode = button.dataset.dashboardMode;
      if (mode === qltdDashboardMode) return;
      qltdDashboardMode = mode;
      if (mode === 'department') loadAndRenderDepartmentDashboard();
      else if (qltdDashboardPayload) renderDashboardFromGanttData(qltdDashboardPayload);
    };
  });
}

async function getDepartmentDashboardPayloads(projectCode, forceRefresh) {
  const projects = qltdProjectRegistry;
  const warnings = [];
  const payloads = (await Promise.all(projects.map(async (project) => {
    const code = String(project.projectCode || '');
    if (!forceRefresh && qltdDepartmentDashboardCache.has(code)) return qltdDepartmentDashboardCache.get(code);
    try {
      const payload = await qltdWeb07RequestDashboardPayload(code, { forceRefresh: !!forceRefresh });
      if (!payload || payload.success === false) throw new Error(payload && (payload.message || payload.error) || 'INVALID_PAYLOAD');
      qltdDepartmentDashboardCache.set(code, payload);
      return payload;
    } catch (error) {
      warnings.push(`${code}: ${error.message || error}`);
      return null;
    }
  }))).filter(Boolean);
  return { payloads, warnings };
}

async function getDepartmentDashboardDetailPayloads(projectCode, deptCode, forceRefresh) {
  const projects = qltdProjectRegistry;
  const warnings = [];
  const payloads = (await Promise.all(projects.map(async (project) => {
    const code = String(project.projectCode || '');
    const cacheKey = `${code}::ALL`;
    if (!forceRefresh && qltdDepartmentDashboardDetailCache.has(cacheKey)) return qltdDepartmentDashboardDetailCache.get(cacheKey);
    try {
      const payload = await fetchBackendJson('listDeptPlans', { projectCode: code }, { auth: true });
      if (!payload || payload.success === false) throw new Error(payload && (payload.message || payload.error) || 'INVALID_DEPT_PLAN_PAYLOAD');
      qltdDepartmentDashboardDetailCache.set(cacheKey, payload);
      return payload;
    } catch (error) {
      warnings.push(`${code}: ${error.message || error}`);
      return null;
    }
  }))).filter(Boolean);
  return { payloads, warnings };
}

async function loadAndRenderDepartmentDashboard(forceRefresh = false) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  const requestSeq = ++qltdDepartmentDashboardRequestSeq;
  qltdDashboardMode = 'department';
  panel.innerHTML = `<div class="exec-dashboard">${renderDashboardModeSwitch('department')}<section class="exec-section"><p class="exec-empty">Đang tổng hợp dữ liệu phòng/ban...</p></section></div>`;
  bindDashboardModeSwitch();
  const [result, detailResult] = await Promise.all([
    getDepartmentDashboardPayloads(qltdDepartmentDashboardProjectCode, forceRefresh),
    getDepartmentDashboardDetailPayloads(qltdDepartmentDashboardProjectCode, qltdDepartmentDashboardDeptCode, forceRefresh)
  ]);
  if (requestSeq !== qltdDepartmentDashboardRequestSeq) return;
  renderDepartmentDashboard(result.payloads, [...result.warnings, ...detailResult.warnings], detailResult.payloads);
}

function renderDepartmentDashboard(payloads, warnings = [], individualPayloads = []) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  const model = buildDepartmentDashboardModel(payloads, { deptCode: qltdDepartmentDashboardDeptCode, projectCode: qltdDepartmentDashboardProjectCode }, new Date(), { detailPayloads: individualPayloads });
  const deptLabel = model.departments.find((dept) => dept.code === qltdDepartmentDashboardDeptCode)?.name || 'Tất cả phòng/ban';
  panel.innerHTML = `<div class="exec-dashboard dept-dashboard">
    ${renderDashboardModeSwitch('department')}
    <section class="exec-header"><div><p class="exec-eyebrow">Dashboard Phòng/Ban</p><h2>${escapeHtml(deptLabel)}</h2><p class="exec-subtitle">${qltdDepartmentDashboardProjectCode ? 'Một dự án' : 'Toàn bộ dự án ACTIVE'} · ${model.tasks.length} công việc</p></div><button id="deptDashboardRefresh" class="exec-refresh" type="button">Refresh</button></section>
    <section class="dept-dashboard-filters"><label>Phòng/Ban<select id="deptDashboardDeptFilter"><option value="">Tất cả phòng/ban</option>${model.departments.map((dept) => `<option value="${escapeHtml(dept.code)}" ${dept.code === qltdDepartmentDashboardDeptCode ? 'selected' : ''}>${escapeHtml(dept.code)} - ${escapeHtml(dept.name)}</option>`).join('')}</select></label>
    <label>Dự án<select id="deptDashboardProjectFilter"><option value="">Tất cả dự án</option>${qltdProjectRegistry.map((project) => `<option value="${escapeHtml(project.projectCode)}" ${String(project.projectCode) === qltdDepartmentDashboardProjectCode ? 'selected' : ''}>${escapeHtml(project.projectCode)} - ${escapeHtml(project.projectName)}</option>`).join('')}</select></label></section>
    ${warnings.length ? `<div class="dept-dashboard-warning">Không tải được ${warnings.length} dự án: ${escapeHtml(warnings.join(' · '))}</div>` : ''}
    ${qltdDepartmentDashboardDeptCode && model.masterFallbackProjects.length ? `<div class="dept-dashboard-warning">Dự án chưa có công việc chi tiết theo cá nhân; số liệu hiện tại được tổng hợp theo phòng/ban từ kế hoạch Master.</div>` : ''}
    <section class="exec-kpi-grid dept-kpi-grid">
      ${renderExecutiveKpiCard('Tổng việc được giao', model.kpis.total, qltdDepartmentDashboardDeptCode ? 'Theo người chủ trì' : 'Theo đơn vị chủ trì', 'info')}${renderExecutiveKpiCard('Hoàn thành', model.kpis.completed, 'Đã có kết quả thực tế', 'green')}
      ${renderExecutiveKpiCard('Đang thực hiện', model.kpis.inProgress, 'Chưa hoàn thành', 'blue')}${renderExecutiveKpiCard('Chưa bắt đầu', model.kpis.notStarted, 'Chưa hoàn thành', 'gray')}
      ${renderExecutiveKpiCard('Quá hạn', model.kpis.overdue, 'Không phụ thuộc trạng thái', 'red')}${renderExecutiveKpiCard('Đến hạn 14 ngày', model.kpis.upcoming, 'Không gồm việc quá hạn', 'blue')}
      ${renderExecutiveKpiCard('Mốc chính liên quan', model.kpis.milestones, 'Theo sao vàng global', 'info')}
    </section>
    <section class="exec-grid">${renderDepartmentList('Top 5 quá hạn', model.overdue, 'overdue')}${renderDepartmentList('Đến hạn trong 14 ngày tới', model.upcoming, 'upcoming')}${renderDepartmentList('Kết quả tháng này', model.completedThisMonth, 'completed')}${renderDepartmentList('Mốc chính liên quan', model.milestones, 'milestone')}${!qltdDepartmentDashboardProjectCode ? renderDepartmentProjectSummary(model.projectSummary) : ''}${renderDepartmentEfficiency(qltdDepartmentDashboardDeptCode ? model.individualEfficiency : model.departmentEfficiency, qltdDepartmentDashboardDeptCode, model.individualEmptyMessage)}</section>
  </div>`;
  bindDashboardModeSwitch();
  bindDashboardTaskLinks();
  bindDepartmentEfficiencyRows();
  document.getElementById('deptDashboardRefresh').onclick = () => loadAndRenderDepartmentDashboard(true);
  document.getElementById('deptDashboardDeptFilter').onchange = (event) => { qltdDepartmentDashboardDeptCode = event.target.value; loadAndRenderDepartmentDashboard(); };
  document.getElementById('deptDashboardProjectFilter').onchange = (event) => { qltdDepartmentDashboardProjectCode = event.target.value; loadAndRenderDepartmentDashboard(); };
}

function renderDepartmentList(title, rows, type) {
  const completed = type === 'completed';
  const columns = completed
    ? [
      { label: 'Dự án', className: 'is-text' },
      { label: 'Hạng mục', className: 'is-text' },
      { label: 'Công việc', className: 'is-text' },
      { label: 'Chủ trì', className: 'is-text' },
      { label: 'Hoàn thành thực tế', className: 'is-date' }
    ]
    : [
      { label: 'Dự án', className: 'is-text' },
      { label: 'Hạng mục', className: 'is-text' },
      { label: 'Công việc', className: 'is-text' },
      { label: 'Chủ trì', className: 'is-text' },
      { label: 'Ngày kết thúc', className: 'is-date' },
      { label: 'Còn lại/Trễ', className: 'is-status' }
    ];
  const body = rows.map((task) => {
    const finish = completed ? task.actualFinishDate : task.endDate;
    const dueBadge = getDepartmentDueBadge(task);
    const categoryLabel = task.contextLabel || '—';
    const owner = getDepartmentOwnerPresentation(task.owner);
    return `<tr class="web07-alert-row" data-project-code="${escapeHtml(task.projectCode || '')}" data-task-id="${escapeHtml(getDepartmentTaskLinkId(task))}"><td class="is-text" title="${escapeHtml(task.projectName || task.projectCode || '')}">${escapeHtml(task.projectName || task.projectCode)}</td><td class="exec-context is-text" title="${escapeHtml(task.contextLabel || '')}">${escapeHtml(categoryLabel)}</td><td class="exec-task is-text" title="${escapeHtml(task.text || '')}">${escapeHtml(task.text)}</td><td class="dept-owner-cell is-text" title="${escapeHtml(owner.title)}">${escapeHtml(owner.display)}</td><td class="is-date">${escapeHtml(finish ? formatIsoDateVi(toIsoDateLocal(finish)) : '')}</td>${completed ? '' : `<td class="is-status"><span class="exec-badge ${dueBadge.className}">${escapeHtml(dueBadge.text)}</span></td>`}</tr>`;
  }).join('');
  return `<article class="exec-section ${type === 'overdue' ? 'is-red' : completed ? 'is-green' : 'is-blue'}"><header><h3>${escapeHtml(title)}</h3><span>${rows.length}</span></header>${rows.length ? `<div class="exec-table-wrap"><table class="exec-table dept-table"><thead><tr>${columns.map((column) => `<th class="${column.className}">${column.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : '<p class="exec-empty">Không có dữ liệu phù hợp.</p>'}</article>`;
}

function renderDepartmentProjectSummary(rows) {
  const columns = [
    { label: 'Dự án', className: 'is-text' },
    { label: 'Tổng việc', className: 'is-number' },
    { label: 'Hoàn thành', className: 'is-number' },
    { label: 'Đang thực hiện', className: 'is-number' },
    { label: 'Chưa bắt đầu', className: 'is-number' },
    { label: 'Quá hạn', className: 'is-number' },
    { label: 'Đến hạn 14 ngày', className: 'is-number' },
    { label: 'Tỷ lệ hoàn thành', className: 'is-status' }
  ];
  return `<article class="exec-section dept-project-summary"><header><h3>Tổng hợp theo dự án</h3><span>${rows.length}</span></header>${rows.length ? `<div class="exec-table-wrap"><table class="exec-table dept-summary-table"><thead><tr>${columns.map((column) => `<th class="${column.className}">${column.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><td class="exec-task is-text" title="${escapeHtml(row.projectName || row.projectCode || '')}">${escapeHtml(row.projectName)}</td><td class="is-number">${row.total}</td><td class="is-number">${row.completed}</td><td class="is-number">${row.inProgress}</td><td class="is-number">${row.notStarted}</td><td class="is-number">${row.overdue}</td><td class="is-number">${row.upcoming}</td><td class="is-status"><span class="exec-badge is-blue">${row.completionPercent}%</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="exec-empty">Không có dự án phù hợp.</p>'}</article>`;
}

function renderDepartmentEfficiency(rows = [], deptCode = '', individualEmptyMessage = '') {
  const presentation = getDepartmentPerformancePresentation(deptCode);
  const emptyMessage = presentation.individual && individualEmptyMessage ? individualEmptyMessage : presentation.emptyMessage;
  const columns = [
    { label: presentation.firstColumnLabel, className: 'is-text' },
    { label: 'Tổng việc', className: 'is-number' },
    { label: 'Hoàn thành', className: 'is-number' },
    { label: 'Đang thực hiện', className: 'is-number' },
    { label: 'Chưa bắt đầu', className: 'is-number' },
    { label: 'Quá hạn', className: 'is-status' },
    { label: 'Tỷ lệ hoàn thành', className: 'is-progress' }
  ];
  const body = rows.map((row) => {
    const overdueClass = row.overdue > 0 ? 'is-red' : 'is-green';
    const overdueText = `${row.overdue > 0 ? '⚠' : '✓'} ${row.overdue}`;
    const label = presentation.individual ? row.ownerLabel : `${row.deptCode} - ${row.deptName || row.deptCode}`;
    const rowAttribute = presentation.individual ? '' : ` data-dept-code="${escapeHtml(row.deptCode)}"`;
    return `<tr class="dept-efficiency-row"${rowAttribute}><td class="exec-task is-text" title="${escapeHtml(label)}">${escapeHtml(label)}</td><td class="is-number">${row.total}</td><td class="is-number">${row.completed}</td><td class="is-number">${row.inProgress}</td><td class="is-number">${row.notStarted}</td><td class="is-status"><span class="exec-badge ${overdueClass}">${escapeHtml(overdueText)}</span></td><td class="is-progress">${renderDepartmentProgressBar(row.completionPercent)}</td></tr>`;
  }).join('');
  return `<article class="exec-section dept-efficiency-summary"><header><h3>${presentation.title}</h3><span>${rows.length}</span></header>${rows.length ? `<div class="exec-table-wrap"><table class="exec-table dept-efficiency-table"><thead><tr>${columns.map((column) => `<th class="${column.className}">${column.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : `<p class="exec-empty">${emptyMessage}</p>`}</article>`;
}

function renderDepartmentProgressBar(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="dept-progress" aria-label="${safePercent}%"><span style="width: ${safePercent}%"></span><strong>${safePercent}%</strong></div>`;
}

function bindDepartmentEfficiencyRows() {
  document.querySelectorAll('.dept-efficiency-row[data-dept-code]').forEach((row) => {
    row.onclick = () => {
      qltdDepartmentDashboardDeptCode = row.getAttribute('data-dept-code') || '';
      const selector = document.getElementById('deptDashboardDeptFilter');
      if (selector) selector.value = qltdDepartmentDashboardDeptCode;
      loadAndRenderDepartmentDashboard();
    };
  });
}

function getDepartmentTaskLinkId(task) {
  return task && (task.dashboardLinkId || task.id || task.code || task.wbs || task.rawRowNumber || '');
}

function getDepartmentDueBadge(task) {
  if (task && task.isCompleted) return { text: 'Hoàn thành', className: 'is-green' };
  if (!task || !task.endDate) return { text: 'Chưa có hạn', className: 'is-gray' };
  if (task.lateDays > 0 || task.isOverdue) return { text: `Trễ ${task.lateDays} ngày`, className: 'is-red' };
  const remainingDays = task.remainingDays ?? 0;
  if (remainingDays === 0) return { text: 'Hôm nay', className: 'is-yellow' };
  return { text: `Còn ${remainingDays} ngày`, className: 'is-blue' };
}

function buildExecutiveDashboardModel(payload, contextFilters = {}) {
  const today = parseIsoDate(toIsoDateLocal(new Date()));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const upcomingLimit = addDays(today, 14);
  const enriched = buildExecutiveTaskContext(Array.isArray(payload.data) ? payload.data : []);
  const realTasks = enriched
    .filter((task) => task.isRealTask)
    .filter((task) => executiveTaskMatchesContextFilters(task, contextFilters));
  const dashboardTasks = realTasks.filter((task) => task.highestVisibleTask);
  const completed = realTasks.filter((task) => task.isCompleted);
  const openTasks = dashboardTasks.filter((task) => !task.isCompleted);
  const allOpenTasks = realTasks.filter((task) => !task.isCompleted);
  const inProgress = realTasks.filter((task) => !task.isCompleted && task.normalizedStatus === 'in-progress');
  const notStarted = realTasks.filter((task) => !task.isCompleted && task.normalizedStatus === 'not-started');
  const hasStrictMilestones = enriched.some((task) => task.isMilestone);
  const unmappedContext = realTasks.filter((task) => !qltdExactRowOwnHangMuc(task));
  const milestoneTasks = dashboardTasks.filter((task) => task.isMilestone || (!hasStrictMilestones && task.isMilestoneFallback));

  const allOverdue = allOpenTasks
    .filter((task) => isExecutiveTaskOverdue(task, today))
    .map((task) => ({ ...task, lateDays: qltdDateDiffDays(task.endDate, today) }))
    .sort((a, b) => compareExecutivePriority(a, b) || b.lateDays - a.lateDays);

  const overdue = allOverdue.slice(0, 5);

  const upcoming = allOpenTasks
    .filter((task) => task.endDate && task.endDate >= today && task.endDate <= upcomingLimit)
    .map((task) => ({ ...task, remainingDays: qltdDateDiffDays(today, task.endDate) }))
    .sort((a, b) => compareExecutivePriority(a, b) || a.endDate - b.endDate)
    .slice(0, 10);

  const activeMilestones = milestoneTasks
    .filter((task) => task.isRealTask && !task.isCompleted)
    .map((task) => ({
      ...task,
      lateDays: task.endDate && task.endDate < today ? qltdDateDiffDays(task.endDate, today) : 0,
      remainingDays: task.endDate && task.endDate >= today ? qltdDateDiffDays(today, task.endDate) : null
    }))
    .sort((a, b) => compareExecutivePriority(a, b) || (a.endDate || new Date(8640000000000000)) - (b.endDate || new Date(8640000000000000)))
    .slice(0, 10);

  const completedThisMonth = completed
    .filter((task) => task.actualFinishDate && task.actualFinishDate >= monthStart && task.actualFinishDate < nextMonthStart)
    .sort((a, b) => compareExecutivePriority(a, b) || b.actualFinishDate - a.actualFinishDate)
    .slice(0, 10);

  const nextMilestone = activeMilestones
    .filter((task) => task.endDate && task.endDate >= today)
    .sort((a, b) => a.endDate - b.endDate)[0] || null;

  const severeOverdue = overdue.filter((task) => task.lateDays > 14);
  const deadline3Days = upcoming.filter((task) => task.remainingDays <= 3);
  const lateMilestones = activeMilestones.filter((task) => task.lateDays > 0);
  const lateManagementTasks = overdue.filter((task) => task.wbsLevel <= 2);
  const alerts = [
    ...(unmappedContext.length ? [{
      tone: 'red',
      taskId: unmappedContext[0].id,
      title: 'Chưa xác định Hạng mục',
      text: `${unmappedContext.length} công việc chưa được gắn Hạng mục`
    }] : []),
    ...severeOverdue.map((task) => ({
      tone: 'red',
      taskId: task.id,
      title: 'Việc quá hạn trên 14 ngày',
      text: `${task.text || 'Công việc'} · trễ ${task.lateDays} ngày`
    })),
    ...lateMilestones.map((task) => ({
      tone: 'red',
      taskId: task.id,
      title: 'Mốc lớn quá hạn',
      text: `${task.text || 'Mốc lớn'} · trễ ${task.lateDays} ngày`
    })),
    ...deadline3Days.map((task) => ({
      tone: 'blue',
      taskId: task.id,
      title: 'Đến hạn trong 3 ngày',
      text: `${task.text || 'Công việc'} · còn ${task.remainingDays} ngày`
    })),
    ...lateManagementTasks.map((task) => ({
      tone: 'red',
      taskId: task.id,
      title: 'Công việc cấp I/II quá hạn',
      text: `${task.text || 'Công việc'}${task.contextLabel ? ` · ${task.contextLabel}` : ''}`
    }))
  ].slice(0, 6);

  return {
    completionPercent: realTasks.length ? Math.round((completed.length / realTasks.length) * 100) : 0,
    inProgressPercent: realTasks.length ? Math.round((inProgress.length / realTasks.length) * 100) : 0,
    notStartedPercent: realTasks.length ? Math.round((notStarted.length / realTasks.length) * 100) : 0,
    overduePercent: realTasks.length ? Math.round((allOverdue.length / realTasks.length) * 100) : 0,
    kpis: {
      totalTasks: realTasks.length,
      completed: completed.length,
      inProgress: inProgress.length,
      notStarted: notStarted.length,
      overdue: allOverdue.length,
      activeMilestones: milestoneTasks.filter((task) => !task.isCompleted).length,
      unmappedContext: unmappedContext.length
    },
    updatedAtLabel: getDashboardUpdatedAtLabel(payload),
    openTasks: openTasks.length,
    openMilestones: milestoneTasks.filter((task) => task.isRealTask && !task.isCompleted).length,
    overdue,
    upcoming,
    activeMilestones,
    completedThisMonth,
    nextMilestone,
    alerts,
    usedMilestoneFallback: !hasStrictMilestones
  };
}

function buildExecutiveTaskContext(tasks) {
  const byWbs = {};
  const byId = {};

  tasks.forEach((task) => {
    const item = { ...task };
    item.wbsText = String(task.wbs || task.code || task.id || '').trim();
    item.wbsLevel = Number(task.wbsLevel || getExecutiveWbsLevel(item.wbsText));
    const raw = task.raw || {};
    item.startDate = qltdFirstValidDate(task.start_date, task.planned_start, task.baselineStart, task.planStart);
    item.endDate = getExecutiveTaskDueDate(task);
    item.actualStartDate = qltdFirstValidDate(task.actualStart);
    item.actualFinishDate = qltdFirstValidDate(task.actualFinish, task.actualEnd);
    item.hasAnyDate = !!(item.startDate || item.endDate || item.actualStartDate || item.actualFinishDate);
    item.normalizedStatus = normalizeStatusForFilter(task.status);
    item.hasActionStatus = item.normalizedStatus !== 'unknown';
    item.isCompleted = isExecutiveTaskCompleted(item);
    item.durationDays = Number(task.duration || task.durationDays || task.planDays || task.plannedDays || task.soNgayKeHoach || 0);
    const normalizedRowType = String(task.rowType || '').trim().toUpperCase();
    item.isCategoryRow = normalizedRowType
      ? !['TASK', 'MILESTONE'].includes(normalizedRowType)
      : isExecutiveCategoryRow(task, item, raw);
    item.isRealTask = normalizedRowType
      ? ['TASK', 'MILESTONE'].includes(normalizedRowType)
      : (!item.isCategoryRow && !!String(task.text || '').trim() && (item.hasAnyDate || item.hasActionStatus));
    item.isMilestone = isExecutiveStrictMilestone(task);
    item.isMilestoneFallback = item.wbsLevel >= 1 && item.wbsLevel <= 2;
    item.priorityIcon = getExecutivePriorityIcon(item);
    byId[String(item.id || '')] = item;
    if (item.wbsText) byWbs[item.wbsText] = item;
  });

  return tasks.map((task) => {
    const item = byId[String(task.id || '')] || task;
    const path = buildExecutiveParentPath(item, byWbs);
    const incompleteRealAncestor = findIncompleteRealAncestor(item, byWbs);
    return {
      ...item,
      parentPath: item.contextPath || path.join(' > '),
      parentLevel1: path[0] || '',
      parentLevel2: path[1] || '',
      parentLevel3: path[2] || '',
      contextLabel: qltdExactRowOwnHangMuc(item),
      highestVisibleTask: !incompleteRealAncestor
    };
  });
}

function isNormalizedCountedTask(task) {
  const rowType = String(task && task.rowType || '').trim().toUpperCase();
  return rowType ? rowType === 'TASK' || rowType === 'MILESTONE' : true;
}

function executiveTaskMatchesContextFilters(task, filters = {}) {
  return ['zone', 'loaiCongTrinh', 'congTrinh', 'hangMuc'].every((key) => {
    const expected = String(filters[key] || '').trim();
    return !expected || qltdDashboardTaskField(task, key) === expected;
  });
}

function qltdDashboardTaskField(task, key) {
  if (key === 'zone') return qltdExactRowOwnZone(task);
  if (key === 'hangMuc') return qltdExactRowOwnHangMuc(task);
  return String(task?.[key] || '').trim();
}

function qltdDashboardUniqueTaskValues(tasks, key) {
  return Array.from(new Set((tasks || []).map((task) => qltdDashboardTaskField(task, key)).filter(Boolean))).sort();
}

function renderDashboardContextFilters(tasks) {
  const fields = [
    ['zone', 'Zone'],
    ['loaiCongTrinh', 'Loại công trình'],
    ['congTrinh', 'Công trình'],
    ['hangMuc', 'Hạng mục']
  ].map(([key, label]) => {
    const scopedTasks = key === 'hangMuc' && qltdDashboardContextFilters.zone
      ? tasks.filter((task) => qltdExactRowOwnZone(task) === qltdDashboardContextFilters.zone)
      : tasks;
    return { key, label, values: qltdDashboardUniqueTaskValues(scopedTasks, key) };
  }).filter((field) => field.values.length);
  if (!fields.length) return '';
  return `<section class="exec-context-filter-card" aria-label="Lọc context Dashboard">
    <strong class="exec-context-filter-title">Bộ lọc</strong>
    <div class="exec-context-filters">
    ${fields.map(({ key, label, values }) => {
      return `<label>${escapeHtml(label)}<select data-dashboard-context-filter="${escapeHtml(key)}">
        <option value="">Tất cả</option>
        ${values.map((value) => `<option value="${escapeHtml(value)}" ${qltdDashboardContextFilters[key] === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
      </select></label>`;
    }).join('')}
    </div>
  </section>`;
}

function qltdNormalizeDashboardContextFilters(tasks, filters = {}) {
  const next = {};
  ['zone', 'loaiCongTrinh', 'congTrinh', 'hangMuc'].forEach((key) => {
    const value = String(filters[key] || '').trim();
    const values = qltdDashboardUniqueTaskValues(tasks, key);
    next[key] = value && values.includes(value) ? value : '';
  });
  return next;
}

function bindDashboardContextFilters(payload) {
  document.querySelectorAll('[data-dashboard-context-filter]').forEach((select) => {
    select.onchange = () => {
      const key = select.dataset.dashboardContextFilter;
      if (!Object.prototype.hasOwnProperty.call(qltdDashboardContextFilters, key)) return;
      qltdDashboardContextFilters = { ...qltdDashboardContextFilters, [key]: select.value || '' };
      renderDashboardFromGanttData(payload);
    };
  });
}

function findIncompleteRealAncestor(task, byWbs) {
  const wbs = String(task.wbsText || '').trim();
  if (!wbs || !wbs.includes('.')) return null;

  const parts = wbs.split('.');
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const parentWbs = parts.slice(0, index).join('.');
    const parent = byWbs[parentWbs];
    if (parent && parent.isRealTask && !parent.isCompleted) return parent;
  }

  return null;
}

function getDashboardUpdatedAtLabel(payload) {
  const raw = payload.updatedAt || payload.lastUpdatedAt || payload.generatedAt || payload.timestamp || '';
  const parsed = raw ? new Date(raw) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString('vi-VN');
  return parsed.toLocaleString('vi-VN');
}

function isExecutiveStrictMilestone(task) {
  if (task.type === 'milestone' || isMainMilestoneSelectedTask(task)) return true;
  const raw = task.raw || {};
  const values = [
    task.is_milestone,
    task.milestone,
    task.ma_moc,
    task.loai_cong_viec,
    raw.is_milestone,
    raw.milestone,
    raw.ma_moc,
    raw.loai_cong_viec,
    raw.Moc_chinh,
    raw['Mốc chính'],
    raw['Loại công việc']
  ];
  return values.some((value) => {
    const normalized = normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
    return ['1', 'true', 'yes', 'x', 'co', 'milestone', 'moc', 'mocchinh'].includes(normalized) || normalized.includes('milestone') || normalized.includes('moc');
  });
}

function buildExecutiveParentPath(task, byWbs) {
  const wbs = String(task.wbsText || '').trim();
  if (!wbs || !wbs.includes('.')) return [];

  const parts = wbs.split('.');
  const path = [];
  for (let index = 1; index < parts.length; index += 1) {
    const parentWbs = parts.slice(0, index).join('.');
    const parent = byWbs[parentWbs];
    if (parent && parent.text && parent.text !== task.text) {
      path.push(parent.text);
    }
  }
  return path.slice(0, 3);
}

function getExecutiveWbsLevel(wbs) {
  const text = String(wbs || '').trim();
  if (!text) return 999;
  return text.split('.').length;
}

function getExecutivePriorityIcon(task) {
  if (task.isMilestone) return 'M';
  if (task.wbsLevel === 1) return 'I';
  if (task.wbsLevel === 2) return 'II';
  return '';
}

function compareExecutivePriority(a, b) {
  if (!!b.isMilestone !== !!a.isMilestone) return Number(b.isMilestone) - Number(a.isMilestone);
  if ((a.wbsLevel || 999) !== (b.wbsLevel || 999)) return (a.wbsLevel || 999) - (b.wbsLevel || 999);
  return String(a.wbsText || '').localeCompare(String(b.wbsText || ''), 'vi');
}

function qltdFirstValidDate(...values) {
  for (const value of values) {
    const date = parseIsoDate(value);
    if (date) return date;
  }
  return null;
}

function qltdDateDiffDays(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function renderExecutiveMetric(label, value, tone) {
  return `
    <article class="exec-metric ${tone ? `is-${tone}` : ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
    </article>
  `;
}

function renderExecutiveKpiCard(label, value, subtext, tone) {
  return `
    <article class="exec-kpi-card ${tone ? `is-${tone}` : ''}">
      <div class="exec-kpi-icon" aria-hidden="true"></div>
      <div>
        <strong>${escapeHtml(value ?? 0)}</strong>
        <span>${escapeHtml(label)}</span>
        <em>${escapeHtml(subtext || '')}</em>
      </div>
    </article>
  `;
}

function renderExecutiveAlerts(alerts = []) {
  if (!alerts.length) {
    return `
      <section class="exec-alerts is-ok">
        <header>
          <h3>Cảnh báo điều hành</h3>
          <span>Không có cảnh báo nghiêm trọng</span>
        </header>
      </section>
    `;
  }

  return `
    <section class="exec-alerts">
      <header>
        <h3>Cảnh báo điều hành</h3>
        <span>${escapeHtml(alerts.length)} cảnh báo cần theo dõi</span>
      </header>
      <div class="exec-alert-list">
        ${alerts.map((alert) => `
          <button type="button" class="exec-alert ${alert.tone ? `is-${alert.tone}` : ''}" data-task-id="${escapeHtml(alert.taskId || '')}">
            <strong>${escapeHtml(alert.title)}</strong>
            <span title="${escapeHtml(alert.text || '')}">${escapeHtml(alert.text || '')}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderExecutiveNextMilestone(task) {
  return `
    <article class="exec-metric is-blue">
      <span>Mốc gần nhất</span>
      <strong title="${escapeHtml(task ? task.text : '')}">${escapeHtml(task ? formatIsoDateVi(toIsoDateLocal(task.endDate)) : 'Không có')}</strong>
      <em>${escapeHtml(task ? task.text : 'Không có mốc sắp tới')}</em>
    </article>
  `;
}

function renderExecutiveListSection(title, headers, rows, rowRenderer, emptyText, tone) {
  return `
    <article class="exec-section ${tone ? `is-${tone}` : ''}">
      <header>
        <h3>${escapeHtml(title)}</h3>
        <span>${escapeHtml(rows.length)}</span>
      </header>
      ${rows.length ? `
        <div class="exec-table-wrap">
          <table class="exec-table">
            <thead>
              <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows.map(rowRenderer).join('')}</tbody>
          </table>
        </div>
      ` : `<p class="exec-empty">${escapeHtml(emptyText)}</p>`}
    </article>
  `;
}

function renderExecutiveOverdueRow(task) {
  const hangMuc = qltdExactRowOwnHangMuc(task) || '—';
  return `
    <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
      <td class="exec-context" title="${escapeHtml(hangMuc)}">${escapeHtml(hangMuc)}</td>
      <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
      <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
      <td>${escapeHtml(formatIsoDateVi(toIsoDateLocal(task.endDate)))}</td>
      <td class="exec-days"><span class="exec-badge is-red">${escapeHtml(task.lateDays)} ngày</span></td>
    </tr>
  `;
}

function renderExecutiveMilestoneRow(task) {
  const timeText = task.lateDays > 0 ? `Trễ ${task.lateDays} ngày` : `Còn ${task.remainingDays ?? 0} ngày`;
  const badgeClass = task.lateDays > 0 ? 'is-red' : 'is-blue';
  const hangMuc = qltdExactRowOwnHangMuc(task) || '—';
  return `
    <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
      <td class="exec-context" title="${escapeHtml(hangMuc)}">${escapeHtml(hangMuc)}</td>
      <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
      <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
      <td>${escapeHtml(task.endDate ? formatIsoDateVi(toIsoDateLocal(task.endDate)) : '')}</td>
      <td class="exec-days"><span class="exec-badge ${badgeClass}">${escapeHtml(timeText)}</span></td>
    </tr>
  `;
}

function renderExecutiveUpcomingRow(task) {
  const hangMuc = qltdExactRowOwnHangMuc(task) || '—';
  return `
    <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
      <td class="exec-context" title="${escapeHtml(hangMuc)}">${escapeHtml(hangMuc)}</td>
      <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
      <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
      <td>${escapeHtml(formatIsoDateVi(toIsoDateLocal(task.endDate)))}</td>
      <td class="exec-days"><span class="exec-badge is-blue">Còn ${escapeHtml(task.remainingDays)} ngày</span></td>
    </tr>
  `;
}

function renderExecutiveCompletedSection(rows) {
  return `
    <article class="exec-section is-green">
      <header>
        <h3>Kết quả tháng này</h3>
        <span>${escapeHtml(rows.length)}</span>
      </header>
      ${rows.length ? `
        <div class="exec-table-wrap">
          <table class="exec-table">
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th>Công việc</th>
                <th>Chủ trì</th>
                <th>Ngày hoàn thành thực tế</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((task) => `
                <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
                  <td class="exec-context" title="${escapeHtml(qltdExactRowOwnHangMuc(task) || '—')}">${escapeHtml(qltdExactRowOwnHangMuc(task) || '—')}</td>
                  <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
                  <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
                  <td>${escapeHtml(formatIsoDateVi(toIsoDateLocal(task.actualFinishDate)))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="exec-empty">Không có việc hoàn thành trong tháng.</p>'}
    </article>
  `;
}

function bindDashboardTaskLinks() {
  document.querySelectorAll('.web07-alert-row[data-task-id]').forEach((row) => {
    row.onclick = async () => {
      const taskId = row.getAttribute('data-task-id');
      const projectCode = row.getAttribute('data-project-code') || '';
      await openDashboardTaskInGantt(taskId, projectCode);
    };
  });

  document.querySelectorAll('.exec-alert[data-task-id]').forEach((button) => {
    button.onclick = async () => {
      const taskId = button.getAttribute('data-task-id');
      const projectCode = button.getAttribute('data-project-code') || '';
      await openDashboardTaskInGantt(taskId, projectCode);
    };
  });
}

async function openDashboardTaskInGantt(taskId, projectCode = '') {
  if (!taskId) return;
  const targetProjectCode = String(projectCode || '').trim();
  const currentProjectCode = String(
    targetProjectCode ||
    document.getElementById('projectSelector')?.value ||
    getStoredProjectCode() ||
    ''
  ).trim();

  if (targetProjectCode && targetProjectCode !== currentProjectCode) {
    const selector = document.getElementById('projectSelector');
    if (selector) selector.value = targetProjectCode;
    setStoredProjectCode(targetProjectCode);
    loadDeptPlansForSelectedProject(targetProjectCode);
    await loadGanttDataForSelectedProject(targetProjectCode);
  } else if (!qltdGanttPayload || String(qltdGanttPayload.projectCode || '') !== currentProjectCode) {
    await loadGanttDataForSelectedProject(currentProjectCode);
  }

  showWeb07View('gantt');
  if (qltdGanttPayload) renderGanttPanel(qltdGanttPayload);
  setTimeout(() => focusGanttTask(taskId), 140);
}

function renderBreakdown(map = {}) {
  const entries = Object.entries(map || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (!entries.length) return '<p class="web07-muted">Chưa có dữ liệu.</p>';

  return `
    <table class="web07-table">
      <tbody>
        ${entries.slice(0, 10).map(([key, value]) => `
          <tr>
            <td>${escapeHtml(key)}</td>
            <td><strong>${escapeHtml(value)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderWarnings(warnings) {
  if (!warnings.length) return '';
  const labels = {
    MISSING_TASK_START_DATE: 'Thiếu ngày bắt đầu',
    MISSING_TASK_END_DATE: 'Thiếu ngày kết thúc',
    MISSING_IMPORTANT_COLUMN: 'Thiếu cột quan trọng',
    DUPLICATE_TASK_ID_SKIPPED: 'Trùng ID công việc',
    LINK_SOURCE_NOT_FOUND: 'Liên kết thiếu công việc nguồn',
    LINK_PARSE_FAILED: 'Liên kết chưa đúng định dạng',
    WBS_PARENT_NOT_FOUND: 'Không tìm thấy WBS cha',
    MISSING_TASK_TEXT_USING_ID: 'Thiếu tên công việc'
  };
  const counts = {};
  warnings.forEach((warning) => {
    const label = labels[warning.type] || 'Cảnh báo dữ liệu';
    counts[label] = (counts[label] || 0) + 1;
  });

  return `
    <ul class="web07-warning-list">
      ${Object.entries(counts).slice(0, 8).map(([label, count]) => `
        <li>${escapeHtml(label)}: ${escapeHtml(count)} dòng</li>
      `).join('')}
    </ul>
  `;
}

function normalizeBudgetMasterTaskCode(value) {
  return String(value || '').trim().toUpperCase();
}

function getGanttTaskBudgetCode(task) {
  return normalizeBudgetMasterTaskCode(task && (task.code || task.masterTaskCode || task.masterCode || ''));
}

function getGanttBudgetMapForProject(projectCode) {
  const cached = qltdGanttBudgetCache.get(String(projectCode || '')) || {};
  return cached.byMasterTaskCode || {};
}

function attachGanttBudgetToTasks(tasks, byMasterTaskCode = {}) {
  return (tasks || []).map((task) => {
    const code = getGanttTaskBudgetCode(task);
    const budget = byMasterTaskCode[code] || {};
    const directChiPlan = Number(budget.directChiPlan || 0);
    const plannedRevenue = Number(budget.plannedRevenue || 0);
    return Object.assign({}, task, {
      directChiPlan,
      plannedRevenue,
      chiItemCount: Number(budget.chiItemCount || 0),
      thuItemCount: Number(budget.thuItemCount || 0),
      hasDirectBudget: directChiPlan > 0 || plannedRevenue > 0
    });
  });
}

function formatGanttBudgetCell(value, tone) {
  const amount = Number(value || 0);
  if (!amount) return '<span class="gantt-budget-empty">—</span>';
  return `<span class="gantt-budget-money is-${escapeHtml(tone)}" title="${escapeHtml(formatWeeklyCurrency(amount))}">${escapeHtml(formatCompactBudgetAmount(amount))}</span>`;
}

function ensureGanttBudgetMapForProject(projectCode) {
  const code = String(projectCode || '');
  if (!code || qltdGanttViewMode !== 'budget') return;
  if (qltdGanttBudgetCache.has(code) || qltdGanttBudgetLoadingProjects.has(code)) return;

  qltdGanttBudgetLoadingProjects.add(code);
  const seq = ++qltdGanttBudgetRequestSeq;
  fetchBackendJson('budget_getTaskBudgetMap', {
    email: currentUserProfile?.email || '',
    projectCode: code
  }).then((result) => {
    if (seq !== qltdGanttBudgetRequestSeq) return;
    if (!result.success) throw new Error(result.message || result.errors?.[0]?.message || result.errors?.[0]?.code || 'Không tải được ngân sách Gantt.');
    const data = result.data || result;
    qltdGanttBudgetCache.set(code, {
      byMasterTaskCode: data.byMasterTaskCode || {},
      updatedAt: data.updatedAt || ''
    });
    if (qltdActiveView === 'gantt' && qltdGanttPayload?.projectCode === code && qltdGanttViewMode === 'budget') {
      renderGanttPanel(qltdGanttPayload);
    }
  }).catch((error) => {
    if (seq === qltdGanttBudgetRequestSeq) {
      console.warn('Cannot load Gantt budget map', error);
      qltdGanttBudgetCache.set(code, { byMasterTaskCode: {}, error: error.message || String(error) });
      if (qltdActiveView === 'gantt' && qltdGanttPayload?.projectCode === code && qltdGanttViewMode === 'budget') {
        renderGanttPanel(qltdGanttPayload);
      }
    }
  }).finally(() => {
    qltdGanttBudgetLoadingProjects.delete(code);
  });
}

async function refreshGanttBudgetMapForProject(projectCode) {
  const code = String(projectCode || '');
  if (!code) return null;
  qltdGanttBudgetCache.delete(code);
  qltdGanttBudgetLoadingProjects.delete(code);
  const result = await fetchBackendJson('budget_getTaskBudgetMap', {
    email: currentUserProfile?.email || '',
    projectCode: code,
    force: String(Date.now())
  });
  if (!result.success) throw new Error(result.message || result.errors?.[0]?.message || result.errors?.[0]?.code || 'Không tải được ngân sách Gantt.');
  const data = result.data || result;
  qltdGanttBudgetCache.set(code, {
    byMasterTaskCode: data.byMasterTaskCode || {},
    updatedAt: data.updatedAt || ''
  });
  return data;
}

function formatBudgetSyncSummary(data, title) {
  const model = data || {};
  const lines = [
    title || `Chuẩn bị đồng bộ ngân sách dự án ${model.projectName || model.projectCode || ''}`,
    '',
    `Dòng đã quét: ${model.rowsScanned || 0}`,
    `Dòng đã chốt: ${model.approvedRows || 0}`,
    `Tạo mới: ${Number(model.createItems || 0)} khoản / ${Number(model.createAllocations || 0)} phân bổ`,
    `Cập nhật: ${Number(model.updateItems || 0)} khoản / ${Number(model.updateAllocations || 0)} phân bổ`,
    `Vô hiệu hóa: ${Number(model.deactivateItems || 0)} khoản / ${Number(model.deactivateAllocations || 0)} phân bổ`,
    `Không đổi: ${Number(model.unchanged || 0)}`,
    `Lỗi/conflict cần kiểm tra: ${Number((model.errors || []).length || 0) + Number((model.conflicts || []).length || 0)}`
  ];
  return lines.join('\n');
}

function getBudgetSyncErrorMessage(result, fallback) {
  const errors = result && (result.errors || result.data?.errors) || [];
  if (errors.length) return errors.map((error) => error.message || error.errorCode || error.code).join('\n');
  return fallback || 'Không đồng bộ được ngân sách.';
}

async function handleGanttBudgetSyncClick(button, payload) {
  const projectCode = payload?.projectCode || getStoredProjectCode();
  if (!projectCode || qltdBudgetSyncRunning) return;
  qltdBudgetSyncRunning = true;
  const previousText = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Đang preview...';
  }

  try {
    const preview = await fetchBackendJson('budget_syncApprovedTaskBudgets', {
      email: currentUserProfile?.email || '',
      projectCode,
      dryRun: '1',
      force: String(Date.now())
    });
    if (!preview.success) throw new Error(getBudgetSyncErrorMessage(preview, 'Preview đồng bộ thất bại.'));
    const previewData = preview.data || {};
    const ok = window.confirm(`${formatBudgetSyncSummary(previewData)}\n\nBạn có tiếp tục không?`);
    if (!ok) return;

    if (button) button.textContent = 'Đang đồng bộ...';
    const result = await postBackendJson({
      action: 'budget_syncApprovedTaskBudgets',
      email: currentUserProfile?.email || '',
      projectCode,
      dryRun: '0'
    });
    if (!result.success) throw new Error(getBudgetSyncErrorMessage(result, 'Đồng bộ ngân sách thất bại.'));
    await refreshGanttBudgetMapForProject(projectCode);
    if (qltdGanttPayload?.projectCode === projectCode) renderGanttPanel(qltdGanttPayload);
    alert(formatBudgetSyncSummary(result.data || {}, `Đã đồng bộ ngân sách dự án ${result.data?.projectName || projectCode}`));
  } catch (error) {
    console.error('Cannot sync approved task budgets', error);
    alert(`Không đồng bộ được ngân sách: ${error.message || error}`);
  } finally {
    qltdBudgetSyncRunning = false;
    if (button) {
      button.disabled = false;
      button.textContent = previousText || 'Đồng bộ ngân sách';
    }
  }
}

function renderGanttPanel(payload) {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderGanttPanel');

  if (!payload || !payload.success) {
    panel.innerHTML = `
      <div class="web07-card">
        <p class="empty-state">Endpoint ganttData chưa trả dữ liệu hợp lệ.</p>
        <p class="web07-muted">${escapeHtml(payload && (payload.message || payload.error) || '')}</p>
      </div>
    `;
    return;
  }

  const owners = getUniqueTaskValues(payload.data || [], 'owner');
  const zones = getUniqueTaskValues(payload.data || [], 'ownZone');
  const hangMucs = getUniqueTaskValues(payload.data || [], 'ownHangMuc');
  const canViewMilestoneColumn = canViewMainMilestoneColumn();
  const canResetMilestone = canResetMainMilestone();
  const canExport = canExportExcel();
  if (!canViewMilestoneColumn) qltdMainMilestoneSelectMode = false;
  const milestoneModeLabel = canSelectMainMilestone() ? 'Chọn mốc chính' : 'Hiện sao mốc chính';

  panel.innerHTML = `
    <div class="web07-card">
      <div class="web07-header">
        <div>
          <h2>Gantt điều hành</h2>
          <p class="web07-subtitle">${escapeHtml(payload.projectCode)} - ${escapeHtml(payload.projectName || '')} · ${escapeHtml(payload.sourceSheet || '')}</p>
        </div>
        <span class="web07-chip">${escapeHtml((payload.data || []).length)} công việc · ${escapeHtml((payload.links || []).length)} liên kết</span>
      </div>

      ${renderProjectScheduleControl(payload.projectCode)}
      <div class="web07-toolbar">
        <nav class="gantt-mode-tabs" aria-label="Chế độ Gantt">
          <button type="button" data-gantt-view-mode="progress" class="${qltdGanttViewMode === 'progress' ? 'active' : ''}">Gantt tiến độ</button>
          <button type="button" data-gantt-view-mode="budget" class="${qltdGanttViewMode === 'budget' ? 'active' : ''}">Gantt ngân sách</button>
        </nav>
        <input id="ganttSearchInput" type="search" placeholder="Tìm công việc/WBS">
        <select id="ganttOwnerFilter">
          <option value="">Tất cả</option>
          ${owners.map((owner) => `<option value="${escapeHtml(owner || '__blank__')}">${escapeHtml(owner || 'Chưa rõ')}</option>`).join('')}
        </select>
        <select id="ganttZoneFilter">
          <option value="">Tất cả Zone</option>
          ${zones.map((zone) => `<option value="${escapeHtml(zone)}">${escapeHtml(zone)}</option>`).join('')}
        </select>
        <select id="ganttHangMucFilter">
          <option value="">Tất cả Hạng mục</option>
          ${hangMucs.map((hangMuc) => `<option value="${escapeHtml(hangMuc)}">${escapeHtml(hangMuc)}</option>`).join('')}
        </select>
        <select id="ganttStatusFilter">
          <option value="all">Tất cả</option>
          <option value="not-started">Chưa bắt đầu</option>
          <option value="in-progress">Đang làm</option>
          <option value="completed">Hoàn thành</option>
          <option value="paused">Tạm dừng</option>
          <option value="unknown">Không xác định</option>
        </select>
        <select id="ganttProgressFilter">
          <option value="all">Tất cả</option>
          <option value="overdue">Quá hạn</option>
          <option value="in-progress-on-time">Đang làm trong hạn</option>
          <option value="not-started-on-time">Chưa bắt đầu trong hạn</option>
          <option value="completed-on-time">Hoàn thành đúng hạn</option>
          <option value="completed-late">Hoàn thành trễ</option>
          <option value="paused-on-time">Tạm dừng trong hạn</option>
          <option value="paused-overdue">Tạm dừng quá hạn</option>
          <option value="unknown">Không xác định</option>
        </select>
        <select id="ganttDepthFilter">
          <option value="all">Tất cả</option>
          <option value="wbs-1-2">Cấp 1-2</option>
          <option value="wbs-1-3">Cấp 1-3</option>
          <option value="wbs-1-4">Cấp 1-4</option>
          <option value="main-milestones">Chỉ mốc chính</option>
        </select>
        ${canViewMilestoneColumn ? `
          <button id="ganttMilestoneModeButton" type="button" class="${qltdMainMilestoneSelectMode ? 'active' : ''}" data-label="${escapeHtml(milestoneModeLabel)}">${escapeHtml(milestoneModeLabel)}${qltdMainMilestoneKeys.size ? ` (${qltdMainMilestoneKeys.size})` : ''}</button>
          ${canResetMilestone ? '<button id="ganttMilestoneResetButton" type="button">Reset mốc</button>' : ''}
          <span id="ganttMilestoneBadge" class="web07-muted" title="${escapeHtml(getMainMilestoneBadgeTitle())}">${escapeHtml(getMainMilestoneBadgeText())}</span>
        ` : ''}
        <button id="ganttLinksToggle" type="button" class="${qltdGanttShowLinks ? 'active' : ''}">Mũi tên</button>
        <span id="ganttLinkLegend" class="web07-link-legend ${qltdGanttShowLinks ? '' : 'is-muted'}">
          <span class="web07-link-sample"></span>FS
          <span class="web07-link-sample ss"></span>SS
          <span class="web07-link-sample ff"></span>FF
        </span>
        <button id="ganttDatesToggle" type="button" class="${qltdGanttShowDates ? 'active' : ''}">Ngày trên bar</button>
        ${canExport ? '<button id="ganttExcelButton" type="button">Xuất Excel</button>' : ''}
        ${qltdGanttViewMode === 'budget' ? '<button id="ganttBudgetSyncButton" type="button">Đồng bộ ngân sách</button>' : ''}
        <select id="ganttZoomSelect">
          <option value="day" ${qltdGanttZoom === 'day' ? 'selected' : ''}>Ngày</option>
          <option value="week" ${qltdGanttZoom === 'week' ? 'selected' : ''}>Tuần</option>
          <option value="month" ${qltdGanttZoom === 'month' ? 'selected' : ''}>Tháng</option>
          <option value="quarter" ${qltdGanttZoom === 'quarter' ? 'selected' : ''}>Quý</option>
          <option value="year" ${qltdGanttZoom === 'year' ? 'selected' : ''}>Năm</option>
        </select>
        <button id="ganttReloadButton" type="button">Reload</button>
      </div>

      ${payload.links && payload.links.length ? '' : '<p class="web07-muted">Chưa có mũi tên dependency: không có liên kết hoặc chưa parse được cột Công việc liên kết.</p>'}
      <div id="web07GanttContainer" class="web07-gantt-box"></div>
    </div>
  `;

  if (payload.warnings && payload.warnings.length) {
    console.warn('ganttData warnings', payload.warnings);
  }

  qltdWeb07EnsureGanttPolishStyles();
  qltdWeb07DecorateGanttToolbar();
  bindGanttToolbar(payload);
  qltdWeb07BindExcelButton();
  if (qltdActiveView !== 'gantt') {
    return;
  }

  applyGanttFilters();
}

function bindGanttToolbar(payload) {
  const controls = ['ganttSearchInput', 'ganttOwnerFilter', 'ganttZoneFilter', 'ganttHangMucFilter', 'ganttStatusFilter', 'ganttProgressFilter', 'ganttDepthFilter'];
  controls.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.oninput = applyGanttFilters;
    if (el) el.onchange = applyGanttFilters;
  });

  document.querySelectorAll('[data-gantt-view-mode]').forEach((button) => {
    button.onclick = () => {
      const nextMode = button.dataset.ganttViewMode === 'budget' ? 'budget' : 'progress';
      if (nextMode === qltdGanttViewMode) return;
      qltdGanttViewMode = nextMode;
      if (nextMode === 'budget') ensureGanttBudgetMapForProject(payload.projectCode || getStoredProjectCode());
      renderGanttPanel(payload);
    };
  });

  const linksToggle = document.getElementById('ganttLinksToggle');
  if (linksToggle) {
    linksToggle.onclick = () => {
      qltdGanttShowLinks = !qltdGanttShowLinks;
      linksToggle.classList.toggle('active', qltdGanttShowLinks);
      document.getElementById('ganttLinkLegend')?.classList.toggle('is-muted', !qltdGanttShowLinks);
      applyGanttFilters();
    };
  }

  const budgetSyncButton = document.getElementById('ganttBudgetSyncButton');
  if (budgetSyncButton) {
    budgetSyncButton.onclick = () => handleGanttBudgetSyncClick(budgetSyncButton, payload);
  }

  bindProjectScheduleRecalculateButton(payload.projectCode || getStoredProjectCode());

  const datesToggle = document.getElementById('ganttDatesToggle');
  if (datesToggle) {
    datesToggle.onclick = () => {
      qltdGanttShowDates = !qltdGanttShowDates;
      datesToggle.classList.toggle('active', qltdGanttShowDates);
      applyGanttFilters();
    };
  }

  const zoomSelect = document.getElementById('ganttZoomSelect');
  if (zoomSelect) {
    zoomSelect.onchange = () => {
      qltdGanttZoom = zoomSelect.value || 'month';
      applyGanttFilters();
    };
  }

  const reloadButton = document.getElementById('ganttReloadButton');
  if (reloadButton) {
    reloadButton.onclick = () => loadGanttDataForSelectedProject(payload.projectCode || getStoredProjectCode());
  }

  const milestoneModeButton = document.getElementById('ganttMilestoneModeButton');
  if (milestoneModeButton) {
    milestoneModeButton.onclick = () => {
      if (!canViewMainMilestoneColumn()) return;
      qltdMainMilestoneSelectMode = !qltdMainMilestoneSelectMode;
      renderGanttPanel(qltdGanttPayload);
    };
  }

  const milestoneResetButton = document.getElementById('ganttMilestoneResetButton');
  if (milestoneResetButton) {
    milestoneResetButton.onclick = async () => {
      if (!canResetMainMilestone()) return;
      if (!window.confirm('Xóa toàn bộ mốc chính đã lưu của dự án này?')) return;
      const scroll = getGanttScrollState();
      const reset = await resetMainMilestonesForProject(
        payload.projectCode || getStoredProjectCode(),
        qltdGanttPayload,
        { confirmed: true }
      );
      if (!reset) return;
      const depthFilter = document.getElementById('ganttDepthFilter');
      if (depthFilter && depthFilter.value === 'main-milestones') {
        depthFilter.value = 'all';
      }
      renderGanttPanel(qltdGanttPayload);
      renderDashboardFromGanttData(qltdGanttPayload);
      restoreGanttScrollState(scroll);
    };
  }
}

function applyGanttFilters() {
  if (!qltdGanttPayload) return;
  const search = normalizeSearchText(document.getElementById('ganttSearchInput')?.value || '');
  const owner = document.getElementById('ganttOwnerFilter')?.value || '';
  const zone = document.getElementById('ganttZoneFilter')?.value || '';
  const hangMuc = document.getElementById('ganttHangMucFilter')?.value || '';
  const status = document.getElementById('ganttStatusFilter')?.value || 'all';
  const progressFilter = document.getElementById('ganttProgressFilter')?.value || 'all';
  const depthFilter = document.getElementById('ganttDepthFilter')?.value || 'all';
  const allTasks = qltdGanttPayload.data || [];
  if (qltdGanttViewMode === 'budget') ensureGanttBudgetMapForProject(qltdGanttPayload.projectCode || getStoredProjectCode());
  const byMasterTaskCode = qltdGanttViewMode === 'budget'
    ? getGanttBudgetMapForProject(qltdGanttPayload.projectCode || getStoredProjectCode())
    : {};
  const byId = {};
  allTasks.forEach((task) => { byId[String(task.id)] = task; });
  const hasActiveFilter = !!search || !!owner || !!zone || !!hangMuc ||
    status !== 'all' || progressFilter !== 'all' || depthFilter !== 'all';
  const hasBusinessFilter = !!search || !!owner || !!zone || !!hangMuc ||
    status !== 'all' || progressFilter !== 'all';
  const matchedTasks = hasActiveFilter ? allTasks.filter((task) => {
    const matchSearch = !search || normalizeSearchText(`${task.wbs || ''} ${task.id || ''} ${task.code || ''} ${task.text || ''} ${task.ownZone || ''} ${task.ownHangMuc || ''}`).includes(search);
    const taskOwner = task.owner || '__blank__';
    const matchOwner = !owner || taskOwner === owner;
    const matchZone = !zone || qltdExactRowOwnZone(task) === zone;
    const matchHangMuc = !hangMuc || qltdExactRowOwnHangMuc(task) === hangMuc;
    const matchStatus = status === 'all' || normalizeStatusForFilter(task.status) === status;
    const matchProgress = progressFilter === 'all' || getScheduleState(task) === progressFilter;
    const matchDepth = shouldShowByDepth(task, depthFilter);
    const matchRowType = depthFilter === 'main-milestones'
      ? isGanttBusinessRow(task, depthFilter)
      : (!hasBusinessFilter || isGanttBusinessRow(task, depthFilter));
    return matchRowType &&
      matchSearch && matchOwner && matchZone && matchHangMuc && matchStatus && matchProgress && matchDepth;
  }) : allTasks.slice();

  const filteredView = depthFilter === 'main-milestones'
    ? buildMainMilestoneFilteredView(allTasks, matchedTasks)
    : null;
  const visibleIds = {};
  if (filteredView) {
    filteredView.forEach((task) => { visibleIds[String(task.id)] = true; });
  } else {
    matchedTasks.forEach((task) => {
      let current = task;
      const guard = {};
      while (current && !guard[String(current.id)]) {
        visibleIds[String(current.id)] = true;
        guard[String(current.id)] = true;
        const parentId = String(current.parent || '0');
        if (parentId === '0') break;
        current = byId[parentId];
      }
    });
  }
  const tasks = qltdRecalculateVisibleStructuralSummaries(
    filteredView || allTasks.filter((task) => visibleIds[String(task.id)]),
    visibleIds
  );
  const links = qltdGanttShowLinks
    ? (qltdGanttPayload.links || []).filter((link) => visibleIds[String(link.source)] && visibleIds[String(link.target)])
    : [];
  initDhtmlxGantt(
    qltdGanttViewMode === 'budget' ? attachGanttBudgetToTasks(tasks, byMasterTaskCode) : tasks,
    links
  );
}

function isGanttBusinessRow(task, depthFilter) {
  const rowType = String(task && task.rowType || '').trim().toUpperCase();
  if (depthFilter === 'main-milestones') {
    return ['TASK', 'MILESTONE', 'SCHEDULED_GROUP'].includes(rowType);
  }
  return rowType ? ['TASK', 'MILESTONE'].includes(rowType) : true;
}

function qltdRecalculateVisibleStructuralSummaries(tasks, visibleIds) {
  const byParent = {};
  tasks.forEach((task) => {
    const parent = String(task.parent || '0');
    if (parent !== '0' && visibleIds[parent]) {
      if (!byParent[parent]) byParent[parent] = [];
      byParent[parent].push(task);
    }
  });
  const copies = {};
  tasks.forEach((task) => { copies[String(task.id)] = { ...task }; });

  function visit(task, guard = {}) {
    const id = String(task.id);
    if (guard[id]) return { start: '', end: '' };
    const nextGuard = { ...guard, [id]: true };
    const ranges = (byParent[id] || []).map((child) => {
      const childCopy = copies[String(child.id)];
      const range = visit(childCopy, nextGuard);
      if (childCopy.rowType === 'SCHEDULED_GROUP') {
        const starts = [childCopy.sourceStart || childCopy.start_date || '', range.start].filter(Boolean).sort();
        const ends = [childCopy.sourceEnd || childCopy.end_date || '', range.end].filter(Boolean).sort();
        return { start: starts[0] || '', end: ends.at(-1) || '' };
      }
      return range;
    }).filter((range) => range.start && range.end);
    const rollupStart = ranges.map((range) => range.start).sort()[0] || '';
    const rollupEnd = ranges.map((range) => range.end).sort().at(-1) || '';
    task.rollupStart = rollupStart;
    task.rollupEnd = rollupEnd;
    if (task.rowType === 'ZONE_GROUP' || task.rowType === 'STRUCTURAL_GROUP') {
      task.start_date = rollupStart;
      task.end_date = rollupEnd;
      task.$no_bar = !(rollupStart && rollupEnd);
      task.unscheduled = task.$no_bar;
    }
    if (task.rowType === 'SCHEDULED_GROUP') {
      const starts = [task.sourceStart || task.start_date || '', rollupStart].filter(Boolean).sort();
      const ends = [task.sourceEnd || task.end_date || '', rollupEnd].filter(Boolean).sort();
      return { start: starts[0] || '', end: ends.at(-1) || '' };
    }
    return {
      start: task.start_date || task.displayStart || '',
      end: task.end_date || task.displayEnd || ''
    };
  }

  tasks.filter((task) => String(task.parent || '0') === '0').forEach((task) => visit(copies[String(task.id)]));
  return tasks.map((task) => copies[String(task.id)]);
}

function shouldShowByDepth(task, depthFilter) {
  if (depthFilter === 'main-milestones') {
    return isMainMilestoneKeySelected(
      qltdMainMilestoneKeys,
      task,
      qltdCurrentMainMilestoneProjectKey
    );
  }
  if (depthFilter === 'wbs-1-2') return getTaskWbsLevel(task) <= 2;
  if (depthFilter === 'wbs-1-3') return getTaskWbsLevel(task) <= 3;
  if (depthFilter === 'wbs-1-4') return getTaskWbsLevel(task) <= 4;
  return true;
}

function getTaskWbsLevel(task) {
  const explicit = Number(task && task.wbsLevel);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const wbs = String(task && task.wbs || '').trim();
  if (!wbs) return 999;
  if (/^[IVXLCDM]+(\.\d+)*$/i.test(wbs) || /^\d+(\.\d+)*$/.test(wbs)) return wbs.split('.').length;
  return 999;
}

function qltdWeb07FormatDdMmYy(value) {
  if (!value) return '';
  let date = value;

  if (!(date instanceof Date)) {
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return escapeHtml(String(value || ''));
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function qltdWeb07FormatDdMm(value) {
  if (!value) return '';
  let date = value;

  if (!(date instanceof Date)) {
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function qltdWeb07GetTaskDuration(task) {
  if (!task) return '';

  const isStructuralSummary = task.rowType === 'ZONE_GROUP' || task.rowType === 'STRUCTURAL_GROUP';
  if (isStructuralSummary) {
    const summaryStart = parseIsoDate(task.start_date);
    const summaryEnd = parseIsoDate(task.end_date);
    if (!summaryStart || !summaryEnd) return '';
    const summaryDays = Math.round((summaryEnd.getTime() - summaryStart.getTime()) / 86400000) + 1;
    return summaryDays > 0 ? summaryDays : '';
  }

  if (task.rowType === 'SCHEDULED_GROUP') {
    const sourceDuration = Number(task.sourceDuration);
    if (Number.isFinite(sourceDuration) && sourceDuration > 0) {
      return Math.round(sourceDuration);
    }
    const sourceStart = parseIsoDate(task.sourceStart || task.start_date);
    const sourceEnd = parseIsoDate(task.sourceEnd || task.end_date);
    if (sourceStart && sourceEnd) {
      const sourceDays = Math.round((sourceEnd.getTime() - sourceStart.getTime()) / 86400000) + 1;
      if (sourceDays > 0) return sourceDays;
    }
  }

  const explicit = Number(task.duration);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.round(explicit);
  }

  const start = parseIsoDate(task.start_date || task.baselineStart);
  const end = parseIsoDate(task.end_date || task.baselineEnd);

  if (!start || !end) return '';

  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return days > 0 ? days : '';
}

function qltdResolveDhtmlxTaskType(task) {
  if (task && task.rowType === 'MILESTONE') return 'milestone';
  return 'task';
}

function qltdPrepareDhtmlxTask(task) {
  const isScheduledGroup = task && task.rowType === 'SCHEDULED_GROUP';
  const startDate = isScheduledGroup ? (task.sourceStart || task.start_date) : task.start_date;
  const endDate = isScheduledGroup ? (task.sourceEnd || task.end_date) : task.end_date;
  const explicitDuration = Number(task && (task.sourceDuration ?? task.duration));
  const sourceDuration = isScheduledGroup && Number.isFinite(explicitDuration) && explicitDuration > 0
    ? explicitDuration
    : task && task.sourceDuration;
  return {
    ...task,
    start_date: startDate || '',
    end_date: endDate || '',
    sourceDuration,
    duration: isScheduledGroup
      ? qltdWeb07GetTaskDuration({ ...task, start_date: startDate, end_date: endDate, sourceDuration })
      : task.duration,
    type: qltdResolveDhtmlxTaskType(task),
    unscheduled: !(startDate && endDate),
    $no_bar: isScheduledGroup
      ? !(startDate && endDate)
      : Boolean(task.$no_bar || !(startDate && endDate))
  };
}

function qltdWeb07GetTaskDisplayStart(task) {
  if (task && task.rowType === 'SCHEDULED_GROUP') {
    return task.sourceStart || task.start_date || task.baselineStart || '';
  }
  return task && (task.start_date || task.baselineStart) || '';
}

function qltdWeb07GetTaskDisplayEnd(task) {
  if (task && task.rowType === 'SCHEDULED_GROUP') {
    return task.sourceEnd || task.end_date || task.baselineEnd || '';
  }
  return task && (task.end_date || task.baselineEnd) || '';
}

function qltdWeb07EnsureGanttPolishStyles() {
  if (document.getElementById('web07GanttUiPolishStyles')) return;

  const style = document.createElement('style');
  style.id = 'web07GanttUiPolishStyles';
  style.textContent = `
    :root {
      --qltd-web07-link-y-shift: 0px;
    }

    .qltd-web07-toolbar-field {
      display: inline-flex;
      flex-direction: column;
      gap: 4px;
      margin-right: 10px;
      vertical-align: top;
    }

    .qltd-web07-toolbar-label {
      font-size: 12px;
      font-weight: 700;
      color: #475467;
      line-height: 1.2;
      white-space: nowrap;
    }

    #web07GanttContainer .gantt_task_line {
      height: 16px !important;
      line-height: 16px !important;
      border-radius: 4px !important;
      margin-top: 0 !important;
      box-sizing: border-box !important;
    }

    #web07GanttContainer .gantt_task_content {
      line-height: 16px !important;
    }

    #web07GanttContainer .gantt_task_progress {
      background: rgba(255, 255, 255, .28) !important;
    }

    #web07GanttContainer .gantt_grid_scale .gantt_grid_head_cell,
    #web07GanttContainer .gantt_grid_data .gantt_cell {
      border-right: 1px solid #d9e1ea !important;
      box-sizing: border-box !important;
    }

    #web07GanttContainer .gantt_grid_data .gantt_row,
    #web07GanttContainer .gantt_grid_scale {
      border-bottom: 1px solid #e5eaf0 !important;
    }

    #web07GanttContainer .gantt_grid,
    #web07GanttContainer .gantt_grid_scale,
    #web07GanttContainer .gantt_grid_data {
      background: #fff !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_line_wrapper,
    #web07GanttContainer .gantt_line_wrapper {
      transform: translateY(var(--qltd-web07-link-y-shift)) !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_right {
      border-left-color: var(--dependency-link-color, #64748b) !important;
      border-right-color: transparent !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_left {
      border-right-color: var(--dependency-link-color, #64748b) !important;
      border-left-color: transparent !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-overdue,
    #web07GanttContainer .gantt_task_line.qltd-task-overdue .gantt_task_content {
      background: #dc2626 !important;
      border-color: #b91c1c !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-done,
    #web07GanttContainer .gantt_task_line.qltd-task-done .gantt_task_content {
      background: #16a34a !important;
      border-color: #15803d !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-active,
    #web07GanttContainer .gantt_task_line.qltd-task-active .gantt_task_content {
      background: #2563eb !important;
      border-color: #1d4ed8 !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-not-started,
    #web07GanttContainer .gantt_task_line.qltd-task-not-started .gantt_task_content {
      background: #f4b400 !important;
      border-color: #d97706 !important;
      color: #1f2937 !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-paused,
    #web07GanttContainer .gantt_task_line.qltd-task-paused .gantt_task_content {
      background: #98a2b3 !important;
      border-color: #667085 !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-unknown,
    #web07GanttContainer .gantt_task_line.qltd-task-unknown .gantt_task_content {
      background: #94a3b8 !important;
      border-color: #64748b !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-zone-summary,
    #web07GanttContainer .gantt_task_line.qltd-zone-summary .gantt_task_content {
      background: #1e3a8a !important;
      border-color: #172554 !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-structural-summary,
    #web07GanttContainer .gantt_task_line.qltd-structural-summary .gantt_task_content {
      background: #7c3aed !important;
      border-color: #5b21b6 !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-scheduled-group,
    #web07GanttContainer .gantt_task_line.qltd-scheduled-group .gantt_task_content {
      background: #0f766e !important;
      border-color: #115e59 !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_side_content,
    #web07GanttContainer .gantt_task_content {
      font-size: 11px !important;
      font-weight: 600;
    }

    body.qltd-printing > :not(.qltd-gantt-print-root) {
      display: none !important;
    }

    .qltd-gantt-print-root {
      display: none;
    }

    .qltd-gantt-print-root .web07-toolbar {
      display: none !important;
    }

    .qltd-gantt-print-root #web07GanttPanel,
    .qltd-gantt-print-root #web07GanttContainer,
    .qltd-gantt-print-root #web07GanttContainer .gantt_container,
    .qltd-gantt-print-root #web07GanttContainer .gantt_layout,
    .qltd-gantt-print-root #web07GanttContainer .gantt_grid,
    .qltd-gantt-print-root #web07GanttContainer .gantt_task,
    .qltd-gantt-print-root #web07GanttContainer .gantt_data_area,
    .qltd-gantt-print-root #web07GanttContainer .gantt_task_bg {
      overflow: visible !important;
    }

    #web07GanttContainer.qltd-gantt-export-mode .gantt_tree_content {
      display: inline !important;
      width: auto !important;
      max-width: none !important;
      overflow: visible !important;
      text-overflow: clip !important;
      white-space: normal !important;
      line-height: 15px !important;
    }

    #web07GanttContainer.qltd-gantt-export-mode .gantt_cell {
      white-space: normal !important;
    }

    @media print {
      @page {
        size: A4 landscape;
        margin: 8mm;
      }

      html,
      body.qltd-printing {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }

      body.qltd-printing > :not(.qltd-gantt-print-root) {
        display: none !important;
      }

      .qltd-gantt-print-root {
        display: block !important;
        position: static !important;
        width: var(--qltd-web07-print-width, 100%) !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      .qltd-gantt-print-title {
        margin: 0 0 8px !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        line-height: 1.25 !important;
        color: #111827 !important;
      }

      .qltd-gantt-print-root #web07GanttPanel,
      .qltd-gantt-print-root #web07GanttContainer {
        width: var(--qltd-web07-print-width, 100%) !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function qltdWeb07WrapToolbarControl(control, labelText) {
  if (!control) return;
  if (control.closest('.qltd-web07-toolbar-field') || control.closest('.qltd-toolbar-field')) return;

  const parent = control.parentNode;
  if (!parent) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'qltd-web07-toolbar-field';

  const label = document.createElement('span');
  label.className = 'qltd-web07-toolbar-label';
  label.textContent = labelText;

  parent.insertBefore(wrapper, control);
  wrapper.appendChild(label);
  wrapper.appendChild(control);
}

function qltdWeb07DecorateGanttToolbar() {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;

  const toolbar = panel.querySelector('.web07-toolbar');
  if (!toolbar) return;

  const searchInput = toolbar.querySelector('#ganttSearchInput');
  if (searchInput) qltdWeb07WrapToolbarControl(searchInput, 'Tìm kiếm');

  const owner = toolbar.querySelector('#ganttOwnerFilter');
  if (owner) qltdWeb07WrapToolbarControl(owner, 'Chủ trì');

  const status = toolbar.querySelector('#ganttStatusFilter');
  if (status) qltdWeb07WrapToolbarControl(status, 'Trạng thái thực hiện');

  const progress = toolbar.querySelector('#ganttProgressFilter');
  if (progress) qltdWeb07WrapToolbarControl(progress, 'Tiến độ');

  const depth = toolbar.querySelector('#ganttDepthFilter');
  if (depth) qltdWeb07WrapToolbarControl(depth, 'Hiển thị đến');

  const zoom = toolbar.querySelector('#ganttZoomSelect');
  if (zoom) qltdWeb07WrapToolbarControl(zoom, 'Zoom');
}

function qltdWeb07GetVisibleGanttTasks(gantt) {
  const tasks = [];
  if (!gantt || typeof gantt.eachTask !== 'function') return tasks;

  gantt.eachTask((task) => {
    if (!task || task.$no_bar || !task.start_date || !task.end_date) return;
    if (typeof gantt.isTaskVisible === 'function' && !gantt.isTaskVisible(task.id)) return;
    tasks.push(task);
  });

  return tasks;
}

function qltdWeb07GetVisibleGanttRows(gantt) {
  const rows = [];
  if (!gantt || typeof gantt.eachTask !== 'function') return rows;

  gantt.eachTask((task) => {
    if (!task) return;
    if (typeof gantt.isTaskVisible === 'function' && !gantt.isTaskVisible(task.id)) return;
    rows.push(task);
  });

  return rows;
}

function qltdWeb07MeasureGanttExportLayout(gantt, container) {
  const columns = Array.isArray(gantt && gantt.config && gantt.config.columns)
    ? gantt.config.columns.map((column) => ({ ...column }))
    : [];
  const textColumn = columns.find((column) => column.name === 'text');
  if (!textColumn) {
    return {
      columns,
      gridWidth: Number(gantt && gantt.config && gantt.config.grid_width || 552),
      rowHeight: Number(gantt && gantt.config && gantt.config.row_height || 32),
      wrappedTaskIds: [],
      needsWrap: false
    };
  }

  const sample = container && container.querySelector('.gantt_tree_content');
  const computed = sample && typeof getComputedStyle === 'function' ? getComputedStyle(sample) : null;
  const font = computed && computed.font
    ? computed.font
    : `${computed && computed.fontWeight || 400} ${computed && computed.fontSize || '11px'} ${computed && computed.fontFamily || 'Arial, sans-serif'}`;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const widthCache = new Map();
  if (context) context.font = font;

  function measure(value) {
    const text = String(value || '');
    const key = `${font}\n${text}`;
    if (widthCache.has(key)) return widthCache.get(key);
    const width = context ? context.measureText(text).width : text.length * 7;
    widthCache.set(key, width);
    return width;
  }

  let maxRequiredWidth = 0;
  const measuredRows = [];
  qltdWeb07GetVisibleGanttRows(gantt).forEach((task) => {
    const explicitLevel = Number(task.$level);
    const level = Number.isFinite(explicitLevel) && explicitLevel >= 0
      ? explicitLevel
      : Math.max(0, getTaskWbsLevel(task) - 1);
    const treeIndentAndIcons = level * 20 + 48;
    const requiredWidth = measure(task.text) + treeIndentAndIcons + 20;
    maxRequiredWidth = Math.max(maxRequiredWidth, requiredWidth);
    measuredRows.push({ id: task.id, requiredWidth });
  });

  canvas.width = 1;
  canvas.height = 1;

  const minNameWidth = Math.max(300, Number(textColumn.width || 0));
  const maxNameWidth = 640;
  const nameWidth = Math.min(maxNameWidth, Math.max(minNameWidth, Math.ceil(maxRequiredWidth || minNameWidth)));
  textColumn.width = nameWidth;
  const gridWidth = columns.reduce((total, column) => total + Math.max(0, Number(column.width || 0)), 0);
  const needsWrap = maxRequiredWidth > nameWidth;
  const wrappedTaskIds = measuredRows
    .filter((item) => item.requiredWidth > nameWidth)
    .map((item) => item.id);

  return {
    columns,
    gridWidth,
    nameWidth,
    maxRequiredWidth,
    needsWrap,
    wrappedTaskIds,
    rowHeight: Number(gantt.config.row_height || 32)
  };
}

function qltdWeb07GetGanttExportRange(gantt) {
  const tasks = qltdWeb07GetVisibleGanttTasks(gantt);
  let minDate = null;
  let maxDate = null;

  tasks.forEach((task) => {
    const start = task.start_date instanceof Date ? task.start_date : new Date(task.start_date);
    const end = task.end_date instanceof Date ? task.end_date : new Date(task.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    if (!minDate || start < minDate) minDate = start;
    if (!maxDate || end > maxDate) maxDate = end;
  });

  if (!minDate || !maxDate) {
    const state = typeof gantt.getState === 'function' ? gantt.getState() : {};
    minDate = state.min_date || new Date();
    maxDate = state.max_date || addDays(minDate, 30);
  }

  return {
    start: gantt.date && typeof gantt.date.add === 'function' ? gantt.date.add(minDate, -7, 'day') : addDays(minDate, -7),
    end: gantt.date && typeof gantt.date.add === 'function' ? gantt.date.add(maxDate, 7, 'day') : addDays(maxDate, 7)
  };
}

function qltdWeb07GetFullGanttExportSize(gantt, range) {
  const tasks = qltdWeb07GetVisibleGanttRows(gantt);
  const rowHeight = Number(gantt.config.row_height || 32);
  const gridWidth = Number(gantt.config.grid_width || 552);
  let timelineWidthByDate = 0;

  if (range && range.end && typeof gantt.posFromDate === 'function') {
    try {
      timelineWidthByDate = Math.ceil(gantt.posFromDate(range.end));
    } catch (error) {
      timelineWidthByDate = 0;
    }
  }

  const taskWidth = Math.max(
    timelineWidthByDate,
    gantt.$task_data ? gantt.$task_data.scrollWidth : 0,
    gantt.$task ? gantt.$task.scrollWidth : 0,
    1200
  );
  const root = gantt.$root || document.getElementById('web07GanttContainer');
  const renderedWidth = root ? Math.max(root.scrollWidth || 0, root.offsetWidth || 0) : 0;
  const renderedHeight = root ? Math.max(root.scrollHeight || 0, root.offsetHeight || 0) : 0;
  const taskRowsHeight = tasks.reduce(
    (total, task) => total + Number(task.row_height || rowHeight),
    0
  );
  const height = Math.max(
    760,
    renderedHeight,
    taskRowsHeight + 3 * rowHeight + Number(gantt.config.scale_height || 54) + 120
  );

  return {
    width: Math.max(1280, renderedWidth, gridWidth + taskWidth + 120),
    height
  };
}

async function qltdWeb07PrepareGanttPrint() {
  const gantt = getDhtmlxGanttInstance();
  const container = document.getElementById('web07GanttContainer');
  const panel = document.getElementById('web07GanttPanel');
  if (!gantt || !container) return null;

  const range = qltdWeb07GetGanttExportRange(gantt);
  const prev = {
    startDate: gantt.config.start_date,
    endDate: gantt.config.end_date,
    smartRendering: gantt.config.smart_rendering,
    fitTasks: gantt.config.fit_tasks,
    autofit: gantt.config.autofit,
    autosize: gantt.config.autosize,
    columns: Array.isArray(gantt.config.columns) ? gantt.config.columns.map((column) => ({ ...column })) : [],
    gridWidth: gantt.config.grid_width,
    rowHeight: gantt.config.row_height,
    taskHeights: [],
    scroll: typeof gantt.getScrollState === 'function' ? gantt.getScrollState() : null,
    panelWidth: panel ? panel.style.width : '',
    panelMaxWidth: panel ? panel.style.maxWidth : '',
    containerWidth: container.style.width,
    containerHeight: container.style.height,
    containerMinWidth: container.style.minWidth,
    containerMinHeight: container.style.minHeight,
    containerOverflow: container.style.overflow,
    printWidth: document.documentElement.style.getPropertyValue('--qltd-web07-print-width')
  };

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const exportLayout = qltdWeb07MeasureGanttExportLayout(gantt, container);
  exportLayout.wrappedTaskIds.forEach((taskId) => {
    const task = typeof gantt.getTask === 'function' ? gantt.getTask(taskId) : null;
    if (!task) return;
    prev.taskHeights.push({
      id: taskId,
      hadRowHeight: Object.prototype.hasOwnProperty.call(task, 'row_height'),
      rowHeight: task.row_height,
      hadBarHeight: Object.prototype.hasOwnProperty.call(task, 'bar_height'),
      barHeight: task.bar_height
    });
    task.row_height = 46;
    task.bar_height = Number(task.bar_height || gantt.config.bar_height || 16);
  });

  gantt.config.start_date = range.start;
  gantt.config.end_date = range.end;
  gantt.config.smart_rendering = false;
  gantt.config.fit_tasks = false;
  gantt.config.autofit = false;
  gantt.config.autosize = 'xy';
  gantt.config.columns = exportLayout.columns;
  gantt.config.grid_width = exportLayout.gridWidth;
  container.classList.add('qltd-gantt-export-mode');
  gantt.render();
  await qltdWeb07NextFrame();

  const full = qltdWeb07GetFullGanttExportSize(gantt, range);
  document.documentElement.style.setProperty('--qltd-web07-print-width', `${full.width}px`);

  if (panel) {
    panel.style.width = `${full.width}px`;
    panel.style.maxWidth = 'none';
  }

  container.style.width = `${full.width}px`;
  container.style.minWidth = `${full.width}px`;
  container.style.height = `${full.height}px`;
  container.style.minHeight = `${full.height}px`;
  container.style.overflow = 'visible';

  if (typeof gantt.setSizes === 'function') gantt.setSizes();
  gantt.render();
  await qltdWeb07NextFrame();

  if (typeof gantt.scrollTo === 'function') {
    gantt.scrollTo(0, 0);
    await qltdWeb07NextFrame();
  }

  return { gantt, container, panel, prev, full, exportLayout };
}

function qltdWeb07RemoveGanttPrintRoots() {
  document.querySelectorAll('.qltd-gantt-print-root').forEach((root) => root.remove());
}

function qltdWeb07LoadBrowserScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);

  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Không tải được thư viện: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => reject(new Error(`Không tải được thư viện: ${src}`));
    document.head.appendChild(script);
  });
}

function qltdWeb07LoadExcelJs() {
  if (!qltdExcelJsLoadPromise) {
    qltdExcelJsLoadPromise = qltdWeb07LoadBrowserScript(
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      'ExcelJS'
    );
  }
  return qltdExcelJsLoadPromise;
}

function qltdWeb07LoadHtmlToImage() {
  if (!qltdHtmlToImageLoadPromise) {
    qltdHtmlToImageLoadPromise = qltdWeb07LoadBrowserScript(
      'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
      'htmlToImage'
    );
  }
  return qltdHtmlToImageLoadPromise;
}

function qltdWeb07BuildGanttPrintRoot(ctx) {
  if (!ctx || !ctx.container) return null;

  qltdWeb07RemoveGanttPrintRoots();

  const root = document.createElement('section');
  root.className = 'qltd-gantt-print-root';
  root.setAttribute('aria-hidden', 'true');
  root.style.width = `${ctx.full.width}px`;

  const title = document.createElement('h1');
  title.className = 'qltd-gantt-print-title';
  const projectName = qltdGanttPayload && (qltdGanttPayload.projectName || qltdGanttPayload.projectCode);
  const modeLabel = qltdGanttViewMode === 'budget' ? 'Gantt ngân sách' : 'Gantt tiến độ';
  title.textContent = projectName ? `${modeLabel} - ${projectName}` : modeLabel;
  root.appendChild(title);

  const ganttClone = ctx.container.cloneNode(true);
  ganttClone.style.width = `${ctx.full.width}px`;
  ganttClone.style.minWidth = `${ctx.full.width}px`;
  ganttClone.style.height = `${ctx.full.height}px`;
  ganttClone.style.minHeight = `${ctx.full.height}px`;
  ganttClone.style.overflow = 'visible';
  root.appendChild(ganttClone);

  document.body.appendChild(root);
  return root;
}

function qltdWeb07CollectGanttLinks(gantt) {
  const links = [];

  if (gantt && typeof gantt.eachLink === 'function') {
    try {
      gantt.eachLink((link) => {
        links.push({ ...link });
      });
    } catch (error) {
      console.warn('Cannot read DHTMLX links for Excel export', error);
    }
  }

  if (!links.length && qltdGanttPayload && Array.isArray(qltdGanttPayload.links)) {
    return qltdGanttPayload.links.map((link) => ({ ...link }));
  }

  return links;
}

function qltdWeb07BuildLinkTextByTarget(gantt) {
  const links = qltdWeb07CollectGanttLinks(gantt);
  const sourceNameById = {};

  qltdWeb07GetVisibleGanttTasks(gantt).forEach((task) => {
    sourceNameById[String(task.id)] = task.wbs || task.code || task.text || task.id;
  });

  const byTarget = {};
  links.forEach((link) => {
    const targetId = String(link.target || '');
    const sourceId = String(link.source || '');
    if (!targetId || !sourceId) return;

    const relation = String(link.relation || relationFromDhtmlxType(link.type) || 'FS').toUpperCase();
    const sourceLabel = sourceNameById[sourceId] || sourceId;
    if (!byTarget[targetId]) byTarget[targetId] = { predecessors: [], relations: [] };
    byTarget[targetId].predecessors.push(sourceLabel);
    byTarget[targetId].relations.push(relation);
  });

  return byTarget;
}

function qltdWeb07BuildGanttDataRows(gantt) {
  const linkTextByTarget = qltdWeb07BuildLinkTextByTarget(gantt);

  return qltdWeb07GetVisibleGanttTasks(gantt).map((task) => {
    const linkInfo = linkTextByTarget[String(task.id)] || {};
    const row = {
      wbs: task.wbs || task.id || '',
      text: task.text || '',
      owner: task.owner || '',
      duration: qltdWeb07GetTaskDuration(task),
      start: qltdWeb07FormatDdMmYy(task.start_date || task.baselineStart || ''),
      end: qltdWeb07FormatDdMmYy(task.end_date || task.baselineEnd || ''),
      predecessors: (linkInfo.predecessors || []).join(', ') || task.predecessorRaw || '',
      relation: Array.from(new Set(linkInfo.relations || [])).join(', '),
      status: task.status || '',
      note: task.updateNote || task.note || ''
    };
    if (qltdGanttViewMode === 'budget') {
      row.directChiPlan = task.directChiPlan ? Number(task.directChiPlan || 0) : '';
      row.plannedRevenue = task.plannedRevenue ? Number(task.plannedRevenue || 0) : '';
    }
    return row;
  });
}

function qltdWeb07BuildGanttDataColumns() {
  const columns = [
    { header: 'WBS', key: 'wbs', width: 16 },
    { header: 'Công việc', key: 'text', width: 48 },
    { header: 'Chủ trì', key: 'owner', width: 20 },
    { header: 'Số ngày', key: 'duration', width: 12 },
    { header: 'BĐ', key: 'start', width: 14 },
    { header: 'KT', key: 'end', width: 14 },
    { header: 'Tiền nhiệm', key: 'predecessors', width: 26 },
    { header: 'Loại liên kết', key: 'relation', width: 16 },
    { header: 'Trạng thái', key: 'status', width: 18 },
    { header: 'Ghi chú', key: 'note', width: 36 }
  ];
  if (qltdGanttViewMode === 'budget') {
    columns.splice(
      3,
      0,
      { header: 'Trần chi phí trực tiếp', key: 'directChiPlan', width: 22 },
      { header: 'Dự thu kế hoạch', key: 'plannedRevenue', width: 20 }
    );
  }
  return columns;
}

function qltdWeb07SafeFilename(value) {
  return String(value || 'gantt')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'gantt';
}

function qltdWeb07DownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const QLTD_WEB07_GANTT_CAPTURE_LIMITS = Object.freeze({
  maxCanvasDimension: 16384,
  maxCanvasPixels: 48000000,
  maxEstimatedBytes: 192 * 1024 * 1024,
  maxSlices: 4,
  minSliceHeight: 720
});

function qltdWeb07BuildGanttVerticalSlices(totalHeight, maxSliceHeight, rowHeight, scaleHeight, rowBoundaries = []) {
  const slices = [];
  const total = Math.max(1, Math.ceil(totalHeight));
  const row = Math.max(1, Math.ceil(rowHeight || 32));
  const header = Math.max(0, Math.ceil(scaleHeight || 0));
  let offset = 0;

  while (offset < total) {
    const remaining = total - offset;
    let height = Math.min(remaining, Math.max(row, Math.floor(maxSliceHeight)));

    if (remaining > height) {
      const safeBoundary = rowBoundaries
        .filter((boundary) => boundary > offset && boundary <= offset + height)
        .at(-1);
      if (safeBoundary) {
        height = safeBoundary - offset;
      } else if (offset === 0 && height > header + row) {
        height = header + Math.max(row, Math.floor((height - header) / row) * row);
      } else {
        height = Math.max(row, Math.floor(height / row) * row);
      }
    }

    slices.push({ offset, height });
    offset += height;
  }

  return slices;
}

function qltdWeb07GetGanttRowBoundaries(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  const containerRect = container.getBoundingClientRect();
  return Array.from(container.querySelectorAll('.gantt_grid_data .gantt_row'))
    .map((row) => {
      const rect = row.getBoundingClientRect();
      return Math.round(rect.bottom - containerRect.top);
    })
    .filter((boundary, index, values) => boundary > 0 && (index === 0 || boundary > values[index - 1]));
}

function qltdWeb07ChooseGanttCapturePlan(width, height, rowHeight, scaleHeight, limits = QLTD_WEB07_GANTT_CAPTURE_LIMITS, rowBoundaries = []) {
  const baseWidth = Math.max(1, Math.ceil(width));
  const baseHeight = Math.max(1, Math.ceil(height));
  const ratios = [4, 3, 2, 1.5, 1];

  for (const pixelRatio of ratios) {
    const pixelWidth = Math.ceil(baseWidth * pixelRatio);
    if (pixelWidth > limits.maxCanvasDimension) continue;

    const maxPixelHeight = Math.floor(Math.min(
      limits.maxCanvasDimension,
      limits.maxCanvasPixels / pixelWidth,
      limits.maxEstimatedBytes / (pixelWidth * 4)
    ));
    const maxBaseSliceHeight = Math.floor(maxPixelHeight / pixelRatio);
    if (maxBaseSliceHeight < Math.min(baseHeight, limits.minSliceHeight)) continue;

    const slices = qltdWeb07BuildGanttVerticalSlices(
      baseHeight,
      maxBaseSliceHeight,
      rowHeight,
      scaleHeight,
      rowBoundaries
    );
    if (slices.length > limits.maxSlices) continue;

    return {
      width: baseWidth,
      height: baseHeight,
      pixelRatio,
      pixelWidth,
      slices
    };
  }

  throw new Error('Gantt quá lớn để tạo PNG an toàn. Hãy lọc bớt dòng hoặc thu hẹp khoảng thời gian rồi thử lại.');
}

function qltdWeb07CreateGanttCaptureFrame(ctx, slice) {
  const frame = document.createElement('div');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.left = '-100000px';
  frame.style.top = '0';
  frame.style.width = `${ctx.full.width}px`;
  frame.style.height = `${slice.height}px`;
  frame.style.overflow = 'hidden';
  frame.style.background = '#ffffff';
  frame.style.transform = 'none';
  frame.style.zoom = '1';

  const clone = ctx.container.cloneNode(true);
  clone.classList.add('qltd-gantt-export-mode');
  clone.style.position = 'absolute';
  clone.style.left = '0';
  clone.style.top = `${-slice.offset}px`;
  clone.style.width = `${ctx.full.width}px`;
  clone.style.minWidth = `${ctx.full.width}px`;
  clone.style.height = `${ctx.full.height}px`;
  clone.style.minHeight = `${ctx.full.height}px`;
  clone.style.overflow = 'visible';
  clone.style.transform = 'none';
  clone.style.zoom = '1';
  frame.appendChild(clone);
  document.body.appendChild(frame);
  return frame;
}

async function qltdWeb07CaptureGanttPng(ctx) {
  const htmlToImage = await qltdWeb07LoadHtmlToImage();
  if (!htmlToImage || typeof htmlToImage.toCanvas !== 'function') {
    throw new Error('Thư viện html-to-image chưa sẵn sàng.');
  }

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const renderedWidth = Math.max(ctx.full.width, ctx.container.scrollWidth || 0);
  const renderedHeight = Math.max(ctx.full.height, ctx.container.scrollHeight || 0);
  ctx.full.width = Math.ceil(renderedWidth);
  ctx.full.height = Math.ceil(renderedHeight);
  const plan = qltdWeb07ChooseGanttCapturePlan(
    ctx.full.width,
    ctx.full.height,
    ctx.gantt.config.row_height,
    ctx.gantt.config.scale_height,
    QLTD_WEB07_GANTT_CAPTURE_LIMITS,
    qltdWeb07GetGanttRowBoundaries(ctx.container)
  );
  const images = [];

  for (const slice of plan.slices) {
    const frame = qltdWeb07CreateGanttCaptureFrame(ctx, slice);
    let canvas = null;
    try {
      await qltdWeb07NextFrame();
      canvas = await htmlToImage.toCanvas(frame, {
        width: plan.width,
        height: slice.height,
        cacheBust: true,
        pixelRatio: plan.pixelRatio,
        skipAutoScale: true,
        backgroundColor: '#ffffff',
        style: {
          position: 'static',
          left: '0',
          top: '0',
          width: `${plan.width}px`,
          height: `${slice.height}px`,
          overflow: 'hidden',
          transform: 'none',
          zoom: '1'
        }
      });

      const context = canvas.getContext('2d');
      if (context) {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
      }
      images.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: plan.width,
        height: slice.height,
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
        offset: slice.offset
      });
    } finally {
      frame.remove();
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }

  return { ...plan, images };
}

function qltdWeb07ExcelColumnName(columnNumber) {
  let value = Math.max(1, Math.floor(columnNumber));
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

async function qltdWeb07ExportGanttExcel() {
  if (!canExportExcel()) {
    alert('Bạn cần đăng nhập để xuất Excel.');
    return;
  }

  const button = document.getElementById('ganttExcelButton');
  const prevText = button ? button.textContent : '';

  if (button) {
    button.disabled = true;
    button.textContent = 'Đang xuất...';
  }

  let ctx = null;
  try {
    const ExcelJS = await qltdWeb07LoadExcelJs();
    ctx = await qltdWeb07PrepareGanttPrint();

    if (!ExcelJS || !ctx) {
      throw new Error('Chưa thể chuẩn bị Gantt để xuất Excel.');
    }

    const capture = await qltdWeb07CaptureGanttPng(ctx);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QLTD Firebase WebApp';
    workbook.created = new Date();
    workbook.modified = new Date();

    const printSheet = workbook.addWorksheet('Gantt_Print', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        verticalCentered: false,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 }
      },
      properties: { defaultRowHeight: 18 }
    });

    const maxExcelImageWidth = 2600;
    const imageScale = Math.min(1, maxExcelImageWidth / Math.max(ctx.full.width, 1));
    const imageWidth = Math.round(ctx.full.width * imageScale);
    const imageHeight = Math.round(ctx.full.height * imageScale);
    const excelRowHeightPx = 24;
    const excelColumnWidthPx = 126;
    const printColumnCount = Math.max(1, Math.ceil(imageWidth / excelColumnWidthPx));

    for (let col = 1; col <= printColumnCount; col += 1) {
      printSheet.getColumn(col).width = 18;
    }
    for (let row = 1; row <= Math.max(1, Math.ceil(imageHeight / excelRowHeightPx)); row += 1) {
      printSheet.getRow(row).height = 18;
    }
    let displayTop = 0;
    capture.images.forEach((image) => {
      const imageId = workbook.addImage({ base64: image.dataUrl, extension: 'png' });
      const displayHeight = image.height * imageScale;
      printSheet.addImage(imageId, {
        tl: { col: 0, row: displayTop / excelRowHeightPx },
        ext: { width: imageWidth, height: displayHeight },
        editAs: 'oneCell'
      });
      displayTop += displayHeight;
    });
    printSheet.pageSetup.printArea = `A1:${qltdWeb07ExcelColumnName(printColumnCount)}${Math.max(1, Math.ceil(imageHeight / excelRowHeightPx))}`;

    const dataSheet = workbook.addWorksheet('Gantt_Data', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 }
      },
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    dataSheet.columns = qltdWeb07BuildGanttDataColumns();
    dataSheet.addRows(qltdWeb07BuildGanttDataRows(ctx.gantt));
    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    dataSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9E1EA' } },
          left: { style: 'thin', color: { argb: 'FFD9E1EA' } },
          bottom: { style: 'thin', color: { argb: 'FFD9E1EA' } },
          right: { style: 'thin', color: { argb: 'FFD9E1EA' } }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const projectCode = qltdGanttPayload && (qltdGanttPayload.projectCode || qltdGanttPayload.projectName);
    const filename = `${qltdWeb07SafeFilename(projectCode)}_gantt_${toIsoDateLocal(new Date())}.xlsx`;
    qltdWeb07DownloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename
    );
  } catch (error) {
    console.error('Cannot export Gantt Excel', error);
    alert(`Không xuất được Excel: ${error.message || error}`);
  } finally {
    if (ctx) {
      try {
        await qltdWeb07RestoreGanttPrint(ctx);
      } catch (restoreError) {
        console.warn('Cannot restore Gantt after Excel export', restoreError);
      }
    }

    if (button) {
      button.disabled = false;
      button.textContent = prevText || 'Xuất Excel';
    }
  }
}

async function qltdWeb07RestoreGanttPrint(ctx) {
  if (!ctx || !ctx.gantt || !ctx.container) return;

  const { gantt, container, panel, prev } = ctx;
  document.body.classList.remove('qltd-printing');
  qltdWeb07RemoveGanttPrintRoots();
  container.classList.remove('qltd-gantt-export-mode');
  document.documentElement.style.setProperty('--qltd-web07-print-width', prev.printWidth || '');
  if (!prev.printWidth) document.documentElement.style.removeProperty('--qltd-web07-print-width');

  if (panel) {
    panel.style.width = prev.panelWidth || '';
    panel.style.maxWidth = prev.panelMaxWidth || '';
  }

  container.style.width = prev.containerWidth || '';
  container.style.height = prev.containerHeight || '';
  container.style.minWidth = prev.containerMinWidth || '';
  container.style.minHeight = prev.containerMinHeight || '';
  container.style.overflow = prev.containerOverflow || '';

  gantt.config.start_date = prev.startDate;
  gantt.config.end_date = prev.endDate;
  gantt.config.smart_rendering = prev.smartRendering;
  gantt.config.fit_tasks = prev.fitTasks;
  gantt.config.autofit = prev.autofit;
  gantt.config.autosize = prev.autosize;
  gantt.config.columns = prev.columns;
  gantt.config.grid_width = prev.gridWidth;
  gantt.config.row_height = prev.rowHeight;
  (prev.taskHeights || []).forEach((state) => {
    const task = typeof gantt.getTask === 'function' ? gantt.getTask(state.id) : null;
    if (!task) return;
    if (state.hadRowHeight) task.row_height = state.rowHeight;
    else delete task.row_height;
    if (state.hadBarHeight) task.bar_height = state.barHeight;
    else delete task.bar_height;
  });
  gantt.render();
  await qltdWeb07NextFrame();

  if (typeof gantt.scrollTo === 'function' && prev.scroll) {
    gantt.scrollTo(prev.scroll.x || 0, prev.scroll.y || 0);
  }
  if (typeof gantt.setSizes === 'function') gantt.setSizes();
}



function qltdWeb07BindExcelButton() {
  const button = document.getElementById('ganttExcelButton');
  if (!button) return;

  button.onclick = qltdWeb07ExportGanttExcel;
}

function qltdBuildGanttColumns() {
  if (qltdGanttViewMode === 'budget') {
    return [
      { name: 'wbs', label: 'WBS', width: 72, align: 'left' },
      { name: 'text', label: 'Công việc', tree: true, width: 286, resize: true },
      { name: 'owner', label: 'Chủ trì', width: 112, align: 'center' },
      {
        name: 'directChiPlan',
        label: 'Trần chi phí trực tiếp',
        width: 148,
        align: 'right',
        template: (task) => formatGanttBudgetCell(task.directChiPlan, 'chi')
      },
      {
        name: 'plannedRevenue',
        label: 'Dự thu kế hoạch',
        width: 128,
        align: 'right',
        template: (task) => formatGanttBudgetCell(task.plannedRevenue, 'thu')
      },
      {
        name: 'start_plan',
        label: 'BĐ',
        width: 76,
        align: 'center',
        template: (task) => qltdWeb07FormatDdMmYy(qltdWeb07GetTaskDisplayStart(task))
      },
      {
        name: 'end_plan',
        label: 'KT',
        width: 76,
        align: 'center',
        template: (task) => qltdWeb07FormatDdMmYy(qltdWeb07GetTaskDisplayEnd(task))
      }
    ];
  }

  const columns = [
    { name: 'wbs', label: 'WBS', width: 72, align: 'left' },
    { name: 'text', label: 'Công việc', tree: true, width: 300, resize: true },
    { name: 'owner', label: 'Chủ trì', width: 120, align: 'center' },
    {
      name: 'duration',
      label: 'Số ngày',
      width: 74,
      align: 'center',
      template: (task) => escapeHtml(String(qltdWeb07GetTaskDuration(task)))
    },
    {
      name: 'start_plan',
      label: 'BĐ',
      width: 86,
      align: 'center',
      template: (task) => qltdWeb07FormatDdMmYy(qltdWeb07GetTaskDisplayStart(task))
    },
    {
      name: 'end_plan',
      label: 'KT',
      width: 86,
      align: 'center',
      template: (task) => qltdWeb07FormatDdMmYy(qltdWeb07GetTaskDisplayEnd(task))
    }
  ];
  if (qltdMainMilestoneSelectMode) {
    columns.unshift({
      name: 'mainMilestone',
      label: 'Mốc',
      width: 44,
      align: 'center',
      resize: false,
      template: (task) => {
        const selected = isMainMilestoneSelectedTask(task);
        const canEditMilestone = canSelectMainMilestone();
        const title = canEditMilestone
          ? (selected ? 'Bỏ chọn mốc chính' : 'Chọn mốc chính')
          : 'Mốc chính do PMO thiết lập';
        return `<span class="main-milestone-cell ${selected ? 'is-selected' : ''} ${canEditMilestone ? '' : 'is-readonly'}" title="${escapeHtml(title)}">${selected ? '&#9733;' : '&#9734;'}</span>`;
      }
    });
  }
  return columns;
}

async function initDhtmlxGantt(tasks, links) {
  const container = document.getElementById('web07GanttContainer');
  if (!container) return;

  qltdWeb07EnsureGanttPolishStyles();
  qltdWeb07DecorateGanttToolbar();
  qltdWeb07BindExcelButton();
  const renderSeq = ++qltdDhtmlxGanttRenderSeq;

  const renderTasks = tasks.map(qltdPrepareDhtmlxTask);

  const ganttInstance = await ensureDhtmlxGanttLoaded();

  if (!qltdWeb07OwnsGanttRender(renderSeq, container)) {
    return;
  }

  if (!renderTasks.length || !ganttInstance) {
    const depthFilter = document.getElementById('ganttDepthFilter')?.value || 'all';
    renderGanttFallback(
      container,
      tasks,
      !ganttInstance
        ? 'DHTMLX chưa load được, đang hiển thị bảng fallback.'
        : (depthFilter === 'main-milestones'
          ? 'Không có mốc chính phù hợp với bộ lọc hiện tại.'
          : 'Chưa có công việc đủ ngày bắt đầu/kết thúc.')
    );
    return;
  }

  const canRenderGantt = await qltdWeb07WaitForRenderableGanttContainer(container);
  if (!qltdWeb07OwnsGanttRender(renderSeq, container)) {
    return;
  }
  if (!canRenderGantt) {
    renderGanttFallback(container, tasks, 'Khung Gantt chưa có chiều cao hợp lệ, đang hiển thị bảng fallback.');
    return;
  }

  const gantt = ganttInstance;

  try {
    gantt.plugins({ tooltip: true });
  } catch (error) {
    console.warn('WEB07F: tooltip plugin ignored', error);
  }

  gantt.config.readonly = true;
  gantt.config.drag_move = false;
  gantt.config.drag_resize = false;
  gantt.config.drag_progress = false;
  gantt.config.drag_links = false;
  gantt.config.details_on_dblclick = false;
  gantt.config.open_tree_initially = true;
  gantt.config.show_links = qltdGanttShowLinks;
  gantt.config.grid_resize = true;
  gantt.config.grid_width = qltdGanttViewMode === 'budget' ? 898 : (qltdMainMilestoneSelectMode ? 596 : 552);
  gantt.config.row_height = 32;
  gantt.config.bar_height = 16;
  gantt.config.fit_tasks = true;
  gantt.config.show_errors = false;
  gantt.config.show_unscheduled = true;
  gantt.config.date_format = '%Y-%m-%d';

  gantt.config.columns = qltdBuildGanttColumns();

  setGanttZoom(gantt, qltdGanttZoom);

  gantt.templates.tooltip_text = function(start, end, task) {
    return `
      <strong>${escapeHtml(task.text || '')}</strong><br>
      WBS: ${escapeHtml(task.wbs || task.id || '')}<br>
      Mã công việc: ${escapeHtml(task.code || '')}<br>
      Chủ trì: ${escapeHtml(task.owner || '')}<br>
      Trạng thái: ${escapeHtml(task.status || '')}<br>
      Zone: ${escapeHtml(task.ownZone || '')}<br>
      Công trình: ${escapeHtml(task.congTrinh || '')}<br>
      Hạng mục: ${escapeHtml(task.ownHangMuc || '')}<br>
      Context: ${escapeHtml(task.contextPath || '')}<br>
      Bắt đầu kế hoạch: ${escapeHtml(formatIsoDateVi(task.baselineStart || task.start_date || ''))}<br>
      Kết thúc kế hoạch: ${escapeHtml(formatIsoDateVi(task.baselineEnd || task.end_date || ''))}<br>
      Bắt đầu thực tế: ${escapeHtml(formatIsoDateVi(task.actualStart || ''))}<br>
      Hoàn thành thực tế: ${escapeHtml(formatIsoDateVi(task.actualEnd || ''))}<br>
      Công việc liên kết: ${escapeHtml(task.predecessorRaw || '')}<br>
      Ghi chú cập nhật: ${escapeHtml(task.updateNote || task.note || '')}
    `;
  };

  gantt.templates.task_text = function() {
    return '';
  };

  gantt.templates.task_class = function(start, end, task) {
    const classes = [];

    if (isMainMilestoneSelectedTask(task)) classes.push('main-milestone-row');
    if (task.type === 'milestone') classes.push('qltd-gantt-milestone');
    if (task.rowType === 'ZONE_GROUP') classes.push('qltd-zone-summary');
    if (task.rowType === 'STRUCTURAL_GROUP') classes.push('qltd-structural-summary');
    if (task.rowType === 'SCHEDULED_GROUP') classes.push('qltd-scheduled-group');

    if (['ZONE_GROUP', 'STRUCTURAL_GROUP', 'SCHEDULED_GROUP'].includes(task.rowType)) {
      return classes.join(' ');
    }

    const status = normalizeStatusForFilter(task.status);
    const scheduleState = getScheduleState(task);

    if (status === 'completed') {
      classes.push('qltd-task-done');
    } else if (scheduleState === 'overdue' || task.isOverdue) {
      classes.push('qltd-task-overdue');
    } else if (status === 'in-progress') {
      classes.push('qltd-task-active');
    } else if (status === 'not-started') {
      classes.push('qltd-task-not-started');
    } else if (status === 'paused') {
      classes.push('qltd-task-paused');
    } else {
      classes.push('qltd-task-unknown');
    }

    return classes.join(' ');
  };

  gantt.templates.link_class = function(link) {
    const relation = String(link.relation || relationFromDhtmlxType(link.type) || 'FS').toUpperCase();
    if (relation === 'SS') return 'qltd-link-ss';
    if (relation === 'FF') return 'qltd-link-ff';
    if (relation === 'SF') return 'qltd-link-sf';
    return 'qltd-link-fs';
  };

  gantt.templates.rightside_text = function(start, end, task) {
    return qltdGanttShowDates ? qltdWeb07FormatDdMm(task.end_date || end) : '';
  };

  gantt.templates.leftside_text = function(start, end, task) {
    return qltdGanttShowDates ? qltdWeb07FormatDdMm(task.start_date || start) : '';
  };

  bindMainMilestoneGanttEvents(gantt);

  try {
    const hasGanttDom = !!container.querySelector('.gantt_container');
    if (!qltdDhtmlxGanttInitialized || !hasGanttDom) {
      container.innerHTML = '';
      gantt.init(container);
      qltdDhtmlxGanttInitialized = true;
    }
  } catch (error) {
    console.warn('WEB07F: gantt.init retry', error);
    try {
      container.innerHTML = '';
      gantt.init(container);
      qltdDhtmlxGanttInitialized = true;
    } catch (retryError) {
      console.error('WEB07F: gantt.init failed', retryError);
      renderGanttFallback(container, tasks, 'DHTMLX gặp lỗi khi khởi tạo, đang hiển thị bảng fallback.');
      return;
    }
  }

  try {
    gantt.clearAll();
  } catch (error) {
    console.warn('WEB07F: ignored gantt.clearAll before parse', error);
    try {
      container.innerHTML = '';
      gantt.init(container);
      qltdDhtmlxGanttInitialized = true;
    } catch (retryError) {
      console.error('WEB07F: gantt re-init failed after clearAll error', retryError);
      renderGanttFallback(container, tasks, 'DHTMLX gặp lỗi khi làm mới dữ liệu, đang hiển thị bảng fallback.');
      return;
    }
  }

  try {
    gantt.parse({ data: renderTasks, links: links || [] });
  } catch (error) {
    console.error('WEB07F: gantt.parse failed', error);
    renderGanttFallback(container, tasks, 'DHTMLX gặp lỗi khi đọc dữ liệu, đang hiển thị bảng fallback.');
    return;
  }

  requestAnimationFrame(() => {
    if (!qltdWeb07OwnsGanttRender(renderSeq, container)) return;
    try {
      if (gantt.setSizes) gantt.setSizes();
      if (gantt.render) gantt.render();
    } catch (error) {
      console.warn('WEB07F: gantt final render ignored', error);
    }
  });
}

function qltdWeb07OwnsGanttRender(renderSeq, container) {
  return renderSeq === qltdDhtmlxGanttRenderSeq &&
    document.getElementById('web07GanttContainer') === container;
}

function bindMainMilestoneGanttEvents(gantt) {
  if (!gantt || typeof gantt.attachEvent !== 'function') return;

  if (qltdMainMilestoneGanttClickEventId && typeof gantt.detachEvent === 'function') {
    try {
      gantt.detachEvent(qltdMainMilestoneGanttClickEventId);
    } catch (error) {
      console.warn('Cannot detach previous main milestone event', error);
    }
  }

  qltdMainMilestoneGanttClickEventId = gantt.attachEvent('onTaskClick', (taskId, event) => {
    const target = event && event.target;
    const star = target && typeof target.closest === 'function'
      ? target.closest('.main-milestone-cell')
      : null;

    if (!star) return true;
    if (!canSelectMainMilestone()) return false;

    toggleMainMilestone(taskId);
    return false;
  });
}

function getDhtmlxGanttInstance() {
  return window.gantt || (window.dhtmlxgantt && window.dhtmlxgantt.gantt) || null;
}

function ensureDhtmlxGanttLoaded() {
  const current = getDhtmlxGanttInstance();
  if (current) return Promise.resolve(current);
  if (qltdDhtmlxLoadPromise) return qltdDhtmlxLoadPromise;

  qltdDhtmlxLoadPromise = new Promise((resolve) => {
    const appendScript = () => {
      const script = document.createElement('script');
      script.src = 'https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.js';
      script.onload = () => resolve(getDhtmlxGanttInstance());
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    };
    const existing = Array.from(document.scripts).some((script) => script.src.includes('dhtmlxgantt.js'));
    if (!existing) {
      appendScript();
      return;
    }
    setTimeout(() => {
      const loaded = getDhtmlxGanttInstance();
      if (loaded) {
        resolve(loaded);
      } else {
        appendScript();
      }
    }, 500);
  });

  return qltdDhtmlxLoadPromise;
}

function setGanttZoom(gantt, zoom) {
  if (zoom === 'day') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [{ unit: 'day', step: 1, format: '%d/%m' }];
    return;
  }
  if (zoom === 'week') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [
      { unit: 'month', step: 1, format: '%m/%Y' },
      {
        unit: 'week',
        step: 1,
        format: function(date) {
          const week = gantt.date && typeof gantt.date.getWeek === 'function' ? gantt.date.getWeek(date) : 0;
          return String(week).padStart(2, '0');
        }
      }
    ];
    return;
  }
  if (zoom === 'quarter') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [
      { unit: 'year', step: 1, format: '%Y' },
      {
        unit: 'month',
        step: 3,
        format: function(date) {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          return `Quý ${quarter}`;
        }
      }
    ];
    return;
  }
  if (zoom === 'year') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [{ unit: 'year', step: 1, format: '%Y' }];
    return;
  }
  gantt.config.scale_height = 54;
  gantt.config.scales = [
    { unit: 'year', step: 1, format: '%Y' },
    { unit: 'month', step: 1, format: '%m' }
  ];
}

function renderGanttFallback(container, tasks, message) {
  container.classList.add('is-fallback');
  container.innerHTML = `
    <div class="web07-card">
      <p class="web07-muted">${escapeHtml(message)}</p>
      <div class="web07-fallback-table-wrap">
        <table class="web07-table">
          <thead>
            <tr>
              <th>WBS</th>
              <th>Công việc</th>
              <th>Chủ trì</th>
              <th>Trạng thái</th>
              <th>BĐ</th>
              <th>KT</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map((task) => `
              <tr>
                <td>${escapeHtml(task.wbs || task.id || '')}</td>
                <td>${escapeHtml(task.text || '')}</td>
                <td>${escapeHtml(task.owner || '')}</td>
                <td>${escapeHtml(task.status || '')}</td>
                <td>${escapeHtml(formatIsoDateVi(task.start_date || ''))}</td>
                <td>${escapeHtml(formatIsoDateVi(task.end_date || ''))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function focusGanttTask(taskId) {
  const gantt = getDhtmlxGanttInstance();
  if (!taskId || !gantt) return;
  try {
    if (!gantt.isTaskExists(taskId)) return;
    gantt.selectTask(taskId);
    gantt.showTask(taskId);
  } catch (error) {
    console.warn('Cannot focus gantt task', error);
  }
}

function normalizeMainMilestoneProjectKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const exact = qltdProjectRegistry.find((project) => String(project.projectCode || '').trim() === raw);
  if (exact && exact.projectCode) return String(exact.projectCode).trim();

  const displayMatch = raw.match(/^(.+?)\s+-\s+.+$/);
  const displayCode = displayMatch ? displayMatch[1].trim() : '';
  if (displayCode) {
    const registryMatch = qltdProjectRegistry.find((project) => String(project.projectCode || '').trim() === displayCode);
    if (registryMatch && registryMatch.projectCode) return String(registryMatch.projectCode).trim();
    return displayCode;
  }

  return raw;
}

function getMainMilestoneProjectKey(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const candidates = [
    projectCode,
    payload && payload.projectCode,
    getStoredProjectCode()
  ];

  for (const candidate of candidates) {
    const key = normalizeMainMilestoneProjectKey(candidate);
    if (key) return key;
  }

  return '';
}

function getMainMilestoneProjectKeyAliases(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const candidates = [
    getMainMilestoneProjectKey(projectCode, payload),
    projectCode,
    payload && payload.projectCode,
    payload && payload.projectName,
    payload && payload.projectCode && payload.projectName ? `${payload.projectCode} - ${payload.projectName}` : '',
    getStoredProjectCode()
  ];

  const aliases = [];
  candidates.forEach((candidate) => {
    const raw = String(candidate || '').trim();
    if (raw && !aliases.includes(raw)) aliases.push(raw);

    const normalized = normalizeMainMilestoneProjectKey(raw);
    if (normalized && !aliases.includes(normalized)) aliases.push(normalized);
  });

  return aliases;
}

function getMainMilestoneStorageKey(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  return `qltd.mainMilestones.${projectKey || 'unknown'}`;
}

function getMainMilestoneDocRef(projectKey = qltdCurrentMainMilestoneProjectKey || getMainMilestoneProjectKey()) {
  if (!db || !projectKey) return null;
  return doc(db, 'qltdMainMilestones', String(projectKey));
}

function readCachedMainMilestones(projectCode, payload = qltdGanttPayload) {
  try {
    const raw = localStorage.getItem(getMainMilestoneStorageKey(projectCode, payload));
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) return parsed.map(String);
    return [
      ...(Array.isArray(parsed.keys) ? parsed.keys : []),
      ...(Array.isArray(parsed.orphanKeys) ? parsed.orphanKeys : [])
    ].map(String);
  } catch (error) {
    console.warn('Cannot read cached main milestone keys', error);
    return [];
  }
}

function cacheMainMilestonesForProject(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  try {
    localStorage.setItem(getMainMilestoneStorageKey(projectCode, payload), JSON.stringify({
      version: 2,
      projectCode: getMainMilestoneProjectKey(projectCode, payload),
      keys: Array.from(qltdMainMilestoneKeys),
      orphanKeys: Array.from(qltdMainMilestoneOrphanKeys),
      migration: {
        rawCount: qltdMainMilestoneMigration.rawCount,
        migratedCount: qltdMainMilestoneMigration.migratedCount,
        ambiguousCount: qltdMainMilestoneMigration.ambiguousCount
      }
    }));
  } catch (error) {
    console.warn('Cannot cache main milestone keys', error);
  }
}

function getMainMilestonesFromApiPayload(payload) {
  if (!payload) return [];
  const directValues = [
    ...(Array.isArray(payload.keys) ? payload.keys : []),
    ...(Array.isArray(payload.orphanKeys) ? payload.orphanKeys : []),
    ...(Array.isArray(payload.ids) ? payload.ids : []),
    ...(Array.isArray(payload.codes) ? payload.codes : []),
    ...(Array.isArray(payload.mainMilestoneIds) ? payload.mainMilestoneIds : []),
    ...(Array.isArray(payload.mainMilestoneCodes) ? payload.mainMilestoneCodes : []),
    ...(Array.isArray(payload.mainMilestones) ? payload.mainMilestones : []),
    ...(Array.isArray(payload.items) ? payload.items.flatMap((item) => [item && item.id, item && item.code]) : [])
  ];
  const taskValues = (Array.isArray(payload.data) ? payload.data : []).flatMap((task) => {
    const raw = task.raw || {};
    const marker = task.mainMilestone ?? task.isMainMilestone ?? raw.Moc_chinh ?? raw['Mốc chính'];
    const normalized = normalizeSearchText(marker).replace(/[^a-z0-9]/g, '');
    if (!['1', 'true', 'yes', 'x', 'co', 'mocchinh'].includes(normalized)) return [];
    return [task.id, task.code].filter(Boolean);
  });
  return [...directValues, ...taskValues].map(String).filter(Boolean);
}

function applyMainMilestoneMigration(values, tasks, projectKey, source) {
  const migration = migrateMainMilestoneKeys(values, tasks, projectKey);
  const nonRenderableGroupWarnings = (tasks || []).filter((task) =>
    ['ZONE_GROUP', 'STRUCTURAL_GROUP'].includes(task.rowType) &&
    migration.keys.has(getMainMilestoneStableKey(task, projectKey))
  ).map((task) => ({
    code: 'MAIN_MILESTONE_NON_RENDERABLE_GROUP_KEY',
    rawKey: getMainMilestoneStableKey(task, projectKey),
    rowType: task.rowType
  }));
  qltdMainMilestoneKeys = migration.keys;
  qltdMainMilestoneOrphanKeys = migration.orphanKeys;
  qltdMainMilestoneMigration = {
    rawCount: migration.rawCount,
    validCount: migration.validCount,
    migratedCount: migration.migratedCount,
    orphanCount: migration.orphanCount,
    ambiguousCount: migration.ambiguousCount,
    warnings: [...migration.warnings, ...nonRenderableGroupWarnings]
  };
  console.log('[mainMilestone] migration', {
    source,
    projectCode: projectKey,
    raw: migration.rawCount,
    valid: migration.validCount,
    migrated: migration.migratedCount,
    orphan: migration.orphanCount,
    ambiguous: migration.ambiguousCount
  });
  migration.warnings.forEach((warning) => console.warn('[mainMilestone]', warning.code, warning.rawKey));
  if (nonRenderableGroupWarnings.length) {
    console.warn('[mainMilestone] MAIN_MILESTONE_NON_RENDERABLE_GROUP_KEY', {
      count: nonRenderableGroupWarnings.length,
      keys: nonRenderableGroupWarnings.map((warning) => warning.rawKey)
    });
  }
  return migration;
}

function hasMainMilestoneApiSource(payload) {
  if (!payload) return false;
  const source = String(payload.mainMilestoneSource || '').toUpperCase();
  return source === 'APPS_SCRIPT' || source === 'GOOGLE_SHEET' ||
    Object.prototype.hasOwnProperty.call(payload, 'mainMilestoneIds') ||
    Object.prototype.hasOwnProperty.call(payload, 'mainMilestoneCodes') ||
    Object.prototype.hasOwnProperty.call(payload, 'mainMilestones');
}

function isCurrentMainMilestoneLoad(requestSeq, projectKey) {
  return requestSeq === qltdMainMilestoneLoadRequestSeq &&
    projectKey === qltdCurrentMainMilestoneProjectKey;
}

async function loadMainMilestonesForProject(projectCode, payload = qltdGanttPayload) {
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  const aliases = getMainMilestoneProjectKeyAliases(projectCode, payload);
  const requestSeq = ++qltdMainMilestoneLoadRequestSeq;
  const projectChanged = projectKey !== qltdCurrentMainMilestoneProjectKey;
  qltdCurrentMainMilestoneProjectKey = projectKey;
  const payloadKeys = getMainMilestonesFromApiPayload(payload);
  const cachedKeys = readCachedMainMilestones(projectKey, payload);
  const seedKeys = payloadKeys.length ? payloadKeys : cachedKeys;
  if (projectChanged || seedKeys.length || (!qltdMainMilestoneKeys.size && !qltdMainMilestoneOrphanKeys.size)) {
    applyMainMilestoneMigration(
      seedKeys,
      payload && payload.data,
      projectKey,
      payloadKeys.length ? 'GANTT_PAYLOAD' : 'LOCAL_STORAGE'
    );
  }

  try {
    const response = await fetchBackendJson('getMainMilestones', {
      projectCode: projectKey,
      email: currentUserProfile && currentUserProfile.email || ''
    });
    if (!isCurrentMainMilestoneLoad(requestSeq, projectKey)) return;
    if (response && response.success !== false) {
      const backendKeys = getMainMilestonesFromApiPayload(response);
      const migration = applyMainMilestoneMigration(
        backendKeys,
        payload && payload.data,
        projectKey,
        'APPS_SCRIPT_API'
      );
      cacheMainMilestonesForProject(projectKey, payload);
      if (migration.migratedCount > 0 && canSelectMainMilestone()) {
        await saveMainMilestonesForProject(projectKey, payload, { silent: true, migrated: true });
      }
      return;
    }
    console.warn('Apps Script main milestone API rejected read; trying compatibility source', response);
  } catch (error) {
    console.warn('Apps Script main milestone API unavailable; trying compatibility source', error);
  }

  if (hasMainMilestoneApiSource(payload)) {
    if (!isCurrentMainMilestoneLoad(requestSeq, projectKey)) return;
    const migration = applyMainMilestoneMigration(
      payloadKeys,
      payload && payload.data,
      projectKey,
      'GANTT_PAYLOAD'
    );
    cacheMainMilestonesForProject(projectKey, payload);
    if (migration.migratedCount > 0 && canSelectMainMilestone()) {
      await saveMainMilestonesForProject(projectKey, payload, { silent: true, migrated: true });
    }
    return;
  }

  if (!db || !aliases.length) return;

  try {
    let matchedSnapshot = null;
    let matchedKey = '';

    for (const alias of aliases) {
      const snapshot = await getDoc(getMainMilestoneDocRef(alias));
      if (!isCurrentMainMilestoneLoad(requestSeq, projectKey)) return;
      if (snapshot.exists()) {
        matchedSnapshot = snapshot;
        matchedKey = alias;
        break;
      }
    }

    if (!matchedSnapshot) {
      console.log('[mainMilestone] compatibility source has no snapshot; retaining current project state', projectKey);
      return;
    }

    const data = matchedSnapshot.data() || {};
    const keys = Array.isArray(data.keys) ? data.keys : [];
    const orphanKeys = Array.isArray(data.orphanKeys) ? data.orphanKeys : [];
    const ids = Array.isArray(data.milestoneIds) ? data.milestoneIds : [];
    const codes = Array.isArray(data.milestoneCodes) ? data.milestoneCodes : [];
    const migration = applyMainMilestoneMigration(
      [...keys, ...orphanKeys, ...ids, ...codes],
      payload && payload.data,
      projectKey,
      'FIRESTORE'
    );
    cacheMainMilestonesForProject(projectKey, payload);
    console.log('[mainMilestone] projectKey', projectKey);
    if (matchedKey && matchedKey !== projectKey) console.log('[mainMilestone] matched legacy key', matchedKey);
    console.log('[mainMilestone] role/canSelect', currentUserProfile && currentUserProfile.role, canSelectMainMilestone());
    if (migration.migratedCount > 0 && canSelectMainMilestone()) {
      await saveMainMilestonesForProject(projectKey, payload, { silent: true, migrated: true });
    }
  } catch (error) {
    console.warn('Cannot load global main milestone keys; using local cache', error);
  }
}

async function saveMainMilestonesForProject(
  projectCode = getStoredProjectCode(),
  payload = qltdGanttPayload,
  options = {}
) {
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  if (!projectKey) return false;
  const ids = Array.from(qltdMainMilestoneKeys);
  const codes = Array.from(qltdMainMilestoneOrphanKeys);
  if (!ids.length && !codes.length) {
    if (!options.silent) alert('Không thể lưu danh sách mốc rỗng. Hãy dùng Reset mốc và xác nhận.');
    return false;
  }
  qltdCurrentMainMilestoneProjectKey = projectKey;
  cacheMainMilestonesForProject(projectKey, payload);

  try {
    const response = await fetchBackendJson('saveMainMilestones', {
      projectCode: projectKey,
      ids: JSON.stringify(ids),
      codes: JSON.stringify(codes),
      email: currentUserProfile && currentUserProfile.email || ''
    });
    if (response && response.success !== false) {
      console.log('[mainMilestone] saved stable keys to Apps Script API', {
        valid: qltdMainMilestoneKeys.size,
        orphan: qltdMainMilestoneOrphanKeys.size,
        migrated: Boolean(options.migrated)
      });
      return true;
    }
    console.error('Apps Script rejected main milestone save', response);
    if (!options.silent) {
      alert('Không lưu được mốc chính: ' + String(response && (response.message || response.error) || 'API_ERROR'));
    }
    return false;
  } catch (error) {
    console.warn('Apps Script main milestone save unavailable; trying Firestore compatibility source', error);
  }

  const ref = getMainMilestoneDocRef(projectKey);
  if (!ref) return false;

  try {
    const firestoreData = {
      projectCode: String(projectKey || ''),
      keys: ids,
      orphanKeys: codes,
      milestoneIds: ids,
      milestoneCodes: codes,
      updatedBy: currentUserProfile && currentUserProfile.email || '',
      updatedAt: serverTimestamp()
    };
    if (options.migrated) firestoreData.migratedAt = serverTimestamp();
    await setDoc(ref, firestoreData, { merge: true });
    return true;
  } catch (error) {
    console.error('Cannot save global main milestone ids', error);
    if (!options.silent) {
      alert('Không lưu được mốc chính dùng chung. Vui lòng kiểm tra quyền Firebase/Firestore.');
    }
    return false;
  }
}

async function resetMainMilestonesForProject(
  projectCode = getStoredProjectCode(),
  payload = qltdGanttPayload,
  options = {}
) {
  if (!options.confirmed) return false;
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  if (!projectKey) return false;

  try {
    const response = await fetchBackendJson('resetMainMilestones', {
      projectCode: projectKey,
      email: currentUserProfile && currentUserProfile.email || '',
      confirmed: '1'
    });
    if (response && response.success !== false) {
      if (qltdCurrentMainMilestoneProjectKey !== projectKey) return true;
      qltdMainMilestoneLoadRequestSeq += 1;
      qltdCurrentMainMilestoneProjectKey = projectKey;
      qltdMainMilestoneKeys = new Set();
      qltdMainMilestoneOrphanKeys = new Set();
      qltdMainMilestoneMigration = {
        rawCount: 0,
        validCount: 0,
        migratedCount: 0,
        orphanCount: 0,
        ambiguousCount: 0,
        warnings: []
      };
      cacheMainMilestonesForProject(projectKey, payload);
      console.log('[mainMilestone] reset through Apps Script API', projectKey);
      return true;
    }
    console.error('Apps Script rejected main milestone reset', response);
    alert('Không reset được mốc chính: ' + String(response && (response.message || response.error) || 'API_ERROR'));
    return false;
  } catch (error) {
    console.error('Apps Script main milestone reset unavailable; current selection retained', error);
    alert('Không reset được mốc chính dùng chung.');
    return false;
  }
}

function isMainMilestoneTask(taskId) {
  const task = (qltdGanttPayload && qltdGanttPayload.data || []).find((item) => String(item.id) === String(taskId));
  return task ? isMainMilestoneSelectedTask(task) : false;
}

function isMainMilestoneSelectedTask(task) {
  return isMainMilestoneKeySelected(
    qltdMainMilestoneKeys,
    task,
    qltdCurrentMainMilestoneProjectKey
  );
}

function getMainMilestoneBadgeText() {
  const valid = qltdMainMilestoneKeys.size;
  const orphan = qltdMainMilestoneOrphanKeys.size;
  return orphan ? `Mốc hợp lệ: ${valid} · Chưa khớp: ${orphan}` : `Mốc hợp lệ: ${valid}`;
}

function getMainMilestoneBadgeTitle() {
  const valid = qltdMainMilestoneKeys.size;
  const orphan = qltdMainMilestoneOrphanKeys.size;
  return `Đã lưu: ${valid + orphan}\nHợp lệ: ${valid}\nChưa khớp dữ liệu hiện tại: ${orphan}`;
}

function updateMainMilestoneToolbarState() {
  const badge = document.getElementById('ganttMilestoneBadge');
  if (badge) {
    badge.textContent = getMainMilestoneBadgeText();
    badge.title = getMainMilestoneBadgeTitle();
  }

  const button = document.getElementById('ganttMilestoneModeButton');
  if (button) {
    const label = button.dataset.label || (canSelectMainMilestone() ? 'Chọn mốc chính' : 'Hiện sao mốc chính');
    button.textContent = `${label}${qltdMainMilestoneKeys.size ? ` (${qltdMainMilestoneKeys.size})` : ''}`;
  }
}

async function toggleMainMilestone(taskId) {
  if (!canSelectMainMilestone()) return;

  const gantt = getDhtmlxGanttInstance();
  const scroll = getGanttScrollState();
  let task = null;

  try {
    task = gantt && typeof gantt.getTask === 'function' ? gantt.getTask(taskId) : null;
  } catch (error) {
    task = null;
  }

  const sourceTask = task || (qltdGanttPayload && qltdGanttPayload.data || [])
    .find((item) => String(item.id) === String(taskId)) || { id: taskId };
  const stableKey = getMainMilestoneStableKey(
    sourceTask,
    qltdCurrentMainMilestoneProjectKey
  );
  if (!stableKey) {
    alert('Công việc chưa có UID ổn định nên chưa thể chọn làm mốc chính.');
    return;
  }
  const projectKey = qltdCurrentMainMilestoneProjectKey;
  const selectedKeys = qltdMainMilestoneKeys;
  const wasSelected = selectedKeys.has(stableKey);
  toggleMainMilestoneTaskKey(
    selectedKeys,
    sourceTask,
    projectKey
  );
  if (wasSelected && !selectedKeys.size && !qltdMainMilestoneOrphanKeys.size) {
    selectedKeys.add(stableKey);
    alert('Để xóa mốc cuối cùng, hãy dùng Reset mốc và xác nhận.');
    return;
  }
  qltdMainMilestoneMigration.validCount = selectedKeys.size;

  const saved = await saveMainMilestonesForProject(qltdGanttPayload && qltdGanttPayload.projectCode);
  if (!saved) {
    if (wasSelected) selectedKeys.add(stableKey);
    else selectedKeys.delete(stableKey);
    if (qltdMainMilestoneKeys === selectedKeys) {
      qltdMainMilestoneMigration.validCount = selectedKeys.size;
    }
    return;
  }
  if (qltdCurrentMainMilestoneProjectKey !== projectKey || qltdMainMilestoneKeys !== selectedKeys) return;
  updateMainMilestoneToolbarState();
  renderDashboardFromGanttData(qltdGanttPayload);

  const depthFilter = document.getElementById('ganttDepthFilter')?.value || 'all';
  if (depthFilter === 'main-milestones') {
    applyGanttFilters();
    restoreGanttScrollState(scroll);
    return;
  }

  if (gantt && task) {
    try {
      if (typeof gantt.refreshTask === 'function') {
        gantt.refreshTask(task.id);
      } else if (typeof gantt.refreshData === 'function') {
        gantt.refreshData();
      } else if (typeof gantt.render === 'function') {
        gantt.render();
      }
    } catch (error) {
      console.warn('Cannot refresh main milestone star', error);
    }
  }

  restoreGanttScrollState(scroll);
}


function getUniqueTaskValues(tasks, key) {
  return Array.from(new Set((tasks || []).map((task) => String(task[key] || '').trim()).filter(Boolean))).sort();
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function normalizeStatusKey(status) {
  const normalized = normalizeSearchText(status).replace(/[^a-z0-9]/g, '');
  if (normalized.includes('hoanthanh') || normalized.includes('done') || normalized.includes('complete')) return 'hoan-thanh';
  if (normalized.includes('tamdung') || normalized.includes('paused')) return 'tam-dung';
  if (normalized.includes('quahan') || normalized.includes('overdue')) return 'qua-han';
  if (normalized.includes('dang') || normalized.includes('progress')) return 'dang-lam';
  return 'chua-bat-dau';
}

function normalizeStatusForFilter(status) {
  const normalized = normalizeSearchText(status).replace(/[^a-z0-9]/g, '');
  if (normalized.includes('hoanthanh') || normalized.includes('done') || normalized.includes('complete')) return 'completed';
  if (normalized.includes('tamdung') || normalized.includes('paused')) return 'paused';
  if (normalized.includes('dang') || normalized.includes('progress')) return 'in-progress';
  if (normalized.includes('chuabatdau') || normalized.includes('notstarted')) return 'not-started';
  if (normalized.includes('chuaro') || normalized.includes('khongxacdinh') || normalized.includes('unknown')) return 'unknown';
  return normalized ? 'unknown' : 'unknown';
}

function getScheduleState(task) {
  const status = normalizeStatusForFilter(task.status);
  const deadline = parseIsoDate(task.end_date || task.deadline);
  const actualFinish = parseIsoDate(task.actualFinish || task.actualEnd);
  const today = parseIsoDate(toIsoDateLocal(new Date()));

  if (!deadline && status !== 'completed') return 'unknown';
  if (status === 'completed') {
    if (actualFinish && deadline && actualFinish > deadline) return 'completed-late';
    return 'completed-on-time';
  }
  if (status === 'paused') {
    return deadline && deadline < today ? 'paused-overdue' : 'paused-on-time';
  }
  if (deadline && deadline < today) return 'overdue';
  if (status === 'in-progress') return 'in-progress-on-time';
  if (status === 'not-started') return 'not-started-on-time';
  return 'unknown';
}

function parseIsoDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(`${text.slice(0, 10)}T00:00:00`);
  return isNaN(date.getTime()) ? null : date;
}

function relationFromDhtmlxType(type) {
  const map = { 0: 'FS', 1: 'SS', 2: 'FF', 3: 'SF' };
  return map[String(type)] || 'FS';
}

function formatDateObjectViShort(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

async function loadDeptPlansForSelectedProject(projectCode) {
  if (!projectCode) return;
  const requestSeq = ++qltdDeptPlanRequestSeq;
  resetDeptScopedClientState();

  ensureDeptSelector();
  ensureDeptPlanPanel();

  const status = document.getElementById('deptPlanStatus');
  const content = document.getElementById('deptPlanContent');
  const deptSelector = document.getElementById('deptSelector');

  if (status) status.textContent = '\u0110ang t\u1ea3i...';
  if (content) content.innerHTML = '<p class="empty-state">\u0110ang t\u1ea3i d\u1eef li\u1ec7u ph\u00f2ng/ban...</p>';
  if (deptSelector) deptSelector.disabled = true;

  try {
    const payload = await fetchBackendJson('listDeptPlans', { projectCode }, { auth: true });
    if (requestSeq !== qltdDeptPlanRequestSeq) return;
    renderDeptPlans(payload);
  } catch (error) {
    if (requestSeq !== qltdDeptPlanRequestSeq) return;
    console.error('Cannot load department plan', error);
    renderDeptPlans({ success: false });
  }
}
async function fetchBackendJson(action, params = {}, options = {}) {
  const startedAt = performance.now();
  let forceRefresh = false;
  const includeAuth = options.auth !== false && action !== 'health';

  while (true) {
    const url = new URL(APPS_SCRIPT_DEV_URL);
    url.searchParams.set('action', action);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
    if (qltdDevPerfEnabled()) url.searchParams.set('debugPerf', '1');

    if (includeAuth && auth && auth.currentUser) {
      url.searchParams.set('email', auth.currentUser.email || url.searchParams.get('email') || '');
      url.searchParams.set('idToken', await auth.currentUser.getIdToken(forceRefresh));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: options.signal
    });

    if (!response.ok) {
      throw new Error(`Apps Script API ${action} failed: ${response.status}`);
    }

    const payload = await response.json();
    const message = String(payload?.errorCode || payload?.message || '').trim().toUpperCase();
    if (includeAuth && forceRefresh === false && (message === 'ID_TOKEN_INVALID' || message === 'ID_TOKEN_EXPIRED')) {
      forceRefresh = true;
      continue;
    }

    qltdLogBackendPerformance(action, performance.now() - startedAt, payload);
    return payload;
  }
}

async function fetchBackendProfile() {
  return fetchBackendJson('profile');
}

function scheduleNotificationsLoad() {
  const run = () => {
    if (auth?.currentUser && isAuthenticatedUser()) void loadNotifications();
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    window.setTimeout(run, 1200);
  }
}

function renderApp(user, role, profile = {}) {
  registrationGate?.hide();
  showOnly(els.appShell);
  const effectiveProfile = {
    ...profile,
    email: profile.email || (user && user.email),
    role: profile.role || role || ''
  };
  const displayRole = formatRole(effectiveProfile.role);
  applyPermissions(effectiveProfile);
  ensureWeb07Panels();
  bindWeb07Navigation();
  showWeb07View('dashboard');
  qltdProjectsLoadPromise = loadProjectsForSelector();
  scheduleNotificationsLoad();

  if (els.userAvatar) {
    els.userAvatar.src = user.photoURL || '';
    els.userAvatar.classList.toggle('empty', !user.photoURL);
  }

  if (els.userName) els.userName.textContent = user.displayName || 'Ng\u01b0\u1eddi d\u00f9ng QLTD';
  if (els.userEmail) els.userEmail.textContent = user.email || '';
  if (els.userRole) els.userRole.textContent = displayRole;
  if (els.accessStatus) els.accessStatus.textContent = '\u0110\u00e3 x\u00e1c th\u1ef1c Google';
  if (els.roleStatus) els.roleStatus.textContent = displayRole;
  setApiStatus(profile.apiStatus === 'CONNECTED' ? '\u0110\u00e3 k\u1ebft n\u1ed1i API' : 'Kh\u00f4ng k\u1ebft n\u1ed1i \u0111\u01b0\u1ee3c API');
}

function getProfileErrorCode(payload) {
  return String(payload?.errorCode || payload?.message || '').trim().toUpperCase();
}

function isValidAppProfile(profile) {
  return !!profile &&
    profile.success === true &&
    String(profile.status || '').trim().toUpperCase() === 'ACTIVE' &&
    ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'].includes(normalizeRoleKey(profile.role));
}

async function bootstrapAuthenticatedUser(user) {
  const requestSeq = ++authBootstrapRequestSeq;
  lastAuthenticatedUser = user;
  showOnly(els.loginView);
  setStatus('Đang kiểm tra hồ sơ người dùng...', 'info');

  try {
    const profile = await fetchBackendProfile();
    if (requestSeq !== authBootstrapRequestSeq) return;

    if (!profile.success) {
      const code = getProfileErrorCode(profile);
      if (code === 'USER_NOT_FOUND' || profile.requiresRegistration === true) {
        registrationGate?.show(user);
        return;
      }
      if (code === 'USER_INACTIVE') {
        renderDenied(user, 'Tài khoản đang bị khóa. Vui lòng liên hệ quản trị.');
        return;
      }
      if (code === 'INVALID_ROLE') {
        renderDenied(user, 'Vai trò tài khoản không hợp lệ. Vui lòng liên hệ quản trị.');
        return;
      }
      renderApiError(user, new Error(profile.errorMessage || profile.message || 'Không tải được hồ sơ người dùng.'));
      return;
    }

    if (!isValidAppProfile(profile)) {
      renderDenied(user, 'Hồ sơ người dùng chưa ACTIVE hoặc vai trò không hợp lệ.');
      return;
    }
    renderApp(user, profile.role, profile);
  } catch (error) {
    if (requestSeq === authBootstrapRequestSeq) renderApiError(user, error);
  }
}

async function resumeAuthenticatedAppAfterRegistration() {
  const user = auth?.currentUser;
  if (!user) throw new Error('Phiên đăng nhập không còn hiệu lực.');
  await user.getIdToken(true);
  registrationGate?.hide();
  await bootstrapAuthenticatedUser(user);
}

function renderApiError(user, error) {
  console.error('Apps Script DEV API connection failed', error);
  renderDenied(user, 'Không tải được hồ sơ người dùng. Vui lòng kiểm tra kết nối và thử lại.');
  setApiStatus('Không kết nối được API');
}

async function handleSignIn() {
  if (!auth) {
    setStatus('Ch\u01b0a c\u00f3 Firebase web config DEV.', 'warning');
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    setStatus('\u0110ang m\u1edf Google Login...', 'info');
    await signInWithPopup(auth, provider);
  } catch (error) {
    setStatus(error.message || '\u0110\u0103ng nh\u1eadp th\u1ea5t b\u1ea1i.', 'error');
  }
}

async function handleSignOut() {
  if (!auth) return;

  await signOut(auth);
  renderSignedOut();
}

function boot() {
  if (!hasFirebaseConfig(firebaseConfig)) {
    if (els.signInButton) els.signInButton.disabled = true;
    renderSignedOut();
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  registrationGate = createRegistrationGate({
    lookup: (fullName) => postBackendJson({ action: 'user_lookupemployees', fullName }),
    register: (empCode) => postBackendJson({ action: 'user_register', empCode }),
    onRegistered: resumeAuthenticatedAppAfterRegistration,
    onSignOut: handleSignOut
  });
  window.__qltdGetAuthContext = async (forceRefresh = false) => {
    const user = auth?.currentUser;
    if (!user) throw new Error('Phiên đăng nhập không còn hiệu lực.');
    return {
      email: user.email || '',
      idToken: await user.getIdToken(!!forceRefresh)
    };
  };

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      authBootstrapRequestSeq += 1;
      renderSignedOut();
      return;
    }
    await bootstrapAuthenticatedUser(user);
  });
}

if (els.signInButton) els.signInButton.addEventListener('click', handleSignIn);
if (els.signOutButton) els.signOutButton.addEventListener('click', handleSignOut);
if (els.deniedSignOutButton) els.deniedSignOutButton.addEventListener('click', handleSignOut);
if (els.retryProfileButton) els.retryProfileButton.addEventListener('click', () => {
  if (lastAuthenticatedUser) bootstrapAuthenticatedUser(lastAuthenticatedUser);
});
if (els.notificationBellButton) els.notificationBellButton.addEventListener('click', () => setNotificationPanelOpen(!qltdNotificationState.open));
if (els.notificationCloseButton) els.notificationCloseButton.addEventListener('click', () => setNotificationPanelOpen(false));
if (els.notificationBackdrop) els.notificationBackdrop.addEventListener('click', () => setNotificationPanelOpen(false));
if (els.notificationReloadButton) els.notificationReloadButton.addEventListener('click', () => loadNotifications());
if (els.userAvatar) {
  els.userAvatar.addEventListener('load', () => {
    if (els.userAvatar.getAttribute('src')) els.userAvatar.classList.remove('empty');
  });
  els.userAvatar.addEventListener('error', () => els.userAvatar.classList.add('empty'));
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && qltdNotificationState.open) setNotificationPanelOpen(false);
});
window.addEventListener('resize', () => {
  const gantt = getDhtmlxGanttInstance();
  if (qltdActiveView === 'gantt' && gantt && gantt.setSizes) gantt.setSizes();
});

boot();

export {
  ADMIN_EMAILS,
  APPS_SCRIPT_DEV_URL,
  fetchBackendProfile,
  getLocalRoleForEmail
};
