import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages, watchlistsTable, scanResultsTable, apiKeysTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CreateOpenaiConversationBody,
  SendOpenaiMessageBody,
} from "@workspace/api-zod";
import { runScan, DEFAULT_CONFIG } from "../../lib/scanner";
import { getSectorRotation } from "../../lib/sector";
import { fetchYahooChart } from "../../lib/providers/yahoo";
import { decrypt } from "../../lib/crypto";
import type { TenantProviderKeys } from "../../lib/providers";

// Minimal OpenAI chat types (avoids importing from transitive `openai` pkg)
type ChatRole = "system" | "user" | "assistant" | "tool";
interface ToolCallDef { id: string; type: "function"; function: { name: string; arguments: string } }
type ChatCompletionMessageParam =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: ToolCallDef[] }
  | { role: "tool"; content: string; tool_call_id: string };
interface ChatCompletionTool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

const router = Router();

// ── Tenant API keys ──────────────────────────────────────────────────────────

async function getTenantKeys(tenantId: number): Promise<TenantProviderKeys> {
  try {
    const rows = await db.select().from(apiKeysTable).where(eq(apiKeysTable.tenantId, tenantId)).limit(1);
    const row = rows[0];
    if (!row) return {};
    const safeDecrypt = (enc: string | null | undefined) => {
      if (!enc) return undefined;
      try { return decrypt(enc); } catch { return undefined; }
    };
    return { polygonKey: safeDecrypt(row.polygonApiKeyEnc), finnhubKey: safeDecrypt(row.finnhubApiKeyEnc) };
  } catch { return {}; }
}

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous stock market analysis agent for Motion Scanner v3.0.

You have REAL access to live market data via tools. Use them proactively — don't ask for permission, just execute.

TOOLS AVAILABLE:
- run_scan: Execute a full technical scan on tickers → GO/HOLD/ABORT signals, RSI, ADX, EMA, volume, composite score 0-100
- get_sector_rotation: Live sector ETF performance, leadership/laggard classification, market regime (RISK_ON/RISK_OFF/NEUTRAL)
- list_watchlists: User's saved ticker lists — use before scanning to load tickers
- get_scan_history: Recent scan results history
- get_chart_summary: Recent OHLCV price action for any ticker

AGENT BEHAVIOR:
- When asked to "find" or "screen" stocks: actually run_scan on relevant tickers, then analyze results
- Chain tools: list_watchlists → run_scan on those tickers → structured analysis
- Scan 5–15 tickers at a time (hard limit 50 per run_scan call); make multiple calls for larger universes
- After real data comes back, deliver a quantitative structured analysis

SCAN SIGNAL INTERPRETATION:
- GO: RSI < 65, EMA confirmation, ADX > 20, volume surge — strong bullish setup
- HOLD: Mixed/neutral indicators — wait for clearer direction
- ABORT: Bearish conditions — avoid or consider short
- Composite score 0–100: higher = stronger signal across all factors
- ADX > 25 = strong trend; ADX < 20 = weak/ranging market

