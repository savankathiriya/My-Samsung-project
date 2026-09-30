var app = {}
var macro = jQuery.noConflict();
var appConfig = {
	appVersion:"v1.1210"
};
var loadFilePaths = 'macrotv.json';
var apiPrefixUrl = "https://tvapi.guestxp.com/app/";

// ── HTTP behaviour for a file:// origin ──────────────────────────────────────
// Every API call is cross-origin from a packaged app, and the Authorization
// header forces a CORS preflight on each one. The browser will REUSE a cached
// preflight, but only if the server sends Access-Control-Max-Age - ask your
// backend team to add:
//     Access-Control-Allow-Origin: null      (a file:// app sends Origin: null)
//     Access-Control-Allow-Headers: Authorization, Content-Type
//     Access-Control-Max-Age: 86400
// Without Max-Age every single request pays an extra round trip, which on this
// TV's network is the difference between seconds and minutes.
// ── PER-REQUEST TIMING ───────────────────────────────────────────────────────
// Wraps macro.ajax so EVERY call logs its own duration. The download screen
// stalls at 50/60/80/95 - each of those is one API call - and this prints
// exactly how long each one took, and how much of it was time-to-first-byte.
// Read it in the debug overlay Logs tab: press 1.
try {
  if (typeof macro !== 'undefined' && macro.ajax && !macro.__timed) {
    var _origAjax = macro.ajax;
    macro.ajax = function (opts) {
      if (!opts || typeof opts !== 'object') return _origAjax.apply(this, arguments);

      var label = String(opts.url || '?').split('/').pop().split('?')[0] || '?';
      var t0 = Date.now();
      var tFirstByte = null;

      var origXhrFn = opts.xhr;
      opts.xhr = function () {
        var x = origXhrFn ? origXhrFn.apply(this, arguments)
                          : new window.XMLHttpRequest();
        try {
          x.addEventListener('readystatechange', function () {
            // readyState 2 = headers received. The gap between send() and this
            // is connection setup: DNS + TLS + preflight + server think time.
            if (x.readyState === 2 && tFirstByte === null) {
              tFirstByte = Date.now() - t0;
            }
          }, false);
        } catch (e) {}
        return x;
      };

      var origComplete = opts.complete;
      opts.complete = function (jqXHR, textStatus) {
        var total = Date.now() - t0;
        console.log('[API] ' + label + '  ' + (total / 1000).toFixed(1) + 's total' +
          (tFirstByte !== null ? '  (' + (tFirstByte / 1000).toFixed(1) + 's to first byte)' : '') +
          '  ' + textStatus + ' ' + (jqXHR && jqXHR.status));
        if (origComplete) origComplete.apply(this, arguments);
      };

      return _origAjax.call(this, opts);
    };
    macro.__timed = true;
  }
} catch (e) { console.warn('[API] timing hook failed', e); }

try {
  if (typeof macro !== 'undefined' && macro.ajaxSetup) {
    macro.ajaxSetup({
      // Do NOT append a cache-busting timestamp: it makes every URL unique,
      // so no response is ever reused and no preflight result is ever cached.
      cache: true,
      timeout: 20000
    });
  }
} catch (e) {}
var scount = 0, mainCount = 0;
var isLoading = false;
var airMouse = false;
var deviceRegisCheck;
var tvKeyCode = {
	ArrowLeft: 37,
	ArrowUp: 38,
	ArrowRight: 39,
	ArrowDown: 40,
	Enter: 13,
	Return: 461,
	Power: 409,
	ChannelUp: 427,
	ChannelDown: 428,
	Exit: 1001,
	Guide: 458,
  Netflix: 403,
  Youtube: 404,
  Casting: 406
};
var deviceMac = null;
// var deviceMac = '1cf43ff843b4';
var deviceSerialNumber = null;
// var deviceSerialNumber = '507kklpk6504';
var deviceModelName = "";
var deviceTvName = "";
var lastNetworkType = "";
var deviceIp  = null;
var isWarmMode = false;
var DisplayCheckOutScreen = false;

// SAMSUNG: webapis.network.getMac() returns "50:B7:A3:C2:96:11" - uppercase,
// colon separated. LG's hcap.network.getNetworkDevice() returned the bare form
// "1cf43ff843b4" (lowercase, no separators), which is what the GuestXP
// provision-auth backend matches on. Normalise so registration succeeds.
function _normalizeMac(mac) {
  if (!mac) return null;
  var m = String(mac).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  return (m.length === 12) ? m : null;
}

