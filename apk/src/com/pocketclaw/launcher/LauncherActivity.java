package com.pocketclaw.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Typeface;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.StatFs;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.Manifest;
import android.content.pm.PackageManager;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

/**
 * PocketClaw Launcher v3.0
 *
 * STATUS tab = original TextView layout (proven, readable, 54 MB).
 * LOGS/KEYS/CTRL tabs = Canvas-rendered DashboardView.
 */
public class LauncherActivity extends Activity implements DashboardView.ControlListener {

    // ─── Original STATUS views ───────────────────────────────────
    private TextView crabView, ramView, statusView, emergencyBtn;
    private ScrollView statusScroll;
    private LinearLayout rootLayout;

    // ─── New tab system ──────────────────────────────────────────
    private static final int TAB_STATUS = 0, TAB_LOGS = 1, TAB_KEYS = 2, TAB_CTRL = 3;
    private int currentTab = TAB_STATUS;
    private TextView[] tabViews = new TextView[4];
    private DashboardView dashboard; // lazy-loaded on first tab switch
    private LinearLayout vbox; // for adding dashboard later

    // ─── Shared state ────────────────────────────────────────────
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable fetchTask = this::fetchLoop;
    private int frame = 0;
    private long lastBackPress = 0;
    private long[] titleTaps = new long[3];
    private int titleTapIndex = 0;
    private int offlineCount = 0;
    private boolean lastWasOnline = false;
    private static final int OFFLINE_THRESHOLD = 30;
    private BroadcastReceiver exitReceiver;
    private int fetchInterval = 5000;
    private SharedPreferences prefs;

    // ─── Hardware controls ───────────────────────────────────────
    private AudioManager audioManager;
    private WifiManager wifiManager;
    private CameraManager cameraManager;
    private String cameraId;
    private boolean flashlightOn = false;
    private boolean serverMode = false;
    private int savedBrightness = 60;
    private PowerManager.WakeLock wakeLock;

    // ─── Crab ────────────────────────────────────────────────────
    private static final String[] DEFAULT_CRAB = {
        "     __       __    \n" +
        "    / <`     `> \\   \n" +
        "   (  / @   @ \\  )  \n" +
        "    \\(  \\_-_/  )/   \n" +
        "  (\\ `-/     \\-` /)\n" +
        "   \"==/   _   \\==\"  \n" +
        "    .=') [_] (`=.   \n" +
        "   ' .='     `=. '  ",
        "    __         __   \n" +
        "   ( <`       `> )  \n" +
        "   (  / @   @ \\  )  \n" +
        "    \\(  \\_-_/  )/   \n" +
        "  (\\ `-/     \\-` /)\n" +
        "   \"==/   _   \\==\"  \n" +
        "    .=') [_] (`=.   \n" +
        "   ' .='     `=. '  "
    };
    private String[] crab = DEFAULT_CRAB;

    private static final String BLOCK_TITLE =
        "\u2588\u2580\u2588 \u2588\u2580\u2588 \u2588\u2580\u2580 \u2588\u2584\u2580 \u2588\u2580\u2580 \u2580\u2588\u2580 \u2588\u2580\u2580 \u2588   \u2584\u2580\u2588 \u2588 \u2588 \u2588\n" +
        "\u2588\u2580\u2580 \u2588\u2584\u2588 \u2588\u2584\u2584 \u2588 \u2588 \u2588\u2588\u2584  \u2588  \u2588\u2584\u2584 \u2588\u2584\u2584 \u2588\u2580\u2588 \u2580\u2584\u2580\u2584\u2580";

    private void loadCrab() {
        try {
            File f = new File("/sdcard/pocketclaw-crab.txt");
            if (!f.exists()) return;
            BufferedReader r = new BufferedReader(new FileReader(f));
            ArrayList<String> frames = new ArrayList<>();
            StringBuilder cur = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) {
                if (line.equals("---")) {
                    if (cur.length() > 0) frames.add(cur.toString().replaceAll("\\n$", ""));
                    cur = new StringBuilder();
                } else {
                    if (cur.length() > 0) cur.append('\n');
                    cur.append(line);
                }
            }
            if (cur.length() > 0) frames.add(cur.toString().replaceAll("\\n$", ""));
            r.close();
            if (frames.size() >= 2) crab = new String[]{frames.get(0), frames.get(1)};
            else if (frames.size() == 1) crab = new String[]{frames.get(0), frames.get(0)};
        } catch (Exception e) {}
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("pocketclaw", MODE_PRIVATE);

