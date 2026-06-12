import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateScript, updatePanel } from '../services/api';
import type { Project, Panel } from '../services/api';

interface Props {
  project: Project;
  onScriptReady: () => void;
}

export function StepScript({ project, onScriptReady }: Props) {
  const queryClient = useQueryClient();
  const [idea, setIdea] = useState('');
  const [error, setError] = useState<string | null>(null);

  const genMutation = useMutation({
    mutationFn: (text: string) => generateScript(project.id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      onScriptReady();
    },
    onError: (err: any) => setError(err.response?.data?.message || err.message || '脚本生成失败'),
  });

  const handleGenerate = () => {
    if (!idea.trim()) return;
    setError(null);
    genMutation.mutate(idea);
  };

  const hasScript = project.script && project.panels?.length > 0;

  return (
    <div className="space-y-6">
      {/* Idea Input */}
      <div>
        <h3 className="text-lg font-semibold mb-3">输入你的创意</h3>
        <textarea
          className="input-field min-h-[100px]"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="描述你想创作的故事...&#10;&#10;例如：一个赛博朋克世界的咖啡馆里，年轻女咖啡师和怀旧老板的日常故事。4格漫画，日系风格。"
          disabled={genMutation.isPending}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleGenerate}
            disabled={!idea.trim() || genMutation.isPending}
            className="btn-primary"
          >
            {genMutation.isPending ? 'AI 正在创作脚本...' : '🤖 AI 生成脚本'}
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

      {/* Script Display */}
      {hasScript && (
        <ScriptDisplay project={project} queryClient={queryClient} />
      )}

      {!hasScript && !genMutation.isPending && (
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
    },
  });

  return (
    <div className="space-y-6">
      {/* Characters Summary */}
      {script.characters?.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">角色列表</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {script.characters.map((ch: any, i: number) => (
              <div key={i} className="card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{ch.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-accent-50 text-accent-600 rounded">
                    {ch.role || '角色'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">{ch.appearance}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panels */}
      <div>
        <h3 className="text-lg font-semibold mb-3">
          分镜脚本
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({project.panels?.length || 0} 格)
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
                />
              ) : (
                <PanelCard panel={panel} onEdit={() => setEditingPanel(panel.id)} index={0} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelCard({ panel, onEdit, index }: { panel: Panel; onEdit: () => void; index: number }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center font-bold text-sm">
        {panel.index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-2 mb-1.5">
          {panel.scene && <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">🏞 {panel.scene}</span>}
          {panel.camera && <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">📷 {panel.camera}</span>}
        </div>
        <p className="text-sm text-gray-700">{panel.action}</p>
        {panel.dialogue && (
          <p className="text-sm text-accent-600 font-medium mt-1">{panel.dialogue}</p>
        )}
      </div>
      <button onClick={onEdit} className="flex-shrink-0 text-gray-400 hover:text-accent-500 transition-colors p-1">
        ✎
      </button>
    </div>
  );
}

function PanelEditor({
  panel,
  onSave,
  onCancel,
  saving,
}: {
  panel: Panel;
  onSave: (data: Partial<Panel>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [scene, setScene] = useState(panel.scene || '');
  const [action, setAction] = useState(panel.action || '');
  const [dialogue, setDialogue] = useState(panel.dialogue || '');
  const [camera, setCamera] = useState(panel.camera || '中景');

  const cameras = ['远景', '中景', '特写', '全景', '仰视', '俯视'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-gray-700">第 {panel.index + 1} 格</span>
        <select
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
          className="text-xs input-field w-auto py-1"
        >
          {cameras.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <input
        className="input-field"
        value={scene}
        onChange={(e) => setScene(e.target.value)}
        placeholder="场景描述..."
      />
      <textarea
        className="input-field min-h-[60px]"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder="角色动作..."
      />
      <input
        className="input-field"
        value={dialogue}
        onChange={(e) => setDialogue(e.target.value)}
        placeholder="台词..."
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ scene, action, dialogue, camera })}
          disabled={saving}
          className="btn-primary text-sm"
        >
          保存
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">
          取消
        </button>
      </div>
    </div>
  );
}
