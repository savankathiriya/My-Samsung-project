var utilities = {};
var clockIntervalId = null;

// HDMI Connection Monitoring
var currentHdmiType = null;
var currentHdmiIndex = null;

var _caLineLoaderRafId = null;   // requestAnimationFrame handle
var _caLineLoaderDone  = false;  // signals _tick() to stop self-advancing
var _caLineLoaderSafetyId = null; // forces the bar to complete if nobody hides it
var _CA_LINE_LOADER_MAX_MS = 15000;

function startHdmiMonitor(type, index) {
    console.log('[HDMI Monitor] Starting monitor for type:', type, 'index:', index);
    currentHdmiType = type;
    currentHdmiIndex = index;
    stopHdmiMonitor();
}

function stopHdmiMonitor() {
    console.log('[HDMI Monitor] Stopping monitor');
    currentHdmiType = null;
    currentHdmiIndex = null;
}

// Reset HDMI and app state on application startup
function resetHdmiOnStartup() {
    console.log('[App Startup] Resetting HDMI state...');
    
    // Stop any existing monitoring
    stopHdmiMonitor();
    
    // Clear state variables
    window._originalTvInput = null;
    if (typeof presentPagedetails !== 'undefined') {
        presentPagedetails.currentLiveChannelId = undefined;
        presentPagedetails.showingLiveTvGuide = false;
    }

    // FIX: On startup, always stop any channel that may have been left open
    // by a previous crashed/exited session. Without this, restarting the app
    // while the "No Signal" screen is showing will leave it stuck.
    try {
        if (typeof exitLiveTv === 'function') {
            exitLiveTv();
        }
    } catch(e) {
        console.warn('[App Startup] exitLiveTv on startup threw:', e);
    }
    
    // SAMSUNG: there is no equivalent of HCAP_MODE_n. On Tizen the app window
    // is always composited ABOVE the video plane, so no mode switch exists or
    // is needed. Go straight to making sure the TV source is selected.
    ensureTvInput();

    function ensureTvInput() {
        // SAMSUNG: tizen.tvwindow.getSource() / setSource() replace
        // hcap.externalinput. Source type is a string ('TV', 'HDMI', 'AV', ...).
        if (typeof tizen !== "undefined" && tizen.tvwindow) {
            try {
                var current = tizen.tvwindow.getSource();
                console.log('[App Startup] Current input - Type:', current.type, 'Index:', current.number);

                // If we're on HDMI, switch back to TV
                if (current.type === 'HDMI') {
                    console.log('[App Startup] Currently on HDMI, switching to TV...');
                    tizen.tvwindow.setSource({ type: 'TV' },
                        function() {
                            console.log('[App Startup] Switched to TV input');
                            document.body.style.background = "#000";
                        },
                        function(f) {
                            console.warn('[App Startup] Failed to switch to TV:', f && f.message);
                            document.body.style.background = "#000";
                        });
                } else {
                    console.log('[App Startup] Already on TV input');
                    document.body.style.background = "#000";
                }
            } catch (e) {
                console.warn('[App Startup] Failed to get current input:', e && e.message);
                // Try to switch to TV anyway as fallback
                try {
                    tizen.tvwindow.setSource({ type: 'TV' },
                        function() {
                            console.log('[App Startup] Switched to TV (fallback)');
                            document.body.style.background = "#000";
                        },
                        function(f2) {
                            console.warn('[App Startup] Fallback switch failed:', f2 && f2.message);
                            document.body.style.background = "#000";
                        });
                } catch (e2) {
                    console.warn('[App Startup] Fallback switch threw:', e2 && e2.message);
                    document.body.style.background = "#000";
                }
            }
        } else {
            console.warn('[App Startup] tizen.tvwindow not available');
            document.body.style.background = "#000";
        }
    }
}

function handleHdmiConnection() {
    try { stopAndClearMedia(); } catch(e){ console.warn('stopAndClearMedia failed', e); }
    try { exitLiveTv(); } catch (e) { console.warn('exitLiveTv threw', e); }
    try { clearNoSignalNative(); } catch (e) { console.warn("clearNoSignalNative error:", e); }

    // Always called at the end — regardless of whether HCAP calls succeed or fail
    function _renderHome() {
        document.body.style.background = "#000";
        try {
            gotoHomeSCreenFromDisconnectPage();
        } catch (e) {
            console.warn('[handleHdmiConnection] gotoHomeSCreenFromDisconnectPage threw:', e);
        }
    }

    try {
        // SAMSUNG: only the source switch is needed - there is no mode to set.
        if (typeof tizen !== "undefined" && tizen.tvwindow) {

            tizen.tvwindow.setSource({ type: 'TV' },
                function() {
                    console.log('[handleHdmiConnection] Switched to TV input successfully');
                    _renderHome();
                },
                function(f) {
                    console.warn('[handleHdmiConnection] setSource failed:', f && f.message);
                    _renderHome(); // still render even if input switch fails
                });

        } else {
            // tizen.tvwindow not available — render directly
            console.warn('[handleHdmiConnection] tizen.tvwindow not available, rendering home directly');
            _renderHome();
        }
    } catch (e) {
        console.warn('[handleHdmiConnection] threw:', e);
        _renderHome(); // always render home as final fallback
    }
}

utilities.validateString = function (value) {
    if (value == undefined || value == null) return false;
    else if (value.trim() == '') return false;
    else return true;
}

function getKeyCode(rawEvt) {
    var evt = rawEvt || window.event || {};
    // prefer which when available and non-zero, else fallback to keyCode
    var kc = (typeof evt.which !== 'undefined' && evt.which !== 0) ? evt.which : evt.keyCode || 0;
    return { evt: evt, keycode: kc };
}

function clearNoSignalNative() {
    try {
        // SAMSUNG: stop + close releases the avplay hardware decoder.
        // This covers both the media pipeline and any IP (UDP/RTP) channel,
        // which LG split across Media.shutDown and channel.releaseCurrentChannel.
        if (typeof webapis !== "undefined" && webapis.avplay) {
            try { webapis.avplay.stop(); } catch (e) {}
            try { webapis.avplay.close(); } catch (e) {}
            window._currentHcapMedia = null;
            console.log("avplay stop/close success");
        }
    } catch (e) {
        console.warn("clearNoSignalNative avplay stop/close threw", e);
    }

    // SAMSUNG: no HCAP mode to reset - the app window always composites above
    // the video plane on Tizen.
}

function showLoadingPopup() {
    var el = document.getElementById("loadingPopup");
    if(el) el.style.display = "block";

    initLottieOnce();
    if(loadingAnim && typeof loadingAnim.play === 'function') {
        loadingAnim.play();
    }
}

function hideLoadingPopup() {
    var el = document.getElementById("loadingPopup");
    if (el) el.style.display = 'none';

    if (loadingAnim && typeof loadingAnim.stop === 'function') {
        loadingAnim.stop();
    }
}

