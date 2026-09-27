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

  /**
   * How much space this platform's scrollbar takes.
   *
   * Zero where scrollbars overlay the content — macOS, and Chrome's overlay setting.
   * Around 17px on Windows, where they do not.
   */
  _scrollbarWidth() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;';
    document.body.appendChild(probe);
    var width = probe.offsetWidth - probe.clientWidth;
    document.body.removeChild(probe);
    return width > 0 ? width : 0;
  },

  /**
   * Make room for the scrollbar.
   *
   * The picker sizes its grid to the full width of the element and then scrolls it.
   * Where the scrollbar overlays the content that is free; on Windows it is not, and
   * the grid runs underneath it — which is why the desktop picker's last column was
   * half-hidden behind the scrollbar.
   *
   * The first attempt at this looked for an element overflowing its box inside the
   * library's shadow DOM. That was the wrong symptom: nothing overflows, the grid is
   * simply drawn under the scrollbar. It also named a class (`.scroll`) that this
   * version of emoji-picker-element does not have, so it silently did nothing. This
   * version measures the platform instead of inspecting the library.
   */
  _fitToScrollbar() {
    var picker = this.container && this.container.querySelector('emoji-picker');
    if (!picker) return;
    // Measure at the natural width first, so repeated calls cannot ratchet the
    // container wider and wider.
    this.container.style.width = '';
    picker.style.width = '';
    var gutter = this._scrollbarWidth();
    if (!gutter) return;
    var natural = picker.getBoundingClientRect().width;
    if (natural <= 0) return;
    // The width has to go on the PICKER, not just the container: the element has its
    // own intrinsic width, so a wider container only leaves empty space beside it and
    // the grid keeps running under the element's own scrollbar. Widening the element
    // gives the grid its full width back and puts the scrollbar in the extra gutter.
    var total = Math.ceil(natural + gutter);
    picker.style.width = total + 'px';
    this.container.style.width = total + 'px';
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
    var self = this;
    // Once now, and once after the picker has laid out its grid — the shadow root is
    // not populated synchronously on first open.
    this._fitToScrollbar();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function() { self._fitToScrollbar(); });
    }
    setTimeout(function() { self._fitToScrollbar(); }, 150);
  },

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};
