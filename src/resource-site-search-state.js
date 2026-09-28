export function clientChangeSiteSearchState(currentSearch = '') {
  return {
    suppressNextSearchLoad: Boolean(currentSearch),
    nextSearch: '',
  }
}

export function consumeSiteSearchSuppression(suppressNextSearchLoad) {
  return {
    skipLoad: suppressNextSearchLoad === true,
    suppressNextSearchLoad: false,
  }
}
