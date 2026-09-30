/**
 * CANVAS WEATHER WIDGET RENDERER - VERTICALLY ALIGNED VERSION
 * ✅ Icons perfectly aligned with text baseline
 * 🎨 Matches screenshot design exactly
 */
var CanvasWeather = (function() {
    'use strict';

    /**
     * 🎨 Draw detailed weather condition icons
     */
    function drawWeatherIcon(ctx, weatherCode, x, y, size) {
        ctx.save();
        
        var centerX = x + size / 2;
        var centerY = y + size / 2;
        
        // Determine icon type from weather code
        var iconType = 'sunny';
        if ([0].indexOf(weatherCode) >= 0) iconType = 'sunny';
        else if ([1].indexOf(weatherCode) >= 0) iconType = 'partly-cloudy';
        else if ([2].indexOf(weatherCode) >= 0) iconType = 'partly-cloudy-2';
        else if ([3, 45, 48].indexOf(weatherCode) >= 0) iconType = 'cloudy';
        else if ([51, 53, 55, 61, 63, 65].indexOf(weatherCode) >= 0) iconType = 'rain';
        else if ([71, 73, 75, 77, 85, 86].indexOf(weatherCode) >= 0) iconType = 'snow';
        else if ([80, 81, 82].indexOf(weatherCode) >= 0) iconType = 'showers';
        else if ([95, 96, 99].indexOf(weatherCode) >= 0) iconType = 'thunderstorm';
        
        switch(iconType) {
            case 'sunny':
                // ☀️ Bright yellow sun with rays
                ctx.fillStyle = '#FFD700';
                ctx.strokeStyle = '#FFD700';
                
                // Center circle
                ctx.beginPath();
                ctx.arc(centerX, centerY, size * 0.25, 0, Math.PI * 2);
                ctx.fill();
                
                // 8 sun rays
                ctx.lineWidth = size * 0.06;
                ctx.lineCap = 'round';
                for (var i = 0; i < 8; i++) {
                    var angle = (Math.PI * 2 / 8) * i;
                    var innerRadius = size * 0.32;
                    var outerRadius = size * 0.48;
                    
                    ctx.beginPath();
                    ctx.moveTo(
                        centerX + Math.cos(angle) * innerRadius,
                        centerY + Math.sin(angle) * innerRadius
                    );
                    ctx.lineTo(
                        centerX + Math.cos(angle) * outerRadius,
                        centerY + Math.sin(angle) * outerRadius
                    );
                    ctx.stroke();
                }
                break;
                
            case 'partly-cloudy':
                // 🌤️ Sun behind cloud
                // Draw sun (top-left)
                var sunX = centerX - size * 0.15;
                var sunY = centerY - size * 0.15;
                
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(sunX, sunY, size * 0.18, 0, Math.PI * 2);
                ctx.fill();
                
                // Sun rays (shorter)
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = size * 0.05;
                ctx.lineCap = 'round';
                for (var j = 0; j < 6; j++) {
                    var angle2 = (Math.PI * 2 / 6) * j;
                    var innerR = size * 0.22;
                    var outerR = size * 0.32;
                    
                    ctx.beginPath();
                    ctx.moveTo(
                        sunX + Math.cos(angle2) * innerR,
                        sunY + Math.sin(angle2) * innerR
                    );
                    ctx.lineTo(
                        sunX + Math.cos(angle2) * outerR,
                        sunY + Math.sin(angle2) * outerR
                    );
                    ctx.stroke();
                }
                
                // Draw cloud (bottom-right)
                drawDetailedCloud(ctx, centerX + size * 0.1, centerY + size * 0.1, size * 0.4, '#E8E8E8');
                break;
                
            case 'partly-cloudy-2':
                // ⛅ Larger cloud with sun
                // Sun peeking from behind
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(centerX - size * 0.2, centerY - size * 0.1, size * 0.2, 0, Math.PI * 2);
                ctx.fill();
                
                // Cloud in front
                drawDetailedCloud(ctx, centerX + size * 0.05, centerY + size * 0.05, size * 0.45, '#D0D0D0');
                break;
                
            case 'cloudy':
                // ☁️ Full cloud
                drawDetailedCloud(ctx, centerX, centerY, size * 0.5, '#AAAAAA');
                break;
                
            case 'rain':
                // 🌧️ Cloud with rain drops
                drawDetailedCloud(ctx, centerX, centerY - size * 0.1, size * 0.4, '#888888');
                
                // Rain drops (detailed)
                ctx.strokeStyle = '#4A90E2';
                ctx.lineWidth = size * 0.05;
                ctx.lineCap = 'round';
                
                for (var k = 0; k < 4; k++) {
                    var dropX = centerX - size * 0.25 + k * size * 0.17;
                    var dropY = centerY + size * 0.15;
                    
                    // Drop line
                    ctx.beginPath();
                    ctx.moveTo(dropX, dropY);
                    ctx.lineTo(dropX - size * 0.03, dropY + size * 0.2);
                    ctx.stroke();
                    
                    // Drop tip
                    ctx.fillStyle = '#4A90E2';
                    ctx.beginPath();
                    ctx.arc(dropX - size * 0.03, dropY + size * 0.2, size * 0.025, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'showers':
                // 🌦️ Cloud with sun and rain
                // Small sun
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(centerX - size * 0.2, centerY - size * 0.15, size * 0.15, 0, Math.PI * 2);
                ctx.fill();
                
                // Cloud
                drawDetailedCloud(ctx, centerX + size * 0.05, centerY - size * 0.05, size * 0.38, '#999999');
                
                // Rain
                ctx.strokeStyle = '#5BA3E8';
                ctx.lineWidth = size * 0.04;
                ctx.lineCap = 'round';
                for (var m = 0; m < 3; m++) {
                    var rx = centerX - size * 0.15 + m * size * 0.15;
                    ctx.beginPath();
                    ctx.moveTo(rx, centerY + size * 0.15);
                    ctx.lineTo(rx - size * 0.02, centerY + size * 0.28);
                    ctx.stroke();
                }
                break;
                
            case 'snow':
                // 🌨️ Cloud with snowflakes
                drawDetailedCloud(ctx, centerX, centerY - size * 0.1, size * 0.4, '#B0B0B0');
                
                // Detailed snowflakes
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = size * 0.04;
                ctx.lineCap = 'round';
                
                for (var n = 0; n < 4; n++) {
                    var snowX = centerX - size * 0.25 + n * size * 0.17;
                    var snowY = centerY + size * 0.2;
                    drawDetailedSnowflake(ctx, snowX, snowY, size * 0.1);
                }
                break;
                
            case 'thunderstorm':
                // ⛈️ Dark cloud with lightning
                drawDetailedCloud(ctx, centerX, centerY - size * 0.15, size * 0.45, '#555555');
                
                // Lightning bolt (detailed)
                ctx.fillStyle = '#FFD700';
                ctx.strokeStyle = '#FFF700';
                ctx.lineWidth = size * 0.03;
                ctx.lineJoin = 'miter';
                
                ctx.beginPath();
                ctx.moveTo(centerX + size * 0.08, centerY - size * 0.05);
                ctx.lineTo(centerX - size * 0.02, centerY + size * 0.1);
                ctx.lineTo(centerX + size * 0.04, centerY + size * 0.1);
                ctx.lineTo(centerX - size * 0.08, centerY + size * 0.35);
                ctx.lineTo(centerX + size * 0.02, centerY + size * 0.15);
                ctx.lineTo(centerX - size * 0.03, centerY + size * 0.15);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;
        }
        
        ctx.restore();
    }
    
    /**
     * 🎨 Draw detailed cloud shape
     */
    function drawDetailedCloud(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        
        // Left puff
        ctx.arc(x - size * 0.35, y + size * 0.05, size * 0.25, 0, Math.PI * 2);
        
        // Middle-left puff
        ctx.arc(x - size * 0.15, y - size * 0.15, size * 0.3, 0, Math.PI * 2);
        
        // Center puff (largest)
        ctx.arc(x + size * 0.05, y - size * 0.2, size * 0.35, 0, Math.PI * 2);
        
        // Right puff
        ctx.arc(x + size * 0.3, y + size * 0.05, size * 0.28, 0, Math.PI * 2);
        
        ctx.fill();
        
        // Bottom fill
        ctx.fillRect(x - size * 0.55, y + size * 0.05, size * 1.1, size * 0.25);
    }
    
    /**
     * 🎨 Draw detailed snowflake
     */
    function drawDetailedSnowflake(ctx, x, y, size) {
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = size * 0.12;
        ctx.lineCap = 'round';
        
        // 6 branches
        for (var i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            
            // Main branch
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, size);
            ctx.stroke();
            
            // Side branches
            ctx.beginPath();
            ctx.moveTo(0, size * 0.6);
            ctx.lineTo(-size * 0.2, size * 0.8);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, size * 0.6);
            ctx.lineTo(size * 0.2, size * 0.8);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    /**
     * 🎨 Draw detailed UI icons (matching screenshot style)
     */
    function drawIcon(ctx, iconName, x, y, size) {
        ctx.save();
        
        var centerX = x + size / 2;
        var centerY = y + size / 2;
        
        switch(iconName) {
            case 'thermometer':
                // 🌡️ Pink/red thermometer
                var bulbRadius = size * 0.2;
                var tubeWidth = size * 0.15;
                var tubeHeight = size * 0.55;
                
                // Bulb (bottom circle)
                ctx.fillStyle = '#FF6B9D';
                ctx.beginPath();
                ctx.arc(centerX, centerY + size * 0.25, bulbRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Tube (outer - light gray)
                ctx.fillStyle = '#E0E0E0';
                ctx.fillRect(
                    centerX - tubeWidth / 2,
                    centerY - size * 0.35,
                    tubeWidth,
                    tubeHeight
                );
                
                // Round top of tube
                ctx.beginPath();
                ctx.arc(centerX, centerY - size * 0.35, tubeWidth / 2, Math.PI, 0);
                ctx.fill();
                
                // Mercury (inner - pink/red)
                ctx.fillStyle = '#FF6B9D';
                var mercuryWidth = size * 0.08;
                ctx.fillRect(
                    centerX - mercuryWidth / 2,
                    centerY - size * 0.15,
                    mercuryWidth,
                    size * 0.4
                );
                
                // Temperature marks
                ctx.strokeStyle = '#999999';
                ctx.lineWidth = size * 0.02;
                for (var i = 0; i < 5; i++) {
                    var markY = centerY - size * 0.3 + i * size * 0.12;
                    ctx.beginPath();
                    ctx.moveTo(centerX + tubeWidth / 2 + size * 0.02, markY);
                    ctx.lineTo(centerX + tubeWidth / 2 + size * 0.08, markY);
                    ctx.stroke();
                }
                break;
                
            case 'droplet':
                // 💧 Blue water droplet
                ctx.fillStyle = '#4A9FE8';
                
                // Droplet shape
                ctx.beginPath();
                ctx.moveTo(centerX, centerY - size * 0.35);
                
                // Right curve
                ctx.bezierCurveTo(
                    centerX + size * 0.28, centerY - size * 0.2,
                    centerX + size * 0.28, centerY + size * 0.15,
                    centerX, centerY + size * 0.35
                );
                
                // Left curve
                ctx.bezierCurveTo(
                    centerX - size * 0.28, centerY + size * 0.15,
                    centerX - size * 0.28, centerY - size * 0.2,
                    centerX, centerY - size * 0.35
                );
                
                ctx.fill();
                
                // Highlight (lighter blue)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.beginPath();
                ctx.arc(centerX - size * 0.08, centerY - size * 0.1, size * 0.12, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'wind':
                // 💨 Gray/purple wind lines
                ctx.strokeStyle = '#9B9BAB';
                ctx.lineCap = 'round';
                
                // Three curved wind lines
                var lines = [
                    { y: -0.2, length: 0.7, thickness: 0.08, curve: 0.15 },
                    { y: 0, length: 0.6, thickness: 0.1, curve: 0.1 },
                    { y: 0.2, length: 0.5, thickness: 0.08, curve: 0.12 }
                ];
                
                lines.forEach(function(line) {
                    ctx.lineWidth = size * line.thickness;
                    ctx.beginPath();
                    
                    var startX = centerX - size * line.length / 2;
                    var endX = centerX + size * line.length / 2;
                    var lineY = centerY + size * line.y;
                    
                    // Curved line
                    ctx.moveTo(startX, lineY);
                    ctx.quadraticCurveTo(
                        centerX,
                        lineY - size * line.curve,
                        endX,
                        lineY
                    );
                    ctx.stroke();
                });
                break;
                
            case 'eye':
                // 👁️ Purple eye icon
                ctx.strokeStyle = '#8B7AB8';
                ctx.fillStyle = '#8B7AB8';
                ctx.lineWidth = size * 0.08;
                
                // Eye outline
                ctx.beginPath();
                ctx.ellipse(centerX, centerY, size * 0.4, size * 0.22, 0, 0, Math.PI * 2);
                ctx.stroke();
                
                // Pupil
                ctx.beginPath();
                ctx.arc(centerX, centerY, size * 0.15, 0, Math.PI * 2);
                ctx.fill();
                
                // Highlight
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(centerX - size * 0.05, centerY - size * 0.05, size * 0.05, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'location':
                // 📍 Pink/red location pin
                ctx.fillStyle = '#FF6B9D';
                
                // Pin top circle
                ctx.beginPath();
                ctx.arc(centerX, centerY - size * 0.1, size * 0.22, 0, Math.PI * 2);
                ctx.fill();
                
                // Pin point (bottom triangle)
                ctx.beginPath();
                ctx.moveTo(centerX - size * 0.15, centerY + size * 0.08);
                ctx.lineTo(centerX, centerY + size * 0.4);
                ctx.lineTo(centerX + size * 0.15, centerY + size * 0.08);
                ctx.closePath();
                ctx.fill();
                
                // Inner white circle
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(centerX, centerY - size * 0.1, size * 0.1, 0, Math.PI * 2);
                ctx.fill();
                break;
        }
        
        ctx.restore();
    }

    /* ── DOM overlay for video background mode ─────────────────── */
    var _weatherDomOverlays = [];

    function _isVideoBg() {
        try {
            var tj = Main.jsonTemplateData && Main.jsonTemplateData.template_json;
            return !!(tj && tj.canvas && tj.canvas.backgroundType === 'video');
        } catch (e) { return false; }
    }

    /**
     * Creates a small <canvas> with the drawn weather condition icon and returns
     * it as a base64 data-URL <img> tag — used in DOM overlay so the condition
     * icon looks identical to the canvas-drawn version (via drawWeatherIcon)
     * without relying on unicode emoji support.
     */
    function _weatherIconImgTag(weatherCode, size) {
        try {
            var c = document.createElement('canvas');
            c.width  = size;
            c.height = size;
            var ctx2 = c.getContext('2d');
            drawWeatherIcon(ctx2, weatherCode, 0, 0, size);
            return '<img src="' + c.toDataURL() + '" width="' + size + '" height="' + size +
                   '" style="vertical-align:middle;display:inline-block;">';
        } catch(e) {
            // Fallback to unicode if canvas fails
            return '<span style="font-size:' + size + 'px;vertical-align:middle;">' +
                   _weatherUnicode(weatherCode) + '</span>';
        }
    }

    /**
     * Creates a small <canvas> with the drawn icon and returns it as a
     * base64 data-URL <img> tag — used in DOM overlay for droplet/wind icons.
     */
    function _iconImgTag(iconName, size) {
        try {
            var c = document.createElement('canvas');
            c.width  = size;
            c.height = size;
            var ctx2 = c.getContext('2d');
            drawIcon(ctx2, iconName, 0, 0, size);
            return '<img src="' + c.toDataURL() + '" width="' + size + '" height="' + size +
                   '" style="vertical-align:middle;display:inline-block;">';
        } catch(e) {
            return '';
        }
    }

    function _renderWeatherAsDom(el) {
        if (!el.weatherData) return;
        var data = el.weatherData;

        var canvas = document.getElementById('templateCanvas');
        var container = document.getElementById('our-hotel-container');
        if (!container && canvas) container = canvas.parentElement;
        if (!container) return;
        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }

        var elId = String(el.id || el.name || 'weather');
        // Remove stale overlay
        var stale = document.querySelectorAll('[data-canvas-weather-id="' + elId + '"]');
        for (var s = 0; s < stale.length; s++) {
            if (stale[s].parentNode) stale[s].parentNode.removeChild(stale[s]);
        }

        var x       = Math.floor(el.x      || 0);
        var y       = Math.floor(el.y      || 0);
        var w       = Math.ceil(el.width   || 200);
        var h       = Math.ceil(el.height  || 100);
        var opacity = typeof el.opacity !== 'undefined' ? el.opacity : 1;
        var zIndex  = (el.zIndex && el.zIndex !== 'auto' && !isNaN(Number(el.zIndex)))
                      ? Math.max(20, Number(el.zIndex) + 10) : 20;
        var padding = el.backgroundPadding || 10;
        var baseFontSize = el.fontSize || 40;

        var wrap = document.createElement('div');
        wrap.setAttribute('data-canvas-weather-id', elId);
        wrap.style.cssText = 'position:absolute;pointer-events:none;margin:0;box-sizing:border-box;';
        wrap.style.left      = x + 'px';
        wrap.style.top       = y + 'px';
        wrap.style.minWidth  = w + 'px';
        wrap.style.minHeight = h + 'px';
        wrap.style.opacity      = String(opacity);
        wrap.style.zIndex       = String(zIndex);
        wrap.style.padding      = padding + 'px';
        wrap.style.borderRadius = (el.backgroundRadius || 0) + 'px';
        wrap.style.fontFamily   = el.textFont || 'Arial';
        wrap.style.color        = el.textColor || el.color || '#ffffff';

        if (el.backgroundColor && el.backgroundColor !== 'transparent' &&
            !el.backgroundColor.endsWith('00')) {
            wrap.style.backgroundColor = el.backgroundColor;
        }

        if (el.rotation && el.rotation !== 0) {
            wrap.style.transform       = 'rotate(' + el.rotation + 'deg)';
            wrap.style.webkitTransform = 'rotate(' + el.rotation + 'deg)';
            wrap.style.transformOrigin = 'center center';
        }

        /* ── Build HTML mirroring all 3 canvas render modes ── */
        var html        = '';
        var fw          = el.textBold ? 'bold' : 'normal';
        var tempValue   = data.temperature
            ? (el.unit === 'fahrenheit' ? data.temperature.fahrenheit : data.temperature.celsius)
            : '--';
        var tempUnit    = el.unit === 'fahrenheit' ? '&deg;F' : '&deg;C';
        var displayMode = el.weatherDisplayMode;
        var hasFlags    = el.showHumidity || el.showWindSpeed || el.showConditions || el.showVisibility;

        // ── Text style flags ──
        var domItalic    = el.textItalic    ? 'italic'    : 'normal';
        var domShadow    = el.textShadow
            ? ('2px 2px ' + (el.textShadowBlur || 4) + 'px ' + (el.textShadowColor || '#000000'))
            : 'none';
        var domUnderline = el.textUnderline; // boolean – applied selectively per mode below

        var ICO_HUMIDITY  = '&#128167;';          // 💧
        var ICO_WIND      = '&#128168;';          // 💨
        var ICO_EYE       = '&#128065;&#65039;';  // 👁️
        var ICO_PIN       = '&#128205;';          // 📍

        /* ── Weather condition icon: drawn via drawWeatherIcon on a temp canvas ── */
        var condIconSize = baseFontSize;
        var ICO_CONDITION = _weatherIconImgTag(data.weatherCode, condIconSize);

        /* Title row — shared by all modes */
        function _titleHtml() {
            if (!el.showTitle || (!el.titleLabel && !(data && data.location))) return '';
            var t   = el.titleLabel || (data && data.location) || 'Location';
            var tfs = el.titleFontSize || 20;
            return '<div style="font-size:' + tfs + 'px;font-weight:' + (el.titleBold ? 'bold' : 'normal') +
                   ';color:' + (el.titleColor || '#ffffff') + ';margin-bottom:8px;white-space:nowrap;">' +
                   ICO_PIN + '&nbsp;' + _escapeHtml(t) + '</div>';
        }

        /* Standard detail row — with optional underline applied to <span> text only */
        function _row(icon, text, mb, applyUnderline) {
            var ul = applyUnderline ? 'text-decoration:underline;' : '';
            return '<div style="font-size:' + baseFontSize + 'px;font-weight:' + fw +
                   ';font-style:' + domItalic + ';text-shadow:' + domShadow +
                   ';white-space:nowrap;margin-bottom:' + (mb || 0) + 'px;' +
                   'display:flex;align-items:center;gap:8px;">' +
                   '<span style="flex-shrink:0;">' + icon + '</span>' +
                   '<span style="' + ul + '">' + text + '</span></div>';
        }

        if (displayMode === 'detailed') {
            /* ── MODE 1: detailed — mirrors renderDetailedWeather() ── */
            html += _titleHtml();
            // detailed mode: textUnderline does NOT apply to temperature
            html += _row(_thermoImgTag(baseFontSize), tempValue + tempUnit, 6, false);
            if (el.showConditions && data.conditions)
                html += _row(ICO_CONDITION, _escapeHtml(data.conditions), 6, domUnderline);
            if (el.showHumidity && typeof data.humidity !== 'undefined')
                html += _row(ICO_HUMIDITY, 'Humidity: ' + data.humidity + '%', 6, domUnderline);
            if (el.showWindSpeed && typeof data.windSpeed !== 'undefined')
                html += _row(ICO_WIND, 'Wind: ' + data.windSpeed + ' km/h', 6, domUnderline);
            if (el.showVisibility && typeof data.visibility !== 'undefined')
                html += _row(ICO_EYE, 'Visibility: ' + data.visibility + ' km', 0, false);

        } else if (hasFlags && (displayMode === 'simple' || !displayMode)) {
            /* ── MODE 2: 'simple' / inline — NO title, tight separator
               Row 1: [weather icon]  26°C
               Row 2: Clear · [droplet] 66% · [wind] 15.2 km/h              */

            var subFs   = Math.max(13, Math.round(baseFontSize * 0.42));
            var iconSz  = Math.round(subFs * 0.9);
            var gapPx   = Math.max(2, Math.round(subFs * 0.18));

            // simple mode: textUnderline → underline temperature
            var tempUl = domUnderline ? 'text-decoration:underline;' : '';

            /* Row 1 — drawn weather condition icon + temperature */
            html += '<div style="font-size:' + baseFontSize + 'px;font-weight:' + fw +
                    ';font-style:' + domItalic + ';text-shadow:' + domShadow +
                    ';white-space:nowrap;margin-bottom:2px;display:flex;align-items:center;gap:6px;">' +
                    ICO_CONDITION + '&nbsp;<span style="' + tempUl + '">' + tempValue + tempUnit + '</span></div>';

            /* Row 2 — drawn icons for humidity and wind (replaces _dotSpan) */
            var parts = [];
            if (el.showConditions && data.conditions)
                parts.push(_escapeHtml(data.conditions));
            if (el.showHumidity && typeof data.humidity !== 'undefined')
                parts.push(_iconImgTag('droplet', iconSz) +
                           '<span style="margin-left:' + gapPx + 'px;">' + data.humidity + '%</span>');
            if (el.showWindSpeed && typeof data.windSpeed !== 'undefined')
                parts.push(_iconImgTag('wind', iconSz) +
                           '<span style="margin-left:' + gapPx + 'px;">' + data.windSpeed + ' km/h</span>');
            if (el.showVisibility && typeof data.visibility !== 'undefined')
                parts.push(_iconImgTag('eye', iconSz) +
                           '<span style="margin-left:' + gapPx + 'px;">' + data.visibility + ' km</span>');
            if (parts.length) {
                html += '<div style="font-size:' + subFs + 'px;white-space:nowrap;opacity:0.95;' +
                        'display:flex;align-items:center;gap:' + gapPx + 'px;">' +
                        parts.join('<span style="margin:0 ' + gapPx + 'px;">&middot;</span>') + '</div>';
            }

        } else {
            /* ── MODE 3: compact — mirrors renderCompactWeather() ── */
            var compTempUl = domUnderline ? 'text-decoration:underline;' : '';
            html += _titleHtml();
            html += '<div style="font-size:' + baseFontSize + 'px;font-weight:' + fw +
                    ';font-style:' + domItalic + ';text-shadow:' + domShadow +
                    ';white-space:nowrap;display:flex;align-items:center;gap:6px;">' +
                    ICO_CONDITION + '&nbsp;<span style="' + compTempUl + '">' + tempValue + tempUnit + '</span></div>';
        }

        wrap.innerHTML = html;

        // Hide until animation fires (prevents flash at natural position on first load)
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            wrap.style.visibility = 'hidden';
        }
        container.appendChild(wrap);
        _weatherDomOverlays.push(wrap);

        // Apply CSS animation if configured on this element
        if (el.animation && el.animation.enabled && el.animation.type && el.animation.type !== 'none') {
            if (typeof CanvasAnimation !== 'undefined' && CanvasAnimation.applyAnimation) {
                CanvasAnimation.applyAnimation(el, null);
            }
        }

        console.log('[CanvasWeather] DOM overlay created:', elId);
    }

    function _weatherUnicode(code) {
        if (code === 0)                              return '&#9728;&#65039;';
        if (code === 1)                              return '&#127780;&#65039;';
        if (code === 2)                              return '&#9925;';
        if ([3,45,48].indexOf(code) >= 0)            return '&#9729;&#65039;';
        if ([51,53,55,61,63,65].indexOf(code) >= 0) return '&#127783;&#65039;';
        if ([71,73,75,77,85,86].indexOf(code) >= 0) return '&#127784;&#65039;';
        if ([80,81,82].indexOf(code) >= 0)           return '&#127782;&#65039;';
        if ([95,96,99].indexOf(code) >= 0)           return '&#9928;&#65039;';
        return '&#9925;';
    }

    function _escapeHtml(t) {
        return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /**
     * Creates a small <canvas> with the drawn thermometer icon and returns it as a
     * base64 data-URL <img> tag — used in DOM overlay so thermometer looks identical
     * to the canvas-drawn version without relying on unicode emoji support.
     */
    function _thermoImgTag(size) {
        try {
            var c = document.createElement('canvas');
            c.width  = size;
            c.height = size;
            var ctx2 = c.getContext('2d');
            drawIcon(ctx2, 'thermometer', 0, 0, size);
            return '<img src="' + c.toDataURL() + '" width="' + size + '" height="' + size +
                   '" style="vertical-align:middle;display:inline-block;">';
        } catch(e) {
            return '<span style="font-size:' + size + 'px;vertical-align:middle;">&#127777;&#65039;</span>';
        }
    }

    function cleanupWeather() {
        for (var i = 0; i < _weatherDomOverlays.length; i++) {
            if (_weatherDomOverlays[i] && _weatherDomOverlays[i].parentNode)
                _weatherDomOverlays[i].parentNode.removeChild(_weatherDomOverlays[i]);
        }
        _weatherDomOverlays = [];
    }

    function render(ctx, el) {
        if (!el.weatherData) {
            console.warn('[CanvasWeather] No weather data available');
            return;
        }

        // VIDEO BACKGROUND or ANIMATION ENABLED: use DOM overlay.
        // CSS animations require DOM elements - canvas pixels cannot be animated.
        var _hasAnimation = el.animation && el.animation.enabled &&
                            el.animation.type && el.animation.type !== 'none';
        if (_hasAnimation || _isVideoBg()) {
            _renderWeatherAsDom(el);
            return;
        }

        ctx.save();
        CanvasBase.applyTransformations(ctx, el);
        
        // Background
        if (el.backgroundColor && el.backgroundColor !== 'transparent' && !el.backgroundColor.endsWith('00')) {
            ctx.fillStyle = CanvasBase.parseColorWithOpacity(el.backgroundColor, el.opacity);
            var radius = el.backgroundRadius || 0;
            if (radius > 0) {
                CanvasBase.roundRect(ctx, 0, 0, el.width, el.height, radius);
                ctx.fill();
            } else {
                ctx.fillRect(0, 0, el.width, el.height);
            }
        }
        
        var data        = el.weatherData;
        var displayMode = el.weatherDisplayMode;
        var hasFlags    = el.showHumidity || el.showWindSpeed || el.showConditions || el.showVisibility;

        if (displayMode === 'detailed') {
            renderDetailedWeather(ctx, el, data);
        } else if (hasFlags && (displayMode === 'simple' || !displayMode)) {
            renderInlineWeather(ctx, el, data);
        } else {
            renderCompactWeather(ctx, el, data);
        }
        
        ctx.restore();
    }

    /**
     * Draw a canvas icon identified by name, vertically centred at (x, middleY).
     * Returns the icon size as width consumed so callers can offset following text.
     */
    function drawCanvasIcon(ctx, iconName, x, middleY, size) {
        if (iconName === 'weather') {
            return size;
        }
        drawIcon(ctx, iconName, x, middleY - size / 2, size);
        return size;
    }

    /**
     * Draw weather condition icon on canvas centred at middleY. Returns size.
     */
    function drawCanvasWeatherIcon(ctx, weatherCode, x, middleY, size) {
        drawWeatherIcon(ctx, weatherCode, x, middleY - size / 2, size);
        return size;
    }

    /**
     * Render detailed weather widget
     */
    function renderDetailedWeather(ctx, el, data) {
        var padding = el.backgroundPadding || 10;
        var currentY = padding;
        var baseFontSize = el.fontSize || 50;
        var iconSize = Math.round(baseFontSize * 0.85);

        // ── Text style helpers ──────────────────────────────────────────
        var isDetailed   = (el.weatherDisplayMode === 'detailed');
        var useItalic    = !!el.textItalic;
        var useShadow    = !!el.textShadow;
        var shadowColor  = el.textShadowColor || '#000000';
        var shadowBlur   = el.textShadowBlur  || 4;
        var useUnderline = !!el.textUnderline;

        /** Apply text shadow to ctx (call before fillText) */
        function _applyShadow() {
            if (useShadow) {
                ctx.shadowColor = shadowColor;
                ctx.shadowBlur  = shadowBlur;
            }
        }
        /** Clear text shadow from ctx (call after fillText) */
        function _clearShadow() {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur  = 0;
        }

        /**
         * Draw an underline beneath text that was just painted.
         * @param {number} textX   - x where the text string starts
         * @param {number} middleY - baseline‑middle Y used with textBaseline:'middle'
         * @param {string} text    - the string that was drawn (used for width measure)
         * @param {number} fs      - font size in px
         */
        function _drawUnderline(textX, middleY, text, fs) {
            var tw   = ctx.measureText(text).width;
            var lineY = middleY + fs * 0.55;   // just below the glyph descenders
            var lw    = Math.max(1, fs * 0.06);
            ctx.save();
            ctx.strokeStyle = el.textColor || el.color || '#FFFFFF';
            ctx.lineWidth   = lw;
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur  = 0;
            ctx.beginPath();
            ctx.moveTo(textX, lineY);
            ctx.lineTo(textX + tw, lineY);
            ctx.stroke();
            ctx.restore();
        }

        /** Build the font string for body text rows */
        function _bodyFont(fs) {
            return (el.textBold ? 'bold ' : '') +
                   (useItalic ? 'italic ' : '') +
                   (fs || baseFontSize) + 'px ' + (el.textFont || 'Arial');
        }
        // ────────────────────────────────────────────────────────────────

        if (el.showTitle && (el.titleLabel || data.location)) {
            var titleText = el.titleLabel || data.location || 'Location';
            var titleFontSize = el.titleFontSize || 20;

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = el.titleColor || '#FFFFFF';

            var titleMiddleY = currentY + titleFontSize / 2;
            var pinW = drawCanvasIcon(ctx, 'location', padding, titleMiddleY, Math.round(titleFontSize * 1.1));

            ctx.font = (el.titleBold ? 'bold ' : '') +
                       (el.titleItalic ? 'italic ' : '') +
                       titleFontSize + 'px ' + (el.titleFont || 'Arial');
            ctx.fillStyle = el.titleColor || '#FFFFFF';
            ctx.fillText(titleText, padding + pinW + 6, titleMiddleY);

            currentY += titleFontSize + 15;
        }

        ctx.font      = _bodyFont();
        ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        var tempValue = data.temperature
            ? (el.unit === 'fahrenheit' ? data.temperature.fahrenheit : data.temperature.celsius)
            : '--';
        var tempUnit = el.unit === 'fahrenheit' ? '\u00b0F' : '\u00b0C';
        var tempText = tempValue + tempUnit;
        var textMiddleY = currentY + baseFontSize / 2;
        var tempTextX   = padding + iconSize + 12;

        drawIcon(ctx, 'thermometer', padding, textMiddleY - iconSize / 2, iconSize);
        ctx.font = _bodyFont();
        _applyShadow();
        ctx.fillText(tempText, tempTextX, textMiddleY);
        _clearShadow();

        // In detailed mode: underline temperature only when textUnderline is true
        //   (detailed-specific rows — humidity/condition/wind — are handled below)
        // In non-detailed mode: underline temperature (handled in the other render fns)
        if (useUnderline && isDetailed) {
            // detailed mode → underline temperature is NOT underlined; only humidity/condition/wind are
            // (temperature intentionally skipped — see below where the detailed rows are drawn)
        } else if (useUnderline && !isDetailed) {
            _drawUnderline(tempTextX, textMiddleY, tempText, baseFontSize);
        }

        currentY += baseFontSize + 12;

        if (el.showConditions && data.conditions) {
            textMiddleY = currentY + baseFontSize / 2;
            var condW   = drawCanvasWeatherIcon(ctx, data.weatherCode, padding, textMiddleY, iconSize);
            var condTextX = padding + condW + 8;
            ctx.font      = _bodyFont();
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            _applyShadow();
            ctx.fillText(data.conditions, condTextX, textMiddleY);
            _clearShadow();
            // detailed mode → underline condition
            if (useUnderline && isDetailed) _drawUnderline(condTextX, textMiddleY, data.conditions, baseFontSize);
            currentY += baseFontSize + 10;
        }

        if (el.showHumidity && typeof data.humidity !== 'undefined') {
            textMiddleY = currentY + baseFontSize / 2;
            var humW    = drawCanvasIcon(ctx, 'droplet', padding, textMiddleY, iconSize);
            var humText = 'Humidity: ' + data.humidity + '%';
            var humTextX = padding + humW + 8;
            ctx.font      = _bodyFont();
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            _applyShadow();
            ctx.fillText(humText, humTextX, textMiddleY);
            _clearShadow();
            // detailed mode → underline humidity
            if (useUnderline && isDetailed) _drawUnderline(humTextX, textMiddleY, humText, baseFontSize);
            currentY += baseFontSize + 10;
        }

        if (el.showWindSpeed && typeof data.windSpeed !== 'undefined') {
            textMiddleY = currentY + baseFontSize / 2;
            var windW   = drawCanvasIcon(ctx, 'wind', padding, textMiddleY, iconSize);
            var windText = 'Wind: ' + data.windSpeed + ' km/h';
            var windTextX = padding + windW + 8;
            ctx.font      = _bodyFont();
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            _applyShadow();
            ctx.fillText(windText, windTextX, textMiddleY);
            _clearShadow();
            // detailed mode → underline wind speed
            if (useUnderline && isDetailed) _drawUnderline(windTextX, textMiddleY, windText, baseFontSize);
            currentY += baseFontSize + 10;
        }

        if (el.showVisibility && typeof data.visibility !== 'undefined') {
            textMiddleY = currentY + baseFontSize / 2;
            var visW    = drawCanvasIcon(ctx, 'eye', padding, textMiddleY, iconSize);
            ctx.font      = _bodyFont();
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            _applyShadow();
            ctx.fillText('Visibility: ' + data.visibility + ' km', padding + visW + 8, textMiddleY);
            _clearShadow();
        }
    }

    /**
     * Inline weather — simple mode with flags.
     * Row 1: [weather icon]  26°C
     * Row 2: Clear · [droplet icon] 66% · [wind icon] 15.2 km/h
     *
     * CHANGED: replaced _dot('#4A9FE8') with drawIcon(ctx,'droplet',...)
     *          replaced _dot('#9B9BAB') with drawIcon(ctx,'wind',...)
     */
    function renderInlineWeather(ctx, el, data) {
        var padding     = el.backgroundPadding || 10;
        var fontSize    = el.fontSize || 50;
        var iconSize    = Math.round(fontSize * 1.2);
        var subFontSize = Math.max(13, Math.round(fontSize * 0.42));
        var subIconSize = Math.round(subFontSize * 0.9);
        var tempValue   = data.temperature
            ? (el.unit === 'fahrenheit' ? data.temperature.fahrenheit : data.temperature.celsius)
            : '--';
        var tempUnit    = el.unit === 'fahrenheit' ? '\u00b0F' : '\u00b0C';

        // ── Text style flags ──
        var useItalic    = !!el.textItalic;
        var useShadow    = !!el.textShadow;
        var shadowColor  = el.textShadowColor || '#000000';
        var shadowBlur   = el.textShadowBlur  || 4;
        var useUnderline = !!el.textUnderline;

        function _applyShadow() {
            if (useShadow) { ctx.shadowColor = shadowColor; ctx.shadowBlur = shadowBlur; }
        }
        function _clearShadow() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }
        function _drawUnderline(textX, middleY, text, fs) {
            var tw    = ctx.measureText(text).width;
            var lineY = middleY + fs * 0.55;
            ctx.save();
            ctx.strokeStyle = el.textColor || el.color || '#FFFFFF';
            ctx.lineWidth   = Math.max(1, fs * 0.06);
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.moveTo(textX, lineY); ctx.lineTo(textX + tw, lineY); ctx.stroke();
            ctx.restore();
        }

        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';

        // ── Row 1: weather icon + large temperature ──
        var row1CY    = padding + iconSize / 2;
        var wIconW    = drawCanvasWeatherIcon(ctx, data.weatherCode, padding, row1CY, iconSize);
        var tempText  = tempValue + tempUnit;
        var tempTextX = padding + wIconW + 8;
        ctx.font      = (el.textBold ? 'bold ' : '') + (useItalic ? 'italic ' : '') + fontSize + 'px ' + (el.textFont || 'Arial');
        ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
        _applyShadow();
        ctx.fillText(tempText, tempTextX, row1CY);
        _clearShadow();
        // simple/inline mode: textUnderline → underline the temperature
        if (useUnderline) _drawUnderline(tempTextX, row1CY, tempText, fontSize);

        // ── Row 2: compact strip ──
        var row2CY = padding + iconSize + 3 + subFontSize / 2;
        var GAP    = Math.round(subFontSize * 0.18);

        ctx.font         = subFontSize + 'px ' + (el.textFont || 'Arial');
        ctx.fillStyle    = el.textColor || el.color || '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'left';

        var curX = padding;

        function _sep() {
            ctx.font = subFontSize + 'px ' + (el.textFont || 'Arial');
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            curX += GAP;
            ctx.fillText('\u00b7', curX, row2CY);
            curX += ctx.measureText('\u00b7').width + GAP;
        }

        // Condition text (unchanged)
        if (el.showConditions && data.conditions) {
            ctx.font = subFontSize + 'px ' + (el.textFont || 'Arial');
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            ctx.fillText(data.conditions, curX, row2CY);
            curX += ctx.measureText(data.conditions).width;
        }

        // Humidity: · [droplet icon] 66%
        if (el.showHumidity && typeof data.humidity !== 'undefined') {
            if (curX > padding) _sep();
            drawIcon(ctx, 'droplet', curX, row2CY - subIconSize / 2, subIconSize);
            curX += subIconSize + GAP;
            ctx.font = subFontSize + 'px ' + (el.textFont || 'Arial');
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            var ht = data.humidity + '%';
            ctx.fillText(ht, curX, row2CY);
            curX += ctx.measureText(ht).width;
        }

        // Wind: · [wind icon] 15.2 km/h
        if (el.showWindSpeed && typeof data.windSpeed !== 'undefined') {
            if (curX > padding) _sep();
            drawIcon(ctx, 'wind', curX, row2CY - subIconSize / 2, subIconSize);
            curX += subIconSize + GAP;
            ctx.font = subFontSize + 'px ' + (el.textFont || 'Arial');
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            var wt = data.windSpeed + ' km/h';
            ctx.fillText(wt, curX, row2CY);
            curX += ctx.measureText(wt).width;
        }

        // Visibility (unchanged — keeps original _dot style would have been here,
        // but original had no _dot for visibility, so left as-is)
        if (el.showVisibility && typeof data.visibility !== 'undefined') {
            if (curX > padding) _sep();
            drawIcon(ctx, 'eye', curX, row2CY - subIconSize / 2, subIconSize);
            curX += subIconSize + GAP;
            ctx.font = subFontSize + 'px ' + (el.textFont || 'Arial');
            ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
            ctx.fillText(data.visibility + ' km', curX, row2CY);
        }
    }

    /**
     * Render compact weather widget — weather icon + temperature
     */
    function renderCompactWeather(ctx, el, data) {
        var padding = el.backgroundPadding || 10;

        var tempValue = data.temperature
            ? (el.unit === 'fahrenheit' ? data.temperature.fahrenheit : data.temperature.celsius)
            : '--';
        var tempUnit = el.unit === 'fahrenheit' ? '\u00b0F' : '\u00b0C';

        var fontSize = el.fontSize || 50;
        var iconSize = Math.round(fontSize * 1.1);
        var centerY  = el.height / 2;

        // ── Text style flags ──
        var useItalic    = !!el.textItalic;
        var useShadow    = !!el.textShadow;
        var shadowColor  = el.textShadowColor || '#000000';
        var shadowBlur   = el.textShadowBlur  || 4;
        var useUnderline = !!el.textUnderline;

        var wIconW   = drawCanvasWeatherIcon(ctx, data.weatherCode, padding, centerY, iconSize);
        var tempText = tempValue + tempUnit;
        var tempTextX = padding + wIconW + 10;

        ctx.font      = (el.textBold ? 'bold ' : '') + (useItalic ? 'italic ' : '') + fontSize + 'px ' + (el.textFont || 'Arial');
        ctx.fillStyle = el.textColor || el.color || '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (useShadow) { ctx.shadowColor = shadowColor; ctx.shadowBlur = shadowBlur; }
        ctx.fillText(tempText, tempTextX, centerY);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

        // compact/non-detailed: textUnderline → underline the temperature
        if (useUnderline) {
            var tw    = ctx.measureText(tempText).width;
            var lineY = centerY + fontSize * 0.55;
            ctx.save();
            ctx.strokeStyle = el.textColor || el.color || '#FFFFFF';
            ctx.lineWidth   = Math.max(1, fontSize * 0.06);
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.moveTo(tempTextX, lineY); ctx.lineTo(tempTextX + tw, lineY); ctx.stroke();
            ctx.restore();
        }
    }

    return { render: render, cleanup: cleanupWeather };
})();