export function isImagePath(pathLower) {
  return (
    pathLower.endsWith('.png') ||
    pathLower.endsWith('.jpg') ||
    pathLower.endsWith('.jpeg') ||
    pathLower.endsWith('.webp')
  );
}

export function buildOutputPath(inputPathLower) {
  const outRoot = process.env.DROPBOX_OUTPUT_PATH || '/OUTPUT';
  const suffix = process.env.OUTPUT_SUFFIX || '_ENHANCED';

  const baseName = inputPathLower.split('/').pop() || 'image';
  const dot = baseName.lastIndexOf('.');
  const name = dot >= 0 ? baseName.slice(0, dot) : baseName;
  const ext = process.env.OUTPUT_FORMAT || (dot >= 0 ? baseName.slice(dot + 1) : 'png');

  return `${outRoot}/${name}${suffix}.${ext}`.replaceAll('//', '/');
}