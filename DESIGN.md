---
name: Shortly
description: A calm, controlled toolkit for short links and temporary email — the interface recedes so the data leads.
colors:
  background: "#fafafa"
  foreground: "oklch(0.145 0 0)"
  card: "#ffffff"
  card-foreground: "oklch(0.145 0 0)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.922 0 0)"
  ring: "#0072f5"
  ring-strong: "#005fcc"
  focus: "#0072f5"
  focus-strong: "#005fcc"
typography:
  display:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1"
  body:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  mono:
    fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  caption:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.02em"
  micro:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  "2xs": "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
  "3xl": "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Shortly

## Overview

**Creative North Star: "The Quiet Instrument"**

Shortly is a precision instrument for links and mail, not a marketing surface. It works like a well-machined tool: neutral, exact, and quiet at rest, so the user's own data — the URL, the slug, the click count, the incoming message — is always the loudest thing on screen. The interface earns trust by getting out of the way. Nothing is decorative; every border, weight, and shade of gray is load-bearing.

The system is monochrome by discipline. It builds hierarchy from a near-black-to-white neutral ramp, hairline borders, and generous whitespace rather than from color or ornament. A single interaction blue (`#0072f5`) is the one chromatic voice, and it is spent almost entirely on focus and links — its rarity is exactly what makes it read as "the system is paying attention." Surfaces are crisp white panels floating on a soft off-white ground, lifted by a signature ring-plus-shadow that reads as physical without ever feeling glossy.

The temperament is calm, credible, and low-pressure. It is light-mode first (a dark theme exists and must stay coherent, but light is the design target). It deliberately rejects AI-SaaS template gloss, crypto/neon hype, heavy enterprise-admin chrome, and toy-app playfulness. Motion is minimal and reduced-motion-safe: transitions confirm state, they never perform.

**Key Characteristics:**
- Monochrome neutral ramp; color is an event, not a surface.
- Geist Sans + Geist Mono; mono carries every identifier (slugs, keys, addresses).
- Crisp white panels on `#fafafa`, lifted by a layered ring-plus-shadow.
- Hairline `border` dividers and disciplined spacing do the structural work.
- Light-mode first; quiet, exact, and reduced-motion-safe.

## Colors

A near-monochrome neutral system with one reserved interaction blue and one destructive red — everything else is a step on a chroma-zero gray ramp.

### Primary
- **Ink** (`oklch(0.205 0 0)`, ~near-black `#313131`): The primary action color and strongest text tone. Fills primary buttons and default badges; paired with **Paper White** text. This is the product's "confident" surface — solid, neutral, unmistakably the main action.
- **Ink Text** (`oklch(0.145 0 0)`, ~`#242424`, rendered `#171717` in auth copy): Foreground text on light surfaces. The darkest ink; used for titles and primary body copy.

### Secondary
- **Interaction Blue** (`#0072f5`): The single accent. Reserved for focus rings, links, selected/active states, and text-link hovers (deepening to **Blue Strong** `#005fcc`). It is never a large fill. See the One Voice Rule.

### Neutral
- **Ground** (`#fafafa`): The app background — a soft, warm-leaning off-white that lets white panels lift off it.
- **Paper White** (`#ffffff`): Card, popover, and panel surfaces; also `primary-foreground` text on Ink.
- **Muted Surface** (`oklch(0.97 0 0)`, ~`#f5f5f5`): `secondary` / `muted` / `accent` fills — subtle zones, ghost/secondary button and hover backgrounds.
- **Muted Text** (`oklch(0.556 0 0)`, ~`#8c8c8c`): Secondary and helper text, placeholders, captions. (Auth copy uses the literal ramp `#4d4d4d` → `#8f8f8f` → `#d4d4d4` for this role.)
- **Hairline** (`oklch(0.922 0 0)`, ~`#e5e5e5`): `border` and `input` strokes — the primary structural device.

### Tertiary
- **Destructive Red** (`oklch(0.577 0.245 27.325)`): Delete actions, error/invalid states only. Paired with white text. Never decorative.

### Named Rules
**The One Voice Rule.** Interaction Blue is the only chromatic color in the interface, and it appears on a tiny fraction of any screen — focus rings, links, active states. Primary actions are Ink (near-black), not blue. If blue starts filling buttons, cards, or banners, the system has lost its voice.

**The Load-Bearing Gray Rule.** Every gray is a decision. Hierarchy comes from the neutral ramp and hairline borders, not from adding hues. Reach for another step on the ramp before reaching for color.

