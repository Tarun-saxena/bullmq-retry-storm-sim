import { FakeApi } from "../fakeApi.js";

const api = new FakeApi();

async function main() {
    console.log(await api.call());
    console.log("-----");

    api.mode = { type: "down" };
    try {
        await api.call();
    } catch (e) {
        console.log("caught:", (e as Error).message);
    }

    console.log("total calls:", api.totalCalls, "failed:", api.failedCalls);
}
main();