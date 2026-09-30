/**
 * ====================================================================
 * canvas-screensaver.js  –  Screen Saver Manager
 * LG Pro:Centric TV App
 *
 * THIS MODULE DOES ZERO NETWORK CALLS.
 * All data (screen-saver entries, playlist data, template data) is
 * fetched ONCE by Main.screenSaverInterval() and stored in:
 *
 *   Main.screenSaverData = {
 *     ready:        true,
 *     entries: [
 *       {
 *         name, destination_url, priority_order, screen_time,
 *         playlistData:  { play_list_json: [...], name, ... },
 *         templates:     { <template_uuid>: <templateResult>, ... }
 *       },
 *       ...  (sorted by priority_order ascending)
 *     ],
 *     allTemplates: { <template_uuid>: <templateResult>, ... }
 *   }
 *
 * This module only:
 *   1. Arms/clears an idle timer (screen_saver_start_time seconds).
 *   2. On timer fire → calls PlaylistPlayer.startFromCache() with data
 *      taken straight from Main.screenSaverData.entries[_currentIdx].
 *   3. On playlist end (onPlaylistComplete) → advances _currentIdx
 *      (round-robin) and calls PlaylistPlayer.relaunchFromCache().
 *   4. On any remote key press (handleKeyPress) → stops PlaylistPlayer
 *      silently, calls Main.previousPage(), re-arms idle timer.
 *
 * BACK-STACK SAFETY
 * ─────────────────
 * Main.addBackData('playlist') is called ONCE on first launch (_isFirstLaunch).
 * Round-robin entries use relaunchFromCache() which never touches backData.
 * So pressing any key always returns to exactly one previous page
 * (macroHome or languagePage).
 *
 * PUBLIC API
 * ──────────
 *  ScreenSaver.armIdleTimer()      – Start / restart idle countdown.
 *  ScreenSaver.clearIdleTimer()    – Cancel idle countdown only.
 *  ScreenSaver.handleKeyPress()    – Call from processTrigger every keydown.
 *                                    Returns true if key was consumed.
 *  ScreenSaver.isActive()          – True while screen saver is playing.
 *  ScreenSaver.onPlaylistComplete()– Called by PlaylistPlayer on natural end.
 * ====================================================================
 */

