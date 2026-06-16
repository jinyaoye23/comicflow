import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120_000, // 2 min for AI generation
  headers: { 'Content-Type': 'application/json' },
});

// Types
export interface Project {
  id: string;
  userId: string;
  title: string;
  genre?: string;
  style?: string;
  scriptType: string;   // 'COMIC' | 'VIDEO'
  idea?: string;        // 用户原始创意文本
  script?: string;
  status: string;
  videoTaskId?: string | null;  // Agnes 视频任务 ID
  characters: Character[];
  panels: Panel[];
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  description: string;
  imagePath?: string;
}

export interface Panel {
  id: string;
  projectId: string;
  index: number;
  scene?: string;
  action?: string;
  dialogue?: string;
  camera?: string;
  subtitle?: string;
  innerThought?: string;
  emotion?: string;
  soundEffect?: string;
  prompt?: string;
  imagePath?: string;
  videoPath?: string;
  charIds?: string; // JSON array string
  failed?: boolean;  // 批量生成时标记失败（后端返回，非 DB 字段）
  error?: string;    // 失败原因
}

// === Projects ===
export async function createProject(data: { title: string; genre?: string; style?: string; scriptType?: string }) {
  const res = await api.post<Project>('/projects', data);
  return res.data;
}

export async function getProject(id: string) {
  const res = await api.get<Project>(`/projects/${id}`);
  return res.data;
}

export async function listProjects() {
  const res = await api.get<Project[]>('/projects');
  return res.data;
}

export async function deleteProject(id: string) {
  await api.delete(`/projects/${id}`);
}

// === Script ===
export async function generateScript(projectId: string, idea: string, scriptType?: string) {
  const res = await api.post<{ script: string; scriptType: string }>(`/projects/${projectId}/script/generate`, { idea, scriptType });
  return res.data;
}

export async function updateScript(projectId: string, script: string) {
  const res = await api.put<Project>(`/projects/${projectId}/script`, { script });
  return res.data;
}

// === Characters ===
export async function generateCharacterImage(projectId: string, charId: string) {
  const res = await api.post<Character>(`/projects/${projectId}/characters/${charId}/generate`);
  return res.data;
}

export async function updateCharacter(projectId: string, charId: string, data: Partial<Character>) {
  const res = await api.put<Character>(`/projects/${projectId}/characters/${charId}`, data);
  return res.data;
}

export async function deleteCharacter(projectId: string, charId: string) {
  await api.delete(`/projects/${projectId}/characters/${charId}`);
}

// === Panels ===
export async function generatePanels(projectId: string) {
  const res = await api.post<{ panels: Panel[] }>(`/projects/${projectId}/panels/generate`);
  return res.data;
}

export async function regeneratePanel(projectId: string, panelId: string) {
  const res = await api.post<Panel>(`/projects/${projectId}/panels/${panelId}/retry`);
  return res.data;
}

export async function updatePanel(projectId: string, panelId: string, data: Partial<Panel>) {
  const res = await api.put<Panel>(`/projects/${projectId}/panels/${panelId}`, data);
  return res.data;
}

// === Export ===
export async function exportProjectImage(projectId: string) {
  const res = await api.get<Blob>(`/projects/${projectId}/export/image`, { responseType: 'blob' });
  return res.data;
}

export async function exportProjectVideo(projectId: string) {
  const res = await api.get<Blob>(`/projects/${projectId}/export/video`, { responseType: 'blob' });
  return res.data;
}

// === Video ===
export interface VideoGenerateResult {
  taskId: string;
  status: string;
  mode: string;
  scriptType: string;
  message: string;
}

export interface VideoStatus {
  hasVideo: boolean;
  videoPath: string | null;
  status: string;                 // DRAFT | GENERATING | COMPLETED | FAILED
  videoTaskId: string | null;
  videoPrompt: string | null;     // 生成时使用的 prompt（用于前端展示和调试）
  agnesStatus: string | null;     // queued | in_progress | completed | failed
  agnesProgress: number | null;   // 0-100
  message: string;
}

export async function generateVideo(projectId: string, panelIds?: string[]) {
  const res = await api.post<VideoGenerateResult>(`/projects/${projectId}/video/generate`, { panelIds });
  return res.data;
}

export async function getVideoStatus(projectId: string) {
  const res = await api.get<VideoStatus>(`/projects/${projectId}/video`);
  return res.data;
}

export async function resetVideoTask(projectId: string) {
  const res = await api.delete<{ ok: boolean }>(`/projects/${projectId}/video/task`);
  return res.data;
}

export default api;
