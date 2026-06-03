---
name: critical-review
description: Run a rigorous, adversarial review of a diff or commit — spec compliance + code quality + TEST INTEGRITY (would each test fail if the code were broken?). Use after implementing a change, before merging, or to vet a subagent's work. Distinguishes real issues from nitpicks.
user-invocable: true
---

# /belay:critical-review — review a diff like it's trying to fool you

A good review is skeptical and specific. The failure mode to prevent is a **vacuous green**:
tests that pass regardless of whether the code works, or a review that rubber-stamps. This
skill is the reviewer prompt that repeatedly catches real, non-obvious bugs.

## Target

A commit SHA, a branch diff, or a working tree. Inspect with `git show <sha>` /
`git diff <base>...<head>`. Read the changed files **and** their call sites and tests.

## Review dimensions — classify findings Critical / Important / Minor

1. **Spec compliance.** Does it do exactly what was asked — nothing missing, nothing extra
   or unrequested? List any requirement with no corresponding code, and any scope creep.

2. **Correctness / bugs.** Null/empty handling, boundary conditions, error paths, state that
   leaks across requests/iterations, resource disposal, concurrency, off-by-one, wrong
   field/method, silent truncation. Trace the unhappy paths, not just the happy one.

3. **Consistency.** Does it match the surrounding code's idioms, naming, and patterns?
   Copy-paste leftovers? Dead branches the backend/runtime can never reach?

4. **Test integrity (treat as Important — this is where reviews earn their keep).**
   - Does each test assert a **meaningful** outcome, or just `NotNull` / "did not throw" /
     `assert(true)`?
   - **Would the test FAIL if the implementation were broken or removed?** If not, it is
     vacuous — say so precisely (file:line).
   - Empty-collection / empty-envelope assertions do **not** exercise the item shape — flag
     coverage that only touches the wrapper.
   - Does it assert on the **produced output**, or accidentally on the **seeded input**?
   - Are exceptions swallowed anywhere that lets a real failure pass?

5. **Verify before trusting claims.** If the author says "N tests green / no bugs", run the
   suite yourself and report the actual result. For findings, prefer reproducing over
   speculating.

## Output

- A one-line **VERDICT**: Approved / Approved with action items / Changes required.
- Findings grouped by severity, each with `file:line` and a concrete fix.
- For reviews of tests: a per-test verdict (strong / weak / vacuous).
- Be proportionate: separate genuine issues from nitpicks, and say plainly when coverage is
  strong. A vacuous review is worse than none — it manufactures false confidence.

## Dispatching it to a subagent

When reviewing as the lead, dispatch a **fresh** agent with: the target SHA, the spec it must
meet, the reference files/patterns to judge consistency against, and an instruction to **run
the tests and report actual counts**. Keep the reviewer's context clean — give it exactly
what it needs, not your whole session.
