function clean(value) {
  return String(value || '').trim();
}

export function getMainMilestoneStableKey(task, projectCode) {
  const project = clean(projectCode);
  const uid = clean(task && (task.uid || task.taskId || task.itemId || task.id || task.refId));
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
    addToIndex(byId, task && task.uid, task);
    addToIndex(byId, task && task.taskId, task);
    addToIndex(byId, task && task.itemId, task);
    addToIndex(byId, task && task.id, task);
    addToIndex(byId, task && task.refId, task);
    addToIndex(byMasterTaskCode, task && task.masterTaskCode, task);
    addToIndex(byCode, task && task.code, task);
  });

  return { byStableKey, byId, byMasterTaskCode, byCode };
}

function uniqueMatches(rawKey, index) {
  const matches = [];
  const lookupKeys = [rawKey];
  const compositeIndex = rawKey.indexOf('|');
  if (compositeIndex >= 0) {
    const tail = rawKey.slice(compositeIndex + 1);
    lookupKeys.push(tail.startsWith('UID:') ? tail.slice(4) : tail);
  }
  [
    index.byStableKey,
    index.byId,
    index.byMasterTaskCode,
    index.byCode
  ].forEach((map) => {
    lookupKeys.forEach((lookupKey) => {
      (map.get(lookupKey) || []).forEach((task) => {
        if (!matches.includes(task)) matches.push(task);
      });
    });
  });
  return matches;
}

export function resolveLegacyMainMilestoneKey(rawValue, taskIndex, projectCode) {
  const rawKey = clean(rawValue);
  if (!rawKey) return { rawKey, status: 'EMPTY', key: '' };

  const matches = uniqueMatches(rawKey, taskIndex);
  if (matches.length > 1) {
    return {
      rawKey,
      status: 'AMBIGUOUS',
      key: '',
      warning: 'MAIN_MILESTONE_AMBIGUOUS_KEY'
    };
  }
  if (matches.length === 1) {
    const key = getMainMilestoneStableKey(matches[0], projectCode);
    if (key) return { rawKey, status: key === rawKey ? 'STABLE' : 'MIGRATED', key };
  }

  return {
    rawKey,
    status: 'ORPHAN',
    key: '',
    warning: 'MAIN_MILESTONE_ORPHAN_KEY'
  };
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

export function normalizeMainMilestoneStructuralText(value) {
  return clean(value).replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

export function isAllowedMainMilestoneStructuralRow(task) {
  const rowType = clean(task && task.rowType).toUpperCase();
  if (!['ZONE_GROUP', 'STRUCTURAL_GROUP', 'SCHEDULED_GROUP'].includes(rowType)) return false;
  const taskName = normalizeMainMilestoneStructuralText(task && (task.text || task.taskName || task.name));
  const zone = normalizeMainMilestoneStructuralText(task && (task.congViecZone || task.ownZone));
  const hangMuc = normalizeMainMilestoneStructuralText(task && (task.congViecHangMuc || task.ownHangMuc));
  return !!taskName && ((!!zone && taskName === zone) || (!!hangMuc && taskName === hangMuc));
}

export function buildMainMilestoneFilteredView(allTasks = [], selectedTasks = []) {
  const byId = new Map((allTasks || []).map((task) => [clean(task && task.id), task]));
  const visibleById = new Map();

  (selectedTasks || []).forEach((sourceTask) => {
    const taskId = clean(sourceTask && sourceTask.id);
    if (!taskId) return;

    let parentId = clean(sourceTask.parent);
    let structuralParent = null;
    const visited = new Set([taskId]);
    while (parentId && parentId !== '0' && !visited.has(parentId)) {
      visited.add(parentId);
      const candidate = byId.get(parentId);
      if (!candidate) break;
      if (isAllowedMainMilestoneStructuralRow(candidate)) {
        structuralParent = candidate;
        break;
      }
      parentId = clean(candidate.parent);
    }

    if (structuralParent) {
      const structuralId = clean(structuralParent.id);
      if (!visibleById.has(structuralId)) {
        visibleById.set(structuralId, { ...structuralParent, parent: '0' });
      }
    }
    visibleById.set(taskId, {
      ...sourceTask,
      parent: structuralParent ? clean(structuralParent.id) : '0'
    });
  });

  return (allTasks || []).flatMap((task) => {
    const visible = visibleById.get(clean(task && task.id));
    return visible ? [visible] : [];
  });
}
