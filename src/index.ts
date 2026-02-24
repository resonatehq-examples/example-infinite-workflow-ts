import { Resonate } from "@resonatehq/sdk";
import { healthMonitor, type MonitorConfig } from "./workflow";

// ---------------------------------------------------------------------------
// Resonate setup
// ---------------------------------------------------------------------------

const resonate = new Resonate();
resonate.register(healthMonitor);

// ---------------------------------------------------------------------------
// Run the infinite health monitor (capped at 8 iterations for demo)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const shouldCrash = args.includes("--crash");

const config: MonitorConfig = {
  services: ["api-gateway", "database", "cache", "queue"],
  intervalMs: 500,  // 500ms between checks (production: 30_000 or more)
  maxIterations: 8, // capped for demo (production: Infinity)
};

const modeDescriptions = {
  normal: "HAPPY PATH  (8 iterations, database alert on iter 5)",
  crash: "CRASH DEMO  (monitoring agent crashes on iter 3, resumes; iters 1-2 not re-checked)",
};

console.log("=== Infinite Workflow Demo (Health Monitor) ===");
console.log(`Mode: ${modeDescriptions[shouldCrash ? "crash" : "normal"]}`);
console.log(`Services: ${config.services.join(", ")}`);
console.log(`Interval: ${config.intervalMs}ms between checks`);
console.log(`Iterations: ${config.maxIterations} (demo cap; production = ∞)\n`);

const wallStart = Date.now();

const result = await resonate.run(
  `monitor/${Date.now()}`,
  healthMonitor,
  config,
  shouldCrash,
);

const wallMs = Date.now() - wallStart;

console.log("\n=== Result ===");
console.log(
  JSON.stringify(
    {
      iterations: result.iterations,
      alertCount: result.alerts.length,
      wallTimeMs: wallMs,
    },
    null,
    2,
  ),
);

if (result.alerts.length > 0) {
  console.log("\nAlerts fired:");
  for (const alert of result.alerts) {
    console.log(`  [iter ${String(alert.iteration).padStart(2, "0")}] ${alert.service}: ${alert.message}`);
  }
}

if (shouldCrash) {
  console.log(
    "\nNotice: iterations 1-2 logged once (cached before crash).",
    "\nIteration 3 failed → retried → succeeded.",
    "\nThe monitor resumed exactly where it left off — no re-checks.",
    "\nNo continueAsNew needed. No history limits. Just a loop.",
  );
} else {
  console.log(
    "\nThis monitor ran 8 iterations as a demo.",
    "\nIn production, set maxIterations = Infinity.",
    "\nResonate has no event history limit — no continueAsNew needed.",
    "\nThe workflow can run for days, weeks, or months without intervention.",
  );
}
