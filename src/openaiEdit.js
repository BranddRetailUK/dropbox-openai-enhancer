import OpenAI from 'openai';

const PROMPT = `Enhance this image without changing any elements or composition. Increase contrast and colour saturation to create a clean HDR look while keeping blacks deep and rich. Remove all noise and grain, apply smooth professional denoising while preserving sharp logo edges and fabric detail. Add a subtle but noticeable outer vignette to darken the corners and draw focus toward the centre. Keep the image crisp, high-definition, vibrant, and cinematic. Do not alter positioning, lighting direction, or design elements — only enhance clarity, depth, and colour intensity.`;

export async function editImageWithOpenAI(inputBuffer, inputFilename = 'input.png') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const client = new OpenAI({ apiKey });

  // OpenAI Images Edit API expects multipart file
  const file = await toFileLike(inputBuffer, inputFilename);

  const res = await client.images.edit({
    model: 'gpt-image-1.5',
    image: file,
    prompt: PROMPT
  });

  // GPT image models usually return base64 by default
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned from OpenAI');

  return Buffer.from(b64, 'base64');
}

// Minimal “File-like” helper for openai node SDK
async function toFileLike(buffer, filename) {
  // openai SDK accepts Web File in some runtimes, but Buffer+filename works via { data, name }
  return { data: buffer, name: filename };
}
