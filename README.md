# UnderGlow landing

Served by `server.mjs` (Render web service, free plan). Locked until launch.

- Password: set `LANDING_PASSWORD` in the Render dashboard (any username). Unset = 401 for everyone.
- Launch: set `LANDING_PUBLIC=1` (removes the gate and noindex). Then consider a paid plan (free plan sleeps after 15 min idle; first visit takes ~30 s).
- `locked/` is the placeholder published by the old static site `underglow-landing` so its onrender.com URL stays closed.
