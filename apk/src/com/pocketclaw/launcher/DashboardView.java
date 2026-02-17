package com.pocketclaw.launcher;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;

/**
 * Canvas-rendered CRT dashboard. 4 pages: STATUS / LOGS / KEYS / CTRL.
 * Replaces WebView and TextView-based layouts entirely.
 */
public class DashboardView extends View {

    // Pages
    public static final int PAGE_STATUS = 0;
    public static final int PAGE_LOGS   = 1;
    public static final int PAGE_KEYS   = 2;
    public static final int PAGE_CTRL   = 3;
    private static final String[] PAGE_NAMES = {"STATUS", "LOGS", "KEYS", "CTRL"};

    private int currentPage = PAGE_STATUS;
    private CRTRenderer crt;
    private long lastFrameTime = 0;
    private boolean effectsEnabled = true;

    // Data from API
    private boolean gatewayUp = false;
    private boolean wifiOn = false;
    private boolean telegramLive = false;
    private boolean kimiOk = false;
    private int ramUsed = 0, ramTotal = 1;
    private int swapUsed = 0, swapTotal = 0;
    private String uptime = "0m";
    private String lastError = null;
    private String batteryInfo = "?";
    private String storageInfo = "?";
    private String[][] procs = new String[0][]; // {name, mb}
    private String[] logs = new String[0];
    private int lazyTotal = 0, lazyLoaded = 0, lazyDead = 0;
    private boolean serverMode = false;

    // Crab animation
    private String[] crabFrames;
    private int crabFrame = 0;

    // Keys data
    public static class KeyInfo {
        public String name;
        public boolean set;
        public String masked;
        public KeyInfo(String n, boolean s, String m) { name = n; set = s; masked = m; }
    }
    private ArrayList<KeyInfo> keys = new ArrayList<>();

    // CTRL page state
    private int brightness = 60;
    private int volume = 50;
    private boolean wifiToggle = false;
    private boolean flashlight = false;

    // Touch tracking for tabs and controls
    private final RectF[] tabRects = new RectF[4];
    private final RectF brightnessSlider = new RectF();
    private final RectF volumeSlider = new RectF();
    private final RectF wifiRect = new RectF();
    private final RectF flashRect = new RectF();
    private final RectF serverRect = new RectF();
    private final RectF rebootRect = new RectF();
    private final ArrayList<RectF> keyEditRects = new ArrayList<>();
    private final ArrayList<RectF> keyTestRects = new ArrayList<>();

    // Swipe detection
    private float touchDownX = 0, touchDownY = 0;
    private boolean swipeTracking = false;
    private boolean isDraggingSlider = false;
    private int dragTarget = -1; // 0=brightness, 1=volume

    // Boot animation
    private boolean bootAnimDone = false;
    private long bootStartTime = 0;
    private static final String[] BOOT_LINES = {
        "> POCKETCLAW v3.0",
        "> GATEWAY .............. ",
        "> WIFI ................. ",
        "> TELEGRAM ............. ",
        "> KIMI K2.5 ............ ",
        "> RAM .................. ",
        "> SYSTEM ONLINE_"
    };

    // Listener for control actions
    public interface ControlListener {
        void onBrightnessChanged(int pct);
        void onVolumeChanged(int pct);
        void onWifiToggle(boolean on);
        void onFlashlightToggle(boolean on);
        void onServerModeToggle(boolean on);
        void onReboot();
        void onKeyEdit(String name);
        void onKeyTest(String name);
        void onPageChanged(int page);
    }
    private ControlListener listener;

    public DashboardView(Context context) {
        super(context);
        float density = context.getResources().getDisplayMetrics().density;
        crt = new CRTRenderer(density);
        for (int i = 0; i < 4; i++) tabRects[i] = new RectF();
        bootStartTime = System.currentTimeMillis();
        // LAYER_TYPE_NONE — software layer exceeds 2MB cache limit on Moto E2
        // setShadowLayer glow won't render, but text will be visible
        setLayerType(LAYER_TYPE_NONE, null);
    }

