import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { generateVideo, getVideoStatus, resetVideoTask } from '../services/api';
import { usePipelineStore } from '../stores/pipeline';
import { toast } from './Toast';
import type { Project, Panel } from '../services/api';

interface Props {
  project: Project;
}

export function StepVideo({ project }: Props) {
  const queryClient = useQueryClient();
  const setStep = usePipelineStore((s) => s.setStep);
  const isComic = project.scriptType === 'COMIC';
  const hasScript = !!project.script;
  const panels = project.panels || [];

  // ===== 视频状态查询（轮询）=====
  const videoStatusQuery = useQuery({
    queryKey: ['video', project.id],
    queryFn: () => getVideoStatus(project.id),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return 5000;
      if (d.status === 'GENERATING') return 5000;
      return false;
    },
    refetchOnWindowFocus: true,
  });

  const videoStatus = videoStatusQuery.data;
  const isGenerating = videoStatus?.status === 'GENERATING';
  const isFailed = videoStatus?.status === 'FAILED';
  const isCompleted = videoStatus?.hasVideo;

  // ===== 发起生成 =====
  const genMutation = useMutation({
    mutationFn: () => generateVideo(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', project.id] });
      toast('info', '视频生成任务已提交，预计 3-8 分钟完成');
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['video', project.id] });
      toast('error', err.response?.data?.message || '提交失败，请重试');
    },
  });

  // ===== 清除失败任务 =====
  const resetMutation = useMutation({
    mutationFn: () => resetVideoTask(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', project.id] });
      toast('success', '已清除失败记录，可以重新生成');
    },
    onError: () => toast('error', '清除失败，请重试'),
  });

  // Prompt 展开/折叠
  const [promptExpanded, setPromptExpanded] = useState(false);

  // 进度文案
  const progressText = (() => {
    if (!isGenerating) return '';
    const agnesStatus = videoStatus?.agnesStatus;
    const progress = videoStatus?.agnesProgress;
    if (agnesStatus === 'queued') return '任务排队中，等待 AI 服务器资源...';
    if (typeof progress === 'number') return `AI 渲染中 ${progress}%...`;
    return 'AI 视频生成中（通常需 3-8 分钟）...';
  })();

  const hasPanels = panels.some((p) => p.imagePath);
  const generatedCount = panels.filter((p) => p.imagePath).length;

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div>
        <h2 className="text-xl font-bold mb-2">🎬 AI 视频生成</h2>
        <p className="text-gray-600 text-sm mb-3">
          {isComic
            ? '根据漫画脚本，使用 AI 文生视频技术生成完整动态视频'
            : '根据视频脚本，使用 AI 文生视频技术生成完整影片片段'}
        </p>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          isComic ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {isComic ? '📖 漫画脚本 → 视频' : '🎬 故事板 → 视频'}
        </span>
      </div>

      {/* ===== 生成中大 UI ===== */}
      {isGenerating && (
        <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8">
          {/* 背景动画 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-blue-200/30 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-indigo-200/40 animate-ping" style={{ animationDuration: '2s' }} />
          </div>

          <div className="relative text-center space-y-5">
            <div className="flex justify-center">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-spin border-t-blue-500" />
                <div className="absolute inset-2 rounded-full border-4 border-indigo-200 animate-spin border-t-indigo-500" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }} />
                <div className="absolute inset-0 flex items-center justify-center text-3xl">🎬</div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-blue-900 mb-1">AI 正在生成视频</h3>
              <p className="text-blue-700 text-sm font-medium">{progressText}</p>
            </div>

            {/* 进度条 */}
            {typeof videoStatus?.agnesProgress === 'number' ? (
              <div className="w-full max-w-md mx-auto">
                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${videoStatus.agnesProgress}%` }}
                  />
                </div>
                <p className="text-xs text-blue-600 mt-1">{videoStatus.agnesProgress}%</p>
              </div>
            ) : (
              <div className="w-full max-w-md mx-auto">
                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-[slide_2s_ease-in-out_infinite]" />
                </div>
              </div>
            )}

            {videoStatus?.videoTaskId && (
              <p className="text-xs text-blue-400 font-mono">
                任务 ID: {videoStatus.videoTaskId}
              </p>
            )}

            {videoStatus?.videoPrompt && <PromptBlock prompt={videoStatus.videoPrompt} expanded={promptExpanded} onToggle={() => setPromptExpanded(!promptExpanded)} />}

            <div className="flex items-center justify-center gap-2 text-xs text-blue-600">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              实时轮询中，离开页面后状态仍然保留，回来即可续看
            </div>
          </div>
        </div>
      )}

      {/* ===== 生成中/完成时的分镜预览（保持可见）===== */}
      {(isGenerating || isCompleted) && hasPanels && (
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            分镜参考（{generatedCount}/{panels.length} 格）
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {panels.filter((p) => p.imagePath).slice(0, 6).map((panel: Panel) => (
              <div key={panel.id} className="rounded-lg overflow-hidden border-2 border-emerald-200 shadow-sm aspect-[3/4]">
                <img
                  src={panel.imagePath!}
                  alt={`${isComic ? '分镜' : '场景'} ${panel.index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 失败 UI ===== */}
      {isFailed && !isGenerating && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0">❌</div>
            <div className="flex-1">
              <h3 className="font-bold text-red-800 mb-1">视频生成失败</h3>
              <p className="text-sm text-red-600 mb-4">
                {videoStatus?.message || 'AI 视频生成过程中出现错误，请重试。'}
              </p>
              {videoStatus?.videoTaskId && (
                <p className="text-xs text-red-400 font-mono mb-4">
                  失败任务 ID: {videoStatus.videoTaskId}
                </p>
              )}
              {videoStatus?.videoPrompt && <PromptBlock prompt={videoStatus.videoPrompt} expanded={promptExpanded} onToggle={() => setPromptExpanded(!promptExpanded)} />}
              <div className="flex gap-3 mt-4">
                <button
                  disabled={resetMutation.isPending}
                  onClick={() => resetMutation.mutate()}
                  className="btn-secondary text-sm"
                >
                  {resetMutation.isPending ? '清除中...' : '🗑 清除记录'}
                </button>
                <button
                  disabled={!hasScript || genMutation.isPending || resetMutation.isPending}
                  onClick={() => genMutation.mutate()}
                  className="btn-primary text-sm"
                >
                  🔄 重新生成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 视频已完成：预览 + 下载 ===== */}
      {isCompleted && videoStatus?.videoPath && (
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden border-2 border-emerald-200 bg-black shadow-lg">
            <video
              src={videoStatus.videoPath}
              controls
              autoPlay
              className="w-full max-h-[500px]"
            >
              您的浏览器不支持视频播放
            </video>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <a
              href={videoStatus.videoPath}
              download={`${project.title || 'comicflow'}_video.mp4`}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700"
            >
              ⬇ 下载视频
            </a>
            <button
              disabled={genMutation.isPending}
              onClick={() => {
                if (confirm('确定要重新生成视频吗？当前视频将被覆盖。')) {
                  genMutation.mutate();
                }
              }}
              className="btn-secondary"
            >
              🔄 重新生成
            </button>
            <button onClick={() => setStep('export')} className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-sm">
              下一步：导出 →
            </button>
          </div>
          {videoStatus?.videoTaskId && (
            <p className="text-xs text-gray-400 font-mono">任务 ID: {videoStatus.videoTaskId}</p>
          )}
          {videoStatus?.videoPrompt && <PromptBlock prompt={videoStatus.videoPrompt} expanded={promptExpanded} onToggle={() => setPromptExpanded(!promptExpanded)} />}
        </div>
      )}

      {/* ===== 待生成：操作区 ===== */}
      {!isGenerating && !isCompleted && (
        <div className="space-y-4">
          {/* 分镜预览：放大到 2列 x 3行 网格 */}
          {hasPanels && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">
                {isComic ? '漫画分镜参考' : '故事板参考'}（共 {panels.length} 格，{generatedCount} 格已生成）
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {panels.filter((p) => p.imagePath).slice(0, 8).map((panel: Panel) => (
                  <div key={panel.id} className="rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-50 shadow-sm aspect-[3/4]">
                    <img
                      src={panel.imagePath!}
                      alt={`${isComic ? '分镜' : '场景'} ${panel.index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                      第 {panel.index + 1} 格
                    </div>
                  </div>
                ))}
                {/* 未生成的格子显示占位 */}
                {panels.filter((p) => !p.imagePath).slice(0, 4).map((panel: Panel) => (
                  <div key={panel.id} className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center aspect-[3/4]">
                    <span className="text-xs text-gray-300">第 {panel.index + 1} 格（未生成）</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 生成按钮区 */}
          <div className="card p-5 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-4 flex-wrap">
              <button
                disabled={!hasScript || genMutation.isPending}
                onClick={() => genMutation.mutate()}
                className="btn-primary disabled:opacity-50"
              >
                {genMutation.isPending ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    提交中...
                  </>
                ) : (
                  '🎬 AI 生成视频'
                )}
              </button>

              {!hasScript && (
                <span className="text-sm text-red-500">
                  ⚠ 请先在"脚本生成"步骤生成脚本
                </span>
              )}

              {genMutation.isError && (
                <span className="text-sm text-red-500">
                  ❌ 提交失败，请重试
                </span>
              )}
            </div>

            {/* 提交成功等待状态变化 */}
            {genMutation.isSuccess && !isGenerating && !isCompleted && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                任务已提交，等待状态更新...（如持续不更新请刷新页面）
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 技术说明 ===== */}
      <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <h4 className="font-bold mb-2">💡 技术说明</h4>
        <ul className="space-y-1 list-disc list-inside">
          <li>使用 <strong>Agnes Video V2.0</strong> AI 文生视频技术，无需上传图片</li>
          <li>视频时长约 5 秒（121 帧 / 24fps），支持电影感运镜</li>
          <li>{isComic ? '从漫画脚本提取场景描述 + universalPrompt 构建视频' : '从视频故事板场景列表构建视频 prompt'}</li>
          <li>任务 ID 持久化保存，<strong>离开页面后回来仍可查看生成状态</strong></li>
          <li>生成完成后自动下载保存至服务器，可随时播放和下载</li>
        </ul>
      </div>
    </div>
  );
}

// ===== Prompt 展示组件 =====
function PromptBlock({ prompt, expanded, onToggle }: { prompt: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="w-full max-w-lg mx-auto">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/50 hover:bg-white/80 border border-gray-200 transition-colors text-left"
      >
        <span className="text-xs font-medium text-gray-600">
          📝 生成提示词 {prompt.length > 40 ? `(${prompt.length} 字符)` : ''}
        </span>
        <span className="text-xs text-gray-400 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : '' }}>
          ▼
        </span>
      </button>
      {expanded && (
        <div className="mt-1 p-3 bg-white/80 rounded-lg border border-gray-200 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">
          {prompt}
        </div>
      )}
    </div>
  );
}
