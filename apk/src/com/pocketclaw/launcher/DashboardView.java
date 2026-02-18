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
    private int heapUsed = 0, heapLimit = 0;

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

    // Module data (from /api/modules)
    public static class ModuleInfo {
        public String id, name, type, key, status;
        public int ram;
        public boolean keySet, canToggle;
    }
    private ArrayList<ModuleInfo> modules = new ArrayList<>();
    private boolean restartNeeded = false;

    // Keys search filter
    private String keyFilter = "";
    private final RectF searchBarRect = new RectF();
    private final RectF searchClearRect = new RectF();
    private ArrayList<KeyInfo> displayedKeys = new ArrayList<>();

    // Scroll support (shared, reset on page change)
    private float scrollY = 0;
    private float maxScrollY = 0;
    private float lastTouchY = 0;
    private boolean isScrolling = false;

    // Pull-to-refresh for KEYS
    private float pullDistance = 0;
    private boolean pullTriggered = false;

    // CTRL page state
    private int brightness = 60;
    private int volume = 50;
    private boolean wifiToggle = false;
    private boolean flashlight = false;
    private boolean systemSetupExpanded = false;

    // Touch tracking for tabs and controls
    private final RectF[] tabRects = new RectF[4];
    private final RectF brightnessSlider = new RectF();
    private final RectF volumeSlider = new RectF();
    private final RectF wifiRect = new RectF();
    private final RectF flashRect = new RectF();
    private final RectF serverRect = new RectF();
    private final RectF gcRect = new RectF();
    private final RectF rebootRect = new RectF();
    private final RectF setupToggleRect = new RectF();
    private final RectF debloatRect = new RectF();
    private final RectF hardenRect = new RectF();
    private final RectF setHomeRect = new RectF();
    private final ArrayList<RectF> keyEditRects = new ArrayList<>();
    private final ArrayList<RectF> keyTestRects = new ArrayList<>();
    private final ArrayList<RectF> moduleToggleRects = new ArrayList<>();
    private final ArrayList<String> moduleToggleIds = new ArrayList<>();
    private final ArrayList<Boolean> moduleToggleEnable = new ArrayList<>();

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
        void onModuleToggle(String id, boolean enable);
        void onPageChanged(int page);
        void onKeySearch(String currentFilter);
        void onForceGC();
        void onKeysRefresh();
        void onDebloat();
        void onHarden();
        void onSetHome();
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
    public void setCurrentPage(int page) {
        if (this.currentPage == PAGE_KEYS && page != PAGE_KEYS) keyFilter = "";
        this.currentPage = page; this.scrollY = 0; this.pullDistance = 0; invalidate();
    }
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
    public void setModules(ArrayList<ModuleInfo> m) { this.modules = m; }
    public void setRestartNeeded(boolean r) { this.restartNeeded = r; }
    public void setBrightness(int b) { this.brightness = b; }
    public void setVolume(int v) { this.volume = v; }
    public void setWifiToggle(boolean w) { this.wifiToggle = w; }
    public void setFlashlight(boolean f) { this.flashlight = f; }
    public void setBootAnimDone() { this.bootAnimDone = true; }
    public void setHeap(int used, int limit) { this.heapUsed = used; this.heapLimit = limit; }
    public void setKeyFilter(String f) { this.keyFilter = f != null ? f : ""; scrollY = 0; invalidate(); }
    public String getKeyFilter() { return keyFilter; }

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
        float maxY = h;
        float lineH = crt.getLineHeight(10) + crt.dp(1);
        float heapLineH = heapLimit > 0 ? crt.getLineHeight(8) + crt.dp(6) : 0;
        float lazyLineH = lazyTotal > 0 ? crt.getLineHeight(8) + crt.dp(4) : 0;
        float headerH = crt.getLineHeight(20) + crt.dp(2) + crt.getLineHeight(9) + crt.dp(8)
                       + heapLineH + lazyLineH;
        int maxLines = (int)((maxY - pad - headerH) / lineH);
        int showCount = Math.min(logs.length, Math.max(1, maxLines));

        float contentH = headerH + showCount * lineH;
        float y = Math.max(pad, (maxY - contentH) / 2);

        crt.drawText(canvas, "LOGS", (w - crt.measureText("LOGS", 20)) / 2, y, 20, CRTRenderer.GREEN);
        y += crt.getLineHeight(20) + crt.dp(2);

        String sub = "REAL-TIME GATEWAY OUTPUT";
        crt.drawText(canvas, sub, (w - crt.measureText(sub, 9)) / 2, y, 9, CRTRenderer.DIM);
        y += crt.getLineHeight(9) + crt.dp(4);

        // V8 Heap monitor
        if (heapLimit > 0) {
            String heapStr = "V8 HEAP: " + heapUsed + "/" + heapLimit + "MB";
            crt.drawText(canvas, heapStr, pad, y, 8, CRTRenderer.MID);
            float barX = pad + crt.measureText(heapStr, 8) + crt.dp(6);
            float barW = w - barX - pad;
            float pct = heapUsed * 100f / heapLimit;
            crt.drawBar(canvas, barX, y - crt.dp(4), barW, crt.dp(6), pct, true);
            y += crt.getLineHeight(8) + crt.dp(2);
        }

        // Lazy loading info
        if (lazyTotal > 0) {
            String lazyStr = "LAZY: " + lazyLoaded + "/" + lazyTotal + " loaded  DEAD: " + lazyDead;
            crt.drawText(canvas, lazyStr, pad, y, 8, CRTRenderer.DIM);
            y += crt.getLineHeight(8) + crt.dp(4);
        }

        y += crt.dp(4);
        int startIdx = Math.max(0, logs.length - showCount);
        for (int i = startIdx; i < logs.length && y + lineH <= maxY; i++) {
            String line = logs[i];
            if (line.length() > 42) line = line.substring(0, 42);
            int color = line.contains("ERROR") || line.startsWith("!") ? CRTRenderer.RED :
                        line.contains("WARN") ? CRTRenderer.WARN : CRTRenderer.MID;
            crt.drawText(canvas, "\u203A " + line, pad, y, 10, color);
            y += lineH;
        }

        if (logs.length == 0) {
            crt.drawText(canvas, "Waiting for logs...", pad, y, 12, CRTRenderer.DIM);
        }
    }

    // ─── KEYS PAGE (with module info + scroll) ─────────────────────

    private ModuleInfo findModuleForKey(String keyName) {
        for (int i = 0; i < modules.size(); i++) {
            ModuleInfo m = modules.get(i);
            if (m.key != null && m.key.equals(keyName)) return m;
        }
        return null;
    }

    private String getKeyType(KeyInfo k) {
        ModuleInfo mod = findModuleForKey(k.name);
        return (mod != null && mod.type != null) ? mod.type : "other";
    }

    private boolean matchesFilter(KeyInfo k) {
        if (keyFilter.isEmpty()) return true;
        String f = keyFilter.toLowerCase();
        if (k.name.toLowerCase().contains(f)) return true;
        ModuleInfo mod = findModuleForKey(k.name);
        if (mod != null) {
            if (mod.name != null && mod.name.toLowerCase().contains(f)) return true;
            if (mod.type != null && mod.type.toLowerCase().contains(f)) return true;
        }
        return false;
    }

    private void drawKeysPage(Canvas canvas, int w, int h, float pad) {
        float viewH = h;
        float cardH = crt.dp(76);
        float cardGap = crt.dp(6);
        float searchH = crt.dp(30);
        float catHeaderH = crt.dp(20);

        // Count filtered keys and categories
        int filteredCount = 0, providerCount = 0, channelCount = 0, otherCount = 0;
        boolean hasModules = !modules.isEmpty();
        for (int i = 0; i < keys.size(); i++) {
            if (matchesFilter(keys.get(i))) {
                filteredCount++;
                if (hasModules) {
                    String type = getKeyType(keys.get(i));
                    if ("provider".equals(type)) providerCount++;
                    else if ("channel".equals(type)) channelCount++;
                    else otherCount++;
                }
            }
        }

        // Compute content height
        float headerH = crt.getLineHeight(20) + crt.dp(2) + crt.getLineHeight(9) + crt.dp(8)
                       + searchH + crt.dp(8);
        float cardsH;
        if (hasModules) {
            cardsH = 0;
            if (providerCount > 0) cardsH += catHeaderH + providerCount * cardH + (providerCount - 1) * cardGap + cardGap;
            if (channelCount > 0) cardsH += catHeaderH + channelCount * cardH + (channelCount - 1) * cardGap + cardGap;
            if (otherCount > 0) cardsH += catHeaderH + otherCount * cardH + (otherCount - 1) * cardGap + cardGap;
        } else {
            cardsH = filteredCount > 0 ? filteredCount * cardH + (filteredCount - 1) * cardGap : 0;
        }
        float restartH = restartNeeded ? crt.dp(24) : 0;
        float footerH = crt.dp(12) + crt.getLineHeight(6);
        float totalContentH = headerH + cardsH + restartH + footerH;

        maxScrollY = Math.max(0, totalContentH - viewH + pad * 2);
        scrollY = Math.max(0, Math.min(scrollY, maxScrollY));

        // Pull-to-refresh indicator (before scroll transform)
        if (pullDistance > 0 && scrollY == 0) {
            String pullStr = pullDistance > crt.dp(60) ? "RELEASE TO REFRESH" : "PULL TO REFRESH";
            int pullColor = pullDistance > crt.dp(60) ? CRTRenderer.GREEN : CRTRenderer.DIM;
            float pullY = Math.min(pullDistance * 0.4f, crt.dp(30));
            crt.drawText(canvas, pullStr, (w - crt.measureText(pullStr, 9)) / 2, pullY, 9, pullColor);
        }

        canvas.save();
        canvas.clipRect(0, 0, w, viewH);
        canvas.translate(0, -scrollY);

        float y = pad;

        crt.drawText(canvas, "API KEYS", (w - crt.measureText("API KEYS", 20)) / 2, y, 20, CRTRenderer.GREEN);
        y += crt.getLineHeight(20) + crt.dp(2);

        String sub = "MANAGE YOUR CREDENTIALS";
        crt.drawText(canvas, sub, (w - crt.measureText(sub, 9)) / 2, y, 9, CRTRenderer.DIM);
        y += crt.getLineHeight(9) + crt.dp(8);

        // Search bar
        float searchW = w - pad * 2;
        crt.drawBorderedRect(canvas, pad, y, searchW, searchH, 0xFF000D00,
            keyFilter.isEmpty() ? CRTRenderer.DIM : CRTRenderer.GREEN);
        if (keyFilter.isEmpty()) {
            crt.drawText(canvas, "\u203A SEARCH KEYS...", pad + crt.dp(8), y + crt.dp(20), 10, CRTRenderer.DIM);
        } else {
            crt.drawText(canvas, "\u203A " + keyFilter, pad + crt.dp(8), y + crt.dp(20), 10, CRTRenderer.GREEN);
            String clearStr = "[X]";
            float clearX = w - pad - crt.measureText(clearStr, 10) - crt.dp(8);
            crt.drawText(canvas, clearStr, clearX, y + crt.dp(20), 10, CRTRenderer.RED);
            searchClearRect.set(clearX - crt.dp(4), y, w - pad, y + searchH);
            String countStr = filteredCount + "/" + keys.size();
            float countW = crt.measureText(countStr, 8);
            crt.drawText(canvas, countStr, clearX - countW - crt.dp(8), y + crt.dp(20), 8, CRTRenderer.MID);
        }
        searchBarRect.set(pad, y, w - pad, y + searchH);
        y += searchH + crt.dp(8);

        keyEditRects.clear();
        keyTestRects.clear();
        moduleToggleRects.clear();
        moduleToggleIds.clear();
        moduleToggleEnable.clear();
        displayedKeys.clear();

        if (hasModules) {
            if (providerCount > 0) {
                crt.drawText(canvas, "\u2500 PROVIDERS", pad + crt.dp(4), y + crt.dp(14), 8, CRTRenderer.DIM);
                y += catHeaderH;
                for (int i = 0; i < keys.size(); i++) {
                    KeyInfo k = keys.get(i);
                    if (!matchesFilter(k) || !"provider".equals(getKeyType(k))) continue;
                    displayedKeys.add(k);
                    drawKeyCard(canvas, k, pad, y, w, cardH);
                    y += cardH + cardGap;
                }
            }
            if (channelCount > 0) {
                crt.drawText(canvas, "\u2500 CHANNELS", pad + crt.dp(4), y + crt.dp(14), 8, CRTRenderer.DIM);
                y += catHeaderH;
                for (int i = 0; i < keys.size(); i++) {
                    KeyInfo k = keys.get(i);
                    if (!matchesFilter(k) || !"channel".equals(getKeyType(k))) continue;
                    displayedKeys.add(k);
                    drawKeyCard(canvas, k, pad, y, w, cardH);
                    y += cardH + cardGap;
                }
            }
            if (otherCount > 0) {
                crt.drawText(canvas, "\u2500 OTHER", pad + crt.dp(4), y + crt.dp(14), 8, CRTRenderer.DIM);
                y += catHeaderH;
                for (int i = 0; i < keys.size(); i++) {
                    KeyInfo k = keys.get(i);
                    if (!matchesFilter(k)) continue;
                    String type = getKeyType(k);
                    if ("provider".equals(type) || "channel".equals(type)) continue;
                    displayedKeys.add(k);
                    drawKeyCard(canvas, k, pad, y, w, cardH);
                    y += cardH + cardGap;
                }
            }
        } else {
            for (int i = 0; i < keys.size(); i++) {
                KeyInfo k = keys.get(i);
                if (!matchesFilter(k)) continue;
                displayedKeys.add(k);
                drawKeyCard(canvas, k, pad, y, w, cardH);
                y += cardH + cardGap;
            }
        }

        if (restartNeeded) {
            y += crt.dp(4);
            String warn = "\u26A0 RESTART NEEDED";
            crt.drawText(canvas, warn, (w - crt.measureText(warn, 10)) / 2, y, 10, CRTRenderer.WARN);
            y += crt.dp(20);
        }

        y += crt.dp(12);
        String footer = "ALL KEYS STORED LOCALLY ON DEVICE";
        crt.drawText(canvas, footer, (w - crt.measureText(footer, 6)) / 2, y, 6, 0xFF082A08);

        canvas.restore();

        // Scroll indicator (outside scroll transform)
        if (maxScrollY > 0) {
            float thumbH = Math.max(crt.dp(20), viewH * (viewH / totalContentH));
            float thumbY = (viewH - thumbH) * (scrollY / maxScrollY);
            crt.drawRect(canvas, w - crt.dp(3), thumbY, crt.dp(2), thumbH, 0x6600FF41);
        }
    }

    private void drawKeyCard(Canvas canvas, KeyInfo k, float pad, float y, int w, float cardH) {
        ModuleInfo mod = findModuleForKey(k.name);
        crt.drawBorderedRect(canvas, pad, y, w - pad * 2, cardH, 0xFF000D00, CRTRenderer.DIM);
        crt.drawStatusDot(canvas, pad + crt.dp(14), y + crt.dp(14), crt.dp(4), k.set);
        crt.drawText(canvas, k.name, pad + crt.dp(28), y + crt.dp(16), 10, CRTRenderer.GREEN);

        String val = k.set ? k.masked : "not set";
        int valColor = k.set ? CRTRenderer.MID : 0xFF555555;
        crt.drawText(canvas, val, pad + crt.dp(28), y + crt.dp(32), 8, valColor);

        if (mod != null) {
            String statusStr = mod.status.toUpperCase();
            int statusColor = "active".equals(mod.status) ? CRTRenderer.GREEN :
                              "lazy".equals(mod.status) ? CRTRenderer.WARN : 0xFF555555;
            String modLine = mod.name + " \u2022 " + statusStr;
            if (mod.ram > 0) modLine += " \u2022 ~" + mod.ram + "MB";
            crt.drawText(canvas, modLine, pad + crt.dp(28), y + crt.dp(48), 7, statusColor);

            if (mod.canToggle) {
                boolean isDead = "dead".equals(mod.status);
                float tbtnW = crt.dp(52);
                float tbtnH = crt.dp(16);
                float tbtnX = w - pad - tbtnW - crt.dp(8);
                float tbtnY = y + crt.dp(40);
                int tbtnBorder = isDead ? CRTRenderer.DIM : CRTRenderer.WARN;
                crt.drawBorderedRect(canvas, tbtnX, tbtnY, tbtnW, tbtnH, 0xFF001A00, tbtnBorder);
                String tbtnStr = isDead ? "ENABLE" : "DISABLE";
                int tbtnColor = isDead ? CRTRenderer.MID : CRTRenderer.WARN;
                crt.drawText(canvas, tbtnStr, tbtnX + (tbtnW - crt.measureText(tbtnStr, 7)) / 2, tbtnY + crt.dp(12), 7, tbtnColor);
                moduleToggleRects.add(new RectF(tbtnX, tbtnY, tbtnX + tbtnW, tbtnY + tbtnH));
                moduleToggleIds.add(mod.id);
                moduleToggleEnable.add(isDead);
            }
        }

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
    }

    // ─── CTRL PAGE ────────────────────────────────────────────────

    private void drawCtrlPage(Canvas canvas, int w, int h, float pad) {
        float viewH = h;
        float setupBtnsH = systemSetupExpanded ? crt.dp(36) * 3 + crt.dp(8) * 3 + crt.dp(8) : 0;
        float contentH = crt.getLineHeight(20) + crt.dp(16) + crt.dp(34) + crt.dp(40)
            + crt.dp(17) + crt.dp(34) * 3 + crt.dp(8) + crt.dp(17)
            + crt.dp(36) + crt.dp(8) + crt.dp(36) + crt.dp(12)
            + crt.dp(17) + crt.dp(30) + setupBtnsH;

        maxScrollY = Math.max(0, contentH - viewH + pad * 2);
        scrollY = Math.max(0, Math.min(scrollY, maxScrollY));

        float startY = maxScrollY == 0 ? Math.max(pad, (viewH - contentH) / 2) : pad;

        canvas.save();
        canvas.clipRect(0, 0, w, viewH);
        canvas.translate(0, -scrollY);

        float y = startY;

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

        crt.drawRect(canvas, pad, y, w - pad * 2, crt.dp(1), 0xFF0A3A0A);
        y += crt.dp(16);

        y = drawToggleRow(canvas, pad, y, w, "WIFI", wifiToggle, wifiRect);
        y = drawToggleRow(canvas, pad, y, w, "FLASHLIGHT", flashlight, flashRect);
        y = drawToggleRow(canvas, pad, y, w, "SERVER MODE", serverMode, serverRect);
        y += crt.dp(8);

        crt.drawRect(canvas, pad, y, w - pad * 2, crt.dp(1), 0xFF0A3A0A);
        y += crt.dp(16);

        // Force GC button
        float btnW = w - pad * 2;
        float btnH = crt.dp(36);
        crt.drawBorderedRect(canvas, pad, y, btnW, btnH, 0xFF001A00, 0xFF116611);
        String gcStr = "FORCE GC";
        crt.drawText(canvas, gcStr, (w - crt.measureText(gcStr, 13)) / 2, y + crt.dp(24), 13, CRTRenderer.MID);
        gcRect.set(pad, y, pad + btnW, y + btnH);
        y += btnH + crt.dp(8);

        // Reboot button
        crt.drawBorderedRect(canvas, pad, y, btnW, btnH, 0xFF0A0000, 0xFF552222);
        String rebootStr = "REBOOT DEVICE";
        crt.drawText(canvas, rebootStr, (w - crt.measureText(rebootStr, 13)) / 2, y + crt.dp(24), 13, CRTRenderer.RED);
        rebootRect.set(pad, y, pad + btnW, y + btnH);
        y += btnH + crt.dp(12);

        crt.drawRect(canvas, pad, y, w - pad * 2, crt.dp(1), 0xFF0A3A0A);
        y += crt.dp(16);

        // System Setup section
        String setupPrefix = systemSetupExpanded ? "[-]" : "[+]";
        crt.drawText(canvas, setupPrefix + " SYSTEM SETUP", pad + crt.dp(4), y + crt.dp(20), 11, CRTRenderer.DIM);
        setupToggleRect.set(pad, y, w - pad, y + crt.dp(30));
        y += crt.dp(30);

        if (systemSetupExpanded) {
            y += crt.dp(8);
            crt.drawBorderedRect(canvas, pad, y, btnW, btnH, 0xFF001A00, 0xFF664400);
            String debloatStr = "DEBLOAT ANDROID";
            crt.drawText(canvas, debloatStr, (w - crt.measureText(debloatStr, 12)) / 2, y + crt.dp(24), 12, CRTRenderer.WARN);
            debloatRect.set(pad, y, pad + btnW, y + btnH);
            y += btnH + crt.dp(8);

            crt.drawBorderedRect(canvas, pad, y, btnW, btnH, 0xFF001A00, 0xFF664400);
            String hardenStr = "HARDEN SYSTEM";
            crt.drawText(canvas, hardenStr, (w - crt.measureText(hardenStr, 12)) / 2, y + crt.dp(24), 12, CRTRenderer.WARN);
            hardenRect.set(pad, y, pad + btnW, y + btnH);
            y += btnH + crt.dp(8);

            crt.drawBorderedRect(canvas, pad, y, btnW, btnH, 0xFF001A00, CRTRenderer.DIM);
            String homeStr = "SET AS HOME";
            crt.drawText(canvas, homeStr, (w - crt.measureText(homeStr, 12)) / 2, y + crt.dp(24), 12, CRTRenderer.MID);
            setHomeRect.set(pad, y, pad + btnW, y + btnH);
        } else {
            debloatRect.set(0, 0, 0, 0);
            hardenRect.set(0, 0, 0, 0);
            setHomeRect.set(0, 0, 0, 0);
        }

        canvas.restore();
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
                lastTouchY = y;
                swipeTracking = true;
                isDraggingSlider = false;
                isScrolling = false;

                // Check slider drag start (CTRL page only, adjust for scroll)
                if (currentPage == PAGE_CTRL) {
                    float cy = y + scrollY;
                    if (brightnessSlider.contains(x, cy)) {
                        isDraggingSlider = true;
                        dragTarget = 0;
                        updateSliderValue(x, brightnessSlider);
                        return true;
                    }
                    if (volumeSlider.contains(x, cy)) {
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
                // Vertical scroll on KEYS page (with pull-to-refresh)
                if (currentPage == PAGE_KEYS) {
                    float deltaY = lastTouchY - y;
                    if (Math.abs(deltaY) > crt.dp(4)) isScrolling = true;
                    if (isScrolling) {
                        if (scrollY == 0 && deltaY < 0 || pullDistance > 0) {
                            pullDistance = Math.min(crt.dp(100), pullDistance + (-deltaY));
                            if (pullDistance < 0) pullDistance = 0;
                            pullTriggered = pullDistance > crt.dp(60);
                        } else {
                            pullDistance = 0;
                            pullTriggered = false;
                            scrollY = Math.max(0, Math.min(maxScrollY, scrollY + deltaY));
                        }
                        lastTouchY = y;
                        invalidate();
                    }
                }
                // Vertical scroll on CTRL page
                if (currentPage == PAGE_CTRL && maxScrollY > 0) {
                    float deltaY = lastTouchY - y;
                    if (Math.abs(deltaY) > crt.dp(4)) isScrolling = true;
                    if (isScrolling) {
                        scrollY = Math.max(0, Math.min(maxScrollY, scrollY + deltaY));
                        lastTouchY = y;
                        invalidate();
                    }
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
                if (isScrolling) {
                    isScrolling = false;
                    if (pullTriggered && currentPage == PAGE_KEYS) {
                        if (listener != null) listener.onKeysRefresh();
                    }
                    pullDistance = 0;
                    pullTriggered = false;
                    invalidate();
                    return true;
                }

                float dx = x - touchDownX;
                float dy = y - touchDownY;
                float absDx = Math.abs(dx), absDy = Math.abs(dy);

                // Horizontal swipe detection (>80dp threshold, more horizontal than vertical)
                if (absDx > crt.dp(80) && absDx > absDy * 1.5f) {
                    if (dx < 0 && currentPage < 3) {
                        currentPage++;
                        scrollY = 0; // reset scroll on page change
                        if (listener != null) listener.onPageChanged(currentPage);
                        invalidate();
                    } else if (dx > 0 && currentPage > 0) {
                        currentPage--;
                        scrollY = 0;
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
        // CTRL page taps (adjust for scroll offset)
        if (currentPage == PAGE_CTRL) {
            float sy = y + scrollY;
            if (wifiRect.contains(x, sy)) {
                wifiToggle = !wifiToggle;
                if (listener != null) listener.onWifiToggle(wifiToggle);
                invalidate();
                return;
            }
            if (flashRect.contains(x, sy)) {
                flashlight = !flashlight;
                if (listener != null) listener.onFlashlightToggle(flashlight);
                invalidate();
                return;
            }
            if (serverRect.contains(x, sy)) {
                serverMode = !serverMode;
                if (listener != null) listener.onServerModeToggle(serverMode);
                invalidate();
                return;
            }
            if (gcRect.contains(x, sy)) {
                if (listener != null) listener.onForceGC();
                return;
            }
            if (rebootRect.contains(x, sy)) {
                if (listener != null) listener.onReboot();
                return;
            }
            if (setupToggleRect.contains(x, sy)) {
                systemSetupExpanded = !systemSetupExpanded;
                invalidate();
                return;
            }
            if (systemSetupExpanded) {
                if (debloatRect.contains(x, sy)) { if (listener != null) listener.onDebloat(); return; }
                if (hardenRect.contains(x, sy)) { if (listener != null) listener.onHarden(); return; }
                if (setHomeRect.contains(x, sy)) { if (listener != null) listener.onSetHome(); return; }
            }
        }

        // KEYS page taps (adjust for scroll offset — rects are in content coordinates)
        if (currentPage == PAGE_KEYS) {
            float sy = y + scrollY;
            // Search clear button (check first, overlaps search bar)
            if (!keyFilter.isEmpty() && searchClearRect.contains(x, sy)) {
                keyFilter = "";
                scrollY = 0;
                invalidate();
                return;
            }
            // Search bar tap
            if (searchBarRect.contains(x, sy)) {
                if (listener != null) listener.onKeySearch(keyFilter);
                return;
            }
            for (int i = 0; i < keyEditRects.size(); i++) {
                if (keyEditRects.get(i).contains(x, sy) && i < displayedKeys.size()) {
                    if (listener != null) listener.onKeyEdit(displayedKeys.get(i).name);
                    return;
                }
            }
            for (int i = 0; i < keyTestRects.size(); i++) {
                if (keyTestRects.get(i).contains(x, sy) && i < displayedKeys.size() && displayedKeys.get(i).set) {
                    if (listener != null) listener.onKeyTest(displayedKeys.get(i).name);
                    return;
                }
            }
            for (int i = 0; i < moduleToggleRects.size(); i++) {
                if (moduleToggleRects.get(i).contains(x, sy)) {
                    if (listener != null) listener.onModuleToggle(moduleToggleIds.get(i), moduleToggleEnable.get(i));
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
