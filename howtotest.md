# How to test — Backend, AI service, and Mobile

This guide walks through running **all three parts** of Wuloye locally (or via Docker), what to expect at each step, and how to validate the **AI ↔ Backend ↔ Mobile** loop.

Paths below assume the repo root is:

`Wuloye-/` (contains `backend/`, `ai-service/`, `mobile/`, `docker-compose.yml`).

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js** | ≥ 18 |
| **Python** | 3.10+ recommended for `ai-service` |
| **Firebase** | Same project for backend + AI + mobile; service account in `.env` |
| **OpenAI API key** | Optional but recommended for embeddings; without it, embedding scores fall back gracefully |
| **Expo CLI / Expo Go** | For the mobile app (`npm` scripts use `expo start`) |

---

## 2. Configure environment files

### Backend — `backend/.env`

Copy from `backend/.env.example` and set at minimum:

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- **Local development with AI on the same machine:**

```env
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_ENABLED=true
AI_SERVICE_TIMEOUT_MS=800
AI_SCORE_BLEND=0.3
```

When using **Docker Compose**, the backend container talks to the AI container by service name; use:

```env
AI_SERVICE_URL=http://ai-service:8000
```

(On your **host machine**, always use `http://localhost:8000` when curling the AI service directly.)

### AI service — `ai-service/.env`

Copy from `ai-service/.env.example` and set:

- Same Firebase credentials as the backend (training reads Firestore)
- `OPENAI_API_KEY` if you want full embedding behaviour

### Mobile — Expo env (optional)

The app resolves `API_BASE_URL` automatically in dev (Metro host + port **5000**). To override:

```bash
# In mobile folder, or system env when starting Expo
set EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:5000/api
```

Use your PC’s LAN IP when testing on a **physical phone** so the device can reach the backend.

---

## 3. Run everything locally (three terminals)

Use this for day‑to‑day development without Docker.

### Terminal A — AI service (FastAPI, port **8000**)

```powershell
cd path\to\Wuloye-\ai-service
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**What you should see**

- Logs like `[startup] model artefacts loaded` (model files under `ai-service/data/`).
- No crash on import; if Firebase env is wrong, `/train` will fail later — `/predict` can still run with cold‑start neutral scores depending on artefacts.

**Quick check (browser or curl)**

- Open `http://localhost:8000/docs` — Swagger UI for `/predict`, `/train`, `/model/status`, `/api/health`.

---

### Terminal B — Backend (Express, port **5000**)

```powershell
cd path\to\Wuloye-\backend
npm install
npm run dev
```

(`npm start` works too; `dev` uses nodemon if installed.)

**What you should see**

- Server listening on port **5000** (or `PORT` from `.env`).
- On each recommendation request with AI enabled, logs may include `[AI] /predict OK` or timeout warnings if the AI service is down.

---

### Terminal C — Mobile (Expo)

```powershell
cd path\to\Wuloye-\mobile
npm install
npx expo start
```

Then press **`a`** (Android emulator), **`i`** (iOS simulator), or scan the QR code with Expo Go on a device.

**What you should see**

- Metro bundler URL; in dev the app logs `[Wuloye] API_BASE_URL = http://...:5000/api` (check Metro console).

---

## 4. Run with Docker Compose (backend + AI only)

From `Wuloye-/`:

```powershell
docker compose build
docker compose up -d
```

**Ports**

- Backend: `http://localhost:5000`
- AI: `http://localhost:8000`

**Backend `.env` inside Compose** should use `AI_SERVICE_URL=http://ai-service:8000` (already typical for compose).

Mobile still runs on the host with Expo; point `EXPO_PUBLIC_API_BASE_URL` at `http://localhost:5000/api` or your LAN IP + `:5000/api`.

---

## 5. Test the AI service (HTTP)

Run these from **any** terminal (PowerShell examples). No auth required on the AI service by default.

### 5.1 Health

```powershell
curl http://localhost:8000/api/health
```

