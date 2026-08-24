import { NextRequest, NextResponse } from "next/server";
import {
  AssistantNotConfiguredError,
  runAssistant,
  type AssistantMessage,
} from "@/lib/ai";
import { loadDisclosedReport } from "@/lib/disclosed";
import { classLabel } from "@/lib/vuln-classes";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4_000;
/** Keep the report body within a sane token budget for context. */
const MAX_BODY_CHARS = 9_000;

type ChatRequest = {
  reportId?: string;
  messages?: { role?: string; content?: string }[];
};

function buildSystemPrompt(report: {
  id: string;
  title: string | null;
  url: string | null;
  programHandle: string | null;
  programName: string | null;
  vulnClass: string;
  originalWeakness: string | null;
  severity: string | null;
  submittedAt: string | null;
  disclosedAt: string | null;
  bountyAmount: number | null;
  cveIds: string[];
  structuredScope: { assetIdentifier: string | null; assetType: string | null } | null;
  vulnerabilityInformation: string | null;
}): string {
  const body = (report.vulnerabilityInformation ?? "").slice(0, MAX_BODY_CHARS);

  const facts = [
    `Report ID: ${report.id}`,
    report.url ? `URL: ${report.url}` : null,
    `Title: ${report.title ?? "(untitled)"}`,
    report.programHandle
      ? `Program: ${report.programName ?? report.programHandle} (${report.programHandle})`
      : null,
    `Research class: ${classLabel(report.vulnClass)}`,
    report.originalWeakness
      ? `Original HackerOne weakness label: ${report.originalWeakness}`
      : "Original weakness label: not provided",
    `Severity rating: ${report.severity ?? "not provided"}`,
    report.bountyAmount ? `Bounty awarded: $${report.bountyAmount}` : null,
    report.cveIds.length > 0 ? `CVE IDs: ${report.cveIds.join(", ")}` : null,
    report.structuredScope?.assetIdentifier
      ? `Affected asset: ${report.structuredScope.assetType ?? "asset"} ${report.structuredScope.assetIdentifier}`
      : null,
    report.submittedAt ? `Submitted: ${report.submittedAt}` : null,
    report.disclosedAt ? `Disclosed: ${report.disclosedAt}` : null,
    "",
    "=== REPORT BODY (verbatim disclosure) ===",
    body || "(no body available)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return [
    "You are the H1X Research Assistant: a security mentor helping a learner understand publicly disclosed HackerOne reports.",
    "",
    "GROUNDING RULES (critical):",
    "1. Distinguish explicitly between (a) information contained in the report below and (b) general security knowledge used to explain it.",
    "2. If something is not stated in the report, say so, e.g. \"The report does not explicitly state X. Based on general web-security principles...\"",
    "3. NEVER fabricate endpoints, payloads, attack steps, researcher actions, program responses, bounty amounts or technical details that are not in the source material.",
    "4. Do not repeat the whole report; quote or reference only what is needed.",
    "",
    "STYLE:",
    "- Explain like a mentor teaching web security: clear, step-by-step, defining unfamiliar concepts.",
    "- Prefer this structure when useful: What happened -> Why it happened -> Why it mattered -> How to prevent it -> What to learn.",
    "- Note which HTTP/browser/server concepts are relevant.",
    "- When discussing remediation and defensive controls you may use general knowledge, clearly framed as such.",
    "- Focus on understanding, root cause, impact, defense, and concepts to look for in AUTHORIZED testing environments only.",
    "- Be concise; no filler.",
    "",
    "=== REPORT CONTEXT ===",
    facts,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  let chat: ChatRequest;

  try {
    chat = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const reportId = chat.reportId;

  if (!reportId || !/^\d{1,12}$/.test(reportId)) {
    return NextResponse.json({ error: "Invalid report ID." }, { status: 400 });
  }

  const rawMessages = Array.isArray(chat.messages) ? chat.messages : [];
  const messages: AssistantMessage[] = [];

  for (const message of rawMessages.slice(-MAX_MESSAGES)) {
    const role = message.role;
    const content = (message.content ?? "").trim();

    if ((role !== "user" && role !== "assistant") || !content) continue;

    messages.push({
      role,
      content: content.slice(0, MAX_MESSAGE_CHARS),
    });
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Conversation must end with a user message." },
      { status: 400 }
    );
  }

  try {
    const report = await loadDisclosedReport(reportId);

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    if (!report.vulnerabilityInformation) {
      return NextResponse.json(
        {
          error:
            "This disclosure contains no technical write-up, so there is nothing meaningful for the assistant to explain.",
        },
        { status: 422 }
      );
    }

    const reply = await runAssistant(buildSystemPrompt(report), messages);

    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof AssistantNotConfiguredError) {
      return NextResponse.json(
        { error: "assistant-not-configured" },
        { status: 503 }
      );
    }

    console.error(
      "Assistant error:",
      error instanceof Error ? error.message.slice(0, 300) : error
    );

    return NextResponse.json(
      { error: "The research assistant could not complete this request." },
      { status: 500 }
    );
  }
}
