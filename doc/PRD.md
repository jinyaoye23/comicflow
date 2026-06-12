# ComicFlow — 产品需求文档 (PRD)

> 版本: v0.1-draft | 日期: 2026-06-12 | 作者: 姚（老大）

---

## 1. 产品概述

### 1.1 产品定位

**ComicFlow** 是一个 AI 驱动的漫画一条龙创作平台。用户输入一个创意想法，系统自动完成：

```
想法 → 结构化脚本 → 角色设计 → 分镜生成 → 视频合成 → 导出
```

一句话：**让一个人拥有一间漫画工作室。**

### 1.2 目标用户

| 用户群 | 场景 | 痛点 |
|---|---|---|
| 独立创作者 | 想做漫画但没有绘画能力 | 外包画师成本高、周期长 |
| 自媒体运营 | 日更漫画/条漫内容 | 产能跟不上、AI 工具割裂 |
| 小说/IP 作者 | 将文字作品可视化 | 改编门槛高 |
| 海外内容创作者 | Webtoon / Tapas 平台投稿 | 英文漫画生成需求 |

### 1.3 差异化

- 不是"单张 AI 图片生成器"，而是**端到端管线**
- 角色一致性不是靠运气，靠工程手段（per-panel charIds + img2img）
- 从脚本到视频一条路走到底，不需要换 5 个工具

---

## 2. 核心工作流

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 阶段 1   │ → │ 阶段 2   │ → │ 阶段 3   │ → │ 阶段 4   │ → │ 阶段 5   │
│ 脚本生成 │    │ 角色设计 │    │ 分镜生成 │    │ 视频合成 │    │ 配音导出 │
│ LLM      │    │ T2I      │    │ I2I+Prompt│   │ I2V+FFmpeg│   │ TTS+Merge│
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 阶段 1：脚本生成

- 用户输入：主题、风格、篇幅（如"赛博朋克悬疑短篇，4 页"）
- LLM 输出结构化脚本 JSON：
  - 角色列表（姓名、外貌、性格、role）
  - 分镜数组（scene、action、dialogue、camera、mood）
- 用户可编辑每一格的分镜描述和台词

### 阶段 2：角色设计

- 从脚本的角色描述 → 调用文生图 API 生成角色参考图（character sheet）
- 生成后**立即转 data URL / 上传存储**，固化下来
- 支持手动上传替换参考图
- 每个角色的外貌描述作为"一致性约束"持久化

### 阶段 3：分镜生成

- 核心复用 MangaForge 已验证方案：
  - 每格 per-panel charIds 绑定
  - Prompt 末尾注入角色外貌描述
  - 首选 img2img（用角色参考图），无参考图时降级 text2img
  - 自动拼接 dialogue bubble（复用 MangaForge 的 bubble 渲染）
- 支持批量生成（4 格/6 格一页）
- 不满意时单击重绘

### 阶段 4：视频合成

- 路线 A（Ken Burns）：Canvas/CSS 运镜推拉摇移 → WebCodecs 导出
- 路线 B（AI）：每格漫画图 → 图生视频 API（agnes-video-gen）生成 3~5s 动画片段
- FFmpeg.wasm 拼接所有片段 + 转场
- MVP 先做路线 A（低成本跑通全流程）

### 阶段 5：配音 + 导出

- TTS 朗读脚本台词（Edge TTS / OpenAI TTS）
- 音效库（可选）
- 字幕硬编码（从脚本 dialogue 字段生成 SRT）
- 最终导出 MP4（1080p / 4K）

---

## 3. 功能需求详情

### 3.1 用户系统

| 功能 | MVP | 上线版 |
|---|---|---|
| 注册/登录（email + password） | ❌ | ✅ |
| JWT 双令牌（access 15min + refresh 7d） | ❌ | ✅ |
| 密码重置 | ❌ | ✅ |
| OAuth（Google/GitHub） | ❌ | 待评估 |

### 3.2 项目管理

| 功能 | MVP | 上线版 |
|---|---|---|
| 创建/删除项目 | ✅ | ✅ |
| 项目列表（卡片视图） | ✅ | ✅ |
| 项目状态管理（草稿/生成中/已完成） | ✅ | ✅ |
| 自动保存（IndexedDB → 后端同步） | ✅ | ✅ |

