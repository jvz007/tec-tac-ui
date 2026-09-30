#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
VIEW="$ROOT/src/views/SchedulesView.vue"
API="$ROOT/src/scheduler.js"

grep -q "pageSize:null" "$API" || grep -q "pageSize=null" "$API"
grep -q "params.set('page'" "$API"
grep -q "params.set('page_size'" "$API"
grep -q "params.set('search'" "$API"
grep -q "const runPageSize=50" "$VIEW"
grep -q "historyCountLabel" "$VIEW"
grep -q "loadScheduleHistoryPage" "$VIEW"
grep -q "historyError" "$VIEW"
grep -q "userHistoryLoaded" "$VIEW"
grep -q "moduleHistoryLoaded" "$VIEW"
grep -q "scheduler-history-loader" "$VIEW"
grep -q "refreshing" "$VIEW"
grep -q "historySearchTimer=setTimeout" "$VIEW"
grep -q "changeRunPage" "$VIEW"
grep -q "Page {{runMeta.page}} / {{runMeta.pages}}" "$VIEW"
grep -q "historyLoading && !runs.length" "$VIEW"
grep -q "onUnmounted(()=>clearTimeout(historySearchTimer))" "$VIEW"
node "$ROOT/tests/scheduler-history-state.mjs"
if grep -q "listScheduleRuns()" "$VIEW"; then
  echo "Scheduler initial refresh must not eagerly load run history" >&2
  exit 1
fi
if grep -q "historyLoading.value=true;error.value=''" "$VIEW"; then
  echo "Scheduler history loading must not clear the global Scheduler error" >&2
  exit 1
fi
if grep -q "runs.value.slice(0,100)" "$VIEW"; then
  echo "Scheduler history must not locally truncate paged rows" >&2
  exit 1
fi
echo "scheduler history pagination UI: PASS"
