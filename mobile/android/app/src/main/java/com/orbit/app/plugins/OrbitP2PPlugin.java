package com.orbit.app.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.AsyncTask;
import android.util.Log;

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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OrbitP2P")
public class OrbitP2PPlugin extends Plugin {

    private static final String TAG = "OrbitP2P";
    private static final int TCP_BUFFER_SIZE = 4194304; // 4 MB — raised from 64 KB
    private static final String MULTICAST_ADDR = "224.0.0.251";
    private static final int DISCOVERY_PORT = 45678;
    private static final int BEACON_INTERVAL_MS = 5000;

    private ServerSocket serverSocket;
    private volatile MulticastSocket multicastSocket;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, PeerConnection> connections = new ConcurrentHashMap<>();
    private volatile boolean serverRunning = false;
    private volatile boolean discoveryRunning = false;
    private WifiManager.MulticastLock multicastLock;

    // ── TCP Server ──

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 46000);

        executor.execute(() -> {
            try {
                serverSocket = new ServerSocket(port);
                serverRunning = true;
                call.resolve(new JSObject().put("port", port));

                while (serverRunning && !serverSocket.isClosed()) {
                    Socket client = serverSocket.accept();
                    String peerId = client.getInetAddress().getHostAddress() + ":" + client.getPort();
                    PeerConnection conn = new PeerConnection(peerId, client);
                    connections.put(peerId, conn);
                    notifyConnection(peerId);
                    conn.startReading();
                }
            } catch (IOException e) {
                if (serverRunning) {
                    call.reject("Server error: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        serverRunning = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {}
        call.resolve();
    }

    // ── TCP Client ──

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 46000);
        String peerId = call.getString("peerId", host + ":" + port);

        executor.execute(() -> {
            try {
                Socket socket = new Socket();
                socket.connect(new InetSocketAddress(host, port), 5000);
                PeerConnection conn = new PeerConnection(peerId, socket);
                connections.put(peerId, conn);
                notifyConnection(peerId);  // track outbound connections for JS
                call.resolve(new JSObject().put("connectionId", peerId));
                conn.startReading();
            } catch (IOException e) {
                call.reject("Connection failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String connectionId = call.getString("connectionId");
        PeerConnection conn = connections.remove(connectionId);
        if (conn != null) {
            conn.close();
        }
        call.resolve();
    }

    // ── Send ──

    @PluginMethod
    public void send(PluginCall call) {
        String connectionId = call.getString("connectionId");
        String data = call.getString("data");

        PeerConnection conn = connections.get(connectionId);
        if (conn == null) {
            call.reject("No connection: " + connectionId);
            return;
        }

        executor.execute(() -> {
            try {
                conn.send(data);
                call.resolve();
            } catch (IOException e) {
                call.reject("Send failed: " + e.getMessage());
            }
        });
    }

    // ── UDP Discovery ──

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        JSObject beacon = call.getObject("beacon", new JSObject());

        executor.execute(() -> {
            try {
                acquireMulticastLock();

                MulticastSocket ms = new MulticastSocket(DISCOVERY_PORT);
                multicastSocket = ms;
                NetworkInterface ni = getWiFiNetworkInterface();
                if (ni != null) {
                    ms.setNetworkInterface(ni);
                }
                InetAddress group = InetAddress.getByName(MULTICAST_ADDR);
                ms.joinGroup(group);

                // Resolve promise immediately (BUG-1 fix)
                call.resolve();

                byte[] beaconData = beacon.toString().getBytes("UTF-8");
                DatagramPacket outPacket = new DatagramPacket(beaconData, beaconData.length, group, DISCOVERY_PORT);

                // Local IPs for self-filtering (BUG-6)
                java.util.Set<String> localIps = getLocalIPAddresses();

                discoveryRunning = true;
                long lastBeaconTime = 0;

                while (discoveryRunning && ms != null && !ms.isClosed()) {
                    long now = System.currentTimeMillis();

                    // Send beacon every BEACON_INTERVAL_MS (BUG-7)
                    if (now - lastBeaconTime >= BEACON_INTERVAL_MS) {
                        ms.send(outPacket);
                        lastBeaconTime = now;
                    }

                    // Listen for incoming beacons (non-blocking)
                    byte[] buf = new byte[4096];
                    DatagramPacket inPacket = new DatagramPacket(buf, buf.length);
                    ms.setSoTimeout(1000);
                    try {
                        ms.receive(inPacket);
                        String peerHost = inPacket.getAddress().getHostAddress();
                        // Filter self-beacon (BUG-6)
                        if (localIps.contains(peerHost)) continue;
                        int dataLen = inPacket.getLength();
                        int offset = 0;
                        // Strip desktop-compatible 4-byte length prefix
                        if (dataLen > 4) {
                            try {
                                int prefixLen = ((inPacket.getData()[0] & 0xFF) << 24) |
                                                 ((inPacket.getData()[1] & 0xFF) << 16) |
                                                 ((inPacket.getData()[2] & 0xFF) << 8)  |
                                                 (inPacket.getData()[3] & 0xFF);
                                if (prefixLen == dataLen - 4) {
                                    offset = 4;
                                }
                            } catch (Exception ignored) {}
                        }
                        String msg = new String(inPacket.getData(), offset, dataLen - offset, "UTF-8");
                        Log.d(TAG, "Raw beacon from " + peerHost + " (offset=" + offset + "): " + msg);
                        notifyPeerFound(peerHost, msg);
                    } catch (java.net.SocketTimeoutException ignored) {
                        // No beacon this cycle, continue
                    }
                }
            } catch (IOException e) {
                call.reject("Discovery error: " + e.getMessage());
            } finally {
                releaseMulticastLock();
            }
        });
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        discoveryRunning = false;
        try {
            if (multicastSocket != null) {
                multicastSocket.close();
                multicastSocket = null;
            }
        } catch (Exception ignored) {}
        releaseMulticastLock();
        call.resolve();
    }

    // ── Helpers ──

    private NetworkInterface getWiFiNetworkInterface() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (ni.isUp() && !ni.isLoopback() && ni.getName().startsWith("wlan")) {
                    return ni;
                }
            }
            // Fallback: first non-loopback interface
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (ni.isUp() && !ni.isLoopback()) {
                    return ni;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    private void acquireMulticastLock() {
        try {
            Context ctx = getContext();
            if (ctx == null) return;
            WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return;
            multicastLock = wm.createMulticastLock("OrbitP2P-MulticastLock");
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
        } catch (Exception e) {
            Log.e(TAG, "Failed to release MulticastLock", e);
        }
    }

    private java.util.Set<String> getLocalIPAddresses() {
        java.util.Set<String> ips = new java.util.HashSet<>();
        ips.add("127.0.0.1");
        ips.add("0.0.0.0");
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (ni.isUp()) {
                    for (java.net.InetAddress addr : Collections.list(ni.getInetAddresses())) {
                        String host = addr.getHostAddress();
                        if (host != null) {
                            ips.add(host);
                            // Also add the raw address without zone index
                            int idx = host.indexOf('%');
                            if (idx > 0) ips.add(host.substring(0, idx));
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
        return ips;
    }

    private void notifyConnection(String peerId) {
        JSObject data = new JSObject();
        data.put("connectionId", peerId);
        notifyListeners("onConnection", data);
    }

    private void notifyMessage(String peerId, String data) {
        Log.d(TAG, "notifyMessage: peerId=" + peerId + " data(len=" + (data != null ? data.length() : 0) + "): " + (data != null ? data.substring(0, Math.min(data.length(), 120)) : "null"));
        JSObject obj = new JSObject();
        obj.put("connectionId", peerId);
        obj.put("data", data);
        notifyListeners("onMessage", obj);
    }

    private void notifyDisconnect(String peerId) {
        JSObject obj = new JSObject();
        obj.put("connectionId", peerId);
        notifyListeners("onDisconnect", obj);
    }

    private void notifyPeerFound(String host, String beaconJson) {
        JSObject obj = new JSObject();
        obj.put("host", host);
        obj.put("beacon", beaconJson);
        notifyListeners("onPeerFound", obj);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        serverRunning = false;
        discoveryRunning = false;
        for (PeerConnection conn : connections.values()) {
            conn.close();
        }
        connections.clear();
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (Exception ignored) {}
        try {
            if (multicastSocket != null) multicastSocket.close();
        } catch (Exception ignored) {}
        releaseMulticastLock();
        executor.shutdownNow();
    }

    // ── Connection Handler ──

    private class PeerConnection {
        String peerId;
        final Socket socket;
        final DataInputStream input;
        final DataOutputStream output;
        final Object sendLock = new Object();

        PeerConnection(String peerId, Socket socket) throws IOException {
            this.peerId = peerId;
            this.socket = socket;
            this.input = new DataInputStream(socket.getInputStream());
            this.output = new DataOutputStream(socket.getOutputStream());
        }

        private boolean firstPacket = true;

        void startReading() {
            executor.execute(() -> {
                try {
                    while (serverRunning && !socket.isClosed()) {
                        int len = input.readInt();
                        if (len <= 0 || len > TCP_BUFFER_SIZE) break;
                        byte[] buf = new byte[len];
                        input.readFully(buf);
                        String msg = new String(buf, "UTF-8");

                        // Remap inbound connection from ip:port to userId (matching desktop socket.js:149-156)
                        if (firstPacket) {
                            firstPacket = false;
                            try {
                                org.json.JSONObject pkt = new org.json.JSONObject(msg);
                                String senderId = pkt.optString("from");
                                if (senderId == null || senderId.isEmpty()) {
                                    senderId = pkt.optString("senderId");
                                }
                                if (senderId != null && !senderId.isEmpty() && !senderId.equals(peerId)) {
                                    Log.d(TAG, "Dual mapping connection: " + peerId + " + " + senderId);
                                    connections.put(senderId, this);
                                    peerId = senderId;
                                }
                            } catch (Exception ignored) {}
                        }

                        notifyMessage(peerId, msg);
                    }
                } catch (IOException e) {
                    Log.d(TAG, "Connection closed: " + peerId);
                } finally {
                    connections.remove(peerId);
                    notifyDisconnect(peerId);
                    close();
                }
            });
        }

        void send(String data) throws IOException {
            synchronized (sendLock) {
                byte[] buf = data.getBytes("UTF-8");
                output.writeInt(buf.length);
                output.write(buf);
                output.flush();
            }
        }

        void close() {
            try { socket.close(); } catch (Exception ignored) {}
        }
    }
}
