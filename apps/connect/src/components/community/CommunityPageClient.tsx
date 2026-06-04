"use client";

import { useState, useCallback } from "react";
import {
  Lightbulb,
  Heart,
  Users,
  CheckCircle,
  Clock,
  Vote,
  Info,
} from "lucide-react";
import type { CommunityIdea } from "@/app/community/page";
import { parseIdeaBody } from "@/lib/community/parseIdea";
import {
  CATEGORY_LABELS,
  CATEGORY_HEX,
  CATEGORY_BADGE_CLASSES,
  EVENT_CATEGORIES,
} from "@/lib/categories";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

type Tab = "voting" | "projects" | "submit";

type Props = {
  votingIdeas: CommunityIdea[];
  inProcessIdeas: CommunityIdea[];
  confirmedIdeas: CommunityIdea[];
};

type SubmitState = "idle" | "loading" | "success" | "error";

export default function CommunityPageClient({
  votingIdeas,
  inProcessIdeas,
  confirmedIdeas,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("voting");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const totalVoting = votingIdeas.length;
  const totalInProcess = inProcessIdeas.length;
  const totalConfirmed = confirmedIdeas.length;

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim() || !category) return;
    setSubmitState("loading");
    setErrorMsg("");
    try {
      const pageUrl = (typeof window !== "undefined" ? window.location.origin : "") + "/community";
      const body = `[cat:${category}]\n\n${description.trim()}`;
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body, page_url: pageUrl }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Submission failed");
      }
      setSubmitState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setSubmitState("error");
    }
  }, [title, description, category]);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setCategory("");
    setSubmitState("idle");
    setErrorMsg("");
    setActiveTab("voting");
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-white/30 glass sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl gold-gradient flex items-center justify-center shadow-lg shrink-0">
            <Lightbulb size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-foreground leading-tight">
              Kingdom Projects
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Impact Ideas · Community Collaboration
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <p className="text-lg font-bold text-[#2563EB]">{totalVoting}</p>
            <p className="text-[10px] text-muted-foreground">Voting</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <p className="text-lg font-bold text-[#D97706]">{totalInProcess}</p>
            <p className="text-[10px] text-muted-foreground">In Process</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <p className="text-lg font-bold text-[#16A34A]">{totalConfirmed}</p>
            <p className="text-[10px] text-muted-foreground">Confirmed</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-0 bg-muted rounded-xl p-1">
          {(["voting", "projects", "submit"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                activeTab === tab
                  ? "bg-white shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "submit" ? "+ Submit Idea" : tab === "projects" ? "Projects" : "Voting"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto pb-24 md:pb-8">
        {/* ── Voting tab ── */}
        {activeTab === "voting" && (
          <div className="px-5 py-4 space-y-4 fade-in">
            {/* Phase 6 banner */}
            <div className="bg-gradient-to-br from-[#F2E8CC] to-[#E8D48B]/30 rounded-2xl p-4 border border-[#C9A84C]/30 flex gap-3">
              <Info size={16} className="text-[#8B6914] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-[#8B6914] mb-0.5">
                  Community voting opens in Phase 6
                </p>
                <p className="text-[11px] text-[#8B6914]/80 leading-relaxed">
                  Ideas submitted here go to the Kingdom Projects board. Once
                  community voting launches, the idea with 1 000 votes becomes a
                  confirmed Kingdom Project. Submit yours now to be first on the
                  board!
                </p>
              </div>
            </div>

            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Ideas on the Board
            </p>

            {votingIdeas.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-(--gold-soft) flex items-center justify-center mb-4">
                  <Lightbulb size={24} className="text-(--gold-dark)" />
                </div>
                <p className="font-display font-bold text-foreground mb-1">
                  No ideas yet
                </p>
                <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                  Be the first to submit a Kingdom Project idea for the community.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("submit")}
                  className="px-5 py-2.5 gold-gradient text-white text-xs font-bold rounded-xl shadow transition active:scale-95"
                >
                  Submit an Idea
                </button>
              </div>
            ) : (
              votingIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)
            )}
          </div>
        )}

        {/* ── Projects tab ── */}
        {activeTab === "projects" && (
          <div className="px-5 py-4 space-y-6 fade-in">
            {inProcessIdeas.length === 0 && confirmedIdeas.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#FEF3C7] flex items-center justify-center mb-4">
                  <Clock size={24} className="text-[#D97706]" />
                </div>
                <p className="font-display font-bold text-foreground mb-1">
                  No active projects yet
                </p>
                <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                  Confirmed Kingdom Projects will appear here as ideas gain
                  traction and move through the process.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("voting")}
                  className="px-5 py-2.5 bg-foreground text-background text-xs font-bold rounded-xl transition active:scale-95"
                >
                  View Ideas
                </button>
              </div>
            ) : (
              <>
                {inProcessIdeas.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                      ⚙️ In Process
                    </p>
                    <div className="space-y-3">
                      {inProcessIdeas.map((idea) => (
                        <ProjectCard key={idea.id} idea={idea} variant="inProcess" />
                      ))}
                    </div>
                  </div>
                )}
                {confirmedIdeas.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                      ✅ Confirmed Projects
                    </p>
                    <div className="space-y-3">
                      {confirmedIdeas.map((idea) => (
                        <ProjectCard key={idea.id} idea={idea} variant="confirmed" />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Submit tab ── */}
        {activeTab === "submit" && (
          <div className="px-5 py-4 fade-in">
            {submitState === "success" ? (
              <SuccessState onReset={resetForm} />
            ) : (
              <div className="space-y-4">
                {/* Explainer */}
                <div className="bg-gradient-to-br from-[#F2E8CC] to-[#E8D48B]/30 rounded-2xl p-4 border border-[#C9A84C]/30">
                  <p className="text-sm font-bold text-[#8B6914] mb-1">
                    💡 What is an Impact Idea?
                  </p>
                  <p className="text-xs text-[#8B6914]/80 leading-relaxed">
                    An Impact Idea is a public proposal for a community project.
                    Once community voting launches in Phase 6, an idea that
                    receives 1 000 votes becomes a confirmed Kingdom Project that
                    moves forward with support from the community.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1.5">
                      Project Title *
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                      placeholder="e.g. Free Community Mentorship Programme"
                      className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm outline-none focus:border-[#C9A84C]/60 transition-colors"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1.5">
                      Description *
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      placeholder="Describe the impact this project will have on your community..."
                      rows={4}
                      className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm outline-none focus:border-[#C9A84C]/60 transition-colors resize-none"
                    />
                    <p className="text-right text-[10px] text-muted-foreground mt-1">
                      {description.length}/2000
                    </p>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1.5">
                      Category *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {EVENT_CATEGORIES.map((cat) => {
                        const selected = category === cat.value;
                        const hex = CATEGORY_HEX[cat.value];
                        const badgeCls = CATEGORY_BADGE_CLASSES[cat.value];
                        return (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => setCategory(cat.value)}
                            className={`py-2.5 px-3 rounded-xl text-xs font-bold text-left transition-all border ${
                              selected
                                ? "border-transparent text-white"
                                : `border-border ${badgeCls}`
                            }`}
                            style={selected ? { background: hex } : undefined}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {errorMsg && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3">
                      {errorMsg}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={
                      submitState === "loading" ||
                      !title.trim() ||
                      !description.trim() ||
                      !category
                    }
                    className="w-full py-3.5 bg-foreground text-background rounded-xl text-sm font-bold hover:bg-foreground/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitState === "loading" ? "Submitting…" : "Submit Impact Idea"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function IdeaCard({ idea }: { idea: CommunityIdea }) {
  const { categoryId, description } = parseIdeaBody(idea.body);
  const authorName = idea.user?.full_name?.split(" ")[0] ?? "Anonymous";
  const avatarUrl = idea.user?.avatar_url;
  const initial = authorName.charAt(0).toUpperCase();

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      {/* Top accent bar (muted since no votes yet) */}
      <div className="h-1 bg-muted" />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {categoryId && (
                <CategoryBadge categoryId={categoryId} />
              )}
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#DBEAFE] text-[#2563EB]">
                Voting · Phase 6
              </span>
            </div>
            <h4 className="text-sm font-bold text-foreground leading-snug">
              {idea.title}
            </h4>
          </div>
          <Vote size={14} className="text-muted-foreground/40 shrink-0 mt-0.5" />
        </div>

        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-3">
            {description}
          </p>
        )}

        <div className="flex items-center gap-2 mb-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={authorName}
              className="w-5 h-5 rounded-full object-cover"
            />
          ) : (
            <span className="w-5 h-5 rounded-full bg-(--gold-soft) flex items-center justify-center text-[9px] font-bold text-black">
              {initial}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {authorName} · {timeAgo(idea.created_at)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled
            title="Community voting opens in Phase 6"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border border-border text-muted-foreground/50 cursor-not-allowed"
          >
            <Heart size={13} />
            Vote · Phase 6
          </button>
          <button
            type="button"
            disabled
            title="Collaboration features coming soon"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border border-border text-muted-foreground/50 cursor-not-allowed"
          >
            <Users size={13} /> Collab
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  idea,
  variant,
}: {
  idea: CommunityIdea;
  variant: "inProcess" | "confirmed";
}) {
  const { categoryId, description } = parseIdeaBody(idea.body);
  const authorName = idea.user?.full_name?.split(" ")[0] ?? "Anonymous";
  const avatarUrl = idea.user?.avatar_url;
  const initial = authorName.charAt(0).toUpperCase();

  const isConfirmed = variant === "confirmed";

  return (
    <div
      className={`bg-card rounded-2xl border p-4 ${
        isConfirmed
          ? "border-green-200 bg-gradient-to-br from-white to-[#DCFCE7]/30"
          : "border-[#D97706]/30"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {categoryId && <CategoryBadge categoryId={categoryId} />}
        {isConfirmed ? (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#DCFCE7] text-[#16A34A]">
            <CheckCircle size={9} className="inline mr-0.5" />
            Confirmed
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#FEF3C7] text-[#D97706]">
            <Clock size={9} className="inline mr-0.5" />
            In Process
          </span>
        )}
      </div>

      <h4 className="text-sm font-bold text-foreground mb-1 leading-snug">
        {idea.title}
      </h4>
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {description}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={authorName}
            className="w-5 h-5 rounded-full object-cover"
          />
        ) : (
          <span className="w-5 h-5 rounded-full bg-(--gold-soft) flex items-center justify-center text-[9px] font-bold text-black">
            {initial}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {authorName} · {timeAgo(idea.created_at)}
        </span>
      </div>
    </div>
  );
}

function CategoryBadge({ categoryId }: { categoryId: string }) {
  const label = CATEGORY_LABELS[categoryId as keyof typeof CATEGORY_LABELS];
  const badgeCls = CATEGORY_BADGE_CLASSES[categoryId as keyof typeof CATEGORY_BADGE_CLASSES];
  if (!label) return null;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${badgeCls}`}>
      {label}
    </span>
  );
}

function SuccessState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-[#DCFCE7] rounded-2xl flex items-center justify-center mb-4">
        <CheckCircle size={28} className="text-[#16A34A]" />
      </div>
      <h3 className="font-display font-bold text-foreground mb-2">
        Idea Submitted!
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Your Impact Idea is now on the Kingdom Projects board. When community
        voting launches in Phase 6, the Kingdom will be able to vote it forward!
      </p>
      <button
        type="button"
        onClick={onReset}
        className="px-6 py-3 gold-gradient text-white rounded-xl font-bold text-sm shadow transition active:scale-95"
      >
        View Ideas Board
      </button>
    </div>
  );
}
