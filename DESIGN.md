---
version: alpha
name: Laminar
description: Dark-themed, data-dense visual system for an open-source AI observability platform. Scope is the Next.js app under `frontend/` only. Built on shadcn/ui + Tailwind defaults — this file documents only what is unique to Laminar.
colors:
  background: "#0A0A0A"
  foreground: "#E8E3E3"
  card: "#121212"
  card-foreground: "#C8C8D0"
  popover: "#141414"
  popover-foreground: "#E8E3E3"
  primary: "#D07149"
  primary-foreground: "#E8E8E8"
  secondary: "#121212"
  secondary-foreground: "#B5B5B5"
  muted: "#222226"
  muted-foreground: "#858585"
  accent: "#27292F"
  accent-foreground: "#FFFFFF"
  border: "#2B2B31"
  input: "#2B2B31"
  ring: "#91C3FD"
  destructive: "#CC3333"
  destructive-foreground: "#F8FAFC"
  destructive-bright: "#E25050"
  success: "#16A34A"
  success-foreground: "#FFF1F2"
  success-bright: "#36D399"
  tool: "#E2A108"
  llm: "#7C3BED"
  llm-foreground: "#C17AFF"
  subagent: "#07BDD5"
---

# Laminar Design System

## Overview

Laminar is an open-source observability platform for AI agents. The UI is built for developers debugging long-running agent traces, evaluating model outputs, and writing SQL against ingested spans — so the visual system is **dense, dark, and functional** over spacious or decorative.

The product runs dark by default. There is no light mode in production; the dark palette below is canonical.

Information density beats whitespace. Default button height is 28px (not the shadcn default of 40px). Default body size is 14px. Cards use 24px internal padding. The aesthetic borrows from engineering tools (Linear, Vercel dashboards), not consumer apps: tight, readable, minimal motion.

