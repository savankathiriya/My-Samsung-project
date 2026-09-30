/**
 * ====================================================================
 * CANVAS FONT LOADER  -  LG Pro:Centric TV Font Fix
 * ====================================================================
 *
 * PROBLEM:
 *   LG Pro:Centric TV browsers cannot reach fonts.googleapis.com, so
 *   every custom fontFamily silently falls back to the TV system font.
 *   Additionally, numeric fontWeight values ("600", "800") and composite
 *   fontFamily strings ("'JetBrains Mono', sans-serif") can break the
 *   canvas ctx.font string on older WebKit builds shipped on LG TVs.
 *
 * SOLUTION:
 *   1. Before CanvasRenderer.render() is called, scan all text elements
 *      in the template JSON and collect every unique (family, weight) pair.
 *   2. Build Google Fonts CSS2 API URLs and inject them as <link> tags.
 *   3. Use the FontFace / document.fonts API (supported on WebOS 3+) to
 *      wait until each face is actually ready.
 *   4. If the FontFace API is unavailable (very old firmware) fall back to
 *      a simple timeout so rendering is not blocked forever.
 *   5. Expose two helpers used by canvas-text.js:
 *        - normalizeFontFamily(raw)  → clean name for ctx.font
 *        - normalizeFontWeight(raw)  → safe weight keyword / number
 *
 * USAGE  (in canvas-renderer.js  OR  wherever you call render):
 *
 *   CanvasFontLoader.loadFromTemplate(
 *       Main.jsonTemplateData.template_json,
 *       function onReady() {
 *           CanvasRenderer.render();
 *       }
 *   );
 *
 * ====================================================================
 */
