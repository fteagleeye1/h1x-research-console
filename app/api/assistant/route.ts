import { NextRequest, NextResponse } from "next/server";
import {
  AssistantNotConfiguredError,
  runAssistant,
  type AssistantMessage,
} from "@/lib/ai";
import { loadDisclosedReport } from "@/lib/disclosed";
import { loadCuratedCategory } from "@/lib/curated-tops";
import { classLabel } from "@/lib/vuln-classes";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4_000;
/** Keep the report body within a sane token budget for context. */
const MAX_BODY_CHARS = 9_000;
/** Corpus-mode context budget (index lines only; ~100 entries fits easily). */
const MAX_CORPUS_ENTRIES = 150;

type ChatRequest = {
  /** Per-report mode: ground the chat in one disclosed report. */
  reportId?: string;
  /** Corpus mode: ground the chat in a curated TOP category's index. */
  curatedFile?: string;
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
    '2. If something is not stated in the report, say so, e.g. "The report does not explicitly state X. Based on general web-security principles..."',
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

/**
 * Corpus-mode system prompt: the assistant sees only the curated index
 * (titles, programs, votes, bounties, report IDs) of one TOP category.
 */
function buildCorpusSystemPrompt(categoryName: string, entries: {
  title: string;
  program: string | null;
  votes: number | null;
  bountyAmount: number | null;
  reportId: string | null;
}[]): string {
  const lines = entries.map((entry, index) => {
    const parts = [
      `${index + 1}. ${entry.title}`,
      `— ${entry.program ?? "unknown program"}`,
      entry.votes !== null ? `▲${entry.votes}` : null,
      entry.bountyAmount !== null && entry.bountyAmount > 0
        ? `$${entry.bountyAmount.toLocaleString("en-US")}`
        : null,
      entry.reportId ? `[open: /disclosed-reports/${entry.reportId}]` : null,
    ].filter((part) => part !== null);

    return parts.join(" ");
  });

  return [
    "You are the H1X Research Assistant: a security mentor helping a learner study patterns across publicly disclosed HackerOne reports.",
    "",
    `You are grounded in the INDEX of the curated category "${categoryName}":`,
    "the all-time top disclosed reports of this vulnerability class, listed with title, program, upvotes, bounty and an internal link for each.",
    "",
    "GROUNDING RULES (critical):",
    "1. You can see WHAT was reported (title), WHERE (program), and how it ranked (votes/bounty). You CANNOT see the full report bodies.",
    '2. If the user asks about technical details of a specific report (payloads, exact steps, root cause beyond what the title implies), say so honestly, e.g. "The index does not include the report body — open report /disclosed-reports/<id> for the full disclosure."',
    "3. You MAY infer broad technique themes from titles (e.g. 'stored XSS via file upload recurs'), clearly framed as reading of the titles.",
    "4. General security knowledge is allowed for teaching, but always framed separately from the index facts.",
    "5. NEVER invent report contents, bounty amounts, CVEs or timelines that are not in the index.",
    "",
    "STYLE:",
    "- Mentor tone: concrete, structured, concise. No filler.",
    '- When asked for patterns/themes, group reports by technique and cite them by their index number (e.g. "#7, #23").',
    "- Encourage opening individual reports for full technical depth.",
    "- Focus on learning value and AUTHORIZED testing contexts only.",
    "",
    `=== CATEGORY INDEX: ${categoryName} (${entries.length} reports) ===`,
    lines.join("\n"),
  ].join("\n");
}

export async function POST(request: NextRequest) {
  let chat: ChatRequest;

  try {
    chat = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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
    // --- Mode 2: curated corpus grounding -------------------------------
    if (chat.curatedFile) {
      if (chat.reportId) {
        return NextResponse.json(
          { error: "Provide either reportId or curatedFile, not both." },
          { status: 400 }
        );
      }

      const category = await loadCuratedCategory(chat.curatedFile);

      if (!category) {
        return NextResponse.json(
          { error: "Unknown curated category." },
          { status: 404 }
        );
      }

      const reply = await runAssistant(
        buildCorpusSystemPrompt(
          category.name,
          category.reports.slice(0, MAX_CORPUS_ENTRIES)
        ),
        messages
      );

      return NextResponse.json({ reply });
    }

    // --- Mode 1: single-report grounding ---------------------------------
    const reportId = chat.reportId;

    if (!reportId || !/^\d{1,12}$/.test(reportId)) {
      return NextResponse.json({ error: "Invalid report ID." }, { status: 400 });
    }

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
