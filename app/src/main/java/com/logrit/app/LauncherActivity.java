package com.logrit.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import android.view.WindowInsets;
import android.window.OnBackInvokedDispatcher;
import android.webkit.WebChromeClient;
import android.webkit.JsResult;
import android.webkit.JsPromptResult;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;
import android.widget.EditText;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.MobileAds;

public class LauncherActivity extends Activity {
    private static final String APP_URL = "https://johyunae.github.io/LOGRIT/";
    private static final String BANNER_AD_UNIT_ID = BuildConfig.DEBUG
            ? "ca-app-pub-3940256099942544/9214589741"
            : "ca-app-pub-4817798220289653/7853351468";

    private WebView webView;
    private WebView connectionView;
    private LinearLayout connectionPanel;
    private LinearLayout appRoot;
    private AdView adView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private byte[] pendingBackup;
    private static final int OPEN_FILE = 1001;
    private static final int SAVE_BACKUP = 1002;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        appRoot = root;
        // These padded areas remain visible behind transparent system bars on Android 15+.
        // Resolve day/night resources so the phone's dark mode controls their background.
        int systemBarBackground = getColor(R.color.system_bar_background);
        root.setBackgroundColor(systemBarBackground);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT));

        FrameLayout adContainer = new FrameLayout(this);
        root.addView(adContainer, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        webView = new WebView(this);
        webView.setBackgroundColor(systemBarBackground);
        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                Insets insets = windowInsets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " LOGRIT-Android/" + BuildConfig.VERSION_CODE);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("data:text/json") || url.startsWith("data:application/json")) {
                    saveBackup(url);
                    return true;
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView parent, boolean isDialog, boolean isUserGesture, Message message) {
                Uri origin = Uri.parse(parent.getUrl() == null ? "" : parent.getUrl());
                if (parent != webView || !isUserGesture || !"https".equals(origin.getScheme())
                        || !"johyunae.github.io".equals(origin.getHost())
                        || !origin.getPath().startsWith("/LOGRIT/")) return false;
                closeConnectionWindow();
                connectionPanel = new LinearLayout(LauncherActivity.this);
                connectionPanel.setOrientation(LinearLayout.VERTICAL);
                connectionPanel.setBackgroundColor(getColor(R.color.system_bar_background));
                TextView address = new TextView(LauncherActivity.this);
                address.setPadding(16, 12, 16, 12);
                address.setText("로그릿 일정 연결");
                connectionPanel.addView(address);
                Button back = new Button(LauncherActivity.this);
                back.setText("로그릿으로 돌아가기 · 연결 유지");
                back.setOnClickListener(v -> hideConnectionWindow());
                connectionPanel.addView(back);
                connectionView = new WebView(LauncherActivity.this);
                WebSettings childSettings = connectionView.getSettings();
                childSettings.setJavaScriptEnabled(true);
                childSettings.setDomStorageEnabled(true);
                childSettings.setSupportMultipleWindows(true);
                connectionView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                        return !"https".equals(request.getUrl().getScheme());
                    }
                    @Override
                    public void onPageFinished(WebView child, String url) {
                        Uri uri = Uri.parse(url);
                        address.setText(uri.getHost() == null ? "로그릿 일정 연결" : uri.getHost());
                    }
                });
                connectionView.setWebChromeClient(this);
                connectionPanel.addView(connectionView, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
                appRoot.addView(connectionPanel, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
                webView.setVisibility(View.GONE);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) message.obj;
                transport.setWebView(connectionView);
                message.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView child) {
                if (child == connectionView) closeConnectionWindow();
            }

            @Override
            public void onRequestFocus(WebView child) {
                if (child == connectionView && connectionPanel != null) {
                    webView.setVisibility(View.GONE);
                    connectionPanel.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), OPEN_FILE);
                } catch (ActivityNotFoundException e) {
                    fileChooserCallback.onReceiveValue(null);
                    fileChooserCallback = null;
                    Toast.makeText(LauncherActivity.this, "파일 선택 앱을 찾을 수 없습니다.", Toast.LENGTH_LONG).show();
                }
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(LauncherActivity.this).setMessage(message)
                        .setPositiveButton("확인", (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(LauncherActivity.this).setMessage(message)
                        .setPositiveButton("확인", (dialog, which) -> result.confirm())
                        .setNegativeButton("취소", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                    String defaultValue, JsPromptResult result) {
                EditText input = new EditText(LauncherActivity.this);
                input.setText(defaultValue);
                new AlertDialog.Builder(LauncherActivity.this).setMessage(message).setView(input)
                        .setPositiveButton("확인", (dialog, which) -> result.confirm(input.getText().toString()))
                        .setNegativeButton("취소", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        webView.setDownloadListener((url, userAgent, disposition, mimeType, length) -> saveBackup(url));
        webView.loadUrl(getLaunchUrl(getIntent()));

        MobileAds.initialize(this, initializationStatus -> runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            adView = new AdView(this);
            adView.setAdUnitId(BANNER_AD_UNIT_ID);
            adView.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(
                    this, Math.round(getResources().getDisplayMetrics().widthPixels /
                            getResources().getDisplayMetrics().density)));
            adContainer.addView(adView);
            adView.loadAd(new AdRequest.Builder().build());
        }));
    }

    private String getLaunchUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "logrit".equals(data.getScheme()) && "import".equals(data.getHost())) {
            String payload = data.getQueryParameter("data");
            if (payload != null && payload.length() <= 16000 && payload.matches("[A-Za-z0-9_-]+")) {
                return APP_URL + "#logrit-import=" + payload;
            }
        }
        return APP_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) webView.loadUrl(getLaunchUrl(intent));
    }

    @Override
    public void onBackPressed() {
        navigateBack();
    }

    private void navigateBack() {
        if (connectionPanel != null && connectionPanel.getVisibility() == View.VISIBLE) {
            if (connectionView != null && connectionView.canGoBack()) connectionView.goBack();
            else hideConnectionWindow();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    private void hideConnectionWindow() {
        if (connectionPanel != null) connectionPanel.setVisibility(View.GONE);
        if (webView != null) {
            webView.setVisibility(View.VISIBLE);
            webView.evaluateJavascript("if(window.syncLogritAI) window.syncLogritAI();", null);
        }
    }

    private void closeConnectionWindow() {
        if (connectionPanel != null && appRoot != null) appRoot.removeView(connectionPanel);
        if (connectionView != null) {
            if (connectionView.getParent() instanceof ViewGroup)
                ((ViewGroup) connectionView.getParent()).removeView(connectionView);
            connectionView.destroy();
        }
        connectionView = null;
        connectionPanel = null;
        if (webView != null) webView.setVisibility(View.VISIBLE);
    }

    private void saveBackup(String url) {
        if (pendingBackup != null) return;
        if (!url.startsWith("data:text/json;charset=utf-8,")
                && !url.startsWith("data:application/json;charset=utf-8,")) return;
        pendingBackup = Uri.decode(url.substring(url.indexOf(',') + 1))
                .getBytes(StandardCharsets.UTF_8);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE).setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, "logrit_backup.json");
        try {
            startActivityForResult(intent, SAVE_BACKUP);
        } catch (ActivityNotFoundException e) {
            pendingBackup = null;
            Toast.makeText(this, "파일 저장 앱을 찾을 수 없습니다.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == OPEN_FILE && fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileChooserCallback = null;
        } else if (requestCode == SAVE_BACKUP) {
            byte[] backup = pendingBackup;
            pendingBackup = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && backup != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if (output == null) throw new java.io.IOException("Unable to open backup file");
                    output.write(backup);
                    Toast.makeText(this, "백업 파일을 저장했습니다.", Toast.LENGTH_LONG).show();
                } catch (java.io.IOException e) {
                    Toast.makeText(this, "백업 저장에 실패했습니다. 다시 시도해주세요.", Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
        closeConnectionWindow();
        if (adView != null) adView.destroy();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
