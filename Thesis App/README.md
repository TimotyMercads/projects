# AURA — Academic At-Risk & High-Performing Student Dashboard

Flask web app for the "Implementation and Evaluation of a Supervised Machine
Learning Model with Explainable AI for Predicting At-Risk and High-Performing
College Students" thesis project.

## First-time setup

This version requires **MySQL** (via XAMPP) or a **cloud MySQL/Postgres**
database. For local development, follow **`XAMPP_SETUP.md`** — a short,
mostly point-and-click guide. To publish a live version on Vercel with a
cloud database instead, follow **`DEPLOYMENT.md`**. Same codebase either
way — just a different environment variable.

## Multi-teacher accounts

Every signed-up teacher only ever sees and edits the students from
datasets **they** uploaded — not everyone shares one dataset anymore.
Uploading replaces only your own previous data; other teachers' rosters
are untouched. This is enforced at the database query level (see
`data_service.py`), not just hidden in the UI — even a direct URL to
another teacher's student returns "not found," not their data. Each
student now also has an **Edit** page for hand-correcting a record.

## Performance

Two real bottlenecks were fixed this round, both measured before/after,
not just assumed:
- **Bulk predictions** (on upload, and on CSV export) now run in one
  vectorized batch instead of one model call per row — **~266x faster**
  on a 1,000-row test (from ~2 minutes down to well under a second for
  the model-inference part).
- **The SHAP explainer** is now cached per loaded model instead of being
  rebuilt on every single request — the first explanation after a model
  loads takes its normal ~10 seconds, but every one after that is
  **~650x faster** (tens of milliseconds).

## Plain-language explanations

The "Why This Prediction?" page no longer shows raw SHAP numbers or
technical terms — every factor gets a plain name, a naturally-formatted
value (percentages, hours, "times per week"), a short explanation of what
it generally means, and a simple Major/Moderate/Minor rating shown as a
bar instead of a decimal. It's written to be handed directly to a parent
in a conference, not just read by another teacher. `Student_ID` is
excluded from this list entirely — it sometimes carries real predictive
weight in the current model (a data-leakage smell flagged elsewhere in
this README), but "Student ID: W500000 — Major factor" means nothing to
a parent and would only cause confusion.

## Teacher Action Plan (reminders & scheduling)

The Recommendations page's "Teacher Action Plan" is no longer a static
example table — add your own reminders (optionally tied to a student),
set a priority and due date, and track status through **Pending →
Scheduled → Ongoing → Finished**. Items due within 7 days or overdue get
an in-app "Due Soon"/"Overdue" badge, and a small notification banner
appears on the Dashboard summarizing how many need attention. (This is
in-app only — no email/push notifications are configured.)

## Design

The interface was redesigned around AUF's own seal rather than a generic
dashboard template — every color is drawn from the crest itself:

