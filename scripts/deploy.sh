#!/usr/bin/env bash
# Deploy Murmur to Cloud Run. The builder never runs this: the lead decides access and runs it.
# Usage: GEMINI_API_KEY=... ELEVENLABS_API_KEY=... scripts/deploy.sh      (without a key, Murmur runs on its demo voice)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi # keys come from the gitignored .env, never the command line
ENV_VARS="NODE_ENV=production,MURMUR_RATE_PER_MIN=${MURMUR_RATE_PER_MIN:-600}" # a venue shares one wifi IP, so 40/min per IP throttles judges
if [ -n "${GEMINI_API_KEY:-}" ]; then ENV_VARS="$ENV_VARS,GEMINI_API_KEY=$GEMINI_API_KEY"; fi
if [ -n "${ELEVENLABS_API_KEY:-}" ]; then ENV_VARS="$ENV_VARS,ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY"; fi
if [ -n "${GEMINI_MODEL:-}" ]; then ENV_VARS="$ENV_VARS,GEMINI_MODEL=$GEMINI_MODEL"; fi
if [ -n "${GEMINI_TTS_MODEL:-}" ]; then ENV_VARS="$ENV_VARS,GEMINI_TTS_MODEL=$GEMINI_TTS_MODEL"; fi
# shortcut: --max-instances 1 because lib/relay.js is in memory; move the ring to a shared store before scaling out.
# --allow-unauthenticated makes the link public so judges can open it on their phones; drop it to keep it private.
timeout 900 gcloud run deploy murmur --source . \
  --project hackathon-starter-ao --region europe-west1 \
  --allow-unauthenticated --set-env-vars "$ENV_VARS" --quiet \
  --max-instances 1 --timeout 3600 ${DEPLOY_FLAGS:-} # DEPLOY_FLAGS="--no-traffic --tag preview" for a preview URL; the Inside relay lives in one instance's memory, so phone and laptop must share it; SSE stays open an hour