utilities.updatingTimeAndDate = function () {

    function pad(num) {
        return num < 10 ? '0' + num : num;
    }

    function formatTimeFromParts(parts, format, hasAmPm) {
        var map = {};
        parts.forEach(function (p) {
            map[p.type] = p.value;
        });

        // Parse and pad values properly
        var hour24 = parseInt(map.hour, 10);
        var hour12 = hour24 % 12 || 12;
        
        var tokens = {
            'hh': pad(hour12),
            'HH': pad(hour24),
            'h': hour12,
            'H': hour24,
            'mm': pad(parseInt(map.minute, 10)),
            'ss': pad(parseInt(map.second, 10))
        };

        var result = format.replace(/hh|HH|h|H|mm|ss/g, function (match) {
            return tokens[match];
        });

        // Add AM/PM when "a" is present in the original format
        if (hasAmPm && map.dayPeriod) {
            result += ' ' + map.dayPeriod;
        }

        return result;
    }

    function updateDateTime() {

        // 🔹 Get timezone dynamically
        var timeZone =
            (Main.deviceProfile &&
                Main.deviceProfile.property_detail &&
                Main.deviceProfile.property_detail.property_timezone)
                ? Main.deviceProfile.property_detail.property_timezone
                : Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Get raw format
        var rawFormat =
            (Main.templateApiData &&
                Main.templateApiData.time_format)
                ? Main.templateApiData.time_format
                : 'HH:mm';

        // Check whether AM/PM is present
        var hasAmPm = /a/i.test(rawFormat);

        // Remove AM/PM from format because we add it separately
        var timeFormat = rawFormat.replace(/\s*[aA]$/, '');

        // Determine 12-hour format
        // h or hh means 12-hour format
        var is12Hour = /h/.test(timeFormat);

        // Get timezone-aware time
        var timeFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timeZone,
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: hasAmPm || is12Hour
        });

        var timeParts = timeFormatter.formatToParts(new Date());

        var timeStr = formatTimeFromParts(
            timeParts,
            timeFormat,
            hasAmPm
        );

        // Date (timezone-aware)
        var dateFormatter = new Intl.DateTimeFormat(undefined, {
            timeZone: timeZone,
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });

        var dateStr = dateFormatter.format(new Date());

        // Update DOM
        var timeEl = document.getElementById("time_now");
        var dateEl = document.getElementById("date_now");

        if (timeEl) {
            timeEl.textContent = timeStr;
        }

        if (dateEl) {
            dateEl.textContent = dateStr;
        }
    }

    // Initial call
    updateDateTime();

    // Update every second
    clockIntervalId = setInterval(updateDateTime, 1000);
};


utilities.genricPopup=function(msg,type){
  Main.popupData ={
      popuptype : type,
      message : msg,       
      buttonCount : 1,
      yesText : 'Okay',
      yesTarget : 'close',
      onBack : 'close'
  }
  macro("#popUpFDFS").html(Util.showPopup());	
  macro("#popup-btn-1").addClass('popupFocus');
}

function exitLiveTv() {
  // SAMSUNG: stops avplay (IPTV) AND hides the tuner window (RF).
  // Without tvwindow.hide() an RF channel stays on screen behind the app.
  try {
      if (typeof LiveTv !== "undefined") { LiveTv.stop(); }
      else if (typeof webapis !== "undefined" && webapis.avplay) {
          try { webapis.avplay.stop(); } catch (e) {}
          try { webapis.avplay.close(); } catch (e) {}
      }
      window._currentHcapMedia = null;
      console.log(" Live TV stopped successfully");
  } catch (e) {
      console.error(" exitLiveTv error: " + e.message);
  }
}

function launchApp(appId, source, attempt) {
    // SAMSUNG: tizen.application.launch(appId, onSuccess, onError).
    attempt = attempt || 0;
    try {
        if (!(typeof tizen !== "undefined" && tizen.application)) {
            console.log("tizen.application not available - cannot launch", appId);
            Main.HideLoading();
            return;
        }

        tizen.application.launch(appId,
            function () {
                Main.HideLoading();
                console.log(" App launched successfully:", appId);
            },
            function (err) {
                // Bounded retry (max 4 extra attempts) - an unbounded retry
                // spins forever when the package genuinely is not installed.
                console.log(" Failed to launch app:", appId, err && err.message);
                if (attempt < 4) {
                    launchApp(appId, source, attempt + 1);
                } else {
                    Main.HideLoading();
                }
            });
    } catch (e) {
        Main.HideLoading();
        console.log("Exception while launching app:", e.message);
    }
}

function installApp(appId, source) {
    // SAMSUNG: LG used idcap://application/install here. A Tizen application
    // cannot install another package - provisioning goes through Seller
    // Office / Tizen Business Manager. Log and release the loading overlay.
    console.warn(" Cannot install " + appId + " from the app on Samsung - "
        + "provision it through Seller Office / TBM.");
    Main.HideLoading();
}

function ensureAppInstalled(appId, source) {
    try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}

    // SAMSUNG: tizen.application.getAppsInfo() lists installed packages only,
    // so presence in the result means the app IS installed.
    if (!(typeof tizen !== "undefined" && tizen.application)) {
        console.log("tizen.application not available - cannot check app list");
        return;
    }

    try {
        tizen.application.getAppsInfo(
            function (apps) {
                var foundApp = null;
                for (var i = 0; i < apps.length; i++) {
                    if (apps[i].id === appId) { foundApp = apps[i]; break; }
                }

                Main.ShowLoading();

                console.log("installed app count------------------->", apps.length);

                if (foundApp) {
                    console.log(" " + appId + " already installed.");
                    launchApp(appId, source);
                } else {
                    // LG installs the missing app here; installApp() explains
                    // why Samsung cannot and hides the loader.
                    console.log(" " + appId + " not found in installed apps.");
                    installApp(appId, source);
                }
            },
            function (err) {
                console.log("Failed to get app list:", err && err.message);
                Main.HideLoading();
            });
    } catch (e) {
        console.log("Exception while getting app list:", e.message);
        Main.HideLoading();
    }
}

function rebootTv(){
    // Step 1: Register Google Cast token (required after each reboot).
    // SAMSUNG: registerGoogleCastToken() is a no-op that only flags the state
    // (googlecast.js), and the LG cast-app install step does not exist -
    // apps cannot install packages on Tizen - so it goes straight to reboot.
    Main.ShowLoading();
    if(typeof Main !== 'undefined' && Main.registerGoogleCastToken) {
        Main.registerGoogleCastToken();
    }

    setTimeout(function () {
        if (typeof webapis !== 'undefined' &&
            webapis.systemcontrol &&
            typeof webapis.systemcontrol.rebootDevice === 'function') {
            CheckoutManager_requestCheckout();
        } else {
            console.warn("webapis.systemcontrol.rebootDevice unavailable "
                + "(partner privilege required) - skipping reboot");
            Main.HideLoading();
        }
    }, 1000);
}


