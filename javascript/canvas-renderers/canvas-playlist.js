/**
 * ====================================================================
 * canvas-playlist.js  –  Playlist Slideshow Player
 * LG Pro:Centric TV App
 *
 * KEY INSIGHT – bg-video-wrap is position:fixed
 *   CanvasBackground inserts bg-video-wrap with position:fixed, meaning
 *   it covers the viewport regardless of which slot it is a child of.
 *   Calling _hardCleanSlot() after a transition removes the NEWLY CREATED
 *   video wrap (from the new slide), killing video playback.
 *
 * CORRECT APPROACH:
 *   - Call CanvasBackground.cleanup() (which calls cleanupVideo() and
 *     removes bg-video-wrap) BEFORE the ID swap and BEFORE the next render.
 *   - After the transition, only clear the CANVAS PIXELS of the old back
 *     slot — do NOT touch bg-video-wrap (it belongs to the new slide).
 *   - The old slot's leftover children (gif overlays, ticker divs, etc.)
 *     are removed by _cleanSlotChildren() which deliberately SKIPS any
 *     element with id='bg-video-wrap' (that belongs to the new slide).
 *
 * RENDER CYCLE (slide N → slide N+1):
 *   1. _stopCanvasModules()  — stop animation loop, call all cleanup()s
 *                              including CanvasBackground.cleanup() which
 *                              removes the old bg-video-wrap.
 *                              Must run BEFORE ID swap so IDs are still
 *                              on the front slot when cleanup() looks them up.
 *   2. _cleanSlotCanvas()    — clear canvas pixels of the BACK slot only
 *   3. _swapIdsToBack()      — give back slot the real IDs
 *   4. CanvasRenderer.render() — draws new slide, CanvasBackground creates
 *                              new bg-video-wrap if needed
 *   5. CSS transition in/out
 *   6. _demoteOldFront()     — rename old front to back-slot IDs
 *   7. _cleanSlotCanvas()    — clear old front canvas pixels (no bg-video-wrap touch)
 *   8. startAnimationLoop()  — start clock updates on new front
 *   9. Wait item.duration ms → repeat
 * ====================================================================
 */

