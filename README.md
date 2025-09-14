# Call Subtitle Translator Chrome Extension

A Chrome extension that automatically detects and translates call subtitles to English using OpenAI's GPT models. Perfect for international video calls, meetings, and conferences.

## Features

- 🎯 **Automatic Detection**: Automatically detects subtitle elements on popular video call platforms
- 🌍 **Multi-Platform Support**: Works with Google Meet, Zoom, Microsoft Teams, and more
- 🤖 **AI-Powered Translation**: Uses OpenAI GPT-3.5-turbo for accurate translations
- ⚡ **Real-Time**: Translates subtitles as they appear during calls
- 🔒 **Privacy-First**: Your API key is stored locally, no data is collected
- 🎨 **Clean Overlay**: Translations appear as elegant overlays above original text
- 💰 **Freemium Model**: 100 free translations, then $0.99/month for unlimited access

## Pricing

- **Free Tier**: 100 translations per user
- **Premium Tier**: $0.99/month for unlimited translations
- **No Hidden Fees**: Simple, transparent pricing

## Supported Platforms

- **Google Meet** - Full subtitle detection and translation
- **Zoom** - Meeting subtitle support
- **Microsoft Teams** - Meeting subtitle translation
- **Webex** - Generic subtitle detection
- **Discord** - Voice channel subtitle support
- **Skype** - Call subtitle translation
- **Other platforms** - Generic subtitle detection

## Installation

### Method 1: Load Unpacked Extension (Development)

1. **Clone or download** this repository to your local machine
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer mode** by toggling the switch in the top right
4. **Click "Load unpacked"** and select the folder containing this extension
5. **Pin the extension** to your toolbar for easy access

### Method 2: Build and Install

1. **Install dependencies** (if any build process is added later)
2. **Build the extension** using the build script
3. **Follow the same steps** as Method 1

## Setup

1. **Get an OpenAI API Key**:
   - Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create an account or sign in
   - Generate a new API key

2. **Configure the Extension**:
   - Click the extension icon in your toolbar
   - Enter your OpenAI API key
   - Choose your target language (default: English)
   - Enable auto-translate

3. **Test the Connection**:
   - Click "Test Connection" to verify your API key works
   - You should see a success message

## Usage

### Free Tier (100 Translations)

- **Start translating immediately** after setup
- **Monitor your usage** in the extension popup
- **Progress bar shows** remaining free translations
- **Upgrade prompt appears** when limit is reached

### Premium Tier ($0.99/month)

- **Unlimited translations** after subscription
- **Automatic renewal** every month
- **Cancel anytime** from your account
- **No usage limits** or restrictions

### During Video Calls

1. **Join a video call** on any supported platform
2. **Enable subtitles** in the platform's settings (if available)
3. **The extension will automatically**:
   - Detect subtitle text
   - Translate non-English content to English
   - Display translations as overlays
   - Track your usage (free tier only)

### Manual Translation

- **Click the extension icon** to open settings
- **Toggle auto-translate** on/off as needed
- **Change target language** for different translation needs
- **View usage statistics** and subscription status

### Translation Overlay

Translations appear as:
- **Black semi-transparent background**
- **White text** for readability
- **Original text** shown above translation
- **Auto-dismiss** after 5 seconds
- **Positioned near** the original subtitle

## Configuration

### Settings

- **OpenAI API Key**: Your personal API key for translation requests
- **Target Language**: Language to translate subtitles to (default: English)
- **Auto-translate**: Enable/disable automatic translation

### Usage Tracking

- **Translation Counter**: Shows how many messages you've translated
- **Progress Bar**: Visual indicator of free tier usage
- **Subscription Status**: Current plan and expiry information
- **Upgrade Options**: Easy access to premium features

### Advanced Options

- **Model**: Uses GPT-3.5-turbo by default (configurable in code)
- **Temperature**: Set to 0.3 for consistent translations
- **Max Tokens**: Limited to 100 for subtitle-length responses

## Technical Details

### Architecture

- **Manifest V3**: Modern Chrome extension architecture
- **Content Scripts**: DOM monitoring and subtitle detection
- **Background Service Worker**: Extension lifecycle management
- **Chrome Storage API**: Local settings and usage persistence
- **MutationObserver**: Real-time DOM change detection
- **Payment Integration**: Stripe subscription management

