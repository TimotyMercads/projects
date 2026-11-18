/* =============================================================
   app.js  |  The app's flow: screens, camera, upload, MediaPipe,
              results, sharing, and friendly error messages
   -------------------------------------------------------------
   READ THIS FILE TOP TO BOTTOM:
     1. Imports and settings
     2. Grabbing page elements
     3. Screen navigation
     4. Loading the MediaPipe AI model
     5. Camera: start, live loop, stop
     6. Capture: average ~12 good frames
     7. Upload a photo instead
     8. Results screen
     9. Save / share result
    10. Error messages
    11. Wiring buttons to functions (runs on page load)

   PRIVACY: camera frames and photos are only passed to MediaPipe
   inside this browser tab. Nothing is uploaded, stored, or logged.
   ============================================================= */

/* ---------- 1. IMPORTS AND SETTINGS ---------- */
import {
  checkFrame, measureFace, averageMeasurements, classifyFaceShape,
  LANDMARKS, FACE_SHAPE_CONFIG,
} from "./faceShape.js";
import { FACE_SHAPES, SERVICES, SHOP, hairstyleIcon } from "./data.js";

// File locations, built relative to THIS file so they work both on
// Live Server and on GitHub Pages (which adds /repo-name/ to the URL).
const MEDIAPIPE_BUNDLE = new URL("../vendor/mediapipe/vision_bundle.mjs", import.meta.url).href;
const MEDIAPIPE_WASM = new URL("../vendor/mediapipe/wasm", import.meta.url).href;
const MODEL_FILE = new URL("../models/face_landmarker.task", import.meta.url).href;

// The lines we draw on the face: each pair is two landmark indices (see faceShape.js)
const MEASURE_LINES = [
  [LANDMARKS.FOREHEAD_TOP, LANDMARKS.CHIN],            // face length
  [LANDMARKS.FOREHEAD_LEFT, LANDMARKS.FOREHEAD_RIGHT], // forehead width
  [LANDMARKS.CHEEK_LEFT, LANDMARKS.CHEEK_RIGHT],       // cheekbone width
  [LANDMARKS.JAW_LEFT, LANDMARKS.JAW_RIGHT],           // jaw width
  [LANDMARKS.JAW_LEFT, LANDMARKS.CHIN],                // chin angle (left side)
  [LANDMARKS.JAW_RIGHT, LANDMARKS.CHIN],               // chin angle (right side)
];

// Add ?debug=1 to the address to see live measurements (for tuning)
const DEBUG = new URLSearchParams(location.search).has("debug");

// App state (the few things the app needs to remember)
let faceLandmarker = null;   // the loaded MediaPipe model
let runningMode = null;      // "VIDEO" (camera) or "IMAGE" (photo)
let stream = null;           // the camera stream, so we can stop it
let loopId = null;           // id of the animation loop, so we can stop it
let lastVideoTime = -1;      // skip frames we've already analyzed
let lastTimestamp = 0;       // MediaPipe needs increasing timestamps
let lastGuidanceCode = "";   // only update guidance text when it changes
let capture = null;          // while capturing: { frames: [], startedAt }
let lastResultText = "";     // the text summary for Save/Share

/* ---------- 2. PAGE ELEMENTS ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  video: $("video"),
  overlay: $("overlay"),
  guidance: $("guidance"),
  permission: $("camera-permission"),
  live: $("camera-live"),
  btnAllow: $("btn-allow-camera"),
  btnCapture: $("btn-capture"),
  btnStop: $("btn-stop-camera"),
  progress: $("capture-progress"),
  progressBar: $("capture-progress-bar"),
  fileInput: $("file-input"),
  loading: $("loading"),
  loadingText: $("loading-text"),
  errorBox: $("error-box"),
  errorTitle: $("error-title"),
  errorMessage: $("error-message"),
  errorAction: $("error-action"),
  errorClose: $("error-close"),
  shareStatus: $("share-status"),
  photoWrap: $("result-photo-wrap"),
  photoCanvas: $("result-photo"),
};
const ctx = el.overlay.getContext("2d");

// Debug panel (only created when ?debug=1)
let debugPanel = null;
if (DEBUG) {
  debugPanel = document.createElement("pre");
  debugPanel.className = "notice notice--dark";
  debugPanel.style.cssText = "font-size:12px;white-space:pre-wrap;margin-top:8px";
  el.guidance.after(debugPanel);
}

/* ---------- 3. SCREEN NAVIGATION ----------
   Every screen is a <section id="screen-NAME">. We show one and hide the rest.
   The address bar shows which one (index.html#styles), and we add a history
   entry each time, so the phone's Back button moves between screens instead
   of leaving the app. */
const SCREENS = ["home", "camera", "results", "styles", "services", "how", "feedback"];
let hasResult = false; // the Results screen only makes sense right after a scan

// Which screen does the address bar ask for? (default: home)
function screenFromHash() {
  const name = location.hash.replace("#", "");
  return SCREENS.includes(name) && name !== "results" ? name : "home";
}

