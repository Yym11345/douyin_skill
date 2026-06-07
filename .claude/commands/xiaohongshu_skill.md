---
description: 閲囬泦灏忕孩涔﹀垱浣滆€呰处鍙锋暟鎹?鈥?绮変笣鏁般€佺瑪璁板垪琛紙鐐硅禐/鏀惰棌/璇勮/鍒嗕韩/灏侀潰/鏍囩/鍥炬枃鍥剧墖锛夛紝瀵煎嚭 JSON/CSV/HTML 鎶ュ憡
argument-hint: <灏忕孩涔︿富椤礥RL鎴杣ser_id> [--limit N] [--delay ms] [--relogin] [--profile 璺緞]
---

# /xiaohongshu_skill

閲囬泦灏忕孩涔﹀垱浣滆€呰处鍙风殑瀹屾暣鏁版嵁锛岃緭鍑?summary.json / videos.json / videos.csv / report.html 鍥涗釜鏂囦欢銆?
## 鍙傛暟

- 绗竴涓弬鏁帮細灏忕孩涔︿富椤?URL 鎴?user_id锛堝繀濉級
- `--limit N`锛氭渶澶氶噰闆嗗灏戞潯绗旇锛堥粯璁?200锛?- `--delay MS`锛氭瘡杞粴鍔ㄧ瓑寰呮绉掓暟锛堥粯璁?3000锛?- `--relogin`锛氭竻闄ょ櫥褰曠姸鎬侊紝閲嶆柊鎵爜
- `--profile 璺緞`锛氫娇鐢ㄧ嫭绔?profile锛堝璐﹀彿鍒囨崲锛?
## 鎵ц

**瀹夎璺緞**: D:\edgedownload\ai_projects\xiaohongshu_skill

`ash
node "D:/edgedownload/ai_projects/xiaohongshu_skill/scripts/collect.mjs" $ARGUMENTS
`

## 閲囬泦鎴愬姛鍚庤緭鍑?
- 璐﹀彿鏄电О + user_id
- 绮変笣鏁般€佽幏璧炰笌鏀惰棌鏁?- 宸查噰闆嗗笘瀛愭暟 / 鎬诲笘瀛愭暟
- 杈撳嚭鐩綍璺緞锛堟彁绀虹敤鎴锋墦寮€ report.html锛?
## 甯歌閿欒

- `--account is required` 鈫?鎻愮ず鐢ㄦ埛浼犲叆璐﹀彿 URL
- 娴忚鍣ㄥ脊鍑轰絾鏃犳暟鎹?鈫?鐧诲綍杩囨湡锛屽缓璁姞 `--relogin`
- `HTTP 412/403` 鈫?椋庢帶锛屽缓璁?`--delay 5000`