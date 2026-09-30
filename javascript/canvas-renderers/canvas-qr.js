/**
 * ====================================================================
 * CANVAS QR CODE ELEMENT RENDERER
 * Handles element type "image" / "canvas-image" when qrData is present.
 *
 * ── VARIABLE RESOLUTION ─────────────────────────────────────────────
 *
 *  qrData supports any mix of plain text and {{placeholders}}:
 *
 *    "https://example.com/{{owner_email}}/{{city}}/{{state}}"
 *      → "https://example.com/john@hotel.com/Austin/TX"
 *
 *    "https://example.com"           → used as-is (no placeholders)
 *    "{{owner_email}}"               → "john@hotel.com"
 *    "https://example.com/{{g_name}}/{{city}}" → mixed guest+property
 *
 *  Resolution rules (identical to canvas-text.js):
 *    {{g_xxx}}  → Main.guestInfoData[g_xxx]
 *    {{xxx}}    → Main.deviceProfile.property_detail[xxx]
 *
 *  Unresolved / null / undefined placeholders → replaced with ""
 *  so the final string is always clean before QR generation.
 *
 * ── QR GENERATION ───────────────────────────────────────────────────
 *
 *  Uses qrcode_min.js (same lib as Main.generateQrCode).
 *  Bypasses the library's DOM drawing path (unreliable on LG webOS —
 *  the internal <canvas> is hidden before we can read it).
 *  Instead we: build model → read isDark() matrix → paint our own
 *  <canvas> → mount as DOM overlay (same pattern as CanvasImage).
 *
 * ── VISUAL FEATURES (mirrors canvas-image.js exactly) ───────────────
 *
 *  DROP-SHADOW  : applied via CSS filter:drop-shadow() on the WRAPPER
 *                 div — identical to CanvasImage. This ensures the
 *                 shadow colour is never desaturated by grayscale/sepia.
 *
 *  GRAYSCALE / SEPIA / BLUR : applied via CSS filter on the inner QR
 *                 <canvas> only — keeps shadow colour unaffected.
 *
 *  BORDER       : borderWidth + borderColor + borderStyle on wrapper.
 *                 box-sizing:border-box so border stays inside w×h.
 *
 *  BORDER-RADIUS: clips the wrapper (overflow:hidden propagates to QR).
 *
 *  ROTATION     : CSS transform:rotate() on wrapper.
 *
 *  OPACITY      : on wrapper (affects QR + logo together).
 *
 *  ANIMATION    : wrapper set to visibility:hidden before mounting,
 *                 then CanvasAnimation.applyAnimation(el, canvas)
 *                 is called — same two-line pattern as CanvasImage.
 *                 data-canvas-qr-id attribute is registered in
 *                 canvas-animation.js _findOverlayNodes().
 *
 * ── SUPPORTED ELEMENT PROPERTIES ────────────────────────────────────
 *
 *   QR-specific:
 *     qrData           {string}  Data/URL, supports {{placeholders}}
 *     qrColor          {string}  Dark module colour     default '#000000'
 *     qrBgColor        {string}  Light module colour    default '#ffffff'
 *     qrBgTransparent  {bool}    Skip background fill
 *     margin           {number}  Quiet-zone padding px  default 0
 *     errorLevel       {string}  'L'|'M'|'Q'|'H'        default 'H'
 *     logo             {string}  Centre logo image URL
 *     logoSize         {number}  Logo as fraction 0–1   default 0.2
 *     logoBgColor      {string}  Pill colour behind logo default '#ffffff'
 *     logoPadding      {number}  Padding around logo px  default 4
 *
 *   Visual (same as canvas-image.js):
 *     width, height    {number}  Element size px (already scaled)
 *     x, y             {number}  Position px
 *     zIndex           {number}
 *     opacity          {number}  0–1
 *     borderRadius     {number}  px
 *     rotation         {number}  degrees
 *     borderWidth      {number}  px
 *     borderColor      {string}
 *     borderStyle      {string}  'solid'|'dotted'|'dashed'
 *     dropShadow       {bool}    Enable drop-shadow on wrapper
 *     shadowColor      {string}  Shadow colour  default 'rgba(0,0,0,0.6)'
 *     grayscale        {bool}    Grayscale filter on QR canvas
 *     sepia            {bool}    Sepia filter on QR canvas
 *     blur             {bool}    Blur filter on QR canvas
 *     animation        {object}  CanvasAnimation config object
 * ====================================================================
 */

