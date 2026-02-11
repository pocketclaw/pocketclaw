package com.pocketclaw.launcher;

import android.app.Activity;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class LauncherActivity extends Activity {
    private TextView crabView, statusView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable fetchTask = this::fetchLoop;
    private int frame = 0;

    private static final String[] CRAB = {
        "        __            __\n" +
        "       / <`          '> \\\n" +
        "      (  / @        @ \\  )\n" +
        "       \\(_ _\\  .--.  /_ _)/\n" +
        "     (\\ `-/  .'  '.  \\-' /)\n" +
        "      \"===\\ / .::. \\ /===\"\n" +
        "       .==')(.:::::.)(`==.\n" +
        "      ' .='  ':::::' `=. '\n" +
        "     /  / .::::::::::. \\  \\\n" +
        "    |  | (::::::::::::) |  |\n" +
        "     \\  \\ '::::::::::' /  /\n" +
        "      \\  \\  |  ||  |  /  /\n" +
        "       \\  \\ |  ||  | /  /\n" +
        "        '-.\\|__||__|/.-'\n" +
        "            ^^  ^^",
        "        __            __\n" +
        "       ( <`          '> )\n" +
        "      (  / @        @ \\  )\n" +
        "       \\(_ _\\  .--.  /_ _)/\n" +
        "     (\\ `-/  .'  '.  \\-' /)\n" +
        "      \"===\\ / .::. \\ /===\"\n" +
        "       .==')(.:::::.)(`==.\n" +
        "      ' .='  ':::::' `=. '\n" +
        "     /  / .::::::::::. \\  \\\n" +
        "    |  | (::::::::::::) |  |\n" +
        "     \\  \\ '::::::::::' /  /\n" +
        "      \\  \\  |  ||  |  /  /\n" +
        "       \\  \\ |  ||  | /  /\n" +
        "        '-.\\|__||__|/.-'\n" +
        "            ^^  ^^"
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        float d = getResources().getDisplayMetrics().density;
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xFF000A00);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding((int)(16*d), (int)(24*d), (int)(16*d), (int)(16*d));

        // Title
        TextView title = mono("POCKETCLAW", 24, 0xFFFFFFFF);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.3f);
        root.addView(title);

        // Subtitle
        TextView sub = mono("MOTO E2 \u2022 1GB \u2022 ANDROID 6", 9, 0xFF1A3A1A);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, (int)(2*d), 0, (int)(8*d));
        root.addView(sub);

        // Lobster
        crabView = mono(CRAB[0], 11, 0xFFEE3333);
        crabView.setGravity(Gravity.CENTER_HORIZONTAL);
        crabView.setPadding(0, (int)(4*d), 0, (int)(12*d));
        root.addView(crabView);

        // Status
        statusView = mono("\u25CB Gateway    Connecting...", 11, 0xFF00AA00);
        statusView.setPadding((int)(4*d), 0, (int)(4*d), (int)(8*d));
        statusView.setLineSpacing(0, 1.15f);
        root.addView(statusView);

        // Footer
        TextView ft = mono("V8 128MB \u2022 PROOT \u2022 NODE 22 \u2022 KIMI", 8, 0xFF082A08);
        ft.setGravity(Gravity.CENTER);
        ft.setPadding(0, (int)(8*d), 0, 0);
        root.addView(ft);

        scroll.addView(root);
        setContentView(scroll);
        fetchLoop();
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
            String display;
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
                display = format(sb.toString());
            } catch (Exception e) {
                display = "\u25CB Gateway    OFFLINE\n\nWaiting for boot...";
            }
            final String d = display;
            handler.post(() -> {
                statusView.setText(d);
                crabView.setText(CRAB[frame % 2]);
                frame++;
            });
            handler.postDelayed(fetchTask, 3000);
        }).start();
    }

    private String format(String j) {
        StringBuilder s = new StringBuilder();
        s.append(dot(j, "\"status\":\"up\"")).append(" Gateway    ").append(has(j, "\"status\":\"up\"") ? "200 OK" : "DOWN").append('\n');
        s.append(dot(j, "\"wifi\":true")).append(" WiFi       ").append(has(j, "\"wifi\":true") ? "Online" : "Offline").append('\n');
        s.append(dot(j, "\"telegram\":true")).append(" Telegram   ").append(has(j, "\"telegram\":true") ? "Live" : "Down").append('\n');
        s.append(dot(j, "\"kimi\":true")).append(" Kimi K2.5  ").append(has(j, "\"kimi\":true") ? "Connected" : "No Key").append('\n');
        s.append('\n');

        int ri = j.indexOf("\"ram\":{");
        if (ri >= 0) {
            int used = num(j, "\"used\":", ri);
            int total = num(j, "\"total\":", ri);
            if (total > 0) {
                int pct = Math.round((float) used / total * 100);
                s.append("RAM  ").append(used).append('/').append(total).append(" MB (").append(pct).append("%)\n");
                int filled = pct / 5;
                for (int i = 0; i < 20; i++) s.append(i < filled ? '\u2588' : '\u2591');
                s.append("\n\n");
            }
        }

        s.append("TOP PROCESSES\n");
        int pi = 0;
        while (true) {
            int nS = j.indexOf("\"n\":\"", pi);
            if (nS < 0) break;
            nS += 5;
            int nE = j.indexOf('"', nS);
            String name = j.substring(nS, nE);
            if (name.length() > 15) name = name.substring(0, 15);
            int mS = j.indexOf("\"m\":", nE) + 4;
            int mE = mS;
            while (mE < j.length() && Character.isDigit(j.charAt(mE))) mE++;
            int mem = Integer.parseInt(j.substring(mS, mE));
            s.append(String.format("%-15s %4d MB\n", name, mem));
            pi = mE;
        }

        int si = j.indexOf("\"swap\":{");
        if (si >= 0) {
            s.append('\n').append("Swap ").append(num(j, "\"used\":", si)).append('/').append(num(j, "\"total\":", si)).append(" MB");
        }
        int ui = j.indexOf("\"uptime\":\"");
        if (ui >= 0) {
            int a = ui + 10, b = j.indexOf('"', a);
            s.append("  \u2022  up: ").append(j.substring(a, b));
        }
        return s.toString();
    }

    private boolean has(String j, String k) { return j.contains(k); }
    private String dot(String j, String k) { return has(j, k) ? "\u25CF" : "\u25CB"; }

    private int num(String j, String key, int from) {
        int i = j.indexOf(key, from);
        if (i < 0) return 0;
        i += key.length();
        int e = i;
        while (e < j.length() && Character.isDigit(j.charAt(e))) e++;
        return e > i ? Integer.parseInt(j.substring(i, e)) : 0;
    }

    @Override
    public void onBackPressed() {}
}
