# Phase 0 device diagnostics

## Status

The Phase 0 diagnostic engineering checklist and first five-minute runs are complete. The iPhone is provisionally selected for the October live-analysis path. Phase 0 remains open for later participant validation because the independent high-frame-rate reference arrangement is unresolved.

Public test entry: <https://wade000910.github.io/Basketball-MVP-System/>

## Confirmed device inventory

| Device | Confirmed non-identifying specification | Still required |
| --- | --- | --- |
| ASUS TUF Gaming F15 FX507ZV4 | Intel Core i7-12700H; 16 GB-class RAM; NVIDIA GeForce RTX 4060 Laptop GPU and Intel UHD Graphics; Windows 11 Home 64-bit, build 26200 | Offline-replay benchmark in Phase 1B |
| Samsung Galaxy A60 | Android 10; Chrome 127; first portrait five-minute diagnostic complete | Investigate the interruption, empty camera settings, diagnostic/trial FPS disagreement, and whether any non-live role is useful |
| iPhone 15 Pro | iOS 18; Safari 26; first portrait five-minute diagnostic complete; Apple specifies 1080p slow motion at 120 or 240 fps | Confirm the later independent-reference architecture and investigate the single extreme inference-duration outlier |

The previously documented OPPO phone was an incorrect assumption and has been replaced by the confirmed Samsung Galaxy A60. No serial number, device ID, local account, or other persistent identifier is recorded.

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

### First phone runs — 2026-08-06

Only sanitized aggregates are recorded here. Raw JSON and CSV files remain local and are not committed.

| Item | Samsung Galaxy A60 | iPhone 15 Pro |
| --- | --- | --- |
| Diagnostic duration | 329.86 s | 341.48 s |
| Orientation | Portrait | Portrait |
| Browser / OS | Chrome 127 / Android 10 | Safari 26 / iOS 18 |
| Actual camera settings | Not returned | 480×640 at reported 30 fps |
| Diagnostic calculated mean FPS | 2.82 | 26.04 |
| Trial-level observed FPS | Approximately 7–9; all rows flagged `LOW_FPS` | Approximately 24–30; mixed `OK` and threshold-edge `LOW_FPS` flags |
| Inference median / P95 | 113.2 / 134.56 ms | 29 / 31 ms |
| Long frames | 0 under a fallback threshold derived without reported camera FPS | 2 (0.02%) |
| Thermal observation | No noticeable heat | Slight heat |
| Visible behavior | Obvious lag, occasional skeleton loss, eventual interruption | No visible lag, occasional skeleton loss, no crash or camera interruption |

Interpretation boundaries:

- The A60 CSV includes rows timestamped before the exported diagnostic start, so its trial count is not treated as a matched five-minute session count.
- The A60 diagnostic FPS and trial-level FPS disagree and its actual camera settings are empty. Preserve these discrepancies; do not average them into one performance value.
- The iPhone recorded one 4422 ms maximum inference duration despite a 29 ms median and 31 ms P95. Preserve the outlier and investigate lifecycle, startup, or scheduling causes.
- Trial `deltaT` values and in-range labels are not accuracy evidence. The scripted movements triggered more trials than intended, confirming that event validation remains necessary.

Decision:

- Use the iPhone 15 Pro as the provisional October live-analysis phone.
- Do not use the Galaxy A60 as the current live-analysis phone.
- Apple confirms that the iPhone 15 Pro supports 1080p slow motion at 120 or 240 fps, so it can serve as a high-frame-rate consumer-phone reference camera in a separate capture role [1]. It cannot simultaneously run the Safari camera pipeline and native slow-motion capture.
- Keep the later dual-phone reference architecture unresolved rather than assigning unsupported capability to the A60.

The decision above establishes an October engineering role, not pose accuracy, event validity, participant readiness, or intervention efficacy.

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

1. Apple Support. iPhone 15 Pro — Technical Specifications. Slow-motion video support: 1080p at 120 fps or 240 fps. <https://support.apple.com/zh-tw/111829>

- [MDN: MediaStreamTrack.getSettings()](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)
- [MDN: MediaStreamTrack.getCapabilities()](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities)
- [MDN: MediaStreamTrack.applyConstraints()](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints)
- [MDN: MediaTrackSettings and identifier fields](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings)
- [MDN: HTMLVideoElement.requestVideoFrameCallback()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [MDN: High precision timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing)
- [MDN: BaseAudioContext.sampleRate](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate)
