# UI consistency pass — shared UI pieces

Date: 2026-10-01
Status: implemented

## Goal

Make every screen (Load, Browse, Compare, Live Services/Routes/Consumers) look and behave as one
polished system. Priority chosen by the user: **visual consistency**. No new features, no
navigation or workflow changes.

## Findings (audit)

The base is already fairly consistent: `.card`, `.btn-*`, `.input-field`, `.section-heading` are used
100+ times. The drift comes from hand-repeated patterns:

- ~50 inline SVGs across 21 files, with duplicated path data (e.g. the sidebar draws Browse and
  Compare twice, for the locked and unlocked states). Stroke and size drift between screens.
- The selected-row style (accent bar + tint + green text) is written out separately in the sidebar,
  Browse lists and Live lists.
- Page headers, empty/loading/"Select a …" states are built per screen.
- Corner radius is mixed: `rounded-md` x6, `rounded-lg` x27, `rounded-xl` x9.
- Only the consumers view uses the card + avatar-header detail layout.

## Design

### 1. Icons: `src/components/shared/AppIcon.vue`
One `<AppIcon name="..." />` with a single 20x20, 1.5px-stroke set: home, list, compare, server,
route, user, plug, lock, search, eye, moon, upload, plus, trash, check, warning. Size via class,
colour via `currentColor`. All inline SVGs are replaced. Locked and unlocked sidebar items use the
same icon name.

### 2. Layout pieces (new shared components)
- `ListRow`: selected-row style, optional initial avatar, `trail` slot for badges and controls, optional check mark.
- `EmptyState`: icon in a lime circle, title, optional hint and action; also covers loading and
  "nothing found".
- ~~`PageHeader`~~: dropped. The page title and actions already live once, in `AppShell.vue`.
- `DetailHeader`: avatar, name and ID block (extracted from the consumers view), reused for
  services and routes.

### 3. Tokens in `style.css`
Controls and rows use `rounded-lg`, cards use `rounded-xl`, small tag/method chips keep `rounded-md`. One `.card`
padding and one shared selected-row class.

### 4. Rollout (one commit per step, checked in the browser in light and dark mode)
1. Icons: sidebar and Load.
2. Browse and Compare.
3. Live Services, Routes, Consumers.
4. Final sweep: leftover `rounded-md`, stray SVGs, spacing.

## Testing and risk

Behaviour is unchanged, so existing tests stay. Add unit tests for `AppIcon` and each new
component. Each step must pass `vue-tsc` and `vitest`. Visual regressions are not caught by tests:
check each screen in the browser (Live screens need a connected Kong).

## Out of scope

New features, navigation changes, workflow changes, a full redesign.
