/**
 * ====================================================================
 * CANVAS RSS FEED RENDERER
 * Displays RSS feed items with title and description
 * Uses HTML overlay for RSS content display
 *
 * ANIMATION FIX:
 *   Previously canvas placeholder (fillRect) was drawn for color/image
 *   backgrounds even when animation was enabled, causing a ghost element
 *   at the natural position before the animation fired.
 *
 *   Fix mirrors canvas-action.js / canvas-gif.js approach:
 *   1. Skip canvas draw whenever animation is enabled OR backgroundType
 *      is video/image (DOM overlay handles all rendering in those cases).
 *   2. Set visibility:hidden on the overlay immediately after creation.
 *   3. Call applyAnimation() AFTER the overlay is appended to the DOM
 *      (double-rAF inside CanvasAnimation ensures first painted frame
 *      is the animation start frame — no flash at natural position).
 * ====================================================================
 */

var CanvasRss = (function () {
  "use strict";

  var rssOverlays   = {}; // Store RSS overlay elements
  var rssFeedCache  = {}; // Cache feed data
  var fetchingFeeds = {}; // Track ongoing fetches

  // ── Background-type helpers (mirrors canvas-action.js) ────────────

  function _getBgType() {
    try {
      var tj = Main.jsonTemplateData && Main.jsonTemplateData.template_json;
      return (tj && tj.canvas && tj.canvas.backgroundType) || "color";
    } catch (e) {
      return "color";
    }
  }

  function _isVideoBg() { return _getBgType() === "video"; }
  function _isImageBg() { return _getBgType() === "image"; }

  function _hasAnimation(el) {
    return !!(
      el.animation &&
      el.animation.enabled &&
      el.animation.type &&
      el.animation.type !== "none"
    );
  }

  // ── PUBLIC: render() ──────────────────────────────────────────────

  function render(ctx, el, canvas) {
    if (!el.feedUrl) {
      console.warn("[CanvasRss] RSS element missing feedUrl:", el.name || el.id);
      return;
    }

    console.log("[CanvasRss] Rendering RSS feed:", el.name || el.id, el.feedUrl);

    /*
     * Canvas placeholder draw decision (mirrors canvas-action.js logic):
     *
     *  SKIP when:
     *   - backgroundType === "video"  → canvas must stay transparent
     *   - backgroundType === "image"  → bg image covers canvas; ghost rect
     *                                   appears behind the animated overlay
     *   - animation is enabled        → the DOM overlay IS the visual;
     *                                   the canvas fillRect creates a ghost
     *                                   at the natural position before the
     *                                   animation fires (visible flash).
     *
     *  DRAW only when there is NO animation AND bg is plain color, to give
     *  a solid color fallback behind the overlay while content loads.
     */
    var skipCanvasDraw = _isVideoBg() || _isImageBg() || _hasAnimation(el);

    if (!skipCanvasDraw) {
      ctx.save();
      CanvasBase.applyTransformations(ctx, el);
      if (el.backgroundColor && el.backgroundColor !== "transparent") {
        ctx.fillStyle = el.backgroundColor;
        ctx.fillRect(0, 0, el.width, el.height);
      }
      ctx.restore();
    }

    createRssOverlay(el, canvas);
  }

  // ── createRssOverlay() ────────────────────────────────────────────

  function createRssOverlay(el, canvas) {
    var elementId = el.id || el.name || "rss-" + Math.random();

    if (!canvas) {
      canvas = document.getElementById("templateCanvas");
    }
    if (!canvas) {
      console.error("[CanvasRss] Canvas element not found");
      return;
    }

    var container = canvas.parentElement;
    if (!container) return;

    // Ensure container is a positioning context (mirrors canvas-gif.js)
    if (!container.style.position || container.style.position === "static") {
      container.style.position = "relative";
    }

    // Remove stale overlay if exists
    if (rssOverlays[elementId]) {
      try {
        if (rssOverlays[elementId].parentNode) {
          rssOverlays[elementId].parentNode.removeChild(rssOverlays[elementId]);
        }
      } catch (e) {
        console.warn("[CanvasRss] Error removing old overlay:", e);
      }
    }

    // ── Build overlay div ────────────────────────────────────────────
    var overlay = document.createElement("div");
    overlay.id        = "rss-overlay-" + elementId;
    overlay.className = "rss-overlay";

    // Scale: only needed when canvas CSS size differs from pixel size
    var scaleX = 1, scaleY = 1;
    try {
      var canvasRect = canvas.getBoundingClientRect();
      if (Math.abs(canvasRect.width - canvas.width) > 2) {
        scaleX = canvasRect.width  / canvas.width;
        scaleY = canvasRect.height / canvas.height;
      }
    } catch (e) { /* use 1:1 */ }

    overlay.style.position        = "absolute";
    overlay.style.left            = (el.x      * scaleX) + "px";
    overlay.style.top             = (el.y      * scaleY) + "px";
    overlay.style.width           = (el.width  * scaleX) + "px";
    overlay.style.height          = (el.height * scaleY) + "px";
    overlay.style.backgroundColor = el.backgroundColor || "transparent";
    overlay.style.overflow        = "hidden";  // no scrollbar
    overlay.style.overflowY       = "hidden";  // explicitly no vertical scroll
    overlay.style.pointerEvents   = "none";
    overlay.style.zIndex          = "100";
    overlay.style.padding         = "10px";
    overlay.style.boxSizing       = "border-box";

    /*
     * HIDE immediately when animation is enabled.
     * CanvasAnimation._applyToNode() sets visibility:visible when the
     * animation actually starts (after double-rAF), so the very first
     * painted frame the user sees is the animation start frame.
     * This prevents the "element flashes at natural position" issue that
     * was happening on color/image backgrounds.
     * Mirrors the pattern in canvas-gif.js and canvas-image.js.
     */
    if (_hasAnimation(el)) {
      overlay.style.visibility = "hidden";
    }

    // ── Append to DOM FIRST — animation targeting requires the node ──
    // (same reason canvas-gif.js appends before calling applyAnimation)
    container.appendChild(overlay);
    rssOverlays[elementId] = overlay;

    /*
     * Apply animation immediately after the element is in the DOM.
     * The animation fires while "RSS Loading..." is shown, so the slide/
     * fade plays as the widget appears — identical to how video bg works.
     * CanvasAnimation internally uses double-rAF so the browser has
     * painted the hidden element before the CSS animation is assigned.
     */
    if (_hasAnimation(el)) {
      if (typeof CanvasAnimation !== "undefined" && CanvasAnimation.applyAnimation) {
        CanvasAnimation.applyAnimation(el, canvas);
      }
    }

    // ── Load content ──────────────────────────────────────────────────
    if (rssFeedCache[el.feedUrl]) {
      console.log("[CanvasRss] Using cached feed data");
      displayRssItems(el, overlay, rssFeedCache[el.feedUrl]);
    } else {
      fetchAndDisplayRss(el, overlay);
    }
  }

  // ── fetchAndDisplayRss() ──────────────────────────────────────────

  function fetchAndDisplayRss(el, overlay) {
    if (fetchingFeeds[el.feedUrl]) {
      console.log("[CanvasRss] Already fetching this feed");
      return;
    }
    fetchingFeeds[el.feedUrl] = true;

    // Styled "RSS Loading..." shown while data is being fetched
    var loadingFontSize = el.fontSize || 14;
    overlay.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">' +
        '<span style="' +
          'color:'         + (el.titleColor || "#000000") + ";" +
          "font-family:Arial,sans-serif;" +
          "font-size:"     + loadingFontSize + "px;" +
          "font-weight:bold;" +
          "letter-spacing:1px;" +
        '">RSS Loading...</span>' +
      "</div>";

    var proxyUrl =
      "https://api.rss2json.com/v1/api.json?rss_url=" +
      encodeURIComponent(el.feedUrl);

    var xhr = new XMLHttpRequest();
    xhr.open("GET", proxyUrl, true);
    xhr.timeout = 15000;

    xhr.onload = function () {
      fetchingFeeds[el.feedUrl] = false;
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.status === "ok" && data.items) {
            console.log("[CanvasRss] ✅ Fetched", data.items.length, "items from feed");
            rssFeedCache[el.feedUrl] = data.items;
            displayRssItems(el, overlay, data.items);
          } else {
            console.error("[CanvasRss] Invalid feed response:", data);
            showError(overlay, "Failed to parse RSS feed");
          }
        } catch (e) {
          console.error("[CanvasRss] Parse error:", e);
          showError(overlay, "Error parsing feed data");
        }
      } else {
        console.error("[CanvasRss] HTTP error:", xhr.status);
        showError(overlay, "Failed to load RSS feed (HTTP " + xhr.status + ")");
      }
    };

    xhr.onerror = function () {
      fetchingFeeds[el.feedUrl] = false;
      console.error("[CanvasRss] Network error loading RSS");
      showError(overlay, "Network error loading feed");
    };

    xhr.ontimeout = function () {
      fetchingFeeds[el.feedUrl] = false;
      console.error("[CanvasRss] RSS feed timeout");
      showError(overlay, "Feed loading timeout");
    };

    xhr.send();
  }

  // ── displayRssItems() ─────────────────────────────────────────────

  function displayRssItems(el, overlay, items) {
    var maxItems    = el.maxItems    || 5;
    var fontSize    = el.fontSize    || 14;
    var itemSpacing = el.itemSpacing || 10;

    var html = "";
    var displayItems = items.slice(0, maxItems);

    for (var i = 0; i < displayItems.length; i++) {
      var item = displayItems[i];
      html += '<div style="margin-bottom:' + itemSpacing + 'px;">';

      if (el.showTitle !== false && item.title) {
        html +=
          '<div style="color:' + (el.titleColor || "#000000") +
          ";font-size:"        + fontSize +
          'px;font-weight:bold;font-family:Arial;margin-bottom:4px;line-height:1.3;">' +
          escapeHtml(item.title) +
          "</div>";
      }

      if (el.showDescription !== false && item.description) {
        var cleanDesc = stripHtml(item.description).substring(0, 150);
        if (item.description.length > 150) cleanDesc += "...";
        html +=
          '<div style="color:' + (el.descriptionColor || "#666666") +
          ";font-size:"        + (fontSize - 2) +
          'px;font-family:Arial;line-height:1.4;">' +
          escapeHtml(cleanDesc) +
          "</div>";
      }

      html += "</div>";
    }

    overlay.innerHTML = html;
    console.log("[CanvasRss] ✅ Displayed", displayItems.length, "RSS items");
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function showError(overlay, message) {
    overlay.innerHTML =
      '<div style="color:#cc0000;font-family:Arial;font-size:12px;padding:10px;">' +
      escapeHtml(message) +
      "</div>";
  }

  function stripHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }

  function escapeHtml(text) {
    var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
  }

  // ── cleanup() ─────────────────────────────────────────────────────

  function cleanup() {
    console.log("[CanvasRss] Cleaning up RSS overlays");
    for (var id in rssOverlays) {
      if (rssOverlays.hasOwnProperty(id)) {
        var overlay = rssOverlays[id];
        if (overlay && overlay.parentNode) {
          try {
            overlay.parentNode.removeChild(overlay);
          } catch (e) {
            console.warn("[CanvasRss] Error removing overlay:", e);
          }
        }
      }
    }
    rssOverlays   = {};
    fetchingFeeds = {};
    // Keep cache for reuse: rssFeedCache = {};
  }

  function clearCache() {
    rssFeedCache = {};
    console.log("[CanvasRss] Cache cleared");
  }

  return {
    render:     render,
    cleanup:    cleanup,
    clearCache: clearCache,
  };
})();