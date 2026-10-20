// 0.12.119: since the Module Manager markup moved into src/components/modules/ (presentational components with props in and events
// out), a test that reads "the Module Manager source" reads this: ModulesView.vue first, then every component in that folder, then
// module-manager-tables.js. ModulesView.vue stays first, so a slice that starts at its template or a function in its script still
// finds the same text. Run directly it prints the text (foundation.sh uses that).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const MODULE_MANAGER_FILES = () => {
  const folder = path.join(ROOT, 'src', 'components', 'modules')
  const components = fs.readdirSync(folder).filter((name) => name.endsWith('.vue')).sort().map((name) => path.join(folder, name))
  return [path.join(ROOT, 'src', 'views', 'ModulesView.vue'), ...components, path.join(ROOT, 'src', 'module-manager-tables.js')]
}

export function moduleManagerSource() {
  return MODULE_MANAGER_FILES().map((file) => fs.readFileSync(file, 'utf8')).join('\n')
}

// The page alone, and the components alone, for a test that must say which side holds a thing.
export const pageSource = () => fs.readFileSync(path.join(ROOT, 'src', 'views', 'ModulesView.vue'), 'utf8')
export const componentsSource = () => MODULE_MANAGER_FILES().slice(1, -1).map((file) => fs.readFileSync(file, 'utf8')).join('\n')

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.stdout.write(moduleManagerSource())
}

// 0.12.119: a handler is wired when its attribute is in the source as written, or when it moved into a component: the page binds the
// component's event of the same name to the same handler (@move-inspected="moveInspected"). attr is the old attribute text, for example
// @click="moveInspected(row.id,-1)". The call arguments belong to the component now, so only the handler's name is compared.
export const kebab = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
export function handlerWired(source, attr) {
  if (source.includes(attr)) return true
  const match = /^@[\w.:-]+="([^"]*)"$/.exec(attr)
  if (!match) return false
  const ident = /^[A-Za-z_$][\w$]*/.exec(match[1])?.[0]
  if (!ident || match[1] !== ident && !/^[A-Za-z_$][\w$]*\(.*\)$/.test(match[1])) return false
  return source.includes(`@${kebab(ident)}="${ident}"`)
}