/* ================================================================
   CHECKOUT → SHOW THANK-YOU → CLEAR SESSIONS → DESTROY APPS → POWER OFF
   ----------------------------------------------------------------
   Does NOT call CheckoutManager_requestCheckout() (that wrapper ends
   in a reboot). It does the checkout WITHOUT the reboot:
     1. Renders Util.checkoutThankYouScreen()
     2. Clears the guest's private app data (LG: hcap.checkout.requestCheckout,
        SAMSUNG: webapis.systemcontrol.deleteAppPrivateInfoNow) — the call
        that actually terminates the guest's Netflix / YouTube sessions and
        clears their credentials. Killing the app alone only stops the
        running process; it does NOT clear the logged-in data.
     3. Kills the Netflix / YouTube apps
     4. Powers the TV OFF — no reboot
        SAMSUNG: there is no app-level power-off; powerOffFallback()
        (checkoutManage.js) blanks the panel and exits the app instead.
   Same no-reboot checkout pattern used in Main.guestInfoAfterInterval.
================================================================ */
function checkoutDestroyThenPowerOff() {

    var POWER_OFF_DELAY_MS = 5000; // keep thank-you screen visible before power off

    // ── 1. Show the thank-you screen ──────────────────────────────
    try {
        macro("#mainContent").html("");
        macro("#mainContent").html(Util.checkoutThankYouScreen());
    } catch (e) {
        console.warn("[Checkout] Failed to render thank-you screen:", e);
    }

    // ── 4. Power OFF (not reboot) — invoked once destroy settles ───
    function _powerOff() {
        setTimeout(function () {
            // SAMSUNG: LG called hcap.power.powerOff. Tizen exposes no
            // app-level power-off, so reuse checkoutManage.js's fallback
            // (screensaver blank + app exit).
            if (typeof powerOffFallback === "function") {
                try {
                    powerOffFallback(function () {
                        console.log("PowerOff fallback done after checkout");
                    });
                } catch (e) {
                    console.warn("PowerOff fallback failed after checkout", e);
                }
            } else {
                console.warn("[Checkout] powerOffFallback not available");
            }
        }, POWER_OFF_DELAY_MS);
    }

    // ── 3. Destroy running apps, then power off ───────────────────
    function _destroyAppsThenPowerOff() {
        // SAMSUNG: kill via tizen.application.getAppsContext + kill()
        // (same as destroyAppsThenReboot in checkoutManage.js) instead of
        // hcap.preloadedApplication.destroyPreloadedApplication.
        if (!(typeof tizen !== "undefined" &&
              tizen.application &&
              typeof tizen.application.getAppsContext === "function" &&
              typeof tizen.application.kill === "function")) {
            console.warn("[Checkout] tizen.application.kill not available — powering off");
            _powerOff();
            return;
        }

        var apps = [
            { id: Main.lgSettings && Main.lgSettings.netflix_app_id, name: "Netflix" },
            { id: Main.lgSettings && Main.lgSettings.youtube_app_id, name: "YouTube" }
        ].filter(function (app) {
            if (!app.id) {
                console.warn("[Checkout] Skipping — no app id for " + app.name);
                return false;
            }
            return true;
        });

        if (!apps.length) {
            console.warn("[Checkout] No valid app ids — powering off");
            _powerOff();
            return;
        }

        var remaining = apps.length;

        function _done() {
            remaining--;
            if (remaining <= 0) {
                console.log("[Checkout] ✅ All app destruction attempts complete");
                _powerOff();
            }
        }

        apps.forEach(function (app) {
            try {
                tizen.application.getAppsContext(function (contexts) {
                    var ctx = null;
                    for (var i = 0; i < contexts.length; i++) {
                        if (contexts[i].appId === app.id) { ctx = contexts[i]; break; }
                    }
                    if (!ctx) {
                        console.log("ℹ️ " + app.name + " not running");
                        _done();
                        return;
                    }
                    tizen.application.kill(ctx.id,
                        function () {
                            console.log("✅ " + app.name + " destroyed");
                            _done();
                        },
                        function () {
                            console.log("ℹ️ " + app.name + " not running");
                            _done();
                        });
                }, function () {
                    _done();
                });
            } catch (e) {
                console.warn("[Checkout] Exception destroying " + app.name + ":", e);
                _done();
            }
        });
    }

    // ── 2. Clear sessions FIRST (this is what wipes the guest data) ──
    // Without it, the apps report "not running" but still hold the previous
    // guest's credentials. This is the low-level checkout call — NOT
    // CheckoutManager_requestCheckout(), so there is no reboot afterwards.
    // SAMSUNG: webapis.systemcontrol.deleteAppPrivateInfoNow() replaces
    // hcap.checkout.requestCheckout (Tizen 9.0+, may be absent on 6.5).
    if (typeof webapis !== "undefined" &&
        webapis.systemcontrol &&
        typeof webapis.systemcontrol.deleteAppPrivateInfoNow === "function") {

        console.log("[Checkout] Calling deleteAppPrivateInfoNow (no reboot)...");

        // SAMSUNG: the API takes a success callback only - guard against it
        // never firing so the TV does not sit on the thank-you screen.
        var _cleared = false;
        var _afterClear = function () {
            if (_cleared) return;
            _cleared = true;
            _destroyAppsThenPowerOff();
        };
        setTimeout(function () {
            if (!_cleared) console.warn("[Checkout] deleteAppPrivateInfoNow timed out — destroying apps anyway");
            _afterClear();
        }, 10000);

        try {
            webapis.systemcontrol.deleteAppPrivateInfoNow(function (data) {
                console.log("[Checkout] ✅ private guest data deleted — now destroying apps", data);
                _afterClear();
            });
        } catch (e) {
            console.warn("[Checkout] Exception in deleteAppPrivateInfoNow:", e, "— destroying apps anyway");
            _afterClear();
        }

    } else {
        console.warn("[Checkout] deleteAppPrivateInfoNow not available — destroying apps directly");
        _destroyAppsThenPowerOff();
    }
}


function bindingAppsToPms(){
  // SAMSUNG: there is no PMS binding API and no SI application token
  // registration. Both were LG Pro:Centric concepts. Nothing to call.
  console.log("SI app token registration is not applicable on Samsung");
}

var loadingAnim = null;

function initLottieOnce() {
    if(loadingAnim) return; // already created

    var container = document.getElementById("lottieContainer");
    if (!container || !window.lottie) return;

    // first of all insure clean the container
    container.innerHTML = "";

    // loadingAnim = window.lottie.loadAnimation({
    //     container: container,
    //     renderer: 'svg',
    //     loop: true,
    //     autoplay: false,
    //     path: 'tv_loading_white.json'
    // });
}

