import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, Plus, Trash2, ChevronRight, Sparkles, Loader2,
  RotateCcw, Search, TrendingUp, List, History, BarChart2, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  useDeleteOpenaiConversation,
} from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolEvent {
  type: "call" | "result";
  name: string;
  args?: Record<string, unknown>;
  summary?: string;
}

interface Message {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  toolEvents?: ToolEvent[];
}

// ── Tool metadata ─────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  run_scan:           { label: "Running scan",          icon: Search },
  get_sector_rotation:{ label: "Sector rotation",       icon: TrendingUp },
  list_watchlists:    { label: "Loading watchlists",    icon: List },
  get_scan_history:   { label: "Scan history",          icon: History },
  get_chart_summary:  { label: "Chart data",            icon: BarChart2 },
};

function toolLabel(name: string) { return TOOL_META[name]?.label ?? name; }
function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TOOL_META[name]?.icon ?? Search;
  return <Icon className={className} />;
}

// ── Tool call card ────────────────────────────────────────────────────────────

function ToolCallCard({ event }: { event: ToolEvent }) {
  const isDone = event.type === "result";
  return (
    <div className={cn(
      "flex items-start gap-2 py-1.5 px-3 rounded-md text-xs border my-1 transition-all",
      isDone
        ? "bg-green-950/20 border-green-500/20 text-green-400"
        : "bg-primary/5 border-primary/20 text-primary"
    )}>
      {isDone
        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        : <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" />
      }
      <div className="flex-1 min-w-0">
        <span className="font-semibold">
          {isDone ? "✓ " : ""}{toolLabel(event.name)}
          {!isDone && event.args && (() => {
            const a = event.args;
            if (a.tickers) return `: ${(a.tickers as string[]).slice(0, 6).join(", ")}${(a.tickers as string[]).length > 6 ? "…" : ""}`;
            if (a.ticker) return `: ${a.ticker}`;
            return "";
          })()}
        </span>
        {isDone && event.summary && (
          <span className="ml-1 opacity-80">{event.summary}</span>
        )}
      </div>
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const html = content
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_: string, _lang: string, code: string) =>
      `<pre class="bg-black/40 border border-border rounded p-3 my-2 overflow-x-auto text-xs"><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code class="bg-black/40 px-1 rounded text-xs font-mono text-green-400">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-foreground mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-foreground mt-4 mb-1 border-b border-border pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-foreground mt-4 mb-2">$1</h1>')
    .replace(/(\|.+\|\n)+/g, (match: string) => {
      const rows = match.trim().split("\n");
      const header = rows[0];
      const body = rows.slice(2);
      const thCells = header.split("|").filter(Boolean).map((c) =>
        `<th class="px-3 py-1 text-left text-xs font-semibold text-muted-foreground border-b border-border whitespace-nowrap">${c.trim()}</th>`
      ).join("");
      const trRows = body.map((row) => {
        const cells = row.split("|").filter(Boolean).map((c) =>
          `<td class="px-3 py-1 text-xs border-b border-border/40 whitespace-nowrap">${c.trim()}</td>`
        ).join("");
        return `<tr class="hover:bg-white/5">${cells}</tr>`;
      }).join("");
      return `<div class="overflow-x-auto my-2"><table class="text-left border border-border rounded"><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table></div>`;
    })
    .replace(/^---$/gm, '<hr class="border-border my-3" />')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-2 text-sm leading-relaxed">')
    .replace(/\n/g, "<br />");

  return (
    <div
      className="prose prose-invert max-w-none text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-2 text-sm leading-relaxed">${html}</p>` }}
    />
  );
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: "Scan my watchlists for GO signals", prompt: "Load my watchlists and scan them for GO signals. Show me the top opportunities sorted by composite score." },
  { label: "Current sector rotation", prompt: "What is the current sector rotation? Which sectors are leading and which are lagging? What does this suggest about the market regime?" },
  { label: "Oversold large-caps with bullish MACD", prompt: "Scan AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, JPM, V, JNJ for oversold conditions with bullish MACD. Highlight any with RSI below 45 and ADX above 20." },
  { label: "Analyze SPY price action", prompt: "Get the recent chart data for SPY and QQQ and tell me about the current trend, momentum, and any key levels to watch." },
  { label: "Best setups across tech", prompt: "Scan AAPL, NVDA, AMD, MSFT, META, GOOGL, AMZN, TSLA, NFLX, ORCL for the strongest technical setups right now." },
  { label: "Recent scan history recap", prompt: "Review my recent scan history. What tickers have been appearing as GO signals repeatedly? What patterns do you see?" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function Agent() {
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolEvent[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: convList = [], refetch: refetchConvs } = useListOpenaiConversations();
  const { data: convDetail, refetch: refetchDetail } = useGetOpenaiConversation(
    activeConvId ?? 0,
    { query: { enabled: activeConvId !== null, queryKey: ["openai-conv", activeConvId] } }
  );
  const createConv = useCreateOpenaiConversation();
  const deleteConv = useDeleteOpenaiConversation();

  useEffect(() => {
    if (convDetail?.messages) {
      setMessages(convDetail.messages.map((m) => ({
        id: m.id, role: m.role as "user" | "assistant",
        content: m.content, createdAt: m.createdAt,
      })));
    }
  }, [convDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, streamingTools]);

  const startNewConversation = useCallback(async (firstMessage?: string) => {
    const title = firstMessage
      ? firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "…" : "")
      : "New conversation";
    const conv = await createConv.mutateAsync({ data: { title } });
    setActiveConvId(conv.id);
    setMessages([]);
    refetchConvs();
    return conv.id;
  }, [createConv, refetchConvs]);

  const sendMessage = useCallback(async (content: string, convId?: number) => {
    if (!content.trim() || streaming) return;

    let targetConvId = convId ?? activeConvId;
    if (!targetConvId) targetConvId = await startNewConversation(content);

    const userMsg: Message = {
      id: `tmp-${Date.now()}`, role: "user",
      content: content.trim(), createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamingContent("");
    setStreamingTools([]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/openai/conversations/${targetConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      const toolEventsAccum: ToolEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.content) {
              accumulated += data.content;
              setStreamingContent(accumulated);

            } else if (data.tool_call) {
              const ev: ToolEvent = { type: "call", name: data.tool_call.name, args: data.tool_call.args };
              toolEventsAccum.push(ev);
              setStreamingTools([...toolEventsAccum]);

            } else if (data.tool_result) {
              // Find the matching call and add a result event
              const ev: ToolEvent = { type: "result", name: data.tool_result.name, summary: data.tool_result.summary };
              toolEventsAccum.push(ev);
              setStreamingTools([...toolEventsAccum]);

            } else if (data.done) {
              const assistantMsg: Message = {
                id: `tmp-assistant-${Date.now()}`, role: "assistant",
                content: accumulated, createdAt: new Date().toISOString(),
                toolEvents: toolEventsAccum.length > 0 ? [...toolEventsAccum] : undefined,
              };
              setMessages((prev) => [...prev, assistantMsg]);
              setStreamingContent("");
              setStreamingTools([]);
              setTimeout(() => refetchDetail(), 300);

            } else if (data.error) {
              throw new Error(data.error);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // user cancelled
      } else {
        setMessages((prev) => [...prev, {
          id: `err-${Date.now()}`, role: "assistant",
          content: `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`,
          createdAt: new Date().toISOString(),
        }]);
      }
    } finally {
      setStreaming(false);
      setStreamingContent("");
      setStreamingTools([]);
      abortRef.current = null;
    }
  }, [streaming, activeConvId, startNewConversation, refetchDetail]);

  const handleDeleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConv.mutateAsync({ id });
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
    refetchConvs();
  };

  // Get active pending tools (calls without matching results)
  const pendingTools = streamingTools.filter((ev, i) => {
    if (ev.type !== "call") return false;
    return !streamingTools.slice(i + 1).some((r) => r.type === "result" && r.name === ev.name);
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-56 border-r border-border flex flex-col bg-sidebar shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startNewConversation()} title="New">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {convList.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">No conversations yet</p>
          )}
          {[...convList].reverse().map((conv) => (
            <div
              key={conv.id}
              onClick={() => { setActiveConvId(conv.id); refetchDetail(); }}
              className={cn(
                "flex items-center gap-1 px-2 py-2 cursor-pointer group border-b border-border/30 hover:bg-sidebar-accent/50 transition-colors",
                activeConvId === conv.id && "bg-sidebar-accent"
              )}
            >
              <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground", activeConvId === conv.id && "text-primary")} />
              <span className="text-xs truncate flex-1">{conv.title}</span>
              <Button size="icon" variant="ghost" className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => handleDeleteConv(conv.id, e)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* ── Chat area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-3 shrink-0">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <h1 className="font-semibold text-sm">Market Analysis Agent</h1>
            <p className="text-xs text-muted-foreground">Live data access · Scans · Sector rotation · Chart analysis</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {streaming && pendingTools.length > 0 && (
              <Badge variant="outline" className="text-xs border-primary/40 text-primary gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {pendingTools.map((t) => toolLabel(t.name)).join(", ")}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-xs gap-1", streaming ? "border-yellow-500/40 text-yellow-400" : "border-green-500/40 text-green-400")}>
              <span className={cn("w-1.5 h-1.5 rounded-full inline-block", streaming ? "bg-yellow-500 animate-pulse" : "bg-green-500")} />
              {streaming ? "Thinking…" : "Ready"}
            </Badge>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-4">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-semibold">Autonomous Market Agent</h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  I can run real scans, check sector rotation, load your watchlists, and analyze price data live — not just answer from training data.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.prompt)}
                    className="text-left text-xs px-3 py-2.5 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <span className="font-medium text-foreground block mb-0.5">{s.label}</span>
                    <span className="line-clamp-1 opacity-70">{s.prompt.slice(0, 70)}…</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Live streaming bubble */}
            {streaming && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 bg-card border border-border rounded-lg px-4 py-3">
                  {/* Tool events during stream */}
                  {streamingTools.length > 0 && (
                    <div className="mb-2 space-y-0.5">
                      {/* Show only unique tool calls with their latest status */}
                      {getDeduplicatedToolEvents(streamingTools).map((ev, i) => (
                        <ToolCallCard key={i} event={ev} />
                      ))}
                    </div>
                  )}

                  {streamingContent ? (
                    <>
                      <MarkdownContent content={streamingContent} />
                      <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {streamingTools.length > 0 ? "Analyzing results…" : "Thinking…"}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border px-6 py-4 shrink-0">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask the agent to scan tickers, analyze the market, or load your watchlists… (Enter to send)"
              className="min-h-[60px] max-h-[180px] resize-none font-mono text-xs bg-card border-border focus-visible:ring-1 focus-visible:ring-primary"
              disabled={streaming}
            />
            {streaming ? (
              <Button size="icon" variant="outline" onClick={() => abortRef.current?.abort()}
                className="h-10 w-10 shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10">
                <RotateCcw className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" onClick={() => sendMessage(input)} disabled={!input.trim()} className="h-10 w-10 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 text-center max-w-3xl mx-auto">
            Powered by GPT-5 with live scanner access · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deduplicate tool events: for each tool name, show the latest status */
function getDeduplicatedToolEvents(events: ToolEvent[]): ToolEvent[] {
  const map = new Map<string, ToolEvent>();
  for (const ev of events) {
    const key = `${ev.name}-${ev.type}`;
    map.set(key, ev);
  }
  // For each name, prefer "result" over "call"
  const byName = new Map<string, ToolEvent>();
  for (const [, ev] of map) {
    const existing = byName.get(ev.name);
    if (!existing || ev.type === "result") byName.set(ev.name, ev);
  }
  return Array.from(byName.values());
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold",
        "bg-primary/20"
      )}>
        {isUser ? <span className="text-primary">U</span> : <Bot className="h-4 w-4 text-primary" />}
      </div>
      <div className={cn(
        "flex-1 rounded-lg px-4 py-3 max-w-[88%]",
        isUser ? "bg-primary/10 border border-primary/20" : "bg-card border border-border"
      )}>
        {/* Tool events for assistant messages (from history) */}
        {!isUser && message.toolEvents && message.toolEvents.length > 0 && (
          <div className="mb-2 space-y-0.5">
            {getDeduplicatedToolEvents(message.toolEvents).map((ev, i) => (
              <ToolCallCard key={i} event={ev} />
            ))}
          </div>
        )}
        {isUser
          ? <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          : <MarkdownContent content={message.content} />
        }
      </div>
    </div>
  );
}
