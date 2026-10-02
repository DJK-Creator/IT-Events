# IT Events Radar
Static site (index.html) + events.json refreshed every 6 hours by GitHub Actions.
- Add your own events: edit manual-events.json. Fields: n (name), d (YYYY-MM-DD), t (time), s (suburb), v (venue), c (category), p (price, 0 = free), m (summary), u (register link).
- Settings: repo Settings > Secrets and variables > Actions. Secret APIFY_TOKEN, variable LOCATION (e.g. Sydney).
