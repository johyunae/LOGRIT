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
