/**
 * ====================================================================
 * CANVAS BACKGROUND RENDERER
 * Handles main canvas background: color / image / video (MP4 + HLS)
 *
 * Video approach mirrors canvas-action.js exactly:
 *  - HTML <video> overlay div (position:fixed, full-screen, z-index:1)
 *  - Manual cover/contain sizing via _applyVideoFit() -- objectFit CSS
 *    is NOT used because it is unreliable on older LG webOS browsers
 *  - HLS (.m3u8): <source type="application/x-mpegURL"> + watchdog loop
 *  - MP4: video.src + loop attribute + 'ended' fallback listener
 *  - cleanup() removes the overlay and stops the watchdog
 *
 * BG-VIDEO FIX:
 *  When navigating from a page that had a normal video element,
 *  webapis.avplay.setDisplayRect() was previously called with that element's
 *  small x/y/w/h.  CanvasVideo.cleanup() now resets the plane to full
 *  screen, but as a belt-and-suspenders measure createBackgroundVideo()
 *  also calls _resetHcapVideoSizeFullScreen() on both 'loadedmetadata'
 *  and 'playing' events to guarantee the hardware decode plane covers
 *  the entire screen before the first bg-video frame is rendered.
 * ====================================================================
 */

var CanvasBackground = (function () {
    'use strict';

    /* Active background video -- only one at a time */
    var _bgVideoWrap = null;
    var _bgVideo     = null;
    var _bgWatchdog  = null;

    /* ================================================================
       PUBLIC: render()
       Called by CanvasRenderer for every full render pass.
       width / height are already SCREEN PIXELS (CanvasScaler has run).
    ================================================================ */
    function render(ctx, config, width, height, onReady) {
        console.log('[CanvasBackground] Rendering, size:', width + 'x' + height);

        ctx.save();

        var bgType  = config.backgroundType  || 'color';
        var opacity = typeof config.backgroundOpacity !== 'undefined'
                      ? config.backgroundOpacity : 1;

        /* For video background, start with a transparent canvas so the
           video DOM layer behind shows through. For other types, draw
           a solid colour first as a safe fallback.                      */
        if (bgType !== 'video') {
            ctx.fillStyle = config.background || '#000000';
            ctx.fillRect(0, 0, width, height);
        }

        if (bgType === 'color' && config.background) {
            ctx.fillStyle   = config.background;
            ctx.globalAlpha = opacity;
            ctx.fillRect(0, 0, width, height);
            console.log('[CanvasBackground] Color:', config.background);

        } else if (bgType === 'image' && config.backgroundImage) {
            var imageUrl = Array.isArray(config.backgroundImage)
                ? config.backgroundImage[0]
                : config.backgroundImage;
            if (imageUrl) {
                loadAndDrawBackground(ctx, imageUrl, width, height,
                                      opacity, config.backgroundFit || 'cover');
            }

        } else if (bgType === 'video' && config.backgroundVideo) {
            /* Clear canvas to fully transparent -- the video plays in a DOM div
               at z-index:1 (behind canvas z-index:2 inside the container).
               Any opaque fill here would block the video from showing through.  */
            ctx.clearRect(0, 0, width, height);
            console.log('[CanvasBackground] Video -- canvas cleared transparent, creating overlay');
            createBackgroundVideo(config, width, height, onReady);

        } else {
            console.log('[CanvasBackground] No background media -- color only');
        }

        ctx.restore();
    }

    /* ================================================================
       BACKGROUND IMAGE (unchanged)
    ================================================================ */
    function loadAndDrawBackground(ctx, imageUrl, width, height, opacity, fit) {
        CanvasBase.loadImage(
            imageUrl,
            function (img) {
                /* LG webOS: reset ALL composite state explicitly inside the
                   async callback -- the ctx may have been mutated by other
                   draws between loadImage() call and this callback firing.  */
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.shadowColor  = 'transparent';
                ctx.shadowBlur   = 0;

                /* Step 1: solid black base so canvas is never transparent */
                ctx.globalAlpha = 1;
                ctx.fillStyle   = '#000000';
                ctx.fillRect(0, 0, width, height);

                /* Step 2: draw image at backgroundOpacity */
                ctx.globalAlpha = (typeof opacity === 'number') ? opacity : 1;
                CanvasBase.drawImageWithFit(ctx, img, 0, 0, width, height, fit);

                ctx.restore();
                console.log('[CanvasBackground] Background image drawn | opacity:', opacity);
            },
            function () {
                console.warn('[CanvasBackground] Background image failed to load');
            }
        );
    }

    /* ================================================================
       BACKGROUND VIDEO
       Full-screen <video> overlay inserted BEHIND the canvas.
       Mirrors canvas-action.js createBackgroundVideo() exactly.
    ================================================================ */
    function createBackgroundVideo(config, screenW, screenH, onReady) {
        var src = (config.backgroundVideo || '').trim();
        if (!src) { cleanupVideo(); return; }

        /* Normalise protocol early so we can compare against existing src */
        if (src.indexOf('http://') !== 0 && src.indexOf('https://') !== 0) {
            src = 'https://' + src;
        }

        var opacity = typeof config.backgroundOpacity !== 'undefined'
                      ? config.backgroundOpacity : 1;

        /* ── If the same video is already playing, just update opacity ── */
        if (_bgVideo && _bgVideoWrap &&
            (_bgVideo.src === src ||
             (_bgVideo.querySelector && (function () {
                 var s = _bgVideo.querySelector('source');
                 return s && s.src === src;
             }())))) {
            /* Update overlay div opacity (LG-safe dimming) */
            var _ov = document.getElementById('bg-video-overlay');
            if (_ov) {
                _ov.style.opacity = String(Math.max(0, Math.min(1, 1 - opacity)));
            }
            console.log('[CanvasBackground] BG video already running -- opacity updated to', opacity);
            return;
        }

        /* Remove any previous background video first */
        cleanupVideo();

        var fitMode = config.backgroundFit        || 'cover';
        var doLoop  = config.backgroundVideoLoop  !== false;
        var muted   = config.backgroundVideoMuted !== false;
        var isHls   = src.toLowerCase().indexOf('.m3u8') !== -1;

        /* ── Resolution-fallback URL list ────────────────────────────────
           LG webOS hardware decoders have a max decode resolution (usually
           1920x1080 or 1280x720).  A 2560x1440 / 4K source ALWAYS triggers
           MEDIA_ERR_DECODE regardless of how many times we retry the same
           URL.  Instead, on each decode error we advance to the next
           lower-resolution candidate from the CDN.

           Pixabay CDN pattern (most common):
             _large.mp4   original (may be 2K/4K — fails on LG)
             _medium.mp4  ~1280x720  — usually works on LG
             _small.mp4   ~640x360   — fallback
             _tiny.mp4    ~426x240   — last resort
        ──────────────────────────────────────────────────────────────── */
        function _buildFallbackList(originalSrc) {
            var list  = [originalSrc];
            var lower = originalSrc.toLowerCase();

            if (lower.indexOf('pixabay.com/video') !== -1) {
                var variants = ['_medium.mp4', '_small.mp4', '_tiny.mp4'];
                for (var vi = 0; vi < variants.length; vi++) {
                    var v = variants[vi];
                    if (lower.indexOf(v) !== -1) continue; /* already this variant */
                    var candidate = originalSrc
                        .replace(/_large\.mp4/i,  v)
                        .replace(/_medium\.mp4/i, v)
                        .replace(/_small\.mp4/i,  v)
                        .replace(/_tiny\.mp4/i,   v);
                    /* If no suffix matched, append before any query string */
                    if (candidate === originalSrc) {
                        var qi = originalSrc.indexOf('?');
                        if (qi === -1) {
                            candidate = originalSrc.replace(/\.mp4$/i, v);
                        } else {
                            candidate = originalSrc.substring(0, qi)
                                        .replace(/\.mp4$/i, v)
                                        + originalSrc.substring(qi);
                        }
                    }
                    if (candidate !== originalSrc && list.indexOf(candidate) === -1) {
                        list.push(candidate);
                    }
                }
            }
            return list;
        }

        var _srcList  = _buildFallbackList(src);
        var _srcIndex = 0;   /* index into _srcList currently in use */

        console.log('[CanvasBackground] BG video src:', src,
                    '| fit:', fitMode, '| loop:', doLoop,
                    '| muted:', muted, '| isHls:', isHls,
                    '| fallback candidates:', _srcList.length);

        /* ── wrapper div (full-screen, behind canvas) ─────────────── */
        var wrap            = document.createElement('div');
        wrap.id             = 'bg-video-wrap';
        wrap.style.position = 'fixed';
        wrap.style.top      = '0';
        wrap.style.left     = '0';
        wrap.style.width    = screenW + 'px';
        wrap.style.height   = screenH + 'px';
        wrap.style.overflow = 'hidden';
        wrap.style.zIndex   = '1';        /* behind canvas (z-index:auto ~0) */
        wrap.style.margin   = '0';
        wrap.style.padding  = '0';
        wrap.style.pointerEvents = 'none';
        /* LG webOS: CSS opacity on a <div> containing <video> is unreliable.
           Instead we lay a black <div> on top of the video with
           opacity = (1 - backgroundOpacity) to simulate dimming.           */
        wrap.style.opacity = '1';

        /* ── <video> element ───────────────────────────────────────── */
        var video              = document.createElement('video');
        video.id               = 'bg-video-el';
        video.style.position   = 'absolute';
        video.style.top        = '0';
        video.style.left       = '0';
        video.style.margin     = '0';
        video.style.padding    = '0';
        video.style.border     = 'none';
        video.style.outline    = 'none';
        video.style.display    = 'block';
        video.style.backgroundColor = 'transparent';
        video.style.pointerEvents   = 'none';
        /* NO CSS transform -- breaks LG TV hardware decoder */
        video.style.transform       = 'none';
        video.style.webkitTransform = 'none';

        /* objectFit is NOT reliably supported on older LG webOS browsers.
           We compute cover/contain sizing manually in _applyVideoFit()     */

        video.loop        = doLoop && !isHls;  /* HLS loop via watchdog */
        video.muted       = muted;
        video.autoplay    = true;
        video.controls    = false;
        video.playsInline = true;
        video.preload     = 'auto';
        video.setAttribute('playsinline',        'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('x-webkit-airplay',   'deny');

        /* ── manual cover/contain sizing (same as canvas-action.js) ── */
        function _applyVideoFit() {
            var vw = video.videoWidth  || 0;
            var vh = video.videoHeight || 0;
            if (!vw || !vh) return;

            var scale = (fitMode === 'contain')
                ? Math.min(screenW / vw, screenH / vh)   /* contain */
                : Math.max(screenW / vw, screenH / vh);  /* cover   */

            var newW = Math.round(vw * scale);
            var newH = Math.round(vh * scale);
            var offX = Math.round((screenW - newW) / 2);
            var offY = Math.round((screenH - newH) / 2);

            video.style.width  = newW + 'px';
            video.style.height = newH + 'px';
            video.style.left   = offX + 'px';
            video.style.top    = offY + 'px';

            console.log('[CanvasBackground] _applyVideoFit (' + fitMode + '):'
                        + ' src=' + vw + 'x' + vh
                        + ' -> ' + newW + 'x' + newH
                        + ' @' + offX + ',' + offY);
        }

        /* ── play helper: guards against concurrent play() calls ──────────
           "play() interrupted by pause()" on LG webOS is caused by calling
           play() while a prior play() promise is still pending.
           The _playPending flag prevents this race.                        */
        var _playPending = false;
        function _tryPlay() {
            if (!video || !video.parentNode) return;
            if (_playPending) return;
            _playPending = true;
            var p;
            try { p = video.play(); } catch(e) { _playPending = false; return; }
            if (p && typeof p.then === 'function') {
                p.then(function () {
                    _playPending = false;
                }).catch(function (err) {
                    _playPending = false;
                    if (err.name === 'AbortError') return; /* superseded -- safe to ignore */
                    console.warn('[CanvasBackground] play() rejected:', err.message);
                    if (!video.muted) {
                        video.muted = true;
                        _playPending = true;
                        video.play().then(function() {
                            _playPending = false;
                        }).catch(function(e2) {
                            _playPending = false;
                            console.error('[CanvasBackground] Muted play also failed:', e2.message);
                        });
                    }
                });
            } else {
                _playPending = false;
            }
        }

        /* ── fallback to next lower-resolution candidate ────────────────
           Called on MEDIA_ERR_DECODE / MEDIA_ERR_SRC_NOT_SUPPORTED.
           Advances _srcIndex and reloads the video with the next URL.     */
        function _tryNextSrc() {
            _srcIndex++;
            if (_srcIndex >= _srcList.length) {
                console.error('[CanvasBackground] All fallback URLs exhausted -- video cannot play on this LG decoder');
                return;
            }
            var nextSrc = _srcList[_srcIndex];
            console.log('[CanvasBackground] Trying fallback URL', _srcIndex + '/' + (_srcList.length - 1) + ':', nextSrc);
            _playPending = false;
            _started     = false;
            video.src    = nextSrc;
            video.load();
            setTimeout(_tryPlay, 600);
        }

        /* ── event listeners ─────────────────────────────────────────── */
        var _started = false;

        video.addEventListener('loadedmetadata', function () {
            console.log('[CanvasBackground] BG video metadata:',
                        video.videoWidth + 'x' + video.videoHeight);
            _applyVideoFit();
            _resetHcapVideoSizeFullScreen(screenW, screenH);
        });

        /* canplay fires as soon as enough data is buffered -- more
           reliable than a fixed timer, especially on slow hotel networks  */
        video.addEventListener('canplay', function () {
            if (!_started) { _tryPlay(); }
        });

        video.addEventListener('playing', function () {
            _applyVideoFit();
            if (!_started) {
                _started = true;
                console.log('[CanvasBackground] BG video playing OK | src index:', _srcIndex,
                            '| url:', _srcList[_srcIndex]);
                _resetHcapVideoSizeFullScreen(screenW, screenH);
                if (typeof onReady === 'function') {
                    requestAnimationFrame(function() { requestAnimationFrame(function() { onReady(); onReady = null; }); });
                }
            }
        });

        video.addEventListener('ended', function () {
            console.log('[CanvasBackground] BG video ended, restarting');
            video.currentTime = 0;
            _tryPlay();
        });

        video.addEventListener('stalled', function () {
            console.warn('[CanvasBackground] BG video stalled');
        });

        video.addEventListener('suspend', function () {
            if (!_started) {
                setTimeout(function () {
                    if (!_started && video && video.parentNode) {
                        console.log('[CanvasBackground] BG video retry after suspend');
                        video.load();
                        setTimeout(_tryPlay, 400);
                    }
                }, 1500);
            }
        });

        /* ── error handler ───────────────────────────────────────────────
           MEDIA_ERR_DECODE (3): almost always a resolution/codec mismatch
             on LG webOS (e.g. 2560x1440 source exceeds HW decoder limit).
             → try next lower-resolution fallback URL immediately.
           MEDIA_ERR_SRC_NOT_SUPPORTED (4): format not supported.
             → also try next fallback URL.
           MEDIA_ERR_NETWORK (2): transient on hotel WiFi.
             → reload and retry same URL once (max 2 times) before giving up.
           MEDIA_ERR_ABORTED (1): user/browser aborted, do nothing.          */
        var _networkRetries = 0;
        video.addEventListener('error', function () {
            var code = video.error ? video.error.code : 0;
            var labels = {1:'ABORTED', 2:'NETWORK', 3:'DECODE', 4:'SRC_NOT_SUPPORTED'};
            console.error('[CanvasBackground] BG video error code', code,
                          '(' + (labels[code] || 'UNKNOWN') + ') | src:', _srcList[_srcIndex]);

            if (code === 3 || code === 4) {
                /* Decoder/format failure -- retrying same URL is pointless.
                   Move straight to next lower-resolution fallback.          */
                _tryNextSrc();

            } else if (code === 2 && _networkRetries < 2) {
                /* Transient network error -- reload same URL */
                _networkRetries++;
                var delay = _networkRetries * 2000;
                console.log('[CanvasBackground] Network error, retrying in', delay + 'ms');
                setTimeout(function () {
                    if (!video || !video.parentNode) return;
                    _playPending = false;
                    _started     = false;
                    video.src    = _srcList[_srcIndex];
                    video.load();
                    setTimeout(_tryPlay, 500);
                }, delay);
            }
        });

        /* ── source assignment ───────────────────────────────────────── */
        if (isHls) {
            var hlsSrc  = document.createElement('source');
            hlsSrc.src  = src;
            hlsSrc.type = 'application/x-mpegURL';
            video.appendChild(hlsSrc);
            console.log('[CanvasBackground] HLS <source> set:', src);
        } else {
            video.src = _srcList[0];   /* start with first (original) candidate */
        }

        /* ── insert into DOM behind the canvas ───────────────────────── */
        var container = document.getElementById('our-hotel-container')
                     || (function () {
                            var cv = document.getElementById('templateCanvas');
                            return cv ? cv.parentNode : document.body;
                        })();

        wrap.appendChild(video);

        /* ── black opacity overlay (LG-safe dimming for video bg) ───────── */
        var overlayDiv              = document.createElement('div');
        overlayDiv.id               = 'bg-video-overlay';
        overlayDiv.style.position   = 'absolute';
        overlayDiv.style.top        = '0';
        overlayDiv.style.left       = '0';
        overlayDiv.style.width      = '100%';
        overlayDiv.style.height     = '100%';
        overlayDiv.style.background = '#000000';
        overlayDiv.style.opacity    = String(Math.max(0, Math.min(1, 1 - opacity)));
        overlayDiv.style.pointerEvents = 'none';
        overlayDiv.style.zIndex     = '2';
        wrap.appendChild(overlayDiv);

        var canvas = document.getElementById('templateCanvas');
        if (canvas && canvas.parentNode === container) {
            container.insertBefore(wrap, canvas);
        } else {
            container.insertBefore(wrap, container.firstChild);
        }

        _bgVideoWrap = wrap;
        _bgVideo     = video;

        console.log('[CanvasBackground] BG video wrap added to DOM (behind canvas)');

        /* ── start playback ─────────────────────────────────────────────
           canplay listener above fires _tryPlay() as soon as data is
           ready.  This single 1 s timer is only a fallback for CDNs that
           delay the canplay event.  The double-timer pattern that caused
           "play() interrupted by pause()" has been removed.               */
        video.load();
        setTimeout(function () {
            if (!_started) { _tryPlay(); }
        }, 1500);
        setTimeout(function () {
            if (typeof onReady === 'function') { onReady(); onReady = null; }
        }, 4000);

        /* ── HLS seamless-loop watchdog ──────────────────────────────
           Some LG firmware versions do not fire 'ended' for HLS/VOD.
           Poll currentTime every second: if it stops advancing while
           the video is playing and duration is finite, restart from 0.
           Live streams (duration===Infinity) are never restarted.       */
        if (isHls) {
            var _hlsLastTime   = -1;
            var _hlsStallCount = 0;

            function _stopWatchdog() {
                if (_bgWatchdog) { clearInterval(_bgWatchdog); _bgWatchdog = null; }
            }

            video.addEventListener('playing', function () {
                if (_bgWatchdog) return;
                _bgWatchdog = setInterval(function () {
                    if (!video.parentNode) { _stopWatchdog(); return; }
                    if (video.paused || video.ended) {
                        _hlsStallCount = 0; _hlsLastTime = -1; return;
                    }
                    if (isFinite(video.duration) && video.duration > 0) {
                        var cur = video.currentTime;
                        if (cur === _hlsLastTime) {
                            if (++_hlsStallCount >= 3) {
                                _hlsStallCount = 0; _hlsLastTime = -1;
                                console.log('[CanvasBackground] HLS watchdog restart');
                                video.currentTime = 0;
                                _tryPlay();
                            }
                        } else {
                            _hlsStallCount = 0; _hlsLastTime = cur;
                        }
                    }
                }, 1000);
                console.log('[CanvasBackground] HLS watchdog started');
            });

            video.addEventListener('emptied', _stopWatchdog);
        }
    }

    /* ================================================================
       _resetHcapVideoSizeFullScreen(sw, sh)
       Sets the avplay hardware decode plane to cover the full screen
       (0, 0, displayW, displayH).
       Called from createBackgroundVideo() on 'loadedmetadata' and
       'playing' so the plane is guaranteed to be full-screen whenever
       a background video starts, regardless of what the previous page
       may have set via CanvasVideo._applyVideoSize().
    ================================================================ */
    function _resetHcapVideoSizeFullScreen(sw, sh) {
        /* SAMSUNG: webapis.avplay.setDisplayRect(x, y, w, h) positions the
           hardware decode plane. It throws if no player is open, which is
           harmless here - the next play() re-applies the rect. */
        if (!(typeof webapis !== 'undefined' && webapis.avplay &&
              typeof webapis.avplay.setDisplayRect === 'function')) return;

        sw = sw || window.innerWidth  || (window.screen && window.screen.width)  || 1920;
        sh = sh || window.innerHeight || (window.screen && window.screen.height) || 1080;
        console.log('[CanvasBackground] Resetting avplay video plane to full screen:', sw + 'x' + sh);

        function _doSet(x, y, w, h) {
            try {
                webapis.avplay.setDisplayRect(x, y, w, h);
                console.log('[CanvasBackground] avplay setDisplayRect full-screen OK:', w + 'x' + h);
            } catch (e) {
                console.warn('[CanvasBackground] avplay setDisplayRect failed (no player open?):',
                    e && e.message);
            }
        }

        /* SAMSUNG: tizen.systeminfo DISPLAY replaces the LG display_resolution
           property, for physical pixel accuracy (matches canvas-video.js). */
        if (typeof tizen !== 'undefined' && tizen.systeminfo) {
            try {
                tizen.systeminfo.getPropertyValue('DISPLAY',
                    function (d) {
                        _doSet(0, 0,
                            parseInt(d.resolutionWidth, 10)  || sw,
                            parseInt(d.resolutionHeight, 10) || sh);
                    },
                    function () { _doSet(0, 0, sw, sh); });
            } catch (e) { _doSet(0, 0, sw, sh); }
        } else {
            _doSet(0, 0, sw, sh);
        }
    }

    /* ================================================================
       cleanupVideo() -- internal: stops video + removes overlay
    ================================================================ */
    function cleanupVideo() {
        if (_bgWatchdog) {
            clearInterval(_bgWatchdog);
            _bgWatchdog = null;
        }
        if (_bgVideo) {
            try { _bgVideo.pause(); } catch (e) {}
            _bgVideo.src = '';
            try { _bgVideo.load(); } catch (e) {}
            _bgVideo = null;
        }
        if (_bgVideoWrap && _bgVideoWrap.parentNode) {
            _bgVideoWrap.parentNode.removeChild(_bgVideoWrap);
        }
        _bgVideoWrap = null;
    }

    /* ================================================================
       PUBLIC: cleanup()
       Called by CanvasRenderer.cleanup() when navigating away.
    ================================================================ */
    function cleanup() {
        console.log('[CanvasBackground] cleanup()');
        cleanupVideo();
    }

    /* ================================================================
       PUBLIC API
    ================================================================ */
    return {
        render:  render,
        cleanup: cleanup
    };

})();