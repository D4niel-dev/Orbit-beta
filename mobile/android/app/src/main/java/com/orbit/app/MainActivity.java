package com.orbit.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.orbit.app.plugins.OrbitP2PPlugin;
import com.orbit.app.services.OrbitForegroundService;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OrbitP2PPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();
        startForegroundService();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel messages = new NotificationChannel(
                "orbit_messages",
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            messages.setDescription("New messages from friends and groups");
            messages.enableVibration(true);
            messages.setShowBadge(true);

            NotificationChannel general = new NotificationChannel(
                "orbit_general",
                "General",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            general.setDescription("Group invites and other notifications");

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(messages);
                nm.createNotificationChannel(general);
            }
        }
    }

    private void startForegroundService() {
        try {
            Intent intent = new Intent(this, OrbitForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Failed to start foreground service", e);
        }
    }
}
