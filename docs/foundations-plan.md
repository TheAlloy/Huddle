# Foundations plan — UI stack

*August 2026. Inputs: [ux-brief.md](research/ux-brief.md),
[technical-brief.md](technical-brief.md), and the current codebase. The two
briefs decide **what** we're building and **why**; this plan decides **in what
order**, and is the doc to check work against while the foundations land. It
covers the technical brief's "before step 1" plus the dialog/toast half of
step 1 — nothing beyond that. Status: draft, in progress.*

## Why this doc is narrow

The briefs are strategy and they hold. This plan exists because the foundations
have a dependency order that isn't obvious from either brief, and getting it
wrong means doing work twice. Two orderings in particular are load-bearing;
both are recorded as decisions below.

Anything about screen design, routing schema, or the data store belongs in the
briefs, not here.

## Current state (measured, August 2026)

| | Count | Note |
|---|---|---|
| `.jsx` files in `src/` | 22 | ~4,950 lines total |
| Native `<select>` | 56 | across 14 files; [Schedule](../src/screens/Schedule.jsx) 14, [Billing](../src/screens/Billing.jsx) 11 |
| `alert()` | 19 | includes form validation, e.g. [Schedule.jsx:391](../src/screens/Schedule.jsx:391) |
| `confirm()` | 9 | all destructive, e.g. [Billing.jsx:235](../src/screens/Billing.jsx:235) |
| Hand-rolled modal components | 10+ | one per screen, no shared behaviour |
| Files importing `lucide-react` | 16 | 33 distinct icons |
| Inline `style={{}}` | 164 | across 20 files |
| Hardcoded hex literals | 101 | across 20 files |
| `aria-*`, `role=`, keyboard handlers | **0** | none anywhere in `src/` at the time of measurement |

At the time of measurement, `AVATAR_BG` and `inputCls` were defined with
**different values** in [src/ui.jsx](../src/ui.jsx) and
[src/studio/core.jsx](../src/studio/core.jsx), so which palette a screen got
depended on which file it imported from — the "triple-defined constants" the UX
brief flags at §Structural changes. Step 3 found five such duplicates and
resolved them; see that step for what was wrong and how.

## Decisions

### 1. TypeScript lands before shadcn/ui

shadcn components are distributed as `.tsx` and its `init` writes a TS-shaped
config. Installing into plain JSX means either fighting the generator or
converting the same files twice.

**Verified:** `shadcn init` refuses to run without both a Tailwind
configuration and resolvable path aliases. This ordering is enforced by the
tool, not just preferred.

The technical brief already puts TS in "before step 1"
([technical-brief.md §Sequencing](technical-brief.md)), so this isn't new
scope — only a statement that it is a *prerequisite*, not a parallel track.

TS migration here is scaffolding only: `tsconfig`, the Vite plugin, path
aliases, and `allowJs` so existing `.jsx` keeps compiling untouched. Per-file
conversion happens as screens get rebuilt. We are not converting 22 files up
front.

### 2. ~~No big-bang component sweep~~ — SUPERSEDED

> **Revised 14 Aug after review.** Troy reviewed the demo build after steps 1–4
> and rejected the deferral: *"we can literally throw out all our previous
> styling and components — I want it to almost feel like we've started a new
> project using shadcn/ui (with preset `b7Uc5YiUE`) out of the box."* The old
> styling is not being preserved for the rebuild; it is the thing being
> replaced. The restyle happens now, in two layers: the shared primitives
> (done — see step 5) and a token sweep over every screen's own classes
> (slate → muted/foreground tokens, blue → primary, red → destructive, navy
> shell → sidebar tokens). Screen *structure* still changes only in the
> rebuild; this mandate is about styling.

The original decision, kept for the record:

The obvious plan — replace all 56 selects and 28 native dialogs now — is wrong,
because the UX brief's rebuild order rewrites every screen in steps 2–6.
Converting a select in [Schedule.jsx](../src/screens/Schedule.jsx) today means
converting it again when Schedule is rebuilt onto the router and store.

**Rule: components convert as their screen is rebuilt, not before.**

