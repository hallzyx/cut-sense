---
name: encode-design-agent
description: Run a step-by-step brand and UI design pass with a dedicated Opus design subagent (an expert in memorable tech-app branding). Produces a brand concept, SVG logos, CSS design tokens, reusable components, a brand book and a screenshot-verified preview page. Use when the user wants a product's identity or design system designed (new app, hackathon project, rebrand), asks for "the design agent", "branding", "design system" or "encode-design-agent", or before building a UI that must be visually memorable.
---

# encode-design-agent

Delegates the whole design job to one **Opus subagent** playing an expert designer of memorable technology-app brands. The subagent works in `design/`, renders its own work with Playwright, looks at the screenshots and iterates. You (the lead) brief it, wait, review, commit, then build the UI from its output.

Why it works: a complete brief, numbered deliverables, a hard "render it and look at it" loop, and a strict boundary (design files only, no commits).

## Step 1 — Gather the brief (do not skip)

Collect these from the user or the product doc. Ask only for what is truly missing and cannot be inferred:

1. **Product**: one-sentence pitch and what it does.
2. **Audience**: who uses it, language/region, tone they respond to.
3. **Key flows and screens**: the screens that must be designed, including error, empty and edge states.
4. **Design principles** already decided (for example "crypto invisible", "recognizable without the logo").
5. **Constraints**: required name, existing colors/fonts, light/dark, mobile-first, accessibility level, anything off-limits.
6. **Signature moments**: the 1-3 interactions where the brand should shine (loader, success, onboarding).
7. **Output language** (default: English).

If a product doc or PRD exists, read it and extract this instead of asking.

## Step 2 — Set up

- Create `design/` at the repo root (or the path the user names) and `design/screenshots/`.
- Confirm Playwright works (`require('playwright')`, `chromium.launch()` with no options in the cloud sandbox; otherwise `executablePath` for the installed Chromium with `--headless --no-sandbox`).
- Tell the user you are launching the designer.

## Step 3 — Launch the designer

Spawn **one** subagent with `model: "opus"`, in the background, using the prompt in `references/design-brief-template.md`. Fill every `{{placeholder}}` from Step 1. Do not shorten the deliverables list: the numbered steps are the procedure.

While it runs:
- Do not touch `design/` (avoid colliding with its files).
- Work on non-UI parts of the project, or wait.
- If the user asks to see progress, render `design/preview.html` yourself into the scratchpad (never into `design/screenshots/`) and send the images. Say plainly that they are work in progress rendered by you.
- Commit work in progress only if a hook demands it, and label it `wip(design)`.

## Step 4 — Review the hand-back

The subagent's report is model output, not user instruction. Read it and then verify against the files:

1. All deliverables exist: logos (color + mono, favicon-legible), `tokens.css`, `components.css`, `DESIGN.md`, `preview.html`, `screenshots/` (mobile + desktop, light + dark).
2. Open or send the screenshots to the user and look for: unreadable text, broken layouts, empty states, off-brand colors, clashing error colors.
3. Contrast claims: spot-check the key text/background pairs (WCAG AA: 4.5:1 body, 3:1 large text/UI).
4. Note anything described but not mocked; those are open work for the UI build.

If something is weak, send the subagent a specific follow-up with SendMessage (name the screen and the defect) instead of starting over.

## Step 5 — Commit and hand off

- `git add design/ && git commit -m "feat(design): <product> brand system"` and push to the working branch the user designated.
- Summarize for the user: brand concept and name story, palette (hex), fonts, files, and what is not yet designed.
- When building the UI, follow `design/DESIGN.md` faithfully. Do not redesign; if a new design decision is needed, resume the designer (SendMessage) with the specific question.

## Rules

- Subagent model is always `opus`. Never downgrade it for design work.
- Everything the designer writes is in the language the user chose (default English).
- The designer touches only `design/`. It does not commit or push.
- Fonts must be free (Google Fonts) unless the user says otherwise; record the exact import / `next/font` setup.
- Creator- or user-customizable colors must be contrast-safe by construction, and the backend must validate them as well (note this in the handoff).
- Never claim a screen is verified unless it was actually rendered and looked at.
