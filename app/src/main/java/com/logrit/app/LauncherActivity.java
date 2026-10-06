package com.logrit.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.MobileAds;

public class LauncherActivity extends Activity {
    private static final String APP_URL = "https://johyunae.github.io/LOGRIT/";
    private static final String BANNER_AD_UNIT_ID = "ca-app-pub-4817798220289653/7853351468";

    private WebView webView;
    private AdView adView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT));

        FrameLayout adContainer = new FrameLayout(this);
        root.addView(adContainer, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl(APP_URL);

        MobileAds.initialize(this, initializationStatus -> {
            adView = new AdView(this);
            adView.setAdUnitId(BANNER_AD_UNIT_ID);
            adView.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(
                    this, getResources().getDisplayMetrics().widthPixels /
                            getResources().getDisplayMetrics().density));
            adContainer.addView(adView);
            adView.loadAd(new AdRequest.Builder().build());
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (adView != null) adView.destroy();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
