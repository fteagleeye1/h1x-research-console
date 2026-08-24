/**
 * Minimal provider-agnostic AI client for the Research Assistant.
 *
 * Supported configurations (checked in order):
 *   1. ANTHROPIC_API_KEY            -> Anthropic Messages API (api.anthropic.com)
 *   2. OPENAI_API_KEY | AI_API_KEY  -> any OpenAI-compatible /chat/completions API
 *                                      (AI_BASE_URL overrides the endpoint; AI_MODEL
 *                                      selects the model)
 *
 * No SDK dependency: plain fetch against the official HTTP APIs.
 * Credentials are read from server-side env vars only and are never logged,
 * returned, or sent anywhere except the provider endpoint itself.
 */

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProviderConfig =
  | { kind: "anthropic"; apiKey: string; model: string }
  | { kind: "openai"; apiKey: string; baseUrl: string; model: string };

function getProvider(): ProviderConfig | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (anthropicKey) {
    return {
      kind: "anthropic",
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;

  if (openaiKey) {
    return {
      kind: "openai",
      apiKey: openaiKey,
      baseUrl: (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
    };
  }

  return null;
}

export function isAssistantConfigured(): boolean {
  return getProvider() !== null;
}

export function assistantSetupHint(): string {
  if (process.env.ANTHROPIC_API_KEY) return "";

  if (process.env.OPENAI_API_KEY || process.env.AI_API_KEY) return "";

  return [
    "The Research Assistant needs an AI provider key in .env.local:",
    "  Option A:  ANTHROPIC_API_KEY=sk-ant-...",
    "  Option B:  OPENAI_API_KEY=sk-...   (or AI_API_KEY with AI_BASE_URL/AI_MODEL for OpenRouter/Groq/local)",
    "Restart the dev server after adding the key.",
  ].join("\n");
}

const MAX_COMPLETION_TOKENS = 1500;
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Optional extra fields merged into every OpenAI-compatible request body,
 * read once from AI_EXTRA_BODY (valid JSON). Useful for provider-specific
 * switches such as NVIDIA NIM's {"chat_template_kwargs":{"thinking":false}}
 * which disables chain-of-thought output on Nemotron reasoning models.
 */
function extraBody(): Record<string, unknown> {
  const raw = process.env.AI_EXTRA_BODY;

  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);

    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    console.warn("AI_EXTRA_BODY is not valid JSON; ignoring.");

    return {};
  }
}

async function callAnthropic(
  config: Extract<ProviderConfig, { kind: "anthropic" }>,
  systemPrompt: string,
  messages: AssistantMessage[]
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: MAX_COMPLETION_TOKENS,
      system: systemPrompt,
      messages,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI provider error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };

  const reply = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();

  return reply || "(empty response from provider)";
}

async function callOpenAI(
  config: Extract<ProviderConfig, { kind: "openai" }>,
  systemPrompt: string,
  messages: AssistantMessage[]
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: MAX_COMPLETION_TOKENS,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      ...extraBody(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI provider error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  return (
    data.choices?.[0]?.message?.content?.trim() ||
    "(empty response from provider)"
  );
}

/**
 * Runs one research-assistant turn. Throws when no provider is configured —
 * callers map that to a clear user-facing error.
 */
export async function runAssistant(
  systemPrompt: string,
  messages: AssistantMessage[]
): Promise<string> {
  const config = getProvider();

  if (!config) {
    throw new AssistantNotConfiguredError();
  }

  if (config.kind === "anthropic") {
    return callAnthropic(config, systemPrompt, messages);
  }

  return callOpenAI(config, systemPrompt, messages);
}

export class AssistantNotConfiguredError extends Error {
  constructor() {
    super("Assistant is not configured.");
    this.name = "AssistantNotConfiguredError";
  }
}
