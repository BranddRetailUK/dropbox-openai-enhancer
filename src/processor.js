import PQueue from 'p-queue';
import { getDropboxClient, listFolder, downloadFile, uploadFile } from './dropbox.js';
import { getCursor, setCursor } from './cursorStore.js';
import { isImagePath, buildOutputPath } from './utils.js';
import { editImageWithOpenAI } from './openaiEdit.js';

const queue = new PQueue({ concurrency: Number(process.env.CONCURRENCY || 4) });

export async function processDropboxDelta() {
  const dbx = getDropboxClient();

  const inputPath = process.env.DROPBOX_INPUT_PATH || '/INPUT';
  let cursor = getCursor();

  // First run: initial listFolder. Next runs: continue cursor.
  let page = await listFolder(dbx, inputPath, cursor);

  // Process current page + any continues
  while (true) {
    if (page.cursor) setCursor(page.cursor);

    const entries = page.entries || [];
    for (const e of entries) {
      // Only files
      if (e['.tag'] !== 'file') continue;

      const pathLower = e.path_lower;
      if (!pathLower) continue;

      // Must be under input folder and be an image
      if (!pathLower.startsWith((inputPath || '').toLowerCase())) continue;
      if (!isImagePath(pathLower)) continue;

      // Enqueue job
      queue.add(() => handleOne(dbx, pathLower)).catch(() => {});
    }

    if (page.has_more) {
      page = await listFolder(dbx, inputPath, getCursor());
      continue;
    }
    break;
  }

  await queue.onIdle();
}

async function handleOne(dbx, pathLower) {
  // 1) Download
  const inputBuf = await downloadFile(dbx, pathLower);

  // 2) Edit with OpenAI
  const filename = pathLower.split('/').pop() || 'input.png';
  const editedBuf = await editImageWithOpenAI(inputBuf, filename);

  // 3) Upload to OUTPUT
  const outPath = buildOutputPath(pathLower);
  await uploadFile(dbx, outPath, editedBuf);
}