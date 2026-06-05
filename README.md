# Douyin Skill

Standalone Douyin (抖音) creator account data collector with **browser login support** (scan QR code).

## Features

- 🎯 **Browser Login** - Scan QR code in Chrome, cookies auto-saved
- 📊 **Complete Metrics** - Followers, likes, views, comments, shares
- 💾 **Multiple Formats** - JSON, CSV (Excel-ready)
- 🔄 **Persistent Login** - Login once, reuse forever
- 🛡️ **Anti-Detection** - Playwright stealth mode

## Installation

```bash
npm install
```

This installs Playwright and downloads Chromium (~200MB).

## Quick Start

### Browser Login (Recommended)

```bash
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**What happens:**
1. Chrome opens automatically
2. Douyin login page appears
3. Scan QR code with Douyin app
4. Script detects login and starts collection
5. Cookies saved to `./private/profiles/douyin/`
6. Next time: no login needed!

### Manual Cookie (Fallback)

```bash
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --cookie "msToken=xxx; sessionid=xxx; ..." \
  --no-browser
```

## Usage

```bash
# Browser login (default)
node scripts/collect.mjs --account <URL_OR_ID>

# Custom limit and delay
node scripts/collect.mjs --account <URL> --limit 50 --delay 10000

# Custom output directory
node scripts/collect.mjs --account <URL> --out ./data/creator_20260605

# Manual cookie mode (no browser)
node scripts/collect.mjs --account <URL> --cookie "..." --no-browser
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--account` | Douyin profile URL or sec_user_id (**required**) | - |
| `--browser` | Enable browser login | `true` |
| `--no-browser` | Disable browser, use manual cookie | `false` |
| `--cookie` | Cookie header (manual mode) | - |
| `--profile` | Browser profile directory | `./private/profiles/douyin` |
| `--limit` | Max videos to fetch | `200` |
| `--delay` | Request interval (ms) | `5000` |
| `--out` | Output directory | `./outputs/<id>` |

## Output Files

```
outputs/MS4wLjABAAAA.../
├── summary.json      # Account overview
├── videos.json       # Full video list (JSON)
└── videos.csv        # Video list (CSV, Excel-ready)
```

### Example Output

```json
{
  "platform": "douyin",
  "id": "MS4wLjABAAAA...",
  "name": "Creator Name",
  "followers": 1000000,
  "videoCount": 500,
  "totalLikes": 50000000,
  "totalViews": 200000000
}
```

Each video row: `id`, `title`, `url`, `publishedAt`, `duration`, `likes`, `views`, `comments`, `shares`, `favorites`

## How It Works

- **Browser automation**: Playwright + stealth plugin
- **Signing**: `a_bogus` parameter via RC4 + SM3 hash
- **APIs**:
  - User profile: `/aweme/v1/web/user/profile/other/`
  - Video list: `/aweme/v1/web/aweme/post/` (paginated, 18 per page)
- **Retry logic**: Exponential backoff, max 5 attempts
- **UA rotation**: 10 Chrome/Firefox/Safari user agents

## Troubleshooting

### Missing Dependencies

```
Error: Stealth mode requires playwright-extra
```

**Fix**: Run `npm install`

### Browser Won't Open

```
Error: Browser auth requires Playwright
```

**Fix**:
```bash
npm install
npx playwright install chromium
```

### QR Code Scan Not Detected

- Wait up to 10 minutes for auto-detection
- Verify login succeeded (refresh page in browser)
- Close browser and retry if stuck

### HTTP 412 / 403 (Risk Control)

Even with browser login, Douyin may block requests:
- Increase `--delay 10000` (10 seconds)
- Decrease `--limit 50`
- Retry after a few minutes

### Login Expired

```bash
# Clear old login, scan again
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```

## Browser vs Manual Cookie

| Method | Pros | Cons |
|--------|------|------|
| Browser Login | Auto cookie management<br>High success rate<br>No manual copy | Requires dependencies<br>First-time QR scan |
| Manual Cookie | No dependencies<br>Quick testing | Cookie expires<br>High block rate<br>Manual updates |

## Structure

```
douyin_skill/
├── SKILL.md                          # Full documentation (中文)
├── README.md                         # This file
├── EXAMPLES.md                       # Usage examples
├── package.json                      # Dependencies
├── private/profiles/douyin/          # Browser login state (auto)
├── outputs/                          # Collection results (auto)
└── scripts/
    ├── collect.mjs                   # CLI with browser login
    └── adapters/
        ├── douyin.mjs                # Collection logic
        └── douyin-sign.js            # a_bogus signing (RC4 + SM3)
```

## Documentation

- [SKILL.md](SKILL.md) - Full documentation in Chinese
- [EXAMPLES.md](EXAMPLES.md) - Usage examples and troubleshooting
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Technical overview

## License

Educational use only. Signing code from [ShilongLee/Crawler](https://github.com/ShilongLee/Crawler).