function setDefaultIconForChannels(data, lgAppId) {
  if(!data || !data.length || !lgAppId) return null;
  for(var i = 0; i < data.length; i++) {
    var iconData = data[i];
    if(iconData && typeof iconData.lg_app_id !== 'undefined' && String(iconData.lg_app_id) === String(lgAppId)) {
      return iconData;
    }
  }
  return null;
}

function getCustomAppUrl(data,lgAppId) {
    if(!data || !data.length || !lgAppId) return null;
    for(var i = 0; i< data.length; i++) {
        var appData = data[i];
        if(appData && typeof appData.lg_app_id !== 'undefined' && String(appData.lg_app_id) === String(lgAppId)) {
            return appData.app_url;
        }
    }
}

function resolvePlaceholders(text) {
    if (!text) return null;

    var guest   = (Main.guestInfoData)                              || {};
    var prop    = (Main.deviceProfile && Main.deviceProfile.property_detail) || {};
    var roomNum = (Main.deviceProfile && Main.deviceProfile.room_number)     || "";

    var map = {
        "{{guestName}}":       guest.g_name      || null,
        "{{checkInDate}}":     guest.g_checkin   || null,
        "{{checkOutDate}}":    guest.g_checkout  || null,
        "{{propertyName}}":    prop.name         || null,
        "{{propertyCity}}":    prop.city         || null,
        "{{propertyAddress}}": prop.address      || null,
        "{{propertyState}}":   prop.state        || null,
        "{{propertyCountry}}": prop.country      || null,
        "{{roomNumber}}":      roomNum           || null,
        "{{name}}":            prop.name         || null,
        "{{address}}":         prop.address      || null,
        "{{city}}":            prop.city         || null,
        "{{state}}":           prop.state        || null,
        "{{country}}":         prop.country      || null,
        "{{g_room_number}}":   roomNum           || null,
        "{{g_name}}":          guest.g_name      || null,
        "{{g_checkin}}":       guest.g_checkin   || null,
        "{{g_checkout}}":      guest.g_checkout  || null
    };

    // Find which tokens are present in the text
    var tokenRegex = /\{\{[a-zA-Z0-9_]+\}\}/g;
    var tokensInText = text.match(tokenRegex) || [];

    // If text has no placeholders, return as-is
    if (tokensInText.length === 0) return text.trim() || null;

    // Check if ALL tokens in this text resolve to null
    var allNull = tokensInText.every(function(token) {
        return !map[token]; // null, undefined, or empty string
    });

    if (allNull) return null;

    // Replace: tokens with a value → substitute; tokens with null → remove (with surrounding spaces cleaned up)
    var result = text;
    for (var token in map) {
        if (!map.hasOwnProperty(token)) continue;
        var value = map[token];
        if (value) {
            result = result.split(token).join(value);
        } else {
            // Remove the token and clean up any double/leading/trailing spaces
            result = result.split(token).join("");
        }
    }

    // Clean up extra whitespace left by removed tokens
    result = result.replace(/\s{2,}/g, " ").trim();

    return result || null;
}

function getQrData(serial, mac) {
  if (serial && mac) return serial + "/" + mac;
  if (serial) return serial;
  if (mac) return mac;
  return null;
}

function normalizeId(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "null"
  ) {
    return null;
  }
  return String(value);
}

function setTheRmsIpProperty(statusIp) {
    // Set rms_trusted_ip to allow RMS calls from backend IP
    try {
        // SAMSUNG: rms_trusted_ip is an LG RMS concept with no Samsung
        // counterpart - there is no remote-management IP allow-list property.
        // Persist it in the widget's own storage so the value round-trips
        // for any app code that reads it back.
        if (typeof webapis !== "undefined" && webapis.widgetdata && webapis.widgetdata.write) {
            webapis.widgetdata.write("rms_trusted_ip", String(statusIp));
            console.log("rms_trusted_ip stored to widget data:", statusIp);
            console.log("Verified:", webapis.widgetdata.read("rms_trusted_ip"));
        } else {
            window.localStorage.setItem("rms_trusted_ip", String(statusIp));
            console.log("rms_trusted_ip stored to localStorage:", statusIp);
        }
    } catch (e) {
        console.error("Exception storing rms_trusted_ip:", e);
    }
}

function updateCurrentNetworkType(callback) {
    try {
        // SAMSUNG: webapis.network.getActiveConnectionType() replaces the LG
        // ethernet_plugged / wifi_plugged / networkMode triple. It is
        // synchronous and returns DISCONNECTED(0) / WIFI(1) / CELLULAR(2) /
        // ETHERNET(3).
        if (typeof webapis === "undefined" || !webapis.network) {
            lastNetworkType = "";
            if (typeof callback === "function") callback(lastNetworkType);
            return;
        }

        var connType = window._netRead ? window._netRead().type
                                       : webapis.network.getActiveConnectionType();
        var TYPES    = webapis.network.NetworkActiveConnectionType;

        if (connType === TYPES.ETHERNET) {
            lastNetworkType = "ethernet";
        }
        else if (connType === TYPES.WIFI) {
            lastNetworkType = "wifi";
        }
        else {
            lastNetworkType = "";
        }

        console.log("Detected network type:", lastNetworkType);

        if (typeof callback === "function") callback(lastNetworkType);
    } catch (e) {
        console.error("Error in updateCurrentNetworkType:", e);
        lastNetworkType = "";
        if (typeof callback === "function") callback(lastNetworkType);
    }
}

function gotoHomeSCreenFromDisconnectPage() {

    try {
        var defaultLangId = "";

        console.log("called---------------------->")

        if (
			Main &&
			Main.templateApiData &&
			Main.templateApiData.language_detail &&
			Main.templateApiData.language_detail.length > 0 &&
			Main.templateApiData.language_detail[0] &&
			Main.templateApiData.language_detail[0].language_uuid
		) {
            defaultLangId = Main.templateApiData.language_detail[0].language_uuid;
        }
        var langId = Main.clickedLanguage ? Main.clickedLanguage : defaultLangId;

        console.log("langId---------------------->", langId);

        // Restore presentPagedetails.clickedLanguage — it gets wiped when
        // addBackData("MyDevice") does presentPagedetails = {}.
        // Without this, Util.homePageHtml() cannot build the correct
        // iconkey and languageShortCut for the header language icon.
        presentPagedetails.clickedLanguage = langId;

        var cached = [];

        if (Main && Main.cachedHomeByLang && Main.cachedHomeByLang[langId]) {
          cached = Main.cachedHomeByLang[langId];
        }

        console.log("called    -----> 1  ----------------------->")

        if (cached.length) {
          Main.renderHomePage(cached);
        } else if (Array.isArray(Main.homePageData) && Main.homePageData.length) {
          var items = Main.homePageData
            .filter(function (x) {
                return x && x.is_active === true && x.language_uuid === langId;
            })
            .sort(function (a, b) {
                return (a.priority_order || 0) - (b.priority_order || 0);
            });

          if (items.length) {
            Main.cacheHomeImageAssetsByLanguage(
                items,
                langId,
                function (cachedGroup) {
                    Main.cachedHomeByLang[langId] = cachedGroup || [];
                    Main.renderHomePage(Main.cachedHomeByLang[langId]);
                }
            );
          }
        } else {
          Main.getHomeData(function () {
            var items2 =
              (Main.cachedHomeByLang && Main.cachedHomeByLang[langId]) || [];
            if (items2.length) Main.renderHomePage(items2);
          });
        }
      } catch (e) {
        // utilities.genricPopup("Wake render error:" + e, 'info');
        console.error("Wake render error:", e);
      }

}

