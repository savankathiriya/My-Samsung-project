/**
 * ====================================================================
 * CANVAS SCALING UTILITY - IMPROVED FOR TEXT POSITIONING
 * Automatically scales canvas elements from design dimensions to screen dimensions
 * Handles all aspect ratios: 16:9, 4:3, portrait, landscape, square
 * FIXED: Better text positioning and padding scaling
 * ====================================================================
 */

var CanvasScaler = (function() {
    'use strict';

    var initialized = false;  // Track if scaler has been initialized
    
    var scaleInfo = {
        screenWidth: 1280,      // Actual TV screen width
        screenHeight: 720,      // Actual TV screen height
        designWidth: 1920,      // Design canvas width from JSON
        designHeight: 1080,     // Design canvas height from JSON
        scaleX: 1,              // Calculated X scale factor
        scaleY: 1,              // Calculated Y scale factor
        mode: 'fit'             // 'fit', 'fill', or 'stretch'
    };

    /**
     * Initialize scaler with screen and design dimensions
     */
    function initialize(screenW, screenH, designW, designH, mode) {
        scaleInfo.screenWidth = screenW || 1280;
        scaleInfo.screenHeight = screenH || 720;
        scaleInfo.designWidth = designW || 1920;
        scaleInfo.designHeight = designH || 1080;
        scaleInfo.mode = mode || 'fit';

        calculateScaleFactors();
        
        initialized = true;  // Mark as initialized

        console.log('[CanvasScaler] Initialized:');
        console.log('  Screen: ' + scaleInfo.screenWidth + 'x' + scaleInfo.screenHeight);
        console.log('  Design: ' + scaleInfo.designWidth + 'x' + scaleInfo.designHeight);
        console.log('  Scale: ' + scaleInfo.scaleX.toFixed(4) + 'x' + scaleInfo.scaleY.toFixed(4));
        console.log('  Mode: ' + scaleInfo.mode);
    }

    /**
     * Calculate scale factors based on mode
     */
    function calculateScaleFactors() {
        var screenRatio = scaleInfo.screenWidth / scaleInfo.screenHeight;
        var designRatio = scaleInfo.designWidth / scaleInfo.designHeight;

        if (scaleInfo.mode === 'stretch') {
            // Stretch to fill - may distort
            scaleInfo.scaleX = scaleInfo.screenWidth / scaleInfo.designWidth;
            scaleInfo.scaleY = scaleInfo.screenHeight / scaleInfo.designHeight;
        } 
        else if (scaleInfo.mode === 'fill') {
            // Fill screen - may crop content
            var scale = Math.max(
                scaleInfo.screenWidth / scaleInfo.designWidth,
                scaleInfo.screenHeight / scaleInfo.designHeight
            );
            scaleInfo.scaleX = scale;
            scaleInfo.scaleY = scale;
        } 
        else {
            // Fit mode (default) - maintain aspect ratio, show all content
            var scale = Math.min(
                scaleInfo.screenWidth / scaleInfo.designWidth,
                scaleInfo.screenHeight / scaleInfo.designHeight
            );
            scaleInfo.scaleX = scale;
            scaleInfo.scaleY = scale;
        }
    }

    /**
     * Scale a single element's properties
     */
    function scaleElement(element) {
        if (!element) return element;

        var scaled = {};

        // Copy all properties first
        for (var key in element) {
            if (element.hasOwnProperty(key)) {
                scaled[key] = element[key];
            }
        }

        // CRITICAL: Use floor for positions to avoid sub-pixel rendering issues
        if (typeof element.x !== 'undefined') {
            scaled.x = Math.floor(element.x * scaleInfo.scaleX);
        }
        if (typeof element.y !== 'undefined') {
            scaled.y = Math.floor(element.y * scaleInfo.scaleY);
        }

        // CRITICAL: Use ceil for dimensions to ensure full coverage
        if (typeof element.width !== 'undefined') {
            scaled.width = Math.ceil(element.width * scaleInfo.scaleX);
        }
        if (typeof element.height !== 'undefined') {
            scaled.height = Math.ceil(element.height * scaleInfo.scaleY);
        }

        // Scale font sizes - use round for fonts
        var fontScale = Math.min(scaleInfo.scaleX, scaleInfo.scaleY);
        
        if (typeof element.fontSize !== 'undefined') {
            scaled.fontSize = Math.round(element.fontSize * fontScale);
        }
        if (typeof element.numberSize !== 'undefined') {
            scaled.numberSize = Math.round(element.numberSize * fontScale);
        }
        if (typeof element.dateFontSize !== 'undefined') {
            scaled.dateFontSize = Math.round(element.dateFontSize * fontScale);
        }
        if (typeof element.timeFontSize !== 'undefined') {
            scaled.timeFontSize = Math.round(element.timeFontSize * fontScale);
        }
        if (typeof element.titleFontSize !== 'undefined') {
            scaled.titleFontSize = Math.round(element.titleFontSize * fontScale);
        }

        // CRITICAL FIX: Scale padding properties for proper text positioning
        if (typeof element.paddingLeft !== 'undefined') {
            scaled.paddingLeft = Math.round(element.paddingLeft * scaleInfo.scaleX);
        }
        if (typeof element.paddingRight !== 'undefined') {
            scaled.paddingRight = Math.round(element.paddingRight * scaleInfo.scaleX);
        }
        if (typeof element.paddingTop !== 'undefined') {
            scaled.paddingTop = Math.round(element.paddingTop * scaleInfo.scaleY);
        }
        if (typeof element.paddingBottom !== 'undefined') {
            scaled.paddingBottom = Math.round(element.paddingBottom * scaleInfo.scaleY);
        }

        // Scale borders and radii
        if (typeof element.borderWidth !== 'undefined') {
            scaled.borderWidth = Math.max(0, Math.round(element.borderWidth * fontScale));
        }
        if (typeof element.borderRadius !== 'undefined') {
            scaled.borderRadius = Math.round(element.borderRadius * fontScale);
        }
        if (typeof element.backgroundPadding !== 'undefined') {
            scaled.backgroundPadding = Math.round(element.backgroundPadding * fontScale);
        }
        if (typeof element.backgroundRadius !== 'undefined') {
            scaled.backgroundRadius = Math.round(element.backgroundRadius * fontScale);
        }

        // Scale clock-specific properties
        if (typeof element.hourHandWidth !== 'undefined') {
            scaled.hourHandWidth = Math.max(1, Math.round(element.hourHandWidth * fontScale));
        }
        if (typeof element.minuteHandWidth !== 'undefined') {
            scaled.minuteHandWidth = Math.max(1, Math.round(element.minuteHandWidth * fontScale));
        }
        if (typeof element.secondHandWidth !== 'undefined') {
            scaled.secondHandWidth = Math.max(1, Math.round(element.secondHandWidth * fontScale));
        }
        if (typeof element.clockBorderWidth !== 'undefined') {
            scaled.clockBorderWidth = Math.max(1, Math.round(element.clockBorderWidth * fontScale));
        }

        // Scale icon sizes
        if (typeof element.iconSize !== 'undefined') {
            scaled.iconSize = Math.round(element.iconSize * fontScale);
        }
        if (typeof element.iconSpacing !== 'undefined') {
            scaled.iconSpacing = Math.round(element.iconSpacing * fontScale);
        }

        // Scale arrow head size (it's a ratio, so keep it unchanged)
        if (typeof element.arrowHeadSize !== 'undefined') {
            scaled.arrowHeadSize = element.arrowHeadSize;
        }

        // Scale text shadow
        if (typeof element.textShadowBlur !== 'undefined') {
            scaled.textShadowBlur = Math.round(element.textShadowBlur * fontScale);
        }

        // Scale letter spacing (parse string like "6px")
        if (typeof element.letterSpacing === 'string' && element.letterSpacing.indexOf('px') !== -1) {
            var pixels = parseFloat(element.letterSpacing.replace('px', ''));
            if (!isNaN(pixels)) {
                scaled.letterSpacing = Math.round(pixels * fontScale) + 'px';
            }
        }

        // CRITICAL FIX: Scale line height for text
        if (typeof element.lineHeight !== 'undefined') {
            if (typeof element.lineHeight === 'string' && element.lineHeight.indexOf('px') !== -1) {
                var lineHeightPx = parseFloat(element.lineHeight.replace('px', ''));
                if (!isNaN(lineHeightPx)) {
                    scaled.lineHeight = Math.round(lineHeightPx * scaleInfo.scaleY) + 'px';
                }
            } else if (typeof element.lineHeight === 'number') {
                // If it's a number, assume it's a multiplier
                scaled.lineHeight = element.lineHeight;
            }
        }

        return scaled;
    }

    /**
     * Scale all elements in template data
     */
    function scaleTemplateData(templateData) {
        if (!templateData) return templateData;

        var scaled = {};

        // Copy canvas config
        if (templateData.canvas) {
            scaled.canvas = {};
            for (var key in templateData.canvas) {
                if (templateData.canvas.hasOwnProperty(key)) {
                    scaled.canvas[key] = templateData.canvas[key];
                }
            }
            // Update canvas dimensions to screen size
            scaled.canvas.width = scaleInfo.screenWidth;
            scaled.canvas.height = scaleInfo.screenHeight;
        }

        // Copy version and settings
        if (templateData.version) {
            scaled.version = templateData.version;
        }
        if (templateData.settings) {
            scaled.settings = templateData.settings;
        }
        if (templateData.exportedAt) {
            scaled.exportedAt = templateData.exportedAt;
        }

        // Scale all elements
        if (templateData.elements && Array.isArray(templateData.elements)) {
            scaled.elements = [];
            for (var i = 0; i < templateData.elements.length; i++) {
                scaled.elements.push(scaleElement(templateData.elements[i]));
            }
        }

        return scaled;
    }

    /**
     * Get current scale information
     */
    function getScaleInfo() {
        return {
            screenWidth: scaleInfo.screenWidth,
            screenHeight: scaleInfo.screenHeight,
            designWidth: scaleInfo.designWidth,
            designHeight: scaleInfo.designHeight,
            scaleX: scaleInfo.scaleX,
            scaleY: scaleInfo.scaleY,
            mode: scaleInfo.mode
        };
    }

    /**
     * Quick scale helper for x coordinate
     */
    function scaleX(value) {
        return Math.floor(value * scaleInfo.scaleX);
    }

    /**
     * Quick scale helper for y coordinate
     */
    function scaleY(value) {
        return Math.floor(value * scaleInfo.scaleY);
    }

    /**
     * Quick scale helper for width
     */
    function scaleWidth(value) {
        return Math.ceil(value * scaleInfo.scaleX);
    }

    /**
     * Quick scale helper for height
     */
    function scaleHeight(value) {
        return Math.ceil(value * scaleInfo.scaleY);
    }

    /**
     * Quick scale helper for font size (uses smaller of scaleX/scaleY to maintain readability)
     */
    function scaleFontSize(value) {
        return Math.round(value * Math.min(scaleInfo.scaleX, scaleInfo.scaleY));
    }

    /**
     * Check if scaler has been initialized
     */
    function isInitialized() {
        return initialized;
    }

    // Public API
    return {
        initialize: initialize,
        isInitialized: isInitialized,
        scaleElement: scaleElement,
        scaleTemplateData: scaleTemplateData,
        getScaleInfo: getScaleInfo,
        scaleX: scaleX,
        scaleY: scaleY,
        scaleWidth: scaleWidth,
        scaleHeight: scaleHeight,
        scaleFontSize: scaleFontSize
    };
})();