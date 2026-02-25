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

- `DROPBOX_ACCESS_TOKEN`
- `DROPBOX_APP_SECRET`
- `OPENAI_API_KEY`

Optional (recommended):

- `DROPBOX_INPUT_PATH` (default: `/INPUT`)
- `DROPBOX_OUTPUT_PATH` (default: `/OUTPUT`)
- `CONCURRENCY` (default: `4`)
- `OUTPUT_FORMAT` (default: `png`, used for output filename extension)
- `OUTPUT_SUFFIX` (default: `_ENHANCED`)

Notes:

- Do not set Dropbox paths to local machine paths like `/Volumes/...`; use Dropbox API paths such as `/INPUT`.
- Railway injects `PORT` automatically; app already reads `process.env.PORT`.
- After deploy, configure Dropbox webhook URL to: `https://<your-railway-domain>/dropbox/webhook`.
