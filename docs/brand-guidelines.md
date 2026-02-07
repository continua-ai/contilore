# Brand Notes (v0)

This file captures practical branding decisions for Happy Paths.

## Product name

Current name: **Happy Paths**.

The codebase already supports renaming through `projectIdentity` overrides, so
brand changes should not require broad refactors.

## README voice and narrative

### Positioning story arc

1. Single agent / single engineer:
   - repeated wrong turns waste tokens and time.
2. Many agents / single engineer:
   - duplicated mistakes compound across concurrent sessions.
3. Team scope:
   - repeated exploration multiplies cost and latency.
4. Global scope:
   - opt-in crowdsourced learning artifacts (skills/playbooks) shared broadly.

This captures the core product motivation.

### Marketing language guidance

Punchy lines are welcome, but keep trust high and avoid pure hype.

Allowed style example:

> "The one weird trick your costly LLM provider wishes you didn't know: stop
> paying repeatedly for the same wrong turns."

Use it as a subheader, not the only framing.

## Visual assets

Local assets are stored under `assets/`.

- `assets/brand/happy-paths-mascot-ring-purple.png` (**current preferred logo draft**)
- `assets/brand/happy-paths-mascot-ring-white.png` (alternate)
- `assets/brand/happy-paths-mascot-ring.png` (alternate)
- `assets/brand/happy-paths-continua-variant.png` (Continua-style variant)
- `assets/brand/happy-paths-continua-peek.png` (Continua-style variant)
- `assets/brand/continua-logo-purple.svg` (source Continua mark)
- `assets/marketing/` (story illustrations)

## Unicode/icon concept

Until we finalize a bespoke glyph, use a temporary badge:

- Emoji: `🦝` (mascot)
- Optional mark: `◌` or `◍` for loop motif
- Combined shorthand: `🦝◌`

## Immediate next tasks

- pick one primary logo from current mascot variants
- generate a lightweight SVG rendition of the selected mark
- add social card generator inputs (once name is settled)
