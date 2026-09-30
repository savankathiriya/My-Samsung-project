/**
 * ====================================================================
 * CANVAS BASE UTILITIES
 * Common helper functions used across all canvas renderers
 * ====================================================================
 */

var CanvasBase = (function() {
    'use strict';

    /**
     * Draw rounded rectangle path
     */
    function roundRect(ctx, x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
    }

    /**
     * Draw image with object-fit behavior (cover/contain)
     */
    function drawImageWithFit(ctx, img, x, y, width, height, fit) {
        var imgRatio = img.width / img.height;
        var boxRatio = width / height;
        
        var drawWidth, drawHeight, offsetX, offsetY;
        
        if (fit === 'cover') {
            if (imgRatio > boxRatio) {
                drawHeight = height;
                drawWidth = height * imgRatio;
                offsetX = (width - drawWidth) / 2;
                offsetY = 0;
            } else {
                drawWidth = width;
                drawHeight = width / imgRatio;
                offsetX = 0;
                offsetY = (height - drawHeight) / 2;
            }
        } else { // contain (default)
            if (imgRatio > boxRatio) {
                drawWidth = width;
                drawHeight = width / imgRatio;
                offsetX = 0;
                offsetY = (height - drawHeight) / 2;
            } else {
                drawHeight = height;
                drawWidth = height * imgRatio;
                offsetX = (width - drawWidth) / 2;
                offsetY = 0;
            }
        }
        
        ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
    }

    /**
     * Wrap text within a specified width
     */
    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        var words = text.split(' ');
        var line = '';
        var lineY = y;
        
        for (var i = 0; i < words.length; i++) {
            var testLine = line + words[i] + ' ';
            var metrics = ctx.measureText(testLine);
            var testWidth = metrics.width;
            
            if (testWidth > maxWidth && i > 0) {
                ctx.fillText(line, x, lineY);
                line = words[i] + ' ';
                lineY += lineHeight;
            } else {
                line = testLine;
            }
        }
        
        ctx.fillText(line, x, lineY);
    }

    /**
     * Apply vignette effect
     */
    function applyVignette(ctx, width, height, effect, intensity) {
        intensity = intensity || 1;
        var maxOpacity = 0.6 * intensity;
        
        var gradient;
        
        if (effect === 'bottom') {
            gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, ' + maxOpacity + ')');
        } 
        else if (effect === 'top') {
            gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, 'rgba(0, 0, 0, ' + maxOpacity + ')');
            gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
        else if (effect === 'radial' || effect === 'all') {
            gradient = ctx.createRadialGradient(
                width / 2, height / 2, 0,
                width / 2, height / 2, Math.max(width, height) / 2
            );
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, ' + (maxOpacity * 0.8) + ')');
        }
        else {
            return;
        }
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    /**
     * Apply transformations (position, rotation, opacity)
     */
    function applyTransformations(ctx, el) {
        ctx.translate(el.x || 0, el.y || 0);
        
        if (el.rotation) {
            ctx.translate(el.width / 2, el.height / 2);
            ctx.rotate(el.rotation * Math.PI / 180);
            ctx.translate(-el.width / 2, -el.height / 2);
        }
        
        ctx.globalAlpha = typeof el.opacity !== 'undefined' ? el.opacity : 1;
    }

    /**
     * Apply text shadow effect
     */
    function applyTextShadow(ctx, el) {
        if (el.textShadow) {
            ctx.shadowColor = el.textShadowColor || '#000000';
            ctx.shadowBlur = el.textShadowBlur || 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
        }
    }

    /**
     * Reset text shadow
     */
    function resetTextShadow(ctx) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    /**
     * Apply text stroke effect
     */
    function applyTextStroke(ctx, el) {
        if (el.textStroke) {
            ctx.strokeStyle = el.textStrokeColor || '#000000';
            ctx.lineWidth = el.textStrokeWidth || 1;
            ctx.strokeText(el.text, 0, 0);
        }
    }

    /**
     * Draw background with padding and radius
     */
    function drawElementBackground(ctx, el) {
        if (el.backgroundColor && el.backgroundColor !== 'transparent') {
            ctx.fillStyle = el.backgroundColor;
            var padding = el.backgroundPadding || 0;
            var radius = el.backgroundRadius || el.borderRadius || 0;
            
            if (radius > 0) {
                roundRect(ctx, -padding, -padding, el.width + padding * 2, el.height + padding * 2, radius);
                ctx.fill();
            } else {
                ctx.fillRect(-padding, -padding, el.width + padding * 2, el.height + padding * 2);
            }
        }
    }

    /**
     * Get font string from element properties
     */
    function getFontString(el) {
        var fontStyle = el.fontStyle || 'normal';
        var fontWeight = el.fontWeight || 'normal';
        var fontSize = el.fontSize || 16;
        var fontFamily = el.fontFamily || 'Arial';
        
        return fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px ' + fontFamily;
    }

    /**
     * Parse color with opacity (handles hex with alpha channel)
     */
    function parseColorWithOpacity(color, opacity) {
        if (!color) return 'rgba(0, 0, 0, 0)';
        
        // If color ends with 00 (like #00000000), it's transparent
        if (color.length === 9 && color.slice(-2) === '00') {
            return 'transparent';
        }
        
        if (typeof opacity !== 'undefined' && opacity !== 1) {
            // Convert hex to rgba
            if (color.startsWith('#')) {
                var r = parseInt(color.slice(1, 3), 16);
                var g = parseInt(color.slice(3, 5), 16);
                var b = parseInt(color.slice(5, 7), 16);
                return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + opacity + ')';
            }
        }
        
        return color;
    }

    /**
     * Image cache: keyed by src URL.
     * Each entry is { img: HTMLImageElement, loaded: bool, callbacks: [] }
     */
    var _imageCache = {};

    /**
     * Load image with caching.
     * If the same src has already been loaded, onLoad is called synchronously
     * with the cached Image object — no redundant network request.
     * If it is still loading, the callback is queued and called once it resolves.
     */
    function loadImage(src, onLoad, onError) {
        if (!src) {
            if (onError) onError();
            return;
        }

        // Already fully loaded — call back synchronously
        if (_imageCache[src] && _imageCache[src].loaded) {
            if (onLoad) onLoad(_imageCache[src].img);
            return;
        }

        // Already in-flight — just queue the callback
        if (_imageCache[src] && !_imageCache[src].loaded) {
            if (onLoad)  _imageCache[src].callbacks.push({ onLoad: onLoad, onError: onError });
            return;
        }

        // First request for this src — start loading
        var entry = { img: new Image(), loaded: false, callbacks: [] };
        if (onLoad || onError) {
            entry.callbacks.push({ onLoad: onLoad, onError: onError });
        }
        _imageCache[src] = entry;

        entry.img.crossOrigin = 'anonymous';

        entry.img.onload = function() {
            entry.loaded = true;
            var cbs = entry.callbacks.slice();
            entry.callbacks = [];
            for (var i = 0; i < cbs.length; i++) {
                if (cbs[i].onLoad) cbs[i].onLoad(entry.img);
            }
        };

        entry.img.onerror = function() {
            console.warn('[CanvasBase] Image load failed:', src);
            delete _imageCache[src];   // allow retry later
            var cbs = entry.callbacks.slice();
            entry.callbacks = [];
            for (var i = 0; i < cbs.length; i++) {
                if (cbs[i].onError) cbs[i].onError();
            }
        };

        entry.img.src = src;
    }

    /**
     * Return the cached Image for a src (or null if not yet loaded).
     * Used by updateClocks() to synchronously repaint image elements
     * that sit behind a clock without needing any async callback.
     */
    function getCachedImage(src) {
        if (src && _imageCache[src] && _imageCache[src].loaded) {
            return _imageCache[src].img;
        }
        return null;
    }

    // Public API
    return {
        roundRect: roundRect,
        drawImageWithFit: drawImageWithFit,
        wrapText: wrapText,
        applyVignette: applyVignette,
        applyTransformations: applyTransformations,
        applyTextShadow: applyTextShadow,
        resetTextShadow: resetTextShadow,
        applyTextStroke: applyTextStroke,
        drawElementBackground: drawElementBackground,
        getFontString: getFontString,
        parseColorWithOpacity: parseColorWithOpacity,
        loadImage: loadImage,
        getCachedImage: getCachedImage
    };
})();