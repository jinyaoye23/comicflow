import { useState } from 'react';
import type { Project } from '../services/api';

interface Props {
  project: Project;
}

export function StepExport({ project }: Props) {
  const [exporting, setExporting] = useState(false);

  const hasImages = project.panels?.some((p) => p.imagePath);

  const handleExportImages = async () => {
    setExporting(true);
    try {
      // Download each panel image
      for (const panel of project.panels) {
        if (!panel.imagePath) continue;
        const a = document.createElement('a');
        a.href = panel.imagePath;
        a.download = `panel_${panel.index + 1}.png`;
        a.click();
        await new Promise((r) => setTimeout(r, 300)); // small delay between downloads
      }
    } finally {
      setExporting(false);
    }
  };

  const handleExportScript = () => {
    if (!project.script) return;
    const blob = new Blob([project.script], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title}_script.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">导出</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Export Images */}
        <button
          onClick={handleExportImages}
          disabled={!hasImages || exporting}
          className="card p-6 text-center hover:shadow-md transition-shadow disabled:opacity-50"
        >
          <div className="text-4xl mb-3">🖼</div>
          <h4 className="font-semibold text-gray-900 mb-1">导出图片</h4>
          <p className="text-sm text-gray-500">
            {hasImages ? `下载 ${project.panels.filter((p) => p.imagePath).length} 张分镜图` : '暂无图片'}
          </p>
        </button>

        {/* Export Script */}
        <button
          onClick={handleExportScript}
          disabled={!project.script}
          className="card p-6 text-center hover:shadow-md transition-shadow disabled:opacity-50"
        >
          <div className="text-4xl mb-3">📄</div>
          <h4 className="font-semibold text-gray-900 mb-1">导出脚本</h4>
          <p className="text-sm text-gray-500">
            {project.script ? '下载结构化脚本 JSON' : '暂无脚本'}
          </p>
        </button>

        {/* Export Video (future) */}
        <div className="card p-6 text-center opacity-50">
          <div className="text-4xl mb-3">🎬</div>
          <h4 className="font-semibold text-gray-900 mb-1">导出视频</h4>
          <p className="text-sm text-gray-500">即将上线</p>
        </div>
      </div>

      {/* Long Image Preview */}
      {hasImages && (
        <div className="card p-6">
          <h4 className="font-semibold mb-4">长图预览</h4>
          <div className="flex flex-col gap-2 items-center">
            {project.panels
              .filter((p) => p.imagePath)
              .map((p) => (
                <div key={p.id} className="w-48">
                  <img
                    src={p.imagePath!}
                    alt={`Panel ${p.index + 1}`}
                    className="w-full rounded-lg shadow"
                  />
                  <p className="text-center text-xs text-gray-400 mt-1">第 {p.index + 1} 格</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