function _isValidIp(ip) {
  return typeof ip === "string" &&
         ip !== "0.0.0.0" &&
         /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

// Keep module-level handles so we can cancel them
var _macRetryTimer = null;
var _macTimeoutTimer = null;
var _macRetryIntervalMs = 2000;   // retry every 2s
var _macOverallTimeoutMs = 120000; // 120s total

// Network-ready poll — waits for a valid IP before firing provision-auth.
// On a cold start the IP is already assigned by the time MAC is found.
// On a restart/warm-reboot the webOS network stack reinitialises AFTER
// HCAP hardware registers (MAC) are readable, so the XHR fires before
// TCP/IP is up, producing readyState:0 / status:0 errors.
var _networkReadyTimer = null;
var _networkReadyAttempts = 0;
var _networkReadyMaxAttempts = 30; // 30 × 2 s = 60 s maximum wait

function _waitForNetworkThenRegister() {
    _networkReadyAttempts = 0;
    _pollNetworkReady();
}

function _pollNetworkReady() {
    // If a valid IP is already known, fire immediately
    if (_isValidIp(deviceIp)) {
        console.log('[Network] IP ready (' + deviceIp + ') — starting provision-auth');
        try { Main.deviceRegistrationAPi(); } catch (e) { console.error("deviceRegistrationAPi error:", e); }
        return;
    }

    _networkReadyAttempts++;

    if (_networkReadyAttempts > _networkReadyMaxAttempts) {
        // Waited 60 s and still no IP — try anyway; the existing error handler
        // will fall through to restoreFromCacheAndOpenApp() if still down.
        console.warn('[Network] Timed out waiting for IP — attempting provision-auth anyway');
        try { Main.deviceRegistrationAPi(); } catch (e) { console.error("deviceRegistrationAPi error:", e); }
        return;
    }

    console.log('[Network] Waiting for IP stack... attempt ' + _networkReadyAttempts);

    try {
        // SAMSUNG: webapis.network.getIp() is synchronous. It throws
        // InvalidStateError while the IP stack is still coming up, which is
        // exactly the condition this poller is waiting out.
        if (typeof webapis !== 'undefined' && webapis.network) {
            try {
                var ip = webapis.network.getIp();
                if (_isValidIp(ip)) {
                    deviceIp = ip;
                }
            } catch (eIp) {
                // network not ready yet - keep polling
            }
            // Once a valid IP is in hand there is nothing left to wait for.
            // The LG version polled forever because getNetworkInformation was
            // async and cheap; webapis.network.getIp() is SYNCHRONOUS and runs
            // on the UI thread, so polling it every 2s for the life of the app
            // steals time from the download sequence for no benefit.
            if (_isValidIp(deviceIp)) {
                // Acquired on THIS tick. Stop polling and start registration
                // immediately. Previously this only cleared the timer and
                // returned, so no further tick ever ran and the app sat on the
                // download screen at 0% until some other path happened to
                // nudge it - which is why the stall was intermittent.
                console.log('[Network] IP acquired, stopping poll and registering:', deviceIp);
                _networkReadyTimer = null;
                if (window.bootStep) { window.bootStep('MAC / IP acquired', 'ok'); window.bootStep('provision-auth', 'start'); }
                try { Main.deviceRegistrationAPi(); }
                catch (e) { console.error("deviceRegistrationAPi error:", e); }
            } else {
                _networkReadyTimer = setTimeout(_pollNetworkReady, 2000);
            }
        } else {
            // Fallback: scan device interfaces directly
            _scanDevicesForIpAndMac(function () {
                _networkReadyTimer = setTimeout(_pollNetworkReady, 2000);
            });
        }
    } catch (e) {
        _networkReadyTimer = setTimeout(_pollNetworkReady, 2000);
    }
}

function showGettingMacScreen() {
    // Display a centered please-wait message (adapt HTML/CSS to your app)
    macro("#mainContent").html('<div id="mac-wait"">Please wait</div>');
    macro("#mainContent").show();
}

function showMacErrorScreen() {
    var html = ''
      + '<div id="mac-error">'
      + '<div class="mac_error_head">Unable to get MAC address</div>'
      + '<div class="mac_error_head_span">Please restart the TV</div>'
      + '</div>';
    macro("#mainContent").html(html);
    macro("#mainContent").show();

    // wire buttons
    macro("#mac-retry-btn").off("click").on("click", function () {
        // clear existing timers then re-init the flow
        clearMacTimers();
        startMacAcquisitionFlow();
    });
}


function clearMacTimers() {
    try { if (_macRetryTimer) { clearTimeout(_macRetryTimer); _macRetryTimer = null; } } catch (e) {}
    try { if (_macTimeoutTimer) { clearTimeout(_macTimeoutTimer); _macTimeoutTimer = null; } } catch (e) {}
}

// webapis.network.getIp() / getMac() are SYNCHRONOUS IPC calls into the Tizen
// platform - each one blocks the UI thread, and on this hardware that is tens
// of milliseconds, not microseconds. The LG equivalents were async callbacks
// and effectively free, so the original code calls them freely on timers.
// Cache the values: the MAC never changes, and the IP only changes on a
// network event, so re-reading them on every heartbeat tick is pure UI stall.
var _netCache = { ip: null, mac: null, type: null, at: 0 };
var _NET_CACHE_MS = 15000;

function _netRead(force) {
  var now = Date.now();
  if (!force && _netCache.at && (now - _netCache.at) < _NET_CACHE_MS) {
    return _netCache;
  }
  if (typeof webapis === 'undefined' || !webapis.network) return _netCache;

  try { _netCache.type = webapis.network.getActiveConnectionType(); } catch (e) {}
  try {
    var ip = webapis.network.getIp();
    if (_isValidIp(ip)) _netCache.ip = ip;
  } catch (e) {}
  if (!_netCache.mac) {                       // MAC is immutable - read once
    try {
      var m = _normalizeMac(webapis.network.getMac());
      if (m) _netCache.mac = m;
    } catch (e) {}
  }
  _netCache.at = now;
  return _netCache;
}
window._netRead = _netRead;

// Refresh the cache on real network events instead of by polling.
try {
  if (typeof webapis !== 'undefined' && webapis.network &&
      webapis.network.addNetworkStateChangeListener) {
    webapis.network.addNetworkStateChangeListener(function () {
      _netRead(true);
    });
  }
} catch (e) {}

function _scanDevicesForIpAndMac(callback) {
  // SAMSUNG: there is no indexed network-device list. webapis.network exposes
  // only the ACTIVE interface, via synchronous getIp() / getMac().
  if (typeof webapis === "undefined" || !webapis.network) {
    return typeof callback === "function" && callback(false);
  }

  try {
    var net = _netRead(true);          // force: this runs during acquisition
    if (net.ip)  deviceIp  = net.ip;
    if (net.mac) deviceMac = net.mac;

    return typeof callback === "function" && callback(!!deviceMac);
  } catch (e) {
    return typeof callback === "function" && callback(false);
  }
}

function getTvAllDetails(callback) {
  try {
    // SAMSUNG: IP and MAC both come from webapis.network synchronously, so the
    // two-stage LG lookup (getNetworkInformation, then scan devices) collapses
    // into the single scan below.
    if (typeof webapis === "undefined" || !webapis.network) {
      console.warn("webapis.network not available");
      return typeof callback === "function" && callback(false);
    }

    _scanDevicesForIpAndMac(function (ok) {
      if (ok && deviceMac) {
        console.log("✅ MAC Address:", deviceMac);
      } else {
        console.warn("MAC Address not found");
      }
      typeof callback === "function" && callback(!!deviceMac);
    });

  } catch (e) {
    console.error("getTvAllDetails error:", e && e.message);
    typeof callback === "function" && callback(false);
  }
}

// The repeated attempt routine
function _attemptGetMac(onComplete) {
    getTvAllDetails(function (ok) {
        if (ok && deviceMac) {
            // got MAC
            clearMacTimers();
            if (typeof onComplete === "function") onComplete(true);
            return;
        }
        // not yet — schedule next try if timeout not reached (macTimeoutTimer will handle overall timeout)
        _macRetryTimer = setTimeout(function () {
            _attemptGetMac(onComplete);
        }, _macRetryIntervalMs);
    });
}

// ── BOOT WATCHDOG ────────────────────────────────────────────────────────────
// Give the whole boot chain a hard ceiling. If it has not reached the language
// page in 60s, open the app from cache anyway: a stale portal is recoverable,
// a frozen progress bar is a support call.
function armBootWatchdog() {
  if (window._bootWatchdog) return;
  window._bootWatchdog = setTimeout(function () {
    if (window._bootCompleted) return;
    console.error('[Boot] chain stalled - opening from cache. db=' +
      (Main.db ? 'open' : 'none') +
      ' dbUnavailable=' + !!Main._dbUnavailable +
      ' ip=' + deviceIp + ' mac=' + deviceMac);

    try {
      if (typeof Main.logTvException === 'function') {
        Main.logTvException({
          error_type:    'BOOT_CHAIN_STALLED',
          error_code:    'BOOT_TIMEOUT_60S',
          error_message: 'Boot chain did not reach the language page within 60s',
          error_source:  'armBootWatchdog',
          module:        'boot',
          action:        'open_from_cache'
        });
      }
    } catch (e) {}

    try {
      if (typeof Main.restoreFromCacheAndOpenApp === 'function') {
        Main.restoreFromCacheAndOpenApp();
      }
    } catch (e) { console.error('[Boot] cache restore failed', e); }
  }, 60000);
}

function startMacAcquisitionFlow() {
	armBootWatchdog();
	if (window.bootStep) { window.bootStep('splash shown', 'ok'); window.bootStep('MAC / IP acquired', 'start'); }
	showGettingMacScreen();

	    // start overall timeout
    _macTimeoutTimer = setTimeout(function () {
        
		// timed out stopped show mac error screen
        clearMacTimers();
        console.warn("Timed out obtaining device MAC after " + (_macOverallTimeoutMs / 1000) + " seconds");
        showMacErrorScreen();
    }, _macOverallTimeoutMs);

	// start first attempt immediately
    _attemptGetMac(function (success) {
        if (success) {
            console.log("Device MAC obtained:", deviceMac);
            // proceed with app initialization sequence
            try {
                bindingAppsToPms();
            } catch (e) { console.warn("bindingAppsToPms error:", e); }

            var res1 = JSON.parse(localStorage.getItem('lgLgChannelMetaDetails'));
            var res2 = JSON.parse(localStorage.getItem('lgLgChannelIdDetails'));

            console.log("presentPagedetails.lgLgChannelIdDetails---------------------------------------------->", res2)
            console.log("presentPagedetails.lgLgChannelMetaDetails----------------------------------------------->", res1)
            // Wait until TCP/IP stack is ready (valid IP assigned) before firing
            // provision-auth. On restart, MAC is available from hardware immediately
            // but the network daemon may still be reinitialising — sending an XHR
            // before the stack is up produces readyState:0 / status:0 errors.

            try { getDeviceSerialNumber(); } catch (e) { console.warn("getDeviceSerialNumber error:", e); }
            try { getDeviceModelName(); } catch (e) { console.warn("getDeviceModelName error:", e); }
            try { getDeviceTvName(); } catch (e) { console.warn("getDeviceTvName error:", e); }

                                    // ── DELETE-API ARGUMENT SEARCH (temporary) ───────────────────
            // arity = 1, so the signature is deleteAppPrivateInfo(DeleteInfo).
            // No callback param, and no enum exposed on the object - so try
            // candidate values until one is accepted.
            // WARNING: a candidate that succeeds WILL wipe guest app data.
            // Run on a TEST TV with a throwaway YouTube login only.
            (function findDeleteInfo() {
              var sc = (typeof webapis !== 'undefined') ? webapis.systemcontrol : null;
              if (!sc || typeof sc.deleteAppPrivateInfo !== 'function') {
                console.log('[DEL] method not present');
                return;
              }

              // Full method list - looking for a companion listener setter,
              // since a 1-arg call has no way to report completion.
              try {
                var fns = [];
                for (var k in sc) { if (typeof sc[k] === 'function') fns.push(k); }
                console.log('[DEL] all methods:', fns.sort().join(', '));
              } catch (e) {}

              var candidates = [
                'ALL', 'NOW', 'DELETE_ALL', 'DELETE_NOW', 'IMMEDIATE',
                'APP', 'PRIVATE', 'ON', 'TRUE',
                0, 1, true,
                {}, { type: 'ALL' }, { deleteInfo: 'ALL' }, { mode: 'ALL' },
                { appId: 'com.samsung.tv.cobalt-yt' }
              ];

              for (var i = 0; i < candidates.length; i++) {
                var arg = candidates[i];
                var label = (typeof arg === 'object' && arg !== null)
                              ? JSON.stringify(arg) : String(arg) + ' (' + typeof arg + ')';
                try {
                  sc.deleteAppPrivateInfo(arg);
                  console.log('[DEL] >>> ACCEPTED:', label);
                  return;                    // stop at the first success
                } catch (e) {
                  console.log('[DEL] rejected ' + label + ': ' + (e && e.name) +
                              ' - ' + (e && e.message));
                }
              }

              console.log('[DEL] no candidate accepted');
            })();
            // ─────────────────────────────────────────────────────────────

            _waitForNetworkThenRegister();

            // Enable "delete app private info". Activation setter ("ON"/"OFF"),
            // NOT an immediate wipe: the runtime rejected ALL, NOW, DELETE_NOW
            // and IMMEDIATE and accepted only "ON". The platform performs the
            // deletion on the next power cycle. deleteAppPrivateInfoNow is
            // signage-only and does not exist on HTV.
            try {
              webapis.systemcontrol.deleteAppPrivateInfo('ON');
              console.log('[Checkout] app private info deletion policy enabled');
            } catch (e) {
              console.warn('[Checkout] deleteAppPrivateInfo("ON") failed:', e && e.name, e && e.message);
            }

            try { registerKeyCodeNumbers(); } catch (e) { console.warn("registerKeyCodeNumbers error:", e); }
            try { registerKeyCodeExit(); } catch (e) { console.warn("registerKeyCodeExit error:", e); }
            try { registerChannelAndMediaKeys(); } catch (e) { console.warn("registerChannelAndMediaKeys error:", e); }
            try { initHCAPPowerDefaults(); } catch (e) { console.warn("initHCAPPowerDefaults error:", e); }
            try {
              if(typeof stopAndClearMedia === 'function') {
                stopAndClearMedia();
              }
            } catch(e) {}

            // Stop any intervals
            try {
              if (Main.lgLgchannelMetaRefreshInterval) {
                clearInterval(Main.lgLgchannelMetaRefreshInterval);
                Main.lgLgchannelMetaRefreshInterval = null;
              }
            }catch(e) {
              console.warn('Error clearing interval:', e);
            }

            try { resetHdmiToLIveTv(); } catch (e) { console.warn("resetHdmiToLIveTv error:", e); }
            try { clearNoSignalNative(); } catch (e) { console.warn("clearNoSignalNative error:", e); }
            try { exitLiveTv(); } catch (eExit) { console.warn('exitLiveTv threw', eExit); }

            // Clear current channel and navigate back
            try {
              presentPagedetails.currentChannelId = undefined;
              presentPagedetails.showingTvGuide = false;
            } catch(e) {
              console.warn('Error navigating back:', e);
            }

            // Clean up overlays and UI elements
            try {
              macro('.lg-tv-overlay').css('display', 'none');
              macro('.tv-guide-container').css('display', 'none');
              macro('.live-tv-overlay').css('display', 'none');
              macro('.live-tv-guide-container').css('display', 'none');
            } catch(e) {console.warn('Error hiding overlays:', e);}

            // Reset background
            try {
              document.body.style.background = "#000";
            } catch(e) {
              console.warn('Error resetting background:', e);
            }

            // SAMSUNG: no HCAP mode equivalent - on Tizen the app window is
            // always composited above the video plane, so nothing to reset.
        }
    });
}

function getDeviceSerialNumber() {
  // SAMSUNG: webapis.systemcontrol.getSerialNumber() is the true chassis
  // serial but needs the PARTNER systemcontrol privilege. ProductInfo
  // getDuid() is public and is the fallback. NOTE: on hospitality firmware
  // getDuid() often returns the serial itself (a short 13-16 char string).
  try {
    if (typeof webapis !== 'undefined' && webapis.systemcontrol) {
      deviceSerialNumber = webapis.systemcontrol.getSerialNumber();
      return;
    }
  } catch (ex) {
    console.warn('[ProductInfo] getSerialNumber failed:', ex && ex.message);
  }

  try {
    if (typeof webapis !== 'undefined' && webapis.productinfo) {
      deviceSerialNumber = webapis.productinfo.getDuid();
    }
  } catch (ex) {
    console.error('[ProductInfo] Exception:', 'serial_number', ex);
  }
}

function getDeviceModelName() {
  // SAMSUNG: webapis.productinfo.getModel() returns the model name,
  // getRealModel() the full model string (e.g. HG50U701FAULXL).
  try {
    if (typeof webapis !== 'undefined' && webapis.productinfo) {
      deviceModelName = webapis.productinfo.getModel();
      if (!deviceModelName) {
        deviceModelName = webapis.productinfo.getRealModel();
      }
    }
  } catch (ex) {
    console.error('[ProductInfo] Exception:', 'model_name', ex);
  }
}

function getDeviceTvName() {
  // SAMSUNG: webapis.network.getTVName() returns the device's network name.
  try {
    if (typeof webapis !== 'undefined' && webapis.network) {
      deviceTvName = webapis.network.getTVName();
    }
  } catch (ex) {
    console.error('[Network] Exception:', 'tv_name', ex);
  }
}

function registerKeyCodeNumbers() {
    // SAMSUNG: tizen.tvinputdevice.registerKey(keyName) takes a NAME, not a
    // scancode. The Power key is reserved by the platform and cannot be
    // registered, so registering it is not possible here - the number keys
    // are registered instead, which is what the rest of the app relies on.
    try {
      if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        var numberKeys = ['0','1','2','3','4','5','6','7','8','9'];
        for (var i = 0; i < numberKeys.length; i++) {
          try {
            tizen.tvinputdevice.registerKey(numberKeys[i]);
          } catch (kerr) {
            console.warn('registerKey(' + numberKeys[i] + ') failed:', kerr && kerr.message);
          }
        }
        console.log("Number keys registered successfully");
        console.warn("Power key cannot be registered on Tizen - reserved by the platform");
      } else {
        console.warn("tizen.tvinputdevice API not available on this device");
      }
    } catch (e) {
      console.error("Exception while registering number keys:", e);
    }
}

