package com.pocketclaw.launcher;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

public class FloatingCrabService extends Service {
    private WindowManager wm;
    private TextView crabBtn;
    private BroadcastReceiver serverModeReceiver;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);

        crabBtn = new TextView(this);
        crabBtn.setText("(\u003E");  // (>  mini crab pincer
        crabBtn.setTextSize(16);
        crabBtn.setTextColor(0xFFEE3333);
        crabBtn.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        crabBtn.setBackgroundColor(0xCC000000);
        crabBtn.setGravity(Gravity.CENTER);
        int pad = (int) (8 * getResources().getDisplayMetrics().density);
        crabBtn.setPadding(pad, pad / 2, pad, pad / 2);

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.BOTTOM | Gravity.RIGHT;
        params.x = 16;
        params.y = 16;

        crabBtn.setOnClickListener(v -> {
            Intent home = new Intent(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(home);
        });

        // Allow dragging
        crabBtn.setOnTouchListener(new View.OnTouchListener() {
            int initX, initY;
            float touchX, touchY;
            boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initX = params.x;
                        initY = params.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        moved = false;
                        return false;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (touchX - event.getRawX());
                        int dy = (int) (touchY - event.getRawY());
                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true;
                        if (moved) {
                            params.x = initX + dx;
                            params.y = initY + dy;
                            wm.updateViewLayout(crabBtn, params);
                        }
                        return moved;
                    case MotionEvent.ACTION_UP:
                        return moved;
                }
                return false;
            }
        });

        wm.addView(crabBtn, params);

        // Listen for server mode toggle to hide/show
        serverModeReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                boolean hide = intent.getBooleanExtra("hide", false);
                crabBtn.setVisibility(hide ? View.GONE : View.VISIBLE);
            }
        };
        registerReceiver(serverModeReceiver, new IntentFilter("com.pocketclaw.CRAB_VISIBILITY"));
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (crabBtn != null) wm.removeView(crabBtn);
        if (serverModeReceiver != null) unregisterReceiver(serverModeReceiver);
    }
}
