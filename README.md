# Douyin Skill

Standalone Douyin (抖音) creator account data collector. **v3.2 uses Playwright network-response interception** — no a_bogus signing, no manual cookie input.

## Features

- 🕸️ **Browser-Native Interception** — captures the JSON Douyin's own frontend already requests; zero local signing
- 🔐 **One-Time QR Login** — login state persisted to `./private/profiles/douyin/`, reused on subsequent runs
- 📊 **Complete Metrics** — followers, total likes, video-level likes/views/comments/shares/favorites
- 📁 **Four Output Formats** — `summary.json`, `videos.json`, `videos.csv` (Excel-ready), and a self-contained dark-theme `report.html`
- 🛡️ **Anti-Detection** — playwright-extra stealth + injected `stealth.min.js`, real Chrome TLS/HTTP fingerprint
- 🎯 **Human-Like Scroll** — `mouse.wheel` + jitter to trigger lazy-load reliably

## Installation

```bash
npm install
npx playwright install chromium
```

(~200 MB Chromium download on first run.)

## Quick Start

```bash
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**What happens:**
1. Chrome opens, navigates to douyin.com
2. Login state is detected from cookies (`sessionid` / `sid_guard` / `LOGIN_STATUS`) and `localStorage.HasUserLogin`
3. If not logged in: the script auto-clicks the "登录" button → scan QR with the Douyin app
4. Navigates to the target creator page
5. Network interceptor captures `/aweme/v1/web/user/profile/other/` (profile) and `/aweme/v1/web/aweme/post/` (paginated videos)
6. Mouse-wheel scrolling triggers pagination until `has_more=false`, `--limit` is reached, or 8 consecutive no-data rounds
7. Outputs dropped into `./outputs/<sec_user_id>/`

## Usage

```bash
# Basic
node scripts/collect.mjs --account <URL_OR_SEC_USER_ID>

# Limit videos and adjust scroll-wait delay
node scripts/collect.mjs --account <URL> --limit 50 --delay 5000

# Custom output directory
node scripts/collect.mjs --account <URL> --out ./data/creator_20260605

# Isolate a second account in a separate browser profile
node scripts/collect.mjs --account <URL2> --profile ./private/profiles/account2
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--account` | Douyin profile URL or `sec_user_id` (**required**) | — |
| `--profile` | Browser profile dir (persists login) | `./private/profiles/douyin` |
| `--limit` | Max videos to fetch | `200` |
| `--delay` | Max ms to wait for a new API response per scroll round | `2000` |
| `--out` | Output directory | `./outputs/<sec_user_id>` |

> v3.2 removed the legacy `--cookie`, `--browser`, and `--no-browser` flags. Interception is mandatory because it's the entire reason this version bypasses Douyin's risk control.

## Output Files

```
outputs/MS4wLjABAAAA.../
├── summary.json      # Account overview
├── videos.json       # Full video list (JSON)
├── videos.csv        # Video list (CSV with UTF-8 BOM, Excel-friendly)
└── report.html       # Self-contained dark-theme HTML report
```

### Example summary.json

```json
{
  "platform": "douyin",
  "id": "MS4wLjABAAAA...",
  "url": "https://www.douyin.com/user/...",
  "name": "Creator Name",
  "followers": 1000000,
  "videoCount": 500,
  "totalLikes": 50000000,
  "totalViews": 200000000,
  "totalComments": 1000000,
  "fetchedAt": "2026-06-05T10:00:00.000Z"
}
```

Each video row: `id`, `title`, `url`, `publishedAt`, `duration`, `likes`, `views`, `comments`, `shares`, `favorites`, `coins` (always 0 for Douyin; kept for cross-platform schema parity).

### report.html

Drop-in shareable report with avatar, signature, four stat cards, and a sortable + searchable video table. Open it in any browser — no server, no external assets except a Google Fonts stylesheet.

## How It Works

- **Automation**: Playwright (Chrome channel) + `playwright-extra` + `puppeteer-extra-plugin-stealth`
- **Capture**: `page.on('response')` listens for two endpoints and parses JSON on-the-fly:
  - `/aweme/v1/web/user/profile/other/` → creator profile (followers, total likes, video count)
  - `/aweme/v1/web/aweme/post/` → paginated `aweme_list` (18 videos per page)
- **Pagination**: human-like scroll via `page.mouse.wheel()`; on stalls, jitter (scroll up → scroll back down) re-triggers `IntersectionObserver`
- **Dedup**: by `aweme_id`, then sliced to `--limit`
- **Login persistence**: Playwright `launchPersistentContext` saves cookies + localStorage

## Troubleshooting

### Missing Playwright

```
Cannot find package 'playwright-extra'
```

```bash
npm install
npx playwright install chromium
```

### "Failed to capture user profile from network responses"

The login session expired or the account is restricted. Reset:
```bash
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```
Scan the QR again.

### Scroll runs forever but no new videos

Douyin sometimes returns `has_more=false` on low-activity accounts. The script auto-stops after **8 consecutive empty rounds**. Compare `summary.videoCount` vs `videos.length`:
- Equal → all videos captured
- Mismatch → risk-control intervention; try `--delay 5000` or switch network

### Slider / puzzle captcha appears

**Solve it manually** in the open browser window; the script continues afterward. Don't close the window.

### Chrome channel not found

The script uses `channel: "chrome"`. If you only have Chromium installed, either install Google Chrome or remove that line from `buildBrowserOptions()` in `scripts/collect.mjs`.

## Claude Code Slash Command

This project ships a custom command (`.claude/commands/douyin_skill.md`):

```
/douyin_skill MS4wLjABAAAA...
/douyin_skill MS4wLjABAAAA... --limit 50 --delay 5000
```

Claude `cd`s into the project, runs `collect.mjs`, then summarizes the output.

## Structure

```
douyin_skill/
├── SKILL.md                  # Chinese skill documentation (loaded by Claude)
├── README.md                 # This file (English)
├── EXAMPLES.md               # Usage examples
├── CHANGELOG.md              # Version history
├── package.json
├── .claude/
│   └── commands/
│       └── douyin_skill.md   # Slash-command definition
├── private/profiles/douyin/  # Persistent browser profile (auto, gitignored)
├── outputs/                  # Collection results (auto, gitignored)
└── scripts/
    ├── collect.mjs           # v3.2 entry — interceptor + HTML report
    └── adapters/
        ├── stealth.min.js    # Anti-detection init script
        ├── douyin.mjs        # Legacy HTTP adapter (v2.x; unused by current collect.mjs)
        └── douyin-sign.js    # Legacy a_bogus signing (v1.x; unused)
```

## License

Educational use only. Legacy signing code (kept for reference, no longer used in v3.2) originally from [ShilongLee/Crawler](https://github.com/ShilongLee/Crawler).
