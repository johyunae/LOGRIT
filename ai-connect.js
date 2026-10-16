/* User-authorized bridge to the private schedule server. No credentials in GitHub. */
(() => {
 const SERVER='https://logrit-ai-connect.rich-smile-6282.chatgpt.site';
 const META='logrit_ai_sync_v1',BACKUPS='logrit_ai_sync_backups_v1';
 let bridge=null,channel='',ready=false,busy=false,enabled=false,sequence=0;
 const pending=new Map();
 const project=r=>({date:String(r.date||''),time:String(r.time||''),departure:String(r.departure||''),arrival:String(r.arrival||''),people:Number(r.people||0),note:String(r.note||''),mission:String(r.mission||''),completed:r.completed===true,amount:Number(r.amount||0),supplier:String(r.supplier||'')});
 const fingerprint=r=>JSON.stringify(project(r));
 function metadata(){try{return JSON.parse(localStorage.getItem(META)||'{"links":{}}')}catch{return {links:{}}}}
 function status(text){const el=document.getElementById('logrit-ai-status');if(el)el.textContent=text;}
 function request(action,extra={}){
  if(!ready||!bridge||bridge.closed)return Promise.reject(new Error('설정에서 AI 연결을 다시 열어주세요.'));
  const id=String(++sequence);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('연결 응답이 없습니다. 다시 연결해주세요.'))},45000);pending.set(id,{resolve,reject,timer});bridge.postMessage({kind:'logrit-request',channel,id,action,...extra},SERVER)});
 }
 window.addEventListener('message',event=>{
  if(event.origin!==SERVER||event.source!==bridge||event.data?.channel!==channel)return;
  if(event.data.kind==='logrit-ready'){
   if(!enabled)return;
   const first=!ready;ready=true;if(first){status('일정 동기화 중…');synchronize().catch(report)}return;
  }
  if(event.data.kind!=='logrit-response')return;
  const call=pending.get(event.data.id);if(!call)return;pending.delete(event.data.id);clearTimeout(call.timer);
  if(event.data.error)call.reject(new Error(event.data.error));else call.resolve(event.data.result);
 });
 function report(error){status(error.message);showToast(error.message);}
 function backup(records){let old=[];try{old=JSON.parse(localStorage.getItem(BACKUPS)||'[]')}catch{};old.unshift({at:new Date().toISOString(),records});localStorage.setItem(BACKUPS,JSON.stringify(old.slice(0,3)));}
 function plan(records,remote,meta){
  const links=meta.links||{},byId=new Map(remote.map(r=>[r.id,r])),byKey=new Map(remote.map(r=>[r.requestKey,r]));
  const next=[],uploads=[],nextLinks={...links},seen=new Set();
  for(const local of records){
   const id=String(local.id),link=links[id];const cloud=link?byId.get(link.remoteId):byKey.get('logrit-backup:'+id);
   if(!cloud){if(link)throw new Error('연결된 일정이 서버에 없습니다. 자동 덮어쓰기를 중단했습니다.');next.push({...local});uploads.push({id,local,revision:null,remoteId:null});continue;}
   seen.add(cloud.id);
   const current=fingerprint(local),other=fingerprint(cloud);
   let base=link?.fingerprint;
   if(!base&&cloud.originalJson){try{base=fingerprint(JSON.parse(cloud.originalJson))}catch{}}
   const localChanged=base?current!==base:current!==other;
   const remoteChanged=base?other!==base:true;
   if(localChanged&&remoteChanged&&current!==other)throw new Error(`${local.date} ${local.time||''} 일정이 양쪽에서 변경됐습니다. 자동 덮어쓰기를 중단했습니다.`);
   if(cloud.deleted){if(localChanged)throw new Error('삭제된 일정에 새 수정이 있어 동기화를 중단했습니다.');continue;}
   if(localChanged&&current!==other){next.push({...local});uploads.push({id,local,revision:cloud.revision,remoteId:cloud.id});}
   else {next.push({...local,...project(cloud),updatedAt:Date.parse(cloud.updatedAt)||Date.now()});nextLinks[id]={remoteId:cloud.id,revision:cloud.revision,fingerprint:other};}
  }
  for(const cloud of remote){
   if(seen.has(cloud.id)||cloud.deleted)continue;
   // A linked local deletion is never silently restored or propagated.
   if(Object.values(links).some(link=>link.remoteId===cloud.id))continue;
   let original={};try{original=JSON.parse(cloud.originalJson||'{}')}catch{}
   const id=cloud.requestKey.startsWith('logrit-backup:')?cloud.requestKey.slice(14):'ai_'+cloud.id;
   if(next.some(r=>String(r.id)===id))throw new Error('일정 ID가 겹쳐 동기화를 중단했습니다.');
   next.push({...original,...project(cloud),id,updatedAt:Date.parse(cloud.updatedAt)||Date.now()});
   nextLinks[id]={remoteId:cloud.id,revision:cloud.revision,fingerprint:fingerprint(cloud)};
  }
  return {next,uploads,nextLinks};
 }
 async function synchronize(){
  if(!enabled||busy||!ready)return;busy=true;
  try{
   const before=JSON.stringify(db),records=JSON.parse(before),meta=metadata();
   const snapshot=await request('snapshot');
   if(meta.ownerId&&meta.ownerId!==snapshot.ownerId)throw new Error('이전에 연결한 계정과 다릅니다. 동기화를 중단했습니다.');
   const work=plan(records,snapshot.rows,meta);
   // Fail before uploading if any of the local records is outside the supported schema.
   for(const {local} of work.uploads){const r=project(local);if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!/^$|^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)||!Number.isInteger(r.people)||r.people<0||r.people>999||!Number.isSafeInteger(r.amount)||r.note.length>5000||r.departure.length>200||r.arrival.length>200)throw new Error(`${r.date} 일정의 날짜·시간·인원·메모를 확인해주세요.`);}
   if(work.uploads.length||JSON.stringify(work.next)!==before)backup(records);
   for(const upload of work.uploads){
    if(!enabled)throw new Error('AI 연결을 중단했습니다.');
    if(JSON.stringify(db)!==before)throw new Error('입력 중인 변경이 있어 다음 동기화로 미뤘습니다.');
    const result=await request('put',{record:upload.local,revision:upload.revision,remoteId:upload.remoteId});
    work.nextLinks[upload.id]={remoteId:result.row.id,revision:result.row.revision,fingerprint:fingerprint(result.row)};
   }
   if(!enabled||JSON.stringify(db)!==before)throw new Error('입력 중인 변경이 있어 다음 동기화로 미뤘습니다.');
   const nextText=JSON.stringify(work.next),oldMeta=localStorage.getItem(META);
   try{localStorage.setItem(STORAGE_KEY,nextText);localStorage.setItem(META,JSON.stringify({ownerId:snapshot.ownerId,links:work.nextLinks}));}
   catch(e){localStorage.setItem(STORAGE_KEY,before);if(oldMeta==null)localStorage.removeItem(META);else localStorage.setItem(META,oldMeta);throw e;}
   db=work.next;
   if(!document.getElementById('modal-container')&&!document.getElementById('auto-input-modal'))render();
   status('AI 연결됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' 동기화');
  }finally{busy=false;}
 }
 window.connectLogritAI=()=>{
  if(location.origin!=='https://johyunae.github.io'){showToast('현재 앱의 연결 창 지원을 확인해야 합니다. 크롬의 기존 로그릿에서 먼저 연결해주세요.');return;}
  if(!confirm('이 로그릿의 일정 정보를 본인 전용 AI 서버와 연결할까요? 사진은 전송하지 않습니다. 기존 기록은 유지하고 동기화 전 사본을 보관합니다.'))return;
  channel=crypto.randomUUID();ready=false;enabled=true;
  bridge=window.open(SERVER+'/logrit-connect?channel='+encodeURIComponent(channel),'logrit_ai_connection');
  if(!bridge){enabled=false;showToast('연결 창이 차단됐습니다. 팝업 허용 후 다시 눌러주세요.');return;}
  status('연결 창에서 내 일정 연결 허용을 눌러주세요.');
 };
 window.disconnectLogritAI=async()=>{
  if(ready){try{await request('disable')}catch(e){report(new Error('이 기기 동기화는 중단합니다. 서버 AI 접근 해제는 연결 화면에서 확인해주세요.'))}}
  enabled=false;ready=false;
  if(bridge&&!bridge.closed)bridge.close();bridge=null;
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('연결을 끊었습니다.'));}pending.clear();status('AI 연결 꺼짐 · 휴대폰에 저장');
  showToast('이 기기의 AI 연결을 껐습니다.');
 };
 window.syncLogritAI=()=>{
  if(busy){showToast('일정을 동기화하고 있습니다. 잠시 기다려주세요.');return;}
  if(!enabled||!bridge||bridge.closed){window.connectLogritAI();return;}
  if(!ready){status('연결 창에서 내 일정 연결 허용을 눌러주세요.');showToast('열린 연결 창에서 내 일정 연결 허용을 먼저 눌러주세요.');try{bridge.focus();}catch{}return;}
  status('일정 동기화 중…');showToast('일정을 동기화합니다.');
  synchronize().catch(report);
 };
 setInterval(()=>{if(enabled&&ready&&bridge&&!bridge.closed&&!document.hidden&&!document.getElementById('modal-container'))synchronize().catch(report)},20000);
 window.addEventListener('focus',()=>{if(enabled&&ready)synchronize().catch(report)});

})();
