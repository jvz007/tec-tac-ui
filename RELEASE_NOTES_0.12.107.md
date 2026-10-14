# UI 0.12.107

Date: 14 October 2026. Requires Core 1.17.37 or later (raised from 1.17.35, the Core release this UI was built and tested against).

## What changes for you

- **Your Tactical colours always show.** Tec-Tac now uses the five colours you set in Tactical, even when they are Tactical's own defaults. Before, Tec-Tac kept its own theme colours at the default, so you did not see Tactical's palette. Your colours now show on the dashboard figures and in the loading bar.
- **High contrast keeps its own colours.** The High contrast theme does not use the Tactical colours. It uses its own high-contrast palette, so the text stays easy to read. Light and Dark show your Tactical colours.
- **A thin loading bar at the top of the window.** While Tec-Tac waits for Tactical or Core, a thin bar sweeps across the top, in your loading bar colour. It appears only when a request takes a moment, so quick actions do not flicker it on. Background checks (session and notices) never show it. With reduced motion turned on in your computer's settings, the bar stays still.
- **Save works when your double-click action is URL Action.** If your saved double-click action is URL Action but your Tactical role cannot run URL Actions, you can now change your date format or a colour and save it. Setting a URL Action is still refused, and Core still decides on the server.
- **Letters Tactical may read as date parts are flagged.** When your date format uses a letter Tec-Tac does not know (for example Q or E), the example line on My Account says that Tec-Tac shows it as written and that Tactical may read it as a date part. Tec-Tac's dates are not changed.
- **Colour names Tec-Tac cannot show use Tactical's default.** A numbered Quasar shade such as deep-purple-3 is not in Tec-Tac's list, so that figure uses Tactical's default colour for the field. The note under the colour says so.
- **The brand colour names are Tactical's own.** info, positive, negative and warning use Tactical's brand colours, not Tec-Tac's theme colours.

## For module developers

- `modulePreferences` now throws a clear error at creation when it is given no api helper ("modulePreferences needs the module's api helper"). Modules that use the loader are not affected.
- The api helpers (`api`, `apiRaw`, `apiBlob`, `apiText`) keep their results, errors and status codes. The loading bar counts their requests; no module needs to do anything.

## Known limits

- On the Light and Dark themes, some Tactical colours are harder to read against the card. Info and Warning on the light card, and Negative on the dark card, have low contrast. Each figure also has a text label beside it. If a figure is hard to read for you, use High contrast.
- The loading bar shows while a request is in flight, not while a long response body is read.
