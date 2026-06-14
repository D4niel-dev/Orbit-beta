// src/js/components/image-viewer.js

window.ImageViewer = {
  currentImg: null,
  zoomLevel: 1,
  galleryImages: [],
  currentIndex: 0,

  init() {
    this.container = document.getElementById('image-viewer-modal');
    if (!this.container) return;

    this.container.style.cssText = `
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 9999;
      flex-direction: column;
    `;

    this.render();
    this.attachEvents();
  },

  render() {
    this.container.innerHTML = `
      <div style="height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--spacing-lg); background: linear-gradient(rgba(0,0,0,0.8), transparent); color: white;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="icons/app/orbit.ico" style="width: 24px; height: 24px; object-fit: contain;">
          <div style="font-family: var(--font-display); font-weight: 600;" id="iv-title">Image Preview</div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <button id="iv-btn-zoom-out" style="background:transparent; border:none; color:white; cursor:pointer;" title="Zoom Out"><i data-lucide="zoom-out"></i></button>
          <button id="iv-btn-zoom-in" style="background:transparent; border:none; color:white; cursor:pointer;" title="Zoom In"><i data-lucide="zoom-in"></i></button>
          <button id="iv-btn-download" style="background:transparent; border:none; color:white; cursor:pointer;" title="Download"><i data-lucide="download"></i></button>
          <button id="iv-btn-forward" style="background:transparent; border:none; color:white; cursor:pointer;" title="Resend to Active Chat"><i data-lucide="forward"></i></button>
          <button id="iv-btn-close" style="background:transparent; border:none; color:white; cursor:pointer; margin-left: 16px;" title="Close"><i data-lucide="x"></i></button>
        </div>
      </div>
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;" id="iv-canvas-area">
        <button id="iv-btn-prev" style="position:absolute; left: 20px; top: 50%; transform: translateY(-50%); background:rgba(0,0,0,0.5); border:none; border-radius:50%; color:white; width:48px; height:48px; display:none; align-items:center; justify-content:center; cursor:pointer; z-index: 10;"><i data-lucide="chevron-left"></i></button>
        <img id="iv-image" src="" style="max-width: 90%; max-height: 90%; object-fit: contain; transition: transform 0.2s ease;">
        <button id="iv-btn-next" style="position:absolute; right: 20px; top: 50%; transform: translateY(-50%); background:rgba(0,0,0,0.5); border:none; border-radius:50%; color:white; width:48px; height:48px; display:none; align-items:center; justify-content:center; cursor:pointer; z-index: 10;"><i data-lucide="chevron-right"></i></button>
      </div>
    `;
    lucide.createIcons({ root: this.container });
  },

  attachEvents() {
    var self = this;
    
    document.getElementById('iv-btn-close').addEventListener('click', () => self.close());
    
    document.getElementById('iv-btn-zoom-in').addEventListener('click', () => {
      self.zoomLevel += 0.25;
      self.updateZoom();
    });
    
    document.getElementById('iv-btn-zoom-out').addEventListener('click', () => {
      self.zoomLevel = Math.max(0.25, self.zoomLevel - 0.25);
      self.updateZoom();
    });

    document.getElementById('iv-btn-download').addEventListener('click', () => {
      if (!self.currentImg) return;
      const a = document.createElement('a');
      a.href = self.currentImg.url;
      a.download = self.currentImg.name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    document.getElementById('iv-btn-forward').addEventListener('click', () => {
      if (!self.currentImg) return;
      // Resend to active chat
      const state = window.store.getState();
      if (!state.activeChatId) {
        if (window.Toast) window.Toast.show("Error", "No active chat selected.");
        return;
      }
      
      // Extract attachment ID from URL or generate new one
      var attId = self.currentImg.id || null;
      if (!attId) {
        var urlMatch = self.currentImg.url.match(/orbit-db:\/\/attachment\/(.+)/);
        attId = urlMatch ? urlMatch[1] : String(Date.now());
      }
      var attPath = self.currentImg.path || null;

      const newMsg = {
        id: Date.now(),
        sender: state.currentUser.userId,
        text: '',
        timestamp: new Date().toISOString(),
        attachments: [
          {
            id: attId,
            type: 'image',
            name: self.currentImg.name,
            url: self.currentImg.url,
            size: self.currentImg.size,
            path: attPath
          }
        ]
      };
      
      window.store.addMessage(state.activeChatId, newMsg);
      if (window.Toast) window.Toast.show("Success", "Image forwarded to chat.");
      self.close();
      
      // Navigate to DMS if in gallery
      if (state.activeTab !== 'dms') {
        window.store.setState({ activeTab: 'dms' });
      }
    });

    document.getElementById('iv-btn-prev').addEventListener('click', () => {
      if (self.galleryImages.length > 1) {
        self.currentIndex = (self.currentIndex - 1 + self.galleryImages.length) % self.galleryImages.length;
        self.showImage(self.galleryImages[self.currentIndex]);
      }
    });

    document.getElementById('iv-btn-next').addEventListener('click', () => {
      if (self.galleryImages.length > 1) {
        self.currentIndex = (self.currentIndex + 1) % self.galleryImages.length;
        self.showImage(self.galleryImages[self.currentIndex]);
      }
    });
  },

  updateZoom() {
    const imgEl = document.getElementById('iv-image');
    if (imgEl) {
      imgEl.style.transform = `scale(${this.zoomLevel})`;
    }
  },

  open(imgObj) {
    if (!this.container) return;
    this.galleryImages = [imgObj];
    this.currentIndex = 0;
    this.showImage(imgObj);
    this.container.style.display = 'flex';
  },

  openFromMessage(msgId, attId) {
    if (!this.container) return;
    var state = window.store.getState();
    var msgList = state.messages[state.activeChatId] || [];
    var msg = msgList.find(function(m) { return String(m.id) === String(msgId); });
    
    if (msg && msg.attachments) {
      // Filter only images for the gallery
      this.galleryImages = msg.attachments.filter(function(a) { return a.type === 'image'; });
      if (this.galleryImages.length === 0) return;
      
      var index = this.galleryImages.findIndex(function(a) { return String(a.id) === String(attId); });
      this.currentIndex = index !== -1 ? index : 0;
      
      this.showImage(this.galleryImages[this.currentIndex]);
      this.container.style.display = 'flex';
    }
  },

  showImage(imgObj) {
    this.currentImg = imgObj;
    this.zoomLevel = 1;
    
    var ivImg = document.getElementById('iv-image');
    ivImg.src = imgObj.url;
    if (window.freezeGifImages && imgObj.url && (imgObj.url.indexOf('.gif') > -1 || imgObj.url.indexOf('image/gif') > -1)) {
      ivImg.onload = function() {
        if (window.store && window.store.getState && window.store.getState().settings && window.store.getState().settings.reduceMotion) {
          var c = document.createElement('canvas');
          c.width = ivImg.naturalWidth;
          c.height = ivImg.naturalHeight;
          c.getContext('2d').drawImage(ivImg, 0, 0);
          ivImg.src = c.toDataURL('image/png');
        }
      };
    }
    var titleText = imgObj.name || 'Image Preview';
    if (this.galleryImages.length > 1) {
      titleText += ' (' + (this.currentIndex + 1) + '/' + this.galleryImages.length + ')';
    }
    document.getElementById('iv-title').innerText = titleText;
    
    document.getElementById('iv-btn-prev').style.display = this.galleryImages.length > 1 ? 'flex' : 'none';
    document.getElementById('iv-btn-next').style.display = this.galleryImages.length > 1 ? 'flex' : 'none';
    
    this.updateZoom();
  },

  close() {
    if (!this.container) return;
    this.container.style.display = 'none';
    this.currentImg = null;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.ImageViewer.init();
});
