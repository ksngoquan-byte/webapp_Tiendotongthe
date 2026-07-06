import { getExecutiveTaskDueDate, isExecutiveCategoryRow, isExecutiveTaskCompleted, isExecutiveTaskOverdue } from './dashboard-overdue.js';
import {
  getMainMilestoneStableKey,
  migrateMainMilestoneKeys
} from './main-milestone-logic.js';

function text(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function date(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeProjectCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function normalizeDeptName(owner) {
  return text(owner).replace(/\b(phong|ban|bo phan|department|dept)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export const CANONICAL_DEPARTMENT_CODES = Object.freeze([
  'BQLDA', 'PTDA', 'GPMB', 'THIETKE', 'TIEUCHUAN', 'DAUTHAU',
  'KEHOACH', 'KETOAN', 'KINHDOANH', 'PHAPCHE', 'TAICHINH', 'MKT',
  'VANHANH', 'UBNCSP', 'KSXD', 'NHANSU', 'HANHCHINH', 'CNTT', 'TROLY', 'BIM'
]);

const DEPARTMENT_ALIAS_TO_CANONICAL = Object.freeze({
  BQLDA: 'BQLDA',
  QLDA: 'BQLDA',
  BANQUANLYDUAN: 'BQLDA',
  QUANLYDUAN: 'BQLDA',
  PTDA: 'PTDA',
  PHATTRIENDUAN: 'PTDA',
  GPMB: 'GPMB',
  GIAIPHONGMATBANG: 'GPMB',
  TK: 'THIETKE',
  THIETKE: 'THIETKE',
  THIETKEKYTHUAT: 'THIETKE',
  TIEUCHUAN: 'TIEUCHUAN',
  DAUTHAU: 'DAUTHAU',
  KEHOACH: 'KEHOACH',
  KETOAN: 'KETOAN',
  KD: 'KINHDOANH',
  KINHDOANH: 'KINHDOANH',
  QUANLYKINHDOANH: 'KINHDOANH',
  PHAPCHE: 'PHAPCHE',
  TAICHINH: 'TAICHINH',
  MKT: 'MKT',
  MARKETING: 'MKT',
  MARKETINGTRUYENTHONG: 'MKT',
  VANHANH: 'VANHANH',
  QUANLYKHAITHACBDS: 'VANHANH',
  UBNCSP: 'UBNCSP',
  UYBANRD: 'UBNCSP',
  KSXD: 'KSXD',
  KIEMSOATXAYDUNG: 'KSXD',
  NHANSU: 'NHANSU',
  HANHCHINH: 'HANHCHINH',
  CNTT: 'CNTT',
  QUANTRIHETHONG: 'CNTT',
  TROLY: 'TROLY',
  TROLYTHUKY: 'TROLY',
  BIM: 'BIM'
});

function normalizeDeptAliasToken(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
}

export function getDeptCode(value) {
  const token = normalizeDeptAliasToken(value);
  if (!token) return 'UNASSIGNED';
  const compact = token.replace(/_/g, '');
  if (DEPARTMENT_ALIAS_TO_CANONICAL[compact]) return DEPARTMENT_ALIAS_TO_CANONICAL[compact];

  // ProjectUnitCode có thể mang hậu tố dự án: BQLDA_DB, KINHDOANH_HL, THIETKE_HL1.
  const projectUnitPrefix = token.split('_')[0];
  if (DEPARTMENT_ALIAS_TO_CANONICAL[projectUnitPrefix]) {
    return DEPARTMENT_ALIAS_TO_CANONICAL[projectUnitPrefix];
  }

  const normalizedName = normalizeDeptName(value).replace(/\s/g, '').toUpperCase();
  return DEPARTMENT_ALIAS_TO_CANONICAL[normalizedName] || compact;
}

export function getDeptDisplayName(code) {
  const canonicalCode = getDeptCode(code);
  const preferred = {
    PTDA: 'Phát triển dự án', GPMB: 'Giải phóng mặt bằng',
    BQLDA: 'Ban Quản lý dự án',
    THIETKE: 'Thiết kế',
    KINHDOANH: 'Kinh doanh',
    TIEUCHUAN: 'Tiêu chuẩn', KEHOACH: 'Kế hoạch', DAUTHAU: 'Đấu thầu',
    KETOAN: 'Kế toán', PHAPCHE: 'Pháp chế', TAICHINH: 'Tài chính',
    MKT: 'Marketing', VANHANH: 'Vận hành', UBNCSP: 'Ủy ban R&D',
    KSXD: 'Kiểm soát xây dựng', NHANSU: 'Nhân sự', HANHCHINH: 'Hành chính',
    CNTT: 'Quản trị hệ thống', TROLY: 'Trợ lý - Thư ký', BIM: 'BIM',
    UNASSIGNED: 'Chưa phân công'
  };
  if (preferred[canonicalCode]) return preferred[canonicalCode];
  return canonicalCode;
}

function firstDepartmentCode(source) {
  const raw = source && source.raw || {};
  return [
    source && source.deptCode,
    source && source.deptCodeRaw,
    source && source.projectUnitCode,
    source && source.MasterDeptCode,
    source && source.masterDeptCode,
    raw.deptCode,
    raw.deptCodeRaw,
    raw.projectUnitCode,
    raw.MasterDeptCode,
    raw.masterDeptCode
  ].find((value) => String(value || '').trim());
}

function addUniqueRegistryValue(map, key, code) {
  if (!key) return;
  if (!map.has(key)) map.set(key, code);
  else if (map.get(key) !== code) map.set(key, '');
}

function buildProjectDepartmentRegistries(payloads) {
  const registries = new Map();
  (payloads || []).forEach((payload) => {
    const projectCode = normalizeProjectCode(payload.projectCode);
    if (!registries.has(projectCode)) {
      registries.set(projectCode, { canonicalCodes: new Set(), aliases: new Map(), names: new Map() });
    }
    const registry = registries.get(projectCode);
    (payload.departments || []).forEach((department) => {
      const code = getDeptCode(firstDepartmentCode(department));
      if (code === 'UNASSIGNED') return;
      registry.canonicalCodes.add(code);
      [
        department.deptCode,
        department.deptCodeRaw,
        department.projectUnitCode,
        department.MasterDeptCode,
        department.masterDeptCode
      ].filter((value) => String(value || '').trim())
        .forEach((value) => addUniqueRegistryValue(registry.aliases, getDeptCode(value), code));
      addUniqueRegistryValue(registry.names, normalizeDeptName(department.deptName), code);
    });
  });
  return registries;
}

function resolveDepartmentCode(source, registry, fallbackValue) {
  const explicitValue = firstDepartmentCode(source);
  if (explicitValue) {
    const explicitCode = getDeptCode(explicitValue);
    if (!registry || registry.canonicalCodes.has(explicitCode)) return explicitCode;
    return registry.aliases.get(explicitCode) || explicitCode;
  }
  const nameKey = normalizeDeptName(fallbackValue);
  if (registry) {
    const registryCode = registry.names.get(nameKey) || registry.aliases.get(getDeptCode(fallbackValue));
    if (registryCode) return registryCode;
  }
  return getDeptCode(fallbackValue);
}

export function getProjectDeptKey(projectCode, deptCode) {
  return `${normalizeProjectCode(projectCode)}::${getDeptCode(deptCode)}`;
}

function statusKey(status) {
  const value = text(status).replace(/[^a-z0-9]/g, '');
  if (value.includes('hoanthanh') || value.includes('complete') || value.includes('done')) return 'completed';
  if (value.includes('dang') || value.includes('progress')) return 'in-progress';
  if (value.includes('chuabatdau') || value.includes('notstarted')) return 'not-started';
  return 'other';
}

function isUnassignedOwnerValue(value) {
  const compact = text(value).replace(/[^a-z0-9]/g, '');
  return !compact || ['unassigned', 'chuaphancong', 'chuagiao', 'notassigned'].includes(compact);
}

function ownerIdentity(owner, ownerEmail, ownerName) {
  const raw = String(owner || '').trim();
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const explicitEmail = String(ownerEmail || '').trim().match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = String(explicitEmail ? explicitEmail[0] : emailMatch ? emailMatch[0] : '').toLowerCase();
  const parsedName = emailMatch
    ? raw.replace(new RegExp(`\\s*<?${emailMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>?\\s*`, 'i'), '').trim()
    : raw;
  const name = String(ownerName || parsedName || '').trim();
  const label = raw || name || email;
  if ((!email && !name) || isUnassignedOwnerValue(label) || (name && isUnassignedOwnerValue(name))) {
    return { key: 'UNASSIGNED', label: 'CHƯA PHÂN CÔNG', email: '', name: '' };
  }
  return {
    key: email || `OWNER:${text(name)}`,
    label,
    email,
    name
  };
}

function isValidOwnerIdentity(identity) {
  return !!identity && identity.key !== 'UNASSIGNED' && !!(identity.email || identity.name);
}

export function getDepartmentOwnerPresentation(owner) {
  const identity = ownerIdentity(owner);
  const display = identity.name || identity.email || (identity.key === 'UNASSIGNED' ? 'Chưa rõ' : String(owner || '').trim()) || 'Chưa rõ';
  return {
    display,
    title: identity.email || String(owner || '').trim() || 'Chưa rõ',
    email: identity.email,
    name: identity.name
  };
}

function buildDetailPayloads(payloads, deptCode, registries = buildProjectDepartmentRegistries(payloads)) {
  const selectedDeptCode = deptCode ? getDeptCode(deptCode) : '';
  return (payloads || []).map((payload) => {
    const data = [];
    const registry = registries.get(normalizeProjectCode(payload.projectCode));
    (payload.departments || []).forEach((department) => {
      const departmentCode = resolveDepartmentCode(department, registry, department.deptName);
      if (selectedDeptCode && departmentCode !== selectedDeptCode) return;
      (department.masters || []).forEach((master) => {
        (master.details || []).forEach((detail, index) => {
          data.push({
            id: detail.detailTaskId || `${payload.projectCode || ''}:${departmentCode}:${master.masterCode || ''}:${detail.rowIndex || index}`,
            code: detail.detailTaskId || '',
            text: detail.taskName || detail.detailTaskId || 'Công việc chưa đặt tên',
            owner: detail.owner || '',
            ownerEmail: detail.ownerEmail || detail.assigneeEmail || '',
            ownerName: detail.ownerName || detail.assigneeName || '',
            deptCode: departmentCode,
            status: detail.status || '',
            progress: Number(detail.progress || 0) > 1 ? Number(detail.progress || 0) / 100 : Number(detail.progress || 0),
            start_date: detail.planStart || '',
            end_date: detail.planFinish || '',
            actualStart: detail.actualStart || '',
            actualFinish: detail.actualFinish || '',
            ownZone: String(detail.ownZone || '').trim(),
            ownHangMuc: String(detail.ownHangMuc || '').trim(),
            zone: String(detail.ownZone || '').trim(),
            hangMuc: String(detail.ownHangMuc || '').trim(),
            masterTaskCode: master.masterCode || '',
            forceRealTask: true,
            raw: detail
          });
        });
      });
    });
    return {
      projectCode: payload.projectCode || '',
      projectName: payload.projectName || payload.projectCode || '',
      data
    };
  });
}

function isCategory(task) {
  const raw = task.raw || {};
  if ([task.isCategoryRow, task.is_category, task.isGroup, raw.isCategoryRow, raw.is_category, raw.isGroup]
    .some((value) => value === true || value === 1 || String(value).toLowerCase() === 'true')) return true;
  return ['category', 'group', 'heading', 'summary', 'project', 'hangmuc', 'hang muc']
    .includes(text(task.type || task.rowType || task.kind || raw.type || raw.rowType).replace(/[^a-z0-9 ]/g, ''));
}

export function getDepartmentTaskCategory(task) {
  return String(task && task.ownHangMuc || '').trim();
}

function enrichTask(task, payload, today, milestoneKeys, departmentRegistry) {
  const startDate = date(task.start_date || task.planned_start || task.baselineStart || task.planStart);
  const endDate = getExecutiveTaskDueDate(task);
  const actualStartDate = date(task.actualStart);
  const actualFinishDate = date(task.actualFinish || task.actualEnd);
  const normalizedStatus = statusKey(task.status);
  const duration = Number(task.duration || task.durationDays || task.planDays || task.plannedDays || 0);
  const item = { ...task, startDate, endDate, actualStartDate, actualFinishDate, normalizedStatus };
  item.hasActionStatus = normalizedStatus !== 'other';
  item.durationDays = duration;
  const category = isCategory(task) || isExecutiveCategoryRow(task, item, task.raw || {});
  item.isCategoryRow = category;
  item.isCompleted = isExecutiveTaskCompleted(item);
  item.isRealTask = !category && !!String(task.text || '').trim() && (!!task.forceRealTask || !!(startDate || endDate || actualStartDate || actualFinishDate || item.hasActionStatus));
  item.projectCode = payload.projectCode || '';
  item.projectName = payload.projectName || payload.projectCode || '';
  item.deptCode = resolveDepartmentCode(task, departmentRegistry, task.deptName || task.owner);
  item.ownerIdentity = ownerIdentity(task.owner, task.ownerEmail, task.ownerName);
  item.contextLabel = getDepartmentTaskCategory(task);
  item.isMainMilestone = milestoneKeys.has(
    getMainMilestoneStableKey(task, payload.projectCode)
  );
  item.isOverdue = isExecutiveTaskOverdue(item, today);
  item.lateDays = item.isOverdue ? Math.round((today - endDate) / 86400000) : 0;
  if (task.forceRealTask) {
    if (item.isCompleted) item.normalizedStatus = 'completed';
    else if (item.normalizedStatus === 'other') item.normalizedStatus = Number(task.progress || 0) > 0 ? 'in-progress' : 'not-started';
  }
  return item;
}

function summarizeRows(rows) {
  const done = rows.filter((task) => task.isCompleted).length;
  return {
    total: rows.length,
    completed: done,
    inProgress: rows.filter((task) => !task.isCompleted && task.normalizedStatus === 'in-progress').length,
    notStarted: rows.filter((task) => !task.isCompleted && task.normalizedStatus === 'not-started').length,
    overdue: rows.filter((task) => task.isOverdue).length,
    completionPercent: rows.length ? Math.round(done * 100 / rows.length) : 0
  };
}

export function getDepartmentPerformancePresentation(deptCode) {
  const individual = !!String(deptCode || '').trim();
  return individual
    ? { individual, title: 'Hiệu quả cá nhân', firstColumnLabel: 'CÁ NHÂN', emptyMessage: 'Không có cá nhân phù hợp.' }
    : { individual, title: 'Hiệu quả phòng/ban', firstColumnLabel: 'PHÒNG/BAN', emptyMessage: 'Không có phòng/ban phù hợp.' };
}

export function buildDepartmentDashboardModel(payloads, filters = {}, todayValue = new Date(), options = {}) {
  const today = date(todayValue);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const upcomingEnd = new Date(today); upcomingEnd.setDate(upcomingEnd.getDate() + 14);
  const detailSourceProvided = Array.isArray(options.detailPayloads);
  const departmentRegistries = buildProjectDepartmentRegistries(detailSourceProvided ? options.detailPayloads : []);
  const all = [];
  (payloads || []).forEach((payload) => {
    const departmentRegistry = departmentRegistries.get(normalizeProjectCode(payload.projectCode));
    const milestoneKeys = migrateMainMilestoneKeys([
      ...(payload.mainMilestoneIds || []), ...(payload.mainMilestoneCodes || [])
    ], payload.data || [], payload.projectCode).keys;
    (payload.data || []).forEach((task) => all.push(enrichTask(task, payload, today, milestoneKeys, departmentRegistry)));
  });
  const baseReal = all.filter((task) => task.isRealTask);
  const detailPayloads = detailSourceProvided ? buildDetailPayloads(options.detailPayloads, '', departmentRegistries) : [];
  const detailAll = [];
  detailPayloads.forEach((payload) => {
    const departmentRegistry = departmentRegistries.get(normalizeProjectCode(payload.projectCode));
    (payload.data || []).forEach((task) => {
      const enriched = enrichTask(task, payload, today, new Set(), departmentRegistry);
      enriched.dashboardSource = 'detail';
      detailAll.push(enriched);
    });
  });
  baseReal.forEach((task) => { task.dashboardSource = 'master'; });
  const baseTaskByMaster = new Map();
  baseReal.forEach((task) => {
    [task.masterTaskCode, task.code, task.id].forEach((value) => {
      const key = `${normalizeProjectCode(task.projectCode)}:${String(value || '').trim().toUpperCase()}`;
      if (value && !baseTaskByMaster.has(key)) baseTaskByMaster.set(key, task);
    });
  });
  detailAll.forEach((task) => {
    const baseTask = baseTaskByMaster.get(`${normalizeProjectCode(task.projectCode)}:${String(task.masterTaskCode || '').trim().toUpperCase()}`);
    if (!baseTask) return;
    task.dashboardLinkId = baseTask.id || '';
    task.isMainMilestone = !!baseTask.isMainMilestone;
  });
  const detailReal = detailAll.filter((task) => task.isRealTask);
  const detailProjectDeptKeys = new Set(detailReal
    .map((task) => getProjectDeptKey(task.projectCode, task.deptCode)));
  const masterFallbackTasks = detailSourceProvided
    ? baseReal.filter((task) => !detailProjectDeptKeys.has(getProjectDeptKey(task.projectCode, task.deptCode)))
    : [];
  const real = detailSourceProvided ? [...detailReal, ...masterFallbackTasks] : baseReal;
  const departmentSource = detailSourceProvided ? options.detailPayloads : payloads;
  const detailDepartments = [];
  if (detailSourceProvided) {
    (departmentSource || []).forEach((payload) => (payload.departments || []).forEach((department) => {
      const registry = departmentRegistries.get(normalizeProjectCode(payload.projectCode));
      detailDepartments.push({
        code: resolveDepartmentCode(department, registry, department.deptName),
        name: department.deptName || firstDepartmentCode(department) || ''
      });
    }));
  }
  const departmentCodes = [...new Set((detailSourceProvided
    ? [...detailDepartments.map((department) => department.code), ...masterFallbackTasks.map((task) => task.deptCode)]
    : baseReal.map((task) => task.deptCode)).filter((code) => code && code !== 'UNASSIGNED'))];
  const selectedDeptCode = filters.deptCode ? getDeptCode(filters.deptCode) : '';
  const selectedProjectCode = normalizeProjectCode(filters.projectCode);
  if (selectedDeptCode && selectedDeptCode !== 'UNASSIGNED' && !departmentCodes.includes(selectedDeptCode)) departmentCodes.push(selectedDeptCode);
  const departments = departmentCodes.sort().map((code) => ({
    code,
    name: getDeptDisplayName(code)
  }));
  const projectScoped = real.filter((task) => !selectedProjectCode || normalizeProjectCode(task.projectCode) === selectedProjectCode);
  const filtered = real.filter((task) => (!selectedDeptCode || task.deptCode === selectedDeptCode) && (!selectedProjectCode || normalizeProjectCode(task.projectCode) === selectedProjectCode));
  const completed = filtered.filter((task) => task.isCompleted);
  const open = filtered.filter((task) => !task.isCompleted);
  const overdueAll = open.filter((task) => task.isOverdue).sort((a, b) => b.lateDays - a.lateDays);
  const upcomingAll = open.filter((task) => task.endDate && task.endDate >= today && task.endDate <= upcomingEnd)
    .map((task) => ({ ...task, remainingDays: Math.round((task.endDate - today) / 86400000) })).sort((a, b) => a.endDate - b.endDate);
  const completedThisMonth = completed.filter((task) => task.actualFinishDate && task.actualFinishDate >= monthStart && task.actualFinishDate < nextMonth)
    .sort((a, b) => b.actualFinishDate - a.actualFinishDate).slice(0, 10);
  const milestones = filtered.filter((task) => task.isMainMilestone).map((task) => ({
    ...task,
    remainingDays: task.endDate && task.endDate >= today ? Math.round((task.endDate - today) / 86400000) : null,
    lateDays: !task.isCompleted && task.endDate && task.endDate < today ? Math.round((today - task.endDate) / 86400000) : task.lateDays
  })).sort((a, b) => (a.endDate || new Date(8640000000000000)) - (b.endDate || new Date(8640000000000000))).slice(0, 10);
  const projectSummarySource = payloads;
  const projectSummary = (projectSummarySource || []).map((payload) => {
    const rows = filtered.filter((task) => normalizeProjectCode(task.projectCode) === normalizeProjectCode(payload.projectCode));
    const summary = summarizeRows(rows);
    return { projectCode: payload.projectCode, projectName: payload.projectName || payload.projectCode, ...summary,
      upcoming: rows.filter((task) => !task.isCompleted && task.endDate && task.endDate >= today && task.endDate <= upcomingEnd).length,
    };
  }).filter((row) => row.total > 0);
  const departmentEfficiency = departments.map((dept) => {
    const rows = projectScoped.filter((task) => task.deptCode === dept.code);
    return {
      deptCode: dept.code,
      deptName: dept.name,
      ...summarizeRows(rows)
    };
  }).filter((row) => row.total > 0).sort((a, b) => b.overdue - a.overdue || b.total - a.total || a.deptCode.localeCompare(b.deptCode));
  const individualDetailRows = detailReal.filter((task) =>
    (!selectedDeptCode || task.deptCode === selectedDeptCode) &&
    (!selectedProjectCode || normalizeProjectCode(task.projectCode) === selectedProjectCode));
  const individualMap = new Map();
  individualDetailRows.forEach((task) => {
    const identity = task.ownerIdentity || ownerIdentity(task.owner);
    if (!isValidOwnerIdentity(identity)) return;
    if (!individualMap.has(identity.key)) individualMap.set(identity.key, { identity, rows: [] });
    individualMap.get(identity.key).rows.push(task);
  });
  const individualEfficiency = [...individualMap.values()].map(({ identity, rows }) => ({
    ownerKey: identity.key,
    ownerEmail: identity.email,
    ownerName: identity.name,
    ownerLabel: identity.label,
    ...summarizeRows(rows)
  })).sort((a, b) => b.overdue - a.overdue || b.total - a.total || a.ownerLabel.localeCompare(b.ownerLabel));
  const masterFallbackProjects = [...new Set(masterFallbackTasks
    .filter((task) =>
      (!selectedDeptCode || task.deptCode === selectedDeptCode) &&
      (!selectedProjectCode || normalizeProjectCode(task.projectCode) === selectedProjectCode))
    .map((task) => task.projectCode)
    .filter(Boolean))];
  const individualEmptyMessage = individualDetailRows.length
    ? 'Chưa có công việc được phân công cho cá nhân.'
    : 'Phòng/ban chưa có công việc chi tiết theo cá nhân.';
  return { departments, tasks: filtered, overdue: overdueAll.slice(0, 5), upcoming: upcomingAll.slice(0, 10), completedThisMonth, milestones, projectSummary, departmentEfficiency, individualEfficiency, masterFallbackProjects,
    individualEmptyMessage,
    kpis: { total: filtered.length, completed: completed.length, inProgress: filtered.filter((task) => !task.isCompleted && task.normalizedStatus === 'in-progress').length,
      notStarted: filtered.filter((task) => !task.isCompleted && task.normalizedStatus === 'not-started').length, overdue: overdueAll.length,
      upcoming: upcomingAll.length, milestones: milestones.length } };
}
