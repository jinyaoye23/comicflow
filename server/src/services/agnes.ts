import axios from 'axios';

const AGNES_BASE = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/';
const AGNES_KEY = process.env.AGNES_API_KEY || '';

export const client = axios.create({
  baseURL: AGNES_BASE,
  timeout: 300_000, // 视频 API 请求体大、服务端处理慢，需更长超时
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
  video_id?: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  video_url?: string;
  url?: string;
  remixed_from_video_id?: string; // 官方文档的字段名
  error?: string;
}

export interface CreateVideoResult {
  taskId: string;
  videoId: string;
}

/**
 * 压缩图片 base64 数据：缩小分辨率 + 转 JPEG，降低视频 API 请求体积
 * 目标：每张 < 150KB（base64），避免多图时超过 API body size 限制
 */
async function compressImageBase64(base64: string): Promise<string> {
  const { Jimp } = await import('jimp');
  const buf = Buffer.from(base64, 'base64');
  const img = await Jimp.read(buf);
  
  // 缩小到 384px 宽，更激进压缩（视频 API 对分辨率不敏感）
  if (img.width > 384) {
    img.resize({ w: 384 });
  }
  
  // JPEG quality 40 — 极限压缩，优先保证请求能发出去
  const jpgBuf = await img.getBuffer('image/jpeg', { quality: 40 });
  return jpgBuf.toString('base64');
}

/**
 * 提取原始 base64（去除 data:image 前缀或直接返回）
 */
function extractBase64(input: string): { base64: string; mime: string } {
  const match = input.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) return { base64: match[2], mime: match[1] };
  // 无前缀时默认当作 PNG base64
  return { base64: input, mime: 'image/png' };
}

/**
 * 创建视频生成任务（支持文生视频 + 图生视频）
 * 
 * 【文生视频】images 传空数组 []（不传 image 参数）
 * 【图生视频】images 传 1 个 data URL（已验证可用）
 * 【多图生视频】images 传多个 data URL（Agnes API 上暂不可用，全部超时）
 * 
 * @param images - 图片 data URL 数组（空数组 = 纯文生视频）
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
): Promise<CreateVideoResult> {
  const isTextToVideo = images.length === 0;

  const payload: any = {
    model: 'agnes-video-v2.0',
    prompt,
    width: options?.width ?? 768,
    height: options?.height ?? 1024,
    num_frames: options?.num_frames ?? 81,
    frame_rate: options?.frame_rate ?? 24,
  };

  if (isTextToVideo) {
    console.log(`📤 [v7] Text-to-video mode (no image)`);
  } else if (images.length === 1) {
    // 单图 → 顶层 image 字段（data URL）
    const { base64, mime } = extractBase64(images[0]);
    payload.image = `data:${mime};base64,${base64}`;
    console.log(`📤 [v7] Single image mode, MIME: ${mime}`);
  } else {
    // 多图（暂不可用，但保留逻辑）
    console.log(`📐 [v7] Compressing ${images.length} images for video...`);
    const dataUrls = await Promise.all(
      images.map(async (img) => {
        const { base64 } = extractBase64(img);
        const compressed = await compressImageBase64(base64);
        return `data:image/jpeg;base64,${compressed}`;
      })
    );
    payload.extra_body = { image: dataUrls };
    if (options?.mode) payload.extra_body.mode = options.mode;
  }

  const payloadStr = JSON.stringify(payload);
  const mode = isTextToVideo ? 'text-to-video' : `${images.length}-image`;
  console.log(`📤 [v7] Sending ${mode} request: ${(payloadStr.length / 1024).toFixed(0)} KB body`);

  const res = await client.post('/v1/videos', payload, {
    timeout: 600_000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const taskId = res.data?.id;
  const videoId = res.data?.video_id;
  if (!taskId) throw new Error('No task_id returned from video API');
  
  console.log(`✅ [v7] Video task created: taskId=${taskId}, videoId=${videoId}`);
  return { taskId, videoId: videoId || taskId };
}

/**
 * 轮询视频任务状态，直到完成或失败
 * 使用官方推荐的 video_id 查询接口
 */
export async function pollVideoTask(
  taskId: string,
  onProgress?: (status: VideoTaskStatus) => void,
  timeoutMs: number = 600_000 // 10 min — 视频生成很慢
): Promise<VideoTaskStatus> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: VideoTaskStatus | null = null;

  while (Date.now() < deadline) {
    // 使用官方推荐的 video_id 查询接口
    const res = await client.get(`/v1/videos/${taskId}`);
    const data = res.data as VideoTaskStatus;
    lastStatus = data;

    const status = data.status;
    if (onProgress) onProgress(data);

    if (status === 'completed') {
      // 提取视频 URL：官方字段 remixed_from_video_id，兼容 video_url / url
      console.log(`✅ [v5] Video completed: ${data.remixed_from_video_id || data.video_url || data.url}`);
      return data;
    }
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
  const { taskId } = await createVideoTask([imageDataUrl], prompt || 'smooth camera movement, cinematic');
  console.log(`🎬 [v5] Single-image video task: ${taskId}`);
  const result = await pollVideoTask(taskId, onProgress);
  const videoUrl = result.remixed_from_video_id || result.video_url || result.url || '';
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
  const { taskId } = await createVideoTask(imageDataUrls, prompt, {
    width: options?.width ?? 768,
    height: options?.height ?? 1024,
    num_frames: options?.num_frames ?? 121, // 多图用更长的视频
  });
  console.log(`🎬 [v5] Multi-image video task: ${taskId}`);
  const result = await pollVideoTask(taskId, onProgress);
  const videoUrl = result.remixed_from_video_id || result.video_url || result.url || '';
  if (!videoUrl) throw new Error('No video URL in completed task');
  return videoUrl;
}
