import OpenAI from 'openai';

const PROMPT = `Enhance this image without changing any elements or composition. Increase contrast and colour saturation to create a clean HDR look while keeping blacks deep and rich. Remove all noise and grain, apply smooth professional denoising while preserving sharp logo edges and fabric detail. Add a subtle but noticeable outer vignette to darken the corners and draw focus toward the centre. Keep the image crisp, high-definition, vibrant, and cinematic. Do not alter positioning, lighting direction, or design elements - only enhance clarity, depth, and colour intensity.`;

export async function editImageWithOpenAI(inputBuffer, inputFilename = 'input.png') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const endpoint = resolveImageEndpoint(process.env.OPENAI_IMAGE_ENDPOINT);
  const imageModel = resolveImageModel(process.env.OPENAI_IMAGE_MODEL);
  const outputFormat = resolveImageOutputFormat(process.env.OUTPUT_FORMAT);
  const client = new OpenAI({ apiKey });

  if (endpoint === 'generate') {
    return generateWithImagesAPI(client, imageModel, outputFormat);
  }

  return generateWithResponsesAPI(client, {
    inputBuffer,
    inputFilename,
    imageModel,
    outputFormat
  });
}

async function generateWithResponsesAPI(
  client,
  { inputBuffer, inputFilename, imageModel, outputFormat }
) {
  const responseModel = resolveResponsesModel(process.env.OPENAI_RESPONSES_MODEL);
  const quality = resolveImageQuality(process.env.OPENAI_IMAGE_QUALITY);
  const inputImageDataUrl = toDataUrl(inputBuffer, inputFilename);

  const response = await client.responses.create({
    model: responseModel,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: PROMPT },
          { type: 'input_image', image_url: inputImageDataUrl }
        ]
      }
    ],
    tools: [
      {
        type: 'image_generation',
        model: imageModel,
        output_format: outputFormat,
        quality
      }
    ]
  });

  const imageCall = (response.output || []).find(item => item.type === 'image_generation_call');
  const b64 = imageCall?.result;
  if (!b64) throw new Error('No image returned from Responses API');

  return {
    buffer: Buffer.from(b64, 'base64'),
    model: imageModel,
    endpoint: 'responses',
    responseModel
  };
}

async function generateWithImagesAPI(client, imageModel, outputFormat) {
  const result = await client.images.generate({
    model: imageModel,
    prompt: PROMPT,
    size: '1024x1024',
    output_format: outputFormat
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned from Images API');

  return {
    buffer: Buffer.from(b64, 'base64'),
    model: imageModel,
    endpoint: 'images.generate',
    responseModel: null
  };
}

function resolveImageEndpoint(rawEndpoint) {
  const normalized = String(rawEndpoint || 'responses').trim().toLowerCase();
  const allowed = new Set(['responses', 'generate']);
  if (!allowed.has(normalized)) {
    throw new Error(`Invalid OPENAI_IMAGE_ENDPOINT="${normalized}". Supported values: responses, generate.`);
  }
  return normalized;
}

function resolveImageModel(rawModel) {
  const normalized = String(rawModel || 'gpt-image-1.5').trim().toLowerCase();
  const allowed = new Set(['gpt-image-1.5', 'chatgpt-image-latest', 'gpt-image-1', 'gpt-image-1-mini']);
  if (!allowed.has(normalized)) {
    throw new Error(
      `Invalid OPENAI_IMAGE_MODEL="${normalized}". Supported values: gpt-image-1.5, chatgpt-image-latest, gpt-image-1, gpt-image-1-mini.`
    );
  }
  return normalized;
}

function resolveResponsesModel(rawModel) {
  const model = String(rawModel || 'gpt-5-mini').trim();
  if (!model) throw new Error('Invalid OPENAI_RESPONSES_MODEL');
  return model;
}

function resolveImageQuality(rawQuality) {
  const normalized = String(rawQuality || 'medium').trim().toLowerCase();
  const allowed = new Set(['auto', 'low', 'medium', 'high']);
  if (!allowed.has(normalized)) {
    throw new Error(`Invalid OPENAI_IMAGE_QUALITY="${normalized}". Supported values: auto, low, medium, high.`);
  }
  return normalized;
}

function resolveImageOutputFormat(rawFormat) {
  const normalized = String(rawFormat || 'png').trim().toLowerCase();
  const alias = normalized === 'jpg' ? 'jpeg' : normalized;
  const allowed = new Set(['png', 'jpeg', 'webp']);
  if (!allowed.has(alias)) {
    throw new Error(`Invalid OUTPUT_FORMAT="${normalized}". Supported values: png, jpeg, webp.`);
  }
  return alias;
}

function toDataUrl(buffer, filename) {
  const mimeType = guessMimeType(filename);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function guessMimeType(filename) {
  const normalized = String(filename || '').toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}
