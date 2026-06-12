import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import prisma from '../lib/prisma';
import { chatCompletion } from '../services/agnes';
import fs from 'fs';
import path from 'path';

const router = Router();

// ====== 系统 Prompt: 漫画脚本生成 ======
const SCRIPT_SYSTEM_PROMPT = `你是一个专业的漫画脚本作家。根据用户的创意想法，生成结构化的漫画脚本。

必须严格返回以下 JSON 格式（不要包含任何 markdown 标记，直接返回纯 JSON）：

{
  "title": "漫画标题",
  "genre": "类型",
  "style": "风格",
  "characters": [
    { "name": "角色名", "role": "主角/配角/反派", "appearance": "详细外貌描述（100字以上，包含发型、脸型、眼型、体型、服装）", "personality": "性格特点" }
  ],
  "panels": [
    { "index": 0, "scene": "场景环境描述", "action": "角色动作描述", "dialogue": "台词（无台词用空字符串）", "camera": "远景/中景/特写/全景" }
  ]
}

要求：
1. characters 至少 1 个，最多 4 个。appearance 必须非常详细（发型颜色、脸型、眼型、体型、服装风格），这是保证后续漫画人物一致性的关键。
2. panels 推荐 4~6 格，包含完整的起承转合叙事结构。
3. dialogue 用中文双引号包裹，不要用其他格式。
4. 风格参考：日系少年漫 / 日系少女漫 / 美漫 / 水墨风 / 赛博朋克 / 萌系。`;

// ====== GET /api/projects — 列出所有项目 ======
router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      include: { characters: true, panels: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(projects);
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// ====== POST /api/projects — 创建项目 ======
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, genre, style } = req.body;
    const devUser = await prisma.user.findFirst({ where: { email: 'dev@comicflow.local' } });
    if (!devUser) return res.status(500).json({ error: 'Dev user not found. Run seed first.' });

    const project = await prisma.project.create({
      data: {
        id: uuid(),
        userId: devUser.id,
        title: title || '未命名项目',
        genre: genre || null,
        style: style || '日系少年',
        status: 'DRAFT',
      },
    });
    res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// ====== GET /api/projects/:id — 获取项目详情 ======
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        characters: { orderBy: { name: 'asc' } },
        panels: { orderBy: { index: 'asc' } },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// ====== DELETE /api/projects/:id — 删除项目 ======
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ====== POST /api/projects/:id/script/generate — AI 生成脚本 ======
router.post('/:id/script/generate', async (req: Request, res: Response) => {
  try {
    const { idea } = req.body;
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const userPrompt = `创作一部漫画。风格：${project.style || '通用'}。类型：${project.genre || '通用'}。创意：${idea || '自由发挥'}`;

    const raw = await chatCompletion(userPrompt, SCRIPT_SYSTEM_PROMPT);

    // Parse JSON from response (strip any markdown code fences)
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    }

    const script = JSON.parse(clean);

    // Save script + original idea to project
    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        idea: idea || project.idea,  // 保存用户原始创意，覆盖或保留
        script: JSON.stringify(script),
        genre: script.genre || project.genre,
        style: script.style || project.style,
      },
    });

    // Upsert characters from script
    if (script.characters && Array.isArray(script.characters)) {
      for (const ch of script.characters) {
        await prisma.character.upsert({
          where: { projectId_name: { projectId: req.params.id, name: ch.name } },
          update: { description: `${ch.appearance || ''}。${ch.personality || ''}` },
          create: {
            id: uuid(),
            projectId: req.params.id,
            name: ch.name,
            description: `${ch.appearance || ''}。${ch.personality || ''}`,
          },
        });
      }
    }

    // Upsert panels from script
    if (script.panels && Array.isArray(script.panels)) {
      // Delete existing panels first
      await prisma.panel.deleteMany({ where: { projectId: req.params.id } });

      for (const p of script.panels) {
        await prisma.panel.create({
          data: {
            id: uuid(),
            projectId: req.params.id,
            index: p.index,
            scene: p.scene || '',
            action: p.action || '',
            dialogue: p.dialogue || '',
            camera: p.camera || '中景',
          },
        });
      }
    }

    res.json({ script, projectId: req.params.id });
  } catch (err: any) {
    console.error('Script generation error:', err);
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'AI 返回了无效的 JSON，请重试', raw: err.message });
    }
    res.status(500).json({ error: 'Script generation failed', message: err.message });
  }
});

