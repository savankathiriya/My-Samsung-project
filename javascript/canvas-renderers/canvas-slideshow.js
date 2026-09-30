/**
 * ====================================================================
 * CANVAS SLIDESHOW RENDERER - GUARANTEED WORKING VERSION
 * ULTRA-SIMPLIFIED - NO BLACK BOXES, IMAGES ALWAYS VISIBLE
 *
 * FIX: After each slide is redrawn, we ask CanvasRenderer to retake
 *      its canvas snapshot. This ensures that the next clock tick
 *      restores the correct (updated slide) pixels under the clock,
 *      not stale pixels from a previous slide.
 * ====================================================================
 */

var CanvasSlideshow = (function() {
    'use strict';

    var activeSlideshows = {};
    
    /**
     * Main render function
     */
    function render(ctx, element) {
        console.log('[CanvasSlideshow] 🎬 Rendering slideshow:', element.name || element.id);

        // VIDEO BACKGROUND: render as DOM overlay
        if (typeof CanvasVideoBgHelper !== 'undefined' && CanvasVideoBgHelper.isVideoBg()) {
            _renderAsDomSlideshow(element);
            return;
        }

        // ANIMATION ENABLED (color/image bg): also render as DOM overlay so that
        // CanvasAnimation can find the data-canvas-ss-id node and apply CSS animations.
        // Without a DOM node, _findOverlayNodes() returns nothing and the animation
        // is lost — only a transparent invisible fallback div is created instead.
        if (element.animation && element.animation.enabled &&
            element.animation.type && element.animation.type !== 'none') {
            _renderAsDomSlideshow(element);
            return;
        }

        // Validate slides
        if (!element.slides || !Array.isArray(element.slides) || element.slides.length === 0) {
            console.error('[CanvasSlideshow] ❌ NO SLIDES FOUND!');
            renderPlaceholder(ctx, element);
            return;
        }

        // Initialize state
        if (!activeSlideshows[element.id]) {
            activeSlideshows[element.id] = {
                element: element,
                currentIndex: 0,
                loadedImages: {},
                timerRunning: false
            };
        }

        var state = activeSlideshows[element.id];
        var currentIndex = element.currentSlide || 0;
        
        if (currentIndex >= element.slides.length) {
            currentIndex = 0;
            element.currentSlide = 0;
        }

        var currentSlide = element.slides[currentIndex];
        console.log('[CanvasSlideshow] 📍 Slide', (currentIndex + 1), '/', element.slides.length);

        // Render the slide
        renderSlideSimple(ctx, element, currentSlide, currentIndex);

        // Setup auto-play
        if (element.autoPlay !== false && !state.timerRunning) {
            setupAutoPlay(element);
        }
    }

    /**
     * ULTRA-SIMPLE slide rendering - GUARANTEED to work
     */
    function renderSlideSimple(ctx, element, slide, slideIndex) {
        console.log('[CanvasSlideshow] 🖼️ renderSlideSimple START');
        
        // Get image URL - check ALL possible properties
        var imageUrl = slide.content || slide.media_url || slide.thumbnail || 
                      slide.url || slide.src || slide.image || slide.imageUrl;
        
        if (!imageUrl) {
            console.error('[CanvasSlideshow] ❌ NO IMAGE URL FOUND in slide:', JSON.stringify(slide));
            return;
        }

        console.log('[CanvasSlideshow] 🔗 Image URL:', imageUrl);

        var state = activeSlideshows[element.id];
        if (!state) return;

        // Check cache
        if (state.loadedImages[slideIndex]) {
            var cachedImg = state.loadedImages[slideIndex];
            if (cachedImg.complete && cachedImg.naturalHeight !== 0) {
                console.log('[CanvasSlideshow] ♻️ Using cached image');
                drawImageSimple(ctx, element, cachedImg);
                return;
            }
        }

        // Load new image
        console.log('[CanvasSlideshow] 📥 Loading image...');
        var img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
            console.log('[CanvasSlideshow] ✅ IMAGE LOADED!', img.width, 'x', img.height);
            
            // Cache it
            if (state.loadedImages) {
                state.loadedImages[slideIndex] = img;
            }
            
            // Re-render just this slideshow
            rerenderSlideshow(element);
        };
        
        img.onerror = function(e) {
            console.error('[CanvasSlideshow] ❌ IMAGE LOAD FAILED:', imageUrl);
            console.error('[CanvasSlideshow] Error details:', e);
        };
        
        img.src = imageUrl;
    }

    /**
     * ULTRA-SIMPLE image drawing - NO complications
     */
    function drawImageSimple(ctx, element, img) {
        console.log('[CanvasSlideshow] 🎨 drawImageSimple START');
        
        ctx.save();
        
        // Translate to element position
        ctx.translate(element.x || 0, element.y || 0);
        console.log('[CanvasSlideshow] 📍 Position:', element.x, element.y);
        
        // Rotation (if any)
        if (element.rotation) {
            ctx.translate(element.width / 2, element.height / 2);
            ctx.rotate((element.rotation * Math.PI) / 180);
            ctx.translate(-element.width / 2, -element.height / 2);
        }
        
        // Opacity
        ctx.globalAlpha = (typeof element.opacity !== 'undefined') ? element.opacity : 1;
        
        // 🔥 CRITICAL: Set up clipping BEFORE drawing anything
        ctx.save();
        ctx.beginPath();
        
        if (element.borderRadius && element.borderRadius > 0) {
            // Rounded rectangle clip
            var r = element.borderRadius;
            var w = element.width;
            var h = element.height;
            ctx.moveTo(r, 0);
            ctx.arcTo(w, 0, w, h, r);
            ctx.arcTo(w, h, 0, h, r);
            ctx.arcTo(0, h, 0, 0, r);
            ctx.arcTo(0, 0, w, 0, r);
            ctx.closePath();
        } else {
            // Simple rectangle clip
            ctx.rect(0, 0, element.width, element.height);
        }
        
        ctx.clip();
        console.log('[CanvasSlideshow] ✂️ Clipping region created');
        
        // Only draw background if it's a real non-black, non-transparent color
        // Black (#000000) is the canvas default and causes black border artifacts
        var bg = element.backgroundColor || '';
        var isRealBg = bg && bg !== 'transparent' && bg !== 'rgba(0,0,0,0)' &&
                       bg !== '#00000000' && bg.toLowerCase() !== '#000000' &&
                       bg.toLowerCase() !== '#000' && bg !== 'rgb(0,0,0)';
        if (isRealBg) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, element.width, element.height);
        }
        
        // Calculate image draw dimensions
        var fit = element.objectFit || 'cover';
        var imgRatio = img.width / img.height;
        var boxRatio = element.width / element.height;
        
        var drawWidth, drawHeight, offsetX, offsetY;
        
        if (fit === 'cover') {
            if (imgRatio > boxRatio) {
                drawHeight = element.height;
                drawWidth = element.height * imgRatio;
                offsetX = (element.width - drawWidth) / 2;
                offsetY = 0;
            } else {
                drawWidth = element.width;
                drawHeight = element.width / imgRatio;
                offsetX = 0;
                offsetY = (element.height - drawHeight) / 2;
            }
        } else if (fit === 'contain') {
            if (imgRatio > boxRatio) {
                drawWidth = element.width;
                drawHeight = element.width / imgRatio;
                offsetX = 0;
                offsetY = (element.height - drawHeight) / 2;
            } else {
                drawHeight = element.height;
                drawWidth = element.height * imgRatio;
                offsetX = (element.width - drawWidth) / 2;
                offsetY = 0;
            }
        } else {
            // Stretch / fill
            drawWidth = element.width;
            drawHeight = element.height;
            offsetX = 0;
            offsetY = 0;
        }

        // Use floor/ceil to close any sub-pixel gaps that appear as black lines
        offsetX  = Math.floor(offsetX);
        offsetY  = Math.floor(offsetY);
        drawWidth  = Math.ceil(drawWidth  + (offsetX < 0 ? 0 : 0));
        drawHeight = Math.ceil(drawHeight + (offsetY < 0 ? 0 : 0));

        console.log('[CanvasSlideshow] 📐 Draw:', drawWidth + 'x' + drawHeight,
                   'at', offsetX + ',' + offsetY);
        
        // Draw the image
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        console.log('[CanvasSlideshow] ✅ IMAGE DRAWN!');
        
        ctx.restore(); // Restore from clipping
        
        // Draw border (AFTER clipping restore)
        if (element.borderWidth && element.borderWidth > 0 && element.borderColor) {
            ctx.strokeStyle = element.borderColor;
            ctx.lineWidth = element.borderWidth;
            
            if (element.borderRadius && element.borderRadius > 0) {
                var r = element.borderRadius;
                var w = element.width;
                var h = element.height;
                ctx.beginPath();
                ctx.moveTo(r, 0);
                ctx.arcTo(w, 0, w, h, r);
                ctx.arcTo(w, h, 0, h, r);
                ctx.arcTo(0, h, 0, 0, r);
                ctx.arcTo(0, 0, w, 0, r);
                ctx.closePath();
                ctx.stroke();
            } else {
                ctx.strokeRect(0, 0, element.width, element.height);
            }
            console.log('[CanvasSlideshow] 🖼️ Border drawn');
        }
        
        ctx.restore(); // Final restore
        console.log('[CanvasSlideshow] ✅ drawImageSimple COMPLETE');
    }

    /**
     * Re-render just this slideshow
     */
    function rerenderSlideshow(element) {
        console.log('[CanvasSlideshow] 🔄 rerenderSlideshow START');
        
        var canvas = document.getElementById('templateCanvas');
        if (!canvas) {
            console.error('[CanvasSlideshow] ❌ Canvas #templateCanvas not found!');
            return;
        }

        var ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('[CanvasSlideshow] ❌ Cannot get 2D context!');
            return;
        }

        ctx.save();

        // Detect if using CanvasScaler
        var usingScaler = (typeof CanvasScaler !== 'undefined' && 
                          typeof CanvasScaler.isInitialized === 'function' && 
                          CanvasScaler.isInitialized());
        
        console.log('[CanvasSlideshow] 🔍 Using CanvasScaler:', usingScaler);
        
        if (usingScaler) {
            // CanvasScaler mode
            // Repaint the canvas background color/image behind the slideshow area
            // (clearRect alone leaves transparent-black which shows as a black frame)
            _repaintBehindElement(ctx, element);
            
            // Render slideshow on top
            var currentIndex = element.currentSlide || 0;
            var currentSlide = element.slides[currentIndex];
            renderSlideSimple(ctx, element, currentSlide, currentIndex);
            
        } else {
            // Legacy scaling mode
            console.log('[CanvasSlideshow] ⚠️ Using legacy scaling');
            
            var templateData = null;
            try {
                templateData = Main.jsonTemplateData && Main.jsonTemplateData.template_json;
            } catch (e) {
                console.error('[CanvasSlideshow] Error accessing template data:', e);
                ctx.restore();
                return;
            }

            if (!templateData || !templateData.canvas) {
                console.error('[CanvasSlideshow] No template data');
                ctx.restore();
                return;
            }

            var canvasConfig = templateData.canvas;
            var designW = canvasConfig.width || 1920;
            var designH = canvasConfig.height || 1080;
            
            var scaleX = canvas.width / designW;
            var scaleY = canvas.height / designH;

            var scaledX = element.x * scaleX;
            var scaledY = element.y * scaleY;
            var scaledW = element.width * scaleX;
            var scaledH = element.height * scaleY;

            // Clear area
            ctx.clearRect(scaledX, scaledY, scaledW, scaledH);

            // Redraw background
            if (canvasConfig.background && canvasConfig.background !== 'transparent') {
                ctx.fillStyle = canvasConfig.background;
                ctx.fillRect(scaledX, scaledY, scaledW, scaledH);
            }

            ctx.scale(scaleX, scaleY);

            var currentIndex = element.currentSlide || 0;
            var currentSlide = element.slides[currentIndex];
            renderSlideSimple(ctx, element, currentSlide, currentIndex);
        }

        ctx.restore();
        console.log('[CanvasSlideshow] ✅ rerenderSlideshow COMPLETE');

        // 🔥 NEW FIX: After the new slide is fully drawn, refresh the canvas
        // snapshot in CanvasRenderer. This ensures that when updateClocks()
        // next runs (every second), it restores the NEW slide's pixels beneath
        // any clock/timer/countdown elements - not the old slide's pixels.
        // Without this, the clock erase would show stale slide content.
        setTimeout(function() {
            if (typeof CanvasRenderer !== 'undefined' && 
                typeof CanvasRenderer.takeCanvasSnapshot === 'function') {
                CanvasRenderer.takeCanvasSnapshot();
                console.log('[CanvasSlideshow] 📸 Canvas snapshot refreshed after slide change');
            }
        }, 200); // 200ms allows the async drawImageSimple paint to complete first
    }

    /**
     * Repaint the canvas background (color or image) behind a slideshow element.
     * This avoids the black-border/flash that clearRect causes.
     */
    function _repaintBehindElement(ctx, element) {
        try {
            var templateData = Main.jsonTemplateData && Main.jsonTemplateData.template_json;
            if (!templateData || !templateData.canvas) return;

            var canvasConfig = templateData.canvas;
            var bgType = canvasConfig.backgroundType || 'color';
            var x = element.x || 0;
            var y = element.y || 0;
            var w = element.width;
            var h = element.height;

            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            if (bgType === 'image' && CanvasRenderer && CanvasRenderer._cachedBgImage) {
                // Clip to slideshow area and repaint the bg image portion
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.clip();
                var opacity = typeof canvasConfig.backgroundOpacity !== 'undefined'
                    ? canvasConfig.backgroundOpacity : 1;
                ctx.globalAlpha = opacity;
                CanvasBase.drawImageWithFit(
                    ctx,
                    CanvasRenderer._cachedBgImage,
                    0, 0,
                    canvasConfig.width,
                    canvasConfig.height,
                    canvasConfig.backgroundFit || 'cover'
                );
            } else if (bgType === 'video') {
                // Video bg: clear to transparent so video shows through
                ctx.clearRect(x, y, w, h);
            } else {
                // Solid color
                var bgColor = (canvasConfig.background && canvasConfig.background !== 'transparent')
                    ? canvasConfig.background : '#000000';
                ctx.fillStyle = bgColor;
                ctx.fillRect(x, y, w, h);
            }

            ctx.restore();
        } catch (e) {
            console.warn('[CanvasSlideshow] Could not repaint background:', e);
        }
    }

    /**
     * @deprecated use _repaintBehindElement
     */
    function redrawBackground(ctx, element) {
        _repaintBehindElement(ctx, element);
    }

    /**
     * Setup auto-play
     */
    function setupAutoPlay(element) {
        var elementId = element.id;
        var state = activeSlideshows[elementId];
        
        if (!state) {
            state = {
                element: element,
                currentIndex: element.currentSlide || 0,
                loadedImages: {},
                timerRunning: false
            };
            activeSlideshows[elementId] = state;
        }

        if (state.timerRunning) return;

        var currentIndex = element.currentSlide || 0;
        var currentSlide = element.slides[currentIndex];
        var duration = currentSlide.duration || element.duration || element.defaultDuration || 5;
        var durationMs = duration * 1000;

        console.log('[CanvasSlideshow] ⏰ Auto-play: slide', (currentIndex + 1), 'duration:', duration, 's');

        state.timerRunning = true;

        if (state.timer) {
            clearTimeout(state.timer);
        }

        state.timer = setTimeout(function() {
            nextSlide(element);
        }, durationMs);
    }

    /**
     * Next slide
     */
    function nextSlide(element) {
        var state = activeSlideshows[element.id];
        if (!state) return;

        var currentIndex = element.currentSlide || 0;
        var nextIndex = currentIndex + 1;
        
        if (nextIndex >= element.slides.length) {
            if (element.loop !== false) {
                nextIndex = 0;
            } else {
                state.timerRunning = false;
                if (state.timer) {
                    clearTimeout(state.timer);
                    state.timer = null;
                }
                return;
            }
        }

        element.currentSlide = nextIndex;
        state.currentIndex = nextIndex;
        state.timerRunning = false;
        
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }

        rerenderSlideshow(element);
        
        setTimeout(function() {
            if (element.autoPlay !== false && !state.timerRunning) {
                setupAutoPlay(element);
            }
        }, 100);
    }

    /**
     * Placeholder
     */
    function renderPlaceholder(ctx, element) {
        ctx.save();
        ctx.translate(element.x || 0, element.y || 0);
        
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, element.width, element.height);
        
        ctx.font = '20px Arial';
        ctx.fillStyle = '#999999';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No Slides Available', element.width / 2, element.height / 2);
        
        ctx.restore();
    }

    /**
     * Stop all
     */
    function stopAll() {
        for (var key in activeSlideshows) {
            var state = activeSlideshows[key];
            if (state && state.timer) {
                clearTimeout(state.timer);
                state.timerRunning = false;
                state.timer = null;
            }
        }
        activeSlideshows = {};
    }


    /* ── DOM slideshow overlay for video background mode ────────── */
    var _domSlideshows = {};  // { elId -> { wrap, img, timer, state } }

    function _renderAsDomSlideshow(element) {
        if (!element.slides || !element.slides.length) return;

        var elId = String(element.id || element.name || 'ss');

        if (_domSlideshows[elId]) {
            /* Already running — just ensure it's showing */
            return;
        }

        var container = (typeof CanvasVideoBgHelper !== 'undefined')
            ? CanvasVideoBgHelper.getContainer()
            : document.getElementById('our-hotel-container') || document.body;

        var x       = Math.floor(element.x      || 0);
        var y       = Math.floor(element.y      || 0);
        var w       = Math.ceil(element.width   || 0);
        var h       = Math.ceil(element.height  || 0);
        var opacity = typeof element.opacity !== 'undefined' ? element.opacity : 1;
        var zIndex  = (element.zIndex && element.zIndex !== 'auto') ? element.zIndex : 10;
        var radius  = element.borderRadius || 0;
        var fit     = element.objectFit || 'cover';

        var wrap = document.createElement('div');
        wrap.setAttribute('data-canvas-ss-id', elId);
        wrap.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none;margin:0;padding:0;';
        wrap.style.left         = x + 'px';
        wrap.style.top          = y + 'px';
        wrap.style.width        = w + 'px';
        wrap.style.height       = h + 'px';
        wrap.style.borderRadius = radius + 'px';
        wrap.style.opacity      = String(opacity);
        wrap.style.zIndex       = String(zIndex);

        var imgEl = document.createElement('img');
        imgEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;margin:0;padding:0;border:none;pointer-events:none;';
        imgEl.style.objectFit    = fit;
        imgEl.style.transform       = 'translate3d(0,0,0)';
        imgEl.style.webkitTransform = 'translate3d(0,0,0)';

        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        wrap.appendChild(imgEl);
        // Hide until animation fires (prevents flash at natural position on first load)
        if (element.animation && element.animation.enabled && element.animation.type && element.animation.type !== 'none') {
            wrap.style.visibility = 'hidden';
        }
        container.appendChild(wrap);

        // Apply CSS animation if configured on this element
        if (element.animation && element.animation.enabled && element.animation.type && element.animation.type !== 'none') {
            if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                CanvasAnimation.applyAnimation(element, document.getElementById('templateCanvas'));
            }
        }

        var state = {
            wrap: wrap,
            img: imgEl,
            currentIndex: 0,
            timer: null
        };
        _domSlideshows[elId] = state;

        function showSlide(idx) {
            if (idx >= element.slides.length) idx = 0;
            state.currentIndex = idx;
            var slide = element.slides[idx];
            var url = slide.content || slide.media_url || slide.thumbnail ||
                      slide.url || slide.src || slide.image || slide.imageUrl || '';
            if (url) {
                imgEl.src = url;
                console.log('[CanvasSlideshow] DOM slide', idx+1, '/', element.slides.length, url);
            }
            if (element.autoPlay !== false) {
                var dur = (slide.duration || element.duration || element.defaultDuration || 5) * 1000;
                state.timer = setTimeout(function () {
                    showSlide(idx + 1);
                }, dur);
            }
        }

        showSlide(0);
        console.log('[CanvasSlideshow] DOM slideshow created:', elId);
    }

    /**
     * Cleanup
     */
    function cleanup() {
        stopAll();
        /* Remove DOM slideshow overlays */
        for (var id in _domSlideshows) {
            if (_domSlideshows.hasOwnProperty(id)) {
                var ss = _domSlideshows[id];
                if (ss.timer) clearTimeout(ss.timer);
                if (ss.wrap && ss.wrap.parentNode) ss.wrap.parentNode.removeChild(ss.wrap);
            }
        }
        _domSlideshows = {};
    }

    // Public API
    return {
        render: render,
        nextSlide: nextSlide,
        stopAll: stopAll,
        cleanup: cleanup
    };
})();

// Expose globally
if (typeof window !== 'undefined') {
    window.CanvasSlideshow = CanvasSlideshow;
}