/**
 * ====================================================================
 * CANVAS GIF ELEMENT RENDERER - COMPLETE LG TV FIX
 * ✅ MATCHES VIDEO POSITIONING
 * ✅ WORKS ON ACTUAL LG TV HARDWARE
 * ✅ NO BLACK GAPS
 * ====================================================================
 */

var CanvasGif = (function() {
    'use strict';

    /**
     * Render GIF element (automatically uses HTML overlay for animation)
     */
    function render(ctx, el, canvas) {
        if (!el.src) {
            console.warn('[CanvasGif] GIF element missing src:', el.name || el.id);
            return;
        }
        
        console.log('[CanvasGif] Rendering animated GIF:', el.name || el.id);
        
        // Get canvas element if not provided
        if (!canvas) {
            canvas = document.getElementById('templateCanvas');
        }
        
        if (!canvas) {
            console.error('[CanvasGif] Canvas element not found');
            return;
        }
        
        // Use HTML overlay method for proper GIF animation
        renderAnimated(ctx, el, canvas);
    }

    /**
     * ✅ COMPLETE FIX: Position GIF correctly on LG TV (matches video approach)
     */
    function renderAnimated(ctx, el, canvas) {
        if (!el.src) {
            console.warn('[CanvasGif] GIF element missing src:', el.name || el.id);
            return;
        }
        
        console.log('[CanvasGif] Creating animated GIF overlay:', el.name || el.id);
        console.log('[CanvasGif] GIF source:', el.src);
        
        // Get canvas container
        var container = canvas.parentElement;
        if (!container) {
            console.error('[CanvasGif] No parent container found for canvas');
            return;
        }
        
        // ✅ Element positions are ALREADY SCALED by CanvasScaler
        // We just need to position relative to canvas which is at 0,0
        console.log('[CanvasGif] Element position (already scaled):', el.x, ',', el.y);
        console.log('[CanvasGif] Element size (already scaled):', el.width, 'x', el.height);
        
        // Create img element overlay for GIF animation
        // NOTE: Do NOT set .src yet — attach listeners first so cached images
        // don't fire load before we can hear it.
        var gifOverlay = document.createElement('img');
        gifOverlay.className = 'gif-overlay-element';
        gifOverlay.setAttribute('data-element-id', el.id || el.name);
        
        // ✅ FIX: Use EXACT scaled coordinates (no additional calculation needed)
        var left = Math.floor(el.x);
        var top = Math.floor(el.y);
        var width = Math.ceil(el.width);
        var height = Math.ceil(el.height);
        
        console.log('[CanvasGif] GIF overlay position:');
        console.log('[CanvasGif]   left:', left + 'px');
        console.log('[CanvasGif]   top:', top + 'px');
        console.log('[CanvasGif]   width:', width + 'px');
        console.log('[CanvasGif]   height:', height + 'px');
        
        // ✅ CRITICAL: Use ABSOLUTE positioning relative to container (same as video)
        gifOverlay.style.position = 'absolute';
        gifOverlay.style.left = left + 'px';
        gifOverlay.style.top = top + 'px';
        gifOverlay.style.width = width + 'px';
        gifOverlay.style.height = height + 'px';
        
        // Remove all margins and padding
        gifOverlay.style.margin = '0';
        gifOverlay.style.padding = '0';
        gifOverlay.style.border = 'none';
        gifOverlay.style.outline = 'none';
        
        // Box sizing
        gifOverlay.style.boxSizing = 'border-box';
        
        // Ensure GIF is visible
        gifOverlay.style.display = 'block';
        // If animation is configured, start hidden so the element is never
        // seen at its natural position before the animation fires.
        // canvas-animation.js _applyToNode() sets visibility:visible.
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            gifOverlay.style.visibility = 'hidden';
        } else {
            gifOverlay.style.visibility = 'visible';
        }
        
        // Opacity
        var opacity = (typeof el.opacity !== 'undefined' ? el.opacity : 1);
        gifOverlay.style.opacity = opacity;
        console.log('[CanvasGif]   opacity:', opacity);
        
        // Prevent interaction
        gifOverlay.style.pointerEvents = 'none';
        
        // Z-index: must be above the canvas (z-index:2) so GIFs appear on top
        // of the canvas layer. Use element zIndex if set, else default to 10.
        var zIndex = (el.zIndex && el.zIndex !== 'auto') ? el.zIndex : 10;
        gifOverlay.style.zIndex = String(zIndex);
        console.log('[CanvasGif]   zIndex:', zIndex);
        
        // Object fit (similar to canvas drawImageWithFit)
        var objectFit = el.objectFit || 'contain';
        gifOverlay.style.objectFit = objectFit;
        console.log('[CanvasGif]   objectFit:', objectFit);
        
        // ✅ Hardware acceleration for smooth animation on LG TV
        gifOverlay.style.transform = 'translate3d(0, 0, 0)';
        gifOverlay.style.webkitTransform = 'translate3d(0, 0, 0)';
        
        // Border radius
        if (el.borderRadius && el.borderRadius > 0) {
            var radius = Math.round(el.borderRadius);
            gifOverlay.style.borderRadius = radius + 'px';
            gifOverlay.style.overflow = 'hidden';
            console.log('[CanvasGif]   borderRadius:', radius + 'px');
        }
        
        // Rotation
        if (el.rotation && el.rotation !== 0) {
            var currentTransform = gifOverlay.style.transform;
            gifOverlay.style.transform = currentTransform + ' rotate(' + el.rotation + 'deg)';
            gifOverlay.style.transformOrigin = 'center center';
            console.log('[CanvasGif]   rotation:', el.rotation + 'deg');
        }
        
        // ✅ Ensure container is positioned relatively
        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        // ✅ Append to DOM first, THEN attach listeners, THEN set src.
        //    This order guarantees:
        //    1. Element is in the DOM before load fires (needed for animation targeting)
        //    2. Listeners are registered before src is assigned (avoids missed load
        //       when the image is already cached by the browser)
        container.appendChild(gifOverlay);

        function _applyGifAnimation() {
            if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
                if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                    CanvasAnimation.applyAnimation(el, canvas);
                }
            }
        }

        gifOverlay.addEventListener('load', function() {
            console.log('[CanvasGif] ✓ GIF loaded successfully:', el.name || el.id);
            // Apply CSS animation AFTER the image is loaded and painted.
            // On first page visit with backgroundType=image, calling applyAnimation
            // inline (before load) causes requestAnimationFrame to fire before the
            // element is composited — the element snaps to final position instantly.
            // Triggering from onload guarantees the element is visible first.
            _applyGifAnimation();
        });

        gifOverlay.addEventListener('error', function() {
            console.error('[CanvasGif] ✗ GIF failed to load:', el.name || el.id);
            console.error('[CanvasGif] GIF src:', el.src);
            showGifError(gifOverlay, el);
        });

        // Set src last — for cached GIFs, load fires synchronously here.
        // If the image is already complete (e.g. revisiting the page),
        // onload won't fire again so we manually trigger animation.
        gifOverlay.src = el.src;
        if (gifOverlay.complete && gifOverlay.naturalWidth > 0) {
            console.log('[CanvasGif] ✓ GIF already cached:', el.name || el.id);
            _applyGifAnimation();
        }

        console.log('[CanvasGif] ✓ Animated GIF overlay created and added to container');
    }

    /**
     * Show error message when GIF fails to load
     */
    function showGifError(gifElement, el) {
        var errorDiv = document.createElement('div');
        errorDiv.className = 'gif-error-overlay';
        errorDiv.style.position = 'absolute';
        errorDiv.style.left = gifElement.style.left;
        errorDiv.style.top = gifElement.style.top;
        errorDiv.style.width = gifElement.style.width;
        errorDiv.style.height = gifElement.style.height;
        errorDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        errorDiv.style.color = '#ff6b6b';
        errorDiv.style.display = 'flex';
        errorDiv.style.flexDirection = 'column';
        errorDiv.style.alignItems = 'center';
        errorDiv.style.justifyContent = 'center';
        errorDiv.style.fontSize = '18px';
        errorDiv.style.padding = '20px';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.zIndex = gifElement.style.zIndex;
        errorDiv.innerHTML = '⚠️<br><br>GIF Load Failed<br><br><small style="color:#aaa;">Check console for details</small>';
        
        gifElement.style.display = 'none';
        gifElement.parentElement.appendChild(errorDiv);
    }

    /**
     * Clean up all GIF overlays (call this before re-rendering)
     */
    function cleanup() {
        console.log('[CanvasGif] Cleaning up GIF overlays');
        
        var overlays = document.querySelectorAll('.gif-overlay-element');
        console.log('[CanvasGif] Found', overlays.length, 'GIF overlays to clean up');
        
        for (var i = 0; i < overlays.length; i++) {
            if (overlays[i].parentNode) {
                overlays[i].parentNode.removeChild(overlays[i]);
            }
        }
        
        var errors = document.querySelectorAll('.gif-error-overlay');
        for (var j = 0; j < errors.length; j++) {
            if (errors[j].parentNode) {
                errors[j].parentNode.removeChild(errors[j]);
            }
        }
        
        console.log('[CanvasGif] Cleanup complete');
    }

    // Public API
    return {
        render: render,
        renderAnimated: renderAnimated,
        cleanup: cleanup
    };
})();