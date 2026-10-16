# UI 0.12.113

Date: 16 October 2026. Requires Core 1.17.46 or later (raised from 1.17.43, the Core release this UI was built and tested against). No screen changes, and no module is affected.

## What changes for you

- **The installer now writes the UI's own `env-config.js`.** A standalone Tec-Tac host has no Tactical frontend, so the login page used to say "Tactical API URL is unavailable. /env-config.js did not provide PROD_URL." Now `scripts/install.sh` writes `env-config.js` into the UI root (`/var/lib/tec-tac/ui/tec-tac/`), and, on a standalone host, the login page signs in against the Tactical API you name. On a server that runs Tactical's own frontend, the page keeps loading Tactical's `/env-config.js` (see Fixed after review). The file reads:

  ```js
  window._env_ = {
    PROD_URL: "https://api.example.com"
  };
  ```

- **You give the installer the API address once.** Set `TEC_TAC_API_URL`:

  ```bash
  sudo env TEC_TAC_API_URL="https://api.example.com" bash scripts/install.sh
  ```

  The installer uses the first address it finds: the environment, then `TEC_TAC_API_URL=` in `/opt/tec-tac/etc/tec-tac.conf`, then the address in the `env-config.js` it wrote last time. So a reinstall or an update started from System Updates keeps the address without you doing anything.
- **A bad or missing address stops the install before anything changes.** The address must be a full `http://` or `https://` web address with a host. Spaces, quotes, backslashes, angle brackets, a user name, a query and a fragment are refused. Trailing slashes are removed. System Updates shows "Update refused, nothing was changed" with the reason.
- **The installer checks its own work.** After the new UI is in place, it confirms `env-config.js` is a real file that holds your address and is not the index page. If that check fails, the update fails and Core rolls it back.
- **The nginx security policy reads the file the page loads.** The Content-Security-Policy that `repair-nginx.sh` writes takes the API origin from the `/env-config.js` the browser really fetches. On a Tactical-hosted server that is Tactical's file. On a standalone host it is the UI's file.
- **Tactical's `env-config.js` is a last-resort source, read only.** The installer no longer requires `/var/www/rmm/dist/env-config.js`. When no other address exists, it reads the `PROD_URL` value from that file, checks it like any other address and writes it into the UI's own file. It never copies, changes or deploys Tactical's file.

## Check it worked

```bash
curl -ksS https://portal.example.com/env-config.js
```

You should see the `window._env_` lines with your API address. If you see the index page, the web server is falling back to `index.html` for that path. The installer cannot run this check itself, because it does not know your public host name. Run it once after the install.

## For an existing server

A server that runs Tactical's frontend keeps updating with no change. With no address in the environment, in `tec-tac.conf` or in a file the UI wrote before, the installer reads `PROD_URL` from Tactical's `env-config.js` (Johan's decision on Q72, option b). It checks the value, writes the UI's own `env-config.js` from it and goes ahead. The install output names the source it used. Tactical's file is only read. To pin a different address, add one line to `/opt/tec-tac/etc/tec-tac.conf`, or run the installer by hand with `TEC_TAC_API_URL` set:

```text
TEC_TAC_API_URL=https://<your API host>
```

A host with no address anywhere, or with an invalid `PROD_URL` in Tactical's file, is refused with a plain sentence and nothing changed.

## For whoever runs the web server

A standalone portal host must serve `/env-config.js` from the UI root as a real file. It needs no `try_files` fallback to `index.html`, and it should send `Cache-Control: no-store` so a changed address is not held back by a browser cache. The UI scripts only add the `/tec-tac/` include to Tactical's frontend server block. They do not manage a separate standalone host.

## Checks

`tests/installer-env-config-0.12.113.sh` and `.mjs` cover the address sources and their order, every refusal, the exact file, the staged write, the post-install check and the browser reading. `tests/csp-env-config-source-0.12.113.sh` renders the nginx snippet and covers the policy source, including a UI file and a Tactical file with different addresses. The 0.12.112 refusal test now drives the missing-address refusal. A live nginx and a root install on Linux were not run here, so the `curl` check is yours to run after the install.

## Fixed after review

- **The policy now follows the file the page loads.** The page asks for `/env-config.js` at the site root. In Tactical's frontend server block that is Tactical's file. The UI's own file is served only at `/tec-tac/env-config.js`, which nothing loads. `repair-nginx.sh` used to prefer the UI's file, so a wrong or old address there could give a policy that blocks the real API. In `enforce` mode that blocks every call, sign-in included. The policy now comes from Tactical's file in that layout, and from the UI's file only when there is no Tactical frontend. When the file the page loads has no usable address, no policy is written. If the two files differ, the installer log says so.
- **A standalone install no longer fails after the swap.** `install.sh` ran `repair-nginx.sh` every time, and that script needs Tactical's frontend nginx block. A standalone host has none, so the install ended in exit 1 after the first live change and Core rolled it back. Now the installer adds the nginx include only when it finds a Tactical frontend server block. Otherwise it logs that it skipped it and finishes. This matches the web-server note above: the UI scripts do not manage a standalone host.
- **The README matches the code.** It now says the page and the policy use Tactical's `env-config.js` in the integrated layout, the UI's file is used on a standalone host, and a Tactical-hosted server with no address reads Tactical's `PROD_URL` as a last fallback.
- **Existing servers are no longer refused.** The first update from System Updates on a server installed before this release exited with "Update refused". Now the order is: `TEC_TAC_API_URL` in the environment, `TEC_TAC_API_URL` in `tec-tac.conf`, the file the UI wrote last time, then `PROD_URL` from Tactical's `env-config.js`. Every value is checked the same way, and the UI always writes its own file from the checked value.

## Left out, and why

- **Core keeping `TEC_TAC_API_URL` in `tec-tac.conf`.** Core's installer rewrites that file on every run and drops keys it does not write, and Core's update helper does not pass `TEC_TAC_*` variables on. The UI works without this: it falls back to the file it wrote last time, and a Tactical-hosted server needs no file of its own. A restore onto a clean standalone host is refused with a plain message until the conf carries the address. This is a request to Core (`reviews/requests/core.md`).
- **Note on Tactical's `env-config.js`.** The installer agent's earlier note said not to use Tactical's file as the source of truth. Johan (owner) chose to read its `PROD_URL` as a last fallback so existing servers update with no manual step. The UI still never copies, edits or deploys that file.
- **A note on `tec-tac.conf`.** The shared config file is loaded with `source`, so a value there is run as shell. Only an administrator can write it, and the installer checks the address before it uses it. Changing how that file is loaded is not part of this release.
