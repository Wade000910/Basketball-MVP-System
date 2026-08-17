# Phase 1A same-stream local capture

## Status

Build `phase1a-local-capture-v1` implements the engineering portion of Phase 1A. It has not yet passed the iPhone hands-on exit gate and is not approved for participant collection.

The first iPhone short run on 2026-08-17 recorded 1,610 presented frames over 55.31 seconds but received zero pose results. The resulting header-only trial data is retained as a failed engineering observation, not a participant result. Build `phase1a-ios-pose-startup-v2` enables analysis before camera startup, records the pose-analysis error count and a truncated last error message, and warns after five seconds when video frames arrive without pose results. This change remains unverified until the repeat short run succeeds.

The repeat B002 run preserved all eight files and recorded 1,829 presented frames over 62.284 seconds, but every one of 2,853 pose attempts failed with `Load failed`. It also exposed two data-integrity defects: Safari supplied a non-progressing zero `mediaTime` for presented-frame rows, and failed attempts were left open while being labeled as processed frames. Build `phase1a-pinned-pose-assets-v3` pins the legacy MediaPipe package and asset versions, stops retrying after the first pose error, locks each session to either `mediaTime` or advancing `video.currentTime` while retaining both raw values, closes failed inference rows with status/error fields, and separates attempts, successes, and failures in the manifest. This build also remains unverified until an iPhone repeat succeeds.

The browser uses the camera stream already opened for MediaPipe as the input to `MediaRecorder`; it does not request a second camera stream. This supports traceable replay of the source seen by the live pipeline, but it is not an independent accuracy reference.

## Session controls

Before **Start Session**, enter pseudonymous participant, session, and block IDs, select the condition, and select the shooting side. The application clears prior trial history, starts diagnostics, starts the camera, and then starts local recording from the same `MediaStream`.

Metadata controls remain locked until **Stop Session**. The application registers a `beforeunload` warning while recording, while stopping, and after stop until every generated file has been downloaded. Browsers, especially mobile lifecycle transitions, do not guarantee that this warning will always appear, so it is a secondary safeguard rather than data recovery [3].

## Local output files

Each filename contains the sanitized participant, session, and block codes:

```text
session-<participant>-<session>-<block>_source-video.<browser-format>
session-<participant>-<session>-<block>_frame-timestamps.csv
session-<participant>-<session>-<block>_inference-timestamps.csv
session-<participant>-<session>-<block>_landmarks.csv
session-<participant>-<session>-<block>_live-signals.csv
session-<participant>-<session>-<block>_live-trials.csv
session-<participant>-<session>-<block>_diagnostics.json
session-<participant>-<session>-<block>_manifest.json
```

The video extension follows the MIME type selected by `MediaRecorder.isTypeSupported()` and the recorder's actual `mimeType` [1]. Safari may choose MP4 while other browsers may choose WebM. The actual MIME type is displayed in the interface and stored in the manifest; it must not be inferred from the phone model.

The manifest binds context, build and algorithm versions, start/stop time, requested and actual camera settings, video MIME type, recording error, row counts, and the generated data-file names, sizes, and media types. Recorded chunks are collected from `dataavailable`, including the final data delivered after `stop()` [2]. Files download individually because mobile Safari may restrict multiple automatic downloads and the project does not add an unreviewed archive dependency.

## Timestamp and signal boundaries

- `frame-timestamps.csv` records browser video-presentation callbacks and media timestamps.
- `inference-timestamps.csv` records processed-frame index, source-video time, associated latest presented-frame index, inference start/end, and browser-visible duration.
- `landmarks.csv` stores all returned pose landmarks and visibility values per processed frame.
- `live-signals.csv` stores raw and live-filtered knee/elbow angles separately with side, visibility, and state.
- `live-trials.csv` stores accepted, low-quality, and automatically aborted attempts with reason codes. Operator-directed rejection is not yet implemented.

The timestamps are browser-observed clocks. They do not establish camera exposure time, physical audio onset, or measurement accuracy.

## Privacy and data handling

- No upload transport is added.
- Session files exist in browser memory until downloaded or the page is closed.
- Use pseudonymous codes only.
- Keep raw video, CSV, JSON, and manifests in the local research-data archive, not the public repository.
- The manifest is metadata, not consent for publication.

## Required hands-on test order

1. On iPhone Safari, run a 30–60 second session with two or three simulated shots.
2. Stop and download all eight files individually.
3. Confirm that the source video plays and all filenames share the same participant/session/block prefix.
4. Confirm the manifest file list and row counts match the downloaded files.
5. Run five minutes with live analysis and local recording/logging.
6. Compare that run with the existing Phase 0 analysis-only iPhone profile, reporting FPS, inference duration, long frames, heat, interruptions, and trial yield.

Do not begin the five-minute run until the short session passes without a missing video or manifest.

## Exit gate still required

- video and manifest survive a complete stop/download cycle on iPhone Safari;
- each processed frame has a source timestamp;
- all outputs share the frozen context;
- performance degradation is measured and judged;
- no file is uploaded automatically.

Passing unit tests or loading the interface does not satisfy this hands-on gate.

## Technical references

1. MDN Web Docs. `MediaRecorder` and `MediaRecorder.isTypeSupported()`. <https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder>
2. MDN Web Docs. `MediaRecorder: dataavailable event`. The documentation also warns that `timeslice` timing is not exact, so this project does not derive elapsed time from chunk count. <https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event>
3. MDN Web Docs. `Window: beforeunload event`. The event is intended to warn about unsaved data but has limited availability and mobile reliability constraints. <https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event>
