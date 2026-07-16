window.Identity = {
  init() {
    var allUsers = window.orbitAPI ? window.orbitAPI.dbGetAllUsers() : [];
    var identity;

    if (allUsers.length === 0) {
      console.log('No identities found, generating new one...');
      identity = this.generateNew();
      this.save(identity);
    } else {
      var lastActiveId = window.orbitAPI ? window.orbitAPI.dbGetSetting('lastActiveUserId', null) : null;
      identity = lastActiveId ? allUsers.find(function(u) { return u.userId === lastActiveId; }) : null;
      if (!identity) identity = allUsers[0];
      if (!identity.publicKey && window.orbitAPI && window.orbitAPI.e2eeGetPublicKey) {
        identity.publicKey = window.orbitAPI.e2eeGetPublicKey();
        this.save(identity);
      }
    }

    window.store.setState({ currentUser: identity });
    if (window.orbitAPI) window.orbitAPI.dbSetSetting('lastActiveUserId', identity.userId);
    console.log('Identity loaded:', identity.username + '#' + identity.usertag);
  },

  getAll() {
    var users = window.orbitAPI ? window.orbitAPI.dbGetAllUsers() : (window.store.getState().currentUser ? [window.store.getState().currentUser] : []);
    return users.filter(function(u) { return u && u.userId && u.usertag && u.username; });
  },

  switchTo(userId) {
    var target = window.orbitAPI ? window.orbitAPI.dbGetUser(userId) : null;
    if (!target) { console.error('[Identity] switchTo: user not found', userId); return false; }
    if (target.profileFrame == null) target.profileFrame = 0;
    window.store.setState({ currentUser: target });
    if (window.orbitAPI) window.orbitAPI.dbSetSetting('lastActiveUserId', target.userId);
    console.log('[Identity] Switched to:', target.username + '#' + target.usertag);

    // Track account switch for undo/redo
    if (window.UndoManager && !window.UndoManager._paused && window.store) {
      var _prevUser = window.store.getState().currentUser;
      var _newUserId = userId;
      var _newUser = target;
      window.UndoManager.pushAction('Switch account', function() {
        // Undo: switch back to previous account
        if (_prevUser && _prevUser.userId) {
          window.Identity.switchTo(_prevUser.userId);
        }
      }, function() {
        // Redo: switch to new account
        window.Identity.switchTo(_newUserId);
      });
    }

    return true;
  },

  generateNew() {
    const uuid = window.orbitAPI ? window.orbitAPI.getUuid() : 'browser-uuid-' + Date.now();
    let hostname = window.orbitAPI ? window.orbitAPI.getHostname() : 'WebUser';

    hostname = hostname.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 32);
    if (hostname.length < 2) hostname = "OrbitUser";

    if (!window.Profanity.validateUsername(hostname).isValid) {
      hostname = "OrbitUser";
    }

    var pubKey = window.orbitAPI && window.orbitAPI.e2eeGetPublicKey ? window.orbitAPI.e2eeGetPublicKey() : null;

    return {
      userId: uuid,
      username: hostname,
      usertag: window.Format.randomTag(),
      bio: "",
      aboutMe: "",
      avatar: null,
      banner: null,
      profileFrame: null,
      status: "online",
      createdAt: new Date().toISOString(),
      publicKey: pubKey
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

    if (updates.username) {
      const validation = window.Profanity.validateUsername(updates.username);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }

    if (updates.bio) {
      const validation = window.Profanity.check(updates.bio);
      if (!validation.isValid) {
        throw new Error("Bio contains inappropriate language.");
      }
    }

    // Track profile changes for undo/redo
    if (window.UndoManager && !window.UndoManager._paused) {
      var _oldUser = currentState;
      var _newUser = newState;
      var _changedKeys = Object.keys(updates);
      var label = 'Update profile';
      if (_changedKeys.length === 1) {
        if (_changedKeys[0] === 'username') label = 'Change username';
        else if (_changedKeys[0] === 'bio') label = 'Change bio';
        else if (_changedKeys[0] === 'avatar') label = 'Change avatar';
        else if (_changedKeys[0] === 'banner') label = 'Change banner';
      }
      window.UndoManager.pushAction(label, function() {
        // Undo: restore old user data
        window.Identity.save(_oldUser);
        window.store.setState({ currentUser: _oldUser });
        // Re-render account tab if open
        if (window.SettingsModal) {
          var ct = document.querySelector('#settings-content');
          if (ct && ct.innerHTML.indexOf('My Account') > -1) window.SettingsModal.renderTab('account');
        }
      }, function() {
        // Redo: re-apply new user data
        window.Identity.save(_newUser);
        window.store.setState({ currentUser: _newUser });
        if (window.SettingsModal) {
          var ct = document.querySelector('#settings-content');
          if (ct && ct.innerHTML.indexOf('My Account') > -1) window.SettingsModal.renderTab('account');
        }
      });
    }

    this.save(newState);
    window.store.setState({ currentUser: newState });
    return newState;
  }
};
