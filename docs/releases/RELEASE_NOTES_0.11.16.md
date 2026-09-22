# Tec-Tac UI 0.11.16

## Automatic stable release visibility

- System Updates hydrates the last-known stable Framework/UI release from Core's persisted cache as soon as status loads.
- The page automatically asks Core to refresh release discovery; Core only contacts GitHub when its 24-hour cache is stale.
- While the page remains open, it rechecks cache age hourly so a 24-hour refresh is not missed.
- The release card shows the last checked timestamp and stale state.
- The manual control is now `Refresh stable release` and explicitly forces a fresh repository lookup.
