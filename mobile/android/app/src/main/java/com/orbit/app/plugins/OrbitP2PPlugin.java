package com.orbit.app.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
    private static final int TCP_BUFFER_SIZE = 65536;
    private static final String MULTICAST_ADDR = "224.0.0.251";
    private static final int DISCOVERY_PORT = 45678;

    private ServerSocket serverSocket;
    private MulticastSocket multicastSocket;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, PeerConnection> connections = new ConcurrentHashMap<>();
    private boolean running = false;

    // ── TCP Server ──

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 46000);

        executor.execute(() -> {
            try {
                serverSocket = new ServerSocket(port);
                running = true;
                call.resolve(new JSObject().put("port", port));

                while (running && !serverSocket.isClosed()) {
                    Socket client = serverSocket.accept();
                    String peerId = client.getInetAddress().getHostAddress() + ":" + client.getPort();
                    PeerConnection conn = new PeerConnection(peerId, client);
                    connections.put(peerId, conn);
                    notifyConnection(peerId);
                    conn.startReading();
                }
            } catch (IOException e) {
                if (running) {
                    call.reject("Server error: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        running = false;
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
                multicastSocket = new MulticastSocket(DISCOVERY_PORT);
                NetworkInterface ni = getWiFiNetworkInterface();
                if (ni != null) {
                    multicastSocket.setNetworkInterface(ni);
                }
                InetAddress group = InetAddress.getByName(MULTICAST_ADDR);
                multicastSocket.joinGroup(group);

                // Send beacon every 5s
                byte[] beaconData = beacon.toString().getBytes("UTF-8");
                DatagramPacket outPacket = new DatagramPacket(beaconData, beaconData.length, group, DISCOVERY_PORT);

                while (running && multicastSocket != null && !multicastSocket.isClosed()) {
                    multicastSocket.send(outPacket);

                    // Listen for incoming beacons (non-blocking)
                    byte[] buf = new byte[4096];
                    DatagramPacket inPacket = new DatagramPacket(buf, buf.length);
                    multicastSocket.setSoTimeout(1000);
                    try {
                        multicastSocket.receive(inPacket);
                        String msg = new String(inPacket.getData(), 0, inPacket.getLength(), "UTF-8");
                        String peerHost = inPacket.getAddress().getHostAddress();
                        notifyPeerFound(peerHost, msg);
                    } catch (java.net.SocketTimeoutException ignored) {
                        // No beacon this cycle, continue
                    }
                }

                call.resolve();
            } catch (IOException e) {
                call.reject("Discovery error: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        try {
            if (multicastSocket != null) {
                multicastSocket.close();
                multicastSocket = null;
            }
        } catch (Exception ignored) {}
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

    private void notifyConnection(String peerId) {
        JSObject data = new JSObject();
        data.put("connectionId", peerId);
        notifyListeners("onConnection", data);
    }

    private void notifyMessage(String peerId, String data) {
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
        running = false;
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
        executor.shutdownNow();
    }

    // ── Connection Handler ──

    private class PeerConnection {
        final String peerId;
        final Socket socket;
        final DataInputStream input;
        final DataOutputStream output;

        PeerConnection(String peerId, Socket socket) throws IOException {
            this.peerId = peerId;
            this.socket = socket;
            this.input = new DataInputStream(socket.getInputStream());
            this.output = new DataOutputStream(socket.getOutputStream());
        }

        void startReading() {
            executor.execute(() -> {
                try {
                    while (running && !socket.isClosed()) {
                        int len = input.readInt();
                        if (len <= 0 || len > TCP_BUFFER_SIZE) break;
                        byte[] buf = new byte[len];
                        input.readFully(buf);
                        String msg = new String(buf, "UTF-8");
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
            byte[] buf = data.getBytes("UTF-8");
            output.writeInt(buf.length);
            output.write(buf);
            output.flush();
        }

        void close() {
            try { socket.close(); } catch (Exception ignored) {}
        }
    }
}