    public void setControlListener(ControlListener l) { this.listener = l; }
    public void setCurrentPage(int page) { this.currentPage = page; invalidate(); }
    public int getCurrentPage() { return currentPage; }
    public void setEffectsEnabled(boolean e) { this.effectsEnabled = e; }

    // Data setters — each triggers a single redraw
    public void setCrabFrames(String[] frames) { this.crabFrames = frames; }
    public void setGatewayUp(boolean up) { this.gatewayUp = up; }
    public void setWifiOn(boolean on) { this.wifiOn = on; }
    public void setTelegramLive(boolean live) { this.telegramLive = live; }
    public void setKimiOk(boolean ok) { this.kimiOk = ok; }
    public void setRam(int used, int total) { this.ramUsed = used; this.ramTotal = Math.max(1, total); }
    public void setSwap(int used, int total) { this.swapUsed = used; this.swapTotal = total; }
    public void setUptime(String u) { this.uptime = u; }
    public void setLastError(String e) { this.lastError = e; }
    public void setBatteryInfo(String b) { this.batteryInfo = b; }
    public void setStorageInfo(String s) { this.storageInfo = s; }
    public void setProcs(String[][] p) { this.procs = p; }
    public void setLogs(String[] l) { this.logs = l; }
    public void setLazy(int total, int loaded, int dead) { this.lazyTotal = total; this.lazyLoaded = loaded; this.lazyDead = dead; }
    public void setServerMode(boolean m) { this.serverMode = m; }
    public void setKeys(ArrayList<KeyInfo> k) { this.keys = k; }
    public void setBrightness(int b) { this.brightness = b; }
    public void setVolume(int v) { this.volume = v; }
    public void setWifiToggle(boolean w) { this.wifiToggle = w; }
    public void setFlashlight(boolean f) { this.flashlight = f; }
    public void setBootAnimDone() { this.bootAnimDone = true; }

    /** Call after batch-setting data to trigger a single redraw */
    public void refreshView() { invalidate(); }

    @Override
    protected void onDraw(Canvas canvas) {
        int w = getWidth(), h = getHeight();
        if (w == 0 || h == 0) return;

        canvas.drawColor(CRTRenderer.BG);

        float pad = crt.dp(12);

        // No tab bar — tabs are native TextViews in LauncherActivity
        // No STATUS page — that's the original TextView layout
        switch (currentPage) {
            case PAGE_LOGS:   drawLogsPage(canvas, w, h, pad); break;
            case PAGE_KEYS:   drawKeysPage(canvas, w, h, pad); break;
            case PAGE_CTRL:   drawCtrlPage(canvas, w, h, pad); break;
        }

        // CRT effects overlay
        if (effectsEnabled) {
            crt.drawScanlines(canvas, w, h);
            crt.drawVignette(canvas, w, h);
        }
    }

    // ─── LOGS PAGE ────────────────────────────────────────────────

    private void drawLogsPage(Canvas canvas, int w, int h, float pad) {
        float y = pad;

        crt.drawText(canvas, "LOGS", (w - crt.measureText("LOGS", 20)) / 2, y, 20, CRTRenderer.GREEN);
        y += crt.getLineHeight(20) + crt.dp(2);

        String sub = "REAL-TIME GATEWAY OUTPUT";
        crt.drawText(canvas, sub, (w - crt.measureText(sub, 9)) / 2, y, 9, CRTRenderer.DIM);
        y += crt.getLineHeight(9) + crt.dp(8);

        // All log lines
        for (int i = 0; i < logs.length; i++) {
            String line = logs[i];
            if (line.length() > 42) line = line.substring(0, 42);
            int color = line.contains("ERROR") || line.startsWith("!") ? CRTRenderer.RED :
                        line.contains("WARN") ? CRTRenderer.WARN : CRTRenderer.MID;
            crt.drawText(canvas, "\u203A " + line, pad, y, 10, color);
            y += crt.getLineHeight(10) + crt.dp(1);
        }

        if (logs.length == 0) {
            crt.drawText(canvas, "Waiting for logs...", pad, y, 12, CRTRenderer.DIM);
        }
    }

