var Navigation = {};
var view = "";
var presentPagedetails = {};
Navigation.previousCardFocus = function (v_index, h_index) {
  presentPagedetails.previousCardFocus = {
    row: parseInt(v_index),
    column: parseInt(h_index),
  };
};

Navigation.downloadingPageLoad = function () {
  // Start Lottie animation
  var lottieContainer = document.getElementById("lottie-background");
  if (lottieContainer) {
    try {
      // lottie.loadAnimation({
      //   container: lottieContainer,
      //   renderer: "svg",
      //   loop: true,
      //   autoplay: true,
      //   path: "download_bg.json",
      // });
    } catch (e) {
      console.error("Lottie animation error:", e);
    }
  }
};

// Smoothly animate progress bar to increase percent
Navigation.updateDownloadProgress = function (targetPercent) {
  var progressBar = document.querySelector(".downloading-progress-fill");
  var downloadText = document.querySelector(".downloading-progress-text");

  if (!progressBar || !downloadText) {
    console.error("Progress elements not found in DOM");
    return;
  }

  var current = parseInt(progressBar.style.width) || 0;

  // Only one animation may run at a time. Each milestone (30/50/60/80/95/100)
  // used to start its own setInterval, so overlapping animations fought over
  // the same element and each re-read `current` from the DOM - which on a busy
  // main thread makes the bar crawl or stall.
  if (Navigation._progressTimer) {
    clearInterval(Navigation._progressTimer);
    Navigation._progressTimer = null;
  }

  if (current >= targetPercent) {
    if (targetPercent === 100) downloadText.innerHTML = "Download complete!";
    return;
  }

  // Animate from current to targetPercent.
  // 20ms per 1% is fine on a PC but the TV coalesces short timers whenever the
  // main thread is busy with XHR and IndexedDB writes, so the bar falls far
  // behind real progress. Step by elapsed TIME rather than by fixed increments
  // so the bar tracks the work regardless of how often the timer actually runs.
  var startPercent = current;
  var startTime    = Date.now();
  var span         = targetPercent - startPercent;
  var DURATION_MS  = Math.max(300, span * 20);

  Navigation._progressTimer = setInterval(function () {
    var elapsed = Date.now() - startTime;
    var pct     = startPercent + Math.round(span * Math.min(1, elapsed / DURATION_MS));

    if (pct >= targetPercent) {
      pct = targetPercent;
      clearInterval(Navigation._progressTimer);
      Navigation._progressTimer = null;
      if (targetPercent === 100) {
        progressBar.style.width = "100%";
        downloadText.innerHTML = "Download complete!";
        return;
      }
    }

    progressBar.style.width = pct + "%";
    downloadText.innerHTML = "Downloaded " + pct + "%";
  }, 50);
};

// Activation screen — only active key is OK on the Retry button, which is shown
// once the automatic provision-auth retries are exhausted.
Navigation.activationPageNavigation = function (event) {
  var keycode = window.event ? event.keyCode : event.which;
  var retryBtn = document.getElementById("retryBtn");

  if (keycode == tvKeyCode.Enter && retryBtn && retryBtn.style.display !== "none") {
    console.log("Retry pressed — restarting device registration.");
    macro("#refreshTimer").text("Retrying activation...");
    macro("#retryBtn").css("display", "none");
    Main.provisionRetryCount = 0;
    Main.deviceRegistrationAPi();
  }
};

Navigation.languagePageNavigation = function (event) {
  var keycode = window.event ? event.keyCode : event.which;
  var id = macro(".imageFocus").attr("id");

  /**
   * Updates the language-selection page texts (.top_texts_welcom,
   * .language-guest-message, .select_lan, .terms_cond) based on the
   * language button at index `btnIndex`.
   *
   * caption_text and guest_message come from the page_caption template
   * and are resolved through resolvePlaceholders so that any
   * {{propertyName}} / {{guestName}} tokens are filled in correctly.
   *
   * Fallback strings are used when page_caption is not configured.
   */
  function updatePageTexts(btnIndex) {
    var btn = macro("#lang_btn-" + btnIndex);
    if (!btn.length) return;

    var langName = btn.find(".lang-text").text().toUpperCase();

    var pageCaption = (Main.templateApiData && Main.templateApiData.page_caption) || {};
    var captionText  = resolvePlaceholders(pageCaption.caption_text  || "");
    var guestMessage = resolvePlaceholders(pageCaption.guest_message || "");

    // Language-specific overrides for select / terms strings
    var selectText, termsText;

    if (langName === "FRENCH") {
      if (!captionText) captionText = "Bienvenue";
      selectText = "Veuillez sélectionner votre langue";
      termsText  = "Vous acceptez nos termes et conditions ainsi que notre politique de confidentialité.";
    } else if (langName === "SPANISH") {
      if (!captionText) captionText = "Bienvenidos";
      selectText = "Seleccione su idioma";
      termsText  = "Acepta nuestros términos y condiciones y nuestra política de privacidad.";
    } else {
      // Default / English
      if (!captionText) captionText = "Welcome Dear Guest";
      selectText = "Please Select Your Language";
      termsText  = "By clicking, you agree to our Terms & Conditions and Privacy Policy.";
    }

    macro(".top_texts_welcom").text(captionText || "");
    // Only update guest message element if it exists
    if (guestMessage) {
        macro(".language-guest-message").text(guestMessage).show();
    } else {
        macro(".language-guest-message").text("").hide();
    }
    macro(".select_lan").text(selectText);
    macro(".terms_cond").text(termsText);

    console.log("[languagePageNavigation] lang:", langName, "| caption:", captionText, "| message:", guestMessage);
  }

  switch (keycode) {
    case tvKeyCode.ArrowLeft: {
      var splitData = id.split("-");
      var prevIndex = parseInt(splitData[1]) - 1;
      if (macro("#lang_btn-" + prevIndex).length > 0) {
        macro(".imageFocus").removeClass("imageFocus");
        macro("#lang_btn-" + prevIndex).addClass("imageFocus");
        updatePageTexts(prevIndex);
      }
      break;
    }
    case tvKeyCode.ArrowRight: {
      var splitData = id.split("-");
      var nextIndex = parseInt(splitData[1]) + 1;
      if (macro("#lang_btn-" + nextIndex).length > 0) {
        macro(".imageFocus").removeClass("imageFocus");
        macro("#lang_btn-" + nextIndex).addClass("imageFocus");
        updatePageTexts(nextIndex);
      }
      break;
    }
    case tvKeyCode.ArrowUp: {
      break;
    }
    case tvKeyCode.ArrowDown: {
      break;
    }
    // case tvKeyCode.Enter: {
    //   console.log("called----------------------->")
    //   var uuid = macro(".imageFocus").attr("uuid");
    //   presentPagedetails.clickedLanguage = uuid;
    //   Main.clickedLanguage = uuid;

    //   var textOfLang = id ? document.getElementById(id).textContent : "";

    //   // 1) Try fully-cached menu for this language
    //   var cached = (Main.cachedHomeByLang && Main.cachedHomeByLang[uuid]) || [];

    //   if (cached.length > 0){
    //     // Already image-cached items for this language
    //     Main.renderHomePage(cached);
    //     break;
    //   }

    //   // 2) If we already have the raw homePageData, filter/sort for this language
    //   if (Array.isArray(Main.homePageData) && Main.homePageData.length) {
    //     var items = Main.homePageData
    //       .filter(function (x) {
    //         return x && x.is_active === true && x.language_uuid === uuid;
    //       })
    //       .sort(function (a, b) {
    //         return (a.priority_order || 0) - (b.priority_order || 0);
    //       });

    //     if (items.length) {
    //       // Ensure images for this language are pulled from IndexedDB (no extra API)
    //       Main.cacheHomeImageAssetsByLanguage(
    //         items,
    //         uuid,
    //         function (cachedGroup) {
    //           Main.cachedHomeByLang[uuid] = cachedGroup || [];
    //           Main.renderHomePage(Main.cachedHomeByLang[uuid]);
    //         }
    //       );
    //       break;
    //     }
    //   }

    //   // 3) Last resort: we do not have data yet at fetch once, then render
    //   Main.getHomeData(function () {
    //     console.log("getHomeData called----------------------------->")
    //     var items2 = (Main.cachedHomeByLang && Main.cachedHomeByLang[uuid]) || [];
    //     if (items2.length) {
    //       Main.renderHomePage(items2);
    //     } else {
    //       console.error("No cached items available for language:", uuid);
    //     }
    //   });

    //   break;
    // }

    // used when device is completly offline at start
    case tvKeyCode.Enter: {
      console.log("called----------------------->")
      var uuid = macro(".imageFocus").attr("uuid");
      presentPagedetails.clickedLanguage = uuid;
      Main.clickedLanguage = uuid;

      var textOfLang = id ? document.getElementById(id).textContent : "";

      // Detect offline: provision-auth failed and we booted from localStorage cache
      var isOffline = !!Main._restoredFromCache;

      // Build filtered+sorted raw items for this language from homePageData
      var rawItems = [];
      if (Array.isArray(Main.homePageData) && Main.homePageData.length) {
        rawItems = Main.homePageData
          .filter(function (x) { return x && x.is_active === true && x.language_uuid === uuid; })
          .sort(function (a, b) { return (a.priority_order || 0) - (b.priority_order || 0); });
      }

      // Helper: load images from IDB (idbOnly=true when offline) then render.
      // Always re-reads blobs from IDB even when cachedHomeByLang exists because
      // blob: URLs are ephemeral and do not survive a cold TV reboot.
      function loadAndRender(items) {
        console.log("loadAndRender called-------------------------->")
        Main.cacheHomeImageAssetsByLanguage(items, uuid, function (cachedGroup) {
          Main.cachedHomeByLang = Main.cachedHomeByLang || {};
          Main.cachedHomeByLang[uuid] = cachedGroup || [];
          Main.renderHomePage(Main.cachedHomeByLang[uuid]);
        }, isOffline /* idbOnly — no XHR when offline */);
      }

      // Path 1 & 2: homePageData is available (online or restored from localStorage)
      if (rawItems.length > 0) {
        loadAndRender(rawItems);
        break;
      }

      // Path 3: no homePageData at all
      if (isOffline) {
        // Cannot fetch from network — nothing to show
        console.error('[Offline] No homePageData available for language:', uuid);
        break;
      }

      // Online fallback: fetch from network then render
      Main.getHomeData(function () {
        console.log("getHomeData called----------------------------->")
        var items2 = (Main.cachedHomeByLang && Main.cachedHomeByLang[uuid]) || [];
        if (items2.length) {
          Main.renderHomePage(items2);
        } else {
          console.error("No cached items available for language:", uuid);
        }
      });

      break;
    }

    case 8:
    case tvKeyCode.Return:
    case 10009: {
      break;
    }
  }
};

