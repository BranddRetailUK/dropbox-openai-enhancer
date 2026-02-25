import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { processDropboxDelta } from './processor.js';
import { getDropboxClient, getDropboxAuthMode } from './dropbox.js';

const app = express();

// Dropbox webhook requires raw body for signature verification
app.use((req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => (data += chunk));
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

// 1) Verification handshake (GET) – Dropbox sends a challenge
app.get('/dropbox/webhook', (req, res) => {
  const challenge = req.query.challenge;
  if (!challenge) {
    console.warn('⚠️ [webhook] verification failed challenge missing');
    return res.status(400).send('Missing challenge');
  }
  console.log('🤝 [webhook] verification challenge received');
  res.status(200).send(challenge);
});

// 2) Webhook events (POST) – verify signature then process delta
app.post('/dropbox/webhook', (req, res) => {
  const reqId = buildRequestId();
  const accountsCount = extractAccountsCount(req.rawBody);
  const bodyBytes = (req.rawBody || '').length;

  console.log(`📬 [webhook] reqId=${reqId} event received accounts=${accountsCount} bodyBytes=${bodyBytes}`);

  try {
    verifyDropboxSignature(req);
  } catch (err) {
    console.error(`❌ [webhook] reqId=${reqId} signature rejected error="${formatError(err)}"`);
    res.status(403).send('Forbidden');
    return;
  }

  // Respond quickly; do processing after ACK
  res.sendStatus(200);
  console.log(`✅ [webhook] reqId=${reqId} signature accepted acknowledged=200`);

  // Kick processing (delta cursor)
  processDropboxDelta({ trigger: 'webhook', reqId })
    .then(summary => {
      console.log(`✅ [webhook] reqId=${reqId} processing complete scanned=${summary.scannedFiles} enqueued=${summary.enqueuedJobs} ok=${summary.succeededJobs} failed=${summary.failedJobs} durationMs=${summary.durationMs}`);
    })
    .catch(err => {
      console.error(`❌ [webhook] reqId=${reqId} processing failed error="${formatError(err)}"`);
    });
});

// Manual trigger (optional)
app.post('/run', express.json(), async (req, res) => {
  const reqId = buildRequestId();
  console.log(`▶️ [manual] reqId=${reqId} trigger received`);

  try {
    const summary = await processDropboxDelta({ trigger: 'manual', reqId });
    res.json({ ok: true, reqId, summary });
    console.log(`✅ [manual] reqId=${reqId} complete scanned=${summary.scannedFiles} enqueued=${summary.enqueuedJobs} ok=${summary.succeededJobs} failed=${summary.failedJobs} durationMs=${summary.durationMs}`);
  } catch (err) {
    console.error(`❌ [manual] reqId=${reqId} failed error="${formatError(err)}"`);
    res.status(500).json({ ok: false, reqId, error: 'Processing failed' });
  }
});

// Healthcheck
app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  try {
    // Optional: validate tokens on boot
    const dbx = getDropboxClient();
    const account = await dbx.usersGetCurrentAccount();
    const email = account?.result?.email || 'unknown';
    const authMode = getDropboxAuthMode();
    console.log(`🔐 [startup] connected dropboxAccount=${oneLine(email)}`);
    console.log(`🚀 [startup] server running port=${port} dropboxAuth=${authMode}`);
  } catch (err) {
    console.error(`❌ [startup] bootstrap failed error="${formatError(err)}"`);
    process.exit(1);
  }
});

function verifyDropboxSignature(req) {
  const appSecret = process.env.DROPBOX_APP_SECRET;
  if (!appSecret) throw new Error('Missing DROPBOX_APP_SECRET');

  const signature = req.headers['x-dropbox-signature'];
  if (!signature) throw new Error('Missing x-dropbox-signature');

  const computed = crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || '')
    .digest('hex');

  if (computed !== signature) throw new Error('Invalid webhook signature');
}

function buildRequestId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function extractAccountsCount(rawBody) {
  try {
    const payload = JSON.parse(rawBody || '{}');
    return payload?.list_folder?.accounts?.length ?? 0;
  } catch {
    return 'unknown';
  }
}

function formatError(err) {
  const details = extractDropboxErrorDetails(err);
  if (details) return details;
  if (err instanceof Error) return oneLine(`${err.name}: ${err.message}`);
  return oneLine(String(err));
}

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function extractDropboxErrorDetails(err) {
  if (!err || typeof err !== 'object') return '';

  const status = err?.status || err?.response?.status;
  const name = err?.name ? String(err.name) : 'DropboxError';
  const message = err?.message ? oneLine(err.message) : '';
  const summary = readFirstString([
    err?.error?.error_summary,
    err?.error?.error?.error_summary,
    err?.error?.reason?.error_summary,
    err?.response?.result?.error_summary
  ]);
  const tag = readFirstString([
    err?.error?.['.tag'],
    err?.error?.error?.['.tag'],
    err?.error?.reason?.['.tag'],
    err?.response?.result?.error?.['.tag']
  ]);

  if (!status && !summary && !tag && !String(name).includes('Dropbox')) return '';

  return oneLine(
    `${name}: ${message}${status ? ` status=${status}` : ''}${summary ? ` summary=${summary}` : ''}${tag ? ` tag=${tag}` : ''}`
  );
}

function readFirstString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return oneLine(candidate);
  }
  return '';
}