**Expect:** JSON with `"status"`, `"modelVersion"`, `"lastTrainedAt"` (may be `null` if never trained).

### 5.2 Model status

```powershell
curl http://localhost:8000/model/status
```

**Expect:** `modelVersion`, `lastTrainedAt`, `dataSize`, `performanceMetrics`, and optional `openai_embedding` config snapshot when `OPENAI_API_KEY` is set.

### 5.3 Predict (minimal body)

Replace candidate IDs with real place IDs from your Firestore seed if needed.

```powershell
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d "{\"user_id\":\"test-user\",\"candidates\":[{\"place_id\":\"p1\",\"place_type\":\"gym\",\"place_name\":\"Gym\",\"place_description\":\"Weights\",\"rating\":4.5,\"raw_score\":40}],\"context\":{\"time_of_day\":\"morning\",\"session_intent\":\"fitness\",\"recent_types\":[\"gym\",\"coffee\"],\"type_affinity\":{\"gym\":0.8}}}"
```

**Expect:**

- `ranked_places` with `ai_score`, component scores
- `predicted_type` and `confidence` from the sequence model
- `inference_ms` under a few hundred ms on CPU for small batches

### 5.4 Train (Firestore required)

```powershell
curl -X POST http://localhost:8000/train
```

**Expect:** Success JSON with updated version/timestamps when Firebase credentials and data exist; otherwise an error message about Firebase or empty dataset — fix env and retry.

---

## 6. Test the backend (HTTP)

Protected routes need a **Firebase ID token** (`Authorization: Bearer <token>`).

### 6.1 Health (no auth)

```powershell
curl http://localhost:5000/api/health
```

**Expect:** `200` and JSON indicating readiness (may include Firestore ping depending on implementation).

### 6.2 Get a Bearer token

**Option A — Use the mobile app**  
Sign in, then use React Native debugger / Flipper / temporary logging (not ideal for quick checks).

**Option B — Script**  
From `backend/` with `.env` loaded, if `get-test-token.js` is configured (needs `FIREBASE_WEB_API_KEY` in env for token exchange):

```powershell
cd path\to\Wuloye-\backend
node get-test-token.js
```

Copy the printed JWT.

**Option C — Firebase CLI / REST**  
Any workflow that produces a valid Firebase **ID token** for your app’s API key works.

### 6.3 Recommendations with debug + AI metadata

```powershell
$TOKEN = "<paste Firebase ID token>"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/recommendations?debug=true&limit=5"
```

**Expect:**

- `success: true`, `data.recommendations` array
- With AI up and `AI_SERVICE_ENABLED=true`: scores reflect blending; `meta.ai` includes **`predictedType`**, **`confidence`**, **`pyModelVersion`**, **`pyModelActive`**
- With `debug=true`: each item may include `scoreBreakdown` with model‑related fields where applicable

### 6.4 Log an interaction

```powershell
curl -X POST http://localhost:5000/api/interactions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"placeId\":\"YOUR_PLACE_ID\",\"actionType\":\"save\",\"metadata\":{\"source\":\"manual_test\"}}"
```

**Expect:** `201`, interaction object returned.

### 6.5 Batch interactions (correct body shape)

```powershell
curl -X POST http://localhost:5000/api/interactions/batch -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"items\":[{\"placeId\":\"id1\",\"actionType\":\"view\"},{\"placeId\":\"id2\",\"actionType\":\"view\"}]}"
```

**Expect:** `201` — **not** `400` complaining about missing `items`.

---

## 7. Test the mobile app (end‑to‑end)

1. Start **AI** → **backend** → **Expo** as in section 3.
2. Sign in on the app (same Firebase project as the backend).
3. Open **Home**.

**You should see**

- Recommendations loading without mock placeholders (real API data).
- Optional **AI status line** under the filter chips when `meta.ai.pyModelActive` is true and `predictedType` is present, e.g. “AI · Next predicted: Gym · …”.
- **Place cards** may show a short **insight line** when the place aligns with predicted type / top interest / session intent (`aiInsight`).

