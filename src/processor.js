import PQueue from 'p-queue';
import { getDropboxClient, listFolder, downloadFile, uploadFile } from './dropbox.js';
import { getCursor, setCursor } from './cursorStore.js';
import { isImagePath, buildOutputPath } from './utils.js';
import { editImageWithOpenAI } from './openaiEdit.js';

const queue = new PQueue({ concurrency: Number(process.env.CONCURRENCY || 4) });

export async function processDropboxDelta(context = {}) {
  const reqId = context.reqId || 'n/a';
  const trigger = context.trigger || 'unknown';
  const startedAt = Date.now();

  const dbx = getDropboxClient();

  const inputPath = process.env.DROPBOX_INPUT_PATH || '/INPUT';
  const inputPathLower = (inputPath || '').toLowerCase();
  const cursor = getCursor();

  const stats = {
    pages: 0,
    entriesSeen: 0,
    scannedFiles: 0,
    skippedNonFile: 0,
    skippedMissingPath: 0,
    skippedOutsideInput: 0,
    skippedNonImage: 0,
    enqueuedJobs: 0,
    succeededJobs: 0,
    failedJobs: 0
  };

  console.log(
    `🔍 [processor] reqId=${reqId} trigger=${trigger} start inputPath=${inputPath} cursor=${cursor ? 'resume' : 'init'} concurrency=${queue.concurrency}`
  );

  // First run: initial listFolder. Next runs: continue cursor.
  let page = await listFolder(dbx, inputPath, cursor);
  const jobPromises = [];

  // Process current page + any continues
  while (true) {
    stats.pages += 1;
    if (page.cursor) setCursor(page.cursor);

    const entries = page.entries || [];
    stats.entriesSeen += entries.length;
    console.log(
      `📄 [processor] reqId=${reqId} page=${stats.pages} entries=${entries.length} hasMore=${Boolean(page.has_more)}`
    );

    for (const e of entries) {
      // Only files
      if (e['.tag'] !== 'file') {
        stats.skippedNonFile += 1;
        continue;
      }

      stats.scannedFiles += 1;

      const pathLower = e.path_lower;
      if (!pathLower) {
        stats.skippedMissingPath += 1;
        continue;
      }

      // Must be under input folder and be an image
      if (!isPathInsideInput(pathLower, inputPathLower)) {
        stats.skippedOutsideInput += 1;
        continue;
      }
      if (!isImagePath(pathLower)) {
        stats.skippedNonImage += 1;
        continue;
      }

      // Enqueue job
      stats.enqueuedJobs += 1;
      console.log(`📥 [queue] reqId=${reqId} queued path=${pathLower}`);

      const job = queue
        .add(() => handleOne(dbx, pathLower, reqId))
        .then(result => {
          stats.succeededJobs += 1;
          console.log(
            `✅ [job] reqId=${reqId} done path=${pathLower} out=${result.outPath} durationMs=${result.durationMs}`
          );
        })
        .catch(err => {
          stats.failedJobs += 1;
          console.error(`❌ [job] reqId=${reqId} failed path=${pathLower} error="${formatError(err)}"`);
        });

      jobPromises.push(job);
    }

    if (page.has_more) {
      page = await listFolder(dbx, inputPath, getCursor());
      continue;
    }
    break;
  }

  await Promise.all(jobPromises);

  const durationMs = Date.now() - startedAt;
  const skippedEntries =
    stats.skippedNonFile +
    stats.skippedMissingPath +
    stats.skippedOutsideInput +
    stats.skippedNonImage;

  const summary = {
    reqId,
    trigger,
    pages: stats.pages,
    entriesSeen: stats.entriesSeen,
    scannedFiles: stats.scannedFiles,
    enqueuedJobs: stats.enqueuedJobs,
    succeededJobs: stats.succeededJobs,
    failedJobs: stats.failedJobs,
    skippedEntries,
    durationMs
  };

  console.log(
    `📊 [processor] reqId=${reqId} trigger=${trigger} complete pages=${summary.pages} entries=${summary.entriesSeen} scanned=${summary.scannedFiles} enqueued=${summary.enqueuedJobs} ok=${summary.succeededJobs} failed=${summary.failedJobs} skipped=${summary.skippedEntries} durationMs=${summary.durationMs}`
  );

  return summary;
}

async function handleOne(dbx, pathLower, reqId) {
  const startedAt = Date.now();
  console.log(`🛠️ [job] reqId=${reqId} start path=${pathLower}`);

  // 1) Download
  const inputBuf = await downloadFile(dbx, pathLower);
  console.log(`⬇️ [job] reqId=${reqId} downloaded path=${pathLower} bytes=${inputBuf.length}`);

  // 2) Edit with OpenAI
  const filename = pathLower.split('/').pop() || 'input.png';
  const edited = await editImageWithOpenAI(inputBuf, filename);
  const editedBuf = edited.buffer;
  console.log(
    `🧠 [job] reqId=${reqId} enhanced path=${pathLower} model=${edited.model} endpoint=${edited.endpoint}${edited.responseModel ? ` responsesModel=${edited.responseModel}` : ''} bytes=${editedBuf.length}`
  );

  // 3) Upload to OUTPUT
  const outPath = buildOutputPath(pathLower);
  await uploadFile(dbx, outPath, editedBuf);
  console.log(`⬆️ [job] reqId=${reqId} uploaded out=${outPath} bytes=${editedBuf.length}`);

  return { outPath, durationMs: Date.now() - startedAt };
}

function isPathInsideInput(pathLower, inputPathLower) {
  if (pathLower === inputPathLower) return true;
  return pathLower.startsWith(`${inputPathLower}/`);
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