    // ─── KEYS PAGE ────────────────────────────────────────────────

    private void drawKeysPage(Canvas canvas, int w, int h, float pad) {
        float y = pad;

        crt.drawText(canvas, "API KEYS", (w - crt.measureText("API KEYS", 20)) / 2, y, 20, CRTRenderer.GREEN);
        y += crt.getLineHeight(20) + crt.dp(2);

        String sub = "MANAGE YOUR CREDENTIALS";
        crt.drawText(canvas, sub, (w - crt.measureText(sub, 9)) / 2, y, 9, CRTRenderer.DIM);
        y += crt.getLineHeight(9) + crt.dp(12);

        keyEditRects.clear();
        keyTestRects.clear();

        for (int i = 0; i < keys.size(); i++) {
            KeyInfo k = keys.get(i);

            // Key card
            float cardH = crt.dp(56);
            crt.drawBorderedRect(canvas, pad, y, w - pad * 2, cardH, 0xFF000D00, CRTRenderer.DIM);

            // Dot
            float dotY = y + crt.dp(14);
            crt.drawStatusDot(canvas, pad + crt.dp(14), dotY, crt.dp(4), k.set);

            // Name
            crt.drawText(canvas, k.name, pad + crt.dp(28), y + crt.dp(16), 10, CRTRenderer.GREEN);

            // Masked value
            String val = k.set ? k.masked : "not set";
            int valColor = k.set ? CRTRenderer.MID : 0xFF555555;
            crt.drawText(canvas, val, pad + crt.dp(28), y + crt.dp(32), 8, valColor);

            // EDIT button
            float btnW = crt.dp(42);
            float btnH = crt.dp(20);
            float editX = w - pad - btnW - crt.dp(8);
            float editY = y + crt.dp(8);
            if (k.set) {
                float testX = editX - btnW - crt.dp(8);
                crt.drawBorderedRect(canvas, testX, editY, btnW, btnH, 0xFF001A00, CRTRenderer.DIM);
                String testStr = "TEST";
                crt.drawText(canvas, testStr, testX + (btnW - crt.measureText(testStr, 8)) / 2, editY + crt.dp(14), 8, CRTRenderer.MID);
                keyTestRects.add(new RectF(testX, editY, testX + btnW, editY + btnH));
            } else {
                keyTestRects.add(new RectF());
            }
            crt.drawBorderedRect(canvas, editX, editY, btnW, btnH, 0xFF001A00, CRTRenderer.DIM);
            String editStr = "EDIT";
            crt.drawText(canvas, editStr, editX + (btnW - crt.measureText(editStr, 8)) / 2, editY + crt.dp(14), 8, CRTRenderer.MID);
            keyEditRects.add(new RectF(editX, editY, editX + btnW, editY + btnH));

            y += cardH + crt.dp(6);
        }

        y += crt.dp(12);
        String footer = "ALL KEYS STORED LOCALLY ON DEVICE";
        crt.drawText(canvas, footer, (w - crt.measureText(footer, 6)) / 2, y, 6, 0xFF082A08);
    }

    // ─── CTRL PAGE ────────────────────────────────────────────────

