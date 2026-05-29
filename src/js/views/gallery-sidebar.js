// src/js/views/gallery-sidebar.js

window.GallerySidebar = {
  isOpen: false,

  init() {
    this.container = document.getElementById('panel-gallery');
    this.contentArea = document.getElementById('gallery-content');
    this.btnClose = document.getElementById('btn-close-gallery');

    if (!this.container) return;

    this.attachEvents();

    var self = this;
    this.unsubscribe = window.store.subscribe((state) => {
      // Re-render if open and messages changed or chat changed
      if (self.isOpen) {
        self.render(state);
      }
    });
  },

  attachEvents() {
    var self = this;
    if (this.btnClose) {
      this.btnClose.addEventListener('click', function() {
        self.close();
      });
    }

    // Optional: close gallery if user hits Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && self.isOpen) {
        self.close();
      }
    });
  },

  render(state) {
    if (!state.activeChatId) {
      this.contentArea.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px; grid-column:span 2;">Select a chat to view images.</div>';
      return;
    }

    const messages = state.messages[state.activeChatId] || [];
    const images = [];
    const allAttIds = [];

    messages.forEach(msg => {
      if (msg.attachments) {
        msg.attachments.forEach(att => {
          allAttIds.push({ attId: att.id, msgId: msg.id });
          if (att.type === 'image') {
            images.push(att);
          }
        });
      }
    });

    if (images.length === 0) {
      this.contentArea.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px; grid-column:span 2;">No images shared yet.</div>';
      return;
    }

    let html = '';
    
    // Add "Delete Gallery Images/Files" button if there are attachments
    if (allAttIds.length > 0) {
      html += '<div style="grid-column:span 2; margin-bottom: 8px;">' +
        '<button id="btn-gallery-delete-all" style="width:100%; padding: 8px; background:var(--accent-danger); color:white; border:none; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">' +
        '<i data-lucide="trash-2" style="width:12px;height:12px;margin-right:4px;"></i> Delete Gallery Media</button>' +
      '</div>';
    }

    images.forEach(img => {
      const safeUrl = window.Sanitize.escapeHtml(img.url);
      const thumbUrl = safeUrl.replace('orbit-file://', 'orbit-db://thumbnail/').replace('orbit-db://attachment/', 'orbit-db://thumbnail/');
      const safeName = window.Sanitize.escapeHtml(String(img.name || 'Image'));
      const safeSize = window.Sanitize.escapeHtml(String(img.size || 0));

      html += '<div class="gallery-item" style="border-radius: 8px; overflow: hidden; height: 100px; cursor: pointer; border: 1px solid var(--border-subtle);" onclick="if(window.ImageViewer) window.ImageViewer.open({url:\'' + safeUrl + '\', name:\'' + safeName + '\', size:\'' + safeSize + '\'})">' +
        '<img src="' + thumbUrl + '" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s;" onerror="this.src=\'' + safeUrl + '\'; if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')">' +
      '</div>';
    });

    this.contentArea.innerHTML = html;
    lucide.createIcons({ root: this.contentArea });
    
    const btnDeleteAll = document.getElementById('btn-gallery-delete-all');
    if (btnDeleteAll) {
      btnDeleteAll.addEventListener('click', () => {
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Delete Gallery Media',
            message: 'WARNING! Are you sure you want to delete all of the images/files? This action cannot be undone.',
            confirmText: 'Delete All',
            danger: true,
            onConfirm: () => {
              if (window.orbitAPI) {
                allAttIds.forEach(att => {
                   window.orbitAPI.dbDeleteAttachment(att.attId);
                });
                // Update local state by removing attachments
                const msgs = { ...state.messages };
                const chatMsgs = msgs[state.activeChatId] || [];
                chatMsgs.forEach(m => {
                  if (m.attachments) {
                     m.attachments = m.attachments.filter(a => !allAttIds.find(x => x.attId === a.id));
                  }
                });
                window.store.setState({ messages: msgs });
              }
            }
          });
        }
      });
    }
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },

  open() {
    if (!this.container) return;
    var state = window.store.getState();
    this.render(state);
    this.container.style.display = 'flex';
    this.isOpen = true;
  },

  close() {
    if (!this.container) return;
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.GallerySidebar.init();
});
