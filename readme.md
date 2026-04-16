# Kintsugi Voice Biomarker Plugin  
**Real-Time, Privacy-First Voice Signal Inference**

---

## Overview

This project defines a **plug-and-play integration layer** that exposes Kintsugi Health’s open-source voice biomarker models (via Hugging Face) to any voice-enabled platform.

All processing is:
- Real-time  
- In-memory  
- Ephemeral  

Outputs are emitted immediately and never persisted.

---

## Core Objectives

### Primary
- Enable **real-time inference** of mental health-related voice signals  
- Provide **drop-in integration** with existing voice systems  
- Guarantee **zero storage** of raw audio or derived features  

### Secondary
- Support **hybrid deployment** (SaaS + self-hosted)  
- Provide **standardized APIs and SDKs**  
- Enable **extensible model abstraction**  

---

## Design Principles

- **Ephemerality by Design**  
  No disk writes. No replay. No persistence.

- **Streaming-First Architecture**  
  Sliding window inference over live audio streams.

- **Decoupled Integration Layer**  
  Works with WebRTC, Twilio, SIP, and mobile inputs.

- **Model Abstraction**  
  Hugging Face models wrapped behind stable interfaces.

- **Privacy as a Feature**  
  System is auditable for strict data minimization guarantees.

---

## System Architecture

### High-Level Flow

```
[Voice Source]
   ↓
[Adapter Layer]
   ↓
[Ephemeral Buffer + Preprocessing]
   ↓
[Inference Engine]
   ↓
[Event Emitter]
   ↓
[Client Application]
```

---

## Components

### 1. Adapter Layer

Normalizes incoming audio streams.

**Supported Inputs:**
- WebRTC (browser-based apps)  
- Twilio Media Streams (**priority for MVP**)  
- SIP systems  
- Mobile/desktop microphone input  

**Responsibilities:**
- Convert audio to **16kHz mono PCM**
- Handle codecs (Opus, μ-law, etc.)
- Maintain session state (non-persistent)

---

### 2. Ephemeral Audio Buffer

- Sliding window buffer (5–10 seconds)  
- Stored strictly in **RAM**  
- Continuously overwritten  

**Guarantees:**
- No disk writes  
- No retention  
- No replay capability  

---

### 3. Preprocessing Layer

- Resampling  
- Lightweight normalization  
- Feature extraction (if required by model)  

**Constraint:**
- Processing latency must remain **<100ms per chunk**

---

### 4. Inference Engine

Wraps Kintsugi Hugging Face models behind a stable interface.

```python
def infer(audio_window):
    return {
        "depression_score": float,
        "anxiety_score": float,
        "stress_index": float,
        "confidence": float,
        "timestamp": int
    }
```

**Execution Model:**
- Sliding window inference (every N seconds)
- Stateless across sessions (except transient buffer)

**Deployment:**
- CPU-first baseline  
- Optional GPU acceleration  

---

### 5. Event Emitter

Emits results in real time instead of storing them.

**Transport Options:**
- WebSockets  
- gRPC streaming  
- Webhooks (limited use for async systems)  

**Example Event:**

```json
{
  "session_id": "abc123",
  "timestamp": 1710000000,
  "signals": {
    "depression_score": 0.72,
    "anxiety_score": 0.64
  },
  "confidence": 0.81
}
```

> No historical retrieval endpoints exist by design.

---

### 6. SDK Layer

Developer-facing interface.

**Languages:**
- TypeScript (primary)  
- Python  

**Example Usage:**

```javascript
const client = new KintsugiPluginClient({
  stream: microphoneStream
});

client.on("signal", (data) => {
  console.log("Mental health signal:", data);
});
```

**Responsibilities:**
- Abstract streaming transport  
- Handle authentication  
- Provide typed interfaces  

---

## Deployment Model (Hybrid)

### Option 1: Hosted (SaaS)

- Managed inference service  
- Enforced guarantees:
  - No audio storage  
  - No payload logging  

**Best for:**
- Fast integration  
- Startups  

---

### Option 2: Self-Hosted

- Dockerized service  
- Runs in:
  - VPC  
  - On-prem infrastructure  
  - Edge environments  

**Benefits:**
- Full data control  
- Easier compliance (HIPAA, etc.)  

---

## Privacy Architecture

### Hard Guarantees

- No audio written to disk  
- Buffers cleared after each inference cycle  
- No training on user data  
- No persistent identifiers beyond session scope  

### Logging Policy