function showScreen(name, { fromHistory = false, initial = false } = {}) {
  const requested = name;
  if (!SCREENS.includes(name)) name = "home";
  if (name === "results" && !hasResult) name = "home";

  // Leaving the camera screen always turns the camera off
  if (name !== "camera") stopCamera();

  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;

  // Privacy: the face picture is removed the moment the user leaves the results screen
  if (name !== "results") clearResultPhoto();

  // The home screen must fit the window with no scrolling.
  // This class (see styles.css) locks the page to the window height.
  document.body.classList.toggle("is-home", name === "home");

  // Highlight the current page in the top bar and the bottom tab bar.
  // (The Results screen belongs to "Scan".)
  const navName = name === "results" ? "camera" : name;
  document.querySelectorAll(".site-nav [data-goto], .tabbar [data-goto]").forEach((btn) => {
    if (btn.dataset.goto === navName) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  // Keep the address bar and the Back button in step with the screen
  try {
    const current = location.hash.replace("#", "") || "home";
    if (!fromHistory) {
      if (current === name) history.replaceState({ screen: name }, "", `#${name}`);
      else history.pushState({ screen: name }, "", `#${name}`);
    } else if (requested !== name) {
      history.replaceState({ screen: name }, "", `#${name}`); // fix an address we couldn't honour
    }
  } catch (err) {
    /* history isn't available (for example a locked-down browser): the app still works */
  }

  window.scrollTo(0, 0);
  // Move keyboard/screen-reader focus to the new screen's heading
  // (not on first load, so keyboard users can still reach the "Skip to content" link)
  if (!initial) {
    const heading = $(`screen-${name}`).querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }
}

/* ---------- 4. LOADING THE MEDIAPIPE MODEL ----------
   Loaded only when first needed, so the home page opens fast.
   API names below are from the official MediaPipe Face Landmarker
   web guide (VERIFY there if you upgrade the library version):
     FilesetResolver.forVisionTasks(wasmFolder)
     FaceLandmarker.createFromOptions(fileset, options)
   ------------------------------------------------------------- */
async function loadModel() {
  if (faceLandmarker) return faceLandmarker;

  if (typeof WebAssembly !== "object") throw new AppError("UNSUPPORTED");

  showLoading("Loading the face AI…");
  // On a slow connection, reassure the user after 8 seconds
  const slowTimer = setTimeout(() => {
    el.loadingText.textContent = "Still loading… a slow connection can take up to a minute.";
  }, 8000);

  try {
    // Import the library only now (if it fails we can show a friendly error)
    const { FilesetResolver, FaceLandmarker } = await import(MEDIAPIPE_BUNDLE);
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);

    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_FILE, delegate },
      runningMode: "VIDEO",
      numFaces: 2, // detect up to 2 so we can say "only one person, please"
    });

    // Try the phone's graphics chip (GPU) first: faster.
    // If that fails (some phones/browsers), fall back to the CPU.
    try {
      faceLandmarker = await FaceLandmarker.createFromOptions(fileset, options("GPU"));
    } catch (gpuError) {
      console.warn("GPU not available, using CPU instead.", gpuError);
      faceLandmarker = await FaceLandmarker.createFromOptions(fileset, options("CPU"));
    }
    runningMode = "VIDEO";
    return faceLandmarker;
  } catch (err) {
    console.error("Model failed to load:", err);
    throw new AppError("MODEL_FAILED");
  } finally {
    clearTimeout(slowTimer);
    hideLoading();
  }
}

// Switch the model between camera ("VIDEO") and photo ("IMAGE") mode
async function setMode(mode) {
  if (runningMode !== mode) {
    await faceLandmarker.setOptions({ runningMode: mode });
    runningMode = mode;
  }
}

/* ---------- 5. CAMERA ---------- */
async function startCamera() {
  try {
    // Camera only works on HTTPS (or localhost). GitHub Pages is HTTPS.
    if (!window.isSecureContext) throw new AppError("INSECURE");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new AppError("UNSUPPORTED");
    }

    await loadModel();
    await setMode("VIDEO");

    try {
      // Front camera, modest resolution: smooth on mid-range phones
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (camErr) {
      throw cameraErrorToAppError(camErr);
    }

    el.video.srcObject = stream;
    await el.video.play();

    el.permission.hidden = true;
    el.live.hidden = false;
    el.btnCapture.disabled = false;
    setGuidance("STARTING", "Face the camera.", false);
    el.btnStop.focus();

    loopId = requestAnimationFrame(liveLoop);
  } catch (err) {
    stopCamera();
    showError(err);
  }
}

// Turn the browser's camera errors into our friendly error types
function cameraErrorToAppError(err) {
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return new AppError("CAMERA_DENIED");
    case "NotFoundError":
    case "OverconstrainedError":
      return new AppError("NO_CAMERA");
    case "NotReadableError":
    case "AbortError":
      return new AppError("CAMERA_BUSY");
    default:
      return new AppError("NO_CAMERA");
  }
}

