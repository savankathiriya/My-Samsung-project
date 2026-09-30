/**
 * ====================================================================
 * CANVAS IMAGE ELEMENT RENDERER
 * Handles static image elements.
 *
 * RENDERING APPROACH — DOM OVERLAY (all background types):
 *   Images are always rendered as DOM <img> overlays
 *   (position:absolute) inside the canvas container.
 *
 *   WHY NOT CANVAS drawImage():
 *   - drawImage() is async on LG webOS — by the time the image loads
 *     the canvas may have been cleared/reset by updateClocks() or a
 *     second render(), leaving only a partial image or nothing at all.
 *   - DOM <img> elements are composited by the browser independently
 *     of canvas repaints, so they always stay visible.
 *
 *   WHY NOT CSS object-fit:
 *   - CSS object-fit is NOT reliably supported on LG webOS 3/4.
 *   - Instead we compute cover/contain geometry manually (same
 *     technique used by CanvasBackground for the <video> element) and
 *     size/position the <img> ourselves inside an overflow:hidden wrapper.
 * ====================================================================
 */

var CanvasImage = (function () {
    'use strict';

    var _domOverlays = [];

    /* ── PUBLIC: render() ─────────────────────────────────────────── */
    function render(ctx, el) {
        if (!el.src) {
            console.warn('[CanvasImage] Missing src:', el.name || el.id);
            return;
        }
        console.log('[CanvasImage] Rendering:', el.name || el.id,
                    '| pos:', (el.x || 0) + ',' + (el.y || 0),
                    '| size:', (el.width || 0) + 'x' + (el.height || 0));
        _renderAsDomOverlay(el);
    }

    /* ── Manual cover/contain geometry (mirrors canvas-background.js) */
    function _calcFitGeometry(naturalW, naturalH, boxW, boxH, fit) {
        var imgRatio = naturalW / naturalH;
        var boxRatio = boxW    / boxH;
        var scale, drawW, drawH, offX, offY;

        if (fit === 'cover') {
            scale  = (imgRatio > boxRatio)
                     ? boxH / naturalH   /* height-constrained */
                     : boxW / naturalW;  /* width-constrained  */
        } else if (fit === 'fill') {
            /* stretch to exactly fill the box */
            return { w: boxW, h: boxH, x: 0, y: 0 };
        } else {
            /* contain (default) */
            scale  = (imgRatio > boxRatio)
                     ? boxW / naturalW   /* width-constrained  */
                     : boxH / naturalH;  /* height-constrained */
        }

        drawW = Math.round(naturalW * scale);
        drawH = Math.round(naturalH * scale);
        offX  = Math.round((boxW - drawW) / 2);
        offY  = Math.round((boxH - drawH) / 2);

        return { w: drawW, h: drawH, x: offX, y: offY };
    }

    /* ── DOM OVERLAY ──────────────────────────────────────────────── */
    function _renderAsDomOverlay(el) {
        var canvas = document.getElementById('templateCanvas');
        if (!canvas) { console.warn('[CanvasImage] No #templateCanvas'); return; }
        var container = canvas.parentElement;
        if (!container) { console.warn('[CanvasImage] Canvas has no parent'); return; }

        _removeOverlayById(el.id || el.name);

        var x       = Math.floor(el.x      || 0);
        var y       = Math.floor(el.y      || 0);
        var w       = Math.ceil(el.width   || 0);
        var h       = Math.ceil(el.height  || 0);
        var radius  = el.borderRadius || 0;
        var opacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        var fit     = el.objectFit || 'contain';
        var zIndex  = (el.zIndex != null && el.zIndex !== 'auto' && el.zIndex !== 0)
                      ? parseInt(el.zIndex, 10) || 10
                      : 10;

        if (w <= 0 || h <= 0) {
            console.warn('[CanvasImage] Zero/negative dimensions:', el.name || el.id,
                         w + 'x' + h, '- skipping');
            return;
        }

        /* Ensure container is a positioning context */
        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        /* Optional background colour behind the image */
        if (el.hasBackgroundColor && el.backgroundColor &&
                el.backgroundColor !== 'transparent') {
            var bgPad = el.backgroundPadding || 0;
            var bgDiv = document.createElement('div');
            bgDiv.setAttribute('data-canvas-image-bg', String(el.id || el.name));
            bgDiv.style.position        = 'absolute';
            bgDiv.style.pointerEvents   = 'none';
            bgDiv.style.margin          = '0';
            bgDiv.style.padding         = '0';
            bgDiv.style.left            = (x - bgPad) + 'px';
            bgDiv.style.top             = (y - bgPad) + 'px';
            bgDiv.style.width           = (w + bgPad * 2) + 'px';
            bgDiv.style.height          = (h + bgPad * 2) + 'px';
            bgDiv.style.backgroundColor = el.backgroundColor;
            bgDiv.style.borderRadius    = (el.backgroundRadius || 0) + 'px';
            bgDiv.style.zIndex          = String(zIndex);
            container.appendChild(bgDiv);
            _domOverlays.push(bgDiv);
        }

        /*
         * SHADOW via CSS filter: drop-shadow() on wrap:
         *
         * CSS filter is applied AFTER the element is painted (including after
         * overflow:hidden clipping), so drop-shadow() renders outside the
         * clipped bounds and is never itself clipped — unlike box-shadow which
         * is painted before overflow clipping and gets cut off.
         *
         * This also means the shadow automatically follows the element during
         * CSS animations (slide, bounce, etc.) with zero extra work.
         *
         * This matches how CanvasText applies textShadow:
         *   textShadow = '2px 2px <blur>px <color>'
         * We use the equivalent for images:
         *   filter: drop-shadow(2px 2px <blur>px <color>)
         *
         * Structure in container:
         *   [wrap]  overflow:hidden (clips img) + filter:drop-shadow (shadow)
         *     [img]
         */

        /* ── Border properties ────────────────────────────────────────
           Apply border if borderWidth and borderColor are present.
           borderStyle supports 'dotted' or 'dashed'; anything else
           (including absent/null) falls back to 'solid'.
           box-sizing: border-box keeps the element within w×h bounds
           so the border is drawn inside and does not expand the box.  */
        var borderWidth = (el.borderWidth && el.borderColor) ? parseInt(el.borderWidth, 10) || 0 : 0;
        var borderColor = borderWidth > 0 ? (el.borderColor || 'transparent') : 'transparent';
        var borderStyle = 'solid';
        if (el.borderStyle === 'dotted' || el.borderStyle === 'dashed') {
            borderStyle = el.borderStyle;
        }

        /* ── Outer wrapper — clips image, carries shadow + filters ─── */
        var wrap = document.createElement('div');
        wrap.setAttribute('data-canvas-image-id', String(el.id || el.name));
        wrap.style.position      = 'absolute';
        wrap.style.overflow      = 'hidden';
        wrap.style.pointerEvents = 'none';
        wrap.style.margin        = '0';
        wrap.style.padding       = '0';
        wrap.style.boxSizing     = 'border-box';
        wrap.style.left          = x + 'px';
        wrap.style.top           = y + 'px';
        wrap.style.width         = w + 'px';
        wrap.style.height        = h + 'px';
        wrap.style.borderRadius  = radius + 'px';
        wrap.style.opacity       = String(opacity);
        wrap.style.zIndex        = String(zIndex);

        /* Apply border when borderWidth and borderColor are provided */
        if (borderWidth > 0) {
            wrap.style.borderWidth = borderWidth + 'px';
            wrap.style.borderStyle = borderStyle;
            wrap.style.borderColor = borderColor;
        } else {
            wrap.style.border = 'none';
        }

        /* ── Build filter strings ──────────────────────────────────────
           IMPORTANT: drop-shadow must be on wrap ONLY.
           grayscale/sepia/blur must be on the <img> ONLY.
           If both are on the same element, the colour filters desaturate
           the shadow too — making a green shadowColor turn grey/sepia.
           Separating them ensures shadowColor always renders as specified.

           wrap  → drop-shadow(2px 2px 8px shadowColor)  [never desaturated]
           img   → grayscale / sepia / blur               [affects image only]
           -webkit- prefixes set for LG webOS compatibility.                */

        if (el.dropShadow) {
            var shadowCol  = el.shadowColor || 'rgba(0,0,0,0.6)';
            var shadowBlur = 1;
            var dropVal    = 'drop-shadow(2px 2px ' + shadowBlur + 'px ' + shadowCol + ')';
            wrap.style.webkitFilter = dropVal;
            wrap.style.filter       = dropVal;
        }

        if (el.rotation && el.rotation !== 0) {
            var rot = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform       = rot;
            wrap.style.transform             = rot;
            wrap.style.webkitTransformOrigin = 'center center';
            wrap.style.transformOrigin       = 'center center';
        }

        /* ── Inner <img> — sized/positioned once natural dims are known */
        var img = document.createElement('img');
        img.setAttribute('data-canvas-image-img', String(el.id || el.name));
        img.style.position      = 'absolute';
        img.style.display       = 'block';
        img.style.margin        = '0';
        img.style.padding       = '0';
        img.style.border        = 'none';
        img.style.pointerEvents = 'none';
        /* Initial fill-the-box sizing; corrected once natural size is known */
        img.style.top           = '0';
        img.style.left          = '0';
        img.style.width         = w + 'px';
        img.style.height        = h + 'px';
        /* GPU-composited layer hint — reduces tearing on LG webOS */
        img.style.webkitTransform = 'translate3d(0,0,0)';
        img.style.transform       = 'translate3d(0,0,0)';

        /* ── Image-only filters (grayscale / sepia / blur) ────────────
           Applied on <img> directly — separate from wrap's drop-shadow —
           so the shadow colour is never desaturated by these filters.    */
        var imgFilters = [];
        if (el.grayscale) { imgFilters.push('grayscale(100%)'); }
        if (el.sepia)     { imgFilters.push('sepia(100%)');     }
        if (el.blur)      { imgFilters.push('blur(6px)');       }
        if (imgFilters.length > 0) {
            var imgFilterStr = imgFilters.join(' ');
            img.style.webkitFilter = imgFilterStr;
            img.style.filter       = imgFilterStr;
        }

        img.addEventListener('load', function () {
            /* Recompute geometry now we know the natural image dimensions */
            var nw  = img.naturalWidth  || img.width  || w;
            var nh  = img.naturalHeight || img.height || h;
            var geo = _calcFitGeometry(nw, nh, w, h, fit);

            img.style.width  = geo.w + 'px';
            img.style.height = geo.h + 'px';
            img.style.left   = geo.x + 'px';
            img.style.top    = geo.y + 'px';

            /* Cache for updateClocks() underlay repaint */
            el._loadedImg = img;

            console.log('[CanvasImage] loaded:', el.name || el.id,
                        '| natural:', nw + 'x' + nh,
                        '| drawn:', geo.w + 'x' + geo.h,
                        '| offset:', geo.x + ',' + geo.y,
                        '| fit:', fit);
        });

        img.addEventListener('error', function () {
            console.error('[CanvasImage] load failed:', el.name || el.id,
                          '| src:', el.src);
        });

        img.src = el.src;
        wrap.appendChild(img);

        // Hide until animation fires (prevents flash at natural position on first load)
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            wrap.style.visibility = 'hidden';
        }
        container.appendChild(wrap);
        _domOverlays.push(wrap);

        // Apply CSS animation if configured on this element
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                CanvasAnimation.applyAnimation(el, canvas);
            }
        }

        console.log('[CanvasImage] overlay at', x + ',' + y,
                    w + 'x' + h, 'z:', zIndex, 'fit:', fit);
    }

    /* ── CANVAS DRAW — synchronous underlay repaint for updateClocks() */
    /*
     * Called by CanvasRenderer.updateClocks() when an image element
     * underlaps a clock region. Uses el._loadedImg (set above) — no async.
     *
     * With DOM overlays the primary render() never calls this; it exists
     * for the updateClocks() underlay mechanism. Since image overlays are
     * DOM elements above the canvas they are unaffected by canvas repaints,
     * so this is effectively a no-op in normal operation but kept for safety.
     */
    function _renderOnCanvas(ctx, el) {
        var img = el._loadedImg ||
                  (el.src ? CanvasBase.getCachedImage(el.src) : null);

        if (!img) { return; }

        try {
            ctx.save();

            if (el.hasBackgroundColor && el.backgroundColor &&
                    el.backgroundColor !== 'transparent') {
                var pad = el.backgroundPadding || 0;
                var br  = el.backgroundRadius  || 0;
                ctx.fillStyle = el.backgroundColor;
                if (br > 0) {
                    CanvasBase.roundRect(ctx,
                        (el.x || 0) - pad, (el.y || 0) - pad,
                        (el.width  || 0) + pad * 2,
                        (el.height || 0) + pad * 2, br);
                    ctx.fill();
                } else {
                    ctx.fillRect(
                        (el.x || 0) - pad, (el.y || 0) - pad,
                        (el.width  || 0) + pad * 2,
                        (el.height || 0) + pad * 2);
                }
            }

            ctx.translate(el.x || 0, el.y || 0);
            if (el.rotation) {
                ctx.translate((el.width || 0) / 2, (el.height || 0) / 2);
                ctx.rotate(el.rotation * Math.PI / 180);
                ctx.translate(-(el.width || 0) / 2, -(el.height || 0) / 2);
            }
            ctx.globalAlpha = typeof el.opacity !== 'undefined' ? el.opacity : 1;

            if ((el.borderRadius || 0) > 0) {
                CanvasBase.roundRect(ctx, 0, 0, el.width, el.height, el.borderRadius);
                ctx.clip();
            }

            CanvasBase.drawImageWithFit(ctx, img, 0, 0,
                                        el.width || 0, el.height || 0,
                                        el.objectFit || 'contain');
            ctx.restore();
        } catch (e) {
            console.warn('[CanvasImage] _renderOnCanvas error:', e);
            try { ctx.restore(); } catch (_) {}
        }
    }

    /* ── Helpers ──────────────────────────────────────────────────── */
    function _removeOverlayById(id) {
        var attr = String(id);
        var sel  = '[data-canvas-image-id="' + attr + '"],' +
                   '[data-canvas-image-bg="' + attr + '"]';
        try {
            var els = document.querySelectorAll(sel);
            for (var i = 0; i < els.length; i++) {
                if (els[i].parentNode) els[i].parentNode.removeChild(els[i]);
            }
        } catch (e) {
            console.warn('[CanvasImage] _removeOverlayById error:', e);
        }
    }

    /* ── PUBLIC: cleanup() ────────────────────────────────────────── */
    function cleanup() {
        console.log('[CanvasImage] cleanup() removing', _domOverlays.length, 'overlays');
        for (var i = 0; i < _domOverlays.length; i++) {
            if (_domOverlays[i] && _domOverlays[i].parentNode) {
                _domOverlays[i].parentNode.removeChild(_domOverlays[i]);
            }
        }
        _domOverlays = [];
    }

    return {
        render:          render,
        cleanup:         cleanup,
        _renderOnCanvas: _renderOnCanvas
    };

})();