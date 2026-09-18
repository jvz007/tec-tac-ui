# Tec-Tac UI 0.2.2

## Persistent deployment and nginx integration

Tec-Tac UI no longer deploys beneath Tactical's `/var/www/rmm/dist` directory. Tactical replaces that directory during normal upgrades, which previously meant the Tec-Tac UI had to be rebuilt and reinstalled after every Tactical update.

The default deployment is now:

```text
/var/lib/tec-tac/ui/tec-tac/
```

Nginx serves that persistent directory at `/tec-tac/` through a Tec-Tac-owned snippet:

```text
/etc/nginx/snippets/tec-tac.conf
```

The installer adds one include to Tactical's frontend server block. `scripts/repair-nginx.sh` can safely recreate/repair that small integration after a Tactical update without rebuilding the Vue application.

Extension UI modules are synchronized beneath the same persistent deployment and therefore also survive replacement of Tactical's frontend dist tree.

## Readability

UI text has been increased by approximately 10%, including body text, navigation, tables, form labels, buttons, mono technical values, and compact operational labels. Layout dimensions remain unchanged so the dense Tec-Tac/SHTF operational style is preserved while improving readability on smaller displays.

## Upgrade workflow

After deploying 0.2.2 once, a normal Tactical update should require only:

```bash
sudo bash /opt/tec-tac-ui/scripts/repair-nginx.sh
```

No npm install, Vite rebuild, or UI copy into Tactical's `dist` directory is required simply because Tactical was updated.
