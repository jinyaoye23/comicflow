import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generateVideos, concatVideos, getVideoStatus } from '../services/api';
import type { Project, Panel } from '../services/api';

interface Props {
  project: Project;
}

export function StepVideo({ project }: Props) {
  const queryClient = useQueryClient();
  const hasImages = project.panels?.some((p) => p.imagePath);

  // Video generation state
  const [genError, setGenError] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [concatError, setConcatError] = useState<string | null>(null);
  const [combinedVideo, setCombinedVideo] = useState<string | null>(null);

  // Check existing video status
  const { data: videoStatus } = useQuery({
    queryKey: ['videoStatus', project.id],
    queryFn: () => getVideoStatus(project.id),
    enabled: hasImages,
    refetchOnWindowFocus: false,
  });

  const genMutation = useMutation({
    mutationFn: () => generateVideos(project.id),
    onSuccess: (data) => {
      const failed = new Set<string>();
      data.videos.forEach((v: any) => {
        if (v.failed) failed.add(v.id);
      });
      setFailedIds(failed);
      queryClient.invalidateQueries({ queryKey: ['videoStatus', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
    onError: (err: any) => setGenError(err.response?.data?.message || err.message || '视频生成失败'),
  });

  const retryMutation = useMutation({
    mutationFn: (panelIds: string[]) => generateVideos(project.id, panelIds),
    onSuccess: (data) => {
      const failed = new Set<string>();
      data.videos.forEach((v: any) => {
        if (v.failed) failed.add(v.id);
      });
      setFailedIds(failed);
      queryClient.invalidateQueries({ queryKey: ['videoStatus', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
    onError: (err: any) => setGenError(err.response?.data?.message || err.message || '重试失败'),
  });

  const concatMutation = useMutation({
    mutationFn: () => concatVideos(project.id),
    onSuccess: (data) => {
      setCombinedVideo(data.videoPath);
      queryClient.invalidateQueries({ queryKey: ['videoStatus', project.id] });
    },
    onError: (err: any) => setConcatError(err.response?.data?.message || err.message || '拼接失败'),
  });

  const videoPanels = project.panels?.filter((p) => p.imagePath) || [];
  const generatedCount = videoStatus?.videos?.length || 0;
  const allGenerated = generatedCount === videoPanels.length && failedIds.size === 0;
  const hasCombined = videoStatus?.hasCombined || !!combinedVideo;
  const combinedPath = combinedVideo || videoStatus?.combinedPath;

  // Camera-to-video prompt hints
  const cameraHint: Record<string, string> = {
    '远景': '慢推远 →',
    '中景': '横摇 →',
    '特写': '慢推进 →',
    '全景': '全景扫 →',
    '仰视': '仰拍抬升 →',
    '俯视': '俯拍下降 →',
  };

  if (!hasImages) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">视频合成</h3>
        <div className="text-center py-12 text-gray-400">
          <div className="text-5xl mb-3">🎥</div>
          <p className="text-lg font-medium text-gray-600">还没有分镜图</p>
          <p className="text-sm mt-1">请先在分镜生成中生成漫画图片</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">视频合成</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            为每格分镜图生成 Ken Burns 运镜视频，可拼接为完整漫画视频
          </p>
        </div>
        <div className="flex gap-2">
          {allGenerated && !hasCombined && (
            <button
              onClick={() => concatMutation.mutate()}
              disabled={concatMutation.isPending}
              className="btn-primary"
            >
              {concatMutation.isPending ? '拼接中...' : '🎬 拼接成片'}
            </button>
          )}
          {failedIds.size > 0 && (
            <button
              onClick={() => retryMutation.mutate(Array.from(failedIds))}
              disabled={retryMutation.isPending}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
            >
              {retryMutation.isPending ? '重试中...' : `⚠ 重试 ${failedIds.size} 个失败项`}
            </button>
          )}
          {!allGenerated && (
            <button
              onClick={() => genMutation.mutate()}
              disabled={genMutation.isPending}
              className="btn-primary"
            >
              {genMutation.isPending ? '生成中...' : '🎥 全部生成视频'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {genError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {genError}
          <button onClick={() => setGenError(null)} className="ml-2 underline">关闭</button>
        </div>
      )}
      {concatError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {concatError}
          <button onClick={() => setConcatError(null)} className="ml-2 underline">关闭</button>
        </div>
      )}

      {/* Combined Video Player */}
      {hasCombined && combinedPath && (
        <div className="card p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-indigo-200">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-indigo-700">🎬 完整漫画视频</span>
            <a
              href={combinedPath}
              download="comicflow-video.mp4"
              className="text-sm px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              ⬇ 下载
            </a>
          </div>
          <video
            src={combinedPath}
            controls
            className="w-full max-h-96 rounded-lg bg-black"
            poster={videoPanels[0]?.imagePath}
          />
        </div>
      )}

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            视频生成进度
          </span>
          <span className="text-sm text-gray-400">
            {generatedCount} / {videoPanels.length}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${videoPanels.length > 0 ? (generatedCount / videoPanels.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Panel list */}
      <div className="space-y-3">
        {videoPanels.map((panel) => (
          <VideoPanelCard
            key={panel.id}
            panel={panel}
            isGenerated={!!videoStatus?.videos?.some((v) => v.panelId === panel.id)}
            videoPath={videoStatus?.videos?.find((v) => v.panelId === panel.id)?.videoPath}
            isFailed={failedIds.has(panel.id)}
            isGenerating={genMutation.isPending || retryMutation.isPending}
            cameraHint={cameraHint[panel.camera || ''] || ''}
            onRetry={() => retryMutation.mutate([panel.id])}
            onGenerate={() => genMutation.mutate()}
          />
        ))}
      </div>
    </div>
  );
}

function VideoPanelCard({
  panel,
  isGenerated,
  videoPath,
  isFailed,
  isGenerating,
  cameraHint,
  onRetry,
}: {
  panel: Panel;
  isGenerated: boolean;
  videoPath?: string;
  isFailed: boolean;
  isGenerating: boolean;
  cameraHint: string;
  onRetry: () => void;
  onGenerate: () => void;
}) {
  return (
    <div
      className={`card p-3 flex gap-3 ${
        isFailed ? 'ring-2 ring-red-300 bg-red-50/50' : ''
      } ${isGenerated && !isFailed ? 'ring-1 ring-green-200 bg-green-50/30' : ''}`}
    >
      {/* Panel image preview */}
      <div className="flex-shrink-0 w-24 aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
        {panel.imagePath ? (
          <img
            src={panel.imagePath}
            alt={`Panel ${panel.index + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">
            🎬
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm">第 {panel.index + 1} 格</span>
          {panel.camera && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
              {cameraHint}{panel.camera}
            </span>
          )}
          {isGenerated && !isFailed && (
            <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-600 rounded">
              ✅ 已生成
            </span>
          )}
          {isFailed && (
            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">
              ❌ 失败
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 line-clamp-2">{panel.scene || panel.action || '无描述'}</p>

        {/* Action buttons */}
        <div className="flex gap-2 mt-2">
          {isGenerated && videoPath && !isFailed && (
            <a
              href={videoPath}
              download={`panel-${panel.index + 1}.mp4`}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
            >
              ⬇ 下载片段
            </a>
          )}
          {isFailed && (
            <button
              onClick={onRetry}
              disabled={isGenerating}
              className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors"
            >
              🔄 重试
            </button>
          )}
          {!isGenerated && !isFailed && (
            <span className="text-xs text-gray-300">等待生成...</span>
          )}
        </div>
      </div>

      {/* Video preview */}
      {isGenerated && videoPath && !isFailed && (
        <div className="flex-shrink-0 w-24">
          <video
            src={videoPath}
            className="w-full aspect-[3/4] rounded-lg bg-black object-cover"
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          />
        </div>
      )}
    </div>
  );
}
