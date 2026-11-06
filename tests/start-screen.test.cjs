const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const startup=html.slice(html.indexOf('        let logritScreenReady'),html.indexOf('        let calendarPhotoIndex'));
const today=html.slice(html.indexOf('        window.goToToday ='),html.indexOf('        window.openSettings'));
function app(draft=null, session=new Map()){
 const handlers={}, state={modal:false,file:false,restored:null,saves:0,renders:0,imported:false};
 const context=vm.createContext({console,Date,JSON,setTimeout:f=>f(),requestAnimationFrame:f=>f(),
   addEventListener:(name,fn)=>{handlers[name]=fn;}, scrollY:0,
   scrollTo:(x,y)=>{state.scrollTop=y;},
   sessionStorage:{getItem:key=>session.get(key) ?? null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},
   searchTerm:'',filterMonth:null,selectedSearchColors:new Set(),
   currentNav:'settings',selectedDate:'2026-09-05',calContext:new Date(2026,8,1),logritImportLinksReady:false,
   getLocalToday:()=> '2027-01-01',localStorage:{getItem:()=>draft},render:()=>state.renders++,showToast:()=>{},
   loadCalendarPhotoIndex:async()=>{},applyTheme:()=>{},
   openEntryModal:(id,preset,data)=>{state.restored=data;state.modal=true;},
   document:{hidden:false,addEventListener:(name,fn)=>{handlers[name]=fn;},
     getElementById:id=>id==='modal-container'&&state.modal?{}:null,
     querySelector:()=>state.modal?{}:null}});
 vm.runInContext('window = globalThis; consumeLogritImportLink = () => false;',context);
 context.consumeLogritImportLink=()=>state.imported;
 context.handleDateTouch=date=>{context.selectedDate=date;};
 context.saveDraft=()=>state.saves++;
 vm.runInContext(today+startup,context);
 return {context,state,handlers};
}
test('normal launch expands today, including a year/month change',async()=>{
 const a=app();await a.context.onload();assert.equal(a.context.currentNav,'e_cal');
 assert.equal(a.context.selectedDate,'2027-01-01');assert.equal(a.context.calContext.getFullYear(),2027);assert.equal(a.context.calContext.getMonth(),0);
});
test('interrupted new and existing entries restore their fields rather than opening today',async()=>{
 for(const id of [null,'existing']){const draft={isOpen:true,id,date:'2026-09-10',note:'저장 전 내용',time:'04:20'};
 const a=app(JSON.stringify(draft));await a.context.onload();assert.deepEqual(a.state.restored,draft);
 a.context.document.hidden=true;a.handlers.visibilitychange();assert.equal(a.state.saves,1);
 a.context.document.hidden=false;a.handlers.visibilitychange();assert.equal(a.context.currentNav,'settings');}
});
test('returning from background in the schedule calendar opens today',async()=>{
 const a=app();await a.context.onload();a.context.currentNav='e_cal';a.context.selectedDate='2026-09-15';
 a.context.document.hidden=true;a.handlers.visibilitychange();a.context.document.hidden=false;a.handlers.visibilitychange();
 assert.equal(a.context.currentNav,'e_cal');assert.equal(a.context.selectedDate,'2027-01-01');
});
test('file chooser returns to its current screen',async()=>{
 const a=app();await a.context.onload();a.context.currentNav='settings';
 a.handlers.click({target:{matches:()=>true}});a.handlers.visibilitychange();assert.equal(a.context.currentNav,'settings');
});
test('import links keep their preview; malformed drafts fall back to today',async()=>{
 const a=app();a.state.imported=true;await a.context.onload();assert.equal(a.context.currentNav,'settings');
 const b=app('{');await b.context.onload();assert.equal(b.context.selectedDate,'2027-01-01');
});

test('record and sales screens survive both background return and a reload of the same session',async()=>{
 for(const nav of ['list','s_cal','sales_calendar']){
  const session=new Map(), a=app(null,session);await a.context.onload();
  Object.assign(a.context,{currentNav:nav,calContext:new Date(2026,9,1),searchTerm:'뉴새한',filterMonth:'2026-10',scrollY:380});
  a.context.selectedSearchColors.add('red');
  a.context.document.hidden=true;a.handlers.visibilitychange();
  a.context.document.hidden=false;a.handlers.visibilitychange();
  assert.equal(a.context.currentNav,nav);
  a.context.scrollY=420;a.handlers.pagehide();
  const b=app(null,session);await b.context.onload();
  assert.equal(b.context.currentNav,nav);
  assert.equal(b.context.calContext.getMonth(),9);
  assert.equal(b.context.searchTerm,'뉴새한');
  assert.equal(b.context.filterMonth,'2026-10');
  assert.deepEqual([...b.context.selectedSearchColors],['red']);
  assert.equal(b.state.scrollTop,420);
  const fresh=app();await fresh.context.onload();
  assert.equal(fresh.context.currentNav,'e_cal');
 }
});