Navigation.homePageLoad = function (menuData) {
  // defensive: ensure menuData is an array
  if (!menuData || !menuData.length) {
    var emptyContainer = document.getElementById("menu-inner");
    if (emptyContainer) emptyContainer.innerHTML = "";
    utilities.updatingTimeAndDate();
    return;
  }

  // Filter only active items, make a shallow copy so we can splice safely
  var activeMenus = menuData
    .filter(function (item) {
      return item && item.is_active === true;
    })
    .slice();

  // Sort by priority
  activeMenus.sort(function (a, b) {
    return (a.priority_order || 0) - (b.priority_order || 0);
  });

  var menuHTML = "";
  var subtitleLimit = macro(window).width() === 1280 ? 25 : 43;

  for (var i = 0; i < activeMenus.length; i++) {
    var item = activeMenus[i];

    // If the item object is missing, remove it and step index back
    if (!item) {
      activeMenus.splice(i, 1);
      i--;
      continue;
    }

    // If lg_app_id is missing/empty, remove it and step index back so we won't skip next item
    var lg = (item.lg_app_id || "") + "";
    if (lg.trim() === "") {
      activeMenus.splice(i, 1);
      i--;
      continue;
    }

    // Build markup for this (valid) item  use current i so IDs are contiguous
    var bgImage =
      item._cached_bg_image || item.bg_image || "images/bg_menu1.png";
    var iconImage = item._cached_icon || item.icon || "";

    var subTitle = item.sub_title || "";
    var truncatedSubTitle =
      subTitle && subTitle.length > subtitleLimit
        ? subTitle.substring(0, subtitleLimit) + "..."
        : subTitle;

    var title = (item.title || "APP") + ""; // ensure string
    var displayTitle =
      title.length > 11 ? title.substring(0, 11) + "..." : title;

    // Use double-quoted JS strings; single quotes inside onerror for image src
    menuHTML +=
      '<div id="menu-item-' +
      i +
      '" appUrl="' +
      (item.lg_app_id || "") +
      '" app_url="' +
      (item.app_url || "") +
      '" source="' +
      (item.name || "") +
      '" class="menu-item">' +
      "<div>" +
      '<img src="' +
      bgImage +
      '" class="menu_inside_icon" alt="BG" onerror="this.onerror=null;this.src=\'images/bg_menu1.png\';" />' +
      '<div class="menu-upside-wrapper">' +
      '<img src="' +
      iconImage +
      '" class="menu_upside_icon" alt="Icon" onerror="this.onerror=null;this.src=\'\';" />' +
      "</div>" +
      '<div class="menu-text">' +
      "<span>" +
      displayTitle +
      "</span>" +
      "<p>" +
      truncatedSubTitle +
      "</p>" +
      "</div>" +
      "</div>" +
      '<div class="focus-glow">' +
      '<div class="focus_glow_inner"></div>' +
      "</div>" +
      "</div>";
  }

  var container = document.getElementById("menu-inner");
  if (container) {
    container.innerHTML = menuHTML;
  } else {
    console.warn("Navigation.homePageLoad: #menu-inner not found");
  }

  utilities.updatingTimeAndDate();
};

Navigation.homePageNavigation = function (event) {
  var keycode = window.event ? event.keyCode : event.which;
  var focusedItem = macro(".imageFocus");
  var id = focusedItem.attr("id");
  var source = focusedItem.attr("source");
  var appUrl = focusedItem.attr("appUrl");
  var app_url = focusedItem.attr("app_url");

  console.log("keycode, id, source, appUrl", keycode, id, source, appUrl);

  if (!id) {
    // If no focus, set focus to first menu item
    macro("#menu-item-0").addClass("imageFocus");
    return;
  }

  var splitData = id.split("-");
  var currentIndex = parseInt(splitData[2]);

  var items = macro(".menu-item");
  var totalCards = items.length;
  var maxVisibleCards = 5; // Number of cards visible in one view
  var slideWidth = macro(".menu-item").outerWidth(true); // Include margin
  var container = macro(".menu-inner");

  switch (keycode) {
    case tvKeyCode.ArrowRight: {
      if (splitData[0] === "menu") {
        if (currentIndex >= totalCards - 1) break;

        // stopClockInterval();
        // clearTimeout(restartTimeout);

        var nextIndex = currentIndex + 1;
        macro(".imageFocus").removeClass("imageFocus");
        macro("#menu-item-" + nextIndex).addClass("imageFocus");
        currentIndex = nextIndex;

        // Smart sliding logic for right direction
        // Only slide if we are before the last set of visible cards
        if (currentIndex <= totalCards - maxVisibleCards) {
          var newPosition = -currentIndex * slideWidth;
          macro(".menu-inner").css({
            transition: "transform 0.5s ease",
            transform: "translateX(" + newPosition + "px)",
          });
        }

        // restartTimeout = setTimeout(startClockInterval, 550);
      }
      break;
    }

    case tvKeyCode.ArrowLeft: {
      if (splitData[0] === "menu") {
        if (currentIndex <= 0) break;

        // stopClockInterval();
        // clearTimeout(restartTimeout);

        var prevIndex = currentIndex - 1;
        macro(".imageFocus").removeClass("imageFocus");
        macro("#menu-item-" + prevIndex).addClass("imageFocus");
        currentIndex = prevIndex;

        // Smart sliding logic for left direction
        // Only slide when the focus is before the last visible card from left
        if (currentIndex < totalCards - maxVisibleCards) {
          var newPosition = -currentIndex * slideWidth;
          macro(".menu-inner").css({
            transition: "transform 0.5s ease",
            transform: "translateX(" + newPosition + "px)",
          });
        }

        // restartTimeout = setTimeout(startClockInterval, 550);
      }
      break;
    }

    case tvKeyCode.ArrowUp: {
      // stopClockInterval();
      // clearTimeout(restartTimeout);
      if (splitData[0] == "menu") {
        macro(".imageFocus").removeClass("imageFocus");
        macro("#lang_change_icon").addClass("imageFocus");
        macro("#top-right_langIcon").addClass("imageFocus");
        Navigation.previousCardFocus(parseInt(splitData[2]));
      }
      // setTimeout(startClockInterval, 500); // restart after animation completes
      break;
    }

    case tvKeyCode.ArrowDown: {
      // stopClockInterval();
      if (id == "lang_change_icon" && !!presentPagedetails.previousCardFocus) {
        macro(".imageFocus").removeClass("imageFocus");
        macro(
          "#menu-item-" + parseInt(presentPagedetails.previousCardFocus.row)
        ).addClass("imageFocus");
      } else if (id == "lang_change_icon") {
        macro(".imageFocus").removeClass("imageFocus");
        macro("#menu-item-0").addClass("imageFocus");
      }
      // restartTimeout = setTimeout(startClockInterval, 500);
      break;
    }

    // =====================================================
    // CHANNEL UP / DOWN — open Live TV directly from home
    // =====================================================
    case tvKeyCode.ChannelUp:
    case tvKeyCode.ChannelDown: {
      console.log('[Home] ChannelUp/Down pressed — launching Live TV');
      var comingfromWatchTvApp = true;
      Main.liveTvChannelIdApi(comingfromWatchTvApp);
      break;
    }

    // =====================================================
    // GUIDE KEY (458) — open Live TV + show channel guide from home
    // =====================================================
    case tvKeyCode.Guide: {
      console.log('[Home] Guide pressed — launching Live TV + channel guide');

      Main.liveTvChannelIdApi(true);

      setTimeout(function () {
        if (presentPagedetails.liveTvChannelIdDetails &&
            presentPagedetails.liveTvChannelIdDetails.length > 0) {
          presentPagedetails.showingLiveTvGuide = true;
          presentPagedetails.lastLiveChannelIndex = presentPagedetails.savedLiveChannelIndex || 0;
          macro('#mainContent').html('');
          macro('#mainContent').html(Util.liveTvGuideFullScreen(
            presentPagedetails.liveTvChannelIdDetails,
            presentPagedetails.liveTvChannelMetaDetails
          ));
          macro('#mainContent').show();
          var chIdx = presentPagedetails.lastLiveChannelIndex || 0;
          macro('#live-tv-channel-row-' + chIdx).addClass('live-channel-row-focused');
          Navigation.scrollLiveTvChannelIntoViewInstant(chIdx);
        }
      }, 500);

      break;
    }

    case tvKeyCode.Netflix: {
      checkNetworkAndLaunch("Netflix" , function () {
        try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}
        // SAMSUNG: tizen.application.launchAppControl() carries the launch
        // payload that LG passed as a "parameters" JSON string.
        tizen.application.launchAppControl(
          new tizen.ApplicationControl(
            "http://tizen.org/appcontrol/operation/default", null, null, null,
            [new tizen.ApplicationControlData("payload",
              ["reason=launcher&hotel_id=GRE1234&launcher_version=1.0"])]),
          Main.lgSettings.netflix_app_id,
          function() {
            Main.deviceActivity("open","app",source);
            console.log("Netflix Opend successfully")
          },
          function(err) {
            console.log("Netflix launch failed: " + (err && err.message));
          }
        )
      })
    }

    case tvKeyCode.Youtube: {
      checkNetworkAndLaunch("Youtube" , function () {
        try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}
        // SAMSUNG: tizen.application.launch(appId, onSuccess, onError)
        tizen.application.launch(
          Main.lgSettings.youtube_app_id,
          function() {
            Main.deviceActivity("open","app",source);
            console.log("YouTube launched successfully");
          },
          function (f) {
            console.log("YouTube not loaded:", f && f.message);
          }
        )
      })
    }

    case tvKeyCode.Casting: {
      checkNetworkAndLaunch("Casting", function () {
        try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}
        Main.handleGoogleCast();
      })
    }

    case tvKeyCode.Enter: {
      // if (splitData[0] === "menu" && appUrl) {
      //     console.log('Launching app:', source, 'with URL:', appUrl);
      //     // Add your app launch logic here
      //     // Main.launchApp(appUrl, source);
      // }

      console.log("appUrl------------------>", appUrl);

      if (id == "lang_change_icon") {
        var comingFromHomeLang = true;
        Main.deviceActivity("open","page","welcome screen");
        Main.getTemplateApiData(comingFromHomeLang);

      }
      else if (appUrl === "hdmi") {
        Main.addBackData("MyDevice");
        view = "MyDevice"
        presentPagedetails.view = view;
        Main.deviceActivity("open","page",source);
        Util.DevicesSwitchPage();
      }
      else if (appUrl === "Netflix") {
        checkNetworkAndLaunch("Netflix" , function () {
          try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}
          // SAMSUNG: tizen.application.launchAppControl() carries the launch
          // payload that LG passed as a "parameters" JSON string.
          tizen.application.launchAppControl(
            new tizen.ApplicationControl(
              "http://tizen.org/appcontrol/operation/default", null, null, null,
              [new tizen.ApplicationControlData("payload",
                ["reason=launcher&hotel_id=GRE1234&launcher_version=1.0"])]),
            Main.lgSettings.netflix_app_id,
            function() {
              Main.deviceActivity("open","app",source);
              console.log("Netflix Opend successfully")
            },
            function(err) {
              console.log("Netflix launch failed: " + (err && err.message));
            }
          )
        })
      }
      else if (appUrl === "Youtube") {
        checkNetworkAndLaunch("Youtube" , function () {
          try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}
          // SAMSUNG: tizen.application.launch(appId, onSuccess, onError)
          tizen.application.launch(
            "com.samsung.tv.cobalt-yt",
            function() {
              Main.deviceActivity("open","app",source);
              console.log("YouTube launched successfully");
            },
            function (f) {
              console.log("YouTube not loaded:", f && f.message);
            })
        }) 
      }
      else if(appUrl === "accuweather") {
        try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}
        // SAMSUNG: tizen.application.launch(appId, onSuccess, onError)
        tizen.application.launch(
          Main.lgSettings.accuweather_app_id,
          function() {
            Main.deviceActivity("open","app",source);
            console.log("accuweather launched successfully")
          },
          function (f) {
            console.log("accuweather not loaded:", f && f.message)
          })
      }
      else if(appUrl === "com.fubotv.app") {
        ensureAppInstalled("com.fubotv.app");
      }
      else if(appUrl === "com.haystacktv.app") {
        ensureAppInstalled("com.haystacktv.app");
      }
      else if(appUrl === "com.5403008.196062") {
        ensureAppInstalled("com.5403008.196062");
      }
      else if(appUrl === "tv.amasian.webos.na1.commercial") {
        ensureAppInstalled("tv.amasian.webos.na1.commercial");
      }
      else if(appUrl === "com.webos.app.commercial.clock") {
        ensureAppInstalled("com.webos.app.commercial.clock");
      }
      else if(appUrl === "cdp") {
        ensureAppInstalled("cdp");
      }
      else if(appUrl === "com.aajtak.app") {
        ensureAppInstalled("com.aajtak.app");
      }
      else if(appUrl === "com.airwave.lg") {
        ensureAppInstalled("com.airwave.lg");
      }
      else if(appUrl === "com.espial.elevate.webos.moby") {
        ensureAppInstalled("com.espial.elevate.webos.moby");
      }
      else if(appUrl === "Cleardata") {
        Main.popupData = {}
        Main.popupData.popuptype = "clearData"
        macro("#popUpFDFS").html(Util.clearDataPage());
        macro("#popupBtn-0").addClass('popupFocus');
        Main.deviceActivity("open","page",source);
      }
      else if(appUrl === "Casting") {
        checkNetworkAndLaunch("Casting", function () {
          try { if (typeof ScreenSaver !== 'undefined') ScreenSaver.clearIdleTimer(); } catch(e) {}
          Main.handleGoogleCast();
        })
      }
      else if (appUrl === "LGTV") {
        checkNetworkAndLaunch("LG TV", function () {
          var comingfromWatchTvApp = true;
          Main.deviceActivity("open","app",source);
          console.log("LGTV app launched");
          Main.lgLgChannelIdApi(comingfromWatchTvApp)
        })
      }
      else if (appUrl === "LIVETV") {
        var comingfromWatchTvApp = true;
        Main.deviceActivity("open","app",source);
        Main.liveTvChannelIdApi(comingfromWatchTvApp)
      }
      else if (appUrl === "OurHotel") {
        checkNetworkAndLaunch("Our Hotel", function () {
          Main.deviceActivity("open","page",source);
          Main.jsontemplateApi(app_url);
        })
      }
      else if (appUrl === "Playlist") {
        checkNetworkAndLaunch("Playlist", function () {
          Main.deviceActivity("open","page",source);
          Main.playlistApi(app_url);
        })
      }

      break;
    }

    case 8:
    case tvKeyCode.Return:
    case 10009: {
      // Handle back button
      console.log("Back button pressed from home page");
      break;
    }
  }
};

