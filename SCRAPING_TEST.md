# How to test event scraping

This guide walks through verifying that the scraping pipeline runs: **AI service runs scrapers → dedup → writes Firestore `events` → backend serves them via API**.

---

## What “working” looks like

After a successful scrape you should see:

1. **AI service** responds to `POST /scrape` with `"status": "ok"` and counts like `total_scraped`, `inserted`, `skipped_duplicates`.
2. **Firestore** has documents in the **`events`** collection (Firebase Console).
3. **Backend** returns data from **`GET http://localhost:5000/api/events`** (and **`GET /api/events/recommended`** when authenticated).

Note: **Live websites change markup.** If `total_scraped` is `0`, scrapers may need selector updates; Telegram preview scraping usually returns rows if the channel is public.

---

## Prerequisites

| Requirement | Why |
|-------------|-----|
| Firebase Admin credentials in `.env` | AI service **writes** scraped events to Firestore |
| Same Firebase project as the backend | So the backend can **read** the same `events` collection |
| Network access | Scrapers call public URLs (AllAddis, WhatsUpAddis, `t.me/s/...`) |
| Python 3.10+ (for local AI run) | To run the FastAPI app outside Docker |

**AI service** — set in `Wuloye-/ai-service/.env` (copy from `.env.example` if needed):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (with `\n` for newlines in the string if needed)

**Optional**

- `SCRAPER_API_KEY` — if set, every `POST /scrape` must send header **`X-Scraper-Key: <same value>`** on the AI service.
- `TELEGRAM_CHANNEL` — default is `EventsEthiopia` (no `@`).

**Backend** (to test the public events API after scraping):

- Same Firebase vars in `Wuloye-/backend/.env`
- `AI_SERVICE_URL=http://localhost:8000` when backend runs on your machine and AI runs locally  
  (use `http://ai-service:8000` only inside Docker Compose)

---

## Step 1 — Install AI service dependencies

From the repo root (or `ai-service` folder):

```powershell
cd c:\Users\biruk\Desktop\wuloye\Wuloye-\ai-service
python -m pip install -r requirements.txt --retries 10 --default-timeout 1000
```

If PyTorch download fails, retry the command (large wheels).

---

## Step 2 — Start the AI service

```powershell
cd c:\Users\biruk\Desktop\wuloye\Wuloye-\ai-service
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Quick health check (another terminal):

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/health" -Method Get
```

Open interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs) — you should see **POST /scrape**.

---

## Step 3 — Trigger a scrape (main test)

### 3a — No `SCRAPER_API_KEY` set (simplest)

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/scrape" -Method Post -ContentType "application/json" -Body "{}"
```

Or with `curl` (if installed):

```bash
curl -X POST "http://localhost:8000/scrape" -H "Content-Type: application/json" -d "{}"
```

### 3b — `SCRAPER_API_KEY` is set in `ai-service/.env`

Use the same value in the header (example: `my-secret-key`):

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "X-Scraper-Key" = "my-secret-key"
}
Invoke-RestMethod -Uri "http://localhost:8000/scrape" -Method Post -Headers $headers -Body "{}"
```

### 3c — Read the response

Example shape:

```json
{
  "status": "ok",
  "elapsed_ms": 12345,
  "total_scraped": 12,
  "inserted": 5,
  "skipped_duplicates": 7,
  "sources": {
    "alladdisevents": 2,
    "whatsupaddis": 1,
    "telegram_events_ethiopia": 2
  },
  "ran_at": "2026-04-30T12:00:00+00:00"
}
```

- **`inserted` > 0** — new rows were written to Firestore.
- **`total_scraped` 0** — no events parsed (site changes, network block, or empty pages). Check AI service logs.
- **`skipped_duplicates` high** — normal on a second run; dedup uses `title + date + location`.

---

## Step 4 — Verify in Firestore

