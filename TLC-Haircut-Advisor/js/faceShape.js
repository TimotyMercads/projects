/* =============================================================
   faceShape.js  |  Measurement + classification logic
   -------------------------------------------------------------
   This file is the "brain" that turns MediaPipe's output into a
   face shape. It has NO user interface code; app.js calls it.

   HOW IT WORKS (in 4 steps)
   1. MediaPipe Face Landmarker gives us 478 points on the face.
      Each point has x and y between 0 and 1 (a fraction of the
      image width and height).
   2. measureFace() converts the points we need into pixels and
      measures: face length, forehead width, cheekbone width, jaw
      width, and the chin angle.
   3. averageMeasurements() averages those numbers over ~12 frames
      so one blurry frame can't change the answer.
   4. classifyFaceShape() compares RATIOS (e.g. length / width)
      against the thresholds in FACE_SHAPE_CONFIG and picks one of
      6 shapes, with a confidence level and plain-language reasons.

   THE QUICK TEST: if MediaPipe is removed there are no landmarks,
   so nothing here can run. The face shape comes ONLY from the
   model's landmark output.
   ============================================================= */

/* -------------------------------------------------------------
   LANDMARK INDICES WE USE
   These numbers are positions in MediaPipe's face mesh (0 to 477).
   You can see them on the official face mesh map:
   https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
   VERIFY: open that image and zoom in to check each number below.

   Note: "left" and "right" here mean left/right in the camera
   IMAGE, not the person's own left/right. For distances it
   doesn't matter.
   ------------------------------------------------------------- */
export const LANDMARKS = {
  FOREHEAD_TOP: 10,     // top-center of the mesh (upper forehead, BELOW the real hairline)
  CHIN: 152,            // bottom of the chin
  FOREHEAD_LEFT: 54,    // upper forehead, one side
  FOREHEAD_RIGHT: 284,  // upper forehead, other side
  CHEEK_LEFT: 234,      // widest point of the face at the cheekbones, one side
  CHEEK_RIGHT: 454,     // widest point at the cheekbones, other side
  JAW_LEFT: 172,        // lower jaw near the jaw corner, one side
  JAW_RIGHT: 397,       // lower jaw near the jaw corner, other side
  EYE_OUTER_LEFT: 33,   // outer corner of one eye (used for head tilt)
  EYE_OUTER_RIGHT: 263, // outer corner of the other eye
  NOSE_TIP: 1,          // tip of the nose (used to check if the head is turned)
};

/* -------------------------------------------------------------
   FACE_SHAPE_CONFIG: ALL TUNABLE NUMBERS IN ONE PLACE
   These are starting values (heuristics), NOT scientific
   constants. Tune them during testing: open the app with
   ?debug=1 at the end of the address to see live ratios, try
   several people whose face shape a barber has confirmed, then
   adjust. Change one number at a time and write down why.
   ------------------------------------------------------------- */
export const FACE_SHAPE_CONFIG = {
  // The mesh stops at the upper forehead, not the hairline.
  // We stretch face length by this factor to estimate the hairline.
  FOREHEAD_EXTENSION: 1.12,

  // lengthRatio = face length / cheekbone width
  LONG_FACE_MIN: 1.50,   // at or above this: long face (Rectangle/Oblong)
  SHORT_FACE_MAX: 1.30,  // at or below this: short face (Round or Square)

  // jawRatio = jaw width / cheekbone width
  WIDE_JAW_MIN: 0.86,    // at or above this: strong, wide jaw (Square)
  NARROW_JAW_MAX: 0.78,  // at or below this: narrow jaw (Heart/Diamond)

  // foreheadJawRatio = forehead width / jaw width
  HEART_FOREHEAD_TO_JAW_MIN: 1.05, // forehead clearly wider than jaw: Heart

  // foreheadRatio = forehead width / cheekbone width
  DIAMOND_FOREHEAD_MAX: 0.80, // narrow forehead AND narrow jaw: Diamond

  // chinAngle = angle at the chin between the two jaw points (degrees)
  POINTED_CHIN_MAX_DEG: 88,  // smaller = pointed chin (Heart, Diamond)
  ANGULAR_CHIN_MIN_DEG: 100, // larger = broad, flat chin (Square)

  // Confidence: how far the deciding ratio is from its threshold
  // (as a fraction). Far away = sure; close = could go either way.
  CONFIDENCE_HIGH_MARGIN: 0.06,
  CONFIDENCE_MEDIUM_MARGIN: 0.025,
  // If the length ratio varies more than this between frames,
  // the scan was shaky, so confidence drops one level.
  UNSTABLE_SPREAD: 0.04,

  // How many good frames "Capture" collects and averages
  FRAMES_TO_CAPTURE: 12,

  // Frame quality checks (drive the on-screen guidance)
  QUALITY: {
    MIN_FACE_WIDTH: 0.28,  // face width / shorter image side; below: "Move closer"
    MAX_FACE_WIDTH: 0.80,  // above: "Move a little farther back"
    EDGE_MARGIN: 0.02,     // landmarks this close to the edge: "Center your face"
    MAX_ROLL_DEG: 8,       // head tilted sideways more than this: "Keep your head straight"
    MAX_YAW: 0.10,         // nose off-center by >10% of face width: "Look straight ahead"
    PITCH_MIN: 0.90,       // (nose-to-forehead) / (nose-to-chin) outside this
    PITCH_MAX: 1.60,       //   range means chin is up or down
  },
};

