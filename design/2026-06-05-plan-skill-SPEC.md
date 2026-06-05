# SPEC — `belay:plan` skill (v1)

> Design artifact (SPEC, per the method's own SPEC/PLAN/REVIEW separation). Not shipped in the
> plugin tree. Drives the SKILL.md; reviewed adversarially (critical-review) before implementation.

## Job (one sentence)

Take a **draft** implementation plan and **de-risk it before any code**: separate
SPEC / PLAN / REVIEW and treat drift between them as a defect, run an adversarial review of the
plan, force every open decision closed, and sequence the work into independently-revertible
stages each carrying its own verification gate — then hand off to `ship`.

## Trigger intent (drives the frontmatter `description`)

Fires when about to **implement a non-trivial, multi-step change** and a plan exists or is being
drafted, **or** when the user asks to review / de-risk / sequence a plan before coding. Must
**not** over-fire on trivial one-file edits or conversational turns.

## In scope

The review / de-risk / **sequencing layer on top of a draft plan**. Spine (4 steps):

1. **Separate SPEC / PLAN / REVIEW; drift = defect.** A *spec of intent* (what/why), an
   *executable plan* (stage-by-stage how), and a *decision-record* (why the contested forks went
   the way they did) are distinct artifacts. When an agent executes the plan literally, a plan
   that still encodes a decision the record already overturned is a **safety bug**, not sloppiness.
2. **Adversarial plan review — delegate to `critical-review`.** Review the *plan* (not yet code)
   across safety / atomicity / deliberateness / ground-truth-fidelity; find → adversarially-verify
   → synthesize; a mandatory **Dismissed/refuted** section filters false positives.
3. **Open-items forced-resolution gate.** Every unresolved fork is a numbered open item with an
   owner; **none survives into execution unstruck**. A half-open "stub it OR sequence it" option
   that lets a green test pass against wrong behavior is the exact failure this closes.
4. **De-risk sequencing.** (a) **Model-inert foundation stage** — front-load the highest-bug-risk
   logic into a first stage that cannot reach production behavior yet (add structure without wiring
   it in). (b) **Atomicity by risk-concentration, not "smaller is better"** — the largest atom can
   be correct when it concentrates risk into the single hardest-tested stage and honors an external
   serialize constraint. (c) **Reversible ordering** — each later stage only ADDS, independently
   revertible without unwinding a successor. (d) **Per-stage verification gate** — each stage
   declares HOW it is proven (CI conclusion / local slice / a named regression test).

Hygiene checklist (folds in methods 7-10):
- Ground every plan claim in the real repo (file:line / HEAD SHA / spec version).
- Defer to codebase ground-truth; log deviations rather than overriding silently.
- Carry a **deliberate-debt ledger** (what is deferred, blast radius, later-PAID marker).
- Model **external/operator constraints** as explicit preconditions, not engineering steps.

## Non-goals (explicit)

- **Not plan-authoring mechanics.** Defer drafting to `brainstorming` / `writing-plans`
  (superpowers) or a hand-written plan. This skill **consumes** a draft; it does not teach drafting.
- **Not a hook.** No enforcement automation in v1 — and the SPEC/PLAN/REVIEW convention this skill
  *defines* is the prerequisite any future planning hook would need to parse.
- **Not a replacement** for `executing-plans` / `ship` — it hands execution off.
- **Not project-specific.** Stack / CI / OS-agnostic, like the rest of belay; must not hard-code a
  docs path or a single project's conventions.

## Composition points

- `critical-review` ← the adversarial plan-review gate (step 2), dispatched to a fresh subagent.
- `first-principles` ← "defer to ground-truth, justify deviations" (hygiene).
- `collaborate` ← human sets priorities; open-items resolution is a human↔AI decision.
- `ship` → receives the sequenced, gated stages for verified-green execution.
- superpowers `brainstorming` / `writing-plans` → produce the draft this skill consumes.

## Done-criterion (v1)

- One `skills/plan/SKILL.md` in belay house-style, agnostic, **composing** (not duplicating) the above.
- `description` triggers on "review/de-risk/sequence a plan before implementing" without over-firing.
- **Dogfood:** the skill is itself authored via this method (this SPEC → draft → critical-review →
  reconcile), and that is recorded as its validation.
- README + `plugin.json` description/keywords updated; pushed under `Andrew_Moryakov`, no AI trailers.

## Open items — resolve before writing SKILL.md (dogfooding the open-items gate)

- **O1 — Name.** `plan` vs `plan-review` vs `derisk-plan`. *Leaning `plan`* (umbrella), body states
  it is the review/de-risk/sequencing layer.
- **O2 — Single file vs `references/`.** belay skills are single-file so far. *Leaning single
  SKILL.md* unless the body bloats past readability.
- **O3 — Subagent vs inline review.** *Leaning: when acting as lead, dispatch a fresh agent*
  (mirror `critical-review`'s dispatch note); inline for a quick self-pass.
- **O4 — Generic artifacts, no docs path.** The skill must describe SPEC/PLAN/REVIEW **abstractly**
  ("a spec of intent, an executable plan, a decision-record"), never mandate file locations — a
  generic user has no `docs/` convention.

## v2 reconciliation (post adversarial review, 2026-06-06)

Reviewed by the `plan-skill-spec-review` workflow (5 dims, 15 findings) → verdict **SOUND WITH
FIXES**, 0 blocking. Full report: `2026-06-05-plan-skill-SPEC-REVIEW.md`. Resolutions folded into
`skills/plan-review/SKILL.md`:

- **O1 → name `plan-review`** (review-verb; avoids the head-on collision of bare `plan` with
  authoring + superpowers `writing-plans`). **O2 →** single SKILL.md. **O3 →** fresh subagent when
  lead, inline for a small self-pass (stated once, in the skill). **O4 →** abstract artifacts, kept.
- **I1 (name/trigger collision):** name fixed; trigger precondition is now "a **draft plan already
  exists**" (dropped "or is being drafted"); explicit anti-trigger ("not for authoring from a blank
  slate") in the skill.
- **I2 (`writing-plans` already ships a review gate):** the skill positions itself as **supersedes,
  not duplicates** — `writing-plans`' self-review is approve-unless-gaps; this is an adversarial
  de-risk bar (safety/atomicity/reversibility/fidelity + mandatory Dismissed). Runs with no
  `writing-plans` involvement (hand-written plan) too.
- **I3 (three skills review the plan; `executing-plans` can re-open forks):** the skill states its
  de-risk record **discharges** `executing-plans`/`subagent-driven-development` Step-1 re-review
  (executor verifies the record, doesn't re-derive), and how `ship`'s CI HARD-GUARD slots into the
  per-stage gate.
- **I4 (anti-hype):** §4 now marks (a) model-inert + (b) risk-concentration atomicity as the
  distinctive contribution; (c) reversible ordering + (d) the gate are standard practice the skill
  **requires** but did not invent.
- **I5 (unverifiable trigger done-criterion):** the skill carries explicit SHOULD-fire / MUST-NOT-fire
  examples; the criterion is graded, not a vibe.
- **M2/M3/M4:** "methods 7-10" replaced by the four named hygiene methods; the per-stage gate
  **scales to stakes** (CI conclusion / local slice / named regression / inspection-check for no-CI);
  "production behavior" → stack-neutral "runtime/observable behavior"; `ship` cited as one example of
  a verified-green promotion flow, with a generic fallback.
