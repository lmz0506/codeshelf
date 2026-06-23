import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Notification } from "@/types";

interface NotificationsState {
  notifications: Notification[];
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (
    notification: Omit<Notification, "id" | "createdAt">
  ) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 10),
    }));
    invoke("add_notification", {
      input: {
        notification_type: notification.type,
        title: notification.title,
        message: notification.message || "",
      },
    }).catch(console.error);
  },
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
    invoke("remove_notification", { id }).catch(console.error);
  },
  clearAllNotifications: () => {
    set({ notifications: [] });
    invoke("clear_notifications").catch(console.error);
  },
}));
