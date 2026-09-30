Main.dbInit = function (callback) {
  // Every cacheImageToDB() call used to trigger its own indexedDB.open() when
  // Main.db was not yet set. With dozens of images racing at startup that is
  // dozens of concurrent opens of the same database - which on Tizen serialises
  // and is a large part of why startup crawled. Share one open and queue the
  // callbacks behind it.
  if (Main.db) { if (callback) callback(); return; }

  Main._dbInitQueue = Main._dbInitQueue || [];
  if (callback) Main._dbInitQueue.push(callback);

  // Permanent failure latch. IndexedDB is only PARTIALLY supported on Tizen.
  // Once an open has definitively failed there is no point retrying it for
  // every subsequent image - callers degrade to the remote URL instead.
  if (Main._dbUnavailable) { if (callback) callback(null); return; }

  if (Main._dbInitPending) return;      // an open is already in flight
  Main._dbInitPending = true;

  var _drained = false;
  var _drain = function () {
    if (_drained) return;              // onblocked + timeout can both fire
    _drained = true;
    if (_openGuard) { clearTimeout(_openGuard); _openGuard = null; }
    Main._dbInitPending = false;
    var q = Main._dbInitQueue || [];
    Main._dbInitQueue = [];
    for (var qi = 0; qi < q.length; qi++) {
      try { q[qi](Main.db || null); } catch (e) { console.warn('[DB] init callback threw', e); }
    }
  };

  // A BLOCKED open fires NEITHER onsuccess NOR onerror - it simply hangs. The
  // boot flow deletes AppCacheDB and immediately reopens it, which blocks if
  // any connection is still open, so this is not hypothetical. Without this
  // guard every queued caller waits forever and the event loop is pinned.
  var _openGuard = setTimeout(function () {
    if (_drained) return;
    console.warn('[DB] indexedDB.open blocked/timed out after 5s - continuing without cache');
    Main._dbUnavailable = true;
    _drain();
  }, 5000);

  var request;
  try {
    request = window.indexedDB.open("AppCacheDB", 1);
  } catch (ex) {
    console.warn('[DB] indexedDB.open threw:', ex && ex.message);
    Main._dbUnavailable = true;
    _drain();
    return;
  }

  request.onblocked = function () {
    console.warn('[DB] open blocked by another connection');
    Main._dbUnavailable = true;
    _drain();
  };

  request.onerror = function (event) {
    console.error("IndexedDB error:", event.target.errorCode);
    Main._dbUnavailable = true;
    _drain();                       // release every queued caller
  };

  request.onsuccess = function (event) {
    Main.db = event.target.result;
    Main._dbUnavailable = false;
    _drain();
  };

  request.onupgradeneeded = function (event) {
    var db = event.target.result;
    if (!db.objectStoreNames.contains("images")) {
      db.createObjectStore("images");
    }
  };
};

