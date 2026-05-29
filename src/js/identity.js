// src/js/identity.js

window.Identity = {
  init() {
    let identity = window.orbitAPI ? window.orbitAPI.dbGetLocalUser() : (window.Storage ? window.Storage.get('identity') : null);
    
    if (!identity) {
      console.log('No identity found, generating new one...');
      identity = this.generateNew();
      this.save(identity);
    }
    
    // Update store with loaded identity
    window.store.setState({ currentUser: identity });
    console.log('Identity loaded:', identity.username + '#' + identity.usertag);
  },

  generateNew() {
    const uuid = window.orbitAPI ? window.orbitAPI.getUuid() : 'browser-uuid-' + Date.now();
    let hostname = window.orbitAPI ? window.orbitAPI.getHostname() : 'WebUser';
    
    // Clean up hostname to be a valid username
    hostname = hostname.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 32);
    if (hostname.length < 2) hostname = "OrbitUser";
    
    // Profanity check
    if (!window.Profanity.validateUsername(hostname).isValid) {
      hostname = "OrbitUser";
    }

    return {
      userId: uuid,
      username: hostname,
      usertag: window.Format.randomTag(),
      bio: "",
      aboutMe: "",
      avatar: null,
      banner: null,
      status: "online",
      createdAt: new Date().toISOString()
    };
  },

  save(identity) {
    if (window.orbitAPI) {
      window.orbitAPI.dbSaveUser(identity);
    } else if (window.Storage) {
      window.Storage.set('identity', identity);
    }
  },

  update(updates) {
    const currentState = window.store.getState().currentUser;
    const newState = { ...currentState, ...updates };
    
    // Perform validation if username is updated
    if (updates.username) {
      const validation = window.Profanity.validateUsername(updates.username);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }
    
    // Perform validation on bio
    if (updates.bio) {
      const validation = window.Profanity.check(updates.bio);
      if (!validation.isValid) {
        throw new Error("Bio contains inappropriate language.");
      }
    }

    this.save(newState);
    window.store.setState({ currentUser: newState });
    return newState;
  }
};
