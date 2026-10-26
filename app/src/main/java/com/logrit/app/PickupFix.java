package com.logrit.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** One bounded, fresh location request. Never treats stale or coarse fixes as arrival. */
final class PickupFix {
    static Runnable request(Context context, Consumer<Location> callback) {
        Handler main = new Handler(Looper.getMainLooper());
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        AtomicBoolean done = new AtomicBoolean();
        LocationListener[] listener = new LocationListener[1];
        Runnable[] timeout = new Runnable[1];
        Consumer<Location> finish = fix -> {
            if (!done.compareAndSet(false, true)) return;
            main.removeCallbacks(timeout[0]);
            try { manager.removeUpdates(listener[0]); } catch (Exception ignored) {}
            callback.accept(fix);
        };
        listener[0] = new LocationListener() {
            @Override public void onLocationChanged(Location fix) {
                long age = (SystemClock.elapsedRealtimeNanos() - fix.getElapsedRealtimeNanos()) / 1000000L;
                if (age >= 0 && age <= 60000 && fix.hasAccuracy()) finish.accept(fix);
            }
            @Override public void onStatusChanged(String p, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String p) {}
            @Override public void onProviderDisabled(String p) {}
        };
        timeout[0] = () -> finish.accept(null);
        main.post(() -> {
            if (done.get()) return;
            if (manager == null || context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                finish.accept(null); return;
            }
            boolean started = false;
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                try {
                    if (manager.isProviderEnabled(provider)) {
                        manager.requestLocationUpdates(provider, 0, 0, listener[0], Looper.getMainLooper());
                        started = true;
                    }
                } catch (Exception ignored) {}
            }
            if (started) main.postDelayed(timeout[0], 25000); else finish.accept(null);
        });
        return () -> main.post(() -> finish.accept(null));
    }
    static String describe(Location fix, double lat, double lng, String name) {
        if (fix == null || !fix.hasAccuracy() || fix.getAccuracy() > 100) return name + ": 현재 위치를 정확히 확인할 수 없습니다. 위치 설정과 주변 환경을 확인해 주세요.";
        float[] result = new float[1];
        Location.distanceBetween(lat, lng, fix.getLatitude(), fix.getLongitude(), result);
        float distance = result[0], accuracy = fix.getAccuracy();
        if (distance + accuracy <= 100) return name + " 근처입니다. 호텔 이름과 승차장을 한 번 더 확인해 주세요.";
        if (distance - accuracy > 100) return name + "에서 약 " + Math.round(distance) + "미터 떨어져 있습니다. 픽업 장소를 확인해 주세요.";
        return name + "에서 약 " + Math.round(distance) + "미터입니다. 위치 오차 때문에 근처인지 확실하지 않습니다.";
    }
}
