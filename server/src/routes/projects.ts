import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import prisma from '../lib/prisma';
import { chatCompletion } from '../services/agnes';
import fs from 'fs';
import path from 'path';

const router = Router();

// ====== 视频 Prompt 构建器（Agnes Video V2.0 最佳实践） ======
// Agnes 文生视频核心原则：
//   1. 每次只能生成一个连续镜头（约5秒），不能描述"多个场景切换"
//   2. 公式：Visual Style → Subject/Setting → Action → Emotion → Camera → Quality
//   3. 聚焦单一画面，使用具体动词描述运动，避免"Scene 1/2/3"碎片化描述
//   4. 中英文混合均可，英文质量关键词效果最好放结尾
//   5. 控制在 200-400 字符，太长反而降低相关性
function buildVideoPrompt(script: any, isComic: boolean): string {
  if (isComic) {
    const panels: any[] = script.panels || [];
    const style: string = script.style || 'anime';
    const title: string = script.title || 'comic';
    const universalPrompt: string = script.universalPrompt || '';
    const overallStyle: string = script.overallStyle || '';

    // 优先用第一格：场景 + 动作 + 情绪
    const p0 = panels[0] || {};
    const p1 = panels[1] || {};

    // 视觉风格定位（Agnes V2.0最关键的部分）
    // 用 style 映射到英文关键词 → 确保画面风格准确
    const styleMap: Record<string, string> = {
      '日系': 'Japanese anime style, 2D animation, clean lineart',
      '美漫': 'American comic style, bold lineart, dynamic poses',
      '水墨': 'Chinese ink wash painting style, brush strokes, traditional art',
      '赛博朋克': 'cyberpunk style, neon lights, futuristic dystopia, dark atmosphere',
      '国漫': 'Chinese donghua animation style, vibrant colors',
      'Q版': 'cute chibi anime style, big eyes, simplified proportions',
      '写实': 'semi-realistic animation, detailed rendering',
    };
    const styleEn = styleMap[style] || `${style} anime style, 2D animation`;

    // 核心场景描述（精简，取最具画面感的部分）
    const scene = p0.scene || '';
    const action = p0.action || '';
    const emotion = p0.emotion || p1.emotion || '';
    const camera = p0.camera || '中景';

    // 镜头映射英文
    const cameraMap: Record<string, string> = {
      '中景': 'medium shot',
      '近景': 'close-up shot',
      '远景': 'wide shot',
      '特写': 'extreme close-up',
      '俯视': 'overhead shot',
      '仰视': 'low angle shot',
      '全景': 'wide establishing shot',
    };
    const cameraEn = cameraMap[camera] || camera;

    // 组合 prompt（结构清晰，不超过350字符）
    const parts: string[] = [];

    // 1. 风格前置（最重要）
    parts.push(`${styleEn}.`);

    // 2. 全局角色一致性描述（如有）
    if (universalPrompt) {
      parts.push(universalPrompt.replace(/\.$/, '').substring(0, 80) + '.');
    }

    // 3. 核心场景（中文可以，Agnes理解）
    if (scene) parts.push(scene.substring(0, 100));

    // 4. 关键动作（用"then"隐含时序）
    if (action) parts.push(action.substring(0, 80));

    // 5. 情绪/氛围
    if (emotion) parts.push(`Tone: ${emotion.substring(0, 40)}.`);

    // 6. 镜头 + 质量词（英文关键词放最后效果最好）
    parts.push(`${cameraEn}, smooth motion, cinematic lighting, high quality, sharp details, 24fps.`);

    return parts.filter(Boolean).join(' ');
  } else {
    // 视频脚本：聚焦第一个核心场景
    const scenes: any[] = script.scenes || [];
    const p0 = scenes[0] || {};
    const style: string = script.style || 'cinematic';
    const genre: string = script.genre || '';

    const scene = p0.scene || '';
    const action = p0.action || '';
    const atmosphere = p0.atmosphere || '';
    const camera = p0.camera || '静态';

    const parts: string[] = [
      `${style} style cinematic video${genre ? ', ' + genre : ''}.`,
      ...(scene ? [scene.substring(0, 100)] : []),
      ...(action ? [action.substring(0, 80)] : []),
      ...(atmosphere ? [`Atmosphere: ${atmosphere.substring(0, 60)}.`] : []),
      `${camera}, smooth motion, professional cinematography, high quality, 24fps, dramatic lighting.`,
    ];
    return parts.filter(Boolean).join(' ');
  }
}