// Runs about 30-60 times per second while the camera is on
function liveLoop() {
  loopId = requestAnimationFrame(liveLoop);

  const v = el.video;
  if (v.readyState < 2 || v.currentTime === lastVideoTime) return; // no new frame yet
  lastVideoTime = v.currentTime;

  // Timestamps given to MediaPipe must always increase
  const now = Math.max(performance.now(), lastTimestamp + 1);
  lastTimestamp = now;

  // THE AI STEP: MediaPipe finds the face landmarks in this frame
  const result = faceLandmarker.detectForVideo(v, now);

  const w = v.videoWidth;
  const h = v.videoHeight;
  const quality = checkFrame(result, w, h);
  drawOverlay(result, w, h, quality.ok);
  setGuidance(quality.code, quality.message, quality.ok);

  let measurement = null;
  if (quality.ok) measurement = measureFace(result.faceLandmarks[0], w, h);
  if (DEBUG) showDebug(measurement);

  // While capturing, keep only GOOD frames
  if (capture) {
    if (measurement) {
      capture.frames.push(measurement);
      keepSnapshot(v, result.faceLandmarks[0], w, h);
    }
    const done = capture.frames.length;
    const needed = FACE_SHAPE_CONFIG.FRAMES_TO_CAPTURE;
    el.progressBar.style.width = `${Math.round((done / needed) * 100)}%`;

    if (done >= needed) finishCapture();
    else if (performance.now() - capture.startedAt > 8000) cancelCapture(true);
  }
}

function stopCamera() {
  if (loopId) cancelAnimationFrame(loopId);
  loopId = null;
  capture = null;
  if (stream) stream.getTracks().forEach((t) => t.stop()); // camera light turns off
  stream = null;
  el.video.srcObject = null;
  lastVideoTime = -1;
  lastGuidanceCode = "";
  ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);
  el.live.hidden = true;
  el.permission.hidden = false;
  el.progress.hidden = true;
  el.btnCapture.disabled = true;
}

// Update the guidance text only when the message actually changes
// (otherwise screen readers would repeat it 30 times a second)
function setGuidance(code, message, ok) {
  if (code === lastGuidanceCode) return;
  lastGuidanceCode = code;
  el.guidance.textContent = message;
  el.guidance.classList.toggle("is-ok", ok);
}

