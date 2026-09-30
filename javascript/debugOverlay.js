/*
 * debugOverlay.js — Samsung Tizen
 *
 * This is the LG Pro:Centric debug overlay, kept as close to the original as
 * possible. Same three header buttons (Logs / Network / Clear), same header
 * focus navigation, same full-detail console logs, same request/response
 * capture for fetch and XHR.
 *
 * The only Samsung-specific changes:
 *   1. tizen.tvinputdevice.registerKey() — Tizen does not deliver Info or the
 *      number keys to a web app until they are registered.
 *   2. Key 1 (49) toggles as well as Info (457), because the hospitality One
 *      Remote does not always send Info.
 */
(function(){

	// Prevent Double-Initialization
	if (window.__debugOverlay) return;


	// Core State Variables
	var MAX_ITEMS = 500;
	var MAX_STR_LEN = 2000; // Still used for network requests
	var isVisible = false;

	// stores captured console logs
	var logs = [];

	// stores captured network requests
	var nets = [];

	// Capture Original Functions
	var origConsole = {
		log: console.log,
		warn: console.warn,
		error: console.error,
		info: console.info,
		debug: console.debug
	};
	var origFetch = window.fetch;

	function clampString(s){
		try{
			if (typeof s !== 'string') s = JSON.stringify(s);
		}catch(e){ s = String(s); }
		if (!s) return '';
		return s.length > MAX_STR_LEN ? s.slice(0, MAX_STR_LEN) + ' …(truncated)' : s;
	}

	// New function for console logs - no truncation
	function fullString(s){
		try{
			if (typeof s !== 'string') s = JSON.stringify(s, null, 2);
		}catch(e){ s = String(s); }
		return s || '';
	}

	function pad2(n){ n = String(n); return n.length < 2 ? '0' + n : n; }

	function timeNow(){
		var d = new Date();
		// padStart is unavailable on some Tizen builds — pad2 instead.
		return pad2(d.getHours())+":"+pad2(d.getMinutes())+":"+pad2(d.getSeconds());
	}

	function pushLog(level, args){
		var txt = Array.prototype.map.call(args, function(a){
			if (typeof a === 'string') return a;
			try{ return JSON.stringify(a, null, 2); }catch(e){ return String(a); }
		}).join(' ');
		logs.push({ t: timeNow(), lvl: level, msg: fullString(txt) }); // Use fullString instead of clampString
		if (logs.length > MAX_ITEMS) logs.shift();
		render();
	}

	function pushNet(entry){
		nets.push(entry);
		if (nets.length > MAX_ITEMS) nets.shift();
		render();
	}

	// UI
	var root = document.createElement('div');
	root.id = 'debug-overlay-root';
	root.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:none;background:rgba(0,0,0,0.7);color:#fff;font-family:monospace;';

	var panel = document.createElement('div');
	panel.style.cssText = 'position:absolute;left:2%;right:2%;top:3%;bottom:3%;background:#111;border:1px solid #444;border-radius:8px;display:flex;flex-direction:column;';
	root.appendChild(panel);

	var header = document.createElement('div');
	header.style.cssText = 'display:flex;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid #333;background:#151515;';
	panel.appendChild(header);

	var title = document.createElement('div');
	title.textContent = 'Debug Overlay (Info or 1 to toggle)';
	title.style.cssText = 'font-weight:bold;';
	header.appendChild(title);

	var tabsWrap = document.createElement('div');
	tabsWrap.style.cssText = 'margin-left:auto;display:flex;gap:8px;';
	header.appendChild(tabsWrap);


	// three Buttons
	var tabLogs = document.createElement('button');
	tabLogs.textContent = 'Logs';
	tabLogs.style.cssText = 'background:#2a2a2a;color:#fff;border:1px solid #444;padding:6px 10px;border-radius:4px;outline:none;';
	tabLogs.setAttribute('tabindex','-1');
	tabsWrap.appendChild(tabLogs);

	var tabNet = document.createElement('button');
	tabNet.textContent = 'Network';
	tabNet.style.cssText = 'background:#2a2a2a;color:#fff;border:1px solid #444;padding:6px 10px;border-radius:4px;outline:none;';
	tabNet.setAttribute('tabindex','-1');
	tabsWrap.appendChild(tabNet);

	var clearBtn = document.createElement('button');
	clearBtn.textContent = 'Clear';
	clearBtn.style.cssText = 'background:#8a2be2;color:#fff;border:1px solid #444;padding:6px 10px;border-radius:4px;margin-left:8px;outline:none;';
	clearBtn.setAttribute('tabindex','-1');
	header.appendChild(clearBtn);


	var body = document.createElement('div');
	body.style.cssText = 'flex:1;overflow:auto;padding:8px 10px;outline:none;';
	body.setAttribute('tabindex','-1');
	panel.appendChild(body);

	var footer = document.createElement('div');
	footer.style.cssText = 'padding:8px 12px;color:#bbb;font-size:12px;border-top:1px solid #333;';
	footer.textContent = 'Arrow keys/scroll to navigate. Console logs show full data.';
	panel.appendChild(footer);

	var currentTab = 'logs';
	var focusHeader = false;
	var headerButtons = [tabLogs, tabNet, clearBtn];
	var headerIndex = 0;

	function updateHeaderFocus(){
		for (var i=0;i<headerButtons.length;i++){
			var btn = headerButtons[i];
			if (focusHeader && i === headerIndex){
				btn.style.boxShadow = '0 0 0 2px #00bcd4 inset';
			} else {
				btn.style.boxShadow = 'none';
			}
		}
	}

	function render() {
		if (!isVisible) return;
		body.innerHTML = '';

		if (currentTab === 'logs') {
			logs.slice().reverse().forEach(function(it) {
				var row = document.createElement('div');
				row.style.cssText = 'padding:6px 4px;border-bottom:1px dashed #333;white-space:pre-wrap;word-break:break-word;';
				var lvlColor = it.lvl === 'error' ? '#ff6b6b' :
							   (it.lvl === 'warn' ? '#ffd166' : '#90caf9');
				row.innerHTML = '<span style="color:#bbb">[' + it.t + ']</span> ' +
								'<span style="color:' + lvlColor + '">' + it.lvl.toUpperCase() + ':</span> ' +
								escapeHtml(it.msg);
				body.appendChild(row);
			});
		} else {
			nets.slice().reverse().forEach(function(n) {
				var row2 = document.createElement('div');
				row2.style.cssText = 'padding:6px 4px;border-bottom:1px dashed #333;white-space:pre-wrap;word-break:break-word;';
				var statusColor = !n.err && n.status >= 200 && n.status < 400 ? '#8bc34a' : '#ff6b6b';
				var head = '[' + n.t + '] ' + n.method + ' ' + n.url + ' (' + (n.ms || '?') + 'ms) ';
				head += n.err ? 'ERROR' : n.status;
				row2.innerHTML = '<div>' + escapeHtml(head) + '</div>'
					+ (n.reqBody ? ('<div style="color:#bbb">req: ' + escapeHtml(n.reqBody) + '</div>') : '')
					+ (n.resBody ? ('<div style="color:' + statusColor + '">res: ' + escapeHtml(n.resBody) + '</div>') : '');
				body.appendChild(row2);
			});
		}
	}


	function escapeHtml(s){
		return String(s).replace(/[&<>\"]/g, function(c){
			return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c;
		});
	}

	function setTab(tab){
		currentTab = tab;
		render();
	}

	function clearCurrent(){
		if (currentTab === 'logs') logs = []; else nets = [];
		render();
	}

	tabLogs.onclick = function(e){ e.preventDefault(); setTab('logs'); };
	tabNet.onclick = function(e){ e.preventDefault(); setTab('net'); };
	clearBtn.onclick = function(e){ e.preventDefault(); clearCurrent(); };

	// SAMSUNG: Tizen does not deliver Info or the number keys to a web app
	// until they are registered with tvinputdevice.
	(function registerKeys(){
		try{
			if (typeof tizen !== 'undefined' && tizen.tvinputdevice){
				['Info','1','0'].forEach(function(k){
					try{ tizen.tvinputdevice.registerKey(k); }catch(_){}
				});
			}
		}catch(_){}
	})();

	// TV remotes emit AUTO-REPEAT keydown events while a key is held, and some
	// hospitality remotes send a duplicate for a single press. Without a guard
	// the toggle fires twice - open then immediately closed - which looks like
	// the key doing nothing at all.
	var lastToggleAt = 0;
	var TOGGLE_DEBOUNCE_MS = 400;

	document.addEventListener('keydown', function(e){
		var code = e.which || e.keyCode;
		// 457 = Info; 49 = '1' (One Remote has no Info); F9 (120) for desktop testing
		if (code === 457 || code === 120 || code === 49){
			var now = Date.now();
			if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS){
				e.preventDefault();
				e.stopImmediatePropagation();
				return;                       // swallow the repeat
			}
			lastToggleAt = now;

			if (!isVisible) {
				show();
			} else {
				hide();
			}
			e.preventDefault();
			e.stopImmediatePropagation();
			return;                           // never fall through to scrolling
		}
		if (isVisible){
			if (focusHeader){
				if (code === 37){ // Left
					headerIndex = (headerIndex + headerButtons.length - 1) % headerButtons.length;
					updateHeaderFocus();
				} else if (code === 39){ // Right
					headerIndex = (headerIndex + 1) % headerButtons.length;
					updateHeaderFocus();
				} else if (code === 13){ // Enter
					var target = headerButtons[headerIndex];
					if (target === tabLogs) setTab('logs');
					else if (target === tabNet) setTab('net');
					else if (target === clearBtn) clearCurrent();
				} else if (code === 40){ // Down moves to body
					focusHeader = false;
					updateHeaderFocus();
					try { body.focus(); } catch(_) {}
				}
				// prevent app from handling keys
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}

			// If not focusing header, handle body scrolling with remote keys
			var step = 60;
			var page = Math.max(120, body.clientHeight - 40);
			if (code === 33) { // PageUp
				body.scrollTop = Math.max(0, body.scrollTop - page);
			} else if (code === 34) { // PageDown
				body.scrollTop = body.scrollTop + page;
			} else if (code === 36) { // Home
				body.scrollTop = 0;
			} else if (code === 35) { // End
				body.scrollTop = body.scrollHeight;
			} else if (code === 38) { // Up
				if (body.scrollTop <= 0){
					focusHeader = true;
					updateHeaderFocus();
				} else {
					body.scrollTop = Math.max(0, body.scrollTop - step);
				}
			} else if (code === 40) { // Down
				body.scrollTop = body.scrollTop + step;
			}
			// prevent the app from handling keys while open
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, true);

	function show(){
		isVisible = true;
		root.style.display = 'block';
		render();
		// default focus body; Up moves to header
		focusHeader = false;
		headerIndex = 0;
		updateHeaderFocus();
		try { body.focus(); } catch(_) {}
	}
	function hide(){
		isVisible = false;
		root.style.display = 'none';
	}

	// Hook console
	console.log = function(){ try{ pushLog('log', arguments); }catch(_){} origConsole.log.apply(console, arguments); };
	console.info = function(){ try{ pushLog('info', arguments); }catch(_){} origConsole.info.apply(console, arguments); };
	console.warn = function(){ try{ pushLog('warn', arguments); }catch(_){} origConsole.warn.apply(console, arguments); };
	console.error = function(){ try{ pushLog('error', arguments); }catch(_){} origConsole.error.apply(console, arguments); };
	console.debug = function(){ try{ pushLog('debug', arguments); }catch(_){} origConsole.debug.apply(console, arguments); };

	// Hook fetch
	if (typeof origFetch === 'function'){
		window.fetch = function(input, init){
			var method = (init && init.method) || 'GET';
			var url = (typeof input === 'string') ? input : (input && input.url) || '';
			var started = Date.now();
			var reqBody = init && init.body ? clampString(init.body) : '';
			return origFetch(input, init).then(function(resp){
				var copy = resp.clone();
				return copy.text().then(function(text){
					pushNet({ t: timeNow(), method: method, url: url, status: resp.status, ms: Date.now()-started, reqBody: reqBody, resBody: clampString(text) });
					return resp;
				});
			}).catch(function(err){
				pushNet({ t: timeNow(), method: method, url: url, status: 0, ms: Date.now()-started, reqBody: reqBody, err: true, resBody: String(err && err.message || err) });
				throw err;
			});
		};
	}

	// Hook XHR
	(function(){
		var OrigXHR = window.XMLHttpRequest;
		if (!OrigXHR) return;
		function Wrapped(){
			var xhr = new OrigXHR();
			var url = '';
			var method = 'GET';
			var started = 0;
			var reqBody = '';
			var sendOrig = xhr.send;
			var openOrig = xhr.open;
			xhr.open = function(m,u){ method = m || 'GET'; url = u || ''; return openOrig.apply(xhr, arguments); };
			xhr.send = function(body){ started = Date.now(); reqBody = body ? clampString(body) : ''; return sendOrig.apply(xhr, arguments); };
			xhr.addEventListener('loadend', function(){
				var status = 0; try{ status = xhr.status; }catch(_){ }
				var ms = Date.now()-started;
				try{
					var resTxt = '';
					// responseText throws when responseType is 'blob' (image cache).
					try{ resTxt = clampString(xhr.responseText); }catch(_){ resTxt=''; }
					pushNet({ t: timeNow(), method: method, url: url, status: status, ms: ms, reqBody: reqBody, resBody: resTxt });
				}catch(_){ }
			});
			return xhr;
		}
		window.XMLHttpRequest = Wrapped;
	})();

	document.body ? document.body.appendChild(root) : document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(root); });

	window.__debugOverlay = {
		show: show,
		hide: hide,
		toggle: function(){ isVisible?hide():show(); },
		getLogs: function(){ return logs.slice(); },
		getNetwork: function(){ return nets.slice(); }
	};
	window.debugOverlay = window.__debugOverlay;   // alias kept for existing calls
	window.showDebugOverlay = function(){ show(); };
})();