**Interactions**

- Tap a card → navigates to detail; a **click** interaction is sent.
- **Save** / **Dismiss** on the card → POST `/api/interactions`, list updates; after ~1.5s a **silent refresh** may reorder recommendations.

**Pull to refresh** on Home → full reload from `/api/recommendations`.

---

## 8. Scenario checklist (what “working” looks like)

| Layer | Check |
|-------|--------|
| **AI** | `/api/health` and `/model/status` return JSON; `/predict` returns `ranked_places` + `predicted_type` |
| **Backend** | `/api/recommendations` returns 401 without token, 200 with token; `meta.ai.predictedType` appears when AI is reachable |
| **Integration** | Backend logs show `[AI] merged …` when AI is up; if AI is stopped, recommendations still return (rule‑based fallback) |
| **Mobile** | API base URL points to `:5000/api`; insights/banner appear when backend sends AI meta; interactions do not 400 on batch |

---

## 9. Common issues

| Symptom | Likely cause | What to do |
|---------|----------------|------------|
| Mobile cannot reach API | Emulator vs device networking | Android emulator: `10.0.2.2:5000`; physical device: PC LAN IP + firewall rule for port 5000 |
| Backend AI logs timeout | Wrong `AI_SERVICE_URL` or AI not running | Local dev: `AI_SERVICE_URL=http://localhost:8000`; ensure uvicorn is on 8000 |
| Docker backend cannot reach AI | Using `localhost` inside container | Use `http://ai-service:8000` in backend `.env` for Compose |
| `/train` fails | Firebase env missing/wrong | Match `backend/.env` credentials in `ai-service/.env` |
| Batch interactions 400 | Wrong JSON key | Body must use `"items": [...]` |
| OpenAI errors / rate limits | Key missing or tier limits | Set `OPENAI_*` vars in `ai-service/.env`; see `embedding` section in `/model/status` |

---

## 11. Clean-slate reset workflow

Use this to remove all historical data and start real learning from zero.

### 11.1 Full system reset

Run from `backend/` with both servers **already running**:

```powershell
cd path\to\Wuloye-\backend

# Standard reset (writes happen)
npm run reset:system

# Dry-run preview (nothing is deleted — only prints what would happen)
DRY_RUN=true node scripts/reset-system.js
```

**What it does in order:**

1. Deletes every document in Firestore `interactions`
2. Deletes every document in Firestore `routines`
3. Clears `typeAffinity`, `seenPlaces`, `embedding` on every user profile (uid/email/name preserved)
4. Deletes `Firestore models/current` document
5. Deletes `backend/data/model.json`
6. Calls `POST http://localhost:8000/reset` on the AI service, wiping all Python model artefacts

**Expect to see:**

```
============================
 Wuloye System Reset
============================
[reset] Step 1: Wiping interactions collection …
[reset]   deleted N docs from interactions ...
...
[reset] Reset complete.
[reset] System is now in a clean cold-start state.
```

### 11.2 Reset AI service only (without touching Firestore)

```powershell
# Direct call on AI service (no auth required)
curl -X POST http://localhost:8000/reset
```

**Or via the backend API (requires admin token):**

```powershell
$TOKEN = "<admin Firebase ID token>"
curl -X POST http://localhost:5000/api/ai/reset -H "Authorization: Bearer $TOKEN"
```

**Expect:** JSON with `success: true`, list of `deleted_files`.

### 11.3 Manually trigger AI training

After >= 10 real interactions have been logged:

```powershell
# Direct call on AI service (no auth required)
curl -X POST http://localhost:8000/train

# Via backend (requires admin token)
curl -X POST http://localhost:5000/api/ai/train -H "Authorization: Bearer $TOKEN"
```

**Expect:** JSON with training results and updated `meta.ai`.

### 11.4 Check AI model status

```powershell
curl http://localhost:8000/model/status
# OR
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/ai/status
```