// Draw the measurement lines on top of the video, so users (and the
// demo audience) can SEE what the AI is measuring
function drawOverlay(result, w, h, ok) {
  if (el.overlay.width !== w) el.overlay.width = w;
  if (el.overlay.height !== h) el.overlay.height = h;
  ctx.clearRect(0, 0, w, h);

  const faces = result.faceLandmarks || [];
  if (faces.length !== 1) return;
  const lm = faces[0];
  const P = (i) => [lm[i].x * w, lm[i].y * h];
  const L = LANDMARKS;

  // Gold when the frame is good, muted when it isn't
  ctx.strokeStyle = ok ? "#C98A35" : "#B9B0A5";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(2, w / 240);

  for (const [a, b] of MEASURE_LINES) {
    ctx.beginPath();
    ctx.moveTo(...P(a));
    ctx.lineTo(...P(b));
    ctx.stroke();
  }
  for (const i of Object.values(L)) {
    ctx.beginPath();
    ctx.arc(...P(i), ctx.lineWidth * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function showDebug(m) {
  if (!m) {
    debugPanel.textContent = "DEBUG: frame not usable";
    return;
  }
  debugPanel.textContent =
    `DEBUG (tune FACE_SHAPE_CONFIG in faceShape.js)\n` +
    `lengthRatio      ${m.lengthRatio.toFixed(3)}\n` +
    `jawRatio         ${m.jawRatio.toFixed(3)}\n` +
    `foreheadRatio    ${m.foreheadRatio.toFixed(3)}\n` +
    `foreheadJawRatio ${m.foreheadJawRatio.toFixed(3)}\n` +
    `chinAngle        ${m.chinAngle.toFixed(1)}°\n` +
    `would classify:  ${classifyFaceShape({ ...m, spread: 0, frameCount: 12 }).key}`;
}

/* ---------- 6. CAPTURE ---------- */
function startCapture() {
  capture = { frames: [], startedAt: performance.now() };
  el.btnCapture.disabled = true;
  el.btnCapture.textContent = "Hold still…";
  el.progress.hidden = false;
  el.progressBar.style.width = "0%";
}

function cancelCapture(timedOut) {
  capture = null;
  el.btnCapture.disabled = false;
  el.btnCapture.textContent = "Capture";
  el.progress.hidden = true;
  if (timedOut) showError(new AppError("CAPTURE_TIMEOUT"));
}

// Remember the most recent good frame (in memory only) so we can show the
// user's face on the results screen. It is never saved or uploaded.
function keepSnapshot(video, landmarks, w, h) {
  if (!capture.snapshot) capture.snapshot = document.createElement("canvas");
  const c = capture.snapshot;
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  c.getContext("2d").drawImage(video, 0, 0, w, h);
  capture.landmarks = landmarks.map((pt) => ({ x: pt.x, y: pt.y })); // plain copy
}

function finishCapture() {
  const average = averageMeasurements(capture.frames);
  // Grab the picture BEFORE cancelCapture() clears the capture state
  const photo = capture.snapshot
    ? { source: capture.snapshot, landmarks: capture.landmarks, mirror: true } // camera preview is mirrored
    : null;
  cancelCapture(false);
  const result = classifyFaceShape(average);
  showResults(result, photo);
}

/* ---------- 7. UPLOAD A PHOTO INSTEAD ----------
   The photo is read by the browser from the phone's storage and
   analyzed right here. It is never uploaded anywhere. */
async function analyzePhoto(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showError(new AppError("BAD_PHOTO"));
    return;
  }

  let objectUrl = null;
  try {
    stopCamera();
    await loadModel();
    await setMode("IMAGE");
    showLoading("Analyzing your photo…");

    // Load the photo into an <img> (in memory only)
    objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;
    await img.decode().catch(() => { throw new AppError("BAD_PHOTO"); });

    // Shrink big phone photos (e.g. 4000px) to max 1280px: faster, same accuracy
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

    // THE AI STEP for photos: IMAGE mode uses detect() instead of detectForVideo()
    const result = faceLandmarker.detect(canvas);
    hideLoading();

    const quality = checkFrame(result, canvas.width, canvas.height);
    // In a photo, the face being small or large is fine; other problems are not
    const sizeOnly = quality.code === "TOO_FAR" || quality.code === "TOO_CLOSE";
    if (!quality.ok && !sizeOnly) {
      throw new AppError("PHOTO_PROBLEM", quality.message);
    }

    const m = measureFace(result.faceLandmarks[0], canvas.width, canvas.height);
    const shape = classifyFaceShape(averageMeasurements([m]));
    showResults(shape, { source: canvas, landmarks: result.faceLandmarks[0], mirror: false });
  } catch (err) {
    hideLoading();
    showError(err);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl); // free the photo from memory
    el.fileInput.value = ""; // allow choosing the same photo again
  }
}

/* ---------- 8. RESULTS SCREEN ---------- */
function showResults(result, photo) {
  const shape = FACE_SHAPES[result.key];

  renderResultPhoto(photo);
  // Keep the picture in memory (only while Results is open) for "try it on"
  tryOnSource = photo && photo.landmarks ? { source: photo.source, landmarks: photo.landmarks } : null;

  $("result-shape").textContent = shape.name;
  $("result-description").textContent = shape.description;
  $("confidence-text").textContent = result.confidenceText;
  document.querySelectorAll("#confidence-bars span").forEach((bar, i) => {
    bar.classList.toggle("is-on", i < result.confidenceLevel);
  });

  // Why: the measured ratios in plain words
  fillList($("result-why"), result.reasons, (text) => text);

  // Recommended hairstyles, styles to avoid, and suggested services
  renderAdvice(shape, $("hairstyle-list"), $("avoid-list"), $("result-examples"));
  fillList($("service-list"), shape.services, serviceRowHtml, true);

  lastResultText = buildShareText(shape, result);
  el.shareStatus.textContent = "";
  hasResult = true;
  showScreen("results");
}

/* Draw the user's face (cropped around the face) with the measurement lines.
   `photo` = { source: canvas with the frame, landmarks, mirror }.
   mirror = true for the camera, so it looks like the live preview. */
function renderResultPhoto(photo) {
  if (!photo || !photo.landmarks) { clearResultPhoto(); return; }
  const { source, landmarks: lm, mirror } = photo;
  const w = source.width;
  const h = source.height;
  const L = LANDMARKS;

  // 1. Find the box around the face from the key landmarks (in pixels)
  const ids = [L.FOREHEAD_TOP, L.CHIN, L.CHEEK_LEFT, L.CHEEK_RIGHT,
               L.FOREHEAD_LEFT, L.FOREHEAD_RIGHT, L.JAW_LEFT, L.JAW_RIGHT];
  const xs = ids.map((i) => lm[i].x * w);
  const ys = ids.map((i) => lm[i].y * h);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // 2. Square crop with extra room around it so hair and ears show
  const size = Math.min(Math.max(maxX - minX, maxY - minY) * 1.6, w, h);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const sx = clamp((minX + maxX) / 2 - size / 2, 0, w - size);
  const sy = clamp((minY + maxY) / 2 - size * 0.54, 0, h - size); // a little higher: shows hair

  // 3. Draw the cropped picture, then the lines on top
  const out = el.photoCanvas.width;
  const g = el.photoCanvas.getContext("2d");
  const k = out / size;
  g.save();
  g.clearRect(0, 0, out, out);
  if (mirror) { g.translate(out, 0); g.scale(-1, 1); }
  g.drawImage(source, sx, sy, size, size, 0, 0, out, out);

  const P = (i) => [(lm[i].x * w - sx) * k, (lm[i].y * h - sy) * k];
  g.lineCap = "round";
  // Dark line underneath + light gold on top: visible on any skin tone or background
  for (const [color, width] of [["rgba(11, 10, 9, 0.55)", 5], ["#E2B677", 2.5]]) {
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = width;
    for (const [a, b] of MEASURE_LINES) {
      g.beginPath();
      g.moveTo(...P(a));
      g.lineTo(...P(b));
      g.stroke();
    }
    for (const i of new Set(MEASURE_LINES.flat())) {
      g.beginPath();
      g.arc(...P(i), width * 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  el.photoWrap.hidden = false;
}

// Erase the face picture (called whenever the user leaves the results screen)
function clearResultPhoto() {
  tryOnSource = null;
  closeTryOn();
  el.photoCanvas.getContext("2d").clearRect(0, 0, el.photoCanvas.width, el.photoCanvas.height);
  el.photoWrap.hidden = true;
}

/* ---------- 9. TRY IT ON ----------
   Tap a haircut card and the example photo opens larger. If you have just
   scanned your face, YOUR face is fitted onto the covered face area of the
   example, so you can see the haircut on you.
   How: (1) three points (both eye corners and the chin) are found on your
   face and on the example, and your picture is stretched and turned so those
   points line up; (2) your face is cut out along its own outline with soft
   edges; (3) any gap is filled with your average skin colour.
   Privacy: all of this is drawn in the browser. Nothing is saved or sent,
   and the picture is erased when you close this window or leave Results. */
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
                   176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const TRYON_SIZE = 360; // the example photos are 360 x 360
let tryOnSource = null;   // { source, landmarks } of the last scan; null outside Results
let exampleFaces = null;  // where the covered face is in each example photo (assets/examples/faces.json)
let tryOnState = null;    // { style, img, meta, showMe }

async function loadExampleFaces() {
  if (!exampleFaces) {
    const res = await fetch("assets/examples/faces.json");
    if (!res.ok) throw new Error("faces.json missing");
    exampleFaces = await res.json();
  }
  return exampleFaces;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function findStyleByPhoto(path) {
  for (const shape of Object.values(FACE_SHAPES)) {
    const s = shape.hairstyles.find((h) => h.photo === path);
    if (s) return s;
  }
  return null;
}

// Affine transform that moves three points (from) exactly onto three points (to)
function affineFrom(from, to) {
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const A = from.map(([x, y]) => [x, y, 1]);
  const D = det3(A);
  const solve = (r) => [0, 1, 2].map((col) => det3(A.map((row, i) => row.map((v, j) => (j === col ? r[i] : v)))) / D);
  const [a, c, e] = solve(to.map((p) => p[0]));
  const [b, d, f] = solve(to.map((p) => p[1]));
  return { a, b, c, d, e, f };
}

const newCanvas = () => {
  const c = document.createElement("canvas");
  c.width = c.height = TRYON_SIZE;
  return c;
};

// A soft-edged polygon mask. (Shadow trick: draw the shape off-screen and let
// its blurred shadow land on the canvas; works in every browser.)
function softPolygon(points, blur) {
  const c = newCanvas();
  const g = c.getContext("2d");
  const OFF = TRYON_SIZE * 3;
  g.shadowColor = "#000";
  g.shadowBlur = blur;
  g.shadowOffsetX = OFF;
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x - OFF, y) : g.moveTo(x - OFF, y)));
  g.closePath();
  g.fill();
  return c;
}

function shrinkPolygon(points, k) {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

// Average skin colour from small patches on both cheeks
function sampleSkin(source, lm) {
  const g = source.getContext("2d", { willReadFrequently: true });
  let r = 0, gr = 0, b = 0, n = 0;
  for (const i of [205, 425, 50, 280]) {
    const x = Math.round(lm[i].x * source.width), y = Math.round(lm[i].y * source.height);
    const x0 = Math.max(0, Math.min(source.width - 9, x - 4)), y0 = Math.max(0, Math.min(source.height - 9, y - 4));
    const d = g.getImageData(x0, y0, 9, 9).data;
    for (let k = 0; k < d.length; k += 4) { r += d[k]; gr += d[k + 1]; b += d[k + 2]; n++; }
  }
  return `rgb(${Math.round(r / n)}, ${Math.round(gr / n)}, ${Math.round(b / n)})`;
}

function composeTryOn(g, img, meta, user) {
  const S = TRYON_SIZE;
  const { source, landmarks: lm } = user;
  const w = source.width, h = source.height;
  const U = (i) => [lm[i].x * w, lm[i].y * h];
  const L = LANDMARKS;

  // Line up the user's eyes and chin with the example's
  const M = affineFrom([U(L.EYE_OUTER_LEFT), U(L.EYE_OUTER_RIGHT), U(L.CHIN)], [meta.eyeL, meta.eyeR, meta.chin]);
  const move = ([x, y]) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];

  g.clearRect(0, 0, S, S);
  g.drawImage(img, 0, 0, S, S);

  // 1. Fill the covered area with the user's skin colour (hides any gap)
  const fill = newCanvas();
  const fg = fill.getContext("2d");
  fg.fillStyle = sampleSkin(source, lm);
  fg.fillRect(0, 0, S, S);
  fg.globalCompositeOperation = "destination-in";
  fg.drawImage(softPolygon(shrinkPolygon(meta.hole, 0.96), 8), 0, 0);
  g.drawImage(fill, 0, 0);

  // 2. The user's face, cut along its own outline, kept inside the covered area
  const face = newCanvas();
  const cg = face.getContext("2d");
  cg.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  cg.drawImage(source, 0, 0);
  cg.setTransform(1, 0, 0, 1, 0, 0);
  const oval = shrinkPolygon(FACE_OVAL.map((i) => move(U(i))), 0.9);
  cg.globalCompositeOperation = "destination-in";
  cg.drawImage(softPolygon(oval, 10), 0, 0);
  cg.drawImage(softPolygon(meta.hole, 6), 0, 0);
  g.drawImage(face, 0, 0);
}

function drawTryOn() {
  const { img, meta, showMe } = tryOnState;
  const g = $("tryon-canvas").getContext("2d");
  if (showMe && tryOnSource && meta) {
    try { composeTryOn(g, img, meta, tryOnSource); return; } catch (e) { /* fall back to the plain photo */ }
  }
  g.clearRect(0, 0, TRYON_SIZE, TRYON_SIZE);
  g.drawImage(img, 0, 0, TRYON_SIZE, TRYON_SIZE);
}

async function openTryOn(photoPath) {
  const style = findStyleByPhoto(photoPath);
  if (!style) return;
  const dlg = $("tryon-dialog");
  const canTry = !!tryOnSource && !$("screen-results").hidden;
  $("tryon-title").textContent = style.name;
  $("tryon-canvas").setAttribute("aria-label", `Example of a ${style.name}`);
  $("tryon-toggle").hidden = true;
  $("tryon-scan").hidden = canTry;
  $("tryon-msg").textContent = canTry
    ? "Your face fitted onto the example haircut. It is a rough preview: skin tone and lighting will not match perfectly."
    : "Example photo with the face hidden. Scan your face to see this haircut on you.";
  try {
    const [img, faces] = await Promise.all([loadImage(photoPath), canTry ? loadExampleFaces().catch(() => null) : null]);
    tryOnState = { style, img, meta: faces ? faces[photoPath] : null, showMe: canTry };
  } catch (e) {
    return; // the photo could not load: do nothing
  }
  if (tryOnState.showMe && !tryOnState.meta) { tryOnState.showMe = false; }
  $("tryon-toggle").hidden = !(canTry && tryOnState.meta);
  $("tryon-toggle").textContent = "Show original photo";
  drawTryOn();
  if (!dlg.open) dlg.showModal();
}

function closeTryOn() {
  const dlg = $("tryon-dialog");
  if (dlg && dlg.open) dlg.close();
}

function initTryOn() {
  const dlg = $("tryon-dialog");
  // Any card button with data-tryon opens the window (cards are redrawn often, so listen on the page)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tryon]");
    if (btn) openTryOn(btn.dataset.tryon);
  });
  $("tryon-close").addEventListener("click", closeTryOn);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeTryOn(); }); // click outside the box
  dlg.addEventListener("close", () => {
    // Privacy: erase the picture as soon as the window closes
    $("tryon-canvas").getContext("2d").clearRect(0, 0, TRYON_SIZE, TRYON_SIZE);
    tryOnState = null;
  });
  $("tryon-toggle").addEventListener("click", () => {
    if (!tryOnState) return;
    tryOnState.showMe = !tryOnState.showMe;
    $("tryon-toggle").textContent = tryOnState.showMe ? "Show original photo" : "Show on my face";
    drawTryOn();
  });
  $("tryon-scan").addEventListener("click", () => { closeTryOn(); showScreen("camera"); });
}

