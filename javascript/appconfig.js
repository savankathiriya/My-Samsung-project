var utilities = {};
var clockIntervalId = null;

// HDMI Connection Monitoring
var currentHdmiType = null;
var currentHdmiIndex = null;

var _caLineLoaderRafId = null;   // requestAnimationFrame handle
var _caLineLoaderDone  = false;  // signals _tick() to stop self-advancing

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

    function formatTimeFromParts(parts, format) {
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
            'mm': pad(parseInt(map.minute, 10)),
            'ss': pad(parseInt(map.second, 10))
        };

        return format.replace(/hh|HH|mm|ss/g, function (match) {
            return tokens[match];
        });
    }

    function updateDateTime() {

        // 🔹 Get timezone dynamically
        var timeZone =
            (Main.deviceProfile && Main.deviceProfile.property_detail.property_timezone)
                ? Main.deviceProfile.property_detail.property_timezone
                : Intl.DateTimeFormat().resolvedOptions().timeZone; // fallback

        // 🔹 Get raw format (HH:mm, hh:mm a, etc.)
        var rawFormat =
            (Main.templateApiData && Main.templateApiData.time_format)
                ? Main.templateApiData.time_format
                : 'HH:mm';

        // Remove AM/PM if present (you already wanted this)
        var timeFormat = rawFormat.replace(/\s*[aA]$/, '');

        // Determine if 12-hour format is needed
        var is12Hour = rawFormat.toLowerCase().indexOf('hh') !== -1;

        // ðŸ”¹ Get time parts for the given timezone
        var timeFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timeZone,
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false  // Always get 24-hour first, we'll convert if needed
        });

        var timeParts = timeFormatter.formatToParts(new Date());

        var timeStr = formatTimeFromParts(timeParts, timeFormat);

        // 🔹 Date (timezone-aware)
        var dateFormatter = new Intl.DateTimeFormat(undefined, {
            timeZone: timeZone,
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });

        var dateStr = dateFormatter.format(new Date());

        // 🔹 Update DOM
        var timeEl = document.getElementById("time_now");
        var dateEl = document.getElementById("date_now");

        if (timeEl) timeEl.textContent = timeStr;
        if (dateEl) dateEl.textContent = dateStr;
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
  try {
      // SAMSUNG: an IP (UDP/RTP) channel runs through avplay, so stop + close
      // is what actually tears Live TV down. tizen.tvchannel has no "stop" -
      // an RF channel keeps running on the tuner until the source changes.
      if (typeof webapis !== "undefined" && webapis.avplay) {
          try { webapis.avplay.stop(); } catch (e) {}
          try { webapis.avplay.close(); } catch (e) {}
          window._currentHcapMedia = null;
          console.log(" Live TV stopped successfully");
      } else {
          console.warn("webapis.avplay is not available");
      }
  } catch (e) {
      console.error(" avplay stop/close error in exitLiveTv: " + e.message);
  }
}

function launchApp(appId,source) {
    // SAMSUNG: tizen.application.launch(appId, onSuccess, onError).
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
                // NOTE: the LG version retried indefinitely here, which spins
                // forever when the package genuinely is not installed.
                Main.HideLoading();
                console.log(" Failed to launch app:", appId, err && err.message);
            });
    } catch (e) {
        Main.HideLoading();
        console.log("Exception while launching app:", e.message);
    }
}

function installApp(appId, source) {
    // SAMSUNG: an application cannot install another package on Tizen.
    // Packages are provisioned through Seller Office / Tizen Business Manager.
    console.log(" Cannot install " + appId + " from the app - Tizen does not "
        + "permit app-driven installation. Provision it via Seller Office / TBM.");
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

    tizen.application.getAppsInfo(
        function (apps) {
            var foundApp = null;
            for (var i = 0; i < apps.length; i++) {
                if (apps[i].id === appId) { foundApp = apps[i]; break; }
            }

            Main.ShowLoading();

            console.log("installed app count------------------->", apps.length);
            console.log("installed app list------------------->", apps);

            if (foundApp) {
                console.log(" " + appId + " already installed.");
                launchApp(appId, source);
            } else {
                console.log(" " + appId + " not found in installed apps.");
                installApp(appId, source);
            }
        },
        function (err) {
            console.log("Failed to get app list:", err && err.message);
        });
}

function rebootTv(){
    // SAMSUNG: no cast-token registration and no app installation step exist,
    // so this reduces to running the checkout + reboot flow directly.
    Main.ShowLoading();

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
        "{{roomNumber}}":      roomNum           || null
    };

    // Find which tokens are present in the text
    var tokenRegex = /\{\{[a-zA-Z]+\}\}/g;
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
function renderTemplateCanvas() {
    console.log('[appconfig] Calling CanvasRenderer.render()');
    
    try {
        // Check if CanvasRenderer is available
        if (typeof CanvasRenderer === 'undefined') {
            console.error('[appconfig] CanvasRenderer not loaded! Check script includes.');
            return;
        }
        
        // Delegate to the modular rendering system
        CanvasRenderer.render();
        
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

    console.log('[CanvasAction] Line loader shown');
}

function _hideCanvasLineLoader(immediate) {
    _caLineLoaderDone = true;

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