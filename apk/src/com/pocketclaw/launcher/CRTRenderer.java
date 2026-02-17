package com.pocketclaw.launcher;

import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

/**
 * CRT rendering primitives for Canvas-based dashboard.
 * Pre-allocated Paint objects to avoid GC pressure on 1GB device.
 */
public class CRTRenderer {

    // Colors — tuned for Moto E2 LCD readability
    public static final int BG       = 0xFF000A00;
    public static final int GREEN    = 0xFF00FF41;
    public static final int DIM      = 0xFF1A6A1A;  // was 0A3A0A — much brighter for labels
    public static final int MID      = 0xFF20AA20;  // was 073707 — readable body text
    public static final int RED      = 0xFFEE3333;
    public static final int WARN     = 0xFFAAAA00;
    public static final int WHITE    = 0xFFFFFFFF;
    public static final int BAR_BG   = 0xFF002A00;  // was 001A00 — slightly brighter
    public static final int BAR_BORDER = 0xFF155515;
    public static final int DARK_BG  = 0xFF0A0A0A;

    // Pre-allocated paints
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint barPaint = new Paint();
    private final Paint barBgPaint = new Paint();
    private final Paint barBorderPaint = new Paint();
    private final Paint dotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint scanPaint = new Paint();
    private final Paint vignettePaint = new Paint();
    private final Paint beamPaint = new Paint();
    private final Paint dimPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bgPaint = new Paint();

    // Animation state
    private float scanBeamPhase = 0f;
    private float glowPulse = 0f;
    private boolean glowUp = true;

    // Cached values
    private float density = 1f;
    private int lastVigW = 0, lastVigH = 0;

    public CRTRenderer(float density) {
        this.density = density;

        textPaint.setTypeface(Typeface.MONOSPACE);
        textPaint.setColor(GREEN);

        glowPaint.setTypeface(Typeface.MONOSPACE);
        glowPaint.setColor(GREEN);

        barPaint.setStyle(Paint.Style.FILL);
        barBgPaint.setColor(BAR_BG);
        barBgPaint.setStyle(Paint.Style.FILL);
        barBorderPaint.setColor(BAR_BORDER);
        barBorderPaint.setStyle(Paint.Style.STROKE);
        barBorderPaint.setStrokeWidth(dp(1));

        dotPaint.setStyle(Paint.Style.FILL);

        scanPaint.setColor(0x18000000);
        scanPaint.setStyle(Paint.Style.FILL);

        beamPaint.setStyle(Paint.Style.FILL);

        dimPaint.setTypeface(Typeface.MONOSPACE);
        dimPaint.setColor(DIM);

        bgPaint.setStyle(Paint.Style.FILL);
    }

    public float dp(float v) { return v * density; }

    /**
     * Draw monospace text with fake glow effect (no setShadowLayer — exceeds cache on Moto E2).
     * Draws a slightly larger, dimmer version behind for the glow illusion.
     */
    public void drawGlowText(Canvas c, String text, float x, float y, float sizeSp, int color) {
        float size = dp(sizeSp);
        // Fake glow: draw blurred larger text behind
        int glowAlpha = (int)(0x30 + 0x20 * glowPulse);
        int glowColor = (glowAlpha << 24) | (color & 0x00FFFFFF);
        glowPaint.setTextSize(size + dp(1));
        glowPaint.setColor(glowColor);
        c.drawText(text, x - dp(0.5f), y, glowPaint);
        // Main text
        glowPaint.setTextSize(size);
        glowPaint.setColor(color);
        c.drawText(text, x, y, glowPaint);
    }

    /**
     * Draw text without glow.
     */
    public void drawText(Canvas c, String text, float x, float y, float sizeSp, int color) {
        textPaint.setTextSize(dp(sizeSp));
        textPaint.setColor(color);
        c.drawText(text, x, y, textPaint);
    }

