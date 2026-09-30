/* ===============================
   LOCAL CHECKOUT
================================ */
function performLocalCheckout(complete) {

    // SAMSUNG: webapis.systemcontrol.deleteAppPrivateInfoNow() is the Samsung
    // equivalent of LG's checkout — it wipes per-guest private app data.
    // Documented since Tizen 9.0, so it may be absent on 6.5 firmware.
    var hasSamsungCheckout = (typeof webapis !== "undefined" &&
                              webapis.systemcontrol &&
                              typeof webapis.systemcontrol.deleteAppPrivateInfoNow === "function");

    Main.ShowLoading();

    function afterCheckout() {
        if(DisplayCheckOutScreen) {
            Main.HideLoading();

            macro("#mainContent").html("");
            macro("#mainContent").html(Util.checkoutThankYouScreen());
            destroyAppsThenReboot(complete);
        } else {
            destroyAppsThenReboot(complete);
        }
    }

    if (hasSamsungCheckout) {
        try {
            webapis.systemcontrol.deleteAppPrivateInfoNow(function (data) {
                console.log("Private guest data deleted:", data);
                afterCheckout();
            });
        } catch (err) {
            Main.HideLoading();
            utilities.genricPopup(
                "Checkout failed: " + ((err && err.message) || "Unknown"),
                "info"
            );
            if (complete) complete(err);
        }
        return;
    }

    // Fallback: clear this app's own guest state, then continue the same flow.
    console.log("deleteAppPrivateInfoNow unavailable - clearing local app data only");
    try { window.localStorage.clear(); } catch (e) {}
    try {
        if (window.indexedDB && indexedDB.deleteDatabase) {
            indexedDB.deleteDatabase("imageCache");
        }
    } catch (e) {}
    afterCheckout();
}

/* ===============================
   DESTROY APPS → REBOOT
================================ */
function destroyAppsThenReboot(complete) {

    // SAMSUNG: kill running apps via tizen.application.getAppsContext + kill().
    if (!(typeof tizen !== "undefined" &&
          tizen.application &&
          typeof tizen.application.kill === "function")) {
        rebootTV(complete);
        return;
    }

    /* App IDs vary by model */
    var apps = [
        { id: Main.lgSettings.netflix_app_id, name: "Netflix" },
        { id: Main.lgSettings.youtube_app_id, name: "YouTube" }
    ];

    var remaining = apps.length;

    if (remaining === 0) {
        rebootTV(complete);
        return;
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
                    done();
                    return;
                }
                tizen.application.kill(ctx.contextId,
                    function () {
                        console.log("✅ " + app.name + " destroyed");
                        done();
                    },
                    function () {
                        console.log("ℹ️ " + app.name + " not running");
                        done();
                    });
            }, function () {
                done();
            });
        } catch (e) {
            done();
        }
    });

    function done() {
        remaining--;
        if (remaining <= 0) {
            rebootTV(complete);
        }
    }
}

/* ===============================
   POWER CONTROL
================================ */
function rebootTV(complete) {

    setTimeout(function () {

        // SAMSUNG: webapis.systemcontrol.rebootDevice() is synchronous and
        // requires the PARTNER-level systemcontrol privilege.
        if (typeof webapis !== "undefined" &&
            webapis.systemcontrol &&
            typeof webapis.systemcontrol.rebootDevice === "function") {
            try {
                console.log("Reboot success after checkout");
                if (complete) complete(null);
                webapis.systemcontrol.rebootDevice();
            } catch (err) {
                console.warn("Reboot failed", err);
                powerOffFallback(complete);
            }
            return;
        }

        powerOffFallback(complete);

    }, 5000);
}

function powerOffFallback(complete) {

    // SAMSUNG: there is no app-level power-off. The closest safe behaviour is
    // to blank the panel via AppCommon screensaver, then exit the app.
    try {
        if (typeof webapis !== "undefined" &&
            webapis.appcommon &&
            webapis.appcommon.setScreenSaver) {
            webapis.appcommon.setScreenSaver(
                webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON,
                function () { console.log("PowerOff fallback: screen blanked"); },
                function () {}
            );
        }
    } catch (e) {}

    setTimeout(function () {
        try {
            if (typeof tizen !== "undefined" && tizen.application) {
                tizen.application.getCurrentApplication().exit();
            }
        } catch (e) {}
        if (complete) complete(null);
    }, 500);
}

/* ===============================
   PMS (OPTIONAL)
================================ */
function tryPmsThenCheckout(complete) {

    // SAMSUNG: no PMS binding API is exposed to apps. Go straight to checkout.
    performLocalCheckout(complete);
}

/* ===============================
   CHECKOUT ENTRY POINT
================================ */
function CheckoutManager_requestCheckout(complete) {

    // SAMSUNG: webapis is created by $WEBAPIS/webapis/webapis.js in index.html,
    // so there is no init step to call here.
    tryPmsThenCheckout(complete);
}
