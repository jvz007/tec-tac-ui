// 0.12.110: sign-in parity with Tactical's own sign-in screen.
// (a) the session-ended line above the credentials form, (b) Show / Hide on the password fields, (c) an SSO return with an
// error parameter never reaches the token exchange, and the nginx redirect keeps the query string.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// A browser stand-in for api.js (imported by the helper): an event target, a window location, and a map for localStorage.
const replaced = []
const win = new EventTarget()
win.location = { search: '', href: 'https://tec-tac.example.test/', hash: '', replace: (url) => replaced.push(url) }
win._env_ = { PROD_URL: 'https://tactical.example.test' }
globalThis.window = win
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)) },
  removeItem: (key) => { store.delete(key) },
}

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const api = await import(new URL('../src/api.js', import.meta.url).href)
const notices = await import(new URL('../src/signin-notices.js', import.meta.url).href)
const { sessionEndedMessage, ssoCallbackError, SESSION_ENDED_DEFAULT_MESSAGE, SSO_PROVIDER_ERROR_MESSAGE } = notices
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// (a) sessionEndedMessage: the Core reason, the default for a 401 without one, and nothing for every other case.
{
  for (const code of api.CORE_SESSION_FAILURE_CODES) {
    const text = sessionEndedMessage({ status: 401, code })
    assert.equal(text, api.coreSessionFailureMessage(code), `the mapped text for ${code}`)
    assert.ok(text.length > 0, `${code} has a line`)
  }
  assert.equal(sessionEndedMessage({ status: 401, code: 'session_idle_timeout' }), 'Your Tec-Tac session expired due to inactivity. Sign in again.')
  assert.equal(sessionEndedMessage({ status: 401, code: 'session_absolute_timeout' }), 'Your Tec-Tac session reached its maximum lifetime. Sign in again.')
  assert.equal(sessionEndedMessage({ status: 401, code: 'session_ip_change' }), 'Your network address changed. Sign in again to continue.')
  assert.equal(sessionEndedMessage({ status: 401, code: 'session_ip_changed' }), 'Your network address changed. Sign in again to continue.')
  assert.equal(sessionEndedMessage({ status: 401, code: 'session_revoked' }), 'Your Tec-Tac session was revoked. Sign in again.')
  assert.equal(sessionEndedMessage({ status: 401, code: 'session_invalid_state' }), 'Your Tec-Tac session is no longer trusted. Sign in again.')
  assert.equal(sessionEndedMessage({ status: 401, code: 'mfa_enrollment_required' }), 'Complete authenticator enrollment before using Tec-Tac.')
  assert.equal(sessionEndedMessage({ status: 401 }), SESSION_ENDED_DEFAULT_MESSAGE, 'a 401 without a code gets the shell default')
  assert.equal(SESSION_ENDED_DEFAULT_MESSAGE, 'Your Tactical session is no longer valid. Sign in again.')
  assert.equal(sessionEndedMessage({ status: 401, code: 'something_new' }), SESSION_ENDED_DEFAULT_MESSAGE, 'an unknown code on a 401 gets the default')
  assert.equal(sessionEndedMessage(null), '')
  assert.equal(sessionEndedMessage(undefined), '')
  assert.equal(sessionEndedMessage(''), '')
  assert.equal(sessionEndedMessage(new Error('Startup failed.')), '', 'an error with no status is not a session end')
  assert.equal(sessionEndedMessage({ status: 500, message: 'Core is down.' }), '', 'a startup failure shows nothing')
  assert.equal(sessionEndedMessage({ status: 500, code: 'session_idle_timeout' }), '', 'a known code on a non-401 shows nothing')
  assert.equal(sessionEndedMessage({ status: 403, code: 'unknown' }), '')
  assert.equal(sessionEndedMessage({ status: 0 }), '')
}

