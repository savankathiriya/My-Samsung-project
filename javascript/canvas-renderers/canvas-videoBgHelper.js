/**
 * ====================================================================
 * CANVAS VIDEO BG HELPER
 * Shared utility used by ALL canvas renderers when backgroundType
 * is 'video'.  Instead of drawing on the canvas (which is transparent
 * z-index:2 above the video), every element is rendered as a DOM
 * overlay inside #our-hotel-container at z-index:10+, so it is always
 * visibly composited above both the video (z-index:1) and the canvas
 * (z-index:2).
 * ====================================================================
 */
var CanvasVideoBgHelper = (function () {
    'use strict';

    /* ── is video background currently active? ──────────────────── */
    function isVideoBg() {
        try {
            var tj = Main.jsonTemplateData && Main.jsonTemplateData.template_json;
            return !!(tj && tj.canvas && tj.canvas.backgroundType === 'video');
        } catch (e) { return false; }
    }

    /* ── get / ensure the overlay container ─────────────────────── */
    function getContainer() {
        var c = document.getElementById('our-hotel-container');
        if (c && (!c.style.position || c.style.position === 'static')) {
            c.style.position = 'relative';
        }
        return c || document.body;
    }

    /* ── remove existing overlay by element id ───────────────────── */
    function removeById(elId) {
        var attr = String(elId);
        var nodes = document.querySelectorAll('[data-vbg-id="' + attr + '"]');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
        }
    }

    /**
     * createWrapper()
     * Creates and appends a positioned <div> that matches the element's
     * x/y/width/height/rotation/opacity/borderRadius/zIndex.
     * Returns the wrapper div (already in the DOM).
     */
    function createWrapper(el, extraZIndex) {
        var container = getContainer();
        removeById(el.id || el.name);

        var x       = Math.floor(el.x      || 0);
        var y       = Math.floor(el.y      || 0);
        var w       = Math.ceil(el.width   || 0);
        var h       = Math.ceil(el.height  || 0);
        var radius  = el.borderRadius || 0;
        var opacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        var zIndex  = extraZIndex || (el.zIndex && el.zIndex !== 'auto' ? el.zIndex : 10);

        var wrap = document.createElement('div');
        wrap.setAttribute('data-vbg-id', String(el.id || el.name));
        wrap.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none;margin:0;padding:0;box-sizing:border-box;';
        wrap.style.left         = x + 'px';
        wrap.style.top          = y + 'px';
        wrap.style.width        = w + 'px';
        wrap.style.height       = h + 'px';
        wrap.style.borderRadius = radius + 'px';
        wrap.style.opacity      = String(opacity);
        wrap.style.zIndex       = String(zIndex);

        if (el.rotation && el.rotation !== 0) {
            wrap.style.transform       = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform = 'rotate(' + el.rotation + 'deg)';
            wrap.style.transformOrigin = 'center center';
        }

        container.appendChild(wrap);
        return wrap;
    }

    /* ── public API ─────────────────────────────────────────────── */
    return {
        isVideoBg:     isVideoBg,
        getContainer:  getContainer,
        removeById:    removeById,
        createWrapper: createWrapper
    };
})();