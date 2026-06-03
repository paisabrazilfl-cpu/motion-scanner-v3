import { useState, useEffect, useRef } from "react";
import {
  useGetNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from "@workspace/api-client-react";
import type { Note } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, StickyNote, Clock, ChevronLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const NOTES_KEY = ["/api/notes"];

function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ""; }
}

export function Notes() {
  const queryClient = useQueryClient();
  const { data: notes = [], isLoading } = useGetNotes({
    query: { queryKey: NOTES_KEY, staleTime: 0 },
  });

  const createNote = useCreateNote({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTES_KEY }),
    },
  });
  const updateNote = useUpdateNote({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTES_KEY }),
    },
  });
  const deleteNote = useDeleteNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: NOTES_KEY });
        setActiveId(null);
      },
    },
  });

  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load selected note into editor
  useEffect(() => {
    if (activeId === null) { setTitle(""); setContent(""); setDirty(false); return; }
    const note = notes.find((n: Note) => n.id === activeId);
    if (note) { setTitle(note.title); setContent(note.content); setDirty(false); }
  }, [activeId, notes]);

  // Auto-save on change (500ms debounce)
  function scheduleAutoSave(newTitle: string, newContent: string) {
    if (!activeId) return;
    setDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateNote.mutate({ id: activeId, data: { title: newTitle, content: newContent } });
      setDirty(false);
    }, 500);
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    scheduleAutoSave(v, content);
  }
  function handleContentChange(v: string) {
    setContent(v);
    scheduleAutoSave(title, v);
  }

  // Flush on manual save (Ctrl+S)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!activeId || !dirty) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        updateNote.mutate({ id: activeId, data: { title, content } });
        setDirty(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, title, content, dirty, updateNote]);

  async function handleNewNote() {
    const result = await createNote.mutateAsync({ data: { title: "Untitled", content: "" } });
    setActiveId(result.id);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this note?")) return;
    deleteNote.mutate({ id });
  }

  const activeNote = notes.find((n: Note) => n.id === activeId);

  // Sort newest-updated first
  const sorted = [...notes].sort(
    (a: Note, b: Note) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <div className={cn(
        "w-full md:w-64 md:flex-shrink-0 border-r border-border flex-col bg-card/50",
        activeId ? "hidden md:flex" : "flex"
      )}>
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Notes</span>
            {notes.length > 0 && (
              <span className="text-xs text-muted-foreground font-mono">({notes.length})</span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={handleNewNote}
            disabled={createNote.isPending}
            title="New note"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Note list */}
        <ScrollArea className="flex-1">
          {isLoading && (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded bg-muted/20 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && sorted.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground space-y-3">
              <StickyNote className="h-8 w-8 mx-auto opacity-20" />
              <p>No notes yet.</p>
              <Button size="sm" variant="outline" onClick={handleNewNote} className="text-xs">
                <Plus className="h-3 w-3 mr-1" /> New note
              </Button>
            </div>
          )}

          <div className="py-1">
            {sorted.map((note: Note) => (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(note.id)}
                onKeyDown={(e) => e.key === "Enter" && setActiveId(note.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 group hover:bg-muted/40 transition-colors relative cursor-pointer select-none",
                  activeId === note.id && "bg-muted/60 border-l-2 border-l-[hsl(var(--go-color))]"
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={cn(
                    "text-xs font-medium truncate leading-snug",
                    activeId === note.id ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {note.title || "Untitled"}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDelete(note.id, e)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleDelete(note.id, e as unknown as React.MouseEvent); }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all mt-0.5 cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    {timeAgo(note.updatedAt)}
                  </span>
                </div>
                {note.content && (
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 line-clamp-1 leading-relaxed">
                    {note.content.slice(0, 60)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Editor ────────────────────────────────────────────────────── */}
      <div className={cn(
        "flex-1 flex-col overflow-hidden",
        activeId ? "flex" : "hidden md:flex"
      )}>
        {activeId && activeNote ? (
          <>
            {/* Editor toolbar */}
            <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border">
              <Button
                size="icon"
                variant="ghost"
                className="md:hidden h-7 w-7 shrink-0 -ml-1 text-muted-foreground"
                onClick={() => setActiveId(null)}
                title="Back to notes"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Note title…"
                className="flex-1 border-0 bg-transparent text-base font-semibold px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40"
              />
              <div className="flex items-center gap-3 flex-shrink-0">
                {dirty && (
                  <span className="text-[10px] font-mono text-muted-foreground/60 animate-pulse">
                    saving…
                  </span>
                )}
                {!dirty && (
                  <span className="text-[10px] font-mono text-muted-foreground/40">
                    saved · {timeAgo(activeNote.updatedAt)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                  onClick={(e) => handleDelete(activeId, e)}
                  title="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Textarea */}
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start writing… (Ctrl+S to save)"
              className="flex-1 resize-none border-0 rounded-none bg-transparent px-6 py-4 text-sm font-mono leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/30"
            />
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <StickyNote className="h-16 w-16 text-muted-foreground/10" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">No note selected</p>
              <p className="text-xs text-muted-foreground/60">
                Select a note from the sidebar or create a new one.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleNewNote} className="text-xs mt-2">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New note
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
