/**
 * ====================================================================
 * CANVAS ANIMATION MODULE - LG PRO:CENTRIC TV
 * ====================================================================
 * Applies CSS keyframe animations to DOM overlay elements rendered by
 * CanvasGif, CanvasImage, CanvasText, CanvasClock, CanvasWeather,
 * CanvasRss, and CanvasAction.
 *
 * HOW IT WORKS:
 * - Each renderer (text, clock, weather, image, gif, action, rss)
 *   calls CanvasAnimation.applyAnimation(el, canvas) immediately after
 *   creating and appending its DOM overlay element.
 * - CanvasRenderer.renderAllElements() also calls applyAllAnimations()
 *   after all elements are rendered as a safety pass.
 * - For canvas-drawn elements with no DOM overlay, a transparent
 *   animated wrapper div is created as a fallback.
 *
 * ANIMATION DATA (element.animation in template_json):
 * {
 *   enabled: true,
 *   type: "fade|slide|zoom|scale|bounce|rotate|flip|pulse|shake|swing|jello|pan|pop|peek|wipe",
 *   inOut: "in|out|both",
 *   duration: 1000,          // ms
 *   delay: 0,                // ms
 *   timing: "ease",          // CSS timing function
 *   direction: "normal",     // CSS animation-direction
 *   iterations: 1,           // number or "infinite"
 *   slideDirection: "left|right|top|bottom",
 *   rotateAxis: "x|y|z",
 *   flipAxis: "horizontal|vertical"
 * }
 * ====================================================================
 */

