/**
 * MQTT Client Module for ProCentric LG TV Application
 *
 * IMPORTANT: window.MqttClient and window.GreMqttClient are registered
 * SYNCHRONOUSLY when this file is parsed, so typeof MqttClient !== 'undefined'
 * is always true. Calling .init() triggers the mqtt.min.js dynamic load
 * internally and connects once the library is ready.
 *
 * Usage in main.js (no change needed):
 *   MqttClient.init();   // reads everything from Main.deviceProfile
 */

(function () {

    var DEBUG = true;
    function log()  { if (!DEBUG) return; try { console.log.apply(console,  arguments); } catch(e){} }
    function warn() { if (!DEBUG) return; try { console.warn.apply(console,  arguments); } catch(e){} }
    function err()  {               try { console.error.apply(console, arguments); } catch(e){} }

    // ── Forced broker URL ──────────────────────────────────────────────────────
    var FORCED_WS_URL = 'wss://rs232.cloudext.co:8084/mqtt';

    var DEFAULT_BACKEND = {
        url:             FORCED_WS_URL,
        protocolVersion: 4,
        username:        '',
        password:        '',
        keepAlive:       60,
        connectTimeout:  30 * 1000
    };

    var TOPICS_TEMPLATES = {
        tv_device_command:       'GRE/{DeviceSrNo}/CMD',
        tv_property_command:     'GRE/{PropertyCode}/CMD'
    };

    // ── Internal state ─────────────────────────────────────────────────────────
    var client            = null;
    var connected         = false;
    var reconnectAttempts = 0;
    var currentBackend    = {};
    var DeviceSrNo        = '';
    var PropertyCode      = '';

    var _mqttLibLoading   = false;
    var _mqttLibReady     = false;

    // ── Helpers ────────────────────────────────────────────────────────────────
    var connecting = false;
    var stopped    = false;

    function makeClientId() {
        // A FIXED client id means the broker evicts the previous session the
        // moment a second connection uses the same id - indistinguishable from
        // a dropped link, and it fed the reconnect loop. Suffix keeps it unique
        // per connection while staying traceable to the device.
        return 'TIZEN-' + (DeviceSrNo || 'unknown') + '-' +
               Math.floor(Math.random() * 100000).toString(36);
    }

    function resolveTopic(template) {
        if (!template || typeof template !== 'string') return null;
        var s = template
            .replace(/\{DeviceSrNo\}/g,   DeviceSrNo   || '')
            .replace(/\{PropertyCode\}/g, PropertyCode || '');
        if (s.indexOf('{') !== -1 || s.indexOf('}') !== -1) return null;
        if (s.indexOf('//') !== -1) return null;
        return s;
    }

    function buildResolvedTopics(templates) {
        var out = [];
        templates = templates || TOPICS_TEMPLATES;
        Object.keys(templates).forEach(function (k) {
            var resolved = resolveTopic(templates[k]);
            if (resolved) out.push({ key: k, topic: resolved });
            else warn('[MQTT] Topic unresolved, skipping:', k, templates[k]);
        });
        return out;
    }

    // ── Subscribe helpers ──────────────────────────────────────────────────────
    function safeSubscribe(topic, qos, cb) {
        try {
            var q = parseInt(qos, 10);
            if (isNaN(q) || q < 0 || q > 2) q = 0;

            client.subscribe(topic, { qos: q }, function (subErr, granted) {
                if (subErr) {
                    err('[MQTT] Subscribe error for', topic, subErr);
                    if (typeof cb === 'function') cb(subErr, null);
                    return;
                }
                var rejected = false;
                try {
                    if (Array.isArray(granted) && granted.length > 0) {
                        var g0 = granted[0];
                        if (typeof g0 === 'number') { if (g0 === 128) rejected = true; }
                        else if (g0 && (g0.qos === 128 || g0.reasonCode >= 128)) rejected = true;
                    }
                } catch (e) {}

                if (rejected) {
                    warn('[MQTT] Broker rejected', topic, '— fallback qos 0');
                    client.subscribe(topic, { qos: 0 }, function (err2, g2) {
                        if (err2) { err('[MQTT] Fallback subscribe failed', topic, err2); if (typeof cb === 'function') cb(err2, null); }
                        else       { log('[MQTT] Subscribed (qos0 fallback)', topic);       if (typeof cb === 'function') cb(null, g2); }
                    });
                } else {
                    log('[MQTT] Subscribed to', topic, granted);
                    if (typeof cb === 'function') cb(null, granted);
                }
            });
        } catch (e) {
            err('[MQTT] safeSubscribe exception', topic, e);
            if (typeof cb === 'function') cb(e);
        }
    }

    function subscribeAllResolved(templates) {
        if (!client || !connected) { warn('[MQTT] subscribeAllResolved: not connected'); return; }
        var topics = buildResolvedTopics(templates);
        if (!topics.length) { warn('[MQTT] No topics to subscribe — DeviceSrNo/PropertyCode may be empty'); return; }
        topics.forEach(function (t) {
            safeSubscribe(t.topic, 1, function (subErr, granted) {
                log('[MQTT] subscribe result for', t.topic, 'err=', subErr, 'granted=', granted);
            });
        });
    }

    // ── Connection ─────────────────────────────────────────────────────────────
    function connect() {
        if (!currentBackend || !currentBackend.url) { err('[MQTT] connect: backend.url missing'); return; }

        // ── RECONNECT-STORM GUARD ───────────────────────────────────────────
        // Already up, or an attempt is in flight? Do nothing. Without this,
        // init() being called from two places (after provision-auth and again
        // after device-profile) started a second connection each boot.
        if (connected || connecting) {
            log('[MQTT] connect() ignored - already ' + (connected ? 'connected' : 'connecting'));
            return;
        }
        connecting = true;

        // Tearing down the previous client used to fire its own 'close'
        // handler, which called scheduleReconnect(), which called connect(),
        // which tore down the client again - a self-sustaining loop that
        // reconnected every 2s forever. Detach the handlers BEFORE ending it
        // so an intentional teardown cannot trigger a reconnect.
        if (client) {
            try { client.removeAllListeners && client.removeAllListeners(); } catch (e) {}
            try { client.on && client.on('error', function () {}); } catch (e) {}
            try { client.end(true); } catch (e) {}
            client = null;
        }

        reconnectAttempts++;
        var clientId = makeClientId();
        var opts = {
            clientId:        clientId,
            protocol:        'wss',
            protocolVersion: currentBackend.protocolVersion || 4,
            keepalive:       currentBackend.keepAlive       || 60,
            reconnectPeriod: 0,
            connectTimeout:  currentBackend.connectTimeout  || 30000,
            clean:           true
        };
        if (currentBackend.username) opts.username = currentBackend.username;
        if (currentBackend.password) opts.password = currentBackend.password;

        log('[MQTT] Connecting ->', currentBackend.url, '| clientId:', clientId);
        client = mqtt.connect(currentBackend.url, opts);

        client.on('connect', function (connack) {
            reconnectAttempts = 0;
            connected  = true;
            connecting = false;
            window.__MQTT_CONNECTED_AT__ = Date.now();
            log('[MQTT] Connected', connack);

            var templates = TOPICS_TEMPLATES;
            try {
                if (window.Main && Main.deviceProfile) {
                    var pd     = Main.deviceProfile.property_detail && Main.deviceProfile.property_detail.mqtt_setting ? Main.deviceProfile.property_detail.mqtt_setting : null;
                    var pm     = Main.deviceProfile.mqtt_setting || null;
                    var chosen = pd || pm;
                    if (chosen && chosen.subscribe) templates = chosen.subscribe;
                }
            } catch (e) {}
            subscribeAllResolved(templates);
        });

        client.on('error', function (e) {
            connecting = false;
            warn('[MQTT] Client error:', e && (e.message || e));
        });

        client.on('close', function () {
            connected  = false;
            connecting = false;
            if (stopped) { log('[MQTT] Connection closed (stopped)'); return; }
            warn('[MQTT] Connection closed - scheduling reconnect');
            scheduleReconnect();
        });

        client.on('message', function (topic, payload, packet) {
            try {
                var p = payload && payload.toString ? payload.toString() : String(payload);
                log('[MQTT] Message | topic:', topic, '| payload:', p);

                var parsed = null;
                try { parsed = JSON.parse(p); } catch (e) {}

                var cmd = (parsed && (parsed.cmd || parsed.command)) || '';

                // Guard: retained
                if (packet && packet.retain === true) { log('[MQTT] Ignored retained on', topic); return; }
                // Guard: response topics
                if (topic.indexOf('CMD_RES') !== -1) { log('[MQTT] Ignored CMD_RES topic', topic); return; }
                // Guard: stale timestamp
                if (parsed && parsed.ts && window.__MQTT_CONNECTED_AT__) {
                    if (parsed.ts < window.__MQTT_CONNECTED_AT__) { log('[MQTT] Ignored stale ts', parsed.ts); return; }
                }
                // Guard: duplicate seq
                if (parsed && parsed.seq != null) {
                    if (window.__LAST_MQTT_SEQ__ === parsed.seq) { log('[MQTT] Ignored duplicate seq', parsed.seq); return; }
                    window.__LAST_MQTT_SEQ__ = parsed.seq;
                }

                // ── Hand off to app ──────────────────────────────────────────────
                if (typeof handleMqttCommand === 'function') {
                    try { handleMqttCommand(cmd, parsed, topic); } catch (e) { err('[MQTT] handleMqttCommand threw:', e); }
                } else {
                    warn('[MQTT] handleMqttCommand not defined — add it to index.js');
                }

            } catch (e) { err('[MQTT] message handler error:', e); }
        });
    }

    var reconnectTimer = null;

    function scheduleReconnect() {
        if (stopped) return;
        if (reconnectTimer) return;          // one timer only - never stack them
        if (connected || connecting) return; // nothing to reconnect

        var wait = Math.pow(2, Math.min(reconnectAttempts || 1, 6)) * 1000;
        log('[MQTT] Reconnect in', wait, 'ms (attempt', reconnectAttempts, ')');
        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            try { connect(); } catch (e) { scheduleReconnect(); }
        }, wait);
    }

    function stop() {
        stopped = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        try { if (client) { client.removeAllListeners && client.removeAllListeners(); } } catch (e) {}
        try { if (client) client.end(true); } catch (e) {}
        client    = null;
        connected = false;
        log('[MQTT] Stopped');
    }

    // ── Dynamically load mqtt.min.js, then call connect() ─────────────────────
    function loadMqttLibAndConnect() {
        // Already available (e.g. loaded via <script> tag in index.html)
        if (typeof mqtt !== 'undefined') {
            _mqttLibReady = true;
            log('[MQTT] mqtt library already present — connecting immediately');
            connect();
            return;
        }

        // Script tag already injected — connect() will be called from onload
        if (_mqttLibLoading) {
            log('[MQTT] mqtt.min.js already loading — connect will fire on load');
            return;
        }

        _mqttLibLoading = true;
        log('[MQTT] Injecting mqtt.min.js script tag...');

        var script  = document.createElement('script');
        script.type = 'text/javascript';
        script.src  = 'javascript/mqtt.min.js';

        script.onload = function () {
            _mqttLibReady   = true;
            _mqttLibLoading = false;
            if (typeof mqtt === 'undefined') {
                err('[MQTT] mqtt.min.js loaded but window.mqtt is undefined — check the file');
                return;
            }
            log('[MQTT] mqtt.min.js loaded — connecting now');
            connect();
        };

        script.onerror = function (e) {
            _mqttLibLoading = false;
            err('[MQTT] Failed to load mqtt.min.js:', e);
        };

        (document.head || document.getElementsByTagName('head')[0]).appendChild(script);
    }

    // ── Public init ────────────────────────────────────────────────────────────
    function init(opts) {
        // init() is called from two places in the boot flow (after
        // provision-auth and again after device-profile). Re-entry used to
        // start a SECOND connection, which tore down the first and fed the
        // reconnect loop. Refresh config only; leave a live link alone.
        if (connected || connecting) {
            log('[MQTT] init() ignored - link already ' + (connected ? 'up' : 'in progress'));
            return;
        }
        stopped = false;

        // opts is optional - everything is auto-read from Main.deviceProfile
        try {
            currentBackend = {
                url:             FORCED_WS_URL,
                protocolVersion: DEFAULT_BACKEND.protocolVersion,
                username:        DEFAULT_BACKEND.username,
                password:        DEFAULT_BACKEND.password,
                keepAlive:       DEFAULT_BACKEND.keepAlive,
                connectTimeout:  DEFAULT_BACKEND.connectTimeout
            };

            // Merge explicit backend opts (url is always forced)
            if (opts && opts.backend) {
                if (typeof opts.backend.username        !== 'undefined') currentBackend.username        = opts.backend.username;
                if (typeof opts.backend.password        !== 'undefined') currentBackend.password        = opts.backend.password;
                if (typeof opts.backend.protocolVersion !== 'undefined') currentBackend.protocolVersion = opts.backend.protocolVersion;
                if (typeof opts.backend.keepAlive       !== 'undefined') currentBackend.keepAlive       = opts.backend.keepAlive;
                if (typeof opts.backend.connectTimeout  !== 'undefined') currentBackend.connectTimeout  = opts.backend.connectTimeout;
            }
            currentBackend.url = FORCED_WS_URL;

            // Pull identifiers + credentials from Main.deviceProfile
            if (window.Main && Main.deviceProfile) {
                var dp = Main.deviceProfile;

                if (dp.sr_no)            DeviceSrNo = String(dp.sr_no);
                else if (dp.device_uuid) DeviceSrNo = String(dp.device_uuid);

                if (dp.property_detail && dp.property_detail.property_code != null)
                    PropertyCode = String(dp.property_detail.property_code);
                else if (dp.property_code != null)
                    PropertyCode = String(dp.property_code);

                try {
                    var profileMqtt = (dp.property_detail && dp.property_detail.mqtt_setting) || dp.mqtt_setting;
                    if (profileMqtt) {
                        if (profileMqtt.username) currentBackend.username = profileMqtt.username;
                        if (profileMqtt.password) currentBackend.password = profileMqtt.password;
                        if (profileMqtt.authentication) {
                            if (profileMqtt.authentication.username) currentBackend.username = profileMqtt.authentication.username;
                            if (profileMqtt.authentication.password) currentBackend.password = profileMqtt.authentication.password;
                        }
                        if (profileMqtt.protocolVersion)  currentBackend.protocolVersion = profileMqtt.protocolVersion;
                        if (profileMqtt.keepAlive)        currentBackend.keepAlive        = profileMqtt.keepAlive;
                        if (profileMqtt.connectTimeoutMs) currentBackend.connectTimeout   = profileMqtt.connectTimeoutMs;
                    }
                } catch (e) { log('[MQTT] Profile mqtt merge error:', e); }
            }

            // opts can override individual fields
            if (opts && opts.deviceSrNo)   DeviceSrNo   = String(opts.deviceSrNo);
            if (opts && opts.propertyCode) PropertyCode = String(opts.propertyCode);
            if (opts && opts.templates) {
                Object.keys(opts.templates).forEach(function (k) { TOPICS_TEMPLATES[k] = opts.templates[k]; });
            }

            log('[MQTT] init | DeviceSrNo:', DeviceSrNo, '| PropertyCode:', PropertyCode, '| user:', currentBackend.username ? '(set)' : '(none)');

            // Load mqtt.min.js (if not already present) then connect
            loadMqttLibAndConnect();

        } catch (e) {
            err('[MQTT] GreMqttClient.init error:', e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Register globals SYNCHRONOUSLY — this is the key fix.
    // These objects exist the instant the browser parses this file,
    // so main.js will never see typeof MqttClient === 'undefined'.
    // ─────────────────────────────────────────────────────────────────────────
    window.GreMqttClient = {
        init:                 init,
        stop:                 stop,
        subscribeAllResolved: subscribeAllResolved,
        buildResolvedTopics:  function () { return buildResolvedTopics(); },
        resolveTopic:         resolveTopic,
        getClient:            function () { return client; },
        isConnected:          function () { return !!connected; },
        getDeviceSrNo:        function () { return DeviceSrNo; }
    };

    // Backward-compatible alias — existing main.js call works with zero changes
    window.MqttClient = {
        init:    function (opts) { window.GreMqttClient.init(opts); },
        stop:    function ()     { window.GreMqttClient.stop();     },
        isReady: function ()     { return window.GreMqttClient.isConnected(); }
    };

    log('[MQTT] GreMqttClient + MqttClient registered synchronously');

})();