# ============================================================
# download-mediapipe.ps1  (Windows PowerShell)
# Downloads the pinned MediaPipe files into the right folders.
# Run ONCE from the project folder:
#   powershell -ExecutionPolicy Bypass -File download-mediapipe.ps1
# ============================================================
$v = "0.10.21"   # pinned version: change only if you re-test everything
$base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$v"

New-Item -ItemType Directory -Force "vendor/mediapipe/wasm", "models" | Out-Null

# 1) The JavaScript library (ES module)
Invoke-WebRequest "$base/vision_bundle.mjs" -OutFile "vendor/mediapipe/vision_bundle.mjs"

# 2) The WebAssembly runtime (SIMD version for modern phones + no-SIMD fallback)
foreach ($f in "vision_wasm_internal.js", "vision_wasm_internal.wasm",
               "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm") {
  Invoke-WebRequest "$base/wasm/$f" -OutFile "vendor/mediapipe/wasm/$f"
}

# 3) The Face Landmarker AI model (float16, about 3.6 MB)
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile "models/face_landmarker.task"

Write-Host "Done. Check that vendor/mediapipe and models now contain the files."
