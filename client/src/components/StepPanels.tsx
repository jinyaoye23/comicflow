import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generatePanels, regeneratePanel, updatePanel } from '../services/api';
import { toast } from './Toast';
import { usePipelineStore } from '../stores/pipeline';
import type { Project, Panel, Character } from '../services/api';

interface Props {
  project: Project;
}

export function StepPanels({ project }: Props) {
  const queryClient = useQueryClient();
  const setStep = usePipelineStore((s) => s.setStep);
  const [charBindings, setCharBindings] = useState<Record<string, string[]>>({});
  const [failedPanelIds, setFailedPanelIds] = useState<Set<string>>(new Set());
  // 正在重试的格子 ID 集合
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const isComic = project.scriptType === 'COMIC';
  const panels = project.panels || [];

  // 初始化 charBindings（从后端已有数据回填）
  useEffect(() => {
    const init: Record<string, string[]> = {};
    panels.forEach((p) => {
      try {
        if (p.charIds) {
          const ids = typeof p.charIds === 'string' ? JSON.parse(p.charIds) : p.charIds;
          if (Array.isArray(ids) && ids.length > 0) init[p.id] = ids;
        }
      } catch {}
    });
    if (Object.keys(init).length > 0) setCharBindings((prev) => ({ ...init, ...prev }));
  }, [panels.map((p) => p.id + p.charIds).join(',')]);

  // 批量生成
  const genAllMutation = useMutation({
    mutationFn: () => generatePanels(project.id),
    onSuccess: (data) => {
      const failed = (data.panels || []).filter((p: any) => p.failed || p.error).map((p: any) => p.id);
      setFailedPanelIds(new Set(failed));

      // 直接更新缓存中的 panel 数据（避免 staleTime 导致 UI 不刷新）
      queryClient.setQueryData(['project', project.id], (old: Project | undefined) => {
        if (!old) return old;
        return {
          ...old,
          panels: old.panels.map((p) => {
            const updated = data.panels.find((up: any) => up.id === p.id);
            if (!updated) return p;
            if (updated.failed || updated.error) return p; // 失败的保持原样
            return { ...p, imagePath: updated.imagePath, prompt: updated.prompt };
          }),
        };
      });

      // 同时 invalidate 确保后端最新数据（静默刷新）
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });

      const successCount = panels.length - failed.length;
      if (failed.length === 0) {
        toast('success', `全部 ${successCount} 格生成完成！`);
      } else {
        toast('warning', `${successCount} 格成功 · ${failed.length} 格失败，可点击重试`);
      }
    },
    onError: () => toast('error', '批量生成失败，请检查网络后重试'),
  });

  // 单格重试
  const retryMutation = useMutation({
    mutationFn: (panelId: string) => {
      setRetryingIds((prev) => new Set(prev).add(panelId));
      return regeneratePanel(project.id, panelId);
    },
    onSuccess: (updatedPanel, panelId) => {
      setFailedPanelIds((prev) => {
        const next = new Set(prev);
        next.delete(panelId);
        return next;
      });
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(panelId);
        return next;
      });

      // 直接更新缓存中这一格的数据
      queryClient.setQueryData(['project', project.id], (old: Project | undefined) => {
        if (!old) return old;
        return {
          ...old,
          panels: old.panels.map((p) =>
            p.id === panelId ? { ...p, imagePath: updatedPanel.imagePath, prompt: updatedPanel.prompt } : p
          ),
        };
      });

      // 静默刷新确保一致性
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
    onError: (_err, panelId) => {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(panelId);
        return next;
      });
      toast('error', `第 ${panels.findIndex((p) => p.id === panelId) + 1} 格重试失败`);
    },
  });

  const retryAllFailed = useCallback(() => {
    failedPanelIds.forEach((id) => retryMutation.mutate(id));
  }, [failedPanelIds]);

  const toggleCharBinding = (panelId: string, charId: string) => {
    setCharBindings((prev) => {
      const current = prev[panelId] || [];
      const next = current.includes(charId)
        ? current.filter((id) => id !== charId)
        : [...current, charId];
      updatePanel(project.id, panelId, { charIds: JSON.stringify(next) });
      return { ...prev, [panelId]: next };
    });
  };

  const generatedCount = panels.filter((p) => p.imagePath).length;
  const isBulkGenerating = genAllMutation.isPending;

  if (panels.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-5xl mb-3">🎨</div>
        <p className="text-lg font-medium text-gray-600">还没有分镜</p>
        <p className="text-sm mt-1">请先在脚本编辑中生成脚本</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部操作栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            {isComic ? '漫画分镜生成' : '故事板生成'}
          </h3>
          {/* 进度计数 */}
          {generatedCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              已生成 <span className="font-medium text-accent-600">{generatedCount}</span>/{panels.length} 格
              {failedPanelIds.size > 0 && (
                <span className="text-red-500 ml-2">· {failedPanelIds.size} 格失败</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {failedPanelIds.size > 0 && (
            <button
              onClick={retryAllFailed}
              disabled={retryMutation.isPending}
              className="btn-secondary text-amber-600 border-amber-300 bg-amber-50 text-sm"
            >
              {retryMutation.isPending ? '重试中...' : `⚠ 重试 ${failedPanelIds.size} 个失败项`}
            </button>
          )}
          <button
            onClick={() => genAllMutation.mutate()}
            disabled={isBulkGenerating}
            className="btn-primary"
          >
            {isBulkGenerating ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                生成中...
              </span>
            ) : generatedCount > 0 ? (
              `🖼 重新生成全部（${panels.length} 格）`
            ) : (
              `🖼 批量生成全部（${panels.length} 格）`
            )}
          </button>
          {generatedCount === panels.length && failedPanelIds.size === 0 && (
            <button onClick={() => setStep('video')} className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-sm">
              下一步：视频生成 →
            </button>
          )}
        </div>
      </div>

      {/* 角色绑定提示 */}
      {project.characters.length > 0 && (
        <div className="card p-3 bg-accent-50/50 border-accent-200">
          <p className="text-xs text-accent-700 font-medium mb-2">
            💡 点击格子下方角色标签绑定角色，绑定后 AI 会保持角色外貌一致
          </p>
          <div className="flex flex-wrap gap-1.5">
            {project.characters.map((ch: Character) => (
              <span
                key={ch.id}
                className="text-xs px-2 py-1 rounded-full bg-white border border-accent-200 text-accent-600 font-medium"
              >
                {ch.name} {ch.imagePath ? '✓' : '○'}
              </span>
            ))}
            <span className="text-xs text-gray-400 ml-1">
              (✓ = 已有参考图，img2img 效果更好)
            </span>
          </div>
        </div>
      )}

      {/* 分镜网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {panels.map((panel: Panel) => {
          const isFailed = failedPanelIds.has(panel.id);
          const isRetrying = retryingIds.has(panel.id);
          const hasImage = !!panel.imagePath;

          return (
            <div
              key={panel.id}
              className={`card overflow-hidden transition-all duration-300 ${
                isBulkGenerating ? 'panel-generating ring-2 ring-indigo-300' : ''
              } ${isFailed ? 'ring-2 ring-red-300' : ''} ${isRetrying ? 'ring-2 ring-amber-300' : ''}`}
            >
              {/* Panel Image */}
              <div className="aspect-[3/4] bg-gray-100 relative">
                {hasImage ? (
                  <>
                    <img
                      src={panel.imagePath}
                      alt={`Panel ${panel.index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* 漫画模式覆盖层 */}
                    {isComic && panel.subtitle && (
                      <div className="absolute top-3 left-3 right-3 bg-amber-500/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-lg">
                        <p className="text-xs font-bold text-white text-center tracking-wider">{panel.subtitle}</p>
                      </div>
                    )}
                    {isComic && panel.dialogue && (
                      <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm border-2 border-purple-300 rounded-xl px-3 py-2 shadow-lg">
                        <div className="absolute -top-2 left-5 w-3 h-3 bg-white border-t-2 border-l-2 border-purple-300 transform rotate-45" />
                        <p className="text-sm font-medium text-purple-800 leading-tight">{panel.dialogue}</p>
                      </div>
                    )}
                    {isComic && panel.innerThought && !panel.dialogue && (
                      <div className="absolute top-1/3 left-3 right-3 bg-pink-100/80 backdrop-blur-sm border border-pink-300 rounded-lg px-3 py-1.5 shadow">
                        <p className="text-xs text-pink-600 italic">💭 {panel.innerThought}</p>
                      </div>
                    )}
                    {!isComic && panel.scene && (
                      <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5">
                        <p className="text-xs text-white/90 font-medium">🎬 {panel.scene}</p>
                      </div>
                    )}
                  </>
                ) : isBulkGenerating ? (
                  /* 批量生成中 — 每格独立动画 */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-50">
                    <div className="relative w-12 h-12 mb-3">
                      <div className="absolute inset-0 rounded-full border-3 border-indigo-200 animate-spin border-t-indigo-500" />
                    </div>
                    <span className="text-sm font-medium text-indigo-600">AI 绘图中...</span>
                    <span className="text-xs text-indigo-400 mt-1">第 {panel.index + 1} 格</span>
                  </div>
                ) : isRetrying ? (
                  /* 单格重试中 */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50">
                    <div className="relative w-12 h-12 mb-3">
                      <div className="absolute inset-0 rounded-full border-3 border-amber-200 animate-spin border-t-amber-500" />
                    </div>
                    <span className="text-sm font-medium text-amber-600">重试中...</span>
                  </div>
                ) : isFailed ? (
                  /* 失败态 */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                    <span className="text-4xl mb-2">❌</span>
                    <span className="text-sm font-medium text-red-600">生成失败</span>
                    <span className="text-xs text-red-400 mt-1">网络超时或 API 错误</span>
                    <button
                      onClick={() => retryMutation.mutate(panel.id)}
                      className="mt-3 text-xs px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
                    >
                      🔄 重试此格
                    </button>
                  </div>
                ) : (
                  /* 未生成 */
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                    <span className="text-4xl mb-1">🖼</span>
                    <span className="text-sm text-gray-400">第 {panel.index + 1} 格</span>
                    <span className="text-xs text-gray-300 mt-1">点击上方按钮批量生成</span>
                  </div>
                )}

                {/* 重绘按钮（已有图片时显示） */}
                {hasImage && !isRetrying && (
                  <button
                    onClick={() => retryMutation.mutate(panel.id)}
                    disabled={isRetrying}
                    className="absolute top-2 right-2 text-xs px-2 py-1 rounded shadow bg-white/90 hover:bg-white text-gray-700 transition-colors"
                  >
                    🔄 重绘
                  </button>
                )}
              </div>

              {/* Panel Info */}
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-sm text-gray-700">
                    {isComic ? '第' : '场景'} {panel.index + 1}{isComic ? ' 格' : ''}
                  </span>
                  {/* 状态徽标 */}
                  {isBulkGenerating && <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full">⏳ 生成中</span>}
                  {isRetrying && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded-full">🔄 重试中</span>}
                  {hasImage && !isBulkGenerating && !isRetrying && <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded-full">✅ 已完成</span>}
                  {isFailed && !isBulkGenerating && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">❌ 失败</span>}
                  {panel.camera && (
                    <span className="text-xs text-gray-400">{isComic ? '📷' : '🎥'} {panel.camera}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {panel.emotion && <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">😂 {panel.emotion}</span>}
                  {panel.soundEffect && <span className="text-xs px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded">🔊 {panel.soundEffect}</span>}
                  {panel.dialogue && <span className="text-xs text-purple-600 truncate max-w-[200px]">💬 {panel.dialogue}</span>}
                </div>

                {/* Character Binding Tags */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {project.characters.map((ch: Character) => {
                    const bound = charBindings[panel.id]?.includes(ch.id);
                    return (
                      <button
                        key={ch.id}
                        onClick={() => toggleCharBinding(panel.id, ch.id)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                          bound
                            ? 'bg-accent-500 text-white border-accent-500 shadow-sm'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-accent-300 hover:text-gray-600'
                        }`}
                      >
                        {ch.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
