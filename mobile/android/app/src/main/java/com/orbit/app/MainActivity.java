package com.orbit.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.orbit.app.plugins.OrbitP2PPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(OrbitP2PPlugin.class);
    }
}