Main.cacheImageToDB = function (url, callback, key) {
  key = key || "bgImage";

  if (!url) {
    if (callback) callback(null);
    return;
  }

  if (!Main.db) {
    // BOUNDED: one retry only. Unbounded self-recursion here was an infinite
    // async loop whenever the IndexedDB open failed - it never threw and never
    // logged, it just pinned the event loop, which is why the progress bar
    // crawled instead of stopping.
    if (Main._dbUnavailable || arguments.length > 3) {
      if (callback) callback(url);          // degrade to the remote URL
      return;
    }
    Main.dbInit(function () {
      Main.cacheImageToDB(url, callback, key, true);
    });
    return;
  }

  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "blob";

    // A hung image request used to block the whole download sequence: no
    // timeout meant neither onload nor onerror ever fired, and the callback
    // that advances the progress bar was never called. 8s matches
    // cacheLocalAssets. On timeout we fall back to the remote URL, exactly
    // as the error path does.
    xhr.timeout = 3000;
    xhr.ontimeout = function () {
      console.warn("[Cache] image timed out, using remote URL:", url);
      if (callback) callback(url);
    };

    xhr.onload = function () {
      if (xhr.status == 200) {
        var blob = xhr.response;
        try {
          var tx = Main.db.transaction(["images"], "readwrite");
          var store = tx.objectStore("images");
          var putRequest = store.put(blob, key);

          putRequest.onsuccess = function () {
            try {
              var blobUrl = URL.createObjectURL(blob);
              if (key === "bgImage") Main.cachedBgBlobUrl = blobUrl;
              if (key === "logoImage") Main.cachedPropertyLogo = blobUrl;

              // Cache language icons if applicable
              if (key.indexOf("langIcon_") === 0) {
                Main.cachedLanguageIcons = Main.cachedLanguageIcons || {};
                Main.cachedLanguageIcons[key] = blobUrl;
              }
              if (callback) callback(blobUrl);
            } catch (err) {
              console.error("Error creating object URL from blob:", err);
              if (callback) callback(url);
            }
          };

          putRequest.onerror = function (event) {
            console.error(
              "Error storing image blob in IndexedDB:",
              event.target.errorCode
            );
            try {
              var blobUrl2 = URL.createObjectURL(blob);
              if (key === "bgImage") Main.cachedBgBlobUrl = blobUrl2;
              if (key === "logoImage") Main.cachedPropertyLogo = blobUrl2;
              if (key.indexOf("langIcon_") === 0) {
                Main.cachedLanguageIcons = Main.cachedLanguageIcons || {};
                Main.cachedLanguageIcons[key] = blobUrl2;
              }
              if (callback) callback(blobUrl2);
            } catch (err) {
              console.error(
                "Error creating object URL from blob after failed put:",
                err
              );
              if (callback) callback(url);
            }
          };
        } catch (err) {
          console.error("Error during IndexedDB transaction:", err);
          if (callback) callback(url);
        }
      } else {
        console.warn("Failed to fetch image for caching, status:", xhr.status);
        if (callback) callback(url);
      }
    };

    xhr.onerror = function () {
      console.error("XHR error while fetching image for caching");
      if (callback) callback(url);
    };

    xhr.send();
  } catch (err) {
    console.error("Error caching image to IndexedDB:", err);
    if (callback) callback(url);
  }
};

Main.getCachedImageURL = function (callback) {
  if (!Main.db) {
    if (Main._dbUnavailable) { if (callback) callback(null); return; }
    Main.dbInit(function (db) {
      if (!db) { if (callback) callback(null); return; }   // bounded: no re-loop
      Main.getCachedImageURL(callback);
    });
    return;
  }

  var tx = Main.db.transaction(["images"], "readonly");
  var store = tx.objectStore("images");
  var getRequest = store.get("bgImage");

  getRequest.onsuccess = function (event) {
    var blob = event.target.result;
    if (blob) {
      var url = URL.createObjectURL(blob);
      callback(url);
    } else {
      callback(null);
    }
  };

  getRequest.onerror = function (event) {
    console.error(
      "Error retrieving image from IndexedDB:",
      event.target.errorCode
    );
    callback(null);
  };
};

Main.getBackgroundImageUrl = function (callback) {
  // Check if we have already cached the URL in memory
  if (Main.cachedBgBlobUrl) {
    return callback(Main.cachedBgBlobUrl);
  }

  Main.getCachedImageURL(function (blobUrl) {
    if (blobUrl) {
      Main.cachedBgBlobUrl = blobUrl;
      return callback(blobUrl);
    }

    // Not in IndexedDB, fallback to original URL from API
    var imageUrl =
      Main.templateApiData &&
      Main.templateApiData.menu_screen_bg &&
      Main.templateApiData.menu_screen_bg[0];

    if (!imageUrl) {
      imageUrl = "/images/background_img.png"; // Default image
      return callback(imageUrl);
    }

    // Cache the image to IndexedDB
    Main.cacheImageToDB(imageUrl, function (cachedUrl) {
      Main.cachedBgBlobUrl = cachedUrl || imageUrl;
      callback(Main.cachedBgBlobUrl);
    });
  });
};

