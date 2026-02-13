package com.pocketclaw.launcher;

import android.app.Activity;
import android.graphics.Typeface;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

public class LauncherActivity extends Activity {
    private TextView crabView, ramView, statusView, emergencyBtn;
    private LinearLayout rootLayout;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable fetchTask = this::fetchLoop;
    private int frame = 0;
    private long lastBackPress = 0;
    private long[] titleTaps = new long[3];
    private int titleTapIndex = 0;
    private int offlineCount = 0;
    private boolean lastWasOnline = false;
    private static final int OFFLINE_THRESHOLD = 60;
    private BroadcastReceiver exitReceiver;

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

        // Fullscreen — we ARE the system UI now
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().setStatusBarColor(0xFF000A00);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);

        exitReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            }
        };
        registerReceiver(exitReceiver, new IntentFilter("com.pocketclaw.EXIT"));

        float d = getResources().getDisplayMetrics().density;

        // Main container: content + nav bar
        FrameLayout mainFrame = new FrameLayout(this);
        mainFrame.setBackgroundColor(0xFF000A00);

        // Scrollable content
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xFF000A00);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding((int)(12*d), (int)(8*d), (int)(12*d), (int)(60*d)); // bottom padding for nav bar

        loadCrab();
        crabView = mono(crab[0], 11, 0xFFEE3333);
        crabView.setGravity(Gravity.CENTER_HORIZONTAL);
        crabView.setPadding(0, (int)(4*d), 0, (int)(4*d));
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
                    startActivity(new Intent(Settings.ACTION_SETTINGS));
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

        TextView ft = mono("V8 192MB \u2022 PROOT \u2022 NODE 22 \u2022 KIMI", 8, 0xFF082A08);
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
        emergencyBtn.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_SETTINGS)));
        root.addView(emergencyBtn);

        rootLayout = root;
        scroll.addView(root);

        // Nav bar at bottom
        LinearLayout navBar = new LinearLayout(this);
        navBar.setOrientation(LinearLayout.HORIZONTAL);
        navBar.setBackgroundColor(0xFF0A0A0A);
        navBar.setGravity(Gravity.CENTER);
        int navH = (int)(48*d);

        // Settings button
        TextView btnSettings = navBtn("\u2699", d);
        btnSettings.setOnClickListener(v -> {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        });

        // WiFi button
        TextView btnWifi = navBtn("\u25D4", d);
        btnWifi.setOnClickListener(v -> {
            startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
        });

        // Home / Dashboard button
        TextView btnHome = navBtn("\u25A0", d);
        btnHome.setTextColor(0xFFEE3333);
        btnHome.setOnClickListener(v -> {
            // Scroll to top = back to dashboard
            scroll.smoothScrollTo(0, 0);
        });

        // Back button
        TextView btnBack = navBtn("\u25C0", d);
        btnBack.setOnClickListener(v -> {
            // Simulate back key
            try {
                Runtime.getRuntime().exec(new String[]{
                    "input", "keyevent", "4"
                });
            } catch (Exception e) {}
        });

        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(0, navH, 1);
        navBar.addView(btnSettings, btnParams);
        navBar.addView(btnWifi, new LinearLayout.LayoutParams(0, navH, 1));
        navBar.addView(btnHome, new LinearLayout.LayoutParams(0, navH, 1));
        navBar.addView(btnBack, new LinearLayout.LayoutParams(0, navH, 1));

        FrameLayout.LayoutParams scrollParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        mainFrame.addView(scroll, scrollParams);

        FrameLayout.LayoutParams navParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, navH);
        navParams.gravity = Gravity.BOTTOM;
        mainFrame.addView(navBar, navParams);

        setContentView(mainFrame);
        fetchLoop();
    }

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

    private void fetchLoop() {
        new Thread(() -> {
            String ramDisplay = "";
            String statusDisplay;
            boolean online = false;
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
                String json = sb.toString();
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
            final boolean showEmergency = offlineCount >= OFFLINE_THRESHOLD;
            final boolean stateChanged = (online != lastWasOnline);
            lastWasOnline = online;
            final int delay = stateChanged ? 3000 : 5000;
            handler.post(() -> {
                ramView.setText(rd);
                statusView.setText(sd);
                crabView.setText(crab[frame % 2]);
                frame++;
                emergencyBtn.setVisibility(showEmergency ? View.VISIBLE : View.GONE);
            });
            handler.postDelayed(fetchTask, delay);
        }).start();
    }

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
            int end = j.indexOf(']', pos);
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
            if (totalMB >= 1024) {
                return String.format("%.1f/%.1fG", freeMB / 1024.0, totalMB / 1024.0);
            }
            return freeMB + "/" + totalMB + "M";
        } catch (Exception e) { return "?"; }
    }

    private boolean has(String j, String k) { return j.contains(k); }

    private int num(String j, String key, int from) {
        int i = j.indexOf(key, from);
        if (i < 0) return 0;
        i += key.length();
        int e = i;
        while (e < j.length() && Character.isDigit(j.charAt(e))) e++;
        return e > i ? Integer.parseInt(j.substring(i, e)) : 0;
    }

    @Override
    public void onBackPressed() {
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
        if (exitReceiver != null) unregisterReceiver(exitReceiver);
    }
}