/* Hairstyle cards and "use with care" lists. Used by BOTH the Results screen
   and the Styles guide, so the two always look the same. */
function styleCardHtml(style) {
  // A real photo of TLC's work if one is set in data.js, otherwise our SVG drawing
  const media = style.photo
    ? `<img src="${style.photo}" data-icon="${style.icon}" alt="Example of a ${style.name} (face hidden)" loading="lazy" width="360" height="360">`
    : hairstyleIcon(style.icon);
  return `
    <article class="style-card${style.photo ? " style-card--photo" : ""}">
      <div class="style-card__media">${media}</div>
      <div>
        <h3 class="style-card__name">${
          style.photo
            ? `<button type="button" class="style-card__open" data-tryon="${style.photo}">${style.name}</button>`
            : style.name
        }</h3>
        <p class="style-card__why">${style.why}</p>
        ${style.photo ? '<p class="style-card__hint">Tap to try it on</p>' : ""}
      </div>
    </article>`;
}

// If an example photo is missing (for example it was left out of the upload),
// quietly show the drawn icon instead and turn off "try it on" for that card.
function useIconsIfPhotoMissing(listEl) {
  listEl.querySelectorAll(".style-card__media img").forEach((img) => {
    img.addEventListener("error", () => {
      const card = img.closest(".style-card");
      img.parentElement.innerHTML = hairstyleIcon(img.dataset.icon);
      card.classList.remove("style-card--photo");
      const btn = card.querySelector(".style-card__open");
      if (btn) btn.replaceWith(document.createTextNode(btn.textContent));
      const hint = card.querySelector(".style-card__hint");
      if (hint) hint.remove();
    }, { once: true });
  });
}