var CanvasAnimation = (function () {
    'use strict';

    var _styleInjected = false;
    var _styleTagId    = 'canvas-animation-keyframes';

    // ----------------------------------------------------------------
    // CSS KEYFRAMES
    // ----------------------------------------------------------------
    var KEYFRAMES_CSS = [
        /* Fade */
        '@keyframes fadeIn { from{opacity:0} to{opacity:1} }',
        '@keyframes fadeOut { from{opacity:1} to{opacity:0} }',
        '@keyframes fadeBoth { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }',

        /* Slide Left */
        '@keyframes slideInLeft  { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }',
        '@keyframes slideOutLeft { from{transform:translateX(0);opacity:1} to{transform:translateX(-100%);opacity:0} }',
        '@keyframes slideBothLeft { 0%{transform:translateX(-100%);opacity:0} 25%{opacity:1} 50%{transform:translateX(0);opacity:1} 75%{opacity:1} 100%{transform:translateX(100%);opacity:0} }',

        /* Slide Right */
        '@keyframes slideInRight  { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }',
        '@keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }',
        '@keyframes slideBothRight { 0%{transform:translateX(100%);opacity:0} 25%{opacity:1} 50%{transform:translateX(0);opacity:1} 75%{opacity:1} 100%{transform:translateX(-100%);opacity:0} }',

        /* Slide Top */
        '@keyframes slideInTop  { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }',
        '@keyframes slideOutTop { from{transform:translateY(0);opacity:1} to{transform:translateY(-100%);opacity:0} }',
        '@keyframes slideBothTop { 0%{transform:translateY(-100%);opacity:0} 25%{opacity:1} 50%{transform:translateY(0);opacity:1} 75%{opacity:1} 100%{transform:translateY(100%);opacity:0} }',

        /* Slide Bottom */
        '@keyframes slideInBottom  { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }',
        '@keyframes slideOutBottom { from{transform:translateY(0);opacity:1} to{transform:translateY(100%);opacity:0} }',
        '@keyframes slideBothBottom { 0%{transform:translateY(100%);opacity:0} 25%{opacity:1} 50%{transform:translateY(0);opacity:1} 75%{opacity:1} 100%{transform:translateY(-100%);opacity:0} }',

        /* Zoom */
        '@keyframes zoomIn   { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }',
        '@keyframes zoomOut  { from{transform:scale(1);opacity:1} to{transform:scale(0);opacity:0} }',
        '@keyframes zoomBoth { 0%{transform:scale(0);opacity:0} 50%{transform:scale(1);opacity:1} 100%{transform:scale(0);opacity:0} }',

        /* Scale */
        '@keyframes scaleIn   { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }',
        '@keyframes scaleOut  { from{transform:scale(1);opacity:1} to{transform:scale(1.5);opacity:0} }',
        '@keyframes scaleBoth { 0%{transform:scale(0.5);opacity:0} 50%{transform:scale(1);opacity:1} 100%{transform:scale(1.5);opacity:0} }',

        /* Bounce */
        '@keyframes bounceAnimation { 0%,20%,50%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-30px)} 60%{transform:translateY(-15px)} }',

        /* Rotate */
        '@keyframes rotateX { from{transform:rotateX(0deg)} to{transform:rotateX(360deg)} }',
        '@keyframes rotateY { from{transform:rotateY(0deg)} to{transform:rotateY(360deg)} }',
        '@keyframes rotateZ { from{transform:rotateZ(0deg)} to{transform:rotateZ(360deg)} }',

        /* Flip */
        '@keyframes flipHorizontal { from{transform:perspective(400px) rotateY(0)} to{transform:perspective(400px) rotateY(360deg)} }',
        '@keyframes flipVertical   { from{transform:perspective(400px) rotateX(0)} to{transform:perspective(400px) rotateX(360deg)} }',

        /* Pulse */
        '@keyframes pulseAnimation { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }',

        /* Shake */
        '@keyframes shakeAnimation { 0%,100%{transform:translateX(0)} 10%,30%,50%,70%,90%{transform:translateX(-10px)} 20%,40%,60%,80%{transform:translateX(10px)} }',

        /* Swing */
        '@keyframes swingAnimation { 20%{transform:rotate(15deg)} 40%{transform:rotate(-10deg)} 60%{transform:rotate(5deg)} 80%{transform:rotate(-5deg)} 100%{transform:rotate(0deg)} }',

        /* Jello */
        '@keyframes jelloAnimation {',
        '  0%,11.1%,100%{transform:none}',
        '  22.2%{transform:skewX(-12.5deg) skewY(-12.5deg)}',
        '  33.3%{transform:skewX(6.25deg) skewY(6.25deg)}',
        '  44.4%{transform:skewX(-3.125deg) skewY(-3.125deg)}',
        '  55.5%{transform:skewX(1.5625deg) skewY(1.5625deg)}',
        '  66.6%{transform:skewX(-0.78125deg) skewY(-0.78125deg)}',
        '  77.7%{transform:skewX(0.390625deg) skewY(0.390625deg)}',
        '  88.8%{transform:skewX(-0.1953125deg) skewY(-0.1953125deg)}',
        '}',

        /* Pan */
        '@keyframes panIn   { from{transform:scale(1.2);opacity:0} to{transform:scale(1);opacity:1} }',
        '@keyframes panOut  { from{transform:scale(1);opacity:1} to{transform:scale(1.2);opacity:0} }',
        '@keyframes panBoth { 0%{transform:scale(1.2);opacity:0} 50%{transform:scale(1);opacity:1} 100%{transform:scale(1.2);opacity:0} }',

        /* Pop */
        '@keyframes popIn   { 0%{transform:scale(0);opacity:0} 50%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} }',
        '@keyframes popOut  { 0%{transform:scale(1);opacity:1} 50%{transform:scale(1.2)} 100%{transform:scale(0);opacity:0} }',
        '@keyframes popBoth { 0%{transform:scale(0);opacity:0} 25%{transform:scale(1.2)} 50%{transform:scale(1);opacity:1} 75%{transform:scale(1.2)} 100%{transform:scale(0);opacity:0} }',

        /* Peek */
        '@keyframes peekIn   { 0%{transform:translateY(100%) scale(0.5);opacity:0} 100%{transform:translateY(0) scale(1);opacity:1} }',
        '@keyframes peekOut  { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(100%) scale(0.5);opacity:0} }',
        '@keyframes peekBoth { 0%{transform:translateY(100%) scale(0.5);opacity:0} 50%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(100%) scale(0.5);opacity:0} }',

        /* Wipe */
        '@keyframes wipeIn   { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0 0 0)} }',
        '@keyframes wipeOut  { from{clip-path:inset(0 0 0 0)} to{clip-path:inset(0 0 0 100%)} }',
        '@keyframes wipeBoth { 0%{clip-path:inset(0 100% 0 0)} 50%{clip-path:inset(0 0 0 0)} 100%{clip-path:inset(0 0 0 100%)} }'
    ].join('\n');

    // ----------------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------------

    function _cap(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }

    function _getAnimationName(anim) {
        var type  = anim.type  || 'none';
        var inOut = anim.inOut || 'in';

        switch (type) {
            case 'fade':
                return inOut === 'in' ? 'fadeIn' : inOut === 'out' ? 'fadeOut' : 'fadeBoth';
            case 'slide': {
                var dir = anim.slideDirection || 'left';
                if (inOut === 'in')  return 'slideIn'   + _cap(dir);
                if (inOut === 'out') return 'slideOut'  + _cap(dir);
                return 'slideBoth' + _cap(dir);
            }
            case 'zoom':
                return inOut === 'in' ? 'zoomIn' : inOut === 'out' ? 'zoomOut' : 'zoomBoth';
            case 'scale':
                return inOut === 'in' ? 'scaleIn' : inOut === 'out' ? 'scaleOut' : 'scaleBoth';
            case 'bounce':
                return 'bounceAnimation';
            case 'rotate':
                return 'rotate' + _cap(anim.rotateAxis || 'z');
            case 'flip':
                return 'flip' + _cap(anim.flipAxis || 'horizontal');
            case 'pulse':  return 'pulseAnimation';
            case 'shake':  return 'shakeAnimation';
            case 'swing':  return 'swingAnimation';
            case 'jello':  return 'jelloAnimation';
            case 'pan':
                return inOut === 'in' ? 'panIn' : inOut === 'out' ? 'panOut' : 'panBoth';
            case 'pop':
                return inOut === 'in' ? 'popIn' : inOut === 'out' ? 'popOut' : 'popBoth';
            case 'peek':
                return inOut === 'in' ? 'peekIn' : inOut === 'out' ? 'peekOut' : 'peekBoth';
            case 'wipe':
                return inOut === 'in' ? 'wipeIn' : inOut === 'out' ? 'wipeOut' : 'wipeBoth';
            default:
                return 'none';
        }
    }

    function _buildAnimationCSS(anim) {
        var name       = _getAnimationName(anim);
        var duration   = (anim.duration   || 1000) + 'ms';
        var delay      = (anim.delay      || 0)    + 'ms';
        var timing     = anim.timing      || 'ease';
        var direction  = anim.direction   || 'normal';
        var iterations = anim.iterations  || 1;
        return name + ' ' + duration + ' ' + delay + ' ' + timing + ' ' + direction + ' ' + iterations + ' both';
    }

    function _injectKeyframes() {
        if (_styleInjected) return;
        if (document.getElementById(_styleTagId)) { _styleInjected = true; return; }
        var style = document.createElement('style');
        style.id   = _styleTagId;
        style.type = 'text/css';
        try {
            style.appendChild(document.createTextNode(KEYFRAMES_CSS));
        } catch (e) {
            style.styleSheet.cssText = KEYFRAMES_CSS;
        }
        (document.head || document.getElementsByTagName('head')[0]).appendChild(style);
        _styleInjected = true;
        console.log('[CanvasAnimation] ✅ CSS keyframes injected');
    }

    // ----------------------------------------------------------------
    // DOM NODE FINDERS
    // Match the exact data-* attributes each renderer sets
    // ----------------------------------------------------------------

    function _findOverlayNodes(el) {
        var results = [];
        var id   = String(el.id   || '');
        var name = String(el.name || '');

        function push(node) {
            if (node && results.indexOf(node) === -1) results.push(node);
        }

        // CanvasGif: data-element-id
        if (id)   push(document.querySelector('[data-element-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-element-id="' + name + '"]'));

        // CanvasAction: data-action-overlay-id (image card overlay)
        if (id)   push(document.querySelector('[data-action-overlay-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-action-overlay-id="' + name + '"]'));

        // CanvasAction: data-action-btn-id (button/none displayMode overlay)
        if (id)   push(document.querySelector('[data-action-btn-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-action-btn-id="' + name + '"]'));

        // CanvasImage: data-canvas-image-id (the outer wrap — animate this, not the inner img)
        if (id)   push(document.querySelector('[data-canvas-image-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-image-id="' + name + '"]'));

        // CanvasQr: data-canvas-qr-id (the outer wrap — same pattern as CanvasImage)
        if (id)   push(document.querySelector('[data-canvas-qr-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-qr-id="' + name + '"]'));

        // CanvasText: data-canvas-text-id (the text div, not the bg div)
        if (id)   push(document.querySelector('[data-canvas-text-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-text-id="' + name + '"]'));

        // CanvasClock: data-canvas-clock-id
        if (id)   push(document.querySelector('[data-canvas-clock-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-clock-id="' + name + '"]'));

        // CanvasWeather: data-canvas-weather-id
        if (id)   push(document.querySelector('[data-canvas-weather-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-weather-id="' + name + '"]'));

        // CanvasShapes: data-canvas-shape-id
        if (id)   push(document.querySelector('[data-canvas-shape-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-shape-id="' + name + '"]'));

        // CanvasTicker: data-canvas-ticker-id (outer overlay — animate body, not inner scroll wrapper)
        if (id)   push(document.querySelector('[data-canvas-ticker-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-ticker-id="' + name + '"]'));

        // CanvasTicker: id="ticker-overlay-{elementId}" (legacy fallback)
        if (id)   push(document.getElementById('ticker-overlay-' + id));
        if (name && name !== id) push(document.getElementById('ticker-overlay-' + name));

        // CanvasSlideshow: data-canvas-ss-id
        if (id)   push(document.querySelector('[data-canvas-ss-id="' + id   + '"]'));
        if (name && name !== id) push(document.querySelector('[data-canvas-ss-id="' + name + '"]'));

        // CanvasRss: id="rss-overlay-{elementId}"
        if (id)   push(document.getElementById('rss-overlay-' + id));
        if (name && name !== id) push(document.getElementById('rss-overlay-' + name));

        // Generic fallback: HTML id directly matching el.id
        if (id)   push(document.getElementById(id));

        return results.filter(function (n) { return !!n; });
    }

    // ----------------------------------------------------------------
    // APPLY ANIMATION TO A SINGLE DOM NODE
    // ----------------------------------------------------------------

    // Animation types whose "out" / "both" final keyframe leaves the element
    // invisible or displaced.  After the animation ends we must clear the
    // animation CSS and reset transform/opacity so the element stays visible
    // at its original position.
    var _RESTORE_TYPES = { pan: true, pop: true, peek: true, slide: true, zoom: true };

    function _restoreNodeAfterAnimation(node, anim, originalOpacity) {
        var inOut = anim.inOut || 'in';
        if (!_RESTORE_TYPES[anim.type]) return;
        if (inOut !== 'out' && inOut !== 'both') return;

        var totalMs = ((anim.duration || 1000) + (anim.delay || 0)) + 50; // +50 ms safety buffer

        setTimeout(function () {
            // Clear the animation so fill-mode no longer locks the final frame
            node.style.animation       = '';
            node.style.webkitAnimation = '';

            // Reset properties touched by the keyframes back to natural state
            node.style.transform       = '';
            node.style.webkitTransform = '';
            // Restore to the element's configured opacity (not blank/1) so that
            // elements with opacity < 1 in the response data keep their correct
            // opacity after zoom / peek / slide / pop / pan animations finish.
            node.style.opacity         = (originalOpacity !== undefined && originalOpacity !== null)
                                             ? String(originalOpacity)
                                             : '1';
            node.style.visibility      = 'visible';

            console.log('[CanvasAnimation] 🔄 Restored element to original position after ' +
                        anim.type + '/' + inOut + ' animation ended. opacity=' + node.style.opacity);
        }, totalMs);
    }

    function _applyToNode(node, anim) {
        var css = _buildAnimationCSS(anim);

        // Capture the element's configured opacity BEFORE the animation CSS is
        // applied and potentially overwritten by keyframe fill-mode.  This value
        // is set by each renderer (CanvasGif, CanvasImage, CanvasText, etc.) from
        // the response data, so it may be less than 1.  We need it later to
        // restore the correct opacity after zoom/peek/slide/pop/pan animations end.
        var nodeOpacity = node.style.opacity !== '' ? parseFloat(node.style.opacity) : 1;

        // Always make the node visible when the animation is applied.
        // Renderers set visibility:hidden on animated elements immediately
        // after creation so they stay invisible until this point, preventing
        // the "flash at natural position before animating" issue on first load
        // (especially with backgroundType=image where the background image
        // loads asynchronously and the element was briefly visible before).
        node.style.visibility = 'visible';

        node.style.animation        = css;
        node.style.webkitAnimation  = css;   // LG webOS webkit prefix

        // wipe animations use clip-path — ensure no overflow clipping interferes
        if (anim.type === 'wipe') {
            node.style.overflow = 'visible';
        }

        // For "out" and "both" variants of pan / pop / peek / slide / zoom,
        // the final keyframe leaves the element invisible / off-screen because
        // animation-fill-mode "both" holds that last frame forever.
        // We schedule a restore so the element snaps back to its natural
        // visible state (with the correct response opacity) once the animation ends.
        _restoreNodeAfterAnimation(node, anim, nodeOpacity);

        console.log('[CanvasAnimation] ✅ Applied "' + css + '" to',
                    node.getAttribute('data-element-id') ||
                    node.getAttribute('data-canvas-image-id') ||
                    node.getAttribute('data-canvas-qr-id') ||
                    node.getAttribute('data-canvas-text-id') ||
                    node.getAttribute('data-canvas-clock-id') ||
                    node.getAttribute('data-canvas-weather-id') ||
                    node.getAttribute('data-action-overlay-id') ||
                    node.id || '(node)');
    }

    // ----------------------------------------------------------------
    // FALLBACK: animated transparent overlay div for canvas-drawn elements
    // ----------------------------------------------------------------

    function _applyFallbackOverlay(el, anim, canvas) {
        var container = canvas ? canvas.parentElement
                               : document.getElementById('our-hotel-container');
        if (!container) return;

        var overlayId = 'ca-anim-' + (el.id || el.name || Math.random().toString(36).slice(2));

        var stale = document.getElementById(overlayId);
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

        var div = document.createElement('div');
        div.id = overlayId;
        div.setAttribute('data-ca-anim', 'true');
        div.style.cssText = [
            'position:absolute',
            'pointer-events:none',
            'margin:0',
            'padding:0',
            'box-sizing:border-box',
            'left:'    + Math.floor(el.x      || 0) + 'px',
            'top:'     + Math.floor(el.y      || 0) + 'px',
            'width:'   + Math.ceil(el.width   || 0) + 'px',
            'height:'  + Math.ceil(el.height  || 0) + 'px',
            'z-index:' + ((el.zIndex && el.zIndex !== 'auto') ? el.zIndex : 5)
        ].join(';');

        container.appendChild(div);
        _applyToNode(div, anim);
    }

    // ----------------------------------------------------------------
    // PUBLIC: applyAnimation(el, canvas)
    // Called directly by each renderer right after creating its overlay
    // ----------------------------------------------------------------

    function applyAnimation(el, canvas) {
        if (!el || !el.animation) return;
        var anim = el.animation;
        if (!anim.enabled || !anim.type || anim.type === 'none') return;

        _injectKeyframes();

        // Double-rAF: the first frame lets the browser acknowledge the element
        // exists in the DOM (still hidden via visibility:hidden set by the renderer).
        // The second frame is when the browser has actually painted that hidden state.
        // Only then do we apply the animation CSS + set visibility:visible, so the
        // element's very first rendered frame is the animation start frame — never
        // the "snapshot at natural position" that causes the first-visit flash.
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var nodes = _findOverlayNodes(el);

                if (nodes.length > 0) {
                    for (var i = 0; i < nodes.length; i++) {
                        _applyToNode(nodes[i], anim);
                    }
                } else {
                    // Fallback for canvas-drawn elements
                    console.warn('[CanvasAnimation] No DOM overlay found for', el.name || el.id,
                                 '— using fallback overlay div');
                    _applyFallbackOverlay(el, anim, canvas);
                }
            });
        });
    }

    // ----------------------------------------------------------------
    // PUBLIC: applyAllAnimations(elements, canvas)
    // Safety pass called by CanvasRenderer after all elements rendered
    // ----------------------------------------------------------------

    function applyAllAnimations(elements, canvas) {
        if (!elements || !elements.length) return;
        _injectKeyframes();

        var count = 0;
        for (var i = 0; i < elements.length; i++) {
            var el   = elements[i];
            var anim = el.animation;
            if (!anim || !anim.enabled || !anim.type || anim.type === 'none') continue;
            if (el.visible === false) continue;

            // Use a small delay so DOM overlays created just before this
            // call have been painted by the browser
            (function (element, animation) {
                setTimeout(function () {
                    var nodes = _findOverlayNodes(element);
                    if (nodes.length > 0) {
                        for (var j = 0; j < nodes.length; j++) {
                            _applyToNode(nodes[j], animation);
                        }
                        count++;
                    } else {
                        _applyFallbackOverlay(element, animation, canvas);
                        count++;
                    }
                }, 50);
            })(el, anim);
        }

        console.log('[CanvasAnimation] applyAllAnimations scheduled for', elements.length, 'elements');
    }

    // ----------------------------------------------------------------
    // PUBLIC: cleanup()
    // Called by CanvasRenderer.cleanup() on page navigation
    // ----------------------------------------------------------------

    function cleanup() {
        var nodes = document.querySelectorAll('[data-ca-anim="true"]');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
        }
        console.log('[CanvasAnimation] Cleanup complete (' + nodes.length + ' fallback overlays removed)');
    }

    return {
        applyAnimation    : applyAnimation,
        applyAllAnimations: applyAllAnimations,
        cleanup           : cleanup
    };

})();