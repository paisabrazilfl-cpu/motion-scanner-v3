---
name: Motion Scanner mobile responsive patterns
description: Conventions for making the motion-scanner web frontend adapt across mobile/tablet/desktop
---

# Mobile responsive patterns (artifacts/motion-scanner)

Tailwind default breakpoints (sm 640 / md 768 / lg 1024). The app forces `.dark`.

## Shell
- Desktop sidebar is `hidden lg:flex w-64`; below lg a `lg:hidden` top bar shows a hamburger toggling a fixed slide-in drawer. Drawer closes on route change and nav-item click.

## Reusing desktop lists inside mobile drawers/sheets
- **Never leave a hover-gated control as the only affordance on mobile.** A control styled `opacity-0 group-hover:opacity-100` is invisible/inaccessible on touch.
  **Why:** touch devices have no reliable hover; a code review failed because the Agent conversation *delete* button (reused in a mobile `Sheet`) was hover-only.
  **How to apply:** make it `opacity-100 md:opacity-0 md:group-hover:opacity-100` (always visible on mobile, hover-gated on desktop).
- When a feature lives only in a desktop sidebar (e.g. Agent conversation list: select/new/delete), give mobile real parity — extract the list into a shared component and render it in both the desktop sidebar and a mobile `Sheet` (shadcn `Sheet side="left"`), not just a single "new" button.

## Other
- shadcn `Sheet`/`SheetContent` supports `side="left"`; widths should be `w-full sm:w-[Npx]` so sheets are full-width on phones.
- Wide tables: wrap in `overflow-x-auto` + `min-w-[Npx]` rather than letting them overflow the page.
- Status/metadata rows that can overflow on phones: use `flex flex-wrap` with `gap-x/gap-y`.
