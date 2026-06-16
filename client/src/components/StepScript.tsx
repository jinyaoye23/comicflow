import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateScript, updatePanel } from '../services/api';
import { usePipelineStore } from '../stores/pipeline';
import { toast } from './Toast';
import type { Project, Panel } from '../services/api';

interface Props {
  project: Project;
}

export function StepScript({ project }: Props) {
  const queryClient = useQueryClient();
  const setStep = usePipelineStore((s) => s.setStep);
  const [idea, setIdea] = useState(project.idea || '');
  const [error, setError] = useState<string | null>(null);

  const isComic = project.scriptType === 'COMIC';

  const genMutation = useMutation({
    mutationFn: (text: string) => generateScript(project.id, text, project.scriptType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast('success', isComic ? '漫画脚本生成完成！' : '视频脚本生成完成！');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || '脚本生成失败';
      setError(msg);
      toast('error', msg);
    },
  });

  const handleGenerate = () => {
    if (!idea.trim()) return;
    setError(null);
    genMutation.mutate(idea);
  };

  const hasScript = project.script && project.panels?.length > 0;

  // ===== 快捷模板 =====
  const templates = isComic
    ? [
        { label: '职场搞笑', text: '一个互联网公司的产品经理总是提离谱需求，程序员们花式摸鱼对抗。Q版日系风格，6格漫画。' },
        { label: '校园恋爱', text: '高中班级里，学霸和学渣同桌的日常。学渣暗恋学霸，却总是用奇怪的方式表达。国漫风格，4格漫画。' },
        { label: '赛博朋克', text: '赛博朋克世界的咖啡馆里，年轻女咖啡师和怀旧老板的日常故事。赛博朋克风格，4格漫画。' },
      ]
    : [
        { label: '城市慢镜头', text: '一个雨天的城市街角，陌生人的擦肩、眼神交汇、会心一笑。新海诚风格，电影感，4个场景。' },
        { label: '孤独星际', text: '一个孤独的星际旅人漂流在未知星系，遇到一座被遗忘的外星城市。电影感，3-5个场景。' },
      ];

  // ===== 生成中：骨架屏 =====
  if (genMutation.isPending) {
    return (
      <div className="space-y-6">
        {/* Mode Badge */}
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            isComic ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {isComic ? '📖 漫画模式' : '🎬 视频模式'}
          </span>
        </div>

        {/* 生成中动画卡片 */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-8">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-indigo-200/30 animate-ping" style={{ animationDuration: '2.5s' }} />
          </div>
          <div className="relative text-center space-y-4">
            <div className="flex justify-center">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-spin border-t-indigo-500" />
                <div className="absolute inset-0 flex items-center justify-center text-2xl">🤖</div>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-indigo-900">AI 正在创作脚本...</h3>
              <p className="text-sm text-indigo-600 mt-1">
                {isComic ? '分析剧情、设计分镜、编写对话气泡' : '构思场景、设计运镜、编写分镜描述'}
              </p>
            </div>
            {/* 骨架屏模拟进度 */}
            <div className="max-w-sm mx-auto space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-3 w-4/5" />
            </div>
            <p className="text-xs text-indigo-400">通常需要 15-30 秒，请耐心等待</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Badge */}
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          isComic ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {isComic ? '📖 漫画模式' : '🎬 视频模式'}
        </span>
        <span className="text-xs text-gray-400">
          {isComic ? '生成漫画分镜 + 对话气泡' : '生成视频故事板 + AI文生视频'}
        </span>
      </div>

      {/* Idea Input — 有脚本时折叠 */}
      {!hasScript && (
        <div>
          <h3 className="text-lg font-semibold mb-3">输入你的创意</h3>
          <textarea
            className="input-field min-h-[100px]"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={isComic
              ? "描述你想创作的故事...\n\n例如：一个赛博朋克世界的咖啡馆里，年轻女咖啡师和怀旧老板的日常故事。4格漫画，日系风格。"
              : "描述你想创作的视频...\n\n例如：一个孤独的星际旅人漂流在未知星系，遇到一座被遗忘的外星城市。电影感，新海诚风格。3-5个场景。"}
          />

          {/* 快捷模板 */}
          {!idea.trim() && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-gray-400 pt-1">试试：</span>
              {templates.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => setIdea(tpl.text)}
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleGenerate}
              disabled={!idea.trim()}
              className="btn-primary"
            >
              🤖 AI 生成{isComic ? '漫画' : '视频'}脚本
            </button>
            <span className="text-xs text-gray-400">
              风格：{project.style} | 类型：{project.genre || '未设置'}
            </span>
          </div>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Script Display */}
      {hasScript && <ScriptDisplay project={project} queryClient={queryClient} />}

      {/* Empty State */}
      {!hasScript && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📝</div>
          <p className="text-lg font-medium text-gray-600">还没有脚本</p>
          <p className="text-sm mt-1">输入创意，让 AI 为你创作漫画脚本</p>
        </div>
      )}
    </div>
  );
}

function ScriptDisplay({ project, queryClient }: { project: Project; queryClient: any }) {
  const [editingPanel, setEditingPanel] = useState<string | null>(null);
  const setStep = usePipelineStore((s) => s.setStep);
  const isComic = project.scriptType === 'COMIC';

  let script: any = null;
  try {
    script = project.script ? JSON.parse(project.script) : null;
  } catch {
    return <div className="text-red-500">脚本解析失败</div>;
  }
  if (!script) return null;

  const updateMutation = useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: Partial<Panel> }) =>
      updatePanel(project.id, panelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      setEditingPanel(null);
      toast('success', '分镜已保存');
    },
    onError: () => toast('error', '保存失败，请重试'),
  });

  const hasCharImages = project.characters?.some((c: any) => c.imagePath);
  const panelCount = project.panels?.length || 0;

  return (
    <div className="space-y-6">
      {/* 生成完成提示 + 下一步按钮 */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
        <div className="flex items-center gap-2">
          <span className="text-xl">✅</span>
          <div>
            <p className="font-semibold text-emerald-800 text-sm">脚本生成完成</p>
            <p className="text-xs text-emerald-600">
              {panelCount} {isComic ? '格分镜' : '个场景'} · {script.characters?.length || 0} 个角色 · 可编辑调整后进入下一步
            </p>
          </div>
        </div>
        <button onClick={() => setStep('panels')} className="btn-primary text-sm bg-emerald-600 hover:bg-emerald-700">
          下一步：分镜生图 →
        </button>
      </div>

      {/* Meta info: 风格 + 节奏 */}
      {isComic && (script.overallStyle || script.rhythm) && (
        <div className="card p-4 space-y-2 bg-gray-50/50">
          {script.overallStyle && (
            <div className="flex gap-2 items-start">
              <span className="text-xs text-gray-400 w-16 flex-shrink-0 pt-0.5">整体风格</span>
              <span className="text-sm text-gray-700">{script.overallStyle}</span>
            </div>
          )}
          {script.rhythm && (
            <div className="flex gap-2 items-start">
              <span className="text-xs text-gray-400 w-16 flex-shrink-0 pt-0.5">节奏</span>
              <span className="text-sm text-gray-600">{script.rhythm}</span>
            </div>
          )}
          {script.universalPrompt && (
            <div className="flex gap-2 items-start">
              <span className="text-xs text-gray-400 w-16 flex-shrink-0 pt-0.5">生图提示词</span>
              <span className="text-sm text-gray-500">{script.universalPrompt}</span>
            </div>
          )}
        </div>
      )}

      {/* Characters Summary */}
      {script.characters?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">角色列表</h3>
            <button onClick={() => setStep('characters')} className="text-xs text-accent-600 hover:text-accent-700">
              {hasCharImages ? '✅ 角色图已生成 →' : '⚠ 需生成角色参考图 →'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {script.characters.map((ch: any, i: number) => (
              <div key={i} className="card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{ch.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-accent-50 text-accent-600 rounded">
                    {ch.role || '角色'}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{ch.appearance}</p>
                {ch.personality && (
                  <p className="text-xs text-gray-400 mt-1">性格：{ch.personality}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panels / Scenes */}
      <div>
        <h3 className="text-lg font-semibold mb-3">
          {isComic ? '分镜脚本' : '故事板场景'}
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({panelCount} {isComic ? '格' : '个场景'})
          </span>
        </h3>
        <div className="space-y-3">
          {project.panels?.map((panel: Panel) => (
            <div key={panel.id} className="card p-4">
              {editingPanel === panel.id ? (
                <PanelEditor
                  panel={panel}
                  onSave={(data) => updateMutation.mutate({ panelId: panel.id, data })}
                  onCancel={() => setEditingPanel(null)}
                  saving={updateMutation.isPending}
                  isComic={isComic}
                />
              ) : (
                <PanelCard panel={panel} onEdit={() => setEditingPanel(panel.id)} isComic={isComic} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelCard({ panel, onEdit, isComic }: { panel: Panel; onEdit: () => void; isComic: boolean }) {
  return (
    <div className="flex gap-4">
      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
        isComic ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
      }`}>
        {panel.index + 1}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* 画面 + 镜头 + 情绪 */}
        <div className="flex flex-wrap gap-2">
          {panel.scene && (
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600 line-clamp-2 max-w-[300px]">{panel.scene}</span>
          )}
          {panel.camera && (
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-500">
              {isComic ? '📷' : '🎥'} {panel.camera}
            </span>
          )}
          {isComic && panel.emotion && (
            <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 rounded">😂 {panel.emotion}</span>
          )}
          {isComic && panel.soundEffect && (
            <span className="text-xs px-2 py-0.5 bg-cyan-50 text-cyan-600 rounded">🔊 {panel.soundEffect}</span>
          )}
        </div>

        {/* 动作 */}
        {panel.action && <p className="text-sm text-gray-700">{panel.action}</p>}

        {/* 字幕 */}
        {isComic && panel.subtitle && (
          <div className="bg-amber-50 border-l-2 border-amber-400 px-3 py-1">
            <p className="text-sm text-amber-700 font-medium">📝 {panel.subtitle}</p>
          </div>
        )}

        {/* 内心OS */}
        {isComic && panel.innerThought && (
          <div className="bg-pink-50 border border-pink-200 rounded-lg px-3 py-1.5 italic">
            <p className="text-sm text-pink-600">💭 {panel.innerThought}</p>
          </div>
        )}

        {/* 对话气泡 */}
        {isComic && panel.dialogue && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 relative">
            <div className="absolute -top-1.5 left-4 w-3 h-3 bg-purple-50 border-t border-l border-purple-200 transform rotate-45" />
            <p className="text-sm text-purple-700 font-medium">💬 {panel.dialogue}</p>
          </div>
        )}
      </div>
      <button onClick={onEdit} className="flex-shrink-0 text-gray-400 hover:text-accent-500 transition-colors p-1">
        ✎
      </button>
    </div>
  );
}

function PanelEditor({
  panel, onSave, onCancel, saving, isComic,
}: {
  panel: Panel; onSave: (data: Partial<Panel>) => void; onCancel: () => void; saving: boolean; isComic: boolean;
}) {
  const [scene, setScene] = useState(panel.scene || '');
  const [action, setAction] = useState(panel.action || '');
  const [dialogue, setDialogue] = useState(panel.dialogue || '');
  const [camera, setCamera] = useState(panel.camera || (isComic ? '中景' : '固定镜头'));
  const [subtitle, setSubtitle] = useState(panel.subtitle || '');
  const [innerThought, setInnerThought] = useState(panel.innerThought || '');
  const [emotion, setEmotion] = useState(panel.emotion || '');
  const [soundEffect, setSoundEffect] = useState(panel.soundEffect || '');

  const cameras = isComic
    ? ['远景', '中景', '特写', '全景', '仰视', '俯视', '平视全景', '俯拍特写', '面部大特写', '手部动态特写', '近景双人对峙', '侧面全景', '正面平视']
    : ['固定镜头', '远景缓推', '中景跟拍', '特写', '摇镜', '俯拍', '仰拍旋转'];

  const handleSave = () => {
    const data: Partial<Panel> = { scene, action, dialogue, camera };
    if (isComic) {
      data.subtitle = subtitle;
      data.innerThought = innerThought;
      data.emotion = emotion;
      data.soundEffect = soundEffect;
    }
    onSave(data);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm text-gray-700">
          {isComic ? '第' : '场景'} {panel.index + 1}{isComic ? ' 格' : ''}
        </span>
        <select value={camera} onChange={(e) => setCamera(e.target.value)} className="text-xs input-field w-auto py-1">
          {cameras.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
      </div>
      <label className="text-xs text-gray-500 font-medium">画面（场景视觉描述）</label>
      <textarea className="input-field min-h-[80px] text-sm" value={scene} onChange={(e) => setScene(e.target.value)} placeholder="详细描述场景环境、角色位置、表情、构图、光影..." />
      <label className="text-xs text-gray-500 font-medium">动作</label>
      <input className="input-field" value={action} onChange={(e) => setAction(e.target.value)} placeholder="角色具体动作描述..." />
      {isComic && (
        <>
          <label className="text-xs text-gray-500 font-medium">台词（对话框内容）</label>
          <input className="input-field" value={dialogue} onChange={(e) => setDialogue(e.target.value)} placeholder="标注说话人，例如：老板：看来你工作很轻松啊" />
          <label className="text-xs text-gray-500 font-medium">字幕（屏幕文字）</label>
          <input className="input-field" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="画面叠加文字，无则留空" />
          <label className="text-xs text-gray-500 font-medium">内心OS（角色内心独白）</label>
          <input className="input-field" value={innerThought} onChange={(e) => setInnerThought(e.target.value)} placeholder="角色的内心吐槽..." />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 font-medium">情绪/笑点</label>
              <input className="input-field" value={emotion} onChange={(e) => setEmotion(e.target.value)} placeholder="例如：反差笑点、猝不及防" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">音效</label>
              <input className="input-field" value={soundEffect} onChange={(e) => setSoundEffect(e.target.value)} placeholder="例如：心跳加速" />
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">保存</button>
        <button onClick={onCancel} className="btn-secondary text-sm">取消</button>
      </div>
    </div>
  );
}
