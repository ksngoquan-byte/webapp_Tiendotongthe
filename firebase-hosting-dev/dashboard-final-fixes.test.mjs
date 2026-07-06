import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const dashboardStyles = fs.readFileSync(new URL('./dashboard_executive_v3.css', import.meta.url), 'utf8');

assert.match(app, /getDepartmentOwnerPresentation\(task\.owner\)/);
assert.match(app, /class="dept-owner-cell is-text" title="\$\{escapeHtml\(owner\.title\)\}">\$\{escapeHtml\(owner\.display\)\}/);
assert.match(app, /EXACT_ROW_ZONE_HANGMUC_V4/);
assert.match(app, /model\.individualEmptyMessage/);
assert.match(app, /Chưa có công việc được phân công cho cá nhân|individualEmptyMessage/);
assert.match(dashboardStyles, /\.dept-owner-cell\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
assert.match(dashboardStyles, /\.dept-table th:nth-child\(4\),[\s\S]*?width:\s*150px;/);

assert.match(app, /model\.kpis\.unmappedContext > 0 \? renderExecutiveKpiCard\('Chưa xác định Hạng mục'/);
assert.match(app, /'Công việc chưa được gắn Hạng mục'/);
assert.match(app, /công việc chưa được gắn Hạng mục/);
assert.doesNotMatch(app, /Chưa mapping Hạng mục|Cần rà soát context|công việc cần rà soát mapping context/);

const toolbarStart = html.indexOf('<div class="profile header-user-toolbar"');
const toolbarEnd = html.indexOf('</header>', toolbarStart);
assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
const toolbar = html.slice(toolbarStart, toolbarEnd);
const orderedIds = ['notificationBellButton', 'userAvatar', 'userName', 'userEmail', 'userRole', 'signOutButton'];
let previousIndex = -1;
for (const id of orderedIds) {
  const currentIndex = toolbar.indexOf(`id="${id}"`);
  assert.ok(currentIndex > previousIndex, `${id} phải đúng thứ tự trong toolbar`);
  previousIndex = currentIndex;
}
assert.match(toolbar, /header-user-avatar-fallback/);
assert.match(toolbar, /id="signOutButton"[\s\S]*?title="Đăng xuất"[\s\S]*?aria-label="Đăng xuất"/);
assert.doesNotMatch(toolbar, /style="/);
assert.match(styles, /\.header-user-toolbar\s*\{[\s\S]*?flex-shrink:\s*0;[\s\S]*?flex-wrap:\s*nowrap;/);
assert.match(styles, /\.header-user-avatar\s*\{[\s\S]*?width:\s*38px;[\s\S]*?height:\s*38px;[\s\S]*?border-radius:\s*50%;/);
assert.match(styles, /\.header-user-email\s*\{[\s\S]*?text-overflow:\s*ellipsis;/);
assert.match(styles, /\.notification-bell-button\s*\{[\s\S]*?color:\s*#d97706;/);
assert.match(styles, /\.header-logout-button\s*\{[\s\S]*?color:\s*#dc2626;/);
assert.match(styles, /@media \(max-width: 780px\)[\s\S]*?\.header-user-email\s*\{[\s\S]*?display:\s*none;/);
assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?\.header-user-meta,[\s\S]*?\.header-role-badge\s*\{[\s\S]*?display:\s*none;/);
assert.match(app, /els\.signOutButton\.addEventListener\('click', handleSignOut\)/);
assert.match(app, /els\.notificationBellButton\.addEventListener\('click'/);
assert.match(app, /els\.userAvatar\.addEventListener\('error',[\s\S]*?classList\.add\('empty'\)/);

console.log('Dashboard final BUG 1–4 UI regression tests: PASS');
