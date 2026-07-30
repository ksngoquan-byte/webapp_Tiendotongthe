import assert from 'node:assert/strict';
import fs from 'node:fs';

const cacheSource = fs.readFileSync(new URL('./api-read-cache.js', import.meta.url), 'utf8');
const dispatcherSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const budgetServiceSource = fs.readFileSync(new URL('../apps-script-dev-api/55_Budget_Dashboard_Performance.js', import.meta.url), 'utf8');
const bootstrapServiceSource = fs.readFileSync(new URL('../apps-script-dev-api/56_Performance_Bootstrap_Service.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

assert.equal(cacheSource.includes("normalizedAction === 'health'"), true);
assert.equal(cacheSource.includes('canonicalUrl'), true);
assert.equal(cacheSource.includes('seedDepartmentDashboards'), true);
assert.equal(cacheSource.includes('fetchProfileThroughBootstrap'), false);
assert.equal(cacheSource.includes('seedProjectsFromBootstrap'), false);
assert.equal(cacheSource.includes('seedMilestonesFromGantt'), true);
assert.equal(cacheSource.includes('milestoneByProject'), true);
assert.equal(cacheSource.includes('120000'), true);
assert.equal(dispatcherSource.includes("action === 'bootstrap'"), true);
assert.equal(dispatcherSource.includes('qltdDevApiBootstrap_(params)'), true);
assert.equal(dispatcherSource.includes('qltdBudgetGetLiveDashboardOptimized_(params)'), true);
assert.equal(bootstrapServiceSource.includes('profile:'), true);
assert.equal(bootstrapServiceSource.includes('projects:'), true);
assert.equal(bootstrapServiceSource.includes('qltdProjectsEnsureSheet_'), false);
assert.equal(bootstrapServiceSource.includes('qltdProjectsSeedDefaultIfMissing_'), false);
assert.equal(appSource.includes("fetchBackendJson('bootstrap'"), true);
assert.equal(appSource.includes("fetchBackendJson('profile'"), false);
assert.equal(budgetServiceSource.includes('departmentViews'), true);
assert.equal(budgetServiceSource.includes('qltdBudgetReadBudgetItems_()'), true);
assert.equal(budgetServiceSource.includes('qltdBudgetReadAllocations_()'), true);

console.log('performance-dashboard-cache.test.mjs: PASS');