/* -------------------------------------------------------------
   Small math helpers
   ------------------------------------------------------------- */

// Convert one landmark (x, y as 0..1 fractions) to pixel coordinates.
// We MUST use pixels: a 0..1 x and a 0..1 y are not the same length
// unless the image is square, which a phone camera image is not.
function toPixels(landmark, imgW, imgH) {
  return { x: landmark.x * imgW, y: landmark.y * imgH };
}

// Straight-line distance between two points.
// Distances do not change when the head is tilted sideways (roll),
// which is how we "normalize" for roll: we only ever compare
// distances, never raw x or y positions.
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Angle (in degrees) at point `vertex` between points a and b.
function angleAt(vertex, a, b) {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cos = dot / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/* -------------------------------------------------------------
   1. checkFrame(): is this frame good enough to measure?
   `result` is what MediaPipe's detect()/detectForVideo() returns.
   Returns { ok, code, message } so app.js can show guidance.
   ------------------------------------------------------------- */
export function checkFrame(result, imgW, imgH) {
  const faces = (result && result.faceLandmarks) || [];
  const Q = FACE_SHAPE_CONFIG.QUALITY;

  if (faces.length === 0) {
    return { ok: false, code: "NO_FACE", message: "Face the camera. We can't see a face yet." };
  }
  if (faces.length > 1) {
    return { ok: false, code: "MULTIPLE_FACES", message: "Only one person in the frame, please." };
  }

  const lm = faces[0];
  const P = (i) => toPixels(lm[i], imgW, imgH);
  const L = LANDMARKS;

  // Is the face cut off by the edge of the picture?
  const nearEdge = [L.FOREHEAD_TOP, L.CHIN, L.CHEEK_LEFT, L.CHEEK_RIGHT].some((i) =>
    lm[i].x < Q.EDGE_MARGIN || lm[i].x > 1 - Q.EDGE_MARGIN ||
    lm[i].y < Q.EDGE_MARGIN || lm[i].y > 1 - Q.EDGE_MARGIN);
  if (nearEdge) {
    return { ok: false, code: "OFF_CENTER", message: "Center your face inside the frame." };
  }

  // Is the face too small (far away) or too big (too close)?
  const cheekWidth = distance(P(L.CHEEK_LEFT), P(L.CHEEK_RIGHT));
  const faceSize = cheekWidth / Math.min(imgW, imgH);
  if (faceSize < Q.MIN_FACE_WIDTH) {
    return { ok: false, code: "TOO_FAR", message: "Move closer to the camera." };
  }
  if (faceSize > Q.MAX_FACE_WIDTH) {
    return { ok: false, code: "TOO_CLOSE", message: "Move a little farther back." };
  }

  // Head pose. getPose() is explained below.
  const pose = getPose(lm, imgW, imgH);
  if (pose.rollDeg > Q.MAX_ROLL_DEG) {
    return { ok: false, code: "TILTED", message: "Keep your head straight. Don't tilt it to the side." };
  }
  if (Math.abs(pose.yaw) > Q.MAX_YAW) {
    return { ok: false, code: "TURNED", message: "Look straight ahead at the camera." };
  }
  if (pose.pitch < Q.PITCH_MIN || pose.pitch > Q.PITCH_MAX) {
    return { ok: false, code: "CHIN", message: "Keep your chin level. Don't look up or down." };
  }

  return {
    ok: true,
    code: "OK",
    message: "Looks good. If you can, remove glasses and push hair off your forehead, then tap Capture.",
  };
}

/* -------------------------------------------------------------
   getPose(): rough head pose from a few landmarks
   - roll  (tilting the head toward a shoulder): angle of the line
           between the outer eye corners. 0 degrees = eyes level.
   - yaw   (turning left/right): how far the nose tip is from the
           middle of the face, as a fraction of face width.
   - pitch (chin up/down): nose-to-forehead distance divided by
           nose-to-chin distance. Looking up or down changes it.
   We don't try to "undo" yaw or pitch with math (that needs a 3D
   model and is error-prone). Instead we reject those frames and
   ask the user to look straight ahead. Simple and reliable.
   ------------------------------------------------------------- */
export function getPose(lm, imgW, imgH) {
  const L = LANDMARKS;
  const P = (i) => toPixels(lm[i], imgW, imgH);

  const eyeA = P(L.EYE_OUTER_LEFT);
  const eyeB = P(L.EYE_OUTER_RIGHT);
  let rollDeg = (Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x) * 180) / Math.PI;
  // atan2 gives -180..180; fold it so 0 means "level" either way round
  rollDeg = Math.abs(rollDeg);
  if (rollDeg > 90) rollDeg = 180 - rollDeg;

  const cheekA = P(L.CHEEK_LEFT);
  const cheekB = P(L.CHEEK_RIGHT);
  const middleX = (cheekA.x + cheekB.x) / 2;
  const yaw = (P(L.NOSE_TIP).x - middleX) / distance(cheekA, cheekB);

  const nose = P(L.NOSE_TIP);
  const pitch = distance(nose, P(L.FOREHEAD_TOP)) / distance(nose, P(L.CHIN));

  return { rollDeg, yaw, pitch };
}

