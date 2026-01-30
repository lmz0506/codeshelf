import { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, X, Info } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

// Global toast state
let toastListeners: ((toasts: ToastMessage[]) => void)[] = [];
let toasts: ToastMessage[] = [];

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]));
}

export function showToast(
  type: ToastType,
  title: string,
  message?: string,
  duration: number = 3000
) {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const toast: ToastMessage = { id, type, title, message, duration };
  toasts = [...toasts, toast];
  notifyListeners();

  // 同时记录到通知中心
  try {
    useAppStore.getState().addNotification({ type, title, message });
  } catch {
    // store 未初始化时忽略
  }

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
}

export function removeToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notifyListeners();
}

// React hook for toast state
function useToastState() {
  const [toastState, setToastState] = useState<ToastMessage[]>(toasts);

  useEffect(() => {
    toastListeners.push(setToastState);
    return () => {
      toastListeners = toastListeners.filter(l => l !== setToastState);
    };
  }, []);

  return toastState;
}

// Toast Container Component
export function ToastContainer() {
  const toastState = useToastState();

  if (toastState.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toastState.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

// Individual Toast Item
function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const backgrounds = {
    success: "bg-green-50 border-green-200",
    error: "bg-red-50 border-red-200",
    warning: "bg-yellow-50 border-yellow-200",
    info: "bg-blue-50 border-blue-200",
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-slide-up ${backgrounds[toast.type]}`}
      role="alert"
    >
      <div className="flex-shrink-0">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
        {toast.message && (
          <p className="text-sm text-gray-600 mt-0.5">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
      >
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}
