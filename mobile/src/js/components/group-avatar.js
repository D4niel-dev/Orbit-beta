// mobile/src/js/components/group-avatar.js
// Mobile side of the default group avatar.
//
// The layout itself lives in shared/ui/group-avatar.js so desktop and Android
// render the same thing. What mobile has to add is member resolution: a group
// synced from a peer can carry members as bare userId strings, or as objects
// with nothing but a userId, while the display name and avatar live on the
// matching friend record (or on MStore.user for yourself). The shared module
// exposes setResolver() for exactly this, so it stays free of app globals.
//
// Exposes window.OrbitGroupAvatarMobile.html(members, size, borderColor)
//   and   window.OrbitGroupAvatarMobile.forGroup(group, size, borderColor)

(function() {
  function resolveMember(m) {
    var id = (typeof m === 'string') ? m : (m && (m.userId || m.id));
    var friend = null;
    var self = null;

    if (id) {
      var friends = (typeof MStore !== 'undefined' && MStore.friends) || [];
      for (var i = 0; i < friends.length; i++) {
        if (String(friends[i].id) === String(id) || String(friends[i].peerId) === String(id)) {
          friend = friends[i];
          break;
        }
      }
      if (typeof MStore !== 'undefined' && MStore.user &&
          String(MStore.user.id) === String(id)) {
        self = MStore.user;
      }
    }

    var name = (typeof m === 'object' && m && (m.name || m.username)) ||
               (friend && friend.name) ||
               (self && (self.name || self.username)) ||
               id || '';
    var avatar = (typeof m === 'object' && m && m.avatar) ||
                 (friend && friend.avatar) ||
                 (self && self.avatar) ||
                 null;

    if (!name && !avatar) return null;   // let the shared module fall back
    return { name: name, avatar: avatar };
  }

  // Install once. Every OrbitGroupAvatar.html() call after this resolves members
  // through the store.
  if (window.OrbitGroupAvatar && window.OrbitGroupAvatar.setResolver) {
    window.OrbitGroupAvatar.setResolver(resolveMember);
  }

  window.OrbitGroupAvatarMobile = {
    resolveMember: resolveMember,
    /** members: array of member objects or userId strings */
    html: function(members, size, borderColor) {
      if (!window.OrbitGroupAvatar) return '';
      return window.OrbitGroupAvatar.html(members, size, borderColor);
    },
    /** group: an MStore.groups entry (or anything with a .members array) */
    forGroup: function(group, size, borderColor) {
      if (!window.OrbitGroupAvatar) return '';
      return window.OrbitGroupAvatar.html((group && group.members) || [], size, borderColor);
    }
  };
})();