/**
 * ====================================================================
 * SIMPLIFIED CANVAS RENDERING FUNCTION
 * Now delegates to the modular canvas rendering system
 * ====================================================================
 */
// NOTE: canvas-renderer.js also assigns window.renderTemplateCanvas. Scripts are
// injected dynamically, so either definition may win depending on download
// order — this one must forward onReady too, or the line loader never completes.
function renderTemplateCanvas(onReady) {
    console.log('[appconfig] Calling CanvasRenderer.render()');

    try {
        // Check if CanvasRenderer is available
        if (typeof CanvasRenderer === 'undefined') {
            console.error('[appconfig] CanvasRenderer not loaded! Check script includes.');
            if (typeof onReady === 'function') onReady();
            return;
        }

        // Delegate to the modular rendering system
        CanvasRenderer.render(onReady);
        
        // Optional: Start animation loop for dynamic content (clocks, etc.)
        // Uncomment if you want continuous updates
        // CanvasRenderer.startAnimationLoop();
        
    } catch (error) {
        console.error('[appconfig] Canvas rendering error:', error);
        
        // Show error message to user
        var canvas = document.getElementById('templateCanvas');
        if (canvas) {
            var ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Failed to render template', canvas.width / 2, canvas.height / 2);
            }
        }
    }
}

function checkNetworkAndLaunch(appName, launchFn) {
    console.log('[checkNetworkAndLaunch] Checking network before launching:', appName);

    try {
        // SAMSUNG: synchronous getActiveConnectionType() replaces the async
        // idcap network/configuration/get call.
        if (typeof webapis === "undefined" || !webapis.network) {
            console.warn('[checkNetworkAndLaunch] webapis.network not available, proceeding with launch');
            launchFn();
            return;
        }

        var connType = window._netRead ? window._netRead().type
                                       : webapis.network.getActiveConnectionType();
        var TYPES    = webapis.network.NetworkActiveConnectionType;

        var wiredState = (connType === TYPES.ETHERNET) ? "connected" : "disconnected";
        var wifiState  = (connType === TYPES.WIFI)     ? "connected" : "disconnected";

        console.log('[checkNetworkAndLaunch] wiredState =', wiredState, '| wifiState =', wifiState);

        var isConnected = (wiredState === "connected") || (wifiState === "connected");

        if (isConnected) {
            console.log('[checkNetworkAndLaunch] Network available, launching:', appName);
            launchFn();
        } else {
            console.warn('[checkNetworkAndLaunch] No network connection. Blocking launch of:', appName);
            utilities.genricPopup(
                'Internet connection is unavailable at the moment. Live TV is still available.',
                'info'
            );
        }
    } catch (e) {
        console.error('[checkNetworkAndLaunch] Exception:', e.message);
        // Fail-open: if the check itself fails, still allow launch
        launchFn();
    }
}

/**
 * _clearAllCacheThenCheckout()
 *
 * Clears ALL locally cached data (localStorage keys + IndexedDB "AppCacheDB")
 * then calls CheckoutManager_requestCheckout() so the TV reboots fresh.
 *
 * Called when a "refresh" command is received via MQTT
 * or guestInfoAfterInterval, ensuring the next boot does a full API download
 * instead of re-using stale cache.
 */
function _clearAllCacheThenCheckout() {
  console.log('[Cache Clear] Starting full cache clear before checkout...');

  // ── 1. Clear all relevant localStorage keys ──────────────────────────
  var cacheKeys = [
    'cachedPageDetails',
    'cachedTemplateApiData',
    'cachedGuestInfoData',
    'cachedDeviceProfile',
    'cachedHomePageData',
    'cachedWeatherDetails',
    'liveTvChannelIdDetails',
    'liveTvChannelMetaDetails',
    'cachedLgSettings'
  ];

  cacheKeys.forEach(function (key) {
    try {
      localStorage.removeItem(key);
      console.log('[Cache Clear] Removed localStorage key: ' + key);
    } catch (e) {
      console.warn('[Cache Clear] Failed to remove localStorage key "' + key + '":', e);
    }
  });

  // ── 2. Delete IndexedDB "AppCacheDB" ─────────────────────────────────
  // onblocked can be followed by onsuccess once the blocker closes - run the
  // checkout only once.
  var _afterIdbRan = false;
  function _afterIdb() {
    if (_afterIdbRan) return;
    _afterIdbRan = true;
    console.log('[Cache Clear] Cache cleared — calling CheckoutManager_requestCheckout');
    try {
      CheckoutManager_requestCheckout();
    } catch (e) {
      console.error('[Cache Clear] CheckoutManager_requestCheckout threw:', e);
    }
  }

  try {
    if (typeof Main !== 'undefined' && Main.db) {
      try { Main.db.close(); } catch (ex) {}
      Main.db = null;
    }

    var req = indexedDB.deleteDatabase('AppCacheDB');
    req.onsuccess = function () {
      console.log('[Cache Clear] IndexedDB "AppCacheDB" deleted');
      _afterIdb();
    };
    req.onerror = function () {
      console.warn('[Cache Clear] IndexedDB delete error — proceeding anyway');
      _afterIdb();
    };
    req.onblocked = function () {
      console.warn('[Cache Clear] IndexedDB delete blocked — proceeding anyway after 1s');
      setTimeout(_afterIdb, 1000);
    };
  } catch (dbErr) {
    console.warn('[Cache Clear] IndexedDB deleteDatabase threw:', dbErr, '— proceeding anyway');
    _afterIdb();
  }
}

