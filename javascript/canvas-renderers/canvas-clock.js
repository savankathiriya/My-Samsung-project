/**
 * ====================================================================
 * CANVAS CLOCK/TIMER WIDGET RENDERER - ENHANCED VERSION
 * Handles analog/digital clocks, countdown timers, and date display
 * Updates live every second via CanvasRenderer.startAnimationLoop()
 * Properly respects element dimensions and colors
 *
 * Supported element fields (besides size/position/colors):
 *   timezone      - IANA zone ("America/Chicago"); falls back to the
 *                   property timezone, then the device local time
 *   timeFormat    - token format, e.g. "hh:mm:ss a", "HH:mm" (or "12"/"24")
 *   showSeconds   - false strips the seconds token from timeFormat
 *   showDate      - draws the date next to the time / analog face
 *   datePosition  - "below" | "above" | "left" | "right"
 *   dateGap, dateFormat, dateFontSize, dateColor
 *   showTimezone, timezoneFontSize, timezoneColor
 *   textAlign     - "left" | "center" | "right"
 *   digitalStyle  - "simple" | "blocks" | "neon" | "lcd" | "segments"
 * ====================================================================
 */

var CanvasClock = (function() {
    'use strict';

    var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var MONTHS_LONG  = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    var DAYS_SHORT   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DAYS_LONG    = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Horizontal breathing room kept inside the element box when fitting text
    var FIT_PADDING = 4;

    // Legacy dateFormat keywords -> token formats
    var DATE_FORMAT_ALIASES = {
        'short':   'd MMM yyyy',
        'dmy':     'dd MMM yyyy',
        'long':    'EEEE, MMMM d, yyyy',
        'numeric': 'M/d/yyyy',
        'mdy':     'MM/dd/yyyy',
        'ymd':     'yyyy-MM-dd'
    };

    /**
     * Render CLOCK/TIMER widget element
     */
    function render(ctx, el) {
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
        _resetShadow(ctx);

        // Apply transformations (translate to el.x, el.y and set opacity)
        CanvasBase.applyTransformations(ctx, el);

        // Draw background
        if (el.enableBackground && el.backgroundColor && el.backgroundColor !== 'transparent') {
            var bgOpacity = typeof el.backgroundOpacity !== 'undefined' ? el.backgroundOpacity : 1;
            ctx.fillStyle = CanvasBase.parseColorWithOpacity(el.backgroundColor, bgOpacity);
            ctx.fillRect(0, 0, el.width, el.height);
        }

        // Never paint outside the element box: updateClocks() only erases this
        // box each second, so overflow pixels would pile up into smeared glyphs.
        ctx.beginPath();
        ctx.rect(0, 0, el.width, el.height);
        ctx.clip();

        _drawContent(ctx, el, el.width, el.height);

        ctx.restore();
    }

    /**
     * Draw the clock content into a (0,0,w,h) box on the given context.
     * Shared by the main canvas path and the DOM overlay canvas.
     */
    function _drawContent(ctx, el, w, h) {
        var displayMode = (el.displayMode || '').toLowerCase();
        var clockType = (el.clockType || '').toLowerCase();
        var now = _getZonedNow(el);

        if (displayMode === 'countdown') {
            renderCountdown(ctx, el, w, h);
        } else if (displayMode === 'date') {
            renderDateOnly(ctx, el, w, h, now);
        } else if (displayMode === 'datetime') {
            renderDigitalClock(ctx, el, w, h, now, true);
        } else if (displayMode === 'analog' ||
                   (displayMode !== 'digital' && clockType === 'analog')) {
            renderAnalogClock(ctx, el, w, h, now);
        } else {
            // 'clock' / 'time' / 'digital' / unspecified -> digital
            renderDigitalClock(ctx, el, w, h, now, false);
        }
    }

    /* ── Timezone helpers ─────────────────────────────────────────── */

    var _tzFormatters = {};      // tz -> Intl.DateTimeFormat | null (invalid / unsupported)
    var _tzNameFormatters = {};  // tz -> Intl.DateTimeFormat | null

    function _resolveTimezone(el) {
        if (el.timezone) return el.timezone;
        if (typeof Main !== 'undefined' && Main.deviceProfile &&
            Main.deviceProfile.property_detail &&
            Main.deviceProfile.property_detail.property_timezone) {
            return Main.deviceProfile.property_detail.property_timezone;
        }
        return '';
    }

    /**
     * Returns a Date whose local getters (getHours, getDate, ...) report the
     * wall-clock time in the element's timezone. Falls back to device time.
     */
    function _getZonedNow(el) {
        var now = new Date();
        var tz = _resolveTimezone(el);
        if (!tz) return now;

        var fmt = _tzFormatters[tz];
        if (fmt === undefined) {
            try {
                fmt = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz,
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
            } catch (e) {
                console.warn('[CanvasClock] Invalid/unsupported timezone "' + tz + '", using device time');
                fmt = null;
            }
            _tzFormatters[tz] = fmt;
        }
        if (!fmt) return now;

        // "10/22/2026, 14:05:09" -> [MM, DD, YYYY, HH, mm, ss]
        var p = fmt.format(now).match(/\d+/g);
        if (!p || p.length < 6) return now;

        return new Date(parseInt(p[2], 10), parseInt(p[0], 10) - 1, parseInt(p[1], 10),
                        parseInt(p[3], 10) % 24, // some engines emit "24" at midnight
                        parseInt(p[4], 10), parseInt(p[5], 10), now.getMilliseconds());
    }

    /**
     * Short zone label for showTimezone, e.g. "CDT". Falls back to the IANA name.
     */
    function _getTimezoneLabel(el) {
        var tz = _resolveTimezone(el);
        var fmt = _tzNameFormatters[tz || 'local'];
        if (fmt === undefined) {
            try {
                var opts = { hour: 'numeric', timeZoneName: 'short' };
                if (tz) opts.timeZone = tz;
                fmt = new Intl.DateTimeFormat('en-US', opts);
            } catch (e) {
                fmt = null;
            }
            _tzNameFormatters[tz || 'local'] = fmt;
        }
        if (fmt) {
            var parts = fmt.format(new Date()).split(' ');
            var label = parts[parts.length - 1];
            if (label) return label;
        }
        return tz;
    }

    /* ── Formatting helpers ───────────────────────────────────────── */

    /**
     * Token formatter. Supports: yyyy yy MMMM MMM MM M dd d EEEE EEE
     * (dddd/ddd weekday aliases, YYYY/DD aliases) HH H hh h mm m ss s a A
     * and quoted literals ('at').
     */
    function formatDateTokens(date, format) {
        var hours = date.getHours();
        return format.replace(/'[^']*'|yyyy|YYYY|yy|YY|MMMM|MMM|MM|M|EEEE|EEE|dddd|ddd|dd|DD|d|D|HH|H|hh|h|mm|m|ss|s|a|A/g, function(t) {
            switch (t) {
                case 'yyyy': case 'YYYY': return String(date.getFullYear());
                case 'yy':   case 'YY':   return String(date.getFullYear()).slice(-2);
                case 'MMMM': return MONTHS_LONG[date.getMonth()];
                case 'MMM':  return MONTHS_SHORT[date.getMonth()];
                case 'MM':   return pad(date.getMonth() + 1);
                case 'M':    return String(date.getMonth() + 1);
                case 'EEEE': case 'dddd': return DAYS_LONG[date.getDay()];
                case 'EEE':  case 'ddd':  return DAYS_SHORT[date.getDay()];
                case 'dd':   case 'DD':   return pad(date.getDate());
                case 'd':    case 'D':    return String(date.getDate());
                case 'HH':   return pad(hours);
                case 'H':    return String(hours);
                case 'hh':   return pad(hours % 12 || 12);
                case 'h':    return String(hours % 12 || 12);
                case 'mm':   return pad(date.getMinutes());
                case 'm':    return String(date.getMinutes());
                case 'ss':   return pad(date.getSeconds());
                case 's':    return String(date.getSeconds());
                case 'a':    case 'A':    return hours >= 12 ? 'PM' : 'AM';
                default:     return t.slice(1, -1); // quoted literal
            }
        });
    }

    function formatTime(date, el) {
        var tf = el.timeFormat || 'HH:mm:ss';
        if (tf === '12') tf = 'hh:mm:ss a';
        else if (tf === '24') tf = 'HH:mm:ss';
        if (el.showSeconds === false) {
            tf = tf.replace(/[:.]s{1,2}/, '').replace(/s{1,2}/, '');
        }
        return formatDateTokens(date, tf);
    }

    function formatDate(date, el) {
        var df = el.dateFormat || 'short';
        return formatDateTokens(date, DATE_FORMAT_ALIASES[df] || df);
    }

    function _font(weight, size, family) {
        return (weight || 'normal') + ' ' + size + 'px ' + (family || 'Arial');
    }

    function _resetShadow(ctx) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    function _num(v, def) {
        return (typeof v === 'number' && !isNaN(v)) ? v : def;
    }

    /**
     * Draw one text line vertically centered on centerY.
     */
    function _drawLine(ctx, el, text, font, color, x, centerY, align) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        if (el.textShadow && typeof CanvasBase !== 'undefined' && CanvasBase.applyTextShadow) {
            CanvasBase.applyTextShadow(ctx, el);
        } else {
            _resetShadow(ctx);
        }
        ctx.fillText(text, x, centerY);
        _resetShadow(ctx);
    }

    /**
     * Build the optional date / timezone parts shared by digital & analog.
     */
    function _getExtras(ctx, el, now, forceDate, baseFontSize, scale) {
        scale = scale || 1;
        var extras = {
            gap: _num(el.dateGap, 8),
            position: (el.datePosition || 'below').toLowerCase(),
            date: null,
            tz: null
        };

        if (el.showDate || forceDate) {
            var dSize = (el.dateFontSize || Math.max(Math.round(baseFontSize * 0.4), 10)) * scale;
            var dFont = _font(el.dateFontWeight || el.fontWeight, dSize, el.fontFamily);
            var dText = formatDate(now, el);
            ctx.font = dFont;
            extras.date = {
                text: dText, font: dFont, size: dSize,
                color: el.dateColor || el.color || '#FFFFFF',
                width: ctx.measureText(dText).width
            };
        }

        if (el.showTimezone) {
            var tSize = (el.timezoneFontSize || 12) * scale;
            var tFont = _font('normal', tSize, el.fontFamily);
            var tText = _getTimezoneLabel(el);
            ctx.font = tFont;
            extras.tz = {
                text: tText, font: tFont, size: tSize,
                color: el.timezoneColor || '#888888',
                width: ctx.measureText(tText).width
            };
        }

        return extras;
    }

    function _alignAnchorX(align, w) {
        if (align === 'left') return FIT_PADDING;
        if (align === 'right') return w - FIT_PADDING;
        return w / 2;
    }

    /**
     * Largest font size <= size at which text fits in maxW x maxH.
     */
    function _fitFontSize(ctx, text, weight, size, family, maxW, maxH) {
        ctx.font = _font(weight, size, family);
        var tw = ctx.measureText(text.replace(/\d/g, '0')).width;
        var scale = Math.min(1, (maxW - FIT_PADDING * 2) / (tw || 1), maxH / size);
        return size * scale;
    }

    /* ── Analog ───────────────────────────────────────────────────── */

    /**
     * Render analog clock with optional date / timezone label.
     * The clock face shrinks to leave room for the date on datePosition.
     */
    function renderAnalogClock(ctx, el, w, h, now) {
        var ex = _getExtras(ctx, el, now, false, Math.min(w, h) * 0.12);

        // Face area
        var fx = 0, fy = 0, fw = w, fh = h;
        var tzLineH = ex.tz ? ex.tz.size + 4 : 0;
        fh -= tzLineH;

        if (ex.date) {
            var d = ex.date;
            if (ex.position === 'above') {
                fy = d.size + ex.gap; fh -= fy;
            } else if (ex.position === 'left') {
                fx = d.width + ex.gap; fw -= fx;
            } else if (ex.position === 'right') {
                fw -= d.width + ex.gap;
            } else { // below
                fh -= d.size + ex.gap;
            }
        }

        var centerX = fx + fw / 2;
        var centerY = fy + fh / 2;
        var radius = Math.max(Math.min(fw, fh) / 2 - 10, 10);

        var hours = now.getHours() % 12;
        var minutes = now.getMinutes();
        var seconds = now.getSeconds();
        var milliseconds = now.getMilliseconds();

        // Clock face background
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = el.clockFaceColor || '#ffffff';
        ctx.fill();

        // Clock border
        if ((el.clockBorderWidth || 0) > 0) {
            ctx.strokeStyle = el.clockBorderColor || '#000000';
            ctx.lineWidth = el.clockBorderWidth || 2;
            ctx.stroke();
        }

        if (el.showNumbers !== false) {
            drawNumbers(ctx, centerX, centerY, radius, el);
        }
        if (el.showHourMarkers !== false) {
            drawHourMarkers(ctx, centerX, centerY, radius, el);
        }
        if (el.showMinuteMarkers) {
            drawMinuteMarkers(ctx, centerX, centerY, radius, el);
        }

        // Angles - including smooth motion with milliseconds for the second hand
        var hourAngle = (hours + minutes / 60 + seconds / 3600) * 30; // 30 degrees per hour
        var minuteAngle = (minutes + seconds / 60) * 6;                // 6 degrees per minute
        var secondAngle = (seconds + milliseconds / 1000) * 6;         // 6 degrees per second

        drawHand(ctx, centerX, centerY, hourAngle, radius * 0.5,
                 el.hourHandWidth || 4, el.hourHandColor || '#000000');
        drawHand(ctx, centerX, centerY, minuteAngle, radius * 0.7,
                 el.minuteHandWidth || 3, el.minuteHandColor || '#000000');
        if (el.showSeconds !== false) {
            drawHand(ctx, centerX, centerY, secondAngle, radius * 0.85,
                     el.secondHandWidth || 1, el.secondHandColor || '#ff0000');
        }

        // Center dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
        ctx.fillStyle = el.centerDotColor || '#000000';
        ctx.fill();

        // Date
        if (ex.date) {
            var dt = ex.date;
            if (ex.position === 'above') {
                _drawLine(ctx, el, dt.text, dt.font, dt.color, centerX, dt.size / 2, 'center');
            } else if (ex.position === 'left') {
                _drawLine(ctx, el, dt.text, dt.font, dt.color, 0, centerY, 'left');
            } else if (ex.position === 'right') {
                _drawLine(ctx, el, dt.text, dt.font, dt.color, fx + fw + ex.gap, centerY, 'left');
            } else {
                _drawLine(ctx, el, dt.text, dt.font, dt.color, centerX,
                          centerY + radius + 10 + ex.gap + dt.size / 2, 'center');
            }
        }

        // Timezone label at the bottom
        if (ex.tz) {
            _drawLine(ctx, el, ex.tz.text, ex.tz.font, ex.tz.color, w / 2, h - ex.tz.size / 2, 'center');
        }
    }

    /**
     * Draw clock hand at specific angle
     */
    function drawHand(ctx, centerX, centerY, angleDegrees, length, width, color) {
        ctx.save();
        ctx.translate(centerX, centerY);

        // Convert degrees to radians and rotate (0 degrees = 12 o'clock)
        ctx.rotate((angleDegrees - 90) * Math.PI / 180);

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
        var romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

        for (var i = 1; i <= 12; i++) {
            var angle = (i * 30 - 90) * Math.PI / 180; // 30 degrees per hour
            var x = centerX + Math.cos(angle) * numberRadius;
            var y = centerY + Math.sin(angle) * numberRadius;
            ctx.fillText(el.romanNumerals ? romanNumerals[i - 1] : i.toString(), x, y);
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
            ctx.beginPath();
            ctx.moveTo(centerX + Math.cos(angle) * radius * 0.85, centerY + Math.sin(angle) * radius * 0.85);
            ctx.lineTo(centerX + Math.cos(angle) * radius * 0.95, centerY + Math.sin(angle) * radius * 0.95);
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
                ctx.beginPath();
                ctx.moveTo(centerX + Math.cos(angle) * radius * 0.90, centerY + Math.sin(angle) * radius * 0.90);
                ctx.lineTo(centerX + Math.cos(angle) * radius * 0.95, centerY + Math.sin(angle) * radius * 0.95);
                ctx.stroke();
            }
        }
    }

    /* ── Digital ──────────────────────────────────────────────────── */

    var MONO_SANS  = "'Roboto Mono', 'DejaVu Sans Mono', 'Droid Sans Mono', 'Liberation Mono', monospace";
    var MONO_SERIF = "'Courier New', Courier, monospace";

    /**
     * digitalStyle presets (time line only; date/timezone keep normal styling).
     *   simple   - plain text in el.fontFamily / el.color
     *   blocks   - monospace, each character on its own translucent cell
     *   neon     - monospace with a glow (el.textShadowColor, else el.color)
     *   lcd      - green Courier digits on a dark panel
     *   segments - orange Courier digits on a black panel
     */
    var DIGITAL_STYLES = {
        blocks:   { family: MONO_SANS,  weight: 'bold', cells: true },
        neon:     { family: MONO_SANS,  weight: 'bold', glow: true },
        lcd:      { family: MONO_SERIF, weight: 'bold', color: '#00ff00', panel: '#001a00' },
        segments: { family: MONO_SERIF, weight: 'bold', color: '#ff6600', panel: '#000000' }
    };
    var BLOCK_CELL_COLOR = 'rgba(0, 0, 0, 0.12)';

    function _getDigitalStyle(el) {
        return DIGITAL_STYLES[(el.digitalStyle || '').toLowerCase()] || {};
    }

    /**
     * Measure the styled time box. fitText has digits normalised to "0"
     * so the box size stays constant as the seconds tick.
     */
    function _measureTime(ctx, el, st, fitText, fontSize) {
        var T = {
            font: _font(st.weight || el.fontWeight, fontSize, st.family || el.fontFamily),
            padX: 0, h: fontSize
        };
        ctx.font = T.font;

        if (st.cells) {
            T.cellW = ctx.measureText('0').width + fontSize * 0.08;
            T.cellGap = fontSize * 0.04;
            T.h = fontSize * 1.15;
            T.w = fitText.length * T.cellW + (fitText.length - 1) * T.cellGap;
        } else if (st.panel) {
            T.padX = fontSize * 0.15;
            T.h = fontSize * 1.25;
            T.w = ctx.measureText(fitText).width + T.padX * 2;
        } else if (st.glow) {
            T.padX = fontSize * 0.12;   // room for the glow inside the clip box
            T.w = ctx.measureText(fitText).width + T.padX * 2;
        } else {
            T.w = ctx.measureText(fitText).width;
        }
        return T;
    }

    /**
     * Draw the styled time with its box's left edge at `left`, centered on centerY.
     */
    function _drawTime(ctx, el, st, text, T, fontSize, left, centerY) {
        var color = st.color || el.color || '#FFFFFF';
        var top = centerY - T.h / 2;

        if (st.cells) {
            ctx.font = T.font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (var i = 0; i < text.length; i++) {
                var cx = left + i * (T.cellW + T.cellGap);
                _resetShadow(ctx);
                ctx.fillStyle = BLOCK_CELL_COLOR;
                ctx.fillRect(cx, top, T.cellW, T.h);
                if (text.charAt(i) !== ' ') {
                    _drawLine(ctx, el, text.charAt(i), T.font, color, cx + T.cellW / 2, centerY, 'center');
                }
            }
            return;
        }

        if (st.panel) {
            _resetShadow(ctx);
            ctx.fillStyle = st.panel;
            ctx.fillRect(left, top, T.w, T.h);
            _drawLine(ctx, el, text, T.font, color, left + T.padX, centerY, 'left');
            return;
        }

        if (st.glow) {
            ctx.font = T.font;
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = el.textShadowColor || color;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            // Two passes: wide soft halo, then a tighter one for intensity
            ctx.shadowBlur = fontSize * 0.25;
            ctx.fillText(text, left + T.padX, centerY);
            ctx.shadowBlur = fontSize * 0.1;
            ctx.fillText(text, left + T.padX, centerY);
            _resetShadow(ctx);
            return;
        }

        _drawLine(ctx, el, text, T.font, color, left, centerY, 'left');
    }

    /**
     * Render digital clock with optional date (above/below/left/right)
     * and timezone label. forceDate is used by displayMode 'datetime'.
     */
    function renderDigitalClock(ctx, el, w, h, now, forceDate) {
        var baseSize = el.timeFontSize || el.fontSize || Math.min(w / 6, h * 0.6);
        baseSize = Math.max(baseSize, 10);

        var timeText = formatTime(now, el);
        // Measure with every digit as "0" so the fitted size doesn't change
        // from second to second with proportional-width digits.
        var fitText = timeText.replace(/\d/g, '0');
        var st = _getDigitalStyle(el);
        var align = (el.textAlign || 'center').toLowerCase();

        function measure(scale) {
            var L = { fontSize: baseSize * scale };
            L.time = _measureTime(ctx, el, st, fitText, L.fontSize);
            L.timeW = L.time.w;
            L.timeH = L.time.h;
            L.ex = _getExtras(ctx, el, now, forceDate, baseSize, scale);
            L.gap = L.ex.gap * scale;
            L.tzGap = 4 * scale;
            var d = L.ex.date;
            L.horizontal = !!d && (L.ex.position === 'left' || L.ex.position === 'right');
            if (!d) {
                L.blockW = L.timeW; L.blockH = L.timeH;
            } else if (L.horizontal) {
                L.blockW = L.timeW + L.gap + d.width;
                L.blockH = Math.max(L.timeH, d.size);
            } else {
                L.blockW = Math.max(L.timeW, d.width);
                L.blockH = L.timeH + L.gap + d.size;
            }
            L.totalH = L.blockH + (L.ex.tz ? L.tzGap + L.ex.tz.size : 0);
            return L;
        }

        // Shrink everything proportionally if the content overflows the box
        var L = measure(1);
        var scale = Math.min(1, (w - FIT_PADDING * 2) / L.blockW, h / L.totalH);
        if (scale < 1) L = measure(scale);

        var fontSize = L.fontSize, timeW = L.timeW, timeH = L.timeH;
        var ex = L.ex, d = ex.date, gap = L.gap, horizontal = L.horizontal;
        var blockW = L.blockW, blockH = L.blockH, tzGap = L.tzGap;
        var top = (h - L.totalH) / 2;
        var anchorX = _alignAnchorX(align, w);
        ex.gap = gap;

        // Left edge of the time box when aligned on anchorX
        var timeLeft = align === 'left' ? anchorX : (align === 'right' ? anchorX - timeW : anchorX - timeW / 2);

        if (!d) {
            _drawTime(ctx, el, st, timeText, L.time, fontSize, timeLeft, top + timeH / 2);
        } else if (horizontal) {
            var left = align === 'left' ? FIT_PADDING : (align === 'right' ? w - FIT_PADDING - blockW : (w - blockW) / 2);
            var midY = top + blockH / 2;
            if (ex.position === 'left') {
                _drawLine(ctx, el, d.text, d.font, d.color, left, midY, 'left');
                _drawTime(ctx, el, st, timeText, L.time, fontSize, left + d.width + ex.gap, midY);
            } else {
                _drawTime(ctx, el, st, timeText, L.time, fontSize, left, midY);
                _drawLine(ctx, el, d.text, d.font, d.color, left + timeW + ex.gap, midY, 'left');
            }
        } else if (ex.position === 'above') {
            _drawLine(ctx, el, d.text, d.font, d.color, anchorX, top + d.size / 2, align);
            _drawTime(ctx, el, st, timeText, L.time, fontSize, timeLeft, top + d.size + ex.gap + timeH / 2);
        } else { // below
            _drawTime(ctx, el, st, timeText, L.time, fontSize, timeLeft, top + timeH / 2);
            _drawLine(ctx, el, d.text, d.font, d.color, anchorX, top + timeH + ex.gap + d.size / 2, align);
        }

        if (ex.tz) {
            _drawLine(ctx, el, ex.tz.text, ex.tz.font, ex.tz.color,
                      anchorX, top + blockH + tzGap + ex.tz.size / 2, align);
        }
    }

    /**
     * Render date only
     */
    function renderDateOnly(ctx, el, w, h, now) {
        var text = formatDate(now, el);
        var fontSize = _fitFontSize(ctx, text, el.fontWeight, Math.max(el.fontSize || 36, 10),
                                    el.fontFamily, w, h);
        var align = (el.textAlign || 'center').toLowerCase();
        _drawLine(ctx, el, text,
                  _font(el.fontWeight, fontSize, el.fontFamily),
                  el.color || '#FFFFFF', _alignAnchorX(align, w), h / 2, align);
    }

    /**
     * Render countdown timer - DECREASES SECOND BY SECOND
     * Format: "2:02:21:28" (days:hours:mins:secs)
     * After completion, displays countdownCompleteMessage
     */
    function renderCountdown(ctx, el, w, h) {
        if (!el.targetDateTime) {
            _drawLine(ctx, el, 'No target date set', (el.fontSize || 24) + 'px Arial',
                      '#ff0000', w / 2, h / 2, 'center');
            console.warn('[CanvasClock] No targetDateTime set for countdown');
            return;
        }

        // Absolute instants - timezone does not affect the remaining time
        var now = new Date();
        var target = new Date(el.targetDateTime);
        var diff = target - now;

        var baseSize = el.timeFontSize || el.fontSize || Math.min(w / 8, h * 0.6);
        baseSize = Math.max(baseSize, 10);

        if (diff <= 0) {
            var msg = el.countdownCompleteMessage || "Time's Up!";
            var msgSize = _fitFontSize(ctx, msg, el.fontWeight, baseSize, el.fontFamily, w, h);
            _drawLine(ctx, el, msg, _font(el.fontWeight, msgSize, el.fontFamily),
                      el.color || '#FF0000', w / 2, h / 2, 'center');
            return;
        }

        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((diff % (1000 * 60)) / 1000);

        var countdownText = days + ':' + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
        var fontSize = _fitFontSize(ctx, countdownText, el.fontWeight, baseSize, el.fontFamily, w, h);
        var font = _font(el.fontWeight, fontSize, el.fontFamily);
        _drawLine(ctx, el, countdownText, font, el.timeColor || el.color || '#FFFFFF', w / 2, h / 2, 'center');

        // Optional: Show target date below countdown
        if (el.showTargetDate) {
            var targetDateString = target.getDate() + ' ' + MONTHS_SHORT[target.getMonth()] + ' ' + target.getFullYear();
            _drawLine(ctx, el, targetDateString,
                      (el.dateFontSize || fontSize * 0.4) + 'px ' + (el.fontFamily || 'Arial'),
                      el.dateColor || '#AAAAAA', w / 2, h / 2 + fontSize / 2 + 20, 'center');
        }
    }

    /**
     * Pad number with leading zero
     */
    function pad(num) {
        return num < 10 ? '0' + num : String(num);
    }


    /* ── DOM clock overlay for video background / animation mode ──
     * The wrapper div is what CanvasAnimation animates; inside it a small
     * <canvas> is redrawn every second with the same _drawContent() used
     * by the main canvas, so layout (date position, timezone) is identical. */
    var _clockDomOverlays = {};   // { elId -> { wrap, canvas, timer } }

    function _redrawDomCanvas(cvs, el) {
        var ctx2 = cvs.getContext('2d');
        if (!ctx2) return;
        ctx2.clearRect(0, 0, cvs.width, cvs.height);
        _drawContent(ctx2, el, cvs.width, cvs.height);
    }

    function _renderAsDom(el) {
        var elId = String(el.id || el.name || 'clock');

        if (_clockDomOverlays[elId]) {
            _redrawDomCanvas(_clockDomOverlays[elId].canvas, el);
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
            var bgOpacity = typeof el.backgroundOpacity !== 'undefined' ? el.backgroundOpacity : 1;
            wrap.style.backgroundColor = CanvasBase.parseColorWithOpacity(el.backgroundColor, bgOpacity);
        }
        if (el.rotation && el.rotation !== 0) {
            wrap.style.transform       = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform = 'rotate(' + el.rotation + 'deg)';
            wrap.style.transformOrigin = 'center center';
        }
        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        var cvs = document.createElement('canvas');
        cvs.width  = w;
        cvs.height = h;
        cvs.style.cssText = 'display:block;width:' + w + 'px;height:' + h + 'px;';
        wrap.appendChild(cvs);

        var overlayEntry = { wrap: wrap, canvas: cvs, timer: null };
        _redrawDomCanvas(cvs, el);

        overlayEntry.timer = setInterval(function () {
            if (!wrap.parentNode) {
                clearInterval(overlayEntry.timer);
                delete _clockDomOverlays[elId];
                return;
            }
            _redrawDomCanvas(cvs, el);
        }, 1000);

        // Hide until animation fires (prevents flash at natural position on first load)
        var hasAnimation = el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none';
        if (hasAnimation) {
            wrap.style.visibility = 'hidden';
        }
        container.appendChild(wrap);
        _clockDomOverlays[elId] = overlayEntry;

        // Apply CSS animation if configured on this element
        if (hasAnimation && typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
            CanvasAnimation.applyAnimation(el, null);
        }

        console.log('[CanvasClock] DOM clock overlay created:', elId);
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