**Allowed:**
- Latency metrics  
- Error rates  

**Not Allowed:**
- Audio data  
- Feature vectors  
- User-identifiable outputs  

### Future Enhancements

- Container-level enforcement (disable filesystem writes)  
- Memory-only execution environments  
- Auditable runtime constraints  

---

## Integration Priority

### Tier 1 (MVP)
- Twilio Media Streams  
- WebRTC browser apps  

### Tier 2
- SIP-based enterprise systems  

### Tier 3
- Mobile SDKs (iOS / Android)  

---

## Key Risks

### Technical
- Hugging Face models may not support real-time streaming natively  
- Potential need for:
  - Quantization  
  - ONNX conversion  

- Latency constraints (<500ms end-to-end)  
- Audio variability (noise, codecs, accents)

### Product
- Misinterpretation as clinical diagnosis  
- Need for careful output framing  

### Regulatory
- HIPAA / GDPR considerations  
- Liability for mental health inference  

---

## Open Questions (Blocking)

### Model Constraints
- What is the **minimum audio length** required?  
- Are models:
  - Frame-level?  
  - Utterance-level only?  
- Can they support **streaming inference**?

### Privacy Enforcement
- Should guarantees be:
  - **Provable (system-level enforcement)**  
  - or best-effort engineering constraints?

### Deployment Strategy
- Prioritize:
  - Edge/local inference  
  - or cloud-first with self-host option?

### Output Semantics
- Emit:
  - Continuous scores  
  - Threshold-based alerts  
  - Both?

---

## Next Steps

1. Validate Hugging Face model constraints  
2. Build streaming-compatible inference wrapper  
3. Prototype Twilio Media Streams integration  
4. Enforce no-storage guarantees at runtime (container-level)  

> Do not proceed to full implementation until model input/output constraints are validated.

---

## POC Implementation (Local Open-Source DAM)

This repository now includes a local-first proof of concept using the open-source
`KintsugiHealth/dam` model instead of hosted API prediction endpoints.

### Architecture

- Browser records a voice sample (`WEBM` or `WAV`)
- Node backend receives the audio via multipart upload
- Node backend calls a local Python DAM inference service (`/infer`)
- Python service runs `Pipeline().run_on_file(...)` and returns depression/anxiety outputs
- Node backend normalizes the response into a stable app contract

### Run The POC

1. Install Node dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Start local DAM service (see `local_model_service/README.md`):

```bash
cd local_model_service
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

4. Start Node app:

```bash
npm start
```

5. Open `http://localhost:3000`, record at least 30 seconds of speech, then click **Analyze**.

### Run With Docker Compose

You can run both services (`app` + `local-model-service`) with one command.

1. Clone the DAM model repository on your host machine:

```bash
git clone https://huggingface.co/KintsugiHealth/dam ./dam-model
```

2. Start both services:

```bash
docker compose up
```

3. Open `http://localhost:3000`.

#### DAM repo mount configuration

The compose file mounts a host DAM repo path into the Python service at `/opt/dam`
and sets `PYTHONPATH=/opt/dam`.

- Default host path: `./dam-model`
- Override with `DAM_REPO_PATH` if your DAM clone is elsewhere:

```bash
DAM_REPO_PATH=/absolute/path/to/dam docker compose up
```

### Findings Response Contract

The frontend consumes a normalized contract from `POST /api/findings`:

```json
{
  "status": "completed",
  "findings": {
    "depression": {
      "score": 1,
      "severity": "mild_to_moderate"
    },
    "anxiety": {
      "score": 2,
      "severity": "moderate"
    }
  },
  "vendor": {
    "provider": "local_dam",
    "model": "KintsugiHealth/dam",
    "quantized": true
  },
  "error": null
}
```

### POC Guardrails

- Node receives audio in memory only (`multer.memoryStorage()`), with no persistent storage in Node.
- Client enforces minimum duration before submit; backend enforces it again (`MIN_AUDIO_DURATION_MS`, default 30000).
- Accepted upload MIME types are constrained to `audio/webm` and `audio/wav` variants.
- The UI frames outputs as biomarker findings and not diagnosis.

### Local Inference Data-Control Notes

- This removes hosted prediction dependencies and keeps inference execution under your infrastructure control.
- The current DAM reference pipeline requires file-path inference (`run_on_file`), so the Python service uses temporary files that are deleted immediately post-inference.
- For stronger guarantees, run the service on encrypted ephemeral storage or `tmpfs`.