/*=====================================================
TV EXCEPTION LOG API
===================================================== */
Main.logTvException = function (options) {
  try {
    options = options || {};

    // ── Reserved top-level field names ──────────────────────────────────
    // Any unknown key passed in options goes into extra_data automatically
    var TOP_LEVEL_FIELDS = {
      app_version:      true,
      error_code:       true,
      error_type:       true,
      error_message:    true,
      error_source:     true,
      stack_trace:      true,
      module:           true,
      action:           true,
      guest_checked_in: true,
      room_number:      true,
      device_timestamp: true,
      extra_data:       true
    };

    // ── Auto ISO timestamp (timezone-aware) ─────────────────────────────
    function _isoNow() {
      try {
        var tz = Main.deviceProfile &&
                 Main.deviceProfile.property_detail &&
                 Main.deviceProfile.property_detail.property_timezone;

        // property timezone → device local timezone → UTC
        var resolvedTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (resolvedTz) {
          var parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: resolvedTz,
            year:     'numeric', month:  '2-digit', day:    '2-digit',
            hour:     '2-digit', minute: '2-digit', second: '2-digit',
            hour12:   false
          }).formatToParts(new Date());

          var m = {};
          parts.forEach(function (p) { m[p.type] = p.value; });

          return m.year + '-' + m.month + '-' + m.day + 'T' +
                 m.hour + ':' + m.minute + ':' + m.second;
        }
      } catch (e) { /* fall through */ }

      // Last resort — UTC
      return new Date().toISOString();
    }

    // ── Only add meaningful values ───────────────────────────────────────
    function _set(obj, key, value) {
      if (value === null || value === undefined || value === '') return;
      if (typeof value === 'string' && value.trim() === '') return;
      obj[key] = value;
    }

    // ── Build top-level payload ──────────────────────────────────────────
    var payload = {};

    _set(payload, 'app_version',
         options.app_version !== undefined ? options.app_version : appConfig.appVersion);

    _set(payload, 'error_code',    options.error_code);
    _set(payload, 'error_type',    options.error_type);
    _set(payload, 'error_message', options.error_message);
    _set(payload, 'error_source',  options.error_source);
    _set(payload, 'stack_trace',   options.stack_trace);
    _set(payload, 'module',        options.module);
    _set(payload, 'action',        options.action);

    // boolean — include only when explicitly passed
    if (typeof options.guest_checked_in === 'boolean') {
      payload.guest_checked_in = options.guest_checked_in;
    }

    // room_number: caller → deviceProfile fallback
    var roomNo = options.room_number ||
                 (Main.deviceProfile && Main.deviceProfile.room_number) || '';
    _set(payload, 'room_number', roomNo);

    payload.device_timestamp = options.device_timestamp || _isoNow();

    // ── Build extra_data ─────────────────────────────────────────────────
    // Layer 1: explicit extra_data object from caller
    // Layer 2: any unknown top-level keys from options
    // Layer 3: auto-attached device identifiers
    var extra = {};

    // Layer 1 — caller's explicit extra_data (any fields allowed)
    if (options.extra_data && typeof options.extra_data === 'object') {
      for (var k in options.extra_data) {
        if (options.extra_data.hasOwnProperty(k)) {
          extra[k] = options.extra_data[k];
        }
      }
    }

    // Layer 2 — unknown top-level keys auto-route into extra_data
    for (var key in options) {
      if (options.hasOwnProperty(key) && !TOP_LEVEL_FIELDS[key]) {
        extra[key] = options[key];
      }
    }

    // Layer 3 — always attach device identifiers for server-side correlation
    if (deviceMac)          extra.mac_address  = deviceMac;
    if (deviceSerialNumber) extra.serial_number = deviceSerialNumber;
    if (deviceIp)           extra.device_ip     = deviceIp;

    if (Object.keys(extra).length > 0) {
      payload.extra_data = extra;
    }

    // ── Guard: need auth token ───────────────────────────────────────────
    if (!pageDetails || !pageDetails.access_token) {
      console.warn('[logTvException] Skipped — access_token not available yet');
      return;
    }

    console.log('[logTvException] Posting:', payload);

    macro.ajax({
      url:         apiPrefixUrl + 'tv-exception-log',
      type:        'POST',
      data:        JSON.stringify(payload),
      contentType: 'application/json; charset=utf-8',
      headers: {
        Authorization: 'Bearer ' + pageDetails.access_token
      },
      success: function (response) {
        console.log('[logTvException] Logged successfully');
      },
      error: function (err) {
        // Silent — never affects existing functionality
        console.warn('[logTvException] API error (non-fatal):', err);
      },
      timeout: 30000
    });

  } catch (e) {
    // Outer try/catch — if anything inside this function throws for any
    // reason, it is silently swallowed so existing functionality is
    // never affected
    console.warn('[logTvException] Unexpected error (non-fatal):', e);
  }
};


/* ================================================================
    CANVAS-PAGE LINE LOADER
    A thin progress bar that slides in from the left along the bottom
    edge of the screen.  Used ONLY by handleDynamicPageAction so the
    standard circular spinner (#loading / .loader-bg) is never shown
    during canvas-to-canvas navigation.

    Behaviour:
        _showCanvasLineLoader()  → appends #ca-line-loader to <body>,
                                animates width 0 → 85 % (ease-out
                                cubic, ~8 s) while the API is in-flight.
        _hideCanvasLineLoader()  → snaps bar to 100 %, brief hold,
                                then fades out and removes the element.
        _hideCanvasLineLoader(true) → instant removal (cleanup / stale bar).

    The bar sits at z-index 999999 — same level as .loader-bg — so it
    is always visible over the canvas content.  CSS lives in styles.css.
================================================================ */

function _showCanvasLineLoader() {
    /* Remove any stale bar from a previous call */
    _hideCanvasLineLoader(true);
    _caLineLoaderDone = false;

    /* CSS lives in styles.css — no inline injection needed */
    var bar    = document.createElement('div');
    bar.id     = 'ca-line-loader';
    document.body.appendChild(bar);

    /* Animate: 0 → TARGET_PCT over FILL_MS using ease-out cubic */
    var startTime  = Date.now();
    var FILL_MS    = 8000;
    var TARGET_PCT = 85;

    function _tick() {
        if (_caLineLoaderDone) return;
        var b = document.getElementById('ca-line-loader');
        if (!b) return;
        var elapsed = Date.now() - startTime;
        var t       = elapsed / FILL_MS;
        if (t > 1) t = 1;
        /* ease-out cubic: fast start, slows near the cap */
        var eased = 1 - (1 - t) * (1 - t) * (1 - t);
        b.style.width = (eased * TARGET_PCT).toFixed(2) + '%';
        if (t < 1) {
            _caLineLoaderRafId = requestAnimationFrame(_tick);
        }
    }

    /* Two-frame delay so browser paints the bar at 0 % first */
    requestAnimationFrame(function () {
        requestAnimationFrame(_tick);
    });

    /* Safety net: the bar only completes when the page's onReady fires.
       If a media load hangs or a render path never reports ready, the bar
       would sit at 85 % forever — complete it after the max wait instead. */
    _caLineLoaderSafetyId = setTimeout(function () {
        _caLineLoaderSafetyId = null;
        if (_caLineLoaderDone) return;
        console.warn('[CanvasAction] Line loader safety timeout — forcing completion');
        _hideCanvasLineLoader();
    }, _CA_LINE_LOADER_MAX_MS);

    console.log('[CanvasAction] Line loader shown');
}