function renderAdvice(shape, hairstyleListEl, avoidListEl, examplesEl) {
  fillList(hairstyleListEl, shape.hairstyles, styleCardHtml, true);
  useIconsIfPhotoMissing(hairstyleListEl);
  fillList(avoidListEl, shape.avoid, (a) => `<strong>${a.name}:</strong> ${a.why}`, true);
  if (examplesEl) renderExamples(shape, examplesEl);
}

// Small note under the hairstyle cards about the example photos
const EXAMPLES_NOTE = "Example photos with the faces hidden, from a student sample set for our school presentation. TLC Barbershop's own photos will replace them.";
function renderExamples(shape, box) {
  const hasPhotos = shape.hairstyles.some((h) => h.photo);
  box.hidden = !hasPhotos;
  box.textContent = hasPhotos ? EXAMPLES_NOTE : "";
}

// One row of the services list (name, note, price). Prices that are still
// "TO CONFIRM..." show as "Price to confirm".
function serviceRowHtml(key) {
  const s = SERVICES[key];
  if (!s) return "";
  const price = s.price.startsWith("TO CONFIRM") ? "Price to confirm" : s.price;
  return `
    <span class="service-name">${s.name}<span class="service-note">${s.note}</span></span>
    <span class="service-price">${price}</span>`;
}

