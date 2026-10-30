/**
 * ====================================================================
 * CANVAS NAV-TIMER RENDERER
 *
 * Element type: "navTimer"   —   two modes: "ttl" and "autoplay"
 *
 * ── LEAD-IN (both modes, identical) ────────────────────────────────
 *
 *      |-- startDelay (seconds) --||---- duration (seconds) ----|
 *      |  nothing is displayed    ||  countdown ticks down 1/s  |  -> fire
 *      |--------------------------||----------------------------|
 *
 *   1. Wait  el.startDelay  seconds (no countdown shown).
 *   2. Count  el.duration   seconds down, second by second.
 *   3. Fire.
 *
 * ── mode "ttl" ─────────────────────────────────────────────────────
 * Fire runs el.actionType / el.actionValue, i.e. EXACTLY the same code path
 * as pressing OK on an action / button / card element. The target template
 * ALWAYS becomes the route root: the previously visited templates are dropped
 * from Main.pageHistory even when the target's is_clear_route_history is
 * false, so BACK/EXIT there goes to the home screen.
 *
 *   actionType "dynamicPage" -> loads that template
 *   actionType "app"         -> launches that app (actionValue is the app's
 *                               lg_app_id, or the app_url CanvasAction maps
 *                               to one). BACK out of the app lands on the
 *                               HOME SCREEN, not on this template — coming
 *                               back here would only restart the countdown
 *                               and relaunch the app.
 *
 * ── mode "autoplay" (alias: "sequence") ────────────────────────────
 * Fire hands over to the el.sequence array, which is then walked template by
 * template — the chain SURVIVES page navigation (each hop destroys the
 * template that holds this element, so the runner lives in module state, not
 * in the element):
 *
 *   sequence[0].actionValue  -> shown, stay  sequence[0].dwell  seconds
 *   sequence[1].actionValue  -> shown, stay  sequence[1].dwell  seconds
 *   ...
 *   step with isLast:true    -> shown, NO dwell, chain stops there and that
 *                               template becomes the route root (previous
 *                               templates dropped, exactly like the
 *                               is_clear_route_history:true behaviour)
 *
 * A step may be actionType "app" as well as "dynamicPage". An app step ALWAYS
 * ends the chain — with or without isLast — because the app takes the whole
 * screen: a dwell clock running behind it would navigate the hidden page and
 * drop the guest somewhere they never chose. BACK out of that app goes to the
 * home screen, the same rule isLast applies to a template step.
 *
 * A step's dwell clock starts when its template has actually been painted,
 * not when the request was issued, so the guest really sees it for `dwell`
 * seconds. If no step carries isLast, onSequenceEnd ("loop") decides whether
 * the chain wraps around to sequence[0] or stops.
 *
 * The chain is cancelled the moment the guest takes over (EXIT / BACK, or OK
 * on a card) and whenever the playlist or screen saver takes the screen.
 *
 * ── DISPLAY RULES ──────────────────────────────────────────────────
 *   - el.actionLabel is NEVER rendered (editor-side label only).
 *   - Text appears ONLY when el.showCountdown === true, and only during the
 *     lead-in duration phase:  countdownPrefix + " " + countdownFormat.
 *         labels:true   ->  "Returning in 00m 05s"
 *         labels:false  ->  "Returning in 0:05"
 *   - el.countdownCompleteMessage (when set) shows briefly at 0 before firing.
 *
 * ── EXTRAS ─────────────────────────────────────────────────────────
 *   - NO remote key drives a navTimer. OK/ENTER executes the focused action
 *     card only; EXIT/BACK is the single key that affects a navTimer, and it
 *     merely cancels it. allowManualStep / resetOnInteraction are ignored on
 *     purpose — see "REMOTE CONTROL" below.
 *   - playlist / screen-saver playback discards navTimers completely.
 *
 * Rendered as a DOM overlay (never on canvas) so the countdown can repaint
 * every second over a colour / image / video background alike.
 *
 * NOTE: by the time render() is called el.x / el.y / el.width / el.height /
 * el.fontSize are ALREADY in screen pixels (CanvasScaler scaled them).
 * ====================================================================
 */

