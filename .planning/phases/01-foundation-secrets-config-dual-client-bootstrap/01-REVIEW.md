---
phase: 01-foundation-secrets-config-dual-client-bootstrap
reviewed: 2026-06-25T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - docs/session-rotation.md
  - src/config/constants.ts
  - src/config/env.ts
  - src/logger.ts
  - src/main.ts
  - src/scripts/login.ts
  - src/scripts/socks-agent.ts
  - src/telegram/bot-client.ts
  - src/telegram/user-client.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 1 (foundation) was reviewed against its stated goals: fail-fast env loading, secret
rotation, dual-client bootstrap with non-blocking startup, and graceful shutdown. The core
skeleton is sound on the headline requirements — secrets are env-only, `bot.start()` is fired
unawaited, the user client verifies authorization via `getMe()`, and shutdown is idempotent
behind an `unref`'d force timer.

No Critical (BLOCKER) issues were found: no hardcoded secrets, no secret logging path, no
session persisted to disk, no injection surface. The proxy hardcoding is a known/accepted
deviation and is not re-reported.

However, there are correctness gaps worth fixing before this is leaned on: the custom
`SocksAgent.connect()` mishandles SNI/`servername` and IPv6 destinations, the shutdown timer
fires *after* `process.exit` rather than guarding the actual hang it's meant to guard, the
graceful-shutdown path does not stop the user client when `bot.stop()` throws, and the logger
redaction list is too broad/too narrow in places. Details below.

## Warnings

### WR-01: SocksAgent drops SNI for HTTPS when destination host is an IP, and recomputes servername instead of honoring the provided one

**File:** `src/scripts/socks-agent.ts:35-37`
**Issue:** For a secure endpoint the agent recomputes the TLS `servername` from `opts.host`:
`const servername = typeof opts.host === 'string' && !net.isIP(opts.host) ? opts.host : undefined`.
This has two defects:
1. It ignores an explicitly-provided `opts.servername` (SNI). `agent-base`'s `HttpsConnectOpts`
   extends `tls.ConnectionOptions`, which can carry a caller-set `servername`. If a caller pins
   SNI separately from the TCP host (or connects to an IP but needs a hostname for the cert),
   that intent is silently discarded.
2. When `opts.host` is undefined (the line-26 fallback already had to reach for `servername` to
   get a TCP host), this recomputation yields `undefined`, so TLS is established with **no SNI
   and against the default hostname check**, which can break cert validation or connect to the
   wrong vhost.

**Fix:** Prefer the explicit servername, fall back to the connect host only when it is a real
hostname:
```ts
if (opts.secureEndpoint) {
  const tlsOpts = opts as tls.ConnectionOptions;
  const servername =
    tlsOpts.servername ?? (!net.isIP(host) ? host : undefined);
  return tls.connect({ ...tlsOpts, socket, servername });
}
```

### WR-02: SocksAgent host-resolution fallback is fragile and can pass a bogus 'localhost' destination to the proxy

**File:** `src/scripts/socks-agent.ts:26`
**Issue:** `const host = (opts.host ?? ('hostname' in opts ? (opts as tls.ConnectionOptions).servername : undefined) ?? 'localhost') as string;`
- `'hostname' in opts` is the wrong guard for reading `servername` — `servername` and `hostname`
  are independent fields on `tls.ConnectionOptions`; the presence of `hostname` does not imply
  `servername` is set, and `servername` can be present without `hostname`. The guard does not do
  what the fallback intends.
- The final `?? 'localhost'` masks a real failure: if neither `host` nor `servername` is
  resolvable, silently dialing the proxy toward `localhost` will connect to the wrong place
  rather than surfacing the misconfiguration.

**Fix:** Resolve the destination explicitly and fail loudly if absent:
```ts
const tlsOpts = opts as tls.ConnectionOptions;
const host = opts.host ?? tlsOpts.servername ?? tlsOpts.hostname;
if (!host) throw new Error("SocksAgent: cannot resolve destination host");
const port = opts.port as number;
```

### WR-03: SocksAgent does not pass an IPv6 host type / may mishandle IPv6 destinations and does not propagate connect errors with context

