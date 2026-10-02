import { runScenario, type scenarioConfig } from "../runScenario.js";

type base = Omit<scenarioConfig, "name" | "backoff">;

const scenarios: Record<string, base> = {
    small: { jobs: 50, outageMs: 3000, attempts: 5, concurrency: 5, baseDelayMs: 1000, capacityPerSec: 30 },
    crowd: { jobs: 300, outageMs: 3000, attempts: 5, concurrency: 30, baseDelayMs: 1000, capacityPerSec: 60 }
}

function makeConfig(base: base): scenarioConfig[] {
    const half = Math.ceil(base.concurrency / 2);
    return [
        { ...base, name: "none", backoff: "none" },
        { ...base, name: "fixed 1s", backoff: "fixed" },
        { ...base, name: "exponential", backoff: "exponential" },
        { ...base, name: "exponential, half conc", backoff: "exponential", concurrency: half },
        { ...base, name: "exp + jitter", backoff: "exponentialJitter" },
        { ...base, name: "exp + equal jitter", backoff: "exponentialEqualJitter" },
        { ...base, name: "exp + equal jitter, half conc", backoff: "exponentialEqualJitter", concurrency: half },
    ];
};

const Runs = 3;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

async function runMany(cfg: scenarioConfig) {
    const results: Awaited<ReturnType<typeof runScenario>>[] = [];
    for (let i = 0; i < Runs; i++) {
        results.push(await runScenario(cfg));
    }

    const recoveries = results
        .map((r) => r.recoveryMs)
        .filter((x): x is number => x !== null);


    return {
        config: cfg.name,
        amplificationMean: +mean(results.map((r) => r.amplification)).toFixed(2),
        peakCallsMean: +mean(results.map((r) => r.peakCallsPerSec)).toFixed(1),
        peakDepthMean: +mean(results.map((r) => r.peakQueueDepth)).toFixed(1),
        recoveryMsMean: recoveries.length ? Math.round(mean(recoveries)) : "n/a",
        finishedRuns: recoveries.length,
        jobsLostMean: +mean(results.map((r) => r.jobsLost)).toFixed(1),
    };


}

type Row = Awaited<ReturnType<typeof runMany>>;

// ranking rule: fewest lost jobs, then fewest calls, then fastest recovery
function pickBest(rows: Row[]): Row {
    const rec = (r: Row) =>
        typeof r.recoveryMsMean === "number" ? r.recoveryMsMean : Number.MAX_SAFE_INTEGER;
    const sorted = [...rows].sort(
        (a, b) =>
            a.jobsLostMean - b.jobsLostMean ||
            a.amplificationMean - b.amplificationMean ||
            rec(a) - rec(b)
    );
    const best = sorted[0];
    if (!best) throw new Error("pickBest called with no rows");
    return best;
}


async function main() {
    for (const [name, base] of Object.entries(scenarios)) {
        console.log(`\n=== scenario: ${name} ===`);
        const rows: Row[] = [];
        for (const cfg of makeConfig(base)) {
            console.log(`running ${Runs}x: ${cfg.name}`);
            rows.push(await runMany(cfg));
        }
        console.table(rows);
        console.log(
            `Best (fewest lost jobs, then fewest calls, then fastest recovery): ${pickBest(rows).config}`
        );
    }
}

main();