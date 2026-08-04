# Phase 0 device diagnostics

## Status

The public application includes the first Phase 0 diagnostic collector. It measures browser-visible camera and processing behavior locally and exports a sanitized JSON profile. This implementation does not complete the Phase 0 exit gate by itself; the OPPO, iPhone 15 Pro, and TUF device runs still need to be performed and reviewed.

Public test entry: <https://wade000910.github.io/Basketball-MVP-System/>

## What is measured

- semantic public build ID;
- coarse browser family/major version and OS family/major version;
- viewport size, orientation, and device-pixel ratio;
- requested camera width, height, and facing mode;
- browser-reported actual width, height, frame rate, facing mode, aspect ratio, and resize mode;
- video-frame interval distribution;
- calculated mean FPS;
- complete `pose.send()` duration distribution;
- presented-frame and pose-result counts;
- long-frame count and rate;
- AudioContext sample rate;
- diagnostic start, export time, and duration.

Frame statistics use `HTMLVideoElement.requestVideoFrameCallback()` where available because it follows video presentation rather than display refresh. Older browsers fall back to `requestAnimationFrame()` while counting only changes in `video.currentTime`. The fallback mode is written into the export and must not be treated as equivalent without comparison.

Performance intervals use `performance.now()`, a monotonic clock intended for elapsed-time measurement. Browser privacy protections may reduce timer precision, so the report emphasizes distributions rather than a single duration.

Camera values come from `MediaStreamTrack.getSettings()` after capture begins. A reported `frameRate` is retained as a browser/track setting; measured frame intervals remain the primary observed performance evidence.

## Summary definitions

For non-negative finite samples, the collector reports count, mean, median, P90, P95, minimum, maximum, and population standard deviation.

A long video frame is currently defined as an observed interval greater than twice the browser-reported target interval. When target frame rate is unavailable, twice the measured median interval is used. This is a Phase 0 diagnostic flag, not an exclusion rule for the later study.

The measured inference duration surrounds the asynchronous `pose.send()` call. It represents the browser-visible duration of the current pose-processing request, not isolated neural-network execution on a dedicated hardware clock.

## Privacy design

The downloadable JSON is constructed with an explicit allowlist. It excludes:

- `deviceId`;
- `groupId`;
- camera or microphone labels;
- IP address;
- full user-agent string;
- cookies, local-storage IDs, and persistent identifiers;
- participant, session, and trial records.

The application does not automatically upload the report. Download uses an in-browser Blob URL. Operators must inspect files before sharing and must not add device profiles containing personal notes to the public repository.

## How to run a device check

1. Open the public test site on the device and enter the application.
2. Start the camera and allow permission.
3. Keep the complete body in view and let diagnostics run for at least five minutes for the formal Phase 0 device check.
   - Leave **Show diagnostic skeleton** enabled while positioning the phone and confirming pose detection. The overlay appears only while the system is idle or cooling down and is hidden during an active movement trial.
   - Use the zoom slider only when the page reports a supported hardware range. Unsupported browser/camera combinations disable the control instead of applying a display-only crop.
4. Note orientation, lighting, heating, permission issues, camera selection, and any visible slowdown separately without recording personal details.
5. Stop the system.
6. Select **下載診斷 JSON**.
7. Review the JSON locally before sharing it.
8. Repeat once in the alternative orientation if that orientation may be supported.

The diagnostic JSON records technical behavior only. It does not establish pose accuracy, event accuracy, audio-output latency, or scientific validity.

## Device decision record

After the three available devices are tested, add a reviewed decision record containing:

- exact device model and OS/browser versions supplied manually by the owner;
- diagnostic build ID;
- test duration and orientation;
- camera resolution and measured FPS distribution;
- inference-duration distribution and long-frame rate;
- thermal or stability observations;
- whether the device can serve as live-analysis, high-frame-rate reference, or offline-replay hardware;
- reasons for the final role assignment.

Do not commit raw device JSON automatically. First scan it for identifiers and include only the minimum technical evidence required.

## Technical references

- [MDN: MediaStreamTrack.getSettings()](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)
- [MDN: MediaStreamTrack.getCapabilities()](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities)
- [MDN: MediaStreamTrack.applyConstraints()](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints)
- [MDN: MediaTrackSettings and identifier fields](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings)
- [MDN: HTMLVideoElement.requestVideoFrameCallback()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [MDN: High precision timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing)
- [MDN: BaseAudioContext.sampleRate](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate)