// ====== 系统 Prompt: 漫画脚本生成（带对话气泡） ======
const COMIC_SCRIPT_PROMPT = `你是一个专业的爆款短视频漫剧脚本作家，擅长创作Q版搞笑、沙雕日常、职场共鸣类漫画脚本。每个分镜信息必须极其详细，方便后续AI生图和短视频制作。

必须严格返回以下 JSON 格式（不要包含任何 markdown 标记，直接返回纯 JSON）：

{
  "title": "漫画标题（有网感，吸引点击）",
  "genre": "类型（职场搞笑/日常沙雕/校园/奇幻等）",
  "overallStyle": "整体风格描述（画风、色调、氛围，例如：Q版萌系、极简卡通、高饱和明亮配色、轻松沙雕）",
  "characters": [
    {
      "name": "角色名",
      "role": "主角/配角/反派",
      "appearance": "极其详细的外貌描述（包含：发型发色、脸型、眼型、体型、标志性服装、表情特点、身高比例、Q版特征如短手短脚等）。这是保证后续所有分镜人物一致性的关键，必须100字以上。",
      "personality": "性格特点和标志性行为模式"
    }
  ],
  "panels": [
    {
      "index": 0,
      "scene": "画面：详细场景视觉描述。包含场景环境、角色位置布局、表情细节、肢体语言、画面构图、色彩和光影。写得越详细，AI生图越准确。",
      "action": "动作：角色具体做什么动作，动作节奏和细节",
      "dialogue": "台词：角色说的对话。标注说话人，例如"老板：看来你工作很轻松啊"。简短但有力，适合放在漫画对话气泡中。无对话时留空字符串。",
      "camera": "镜头：景别+角度+构图方式。例如：平视全景 / 面部大特写 / 俯拍特写 / 近景双人对峙 / 手部动态特写 / 侧面全景 / 正面平视",
      "subtitle": "字幕：画面中出现的屏幕覆盖文字或旁白字幕，无则留空",
      "innerThought": "内心OS：角色的内心独白或吐槽，无则留空",
      "emotion": "情绪/笑点：这一格的情感基调、喜剧元素或共鸣点，例如"反差笑点 / 假装努力 / 猝不及防 / 虚惊一场 / 极致社死 / 沙雕治愈"",
      "soundEffect": "音效：配乐或音效提示（为后续短视频配音做准备），例如"心跳加速 / 空气突然安静 / 紧张提示音"。无则留空。"
    }
  ],
  "rhythm": "节奏编排：按剧作结构分阶段描述，例如"1-3格：快速铺垫日常笑点 / 4-7格：紧张高潮+反转 / 8-10格：终极翻车+爆笑收尾"",
  "universalPrompt": "AI生成通用提示词：一段可直接用于生图的全局画面描述。包含：画幅比例（如9:16竖屏）、整体画风（Q版卡通/圆润可爱）、色彩风格、角色特征概括、场景氛围、画质要求。这段文本会被直接拼接到每格生图prompt中。"
}

关键要求：
1. 每个分镜的 scene（画面）描述必须极其详细——这是AI生图的直接素材。描述要包含：场景+角色位置+角色动作表情+画面构图+光影色彩。每格scene不少于50字。
2. dialogue（台词）必须简短有力，适合放在对话气泡中，标注说话人。作为搞笑漫剧，台词要有网感、有反转感。
3. emotion（情绪/笑点）必须明确，帮助把握每一格的节奏和表演方向。
4. camera（镜头）描述要具体，指明景别+角度+构图意图，这是后续分镜生图的视觉指导。
5. characters 至少2个（主角+对手/配角），最多4个。appearance 必须极其详细，这是保证全部分镜人物外貌一致的关键。
6. panels 推荐6~10格，必须有完整的起承转合——铺垫→冲突→反转→收尾。
7. universalPrompt 要包含画幅（9:16竖屏）、画风关键词、角色特征概括、全局氛围描述。
8. 整体风格轻松搞笑、有共鸣感、适合短视频漫剧传播。`;

