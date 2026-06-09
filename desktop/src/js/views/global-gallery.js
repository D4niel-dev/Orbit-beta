// src/js/views/global-gallery.js

window.GlobalGallery = {
  init() {
    this.container = document.getElementById('global-gallery-container');
    if (!this.container) return;
    
    this.currentFilter = 'all';
    this.mediaType = 'all';
    this.searchQuery = '';
    this.displayMode = (window.store.getState().settings || {}).galleryViewMode || 'grid';

    this.unsubscribe = window.store.subscribe((state) => {
      this.render(state);
    });
    
    this.render(window.store.getState());
  },

  render(state) {
    if (state.activeTab !== 'gallery') {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';

    var allAttachments = [];
    const messages = state.messages || {};
    const friends = state.friends || [];
    const groups = state.groups || [];

    function chatNameFor(chatId) {
      var f = friends.find(function(f) { return f.userId === chatId; });
      if (f) return f.username;
      var g = groups.find(function(g) { return g.groupId === chatId; });
      if (g) return g.groupName;
      if (chatId === 'local-echo') return 'Orbit Echo';
      return chatId;
    }

    Object.keys(messages).forEach(chatId => {
      const chatMsgs = messages[chatId];
      const chatName = chatNameFor(chatId);

      chatMsgs.forEach(msg => {
        if (msg.attachments) {
          msg.attachments.forEach(function(att) {
            var type = (att.type || '').toLowerCase();
            if (this.mediaType === 'images' && type !== 'image') return;
            if (this.mediaType === 'files' && type === 'image') return;
            allAttachments.push({
              ...att,
              chatId: chatId,
              chatName: chatName,
              timestamp: msg.timestamp
            });
          }, this);
        }
      }, this);
    });

    const isTypeFilterActive = this.mediaType !== 'all';
    const filteredChats = [...new Set(allAttachments.map(function(a) { return a.chatId; }))];

    // Apply Chat Filter
    if (this.currentFilter !== 'all' && filteredChats.indexOf(this.currentFilter) !== -1) {
      allAttachments = allAttachments.filter(function(a) { return a.chatId === this.currentFilter; }, this);
    } else {
      this.currentFilter = 'all';
    }

    // Apply Search Filter
    if (this.searchQuery.trim() !== '') {
      const query = this.searchQuery.toLowerCase();
      allAttachments = allAttachments.filter(function(a) {
        return (a.name && a.name.toLowerCase().indexOf(query) !== -1) ||
               (a.chatName && a.chatName.toLowerCase().indexOf(query) !== -1);
      });
    }

    // Sort newest first
    allAttachments.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

    var images = allAttachments.filter(function(a) { return (a.type || '').toLowerCase() === 'image'; });
    var nonImages = allAttachments.filter(function(a) { return (a.type || '').toLowerCase() !== 'image'; });

    function fileIconHtml(name) {
      var ext = (name || '').split('.').pop().toLowerCase();
      var icon = 'file';
      if (['pdf'].indexOf(ext) !== -1) icon = 'file-text';
      else if (['zip','rar','7z','gz','tar'].indexOf(ext) !== -1) icon = 'archive';
      else if (['mp3','wav','ogg','flac','aac','m4a','wma'].indexOf(ext) !== -1) icon = 'music';
      else if (['mp4','mkv','avi','mov','wmv','webm'].indexOf(ext) !== -1) icon = 'video';
      else if (['doc','docx','xls','xlsx','ppt','pptx'].indexOf(ext) !== -1) icon = 'file-text';
      else if (['js','ts','py','java','c','cpp','html','css','json','xml'].indexOf(ext) !== -1) icon = 'code';
      return icon;
    }

    function isImageType(a) {
      return (a.type || '').toLowerCase() === 'image';
    }

    function renderGridItem(a) {
      if (isImageType(a)) {
        return '<div style="border-radius:12px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-hover); aspect-ratio:1; position:relative; cursor:pointer;" onclick="if(window.ImageViewer) window.ImageViewer.open({url:\'' + window.Sanitize.escapeHtml(a.url || '') + '\', name:\'' + window.Sanitize.escapeHtml(a.name || 'Image') + '\', size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'})">' +
          '<img src="' + window.Sanitize.escapeHtml(a.url || '') + '" style="width:100%; height:100%; object-fit:cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + window.Sanitize.escapeHtml(a.url || '') + '\')">' +
          '<div style="position:absolute; bottom:0; left:0; right:0; padding:8px; background:linear-gradient(transparent, rgba(0,0,0,0.8)); color:white; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + window.Sanitize.escapeHtml(a.chatName) + '</div>' +
        '</div>';
      }
      var fic = fileIconHtml(a.name);
      return '<div style="border-radius:12px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-hover); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:16px; cursor:default;">' +
        '<i data-lucide="' + fic + '" style="width:28px; height:28px; color:var(--text-muted);"></i>' +
        '<div style="font-size:11px; color:var(--text-secondary); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">' + window.Sanitize.escapeHtml(a.name || 'file') + '</div>' +
      '</div>';
    }

    function renderListItem(a) {
      var d = new Date(a.timestamp);
      var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      if (isImageType(a)) {
        return '<div style="display:flex; gap:16px; align-items:center; border-radius:12px; padding:12px; border:1px solid var(--border-subtle); background:var(--bg-surface); cursor:pointer;" onclick="if(window.ImageViewer) window.ImageViewer.open({url:\'' + window.Sanitize.escapeHtml(a.url || '') + '\', name:\'' + window.Sanitize.escapeHtml(a.name || 'Image') + '\', size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'})">' +
          '<div style="width:80px; height:80px; border-radius:8px; overflow:hidden; flex-shrink:0;">' +
            '<img src="' + window.Sanitize.escapeHtml(a.url || '') + '" style="width:100%; height:100%; object-fit:cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + window.Sanitize.escapeHtml(a.url || '') + '\')">' +
          '</div>' +
          '<div style="flex:1; overflow:hidden;">' +
            '<div style="font-weight:600; font-family:var(--font-display); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + window.Sanitize.escapeHtml(a.name || 'Image') + '</div>' +
            '<div style="color:var(--text-secondary); font-size:13px; margin-top:4px;">Shared in ' + window.Sanitize.escapeHtml(a.chatName) + '</div>' +
            '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">' + dateStr + '</div>' +
          '</div>' +
        '</div>';
      }
      var fic = fileIconHtml(a.name);
      return '<div style="display:flex; gap:16px; align-items:center; border-radius:12px; padding:12px; border:1px solid var(--border-subtle); background:var(--bg-surface);">' +
        '<div style="width:48px; height:48px; border-radius:8px; background:var(--bg-hover); display:flex; align-items:center; justify-content:center; flex-shrink:0;">' +
          '<i data-lucide="' + fic + '" style="width:24px; height:24px; color:var(--text-muted);"></i>' +
        '</div>' +
        '<div style="flex:1; overflow:hidden;">' +
          '<div style="font-weight:500; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + window.Sanitize.escapeHtml(a.name || 'file') + '</div>' +
          '<div style="color:var(--text-secondary); font-size:12px; margin-top:2px;">' + window.Sanitize.escapeHtml(a.chatName) + ' &middot; ' + dateStr + '</div>' +
        '</div>' +
      '</div>';
    }

    // Build content HTML
    var contentHtml = '';
    if (allAttachments.length === 0) {
      contentHtml = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">No media found matching your criteria.</div>';
    } else {
      if (this.displayMode === 'grid') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:16px; align-content:start;">';
        allAttachments.forEach(function(a) { contentHtml += renderGridItem(a); });
        contentHtml += '</div>';
      } else if (this.displayMode === 'compact') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:8px; align-content:start;">';
        allAttachments.forEach(function(a) { contentHtml += renderGridItem(a); });
        contentHtml += '</div>';
      } else if (this.displayMode === 'masonry') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); column-count: 3; column-gap: 16px;">';
        images.forEach(function(a) {
          contentHtml += '<div style="border-radius:12px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-hover); margin-bottom:16px; cursor:pointer; break-inside: avoid;" onclick="if(window.ImageViewer) window.ImageViewer.open({url:\'' + window.Sanitize.escapeHtml(a.url || '') + '\', name:\'' + window.Sanitize.escapeHtml(a.name || 'Image') + '\', size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'})">' +
            '<img src="' + window.Sanitize.escapeHtml(a.url || '') + '" style="width:100%; display:block;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + window.Sanitize.escapeHtml(a.url || '') + '\')">' +
          '</div>';
        });
        if (nonImages.length > 0) {
          contentHtml += '<div style="break-inside:avoid; margin-bottom:16px; padding:12px; background:var(--bg-hover); border-radius:12px; border:1px solid var(--border-subtle);"><div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">Files</div>';
          nonImages.forEach(function(a) {
            var fic = fileIconHtml(a.name);
            contentHtml += '<div style="display:flex; align-items:center; gap:8px; padding:4px 0;"><i data-lucide="' + fic + '" style="width:14px; height:14px; color:var(--text-muted); flex-shrink:0;"></i><span style="font-size:12px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + window.Sanitize.escapeHtml(a.name || 'file') + '</span></div>';
          });
          contentHtml += '</div>';
        }
        contentHtml += '</div>';
      } else if (this.displayMode === 'list') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); display:flex; flex-direction:column; gap:12px;">';
        allAttachments.forEach(function(a) { contentHtml += renderListItem(a); });
        contentHtml += '</div>';
      }
    }

    // Header + filter bar HTML
    var typeFilterHtml = '';
    if (filteredChats.length > 0) {
      typeFilterHtml = '<button class="gallery-type-filter" data-type="all" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-subtle); background:' + (this.mediaType === 'all' ? 'var(--accent-primary)' : 'transparent') + '; color:' + (this.mediaType === 'all' ? 'white' : 'var(--text-secondary)') + '; cursor:pointer; font-size:11px; white-space:nowrap;">All</button>' +
        '<button class="gallery-type-filter" data-type="images" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-subtle); background:' + (this.mediaType === 'images' ? 'var(--accent-primary)' : 'transparent') + '; color:' + (this.mediaType === 'images' ? 'white' : 'var(--text-secondary)') + '; cursor:pointer; font-size:11px; white-space:nowrap;">Images</button>' +
        '<button class="gallery-type-filter" data-type="files" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-subtle); background:' + (this.mediaType === 'files' ? 'var(--accent-primary)' : 'transparent') + '; color:' + (this.mediaType === 'files' ? 'white' : 'var(--text-secondary)') + '; cursor:pointer; font-size:11px; white-space:nowrap;">Files</button>';
    }

    var chatFilterHtml = '';
    chatFilterHtml += '<button class="gallery-filter-btn ' + (this.currentFilter === 'all' ? 'active' : '') + '" data-id="all" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-subtle); background:' + (this.currentFilter === 'all' ? 'var(--accent-primary)' : 'transparent') + '; color:' + (this.currentFilter === 'all' ? 'white' : 'var(--text-secondary)') + '; cursor:pointer; font-size:11px; white-space:nowrap;">' + (isTypeFilterActive ? (this.mediaType === 'images' ? 'All Images' : 'All Files') : 'All Chats') + '</button>';
    if (this.currentFilter === 'all') {
      filteredChats.forEach(function(chatId) {
        chatFilterHtml += '<button class="gallery-filter-btn" data-id="' + window.Sanitize.escapeHtml(chatId) + '" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-secondary); cursor:pointer; font-size:11px; white-space:nowrap;">' + window.Sanitize.escapeHtml(chatNameFor(chatId)) + '</button>';
      });
    } else {
      chatFilterHtml += '<button class="gallery-filter-btn active" data-id="' + window.Sanitize.escapeHtml(this.currentFilter) + '" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--accent-primary); color:white; cursor:pointer; font-size:11px; white-space:nowrap;">' + window.Sanitize.escapeHtml(chatNameFor(this.currentFilter)) + '</button>';
    }

    this.container.innerHTML =
      '<div style="height:64px; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; padding:0 var(--spacing-lg);">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<img src="icons/app/orbit.ico" style="width:24px; height:24px; object-fit:contain;">' +
          '<h2 style="font-family:var(--font-display); font-size:20px; font-weight:600; margin:0;">Global Gallery</h2>' +
          '<span style="font-size:12px; color:var(--text-muted);">' + allAttachments.length + ' items</span>' +
        '</div>' +
        '<div style="display:flex; align-items:center; gap:16px;">' +
          '<div style="position:relative; width: 240px;">' +
            '<i data-lucide="search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-muted);"></i>' +
            '<input type="text" id="gallery-search" value="' + window.Sanitize.escapeHtml(this.searchQuery) + '" placeholder="Search media..." style="width:100%; height:36px; border-radius:18px; border:1px solid var(--border-subtle); background:var(--bg-hover); padding:0 16px 0 36px; color:var(--text-primary); outline:none;">' +
          '</div>' +
          '<div style="display:flex; background:var(--bg-hover); border-radius:8px; padding:4px; border:1px solid var(--border-subtle);">' +
            '<button class="view-mode-btn ' + (this.displayMode === 'grid' ? 'active' : '') + '" data-mode="grid" title="Grid View" style="width:28px; height:28px; border-radius:6px; border:none; background:' + (this.displayMode === 'grid' ? 'var(--bg-surface)' : 'transparent') + '; color:' + (this.displayMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)') + '; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:' + (this.displayMode === 'grid' ? 'var(--shadow-sm)' : 'none') + ';"><i data-lucide="grid" style="width:16px; height:16px;"></i></button>' +
            '<button class="view-mode-btn ' + (this.displayMode === 'compact' ? 'active' : '') + '" data-mode="compact" title="Compact View" style="width:28px; height:28px; border-radius:6px; border:none; background:' + (this.displayMode === 'compact' ? 'var(--bg-surface)' : 'transparent') + '; color:' + (this.displayMode === 'compact' ? 'var(--text-primary)' : 'var(--text-muted)') + '; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:' + (this.displayMode === 'compact' ? 'var(--shadow-sm)' : 'none') + ';"><i data-lucide="layout-grid" style="width:16px; height:16px;"></i></button>' +
            '<button class="view-mode-btn ' + (this.displayMode === 'masonry' ? 'active' : '') + '" data-mode="masonry" title="Masonry View" style="width:28px; height:28px; border-radius:6px; border:none; background:' + (this.displayMode === 'masonry' ? 'var(--bg-surface)' : 'transparent') + '; color:' + (this.displayMode === 'masonry' ? 'var(--text-primary)' : 'var(--text-muted)') + '; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:' + (this.displayMode === 'masonry' ? 'var(--shadow-sm)' : 'none') + ';"><i data-lucide="columns" style="width:16px; height:16px;"></i></button>' +
            '<button class="view-mode-btn ' + (this.displayMode === 'list' ? 'active' : '') + '" data-mode="list" title="List View" style="width:28px; height:28px; border-radius:6px; border:none; background:' + (this.displayMode === 'list' ? 'var(--bg-surface)' : 'transparent') + '; color:' + (this.displayMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)') + '; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:' + (this.displayMode === 'list' ? 'var(--shadow-sm)' : 'none') + ';"><i data-lucide="list" style="width:16px; height:16px;"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex; gap:8px; padding:8px var(--spacing-lg); border-bottom:1px solid var(--border-subtle); overflow-x:auto; align-items:center;">' +
        typeFilterHtml +
        (typeFilterHtml ? '<span style="color:var(--border-subtle);">|</span>' : '') +
        chatFilterHtml +
      '</div>' +
      contentHtml;

    lucide.createIcons({ root: this.container });
    this.attachEvents();
  },

  attachEvents() {
    var self = this;
    var filterBtns = this.container.querySelectorAll('.gallery-filter-btn');
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        self.currentFilter = e.currentTarget.getAttribute('data-id');
        self.render(window.store.getState());
      });
    });

    var typeFilterBtns = this.container.querySelectorAll('.gallery-type-filter');
    typeFilterBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        self.mediaType = e.currentTarget.getAttribute('data-type');
        self.render(window.store.getState());
      });
    });

    var modeBtns = this.container.querySelectorAll('.view-mode-btn');
    modeBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var mode = e.currentTarget.getAttribute('data-mode');
        self.displayMode = mode;
        var state = window.store.getState();
        var newSettings = { ...(state.settings || {}), galleryViewMode: mode };
        window.store.setState({ settings: newSettings });
        if (window.orbitAPI) {
          window.orbitAPI.dbSetSetting('settings', newSettings);
        } else if (window.Storage) {
          window.Storage.set('settings', newSettings);
        }
        self.render(state);
      });
    });

    var searchInput = document.getElementById('gallery-search');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        self.searchQuery = e.target.value;
        self.render(window.store.getState());
        var newSearchInput = document.getElementById('gallery-search');
        if (newSearchInput) {
          newSearchInput.focus();
          var val = newSearchInput.value;
          newSearchInput.value = '';
          newSearchInput.value = val;
        }
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.GlobalGallery.init();
});
