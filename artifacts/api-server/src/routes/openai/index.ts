import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CreateOpenaiConversationBody,
  SendOpenaiMessageBody,
} from "@workspace/api-zod";

const router = Router();

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a specialized stock market analysis agent for Motion Scanner v3.0.

You have access to a full-stack scanning platform that tracks:
- Technical indicators: RSI, EMA, ADX, Bollinger Bands, MACD, Stochastic
- Tri-state scan results: GO (strong buy signal), HOLD (neutral), ABORT (strong sell signal)
- Sector rotation and market regime detection (RISK_ON / RISK_OFF / NEUTRAL)
- Composite scoring (0-100) combining multiple indicators

When users ask about stocks, provide analysis based on:
1. Technical indicator interpretation (RSI oversold <30, overbought >70; ADX >25 = strong trend)
2. Scan qualification logic (GO requires RSI <65, EMA confirmation, ADX >20, volume surge)
3. Sector context (leading vs lagging sectors, market regime)
4. Risk management principles

Response format guidelines:
- Use markdown with clear sections
- For screener-style tasks, produce a structured table with ticker | signal | key metrics
- Always include a concise "Bottom Line" summary at the end
- Flag when data may be stale or context is limited
- Be direct and quantitative — traders need numbers, not vague sentiment

You cannot directly query live market data in real-time, but you can analyze scan results the user pastes, interpret indicators, build watchlists, explain market dynamics, and provide detailed technical analysis frameworks.

Current platform context: Multi-tenant SOC 2 environment. Scans use Yahoo Finance data with 5-min cache.`;

// ── GET /openai/conversations ───────────────────────────────────────────────

router.get("/openai/conversations", async (req, res) => {
  const tenantId = req.tenantId;
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.tenantId, tenantId))
    .orderBy(conversations.createdAt);
  res.json(rows);
});

// ── POST /openai/conversations ──────────────────────────────────────────────

router.post("/openai/conversations", async (req, res) => {
  const tenantId = req.tenantId;
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(conversations)
    .values({ tenantId, title: parsed.data.title })
    .returning();
  res.status(201).json(row);
});

// ── GET /openai/conversations/:id ───────────────────────────────────────────

router.get("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  res.json({ ...conv, messages: msgs });
});

// ── DELETE /openai/conversations/:id ────────────────────────────────────────

router.delete("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
  res.status(204).end();
});

// ── GET /openai/conversations/:id/messages ──────────────────────────────────

router.get("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json(msgs);
});

// ── POST /openai/conversations/:id/messages (SSE streaming) ─────────────────

router.post("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  // Persist user message
  await db.insert(messages).values({
    conversationId: id,
    role: "user",
    content: parsed.data.content,
  });

  // Load full history for context
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const chatMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Stream SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
    res.end();
    return;
  }

  // Persist assistant message
  await db.insert(messages).values({
    conversationId: id,
    role: "assistant",
    content: fullResponse,
  });

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