### 3.3 脚本编辑

| 功能 | MVP | 上线版 |
|---|---|---|
| 输入主题 → LLM 生成结构化脚本 | ✅ | ✅ |
| 分镜编辑器（纯文本 / 卡片视图） | ✅ | ✅ |
| 角色编辑器（增删改） | ✅ | ✅ |
| 每格单独编辑 scene / action / dialogue | ✅ | ✅ |
| 预设模板（日漫/美漫/条漫/四格） | 待定 | ✅ |

### 3.4 漫画生成

| 功能 | MVP | 上线版 |
|---|---|---|
| 批量生成全部分镜 | ✅ | ✅ |
| 单格重新生成 | ✅ | ✅ |
| 角色一致性（per-panel charIds + img2img） | ✅ | ✅ |
| 台词气泡自动叠加 | 待定 | ✅ |
| 漫画排版（一页多格排列） | ✅ | ✅ |
| 风格预设（日系/美系/水墨/像素） | ✅ | ✅ |

### 3.5 视频生成

| 功能 | MVP | 上线版 |
|---|---|---|
| Ken Burns 运镜推拉（CSS/Canvas） | ✅ | ✅ |
| AI 图生视频动画片段 | ❌ | ✅ |
| 转场效果 | ❌ | ✅ |
| 背景音乐 | ❌ | ✅ |
| TTS 配音 | ❌ | ✅ |
| 字幕硬编码 | ❌ | ✅ |
| FFmpeg.wasm 浏览器端合成 | ✅ | ✅ |

### 3.6 导出

| 功能 | MVP | 上线版 |
|---|---|---|
| 导出单张漫画图（PNG/JPG） | ✅ | ✅ |
| 导出长图拼接 | ✅ | ✅ |
| 导出 MP4 视频 | ✅ | ✅ |
| 导出结构化脚本（JSON/Markdown） | ✅ | ✅ |

### 3.7 会员制

| 功能 | MVP | 上线版 |
|---|---|---|
| 免费额度（每月 N 次生成） | ❌ | ✅ |
| 付费会员（月付/年付） | ❌ | ✅ |
| Stripe 支付集成 | ❌ | ✅ |
| 用量统计面板 | ❌ | ✅ |
| 邀请奖励 | ❌ | 待评估 |

---

## 4. 非功能性需求

| 维度 | 指标 |
|---|---|
| 单张图片生成 | < 30s（API 响应 + 上传存储） |
| 4 格批量生成 | < 2min（可并行） |
| 视频导出（Ken Burns） | < 1min |
| 前端首屏加载 | < 2s |
| API 响应 | < 500ms（生成类除外） |
| 并发用户 | MVP 10 并发 → 上线 500 并发 |
| 安全 | JWT 验证、API Key 不暴露前端、SQL 注入防护 |
| 国际化 | 中文 MVP → 英文 i18n |

---

## 5. 技术栈确认

| 层 | 选型 | 备注 |
|---|---|---|
| 前端 | React 18 + Vite + Tailwind + Zustand + React Query | 组件化多视图 |
| 后端 | Node.js + Express + TypeScript | 老大熟悉 |
| ORM | Prisma | 正在学，刚好实战 |
| 数据库 | MySQL（上线）/ SQLite（本地开发） | Prisma 统一接口，切换一行配置 |
| 缓存 | Redis（上线阶段） | Session、限流、任务队列 |
| 消息队列 | BullMQ（上线阶段） | 异步生成任务 |
| 认证 | JWT 双令牌 | access 15min + refresh 7d |
| 支付 | Stripe | 面向海外用户 |
| AI 服务 | Agnes AI（Chat / Image / Video） | 免费，延迟低 |
| 视频处理 | FFmpeg.wasm | 浏览器端合成，不走服务器 |
| 部署 | VPS（Node 进程 + Nginx 反向代理 + MySQL） | 后续可迁 Docker |

---

## 6. 存储方案分析 ⚠️

> 这是老大明确提出的核心问题：图片和视频怎么存？

### 6.1 方案对比

