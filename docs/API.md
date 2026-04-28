# Wuloye Backend API Reference

> Version: Phase 18 (Production-ready)  
> Base URL: `http://localhost:5000` (development) — set `PORT` env var for other environments.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Response Envelope](#response-envelope)
3. [Endpoints](#endpoints)
   - [Health](#health)
   - [Profile](#profile)
   - [Recommendations](#recommendations)
   - [Interactions](#interactions)
   - [Routines](#routines)
   - [Dev (non-production only)](#dev-non-production-only)
4. [Meta Fields Reference](#meta-fields-reference)
5. [Scoring Rules Overview (v4–v17)](#scoring-rules-overview-v4v17)
6. [Environment Variables Reference](#environment-variables-reference)

---

## Authentication

All protected routes require a valid **Firebase ID token** in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

Tokens are issued by Firebase Authentication (client SDK).  The backend verifies them with the Firebase Admin SDK (`auth.verifyIdToken`).  An invalid or missing token returns `401`.

---

## Response Envelope

All responses (success and error) use the same JSON envelope:

```json
{
  "success": true | false,
  "data":    <object | array | null>,
  "message": "<human-readable string>"
}
```

Error-only fields (dev mode):

```json
{
  "stack": "<stack trace — development only>"
}
```

---

## Endpoints

### Health

#### `GET /api/health`

Liveness + readiness check.  Performs a lightweight Firestore probe.

**Auth:** None

**Success — 200**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-04-02T09:00:00.000Z",
    "environment": "development",
    "dependencies": { "firestore": "connected" }
  },
  "message": "Service is healthy"
}
```

**Degraded — 503** (Firestore unreachable)
```json
{
  "success": false,
  "data": {
    "status": "degraded",
    "dependencies": { "firestore": "unreachable" }
  },
  "message": "Service is degraded — check dependencies"
}
```

---

#### `GET /api/health/metrics`

In-process performance counters.  Intended for ops/dev use.

**Auth:** None (consider protecting in production)

**Success — 200**
```json
{
  "success": true,
  "data": {
    "requestCount":  1240,
    "errorCount4xx": 12,
    "errorCount5xx": 0,
    "p50Ms":         42,
    "p95Ms":         198,
    "sampleCount":   1000
  },
  "message": "Metrics snapshot"
}
```

---

### Profile

#### `GET /api/profile`

Returns (or auto-creates) the authenticated user's profile.

**Auth:** Required

**Success — 200**
```json
{
  "success": true,
  "data": {
    "uid": "firebase-uid",
    "email": "user@example.com",
    "name": "Alice",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "interests": ["gym", "coffee"],
    "budgetRange": "medium",
    "locationPreference": "any",
    "typeAffinity": { "gym": 12.5, "coffee": 8.0 },
    "seenPlaces": ["place_1", "place_3"]
  },
  "message": "Profile fetched"
}
```

---

#### `PUT /api/profile`

Updates mutable profile fields.  System fields (`uid`, `email`, `createdAt`) are never overwritten.

**Auth:** Required

**Body (all optional):**
```json
{
  "name":               "Alice",
  "interests":          ["gym", "yoga"],
  "budgetRange":        "low | medium | high",
  "locationPreference": "indoor | outdoor | any"
}
```

**Success — 200** — returns the full updated profile in `data`.

**Errors:**
- `400` — validation failure (unknown field, bad enum value)
- `404` — user document does not exist

---

### Recommendations

#### `GET /api/recommendations`

Returns a personalised, ranked list of places for the authenticated user.

**Auth:** Required  
**Rate limit:** 60 req / 1 min per IP (authLimiter)

**Query parameters:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `lat`     | number | No       | User latitude — enables Google Maps live data (Phase 14) |
| `lng`     | number | No       | User longitude |
| `radius`  | number | No       | Search radius in **km** (default 5). Max 50. |
| `fast`    | boolean | No      | `true` skips embedding + model scoring (Phase 15 fast mode) |
| `debug`   | boolean | No      | `true` includes full `scoreBreakdown` per place (dev) |

**Success — 200**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "id": "place_1",
        "name": "Iron Gym",
        "type": "gym",
        "score": 38.4,
        "scoreBreakdown": { ... }
      }
    ],
    "context": {
      "timeOfDay": "morning",
      "isWeekend": false,
      "isLateNight": false
    },
    "meta": {
      "performance": {
        "elapsedMs": 54,
        "cacheHit": false,
        "fallbackActive": false,
        "heavyLoadFallback": false,
        "placesScored": 12
      },
      "experiment": {
        "active": true,
        "variantAssigned": "B",
        "experimentId": "rec_rank_v1"
      },
      "personalization": {
        "dominantHabits": ["morning_gym"],
        "topInterestWeights": { "gym": 0.6, "coffee": 0.4 }
      },
      "ai": {
        "modelVersion": "v3",
        "modelScore": 7.2,
        "isColdStart": false
      }
    }
  },
  "message": "Recommendations generated"
}
```

**Errors:**
- `400` — invalid `lat`/`lng` format
- `401` — missing/invalid auth token
- `429` — rate limit exceeded
- `500` — engine failure (returns fallback list when `RECOMMENDATION_FALLBACK_ENABLED=true`)

---

### Interactions

#### `POST /api/interactions`

Logs a single user interaction with a place.  Triggers real-time profile intelligence update and (asynchronously) model retraining.

**Auth:** Required  
**Rate limit:** 60 req / 1 min per IP

**Body:**
```json
{
  "placeId":    "place_1",
  "actionType": "view | click | save | dismiss"
}
```

**Success — 201**
```json
{
  "success": true,
  "data": {
    "id": "interaction-doc-id",
    "userId": "firebase-uid",
    "placeId": "place_1",
    "actionType": "save",
    "score": 3,
    "createdAt": "2026-04-02T09:00:00.000Z",
    "experimentId": "rec_rank_v1",
    "experimentVariant": "B"
  },
  "message": "Interaction logged"
}
```

**Errors:**
- `400` — missing `placeId` or invalid `actionType`
- `401` — unauthenticated

---

#### `POST /api/interactions/batch`

Logs multiple interactions in one request (Phase 15 batch processing).

**Auth:** Required  
**Rate limit:** 60 req / 1 min per IP

**Body:**
```json
{
  "interactions": [
    { "placeId": "place_1", "actionType": "click" },
    { "placeId": "place_2", "actionType": "dismiss" }
  ]
}
```

**Success — 201** — `data` is an array of created interaction documents.

---

#### `GET /api/interactions`

Returns the authenticated user's recent interactions (newest first, last 50).

**Auth:** Required  
**Rate limit:** 60 req / 1 min per IP

**Success — 200** — `data` is an array of interaction documents.

---

### Routines

#### `POST /api/routines`

Creates a new routine for the authenticated user.

**Auth:** Required  
**Rate limit:** 60 req / 1 min per IP

**Body:**
```json
{
  "weekday":            "monday | tuesday | ... | sunday",
  "timeOfDay":          "morning | afternoon | evening | night",
  "activityType":       "gym | coffee | yoga | ...",
  "locationPreference": "indoor | outdoor | any",
  "budgetRange":        "low | medium | high"
}
```

**Success — 201** — `data` is the created routine document.

---

#### `GET /api/routines`

Lists all routines owned by the authenticated user.

**Auth:** Required

**Success — 200** — `data` is an array of routine documents.

---

#### `GET /api/routines/:id`

Returns a single routine.

**Auth:** Required (owner only)

**Errors:** `404` not found, `403` not owner.

---

#### `PUT /api/routines/:id`

Updates mutable fields of a routine.

**Auth:** Required (owner only)

**Body:** same optional fields as `POST /api/routines`.

---

#### `DELETE /api/routines/:id`

Permanently deletes a routine.

**Auth:** Required (owner only)

**Success — 200**

---

### Dev (non-production only)

These routes are only active when `NODE_ENV !== "production"`.

#### `POST /api/dev/seed`

Seeds the Firestore `places` collection with the static seed catalogue (skips if already seeded).

**Auth:** None

---

#### `GET /api/dev/places`

Lists all places in Firestore.

**Auth:** None

---

#### `GET /api/dev/model`

Returns the current trained model metadata (version, weights, loss, etc.).

**Auth:** None

---

#### `GET /api/dev/experiment-metrics`

Returns aggregated A/B experiment metrics (CTR, save rate, dismiss rate per variant).

**Auth:** None

---

## Meta Fields Reference

The `meta` object in recommendation responses contains:

| Path | Type | Description |
|------|------|-------------|
| `meta.performance.elapsedMs` | number | Total time to produce response (ms) |
| `meta.performance.cacheHit` | boolean | Whether result was served from cache |
| `meta.performance.fallbackActive` | boolean | Whether fast-mode scoring was used |
| `meta.performance.heavyLoadFallback` | boolean | Whether auto fast-mode kicked in due to load |
| `meta.performance.placesScored` | number | Number of places scored |
| `meta.experiment.active` | boolean | Whether A/B experiment is running |
| `meta.experiment.variantAssigned` | "A" \| "B" | Variant assigned to this user |
| `meta.experiment.experimentId` | string | Experiment identifier |
| `meta.personalization.dominantHabits` | string[] | Detected recurring habits (e.g. `"morning_gym"`) |
| `meta.personalization.topInterestWeights` | object | Top interest types + weights |
| `meta.ai.modelVersion` | string | Current model version (e.g. `"v3"`) |
| `meta.ai.modelScore` | number | Predicted relevance from the gradient-descent model |
| `meta.ai.isColdStart` | boolean | True when the user has < 5 interactions |

---

## Scoring Rules Overview (v4–v17)

Each place receives a `rawScore` from the rule-based engine which is blended with the ML model score.  The rules applied (in order) are:

| Rule | Phase | Name | Description |
|------|-------|------|-------------|
| 1 | v4 | `interestMatch` | +5 for matching user interest tags |
| 2 | v4 | `budgetMatch` | +3 for matching budget preference |
| 3 | v4 | `locationMatch` | +3 for matching indoor/outdoor preference |
| 4 | v4 | `routineMatch` | +10 for matching an active routine slot |
| 5 | v5 | `recentInteractBoost` | +4 click / +3 save on recent interactions |
| 6 | v5 | `dismissPenalty` | -8 for dismissed places |
| 7 | v5 | `freshness` | Slight boost for places not seen recently |
| 8 | v6 | `affinityBoost` | +affinity * 0.1 per type from typeAffinity map |
| 9 | v7 | `intentMatch` | +6/+4/+2 for matching detectedIntent (fitness/social/relax) |
| 10 | v8 | `sessionBoost` | +4 for matching dominant session type |
| 11 | v8 | `sequenceBoost` | +3 for likely next step based on session sequence |
| 12 | v9 | `embeddingBoost` | cosine similarity × 10 between user + place embeddings |
| 13 | v10 | `trendBoost` | +3 for high-trend places |
| 14 | v10 | `openNowBoost` | +5 for places currently open |
| 15 | v11 | `coldStartBoost` | +6 for top-rated places during cold start |
| 16 | v12 | `modelBoost` | ML model predicted score (blended via weights) |
| 17 | v13 | `behaviourShift` | Adjusts long-term vs session weighting on detected shift |
| 18 | v14 | `ratingBoost` | +2 for high-rated places (≥ 4.5) |
| 19 | v15 | `explorationBoost` | Boosts variety during high-exploration mode |
| 20 | v16 | `habitBoost` | +5 for places matching detected time/day habits |
| 21 | v16 | `interestWeightBoost` | Weighted boost proportional to interest frequency/recency |
| 22 | v16 | `diversityFilter` | Caps same-type places to max 2 in top 5 |
| 23 | v17 | `experimentBlend` | Applies variant-specific rule/model blend weights |

**Final score** = `ruleBlendWeight × rawScore + modelBlendWeight × modelScore`

Variant A uses the default blend; Variant B uses configurable overrides (`EXPERIMENT_B_RULE_BLEND`, `EXPERIMENT_B_MODEL_BLEND`).

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment (`development` \| `production`) |
| `FIREBASE_PROJECT_ID` | — | Firebase project ID (required) |
| `FIREBASE_CLIENT_EMAIL` | — | Service account email (required) |
| `FIREBASE_PRIVATE_KEY` | — | Service account private key, `\n`-escaped (required) |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS allowed origins |
| `GOOGLE_MAPS_API_KEY` | — | Google Maps API key (Phase 14, optional) |
| `RECOMMENDATION_CACHE_TTL_MS` | `300000` | Recommendation cache TTL in ms (Phase 15) |
| `RECOMMENDATION_HIGH_LOAD_CONCURRENT` | `8` | Concurrent request threshold for auto fast-mode |
| `RECOMMENDATION_SCORE_CHUNK_SIZE` | `8` | Parallel scoring chunk size |
| `RECOMMENDATION_FALLBACK_ENABLED` | `false` | Return seed fallback instead of 500 on engine failure (Phase 18) |
| `EXPERIMENT_ACTIVE` | `false` | Enable A/B experiment (Phase 17) |
| `EXPERIMENT_B_PERCENT` | `50` | % of users assigned to Variant B |
| `EXPERIMENT_B_RULE_BLEND` | `0.6` | Rule blend weight for Variant B |
| `EXPERIMENT_B_MODEL_BLEND` | `0.4` | Model blend weight for Variant B |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Winston log level |
| `LOG_FILE` | `false` | Write logs to `logs/error.log` + `logs/combined.log` |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate-limit sliding window (ms) |
| `RATE_LIMIT_GLOBAL_MAX` | `300` | Max requests per IP per window (global) |
| `RATE_LIMIT_AUTH_MAX` | `60` | Max requests per IP per minute (authenticated routes) |