**One deliberate exception: `alert()` and `confirm()`.** All 28 go early, even
in screens due for rebuild. Reasons: demo mode is a customer-facing surface
today ([technical-brief.md §Principles](technical-brief.md) 4), a system dialog
with the URL in its title bar is the single most visible jank in the product,
it's worse in the Electron wrapper, and the replacement is a small mechanical
diff that carries into the rebuild unchanged. The 9 `confirm()` calls all guard
destructive actions, which makes them the ones worth fixing first regardless.

### 3. Theme preset `b7Uc5YiUE` (resolved)

Decoded and dry-run in a scratch Vite project. The code is self-describing —
no remote lookup, so there's no dependency on the ID resolving at build time.

| Field | Value |
|---|---|
| style | `base-nova` |
| baseColor / theme | `taupe` / `lime` |
| iconLibrary | `remixicon` |
| font | Inter (via `@fontsource-variable/inter`, self-hosted) |
| radius | `0.45rem` |
| menuAccent / menuColor | `subtle` / `default-translucent` |

Primary is `oklch(0.841 0.238 128.85)` — a bright lime. **This replaces
`bg-blue-600` as the action color across the whole app**, and is a brand
change rather than a polish pass. The preset also ships a complete `.dark`
palette; dark mode is additive and not required this cycle.

### 4. Base UI, not Radix — React 18 stays

The `nova` style installs **`@base-ui/react`**, not Radix. Its peer range is
`^17 || ^18 || ^19`, so Huddle's React 18.3.1 is supported and **no React
upgrade is needed**. (The scratch project showed React 19 only because the
current Vite template defaults to it.)

### 5. Tailwind v4, so there is no `tailwind.config.js`

v4 moved theme config into CSS. `init` writes `"config": ""` in
`components.json` and puts everything in `src/index.css` as `@theme inline`
plus `:root` / `.dark` variable blocks. Install is `tailwindcss` +
`@tailwindcss/vite` with `@import "tailwindcss"` — no PostCSS config, no
config file.

Note the generated CSS also does `@import "shadcn/tailwind.css"`, so the base
style layer resolves from the `shadcn` package rather than our repo. Our
*tokens* are local and reviewable; the base layer is not. `shadcn eject`
inlines it if we later want that fully in-repo — not needed now.

### 6. Icons stay on lucide

The preset specifies remixicon, but `components.json` gets overridden to
`lucide`. shadcn rewrites icon imports in the components it generates, so this
keeps a single icon pack with zero churn across the 16 files / 33 icons already
on `lucide-react`. Consistent with decision 2; revisit during the rebuild if
the remixicon set is wanted.

## Sequence

Each step should leave the app running and demo mode working.

**1. Tailwind v4 build — DONE** (pending a human visual pass). Added
`tailwindcss` + `@tailwindcss/vite` as devDependencies, registered the plugin
in [vite.config.js](../vite.config.js), created
[src/index.css](../src/index.css) with `@import "tailwindcss"` and the globals
moved out of `index.html`, imported it from [main.jsx](../src/main.jsx), and
removed the CDN script.

Result: one 34 kB stylesheet (7.1 kB gzip) replaces the CDN's in-browser
engine. Build clean, demo mode signs in and Schedule renders with full data.

*This was a v3→v4 major upgrade*, not just a build swap —
`cdn.tailwindcss.com` served v3. Breaking surface was measured, and the two
utilities whose scale shifted were renamed to preserve v3 appearance:

| v3 | v4 equivalent | Count | Status |
|---|---|---|---|
| `rounded-sm` (2px) | `rounded-xs` | 14 | renamed |
| `shadow-sm` | `shadow-xs` | 6 | renamed |
| `outline-none` | `outline-hidden` | 65 | **left as-is** |
| `ring-2` | unchanged | 2 | explicit width, unaffected |
| bare `border` | would change color | 0 | none present |

`outline-none` is deliberately not swept: in v4 it still hides the outline, so
rendering is identical. The only loss is the transparent-outline behaviour
under forced-colors mode, which this app never had (zero a11y attributes
today). These 65 sites get proper focus rings from shadcn's form components at
step 4 — sweeping them now would be the throwaway work decision 2 forbids.

