// The ball-detection model the camera option uses. No model is shipped: the general YOLOX-Nano model from the
// COCO project found the ball in 0 of 5 real free-throw photos (see docs/camera-detection-trial-2026-11-21.md),
// so the option stays switched off. Put a model that was trained on basketballs and validated on real video at
// ./models/<name>.onnx, set it here (YOLOX output layout, class 32 = ball; see yolox.js), and the option appears.
globalThis.ShootCameraModel=null;