var CanvasQr = (function () {
    'use strict';

    /* ── module-level overlay registry (mirrors CanvasImage) ────────── */
    var _domOverlays = [];

    /* ================================================================
     * PUBLIC: render(ctx, el)
     * ================================================================ */
    function render(ctx, el) {
        if (!el.qrData) {
            console.warn('[CanvasQr] Missing qrData on element:', el.name || el.id);
            return;
        }

        /* ── Step 1: resolve all {{placeholders}} in qrData ─────────── */
        var resolvedData = resolveAllVariables(String(el.qrData));

        if (!resolvedData || resolvedData.trim() === '') {
            console.warn('[CanvasQr] qrData is empty after variable resolution.',
                         'Original:', el.qrData, '| Element:', el.name || el.id);
            return;
        }

        resolvedData = resolvedData.trim();

        console.log('[CanvasQr] Rendering element  :', el.name || el.id);
        console.log('[CanvasQr]   raw qrData        :', el.qrData);
        console.log('[CanvasQr]   resolved qrData   :', resolvedData);
        console.log('[CanvasQr]   position          :', (el.x || 0) + ',' + (el.y || 0));
        console.log('[CanvasQr]   size              :', (el.width || 0) + 'x' + (el.height || 0));

        /* ── Step 2: generate QR and mount DOM overlay ───────────────── */
        _renderAsDomOverlay(el, resolvedData);
    }

    /* ================================================================
     * VARIABLE RESOLUTION — identical logic to canvas-text.js
     *
     *   {{g_xxx}} → Main.guestInfoData[g_xxx]
     *   {{xxx}}   → Main.deviceProfile.property_detail[xxx]
     *
     * Unresolved / null / undefined → ""  (never embeds raw {{…}})
     * ================================================================ */
    function _resolveSingleKey(match, key, source, label) {
        if (!source) {
            console.warn('[CanvasQr] ' + label + ' unavailable — replacing "' + match + '" with ""');
            return '';
        }
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            var value = source[key];
            if (value === null || value === undefined) {
                console.log('[CanvasQr] ' + label + '["' + key + '"] is null/undefined → ""');
                return '';
            }
            console.log('[CanvasQr] Resolved "' + match + '" → "' + value + '" (from ' + label + ')');
            return String(value);
        }
        console.warn('[CanvasQr] Key "' + key + '" not found in ' + label + ' → ""');
        return '';
    }

    function resolveAllVariables(text) {
        if (!text || text.indexOf('{{') === -1) { return text; }

        var guestInfo      = null;
        var propertyDetail = null;

        try {
            if (typeof Main !== 'undefined') {
                guestInfo      = Main.guestInfoData || null;
                propertyDetail = (Main.deviceProfile && Main.deviceProfile.property_detail)
                                 ? Main.deviceProfile.property_detail : null;
            }
        } catch (e) {
            console.warn('[CanvasQr] Error accessing Main data sources:', e);
        }

        var resolved = text.replace(/\{\{([^}]+)\}\}/g, function (match, key) {
            key = key.trim(); // handles "{{ owner_email }}" style spacing
            if (key.indexOf('g_') === 0) {
                return _resolveSingleKey(match, key, guestInfo, 'guestInfoData');
            }
            return _resolveSingleKey(match, key, propertyDetail, 'property_detail');
        });

        console.log('[CanvasQr] resolveAllVariables:', text, '→', resolved);
        return resolved;
    }

    /* ================================================================
     * MAP errorLevel string → QRCode.CorrectLevel constant
     * ================================================================ */
    function _getCorrectLevel(errorLevel) {
        if (typeof QRCode === 'undefined' || !QRCode.CorrectLevel) { return 2; /* H */ }
        var map = {
            'L': QRCode.CorrectLevel.L, 'M': QRCode.CorrectLevel.M,
            'Q': QRCode.CorrectLevel.Q, 'H': QRCode.CorrectLevel.H
        };
        var lvl = String(errorLevel || 'H').toUpperCase();
        return (lvl in map) ? map[lvl] : QRCode.CorrectLevel.H;
    }

    /* ================================================================
     * BUILD QR MODULE MATRIX
     *
     * Constructs a QRCode object using a throwaway <span> purely to
     * obtain the internal model (_oQRCode), then reads every module
     * cell via isDark(row, col).  The library's DOM drawing path is
     * never used — it is unreliable on LG webOS.
     *
     * @returns {{ modules: boolean[][], count: number } | null}
     * ================================================================ */
    function _buildQrMatrix(data, correctLevel) {
        if (typeof QRCode === 'undefined') {
            console.error('[CanvasQr] QRCode library (qrcode_min.js) not loaded');
            return null;
        }

        var dummy = document.createElement('span');
        var qrObj = null;

        try {
            qrObj = new QRCode(dummy, {
                text:         data,
                width:        10,   /* size irrelevant — we paint ourselves */
                height:       10,
                correctLevel: correctLevel
            });
        } catch (e) {
            console.error('[CanvasQr] QRCode construction error:', e, '| data:', data);
            return null;
        }

        var model = qrObj._oQRCode;
        if (!model) {
            console.error('[CanvasQr] _oQRCode model is null after construction');
            return null;
        }

        var count   = model.getModuleCount();
        var modules = [];
        for (var r = 0; r < count; r++) {
            modules[r] = [];
            for (var c = 0; c < count; c++) {
                modules[r][c] = model.isDark(r, c);
            }
        }

        console.log('[CanvasQr] Matrix built:', count + 'x' + count, 'modules');
        return { modules: modules, count: count };
    }

    /* ================================================================
     * PAINT QR MODULE MATRIX onto targetCanvas
     *
     * Sub-pixel rounding: compute cell edges by rounding positions
     * rather than sizes, so adjacent dark cells share an exact boundary
     * and no hairline gaps appear between them.
     * ================================================================ */
    function _paintQrToCanvas(targetCanvas, matrix, el) {
        var w   = targetCanvas.width;
        var h   = targetCanvas.height;
        var ctx = targetCanvas.getContext('2d');
        if (!ctx) {
            console.warn('[CanvasQr] Could not get 2d context from QR canvas');
            return;
        }

        var count       = matrix.count;
        var modules     = matrix.modules;
        var fgColor     = el.qrColor   || '#000000';
        var bgColor     = el.qrBgColor || '#ffffff';
        var transparent = !!el.qrBgTransparent;

        ctx.clearRect(0, 0, w, h);

        if (!transparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, w, h);
        }

        var cellW = w / count;
        var cellH = h / count;
        ctx.fillStyle = fgColor;

        for (var r = 0; r < count; r++) {
            for (var c = 0; c < count; c++) {
                if (modules[r][c]) {
                    var x1 = Math.round(c * cellW);
                    var y1 = Math.round(r * cellH);
                    var x2 = Math.round((c + 1) * cellW);
                    var y2 = Math.round((r + 1) * cellH);
                    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
                }
            }
        }
    }

    /* ================================================================
     * PAINT LOGO onto the QR canvas (async — fires on Image.onload)
     * ================================================================ */
    function _paintLogoToCanvas(targetCanvas, el) {
        if (!el.logo) { return; }

        var w   = targetCanvas.width;
        var h   = targetCanvas.height;
        var ctx = targetCanvas.getContext('2d');
        if (!ctx) { return; }

        var logoFraction = (typeof el.logoSize === 'number' &&
                            el.logoSize > 0 && el.logoSize <= 1)
                           ? el.logoSize : 0.2;
        var logoPadding  = typeof el.logoPadding === 'number' ? el.logoPadding : 4;
        var logoBgColor  = el.logoBgColor || '#ffffff';

        var logoSize  = Math.round(Math.min(w, h) * logoFraction);
        var logoTotal = logoSize + logoPadding * 2;
        var logoLeft  = Math.round((w - logoTotal) / 2);
        var logoTop   = Math.round((h - logoTotal) / 2);
        var br        = Math.round(logoTotal / 5);

        var img = new Image();

        img.onload = function () {
            /* Rounded background pill */
            ctx.fillStyle = logoBgColor;
            ctx.beginPath();
            ctx.moveTo(logoLeft + br, logoTop);
            ctx.lineTo(logoLeft + logoTotal - br, logoTop);
            ctx.quadraticCurveTo(logoLeft + logoTotal, logoTop,
                                 logoLeft + logoTotal, logoTop + br);
            ctx.lineTo(logoLeft + logoTotal, logoTop + logoTotal - br);
            ctx.quadraticCurveTo(logoLeft + logoTotal, logoTop + logoTotal,
                                 logoLeft + logoTotal - br, logoTop + logoTotal);
            ctx.lineTo(logoLeft + br, logoTop + logoTotal);
            ctx.quadraticCurveTo(logoLeft, logoTop + logoTotal,
                                 logoLeft, logoTop + logoTotal - br);
            ctx.lineTo(logoLeft, logoTop + br);
            ctx.quadraticCurveTo(logoLeft, logoTop, logoLeft + br, logoTop);
            ctx.closePath();
            ctx.fill();

            ctx.drawImage(img,
                logoLeft + logoPadding, logoTop + logoPadding,
                logoSize, logoSize);

            console.log('[CanvasQr] Logo painted:', logoTotal + 'x' + logoTotal,
                        'at', logoLeft + ',' + logoTop);
        };

        img.onerror = function () {
            console.warn('[CanvasQr] Logo image failed to load:', el.logo);
        };

        img.src = el.logo;
    }

    /* ================================================================
     * DOM OVERLAY RENDERER
     *
     * Structure (mirrors CanvasImage exactly):
     *
     *   [wrap div]  position:absolute — carries:
     *                 • overflow:hidden  (clips QR to borderRadius)
     *                 • filter:drop-shadow()  (shadow — never desaturated)
     *                 • opacity, zIndex, rotation, border
     *     [qrCanvas]  position:absolute — carries:
     *                   • filter: grayscale/sepia/blur  (image-only filters)
     *                   • GPU hint: translate3d(0,0,0)
     *
     * WHY shadow on wrap and grayscale/sepia/blur on inner canvas:
     *   If both sets of filters are on the same element, CSS processes
     *   them in order, so grayscale() would desaturate the shadow too —
     *   a red shadowColor would render grey. Separating them (exactly
     *   as CanvasImage does with its <img>) keeps the shadow colour
     *   exactly as configured regardless of which image filters are on.
     * ================================================================ */
    function _renderAsDomOverlay(el, resolvedData) {
        var templateCanvas = document.getElementById('templateCanvas');
        if (!templateCanvas) {
            console.warn('[CanvasQr] #templateCanvas not found');
            return;
        }
        var container = templateCanvas.parentElement;
        if (!container) {
            console.warn('[CanvasQr] templateCanvas has no parent element');
            return;
        }

        _removeOverlayById(el.id || el.name);

        /* ── Dimensions ─────────────────────────────────────────────── */
        var x       = Math.floor(el.x      || 0);
        var y       = Math.floor(el.y      || 0);
        var w       = Math.ceil(el.width   || 200);
        var h       = Math.ceil(el.height  || 200);
        var radius  = el.borderRadius || 0;
        var opacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        var zIndex  = (el.zIndex != null && el.zIndex !== 'auto' && el.zIndex !== 0)
                      ? parseInt(el.zIndex, 10) || 10
                      : 10;
        var margin  = typeof el.margin === 'number' ? Math.max(0, el.margin) : 0;

        if (w <= 0 || h <= 0) {
            console.warn('[CanvasQr] Zero/negative dimensions on', el.name || el.id,
                         '(' + w + 'x' + h + ') — skipping');
            return;
        }

        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        /* ── Border (mirrors CanvasImage exactly) ────────────────────── */
        var borderWidth = (el.borderWidth && el.borderColor)
                          ? parseInt(el.borderWidth, 10) || 0 : 0;
        var borderColor = borderWidth > 0 ? (el.borderColor || 'transparent') : 'transparent';
        var borderStyle = 'solid';
        if (el.borderStyle === 'dotted' || el.borderStyle === 'dashed') {
            borderStyle = el.borderStyle;
        }

        /* ── Outer wrapper ───────────────────────────────────────────── */
        var wrap = document.createElement('div');
        wrap.setAttribute('data-canvas-qr-id', String(el.id || el.name));
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

        if (borderWidth > 0) {
            wrap.style.borderWidth = borderWidth + 'px';
            wrap.style.borderStyle = borderStyle;
            wrap.style.borderColor = borderColor;
        } else {
            wrap.style.border = 'none';
        }

        /* Background fill (shown when qrBgTransparent, fills quiet zone) */
        if (!el.qrBgTransparent) {
            wrap.style.backgroundColor = el.qrBgColor || '#ffffff';
        }

        /* ── DROP-SHADOW on wrapper (mirrors CanvasImage) ────────────
           Must live on wrap — NOT on the inner qrCanvas.
           If it were on qrCanvas alongside grayscale/sepia, those
           filters would desaturate the shadow colour as well.          */
        if (el.dropShadow) {
            var shadowCol  = el.shadowColor || 'rgba(0,0,0,0.6)';
            var shadowBlur = 1;
            var dropVal    = 'drop-shadow(2px 2px ' + shadowBlur + 'px ' + shadowCol + ')';
            wrap.style.webkitFilter = dropVal;
            wrap.style.filter       = dropVal;
        }

        /* ── Rotation on wrapper ─────────────────────────────────────── */
        if (el.rotation && el.rotation !== 0) {
            var rot = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform       = rot;
            wrap.style.transform             = rot;
            wrap.style.webkitTransformOrigin = 'center center';
            wrap.style.transformOrigin       = 'center center';
        }

        /* ── Build QR module matrix ───────────────────────────────────── */
        var correctLevel = _getCorrectLevel(el.errorLevel);
        var matrix       = _buildQrMatrix(resolvedData, correctLevel);

        if (!matrix) {
            console.error('[CanvasQr] Matrix build failed — element not rendered:',
                          el.name || el.id);
            return;
        }

        /* ── Create QR <canvas> inside wrapper ───────────────────────── */
        var qrW = Math.max(10, w - margin * 2);
        var qrH = Math.max(10, h - margin * 2);

        var qrCanvas        = document.createElement('canvas');
        qrCanvas.width      = qrW;
        qrCanvas.height     = qrH;
        qrCanvas.style.position = 'absolute';
        qrCanvas.style.left     = margin + 'px';
        qrCanvas.style.top      = margin + 'px';
        qrCanvas.style.width    = qrW + 'px';
        qrCanvas.style.height   = qrH + 'px';
        qrCanvas.style.display  = 'block';
        qrCanvas.style.margin   = '0';
        qrCanvas.style.padding  = '0';

        /* ── GRAYSCALE / SEPIA / BLUR on inner qrCanvas (mirrors CanvasImage <img>)
           Applied here — NOT on wrap — so the drop-shadow on wrap is
           never affected by these colour/blur filters.                            */
        var qrFilters = [];
        if (el.grayscale) { qrFilters.push('grayscale(100%)'); }
        if (el.sepia)     { qrFilters.push('sepia(100%)');     }
        if (el.blur)      { qrFilters.push('blur(6px)');       }
        if (qrFilters.length > 0) {
            var qrFilterStr = qrFilters.join(' ');
            qrCanvas.style.webkitFilter = qrFilterStr;
            qrCanvas.style.filter       = qrFilterStr;
        }

        /* GPU compositing hint — reduces tearing on LG webOS */
        qrCanvas.style.webkitTransform = 'translate3d(0,0,0)';
        qrCanvas.style.transform       = 'translate3d(0,0,0)';

        /* Paint QR modules synchronously */
        _paintQrToCanvas(qrCanvas, matrix, el);

        /* Paint logo asynchronously on top (QR is already visible while logo loads) */
        if (el.logo) {
            _paintLogoToCanvas(qrCanvas, el);
        }

        wrap.appendChild(qrCanvas);

        /* ── Animation: hide until CSS anim fires ────────────────────────
           Mirrors CanvasImage: set visibility:hidden before appending,
           then call CanvasAnimation.applyAnimation() after appendChild.
           Double-rAF inside applyAnimation() flips it to visible at the
           exact right moment — no flash at natural position.              */
        if (el.animation && el.animation.enabled &&
                el.animation.type && el.animation.type !== 'none') {
            wrap.style.visibility = 'hidden';
        }

        container.appendChild(wrap);
        _domOverlays.push(wrap);

        /* ── Apply CSS animation (mirrors CanvasImage exactly) ───────── */
        if (el.animation && el.animation.enabled &&
                el.animation.type && el.animation.type !== 'none') {
            if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                CanvasAnimation.applyAnimation(el, templateCanvas);
            }
        }

        console.log('[CanvasQr] ✅ QR rendered:', el.name || el.id,
                    '| pos:', x + ',' + y,
                    '| size:', w + 'x' + h,
                    '| modules:', matrix.count + 'x' + matrix.count,
                    '| shadow:', !!el.dropShadow,
                    '| filters:', qrFilters.join('+') || 'none');
    }

    /* ================================================================
     * HELPERS
     * ================================================================ */
    function _removeOverlayById(id) {
        var attr = String(id);
        try {
            var els = document.querySelectorAll('[data-canvas-qr-id="' + attr + '"]');
            for (var i = 0; i < els.length; i++) {
                if (els[i].parentNode) els[i].parentNode.removeChild(els[i]);
            }
        } catch (e) {
            console.warn('[CanvasQr] _removeOverlayById error:', e);
        }
    }

    /* ================================================================
     * PUBLIC: cleanup()
     * Called by CanvasRenderer at the top of every fresh render().
     * ================================================================ */
    function cleanup() {
        console.log('[CanvasQr] cleanup() — removing', _domOverlays.length, 'overlays');
        for (var i = 0; i < _domOverlays.length; i++) {
            if (_domOverlays[i] && _domOverlays[i].parentNode) {
                _domOverlays[i].parentNode.removeChild(_domOverlays[i]);
            }
        }
        _domOverlays = [];
    }

    /* ================================================================
     * PUBLIC: hasQrData(el)
     * Used by CanvasRenderer.renderElement() to route image /
     * canvas-image elements with qrData to CanvasQr instead of CanvasImage.
     * ================================================================ */
    function hasQrData(el) {
        return el && typeof el.qrData === 'string' && el.qrData.length > 0;
    }

    /* Expose resolveAllVariables as a console test hook */
    return {
        render:              render,
        cleanup:             cleanup,
        hasQrData:           hasQrData,
        resolveAllVariables: resolveAllVariables
    };

})();