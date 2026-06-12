import axios from 'axios';

const AGNES_BASE = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/';
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

  const res = await client.post('/v1/chat/completions', {
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
  const res = await client.post('/v1/images/generations', {
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

  const res = await client.post('/v1/images/generations', {
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

// ====== Video Generation (Agnes Video V2.0) ======

export interface VideoTaskStatus {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  video_url?: string;
  url?: string;
  error?: string;
}

/**
 * 压缩图片 base64 数据：缩小分辨率 + 转 JPEG，降低视频 API 请求体积
 * 目标：每张 < 150KB（base64），避免多图时超过 API body size 限制
 */
async function compressImageBase64(base64: string): Promise<string> {
  const { Jimp } = await import('jimp');
  const buf = Buffer.from(base64, 'base64');
  const img = await Jimp.read(buf);
  
  // 缩小到 512px 宽（视频输出是 768x1024，512 足够）
  if (img.width > 512) {
    img.resize({ w: 512 });
  }
  
  // 转 JPEG quality 60，大幅减小体积
  const jpgBuf = await img.getBuffer('image/jpeg', { quality: 60 });
  return jpgBuf.toString('base64');
}

/**
 * 创建视频生成任务（单图/多图均支持）
 * @param images - 图片 base64 数组（不含 data:image 前缀）
 * @param prompt - 视频描述（英文效果更好）
 * @param options - 可选参数
 */
export async function createVideoTask(
  images: string[],
  prompt: string,
  options?: {
    width?: number;
    height?: number;
    num_frames?: number;
    frame_rate?: number;
    mode?: 'ti2vid' | 'keyframes';
  }
): Promise<string> {
  const payload: any = {
    model: 'agnes-video-v2.0',
    prompt,
    width: options?.width ?? 768,
    height: options?.height ?? 1024,
    num_frames: options?.num_frames ?? 81, // 81 frames ≈ 3.4s @ 24fps
    frame_rate: options?.frame_rate ?? 24,
  };

  // 单图 → 顶层 image 字段；多图 → extra_body.image 数组
  if (images.length === 1) {
    payload.image = images[0];
  } else {
    // 多图时压缩每张图片，防止 body size 超标（API 约 5MB 上限）
    console.log(`📐 Compressing ${images.length} images for video...`);
    const compressed = await Promise.all(images.map((b64) => compressImageBase64(b64)));
    const totalKB = (compressed.reduce((s, c) => s + c.length, 0) / 1024).toFixed(0);
    console.log(`📐 Compressed: ${totalKB} KB total base64`);
    
    payload.extra_body = { image: compressed };
    if (options?.mode) payload.mode = options.mode;
  }

  const res = await client.post('/v1/videos', payload);
  const taskId = res.data?.id;
  if (!taskId) throw new Error('No task_id returned from video API');
  return taskId;
}

/**
 * 轮询视频任务状态，直到完成或失败
 */
export async function pollVideoTask(
  taskId: string,
  onProgress?: (status: VideoTaskStatus) => void,
  timeoutMs: number = 300_000 // 5 min
): Promise<VideoTaskStatus> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: VideoTaskStatus | null = null;

  while (Date.now() < deadline) {
    const res = await client.get(`/v1/videos/${taskId}`);
    const data = res.data as VideoTaskStatus;
    lastStatus = data;

    const status = data.status;
    if (onProgress) onProgress(data);

    if (status === 'completed') return data;
    if (status === 'failed') throw new Error(data.error || 'Video task failed');

    // queued / in_progress → 等待 8 秒后重试
    await new Promise((r) => setTimeout(r, 8000));
  }

  throw new Error(`Video task ${taskId} timed out after ${timeoutMs}ms`);
}

/**
 * 高级封装：单图生成视频（创建任务 + 轮询 + 返回视频 URL）
 */
export async function generateVideo(
  imageDataUrl: string,
  prompt?: string,
  onProgress?: (status: VideoTaskStatus) => void
): Promise<string> {
  const b64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const taskId = await createVideoTask([b64], prompt || 'smooth camera movement, cinematic');
  const result = await pollVideoTask(taskId, onProgress);
  const videoUrl = result.video_url || result.url || '';
  if (!videoUrl) throw new Error('No video URL in completed task');
  return videoUrl;
}

/**
 * 多图生成视频（多张分镜图 → 一段完整视频）
 * 这是 ComicFlow 的核心方法：直接把 N 张分镜图发给 Agnes，生成过渡视频
 */
export async function generateVideoFromImages(
  imageDataUrls: string[],
  prompt: string,
  onProgress?: (status: VideoTaskStatus) => void,
  options?: {
    width?: number;
    height?: number;
    num_frames?: number;
  }
): Promise<string> {
  const images = imageDataUrls.map((url) => url.replace(/^data:image\/\w+;base64,/, ''));
  const taskId = await createVideoTask(images, prompt, {
    width: options?.width ?? 768,
    height: options?.height ?? 1024,
    num_frames: options?.num_frames ?? 121, // 多图用更长的视频
  });
  console.log(`🎬 Video task created: ${taskId}`);
  const result = await pollVideoTask(taskId, onProgress);
  const videoUrl = result.video_url || result.url || '';
  if (!videoUrl) throw new Error('No video URL in completed task');
  return videoUrl;
}