*Verified safe beforehand:* all 36 template-literal `className`s interpolate
content (dates, hours, px), never class fragments like `` `bg-${x}-500` ``, so
static extraction had nothing to miss.

*Two gotchas worth keeping:*

- The running dev server kept serving stale utility classes after the rename
  until restarted. The production build was correct throughout — check
  `dist/assets/*.css`, not the dev server, when verifying class output.
- **v4 auto-detects sources across the entire project, `docs/*.md` included.**
  This document's own class names were being compiled into the shipped CSS
  (+0.5 kB). [src/index.css](../src/index.css) now pins detection with
  `@import "tailwindcss" source(".")`, which scopes it to `src/`. Without that
  line, writing a class name in prose anywhere in the repo adds it to the
  bundle. `index.html` carries no classes, so `src/` is the complete set.

**2. TypeScript scaffolding — DONE.** Added `typescript` and React **18**
types (not 19 — matching the app's React), [tsconfig.json](../tsconfig.json)
with `allowJs: true` / `checkJs: false` and `paths: { "@/*": ["./src/*"] }`,
and the mirrored `resolve.alias` in [vite.config.js](../vite.config.js). Added
an `npm run typecheck` script.

`tsc --noEmit` exits 0 and the build is unchanged — every existing `.jsx`
compiles without being type-checked, so files convert individually as screens
are rebuilt.

Confirmed step 3 will run: `npx shadcn@latest info` against this repo reports
`typescript Yes`, `tailwindVersion v4`, `tailwindCss src/index.css`,
`importAlias @`. Note `tsconfig.json` keeps `//` comments and both `tsc` and
shadcn parse it fine.

**3. shadcn init with the preset — DONE.** `init` merged into the existing
[src/index.css](../src/index.css) rather than clobbering it: the `source(".")`
pin and the globals survived, with `@theme inline`, `:root`, `.dark` and
`@layer base` appended. Created `components.json` and
[src/lib/utils.ts](../src/lib/utils.ts) (`cn` helper). `iconLibrary` was
overridden to `lucide` per decision 6 and `@remixicon/react` uninstalled.
React stayed on 18.3.1. CSS 34 kB → 41 kB; JS unchanged.

**What the preset actually changed on screen — less than expected.** The lime
primary did *not* repaint anything: the app styles actions with literal
utilities and inline styles (`bg-blue-600`, `NAVY`), and tokens don't reach
those. Verified live — the primary action button still computes to
`rgb(47,111,237)`. Lime will appear on shadcn components added at step 4, and
anywhere we deliberately move to `bg-primary`. What *did* change app-wide:

- **Typography:** system fonts → Inter Variable (self-hosted).
- **Radius:** `--radius: 0.45rem` redefines Tailwind's whole radius scale, so
  `rounded-lg` went 8px → 7.2px and buttons to 5.76px. `rounded-xs` is
  unaffected (the preset doesn't define `--radius-xs`), so the step 1 renames
  still hold.
- `*{@apply border-border}` has no effect here — every border in `src/` already
  carries an explicit color.

**Duplicate constants consolidated.** The audit found **five** exports defined
in both [ui.jsx](../src/ui.jsx) and [studio/core.jsx](../src/studio/core.jsx),
not three: `NAVY`, `AVATAR_BG`, `inputCls`, `initials`, `Field`. In every case
ui.jsx's copy served 13 screens and core.jsx's served exactly one (Tasks.jsx,
plus Billing.jsx for `Field`).

Two were genuine bugs, not just redundancy:

- **`AVATAR_BG` was a live inconsistency.** Both palettes are keyed by member
  index, but they had different colors *and* different lengths (8 vs 6), so the
  same person rendered one color as an avatar and a different one as a Tasks
  column header, wrapping differently past index 6. Reconciled onto the 8-colour
  set — Tasks column colors now match avatars everywhere.
- **`initials` differed in behaviour.** core.jsx's version dropped a letter on
  names with repeated spaces ("Ben  Achebe" → "B"). Unified on the
  `filter(Boolean)` version.

Direction follows CLAUDE.md: constants are canonical in `studio/core.jsx` and
re-exported from `ui.jsx` so all existing imports keep working; `Field` is a UI
primitive so it stays canonical in `ui.jsx`, with Tasks.jsx and Billing.jsx
repointed at it. Imports stay one-directional (`ui.jsx → core.jsx`), so no
cycle. The duplicate *modal kits* (`Modal` vs `ModalShell`/`ModalHead`/
`ModalFoot`) are untouched — the UX brief lists those for the rebuild.

*Verified:* typecheck 0, build clean, and Tasks/Billing render from a cold
server with an empty console. A live palette probe confirms only the reconciled
colors are in use.

**4. Dialog + toast system — DONE.** Added `alert-dialog`, `sonner` and their
`button` dependency. Zero `alert(` / `confirm(` remain in `src/`. Split by
intent as planned:

| Was | Now | Count |
|---|---|---|
| `confirm()` | `AlertDialog` via `useConfirm()` | 9 |
| `alert()` — failures | `toast.error()` | 13 |
| `alert()` — form validation | inline field errors | 6 |

[components/confirm.tsx](../src/components/confirm.tsx) wraps the dialog in a
promise-based `useConfirm()` so replacing a call site stayed a one-line change
that keeps its original shape:

```js
if (await confirm({ title: "Delete this entry?", destructive: true })) delBilling(b.id)
```

One dialog instance is rendered app-wide from `main.jsx` rather than one per
call site. `open` is deliberately separate from the options object — clearing
the options on close would blank the title mid-fade-out.

`Field` in [ui.jsx](../src/ui.jsx) gained an `error` slot (it supersedes
`hint`), which is what the 6 Schedule validations now render into. Those used
to fire one alert at a time, so you fixed one problem, pressed Save, and got
the next one.

**A third `Field` turned up.** [Schedule.jsx](../src/screens/Schedule.jsx) had
its own local copy on top of the two found in step 3 — it now imports the
shared one, which is also what let it use the `error` slot.

**Dropped `next-themes`.** `sonner.tsx` ships reading the theme from it; with
no provider in this app that lookup always fell through to its default, so the
dependency was removed and the theme pinned. Restore it if dark mode lands.

*Verified in the browser:* dialog renders with `role="alertdialog"`,
`aria-labelledby`, a backdrop and body scroll lock; Escape resolves false and
deletes nothing; the action button resolves true and the row goes; validation
renders inline with the modal staying open; toasts render with the right
`data-type` and icon. That's the first keyboard-dismissable, labelled dialog in
the app — see the accessibility note under Current state.

> **Verification gotcha, cost an hour.** Under the automated browser the
> dialog's DOM node appears to stay mounted and blocking after dismissal. It is
> **not** a bug. The Browser pane isn't displayed, so the page is `hidden` and
> composites **zero** frames; Base UI gates unmounting behind
> `requestAnimationFrame`, which never fires. Proven by shimming rAF onto
> `setTimeout`, after which content and backdrop unmount cleanly. Neither
> forcing `animationend` nor zeroing `animation-duration` discriminates, since
> with no frames no animation events dispatch at all. **Any future check of
> animated enter/exit in this harness needs the rAF shim, or a real browser.**

**5. Full restyle onto the preset — DONE** (added by the revised decision 2;
committed work up to step 4 first as `cc127de`). Two layers:

*Primitive layer* — `Btn` now wraps the shadcn Button (variant map:
primary→default, dark→secondary, danger→destructive), `Modal` and the
`ModalShell`/`ModalHead`/`ModalFoot` kit rebuilt on the shadcn Dialog (focus
trap, Escape, aria — same mount-to-open API), `Card`/`Field`/`Empty`/`Spinner`
tokenized, `inputCls` redefined as shadcn Input styling (padding-based height
because textareas share it; native select arrow kept until NativeSelect
conversion per screen). Schedule's third local modal kit (navy) deleted and
pointed at core's; core's `ModalFoot` gained Schedule's `disabled` prop.

*Screen layer* — scripted sweep of **937** class replacements across 20 files
(the mapping table lives in the git history of this step): slate text/borders/
backgrounds → `muted`/`foreground`/`border` tokens, blue actions → `primary`,
red → `destructive`, dark selected chips → `primary`. Line-scoped rule:
`text-white` on former action backgrounds → `text-primary-foreground` (white on
lime fails contrast). Then by hand: the app header (navy → light `bg-card`
top bar, tokenized OrgSwitcher/HeaderTracker/Admin chips), Paywall header and
sign-out, Feedback rating scale, Onboarding step dots, MiniTracker,
Schedule's toolbar CTAs (`#2f6fed` → primary; the purple Proposal button →
outline), team chips, selection outlines → `var(--ring)`, and the
`#f1f5f9` page backgrounds → `bg-background` (index.css body now takes the
token base layer; scrollbar on `var(--border)`).

**Deliberately kept:** data colors — client colors, `AVATAR_BG`, `LEAVE_TYPES`,
`TASK_PRI`, chart greens/reds in Billing, and NAVY where it color-codes
internal-task bars and the popout timer (a separate browser window that doesn't
load our CSS). Amber/green notice banners also kept.

**Found and fixed along the way:** the registry's `button.tsx` assumes React 19
(function components taking refs); on React 18 the ref Base UI passes via
`render={<Button/>}` silently fails and broke dialog cleanup (a `removeChild`
crash). `Button` is now `forwardRef`-wrapped, with a comment to remove it on a
React upgrade. Any future `shadcn add` of a component using `render=` needs the
same check.

*Verified:* zero legacy `slate-*`/`blue-*` classes remain; live probes show the
token background, light header, lime primary CTAs, muted selected-nav; Schedule,
Billing, Summary, Tasks and Tracker all render with an empty console; dialog
opens in a portal with focus trapped.

**6. Component adoption — DONE** (from Troy's annotated page feedback: the
token repaint wasn't enough; the visible controls had to *be* shadcn
components). Added `select`, `avatar`, `button-group`, `calendar`, `popover`,
`sidebar` (+ its `sheet`/`tooltip`/`skeleton`/`separator` deps). What changed:

- **App shell** → the shadcn `Sidebar` family: `SidebarProvider` +
  `Sidebar collapsible="icon"` (brand header, `SidebarMenu` nav with active
  states and collapsed-mode tooltips, feedback box as `SidebarFooter`,
  `SidebarRail`), content in `SidebarInset` with a `SidebarTrigger` in the top
  bar. The app is now full-bleed — the old 10px `#root` frame is gone.
- **All 56 native selects** → `NativeSelect` (scripted; value/onChange/options
  untouched, wrapper takes only layout classes). The Schedule Holidays filter
  additionally became the full popup `Select` as the reference conversion —
  note it needs `items={{...}}` on the root for the trigger to show labels
  rather than raw values.
- **Schedule toolbar**: month-nav and zoom/pan clusters → `ButtonGroup`; the
  native date input → `Popover` + `Calendar` (react-day-picker); Assign Work →
  default `Button`, Proposal → `variant="secondary"` per the feedback.
- **Avatars** → ui.jsx `Avatar` now wraps shadcn `Avatar`/`AvatarFallback`
  (same `{name,i,size}` API, indexed palette kept as data color). Schedule's
  `PersonCell` and the Tasks board columns converted onto it — which surfaced
  a **fourth** drifted duplicate: Schedule had *local* `AVATAR_BG` (the old
  6-colour palette) and the buggy `initials`, invisible to step 3's
  import-based audit because nothing imported them. Both deleted; Schedule
  avatars were still on the old palette until this step.

*Verified live:* sidebar mounts with 8 items and active state; popup Select
opens/picks/updates; Calendar renders and sets the anchor date; ButtonGroups
and shadcn-Button CTAs (lime default / secondary) confirmed by computed style;
avatars on the canonical palette; Tasks, Billing, Tracker, Settings all render
with a clean console from a cold load.

*Registry→React note — RESOLVED by upgrading to React 19 (19.2.8, with
lucide-react 1.31 and React 19 types).* The registry assumes React 19, where
refs pass to function components; on React 18 every Base UI `render=` target
needed a `forwardRef` patch, and each new component brought a new silent ref
bug (dialog cleanup crashed; the Combobox popup anchored to the 24px chevron
instead of the input). After the upgrade all six patches were deleted and the
components restored with `add --overwrite` — **every file in
`src/components/ui/` is now registry-pristine** (`grep forwardRef` returns
nothing). Verified on 19: dialogs open/close cleanly, the confirm flow works,
the Combobox anchors full-width to its input, select popups and toasts render.
Future `shadcn add` needs no post-processing.

**Consistency pass (review feedback, same day).** Two findings from Troy's
screenshot review:

- *Control heights.* `inputCls` had kept a padding-based height (~34px) while
  every shadcn control (Button, SelectTrigger, NativeSelect, Input) is
  **h-8 / 32px** — old styling genuinely still inlaid. `inputCls` now carries
  `h-8` and matches the Input component exactly; textareas moved to a new
  `textareaCls` (same look, no fixed height, 12 sites). The Schedule toolbar's
  search/people/client wrapper boxes went from `py-1.5` to `h-8`, Tasks'
  "Add task" and Team's refresh button became real Buttons. Verified live:
  every control in the Schedule toolbar row and every field in the Assign
  modal measures exactly 32px.
- *Select popup positioning.* The popup opening **over** the trigger is the
  component's out-of-the-box default (`alignItemWithTrigger = true`, Base UI's
  macOS-style item alignment) — not our styling. It reads as broken next to 55
  native selects that drop below, so our use passes
  `alignItemWithTrigger={false}`; popup-below verified live. Decide once
  whether to flip the default in `select.tsx` when more popup Selects land.

