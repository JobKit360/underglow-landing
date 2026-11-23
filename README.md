# UnderGlow landing

Served by `server.mjs` (Render web service, free plan). Locked until launch.

- Password: set `LANDING_PASSWORD` in the Render dashboard (any username). Unset = 401 for everyone.
- Launch: set `LANDING_PUBLIC=1` (removes the gate and noindex). Then consider a paid plan (free plan sleeps after 15 min idle; first visit takes ~30 s).
- `locked/` is the placeholder published by the old static site `underglow-landing` so its onrender.com URL stays closed.

Pages: `index.html` (home), `terms.html`, `privacy.html`, `credits.html` (third-party credits), `account.html` (sign in/up). `site.js` = scroll animations (respects reduced motion, no tracking). The server also serves `/terms` etc. without `.html`.
Legal pages are plain-language drafts: have a lawyer review them and add real contact details before launch.
Preview inside UnderGlow: use the built-in Preview site (serves the `website/` folder of the agent's own folder; a branch worktree is not served, see docs notes).

## The app preview on the landing page

The animated screens on the page are the real UnderGlow app, not drawings of it. `website/app/` holds a copy of the app's own files
(stylesheets, scripts, markup) running on made-up sample data: a pretend "Storefront" project, three bots and a few agents. Nothing in it is
a real account, project, computer or port.

- Rebuild it from the app's files: `node website/tools/build-demo-app.mjs`. It copies `public/`, adds the pinned-column grid
  (`website/tools/pin-grid.patch`, from branch `pin-grid`; drop it once that is in the app), and installs the fake server
  (`website/tools/demo-src/demo-mock.js`), the scene scripts (`demo-scenes.js`) and a stand-in Workbox screen (`rfb.js`).
- Re-record the sample code map and workflow with the real scanners: make a project with `node website/tools/make-sample-project.mjs <empty folder>`,
  run a throwaway UnderGlow on it (empty data folder, spare port), then `node website/tools/record-demo-data.mjs <url> <page id>`.
- `website/demo.js` shows the scenes in frames (`app/index.html?scene=page|bot|workflow|map|workbox|roadmap|phone`). Each one loads only while on screen.
- Test copy: `PORT=7870 LANDING_PUBLIC=1 NO_CACHE=1 node website/server.mjs` (NO_CACHE stops the browser keeping old files while you work).
