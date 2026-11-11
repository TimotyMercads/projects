# TLC Barbershop: Face-Shape Haircut Advisor

A free web app that looks at your face through your phone camera, works out your **face shape** (oval, round, square, rectangle, heart or diamond), and suggests **haircuts that suit it**. You can also tap a haircut to see it on your own face.

Built for **TLC Barbershop**, 531 Jose Abad Santos St., Salapungan, Angeles City, Pampanga 2009, as the final project of group 3 in PTF50 at Angeles University Foundation.

> It gives an **estimate** to help start the conversation with a barber. It is not a professional assessment.

## What it does

- **Home:** shop information (address, phone, directions, Facebook) and an invitation to try the advisor.
- **Scan:** a privacy notice first, then "Allow camera". The app guides you to face the camera straight on, measures your face, and shows the result with the measured lines on your face picture. You can also upload a photo instead.
- **Results:** your estimated face shape, a confidence level, the measurements behind it, four haircut suggestions (each with an example photo), styles to use with care, and suggested TLC services. You can share the result as text.
- **Try it on:** tap a haircut card to see your own face fitted onto the example photo.
- **Styles:** browse the haircuts for any face shape without scanning.
- **Services:** the services TLC may offer.
- **How it works:** a plain-language explanation of the five measurements, the limits, and the privacy rules.
- **Feedback:** a link to a Google Form.

## Privacy (Data Privacy Act of 2012, RA 10173)

- The camera image is processed **inside your browser**. It is never uploaded, stored or logged. There is no server, no database and no account.
- The app asks for camera permission only after a plain-language notice and an explicit "Allow camera" tap. "Stop camera" is always available.
- The face picture on the results page, and the "try it on" picture, exist only in memory. They are erased when you leave the results page or close the window.
- The app collects no personal data. The only thing leaving the page is the optional link to the feedback form.
- No generative AI and no API keys are used.

## How the face shape is decided

The app uses **MediaPipe Face Landmarker** (Google, runs in the browser). It finds 478 points on the face. From a handful of them, the app measures:

1. face length against cheekbone width,
2. jaw width against cheekbone width,
3. forehead width against cheekbone width,
4. forehead against jaw width,
5. the angle of the chin.

It averages about 12 good frames, then compares the numbers with set thresholds to pick one of six shapes. Photos taken at a tilt or from the side are rejected with a "look straight ahead" message.

All thresholds live in one commented place, `FACE_SHAPE_CONFIG` at the top of `js/faceShape.js`.

**Honest limits:** the thresholds are rules of thumb, not a trained model, and have not been validated on a large set of faces. Poor light, glasses, hair over the forehead, a beard, a tilted head, and the camera angle can change the result. The app shows a confidence level for this reason.

## Run it on your computer

The app uses ES modules, so it must be served by a web server. Opening `index.html` by double-click will not work.

**With VS Code:** install the *Live Server* extension, right-click `index.html`, choose **Open with Live Server**. The camera works on `localhost`.

**Or with Python:** in this folder run `python -m http.server 8000`, then open `http://localhost:8000`.

To test on a phone, the page must be served over **HTTPS** (browsers block the camera otherwise). The easiest way is to open the deployed Vercel link.

### The MediaPipe files

The MediaPipe library, its WebAssembly files and the face model are **bundled in this repo** (`vendor/` and `models/`), so the app has no third-party dependency while running. If you ever need to download them again, run `download-mediapipe.ps1` (Windows PowerShell) or `download-mediapipe.sh`. Version used: `@mediapipe/tasks-vision` 0.10.21.

## Deploy on Vercel

This repository holds several projects, so tell Vercel which folder to use.

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New... > Project** and import the `projects` repository.
3. Set **Root Directory** to `TLC-Haircut-Advisor`.
4. Set **Framework Preset** to **Other**. Leave **Build Command** and **Output Directory** empty.
5. Click **Deploy**. When it finishes you get an `https://...vercel.app` link that works on phones.

Every later `git push` to `main` redeploys automatically. `vercel.json` only adds a few safe headers.

## Files

| File | What it does |
|---|---|
| `index.html` | All the screens (Home, Scan, Results, Styles, Services, How it works, Feedback) and the "try it on" window. |
| `css/styles.css` | All the styling: colours, phone-first layout, bottom tab bar and top menu. |
| `js/app.js` | The app logic: screens and navigation, camera, capture, results, "try it on", sharing, error messages. |
| `js/faceShape.js` | The face-shape logic: landmark numbers, the thresholds, quality checks, measuring and classifying. |
| `js/data.js` | The content you can edit: shop details, services, face shapes, hairstyles and their photos. |
| `assets/` | The TLC logo, icon, shop photo, and `examples/` (sample haircut photos plus `faces.json`). |
| `models/`, `vendor/` | The bundled MediaPipe face model and library. |
| `vercel.json` | Deployment headers. |

**Editing content:** shop details, services and hairstyle text are in `js/data.js`. Change the text between the quotes, keep the commas and brackets, save and refresh. The shop's address, phone and Facebook link are written once there and used everywhere.

## Still to confirm with TLC Barbershop

The app does **not** invent any shop facts. These are marked "TO CONFIRM WITH TLC BARBERSHOP" in `js/data.js` and need the owner's answers:

- Opening hours
- The services offered and their names
- Prices
- Permission to use the TLC logo and the shop photo
- Real haircut photos of TLC's own work (with the models' permission) to replace the sample photos

Also replace the placeholder Google Form link on the Feedback page (`index.html`, search for `REPLACE_WITH_YOUR_GOOGLE_FORM_LINK`).

## About the sample haircut photos

The example haircut photos in `assets/examples/` come from a student sample set of public photos sorted by face shape. The faces are covered with a flat patch so only the hair, ears and clothes show. They are used **only for this school project and its presentation**, are not owned by the team, and are not licensed for other use. Before a real launch, replace them with TLC's own photos (put the new `.jpg` files in the matching folder and update the list in `js/data.js`). If a photo is missing, the app shows a drawn icon instead.

## Credits

- **Group 3, PTF50:** Aquino, Alvin Gino · Cunanan, Lovely Irene · Mercado, Timothy Sean · Pasion, Val Andrei
- **Instructor:** Dr. James A. Esquivel
- **Angeles University Foundation**
- Face landmark detection: [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) by Google (Apache 2.0 licence)