function registerKeyCodeExit() {
    // SAMSUNG: LG 1001 (Exit) and 457 (Info) map to the Tizen key names
    // "Exit" and "Info".
    try {
      if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        var keys = ['Exit', 'Info'];
        for (var i = 0; i < keys.length; i++) {
          try {
            tizen.tvinputdevice.registerKey(keys[i]);
          } catch (kerr) {
            console.warn('registerKey(' + keys[i] + ') failed:', kerr && kerr.message);
          }
        }
        console.log("Keys (Exit, Info) registered successfully");
      } else {
        console.warn("tizen.tvinputdevice API not available on this device");
      }
    } catch (e) {
      console.error("Exception while registering Exit/Info keys:", e);
    }
}

function registerChannelAndMediaKeys() {
    // ROOT CAUSE OF "CHANNEL UP/DOWN DOES NOTHING":
    // On Tizen, ChannelUp (427) and ChannelDown (428) are NOT delivered to a
    // web app unless the app registers them. Unregistered, the platform
    // consumes them for its own tuner and no keydown ever reaches
    // Navigation.lgLgDemoPlayers - which is why the switch case looked dead
    // even though the code was correct. LG had no such requirement.
    //
    // Guide is registered too so the Guide button opens the app guide rather
    // than the TV's built-in EPG.
    if (typeof tizen === 'undefined' || !tizen.tvinputdevice) {
        console.warn('tizen.tvinputdevice not available - channel keys cannot be registered');
        return;
    }

    var wanted = [
        'ChannelUp', 'ChannelDown', 'ChannelList', 'Guide',
        'MediaPlay', 'MediaPause', 'MediaStop',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'
    ];

    // getSupportedKeys() tells us what this panel actually exposes. Hospitality
    // firmware varies between HU800 / HU701 / HUF7010F, so check before
    // registering rather than throwing on every model.
    var supported = null;
    try {
        var list = tizen.tvinputdevice.getSupportedKeys();
        supported = {};
        for (var s0 = 0; s0 < list.length; s0++) {
            supported[list[s0].name] = list[s0].code;
        }
        console.log('[Keys] supported key count:', list.length);
    } catch (eSup) {
        console.warn('[Keys] getSupportedKeys failed, registering blind:', eSup && eSup.message);
    }

    var registered = [];
    for (var i = 0; i < wanted.length; i++) {
        var name = wanted[i];
        if (supported && !(name in supported)) {
            console.warn('[Keys] ' + name + ' not supported on this model, skipping');
            continue;
        }
        try {
            tizen.tvinputdevice.registerKey(name);
            registered.push(name + (supported ? '=' + supported[name] : ''));
        } catch (kerr) {
            console.warn('[Keys] registerKey(' + name + ') failed:', kerr && kerr.message);
        }
    }
    console.log('[Keys] registered:', registered.join(', '));

    // Sanity check: if the panel reports a different scancode than the LG
    // values hard-coded in tvKeyCode, realign so the switch statements match.
    if (supported) {
        try {
            if (supported.ChannelUp   && tvKeyCode.ChannelUp   !== supported.ChannelUp) {
                console.warn('[Keys] ChannelUp code differs: tvKeyCode=' + tvKeyCode.ChannelUp +
                             ' device=' + supported.ChannelUp + ' - realigning');
                tvKeyCode.ChannelUp = supported.ChannelUp;
            }
            if (supported.ChannelDown && tvKeyCode.ChannelDown !== supported.ChannelDown) {
                console.warn('[Keys] ChannelDown code differs: tvKeyCode=' + tvKeyCode.ChannelDown +
                             ' device=' + supported.ChannelDown + ' - realigning');
                tvKeyCode.ChannelDown = supported.ChannelDown;
            }
            if (supported.Guide && tvKeyCode.Guide !== supported.Guide) {
                tvKeyCode.Guide = supported.Guide;
            }
        } catch (eAlign) {}
    }
}

