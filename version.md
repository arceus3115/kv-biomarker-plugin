# Version and Startup Reference

Last updated: 2026-04-16

## Project Version Snapshot

- Application package version: `1.0.0` (`package.json`)
- Node runtime base image: `node:20-bookworm-slim` (`Dockerfile.app`)
- Local model image base: `mambaorg/micromamba:1.5.8` (`local_model_service/Dockerfile`)
- DAM model source default:
  - `DAM_REPO_URL=https://huggingface.co/KintsugiHealth/dam`
  - `DAM_REPO_REF=main`

## Development Startup Baseline

### Local development

1. `npm install`
2. `cp .env.example .env`
3. `mamba create -n dam python=3.11 -y`
4. `mamba run -n dam pip install -r dam/requirements.txt`
5. Run model service:
   - `cd local_model_service`
   - `uvicorn app:app --host 127.0.0.1 --port 8001 --reload`
6. Run app service:
   - `npm start`
7. Open `http://localhost:3000`

### Docker Compose development

1. `docker compose up --build`
2. Open `http://localhost:3000`

Compose startup behavior:

- `local-model-service` must become healthy before `app` starts (`depends_on` with `condition: service_healthy`).
- App health endpoint: `GET /health` on port `3000`.
- Model service health endpoint: `GET /health` on port `8001`.

## Runtime Configuration Reference

From `.env.example` and compose:

- `PORT=3000`
- `LOCAL_MODEL_SERVICE_URL=http://127.0.0.1:8001` (local) / `http://local-model-service:8001` (compose)
- `LOCAL_MODEL_INFER_PATH=/infer`
- `LOCAL_MODEL_TIMEOUT_MS=120000`
- `LOCAL_MODEL_QUANTIZE=true`
- `MAX_UPLOAD_BYTES=10485760`
- `MIN_AUDIO_DURATION_MS=30000`

## Known Version Notes

- The DAM pipeline integration currently relies on `Pipeline().run_on_file(...)`, which requires a temporary file path.
- `local_model_service/Dockerfile` overlays a patched DAM `pipeline.py` from this repo to avoid checkpoint-loading issues referenced in project comments.
