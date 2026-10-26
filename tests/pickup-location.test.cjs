const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(version = 11) {
  const elements = {
    'f-pickup-location': {value: ''}, 'f-pickup-auto': {checked: false},
    'f-departure': {value: '오션호텔'}, 'pickup-location-label': {textContent: ''}
  };
  const calls = [], alerts = [];
  const c = {window: {}, document: {getElementById: id => elements[id]}, navigator: {userAgent: `LOGRIT-Android/${version}`},
    db: [], prompt: (text) => { calls.push(JSON.parse(text.slice('LOGRIT_PICKUP:'.length))); return 'ready'; }, alert: text => alerts.push(text)};
  c.window.saveDraft = () => {};
  vm.createContext(c); vm.runInContext(fs.readFileSync('pickup-location.js','utf8'), c);
  return {c, elements, calls, alerts, w: c.window};
}
const place = {name: '오션호텔 · 부산 주소', departure: '오션호텔', lat:35.1,lng:129.1,auto:false};
test('manual check and TMAP navigation use exactly the selected coordinates', () => {
  const {w,calls} = setup(); w.setPickupLocation(place); w.checkPickupLocation(); w.navigatePickupLocation();
  assert.equal(calls.at(-2).action,'check'); assert.equal(calls.at(-1).action,'navigate');
  assert.equal(calls.at(-1).pickup.lat,35.1); assert.equal(calls.at(-1).pickup.lng,129.1);
});
test('changed pickup names invalidate saved coordinates and never navigate', () => {
  const {w,elements,calls,alerts} = setup(); w.setPickupLocation(place); elements['f-departure'].value='스테이온';
  w.navigatePickupLocation(); assert.equal(w.pickupEditorValue(),null); assert.equal(calls.length,1); assert.equal(alerts.length,1);
});
test('automatic sync sends enabled locations only; deletion sends an empty replacement', () => {
  const {w,c,calls} = setup();
  c.db=[{id:'a',departure:'오션호텔',date:'2026-10-27',time:'12:00',pickupLocation:{...place,auto:true}},
    {id:'b',departure:'오션호텔',pickupLocation:place}, {id:'c',departure:'다른호텔',pickupLocation:{...place,auto:true}}];
  w.syncPickupAlerts(); assert.deepEqual(Array.from(calls.at(-1).records,r=>r.id),['a']);
  c.db=[]; w.syncPickupAlerts(); assert.equal(calls.at(-1).records.length,0);
});
test('older Play app versions never invoke unsupported native commands', () => {
  const {w,calls,alerts} = setup(10); w.setPickupLocation(place); w.navigatePickupLocation();
  assert.equal(calls.length,0); assert.equal(alerts.length,1);
});
test('invalid and asynchronous obsolete address results cannot overwrite the current pickup', () => {
  const {w,elements} = setup(); w.setPickupLocation({...place,lat:NaN}); assert.equal(w.pickupEditorValue(),null);
  elements['f-departure'].value='스테이온'; w.logritPickupChosen(place); assert.equal(w.pickupEditorValue(),null);
});
