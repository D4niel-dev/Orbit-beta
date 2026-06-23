window.PinLockScreen = {
  container: null,
  onUnlock: null,
  _attempts: 0,
  _cooldownTimer: null,
  _cooldownEnd: 0,

  init() {},

  show(onUnlockCallback) {
    this.onUnlock = onUnlockCallback;
    this._attempts = 0;
    this._cooldownEnd = 0;
    if (this.container) this.container.remove();

    this.container = document.createElement('div');
    this.container.id = 'pin-lock-screen';
    this.container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:var(--bg-base);display:flex;align-items:center;justify-content:center;flex-direction:column;';
    document.body.appendChild(this.container);
    this._render();
  },

  _render() {
    var self = this;
    var html =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:24px;max-width:320px;width:100%;padding:24px;">' +
        '<img src="icons/app/orbit_1024.png" style="width:64px;height:64px;border-radius:16px;box-shadow:0 4px 16px rgba(0,0,0,0.2);">' +
        '<div style="text-align:center;">' +
          '<div style="font-size:18px;font-weight:700;color:var(--text-primary);">Orbit is Locked</div>' +
          '<div style="font-size:13px;color:var(--text-muted);margin-top:4px;">Enter your PIN to unlock</div>' +
        '</div>' +
        '<div style="width:100%;display:flex;flex-direction:column;gap:8px;">' +
          '<div style="position:relative;width:100%;">' +
            '<input id="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autofocus style="width:100%;padding:14px 16px;border-radius:12px;border:2px solid var(--border-subtle);background:var(--bg-hover);color:var(--text-primary);font-size:20px;font-weight:600;text-align:center;letter-spacing:8px;outline:none;transition:border-color 0.2s;box-sizing:border-box;" placeholder="······">' +
            '<button id="pin-toggle-vis" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;">' +
              '<i data-lucide="eye" style="width:18px;height:18px;"></i>' +
            '</button>' +
          '</div>' +
          '<div id="pin-error" style="font-size:12px;color:var(--accent-danger);text-align:center;min-height:18px;"></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;max-width:240px;">';
    for (var i = 1; i <= 9; i++) {
      html += '<button class="pin-key" data-key="' + i + '" style="width:100%;aspect-ratio:1;border-radius:50%;border:none;background:var(--bg-hover);color:var(--text-primary);font-size:22px;font-weight:600;cursor:pointer;transition:background 0.1s;display:flex;align-items:center;justify-content:center;">' + i + '</button>';
    }
    html +=
          '<button class="pin-key" data-key="clear" style="width:100%;aspect-ratio:1;border-radius:50%;border:none;background:var(--bg-hover);color:var(--text-secondary);font-size:14px;cursor:pointer;transition:background 0.1s;display:flex;align-items:center;justify-content:center;">Clear</button>' +
          '<button class="pin-key" data-key="0" style="width:100%;aspect-ratio:1;border-radius:50%;border:none;background:var(--bg-hover);color:var(--text-primary);font-size:22px;font-weight:600;cursor:pointer;transition:background 0.1s;display:flex;align-items:center;justify-content:center;">0</button>' +
          '<button class="pin-key" data-key="backspace" style="width:100%;aspect-ratio:1;border-radius:50%;border:none;background:var(--bg-hover);color:var(--text-secondary);font-size:18px;cursor:pointer;transition:background 0.1s;display:flex;align-items:center;justify-content:center;"><i data-lucide="delete" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
        '<button id="pin-forgot-link" style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;text-decoration:underline;padding:4px;">Forgot PIN?</button>' +
      '</div>';

    this.container.innerHTML = html;

    var input = this.container.querySelector('#pin-input');
    input.addEventListener('focus', function() { this.style.borderColor = 'var(--accent-primary)'; });
    input.addEventListener('blur', function() { this.style.borderColor = 'var(--border-subtle)'; });
    input.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '').substring(0, 8);
      if (this.value.length >= 4) {
        self._verify(this.value);
      }
    });
    setTimeout(function() { input.focus(); }, 100);

    // Toggle visibility
    var visBtn = this.container.querySelector('#pin-toggle-vis');
    var isVisible = false;
    visBtn.addEventListener('click', function() {
      isVisible = !isVisible;
      input.type = isVisible ? 'text' : 'password';
      this.querySelector('i').setAttribute('data-lucide', isVisible ? 'eye-off' : 'eye');
      if (window.lucide) window.lucide.createIcons({ root: visBtn });
    });

    // Numpad keys
    this.container.querySelectorAll('.pin-key').forEach(function(btn) {
      btn.addEventListener('mousedown', function() { this.style.background = 'var(--bg-surface)'; });
      btn.addEventListener('mouseup', function() { this.style.background = 'var(--bg-hover)'; });
      btn.addEventListener('mouseleave', function() { this.style.background = 'var(--bg-hover)'; });
      btn.addEventListener('click', function() {
        var key = this.getAttribute('data-key');
        if (key === 'clear') {
          input.value = '';
          return;
        }
        if (key === 'backspace') {
          input.value = input.value.slice(0, -1);
          return;
        }
        if (input.value.length < 8) {
          input.value += key;
          if (input.value.length >= 4) {
            self._verify(input.value);
          }
        }
      });
    });

    // Forgot PIN
    this.container.querySelector('#pin-forgot-link').addEventListener('click', function() {
      if (window.orbitAPI) window.orbitAPI.pinForgot();
      self._dismiss();
    });
  },

  _verify(pin) {
    if (this._cooldownTimer) return;
    if (Date.now() < this._cooldownEnd) {
      var remaining = Math.ceil((this._cooldownEnd - Date.now()) / 1000);
      this._showError('Too many attempts. Try again in ' + remaining + 's');
      return;
    }

    var valid = window.orbitAPI ? window.orbitAPI.pinVerify(pin) : false;
    if (valid) {
      this._dismiss();
    } else {
      this._attempts++;
      var input = this.container.querySelector('#pin-input');
      input.value = '';
      if (this._attempts >= 5) {
        this._cooldownEnd = Date.now() + 30000;
        this._showError('Too many attempts. Try again in 30s');
        var self = this;
        this._cooldownTimer = setTimeout(function() {
          self._cooldownTimer = null;
          self._showError('');
        }, 30000);
      } else {
        this._showError('Incorrect PIN. ' + (5 - this._attempts) + ' attempts remaining');
        // Shake animation
        input.style.animation = 'none';
        setTimeout(function() { input.style.animation = 'shake 0.3s'; }, 10);
      }
    }
  },

  _showError(msg) {
    var el = this.container.querySelector('#pin-error');
    if (el) el.textContent = msg;
  },

  _dismiss() {
    if (this._cooldownTimer) {
      clearTimeout(this._cooldownTimer);
      this._cooldownTimer = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (typeof this.onUnlock === 'function') {
      this.onUnlock();
    }
  }
};

// Inject shake keyframes once
(function() {
  var style = document.createElement('style');
  style.textContent = '@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 50%{transform:translateX(6px)} 75%{transform:translateX(-4px)} }';
  document.head.appendChild(style);
})();
