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

  // Enhanced markdown: **bold**, _italic_, *italic*, `code`, ~~strikethrough~~,
  // > blockquote, -/* lists, 1. lists, # headings, --- hr, ```code```, [text](url)
  markdown(text) {
    if (!text) return '';
    var html = this.escapeHtml(text);
    var protectedContent = [];
    var pc = 0; // placeholder counter

    // ── Phase 1: Protect code content from markdown processing ──

    // Protect single-line fenced code blocks (```code```)
    html = html.replace(/```([^`\n]+?)```/g, function(match, code) {
      var idx = pc++;
      var trimmedCode = code.trim();
      protectedContent[idx] =
        '<code style="background:var(--bg-hover, rgba(0,0,0,0.15));padding:2px 6px;border-radius:4px;font-family:var(--font-mono, monospace);font-size:0.9em;color:var(--accent-primary, #58a6ff);border:1px solid var(--border-subtle, rgba(255,255,255,0.1));">' +
        trimmedCode +
        '</code>';
      return '\x00MD' + idx + '\x00';
    });

    // Protect multi-line fenced code blocks (```lang\n code \n```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      var idx = pc++;
      var langClean = lang.replace(/[^\w]/g, '');
      var codeCls = langClean ? ' class="language-' + langClean + '"' : '';
      var preCls  = langClean ? ' class="language-' + langClean + '"' : '';
      var langLabel = langClean ? '<span class="code-lang-label" style="font-size:10px;font-weight:600;color:var(--text-secondary,#aaa);font-family:var(--font-mono,monospace);text-transform:lowercase;letter-spacing:0.3px;padding:1px 6px;border-radius:4px;background:var(--bg-surface, rgba(255,255,255,0.06));line-height:1.6;">' + langClean + '</span>' : '';
      var trimmedCode = code.trim();
      // Escape the code for use in an attribute — can't use the code directly in onclick because it may contain quotes
      var codeForAttr = trimmedCode.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      protectedContent[idx] =
        '<div class="code-block-wrap" style="position:relative;margin:8px 0;border-radius:8px;overflow:hidden;background:var(--bg-hover, #1a1a2e);border:1px solid var(--border-subtle, rgba(255,255,255,0.1));">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;background:var(--bg-surface, rgba(0,0,0,0.15));border-bottom:1px solid var(--border-subtle, rgba(255,255,255,0.05));">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' + langLabel + '</div>' +
        '<button class="copy-code-btn" data-code="' + codeForAttr + '" style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid var(--border-subtle, rgba(255,255,255,0.15));background:transparent;color:var(--text-muted, #888);cursor:pointer;font-family:inherit;line-height:1.5;transition:all 0.15s;" onmouseover="this.style.background=\'var(--bg-hover, rgba(255,255,255,0.05))\';this.style.color=\'var(--text-primary, #fff)\';" onmouseout="this.style.background=\'transparent\';this.style.color=\'var(--text-muted, #888)\';">Copy</button>' +
        '</div>' +
        '<pre' + preCls + ' style="margin:0;padding:12px 16px;overflow-x:auto;background:transparent;border:none;">' +
        '<code' + codeCls + ' style="font-family:var(--font-mono);font-size:0.85em;line-height:1.5;">' +
        trimmedCode +
        '</code></pre></div>';
      return '\x00MD' + idx + '\x00';
    });

    // Protect inline code (`code`)
    html = html.replace(/`([^`]+)`/g, function(match, code) {
      var idx = pc++;
      var trimmedCode = code.trim();
      protectedContent[idx] =
        '<code style="background:var(--bg-hover, rgba(0,0,0,0.15));padding:2px 6px;border-radius:4px;font-family:var(--font-mono, monospace);font-size:0.9em;color:var(--accent-primary, #58a6ff);border:1px solid var(--border-subtle, rgba(255,255,255,0.1));">' +
        trimmedCode +
        '</code>';
      return '\x00MD' + idx + '\x00';
    });

    // ── Phase 2: Process inline markdown ──

    // Inline links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
      var idx = pc++;
      protectedContent[idx] =
        '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">' + text + '</a>';
      return '\x00MD' + idx + '\x00';
    });

    // Links (auto-detect URLs)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    html = html.replace(urlRegex, function(url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">' + url + '</a>';
    });

    // @mentions
    html = html.replace(/@(\w+)/g, '<span class="chat-mention" style="color:var(--accent-primary);font-weight:600;background:var(--accent-soft);padding:1px 4px;border-radius:4px;">@$1</span>');

    // Horizontal rules (---, ***, ___ — three or more)
    html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '<hr style="border:none;border-top:2px solid var(--border-subtle);margin:12px 0;">');

    // Headings (# through ######) — from most to least # to avoid partial matches
    html = html.replace(/^###### (.+)$/gm, '<h6 style="margin:12px 0 6px;font-size:13px;font-weight:700;color:var(--text-primary);">$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5 style="margin:12px 0 6px;font-size:14px;font-weight:700;color:var(--text-primary);">$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4 style="margin:12px 0 6px;font-size:15px;font-weight:700;color:var(--text-primary);">$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:17px;font-weight:700;color:var(--text-primary);">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="margin:12px 0 6px;font-size:19px;font-weight:700;color:var(--text-primary);">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="margin:12px 0 6px;font-size:22px;font-weight:700;color:var(--text-primary);">$1</h1>');

    // Strikethrough
    html = html.replace(/~~([^~]+)~~/g, '<del style="color:var(--text-muted);">$1</del>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent-primary);padding:4px 12px;margin:8px 0;color:var(--text-secondary);background:var(--bg-hover);border-radius:0 8px 8px 0;">$1</blockquote>');

    // Unordered lists (- item or * item) — mark with data attribute for grouping
    html = html.replace(/^- (.+)$/gm, '<li data-md-list="ul" style="margin:2px 0;list-style:disc;margin-left:20px;">$1</li>');
    html = html.replace(/^\* (.+)$/gm, '<li data-md-list="ul" style="margin:2px 0;list-style:disc;margin-left:20px;">$1</li>');

    // Ordered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, '<li data-md-list="ol" style="margin:2px 0;list-style:decimal;margin-left:20px;">$1</li>');

    // Group consecutive <li> items into <ul> or <ol>
    // Only groups items separated by a single \n (blank lines separate distinct lists)
    html = html.replace(/((?:<li[^>]*>[\s\S]*?<\/li>\n?)+)/g, function(match) {
      var listType = /data-md-list="ol"/.test(match) ? 'ol' : 'ul';
      match = match.replace(/ data-md-list="(?:ul|ol)"/g, '');
      return '<' + listType + ' style="margin:8px 0;padding:0;padding-left:20px;">' + match.trim() + '</' + listType + '>';
    });

    // Bold (**bold**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic (_text_ and *text*)
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // ── Phase 3: Restore protected content ──
    for (var i = 0; i < protectedContent.length; i++) {
      html = html.split('\x00MD' + i + '\x00').join(protectedContent[i]);
    }

    return html;
  }
};
