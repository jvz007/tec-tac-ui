# Changing the trust level

Tec-Tac uses a root-owned trust policy to decide which signed or unsigned software packages may be accepted for System Updates and Module Management.

## Trust levels

### Signed Production

`signed_production` accepts packages signed by a trusted production publisher key. Development-signed and unsigned packages are rejected. Publisher environment isolation still applies.

### Signed Development

`signed_development` accepts trusted development-signed packages and stronger trusted production-signed packages. Publisher environment isolation still applies, so a development publisher is accepted only when the server environment allows development signing.

### Unsigned

`unsigned` is the lowest trust floor. It permits unsigned packages unless another component or module-specific rule requires a stronger level. Use it only when there is a deliberate operational reason.

`secure_signed`, where available, is stricter than Signed Production and requires a trusted production key marked secure/high-assurance in the local publisher policy.

## Why lowering is console-only

The Tec-Tac web service runs as the Tactical service account. That account must never be able to disable or weaken the signing policy protecting the code it can request to install.

For that reason, the web UI may raise the trust level but cannot lower it. Lowering requires normal root-console `sudo` authentication.

## Raising the trust level

Open **System Updates → Trust policy**, choose the stronger level and save it. Raising takes effect immediately for new package inspections and install requests.

## Lowering the trust level temporarily

Run the root console command shown by the UI, or use this form:

```bash
sudo tec-tac-trust-policy set <level> --reason "<why>" --hours <N>
```

`--hours` defaults to **8** and may be set up to **168** hours. The command displays the current level, requested level, reason and expiry, then requires the typed confirmation shown on screen before it writes the policy.

For example:

```bash
sudo tec-tac-trust-policy set signed_development --reason "Testing development-signed packages" --hours 8
```

## Check the current level

Use:

```bash
sudo tec-tac-trust-policy get
```

This shows the current root-owned trust level and any pending automatic switch-back.

## Automatic switch-back

A temporary reduction stores its pending revert state under the root-owned Tec-Tac policy area. A root systemd service/timer checks that state at boot and periodically while the server is running. Once `expires_at` has passed, it restores the previous level.

The switch-back is fail-safe: if an administrator has already raised the trust level above the previous level, the timer will not weaken it. The mechanism survives server reboots.

## Audit records

Console trust-policy changes and automatic switch-backs are recorded in:

```text
/var/log/tec-tac/trust-policy-audit.jsonl
```

When the UI requests a lower level, Core records the request in the normal Core audit log as `console_change_requested`. The web request itself does not change the root-owned policy.
