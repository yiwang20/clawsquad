import {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { StreamMessage } from "@clawsquad/shared";
import { MAX_OUTPUT_BUFFER_SIZE } from "@clawsquad/shared";

// ─── Markdown renderer ────────────────────────────────────────────────────────

/** Render inline markdown: inline code, bold, italic. */
function renderInline(text: string, baseKey: number): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;

    if (start > last) parts.push(text.slice(last, start));

    if (token.startsWith("`")) {
      parts.push(
        <code
          key={`${baseKey}-i${k++}`}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8em",
            background: "var(--color-bg-elevated)",
            padding: "1px 4px",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-purple-400)",
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={`${baseKey}-i${k++}`} style={{ fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <em key={`${baseKey}-i${k++}`} style={{ fontStyle: "italic" }}>
          {token.slice(1, -1)}
        </em>
      );
    }
    last = start + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * Minimal markdown-to-React renderer.
 * Handles fenced code blocks, headings, unordered lists, bold, italic, inline code.
 */
function renderMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++; // consume closing ```
      nodes.push(
        <pre
          key={k++}
          style={{
            background: "var(--color-bg-elevated)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            overflowX: "auto",
            margin: "var(--space-2) 0",
            fontSize: "var(--text-xs)",
            lineHeight: "var(--leading-relaxed)",
            border: "1px solid var(--color-border-subtle)",
          }}
        >
          <code data-lang={lang || undefined}>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,3}) (.+)/);
    if (hMatch) {
      const level = (hMatch[1] ?? "").length as 1 | 2 | 3;
      const Tag: "h1" | "h2" | "h3" = `h${level}`;
      nodes.push(
        <Tag
          key={k++}
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            fontSize: level === 1 ? "var(--text-base)" : "var(--text-sm)",
            color: "var(--color-text-primary)",
            marginTop: "var(--space-3)",
            marginBottom: "var(--space-1)",
          }}
        >
          {renderInline(hMatch[2] ?? "", k)}
        </Tag>
      );
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").slice(2));
        i++;
      }
      nodes.push(
        <ul
          key={k++}
          style={{
            paddingLeft: "var(--space-4)",
            margin: "var(--space-1) 0",
            listStyleType: "disc",
          }}
        >
          {items.map((item, idx) => (
            <li key={idx} style={{ margin: "var(--space-0.5) 0" }}>
              {renderInline(item, k * 100 + idx)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      nodes.push(<br key={k++} />);
      i++;
      continue;
    }

    // Regular line
    nodes.push(
      <span key={k++} style={{ display: "block" }}>
        {renderInline(line, k)}
      </span>
    );
    i++;
  }

  return nodes;
}

// ─── ToolBlock ────────────────────────────────────────────────────────────────

interface ToolBlockProps {
  label: string;
  labelColor?: string;
  content: string;
}

function ToolBlock({ label, labelColor, content }: ToolBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="tool-block">
      <div
        className="tool-block-header"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
        aria-expanded={open}
      >
        {/* Chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{
            transition: "transform var(--duration-slow) var(--ease-default)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <path d="M2 1.5 L8 5 L2 8.5 Z" />
        </svg>
        <span
          className="tool-block-name"
          style={labelColor ? { color: labelColor } : undefined}
        >
          {label}
        </span>
      </div>

      {open && <div className="tool-block-body">{content}</div>}
    </div>
  );
}

// ─── Message renderers ────────────────────────────────────────────────────────

/** Extract text content from a stream message's content field. */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type?: string; text?: string }>)
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text ?? "")
      .join("");
  }
  return "";
}

function AssistantMessage({ msg }: { msg: StreamMessage }) {
  let text = extractText(msg["content"]);

  // Wrapped format: { type: "assistant", message: { content: [...] } }
  if (!text && msg["message"] != null && typeof msg["message"] === "object") {
    text = extractText((msg["message"] as Record<string, unknown>)["content"]);
  }

  if (!text) return null;
  return <div className="output-assistant">{renderMarkdown(text)}</div>;
}

function ToolUseMessage({ msg }: { msg: StreamMessage }) {
  const name = typeof msg["name"] === "string" ? msg["name"] : "tool_use";
  const input = msg["input"];
  const content = input != null ? JSON.stringify(input, null, 2) : "(no input)";
  return <ToolBlock label={name} content={content} labelColor="var(--color-purple-400)" />;
}

