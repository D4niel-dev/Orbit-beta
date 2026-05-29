// src/js/views/global-gallery.js

window.GlobalGallery = {
  init() {
    this.container = document.getElementById('global-gallery-container');
    if (!this.container) return;
    
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.displayMode = 'grid'; // grid, list, masonry, compact

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

    // Collect all images
    let allImages = [];
    const messages = state.messages || {};
    const friends = state.friends || [];

    Object.keys(messages).forEach(chatId => {
      const chatMsgs = messages[chatId];
      const friend = friends.find(f => f.userId === chatId) || { username: 'Unknown Group/User' };
      
      chatMsgs.forEach(msg => {
        if (msg.attachments) {
          msg.attachments.forEach(att => {
            if (att.type === 'image') {
              allImages.push({
                ...att,
                chatId: chatId,
                chatName: friend.username,
                timestamp: msg.timestamp
              });
            }
          });
        }
      });
    });

    // Apply Chat Filter
    if (this.currentFilter !== 'all') {
      allImages = allImages.filter(img => img.chatId === this.currentFilter);
    }

    // Apply Search Filter
    if (this.searchQuery.trim() !== '') {
      const query = this.searchQuery.toLowerCase();
      allImages = allImages.filter(img => 
        (img.name && img.name.toLowerCase().includes(query)) ||
        (img.chatName && img.chatName.toLowerCase().includes(query))
      );
    }

    // Sort newest first
    allImages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Render Filters
    let filterHtml = '<div style="display:flex; gap:8px; padding:var(--spacing-md) var(--spacing-lg); border-bottom:1px solid var(--border-subtle); overflow-x:auto;">';
    filterHtml += `<button class="gallery-filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-id="all" style="padding:6px 12px; border-radius:16px; border:1px solid var(--border-subtle); background:${this.currentFilter === 'all' ? 'var(--accent-primary)' : 'transparent'}; color:${this.currentFilter === 'all' ? 'white' : 'var(--text-secondary)'}; cursor:pointer; white-space:nowrap;">All Media</button>`;
    
    const chatsWithImages = [...new Set(allImages.map(img => img.chatId))];
    if (this.currentFilter === 'all') {
      chatsWithImages.forEach(chatId => {
        const friend = friends.find(f => f.userId === chatId) || { username: 'Unknown' };
        filterHtml += `<button class="gallery-filter-btn" data-id="${window.Sanitize.escapeHtml(chatId)}" style="padding:6px 12px; border-radius:16px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-secondary); cursor:pointer; white-space:nowrap;">${window.Sanitize.escapeHtml(friend.username)}</button>`;
      });
    } else {
        const friend = friends.find(f => f.userId === this.currentFilter) || { username: 'Unknown' };
        filterHtml += `<button class="gallery-filter-btn active" data-id="${window.Sanitize.escapeHtml(this.currentFilter)}" style="padding:6px 12px; border-radius:16px; border:1px solid var(--border-subtle); background:var(--accent-primary); color:white; cursor:pointer; white-space:nowrap;">${window.Sanitize.escapeHtml(friend.username)}</button>`;
    }
    filterHtml += '</div>';

    // Build Content Area HTML based on displayMode
    let contentHtml = '';
    
    if (allImages.length === 0) {
      contentHtml = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">No media found matching your criteria.</div>';
    } else {
      if (this.displayMode === 'grid') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:16px; align-content:start;">';
        allImages.forEach(img => {
          contentHtml += `
            <div style="border-radius:12px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-hover); aspect-ratio:1; position:relative; cursor:pointer;" onclick="if(window.ImageViewer) window.ImageViewer.open({url:'${window.Sanitize.escapeHtml(img.url)}', name:'${window.Sanitize.escapeHtml(img.name || 'Image')}', size:'${window.Sanitize.escapeHtml(String(img.size || 0))}'})">
              <img src="${window.Sanitize.escapeHtml(img.url)}" style="width:100%; height:100%; object-fit:cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, '${window.Sanitize.escapeHtml(img.url)}')">
              <div style="position:absolute; bottom:0; left:0; right:0; padding:8px; background:linear-gradient(transparent, rgba(0,0,0,0.8)); color:white; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                 ${window.Sanitize.escapeHtml(img.chatName)}
              </div>
            </div>`;
        });
        contentHtml += '</div>';
      } else if (this.displayMode === 'compact') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:8px; align-content:start;">';
        allImages.forEach(img => {
          contentHtml += `
            <div style="border-radius:8px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-hover); aspect-ratio:1; cursor:pointer;" onclick="if(window.ImageViewer) window.ImageViewer.open({url:'${window.Sanitize.escapeHtml(img.url)}', name:'${window.Sanitize.escapeHtml(img.name || 'Image')}', size:'${window.Sanitize.escapeHtml(String(img.size || 0))}'})">
              <img src="${window.Sanitize.escapeHtml(img.url)}" style="width:100%; height:100%; object-fit:cover;" title="${window.Sanitize.escapeHtml(img.name || 'Image')}" onerror="if(window.handleMediaError) window.handleMediaError(this, '${window.Sanitize.escapeHtml(img.url)}')">
            </div>`;
        });
        contentHtml += '</div>';
      } else if (this.displayMode === 'masonry') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); column-count: 3; column-gap: 16px;">';
        allImages.forEach(img => {
          contentHtml += `
            <div style="border-radius:12px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-hover); margin-bottom:16px; cursor:pointer; break-inside: avoid;" onclick="if(window.ImageViewer) window.ImageViewer.open({url:'${window.Sanitize.escapeHtml(img.url)}', name:'${window.Sanitize.escapeHtml(img.name || 'Image')}', size:'${window.Sanitize.escapeHtml(String(img.size || 0))}'})">
              <img src="${window.Sanitize.escapeHtml(img.url)}" style="width:100%; display:block;" onerror="if(window.handleMediaError) window.handleMediaError(this, '${window.Sanitize.escapeHtml(img.url)}')">
            </div>`;
        });
        contentHtml += '</div>';
      } else if (this.displayMode === 'list') {
        contentHtml = '<div style="flex:1; overflow-y:auto; padding:var(--spacing-lg); display:flex; flex-direction:column; gap:12px;">';
        allImages.forEach(img => {
          const d = new Date(img.timestamp);
          const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          contentHtml += `
            <div style="display:flex; gap:16px; align-items:center; border-radius:12px; padding:12px; border:1px solid var(--border-subtle); background:var(--bg-surface); cursor:pointer;" onclick="if(window.ImageViewer) window.ImageViewer.open({url:'${window.Sanitize.escapeHtml(img.url)}', name:'${window.Sanitize.escapeHtml(img.name || 'Image')}', size:'${window.Sanitize.escapeHtml(String(img.size || 0))}'})">
              <div style="width:80px; height:80px; border-radius:8px; overflow:hidden; flex-shrink:0;">
                <img src="${window.Sanitize.escapeHtml(img.url)}" style="width:100%; height:100%; object-fit:cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, '${window.Sanitize.escapeHtml(img.url)}')">
              </div>
              <div style="flex:1; overflow:hidden;">
                <div style="font-weight:600; font-family:var(--font-display); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.Sanitize.escapeHtml(img.name || 'Image')}</div>
                <div style="color:var(--text-secondary); font-size:13px; margin-top:4px;">Shared in ${window.Sanitize.escapeHtml(img.chatName)}</div>
                <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">${dateStr}</div>
              </div>
            </div>`;
        });
        contentHtml += '</div>';
      }
    }

    this.container.innerHTML = `
      <div style="height:64px; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; padding:0 var(--spacing-lg);">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="icons/app/orbit.ico" style="width:24px; height:24px; object-fit:contain;">
          <h2 style="font-family:var(--font-display); font-size:20px; font-weight:600; margin:0;">Global Gallery</h2>
        </div>
        
        <div style="display:flex; align-items:center; gap:16px;">
          <!-- Search Bar -->
          <div style="position:relative; width: 240px;">
             <i data-lucide="search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-muted);"></i>
             <input type="text" id="gallery-search" value="${window.Sanitize.escapeHtml(this.searchQuery)}" placeholder="Search media..." style="width:100%; height:36px; border-radius:18px; border:1px solid var(--border-subtle); background:var(--bg-hover); padding:0 16px 0 36px; color:var(--text-primary); outline:none;">
          </div>
          <!-- View Modes -->
          <div style="display:flex; background:var(--bg-hover); border-radius:8px; padding:4px; border:1px solid var(--border-subtle);">
            <button class="view-mode-btn ${this.displayMode === 'grid' ? 'active' : ''}" data-mode="grid" title="Grid View" style="width:28px; height:28px; border-radius:6px; border:none; background:${this.displayMode === 'grid' ? 'var(--bg-surface)' : 'transparent'}; color:${this.displayMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)'}; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:${this.displayMode === 'grid' ? 'var(--shadow-sm)' : 'none'};"><i data-lucide="grid" style="width:16px; height:16px;"></i></button>
            <button class="view-mode-btn ${this.displayMode === 'compact' ? 'active' : ''}" data-mode="compact" title="Compact View" style="width:28px; height:28px; border-radius:6px; border:none; background:${this.displayMode === 'compact' ? 'var(--bg-surface)' : 'transparent'}; color:${this.displayMode === 'compact' ? 'var(--text-primary)' : 'var(--text-muted)'}; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:${this.displayMode === 'compact' ? 'var(--shadow-sm)' : 'none'};"><i data-lucide="layout-grid" style="width:16px; height:16px;"></i></button>
            <button class="view-mode-btn ${this.displayMode === 'masonry' ? 'active' : ''}" data-mode="masonry" title="Masonry View" style="width:28px; height:28px; border-radius:6px; border:none; background:${this.displayMode === 'masonry' ? 'var(--bg-surface)' : 'transparent'}; color:${this.displayMode === 'masonry' ? 'var(--text-primary)' : 'var(--text-muted)'}; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:${this.displayMode === 'masonry' ? 'var(--shadow-sm)' : 'none'};"><i data-lucide="columns" style="width:16px; height:16px;"></i></button>
            <button class="view-mode-btn ${this.displayMode === 'list' ? 'active' : ''}" data-mode="list" title="List View" style="width:28px; height:28px; border-radius:6px; border:none; background:${this.displayMode === 'list' ? 'var(--bg-surface)' : 'transparent'}; color:${this.displayMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)'}; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:${this.displayMode === 'list' ? 'var(--shadow-sm)' : 'none'};"><i data-lucide="list" style="width:16px; height:16px;"></i></button>
          </div>
        </div>
      </div>
      ${filterHtml}
      ${contentHtml}
    `;

    lucide.createIcons({ root: this.container });
    this.attachEvents();
  },

  attachEvents() {
    var self = this;
    const filterBtns = this.container.querySelectorAll('.gallery-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        self.currentFilter = e.currentTarget.getAttribute('data-id');
        self.render(window.store.getState());
      });
    });

    const modeBtns = this.container.querySelectorAll('.view-mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        self.displayMode = e.currentTarget.getAttribute('data-mode');
        self.render(window.store.getState());
      });
    });

    const searchInput = document.getElementById('gallery-search');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        self.searchQuery = e.target.value;
        // Debounce rendering slightly or just re-render directly
        self.render(window.store.getState());
        
        // Restore focus to input after render
        const newSearchInput = document.getElementById('gallery-search');
        if (newSearchInput) {
          newSearchInput.focus();
          // Move cursor to end
          const val = newSearchInput.value;
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
