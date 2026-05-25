import { Router } from "express";
import { db, notesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

// GET /api/notes
router.get("/notes", async (req, res): Promise<void> => {
  const notes = await db
    .select()
    .from(notesTable)
    .where(eq(notesTable.tenantId, req.tenantId))
    .orderBy(notesTable.updatedAt);
  res.json(notes);
});

// POST /api/notes
router.post("/notes", async (req, res): Promise<void> => {
  const { title, content } = req.body as { title?: string; content?: string };
  const [note] = await db
    .insert(notesTable)
    .values({ tenantId: req.tenantId, title: title ?? "Untitled", content: content ?? "" })
    .returning();
  await logAudit(req, { tenantId: req.tenantId, action: "notes.create", resourceType: "note", resourceId: String(note.id), metadata: { title: note.title } });
  res.status(201).json(note);
});

// PUT /api/notes/:id
router.put("/notes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, content } = req.body as { title?: string; content?: string };
  const updates: Partial<{ title: string; content: string }> = {};
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  const [note] = await db
    .update(notesTable)
    .set(updates)
    .where(and(eq(notesTable.id, id), eq(notesTable.tenantId, req.tenantId)))
    .returning();
  if (!note) { res.status(404).json({ error: "Note not found" }); return; }
  res.json(note);
});

// DELETE /api/notes/:id
router.delete("/notes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db
    .delete(notesTable)
    .where(and(eq(notesTable.id, id), eq(notesTable.tenantId, req.tenantId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Note not found" }); return; }
  await logAudit(req, { tenantId: req.tenantId, action: "notes.delete", resourceType: "note", resourceId: String(deleted.id), metadata: { title: deleted.title } });
  res.status(204).end();
});

export default router;
