/**
 * ====================================================================
 * CANVAS CLOCK/TIMER WIDGET RENDERER - ENHANCED VERSION
 * Handles analog/digital clocks, countdown timers, and date display
 * Updates live every second via CanvasRenderer.startAnimationLoop()
 * Properly respects element dimensions and colors
 * ====================================================================
 */

var CanvasClock = (function() {
    'use strict';

    /**
     * Render CLOCK/TIMER widget element
     */
    function render(ctx, el) {
        console.log('[CanvasClock] Rendering:', el.name || el.id, 'DisplayMode:', el.displayMode, 'ClockType:', el.clockType);

        // VIDEO BACKGROUND or ANIMATION ENABLED: render as DOM overlay.
        // CSS animations require DOM elements - canvas pixels cannot be animated.
        var _hasAnimation = el.animation && el.animation.enabled &&
                            el.animation.type && el.animation.type !== 'none';
        if (_hasAnimation || (typeof CanvasVideoBgHelper !== 'undefined' && CanvasVideoBgHelper.isVideoBg())) {
            _renderAsDom(el);
            return;
        }

        ctx.save();
        
        // Reset critical state to prevent contamination from previously rendered elements
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Apply transformations (translate to el.x, el.y and set opacity)
        CanvasBase.applyTransformations(ctx, el);
        
        // Draw background
        if (el.enableBackground && el.backgroundColor && el.backgroundColor !== 'transparent') {
            var bgOpacity = typeof el.backgroundOpacity !== 'undefined' ? el.backgroundOpacity : 1;
            var bgColor = CanvasBase.parseColorWithOpacity(el.backgroundColor, bgOpacity);
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, el.width, el.height);
        }
        
        // Determine what to render based on displayMode and clockType
        var displayMode = (el.displayMode || '').toLowerCase();
        var clockType = (el.clockType || '').toLowerCase();
        
        console.log('[CanvasClock] Mode:', displayMode, 'Type:', clockType, 'Size:', el.width + 'x' + el.height);
        
        if (displayMode === 'countdown') {
            renderCountdown(ctx, el);
        } else if (displayMode === 'date') {
            renderDateOnly(ctx, el);
        } else if (displayMode === 'datetime') {
            renderDateTimeCombo(ctx, el);
        } else if (displayMode === 'clock' || displayMode === 'time' || displayMode === '' || !displayMode) {
            // Check clockType to determine analog vs digital
            if (clockType === 'analog') {
                renderAnalogClock(ctx, el);
            } else {
                // Default to digital clock (clockType === 'digital' or not specified)
                renderDigitalClock(ctx, el);
            }
        } else if (displayMode === 'digital') {
            renderDigitalClock(ctx, el);
        } else if (displayMode === 'analog') {
            renderAnalogClock(ctx, el);
        } else {
            // Fallback: check clockType
            if (clockType === 'analog') {
                renderAnalogClock(ctx, el);
            } else {
                renderDigitalClock(ctx, el);
            }
        }
        
        ctx.restore();
        
        console.log('[CanvasClock] Ã¢Å“â€¦ Clock rendered successfully');
    }

    /**
     * Render analog clock with proper styling - UPDATES EVERY SECOND
     */
    function renderAnalogClock(ctx, el) {
        console.log('[CanvasClock] Rendering ANALOG clock');
        
        var centerX = el.width / 2;
        var centerY = el.height / 2;
        var radius = Math.min(el.width, el.height) / 2 - 10;
        
        // Get CURRENT time - this updates every time render is called
        var now = new Date();
        var hours = now.getHours() % 12;
        var minutes = now.getMinutes();
        var seconds = now.getSeconds();
        var milliseconds = now.getMilliseconds();
        
        console.log('[CanvasClock] Ã¢ÂÂ° Analog time:', pad(hours) + ':' + pad(minutes) + ':' + pad(seconds), '@', now.toLocaleTimeString());
        
        // Draw clock face background
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = el.clockFaceColor || '#ffffff';
        ctx.fill();
        
        // Draw clock border
        if ((el.clockBorderWidth || 0) > 0) {
            ctx.strokeStyle = el.clockBorderColor || '#000000';
            ctx.lineWidth = el.clockBorderWidth || 2;
            ctx.stroke();
        }
        
        // Draw numbers if enabled
        if (el.showNumbers !== false) {
            drawNumbers(ctx, centerX, centerY, radius, el);
        }
        
        // Draw hour markers
        if (el.showHourMarkers !== false) {
            drawHourMarkers(ctx, centerX, centerY, radius, el);
        }
        
        // Draw minute markers
        if (el.showMinuteMarkers) {
            drawMinuteMarkers(ctx, centerX, centerY, radius, el);
        }
        
        // Calculate angles - INCLUDING SMOOTH MOTION with milliseconds for second hand
        var hourAngle = ((hours % 12) + minutes / 60 + seconds / 3600) * 30; // 30 degrees per hour
        var minuteAngle = (minutes + seconds / 60) * 6; // 6 degrees per minute
        var secondAngle = (seconds + milliseconds / 1000) * 6; // 6 degrees per second with smooth motion
        
        console.log('[CanvasClock] Angles - Hour:', hourAngle.toFixed(2) + 'Ã‚Â°, Min:', minuteAngle.toFixed(2) + 'Ã‚Â°, Sec:', secondAngle.toFixed(2) + 'Ã‚Â°');
        
        // Draw hour hand
        drawHand(ctx, centerX, centerY, 
                 hourAngle, 
                 radius * 0.5, 
                 el.hourHandWidth || 4, 
                 el.hourHandColor || '#000000');
        
        // Draw minute hand
        drawHand(ctx, centerX, centerY, 
                 minuteAngle, 
                 radius * 0.7, 
                 el.minuteHandWidth || 3, 
                 el.minuteHandColor || '#000000');
        
        // Draw second hand if enabled (with smooth motion)
        if (el.showSeconds !== false) {
            drawHand(ctx, centerX, centerY, 
                     secondAngle, 
                     radius * 0.85, 
                     el.secondHandWidth || 1, 
                     el.secondHandColor || '#ff0000');
        }
        
        // Draw center dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
        ctx.fillStyle = el.centerDotColor || '#000000';
        ctx.fill();
        
        console.log('[CanvasClock] Analog clock updated');
    }

    /**
     * Draw clock hand at specific angle
     */
    function drawHand(ctx, centerX, centerY, angleDegrees, length, width, color) {
        ctx.save();
        ctx.translate(centerX, centerY);
        
        // Convert degrees to radians and rotate (0 degrees = 12 o'clock)
        var angleRadians = (angleDegrees - 90) * Math.PI / 180;
        ctx.rotate(angleRadians);
        
        ctx.beginPath();
        ctx.moveTo(-8, 0); // Small tail behind center
        ctx.lineTo(length, 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        ctx.restore();
    }

    /**
     * Draw hour numbers on clock face
     */
    function drawNumbers(ctx, centerX, centerY, radius, el) {
        var fontSize = el.numberSize || 14;
        ctx.font = 'bold ' + fontSize + 'px ' + (el.fontFamily || 'Arial');
        ctx.fillStyle = el.numberColor || '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        var numberRadius = radius * 0.75;
        
        for (var i = 1; i <= 12; i++) {
            var angle = (i * 30 - 90) * Math.PI / 180; // 30 degrees per hour
            var x = centerX + Math.cos(angle) * numberRadius;
            var y = centerY + Math.sin(angle) * numberRadius;
            
            if (el.romanNumerals) {
                var romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
                ctx.fillText(romanNumerals[i - 1], x, y);
            } else {
                ctx.fillText(i.toString(), x, y);
            }
        }
    }

    /**
     * Draw hour markers
     */
    function drawHourMarkers(ctx, centerX, centerY, radius, el) {
        ctx.strokeStyle = el.markerColor || el.hourMarkerColor || '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        for (var i = 0; i < 12; i++) {
            var angle = (i * 30 - 90) * Math.PI / 180;
            var startRadius = radius * 0.85;
            var endRadius = radius * 0.95;
            
            var startX = centerX + Math.cos(angle) * startRadius;
            var startY = centerY + Math.sin(angle) * startRadius;
            var endX = centerX + Math.cos(angle) * endRadius;
            var endY = centerY + Math.sin(angle) * endRadius;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    }

    /**
     * Draw minute markers
     */
    function drawMinuteMarkers(ctx, centerX, centerY, radius, el) {
        ctx.strokeStyle = el.minuteMarkerColor || '#cccccc';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        
        for (var i = 0; i < 60; i++) {
            if (i % 5 !== 0) { // Skip hour markers
                var angle = (i * 6 - 90) * Math.PI / 180;
                var startRadius = radius * 0.90;
                var endRadius = radius * 0.95;
                
                var startX = centerX + Math.cos(angle) * startRadius;
                var startY = centerY + Math.sin(angle) * startRadius;
                var endX = centerX + Math.cos(angle) * endRadius;
                var endY = centerY + Math.sin(angle) * endRadius;
                
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
        }
    }

    /**
     * Render digital clock (time only) - UPDATES EVERY SECOND
     */
    function renderDigitalClock(ctx, el) {
        console.log('[CanvasClock] Rendering DIGITAL clock');
        
        // Get CURRENT time - this updates every time render is called
        var now = new Date();
        var hours = now.getHours();
        var minutes = now.getMinutes();
        var seconds = now.getSeconds();
        
        var timeFormat = el.timeFormat || 'HH:mm:ss';
        var showSeconds = el.showSeconds !== false;
        
        // Format time
        var timeString;
        if (timeFormat === '12' || timeFormat.indexOf('hh') !== -1 || timeFormat.indexOf('h:') !== -1) {
            var ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            timeString = pad(hours) + ':' + pad(minutes);
            if (showSeconds) timeString += ':' + pad(seconds);
            timeString += ' ' + ampm;
        } else {
            // 24-hour format (default) - Example: 15:52:40 -> 15:52:41 -> 15:52:42
            timeString = pad(hours) + ':' + pad(minutes);
            if (showSeconds) timeString += ':' + pad(seconds);
        }
        
        // Calculate font size - ensure minimum visibility
        var fontSize = el.fontSize || Math.min(el.width / 6, el.height * 0.6);
        fontSize = Math.max(fontSize, 10);
        // Ensure clean text rendering state
        ctx.globalAlpha = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.font = (el.fontWeight || 'normal') + ' ' + fontSize + 'px ' + (el.fontFamily || 'Arial');
        ctx.fillStyle = el.color || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeString, el.width / 2, el.height / 2);
        
        console.log('[CanvasClock] Ã¢ÂÂ° Digital clock updated:', timeString, '@', now.toLocaleTimeString());
    }

    /**
     * Render date only
     */
    function renderDateOnly(ctx, el) {
        var now = new Date();
        
        // Get date format
        var dateFormat = el.dateFormat || 'short';
        var dateString;
        
        if (dateFormat === 'dmy' || dateFormat === 'dd MMM yyyy') {
            // Format: "29 Jan 2026"
            var day = now.getDate();
            var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var month = monthNames[now.getMonth()];
            var year = now.getFullYear();
            dateString = day + ' ' + month + ' ' + year;
        } else if (dateFormat === 'long') {
            // Example: "Wednesday, January 29, 2026"
            dateString = now.toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else if (dateFormat === 'short') {
            // Example: "29 Jan 2026" (same as dmy)
            var day = now.getDate();
            var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var month = monthNames[now.getMonth()];
            var year = now.getFullYear();
            dateString = day + ' ' + month + ' ' + year;
        } else if (dateFormat === 'numeric') {
            // Example: "1/29/2026"
            dateString = now.toLocaleDateString();
        } else {
            // Default: "29 Jan 2026"
            var day = now.getDate();
            var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var month = monthNames[now.getMonth()];
            var year = now.getFullYear();
            dateString = day + ' ' + month + ' ' + year;
        }
        
        // Draw date
        var fontSize = el.fontSize || 36;
        fontSize = Math.max(fontSize, 10);
        ctx.globalAlpha = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.font = (el.fontWeight || 'normal') + ' ' + fontSize + 'px ' + (el.fontFamily || 'Arial');
        ctx.fillStyle = el.color || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dateString, el.width / 2, el.height / 2);
    }

    /**
     * Render date and time combo - UPDATES EVERY SECOND
     */
    function renderDateTimeCombo(ctx, el) {
        console.log('[CanvasClock] Rendering DATETIME combo');
        
        // Get CURRENT time - updates every second
        var now = new Date();
        var hours = now.getHours();
        var minutes = now.getMinutes();
        var seconds = now.getSeconds();
        
        var timeFormat = el.timeFormat || 'HH:mm:ss';
        var showSeconds = el.showSeconds !== false;
        
        // Format time
        var timeString;
        if (timeFormat === '12' || timeFormat.indexOf('hh') !== -1) {
            var ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            timeString = pad(hours) + ':' + pad(minutes);
            if (showSeconds) timeString += ':' + pad(seconds);
            timeString += ' ' + ampm;
        } else {
            // 24-hour format - Example: 15:52:40 -> 15:52:41
            timeString = pad(hours) + ':' + pad(minutes);
            if (showSeconds) timeString += ':' + pad(seconds);
        }
        
        // Format date - "29 Jan 2026"
        var day = now.getDate();
        var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var month = monthNames[now.getMonth()];
        var year = now.getFullYear();
        var dateString = day + ' ' + month + ' ' + year;
        
        // Calculate font sizes based on element dimensions
        var timeFontSize = el.timeFontSize || el.fontSize || Math.min(el.width / 5, el.height * 0.5);
        var dateFontSize = el.dateFontSize || timeFontSize * 0.4;
        
        console.log('[CanvasClock] Ã¢ÂÂ° DateTime updated:', timeString, dateString);
        
        // Draw time (larger, centered vertically with space for date below)
        ctx.globalAlpha = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.font = (el.fontWeight || 'normal') + ' ' + timeFontSize + 'px ' + (el.fontFamily || 'Arial');
        ctx.fillStyle = el.color || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        var timeY = el.height / 2 - dateFontSize / 2 - 5;
        ctx.fillText(timeString, el.width / 2, timeY);
        
        // Draw date (smaller, below time)
        ctx.font = (el.fontWeight || 'normal') + ' ' + dateFontSize + 'px ' + (el.fontFamily || 'Arial');
        ctx.fillStyle = el.color || '#AAAAAA';
        
        var dateY = el.height / 2 + timeFontSize / 2;
        ctx.fillText(dateString, el.width / 2, dateY);
    }

    /**
     * Render countdown timer - DECREASES SECOND BY SECOND
     * Format: "2:02:21:28" (days:hours:mins:secs)
     * After completion, displays countdownCompleteMessage
     */
    function renderCountdown(ctx, el) {
        console.log('[CanvasClock] Rendering COUNTDOWN');
        
        if (!el.targetDateTime) {
            var fontSize = el.fontSize || 24;
            ctx.font = fontSize + 'px Arial';
            ctx.fillStyle = '#ff0000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No target date set', el.width / 2, el.height / 2);
            console.warn('[CanvasClock] Ã¢Å¡ Ã¯Â¸Â No targetDateTime set for countdown');
            return;
        }
        
        // Get CURRENT time - this updates every second
        var now = new Date();
        var target = new Date(el.targetDateTime);
        var diff = target - now; // Milliseconds remaining
        
        console.log('[CanvasClock] Ã¢ÂÂ±Ã¯Â¸Â Countdown - Now:', now.toLocaleTimeString(), 'Target:', target.toLocaleString(), 'Diff:', Math.floor(diff / 1000) + 's');
        
        // Check if countdown is complete
        if (diff <= 0) {
            // COUNTDOWN COMPLETE - Show completion message
            console.log('[CanvasClock] Ã°Å¸Å½â€° COUNTDOWN COMPLETE! Showing message:', el.countdownCompleteMessage || "Time's Up!");
            
            var fontSize = el.timeFontSize || el.fontSize || Math.min(el.width / 8, el.height * 0.6);
            fontSize = Math.max(fontSize, 10);
            ctx.globalAlpha = typeof el.opacity !== 'undefined' ? el.opacity : 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.font = (el.fontWeight || 'normal') + ' ' + fontSize + 'px ' + (el.fontFamily || 'Arial');
            ctx.fillStyle = el.color || '#FF0000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(el.countdownCompleteMessage || "Time's Up!", el.width / 2, el.height / 2);
            return;
        }
        
        // Calculate time components - DECREASES EVERY SECOND
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        // Format countdown: "2:02:21:28" (days:hours:mins:secs)
        // Example progression: 
        // 2:02:21:28 -> 2:02:21:27 -> 2:02:21:26 -> ... -> 0:00:00:01 -> 0:00:00:00 -> "Time's Up!"
        var countdownText = days + ':' + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
        
        console.log('[CanvasClock] Ã¢ÂÂ±Ã¯Â¸Â Countdown remaining:', countdownText);
        
        // Calculate font size based on element dimensions
        var fontSize = el.timeFontSize || el.fontSize || Math.min(el.width / 8, el.height * 0.6);
        fontSize = Math.max(fontSize, 10);
        ctx.globalAlpha = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.font = (el.fontWeight || 'normal') + ' ' + fontSize + 'px ' + (el.fontFamily || 'Arial');
        ctx.fillStyle = el.timeColor || el.color || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countdownText, el.width / 2, el.height / 2);
        
        // Optional: Show target date below countdown
        if (el.showTargetDate) {
            var day = target.getDate();
            var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var month = monthNames[target.getMonth()];
            var year = target.getFullYear();
            var targetDateString = day + ' ' + month + ' ' + year;
            
            ctx.font = (el.dateFontSize || fontSize * 0.4) + 'px ' + (el.fontFamily || 'Arial');
            ctx.fillStyle = el.dateColor || '#AAAAAA';
            var dateY = el.height / 2 + fontSize / 2 + 20;
            ctx.fillText(targetDateString, el.width / 2, dateY);
        }
    }

    /**
     * Pad number with leading zero
     */
    function pad(num) {
        return num < 10 ? '0' + num : num;
    }


    /* ── DOM clock overlay for video background mode ───────────── */
    var _clockDomOverlays = {};   // { elId -> { wrap, span, timer } }

    function _getClockText(el) {
        var now  = new Date();
        var h    = now.getHours();
        var m    = now.getMinutes();
        var s    = now.getSeconds();
        var displayMode = (el.displayMode || '').toLowerCase();

        function pad(n) { return n < 10 ? '0' + n : String(n); }

        if (displayMode === 'date') {
            var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();
        }
        if (displayMode === 'datetime') {
            var months2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var dateStr = now.getDate() + ' ' + months2[now.getMonth()] + ' ' + now.getFullYear();
            var tf = el.timeFormat || 'HH:mm';
            var ampm = '';
            if (tf === '12' || tf.indexOf('hh') !== -1) {
                ampm = h >= 12 ? ' PM' : ' AM';
                h = h % 12 || 12;
            }
            var timeStr = pad(h) + ':' + pad(m) + (el.showSeconds !== false ? ':' + pad(s) : '') + ampm;
            return dateStr + '  ' + timeStr;
        }
        if (displayMode === 'countdown') {
            var target = el.targetDateTime ? new Date(el.targetDateTime) : (el.targetDate ? new Date(el.targetDate) : new Date());
            var diff   = Math.max(0, target - now);
            var days   = Math.floor(diff / 86400000);
            var hrs    = Math.floor((diff % 86400000) / 3600000);
            var mins   = Math.floor((diff % 3600000)  / 60000);
            var secs   = Math.floor((diff % 60000)    / 1000);
            return (days > 0 ? days + 'd ' : '') + pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
        }
        // Default: digital clock (HH:mm or HH:mm:ss)
        var tf2  = el.timeFormat || 'HH:mm:ss';
        var ampm2 = '';
        if (tf2 === '12' || tf2.indexOf('hh') !== -1) {
            ampm2 = h >= 12 ? ' PM' : ' AM';
            h = h % 12 || 12;
        }
        return pad(h) + ':' + pad(m) + (el.showSeconds !== false ? ':' + pad(s) : '') + ampm2;
    }

    function _renderAsDom(el) {
        var elId        = String(el.id || el.name || 'clock');
        var clockType   = (el.clockType   || '').toLowerCase();
        var displayMode = (el.displayMode || '').toLowerCase();
        var isAnalog    = (clockType === 'analog') &&
                          (displayMode === 'clock' || displayMode === 'time' ||
                           displayMode === '' || !displayMode);

        /* ── ANALOG: update existing canvas overlay ── */
        if (isAnalog && _clockDomOverlays[elId]) {
            _drawAnalogOnDomCanvas(_clockDomOverlays[elId].canvas, el);
            return;
        }
        /* ── TEXT modes: refresh text only ── */
        if (!isAnalog && _clockDomOverlays[elId]) {
            if (_clockDomOverlays[elId].span) {
                _clockDomOverlays[elId].span.textContent = _getClockText(el);
            }
            return;
        }

        /* ── First-time creation ── */
        var container = (typeof CanvasVideoBgHelper !== 'undefined')
            ? CanvasVideoBgHelper.getContainer()
            : document.getElementById('our-hotel-container') || document.body;

        var x       = Math.floor(el.x      || 0);
        var y       = Math.floor(el.y      || 0);
        var w       = Math.ceil(el.width   || 200);
        var h       = Math.ceil(el.height  || 60);
        var opacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        var zIndex  = (el.zIndex && el.zIndex !== 'auto') ? el.zIndex : 10;

        var wrap = document.createElement('div');
        wrap.setAttribute('data-canvas-clock-id', elId);
        wrap.style.cssText = 'position:absolute;pointer-events:none;margin:0;overflow:hidden;box-sizing:border-box;';
        wrap.style.left         = x + 'px';
        wrap.style.top          = y + 'px';
        wrap.style.width        = w + 'px';
        wrap.style.height       = h + 'px';
        wrap.style.opacity      = String(opacity);
        wrap.style.zIndex       = String(zIndex);
        wrap.style.borderRadius = (el.borderRadius || 0) + 'px';

        if (el.enableBackground && el.backgroundColor && el.backgroundColor !== 'transparent') {
            wrap.style.backgroundColor = el.backgroundColor;
        }
        if (el.rotation && el.rotation !== 0) {
            wrap.style.transform       = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform = 'rotate(' + el.rotation + 'deg)';
            wrap.style.transformOrigin = 'center center';
        }
        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        var overlayEntry = { wrap: wrap, span: null, canvas: null, timer: null };

        if (isAnalog) {
            /* ── ANALOG: <canvas> inside wrapper, redrawn every second ── */
            var cvs = document.createElement('canvas');
            cvs.width  = w;
            cvs.height = h;
            cvs.style.cssText = 'display:block;width:' + w + 'px;height:' + h + 'px;';
            wrap.appendChild(cvs);
            overlayEntry.canvas = cvs;
            _drawAnalogOnDomCanvas(cvs, el);

            overlayEntry.timer = setInterval(function () {
                if (!wrap.parentNode) {
                    clearInterval(overlayEntry.timer);
                    delete _clockDomOverlays[elId];
                    return;
                }
                _drawAnalogOnDomCanvas(cvs, el);
            }, 1000);

        } else {
            /* ── TEXT (digital / countdown / date / datetime) ── */
            var fontSize = el.fontSize || Math.min(w / 6, h * 0.6);
            fontSize = Math.max(fontSize, 10);

            wrap.style.display        = 'flex';
            wrap.style.alignItems     = 'center';
            wrap.style.justifyContent = 'center';

            var span = document.createElement('span');
            span.textContent   = _getClockText(el);
            span.style.cssText = 'display:block;margin:0;padding:0;white-space:nowrap;';
            span.style.fontSize   = fontSize + 'px';
            span.style.fontFamily = el.fontFamily || 'Arial';
            span.style.fontWeight = el.fontWeight || 'normal';
            span.style.color      = el.color || '#ffffff';
            span.style.textAlign  = 'center';
            span.style.lineHeight = '1';
            wrap.appendChild(span);
            overlayEntry.span = span;

            overlayEntry.timer = setInterval(function () {
                if (!wrap.parentNode) {
                    clearInterval(overlayEntry.timer);
                    delete _clockDomOverlays[elId];
                    return;
                }
                span.textContent = _getClockText(el);
            }, 1000);
        }

        // Hide until animation fires (prevents flash at natural position on first load)
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            wrap.style.visibility = 'hidden';
        }
        container.appendChild(wrap);
        _clockDomOverlays[elId] = overlayEntry;

        // Apply CSS animation if configured on this element
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                CanvasAnimation.applyAnimation(el, null);
            }
        }

        console.log('[CanvasClock] DOM clock overlay created:', elId, isAnalog ? '(analog canvas)' : '(text)');
    }

    /**
     * Draw an analog clock face onto a DOM <canvas> element.
     * Used exclusively in video-background mode as a DOM overlay.
     */
    function _drawAnalogOnDomCanvas(cvs, el) {
        var ctx2 = cvs.getContext('2d');
        if (!ctx2) return;

        var w = cvs.width;
        var h = cvs.height;
        ctx2.clearRect(0, 0, w, h);

        var centerX = w / 2;
        var centerY = h / 2;
        var radius  = Math.min(w, h) / 2 - 4;

        var now          = new Date();
        var hours        = now.getHours() % 12;
        var minutes      = now.getMinutes();
        var seconds      = now.getSeconds();
        var milliseconds = now.getMilliseconds();

        /* Clock face */
        ctx2.beginPath();
        ctx2.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx2.fillStyle = el.clockFaceColor || '#ffffff';
        ctx2.fill();

        if ((el.clockBorderWidth || 0) > 0) {
            ctx2.strokeStyle = el.clockBorderColor || '#000000';
            ctx2.lineWidth   = el.clockBorderWidth || 2;
            ctx2.stroke();
        }

        /* Numbers */
        if (el.showNumbers !== false) {
            var numSize = el.numberSize || 14;
            ctx2.font         = 'bold ' + numSize + 'px ' + (el.fontFamily || 'Arial');
            ctx2.fillStyle    = el.numberColor || '#000000';
            ctx2.textAlign    = 'center';
            ctx2.textBaseline = 'middle';
            var numR  = radius * 0.75;
            var roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
            for (var i = 1; i <= 12; i++) {
                var ang = (i * 30 - 90) * Math.PI / 180;
                ctx2.fillText(
                    el.romanNumerals ? roman[i - 1] : String(i),
                    centerX + Math.cos(ang) * numR,
                    centerY + Math.sin(ang) * numR
                );
            }
        }

        /* Hour markers */
        if (el.showHourMarkers !== false) {
            ctx2.strokeStyle = el.markerColor || '#000000';
            ctx2.lineWidth   = 3;
            ctx2.lineCap     = 'round';
            for (var j = 0; j < 12; j++) {
                var a = (j * 30 - 90) * Math.PI / 180;
                ctx2.beginPath();
                ctx2.moveTo(centerX + Math.cos(a) * radius * 0.85, centerY + Math.sin(a) * radius * 0.85);
                ctx2.lineTo(centerX + Math.cos(a) * radius * 0.95, centerY + Math.sin(a) * radius * 0.95);
                ctx2.stroke();
            }
        }

        /* Minute markers */
        if (el.showMinuteMarkers) {
            ctx2.strokeStyle = el.minuteMarkerColor || '#cccccc';
            ctx2.lineWidth   = 1;
            ctx2.lineCap     = 'round';
            for (var k = 0; k < 60; k++) {
                if (k % 5 !== 0) {
                    var b = (k * 6 - 90) * Math.PI / 180;
                    ctx2.beginPath();
                    ctx2.moveTo(centerX + Math.cos(b) * radius * 0.90, centerY + Math.sin(b) * radius * 0.90);
                    ctx2.lineTo(centerX + Math.cos(b) * radius * 0.95, centerY + Math.sin(b) * radius * 0.95);
                    ctx2.stroke();
                }
            }
        }

        /* Hands */
        var hourAngle   = ((hours % 12) + minutes / 60 + seconds / 3600) * 30;
        var minuteAngle = (minutes + seconds / 60) * 6;
        var secondAngle = (seconds + milliseconds / 1000) * 6;

        function _hand(angle, length, lw, color) {
            ctx2.save();
            ctx2.translate(centerX, centerY);
            ctx2.rotate((angle - 90) * Math.PI / 180);
            ctx2.beginPath();
            ctx2.moveTo(-8, 0);
            ctx2.lineTo(length, 0);
            ctx2.strokeStyle = color;
            ctx2.lineWidth   = lw;
            ctx2.lineCap     = 'round';
            ctx2.stroke();
            ctx2.restore();
        }

        _hand(hourAngle,   radius * 0.5,  el.hourHandWidth   || 4, el.hourHandColor   || '#000000');
        _hand(minuteAngle, radius * 0.7,  el.minuteHandWidth || 3, el.minuteHandColor || '#000000');
        if (el.showSeconds !== false) {
            _hand(secondAngle, radius * 0.85, el.secondHandWidth || 1, el.secondHandColor || '#ff0000');
        }

        /* Center dot */
        ctx2.beginPath();
        ctx2.arc(centerX, centerY, 6, 0, 2 * Math.PI);
        ctx2.fillStyle = el.centerDotColor || '#000000';
        ctx2.fill();
    }


        function cleanup() {
        for (var id in _clockDomOverlays) {
            if (_clockDomOverlays.hasOwnProperty(id)) {
                var entry = _clockDomOverlays[id];
                clearInterval(entry.timer);
                if (entry.wrap && entry.wrap.parentNode) entry.wrap.parentNode.removeChild(entry.wrap);
            }
        }
        _clockDomOverlays = {};
    }

    // Public API
    return {
        render: render,
        cleanup: cleanup
    };
})();