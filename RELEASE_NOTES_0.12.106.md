# UI 0.12.106

Date: 14 October 2026. Requires Core 1.17.35 or later (raised from 1.17.34, the Core release this UI was built and tested against).

## What changes for you

- **Save all your Tactical UI preferences in one place.** My Account's Tactical UI card now covers the agent table (double-click action, URL Action, default tab, client tree sort and splitter, clear search when switching), the display switches (dark mode and community scripts), the five dashboard and loading colours, and the date format. Core stores them on your Tactical account, so Tactical and Tec-Tac show the same choice.
- **Your colours show.** Tec-Tac uses a colour you choose for the dashboard figures (Info, Positive, Negative, Warning). It uses your colour only when it differs from Tactical's default. At the default, the theme colours stay as they are. The loading bar colour is saved and published, but Tec-Tac has no loading bar yet, so nothing shows it.
- **Your date format shows.** Tec-Tac's own pages (sessions, API keys, notices, backups, diagnostics, modules history, schedules, system updates and contracts) use your date format when you set one. An empty format keeps the browser's default text.
- **Save only what changed.** Save sends only the fields you changed. A refusal from Core appears on the card as Core wrote it, and nothing is applied.
- **Dark mode in Tactical and the Tec-Tac header theme are separate.** The switch on My Account saves Tactical's dark mode only. Change the Tec-Tac header theme in Tec-Tac preferences.

## What stays as it was

- The agent double-click action and the URL Action choice work as before.
- Modules keep the server's date format. The person's date format is used on Core's pages only in this release.
- `block_dashboard_login` is not a UI preference. It is never sent from this screen.
- The sign-in screen, notifications, job follow and every installed module keep working without a change.

## What you do not get yet

- **No loading bar.** The shell has no loading bar to colour yet, so only the colour is published. A bar is a design decision (open question in `reviews/questions/ui.md`).
- **Numbered Quasar colours** such as `deep-purple-3` are saved, but Tec-Tac does not show them yet. It uses the default colour instead. Base names (for example `red`, `teal`) and brand names (`info`, `positive`, `negative`, `warning`) are shown. A `#` colour of 3, 4, 6 or 8 digits is always shown.
- **Modules do not read the date format yet.** A module's own pages keep the server date format.
- **Remote Background** does not yet remember its header collapse through the new helper. That is module work after this release is signed.

## For module developers

- **`register(context).modulePreferences`** keeps one small choice per person through Core: `get(name, fallback)`, `getAll()`, `set(name, value)` and `remove(name)`. All four are asynchronous.
- The module id is bound. Nothing you pass names a module. There is no replaced-module exception: a replacement keeps its own preferences.
- Names match `[a-z0-9][a-z0-9._-]{0,63}`. A value is plain JSON, at most 4 KiB when stored and at most 5 levels deep. Bad names and values are refused before any request.
- Signed out, abandoned and unloaded refusals match the other helpers. Nothing is stored in the browser, and nothing is cached.
- A raw `api`, `apiRaw`, `apiBlob` or `apiText` path to another module's `/api/tfd/module-preferences/<id>/` is refused, the same way another module's Tactical operation path is.
- `registerPublic(context)` does not get the helper.
- The full contract is in `docs/module-preferences.md`. The runtime API page points to it. The browser contract row `ui.authenticated.modulePreferences` is in the docs; Core writes the export row (`reviews/requests/core.md`). This release does not claim the export lists it.
- The dashboard metric cards read `--tactical-dash-info-color`, `--tactical-dash-positive-color`, `--tactical-dash-negative-color` and `--tactical-dash-warning-color` with the theme token as the fallback. The details are in `docs/ui-design-standards.md`.
- All of this is additive.