function ToolResultMessage({ msg }: { msg: StreamMessage }) {
  let content = extractText(msg["content"]);
  if (!content && msg["content"] != null) {
    content = JSON.stringify(msg["content"], null, 2);
  }
  return <ToolBlock label="tool_result" content={content || "(empty)"} />;
}

function UserMessage({ msg }: { msg: StreamMessage }) {
  let text = extractText(msg["content"]);
  if (!text && msg["message"] != null && typeof msg["message"] === "object") {
    text = extractText((msg["message"] as Record<string, unknown>)["content"]);
  }
  return (
    <div className="output-user">
      <div className="output-user-label">You</div>
      <div>{text}</div>
    </div>
  );
}

function PartialMessage({ msg }: { msg: StreamMessage }) {
  // content_block_delta: delta.text or direct text field
  let text = typeof msg["text"] === "string" ? msg["text"] : "";
  if (!text && msg["delta"] != null && typeof msg["delta"] === "object") {
    const delta = msg["delta"] as Record<string, unknown>;
    if (typeof delta["text"] === "string") text = delta["text"];
  }

  return (
    <div className="output-assistant" style={{ opacity: 0.7 }}>
      {text && <span>{text}</span>}
    </div>
  );
}

function ResultMessage({ msg }: { msg: StreamMessage }) {
  const isError =
    msg["subtype"] === "error" || msg["is_error"] === true;

  if (!isError) return null;

  const errText =
    typeof msg["error"] === "string"
      ? msg["error"]
      : typeof msg["result"] === "string"
        ? msg["result"]
        : "Unknown error";

  return (
    <div className="output-error">
      <strong>Error:</strong> {errText}
    </div>
  );
}

function SystemMessage({ msg }: { msg: StreamMessage }) {
  const text =
    typeof msg["content"] === "string"
      ? msg["content"]
      : typeof msg["message"] === "string"
        ? msg["message"]
        : null;

  if (!text) return null;
  return <div className="output-system">{text}</div>;
}

const MessageRow = memo(function MessageRow({
  msg,
}: {
  msg: StreamMessage;
  index: number;
}) {
  switch (msg.type) {
    case "assistant":           return <AssistantMessage msg={msg} />;
    case "tool_use":            return <ToolUseMessage msg={msg} />;
    case "tool_result":         return <ToolResultMessage msg={msg} />;
    case "user":                return <UserMessage msg={msg} />;
    case "content_block_delta": return <PartialMessage msg={msg} />;
    case "result":              return <ResultMessage msg={msg} />;
    case "system":              return <SystemMessage msg={msg} />;
    default:                    return null;
  }
});

// ─── TypingIndicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="Agent is working...">
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}

// ─── OutputFeed ───────────────────────────────────────────────────────────────

export interface OutputFeedProps {
  messages: StreamMessage[];
  /** Whether the agent is currently processing — shows typing indicator. */
  isRunning?: boolean;
  /** CSS height value. Defaults to "100%" to fill parent. */
  height?: string;
  style?: CSSProperties;
}

export function OutputFeed({
  messages,
  isRunning,
  height = "100%",
  style,
}: OutputFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has manually scrolled up
  const isUserScrolled = useRef(false);
  const lastScrollTop = useRef(0);

  // Cap rendered messages at buffer size — memoised to avoid slicing on every render
  const visible = useMemo(
    () =>
      messages.length > MAX_OUTPUT_BUFFER_SIZE
        ? messages.slice(-MAX_OUTPUT_BUFFER_SIZE)
        : messages,
    [messages],
  );

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    const scrolledUp = el.scrollTop < lastScrollTop.current;

    if (scrolledUp && !atBottom) {
      isUserScrolled.current = true;
    }
    if (atBottom) {
      isUserScrolled.current = false;
    }
    lastScrollTop.current = el.scrollTop;
  }, []);

  // Auto-scroll whenever message count or running state changes
  useEffect(() => {
    if (!isUserScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [visible.length, isRunning]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        height,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "var(--space-4)",
        ...style,
      }}
    >
      <div className="output-feed">
        {visible.length === 0 && !isRunning && (
          <div className="output-system">No output yet.</div>
        )}

        {visible.map((msg, idx) => (
          <MessageRow
            key={typeof msg["_seq"] === "number" ? msg["_seq"] : idx}
            msg={msg}
            index={idx}
          />
        ))}

        {isRunning && <TypingIndicator />}

        {/* Scroll anchor */}
        <div ref={bottomRef} style={{ height: 1 }} aria-hidden="true" />
      </div>
    </div>
  );
}
