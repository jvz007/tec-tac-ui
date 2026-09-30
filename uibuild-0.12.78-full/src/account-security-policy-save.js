export async function persistAccountSecurityPolicy(requested, updatePolicy) {
  if (typeof updatePolicy !== 'function') throw new TypeError('updatePolicy must be a function')
  return updatePolicy(requested === true)
}
