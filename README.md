# Basketball Kinetic Chain Auditory Feedback System

籃球罰球動力鏈聽覺回饋研究原型，內部名稱為 c802。

> **計畫狀態澄清：** 本專案曾以國科會大專學生研究計畫申請案編號 `115CFD2200044` 提出申請，但未獲通過。本 repository 是後續獨立延續的研究軟體，不代表國科會核准、補助或背書。

## Public test site

- Stable test URL: <https://wade000910.github.io/Basketball-MVP-System/>
- Device and privacy checklist: [`docs/testing-on-github-pages.md`](./docs/testing-on-github-pages.md)

The test site follows the latest reviewed version merged to `main`. It demonstrates software operability only and is not a validated participant-data-collection system.

## Development roadmap

- Ordered low-cost validation plan using the available ASUS TUF Gaming F15, iPhone 15 Pro, and Samsung Galaxy A60: [`ROADMAP.md`](./ROADMAP.md)

Development must follow the roadmap gates in order. Phase 0 diagnostic engineering is complete, but its hands-on device tests and exit gate remain open. Phase 1A same-phone live analysis plus local source-video/data capture begins only after that gate is reviewed.

Phase 0 implementation and device-test instructions: [`docs/phase0-device-diagnostics.md`](./docs/phase0-device-diagnostics.md)

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

## Experiment-readiness development

Development after the archived snapshot is tracked separately. The first data-integrity pass adds experimental identifiers, per-block/per-condition statistics, shot-level side locking, baseline blinding, richer CSV metadata, quality flags, and deterministic tests.

- Change record: [`docs/experiment-readiness-v1.md`](./docs/experiment-readiness-v1.md)
- Literature and GitHub provenance: [`docs/SOURCES.md`](./docs/SOURCES.md)
- Revised method responding to proposal reviews: [`docs/revised-method-after-review.md`](./docs/revised-method-after-review.md)
- Archived historical snapshot: tag `archive/c802-prototype-20260602`

The original timing events, filter configuration, one-second delay, and 50–150 ms band remain unvalidated research parameters. This development version is still **not approved for participant data collection**.

Run the zero-dependency checks with Node.js:

```bash
npm test
```