- **Ink Navy / Deep Harbor** — background and panels (the crest's blue field)
- **Torchlight Gold** — primary actions and active states (the crest's laurel/flame)
- **Ember Maroon** — At Risk status and secondary actions (the crest's red glyphs)
- **Harbor Blue** — informational accents (LMS engagement, policy stage badges)
- **Sage** — High Performing status

Numeric readouts (grades, percentages, counts) use IBM Plex Mono instead
of the body font, for an "instrument panel" feel appropriate to a
monitoring dashboard. A soft radial gold glow — echoing the torch at the
center of the seal — appears behind the login card and the dashboard's
welcome banner as a consistent, understated signature element.

The AUF seal itself appears on the Login and Sign Up pages, and in the
top-right corner of every page once logged in (`static/img/auf_logo.png`).

**Charts** were a specific complaint in an earlier pass — Analytics
previously stacked full-width charts with no height limit, requiring a
lot of scrolling. Every chart now sits in a fixed-height container
(`.chart-wrap`) paired with Chart.js's `maintainAspectRatio: false`, and
the Attendance-by-Year-Level / Academic-Component-Breakdown charts were
moved into a 2-column grid instead of stacking — the whole Analytics page
now fits in roughly one screen instead of four separate full-width chart
blocks.

## What's wired up right now

- **Login / Sign Up / Logout** — every page requires a teacher account.
  Sign up with a name, email, and password (hashed, never stored in plain
  text); log in to reach the dashboard; log out clears your session. If
  MySQL isn't running, you'll see a friendly "can't reach the database"
  page instead of a crash, telling you to start it in XAMPP.
- **Dashboard** — live stats (total students, high performing / at risk
  counts) and a performance distribution chart, computed from the active
  dataset in the database.
- **Students** — searchable table of every student. Filters by Student ID
  (substring), Program, Year Level, minimum composite Average, and
  Performance status (High Performing / At Risk) — combinable. Note: the
  dataset has no "Section" column, so Program is used as the closest
  available field, flagged directly on the page. Has a **Download Results**
  button that exports exactly the filtered/enriched rows on screen.
- **Student Insights** — a summary strip (GPA / Attendance / LMS Activity)
  with an **Explanation** button, a live Prediction banner, three "Key
  Factors" bars (GPA / Attendance / LMS Engagement) sized by real SHAP
  contribution when a model is loaded, and a Recommended Actions card with
  a **More** button.
  - **Explanation** → `/students/<id>/explanation`: the top individual
    SHAP-ranked features for that student, with real generated text (no
    placeholders) explaining which direction each one is pushing the
    prediction.
  - **More** → `/students/<id>/recommendations`: the full **AUF Early
    Intervention and Academic Support Policy** for that student (see
    below) with a trackable checklist.
- **Upload Dataset**:
  - Accepts **.csv / .xlsx / .xls only** — anything else is rejected with
    a clear "not applicable — wrong file type" message, without touching
    the database.
  - **Automatic cleaning on every upload** (`utils/cleaning.py`): trims
    whitespace, drops empty/duplicate rows, drops duplicate Student_IDs
    (keeps first), coerces bad numeric entries to missing, clips
    out-of-range values (e.g. attendance > 100%) to sane bounds,
    normalizes text casing, and imputes remaining missing values (median
    for numeric, most-frequent for categorical) — every change is counted
    and shown in a **Cleaning Report**, so nothing is altered invisibly.
  - **Uploaded Files** table: every file ever uploaded, who uploaded it,
    how many records, file type, and whether it's the currently **Active**
    dataset or was **Replaced** by a later upload.
  - **Downloads**: the cleaned dataset as-is, or an enriched version with
    computed `Overall_Average`, `LMS_Activity_Level`, and
    `Predicted_Performance` / `Prediction_Confidence` per student.
- **Analytics** — real charts (Chart.js): performance distribution,
  attendance by year level, academic component breakdown, and (once a
  model is loaded) top predictive features.
- **Recommendations** — risk buckets (At Risk / Monitor / Low Risk), a
  policy-based summary of all 3 intervention stages, and a table of
  students needing attention.

## Interventions are based on AUF's actual approved policy

The Recommended Actions / Explanation / Recommendations pages no longer
show generic placeholder suggestions — they're built from AUF's approved
**"Early Intervention and Academic Support for Students at Risk"** policy
(Office of the VP for Academic Affairs, implemented January 25, 2024),
encoded in `utils/intervention_policy.py`:

- **Stage 1** — student fails/misses the first two quizzes or requirements
  during the midterm period (Identify → Notify → Respond → Engage → Refer).
- **Stage 2** — student obtains a Midterm grade other than "Passed"
  (Performance Debrief → Parent Engagement → Parent-Teacher Meeting →
  Continuous Monitoring).
- **Stage 3** — student obtains a Final grade other than "Passed"
  (retention policy / alternative career options discussion).

Each stage shows its real checklist from the policy's Appendix C, and a
teacher can **check items off per student** — this is saved to the
database (`intervention_log` table) and persists across dataset
re-uploads (as long as the same Student_ID reappears), with who completed
it and when.

**Which stage a student is shown is a heuristic**, not a literal
implementation of the policy's real triggers — the synthetic dataset has
composite averages (Midterm_GPA, Final_Exam) rather than actual quiz/
requirement failure counts, so `determine_stage()` maps the closest
available signals to each stage. This is disclosed in the code and in the
UI, not presented as exact policy automation. High Performing students see
a separate, clearly-labeled set of general enrichment suggestions — the
real policy doesn't cover them, since it's specifically an at-risk policy.

## Project structure

```
flaskapp/
├── app.py                       Routes, auth, multi-tenant scoping, DB-error handling
├── schema.sql                   MySQL schema (import via phpMyAdmin)
├── schema_postgres.sql          Postgres equivalent (for cloud deployment)
├── vercel.json                  Vercel deployment config
├── XAMPP_SETUP.md               Step-by-step local XAMPP/MySQL setup guide
├── DEPLOYMENT.md                Cloud database + Vercel deployment guide
├── .env.example                 DB config template (copy to .env if needed)
├── requirements.txt
├── services/
│   ├── auth_service.py          Signup/login logic (password hashing)
│   ├── data_service.py          Dataset loading/saving - DB-backed, per-teacher scoped
│   ├── model_service.py         Lazy-loads .pkl files, batch predicts, caches SHAP explainer
│   ├── intervention_service.py  Tracks the policy checklist per student
│   └── action_plan_service.py   Teacher Action Plan reminders/scheduling
├── utils/
│   ├── db.py                    SQLAlchemy engine - works with MySQL or Postgres
│   ├── cleaning.py              Upload cleaning pipeline
│   ├── intervention_policy.py   The AUF policy content itself
│   └── plain_language.py        Parent-friendly explanation content
├── templates/                   Jinja templates (base.html + one per page)
├── static/
│   ├── css/style.css            AUF-branded design
│   └── img/auf_logo.png         AUF seal
└── models/                      Drop your trained .pkl files here
```

## Running it

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Make sure **MySQL is running in XAMPP first** (see `XAMPP_SETUP.md`).
Then open **http://127.0.0.1:5000** — it'll send you to the login page.
Sign up for your first account, then log in.

## Getting real data & predictions flowing

1. Log in, then go to **Upload Dataset** and upload a CSV/XLSX matching
   the schema (see the column list in `utils/cleaning.py` /
   `schema.sql`). Dashboard, Students, Analytics, and Recommendations
   switch from demo numbers to real ones immediately.
2. Copy `Best_Model.pkl`, `Scaler.pkl`, `TargetEncoder.pkl`, and
   `Categorical_Encoders.pkl` into the `models/` folder. Restart the app,
   or `POST /reload-model`, and **Student Insights** starts showing live
   AI predictions with a confidence breakdown; **Analytics** shows a "Top
   Predictors" chart.
3. If the winning model was a "KMeans + Random Forest/XGBoost" hybrid,
   also drop in `KMeans.pkl` — detected automatically by feature count.

Nothing crashes if any of this is missing — every page shows a status
banner and safe fallback content until it's added.

## What's not done yet (flagged for later)

- Role-based permissions — every signed-up account currently has equal
  access; there's no admin/teacher distinction, and no way for one
  teacher to intentionally share a student with another (by design, per
  this round's changes, they're fully isolated instead).
- "Forgot password" — not implemented; a teacher would need a new account
  or a manual database fix today.
- The "Add Student" button on the Students page is still static — there's
  now a per-student **Edit** page, but no way to add a brand-new student
  by hand outside of a CSV/XLSX upload.
- Email/push notifications for the Teacher Action Plan — the "Notification
  basing on status" request was interpreted as in-app badges + a dashboard
  banner, not actual emails or push notifications, since no email service
  is configured. Worth a follow-up if real notifications (not just in-app)
  are wanted.
- Vercel deployment is documented and the code is compatible (see
  `DEPLOYMENT.md`), but hasn't been deployed to a live Vercel project as
  part of this work — only tested against local MySQL and local Postgres
  servers standing in for their cloud equivalents.
