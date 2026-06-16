import { useEffect, useState, useCallback, createContext, useContext } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';
type Toast = { id: number; type: ToastType; message: string };

interface ToastContextValue {
  show: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

let _listeners: ((toast: Toast) => void)[] = [];
let _nextId = 1;

function emit(toast: Toast) {
  _listeners.forEach((fn) => fn(toast));
}

export function toast(type: ToastType, message: string) {
  emit({ id: _nextId++, type, message });
}

export function useToast() {
  return { show: toast };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500);
    };
    _listeners.push(handler);
    return () => {
      _listeners = _listeners.filter((h) => h !== handler);
    };
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const iconMap: Record<ToastType, string> = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  };

  const bgMap: Record<ToastType, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
  };

  return (
    <ToastContext.Provider value={{ show: toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg animate-[slideIn_0.3s_ease-out] ${bgMap[t.type]}`}
            onClick={() => remove(t.id)}
          >
            <span className="text-base flex-shrink-0">{iconMap[t.type]}</span>
            <p className="text-sm font-medium flex-1">{t.message}</p>
            <button
              className="text-current opacity-50 hover:opacity-100 flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); remove(t.id); }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
