// src/js/components/confirm-modal.js

window.ConfirmModal = {
  show(options) {
    const { title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = options;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

    const modal = document.createElement('div');
    modal.style.cssText = 'width:320px;background:var(--bg-surface);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);animation:scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);';

    const header = document.createElement('div');
    header.style.cssText = 'padding:16px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;';
    
    const iconColor = danger ? 'var(--accent-danger)' : 'var(--text-secondary)';
    const iconName = danger ? 'alert-triangle' : 'info';
    
    header.innerHTML = '<i data-lucide="' + iconName + '" style="width:18px;height:18px;margin-right:8px;color:' + iconColor + ';"></i><span style="font-family:var(--font-display);font-weight:600;font-size:15px;">' + window.Sanitize.escapeHtml(title) + '</span>';

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;font-size:14px;color:var(--text-secondary);line-height:1.4;';
    body.innerHTML = window.Sanitize.escapeHtml(message);

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 16px;background:var(--bg-base);display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border-subtle);';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = cancelText;
    btnCancel.style.cssText = 'padding:6px 12px;border-radius:6px;background:transparent;border:1px solid var(--border-subtle);color:var(--text-secondary);cursor:pointer;font-weight:500;font-size:13px;transition:all 0.15s ease;';
    btnCancel.onmouseenter = () => btnCancel.style.background = 'var(--bg-hover)';
    btnCancel.onmouseleave = () => btnCancel.style.background = 'transparent';

    const btnConfirm = document.createElement('button');
    btnConfirm.textContent = confirmText;
    const confirmBg = danger ? 'var(--accent-danger)' : 'var(--accent-primary)';
    btnConfirm.style.cssText = 'padding:6px 12px;border-radius:6px;background:' + confirmBg + ';border:none;color:white;cursor:pointer;font-weight:500;font-size:13px;box-shadow:var(--shadow-sm);transition:all 0.15s ease;';
    btnConfirm.onmouseenter = () => btnConfirm.style.opacity = '0.9';
    btnConfirm.onmouseleave = () => btnConfirm.style.opacity = '1';

    const close = () => {
      overlay.style.animation = 'fadeOut 0.2s ease forwards';
      modal.style.animation = 'scaleOut 0.2s ease forwards';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    };

    btnCancel.onclick = () => {
      if (onCancel) onCancel();
      close();
    };

    btnConfirm.onclick = () => {
      if (onConfirm) onConfirm();
      close();
    };

    footer.appendChild(btnCancel);
    footer.appendChild(btnConfirm);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    document.getElementById('modal-container').appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: header });
  }
};
