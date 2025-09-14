# Installation Guide

## Quick Setup

### 1. Create Icons (Required)
Before installing, you need to create icon files:

**Option A: Use Online Icon Generator**
- Visit [Favicon.io](https://favicon.io/) or similar service
- Create a simple icon with "T" or translation symbol
- Download and rename to: `icon16.png`, `icon48.png`, `icon128.png`
- Place in the extension directory

**Option B: Create Simple Icons**
- Use any image editor (GIMP, Photoshop, Canva)
- Create 16x16, 48x48, and 128x128 pixel images
- Save as PNG format with transparent background
- Use simple text or symbols (e.g., "T", "🌐", "🔤")

### 2. Install Extension

1. **Open Chrome** and go to `chrome://extensions/`
2. **Enable Developer mode** (toggle in top right)
3. **Click "Load unpacked"**
4. **Select this folder** containing the extension files
5. **Pin the extension** to your toolbar

### 3. Configure Extension

1. **Click the extension icon** in your toolbar
2. **Enter your OpenAI API key**
3. **Choose target language** (default: English)
4. **Enable auto-translate**
5. **Click "Save Settings"**
6. **Test connection** to verify setup

## File Structure Check

Ensure you have these files in your extension directory:
```
✅ manifest.json
✅ popup.html
✅ popup.js
✅ content.js
✅ background.js
✅ welcome.html
✅ icon16.png (create this)
✅ icon48.png (create this)
✅ icon128.png (create this)
```

## Testing

### Quick Test (Recommended First)
1. **Open the `test.html` file** in your browser (double-click it)
2. **Make sure your extension is configured** with your OpenAI API key
3. **Enable auto-translate** in the extension popup
4. **Refresh the test page**
5. **Look for black translation overlays** appearing above the foreign text

### Video Call Testing
1. **Go to a video call platform** (Google Meet, Zoom, etc.)
2. **Enable subtitles** in the platform settings
3. **Start speaking in another language**
4. **Check for translation overlays**

## Troubleshooting

**Extension won't load:**
- Check that all required files are present
- Verify icon files are actual PNG images
- Check Chrome console for errors

**Icons not showing:**
- Ensure icon files are proper PNG format
- Check file names match exactly
- Verify file sizes are correct

**Need help?** Check the main README.md for detailed troubleshooting.