/**
 * ====================================================================
 * ENHANCED NAVIGATION FOR OURHOTEL PAGE
 * Integrates with CanvasAction for remote control navigation
 * ====================================================================
 */

// Add this to your Navigation object in navigation.js

/**
 * Navigation handler for OurHotel page with action buttons
 */
Navigation.ourHotelPageNavigation = function (event) {
    var key = getKeyCode(event).keycode;

    console.log('[Navigation] OurHotel key pressed:', key);

    switch (key) {
        case tvKeyCode.ArrowUp:
            console.log('[Navigation] Arrow Up');
            if (typeof CanvasAction !== 'undefined' && CanvasAction.moveFocus) {
                CanvasAction.moveFocus('up');
            }
            break;

        case tvKeyCode.ArrowDown:
            console.log('[Navigation] Arrow Down');
            if (typeof CanvasAction !== 'undefined' && CanvasAction.moveFocus) {
                CanvasAction.moveFocus('down');
            }
            break;

        case tvKeyCode.ArrowLeft:
            console.log('[Navigation] Arrow Left');
            if (typeof CanvasAction !== 'undefined' && CanvasAction.moveFocus) {
                CanvasAction.moveFocus('left');
            }
            break;

        case tvKeyCode.ArrowRight:
            console.log('[Navigation] Arrow Right');
            if (typeof CanvasAction !== 'undefined' && CanvasAction.moveFocus) {
                CanvasAction.moveFocus('right');
            }
            break;

        case tvKeyCode.Enter:
            console.log('[Navigation] Enter pressed');
            if (typeof CanvasAction !== 'undefined' && CanvasAction.executeAction) {
                CanvasAction.executeAction();
            }
            break;

        case tvKeyCode.Return:
        case tvKeyCode.Exit:
        case 8:
        case 461:
        case 10009:
            console.log('[Navigation] Exiting OurHotel page');

            // ── Only show the line loader when navigating canvas→canvas.
            //    If pageHistory is empty we are on the last canvas page and
            //    navigateBackCanvas() will call Main.previousPage() which goes
            //    straight to home/language page — no loader needed there.
            var _hasCanvasHistory = Array.isArray(Main.pageHistory) && Main.pageHistory.length > 0;

            var _exitLoadStart       = Date.now();
            var _EXIT_LOADING_MIN_MS = 1200;

            if (_hasCanvasHistory) {
                try { _showCanvasLineLoader(); } catch (e) {}
            }

            setTimeout(function () {

                // Stop HLS streams
                try {
                    if (typeof CanvasAction !== 'undefined' && CanvasAction.stopHlsBackgroundVideos) {
                        CanvasAction.stopHlsBackgroundVideos();
                    }
                } catch (e) {}

                // Full canvas/overlay cleanup
                try {
                    if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.cleanup) {
                        CanvasRenderer.cleanup();
                    }
                } catch (e) {
                    try { if (typeof CanvasBackground !== 'undefined') CanvasBackground.cleanup(); } catch (_) {}
                    try { if (typeof CanvasAction    !== 'undefined') CanvasAction.cleanup();     } catch (_) {}
                }

                // Remove bg-video-wrap explicitly
                try {
                    var _bgWrap = document.getElementById('bg-video-wrap');
                    if (_bgWrap && _bgWrap.parentNode) { _bgWrap.parentNode.removeChild(_bgWrap); }
                } catch (e) {}

                // Restore body background
                try { document.body.style.background = ''; } catch (e) {}

                try {
                  Main.deviceActivity("open", "page", "Home screen");
                }catch(e) {}

                // Navigate back
                if (typeof Main !== 'undefined' && Main.navigateBackCanvas) {
                    Main.navigateBackCanvas();
                } else if (typeof Main !== 'undefined' && Main.previousPage) {
                    Main.previousPage();
                }

                // Hide loader only when it was shown (canvas→canvas path)
                if (_hasCanvasHistory) {
                    var _elapsed   = Date.now() - _exitLoadStart;
                    var _remaining = _EXIT_LOADING_MIN_MS - _elapsed;
                    if (_remaining > 0) {
                        setTimeout(function () {
                            try { _hideCanvasLineLoader(); } catch (e) {}
                        }, _remaining);
                    } else {
                        try { _hideCanvasLineLoader(); } catch (e) {}
                    }
                }

            }, 100);

            break;
    }
};

/**
 * Initialize navigation when OurHotel page loads
 */
Navigation.initializeOurHotelNavigation = function() {
    console.log('[Navigation] Initializing OurHotel navigation');
    
    // Wait for canvas to render
    setTimeout(function() {
        try {
            if (typeof Main !== 'undefined' && 
                Main.jsonTemplateData && 
                Main.jsonTemplateData.template_json &&
                Main.jsonTemplateData.template_json.elements) {
                
                var elements = Main.jsonTemplateData.template_json.elements;
                
                // Initialize action navigation
                if (typeof CanvasAction !== 'undefined' && CanvasAction.initializeNavigation) {
                    CanvasAction.initializeNavigation(elements);
                    
                    // Refresh canvas to show initial focus
                    if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.refresh) {
                        CanvasRenderer.refresh();
                    }
                }
                
                console.log('[Navigation] OurHotel navigation initialized successfully');
            }
        } catch (e) {
            console.error('[Navigation] Failed to initialize OurHotel navigation:', e);
        }
    }, 500);
};

/**
 * ====================================================================
 * PLAYLIST PAGE NAVIGATION
 * The slideshow advances automatically by timer.
 * Only EXIT / BACK stops the player and returns to the previous page.
 * ====================================================================
 */
Navigation.playlistPageNavigation = function (event) {
    var key = getKeyCode(event).keycode;
    console.log('[Navigation] Playlist key pressed:', key);

    switch (key) {
        case tvKeyCode.Return:
        case tvKeyCode.Exit:
        case 8:
        case 461:
        case 10009:
            console.log('[Navigation] EXIT – stopping playlist player');
            if (typeof PlaylistPlayer !== 'undefined' && PlaylistPlayer.isActive()) {
                try {
                  Main.deviceActivity("open","page","Home screen");
                }catch(e) {}
                PlaylistPlayer.stop();
            } else {
                try {
                  Main.deviceActivity("open","page","Home screen");
                }catch(e) {}
                Main.previousPage();
            }
            break;

        default:
            break;
    }
};




function stopAndClearMedia() {
  // NOTE: window._currentHcapMedia used to hold an hcap.Media OBJECT with
  // .stop({onSuccess}) / .destroy({onSuccess}). Under avplay it holds only the
  // URL STRING, so the old callback-style calls threw "not a function" on
  // every teardown and the real stop never ran. avplay is a singleton - the
  // module-level calls below are the whole teardown.
  try {
    if (typeof webapis === 'undefined' || !webapis.avplay) {
      window._currentHcapMedia = null;
      return;
    }

    var state = 'NONE';
    try { state = webapis.avplay.getState(); } catch (e) {}
    console.log('[avplay] stopAndClearMedia, state:', state);

    if (state === 'PLAYING' || state === 'PAUSED') {
      try { webapis.avplay.stop(); } catch (e) { console.warn('[avplay] stop threw', e); }
    }
    if (state !== 'NONE') {
      try { webapis.avplay.close(); } catch (e) { console.warn('[avplay] close threw', e); }
    }
  } catch (err) {
    console.warn('[avplay] stopAndClearMedia error', err);
  }

  window._currentHcapMedia = null;

  // Video plane is released - put the opaque app background back so the next
  // non-video screen does not render over a black video surface.
  try {
    if (Navigation && Navigation._restoreAppLayerBackground) {
      Navigation._restoreAppLayerBackground();
    }
  } catch (e) {}
}

Navigation.deviceSwitchNavigation = function (event) {
  console.log("called------------------->")
  var keycode = (window.event) ? event.keyCode : event.which;
  var focused = macro('.imageFocus');
  if (!focused || focused.length === 0) return;
  var id = focused.attr("id");
  console.log("id------------->", id)
  if(!id) return;

  var cards = document.querySelectorAll('.device-card');
  var total = cards ? cards.length : 0;
  var parts = id.split("-");
  var idx = parseInt(parts[2], 10);
  if (isNaN(idx)) idx = 0;

  switch (keycode) {
    case tvKeyCode.ArrowLeft: {
      if (idx > 0) {
        macro('.imageFocus').removeClass('imageFocus');
        macro("#device-btn-" + (idx - 1)).addClass('imageFocus');
      }
      break;
    }
    case tvKeyCode.ArrowRight: {
      if (idx < total - 1) {
        macro('.imageFocus').removeClass('imageFocus');
        macro("#device-btn-" + (idx + 1)).addClass('imageFocus');
      }
      break;
    }
    case tvKeyCode.ArrowUp: {
      break;
    }
    case tvKeyCode.ArrowDown: {
      break;
    }
    case tvKeyCode.Enter: {
      var el = document.getElementById(id);
      if (!el) break;

      var action = el.getAttribute("data-action");

      if(action === "input") {
        var attr = el.getAttribute("data-type");
        var type = isNaN(parseInt(attr, 10)) ? attr : parseInt(attr, 10);
        var index = parseInt(el.getAttribute("data-index"), 10);

        console.log('[HDMI] Entering HDMI input mode - type:', type, 'index:', index);

        // âœ… STEP 1: Save original input FIRST
        // SAMSUNG: tizen.tvwindow.getSource() is synchronous and returns
        // { type: 'TV'|'HDMI'|..., number: n }.
        if (typeof tizen !== "undefined" && tizen.tvwindow) {
          try {
            var res = tizen.tvwindow.getSource();
            window._originalTvInput = {
              type: res.type,
              index: res.number
            };
            console.log('[HDMI] Saved original input:', window._originalTvInput);
          } catch(e) {
            console.warn('[HDMI] Exception getting current input:', e);
            // Default fallback - assume TV input
            window._originalTvInput = {
              type: 'TV',
              index: 0
            };
            console.log('[HDMI] Using fallback input:', window._originalTvInput);
          }
        }

        // STEP 2: Save back data and set view
        Main.addBackData("liveTv");
        view = "liveTv";
        presentPagedetails.view = view;

        // STEP 3: Show empty page
        macro("#mainContent").html(Util.hdmiInputEmptyPage());
        macro("#mainContent").show();
        document.body.style.background = "none";

        // STEP 4: Switch to HDMI input
        // SAMSUNG: no HCAP mode step - only the source switch is needed.
        // tizen.tvwindow.setSource({ type: 'HDMI', number: n }).
        if (typeof tizen !== "undefined" && tizen.tvwindow) {
          try {
            tizen.tvwindow.setSource({ type: 'HDMI', number: index },
              function () {
                console.log('[HDMI] Switched to HDMI input type=' + type + ' index=' + index);
                startHdmiMonitor(type, index);
              },
              function (f) {
                console.error('[HDMI] Switch failed: ' + (f && f.message));
                Main.previousPage();
                window._originalTvInput = null;
              });
          } catch (e) {
            console.error('[HDMI] setSource threw: ' + (e && e.message));
            Main.previousPage();
            window._originalTvInput = null;
          }
        } else {
          console.warn('[HDMI] tizen.tvwindow not available');
          Main.previousPage();
        }
      }
      else if (action === "restart") {
        // rebootTv();
        // SAMSUNG: webapis.systemcontrol.rebootDevice() is synchronous and
        // requires the PARTNER systemcontrol privilege.
        try {
          if (typeof webapis !== "undefined" &&
              webapis.systemcontrol &&
              typeof webapis.systemcontrol.rebootDevice === "function") {
            console.log("Rebooting TV...");
            webapis.systemcontrol.rebootDevice();
          } else {
            console.error("rebootDevice unavailable (partner privilege required)");
          }
        }catch (e) {
          console.error("Reboot failed", e);
        }
      }
      else {
        // ensureAppInstalled("org.tizen.NetworkSpeaker");

        var speakerAppId = "com.samsung.tv.googlecast-app";
        console.log("[Bluetooth] action:", action, "- launching", speakerAppId);
        try {
          tizen.application.launch(
              speakerAppId,
              function () {
                console.log("[Bluetooth] " + speakerAppId + " launched successfully");
                try { Main.deviceActivity("open", "app", "Bluetooth"); } catch (e) { console.warn("deviceActivity threw", e); }
              },
              function (f) {
                console.log("[Bluetooth] " + speakerAppId + " launch failed:", f && f.name, f && f.message);
              });
        } catch (e) {
          console.log("[Bluetooth] launch threw:", e && e.name, e && e.message);
        }
      }
      break;
    }
    case tvKeyCode.Exit: {
      stopHdmiMonitor();
      // Stop any HCAP media and restore normal mode, then go back
      try { stopAndClearMedia(); } catch(e){ console.warn('stopAndClearMedia failed', e); }

      try { Main.previousPage(); } catch(e) { console.warn('Main.previousPage threw', e); }
      // SAMSUNG: no HCAP mode to restore - on Tizen the app window is always
      // composited above the video plane.
      break;
    }
    case 8:
    case tvKeyCode.Return:
    case 10009: {
      // Stop any HCAP media and restore normal mode, then go back
      stopHdmiMonitor();
      try { stopAndClearMedia(); } catch(e){ console.warn('stopAndClearMedia failed', e); }

      try{Main.deviceActivity("open", "page", "Home screen");} catch (e) { console.warn('deviceActivity threw', e); }

      try { Main.previousPage(); } catch(e) { console.warn('Main.previousPage threw', e); }
      // SAMSUNG: no HCAP mode to restore - on Tizen the app window is always
      // composited above the video plane.
      break;
    }

    default:
      break;
  }
}

