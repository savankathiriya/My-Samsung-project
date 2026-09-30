/**
 * ====================================================================
 * CANVAS VIDEO — LG PRO:CENTRIC TV
 *
 * MULTI-VIDEO PARALLEL PLAYBACK ARCHITECTURE
 * ==========================================
 *
 * PROBLEM: webapis.avplay is a HARDWARE SINGLETON — only ONE player can
 * exist at a time (open() on a second URL replaces the first). There is NO
 * PIP in avplay; tizen.tvwindow PIP applies to broadcast sources, not media.
 *
 * SOLUTION:
 *   • ALL video elements use an HTML <video> DOM overlay — exactly like
 *     CanvasGif uses <img> overlays. Multiple <video> elements play in
 *     parallel with no conflict. This is what shows on screen.
 *
 *   • AVPlay pipeline (lgLgChannelApiMetaData logic inlined) runs only for
 *     the PRIMARY video (lowest zIndex / first rendered). It calls
 *     webapis.avplay.setDisplayRect() to position the hardware decode plane
 *     over the primary video's coordinates. Secondary videos are
 *     HTML-only — no AVPlay call at all.
 *
 * LOOP FIX (Samsung Tizen):
 *   video.loop = true  is unreliable on Samsung Tizen for MP4 files —
 *   the 'ended' event may not fire, or fires but play() silently stalls.
 *   Fix:
 *     1. video.loop = false  ALWAYS — we handle looping 100% manually.
 *     2. 'ended' event  → soft restart: currentTime=0 + play()
 *        If play() is rejected → escalate to hard restart (load + play).
 *     3. Stall watchdog (setInterval 1s): if currentTime frozen ≥3s while
 *        video is supposed to be playing → hard restart.
 *        This catches: silent end-of-file stall, mid-play decode freeze,
 *        HLS segment errors, low-memory webOS device issues.
 *     4. 'error' event  → hard reload + retry after 1.5s (looping videos).
 *     5. 'stalled'/'suspend' → recovery attempt (ungated by 'started' flag
 *        so mid-loop stalls are also caught, unlike the old version).
 *
 * BG-VIDEO FIX:
 *   When a normal video element plays, webapis.avplay.setDisplayRect() is called
 *   with that element's x/y/w/h.  On navigation to a page whose background
 *   is a video (handled by CanvasBackground), the avplay hardware plane must
 *   be reset to full-screen, otherwise the bg video appears clipped to the
 *   previous element's position/size.  cleanup() now calls
 *   _resetHcapVideoSizeFullScreen() to restore the plane before the next
 *   page renders.
 * ====================================================================
 */

