/**
 * ====================================================================
 * CANVAS TEXT ELEMENT RENDERER - FIXED FOR CANVAS SCALER
 * Properly handles text positioning with scaled elements
 *
 * Placeholder substitution rules:
 *   {{g_xxx}}  → resolved from Main.guestInfoData         (guest info)
 *   {{xxx}}    → resolved from Main.deviceProfile.property_detail  (property info)
 *              (any placeholder NOT starting with g_ is treated as property)
 * ====================================================================
 */
var CanvasText = (function() {
    'use strict';

    /**
     * Resolves a single placeholder value from the given data object.
     * Returns '' if key exists but is null/undefined.
     * Returns the original {{match}} string if key is not found.
     *
     * @param {string} match  - Full placeholder e.g. "{{g_name}}"
     * @param {string} key    - Extracted key e.g. "g_name"
     * @param {object} source - Data object to look up the key in
     * @param {string} label  - Source label for console logging
     * @returns {string}
     */
    function resolvePlaceholder(match, key, source, label) {
        if (!source) {
            console.warn('[CanvasText] ' + label + ' not available, cannot resolve "' + match + '"');
            return match;
        }
        if (key in source) {
            var value = source[key];
            if (value === null || value === undefined) {
                console.log('[CanvasText] ' + label + ' "' + key + '" is null → ""');
                return '';
            }
            console.log('[CanvasText] Resolved "' + match + '" from ' + label + ' => "' + value + '"');
            return String(value);
        }
        console.warn('[CanvasText] "' + key + '" not found in ' + label + ', leaving as-is');
        return match;
    }

    /**
     * Resolves all {{...}} placeholders in a text string.
     *
     * Two sources are consulted depending on the key prefix:
     *   - Keys starting with "g_"  → Main.guestInfoData
     *   - Any other key             → Main.deviceProfile.property_detail
     *
     * Null/undefined values become empty strings.
     * Unknown keys are left as the original placeholder.
     *
     * @param {string} text
     * @returns {string}
     */
    function resolveAllVariables(text) {
        if (!text || text.indexOf('{{') === -1) {
            return text; // Fast path: no placeholders present
        }

        // Fetch both data sources once (tolerates missing gracefully)
        var guestInfo = null;
        var propertyDetail = null;
        var room_number = null;

        try {
            if (typeof Main !== 'undefined') {
                guestInfo      = Main.guestInfoData || null;
                propertyDetail = (Main.deviceProfile && Main.deviceProfile.property_detail)
                                 ? Main.deviceProfile.property_detail
                                 : null;
                room_number   = (Main.deviceProfile && Main.deviceProfile.room_number)
                                 ? Main.deviceProfile.room_number
                                 : null;
            }
        } catch (e) {
            console.warn('[CanvasText] Error accessing Main data sources:', e);
        }

        // Replace every {{key}} occurrence
        var resolved = text.replace(/\{\{([^}]+)\}\}/g, function(match, key) {
            key = key.trim(); // safety trim

            console.log("key--------------------->", key)

            if (key.indexOf('g_') === 0) {
                // --- Guest info variable ---
                return resolvePlaceholder(match, key, guestInfo, 'guestInfoData');
            } else if(key === 'room_number') {
                return String(room_number || '');
            } else {
                // --- Property detail variable ---
                return resolvePlaceholder(match, key, propertyDetail, 'property_detail');
            }
        });

        return resolved;
    }

    function render(ctx, el) {
        if (!el.text) return;

        // --- VARIABLE SUBSTITUTION (guest + property) ---
        var renderEl = el;
        if (el.text.indexOf('{{') !== -1) {
            renderEl = {};
            for (var k in el) {
                if (el.hasOwnProperty(k)) renderEl[k] = el[k];
            }
            renderEl.text = resolveAllVariables(el.text);
        }
        // ------------------------------------

        console.log('[CanvasText] Rendering:', renderEl.name || renderEl.id, 'Size:', renderEl.width + 'x' + renderEl.height);

        // VIDEO BACKGROUND or ANIMATION ENABLED: render as DOM overlay.
        // CSS animations require DOM elements - canvas pixels cannot be animated.
        var _hasAnimation = renderEl.animation && renderEl.animation.enabled &&
                            renderEl.animation.type && renderEl.animation.type !== 'none';
        if (_hasAnimation || (typeof CanvasVideoBgHelper !== 'undefined' && CanvasVideoBgHelper.isVideoBg())) {
            _renderAsDom(renderEl);
            return;
        }

        ctx.save();
        CanvasBase.applyTransformations(ctx, renderEl);

        // Background
        if (renderEl.backgroundType !== 'transparent' && renderEl.backgroundColor && renderEl.backgroundColor !== 'transparent') {
            CanvasBase.drawElementBackground(ctx, renderEl);
        }

        // Font setup
        var fontString = getFontString(renderEl);
        ctx.font = fontString;
        console.log('[CanvasText] Font string:', fontString);

        ctx.fillStyle = renderEl.color || '#000000';

        // Text alignment
        ctx.textAlign = renderEl.textAlign || 'left';

        // Use 'middle' baseline for proper vertical centering
        ctx.textBaseline = 'middle';

        // Calculate position with proper vertical centering
        var textX = 0;
        var textY = renderEl.height / 2;

        // Handle padding
        var paddingLeft  = renderEl.paddingLeft  || 0;
        var paddingRight = renderEl.paddingRight || 0;

        // Adjust X based on alignment
        if (renderEl.textAlign === 'center') {
            textX = renderEl.width / 2;
        } else if (renderEl.textAlign === 'right') {
            textX = renderEl.width - paddingRight;
        } else {
            textX = paddingLeft;
        }

        console.log('[CanvasText] Position: x=' + textX.toFixed(2) + ', y=' + textY.toFixed(2) +
                   ', align=' + ctx.textAlign + ', baseline=' + ctx.textBaseline +
                   ', fontFamily=' + renderEl.fontFamily);

        // Apply letter spacing if specified
        if (renderEl.letterSpacing) {
            var spacing = parseFloat(String(renderEl.letterSpacing).replace('px', ''));
            if (!isNaN(spacing) && spacing !== 0) {
                drawTextWithLetterSpacing(ctx, renderEl.text, textX, textY, spacing, renderEl, fontString);
            } else {
                drawStyledText(ctx, renderEl, textX, textY);
            }
        } else {
            drawStyledText(ctx, renderEl, textX, textY);
        }

        ctx.restore();
        console.log('[CanvasText] ✅ Text rendered:', renderEl.text);
    }

    function getFontString(el) {
        var fontStyle  = el.fontStyle || 'normal';
        var fontSize   = el.fontSize  || 16;

        // Use CanvasFontLoader helpers when available so that:
        //   • composite families like "'JetBrains Mono', sans-serif" are cleaned to "JetBrains Mono"
        //   • numeric weights like "600" / "800" are normalised to values LG WebKit handles
        var fontWeight, fontFamily;

        if (typeof CanvasFontLoader !== 'undefined') {
            fontWeight = CanvasFontLoader.normalizeFontWeight(el.fontWeight);
            fontFamily = CanvasFontLoader.normalizeFontFamily(el.fontFamily);
        } else {
            fontWeight = el.fontWeight || 'normal';
            fontFamily = el.fontFamily || 'Arial';
            // Strip existing quotes / fallback stack (legacy path)
            fontFamily = fontFamily.split(',')[0].replace(/^['"\s]+|['"\s]+$/g, '') || 'Arial';
        }

        // Canvas ctx.font requires multi-word family names to be quoted
        if (fontFamily.indexOf(' ') !== -1) {
            fontFamily = '"' + fontFamily + '"';
        }

        return fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px ' + fontFamily;
    }

    /**
     * Breaks text into lines that fit within maxWidth.
     * Respects existing newline characters (\n) in the text.
     */
    function wrapText(ctx, text, maxWidth) {
        var lines = [];
        // Split on explicit newlines first
        var paragraphs = text.split('\n');
        for (var p = 0; p < paragraphs.length; p++) {
            var words = paragraphs[p].split(' ');
            var currentLine = '';
            for (var w = 0; w < words.length; w++) {
                var testLine = currentLine ? currentLine + ' ' + words[w] : words[w];
                var testWidth = ctx.measureText(testLine).width;
                if (testWidth > maxWidth && currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = words[w];
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);
        }
        return lines;
    }

    function drawStyledText(ctx, el, x, y) {
        var padding     = el.backgroundPadding || 0;
        var maxWidth    = el.width - (padding * 2);
        var fontSize    = el.fontSize || 16;
        var lineHeight  = fontSize * 1.4;

        // Check if text needs wrapping
        var singleLineWidth = ctx.measureText(el.text).width;
        var needsWrap = singleLineWidth > maxWidth;

        if (!needsWrap) {
            // Single-line fast path (original behaviour)
            CanvasBase.applyTextShadow(ctx, el);
            if (el.textStroke) {
                ctx.strokeStyle = el.textStrokeColor || '#000000';
                ctx.lineWidth   = el.textStrokeWidth  || 1;
                ctx.strokeText(el.text, x, y);
            }
            ctx.fillText(el.text, x, y);
            CanvasBase.resetTextShadow(ctx);
            if (el.textDecoration === 'underline') {
                drawUnderline(ctx, el, x, y);
            }
            return;
        }

        // --- Multi-line word-wrap path ---
        var lines      = wrapText(ctx, el.text, maxWidth);
        var totalHeight = lines.length * lineHeight;
        // Start Y so the block of lines is vertically centred in el.height
        var startY     = (el.height / 2) - (totalHeight / 2) + (lineHeight / 2);

        CanvasBase.applyTextShadow(ctx, el);

        for (var i = 0; i < lines.length; i++) {
            var lineY = startY + i * lineHeight;
            if (el.textStroke) {
                ctx.strokeStyle = el.textStrokeColor || '#000000';
                ctx.lineWidth   = el.textStrokeWidth  || 1;
                ctx.strokeText(lines[i], x, lineY);
            }
            ctx.fillText(lines[i], x, lineY);
        }

        CanvasBase.resetTextShadow(ctx);
    }

    function drawTextWithLetterSpacing(ctx, text, x, y, spacing, el, fontString) {
        var chars    = text.split('');
        var currentX = x;

        if (ctx.textAlign === 'center') {
            var totalWidth = 0;
            ctx.font = fontString;
            for (var j = 0; j < chars.length; j++) {
                totalWidth += ctx.measureText(chars[j]).width;
            }
            totalWidth += spacing * (chars.length - 1);
            currentX = x - (totalWidth / 2);
        } else if (ctx.textAlign === 'right') {
            var totalWidth = 0;
            ctx.font = fontString;
            for (var j = 0; j < chars.length; j++) {
                totalWidth += ctx.measureText(chars[j]).width;
            }
            totalWidth += spacing * (chars.length - 1);
            currentX = x - totalWidth;
        }

        var originalAlign = ctx.textAlign;
        ctx.textAlign = 'left';
        ctx.font = fontString;

        CanvasBase.applyTextShadow(ctx, el);

        for (var i = 0; i < chars.length; i++) {
            if (el.textStroke) {
                ctx.strokeStyle = el.textStrokeColor || '#000000';
                ctx.lineWidth   = el.textStrokeWidth  || 1;
                ctx.strokeText(chars[i], currentX, y);
            }

            ctx.fillText(chars[i], currentX, y);

            var charWidth = ctx.measureText(chars[i]).width;
            currentX += charWidth + spacing;
        }

        CanvasBase.resetTextShadow(ctx);
        ctx.textAlign = originalAlign;
    }

    function drawUnderline(ctx, el, x, y) {
        var textWidth = ctx.measureText(el.text).width;
        var fontSize  = el.fontSize || 16;

        var underlineY = y + (fontSize / 2) + 2;

        var startX = x;
        var endX   = x + textWidth;

        if (ctx.textAlign === 'center') {
            startX = x - (textWidth / 2);
            endX   = x + (textWidth / 2);
        } else if (ctx.textAlign === 'right') {
            startX = x - textWidth;
            endX   = x;
        }

        ctx.strokeStyle = el.color || '#000000';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(startX, underlineY);
        ctx.lineTo(endX, underlineY);
        ctx.stroke();
    }


    /* ── DOM overlay for video background mode ─────────────────── */
    var _textDomOverlays = [];

    function _renderAsDom(el) {
        var container = (typeof CanvasVideoBgHelper !== 'undefined')
            ? CanvasVideoBgHelper.getContainer()
            : document.getElementById('our-hotel-container') || document.body;

        var elId = String(el.id || el.name || Date.now());
        // Remove stale overlay
        var stale = document.querySelectorAll('[data-canvas-text-id="' + elId + '"]');
        for (var s = 0; s < stale.length; s++) {
            if (stale[s].parentNode) stale[s].parentNode.removeChild(stale[s]);
        }

        var x       = Math.floor(el.x      || 0);
        var y       = Math.floor(el.y      || 0);
        var w       = Math.ceil(el.width   || 100);
        var h       = Math.ceil(el.height  || 40);
        var opacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        var zIndex  = (el.zIndex && el.zIndex !== 'auto') ? el.zIndex : 10;
        var fontSize  = el.fontSize  || 16;
        var fontStyle = el.fontStyle || 'normal';

        // Normalise family + weight the same way as canvas path
        var fontFamily, fontWeight;
        if (typeof CanvasFontLoader !== 'undefined') {
            fontFamily = CanvasFontLoader.normalizeFontFamily(el.fontFamily);
            fontWeight = CanvasFontLoader.normalizeFontWeight(el.fontWeight);
        } else {
            fontFamily = (el.fontFamily || 'Arial').split(',')[0].replace(/^['"\s]+|['"\s]+$/g, '') || 'Arial';
            fontWeight = el.fontWeight || 'normal';
        }
        var color      = el.color      || '#000000';
        var textAlign  = el.textAlign  || 'left';
        var paddingLeft  = el.paddingLeft  || 0;
        var paddingRight = el.paddingRight || 0;

        // Background
        if (el.backgroundType !== 'transparent' && el.backgroundColor &&
            el.backgroundColor !== 'transparent') {
            var bgDiv = document.createElement('div');
            bgDiv.setAttribute('data-canvas-text-id', elId + '-bg');
            bgDiv.style.cssText = 'position:absolute;pointer-events:none;margin:0;padding:0;';
            bgDiv.style.left            = x + 'px';
            bgDiv.style.top             = y + 'px';
            bgDiv.style.width           = w + 'px';
            bgDiv.style.height          = h + 'px';
            bgDiv.style.backgroundColor = el.backgroundColor;
            bgDiv.style.borderRadius    = (el.borderRadius || 0) + 'px';
            bgDiv.style.zIndex          = String(zIndex);
            bgDiv.setAttribute('data-canvas-text-id', elId);
            container.appendChild(bgDiv);
            _textDomOverlays.push(bgDiv);
        }

        var bgPadding = el.backgroundPadding || 0;

        var div = document.createElement('div');
        div.setAttribute('data-canvas-text-id', elId);
        div.style.cssText = 'position:absolute;pointer-events:none;margin:0;overflow:visible;box-sizing:border-box;';
        div.style.left          = x + 'px';
        div.style.top           = y + 'px';
        div.style.width         = w + 'px';
        div.style.minHeight     = h + 'px';
        div.style.height        = 'auto';
        div.style.opacity       = String(opacity);
        div.style.zIndex        = String(zIndex);
        div.style.display       = 'flex';
        div.style.alignItems    = 'center';
        div.style.paddingLeft   = (paddingLeft  || bgPadding) + 'px';
        div.style.paddingRight  = (paddingRight || bgPadding) + 'px';
        div.style.paddingTop    = bgPadding + 'px';
        div.style.paddingBottom = bgPadding + 'px';
        div.style.borderRadius  = (el.borderRadius || 0) + 'px';

        if (el.rotation && el.rotation !== 0) {
            div.style.transform       = 'rotate(' + el.rotation + 'deg)';
            div.style.webkitTransform = 'rotate(' + el.rotation + 'deg)';
            div.style.transformOrigin = 'center center';
        }

        var span = document.createElement('span');
        span.textContent   = el.text;
        span.style.cssText = 'display:block;width:100%;margin:0;padding:0;white-space:pre-wrap;word-break:break-word;word-wrap:break-word;overflow-wrap:break-word;';
        span.style.fontSize   = fontSize + 'px';
        span.style.fontFamily = fontFamily;
        span.style.fontWeight = fontWeight;
        span.style.fontStyle  = fontStyle;
        span.style.color      = color;
        span.style.textAlign  = textAlign;
        span.style.lineHeight = '1.2';
        if (el.letterSpacing) {
            span.style.letterSpacing = el.letterSpacing;
        }
        if (el.textDecoration) {
            span.style.textDecoration = el.textDecoration;
        }
        if (el.textStroke && el.textStrokeColor) {
            var strokeWidth = el.textStrokeWidth || 1;
            span.style.webkitTextStroke = strokeWidth + 'px ' + el.textStrokeColor;
            span.style.textStroke       = strokeWidth + 'px ' + el.textStrokeColor;
        }
        if (el.textShadow) {
            var shadowBlur  = (typeof el.textShadowBlur  !== 'undefined') ? el.textShadowBlur  : 4;
            var shadowColor = el.textShadowColor || '#000000';
            span.style.textShadow = '2px 2px ' + shadowBlur + 'px ' + shadowColor;
        }

        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        div.appendChild(span);
        // Hide until animation fires (prevents flash at natural position on first load)
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            div.style.visibility = 'hidden';
        }
        container.appendChild(div);
        _textDomOverlays.push(div);

        // Apply CSS animation if configured on this element
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                CanvasAnimation.applyAnimation(el, null);
            }
        }

        console.log('[CanvasText] DOM overlay created:', el.name || el.id);
    }

    function cleanup() {
        for (var i = 0; i < _textDomOverlays.length; i++) {
            if (_textDomOverlays[i] && _textDomOverlays[i].parentNode) {
                _textDomOverlays[i].parentNode.removeChild(_textDomOverlays[i]);
            }
        }
        _textDomOverlays = [];
    }

    return { render: render, cleanup: cleanup };
})();