var CanvasFontLoader = (function () {
    'use strict';

    // ----------------------------------------------------------------
    // INTERNAL CONSTANTS
    // ----------------------------------------------------------------

    /** Maximum ms to wait for ALL fonts before giving up and rendering anyway */
    var FONT_LOAD_TIMEOUT_MS = 6000;

    /**
     * Google Fonts CSS2 API base.
     * We request every weight variant so the browser caches them upfront.
     */
    var GFONTS_BASE = 'https://fonts.googleapis.com/css2?';

    /**
     * Weight variants we ask Google to return for each family.
     * Covers: 300 (light), 400 (normal), 600 (semibold), 700 (bold), 800 (extrabold)
     */
    var WEIGHT_AXIS = '300;400;600;700;800';

    /**
     * Fonts that are already available on most LG Pro:Centric TV firmware.
     * These do NOT need to be fetched from Google Fonts.
     */
    var TV_SYSTEM_FONTS = [
        'arial', 'helvetica', 'times', 'times new roman', 'courier',
        'courier new', 'georgia', 'verdana', 'trebuchet ms', 'impact',
        'palatino', 'garamond', 'serif', 'sans-serif', 'monospace',
        'fantasy', 'cursive'
    ];

    // ----------------------------------------------------------------
    // PUBLIC: normalizeFontFamily
    // ----------------------------------------------------------------
    /**
     * Strips surrounding quotes and any CSS fallback stack from a fontFamily
     * value so it can safely be placed inside a canvas ctx.font string.
     *
     * Examples:
     *   "'JetBrains Mono', sans-serif"  →  "JetBrains Mono"
     *   "'Space Grotesk', sans-serif"   →  "Space Grotesk"
     *   '"Inter", sans-serif'           →  "Inter"
     *   "Montserrat"                    →  "Montserrat"
     *   "JetBrains Mono"                →  "JetBrains Mono"
     *
     * @param {string} raw
     * @returns {string}  Clean family name (NOT quoted)
     */
    function normalizeFontFamily(raw) {
        if (!raw) return 'Arial';

        // Take only the first family in a comma-separated stack
        var first = String(raw).split(',')[0];

        // Strip surrounding single or double quotes
        first = first.replace(/^['"\s]+|['"\s]+$/g, '');

        return first || 'Arial';
    }

    // ----------------------------------------------------------------
    // PUBLIC: normalizeFontWeight
    // ----------------------------------------------------------------
    /**
     * Converts any fontWeight value to one that LG TV WebKit understands.
     *
     * LG WebKit (WebOS 3-6) is reliable with:
     *   100 200 300 400 500 600 700 800 900   (numeric string or number)
     *   "normal"  →  400
     *   "bold"    →  700
     *
     * Some firmware ignores "600" strings from ctx.font but respects 600 (number).
     * We return a plain number string always.
     *
     * @param {string|number} raw
     * @returns {string}
     */
    function normalizeFontWeight(raw) {
        if (!raw) return '400';

        var s = String(raw).toLowerCase().trim();

        if (s === 'normal')      return '400';
        if (s === 'bold')        return '700';
        if (s === 'bolder')      return '700';
        if (s === 'lighter')     return '300';

        var n = parseInt(s, 10);
        if (!isNaN(n) && n >= 100 && n <= 900) {
            // Round to nearest 100 (some TV firmware only handles multiples of 100)
            return String(Math.round(n / 100) * 100);
        }

        return '400'; // safe fallback
    }

    // ----------------------------------------------------------------
    // INTERNAL: Extract unique fonts from template
    // ----------------------------------------------------------------
    /**
     * Walk all elements; return array of unique {family, weights[]} objects.
     * Only returns families that need to be fetched from Google Fonts.
     *
     * @param {object} templateJson
     * @returns {Array<{family: string, weights: string[]}>}
     */
    function extractFonts(templateJson) {
        if (!templateJson || !Array.isArray(templateJson.elements)) {
            return [];
        }

        // Map: cleanFamily → Set of weight strings
        var map = {};

        templateJson.elements.forEach(function (el) {
            if (!el.fontFamily) return;

            var family = normalizeFontFamily(el.fontFamily);
            var weight = normalizeFontWeight(el.fontWeight);

            // Skip system fonts
            if (TV_SYSTEM_FONTS.indexOf(family.toLowerCase()) !== -1) return;

            if (!map[family]) {
                map[family] = {};
            }
            map[family][weight] = true;
        });

        var result = [];
        Object.keys(map).forEach(function (family) {
            result.push({
                family:  family,
                weights: Object.keys(map[family])
            });
        });

        return result;
    }

    // ----------------------------------------------------------------
    // INTERNAL: Inject Google Fonts <link> tags
    // ----------------------------------------------------------------
    /**
     * Builds one Google Fonts CSS2 URL per family and injects it as a
     * <link rel="stylesheet"> unless it was already injected.
     *
     * @param {Array<{family: string, weights: string[]}>} fonts
     */
    function injectGoogleFontLinks(fonts) {
        fonts.forEach(function (f) {
            var familyParam = f.family.replace(/ /g, '+');

            // Combine all needed weights plus the italic variants
            var weights = f.weights.slice();
            // Always include 400 and 700 as a safety baseline
            if (weights.indexOf('400') === -1) weights.push('400');
            if (weights.indexOf('700') === -1) weights.push('700');

            // Build axis: regular + italic for each weight
            var axis = weights.sort().map(function (w) {
                return '0,' + w;   // 0 = normal (non-italic)
            }).concat(weights.sort().map(function (w) {
                return '1,' + w;   // 1 = italic
            })).join(';');

            var url = GFONTS_BASE +
                      'family=' + familyParam +
                      ':ital,wght@' + axis +
                      '&display=swap';

            var linkId = 'gfont-' + familyParam;
            if (document.getElementById(linkId)) {
                console.log('[CanvasFontLoader] Already injected:', f.family);
                return; // already added
            }

            var link     = document.createElement('link');
            link.id      = linkId;
            link.rel     = 'stylesheet';
            link.href    = url;
            document.head.appendChild(link);
            console.log('[CanvasFontLoader] Injected font link:', f.family, '| weights:', weights.join(','));
        });
    }

    // ----------------------------------------------------------------
    // INTERNAL: Wait for fonts via document.fonts API
    // ----------------------------------------------------------------
    /**
     * Returns a Promise that resolves when all named font families are
     * ready (or after FONT_LOAD_TIMEOUT_MS, whichever comes first).
     *
     * Uses document.fonts.load() which is available on WebOS 3.x+.
     *
     * @param {Array<{family: string, weights: string[]}>} fonts
     * @returns {Promise}
     */
    function waitForFonts(fonts) {
        // Older firmware may not have Promise or document.fonts
        if (typeof Promise === 'undefined' || !document.fonts || !document.fonts.load) {
            console.warn('[CanvasFontLoader] FontFace API not available, using timeout fallback');
            return {
                then: function (cb) {
                    setTimeout(cb, FONT_LOAD_TIMEOUT_MS);
                    return this;
                }
            };
        }

        var loadPromises = [];

        fonts.forEach(function (f) {
            f.weights.forEach(function (w) {
                // document.fonts.load(fontString, testChar)
                // fontString must match ctx.font format: "weight size family"
                var fontStr = w + ' 40px "' + f.family + '"';
                var p = document.fonts.load(fontStr, 'AaBbCc')
                    .then(function (loaded) {
                        if (loaded && loaded.length > 0) {
                            console.log('[CanvasFontLoader] ✅ Ready:', f.family, w);
                        } else {
                            console.warn('[CanvasFontLoader] ⚠️ Not loaded (possibly no network):', f.family, w);
                        }
                    })
                    ['catch'](function (err) {
                        console.warn('[CanvasFontLoader] ❌ Error loading:', f.family, w, err);
                    });

                loadPromises.push(p);
            });
        });

        // Race against timeout
        var timeoutPromise = new Promise(function (resolve) {
            setTimeout(function () {
                console.warn('[CanvasFontLoader] ⏱ Font load timeout reached, rendering anyway');
                resolve();
            }, FONT_LOAD_TIMEOUT_MS);
        });

        return Promise.race([
            Promise.all(loadPromises),
            timeoutPromise
        ]);
    }

    // ----------------------------------------------------------------
    // PUBLIC: loadFromTemplate
    // ----------------------------------------------------------------
    /**
     * Main entry point.
     * Call this INSTEAD of CanvasRenderer.render() directly.
     *
     * @param {object}   templateJson   Main.jsonTemplateData.template_json
     * @param {Function} onReady        Called when fonts are loaded (or timed out)
     */
    function loadFromTemplate(templateJson, onReady) {
        console.log('[CanvasFontLoader] ===== Starting font pre-load =====');

        if (!templateJson) {
            console.warn('[CanvasFontLoader] No templateJson provided, rendering immediately');
            if (typeof onReady === 'function') onReady();
            return;
        }

        var fonts = extractFonts(templateJson);

        if (fonts.length === 0) {
            console.log('[CanvasFontLoader] No custom fonts found, rendering immediately');
            if (typeof onReady === 'function') onReady();
            return;
        }

        console.log('[CanvasFontLoader] Fonts to load:', fonts.map(function(f){ return f.family; }).join(', '));

        // Step 1: Inject <link> tags so the browser starts downloading CSS+fonts
        injectGoogleFontLinks(fonts);

        // Step 2: Wait for fonts to be available in document.fonts
        var result = waitForFonts(fonts);

        // Step 3: Call onReady regardless of success/failure
        if (result && typeof result.then === 'function') {
            result.then(function () {
                console.log('[CanvasFontLoader] ===== Font pre-load complete =====');
                if (typeof onReady === 'function') onReady();
            });
        } else {
            // Synchronous fallback (shouldn't happen, but be safe)
            if (typeof onReady === 'function') onReady();
        }
    }

    // ----------------------------------------------------------------
    // Return public API
    // ----------------------------------------------------------------
    return {
        loadFromTemplate:    loadFromTemplate,
        normalizeFontFamily: normalizeFontFamily,
        normalizeFontWeight: normalizeFontWeight
    };

})();