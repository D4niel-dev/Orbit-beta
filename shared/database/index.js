// shared/database/index.js
// Database factory — routes to desktop (Electron IPC) or mobile (Capacitor SQLite) implementation

window.Orbit = window.Orbit || {};

Orbit.DatabaseFactory = {
  db: null,

  create() {
    if (Orbit.env.isElectron) {
      Orbit.DB = new Orbit.DesktopDatabase();
      return Orbit.DB;
    } else if (Orbit.env.isAndroid) {
      Orbit.DB = new Orbit.MobileDatabase();
      return Orbit.DB.init();
    }
    console.error('Orbit.DatabaseFactory: Unsupported platform', Orbit.env.platform);
    return null;
  }
};
