import { create } from 'zustand';

export type PipelineStep = 'script' | 'characters' | 'panels' | 'video' | 'export';

interface PipelineState {
  // Current step
  step: PipelineStep;
  setStep: (step: PipelineStep) => void;

  // Current project ID
  projectId: string | null;
  setProjectId: (id: string | null) => void;

  // Generation flags
  isGenerating: boolean;
  setGenerating: (v: boolean) => void;

  // Error
  error: string | null;
  setError: (e: string | null) => void;

  // Reset
  reset: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  step: 'script',
  setStep: (step) => set({ step }),

  projectId: null,
  setProjectId: (id) => set({ projectId: id }),

  isGenerating: false,
  setGenerating: (v) => set({ isGenerating: v }),

  error: null,
  setError: (e) => set({ error: e }),

  reset: () =>
    set({
      step: 'script',
      projectId: null,
      isGenerating: false,
      error: null,
    }),
}));