// ====== 系统 Prompt: 视频脚本生成（分镜故事板） ======
const VIDEO_SCRIPT_PROMPT = `你是一个专业的视频分镜脚本作家。根据用户的创意想法，生成结构化的视频分镜脚本（故事板）。

必须严格返回以下 JSON 格式（不要包含任何 markdown 标记，直接返回纯 JSON）：

{
  "title": "视频标题",
  "genre": "类型（科幻/奇幻/都市/古风/悬疑等）",
  "style": "视觉风格（赛博朋克/吉卜力/新海诚/好莱坞/国风水墨等）",
  "description": "视频整体描述（50字，概括整个视频的主题和情感）",
  "characters": [
    { "name": "角色名", "role": "主角/配角", "appearance": "详细外貌描述（100字以上，包含发型、脸型、眼型、体型、服装）", "personality": "性格特点" }
  ],
  "scenes": [
    { "index": 0, "scene": "场景环境（详细视觉描述）", "action": "画面中发生的动作和运镜", "atmosphere": "氛围/色调/光影描述", "camera": "镜头描述（远景缓推/中景跟拍/特写/摇镜/俯拍等）", "duration": 3 }
  ]
}

要求：
1. characters 至少 1 个，最多 3 个。appearance 极其详细，用于后续生成一致的视觉画面。
2. scenes 推荐 3~6 个场景，每个场景 duration 为 2-5 秒。
3. scene 描述要注重视觉冲击力、色彩、光影、构图——这是给AI生视频的prompt素材。
4. camera 要包含具体的运镜方式（如"从左到右缓慢横移"、"镜头缓缓推近"、"俯拍旋转"）。
5. atmosphere 描述色调和氛围（如"暖金色夕阳逆光"、"冷蓝色赛博霓虹"）。
6. 风格参考：新海诚清新风 / 赛博朋克 / 吉卜力童话风 / 好莱坞电影感 / 国风水墨。`;

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
    const { title, genre, style, scriptType } = req.body;
    const devUser = await prisma.user.findFirst({ where: { email: 'dev@comicflow.local' } });
    if (!devUser) return res.status(500).json({ error: 'Dev user not found. Run seed first.' });

    const project = await prisma.project.create({
      data: {
        id: uuid(),
        userId: devUser.id,
        title: title || '未命名项目',
        genre: genre || null,
        style: style || (scriptType === 'VIDEO' ? '电影感' : 'Q版萌系搞笑'),
        scriptType: (scriptType || 'COMIC').toUpperCase(),
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

// ====== POST /api/projects/:id/script/generate — AI 生成脚本（漫画/视频双模式） ======
router.post('/:id/script/generate', async (req: Request, res: Response) => {
  try {
    const { idea, scriptType } = req.body;
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const mode = (scriptType || project.scriptType || 'COMIC').toUpperCase();
    const isComic = mode === 'COMIC';

    const userPrompt = isComic
      ? `创作一部爆款短视频漫画脚本。风格：${project.style || 'Q版萌系搞笑'}。类型：${project.genre || '职场日常'}。创意主题：${idea || '打工人日常摸鱼的搞笑故事'}

要求：脚本要有网感，节奏紧凑，笑点密集，结尾有反转，适合做成短视频漫剧在抖音/B站传播。`
      : `创作一个视频分镜脚本。风格：${project.style || '电影感'}。类型：${project.genre || '通用'}。创意：${idea || '自由发挥'}`;

    const systemPrompt = isComic ? COMIC_SCRIPT_PROMPT : VIDEO_SCRIPT_PROMPT;
    const raw = await chatCompletion(userPrompt, systemPrompt);

    // Parse JSON from response (strip any markdown code fences)
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    }

    const script = JSON.parse(clean);

    // Save script + type + original idea to project
    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        scriptType: mode,
        idea: idea || project.idea,
        script: JSON.stringify(script),
        genre: script.genre || project.genre,
        style: script.overallStyle || script.style || project.style,
      },
    });

    // Upsert characters from script (shared between both modes)
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

    // Upsert panels/scenes from script
    const items = isComic ? script.panels : script.scenes;
    if (items && Array.isArray(items)) {
      // Delete existing panels first
      await prisma.panel.deleteMany({ where: { projectId: req.params.id } });

      for (const item of items) {
        await prisma.panel.create({
          data: {
            id: uuid(),
            projectId: req.params.id,
            index: item.index,
            scene: item.scene || '',
            action: item.action || '',
            dialogue: isComic ? (item.dialogue || '') : '',
            camera: item.camera || (isComic ? '中景' : '固定镜头'),
            subtitle: isComic ? (item.subtitle || '') : '',
            innerThought: isComic ? (item.innerThought || '') : '',
            emotion: isComic ? (item.emotion || '') : '',
            soundEffect: isComic ? (item.soundEffect || '') : '',
          },
        });
      }
    }

    res.json({ script, projectId: req.params.id, scriptType: mode });
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
        const isComic = project.scriptType === 'COMIC';

        // Build prompt based on mode
        let basePrompt: string;

        // 从脚本中提取 universalPrompt（漫画模式有全局生图描述）
        let universalPrompt = '';
        try {
          if (project.script) {
            const parsed = JSON.parse(project.script);
            universalPrompt = parsed.universalPrompt || '';
          }
        } catch {}

        if (isComic) {
          // 漫画模式：优先使用 universalPrompt 作为基底，叠加分镜独有描述
          const panelDetails = [
            panel.scene && `Panel scene: ${panel.scene}`,
            panel.action && `Action: ${panel.action}`,
            panel.camera && `Camera shot: ${panel.camera}`,
          ].filter(Boolean).join('. ');

          if (universalPrompt) {
            basePrompt = `${universalPrompt}. ${panelDetails}`;
          } else {
            basePrompt = `Manga panel, high quality. Style: ${project.style || 'anime'}. ${panelDetails}`;
          }

          if (panel.dialogue) {
            basePrompt += ` IMPORTANT: Include a speech bubble with the text: "${panel.dialogue}". The speech bubble should point to the speaking character.`;
          }
          if (panel.subtitle) {
            basePrompt += ` On-screen subtitle text: "${panel.subtitle}".`;
          }
        } else {
          // 视频故事板模式：注重视觉冲击力和电影感
          basePrompt = `Cinematic storyboard frame, movie quality. Style: ${project.style || 'cinematic'}. Scene: ${panel.scene || ''}. Action: ${panel.action || ''}.`;
          if (panel.camera) basePrompt += ` Camera movement: ${panel.camera}.`;
          basePrompt += ` High detail, dramatic lighting, wide aspect ratio feel, film grain.`;
        }

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

    const isComic = project.scriptType === 'COMIC';

    // Build prompt based on mode
    let basePrompt: string;

    // 从脚本中提取 universalPrompt
    let universalPrompt = '';
    try {
      if (project.script) {
        const parsed = JSON.parse(project.script);
        universalPrompt = parsed.universalPrompt || '';
      }
    } catch {}

    if (isComic) {
      const panelDetails = [
        panel.scene && `Panel scene: ${panel.scene}`,
        panel.action && `Action: ${panel.action}`,
        panel.camera && `Camera shot: ${panel.camera}`,
      ].filter(Boolean).join('. ');

      if (universalPrompt) {
        basePrompt = `${universalPrompt}. ${panelDetails}`;
      } else {
        basePrompt = `Manga panel, high quality. Style: ${project.style || 'anime'}. ${panelDetails}`;
      }

      if (panel.dialogue) {
        basePrompt += ` IMPORTANT: Include speech bubble with: "${panel.dialogue}". Manga style speech bubble.`;
      }
      if (panel.subtitle) {
        basePrompt += ` On-screen subtitle text: "${panel.subtitle}".`;
      }
    } else {
      basePrompt = `Cinematic storyboard frame, movie quality. Style: ${project.style || 'cinematic'}. Scene: ${panel.scene || ''}. Action: ${panel.action || ''}.`;
      if (panel.camera) basePrompt += ` Camera movement: ${panel.camera}.`;
      basePrompt += ` High detail, dramatic lighting, film grain.`;
    }

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
    const { scene, action, dialogue, camera, subtitle, innerThought, emotion, soundEffect, charIds } = req.body;
    const updated = await prisma.panel.update({
      where: { id: req.params.panelId },
      data: {
        ...(scene !== undefined && { scene }),
        ...(action !== undefined && { action }),
        ...(dialogue !== undefined && { dialogue }),
        ...(camera !== undefined && { camera }),
        ...(subtitle !== undefined && { subtitle }),
        ...(innerThought !== undefined && { innerThought }),
        ...(emotion !== undefined && { emotion }),
        ...(soundEffect !== undefined && { soundEffect }),
        ...(charIds !== undefined && { charIds: typeof charIds === 'string' ? charIds : JSON.stringify(charIds) }),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update panel error:', err);
    res.status(500).json({ error: 'Failed to update panel' });
  }
});

// ====== POST /api/projects/:id/video/generate — 文生视频（异步） ======
// 使用纯文本 prompt 生成视频，无需图片输入
router.post('/:id/video/generate', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { panels: { orderBy: { index: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.status === 'GENERATING') {
      return res.status(409).json({ error: 'Video generation already in progress' });
    }

    if (!project.script) {
      return res.status(400).json({ error: '请先生成脚本' });
    }

    // 标记为生成中，清空旧 taskId
    await prisma.project.update({ where: { id: projectId }, data: { status: 'GENERATING', videoTaskId: null } });

    // 构建文生视频 prompt（英文效果更好）
    // Agnes Video V2.0 最佳实践：
    //   - 文生视频只能生成一个连续场景，不能塞多个分镜
    //   - 公式：Subject + Setting + Action + Style + Camera + Quality
    //   - 英文 prompt 效果远优于中文
    //   - 聚焦单一画面，避免"Scene 1/2/3"这种碎片化描述
    const script = JSON.parse(project.script);
    const isComic = project.scriptType === 'COMIC';
    const videoPrompt = buildVideoPrompt(script, isComic);

    console.log(`🎬 [v7] Text-to-video for project ${projectId} (${project.scriptType})`);
    console.log(`📝 [v7] Prompt (${videoPrompt.length} chars): ${videoPrompt.substring(0, 200)}...`);

    const { createVideoTask, pollVideoTask } = await import('../services/agnes');

    // 纯文生视频（空图片数组）
    const { taskId } = await createVideoTask(
      [], // 空数组 = text-to-video
      videoPrompt,
      { num_frames: 121, width: 768, height: 1024, frame_rate: 24 }
    );

    console.log(`✅ [v7] Text-to-video task created: ${taskId}`);

    // 立即把 taskId + prompt 写入 DB，方便前端跨页面恢复
    await prisma.project.update({
      where: { id: projectId },
      data: { videoTaskId: taskId, videoPrompt },
    });

    // 后台异步轮询 + 下载
    const videosDir = path.resolve(__dirname, '../../uploads/videos');
    fs.mkdirSync(videosDir, { recursive: true });

    (async () => {
      try {
        console.log(`⏳ [v7] Polling text-to-video task ${taskId}...`);
        const result = await pollVideoTask(taskId, (status) => {
          console.log(`🎬 [v7] Task ${taskId}: status=${status.status}, progress=${status.progress ?? '-'}`);
        });

        const videoUrl = result.remixed_from_video_id || result.video_url || result.url;
        if (!videoUrl) throw new Error('No video URL in completed task');

        console.log(`📥 [v7] Downloading video from ${videoUrl}...`);
        const axios = (await import('axios')).default;
        const videoResp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 300_000 });
        const fileName = `${projectId}_combined.mp4`;
        fs.writeFileSync(path.join(videosDir, fileName), Buffer.from(videoResp.data));

        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'COMPLETED' },
          // 保留 videoTaskId 方便查档
        });

        console.log(`✅ [v7] Text-to-video complete for ${projectId}`);
      } catch (err: any) {
        console.error(`❌ [v7] Background text-to-video failed:`, err.message);
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'FAILED' },
          // 保留 videoTaskId 方便排查
        });
      }
    })();

    res.json({
      taskId,
      status: 'processing',
      mode: 'text-to-video',
      scriptType: project.scriptType,
      message: 'Text-to-video task created, polling in background',
    });
  } catch (err: any) {
    console.error('Video generation error:', err);
    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'FAILED', videoTaskId: null },
    });
    res.status(500).json({ error: 'Video generation failed', message: err.message });
  }
});

