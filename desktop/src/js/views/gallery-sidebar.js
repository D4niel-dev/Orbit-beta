// src/js/views/gallery-sidebar.js

window.GallerySidebar = {
  isOpen: false,
  currentTab: 'images',

  init() {
    this.container = document.getElementById('panel-gallery');
    this.contentArea = document.getElementById('gallery-content');
    this.btnClose = document.getElementById('btn-close-gallery');

    if (!this.container) return;

    this.attachEvents();

    var self = this;
    this.unsubscribe = window.store.subscribe((state) => {
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

    // Tabs
    if (this.container) {
      this.container.querySelectorAll('.gallery-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          self.container.querySelectorAll('.gallery-tab').forEach(function(t) {
            t.classList.remove('active');
            t.style.fontWeight = '500';
            t.style.color = 'var(--text-secondary)';
            t.style.borderBottomColor = 'transparent';
          });
          tab.classList.add('active');
          tab.style.fontWeight = '600';
          tab.style.color = 'var(--text-primary)';
          tab.style.borderBottomColor = 'var(--accent-primary)';
          self.currentTab = tab.getAttribute('data-tab');
          self.render(window.store.getState());
        });
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && self.isOpen) {
        self.close();
      }
    });

    // File download handler
    if (this.container) {
      this.container.addEventListener('click', function(e) {
        var downloadBtn = e.target.closest('.gallery-file-download');
        if (downloadBtn) {
          var url = downloadBtn.getAttribute('data-url');
          var name = downloadBtn.getAttribute('data-name');
          if (url && window.orbitAPI && window.orbitAPI.downloadFile) {
            window.orbitAPI.downloadFile(url, name || 'file');
          } else if (url) {
            var a = document.createElement('a');
            a.href = url;
            a.download = name || 'file';
            a.click();
          }
        }
      });
    }
  },

  getDayCategory(ts) {
    var d = new Date(ts);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterday = today - 86400000;
    var itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    
    if (itemDay === today) return "Today";
    if (itemDay === yesterday) return "Yesterday";
    
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return monthNames[d.getMonth()] + " " + d.getFullYear();
  },

  getSenderName(senderId, state) {
    if (senderId === state.currentUser.userId) return "You";
    var friend = state.friends.find(f => f.userId === senderId);
    if (friend) return friend.username;
    var group = state.groups.find(g => g.groupId === state.activeChatId);
    if (group && group.members) {
      var m = group.members.find(x => x.userId === senderId);
      if (m) return m.username;
    }
    return "Unknown";
  },

  render(state) {
    if (!state.activeChatId) {
      this.contentArea.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:40px;">Select a chat to view shared media.</div>';
      return;
    }

    const messages = state.messages[state.activeChatId] || [];
    let items = [];

    // Gather data based on tab
    messages.forEach(msg => {
      var ts = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
      var senderName = this.getSenderName(msg.sender, state);

      if (this.currentTab === 'images' || this.currentTab === 'files') {
        if (msg.attachments) {
          msg.attachments.forEach(att => {
            if ((this.currentTab === 'images' && att.type === 'image') || 
                (this.currentTab === 'files' && att.type !== 'image')) {
              items.push({
                ...att,
                msgId: msg.id,
                ts: ts,
                senderName: senderName
              });
            }
          });
        }
      } else if (this.currentTab === 'links') {
        if (msg.text) {
          var urlRegex = /(https?:\/\/[^\s]+)/g;
          var matches = msg.text.match(urlRegex);
          if (matches) {
            matches.forEach(url => {
              var domain = '';
              try { domain = new URL(url).hostname; } catch(e) { domain = url; }
              items.push({
                url: url,
                domain: domain,
                msgId: msg.id,
                ts: ts,
                senderName: senderName
              });
            });
          }
        }
      }
    });

    if (items.length === 0) {
      var emptyTxt = this.currentTab === 'images' ? 'No images shared yet.' : (this.currentTab === 'files' ? 'No files shared yet.' : 'No links shared yet.');
      var emptyIcon = this.currentTab === 'images' ? 'image' : (this.currentTab === 'files' ? 'file' : 'link-2');
      this.contentArea.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:12px;opacity:0.6;"><i data-lucide="' + emptyIcon + '" style="width:48px;height:48px;"></i><div style="font-size:14px;">' + emptyTxt + '</div></div>';
      if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
      return;
    }

    // Sort descending
    items.sort((a, b) => b.ts - a.ts);

    // Group by date
    var groups = {};
    items.forEach(item => {
      var category = this.getDayCategory(item.ts);
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });

    let html = '';

    Object.keys(groups).forEach(category => {
      var groupItems = groups[category];
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px;position:sticky;top:-16px;background:var(--bg-surface);padding:8px 0;z-index:2;">' + category + '</div>';
      
      if (this.currentTab === 'images') {
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        groupItems.forEach(img => {
          const safeUrl = window.Sanitize.escapeHtml(img.url);
          var thumbUrl = safeUrl;
          if (thumbUrl.indexOf('orbit-file://') !== 0) {
            thumbUrl = thumbUrl.replace('orbit-db://attachment/', 'orbit-db://thumbnail/');
          }
          const safeName = window.Sanitize.escapeHtml(String(img.name || 'Image'));
          const safeSize = window.Sanitize.escapeHtml(String(img.size || 0));
          const safeSender = window.Sanitize.escapeHtml(img.senderName);

          html += '<div class="gallery-item group" style="position:relative;border-radius:12px;overflow:hidden;aspect-ratio:1/1;cursor:pointer;border:1px solid var(--border-subtle);" onclick="if(window.ImageViewer) window.ImageViewer.open({url:\'' + safeUrl + '\', name:\'' + safeName + '\', size:\'' + safeSize + '\'})">' +
            '<img src="' + thumbUrl + '" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s;" onerror="this.src=\'' + safeUrl + '\'; if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')">' +
            '<div class="gallery-hover-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;justify-content:space-between;padding:8px;opacity:0;transition:opacity 0.2s;">' +
              '<div style="align-self:flex-end;"><button style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;"><i data-lucide="zoom-in" style="width:14px;height:14px;"></i></button></div>' +
              '<div style="font-size:11px;color:white;font-weight:500;">Sent by ' + safeSender + '</div>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      } else if (this.currentTab === 'files') {
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        groupItems.forEach(file => {
          const safeUrl = window.Sanitize.escapeHtml(file.url);
          const safeName = window.Sanitize.escapeHtml(String(file.name || 'File'));
          const safeSender = window.Sanitize.escapeHtml(file.senderName);
          const ext = safeName.split('.').pop().toLowerCase();
          var icon = 'file';
          if (['mp3', 'wav', 'ogg', 'webm', 'flac', 'aac', 'm4a', 'wma'].indexOf(ext) !== -1) icon = 'music';
          if (['mp4', 'mov', 'avi', 'mkv', 'wmv'].indexOf(ext) !== -1) icon = 'video';
          if (['pdf', 'doc', 'docx', 'txt', 'rtf'].indexOf(ext) !== -1) icon = 'file-text';
          if (['zip', 'rar', '7z', 'gz', 'tar'].indexOf(ext) !== -1) icon = 'archive';
          if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json', 'xml', 'sh'].indexOf(ext) !== -1) icon = 'code';

          html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor=\'var(--accent-primary)\';" onmouseleave="this.style.borderColor=\'var(--border-subtle)\';">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;"><i data-lucide="' + icon + '"></i></div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">' + safeName + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);">' + safeSender + ' &middot; ' + window.Format.fileSize(file.size || 0) + '</div>' +
            '</div>' +
            '<button class="gallery-file-download" data-url="' + safeUrl + '" data-name="' + safeName + '" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;"><i data-lucide="download" style="width:16px;height:16px;"></i></button>' +
          '</div>';
        });
        html += '</div>';
      } else if (this.currentTab === 'links') {
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        groupItems.forEach(link => {
          const safeUrl = window.Sanitize.escapeHtml(link.url);
          const safeDomain = window.Sanitize.escapeHtml(link.domain);
          const safeSender = window.Sanitize.escapeHtml(link.senderName);
          html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor=\'var(--accent-primary)\';" onmouseleave="this.style.borderColor=\'var(--border-subtle)\';" onclick="window.open(\'' + safeUrl + '\', \'_blank\')">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:var(--accent-primary);flex-shrink:0;"><i data-lucide="link"></i></div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">' + safeDomain + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeUrl + '</div>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);flex-shrink:0;">' + safeSender + '</div>' +
          '</div>';
        });
        html += '</div>';
      }
      
      html += '</div>';
    });

    this.contentArea.innerHTML = html;
    
    // Inject hover css via JS for .gallery-item.group since inline hover on complex elements is tricky
    this.contentArea.querySelectorAll('.gallery-item.group').forEach(el => {
      el.addEventListener('mouseenter', () => {
        el.querySelector('img').style.transform = 'scale(1.05)';
        el.querySelector('.gallery-hover-overlay').style.opacity = '1';
      });
      el.addEventListener('mouseleave', () => {
        el.querySelector('img').style.transform = 'scale(1)';
        el.querySelector('.gallery-hover-overlay').style.opacity = '0';
      });
    });

    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
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
