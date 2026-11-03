/* Shared by image import and the row-isolation regression tests. */
(function (root) {
    'use strict';
    const fields = [
        ['date', '날짜', 'date'], ['time', '시간', 'time'], ['people', '인원', 'number'],
        ['departure', '출발지', 'text'], ['arrival', '도착지', 'text'], ['note', '메모', 'textarea']
    ];
    function lines(size, count, isDark) {
        const found = [];
        for (let p = 0; p < size; p++) {
            let dark = 0;
            for (let q = 0; q < count; q++) if (isDark(p, q)) dark++;
            if (dark / count >= .85) {
                if (!found.length || p - found[found.length - 1].end > 2) found.push({start:p, end:p});
                else found[found.length - 1].end = p;
            }
        }
        return found.map(line => Math.round((line.start + line.end) / 2));
    }
    function detectTable(pixels, width, height) {
        const dark = (x, y) => {
            const p = (y * width + x) * 4;
            return pixels[p + 3] > 100 && Math.max(pixels[p], pixels[p+1], pixels[p+2]) < 100;
        };
        const ys = lines(height, width, (y, x) => dark(x, y));
        const xs = lines(width, height, (x, y) => dark(x, y));
        // An unbordered outside edge is common in cropped screenshots.
        if (xs.length && xs[0] > 3) xs.unshift(0);
        if (xs.length && width - xs[xs.length-1] > 3) xs.push(width-1);
        if (ys.length && ys[0] > 3) ys.unshift(0);
        if (ys.length && height - ys[ys.length-1] > 3) ys.push(height-1);
        if (![11,12].includes(xs.length-1) || ys.length < 4) return null;
        const rows = ys.slice(1,-1).map((top, i) => ({top:top+2, bottom:ys[i+2]-2}));
        if (rows.some(row => row.bottom - row.top < 12)) return null;
        return {xs, rows, headerBottom:ys[1]};
    }
    function rowBooking(cells, baseDate, previousDate, parseDate, place, terminal) {
        let date = parseDate(cells[0], baseDate);
        const explicitYear = /20\d{2}/.test(cells[0]);
        // December -> January in a chronological table crosses the year boundary.
        if (!explicitYear && date && previousDate) {
            const oldMonth = Number(previousDate.slice(5,7));
            const month = Number(date.slice(5,7));
            const year = Number(previousDate.slice(0,4)) + (oldMonth >= 10 && month <= 2 ? 1 : 0);
            date = parseDate(cells[0], `${year}-01-01`);
        }
        const flight = (cells[7] || '').replace(/\s+/g,'').toUpperCase();
        const flightOK = /^(?:[A-Z][A-Z0-9]|[0-9][A-Z])\d{2,5}$/.test(flight) ? flight : '';
        const airport = value => /airport|공항|국제|국내/i.test(value);
        const timeMatch = (cells[2] || '').match(/^\s*([01]?\d|2[0-3])[:：]([0-5]\d)\s*$/);
        const people = /^\d{1,3}$/.test(cells[3]) ? cells[3] : '';
        return {
            date, sourceDate:cells[0], inferredYear:!explicitYear,
            time:timeMatch ? timeMatch[1].padStart(2,'0')+':'+timeMatch[2] : '', people,
            departure:airport(cells[5]) ? flightOK : place(cells[5]),
            arrival:airport(cells[6]) ? [terminal(cells[6]),flightOK].filter(Boolean).join(' ') : place(cells[6]),
            note:[cells[4],cells[10]].filter(Boolean).join('\n')
        };
    }
    async function readRows({img, worker, status, baseDate, parseDate, place, terminal}) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        ctx.drawImage(img,0,0);
        const grid = detectTable(ctx.getImageData(0,0,img.width,img.height).data,img.width,img.height);
        if (!grid) return null;
        const bookings = [];
        for (let r=0; r<grid.rows.length; r++) {
            const row = grid.rows[r], cells = Array(11).fill('');
            for (const ci of [0,2,3,4,5,6,7,10]) {
                if (status) status.textContent = `일정 ${r+1}/${grid.rows.length}건 읽는 중…`;
                const left=grid.xs[ci]+2, width=grid.xs[ci+1]-left-2, height=row.bottom-row.top;
                const scale=Math.min(4,2500/Math.max(width,height));
                const crop=document.createElement('canvas');
                crop.width=Math.ceil(width*scale)+32; crop.height=Math.ceil(height*scale)+32;
                const cropCtx=crop.getContext('2d');
                cropCtx.fillStyle='#fff';cropCtx.fillRect(0,0,crop.width,crop.height);
                cropCtx.drawImage(img,left,row.top,width,height,16,16,width*scale,height*scale);
                // Turn colored remarks into dark text, without pulling other rows into this crop.
                if (ci===10) {
                    const data=cropCtx.getImageData(0,0,crop.width,crop.height);
                    for(let p=0;p<data.data.length;p+=4){
                        const d=data.data, ink=Math.max(d[p],d[p+1],d[p+2])<160 || d[p]>110 && d[p]>d[p+1]*1.5 && d[p]>d[p+2]*1.4;
                        d[p]=d[p+1]=d[p+2]=ink?0:255;
                    }
                    cropCtx.putImageData(data,0,0);
                }
                await worker.setParameters({tessedit_pageseg_mode:[0,2,3,7].includes(ci)?'7':'6',
                    tessedit_char_whitelist:ci===2?'0123456789:：':ci===3?'0123456789':ci===7?'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ':''});
                const result=await worker.recognize(crop);
                cells[ci]=(result?.data?.text || '').replace(/\s+/g,' ').trim();
            }
            // Keep every detected row, even if OCR failed; the user can correct its blank fields.
            bookings.push(rowBooking(cells,baseDate,bookings[bookings.length-1]?.date,parseDate,place,terminal));
        }
        return bookings;
    }
    function validate(bookings) {
        if (!bookings.length) throw new Error('등록할 일정을 선택해 주세요.');
        bookings.forEach((row,index)=>{
            const d=new Date(row.date+'T12:00:00');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(d.getTime()) ||
                d.getFullYear()!==Number(row.date.slice(0,4)) || d.getMonth()+1!==Number(row.date.slice(5,7)) || d.getDate()!==Number(row.date.slice(8)))
                throw new Error(`${index+1}번째 일정의 날짜를 확인해 주세요.`);
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) throw new Error(`${index+1}번째 일정의 시간을 확인해 주세요.`);
            if (!row.departure.trim() || !row.arrival.trim()) throw new Error(`${index+1}번째 일정의 출발·도착지를 확인해 주세요.`);
            if (!/^\d{1,3}$/.test(String(row.people)) || Number(row.people)<1) throw new Error(`${index+1}번째 일정의 인원을 확인해 주세요.`);
        });
        return bookings;
    }
    function key(row) {
        return JSON.stringify([row.date,row.time,row.departure,row.arrival,String(Number(row.people)),/^(?:내용없음|내용 없음)$/.test(row.note)?'':row.note]
            .map(value=>String(value||'').trim().replace(/\s+/g,' ')));
    }
    function freshRows(rows, existing) {
        const seen=new Set(existing.map(key));
        return rows.filter(row=>{const k=key(row);if(seen.has(k))return false;seen.add(k);return true;});
    }
    function review(bookings, save) {
        document.getElementById('booking-image-review')?.remove();
        const overlay=document.createElement('div');
        overlay.id='booking-image-review';overlay.className='fixed inset-0 bg-black/70 z-[350] flex items-end';
        overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','이미지 일정 확인');
        const panel=document.createElement('div');panel.className='bg-modal text-important w-full max-w-md mx-auto rounded-t-3xl p-5';
        panel.style.cssText='max-height:92dvh;display:flex;flex-direction:column';overlay.appendChild(panel);
        const heading=document.createElement('div');heading.className='flex justify-between items-center mb-2';
        const title=document.createElement('h3');title.className='text-xl font-black';title.textContent=`이미지 일정 ${bookings.length}건`;
        const close=document.createElement('button');close.type='button';close.textContent='닫기';close.onclick=()=>overlay.remove();
        heading.append(title,close);panel.appendChild(heading);
        const help=document.createElement('p');help.className='text-sm text-dim mb-3';
        help.textContent='등록할 일정을 선택하고 날짜·시간·출발·도착을 확인해 주세요. 연도가 없는 날짜는 기준 연도로 표시하며, 12월 다음 1월은 다음 해로 표시합니다.';
        panel.appendChild(help);
        const form=document.createElement('form');form.style.cssText='display:flex;flex-direction:column;min-height:0';panel.appendChild(form);
        const list=document.createElement('div');list.style.cssText='overflow-y:auto;min-height:0';form.appendChild(list);
        const editors=bookings.map((booking,index)=>{
            const card=document.createElement('fieldset');card.className='border border-custom rounded-2xl p-3 mb-3';
            const legend=document.createElement('legend');const label=document.createElement('label');label.className='flex items-center gap-2 font-bold';
            const selected=document.createElement('input');selected.type='checkbox';selected.checked=true;selected.style.cssText='width:20px;height:20px';
            label.append(selected,document.createTextNode(`${index+1}번째 일정`));legend.appendChild(label);card.appendChild(legend);
            const source=document.createElement('p');source.className='text-xs text-dim mb-2';source.textContent=`원문 날짜: ${booking.sourceDate || '읽지 못함'}${booking.inferredYear?' · 연도 확인':''}`;card.appendChild(source);
            const inputs={};
            fields.forEach(([name,text,type])=>{
                const wrap=document.createElement('label');wrap.className='block text-sm mb-2';wrap.appendChild(document.createTextNode(text));
                const input=document.createElement(type==='textarea'?'textarea':'input');
                // Editable text also works in Android WebViews without a native date picker.
                if(type!=='textarea')input.type=type==='date'?'text':type;
                if(type==='date')input.placeholder='YYYY-MM-DD';
                if(type==='number'){input.min='1';input.max='999';}
                input.className='input-field';input.value=booking[name]||'';input.setAttribute('aria-label',`${index+1}번째 ${text}`);
                if(type==='textarea')input.rows=3;
                wrap.appendChild(input);card.appendChild(wrap);inputs[name]=input;
            });
            list.appendChild(card);return {selected,inputs};
        });
        const error=document.createElement('p');error.className='text-sm text-red-400 my-2';error.setAttribute('role','alert');form.appendChild(error);
        const submit=document.createElement('button');submit.type='submit';submit.className='btn-primary w-full shrink-0';
        const updateCount=()=>{submit.textContent=`선택한 ${editors.filter(editor=>editor.selected.checked).length}건 등록`;};
        editors.forEach(editor=>{editor.selected.onchange=updateCount;});updateCount();form.appendChild(submit);
        form.noValidate=true;
        form.onsubmit=event=>{
            event.preventDefault();if(submit.disabled)return;
            try {
                const selected=editors.filter(editor=>editor.selected.checked).map(editor=>Object.fromEntries(fields.map(([name])=>[name,editor.inputs[name].value.trim()])));
                validate(selected);submit.disabled=true;
                save(selected);overlay.remove();
            } catch(err) {error.textContent=err.message;submit.disabled=false;}
        };
        document.body.appendChild(overlay);close.focus();
    }
    const api={detectTable,rowBooking,readRows,validate,key,freshRows,review};
    if(typeof module!=='undefined' && module.exports)module.exports=api;
    else root.LogritBookingImage=api;
})(typeof window!=='undefined'?window:globalThis);