// ====== GET /api/projects/:id/video — 检查视频状态（含任务 ID 和 Agnes 实时状态） ======
router.get('/:id/video', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const videoFileName = `${req.params.id}_combined.mp4`;
    const videoPath = `/uploads/videos/${videoFileName}`;
    // 注意：不能把以 '/' 开头的 videoPath 直接传给 path.resolve，
    // 否则 Windows 上会被当作绝对路径（C:\uploads\...）而非项目目录下的路径
    const fullPath = path.resolve(__dirname, '../../uploads/videos', videoFileName);
    const hasVideo = fs.existsSync(fullPath);

    // 如果正在生成，尝试查询 Agnes 任务的实时进度
    let agnesProgress: number | null = null;
    let agnesStatus: string | null = null;
    if (project.status === 'GENERATING' && project.videoTaskId) {
      try {
        const { client } = await import('../services/agnes');
        const r = await client.get(`/v1/videos/${project.videoTaskId}`);
        agnesStatus = r.data?.status ?? null;
        agnesProgress = r.data?.progress ?? null;
      } catch (_) {
        // 查询失败不影响整体响应
      }
    }

    res.json({
      hasVideo,
      videoPath: hasVideo ? videoPath : null,
      status: project.status,            // DRAFT | GENERATING | COMPLETED | FAILED
      videoTaskId: project.videoTaskId,  // Agnes 任务 ID，前端可用于展示
      videoPrompt: project.videoPrompt,  // 生成时使用的 prompt，前端可用于调试和展示
      agnesStatus,                       // Agnes 内部状态：queued | in_progress | completed | failed
      agnesProgress,                     // 进度 0-100（Agnes 返回时有效）
      message:
        project.status === 'GENERATING'
          ? agnesStatus === 'queued'
            ? '任务排队中，稍候片刻...'
            : '视频生成中，请耐心等待（约 3-8 分钟）...'
          : project.status === 'FAILED'
          ? '视频生成失败，请重新生成'
          : hasVideo
          ? '视频已就绪'
          : '尚未生成视频',
    });
  } catch (err) {
    console.error('Get video status error:', err);
    res.status(500).json({ error: 'Failed to get video status' });
  }
});

// ====== DELETE /api/projects/:id/video/task — 清空失败任务 ID，允许重新生成 ======
router.delete('/:id/video/task', async (req: Request, res: Response) => {
  try {
    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'DRAFT', videoTaskId: null },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset video task' });
  }
});

export default router;
