# retry-storm-sim
A wind tunnel for BullMQ job queues. Simulates a downstream API outage and measures how different retry/backoff configs behave: retry amplification, peak queue depth, and time to recover.

## Run locally
    docker compose up -d
    npm install
    npm run step2

## Status
Work in progress. See `src/experiments/` for the current experiments.