const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const photoCode = html.slice(html.indexOf('        let calendarPhotoIndex'), html.indexOf('        function validCalendarPhotoData'));
function app() {
    const nodes = {'memo-photo-section': {}, 'f-date': {value:'2026-10-23'}, 'memo-photo-add': {}, 'memo-photo-list': {}, 'calendar-photo-input': {click(){}}};
    const c = vm.createContext({console, Date, Math, navigator:{userAgent:'Android'}, db:[],
        document:{getElementById:id=>nodes[id]}, render(){}, showToast(){},
        paymentAttribute:value=>String(value), rows:[], saved:[]});
    vm.runInContext('window=globalThis;',c);
    vm.runInContext(photoCode,c);
    vm.runInContext(`readCalendarPhotos = async () => rows; writeCalendarPhotos = async rows => { saved = rows; }; prepareCalendarPhoto = async (file,date) => ({id:file.name,date,thumbnail:'data',createdAt:1});`,c);
    return {c,nodes,run:code=>vm.runInContext(code,c)};
}
test('a new schedule never inherits same-day photos; editing shows only its own photos',()=>{
    const a=app();a.run(`calendarPhotoIndex=[{id:'legacy',date:'2026-10-23',thumbnail:'old'},{id:'a',date:'2026-10-23',recordId:'first',thumbnail:'a'},{id:'b',date:'2026-10-23',recordId:'second',thumbnail:'b'}]; currentPhotoRecordId='new'; refreshMemoPhotos();`);
    assert.ok(a.nodes['memo-photo-list'].innerHTML.includes('사진을 추가하면'));
    a.run(`currentPhotoRecordId='first'; refreshMemoPhotos();`);
    assert.ok(a.nodes['memo-photo-list'].innerHTML.includes('data-photo-id="a"'));
    assert.ok(!a.nodes['memo-photo-list'].innerHTML.includes('data-photo-id="b"'));
    assert.ok(!a.nodes['memo-photo-list'].innerHTML.includes('data-photo-id="legacy"'));
});
test('existing unassigned photos remain in the calendar and linked photos follow schedule dates',()=>{
    const a=app();a.run(`calendarPhotoIndex=[{id:'legacy',date:'2026-10-23'},{id:'a',date:'2026-10-23',recordId:'first'}]; db=[{id:'first',date:'2026-10-28'}];`);
    assert.equal(a.run(`photosForDate('2026-10-23').map(x=>x.id).join(',')`),'legacy');
    assert.equal(a.run(`photosForDate('2026-10-28').map(x=>x.id).join(',')`),'a');
});
test('uploads retain the originating schedule, and reloading the index keeps that ownership',async()=>{
    const a=app();a.run(`calendarPhotoTargetDate='2026-10-23'; calendarPhotoTargetRecordId='first'; currentPhotoRecordId='second';`);
    await a.c.handleCalendarPhotoUpload({target:{files:[{name:'photo1'}],value:'selected'}});
    assert.equal(a.run('saved[0].recordId'),'first');
    a.run('rows=saved');await a.c.loadCalendarPhotoIndex();
    assert.ok(a.run(`renderMemoPhotoCards('first')`).includes('photo1'));
    assert.equal(a.run(`renderMemoPhotoCards('second')`),'');
});
test('draft and save share the reserved schedule id so photos survive recovery',()=>{
    const a=app();let draft;
    a.c.localStorage={setItem:(key,value)=>{draft=JSON.parse(value);}};
    a.c.refreshCardPaymentEditor=()=>{};a.c.extraEditorChecks=()=>[];
    a.run(`currentEditId=null; currentPhotoRecordId='record-draft';`);
    vm.runInContext(html.slice(html.indexOf('        window.saveDraft ='),html.indexOf('        window.swapRoute')),a.c);
    a.c.saveDraft();assert.equal(draft.photoRecordId,'record-draft');
    for (const id of ['f-amount-display','f-supplier','f-note','f-time','f-departure','f-arrival','f-people','f-color','f-import-link-id']) a.nodes[id]={value:''};
    a.nodes['f-card-payment-done']={checked:false};a.nodes['modal-container']={remove(){}};
    a.c.localStorage.removeItem=()=>{};a.c.sync=()=>{};
    a.c.paymentEditorValues=()=>({});a.c.getRecordPayment=()=>null;
    vm.runInContext(html.slice(html.indexOf('        window.saveRecord ='),html.indexOf('        window.deleteItemDirect')),a.c);
    a.c.saveRecord({preventDefault(){}});
    assert.equal(a.run('db[0].id'),draft.photoRecordId);
});
test('schedule thumbnails show only that schedule and legacy photos stay available for assignment',()=>{
    const a=app();a.run(`calendarPhotoIndex=[{id:'legacy',date:'2026-10-23',thumbnail:'old'},{id:'a',date:'2026-10-23',recordId:'first',thumbnail:'a'},{id:'b',date:'2026-10-23',recordId:'second',thumbnail:'b'}]; db=[{id:'first',date:'2026-10-23'},{id:'second',date:'2026-10-23'}];`);
    const first=a.run(`renderSchedulePhotos('first')`);
    assert.ok(first.includes('data-photo-id="a"'));
    assert.ok(!first.includes('data-photo-id="b"'));
    assert.ok(!first.includes('data-photo-id="legacy"'));
    const unassigned=a.run(`renderUnassignedPhotos('2026-10-23')`);
    assert.ok(unassigned.includes('src="old"'));
    assert.ok(!unassigned.includes('src="a"'));
});
test('assigning an old photo preserves its image and moves it below the selected schedule',async()=>{
    const a=app();a.run(`db=[{id:'first',date:'2026-10-23'},{id:'second',date:'2026-10-23'}]; rows=[{id:'legacy',date:'2026-10-23',thumbnail:'thumb',image:'full',createdAt:123}]; writeCalendarPhotos=async values=>{saved=values;rows=values;};`);
    await a.c.assignCalendarPhoto('legacy','second');
    assert.equal(a.run('saved[0].image'),'full');
    assert.equal(a.run('saved[0].recordId'),'second');
    assert.equal(a.run(`renderSchedulePhotos('first')`),'');
    assert.ok(a.run(`renderSchedulePhotos('second')`).includes('legacy'));
    assert.equal(a.run(`renderUnassignedPhotos('2026-10-23')`),'');
});