**Expect after reset:** `modelVersion: "v0"`, `lastTrainedAt: null`, `dataSize: 0`  
**Expect after training:** `modelVersion: "v1"`, `lastTrainedAt: <ISO timestamp>`, `dataSize > 0`

---

## 12. Validation scenarios

### Round 1 — Cold start (no interactions)

```powershell
curl -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/recommendations?debug=true&limit=5"
```

**Expect:**

- `interactionScore: 0` on every place
- `typeAffinityScore: 0` on every place  
- `modelScore: 0` on every place
- Scores are close to `popularityScore` baseline — no one type dominates

### Round 2 — Signal gym (save + click)

```powershell
# Save a gym
curl -X POST http://localhost:5000/api/interactions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"placeId\":\"place_1\",\"actionType\":\"save\"}"

# Click another gym
curl -X POST http://localhost:5000/api/interactions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"placeId\":\"place_2\",\"actionType\":\"click\"}"

# Dismiss a coffee shop
curl -X POST http://localhost:5000/api/interactions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"placeId\":\"place_7\",\"actionType\":\"dismiss\"}"
```

Then fetch recommendations again:

```powershell
curl -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/recommendations?debug=true&limit=5"
```

**Expect:**

- Gym places rank higher (`typeAffinityScore > 0`, `recentBoost > 0`)
- Coffee shop from dismiss either absent or ranked lower

### Round 3 — Repeat gym actions (accumulate >= 10 interactions)

Log 10+ interactions (mix of gym saves, clicks, views). Then trigger training:

```powershell
curl -X POST http://localhost:8000/train
```

Then fetch recommendations:

```powershell
curl -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/recommendations?debug=true&limit=5"
```

**Expect in `scoreBreakdown`:**

| Field | Before training | After training |
|---|---|---|
| `modelScore` | 0 | non-zero (positive for gym) |
| `typeAffinityScore` | increasing | continuing to grow |
| `recentBoost` | non-zero | non-zero |
| `embeddingScore` | 0 (cold) | > 0.5 for gym if OpenAI key set |

**Expect in `meta.ai`:**

- `pyModelActive: true`
- `predictedType: "gym"` (or similar based on your interactions)
- `confidence > 0`

### Round 4 — Behavior shift (switch to coffee)

Now dismiss all gym interactions and save coffee instead. After >= 5 coffee saves, fetch recommendations.

**Expect:**

- Coffee places rise to top 3
- Gym places ranked lower (affinity decayed by dismissals + new coffee signal)
- `predictedType` switches to `"coffee"`

---

## 13. Debug field reference

When calling `/api/recommendations?debug=true`, each place in `scoreBreakdown` includes:

| Field | Meaning |
|---|---|
| `interactionScore` | Recency-weighted sum of past interactions with this place |
| `typeAffinityScore` | Persistent per-type learning signal (scaled typeAffinity) |
| `sessionBoost` | Positive if current session type matches this place |
| `recentBoost` | Short-term memory: how often this type appeared recently |
| `embeddingScore` | Cosine similarity between user taste vector and place (0–1) |
| `modelScore` | AI microservice combined score (bandit + GRU + embedding) |
| `sequenceBoost` | GRU predicted next-step boost |
| `popularityScore` | Cold-start: raw place popularity weight |


From `backend/`, if present:

```powershell
.\test-recommendations.ps1
.\test-interactions.ps1
```

Adjust script variables (token, URLs) to match your machine. These are helpers — the curl flows above are the canonical checks.

---

## Summary command order (quick reference)

```text
1. ai-service:    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
2. backend:       npm run dev          # cwd: backend
3. mobile:        npx expo start       # cwd: mobile
4. Verify AI:     curl http://localhost:8000/api/health
5. Verify API:    curl http://localhost:5000/api/health
6. Verify flow:   curl -H "Authorization: Bearer <token>" "http://localhost:5000/api/recommendations?limit=5"
```

Once those succeed, exercise the **Home** screen on the device/emulator to validate the full intelligent recommendation loop.
