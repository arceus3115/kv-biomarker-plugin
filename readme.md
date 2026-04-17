# Kintsugi Voice Biomarker Plugin

Local-first proof of concept for voice biomarker inference using `KintsugiHealth/dam`.

## Quick Summary

- This project records browser audio, sends it to a Node API, and runs local DAM inference in a Python service.
- The app returns a normalized findings contract for depression and anxiety scores plus severity labels.
- Audio handling is designed to be ephemeral in Node memory; the Python layer currently uses short-lived temp files because the upstream DAM pipeline requires file-path input.
- For development/startup specifics and project progress tracking, see:
  - `version.md`
  - `status.md`

## Startup Steps

### Option A: Docker Compose (recommended)

1. Build and run both services:

```bash
docker compose up --build
```

2. Open `http://localhost:3000`.
3. Record at least 30 seconds of audio, then click **Analyze**.

OpenBLAS/OpenMP warning mitigation is preconfigured in the model image by setting:
`OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`, and
`NUMEXPR_NUM_THREADS=1`.

Optional model source overrides:

```bash
# pin a DAM ref
DAM_REPO_REF=<tag-or-branch-or-commit> docker compose up --build

# use a DAM fork
DAM_REPO_URL=https://huggingface.co/<org>/<repo> docker compose up --build
```

### Option B: Local Development (without Docker)

1. Install Node dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Prepare DAM Python environment:

```bash
mamba create -n dam python=3.11 -y
mamba run -n dam pip install -r dam/requirements.txt
```

4. Run local model service:

```bash
cd local_model_service
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

5. In another terminal, run the Node app:

```bash
npm start
```

6. Open `http://localhost:3000` and run a recording session.

## Architecture

```text
Browser Recorder (public/app.js)
  -> POST /api/findings (Node/Express)
  -> local model client (multipart call)
  -> POST /infer (FastAPI)
  -> DAM Pipeline().run_on_file(...)
  -> normalized findings response
```

Main components:

- `public/`: browser recording UI and submission flow.
- `src/appFactory.js`: API routes, upload validation, and error handling.
- `src/localModelClient.js`: outbound call to local Python service with timeout control.
- `src/normalizeFindings.js`: stable app response mapping and severity labels.
- `local_model_service/app.py`: DAM wrapper service with `/health` and `/infer`.
- `docker-compose.yml`: dual-service orchestration with health-gated startup.

## Future Steps

- Move from temp-file inference to true in-memory or stream-native model execution.
- Expand tests to cover Python service paths and containerized startup checks.
- Add stricter no-persistence runtime controls (`tmpfs`, read-only root FS, policy hardening).
- Validate streaming/windowed model behavior and latency against target SLOs.
