import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProject, generateVideo, getVideoStatus, Panel } from '../services/api';

interface Props {
  project: ReturnType<typeof getProject> extends Promise<infer T> ? T : never;
}

export function StepVideo({ project }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // 查询视频状态
  const videoStatusQuery = useQuery({
    queryKey: ['video', project.id],
    queryFn: () => getVideoStatus(project.id),
    refetchInterval: (query) => {
      // 每 5 秒刷新一次，直到视频生成完成
      const d = query.state.data;
      if (d?.hasVideo || d?.status === 'FAILED') return false;
      return 5000;
    },
  });

  // 生成视频 mutation
  const genMutation = useMutation({
    mutationFn: () => generateVideo(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', project.id] });
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || err.message || '视频生成失败');
    },
  });

  const panels = project.panels || [];
  const hasPanels = panels.filter((p: Panel) => p.imagePath).length > 0;
  const videoStatus = videoStatusQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">🎬 视频合成</h2>
        <p className="text-gray-600 text-sm mb-4">
          使用 AI 将分镜图合成为完整视频（Agnes 多图视频技术，无需拼接）
        </p>
      </div>

      {/* 分镜预览 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {panels.map((panel: Panel) => (
          <div
            key={panel.id}
            className={`rounded-lg overflow-hidden border-2 ${
              panel.imagePath ? 'border-green-200' : 'border-gray-200'
            }`}
          >
            {panel.imagePath ? (
              <img
                src={panel.imagePath}
                alt={`分镜 ${panel.index + 1}`}
                className="w-full aspect-[3/4] object-cover"
              />
            ) : (
              <div className="w-full aspect-[3/4] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                未生成
              </div>
            )}
            <div className="p-2 text-xs text-gray-500 text-center">
              分镜 {panel.index + 1}
            </div>
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          ❌ {error}
        </div>
      )}

      {/* 生成按钮 */}
      <div className="flex items-center gap-4">
        <button
          disabled={!hasPanels || genMutation.isPending}
          onClick={() => genMutation.mutate()}
          className="btn-primary disabled:opacity-50"
        >
          {genMutation.isPending ? (
            <>
              <span className="inline-block animate-spin mr-2">⏳</span>
              生成中...
            </>
          ) : videoStatus?.hasVideo ? (
            '🔄 重新生成视频'
          ) : (
            '🎬 生成视频'
          )}
        </button>

        {!hasPanels && (
          <span className="text-sm text-red-500">
            请先在"分镜生图"步骤生成分镜图片
          </span>
        )}
      </div>

      {/* 生成进度 */}
      {genMutation.isPending && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-block animate-spin text-2xl">⏳</span>
            <span className="font-medium text-blue-900">视频生成中...</span>
          </div>
          <p className="text-sm text-blue-700">
            正在使用 AI 将 {panels.filter((p: Panel) => p.imagePath).length} 张分镜图合成为视频，
            预计需要 2-5 分钟，请耐心等待...
          </p>
        </div>
      )}

      {/* 视频预览 */}
      {videoStatus?.hasVideo && videoStatus?.videoPath && (
        <div className="space-y-3">
          <h3 className="font-bold text-lg">🎥 生成完成！</h3>
          <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
            <video
              src={videoStatus.videoPath}
              controls
              className="w-full max-h-[600px]"
              autoPlay={false}
            >
              您的浏览器不支持视频播放
            </video>
          </div>
          <div className="flex gap-3">
            <a
              href={videoStatus.videoPath}
              download={`${project.title || 'comic'}_video.mp4`}
              className="btn-secondary"
            >
              ⬇ 下载视频
            </a>
            <button
              onClick={() => {
                const video = document.querySelector('video');
                if (video) video.play();
              }}
              className="btn-secondary"
            >
              ▶ 播放
            </button>
          </div>
        </div>
      )}

      {/* 技术说明 */}
      <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <h4 className="font-bold mb-2">💡 技术说明</h4>
        <ul className="space-y-1 list-disc list-inside">
          <li>使用 Agnes AI 多图视频 API，直接将多张分镜图合成为完整视频</li>
          <li>无需 FFmpeg 拼接，AI 自动处理过渡和运镜效果</li>
          <li>视频时长约 {Math.round((panels.filter((p: Panel) => p.imagePath).length * 81) / 24)} 秒（每格约 3.4 秒）</li>
          <li>生成后的视频保存在服务器，可随时下载</li>
        </ul>
      </div>
    </div>
  );
}
