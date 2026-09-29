# 0028 — The gate owns the server

**Status:** accepted · phase 17

## Context

Three of ember's four measurement scripts must run against a production build,
and every one of them said so in a header comment:

```
npm run build && npx next start -p 3100
node scripts/audit.mjs
```

That instruction is correct and it is not enough, because it leaves the
server's lifecycle in the operator's hands while the scripts quietly assume it.

Phase 17 opened by running the audit and getting **seven violations on Home**,
four of them pointing at an element with the id `#__next_error__` — a missing
document title, a missing `lang`, no `main` landmark, content outside any
region. Those are the fingerprints of the Next.js error page, not of the
screen. The cause was a `next start` a previous session had left running on
3100. `next start` resolves its manifests once, at boot; the build underneath
it had been replaced, so it went on serving a page whose chunks no longer
existed.

Ten minutes went into reading a defect that did not exist. That is the cheap
version of this failure. The expensive version is the same mistake in the other
direction — a stale server that happens to serve an *older, passing* build
while the current one is broken, reported as a clean gate.

## Decision

**`npm run verify` owns the server.** It builds, starts `next start` itself,
waits for the port to answer, runs audit → capture → perf → measure against it,
and kills it on the way out. The individual scripts keep their base-URL
argument for the case where someone genuinely has a server they trust.

Two details carry most of the value:

**An occupied port is a hard failure, not something to attach to.** The
tempting behaviour — "something is already serving 3100, use it" — is exactly
the bug. It exits with the `lsof` command to fix it.

**The build is part of the run.** Skipping it is opt-in (`--skip-build`), so
the default path cannot produce a measurement of a build that is not the one on
disk.

## Consequences

The four scripts became a single gate, which is what they always described
themselves as. Running it end to end immediately found four real defects that
the piecemeal habit had left standing: a hero skeleton 68px short of its hero,
a fragment collecting a 36px `space-y` gap where its `mt-3` asked for 12, a
trending strip that wrapped to two rows where the real one wraps to three, and
a 320px viewport where an ordinary six-figure balance pushed the document
sideways on four screens.

None of those were new in phase 17. They had been shipping for two phases,
under a header comment that told the truth about how to catch them.

## Alternatives considered

**Detect the stale server instead of owning it.** The obvious version is to
compare `.next/BUILD_ID` against something the server reports. It does not
work: the build-id-scoped assets are served from disk, so a stale process
happily returns 200 for the *new* build's manifest. Every other signal is
similarly indirect. Owning the process is the only check that cannot be fooled,
and it is less code than the detection would have been.

**A note in `CLAUDE.md` saying "kill any old server first".** This is the
option that already existed, in three places, phrased as an instruction to a
person. It failed. A rule that lives only in prose is a rule that holds until
the first distracted afternoon — the same argument that made `audit.mjs` a gate
rather than a report, `server-only` an import rather than a convention, and the
news boundary a test rather than an ADR paragraph.

**A shell script or a `Makefile`.** Would work, and would not have given a
clear error on an occupied port, a real timeout on a server that never becomes
ready, or per-step exit codes without a lot of `trap`. The Node version reads
like the rest of `scripts/`.

**Leaving `measure.mjs` on its `EMBER_URL` environment variable.** It now takes
`argv[2]` like the other three, with the env var kept as a fallback. Four
scripts with three conventions for the same argument is how a runner ends up
with special cases in it.