1. Open [Firebase Console](https://console.firebase.google.com) → your project.
2. **Firestore Database** → collection **`events`**.
3. You should see documents with fields like: `title`, `date`, `location`, `category`, `source`, `hash`, `created_at`.

---

## Step 5 — Verify backend API (reads same Firestore)

Start the backend (from `Wuloye-/backend`):

```powershell
cd c:\Users\biruk\Desktop\wuloye\Wuloye-\backend
npm run dev
```

List events:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/events?limit=20" -Method Get
```

Optional filters:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/events?category=music&limit=10" -Method Get
```

**Personalised list** (`/api/events/recommended`) needs a valid Firebase **Bearer** token (same as the mobile app). Easiest check without auth: use **`GET /api/events`** first.

---

## Step 6 — Test backend → AI scheduled scrape (optional)

With **both** services running and `SCRAPING_ENABLED` not set to `false`:

- Backend calls `AI_SERVICE_URL + "/scrape"` on a schedule (default **every 8 hours**) and once **~30 seconds** after startup.
- Ensure `AI_SERVICE_URL` points to a reachable AI service.
- If you set **`SCRAPER_API_KEY`** on the AI service, set the **same** value in **`backend/.env`** as `SCRAPER_API_KEY` so the backend job sends **`X-Scraper-Key`**.

Watch backend logs for lines like `[scrapeEvents] Cycle complete`.

---

## Step 7 — Test ranking endpoint (AI only)

This does **not** scrape; it only scores a list you send.

```powershell
$body = @{
  user_id = "test-user"
  user_profile = @{
    interests = @("music", "tech")
    typeAffinity = @{ music = 0.9; tech = 0.5 }
  }
  events = @(
    @{
      id = "evt1"
      title = "Jazz Night"
      category = "music"
      date = "2026-05-15T18:00:00Z"
      location = "Bole"
      description = "Live jazz"
      image = ""
      source_url = "https://example.com"
    }
  )
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Uri "http://localhost:8000/events/rank" -Method Post -ContentType "application/json" -Body $body
```

You should get `"ranked"` with scores sorted highest first.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `401` on `/scrape` | Set **`X-Scraper-Key`** to match **`SCRAPER_API_KEY`** in `ai-service/.env`, or remove the key from `.env` for local testing. |
| `500` / Firebase errors | `FIREBASE_*` in **`ai-service/.env`**; private key format; Firestore enabled for the project. |
| `total_scraped: 0` | Inspect terminal logs from uvicorn; sites may have changed HTML; try Telegram-only by temporarily disabling other scrapers in code if debugging. |
| Backend `/api/events` empty | Scrape may not have inserted rows; confirm **`events`** collection in Firebase; backend uses same project as AI service. |
| Docker Compose | Backend must use **`AI_SERVICE_URL=http://ai-service:8000`** (service name), not `localhost`. |

---

## Discover tab → “Events” chip looks empty

That screen calls **`GET /api/recommendations?category=events`** (not `/api/events`). It only shows rows from the Firestore **`events`** collection (scraped data). It stays empty if:

1. **Nothing has been scraped yet** — run **`POST /scrape`** on the AI service (see Step 3).
2. **All stored `date` values are in the past** — the API prefers `date >= now`, then falls back to newest by `created_at`. If it is still empty, the collection is empty or fields are missing.
3. **Wrong API URL on the phone** — `EXPO_PUBLIC_API_BASE_URL` must point at the backend that shares the same Firebase project as the scraper.

Use **`GET /api/events`** or the **Events** tab in the app (which uses **`/api/events/recommended`**) as additional checks.

---

## Quick checklist

- [ ] `ai-service/.env` has valid Firebase credentials  
- [ ] `POST http://localhost:8000/scrape` returns `"status": "ok"`  
- [ ] Firestore **`events`** collection has documents  
- [ ] `GET http://localhost:5000/api/events` returns `events: [...]`  
- [ ] `GET /api/recommendations?category=events` (with auth) returns non-empty `data` after scrape  
- [ ] (Optional) Backend logs show `[scrapeEvents]` after startup / on schedule  