var ScreenSaver = (function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE STATE
    ───────────────────────────────────────────────────────────────── */
    var _active        = false;  // true while a screen-saver playlist is playing
    var _currentIdx    = 0;      // index into Main.screenSaverData.entries (round-robin)
    var _isFirstLaunch = true;   // true → use startFromCache; false → relaunchFromCache
    var _idleTimer     = null;   // setTimeout handle

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE HELPERS
    ───────────────────────────────────────────────────────────────── */
    function _log(msg)  { console.log('[ScreenSaver] '  + msg); }
    function _warn(msg) { console.warn('[ScreenSaver] ' + msg); }

    /**
     * Returns true only when is_screen_saver_service is explicitly true.
     * Any other value (false, undefined, missing) disables the service.
     */
    function _isServiceEnabled() {
        try {
            var enabled = Main.deviceProfile &&
                          Main.deviceProfile.property_detail &&
                          Main.deviceProfile.property_detail.is_screen_saver_service;
            return enabled === true;
        } catch (e) { return false; }
    }

    function _clearTimer() {
        if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    }

    function _readIdleSec() {
        try {
            var t = Main.deviceProfile && Main.deviceProfile.property_detail.screen_saver_start_time;
            var n = parseInt(t, 10);
            return (!isNaN(n) && n > 0) ? n : 0;
        } catch (e) { return 0; }
    }

    /** Return entries array from Main.screenSaverData, or []. */
    function _entries() {
        return (Main.screenSaverData &&
                Main.screenSaverData.ready &&
                Array.isArray(Main.screenSaverData.entries))
            ? Main.screenSaverData.entries
            : [];
    }

    /* ─────────────────────────────────────────────────────────────────
       LAUNCH  — reads ONLY from Main.screenSaverData, zero network
    ───────────────────────────────────────────────────────────────── */
    function _launch() {
        var entries = _entries();
        if (!entries.length) {
            _warn('Main.screenSaverData not ready or empty — cannot launch');
            _active = false;
            return;
        }

        // Clamp index
        if (_currentIdx >= entries.length) _currentIdx = 0;

        var entry = entries[_currentIdx];

        // Validate entry has all data needed
        if (!entry || !entry.playlistData || !entry.templates) {
            _warn('Entry[' + _currentIdx + '] missing playlistData or templates — skipping');
            _currentIdx = (_currentIdx + 1) % entries.length;
            // Avoid infinite skip: if all entries are bad, abort
            var bad = 0;
            for (var ci = 0; ci < entries.length; ci++) {
                if (!entries[ci] || !entries[ci].playlistData) bad++;
            }
            if (bad >= entries.length) {
                _warn('No entries have playlistData — aborting');
                _active = false;
                return;
            }
            _launch();
            return;
        }

        _log('Launching entry ' + (_currentIdx + 1) + '/' + entries.length +
             ' | name: ' + (entry.name || '') +
             ' | uuid: ' + (entry.destination_url || '') +
             ' | slides: ' + ((entry.playlistData.play_list_json || []).length) +
             ' | templates cached: ' + Object.keys(entry.templates).length);

        _active = true;

        try {
            if (_isFirstLaunch) {
                // First activation — full start: addBackData, DOM build, render
                _isFirstLaunch = false;

                // Track screen saver activation
                try {
                    Main.deviceActivity('open',  'page', 'Screen saver');
                } catch (e) { _warn('deviceActivity (open) threw: ' + e); }

                PlaylistPlayer.startFromCache(
                    entry.playlistData,
                    entry.templates,
                    function () { onPlaylistComplete(); }
                );
            } else {
                // Round-robin — reuse existing DOM, no addBackData
                PlaylistPlayer.relaunchFromCache(
                    entry.playlistData,
                    entry.templates,
                    function () { onPlaylistComplete(); }
                );
            }
        } catch (e) {
            _warn('PlaylistPlayer launch threw: ' + e);
            _active = false;
        }
    }

    /* ─────────────────────────────────────────────────────────────────
       PUBLIC API
    ───────────────────────────────────────────────────────────────── */

    /**
     * Checks network availability via webapis.network.getActiveConnectionType.
     * Calls callback(true) if network is available, callback(false) otherwise.
     * Falls back to callback(true) if webapis.network is not accessible,
     * so the screen saver is not blocked on platforms without the API.
     */
    function _checkNetworkThenArm(callback) {
        try {
            /* SAMSUNG: webapis.network.getActiveConnectionType() returns
               DISCONNECTED(0) / WIFI(1) / CELLULAR(2) / ETHERNET(3). This is
               synchronous, unlike the LG idcap call it replaces. */
            if (typeof webapis === 'undefined' || !webapis.network) {
                _warn('_checkNetworkThenArm: webapis.network not available — assuming network OK');
                callback(true);
                return;
            }

            var connType = window._netRead ? window._netRead().type
                                           : webapis.network.getActiveConnectionType();
            var TYPES    = webapis.network.NetworkActiveConnectionType;

            var wiredState = (connType === TYPES.ETHERNET) ? "connected" : "disconnected";
            var wifiState  = (connType === TYPES.WIFI)     ? "connected" : "disconnected";

            var isConnected = (wiredState === "connected") || (wifiState === "connected");

            _log('Network check — wiredState=' + wiredState +
                ' | wifiState=' + wifiState +
                ' → isConnected=' + isConnected);

            callback(isConnected);
        } catch (e) {
            _warn('_checkNetworkThenArm: exception=' + e + ' — assuming network OK');
            callback(true);
        }
    }

    /**
     * ScreenSaver.armIdleTimer()
     *
     * Starts (or resets) the idle countdown using
     * Main.deviceProfile.screen_saver_start_time (seconds).
     *
     * No-op when:
     *   • screen saver is already active
     *   • Main.screenSaverData is not ready yet
     *   • screen_saver_start_time is 0 or missing
     *   • network is not available (checked via webapis.network.getActiveConnectionType)
     */
    function armIdleTimer() {
        if (_active) return;

        // Respect the is_screen_saver_service flag from the device profile.
        // If it is not explicitly true, do nothing.
        if (!_isServiceEnabled()) {
            _warn('armIdleTimer: is_screen_saver_service is not true — screen saver disabled');
            return;
        }

        var entries = _entries();
        if (!entries.length) {
            _warn('armIdleTimer: Main.screenSaverData not ready — timer not armed');
            return;
        }

        var idleSec = _readIdleSec();
        if (idleSec <= 0) {
            _warn('screen_saver_start_time=0 or missing — timer disabled');
            return;
        }

        // Check network availability before arming the timer.
        // If no network, the screen saver is skipped entirely for this arm cycle.
        _checkNetworkThenArm(function (networkAvailable) {
            if (!networkAvailable) {
                _warn('armIdleTimer: network not available — screen saver will not start');
                return;
            }

            _clearTimer();
            _log('Idle timer armed: ' + idleSec + 's');

            _idleTimer = setTimeout(function () {
                // Only fire on home or language page
                if (view !== 'macroHome' && view !== 'languagePage') {
                    _log('Timer fired on view="' + view + '" — re-arming');
                    armIdleTimer();
                    return;
                }
                _log('Idle threshold reached — launching screen saver');
                _currentIdx    = 0;     // always start from highest-priority entry
                _isFirstLaunch = true;  // ensure addBackData is called on first launch
                _launch();
            }, idleSec * 1000);
        });
    }

    /**
     * ScreenSaver.clearIdleTimer()
     * Cancels pending idle countdown. Does not stop an active screen saver.
     */
    function clearIdleTimer() { _clearTimer(); }

    /**
     * ScreenSaver.handleKeyPress()
     *
     * Must be called from Main.processTrigger() on EVERY keydown event.
     *
     * Behaviour:
     *   • NOT active → resets idle timer on home/language pages. Returns false.
     *   • ACTIVE     → stops screen saver, navigates back to previous page
     *                  (macroHome or languagePage), re-arms timer. Returns true.
     *                  processTrigger() must return immediately when true.
     */
    function handleKeyPress() {
        // Always reset idle timer on key press when on eligible view,
        // but only if the screen saver service is enabled.
        if (!_active && (view === 'macroHome' || view === 'languagePage')) {
            var entries = _entries();
            if (entries.length && _isServiceEnabled()) armIdleTimer();
        }

        if (!_active) return false; // nothing to stop

        // ── Screen saver is running — stop it immediately ─────────────
        _log('Key pressed — stopping screen saver');
        _active        = false;
        _currentIdx    = 0;      // reset so next activation starts from entry 0
        _isFirstLaunch = true;   // reset so addBackData fires on next activation
        _clearTimer();

        // Track screen saver deactivation
        try {
            Main.deviceActivity('open',  'page', 'Home screen');
        } catch (e) { _warn('deviceActivity (close) threw: ' + e); }

        // stopSilent() cleans canvas/DOM without calling Main.previousPage()
        try {
            if (typeof PlaylistPlayer !== 'undefined' && PlaylistPlayer.isActive()) {
                if (typeof PlaylistPlayer.stopSilent === 'function') {
                    PlaylistPlayer.stopSilent();
                } else {
                    // Fallback: stop() calls Main.previousPage() internally
                    PlaylistPlayer.stop();
                    setTimeout(function () { armIdleTimer(); }, 400);
                    return true;
                }
            }
        } catch (e) {
            _warn('Error stopping PlaylistPlayer: ' + e);
        }

        // Navigate back to macroHome or languagePage (whatever was in backData)
        try { Main.previousPage(); } catch (e) { _warn('previousPage threw: ' + e); }

        // Re-arm idle timer after navigation completes
        setTimeout(function () { armIdleTimer(); }, 400);

        return true; // key consumed — processTrigger must return immediately
    }

    /**
     * ScreenSaver.onPlaylistComplete()
     *
     * Called by PlaylistPlayer when all slides in the current playlist
     * have been shown once (natural end, not a key press).
     * Advances _currentIdx round-robin and launches the next entry.
     */
    function onPlaylistComplete() {
        if (!_active) return; // stopped by key press already

        var entries = _entries();
        if (!entries.length) {
            // Track screen saver deactivation
            try {
                Main.deviceActivity('open',  'page', 'Home screen');
            } catch (e) { _warn('deviceActivity (close-noentries) threw: ' + e); }
            _active = false;
            return;
        }

        var prevName = (entries[_currentIdx] && entries[_currentIdx].name) || '';

        // Advance with wrap-around
        _currentIdx = (_currentIdx + 1) % entries.length;

        _log('Playlist "' + prevName + '" complete → entry ' + _currentIdx +
             ' | name: ' + (entries[_currentIdx].name || ''));

        // Brief pause for DOM/canvas to settle
        setTimeout(function () {
            if (!_active) return; // key pressed in the meantime
            _launch();
        }, 300);
    }

    /** ScreenSaver.isActive() */
    function isActive() { return _active; }

    /* ── public surface ───────────────────────────────────────────────── */
    return {
        armIdleTimer:       armIdleTimer,
        clearIdleTimer:     clearIdleTimer,
        handleKeyPress:     handleKeyPress,
        onPlaylistComplete: onPlaylistComplete,
        isActive:           isActive
    };

})();