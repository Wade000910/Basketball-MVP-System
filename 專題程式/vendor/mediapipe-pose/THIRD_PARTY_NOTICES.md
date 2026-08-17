# MediaPipe Pose third-party notice

This directory vendors selected runtime files from `@mediapipe/pose` version `0.5.1675469404` so the browser can load the Pose graph, model, and WebAssembly from the same GitHub Pages origin.

- Upstream project: <https://github.com/google-ai-edge/mediapipe>
- npm package: <https://www.npmjs.com/package/@mediapipe/pose/v/0.5.1675469404>
- Package license metadata: Apache-2.0
- npm tarball SHA-1: `8f81e64c6561b2357a021a134b54de0204bafc72`
- npm integrity: `sha512-DFZsNWTsSphRIZppnUCuunzBiHP2FdJXR9ehc7mMi4KG+oPaOH0Em3d6kr7Py+TSyTXC1doH88KcF28k2sBxsQ==`

Included runtime files:

- `pose.js`
- `pose_landmark_full.tflite`
- `pose_solution_packed_assets_loader.js`
- `pose_solution_packed_assets.data`
- `pose_solution_simd_wasm_bin.data`
- `pose_solution_simd_wasm_bin.js`
- `pose_solution_simd_wasm_bin.wasm`
- `pose_solution_wasm_bin.js`
- `pose_solution_wasm_bin.wasm`
- `pose_web.binarypb`
- upstream `README.md`

The lite and heavy landmark models are not included because this prototype currently fixes `modelComplexity: 1`, which uses the full model. See `LICENSE` in this directory for the Apache License 2.0 text.