Response format: use markdown tables for multi-ticker results. Always include a "Bottom Line" section. Be quantitative and direct.`;

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_scan",
      description: "Run a full technical scan on a list of tickers. Returns GO/HOLD/ABORT signal, RSI, ADX, EMA stack, volume ratio, and composite score (0-100) for each ticker.",
      parameters: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            maxItems: 50,
            description: "Uppercase ticker symbols, e.g. [\"AAPL\", \"NVDA\", \"TSLA\"]. Max 50 per scan; 5–15 recommended for speed.",
          },
        },
        required: ["tickers"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sector_rotation",
      description: "Get live sector ETF performance, leadership/laggard classification, and current market regime (RISK_ON, RISK_OFF, or NEUTRAL).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_watchlists",
      description: "List the user's saved watchlists with all tickers. Use before scanning to retrieve saved ticker lists.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_scan_history",
      description: "Retrieve recent scan history to review past scan results and trends.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Number of recent scans (default 5, max 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chart_summary",
      description: "Fetch recent OHLCV price data for a ticker to analyze recent price action.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol e.g. \"SPY\"" },
          range: {
            type: "string",
            enum: ["1mo", "3mo", "6mo", "1y"],
            description: "Time range (default 1mo)",
          },
        },
        required: ["ticker"],
      },
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  tenantId: number,
): Promise<{ result: unknown; summary: string }> {
  switch (name) {
    case "run_scan": {
      const tickers = (args.tickers as string[]) ?? [];
      if (!tickers.length) return { result: { error: "No tickers" }, summary: "No tickers provided" };
      if (tickers.length > 50) return { result: { error: `Max 50 tickers per scan (got ${tickers.length})` }, summary: `Too many tickers — max 50, got ${tickers.length}` };
      const keys = await getTenantKeys(tenantId);
      const res = await runScan(tickers, DEFAULT_CONFIG, false, keys);
      const summary = `${tickers.length} tickers scanned → ${res.candidates.length} GO, ${res.hold.length} HOLD, ${res.rejected.length} ABORT`;
      return {
        summary,
        result: {
          candidates: res.candidates.map((c: any) => ({
            ticker: c.ticker, signal: "GO", score: +(c.score ?? 0).toFixed(1),
            rsi: +(c.tech?.rsi ?? 0).toFixed(1), adx: +(c.tech?.adx ?? 0).toFixed(1),
            rvol: +(c.tech?.rvol ?? 0).toFixed(2), price: +(c.tech?.price ?? 0).toFixed(2),
            changePct: +(c.tech?.changePct ?? 0).toFixed(2),
            ema9: +(c.tech?.ema9 ?? 0).toFixed(2), ema21: +(c.tech?.ema21 ?? 0).toFixed(2),
          })),
          hold: res.hold.map((c: any) => ({
            ticker: c.ticker, signal: "HOLD", score: +(c.score ?? 0).toFixed(1),
            rsi: +(c.tech?.rsi ?? 0).toFixed(1), adx: +(c.tech?.adx ?? 0).toFixed(1),
            rvol: +(c.tech?.rvol ?? 0).toFixed(2),
          })),
          rejected: res.rejected.map((c: any) => ({
            ticker: c.ticker, signal: "ABORT",
            rsi: +(c.tech?.rsi ?? 0).toFixed(1), adx: +(c.tech?.adx ?? 0).toFixed(1),
          })),
        },
      };
    }

    case "get_sector_rotation": {
      const data = await getSectorRotation() as any;
      const regime = data?.regime ?? "UNKNOWN";
      const leaders = (data?.leaders ?? []).map((s: any) => s.name ?? s.symbol ?? s).join(", ");
      const laggards = (data?.laggards ?? []).map((s: any) => s.name ?? s.symbol ?? s).join(", ");
      return {
        summary: `Regime: ${regime} | Leaders: ${leaders || "none"} | Laggards: ${laggards || "none"}`,
        result: data,
      };
    }

    case "list_watchlists": {
      const rows = await db.select().from(watchlistsTable).where(eq(watchlistsTable.tenantId, tenantId));
      return {
        summary: rows.length === 0 ? "No watchlists" : rows.map((w) => `"${w.name}" (${w.tickers.length} tickers)`).join(", "),
        result: rows.map((w) => ({ id: w.id, name: w.name, tickers: w.tickers })),
      };
    }

    case "get_scan_history": {
      const limit = Math.min(Number(args.limit ?? 5), 10);
      const rows = await db.select().from(scanResultsTable)
        .where(eq(scanResultsTable.tenantId, tenantId))
        .orderBy(desc(scanResultsTable.createdAt))
        .limit(limit);
      return {
        summary: `${rows.length} recent scans retrieved`,
        result: rows.map((r) => ({
          id: r.id, createdAt: r.createdAt.toISOString(),
          tickerCount: r.tickerCount, goCount: r.goCount,
          holdCount: r.holdCount, rejectCount: r.rejectCount, regime: r.regime,
        })),
      };
    }

    case "get_chart_summary": {
      const ticker = String(args.ticker ?? "SPY").toUpperCase();
      const range = String(args.range ?? "1mo") as "1mo" | "3mo" | "6mo" | "1y" | "2y";
      const chart = await fetchYahooChart(ticker, range);
      if (!chart?.closes?.length) return { result: { error: "No data" }, summary: `No chart data for ${ticker}` };
      const closes = chart.closes.slice(-30);
      const latest = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      const changePct = prev ? ((latest - prev) / prev * 100).toFixed(2) : "0";
      return {
        summary: `${ticker} $${latest.toFixed(2)} (${Number(changePct) >= 0 ? "+" : ""}${changePct}%), ${closes.length} candles`,
        result: {
          ticker, range, latest: +latest.toFixed(2), changePct: +changePct,
          high: +Math.max(...closes).toFixed(2), low: +Math.min(...closes).toFixed(2),
          recentCloses: closes.slice(-10).map((c) => +c.toFixed(2)),
        },
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool: ${name}` };
  }
}