Main.getImageUrl = function (key, callback) {
  if (!Main.db) {
    if (Main._dbUnavailable) { if (callback) callback(null); return; }
    Main.dbInit(function (db) {
      if (!db) { if (callback) callback(null); return; }   // bounded: no re-loop
      Main.getImageUrl(key, callback);
    });
    return;
  }

  var cacheKey =
    key === "menu_screen_bg"
      ? "bgImage"
      : key === "property_logo"
      ? "logoImage"
      : key;

  if (key === "menu_screen_bg" && Main.cachedBgBlobUrl) {
    return callback(Main.cachedBgBlobUrl);
  } else if (key === "property_logo" && Main.cachedPropertyLogo) {
    return callback(Main.cachedPropertyLogo);
  }

  try {
    var tx = Main.db.transaction(["images"], "readonly");
    var store = tx.objectStore("images");
    var getRequest = store.get(cacheKey);

    getRequest.onsuccess = function (event) {
       var blob = event.target.result;
       if(blob) {
        var blobUrl = URL.createObjectURL(blob);
        if (key === "menu_screen_bg") Main.cachedBgBlobUrl = blobUrl;
        if (key === "property_logo") Main.cachedPropertyLogo = blobUrl;
        return callback(blobUrl)
       }

      // Not found in DB, compute imageUrl
      var imageUrl = null;
      if(key === "menu_screen_bg"){
        imageUrl = Main.templateApiData && Main.templateApiData.menu_screen_bg && Main.templateApiData.menu_screen_bg[0];
      } else if( key === "property_logo" ){
        var pl = Main.templateApiData && Main.templateApiData.property_logo;
        if (Array.isArray(pl)) imageUrl = pl[0];
        else imageUrl = pl;
      }

      if(!imageUrl){
        var fallback = (key === "menu_screen_bg") ? "/images/background_img.png" : (key === "property_logo") ? "/images/logo.png" : "/images/placeholder.png";
        return callback(fallback);
      }

      // Cache the image to IndexedDB
      Main.cacheImageToDB(imageUrl, function(cachedOrFallback) {
        return callback(cachedOrFallback || imageUrl);
      }, cacheKey)
    };

    getRequest.onerror = function (err) {
      console.error("getImageUrl: indexedDB get error", err)
      var fallback = (key === "menu_screen_bg") ? "/images/background_img.png" : (key === "property_logo") ? "/images/logo.png" : "/images/placeholder.png";
      return callback(fallback);
    };
    
  } catch (err) {
    console.error("Error retrieving image from IndexedDB:", err);
    var fallback2 =
      key === "menu_screen_bg"
        ? "/images/background_img.png"
        : key === "property_logo"
        ? "/images/logo.png"
        : "/images/placeholder.png";
    
    return callback(fallback2);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  LOCAL STATIC ASSET CACHE
//
//  Loads every PNG from the /images/ folder into IndexedDB as blobs,
//  then exposes them all in ONE variable:
//
//    Main.localAssets  →  { bluetooth: 'blob:...', wifi: 'blob:...', ... }
//
//  Usage — after cacheLocalAssets() callback fires, access directly:
//
//    Main.localAssets['bluetooth']          // blob: URL string
//    Main.localAssets['wifi']               // blob: URL string
//    Main.localAssets['hdmi-port']          // blob: URL string
//
//  Call once at app start:
//    Main.cacheLocalAssets(function() {
//      console.log(Main.localAssets); // all filled
//    });
// ─────────────────────────────────────────────────────────────────────────────

// The single variable you access everywhere in the app
Main.localAssets = {};

// Master list — names must match the PNG filenames inside /images/
Main.LOCAL_ASSET_NAMES = [
  'angle_down',
  'angle_up',
  'background_img',
  'bluetooth',
  'casting',
  'ChannelDefaultIcon',
  'clearData',
  'cloudy',
  'hdmi_background',
  'hdmi_HdmiError',
  'hdmi-port',
  'loader',
  'logo on blue_1',
  'logo',
  'qr_error',
  'restart',
  'selection3',
  'undo',
  'wifi'
];

/**
 * Main.cacheLocalAssets(callback)
 *
 * Fetches each PNG in LOCAL_ASSET_NAMES from /images/, stores the blob in
 * IndexedDB, and fills Main.localAssets[name] with a blob: URL.
 *
 * Already-cached entries are loaded from IDB (no re-fetch).
 * Falls back to the raw file path string if IDB or XHR fails.
 *
 * Call once during the boot sequence. The callback fires when all assets
 * have been processed and Main.localAssets is fully populated.
 */
Main.cacheLocalAssets = function (callback) {
  var names = Main.LOCAL_ASSET_NAMES;

  // ── SAMSUNG / TIZEN FAST PATH ───────────────────────────────────────────
  // On LG the app was SERVED OVER HTTP from the Pro:Centric server, so these
  // 19 PNGs arrived over the network and caching them in IndexedDB was a real
  // win. On Tizen the app is a packaged widget running from file:///, so the
  // same files are already on local flash. Fetching them by XHR, decoding to
  // a Blob and writing each one into IndexedDB costs seconds per asset on TV
  // flash and buys nothing at all.
  //
  // Reference them by path and return immediately.
  if (location.protocol === 'file:') {
    for (var li = 0; li < names.length; li++) {
      Main.localAssets[names[li]] = 'images/' + names[li] + '.png';
    }
    console.log('[LocalAssets] packaged app - using ' + names.length +
                ' local file paths directly, skipping IndexedDB cache');
    if (typeof callback === 'function') callback();
    return;
  }

  var total = names.length;
  var done  = 0;

  function finish() {
    done++;
    if (done >= total) {
      console.log('[LocalAssets] Main.localAssets ready:', Object.keys(Main.localAssets));
      if (typeof callback === 'function') callback();
    }
  }

  function processOne(name) {
    var idbKey   = 'localAsset_' + name;
    var filePath = 'images/' + name + '.png';

    // ── Try IDB first ────────────────────────────────────────────────────────
    try {
      var tx    = Main.db.transaction(['images'], 'readonly');
      var store = tx.objectStore('images');
      var req   = store.get(idbKey);

      req.onsuccess = function (e) {
        var blob = e.target.result;

        if (blob) {
          // Already in IDB — create blob URL and store in localAssets
          try {
            Main.localAssets[name] = URL.createObjectURL(blob);
            console.log('[LocalAssets] Loaded from IDB:', name);
          } catch (ex) {
            Main.localAssets[name] = filePath; // fallback
          }
          return finish();
        }

        // Not in IDB — fetch from /images/ folder then store
        fetchAndStore(name, idbKey, filePath);
      };

      req.onerror = function () {
        fetchAndStore(name, idbKey, filePath);
      };

    } catch (ex) {
      console.warn('[LocalAssets] IDB read error for', name, ex);
      fetchAndStore(name, idbKey, filePath);
    }
  }

  function fetchAndStore(name, idbKey, filePath) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', filePath, true);
      xhr.responseType = 'blob';
      xhr.timeout = 3000;

      xhr.onload = function () {
        // A file:// XHR reports status 0 on SUCCESS, not 200. Treating 0 as a
        // failure meant every locally packaged asset took the fallback path
        // after paying the full fetch cost.
        if (xhr.status === 200 || xhr.status === 0) {
          // Store blob in IDB
          try {
            var txw    = Main.db.transaction(['images'], 'readwrite');
            var storew = txw.objectStore('images');
            storew.put(xhr.response, idbKey);

            txw.oncomplete = function () {
              try {
                Main.localAssets[name] = URL.createObjectURL(xhr.response);
                console.log('[LocalAssets] Fetched & cached:', name);
              } catch (ex) {
                Main.localAssets[name] = filePath;
              }
              finish();
            };

            txw.onerror = function () {
              // IDB write failed — still use blob URL for this session
              try { Main.localAssets[name] = URL.createObjectURL(xhr.response); }
              catch (ex) { Main.localAssets[name] = filePath; }
              finish();
            };

          } catch (ex) {
            console.warn('[LocalAssets] IDB write error for', name, ex);
            Main.localAssets[name] = filePath;
            finish();
          }

        } else {
          console.warn('[LocalAssets] XHR non-200 for', name, xhr.status);
          Main.localAssets[name] = filePath;
          finish();
        }
      };

      xhr.onerror   = function () { Main.localAssets[name] = filePath; finish(); };
      xhr.ontimeout = function () { Main.localAssets[name] = filePath; finish(); };

      xhr.send();

    } catch (ex) {
      console.warn('[LocalAssets] XHR error for', name, ex);
      Main.localAssets[name] = filePath;
      finish();
    }
  }

  // Ensure IDB is open, then process all assets in parallel
  function proceed() {
    names.forEach(function (name) { processOne(name); });
  }

  if (!Main.db) {
    Main.dbInit(function () { proceed(); });   // proceed() is safe without a db
  } else {
    proceed();
  }
};