function initHCAPPowerDefaults() {
    // SAMSUNG: LG's instant_power=2 (persistent warm/instant-on) maps to
    // webapis.systemcontrol.setAutoPowerOn("ON"). Both getter and setter are
    // synchronous and need the PARTNER systemcontrol privilege.
    if (typeof webapis === 'undefined' || !webapis.systemcontrol) {
      console.warn('webapis.systemcontrol not available - cannot set auto power on');
      return;
    }

    try {
      var cur = webapis.systemcontrol.getAutoPowerOn();
      console.log('auto power on current value =', cur);

      if (cur !== 'ON') {
        webapis.systemcontrol.setAutoPowerOn('ON');
        console.log('auto power on set to "ON" (Samsung equivalent of instant_power 2)');
      }
    } catch (e) {
      console.warn('auto power on get/set failed (partner privilege required?):', e && e.message);
    }

    // SAMSUNG: security_level is an LG property with no Samsung counterpart.
    // Persist it in widget storage so any app code reading it back still works.
    try {
      if (webapis.widgetdata && webapis.widgetdata.write) {
        webapis.widgetdata.write('security_level', '2');
      } else {
        window.localStorage.setItem('security_level', '2');
      }
      console.log('security_level stored as "2"');
    } catch (e) {
      console.warn('security_level set skipped', e);
    }
}

function appStart() {
	console.log("Starting appStart sequence (MAC acquisition flow)");
	// Reset HDMI state on app startup
	if (typeof resetHdmiOnStartup === "function") {
		resetHdmiOnStartup();
	}
	startMacAcquisitionFlow();
}

app.checkMainFilesStatus = function() {
	function checkMainFiles() {
		try {
			app.loadMeta();
		} catch (e) {
			clearInterval(loadTimeInterval);
			loadTimeInterval = '';
			loadTimeInterval = setTimeout(checkMainFiles, 100);
		}
	}
	var loadTimeInterval = setTimeout(checkMainFiles, 100);
}

app.loadMeta = function() {
	try {
		if (vers.files) {
			for (var i = 0; i < vers.files.length; i++) {
				if (vers.files[i].FileName.indexOf('css') != -1) {
					var link = document.createElement('link');
					link.setAttribute('rel', 'stylesheet');
					link.setAttribute('type', 'text/css');
					link.setAttribute('href', "" + vers.files[i].FileName + "?v=" + vers.files[i].VersionNo + "");
					document.getElementsByTagName('head')[0].appendChild(link);

					if (link.addEventListener) {
						link.addEventListener('load', function() {
							scount++;
							if (scount == vers.files.length) app.initialize();
						}, false);
					} else if (link.onreadystatechange) {
						link.onreadystatechange = function() {
							var state = link.readyState;
							if (state === 'loaded' || state === 'complete') {
								link.onreadystatechange = null;
								scount++;
								if (scount == vers.files.length) app.initialize();
							}
						};
					} else {
						link.onload = function() {
							scount++;
							if (scount == vers.files.length) app.initialize();
						};
					}
				} else {
					var fileref = document.createElement('script');
					if (typeof fileref != "undefined") {
						fileref.src = "" + vers.files[i].FileName + "?v=" + vers.files[i].VersionNo + "";
						document.getElementsByTagName("head")[0].appendChild(fileref);
						if (fileref.onreadystatechange) {
							fileref.onreadystatechange = function() {
								if (this.readyState == 'complete') {
									scount++;
									if (scount == vers.files.length) app.initialize();
								}
							}
						} else {
							fileref.onload = function() {
								scount++;
								if (scount == vers.files.length) app.initialize();
							}
						}
					}
				}
			}
		}
	} catch (e) {
		if (!!document.getElementById("customMessage")) {
			document.getElementById("customMessage").style.display = "block";
			document.getElementById("customMessage").innerHTML = "<p class='loadNot'><img style='width: 70px;vertical-align: -25px;padding-right: 14px;' src='https://d20w296omhlpzq.cloudfront.net/devices/common/shape-9@3x.png'/>Unable to load necessary modules, Please check your internet connection and relaunch the application.</p>";
		}
	}
}

app.initialize = function() {
	// Register the extra remote keys FIRST. registerKey() only takes effect
	// for keydown events that arrive after it runs, and the copy inside the
	// MAC-success callback never fires if provisioning stalls - which is how
	// Channel Up/Down ended up dead even on builds where the handler existed.
	try { registerChannelAndMediaKeys(); } catch (e) { console.warn('registerChannelAndMediaKeys (early) error:', e); }

	Main.showSplash();
	setTimeout(function() {
		console.log("Splash timeout complete, proceeding to MAC acquisition");
		appStart();
	}, 1500)

	window.addEventListener('keydown', function(e) {
		airMouse = false;
		if (isLoading == false) {
			var id = macro('.mouseFocus').attr("id");
			if (id) {
				macro('#' + id).removeClass('mouseFocus');
			}
			Main.processTrigger(e);
		}
	});
}

app.appPreLoad = function() {
	macro.ajax({
			type: "GET",
			url: loadFilePaths + "?v=" + new Date().getTime(),
			// TIZEN: a packaged .wgt runs from file://, where a successful XHR
			// returns HTTP status 0. Without dataType jQuery can misread that as
			// an error, and without a timeout a stalled request hangs forever -
			// which leaves the screen black because every CSS and JS file in the
			// app is loaded from this one response.
			dataType: "json",
			timeout: 20000
		})
		.done(function(msg) {
			try {
				if (typeof msg == "string") {
					vers = JSON.parse(msg);
				} else {
					vers = msg;
				}

				if (vers.mainFiles) {
					for (var i = 0; i < vers.mainFiles.length; i++) {
						if (vers.mainFiles[i].FileName.indexOf('css') != -1) {
							var link = document.createElement('link');
							link.setAttribute('rel', 'stylesheet');
							link.setAttribute('type', 'text/css');
							link.setAttribute('href', vers.mainFiles[i].FileName + "?v=" + vers.mainFiles[i].VersionNo);
							document.getElementsByTagName('head')[0].appendChild(link);

							link.onload = link.onreadystatechange = function() {
								if (!this.readyState || this.readyState === 'loaded' || this.readyState === 'complete') {
									mainCount++;
									if (mainCount == vers.mainFiles.length) app.checkMainFilesStatus();
								}
							};
						} else {
							var fileref = document.createElement('script');
							if (typeof fileref != "undefined") {
								fileref.src = vers.mainFiles[i].FileName + "?v=" + vers.mainFiles[i].VersionNo;
								document.getElementsByTagName("head")[0].appendChild(fileref);

								fileref.onload = fileref.onreadystatechange = function() {
									if (!this.readyState || this.readyState === 'loaded' || this.readyState === 'complete') {
										mainCount++;
										if (mainCount == vers.mainFiles.length) app.checkMainFilesStatus();
									}
								};
							}
						}
					}
				}
			} catch (e) {
				console.log(e);
				app.errorLoad();
			}
		})
		.fail(function(err) {
			app.errorLoad();
		});
};

app.errorLoad = function() {
	if (!!document.getElementById("customMessage")) {
		document.getElementById("customMessage").style.display = "block";
		document.getElementById("customMessage").innerHTML = "<p class='loadNot'><img style='width: 70px;vertical-align: -25px;padding-right: 14px;' src='https://d20w296omhlpzq.cloudfront.net/devices/common/shape-9@3x.png'/>Unable to load necessary modules, Please check your internet connection and relaunch the application.</p>";
	}
	window.addEventListener('keydown', function(e) {
		app.reloadApp(e);
	});
}

app.reloadApp = function(event) {
	var keycode = (window.event) ? event.keyCode : event.which;
	if (keycode == 13) {
		document.getElementById("customMessage").style.display = "none";
		location.reload();
	} else if (keycode == 8 || keycode == 27) {
		window.close();
	}
}

function resetHdmiToLIveTv() {
	try {
		// SAMSUNG: no HCAP mode to restore. Only the source switch back to the
		// tuner is needed - tizen.tvwindow.setSource({ type: 'TV' }).
		if (typeof tizen !== 'undefined' && tizen.tvwindow) {
			tizen.tvwindow.setSource({ type: 'TV' },
				function () {
					console.log("Returned to Live TV (Tuner)");
				},
				function (f) {
					console.warn("Failed to return to Live TV:", f && f.message);
				});
		}
	} catch (e) {
		console.warn('return-to-TV failed', e);
	}
}

