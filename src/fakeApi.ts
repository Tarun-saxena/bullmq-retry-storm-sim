export type FailureMode = { type: "healthy" } | { type: "down" } | { type: "errorRate", rate: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


export class FakeApi {
    mode: FailureMode = { type: "healthy" };
    totalCalls = 0;
    failedCalls = 0;

    async call(): Promise<string> {
        this.totalCalls++;
        await sleep(50); // pretend the network takes 50ms

        const shouldFail =
            this.mode.type === "down" ||
            (this.mode.type === "errorRate" && Math.random() < this.mode.rate);

        if (shouldFail) {
            this.failedCalls++;
            throw new Error("API failed");
        }
        return "ok";
    }
}