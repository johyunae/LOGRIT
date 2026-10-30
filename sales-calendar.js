/* Revenue calendar preview: enabled only by the debug Android app marker. */
(() => {
    const isTest = () => /\bLOGRIT-Test\b/.test(navigator.userAgent || '');
    const amount = r => Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0;
    const key = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    window.renderSalesCalendarPreview = (records, year, month) => {
        if (!isTest()) return '';
        const prefix = `${year}-${String(month+1).padStart(2,'0')}-`;
        const totals = new Map();
        for (const r of records) if (typeof r.date === 'string' && r.date.startsWith(prefix)) totals.set(r.date,(totals.get(r.date)||0)+amount(r));
        const first = new Date(year,month,1).getDay(), days = new Date(year,month+1,0).getDate();
        let cells = '', weekTotal = 0;
        for (let slot=0;slot<Math.ceil((first+days)/7)*7;slot++) {
            const day = slot-first+1;
            if (day<1 || day>days) cells += '<div aria-hidden="true"></div>';
            else {
                const date = key(year,month,day), total=totals.get(date)||0;
                weekTotal += total;
                const color = total<0 ? '#f87171' : 'var(--text-bold)';
                cells += `<button type="button" data-sales-date="${date}" onclick="window.openSalesCalendarDay(this.dataset.salesDate)" aria-label="${month+1}월 ${day}일 매출 ${total.toLocaleString('ko-KR')}원" style="min-width:0;min-height:64px;padding:6px 1px;border:1px solid var(--border-color);border-radius:6px;background:var(--sub-bg);text-align:center"><span style="display:block;font-size:12px;font-weight:700;color:${slot%7===0?'#f87171':slot%7===6?'#60a5fa':'var(--text-main)'}">${day}</span><span style="display:block;font-size:clamp(8px,2.1vw,11px);font-weight:800;white-space:nowrap;margin-top:7px;color:${color}">${totals.has(date)?total.toLocaleString('ko-KR'):'—'}</span></button>`;
            }
            if (slot%7===6) {
                const start=Math.max(1,slot-6-first+1),end=Math.min(days,day);
                cells += `<div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:6px 4px 10px;font-size:12px"><span style="color:var(--text-main)">${month+1}/${start}~${month+1}/${end} 주간 합계</span><strong style="color:${weekTotal<0?'#f87171':'var(--brand-color)'}">${weekTotal.toLocaleString('ko-KR')}원</strong></div>`;
                weekTotal=0;
            }
        }
        return `<section aria-label="테스트 매출 달력" style="margin:20px 12px 0"><h3 style="font-size:15px;font-weight:800;margin-bottom:8px">매출 달력 <span style="font-size:11px;color:var(--brand-color)">테스트</span></h3><p style="font-size:11px;color:var(--text-main);margin-bottom:12px">날짜별 금액 · 단위 원 · 주간 합계는 이번 달 날짜만 합산</p><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px">${['일','월','화','수','목','금','토'].map(d=>`<div style="text-align:center;font-size:11px;padding:4px">${d}</div>`).join('')}${cells}</div></section>`;
    };
    window.openSalesCalendarDay = date => {
        if (!isTest() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const items=db.filter(r=>r.date===date && amount(r)!==0);
        document.getElementById('sales-day-preview')?.remove();
        const overlay=document.createElement('div'); overlay.id='sales-day-preview';
        overlay.style.cssText='position:fixed;inset:0;z-index:260;background:#0009;display:flex;align-items:center;justify-content:center;padding:20px';
        const card=document.createElement('div');card.style.cssText='background:var(--modal-bg);color:var(--text-bold);width:100%;max-width:440px;max-height:75vh;overflow:auto;border-radius:20px;padding:20px';
        const title=document.createElement('h3');title.textContent=`${date} 매출`;title.style.cssText='font-weight:800;font-size:18px;margin-bottom:16px';card.append(title);
        if (!items.length) {const empty=document.createElement('p');empty.textContent='매출 내역이 없습니다.';card.append(empty);}
        for (const r of items) {const row=document.createElement('div');row.style.cssText='padding:12px 0;border-bottom:1px solid var(--border-color);font-size:14px';row.textContent=`${r.time||''} ${r.supplier||'기타'} · ${amount(r).toLocaleString('ko-KR')}원`;card.append(row);}
        const sum=document.createElement('p');sum.textContent=`합계 ${items.reduce((n,r)=>n+amount(r),0).toLocaleString('ko-KR')}원`;sum.style.cssText='font-weight:800;margin:16px 0';card.append(sum);
        const close=document.createElement('button');close.type='button';close.textContent='닫기';close.className='btn-primary w-full';close.onclick=()=>overlay.remove();card.append(close);overlay.append(card);overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};document.body.append(overlay);close.focus();
    };
})();
