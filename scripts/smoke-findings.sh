#!/usr/bin/env bash
# Generate a 32s mono WAV (no microphone) and POST it to POST /api/findings.
#
# Requires: curl, ffmpeg (unless KV_TEST_AUDIO points at an existing file).
#
# Env:
#   FINDINGS_URL   default http://127.0.0.1:3000/api/findings
#   KV_TEST_AUDIO  path to an existing wav/webm (>=30s logic in app); skips ffmpeg
#   KV_TMP_AUDIO   where to write generated wav (default: tempfile under /tmp)

set -euo pipefail

FINDINGS_URL="${FINDINGS_URL:-http://127.0.0.1:3000/api/findings}"
DURATION_MS="${DURATION_MS:-32000}"

GENERATED_AUDIO=""
audio_path=""
if [[ -n "${KV_TEST_AUDIO:-}" ]]; then
  audio_path="$KV_TEST_AUDIO"
  if [[ ! -f "$audio_path" ]]; then
    echo "KV_TEST_AUDIO file not found: $audio_path" >&2
    exit 1
  fi
else
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "Install ffmpeg, or set KV_TEST_AUDIO to a wav/webm file (>=30s for this POC)." >&2
    exit 1
  fi
  tmp="${KV_TMP_AUDIO:-}"
  if [[ -z "$tmp" ]]; then
    tmp="$(mktemp /tmp/kv-biomarker-smoke-XXXXXX.wav)"
  fi
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "sine=frequency=440:sample_rate=16000" \
    -t 32 -ac 1 -c:a pcm_s16le "$tmp"
  audio_path="$tmp"
  GENERATED_AUDIO="$tmp"
fi

cleanup() {
  if [[ -n "${GENERATED_AUDIO}" ]]; then
    rm -f "${GENERATED_AUDIO}"
  fi
}
trap cleanup EXIT

mime="audio/wav"
case "$(basename "$audio_path")" in
  *.webm) mime="audio/webm" ;;
esac

RESP_JSON="$(mktemp /tmp/kv-biomarker-smoke-response-XXXXXX.json)"

echo "POST $FINDINGS_URL ($mime, durationMs=$DURATION_MS)" >&2
code="$(
  curl -sS -o "${RESP_JSON}" -w "%{http_code}" \
    -X POST "$FINDINGS_URL" \
    -F "audio=@${audio_path};type=${mime}" \
    -F "durationMs=${DURATION_MS}"
)"

echo "HTTP $code" >&2
cat "${RESP_JSON}"
echo
rm -f "${RESP_JSON}"

[[ "$code" == 2* ]]
