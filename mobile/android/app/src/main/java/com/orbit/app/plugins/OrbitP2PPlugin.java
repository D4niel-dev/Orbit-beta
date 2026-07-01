package com.orbit.app.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.orbit.app.services.OrbitForegroundService;
import com.orbit.app.services.OrbitForegroundService.FgEvent;

@CapacitorPlugin(name = "OrbitP2P")
public class OrbitP2PPlugin extends Plugin {

    private static final String TAG = "OrbitP2P";
    private final Handler drainHandler = new Handler(Looper.getMainLooper());
    private volatile OrbitForegroundService boundService = null;
    private boolean serviceBound = false;
    private boolean serviceStarting = false;
    private final Runnable drainRunnable = new Runnable() {
        @Override
        public void run() {
            drainEvents();
            drainHandler.postDelayed(this, 100);
        }
    };

    // ── Service lifecycle ──

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.d(TAG, "Service connected");
            if (service instanceof OrbitForegroundService.ServiceBinder) {
                boundService = ((OrbitForegroundService.ServiceBinder) service).getService();
            }
            serviceBound = true;
            startDraining();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "Service disconnected");
            serviceBound = false;
            boundService = null;
            stopDraining();
        }
    };

    private void ensureServiceRunning() {
        Context ctx = getContext();
        if (ctx == null) return;
        if (boundService != null) return;
        if (serviceStarting) return;
        serviceStarting = true;
        Intent intent = new Intent(ctx, OrbitForegroundService.class);
        ctx.startForegroundService(intent);
        ctx.bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    private void stopService() {
        Context ctx = getContext();
        if (ctx == null) return;
        stopDraining();
        if (serviceBound) {
            try { ctx.unbindService(connection); } catch (Exception ignored) {}
            serviceBound = false;
        }
        Intent intent = new Intent(ctx, OrbitForegroundService.class);
        ctx.stopService(intent);
        serviceStarting = false;
    }

    // ── Event draining ──

    private void startDraining() {
        drainHandler.removeCallbacks(drainRunnable);
        drainHandler.post(drainRunnable);
    }

    private void stopDraining() {
        drainHandler.removeCallbacks(drainRunnable);
    }

    private void drainEvents() {
        FgEvent ev;
        while ((ev = OrbitForegroundService.eventQueue.poll()) != null) {
            if (ev == null) continue;
            try {
                switch (ev.type) {
                    case "message":
                        JSObject msgObj = new JSObject();
                        msgObj.put("connectionId", ev.connectionId);
                        msgObj.put("data", ev.data);
                        notifyListeners("onMessage", msgObj);
                        break;
                    case "connection":
                        JSObject connObj = new JSObject();
                        connObj.put("connectionId", ev.connectionId);
                        connObj.put("host", ev.host != null ? ev.host : "");
                        notifyListeners("onConnection", connObj);
                        break;
                    case "disconnect":
                        JSObject discObj = new JSObject();
                        discObj.put("connectionId", ev.connectionId);
                        notifyListeners("onDisconnect", discObj);
                        break;
                    case "peerFound":
                        JSObject peerObj = new JSObject();
                        peerObj.put("host", ev.host);
                        peerObj.put("beacon", ev.data);
                        notifyListeners("onPeerFound", peerObj);
                        break;
                    case "sendFailed":
                    case "connectFailed":
                        JSObject errObj = new JSObject();
                        errObj.put("connectionId", ev.connectionId);
                        errObj.put("error", ev.data);
                        errObj.put("host", ev.host != null ? ev.host : "");
                        notifyListeners("on" + Character.toUpperCase(ev.type.charAt(0)) + ev.type.substring(1), errObj);
                        break;
                }
            } catch (Exception e) {
                Log.e(TAG, "Error draining event: " + e.getMessage());
            }
        }
    }

    // ── Plugin lifecycle ──

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "Plugin load");
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        Log.d(TAG, "handleOnDestroy — stopping service drain only, service keeps running");
        stopDraining();
        try {
            Context ctx = getContext();
            if (ctx != null && serviceBound) {
                ctx.unbindService(connection);
                serviceBound = false;
            }
        } catch (Exception ignored) {}
    }

    // ── Plugin methods ──

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 46000);
        ensureServiceRunning();
        // Pass port to service via intent extra
        Context ctx = getContext();
        if (ctx != null) {
            Intent intent = new Intent(ctx, OrbitForegroundService.class);
            intent.putExtra("tcpPort", port);
            intent.putExtra("startNetworking", true);
            ctx.startForegroundService(intent);
        }
        call.resolve(new JSObject().put("port", port));
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        if (boundService != null) {
            boundService.stopServer();
        }
        call.resolve();
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 46000);
        String peerId = call.getString("peerId", host + ":" + port);
        int timeoutMs = call.getInt("timeout", 30000);
        ensureServiceRunning();
        if (boundService != null) {
            boundService.connectToPeer(host, port, peerId, timeoutMs);
            call.resolve(new JSObject().put("connectionId", peerId));
        } else {
            // Service not yet bound — queue connection via intent
            Context ctx = getContext();
            if (ctx != null) {
                Intent intent = new Intent(ctx, OrbitForegroundService.class);
                intent.putExtra("connectHost", host);
                intent.putExtra("connectPort", port);
                intent.putExtra("connectPeerId", peerId);
                intent.putExtra("connectTimeout", timeoutMs);
                ctx.startForegroundService(intent);
            }
            call.resolve(new JSObject().put("connectionId", peerId));
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String connectionId = call.getString("connectionId");
        if (boundService != null) {
            boundService.disconnectPeer(connectionId);
        }
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String connectionId = call.getString("connectionId");
        String data = call.getString("data");
        if (boundService != null) {
            boundService.sendData(connectionId, data);
            call.resolve();
        } else {
            call.reject("Service not available");
        }
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        JSObject beacon = call.getObject("beacon", new JSObject());
        int discoveryPort = call.getInt("discoveryPort", 45678);
        ensureServiceRunning();

        // Store beacon data on service
        if (boundService != null) {
            boundService.updateBeacon(beacon.toString());
        }

        Context ctx = getContext();
        if (ctx != null) {
            Intent intent = new Intent(ctx, OrbitForegroundService.class);
            intent.putExtra("udpPort", discoveryPort);
            intent.putExtra("beaconJson", beacon.toString());
            intent.putExtra("startNetworking", true);
            ctx.startForegroundService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        if (boundService != null) {
            boundService.stopDiscovery();
        }
        call.resolve();
    }

    @PluginMethod
    public void startNetwork(PluginCall call) {
        ensureServiceRunning();
        Context ctx = getContext();
        if (ctx != null) {
            Intent intent = new Intent(ctx, OrbitForegroundService.class);
            intent.putExtra("startNetworking", true);
            ctx.startForegroundService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopNetwork(PluginCall call) {
        stopService();
        call.resolve();
    }

    @PluginMethod
    public void isPeerConnected(PluginCall call) {
        String peerId = call.getString("peerId");
        boolean connected = boundService != null && boundService.isConnected(peerId);
        call.resolve(new JSObject().put("connected", connected));
    }

    @PluginMethod
    public void getConnections(PluginCall call) {
        String[] conns = boundService != null ? boundService.getConnectionIds() : new String[0];
        JSObject result = new JSObject();
        result.put("connections", conns);
        call.resolve(result);
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        // DO NOT call stopService() here! That would stop the Android foreground service
        // asynchronously — onServiceDisconnected fires after a delay, so boundService is
        // still non-null when initP2P() immediately calls startServer()/startDiscovery().
        // Their ensureServiceRunning() sees boundService != null and skips re-starting,
        // leaving the service dead with no networking.
        //
        // The JS side (p2p-mobile.js) already clears connections, pending messages, and
        // removes native event listeners via removeAllListeners(). The Java side needs
        // nothing more for a clean re-init.
        Log.d(TAG, "cleanup called — JS listener reset only, service left running");
        call.resolve();
    }
}
