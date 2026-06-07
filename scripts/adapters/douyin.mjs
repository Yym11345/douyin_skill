import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load douyin.js signing library ───────────────────────────────────
const signCode = readFileSync(join(__dirname, "douyin-sign.js"), "utf8");
const signCtx = { console, Math, String, Array, Date, RegExp, encodeURIComponent };
vm.createContext(signCtx);
vm.runInContext(signCode, signCtx);

function getABogus(params, userAgent) {
  return vm.runInContext(`sign_datail(${JSON.stringify(params)}, ${JSON.stringify(userAgent)})`, signCtx);
}

// ── UA rotation pool ─────────────────────────────────────────────────
const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
];

// ── Helpers ──────────────────────────────────────────────────────────
function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(base) {
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, jitter(ms)));
}

function generateWebId() {
  const template = "10000000-1000-4000-8000-10000000000";
  let result = "";
  for (const ch of template) {
    if (ch === "0" || ch === "1" || ch === "8") {
      const t = parseInt(ch);
      result += String(t ^ ((Math.floor(16 * Math.random()) >> (t / 4)) >>> 0));
    } else {
      result += ch;
    }
  }
  return result.replace(/-/g, "").slice(0, 19);
}

function extractSecUserId(account) {
  const text = String(account);
  // Raw sec_user_id (starts with MS4wLjABAAAA)
  if (text.startsWith("MS4wLjABAAAA")) return text;
  // URL: https://www.douyin.com/user/MS4wLjABAAAA...
  const match = text.match(/douyin\.com\/user\/([^/?]+)/);
  if (match) return match[1];
  // Pure ID that looks like sec_uid
  if (!text.includes("/") && !text.includes(".") && text.length > 20) return text;
  throw new Error("Could not find Douyin sec_user_id in account URL or id.");
}

