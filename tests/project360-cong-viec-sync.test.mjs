import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const code = fs.readFileSync(new URL('../apps-script-dev-api/71_Project360_Cong_Viec_Sync.js', import.meta.url), 'utf8');
const classification = fs.readFileSync(new URL('../apps-script-dev-api/03_Cau_truc_nhap_lieu_v1.js', import.meta.url), 'utf8');

function task(id = '1') {
  const row = Array(31).fill('');
  row[1] = 'I'; row[6] = id; row[7] = 'Task ' + id; row[9] = '3';
  row[17] = 'Chưa bắt đầu'; row[30] = crypto.randomUUID();
  return row;
}

function harness(rows = [task()]) {
  const props = new Map(Object.entries({
    P360_SYNC_ENABLED: 'true', P360_SYNC_FILE_ID: 'file', P360_SYNC_PROJECT_ID: 'project',
    P360_SYNC_SOURCE_ID: 'source', P360_SYNC_API_BASE: 'https://example.test', P360_SYNC_TOKEN: 'SECRET'
  }));
  const header = Array(31).fill(''); header[30] = 'SYNC_UID';
  let cols = 31;
  const writes = [], requests = [], logs = [], protections = [], triggers = [];
  let http = 200, ackOverride = null, missingAck = [], afterFetch = null;
  let locks = 0;
  const sheet = {
    getName: () => 'Cong_viec', getParent: () => ({ getId: () => 'file' }),
    getMaxColumns: () => cols, getLastRow: () => rows.length + 4, getMaxRows: () => 100,
    insertColumnsAfter: (at, count) => { assert.equal(at, 30); cols += count; },
    hideColumns: col => assert.equal(col, 31),
    getProtections: () => protections,
    getRange: (r, c, n = 1, m = 1) => ({
      getValue: () => header[c - 1],
      setValue: value => { writes.push({ r, c, value }); header[c - 1] = value; },
      getDisplayValues: () => r === 4 ? [header.slice(c - 1, c - 1 + m)] :
        rows.slice(r - 5, r - 5 + n).map(row => row.slice(c - 1, c - 1 + m)),
      setValues: values => {
        writes.push({ r, c, values });
        values.forEach((value, i) => value.forEach((cell, j) => { rows[r - 5 + i][c - 1 + j] = cell; }));
      },
      protect: () => {
        const p = { getDescription: () => p.description,
          setDescription: value => { p.description = value; }, setWarningOnly: () => {},
          addEditor: () => { p.currentEditorKept = true; }, getEditors: () => ['ordinary-editor'],
          removeEditors: values => { p.removedEditors = values; }, canDomainEdit: () => true,
          setDomainEdit: value => { p.domainEdit = value; } };
        protections.push(p); return p;
      }
    })
  };
  const context = vm.createContext({
    console: { log: value => logs.push(value) }, Date,
    Session: { getEffectiveUser: () => 'effective-owner' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key) ?? null, setProperty: (key, value) => props.set(key, value),
      deleteProperty: key => props.delete(key), getProperties: () => Object.fromEntries(props)
    }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { locks++; }, releaseLock: () => { locks--; }
    }) },
    SpreadsheetApp: { openById: id => { assert.equal(id, 'file'); return { getSheetByName: () => sheet }; },
      ProtectionType: { RANGE: 'RANGE' } },
    Utilities: {
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algo, value) => Array.from(crypto.createHash('sha256').update(value).digest())
    },
    UrlFetchApp: { fetch: (url, options) => {
      assert.equal(locks, 0, 'Do not hold queue lock across network');
      requests.push({ url, options }); if (afterFetch) afterFetch();
      return { getResponseCode: () => http, getContentText: () => JSON.stringify({
        committable: true, ackUids: ackOverride ?? rows.map(row => row[30]),
        ackMissingUids: missingAck, summary: { UPDATE: rows.length }
      }) };
    } },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(name => ({ getHandlerFunction: () => name })),
      newTrigger: name => {
        const builder = { forSpreadsheet: () => builder, onEdit: () => builder, timeBased: () => builder,
          everyMinutes: () => builder, create: () => triggers.push(name) }; return builder;
      }
    }
  });
  vm.runInContext(classification, context); vm.runInContext(code, context);
  const edit = (r = 5, n = rows.length, name = 'Cong_viec') => context.project360CongViecOnEdit({
    range: { getSheet: () => ({ ...sheet, getName: () => name }), getRow: () => r,
      getNumRows: () => n, getColumn: () => 8 }
  });
  return { context, rows, props, header, writes, requests, logs, protections, triggers, edit,
    setCols: value => { cols = value; }, setHttp: value => { http = value; },
    setAck: value => { ackOverride = value; }, setMissingAck: value => { missingAck = value; },
    setAfterFetch: fn => { afterFetch = fn; } };
}

test('schema is AE-only, hidden/protected idempotently, backfill only missing', () => {
  const h = harness([task(), task('2'), Array(31).fill('')]);
  const original = h.rows[0][30]; h.rows[1][30] = ''; h.header[30] = ''; h.setCols(30);
  h.context.ensureCongViecSyncUidSchema(); h.context.ensureCongViecSyncUidSchema();
  assert.equal(h.protections.length, 1);
  assert.equal(h.protections[0].currentEditorKept, true);
  assert.equal(h.protections[0].domainEdit, false);
  assert.equal(h.context.backfillCongViecSyncUid().generated, 1);
  assert.equal(h.rows[0][30], original); assert.equal(h.rows[2][30], '');
  assert.equal(h.context.backfillCongViecSyncUid().generated, 0);
  assert(h.writes.every(write => write.c === 31));
  assert(h.writes.filter(write => write.values).every(write => write.r === 6 && write.values.length === 1));
});

