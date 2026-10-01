export type callEvent = { at: number; ok: boolean };

export class Recorder {
    readonly startedAt = Date.now();
    calls: callEvent[] = [];
    depthSamples: number[] = [];
    recoveredAt?: number;
    lastJobDoneAt?: number;
    jobsLost = 0;

    now() {
        return Date.now() - this.startedAt;
    }

    recordCall(ok: boolean) {
        this.calls.push({ at: this.now(), ok });
    }

    recordDepthSample(depth: number) {
        this.depthSamples.push(depth);
    }

}

export function summarize(rec: Recorder, totalJobs: number) {
    const totalCalls = rec.calls.length;
    const failedCalls = rec.calls.filter(c => !c.ok).length;

    let peakCallsPerSec = 0;
    for (let i = 0; i < rec.calls.length; i++) {
        const windowStart = rec.calls[i]!.at;
        const windowEnd = windowStart + 1000;
        let n = 0;
        for (let j = i; j < rec.calls.length && rec.calls[j]!.at < windowEnd; j++) {
            n++;
        }

        peakCallsPerSec = Math.max(peakCallsPerSec, n);

    };

    const recoveryMs = rec.recoveredAt !== undefined && rec.lastJobDoneAt !== undefined ? rec.lastJobDoneAt - rec.recoveredAt : null;

    return {
        jobs: totalJobs,
        totalCalls,
        failedCalls,
        amplification: +(totalCalls / totalJobs).toFixed(2),
        peakCallsPerSec,
        peakQueueDepth: Math.max(0, ...rec.depthSamples),
        recoveryMs,
        jobsLost: rec.jobsLost,
    };



}