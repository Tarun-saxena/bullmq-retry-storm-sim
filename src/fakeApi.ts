import type { Recorder } from "./recorder.js";
export type FailureMode =
    { type: "healthy" } |
    { type: "down" } |
    { type: "errorRate", rate: number } |
    { type: "overload", capacityPerSec: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


export class FakeApi {
    mode: FailureMode = { type: "healthy" };
    totalCalls = 0;
    failedCalls = 0;
    recent: number[] = [];

    constructor(private recorder?: Recorder) { }

    async call() {
        this.totalCalls++;
        await sleep(50); // pretend the network takes 50ms
        const now = Date.now();
        this.recent = this.recent.filter((t) => now - t < 1000);
        this.recent.push(now);

        const nowRec = this.recorder?.now() ?? 0;

        const shouldFail =
            this.mode.type === "down" ||
            (this.mode.type === "errorRate" && Math.random() < this.mode.rate) ||
            (this.mode.type === "overload" && this.recent.length > this.mode.capacityPerSec);

        this.recorder?.recordCall(!shouldFail);


        if (shouldFail) {
            this.failedCalls++;
            throw new Error("API failed");
        }
        return "ok";
    }
}