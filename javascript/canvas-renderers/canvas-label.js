/**
 * ====================================================================
 * CANVAS LABEL RENDERER
 * Handles simple text labels with various styling options
 * ====================================================================
 */

var CanvasLabel = (function() {
    'use strict';

    function render(ctx, el) {
        if (!el.text) {
            console.warn('[CanvasLabel] Label element missing text:', el.name || el.id);
            return;
        }
        
        console.log('[CanvasLabel] Rendering:', el.name || el.id, 'Text:', el.text);
        
        ctx.save();
        
        // Apply transformations
        CanvasBase.applyTransformations(ctx, el);
        
        // Draw background
        if (el.backgroundColor && el.backgroundColor !== 'transparent' && el.backgroundColor !== '#00000000') {
            ctx.fillStyle = el.backgroundColor;
            ctx.fillRect(0, 0, el.width, el.height);
        }
        
        // Setup font
        var fontSize = el.fontSize || 24;
        var fontFamily = el.fontFamily || 'Arial';
        var fontStyle = el.fontStyle || 'normal';
        var fontWeight = el.fontWeight || 'normal';
        
        ctx.font = fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px "' + fontFamily + '"';
        ctx.fillStyle = el.color || '#000000';
        ctx.textAlign = el.textAlign || 'center';
        ctx.textBaseline = 'middle';
        
        // Calculate text position
        var textX = el.width / 2;
        var textY = el.height / 2;
        
        if (el.textAlign === 'left') {
            textX = 10;
        } else if (el.textAlign === 'right') {
            textX = el.width - 10;
        }
        
        // Draw text
        ctx.fillText(el.text, textX, textY);
        
        // Apply text decoration (underline)
        if (el.textDecoration === 'underline') {
            drawUnderline(ctx, el.text, textX, textY, el.textAlign, fontSize);
        }
        
        ctx.restore();
        
        console.log('[CanvasLabel] ✅ Label rendered:', el.text);
    }
    
    function drawUnderline(ctx, text, x, y, align, fontSize) {
        var textWidth = ctx.measureText(text).width;
        var underlineY = y + (fontSize / 2) + 2;
        
        var startX = x;
        var endX = x + textWidth;
        
        if (align === 'center') {
            startX = x - (textWidth / 2);
            endX = x + (textWidth / 2);
        } else if (align === 'right') {
            startX = x - textWidth;
            endX = x;
        }
        
        ctx.beginPath();
        ctx.moveTo(startX, underlineY);
        ctx.lineTo(endX, underlineY);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    return {
        render: render
    };
})();