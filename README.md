# Dropbox OpenAI Enhancer

Express webhook service that listens for Dropbox changes, enhances image files with OpenAI, and writes results back to Dropbox.

## Run locally

```bash
npm install
npm start
```

Service endpoints:

- `GET /health`
- `GET /dropbox/webhook` (Dropbox challenge)
- `POST /dropbox/webhook` (Dropbox event callback)
- `POST /run` (manual trigger)

## Railway deployment

This repo includes `railway.toml` with:

- start command: `npm start`
- healthcheck path: `/health`

### Environment variables to set in Railway

Required:

- `DROPBOX_APP_SECRET`
- `OPENAI_API_KEY`

Dropbox auth (choose one):

- Mode A: `DROPBOX_ACCESS_TOKEN`
- Mode B (recommended on Railway): `DROPBOX_APP_KEY` + `DROPBOX_REFRESH_TOKEN`

Optional (recommended):

- `DROPBOX_INPUT_PATH` (default: `/INPUT`)
- `DROPBOX_OUTPUT_PATH` (default: `/OUTPUT`)
- `OPENAI_IMAGE_ENDPOINT` (default: `responses`; alternative: `generate`)
- `OPENAI_IMAGE_MODEL` (default: `gpt-image-1.5`; alias option: `chatgpt-image-latest`)
- `OPENAI_RESPONSES_MODEL` (default: `gpt-5-mini`, used when endpoint is `responses`)
- `OPENAI_IMAGE_QUALITY` (default: `medium`)
- `CONCURRENCY` (default: `4`)
- `OUTPUT_FORMAT` (default: `png`, used for output filename extension)
- `OUTPUT_SUFFIX` (default: `_ENHANCED`)

Notes:

- Do not set Dropbox paths to local machine paths like `/Volumes/...`; use Dropbox API paths such as `/INPUT`.
- `DROPBOX_APP_SECRET` is used for webhook signature verification and refresh-token auth client secret.
- The enhancer now uses Responses API image generation by default (not `images.edit`).
- Railway injects `PORT` automatically; app already reads `process.env.PORT`.
- After deploy, configure Dropbox webhook URL to: `https://<your-railway-domain>/dropbox/webhook`.