**File:** `src/scripts/socks-agent.ts:29-33`
**Issue:** `SocksClient.createConnection` is awaited with no try/catch. A SOCKS handshake failure
(proxy down at `127.0.0.1:10808`, auth rejected, destination unreachable) rejects with a raw
`socks` error that bubbles up through `agent-base` into the fetch/grammY layer with no indication
it originated in the SOCKS tunnel. Combined with the hardcoded proxy, a stopped local proxy
produces an opaque ECONNREFUSED far from its cause. Additionally, no socket error listener is
attached to the returned duplex before handing it back, so a post-handshake socket error during
TLS can surface as an unhandled `'error'` event.

**Fix:** Wrap the handshake and annotate:
```ts
let socket: net.Socket;
try {
  ({ socket } = await SocksClient.createConnection({
    proxy: this.proxy, command: 'connect', destination: { host, port },
  }));
} catch (err) {
  throw new Error(`SocksAgent: SOCKS connect to ${host}:${port} via ${this.proxy.host}:${this.proxy.port} failed`, { cause: err });
}
```

### WR-04: Graceful shutdown abandons the user client if bot.stop() throws

**File:** `src/main.ts:113-121`
**Issue:** The shutdown sequence awaits `bot.stop()` then `user.disconnect()` in the same `try`.
If `bot.stop()` rejects (e.g. grammY throws mid-stop), control jumps to `catch` and
`user.disconnect()` is **never called** — the MTProto user client is left connected and the
process exits 1 without releasing it. The clients should be torn down independently so one
failure cannot strand the other.

**Fix:** Settle both regardless of individual failure:
```ts
const results = await Promise.allSettled([bot.stop(), user.disconnect()]);
const failed = results.filter((r) => r.status === "rejected");
if (failed.length) {
  log.error({ errs: failed.map((f) => (f as PromiseRejectedResult).reason) }, "error during shutdown");
  process.exit(1);
}
log.info("clean shutdown complete");
process.exit(0);
```

### WR-05: Force-exit timer cannot fire because process.exit runs synchronously after the awaited cleanup in the same task

**File:** `src/main.ts:107-121`
**Issue:** The intent (D-05) is that if cleanup hangs, the `FORCE_EXIT_MS` timer hard-exits. That
works for a *hang*. But note the timer is also defeated in the success/throw paths: after
`await user.disconnect()` resolves, `process.exit(0)` runs before the timer can ever matter, and
in the catch path `process.exit(1)` likewise pre-empts it — which is fine. The real gap is that
the timer is the *only* safeguard and it is `unref`'d, so if `bot.stop()`/`user.disconnect()`
hang *and* the timer is the sole remaining handle, `unref()` means the timer will still fire
(good) — but if any other ref'd handle is alive (the user client keepalive sockets, which
`disconnect()` is hanging on), the 8s timer fires and `process.exit(1)` is correct. The subtle
bug: the timer is never `clearTimeout`'d on the success path. Because the immediately-following
`process.exit(0)` kills the process this is benign at runtime, but it couples correctness to
`process.exit` being reached synchronously; any future refactor that returns instead of exits
will leak the timer.

**Fix:** Clear the timer before exiting (defensive, decouples from process.exit):
```ts
try {
  await Promise.allSettled([bot.stop(), user.disconnect()]);
  clearTimeout(force);
  log.info("clean shutdown complete");
  process.exit(0);
} catch (err) {
  clearTimeout(force);
  ...
}
```

### WR-06: Unawaited bot.start() error handler races graceful shutdown and can exit 1 on a clean stop

**File:** `src/main.ts:75-83` and `src/main.ts:114`
**Issue:** `bot.start().catch(... process.exit(1))` is correct for a polling crash. But `bot.stop()`
during shutdown causes the `start()` promise to *resolve*, not reject, so the catch won't fire —
good. However there is an ordering hazard: if a poll-loop error and a SIGINT arrive close together,
`shutdown()` sets `shuttingDown` and begins `bot.stop()`, while the `start()` rejection path may
still call `process.exit(1)` concurrently. There is no coordination between the two exit paths, so
a clean operator-initiated shutdown can be reported as a crash (exit 1). Also, an unhandled
rejection elsewhere is not guarded — there is no `process.on('unhandledRejection')`/`uncaughtException`
handler, which the phase's "unhandled rejections" goal calls for.

