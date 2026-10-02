# bullmq-retry-storm-sim

A simulator that replays an API outage against a real BullMQ queue and measures
how different retry settings behave: how much extra load they create, how many
jobs they lose, and how long recovery takes.

## The problem

When a dependency fails, job queues retry. Naive retries can multiply the load on
the failing API and stop it from recovering (a retry storm). Retry settings are
usually picked by guesswork, and the difference only shows up during an outage.
This tool rehearses that outage and puts numbers on it.

## How it works

Fake API (outage and overloaded modes) -> real BullMQ worker on Redis ->
recorder -> metrics summary -> averaged comparison across retry configs.

1. The API is **down** for 3 seconds, so every call fails.
2. It then comes back **fragile**: it can only serve N calls per second and
   rejects the rest. This is how a real struggling service behaves, and it is
   what makes synchronized retries harmful.
3. Each retry config processes the same jobs. Every API call is logged with a
   timestamp, and the log is turned into metrics.
4. Each config is run several times and the results are averaged.

Only the downstream API is simulated. The queue, Redis, workers and retry
behavior are real BullMQ.

## Metrics

| Metric | Meaning |
|---|---|
| amplification | total API calls / number of jobs (1.0 = no retries needed) |
| peakCallsPerSec | most calls that landed in any 1-second window |
| recoveryMs | time from API recovery until the last job finished (`n/a` if no job finished) |
| jobsLost | jobs that used all attempts and failed permanently |

Read `recoveryMs` together with `jobsLost`: lost jobs never finish, so a config
that loses jobs can look faster than it is.

## Retry configs compared

- **none**: retry immediately
- **fixed 1s**: always wait 1 second
- **exponential**: 1s, 2s, 4s, 8s
- **exp + full jitter**: random wait between 0 and the exponential delay
- **exp + equal jitter**: half the exponential delay plus a random half
- **half conc** variants: the same backoff with half as many concurrent jobs,
  as a control for "is it just going slower?"

## Scenarios

- **small**: 50 jobs, 5 concurrent, API capacity 30 calls/s after recovery
- **crowd**: 200 jobs, 30 concurrent, API capacity 60 calls/s after recovery

Both use a 3-second outage and 5 attempts per job. Results are averages of 3 runs.

## Results

### small

| config | amplification | peak calls/s | recovery (ms) | jobs lost (of 50) |
|---|---|---|---|---|
| none | 5 | 83.3 | n/a | 50 |
| fixed 1s | 5 | 50 | n/a | 50 |
| exponential | 3.4 | 50 | 4975 | 0 |
| exponential, half conc | 3.4 | 50 | 5389 | 0 |
| exp + full jitter | 4.13 | 83.3 | 7033 | 0.7 |
| exp + equal jitter | 4.01 | 69 | 6784 | 0 |
| exp + equal jitter, half conc | 3.67 | 51 | 4662 | 0 |

### crowd

| config | amplification | peak calls/s | recovery (ms) | jobs lost (of 200) |
|---|---|---|---|---|
| none | 5 | 380 | n/a | 200 |
| fixed 1s | 5 | 200 | n/a | 200 |
| exponential | 4.1 | 200 | 12873 | 20 |
| exponential, half conc | 4.1 | 200 | 13171 | 20 |
| exp + full jitter | 4.77 | 353.7 | 10499 | 33 |
| exp + equal jitter | 4.68 | 287.3 | 11709 | 0 |
| exp + equal jitter, half conc | 4.66 | 247.3 | 12259 | 0 |

## Findings

- Against an API that comes back fragile, **no backoff and fixed 1s backoff lost
  every job** in both scenarios.
- At small scale, **plain exponential backoff was best** (3.4 calls per job,
  0 lost). Jitter added calls and peak load without a benefit.
- With many concurrent retries, **plain exponential lost 10% of jobs while equal
  jitter lost none**. Halving concurrency did not change plain exponential's
  result, so the gain came from spreading retries out, not from going slower.
- **Full jitter was the worst jittered option** (33 of 200 lost). Waits close to
  zero send retries straight back into an overloaded API. Keeping a minimum
  wait (equal jitter) avoided this.

## Limitations

- One worker process running many concurrent jobs. Jitter matters most when many
  independent clients retry, which this does not model.
- The fake API is a simple per-second capacity model, not a real server.
- Averages of 3 runs on one machine; small differences are within noise. The
  results also depend on the chosen capacity and outage length.

## Run it

```bash
docker compose up -d
cp .env.example .env
npm install
npm run compare
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.
Run `npm run typecheck` before experiments to catch mistakes early.

## Project layout

- `src/fakeApi.ts`: API you can break on purpose
- `src/recorder.ts`: call log and metrics summary
- `src/runScenario.ts`: runs one retry config against one outage
- `src/experiments/compare.ts`: runs all configs and ranks them