document.addEventListener('power_mode_changed', function(event) {
  console.log("Power mode changed event:", event);
  console.log("view outside------------------------------------------>", view);

  // ── Send status to backend on every power mode change ────────────────
  // Mirrors exactly how startStatusHeartbeat builds and posts its payload.
  // screen_status: 'on' when NORMAL, 'off' when WARM.
  (function _sendPowerChangedStatus() {

    function _buildAndPost(screenStatus) {
      // SAMSUNG: webapis.network is synchronous - no callback plumbing needed.
      if (typeof webapis === "undefined" || !webapis.network) {
        var p = {
          cmd: "get_status",
          response: {
            app_status:          "Online",
            cmd_status:          true,
            screen_status:       screenStatus || "",
            device_network_ip:   deviceIp          || "",
            sr_no:               deviceSerialNumber || "",
            mac_address:         deviceMac          || "",
            screen_saver_status: (typeof ScreenSaver !== 'undefined' && ScreenSaver.isActive()) ? "active" : "inactive"
          },
          seq: 9999
        };
        _postToBackend(p);
        return;
      }

      // SAMSUNG: build the same networkInfo shape from webapis.network.
      // getActiveConnectionType() tells us which interface is live; getIp/
      // getMac/getWiFiSsid describe it. Wrapped in try/catch because these
      // throw InvalidStateError when the interface is down.
      try {
        // Cached read - these are synchronous IPC calls and this runs on a
        // repeating heartbeat, so hitting the platform every tick stalls the UI.
        var _net      = window._netRead ? window._netRead() : {};
        var _TYPES    = webapis.network.NetworkActiveConnectionType;
        var _isEth    = (_net.type === _TYPES.ETHERNET);
        var _isWifi   = (_net.type === _TYPES.WIFI);

        var _ip = _net.ip || "", _mac = _net.mac || "", _ssid = "", _gw = false;
        try { _gw  = webapis.network.isConnectedToGateway(); } catch (e) {}
        if (_isWifi) { try { _ssid = webapis.network.getWiFiSsid() || ""; } catch (e) {} }

          var networkInfo = {
            wired: {
              mac:        _isEth ? _mac : "",
              state:      _isEth ? "connected" : "disconnected",
              ipAddress:  _isEth ? _ip : "",
              onInternet: _isEth ? _gw : "",
              plugged:    _isEth
            },
            wifi: {
              mac:        _isWifi ? _mac : "",
              state:      _isWifi ? "connected" : "disconnected",
              ipAddress:  _isWifi ? _ip : "",
              onInternet: _isWifi ? _gw : "",
              ssid:       _ssid
            }
          };
          var p = {
            cmd: "get_status",
            response: {
              app_status:          "Online",
              cmd_status:          true,
              screen_status:       screenStatus || "",
              device_network_ip:   deviceIp          || "",
              sr_no:               deviceSerialNumber || "",
              mac_address:         deviceMac          || "",
              screen_saver_status: (typeof ScreenSaver !== 'undefined' && ScreenSaver.isActive()) ? "active" : "inactive",
              network_info:        networkInfo
            },
            seq: 9999
          };
          _postToBackend(p);
      } catch (eNet) {
        console.warn("[Status] network read failed:", eNet && eNet.message);
          var p = {
            cmd: "get_status",
            response: {
              app_status:          "Online",
              cmd_status:          true,
              screen_status:       screenStatus || "",
              device_network_ip:   deviceIp          || "",
              sr_no:               deviceSerialNumber || "",
              mac_address:         deviceMac          || "",
              screen_saver_status: (typeof ScreenSaver !== 'undefined' && ScreenSaver.isActive()) ? "active" : "inactive"
            },
            seq: 9999
          };
          _postToBackend(p);
      }
    }

    function _postToBackend(payload) {
      if (!pageDetails || !pageDetails.access_token) return;
      macro.ajax({
        url:         apiPrefixUrl + "device-mqtt-cmd",
        type:        "POST",
        data:        JSON.stringify(payload),
        contentType: "application/json; charset=utf-8",
        headers:     { Authorization: "Bearer " + pageDetails.access_token },
        success: function (res) {
          console.log("[PowerModeChanged] Status sent:", res);
        },
        error: function (err) {
          console.warn("[PowerModeChanged] Failed to send status:", err);
        },
        timeout: 60000
      });
    }

    // SAMSUNG: no getPowerMode API. Tizen sets document.hidden when the panel
    // enters standby, which carries the same on/off meaning as LG NORMAL/WARM.
    try {
      var screenStatus = (document.hidden === true) ? 'off' : 'on';
      console.log("[PowerModeChanged] Resolved screen_status:", screenStatus);
      _buildAndPost(screenStatus);
    } catch (e) {
      console.warn("[PowerModeChanged] screen status exception:", e);
      _buildAndPost(null);
    }
  })();
  // ─────────────────────────────────────────────────────────────────────

  // SAMSUNG: document.hidden === true is the standby ("WARM") signal.
  try {
    (function() {
      var isWarm = (document.hidden === true);
      console.log("screen hidden ---------------->", isWarm);

      {
        if (isWarm) {
          // ── Entering WARM mode ─────────────────────────────────────────
          // 1) Stamp the time in BOTH memory AND localStorage so it survives

          // 2) Live TV cleanup (same as before)
          var isInLiveTv = (view === "lgLgLiveTv" || view === "liveTvPlayer");
          if (isInLiveTv) {
            try { if (typeof stopAndClearMedia === 'function') stopAndClearMedia(); } catch(e) {}

            try {
              if (Main.lgLgchannelMetaRefreshInterval) {
                clearInterval(Main.lgLgchannelMetaRefreshInterval);
                Main.lgLgchannelMetaRefreshInterval = null;
              }
            } catch(e) { console.warn('Error clearing interval:', e); }

            try { resetHdmiToLIveTv(); }  catch (e) { console.warn("resetHdmiToLIveTv error:", e); }
            try { clearNoSignalNative(); } catch (e) { console.warn("clearNoSignalNative error:", e); }
            try { exitLiveTv(); }          catch (eExit) { console.warn('exitLiveTv threw', eExit); }

            try {
              presentPagedetails.currentChannelId = undefined;
              presentPagedetails.showingTvGuide   = false;
              Main.previousPage();
            } catch(e) { console.warn('Error navigating back:', e); }

            try {
              macro('.lg-tv-overlay').css('display', 'none');
              macro('.tv-guide-container').css('display', 'none');
              macro('.live-tv-overlay').css('display', 'none');
              macro('.live-tv-guide-container').css('display', 'none');
            } catch(e) { console.warn('Error hiding overlays:', e); }

            try { document.body.style.background = "#000"; } catch(e) { console.warn('Error resetting background:', e); }

            // SAMSUNG: no HCAP mode equivalent - on Tizen the app window is
            // always composited above the video plane, so nothing to reset.
          }

        }
      }
    })();
  } catch (e) {
    console.warn("[PowerModeChanged] screen status exception:", e);
  }
})

document.addEventListener('output_connection_changed', function(event) {
  console.log("output_connection_changed ----->", event);

  // SAMSUNG: hospitality panels have no HDMI OUT and Tizen exposes no
  // getHdmiOutStatus equivalent. The event itself carries the state, so we
  // read it from the event rather than querying the platform.
  var hdmiCableStatus = (event && event.connected) ? "connected" : "disconnected";
  console.log("HDMI status from event:", hdmiCableStatus);

  if (hdmiCableStatus === "disconnected") {
      macro("#mainContent").html('');
      macro("#mainContent").html(Util.customHdmiDisconnectedPage());
      macro("#mainContent").show();

  } else if (hdmiCableStatus === "connected" && macro("#mainContent").find(".customHdmiDisconnectedPage").length > 0) {
    gotoHomeSCreenFromDisconnectPage();
  }

  // API update
  updateCurrentNetworkType(function() {
    var payload = {
      device_status_info: {
        hdmi_cable_status: hdmiCableStatus || ""
      }
    };
    if (typeof macro !== "undefined" && macro.ajax) {
      macro.ajax({
        url: apiPrefixUrl + "device-profile",
        type: "PATCH",
        data: JSON.stringify(payload),
        contentType: "application/json; charset=utf-8",
        headers: {
          Authorization: "Bearer " + (pageDetails && pageDetails.access_token ? pageDetails.access_token : "")
        }
      });
    }
  });
});

document.addEventListener('hdmi_connection_changed', function(event) {
  console.log("hdmi_connection_changed event:", event);

  var hdmiStatus = (event && event.connected) ? "connected" : "disconnected";

      if(hdmiStatus === "disconnected") {
        handleHdmiConnection();
      }else if(hdmiStatus === "connected") {
        Main.addBackData("MyDevice");
        view = "MyDevice"
        presentPagedetails.view = view;
        Util.DevicesSwitchPage();
      }
})

document.addEventListener('idcap::mpi_cable_status_changed', function(param) {
  var mpiStatus = (param && param.connected) ? "connected" : "disconnected";
  console.log("MPI status changed:", mpiStatus);

  if (mpiStatus === "disconnected") {
    macro("#mainContent").html('');
    macro("#mainContent").html(Util.customHdmiDisconnectedPage());
    macro("#mainContent").show();
  } else if(mpiStatus === "connected" && macro("#mainContent").find(".customHdmiDisconnectedPage").length > 0) {
    gotoHomeSCreenFromDisconnectPage();
  }

  updateCurrentNetworkType(function () {
    var payload = {
      device_status_info: {
        mpi_cable_status: mpiStatus ? mpiStatus : "",
      }
    }
    if (typeof macro !== "undefined" && macro.ajax) {
      macro.ajax({
        url: apiPrefixUrl + "device-profile",
        type: "PATCH",
        data: JSON.stringify(payload),
        contentType: "application/json; charset=utf-8",
        headers: {
          Authorization: "Bearer " + (pageDetails && pageDetails.access_token ? pageDetails.access_token : "")
        }
      });
    }
  });
});

