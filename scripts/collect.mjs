#!/usr/bin/env node
/**
 * douyin_skill v3.0 — Browser-native API collection (anti-detection optimized)
 *
 * 核心改变：所有 API 调用在浏览器内通过 page.evaluate() 执行
 * 参考：MediaCrawler 的架构 - 保持浏览器打开，使用浏览器的真实网络栈
 *
 * Usage:
 *   node scripts/collect.mjs --account <URL_OR_SEC_USER_ID> [options]
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Browser Setup ─────────────────────────────────────────────────────

async function loadPlaywright() {
  try {
    const { chromium } = await import("playwright-extra");
    const StealthModule = await import("puppeteer-extra-plugin-stealth");
    const StealthPlugin = StealthModule.default || StealthModule;
    chromium.use(StealthPlugin());
    return { chromium };
  } catch (error) {
    const { chromium } = await import("playwright");
    return { chromium };
  }
}

function buildBrowserOptions() {
  return {
    acceptDownloads: true,
    channel: "chrome",
    headless: false,
    viewport: { width: 1920, height: 1080 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--lang=zh-CN",
    ],
  };
}

// ── Helper Functions ──────────────────────────────────────────────────

function extractSecUserId(account) {
  const text = String(account);
  if (text.startsWith("MS4wLjABAAAA")) return text;
  const match = text.match(/douyin\.com\/user\/([^/?]+)/);
  if (match) return match[1];
  if (!text.includes("/") && !text.includes(".") && text.length > 20) return text;
  throw new Error("Could not extract sec_user_id from account.");
}

function hasDouyinLogin(cookies) {
  const names = new Set(cookies.map((c) => c.name));
  return names.has("sessionid") || names.has("sid_guard") || names.has("msToken");
}

async function waitForLogin(page, context, timeout = 600000) {
  console.log("[Browser] Waiting for login... Please scan QR code.");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    if (hasDouyinLogin(cookies)) {
      console.log("[Browser] Login detected!");
      return true;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("Login timeout. Please scan QR code in the browser.");
}

// ── In-Browser API Collection ────────────────────────────────────────

async function collectInBrowser(page, secUserId, limit) {
  console.log("[Collection] Starting in-browser API calls...");

  // Load signing script content
  const signScriptPath = join(__dirname, "adapters", "douyin-sign.js");
  const signScript = readFileSync(signScriptPath, "utf8");

  // Execute collection logic inside the browser (inject sign script inline)
  const result = await page.evaluate(
    async ({ secUserId, limit, signScript }) => {
      // Inject signing script into browser context
      eval(signScript);
      // Helper: Generate a_bogus signature (uses injected douyin-sign.js)
      function getABogus(params, userAgent) {
        if (typeof sign_datail === "undefined") {
          throw new Error("sign_datail not found. Make sure douyin-sign.js is loaded.");
        }
        return sign_datail(params, userAgent);
      }

      // Helper: Build query params
      function buildParams(base) {
        const ua = navigator.userAgent;
        const common = {
          device_platform: "webapp",
          aid: "6383",
          channel: "channel_pc_web",
          version_code: "190600",
          version_name: "19.6.0",
          cookie_enabled: "true",
          screen_width: String(screen.width),
          screen_height: String(screen.height),
          browser_language: navigator.language,
          browser_platform: navigator.platform,
          browser_name: "Chrome",
          browser_version: "136.0.0.0",
          browser_online: "true",
          engine_name: "Blink",
          engine_version: "136.0.0.0",
          os_name: navigator.platform.includes("Win") ? "Windows" : "Mac OS",
          os_version: "10",
          cpu_core_num: String(navigator.hardwareConcurrency || 8),
          device_memory: String(navigator.deviceMemory || 8),
          platform: "PC",
          downlink: "10",
          effective_type: "4g",
          round_trip_time: "50",
          webid: Math.random().toString(36).slice(2, 21),
        };
        return { ...common, ...base };
      }

      // Helper: Fetch with a_bogus
      async function fetchDouyin(endpoint, params) {
        const allParams = buildParams(params);
        const queryStr = Object.keys(allParams)
          .sort()
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(allParams[k]))}`)
          .join("&");

        const aBogus = getABogus(queryStr, navigator.userAgent);
        const url = `https://www.douyin.com${endpoint}?${queryStr}&a_bogus=${encodeURIComponent(aBogus)}`;

        const response = await fetch(url, {
          headers: {
            "User-Agent": navigator.userAgent,
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            Referer: `https://www.douyin.com/user/${secUserId}`,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        if (!text || text.trim() === "") {
          throw new Error(`Empty response from Douyin API (status=${response.status})`);
        }

        return JSON.parse(text);
      }

      // Step 1: Fetch user profile
      const profileData = await fetchDouyin("/aweme/v1/web/user/profile/other/", {
        sec_user_id: secUserId,
        publish_video_strategy_type: "2",
        personal_center_strategy: "1",
      });

      const user = profileData.user || {};
      const userModule = profileData.user_module || {};
      const userInfo = userModule.user || user;

      // Step 2: Fetch videos
      const rawVideos = [];
      let maxCursor = "";
      let hasMore = true;
      let pageCount = 0;
      const maxPages = limit ? Math.ceil(limit / 18) : 50;

      while (hasMore && pageCount < maxPages) {
        const postData = await fetchDouyin("/aweme/v1/web/aweme/post/", {
          sec_user_id: secUserId,
          count: "18",
          max_cursor: maxCursor,
          locate_query: "false",
          publish_video_strategy_type: "2",
        });

        const awemeList = postData.aweme_list || [];
        rawVideos.push(...awemeList);
        hasMore = postData.has_more === 1 || postData.has_more === true;
        maxCursor = String(postData.max_cursor || "0");
        pageCount += 1;

        if (limit && rawVideos.length >= limit) break;

        // Random delay between requests (anti rate-limiting)
        const baseDelay = 3000;
        const jitter = Math.random() * 2000; // 0-2秒抖动
        await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      }

      // Step 3: Deduplicate and format
      const seen = new Set();
      const videos = rawVideos
        .filter((video) => {
          const key = String(video.aweme_id);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, limit || undefined)
        .map((video) => {
          const stats = video.statistics || {};
          const duration = video.duration ? `${String(Math.floor(video.duration / 60000)).padStart(2, "0")}:${String(Math.floor((video.duration % 60000) / 1000)).padStart(2, "0")}` : "";
          const publishedAt = video.create_time ? new Date(Number(video.create_time) * 1000).toISOString() : "";
          return {
            id: String(video.aweme_id),
            title: video.desc || "",
            url: `https://www.douyin.com/video/${video.aweme_id}`,
            publishedAt,
            duration,
            likes: stats.digg_count ?? 0,
            views: stats.play_count ?? 0,
            comments: stats.comment_count ?? 0,
            shares: stats.share_count ?? 0,
            favorites: stats.collect_count ?? 0,
            coins: 0,
          };
        });

      return {
        account: {
          platform: "douyin",
          id: secUserId,
          url: `https://www.douyin.com/user/${secUserId}`,
          name: userInfo.nickname || "",
          followers: userInfo.follower_count ?? userInfo.mplatform_followers_count ?? 0,
          videoCount: userInfo.aweme_count ?? videos.length,
          totalLikes: userInfo.total_favorited ?? videos.reduce((sum, v) => sum + v.likes, 0),
          totalViews: videos.reduce((sum, v) => sum + v.views, 0),
          totalComments: videos.reduce((sum, v) => sum + v.comments, 0),
          fetchedAt: new Date().toISOString(),
        },
        videos,
      };
    },
    { secUserId, limit, signScript }
  );

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.account) {
  console.error("Error: --account is required");
  console.error("\nUsage:");
  console.error("  node scripts/collect.mjs --account https://www.douyin.com/user/MS4wLjABAAAA...");
  console.error("\nOptions:");
  console.error("  --account   Douyin profile URL or sec_user_id (required)");
  console.error("  --profile   Browser profile directory (default: ./private/profiles/douyin)");
  console.error("  --limit     Max videos to fetch (default: 200)");
  console.error("  --out       Output directory (default: ./outputs/<account_id>)");
  process.exit(1);
}

(async () => {
  const secUserId = extractSecUserId(args.account);
  const profileDir = args.profile || "./private/profiles/douyin";
  const limit = args.limit ? parseInt(args.limit, 10) : 200;
  const outDir = args.out || join("./outputs", secUserId);

  console.log(`[douyin_skill v3.0] Collecting account: ${secUserId}`);
  console.log(`[douyin_skill v3.0] Mode: Browser-native API calls`);
  console.log(`[douyin_skill v3.0] limit=${limit}`);

  await mkdir(profileDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const context = await chromium.launchPersistentContext(profileDir, buildBrowserOptions());

  try {
    // Inject stealth script
    const stealthPath = join(__dirname, "adapters", "stealth.min.js");
    try {
      const stealthScript = readFileSync(stealthPath, "utf8");
      await context.addInitScript(stealthScript);
      console.log("[Stealth] Anti-detection script injected.");
    } catch (err) {
      console.warn(`[Stealth] Warning: ${err.message}`);
    }

    const page = context.pages()[0] || (await context.newPage());

    // Navigate and wait for login
    await page.goto(`https://www.douyin.com/user/${secUserId}`, { waitUntil: "domcontentloaded" });
    await waitForLogin(page, context);

    // Collect data using in-browser API calls
    const result = await collectInBrowser(page, secUserId, limit);

    // Save results
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "summary.json"), JSON.stringify(result.account, null, 2), "utf8");
    writeFileSync(join(outDir, "videos.json"), JSON.stringify(result.videos, null, 2), "utf8");

    // CSV
    const csvHeader = "id,title,url,publishedAt,duration,likes,views,comments,shares,favorites,coins";
    const csvRows = result.videos.map((v) =>
      [v.id, `"${String(v.title).replace(/"/g, '""')}"`, v.url, v.publishedAt, v.duration, v.likes, v.views, v.comments, v.shares, v.favorites, v.coins].join(",")
    );
    writeFileSync(join(outDir, "videos.csv"), "﻿" + [csvHeader, ...csvRows].join("\n"), "utf8");

    // Summary
    console.log("\n[douyin_skill v3.0] Done!");
    console.log(`  Account : ${result.account.name} (${result.account.id})`);
    console.log(`  Followers: ${result.account.followers.toLocaleString()}`);
    console.log(`  Videos  : ${result.videos.length} fetched (total: ${result.account.videoCount})`);
    console.log(`  Likes   : ${result.account.totalLikes.toLocaleString()}`);
    console.log(`  Views   : ${result.account.totalViews.toLocaleString()}`);
    console.log(`  Output  : ${outDir}`);
  } catch (err) {
    console.error(`[douyin_skill v3.0] Error: ${err.message}`);
    process.exit(1);
  } finally {
    await context.close();
  }
})();