### Subtitle Detection

The extension uses multiple strategies to detect subtitles:

1. **CSS Selectors**: Platform-specific selectors for known video call platforms
2. **Text Analysis**: Language detection to identify non-English text
3. **DOM Monitoring**: Real-time observation of page changes
4. **Generic Detection**: Fallback selectors for unknown platforms

### Translation Process

1. **Text Capture**: Extract subtitle text from detected elements
2. **Language Check**: Verify text is not already in target language
3. **Usage Check**: Verify user has available translations or active subscription
4. **API Request**: Send to OpenAI GPT-3.5-turbo
5. **Response Processing**: Extract and format translation
6. **Overlay Display**: Show translation above original text
7. **Usage Update**: Increment translation counter (free tier only)

### Subscription Management

- **Local Storage**: Subscription status stored locally
- **Background Validation**: Automatic subscription expiry checks
- **Payment Processing**: Stripe integration for subscriptions
- **Webhook Support**: Real-time subscription updates

## Troubleshooting

### Common Issues

**Extension not working:**
- Check if auto-translate is enabled
- Verify your OpenAI API key is valid
- Ensure subtitles are enabled in your video call platform
- Check if you've reached the free tier limit

**No translations appearing:**
- Check browser console for error messages
- Verify API key has sufficient credits
- Check if the platform is supported
- Verify subscription status (if premium user)

**Free tier limit reached:**
- Upgrade to premium for unlimited translations
- Check subscription status in the popup
- Verify payment was processed successfully

**Performance issues:**
- Disable auto-translate for large meetings
- Check your internet connection
- Monitor API usage in OpenAI dashboard

### Debug Mode

1. **Open Developer Tools** (F12)
2. **Check Console** for error messages
3. **Look for "SubtitleTranslator"** logs
4. **Verify content script** is loaded
5. **Check usage tracking** logs

## Privacy & Security

- **Local Storage**: All settings and usage data stored locally in your browser
- **No Data Collection**: Extension doesn't collect or transmit personal data
- **API Key Security**: Your OpenAI key is only used for translation requests
- **HTTPS Only**: All API calls use secure connections
- **Payment Security**: Stripe handles all payment processing securely

## API Usage & Costs

- **OpenAI GPT-3.5-turbo**: ~$0.002 per 1K tokens
- **Typical subtitle**: 10-50 tokens per translation
- **Cost per hour**: Approximately $0.01-$0.05 for active use
- **Free Tier**: OpenAI provides $5 free credit for new users
- **Extension Pricing**: 100 free translations, then $0.99/month

## Development

### Project Structure

```
chrome-extension-translate/
├── manifest.json          # Extension configuration
├── popup.html            # Settings popup interface
├── popup.js              # Popup functionality and usage tracking
├── content.js            # Main subtitle detection logic
├── background.js         # Service worker and usage management
├── payment.js            # Stripe payment integration
├── welcome.html          # First-time user guide
├── PAYMENT_SETUP.md      # Payment system setup guide
└── README.md             # This file
```

### Building

Currently, no build process is required. The extension can be loaded directly as an unpacked extension.

### Contributing

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Test thoroughly**
5. **Submit a pull request**

## Payment Setup

For detailed information on setting up the payment system, see [PAYMENT_SETUP.md](PAYMENT_SETUP.md).

## License

This project is open source. Please check the LICENSE file for details.

## Support

- **GitHub Issues**: Report bugs or request features
- **Documentation**: Check this README for common solutions
- **Community**: Join discussions in the repository
- **Payment Issues**: Contact support for subscription problems

## Changelog

### Version 1.1.0
- Added freemium model with 100 free translations
- Implemented $0.99/month subscription system
- Added usage tracking and progress indicators
- Integrated Stripe payment processing
- Enhanced popup interface with subscription options

### Version 1.0.0
- Initial release
- Basic subtitle detection and translation
- Support for major video call platforms
- OpenAI GPT-3.5-turbo integration
- Real-time translation overlays

---

**Note**: This extension requires an active internet connection and a valid OpenAI API key to function. Translation quality depends on the OpenAI model's performance and the clarity of the original subtitle text. Free tier users are limited to 100 translations before requiring a subscription.
