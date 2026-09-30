/**
 * ====================================================================
 * CANVAS RENDERER - PROPER FIX FOR LG PRO:CENTRIC TV
 * Issue: TV picture mode was causing overscan - solution is proper scaling
 * NO artificial padding - let CanvasScaler handle everything correctly
 * ====================================================================
 */

var CanvasRenderer = (function() {
    'use strict';

    var currentCanvas = null;
    var ctx = null;
    var templateData = null;
    var scaleX = 1;
    var scaleY = 1;
    var clockElements = [];
    var animationFrameId = null;
    var cachedBgImage = null;   // cached bg image for clock/slideshow repaints
    var cachedBgFit = 'cover';
    var cachedBgOpacity = 1;

    /**
     * Main render function - orchestrates all rendering
     */
    function render(onReady) {
        console.log('[CanvasRenderer] ===== Starting Canvas Render =====');
        
        var canvas = document.getElementById('templateCanvas');
        if (!canvas) {
            console.error('[CanvasRenderer] Canvas element #templateCanvas not found');
            return;
        }

        currentCanvas = canvas;
        ctx = canvas.getContext('2d');
        
        if (!ctx) {
            console.error('[CanvasRenderer] Cannot get 2D context');
            return;
        }

        // Clean up any existing GIF overlays and slideshows from previous renders
        if (typeof CanvasGif !== 'undefined' && CanvasGif.cleanup) {
            CanvasGif.cleanup();
        }
        // Clean up video overlays — resets primarySet so next render re-assigns primary
        if (typeof CanvasVideo !== 'undefined' && CanvasVideo.cleanup) {
            CanvasVideo.cleanup();
        }
        if (typeof CanvasImage !== 'undefined' && CanvasImage.cleanup) {
            CanvasImage.cleanup();
        }
        if (typeof CanvasQr !== 'undefined' && CanvasQr.cleanup) {
            CanvasQr.cleanup();
        }
        if (typeof CanvasText !== 'undefined' && CanvasText.cleanup) {
            CanvasText.cleanup();
        }
        if (typeof CanvasClock !== 'undefined' && CanvasClock.cleanup) {
            CanvasClock.cleanup();
        }
        if (typeof CanvasShapes !== 'undefined' && CanvasShapes.cleanup) {
            CanvasShapes.cleanup();
        }
        if (typeof CanvasSlideshow !== 'undefined' && CanvasSlideshow.cleanup) {
            CanvasSlideshow.cleanup();
        }

        // Get template data
        var originalTemplateData;
        try {
            originalTemplateData = Main.jsonTemplateData && Main.jsonTemplateData.template_json;
        } catch (e) {
            console.error('[CanvasRenderer] Error accessing template data:', e);
            return;
        }

        if (!originalTemplateData || !originalTemplateData.canvas || !originalTemplateData.elements) {
            console.error('[CanvasRenderer] Invalid template_json structure');
            return;
        }

        // ðŸ”¥ PROPER FIX: Use exact window dimensions, let CanvasScaler handle everything
        var screenW = window.innerWidth;
        var screenH = window.innerHeight;
        var designW = originalTemplateData.canvas.width  || 1920;
        var designH = originalTemplateData.canvas.height || 1080;

        console.log('[CanvasRenderer] Screen:', screenW + 'x' + screenH);
        console.log('[CanvasRenderer] Design:', designW + 'x' + designH);

        // Initialize CanvasScaler with EXACT screen dimensions
        if (typeof CanvasScaler !== 'undefined') {
            CanvasScaler.initialize(screenW, screenH, designW, designH, 'fit');
            
            // Scale the entire template data
            templateData = CanvasScaler.scaleTemplateData(originalTemplateData);
            
            var scaleInfo = CanvasScaler.getScaleInfo();
            console.log('[CanvasRenderer] âœ… CanvasScaler - Scale:', scaleInfo.scaleX.toFixed(4), 'x', scaleInfo.scaleY.toFixed(4));
        } else {
            // Fallback to old method if CanvasScaler not loaded
            console.warn('[CanvasRenderer] âš ï¸ CanvasScaler not found, using legacy scaling');
            templateData = originalTemplateData;
            
            scaleX = screenW / designW;
            scaleY = screenH / designH;
            console.log('[CanvasRenderer] Legacy Scale:', scaleX.toFixed(3), 'x', scaleY.toFixed(3));
        }

        var canvasConfig = templateData.canvas;
        var elements = templateData.elements;

        console.log('[CanvasRenderer] Template loaded - Elements:', elements.length);

        // Set canvas to EXACT screen size
        canvas.width  = screenW;
        canvas.height = screenH;
        canvas.style.width  = screenW + 'px';
        canvas.style.height = screenH + 'px';
        // IMPORTANT: keep position:absolute (NOT fixed) so canvas stays inside
        // #our-hotel-container stacking context. If we set fixed the canvas
        // escapes the container and sits above all DOM overlays (GIFs, action images).
        canvas.style.position = 'absolute';
        canvas.style.top = '0px';
        canvas.style.left = '0px';
        canvas.style.margin = '0';
        canvas.style.padding = '0';

        // CRITICAL: declare bgType HERE before use — previously declared at line ~173
        // causing JS var-hoisting to make it undefined when checked at line ~130.
        var bgType = (templateData.canvas && templateData.canvas.backgroundType) || 'color';

        // VIDEO BACKGROUND: make canvas transparent so bg-video-wrap shows through.
        // Layer order inside #our-hotel-container (bottom -> top):
        //   z-index:1  bg-video-wrap (background video DOM div)
        //   z-index:2  templateCanvas (transparent canvas - elements drawn here)
        //   z-index:20+ weather/clock/gif DOM overlays
        if (bgType === 'video') {
            canvas.style.background      = 'transparent';
            canvas.style.backgroundColor = 'transparent';
            canvas.style.zIndex          = '2';
            document.body.style.background = 'none';
            document.body.style.backgroundColor = 'transparent';
            var _videoCont = document.getElementById('our-hotel-container');
            if (_videoCont) {
                _videoCont.style.background      = 'none';
                _videoCont.style.backgroundColor = 'transparent';
            }
            ctx.clearRect(0, 0, screenW, screenH);
            console.log('[CanvasRenderer] Video BG: canvas transparent z-index:2');
        } else {
            canvas.style.background      = '';
            canvas.style.backgroundColor = '';
            canvas.style.zIndex          = '';
        }

        // Reset transform - NO OFFSET, NO EXTRA TRANSLATION
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Only apply ctx.scale if CanvasScaler wasn't used
        if (typeof CanvasScaler === 'undefined') {
            ctx.scale(scaleX, scaleY);
        }

        // Sort elements by zIndex for proper layering
        var sortedElements = elements.slice().sort(function(a, b) {
            var zA = typeof a.zIndex !== 'undefined' ? a.zIndex : 0;
            var zB = typeof b.zIndex !== 'undefined' ? b.zIndex : 0;
            return zA - zB;
        });

        // Extract clock elements for selective updates
        clockElements = sortedElements.filter(function(el) {
            if (el.visible === false) return false;
            var elType = el.type ? el.type.toLowerCase() : '';
            return elType === 'clock' || elType === 'timer' || elType === 'countdown';
        });

        console.log('[CanvasRenderer] Found', clockElements.length, 'clock elements for live updates');

        // Reset cached background on each full render
        cachedBgImage = null;
        cachedBgFit = canvasConfig.backgroundFit || 'cover';
        cachedBgOpacity = typeof canvasConfig.backgroundOpacity !== 'undefined' ? canvasConfig.backgroundOpacity : 1;

        // Route to correct background renderer
        // ✅ FIX: Wait for Google Fonts to load before rendering text elements
        var _bgType         = bgType;
        var _canvasConfig   = canvasConfig;
        var _sortedElements = sortedElements;
        var _ctx            = ctx;
        var _canvas         = canvas;

        function _doRender() {
            if (_bgType === 'image' && _canvasConfig.backgroundImage) {
                renderBackgroundThenElements(_ctx, _canvasConfig, _canvasConfig.width, _canvasConfig.height, _sortedElements, _canvas, onReady);
            } else if (_bgType === 'video') {
                CanvasBackground.render(_ctx, _canvasConfig, _canvasConfig.width, _canvasConfig.height, onReady);
                renderAllElements(_ctx, _sortedElements, _canvas);
            } else {
                CanvasBackground.render(_ctx, _canvasConfig, _canvasConfig.width, _canvasConfig.height);
                renderAllElements(_ctx, _sortedElements, _canvas);
                if (typeof onReady === 'function') {
                    requestAnimationFrame(function() { requestAnimationFrame(onReady); });
                }
            }
            console.log('[CanvasRenderer] ===== Canvas Render Complete =====');
        }

        if (typeof CanvasFontLoader !== 'undefined') {
            CanvasFontLoader.loadFromTemplate(originalTemplateData, _doRender);
        } else {
            _doRender();
        }
    }

    /**
     * Render background image first, then all elements on top
     */
    function renderBackgroundThenElements(ctx, canvasConfig, width, height, sortedElements, canvas, onReady) {
        var fallbackColor = (canvasConfig.background && canvasConfig.background !== 'transparent')
            ? canvasConfig.background : '#000000';
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(0, 0, width, height);

        var imageUrl = Array.isArray(canvasConfig.backgroundImage)
            ? canvasConfig.backgroundImage[0] : canvasConfig.backgroundImage;

        if (!imageUrl) {
            renderAllElements(ctx, sortedElements, canvas);
            if (typeof onReady === 'function') requestAnimationFrame(function() { requestAnimationFrame(onReady); });
            return;
        }

        var opacity = typeof canvasConfig.backgroundOpacity !== 'undefined' ? canvasConfig.backgroundOpacity : 1;
        var fit     = canvasConfig.backgroundFit || 'cover';

        function _drawAndFinish(bgImg) {
            cachedBgImage = bgImg; cachedBgFit = fit; cachedBgOpacity = opacity;
            ctx.save();
            ctx.globalAlpha = opacity;
            CanvasBase.drawImageWithFit(ctx, bgImg, 0, 0, width, height, fit);
            ctx.restore();
            renderAllElements(ctx, sortedElements, canvas);
            if (typeof onReady === 'function') requestAnimationFrame(function() { requestAnimationFrame(onReady); });
        }
        function _onError() {
            renderAllElements(ctx, sortedElements, canvas);
            if (typeof onReady === 'function') requestAnimationFrame(function() { requestAnimationFrame(onReady); });
        }

        if (typeof CanvasBase !== 'undefined' && CanvasBase.loadImage) {
            CanvasBase.loadImage(imageUrl, _drawAndFinish, _onError);
            return;
        }
        var bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        bgImg.onload  = function() { _drawAndFinish(bgImg); };
        bgImg.onerror = _onError;
        bgImg.src = imageUrl;
    }
    /**
     * Render all elements in order
     */
    function renderAllElements(ctx, sortedElements, canvas) {
        console.log('[CanvasRenderer] Rendering', sortedElements.length, 'elements...');
        
        for (var i = 0; i < sortedElements.length; i++) {
            var el = sortedElements[i];
            
            if (el.visible === false) {
                continue;
            }

            console.log('[CanvasRenderer] Rendering element', (i + 1), '/', sortedElements.length, '-', el.type, '-', el.name || el.id);

            try {
                renderElement(ctx, el, canvas);
            } catch (elementError) {
                console.error('[CanvasRenderer] Error rendering element:', el.name || el.id, elementError);
            }
        }
        
        console.log('[CanvasRenderer] âœ… All elements rendered');

        // ðŸ”¥ APPLY ANIMATIONS AFTER ALL ELEMENTS ARE RENDERED
        setTimeout(function() {
            if (typeof CanvasAnimation !== 'undefined') {
                console.log('[CanvasRenderer] Applying animations to elements');
                CanvasAnimation.applyAllAnimations(sortedElements, canvas);
            }
        }, 100);
    }
    
    /**
     * Render a single element
     */
    function renderElement(ctx, el, canvas) {
        var elType = el.type ? el.type.toLowerCase() : '';
        
        switch (elType) {
            case 'text':
                CanvasText.render(ctx, el);
                break;
                
            case 'weather':
                CanvasWeather.render(ctx, el);
                break;
                
            case 'clock':
            case 'timer':
            case 'countdown':
                CanvasClock.render(ctx, el);
                break;
                
            case 'image':
            case 'canvas-image':
                /* If the element carries qrData, generate a QR code instead
                   of treating it as a plain image.  Falls back to CanvasImage
                   when qrData is absent (normal image behaviour).             */
                if (typeof CanvasQr !== 'undefined' && CanvasQr.hasQrData(el)) {
                    CanvasQr.render(ctx, el);
                } else {
                    CanvasImage.render(ctx, el);
                }
                break;
                
            case 'gif':
                CanvasGif.render(ctx, el, canvas);
                break;
                
            case 'video':
                CanvasVideo.render(ctx, el);
                break;
                
            case 'slideshow':
                CanvasSlideshow.render(ctx, el);
                break;
                
            case 'action':
            case 'button':
            case 'card':
                CanvasAction.render(ctx, el);
                break;
            
            // Geometric shapes
            case 'arrow':
            case 'diamond':
            case 'triangle':
            case 'line':
            case 'circle':
            case 'rectangle':
            case 'pentagon':
            case 'hexagon':
            case 'star':
                CanvasShapes.render(ctx, el);
                break;
            
            // NEW ELEMENTS
            case 'label':
                CanvasLabel.render(ctx, el);
                break;
                
            case 'rss':
                CanvasRss.render(ctx, el, canvas);
                break;
                
            case 'ticker':
                CanvasTicker.render(ctx, el, canvas);
                break;
                
            default:
                console.warn('[CanvasRenderer] Unknown element type:', el.type);
                renderGenericElement(ctx, el);
        }
    }

    /**
     * Render unknown/generic element type
     */
    function renderGenericElement(ctx, el) {
        console.log('[CanvasRenderer] Rendering generic element:', el.type);
        
        ctx.save();
        
        // Apply basic transformations
        CanvasBase.applyTransformations(ctx, el);
        
        // Draw background
        if (el.backgroundColor && el.backgroundColor !== 'transparent') {
            ctx.fillStyle = el.backgroundColor;
            ctx.fillRect(0, 0, el.width, el.height);
        }
        
        // Draw border
        if (el.borderWidth && el.borderColor) {
            ctx.strokeStyle = el.borderColor;
            ctx.lineWidth = el.borderWidth;
            ctx.strokeRect(0, 0, el.width, el.height);
        }
        
        // Draw placeholder text
        ctx.font = '16px Arial';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Unknown: ' + el.type, el.width / 2, el.height / 2);
        
        ctx.restore();
    }

    /**
     * UPDATE ONLY CLOCK ELEMENTS (SELECTIVE RENDERING)
     *
     * ERASE STRATEGY per clock region (in priority order):
     *  1. Restore canvas-level background (color or canvas image bg).
     *  2. For every non-clock element overlapping this clock region:
     *     - image-type: repaint synchronously using el._loadedImg or
     *       CanvasBase.getCachedImage(src) — no async, no timers needed.
     *     - other types: re-render clipped to the clock rect.
     *  3. Two-pass design prevents adjacent clocks clobbering each other.
     */
    function updateClocks() {
        if (!ctx || !currentCanvas || clockElements.length === 0) {
            return;
        }
        // VIDEO BG: clocks are live DOM overlays (CanvasClock._renderAsDom with setInterval)
        // No canvas repaint needed - just return
        var _bgTypeCk = templateData && templateData.canvas && templateData.canvas.backgroundType;
        if (_bgTypeCk === 'video') {
            return;
        }

        ctx.save();

        if (typeof CanvasScaler === 'undefined') {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(scaleX, scaleY);
        } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        var _canvasCfg = templateData && templateData.canvas;
        var _bgType  = (_canvasCfg && _canvasCfg.backgroundType) ? _canvasCfg.backgroundType : 'color';
        var _bgColor = (_canvasCfg && _canvasCfg.background)     ? _canvasCfg.background     : '#000000';

        // All non-clock elements sorted by zIndex — used to find underlays
        var allElements = (templateData && templateData.elements) ? templateData.elements : [];
        var underlayElements = allElements.slice().sort(function(a, b) {
            return ((a.zIndex || 0) - (b.zIndex || 0));
        }).filter(function(e) {
            if (e.visible === false) return false;
            var t = (e.type || '').toLowerCase();
            return t !== 'clock' && t !== 'timer' && t !== 'countdown';
        });

        // Axis-aligned rectangle overlap test
        function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
            return ax < bx + bw && ax + aw > bx &&
                   ay < by + bh && ay + ah > by;
        }

        // Synchronously draw one image element, clipped to the given rect.
        // Uses el._loadedImg (set by CanvasImage after load) or the global
        // CanvasBase image cache — no async callback needed.
        function drawImageElement(under, clipX, clipY, clipW, clipH) {
            var img = under._loadedImg ||
                      (under.src ? CanvasBase.getCachedImage(under.src) : null);
            if (!img) return false;

            ctx.save();
            ctx.beginPath();
            ctx.rect(clipX, clipY, clipW, clipH);
            ctx.clip();

            ctx.translate(under.x || 0, under.y || 0);
            if (under.rotation) {
                ctx.translate(under.width / 2, under.height / 2);
                ctx.rotate(under.rotation * Math.PI / 180);
                ctx.translate(-under.width / 2, -under.height / 2);
            }
            ctx.globalAlpha = typeof under.opacity !== 'undefined' ? under.opacity : 1;
            if ((under.borderRadius || 0) > 0) {
                CanvasBase.roundRect(ctx, 0, 0, under.width, under.height, under.borderRadius);
                ctx.clip();
            }
            CanvasBase.drawImageWithFit(
                ctx, img, 0, 0, under.width, under.height,
                under.objectFit || 'contain'
            );
            ctx.restore();
            return true;
        }

        // Reset composite state
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur  = 0;

        // ── PASS 1: Erase / restore each clock region ────────────────────
        for (var i = 0; i < clockElements.length; i++) {
            var el  = clockElements[i];
            var pad = 2;
            var cx  = (el.x || 0) - pad;
            var cy  = (el.y || 0) - pad;
            var cw  = el.width  + pad * 2;
            var ch  = el.height + pad * 2;

            // Step 1 — restore canvas-level background
            if (_bgType === 'image' && cachedBgImage) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(cx, cy, cw, ch);
                ctx.clip();
                ctx.globalAlpha = cachedBgOpacity;
                CanvasBase.drawImageWithFit(ctx, cachedBgImage, 0, 0,
                    _canvasCfg.width, _canvasCfg.height, cachedBgFit);
                ctx.restore();
                ctx.globalAlpha = 1;
            } else if (_bgType === 'video') {
                // Video bg: clear to transparent so video DOM layer shows through
                ctx.clearRect(cx, cy, cw, ch);
            } else {
                ctx.fillStyle = _bgColor;
                ctx.fillRect(cx, cy, cw, ch);
            }

            // Step 2 — repaint underlay elements that overlap this clock region
            for (var k = 0; k < underlayElements.length; k++) {
                var under = underlayElements[k];
                if (!overlaps(cx, cy, cw, ch,
                              under.x || 0, under.y || 0,
                              under.width || 0, under.height || 0)) {
                    continue;
                }

                var elType = (under.type || '').toLowerCase();

                if (elType === 'image') {
                    // Synchronous repaint using cached loaded Image object
                    drawImageElement(under, cx, cy, cw, ch);
                } else {
                    // Other types: re-render clipped to the clock region
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(cx, cy, cw, ch);
                    ctx.clip();
                    try {
                        renderElement(ctx, under, currentCanvas);
                    } catch (e) {
                        console.warn('[CanvasRenderer] updateClocks underlay error:',
                                     under.name || under.id, e);
                    }
                    ctx.restore();
                }
            }
        }

        // ── PASS 2: Redraw all clock texts on clean backgrounds ───────────
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        for (var j = 0; j < clockElements.length; j++) {
            CanvasClock.render(ctx, clockElements[j]);
        }

        ctx.restore();
    }

    /**
     * Clear canvas and re-render
     */
    function refresh() {
        var canvas = document.getElementById('templateCanvas');
        if (canvas) {
            var ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        render();
    }

    /**
     * ðŸ”¥ OPTIMIZED ANIMATION LOOP - ONLY UPDATES CLOCKS
     */
    function startAnimationLoop() {
        console.log('[CanvasRenderer] ðŸŽ¬ Starting animation loop (clocks only)...');
        
        // Stop any existing animation
        if (animationFrameId) {
            clearInterval(animationFrameId);
        }

        // Update only clocks every second
        animationFrameId = setInterval(function() {
            updateClocks();
        }, 1000);

        console.log('[CanvasRenderer] âœ… Animation loop started');
    }

    /**
     * Stop animation loop
     */
    function stopAnimationLoop() {
        if (animationFrameId) {
            clearInterval(animationFrameId);
            animationFrameId = null;
            console.log('[CanvasRenderer] â¹ï¸ Animation loop stopped');
        }
    }

    /**
     * Cleanup - remove GIF overlays, animation overlays and stop slideshows
     */
    function cleanup() {
        stopAnimationLoop();

        if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.cleanup) {
            CanvasAnimation.cleanup();
        }
        if (typeof CanvasGif !== 'undefined' && CanvasGif.cleanup) {
            CanvasGif.cleanup();
        }
        if (typeof CanvasSlideshow !== 'undefined' && CanvasSlideshow.cleanup) {
            CanvasSlideshow.cleanup();
        }
        if (typeof CanvasBackground !== 'undefined' && CanvasBackground.cleanup) {
            CanvasBackground.cleanup();
        }
        if (typeof CanvasAction !== 'undefined' && CanvasAction.cleanup) {
            CanvasAction.cleanup();
        }
        if (typeof CanvasWeather !== 'undefined' && CanvasWeather.cleanup) {
            CanvasWeather.cleanup();
        }
        if (typeof CanvasRss !== 'undefined' && CanvasRss.cleanup) {
            CanvasRss.cleanup();
        }
        if (typeof CanvasTicker !== 'undefined' && CanvasTicker.cleanup) {
            CanvasTicker.cleanup();
        }
    }

    // Public API
    return {
        render: render,
        refresh: refresh,
        updateClocks: updateClocks,
        startAnimationLoop: startAnimationLoop,
        stopAnimationLoop: stopAnimationLoop,
        cleanup: cleanup,
        // Expose cached bg image so other renderers (slideshow) can repaint bg
        get _cachedBgImage() { return cachedBgImage; },
        get _cachedBgFit()   { return cachedBgFit;   },
        get _cachedBgOpacity(){ return cachedBgOpacity; }
    };
})();

// Expose globally for backward compatibility
window.renderTemplateCanvas = function(onReady) { CanvasRenderer.render(onReady); };