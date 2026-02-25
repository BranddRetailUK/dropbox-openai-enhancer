import { Dropbox } from 'dropbox';

export function getDropboxClient() {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) throw new Error('Missing DROPBOX_ACCESS_TOKEN');
  return new Dropbox({ accessToken: token });
}

export async function downloadFile(dbx, pathLower) {
  const res = await dbx.filesDownload({ path: pathLower });
  // `fileBinary` in Node comes back as Buffer-ish; normalize:
  const data = res.result.fileBinary;
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export async function uploadFile(dbx, destPath, buffer) {
  await dbx.filesUpload({
    path: destPath,
    mode: { '.tag': 'overwrite' },
    autorename: false,
    mute: true,
    contents: buffer
  });
}

export async function listFolder(dbx, path, cursor = null) {
  if (!cursor) {
    const res = await dbx.filesListFolder({
      path,
      recursive: true,
      include_deleted: false,
      include_non_downloadable_files: false
    });
    return res.result;
  } else {
    const res = await dbx.filesListFolderContinue({ cursor });
    return res.result;
  }
}