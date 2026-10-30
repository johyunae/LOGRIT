const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../ai-connect.js'),'utf8').replace('})();','globalThis.api={plan,fingerprint};})();');
const context={window:{addEventListener(){}},setInterval(){}};
vm.createContext(context);vm.runInContext(source,context);
const {plan,fingerprint}=context.api;
const base={id:'local',date:'2026-10-16',time:'07:00',note:'original'};
const cloud={...base,id:'remote',requestKey:'logrit-backup:local',revision:2,deleted:true,originalJson:JSON.stringify(base)};
const incoming={id:'new',requestKey:'image-new',date:'2026-11-10',time:'19:35',departure:'KE1407',deleted:false};
const meta={links:{local:{remoteId:'remote',revision:1,fingerprint:fingerprint(base)}}};
test('deleted/edited conflict preserves local and remote while importing unrelated AI entry',()=>{
 const local={...base,note:'edited'};
 const result=plan([local],[cloud,incoming],meta);
 assert.equal(result.next.length,2);assert.equal(result.next[0].note,'edited');
 assert.equal(result.next[1].date,'2026-11-10');assert.equal(result.uploads.length,0);
 assert.equal(result.conflicts.length,1);assert.equal(result.nextLinks.local.revision,1);
 assert.equal(cloud.deleted,true);assert.equal(cloud.note,'original');
 const retry=plan(result.next,[cloud,incoming],{links:result.nextLinks});
 assert.equal(retry.next.length,2);assert.equal(retry.conflicts.length,1);
});
test('unchanged local follows remote deletion',()=>{
 const result=plan([base],[cloud],meta);assert.equal(result.next.length,0);assert.equal(result.conflicts.length,0);
});
test('two-sided edits remain preserved and do not block unrelated import',()=>{
 const result=plan([{...base,note:'local edit'}],[{...cloud,deleted:false,note:'remote edit'},incoming],meta);
 assert.equal(result.next[0].note,'local edit');assert.equal(result.next.length,2);assert.equal(result.uploads.length,0);assert.equal(result.conflicts.length,1);
});
