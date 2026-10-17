# Module filters (FilterEditor)

A module list can offer filters without building its own. Core UI 0.12.116 gives every authenticated module one filter editor,
`context.components.FilterEditor`. The person picks a field, how to compare it and a value, groups rules with match ALL or ANY, and
saves a set only they can use. Your module gets a definition back and sends it to its own list route.

**Needs Core 1.17.50 or later** (`core.filter_sets` 1.0.0, see Core's `docs/filter-sets.md`). A module built before this release is
not affected: `context.components` keeps its six members, and `FilterEditor` is simply one more.

**Contract row (UI 0.12.116, not yet in the export).** The surface is described in `module-runtime-api.md` and `module-components.md`.
Core lists it in the public contract export only after the next Core and UI export. A module adopts it at its own release.

## Mounting it

```js
export default {
  register(context) {
    const { h, ref } = context.Vue
    const { FilterEditor } = context.components
    const definition = ref(null)

    context.router.addRoute({
      path: '/agents',
      component: {
        setup() {
          return () => h(FilterEditor, {
            viewKey: 'agents',
            modelValue: definition.value,
            'onUpdate:modelValue': (value) => { definition.value = value },
            onApply: ({ definition: tree, filterSetId }) => loadList({ tree, filterSetId }),
          })
        },
      },
    })
  },
}
```

## Props and events

| Name | Kind | What |
|---|---|---|
| `viewKey` | prop, required | The list this editor filters. A lower-case slug of 1 to 61 characters: a letter or digit first, then letters, digits, `-` or `_` (`^[a-z0-9][a-z0-9_-]{0,60}$`). Saved sets are kept per module and view key. A bad key shows a plain message and makes no request. |
| `modelValue` | prop | The current definition, `{ version: 1, match: 'all' or 'any', rules: [...] }`, or `null` for no filter. |
| `disabled` | prop | Turns every control off. |
| `update:modelValue` | event | The definition, each time the rules are complete (or `null` when there are none). |
| `apply` | event | The person pressed Apply. The payload is `{ definition, filterSetId }`, and exactly one of the two is set (see below). |

There is **no module id prop**. The loader fixes the editor to your module's own id, so a module cannot read another module's fields,
values or sets. A replacement module registers its own `<id>.filter_fields` and gets its own filters; there is no exception for
replaced modules, the same as `modulePreferences`.

### What `apply` sends you

- The rules on screen are new or edited: `{ definition: <the definition>, filterSetId: null }`. Send the definition to your list route.
- A saved set is selected and the rules on screen are still exactly that set: `{ definition: null, filterSetId: '<uuid>' }`. Send the set
  id; Core checks the set again against the person's fields on every use.
- No rules at all: `{ definition: null, filterSetId: null }`. This means **no filter**. A filter with no rules matches nothing in Core,
  so never send an empty definition: treat `null` as "do not filter".

## What the editor reads

It builds only from what Core sends. It never invents a field or an operator and never sends a lookup, a row key or SQL.

| Route | What |
|---|---|
| `GET /api/tfd/filter-sets/fields/?module=<your id>` | The fields the person may use: id, label, kind, that field's own operators, and where its values come from. `available: false` shows "This list has no filters yet." and nothing else is read. |
| `GET /api/tfd/filter-values/?module=&field=&search=&page=` | Values for an Equals picker, 25 a page. The search is trimmed and cut to 100 characters, and waits 250 ms after the last key. |
| `GET /api/tfd/filter-sets/?module=&view_key=` | The sets the person can read. |
| `POST /api/tfd/filter-sets/` | Save a set. The body is exactly `module_id`, `view_key`, `name`, `definition`, `readers`. |
| `PUT /api/tfd/filter-sets/<uuid>/` | Rename or replace a set. Only the changed keys are sent. |
| `DELETE /api/tfd/filter-sets/<uuid>/` | Delete a set. |

Every call goes through your module's own `api()`, so a signed-out person makes no request. Nothing is kept in browser storage.

## Fields, operators and values

- **Operator.** Each field offers its own operators and the first one is the default. Changing the field keeps the operator when the new
  field offers it, otherwise it takes that field's first one. The value always starts again.
- **Equals and Does not equal.** A searchable value picker. A field whose values come from the module (`distinct`) reads the values
  route a page at a time, and the newest answer wins. A field with a short fixed list (`static`) filters that list on the spot. A field
  with no list (`none`) is a plain box (a whole-number box for a client or site id).
- **Contains, Does not contain, Starts with, Ends with.** A plain text box, at most 200 characters, with control characters removed.
  A client or site field offers these only when Core lists them for it, and Core then matches the display name.
- **Yes or no.** A bool field offers Equals only, as a Yes or No choice.
- **Values that cannot load.** If the values read fails (502 `values_unavailable` or any other failure), that picker becomes a plain
  text box and says "The list of values could not load. Type the value instead." It never reads another source.
- **An unfinished rule** shows "Choose a value for <field>." and keeps Apply off.

## Groups and limits

Every group has Match ALL or ANY. Add rule and Add group are on every group. The limits come from Core's answer and the buttons turn
off with a plain reason:

| Limit | Value |
|---|---|
| Rules in a filter | 50 |
| Groups in a filter | 20 |
| Levels of groups (the top group is level 1) | 3 |
| Characters in a value | 200 |
| Characters in a set name | 160 |
| Sets for one person, module and view key | 100 |

An empty group asks the person to add a rule or remove it. An empty filter applies as `null`.

## Saved sets: Only me

Core has no private flag. A set with an empty `readers` list is shared with everyone who can use the module, and a set is private by
listing the owner as the only reader. **Only me is `readers: [<the signed-in person's own user id>]`**, the same way Audit saves a
private view. The id comes from `context.context.user.id`. The editor never sends an empty readers list. If the id is missing, Save is
off with "Reload the page or sign in again to save a set only you can use."

- The person saves the rules on screen under a name (1 to 160 characters, no control characters), renames a set, replaces its rules
  with the ones on screen, and deletes it. Rename, replace and delete are for the owner only.
- Delete asks one plain Yes or No through your module's `confirm`. Nothing is typed.
- A set that is shared (made by someone else, or through the API) is listed with a **Shared** badge and its owner's name. Choosing one
  applies it by id. **0.12.116 does not draw the rules of a set the person does not own.** There is no "save as my copy".
- Core's refusals are shown as Core sent them: 422 `field_unavailable` ("This filter set uses a field you cannot use."), 409
  `name_conflict`, 404 `not_found`, 403 `permission_denied` and 500 `audit_failed`. The panel stays open and keeps the person's text.

Core 1.17.51, which hides rule values a reader may not see, is not signed yet. A choice to share a set is not part of this release.

## Refusals from the runtime

The editor is refused, with a plain sentence and no request, when the person is signed out, after the module was abandoned (a failed
or timed-out `register()`) and after it was unloaded. Pending timers and requests stop when the module unloads or the editor leaves
the page.

## Styling

The editor carries the `tt-ws` work-surface scope and uses only the shell's tokens, so it follows the theme. Every label is shown as
text, never as HTML.