/* -------------------------------------------------------------
   2. measureFace(): the five measurements + their ratios
   `lm` = one face's landmark list (result.faceLandmarks[0]).
   ------------------------------------------------------------- */
export function measureFace(lm, imgW, imgH) {
  const L = LANDMARKS;
  const C = FACE_SHAPE_CONFIG;
  const P = (i) => toPixels(lm[i], imgW, imgH);

  // Face length: forehead top (10) to chin (152), stretched a bit
  // to estimate the real hairline (see FOREHEAD_EXTENSION).
  const faceLength = distance(P(L.FOREHEAD_TOP), P(L.CHIN)) * C.FOREHEAD_EXTENSION;
  // Forehead width: 54 to 284
  const foreheadWidth = distance(P(L.FOREHEAD_LEFT), P(L.FOREHEAD_RIGHT));
  // Cheekbone width: 234 to 454 (usually the widest part of the face)
  const cheekWidth = distance(P(L.CHEEK_LEFT), P(L.CHEEK_RIGHT));
  // Jaw width: 172 to 397
  const jawWidth = distance(P(L.JAW_LEFT), P(L.JAW_RIGHT));
  // Chin angle: the angle at the chin (152) between the two jaw points.
  // Pointed chin = small angle; broad, square chin = large angle.
  const chinAngle = angleAt(P(L.CHIN), P(L.JAW_LEFT), P(L.JAW_RIGHT));

  return {
    faceLength, foreheadWidth, cheekWidth, jawWidth, chinAngle,
    // Ratios have no units, so they don't depend on how far you
    // stand from the camera. These are what we classify on.
    lengthRatio: faceLength / cheekWidth,
    jawRatio: jawWidth / cheekWidth,
    foreheadRatio: foreheadWidth / cheekWidth,
    foreheadJawRatio: foreheadWidth / jawWidth,
  };
}

/* -------------------------------------------------------------
   3. averageMeasurements(): combine many frames into one
   Uses a "trimmed mean": sort the values, drop the most extreme
   ones at both ends, and average the rest. This ignores the odd
   bad frame (blink, motion blur) without complex statistics.
   Also reports `spread`: how much the length ratio varied.
   ------------------------------------------------------------- */
export function averageMeasurements(list) {
  if (!list || list.length === 0) return null;

  const keys = Object.keys(list[0]);
  const avg = {};
  for (const key of keys) {
    const values = list.map((m) => m[key]).sort((a, b) => a - b);
    const trim = Math.floor(values.length * 0.15); // drop ~15% at each end
    const kept = values.slice(trim, values.length - trim);
    avg[key] = kept.reduce((sum, v) => sum + v, 0) / kept.length;
  }

  const lengths = list.map((m) => m.lengthRatio);
  avg.spread = (Math.max(...lengths) - Math.min(...lengths)) / avg.lengthRatio;
  avg.frameCount = list.length;
  return avg;
}

/* -------------------------------------------------------------
   4. classifyFaceShape(): ratios -> one of 6 shapes
   Rules are checked IN ORDER; the first one that matches wins.
   Each rule records a "margin" = how far the deciding number is
   from its threshold, used for the confidence level.
   ------------------------------------------------------------- */
