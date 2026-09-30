# Scheduler Configuration

Scheduler Configuration contains administrative settings and diagnostics for the Core scheduling engine.

## One-off retention

This setting controls how long completed or expired one-off schedule definitions are retained. Execution history remains available separately.

## Runtime health

Runtime health shows the latest scheduler tick, queue/running counts, failures, dispatch state, and any `AuthorizationRevoked` skips from the last 24 hours. Use it when schedules are not being picked up, execution appears delayed, or a saved owner has lost action/resource scope.

## Self-tests

Self-tests validate Core scheduler and Celery execution paths without touching normal endpoint workflows. The deliberate failure test is expected to fail and exists to confirm failure reporting.