Navigation.EmptyLiveNavigation = function (event) {
  var keycode = (window.event) ? event.keyCode : event.which;
  
  switch (keycode) {
    case tvKeyCode.ArrowLeft:
    case tvKeyCode.ArrowRight:
    case tvKeyCode.ArrowUp:
    case tvKeyCode.ArrowDown:
    case tvKeyCode.ChannelUp:
    case tvKeyCode.ChannelDown:
    case tvKeyCode.Enter: {
      break;
    }
    
    case 8:
    case tvKeyCode.Return:
    case tvKeyCode.Exit:
    case 10009: {
      console.log('[HDMI Exit] Starting HDMI exit sequence from EmptyLiveNavigation...');
      stopHdmiMonitor();
      
      // Step 1: Switch back to original source to stop HDMI audio.
      // SAMSUNG: tizen.tvwindow.setSource() replaces hcap.externalinput, and
      // there is no HCAP mode to restore afterwards.
      if (typeof tizen !== "undefined" && tizen.tvwindow) {
        try {
          var originalInput = window._originalTvInput || {
            type: 'TV',
            index: 0
          };

          console.log('[HDMI Exit] Switching back to original input:', originalInput);

          var restoreSource = { type: originalInput.type };
          if (originalInput.type === 'HDMI') {
            restoreSource.number = originalInput.index;
          }

          tizen.tvwindow.setSource(restoreSource,
            function () {
              console.log('[HDMI Exit] Successfully restored original input - HDMI audio stopped');

              // Step 2: Navigate back to previous page
              try {
                Main.previousPage();
                document.body.style.background = "#000";
              } catch(e) {
                console.warn('[HDMI Exit] Main.previousPage threw', e);
              }

              // Clear saved input
              window._originalTvInput = null;
            },
            function (f) {
              console.error('[HDMI Exit] Failed to restore original input:', f && f.message);

              // Even if the source switch fails, still clean up and go back
              try {
                Main.previousPage();
                document.body.style.background = "#000";
              } catch(e) {
                console.warn('[HDMI Exit] Navigation failed:', e);
              }

              window._originalTvInput = null;
            });
        } catch(e) {
          console.error('[HDMI Exit] Exception during HDMI exit:', e);

          // Fallback cleanup
          try {
            Main.previousPage();
            document.body.style.background = "#000";
          } catch(e2) {
            console.warn('[HDMI Exit] Fallback navigation failed:', e2);
          }

          window._originalTvInput = null;
        }
      } else {
        // tizen.tvwindow not available - just navigate back
        console.warn('[HDMI Exit] tizen.tvwindow not available - simple navigation (audio may continue)');

        try {
          Main.previousPage();
          document.body.style.background = "#000";
        } catch(e) {
          console.warn('[HDMI Exit] Simple navigation failed:', e);
        }
      }

      break;
    }
  }
}

Navigation.popupKeyhandler = function (event) {
  var keycode = (window.event) ? event.keyCode : event.which;
  var id = macro('.popupFocus').attr("id");

  switch (keycode) {
    case tvKeyCode.ArrowLeft: {
      splitData = id.split("-")
      if (splitData[0] == "popupBtn" && macro("#popupBtn-" + (parseInt(splitData[1]) - 1)).length > 0) {
        macro('.popupFocus').removeClass('popupFocus');
        macro("#popupBtn-" + (parseInt(splitData[1]) - 1)).addClass('popupFocus');
      }
      break;
    }

    case tvKeyCode.ArrowRight: {
      splitData = id.split("-")
      if(splitData[0] == "popupBtn" && macro("#popupBtn-" + (parseInt(splitData[1]) + 1)).length > 0) {
        macro('.popupFocus').removeClass('popupFocus');
        macro("#popupBtn-" + (parseInt(splitData[1]) + 1)).addClass('popupFocus');
      }
      break;
    }

    case tvKeyCode.ArrowUp: {
      break;
    }
    case tvKeyCode.ArrowDown: {
      break;
    }
    case tvKeyCode.Enter: {
      splitData = id.split("-")
      if(Main.popupData.popuptype === "clearData") {
        if(splitData[1] == 0){
          // Cancel Button
          macro("#popUpFDFS").html('');
          Main.popupData = {};
        }
        else if (splitData[1] == 1) {
          // Clear & Checkout (modern or fallback auto-handled)
          macro("#popUpFDFS").html('');
          Main.popupData = {};
          DisplayCheckOutScreen = true;
          CheckoutManager_requestCheckout();
        }
        else if (splitData[1] == 2) {
          // Clear only (legacy fallback always)
          macro("#popUpFDFS").html('');
          Main.popupData = {};
          DisplayCheckOutScreen = true;
          CheckoutManager_requestCheckout();
        }
      }else {
        macro("#popUpFDFS").html('');
        Main.popupData = {};
      }
       break;
    }

    case 8:
    case tvKeyCode.Return:
    case tvKeyCode.Exit:
    case 10009: {
      try {Main.deviceActivity("open", "page", "Home screen");} catch (e) { console.warn('deviceActivity threw', e); }
      macro("#popUpFDFS").html('');
      Main.popupData = {};
    }
  }
}

Navigation.castingPageNavigation = function (event) {
  var keycode = (window.event) ? event.keyCode : event.which;
  switch (keycode) {
    case tvKeyCode.ArrowLeft:
    case tvKeyCode.ArrowRight:
    case tvKeyCode.ArrowUp:
    case tvKeyCode.ArrowDown:
    case tvKeyCode.Enter: {
      break;
    }
    case tvKeyCode.Exit: {
      Main.previousPage();
      break;
    }
    case 8:
    case tvKeyCode.Return:
    case 10009: {
      Main.previousPage();
      break;
    }
  }
}

// ========================================
// TV GUIDE NAVIGATION
// ========================================

