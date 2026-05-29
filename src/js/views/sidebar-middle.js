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
        '<div class="search-input-wrapper" style="position: relative; display: flex; align-items: center;">' +
          '<i data-lucide="search" style="position: absolute; left: 12px; width: 16px; color: var(--text-muted);"></i>' +
          '<input type="text" class="search-input" placeholder="Search messages, people..." style="width: 100%; padding: 8px 12px 8px 36px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); outline: none;">' +
        '</div>' +
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
    var listContainer = document.getElementById('friends-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="padding:var(--spacing-lg);text-align:center;">' +
      '<button id="btn-create-group" style="padding:10px 20px;background:var(--accent-primary);color:white;border-radius:24px;border:none;cursor:pointer;">+ Create Group</button>' +
      '</div>';
    
    listContainer.querySelector('#btn-create-group').addEventListener('click', function() {
      // Basic mock for group creation
      var groupName = prompt("Enter Group Name:");
      if (groupName) {
        var groupId = 'group_' + Date.now();
        var state = window.store.getState();
        var msgs = state.messages;
        msgs[groupId] = [];
        window.store.setState({ messages: msgs, activeChatId: groupId });
        window.Toast.show("Group Created", "Welcome to " + groupName + "!");
        if (window.orbitAPI && window.orbitAPI.networkSend) {
           // Broadcast to peers (mock logic, true mesh requires more backend work)
           // window.orbitAPI.networkSend(peer.userId, peer.ip, 'GROUP_CREATE', { id: groupId, name: groupName });
        }
      }
    });
  },

  renderList(friends, activeChatId, messages) {
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

      html += '<div class="list-row ' + (isActive ? 'active' : '') + '" data-id="' + window.Sanitize.escapeHtml(friend.userId) + '">' +
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
          var friend = window.store.getState().friends.find(function(f) { return f.userId === id; });
          if (friend && window.ProfileCard) window.ProfileCard.open(friend);
        } else {
          window.store.setState({ activeChatId: id });
        }
      });
    });
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
    }

    var btnAddFriend = this.container.querySelector('#btn-add-friend');
    if (btnAddFriend) {
      btnAddFriend.addEventListener('click', function(e) {
        var ip = prompt("Enter peer IP address to connect:");
        if (ip && ip.trim() !== '') {
          if (window.orbitAPI && window.orbitAPI.connect) {
            window.orbitAPI.connect(ip.trim());
          }
          if (window.Toast) window.Toast.show("Connecting", "Attempting to connect to " + window.Sanitize.escapeHtml(ip));
        }
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
  }
};
