import type { Context } from "@resonatehq/sdk";

// ---------------------------------------------------------------------------
// Infinite Health Monitor — runs forever, checking services
// ---------------------------------------------------------------------------
//
// A monitoring workflow that loops indefinitely: check health → alert if
// unhealthy → sleep → repeat. Designed to run for days, weeks, or months.
//
// Temporal's approach: requires `continueAsNew()` to periodically reset
// the event history (limit: 51,200 events). Without it, the workflow
// eventually crashes with "history too large." The developer must manually
// extract state and pass it forward via function arguments.
//
// Resonate's approach: just loop. Each yield* is an independent checkpoint.
// No history accumulates. No continueAsNew needed. No state serialization.

export interface MonitorConfig {
  services: string[];
  intervalMs: number;   // sleep between checks
  maxIterations: number; // for demo purposes; production = Infinity
}

export interface MonitorResult {
  iterations: number;
  alerts: Alert[];
  uptime: number;
}

export interface Alert {
  service: string;
  message: string;
  iteration: number;
  timestamp: string;
}

export function* healthMonitor(
  ctx: Context,
  config: MonitorConfig,
  shouldCrash: boolean,
): Generator<any, MonitorResult, any> {
  const alerts: Alert[] = [];
  const startTime = Date.now();
  let iteration = 0;

  // Loop forever (capped at maxIterations for the demo).
  // In production, set maxIterations = Infinity.
  // No continueAsNew required — Resonate has no history limit.
  while (iteration < config.maxIterations) {
    iteration++;

    // Check all services in this iteration
    const crashThisIteration = shouldCrash && iteration === 3;
    const result = yield* ctx.run(
      checkAllServices,
      config.services,
      iteration,
      crashThisIteration,
    );

    // Collect any alerts
    for (const alert of result.alerts) {
      alerts.push(alert);
    }

    // Sleep between checks (durable — survives crashes)
    if (iteration < config.maxIterations) {
      yield* ctx.sleep(config.intervalMs);
    }
  }

  return {
    iterations: iteration,
    alerts,
    uptime: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Health check step — checks all services in one iteration
// ---------------------------------------------------------------------------

interface CheckResult {
  iteration: number;
  healthy: string[];
  unhealthy: string[];
  alerts: Alert[];
}

const attemptMap = new Map<string, number>();

async function checkAllServices(
  _ctx: Context,
  services: string[],
  iteration: number,
  shouldCrash: boolean,
): Promise<CheckResult> {
  const key = `iteration-${iteration}`;
  const attempt = (attemptMap.get(key) ?? 0) + 1;
  attemptMap.set(key, attempt);

  // Simulate checking each service
  await sleep(50);

  if (shouldCrash && attempt === 1) {
    console.log(`  [iter ${pad(iteration)}] Checking services... MONITORING AGENT CRASH`);
    throw new Error("Monitoring agent lost connection to metrics endpoint");
  }

  const healthy: string[] = [];
  const unhealthy: string[] = [];
  const alerts: Alert[] = [];

  for (const service of services) {
    // Simulate: database is unhealthy on iteration 5
    const isHealthy = !(service === "database" && iteration === 5);

    if (isHealthy) {
      healthy.push(service);
    } else {
      unhealthy.push(service);
      alerts.push({
        service,
        message: `${service} health check failed — connection timeout`,
        iteration,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const retryTag = attempt > 1 ? ` (retry ${attempt})` : "";
  const status = unhealthy.length > 0
    ? `ALERT: ${unhealthy.join(", ")} unhealthy`
    : `all ${healthy.length} services healthy`;

  console.log(`  [iter ${pad(iteration)}] ${status}${retryTag}`);

  return { iteration, healthy, unhealthy, alerts };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
