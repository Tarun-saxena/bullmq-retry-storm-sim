import { Queue, Worker } from "bullmq";
import { FakeApi } from "../src/fakeApi.js";
import { summarize, Recorder } from "../src/recorder.js";
import { Redis } from "ioredis";
import "dotenv/config";

export type backOffKind =
    "none"
    | "fixed"
    | "exponential"
    | "exponentialJitter"
    | "exponentialEqualJitter";

export type scenarioConfig = {
    name: string;
    jobs: number;
    outageMs: number;
    concurrency: number;
    attempts: number;
    backoff: backOffKind;
    baseDelayMs: number;
    capacityPerSec: number;

}

function delayFor(kind: backOffKind, base: number, attemptsMade: number) {
    if (kind === "none") return 0;
    if (kind === "fixed") return base;
    const exp = base * 2 ** (attemptsMade - 1);
    if (kind === "exponential") return exp;
    if (kind === "exponentialJitter") return Math.random() * exp;
    return exp / 2 + Math.random() * (exp / 2); // equal jitter
}



export async function runScenario(cfg: scenarioConfig) {
    const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        maxRetriesPerRequest: null,
    });


    const queueName = `sim-${Date.now()}`;
    const rec = new Recorder();
    const api = new FakeApi(rec);
    const queue = new Queue(queueName, { connection: redis });
    await queue.obliterate({ force: true });

    let finished = 0;
    const worker = new Worker(queueName, async () => { await api.call() }, {
        connection: redis,
        concurrency: cfg.concurrency,
        settings: {
            backoffStrategy: (attemptsMade: number) =>
                delayFor(cfg.backoff, cfg.baseDelayMs, attemptsMade),
        },
    });

    worker.on("completed", () => {
        finished++;
        rec.lastJobDoneAt = rec.now();
    });

    worker.on("failed", (job) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
            finished++;
            rec.jobsLost++;
        }
    });

    const sampler = setInterval(async () => {
        const c = await queue.getJobCounts();
        rec.recordDepthSample((c.waiting ?? 0) + (c.active ?? 0) + (c.delayed ?? 0));
    }, 100);

    setTimeout(() => {
        api.mode = { type: "overload", capacityPerSec: cfg.capacityPerSec };
        rec.recoveredAt = rec.now();
    }, cfg.outageMs);

    //api down
    api.mode = { type: "down" };



    await queue.addBulk(
        Array.from({ length: cfg.jobs }, (_, i) => ({
            name: "charge",
            data: { orderId: i },
            opts: { attempts: cfg.attempts, backoff: { type: "custom" } }
        }))
    );

    const deadline = Date.now() + 90000;
    while (finished < cfg.jobs && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
    };

    clearInterval(sampler);
    const result = summarize(rec, cfg.jobs);

    await worker.close();
    await queue.close();
    await redis.quit();

    return result;


}