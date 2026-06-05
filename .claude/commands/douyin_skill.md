---
description: Collect Douyin (抖音) creator account data — profile info, followers, video list with likes/views/comments/shares, JSON/CSV export
argument-hint: <account-url-or-sec-user-id> [--limit N] [--out path] [--delay ms]
---

# douyin_skill

Collect Douyin creator account metrics via browser login + Node API adapter.

## Steps

1. **Parse arguments** — The first non-flag argument is the account (URL or `MS4wLjABAAAA...` sec_user_id). Optional flags:
   - `--limit N` — max videos (default 200)
   - `--delay MS` — interval between requests in ms (default 2000)
   - `--out PATH` — output directory (default `./outputs/<sec_user_id>`)

2. **Run the collector** from the project root:

   ```bash
   cd "D:\edgedownload\ai_projects\douyin_skill" && node scripts/collect.mjs $ARGUMENTS
   ```

3. **On success**, summarize the output:
   - Account name + sec_user_id
   - Followers, total likes, total views
   - Videos fetched (out of total)
   - Output directory (point user to `summary.json`, `videos.json`, `videos.csv`)

4. **On failure**:
   - `Error: --account is required` → tell user to pass an account URL
   - `Empty response` / `non-JSON status=200` → msToken missing; suggest re-login (delete `./private/profiles/douyin` and re-scan QR)
   - `HTTP 412/403` → risk control; suggest `--delay 10000` and smaller `--limit`
   - Other errors → paste the full error line and offer to investigate

## Notes

- Browser auto-launches once per session and reuses saved cookies from `./private/profiles/douyin/`; first-time use requires a QR scan
- Default behavior: 200 videos, 2s delay between requests
- Adapter internally retries up to 2 times with 2s backoff on transient errors