function extractMsToken(cookieHeader) {
  if (!cookieHeader) return "";
  const match = cookieHeader.match(/msToken=([^;,\s]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// ── Browser fingerprint params ───────────────────────────────────────
function getCommonParams(ua) {
  return {
    device_platform: "webapp",
    aid: "6383",
    channel: "channel_pc_web",
    version_code: "190600",
    version_name: "19.6.0",
    cookie_enabled: "true",
    screen_width: "1920",
    screen_height: "1080",
    browser_language: "zh-CN",
    browser_platform: ua.includes("Mac") ? "MacIntel" : "Win32",
    browser_name: "Chrome",
    browser_version: "136.0.0.0",
    browser_online: "true",
    engine_name: "Blink",
    engine_version: "136.0.0.0",
    os_name: ua.includes("Mac") ? "Mac OS" : "Windows",
    os_version: ua.includes("Mac") ? "10.15.7" : "10",
    cpu_core_num: "8",
    device_memory: "8",
    platform: "PC",
    downlink: "10",
    effective_type: "4g",
    round_trip_time: "50",
    webid: generateWebId(),
  };
}

function buildHeaders(ua, referer, cookieHeader) {
  return {
    "user-agent": ua,
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "accept-encoding": "gzip, deflate, br, zstd",
    "cache-control": "no-cache",
    referer,
    "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": ua.includes("Mac") ? '"macOS"' : '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    pragma: "no-cache",
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

// ── Request with retry + exponential backoff ──────────────────────────
async function getJson(endpoint, params, referer, cookieHeader = "", retries = 2, customUA = null, fetchFn = null) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const ua = customUA || randItem(UA_POOL);
      const commonParams = getCommonParams(ua);
      const msToken = extractMsToken(cookieHeader);
      const allParams = { ...commonParams, ...params, msToken };

      // Build query string
      const queryStr = Object.keys(allParams)
        .sort()
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(allParams[k]))}`)
        .join("&");

      // Sign with a_bogus
      const aBogus = getABogus(queryStr, ua);
      const url = `https://www.douyin.com${endpoint}?${queryStr}&a_bogus=${encodeURIComponent(aBogus)}`;

      const headers = buildHeaders(ua, referer, cookieHeader);
      const response = await (fetchFn ? fetchFn(url, { headers }) : fetch(url, { headers }));

      if (response.status === 412 || response.status === 403) {
        throw new Error(`HTTP ${response.status}: Douyin risk-control ban (retryable)`);
      }

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Douyin returned non-JSON status=${response.status}: ${text.slice(0, 90)} (retryable)`);
      }

      if (data.status_code && data.status_code !== 0) {
        throw new Error(`Douyin API error code=${data.status_code}: ${data.status_msg || ""} (retryable)`);
      }

      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep(2000);
      }
    }
  }
  throw lastError;
}

function toIso(ts) {
  if (!ts) return "";
  // Douyin timestamps are in seconds
  const ms = Number(ts) * 1000;
  return new Date(ms + 8 * 3600 * 1000).toISOString().replace(".000Z", "+08:00");
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const s = Number(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// ── Main collect function ────────────────────────────────────────────
export async function collect({ account, cookieHeader = "", limit, delay = 5000, customUA = null, fetchFn = null }) {
  const secUserId = extractSecUserId(account);
  const userUrl = `https://www.douyin.com/user/${secUserId}`;
  const refererBase = `https://www.douyin.com/user/${secUserId}`;

  // 1. Fetch user profile
  const profileData = await getJson(
    "/aweme/v1/web/user/profile/other/",
    {
      sec_user_id: secUserId,
      publish_video_strategy_type: "2",
      personal_center_strategy: "1",
    },
    refererBase,
    cookieHeader,
    2,
    customUA,
    fetchFn
  );
  await sleep(delay);

  const user = profileData.user || {};
  const userModule = profileData.user_module || {};
  const userInfo = userModule.user || user;

  // 2. Fetch videos (paginated)
  const rawVideos = [];
  let maxCursor = "";
  let hasMore = true;
  let pageCount = 0;
  const maxPages = limit ? Math.ceil(limit / 18) : 50;

  while (hasMore && pageCount < maxPages) {
    const postData = await getJson(
      "/aweme/v1/web/aweme/post/",
      {
        sec_user_id: secUserId,
        count: "18",
        max_cursor: maxCursor,
        locate_query: "false",
        publish_video_strategy_type: "2",
        verifyFp: "verify_ma3hrt8n_q2q2HyYA_uLyO_4N6D_BLvX_E2LgoGmkA1BU",
        fp: "verify_ma3hrt8n_q2q2HyYA_uLyO_4N6D_BLvX_E2LgoGmkA1BU",
      },
      refererBase,
      cookieHeader,
      2,
      customUA,
      fetchFn
    );
    await sleep(delay);

    const awemeList = postData.aweme_list || [];
    rawVideos.push(...awemeList);
    hasMore = postData.has_more === 1 || postData.has_more === true;
    maxCursor = String(postData.max_cursor || "0");
    pageCount += 1;

    if (limit && rawVideos.length >= limit) break;
  }

  // 3. Deduplicate and limit
  const seen = new Set();
  const uniqueVideos = rawVideos
    .filter((video) => {
      const key = String(video.aweme_id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit || undefined);

  // 4. Map to output schema
  const videos = uniqueVideos.map((video) => {
    const stats = video.statistics || {};
    return {
      id: String(video.aweme_id),
      title: video.desc || "",
      url: `https://www.douyin.com/video/${video.aweme_id}`,
      publishedAt: toIso(video.create_time),
      duration: formatDuration(video.duration),
      likes: stats.digg_count ?? 0,
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
      url: userUrl,
      name: userInfo.nickname || "",
      followers: userInfo.follower_count ?? userInfo.mplatform_followers_count ?? 0,
      videoCount: userInfo.aweme_count ?? videos.length,
      totalLikes: userInfo.total_favorited ?? videos.reduce((sum, v) => sum + v.likes, 0),
      totalComments: videos.reduce((sum, v) => sum + v.comments, 0),
      fetchedAt: new Date().toISOString(),
    },
    videos,
  };

}
