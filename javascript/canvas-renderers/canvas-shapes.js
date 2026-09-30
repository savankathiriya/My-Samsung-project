/**
 * ====================================================================
 * CANVAS SHAPES RENDERER
 * Handles geometric shape elements: arrow, diamond, triangle, line,
 * circle, rectangle, pentagon, hexagon, star
 * ====================================================================
 */

var CanvasShapes = (function() {
    'use strict';

    /**
     * Bake el.fillOpacity into a color string.
     *
     * el.fillOpacity (0–1) controls the fill alpha independently of the
     * element-level el.opacity (which is applied to the whole element via
     * ctx.globalAlpha in CanvasBase.applyTransformations).
     *
     * We bake it into the color rather than touching globalAlpha so that
     * the border/stroke is NOT affected by fillOpacity.
     *
     * @param  {string} color  - hex (#rrggbb / #rrggbbaa) or any CSS color
     * @param  {object} el     - element data; reads el.fillOpacity
     * @returns {string}       - original color, or rgba() with alpha applied
     */
    function _applyFillOpacity(color, el) {
        if (typeof el.fillOpacity === 'undefined' || el.fillOpacity === 1) {
            return color;
        }
        var alpha = Math.max(0, Math.min(1, el.fillOpacity));
        if (!color || color === 'transparent') return 'rgba(0,0,0,0)';

        // Already rgba — replace the existing alpha component
        if (color.indexOf('rgba') === 0) {
            return color.replace(/,[^,]+\)$/, ',' + alpha + ')');
        }
        // rgb() — upgrade to rgba()
        if (color.indexOf('rgb') === 0) {
            return color.replace('rgb(', 'rgba(').replace(')', ',' + alpha + ')');
        }
        // hex #rrggbb or #rrggbbaa — extract r,g,b and apply alpha
        if (color.charAt(0) === '#') {
            var hex = color.slice(1);
            if (hex.length === 3) {
                hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            }
            var r = parseInt(hex.slice(0, 2), 16);
            var g = parseInt(hex.slice(2, 4), 16);
            var b = parseInt(hex.slice(4, 6), 16);
            return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        }
        // Named colors or unknown formats — return as-is
        return color;
    }

    /**
     * Main render function - routes to specific shape renderer
     */
    function render(ctx, el) {
        if (!el.type) {
            console.warn('[CanvasShapes] Element missing type');
            return;
        }

        var shapeType = el.type.toLowerCase();
        console.log('[CanvasShapes] Rendering:', shapeType, '-', el.name || el.id);

        // VIDEO BACKGROUND or ANIMATION ENABLED: render as DOM overlay.
        // CSS animations require DOM elements - canvas pixels cannot be animated.
        var _hasAnimation = el.animation && el.animation.enabled &&
                            el.animation.type && el.animation.type !== 'none';
        if (_hasAnimation || (typeof CanvasVideoBgHelper !== 'undefined' && CanvasVideoBgHelper.isVideoBg())) {
            _renderAsDom(el);
            return;
        }

        ctx.save();

        // Apply transformations
        CanvasBase.applyTransformations(ctx, el);

        // Route to specific shape renderer
        switch (shapeType) {
            case 'arrow':
                renderArrow(ctx, el);
                break;
            case 'diamond':
                renderDiamond(ctx, el);
                break;
            case 'triangle':
                renderTriangle(ctx, el);
                break;
            case 'line':
                renderLine(ctx, el);
                break;
            case 'circle':
                renderCircle(ctx, el);
                break;
            case 'rectangle':
                renderRectangle(ctx, el);
                break;
            case 'pentagon':
                renderPentagon(ctx, el);
                break;
            case 'hexagon':
                renderHexagon(ctx, el);
                break;
            case 'star':
                renderStar(ctx, el);
                break;
            default:
                console.warn('[CanvasShapes] Unknown shape type:', shapeType);
        }

        ctx.restore();
        console.log('[CanvasShapes] ✅ Shape rendered:', shapeType);
    }

    /**
     * Render ARROW shape
     * Supports directions: up, down, left, right
     */
    function renderArrow(ctx, el) {
        var direction = el.direction || 'right';
        var headSize = el.arrowHeadSize || 0.3; // Fraction of width/height
        var bgColor = _applyFillOpacity(el.backgroundColor || '#f59e0b', el);
        var borderColor = el.borderColor || '#d97706';
        var borderWidth = el.borderWidth || 2;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        ctx.beginPath();

        switch (direction) {
            case 'right':
                drawRightArrow(ctx, el.width, el.height, headSize);
                break;
            case 'left':
                drawLeftArrow(ctx, el.width, el.height, headSize);
                break;
            case 'up':
                drawUpArrow(ctx, el.width, el.height, headSize);
                break;
            case 'down':
                drawDownArrow(ctx, el.width, el.height, headSize);
                break;
            default:
                drawRightArrow(ctx, el.width, el.height, headSize);
        }

        ctx.fill();
        if (borderWidth > 0) {
            ctx.stroke();
        }
    }

    function drawRightArrow(ctx, width, height, headSize) {
        var shaftWidth = height * 0.4;
        var headWidth = width * headSize;
        var shaftHeight = (height - shaftWidth) / 2;

        ctx.moveTo(0, shaftHeight);
        ctx.lineTo(width - headWidth, shaftHeight);
        ctx.lineTo(width - headWidth, 0);
        ctx.lineTo(width, height / 2);
        ctx.lineTo(width - headWidth, height);
        ctx.lineTo(width - headWidth, height - shaftHeight);
        ctx.lineTo(0, height - shaftHeight);
        ctx.closePath();
    }

    function drawLeftArrow(ctx, width, height, headSize) {
        var shaftWidth = height * 0.4;
        var headWidth = width * headSize;
        var shaftHeight = (height - shaftWidth) / 2;

        ctx.moveTo(headWidth, shaftHeight);
        ctx.lineTo(width, shaftHeight);
        ctx.lineTo(width, height - shaftHeight);
        ctx.lineTo(headWidth, height - shaftHeight);
        ctx.lineTo(headWidth, height);
        ctx.lineTo(0, height / 2);
        ctx.lineTo(headWidth, 0);
        ctx.closePath();
    }

    function drawUpArrow(ctx, width, height, headSize) {
        var shaftWidth = width * 0.4;
        var headHeight = height * headSize;
        var shaftLeft = (width - shaftWidth) / 2;

        ctx.moveTo(shaftLeft, height);
        ctx.lineTo(shaftLeft, headHeight);
        ctx.lineTo(0, headHeight);
        ctx.lineTo(width / 2, 0);
        ctx.lineTo(width, headHeight);
        ctx.lineTo(width - shaftLeft, headHeight);
        ctx.lineTo(width - shaftLeft, height);
        ctx.closePath();
    }

    function drawDownArrow(ctx, width, height, headSize) {
        var shaftWidth = width * 0.4;
        var headHeight = height * headSize;
        var shaftLeft = (width - shaftWidth) / 2;

        ctx.moveTo(shaftLeft, 0);
        ctx.lineTo(shaftLeft, height - headHeight);
        ctx.lineTo(0, height - headHeight);
        ctx.lineTo(width / 2, height);
        ctx.lineTo(width, height - headHeight);
        ctx.lineTo(width - shaftLeft, height - headHeight);
        ctx.lineTo(width - shaftLeft, 0);
        ctx.closePath();
    }

    /**
     * Render DIAMOND shape
     */
    function renderDiamond(ctx, el) {
        var bgColor = _applyFillOpacity(el.backgroundColor || '#06b6d4', el);
        var borderColor = el.borderColor || '#0891b2';
        var borderWidth = el.borderWidth || 2;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        ctx.beginPath();
        ctx.moveTo(el.width / 2, 0);
        ctx.lineTo(el.width, el.height / 2);
        ctx.lineTo(el.width / 2, el.height);
        ctx.lineTo(0, el.height / 2);
        ctx.closePath();

        ctx.fill();
        if (borderWidth > 0) {
            ctx.stroke();
        }
    }

    /**
     * Render TRIANGLE shape
     * Supports directions: up, down, left, right
     */
    function renderTriangle(ctx, el) {
        var direction = el.direction || 'up';
        var bgColor = _applyFillOpacity(el.backgroundColor || '#10b981', el);
        var borderColor = el.borderColor || '#059669';
        var borderWidth = el.borderWidth || 2;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        ctx.beginPath();

        switch (direction) {
            case 'up':
                ctx.moveTo(el.width / 2, 0);
                ctx.lineTo(el.width, el.height);
                ctx.lineTo(0, el.height);
                break;
            case 'down':
                ctx.moveTo(0, 0);
                ctx.lineTo(el.width, 0);
                ctx.lineTo(el.width / 2, el.height);
                break;
            case 'left':
                ctx.moveTo(0, el.height / 2);
                ctx.lineTo(el.width, 0);
                ctx.lineTo(el.width, el.height);
                break;
            case 'right':
                ctx.moveTo(0, 0);
                ctx.lineTo(el.width, el.height / 2);
                ctx.lineTo(0, el.height);
                break;
            default:
                ctx.moveTo(el.width / 2, 0);
                ctx.lineTo(el.width, el.height);
                ctx.lineTo(0, el.height);
        }

        ctx.closePath();
        ctx.fill();
        if (borderWidth > 0) {
            ctx.stroke();
        }
    }

    /**
     * Render LINE shape
     */
    function renderLine(ctx, el) {
        var bgColor = _applyFillOpacity(el.backgroundColor || '#31dd53', el);

        // el.strokeOpacity is an optional additional multiplier on top of el.opacity.
        // el.opacity is already set on ctx.globalAlpha by applyTransformations.
        if (typeof el.strokeOpacity !== 'undefined' && el.strokeOpacity !== 1) {
            var baseOpacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
            ctx.globalAlpha = baseOpacity * el.strokeOpacity;
        }

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, el.width, el.height);
    }

    /**
     * Render CIRCLE shape
     */
    function renderCircle(ctx, el) {
        var bgColor = _applyFillOpacity(el.backgroundColor || '#ef4444', el);
        var borderColor = el.borderColor || '#dc2626';
        var borderWidth = el.borderWidth || 2;

        var centerX = el.width / 2;
        var centerY = el.height / 2;
        var radius = Math.min(el.width, el.height) / 2;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();

        if (borderWidth > 0) {
            ctx.stroke();
        }
    }

    /**
     * Render RECTANGLE shape
     */
    function renderRectangle(ctx, el) {
        var bgColor = _applyFillOpacity(el.backgroundColor || '#3b82f6', el);
        var borderColor = el.borderColor || '#1e40af';
        var borderWidth = el.borderWidth || 2;
        var borderRadius = el.borderRadius || 0;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        if (borderRadius > 0) {
            CanvasBase.roundRect(ctx, 0, 0, el.width, el.height, borderRadius);
            ctx.fill();
            if (borderWidth > 0) {
                ctx.stroke();
            }
        } else {
            ctx.fillRect(0, 0, el.width, el.height);
            if (borderWidth > 0) {
                ctx.strokeRect(0, 0, el.width, el.height);
            }
        }
    }

    /**
     * Render PENTAGON shape (5 sides)
     */
    function renderPentagon(ctx, el) {
        renderPolygon(ctx, el, 5);
    }

    /**
     * Render HEXAGON shape (6 sides)
     */
    function renderHexagon(ctx, el) {
        renderPolygon(ctx, el, 6);
    }

    /**
     * Render regular polygon (pentagon, hexagon, etc.)
     */
    function renderPolygon(ctx, el, sides) {
        var bgColor = _applyFillOpacity(el.backgroundColor || '#8b5cf6', el);
        var borderColor = el.borderColor || '#7c3aed';
        var borderWidth = el.borderWidth || 2;

        var centerX = el.width / 2;
        var centerY = el.height / 2;
        var radius = Math.min(el.width, el.height) / 2;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        ctx.beginPath();
        for (var i = 0; i < sides; i++) {
            var angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
            var x = centerX + radius * Math.cos(angle);
            var y = centerY + radius * Math.sin(angle);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();

        ctx.fill();
        if (borderWidth > 0) {
            ctx.stroke();
        }
    }

    /**
     * Render STAR shape
     */
    function renderStar(ctx, el) {
        var points = el.points || 5;
        var innerRadius = el.innerRadius || 0.5; // Fraction of outer radius
        var bgColor = _applyFillOpacity(el.backgroundColor || '#eab308', el);
        var borderColor = el.borderColor || '#ca8a04';
        var borderWidth = el.borderWidth || 2;

        var centerX = el.width / 2;
        var centerY = el.height / 2;
        var outerRadius = Math.min(el.width, el.height) / 2;
        var innerRadiusActual = outerRadius * innerRadius;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        ctx.beginPath();
        for (var i = 0; i < points * 2; i++) {
            var angle = (i * Math.PI / points) - Math.PI / 2;
            var radius = i % 2 === 0 ? outerRadius : innerRadiusActual;
            var x = centerX + radius * Math.cos(angle);
            var y = centerY + radius * Math.sin(angle);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();

        ctx.fill();
        if (borderWidth > 0) {
            ctx.stroke();
        }
    }


    /* ── DOM overlay for video background mode ──────────────────── */
    var _shapeDomOverlays = [];

    function _renderAsDom(el) {
        var elId = String(el.id || el.name || Date.now());
        var stale = document.querySelectorAll('[data-canvas-shape-id="' + elId + '"]');
        for (var s = 0; s < stale.length; s++) {
            if (stale[s].parentNode) stale[s].parentNode.removeChild(stale[s]);
        }

        var container = (typeof CanvasVideoBgHelper !== 'undefined')
            ? CanvasVideoBgHelper.getContainer()
            : document.getElementById('our-hotel-container') || document.body;

        var x       = Math.floor(el.x      || 0);
        var y       = Math.floor(el.y      || 0);
        var w       = Math.ceil(el.width   || 0);
        var h       = Math.ceil(el.height  || 0);
        var opacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        var zIndex  = (el.zIndex && el.zIndex !== 'auto') ? el.zIndex : 10;
        var shapeType = el.type.toLowerCase();

        /* Most shapes can be approximated with CSS.
           Complex shapes (star, polygon, arrow, etc.) are drawn on a
           temporary <canvas> element inside the DOM overlay.           */
        var wrap = document.createElement('div');
        wrap.setAttribute('data-canvas-shape-id', elId);
        wrap.style.cssText = 'position:absolute;pointer-events:none;margin:0;padding:0;overflow:hidden;';
        wrap.style.left    = x + 'px';
        wrap.style.top     = y + 'px';
        wrap.style.width   = w + 'px';
        wrap.style.height  = h + 'px';
        wrap.style.opacity = String(opacity);
        wrap.style.zIndex  = String(zIndex);

        if (el.rotation && el.rotation !== 0) {
            wrap.style.transform       = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform = 'rotate(' + el.rotation + 'deg)';
            wrap.style.transformOrigin = 'center center';
        }

        /* Draw the shape onto a mini canvas inside the wrapper */
        var miniCanvas = document.createElement('canvas');
        miniCanvas.width  = w;
        miniCanvas.height = h;
        miniCanvas.style.cssText = 'position:absolute;top:0;left:0;display:block;';
        var mCtx = miniCanvas.getContext('2d');

        if (mCtx) {
            /* Reset and fake an el with x=0,y=0 for the mini canvas */
            /* Opacity is handled by wrap.style.opacity — always draw at full alpha */
            mCtx.globalAlpha = 1;
            var fakeEl = {};
            for (var k in el) { if (el.hasOwnProperty(k)) fakeEl[k] = el[k]; }
            fakeEl.x = 0; fakeEl.y = 0; fakeEl.opacity = 1;

            /* Use CanvasBase.applyTransformations then call the shape renderer */
            mCtx.clearRect(0, 0, w, h);
            mCtx.save();
            /* No translate needed -- fakeEl.x/y = 0 */
            try {
                switch (shapeType) {
                    case 'circle':    _drawCircle(mCtx, fakeEl);              break;
                    case 'rectangle': _drawRect(mCtx, fakeEl);                break;
                    case 'line':      _drawLine(mCtx, fakeEl);                break;
                    case 'triangle':  _drawTriangle(mCtx, fakeEl);            break;
                    case 'diamond':   _drawDiamond(mCtx, fakeEl);             break;
                    case 'arrow':     _drawArrow(mCtx, fakeEl);               break;
                    case 'pentagon':  _drawPolygon(mCtx, fakeEl, 5);          break;
                    case 'hexagon':   _drawPolygon(mCtx, fakeEl, 6);          break;
                    case 'star':      _drawStar(mCtx, fakeEl);                break;
                    default:          _drawRect(mCtx, fakeEl);                break;
                }
            } catch (e) {
                console.warn('[CanvasShapes] mini-canvas draw error:', e);
            }
            mCtx.restore();
        }

        wrap.appendChild(miniCanvas);

        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        // Hide until animation fires (prevents flash at natural position on first load)
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            wrap.style.visibility = 'hidden';
        }
        container.appendChild(wrap);
        _shapeDomOverlays.push(wrap);

        // Apply CSS animation if configured on this element
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                CanvasAnimation.applyAnimation(el, document.getElementById('templateCanvas'));
            }
        }

        console.log('[CanvasShapes] DOM overlay created:', shapeType, elId);
    }

    /* Lightweight shape draw helpers for the mini canvas (fakeEl.x=0,y=0) */
    function _drawCircle(ctx, el) {
        var cx = el.width/2, cy = el.height/2;
        var r  = Math.min(el.width, el.height)/2;
        ctx.fillStyle   = _applyFillOpacity(el.backgroundColor || '#ef4444', el);
        ctx.strokeStyle = el.borderColor     || '#dc2626';
        ctx.lineWidth   = el.borderWidth      || 2;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI);
        ctx.fill();
        if ((el.borderWidth||0) > 0) ctx.stroke();
    }
    function _drawRect(ctx, el) {
        var br = el.borderRadius || 0;
        ctx.fillStyle   = _applyFillOpacity(el.backgroundColor || '#3b82f6', el);
        ctx.strokeStyle = el.borderColor     || '#1e40af';
        ctx.lineWidth   = el.borderWidth      || 2;
        if (br > 0 && typeof CanvasBase !== 'undefined') {
            CanvasBase.roundRect(ctx, 0, 0, el.width, el.height, br);
            ctx.fill();
            if ((el.borderWidth||0) > 0) ctx.stroke();
        } else {
            ctx.fillRect(0, 0, el.width, el.height);
            if ((el.borderWidth||0) > 0) ctx.strokeRect(0, 0, el.width, el.height);
        }
    }
    function _drawLine(ctx, el) {
        ctx.fillStyle = _applyFillOpacity(el.backgroundColor || '#31dd53', el);
        // Note: element-level opacity lives on the wrapper div — do NOT set globalAlpha here.
        // strokeOpacity is a legacy additional multiplier on the fill only.
        if (typeof el.strokeOpacity !== 'undefined' && el.strokeOpacity !== 1) {
            ctx.globalAlpha = el.strokeOpacity;
        }
        ctx.fillRect(0, 0, el.width, el.height);
    }
    function _drawTriangle(ctx, el) {
        var d = el.direction || 'up';
        ctx.fillStyle   = _applyFillOpacity(el.backgroundColor || '#10b981', el);
        ctx.strokeStyle = el.borderColor     || '#059669';
        ctx.lineWidth   = el.borderWidth      || 2;
        ctx.beginPath();
        switch (d) {
            case 'down': ctx.moveTo(0,0); ctx.lineTo(el.width,0); ctx.lineTo(el.width/2,el.height); break;
            case 'left': ctx.moveTo(0,el.height/2); ctx.lineTo(el.width,0); ctx.lineTo(el.width,el.height); break;
            case 'right': ctx.moveTo(0,0); ctx.lineTo(el.width,el.height/2); ctx.lineTo(0,el.height); break;
            default: ctx.moveTo(el.width/2,0); ctx.lineTo(el.width,el.height); ctx.lineTo(0,el.height);
        }
        ctx.closePath(); ctx.fill();
        if ((el.borderWidth||0) > 0) ctx.stroke();
    }
    function _drawDiamond(ctx, el) {
        ctx.fillStyle   = _applyFillOpacity(el.backgroundColor || '#06b6d4', el);
        ctx.strokeStyle = el.borderColor     || '#0891b2';
        ctx.lineWidth   = el.borderWidth      || 2;
        ctx.beginPath();
        ctx.moveTo(el.width/2,0); ctx.lineTo(el.width,el.height/2);
        ctx.lineTo(el.width/2,el.height); ctx.lineTo(0,el.height/2);
        ctx.closePath(); ctx.fill();
        if ((el.borderWidth||0) > 0) ctx.stroke();
    }
    function _drawArrow(ctx, el) {
        var direction = el.direction || 'right';
        var headSize  = el.arrowHeadSize || 0.3;
        ctx.fillStyle   = _applyFillOpacity(el.backgroundColor || '#f59e0b', el);
        ctx.strokeStyle = el.borderColor     || '#d97706';
        ctx.lineWidth   = el.borderWidth      || 2;
        ctx.beginPath();
        var w = el.width, h = el.height;
        switch (direction) {
            case 'left': {
                var hw = w * headSize, sh = h * 0.4, sy = (h - sh) / 2;
                ctx.moveTo(hw, sy); ctx.lineTo(w, sy); ctx.lineTo(w, sy + sh);
                ctx.lineTo(hw, sy + sh); ctx.lineTo(hw, h);
                ctx.lineTo(0, h / 2); ctx.lineTo(hw, 0);
                break;
            }
            case 'up': {
                var hh = h * headSize, sw2 = w * 0.4, sl = (w - sw2) / 2;
                ctx.moveTo(sl, h); ctx.lineTo(sl, hh); ctx.lineTo(0, hh);
                ctx.lineTo(w / 2, 0); ctx.lineTo(w, hh);
                ctx.lineTo(w - sl, hh); ctx.lineTo(w - sl, h);
                break;
            }
            case 'down': {
                var hh2 = h * headSize, sw3 = w * 0.4, sl2 = (w - sw3) / 2;
                ctx.moveTo(sl2, 0); ctx.lineTo(sl2, h - hh2); ctx.lineTo(0, h - hh2);
                ctx.lineTo(w / 2, h); ctx.lineTo(w, h - hh2);
                ctx.lineTo(w - sl2, h - hh2); ctx.lineTo(w - sl2, 0);
                break;
            }
            default: { /* right */
                var hw2 = w * headSize, sh2 = h * 0.4, sy2 = (h - sh2) / 2;
                ctx.moveTo(0, sy2); ctx.lineTo(w - hw2, sy2); ctx.lineTo(w - hw2, 0);
                ctx.lineTo(w, h / 2); ctx.lineTo(w - hw2, h);
                ctx.lineTo(w - hw2, sy2 + sh2); ctx.lineTo(0, sy2 + sh2);
            }
        }
        ctx.closePath(); ctx.fill();
        if ((el.borderWidth||0) > 0) ctx.stroke();
    }
    function _drawPolygon(ctx, el, sides) {
        var cx = el.width / 2, cy = el.height / 2;
        var r  = Math.min(el.width, el.height) / 2;
        ctx.fillStyle   = _applyFillOpacity(el.backgroundColor || '#8b5cf6', el);
        ctx.strokeStyle = el.borderColor     || '#7c3aed';
        ctx.lineWidth   = el.borderWidth      || 2;
        ctx.beginPath();
        for (var i = 0; i < sides; i++) {
            var angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
            var px = cx + r * Math.cos(angle);
            var py = cy + r * Math.sin(angle);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        if ((el.borderWidth||0) > 0) ctx.stroke();
    }
    function _drawStar(ctx, el) {
        var points      = el.points      || 5;
        var innerRatio  = el.innerRadius || 0.5;
        var cx = el.width / 2, cy = el.height / 2;
        var outerR = Math.min(el.width, el.height) / 2;
        var innerR = outerR * innerRatio;
        ctx.fillStyle   = _applyFillOpacity(el.backgroundColor || '#eab308', el);
        ctx.strokeStyle = el.borderColor     || '#ca8a04';
        ctx.lineWidth   = el.borderWidth      || 2;
        ctx.beginPath();
        for (var i = 0; i < points * 2; i++) {
            var angle = (i * Math.PI / points) - Math.PI / 2;
            var r = (i % 2 === 0) ? outerR : innerR;
            var px = cx + r * Math.cos(angle);
            var py = cy + r * Math.sin(angle);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        if ((el.borderWidth||0) > 0) ctx.stroke();
    }

    function cleanupShapes() {
        for (var i = 0; i < _shapeDomOverlays.length; i++) {
            if (_shapeDomOverlays[i] && _shapeDomOverlays[i].parentNode)
                _shapeDomOverlays[i].parentNode.removeChild(_shapeDomOverlays[i]);
        }
        _shapeDomOverlays = [];
    }

    // Public API
    return {
        render: render,
        cleanup: cleanupShapes
    };
})();

// Expose globally
if (typeof window !== 'undefined') {
    window.CanvasShapes = CanvasShapes;
}