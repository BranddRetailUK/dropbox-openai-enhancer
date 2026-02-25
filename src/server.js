import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { processDropboxDelta } from './processor.js';
import { getDropboxClient } from './dropbox.js';

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
  if (!challenge) return res.status(400).send('Missing challenge');
  res.status(200).send(challenge);
});

// 2) Webhook events (POST) – verify signature then process delta
app.post('/dropbox/webhook', async (req, res) => {
  try {
    verifyDropboxSignature(req);
    // Respond quickly; do processing after ACK
    res.sendStatus(200);

    // Kick processing (delta cursor)
    await processDropboxDelta();
  } catch (err) {
    // Dropbox expects 2xx normally; but signature failures should be 401/403
    res.status(403).send('Forbidden');
  }
});

// Manual trigger (optional)
app.post('/run', express.json(), async (req, res) => {
  await processDropboxDelta();
  res.json({ ok: true });
});

// Healthcheck
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 3000, async () => {
  // Optional: validate tokens on boot
  const dbx = getDropboxClient();
  await dbx.usersGetCurrentAccount();
  console.log(`Server running on :${process.env.PORT || 3000}`);
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