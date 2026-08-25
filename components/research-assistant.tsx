"use client";

import { useEffect, useRef, useState } from "react";
type Message = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Tri-mode Research Assistant:
 *  - reportId     -> grounded in one disclosed report (full body)
 *  - curatedFile  -> grounded in a curated TOP category's index
 *  - programHandle-> grounded in a program's profile + policy/scope
 */
export type AssistantTarget =
  | { kind: "report"; reportId: string }
  | { kind: "curated"; curatedFile: string; curatedName: string }
  | { kind: "program"; programHandle: string };

const REPORT_QUICK_ACTIONS = [
  "Explain this report",
  "What is the root cause?",
  "Explain the attack flow",
  "Why was this severity rating given?",
  "What security concepts does this demonstrate?",
  "How could it have been prevented?",
];

const CURATED_QUICK_ACTIONS = [
  "What attack patterns recur across these reports?",
  "Group these reports by technique",
  "Which programs dominate and why might that be?",
  "Which of these are most instructive to study first, and why?",
  "What should I practice in a lab based on these titles?",
  "Summarize what makes top reports stand out here",
];

const PROGRAM_QUICK_ACTIONS = [
  "Summarize this program's scope from the policy",
  "Is this program a good fit for a web/API-focused hunter?",
  "What asset types does the policy cover?",
  "What should I double-check in the policy before submitting?",
  "How should I prioritize testing here?",
];

const NOT_CONFIGURED_HINT = [
  "The Research Assistant needs an AI provider key in .env.local (server-side only):",
  "",
  "  ANTHROPIC_API_KEY=sk-ant-...        # Anthropic Claude",
  "  -- or --",
  "  OPENAI_API_KEY=sk-...               # OpenAI",
  "  -- or any OpenAI-compatible API: --",
  "  AI_API_KEY=nvapi-...                # e.g. NVIDIA",
  "  AI_BASE_URL=https://integrate.api.nvidia.com/v1",
  "  AI_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b",
  "  AI_EXTRA_BODY={\"chat_template_kwargs\":{\"thinking\":false}}",
  "",
  "Restart the dev server after saving. Keys are never exposed to the browser.",
].join("\n");

function targetBody(target: AssistantTarget) {
  switch (target.kind) {
    case "report":
      return { reportId: target.reportId };
    case "curated":
      return { curatedFile: target.curatedFile };
    case "program":
      return { programHandle: target.programHandle };
  }
}

export default function ResearchAssistant({ target }: { target: AssistantTarget }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // NOTE: consumers pass `key={...}` per grounding target, so switching
  // targets remounts this component and resets all chat state naturally.

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send(question: string) {
    const trimmed = question.trim();

    if (!trimmed || busy) return;

    setError(null);

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];

    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...targetBody(target),
          messages: nextMessages,
        }),
      });

      const body = await response.json().catch(() => null);

      if (response.status === 503) {
        setNotConfigured(true);
        setMessages((current) =>
          current.slice(0, -1)
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          body?.error ?? "The research assistant could not complete this request."
        );
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: body.reply ?? "(no response)" },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setMessages((current) => current.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  const quickActions =
    target.kind === "curated"
      ? CURATED_QUICK_ACTIONS
      : target.kind === "program"
        ? PROGRAM_QUICK_ACTIONS
        : REPORT_QUICK_ACTIONS;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-accent/90">
          research assistant
        </p>

        <p className="font-mono text-[10px] text-ink-faint">
          {target.kind === "curated"
            ? `grounded in "${target.curatedName}" index`
            : target.kind === "program"
              ? `grounded in @${target.programHandle}'s policy`
              : "grounded in this report only"}
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[520px] min-h-[120px] overflow-y-auto px-5 py-4">
        {messages.length === 0 && !notConfigured && (
          <div className="text-sm leading-relaxed text-ink-muted">
            {target.kind === "curated" ? (
              <>
                Ask about patterns across this category — the assistant sees
                every title, program and payout in the index. For full technical
                depth on a single report, open it and use its own assistant.
              </>
            ) : target.kind === "program" ? (
              <>
                Ask about this program&apos;s scope, fit and approach — the
                assistant sees the program&apos;s policy as exposed by the API.
                Always verify against the live policy before submitting.
              </>
            ) : (
              <>
                Ask anything about this disclosure — the assistant sees the full
                report and distinguishes report facts from general security
                knowledge.
              </>
            )}
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`mb-4 rounded-lg border p-3.5 ${
              message.role === "user"
                ? "border-line bg-raised"
                : "border-accent/20 bg-accent-dim"
            }`}
          >
            <p
              className={`mb-1.5 font-mono text-[10px] uppercase tracking-wider ${
                message.role === "user" ? "text-ink-muted" : "text-accent/80"
              }`}
            >
              {message.role === "user" ? "you" : "assistant"}
            </p>

            <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {message.content}
            </div>
          </div>
        ))}

        {busy && (
          <p className="animate-pulse font-mono text-xs text-accent/70">
            {target.kind === "curated"
              ? "analyzing category..."
              : target.kind === "program"
                ? "analyzing program policy..."
                : "analyzing report..."}
          </p>
        )}

        {notConfigured && (
          <pre className="whitespace-pre-wrap rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 font-mono text-xs leading-relaxed text-amber-200/90">
            {NOT_CONFIGURED_HINT}
          </pre>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 border-t border-line/60 px-5 py-3">
        {quickActions.map((action) => (
          <button
            key={action}
            disabled={busy || notConfigured}
            onClick={() => send(action)}
            className="rounded-full border border-line bg-raised/60 px-3 py-1.5 text-[11px] text-ink-secondary transition-colors hover:border-accent/35 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {action}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-line p-4"
      >
        <span className="font-mono text-sm text-accent/80">$</span>

        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            target.kind === "curated"
              ? "Ask about patterns in this category..."
              : target.kind === "program"
                ? `Ask about @${target.programHandle}...`
                : "Ask about this report..."
          }
          disabled={busy || notConfigured}
          className="h-9 flex-1 rounded-lg border border-line bg-canvas/60 px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/50 disabled:opacity-40"
        />

        <button
          type="submit"
          disabled={busy || !input.trim() || notConfigured}
          className="h-9 rounded-lg border border-accent/35 bg-accent-dim px-4 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
