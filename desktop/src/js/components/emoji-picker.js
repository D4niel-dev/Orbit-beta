// src/js/components/emoji-picker.js

window.EmojiPicker = {
  isOpen: false,
  targetInput: null,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'emoji-picker-container';
    this.container.style.display = 'none';
    this.container.style.position = 'absolute';
    this.container.style.bottom = '80px';
    this.container.style.right = '40px';
    this.container.style.zIndex = '1000';
    this.container.style.boxShadow = 'var(--shadow-xl)';
    this.container.style.borderRadius = '8px';
    this.container.style.overflow = 'hidden';
    
    // Create the emoji picker web component
    const picker = document.createElement('emoji-picker');
    this.container.appendChild(picker);

    document.body.appendChild(this.container);
    this.attachEvents(picker);
  },

  attachEvents(picker) {
    picker.addEventListener('emoji-click', (e) => {
      if (this.targetInput) {
        this.targetInput.value += e.detail.unicode;
        this.targetInput.focus();
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.container.contains(e.target) && !e.target.closest('#btn-emoji')) {
        this.close();
      }
    });
  },

  toggle(targetInput) {
    this.targetInput = targetInput;
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
      // Sync theme
      const theme = document.documentElement.getAttribute('data-theme') || 'dark';
      this.container.querySelector('emoji-picker').classList.remove('light', 'dark');
      this.container.querySelector('emoji-picker').classList.add(theme);
    }
  },

  open() {
    this.container.style.display = 'block';
    this.isOpen = true;
  },

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};
