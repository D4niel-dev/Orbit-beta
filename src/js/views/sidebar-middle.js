// src/js/views/sidebar-middle.js

window.SidebarMiddle = {
  init() {
    this.container = document.getElementById('middle-sidebar-container');
    
    // Subscribe to store
    this.unsubscribe = window.store.subscribe((state) => {
      if (state.activeView === 'groups') {
        this.renderGroups();
      } else {
        this.renderList(state.friends, state.activeChatId, state.messages);
      }
    });

    this.render();
    this.attachEvents();
    
    // Initial render
    var state = window.store.getState();
    if (state.activeView === 'groups') {
      this.renderGroups();
    } else {
      this.renderList(state.friends, state.activeChatId, state.messages);
    }
  },

  render() {
    this.container.innerHTML = 
      '<div class="search-container" style="padding: 16px; padding-bottom: 8px;">' +
        '<div class="search-input-wrapper" data-debug="Search: query=\\"\\" results=0" style="position: relative; display: flex; align-items: center;">' +
          '<i data-lucide="search" style="position: absolute; left: 12px; width: 16px; color: var(--text-muted);"></i>' +
          '<input type="text" class="search-input" placeholder="Search messages, people..." style="width: 100%; padding: 8px 12px 8px 36px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); outline: none;">' +
          '<button id="btn-toggle-sidebar" title="Toggle Sidebar" style="background:transparent; border:none; cursor:pointer; color:var(--text-muted); padding:4px; margin-left:4px; flex-shrink:0;"><i data-lucide="chevrons-left" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
      '</div>' +
      '<div id="connection-stats-overlay" style="display:none;position:fixed;bottom:16px;right:16px;background:rgba(0,0,0,0.85);border:1px solid var(--border-subtle);border-radius:12px;padding:16px;z-index:9998;font-family:monospace;font-size:11px;color:#22c55e;flex-direction:column;gap:6px;min-width:200px;pointer-events:none;">' +
        '<div style="display:flex;justify-content:space-between;"><span>Status:</span><span id="conn-status">Disconnected</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span>Peers:</span><span id="conn-peers">0</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span>Uptime:</span><span id="conn-uptime">--</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span>Bytes Sent:</span><span id="conn-sent">0</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span>Bytes Recv:</span><span id="conn-recv">0</span></div>' +
      '</div>' +
      '<div class="tabs-container" style="display:flex; padding: 0 var(--spacing-md); margin-bottom: var(--spacing-md); gap: 16px;">' +
        '<button class="tab active" style="flex:1; text-align:center; padding: 12px 4px; border-bottom: 3px solid var(--accent-primary); border-top: none; border-left: none; border-right: none; font-weight: 600; color: var(--text-primary); background: transparent; transition: var(--transition); cursor:pointer;">Friends</button>' +
        '<button class="tab" style="flex:1; text-align:center; padding: 12px 4px; border-bottom: 3px solid transparent; border-top: none; border-left: none; border-right: none; color: var(--text-muted); font-weight: 500; background: transparent; transition: var(--transition); cursor:pointer;">Groups</button>' +
      '</div>' +
      '<div class="list-container" id="friends-list-container" style="flex:1; overflow-y:auto;">' +
        '<!-- Dynamically rendered -->' +
      '</div>';
    lucide.createIcons({ root: this.container });
  },

  renderGroups() {
    var self = this;
    var listContainer = document.getElementById('friends-list-container');
    if (!listContainer) return;
    var state = window.store.getState();
    var groups = state.groups || [];
    var activeChatId = state.activeChatId;
    var messages = state.messages;

    var hasGroups = groups.length > 0;
    var html = '';
    if (hasGroups) {
      html += '<div style="padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md); display:flex; justify-content:space-between; align-items:center;">' +
        '<span style="font-size: 12px; font-weight:bold; color:var(--text-muted); text-transform:uppercase;">Groups (' + groups.length + ')</span>' +
        '<button id="btn-create-group" style="color:var(--text-secondary); cursor:pointer;"><i data-lucide="plus" style="width:16px;height:16px;"></i></button>' +
      '</div>';
    } else {
      html += '<div style="padding: var(--spacing-md); display:flex; justify-content:stretch; align-items:center;">' +
        '<button id="btn-create-group" style="width:100%;padding:10px 20px;background:var(--accent-primary);color:white;border-radius:24px;border:none;cursor:pointer;font-weight:600;">+ Create Group</button>' +
      '</div>';
    }

    if (groups.length === 0) {
      html += '<div style="padding: var(--spacing-lg); text-align: center; color: var(--text-muted); font-size: 13px;">' +
        'No groups yet.<br>Create a group to chat with multiple friends.' +
      '</div>';
    } else {
      groups.forEach(function(group) {
        var isActive = activeChatId === group.groupId;
        var members = group.members || [];
        var onlineMembers = members.filter(function(m) { return m.status === 'online' || m.status === 'online'; });
        var subtitle = members.length + ' member' + (members.length !== 1 ? 's' : '');
        var groupMsgs = messages[group.groupId] || [];
        if (groupMsgs.length > 0) {
          var lastMsg = groupMsgs[groupMsgs.length - 1];
          subtitle = lastMsg.text;
          if (subtitle.length > 25) subtitle = subtitle.substring(0, 25) + '...';
        }

        // Group avatar or overlapping member circles
        var avatarHtml = '';
        if (group.avatarPath) {
          avatarHtml = '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(group.groupId) + '?t=' + (group.avatarUpdatedAt || 0) + '" style="width:40px;height:40px;border-radius:12px;object-fit:cover;">';
        } else {
          var displayMembers = members.slice(0, 3);
          displayMembers.forEach(function(m, idx) {
            var offset = idx * 14;
            var memberAvatar = m.avatar
              ? '<img src="' + window.Sanitize.escapeHtml(m.avatar) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid var(--bg-base);position:absolute;left:' + offset + 'px;top:0;">'
              : '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:10px;color:white;border:2px solid var(--bg-base);position:absolute;left:' + offset + 'px;top:0;font-weight:600;">' + m.username.charAt(0).toUpperCase() + '</div>';
            avatarHtml += memberAvatar;
          });
        }
        var avatarWidth = group.avatarPath ? 40 : Math.min(displayMembers.length, 3) * 14 + 28;

        var pinIcon = group.pinned ? '<i data-lucide="pin" style="width:12px;height:12px;color:var(--accent-primary);margin-left:4px;"></i>' : '';

        html += '<div class="list-row ' + (isActive ? 'active' : '') + '" data-id="' + window.Sanitize.escapeHtml(group.groupId) + '" data-type="group" data-debug="Group: ' + window.Sanitize.escapeHtml(group.groupName) + ' ID: ' + window.Sanitize.escapeHtml(group.groupId) + '"' +
          ' oncontextmenu="event.preventDefault();' +
            'if(window.ContextMenu) window.ContextMenu.show(event.clientX, event.clientY, [' +
              '{label:\'' + (group.pinned ? 'Unpin' : 'Pin') + ' Group\',icon:\'pin\',action:\'pin-group\',onClick:function(){' +
                'window.store.updateGroupField(\'' + group.groupId + '\',\'pinned\',' + (group.pinned ? '0' : '1') + ');' +
              '}},' +
              '{label:\'Group Info\',icon:\'info\',action:\'group-info\',onClick:function(){' +
                'window.SidebarMiddle.showGroupInfo(\'' + group.groupId + '\');' +
              '}},' +
              '{label:\'Copy Invite Code\',icon:\'link\',action:\'copy-invite\',onClick:function(){' +
                'navigator.clipboard.writeText(\'' + (group.inviteCode || '') + '\');' +
                'if(window.Toast) window.Toast.show(\'Copied\',\'Invite code copied to clipboard\');' +
              '}},' +
              '\'separator\',' +
              '{label:\'Leave Group\',icon:\'log-out\',action:\'leave-group\',onClick:function(){' +
                'if(window.ConfirmModal) window.ConfirmModal.show({title:\'Leave Group\',message:\'Are you sure you want to leave this group?\',confirmText:\'Leave\',danger:true,onConfirm:function(){' +
                  'window.store.removeGroupMember(\'' + group.groupId + '\',window.store.getState().currentUser.userId);' +
                '}});' +
              '}},' +
              '{label:\'Delete Group\',icon:\'trash-2\',action:\'delete-group\',color:\'var(--accent-danger)\',onClick:function(){' +
                'if(window.ConfirmModal) window.ConfirmModal.show({title:\'Delete Group\',message:\'Are you sure you want to permanently delete this group and all messages?\',confirmText:\'Delete\',danger:true,onConfirm:function(){' +
                  'window.store.removeGroup(\'' + group.groupId + '\');' +
                '}});' +
              '}}' +
            ']);">' +
          '<div class="avatar avatar-md list-row-avatar" style="position:relative;width:' + avatarWidth + 'px;min-width:' + avatarWidth + 'px;height:40px;display:flex;align-items:center;justify-content:center;">' +
            avatarHtml +
          '</div>' +
          '<div class="list-row-info">' +
            '<div class="list-row-title">' + window.Sanitize.escapeHtml(group.groupName || 'Unnamed Group') + pinIcon + '</div>' +
            '<div class="list-row-subtitle">' + window.Sanitize.escapeHtml(subtitle) + '</div>' +
          '</div>' +
        '</div>';
      });
    }

    listContainer.innerHTML = html;
    lucide.createIcons({ root: listContainer });

    // Click group to open chat
    var rows = listContainer.querySelectorAll('.list-row');
    rows.forEach(function(row) {
      row.addEventListener('click', function(e) {
        var id = row.getAttribute('data-id');
        window.store.setState({ activeChatId: id });
      });
    });

    // Create group button - open friend picker modal
    listContainer.querySelector('#btn-create-group').addEventListener('click', function() {
      self.showCreateGroupModal();
    });
  },

  showCreateGroupModal() {
    var state = window.store.getState();
    var friends = state.friends.filter(function(f) { return f.userId !== state.currentUser.userId && f.userId !== 'local-echo'; });

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var activeTab = 'create';

    function renderModal() {
      var friendOptions = '';
      friends.forEach(function(f) {
        var initial = f.username ? f.username.charAt(0).toUpperCase() : '?';
        friendOptions += '<label style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'var(--bg-hover)\'" onmouseout="this.style.background=\'transparent\'">' +
          '<input type="checkbox" class="group-member-cb" value="' + window.Sanitize.escapeHtml(f.userId) + '" style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:pointer;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:600;flex-shrink:0;">' + initial + '</div>' +
          '<div><div style="font-weight:500;color:var(--text-primary);">' + window.Sanitize.escapeHtml(f.username) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">' + window.Sanitize.escapeHtml(f.status || 'online') + '</div></div>' +
        '</label>';
      });

      var createContent = activeTab === 'create' ? 'style="display:block;"' : 'style="display:none;"';
      var joinContent = activeTab === 'join' ? 'style="display:block;"' : 'style="display:none;"';

      overlay.innerHTML =
        '<div style="width:420px;max-height:620px;background:var(--bg-surface);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);">' +
          '<div style="padding:16px 24px 12px;display:flex;flex-direction:column;gap:12px;border-bottom:1px solid var(--border-subtle);">' +
            '<div style="display:flex;background:var(--bg-base);border-radius:10px;padding:3px;">' +
              '<button class="gcm-tab" data-tab="create" style="flex:1;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:' + (activeTab === 'create' ? '600' : '500') + ';background:' + (activeTab === 'create' ? 'var(--accent-primary)' : 'transparent') + ';color:' + (activeTab === 'create' ? 'white' : 'var(--text-secondary)') + ';transition:all 0.15s;">Create</button>' +
              '<button class="gcm-tab" data-tab="join" style="flex:1;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:' + (activeTab === 'join' ? '600' : '500') + ';background:' + (activeTab === 'join' ? 'var(--accent-primary)' : 'transparent') + ';color:' + (activeTab === 'join' ? 'white' : 'var(--text-secondary)') + ';transition:all 0.15s;">Join</button>' +
            '</div>' +
          '</div>' +
          '<div ' + createContent + ' style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
            '<div style="padding:32px 40px 20px;display:flex;flex-direction:column;gap:18px;">' +
              '<div style="display:flex;align-items:flex-start;gap:16px;">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
                '<div><div style="font-weight:600;color:var(--text-primary);font-size:16px;">Create a New Group</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">Give your group a name and invite friends to start chatting together.</div></div>' +
              '</div>' +
              '<input id="group-name-input" type="text" placeholder="Group name..." style="width:100%;padding:14px 16px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;box-sizing:border-box;">' +
            '</div>' +
            '<div style="flex:1;overflow-y:auto;padding:0 40px 16px;">' +
              '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;padding:8px 0 12px;letter-spacing:0.5px;">Select Members</div>' +
              friendOptions +
              (friends.length === 0 ? '<div style="padding:16px 0;text-align:center;color:var(--text-muted);font-size:13px;">No friends available.</div>' : '') +
            '</div>' +
            '<div style="padding:20px 40px 28px;border-top:1px solid var(--border-subtle);display:flex;gap:12px;justify-content:flex-end;background:var(--bg-surface);">' +
              '<button id="btn-cancel-group" style="padding:11px 24px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;flex-shrink:0;">Cancel</button>' +
              '<button id="btn-confirm-group" style="padding:11px 28px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;flex-shrink:0;">Create</button>' +
            '</div>' +
          '</div>' +
          '<div ' + joinContent + ' style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
            '<div style="flex:1;padding:56px 40px 32px;display:flex;flex-direction:column;gap:28px;">' +
              '<div style="display:flex;align-items:flex-start;gap:16px;">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
                '<div><div style="font-weight:600;color:var(--text-primary);font-size:16px;">Join with Invite Code</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">Paste an invite code or link shared in a chat to join a group.</div></div>' +
              '</div>' +
              '<input id="join-code-input" type="text" placeholder="Paste invite code..." style="width:100%;padding:14px 16px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;box-sizing:border-box;">' +
            '</div>' +
            '<div style="padding:20px 40px 28px;border-top:1px solid var(--border-subtle);display:flex;gap:12px;justify-content:flex-end;background:var(--bg-surface);">' +
              '<button id="btn-cancel-join" style="padding:11px 24px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;flex-shrink:0;">Cancel</button>' +
              '<button id="btn-confirm-join" style="padding:11px 28px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;flex-shrink:0;">Join</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (!overlay.parentNode) document.body.appendChild(overlay);
      lucide.createIcons({ root: overlay });

      attachEvents();
    }

    function attachEvents() {
      overlay.querySelectorAll('.gcm-tab').forEach(function(btn) {
        btn.addEventListener('click', function() {
          activeTab = btn.getAttribute('data-tab');
          renderModal();
        });
      });

      overlay.querySelector('#btn-cancel-group').addEventListener('click', function() { document.body.removeChild(overlay); });
      overlay.querySelector('#btn-cancel-join').addEventListener('click', function() { document.body.removeChild(overlay); });
      overlay.addEventListener('click', function(e) { if (e.target === overlay) document.body.removeChild(overlay); });

      overlay.querySelector('#btn-confirm-group').addEventListener('click', function() {
        var groupName = overlay.querySelector('#group-name-input').value.trim();
        if (!groupName) { window.Toast.show('Error', 'Please enter a group name'); return; }

        var checkboxes = overlay.querySelectorAll('.group-member-cb:checked');
        var state = window.store.getState();
        var groupId = 'group_' + Date.now();

        var selectedMembers = [];
        checkboxes.forEach(function(cb) {
          var friend = state.friends.find(function(f) { return f.userId === cb.value; });
          if (friend) {
            selectedMembers.push({
              userId: friend.userId,
              username: friend.username,
              usertag: friend.usertag || '',
              status: friend.status || 'online',
              avatar: friend.avatar || null,
              ip: friend.ip || null
            });
          }
        });

        var allMembers = [
          {
            userId: state.currentUser.userId,
            username: state.currentUser.username || 'You',
            usertag: state.currentUser.usertag || '',
            status: 'online',
            avatar: state.currentUser.avatar || null,
            ip: null
          },
          ...selectedMembers
        ];

        var group = {
          groupId: groupId,
          groupName: groupName,
          ownerId: state.currentUser.userId,
          members: allMembers,
          createdAt: new Date().toISOString()
        };

        window.store.addGroup(group);

        var msgs = state.messages;
        msgs[groupId] = [];
        window.store.setState({ messages: msgs, activeChatId: groupId });

        if (window.orbitAPI) {
          allMembers.forEach(function(m) {
            if (m.userId !== state.currentUser.userId && m.ip) {
              window.orbitAPI.networkSend(m.userId, m.ip, window.Protocol.Types.GROUP_CREATE, {
                groupId: groupId,
                groupName: groupName,
                ownerId: state.currentUser.userId,
                members: allMembers
              });
            }
          });
        }

        window.Toast.show('Group Created', 'Welcome to ' + groupName + '!');
        document.body.removeChild(overlay);
      });

      overlay.querySelector('#btn-confirm-join').addEventListener('click', function() {
        var code = overlay.querySelector('#join-code-input').value.trim();
        if (!code) { window.Toast.show('Error', 'Please enter an invite code'); return; }

        var state = window.store.getState();
        var matchedGroup = state.groups.find(function(g) { return g.inviteCode === code; });
        if (matchedGroup) {
          window.Toast.show('Already Member', 'You are already in this group.');
          return;
        }

        if (window.orbitAPI) {
          state.friends.forEach(function(f) {
            if (f.ip) {
              window.orbitAPI.networkSend(f.userId, f.ip, window.Protocol.Types.GROUP_JOIN_REQUEST, {
                inviteCode: code,
                userId: state.currentUser.userId,
                username: state.currentUser.username
              });
            }
          });
        }

        window.Toast.show('Join Request Sent', 'Invite sent to group members for approval.');
        document.body.removeChild(overlay);
      });
    }

    renderModal();
  },

  renderList(friends, activeChatId, messages) {
    var self = this;
    var listContainer = document.getElementById('friends-list-container');
    if (!listContainer) return;

    if (!friends || friends.length === 0) {
      listContainer.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--text-muted); font-size: 13px;">' +
        'No friends online.<br>Waiting for peers on the local network...' +
      '</div>';
      return;
    }

    var onlineFriends = friends.filter(function(f) { return f.status === 'online'; });
    
    var html = '<div style="padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md); display:flex; justify-content:space-between; align-items:center;">' +
      '<span style="font-size: 12px; font-weight:bold; color:var(--text-muted); text-transform:uppercase;">Online (' + onlineFriends.length + ')</span>' +
      '<button id="btn-add-friend" style="color:var(--text-secondary); cursor:pointer;"><i data-lucide="plus" style="width:16px;height:16px;"></i></button>' +
    '</div>';

    friends.forEach(function(friend) {
      var isActive = activeChatId === friend.userId;
      
      var userMsgs = messages[friend.userId] || [];
      var subtitle = '#' + (friend.usertag || '0000');
      if (userMsgs.length > 0) {
        var lastMsg = userMsgs[userMsgs.length - 1];
        subtitle = lastMsg.text;
        if (subtitle.length > 25) subtitle = subtitle.substring(0, 25) + '...';
      }

      var avatarImg = friend.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(friend.avatar) + '" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">'
        : '<i data-lucide="user"></i>';

      html += '<div class="list-row ' + (isActive ? 'active' : '') + '" data-id="' + window.Sanitize.escapeHtml(friend.userId) + '" data-debug="User: ' + window.Sanitize.escapeHtml(friend.username) + ' ID: ' + window.Sanitize.escapeHtml(friend.userId) + ' Status: ' + window.Sanitize.escapeHtml(friend.status || 'offline') + '">' +
        '<div class="avatar avatar-md list-row-avatar" style="position:relative;">' +
          avatarImg +
          '<div class="status-indicator ' + window.Sanitize.escapeHtml(friend.status || 'offline') + '"></div>' +
        '</div>' +
        '<div class="list-row-info">' +
          '<div class="list-row-title">' + window.Sanitize.escapeHtml(friend.username) + '</div>' +
          '<div class="list-row-subtitle">' + window.Sanitize.escapeHtml(subtitle) + '</div>' +
        '</div>' +
      '</div>';
    });

    listContainer.innerHTML = html;
    lucide.createIcons({ root: listContainer });
    
    // Reattach click events for list items
    var rows = listContainer.querySelectorAll('.list-row');
    rows.forEach(function(row) {
      row.addEventListener('click', function(e) {
        var id = row.getAttribute('data-id');
        if (e.target.closest('.list-row-avatar')) {
          e.stopPropagation();
          var state = window.store.getState();
          var friend = state.friends.find(function(f) { return f.userId === id; });
          if (friend && window.ProfileSidebar) window.ProfileSidebar.open(friend);
        } else {
          window.store.setState({ activeChatId: id });
        }
      });
    });

    var btnAddFriend = listContainer.querySelector('#btn-add-friend');
    if (btnAddFriend) {
      btnAddFriend.addEventListener('click', function(e) {
        self.showAddFriendModal();
      });
    }
  },

  showAddFriendModal() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="width:400px;background:var(--bg-surface);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);display:flex;flex-direction:column;">' +
        '<div style="flex:1;padding:48px 40px 32px;display:flex;flex-direction:column;gap:28px;">' +
          '<div style="display:flex;align-items:flex-start;gap:16px;">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' +
            '<div><div style="font-weight:600;color:var(--text-primary);font-size:16px;">Add a Friend</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">Enter the IP address of a peer on your local network to connect with them.</div></div>' +
          '</div>' +
          '<input id="connect-ip-input" type="text" placeholder="192.168.1.x" style="width:100%;padding:14px 16px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;box-sizing:border-box;">' +
        '</div>' +
        '<div style="padding:20px 40px 28px;border-top:1px solid var(--border-subtle);display:flex;gap:12px;justify-content:flex-end;background:var(--bg-surface);">' +
          '<button id="btn-cancel-connect" style="padding:11px 24px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;flex-shrink:0;">Cancel</button>' +
          '<button id="btn-confirm-connect" style="padding:11px 28px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;flex-shrink:0;">Connect</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById('btn-cancel-connect').addEventListener('click', function() { document.body.removeChild(overlay); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) document.body.removeChild(overlay); });
    document.getElementById('btn-confirm-connect').addEventListener('click', function() {
      var ip = document.getElementById('connect-ip-input').value.trim();
      if (!ip) { window.Toast.show('Error', 'Please enter an IP address'); return; }
      if (window.orbitAPI) {
        if (window.orbitAPI.connect) window.orbitAPI.connect(ip);
        window.Toast.show('Connecting', 'Attempting to connect to ' + window.Sanitize.escapeHtml(ip));
      }
      document.body.removeChild(overlay);
    });
    var inp = document.getElementById('connect-ip-input');
    if (inp) { inp.focus(); inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('btn-confirm-connect').click(); }); }
  },

  attachEvents() {
    var self = this;
    var searchInput = this.container.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        var query = e.target.value.toLowerCase();
        var rows = self.container.querySelectorAll('.list-row');
        rows.forEach(function(row) {
          var text = row.innerText.toLowerCase();
          if (text.includes(query)) {
            row.style.display = 'flex';
          } else {
            row.style.display = 'none';
          }
        });
      });

      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var query = e.target.value.trim();
          if (!query) return;
          if (window.ChatPanel && window.ChatPanel.showSearchModal) {
            window.ChatPanel.showSearchModal(query);
          }
        }
      });
    }

    var toggleBtn = this.container.querySelector('#btn-toggle-sidebar');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var state = window.store.getState();
        window.store.setState({ sidebarMiddleVisible: !state.sidebarMiddleVisible });
      });
    }

    var tabs = this.container.querySelectorAll('.tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function(e) {
        tabs.forEach(function(t) {
          t.classList.remove('active');
          t.style.borderBottomColor = 'transparent';
          t.style.color = 'var(--text-secondary)';
          t.style.fontWeight = 'normal';
        });
        e.target.classList.add('active');
        e.target.style.borderBottomColor = 'var(--accent-primary)';
        e.target.style.color = 'var(--text-primary)';
        e.target.style.fontWeight = '500';
        
        var view = e.target.innerText.toLowerCase();
        window.store.setState({ activeView: view });
      });
    });
  },

  showGroupInfo(groupId) {
    var state = window.store.getState();
    var group = state.groups.find(function(g) { return g.groupId === groupId; });
    if (!group) return;

    var isOwner = group.ownerId === state.currentUser.userId;

    // Build member list HTML
    var membersHtml = '';
    (group.members || []).forEach(function(m) {
      var isOnline = m.status === 'online';
      var onlineDot = isOnline
        ? '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:8px;"></span>'
        : '<span style="width:8px;height:8px;border-radius:50%;background:#6b7280;display:inline-block;margin-right:8px;"></span>';
      var mAvatar = m.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(m.avatar) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">'
        : '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:12px;color:white;font-weight:600;">' + m.username.charAt(0).toUpperCase() + '</div>';
      membersHtml += '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;cursor:default;">' +
        mAvatar +
        '<div style="flex:1;">' +
          '<div style="font-size:13px;font-weight:500;color:var(--text-primary);">' + window.Sanitize.escapeHtml(m.username) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);">@' + window.Sanitize.escapeHtml(m.usertag || '') + '</div>' +
        '</div>' +
        onlineDot +
      '</div>';
    });

    var avatarSection = group.avatarPath
      ? '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(groupId) + '?t=' + (group.avatarUpdatedAt || 0) + '" id="group-info-avatar-img" style="width:80px;height:80px;border-radius:16px;object-fit:cover;cursor:pointer;">'
      : '<div id="group-info-avatar-img" style="width:80px;height:80px;border-radius:16px;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:28px;color:white;font-weight:600;cursor:pointer;">' + (group.groupName || 'G').charAt(0).toUpperCase() + '</div>';

    var overlay = document.createElement('div');
    overlay.id = 'group-info-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:var(--bg-surface);border:1px solid var(--border-color);border-radius:16px;width:420px;max-height:80vh;overflow-y:auto;padding:24px;';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<h2 style="font-size:18px;font-weight:600;color:var(--text-primary);margin:0;">Group Info</h2>' +
        '<button class="btn-ghost" id="group-info-close" style="background:none;border:none;color:var(--text-secondary);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:8px;">&times;</button>' +
      '</div>' +
      '<div style="text-align:center;margin-bottom:16px;">' +
        avatarSection +
        (isOwner ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;cursor:pointer;" id="group-info-upload-avatar">Change Avatar</div>' : '') +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="font-size:12px;font-weight:500;color:var(--text-muted);display:block;margin-bottom:4px;">Group Name</label>' +
        '<input id="group-info-name" type="text" value="' + window.Sanitize.escapeHtml(group.groupName || '') + '" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-base);color:var(--text-primary);font-size:14px;' + (isOwner ? '' : 'opacity:0.7;') + '" ' + (isOwner ? '' : 'disabled') + '>' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="font-size:12px;font-weight:500;color:var(--text-muted);display:block;margin-bottom:4px;">Description</label>' +
        '<textarea id="group-info-desc" rows="2" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-base);color:var(--text-primary);font-size:13px;resize:none;' + (isOwner ? '' : 'opacity:0.7;') + '" ' + (isOwner ? '' : 'disabled') + '>' + window.Sanitize.escapeHtml(group.description || '') + '</textarea>' +
      '</div>' +
      '<div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-size:12px;font-weight:500;color:var(--text-muted);">Invite Code</div>' +
          '<div style="font-size:13px;color:var(--accent-primary);font-family:monospace;">' + window.Sanitize.escapeHtml(group.inviteCode || '') + '</div>' +
        '</div>' +
        '<button class="btn-ghost" id="group-info-copy-invite" style="padding:6px 12px;border-radius:8px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:12px;">Copy</button>' +
      '</div>' +
      '<div style="margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-top:1px solid var(--border-color);">' +
        '<span style="font-size:13px;color:var(--text-primary);">Pin Group</span>' +
        '<label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer;">' +
          '<input type="checkbox" id="group-info-pin"' + (group.pinned ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">' +
          '<span style="position:absolute;inset:0;background:' + (group.pinned ? 'var(--accent-primary)' : '#555') + ';border-radius:11px;transition:0.2s;"></span>' +
          '<span style="position:absolute;left:' + (group.pinned ? '20px' : '2px') + ';top:2px;width:18px;height:18px;border-radius:50%;background:white;transition:0.2s;"></span>' +
        '</label>' +
      '</div>' +
      '<div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">' +
        '<span style="font-size:13px;color:var(--text-primary);">Mute Notifications</span>' +
        '<label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer;">' +
          '<input type="checkbox" id="group-info-mute"' + (group.notificationMuted ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">' +
          '<span style="position:absolute;inset:0;background:' + (group.notificationMuted ? 'var(--accent-primary)' : '#555') + ';border-radius:11px;transition:0.2s;"></span>' +
          '<span style="position:absolute;left:' + (group.notificationMuted ? '20px' : '2px') + ';top:2px;width:18px;height:18px;border-radius:50%;background:white;transition:0.2s;"></span>' +
        '</label>' +
      '</div>' +
      '<div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:8px;">Members (' + (group.members || []).length + ')</div>' +
      membersHtml;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Close button
    document.getElementById('group-info-close').addEventListener('click', function() {
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    // Copy invite code
    document.getElementById('group-info-copy-invite').addEventListener('click', function() {
      if (group.inviteCode) {
        navigator.clipboard.writeText(group.inviteCode);
        if (window.Toast) window.Toast.show('Copied', 'Invite code copied');
      }
    });

    // Upload avatar
    var uploadBtn = document.getElementById('group-info-upload-avatar');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function() { window.SidebarMiddle.handleGroupAvatarUpload(groupId); });
    }

    // Edit name (debounced save)
    var nameInput = document.getElementById('group-info-name');
    if (nameInput && isOwner) {
      nameInput.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'groupName', nameInput.value);
      });
    }

    // Edit description (debounced save)
    var descInput = document.getElementById('group-info-desc');
    if (descInput && isOwner) {
      descInput.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'description', descInput.value);
      });
    }

    // Pin toggle
    var pinCheck = document.getElementById('group-info-pin');
    if (pinCheck) {
      pinCheck.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'pinned', pinCheck.checked ? 1 : 0);
        // Update toggle style
        var span = pinCheck.nextElementSibling;
        span.style.background = pinCheck.checked ? 'var(--accent-primary)' : '#555';
        span.nextElementSibling.style.left = pinCheck.checked ? '20px' : '2px';
      });
    }

    // Mute toggle
    var muteCheck = document.getElementById('group-info-mute');
    if (muteCheck) {
      muteCheck.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'notificationMuted', muteCheck.checked ? 1 : 0);
        var span = muteCheck.nextElementSibling;
        span.style.background = muteCheck.checked ? 'var(--accent-primary)' : '#555';
        span.nextElementSibling.style.left = muteCheck.checked ? '20px' : '2px';
      });
    }
  },

  handleGroupAvatarUpload(groupId) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        // Save to avatars directory via IPC
        if (window.orbitAPI && window.orbitAPI.saveAvatar) {
          var ts = Date.now();
          window.orbitAPI.saveAvatar(groupId, ev.target.result.split(',')[1]).then(function(path) {
            window.store.updateGroupField(groupId, 'avatarPath', path);
            window.store.updateGroupField(groupId, 'avatarUpdatedAt', ts);
            // Update image in panel
            var img = document.getElementById('group-info-avatar-img');
            if (img) img.src = 'orbit-avatar://' + groupId + '?t=' + ts;
          });
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
};