var PlaylistPlayer = (function () {
    'use strict';

    var _playlist     = [];
    var _templates    = {};
    var _currentIndex = 0;
    var _slideTimer   = null;
    var _active       = false;
    var _onComplete   = null;   // optional callback fired when last slide finishes naturally

    // Front slot always carries the real IDs that every canvas module uses
    var FRONT_CONT   = 'our-hotel-container';
    var FRONT_CANVAS = 'templateCanvas';
    var BACK_CONT    = 'playlist-slot-b';
    var BACK_CANVAS  = 'playlist-canvas-b';

    // ─── duration parser ──────────────────────────────────────────────
    function _parseDurationMs(str) {
        if (!str) return 5000;
        var m = String(str).match(/(\d+(?:\.\d+)?)/);
        return m ? Math.round(parseFloat(m[1]) * 1000) : 5000;
    }

    // ─── template fetch / cache ───────────────────────────────────────
    function _fetchTemplate(uuid, cb) {
        if (_templates[uuid]) return cb(_templates[uuid]);
        macro.ajax({
            url: apiPrefixUrl + 'json-template?template_uuid=' + uuid,
            type: 'GET',
            headers: { Authorization: 'Bearer ' + pageDetails.access_token },
            success: function (res) {
                try {
                    var r = typeof res === 'string' ? JSON.parse(res) : res;
                    if (r && r.status === true && r.result) {
                        _templates[uuid] = r.result;
                        cb(_templates[uuid]);
                    } else { cb(null); }
                } catch (e) { cb(null); }
            },
            error: function () { cb(null); },
            timeout: 30000
        });
    }

    function _prefetchAll(list, done) {
        var i = 0;
        function next() {
            if (i >= list.length) return done();
            var item = list[i++];
            if (item && item.template_uuid) _fetchTemplate(item.template_uuid, next);
            else next();
        }
        next();
    }

    // ─── stop all canvas module timers/intervals ──────────────────────
    // MUST be called BEFORE any ID swap so cleanup() finds correct IDs.
    // This includes CanvasBackground.cleanup() which removes bg-video-wrap.
    function _stopCanvasModules() {
        try {
            if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.stopAnimationLoop) {
                CanvasRenderer.stopAnimationLoop();
            }
        } catch (e) {}

        var mods = [
            'CanvasWeather', 'CanvasRss',       'CanvasTicker',  'CanvasGif',
            'CanvasImage',   'CanvasText',       'CanvasClock',   'CanvasShapes',
            'CanvasSlideshow','CanvasAction',    'CanvasVideo',   'CanvasBackground'
        ];
        for (var i = 0; i < mods.length; i++) {
            try {
                var m = window[mods[i]];
                if (m && m.cleanup) m.cleanup();
            } catch (e) {}
        }
    }

    // ─── clear only the canvas pixels of a slot ───────────────────────
    // Does NOT touch bg-video-wrap or any other DOM nodes —
    // bg-video-wrap belongs to the CURRENT active slide and must survive.
    function _cleanSlotCanvas(canvasId) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        try {
            var ctx2 = canvas.getContext('2d');
            if (ctx2) ctx2.clearRect(0, 0, canvas.width, canvas.height);
        } catch (e) {}
        canvas.style.background      = '';
        canvas.style.backgroundColor = '';
        canvas.style.zIndex          = '';
    }

    // ─── remove non-canvas children from a slot (skip bg-video-wrap) ──
    // Removes gif overlays, weather/rss/ticker divs, action overlays etc.
    // that modules append inside the container.
    // DELIBERATELY skips id="bg-video-wrap" — that belongs to current slide.
    function _cleanSlotChildren(contId, canvasId) {
        var container = document.getElementById(contId);
        var canvas    = document.getElementById(canvasId);
        if (!container) return;

        var toRemove = [];
        for (var i = 0; i < container.childNodes.length; i++) {
            var child = container.childNodes[i];
            // Keep the canvas itself; skip bg-video-wrap (belongs to active slide)
            if (child === canvas) continue;
            if (child.id === 'bg-video-wrap') continue;
            toRemove.push(child);
        }
        for (var j = 0; j < toRemove.length; j++) {
            try { container.removeChild(toRemove[j]); } catch (e) {}
        }
    }

    // ─── ID swap ──────────────────────────────────────────────────────
    // Call AFTER _stopCanvasModules() so cleanup() ran with correct IDs.
    function _swapIdsToBack() {
        var fc = document.getElementById(FRONT_CONT);
        var fv = document.getElementById(FRONT_CANVAS);
        if (fc) fc.id = 'playlist-slot-inactive';
        if (fv) fv.id = 'playlist-canvas-inactive';

        var bc = document.getElementById(BACK_CONT);
        var bv = document.getElementById(BACK_CANVAS);
        if (bc) bc.id = FRONT_CONT;
        if (bv) bv.id = FRONT_CANVAS;
    }

    function _demoteOldFront() {
        var oc = document.getElementById('playlist-slot-inactive');
        var ov = document.getElementById('playlist-canvas-inactive');
        if (oc) oc.id = BACK_CONT;
        if (ov) ov.id = BACK_CANVAS;
        if (oc) {
            oc.style.opacity    = '0';
            oc.style.zIndex     = '9';
            oc.style.transform  = '';
            oc.style.clipPath   = '';
            oc.style.transition = 'none';
        }
    }

    // ─── transition ───────────────────────────────────────────────────
    function _applyTransition(transition, done) {
        var effect    = (transition && transition.effect)    || 'fade';
        var dur       = (transition && transition.duration)  || 500;
        var direction = (transition && transition.direction) || 'left';
        var durS      = (dur / 1000) + 's';

        var inEl  = document.getElementById(FRONT_CONT);
        var outEl = document.getElementById('playlist-slot-inactive');

        if (!inEl || !outEl) { _demoteOldFront(); return done && done(); }

        inEl.style.transition  = 'none';
        outEl.style.transition = 'none';

        switch (effect) {
            case 'fade':
                inEl.style.opacity = '0';
                inEl.style.zIndex  = '10';
                outEl.style.zIndex = '9';
                void inEl.offsetWidth;
                inEl.style.transition  = 'opacity ' + durS + ' ease';
                outEl.style.transition = 'opacity ' + durS + ' ease';
                inEl.style.opacity  = '1';
                outEl.style.opacity = '0';
                break;

            case 'slide':
                var inStart, outEnd;
                switch (direction) {
                    case 'right': inStart = 'translateX(-100%)'; outEnd = 'translateX(100%)';  break;
                    case 'up':    inStart = 'translateY(100%)';  outEnd = 'translateY(-100%)'; break;
                    case 'down':  inStart = 'translateY(-100%)'; outEnd = 'translateY(100%)';  break;
                    default:      inStart = 'translateX(100%)';  outEnd = 'translateX(-100%)'; break;
                }
                inEl.style.transform = inStart;
                inEl.style.opacity   = '1';
                inEl.style.zIndex    = '10';
                outEl.style.zIndex   = '9';
                void inEl.offsetWidth;
                inEl.style.transition  = 'transform ' + durS + ' ease';
                outEl.style.transition = 'transform ' + durS + ' ease';
                inEl.style.transform  = 'translateX(0) translateY(0)';
                outEl.style.transform = outEnd;
                break;

            case 'wipe':
                var clipEnd;
                switch (direction) {
                    case 'right': inEl.style.clipPath = 'inset(0 100% 0 0)'; clipEnd = 'inset(0 0% 0 0)'; break;
                    case 'up':    inEl.style.clipPath = 'inset(100% 0 0 0)'; clipEnd = 'inset(0% 0 0 0)'; break;
                    case 'down':  inEl.style.clipPath = 'inset(0 0 100% 0)'; clipEnd = 'inset(0 0 0% 0)'; break;
                    default:      inEl.style.clipPath = 'inset(0 0 0 100%)'; clipEnd = 'inset(0 0 0 0%)'; break;
                }
                inEl.style.opacity = '1';
                inEl.style.zIndex  = '10';
                outEl.style.zIndex = '9';
                void inEl.offsetWidth;
                inEl.style.transition = 'clip-path ' + durS + ' ease';
                inEl.style.clipPath   = clipEnd;
                break;

            case 'zoom':
                inEl.style.transform = 'scale(0.5)';
                inEl.style.opacity   = '0';
                inEl.style.zIndex    = '10';
                outEl.style.zIndex   = '9';
                void inEl.offsetWidth;
                inEl.style.transition  = 'transform ' + durS + ' ease, opacity ' + durS + ' ease';
                outEl.style.transition = 'opacity ' + durS + ' ease';
                inEl.style.transform = 'scale(1)';
                inEl.style.opacity   = '1';
                outEl.style.opacity  = '0';
                break;

            default:
                inEl.style.opacity  = '1';
                inEl.style.zIndex   = '10';
                outEl.style.opacity = '0';
                outEl.style.zIndex  = '9';
                _demoteOldFront();
                return done && done();
        }

        setTimeout(function () {
            _demoteOldFront();
            done && done();
        }, dur + 50);
    }

    // ─── render next slide into back slot ─────────────────────────────
    function _renderNextSlide(templateData, onRendered) {
        // STEP 1: Stop modules + call CanvasBackground.cleanup()
        //         Must run BEFORE ID swap so cleanup finds #our-hotel-container
        _stopCanvasModules();

        // STEP 2: Clear only the back-slot canvas pixels (not DOM nodes –
        //         bg-video-wrap is gone now that CanvasBackground.cleanup() ran)
        _cleanSlotCanvas(BACK_CANVAS);

        // STEP 3: Point global template data at new slide
        Main.jsonTemplateData = templateData;

        // STEP 4: Swap IDs so CanvasRenderer / CanvasBackground target back slot
        _swapIdsToBack();

        // STEP 5: Short DOM flush, then render
        setTimeout(function () {
            try {
                if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.render) {
                    CanvasRenderer.render();
                } else if (typeof renderTemplateCanvas !== 'undefined') {
                    renderTemplateCanvas();
                }
            } catch (e) {
                console.error('[PlaylistPlayer] render() error:', e);
            }

            // STEP 6: Wait for async bg-image/video load before transitioning
            setTimeout(function () {
                onRendered && onRendered();
            }, 400);
        }, 80);
    }

    // ─── slide sequencer ─────────────────────────────────────────────
    function _showSlide(index, _skipCount) {
        if (!_active) return;

        // Guard against infinite skip loop when ALL templates are missing
        _skipCount = (_skipCount || 0);
        if (_skipCount >= _playlist.length) {
            console.error('[PlaylistPlayer] All templates missing — cannot show any slide');
            _active = false;
            if (typeof _onComplete === 'function') {
                var cb = _onComplete; _onComplete = null; cb();
            }
            return;
        }

        var item = _playlist[index];
        if (!item) return;

        var templateData = _templates[item.template_uuid];
        if (!templateData) {
            console.warn('[PlaylistPlayer] Template not cached for', item.template_uuid, '– skipping');
            _currentIndex = (index + 1) % _playlist.length;
            _showSlide(_currentIndex, _skipCount + 1);
            return;
        }

        console.log('[PlaylistPlayer] Slide', index, '–', item.name,
                    '| dur:', item.duration,
                    '| fx:', item.transition && item.transition.effect);

        _renderNextSlide(templateData, function () {
            if (!_active) return;

            _applyTransition(item.transition, function () {
                if (!_active) return;

                // After transition: old front is now demoted to back slot.
                // Clean its canvas pixels and remove its leftover overlay children.
                // Do NOT remove bg-video-wrap — it belongs to the new front slide.
                _cleanSlotCanvas(BACK_CANVAS);
                _cleanSlotChildren(BACK_CONT, BACK_CANVAS);

                // Restart animation loop on new front slot
                try {
                    if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.startAnimationLoop) {
                        CanvasRenderer.startAnimationLoop();
                    }
                } catch (e) {}

                var durationMs = _parseDurationMs(item.duration);
                _slideTimer = setTimeout(function () {
                    var nextIndex = (index + 1) % _playlist.length;

                    // If we have wrapped back to 0 AND a completion callback is set,
                    // the playlist has finished one full cycle — notify the caller
                    // (ScreenSaver) instead of looping automatically.
                    if (nextIndex === 0 && typeof _onComplete === 'function') {
                        console.log('[PlaylistPlayer] All slides shown — calling onComplete');
                        _active = false;
                        var cb = _onComplete;
                        _onComplete = null;  // clear before calling to prevent double-fire
                        cb();
                        return;
                    }

                    _currentIndex = nextIndex;
                    _showSlide(_currentIndex);
                }, durationMs);
            });
        });
    }

    // ─── first slide (no transition needed) ──────────────────────────
    function _showFirstSlide(item, templateData) {
        // Front slot already has real IDs from Util.playlistPage.
        // Just clear pixels and render directly.
        _cleanSlotCanvas(FRONT_CANVAS);
        Main.jsonTemplateData = templateData;

        setTimeout(function () {
            try {
                if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.render) {
                    CanvasRenderer.render();
                } else if (typeof renderTemplateCanvas !== 'undefined') {
                    renderTemplateCanvas();
                }
            } catch (e) {
                console.error('[PlaylistPlayer] First slide render error:', e);
            }

            var frontCont = document.getElementById(FRONT_CONT);
            if (frontCont) {
                frontCont.style.opacity = '1';
                frontCont.style.zIndex  = '10';
            }

            try {
                if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.startAnimationLoop) {
                    CanvasRenderer.startAnimationLoop();
                }
            } catch (e) {}

            Main.HideLoading();

            var durationMs = _parseDurationMs(item.duration);
            _slideTimer = setTimeout(function () {
                _currentIndex = 1 % _playlist.length;
                _showSlide(_currentIndex);
            }, durationMs);

        }, 150);
    }

    // ─── public API ───────────────────────────────────────────────────
    function start(playlistData, onComplete) {
        var obj = null;
        if (Array.isArray(playlistData)) {
            for (var i = 0; i < playlistData.length; i++) {
                if (playlistData[i] && playlistData[i].is_active !== false) {
                    obj = playlistData[i]; break;
                }
            }
        } else if (playlistData && playlistData.play_list_json) {
            obj = playlistData;
        }

        if (!obj || !Array.isArray(obj.play_list_json) || obj.play_list_json.length === 0) {
            console.error('[PlaylistPlayer] No valid play_list_json found');
            Main.HideLoading();
            return;
        }

        _playlist     = obj.play_list_json;
        _templates    = {};
        _currentIndex = 0;
        _active       = true;
        _onComplete   = (typeof onComplete === 'function') ? onComplete : null;

        console.log('[PlaylistPlayer] Starting "' + obj.name + '" (' + _playlist.length + ' slides)');

        Main.addBackData('playlist');
        view = 'playlist';
        presentPagedetails.view = view;

        macro('#mainContent').html('');
        macro('#mainContent').html(Util.playlistPage());
        macro('#mainContent').show();

        Main.ShowLoading();
        _prefetchAll(_playlist, function () {
            console.log('[PlaylistPlayer] All templates fetched – starting slideshow');
            var firstItem     = _playlist[0];
            var firstTemplate = _templates[firstItem && firstItem.template_uuid];
            if (!firstTemplate) {
                console.error('[PlaylistPlayer] First template missing – cannot start');
                Main.HideLoading();
                return;
            }
            _showFirstSlide(firstItem, firstTemplate);
        });
    }

    /**
     * startFromCache(playlistData, templateCache, onComplete)
     *
     * Screen-saver variant of start().
     * All playlist data and template data are already pre-fetched by
     * ScreenSaver.init() — this function performs ZERO network requests.
     *
     * @param {object} playlistData   – result object from /json-play-list
     * @param {object} templateCache  – map { template_uuid → templateResult }
     * @param {function} onComplete   – called when all slides finish naturally
     */
    function startFromCache(playlistData, templateCache, onComplete) {
        var obj = null;
        if (Array.isArray(playlistData)) {
            for (var i = 0; i < playlistData.length; i++) {
                if (playlistData[i] && playlistData[i].is_active !== false) {
                    obj = playlistData[i]; break;
                }
            }
        } else if (playlistData && playlistData.play_list_json) {
            obj = playlistData;
        }

        if (!obj || !Array.isArray(obj.play_list_json) || obj.play_list_json.length === 0) {
            console.error('[PlaylistPlayer] startFromCache: No valid play_list_json found');
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        _playlist     = obj.play_list_json;
        _currentIndex = 0;
        _active       = true;
        _onComplete   = (typeof onComplete === 'function') ? onComplete : null;

        // Copy ALL entries from the per-entry template cache into _templates.
        // These were fetched once by Main.screenSaverInterval() — zero network needed.
        _templates = {};
        if (templateCache) {
            for (var k in templateCache) {
                if (Object.prototype.hasOwnProperty.call(templateCache, k)) {
                    _templates[k] = templateCache[k];
                }
            }
        }

        console.log('[PlaylistPlayer] startFromCache "' + obj.name +
                    '" (' + _playlist.length + ' slides)');

        // Debug: confirm every slide template is present
        _playlist.forEach(function (slide, idx) {
            var uuid    = slide && slide.template_uuid;
            var present = uuid && !!_templates[uuid];
            console.log('[PlaylistPlayer] startFromCache slide[' + idx + '] uuid=' +
                        uuid + ' inCache=' + present);
        });

        Main.addBackData('playlist');
        view = 'playlist';
        presentPagedetails.view = view;

        macro('#mainContent').html('');
        macro('#mainContent').html(Util.playlistPage());
        macro('#mainContent').show();

        Main.HideLoading();

        var firstItem     = _playlist[0];
        var firstTemplate = firstItem && _templates[firstItem.template_uuid];

        if (!firstTemplate) {
            console.error('[PlaylistPlayer] startFromCache: template not in cache for uuid=' +
                          (firstItem && firstItem.template_uuid));
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        // Wait for playlistPage() DOM to be fully injected before rendering
        setTimeout(function () {
            _showFirstSlide(firstItem, firstTemplate);
        }, 150);
    }

    /**
     * relaunchFromCache(playlistData, templateCache, onComplete)
     *
     * Round-robin variant — called for the 2nd, 3rd … Nth screen-saver playlist.
     * The playlist view DOM already exists (set up by startFromCache on first launch).
     * This function ONLY swaps the playlist content; it does NOT:
     *   • call Main.addBackData()   — back-stack stays clean (one entry for all savers)
     *   • rebuild #mainContent DOM  — existing slots are reused
     *   • touch view / presentPagedetails.view — they stay 'playlist'
     *
     * @param {object}   playlistData  – result object from /json-play-list (cached)
     * @param {object}   templateCache – map { template_uuid → templateResult } (cached)
     * @param {function} onComplete    – called when all slides finish naturally
     */
    function relaunchFromCache(playlistData, templateCache, onComplete) {
        var obj = null;
        if (Array.isArray(playlistData)) {
            for (var i = 0; i < playlistData.length; i++) {
                if (playlistData[i] && playlistData[i].is_active !== false) {
                    obj = playlistData[i]; break;
                }
            }
        } else if (playlistData && playlistData.play_list_json) {
            obj = playlistData;
        }

        if (!obj || !Array.isArray(obj.play_list_json) || obj.play_list_json.length === 0) {
            console.error('[PlaylistPlayer] relaunchFromCache: No valid play_list_json');
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        // Stop any running slide timer / animations from previous playlist
        if (_slideTimer) { clearTimeout(_slideTimer); _slideTimer = null; }
        _stopCanvasModules();

        // Clear both canvas slots so previous content is fully gone
        _cleanSlotCanvas(FRONT_CANVAS);
        _cleanSlotCanvas(BACK_CANVAS);
        _cleanSlotChildren(FRONT_CONT, FRONT_CANVAS);
        _cleanSlotChildren(BACK_CONT,  BACK_CANVAS);

        _playlist     = obj.play_list_json;
        _currentIndex = 0;
        _active       = true;
        _onComplete   = (typeof onComplete === 'function') ? onComplete : null;

        // Copy per-entry templates from Main.screenSaverData — zero network
        _templates = {};
        if (templateCache) {
            for (var k in templateCache) {
                if (Object.prototype.hasOwnProperty.call(templateCache, k)) {
                    _templates[k] = templateCache[k];
                }
            }
        }

        console.log('[PlaylistPlayer] relaunchFromCache "' + obj.name +
                    '" (' + _playlist.length + ' slides)');

        // Debug: confirm every slide template is present
        _playlist.forEach(function (slide, idx) {
            var uuid    = slide && slide.template_uuid;
            var present = uuid && !!_templates[uuid];
            console.log('[PlaylistPlayer] relaunchFromCache slide[' + idx + '] uuid=' +
                        uuid + ' inCache=' + present);
        });

        // Ensure front slot DOM exists; rebuild if it was wiped
        var fc = document.getElementById(FRONT_CONT);
        if (!fc) {
            macro('#mainContent').html('');
            macro('#mainContent').html(Util.playlistPage());
            macro('#mainContent').show();
        }

        var firstItem     = _playlist[0];
        var firstTemplate = firstItem && _templates[firstItem.template_uuid];

        if (!firstTemplate) {
            console.error('[PlaylistPlayer] relaunchFromCache: template not in cache for uuid=' +
                          (firstItem && firstItem.template_uuid));
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        // DOM/canvas settle delay
        setTimeout(function () {
            _showFirstSlide(firstItem, firstTemplate);
        }, 150);
    }

    function stop() {
        _active     = false;
        _onComplete = null;
        if (_slideTimer) { clearTimeout(_slideTimer); _slideTimer = null; }

        // Cleanup modules first (removes bg-video-wrap via CanvasBackground.cleanup)
        _stopCanvasModules();

        // Then clear canvas pixels only
        _cleanSlotCanvas(FRONT_CANVAS);
        _cleanSlotCanvas(BACK_CANVAS);

        try { document.body.style.background = ''; } catch (e) {}
        console.log('[PlaylistPlayer] Stopped – returning to previous page');
        Main.previousPage();
    }

    /**
     * stopSilent()
     *
     * Stops playback and cleans up canvas/DOM but does NOT call
     * Main.previousPage() — the caller (ScreenSaver) handles navigation.
     */
    function stopSilent() {
        _active     = false;
        _onComplete = null;
        if (_slideTimer) { clearTimeout(_slideTimer); _slideTimer = null; }

        _stopCanvasModules();
        _cleanSlotCanvas(FRONT_CANVAS);
        _cleanSlotCanvas(BACK_CANVAS);

        try { document.body.style.background = ''; } catch (e) {}
        console.log('[PlaylistPlayer] Stopped silently (no page navigation)');
    }

    function isActive() { return _active; }

    return {
        start:              start,
        startFromCache:     startFromCache,
        relaunchFromCache:  relaunchFromCache,
        stop:               stop,
        stopSilent:         stopSilent,
        isActive:           isActive
    };

})();