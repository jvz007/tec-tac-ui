// Helper for csp-prod-url-0.12.83.sh. Usage: node csp-match-helper-0.12.83.mjs "<policy>" "<PROD_URL>"
// Builds the URL the UI would really request and its websocket form, then checks
// both against the connect-src of the generated policy with CSP source matching:
// scheme, case-insensitive host, default port; the path is ignored.
import { apiBase } from '../src/api.js'

const [policy, prodUrl] = process.argv.slice(2)
globalThis.window = { _env_: { PROD_URL: prodUrl } }

const connect = String(policy).split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src '))
if (!connect) { console.error('no connect-src in policy'); process.exit(1) }
const sources = connect.split(/\s+/).slice(1).filter((token) => !token.startsWith("'"))
const defaultPort = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443' }

function matches(rawUrl) {
  const url = new URL(rawUrl)
  return sources.some((source) => {
    if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) return source.toLowerCase() === url.protocol
    const found = /^([a-z][a-z0-9+.-]*):\/\/(\[[^\]]+\]|[^:/]+)(?::(\d+))?$/i.exec(source)
    if (!found) return false
    const [, scheme, host, port] = found
    if (`${scheme.toLowerCase()}:` !== url.protocol) return false
    if (host.toLowerCase() !== url.hostname) return false
    return (port || defaultPort[url.protocol]) === (url.port || defaultPort[url.protocol])
  })
}

const request = `${apiBase()}/api/tfd/securityWAF/status/`
const ws = new URL(request)
ws.protocol = ws.protocol === 'https:' ? 'wss:' : 'ws:'
if (!matches(request)) { console.error(`connect-src does not permit ${request}: ${connect}`); process.exit(1) }
if (!matches(ws.href)) { console.error(`connect-src does not permit ${ws.href}: ${connect}`); process.exit(1) }
