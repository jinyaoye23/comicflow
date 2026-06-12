import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generatePanels, regeneratePanel, updatePanel } from '../services/api';
import type { Project, Panel, Character } from '../services/api';

interface Props {
  project: Project;
}

export function StepPanels({ project }: Props) {
  const queryClient = useQueryClient();
  const [charBindings, setCharBindings] = useState<Record<string, string[]>>({});
  const [failedPanels, setFailedPanels] = useState<string[]>([]); // panel IDs that failed

  const genAllMutation = useMutation({
    mutationFn: () => generatePanels(project.id),
    onSuccess: (data) => {
      // Check which panels failed
      const failed = data.panels.filter((p: any) => p.failed || p.error).map((p: any) => p.id);
      setFailedPanels(failed);
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (panelId: string) => regeneratePanel(project.id, panelId),
    onSuccess: (_data, panelId) => {
      // Remove from failed list on success
      setFailedPanels((prev) => prev.filter((id) => id !== panelId));
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
  });

  const retryFailed = useCallback(() => {
    failedPanels.forEach((panelId) => retryMutation.mutate(panelId));
  }, [failedPanels]);

  const toggleCharBinding = (panelId: string, charId: string) => {
    setCharBindings((prev) => {
      const current = prev[panelId] || [];
      const next = current.includes(charId)
        ? current.filter((id) => id !== charId)
        : [...current, charId];
      const newBindings = { ...prev, [panelId]: next };

      // Persist to backend
      updatePanel(project.id, panelId, { charIds: JSON.stringify(next) });

      return newBindings;
    });
  };

  if (!project.panels || project.panels.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-5xl mb-3">🎨</div>
        <p className="text-lg font-medium text-gray-600">还没有分镜</p>
        <p className="text-sm mt-1">请先在脚本编辑中生成脚本</p>
      </div>
    );
  }

  const anyGenerated = project.panels.some((p) => p.imagePath);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">分镜生成</h3>
        <div className="flex items-center gap-3">
          {failedPanels.length > 0 && (
            <button
              onClick={retryFailed}
              disabled={retryMutation.isPending}
              className="btn-secondary text-amber-600 border-amber-300 bg-amber-50 text-sm"
            >
              {retryMutation.isPending ? '重试中...' : `⚠ 重试 ${failedPanels.length} 个失败项`}
            </button>
          )}
          <button
            onClick={() => genAllMutation.mutate()}
            disabled={genAllMutation.isPending}
            className="btn-primary"
          >
            {genAllMutation.isPending ? '生成中...' : '🖼 批量生成全部分镜'}
          </button>
        </div>
      </div>

      {/* Character binding tags */}
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

      {/* Panel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {project.panels.map((panel: Panel) => {
          const isFailed = failedPanels.includes(panel.id);
          const isRetrying = retryMutation.isPending && retryMutation.variables === panel.id;
          return (
            <div key={panel.id} className={`card overflow-hidden ${isFailed ? 'ring-2 ring-red-300' : ''}`}>
            {/* Panel Image */}
            <div className="aspect-[3/4] bg-gray-100 relative">
              {panel.imagePath ? (
                <img
                  src={panel.imagePath}
                  alt={`Panel ${panel.index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : isFailed ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                  <span className="text-4xl mb-1">❌</span>
                  <span className="text-xs text-red-500 font-medium">生成失败</span>
                  <span className="text-xs text-red-400 mt-1">点击下方按钮重试</span>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                  <span className="text-4xl mb-1">🖼</span>
                  <span className="text-xs">第 {panel.index + 1} 格</span>
                </div>
              )}
              {/* Retry button — always visible */}
              <button
                onClick={() => retryMutation.mutate(panel.id)}
                disabled={isRetrying}
                className={`absolute top-2 right-2 text-xs px-2 py-1 rounded shadow transition-colors ${
                  isFailed
                    ? 'bg-red-100 hover:bg-red-200 text-red-700'
                    : 'bg-white/90 hover:bg-white text-gray-700'
                }`}
              >
                {isRetrying ? '⏳' : '🔄 重绘'}
              </button>
            </div>

            {/* Panel Info */}
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-gray-700">第 {panel.index + 1} 格</span>
                {panel.dialogue && (
                  <span className="text-xs text-accent-600 truncate">{panel.dialogue}</span>
                )}
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
                          ? 'bg-accent-500 text-white border-accent-500'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-accent-300'
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
