package com.logrit.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Persisted, best-effort 10/5-minute checks; Android can delay background work. */
public final class PickupWorker extends Worker {
    private Runnable cancelFix;
    public PickupWorker(Context context, WorkerParameters params) { super(context, params); }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pickup_alerts", Context.MODE_PRIVATE); }
    static synchronized void sync(Context context, JSONArray records) throws Exception {
        if (records.length() > 5000) throw new IllegalArgumentException("Too many schedules");
        SharedPreferences prefs = prefs(context);
        Set<String> previous = prefs.getStringSet("ids", new HashSet<>()), next = new HashSet<>();
        SharedPreferences.Editor editor = prefs.edit();
        WorkManager work = WorkManager.getInstance(context);
        long now = System.currentTimeMillis();
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT);
        format.setLenient(false);
        for (int i=0;i<records.length();i++) {
            JSONObject record = records.getJSONObject(i), p = record.optJSONObject("pickup");
            String id = record.optString("id"), date = record.optString("date"), time = record.optString("time");
            if (!id.matches("[A-Za-z0-9_-]{1,100}") || !date.matches("\\d{4}-\\d{2}-\\d{2}") || !time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d") || !PickupLocation.valid(p) || !p.optBoolean("auto")) continue;
            Date parsed;
            try { parsed = format.parse(date + " " + time); } catch (Exception e) { continue; }
            if (parsed == null || parsed.getTime() <= now) continue;
            String fingerprint = record.toString() + "|" + format.getTimeZone().getID();
            next.add(id);
            if (fingerprint.equals(prefs.getString("record:" + id, ""))) continue;
            // Publish the new generation before replacing jobs. Workers validate again after the fix.
            editor.putString("record:" + id, fingerprint);
            prefs.edit().putString("record:" + id, fingerprint).apply();
            for (int minutes : new int[]{10,5}) {
                String unique = "pickup:" + id + ":" + minutes;
                work.cancelUniqueWork(unique);
                long at = parsed.getTime() - TimeUnit.MINUTES.toMillis(minutes);
                if (at <= now) continue;
                Data data = new Data.Builder().putString("id", id).putString("fingerprint", fingerprint)
                    .putString("name", p.getString("name")).putDouble("lat", p.getDouble("lat")).putDouble("lng", p.getDouble("lng"))
                    .putLong("pickupAt", parsed.getTime()).putString("time", time).build();
                work.enqueueUniqueWork(unique, ExistingWorkPolicy.REPLACE, new OneTimeWorkRequest.Builder(PickupWorker.class)
                    .setInputData(data).setInitialDelay(at-now, TimeUnit.MILLISECONDS).build());
            }
        }
        for (String id : previous) if (!next.contains(id)) {
            editor.remove("record:" + id);
            work.cancelUniqueWork("pickup:" + id + ":10"); work.cancelUniqueWork("pickup:" + id + ":5");
        }
        editor.putStringSet("ids", next).apply();
    }
    private boolean current() {
        return !isStopped() && getInputData().getString("fingerprint").equals(prefs(getApplicationContext()).getString("record:" + getInputData().getString("id"), ""))
            && System.currentTimeMillis() <= getInputData().getLong("pickupAt",0);
    }
    @Override public Result doWork() {
        if (!current()) return Result.success();
        Context c = getApplicationContext();
        String name = getInputData().getString("name");
        String[] message = {name + ": 현재 위치를 확인할 수 없습니다. 앱에서 다시 확인해 주세요."};
        boolean permitted = c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            && (Build.VERSION.SDK_INT < 29 || c.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED);
        if (permitted) {
            CountDownLatch done = new CountDownLatch(1);
            cancelFix = PickupFix.request(c, fix -> {
                message[0] = PickupFix.describe(fix, getInputData().getDouble("lat",0), getInputData().getDouble("lng",0), name);
                done.countDown();
            });
            try { done.await(27, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            finally { if (cancelFix != null) cancelFix.run(); }
        } else message[0] = name + ": 위치 권한이 없어 자동 확인을 할 수 없습니다. 앱에서 확인해 주세요.";
        if (current()) notifyResult(message[0]);
        return Result.success();
    }
    private void notifyResult(String text) {
        Context c = getApplicationContext();
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || !nm.areNotificationsEnabled()) return;
        String channel = "pickup_location";
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel definition = new NotificationChannel(channel, "픽업 장소 확인", NotificationManager.IMPORTANCE_HIGH);
            definition.enableVibration(true); nm.createNotificationChannel(definition);
        }
        Intent open = new Intent(c, LauncherActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(c, getId().hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(getInputData().getString("time") + " 픽업 장소 확인")
            .setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(pending).setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        nm.notify(getInputData().getString("id").hashCode(), b.build());
    }
    @Override public void onStopped() { if (cancelFix != null) cancelFix.run(); }
}
