package com.orbit.app.plugins;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Receiving a share from another app.
 *
 * WHY THE STASH IS STATIC
 * -----------------------
 * Android delivers ACTION_SEND to MainActivity, but the share can arrive at two
 * very different moments:
 *
 *   - cold start: onCreate runs long before the WebView exists, so there is
 *     nobody to hand it to yet;
 *   - warm start: MainActivity is singleTask, so a second share arrives through
 *     onNewIntent with the app already running and the page possibly reloaded.
 *
 * Both are the same problem — the intent exists before the JS that wants it. So
 * the intent is parked here and the web layer collects it when it is ready.
 * A listener alone would drop the cold-start case entirely.
 *
 * WHY THE BYTES ARE READ HERE
 * ---------------------------
 * A shared photo arrives as a content:// URI owned by the SENDING app. The
 * WebView cannot fetch that — it is not a file path and not a URL it is allowed
 * to open — so the plugin reads it through the content resolver and hands back
 * base64, which is the same shape the attach path already accepts for images.
 */
@CapacitorPlugin(name = "OrbitShare")
public class OrbitSharePlugin extends Plugin {

    private static final String TAG = "OrbitShare";

    /** Parked by MainActivity, collected by JS. Guarded by its own monitor. */
    private static JSObject pendingShare = null;

    /** Cap on what we will read into memory, matching the inline attach limit. */
    private static final long MAX_BYTES = 12L * 1024 * 1024;

    /** Called from MainActivity for both onCreate and onNewIntent. */
    public static void stashIntent(android.content.Context ctx, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return;
        }
        String type = intent.getType();
        if (type == null) return;

        try {
            JSObject out = new JSObject();
            out.put("type", type);

            // Text share: the text IS the payload.
            if (type.startsWith("text/")) {
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (text == null || text.trim().isEmpty()) return;
                out.put("text", text);
                // EXTRA_SUBJECT is often a page title — useful as a preview label.
                String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                if (subject != null && !subject.trim().isEmpty()) out.put("subject", subject);
                synchronized (OrbitSharePlugin.class) { pendingShare = out; }
                return;
            }

            // File share: one or many. Read each to base64 while we have the grant.
            List<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) uris.addAll(list);
            } else {
                Uri single = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (single != null) uris.add(single);
            }
            if (uris.isEmpty()) return;

            JSArray files = new JSArray();
            for (Uri uri : uris) {
                JSObject file = readUri(ctx, uri, type);
                if (file != null) files.put(file);
            }
            if (files.length() == 0) return;

            out.put("files", files);
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) out.put("text", text);
            synchronized (OrbitSharePlugin.class) { pendingShare = out; }
        } catch (Exception e) {
            Log.w(TAG, "could not stash the share", e);
        }
    }

    /** One content:// URI to { name, mimeType, size, dataUrl }. Null if unreadable. */
    private static JSObject readUri(android.content.Context ctx, Uri uri, String fallbackType) {
        try (InputStream in = openStream(ctx, uri)) {
            if (in == null) return null;
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            long total = 0;
            int n;
            while ((n = in.read(chunk)) > 0) {
                total += n;
                if (total > MAX_BYTES) {
                    // Too big to hand over inline. The web layer falls back to the
                    // name and type, which is still better than nothing.
                    Log.w(TAG, "share larger than the inline limit, skipping bytes");
                    break;
                }
                buf.write(chunk, 0, n);
            }
            byte[] bytes = buf.toByteArray();
            if (bytes.length == 0) return null;

            String mime = resolveType(ctx, uri, fallbackType);
            JSObject file = new JSObject();
            file.put("name", resolveName(ctx, uri));
            file.put("mimeType", mime);
            file.put("size", bytes.length);
            file.put("dataUrl", "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            return file;
        } catch (Exception e) {
            Log.w(TAG, "could not read a shared file", e);
            return null;
        }
    }

    private static InputStream openStream(android.content.Context ctx, Uri uri) throws Exception {
        if (ctx == null) return null;
        return ctx.getContentResolver().openInputStream(uri);
    }

    private static String resolveType(android.content.Context ctx, Uri uri, String fallback) {
        try {
            if (ctx != null) {
                String t = ctx.getContentResolver().getType(uri);
                if (t != null) return t;
            }
        } catch (Exception ignored) { }
        return fallback != null ? fallback : "application/octet-stream";
    }

    /** The display name the sending app gave it, or a generated one. */
    private static String resolveName(android.content.Context ctx, Uri uri) {
        try {
            if (ctx != null) {
                Cursor c = ctx.getContentResolver().query(uri, null, null, null, null);
                if (c != null) {
                    try {
                        int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (idx >= 0 && c.moveToFirst()) {
                            String name = c.getString(idx);
                            if (name != null && !name.isEmpty()) return name;
                        }
                    } finally {
                        c.close();
                    }
                }
            }
        } catch (Exception ignored) { }
        return "shared-" + System.currentTimeMillis();
    }

    /** The parked share, if any. Does not clear it — the caller decides. */
    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject out = new JSObject();
        synchronized (OrbitSharePlugin.class) {
            out.put("share", pendingShare);
        }
        call.resolve(out);
    }

    /** Drop the parked share once the web layer has taken it. */
    @PluginMethod
    public void clear(PluginCall call) {
        synchronized (OrbitSharePlugin.class) { pendingShare = null; }
        call.resolve();
    }
}
