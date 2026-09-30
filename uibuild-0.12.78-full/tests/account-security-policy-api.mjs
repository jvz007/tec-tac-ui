import fs from 'node:fs'

const sourcePath = new URL('../src/access.js', import.meta.url)
let source = fs.readFileSync(sourcePath, 'utf8')

const calls = []
const fakeApi = `const apiFetch = async (url, options = undefined) => { globalThis.__accountSecurityCalls.push([url, options]); return { policy: { protect_superuser_accounts: true }, can_change: true } }`
source = source.replace("import { apiFetch } from './api'", fakeApi)
globalThis.__accountSecurityCalls = calls
const access = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const loaded = await access.getAccountSecurityPolicy()
if (calls.length !== 1) throw new Error(`expected one GET call, got ${calls.length}`)
if (calls[0][0] !== '/api/tfd/access/security-policy/') throw new Error(`unexpected GET path: ${calls[0][0]}`)
if (calls[0][1] !== undefined) throw new Error('policy GET unexpectedly supplied request options')
if (loaded?.policy?.protect_superuser_accounts !== true) throw new Error('policy GET result was not returned')

calls.length = 0
await access.updateAccountSecurityPolicy(false)
if (calls.length !== 1) throw new Error(`expected one PUT call, got ${calls.length}`)
if (calls[0][0] !== '/api/tfd/access/security-policy/') throw new Error(`unexpected PUT path: ${calls[0][0]}`)
if (calls[0][1]?.method !== 'PUT') throw new Error(`unexpected policy method: ${calls[0][1]?.method}`)
const body = JSON.parse(calls[0][1]?.body || '{}')
if (body.protect_superuser_accounts !== false) throw new Error('false policy value was not preserved')

calls.length = 0
await access.updateAccountSecurityPolicy(true)
const trueBody = JSON.parse(calls[0][1]?.body || '{}')
if (trueBody.protect_superuser_accounts !== true) throw new Error('true policy value was not preserved')

console.log('account-security-policy-api: PASS')
