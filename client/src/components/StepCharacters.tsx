import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateCharacterImage } from '../services/api';
import type { Project, Character } from '../services/api';

interface Props {
  project: Project;
}

export function StepCharacters({ project }: Props) {
  const queryClient = useQueryClient();

  const genMutation = useMutation({
    mutationFn: (charId: string) => generateCharacterImage(project.id, charId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
  });

  if (!project.characters || project.characters.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-5xl mb-3">👤</div>
        <p className="text-lg font-medium text-gray-600">还没有角色</p>
        <p className="text-sm mt-1">请先在脚本编辑中生成脚本和角色</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">
        角色设计
        <span className="text-sm font-normal text-gray-400 ml-2">
          (点击生成角色参考图，用于后续分镜保持一致性)
        </span>
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {project.characters.map((ch: Character) => (
          <div key={ch.id} className="card p-4">
            <div className="flex items-start gap-4">
              {/* Character image */}
              <div className="flex-shrink-0 w-24 h-32 bg-gray-100 rounded-lg overflow-hidden">
                {ch.imagePath ? (
                  <img
                    src={ch.imagePath}
                    alt={ch.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">
                    ?
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900">{ch.name}</h4>
                <p className="text-xs text-gray-500 mt-1 line-clamp-3">{ch.description}</p>

                <button
                  onClick={() => genMutation.mutate(ch.id)}
                  disabled={genMutation.isPending}
                  className="btn-primary text-xs mt-3"
                >
                  {genMutation.isPending ? '生成中...' : ch.imagePath ? '🔄 重新生成' : '🎨 生成参考图'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
