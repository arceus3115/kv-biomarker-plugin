# Project Status

Last updated: 2026-04-17

## Overall Status

- Phase: Local POC implemented (Node app + local DAM Python service).
- Current focus: Reliable local startup, response normalization, and basic validation guardrails.
- Remaining gap: End-to-end privacy hardening is partial because DAM inference still uses short-lived temp files.

## Current Functionality (Code Analysis)

### 1) Browser capture and submit flow

- `public/app.js` records microphone input with `MediaRecorder`.
- The UI enforces a minimum 30-second recording before analysis.
- Upload is sent as multipart form data to `POST /api/findings` with:
  - `audio`
  - `durationMs`

### 2) Node API behavior

- `src/appFactory.js` serves static UI and exposes:
  - `GET /health`
  - `POST /api/findings`
- `/api/findings`:
  - accepts only `audio/webm` and `audio/wav` variants,
  - enforces minimum duration from config,
  - stores uploads in memory (`multer.memoryStorage()`),
  - forwards audio to local model service,
  - returns normalized findings contract.
- Failures from the model service are translated to `502 local_inference_failed`.

### 3) Local model integration

- `src/localModelClient.js` calls the Python model service with timeout and abort handling.
- `src/normalizeFindings.js` maps raw model values to:
  - depression severity: `no_depression | mild_to_moderate | severe`
  - anxiety severity: `no_anxiety | mild | moderate | severe`
- Response contract includes vendor metadata:
  - provider `local_dam`
  - model `KintsugiHealth/dam`
  - quantization flag

### 4) Python service behavior

- `local_model_service/app.py` exposes:
  - `GET /health`
  - `POST /infer`
- `/infer` validates:
  - minimum `duration_ms >= 30000`
  - supported MIME type list (webm/wav family)
- Service writes request audio to a temp file, runs `Pipeline().run_on_file(...)`, then deletes the temp file immediately.

### 5) Test coverage currently in repo

- `test/findingsRoute.test.js` verifies:
  - successful normalized findings response,
  - rejection of short recordings,
  - rejection of unsupported MIME type.
- `test/normalizeFindings.test.js` verifies severity mapping and response shape.

## Startup Status

- Compose startup path exists and is health-gated.
- Local startup path exists for independent app/service development.
- Both services expose health endpoints and explicit ports.
- Startup documentation has been split into:
  - `readme.md` (quick start + architecture)
  - `version.md` (version + startup reference)

## Risks and Next Work

- True no-persistence guarantee is not yet fully achieved due to model file-path constraint.
- No authentication/authorization is implemented for API endpoints.
- No streaming/windowed real-time inference path yet; current UX is record-then-submit.
- Suggested next steps:
  1. Evaluate stream/in-memory compatible DAM inference path.
  2. Add Python endpoint tests and compose smoke tests.
  3. Harden runtime with `tmpfs` and stricter container FS controls.
