import { Dropbox } from 'dropbox';

export function getDropboxClient() {
  const accessToken = readEnv('DROPBOX_ACCESS_TOKEN');
  const refreshToken = readEnv('DROPBOX_REFRESH_TOKEN');
  const appKey = readEnv('DROPBOX_APP_KEY');
  const appSecret = readEnv('DROPBOX_APP_SECRET');

  // Recommended for production: refresh-token auth so access tokens rotate automatically.
  if (refreshToken) {
    if (!appKey || !appSecret) {
      throw new Error(
        'Missing DROPBOX_APP_KEY or DROPBOX_APP_SECRET for refresh auth (required with DROPBOX_REFRESH_TOKEN)'
      );
    }

    return new Dropbox({
      refreshToken,
      clientId: appKey,
      clientSecret: appSecret
    });
  }

  if (!accessToken) {
    throw new Error(
      'Missing Dropbox auth: set DROPBOX_ACCESS_TOKEN or set DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET'
    );
  }

  return new Dropbox({ accessToken });
}

export function getDropboxAuthMode() {
  if (readEnv('DROPBOX_REFRESH_TOKEN')) return 'refresh_token';
  if (readEnv('DROPBOX_ACCESS_TOKEN')) return 'access_token';
  return 'none';
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

function readEnv(name) {
  const value = process.env[name];
  if (!value) return '';
  return String(value).trim();
}