// (c, helper) ssoCallbackError: a present error key counts, even empty; the page query is the fallback.
{
  assert.equal(ssoCallbackError({ error: 'access_denied' }, ''), true)
  assert.equal(ssoCallbackError({ error: '' }, ''), true, 'an empty error parameter is still an error return')
  assert.equal(ssoCallbackError({}, '?error=x'), true, 'the page query is read as the fallback')
  assert.equal(ssoCallbackError(undefined, '?error'), true)
  assert.equal(ssoCallbackError({}, ''), false)
  assert.equal(ssoCallbackError({}, undefined), false)
  assert.equal(ssoCallbackError({ foo: 'bar', code: 'x' }, '?state=1'), false, 'unrelated keys are not an error')
  assert.equal(ssoCallbackError(null, null), false)
  assert.equal(SSO_PROVIDER_ERROR_MESSAGE, 'There was an error logging into your provider')
}

// (c, view) the callback view, run with stubs for Vue, the router and the api: an error return never exchanges a token.
function callbackView({ query, search, exchange }) {
  const source = read('../src/views/SsoCallbackView.vue')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const deps = {
    vue: { ref: (value) => ({ value }), onMounted: (fn) => fn() },
    'vue-router': { useRoute: () => ({ query }) },
    '../api': { completeTacticalSso: exchange },
    '../signin-notices': notices,
  }
  win.location.search = search
  const body = script.replace(/^import \{([^}]*)\} from '([^']+)'\s*$/gm, (_, names, from) => `const {${names}} = __deps[${JSON.stringify(from)}]`)
  return new Function('__deps', `${body}\nreturn { state, error, providerError, complete }`)(deps)
}
{
  let exchanges = 0
  const exchange = async () => { exchanges += 1 }
  const failed = callbackView({ query: { error: 'access_denied' }, search: '', exchange })
  await tick()
  assert.equal(exchanges, 0, 'an error return never calls completeTacticalSso')
  assert.equal(failed.state.value, 'failed')
  assert.equal(failed.error.value, 'There was an error logging into your provider')
  assert.equal(failed.providerError.value, true, 'no Retry for a provider error')
  assert.deepEqual(replaced, [], 'nothing redirects by itself')

  // The value is never rendered: a hostile value does not reach the message.
  exchanges = 0
  const hostile = callbackView({ query: { error: '<img src=x onerror=alert(1)>' }, search: '', exchange })
  await tick()
  assert.equal(exchanges, 0)
  assert.equal(hostile.error.value, 'There was an error logging into your provider')

  // The page-query fallback also stops the exchange.
  exchanges = 0
  const fromSearch = callbackView({ query: {}, search: '?error=x', exchange })
  await tick()
  assert.equal(exchanges, 0, 'the page query error stops the exchange too')
  assert.equal(fromSearch.providerError.value, true)

  // Without the parameter the exchange still runs once and the view completes.
  exchanges = 0
  const normal = callbackView({ query: { foo: 'bar' }, search: '', exchange })
  await tick()
  assert.equal(exchanges, 1, 'without the parameter the exchange runs once')
  assert.equal(normal.state.value, 'complete')
  assert.equal(normal.providerError.value, false)
  assert.ok(replaced.includes('/tec-tac/#/dashboards'), 'the success redirect is unchanged')

  // A real failure of the exchange still offers Retry (no providerError flag).
  exchanges = 0
  const broken = callbackView({ query: {}, search: '', exchange: async () => { exchanges += 1; throw new Error('Tactical SSO completion failed.') } })
  await tick()
  assert.equal(exchanges, 1)
  assert.equal(broken.state.value, 'failed')
  assert.equal(broken.error.value, 'Tactical SSO completion failed.')
  assert.equal(broken.providerError.value, false)
}