Navigation.lgLgDemoPlayers = function (event) {
  var keycode = (window.event) ? event.keyCode : event.which;
  
  if (presentPagedetails.showingTvGuide === true) {
    
    var focusMode = presentPagedetails.tvGuideFocusMode || 'genre';
    
    // ===== GENRE TAB NAVIGATION MODE =====
    if (focusMode === 'genre') {
      
      var focusedGenre = macro('.genre-focused');
      var currentGenreIndex = 0;
      
      if (focusedGenre && focusedGenre.length > 0) {
        var id = focusedGenre.attr('id');
        if (id) {
          var parts = id.split('-');
          currentGenreIndex = parseInt(parts[2], 10);
        }
      } else {
        macro('#genre-tab-0').addClass('genre-focused');
        return;
      }
      
      var totalGenres = macro('.tv-guide-genre-tab').length;
      
      switch (keycode) {
        
        case tvKeyCode.ArrowLeft: {
          if (currentGenreIndex > 0) {
            macro('.genre-focused').removeClass('genre-focused');
            macro('#genre-tab-' + (currentGenreIndex - 1)).addClass('genre-focused');
            Navigation.scrollGenreIntoView(currentGenreIndex - 1);
          }
          break;
        }
        
        case tvKeyCode.ArrowRight: {
          if (currentGenreIndex < totalGenres - 1) {
            macro('.genre-focused').removeClass('genre-focused');
            macro('#genre-tab-' + (currentGenreIndex + 1)).addClass('genre-focused');
            Navigation.scrollGenreIntoView(currentGenreIndex + 1);
          }
          break;
        }
        
        case tvKeyCode.ArrowDown: {
          console.log('Moving DOWN from genres to channels');
          presentPagedetails.tvGuideFocusMode = 'channel';
          
          // Remove genre-focused
          macro('.genre-focused').removeClass('genre-focused');
          
          // NOW add channel focus
          var firstChannel = macro('.tv-guide-channel-row').first();
          if (firstChannel.length) {
            firstChannel.addClass('channel-row-focused');
            presentPagedetails.lastChannelIndex = 0;
            var channelList = document.getElementById('tvGuideChannelsList');
            if (channelList) {
              channelList.scrollTop = 0;
            }
          }
          break;
        }
        
        case tvKeyCode.ArrowUp: {
          break;
        }
        
        case tvKeyCode.Enter: {
          var selectedGenreBtn = macro('#genre-tab-' + currentGenreIndex);
          var selectedGenre = selectedGenreBtn.attr('data-genre');
          
          // Remember selected genre
          presentPagedetails.selectedGenre = selectedGenre;
          
          // Update active class
          macro('.genre-active').removeClass('genre-active');
          selectedGenreBtn.addClass('genre-active');
          
          // Update ONLY channels list
          Navigation.updateChannelsOnly(selectedGenre);
          break;
        }
        
        case tvKeyCode.Exit:
        case 8:
        case tvKeyCode.Return:
        case 10009: {
          Navigation.closeTvGuide();
          break;
        }
      }
    }
    // ===== CHANNEL LIST NAVIGATION MODE =====
    else {
      
      var focusedRow = macro('.channel-row-focused');
      var currentIndex = 0;
      
      if (focusedRow && focusedRow.length > 0) {
        var id = focusedRow.attr('id');
        if (id) {
          var parts = id.split('-');
          currentIndex = parseInt(parts[3], 10);
          console.log("currentIndex122334----------------->", currentIndex);
        }
      } else {
        macro('#tv-channel-row-0').addClass('channel-row-focused');
        presentPagedetails.lastChannelIndex = 0;
        return;
      }
      
      // Remember last channel position
      presentPagedetails.lastChannelIndex = currentIndex;
      
      var totalChannels = macro('.tv-guide-channel-row').length;
      
      switch (keycode) {
        
        case tvKeyCode.ArrowUp: {
          console.log("currentIndex----------------->", currentIndex);
          console.log("totalChannels----------------->", totalChannels);
          if (currentIndex > 0) {
            macro('.channel-row-focused').removeClass('channel-row-focused');
            macro('#tv-channel-row-' + (currentIndex - 1)).addClass('channel-row-focused');
            presentPagedetails.lastChannelIndex = currentIndex - 1;
            Navigation.scrollChannelIntoView(currentIndex - 1);
          } else {
            console.log('At first channel, moving to genres');
            presentPagedetails.tvGuideFocusMode = 'genre';
            
            // Remove channel focus
            macro('.channel-row-focused').removeClass('channel-row-focused');
            
            // First remove any existing genre-focused class to ensure clean state
            macro('.genre-focused').removeClass('genre-focused');
            
            // Then add focus to the active genre (or first genre if none active)
            var activeGenre = macro('.genre-active');
            if (activeGenre.length) {
              activeGenre.addClass('genre-focused');
            } else {
              macro('#genre-tab-0').addClass('genre-focused');
            }
          }
          break;
        }
        
        case tvKeyCode.ArrowDown: {
          if (currentIndex < totalChannels - 1) {
            macro('.channel-row-focused').removeClass('channel-row-focused');
            macro('#tv-channel-row-' + (currentIndex + 1)).addClass('channel-row-focused');
            presentPagedetails.lastChannelIndex = currentIndex + 1;
            Navigation.scrollChannelIntoView(currentIndex + 1);
          }
          break;
        }
        
        case tvKeyCode.ArrowLeft:
        case tvKeyCode.ArrowRight: {
          break;
        }
        
        case tvKeyCode.Enter: {
          var selectedChannelRow = macro('#tv-channel-row-' + currentIndex);
          var channelId = selectedChannelRow.attr('data-channel-id');
          console.log('Channel selected:', channelId, 'Index:', currentIndex);
          
          // SAVE EXACT POSITION: genre, channel index, and focus mode
          presentPagedetails.savedGenre = presentPagedetails.selectedGenre;
          presentPagedetails.savedChannelIndex = currentIndex;
          presentPagedetails.savedFocusMode = 'channel';  // Return to channel mode
          
          // Find the selected channel in lgLgChannelIdDetails
          var selectedChannel = null;
          for (var i = 0; i < presentPagedetails.lgLgChannelIdDetails.length; i++) {
            if (String(presentPagedetails.lgLgChannelIdDetails[i].channel_id) === String(channelId)) {
              selectedChannel = presentPagedetails.lgLgChannelIdDetails[i];
              break;
            }
          }
          
          if (selectedChannel && selectedChannel.ch_media_static_url) {
            console.log('Playing channel:', selectedChannel.ch_name, 'URL:', selectedChannel.ch_media_static_url);
            
            // Store current channel index for overlay display
            presentPagedetails.currentChannelId = channelId;
            
            // Play the selected channel
            Navigation.playSelectedChannel(selectedChannel.ch_media_static_url);
          } else {
            console.warn('Channel URL not found for channel_id:', channelId);
          }
          
          // Navigate to overlay
          Navigation.closeTvGuide();
          break;
        }
        
        case tvKeyCode.Exit:
        case 8:
        case tvKeyCode.Return:
        case 10009: {
          Navigation.closeTvGuide();
          break;
        }
      }
    }
  } 
  // ===== OVERLAY MODE =====
  else {
    
    switch (keycode) {
      
      case tvKeyCode.ArrowUp:
      case tvKeyCode.ArrowDown: {
        console.log('Opening TV Guide from overlay');
        presentPagedetails.showingTvGuide = true;
        
        // RESTORE SAVED POSITION if available
        if (presentPagedetails.savedGenre) {
          presentPagedetails.selectedGenre = presentPagedetails.savedGenre;
          presentPagedetails.lastChannelIndex = presentPagedetails.savedChannelIndex || 0;
          presentPagedetails.tvGuideFocusMode = presentPagedetails.savedFocusMode || 'channel';
        } else {
          // First time opening
          presentPagedetails.selectedGenre = presentPagedetails.selectedGenre || 'All';
          presentPagedetails.tvGuideFocusMode = 'genre';
          presentPagedetails.lastChannelIndex = 0;
        }

        console.log("Navigation called");
        
        macro('#mainContent').html('');
        macro('#mainContent').html(Util.lgTvGuideFullScreen(presentPagedetails.lgLgChannelIdDetails, presentPagedetails.lgLgChannelMetaDetails));
        macro('#mainContent').show();
        
        // ðŸ”¥ INSTANT SCROLL - No setTimeout needed
        if (presentPagedetails.savedFocusMode === 'channel') {
          // Was in channel mode - restore channel focus
          var channelIndex = presentPagedetails.savedChannelIndex || 0;
          macro('#tv-channel-row-' + channelIndex).addClass('channel-row-focused');
          
          // ðŸ”¥ INSTANT scroll to focused channel WITHOUT smooth animation
          Navigation.scrollChannelIntoViewInstant(channelIndex);
        } else {
          // Was in genre mode - restore genre focus
          var activeGenre = macro('.genre-active');
          if (activeGenre.length) {
            activeGenre.addClass('genre-focused');
          } else {
            macro('#genre-tab-0').addClass('genre-focused');
          }
        }
        break;
      }
      
      case tvKeyCode.ChannelUp:
      case tvKeyCode.ChannelDown: {
        // ── LG-TV overlay: step through lgLgChannelIdDetails by one ──
        var lgChannels = presentPagedetails.lgLgChannelIdDetails;
        if (!lgChannels || lgChannels.length === 0) {
          console.warn('[lgLgDemoPlayers] No channel list available for ChannelUp/Down');
          break;
        }

        // Find current channel index by matching stored currentChannelId
        var lgCurrentId   = String(presentPagedetails.currentChannelId || '');
        var lgCurrentIdx  = -1;
        for (var ci = 0; ci < lgChannels.length; ci++) {
          if (String(lgChannels[ci].channel_id) === lgCurrentId) {
            lgCurrentIdx = ci;
            break;
          }
        }

        // Default to 0 if not found
        if (lgCurrentIdx === -1) lgCurrentIdx = 0;

        var lgNextIdx;
        if (keycode === tvKeyCode.ChannelUp) {
          // ChannelUp → next channel (wrap around)
          lgNextIdx = (lgCurrentIdx + 1) < lgChannels.length ? lgCurrentIdx + 1 : 0;
        } else {
          // ChannelDown → previous channel (wrap around)
          lgNextIdx = (lgCurrentIdx - 1) >= 0 ? lgCurrentIdx - 1 : lgChannels.length - 1;
        }

        var lgNextChannel = lgChannels[lgNextIdx];
        console.log('[lgLgDemoPlayers] ChannelUp/Down → index', lgNextIdx, 'channel:', lgNextChannel);

        if (lgNextChannel && lgNextChannel.ch_media_static_url) {
          // Update stored current channel id
          presentPagedetails.currentChannelId = String(lgNextChannel.channel_id);

          // Save as the last-selected position so guide opens here next time
          presentPagedetails.savedChannelIndex = lgNextIdx;

          // Play the new channel
          Navigation.playSelectedChannel(lgNextChannel.ch_media_static_url);

          // Refresh the overlay to show the new channel's info, then show it
          macro('#mainContent').html('');
          macro('#mainContent').html(Util.lgLgTvGuideCurrentPlayingOverlay(
            presentPagedetails.lgLgChannelIdDetails,
            presentPagedetails.lgLgChannelMetaDetails
          ));
          macro('#mainContent').show();

          var lgOverlay = macro('.lg-tv-overlay');
          if (lgOverlay.length) {
            lgOverlay.css({ 'opacity': '0', 'bottom': '44px', 'display': 'flex' });
            requestAnimationFrame(function () {
              lgOverlay.css('opacity', '1');
              // Auto-hide after 10 seconds
              setTimeout(function () {
                if (lgOverlay.is(':visible')) {
                  lgOverlay.animate({ bottom: '-300px' }, 800, function () {
                    lgOverlay.css('display', 'none');
                    lgOverlay.css('bottom', '44px');
                  });
                }
              }, 10000);
            });
          }
        } else {
          console.warn('[lgLgDemoPlayers] Next channel has no URL, skipping playback');
        }
        break;
      }

      case tvKeyCode.ArrowLeft:
      case tvKeyCode.ArrowRight: {
        break;
      }
      
      case tvKeyCode.Enter: {
        var overlay = macro('.lg-tv-overlay');
        if (overlay.length) {
          if (overlay.is(':visible')) {
            overlay.animate({ bottom: "-300px" }, 800, function() {
              overlay.css('display', 'none');
              overlay.css('bottom', '44px');
            });
          } else {
            overlay.css('display', 'flex');
            overlay.animate({ bottom: "44px" }, 800);
            setTimeout(function () {
              if (overlay.is(':visible')) {
                overlay.animate({ bottom: "-300px" }, 800, function () {
                    overlay.css('display', 'none');
                    overlay.css('bottom', '44px');
                  }
                );
              }
            }, 10000);
          }
        }
        break;
      }
      
      case tvKeyCode.Exit:
      case 8:
      case tvKeyCode.Return:
      case 10009: {
        // Stop media playback
        try { 
          if (typeof stopAndClearMedia === 'function') {
            stopAndClearMedia(); 
          }
        } catch(e) {}

        // Stop any intervals
        try {
          if (Main.lgLgchannelMetaRefreshInterval) {
            clearInterval(Main.lgLgchannelMetaRefreshInterval);
            Main.lgLgchannelMetaRefreshInterval = null;
          }
        } catch(e) {
          console.warn('Error clearing interval:', e);
        }

        // Clear current channel and navigate back
        try {
          presentPagedetails.currentChannelId = undefined;
          presentPagedetails.showingTvGuide = false;
          Main.previousPage(); 
        } catch(e) {
          console.warn('Error navigating back:', e);
        }

        // Clean up overlays and UI elements
        try {
          macro('.lg-tv-overlay').css('display', 'none');
          macro('.tv-guide-container').css('display', 'none');
        } catch(e) {console.warn('Error hiding overlays:', e);}

        // Reset background
        try {
          document.body.style.background = "#000";
        } catch(e) {
          console.warn('Error resetting background:', e);
        }

        // SAMSUNG: no HCAP mode to reset - the app window always composites
        // above the video plane on Tizen.

        try {
          Main.deviceActivity("open","page","Home screen");
        }catch(e) {}

        try { exitLiveTv(); } catch(e) {}
        break;
      }
    }
  }
};

// Update ONLY channels list
Navigation.updateChannelsOnly = function(selectedGenre) {
  var channelsHtml = Util.updateTvGuideChannels(selectedGenre, 0);
  var channelsList = document.getElementById('tvGuideChannelsList');
  if (channelsList) {
    channelsList.innerHTML = channelsHtml;
  }
  
  // Stay in genre focus mode
  presentPagedetails.tvGuideFocusMode = 'genre';
  presentPagedetails.lastChannelIndex = 0;
  
  setTimeout(function() {
    var channelList = document.getElementById('tvGuideChannelsList');
    if (channelList) {
      channelList.scrollTop = 0;
    }
  }, 50);
};

Navigation.closeTvGuide = function() {
  presentPagedetails.showingTvGuide = false;
  // DON'T reset focus mode - keep it for when we return
  
  macro('#mainContent').html('');
  macro('#mainContent').html(Util.lgLgTvGuideCurrentPlayingOverlay(
    presentPagedetails.lgLgChannelIdDetails,presentPagedetails.lgLgChannelMetaDetails
  ));
  macro('#mainContent').show();
  
  // FIXED: Hide overlay initially to prevent visible jump, then show in correct position
  var overlay = macro(".lg-tv-overlay");
  if (overlay.length) {
    // Step 1: Immediately hide overlay (invisible but positioned correctly)
    overlay.css({
      'opacity': '0',
      'bottom': '44px',
      'display': 'flex'
    });
    
    // Step 2: On next frame, make it visible (already in correct position)
    requestAnimationFrame(function() {
      overlay.css('opacity', '1');
      
      // Auto-hide after 10 seconds
      setTimeout(function () {
        if (overlay.is(':visible')) {
          overlay.animate({ bottom: "-300px" }, 1000, function () {
              overlay.css('display', 'none');
              overlay.css('bottom', '44px');
            }
          );
        }
      }, 10000);
    });
  }
};