    private void drawCtrlPage(Canvas canvas, int w, int h, float pad) {
        float y = pad;

        crt.drawText(canvas, "CONTROL", (w - crt.measureText("CONTROL", 20)) / 2, y, 20, CRTRenderer.GREEN);
        y += crt.getLineHeight(20) + crt.dp(16);

        float sliderW = w - pad * 2 - crt.dp(100);
        float sliderH = crt.dp(12);
        float sliderX = pad + crt.dp(90);
        float labelX = pad + crt.dp(8);

        // Brightness slider
        crt.drawText(canvas, "BRIGHTNESS", labelX, y + crt.dp(10), 11, CRTRenderer.MID);
        drawSlider(canvas, sliderX, y, sliderW, sliderH, brightness);
        String briStr = brightness + "%";
        crt.drawText(canvas, briStr, sliderX + sliderW + crt.dp(6), y + crt.dp(10), 11, CRTRenderer.GREEN);
        brightnessSlider.set(sliderX, y, sliderX + sliderW, y + sliderH);
        y += crt.dp(34);

        // Volume slider
        crt.drawText(canvas, "VOLUME", labelX, y + crt.dp(10), 11, CRTRenderer.MID);
        drawSlider(canvas, sliderX, y, sliderW, sliderH, volume);
        String volStr = volume + "%";
        crt.drawText(canvas, volStr, sliderX + sliderW + crt.dp(6), y + crt.dp(10), 11, CRTRenderer.GREEN);
        volumeSlider.set(sliderX, y, sliderX + sliderW, y + sliderH);
        y += crt.dp(40);

        // Separator
        crt.drawRect(canvas, pad, y, w - pad * 2, crt.dp(1), 0xFF0A3A0A);
        y += crt.dp(16);

        // Toggle: WiFi
        y = drawToggleRow(canvas, pad, y, w, "WIFI", wifiToggle, wifiRect);

        // Toggle: Flashlight
        y = drawToggleRow(canvas, pad, y, w, "FLASHLIGHT", flashlight, flashRect);

        // Toggle: Server Mode
        y = drawToggleRow(canvas, pad, y, w, "SERVER MODE", serverMode, serverRect);
        y += crt.dp(8);

        // Separator
        crt.drawRect(canvas, pad, y, w - pad * 2, crt.dp(1), 0xFF0A3A0A);
        y += crt.dp(16);

        // Reboot button
        float btnW = w - pad * 2;
        float btnH = crt.dp(36);
        crt.drawBorderedRect(canvas, pad, y, btnW, btnH, 0xFF0A0000, 0xFF552222);
        String rebootStr = "REBOOT DEVICE";
        crt.drawText(canvas, rebootStr, (w - crt.measureText(rebootStr, 13)) / 2, y + crt.dp(24), 13, CRTRenderer.RED);
        rebootRect.set(pad, y, pad + btnW, y + btnH);
    }

    private void drawSlider(Canvas canvas, float x, float y, float w, float h, int pct) {
        crt.drawRect(canvas, x, y, w, h, CRTRenderer.BAR_BG);
        float fillW = w * pct / 100f;
        if (fillW > 0) {
            crt.drawRect(canvas, x, y, fillW, h, CRTRenderer.GREEN);
        }
        crt.drawBorderedRect(canvas, x, y, w, h, 0x00000000, CRTRenderer.BAR_BORDER);
    }

    private float drawToggleRow(Canvas canvas, float pad, float y, int w, String label, boolean on, RectF hitRect) {
        float rowH = crt.dp(30);

        String dot = on ? "[ \u2605 ]" : "[ \u00B7 ]";
        crt.drawText(canvas, dot, pad + crt.dp(4), y + crt.dp(18), 12, on ? CRTRenderer.GREEN : CRTRenderer.DIM);

        crt.drawText(canvas, label, pad + crt.dp(50), y + crt.dp(18), 12, CRTRenderer.MID);

        String val = on ? "ON" : "OFF";
        int valColor = on ? CRTRenderer.GREEN : 0xFF555555;
        crt.drawText(canvas, val, w - pad - crt.measureText(val, 12), y + crt.dp(18), 12, valColor);

        hitRect.set(pad, y, w - pad, y + rowH);
        return y + rowH + crt.dp(4);
    }

    // ─── TOUCH HANDLING ───────────────────────────────────────────

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX(), y = event.getY();

        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                touchDownX = x;
                touchDownY = y;
                swipeTracking = true;
                isDraggingSlider = false;

                // Check slider drag start (CTRL page only)
                if (currentPage == PAGE_CTRL) {
                    if (brightnessSlider.contains(x, y)) {
                        isDraggingSlider = true;
                        dragTarget = 0;
                        updateSliderValue(x, brightnessSlider);
                        return true;
                    }
                    if (volumeSlider.contains(x, y)) {
                        isDraggingSlider = true;
                        dragTarget = 1;
                        updateSliderValue(x, volumeSlider);
                        return true;
                    }
                }
                return true;

