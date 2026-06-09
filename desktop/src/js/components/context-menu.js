// src/js/components/context-menu.js

window.ContextMenu = {
  init() {
    this.container = document.createElement('div');
    this.container.id = 'context-menu-container';
    this.container.style.cssText = 'display:none;position:fixed;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;box-shadow:var(--shadow-xl);padding:8px 0;min-width:180px;z-index:10000;flex-direction:column;';
    document.body.appendChild(this.container);

    var self = this;
    document.addEventListener('click', function(e) {
      if (self.container.style.display !== 'none') {
        self.close();
      }
    });
    
    // Prevent hiding if clicking inside (handled by click listeners mostly)
    this.container.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  },

  show(x, y, items) {
    if (!this.container) return;
    var self = this;

    this.container.innerHTML = '';
    items.forEach(function(item, idx) {
      if (item === 'separator') {
        var sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--border-subtle);margin:4px 0;';
        self.container.appendChild(sep);
      } else {
        var color = item.color || 'var(--text-primary)';
        var btn = document.createElement('button');
        btn.className = 'context-item';
        btn.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 16px;width:100%;text-align:left;background:transparent;border:none;color:' + color + ';font-size:14px;cursor:pointer;';
        if (item.icon) {
          var icon = document.createElement('i');
          icon.setAttribute('data-lucide', item.icon);
          icon.style.cssText = 'width:16px;';
          btn.appendChild(icon);
        }
        btn.appendChild(document.createTextNode(item.label));
        btn.addEventListener('mouseover', function() { btn.style.background = 'var(--bg-hover)'; });
        btn.addEventListener('mouseout', function() { btn.style.background = 'transparent'; });
        btn.addEventListener('click', function() {
          if (item.onClick) item.onClick();
          self.close();
        });
        self.container.appendChild(btn);
      }
    });

    lucide.createIcons({ root: this.container });

    // Ensure it doesn't go off screen
    this.container.style.display = 'flex';
    var rect = this.container.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;

    this.container.style.left = x + 'px';
    this.container.style.top = y + 'px';
  },

  close() {
    if (this.container) this.container.style.display = 'none';
  }
};
