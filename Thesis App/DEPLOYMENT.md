# Deploying AURA to the Cloud (Vercel + a cloud database)

This app now works with **either** a local XAMPP MySQL (see `XAMPP_SETUP.md`)
**or** a cloud-hosted MySQL/Postgres database — the same codebase, switched
by one environment variable. This guide covers the cloud path, for
publishing a live version on Vercel.

---

## 1. Pick a cloud database

Any of these work. Postgres options are usually the easiest to get a free
tier on:

| Provider | Type | Notes |
|---|---|---|
| [Neon](https://neon.tech) | Postgres | Generous free tier, very easy setup |
| [Supabase](https://supabase.com) | Postgres | Free tier, includes a nice SQL editor |
| [Railway](https://railway.app) | MySQL or Postgres | Simple, usage-based free credits |
| [PlanetScale](https://planetscale.com) | MySQL | MySQL-compatible, generous free tier |

Whichever you pick, you'll end up with a **connection string** that looks
like one of these:

```
postgresql://user:password@host:5432/dbname
mysql://user:password@host:3306/dbname
```

Copy it somewhere — you'll need it in Step 3.

## 2. Create the tables

Open your database provider's SQL editor (Neon, Supabase, and Railway all
have one built into their dashboard), and run the contents of:

- **`schema_postgres.sql`** if you picked a Postgres provider (Neon, Supabase, Railway Postgres)
- **`schema.sql`** if you picked a MySQL provider (PlanetScale, Railway MySQL)

Copy the whole file's contents, paste into the SQL editor, and run it. You
should see the same 5 tables as the local setup: `users`, `uploads`,
`students`, `intervention_log`, `action_plans`.

## 3. Push the code to GitHub

Vercel deploys from a GitHub (or GitLab/Bitbucket) repository. If this
project isn't already in one:

```bash
cd flaskapp
git init
git add .
git commit -m "AURA initial commit"
```

Then create a new repository on GitHub and push it there (GitHub's own
"create a new repository" page gives you the exact commands for this).

## 4. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub login works directly).
2. Click **Add New → Project**, and import the GitHub repository you just pushed.
3. Vercel auto-detects this as a Python/Flask project from `requirements.txt`
   and the `app` variable in `app.py` — no build configuration needed.
4. Before deploying, open **Environment Variables** and add:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the connection string from Step 1 |
   | `SECRET_KEY` | any long random string (used to sign login sessions) |

5. Click **Deploy**. After a minute or two, Vercel gives you a live URL
   (e.g. `https://your-project.vercel.app`).
6. Open it, sign up for your first account, and you're running in the cloud.

## 5. Adding your trained model files

The `/models` folder (`Best_Model.pkl`, `Scaler.pkl`, etc.) needs to be
**committed to the GitHub repository** so Vercel deploys it along with the
code — unlike a local setup, there's no separate step to "drop files into
a folder" on a live server. Just make sure those files aren't excluded by
`.gitignore` before you push (check the file — model `.pkl` files were
intentionally excluded for the local-only workflow, so remove that line if
you want them included in the deployed version).

---

## Things worth knowing before you rely on this in production

**Function size.** Vercel's Python functions currently support up to
500MB uncompressed (and up to 5GB with "Large Functions" on newer
accounts using Fluid Compute). This app's dependencies — pandas, scikit-learn,
xgboost, shap — total a little over 300MB by themselves, so it should fit
the standard limit, but if a deploy ever fails specifically citing bundle
size, that's the thing to look into first (Vercel's dashboard will say so
directly in the failed build log).

**Cold starts and the explanation cache.** One of the optimizations in
this update caches the SHAP explainer in memory after its first use per
server instance, so repeat explanations are fast. On Vercel, Fluid
Compute keeps a warm instance handling multiple requests, so this cache
mostly holds — but a fully cold start (e.g. after a period with no
traffic) will pay that first-load cost again. This isn't a bug, just a
tradeoff of serverless hosting.

**If you'd rather avoid all of the above:** a traditional always-on host
like [Render](https://render.com) or [Railway](https://railway.app) (both
support plain Flask apps directly, not just serverless functions) sidesteps
function-size limits and cold starts entirely, at the cost of not being
Vercel specifically. Either is a perfectly reasonable choice for this app —
Vercel was requested specifically, so that's what this guide focuses on.

## Switching back to local XAMPP later

Just unset `DATABASE_URL` (or don't set it at all) and the app falls back
to the local `DB_HOST`/`DB_USER`/etc. defaults matching a fresh XAMPP
install — see `.env.example`. The same codebase runs both ways; nothing
needs to be changed in the code itself, only which environment variables
are set.
