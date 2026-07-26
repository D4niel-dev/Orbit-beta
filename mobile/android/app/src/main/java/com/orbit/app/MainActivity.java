package com.orbit.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.orbit.app.plugins.OrbitP2PPlugin;
import com.orbit.app.services.OrbitForegroundService;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Install splash screen BEFORE super.onCreate() — prevents splash exit from re-showing bars
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        if (splashScreen != null) {
            splashScreen.setKeepOnScreenCondition(() -> false);
        }

        // Register plugin BEFORE super.onCreate() — known requirement from v0.0.9.1-beta fix
        registerPlugin(OrbitP2PPlugin.class);

        super.onCreate(savedInstanceState);

        enableImmersiveMode();
        createNotificationChannels();
        startForegroundService();
    }

    @Override
    public void onResume() {
        super.onResume();
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // API 30+ — modern WindowInsetsController API
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            // API 24-29 — legacy SYSTEM_UI_FLAG approach
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                var serviceChannel = new NotificationChannel(
                    OrbitForegroundService.CHANNEL_ID,
                    "Orbit P2P Service",
                    NotificationManager.IMPORTANCE_LOW
                );
                serviceChannel.setDescription("Keeps Orbit connected in the background");
                var manager = getSystemService(NotificationManager.class);
                if (manager != null) {
                    manager.createNotificationChannel(serviceChannel);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void startForegroundService() {
        try {
            var serviceIntent = new Intent(this, OrbitForegroundService.class);
            serviceIntent.setAction(OrbitForegroundService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopForegroundService() {
        try {
            var serviceIntent = new Intent(this, OrbitForegroundService.class);
            serviceIntent.setAction(OrbitForegroundService.ACTION_STOP);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