    /**
     * Draw text with alignment options.
     */
    public void drawTextAlign(Canvas c, String text, float x, float y, float sizeSp, int color, Paint.Align align) {
        textPaint.setTextSize(dp(sizeSp));
        textPaint.setColor(color);
        textPaint.setTextAlign(align);
        c.drawText(text, x, y, textPaint);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    /**
     * Measure text width.
     */
    public float measureText(String text, float sizeSp) {
        textPaint.setTextSize(dp(sizeSp));
        return textPaint.measureText(text);
    }

    /**
     * Get font metrics height for a given size.
     */
    public float getLineHeight(float sizeSp) {
        textPaint.setTextSize(dp(sizeSp));
        return textPaint.getFontSpacing();
    }

    /**
     * Draw a progress bar with color gradient (red/yellow/green based on percent).
     */
    public void drawBar(Canvas c, float x, float y, float w, float h, float percent, boolean invert) {
        // Background
        c.drawRect(x, y, x + w, y + h, barBgPaint);

        // Fill
        float fillW = w * Math.max(0, Math.min(1, percent / 100f));
        if (fillW > 0) {
            int color;
            if (invert) {
                // Higher = worse (RAM usage)
                color = percent < 60 ? GREEN : percent < 80 ? WARN : RED;
            } else {
                // Higher = better
                color = percent > 60 ? GREEN : percent > 30 ? WARN : RED;
            }
            barPaint.setColor(color);
            c.drawRect(x, y, x + fillW, y + h, barPaint);
        }

        // Border
        c.drawRect(x, y, x + w, y + h, barBorderPaint);
    }

    /**
     * Draw a swap-style bar (yellow gradient).
     */
    public void drawSwapBar(Canvas c, float x, float y, float w, float h, float percent) {
        c.drawRect(x, y, x + w, y + h, barBgPaint);
        float fillW = w * Math.max(0, Math.min(1, percent / 100f));
        if (fillW > 0) {
            barPaint.setColor(WARN);
            c.drawRect(x, y, x + fillW, y + h, barPaint);
        }
        c.drawRect(x, y, x + w, y + h, barBorderPaint);
    }

    /**
     * Draw a status indicator dot (filled=on, unfilled=off).
     */
    public void drawStatusDot(Canvas c, float cx, float cy, float radius, boolean on) {
        if (on) {
            // Glow
            dotPaint.setColor(GREEN);
            dotPaint.setShadowLayer(dp(3), 0, 0, 0x7000FF41);
            c.drawCircle(cx, cy, radius, dotPaint);
            dotPaint.setShadowLayer(0, 0, 0, 0);
        } else {
            dotPaint.setColor(0xFF555555);
            c.drawCircle(cx, cy, radius, dotPaint);
        }
    }

    /**
     * Draw CRT scanlines across the entire surface.
     */
    public void drawScanlines(Canvas c, int w, int h) {
        float step = dp(3);
        scanPaint.setColor(0x18000000);
        for (float y = 0; y < h; y += step) {
            c.drawRect(0, y, w, y + dp(1), scanPaint);
        }
    }

    /**
     * Draw vignette effect (dark edges).
     */
    public void drawVignette(Canvas c, int w, int h) {
        if (w != lastVigW || h != lastVigH) {
            float cx = w / 2f, cy = h / 2f;
            float r = (float) Math.sqrt(cx * cx + cy * cy);
            vignettePaint.setShader(new RadialGradient(cx, cy, r,
                new int[]{0x00000000, 0x00000000, 0x55000A00, 0xAA000A00},
                new float[]{0f, 0.4f, 0.75f, 1f},
                Shader.TileMode.CLAMP));
            lastVigW = w;
            lastVigH = h;
        }
        c.drawRect(0, 0, w, h, vignettePaint);
    }

    /**
     * Draw the scan beam (single line sweeping top to bottom, 4s period).
     */
    public void drawScanBeam(Canvas c, int w, int h) {
        float beamY = scanBeamPhase * h;
        int alpha = (int)(0x30 + 0x20 * Math.sin(scanBeamPhase * Math.PI));
        beamPaint.setShader(new LinearGradient(0, beamY - dp(8), 0, beamY + dp(8),
            new int[]{0x00000000, (alpha << 24) | 0x0000FF41, 0x00000000},
            null, Shader.TileMode.CLAMP));
        c.drawRect(0, beamY - dp(8), w, beamY + dp(8), beamPaint);
    }

    /**
     * Draw a filled rectangle.
     */
    public void drawRect(Canvas c, float x, float y, float w, float h, int color) {
        bgPaint.setColor(color);
        c.drawRect(x, y, x + w, y + h, bgPaint);
    }

    /**
     * Draw a bordered rectangle.
     */
    public void drawBorderedRect(Canvas c, float x, float y, float w, float h, int bgColor, int borderColor) {
        bgPaint.setColor(bgColor);
        c.drawRect(x, y, x + w, y + h, bgPaint);
        barBorderPaint.setColor(borderColor);
        c.drawRect(x, y, x + w, y + h, barBorderPaint);
        barBorderPaint.setColor(BAR_BORDER);
    }

    /**
     * Advance animations. Call each frame.
     * @param dt delta time in seconds
     */
    public void tick(float dt) {
        // Scan beam: 4s period
        scanBeamPhase += dt / 4f;
        if (scanBeamPhase > 1f) scanBeamPhase -= 1f;

        // Glow pulse: 3s period
        if (glowUp) {
            glowPulse += dt / 1.5f;
            if (glowPulse >= 1f) { glowPulse = 1f; glowUp = false; }
        } else {
            glowPulse -= dt / 1.5f;
            if (glowPulse <= 0f) { glowPulse = 0f; glowUp = true; }
        }
    }

    public float getGlowPulse() { return glowPulse; }
}
