import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createProject, listProjects, deleteProject, Project } from '../services/api';

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [style, setStyle] = useState('日系少年');
  const [creating, setCreating] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const createMutation = useMutation({
    mutationFn: () => createProject({ title: title || '未命名项目', genre: genre || undefined, style }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/project/${project.id}`);
    },
    onSettled: () => setCreating(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    createMutation.mutate();
  };

  const styles = ['日系少年', '日系少女', '美漫', '水墨', '赛博朋克', '萌系', '复古', '极简'];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          用 AI 创作你的漫画
        </h1>
        <p className="text-lg text-gray-500 max-w-lg mx-auto">
          输入一个想法，AI 自动完成脚本 → 角色 → 分镜 → 视频，一条龙创作。
        </p>
      </div>

      {/* Create Form */}
      <form onSubmit={handleCreate} className="card p-6 mb-10">
        <h2 className="text-lg font-semibold mb-4">创建新项目</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
            <input
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：赛博朋克悬疑短篇"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
              <input
                className="input-field"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="悬疑 / 日常 / 科幻 / ..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">风格</label>
              <select
                className="input-field"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              >
                {styles.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <button type="submit" disabled={creating} className="btn-primary mt-6 w-full">
          {creating ? '创建中...' : '创建项目并开始创作'}
        </button>
      </form>

      {/* Project List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          我的项目
          {projects && projects.length > 0 && (
            <span className="text-sm font-normal text-gray-400 ml-2">({projects.length})</span>
          )}
        </h2>
        {isLoading ? (
          <div className="text-gray-400 text-center py-8">加载中...</div>
        ) : !projects || projects.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3">🎬</div>
            <p>还没有项目，创建第一个吧</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p: Project) => (
              <div
                key={p.id}
                className="card p-4 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{p.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      {p.genre && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-500">
                          {p.genre}
                        </span>
                      )}
                      {p.style && (
                        <span className="text-xs px-2 py-0.5 bg-accent-50 rounded text-accent-600">
                          {p.style}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('确定删除此项目？')) deleteMutation.mutate(p.id);
                    }}
                    className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-3">
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-gray-400">
                    {p.panels?.length || 0} 格 · {p.characters?.length || 0} 角色
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: '草稿', cls: 'bg-gray-100 text-gray-600' },
    GENERATING: { label: '生成中', cls: 'bg-yellow-100 text-yellow-700' },
    COMPLETED: { label: '已完成', cls: 'bg-green-100 text-green-700' },
    FAILED: { label: '失败', cls: 'bg-red-100 text-red-600' },
  };
  const item = map[status] || map.DRAFT;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.cls}`}>
      {item.label}
    </span>
  );
}