function _hideCanvasLineLoader(immediate) {
    _caLineLoaderDone = true;

    if (_caLineLoaderSafetyId) {
        clearTimeout(_caLineLoaderSafetyId);
        _caLineLoaderSafetyId = null;
    }

    if (_caLineLoaderRafId) {
        cancelAnimationFrame(_caLineLoaderRafId);
        _caLineLoaderRafId = null;
    }

    var bar = document.getElementById('ca-line-loader');
    if (!bar) return;

    if (immediate) {
        if (bar.parentNode) bar.parentNode.removeChild(bar);
        return;
    }

    /* Snap to 100 % with a short eased transition, then fade out */
    bar.style.webkitTransition = 'width 0.3s ease-out';
    bar.style.transition       = 'width 0.3s ease-out';
    bar.style.width            = '100%';

    setTimeout(function () {
        var b = document.getElementById('ca-line-loader');
        if (!b) return;
        b.style.webkitTransition = 'opacity 0.4s ease-out';
        b.style.transition       = 'opacity 0.4s ease-out';
        b.style.opacity          = '0';
        setTimeout(function () {
            var b2 = document.getElementById('ca-line-loader');
            if (b2 && b2.parentNode) b2.parentNode.removeChild(b2);
        }, 420);
    }, 280);

    console.log('[CanvasAction] Line loader completing');
}

/* ── end line loader helpers ─────────────────────────────────── */

/* =====================================================================
 * LiveTv - single entry point for RF and IPTV playback (Samsung HTV)
 *
 * Follows Samsung's TEPRFIPTV reference app:
 *   IPTV  : tvwindow.hide()  -> avplay open/prepareAsync/play
 *   RF    : avplay stop/close -> tvwindow.setSource(TV) -> tvwindow.show()
 *           -> tizen.tvchannel.tune()            (channels stored on TV)
 *           -> webapis.broadcast.tuneDirect()    (no channel scan needed,
 *                                                 needs full RF params)
 *
 * lg_ch_url formats from backend:
 *   "udp://239.74.48.14:8013" / "udp://@..." / "rtp://..."  -> IPTV
 *   "7-7"                                                   -> RF major-minor
 *   "10"                                                    -> RF major only
 *
 * Optional backend field for tuneDirect (recommended, avoids channel scan):
 *   ch.direct_tune = { broadcastStandard:"ATSC", channelType:"CDTV",
 *                      ptc:30, programNumber:1, modulationType:"QAM256" }
 * Optional DRM for IPTV: ch.drm_type = "PROIDIOM" | "LYNK",
 *                        ch.drm_params = { ... } (object or JSON string)
 * ===================================================================== */