**The Neutral-Status Rule.** Status is carried by the *label*, never by hue. The console status system (`ConsoleTone`) maps every state onto the neutral ramp plus the two reserved colors: `good` → `bg-foreground` (Ink), `warning` → `bg-muted-foreground`, `neutral` → `bg-muted-foreground/45` (faint), `accent` → `bg-focus` (the one blue), `danger` → `bg-destructive` (the one red). There is deliberately **no green "success" and no orange "warning" token** — the dot is a quiet weight signal and the text always states the meaning. Do not introduce semantic status colors.

**The Light-Only Auth Rule.** The auth and landing surfaces are intentionally light-only and set their neutrals as literal hex (`#171717`, `#4d4d4d`, `#8f8f8f`, `#d4d4d4`, `bg-white`) rather than theme tokens. This is a deliberate exception, not drift: do **not** "fix" these by tokenizing them or wiring them to the dark theme. Interaction Blue (`#0072f5`) stays the one accent there too.

## Typography

**Display / Body Font:** Geist Sans (local `woff2`, via `--font-geist-sans`; fallback `ui-sans-serif, system-ui, sans-serif`)
**Label/Mono Font:** Geist Mono (via `--font-geist-mono`; fallback `ui-monospace, SFMono-Regular, monospace`)

**Character:** Geist is a modern, technical grotesque — neutral and highly legible, engineered rather than expressive. It is the typographic embodiment of the instrument: it states, it does not perform. Copy is Chinese-first; Geist's Latin pairs with the system CJK stack for mixed-language UI.

### Hierarchy
- **Display** (600, 1.5rem/`text-2xl`, line-height 2rem, tracking -0.01em): Page and panel titles (e.g. the auth card heading). The largest type in the product; there is no oversized hero.
- **Title** (600, 1rem, line-height 1 / `leading-none`): Card titles and section headers.
- **Body** (400, 0.875rem/`text-sm`, line-height 1.5rem): Default reading and control text. Inputs render at 1rem on mobile, 0.875rem from `md` up to avoid iOS zoom.
- **Label** (500, 0.875rem, line-height 1.25rem): Form labels, button text, table headers.
- **Mono** (400, 0.875rem, Geist Mono): Every identifier — short-link slugs, full URLs, API keys, email addresses, and any tabular figure. Mono is a semantic signal here: "this is a value you copy, not prose."
- **Caption** (500, 0.6875rem/`text-[11px]`, tracking 0.02em): The upper micro step — console kickers (uppercase), dense-table primary cells (referrer, IP, timestamps), and the `text-xs`-adjacent chrome. Reserved for dense operator/admin surfaces; never reading copy.
- **Micro** (500, 0.625rem/`text-[10px]`, tracking 0.02em): The smallest step, one notch below Caption to subordinate labels to values inside dense blocks — uppercase field micro-labels (Status / Origin / Network Info), status-pill text (`ConsoleStatusBadge`), mono credential IDs, and config code. The Caption→Micro delta is the value-vs-label hierarchy in telemetry tables. Between these and Body sits the everyday small size, `text-xs` (12px), used for helper text, badges, and metric labels.

### Named Rules
**The Mono-For-Identifiers Rule.** If a string is copied, keyed, or machine-meaningful (slug, URL, key, address, count), it is set in Geist Mono. Prose is never mono; identifiers are never proportional.

## Layout

A centered, content-first model — no persistent marketing chrome. Auth and focused flows center a single column at `max-width: 408px`; the dashboard and admin use full-width work areas with dense desktop tables that collapse to stacked card layouts on mobile.

Spatial rhythm runs on an 8px-based scale exposed as CSS variables: `--space-2xs` 4px, `--space-xs` 8px, `--space-sm` 12px, `--space-md` 16px, `--space-lg` 24px, `--space-xl` 32px, `--space-2xl` 48px, `--space-3xl` 64px. Horizontal page padding is fluid via `--page-gutter: clamp(1rem, 3vw, 2rem)`; vertical section breaks use `--section-gap: clamp(3rem, 8vw, 6rem)`. Cards pad 24px (16px on the smallest screens, 24–32px on auth panels).

**Density is intentional and dual-mode:** operator/admin surfaces stay dense and scannable (tables, tight rows), while first-run and creation flows stay airy and low-pressure. `overflow-x` is hidden at the body; nothing should bleed horizontally.

**The Touch-Target Floor Rule.** Density is a *fine-pointer* (mouse) concern, so the compact `h-8`/`h-9` controls keep their tight sizing on desktop. On coarse pointers there is no dense experience to protect: a global `@media (pointer: coarse)` rule floors every real control (`button`, `[role="button"]`, `a[data-slot="button"]`, `select`, `summary`) to ≥44px. Prose links and checkboxes/radios are deliberately excluded. Correspondingly, hover-reveal affordances (row action clusters that fade in on hover) are gated on capability, not width — `[@media(hover:hover)]:` — so they stay permanently visible on touch devices instead of hiding behind a hover that never fires.

