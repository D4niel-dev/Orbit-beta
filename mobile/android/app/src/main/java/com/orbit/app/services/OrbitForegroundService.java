package com.orbit.app.services;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import com.orbit.app.MainActivity;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class OrbitForegroundService extends Service {

    private static final String TAG = "OrbitFgService";
    private static final String CHANNEL_ID = "orbit_service";
    private static final int NOTIFICATION_ID = 1;
    private static final int TCP_BUFFER_SIZE = 4194304;
    private static final String MULTICAST_ADDR = "224.0.0.251";
    private static final int DISCOVERY_PORT = 45678;
    private static final int BEACON_INTERVAL_MS = 10000;

    // Static event queues — consumed by plugin
    public static final ConcurrentLinkedQueue<FgEvent> eventQueue = new ConcurrentLinkedQueue<>();

    private volatile ServerSocket serverSocket;
    private volatile MulticastSocket multicastSocket;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, PeerConnection> connections = new ConcurrentHashMap<>();
    private volatile boolean serverRunning = false;
    private volatile boolean serverStarted = false;
    private volatile boolean discoveryRunning = false;
    private volatile boolean discoveryStarted = false;
    private WifiManager.MulticastLock multicastLock;
    private PowerManager.WakeLock wakeLock;
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile int tcpPort = 46000;
    private volatile int udpPort = DISCOVERY_PORT;

    public static class FgEvent {
        public final String type; // "message", "connection", "disconnect", "peerFound"
        public final String connectionId;
        public final String data;
        public final String host;
        public FgEvent(String type, String connectionId, String data, String host) {
            this.type = type; this.connectionId = connectionId; this.data = data; this.host = host;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service created");
        createNotificationChannel();
        acquireWakeLock();
        registerNetworkCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand");
        if (intent != null) {
            int newTcpPort = intent.getIntExtra("tcpPort", 46000);
            int newUdpPort = intent.getIntExtra("udpPort", DISCOVERY_PORT);
            if (newTcpPort != tcpPort) { tcpPort = newTcpPort; }
            if (newUdpPort != udpPort) { udpPort = newUdpPort; }
            // Handle connection request sent via intent (service not yet bound)
            if (intent.hasExtra("connectHost")) {
                String cHost = intent.getStringExtra("connectHost");
                int cPort = intent.getIntExtra("connectPort", 46000);
                String cPeerId = intent.getStringExtra("connectPeerId");
                int cTimeout = intent.getIntExtra("connectTimeout", 30000);
                connectToPeer(cHost, cPort, cPeerId, cTimeout);
            }
            // Update beacon data if provided
            if (intent.hasExtra("beaconJson")) {
                _beaconJson = intent.getStringExtra("beaconJson");
            }
        }
        // Start networking on every start command (handles START_STICKY recreation
        // with null intent when process was killed — resets flags automatically)
        startNetworking();
        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return new ServiceBinder(); }

    public class ServiceBinder extends android.os.Binder {
        public OrbitForegroundService getService() { return OrbitForegroundService.this; }
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "Service destroyed");
        stopNetworking();
        eventQueue.clear();
        try { executor.shutdownNow(); } catch (Exception ignored) {}
        releaseWakeLock();
        unregisterNetworkCallback();
        super.onDestroy();
    }

    // ── Public API (called from plugin) ──

    public synchronized void startNetworking() {
        if (!serverStarted) { serverStarted = true; startServer(); }
        if (!discoveryStarted) { discoveryStarted = true; startDiscovery(); }
    }

    public void stopServer() {
        serverRunning = false;
        serverStarted = false;
        for (PeerConnection conn : connections.values()) { conn.close(); }
        connections.clear();
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) {}
    }

    public void stopNetworking() {
        stopServer();
        stopDiscovery();
    }

    public void startServer() {
        executor.execute(() -> {
            try {
                serverSocket = new ServerSocket(tcpPort);
                serverRunning = true;
                Log.d(TAG, "TCP server listening on port " + tcpPort);
                serverStarted = true;
                while (serverRunning && !serverSocket.isClosed()) {
                    Socket client = serverSocket.accept();
                    String peerId = client.getInetAddress().getHostAddress() + ":" + client.getPort();
                    PeerConnection conn = new PeerConnection(peerId, client);
                    connections.put(peerId, conn);
                    eventQueue.add(new FgEvent("connection", peerId, null, null));
                    conn.startReading();
                }
            } catch (IOException e) {
                if (serverRunning) Log.e(TAG, "Server error: " + e.getMessage());
            }
        });
    }

    public void connectToPeer(String host, int port, String peerId, int timeoutMs) {
        executor.execute(() -> {
            // Dedup: skip if already connected to this peerId
            PeerConnection existing = connections.get(peerId);
            if (existing != null && existing.socket.isConnected() && !existing.socket.isClosed()) {
                Log.d(TAG, "Already connected to " + peerId + ", skipping duplicate connect");
                return;
            }
            // Also check by host:port (in case peerId differs but it's the same endpoint)
            String hostPort = host + ":" + port;
            if (!hostPort.equals(peerId)) {
                PeerConnection existingByHost = connections.get(hostPort);
                if (existingByHost != null && existingByHost.socket.isConnected() && !existingByHost.socket.isClosed()) {
                    Log.d(TAG, "Already connected to " + hostPort + ", skipping duplicate connect");
                    return;
                }
                if (existingByHost != null) { connections.remove(hostPort); existingByHost.close(); }
            }
            if (existing != null) { connections.remove(peerId); existing.close(); }
            try {
                Socket socket = new Socket();
                socket.connect(new InetSocketAddress(host, port), timeoutMs);
                PeerConnection conn = new PeerConnection(peerId, socket);
                connections.put(peerId, conn);
                eventQueue.add(new FgEvent("connection", peerId, null, null));
                conn.startReading();
                Log.d(TAG, "Connected to " + peerId + " at " + host + ":" + port);
            } catch (IOException e) {
                Log.e(TAG, "Connect failed to " + peerId + ": " + e.getMessage());
                eventQueue.add(new FgEvent("connectFailed", peerId, e.getMessage(), host));
            }
        });
    }

    public void disconnectPeer(String connectionId) {
        PeerConnection conn = connections.remove(connectionId);
        if (conn != null) conn.close();
    }

    public interface SendCallback {
        void onSuccess();
        void onError(String error);
    }

    public void sendData(String connectionId, String data, SendCallback callback) {
        PeerConnection conn = connections.get(connectionId);
        if (conn == null) {
            eventQueue.add(new FgEvent("sendFailed", connectionId, "No connection: " + connectionId, null));
            if (callback != null) callback.onError("No connection");
            return;
        }
        conn.sendAsync(data, callback);
    }

    public void startDiscovery() {
        executor.execute(() -> {
            try {
                acquireMulticastLock();
                MulticastSocket ms = new MulticastSocket(udpPort);
                ms.setReuseAddress(true);
                multicastSocket = ms;
                NetworkInterface ni = getWiFiNetworkInterface();
                if (ni == null) {
                    try {
                        ni = NetworkInterface.getByInetAddress(InetAddress.getByName("0.0.0.0"));
                    } catch (Exception ignored) {}
                }
                InetAddress group = InetAddress.getByName(MULTICAST_ADDR);
                if (ni != null) {
                    ms.setNetworkInterface(ni);
                    ms.joinGroup(new InetSocketAddress(group, 0), ni);
                } else {
                    ms.joinGroup(group);
                }
                java.util.Set<String> localIps = getLocalIPAddresses();
                discoveryRunning = true;
                discoveryStarted = true;
                long lastBeaconTime = 0;
                while (discoveryRunning && ms != null && !ms.isClosed()) {
                    long now = System.currentTimeMillis();
                    if (now - lastBeaconTime >= BEACON_INTERVAL_MS) {
                        String beaconJson = buildBeaconJson();
                        if (beaconJson != null) {
                            byte[] beaconData = beaconJson.getBytes("UTF-8");
                            DatagramPacket outPacket = new DatagramPacket(beaconData, beaconData.length, group, udpPort);
                            try { ms.send(outPacket); } catch (Exception ignored) {}
                        }
                        lastBeaconTime = now;
                    }
                    byte[] buf = new byte[4096];
                    DatagramPacket inPacket = new DatagramPacket(buf, buf.length);
                    ms.setSoTimeout(1000);
                    try {
                        ms.receive(inPacket);
                        String peerHost = inPacket.getAddress().getHostAddress();
                        if (localIps.contains(peerHost)) continue;
                        int dataLen = inPacket.getLength();
                        int offset = 0;
                        if (dataLen > 4) {
                            try {
                                int prefixLen = ((inPacket.getData()[0] & 0xFF) << 24) |
                                                 ((inPacket.getData()[1] & 0xFF) << 16) |
                                                 ((inPacket.getData()[2] & 0xFF) << 8)  |
                                                 (inPacket.getData()[3] & 0xFF);
                                if (prefixLen == dataLen - 4) offset = 4;
                            } catch (Exception ignored) {}
                        }
                        String msg = new String(inPacket.getData(), offset, dataLen - offset, "UTF-8");
                        Log.d(TAG, "Beacon from " + peerHost);
                        eventQueue.add(new FgEvent("peerFound", null, msg, peerHost));
                    } catch (java.net.SocketTimeoutException ignored) {}
                }
            } catch (IOException e) {
                Log.e(TAG, "Discovery error: " + e.getMessage());
            } finally {
                releaseMulticastLock();
            }
        });
    }

    public void stopDiscovery() {
        discoveryRunning = false;
        discoveryStarted = false;
        try { if (multicastSocket != null) { multicastSocket.close(); multicastSocket = null; } } catch (Exception ignored) {}
        releaseMulticastLock();
    }

    public boolean isConnected(String peerId) {
        if (connections.containsKey(peerId)) return true;
        for (String key : connections.keySet()) {
            if (key.startsWith(peerId) || peerId.startsWith(key)) return true;
        }
        return false;
    }

    public String[] getConnectionIds() {
        return connections.keySet().toArray(new String[0]);
    }

    public void updateBeacon(String beaconJson) {
        this._beaconJson = beaconJson;
    }
    private volatile String _beaconJson = null;

    private String buildBeaconJson() {
        return _beaconJson;
    }

    // ── WakeLock ──

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Orbit:ServiceWakeLock");
                wakeLock.acquire();
                Log.d(TAG, "WakeLock acquired");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire WakeLock", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
                Log.d(TAG, "WakeLock released");
            }
        } catch (Exception ignored) {}
    }

    // ── MulticastLock ──

    private void acquireMulticastLock() {
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return;
            multicastLock = wm.createMulticastLock("Orbit-MulticastLock");
            multicastLock.setReferenceCounted(true);
            multicastLock.acquire();
            Log.d(TAG, "MulticastLock acquired");
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire MulticastLock", e);
        }
    }

    private void releaseMulticastLock() {
        try {
            if (multicastLock != null && multicastLock.isHeld()) {
                multicastLock.release();
                multicastLock = null;
                Log.d(TAG, "MulticastLock released");
            }
        } catch (Exception ignored) {}
    }

    // ── Network change callback ──

    private void registerNetworkCallback() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            NetworkRequest.Builder builder = new NetworkRequest.Builder();
            builder.addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    Log.d(TAG, "Network available — restarting discovery");
                    restartDiscovery();
                }
            };
            cm.registerNetworkCallback(builder.build(), networkCallback);
        } catch (Exception e) {
            Log.e(TAG, "Failed to register network callback", e);
        }
    }

    private void unregisterNetworkCallback() {
        try {
            if (networkCallback != null) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
            }
        } catch (Exception ignored) {}
    }

    private void restartDiscovery() {
        executor.execute(() -> {
            stopDiscovery();
            try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
            startDiscovery();
        });
    }

    // ── PeerConnection inner class ──

    private class PeerConnection {
        final String originalPeerId;
        String peerId;
        final Socket socket;
        final DataInputStream input;
        final DataOutputStream output;
        final Object sendLock = new Object();
        final ExecutorService sendExecutor = Executors.newSingleThreadExecutor();
        private boolean firstPacket = true;

        PeerConnection(String peerId, Socket socket) throws IOException {
            this.peerId = peerId;
            this.originalPeerId = peerId;
            this.socket = socket;
            this.input = new DataInputStream(socket.getInputStream());
            this.output = new DataOutputStream(socket.getOutputStream());
        }

        void startReading() {
            executor.execute(() -> {
                try {
                    while (serverRunning && !socket.isClosed()) {
                        int len = input.readInt();
                        if (len <= 0 || len > TCP_BUFFER_SIZE) break;
                        byte[] buf = new byte[len];
                        input.readFully(buf);
                        String msg = new String(buf, "UTF-8");
                        if (firstPacket) {
                            firstPacket = false;
                            try {
                                org.json.JSONObject pkt = new org.json.JSONObject(msg);
                                String senderId = pkt.optString("from");
                                if (senderId == null || senderId.isEmpty()) senderId = pkt.optString("senderId");
                                if (senderId != null && !senderId.isEmpty() && !senderId.equals(peerId)) {
                                    connections.put(senderId, this);
                                    peerId = senderId;
                                }
                            } catch (Exception ignored) {}
                        }
                        eventQueue.add(new FgEvent("message", peerId, msg, null));
                    }
                } catch (IOException e) {
                    Log.d(TAG, "Connection closed: " + peerId);
                } finally {
                    connections.remove(originalPeerId);
                    connections.remove(peerId);
                    eventQueue.add(new FgEvent("disconnect", originalPeerId, null, null));
                    if (!originalPeerId.equals(peerId)) {
                        eventQueue.add(new FgEvent("disconnect", peerId, null, null));
                    }
                    close();
                }
            });
        }

        void sendAsync(String data, SendCallback callback) {
            sendExecutor.execute(() -> {
                try {
                    synchronized (sendLock) {
                        byte[] buf = data.getBytes("UTF-8");
                        output.writeInt(buf.length);
                        output.write(buf);
                        output.flush();
                    }
                    if (callback != null) callback.onSuccess();
                } catch (IOException e) {
                    eventQueue.add(new FgEvent("sendFailed", peerId, e.getMessage(), null));
                    if (callback != null) callback.onError(e.getMessage());
                }
            });
        }

        void close() {
            try { socket.close(); } catch (Exception ignored) {}
            sendExecutor.shutdownNow();
        }
    }

    // ── Helpers ──

    private NetworkInterface getWiFiNetworkInterface() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (ni.isUp() && !ni.isLoopback() && ni.getName().startsWith("wlan")) return ni;
            }
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (ni.isUp() && !ni.isLoopback()) return ni;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private java.util.Set<String> getLocalIPAddresses() {
        java.util.Set<String> ips = new java.util.HashSet<>();
        ips.add("127.0.0.1"); ips.add("0.0.0.0");
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (ni.isUp()) {
                    for (java.net.InetAddress addr : Collections.list(ni.getInetAddresses())) {
                        String host = addr.getHostAddress();
                        if (host != null) {
                            ips.add(host);
                            int idx = host.indexOf('%');
                            if (idx > 0) ips.add(host.substring(0, idx));
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
        return ips;
    }

    // ── Foreground notification ──

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Orbit Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps Orbit running in the background");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Orbit")
            .setContentText("Connected")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .build();
    }
}
