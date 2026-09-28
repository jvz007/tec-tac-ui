export function createResourceSiteSearchCoordinator({ cancelScheduled, clearSearch, loadImmediate, scheduleLoad }) {
  let suppressNextSearchLoad = false

  return {
    clientChanged(currentSearch = '') {
      cancelScheduled()
      suppressNextSearchLoad = Boolean(currentSearch)
      clearSearch()
      loadImmediate()
    },
    searchChanged() {
      cancelScheduled()
      if (suppressNextSearchLoad) {
        suppressNextSearchLoad = false
        return { skipped: true }
      }
      scheduleLoad()
      return { skipped: false }
    },
    reset() {
      suppressNextSearchLoad = false
      cancelScheduled()
    },
  }
}

// Historical pure transitions retained for compatibility with earlier regressions.
export function clientChangeSiteSearchState(currentSearch = '') {
  return { suppressNextSearchLoad: Boolean(currentSearch), nextSearch: '' }
}

export function consumeSiteSearchSuppression(suppressNextSearchLoad) {
  return { skipLoad: suppressNextSearchLoad === true, suppressNextSearchLoad: false }
}