// Put one <li> per item into a list. `asHtml` = the text contains markup we wrote
function fillList(listEl, items, render, asHtml = false) {
  listEl.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    if (asHtml) li.innerHTML = render(item);
    else li.textContent = render(item);
    listEl.appendChild(li);
  }
}

/* ---------- 8b. STYLES GUIDE, SERVICES PAGE, SHOP DETAILS ---------- */

// Styles guide: pick any face shape and read its advice (no camera needed)
const SHAPE_ORDER = ["oval", "round", "square", "rectangle", "heart", "diamond"];

function initStylesGuide() {
  const picker = $("shape-picker");
  for (const key of SHAPE_ORDER) {
    if (!FACE_SHAPES[key]) continue;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "shape-chip";
    chip.dataset.shape = key;
    chip.textContent = FACE_SHAPES[key].name;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => selectGuideShape(key));
    picker.appendChild(chip);
  }
  selectGuideShape(SHAPE_ORDER[0]);
}

function selectGuideShape(key) {
  const shape = FACE_SHAPES[key];
  document.querySelectorAll("#shape-picker .shape-chip").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.shape === key));
  });
  $("guide-shape").textContent = `${shape.name} face`;
  $("guide-description").textContent = shape.description;
  renderAdvice(shape, $("guide-hairstyles"), $("guide-avoid"), $("guide-examples"));
}

// Services page: every service from data.js
function renderServicesPage() {
  fillList($("services-all"), Object.keys(SERVICES), serviceRowHtml, true);
}

// Fill the shop's address, phone, hours and links from data.js (SHOP),
// so the owner only has to edit them in one place.
function fillShopInfo() {
  document.querySelectorAll("[data-shop]").forEach((node) => {
    if (SHOP[node.dataset.shop]) node.textContent = SHOP[node.dataset.shop];
  });
  document.querySelectorAll("[data-shop-href]").forEach((node) => {
    if (SHOP[node.dataset.shopHref]) node.href = SHOP[node.dataset.shopHref];
  });
  // The "to confirm" styling only applies while the hours are still a placeholder
  $("shop-hours").classList.toggle("placeholder", SHOP.hours.startsWith("TO CONFIRM"));
}

/* ---------- 9. SAVE / SHARE RESULT ----------
   Only TEXT is shared, never a photo. Nothing is stored by the app. */
function buildShareText(shape, result) {
  const styles = shape.hairstyles.map((s) => `- ${s.name}`).join("\n");
  return (
    `My estimated face shape: ${shape.name} (confidence: ${result.confidenceText})\n\n` +
    `Suggested hairstyles:\n${styles}\n\n` +
    `This is an estimate from the TLC Haircut Advisor app. Ask the barber to confirm.\n\n` +
    `${SHOP.name}\n${SHOP.address}\nCall: ${SHOP.phoneDisplay}\nFacebook: ${SHOP.facebook}`
  );
}

async function shareResult() {
  // 1st choice: the phone's share sheet (Messenger, Notes, etc.)
  if (navigator.share) {
    try {
      await navigator.share({ title: "My haircut advice", text: lastResultText });
      el.shareStatus.textContent = "Shared.";
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // user closed the share sheet
    }
  }
  // 2nd choice: copy to clipboard
  try {
    await navigator.clipboard.writeText(lastResultText);
    el.shareStatus.textContent = "Copied. You can paste it in a message or your notes.";
  } catch {
    // Last resort for older browsers
    const area = document.createElement("textarea");
    area.value = lastResultText;
    area.setAttribute("readonly", "");
    area.style.position = "absolute";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    el.shareStatus.textContent = ok
      ? "Copied. You can paste it in a message or your notes."
      : "Couldn't copy on this browser. Take a screenshot instead.";
  }
}

/* ---------- 10. ERROR MESSAGES ----------
   One place for every friendly error. `action` is what the main
   button does: "retry-camera", "upload", or "close". */
class AppError extends Error {
  constructor(type, detail) {
    super(type);
    this.type = type;
    this.detail = detail;
  }
}

