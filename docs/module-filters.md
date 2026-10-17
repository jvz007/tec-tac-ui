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

There is **no module id prop**. The loader fixes the editor to your module's own id, and the editor only ever uses that id. This is
not a sandbox: the shared api helpers still reach Core's filter routes, and Core, not the editor, decides what the signed-in person
may read for any module id. A replacement module registers its own `<id>.filter_fields` and gets its own filters; there is no
exception for replaced modules, the same as `modulePreferences`.

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

## Date and number fields

Since UI 0.12.117 the editor draws two more field kinds, `date` and `number`. **They need Core 1.17.52 or later**
(`core.filter_sets` 1.1.0). **A module declares such a field only once UI 0.12.117 is installed.** Before that, the editor
drops a field kind it does not know, so the person would see no filter for it.

The editor takes everything from the fields answer. The operators are the ones in that field's own `operators` list (the top-level
`operators` key stays the six text operators). It reads `constraints` (a number's `integer`, `minimum` and `maximum`) and the
top-level `relative_units` (`[{id, max_amount}]`). It never assumes a unit or a limit. An operator it cannot draw is left out of that
field. If the answer has no `relative_units`, `in_the_last` and `not_in_the_last` are left out of date fields. A field left with no
operator is dropped. Date and number fields use no value list.

| Field and operator | Control | Value sent to Core |
|---|---|---|
| date, any single-day operator (`equals`, `not_equals`, `before`, `after`, `on_or_before`, `on_or_after`) | a date box (the browser's picker, 1970-01-01 to 2100-12-31) | `"2026-10-17"`, strict `YYYY-MM-DD`, a real day |
| date, `between` | two date boxes, From and To | `{"from": "2026-10-01", "to": "2026-10-17"}`, both days present, From not after To |
| date, `in_the_last` and `not_in_the_last` | an amount box and a unit list built from `relative_units` | `{"amount": 7, "unit": "days"}`, a whole amount from 1 to that unit's `max_amount` |
| number, any single-value operator | a number box (step 1 for an `integer` field, otherwise any step; `minimum` and `maximum` from the field) | a JSON number, never text |
| number, `between` | two number boxes | `{"from": 1, "to": 10}`, JSON numbers, From not larger than To |

The unit shows as Core sent its id and starts as `days` when Core lists it, otherwise the first unit. A number is plain digits with an
optional minus sign and one decimal point: no exponent, no `NaN`, no infinity, at most 10**15 in size, no decimal on an `integer`
field, and inside `minimum` and `maximum`. A zero or a negative number is a good value. Each refusal is a plain sentence that names
the field and the limit, and Apply stays off until the rules are complete. Changing the operator inside the same control keeps the
value; changing between controls starts it again.

**Days are UTC days.** "17 October" means 17 October 00:00 to 24:00 UTC, not South African time. The help under every day rule says so.
**A row with no value** never matches a positive operator. It does match the field's own "not equals" and, for a date, "not in the
last" operator. The help under a date or number rule quotes those labels from the route, so a module's own wording shows.

A saved set with a date or number rule is drawn back as it was saved. A saved rule whose value does not fit its field kind makes the
whole set undrawable, as before. A set from another person is still listed, not drawn.

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

An empty group asks the person to add a rule or remove it. An empty filter applies as `null`. The limits of a date or a number rule
(the day range, the largest amount, the number range) are in "Date and number fields" below. Core's answer sets them, not this file.

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
