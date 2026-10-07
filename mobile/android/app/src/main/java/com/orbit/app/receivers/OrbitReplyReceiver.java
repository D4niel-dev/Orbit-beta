package com.orbit.app.receivers;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * A reply typed straight into the notification shade.
 *
 * Android delivers it here, NOT to the app — the user may never open Orbit, and
 * the process may not even be alive. So this cannot hand the text to the web
 * layer directly; it parks it in a static queue and cancels the notification,
 * and the app collects it next time it is running.
 *
 * That is the same shape as OrbitSharePlugin's stash, for the same reason: the
 * thing arrives before the code that wants it.
 *
 * ⚠ Replies sent while the app is dead are NOT sent here. Delivering them would
 * mean running the whole P2P stack from a broadcast receiver, which is a much
 * larger change than this feature is. They queue until Orbit is next opened, and
 * the notification says so by staying until then. Silently dropping them would be
 * the worse failure.
 */
public class OrbitReplyReceiver extends BroadcastReceiver {

    private static final String TAG = "OrbitReply";
    public static final String EXTRA_CHAT_ID = "orbit_chat_id";
    public static final String EXTRA_NOTIF_ID = "orbit_notif_id";

    /** chatId -> text, oldest first. Guarded by the class monitor. */
    private static final List<JSONObject> pending = new ArrayList<>();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        try {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            if (results == null) return;
            CharSequence typed = results.getCharSequence("orbit_reply_text");
            if (typed == null) return;
            String text = typed.toString().trim();
            if (text.isEmpty()) return;

            String chatId = intent.getStringExtra(EXTRA_CHAT_ID);
            if (chatId == null) return;

            JSONObject entry = new JSONObject();
            entry.put("chatId", chatId);
            entry.put("text", text);
            entry.put("at", System.currentTimeMillis());
            synchronized (OrbitReplyReceiver.class) { pending.add(entry); }

            // Take the notification away: it has been answered.
            int notifId = intent.getIntExtra(EXTRA_NOTIF_ID, -1);
            if (notifId != -1) {
                try {
                    NotificationManagerCompat.from(context).cancel(notifId);
                } catch (SecurityException ignored) { }
            }
        } catch (Exception e) {
            Log.w(TAG, "could not read the inline reply", e);
        }
    }

    /** Everything queued, without clearing. The caller decides. */
    public static List<JSONObject> peek() {
        synchronized (OrbitReplyReceiver.class) {
            return new ArrayList<>(pending);
        }
    }

    /** Drop the entries that have been handed over. */
    public static void clear() {
        synchronized (OrbitReplyReceiver.class) { pending.clear(); }
    }

    /** How many are waiting, for a badge or a log. */
    public static int count() {
        synchronized (OrbitReplyReceiver.class) { return pending.size(); }
    }
}
