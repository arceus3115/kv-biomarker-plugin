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

## POC Implementation (Record Then Analyze)

This repository now includes a working proof of concept aligned to the validated hosted KV flow:

- Browser records a voice sample (`WEBM` or `WAV`)
- App backend receives the audio via multipart upload
- Backend calls KV `initiate`, `predict`, then polls `get result`
- Backend returns a normalized, app-owned findings payload

### Run The POC

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Set your KV credentials in `.env`:

- `KV_API_KEY`

4. Start the app:

```bash
npm start
```

5. Open `http://localhost:3000`, record at least 30 seconds of speech, then click **Analyze**.

### Findings Response Contract

The frontend consumes a normalized contract from `POST /api/findings`:

```json
{
  "sessionId": "session-abc",
  "status": "completed",
  "findings": {
    "depression": "mild_to_moderate",
    "anxiety": "moderate"
  },
  "vendor": {
    "modelCategory": "depression, anxiety",
    "modelGranularity": "severity",
    "isCalibrated": true
  },
  "error": null,
  "rawStatus": "completed"
}
```

KV-specific response fields stay backend-only except for the intentionally exposed `vendor` metadata object.

### POC Guardrails

- Audio is handled in memory only (`multer.memoryStorage()`), with no intentional disk persistence.
- Client enforces minimum duration before submit; backend enforces it again (`MIN_AUDIO_DURATION_MS`, default 30000).
- Accepted upload MIME types are constrained to `audio/webm` and `audio/wav` variants.
- The UI frames outputs as biomarker findings and not diagnosis.

### Hosted API Privacy Tradeoffs

This POC avoids local persistence on our side, but KV processing occurs through a hosted external API.
That means:

- Audio still leaves the browser and is transmitted to KV for inference.
- Final data handling guarantees ultimately depend on KV platform controls and contract terms.
- For stricter ownership/compliance boundaries, a future self-hosted path is still recommended.