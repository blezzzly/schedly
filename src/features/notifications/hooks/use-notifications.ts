"use client";

export function useNotifications() {
  return {
    notifications: [],
    unreadCount: 0,
    isLoading: true,
  };
}
