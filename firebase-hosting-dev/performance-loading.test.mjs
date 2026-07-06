import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

assert.equal(html.includes('src="https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.js"'), false);
assert.equal(html.includes('rel="preconnect" href="https://script.google.com"'), true);
assert.equal(html.includes('app.js?v=PERF_WEBAPP_LOAD_V1'), true);
assert.equal(app.includes('function ensureDhtmlxGanttLoaded()'), true);

console.log('performance-loading.test.mjs: PASS');
