# API reference

The CutSense API is a small Express server (`server/`) that proxies the Meta Model API so that the API key never reaches the browser. In development, Vite proxies `/api` from `http://localhost:5173` to the API on `http://localhost:8787`.

- All bodies are JSON. The server accepts request bodies up to **12 MB**.
- Errors always have the shape `{ "code": string, "message": string }` with a meaningful HTTP status.
- Nothing is stored: every request is handled in memory and forgotten.

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `SAM_API_URL` | *(empty)* | Base URL of the Meta Model API, e.g. `https://api.meta.ai/v1`. A trailing `/v1` is completed to `/v1/responses` for segmentation. The chat routes use the same base (without `/responses`) plus `/chat/completions`. |
| `SAM_API_KEY` | *(empty)* | Bearer token for every upstream call. |
| `SAM_MODEL` | `sam-3.1` | Segmentation model. |
| `AGENT_MODEL` | `muse-spark-1.3` | Chat model for Hilo and the 3D preview. |
| `PORT` | `8787` | Listening port. |

The scripts load `.env` automatically when it exists (`--env-file-if-exists=.env`).

## Summary

| Method and path | Purpose | Timeout | Rate limit |
|---|---|---|---|
| `GET /api/health` | Feature flags and model ids | – | – |
| `POST /api/segment` | SAM 3.1 segmentation | 45 s | none (add one at your proxy) |
| `POST /api/agent` | One Hilo turn | 60 s | 20 / min per IP |
| `POST /api/assembly` | 3D assembly scene | 90 s | 30 / min per IP, shared by the three assembly routes |
| `POST /api/assembly/critique` | Review of a rendered scene | 90 s | shared |
| `POST /api/assembly/align` | Final geometric fix | 90 s | shared |

