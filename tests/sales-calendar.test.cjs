const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('sales-calendar.js','utf8');
function render(ua,records,y,m){const c={window:{},navigator:{userAgent:ua},Date,Number,Map};vm.createContext(c);vm.runInContext(source,c);return c.window.renderSalesCalendar(records,y,m);}
test('calendar is available in the existing Android app',()=>{assert.match(render('LOGRIT-Android/6',[],2026,9),/매출 달력/);});
test('daily and weekly totals include corrections and exclude dates outside the month',()=>{
 const html=render('LOGRIT-Android/12 LOGRIT-Test',[{date:'2026-10-01',amount:300000},{date:'2026-10-01',amount:-50000},{date:'2026-10-03',amount:100000},{date:'2026-09-30',amount:999999},{date:'2026-11-01',amount:888888},{date:'2026-10-02',amount:'invalid'}],2026,9);
 assert.match(html,/250,000/);assert.match(html,/350,000원/);assert.doesNotMatch(html,/999,999|888,888|NaN/);
 assert.equal((html.match(/data-sales-date=/g)||[]).length,31);assert.equal((html.match(/주간 합계<\/span>/g)||[]).length,5);
});
test('leap years and six-row months retain every day',()=>{
 for(const [y,m,days,rows] of [[2028,1,29,5],[2026,7,31,6]]){const html=render('LOGRIT-Test',[],y,m);assert.equal((html.match(/data-sales-date=/g)||[]).length,days);assert.equal((html.match(/주간 합계<\/span>/g)||[]).length,rows);}
});

test('daily supplier totals, corrections, escaping, and month isolation',()=>{
 const records=[{date:'2026-11-01',supplier:'LSC',amount:100000},{date:'2026-11-01',supplier:'LSC',amount:50000},{date:'2026-11-01',supplier:'뉴새한',amount:80000},{date:'2026-11-02',supplier:'LSC',amount:-10000},{date:'2026-10-31',supplier:'다른달',amount:999999},{date:'2026-11-03',supplier:'무효',amount:'invalid'},{date:'2026-11-31',supplier:'잘못된날짜',amount:10}];
 const before=JSON.stringify(records), html=render('',records,2026,10).split('aria-label="일별 거래처 합계"')[1];
 for(const text of ['LSC','150,000원','뉴새한','80,000원','하루 합계','230,000원','-10,000원']) assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('150,000원')<html.indexOf('하루 합계'));
 assert.ok(html.indexOf('80,000원')<html.indexOf('하루 합계'));
 assert.equal(html.split('data-sales-summary-date=').length-1,2);
 for(const text of ['다른달','무효','잘못된날짜']) assert.ok(!html.includes(text));
 assert.equal(JSON.stringify(records),before);
 const zero=render('',[{date:'2026-11-01',supplier:'<img onerror="x">',amount:10},{date:'2026-11-01',supplier:' ',amount:-10}],2026,10).split('aria-label="일별 거래처 합계"')[1];
 assert.ok(zero.includes('&lt;img onerror=&quot;x&quot;&gt;'));
 assert.ok(!zero.includes('<img'));assert.ok(zero.includes('기타'));assert.ok(zero.includes('>0원'));
 assert.ok(render('',[],2026,10).includes('이번 달 매출 내역이 없습니다'));
});