        // Fullscreen — we ARE the system UI now
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().setStatusBarColor(0xFF000A00);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);

        // Hardware managers
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        wifiManager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
        try { cameraId = cameraManager.getCameraIdList()[0]; } catch (Exception e) {}

        // Server mode from prefs
        serverMode = prefs.getBoolean("serverMode", false);
        if (serverMode) fetchInterval = 30000;

        exitReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if ("com.pocketclaw.TEST_PROOT".equals(action)) {
                    testProot();
                } else {
                    switchTab(TAB_CTRL);
                }
            }
        };
        IntentFilter filter = new IntentFilter("com.pocketclaw.EXIT");
        filter.addAction("com.pocketclaw.TEST_PROOT");
        registerReceiver(exitReceiver, filter);

        float d = getResources().getDisplayMetrics().density;

        // === BUILD UI ============================================
        FrameLayout mainFrame = new FrameLayout(this);
        mainFrame.setBackgroundColor(0xFF000A00);

        // Vertical container: tab bar + content
        LinearLayout vbox = new LinearLayout(this);
        vbox.setOrientation(LinearLayout.VERTICAL);

        // ─── Tab bar ─────────────────────────────────────────
        LinearLayout tabBar = new LinearLayout(this);
        tabBar.setOrientation(LinearLayout.HORIZONTAL);
        tabBar.setBackgroundColor(0xFF000A00);
        int tabH = (int)(36 * d);

        String[] tabNames = {"STATUS", "LOGS", "KEYS", "CTRL"};
        for (int i = 0; i < 4; i++) {
            TextView tab = new TextView(this);
            tab.setText(tabNames[i]);
            tab.setTextSize(12);
            tab.setTypeface(Typeface.MONOSPACE);
            tab.setGravity(Gravity.CENTER);
            tab.setClickable(true);
            final int idx = i;
            tab.setOnClickListener(v -> switchTab(idx));
            tabViews[i] = tab;
            tabBar.addView(tab, new LinearLayout.LayoutParams(0, tabH, 1));
        }
        vbox.addView(tabBar);

        // ─── STATUS page (original TextViews) ────────────────
        statusScroll = new ScrollView(this);
        statusScroll.setBackgroundColor(0xFF000A00);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding((int)(12*d), (int)(8*d), (int)(12*d), (int)(60*d));

        loadCrab();
        crabView = mono(crab[0], 11, 0xFFEE3333);
        crabView.setGravity(Gravity.CENTER_HORIZONTAL);
        crabView.setPadding(0, (int)(4*d), 0, (int)(4*d));
        crabView.setOnLongClickListener(v -> { testProot(); return true; });
        root.addView(crabView);

        TextView title = mono(BLOCK_TITLE, 11, 0xFFFFFFFF);
        title.setGravity(Gravity.CENTER);
        title.setOnClickListener(v -> {
            titleTaps[titleTapIndex % 3] = System.currentTimeMillis();
            titleTapIndex++;
            if (titleTapIndex >= 3) {
                long first = titleTaps[(titleTapIndex - 3) % 3];
                long last = titleTaps[(titleTapIndex - 1) % 3];
                if (last - first < 1000) {
                    switchTab(TAB_CTRL);
                    titleTapIndex = 0;
                }
            }
        });
        root.addView(title);

        TextView sub = mono("MOTO E2 \u2022 1GB \u2022 ANDROID 6", 9, 0xFF1A3A1A);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, (int)(2*d), 0, (int)(20*d));
        root.addView(sub);

        ramView = mono("", 12, 0xFF00AA00);
        ramView.setGravity(Gravity.CENTER);
        ramView.setPadding(0, 0, 0, (int)(10*d));
        root.addView(ramView);

        statusView = mono("\u25CB Gateway    Connecting...", 12, 0xFF00AA00);
        statusView.setPadding(0, 0, 0, (int)(8*d));
        statusView.setLineSpacing(0, 1.2f);
        root.addView(statusView);

        TextView ft = mono("V8 150MB \u2022 PROOT \u2022 NODE 22 \u2022 KIMI", 8, 0xFF082A08);
        ft.setGravity(Gravity.CENTER);
        ft.setPadding(0, (int)(8*d), 0, 0);
        root.addView(ft);

        emergencyBtn = new TextView(this);
        emergencyBtn.setText("\u26A0  OPEN SETTINGS");
        emergencyBtn.setTextSize(16);
        emergencyBtn.setTextColor(0xFFFFFFFF);
        emergencyBtn.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        emergencyBtn.setBackgroundColor(0xFFCC0000);
        emergencyBtn.setGravity(Gravity.CENTER);
        emergencyBtn.setPadding((int)(16*d), (int)(14*d), (int)(16*d), (int)(14*d));
        emergencyBtn.setVisibility(View.GONE);
        emergencyBtn.setOnClickListener(v -> switchTab(TAB_CTRL));
        root.addView(emergencyBtn);

        rootLayout = root;
        statusScroll.addView(root);
        vbox.addView(statusScroll, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        // DashboardView is lazy-loaded on first tab switch to save ~5 MB RAM
        this.vbox = vbox;

        mainFrame.addView(vbox);

        // ─── Nav bar at bottom ───────────────────────────────
        LinearLayout navBar = new LinearLayout(this);
        navBar.setOrientation(LinearLayout.HORIZONTAL);
        navBar.setBackgroundColor(0xFF0A0A0A);
        navBar.setGravity(Gravity.CENTER);
        int navH = (int)(48*d);

        TextView btnSettings = navBtn("\u2699", d);
        btnSettings.setOnClickListener(v -> switchTab(TAB_CTRL));

        TextView btnWifi = navBtn("\u25D4", d);
        btnWifi.setOnClickListener(v -> {
            if (wifiManager != null) {
                boolean now = wifiManager.isWifiEnabled();
                wifiManager.setWifiEnabled(!now);
                Toast.makeText(this, "WiFi " + (!now ? "ON" : "OFF"), Toast.LENGTH_SHORT).show();
            }
        });

        TextView btnHome = navBtn("\u25A0", d);
        btnHome.setTextColor(0xFFEE3333);
        btnHome.setOnClickListener(v -> switchTab(TAB_STATUS));

        TextView btnBack = navBtn("\u25C0", d);
        btnBack.setOnClickListener(v -> {
            try { Runtime.getRuntime().exec(new String[]{"input", "keyevent", "4"}); }
            catch (Exception e) {}
        });

        navBar.addView(btnSettings, new LinearLayout.LayoutParams(0, navH, 1));
        navBar.addView(btnWifi, new LinearLayout.LayoutParams(0, navH, 1));
        navBar.addView(btnHome, new LinearLayout.LayoutParams(0, navH, 1));
        navBar.addView(btnBack, new LinearLayout.LayoutParams(0, navH, 1));

        FrameLayout.LayoutParams navParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, navH);
        navParams.gravity = Gravity.BOTTOM;
        mainFrame.addView(navBar, navParams);

        setContentView(mainFrame);
        updateTabHighlight();

        // Permissions
        if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1);
        }
        if (Settings.canDrawOverlays(this)) {
            startService(new Intent(this, FloatingCrabService.class));
        } else {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:" + getPackageName())));
        }

        // First-run check
        if (!new File("/sdcard/pocketclaw-setup-done").exists()) {
            try { new FileOutputStream("/sdcard/pocketclaw-setup-done").close(); } catch (Exception e) {}
        }

        fetchLoop();
    }

    // ─── TAB SWITCHING ───────────────────────────────────────────

    private DashboardView ensureDashboard() {
        if (dashboard == null) {
            dashboard = new DashboardView(this);
            dashboard.setCrabFrames(crab);
            dashboard.setControlListener(this);
            dashboard.setBootAnimDone();
            dashboard.setVisibility(View.GONE);
            if (wifiManager != null) dashboard.setWifiToggle(wifiManager.isWifiEnabled());
            dashboard.setVolume(getVolumePercent());
            dashboard.setBrightness(getBrightnessPercent());
            dashboard.setServerMode(serverMode);
            vbox.addView(dashboard, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        }
        return dashboard;
    }

    private void switchTab(int tab) {
        currentTab = tab;
        if (tab == TAB_STATUS) {
            statusScroll.setVisibility(View.VISIBLE);
            if (dashboard != null) dashboard.setVisibility(View.GONE);
        } else {
            statusScroll.setVisibility(View.GONE);
            DashboardView dv = ensureDashboard();
            dv.setVisibility(View.VISIBLE);
            dv.setCurrentPage(tab); // LOGS=1, KEYS=2, CTRL=3
            dv.refreshView();
            if (tab == TAB_KEYS) fetchKeys();
        }
        updateTabHighlight();
    }

    private void updateTabHighlight() {
        for (int i = 0; i < 4; i++) {
            boolean active = (i == currentTab);
            tabViews[i].setTextColor(active ? 0xFF00FF41 : 0xFF1A6A1A);
            tabViews[i].setBackgroundColor(active ? 0xFF001A00 : 0xFF000A00);
        }
    }

    // ─── HELPERS ─────────────────────────────────────────────────

    private TextView navBtn(String icon, float d) {
        TextView btn = new TextView(this);
        btn.setText(icon);
        btn.setTextSize(22);
        btn.setTextColor(0xFF888888);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setClickable(true);
        btn.setFocusable(true);
        return btn;
    }

    private TextView mono(String s, int size, int color) {
        TextView tv = new TextView(this);
        tv.setText(s);
        tv.setTextSize(size);
        tv.setTextColor(color);
        tv.setTypeface(Typeface.MONOSPACE);
        return tv;
    }

    private int getVolumePercent() {
        if (audioManager == null) return 50;
        int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int cur = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
        return max > 0 ? Math.round(cur * 100f / max) : 50;
    }

    private int getBrightnessPercent() {
        try {
            int val = Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS);
            return Math.round(val * 100f / 255);
        } catch (Exception e) { return 50; }
    }

    // ─── FETCH LOOP ──────────────────────────────────────────────

    private void fetchLoop() {
        new Thread(() -> {
            String ramDisplay = "";
            String statusDisplay;
            boolean online = false;
            String json = null;
            try {
                URL url = new URL("http://localhost:9000/api/status");
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setConnectTimeout(3000);
                c.setReadTimeout(3000);
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                json = sb.toString();
                ramDisplay = formatRam(json);
                statusDisplay = formatStatus(json);
                offlineCount = 0;
                online = true;
            } catch (Exception e) {
                statusDisplay = "\u25CB Gateway    OFFLINE\n\nWaiting for boot...";
                offlineCount++;
            }
            final String rd = ramDisplay;
            final String sd = statusDisplay;
            final String fJson = json;
            final boolean fOnline = online;
            final boolean showEmergency = offlineCount >= OFFLINE_THRESHOLD;
            final boolean stateChanged = (online != lastWasOnline);
            lastWasOnline = online;
            final int delay = stateChanged ? 3000 : fetchInterval;

            handler.post(() -> {
                // Update STATUS tab (TextViews)
                ramView.setText(rd);
                statusView.setText(sd);
                crabView.setText(crab[frame % 2]);
                frame++;
                emergencyBtn.setVisibility(showEmergency ? View.VISIBLE : View.GONE);

                // Update DashboardView data (for LOGS/KEYS/CTRL) — only if created
                if (dashboard != null) {
                    if (fJson != null) {
                        updateDashboardFromJson(fJson);
                    } else {
                        dashboard.setGatewayUp(false);
                    }
                    dashboard.refreshView();
                }
            });
            handler.postDelayed(fetchTask, delay);
        }).start();
    }

    private void updateDashboardFromJson(String j) {
        boolean gw = j.contains("\"status\":\"up\"");
        boolean wifi = j.contains("\"wifi\":true");
        boolean tg = j.contains("\"telegram\":true");
        boolean kimi = j.contains("\"kimi\":true");

        int ri = j.indexOf("\"ram\":{");
        int ramUsed = ri >= 0 ? num(j, "\"used\":", ri) : 0;
        int ramTotal = ri >= 0 ? num(j, "\"total\":", ri) : 1;

        int si = j.indexOf("\"swap\":{");
        int swapUsed = si >= 0 ? num(j, "\"used\":", si) : 0;
        int swapTotal = si >= 0 ? num(j, "\"total\":", si) : 0;

        String uptime = "?";
        int ui = j.indexOf("\"uptime\":\"");
        if (ui >= 0) { int a = ui + 10, b = j.indexOf('"', a); if (b > a) uptime = j.substring(a, b); }

        String lastError = null;
        int ei = j.indexOf("\"lastError\":\"");
        if (ei >= 0) { int a = ei + 13, b = j.indexOf('"', a); if (b > a) lastError = j.substring(a, b); }
        int eni = j.indexOf("\"lastError\":null");
        if (eni >= 0) lastError = null;

        // Logs
        ArrayList<String> logs = new ArrayList<>();
        int li = j.indexOf("\"logs\":[");
        if (li >= 0) {
            int pos = li + 8;
            int end = findArrayEnd(j, pos);
            if (end > pos) {
                String ls = j.substring(pos, end);
                int p = 0;
                while (logs.size() < 20) {
                    int a = ls.indexOf('"', p);
                    if (a < 0) break;
                    int b = ls.indexOf('"', a + 1);
                    if (b < 0) break;
                    logs.add(ls.substring(a + 1, b).replaceAll("\u001b\\[[0-9;]*m", ""));
                    p = b + 1;
                }
            }
        }

        // Procs
        ArrayList<String[]> procList = new ArrayList<>();
        int pi = 0;
        while (procList.size() < 8) {
            int nS = j.indexOf("\"n\":\"", pi);
            if (nS < 0) break;
            nS += 5;
            int nE = j.indexOf('"', nS);
            String name = j.substring(nS, nE);
            int mS = j.indexOf("\"m\":", nE) + 4;
            int mE = mS;
            while (mE < j.length() && Character.isDigit(j.charAt(mE))) mE++;
            procList.add(new String[]{name, j.substring(mS, mE)});
            pi = mE;
        }

        // Lazy
        int lti = j.indexOf("\"lazyTotal\":");
        int lazyTotal = lti >= 0 ? num(j, "\"lazyTotal\":", 0) : 0;
        int lazyLoaded = lti >= 0 ? num(j, "\"lazyLoaded\":", 0) : 0;
        int lazyDead = lti >= 0 ? num(j, "\"lazyDead\":", 0) : 0;

        final String fUptime = uptime;
        final String fLastError = lastError;
        final String[][] fProcs = procList.toArray(new String[0][]);
        final String[] fLogs = logs.toArray(new String[0]);

        dashboard.setGatewayUp(gw);
        dashboard.setWifiOn(wifi);
        dashboard.setTelegramLive(tg);
        dashboard.setKimiOk(kimi);
        dashboard.setRam(ramUsed, ramTotal);
        dashboard.setSwap(swapUsed, swapTotal);
        dashboard.setUptime(fUptime);
        dashboard.setLastError(fLastError);
        dashboard.setBatteryInfo(getBatteryInfo());
        dashboard.setStorageInfo(getStorageInfo());
        dashboard.setProcs(fProcs);
        dashboard.setLogs(fLogs);
        dashboard.setLazy(lazyTotal, lazyLoaded, lazyDead);
        dashboard.setWifiToggle(wifiManager != null && wifiManager.isWifiEnabled());
        dashboard.setVolume(getVolumePercent());
    }

    // ─── ORIGINAL STATUS FORMATTING ──────────────────────────────

    private String formatRam(String j) {
        int ri = j.indexOf("\"ram\":{");
        if (ri < 0) return "";
        int used = num(j, "\"used\":", ri);
        int total = num(j, "\"total\":", ri);
        if (total <= 0) return "";
        int pct = Math.round((float) used / total * 100);
        StringBuilder s = new StringBuilder();
        int filled = pct / 5;
        for (int i = 0; i < 20; i++) s.append(i < filled ? '\u2588' : '\u2591');
        s.append(' ').append(pct).append("%\n");
        s.append(used).append(" / ").append(total).append(" MB");
        return s.toString();
    }

    private String formatStatus(String j) {
        StringBuilder s = new StringBuilder();
        String[][] procs = new String[8][2];
        int procCount = 0;
        int pi = 0;
        while (procCount < 8) {
            int nS = j.indexOf("\"n\":\"", pi);
            if (nS < 0) break;
            nS += 5;
            int nE = j.indexOf('"', nS);
            String name = j.substring(nS, nE);
            if (name.length() > 15) name = name.substring(0, 15);
            int mS = j.indexOf("\"m\":", nE) + 4;
            int mE = mS;
            while (mE < j.length() && Character.isDigit(j.charAt(mE))) mE++;
            procs[procCount][0] = name;
            procs[procCount][1] = j.substring(mS, mE);
            procCount++;
            pi = mE;
        }

        String[] sn = {"Gateway", "WiFi", "Telegram", "Kimi"};
        String[] sk = {"\"status\":\"up\"", "\"wifi\":true", "\"telegram\":true", "\"kimi\":true"};
        String[] von = {"OK", "ON", "Live", "OK"};
        String[] voff = {"DOWN", "OFF", "Down", "--"};

        for (int i = 0; i < 4; i++) {
            boolean on = has(j, sk[i]);
            String d = on ? "\u25CF" : "\u25CB";
            String v = on ? von[i] : voff[i];
            if (i < procCount) {
                s.append(String.format("%s %-10s%-8s%-16s%5sM\n", d, sn[i], v, procs[i][0], procs[i][1]));
            } else {
                s.append(String.format("%s %-9s%s\n", d, sn[i], v));
            }
        }
        for (int i = 4; i < Math.min(procCount, 8); i++) {
            s.append(String.format("%20s%-16s%5sM\n", "", procs[i][0], procs[i][1]));
        }

        s.append('\n');
        StringBuilder left1 = new StringBuilder();
        int si = j.indexOf("\"swap\":{");
        if (si >= 0) {
            left1.append("Swap ").append(num(j, "\"used\":", si)).append('/').append(num(j, "\"total\":", si));
        }
        StringBuilder right1 = new StringBuilder();
        int ui = j.indexOf("\"uptime\":\"");
        if (ui >= 0) {
            int a = ui + 10, b = j.indexOf('"', a);
            right1.append("Up ").append(j.substring(a, b));
        }
        s.append(String.format("%-21s%21s\n", left1.toString(), right1.toString()));
        s.append(String.format("%-21s%21s\n", "Bat " + getBatteryInfo(), "Disk " + getStorageInfo()));

        ArrayList<String> logs = new ArrayList<>();
        int li = j.indexOf("\"logs\":[");
        if (li >= 0) {
            int pos = li + 8;
            int end = findArrayEnd(j, pos);
            if (end > pos) {
                String ls = j.substring(pos, end);
                int p = 0;
                while (logs.size() < 5) {
                    int a = ls.indexOf('"', p);
                    if (a < 0) break;
                    int b = ls.indexOf('"', a + 1);
                    if (b < 0) break;
                    logs.add(ls.substring(a + 1, b).replaceAll("\u001b\\[[0-9;]*m", ""));
                    p = b + 1;
                }
            }
        }

        s.append('\n');
        s.append("\u250C LOG \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n");
        if (logs.isEmpty()) {
            s.append(String.format("\u2502 %-38s \u2502\n", "Waiting for logs..."));
        } else {
            for (String log : logs) {
                if (log.length() > 38) log = log.substring(0, 38);
                s.append(String.format("\u2502 %-38s \u2502\n", log));
            }
        }
        s.append("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");

        return s.toString();
    }

    // ─── KEYS FETCH ──────────────────────────────────────────────

    private void fetchKeys() {
        new Thread(() -> {
            try {
                URL url = new URL("http://localhost:9000/api/keys");
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setConnectTimeout(3000);
                c.setReadTimeout(3000);
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                String json = sb.toString();

                ArrayList<DashboardView.KeyInfo> keyList = new ArrayList<>();
                int pos = 0;
                while (true) {
                    int ns = json.indexOf("\"name\":\"", pos);
                    if (ns < 0) break;
                    int na = ns + 8;
                    int ne = json.indexOf('"', na);
                    String name = json.substring(na, ne);

                    boolean set = false;
                    int si = json.indexOf("\"set\":", ne);
                    int nextName = json.indexOf("\"name\":\"", ne + 1);
                    if (si >= 0 && (nextName < 0 || si < nextName)) {
                        set = json.substring(si + 5, si + 9).contains("true");
                    }

                    String masked = "";
                    int mi = json.indexOf("\"masked\":\"", ne);
                    if (mi >= 0 && (nextName < 0 || mi < nextName)) {
                        mi += 10;
                        int me = json.indexOf('"', mi);
                        masked = json.substring(mi, me);
                    }
                    keyList.add(new DashboardView.KeyInfo(name, set, masked));
                    pos = nextName > ne ? nextName : ne + 1;
                }
                handler.post(() -> { dashboard.setKeys(keyList); dashboard.refreshView(); });
            } catch (Exception e) {
                Log.d("PocketClaw", "fetchKeys error: " + e);
            }
        }).start();
    }

    // ─── UTILITY ─────────────────────────────────────────────────

    private String getBatteryInfo() {
        try {
            Intent bs = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (bs == null) return "?";
            int level = bs.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = bs.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int pct = level * 100 / scale;
            boolean charging = bs.getIntExtra(BatteryManager.EXTRA_STATUS, -1) == BatteryManager.BATTERY_STATUS_CHARGING;
            return pct + "%" + (charging ? "+" : "");
        } catch (Exception e) { return "?"; }
    }

    private String getStorageInfo() {
        try {
            StatFs stat = new StatFs(Environment.getDataDirectory().getPath());
            long freeMB = stat.getAvailableBytes() / (1024 * 1024);
            long totalMB = stat.getTotalBytes() / (1024 * 1024);
            if (totalMB >= 1024) return String.format("%.1f/%.1fG", freeMB / 1024.0, totalMB / 1024.0);
            return freeMB + "/" + totalMB + "M";
        } catch (Exception e) { return "?"; }
    }

    private boolean has(String j, String k) { return j.contains(k); }

    /** Find matching ] for a JSON array, skipping over quoted strings */
    private int findArrayEnd(String j, int from) {
        boolean inStr = false;
        for (int i = from; i < j.length(); i++) {
            char c = j.charAt(i);
            if (c == '"' && (i == 0 || j.charAt(i - 1) != '\\')) inStr = !inStr;
            else if (c == ']' && !inStr) return i;
        }
        return -1;
    }

    private int num(String j, String key, int from) {
        int i = j.indexOf(key, from);
        if (i < 0) return 0;
        i += key.length();
        int e = i;
        while (e < j.length() && Character.isDigit(j.charAt(e))) e++;
        return e > i ? Integer.parseInt(j.substring(i, e)) : 0;
    }

    // ─── CONTROL LISTENER (CTRL page) ────────────────────────────

    @Override
    public void onBrightnessChanged(int pct) {
        if (!Settings.System.canWrite(this)) return;
        int safePct = Math.max(5, pct);
        int val = Math.round(safePct / 100f * 255);
        Settings.System.putInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, val);
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = val / 255f;
        getWindow().setAttributes(lp);
        dashboard.setBrightness(safePct);
        dashboard.refreshView();
    }

    @Override
    public void onVolumeChanged(int pct) {
        if (audioManager == null) return;
        int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int val = Math.round(pct / 100f * max);
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, val, 0);
    }

    @Override
    public void onWifiToggle(boolean on) {
        if (wifiManager != null) wifiManager.setWifiEnabled(on);
    }

    @Override
    public void onFlashlightToggle(boolean on) {
        if (cameraManager == null || cameraId == null) return;
        try {
            cameraManager.setTorchMode(cameraId, on);
            flashlightOn = on;
        } catch (CameraAccessException e) {
            Toast.makeText(this, "Flashlight error", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onServerModeToggle(boolean on) {
        serverMode = on;
        prefs.edit().putBoolean("serverMode", on).apply();
        if (on) {
            savedBrightness = getBrightnessPercent();
            prefs.edit().putInt("savedBrightness", savedBrightness).apply();
            onBrightnessChanged(0);
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (wakeLock == null) wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pocketclaw:server");
            if (!wakeLock.isHeld()) wakeLock.acquire();
            try { new FileOutputStream("/sdcard/pocketclaw-server-mode").close(); } catch (Exception e) {}
            fetchInterval = 30000;
            dashboard.setServerMode(true);
            dashboard.refreshView();
            stopService(new Intent(this, FloatingCrabService.class));
            postToApi("/api/control/server-mode", "{\"enabled\":true}");
            Toast.makeText(this, "Server mode ON", Toast.LENGTH_SHORT).show();
        } else {
            savedBrightness = prefs.getInt("savedBrightness", 60);
            onBrightnessChanged(savedBrightness);
            dashboard.setBrightness(savedBrightness);
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            new File("/sdcard/pocketclaw-server-mode").delete();
            fetchInterval = 5000;
            dashboard.setServerMode(false);
            dashboard.refreshView();
            if (Settings.canDrawOverlays(this)) startService(new Intent(this, FloatingCrabService.class));
            postToApi("/api/control/server-mode", "{\"enabled\":false}");
            Toast.makeText(this, "Server mode OFF", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onReboot() {
        new AlertDialog.Builder(this)
            .setTitle("Reboot Device")
            .setMessage("Are you sure? The gateway will restart.")
            .setPositiveButton("REBOOT", (d, w) -> {
                postToApi("/api/control/reboot", "{}");
                Toast.makeText(this, "Rebooting in 3s...", Toast.LENGTH_LONG).show();
            })
            .setNegativeButton("CANCEL", null)
            .show();
    }

    @Override
    public void onKeyEdit(String name) {
        EditText input = new EditText(this);
        input.setHint("New value for " + name);
        input.setTypeface(Typeface.MONOSPACE);
        new AlertDialog.Builder(this)
            .setTitle("Edit " + name)
            .setView(input)
            .setPositiveButton("SAVE", (d, w) -> {
                String val = input.getText().toString().trim();
                if (!val.isEmpty()) {
                    postToApi("/api/keys", "{\"name\":\"" + name + "\",\"value\":\"" + val + "\"}");
                    handler.postDelayed(this::fetchKeys, 500);
                }
            })
            .setNegativeButton("CANCEL", null)
            .show();
    }

    @Override
    public void onKeyTest(String name) {
        new Thread(() -> {
            try {
                URL url = new URL("http://localhost:9000/api/keys/test?key=" + name);
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(5000);
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                boolean ok = sb.toString().contains("\"ok\":true");
                handler.post(() -> Toast.makeText(this, ok ? name + ": Valid" : name + ": Failed", Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                handler.post(() -> Toast.makeText(this, "Test failed: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    @Override
    public void onPageChanged(int page) {
        switchTab(page);
    }

    private void postToApi(String path, String body) {
        new Thread(() -> {
            try {
                URL url = new URL("http://localhost:9000" + path);
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setDoOutput(true);
                c.setConnectTimeout(3000);
                c.setReadTimeout(3000);
                OutputStream os = c.getOutputStream();
                os.write(body.getBytes());
                os.close();
                c.getResponseCode();
                c.disconnect();
            } catch (Exception e) {
                Log.d("PocketClaw", "postToApi error: " + e);
            }
        }).start();
    }

    // ─── LIFECYCLE ───────────────────────────────────────────────

    @Override
    protected void onResume() {
        super.onResume();
        if (serverMode && new File("/sdcard/pocketclaw-server-mode").exists()) {
            onServerModeToggle(false);
        }
    }

    @Override
    public void onBackPressed() {
        // If on another tab, go back to STATUS
        if (currentTab != TAB_STATUS) {
            switchTab(TAB_STATUS);
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackPress < 2000) {
            Intent chooser = new Intent(Intent.ACTION_MAIN);
            chooser.addCategory(Intent.CATEGORY_HOME);
            chooser.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(chooser, "Choose launcher"));
        } else {
            lastBackPress = now;
            Toast.makeText(this, "Back again to switch launcher", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacks(fetchTask);
        if (exitReceiver != null) unregisterReceiver(exitReceiver);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    // ─── PROOT TEST ──────────────────────────────────────────────

    private void testProot() {
        new Thread(() -> {
            StringBuilder result = new StringBuilder();
            Log.d("PocketClaw", "testProot starting");
            try {
                File binDir = new File(getFilesDir(), "bin");
                binDir.mkdirs();
                File prootFile = new File(binDir, "proot");
                File tallocFile = new File(binDir, "libtalloc.so.2");
                copyFile(new File("/sdcard/proot"), prootFile);
                copyFile(new File("/sdcard/libtalloc.so.2"), tallocFile);
                prootFile.setExecutable(true, false);
                tallocFile.setReadable(true, false);
                result.append("1. Copied proot+lib OK\n");

                String prootPath = prootFile.getAbsolutePath();
                String libDir = binDir.getAbsolutePath();
                String[] env = {"LD_LIBRARY_PATH=" + libDir, "PROOT_TMP_DIR=" + getCacheDir().getAbsolutePath()};
                Process p = Runtime.getRuntime().exec(new String[]{prootPath, "--version"}, env);
                String out = readStream(p.getInputStream());
                String err = readStream(p.getErrorStream());
                int code = p.waitFor();
                result.append("2. proot --version: ").append(out.trim()).append(" (exit ").append(code).append(")\n");
                if (err.length() > 0) { String te = err.trim(); result.append("   err: ").append(te.substring(0, Math.min(te.length(), 200))).append("\n"); }

                String prefix = "/data/data/com.termux/files/usr";
                String rootfs = prefix + "/var/lib/proot-distro/installed-rootfs/ubuntu";
                Process p2 = Runtime.getRuntime().exec(new String[]{
                    prootPath, "--link2symlink", "--kill-on-exit", "--root-id",
                    "--rootfs=" + rootfs, "--bind=/dev", "--bind=/proc", "--bind=/sys",
                    "--bind=" + prefix + "/tmp:/tmp", "--bind=" + prefix + ":" + prefix,
                    "--bind=/system:/system", "--cwd=/root",
                    "/lib/ld-linux-armhf.so.3", "/bin/echo", "PROOT_WORKS_FROM_LAUNCHER"
                }, new String[]{"LD_LIBRARY_PATH=" + libDir, "PROOT_TMP_DIR=" + getCacheDir().getAbsolutePath()});
                String out2 = readStream(p2.getInputStream());
                String err2 = readStream(p2.getErrorStream());
                int code2 = p2.waitFor();
                result.append("3. proot echo: ").append(out2.trim()).append(" (exit ").append(code2).append(")\n");
                if (err2.length() > 0) { String te = err2.trim(); result.append("   err: ").append(te.substring(0, Math.min(te.length(), 300))).append("\n"); }
            } catch (Exception e) {
                result.append("ERROR: ").append(e.toString());
                Log.e("PocketClaw", "testProot error", e);
            }
            final String r = result.toString();
            Log.d("PocketClaw", "testProot result: " + r);
            try {
                FileOutputStream fos = new FileOutputStream("/sdcard/proot-test.txt");
                fos.write(r.getBytes());
                fos.close();
            } catch (Exception ex) {}
            handler.post(() -> Toast.makeText(this, "Proot test done", Toast.LENGTH_LONG).show());
        }).start();
    }

    private void copyFile(File src, File dst) throws Exception {
        InputStream in = new FileInputStream(src);
        OutputStream out = new FileOutputStream(dst);
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        out.close();
    }

    private String readStream(InputStream is) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(is));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line).append('\n');
        r.close();
        return sb.toString();
    }
}
