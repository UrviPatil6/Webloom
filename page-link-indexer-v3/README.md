# ⚡ Page Link Indexer v3.1 — Sub-1-Hour Indexing (2026 + YouTube)

Get your URLs indexed across all major search engines within an hour using **9 parallel indexing strategies**. v3.1 is **2026-compliant**: Google sitemap ping removed (deprecated), IndexNow includes Yep, and **YouTube URL submission** sends video links to IndexNow + Bing.

## 🎯 The 9 Strategies

| # | Strategy | Target | Speed | Config Required |
|---|----------|--------|-------|-----------------|
| 1 | **Google Indexing API** | Google | ~minutes | Service Account (GOOGLE_CONTENT_TYPE for 2026) |
| 2 | **IndexNow Protocol** | Bing, Yandex | ~instant | SITE_URL only |
| 3 | **Bing Webmaster API** | Bing (priority queue) | ~minutes | Bing API Key |
| 4 | **WebSub/PubSubHubbub** | Google (via hub) | ~minutes | None (auto) |
| 5 | **RSS/XML-RPC Ping** | 1 aggregation service | ~minutes | None (auto) |
| 6 | **Yandex Webmaster** | Yandex (direct recrawl) | ~minutes | Yandex OAuth |
| 7 | **Sitemap Ping** | Bing only (Google deprecated) | ~10-30 min | SITEMAP_URL |
| 8 | **Auto Recent Sitemap** | All engines | ~30-60 min | SITE_URL only |
| 9 | **YouTube** | IndexNow + Bing (video URLs) | ~instant | SITE_URL only |

**BONUS:** Google Search Console sitemap resubmit; **Video sitemap** at `/sitemap-video.xml` for submitted YouTube URLs.

## 🚀 Quick Start

```bash
npm install
cp .env.example .env    # Set SITE_URL at minimum
npm start               # → http://localhost:3100
```

## ⚙️ Configuration

### Minimum (3 strategies active)
```env
SITE_URL=https://yoursite.com
SITEMAP_URL=https://yoursite.com/sitemap.xml
```
This enables: IndexNow, WebSub, RSS Ping, Sitemap Ping, and Auto Recent Sitemap.

### Recommended (6+ strategies)
```env
SITE_URL=https://yoursite.com
SITEMAP_URL=https://yoursite.com/sitemap.xml
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account.json
BING_API_KEY=your-bing-api-key
```

### Full Power (all strategies)
```env
SITE_URL=https://yoursite.com
SITEMAP_URL=https://yoursite.com/sitemap.xml
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account.json
BING_API_KEY=your-bing-api-key
YANDEX_ACCESS_TOKEN=your-yandex-token
YANDEX_USER_ID=your-user-id
YANDEX_HOST_ID=your-host-id
```

## 🖥️ Dashboard

Mission-control interface at `http://localhost:3100`:
- **9-service health bar** with real-time status
- **SSE live feed** — no polling, instant updates
- **30-day activity chart** — pure canvas, no libraries
- **URL Inspector** — check Google indexing status
- **Quick actions** — Sitemap Ping, GSC Resubmit, WebSub Push, RSS Ping, **YouTube Submit**
- **Drag & drop** file upload (.txt/.csv)
- **⌘+Enter** keyboard shortcut to submit

## 📡 API Reference

### Core Endpoints

```bash
# Submit to ALL 9 services (parallel)
curl -X POST http://localhost:3100/api/index \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://yoursite.com/new-page"]}'

# Submit to specific services only (e.g. YouTube only)
curl -X POST http://localhost:3100/api/index \
  -d '{"urls": ["..."], "services": ["google", "indexnow", "bing_webmaster", "youtube"]}'
```

