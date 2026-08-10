import { installGanttVisibleRangePatch } from './gantt-visible-range.js?v=GANTT_VISIBLE_RANGE_V1';

installGanttVisibleRangePatch();

function clean(value) {
  return String(value || '').trim();
}

function isGeneratedRowId(value) {
  return /^ROW-\d+$/i.test(clean(value));
}

function normalizeUid(value) {
  const raw = clean(value);
  const uid = raw.replace(/^UID:/i, '');
  return uid && !isGeneratedRowId(uid) ? uid : '';
}

function getTaskUid(task) {
  const candidates = [
    task && task.id,
    task && task.uid,
    task && task.taskId,
    task && task.itemId,
    task && task.refId
  ];
  for (const candidate of candidates) {
    const uid = normalizeUid(candidate);
    if (uid) return uid;
  }
  return '';
}

export function getMainMilestoneStableKey(task, projectCode) {
  const project = clean(projectCode);
  const uid = getTaskUid(task);
  return project && uid ? `${project}|UID:${uid}` : '';
}

function addToIndex(map, rawValue, task) {
  const value = clean(rawValue);
  if (!value) return;
  const matches = map.get(value) || [];
  if (!matches.includes(task)) matches.push(task);
  map.set(value, matches);
}

export function buildMainMilestoneTaskIndex(tasks = [], projectCode = '') {
  const byStableKey = new Map();
  const byId = new Map();
  const byMasterTaskCode = new Map();
  const byCode = new Map();

  (tasks || []).forEach((task) => {
    const stableKey = getMainMilestoneStableKey(task, projectCode);
    addToIndex(byStableKey, stableKey, task);
    if (!isGeneratedRowId(task && task.id)) addToIndex(byId, normalizeUid(task && task.id), task);
    if (!isGeneratedRowId(task && task.uid)) addToIndex(byId, normalizeUid(task && task.uid), task);
    if (!isGeneratedRowId(task && task.taskId)) addToIndex(byId, normalizeUid(task && task.taskId), task);
    if (!isGeneratedRowId(task && task.itemId)) addToIndex(byId, normalizeUid(task && task.itemId), task);
    if (!isGeneratedRowId(task && task.refId)) addToIndex(byId, normalizeUid(task && task.refId), task);
    addToIndex(byMasterTaskCode, task && task.masterTaskCode, task);
    addToIndex(byCode, task && task.code, task);
  });

  return { byStableKey, byId, byMasterTaskCode, byCode };
}

function uniqueMatches(lookupKey, maps) {
  const matches = [];
  maps.forEach((map) => {
    (map.get(lookupKey) || []).forEach((task) => {
      if (!matches.includes(task)) matches.push(task);
    });
  });
  return matches;
}

function unresolvedKey(rawKey, status, warning) {
  return { rawKey, status, key: '', warning };
}

export function resolveLegacyMainMilestoneKey(rawValue, taskIndex, projectCode) {
  const rawKey = clean(rawValue);
  if (!rawKey) return { rawKey, status: 'EMPTY', key: '' };

  const project = clean(projectCode);
  const compositeIndex = rawKey.indexOf('|');
  let lookupKey = rawKey;
  let lookupMaps = [
    taskIndex.byId,
    taskIndex.byMasterTaskCode,
    taskIndex.byCode
  ];

  if (compositeIndex >= 0) {
    const keyProject = clean(rawKey.slice(0, compositeIndex));
    const keyTail = clean(rawKey.slice(compositeIndex + 1));
    if (!keyProject || keyProject !== project) {
      return unresolvedKey(
        rawKey,
        'PROJECT_MISMATCH',
        'MAIN_MILESTONE_PROJECT_KEY_MISMATCH'
      );
    }
    if (/^UID:/i.test(keyTail)) {
      lookupKey = normalizeUid(keyTail);
      lookupMaps = [taskIndex.byId];
    } else {
      lookupKey = keyTail;
      lookupMaps = [taskIndex.byMasterTaskCode, taskIndex.byCode];
    }
  } else if (/^UID:/i.test(rawKey)) {
    lookupKey = normalizeUid(rawKey);
    lookupMaps = [taskIndex.byId];
  }

  if (!lookupKey || isGeneratedRowId(lookupKey)) {
    return unresolvedKey(
      rawKey,
      'UNSTABLE_ROW_KEY',
      'MAIN_MILESTONE_UNSTABLE_ROW_KEY'
    );
  }

  const matches = uniqueMatches(lookupKey, lookupMaps);
  if (matches.length > 1) {
    return unresolvedKey(
      rawKey,
      'AMBIGUOUS',
      'MAIN_MILESTONE_AMBIGUOUS_KEY'
    );
  }
  if (matches.length === 1) {
    const key = getMainMilestoneStableKey(matches[0], projectCode);
    if (key) return { rawKey, status: key === rawKey ? 'STABLE' : 'MIGRATED', key };
    return unresolvedKey(
      rawKey,
      'UID_REQUIRED',
      'MAIN_MILESTONE_UID_REQUIRED'
    );
  }

  return unresolvedKey(
    rawKey,
    'ORPHAN',
    'MAIN_MILESTONE_ORPHAN_KEY'
  );
}

export function migrateMainMilestoneKeys(values, tasks = [], projectCode = '') {
  const taskIndex = buildMainMilestoneTaskIndex(tasks, projectCode);
  const keys = new Set();
  const orphanKeys = new Set();
  const warnings = [];
  let migratedCount = 0;
  let ambiguousCount = 0;

  (values || []).forEach((value) => {
    const result = resolveLegacyMainMilestoneKey(value, taskIndex, projectCode);
    if (result.key) {
      keys.add(result.key);
      if (result.status === 'MIGRATED') migratedCount += 1;
      return;
    }
    if (!result.rawKey) return;
    orphanKeys.add(result.rawKey);
    if (result.status === 'AMBIGUOUS') ambiguousCount += 1;
    warnings.push({ code: result.warning, rawKey: result.rawKey });
  });

  return {
    keys,
    orphanKeys,
    warnings,
    rawCount: new Set((values || []).map(clean).filter(Boolean)).size,
    validCount: keys.size,
    migratedCount,
    orphanCount: orphanKeys.size,
    ambiguousCount,
    taskIndex
  };
}

export function isMainMilestoneKeySelected(selectedKeys, task, projectCode) {
  const key = getMainMilestoneStableKey(task, projectCode);
  return !!(key && selectedKeys && selectedKeys.has(key));
}

export function toggleMainMilestoneTaskKey(selectedKeys, task, projectCode) {
  const key = getMainMilestoneStableKey(task, projectCode);
  if (!key) return '';
  if (selectedKeys.has(key)) selectedKeys.delete(key);
  else selectedKeys.add(key);
  return key;
}
