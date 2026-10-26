const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const code = html.slice(html.indexOf('        function validateSingleScheduleBackup'), html.indexOf('        window.exportLogritData'));
const applyCode = html.slice(html.indexOf('        async function applyLogritBackup'), html.indexOf('        window.resetLogritData'));
const record = { id: '12345', date: '2026-10-15', time: '09:30', supplier: '한글 거래처',
  departure: '공항', arrival: '호텔', amount: -30000, people: 3, note: '예약 메모\n두 번째 줄',
  color: '#ff0000', importLinkId: '', cardPaymentDone: true, cardPaymentAmount: 5000,
  paymentCheckKey: 'custom:카시트', paymentCheckLabel: '1베이비 카시트', paymentCheckHidden: false, extraChecks: [{label:'왕복',done:true},{label:'카시트',done:false}], updatedAt: 12345 };
function app(records = [], options = {}) {
  let saved, download, photos = 0;
  const context = vm.createContext({ console, Date, Math, Set, JSON, encodeURIComponent, localStorage: {
    setItem(key, value) { if (options.quota) throw new Error('quota'); saved = JSON.parse(value); },
    getItem() { return JSON.stringify(records); }, removeItem() {} },
    confirm: () => options.confirm !== false, render() {}, showToast() {}, window: {},
    writeCalendarPhotos: async () => { photos++; }, loadCalendarPhotoIndex: async () => {},
    document: { createElement() { const attrs = {}; return { setAttribute(k,v) { attrs[k]=v; },
      click() { download = JSON.parse(decodeURIComponent(attrs.href.split(',')[1])); }, remove() {} }; }, body: { appendChild() {} } }
  });
  vm.runInContext(`const STORAGE_KEY = 'test'; let db = ${JSON.stringify(records)}; let currentEditId = '12345';`, context);
  vm.runInContext(html.slice(html.indexOf('        function getExtraChecks'), html.indexOf('        function extraEditorChecks')) + code + applyCode, context);
  return { context, value: () => JSON.parse(vm.runInContext('JSON.stringify(db)', context)),
    saved: () => saved, download: () => download, photos: () => photos };
}
const backup = value => ({ format: 'logrit-schedule-backup', version: 1, records: [value] });
test('exports exactly the selected saved schedule, with every field intact', () => {
  const a = app([record, {...record, id: 'other', note: '다른 일정'}]);
  a.context.window.exportSingleSchedule();
  assert.deepEqual(a.download().records, [record]);
});
test('single restore preserves other schedules and calendar photos; repeating is idempotent', async () => {
  const other = {...record, id: 'other', note: '기존 일정'};
  const a = app([other]);
  await a.context.applyLogritBackup(backup(record));
  assert.deepEqual(a.value(), [other, record]);
  await a.context.applyLogritBackup(backup(record));
  assert.equal(a.value().length, 2);
  assert.equal(a.photos(), 0);
});
test('ID collision adds a separate schedule without replacing the existing one', async () => {
  const existing = {...record, note: '기존 수정본'};
  const a = app([existing]); await a.context.applyLogritBackup(backup(record));
  assert.deepEqual(a.value()[0], existing);
  assert.notEqual(a.value()[1].id, record.id);
  assert.equal(a.value()[1].note, record.note);
});
test('cancel, invalid payload, and quota failure leave records unchanged', async () => {
  const cancel = app([], {confirm:false});
  assert.equal(await cancel.context.applyLogritBackup(backup(record)), null);
  assert.deepEqual(cancel.value(), []);
  for (const payload of [backup({...record,date:'2026-02-30'}), backup({...record,amount:'bad'}),
    {...backup(record),records:[record,record]}, {...backup(record),version:2}]) {
    const a=app([]); await assert.rejects(a.context.applyLogritBackup(payload)); assert.deepEqual(a.value(), []);
  }
  const a=app([], {quota:true}); await assert.rejects(a.context.applyLogritBackup(backup(record)));
  assert.deepEqual(a.value(), []);
});
test('legacy full backups still use the existing restore path', async () => {
  const a=app([]); await a.context.applyLogritBackup([record]);
  assert.deepEqual(a.value(), [record]);
});

test('pickup coordinates survive a single-schedule backup and invalid coordinates are rejected', async () => {
  const location = {name:'승차장',lat:35.1,lng:129.1,departure:record.departure,auto:true};
  const a=app([]); await a.context.applyLogritBackup(backup({...record,pickupLocation:location}));
  assert.deepEqual(a.value()[0].pickupLocation, location);
  const b=app([]); await assert.rejects(b.context.applyLogritBackup(backup({...record,pickupLocation:{...location,lat:100}})));
  assert.deepEqual(b.value(), []);
});
