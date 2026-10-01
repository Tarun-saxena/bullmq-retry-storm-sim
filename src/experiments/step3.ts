import { Queue, Worker } from "bullmq";
import { FakeApi } from "../fakeApi.js";
import { summarize, Recorder } from "../recorder.js";
import { Redis } from "ioredis";
import "dotenv/config";

const TotalJobs = 50;
const Outage_Ms = 3000;

async function main() {
    const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        maxRetriesPerRequest: null,
    });

    const rec = new Recorder();
    const api = new FakeApi(rec);
    const queue = new Queue("payments", { connection: redis });
    await queue.obliterate({ force: true });

    let finished = 0;
    const worker = new Worker("payments", async () => { await api.call() }, {
        connection: redis,
        concurrency: 5,
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

    //api down
    api.mode = { type: "down" };
    setTimeout(() => {
        api.mode = { type: "healthy" };
        rec.recoveredAt = rec.now();
    }, Outage_Ms);

    await queue.addBulk(
        Array.from({ length: TotalJobs }, (_, i) => ({
            name: "charge",
            data: { orderId: i },
            opts: { attempts: 5, backoff: { type: "fixed", delay: 1000 } }
        }))
    );

    const deadline = Date.now() + 30000;
    while (finished < TotalJobs && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
    };

    clearInterval(sampler);
    console.table(summarize(rec, TotalJobs));
    await worker.close();
    await queue.close();
    await redis.quit();


}
main();