// (c, source) the callback view shows Back to sign in always, Retry only without a provider error, and no spinner on failure.
{
  const view = read('../src/views/SsoCallbackView.vue')
  assert.match(view, /<button v-if="!providerError" class="btn" type="button" @click="complete">Retry<\/button>/)
  assert.match(view, /<button class="btn ghost" type="button" @click="backToSignIn">Back to sign in<\/button>/)
  assert.match(view, /v-if="state === 'working'"[\s\S]*spinner/)
  assert.doesNotMatch(view, /\{\{ route|query\.error|route\.query\.error/, 'the parameter value is never rendered')
}

// (c, main.js) the initial hash target is compared by its path, so '/sso/callback?error=x' is the callback.
{
  const main = read('../src/main.js')
  const line = main.match(/^\s*(const initialHashPath = .*)$/m)?.[1]
  assert.ok(line, 'main.js derives initialHashPath')
  const initialHashPath = new Function('initialHashTarget', `${line}; return initialHashPath`)
  assert.equal(initialHashPath('/sso/callback?error=access_denied'), '/sso/callback')
  assert.equal(initialHashPath('/sso/callback'), '/sso/callback')
  assert.equal(initialHashPath('/dashboards?x=1'), '/dashboards')
  assert.equal(initialHashPath(null), null)
  assert.match(main, /initialHashPath === '\/sso\/callback'\) await router\.replace\(initialHashTarget\)/)
  assert.match(main, /!initialHashTarget\.startsWith\('\/public\/'\) && initialHashPath !== '\/sso\/callback'/)
  assert.doesNotMatch(main, /initialHashTarget === '\/sso\/callback'/)
  assert.doesNotMatch(main, /initialHashTarget !== '\/sso\/callback'/)
}

// (b) the Show / Hide control: the credentials and set-up proof password fields only, hidden by default, reset on step change.
{
  const login = read('../src/components/LoginPanel.vue')
  assert.match(login, /import \{ sessionEndedMessage \} from '\.\.\/signin-notices'/)
  assert.match(login, /import \{ state \} from '\.\.\/state'/)
  const passwordInputs = login.match(/<input[^>]*name="password"[^>]*>|<input ref="setupPasswordInput"[^>]*>/g) || []
  assert.equal(passwordInputs.length, 2, 'two password inputs: credentials and set-up proof')
  for (const tag of passwordInputs) assert.match(tag, /:type="passwordRevealed \? 'text' : 'password'"/, tag)
  assert.doesNotMatch(login, /type="password"/, 'no static password type is left')
  const toggles = login.match(/<button class="reveal-toggle"[^>]*>/g) || []
  assert.equal(toggles.length, 2)
  for (const tag of toggles) {
    assert.match(tag, /type="button"/)
    assert.match(tag, /:aria-pressed="passwordRevealed \? 'true' : 'false'"/)
    assert.match(tag, /:disabled="busy"/)
  }
  assert.match(login, /:aria-label="passwordRevealed \? 'Hide password' : 'Show password'"/)
  assert.match(login, /@click="passwordRevealed = !passwordRevealed"/)
  assert.match(login, /watch\(step, \(\) => \{ passwordRevealed\.value = false \}\)/)
  const fnBody = (name) => login.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))[1]
  assert.match(fnBody('backToCredentials'), /passwordRevealed\.value = false/)
  assert.match(fnBody('finishLogin'), /passwordRevealed\.value = false/)
  // Every other input (authenticator, backup code, the set-up code) has no reveal binding.
  const otherInputs = login.match(/<input\s[\s\S]*?\/>/g).filter((tag) => !/name="password"|setupPasswordInput/.test(tag))
  assert.ok(otherInputs.length >= 3)
  for (const tag of otherInputs) assert.doesNotMatch(tag, /passwordRevealed/, tag.slice(0, 60))
  // The toggle comes after its input in the DOM, so it is not before the input in Tab order.
  assert.ok(login.indexOf('class="reveal-toggle"') > login.indexOf('name="password"'))

  const css = read('../src/styles.css')
  const rules = css.match(/[^{}]*(reveal-toggle|password-field)[^{}]*\{[^}]*\}/g) || []
  assert.ok(rules.length >= 5, 'the reveal rules exist')
  for (const rule of rules) {
    assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b/, `no hex colour: ${rule.slice(0, 60)}`)
    assert.doesNotMatch(rule, /rgb\(|hsl\(/, `no literal colour function: ${rule.slice(0, 60)}`)
  }
  assert.match(css, /\.reveal-toggle\{[^}]*color:var\(--dim\)/)
}

