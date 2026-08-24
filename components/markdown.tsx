import type { ReactNode } from "react";

/**
 * Minimal, dependency-free markdown renderer for untrusted disclosure text.
 *
 * Security model: it PARSES the markdown and builds React elements directly.
 * There is no dangerouslySetInnerHTML anywhere, so raw HTML in a report is
 * rendered as inert text. Link targets are restricted to http/https; images
 * are demoted to links (no remote asset loading); javascript:/data: URLs are
 * dropped. Styling follows the console's terminal aesthetic.
 */

const SAFE_URL = /^(https?:\/\/)[^\s<>"']+$/i;

function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  if (!SAFE_URL.test(href)) return <span>{children}</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="break-all text-accent underline decoration-accent/40 hover:decoration-accent"
    >
      {children}
    </a>
  );
}

/** Inline pass: code spans, bold, italic, links — returns React nodes. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: code span first so its content isn't further formatted.
  const pattern =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]*\))|(https?:\/\/[^\s<>")\]]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded border border-line bg-canvas/70 px-1 py-0.5 font-mono text-[0.85em] text-accent"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("(") + 1, -1);

      nodes.push(
        <SafeLink key={key} href={href}>
          {label}
        </SafeLink>
      );
    } else {
      nodes.push(
        <SafeLink key={key} href={token}>
          {token.length > 80 ? `${token.slice(0, 80)}...` : token}
        </SafeLink>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-line bg-canvas/80 p-4 font-mono text-xs leading-relaxed text-accent/90">
      {lines.join("\n")}
    </pre>
  );
}

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let codeLines: string[] | null = null;
  let blockquote: string[] = [];
  let keyIndex = 0;

  function flushParagraph() {
    if (paragraph.length === 0) return;

    blocks.push(
      <p key={`p${keyIndex++}`} className="my-3 leading-relaxed">
        {renderInline(paragraph.join(" "), `p${keyIndex}`)}
      </p>
    );

    paragraph = [];
  }

  function flushList() {
    if (listItems.length === 0) return;

    const items = listItems.map((item, i) => (
      <li key={`li${i}`} className="ml-5 my-1 leading-relaxed">
        {renderInline(item, `li${keyIndex}-${i}`)}
      </li>
    ));

    blocks.push(
      listOrdered ? (
        <ol key={`ol${keyIndex++}`} className="my-3 list-decimal space-y-1 marker:text-accent/70">
          {items}
        </ol>
      ) : (
        <ul key={`ul${keyIndex++}`} className="my-3 list-disc space-y-1 marker:text-accent/70">
          {items}
        </ul>
      )
    );

    listItems = [];
  }

  function flushBlockquote() {
    if (blockquote.length === 0) return;

    blocks.push(
      <blockquote
        key={`bq${keyIndex++}`}
        className="my-3 border-l-2 border-accent/50 pl-4 text-ink-secondary italic"
      >
        {renderInline(blockquote.join(" "), `bq${keyIndex}`)}
      </blockquote>
    );

    blockquote = [];
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushBlockquote();
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Fenced code blocks
    if (/^```/.test(line.trim())) {
      if (codeLines !== null) {
        blocks.push(<CodeBlock key={keyIndex++} lines={codeLines} />);
        codeLines = null;
      } else {
        flushAll();
        codeLines = [];
      }
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Headings
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);

    if (heading) {
      flushAll();

      const level = heading[1].length;

      if (level <= 2) {
        blocks.push(
          <h3
            key={keyIndex++}
            className="mt-5 mb-2 border-b border-line pb-1 text-sm font-semibold uppercase tracking-wider text-accent"
          >
            {renderInline(heading[2], `h${keyIndex}`)}
          </h3>
        );
      } else {
        blocks.push(
          <h4 key={keyIndex++} className="mt-4 mb-1.5 text-sm font-semibold text-ink">
            {renderInline(heading[2], `h${keyIndex}`)}
          </h4>
        );
      }
      continue;
    }

    // Horizontal rules
    if (/^(-{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      blocks.push(<hr key={keyIndex++} className="my-4 border-line" />);
      continue;
    }

    // Blockquotes
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      flushList();
      blockquote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    } else {
      flushBlockquote();
    }

    // Lists
    const bulletMatch = /^[-*+]\s+(.*)$/.exec(trimmed);
    const orderedMatch = /^\d+[.)]\s+(.*)$/.exec(trimmed);

    if (bulletMatch) {
      if (listOrdered) flushList();
      listOrdered = false;
      paragraph = [];
      listItems.push(bulletMatch[1]);
      continue;
    }

    if (orderedMatch) {
      if (!listOrdered && listItems.length > 0) flushList();
      listOrdered = true;
      paragraph = [];
      listItems.push(orderedMatch[1]);
      continue;
    }

    flushList();

    // Blank line ends paragraph
    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    paragraph.push(trimmed);
  }

  if (codeLines !== null) {
    blocks.push(<CodeBlock key={keyIndex++} lines={codeLines} />);
  }

  flushAll();

  return (
    <div className="font-sans text-sm text-ink-secondary [&_p:first-child]:mt-0">
      {blocks}
    </div>
  );
}
