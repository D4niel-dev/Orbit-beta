(function() {
  if (window.ImageCropper) return;

  var _id = 0;

  // ─── Inject global styles once ─────────────────────────────────────
  if (!document.getElementById('ic-styles')) {
    var s = document.createElement('style');
    s.id = 'ic-styles';
    s.textContent = [
      /* Slider thumbs — premium glow */
      '.ic-overlay input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:var(--accent-primary,#6C5CE7);cursor:pointer;border:2px solid #fff;box-shadow:0 0 12px rgba(108,92,231,0.35),0 2px 4px rgba(0,0,0,0.3);transition:box-shadow .2s ease}',
      '.ic-overlay input[type=range]::-webkit-slider-thumb:hover{box-shadow:0 0 20px rgba(108,92,231,0.55),0 2px 4px rgba(0,0,0,0.3)}',
      '.ic-overlay input[type=range]::-webkit-slider-thumb:active{box-shadow:0 0 24px rgba(108,92,231,0.7),0 2px 4px rgba(0,0,0,0.3)}',
      '.ic-overlay input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--accent-primary,#6C5CE7);cursor:pointer;border:2px solid #fff;box-shadow:0 0 12px rgba(108,92,231,0.35),0 2px 4px rgba(0,0,0,0.3)}',
      '.ic-overlay input[type=range]::-moz-range-track{height:4px;border-radius:4px;background:rgba(255,255,255,0.08)}',

      /* Keyframes */
      '@keyframes icFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes icScaleIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}',


      /* Close button — circle hover */
      '.ic-overlay .ic-close-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:all .15s ease;cursor:pointer;background:none;border:none;color:var(--text-secondary,#888)}',
      '.ic-overlay .ic-close-btn:hover{background:rgba(255,255,255,0.08);color:var(--text-primary,#eee)}',
      '.ic-overlay .ic-close-btn:active{background:rgba(255,255,255,0.12);transform:scale(0.92)}',

      /* Zoom buttons */
      '.ic-overlay .ic-zoom-btn{background:rgba(255,255,255,0.04);border:1px solid var(--border-subtle,rgba(255,255,255,0.06));color:var(--text-primary,#eee);width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s ease}',
      '.ic-overlay .ic-zoom-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.12)}',
      '.ic-overlay .ic-zoom-btn:active{transform:scale(0.92)}',

      /* Tool buttons — icon + label */
      '.ic-overlay .ic-tool-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 12px;border-radius:10px;border:1px solid transparent;cursor:pointer;transition:all .15s ease;background:rgba(255,255,255,0.04);color:var(--text-primary,#eee);font-family:inherit;flex:1;min-width:0}',
      '.ic-overlay .ic-tool-btn:hover{background:rgba(255,255,255,0.08);border-color:var(--border-subtle,rgba(255,255,255,0.1))}',
      '.ic-overlay .ic-tool-btn:active{transform:scale(0.92)}',
      '.ic-overlay .ic-tool-btn.active{background:rgba(108,92,231,0.15);border-color:var(--accent-primary,#6C5CE7)}',
      '.ic-overlay .ic-tool-btn.active .ic-tool-icon{color:var(--accent-primary,#6C5CE7)}',

      /* Action buttons */
      '.ic-overlay .ic-action-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 22px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;transition:all .15s ease;border:none;font-family:inherit}',
      '.ic-overlay .ic-action-btn:hover{transform:translateY(-1px)}',
      '.ic-overlay .ic-action-btn:active{transform:translateY(0) scale(0.98)}',


      /* Slider track animation */
      '.ic-overlay .ic-slider{-webkit-appearance:none;appearance:none;height:4px;border-radius:4px;outline:none;cursor:pointer;flex:1}',
    ].join('');
    document.head.appendChild(s);
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  function cropperId() {
    return 'ic-' + (++_id);
  }

  function loadImage(src) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('Failed to load image')); };
      if (typeof src === 'string') {
        img.src = src;
      } else if (src instanceof File || src instanceof Blob) {
        var reader = new FileReader();
        reader.onload = function(e) { img.src = e.target.result; };
        reader.onerror = reject;
        reader.readAsDataURL(src);
      } else {
        reject(new Error('Invalid image source'));
      }
    });
  }

  // ─── ImageCropper API ───────────────────────────────────────────────

  window.ImageCropper = {
    open: function(imageSource, options, callback) {
      var opts = options || {};
      var aspectRatio = opts.aspectRatio || 1;
      var cropWidth = opts.cropWidth || 300;
      var cropHeight = opts.cropHeight || 300;
      var title = opts.title || 'Crop Image';
      var called = false;

      function safeCallback(result) {
        if (called) return;
        called = true;
        if (typeof callback === 'function') callback(result);
      }

      var cid = cropperId();
      var isAvatar = aspectRatio === 1;

      // ─── State ────────────────────────────────────────────────────
      var zoom = 1;
      var rotation = 0;
      var mirror = false;
      var baseOffX = 0, baseOffY = 0;
      var dragX = 0, dragY = 0;

      var isDragging = false;
      var dragStartX = 0, dragStartY = 0;
      var dragStartImgX = 0, dragStartImgY = 0;
      var cropCX = 0, cropCY = 0;
      var imgEl = null, previewBox = null, cropOverlay = null;

      // ─── Build DOM ────────────────────────────────────────────────

      // Overlay
      var overlay = document.createElement('div');
      overlay.className = 'ic-overlay';
      overlay.id = cid;
      overlay.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:100vw',
        'height:100vh',
        'z-index:100000',
        'background:rgba(0,0,0,0.65)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'animation:icFadeIn .2s ease',
        'backdrop-filter:blur(2px)',
        '-webkit-backdrop-filter:blur(2px)',
      ].join(';');

      // Modal
      var modal = document.createElement('div');
      modal.style.cssText = [
        'background:var(--bg-surface,#18181b)',
        'border-radius:16px',
        'width:90vw',
        'max-width:640px',
        'max-height:90vh',
        'display:flex',
        'flex-direction:column',
        'overflow:hidden',
        'box-shadow:0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        'animation:icScaleIn .25s ease',
      ].join(';');

      // ── Header ────────────────────────────────────────────────────

      var header = document.createElement('div');
      header.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'padding:16px 20px',
        'border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.06))',
        'flex-shrink:0',
      ].join(';');

      var titleWrap = document.createElement('div');
      titleWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';

      var titleIcon = document.createElement('i');
      titleIcon.setAttribute('data-lucide', 'crop');
      titleIcon.style.cssText = 'width:18px;height:18px;color:var(--accent-primary,#6C5CE7);';

      var titleEl = document.createElement('span');
      titleEl.style.cssText = 'font-size:16px;font-weight:700;color:var(--text-primary,#eee);letter-spacing:0.3px;';
      titleEl.textContent = title;

      var closeBtn = document.createElement('button');
      closeBtn.className = 'ic-close-btn';
      closeBtn.title = 'Cancel (Esc)';
      var closeIcon = document.createElement('i');
      closeIcon.setAttribute('data-lucide', 'x');
      closeIcon.style.cssText = 'width:18px;height:18px;';
      closeBtn.appendChild(closeIcon);

      titleWrap.appendChild(titleIcon);
      titleWrap.appendChild(titleEl);
      header.appendChild(titleWrap);
      header.appendChild(closeBtn);
      modal.appendChild(header);

      // ── Preview area ──────────────────────────────────────────────

      previewBox = document.createElement('div');
      previewBox.style.cssText = [
        'position:relative',
        'overflow:hidden',
        'flex:1',
        'min-height:300px',
        'touch-action:none',
        'user-select:none',
        '-webkit-user-select:none',
        'background-color:#161618',
        'background-image:linear-gradient(45deg,#202024 25%,transparent 25%),linear-gradient(-45deg,#202024 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#202024 75%),linear-gradient(-45deg,transparent 75%,#202024 75%)',
        'background-size:20px 20px',
        'background-position:0 0,0 10px,10px -10px,-10px 0',
      ].join(';');
      previewBox.id = cid + '-preview';

      // Image
      imgEl = document.createElement('img');
      imgEl.style.cssText = [
        'position:absolute',
        'top:0',
        'left:0',
        'cursor:grab',
        'display:block',
        'animation:icFadeIn .35s ease',
        'will-change:transform',
      ].join(';');
      previewBox.appendChild(imgEl);

      // Crop overlay (SVG mask + decorative elements)
      cropOverlay = document.createElement('div');
      cropOverlay.style.cssText = [
        'position:absolute',
        'top:0',
        'left:0',
        'width:100%',
        'height:100%',
        'pointer-events:none',
        'z-index:2',
      ].join(';');
      previewBox.appendChild(cropOverlay);

      modal.appendChild(previewBox);

      // ── Controls ──────────────────────────────────────────────────

      var controls = document.createElement('div');
      controls.style.cssText = [
        'padding:16px 20px',
        'border-top:1px solid var(--border-subtle,rgba(255,255,255,0.06))',
        'flex-shrink:0',
      ].join(';');

      // ── Row 1: Zoom ───────────────────────────────────────────────

      var zoomRow = document.createElement('div');
      zoomRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px;';

      var zoomMinus = document.createElement('button');
      zoomMinus.className = 'ic-zoom-btn';
      zoomMinus.title = 'Zoom out';
      zoomMinus.innerHTML = '<i data-lucide="zoom-out" style="width:16px;height:16px;"></i>';

      var zoomSlider = document.createElement('input');
      zoomSlider.type = 'range';
      zoomSlider.min = 0.5;
      zoomSlider.max = 3;
      zoomSlider.step = 0.01;
      zoomSlider.value = 1;
      zoomSlider.className = 'ic-slider';
      zoomSlider.style.background = 'linear-gradient(to right,var(--accent-primary,#6C5CE7) 20%,rgba(255,255,255,0.08) 20%)';

      var zoomPlus = document.createElement('button');
      zoomPlus.className = 'ic-zoom-btn';
      zoomPlus.title = 'Zoom in';
      zoomPlus.innerHTML = '<i data-lucide="zoom-in" style="width:16px;height:16px;"></i>';

      var zoomLabel = document.createElement('span');
      zoomLabel.style.cssText = [
        'font-size:12px',
        'font-weight:600',
        'color:var(--text-muted,#888)',
        'min-width:38px',
        'text-align:center',
        'flex-shrink:0',
        'font-variant-numeric:tabular-nums',
      ].join(';');
      zoomLabel.textContent = '100%';

      zoomRow.appendChild(zoomMinus);
      zoomRow.appendChild(zoomSlider);
      zoomRow.appendChild(zoomPlus);
      zoomRow.appendChild(zoomLabel);

      // ── Row 2: Transform tools ────────────────────────────────────

      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;align-items:stretch;gap:8px;margin-bottom:14px;';

      function makeToolBtn(iconName, label, tooltip) {
        var btn = document.createElement('button');
        btn.className = 'ic-tool-btn';
        btn.title = tooltip || label;
        btn.innerHTML = [
          '<i data-lucide="' + iconName + '" class="ic-tool-icon" style="width:18px;height:18px;display:block;margin:0 auto;"></i>',
          '<span style="display:block;font-size:9px;color:var(--text-muted,#666);text-transform:uppercase;letter-spacing:0.5px;line-height:1;">' + label + '</span>',
        ].join('');
        return btn;
      }

      var rotateCCWBtn = makeToolBtn('rotate-ccw', 'CCW', 'Rotate 90\u00B0 CCW');
      var rotateCWBtn  = makeToolBtn('rotate-cw', 'CW', 'Rotate 90\u00B0 CW');
      var mirrorBtn    = makeToolBtn('flip-horizontal', 'Mirror', 'Flip horizontally');
      var resetBtn     = makeToolBtn('refresh-ccw', 'Reset', 'Reset all transforms');

      btnRow.appendChild(rotateCCWBtn);
      btnRow.appendChild(rotateCWBtn);
      btnRow.appendChild(mirrorBtn);
      btnRow.appendChild(resetBtn);

      // ── Row 3: Actions ────────────────────────────────────────────

      var actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:10px;';

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'ic-action-btn';
      cancelBtn.style.cssText = 'background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,0.1));color:var(--text-secondary,#999);';
      cancelBtn.textContent = 'Cancel';

      var applyBtn = document.createElement('button');
      applyBtn.className = 'ic-action-btn';
      applyBtn.style.cssText = 'background:linear-gradient(135deg,var(--accent-primary,#6C5CE7),#a855f7);color:#fff;box-shadow:0 4px 14px rgba(108,92,231,0.3);';
      var applyIcon = document.createElement('i');
      applyIcon.setAttribute('data-lucide', 'check');
      applyIcon.style.cssText = 'width:16px;height:16px;';
      applyBtn.appendChild(applyIcon);
      applyBtn.appendChild(document.createTextNode(' Apply Crop'));

      actionRow.appendChild(cancelBtn);
      actionRow.appendChild(applyBtn);

      // Assemble controls
      controls.appendChild(zoomRow);
      controls.appendChild(btnRow);
      controls.appendChild(actionRow);
      modal.appendChild(controls);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // ─── Initialize Lucide icons ──────────────────────────────────
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (_e) { /* Lucide not available */ }

      // ─── Transform engine ─────────────────────────────────────────

      function applyTransform() {
        if (!imgEl || !previewBox) return;
        var totalX = baseOffX + dragX;
        var totalY = baseOffY + dragY;
        imgEl.style.transform = [
          'translate(' + totalX + 'px, ' + totalY + 'px)',
          'scale(' + zoom + ')',
          'rotate(' + rotation + 'deg)',
          'scaleX(' + (mirror ? -1 : 1) + ')',
        ].join(' ');
      }

      // ─── Crop overlay builder ─────────────────────────────────────

      function updateCropOverlay() {
        if (!cropOverlay || !previewBox) return;
        var pbw = previewBox.clientWidth;
        var pbh = previewBox.clientHeight;
        if (!pbw || !pbh) return;

        var cw, ch;
        if (aspectRatio >= 1) {
          cw = Math.min(pbw * 0.8, 400);
          ch = cw / aspectRatio;
          if (ch > pbh * 0.8) {
            ch = pbh * 0.8;
            cw = ch * aspectRatio;
          }
        } else {
          ch = Math.min(pbh * 0.8, 400);
          cw = ch * aspectRatio;
          if (cw > pbw * 0.8) {
            cw = pbw * 0.8;
            ch = cw / aspectRatio;
          }
        }

        cropCX = (pbw - cw) / 2;
        cropCY = (pbh - ch) / 2;

        var parts = [];
        parts.push('<svg width="' + pbw + '" height="' + pbh + '" viewBox="0 0 ' + pbw + ' ' + pbh + '" style="position:absolute;top:0;left:0;width:100%;height:100%;">');

        // ── Mask definition ─────────────────────────────────────────
        parts.push('<defs><mask id="' + cid + '-mask">');
        parts.push('<rect width="' + pbw + '" height="' + pbh + '" fill="white"/>');

        if (isAvatar) {
          var cr = cw / 2;
          var ccx = cropCX + cr;
          var ccy = cropCY + cr;
          parts.push('<circle cx="' + ccx + '" cy="' + ccy + '" r="' + (cr + 1) + '" fill="black"/>');
        } else {
          parts.push('<rect x="' + cropCX + '" y="' + cropCY + '" width="' + cw + '" height="' + ch + '" fill="black"/>');
        }

        parts.push('</mask></defs>');

        // ── Dark overlay rect ───────────────────────────────────────
        if (isAvatar) {
          parts.push('<rect width="' + pbw + '" height="' + pbh + '" fill="rgba(0,0,0,0.55)" mask="url(#' + cid + '-mask)"/>');
        } else {
          parts.push('<rect width="' + pbw + '" height="' + pbh + '" fill="rgba(0,0,0,0.6)" mask="url(#' + cid + '-mask)"/>');
        }

        // ── Decorative elements ─────────────────────────────────────

        if (isAvatar) {
          var cr = cw / 2;
          var ccx = cropCX + cr;
          var ccy = cropCY + cr;

          // Sharp border
          parts.push('<circle cx="' + ccx + '" cy="' + ccy + '" r="' + cr + '" fill="none" stroke="white" stroke-width="2"/>');

        } else {
          // Outer glow border
          parts.push('<rect x="' + (cropCX - 1) + '" y="' + (cropCY - 1) + '" width="' + (cw + 2) + '" height="' + (ch + 2) + '" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="4" rx="2"/>');
          // Sharp white border
          parts.push('<rect x="' + cropCX + '" y="' + cropCY + '" width="' + cw + '" height="' + ch + '" fill="none" stroke="white" stroke-width="1.5" rx="1"/>');

          // Rule-of-thirds grid
          var x1 = cropCX + cw / 3;
          var x2 = cropCX + 2 * cw / 3;
          var y1 = cropCY + ch / 3;
          var y2 = cropCY + 2 * ch / 3;

          parts.push('<line x1="' + x1 + '" y1="' + cropCY + '" x2="' + x1 + '" y2="' + (cropCY + ch) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>');
          parts.push('<line x1="' + x2 + '" y1="' + cropCY + '" x2="' + x2 + '" y2="' + (cropCY + ch) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>');
          parts.push('<line x1="' + cropCX + '" y1="' + y1 + '" x2="' + (cropCX + cw) + '" y2="' + y1 + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>');
          parts.push('<line x1="' + cropCX + '" y1="' + y2 + '" x2="' + (cropCX + cw) + '" y2="' + y2 + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>');

          // Corner handles (8×8 white squares with subtle shadow)
          var hs = 8, hh = 4, hr = 2;

          // Each handle: shadow then white square
          function cornerHandle(cx, cy) {
            var shadow = '<rect x="' + (cx - hh + 1) + '" y="' + (cy - hh + 1) + '" width="' + hs + '" height="' + hs + '" rx="' + hr + '" fill="rgba(0,0,0,0.25)"/>';
            var handle = '<rect x="' + (cx - hh) + '" y="' + (cy - hh) + '" width="' + hs + '" height="' + hs + '" rx="' + hr + '" fill="white"/>';
            return shadow + handle;
          }

          parts.push(cornerHandle(cropCX, cropCY));           // top-left
          parts.push(cornerHandle(cropCX + cw, cropCY));      // top-right
          parts.push(cornerHandle(cropCX, cropCY + ch));      // bottom-left
          parts.push(cornerHandle(cropCX + cw, cropCY + ch)); // bottom-right
        }

        parts.push('</svg>');
        cropOverlay.innerHTML = parts.join('');
      }

      // ─── Image positioning ────────────────────────────────────────

      function updateImagePosition() {
        if (!imgEl || !previewBox) return;
        var pbw = previewBox.clientWidth;
        var pbh = previewBox.clientHeight;
        if (!pbw || !pbh || !imgEl.naturalWidth) return;

        var iw = imgEl.naturalWidth;
        var ih = imgEl.naturalHeight;
        var scaleX = pbw / iw;
        var scaleY = pbh / ih;
        var baseScale = Math.min(scaleX, scaleY);

        // Size image to fit preview (use floats for smooth sub-pixel positioning)
        var dw = iw * baseScale;
        var dh = ih * baseScale;
        imgEl.style.width = dw + 'px';
        imgEl.style.height = dh + 'px';

        baseOffX = (pbw - dw) / 2;
        baseOffY = (pbh - dh) / 2;
        dragX = 0;
        dragY = 0;

        applyTransform();
        updateCropOverlay();
      }

      // ─── Zoom controls ────────────────────────────────────────────

      function updateSliderTrack() {
        var pct = ((zoom - 0.5) / (3 - 0.5)) * 100;
        zoomSlider.style.background = 'linear-gradient(to right,var(--accent-primary,#6C5CE7) ' + pct + '%,rgba(255,255,255,0.08) ' + pct + '%)';
      }

      function updateZoom() {
        var newZoom = parseFloat(zoomSlider.value);
        var ratio = newZoom / zoom;
        dragX *= ratio;
        dragY *= ratio;
        zoom = newZoom;
        zoomLabel.textContent = Math.round(zoom * 100) + '%';
        updateSliderTrack();
        applyTransform();
      }

      zoomSlider.addEventListener('input', updateZoom);

      zoomMinus.addEventListener('click', function() {
        zoomSlider.value = Math.max(0.5, parseFloat(zoomSlider.value) - 0.05);
        updateZoom();
      });

      zoomPlus.addEventListener('click', function() {
        zoomSlider.value = Math.min(3, parseFloat(zoomSlider.value) + 0.05);
        updateZoom();
      });

      // ─── Rotation ─────────────────────────────────────────────────

      rotateCWBtn.addEventListener('click', function() {
        rotation = (rotation + 90) % 360;
        applyTransform();
      });

      rotateCCWBtn.addEventListener('click', function() {
        rotation = (rotation - 90 + 360) % 360;
        applyTransform();
      });

      // ─── Mirror ───────────────────────────────────────────────────

      mirrorBtn.addEventListener('click', function() {
        mirror = !mirror;
        mirrorBtn.classList.toggle('active');
        applyTransform();
      });

      // ─── Reset ────────────────────────────────────────────────────

      resetBtn.addEventListener('click', function() {
        zoom = 1;
        rotation = 0;
        mirror = false;
        dragX = 0;
        dragY = 0;
        zoomSlider.value = 1;
        zoomLabel.textContent = '100%';
        mirrorBtn.classList.remove('active');
        updateSliderTrack();
        applyTransform();
      });

      // ─── Mouse drag ───────────────────────────────────────────────

      function startDrag(clientX, clientY) {
        isDragging = true;
        dragStartX = clientX;
        dragStartY = clientY;
        dragStartImgX = dragX;
        dragStartImgY = dragY;
        if (imgEl) imgEl.style.cursor = 'grabbing';
      }

      function moveDrag(clientX, clientY) {
        if (!isDragging) return;
        var dx = clientX - dragStartX;
        var dy = clientY - dragStartY;
        dragX = dragStartImgX + dx;
        dragY = dragStartImgY + dy;
        applyTransform();
      }

      function endDrag() {
        isDragging = false;
        if (imgEl) imgEl.style.cursor = 'grab';
      }

      previewBox.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
      });

      document.addEventListener('mousemove', function(e) {
        moveDrag(e.clientX, e.clientY);
      });

      document.addEventListener('mouseup', function() {
        endDrag();
      });

      // ─── Touch drag ───────────────────────────────────────────────

      previewBox.addEventListener('touchstart', function(e) {
        var touch = e.touches[0];
        if (!touch) return;
        startDrag(touch.clientX, touch.clientY);
      }, { passive: true });

      document.addEventListener('touchmove', function(e) {
        var touch = e.touches[0];
        if (!touch) return;
        moveDrag(touch.clientX, touch.clientY);
      }, { passive: true });

      document.addEventListener('touchend', function() {
        endDrag();
      });

      // ─── Pinch zoom ───────────────────────────────────────────────

      var lastPinchDist = 0;

      previewBox.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        }
      }, { passive: true });

      document.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (lastPinchDist > 0) {
            var delta = dist / lastPinchDist;
            zoomSlider.value = Math.max(0.5, Math.min(3, parseFloat(zoomSlider.value) * delta));
            updateZoom();
          }
          lastPinchDist = dist;
        }
      }, { passive: true });

      document.addEventListener('touchend', function() {
        lastPinchDist = 0;
      });

      // ─── Wheel zoom ───────────────────────────────────────────────

      previewBox.addEventListener('wheel', function(e) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? -0.02 : 0.02;
        zoomSlider.value = Math.max(0.5, Math.min(3, parseFloat(zoomSlider.value) + delta));
        updateZoom();
      }, { passive: false });

      // ─── Cancel / Close ───────────────────────────────────────────

      function doCancel() {
        overlay.remove();
        safeCallback(null);
      }

      closeBtn.addEventListener('click', doCancel);
      cancelBtn.addEventListener('click', doCancel);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) doCancel();
      });

      // ─── Apply crop ───────────────────────────────────────────────

      applyBtn.addEventListener('click', function() {
        if (!imgEl || !previewBox) return;

        var pbRect = previewBox.getBoundingClientRect();
        var pbw = previewBox.clientWidth;
        var pbh = previewBox.clientHeight;

        // Calculate crop area dimensions
        var cw, ch;
        if (aspectRatio >= 1) {
          cw = Math.min(pbw * 0.8, 400);
          ch = cw / aspectRatio;
          if (ch > pbh * 0.8) {
            ch = pbh * 0.8;
            cw = ch * aspectRatio;
          }
        } else {
          ch = Math.min(pbh * 0.8, 400);
          cw = ch * aspectRatio;
          if (cw > pbw * 0.8) {
            cw = pbw * 0.8;
            ch = cw / aspectRatio;
          }
        }
        var cx = (pbw - cw) / 2;
        var cy = (pbh - ch) / 2;

        var iw = imgEl.naturalWidth;
        var ih = imgEl.naturalHeight;
        var scaleX = pbw / iw;
        var scaleY = pbh / ih;
        var baseScale = Math.max(scaleX, scaleY);

        var displayW = iw * baseScale;
        var displayH = ih * baseScale;

        // Temp canvas at preview size to compose the full transformed image
        var tempCanvas = document.createElement('canvas');
        tempCanvas.width = pbw;
        tempCanvas.height = pbh;
        var tctx = tempCanvas.getContext('2d');

        var imgCX = displayW / 2;
        var imgCY = displayH / 2;

        tctx.save();
        tctx.translate(pbw / 2 + dragX, pbh / 2 + dragY);
        tctx.scale(zoom, zoom);
        tctx.rotate(rotation * Math.PI / 180);
        tctx.scale(mirror ? -1 : 1, 1);
        tctx.drawImage(imgEl, -imgCX, -imgCY, displayW, displayH);
        tctx.restore();

        // Output canvas at desired crop size
        var outCanvas = document.createElement('canvas');
        outCanvas.width = cropWidth;
        outCanvas.height = cropHeight;
        var octx = outCanvas.getContext('2d');
        octx.drawImage(tempCanvas, cx, cy, cw, ch, 0, 0, cropWidth, cropHeight);

        var dataUrl = outCanvas.toDataURL('image/png');
        overlay.remove();
        safeCallback(dataUrl);
      });

      // ─── Keyboard shortcuts ───────────────────────────────────────

      document.addEventListener('keydown', function _keydown(e) {
        if (!document.getElementById(cid)) {
          document.removeEventListener('keydown', _keydown);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          doCancel();
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          applyBtn.click();
        }
      });

      // ─── Resize handling ──────────────────────────────────────────

      var resizeTimer = null;
      window.addEventListener('resize', function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
          updateImagePosition();
          updateCropOverlay();
        }, 200);
      });

      var resizeObserver = null;
      try {
        resizeObserver = new ResizeObserver(function() {
          updateImagePosition();
          updateCropOverlay();
        });
        resizeObserver.observe(previewBox);
      } catch(e) {
        // ResizeObserver not supported
      }

      // ─── Load image ───────────────────────────────────────────────

      loadImage(imageSource).then(function(img) {
        imgEl.src = img.src;
        if (imgEl.complete) {
          updateImagePosition();
        } else {
          imgEl.onload = function() {
            updateImagePosition();
          };
        }
      }).catch(function(err) {
        console.error('[ImageCropper] Failed to load image:', err);
        overlay.remove();
        safeCallback(null);
      });

      // Store refs for cleanup
      overlay._icResizeObserver = resizeObserver;
    }
  };
})();