// 🔥 REPLACE WITH THIS (in Main.lgLgChannelApiMetaData):
// Show overlay AFTER video starts playing (wait for media to initialize)
setTimeout(function() {
  var overlay = macro(".lg-tv-overlay");
  if (overlay.length) {
    overlay.css('display', 'flex'); // Show overlay
    overlay.css('bottom', '44px');
    
    // Auto-hide after 10 seconds
    setTimeout(function () {
      if (overlay.is(':visible')) {
        overlay.animate(
          { bottom: "-300px" },
          800,
          function () {
            overlay.css('display', 'none');
            overlay.css('bottom', '44px');
          }
        );
      }
    }, 10000);
  }
}, 2000); // Wait 2 seconds for video to start playing

Navigation.scrollChannelIntoViewInstant = function(channelIndex) {
  var channelRow = document.getElementById('tv-channel-row-' + channelIndex);
  var channelList = document.getElementById('tvGuideChannelsList');
  
  if (channelRow && channelList) {
    // Get all channel rows to check if this is the last one
    var allChannels = document.querySelectorAll('.tv-guide-channel-row');
    var totalChannels = allChannels.length;
    var isLastChannel = channelIndex === totalChannels - 1;
    var isSecondLastChannel = channelIndex === totalChannels - 2;
    
    // Calculate the exact scroll position to center the channel
    var rowTop = channelRow.offsetTop;
    var rowHeight = channelRow.offsetHeight;
    var listHeight = channelList.offsetHeight;
    
    // Center the channel in the visible area
    var scrollPosition = rowTop - (listHeight / 2) + (rowHeight / 2);
    
    // For last or second-last channel, add extra scroll to ensure full visibility
    if (isLastChannel) {
      scrollPosition += 60; // Extra scroll for last channel
    } else if (isSecondLastChannel) {
      scrollPosition += 30; // Extra scroll for second-last channel
    }
    
    // Temporarily disable CSS smooth scrolling for instant jump
    var originalScrollBehavior = channelList.style.scrollBehavior;
    channelList.style.scrollBehavior = 'auto';
    
    // INSTANT scroll with no animation - using scrollTop
    channelList.scrollTop = scrollPosition;
    
    // Restore original scroll behavior after instant scroll
    setTimeout(function() {
      channelList.style.scrollBehavior = originalScrollBehavior;
    }, 0);
    
    console.log('Instant scrolled to channel:', channelIndex, 'isLast:', isLastChannel, 'position:', scrollPosition);
  }
};


// Keep the smooth scroll function for arrow key navigation
Navigation.scrollChannelIntoView = function(channelIndex) {
  setTimeout(function() {
    var channelRow = document.getElementById('tv-channel-row-' + channelIndex);
    var channelList = document.getElementById('tvGuideChannelsList');
    
    if (channelRow && channelList) {
      // Get all channel rows to check if this is the last one
      var allChannels = document.querySelectorAll('.tv-guide-channel-row');
      var totalChannels = allChannels.length;
      var isLastChannel = channelIndex === totalChannels - 1;
      var isSecondLastChannel = channelIndex === totalChannels - 2;
      
      // Get positions
      var rowTop = channelRow.offsetTop;
      var rowHeight = channelRow.offsetHeight;
      var listHeight = channelList.offsetHeight;
      
      // Calculate scroll position to center the channel
      var scrollPosition = rowTop - (listHeight / 2) + (rowHeight / 2);
      
      // For last or second-last channel, add extra scroll to ensure full visibility
      if (isLastChannel) {
        scrollPosition += 60; // Extra scroll for last channel
      } else if (isSecondLastChannel) {
        scrollPosition += 30; // Extra scroll for second-last channel
      }
      
      // Smooth scroll to position
      channelList.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });
      
      console.log('Scrolled to channel:', channelIndex, 'isLast:', isLastChannel);
    }
  }, 50);
};

Navigation.scrollGenreIntoView = function(genreIndex) {
  setTimeout(function() {
    var genreTab = document.getElementById('genre-tab-' + genreIndex);
    var genreContainer = document.querySelector('.tv-guide-genres');
    
    if (genreTab && genreContainer) {
      // Get all genre tabs to check if this is the last one
      var allGenres = document.querySelectorAll('.tv-guide-genre-tab');
      var totalGenres = allGenres.length;
      var isLastGenre = genreIndex === totalGenres - 1;
      var isSecondLastGenre = genreIndex === totalGenres - 2;
      
      // Get element positions
      var tabRect = genreTab.getBoundingClientRect();
      var containerRect = genreContainer.getBoundingClientRect();
      
      // Calculate scroll position to center the genre tab
      var tabCenter = tabRect.left + (tabRect.width / 2);
      var containerCenter = containerRect.left + (containerRect.width / 2);
      var scrollOffset = tabCenter - containerCenter;
      
      // For last or second-last genre, add extra scroll to ensure full visibility
      if (isLastGenre) {
        scrollOffset += 80; // Extra scroll for last genre
      } else if (isSecondLastGenre) {
        scrollOffset += 40; // Extra scroll for second-last genre
      }
      
      // Smooth scroll to position
      genreContainer.scrollBy({
        left: scrollOffset,
        behavior: 'smooth'
      });
      
      console.log('Scrolled to genre:', genreIndex, 'isLast:', isLastGenre);
    }
  }, 50);
};

// ============================================================
// SAMSUNG AVPLAY SUPPORT HELPERS
// ============================================================

// AVPlay renders to the hardware video plane only when this placeholder
// element exists. Nothing on LG needed an equivalent, so it was never ported.
Navigation._ensureAvPlayerObject = function () {
  try {
    if (document.getElementById('av-player')) return;
    var o = document.createElement('object');
    o.setAttribute('id', 'av-player');
    o.setAttribute('type', 'application/avplayer');
    o.style.cssText = 'position:fixed;top:0;left:0;width:1920px;height:1080px;' +
                      'background:transparent;z-index:0;';
    document.body.insertBefore(o, document.body.firstChild);
    console.log('[avplay] av-player object created at runtime');
  } catch (e) {
    console.warn('[avplay] could not create av-player object:', e && e.message);
  }
};

// normal.css sets body { background: #000 }, which sits ON TOP of the video
// plane. Clearing it is what makes the picture visible.
Navigation._makeAppLayerTransparent = function () {
  try {
    document.documentElement.style.background = 'none';
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.background = 'none';
    document.body.style.backgroundColor = 'transparent';
  } catch (e) {
    console.warn('[avplay] transparency reset failed:', e && e.message);
  }
};

// Put the opaque background back when leaving a video screen.
Navigation._restoreAppLayerBackground = function () {
  try {
    document.documentElement.style.background = '';
    document.documentElement.style.backgroundColor = '';
    document.body.style.background = '#000';
    document.body.style.backgroundColor = '#000';
  } catch (e) {}
};

// Play selected channel from TV guide
Navigation.playSelectedChannel = function(urlTemplate) {
  if (!urlTemplate) {
    console.error('No URL template provided');
    return;
  }

  console.log('playSelectedChannel called with URL:', urlTemplate);

  // Helper: minimal macro replacer
  function buildMediaUrl(templateUrl, values, opts) {
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
      url = url.replace(/[?&]+/g, function (m) { return m.indexOf('?') >= 0 ? '?' : '&'; }).replace(/\?&/, '?');
    }
    return url;
  }

  // Helper: guess mime type
  function guessMimeTypeFromUrl(u) {
    try {
      var p = (u || '').split('?')[0].toLowerCase();
      if (p.indexOf('.m3u8', p.length - 5) !== -1) return 'application/x-mpegURL';
      if (p.indexOf('.mp4', p.length - 4) !== -1) return 'video/mp4';
      if (p.indexOf('.ts', p.length - 3) !== -1) return 'video/mp2t';
      if (p.indexOf('.mp3', p.length - 4) !== -1) return 'audio/mpeg';
      return 'application/x-mpegURL';
    } catch (e) { return 'application/x-mpegURL'; }
  }

  // Play final URL via Samsung AVPlay
  function playFinalUrl(finalUrl) {
    if (!finalUrl) {
      console.error('[avplay] Final URL is empty');
      return;
    }

    if (!(typeof webapis !== 'undefined' && webapis.avplay)) {
      console.error('[avplay] webapis.avplay not available');
      return;
    }

    var mime = guessMimeTypeFromUrl(finalUrl);

    // 1. AVPlay needs its <object type="application/avplayer"> placeholder in
    //    the DOM. index.html ships one; this is the belt-and-braces fallback
    //    for the hosted-shell case where index.html comes from the server.
    Navigation._ensureAvPlayerObject();

    // 2. The web layer must be transparent or the opaque body background from
    //    normal.css (body { background: #000 }) covers the video plane and the
    //    stream plays with sound but no picture.
    Navigation._makeAppLayerTransparent();

    // 3. open() only succeeds from NONE or IDLE. Read the real player state
    //    instead of trusting window._currentHcapMedia, which is only a URL
    //    string and goes stale whenever avplay errors out on its own.
    var state = 'NONE';
    try { state = webapis.avplay.getState(); } catch (eState) {}
    console.log('[avplay] state before open:', state);

    if (state === 'PLAYING' || state === 'PAUSED') {
      try { webapis.avplay.stop(); } catch (e) { console.warn('[avplay] stop threw', e); }
      state = 'IDLE';
    }
    if (state !== 'NONE') {
      try { webapis.avplay.close(); } catch (e) { console.warn('[avplay] close threw', e); }
    }
    window._currentHcapMedia = null;

    try {
      webapis.avplay.open(finalUrl);
      window._currentHcapMedia = finalUrl;
      console.log('[avplay] open ok (mime hint: ' + mime + ')');

      // 4. Display geometry MUST be set after open() and before prepare().
      //    setDisplayMethod first, then the rect - the other order is ignored.
      try {
        webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
      } catch (eMethod) {
        console.warn('[avplay] setDisplayMethod failed:', eMethod && eMethod.message);
      }
      try {
        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      } catch (eRect) {
        console.warn('[avplay] setDisplayRect failed:', eRect && eRect.message);
      }

      // 5. Without a listener, a stream that fails after prepare (bad multicast
      //    group, expired token, codec refusal) fails silently. This is the
      //    only place those errors surface.
      try {
        webapis.avplay.setListener({
          onbufferingstart:    function ()  { console.log('[avplay] buffering...'); },
          onbufferingprogress: function (p) { console.log('[avplay] buffering ' + p + '%'); },
          onbufferingcomplete: function ()  { console.log('[avplay] buffering complete'); },
          oncurrentplaytime:   function ()  {},
          onstreamcompleted:   function ()  {
            console.log('[avplay] stream completed');
            try { webapis.avplay.stop(); } catch (e) {}
          },
          onevent: function (type, data) {
            console.log('[avplay] event:', type, data);
          },
          onerror: function (err) {
            console.error('[avplay] runtime error:', err);
            try {
              if (typeof Main !== 'undefined' && Main.logTvException) {
                Main.logTvException({
                  error_type:    'PLAYBACK_ERROR',
                  error_code:    'AVPLAY_RUNTIME_ERROR',
                  error_message: String(err),
                  error_source:  'Navigation.playSelectedChannel',
                  module:        'channel',
                  action:        'avplay_playback',
                  extra_data:    { url: finalUrl }
                });
              }
            } catch (e) {}
          }
        });
      } catch (eListen) {
        console.warn('[avplay] setListener failed:', eListen && eListen.message);
      }

      // 6. HLS zapping: start on the lowest rendition so the first frame
      //    arrives fast, then let ABR climb. Ignored for udp:// / rtp://.
      if (finalUrl.indexOf('.m3u8') !== -1) {
        try {
          webapis.avplay.setStreamingProperty('ADAPTIVE_INFO', '|STARTBITRATE=LOWEST');
        } catch (eProp) {
          console.warn('[avplay] setStreamingProperty skipped:', eProp && eProp.message);
        }
      }

      webapis.avplay.prepareAsync(
        function () {
          try {
            webapis.avplay.play();
            console.log('[avplay] play success:', finalUrl);
          } catch (ePlay) {
            console.error('[avplay] play failed:', ePlay && ePlay.message);
            try { webapis.avplay.close(); } catch (e) {}
            window._currentHcapMedia = null;
          }
        },
        function (f) {
          console.error('[avplay] prepareAsync failed:', f && f.message ? f.message : f);
          try { webapis.avplay.close(); } catch (e) {}
          window._currentHcapMedia = null;
          try {
            if (typeof Main !== 'undefined' && Main.logTvException) {
              Main.logTvException({
                error_type:    'PLAYBACK_ERROR',
                error_code:    'AVPLAY_PREPARE_FAILED',
                error_message: (f && f.message) ? f.message : String(f),
                error_source:  'Navigation.playSelectedChannel',
                module:        'channel',
                action:        'avplay_prepare',
                extra_data:    { url: finalUrl }
              });
            }
          } catch (e) {}
        }
      );
    } catch (eCreate) {
      console.error('[avplay] exception opening/playing media', eCreate);
      try { webapis.avplay.close(); } catch (e) {}
      window._currentHcapMedia = null;
    }
  }

  // Gather device properties and expand macros
  function gatherPropsAndPlay(urlTemplate) {
    var values = {};
    values.DEVICE_ID = '';
    values.DEVICE_MODEL = '';
    values.COUNTRY = '';
    values.APP_NAME = (typeof window.APP_NAME !== 'undefined') ? window.APP_NAME : 'MyApp';
    values.APP_VERSION = (typeof window.APP_VERSION !== 'undefined') ? window.APP_VERSION : '1.0.0';
    values.NONCE = (Math.random().toString(36).substr(2, 9));

    // SAMSUNG: ProductInfo / SystemControl reads are SYNCHRONOUS, so the
    // nested LG callback chain collapses into two try blocks.
    try {
      if (typeof webapis !== 'undefined' && webapis.systemcontrol) {
        values.DEVICE_ID = webapis.systemcontrol.getSerialNumber() || '';
      }
    } catch (e) {
      console.warn('getSerialNumber failed:', e && e.message);
    }

    if (!values.DEVICE_ID) {
      try {
        if (typeof webapis !== 'undefined' && webapis.productinfo) {
          values.DEVICE_ID = webapis.productinfo.getDuid() || '';
        }
      } catch (e) {
        console.warn('getDuid failed:', e && e.message);
      }
    }

    try {
      if (typeof webapis !== 'undefined' && webapis.productinfo) {
        values.DEVICE_MODEL = webapis.productinfo.getModel() || '';
      }
    } catch (e) {
      console.warn('getModel failed:', e && e.message);
    }

    var finalBuilt = buildMediaUrl(urlTemplate, values, { removeEmptyParams: true });
    console.log('Final URL ready', finalBuilt);
    playFinalUrl(finalBuilt);
  }

  gatherPropsAndPlay(urlTemplate);
};

