#!/bin/sh
# download-mediapipe.sh  (Mac / Linux / Git Bash)
# Run ONCE from the project folder:  sh download-mediapipe.sh
set -e
V="0.10.21"   # pinned version: change only if you re-test everything
BASE="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V"
mkdir -p vendor/mediapipe/wasm models
curl -fL "$BASE/vision_bundle.mjs" -o vendor/mediapipe/vision_bundle.mjs
for f in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  curl -fL "$BASE/wasm/$f" -o "vendor/mediapipe/wasm/$f"
done
curl -fL "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -o models/face_landmarker.task
echo "Done."
