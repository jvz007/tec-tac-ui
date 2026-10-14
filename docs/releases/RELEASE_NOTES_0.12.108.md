# UI 0.12.108

Date: 14 October 2026. Requires Core 1.17.38 or later (raised from 1.17.37, the Core release this UI was built and tested against).

## What changes for you

- **The loading bar uses a theme colour until you choose one.** Before, the bar was Tactical's red unless you picked another colour. Now it is a soft blue in Dark, a royal blue in Light and green in High contrast. A colour you chose in Tactical still wins.
- **Tactical's red counts as "not chosen".** Core does not say whether you picked red or left Tactical's default, so Tec-Tac treats red as not chosen. If you want Tactical's red, type `#F44336` in the Loading bar field on My Account and save.
- **My Account says what the loading bar uses.** Under the Loading bar field you see "Using the theme colour. Choose any other colour to use your own." while the theme colour is in use.
- **The four figure colours are unchanged.** Info, Positive, Negative and Warning figures keep Tactical's colours in Dark and Light, and High contrast keeps its own colours.
- **Module settings save after a short pause.** A module that keeps your settings (such as a collapsed header) saves once after a quick run of clicks, not once per click. A change reaches Core up to 400 ms after your last click, and at most 2 seconds into a long run of clicks.
- **Plain messages when a module setting cannot be saved or used.** If Tec-Tac cannot record a change, it says the change was not saved and the old setting stays. If your account may not use a module, that module hides the control that changes its settings.

## For module developers

- `context.modulePreferences.set()` and `remove()` wait 400 ms for a later write to the same name, and never more than 2 seconds from the first call. The writes are sent as one request with the last operation. Every call that was merged gets the same result.
- New `flush()`: sends the writes that are waiting now and resolves when they are done. Use it when your page is about to close. A failed write does not make `flush()` reject; its own caller gets the error.
- `get()` and `getAll()` show a write that has not finished yet, so your screen and the stored value agree. A waiting remove reads as absent.
- Core's 503 `audit_failed` rejects with the plain message "Your change was not saved. Tec-Tac could not record it, so the old value stays. Try again in a moment." (status 503, code `audit_failed`). Keep the old value on screen.
- Core's 403 `module_not_allowed` rejects with the plain message "You may not use this module, so its settings are not available to you." (status 403, code `module_not_allowed`) and `hideControl: true`. Hide the control. The helper refuses later calls for that module with the same error and sends no request.
- Other errors (401, 404, 429, 400) pass through unchanged. No contract is removed. `docs/module-preferences.md` has the full rules.

## Known limits

- On the Light and Dark themes, some Tactical colours are harder to read against the card. Info and Warning on the light card, and Negative on the dark card, have low contrast. Each figure also has a text label beside it. If a figure is hard to read for you, use High contrast. This is unchanged from 0.12.107.
- The loading bar shows while a request is in flight, not while a long response body is read.
