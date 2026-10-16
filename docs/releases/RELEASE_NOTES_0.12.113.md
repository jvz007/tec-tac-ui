# UI 0.12.113

Date: 16 October 2026. Requires Core 1.17.46 or later (raised from 1.17.43, the Core release this UI was built and tested against). No screen changes, and no module is affected.

## What changes for you

- **The installer now writes the UI's own `env-config.js`.** A standalone Tec-Tac host has no Tactical frontend, so the login page used to say "Tactical API URL is unavailable. /env-config.js did not provide PROD_URL." Now `scripts/install.sh` writes `env-config.js` into the UI root (`/var/lib/tec-tac/ui/tec-tac/`), and the login page signs in against the Tactical API you name. The file reads:

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
- **The nginx security policy reads the same file.** The Content-Security-Policy that `repair-nginx.sh` writes now takes the API origin from the UI's `env-config.js` first, then from Tactical's. On a standalone host the policy no longer goes missing.
- **The old Tactical file check is gone.** The installer no longer needs `/var/www/rmm/dist/env-config.js`, and it never uses that file as the address.

## Check it worked

```bash
curl -ksS https://portal.example.com/env-config.js
```

You should see the `window._env_` lines with your API address. If you see the index page, the web server is falling back to `index.html` for that path. The installer cannot run this check itself, because it does not know your public host name. Run it once after the install.

## For an existing server

A server installed before 0.12.113 has no address on record. The first update from System Updates will say "Update refused, nothing was changed". Add one line to `/opt/tec-tac/etc/tec-tac.conf`, then update again:

```text
TEC_TAC_API_URL=https://<your API host>
```

Or run the installer by hand once with `TEC_TAC_API_URL` set. After that, every update keeps the address.

## For whoever runs the web server

A standalone portal host must serve `/env-config.js` from the UI root as a real file. It needs no `try_files` fallback to `index.html`, and it should send `Cache-Control: no-store` so a changed address is not held back by a browser cache. The UI scripts only add the `/tec-tac/` include to Tactical's frontend server block. They do not manage a separate standalone host.

## Checks

`tests/installer-env-config-0.12.113.sh` and `.mjs` cover the address sources and their order, every refusal, the exact file, the staged write, the post-install check and the browser reading. `tests/csp-env-config-source-0.12.113.sh` covers the policy source. The 0.12.112 refusal test now drives the missing-address refusal. A live nginx and a root install on Linux were not run here, so the `curl` check is yours to run after the install.

## Left out, and why

- **Core keeping `TEC_TAC_API_URL` in `tec-tac.conf`.** Core's installer rewrites that file on every run and drops keys it does not write, and Core's update helper does not pass `TEC_TAC_*` variables on. The UI works without this, because it falls back to the file it wrote last time. A restore onto a clean host is refused with a plain message until the conf carries the address. This is a request to Core (`reviews/requests/core.md`).
- **Copying Tactical's `env-config.js` as a first address.** It is not the source of truth for a standalone host, so an older server is asked once instead. Johan's decision is open (Q72).
- **A note on `tec-tac.conf`.** The shared config file is loaded with `source`, so a value there is run as shell. Only an administrator can write it, and the installer checks the address before it uses it. Changing how that file is loaded is not part of this release.
