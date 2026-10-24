const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('        function getCardPayment'),html.indexOf('        function renderItemCard'));
function app(){
 const nodes={'f-extra-checks':{value:'[]'},'f-extra-check-list':{},'f-note':{value:''},'f-payment-custom-label':{value:''},'f-payment-check-hidden':{value:'false'}};
 let answer='',saved=null;
 const c=vm.createContext({console,Date,JSON,db:[],STORAGE_KEY:'test',selectedDate:'2026-10-25',
 document:{getElementById:id=>nodes[id]},localStorage:{setItem:(k,v)=>{saved=JSON.parse(v)}},prompt:()=>answer,
 showToast(){},render(){},formatKRW:String});
 vm.runInContext('window=globalThis;',c);vm.runInContext(code,c);
 c.saveDraft=()=>{};
 return {c,nodes,answer:v=>answer=v,saved:()=>saved,checks:()=>JSON.parse(nodes['f-extra-checks'].value)};
}
test('multiple labels can be added, edited, checked and removed independently',()=>{
 const a=app();a.nodes['f-payment-custom-label'].value='왕복';
 a.answer('캐13');a.c.addPaymentCheck();a.answer('<카시트>');a.c.addPaymentCheck();
 a.c.changeExtraCheck(0,'toggle');assert.deepEqual(a.checks(),[{label:'캐13',done:true},{label:'<카시트>',done:false}]);
 a.answer('캐14');a.c.changeExtraCheck(0,'edit');assert.equal(a.checks()[0].done,true);
 assert.match(a.nodes['f-extra-check-list'].innerHTML,/&lt;카시트&gt;/);
 a.c.changeExtraCheck(0,'remove');assert.deepEqual(a.checks(),[{label:'<카시트>',done:false}]);
 a.answer(null);a.c.addPaymentCheck();assert.equal(a.checks().length,1);
});
test('adding first check preserves existing additional checks when primary was removed',()=>{
 const a=app();a.nodes['f-payment-check-hidden'].value='true';a.nodes['f-extra-checks'].value='[{"label":"캐13","done":true}]';
 a.answer('왕복');a.c.addPaymentCheck();assert.equal(a.nodes['f-payment-custom-label'].value,'왕복');assert.equal(a.checks()[0].done,true);
});
test('saved list toggles persist only the selected check and render even without a primary',()=>{
 const a=app();a.c.db=[{id:'one',paymentCheckHidden:true,extraChecks:[{label:'왕복',done:false},{label:'캐13',done:true}]},{id:'two',note:'보존'}];
 a.c.toggleExtraCheck('one',0);assert.equal(a.saved()[0].extraChecks[0].done,true);assert.equal(a.saved()[0].extraChecks[1].done,true);assert.equal(a.saved()[1].note,'보존');
 const output=a.c.renderCardPayment(a.c.db[0]);assert.match(output,/왕복/);assert.match(output,/캐13/);
});
