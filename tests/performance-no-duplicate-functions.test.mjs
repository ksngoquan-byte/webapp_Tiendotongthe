import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'apps-script-dev-api/28_DEV_API.js',
  'apps-script-dev-api/29_USERS_SERVICE.js',
  'apps-script-dev-api/31_PROJECTS_SERVICE.js',
  'apps-script-dev-api/35_GANTT_DATA_SERVICE.js',
  'apps-script-dev-api/56_Performance_Bootstrap_Service.js',
  'apps-script-dev-api/69_Notification_Service.js',
  'apps-script-dev-api/72_Performance_Observability.js',
  'firebase-hosting-dev/app.js',
  'firebase-hosting-dev/api-read-cache.js',
  'firebase-hosting-dev/pb-detail-ui.js'
];

files.forEach((relativePath) => {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const names = Array.from(
    source.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm),
    (match) => match[1]
  );
  const duplicates = Array.from(new Set(names.filter((name, index) => names.indexOf(name) !== index)));
  assert.deepEqual(duplicates, [], `${relativePath} contains duplicate named functions`);
});

console.log('performance-no-duplicate-functions.test.mjs: PASS');
