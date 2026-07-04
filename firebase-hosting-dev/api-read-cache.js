const cache = new Map();
const pending = new Map();
const milestoneByProject = new Map();
const mutationWords = ['sync','save','update','create','delete','approve','reset','write','submit','confirm','cancel'];

function actionOf(url) {
  try { return new URL(url).searchParams.get('action') || ''; } catch { return ''; }
}

function actionKey(url) {
  return String(actionOf(url)).trim().toLowerCase();
}

function isApi(url) {
  try { const u = new URL(url); return u.hostname === 'script.google.com' && u.pathname.includes('/macros/s/'); } catch { return false; }
}

function isMutation(action) {
  const value = String(action).toLowerCase();
  return mutationWords.some((word) => value.includes(word));
}

function canonicalUrl(url) {
  const parsed = new URL(url);
  const entries = Array.from(parsed.searchParams.entries())
    .filter(([key, value]) => key === 'action' || String(value || '').trim() !== '')
    .sort(([aKey, aValue], [bKey, bValue]) => {
      const byKey = aKey.localeCompare(bKey);
      return byKey || String(aValue).localeCompare(String(bValue));
    });
  parsed.search = '';
  entries.forEach(([key, value]) => parsed.searchParams.append(key, value));
  return parsed.toString();
}

function cacheKey(method, url) {
  return `${method}:${canonicalUrl(url)}`;
}

function ttlFor(action) {
  const value = String(action).toLowerCase();
  if (value === 'listprojects') return 60000;
  if (value === 'budget_getlivedashboard') return 120000;
  if (value === 'getmainmilestones') return 120000;
  return 15000;
}

function copy(entry) {
  return new Response(entry.body, { status: entry.status, headers: entry.headers });
}

function jsonResponse(payload, status = 200, headers = [['content-type', 'application/json']]) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function putCache(method, url, payload, ttlMs, status = 200, headers = [['content-type', 'application/json']]) {
  cache.set(cacheKey(method, url), {
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    status,
    headers,
    expiresAt: Date.now() + ttlMs
  });
}

function seedProjectsFromBootstrap(url, bootstrap) {
  if (!bootstrap || bootstrap.success === false || !Array.isArray(bootstrap.projects)) return;
  const base = new URL(url);
  const email = base.searchParams.get('email') || '';
  const payload = {
    success: true,
    projects: bootstrap.projects,
    apiStatus: bootstrap.apiStatus || 'CONNECTED',
    source: bootstrap.source || 'users_and_projects_sheets',
    performance: {
      ...(bootstrap.performance || {}),
      action: 'listProjects',
      cacheHit: true,
      recordCount: bootstrap.projects.length
    }
  };

  const withEmail = new URL(url);
  withEmail.searchParams.set('action', 'listProjects');
  withEmail.searchParams.set('email', email);
  putCache('GET', withEmail.toString(), payload, 60000);

  const withoutEmail = new URL(url);
  withoutEmail.searchParams.set('action', 'listProjects');
  withoutEmail.searchParams.delete('email');
  putCache('GET', withoutEmail.toString(), payload, 60000);
}

async function fetchProfileThroughBootstrap(originalFetch, input, init, url) {
  const bootstrapUrl = new URL(url);
  bootstrapUrl.searchParams.set('action', 'bootstrap');
  const bootstrapResponse = await originalFetch(bootstrapUrl.toString(), init);
  if (!bootstrapResponse.ok) return originalFetch(input, init);

  let bootstrap;
  try {
    bootstrap = await bootstrapResponse.clone().json();
  } catch (_error) {
    return originalFetch(input, init);
  }

  if (!bootstrap || bootstrap.success === false || !bootstrap.profile) {
    return jsonResponse(bootstrap || { success: false, message: 'BOOTSTRAP_INVALID' }, bootstrapResponse.status, Array.from(bootstrapResponse.headers.entries()));
  }

  seedProjectsFromBootstrap(url, bootstrap);
  const profile = {
    ...bootstrap.profile,
    performance: {
      ...(bootstrap.performance || {}),
      action: 'profile'
    }
  };
  return jsonResponse(profile, bootstrapResponse.status, Array.from(bootstrapResponse.headers.entries()));
}

function seedDepartmentDashboards(url, body, status, headers) {
  try {
    const payload = JSON.parse(body);
    const data = payload && (payload.data || payload);
    const views = data && data.departmentViews;
    if (!views || typeof views !== 'object') return;

    Object.entries(views).forEach(([deptCode, departmentData]) => {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set('deptCode', deptCode);
      nextUrl.searchParams.set('view', 'department');
      nextUrl.searchParams.delete('force');
      const envelope = payload.data
        ? { ...payload, data: departmentData }
        : { ...payload, ...departmentData };
      putCache('GET', nextUrl.toString(), envelope, 120000, status, headers);
    });
  } catch (_error) {
    // Optional cache seeding must not affect the live response.
  }
}

function seedMilestonesFromGantt(url, body) {
  try {
    const payload = JSON.parse(body);
    if (!payload || payload.success === false) return;
    const projectCode = String(payload.projectCode || new URL(url).searchParams.get('projectCode') || '').trim();
    if (!projectCode) return;
    milestoneByProject.set(projectCode, {
      success: true,
      ids: Array.isArray(payload.mainMilestoneIds) ? payload.mainMilestoneIds : [],
      codes: Array.isArray(payload.mainMilestoneCodes) ? payload.mainMilestoneCodes : [],
      source: payload.mainMilestoneSource || 'GOOGLE_SHEET',
      projectCode
    });
  } catch (_error) {
    // Optional cache seeding must not affect the Gantt response.
  }
}

export function installApiReadCache(target = window) {
  if (target.__qltdReadCacheInstalled) return;
  target.__qltdReadCacheInstalled = true;
  const originalFetch = target.fetch.bind(target);

  target.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init.method || input.method || 'GET').toUpperCase();
    if (!isApi(url)) return originalFetch(input, init);

    const action = actionOf(url);
    const normalizedAction = actionKey(url);

    if (normalizedAction === 'health') {
      return jsonResponse({ success: true, service: 'QLTD_DEV_API', status: 'OK', clientBypass: true });
    }

    if (method === 'GET' && normalizedAction === 'profile') {
      return fetchProfileThroughBootstrap(originalFetch, input, init, url);
    }

    if (method === 'GET' && normalizedAction === 'getmainmilestones') {
      const projectCode = String(new URL(url).searchParams.get('projectCode') || '').trim();
      if (projectCode && milestoneByProject.has(projectCode)) {
        return jsonResponse(milestoneByProject.get(projectCode));
      }
    }

    if (method !== 'GET' || isMutation(action)) {
      cache.clear();
      milestoneByProject.clear();
      return originalFetch(input, init);
    }

    const key = cacheKey(method, url);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return copy(hit);
    if (pending.has(key)) return (await pending.get(key)).clone();

    const request = originalFetch(input, init).then(async (response) => {
      if (response.ok) {
        const body = await response.clone().text();
        const headers = Array.from(response.headers.entries());
        cache.set(key, {
          body,
          status: response.status,
          headers,
          expiresAt: Date.now() + ttlFor(action)
        });
        if (normalizedAction === 'budget_getlivedashboard') {
          seedDepartmentDashboards(url, body, response.status, headers);
        }
        if (normalizedAction === 'ganttdata') {
          seedMilestonesFromGantt(url, body);
        }
      }
      return response;
    }).finally(() => pending.delete(key));

    pending.set(key, request);
    return (await request).clone();
  };
}

if (typeof window !== 'undefined') installApiReadCache(window);