| 方案 | 原理 | 优点 | 缺点 | 适用 |
|---|---|---|---|---|
| **存数据库（BLOB）** | 图片/视频二进制直接存 MySQL `LONGBLOB` 字段 | 数据一体，备份方便 | ❌ 数据库膨胀快；❌ 查询慢；❌ 备份文件巨大；❌ 无法 CDN 加速；❌ 连接池被撑爆；**业界公认反模式** | 绝不推荐 |
| **本地磁盘** | 文件存服务器 `uploads/` 目录，DB 存路径 | 实现简单，零依赖 | ❌ 单机瓶颈；❌ 无法横向扩展；❌ 服务器磁盘有限；❌ 没有 CDN | MVP 阶段开发用 |
| **七牛云 Kodo** | 对象存储 + 国内 CDN | ✅ 国内访问快；✅ CDN 加速；✅ 图片处理 API；✅ 价格适中 | ❌ 需备案域名；❌ 海外访问不如 S3；❌ 只适合国内用户 | 主要面向国内用户时推荐 |
| **AWS S3 / Cloudflare R2** | 对象存储 + 全球 CDN | ✅ 全球访问都快；✅ 稳定成熟；✅ R2 零出网费 | ❌ 国内访问偶尔慢（R2 除外）；❌ S3 API 有点复杂 | 面向海外用户时推荐 |
| **Base64 / Data URL 直存** | 图片转 base64 存 JSON 字段 | 无外部依赖 | ❌ 体积膨胀 33%；❌ JSON 字段巨大；❌ 数据库拖垮；**仅适合单张小图** | 不适合此场景 |

### 6.2 推荐方案：对象存储 + DB 存路径

```
┌──────────┐     写入      ┌────────────┐     返回 URL     ┌──────────┐
│  后端     │ ──────────→ │ 对象存储    │ ──────────────→ │  后端     │
│ Express  │              │ S3/R2/Kodo  │                 │          │
└────┬─────┘              └────────────┘                 └────┬─────┘
     │                                                        │
     │  DB 只存路径                                           │
     ▼                                                        ▼
┌──────────────┐                                  ┌──────────────────┐
│  Panel 表     │                                  │  前端 <img> 标签  │
│  imageUrl:    │                                  │  src=CDN URL     │
│  "https://cdn │                                  │  直接加载，不经过 │
│   .xxx.com/   │                                  │  后端转发         │
│   panels/     │
│   abc.png"    │
└──────────────┘
```

**DB 存什么**：只存字符串路径，如 `panels/proj_abc/panel_01.png`  
**对象存储存什么**：实际的图片/视频文件  
**前端怎么拿**：直接用 CDN 公网 URL，不经过后端代理  

### 6.3 具体推荐

考虑到老大的规划：
- 最终目标是**海外远程工作**（GoElite 等平台）
- 支付用 **Stripe**（海外）
- 面向用户既可能是国内也可能是海外

**推荐分阶段**：

| 阶段 | 选择 | 理由 |
|---|---|---|
| MVP 本地开发 | 本地 `server/uploads/` | 零成本跑通流程 |
| 公测/Demo | **Cloudflare R2** | 零出网费，全球 CDN，国内访问尚可 |
| 正式上线 | R2（海外主力）+ 七牛云（国内镜像） | 双线加速 |

**为什么不推荐七牛云作为唯一方案**：
- 需要备案域名 → 额外时间成本
- 海外访问延迟高
- 你的目标是海外远程市场，产品天然应该是国际化的
- Cloudflare R2 的 S3 兼容 API 与 AWS SDK 完全通用

### 6.4 存储成本估算

| 存储量级 | R2 月费 | 七牛云月费 |
|---|---|---|
| 10GB（1000 个用户每人 10MB） | ~$0.15 | ~¥1 |
| 100GB | ~$1.50 | ~¥10 |
| 1TB | ~$15 | ~¥100 |

> R2 的核心优势是**出网流量免费**（七牛云/S3 都要收流量费），对视频这种大文件场景很友好。

---

