/* Resolve saved schedule labels to user-confirmed coordinates, then hand off to TMAP. */
(() => {
    const version = navigator.userAgent.match(/LOGRIT-Android\/(\d+)/);
    const supported = !!version && Number(version[1]) >= 11;
    const native = (action, data = {}) => {
        if (!supported) {
            if (action !== 'sync') alert('위치 확인은 로그릿 안드로이드 버전 11 이상으로 업데이트한 뒤 사용할 수 있습니다.');
            return null;
        }
        return prompt('LOGRIT_PICKUP:' + JSON.stringify({action, ...data}), '');
    };
    const valid = p => p && typeof p.lat === 'number' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && typeof p.lng === 'number' && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 300 && typeof p.departure === 'string';
    const PLACE_KEY = 'logrit_confirmed_places_v1';
    const cacheKey = label => label.trim().toLocaleLowerCase('ko-KR');
    const reusable = label => !/^[a-z]{2}\s?\d{2,4}$/i.test(label.trim());
    const remembered = label => {
        try {
            if (!reusable(label)) return null;
            const places = JSON.parse(localStorage.getItem(PLACE_KEY) || '{}'), key = cacheKey(label);
            const p = Object.prototype.hasOwnProperty.call(places, key) ? places[key] : null;
            return valid(p) ? {...p, departure:label, auto:false} : null;
        } catch (_) { return null; }
    };
    const remember = p => {
        if (!valid(p) || !reusable(p.departure)) return;
        try {
            const places = JSON.parse(localStorage.getItem(PLACE_KEY) || '{}');
            Object.defineProperty(places, cacheKey(p.departure), {value:{...p,auto:false},enumerable:true,writable:true,configurable:true});
            localStorage.setItem(PLACE_KEY, JSON.stringify(places));
        } catch (_) { alert('이번 일정에는 위치를 지정했습니다. 장소 연결을 기억할 저장 공간이 부족합니다.'); }
    };
    const labelFor = role => document.getElementById(role === 'arrival' ? 'f-arrival' : 'f-departure')?.value || '';
    let choosing = null;
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
        const panel = document.querySelector?.('[data-pickup-features]');
        if (panel) panel.hidden = !supported;
        const label = labelFor('departure');
        if (!valid(p) || p.departure !== label) p = remembered(label);
        input.value = JSON.stringify(p);
        document.getElementById('pickup-location-label').textContent = p ? '타는 곳: ' + p.name : '픽업 위치를 지정해 주세요';
        document.getElementById('f-pickup-auto').checked = !!p?.auto;
    };
    window.destinationEditorValue = () => {
        try {
            const p = JSON.parse(document.getElementById('f-destination-location')?.value || 'null');
            return valid(p) && p.departure === labelFor('arrival') ? {...p,auto:false} : null;
        } catch (_) { return null; }
    };
    window.setDestinationLocation = p => {
        const input = document.getElementById('f-destination-location');
        if (!input) return;
        const label = labelFor('arrival');
        if (!valid(p) || p.departure !== label) p = remembered(label);
        input.value = JSON.stringify(p);
        document.getElementById('destination-location-label').textContent = p ? '내리는 곳: ' + p.name : '도착지 위치를 지정해 주세요';
    };
    window.refreshRouteLocations = () => {
        window.setPickupLocation(window.pickupEditorValue());
        window.setDestinationLocation(window.destinationEditorValue());
        window.saveDraft();
    };
    window.clearPickupLocation = () => {
        try {
            const places = JSON.parse(localStorage.getItem(PLACE_KEY) || '{}');
            delete places[cacheKey(labelFor('departure'))]; localStorage.setItem(PLACE_KEY,JSON.stringify(places));
        } catch (_) {}
        document.getElementById('f-pickup-location').value = 'null';
        window.setPickupLocation(null); window.saveDraft();
    };
    const choose = role => {
        const departure = labelFor(role);
        if (!departure.trim()) return alert((role === 'arrival' ? '도착지' : '출발지') + '를 먼저 입력해 주세요.');
        choosing = {role, departure};
        native('choose', {departure,role});
    };
    window.choosePickupLocation = () => choose('departure');
    window.chooseDestinationLocation = () => choose('arrival');
    window.logritPickupChosen = p => {
        const role = p.role === 'arrival' ? 'arrival' : 'departure';
        if (!valid(p) || p.departure !== labelFor(role)) return;
        if (choosing && (choosing.role !== role || choosing.departure !== p.departure)) return;
        remember(p);
        if (role === 'arrival') window.setDestinationLocation(p); else window.setPickupLocation(p);
        window.saveDraft(); choosing = null;
    };
    window.navigateScheduleRoute = () => {
        const pickup = window.pickupEditorValue(), destination = window.destinationEditorValue();
        if (!pickup) { alert('처음 한 번 출발지의 정확한 주소를 연결해 주세요.'); return choose('departure'); }
        if (!destination) { alert('처음 한 번 도착지의 정확한 주소를 연결해 주세요.'); return choose('arrival'); }
        window.saveDraft(); native('route', {pickup,destination});
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
