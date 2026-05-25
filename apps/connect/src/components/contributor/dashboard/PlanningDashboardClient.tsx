"use client";

import { useState, useOptimistic, useTransition } from "react";

type TaskStatus = "pending" | "in_progress" | "completed";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  visible_to_team: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

interface Idea {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  visible_to_team: boolean;
  created_at: string;
}

interface Props {
  slug: string;
  tasks: Task[];
  ideas: Idea[];
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "To do",
  in_progress: "In progress",
  completed: "Done",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

export default function PlanningDashboardClient({ slug, tasks: initialTasks, ideas }: Props) {
  const [tasks, setTasks] = useOptimistic(initialTasks);
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<"tasks" | "ideas">("tasks");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contributor/${slug}/planning/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTaskTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        startTransition(() => {
          setTasks([
            ...tasks,
            {
              id: data.id,
              title: newTaskTitle.trim(),
              description: null,
              status: "pending",
              due_date: null,
              visible_to_team: false,
              completed_at: null,
              sort_order: tasks.length,
              created_at: new Date().toISOString(),
            },
          ]);
        });
        setNewTaskTitle("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function cycleStatus(task: Task) {
    const nextStatus: Record<TaskStatus, TaskStatus> = {
      pending: "in_progress",
      in_progress: "completed",
      completed: "pending",
    };
    const newStatus = nextStatus[task.status];
    const prev = [...tasks];
    startTransition(() => {
      setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    });
    const res = await fetch(`/api/contributor/${slug}/planning/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    });
    if (!res.ok) {
      startTransition(() => setTasks(prev));
    }
  }

  async function deleteTask(id: string) {
    const prev = [...tasks];
    startTransition(() => {
      setTasks(tasks.filter((t) => t.id !== id));
    });
    const res = await fetch(`/api/contributor/${slug}/planning/tasks?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      startTransition(() => setTasks(prev));
    }
  }

  const grouped: Record<TaskStatus, Task[]> = {
    pending: tasks.filter((t) => t.status === "pending"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    completed: tasks.filter((t) => t.status === "completed"),
  };

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div role="tablist" aria-label="Planning sections" className="flex gap-2 border-b border-[--border]">
        {(["tasks", "ideas"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-[--gold] text-[--gold]"
                : "border-transparent text-[--foreground-soft] hover:text-[--foreground]",
            ].join(" ")}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <div className="space-y-6">
          {/* New task form */}
          <form onSubmit={createTask} className="flex gap-2">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Add a task…"
              maxLength={200}
              className="flex-1 text-sm border border-[--border] rounded-xl px-4 py-2 bg-[--surface] focus:outline-none focus:border-[--gold]"
            />
            <button
              type="submit"
              disabled={submitting || !newTaskTitle.trim()}
              className="px-4 py-2 rounded-xl bg-[--gold] text-black text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Add
            </button>
          </form>

          {/* Kanban columns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(["pending", "in_progress", "completed"] as TaskStatus[]).map((status) => (
              <div key={status}>
                <div className="text-xs font-semibold uppercase tracking-widest text-[--foreground-soft] mb-2">
                  {STATUS_LABELS[status]} ({grouped[status].length})
                </div>
                <div className="space-y-2 min-h-[80px]">
                  {grouped[status].map((task) => (
                    <div
                      key={task.id}
                      className="surface-card rounded-xl p-3 space-y-2"
                    >
                      <div className="text-sm font-medium">{task.title}</div>
                      {task.due_date && (
                        <div className="text-xs text-[--foreground-soft]">
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => cycleStatus(task)}
                          className={[
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            STATUS_COLORS[task.status],
                          ].join(" ")}
                        >
                          {STATUS_LABELS[task.status]}
                        </button>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="ml-auto text-xs text-[--foreground-soft] hover:text-red-500 transition-colors"
                          aria-label={`Delete task: ${task.title}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "ideas" && (
        <div className="space-y-4">
          {ideas.length === 0 ? (
            <p className="text-sm text-[--foreground-soft]">No ideas yet. Ideas created by your team will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {ideas.map((idea) => (
                <li key={idea.id} className="surface-card rounded-xl p-4 space-y-1">
                  <div className="font-medium text-sm">{idea.title}</div>
                  {idea.description && (
                    <p className="text-xs text-[--foreground-soft]">{idea.description}</p>
                  )}
                  {idea.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {idea.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-[--surface-muted] px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
