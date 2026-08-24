"use client";

import { useEffect, useRef, useState } from "react";
type Message = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_ACTIONS = [
  "Explain this report",
  "What is the root cause?",
  "Explain the attack flow",
  "Why was this severity rating given?",
  "What security concepts does this demonstrate?",
  "How could it have been prevented?",
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

export default function ResearchAssistant({
  reportId,
}: {
  reportId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        body: JSON.stringify({ reportId, messages: nextMessages }),
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

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-accent/90">
          research assistant
        </p>

        <p className="font-mono text-[10px] text-ink-faint">
          grounded in this report only
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[520px] min-h-[120px] overflow-y-auto px-5 py-4">
        {messages.length === 0 && !notConfigured && (
          <div className="text-sm leading-relaxed text-ink-muted">
            Ask anything about this disclosure — the assistant sees the full
            report and distinguishes report facts from general security
            knowledge.
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
            analyzing report...
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
        {QUICK_ACTIONS.map((action) => (
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
          placeholder="Ask about this report..."
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