const ERRORS = {
  CAMERA_DENIED: {
    title: "Camera blocked",
    message: "The browser wasn't allowed to use the camera. To fix it, tap the lock or camera icon next to the address bar, allow the camera, and try again. Or upload a photo instead.",
    actionLabel: "Upload a photo instead", action: "upload",
  },
  NO_CAMERA: {
    title: "No camera found",
    message: "We couldn't find a camera on this device. You can upload a photo of your face instead.",
    actionLabel: "Upload a photo instead", action: "upload",
  },
  CAMERA_BUSY: {
    title: "Camera is busy",
    message: "Another app may be using the camera. Close other camera apps or video calls, then try again.",
    actionLabel: "Try again", action: "retry-camera",
  },
  INSECURE: {
    title: "Secure connection needed",
    message: "The camera only works on a secure (https) page. Open the app from its GitHub Pages link, or upload a photo instead.",
    actionLabel: "Upload a photo instead", action: "upload",
  },
  UNSUPPORTED: {
    title: "Browser not supported",
    message: "This browser can't run the face AI. Please use an up-to-date Chrome (Android) or Safari (iPhone).",
    actionLabel: "Close", action: "close",
  },
  MODEL_FAILED: {
    title: "The face AI didn't load",
    message: "This is usually a slow or interrupted connection. Check your internet and try again.",
    actionLabel: "Try again", action: "close",
  },
  CAPTURE_TIMEOUT: {
    title: "We couldn't get a steady scan",
    message: "Keep your face inside the frame, look straight ahead, and hold still for 2 seconds. Good lighting helps.",
    actionLabel: "Try again", action: "close",
  },
  PHOTO_PROBLEM: {
    title: "Try another photo",
    message: "", // filled with the specific reason (e.g. "Only one person, please")
    actionLabel: "Choose another photo", action: "upload",
  },
  BAD_PHOTO: {
    title: "We couldn't open that photo",
    message: "Please choose a JPG or PNG photo of your face, taken from the front.",
    actionLabel: "Choose another photo", action: "upload",
  },
  UNKNOWN: {
    title: "Something went wrong",
    message: "Please try again. If it keeps happening, reload the page.",
    actionLabel: "Close", action: "close",
  },
};

let errorAction = "close";
let focusBeforeError = null;

function showError(err) {
  const type = err instanceof AppError ? err.type : "UNKNOWN";
  if (!(err instanceof AppError)) console.error(err);
  const info = ERRORS[type] || ERRORS.UNKNOWN;

  el.errorTitle.textContent = info.title;
  el.errorMessage.textContent =
    type === "PHOTO_PROBLEM" ? `${err.detail} Use a clear, front-facing photo of one person.` : info.message;
  el.errorAction.textContent = info.actionLabel;
  errorAction = info.action;

  focusBeforeError = document.activeElement;
  el.errorBox.hidden = false;
  el.errorAction.focus();
}

function closeError() {
  el.errorBox.hidden = true;
  if (focusBeforeError && focusBeforeError.focus) focusBeforeError.focus();
}

function runErrorAction() {
  closeError();
  if (errorAction === "upload") el.fileInput.click();
  else if (errorAction === "retry-camera") startCamera();
}

function showLoading(text) {
  el.loadingText.textContent = text;
  el.loading.hidden = false;
}
function hideLoading() {
  el.loading.hidden = true;
}

/* ---------- 11. WIRING: connect buttons to functions ---------- */
function init() {
  fillShopInfo();
  initStylesGuide();
  initTryOn();
  renderServicesPage();

  // Every button/link with data-goto="screen-name" (nav bars, header logo, text links)
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.goto));
  });

  $("btn-start").addEventListener("click", () => showScreen("camera"));

  // The phone's Back / Forward buttons
  window.addEventListener("popstate", () => showScreen(screenFromHash(), { fromHistory: true }));

  el.btnAllow.addEventListener("click", startCamera);
  el.btnStop.addEventListener("click", stopCamera);
  el.btnCapture.addEventListener("click", startCapture);

  // Every "Upload a photo instead" button opens the hidden file picker
  document.querySelectorAll(".js-upload-trigger").forEach((btn) => {
    btn.addEventListener("click", () => el.fileInput.click());
  });
  el.fileInput.addEventListener("change", () => analyzePhoto(el.fileInput.files[0]));

  $("btn-try-again").addEventListener("click", () => showScreen("camera"));
  $("btn-share").addEventListener("click", shareResult);

  el.errorAction.addEventListener("click", runErrorAction);
  el.errorClose.addEventListener("click", closeError);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.errorBox.hidden) closeError();
  });

  // Turn the camera off if the user switches apps or closes the tab
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });
  window.addEventListener("pagehide", () => { stopCamera(); clearResultPhoto(); });

  // Warn (on the Feedback screen) if the Google Form link is still a placeholder
  const formLink = $("feedback-form-link");
  if (formLink.href.includes("REPLACE_WITH")) {
    $("feedback-warning").hidden = false;
    formLink.setAttribute("aria-disabled", "true");
    formLink.addEventListener("click", (e) => e.preventDefault());
  }

  // Open the screen named in the address (default: home)
  showScreen(screenFromHash(), { fromHistory: true, initial: true });
}

init();