test('duplicate and invalid UID block without silently regenerating', () => {
  const h = harness([task(), task('2')]); h.rows[1][30] = h.rows[0][30];
  assert(h.context.validateCongViecSyncUid().some(error => error.code === 'SYNC_UID_DUPLICATE'));
  assert.throws(() => h.context.backfillCongViecSyncUid());
  assert.equal(h.context.project360CongViecSyncWorker().status, 'BLOCKED_UID');
  assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0);
});

test('multi-row paste queues each UID; header/other sheet ignored; no edit HTTP', () => {
  const h = harness([task(), task('2')]);
  h.edit(4, 1); h.edit(5, 2, 'Other'); assert.equal(h.props.size, 6);
  h.edit(); assert(h.props.has('P360_SYNC_DIRTY_' + h.rows[0][30]));
  assert(h.props.has('P360_SYNC_DIRTY_' + h.rows[1][30])); assert.equal(h.requests.length, 0);
});

test('100 dirty rows produce one request; hashes are portable; no token logging', () => {
  const h = harness(Array.from({ length: 100 }, (_, i) => task(String(i + 1))));
  h.edit(); assert.equal(h.context.project360CongViecSyncWorker().status, 'SYNCED');
  assert.equal(h.requests.length, 1);
  const payload = JSON.parse(h.requests[0].options.payload);
  assert.equal(payload.rows.length, 100);
  const expected = crypto.createHash('sha256').update(JSON.stringify(h.rows[0].slice(0, 30))).digest('hex');
  assert.equal(payload.rows[0].rowHash, expected);
  assert(!Array.from(h.props.keys()).some(key => key.startsWith('P360_SYNC_DIRTY_')));
  assert(!h.logs.join('').includes('SECRET'));
  assert.equal(h.context.project360CongViecReconcile().status, 'UNCHANGED');
});

test('HTTP failure preserves queue and idempotency key across retry', () => {
  const h = harness(); h.edit(); h.setHttp(503);
  assert.equal(h.context.project360CongViecSyncWorker().status, 'RETRY');
  assert(h.props.has('P360_SYNC_DIRTY_' + h.rows[0][30]));
  const first = JSON.parse(h.requests[0].options.payload); h.setHttp(200);
  h.context.project360CongViecSyncWorker();
  const second = JSON.parse(h.requests[1].options.payload);
  assert.equal(first.requestId, second.requestId); assert.equal(first.sourceRevision, second.sourceRevision);
});

test('transport exception retains pending key and suppresses sensitive exception details', () => {
  const h = harness(); h.edit(); h.setAfterFetch(() => { throw new Error('SECRET request detail'); });
  assert.equal(h.context.project360CongViecSyncWorker().status, 'RETRY');
  const first = JSON.parse(h.requests[0].options.payload); h.setAfterFetch(null);
  assert.equal(h.context.project360CongViecSyncWorker().status, 'SYNCED');
  assert.equal(JSON.parse(h.requests[1].options.payload).requestId, first.requestId);
  assert(!h.logs.join('').includes('SECRET'));
});

test('ACK retains failed UIDs and edits occurring during an in-flight request', () => {
  const h = harness([task(), task('2')]); h.edit();
  h.setAck([h.rows[0][30]]);
  h.setAfterFetch(() => h.edit(5, 1));
  h.context.project360CongViecSyncWorker();
  assert(h.props.has('P360_SYNC_DIRTY_' + h.rows[0][30]));
  assert(h.props.has('P360_SYNC_DIRTY_' + h.rows[1][30]));
});

test('reconciliation detects missed/script edits and missing rows without deletion', () => {
  const h = harness([task(), task('2')]);
  h.context.project360CongViecSyncWorker();
  h.rows[0][7] = 'Script changed'; h.rows.pop();
  assert.equal(h.context.project360CongViecReconcile().status, 'SYNCED');
  assert.equal(h.requests.length, 2);
  assert.equal(JSON.parse(h.requests[1].options.payload).rows.length, 1);
  assert.equal(h.writes.length, 0);
});

test('missing UID acknowledgement clears only the captured deleted-row generation', () => {
  const h = harness([task(), task('2')]); h.edit();
  const deletedUid = h.rows[1][30]; h.rows.pop(); h.setMissingAck([deletedUid]);
  assert.equal(h.context.project360CongViecSyncWorker().status, 'SYNCED');
  assert(!h.props.has('P360_SYNC_DIRTY_' + deletedUid));
  assert.equal(h.writes.length, 0);
});

test('disabled worker and installer dormant; installer keeps existing triggers and is idempotent', () => {
  const h = harness(); h.props.set('P360_SYNC_ENABLED', 'false');
  h.props.delete('P360_SYNC_FILE_ID');
  assert.equal(h.context.project360CongViecSyncWorker().status, 'DISABLED');
  assert.throws(() => h.context.installProject360CongViecSyncTriggers());
  h.props.set('P360_SYNC_ENABLED', 'true'); h.triggers.push('xuLySuaScheduleEngineV1');
  h.props.set('P360_SYNC_FILE_ID', 'file');
  h.context.installProject360CongViecSyncTriggers(); h.context.installProject360CongViecSyncTriggers();
  assert.equal(h.triggers.length, 4); assert.equal(h.requests.length, 0);
});
