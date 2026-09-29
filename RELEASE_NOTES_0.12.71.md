# Tec-Tac UI 0.12.71

## Network Probe runtime-context support

- Preserves Core-provided `locale`, `timeZone`, and `dateTimeFormat` in the authenticated module runtime context.
- Scheduler defaults now prefer Core's authoritative `timeZone`, with browser-resolved time zone retained only as an older-Core fallback.
- Documents the stable localization fields for feature modules.
- Adds a targeted runtime-context regression.

Requires Core 1.15.179. This delivery is unsigned.