### Individual Strategy Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/index` | All services |
| POST | `/api/index/google` | Google Indexing API only |
| POST | `/api/index/indexnow` | IndexNow (2 engines) |
| POST | `/api/index/bing` | Bing Webmaster API |
| POST | `/api/index/youtube` | YouTube URLs → IndexNow + Bing |
| POST | `/api/index/yandex` | Yandex Webmaster |
| POST | `/api/index/websub` | WebSub/PubSubHubbub |
| POST | `/api/index/rss-ping` | RSS XML-RPC ping |
| POST | `/api/sitemap/ping` | Sitemap ping (Bing) |
| POST | `/api/sitemap/resubmit` | Force GSC sitemap resubmit |
| POST | `/api/inspect` | URL inspection (Google) |
| POST | `/api/youtube/submit` | Submit YouTube URLs only |
| GET | `/api/youtube/videos` | List stored YouTube video IDs |
| GET | `/api/youtube/jsonld/:videoId` | VideoObject JSON-LD for a video |
| GET | `/sitemap-recent.xml` | Dynamic recent sitemap |
| GET | `/sitemap-video.xml` | Dynamic video sitemap (YouTube) |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Current statistics |
| GET | `/api/stats/daily?days=30` | Daily breakdown |
| GET | `/api/history` | Submission history |
| GET | `/api/service-health` | Service status |
| GET | `/api/url-status?url=...` | Per-URL status |

### Webhooks (auto-submit on publish)

| Endpoint | Platform |
|----------|----------|
| `/webhook/wordpress` | WordPress |
| `/webhook/ghost` | Ghost CMS |
| `/webhook/webflow` | Webflow |
| `/webhook/strapi` | Strapi |
| `/webhook/netlify` | Netlify (deploy → sitemap ping) |
| `/webhook/vercel` | Vercel (deploy → sitemap ping) |
| `/webhook/automation` | n8n / Zapier / Make |
| `/webhook/generic` | Any platform |

## 🔧 CLI

```bash
# Submit to all 8 services
node src/cli.js https://yoursite.com/page1 https://yoursite.com/page2

# Submit from file
node src/cli.js --file urls.txt

# Individual strategies
node src/cli.js --google https://yoursite.com/page
node src/cli.js --indexnow https://yoursite.com/page
node src/cli.js --bing https://yoursite.com/page
node src/cli.js --yandex https://yoursite.com/page
node src/cli.js --websub
node src/cli.js --rss-ping
node src/cli.js --sitemap-ping
node src/cli.js --sitemap-resubmit

# Tools
node src/cli.js --inspect https://yoursite.com/page
node src/cli.js --stats
node src/cli.js --key
```

## 🐳 Docker

```bash
docker compose up -d
```

## 🔑 Setup Guides

### Google Indexing API
1. Create a Google Cloud project
2. Enable "Web Search Indexing API" + "Search Console API"
3. Create a service account → download JSON key
4. In Google Search Console → Settings → Users → Add the service account email as **Owner**
5. Set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account.json`

### Bing Webmaster API
1. Go to [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. Add and verify your site
3. Go to Settings → API Access → Generate API Key
4. Set `BING_API_KEY=your-key`

### Yandex Webmaster API
1. Go to [Yandex Webmaster](https://webmaster.yandex.com)
2. Add and verify your site
3. Get OAuth token from API settings
4. Set `YANDEX_ACCESS_TOKEN`, `YANDEX_USER_ID`, `YANDEX_HOST_ID`

### IndexNow Key Verification
Your key is served at `https://yoursite.com/{key}.txt`. If you're running behind a proxy, either:
- Point that URL to this server, OR
- Host the key file on your site manually (get key with `node src/cli.js --key`)

## 📊 How It Achieves Sub-1-Hour Indexing

1. **Parallel execution** — All 9 strategies fire simultaneously, not sequentially
2. **Direct push APIs** — Google, Bing, Yandex all receive direct notifications
3. **Hub notifications** — WebSub tells Google's PubSubHubbub hub about your content
4. **RSS aggregator pings** — 5 services notified via XML-RPC
5. **Dynamic sitemap** — `/sitemap-recent.xml` with `<lastmod>` set to NOW and `<priority>1.0`
6. **GSC sitemap resubmit** — Deletes and re-adds sitemap to force fresh crawl
7. **Retry with backoff** — Failed requests retry up to 3 times with exponential backoff
8. **Rate limit awareness** — Tracks Google's 200/day quota, never wastes API calls
9. **YouTube URLs** — Video links submitted to IndexNow + Bing; video sitemap at `/sitemap-video.xml`