var CanvasNavTimer = (function () {
    'use strict';

    /* ── per-template state (dropped by reset() on every page change) ── */
    var _entries  = {};   // key -> lead-in entry (live timers)
    var _resume   = {};   // key -> { phase, phaseStartTs }  (survives soft cleanup)
    var _finished = {};   // key -> true  (lead-in that already fired)
    var _overlays = [];   // DOM nodes created by this module

    /* ── autoplay chain: OUTLIVES page navigation, so reset() must NOT
          touch it. Only cancelAutoplay() / natural completion end it.   ── */
    var _session = null;
    // { steps, index, dwellFallback, loop, elId, elName, timerId, sourceKey }

    var TICK_MS          = 250;   // sub-second tick keeps the text honest
    var COMPLETE_HOLD_MS = 900;   // how long countdownCompleteMessage shows
    var DEFAULT_DURATION = 10;    // seconds, when el.duration is missing
    var NAV_TIMEOUT_MS   = 31000; // after this a navigation is no longer "in flight"
                                  // (the template ajax itself times out at 30s)

    /* Timestamp of the navigation we most recently issued, 0 when none is
       loading. Guards against two page loads racing each other. */
    var _navStartedAt = 0;

    /* ================================================================
       SMALL HELPERS
    ================================================================ */

    function _log(msg, a, b) {
        if (typeof b !== 'undefined')      console.log('[CanvasNavTimer] ' + msg, a, b);
        else if (typeof a !== 'undefined') console.log('[CanvasNavTimer] ' + msg, a);
        else                               console.log('[CanvasNavTimer] ' + msg);
    }

    function _templateUuid() {
        try {
            return String((Main.jsonTemplateData && Main.jsonTemplateData.template_uuid) || '');
        } catch (e) { return ''; }
    }

    function _elId(el) {
        return String((el && (el.id || el.name)) || 'navTimer');
    }

    /* Live/resume key is template-scoped so a different page always starts
       its own lead-in from scratch. */
    function _key(el) {
        return _templateUuid() + '|' + _elId(el);
    }

    function _pad(n) {
        n = Math.floor(Math.abs(n));
        return n < 10 ? '0' + n : String(n);
    }

    /* Positive number with fallback (accepts "5" strings from the editor) */
    function _sec(value, fallback) {
        var n = parseFloat(value);
        if (isNaN(n) || n < 0) return fallback;
        return n;
    }

    function _isTrue(v) { return v === true || v === 'true'; }

    function _hasValue(v) { return v !== undefined && v !== null && v !== ''; }

    /* '#00000000' / 'transparent' -> '' (meaning: paint nothing).
       '#RRGGBBAA' -> 'rgba(r,g,b,a)' because older webOS builds do not
       understand 8-digit hex in CSS. */
    function _cssColor(color) {
        if (!color) return '';
        var c = String(color).trim();
        if (c === 'transparent' || c === 'none') return '';
        if (c.charAt(0) === '#' && c.length === 9) {
            var a = parseInt(c.slice(7, 9), 16);
            if (isNaN(a) || a === 0) return '';
            return 'rgba(' + parseInt(c.slice(1, 3), 16) + ',' +
                             parseInt(c.slice(3, 5), 16) + ',' +
                             parseInt(c.slice(5, 7), 16) + ',' +
                             (a / 255).toFixed(3) + ')';
        }
        return c;
    }

    function _hasAnimation(el) {
        return !!(el && el.animation && el.animation.enabled &&
                  el.animation.type && el.animation.type !== 'none');
    }

    /**
     * Is the template currently being shown as PASSIVE PLAYBACK — i.e. as a
     * playlist slide or as a screen-saver slide?
     *
     * In those two contexts a template is pure signage: action / button / card
     * elements are drawn but their actionType / actionValue is NEVER executed
     * (no focus navigation is initialised there and the key handlers only deal
     * with EXIT). A navTimer must follow the very same rule — an auto-navigation
     * timer would otherwise yank the TV out of the playlist / screen saver.
     *
     * Returns the context name ('playlist' / 'screensaver') or '' when the
     * template is being shown normally on the ourHotel page.
     */
    function _passivePlaybackContext() {
        try {
            if (typeof ScreenSaver !== 'undefined' && ScreenSaver.isActive &&
                ScreenSaver.isActive()) {
                return 'screensaver';
            }
        } catch (e) {}
        try {
            if (typeof PlaylistPlayer !== 'undefined' && PlaylistPlayer.isActive &&
                PlaylistPlayer.isActive()) {
                return 'playlist';
            }
        } catch (e) {}
        /* Fallback: the global view flag main.js sets for the playlist page */
        try {
            if (typeof view !== 'undefined' && String(view) === 'playlist') {
                return 'playlist';
            }
        } catch (e) {}
        return '';
    }

    /**
     * STARTUP-SCREEN SCREEN-SAVER GATING (reactive half)
     *
     * ScreenSaver.armIdleTimer() itself refuses to SET a timer while
     * CanvasNavTimer.isPending() is true (see canvas-screenSaver.js) — but
     * that only guards calls made WHILE something is already pending. It
     * cannot help when the idle timer was armed BEFORE the navTimer started
     * (e.g. Main.startupScreenApi arms it synchronously right after setting
     * the page HTML, while the actual canvas render — and this navTimer's
     * first tick — only happens a moment later via an internal setTimeout(0)
     * in Util.ourHotelPage()). Without a reactive cancel here, that
     * already-set timer keeps ticking in the background and can fire in the
     * middle of a 30s autoplay journey even though a 10s idle timer was only
     * ever "supposed" to apply when nothing was going on.
     *
     * So: the moment a navTimer becomes pending, proactively clear whatever
     * idle timer exists (stray or not — harmless if there wasn't one). The
     * moment it reaches its final page, explicitly ask to arm again — nothing
     * else will do that on its own once a timer has been cleared this way.
     *
     * Scoped to startup-screen mode only (no-op otherwise), so normal-mode
     * navTimer / screen-saver behaviour is entirely unchanged.
     */
    function _clearScreenSaverIdle(reason) {
        try {
            if (Main._isStartupScreenMode && typeof ScreenSaver !== 'undefined' &&
                ScreenSaver.clearIdleTimer) {
                ScreenSaver.clearIdleTimer();
                _log('Screen saver idle timer cleared - ' + reason);
            }
        } catch (e) {}
    }

    function _armScreenSaverIdle(reason) {
        try {
            if (Main._isStartupScreenMode && typeof ScreenSaver !== 'undefined' &&
                ScreenSaver.armIdleTimer) {
                ScreenSaver.armIdleTimer();
                _log('Screen saver idle timer re-armed - ' + reason);
            }
        } catch (e) {}
    }

    /* ================================================================
       COUNTDOWN TEXT
    ================================================================ */

    /**
     * Format the remaining seconds according to el.countdownFormat.
     *
     * showCountdownLabels:true  -> unit letters, every field zero-padded
     * showCountdownLabels:false -> clock style, LEADING field unpadded and the
     *                              following fields zero-padded
     *
     *                    labels:true        labels:false
     *   's'              "05s"              "5"
     *   'ms'  (default)  "00m 05s"          "0:05"
     *   'hm'             "00h 00m"          "0:00"
     *   'hms'            "00h 00m 05s"      "0:00:05"
     */
    function _formatRemaining(el, remainingSec) {
        var total  = Math.max(0, Math.ceil(remainingSec));
        var fmt    = String(el.countdownFormat || 'ms').toLowerCase();
        var labels = el.showCountdownLabels !== false;

        var hours   = Math.floor(total / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var seconds = total % 60;

        if (fmt === 's' || fmt === 'ss' || fmt === 'sec' || fmt === 'seconds') {
            return labels ? (_pad(total) + 's') : String(total);
        }
        if (fmt === 'hms' || fmt === 'hhmmss') {
            return labels
                ? (_pad(hours) + 'h ' + _pad(minutes) + 'm ' + _pad(seconds) + 's')
                : (hours + ':' + _pad(minutes) + ':' + _pad(seconds));
        }
        if (fmt === 'hm' || fmt === 'hhmm') {
            return labels
                ? (_pad(hours) + 'h ' + _pad(minutes) + 'm')
                : (hours + ':' + _pad(minutes));
        }

        /* default: 'ms' - minutes + seconds (total minutes, not modulo hour) */
        var totalMinutes = Math.floor(total / 60);
        return labels
            ? (_pad(totalMinutes) + 'm ' + _pad(seconds) + 's')
            : (totalMinutes + ':' + _pad(seconds));
    }

    /**
     * Full countdown line: "Returning in 00m 05s"
     * actionLabel is intentionally NOT part of the output.
     */
    function _countdownText(el, remainingSec) {
        var prefix = (typeof el.countdownPrefix === 'string') ? el.countdownPrefix.trim() : '';
        var value  = _formatRemaining(el, remainingSec);
        return prefix ? (prefix + ' ' + value) : value;
    }

    /* ================================================================
       PLAN: what this element does when the lead-in elapses
    ================================================================ */

    /* "autoplay" and "sequence" are the same thing; everything else is ttl. */
    function _modeOf(el) {
        var m = String(el.mode || 'ttl').toLowerCase();
        return (m === 'autoplay' || m === 'sequence') ? 'autoplay' : 'ttl';
    }

    /* The element's own single action (ttl target) */
    function _ttlAction(el) {
        if (!el.actionType || !_hasValue(el.actionValue)) return null;
        return {
            actionType:  el.actionType,
            actionValue: el.actionValue,
            actionLabel: el.actionLabel || null
        };
    }

    /* The el.sequence entries, normalised (autoplay steps) */
    function _autoplaySteps(el) {
        var seq  = Array.isArray(el.sequence) ? el.sequence : [];
        var out  = [];
        for (var i = 0; i < seq.length; i++) {
            var s  = seq[i] || {};
            var at = s.actionType || s.type;
            var av = _hasValue(s.actionValue) ? s.actionValue : s.value;
            if (!at || !_hasValue(av)) continue;
            out.push({
                actionType:  at,
                actionValue: av,
                actionLabel: s.actionLabel || null,
                dwell:       s.dwell,
                isLast:      _isTrue(s.isLast)
            });
        }
        return out;
    }

    /* Should the chain wrap around when the last step had no isLast flag? */
    function _shouldLoop(el) {
        var end = String(el.onSequenceEnd || '').toLowerCase();
        if (end === 'loop') return true;
        if (end === 'stop' || end === 'hold' || end === 'none') return false;
        return el.loop === true;
    }

    /* ================================================================
       NAVIGATION (shared by ttl fire and every autoplay hop)
    ================================================================ */

    /**
     * Route the action through CanvasAction so a navTimer behaves EXACTLY
     * like a manual OK press on an action element (line loader, cleanup +
     * re-render, app launch, …) — with one deliberate difference:
     * clearRouteHistory forces the target template to become the route root,
     * because the guest never chose this navigation and so has nothing
     * meaningful to go "back" to.
     */
    function _navigate(elId, elName, step, callbacks) {
        var passive = _passivePlaybackContext();
        if (passive) {
            _log('Action suppressed (' + passive + ' playback):', step.actionType);
            return false;
        }

        if (typeof CanvasAction === 'undefined' || !CanvasAction.executeElementAction) {
            console.error('[CanvasNavTimer] CanvasAction.executeElementAction unavailable - ' +
                          'cannot run ' + step.actionType);
            return false;
        }

        /* One navigation at a time. Two OK presses in quick succession must
           not fire two page loads (double history push, racing renders). */
        _navStartedAt = Date.now();

        CanvasAction.executeElementAction({
            id:          elId,
            name:        elName,
            actionType:  step.actionType,
            actionValue: step.actionValue
        }, {
            clearRouteHistory: true,
            onNavigated: function () {
                _navStartedAt = 0;
                if (callbacks && callbacks.onNavigated) callbacks.onNavigated();
            },
            onFailed: function () {
                _navStartedAt = 0;
                if (callbacks && callbacks.onFailed) callbacks.onFailed();
            }
        });

        return true;
    }

    /* Is one of our navigations still loading? Time-boxed so a navigation that
       never reports back (no callback at all) cannot block us for ever. */
    function _navInFlight() {
        return _navStartedAt > 0 && (Date.now() - _navStartedAt) < NAV_TIMEOUT_MS;
    }

    /* ================================================================
       AUTOPLAY CHAIN — lives across page navigations
    ================================================================ */

    function _clearSessionTimer(s) {
        if (s && s.timerId) {
            clearTimeout(s.timerId);
            s.timerId = null;
        }
    }

    function _endSession(reason) {
        if (!_session) return;
        _clearSessionTimer(_session);
        _log('Autoplay chain ended (' + reason + ')');
        _session = null;
    }

    /**
     * Start walking el.sequence.
     *
     * startIndex lets the chain begin somewhere other than the first step —
     * used when the guest presses an action card that targets a sequence step
     * (see adoptAction).
     */
    function _startAutoplay(el, startIndex) {
        var steps = _autoplaySteps(el);
        if (steps.length === 0) {
            console.warn('[CanvasNavTimer] mode "autoplay" but sequence is empty - nothing to play:',
                         el.name || el.id);
            return;
        }

        _endSession('replaced');

        /* Stop every lead-in timer first: a still-ticking countdown would fire
           during the navigation and start a SECOND chain back at step 1. */
        _stopAllEntries();

        var index = (typeof startIndex === 'number' && startIndex >= 0 && startIndex < steps.length)
            ? startIndex : 0;

        _session = {
            steps:         steps,
            index:         index,
            dwellFallback: _sec(el.duration, DEFAULT_DURATION),
            loop:          _shouldLoop(el),
            elId:          el.id,
            elName:        el.name,
            sourceKey:     _key(el),
            timerId:       null
        };

        _log('Autoplay chain starting at step ' + (index + 1) + '/' + steps.length +
             ', loop:' + _session.loop);

        // The autoplay chain is now actively walking toward its final step —
        // cancel any idle timer that may already be ticking (startup-screen only).
        _clearScreenSaverIdle('autoplay chain starting (' + _elId(el) + ')');

        _hop();
    }

    /**
     * Index of the sequence step an action element points at, or -1.
     * Matched on actionValue (and actionType when the step carries one).
     */
    function _indexOfStep(steps, actionEl) {
        if (!steps || !actionEl || !_hasValue(actionEl.actionValue)) return -1;

        var wantValue = String(actionEl.actionValue);
        var wantType  = actionEl.actionType ? String(actionEl.actionType) : '';

        for (var i = 0; i < steps.length; i++) {
            if (String(steps[i].actionValue) !== wantValue) continue;
            if (wantType && steps[i].actionType &&
                String(steps[i].actionType) !== wantType) continue;
            return i;
        }
        return -1;
    }

    /**
     * The autoplay navTimer element on the template currently on screen, if any.
     * Read from the RAW template data (not the scaled copy) — only sequence /
     * duration / loop metadata is needed here.
     */
    function _findNavTimerElement(wantMode) {
        var els;
        try {
            els = Main.jsonTemplateData &&
                  Main.jsonTemplateData.template_json &&
                  Main.jsonTemplateData.template_json.elements;
        } catch (e) { return null; }

        if (!els || !els.length) return null;

        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el || el.visible === false) continue;
            if (String(el.type || '').toLowerCase() !== 'navtimer') continue;
            if (_modeOf(el) !== wantMode) continue;
            if (wantMode === 'autoplay' && _autoplaySteps(el).length === 0) continue;
            return el;
        }
        return null;
    }

    function _findAutoplayElement() { return _findNavTimerElement('autoplay'); }

    /**
     * PUBLIC: clearsHistoryOnAction()
     *
     * True when the template on screen carries a ttl navTimer.
     *
     * Such a page is an auto-advance page: its whole purpose is to move on,
     * and the timer's own navigation already drops the route history. A card
     * press on that page must behave the same way — the guest pressed OK a
     * moment before the countdown would have done it for them, so the target
     * becomes the route root either way and BACK/EXIT goes to the home screen
     * rather than returning to a page that was about to disappear.
     *
     * Read by CanvasAction.executeAction() for ANY action / button / card on
     * the page, not only one matching the timer's own actionValue.
     */
    function clearsHistoryOnAction() {
        if (_passivePlaybackContext()) return false;
        return !!_findNavTimerElement('ttl');
    }

    /**
     * PUBLIC: adoptAction(actionEl)
     *
     * Called by CanvasAction.executeAction() when the guest presses OK on an
     * action / button / card element.
     *
     * If that card targets one of the navTimer's sequence steps, the autoplay
     * chain JOINS the guest at that step instead of doing a plain navigation:
     * the page is opened through the autoplay runner, so the step's dwell and
     * isLast rules apply exactly as if the timer had walked there itself.
     *
     *   press "Move to Next Page" (-> Cricket, step 1 of 3)
     *      -> Cricket shown, dwell 10s
     *      -> Hotel   shown, dwell 10s
     *      -> Lion    shown, isLast -> route root, chain stops
     *
     * Returns true when the navTimer took over the navigation — the caller must
     * then NOT navigate again. Returns false to let CanvasAction handle the
     * press normally (unrelated target, no autoplay navTimer, passive playback).
     */
    function adoptAction(actionEl) {
        if (!actionEl || !_hasValue(actionEl.actionValue)) return false;
        if (_passivePlaybackContext()) return false;

        /* A page we requested is still loading — swallow the repeat press
           (OK pressed twice) rather than firing a second navigation. */
        if (_navInFlight()) {
            _log('Press ignored - a navigation is already loading');
            return true;
        }

        /* A chain is already walking — match against the steps it carries, so
           the guest can also jump ahead from an intermediate template. */
        if (_session) {
            var running = _indexOfStep(_session.steps, actionEl);
            if (running < 0) return false;      // unrelated target: guest leaves the chain

            _clearSessionTimer(_session);
            _session.index = running;
            _log('Action card matches sequence step ' + (running + 1) + '/' +
                 _session.steps.length + ' - chain jumps there');
            _hop();
            return true;
        }

        /* No chain yet (lead-in still counting down, or already finished):
           does the template on screen carry an autoplay navTimer? */
        var el = _findAutoplayElement();
        if (!el) return false;

        var steps = _autoplaySteps(el);
        var idx   = _indexOfStep(steps, actionEl);
        if (idx < 0) return false;

        _log('Action card matches sequence step ' + (idx + 1) + '/' + steps.length +
             ' - starting the autoplay chain there');
        _startAutoplay(el, idx);
        return true;
    }

    /**
     * Navigate to the current step, then schedule the next one after its
     * dwell — measured from the moment that template is actually painted.
     */
    function _hop() {
        if (!_session) return;

        var passive = _passivePlaybackContext();
        if (passive) {
            _endSession(passive + ' took over');
            return;
        }

        if (_navInFlight()) {
            _log('Hop ignored - a navigation is still loading');
            return;
        }

        var s    = _session;
        var step = s.steps[s.index];
        if (!step) { _endSession('step missing'); return; }

        var label   = step.actionLabel || step.actionValue;
        var human   = 'step ' + (s.index + 1) + '/' + s.steps.length + ' -> ' + label;

        /* ── isLast: show it, no dwell, chain stops, template is route root ── */
        if (step.isLast) {
            _log(human + ' | isLast:true - no dwell, this template becomes the ' +
                 'route root (previous templates dropped)');
            _endSession('isLast reached');
            _armScreenSaverIdle('autoplay chain reached its final (isLast) page');
            _navigate(s.elId, s.elName, step, null);
            return;
        }

        /* ── an app step always terminates the chain ─────────────────────
           Launching an app hands the whole screen to it. A dwell clock would
           keep ticking behind the app and navigate this hidden page, so the
           guest would come back to a template they never saw — or straight
           into another app. The app IS the end of the sequence, whether or
           not the step carries isLast.                                    */
        if (String(step.actionType) === 'app') {
            _log(human + ' | actionType "app" - the app takes the screen, ' +
                 'chain stops here (BACK from the app goes to the home screen)');
            _endSession('app step reached');
            _navigate(s.elId, s.elName, step, null);
            return;
        }

        /* ── work out which step follows this one ── */
        var next = s.index + 1;
        if (next >= s.steps.length) {
            if (!s.loop) {
                _log(human + ' | last step and onSequenceEnd is not "loop" - chain stops');
                _endSession('sequence end');
                _armScreenSaverIdle('autoplay chain reached its final page (sequence end)');
                _navigate(s.elId, s.elName, step, null);
                return;
            }
            next = 0;   // onSequenceEnd "loop" -> wrap around
        }

        var dwell = _sec(step.dwell, s.dwellFallback);
        s.index   = next;

        _log(human + ' | dwell ' + dwell + 's, then step ' + (next + 1));

        _navigate(s.elId, s.elName, step, {
            /* Painted -> start the dwell clock. Identity check guards against
               a chain that was cancelled or replaced while loading. */
            onNavigated: function () {
                if (_session !== s) return;
                _clearSessionTimer(s);
                s.timerId = setTimeout(function () { _hop(); }, dwell * 1000);
            },
            onFailed: function () {
                if (_session !== s) return;
                _endSession('navigation failed');
            }
        });
    }

    /* ================================================================
       DOM OVERLAY (lead-in countdown)
    ================================================================ */

    function _removeStale(elId) {
        var nodes = document.querySelectorAll('[data-canvas-navtimer-id="' + elId + '"]');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
        }
    }

    /**
     * Build the countdown overlay. Only called when showCountdown is on —
     * a navTimer with showCountdown off has no visual representation at all.
     * Returns { wrap: <div>, span: <span> }.
     */
    function _createOverlay(el) {
        var container = (typeof CanvasVideoBgHelper !== 'undefined')
            ? CanvasVideoBgHelper.getContainer()
            : (document.getElementById('our-hotel-container') || document.body);

        var elId = _elId(el);
        _removeStale(elId);

        var x       = Math.floor(el.x     || 0);
        var y       = Math.floor(el.y     || 0);
        var w       = Math.ceil(el.width  || 300);
        var h       = Math.ceil(el.height || 60);
        var opacity = (typeof el.opacity !== 'undefined') ? el.opacity : 1;
        var zIndex  = (el.zIndex && el.zIndex !== 'auto') ? el.zIndex : 10;

        var align   = String(el.textAlign || 'center').toLowerCase();
        var justify = align === 'left' ? 'flex-start' : (align === 'right' ? 'flex-end' : 'center');

        var wrap = document.createElement('div');
        wrap.setAttribute('data-canvas-navtimer-id', elId);
        wrap.style.cssText = 'position:absolute;pointer-events:none;margin:0;padding:0;' +
                             'box-sizing:border-box;overflow:hidden;display:flex;align-items:center;';
        wrap.style.left           = x + 'px';
        wrap.style.top            = y + 'px';
        wrap.style.width          = w + 'px';
        wrap.style.height         = h + 'px';
        wrap.style.opacity        = String(opacity);
        wrap.style.zIndex         = String(zIndex);
        wrap.style.justifyContent = justify;
        wrap.style.borderRadius   = (el.borderRadius || 0) + 'px';

        var bg = _cssColor(el.backgroundColor);
        if (bg) wrap.style.backgroundColor = bg;

        var borderColor = _cssColor(el.borderColor);
        if ((el.borderWidth || 0) > 0 && borderColor) {
            wrap.style.border = el.borderWidth + 'px solid ' + borderColor;
        }

        if (el.rotation && el.rotation !== 0) {
            wrap.style.transform       = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform = 'rotate(' + el.rotation + 'deg)';
            wrap.style.transformOrigin = 'center center';
        }

        /* Font family / weight normalised exactly like CanvasText does */
        var fontFamily, fontWeight;
        if (typeof CanvasFontLoader !== 'undefined') {
            fontFamily = CanvasFontLoader.normalizeFontFamily(el.fontFamily);
            fontWeight = CanvasFontLoader.normalizeFontWeight(el.fontWeight);
        } else {
            fontFamily = (el.fontFamily || 'Arial').split(',')[0]
                            .replace(/^['"\s]+|['"\s]+$/g, '') || 'Arial';
            fontWeight = el.fontWeight || 'normal';
        }

        var span = document.createElement('span');
        span.style.cssText    = 'display:block;margin:0;padding:0;white-space:nowrap;';
        span.style.fontSize   = (el.fontSize || 24) + 'px';
        span.style.fontFamily = fontFamily;
        span.style.fontWeight = fontWeight;
        span.style.fontStyle  = el.fontStyle || 'normal';
        span.style.color      = el.color || '#ffffff';
        span.style.textAlign  = align;
        span.style.lineHeight = '1.2';
        if (el.letterSpacing) span.style.letterSpacing = el.letterSpacing;

        if (el.textStroke && el.textStrokeColor) {
            var sw = el.textStrokeWidth || 1;
            span.style.webkitTextStroke = sw + 'px ' + el.textStrokeColor;
            span.style.textStroke       = sw + 'px ' + el.textStrokeColor;
        }
        if (el.textShadow) {
            var blur = (typeof el.textShadowBlur !== 'undefined') ? el.textShadowBlur : 4;
            span.style.textShadow = '2px 2px ' + blur + 'px ' + (el.textShadowColor || '#000000');
        }

        wrap.appendChild(span);

        /* Hidden until the duration phase starts (startDelay shows nothing) */
        wrap.style.visibility = 'hidden';

        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(wrap);
        _overlays.push(wrap);

        return { wrap: wrap, span: span };
    }

    function _setText(entry, text) {
        if (!entry.span) return;
        if (entry.lastText === text) return;      // avoid needless reflow on TV
        entry.span.textContent = text;
        entry.lastText = text;
    }

    function _showOverlay(entry) {
        if (!entry.wrap || entry.shown) return;
        entry.shown = true;

        if (_hasAnimation(entry.el) &&
            typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
            /* applyAnimation flips visibility itself once the CSS is attached */
            CanvasAnimation.applyAnimation(entry.el, null);
        } else {
            entry.wrap.style.visibility = 'visible';
        }
    }

    function _hideOverlay(entry) {
        if (!entry.wrap) return;
        entry.shown = false;
        entry.wrap.style.visibility = 'hidden';
    }

    /* ================================================================
       PUBLIC: render()  - called by CanvasRenderer per navTimer element
    ================================================================ */

    function render(ctx, el, canvas) {
        if (!el) return;

        /* PLAYLIST / SCREEN SAVER: discard the navTimer completely — no
           overlay, no countdown, no auto-navigation. Exactly like the action
           elements on those slides, whose actionValue is never executed. */
        var passive = _passivePlaybackContext();
        if (passive) {
            _log('Discarded (' + passive + ' playback - templates are passive there):',
                 _elId(el));
            return;
        }

        var key  = _key(el);
        var mode = _modeOf(el);

        /* An autoplay chain is already walking the sequence — never start a
           second lead-in (this also covers a chain that loops back through
           the template holding this element). */
        if (_session) {
            _log('Autoplay chain already running - lead-in skipped:', _elId(el));
            return;
        }

        /* Already ticking for this element on this template - keep it running
           (CanvasRenderer.refresh() must not restart the countdown). */
        if (_entries[key] && _entries[key].intervalId) {
            _log('Already running, left untouched:', _elId(el));
            return;
        }

        /* Lead-in that already fired on this template must never fire twice
           just because something re-rendered the element (e.g. updateClocks()
           repainting an overlapping region). */
        if (_finished[key]) {
            _log('Already completed on this template - not restarted:', _elId(el));
            return;
        }

        /* What happens when the lead-in elapses? */
        var action = null, steps = null;
        if (mode === 'autoplay') {
            steps = _autoplaySteps(el);
            if (steps.length === 0) {
                console.warn('[CanvasNavTimer] mode "autoplay" with an empty sequence - ' +
                             'nothing to do:', el.name || el.id);
                return;
            }
        } else {
            action = _ttlAction(el);
            if (!action) {
                console.warn('[CanvasNavTimer] mode "ttl" without actionType/actionValue - ' +
                             'nothing to do:', el.name || el.id);
                return;
            }
        }

        var startDelay    = _sec(el.startDelay, 0);
        var duration      = _sec(el.duration, DEFAULT_DURATION);
        var showCountdown = el.showCountdown === true;
        var overlay       = showCountdown ? _createOverlay(el) : { wrap: null, span: null };

        var entry = {
            el:           el,
            key:          key,
            mode:         mode,
            action:       action,
            startDelay:   startDelay,
            duration:     duration,
            phase:        startDelay > 0 ? 'delay' : 'running',
            phaseStartTs: Date.now(),
            wrap:         overlay.wrap,
            span:         overlay.span,
            shown:        false,
            lastText:     null,
            firing:       false,
            intervalId:   null
        };

        /* Continue where a previous render on this same template left off
           (CanvasRenderer.render() soft-cleans every module before drawing). */
        var saved = _resume[key];
        if (saved) {
            entry.phase        = saved.phase;
            entry.phaseStartTs = saved.phaseStartTs;
            _log('Resumed lead-in (' + entry.phase + '):', _elId(el));
        }
        delete _resume[key];

        _entries[key] = entry;

        // A navTimer is now actively counting toward firing — cancel any idle
        // timer that may already be ticking (startup-screen only). This also
        // covers Main.startupScreenApi's boot-time arm, which fires before
        // this very render() call (it happens synchronously right after the
        // page HTML is set, a tick before the canvas actually paints).
        _clearScreenSaverIdle('navTimer lead-in started (' + _elId(el) + ')');

        _log('Start "' + _elId(el) + '" | mode:' + mode +
             ' | startDelay:' + startDelay + 's | duration:' + duration + 's' +
             ' | ' + (mode === 'autoplay'
                        ? ('sequence of ' + steps.length + ' step(s)')
                        : (action.actionType + ' -> ' + action.actionValue)) +
             ' | showCountdown:' + showCountdown);

        _tick(entry);   // paint the first frame immediately
        entry.intervalId = setInterval(function () { _tick(entry); }, TICK_MS);
    }

    /* ================================================================
       TICK - drives delay -> running -> complete -> fire
    ================================================================ */

    function _tick(entry) {
        /* The screen saver / playlist may have taken over WHILE this countdown
           was running (idle timeout). Drop the timer at once so it can never
           navigate away from a slide. */
        var passive = _passivePlaybackContext();
        if (passive) {
            _log('Aborted mid-countdown (' + passive + ' took over):', _elId(entry.el));
            _stopEntry(entry, false);
            return;
        }

        /* Overlay was torn down by someone else (page swap) -> stop */
        if (entry.wrap && !entry.wrap.parentNode) {
            _stopEntry(entry, false);
            return;
        }
        if (entry.phase === 'done' || entry.firing) return;

        var now     = Date.now();
        var elapsed = (now - entry.phaseStartTs) / 1000;

        /* -- PHASE 1: startDelay - nothing is displayed -- */
        if (entry.phase === 'delay') {
            _hideOverlay(entry);
            if (elapsed >= entry.startDelay) {
                entry.phase        = 'running';
                entry.phaseStartTs = entry.phaseStartTs + entry.startDelay * 1000; // no drift
                _log('startDelay done -> counting down ' + entry.duration + 's');
                _tick(entry);
            }
            return;
        }

        /* -- PHASE 2: duration - countdown ticks down every second -- */
        if (entry.phase === 'running') {
            var remaining = entry.duration - elapsed;

            if (remaining > 0) {
                if (entry.span) {
                    _showOverlay(entry);
                    _setText(entry, _countdownText(entry.el, remaining));
                }
                return;
            }

            /* reached zero */
            entry.phase        = 'complete';
            entry.phaseStartTs = now;

            var msg = entry.el.countdownCompleteMessage;
            if (entry.span && msg && String(msg).trim() !== '') {
                _showOverlay(entry);
                _setText(entry, String(msg));
                return;                        // hold the message, then fire
            }
            _fire(entry);
            return;
        }

        /* -- PHASE 3: completion message hold, then fire -- */
        if (entry.phase === 'complete') {
            if (now - entry.phaseStartTs >= COMPLETE_HOLD_MS) _fire(entry);
        }
    }

    /* ================================================================
       FIRE - ttl navigates once; autoplay hands over to the chain
    ================================================================ */

    function _fire(entry) {
        if (entry.firing) return;
        entry.firing = true;
        _hideOverlay(entry);

        /* ── autoplay: the sequence takes over from here ── */
        if (entry.mode === 'autoplay') {
            _log('Lead-in elapsed -> handing over to the autoplay sequence');
            entry.phase = 'done';
            _finished[entry.key] = true;
            _stopEntry(entry, false);
            _startAutoplay(entry.el);
            return;
        }

        /* ── ttl: single navigation, target becomes the route root ── */
        _log('Lead-in elapsed -> executing',
             entry.action.actionType + ' : ' + entry.action.actionValue);
        try {
            _navigate(entry.el.id, entry.el.name, entry.action, null);
        } catch (e) {
            console.error('[CanvasNavTimer] Action failed:', e);
        }

        /* A dynamicPage action tears this page (and this timer) down via
           CanvasRenderer.cleanup(); the bookkeeping below only matters for
           actions that keep the page alive.

           An app action never re-arms, even with loop on: the app now owns
           the screen, and a countdown ticking behind it would relaunch the
           app over and over while the guest is using it. */
        if (_shouldLoop(entry.el) && String(entry.action.actionType) !== 'app') {
            entry.phase        = entry.startDelay > 0 ? 'delay' : 'running';
            entry.phaseStartTs = Date.now();
            entry.lastText     = null;
            entry.firing       = false;
            return;
        }

        entry.phase = 'done';
        _finished[entry.key] = true;
        _stopEntry(entry, false);

        // ttl fired its one navigation and will not loop — the target page it
        // just navigated to is the final page. Nothing left pending here.
        _armScreenSaverIdle('ttl navTimer reached its final page (' + _elId(entry.el) + ')');
    }

    /* ================================================================
       REMOTE CONTROL — deliberately NOT wired
    ================================================================
       A navTimer is driven exclusively by its own clock. No remote key
       advances it, fires its action or restarts it:

         - OK / ENTER      executes the focused action card only
                           (Navigation.ourHotelPageNavigation).
         - arrows / others  move card focus; the timer is untouched.
         - EXIT / BACK      leaves the page and CANCELS the timer + any
                           autoplay chain — the only key that affects it.

       The element properties allowManualStep and resetOnInteraction are
       therefore intentionally ignored: no key-driven entry point exists,
       so nothing can make a navTimer navigate ahead of its countdown.
    ================================================================ */

    /* ================================================================
       CLEANUP
    ================================================================ */

    function _stopEntry(entry, keepResume) {
        if (entry.intervalId) {
            clearInterval(entry.intervalId);
            entry.intervalId = null;
        }
        if (entry.wrap && entry.wrap.parentNode) {
            entry.wrap.parentNode.removeChild(entry.wrap);
        }
        if (keepResume && entry.phase !== 'done') {
            _resume[entry.key] = {
                phase:        entry.phase === 'complete' ? 'running' : entry.phase,
                phaseStartTs: entry.phaseStartTs
            };
        }
        delete _entries[entry.key];
    }

    /* Stop every lead-in timer on this template (no resume state kept).
       Used when the autoplay chain takes over, so a still-ticking countdown
       cannot fire behind it and start a second chain. */
    function _stopAllEntries() {
        for (var key in _entries) {
            if (!_entries.hasOwnProperty(key)) continue;
            _entries[key].phase = 'done';
            _finished[key] = true;
            _stopEntry(_entries[key], false);
        }
        _entries = {};
    }

    function _dropOverlays() {
        for (var i = 0; i < _overlays.length; i++) {
            if (_overlays[i] && _overlays[i].parentNode) {
                _overlays[i].parentNode.removeChild(_overlays[i]);
            }
        }
        _overlays = [];
    }

    /**
     * SOFT cleanup — stop lead-in timers + drop overlays but remember how far
     * each had progressed, so the re-render that CanvasRenderer performs
     * (refresh / navigation init) continues the countdown instead of
     * restarting it. Resume state is template-scoped.
     *
     * Never touches a running autoplay chain.
     */
    function cleanup() {
        for (var key in _entries) {
            if (_entries.hasOwnProperty(key)) _stopEntry(_entries[key], true);
        }
        _entries = {};
        _dropOverlays();
    }

    /**
     * HARD cleanup — this template is being left. Forgets all lead-in progress
     * so the next visit starts from startDelay again.
     *
     * IMPORTANT: an autoplay chain deliberately SURVIVES this, because every
     * hop of the chain leaves a template (and therefore calls reset()). Use
     * cancelAutoplay() to stop the chain itself.
     */
    function reset() {
        for (var key in _entries) {
            if (_entries.hasOwnProperty(key)) _stopEntry(_entries[key], false);
        }
        _entries  = {};
        _resume   = {};
        _finished = {};
        _dropOverlays();

        var stale = document.querySelectorAll('[data-canvas-navtimer-id]');
        for (var s = 0; s < stale.length; s++) {
            if (stale[s].parentNode) stale[s].parentNode.removeChild(stale[s]);
        }
        _log('Reset complete' + (_session ? ' (autoplay chain still running)' : ''));
    }

    /**
     * Stop the autoplay chain — the guest took over (EXIT / BACK, OK on a
     * card) or the playlist / screen saver claimed the screen.
     */
    function cancelAutoplay(reason) {
        var had = !!_session;
        _endSession(reason || 'cancelled');

        /* Also drop any lead-in still counting down on this page: the guest
           took over, so a countdown that fires a moment later must not start
           a fresh chain behind them. */
        _stopAllEntries();
        _dropOverlays();

        return had;
    }

    function isAutoplayRunning() { return !!_session; }

    /**
     * PUBLIC: isPending()
     *
     * Read-only: true while a navTimer is still actively working toward its
     * target on the CURRENT template — an autoplay chain mid-flight (running
     * or between hops), or a ttl/autoplay lead-in still in its
     * startDelay/duration/complete phase. False once it has fired and
     * settled (the "final page" — a plain page like any other).
     *
     * This reports state only; it never starts, stops or alters anything.
     * Used by ScreenSaver.armIdleTimer() (startup-screen mode only) so the
     * idle timer is never actually set while a navTimer's duration/dwell is
     * still running — the arm attempt defers and re-checks shortly until it
     * reports false, at which point the idle timer is allowed to start.
     */
    function isPending() {
        if (_session) return true;
        for (var key in _entries) {
            if (_entries.hasOwnProperty(key) && _entries[key].phase !== 'done') return true;
        }
        return false;
    }

    /**
     * PUBLIC: fireNow(reason)
     *
     * Forces whatever navTimer is pending on the CURRENT template to act
     * immediately, instead of waiting out its remaining delay/duration/dwell.
     *
     * Used only where EXIT would otherwise leave the guest stuck with nothing
     * to do — the startup-screen root canvas, which has no "home" to fall back
     * to. There, EXIT must still land the guest somewhere: whatever page the
     * pending navTimer was already counting down to.
     *
     *   - autoplay chain mid-dwell (a hop already happened, waiting to hop
     *     again) -> skip the wait, hop to the next step right now.
     *   - ttl / autoplay lead-in still ticking (startDelay or duration phase,
     *     chain not started yet) -> fire it now, exactly as if the countdown
     *     had reached zero on its own.
     *
     * Returns true when something was actually fired, false when there was no
     * pending navTimer on this template (caller should fall back to its own
     * "nothing to do" handling).
     */
    function fireNow(reason) {
        /* An autoplay chain is already walking and is between hops (waiting
           on its dwell timer) — advance it immediately instead of cancelling. */
        if (_session) {
            _log('Fire-now: forcing immediate hop (' + (reason || '') + ')');
            _clearSessionTimer(_session);
            _hop();
            return true;
        }

        /* No chain running yet: fire whichever lead-in(s) are still ticking
           on this template (startDelay or duration phase). Normally there is
           at most one per template. */
        var fired = false;
        for (var key in _entries) {
            if (!_entries.hasOwnProperty(key)) continue;
            var entry = _entries[key];
            if (entry.phase === 'done' || entry.firing) continue;
            _log('Fire-now: forcing immediate fire (' + (reason || '') + '):', _elId(entry.el));
            _fire(entry);
            fired = true;
        }
        return fired;
    }

    /* ================================================================
       PUBLIC API
    ================================================================ */
    return {
        render:                 render,
        adoptAction:            adoptAction,
        clearsHistoryOnAction:  clearsHistoryOnAction,
        cancelAutoplay:    cancelAutoplay,
        isAutoplayRunning: isAutoplayRunning,
        isPending:         isPending,
        fireNow:           fireNow,
        cleanup:           cleanup,
        reset:             reset
    };
})();
