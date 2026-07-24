(function() {
  if (window.ImageCropper) return;

  var _id = 0;

  // Inject range slider thumb styling
  if (!document.getElementById('ic-slider-style')) {
    var is = document.createElement('style');
    is.id = 'ic-slider-style';
    is.textContent = '.ic-overlay input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:var(--accent-primary,#6C5CE7);cursor:pointer;border:2px solid var(--bg-surface,#222);}.ic-overlay input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--accent-primary,#6C5CE7);cursor:pointer;border:2px solid var(--bg-surface,#222);}';
    document.head.appendChild(is);
  }

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
        if (typeof callback === 'function') {
          callback(result);
        }
      }

      var cid = cropperId();

      // State
      var zoom = 1;
      var rotation = 0;
      var mirror = false;
      var baseOffX = 0;
      var baseOffY = 0;
      var dragX = 0;
      var dragY = 0;
      var isDragging = false;
      var dragStartX = 0;
      var dragStartY = 0;
      var dragStartImgX = 0;
      var dragStartImgY = 0;
      var cropCX = 0;
      var cropCY = 0;
      var imgEl = null;
      var previewBox = null;
      var cropOverlay = null;

      // Build modal
      var overlay = document.createElement('div');
      overlay.className = 'ic-overlay';
      overlay.id = cid;
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:100000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

      var modal = document.createElement('div');
      modal.style.cssText = 'background:var(--bg-surface,#222);border-radius:16px;width:90vw;max-width:640px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.5);';

      // Header
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.08));flex-shrink:0;';

      var titleEl = document.createElement('span');
      titleEl.style.cssText = 'font-size:16px;font-weight:700;color:var(--text-primary,#eee);';
      titleEl.textContent = title;

      var closeBtn = document.createElement('button');
      closeBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary,#999);cursor:pointer;padding:4px;font-size:20px;line-height:1;';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Cancel';

      header.appendChild(titleEl);
      header.appendChild(closeBtn);
      modal.appendChild(header);

      // Preview area
      previewBox = document.createElement('div');
      previewBox.style.cssText = 'position:relative;overflow:hidden;flex:1;min-height:300px;background:var(--bg-base,#111);touch-action:none;user-select:none;-webkit-user-select:none;';
      previewBox.id = cid + '-preview';

      // Image element
      imgEl = document.createElement('img');
      imgEl.style.cssText = 'position:absolute;top:0;left:0;cursor:grab;display:block;';
      previewBox.appendChild(imgEl);

      // Crop area overlay - the dark overlay with transparent cutout
      cropOverlay = document.createElement('div');
      cropOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
      previewBox.appendChild(cropOverlay);

      modal.appendChild(previewBox);

      // Controls area
      var controls = document.createElement('div');
      controls.style.cssText = 'padding:16px 20px;border-top:1px solid var(--border-subtle,rgba(255,255,255,0.08));flex-shrink:0;';

      // Zoom row
      var zoomRow = document.createElement('div');
      zoomRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px;';

      var zoomMinus = document.createElement('button');
      zoomMinus.textContent = '\u2212';
      zoomMinus.style.cssText = 'background:var(--bg-hover,#333);border:none;color:var(--text-primary,#eee);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

      var zoomSlider = document.createElement('input');
      zoomSlider.type = 'range';
      zoomSlider.min = 0.5;
      zoomSlider.max = 3;
      zoomSlider.step = 0.1;
      zoomSlider.value = 1;
      zoomSlider.style.cssText = 'flex:1;height:4px;-webkit-appearance:none;appearance:none;background:var(--border-subtle,rgba(255,255,255,0.15));border-radius:2px;outline:none;cursor:pointer;';
      // Style the thumb via JS since we can't use pseudo-elements
      zoomSlider.style.setProperty('--thumb-color', 'var(--accent-primary,#6C5CE7)');

      var zoomPlus = document.createElement('button');
      zoomPlus.textContent = '+';
      zoomPlus.style.cssText = 'background:var(--bg-hover,#333);border:none;color:var(--text-primary,#eee);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

      var zoomLabel = document.createElement('span');
      zoomLabel.style.cssText = 'font-size:12px;color:var(--text-muted,#888);min-width:36px;text-align:center;flex-shrink:0;';
      zoomLabel.textContent = '1.0x';

      zoomRow.appendChild(zoomMinus);
      zoomRow.appendChild(zoomSlider);
      zoomRow.appendChild(zoomPlus);
      zoomRow.appendChild(zoomLabel);

      // Transform buttons row
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;';

      function makeToolBtn(label, title) {
        var b = document.createElement('button');
        b.textContent = label;
        b.title = title || label;
        b.style.cssText = 'background:var(--bg-hover,#333);border:none;color:var(--text-primary,#eee);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;transition:background 0.15s;';
        return b;
      }

      var rotateCCWBtn = makeToolBtn('\u21BA', 'Rotate 90\u00B0 CCW');
      var rotateCWBtn = makeToolBtn('\u21BB', 'Rotate 90\u00B0 CW');
      var mirrorBtn = makeToolBtn('\u2194', 'Mirror');
      var resetBtn = makeToolBtn('Reset', 'Reset all');

      mirrorBtn.style.fontWeight = 'normal';

      btnRow.appendChild(rotateCCWBtn);
      btnRow.appendChild(rotateCWBtn);
      btnRow.appendChild(mirrorBtn);
      btnRow.appendChild(resetBtn);

      // Action buttons
      var actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;';

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle,rgba(255,255,255,0.12));background:transparent;color:var(--text-secondary,#999);cursor:pointer;font-size:14px;font-weight:600;';

      var applyBtn = document.createElement('button');
      applyBtn.textContent = 'Apply Crop';
      applyBtn.style.cssText = 'padding:10px 20px;border-radius:10px;border:none;background:var(--accent-primary,#6C5CE7);color:#fff;cursor:pointer;font-size:14px;font-weight:700;';

      actionRow.appendChild(cancelBtn);
      actionRow.appendChild(applyBtn);

      controls.appendChild(zoomRow);
      controls.appendChild(btnRow);
      controls.appendChild(actionRow);
      modal.appendChild(controls);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      function applyTransform() {
        if (!imgEl || !previewBox) return;
        var totalX = baseOffX + dragX;
        var totalY = baseOffY + dragY;
        var transforms = [];
        transforms.push('translate(' + totalX + 'px, ' + totalY + 'px)');
        transforms.push('scale(' + zoom + ')');
        transforms.push('rotate(' + rotation + 'deg)');
        transforms.push('scaleX(' + (mirror ? -1 : 1) + ')');
        imgEl.style.transform = transforms.join(' ');
      }

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

        var isAvatar = aspectRatio === 1;
        var svg = '<svg width="' + pbw + '" height="' + pbh + '" viewBox="0 0 ' + pbw + ' ' + pbh + '" style="position:absolute;top:0;left:0;width:100%;height:100%;">' +
          '<defs>' +
            '<mask id="' + cid + '-mask">';

        if (isAvatar) {
          var cr = cw / 2;
          var ccx = cropCX + cr;
          var ccy = cropCY + cr;
          svg += '<rect width="' + pbw + '" height="' + pbh + '" fill="white" opacity="0.85"/>';
          svg += '<rect x="' + cropCX + '" y="' + cropCY + '" width="' + cw + '" height="' + ch + '" fill="white" opacity="0.35"/>';
          svg += '<circle cx="' + ccx + '" cy="' + ccy + '" r="' + cr + '" fill="black"/>';
        } else {
          svg += '<rect width="' + pbw + '" height="' + pbh + '" fill="white" opacity="0.6"/>';
          svg += '<rect x="' + cropCX + '" y="' + cropCY + '" width="' + cw + '" height="' + ch + '" fill="black"/>';
        }

        svg += '</mask>' +
          '</defs>' +
          '<rect width="' + pbw + '" height="' + pbh + '" fill="black" mask="url(#' + cid + '-mask)"/>' +
          '<rect x="' + cropCX + '" y="' + cropCY + '" width="' + cw + '" height="' + ch + '" fill="none" stroke="white" stroke-width="2" stroke-dasharray="4,3"/>';

        if (isAvatar) {
          var cr2 = cw / 2;
          var ccx2 = cropCX + cr2;
          var ccy2 = cropCY + cr2;
          svg += '<circle cx="' + ccx2 + '" cy="' + ccy2 + '" r="' + cr2 + '" fill="none" stroke="white" stroke-width="2" stroke-dasharray="4,3"/>';
        }

        svg += '</svg>';
        cropOverlay.innerHTML = svg;
      }

      function updateImagePosition() {
        if (!imgEl || !previewBox) return;
        var pbw = previewBox.clientWidth;
        var pbh = previewBox.clientHeight;
        if (!pbw || !pbh || !imgEl.naturalWidth) return;

        // Size the image to fill the preview box
        var iw = imgEl.naturalWidth;
        var ih = imgEl.naturalHeight;

        // Scale image so it fills the crop area accounting for zoom
        // Base scale: image should fit within the preview
        var scaleX = pbw / iw;
        var scaleY = pbh / ih;
        var baseScale = Math.min(scaleX, scaleY);

        var dw = Math.round(iw * baseScale);
        var dh = Math.round(ih * baseScale);
        imgEl.style.width = dw + 'px';
        imgEl.style.height = dh + 'px';

        // Center the image in the preview
        baseOffX = Math.round((pbw - dw) / 2);
        baseOffY = Math.round((pbh - dh) / 2);
        dragX = 0;
        dragY = 0;

        applyTransform();
        updateCropOverlay();
      }

      // Zoom controls
      function updateZoom() {
        var newZoom = parseFloat(zoomSlider.value);
        var ratio = newZoom / zoom;
        dragX *= ratio;
        dragY *= ratio;
        zoom = newZoom;
        zoomLabel.textContent = zoom.toFixed(1) + 'x';
        applyTransform();
      }

      zoomSlider.addEventListener('input', updateZoom);

      zoomMinus.addEventListener('click', function() {
        zoomSlider.value = Math.max(0.5, parseFloat(zoomSlider.value) - 0.1);
        updateZoom();
      });

      zoomPlus.addEventListener('click', function() {
        zoomSlider.value = Math.min(3, parseFloat(zoomSlider.value) + 0.1);
        updateZoom();
      });

      // Rotate
      rotateCWBtn.addEventListener('click', function() {
        rotation = (rotation + 90) % 360;
        applyTransform();
      });

      rotateCCWBtn.addEventListener('click', function() {
        rotation = (rotation - 90 + 360) % 360;
        applyTransform();
      });

      // Mirror
      mirrorBtn.addEventListener('click', function() {
        mirror = !mirror;
        mirrorBtn.style.fontWeight = mirror ? 'bold' : 'normal';
        mirrorBtn.style.color = mirror ? 'var(--accent-primary,#6C5CE7)' : 'var(--text-primary,#eee)';
        applyTransform();
      });

      // Reset
      resetBtn.addEventListener('click', function() {
        zoom = 1;
        rotation = 0;
        mirror = false;
        dragX = 0;
        dragY = 0;
        zoomSlider.value = 1;
        zoomLabel.textContent = '1.0x';
        mirrorBtn.style.fontWeight = 'normal';
        mirrorBtn.style.color = '';
        applyTransform();
      });

      // Drag mechanics
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

      // Mouse events
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

      // Touch events
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

      // Pinch zoom on touch
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

      // Wheel zoom
      previewBox.addEventListener('wheel', function(e) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? -0.1 : 0.1;
        zoomSlider.value = Math.max(0.5, Math.min(3, parseFloat(zoomSlider.value) + delta));
        updateZoom();
      }, { passive: false });

      // Cancel / Close
      function doCancel() {
        overlay.remove();
        safeCallback(null);
      }

      closeBtn.addEventListener('click', doCancel);
      cancelBtn.addEventListener('click', doCancel);

      // Apply crop
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

        // Create canvas at desired crop output size
        var canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        var ctx = canvas.getContext('2d');

        // Calculate the transform to map from source image to preview
        var iw = imgEl.naturalWidth;
        var ih = imgEl.naturalHeight;
        var scaleX = pbw / iw;
        var scaleY = pbh / ih;
        var baseScale = Math.max(scaleX, scaleY);

        var displayW = iw * baseScale;
        var displayH = ih * baseScale;

        // Source image crop rectangle in original image coordinates
        // The visible area in the crop frame corresponds to:
        // In display coordinates: (cx - dragX, cy - dragY) to (cx - dragX + cw, cy - dragY + ch)
        // But we also have zoom, rotation, and mirror transforms

        // We'll use the approach of drawing the image with all transforms
        // onto a temporary canvas that's the size of the preview,
        // then reading back the crop area.

        // But a simpler and more accurate approach: compute the inverse transform
        // to figure out what portion of the source image maps to the crop area.

        // The transform chain on the img element is:
        // translate(dragX, dragY) -> scale(zoom) -> rotate(rotation) -> scaleX(mirror ? -1 : 1)
        // These apply to the centered image of size (displayW, displayH)

        // We'll draw onto a canvas of size (cropWidth, cropHeight)
        // First, figure out what the full transformed image looks like

        // Create an offscreen canvas at crop output size
        // Draw the image centered, apply all transforms, then read the crop window

        // Clear
        ctx.fillStyle = 'transparent';

        // We need to figure out the offset:
        // In the preview, the image is drawn at (dragX, dragY) with zoom/rotation/mirror
        // The crop window is at (cx, cy) of size (cw, ch) in preview coordinates
        // We need to map that to canvas coordinates.

        // Approach: 
        // 1. Save context
        ctx.save();

        // 2. Translate to center of crop area in canvas
        ctx.translate(cropWidth / 2, cropHeight / 2);

        // 3. Apply inverse of the display transforms to get source image coordinates
        // The display transform order (applied to img):
        //   translate(dragX, dragY) -> scale(zoom) -> rotate(r) -> scaleX(mirror)
        // In canvas, we need to apply the inverse:
        //   We'll draw the image centered then apply the transforms in reverse order

        // Actually, let's use a simpler approach:
        // Create a temp canvas at preview size, draw the full transformed image, 
        // then read the crop rectangle from it, then scale to cropWidth/cropHeight

        var tempCanvas = document.createElement('canvas');
        tempCanvas.width = pbw;
        tempCanvas.height = pbh;
        var tctx = tempCanvas.getContext('2d');

        // Center of image in preview
        var imgCX = displayW / 2;
        var imgCY = displayH / 2;

        tctx.save();
        // Move to center of where the image would be (centered in preview + drag)
        tctx.translate(pbw / 2 + dragX, pbh / 2 + dragY);
        tctx.scale(zoom, zoom);
        tctx.rotate(rotation * Math.PI / 180);
        tctx.scale(mirror ? -1 : 1, 1);
        tctx.drawImage(imgEl, -imgCX, -imgCY, displayW, displayH);
        tctx.restore();

        // Now read back the crop rectangle from tempCanvas
        var imageData = tctx.getImageData(cx, cy, cw, ch);

        // Draw it onto the output canvas at the desired output size
        var outCanvas = document.createElement('canvas');
        outCanvas.width = cropWidth;
        outCanvas.height = cropHeight;
        var octx = outCanvas.getContext('2d');
        octx.drawImage(tempCanvas, cx, cy, cw, ch, 0, 0, cropWidth, cropHeight);

        var dataUrl = outCanvas.toDataURL('image/png');
        overlay.remove();
        safeCallback(dataUrl);
      });

      // Click outside modal to cancel
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) doCancel();
      });

      // Keyboard: Escape to cancel, Enter to apply
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

      // Resize handler
      var resizeTimer = null;
      window.addEventListener('resize', function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
          updateImagePosition();
          updateCropOverlay();
        }, 200);
      });

      // MutationObserver to catch layout changes
      var resizeObserver = null;
      try {
        resizeObserver = new ResizeObserver(function() {
          updateImagePosition();
          updateCropOverlay();
        });
        resizeObserver.observe(previewBox);
      } catch(e) {
        // ResizeObserver not supported, fine
      }

      // Load image
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
