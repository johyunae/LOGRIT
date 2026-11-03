const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const booking=require('../booking-image.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function gridImage(rowCount=2) {
    const width=1361,height=49+98*rowCount;
    const pixels=new Uint8ClampedArray(width*height*4).fill(255);
    const xs=[0,77,149,237,309,508,696,897,969,1066,1227,1360];
    const ys=[0,48,...Array.from({length:rowCount},(_,i)=>Math.min(height-1,146+98*i))];
    const dark=(x,y)=>{const p=(y*width+x)*4;pixels[p]=pixels[p+1]=pixels[p+2]=0;};
    xs.forEach(x=>{for(let y=0;y<height;y++)dark(x,y);});
    ys.forEach(y=>{for(let x=0;x<width;x++)dark(x,y);});
    return {pixels,width,height};
}
function geometry(n) {const g=gridImage(n);return booking.detectTable(g.pixels,g.width,g.height);}
function parser() {
    const ctx=vm.createContext({Date});
    vm.runInContext(html.slice(html.indexOf('        function readBookingDate'),html.indexOf('        window.parseAutoInputText')),ctx);
    return ctx;
}
const cells=(overrides={})=>Object.assign(['12-Dec','SAT','07:00','4',"Alexandre MILENKOVIC family (010-5175-6630)",'Mijin Tower Palace','Busan International Airport','KE1406','','DRIVER TO IGNORE','HL'],overrides);
function row(overrides={}) {const c=parser();return booking.rowBooking(cells(overrides),'2026-11-03','',c.readBookingDate,c.koreanBookingPlace,c.bookingAirportTerminal);}
test('the 11-column screenshot splits into two isolated data rows, excluding the header',()=>{
    const grid=geometry(2);assert.equal(grid.rows.length,2);assert.equal(grid.xs.length,12);
    assert.ok(grid.rows[0].top>grid.headerBottom);assert.ok(grid.rows[0].bottom<grid.rows[1].top);
});
test('many rows have no two-row limit; single-row and non-table images keep the existing import',()=>{
    assert.equal(geometry(9).rows.length,9);assert.equal(geometry(1),null);
    assert.equal(booking.detectTable(new Uint8ClampedArray(300*100*4).fill(255),300,100),null);
});
test('different row dates, routes, people and remarks stay separate across a year boundary',()=>{
    const c=parser(),first=row();
    const second=booking.rowBooking(cells({0:'1-Jan',2:'19:35',3:'5',5:'Busan International Airport',6:'Mijin Tower Palace',7:'KE1407',10:'SECOND ONLY'}),'2026-11-03',first.date,c.readBookingDate,c.koreanBookingPlace,c.bookingAirportTerminal);
    assert.equal(first.date,'2026-12-12');assert.equal(first.time,'07:00');assert.equal(first.people,'4');assert.equal(first.arrival,'국제 KE1406');
    assert.equal(second.date,'2027-01-01');assert.equal(second.time,'19:35');assert.equal(second.people,'5');assert.equal(second.departure,'KE1407');assert.equal(second.arrival,'Mijin Tower Palace');
    assert.ok(first.note.endsWith('HL'));assert.ok(!first.note.includes('SECOND ONLY'));assert.ok(!second.note.includes('HL'));assert.ok(!second.note.includes('DRIVER'));
    assert.equal(booking.validate([first,second]).length,2);
});
test('explicit years are respected; unreadable dates, people and flight numbers are left for correction',()=>{
    assert.equal(row({0:'1-Jan-2028'}).date,'2028-01-01');
    assert.equal(row({0:'not a date'}).date,'');assert.equal(row({3:'45 5'}).people,'');assert.equal(row({7:'KE1406 KE1407'}).arrival,'국제');
    assert.throws(()=>booking.validate([row({0:'31-Feb'})]),/날짜/);
    assert.throws(()=>booking.validate([row({2:'28:10'})]),/시간/);
    assert.throws(()=>booking.validate([row({3:''})]),/인원/);
    assert.throws(()=>booking.validate([]),/선택/);
});
test('retrying import skips existing rows and duplicate rows within the selected batch',()=>{
    const first=row(),second=row({2:'19:35'});
    assert.deepEqual(booking.freshRows([first,second,first],[first]),[second]);
});
test('OCR uses a separate crop for each cell and each row, keeping even failed rows for review',async()=>{
    const g=gridImage(3),c=parser(),crops=[],values=[];
    const targets=[0,2,3,4,5,6,7,10];
    for(let r=0;r<3;r++)for(const ci of targets)values.push(cells({0:r===0?'12-Dec':`${r}-Jan`,2:`0${7+r}:00`,10:`ROW ${r+1}`})[ci]);
    const original=global.document;
    global.document={createElement:()=>{
        const canvas={};canvas.getContext=()=>({drawImage:(...args)=>{if(args.length>3)crops.push(args.slice(1,5));},fillRect(){},getImageData:()=>({data:g.pixels.slice()}),putImageData(){}});return canvas;
    }};
    try {
        const worker={async setParameters(){},async recognize(){return {data:{text:values.shift()}};}};
        const rows=await booking.readRows({img:{width:g.width,height:g.height},worker,status:{},baseDate:'2026-11-03',parseDate:c.readBookingDate,place:c.koreanBookingPlace,terminal:c.bookingAirportTerminal});
        assert.equal(rows.length,3);assert.equal(crops.length,24);
        assert.ok(crops[0][1]+crops[0][3]<crops[8][1]);assert.ok(crops[8][1]+crops[8][3]<crops[16][1]);
        assert.ok(rows.every((row,i)=>row.note.endsWith(`ROW ${i+1}`)));assert.equal(rows[2].date,'2027-01-02');
    } finally {global.document=original;}
});
function saveApp(fail=false) {
    const nodes={'f-date':{value:'2026-11-03'},'modal-container':{remove(){}},'auto-input-modal':{remove(){}}};
    let stored;
    const c=vm.createContext({LogritBookingImage:booking,Date,db:[{id:'keep',date:'2026-01-01'}],currentEditId:null,currentPhotoRecordId:'draft',calendarPhotoIndex:[],STORAGE_KEY:'db',
        document:{getElementById:id=>nodes[id]},localStorage:{setItem(k,v){if(fail)throw Error('quota');stored=JSON.parse(v);},removeItem(){}},
        newPhotoRecordId:(()=>{let n=0;return ()=>`new-${++n}`;})(),extraEditorChecks:()=>[],render(){},showToast(){}});
    vm.runInContext('window=globalThis;'+html.slice(html.indexOf('        window.saveImageBookings ='),html.indexOf('        window.openAutoInputModal =')),c);
    return {c,nodes,stored:()=>stored};
}
test('batch save adds independent IDs, preserves existing records and skips repeated imports',()=>{
    const a=saveApp(),rows=[row(),row({2:'19:35'})];a.c.saveImageBookings(rows);
    const saved=a.stored();assert.equal(saved.length,3);assert.equal(saved[0].id,'keep');assert.notEqual(saved[1].id,saved[2].id);
    assert.equal(saved[1].supplier,'미지정');assert.equal(saved[1].amount,0);assert.equal(saved[1].people,4);
    a.c.saveImageBookings(rows);assert.equal(a.stored().length,3);
});
test('quota failure leaves DB and reviewable data intact; existing edit form is not replaced',()=>{
    const a=saveApp(true);assert.throws(()=>a.c.saveImageBookings([row()]),/quota/);assert.equal(a.c.db.length,1);
    const b=saveApp();b.c.currentEditId='keep';let removed=false;b.nodes['modal-container'].remove=()=>{removed=true;};
    b.c.saveImageBookings([row()]);assert.equal(removed,false);assert.equal(b.stored()[0].id,'keep');
});
function fakeDOM() {
    const nodes=[];
    function createElement(tag) {
        const node={tag,children:[],style:{},value:'',disabled:false,attributes:{},
            append(...children){this.children.push(...children);},appendChild(child){this.append(child);},
            setAttribute(k,v){this.attributes[k]=v;},focus(){},remove(){this.removed=true;}};
        nodes.push(node);return node;
    }
    return {nodes,document:{createElement,createTextNode:text=>({text}),getElementById:id=>nodes.find(n=>n.id===id && !n.removed),body:createElement('body')}};
}
test('review supports selection, corrections, cancellation and errors before saving',()=>{
    const dom=fakeDOM(),original=global.document;global.document=dom.document;
    try {
        let saved;booking.review([row(),row({2:'19:35'})],rows=>{saved=rows;});
        const form=dom.nodes.find(n=>n.tag==='form'),checkboxes=dom.nodes.filter(n=>n.type==='checkbox');
        checkboxes[1].checked=false;checkboxes[1].onchange();
        assert.equal(dom.nodes.find(n=>n.type==='submit').textContent,'선택한 1건 등록');
        const dates=dom.nodes.filter(n=>n.placeholder==='YYYY-MM-DD');dates[0].value='';
        form.onsubmit({preventDefault(){}});assert.equal(saved,undefined);
        assert.ok(dom.nodes.find(n=>n.attributes.role==='alert').textContent.includes('날짜'));
        dates[0].value='2026-12-13';form.onsubmit({preventDefault(){}});
        assert.equal(saved.length,1);assert.equal(saved[0].date,'2026-12-13');assert.ok(dom.document.getElementById('booking-image-review')===undefined);
        saved=undefined;booking.review([row(),row()],()=>{saved=true;});
        dom.nodes.filter(n=>n.tag==='button' && n.textContent==='닫기').at(-1).onclick();assert.equal(saved,undefined);
    } finally {global.document=original;}
});
test('empty memo default and numeric people do not defeat retry deduplication',()=>{
    const r={...row(),note:''};assert.equal(booking.freshRows([r],[{...r,note:'내용없음',people:4}]).length,0);
});
