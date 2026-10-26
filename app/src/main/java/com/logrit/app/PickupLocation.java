package com.logrit.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.webkit.JsPromptResult;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.Locale;

final class PickupLocation {
    private final Activity activity;
    private final WebView view;
    private TextToSpeech speech;
    private boolean speechReady;
    private Runnable cancelFix;
    private JSONObject pendingCheck;
    private static final int LOCATION_PERMISSION = 2101, NOTIFICATION_PERMISSION = 2102;

    PickupLocation(Activity activity, WebView view) {
        this.activity = activity; this.view = view;
        speech = new TextToSpeech(activity, status -> {
            if (status == TextToSpeech.SUCCESS && speech != null) {
                int language = speech.setLanguage(Locale.KOREAN);
                speechReady = language >= TextToSpeech.LANG_AVAILABLE;
            }
        });
    }
    boolean handlePrompt(String url, String message, JsPromptResult result) {
        if (!message.startsWith("LOGRIT_PICKUP:")) return false;
        Uri origin = Uri.parse(url == null ? "" : url);
        Uri current = Uri.parse(view.getUrl() == null ? "" : view.getUrl());
        if (!"https".equals(origin.getScheme()) || !"johyunae.github.io".equals(origin.getHost())
                || !origin.getPath().startsWith("/LOGRIT/") || !"johyunae.github.io".equals(current.getHost())
                || !current.getPath().startsWith("/LOGRIT/")) { result.cancel(); return true; }
        try {
            JSONObject request = new JSONObject(message.substring("LOGRIT_PICKUP:".length()));
            String action = request.getString("action");
            if ("permissions".equals(action)) {
                boolean ready = automaticPermissions();
                result.confirm(ready ? "ready" : "pending");
            } else {
                result.confirm("ok");
                if ("choose".equals(action)) choose(request.optString("departure"), request.optString("role", "departure"));
                else if ("check".equals(action)) check(request.getJSONObject("pickup"));
                else if ("navigate".equals(action)) navigate(request.getJSONObject("pickup"), null);
                else if ("route".equals(action)) navigate(request.getJSONObject("destination"), request.getJSONObject("pickup"));
                else if ("sync".equals(action)) PickupWorker.sync(activity, request.getJSONArray("records"));
            }
        } catch (Exception e) { Toast.makeText(activity, "위치 요청을 처리하지 못했습니다.", Toast.LENGTH_LONG).show(); }
        return true;
    }
    private boolean fine() { return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED; }
    private boolean automaticPermissions() {
        if (!fine()) {
            new AlertDialog.Builder(activity).setTitle("픽업 장소 확인")
                .setMessage("일정의 픽업 장소와 현재 위치를 비교하려면 정확한 위치가 필요합니다. 위치 확인 버튼을 누르거나 자동 확인 시점에만 위치를 읽으며, 현재 위치는 서버에 저장하지 않습니다.")
                .setPositiveButton("계속", (d,w) -> activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION))
                .setNegativeButton("취소", null).show(); return false;
        }
        if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION); return false;
        }
        if (Build.VERSION.SDK_INT >= 29 && activity.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            new AlertDialog.Builder(activity).setTitle("자동 픽업 위치 확인")
                .setMessage("화면이 꺼져 있거나 티맵을 사용하는 동안에도 픽업 10분·5분 전에 위치를 비교하려면 위치 권한의 ‘항상 허용’이 필요합니다. 현재 위치는 서버에 보내거나 이력으로 보관하지 않습니다. 절전 설정에 따라 확인이 늦어질 수 있습니다. 설정 후 돌아와 자동 확인을 다시 켜 주세요.")
                .setPositiveButton("설정 열기", (d,w) -> activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName()))))
                .setNegativeButton("수동 확인만 사용", null).show(); return false;
        }
        if (!activity.getSystemService(android.app.NotificationManager.class).areNotificationsEnabled()) {
            new AlertDialog.Builder(activity).setMessage("자동 알림을 받으려면 앱 알림을 켜 주세요.")
                .setPositiveButton("설정 열기", (d,w) -> activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName()))))
                .setNegativeButton("취소", null).show(); return false;
        }
        return true;
    }
    void permissionsReturned(int code) {
        if (code == LOCATION_PERMISSION && pendingCheck != null) {
            JSONObject target = pendingCheck; pendingCheck = null;
            if (fine()) check(target); else message("정확한 위치 권한이 없어 현재 위치를 확인할 수 없습니다.");
        } else if (code == LOCATION_PERMISSION || code == NOTIFICATION_PERMISSION) {
            message("권한 설정 후 자동 위치 확인을 다시 켜 주세요.");
        }
    }
    private void choose(String departure, String role) {
        if (departure.length() > 200 || departure.trim().isEmpty()) return;
        EditText input = new EditText(activity);
        input.setSingleLine(true); input.setText(departure);
        new AlertDialog.Builder(activity).setTitle("호텔·승차장 주소 검색").setView(input)
            .setMessage("같은 이름의 장소가 있을 수 있으니 지역과 도로명 주소를 함께 확인해 주세요.")
            .setPositiveButton("검색", (d,w) -> {
                String query = input.getText().toString().trim();
                if (query.isEmpty() || query.length() > 300) return;
                Toast.makeText(activity, "주소를 찾고 있습니다.", Toast.LENGTH_SHORT).show();
                new Thread(() -> {
                    try {
                        List<Address> matches = new Geocoder(activity, Locale.KOREAN).getFromLocationName(query, 5);
                        activity.runOnUiThread(() -> {
                            if (activity.isFinishing() || activity.isDestroyed()) return;
                            if (matches == null || matches.isEmpty()) { message("주소를 찾지 못했습니다. 정확한 도로명 주소로 다시 검색해 주세요."); return; }
                            String[] names = new String[matches.size()];
                            for (int i=0;i<names.length;i++) names[i] = matches.get(i).getAddressLine(0);
                            new AlertDialog.Builder(activity).setTitle("픽업 장소의 정확한 주소 선택").setItems(names, (dialog, index) -> {
                                Address a = matches.get(index);
                                new AlertDialog.Builder(activity).setTitle("이 장소로 지정할까요?").setMessage(departure + "\n" + names[index])
                                    .setPositiveButton("지정", (confirm, which) -> {
                                        try {
                                            JSONObject p = new JSONObject().put("role", "arrival".equals(role) ? "arrival" : "departure").put("name", (departure + " · " + names[index]).substring(0, Math.min(300, (departure + " · " + names[index]).length()))).put("lat", a.getLatitude()).put("lng", a.getLongitude()).put("departure", departure).put("auto", false);
                                            view.evaluateJavascript("window.logritPickupChosen && window.logritPickupChosen(" + p + ")", null);
                                        } catch (Exception ignored) { message("위치를 지정하지 못했습니다."); }
                                    }).setNegativeButton("취소", null).show();
                            }).setNegativeButton("취소", null).show();
                        });
                    } catch (Exception e) { activity.runOnUiThread(() -> message("주소 검색을 사용할 수 없습니다. 네트워크를 확인하고 다시 시도해 주세요.")); }
                }, "pickup-address").start();
            }).setNegativeButton("취소", null).show();
    }
    static boolean valid(JSONObject p) {
        if (p == null) return false;
        double lat = p.optDouble("lat", Double.NaN), lng = p.optDouble("lng", Double.NaN);
        return Double.isFinite(lat) && Math.abs(lat) <= 90 && Double.isFinite(lng) && Math.abs(lng) <= 180 && !p.optString("name").isEmpty() && p.optString("name").length() <= 300;
    }
    private void check(JSONObject p) {
        if (!valid(p)) { message("픽업 장소를 먼저 지정해 주세요."); return; }
        if (!fine()) {
            pendingCheck = p;
            activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION); return;
        }
        if (cancelFix != null) { cancelFix.run(); cancelFix = null; }
        Toast.makeText(activity, "현재 위치를 확인합니다. 최대 25초 정도 걸릴 수 있습니다.", Toast.LENGTH_LONG).show();
        cancelFix = PickupFix.request(activity, fix -> {
            if (activity.isFinishing() || activity.isDestroyed()) return;
            String text = PickupFix.describe(fix, p.optDouble("lat"), p.optDouble("lng"), p.optString("name"));
            new AlertDialog.Builder(activity).setTitle("픽업 장소 확인").setMessage(text).setPositiveButton("확인", null)
                .setNeutralButton("티맵 길안내", (d,w) -> navigate(p, null)).show();
            if (speechReady) speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pickup-check");
        });
    }
    private void navigate(JSONObject p, JSONObject start) {
        if (!valid(p) || (start != null && !valid(start))) { message("출발지와 도착지의 위치를 먼저 지정해 주세요."); return; }
        Uri.Builder route = new Uri.Builder().scheme("tmap").authority("route")
            .appendQueryParameter("goalx", String.valueOf(p.optDouble("lng")))
            .appendQueryParameter("goaly", String.valueOf(p.optDouble("lat")))
            .appendQueryParameter("goalname", p.optString("name"))
            .appendQueryParameter("appname", "LOGRIT").appendQueryParameter("by", "CAR");
        if (start != null) route.appendQueryParameter("startx", String.valueOf(start.optDouble("lng")))
            .appendQueryParameter("starty", String.valueOf(start.optDouble("lat")))
            .appendQueryParameter("startname", start.optString("name"));
        Uri uri = route.build();
        try { activity.startActivity(new Intent(Intent.ACTION_VIEW, uri).setPackage("com.skt.tmap.ku")); }
        catch (ActivityNotFoundException e) {
            new AlertDialog.Builder(activity).setMessage("티맵을 찾을 수 없습니다. 설치 페이지를 열까요?")
                .setPositiveButton("설치 페이지", (d,w) -> {
                    try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.skt.tmap.ku"))); }
                    catch (ActivityNotFoundException ignored) { message("플레이 스토어에서 티맵을 설치해 주세요."); }
                }).setNegativeButton("취소", null).show();
        }
    }
    private void message(String text) {
        if (!activity.isFinishing() && !activity.isDestroyed()) new AlertDialog.Builder(activity).setMessage(text).setPositiveButton("확인", null).show();
    }
    void close() { if (cancelFix != null) cancelFix.run(); if (speech != null) speech.shutdown(); }
}