// ========================================
// LIVE TV GUIDE NAVIGATION
// ========================================

Navigation.demoPlayers = function (event) {
  var keycode = (window.event) ? event.keyCode : event.which;
  
  if (presentPagedetails.showingLiveTvGuide === true) {
    
    // ===== CHANNEL LIST NAVIGATION MODE =====
    var focusedRow = macro('.live-channel-row-focused');
    var currentIndex = 0;
    
    if (focusedRow && focusedRow.length > 0) {
      var id = focusedRow.attr('id');
      if (id) {
        var parts = id.split('-');
        currentIndex = parseInt(parts[4], 10);
      }
    } else {
      macro('#live-tv-channel-row-0').addClass('live-channel-row-focused');
      presentPagedetails.lastLiveChannelIndex = 0;
      return;
    }
    
    // Remember last channel position
    presentPagedetails.lastLiveChannelIndex = currentIndex;
    
    var totalChannels = macro('.live-tv-guide-channel-row').length;
    
    switch (keycode) {
      
      case tvKeyCode.ArrowUp: {
        if (currentIndex > 0) {
          macro('.live-channel-row-focused').removeClass('live-channel-row-focused');
          macro('#live-tv-channel-row-' + (currentIndex - 1)).addClass('live-channel-row-focused');
          presentPagedetails.lastLiveChannelIndex = currentIndex - 1;
          Navigation.scrollLiveTvChannelIntoView(currentIndex - 1);
        }
        break;
      }
      
      case tvKeyCode.ArrowDown: {
        if (currentIndex < totalChannels - 1) {
          macro('.live-channel-row-focused').removeClass('live-channel-row-focused');
          macro('#live-tv-channel-row-' + (currentIndex + 1)).addClass('live-channel-row-focused');
          presentPagedetails.lastLiveChannelIndex = currentIndex + 1;
          Navigation.scrollLiveTvChannelIntoView(currentIndex + 1);
        }
        break;
      }
      
      case tvKeyCode.ArrowLeft:
      case tvKeyCode.ArrowRight: {
        break;
      }
      
      case tvKeyCode.Enter: {
        var selectedChannelRow = macro('#live-tv-channel-row-' + currentIndex);
        var channelUuid = selectedChannelRow.attr('data-channel-uuid');
        var channel_uuid = selectedChannelRow.attr('channel_uuid');
        console.log('[Live TV Guide] Channel selected:', channelUuid, 'Index:', currentIndex);
        
        // SAVE EXACT POSITION
        presentPagedetails.savedLiveChannelIndex = currentIndex;
        
        // Find the selected channel in liveTvChannelIdDetails
        var selectedChannel = null;

        console.log("channelUuid----------------------------------------> ", channelUuid);
        console.log("channel_uuid----------------------------------------> ", channel_uuid);

        if(channelUuid != null && channelUuid !== "null" && channelUuid !== ""){
          for (var i = 0; i < presentPagedetails.liveTvChannelIdDetails.length; i++) {
            if (String(presentPagedetails.liveTvChannelIdDetails[i].epg_id) === String(channelUuid)) {
              console.log("called------------------------------------->1")
              selectedChannel = presentPagedetails.liveTvChannelIdDetails[i];
              break;
            }
          }
        } else {
          for (var i = 0; i < presentPagedetails.liveTvChannelIdDetails.length; i++) {
            if (String(presentPagedetails.liveTvChannelIdDetails[i].channel_uuid) === String(channel_uuid)) {
              console.log("called------------------------------------->2")
              selectedChannel = presentPagedetails.liveTvChannelIdDetails[i];
              break;
            }
          }
        }

        console.log("live tv selected channel details----------------->", selectedChannel);
        
        if (selectedChannel) {
          console.log('[Live TV Guide] Playing channel:', selectedChannel);
          
          // Store current channel uuid for overlay display
          presentPagedetails.currentLiveChannelId = channelUuid;
          presentPagedetails.currentLiveChannelUuid = channel_uuid;

          // ── Track channel change ──────────────────────────────────────
          try {
            Main.deviceActivity("open", "channel",
              selectedChannel.name || selectedChannel.title || "");
          } catch(e) { console.warn('[deviceActivity] Live TV guide channel tracking error:', e); }
          
          // Play the selected channel (UDP)
          if (selectedChannel.lg_ch_url) {
            var chUrl = selectedChannel.lg_ch_url;

            if(/^udp:\/\/@?\d{1,3}(\.\d{1,3}){3}:\d+$/.test(chUrl)) {
              var urlWithoutPrefix = chUrl.replace(/^udp:\/\/@?/, ""); // "239.74.48.14:8013"
              var parts = urlWithoutPrefix.split(":");
              var ip = parts[0];
              var port = parseInt(parts[1]);

              // SAMSUNG: UDP multicast is not a tuner channel - it plays
              // through webapis.avplay (AVPlayExtension udp:// support).
              try {
                try { webapis.avplay.stop(); } catch (e) {}
                try { webapis.avplay.close(); } catch (e) {}
                webapis.avplay.open("udp://" + ip + ":" + port);
                webapis.avplay.setDisplayRect(0, 0,
                  (window.screen && window.screen.width)  || 1920,
                  (window.screen && window.screen.height) || 1080);
                webapis.avplay.prepareAsync(function () {
                  webapis.avplay.play();
                  console.log('[Live TV] Successfully switched to channel');
                }, function (error) {
                  console.error("Failed to open UDP channel via avplay:", error && error.message);
                });
              } catch (eUdp) {
                console.error("Failed to change channel via avplay:", eUdp && eUdp.message);
              }
            }

            else if(/^\d+-\d+$/.test(chUrl)) {
              var channelParts = chUrl.split("-");
              var majorNumber = parseInt(channelParts[0]);
              var minorNumber = parseInt(channelParts[1]);

              console.log('[Live TV] Detected RF channel class 3 format:', chUrl);
              console.log('[Live TV] Major Number:', majorNumber, 'Minor Number:', minorNumber);

              // SAMSUNG: tizen.tvchannel.tune({ major, minor }, callbacks, errCb)
              try {
                tizen.tvchannel.tune({ major: majorNumber, minor: minorNumber }, {
                  onsuccess: function () {
                    console.log('[Live TV] Successfully switched to RF channel:', majorNumber + '-' + minorNumber);
                  },
                  onnosignal: function () {
                    console.error("[Live TV] No signal on RF channel:", majorNumber + '-' + minorNumber);
                  },
                  onprograminforeceived: function () {}
                }, function (error) {
                  console.error("[Live TV] Failed to change RF channel via tvchannel:", error && error.message);
                });
              } catch (eRf) {
                console.error("[Live TV] tvchannel.tune threw:", eRf && eRf.message);
              }
            }

            else if(/^\d+$/.test(chUrl)) {
              var logicalNumber = parseInt(chUrl);

              console.log('[Live TV] Detected RF channel class 1 format (logical number):', chUrl);
              console.log('[Live TV] Logical Channel Number:', logicalNumber);

              // SAMSUNG: single-part channel numbers are addressed as
              // major with minor 0 - tvchannel has no logicalNumber form.
              try {
                tizen.tvchannel.tune({ major: logicalNumber, minor: 0 }, {
                  onsuccess: function () {
                    console.log('[Live TV] Successfully switched to logical channel:', logicalNumber);
                  },
                  onnosignal: function () {
                    console.error("[Live TV] No signal on logical channel:", logicalNumber);
                  },
                  onprograminforeceived: function () {}
                }, function (error) {
                  console.error("[Live TV] Failed to change logical channel via tvchannel:", error && error.message);
                });
              } catch (eLog) {
                console.error("[Live TV] tvchannel.tune threw:", eLog && eLog.message);
              }
            }

            else {
              Navigation.playSelectedChannel(chUrl)
            }
          }
        } else {
          console.warn('[Live TV Guide] Channel not found for uuid:', channelUuid);
        }
        
        // Navigate to overlay
        Navigation.closeLiveTvGuide();
        break;
      }
      
      case tvKeyCode.Exit:
      case 8:
      case tvKeyCode.Return:
      case 10009: {
        Navigation.closeLiveTvGuide();
        break;
      }
    }
  } 
  // ===== OVERLAY MODE =====
  else {
    
    switch (keycode) {
      
      case tvKeyCode.ArrowUp:
      case tvKeyCode.ArrowDown: {
        console.log('[Live TV] Opening TV Guide from overlay');
        presentPagedetails.showingLiveTvGuide = true;
        
        // Use saved position or default to 0
        presentPagedetails.lastLiveChannelIndex = presentPagedetails.savedLiveChannelIndex || 0;
        
        macro('#mainContent').html('');
        macro('#mainContent').html(Util.liveTvGuideFullScreen(presentPagedetails.liveTvChannelIdDetails, presentPagedetails.liveTvChannelMetaDetails));
        macro('#mainContent').show();
        
        // Instant scroll to focused channel
        var channelIndex = presentPagedetails.lastLiveChannelIndex || 0;
        macro('#live-tv-channel-row-' + channelIndex).addClass('live-channel-row-focused');
        Navigation.scrollLiveTvChannelIntoViewInstant(channelIndex);
        break;
      }
      
      case tvKeyCode.ChannelUp:
      case tvKeyCode.ChannelDown: {

        console.log("called------------------------------------------>")
        // ── Live TV overlay: step through liveTvChannelIdDetails by one ──
        var liveChannels = presentPagedetails.liveTvChannelIdDetails;
        if (!liveChannels || liveChannels.length === 0) {
          console.warn('[demoPlayers] No channel list available for ChannelUp/Down');
          break;
        }

        // Find current channel index. We may have epg_id or channel_uuid stored.
        var liveCurrentEpgId  = String(presentPagedetails.currentLiveChannelId  || '');
        var liveCurrentUuid   = String(presentPagedetails.currentLiveChannelUuid || '');
        var liveCurrentIdx    = -1;
        for (var li = 0; li < liveChannels.length; li++) {
          var ch = liveChannels[li];
          if (
            (liveCurrentEpgId !== '' && liveCurrentEpgId !== null && liveCurrentEpgId !== 'null' && String(ch.epg_id) === liveCurrentEpgId) ||
            (liveCurrentUuid  !== '' && liveCurrentUuid  !== null && liveCurrentUuid  !== 'null' && String(ch.channel_uuid) === liveCurrentUuid)
          ) {
            liveCurrentIdx = li;
            break;
          }
        }

        // Default to 0 if not found
        if (liveCurrentIdx === -1) liveCurrentIdx = 0;

        var liveNextIdx;
        if (keycode === tvKeyCode.ChannelUp) {
          // ChannelUp → next channel (wrap around)
          liveNextIdx = (liveCurrentIdx + 1) < liveChannels.length ? liveCurrentIdx + 1 : 0;
        } else {
          // ChannelDown → previous channel (wrap around)
          liveNextIdx = (liveCurrentIdx - 1) >= 0 ? liveCurrentIdx - 1 : liveChannels.length - 1;
        }

        var liveNextChannel = liveChannels[liveNextIdx];
        console.log('[demoPlayers] ChannelUp/Down → index', liveNextIdx, 'channel:', liveNextChannel);

        if (liveNextChannel) {
          // Update stored current channel identifiers
          presentPagedetails.currentLiveChannelId   = String(liveNextChannel.epg_id      || '');
          presentPagedetails.currentLiveChannelUuid  = String(liveNextChannel.channel_uuid || '');

          // Save as last-selected position so guide opens here next time
          presentPagedetails.savedLiveChannelIndex = liveNextIdx;

          // ── Track channel change ──────────────────────────────────────
          try {
            Main.deviceActivity("open", "channel",
              liveNextChannel.name || liveNextChannel.title || "");
          } catch(e) { console.warn('[deviceActivity] Live TV ChannelUp/Down tracking error:', e); }

          // Play the new channel using the same URL-type dispatch as the Enter handler
          if (liveNextChannel.lg_ch_url) {
            var liveChUrl = liveNextChannel.lg_ch_url;

            if (/^udp:\/\/@?\d{1,3}(\.\d{1,3}){3}:\d+$/.test(liveChUrl)) {
              var liveUrlWithoutPrefix = liveChUrl.replace(/^udp:\/\/@?/, '');
              var liveParts = liveUrlWithoutPrefix.split(':');
              // SAMSUNG: UDP multicast plays through webapis.avplay.
              try {
                try { webapis.avplay.stop(); } catch (e) {}
                try { webapis.avplay.close(); } catch (e) {}
                webapis.avplay.open("udp://" + liveParts[0] + ":" + parseInt(liveParts[1]));
                webapis.avplay.setDisplayRect(0, 0,
                  (window.screen && window.screen.width)  || 1920,
                  (window.screen && window.screen.height) || 1080);
                webapis.avplay.prepareAsync(function () {
                  webapis.avplay.play();
                  console.log('[demoPlayers ChannelUp/Down] UDP switch success');
                }, function (e) {
                  console.error('[demoPlayers ChannelUp/Down] UDP switch failed:', e && e.message);
                });
              } catch (eUdp2) {
                console.error('[demoPlayers ChannelUp/Down] UDP switch threw:', eUdp2 && eUdp2.message);
              }
            } else if (/^\d+-\d+$/.test(liveChUrl)) {
              var liveMajMin = liveChUrl.split('-');
              // SAMSUNG: tizen.tvchannel.tune({ major, minor }, ...)
              try {
                tizen.tvchannel.tune({
                  major: parseInt(liveMajMin[0]),
                  minor: parseInt(liveMajMin[1])
                }, {
                  onsuccess: function () { console.log('[demoPlayers ChannelUp/Down] RF major-minor switch success'); },
                  onnosignal: function () { console.error('[demoPlayers ChannelUp/Down] RF major-minor no signal'); },
                  onprograminforeceived: function () {}
                }, function (e) {
                  console.error('[demoPlayers ChannelUp/Down] RF major-minor switch failed:', e && e.message);
                });
              } catch (eRf2) {
                console.error('[demoPlayers ChannelUp/Down] tvchannel.tune threw:', eRf2 && eRf2.message);
              }
            } else if (/^\d+$/.test(liveChUrl)) {
              // SAMSUNG: single-part number = major with minor 0.
              try {
                tizen.tvchannel.tune({ major: parseInt(liveChUrl), minor: 0 }, {
                  onsuccess: function () { console.log('[demoPlayers ChannelUp/Down] RF logical switch success'); },
                  onnosignal: function () { console.error('[demoPlayers ChannelUp/Down] RF logical no signal'); },
                  onprograminforeceived: function () {}
                }, function (e) {
                  console.error('[demoPlayers ChannelUp/Down] RF logical switch failed:', e && e.message);
                });
              } catch (eLog2) {
                console.error('[demoPlayers ChannelUp/Down] tvchannel.tune threw:', eLog2 && eLog2.message);
              }
            } else {
              Navigation.playSelectedChannel(liveChUrl);
            }
          } else {
            console.warn('[demoPlayers] Next channel has no lg_ch_url, skipping playback');
          }

          // Refresh the overlay to show the new channel's info, then show it
          macro('#mainContent').html('');
          macro('#mainContent').html(Util.liveTvGuideCurrentPlayingOverlay(
            presentPagedetails.liveTvChannelIdDetails,
            presentPagedetails.liveTvChannelMetaDetails
          ));
          macro('#mainContent').show();

          var liveTvOverlay = macro('.live-tv-overlay');
          if (liveTvOverlay.length) {
            liveTvOverlay.css({ 'opacity': '0', 'bottom': '44px', 'display': 'flex' });
            requestAnimationFrame(function () {
              liveTvOverlay.css('opacity', '1');
              // Auto-hide after 10 seconds
              setTimeout(function () {
                if (liveTvOverlay.is(':visible')) {
                  liveTvOverlay.animate({ bottom: '-300px' }, 800, function () {
                    liveTvOverlay.css('display', 'none');
                    liveTvOverlay.css('bottom', '44px');
                  });
                }
              }, 10000);
            });
          }
        } else {
          console.warn('[demoPlayers] Next channel not found at index', liveNextIdx);
        }
        break;
      }

      case tvKeyCode.ArrowLeft:
      case tvKeyCode.ArrowRight: {
        break;
      }
      
      case tvKeyCode.Enter: {
        var overlay = macro('.live-tv-overlay');
        if (overlay.length) {
          if (overlay.is(':visible')) {
            overlay.animate({ bottom: "-300px" }, 800, function() {
              overlay.css('display', 'none');
              overlay.css('bottom', '44px');
            });
          } else {
            overlay.css('display', 'flex');
            overlay.animate({ bottom: "44px" }, 800);
            setTimeout(function () {
              if (overlay.is(':visible')) {
                overlay.animate({ bottom: "-300px" }, 800, function () {
                    overlay.css('display', 'none');
                    overlay.css('bottom', '44px');
                  }
                );
              }
            }, 10000);
          }
        }
        break;
      }
      
      case tvKeyCode.Exit:
      case 8:
      case tvKeyCode.Return:
      case 10009: {
        try { 
          if (typeof stopAndClearMedia === 'function') {
            stopAndClearMedia(); 
          }
        } catch(e) {}

        // Stop any intervals
        try {
          if (Main.channelMetaRefreshInterval) {
            clearInterval(Main.channelMetaRefreshInterval);
            Main.channelMetaRefreshInterval = null;
          }
        } catch(e) {}

        try { resetHdmiToLIveTv(); } catch (e) { console.warn("resetHdmiToLIveTv error:", e); }
        try { clearNoSignalNative(); } catch (e) { console.warn("clearNoSignalNative error:", e); }
        try { exitLiveTv(); } catch (eExit) { console.warn('exitLiveTv threw', eExit); }

        // Clean up overlays and UI elements
        try {
          macro('.live-tv-overlay').css('display', 'none');
          macro('.live-tv-guide-container').css('display', 'none');
        } catch(e) {console.warn('Error hiding overlays:', e);}


        // Clear current channel and navigate back
        try {
          presentPagedetails.currentLiveChannelId = undefined;
          presentPagedetails.currentLiveChannelUuid = undefined;
          presentPagedetails.showingLiveTvGuide = false;
          Main.previousPage();
        } catch(e) {}

        // Reset background
        try {
          document.body.style.background = "#000";
        } catch(e) {
          console.warn('Error resetting background:', e);
        }

        try {
          Main.deviceActivity("open","page","Home screen");
        }catch(e) {}

        // SAMSUNG: no HCAP mode to reset - the app window always composites
        // above the video plane on Tizen.

        // try { exitLiveTv(); } catch(e) {}
        break;
      }
    }
  }
};