## Elevation & Depth

The system is flat by default and lifts surfaces with a **signature layered ring-plus-shadow** — this is the product's depth language everywhere raised surfaces appear (panels, cards, dialogs, popovers), not just on auth. Depth is a thin luminous stack, never a heavy drop shadow, so panels feel like precise physical cards on the Ground rather than glossy floating UI.

Elevation is **theme-aware and composed, not inverted.** In light mode the lift comes from a dark 1px hairline (`rgba(0,0,0,0.08)`) — the original literal values, unchanged. In dark mode the same ledge becomes a translucent-*white* top ring (light catching a raised edge) over a genuinely deeper ambient shadow. This is driven by three CSS variables that flip per theme rather than scattered `shadow-[…rgba(0,0,0,·)…]` literals:

- `--elevate-ring`: the 1px ledge — `rgba(0,0,0,0.08)` light / `rgba(255,255,255,0.10)` dark.
- `--elevate-ring-soft`: a fainter inset ledge — `rgba(0,0,0,0.06)` / `rgba(255,255,255,0.06)`.
- `--elevate-ambient`: the soft drop — `rgba(0,0,0,0.02)` light / `rgba(0,0,0,0.40)` dark.

### Shadow Vocabulary
Consumed through named utilities, not inline shadows:
- **`.elevate-ring`** (`0 0 0 1px var(--elevate-ring)`): base hairline-in-light for chips, icon tiles, status pills, and controls. Reads crisper than a solid border on white.
- **`.elevate-inset`** (`0 0 0 1px var(--elevate-ring-soft)`): the quiet inset ledge for recessed tiles (`consoleInsetClassName`).
- **`.elevate-hairline-b` / `.elevate-hairline-r`** (`0 1px 0 0` / `1px 0 0 0 var(--elevate-ring)`): single-edge dividers that replace a literal border-bottom/right on raised sections.
- **`.elevate-surface-sm`** (`0 0 0 1px var(--elevate-ring), 0 2px 2px var(--elevate-ambient)`): the standard console panel lift (`consoleSurfaceClassName`) — ring + close contact shadow.
- **Auth-only literals** (`auth-border-shadow`, `auth-surface-shadow`, `auth-control-shadow`): the same ring/surface stack hardcoded as `rgba(0,0,0,·)` on the light-only auth surfaces (per the Light-Only Auth Rule). The `auth-surface-shadow` adds the third ambient layer (`0 8px 16px -4px rgba(0,0,0,0.04)`) for the floating auth card.
- **`shadow-xs`** (shadcn default): minimal shadow on inline controls (`outline` buttons, inputs) that also carry a border.

### Named Rules
**The Ring-First Rule.** Elevation begins with a 1px ledge (`--elevate-ring`), then adds soft, low-opacity ambient layers. Never a single dark blur. In light mode opacities stay ≤ 0.08; depth is felt, not seen. Reach for an `.elevate-*` utility rather than writing a new `shadow-[…]` literal.

**The Focus-Halo Rule.** Focus is a two-part halo: a spacer ring the color of the surface (`--focus-gap`, which is `#fff` in light and the background in dark) then a 2px Interaction Blue ring — `0 0 0 2px var(--focus-gap), 0 0 0 4px var(--dashboard-focus)`, applied via `.dashboard-focus-ring` / `.auth-focus-ring`. Form controls use shadcn's equivalent `ring-[3px] ring-ring/50` with `border-ring`. The blue is the semantic `--color-focus`/`bg-focus` token (not `--ring`, which desaturates to gray in dark). Focus is always visible and always blue; never remove it.

## Shapes

Softly rounded, consistent, and calm. The radius scale derives from `--radius: 0.625rem` (10px): `sm` 6px, `md` 8px, `lg` 10px, `xl` 14px, plus `full` (pill). Controls (buttons, inputs, small tiles) use `md` (8px); panels and cards use `xl` (14px); badges and status pills are fully rounded (`full`). Corners are never sharp (0px) and never exaggerated. Borders are hairline (1px) at Hairline gray, and the ring-shadow frequently stands in for a literal border on white surfaces.

## Components

Components lead with restraint: neutral fills, hairline structure, blue only on focus.

