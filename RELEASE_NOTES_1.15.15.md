# Tec-Tac Framework 1.15.15

## User preference compatibility

- Extends the Core user-preference schema with `appearance.font_scale` so Tec-Tac UI 0.11.6 font-size controls persist server-side instead of being stripped during normalization.
- Supported scales are `0.9`, `1.0`, `1.1`, and `1.2`; the default remains `1.0`.
- Existing user preference records without `font_scale` automatically normalize to the default without a database migration.
- Invalid or boolean font-scale values fail validation rather than being silently persisted.
