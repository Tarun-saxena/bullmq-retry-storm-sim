import { runScenario, type scenarioConfig } from "../runScenario.js";

const base = { jobs: 50, outageMs: 3000, attempts: 5, concurrency: 5, baseDelayMs: 1000 };

const configs: scenarioConfig[] = [
    { ...base, name: "fixed 1s", backoff: "fixed" },
    { ...base, name: "exponential", backoff: "exponential" },
    { ...base, name: "exp + jitter", backoff: "exponentialJitter" },
    { ...base, name: "exp + jitter, concurrency 2", backoff: "exponentialJitter", concurrency: 2 },
];

async function main() {
    for (const cfg of configs) {
        console.log(`running: ${cfg.name}`);
        const result = await runScenario(cfg);
        console.table([result]);
    }
}

main();