var LiveTv = (function () {
  var SCREEN_W = 1920, SCREEN_H = 1080;
  var tvWindowShown = false;
  var mode = null;          // 'IP' | 'RF' | null
  var seq = 0;              // ignores callbacks from a superseded request
  var listenersAdded = false;

  function log() {
    try { console.log.apply(console, ['[LiveTv]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function warn() {
    try { console.warn.apply(console, ['[LiveTv]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function hasTizen(ns) { return typeof tizen !== 'undefined' && !!tizen[ns]; }
  function hasAvplay() { return typeof webapis !== 'undefined' && !!webapis.avplay; }

  /* ---------- URL parsing ---------- */
  function parse(raw) {
    var url = String(raw == null ? '' : raw).trim();
    var m = /^(udp|rtp):\/\/@?(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/i.exec(url);
    if (m) return { kind: 'IP', url: m[1].toLowerCase() + '://' + m[2] + ':' + parseInt(m[3], 10) };
    m = /^(\d+)\s*[-.]\s*(\d+)$/.exec(url);
    if (m) return { kind: 'RF', major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
    m = /^(\d+)$/.exec(url);
    if (m) return { kind: 'RF', major: parseInt(m[1], 10), minor: null };
    return { kind: 'OTHER', url: url };
  }

  function toObj(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return null; }
  }

  /* ---------- AVPlay ---------- */
  function ensurePlayerObject() {
    if (document.getElementById('av-player')) return;
    try {
      var o = document.createElement('object');
      o.id = 'av-player';
      o.setAttribute('type', 'application/avplayer');
      o.style.cssText = 'position:fixed;top:0;left:0;width:' + SCREEN_W + 'px;height:' +
                        SCREEN_H + 'px;background:transparent;z-index:0;';
      document.body.insertBefore(o, document.body.firstChild);
    } catch (e) { warn('av-player create failed', e && e.message); }
  }

  function stopAvplay() {
    if (!hasAvplay()) return;
    var st = 'NONE';
    try { st = webapis.avplay.getState(); } catch (e) {}
    if (st !== 'NONE') {
      try { webapis.avplay.stop(); } catch (e) {}
      try { webapis.avplay.close(); } catch (e) {}
    }
  }

  /* ---------- TV window / source ---------- */
  function hideTvWindow() {
    if (!hasTizen('tvwindow') || !tvWindowShown) return;
    try {
      tizen.tvwindow.hide(function () { tvWindowShown = false; log('tvwindow hidden'); },
                          function (e) { warn('tvwindow.hide error', e && e.message); }, 'MAIN');
    } catch (e) { warn('tvwindow.hide threw', e && e.message); }
    tvWindowShown = false;
  }

  function showTvWindow(done) {
    if (!hasTizen('tvwindow')) { done && done(); return; }
    if (tvWindowShown) { done && done(); return; }
    var rect = ['0px', '0px', SCREEN_W + 'px', SCREEN_H + 'px'];
    var ok = function () { tvWindowShown = true; log('tvwindow shown'); done && done(); };
    var ko = function (e) { warn('tvwindow.show error', e && e.message); done && done(); };
    try {
      // BEHIND keeps the guide/overlay HTML drawn on top of the tuner video.
      tizen.tvwindow.show(ok, ko, rect, 'MAIN', 'BEHIND');
    } catch (e1) {
      try { tizen.tvwindow.show(ok, ko, rect, 'MAIN'); }
      catch (e2) { warn('tvwindow.show threw', e2 && e2.message); done && done(); }
    }
  }

  // setSource needs a real SystemInfoVideoSourceInfo from systeminfo,
  // not a literal {type:'TV'} (same as Samsung's Main.changeSource).
  function ensureTvSource(done) {
    if (!hasTizen('tvwindow')) { done(); return; }
    try {
      var cur = tizen.tvwindow.getSource();
      if (cur && cur.type === 'TV') { done(); return; }
    } catch (e) {}

    var finished = false;
    var finish = function () { if (!finished) { finished = true; done(); } };
    setTimeout(finish, 3000); // watchdog: never block tuning on a hung callback

    var setIt = function (src) {
      try {
        tizen.tvwindow.setSource(src,
          function (s) { log('source set', s && s.type, s && s.number); finish(); },
          function (e) { warn('setSource error', e && e.message); finish(); });
      } catch (e) { warn('setSource threw', e && e.message); finish(); }
    };

    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (vs) {
        var list = (vs && vs.connected) || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].type === 'TV') { setIt(list[i]); return; }
        }
        warn('TV source not in connected list, trying literal');
        setIt({ type: 'TV', number: 1 });
      }, function (e) {
        warn('VIDEOSOURCE error', e && e.message);
        setIt({ type: 'TV', number: 1 });
      });
    } catch (e) {
      warn('systeminfo threw', e && e.message);
      setIt({ type: 'TV', number: 1 });
    }
  }

  function addListenersOnce() {
    if (listenersAdded || !hasTizen('tvchannel')) return;
    listenersAdded = true;
    try { tizen.tvchannel.addSignalStateChangeListener(function (s) { log('signal state', s); }); } catch (e) {}
    try { tizen.tvchannel.addChannelChangeListener(function (c) { log('channel changed', c && c.major, c && c.minor); }); } catch (e) {}
  }

  /* ---------- IPTV ---------- */
  function playIp(url, ch, cb, my) {
    if (!hasAvplay()) { cb.onError('webapis.avplay not available'); return; }
    hideTvWindow();
    stopAvplay();
    ensurePlayerObject();
    try {
      webapis.avplay.open(url);
      webapis.avplay.setDisplayRect(0, 0, SCREEN_W, SCREEN_H);
      webapis.avplay.setListener({
        onbufferingstart: function () { log('buffering start'); },
        onbufferingprogress: function () {},
        onbufferingcomplete: function () { log('buffering complete'); },
        oncurrentplaytime: function () {},
        onevent: function (t, d) { log('event', t, d); },
        onstreamcompleted: function () { log('stream completed'); },
        onerror: function (t) { warn('avplay error', t); if (my === seq) cb.onError(t); }
      });

      var drm = ch && ch.drm_type ? String(ch.drm_type).toUpperCase() : '';
      if (drm === 'PROIDIOM' || drm === 'LYNK') {
        webapis.avplay.setDrm(drm, 'Initialize', JSON.stringify(toObj(ch.drm_params) || {}));
      }

      webapis.avplay.prepareAsync(function () {
        if (my !== seq) return;
        try { webapis.avplay.play(); mode = 'IP'; log('IPTV playing', url); cb.onSuccess(); }
        catch (e) { cb.onError(e && e.message); }
      }, function (e) {
        if (my === seq) cb.onError(e && e.message);
      });
    } catch (e) {
      cb.onError(e && e.message);
    }
  }

  /* ---------- RF ---------- */
  function tuneCallbacks(cb, my, label) {
    return {
      onsuccess: function () { if (my !== seq) return; mode = 'RF'; log('RF tuned', label); cb.onSuccess(); },
      onnosignal: function () { if (my !== seq) return; mode = 'RF'; warn('RF no signal', label); cb.onNoSignal(); },
      onprograminforeceived: function () {}
    };
  }

  // Finds the stored channel so "10" matches whatever minor the scan gave it.
  function tuneStored(p, cb, my) {
    if (!hasTizen('tvchannel')) { cb.onError('tizen.tvchannel not available (tv.channel privilege?)'); return; }
    var label = p.major + (p.minor != null ? '-' + p.minor : '');

    var direct = function (opt) {
      try {
        tizen.tvchannel.tune(opt, tuneCallbacks(cb, my, label),
          function (e) { if (my === seq) cb.onError('tune: ' + (e && e.message)); });
      } catch (e) { cb.onError('tune threw: ' + (e && e.message)); }
    };

    try {
      tizen.tvchannel.getChannelList(function (list) {
        if (my !== seq) return;
        list = list || [];
        log('stored channels:', list.length);
        if (!list.length) {
          cb.onError('No channels stored on TV - run a channel scan or send direct_tune params');
          return;
        }
        var hit = null, i;
        for (i = 0; i < list.length; i++) {
          if (list[i].major === p.major && (p.minor == null || list[i].minor === p.minor)) {
            if (p.minor != null || !hit || list[i].minor < hit.minor) hit = list[i];
            if (p.minor != null) break;
          }
        }
        if (!hit) { cb.onError('Channel ' + label + ' not in stored channel list'); return; }
        var opt = { major: hit.major, minor: hit.minor };
        if (hit.ptc) opt.ptc = hit.ptc;
        if (hit.programNumber) opt.programNumber = hit.programNumber;
        direct(opt);
      }, function (e) {
        warn('getChannelList error, tuning blind', e && e.message);
        direct({ major: p.major, minor: p.minor == null ? 0 : p.minor });
      }, 'ALL', 0, 1000);
    } catch (e) {
      warn('getChannelList threw, tuning blind', e && e.message);
      direct({ major: p.major, minor: p.minor == null ? 0 : p.minor });
    }
  }

  function tuneDirect(opt, cb, my) {
    if (!(typeof webapis !== 'undefined' && webapis.broadcast && webapis.broadcast.tuneDirect)) {
      cb.onError('webapis.broadcast.tuneDirect not available'); return;
    }
    try {
      webapis.broadcast.tuneDirect(opt,
        function () { if (my !== seq) return; mode = 'RF'; log('tuneDirect ok', JSON.stringify(opt)); cb.onSuccess(); },
        function (e) { if (my === seq) cb.onError('tuneDirect: ' + (e && e.message)); });
    } catch (e) { cb.onError('tuneDirect threw: ' + (e && e.message)); }
  }

  function playRf(p, ch, cb, my) {
    stopAvplay();
    addListenersOnce();
    ensureTvSource(function () {
      if (my !== seq) return;
      showTvWindow(function () {
        if (my !== seq) return;
        var dt = toObj(ch && ch.direct_tune);
        if (dt) tuneDirect(dt, cb, my);
        else tuneStored(p, cb, my);
      });
    });
  }

  /* ---------- public ---------- */
  function play(channel, callbacks) {
    var ch = (channel && typeof channel === 'object') ? channel : { lg_ch_url: channel };
    var c = callbacks || {};
    var cb = {
      onSuccess:  function () { try { c.onSuccess && c.onSuccess(); } catch (e) {} },
      onNoSignal: function () { try { (c.onNoSignal || c.onError) && (c.onNoSignal || c.onError)('no signal'); } catch (e) {} },
      onError:    function (m) { warn('play failed:', m); try { c.onError && c.onError(m); } catch (e) {} }
    };
    var p = parse(ch.lg_ch_url);
    var my = ++seq;
    log('play', ch.lg_ch_url, '->', p.kind);

    if (p.kind === 'IP') return playIp(p.url, ch, cb, my);
    if (p.kind === 'RF') return playRf(p, ch, cb, my);

    // Anything else (http/hls/etc.) keeps the existing media path
    hideTvWindow();
    try { Navigation.playSelectedChannel(p.url); cb.onSuccess(); }
    catch (e) { cb.onError(e && e.message); }
  }

  function stop() {
    seq++;
    stopAvplay();
    hideTvWindow();
    mode = null;
  }

  return { play: play, stop: stop, parse: parse, getMode: function () { return mode; } };
})();