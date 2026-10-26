/* Pickup coordinates stay on the device; only enabled schedules reach Android. */
(() => {
    const native = (action, data = {}) => {
        if (!/LOGRIT-Android\/(\d+)/.test(navigator.userAgent) || Number(RegExp.$1) < 11) {
            if (action !== 'sync') alert('위치 확인은 로그릿 안드로이드 버전 11 이상으로 업데이트한 뒤 사용할 수 있습니다.');
            return null;
        }
        return prompt('LOGRIT_PICKUP:' + JSON.stringify({action, ...data}), '');
    };
    const valid = p => p && typeof p.lat === 'number' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && typeof p.lng === 'number' && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 300 && typeof p.departure === 'string';
    window.pickupEditorValue = () => {
        try {
            const p = JSON.parse(document.getElementById('f-pickup-location')?.value || 'null');
            if (!valid(p) || p.departure !== document.getElementById('f-departure')?.value) return null;
            return {...p, auto: document.getElementById('f-pickup-auto')?.checked === true};
        } catch (_) { return null; }
    };
    window.setPickupLocation = p => {
        const input = document.getElementById('f-pickup-location');
        if (!input) return;
        if (!valid(p) || p.departure !== document.getElementById('f-departure')?.value) p = null;
        input.value = JSON.stringify(p);
        document.getElementById('pickup-location-label').textContent = p ? '타는 곳: ' + p.name : '픽업 위치를 지정해 주세요';
        document.getElementById('f-pickup-auto').checked = !!p?.auto;
    };
    window.clearPickupLocation = () => { window.setPickupLocation(null); window.saveDraft(); };
    window.choosePickupLocation = () => {
        const departure = document.getElementById('f-departure')?.value || '';
        if (!departure.trim()) return alert('출발지를 먼저 입력해 주세요. 공항 픽업은 편명과 별도로 승차장 위치를 지정해 주세요.');
        native('choose', {departure});
    };
    window.logritPickupChosen = p => {
        if (!document.getElementById('f-departure') || p.departure !== document.getElementById('f-departure').value) return;
        window.setPickupLocation(p); window.saveDraft();
    };
    window.navigatePickupLocation = () => {
        const pickup = window.pickupEditorValue();
        if (!pickup) return alert('픽업 위치를 먼저 지정해 주세요.');
        window.saveDraft();
        native('navigate', {pickup});
    };
    window.checkPickupLocation = () => {
        const pickup = window.pickupEditorValue();
        if (!pickup) return alert('픽업 위치를 먼저 지정해 주세요.');
        native('check', {pickup});
    };
    window.enablePickupAuto = checkbox => {
        if (!window.pickupEditorValue()) { checkbox.checked = false; return alert('픽업 위치를 먼저 지정해 주세요.'); }
        if (checkbox.checked && native('permissions') !== 'ready') checkbox.checked = false;
        window.saveDraft();
    };
    window.syncPickupAlerts = () => {
        const records = db.filter(r => valid(r.pickupLocation) && r.pickupLocation.auto && r.departure === r.pickupLocation.departure)
            .map(r => ({id: String(r.id), date: r.date, time: r.time, pickup: r.pickupLocation}));
        native('sync', {records});
    };
    window.syncPickupAlerts();
})();
