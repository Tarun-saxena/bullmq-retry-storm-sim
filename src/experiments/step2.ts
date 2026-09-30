import { Queue, Worker } from "bullmq";
import { FakeApi } from "../fakeApi.js";
import { Redis } from "ioredis";
import "dotenv/config";

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    maxRetriesPerRequest: null,
});

const api = new FakeApi();
const start = Date.now();

async function main() {
    const queue = new Queue("payments", { connection: redis });
    await queue.obliterate({ force: true });

    const worker = new Worker("payments", async (job: any) => {
        console.log(`job ${job.id} attempt ${job.attemptsMade + 1} -> calling API`);
        await api.call();
    }, { connection: redis, concurrency: 2 });

    worker.on("completed", (job) => console.log(` job ${job.id} DONE`));
    worker.on("failed", (job, err) =>
        console.log(` job ${job?.id} FAILED (${err.message})`)
    );

    api.mode = { type: "down" };
    setTimeout(() => {
        api.mode = { type: "healthy" };
        console.log(` --- API recovered ---`);
    }, 3000);

    // Add 5 jobs, each allowed 5 attempts, waiting 1s between retries
    for (let i = 1; i <= 5; i++) {
        await queue.add(
            "charge",
            { orderId: i },
            { attempts: 5, backoff: { type: "fixed", delay: 1000 } }
        );
    }

    await new Promise((r) => setTimeout(r, 8000));
    console.log("total API calls:", api.totalCalls, "failed:", api.failedCalls);

    await worker.close();
    await queue.close();
    await redis.quit();
}
main();