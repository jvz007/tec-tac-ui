# Tec-Tac Module Help Contract

**Status:** Public authenticated UI runtime contract  
**Owner:** Tec-Tac Core UI  
**Purpose:** Let modules contribute versioned Help/Knowledge Base articles without implementing private help systems.

## 1. Core owns Help

Modules must not ship their own help drawer, knowledge-base shell, modal documentation browser, or competing search experience.

Core owns:

- the top-bar `?` Help button;
- contextual Help drawer;
- `/help` Knowledge Base;
- Markdown rendering;
- search and category browsing;
- route-aware article suggestions;
- module article lifecycle and cleanup.

Modules contribute article content through the `help` object passed to `register(context)`.

## 2. Minimum documentation requirement

Every module that exposes a user-facing authenticated page should ship at least one Help article for that page.

Larger modules should normally provide:

- Overview;
- Configuration;
- Usage/workflows;
- Troubleshooting.

Documentation must describe the behavior of the package version that ships it.

## 3. Register an inline Markdown article

```js
export async function register({ help }) {
  help.register({
    id: 'cybercns.overview',
    title: 'CyberCNS overview',
    category: 'CyberCNS',
    summary: 'Device state, scans and vulnerability summaries.',
    routes: ['/cybercns', '/cybercns/*'],
    keywords: ['vulnerability', 'scan', 'critical', 'high'],
    content: `# CyberCNS\n\nCyberCNS imports scan state...`,
  })
}
```

Article IDs are provider-owned and must start with `<module-id>.`.

## 4. Register a packaged Markdown file

Place Markdown in the extension package:

```text
extensions/cybercns/
├── tec_tac.json
├── tec_tac_ui.json
├── ui/
│   └── index.js
└── help/
    ├── overview.md
    └── troubleshooting.md
```

Then register it:

```js
help.register({
  id: 'cybercns.troubleshooting',
  title: 'CyberCNS troubleshooting',
  category: 'CyberCNS',
  summary: 'API authentication, stale scans and import failures.',
  routes: ['/cybercns', '/cybercns/*'],
  keywords: ['401', 'authentication', 'scan', 'failure'],
  source: 'help/troubleshooting.md',
})
```

`scripts/sync-modules.sh` copies the extension's `help/` directory into the deployed module UI root. `source` must be a relative path inside that module package. External URLs, absolute paths and `..` traversal are rejected.

Core loads source articles lazily and hydrates them when the Help drawer or Knowledge Base needs full-text search.

## 5. Descriptor fields

| Field | Required | Purpose |
| --- | --- | --- |
| `id` | yes | Provider-scoped stable article ID. |
| `title` | yes | Human-readable article title. |
| `category` | yes | Knowledge Base category. |
| `summary` | recommended | One-line description used in search/context results. |
| `routes` | recommended | Routes where the article should appear as contextual Help. |
| `keywords` | recommended | Search terms and product terminology. |
| `order` | optional | Numeric ordering inside a category/context result set. Default `500`. |
| `content` | one of | Inline Markdown. |
| `source` | one of | Relative packaged Markdown path. |

Use `content` or `source`; one is required.

## 6. Route matching

Routes are exact by default:

```js
routes: ['/cybercns']
```

Use a trailing `/*` for descendants:

```js
routes: ['/cybercns', '/cybercns/*']
```

The most specific matching article is shown first in contextual Help.

## 7. Open Help from module UI

Open a specific article:

```js
help.open('cybercns.troubleshooting')
```

Open contextual Help for the current page:

```js
help.openContext()
```

Use this for small `?` affordances beside complex fields or workflows. Do not create a private module modal for the same purpose.

## 8. Markdown safety and supported formatting

Core treats Help Markdown as documentation, not executable HTML. Raw HTML is escaped.

The renderer supports the normal documentation subset:

- headings;
- paragraphs;
- unordered and ordered lists;
- strong/emphasis;
- inline code;
- fenced code blocks;
- links;
- horizontal rules.

Remote scripts, raw HTML and arbitrary embedded widgets are not part of the Help contract.

## 9. Lifecycle

Help contributions are module-scoped.

If module registration fails, Core removes partial Help registrations. If the module is disabled or removed, its articles are no longer registered. This keeps documentation aligned with installed runtime behavior.

## 10. Search

The Knowledge Base searches:

- title;
- category;
- provider/module ID;
- summary;
- keywords;
- loaded Markdown body.

Packaged source articles are hydrated when Help is opened so body text becomes searchable without adding a separate search service.

## 11. Context passed to modules

Authenticated modules receive:

```text
help.register(article)
help.open(articleId)
help.openContext()
help.list()
help.clear()
```

`clear()` is lifecycle-owned and normally used by Core during registration rollback rather than module business logic.

## 12. Future-compatible rules

- Keep article IDs stable once published so UI deep links can remain valid.
- Prefer adding new articles over changing an existing article ID.
- Help content must not contain secrets, tokens or client-specific confidential data.
- User help is separate from developer contracts/documentation in `docs/`.
- Important operational state remains in its owning module; Help explains behavior but is not an audit/history store.