### Buttons
- **Shape:** 8px radius (`rounded-md`), medium weight (500), 14px text, `gap-2` for icons; icons default to 16px (`size-4`).
- **Primary:** Ink fill (`bg-primary`) with Paper White text; hover darkens to `primary/90`. Sizes: `default` h-36px / px-16px, `sm` h-32px, `lg` h-40px, `xs` h-24px, plus square `icon` variants (24–40px).
- **Secondary:** Muted Surface fill, Ink text, hover `secondary/80`.
- **Outline:** Paper White (or Ground) fill, hairline border, `shadow-xs`, hover to Muted Surface.
- **Ghost:** Transparent, hover to Muted Surface — the quietest action.
- **Destructive:** Destructive Red fill, white text, hover `destructive/90`.
- **Link:** Ink text, underline on hover; text links proper use Interaction Blue → Blue Strong.
- **Focus:** blue ring per the Focus-Halo Rule; `disabled` drops to 50% opacity with no pointer events.

### Cards / Containers
- **Corner Style:** 14px (`rounded-xl`).
- **Background:** Paper White on the Ground.
- **Shadow Strategy:** Surface Lift (signature ring-plus-shadow); flat-bordered variant uses a single hairline border where a lighter touch is wanted.
- **Internal Padding:** 24px desktop (`py-6`, `px-6`), 16px on the smallest screens; vertical `gap-5`/`gap-6` between header/content/footer.

### Inputs / Fields
- **Style:** 36px tall, transparent background, hairline border, 8px radius, `shadow-xs`, 14px text (16px on mobile). Placeholder in Muted Text.
- **Focus:** border shifts to blue and a 3px `ring-ring/50` blue halo appears (`focus-visible:border-ring focus-visible:ring-[3px]`).
- **Error / Disabled:** `aria-invalid` shows Destructive Red border + red ring; disabled is 50% opacity, `cursor-not-allowed`.

### Badges
- **Style:** Fully rounded pill (`rounded-full`), 12px text, medium weight, `px-2 py-0.5`, 12px icons.
- **Variants:** `default` (Ink fill), `secondary` (Muted Surface), `destructive` (red), `outline` (hairline border + Ink text), `ghost`, `link`. Used for link status (active/expired), roles, and counts.

### Navigation / Links
- **Style:** Text-first, no heavy nav bars. Inline links use Interaction Blue with hover to Blue Strong; utility/footer links are Muted Text hovering to Ink. All interactive text carries the blue focus halo. A visible skip-link ("跳至主要内容") is present and must stay.

### Signature: The Value Chip
Short-link slugs, full URLs, API keys, and email addresses appear as Geist Mono strings, typically paired with a copy affordance and often wrapped in a Ring-bordered tile on white. This mono-identifier-plus-copy pattern is the recurring texture that makes Shortly feel like an instrument. Keys are shown in plaintext exactly once at creation — treat that reveal state as a distinct, deliberate moment.

## Do's and Don'ts

### Do:
- **Do** keep Interaction Blue (`#0072f5`) reserved for focus, links, and active states; make primary actions Ink (near-black). (One Voice Rule)
- **Do** build hierarchy from the neutral ramp and hairline borders before considering any color. (Load-Bearing Gray Rule)
- **Do** set every identifier — slug, URL, API key, email address, count — in Geist Mono. (Mono-For-Identifiers Rule)
- **Do** elevate surfaces with the ring-first layered shadow (`0 0 0 1px` + soft ambient), radius 14px for panels, 8px for controls.
- **Do** keep focus states visible as the blue halo, and keep all motion subtle and reduced-motion-safe.
- **Do** design light-mode first, keep the dark theme coherent, and write user-facing copy Chinese-first.
- **Do** provide dense tables on desktop and stacked card layouts on mobile for the same data.
- **Do** carry status meaning in the text label and map status dots onto the neutral ramp (Ink / muted / faint) plus the one blue and one red. (Neutral-Status Rule)
- **Do** keep dense `h-8`/`h-9` controls on fine pointers, but let the global coarse-pointer rule floor real controls to ≥44px, and gate hover-reveal on `[@media(hover:hover)]:`. (Touch-Target Floor Rule)
- **Do** reach for the `.elevate-*` utilities and the `--elevate-*` variables for depth so surfaces stay coherent in both themes.

### Don't:
- **Don't** fill buttons, cards, or banners with blue, or introduce a second accent hue.
- **Don't** use heavy single-blur drop shadows, glossy gradients, or glassmorphism — opacities stay ≤ 0.08.
- **Don't** use sharp 0px corners or oversized display type; there is no marketing hero here.
- **Don't** drift into AI-SaaS template gloss, crypto/neon hype, enterprise-admin heaviness, or toy-app playfulness.
- **Don't** set prose in mono or identifiers in the proportional font.
- **Don't** remove or dim focus rings, and don't rely on animation to convey meaning.
- **Don't** add a green "success" or orange "warning" status color — status is neutral-ramp weight plus the label. (Neutral-Status Rule)
- **Don't** tokenize or dark-theme the auth/landing hex literals; that light-only exception is intentional. (Light-Only Auth Rule)

