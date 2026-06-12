import type { Project } from '../services/api';

interface Props {
  project: Project;
}

export function StepVideo({ project }: Props) {
  const hasImages = project.panels?.some((p) => p.imagePath);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">视频合成</h3>

      {!hasImages ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-5xl mb-3">🎥</div>
          <p className="text-lg font-medium text-gray-600">还没有分镜图</p>
          <p className="text-sm mt-1">请先在分镜生成中生成漫画图片</p>
        </div>
      ) : (
        <>
          {/* Preview */}
          <div className="card p-6">
            <div className="flex gap-2 overflow-x-auto pb-4">
              {project.panels
                .filter((p) => p.imagePath)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex-shrink-0 w-36 aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden"
                  >
                    <img
                      src={p.imagePath!}
                      alt={`Panel ${p.index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
            </div>
          </div>

          {/* Placeholder */}
          <div className="card p-8 text-center">
            <div className="text-4xl mb-3">🚧</div>
            <p className="text-gray-500">
              Ken Burns 运镜视频合成功能即将实现
            </p>
            <p className="text-xs text-gray-400 mt-2">
              将使用 FFmpeg.wasm 在浏览器端合成视频，无需服务器参与
            </p>
          </div>
        </>
      )}
    </div>
  );
}
