# Schedules

The Scheduler is Core-owned. Modules register actions; Core owns timing, retries, concurrency and execution history. User-created schedules and module-managed schedules share the same engine but are shown separately.

## Creating a schedule

Choose a registered action, set its target scope and parameters, then select Once, Daily, Weekly or Monthly timing. The schedule remains valid even when its target set is currently empty; it simply has nothing to execute against until targets are available.

## Run now

**Run now** dispatches the stored action immediately without changing the schedule's normal timing. Dangerous actions require stronger confirmation.

## Run history

Use **Run history** to see queued, running, successful and failed executions. Run IDs and Celery task IDs are retained for troubleshooting.

## Scheduler administration

Retention, health and self-tests are intentionally separated from this operational page. Open **Scheduler Configuration** under Administration for those controls.


## Ownership

**User schedules** are created and edited by operators in this page. **Module schedules** are definitions owned by installed modules and are intentionally read-only here; change them from the owning module. Both can be executed by Core, and their histories are kept in separate views for clarity.