// ====== PUT /api/projects/:id/script — 更新脚本 ======
router.put('/:id/script', async (req: Request, res: Response) => {
  try {
    const { script } = req.body;
    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { script: typeof script === 'string' ? script : JSON.stringify(script) },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update script error:', err);
    res.status(500).json({ error: 'Failed to update script' });
  }
});

// ====== POST /api/projects/:id/characters/:charId/generate — 生成角色图 ======
router.post('/:id/characters/:charId/generate', async (req: Request, res: Response) => {
  try {
    const character = await prisma.character.findFirst({
      where: { id: req.params.charId, projectId: req.params.id },
    });
    if (!character) return res.status(404).json({ error: 'Character not found' });

    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    const prompt = `Character reference sheet, full body, front view. Style: ${project?.style || 'anime'}. ${character.description}. Clean lines, white background, professional character design sheet.`;

    const { generateImage } = await import('../services/agnes');
    const dataUrl = await generateImage(prompt);

    // Save to local disk
    const uploadsDir = path.resolve(__dirname, '../../uploads/characters');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName = `${character.id}.png`;
    const filePath = path.join(uploadsDir, fileName);
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const imagePath = `/uploads/characters/${fileName}`;

    const updated = await prisma.character.update({
      where: { id: req.params.charId },
      data: { imagePath },
    });

    res.json(updated);
  } catch (err: any) {
    console.error('Generate character image error:', err);
    res.status(500).json({ error: 'Character image generation failed', message: err.message });
  }
});

// ====== PUT /api/projects/:id/characters/:charId — 更新角色 ======
router.put('/:id/characters/:charId', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const updated = await prisma.character.update({
      where: { id: req.params.charId },
      data: { name, description },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update character error:', err);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

// ====== DELETE /api/projects/:id/characters/:charId — 删除角色 ======
router.delete('/:id/characters/:charId', async (req: Request, res: Response) => {
  try {
    await prisma.character.delete({ where: { id: req.params.charId } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete character error:', err);
    res.status(500).json({ error: 'Failed to delete character' });
  }
});

// ====== POST /api/projects/:id/panels/generate — 批量生成分镜 ======
router.post('/:id/panels/generate', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { panels: { orderBy: { index: 'asc' } }, characters: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'GENERATING' },
    });

    const { generateImage, imgToImg } = await import('../services/agnes');
    const uploadsDir = path.resolve(__dirname, '../../uploads/panels');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const results = [];

    for (const panel of project.panels) {
      try {
        // Build prompt
        let basePrompt = `Manga panel. Style: ${project.style || 'anime'}. Scene: ${panel.scene || ''}. Action: ${panel.action || ''}.`;
        if (panel.camera) basePrompt += ` Camera: ${panel.camera}.`;

        // Character consistency constraints
        let charIds: string[] = [];
        try { charIds = panel.charIds ? JSON.parse(panel.charIds) : []; } catch {}

        const boundChars = charIds
          .map((cid: string) => project.characters.find((c: { id: string; name: string; description: string; imagePath?: string | null }) => c.id === cid))
          .filter(Boolean);

        if (boundChars.length > 0) {
          const charDescs = boundChars.map((c: any) => `[${c.name}: ${c.description}]`).join(', ');
          basePrompt += ` CRITICAL: Characters must match these descriptions consistently: ${charDescs}. Maintain exact appearance.`;
        }

        // Choose generation mode
        const firstWithImage = boundChars.find((c: any) => c.imagePath);
        let dataUrl: string;

        if (firstWithImage) {
          // Image-to-Image with character reference
          const imgPath = path.resolve(__dirname, '..', '..', firstWithImage.imagePath!.replace(/^\//, ''));
          const refB64 = fs.readFileSync(imgPath, 'base64');
          dataUrl = await imgToImg(basePrompt, `data:image/png;base64,${refB64}`);
        } else {
          // Pure text-to-image
          dataUrl = await generateImage(basePrompt);
        }

        // Save to disk
        const fileName = `${panel.id}.png`;
        const filePath = path.join(uploadsDir, fileName);
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        const imagePath = `/uploads/panels/${fileName}`;

        const updated = await prisma.panel.update({
          where: { id: panel.id },
          data: { imagePath, prompt: basePrompt },
        });

        results.push(updated);
      } catch (panelErr: any) {
        const msg = panelErr.response?.data?.error || panelErr.message;
        console.error(`❌ Panel ${panel.index} generation failed:`, msg);
        // Include full error details so frontend can display them
        results.push({ ...panel, imagePath: null, error: msg, failed: true });
      }
    }

    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' },
    });

    res.json({ panels: results });
  } catch (err: any) {
    console.error('Panels generation error:', err);
    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'FAILED' },
    });
    res.status(500).json({ error: 'Panels generation failed', message: err.message });
  }
});

