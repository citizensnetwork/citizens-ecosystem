"use client";

import { useMemo, useState } from "react";

// ───────────────────────────────────────────────────────────
// Stage I: Planning cards (tasks + ideas)
//
// Each card is collapsed by default (title + minimal metadata). Clicking the
// body expands it to show description, checklist, links, and a multi-place
// picker — all inline-editable. The top-right control differs per type:
//   • Tasks: binary completion checkbox (incomplete ↔ completed). Legacy
//     in_progress status renders as "incomplete" but is preserved server-side.
//   • Ideas: delete X.
// Below the top-right control, a "Public" toggle (visible_to_team).
// ───────────────────────────────────────────────────────────

type TaskStatus = "pending" | "in_progress" | "completed";

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface LinkItem {
  url: string;
  label: string;
}

export interface PlanningTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  visible_to_team: boolean;
  completed_at: string | null;
  sort_order: number;
  checklist: ChecklistItem[];
  links: LinkItem[];
  assigned_place_ids: string[];
  linked_place_id: string | null;
  linked_event_id: string | null;
  created_at: string;
}

export interface PlanningIdeaRow {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  visible_to_team: boolean;
  checklist: ChecklistItem[];
  links: LinkItem[];
  assigned_place_ids: string[];
  linked_place_id: string | null;
  linked_event_id: string | null;
  created_at: string;
}

export interface PlanningPlaceRow {
  id: string;
  name: string;
}

type Task = PlanningTaskRow;
type Idea = PlanningIdeaRow;
type PlaceOption = PlanningPlaceRow;

interface Props {
  slug: string;
  tasks: PlanningTaskRow[];
  ideas: PlanningIdeaRow[];
  places: PlanningPlaceRow[];
}

