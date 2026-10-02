import { runScenario, type scenarioConfig } from "../runScenario.js";

const base = { jobs: 50, outageMs: 3000, attempts: 5, concurrency: 5, baseDelayMs: 1000, capacityPerSec: 30 };

const configs: scenarioConfig[] = [
    { ...base, name: "none", backoff: "none" },
    { ...base, name: "fixed 1s", backoff: "fixed" },
    { ...base, name: "exponential", backoff: "exponential" },
    { ...base, name: "exponential, conc 2", backoff: "exponential", concurrency: 2 },
    { ...base, name: "exp + jitter", backoff: "exponentialJitter" },
    { ...base, name: "exp + equal jitter", backoff: "exponentialEqualJitter" },
    { ...base, name: "exp + equal jitter, concurrency 2", backoff: "exponentialEqualJitter", concurrency: 2 },

];

const Runs = 5;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

async function runMany(cfg: scenarioConfig) {
    const results: Awaited<ReturnType<typeof runScenario>>[] = [];
    for (let i = 0; i < Runs; i++) {
        results.push(await runScenario(cfg));
    }

    return {
        config: cfg.name,
        amplificationMean: +mean(results.map((r) => r.amplification)).toFixed(2),
        peakCallsMean: +mean(results.map((r) => r.peakCallsPerSec)).toFixed(1),
        peakDepthMean: +mean(results.map((r) => r.peakQueueDepth)).toFixed(1),
        recoveryMsMean: +mean(results.map((r) => r.recoveryMs ?? 0)).toFixed(0),
        jobsLostMean: +mean(results.map((r) => r.jobsLost)).toFixed(1),
    };
}


async function main() {
    const rows = [];
    for (const cfg of configs) {
        console.log(`running ${Runs}x: ${cfg.name}`);
        rows.push(await runMany(cfg));
    }
    console.table(rows);
}

main();