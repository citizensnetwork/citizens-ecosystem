"use client";

import { useState } from "react";
import type { Department } from "@/types/db";

interface DepartmentTreeProps {
  departments: Department[];
  orgId: string;
  onRefresh: () => void;
}

interface DeptNode extends Department {
  children: DeptNode[];
}

function buildTree(departments: Department[]): DeptNode[] {
  const map = new Map<string, DeptNode>();
  const roots: DeptNode[] = [];

  for (const dept of departments) {
    map.set(dept.id, { ...dept, children: [] });
  }

  for (const dept of departments) {
    const node = map.get(dept.id)!;
    if (dept.parent_department_id && map.has(dept.parent_department_id)) {
      map.get(dept.parent_department_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function DeptNodeItem({
  node,
  orgId,
  onRefresh,
  depth,
}: {
  node: DeptNode;
  orgId: string;
  onRefresh: () => void;
  depth: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);

  async function handleRename() {
    if (!name.trim() || name.trim() === node.name) {
      setEditing(false);
      return;
    }
    await fetch(`/api/orgs/${orgId}/departments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: node.id, name: name.trim() }),
    });
    setEditing(false);
    onRefresh();
  }

  async function handleDelete() {
    if (node.children.length > 0) {
      alert("Cannot delete a department with sub-departments.");
      return;
    }
    await fetch(`/api/orgs/${orgId}/departments?id=${node.id}`, {
      method: "DELETE",
    });
    onRefresh();
  }

  return (
    <div style={{ paddingLeft: `${depth * 1.25}rem` }}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-alt">
        <span className="text-xs text-text-secondary">
          {node.children.length > 0 ? "▾" : "·"}
        </span>

        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            autoFocus
            className="flex-1 rounded border border-border bg-surface px-2 py-0.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        ) : (
          <span
            className="flex-1 text-sm text-text-primary cursor-pointer"
            onDoubleClick={() => setEditing(true)}
          >
            {node.name}
          </span>
        )}

        <button
          onClick={() => setEditing(true)}
          className="text-xs text-text-secondary hover:text-accent"
          title="Rename"
        >
          ✎
        </button>
        <button
          onClick={handleDelete}
          className="text-xs text-text-secondary hover:text-red-400"
          title="Delete"
        >
          ✕
        </button>
      </div>
      {node.children.map((child) => (
        <DeptNodeItem
          key={child.id}
          node={child}
          orgId={orgId}
          onRefresh={onRefresh}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export function DepartmentTree({
  departments,
  orgId,
  onRefresh,
}: DepartmentTreeProps) {
  const [newDeptName, setNewDeptName] = useState("");
  const [parentId, setParentId] = useState("");
  const [adding, setAdding] = useState(false);

  const tree = buildTree(departments);

  async function handleAdd() {
    if (!newDeptName.trim()) return;
    setAdding(true);
    await fetch(`/api/orgs/${orgId}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newDeptName.trim(),
        parent_department_id: parentId || undefined,
      }),
    });
    setNewDeptName("");
    setParentId("");
    setAdding(false);
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        {tree.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No departments yet. Add one below.
          </p>
        ) : (
          tree.map((node) => (
            <DeptNodeItem
              key={node.id}
              node={node}
              orgId={orgId}
              onRefresh={onRefresh}
              depth={0}
            />
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newDeptName}
          onChange={(e) => setNewDeptName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New department name"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">No parent (root)</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={adding || !newDeptName.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </div>
    </div>
  );
}
