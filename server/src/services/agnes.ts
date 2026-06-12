import axios from 'axios';

const AGNES_BASE = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';
const AGNES_KEY = process.env.AGNES_API_KEY || '';

const client = axios.create({
  baseURL: AGNES_BASE,
  timeout: 120_000,
  headers: {
    'Authorization': `Bearer ${AGNES_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ====== Chat Completion (脚本生成) ======
export async function chatCompletion(prompt: string, systemPrompt?: string) {
  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await client.post('/chat/completions', {
    model: 'agnes-2.0-flash',
    messages,
    temperature: 0.8,
    max_tokens: 4096,
  });

  return res.data.choices?.[0]?.message?.content || '';
}

// ====== Image Generation (角色参考图 + 分镜图) ======
export async function generateImage(prompt: string): Promise<string> {
  // Try text-to-image first
  const res = await client.post('/images/generations', {
    model: 'agnes-image-2.1-flash',
    prompt,
    n: 1,
    size: '768x1024',
  });

  const item = res.data?.data?.[0];
  if (!item) throw new Error('No image data returned');

  // b64_json first, then url -> convert to data URL
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;

  if (item.url) {
    try {
      const imgResp = await axios.get(item.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const base64 = Buffer.from(imgResp.data).toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch {
      return item.url; // fallback
    }
  }

  throw new Error('No image URL or base64 in response');
}

// ====== Image-to-Image (角色一致性，用到参考图) ======
export async function imgToImg(prompt: string, referenceDataUrl: string): Promise<string> {
  // Extract base64 from data URL
  const b64 = referenceDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const res = await client.post('/images/generations', {
    model: 'agnes-image-2.0-flash',
    prompt,
    n: 1,
    size: '768x1024',
    image: b64,
  });

  const item = res.data?.data?.[0];
  if (!item) throw new Error('No image data returned');

  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;

  if (item.url) {
    try {
      const imgResp = await axios.get(item.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const base64 = Buffer.from(imgResp.data).toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch {
      return item.url;
    }
  }

  throw new Error('No image URL or base64 in response');
}

// ====== Video Generation (视频片段) ======
export async function generateVideo(imageDataUrl: string, prompt?: string): Promise<string> {
  const b64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const res = await client.post('/video/generations', {
    model: 'agnes-video-2.0',
    image: b64,
    prompt: prompt || 'smooth camera movement, cinematic',
    duration: 4,
  });

  const item = res.data?.data?.[0];
  if (!item) throw new Error('No video data returned');

  return item.url || '';
}