**7. Stock-anatomy purge — DONE.** After review, Troy set the binding rule:
*content is ours; the component is theirs, untouched.* Old component UI gets
thrown away — the stock shadcn component (preset-styled) renders it, and our
content is poured in. Shims may only pour content; any visual override is a
violation. What changed:

- `Btn` **deleted**; all call sites codemodded to the stock `Button`
  (primary→default, dark→secondary, danger→destructive).
- `inputCls`/`textareaCls` retired from screens; every raw `<input>`/
  `<textarea>` is now the stock `Input`/`Textarea` component (brace-aware
  codemod; the one fake-input div became a disabled `Input`).
- `Field` renders stock `Field`/`FieldLabel`/`FieldDescription`/`FieldError`;
  `Card` renders stock Card anatomy (`CardHeader`/`CardTitle`/`CardAction`/
  `CardContent`); `Pill` renders stock `Badge` (data color only); `Empty`/
  `Spinner` render the stock components.
- `Modal` + `ModalShell`/`ModalHead`/`ModalFoot` render stock Dialog anatomy:
  built-in close button, stock `DialogHeader`/`DialogFooter`, stock padding
  (the `p-0` surgery and the screens' `p-5` body wrappers are gone).
- Popup `Select` (with `items` for trigger labels) now covers the visible
  filters and dialog forms: Billing period+year, Summary client filter, Tasks
  team filter, Team invite/access roles + status, DemoSwitcher role.
  **`select.tsx` divergence:** `alignItemWithTrigger` defaults to `false`
  (dropdown-below) — documented in-file, re-apply after `--overwrite`.
- Entity pickers dense in forms (project/phase/member in Schedule dash,
  Tracker, MiniTracker, Summary inline edits, Billing rows) remain on the
  stock `NativeSelect` — still a shadcn component, appropriate for dense
  forms; convert to popup per screen during the rebuild if wanted.

*Verified live:* Assign modal shows pure stock anatomy (dialog-header/title,
built-in close, dialog-footer, 6 stock Fields, stock Inputs, 16px stock
padding); popup selects on Tasks/Billing/Summary; stock Card/Badge anatomy on
People; every screen renders from a cold load, no crashes.

*Known trade-off:* consecutive `Field`s have no inter-field gap yet — stock
forms wrap fields in `FieldGroup`, which is per-screen composition work for
the rebuild.

**8. Skill audit + select fix — DONE.** Diagnosed via the shadcn skill after
Troy's padding screenshot. Two compounding causes, both ours:

- **`select.tsx` had been edited** to default `alignItemWithTrigger` to
  `false` (my earlier "fix" for the overlay behavior). That put the popup in
  Base UI's fallback mode, which nova barely dresses. Reverted to
  registry-exact (`add --overwrite`, diff verified clean) — the popup-over-
  trigger behavior is the component's design and is back.
- **Composition violation:** the popup's inner padding lives on `SelectGroup`
  (`p-1`), and per the skill rules items must always sit inside their Group.
  Our SelectItems were direct children of SelectContent, so the padding never
  rendered. All 9 popup selects now wrap items in `SelectGroup`.

Audit fixes from the skill's enforced rules:

- **Toast:** Base UI projects use the `toast` component, not sonner. Swapped:
  `toast.error(msg)` → `toast.add({title, type:"error"})` (13 sites), Toaster
  from `ui/toast`, `sonner.tsx` deleted, sonner uninstalled.
- **Icons in Buttons:** `data-icon="inline-start"`, no size props (10 sites).
- Trigger slots cleaned (no custom classes on icons inside SelectTrigger);
  index.css scrollbar styling removed (layout-only globals remain).

**Registry drift audit (dry-run all 27 components):** every flagged file traces
to the one documented functional divergence — `button.tsx` forwardRef for
React 18 — plus upstream `"use client"` banner drift in separator/tooltip.
`select.tsx` and `field.tsx` verified content-identical. **Zero visual
divergences from the registry exist.**

*Verified live:* popup opens in aligned mode over the trigger, wider than the
trigger, `SelectGroup` padding 4px, rounded items, translucent nova surface —
matching the docs reference; Base UI toast mounts with title + icon.

*Deferred skill-rule violations (per-screen composition, step 9):* `FieldGroup`
around form field runs, `space-y-*` → `flex gap-*` sweeps, `aria-invalid` on
controls alongside Field's `data-invalid`, checkbox → `Checkbox`, search boxes
→ `InputGroup`.

**9. Screen-by-screen recomposition — IN PROGRESS.** Decision (Troy): stop
patching legacy markup; recompose each screen from stock shadcn composition.
**People is the finished reference screen** — the pattern every other screen
follows:

- Page: `flex flex-col gap-4` (no `space-y`); heading `text-base font-medium`
  + `text-sm text-muted-foreground` subtitle. Two text tones only
  (`foreground` via default, `muted-foreground`) — no `/70` `/40` opacities,
  no `font-semibold`.
- Persistent notices → `Alert`; transient confirmations → `toast.add`
  (the green "invitation sent" banner and copy-link notices are toasts now).
- Statuses → `Badge` variants (`destructive` for Suspended, `secondary` for
  roles) — no hand-colored pills for status.
- Row actions → `Button variant="ghost" size="icon-sm"`, never raw buttons and
  never `icon-xs` — the sole `icon-xs` exception is a remove-✕ nested inside a
  Badge/chip, where 28px doesn't fit.
- Forms → `FieldGroup` > `Field`; sections → `FieldSet` + `FieldLegend`
  (`variant="label"` for sub-groups); validation `error` + `aria-invalid`;
  checkbox grids → stock `Checkbox`; selectable chips → `Button
  variant="secondary" size="xs"` (killed the last inline-NAVY chips).
- **One size tier per control row.** Default (h-8) everywhere; `size="sm"` only
  when an entire row is deliberately compact (MiniTracker strip) — never mixed
  within a row. Duration/unit entry → `InputGroup` + `InputGroupText` suffix.
- **Select popups are never width-overridden.** The stock popup sizes to its
  trigger (that's the design); long items mean the *trigger* gets an explicit
  width (`w-56` project pickers, `w-36` phase pickers) — the docs pattern. An
  earlier `w-auto min-w-(--anchor-width)` override was reverted for feeling
  off-stock.
- **No layout shift:** date/number-bearing buttons get `tabular-nums`;
  screen-level scroll containers are the stock `ScrollArea` (overlay
  scrollbar — zero layout width, so no shift and no reserved-gutter
  asymmetry; a `scrollbar-gutter:stable` attempt was rejected for reading as
  lopsided padding).
- **Tone rule, precisely:** headings and control labels are foreground
  (`font-medium`); only descriptions, hints, counts and secondary metadata are
  `text-muted-foreground`. Never put `text-muted-foreground` on a container
  that labels inherit from. (Table column headers stay muted — stock Table
  convention.)

*Verified live:* invite modal renders `field-group` with popup Select; manage
modal renders 9 fieldsets/legends, 15 stock Checkboxes, 2 popup Selects; no
crashes.

**Rollout (Troy reviews each screen as it lands):** People ✓ (approved) →
Tasks ✓ (+ Combobox for the team fields, replacing native datalists) →
**Tracker/MiniTracker ✓** (start bubbles keep client data colors; running
panel actions are stock secondary Buttons; all pickers are grouped popup
Selects via screen-local `ProjectSelect`/`PhaseSelect` compositions; manual
row on stock Inputs; inline log editing on ghost icon Buttons) →
**Summary ✓** (period + layout rows → `ToggleGroup`; nav → `ButtonGroup`;
date-range → `Popover`+`Calendar mode="range"`; add-hours and list editing on
popup Selects/InputGroups/date pickers; budget bars on `bg-primary`/
`bg-destructive` semantic tokens; public-holiday chips → `Badge`; header
uniform at 32px. *Deferred:* the calendar-cell micro editor inside colored
day chips stays custom — too small for stock controls, redesign in rebuild)
→ **Billing ✓** (tab strip → stock `Tabs`; all row/section actions → stock
Buttons; invoice status + generate-from-project + expense filters → popup
Selects; likelihood/status chips → `Badge`; form → `FieldGroup` with popup
Selects and date pickers; money-table financials → semantic tokens
(`primary/10` + `text-primary-foreground` positive, `text-destructive`
negative, amber kept as the less-likely *category* color); Stat tiles
neutral + `tabular-nums`; both money tables sit on the stock `Table`
(sticky label column, colgroup, band rows and dense sizing ride on top as
className); expense Paid toggle → stock `Switch`. *Kept custom:* the
MiniGantt drag bars — data-viz; the overheads grid micro-inputs — too small
for stock controls, like Summary's cell editor) → next: Projects/Workspace →
Settings → Onboarding/Auth/Paywall/Admin → Schedule chrome (board timeline
stays custom viz inside stock chrome; ClientPicker → stock DropdownMenu;
PeoplePicker already done).

## Risks

- **Rendering drift at step 1.** *Mostly retired* — the breaking surface was
  measured and handled (table above), and Schedule renders correctly with demo
  data. Still outstanding: a human visual pass over each screen, since
  automated verification could confirm computed styles but not appearance.
- ~~**The lime accent is a large visible change.**~~ *Retired — this was wrong.*
  Tokens don't reach literal utilities or inline styles, so step 3 repainted
  nothing. The accent question returns at step 4 (shadcn components arrive
  lime) and properly during the rebuild, when screens move onto token classes.
  That's when to decide whether lime is the action color everywhere.
- **Icon library conflict.** The preset specifies remixicon; the app uses
  lucide across 16 files / 33 icons. Settled by decision 6 — staying on lucide.
- ~~**Reconciling the two avatar palettes changes existing users' avatar
  colors.**~~ *Resolved in step 3* — kept the 8-colour set used by the shared
  `Avatar`, so avatars are unchanged everywhere and only the Tasks board's
  column colors moved (onto the palette the rest of the app already used).
- **Scope creep into the rebuild.** Decision 2 is the guard. If a step starts
  restructuring a screen, it belongs in the rebuild, not here.

## Open questions

- None blocking. Step 3 is ready to run.

## Not covered here

Router and URL schema, the normalized store and query layer, realtime,
responsive frame, test harness, and every screen-level change — all in the
briefs. [CLAUDE.md](../CLAUDE.md) describes the current stack ("no tests, no
linter, and no TypeScript — plain JSX") and needs updating once these steps
land; that's the last task of this plan, not the first.