// ====== POST /api/projects/:id/panels/:panelId/retry — 重新生成某格 ======
router.post('/:id/panels/:panelId/retry', async (req: Request, res: Response) => {
  try {
    const panel = await prisma.panel.findFirst({
      where: { id: req.params.panelId, projectId: req.params.id },
    });
    if (!panel) return res.status(404).json({ error: 'Panel not found' });

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { characters: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let basePrompt = `Manga panel. Style: ${project.style || 'anime'}. Scene: ${panel.scene || ''}. Action: ${panel.action || ''}.`;
    if (panel.camera) basePrompt += ` Camera: ${panel.camera}.`;

    let charIds: string[] = [];
    try { charIds = panel.charIds ? JSON.parse(panel.charIds) : []; } catch {}

    const boundChars = charIds
      .map((cid: string) => project.characters.find((c) => c.id === cid))
      .filter(Boolean);

    if (boundChars.length > 0) {
      const charDescs = boundChars.map((c: any) => `[${c.name}: ${c.description}]`).join(', ');
      basePrompt += ` CRITICAL: Characters must match: ${charDescs}. Maintain exact appearance.`;
    }

    const firstWithImage = boundChars.find((c: any) => c.imagePath);
    let dataUrl: string;

    const { generateImage, imgToImg } = await import('../services/agnes');

    if (firstWithImage) {
      const imgPath = path.resolve(__dirname, '..', '..', firstWithImage.imagePath!.replace(/^\//, ''));
      const refB64 = fs.readFileSync(imgPath, 'base64');
      dataUrl = await imgToImg(basePrompt, `data:image/png;base64,${refB64}`);
    } else {
      dataUrl = await generateImage(basePrompt);
    }

    const uploadsDir = path.resolve(__dirname, '../../uploads/panels');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName = `${panel.id}.png`;
    const filePath = path.join(uploadsDir, fileName);
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const imagePath = `/uploads/panels/${fileName}`;

    const updated = await prisma.panel.update({
      where: { id: panel.id },
      data: { imagePath, prompt: basePrompt },
    });

    res.json(updated);
  } catch (err: any) {
    console.error('Panel retry error:', err);
    res.status(500).json({ error: 'Panel regeneration failed', message: err.message });
  }
});

// ====== PUT /api/projects/:id/panels/:panelId — 更新分镜信息 ======
router.put('/:id/panels/:panelId', async (req: Request, res: Response) => {
  try {
    const { scene, action, dialogue, camera, charIds } = req.body;
    const updated = await prisma.panel.update({
      where: { id: req.params.panelId },
      data: {
        ...(scene !== undefined && { scene }),
        ...(action !== undefined && { action }),
        ...(dialogue !== undefined && { dialogue }),
        ...(camera !== undefined && { camera }),
        ...(charIds !== undefined && { charIds: typeof charIds === 'string' ? charIds : JSON.stringify(charIds) }),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update panel error:', err);
    res.status(500).json({ error: 'Failed to update panel' });
  }
});

// ====== 运镜 prompt 映射 ======
const CAMERA_VIDEO_PROMPTS: Record<string, string> = {
  '远景': 'slow zoom out, wide establishing landscape shot, cinematic smooth camera',
  '中景': 'gentle horizontal pan, medium shot, subtle parallax, cinematic',
  '特写': 'slow dramatic zoom in, close-up detail, intense emotional focus, cinematic',
  '全景': 'slow panoramic sweep, wide angle establishing shot, cinematic smooth',
  '仰视': 'slow upward tilt, low angle heroic perspective, dramatic, cinematic',
  '俯视': 'slow downward tilt, high angle bird eye view, revealing shot, cinematic',
};

function getVideoPrompt(panel: any): string {
  const base = CAMERA_VIDEO_PROMPTS[panel.camera || ''] || 'gentle camera movement, smooth, cinematic';
  const extra = panel.action ? `, ${panel.action.slice(0, 50)}` : '';
  return base + extra;
}

// ====== POST /api/projects/:id/video/generate — 逐格生成视频 ======
router.post('/:id/video/generate', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { panels: { orderBy: { index: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const panelIds: string[] = req.body.panelIds || project.panels.map((p) => p.id);
    const panels = project.panels.filter((p) => panelIds.includes(p.id) && p.imagePath);

    if (panels.length === 0) return res.status(400).json({ error: 'No panels with images to generate video' });

    await prisma.project.update({ where: { id: req.params.id }, data: { status: 'GENERATING' } });

    const { generateVideo } = await import('../services/agnes');
    const axios = (await import('axios')).default;
    const videosDir = path.resolve(__dirname, '../../uploads/videos');
    fs.mkdirSync(videosDir, { recursive: true });

    const results: any[] = [];

    for (const panel of panels) {
      try {
        const imgPath = path.resolve(__dirname, '..', '..', panel.imagePath!.replace(/^\//, ''));
        if (!fs.existsSync(imgPath)) {
          results.push({ ...panel, videoPath: null, error: 'Image file not found', failed: true });
          continue;
        }

        const imgB64 = fs.readFileSync(imgPath, 'base64');
        const imageDataUrl = `data:image/png;base64,${imgB64}`;
        const prompt = getVideoPrompt(panel);

        // Call Agnes video API
        const videoUrl = await generateVideo(imageDataUrl, prompt);

        // Download video from Agnes URL
        const videoResp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120_000 });
        const fileName = `${panel.id}.mp4`;
        const filePath = path.join(videosDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(videoResp.data));

        const videoPath = `/uploads/videos/${fileName}`;
        await prisma.panel.update({
          where: { id: panel.id },
          data: { videoPath, prompt: panel.prompt || prompt },
        });

        results.push({ ...panel, videoPath, prompt });
      } catch (panelErr: any) {
        const msg = panelErr.response?.data?.error || panelErr.message;
        console.error(`❌ Video generation failed for panel ${panel.index}:`, msg);
        results.push({ ...panel, videoPath: null, error: msg, failed: true });
      }
    }

    await prisma.project.update({ where: { id: req.params.id }, data: { status: 'COMPLETED' } });

    res.json({ videos: results });
  } catch (err: any) {
    console.error('Video generation error:', err);
    await prisma.project.update({ where: { id: req.params.id }, data: { status: 'FAILED' } });
    res.status(500).json({ error: 'Video generation failed', message: err.message });
  }
});

// ====== POST /api/projects/:id/video/concat — FFmpeg 拼接所有片段 ======
router.post('/:id/video/concat', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { panels: { orderBy: { index: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const videoPanels = project.panels.filter((p) => p.videoPath);
    if (videoPanels.length === 0) return res.status(400).json({ error: 'No video clips to concatenate' });

    const videosDir = path.resolve(__dirname, '../../uploads/videos');
    const concatFile = path.join(videosDir, `${req.params.id}_concat.txt`);
    const outputFile = path.join(videosDir, `${req.params.id}_combined.mp4`);

    // Build FFmpeg concat file list
    const fileList = videoPanels.map((p) => {
      const absPath = path.resolve(__dirname, '..', '..', p.videoPath!.replace(/^\//, ''));
      // FFmpeg concat requires forward slashes on Windows
      return `file '${absPath.replace(/\\/g, '/')}'`;
    }).join('\n');
    fs.writeFileSync(concatFile, fileList);

    // Run FFmpeg concat
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputFile)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    // Clean up concat file
    fs.unlinkSync(concatFile);

    const outputPath = `/uploads/videos/${req.params.id}_combined.mp4`;

    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' },
    });

    res.json({ videoPath: outputPath, panelCount: videoPanels.length });
  } catch (err: any) {
    console.error('Video concat error:', err);
    res.status(500).json({ error: 'Video concatenation failed', message: err.message });
  }
});

// ====== GET /api/projects/:id/video — 检查视频状态 ======
router.get('/:id/video', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { panels: { orderBy: { index: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const videos = project.panels
      .filter((p) => p.videoPath)
      .map((p) => ({ panelId: p.id, index: p.index, videoPath: p.videoPath }));

    const combinedPath = `/uploads/videos/${req.params.id}_combined.mp4`;
    const hasCombined = fs.existsSync(path.resolve(__dirname, '../../', combinedPath));

    res.json({ videos, hasCombined, combinedPath: hasCombined ? combinedPath : null });
  } catch (err) {
    console.error('Get video status error:', err);
    res.status(500).json({ error: 'Failed to get video status' });
  }
});

export default router;
