import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

assert.equal(html.includes('src="https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.js"'), false);
assert.equal(html.includes('href="https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.css"'), false);
assert.equal(html.includes('src="./pb-detail-ui.js'), false);
assert.equal(html.includes('rel="preconnect" href="https://script.google.com"'), true);
assert.equal(html.includes('app.js?v=GANTT_REQUEST_RACE_HOTFIX_3'), true);
assert.equal(app.includes('function ensureDhtmlxGanttLoaded()'), true);
assert.equal(app.includes('function ensureDhtmlxGanttStylesheet()'), true);
assert.equal(app.includes('function ensurePbDetailUiLoaded()'), true);

console.log('performance-loading.test.mjs: PASS');