## 7. 数据库核心模型

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  name          String?
  tier          Tier      @default(FREE)
  credits       Int       @default(3)
  refreshToken  String?
  projects      Project[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Project {
  id          String      @id @default(uuid())
  userId      String
  title       String
  genre       String?
  style       String?
  script      Json?
  panels      Panel[]
  characters  Character[]
  status      Status      @default(DRAFT)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Character {
  id          String   @id @default(uuid())
  projectId   String
  name        String
  description String
  imageKey    String?            // 对象存储 key，如 "chars/proj_abc/hero.png"
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Panel {
  id          String   @id @default(uuid())
  projectId   String
  index       Int
  scene       String?           // 场景描述
  action      String?           // 动作描述
  dialogue    String?           // 台词
  camera      String?           // 镜头角度
  prompt      String?           // 拼接后的完整生成 prompt
  imageKey    String?           // 对象存储 key
  videoKey    String?           // 视频文件 key
  charIds     Json?             // 绑定的角色 ID 数组
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, index])
}

enum Tier    { FREE PRO STUDIO }
enum Status  { DRAFT GENERATING COMPLETED FAILED }
```

---

## 8. API 设计概要

```
POST   /api/auth/register          # 注册
POST   /api/auth/login             # 登录 → 返回 access+refresh token
POST   /api/auth/refresh           # 刷新 access token

GET    /api/projects               # 项目列表
POST   /api/projects               # 创建项目
GET    /api/projects/:id           # 项目详情（含角色、面板）
DELETE /api/projects/:id           # 删除项目

POST   /api/projects/:id/script/generate    # 生成脚本（LLM）
PUT    /api/projects/:id/script             # 更新脚本
PATCH  /api/projects/:id/panels/:panelId    # 更新某个分镜

POST   /api/projects/:id/characters/:charId/generate  # 生成角色参考图
PUT    /api/projects/:id/characters/:charId            # 更新角色信息

POST   /api/projects/:id/panels/generate       # 批量生成分镜图
POST   /api/projects/:id/panels/:panelId/retry # 重新生成某格

POST   /api/projects/:id/video/generate  # 生成视频（调用 AI + FFmpeg）
GET    /api/projects/:id/video/status    # 查询视频生成进度

GET    /api/projects/:id/export/image    # 导出漫画图
GET    /api/projects/:id/export/video    # 导出视频
GET    /api/projects/:id/export/script   # 导出脚本 JSON

GET    /api/user/usage       # 用量统计
POST   /api/payment/checkout # Stripe checkout session
```

---

## 9. MVP 分阶段计划

### Phase 1 — 本地全流程验证（当前目标）

**目标**：本地跑通「想法 → 脚本 → 角色 → 漫画 → 视频」全流程

| 不做的 | 做的 |
|---|---|
| 用户注册/登录 | hardcode dev user |
| MySQL/Redis | SQLite + 本地文件 |
| 消息队列 | 同步生成 |
| 支付/会员 | 无 |
| i18n | 中文 |
| 视频 AI 动画 | Ken Burns 运镜 |

**交付物**：一个本地可用的 Web 工具，能完成一条龙全流程。

### Phase 2 — 多人 SaaS

**目标**：上线公测，支持注册和基础付费

| 新增 | 改动 |
|---|---|
| 注册/登录 + JWT | SQLite → MySQL |
| 会员体系 + Stripe | 本地存储 → R2 |
| Redis 限流 | Express → Docker |
| 异步生成（BullMQ） | 同步 → 异步 |

### Phase 3 — 视频升级 + 国际化

| 新增 | 改动 |
|---|---|
| AI 图生视频 | 新增视频管线 |
| TTS 配音 + 字幕 | 新增导出管线 |
| 英文 i18n | UI + 脚本生成 |
| 七牛云国内 CDN | 新增镜像 |

---

## 10. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| AI 生图一致性仍然不够好 | 中 | 高 | 先做好 prompt 注入 + img2img，再不行就加 ControlNet/IP-Adapter |
| AI 视频效果差 | 高 | 中 | MVP 先用 Ken Burns 兜底，AI 动画等模型成熟再做 |
| API 调用成本 | 中 | 中 | Agnes AI 免费；视频 API 用量监控 + 额度限制 |
| 用户生成内容违规 | 中 | 高 | 接入内容审核 API（或 prompt 关键词过滤） |
| 对象存储被刷 | 低 | 高 | 签名 URL（预签名），限制访问有效期 |

---

## 11. 命名

| 名称 | 说明 |
|---|---|
| **ComicFlow** | 产品名，意为「漫画流水线」 |
| 备选 | MangaForge（已有工具）、PanelCraft、StoryToon |

> 暂定 ComicFlow，老大不喜欢再换。
