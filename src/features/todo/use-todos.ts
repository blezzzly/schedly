"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  getTodos,
  addTodoAction,
  toggleTodoAction,
  deleteTodoAction,
  clearCompletedAction,
  editTodoAction,
  type TodoPriority,
} from "@/app/(dashboard)/todo/actions";
import { isNetworkError } from "@/lib/offline-cache";

export type TodoItem = {
  id: string;
  text: string;
  completed: boolean;
  priority: TodoPriority;
  category?: string;
  dueDate?: string;
  createdAt: number;
  completedAt?: number;
};

const STORAGE_KEY = "schedly-todos";

const listeners = new Set<() => void>();
let loaded = false;
let cached: TodoItem[] = [];
const EMPTY_TODOS: TodoItem[] = [];

function readStorage(): TodoItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TodoItem[] {
  if (typeof window === "undefined") return EMPTY_TODOS;
  if (!loaded) {
    cached = readStorage();
    loaded = true;
  }
  return cached;
}

function getServerSnapshot(): TodoItem[] {
  return EMPTY_TODOS;
}

function persist(next: TodoItem[]) {
  cached = next;
  loaded = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable — keep state in memory
  }
  listeners.forEach((l) => l());
}

function rowToItem(row: {
  id: string;
  text: string;
  completed: boolean;
  priority: string;
  category?: string | null;
  dueDate: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
}): TodoItem {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    priority: (row.priority as TodoPriority) || "medium",
    category: row.category ?? undefined,
    dueDate: row.dueDate ?? undefined,
    createdAt: new Date(row.createdAt).getTime(),
    completedAt: row.completedAt ? new Date(row.completedAt).getTime() : undefined,
  };
}

export function useTodos() {
  const todos = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Sync from the database on first load; fall back to the local cache when
  // the network is down so tasks keep showing while offline.
  useEffect(() => {
    let active = true;
    getTodos()
      .then((rows) => {
        if (!active) return;
        persist(rows.map(rowToItem));
      })
      .catch((err) => {
        if (!active) return;
        if (!isNetworkError(err)) console.error("[TODOS_LOAD]", err);
      });
    return () => {
      active = false;
    };
  }, []);

  const addTodo = useCallback(
    async (text: string, priority: TodoPriority, dueDate?: string, category?: string) => {
      const id = crypto.randomUUID();
      const todo: TodoItem = {
        id,
        text: text.trim(),
        completed: false,
        priority,
        category: category || "general",
        dueDate: dueDate || undefined,
        createdAt: Date.now(),
      };
      const prev = cached;
      persist([todo, ...cached]);
      const result = await addTodoAction(todo.text, priority, dueDate, category);
      if (!result.success) {
        persist(prev);
        console.error("[ADD_TODO]", result.error);
      }
    },
    []
  );

  const toggleTodo = useCallback(async (id: string) => {
    const prev = cached;
    const next = cached.map((t) =>
      t.id === id
        ? {
            ...t,
            completed: !t.completed,
            completedAt: !t.completed ? Date.now() : undefined,
          }
        : t
    );
    persist(next);
    const result = await toggleTodoAction(id);
    if (!result.success) {
      persist(prev);
    }
  }, []);

  const deleteTodo = useCallback(async (id: string) => {
    const prev = cached;
    persist(cached.filter((t) => t.id !== id));
    const result = await deleteTodoAction(id);
    if (!result.success) {
      persist(prev);
    }
  }, []);

  const clearCompleted = useCallback(async () => {
    const prev = cached;
    persist(cached.filter((t) => !t.completed));
    const result = await clearCompletedAction();
    if (!result.success) {
      persist(prev);
    }
  }, []);

  const editTodo = useCallback(async (id: string, text: string, priority: TodoPriority, dueDate?: string, category?: string) => {
    const prev = cached;
    const next = cached.map((t) =>
      t.id === id ? { ...t, text: text.trim(), priority, dueDate: dueDate || undefined, category: category || t.category } : t
    );
    persist(next);
    const result = await editTodoAction(id, text, priority, dueDate, category);
    if (!result.success) {
      persist(prev);
      console.error("[EDIT_TODO]", result.error);
    }
  }, []);

  return { todos, addTodo, toggleTodo, deleteTodo, clearCompleted, editTodo };
}

export function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
