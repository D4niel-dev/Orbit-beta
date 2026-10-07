/**
 * Link previews — what a pasted link actually leads to.
 *
 * The mobile already showed a card with the domain on it, which says nothing you
 * could not read from the URL. This fetches the page and pulls its Open Graph
 * tags, which is what the desktop does through Electron.
 *
 * ⚠ CORS. The Android WebView runs on the https://localhost origin, so a plain
 * `fetch` of someone else's site is blocked — no exception, just an opaque
 * failure. Capacitor's HTTP plugin performs the request in NATIVE code and
 * sidesteps it entirely, which is the same route update-check.js takes. When the
 * plugin is absent (browser dev) it falls back to fetch, where it will usually
 * fail and the card simply stays as the domain.
 *
 * Nothing here is trusted: the title and description are handed back as plain
 * strings for the caller to escape, and only http(s) URLs are ever fetched.
 */
(function () {
  'use strict';

  var CACHE = {};          // url -> { title, description, image, site, url }
  var INFLIGHT = {};       // url -> promise, so a redraw does not refetch
  var MAX_HTML = 300000;   // 300 KB of markup is plenty for <head>

  // A URL in free text. Trailing punctuation is trimmed below — "see https://x.com."
  // should not try to fetch "x.com."
  var URL_RE = /https?:\/\/[^\s<>"']+/i;

  /** The first http(s) link in a piece of text, or null. */
  function firstUrl(text) {
    if (!text) return null;
    var m = String(text).match(URL_RE);
    if (!m) return null;
    var url = m[0];
    // Trailing punctuation is part of the sentence, not the link.
    url = url.replace(/[.,;:!?)\]}'"]+$/, '');
    // A bare "https://" is not a link.
    if (/^https?:\/\/$/.test(url)) return null;
    return url;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return url; }
  }

  /**
   * Fetch through Capacitor's native HTTP when it is there, otherwise fetch.
   * Mirrors shared/network/update-check.js, which had to solve the same problem.
   */
  function transport(url) {
    var cap = (typeof window !== 'undefined' && window.Capacitor) || null;
    var http = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    if (http && http.get) {
      return http.get({ url: url, headers: { Accept: 'text/html' } }).then(function (res) {
        var data = res ? res.data : '';
        // CapacitorHttp may hand back an object when the page is JSON.
        return typeof data === 'string' ? data : JSON.stringify(data === undefined ? '' : data);
      });
    }
    if (typeof fetch === 'function') {
      return fetch(url, { headers: { Accept: 'text/html' } }).then(function (r) { return r.text(); });
    }
    return Promise.reject(new Error('no transport'));
  }

  /** One <meta> value, whichever attribute order the page used. */
  function meta(html, prop) {
    var esc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var patterns = [
      new RegExp('<meta[^>]+(?:property|name)=["\']' + esc + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'),
      new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + esc + '["\']', 'i')
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = html.match(patterns[i]);
      if (m && m[1]) return decodeEntities(m[1]).trim();
    }
    return '';
  }

  function titleTag(html) {
    var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m && m[1] ? decodeEntities(m[1]).trim() : '';
  }

  /** The handful of entities that actually turn up in og: tags. */
  function decodeEntities(s) {
    return String(s)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); });
  }

  /** Resolve a possibly-relative og:image against the page it came from. */
  function absolute(src, base) {
    if (!src) return '';
    try { return new URL(src, base).href; } catch (e) { return src; }
  }

  /**
   * Fetch and parse a URL's preview. Always resolves — a failure is a preview
   * with only the domain filled in, because a link that cannot be described is
   * still a link, and the card is better than nothing.
   */
  function preview(url) {
    if (!url) return Promise.resolve(null);
    if (CACHE[url]) return Promise.resolve(CACHE[url]);
    if (INFLIGHT[url]) return INFLIGHT[url];

    var base = {
      url: url,
      site: hostOf(url),
      title: hostOf(url),
      description: '',
      image: ''
    };

    INFLIGHT[url] = transport(url)
      .then(function (html) {
        if (!html) return base;
        var head = html.slice(0, MAX_HTML);
        var out = {
          url: url,
          site: meta(head, 'og:site_name') || hostOf(url),
          title: meta(head, 'og:title') || titleTag(head) || hostOf(url),
          description: meta(head, 'og:description') || meta(head, 'description') || '',
          image: absolute(meta(head, 'og:image'), url)
        };
        CACHE[url] = out;
        return out;
      })
      .catch(function () {
        CACHE[url] = base;
        return base;
      })
      .then(function (r) { delete INFLIGHT[url]; return r; });

    return INFLIGHT[url];
  }

  /** Drop a cached entry, so the next look refetches. */
  function forget(url) {
    if (url) { delete CACHE[url]; delete INFLIGHT[url]; }
  }

  window.OrbitLinkPreview = {
    firstUrl: firstUrl,
    hostOf: hostOf,
    preview: preview,
    forget: forget
  };
})();