**This document only specifies what is unique to Laminar.** The frontend is built on [shadcn/ui](https://ui.shadcn.com) primitives consuming Tailwind defaults — typography scale, spacing scale, border-radius scale, and standard component anatomies (Card → Header/Title/Description/Content/Footer, Dialog overlay treatment, Badge structure, etc.) all follow those defaults. Look here for the palette and the lmnr-specific deviations; look at the shadcn docs and Tailwind defaults for everything else.

## Colors

The palette is intentionally narrow. Four tonal layers (`background` → `card`/`secondary` → `popover` → `accent`) carry hierarchy through background shifts; a single brand accent (`primary`) drives action. Semantic colors (`destructive`, `success`) appear only where their meaning is unambiguous. Three feature colors (`tool`, `llm`, `subagent`) belong to span-type rendering and nowhere else.

- **Background (`#0A0A0A`):** Page surface. Near-black, not pure black.
- **Card (`#121212`):** Primary container background. First tonal step up. Always paired with `border` + `shadow-sm`.
- **Popover (`#141414`):** Dropdowns, menus, tooltips. One step above `card` to read as elevated.
- **Primary (`#D07149`):** Brand accent — warm clay orange. Used for the single most important action per screen. Never for body text or decorative fills.
- **Secondary (`#121212`):** Quiet action background, identical tone to `card`. Used for inputs, secondary buttons, and surfaces that still need to read as "interactive."
- **Muted (`#222226`):** Disabled fills, skeleton states, table zebra rows.
- **Accent (`#27292F`):** Hover and focus states for interactive surfaces. The fourth tonal layer.
- **Border (`#2B2B31`):** All borders, 1px. Slightly lighter than `accent` so it reads as edge, not fill. `input` shares the value.
- **Ring (`#91C3FD`):** Focus ring. Cool blue against the warm primary so focus is never mistaken for selection.
- **Destructive (`#CC3333`):** Delete, discard, irreversible-action confirmations. `destructive-bright` (`#E25050`) is reserved for inline warnings against bright surfaces.
- **Success (`#16A34A`):** Approved states, successful runs, healthy indicators. `success-bright` (`#36D399`) for chart fills.
- **Tool (`#E2A108`), LLM (`#7C3BED`), Subagent (`#07BDD5`):** Span-type identifiers. Product semantics, not generic palette slots — keep them inside trace and span UI.

## Components

shadcn primitives are the baseline — Card/Dialog/Badge/Popover anatomies, default Button/Input behavior, focus/hover/disabled states all follow shadcn defaults consuming the color tokens above. This section documents only Laminar's deviations and additions.

### Button

Laminar's button **defaults to 28px tall (`h-7`) with 12px text**, not shadcn's default 40px. This is the density choice that defines the rest of the UI; do not bump it without a clear reason.

Size scale: `sm` (22px) · **`default` (28px, baseline)** · `md` (32px) · `lg` (40px, hero CTAs only) · `icon` (28×28 square).

Variants beyond shadcn defaults (`default`, `secondary`, `outline`, `ghost`, `destructive`, `link`):

- **`destructiveOutline`** — same color as `destructive` but as an outlined button. Use when the destructive action is one of several in a row and a solid red would dominate.
- **`outlinePrimary`** — primary-colored outlined button. The "soft primary" — call-to-action affordance without claiming the single solid `default` slot.
- **`warning` / `warningOutline`** — amber (`amber-500`/`amber-600`). For non-destructive cautions (rate-limit warnings, billing nudges). Not in the palette as a token because it's amber-direct, not a semantic role.
- **`secondaryLight`** — `bg-secondary` without the `secondary-foreground/20` border the standard `secondary` carries. Use inside dense toolbars where the border would add noise.
- **`light` / `lightSecondary`** — landing-page only. Do not use in the app.

The button also accepts an `icon` prop (mapped to a Lucide icon) and built-in loading state, so most callers do not wrap the button to add an icon.

### Input

Three sizes: **`xs` (28px, the default — matches button-default height)** · `sm` (32px) · `md` (36px). Smaller than typical shadcn (default 40px); chosen so an input and a default button line up in a form row.

Background is always **`bg-secondary`**, never `bg-card` or transparent — the dark gray fill is what signals "editable surface" against a card background. This is a project-wide rule; an input that looks like a card stops reading as editable.

Focus border switches to `primary`. Invalid (`aria-invalid`) border switches to `destructive` with a `destructive/20` ring.

### Span indicators (Laminar-specific)

Small inline pills that identify span types in trace views — not a shadcn primitive. Three variants, one per feature color:

- **Tool span** — `bg-tool text-background`, 12px, `rounded-sm`. Amber.
- **LLM span** — `bg-llm text-llm-foreground`, same shape. Purple.
- **Subagent span** — `bg-subagent text-background`, same shape. Cyan.

These appear in trace transcripts, span trees, and span lists. They share the visual pattern of badges but are semantically a span-type label, so the color is product-meaningful, not stylistic.

### Everything else

Card, Dialog, Popover, DropdownMenu, Badge, Sheet, Toast — straight shadcn defaults consuming our color tokens. The only project-wide rule across all of them: containers stack **tonal shift + 1px border + subtle shadow** (`shadow-sm` for cards/badges, `shadow-md` for dropdowns/popovers, `shadow-lg` for dialogs/toasts). No inset shadows, no colored shadows.

## Do's and Don'ts

- Do use `primary` for the single most important action per screen. Don't decorate with it.
- Do reserve `tool` (amber), `llm` (purple), and `subagent` (cyan) for span-type rendering. Don't reuse them as generic accents.
- Do keep buttons at `default` size (28px). Reserve `md` and `lg` for hero CTAs and form-submit buttons on settings pages.
- Don't use more than two font weights on a single screen.
- Do default to `text-sm` (14px) for body. Reach for `text-base` (16px) only for marketing-adjacent surfaces.
- Don't put borders on a card without also using `shadow-sm` — the tonal shift between `background` and `card` is too subtle on its own.
- Do keep input backgrounds as `bg-secondary`. An input that looks like a card stops reading as editable.
- Don't mix radii inside one composite component — buttons stay on `rounded-md`, the card around them stays on `rounded-xl`, no third value in between.
- Do use `destructive` only for delete, discard, and other irreversible actions. A warning state uses the `warning` button variant, not `destructive`.
- Don't add a new color token without removing or merging an existing one. The palette is deliberately narrow.
- Don't put long-form text on a `primary` surface. `primary` against `primary-foreground` measures 2.79:1, below WCAG AA — primary buttons compensate by being short (1–3 words) at 12px bold. For text-heavy primary surfaces, switch the foreground to `#FFFFFF` or use `primary` only as an accent border.
- Don't add colored or inset shadows. The shadow scale is `sm` / `md` / `lg`, neutral, and that's the whole vocabulary.