// ── CRUD routes ──────────────────────────────────────────────────────────────

router.get("/openai/conversations", async (req, res) => {
  const rows = await db.select().from(conversations)
    .where(eq(conversations.tenantId, req.tenantId))
    .orderBy(conversations.createdAt);
  res.json(rows);
});

router.post("/openai/conversations", async (req, res) => {
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(conversations).values({ tenantId: req.tenantId, title: parsed.data.title }).returning();
  res.status(201).json(row);
});

router.get("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

router.delete("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
  res.status(204).end();
});

router.get("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json(msgs);
});

// ── Agentic message handler (SSE streaming) ──────────────────────────────────

router.post("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  // Persist user message
  await db.insert(messages).values({ conversationId: id, role: "user", content: parsed.data.content });

  // Load full history for context
  const history = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);

  // Build messages
  const loopMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const emit = (data: Record<string, unknown>) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let fullResponse = "";
  const MAX_TURNS = 6;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Stream the response so content chunks are forwarded in real time
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await (openai.chat.completions.create as any)({
        model: "gpt-5.4",
        max_completion_tokens: 8192,
        messages: loopMessages,
        tools: TOOLS,
        stream: true,
      });

      // Accumulate streaming response
      let contentAccum = "";
      const toolCallAccum = new Map<number, { id: string; name: string; args: string }>();
      let finishReason = "";

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Content chunks → forward directly to SSE
        if (choice.delta.content) {
          contentAccum += choice.delta.content;
          emit({ content: choice.delta.content });
        }

        // Tool call delta chunks → accumulate
        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            if (!toolCallAccum.has(tc.index)) {
              toolCallAccum.set(tc.index, { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" });
            }
            const entry = toolCallAccum.get(tc.index)!;
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name += tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      // ── Final answer: content streamed, done ─────────────────────────────
      if (finishReason === "stop" || toolCallAccum.size === 0) {
        fullResponse = contentAccum;
        break;
      }

      // ── Tool calls: push assistant message and execute tools ─────────────
      const toolCallList = Array.from(toolCallAccum.values());
      loopMessages.push({
        role: "assistant",
        content: contentAccum || null,
        tool_calls: toolCallList.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args },
        })),
      });

      const toolResultMessages: ChatCompletionMessageParam[] = [];
      for (const tc of toolCallList) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.args || "{}"); } catch {}

        // Emit tool call event (shows spinner in UI)
        emit({ tool_call: { name: tc.name, args } });

        // Execute
        let toolResult: { result: unknown; summary: string };
        try {
          toolResult = await executeTool(tc.name, args, req.tenantId);
        } catch (err) {
          toolResult = { result: { error: String(err) }, summary: `Error: ${String(err)}` };
        }

        // Emit tool result event
        emit({ tool_result: { name: tc.name, summary: toolResult.summary } });

        toolResultMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult.result),
        });
      }
      loopMessages.push(...toolResultMessages);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit({ error: errMsg });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  // Persist assistant message
  if (fullResponse) {
    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
  }

  emit({ done: true });
  res.end();
});

export default router;
