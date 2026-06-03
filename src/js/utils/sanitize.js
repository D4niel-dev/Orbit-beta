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

  // Enhanced markdown: **bold**, _italic_, `code`, ~~strikethrough~~, > blockquote, - lists, 1. lists, ### headings, ```code blocks```
  markdown(text) {
    if (!text) return '';
    let html = this.escapeHtml(text);
    
    // Links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    html = html.replace(urlRegex, function(url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">${url}</a>`;
    });

    // @mentions
    html = html.replace(/@(\w+)/g, '<span class="chat-mention" style="color:var(--accent-primary);font-weight:600;background:var(--accent-soft);padding:1px 4px;border-radius:4px;">@$1</span>');

    // Fenced code blocks (```lang\n code \n```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      return '<pre style="background:var(--bg-base);padding:12px;border-radius:8px;overflow-x:auto;margin:8px 0;border:1px solid var(--border-subtle);"><code style="font-family:var(--font-mono);font-size:0.85em;color:var(--text-primary);">' + code.trim() + '</code></pre>';
    });

    // Headings (### / ####)
    html = html.replace(/^#### (.+)$/gm, '<h4 style="margin:12px 0 6px;font-size:15px;font-weight:700;color:var(--text-primary);">$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:17px;font-weight:700;color:var(--text-primary);">$1</h3>');

    // Strikethrough
    html = html.replace(/~~([^~]+)~~/g, '<del style="color:var(--text-muted);">$1</del>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent-primary);padding:4px 12px;margin:8px 0;color:var(--text-secondary);background:var(--bg-hover);border-radius:0 8px 8px 0;">$1</blockquote>');

    // Unordered lists (- item or * item)
    html = html.replace(/^- (.+)$/gm, '<li style="margin:2px 0;list-style:disc;margin-left:20px;">$1</li>');
    html = html.replace(/^\* (.+)$/gm, '<li style="margin:2px 0;list-style:disc;margin-left:20px;">$1</li>');

    // Ordered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:2px 0;list-style:decimal;margin-left:20px;">$1</li>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-hover); padding:2px 4px; border-radius:4px; font-family:var(--font-mono); font-size:0.9em;">$1</code>');

    return html;
  }
};
