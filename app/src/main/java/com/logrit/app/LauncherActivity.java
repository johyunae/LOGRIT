package com.logrit.app;

import android.net.Uri;

public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        return Uri.parse("https://johyunae.github.io/LOGRIT/");
    }
}
