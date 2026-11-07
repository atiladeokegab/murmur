#!/usr/bin/env bash
# Deploy Murmur to Cloud Run. The builder never runs this: the lead decides access and runs it.
# Usage: GEMINI_API_KEY=... ELEVENLABS_API_KEY=... scripts/deploy.sh      (without a key, Murmur runs on its demo voice)
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_VARS="NODE_ENV=production"
if [ -n "${GEMINI_API_KEY:-}" ]; then ENV_VARS="$ENV_VARS,GEMINI_API_KEY=$GEMINI_API_KEY"; fi
if [ -n "${ELEVENLABS_API_KEY:-}" ]; then ENV_VARS="$ENV_VARS,ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY"; fi
if [ -n "${GEMINI_MODEL:-}" ]; then ENV_VARS="$ENV_VARS,GEMINI_MODEL=$GEMINI_MODEL"; fi
# --allow-unauthenticated makes the link public so judges can open it on their phones; drop it to keep it private.
timeout 900 gcloud run deploy murmur --source . \
  --project hackathon-starter-ao --region europe-west1 \
  --allow-unauthenticated --set-env-vars "$ENV_VARS" --quiet