            case MotionEvent.ACTION_MOVE:
                if (isDraggingSlider) {
                    if (dragTarget == 0) {
                        updateSliderValue(x, brightnessSlider);
                    } else if (dragTarget == 1) {
                        updateSliderValue(x, volumeSlider);
                    }
                    return true;
                }
                return true;

            case MotionEvent.ACTION_UP:
                if (isDraggingSlider) {
                    isDraggingSlider = false;
                    if (dragTarget == 0 && listener != null) listener.onBrightnessChanged(brightness);
                    if (dragTarget == 1 && listener != null) listener.onVolumeChanged(volume);
                    dragTarget = -1;
                    return true;
                }

                float dx = x - touchDownX;
                float dy = y - touchDownY;
                float absDx = Math.abs(dx), absDy = Math.abs(dy);

                // Horizontal swipe detection (>80dp threshold, more horizontal than vertical)
                if (absDx > crt.dp(80) && absDx > absDy * 1.5f) {
                    if (dx < 0 && currentPage < 3) {
                        currentPage++;
                        if (listener != null) listener.onPageChanged(currentPage);
                        invalidate();
                    } else if (dx > 0 && currentPage > 0) {
                        currentPage--;
                        if (listener != null) listener.onPageChanged(currentPage);
                        invalidate();
                    }
                    return true;
                }

                // Tap detection (small movement)
                if (absDx < crt.dp(10) && absDy < crt.dp(10)) {
                    handleTap(x, y);
                }
                return true;
        }
        return true;
    }

    private void updateSliderValue(float x, RectF slider) {
        float pct = (x - slider.left) / slider.width() * 100;
        pct = Math.max(0, Math.min(100, pct));
        if (slider == brightnessSlider) {
            // Min 5% — never go black, unrecoverable without ADB
            brightness = Math.max(5, Math.round(pct));
        } else {
            volume = Math.round(pct);
        }
        invalidate();
    }

    private void handleTap(float x, float y) {
        // CTRL page taps
        if (currentPage == PAGE_CTRL) {
            if (wifiRect.contains(x, y)) {
                wifiToggle = !wifiToggle;
                if (listener != null) listener.onWifiToggle(wifiToggle);
                invalidate();
                return;
            }
            if (flashRect.contains(x, y)) {
                flashlight = !flashlight;
                if (listener != null) listener.onFlashlightToggle(flashlight);
                invalidate();
                return;
            }
            if (serverRect.contains(x, y)) {
                serverMode = !serverMode;
                if (listener != null) listener.onServerModeToggle(serverMode);
                invalidate();
                return;
            }
            if (rebootRect.contains(x, y)) {
                if (listener != null) listener.onReboot();
                return;
            }
        }

        // KEYS page taps
        if (currentPage == PAGE_KEYS) {
            for (int i = 0; i < keyEditRects.size(); i++) {
                if (keyEditRects.get(i).contains(x, y) && i < keys.size()) {
                    if (listener != null) listener.onKeyEdit(keys.get(i).name);
                    return;
                }
            }
            for (int i = 0; i < keyTestRects.size(); i++) {
                if (keyTestRects.get(i).contains(x, y) && i < keys.size() && keys.get(i).set) {
                    if (listener != null) listener.onKeyTest(keys.get(i).name);
                    return;
                }
            }
        }
    }

    /**
     * Advance crab animation frame (called from fetch loop).
     */
    public void nextCrabFrame() {
        crabFrame++;
        invalidate();
    }

    /**
     * Get required content height for ScrollView measurement.
     */
    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int w = MeasureSpec.getSize(widthMeasureSpec);
        int screenH = MeasureSpec.getSize(heightMeasureSpec);
        // Fixed to screen height — no scrolling, fits in drawing cache (max ~2MB on Moto E2)
        setMeasuredDimension(w, screenH);
    }
}
