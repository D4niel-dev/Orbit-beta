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

    messages.forEach(msg => {
      if (msg.attachments) {
        msg.attachments.forEach(att => {
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
    // Reverse to show newest first
    images.slice().reverse().forEach(img => {
      // Create a grid item for each image
      html += '<div style="border-radius: 8px; overflow: hidden; height: 120px; border: 1px solid var(--border-subtle); background: var(--bg-hover); cursor: pointer;" title="' + window.Sanitize.escapeHtml(img.name) + '">' +
                '<img src="' + window.Sanitize.escapeHtml(img.url) + '" style="width: 100%; height: 100%; object-fit: cover;" onclick="window.open(\'' + window.Sanitize.escapeHtml(img.url) + '\', \'_blank\')">' +
              '</div>';
    });

    this.contentArea.innerHTML = html;
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
