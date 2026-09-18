package com.orbit.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * The single place Orbit posts Android notifications from.
 *
 * Before this existed, the only native notification was an incoming message, and
 * it was posted to a channel ("orbit_messages") that nothing ever created — on
 * API 26+ a notification posted to an unknown channel is silently dropped, so
 * background message notifications never appeared at all. Every notification also
 * used {@code android.R.drawable.ic_dialog_info}, Android's built-in info icon,
 * which is why they all showed the same generic "i".
 *
 * Channels are created up front by {@link #ensureChannels(Context)} so a channel
 * always exists before anything posts to it. Channel settings are immutable once
 * created — if you need a different importance later you must use a new id, since
 * an existing channel's importance is only changeable by the user.
 */
public final class OrbitNotifications {

    // ── channel ids ──
    public static final String CH_SERVICE    = "orbit_service";     // persistent "connected" notice
    public static final String CH_MESSAGES   = "orbit_messages";    // incoming messages
    public static final String CH_MENTIONS   = "orbit_mentions";    // @mentions
    public static final String CH_CALLS      = "orbit_calls";       // incoming calls
    public static final String CH_UPDATES    = "orbit_updates";     // app updates
    public static final String CH_BACKGROUND = "orbit_background";  // progress / background work

    /** Matches res/values/colors.xml colorAccent, so notifications look like Orbit. */
    private static final int ACCENT = 0xFF89B4FA;

    /** What a notification is about. Decides both the channel and the small icon. */
    public enum Kind {
        MESSAGE   (R.drawable.ic_notify_message,    CH_MESSAGES,   NotificationCompat.PRIORITY_HIGH),
        MENTION   (R.drawable.ic_notify_mention,    CH_MENTIONS,   NotificationCompat.PRIORITY_HIGH),
        CALL      (R.drawable.ic_notify_call,       CH_CALLS,      NotificationCompat.PRIORITY_MAX),
        VIDEO_CALL(R.drawable.ic_notify_video_call, CH_CALLS,      NotificationCompat.PRIORITY_MAX),
        UPDATE    (R.drawable.ic_notify_update,     CH_UPDATES,    NotificationCompat.PRIORITY_DEFAULT),
        PROGRESS  (R.drawable.ic_notify_sync,       CH_BACKGROUND, NotificationCompat.PRIORITY_LOW),
        ERROR     (R.drawable.ic_notify_alert,      CH_MESSAGES,   NotificationCompat.PRIORITY_HIGH),
        SUCCESS   (R.drawable.ic_notify_check,      CH_MESSAGES,   NotificationCompat.PRIORITY_DEFAULT);

        public final int icon;
        public final String channel;
        public final int priority;

        Kind(int icon, String channel, int priority) {
            this.icon = icon;
            this.channel = channel;
            this.priority = priority;
        }
    }

    private OrbitNotifications() {}

    // ── channels ──

    /** Creates every channel. Safe to call on each app start; existing channels are left alone. */
    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;

        // importance: LOW = silent, DEFAULT = sound, HIGH = sound + heads-up banner
        channel(nm, CH_SERVICE,    "Orbit Connection",   "Keeps Orbit reachable in the background", NotificationManager.IMPORTANCE_LOW,  false);
        channel(nm, CH_MESSAGES,   "Messages",           "New messages from your peers",            NotificationManager.IMPORTANCE_HIGH, true);
        channel(nm, CH_MENTIONS,   "Mentions",           "When someone @mentions you",              NotificationManager.IMPORTANCE_HIGH, true);
        channel(nm, CH_CALLS,      "Calls",              "Incoming voice and video calls",          NotificationManager.IMPORTANCE_HIGH, true);
        channel(nm, CH_UPDATES,    "App updates",        "New Orbit versions",                      NotificationManager.IMPORTANCE_DEFAULT, false);
        channel(nm, CH_BACKGROUND, "Background activity", "Transfers and other background work",    NotificationManager.IMPORTANCE_LOW,  false);
    }

    private static void channel(NotificationManager nm, String id, String name,
                                String desc, int importance, boolean vibrate) {
        NotificationChannel c = new NotificationChannel(id, name, importance);
        c.setDescription(desc);
        if (vibrate) c.enableVibration(true);
        c.setShowBadge(importance >= NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(c);
    }

    // ── posting ──

    /**
     * Posts a notification, replacing any earlier one with the same group key.
     *
     * @param groupKey stable id so repeats collapse instead of stacking — pass the
     *                 chat id for messages, or null for a one-off notification.
     */
    public static void post(Context ctx, Kind kind, String title, String text,
                            String groupKey, Intent contentIntent) {
        if (ctx == null) return;
        try {
            ensureChannels(ctx);

            PendingIntent pi = null;
            if (contentIntent != null) {
                contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                pi = PendingIntent.getActivity(ctx, 0, contentIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            }

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, kind.channel)
                    .setSmallIcon(kind.icon)
                    .setContentTitle(title == null ? "Orbit" : title)
                    .setContentText(text == null ? "" : text)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text == null ? "" : text))
                    .setColor(ACCENT)
                    .setPriority(kind.priority)
                    .setAutoCancel(true);
            if (pi != null) b.setContentIntent(pi);

            int id = (groupKey == null || groupKey.isEmpty())
                    ? (int) (System.currentTimeMillis() & 0x7FFFFFFF)
                    : groupKey.hashCode();

            NotificationManagerCompat.from(ctx).notify(id, b.build());
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS not granted (API 33+) — nothing to do, the user said no.
        } catch (Exception e) {
            android.util.Log.e("OrbitNotifications", "post failed", e);
        }
    }

    /** Convenience: a notification that just opens the app. */
    public static void post(Context ctx, Kind kind, String title, String text, String groupKey) {
        post(ctx, kind, title, text, groupKey, new Intent(ctx, MainActivity.class));
    }
}
