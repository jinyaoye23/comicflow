import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProject } from '../services/api';
import { usePipelineStore, PipelineStep } from '../stores/pipeline';
import { StepScript } from '../components/StepScript';
import { StepCharacters } from '../components/StepCharacters';
import { StepPanels } from '../components/StepPanels';
import { StepVideo } from '../components/StepVideo';
import { StepExport } from '../components/StepExport';

const steps: { key: PipelineStep; label: string; desc: string }[] = [
  { key: 'script', label: '1. 脚本', desc: 'AI 生成分镜脚本' },
  { key: 'characters', label: '2. 角色', desc: '设计角色形象' },
  { key: 'panels', label: '3. 分镜', desc: '逐格生成漫画图' },
  { key: 'video', label: '4. 视频', desc: '合成动画视频' },
  { key: 'export', label: '5. 导出', desc: '下载成品' },
];

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
        <div className="text-gray-400 text-lg">加载项目...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-red-500">项目加载失败</div>
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

      {/* Step Indicator */}
      <div className="card p-2 mb-8">
        <div className="flex flex-wrap gap-1">
          {steps.map((s) => (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className="step-indicator flex-1 min-w-[100px] justify-center"
              data-active={step === s.key ? 'true' : undefined}
              style={{
                backgroundColor:
                  step === s.key
                    ? '#4f46e5'
                    : project.status === 'COMPLETED' || steps.findIndex((x) => x.key === s.key) < steps.findIndex((x) => x.key === step)
                    ? '#eef2ff'
                    : '#f3f4f6',
                color:
                  step === s.key
                    ? '#fff'
                    : project.status === 'COMPLETED' || steps.findIndex((x) => x.key === s.key) < steps.findIndex((x) => x.key === step)
                    ? '#4338ca'
                    : '#9ca3af',
              }}
            >
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.key === 'script' ? '1' : s.key === 'characters' ? '2' : s.key === 'panels' ? '3' : s.key === 'video' ? '4' : '5'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="card p-6 min-h-[400px]">
        {step === 'script' && <StepScript project={project} onScriptReady={() => setStep('characters')} />}
        {step === 'characters' && <StepCharacters project={project} />}
        {step === 'panels' && <StepPanels project={project} />}
        {step === 'video' && <StepVideo project={project} />}
        {step === 'export' && <StepExport project={project} />}
      </div>
    </div>
  );
}
