# Data Delivery Portal (Streamax)

The web front end for the client data-delivery system. Clients sign in to see their folders, check
their contract figures, and download files. MC admins manage clients, folder access, contract
figures, uploads, and read the download log.

It talks to the **mspulse-backend** API (the `/dpr-*` endpoints). The portal holds no data and no
secrets: every permission check happens on the server.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173, proxies /api to http://127.0.0.1:8000
```

You need the backend running on port 8000. To try the portal with no credentials, run the backend's
demo server (`python -m tests.demo_server` in `mspulse-backend`) and sign in as
`admin@mc.com` / `demo` or `alice@streamax.com` / `demo`.

## Deploy to GitHub Pages

1. Settings > Pages > Source: **GitHub Actions** (once).
2. Settings > Secrets and variables > Actions > **Variables**: add `VITE_API_BASE`, the backend's address,
   e.g. `https://api.example.com/api/v1`. It is not a secret (it is visible in the site's JavaScript).
3. Push to `main` (or run the workflow by hand). The site appears at `https://<owner>.github.io/<repo>/`.

**The site only works once the backend is reachable from the browser:**
- the API must be served over **HTTPS** (browsers refuse to let an https page call plain http);
- the backend's `CORS_ALLOWED_ORIGINS` must include the site's origin, e.g. `https://<owner>.github.io`
  (the origin has no path: not `.../<repo>`);
- the bucket's CORS rule must allow the origin too, for uploads (see the backend's `docs/dpr-uploads.md`).

Addresses look like `/#/admin/upload`. That is deliberate: GitHub Pages cannot serve deep links, and a hash
route works on any static host.

### Things to know about GitHub Pages
- A Pages site is **public on the internet**, even if the repository is private (private-repo Pages needs a
  paid plan, and the site itself stays public unless you are on Enterprise Cloud). That is acceptable here:
  the site is just the login page and the app shell, and all data sits behind the API's login. It is marked
  `noindex` so search engines are asked to skip it.
- Don't put anything secret in the repository or in a build variable: the built JavaScript is public.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_BASE` | build time | backend address (see `.env.example`) |
| `BASE_PATH` | build time, set by the workflow | `/<repo>/` on a project Pages site |
| `API_PROXY_TARGET` | dev only | where `npm run dev` proxies `/api` (default `http://127.0.0.1:8000`) |

## Layout

- `src/main.jsx` routes and sign-in state; `src/api.js` the API client
- `src/pages/` `Login`, `Catalog` (client), `Admin` (clients, contracts, buckets, download log), `Upload`
- `src/upload.js` the resumable browser-to-Cloud-Storage uploader
