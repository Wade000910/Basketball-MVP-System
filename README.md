# Basketball Kinetic Chain Auditory Feedback System

國科會大專生研究計畫 c802 的籃球罰球動力鏈聽覺回饋原型。

## Current snapshot

- Snapshot date: **2026-06-02**
- Status: research prototype; not yet validated for training or clinical use
- Main application: [`專題程式/index.html`](./專題程式/index.html)
- Detailed status: [`docs/status-2026-06-02.md`](./docs/status-2026-06-02.md)

This snapshot replaces the earlier April camera feasibility prototype. It is preserved with an explicit date so later experimental changes can be compared against a known baseline.

## Implemented in the 2026-06-02 snapshot

- Browser camera access and MediaPipe Pose tracking
- 3D vector-based knee and elbow angle calculation
- Dynamic selection of the more visible body side
- Cascaded Butterworth low-pass filtering
- Cubic-spline reconstruction evaluated at 1 ms intervals
- Knee peak-velocity and elbow-extension onset timing estimate
- Three experiment modes: baseline, visual feedback, and auditory feedback
- One-second pre-feedback delay
- Binary Ding/Buzz auditory feedback
- Velocity chart for the visual-feedback condition
- Per-run timing history, SD/CV display, and CSV export
- MediaPipe model complexity 1 and confidence thresholds

## Important limitations

- The timing algorithm has not yet been validated against 240 fps video or motion-capture ground truth.
- Interpolation increases computational resolution; it does not create measurements that were absent from the source video.
- Session statistics are currently shared across experiment modes and must be separated before formal data collection.
- CSV rows do not yet include participant, session, condition, trial order, or camera metadata.
- The selected body side is recalculated per frame rather than locked for the full shot.
- Baseline mode may still expose timing information in the interface.
- Camera frame rate is observed but not guaranteed or recorded per trial.
- Dependencies are loaded from CDNs, so the prototype is not fully offline.
- There are no automated tests and no declared open-source license yet.

## Run locally

Open `專題程式/index.html` in a browser that permits camera access, allow camera permission, select an experiment mode, and start the system. An internet connection is currently required to load the CDN dependencies.

Do not use the generated timing values as scientific evidence until the measurement pipeline and experiment data separation have been verified.