export default function PlanningDashboardClient({
  slug,
  tasks: initialTasks,
  ideas: initialIdeas,
  places,
}: Props) {
  const [tab, setTab] = useState<"tasks" | "ideas">("tasks");
  const [tasks, setTasks] = useState<Task[]>(() => initialTasks.map(normaliseTask));
  const [ideas, setIdeas] = useState<Idea[]>(() => initialIdeas.map(normaliseIdea));
  const [newTitle, setNewTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const placeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of places) m.set(p.id, p.name);
    return m;
  }, [places]);

  // ── create handlers ─────────────────────────────────────────
  async function createCard(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const endpoint = tab === "tasks"
        ? `/api/contributor/${slug}/planning/tasks`
        : `/api/contributor/${slug}/planning/ideas`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to create");
        return;
      }
      const { id } = await res.json();
      if (tab === "tasks") {
        setTasks((prev) => [
          {
            id,
            title: newTitle.trim(),
            description: null,
            status: "pending",
            due_date: null,
            visible_to_team: false,
            completed_at: null,
            sort_order: prev.length,
            checklist: [],
            links: [],
            assigned_place_ids: [],
            linked_place_id: null,
            linked_event_id: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      } else {
        setIdeas((prev) => [
          {
            id,
            title: newTitle.trim(),
            description: null,
            tags: [],
            visible_to_team: false,
            checklist: [],
            links: [],
            assigned_place_ids: [],
            linked_place_id: null,
            linked_event_id: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setNewTitle("");
    } finally {
      setSubmitting(false);
    }
  }

  // ── per-card mutators ───────────────────────────────────────
  async function patchTask(id: string, patch: Partial<Task>) {
    const prev = tasks;
    setTasks((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const res = await fetch(`/api/contributor/${slug}/planning/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      setTasks(prev);
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to save");
    }
  }

  async function patchIdea(id: string, patch: Partial<Idea>) {
    const prev = ideas;
    setIdeas((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const res = await fetch(`/api/contributor/${slug}/planning/ideas`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      setIdeas(prev);
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to save");
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    const prev = tasks;
    setTasks((all) => all.filter((t) => t.id !== id));
    const res = await fetch(`/api/contributor/${slug}/planning/tasks?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setTasks(prev);
      setError("Failed to delete task");
    }
  }

  async function deleteIdea(id: string) {
    if (!confirm("Delete this idea? This cannot be undone.")) return;
    const prev = ideas;
    setIdeas((all) => all.filter((t) => t.id !== id));
    const res = await fetch(`/api/contributor/${slug}/planning/ideas?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setIdeas(prev);
      setError("Failed to delete idea");
    }
  }

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
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize",
              tab === t
                ? "border-[--gold] text-[--gold]"
                : "border-transparent text-[--foreground-soft] hover:text-[--foreground]",
            ].join(" ")}
          >
            {t} ({t === "tasks" ? tasks.length : ideas.length})
          </button>
        ))}
      </div>

      {/* Create form */}
      <form onSubmit={createCard} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={tab === "tasks" ? "Add a task…" : "Add an idea…"}
          maxLength={200}
          className="flex-1 text-sm border border-[--border] rounded-xl px-4 py-2 bg-[--surface] focus:outline-none focus:border-[--gold]"
        />
        <button
          type="submit"
          disabled={submitting || !newTitle.trim()}
          className="px-4 py-2 rounded-xl bg-[--gold] text-black text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Card grid */}
      {tab === "tasks" ? (
        tasks.length === 0 ? (
          <EmptyState label="tasks" />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tasks.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={task}
                  places={places}
                  placeNameById={placeNameById}
                  onPatch={(patch) => patchTask(task.id, patch)}
                  onDelete={() => deleteTask(task.id)}
                />
              </li>
            ))}
          </ul>
        )
      ) : ideas.length === 0 ? (
        <EmptyState label="ideas" />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <IdeaCard
                idea={idea}
                places={places}
                placeNameById={placeNameById}
                onPatch={(patch) => patchIdea(idea.id, patch)}
                onDelete={() => deleteIdea(idea.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── helpers / sub-components ────────────────────────────────

function normaliseTask(t: Task): Task {
  return {
    ...t,
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    links: Array.isArray(t.links) ? t.links : [],
    assigned_place_ids: Array.isArray(t.assigned_place_ids) ? t.assigned_place_ids : [],
  };
}

function normaliseIdea(i: Idea): Idea {
  return {
    ...i,
    checklist: Array.isArray(i.checklist) ? i.checklist : [],
    links: Array.isArray(i.links) ? i.links : [],
    assigned_place_ids: Array.isArray(i.assigned_place_ids) ? i.assigned_place_ids : [],
    tags: Array.isArray(i.tags) ? i.tags : [],
  };
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-sm text-[--foreground-soft]">
      No {label} yet. Add one above to get started.
    </p>
  );
}

// ─── Task card ───────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  places: PlaceOption[];
  placeNameById: Map<string, string>;
  onPatch: (patch: Partial<Task>) => Promise<void> | void;
  onDelete: () => void;
}

function TaskCard({ task, places, placeNameById, onPatch, onDelete }: TaskCardProps) {
  const [open, setOpen] = useState(false);
  const isComplete = task.status === "completed";

  function toggleComplete() {
    const next: TaskStatus = isComplete ? "pending" : "completed";
    void onPatch({ status: next });
  }

  return (
    <article
      className={[
        "surface-card rounded-xl p-4 transition-shadow",
        isComplete ? "opacity-70" : "",
        open ? "shadow-md" : "",
      ].join(" ")}
    >
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left min-w-0"
          aria-expanded={open}
          aria-label={open ? "Collapse task" : "Expand task"}
        >
          <h3 className={[
            "text-sm font-semibold leading-snug break-words",
            isComplete ? "line-through text-[--foreground-soft]" : "",
          ].join(" ")}>
            {task.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <StatusPill status={task.status} />
            {task.visible_to_team && (
              <span className="px-2 py-0.5 rounded-full bg-[--gold]/15 text-[--gold] font-medium">
                Public to team
              </span>
            )}
            {task.due_date && (
              <span className="text-[--foreground-soft]">
                Due {new Date(task.due_date).toLocaleDateString()}
              </span>
            )}
            {task.assigned_place_ids.length > 0 && (
              <span className="text-[--foreground-soft]">
                · {task.assigned_place_ids.length} place
                {task.assigned_place_ids.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </button>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {/* Top-right: completion checkbox */}
          <button
            type="button"
            onClick={toggleComplete}
            aria-pressed={isComplete}
            aria-label={isComplete ? "Mark task incomplete" : "Mark task complete"}
            className={[
              "w-6 h-6 rounded-full border-2 transition-colors flex items-center justify-center",
              isComplete
                ? "bg-green-500 border-green-500 text-white"
                : "border-[--border] hover:border-green-500",
            ].join(" ")}
          >
            {isComplete && (
              <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
                <path
                  d="M3 8.5l3 3 7-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          {/* Public toggle below the completion control */}
          <PublicToggle
            value={task.visible_to_team}
            onChange={(next) => onPatch({ visible_to_team: next })}
          />
        </div>
      </header>

      {open && (
        <CardBody
          description={task.description}
          checklist={task.checklist}
          links={task.links}
          assignedPlaces={task.assigned_place_ids}
          places={places}
          placeNameById={placeNameById}
          onDescription={(v) => onPatch({ description: v })}
          onChecklist={(v) => onPatch({ checklist: v })}
          onLinks={(v) => onPatch({ links: v })}
          onPlaces={(v) => onPatch({ assigned_place_ids: v })}
          footer={
            <>
              <DueDateRow
                value={task.due_date}
                onChange={(v) => onPatch({ due_date: v })}
              />
              <button
                type="button"
                onClick={onDelete}
                className="self-end text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Delete task
              </button>
            </>
          }
        />
      )}
    </article>
  );
}

// ─── Idea card ───────────────────────────────────────────────

interface IdeaCardProps {
  idea: Idea;
  places: PlaceOption[];
  placeNameById: Map<string, string>;
  onPatch: (patch: Partial<Idea>) => Promise<void> | void;
  onDelete: () => void;
}

function IdeaCard({ idea, places, placeNameById, onPatch, onDelete }: IdeaCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className={[
        "surface-card rounded-xl p-4 transition-shadow",
        open ? "shadow-md" : "",
      ].join(" ")}
    >
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left min-w-0"
          aria-expanded={open}
          aria-label={open ? "Collapse idea" : "Expand idea"}
        >
          <h3 className="text-sm font-semibold leading-snug break-words">{idea.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {idea.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-[--surface-muted] text-[--foreground-soft]"
              >
                {tag}
              </span>
            ))}
            {idea.visible_to_team && (
              <span className="px-2 py-0.5 rounded-full bg-[--gold]/15 text-[--gold] font-medium">
                Public to team
              </span>
            )}
            {idea.assigned_place_ids.length > 0 && (
              <span className="text-[--foreground-soft]">
                · {idea.assigned_place_ids.length} place
                {idea.assigned_place_ids.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </button>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {/* Top-right: delete X for ideas */}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete idea"
            className="w-6 h-6 rounded-full border border-[--border] hover:border-red-500 hover:text-red-500 transition-colors flex items-center justify-center text-[--foreground-soft]"
          >
            <span aria-hidden="true">✕</span>
          </button>
          {/* Public toggle below the delete control */}
          <PublicToggle
            value={idea.visible_to_team}
            onChange={(next) => onPatch({ visible_to_team: next })}
          />
        </div>
      </header>

      {open && (
        <CardBody
          description={idea.description}
          checklist={idea.checklist}
          links={idea.links}
          assignedPlaces={idea.assigned_place_ids}
          places={places}
          placeNameById={placeNameById}
          onDescription={(v) => onPatch({ description: v })}
          onChecklist={(v) => onPatch({ checklist: v })}
          onLinks={(v) => onPatch({ links: v })}
          onPlaces={(v) => onPatch({ assigned_place_ids: v })}
          footer={
            <TagEditor
              tags={idea.tags}
              onChange={(v) => onPatch({ tags: v })}
            />
          }
        />
      )}
    </article>
  );
}

// ─── Shared sub-components ───────────────────────────────────

interface CardBodyProps {
  description: string | null;
  checklist: ChecklistItem[];
  links: LinkItem[];
  assignedPlaces: string[];
  places: PlaceOption[];
  placeNameById: Map<string, string>;
  onDescription: (v: string | null) => void;
  onChecklist: (v: ChecklistItem[]) => void;
  onLinks: (v: LinkItem[]) => void;
  onPlaces: (v: string[]) => void;
  footer?: React.ReactNode;
}

function CardBody({
  description,
  checklist,
  links,
  assignedPlaces,
  places,
  placeNameById,
  onDescription,
  onChecklist,
  onLinks,
  onPlaces,
  footer,
}: CardBodyProps) {
  return (
    <div className="mt-4 pt-4 border-t border-[--border] flex flex-col gap-4">
      <DescriptionEditor value={description} onChange={onDescription} />
      <ChecklistEditor items={checklist} onChange={onChecklist} />
      <LinksEditor links={links} onChange={onLinks} />
      <PlacesPicker
        assigned={assignedPlaces}
        places={places}
        placeNameById={placeNameById}
        onChange={onPlaces}
      />
      {footer}
    </div>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = {
    pending: "To do",
    in_progress: "In progress",
    completed: "Done",
  };
  const colors: Record<TaskStatus, string> = {
    pending: "bg-black/5 text-[--foreground-soft]",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function PublicToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      title={value ? "Visible to team" : "Make visible to team"}
      className={[
        "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
        value ? "bg-[--gold]" : "bg-[--border]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
          value ? "translate-x-3.5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

function DescriptionEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [dirty, setDirty] = useState(false);
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-1">
        Description
      </label>
      <textarea
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          if (dirty) {
            onChange(local.trim().length === 0 ? null : local);
            setDirty(false);
          }
        }}
        rows={3}
        maxLength={2000}
        placeholder="Notes, context, anything useful…"
        className="w-full text-sm rounded-xl border border-[--border] bg-[--surface] p-2 resize-none focus:outline-none focus:border-[--gold]"
      />
    </div>
  );
}

function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (v: ChecklistItem[]) => void;
}) {
  const [newText, setNewText] = useState("");

  function addItem() {
    const trimmed = newText.trim().slice(0, 200);
    if (!trimmed) return;
    if (items.length >= 50) return;
    onChange([
      ...items,
      { id: crypto.randomUUID(), text: trimmed, done: false },
    ]);
    setNewText("");
  }

  function toggle(id: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-1">
        Checklist
      </label>
      {items.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={item.done}
                aria-label={item.done ? "Mark incomplete" : "Mark done"}
                className={[
                  "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
                  item.done
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-[--border]",
                ].join(" ")}
              >
                {item.done && "✓"}
              </button>
              <span className={item.done ? "line-through text-[--foreground-soft]" : ""}>
                {item.text}
              </span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Remove checklist item"
                className="ml-auto text-xs text-[--foreground-soft] hover:text-red-500"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length < 50 && (
        <div className="flex gap-1">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Add sub-item…"
            maxLength={200}
            className="flex-1 text-xs rounded-lg border border-[--border] bg-[--surface] px-2 py-1 focus:outline-none focus:border-[--gold]"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!newText.trim()}
            className="text-xs px-2 py-1 rounded-lg bg-[--surface-muted] hover:bg-[--gold]/20 disabled:opacity-40 transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function LinksEditor({
  links,
  onChange,
}: {
  links: LinkItem[];
  onChange: (v: LinkItem[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");

  function add() {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      setErr("Link must start with http:// or https://");
      return;
    }
    if (links.length >= 20) return;
    onChange([...links, { url: u.slice(0, 500), label: label.trim().slice(0, 120) }]);
    setUrl("");
    setLabel("");
    setErr("");
  }

  function remove(target: string) {
    onChange(links.filter((l) => l.url !== target));
  }

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-1">
        Links
      </label>
      {links.length > 0 && (
        <ul className="space-y-1 mb-2">
          {links.map((l) => (
            <li key={l.url} className="flex items-center gap-2 text-xs">
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex-1 text-blue-700 hover:underline truncate"
              >
                {l.label || l.url}
              </a>
              <button
                type="button"
                onClick={() => remove(l.url)}
                aria-label="Remove link"
                className="text-[--foreground-soft] hover:text-red-500"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {links.length < 20 && (
        <div className="space-y-1">
          <div className="flex gap-1">
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (err) setErr("");
              }}
              placeholder="https://…"
              maxLength={500}
              className="flex-1 text-xs rounded-lg border border-[--border] bg-[--surface] px-2 py-1 focus:outline-none focus:border-[--gold]"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              maxLength={120}
              className="flex-1 text-xs rounded-lg border border-[--border] bg-[--surface] px-2 py-1 focus:outline-none focus:border-[--gold]"
            />
            <button
              type="button"
              onClick={add}
              disabled={!url.trim()}
              className="text-xs px-2 py-1 rounded-lg bg-[--surface-muted] hover:bg-[--gold]/20 disabled:opacity-40 transition-colors"
            >
              +
            </button>
          </div>
          {err && (
            <p className="text-[11px] text-red-600" role="alert">
              {err}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PlacesPicker({
  assigned,
  places,
  placeNameById,
  onChange,
}: {
  assigned: string[];
  places: PlaceOption[];
  placeNameById: Map<string, string>;
  onChange: (v: string[]) => void;
}) {
  function toggle(id: string) {
    if (assigned.includes(id)) {
      onChange(assigned.filter((x) => x !== id));
    } else {
      if (assigned.length >= 10) return;
      onChange([...assigned, id]);
    }
  }

  if (places.length === 0) {
    return (
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-1">
          Assigned places
        </label>
        <p className="text-xs text-[--foreground-soft]">
          You have no places yet. Add one from the Places tab to assign here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-1">
        Assigned places ({assigned.length}/10)
      </label>
      <div className="flex flex-wrap gap-1.5">
        {places.map((p) => {
          const selected = assigned.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={[
                "text-xs px-2 py-1 rounded-full border transition-colors",
                selected
                  ? "bg-[--gold] text-black border-[--gold]"
                  : "bg-[--surface] border-[--border] text-[--foreground-soft] hover:border-[--gold]",
              ].join(" ")}
            >
              {placeNameById.get(p.id) ?? p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DueDateRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-[--foreground-soft]">
        Due
      </label>
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-xs rounded-lg border border-[--border] bg-[--surface] px-2 py-1 focus:outline-none focus:border-[--gold]"
      />
    </div>
  );
}

function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (v: string[]) => void;
}) {
  const [val, setVal] = useState("");

  function add() {
    const t = val.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 50);
    if (!t) return;
    if (tags.includes(t)) return;
    if (tags.length >= 10) return;
    onChange([...tags, t]);
    setVal("");
  }

  function remove(target: string) {
    onChange(tags.filter((t) => t !== target));
  }

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-1">
        Tags ({tags.length}/10)
      </label>
      <div className="flex flex-wrap gap-1.5 mb-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-full bg-[--surface-muted] text-[--foreground-soft] flex items-center gap-1"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remove ${tag}`}
              className="hover:text-red-500"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      {tags.length < 10 && (
        <div className="flex gap-1">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add tag…"
            maxLength={50}
            className="flex-1 text-xs rounded-lg border border-[--border] bg-[--surface] px-2 py-1 focus:outline-none focus:border-[--gold]"
          />
          <button
            type="button"
            onClick={add}
            disabled={!val.trim()}
            className="text-xs px-2 py-1 rounded-lg bg-[--surface-muted] hover:bg-[--gold]/20 disabled:opacity-40 transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
