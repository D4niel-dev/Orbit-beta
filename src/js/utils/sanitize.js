// src/js/utils/sanitize.js

window.Sanitize = {
  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  },

  // Basic markdown: **bold**, _italic_, `code`
  markdown(text) {
    if (!text) return '';
    let html = this.escapeHtml(text);
    
    // Links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    html = html.replace(urlRegex, function(url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">${url}</a>`;
    });

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Code
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-hover); padding:2px 4px; border-radius:4px; font-family:var(--font-mono); font-size:0.9em;">$1</code>');

    return html;
  }
};
