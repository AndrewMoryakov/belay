---
name: plan-review
description: De-risk a DRAFT multi-step implementation plan before any code — separate the spec-of-intent / executable-plan / decision-record and treat drift between them as a defect, run an adversarial plan review (via critical-review), force every open decision closed, and sequence the work into independently-revertible stages each carrying its own verification gate, then hand the gated stages to a verified-green promotion flow (e.g. belay ship). Use when a plan already exists and coding has not started. NOT for authoring a plan from scratch (use writing-plans), reviewing a diff of written code (use critical-review), executing a plan (use executing-plans), or trivial one-file edits.
user-invocable: true
---

# /belay:plan-review — de-risk a draft plan before any code

A plan is a hypothesis to be falsified against the code, **not** a contract to execute literally.
This skill is the gate between *having* a plan and *running* it: it tries to break the plan while
breaking it is still free. The one rule it exists to enforce: **no open decision and no
plan↔record contradiction survives into execution.**

## When this runs (and when it doesn't)

**Precondition:** a draft, multi-step implementation plan already exists — hand-written, from
`brainstorming`, or from `writing-plans`. If there is no plan yet, that is authoring — stop and use
`writing-plans`; come back here with the draft.

**Do not fire for:** authoring a plan from a blank slate (→ `writing-plans`); reviewing a diff of
code already written (→ `critical-review`); executing an approved plan (→ `executing-plans` /
`ship`); or a trivial one-file change that needs no staging.

**Relationship to neighbours (it composes, it does not duplicate):**
- `writing-plans` ships a self-review calibrated to *approve-unless-serious-gaps* (completeness,
  buildability). This is a **harder, adversarial de-risk bar** — it **supersedes** that self-review
  for any non-trivial or coupled change. It also runs fine on a hand-written plan with no
  `writing-plans` involvement at all.
- `executing-plans` / `subagent-driven-development` open with a "review the plan critically" step
  and may re-open decisions mid-execution. This skill's recorded de-risk pass **discharges** that
  step: the executor *verifies the de-risk record exists and is closed*, it does not re-derive it.
  Re-opening a closed decision at execution time is the exact drift this skill prevents.

## The method

### 1. Separate the three artifacts; treat drift as a defect
Keep three things distinct: a **spec of intent** (what / why), an **executable plan** (stage-by-stage
how), and a **decision-record** (why the contested forks went the way they did). They need not be
separate files — a generic project has no `docs/` convention — but they are separate *roles*. When
an agent executes the plan literally, a plan step that still encodes a decision the record already
overturned is a **safety bug**, not sloppiness. Scan for that contradiction first.

### 2. Adversarial plan review — dispatch `critical-review`
Review the **plan**, not yet any code, across four lenses: **safety** (what can go wrong on the
unhappy path), **atomicity** (is each stage the right grain — see step 4), **deliberateness** (is
every decision made, not deferred), and **ground-truth fidelity** (does every claim match the real
repo — files, symbols, versions). Work the loop **find → adversarially-verify → synthesize**, and
require a **Dismissed / refuted** section: a finding is kept only if it survives an honest attempt
to kill it. This is the false-positive filter that keeps the review trusted.

### 3. Open-items gate — close every fork before execution
Every undecided fork becomes a numbered open item with an owner. **None survives into execution
unstruck.** Watch especially for half-open options ("stub it OR sequence it") — they let a green
test pass against wrong behaviour. Resolve each, or the plan is not ready.

### 4. De-risk sequencing
Cut the work into stages and order them so risk is paid down early and nothing is hard to undo:
- **(a) Model-inert foundation stage *(distinctive)*.** Front-load the highest-bug-risk logic into a
  first stage that **cannot reach runtime/observable behaviour yet** — add the structure without
  wiring it in. Step 1 then literally cannot break production, and the riskiest logic lands where it
  is fully, locally testable.
- **(b) Atomicity by risk-concentration, not "smaller is better" *(distinctive)*.** The *largest*
  atom can be the right call when it concentrates risk into the single hardest-tested stage and
  honours an external serialize constraint (e.g. one DB migration instead of three). Choose grain by
  where the risk should be paid, not by reflex toward small.
- **(c) Reversible ordering.** Each later stage only **adds**, so it is independently revertible
  without unwinding a successor. *(Standard additive / expand-contract slicing — the contribution is
  requiring it as a gate, not inventing it.)*
- **(d) Per-stage verification gate, scaled to stakes.** Each stage declares **how it is proven**:
  a CI conclusion, a local test slice, a named regression test, or — for low-stakes / no-CI work — a
  stated inspection check. A stage with no declared gate is not done. *(The discipline is standard;
  requiring it per stage is the point.)*

## Hygiene checklist

- **Ground every claim** in the real repo (file:line / HEAD / versions) — no plan citation goes
  unverified.
- **Defer to codebase ground-truth**; when the plan and the code disagree, follow the code and
  **log the deviation** rather than overriding silently.
- **Carry a deliberate-debt ledger** — what is intentionally deferred, its blast radius, and a
  later-PAID marker. Planning includes planning what you will *not* do yet, safely.
- **Model external / operator constraints as preconditions**, not engineering steps (a gated deploy,
  a missing secret, a serialize rule) — separate what *you* can finish from what the world blocks.

## Handoff

The output is a set of **sequenced, gated stages + the closed open-items record + the
decision-record**. Hand it to a verified-green promotion flow — `belay:ship`, whose CI HARD-GUARD
*is* the per-stage gate (4d) for a stage that merges — or, where no promotion workflow exists, the
declared per-stage gate is itself the terminal verification. Execution then proceeds via
`executing-plans` / `subagent-driven-development`, which consume this record rather than re-deriving
it.

## Notes

- **Dispatch a fresh subagent for step 2 when acting as lead** (keeps the adversarial pass
  uncontaminated by the author's context — mirror `critical-review`'s dispatch note); an inline
  self-pass is fine for a small plan.
- **The artifacts are abstract.** "A spec, a plan, a record" — never mandate file locations; a solo
  user with no process still has all three as *roles*.
- **Should fire:** "review this plan before I build it", "is this migration plan safe / staged
  right?", "de-risk / sequence this before coding", about to implement a coupled multi-step change.
  **Must not fire:** "help me plan this feature" (no draft yet → `writing-plans`), "review this diff"
  (→ `critical-review`), "ship this branch" (→ `ship`), a one-line fix.
