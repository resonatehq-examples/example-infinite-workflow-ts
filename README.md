# Infinite Workflow (Health Monitor)

A health monitoring workflow that runs forever — checking services, firing alerts, sleeping, repeating. Designed to run for days, weeks, or months without memory leaks, history bloat, or special lifecycle management.

## What This Demonstrates

- **Unbounded execution**: the workflow loops indefinitely with no history limit
- **Durable sleep**: `ctx.sleep()` between iterations survives crashes and restarts
- **No continueAsNew**: Resonate has no event history limit — just loop
- **Crash recovery mid-iteration**: if a check fails, it retries; previous iterations are not re-executed

## How It Works

A while-loop with durable sleep:

```typescript
while (iteration < config.maxIterations) {
  iteration++;
  const result = yield* ctx.run(checkAllServices, config.services, iteration);
  yield* ctx.sleep(config.intervalMs);
}
```

Each `ctx.run()` is an independent checkpoint. Each `ctx.sleep()` is a durable timer. The workflow can sleep for 30 seconds, 30 minutes, or 30 days — the timer survives process restarts.

No event-history accumulation. No periodic state-serialization step to reset the workflow's bookkeeping. The loop just runs; the promise store handles durability per-iteration.

## Prerequisites

- [Bun](https://bun.sh) v1.0+

No external services required. Resonate runs in embedded mode.

## Setup

```bash
git clone https://github.com/resonatehq-examples/example-infinite-workflow-ts
cd example-infinite-workflow-ts
bun install
```

## Run It

**Happy path** — 8 monitoring iterations, database alert on iteration 5:
```bash
bun start
```

```
=== Infinite Workflow Demo (Health Monitor) ===
Mode: HAPPY PATH  (8 iterations, database alert on iter 5)
Services: api-gateway, database, cache, queue
Interval: 500ms between checks
Iterations: 8 (demo cap; production = ∞)

  [iter 01] all 4 services healthy
  [iter 02] all 4 services healthy
  [iter 03] all 4 services healthy
  [iter 04] all 4 services healthy
  [iter 05] ALERT: database unhealthy
  [iter 06] all 4 services healthy
  [iter 07] all 4 services healthy
  [iter 08] all 4 services healthy

=== Result ===
{ "iterations": 8, "alertCount": 1, "wallTimeMs": 3992 }

Alerts fired:
  [iter 05] database: database health check failed — connection timeout
```

**Crash mode** — monitoring agent crashes on iteration 3:
```bash
bun start:crash
```

```
  [iter 01] all 4 services healthy
  [iter 02] all 4 services healthy
  [iter 03] Checking services... MONITORING AGENT CRASH
Runtime. Function 'checkAllServices' failed with '...' (retrying in 2 secs)
  [iter 03] all 4 services healthy (retry 2)
  [iter 04] all 4 services healthy
  [iter 05] ALERT: database unhealthy
  ...

Notice: iterations 1-2 logged once (cached before crash).
Iteration 3 failed → retried → succeeded.
The monitor resumed exactly where it left off — no re-checks.
No continueAsNew needed. No history limits. Just a loop.
```

## What to Observe

1. **No continueAsNew**: the workflow loops naturally — no explicit lifecycle management
2. **Durable sleep**: each 500ms sleep between iterations is a durable timer checkpoint
3. **Crash isolation**: iteration 3 fails and retries; iterations 1-2 are not re-checked
4. **Alerts accumulate**: the `alerts` array persists across iterations via the generator's local state
5. **Scale to infinity**: change `maxIterations` to `Infinity` and `intervalMs` to `30_000` (30 seconds) for production

## The Code

The monitor workflow is 20 lines in [`src/workflow.ts`](src/workflow.ts):

```typescript
export function* healthMonitor(ctx, config, shouldCrash) {
  const alerts = [];
  let iteration = 0;

  while (iteration < config.maxIterations) {
    iteration++;
    const result = yield* ctx.run(checkAllServices, config.services, iteration, crash);
    for (const alert of result.alerts) alerts.push(alert);
    if (iteration < config.maxIterations) yield* ctx.sleep(config.intervalMs);
  }

  return { iterations: iteration, alerts, uptime: Date.now() - startTime };
}
```

## File Structure

```
example-infinite-workflow-ts/
├── src/
│   ├── index.ts      Entry point — Resonate setup and demo runner
│   └── workflow.ts   Health monitor — infinite loop with durable sleep
├── package.json
└── tsconfig.json
```

**Lines of code**: ~170 total, ~20 lines of monitor workflow logic.

## Production note

The embedded mode used in this demo stores state in memory. For production long-running workflows, run the Resonate server (`resonate dev` or a deployed instance) to get persistent storage across restarts. The workflow code is unchanged between embedded and server modes — only the Resonate instantiation changes.

## Learn More

- [Resonate documentation](https://docs.resonatehq.io)
- [Durable sleep pattern](https://github.com/resonatehq-examples/example-durable-sleep-ts) — the underlying timer primitive