**Fix:** Have the `start()` catch respect the shutdown flag, and add top-level guards:
```ts
.catch((err: unknown) => {
  if (shuttingDown) return;        // operator stop, not a crash
  log.fatal({ err }, "bot polling crashed");
  process.exit(1);
});
// plus, near bootstrap end:
process.on("unhandledRejection", (reason) => { log.fatal({ reason }, "unhandledRejection"); process.exit(1); });
process.on("uncaughtException", (err) => { log.fatal({ err }, "uncaughtException"); process.exit(1); });
```
(`shuttingDown` must be hoisted/shared with the start handler for this.)

## Info

### IN-01: Logger redaction is both too broad and missing API_HASH-adjacent nested paths

**File:** `src/logger.ts:12-23`
**Issue:** The redact list censors bare `token` and `*.token`, which will also clobber unrelated
benign fields named `token` (e.g. a future "update token"/"offset token") with `[REDACTED]`,
reducing log usefulness. Conversely it does not redact `apiHash`/`api_hash` casings or
`password`/`phoneCode` (relevant once the login flow or 2FA values ever reach a logger). Redaction
relies on exact field-path matching and only one level of wildcard (`*.token`), so a secret nested
two levels deep (`{ config: { env: { SESSION_KEY } } }`) is **not** redacted.
**Fix:** Tighten to credential-specific keys and add the casings actually used (`API_HASH` is
covered; consider `password`, `*.password`, `phoneCode`). Prefer logging only a curated object
rather than relying on deep redaction, since pino redact does not match arbitrary depth.

### IN-02: login.ts logs the raw login error object via onError, which may include sensitive request context

**File:** `src/scripts/login.ts:57, 75`
**Issue:** `onError: (err) => console.error("login error:", err)` and the top-level
`console.error("fatal: login failed", err)` print the full GramJS error. GramJS errors can embed
the request payload; during `client.start()` that payload can include the phone number or the
login code. This is a standalone operator script (stdout/stderr to the operator's own terminal),
so impact is low, but it is at odds with the phase's secret-hygiene posture.
**Fix:** Log `err.message`/`err.code` rather than the full object, or scrub before printing.

### IN-03: login.ts is excluded from the lint/format conventions used by the rest of src (no semicolons, different quote style)

**File:** `src/scripts/login.ts` (whole file), also `src/telegram/user-client.ts`, `src/telegram/bot-client.ts`, `src/scripts/socks-agent.ts`
**Issue:** `env.ts`/`logger.ts`/`main.ts` use semicolons and double quotes; `login.ts`,
`user-client.ts`, `bot-client.ts` and `socks-agent.ts` omit semicolons and mix single quotes.
Inconsistent style across a brand-new codebase makes diffs noisier and suggests no formatter is
enforced yet. (Style only — Info per scope.)
**Fix:** Add Prettier + `eslint-config-prettier` (already recommended in CLAUDE.md) and run it
across `src/`.

### IN-04: Dead commented-out proxy code blocks left in three production modules

**File:** `src/telegram/bot-client.ts:24-38`, `src/telegram/user-client.ts:43-60`, `src/scripts/login.ts:24,38-47`
**Issue:** Each module ships an unused `PROXY_SETTINGS` constant plus a commented "// Yes Proxy"
alternative implementation and an early `return`/active "No Proxy" branch. The early `return new Bot(...)`
in `bot-client.ts:35` makes the `PROXY_SETTINGS` constant (lines 24-31) dead code, and the
unused const will trip `noUnusedLocals`-style lint. This is the known proxy-hardcoding deviation,
but the *commented-out duplicate implementations* are a maintainability smell independent of the
hardcoding.
**Fix:** When converting to env-driven `PROXY_URL`, replace the comment-toggle with a single
conditional (`config.PROXY_URL ? withProxy : plain`) and delete the commented blocks.

### IN-05: env loader prints to console.error instead of the structured logger and exits before logger exists

**File:** `src/config/env.ts:48-52`
**Issue:** `loadConfig()` uses `console.error` + `process.exit(1)` for invalid config. This is
intentional (the logger isn't constructed until after config loads in `main.ts:35-36`), and
`z.prettifyError` output is human-targeted, so this is acceptable. Noting it only because it is
the one code path that bypasses the otherwise-uniform pino logging; no change required unless you
want boot-failure logs to be machine-parseable.
**Fix:** None required. Optionally construct a minimal pino logger before `loadConfig()` if
structured boot-failure logs are desired.

---

_Reviewed: 2026-06-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
