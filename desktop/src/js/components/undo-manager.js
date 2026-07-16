window.UndoManager = {
  _stack: [],
  _index: -1,
  _maxSize: 100,
  _paused: false,
  _btnUndo: null,
  _btnRedo: null,
  _keyHandler: null,

  init() {
    this._btnUndo = document.getElementById('btn-nav-back');
    this._btnRedo = document.getElementById('btn-nav-forward');
    
    // Replace button click handlers
    if (this._btnUndo) {
      var self = this;
      // Remove old listeners by cloning and replacing
      var newBtn = this._btnUndo.cloneNode(true);
      this._btnUndo.parentNode.replaceChild(newBtn, this._btnUndo);
      this._btnUndo = newBtn;
      this._btnUndo.addEventListener('click', function() { self.undo(); });
    }
    if (this._btnRedo) {
      var self = this;
      var newBtn = this._btnRedo.cloneNode(true);
      this._btnRedo.parentNode.replaceChild(newBtn, this._btnRedo);
      this._btnRedo = newBtn;
      this._btnRedo.addEventListener('click', function() { self.redo(); });
    }
    
    // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
    var self = this;
    this._keyHandler = function(e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          e.preventDefault();
          self.redo();
        } else {
          e.preventDefault();
          self.undo();
        }
      }
      if ((e.key === 'y' || e.key === 'Y') && !e.shiftKey) {
        e.preventDefault();
        self.redo();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
    
    this._updateButtons();
  },

  destroy() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
  },

  pushAction(label, undoFn, redoFn, options) {
    if (this._paused) return null;
    options = options || {};
    
    // Check privacy mode — skip attachment actions when privacy mode is on
    if (options.isAttachment) {
      try {
        var s = window.store.getState().settings;
        if (s && s.privacyMode) return null;
      } catch(e) {}
    }
    
    // Clear any redo history beyond current index
    this._stack.length = this._index + 1;
    
    var action = {
      label: label,
      undo: undoFn,
      redo: redoFn,
      timestamp: Date.now(),
      isAttachment: !!options.isAttachment
    };
    
    this._stack.push(action);
    
    if (this._stack.length > this._maxSize) {
      this._stack.shift();
    } else {
      this._index++;
    }
    
    this._updateButtons();
    return action;
  },

  undo() {
    if (this._index < 0 || !this._stack[this._index]) return false;
    this._paused = true;
    try {
      var action = this._stack[this._index];
      action.undo();
      this._index--;
    } catch(e) {
      console.warn('Undo failed:', e);
    }
    this._paused = false;
    this._updateButtons();
    return true;
  },

  redo() {
    if (this._index >= this._stack.length - 1) return false;
    this._paused = true;
    try {
      this._index++;
      var action = this._stack[this._index];
      action.redo();
    } catch(e) {
      console.warn('Redo failed:', e);
      this._index--;
    }
    this._paused = false;
    this._updateButtons();
    return true;
  },

  peekUndo() {
    if (this._index < 0 || !this._stack[this._index]) return null;
    return this._stack[this._index];
  },

  peekRedo() {
    if (this._index >= this._stack.length - 1) return null;
    return this._stack[this._index + 1];
  },

  _updateButtons() {
    if (this._btnUndo) {
      var canUndo = this._index >= 0;
      this._btnUndo.style.opacity = canUndo ? '1' : '0.2';
      this._btnUndo.style.pointerEvents = canUndo ? 'auto' : 'none';
      this._btnUndo.title = canUndo ? 'Undo: ' + (this._stack[this._index] ? this._stack[this._index].label : '') : 'No actions to undo';
    }
    if (this._btnRedo) {
      var canRedo = this._index < this._stack.length - 1;
      this._btnRedo.style.opacity = canRedo ? '1' : '0.2';
      this._btnRedo.style.pointerEvents = canRedo ? 'auto' : 'none';
      this._btnRedo.title = canRedo ? 'Redo: ' + (this._stack[this._index + 1] ? this._stack[this._index + 1].label : '') : 'No actions to redo';
    }
  },

  clear() {
    this._stack = [];
    this._index = -1;
    this._updateButtons();
  },

  get length() { return this._stack.length; },
  get canUndo() { return this._index >= 0; },
  get canRedo() { return this._index < this._stack.length - 1; }
};