// Close Live TV Guide and return to overlay
Navigation.closeLiveTvGuide = function() {
  presentPagedetails.showingLiveTvGuide = false;
  
  macro('#mainContent').html('');
  macro('#mainContent').html(Util.liveTvGuideCurrentPlayingOverlay(
    presentPagedetails.liveTvChannelIdDetails, presentPagedetails.liveTvChannelMetaDetails
  ));
  macro('#mainContent').show();
  
  // FIXED: Hide overlay initially to prevent visible jump, then show in correct position
  var overlay = macro(".live-tv-overlay");
  if (overlay.length) {
    // Step 1: Immediately hide overlay (invisible but positioned correctly)
    overlay.css({
      'opacity': '0',
      'bottom': '44px',
      'display': 'flex'
    });
    
    // Step 2: On next frame, make it visible (already in correct position)
    requestAnimationFrame(function() {
      overlay.css('opacity', '1');
      
      // Auto-hide after 10 seconds
      setTimeout(function () {
        if (overlay.is(':visible')) {
          overlay.animate({ bottom: "-300px" }, 1000, function () {
              overlay.css('display', 'none');
              overlay.css('bottom', '44px');
            }
          );
        }
      }, 10000);
    });
  }
};

// Instant scroll for initial guide display
Navigation.scrollLiveTvChannelIntoViewInstant = function(channelIndex) {
  var channelRow = document.getElementById('live-tv-channel-row-' + channelIndex);
  var channelList = document.getElementById('liveTvGuideChannelsList');
  
  if (channelRow && channelList) {
    var allChannels = document.querySelectorAll('.live-tv-guide-channel-row');
    var totalChannels = allChannels.length;
    var isLastChannel = channelIndex === totalChannels - 1;
    var isSecondLastChannel = channelIndex === totalChannels - 2;
    
    var rowTop = channelRow.offsetTop;
    var rowHeight = channelRow.offsetHeight;
    var listHeight = channelList.offsetHeight;
    
    var scrollPosition = rowTop - (listHeight / 2) + (rowHeight / 2);
    
    if (isLastChannel) {
      scrollPosition += 60;
    } else if (isSecondLastChannel) {
      scrollPosition += 30;
    }
    
    var originalScrollBehavior = channelList.style.scrollBehavior;
    channelList.style.scrollBehavior = 'auto';
    channelList.scrollTop = scrollPosition;
    
    setTimeout(function() {
      channelList.style.scrollBehavior = originalScrollBehavior;
    }, 0);
  }
};

// Smooth scroll for arrow key navigation
Navigation.scrollLiveTvChannelIntoView = function(channelIndex) {
  setTimeout(function() {
    var channelRow = document.getElementById('live-tv-channel-row-' + channelIndex);
    var channelList = document.getElementById('liveTvGuideChannelsList');
    
    if (channelRow && channelList) {
      var allChannels = document.querySelectorAll('.live-tv-guide-channel-row');
      var totalChannels = allChannels.length;
      var isLastChannel = channelIndex === totalChannels - 1;
      var isSecondLastChannel = channelIndex === totalChannels - 2;
      
      var rowTop = channelRow.offsetTop;
      var rowHeight = channelRow.offsetHeight;
      var listHeight = channelList.offsetHeight;
      
      var scrollPosition = rowTop - (listHeight / 2) + (rowHeight / 2);
      
      if (isLastChannel) {
        scrollPosition += 60;
      } else if (isSecondLastChannel) {
        scrollPosition += 30;
      }
      
      channelList.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });
    }
  }, 50);
};