function handleMqttCommand(cmd, data, topic) {
  console.log('[MQTT CMD] cmd:', cmd, '| topic:', topic, '| data:', JSON.stringify(data));

    switch(cmd) {
      case "checkout"             : return mqtt_reboot(data);
      case "checkin"              : return mqtt_reboot(data);
      case "reboot"               : return mqtt_reboot(data);
      case "refresh"              : return mqtt_reboot(data);
      case "refresh_app_data"     : return mqtt_reboot(data);
      case "take_screenshot"      : return mqtt_takeScreenshot(data);
      case "screen_saver_on"      : return mqtt_screenSaverOn();
      case "screen_saver_off"     : return mqtt_screenSaverOff();
      case "refresh_screensaver"  : return mqtt_refreshScreenSaverData();
      case "get_status"           : return mqtt_sendStatusInfo(data);
      case "update_installed_app" : return mqtt_sendInstalledAppInfo(data);
    }
 
  function mqtt_reboot(data) {

    var payload = {
      cmd: data.cmd,
      response: {
        cmd_status: true,
        sr_no: deviceSerialNumber ? deviceSerialNumber : "",
      },
      seq: data.seq
    };

    sendInfoToBackend(payload);

    var cmd = (data.cmd || "").toLowerCase().trim();

    // reboot and refresh → full checkout + reboot flow (original behaviour)
    if (cmd === "reboot" || cmd === "refresh" || cmd === "refresh_app_data") {
      console.log('[MQTT] Command "' + cmd + '" — triggering CheckoutManager_requestCheckout');
      setTimeout(function () {
        CheckoutManager_requestCheckout();
      }, 1500);

    // checkout and checkin → requestCheckout (no reboot) + destroy apps + refresh guest info
    } else if (cmd === "checkout" || cmd === "checkin") {
      console.log('[MQTT] Command "' + cmd + '" — running checkout without reboot, destroying apps only');

      setTimeout(function () {

        // ── STEP 1: Refresh guest-info FIRST, then run checkout + destroy ──
        console.log('[MQTT] Refreshing guest-info from API first...');
        try {
          macro.ajax({
            url: apiPrefixUrl + "guest-info",
            type: "GET",
            headers: {
              Authorization: "Bearer " + pageDetails.access_token,
            },
            success: function (response) {
              var result = typeof response === "string" ? JSON.parse(response) : response;
              console.log('[MQTT] ✅ guest-info refreshed:', result.result);

              Main.guestInfoData = result.result;
              guestName = result.result.g_name ? result.result.g_name : null;

              try {
                localStorage.setItem('cachedGuestInfoData', JSON.stringify(result.result));
              } catch(ex) {
                console.warn('[MQTT] Failed to save guestInfoData to cache:', ex);
              }

              // ── STEP 2: After guest-info is stored, run checkout + destroy ──
              _runCheckoutAndDestroy();
            },
            error: function (err) {
              console.warn('[MQTT] guest-info refresh failed — continuing with checkout + destroy anyway:', err);
              // Still proceed even if guest-info fails
              _runCheckoutAndDestroy();
            },
            timeout: 60000
          });
        } catch (e) {
          console.warn('[MQTT] Exception in guest-info refresh:', e, '— continuing with checkout + destroy anyway');
          _runCheckoutAndDestroy();
        }

        // ── STEP 2: checkout + destroy (called after guest-info completes) ──
        function _runCheckoutAndDestroy() {
           try {
            // SAMSUNG: screen on/off comes from document.hidden (Tizen sets it
            // on standby). Blanking the panel is done with
            // webapis.appcommon.setScreenSaver, which is the closest public
            // equivalent of LG's WARM/NORMAL power mode.
            if (typeof webapis !== 'undefined' &&
                webapis.appcommon &&
                typeof webapis.appcommon.setScreenSaver === 'function') {

              var isScreenOn = (document.hidden !== true);

              console.log('[MQTT] Power check — cmd: ' + cmd + ' | screen: ' + (isScreenOn ? 'ON' : 'OFF'));

              // checkout + screen ON  → blank the panel
              // checkout + screen OFF → nothing extra (already blanked)
              // checkin  + screen OFF → wake the panel
              // checkin  + screen ON  → nothing extra (already on)
              var wantBlank = null;

              if (cmd === "checkout" && isScreenOn) {
                wantBlank = true;
              } else if (cmd === "checkin" && !isScreenOn) {
                wantBlank = false;
              }

              if (wantBlank === null) {
                console.log('[MQTT] Power already in the desired state for "' + cmd + '" — no power change');
              } else {
                var modeName = wantBlank ? 'SCREEN_SAVER_ON' : 'SCREEN_SAVER_OFF';
                console.log('[MQTT] Setting ' + modeName + ' for "' + cmd + '"');

                try {
                  var _states = webapis.appcommon.AppCommonScreenSaverState;
                  webapis.appcommon.setScreenSaver(
                    wantBlank ? _states.SCREEN_SAVER_ON : _states.SCREEN_SAVER_OFF,
                    function () {
                      console.log('[MQTT] setScreenSaver ' + modeName + ' onSuccess');
                    },
                    function (f) {
                      console.log('[MQTT] setScreenSaver ' + modeName + ' onFailure : ' + (f && f.message));
                    });
                } catch (eSet) {
                  console.warn('[MQTT] setScreenSaver ' + modeName + ' exception:', eSet);
                }
              }

            } else {
              console.warn('[MQTT] webapis.appcommon.setScreenSaver not available — skipping power mode check');
            }
          } catch (ePwr) {
            console.warn('[MQTT] power state exception:', ePwr);
          }

          // // ── Reload the welcome-screen template for views that need it ──
          // // view, so it must be sent back to the welcome screen. Called from
          // // every exit path of _destroyAppsOnly, including the early returns.
          function _reloadWelcomeTemplate() {
            try {
              var _v = presentPagedetails.view || view;
              var needsReload = _v === 'macroHome' || view === 'macroHome' ||
                                _v === 'languagePage' || view === 'languagePage';

              if (!needsReload) return;

              var comingFromHomeLang = true;
              Main.deviceActivity("open", "page", "welcome screen");
              Main.getTemplateApiData(comingFromHomeLang);
            } catch (e) {
              console.warn('[MQTT] Exception reloading welcome template:', e);
            }
          }

          function _destroyAppsOnly() {
            var TARGET_ID = "com.samsung.tv.cobalt-yt";

            var finished = false;
            function finish(reason) {
              if (finished) return;
              finished = true;
              console.log('[MQTT] teardown finished (' + reason + ')');
              try { _reloadWelcomeTemplate(); } catch (e) { console.error(e); }
            }

            setTimeout(function () { finish('watchdog'); }, 8000);

            if (!(typeof tizen !== 'undefined' && tizen.application)) {
              finish('tizen.application unavailable');
              return;
            }

            tizen.application.getAppsContext(function (contexts) {
              // Own try/catch: this runs on a later tick, so the caller's catch is gone
              // and any throw here is UNHANDLED - that is what stopped your log.
              try {
                var ctx = null;
                for (var i = 0; i < contexts.length; i++) {
                  if (contexts[i].appId === TARGET_ID) { ctx = contexts[i]; break; }
                }
                if (!ctx) { finish('youtube not running'); return; }

                try {
                  tizen.application.kill(ctx.id,
                    function () { console.log('[MQTT] YouTube killed'); finish('killed'); },
                    function (e) {
                      console.warn('[MQTT] kill failed:', e && e.name, e && e.message);
                      finish('kill failed');
                    });
                } catch (eKill) {
                  console.error('[MQTT] kill threw:', eKill && eKill.name, eKill && eKill.message);
                  finish('kill threw');
                }
              } catch (eInner) {
                console.error('[MQTT] callback exception:', eInner);
                finish('inner exception');
              }
            }, function (e) {
              console.warn('[MQTT] getAppsContext failed:', e && e.message);
              finish('getAppsContext error');
            });
          }

          // // ── KEY: clear guest private data first, then terminate apps ──
          // // SAMSUNG: webapis.systemcontrol.deleteAppPrivateInfoNow() is the
          // // checkout primitive. Documented since Tizen 9.0, so it may be
          // // absent on 6.5 firmware — the else branch covers that.
          // if (typeof webapis !== 'undefined' &&
          //     webapis.systemcontrol &&
          //     typeof webapis.systemcontrol.deleteAppPrivateInfoNow === 'function') {

          //   console.log('[MQTT] Calling deleteAppPrivateInfoNow (no reboot)...');

            try {
              webapis.systemcontrol.deleteAppPrivateInfoNow(function (info) {
                console.log('[MQTT] ✅ private guest data deleted (' + info + ') — now destroying apps');
                _destroyAppsOnly();
              });
            } catch (e) {
              console.warn('[MQTT] Exception in deleteAppPrivateInfoNow:', e, '— destroying apps anyway');
              _destroyAppsOnly();
            }

          // } else {
          //   console.warn('[MQTT] deleteAppPrivateInfoNow not available — destroying apps directly');
          //   _destroyAppsOnly();
          // }

          //           // deleteAppPrivateInfo is an Activation setter, not an action - there
          // // is no way to trigger an immediate wipe on HTV. Re-assert the policy
          // // here so a factory reset or firmware update cannot silently leave it
          // // off, then tear the apps down. The wipe happens on power cycle.
          // try {
          //   if (typeof webapis !== 'undefined' && webapis.systemcontrol &&
          //       typeof webapis.systemcontrol.deleteAppPrivateInfo === 'function') {
          //     webapis.systemcontrol.deleteAppPrivateInfo('ON');
          //     console.log('[MQTT] app private info deletion policy re-asserted');
          //   } else {
          //     console.warn('[MQTT] deleteAppPrivateInfo not available on this firmware');
          //   }
          // } catch (e) {
          //   console.warn('[MQTT] deleteAppPrivateInfo("ON") failed:', e && e.name, e && e.message);
          // }

          // _destroyAppsOnly();
        }

      }, 1500);

    } else {
      // Any other command that routes through mqtt_reboot — fallback to full checkout
      console.log('[MQTT] Command "' + cmd + '" — fallback to CheckoutManager_requestCheckout');
      setTimeout(function () {
        CheckoutManager_requestCheckout();
      }, 1500);
    }
  }

  /**
   * mqtt_screenSaverOn()
   *
   * Triggered by MQTT cmd "screen_saver_on".
   * Conditions required before launching:
   *   1. ScreenSaver module must be loaded.
   *   2. Main.screenSaverData must be ready (fetched by Main.screenSaverInterval).
   *   3. The screen saver must not already be active.
   *   4. The current view must be macroHome or languagePage (safe to cover).
   *
   * If conditions are met the idle timer is cancelled and the screen saver
   * launches immediately (bypassing the normal idle countdown).
   * If Main.screenSaverData is not ready yet we wait up to 10 s, polling
   * every 500 ms, so a command arriving just after boot still works.
   */
  function mqtt_screenSaverOn() {
    console.log('[MQTT] screen_saver_on received');

    if (typeof ScreenSaver === 'undefined') {
      console.warn('[MQTT] ScreenSaver module not loaded — ignoring screen_saver_on');
      return;
    }

    // Respect is_screen_saver_service flag — if not explicitly true, ignore the command.
    var isEnabled = Main.deviceProfile &&
                    Main.deviceProfile.property_detail &&
                    Main.deviceProfile.property_detail.is_screen_saver_service === true;
    if (!isEnabled) {
      console.warn('[MQTT] screen_saver_on: is_screen_saver_service is not true — ignoring');
      return;
    }

    if (ScreenSaver.isActive()) {
      console.log('[MQTT] Screen saver already active — ignoring screen_saver_on');
      return;
    }

    // Helper: attempt launch once data is confirmed ready
    function _tryLaunch(attemptsLeft) {
      var dataReady = Main.screenSaverData &&
                      Main.screenSaverData.ready &&
                      Array.isArray(Main.screenSaverData.entries) &&
                      Main.screenSaverData.entries.length > 0;

      if (!dataReady) {
        if (attemptsLeft <= 0) {
          console.warn('[MQTT] screen_saver_on: screenSaverData still not ready after retries — aborting');
          return;
        }
        console.log('[MQTT] screen_saver_on: waiting for screenSaverData… attempts left:', attemptsLeft);
        setTimeout(function () { _tryLaunch(attemptsLeft - 1); }, 500);
        return;
      }

      // Only launch from safe views (home / language page)
      var safeView = (view === 'macroHome' || view === 'languagePage');
      if (!safeView) {
        console.warn('[MQTT] screen_saver_on: current view "' + view + '" is not macroHome/languagePage — ignoring');
        return;
      }

      // Cancel the normal idle countdown so it doesn't double-fire
      try { ScreenSaver.clearIdleTimer(); } catch (e) {}

      // Simulate idle-timer expiry by temporarily patching screen_saver_start_time
      // to 1 second, arming the timer, then restoring the original value.
      console.log('[MQTT] screen_saver_on: launching screen saver now');
      try {
        var propDetail = Main.deviceProfile && Main.deviceProfile.property_detail;
        var originalTime = propDetail ? propDetail.screen_saver_start_time : undefined;

        if (propDetail) { propDetail.screen_saver_start_time = 1; }

        ScreenSaver.armIdleTimer();   // arms a 1-second timer → launches

        // Restore original value after the timer fires (1 s + buffer)
        setTimeout(function () {
          if (propDetail && originalTime !== undefined) {
            propDetail.screen_saver_start_time = originalTime;
          }
        }, 1500);

      } catch (e) {
        console.error('[MQTT] screen_saver_on launch error:', e);
      }
    }

    // Retry up to 20 times (10 s total) in case data is still loading
    _tryLaunch(20);
  }

  /**
   * mqtt_screenSaverOff()
   *
   * Triggered by MQTT cmd "screen_saver_off".
   * Stops the screen saver (if active) exactly as a remote-key press
   * would: PlaylistPlayer is stopped silently, Main.previousPage() is
   * called to restore the previous page, and the idle timer is re-armed
   * so the saver can activate again after the next idle period.
   *
   * If the screen saver is not currently active this is a no-op.
   */
  function mqtt_screenSaverOff() {
    console.log('[MQTT] screen_saver_off received');

    if (typeof ScreenSaver === 'undefined') {
      console.warn('[MQTT] ScreenSaver module not loaded — ignoring screen_saver_off');
      return;
    }

    // If the service is disabled there is nothing to stop.
    var isEnabled = Main.deviceProfile &&
                    Main.deviceProfile.property_detail &&
                    Main.deviceProfile.property_detail.is_screen_saver_service === true;
    if (!isEnabled) {
      console.warn('[MQTT] screen_saver_off: is_screen_saver_service is not true — ignoring');
      return;
    }

    if (!ScreenSaver.isActive()) {
      console.log('[MQTT] Screen saver not active — ignoring screen_saver_off');
      return;
    }

    // Delegate to handleKeyPress which performs a clean stop + page restore
    // + idle-timer re-arm, identical to what a physical remote key press does.
    console.log('[MQTT] screen_saver_off: stopping screen saver via handleKeyPress()');
    try {
      ScreenSaver.handleKeyPress();
    } catch (e) {
      console.error('[MQTT] screen_saver_off error:', e);
    }
  }

  function mqtt_refreshScreenSaverData() {
    console.log('[MQTT] refresh_screensaver received');

    // Only refresh if the screen saver service is enabled.
    var isEnabled = Main.deviceProfile &&
                    Main.deviceProfile.property_detail &&
                    Main.deviceProfile.property_detail.is_screen_saver_service === true;
    if (!isEnabled) {
      console.warn('[MQTT] refresh_screensaver: is_screen_saver_service is not true — ignoring');
      return;
    }

    Main.screenSaverData = null;  // clear existing data to force refresh
    Main.screenSaverInterval();
  }

  function mqtt_takeScreenshot(data) {
    if (!data || !data.put_presign_url) {
      console.error("[Screenshot] Missing put_presign_url in MQTT payload");
      return;
    }

    // 1. Capture screen via SystemControl.
    //    SAMSUNG: captureScreen(path) is synchronous and always writes
    //    "ScreenCapture.jpg" (JPG, full panel) into the widget's private
    //    storage. The LG width/height/format parameters have no equivalent.
    //    Requires the PARTNER systemcontrol privilege.
    if (!(typeof webapis !== "undefined" &&
          webapis.systemcontrol &&
          typeof webapis.systemcontrol.captureScreen === "function")) {
      console.error("captureScreen unavailable (partner privilege required)");
      return;
    }

    var CAPTURE_ROOT = "wgt-private-tmp";
    var CAPTURE_FILE = "ScreenCapture.jpg";

    try {
      webapis.systemcontrol.captureScreen(CAPTURE_ROOT);
    } catch (eCap) {
      console.error("captureScreen failed:", eCap && eCap.message);
      return;
    }

    if (!(typeof tizen !== "undefined" && tizen.filesystem)) {
      console.error("tizen.filesystem unavailable - cannot resolve capture file");
      return;
    }

    // Give the platform a moment to flush the file before resolving it.
    setTimeout(function () {
      tizen.filesystem.resolve(CAPTURE_ROOT, function (dir) {
        var fileUri;
        try {
          fileUri = dir.resolve(CAPTURE_FILE).toURI();
        } catch (eRes) {
          console.error("Screenshot file not found:", eRes && eRes.message);
          return;
        }

        console.log("Screenshot captured:", fileUri);
        console.log("Uploading screenshot to S3:", data.put_presign_url);

        // 2. Read file as Blob
        fetch(fileUri)
          .then(function (res) {
            if (!res.ok) throw new Error("Failed to read screenshot file");
            return res.blob();
          })
          .then(function (blob) {

            // 3. Upload to AWS S3 presigned PUT URL
            //    NOTE: Samsung captures JPG, not PNG.
            return fetch(data.put_presign_url, {
              method: "PUT",
              headers: {
                "Content-Type": "image/jpeg"
              },
              body: blob
            });
          })
          .then(function (uploadRes) {
            if (!uploadRes.ok) {
              throw new Error("S3 upload failed, status: " + uploadRes.status);
            }

            console.log("Screenshot uploaded successfully to S3");

            // 4. Send MQTT confirmation back (CMD_RES)
            sendScreenshotAck(data, fileUri);
          })
          .catch(function (err) {
            console.error("Screenshot upload error:", err);
          });

      }, function (err) {
        console.error("Cannot resolve " + CAPTURE_ROOT + ":", err && err.message);
      }, "r");
    }, 700);
  }

  function sendScreenshotAck(data, fileUri) {

    console.log("fileUri-------------------------------->", fileUri)
    if (!window.GreMqttClient || !GreMqttClient.getClient) {
      console.warn("MQTT client not ready for ACK");
      return;
    }

    var client = GreMqttClient.getClient();
    if(!client) {
      console.warn("MQTT client instance missing");
      return;
    }

    var deviceSrNo = GreMqttClient.getDeviceSrNo();
    var ackTopic = "GRE/" + deviceSrNo + "/CMD_RES";

    var ackPayload = JSON.stringify({
      topic: ackTopic,
      cmd: "take_screenshot",
      seq: data.seq,
      success: true,
      output: `${data.file_name} Uploaded to S3 Successfully`,
      get_presign_url: data.get_presign_url
    });

    client.publish(ackTopic, ackPayload, { qos: 1 , retain: false}, function(err) {
      if (err) console.error("Failed to publish screenshot ACK:", err);
      else console.log("Screenshot ACK sent:", ackPayload);
    })
  }

  function mqtt_sendStatusInfo(data) {

    function buildAndSendPayload(screenStatus) {
      console.log("Screen status determined as:------------------>", screenStatus);

      // SAMSUNG: webapis.network is synchronous - no callback plumbing needed.
      if (typeof webapis === "undefined" || !webapis.network) {
        var payload = {
          cmd: data.cmd,
          response: {
            app_status: "Online",
            cmd_status: true,
            screen_status: screenStatus ? screenStatus : "",
            device_network_ip: deviceIp ? deviceIp : "",
            sr_no: deviceSerialNumber ? deviceSerialNumber : "",
            mac_address: deviceMac ? deviceMac : "",
            screen_saver_status: (typeof ScreenSaver !== 'undefined' && ScreenSaver.isActive()) ? "active" : "inactive",
          },
          seq: data.seq
        };
        sendInfoToBackend(payload);
        return;
      }

      // SAMSUNG: same networkInfo shape, built synchronously from
      // webapis.network instead of the async idcap request.
      try {
        // Cached read - these are synchronous IPC calls and this runs on a
        // repeating heartbeat, so hitting the platform every tick stalls the UI.
        var _net      = window._netRead ? window._netRead() : {};
        var _TYPES    = webapis.network.NetworkActiveConnectionType;
        var _isEth    = (_net.type === _TYPES.ETHERNET);
        var _isWifi   = (_net.type === _TYPES.WIFI);

        var _ip = _net.ip || "", _mac = _net.mac || "", _ssid = "", _gw = false;
        try { _gw  = webapis.network.isConnectedToGateway(); } catch (e) {}
        if (_isWifi) { try { _ssid = webapis.network.getWiFiSsid() || ""; } catch (e) {} }

          var networkInfo = {
            wired: {
              mac: _isEth ? _mac : "",
              state: _isEth ? "connected" : "disconnected",
              ipAddress: _isEth ? _ip : "",
              onInternet: _isEth ? _gw : "",
              plugged: _isEth
            },
            wifi: {
              mac: _isWifi ? _mac : "",
              state: _isWifi ? "connected" : "disconnected",
              ipAddress: _isWifi ? _ip : "",
              onInternet: _isWifi ? _gw : "",
              ssid: _ssid
            }
          };

          var payload = {
            cmd: data.cmd,
            response: {
              app_status: "Online",
              cmd_status: true,
              screen_status: screenStatus ? screenStatus : "",
              device_network_ip: deviceIp ? deviceIp : "",
              sr_no: deviceSerialNumber ? deviceSerialNumber : "",
              mac_address: deviceMac ? deviceMac : "",
              screen_saver_status: (typeof ScreenSaver !== 'undefined' && ScreenSaver.isActive()) ? "active" : "inactive",
              network_info: networkInfo
            },
            seq: data.seq
          };

          sendInfoToBackend(payload);
      } catch (eNet) {
        console.warn("network read failed:", eNet && eNet.message);
        sendInfoToBackend({
          cmd: data.cmd,
          response: {
            app_status: "Online",
            cmd_status: true,
            screen_status: screenStatus ? screenStatus : "",
            device_network_ip: deviceIp ? deviceIp : "",
            sr_no: deviceSerialNumber ? deviceSerialNumber : "",
            mac_address: deviceMac ? deviceMac : "",
            screen_saver_status: (typeof ScreenSaver !== 'undefined' && ScreenSaver.isActive()) ? "active" : "inactive"
          },
          seq: data.seq
        });
      }
    }

    // SAMSUNG: there is no getPowerMode equivalent. Tizen sets document.hidden
    // when the panel enters standby, which is the same on/off signal the LG
    // WARM/NORMAL check was providing.
    try {
      var screenStatus = (document.hidden === true) ? 'off' : 'on';
      buildAndSendPayload(screenStatus);
    } catch(e) {
      console.warn("screen status read exception:", e);
      buildAndSendPayload(null); // send payload anyway with null status
    }
  }

  function sendInfoToBackend(payload) {
    macro.ajax({
      url: apiPrefixUrl + "device-mqtt-cmd",
      type: "POST",
      data: JSON.stringify(payload),
      contentType: "application/json; charset=utf-8",
      headers: {
        Authorization: "Bearer " + pageDetails.access_token,
      },
      success: function(res) {
        console.log("Status info sent successfully:", res);
        var result = typeof res === "string" ? JSON.parse(res) : res;
        if(result.status === false) {
          Main.logTvException({
            error_type:    "API_ERROR",
            error_code:    "MQTT_CMD_POST_FAILED",
            error_message:  result.message ? JSON.stringify(result.message) : "Failed to send MQTT command",
            error_source:  "sendInfoToBackend",
            module:        "mqtt_command_handler"
          });
        }
      },
      error: function(err) {
        console.error("Failed to send status info:", err);

        Main.logTvException({
          error_type:    "API_ERROR",
          error_code:    "MQTT_CMD_POST_FAILED",
          error_message: "Failed to send MQTT command",
          error_source:  "sendInfoToBackend",
          module:        "mqtt_command_handler",
          extra_data: {
            status_code:  err && err.status  ? err.status  : undefined,
            status_text:  err && err.statusText ? err.statusText : undefined,
            response_text: err && err.responseText ? err.responseText : undefined
          }
        });
      },
      timeout: 60000
    })
  }

  function mqtt_sendInstalledAppInfo(data) {
    // SAMSUNG: tizen.application.getAppsInfo() returns ApplicationInformation
    // objects for INSTALLED packages only, so `installed` is always true.
    // Field names differ from LG: id/name/iconPath/version.
    if (!(typeof tizen !== "undefined" && tizen.application)) {
      console.log("tizen.application not available - cannot list apps");
      return;
    }

    tizen.application.getAppsInfo(
        function (rawList) {

          console.log("installed app count------------------->", rawList.length);

          var installedApp = [];
          for (var i = 0; i < rawList.length; i++) {
            var a = rawList[i] || {};

            var appName = (a.name || "").replace(/^\s+|\s+$/g, "");
            if (!appName) appName = a.id || "";      // <-- fall back to the package id

             installedApp.push({
              name:         appName,
              package_name: a.id || "",
              package_info: {
                iconPath:     a.iconPath || "",
                installed:    true,
                type:         a.packageId || "",
                version:      a.version || ""
              }
            });
          }

          var payload = { installed_app: installedApp };

          macro.ajax({
            url: apiPrefixUrl + "installed-app",
            type: "POST",
            data: JSON.stringify(payload),
            contentType: "application/json; charset=utf-8",
            headers: {
              Authorization: "Bearer " + pageDetails.access_token,
            },
            success: function (resp) {
              console.log("Installed app info sent successfully:", resp);
            },
            error: function (err) {
              console.error("Failed to send installed app info:", err);

              Main.logTvException({
                error_type:    "API_ERROR",
                error_code:    "MQTT_CMD_POST_FAILED",
                error_message: "Failed to send MQTT command",
                error_source:  "sendInstalledAppInfo",
                module:        "mqtt_command_handler",
                extra_data: {
                  status_code:  err && err.status  ? err.status  : undefined,
                  status_text:  err && err.statusText ? err.statusText : undefined,
                  response_text: err && err.responseText ? err.responseText : undefined
                }
              });
            },
            timeout: 60000
          });
        },
        function (err) {
            console.log("Failed to get app list:", err && err.message);
        });
  }
}

app.appPreLoad();