export function classifyFaceShape(m) {
  const C = FACE_SHAPE_CONFIG;
  // Relative distance between a value and a threshold (0.05 = 5%)
  const gap = (value, threshold) => Math.abs(value - threshold) / threshold;

  let key;
  let margin;

  if (m.foreheadRatio <= C.DIAMOND_FOREHEAD_MAX && m.jawRatio <= C.NARROW_JAW_MAX) {
    // Cheekbones clearly wider than BOTH forehead and jaw
    key = "diamond";
    margin = Math.min(gap(m.foreheadRatio, C.DIAMOND_FOREHEAD_MAX), gap(m.jawRatio, C.NARROW_JAW_MAX));
  } else if (m.foreheadJawRatio >= C.HEART_FOREHEAD_TO_JAW_MIN && m.chinAngle < C.ANGULAR_CHIN_MIN_DEG) {
    // Forehead wider than jaw, chin not broad
    key = "heart";
    margin = gap(m.foreheadJawRatio, C.HEART_FOREHEAD_TO_JAW_MIN);
  } else if (m.lengthRatio >= C.LONG_FACE_MIN) {
    // Much longer than wide
    key = "rectangle";
    margin = gap(m.lengthRatio, C.LONG_FACE_MIN);
  } else if (m.jawRatio >= C.WIDE_JAW_MIN && m.chinAngle >= C.ANGULAR_CHIN_MIN_DEG) {
    // Wide jaw with a broad chin, not long
    key = "square";
    margin = Math.min(gap(m.jawRatio, C.WIDE_JAW_MIN), gap(m.chinAngle, C.ANGULAR_CHIN_MIN_DEG));
  } else if (m.lengthRatio <= C.SHORT_FACE_MAX) {
    // Short face, softer jaw
    key = "round";
    margin = gap(m.lengthRatio, C.SHORT_FACE_MAX);
  } else {
    // Balanced: between short and long, no extreme widths
    key = "oval";
    margin = Math.min(gap(m.lengthRatio, C.SHORT_FACE_MAX), gap(m.lengthRatio, C.LONG_FACE_MIN));
  }

  // Confidence: 3 = High, 2 = Medium, 1 = Low
  let level = margin >= C.CONFIDENCE_HIGH_MARGIN ? 3 : margin >= C.CONFIDENCE_MEDIUM_MARGIN ? 2 : 1;
  // A shaky scan, or a single uploaded photo, can't be "High"
  if (m.spread > C.UNSTABLE_SPREAD) level -= 1;
  if (m.frameCount === 1) level = Math.min(level, 2);
  level = Math.max(1, level);

  return {
    key,
    confidenceLevel: level,
    confidenceText: ["Low", "Medium", "High"][level - 1],
    reasons: explain(m),
  };
}

/* -------------------------------------------------------------
   explain(): plain-language "why" lines shown on the results
   screen. Numbers are rounded so they're easy to read aloud.
   ------------------------------------------------------------- */
function explain(m) {
  const C = FACE_SHAPE_CONFIG;
  const pct = (r) => Math.round(r * 100);
  const lines = [];

  const lengthWord =
    m.lengthRatio >= C.LONG_FACE_MIN ? "long" :
    m.lengthRatio <= C.SHORT_FACE_MAX ? "short (close to as long as it is wide)" : "balanced";
  lines.push(`Face length is about ${m.lengthRatio.toFixed(2)} times your cheekbone width, which is ${lengthWord}.`);

  lines.push(`Your forehead is about ${pct(m.foreheadRatio)}% of your cheekbone width.`);

  const jawWord =
    m.jawRatio >= C.WIDE_JAW_MIN ? "wide and strong" :
    m.jawRatio <= C.NARROW_JAW_MAX ? "narrower" : "medium";
  lines.push(`Your jaw is about ${pct(m.jawRatio)}% of your cheekbone width (${jawWord}).`);

  const chinWord =
    m.chinAngle <= C.POINTED_CHIN_MAX_DEG ? "more pointed" :
    m.chinAngle >= C.ANGULAR_CHIN_MIN_DEG ? "broad and angular" : "medium";
  lines.push(`Your chin angle is about ${Math.round(m.chinAngle)} degrees (${chinWord}).`);

  if (m.frameCount > 1) {
    lines.push(`Measured and averaged over ${m.frameCount} camera frames.`);
  } else {
    lines.push("Measured from one photo, so the result is less certain than a live scan.");
  }
  return lines;
}