var CanvasVideo = (function () {
    'use strict';

    /* active overlays: { elementId, wrapDiv, video, x,y,w,h, isPrimary, stopWatchdog } */
    var activeVideos = [];
    var primarySet   = false;   /* true once the first (primary) video is registered */

    /* ================================================================
       PUBLIC: render(ctx, el, canvas)
       Called by CanvasRenderer for every video element, in zIndex order.
       The first call becomes the "primary" — it gets the HCAP pipeline.
       All subsequent calls are HTML-only secondary videos.
    ================================================================ */
    function render(ctx, el, canvas) {
        if (!el || !el.src) {
            console.warn('[CanvasVideo] Missing src:', el && (el.name || el.id));
            return;
        }

        if (!canvas) canvas = document.getElementById('templateCanvas');
        if (!canvas) { console.error('[CanvasVideo] Canvas not found'); return; }

        var elementId = _buildId(el);

        /* Duplicate guard */
        for (var v = 0; v < activeVideos.length; v++) {
            if (activeVideos[v].elementId === elementId) {
                console.log('[CanvasVideo] already active:', elementId);
                return;
            }
        }

        /* CanvasScaler-scaled coords — already screen pixels */
        var x = Math.floor(el.x     || 0);
        var y = Math.floor(el.y     || 0);
        var w = Math.ceil(el.width  || 400);
        var h = Math.ceil(el.height || 300);

        /*
         * PRIMARY = first video rendered (lowest zIndex, sorted by renderer).
         * avplay singleton → only ONE video can use hardware decode.
         * All others are pure HTML <video>.
         */
        var isPrimary = !primarySet;
        if (isPrimary) primarySet = true;

        console.log('[CanvasVideo] render', isPrimary ? '[PRIMARY]' : '[SECONDARY]',
                    elementId, '| src:', el.src, '| pos:', x, y, '| size:', w + 'x' + h);

        _drawPlaceholder(ctx, el, x, y, w, h);
        _createVideoOverlay(el, elementId, x, y, w, h, canvas, isPrimary);
    }

    /* ================================================================
       DOM <VIDEO> OVERLAY
    ================================================================ */
    function _createVideoOverlay(el, elementId, x, y, w, h, canvas, isPrimary) {

        /* Same container lookup as CanvasGif */
        var container = canvas.parentElement;
        if (!container) { console.error('[CanvasVideo] No parent container'); return; }
        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        var radius   = Math.round(el.borderRadius || 0);
        var opacity  = (typeof el.opacity  !== 'undefined') ? el.opacity  : 1;
        var autoplay = (el.autoplay !== false) && (el.autoPlay !== false);
        var loop     = (el.loop    !== false) && (el.videoLoop !== false);
        var muted    = !(el.muted  === false && el.videoMuted === false);
        var fitMode  = el.objectFit || el.videoSize || 'contain';
        var zIndex   = (el.zIndex  != null) ? el.zIndex : 10;

        /* ── Wrapper ────────────────────────────────────────────── */
        var wrap                   = document.createElement('div');
        wrap.id                    = 'canvas-video-wrap-' + elementId;
        wrap.className             = 'canvas-video-wrap';
        wrap.style.position        = 'absolute';
        wrap.style.left            = x + 'px';
        wrap.style.top             = y + 'px';
        wrap.style.width           = w + 'px';
        wrap.style.height          = h + 'px';
        wrap.style.overflow        = 'hidden';
        wrap.style.margin          = '0';
        wrap.style.padding         = '0';
        wrap.style.border          = 'none';
        wrap.style.boxSizing       = 'border-box';
        wrap.style.zIndex          = String(zIndex);
        wrap.style.opacity         = String(opacity);
        wrap.style.pointerEvents   = 'none';
        wrap.style.backgroundColor = 'transparent';
        if (radius > 0) wrap.style.borderRadius = radius + 'px';

        /* ── <video> element ────────────────────────────────────── */
        var video                   = document.createElement('video');
        video.id                    = 'canvas-video-el-' + elementId;
        video.className             = 'canvas-video-element';
        video.style.position        = 'absolute';
        video.style.top             = '0';
        video.style.left            = '0';
        video.style.width           = w + 'px';
        video.style.height          = h + 'px';
        video.style.margin          = '0';
        video.style.padding         = '0';
        video.style.border          = 'none';
        video.style.outline         = 'none';
        video.style.display         = 'block';
        video.style.boxSizing       = 'border-box';
        video.style.backgroundColor = 'transparent';
        video.style.pointerEvents   = 'none';
        /* Hardware acceleration — same as CanvasGif */
        video.style.transform       = 'translate3d(0,0,0)';
        video.style.webkitTransform = 'translate3d(0,0,0)';
        if (el.rotation && el.rotation !== 0) {
            video.style.transform       += ' rotate(' + el.rotation + 'deg)';
            video.style.webkitTransform += ' rotate(' + el.rotation + 'deg)';
            video.style.transformOrigin  = 'center center';
        }

        /*
         * CRITICAL: video.loop = false — always manage looping manually.
         * video.loop on LG webOS is unreliable: native loop can silently
         * stall at end-of-file leaving a frozen last frame with no event.
         */
        video.loop        = false;
        video.muted       = muted;
        video.autoplay    = autoplay;
        video.controls    = (el.controls === true || el.showControls === true);
        video.playsInline = true;
        video.preload     = 'auto';
        try { video.disablePictureInPicture = true; } catch (e) {}
        video.setAttribute('playsinline',        'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('x-webkit-airplay',   'deny');
        /* NO crossOrigin — causes MEDIA_ERR_NETWORK on LG TV CDN videos */

        /* ── Manual contain/cover/fill fit ─────────────────────── */
        function _applyFit() {
            var vw = video.videoWidth  || 0;
            var vh = video.videoHeight || 0;
            if (!vw || !vh) return;
            var s, nw, nh, ox, oy;
            if (fitMode === 'fill') {
                nw = w; nh = h; ox = 0; oy = 0;
            } else if (fitMode === 'cover') {
                s  = Math.max(w / vw, h / vh);
                nw = Math.round(vw * s); nh = Math.round(vh * s);
                ox = Math.round((w - nw) / 2); oy = Math.round((h - nh) / 2);
            } else { /* contain (default) */
                s  = Math.min(w / vw, h / vh);
                nw = Math.round(vw * s); nh = Math.round(vh * s);
                ox = Math.round((w - nw) / 2); oy = Math.round((h - nh) / 2);
            }
            video.style.width  = nw + 'px';
            video.style.height = nh + 'px';
            video.style.left   = ox + 'px';
            video.style.top    = oy + 'px';
        }

        /* ────────────────────────────────────────────────────────────
         * LOOP RESTART — two levels
         *
         * _softRestart():  currentTime = 0  +  play()
         *   Fast, no rebuffering. If play() is rejected → _hardRestart().
         *
         * _hardRestart():  video.load()  +  play() after 400ms
         *   Forces full re-fetch/decode. Used when soft restart fails or
         *   the stall watchdog triggers.
         * ──────────────────────────────────────────────────────────── */
        var loopCount = 0;
        var inHard    = false;   /* re-entry guard for _hardRestart */

        function _softRestart() {
            inHard = false;
            loopCount++;
            console.log('[CanvasVideo] loop soft restart #' + loopCount + ':', elementId);
            try { video.currentTime = 0; } catch (e) { /* webOS may throw */ }
            _tryPlay(video, elementId, _hardRestart);
        }

        function _hardRestart() {
            if (inHard) return;
            inHard = true;
            console.log('[CanvasVideo] loop hard restart:', elementId);
            try { video.pause(); } catch(e){}
            video.load();
            setTimeout(function () {
                inHard = false;
                _tryPlay(video, elementId, null);
            }, 400);
        }

        /* ────────────────────────────────────────────────────────────
         * STALL WATCHDOG — setInterval every 1000ms
         *
         * Checks whether currentTime has advanced since last tick.
         * 3 consecutive frozen ticks while NOT paused/ended → stall.
         * On stall: hard restart if looping, simple reload+play otherwise.
         *
         * Catches:
         *   • 'ended' silently not firing (webOS edge case)
         *   • decode freeze mid-play on low-memory devices
         *   • HLS segment fetch failure leaving video frozen
         *   • Any silent stall at end-of-file
         * ──────────────────────────────────────────────────────────── */
        var stallTimer = null;
        var lastTime   = -1;
        var stallCount = 0;

        function _startWatchdog() {
            _stopWatchdog();
            stallCount = 0;
            lastTime   = -1;
            stallTimer = setInterval(function () {
                if (!video.parentNode)                        { _stopWatchdog(); return; }
                if (video.paused || video.ended)              { stallCount = 0; lastTime = -1; return; }
                if (video.readyState < 2 /* HAVE_CURRENT */)  { return; }

                var cur = video.currentTime;
                if (cur === lastTime) {
                    stallCount++;
                    if (stallCount >= 3) {
                        stallCount = 0; lastTime = -1;
                        console.warn('[CanvasVideo] watchdog: stall at ct=' + cur + ':', elementId);
                        if (loop) {
                            _hardRestart();
                        } else {
                            video.load();
                            setTimeout(function () { _tryPlay(video, elementId, null); }, 400);
                        }
                    }
                } else {
                    stallCount = 0;
                    lastTime   = cur;
                }
            }, 1000);
        }

        function _stopWatchdog() {
            if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
            stallCount = 0; lastTime = -1;
        }

        /* ── Event listeners ────────────────────────────────────── */
        var started = false;

        video.addEventListener('loadedmetadata', _applyFit);

        video.addEventListener('playing', function () {
            _applyFit();
            _startWatchdog();       /* restart watchdog on every play event */
            if (!started) {
                started = true;
                console.log('[CanvasVideo] ✓ first play:', elementId,
                            isPrimary ? '(primary)' : '(secondary)');
                /*
                 * HCAP only for primary video.
                 * Calling avplay for secondary would destroy the singleton slot.
                 */
                if (isPrimary) {
                    _gatherPropsAndPlay(el.src, elementId, x, y, w, h);
                }
            }
        });

        /*
         * 'ended' — PRIMARY LOOP HANDLER
         * video.loop = false so this always fires at end-of-file.
         * Soft restart → hard restart on failure.
         */
        video.addEventListener('ended', function () {
            _stopWatchdog();
            if (loop) {
                console.log('[CanvasVideo] ended → soft restart:', elementId);
                _softRestart();
            } else {
                console.log('[CanvasVideo] ended (no loop):', elementId);
            }
        });

        /*
         * 'stalled' — network download stall.
         * NOT gated by 'started' so mid-loop stalls are recovered too.
         */
        video.addEventListener('stalled', function () {
            console.warn('[CanvasVideo] stalled:', elementId);
            setTimeout(function () {
                if (!video.parentNode) return;
                if (video.paused || video.readyState < 3) {
                    console.warn('[CanvasVideo] stall recovery:', elementId);
                    video.load();
                    setTimeout(function () { _tryPlay(video, elementId, null); }, 400);
                }
            }, 2000);
        });

        /*
         * 'suspend' — browser suspended buffering.
         * Only act before first play to avoid interrupting normal buffering.
         */
        video.addEventListener('suspend', function () {
            if (!started) {
                setTimeout(function () {
                    if (!started) {
                        console.warn('[CanvasVideo] suspend before start, forcing:', elementId);
                        video.load();
                        setTimeout(function () { _tryPlay(video, elementId, null); }, 400);
                    }
                }, 2000);
            }
        });

        /*
         * 'error' — decode or network error.
         * Retry with hard reload for looping videos.
         */
        video.addEventListener('error', function () {
            _stopWatchdog();
            var code = video.error ? video.error.code : '?';
            console.error('[CanvasVideo] error code=' + code + ':', elementId, el.src);
            if (loop) {
                setTimeout(function () {
                    if (!video.parentNode) return;
                    console.log('[CanvasVideo] error retry:', elementId);
                    video.load();
                    setTimeout(function () { _tryPlay(video, elementId, null); }, 500);
                }, 1500);
            }
        });

        /* ── Source ─────────────────────────────────────────────── */
        var isHls = (_guessMimeType(el.src) === 'application/x-mpegURL');
        if (isHls) {
            var src = document.createElement('source');
            src.src  = el.src;
            src.type = 'application/x-mpegURL';
            video.appendChild(src);
        } else {
            video.src = el.src;
        }

        /* ── Append to DOM (same order as CanvasGif) ────────────── */
        wrap.appendChild(video);
        container.appendChild(wrap);
        console.log('[CanvasVideo] overlay added:', elementId, '@', x, y, w + 'x' + h);

        activeVideos.push({
            elementId:    elementId,
            wrapDiv:      wrap,
            video:        video,
            x: x, y: y, w: w, h: h,
            isPrimary:    isPrimary,
            stopWatchdog: _stopWatchdog   /* stored so cleanup() clears the interval */
        });

        /* ── Initial load + autoplay ────────────────────────────── */
        video.load();
        if (autoplay) {
            setTimeout(function () { _tryPlay(video, elementId, null); }, 500);
            setTimeout(function () {
                if (!started) { _tryPlay(video, elementId, null); }
            }, 1500);
        }
    }

    /* ================================================================
       HCAP PIPELINE — PRIMARY VIDEO ONLY
       Exact lgLgChannelApiMetaData logic inlined.
       webapis.avplay is a singleton — only one player can exist.
       We call this only for the first/primary video.
    ================================================================ */

    function _buildMediaUrl(templateUrl, values, opts) {
        opts = opts || {};
        var url = templateUrl || '';
        url = url.replace(/\[([A-Z0-9_]+)\]/g, function (_, macro) {
            if (values && Object.prototype.hasOwnProperty.call(values, macro)) {
                var v = values[macro];
                if (typeof v === 'undefined' || v === null) return '[' + macro + ']';
                if (typeof v === 'boolean') v = v ? '1' : '0';
                return encodeURIComponent(String(v));
            }
            return '[' + macro + ']';
        });
        if (opts.removeEmptyParams) {
            url = url.replace(/([?&][^=]+=)\[.*?\](?=&|$)/g, '');
            url = url.replace(/[&?]+$/g, '');
            url = url.replace(/[?&]+/g, function (m) {
                return m.indexOf('?') >= 0 ? '?' : '&';
            }).replace(/\?&/, '?');
        }
        return url;
    }

    function _guessMimeType(u) {
        try {
            var p = (u || '').split('?')[0].toLowerCase();
            if (p.indexOf('.m3u8', p.length - 5) !== -1) return 'application/x-mpegURL';
            if (p.indexOf('.mp4',  p.length - 4) !== -1) return 'video/mp4';
            if (p.indexOf('.ts',   p.length - 3) !== -1) return 'video/mp2t';
            if (p.indexOf('.mp3',  p.length - 4) !== -1) return 'audio/mpeg';
            return 'application/x-mpegURL';
        } catch (e) { return 'application/x-mpegURL'; }
    }

    function _gatherPropsAndPlay(urlTemplate, elementId, x, y, w, h) {
        /* SAMSUNG: webapis.avplay replaces hcap.Media. It is also a hardware
           singleton, so the one-video-at-a-time constraint above still holds. */
        if (!(typeof webapis !== 'undefined' && webapis.avplay)) {
            console.log('[CanvasVideo] webapis.avplay not available — HTML video only');
            return;
        }

        var values = {};
        values.DEVICE_ID    = '';
        values.DEVICE_MODEL = '';
        values.COUNTRY      = '';
        values.APP_NAME     = (typeof window.APP_NAME !== 'undefined') ? window.APP_NAME
                            : (typeof presentPagedetails !== 'undefined'
                               && presentPagedetails && presentPagedetails.appName
                               ? presentPagedetails.appName : 'MyApp');
        values.APP_VERSION  = (typeof window.APP_VERSION !== 'undefined') ? window.APP_VERSION : '1.0.0';
        values.NONCE        = (Math.random().toString(36).substr(2, 9));

        /* SAMSUNG: ProductInfo / SystemControl reads are SYNCHRONOUS, so the
           nested LG callback chain collapses into a couple of try blocks. */
        try {
            if (webapis.systemcontrol && webapis.systemcontrol.getSerialNumber) {
                values.DEVICE_ID = webapis.systemcontrol.getSerialNumber() || values.DEVICE_ID;
            }
        } catch (e) {
            console.warn('[CanvasVideo] getSerialNumber failed:', e && e.message);
        }

        if (!values.DEVICE_ID) {
            try {
                if (webapis.productinfo) values.DEVICE_ID = webapis.productinfo.getDuid() || '';
            } catch (e) {
                console.warn('[CanvasVideo] getDuid failed:', e && e.message);
            }
        }

        try {
            if (webapis.productinfo) {
                values.DEVICE_MODEL = webapis.productinfo.getModel() || values.DEVICE_MODEL;
            }
        } catch (e) {
            console.warn('[CanvasVideo] getModel failed:', e && e.message);
        }

        var finalUrl = _buildMediaUrl(urlTemplate, values, { removeEmptyParams: true });
        console.log('[CanvasVideo] AVPlay final URL:', finalUrl);
        _playFinalUrl(finalUrl, elementId, x, y, w, h);
    }

    function _playFinalUrl(finalUrl, elementId, x, y, w, h) {
        if (!finalUrl) { console.error('[CanvasVideo] AVPlay: empty URL'); return; }
        if (!(typeof webapis !== 'undefined' && webapis.avplay)) return;

        console.log('[CanvasVideo] avplay.open →', finalUrl);

        try {
            /* Tear down whatever the singleton was holding. */
            try { webapis.avplay.stop(); } catch (e) {}
            try { webapis.avplay.close(); } catch (e) {}
            window._currentHcapMedia = null;

            webapis.avplay.open(finalUrl);
            window._currentHcapMedia = finalUrl;

            /* Rect must be set before prepare on most firmware. */
            try { webapis.avplay.setDisplayRect(x, y, w, h); } catch (e) {}

            webapis.avplay.prepareAsync(
                function () {
                    try {
                        webapis.avplay.play();
                        console.log('[CanvasVideo] avplay.play OK:', elementId);
                        _applyVideoSize(x, y, w, h, elementId);
                    } catch (ePlay) {
                        console.error('[CanvasVideo] avplay.play failed:', ePlay && ePlay.message);
                        try { webapis.avplay.close(); } catch (e) {}
                        window._currentHcapMedia = null;
                    }
                },
                function (f) {
                    console.error('[CanvasVideo] avplay.prepareAsync failed:', f && f.message);
                    try { webapis.avplay.close(); } catch (e) {}
                    window._currentHcapMedia = null;
                }
            );
        } catch (ex) {
            console.error('[CanvasVideo] AVPlay pipeline exception:', ex);
            window._currentHcapMedia = null;
        }
    }

    /* ── webapis.avplay.setDisplayRect for the primary video ─────────── */
    function _applyVideoSize(x, y, w, h, elementId) {
        if (!(typeof webapis !== 'undefined' && webapis.avplay &&
              typeof webapis.avplay.setDisplayRect === 'function')) return;

        /* SAMSUNG: tizen.systeminfo DISPLAY replaces the LG display_resolution
           property. setDisplayRect expects PHYSICAL panel pixels, so CSS
           coordinates are scaled the same way the LG path did. */
        if (typeof tizen !== 'undefined' && tizen.systeminfo) {
            try {
                tizen.systeminfo.getPropertyValue('DISPLAY',
                    function (d) {
                        var dispW = parseInt(d.resolutionWidth, 10)
                                    || (window.screen ? window.screen.width  : 1280);
                        var dispH = parseInt(d.resolutionHeight, 10)
                                    || (window.screen ? window.screen.height : 720);
                        var screenW = window.innerWidth  || dispW;
                        var screenH = window.innerHeight || dispH;
                        _doSetVideoSize(
                            Math.round(x * (dispW / screenW)),
                            Math.round(y * (dispH / screenH)),
                            Math.round(w * (dispW / screenW)),
                            Math.round(h * (dispH / screenH)),
                            elementId
                        );
                    },
                    function () { _doSetVideoSize(x, y, w, h, elementId); });
            } catch (e) { _doSetVideoSize(x, y, w, h, elementId); }
        } else {
            _doSetVideoSize(x, y, w, h, elementId);
        }
    }

    function _doSetVideoSize(x, y, w, h, elementId) {
        try {
            webapis.avplay.setDisplayRect(x, y, w, h);
            console.log('[CanvasVideo] setDisplayRect OK:', x, y, w, h);
        } catch (e) {
            console.warn('[CanvasVideo] setDisplayRect failed:', e && e.message);
        }
    }

    /* ================================================================
       PLACEHOLDER — drawn on canvas while overlay loads
    ================================================================ */
    function _drawPlaceholder(ctx, el, x, y, w, h) {
        var bgColor = '#000000';
        try {
            var tj = Main.jsonTemplateData && Main.jsonTemplateData.template_json;
            if (tj && tj.canvas && tj.canvas.background) bgColor = tj.canvas.background;
        } catch (e) {}
        ctx.save();
        ctx.translate(x, y);
        if (el.rotation) {
            ctx.translate(w / 2, h / 2);
            ctx.rotate(el.rotation * Math.PI / 180);
            ctx.translate(-w / 2, -h / 2);
        }
        ctx.globalAlpha = (typeof el.opacity !== 'undefined') ? el.opacity : 1;
        if ((el.borderRadius || 0) > 0) {
            CanvasBase.roundRect(ctx, 0, 0, w, h, el.borderRadius);
            ctx.clip();
        }
        ctx.fillStyle = el.backgroundColor || bgColor;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    /* ================================================================
       HELPERS
    ================================================================ */
    function _buildId(el) {
        var rawId   = (el.id   != null) ? String(el.id)   : '';
        var rawName = (el.name != null) ? String(el.name) : '';
        return (rawId + (rawName ? '_' + rawName : '')) || ('cvid-' + Date.now());
    }

    /*
     * _tryPlay — calls video.play() with auto-mute fallback.
     * onReject: optional callback if play() is rejected even when muted.
     *           Used by _softRestart to escalate to _hardRestart.
     */
    function _tryPlay(video, id, onReject) {
        if (!video || !video.parentNode) return;
        var p;
        try { p = video.play(); } catch (e) {
            console.warn('[CanvasVideo] play() threw:', id, e);
            if (onReject) onReject();
            return;
        }
        if (p && typeof p.then === 'function') {
            p.catch(function (err) {
                console.warn('[CanvasVideo] play rejected:', id, err && err.message);
                if (!video.muted) {
                    /* Retry muted */
                    video.muted = true;
                    var p2;
                    try { p2 = video.play(); } catch (e2) {}
                    if (p2 && typeof p2.then === 'function') {
                        p2.catch(function (e2) {
                            console.error('[CanvasVideo] muted play also rejected:', id, e2 && e2.message);
                            if (onReject) onReject();
                        });
                    } else if (onReject) {
                        onReject();
                    }
                } else {
                    if (onReject) onReject();
                }
            });
        }
    }

    /* ================================================================
       PUBLIC: cleanup()
       Called at the top of CanvasRenderer.render() alongside
       CanvasGif.cleanup() — stops AVPlay + removes all DOM overlays.
    ================================================================ */
    function cleanup() {
        primarySet = false;

        /* SAMSUNG: avplay stop → close releases the hardware decoder.
           There is no separate shutDown step as there was in hcap.Media. */
        try {
            if (window._currentHcapMedia && typeof webapis !== 'undefined' && webapis.avplay) {
                try { webapis.avplay.stop(); } catch (e) {}
                try { webapis.avplay.close(); } catch (e) {}
                window._currentHcapMedia = null;
            }
        } catch (e) { window._currentHcapMedia = null; }

        /* Stop watchdogs + remove overlays */
        for (var i = 0; i < activeVideos.length; i++) {
            var vd = activeVideos[i];
            if (vd.stopWatchdog) { try { vd.stopWatchdog(); } catch(e){} }
            if (vd.video) {
                try { vd.video.pause(); vd.video.src = ''; vd.video.load(); } catch (e) {}
            }
            if (vd.wrapDiv && vd.wrapDiv.parentNode) {
                vd.wrapDiv.parentNode.removeChild(vd.wrapDiv);
            }
        }
        activeVideos = [];

        var leftovers = document.querySelectorAll('.canvas-video-wrap');
        for (var j = 0; j < leftovers.length; j++) {
            if (leftovers[j].parentNode) leftovers[j].parentNode.removeChild(leftovers[j]);
        }

        /* ── FIX: Reset hcap video plane to full screen ──────────────
           A previous call to _applyVideoSize() positioned the hardware
           decode plane at the element video's x/y/w/h.  If the next page
           uses a background video (CanvasBackground), that code never calls
           setVideoSize() — so without this reset the bg video would appear
           clipped to the previous element's small area.
        ──────────────────────────────────────────────────────────────── */
        _resetHcapVideoSizeFullScreen('cleanup');

        console.log('[CanvasVideo] cleanup done');
    }

    /* ================================================================
       _resetHcapVideoSizeFullScreen(caller)
       Resets the avplay hardware decode plane to cover the full screen
       (0, 0, displayW, displayH).  Called by cleanup() so that any
       following background-video page is not clipped to a previous
       element video's position/size.
    ================================================================ */
    function _resetHcapVideoSizeFullScreen(caller) {
        if (!(typeof webapis !== 'undefined' && webapis.avplay &&
              typeof webapis.avplay.setDisplayRect === 'function')) return;

        var sw = window.innerWidth  || (window.screen && window.screen.width)  || 1920;
        var sh = window.innerHeight || (window.screen && window.screen.height) || 1080;
        console.log('[CanvasVideo] ' + (caller || '') + ' resetting avplay video plane to full screen:', sw + 'x' + sh);

        /* SAMSUNG: tizen.systeminfo DISPLAY gives physical panel pixels
           (same source _applyVideoSize uses). */
        if (typeof tizen !== 'undefined' && tizen.systeminfo) {
            try {
                tizen.systeminfo.getPropertyValue('DISPLAY',
                    function (d) {
                        _doSetVideoSize(0, 0,
                            parseInt(d.resolutionWidth, 10)  || sw,
                            parseInt(d.resolutionHeight, 10) || sh,
                            'fullscreen-reset');
                    },
                    function () { _doSetVideoSize(0, 0, sw, sh, 'fullscreen-reset'); });
            } catch (e) { _doSetVideoSize(0, 0, sw, sh, 'fullscreen-reset'); }
        } else {
            _doSetVideoSize(0, 0, sw, sh, 'fullscreen-reset');
        }
    }

    /* ── Control helpers ────────────────────────────────────────── */
    function _findVideo(id) {
        for (var i = 0; i < activeVideos.length; i++) {
            if (activeVideos[i].elementId === id) return activeVideos[i].video;
        }
        return null;
    }
    function play(id)           { var v = _findVideo(id); if (v) _tryPlay(v, id, null); }
    function pause(id)          { var v = _findVideo(id); if (v) v.pause(); }
    function stop(id)           { var v = _findVideo(id); if (v) { v.pause(); v.currentTime = 0; } }
    function setVolume(id, vol) { var v = _findVideo(id); if (v) v.volume = Math.max(0, Math.min(1, vol)); }
    function seek(id, t)        { var v = _findVideo(id); if (v) v.currentTime = t; }

    return {
        render:    render,
        cleanup:   cleanup,
        play:      play,
        pause:     pause,
        stop:      stop,
        setVolume: setVolume,
        seek:      seek
    };

})();