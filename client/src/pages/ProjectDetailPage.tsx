import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProject } from '../services/api';
import { usePipelineStore, PipelineStep } from '../stores/pipeline';
import { StepScript } from '../components/StepScript';
import { StepCharacters } from '../components/StepCharacters';
import { StepPanels } from '../components/StepPanels';
import { StepVideo } from '../components/StepVideo';
import { StepExport } from '../components/StepExport';
import type { Project } from '../services/api';

// 步骤定义
const stepDefs: { key: PipelineStep; label: string; desc: string; icon: string }[] = [
  { key: 'script',     label: '脚本', desc: 'AI 生成分镜脚本', icon: '📝' },
  { key: 'characters', label: '角色', desc: '设计角色形象',   icon: '👤' },
  { key: 'panels',     label: '分镜', desc: '逐格生成漫画图', icon: '🎨' },
  { key: 'video',      label: '视频', desc: '合成动画视频',   icon: '🎬' },
  { key: 'export',     label: '导出', desc: '下载成品',       icon: '📦' },
];

// 判断每个步骤的完成状态
function getStepStatus(project: Project, step: PipelineStep): 'done' | 'active' | 'pending' {
  const hasScript = !!project.script && (project.panels?.length || 0) > 0;
  const hasCharImages = project.characters?.some((c) => c.imagePath);
  const hasPanelImages = project.panels?.some((p) => p.imagePath);
  const hasAllPanels = hasPanelImages && project.panels?.every((p) => p.imagePath);
  const videoDone = project.status === 'COMPLETED';

  switch (step) {
    case 'script':     return hasScript ? 'done' : 'pending';
    case 'characters': return hasCharImages ? 'done' : hasScript ? 'active' : 'pending';
    case 'panels':     return hasAllPanels ? 'done' : hasScript ? 'active' : 'pending';
    case 'video':      return videoDone ? 'done' : hasPanelImages ? 'active' : 'pending';
    case 'export':     return videoDone || hasAllPanels ? 'active' : 'pending';
  }
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { step, setStep } = usePipelineStore();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-accent-300 border-t-accent-600 rounded-full animate-spin" />
          <span className="text-gray-400 text-lg">加载项目...</span>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-red-500 text-center">
          <div className="text-4xl mb-3">😵</div>
          <p className="text-lg font-medium">项目加载失败</p>
          <p className="text-sm text-red-400 mt-1">请检查项目 ID 是否正确</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Project Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-50 text-accent-600 font-medium">
            {project.style || '未设置'}
          </span>
        </div>
        {project.genre && (
          <p className="text-sm text-gray-500">{project.genre}</p>
        )}
      </div>

      {/* ===== 步骤导航（增强版）===== */}
      <div className="card mb-8 overflow-hidden">
        <div className="flex">
          {stepDefs.map((s, i) => {
            const status = getStepStatus(project, s.key);
            const isCurrent = step === s.key;
            const isClickable = status === 'done' || status === 'active';

            return (
              <button
                key={s.key}
                onClick={() => isClickable && setStep(s.key)}
                disabled={!isClickable}
                className={`flex-1 flex items-center gap-2 px-3 py-3 transition-all duration-200 relative ${
                  !isClickable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-50'
                }`}
              >
                {/* 左侧连接线 */}
                {i > 0 && (
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 rounded -ml-px ${
                    status === 'done' ? 'bg-emerald-400' : 'bg-gray-200'
                  }`} />
                )}

                {/* 图标 + 标签 */}
                <div className="flex flex-col items-center w-full gap-1">
                  <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all duration-200 ${
                    isCurrent
                      ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/25 scale-110'
                      : status === 'done'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {isCurrent ? s.icon : status === 'done' ? '✓' : s.icon}
                  </div>
                  <span className={`text-xs font-medium transition-colors ${
                    isCurrent ? 'text-indigo-700' : status === 'done' ? 'text-emerald-700' : 'text-gray-500'
                  }`}>
                    {s.label}
                  </span>

                  {/* 状态指示圆点 */}
                  {isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  )}
                  {status === 'done' && !isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 当前步骤进度条 */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500 rounded-r"
            style={{
              width: `${
                (stepDefs.findIndex((s) => s.key === step) + 1) * (100 / stepDefs.length)
              }%`,
            }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="card p-6 min-h-[400px]">
        {step === 'script' && <StepScript project={project} />}
        {step === 'characters' && <StepCharacters project={project} />}
        {step === 'panels' && <StepPanels project={project} />}
        {step === 'video' && <StepVideo project={project} />}
        {step === 'export' && <StepExport project={project} />}
      </div>
    </div>
  );
}