// (a, source) the session-ended line: its own role=status block above the fields, on the credentials step only, cleared on submit.
{
  const login = read('../src/components/LoginPanel.vue')
  const creds = login.slice(login.indexOf("v-if=\"step === 'credentials'\""), login.indexOf("v-else-if=\"step === 'totp'\""))
  assert.match(creds, /<div v-if="sessionNotice" class="state-inline" role="status">\{\{ sessionNotice \}\}<\/div>/)
  assert.match(login, /const sessionNotice = computed\(\(\) => \(sessionNoticeCleared\.value \? '' : sessionEndedMessage\(state\.error\)\)\)/)
  assert.match(login, /async function submitCredentials\(\) \{\n  error\.value = ''\n  copied\.value = false\n  sessionNoticeCleared\.value = true\n/)
  // The auth error keeps its own block and never shows the session line.
  assert.match(login, /<div v-if="error" class="auth-error" role="alert">\{\{ error \}\}<\/div>/)
  // The session line is not shown on the other steps.
  assert.doesNotMatch(login.slice(login.indexOf("v-else-if=\"step === 'totp'\"")), /sessionNotice/)
  // markUnauthenticated is unchanged: the first reason is kept there (0.12.103).
  const stateSource = read('../src/state.js')
  assert.match(stateSource, /if \(state\.status === 'unauthenticated'\) return/)
}

// The nginx callback redirect keeps the query string. The generated snippet is run under bash with stub variables.
{
  const script = read('../scripts/repair-nginx.sh')
  assert.match(script, /return 302 \/tec-tac\/#\/sso\/callback\\\$is_args\\\$args;/)
  assert.doesNotMatch(script, /return 302 \/tec-tac\/#\/sso\/callback;/)
  const body = script.match(/<<EOF_SNIPPET\n([\s\S]*?)\nEOF_SNIPPET\n/)[1]
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-nginx-'))
  try {
    const gen = path.join(dir, 'gen.sh')
    fs.writeFileSync(gen, `DEPLOY_BASE=/srv/tec-tac\nNOSNIFF_LINE='add_header X-Content-Type-Options nosniff always;'\nCSP_LINE=''\ncat <<EOF_SNIPPET\n${body}\nEOF_SNIPPET\n`)
    const out = execFileSync('bash', [gen], { encoding: 'utf8' })
    const redirect = out.split(/\r?\n/).find((line) => line.includes('#/sso/callback'))
    assert.equal(redirect.trim(), 'return 302 /tec-tac/#/sso/callback$is_args$args;')
    assert.match(out, /try_files \$uri \$uri\/ \/tec-tac\/index\.html;/)
    assert.match(out, /root \/srv\/tec-tac;/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// The documentation says what the forwarded query string does and that a server needs the script run again.
{
  const docs = read('../docs/module-sso.md')
  assert.match(docs, /The redirect keeps the query string, so a provider error such as `error=access_denied` reaches the callback view/)
  assert.match(docs, /sudo bash scripts\/repair-nginx\.sh/)
}

// The three older SSO tests follow the new redirect line.
for (const file of ['f8-sso-completion-0.12.72.mjs', 'f8-oidc-done-when-0.12.76.mjs', 'f8-tactical-native-sso-0.12.77.mjs']) {
  assert.ok(read(`./${file}`).includes('callback\\\\\\$is_args\\\\\\$args;'), file)
}

console.log('signin parity 0.12.110: PASS')
