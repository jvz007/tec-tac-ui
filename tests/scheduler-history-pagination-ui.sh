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
grep -q "loadRunHistory" "$VIEW"
grep -q "historySearchTimer=setTimeout" "$VIEW"
grep -q "300)" "$VIEW"
grep -q "changeRunPage" "$VIEW"
grep -q "Page {{runMeta.page}} / {{runMeta.pages}}" "$VIEW"
grep -q "historyLoading && !runs.length" "$VIEW"
grep -q "onUnmounted(()=>clearTimeout(historySearchTimer))" "$VIEW"
if grep -q "listScheduleRuns()" "$VIEW"; then
  echo "Scheduler initial refresh must not eagerly load run history" >&2
  exit 1
fi
if grep -q "runs.value.slice(0,100)" "$VIEW"; then
  echo "Scheduler history must not locally truncate paged rows" >&2
  exit 1
fi
echo "scheduler history pagination UI: PASS"
