# Local DAM Service

This service wraps the open-source `KintsugiHealth/dam` model for local inference.

## 1) Prepare DAM environment

Follow the model card setup:

1. Clone the model repo:
   - `git clone https://huggingface.co/KintsugiHealth/dam`
2. Create the model environment:
   - `mamba env create -n dam -f requirements.txt -c conda-forge -c pytorch -c nvidia`
   - `mamba activate dam`
3. Install service dependencies:
   - `pip install -r /path/to/kv-biomarker-plugin/local_model_service/requirements.txt`

The service expects `pipeline.py` from the DAM repo to be importable in the active Python path.
The simplest approach is to run this service from inside the DAM repo, or add that repo to `PYTHONPATH`.

## 2) Run

```bash
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

## 3) Endpoints

- `GET /health`
- `POST /jobs` (async inference job)
  - multipart form:
    - `audio` (webm/wav)
    - `duration_ms` (integer)
    - `quantize` (true/false)
- `GET /jobs/{job_id}` (poll job milestones and result)
- `POST /infer`
  - multipart form:
    - `audio` (webm/wav)
    - `duration_ms` (integer)
    - `quantize` (true/false)