Rate limits are kept in memory, per server process, keyed by Express's `req.ip` over a sliding 60-second window. Behind a reverse proxy, set Express's `trust proxy` (otherwise every client shares the proxy's IP).

---

## `GET /api/health`

```json
{ "ok": true, "sam": true, "model": "sam-3.1", "agent": true, "agentModel": "muse-spark-1.3" }
```

`sam` is true when `SAM_API_URL` and `SAM_API_KEY` are set; `agent` is true when the chat base URL and the key are set (the 3D routes use the same condition).

---

## `POST /api/segment`

Segments the material (or defects) in a photo with SAM 3.1 through the Responses API (streamed, one-bit mask encoding).

### Request

```json
{
  "image": "data:image/jpeg;base64,...",
  "width": 1024,
  "height": 768,
  "concept": "brown shape",
  "points": [{ "x": 0.42, "y": 0.55, "label": 1 }, { "x": 0.05, "y": 0.05, "label": 0 }],
  "all": false
}
```

| Field | Rules |
|---|---|
| `image` | Required. Data URL of a PNG, JPEG or WebP image. The app sends a JPEG of at most 1024 px on the long side. |
| `width`, `height` | Required, > 0. Pixel size of `image`. |
| `concept` | Optional short noun phrase, default `"material"`, truncated to 80 characters. Ignored when `points` are given. |
| `points` | Optional guide points, normalized to 0..1, `label` 1 = include, 0 = exclude. Non-finite points are dropped; at most 16 are used. |
| `all` | Optional. `true` returns every mask (used for defect detection); otherwise only the largest. |

### Response `200`

Largest mask (default):

```json
{
  "crop": { "w": 612, "h": 430, "data": "<base64 of one byte per pixel, 0 or 1>" },
  "bounds": { "left": 140, "top": 96, "right": 752, "bottom": 526 },
  "confidence": 0.94,
  "candidates": 1,
  "model": "sam-3.1",
  "latencyMs": 2310
}
```

The raster covers only `bounds`; the client places it on a canvas of the sent image's size. With `"all": true`: `{ "masks": [{ crop, bounds, confidence, candidates }], "model", "latencyMs" }`, sorted by area (largest first), at most 20.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `BAD_IMAGE` | Missing or non-image data URL, or invalid dimensions |
| 422 | `SAM_EMPTY` | SAM found no object for the prompt (defect detection treats this as "nothing found") |
| 502 | `SAM_ERROR` | Upstream error or abnormal end of the stream |
| 503 | `SAM_NOT_CONFIGURED` | No `SAM_API_URL` / `SAM_API_KEY` |
| 504 | `SAM_TIMEOUT` | No answer within 45 s |

---

## `POST /api/agent`

One turn of the conversation with Hilo. The client keeps the whole conversation and sends it every time; the server is stateless. See [agent.md](agent.md) for the behaviour.

### Request

```json
{
  "messages": [
    { "role": "user", "content": "A wallet for six cards", "images": ["data:image/jpeg;base64,..."] },
    { "role": "assistant", "content": "{\"type\":\"question\",...}" },
    { "role": "user", "content": "About 10 × 9 cm closed" }
  ],
  "context": "Material available: about 30 x 22 cm (box), usable area approx. 540 cm2"
}
```

| Field | Rules |
|---|---|
| `messages` | 1–40 messages. `role` is `user` or `assistant`; `content` is a non-empty string of at most 4,000 characters; total at most 30,000 characters. The last message must be from the user. Assistant messages carry the previous turn as JSON. |
| `images` | Optional, user messages only, at most 1 per message and 3 per conversation. Each must be a base64 data URL of PNG, JPEG or WebP, at most 2,000,000 characters (about 1.5 MB). |
| `context` | Optional app data (for example the available material). Newlines are flattened, it is cut to 300 characters and passed to the model as data, not as an instruction. |

### Response `200`

```json
{
  "turn": {
    "type": "proposal",
    "message": "A **bifold wallet**: the outer folds in half ...",
    "quick_replies": ["Make it bigger", "Add a coin pocket"],
    "proposal": {
      "name": "Bifold wallet",
      "pieces": [
        { "name": "Outer", "kind": "rrect", "width_cm": 19, "height_cm": 9.5, "qty_per_set": 1, "rotations": [0, 180], "notes": "" }
      ],
      "assumptions": ["0.5 cm seam allowance included"]
    }
  },
  "model": "muse-spark-1.3"
}
```

`turn.type` is `question` (exactly one question mark in `message`, empty proposal), `proposal` (at least one piece and a name) or `redirect` (out-of-scope request, empty proposal). The turn has already passed `validateTurn` (see [agent.md](agent.md#schema-and-validation)).

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `AGENT_BAD_REQUEST` | Invalid history, message too long, too many sketches, invalid sketch, last message not from the user |
| 422 | `AGENT_REFUSED` | The model refused the request |
| 429 | `AGENT_RATE_LIMIT` | More than 20 turns in the last minute from this IP |
| 502 | `AGENT_UPSTREAM` | Network or HTTP error from the model service |
| 502 | `AGENT_BAD_OUTPUT` | The answer failed validation twice (one automatic retry with the error) |
| 503 | `AGENT_NOT_CONFIGURED` | No base URL or key |
| 504 | `AGENT_TIMEOUT` | No answer within 60 s |

---

## 3D assembly routes

Three routes back the 3D preview ([3d-preview.md](3d-preview.md)). They share a configuration check, the rate limiter (30 calls per minute per IP; one preview makes up to four calls) and a 90 s timeout per call. The model always answers with a scene in a closed JSON Schema; the server validates it against the real pieces before returning it.

### Common input

| Field | Rules |
|---|---|
| `productName` | Required, 1–120 characters. Control characters are stripped. |
| `pieces` | Required, 1–6 pieces in the agent's format: unique non-empty `name` (≤ 60), `kind` in `rect`, `rrect`, `circle`, `trapezoid`, `irregular`, `width_cm` and `height_cm` in 0.3–120, integer `qty_per_set` in 1–50. |
| `assumptions` | Optional, up to 10 strings of up to 300 characters. |

Every response also includes `model` and `latencyMs`, plus `warnings`: values the validator clamped or nodes it dropped.

### `POST /api/assembly`

Request: the common input. Response: `{ "scene": SceneSpec, "warnings": string[], "model", "latencyMs" }`.

### `POST /api/assembly/critique`

| Extra field | Rules |
|---|---|
| `scene` | Required. A scene that validates against `pieces`. It is expanded into explicit nodes before it is sent to the model. |
| `image` | Required. PNG, JPEG or WebP data URL, at most 1,600,000 characters (about 1.2 MB): four views of the assembled object. |
| `sanity` | Optional geometry report from the client checks, flattened to one line and cut to 3,000 characters. Passed as data. |
| `round` | Required integer, 1 or 2. |

Response: `{ "verdict": "ok" | "revise", "score": 1–10, "issues": string[≤5], "scene", "warnings", "model", "latencyMs" }`.

### `POST /api/assembly/align`

The final verification step: fixes the problems that the deterministic checks still measure.

| Extra field | Rules |
|---|---|
| `scene` | Required, as above. |
| `issues` | Required, 1–12 non-empty strings of up to 300 characters. |
| `sanity` | Optional, as above. |
| `image` | Optional (the step can run on the geometry report alone); same format and size limit as above. |

Response: `{ "changes": string[≤5], "scene", "warnings", "model", "latencyMs" }`.

### Scene validation

A scene must parse (types and enums; out-of-range numbers are clamped with a warning) and resolve against the pieces (macro expansion, known piece names, instances in range and used once, a single root, no cycles, at most 60 nodes). A scene that leaves more than half of the piece instances unplaced is rejected. A structurally invalid answer gets **one retry** with the error message; after that the route answers `ASSEMBLY_BAD_OUTPUT`.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `ASSEMBLY_BAD_REQUEST` | Invalid product name, pieces, scene, round or issues |
| 400 | `ASSEMBLY_BAD_IMAGE` | Image not a PNG/JPEG/WebP data URL, or too large |
| 422 | `ASSEMBLY_REFUSED` | The model refused |
| 429 | `ASSEMBLY_RATE_LIMIT` | More than 30 assembly calls in the last minute from this IP |
| 502 | `ASSEMBLY_UPSTREAM` | Network or HTTP error from the model service |
| 502 | `ASSEMBLY_BAD_OUTPUT` | The scene failed validation twice |
| 503 | `ASSEMBLY_NOT_CONFIGURED` | No base URL or key |
| 504 | `ASSEMBLY_TIMEOUT` | No answer within 90 s |

## Client-side timeouts

The browser adds its own limits on top of the server's: SAM requests abort after 60 s (and can be cancelled from the UI), and an in-flight Hilo or 3D request is aborted when its dialog closes.
