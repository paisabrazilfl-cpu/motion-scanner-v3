import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Plus, Trash2, ChevronRight, Sparkles, Loader2, RotateCcw } from "lucide-react";
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

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  streaming?: boolean;
}

// ── Markdown renderer (lightweight) ─────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const html = content
    // Code blocks
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, _lang, code: string) =>
      `<pre class="bg-black/40 border border-border rounded p-3 my-2 overflow-x-auto text-xs"><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-black/40 px-1 rounded text-xs font-mono text-green-400">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-foreground mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-foreground mt-4 mb-1 border-b border-border pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-foreground mt-4 mb-2">$1</h1>')
    // Tables — wrap in overflow div
    .replace(/(\|.+\|\n)+/g, (match) => {
      const rows = match.trim().split("\n");
      const header = rows[0];
      const body = rows.slice(2); // skip separator
      const thCells = header.split("|").filter(Boolean).map((c) =>
        `<th class="px-3 py-1 text-left text-xs font-semibold text-muted-foreground border-b border-border">${c.trim()}</th>`
      ).join("");
      const trRows = body.map((row) => {
        const cells = row.split("|").filter(Boolean).map((c) =>
          `<td class="px-3 py-1 text-xs border-b border-border/40">${c.trim()}</td>`
        ).join("");
        return `<tr class="hover:bg-white/5">${cells}</tr>`;
      }).join("");
      return `<div class="overflow-x-auto my-2"><table class="w-full text-left border border-border rounded"><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table></div>`;
    })
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-border my-3" />')
    // Bullet lists
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="mb-2 text-sm leading-relaxed">')
    // Line breaks
    .replace(/\n/g, "<br />");

  return (
    <div
      className="prose prose-invert max-w-none text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-2 text-sm leading-relaxed">${html}</p>` }}
    />
  );
}

// ── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Find oversold large-caps with bullish MACD crossover",
  "Explain RSI divergence and how to trade it",
  "What sector rotation signals suggest a risk-on environment?",
  "Build a watchlist of high-ADX momentum stocks",
  "Analyze these scan results: AAPL GO 82, NVDA GO 91, TSLA ABORT 34",
  "When should I use ADX vs RSI for entry timing?",
];

// ── Main component ───────────────────────────────────────────────────────────

export function Agent() {
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: convList = [], refetch: refetchConvs } = useListOpenaiConversations();
  const { data: convDetail, refetch: refetchDetail } = useGetOpenaiConversation(
    activeConvId ?? 0,
    { query: { enabled: activeConvId !== null, queryKey: ["openai-conv", activeConvId] } }
  );
  const createConv = useCreateOpenaiConversation();
  const deleteConv = useDeleteOpenaiConversation();

  // Load messages when conversation changes
  useEffect(() => {
    if (convDetail?.messages) {
      setMessages(
        convDetail.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
        }))
      );
    }
  }, [convDetail]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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
    if (!targetConvId) {
      targetConvId = await startNewConversation(content);
    }

    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/openai/conversations/${targetConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              accumulated += data.content;
              setStreamingContent(accumulated);
            } else if (data.done) {
              const assistantMsg: Message = {
                id: `tmp-assistant-${Date.now()}`,
                role: "assistant",
                content: accumulated,
                createdAt: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMsg]);
              setStreamingContent("");
              // Refresh from server to get real IDs
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
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ Error: ${errMsg}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  }, [streaming, activeConvId, startNewConversation, refetchDetail]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleDeleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConv.mutateAsync({ id });
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
    refetchConvs();
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div className="w-56 border-r border-border flex flex-col bg-sidebar shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => startNewConversation()}
            title="New conversation"
          >
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
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => handleDeleteConv(conv.id, e)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* ── Main chat area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-3 shrink-0">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <h1 className="font-semibold text-sm">Market Analysis Agent</h1>
            <p className="text-xs text-muted-foreground">
              Autonomous market intelligence — powered by GPT-5
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-green-500/40 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block" />
              Ready
            </Badge>
          </div>
        </div>

        {/* Messages area */}
        <ScrollArea className="flex-1 px-6 py-4">
          {/* Empty state */}
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-semibold">What would you like to analyze?</h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Ask about stocks, indicators, scan results, or market conditions. I can build watchlists, interpret technicals, and explain market dynamics.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-xs px-3 py-2 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming bubble */}
            {streaming && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 bg-card border border-border rounded-lg px-4 py-3">
                  {streamingContent ? (
                    <MarkdownContent content={streamingContent} />
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking…
                    </div>
                  )}
                  <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t border-border px-6 py-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about stocks, technicals, market conditions… (Enter to send, Shift+Enter for newline)"
                  className="min-h-[60px] max-h-[180px] resize-none pr-4 font-mono text-xs bg-card border-border focus-visible:ring-1 focus-visible:ring-primary"
                  disabled={streaming}
                />
              </div>
              {streaming ? (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={stopStreaming}
                  className="h-10 w-10 shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
                  title="Stop"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className="h-10 w-10 shrink-0"
                  title="Send (Enter)"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 text-center">
              Uses Replit AI (OpenAI GPT-5) · Conversations are saved per tenant
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold",
        isUser ? "bg-primary/20 text-primary" : "bg-primary/20"
      )}>
        {isUser ? "U" : <Bot className="h-4 w-4 text-primary" />}
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 rounded-lg px-4 py-3 max-w-[85%]",
        isUser
          ? "bg-primary/10 border border-primary/20 text-sm"
          : "bg-card border border-border"
      )}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </div>
    </div>
  );
}
