# Basketball Kinetic Chain Auditory Feedback System

籃球罰球動力鏈聽覺回饋研究原型，內部名稱為 c802。

> **計畫狀態澄清：** 本專案曾提出國科會大專學生研究計畫申請，但未獲通過。本 repository 是後續獨立延續的研究軟體，不代表國科會核准、補助或背書。公開版本不保存原始申請書或申請編號。

## Public test site

- Stable test URL: <https://wade000910.github.io/Basketball-MVP-System/>
- Device and privacy checklist: [`docs/testing-on-github-pages.md`](./docs/testing-on-github-pages.md)

The test site follows the latest reviewed version merged to `main`. It demonstrates software operability only and is not a validated participant-data-collection system.

## Development roadmap

- Ordered low-cost validation plan using the available ASUS TUF Gaming F15, iPhone 15 Pro, and Samsung Galaxy A60: [`ROADMAP.md`](./ROADMAP.md)
- October 2026 presentation-first scope, reordered execution queue, current audio hardware, claim limits, and references: [`docs/october-2026-presentation-plan.md`](./docs/october-2026-presentation-plan.md)

The October deliverable is a working prototype with preliminary engineering and measurement evidence, not a completed participant efficacy study. The fixed equipment is one iPhone 15 Pro, one Samsung Galaxy A60, one ASUS TUF laptop, the phone speaker, and AirPods Pro 2; no additional measurement device is assumed. Before the presentation, prioritize hands-on device diagnostics, a stable demonstration build, same-stream recording/data export, a minimal TUF replay comparison, a small camera-placement pilot, and preliminary phone-speaker/AirPods Pro 2 latency characterization. Full tuning and participant testing follow the validation and ethics gates after the presentation.

Phase 0 implementation and device-test instructions: [`docs/phase0-device-diagnostics.md`](./docs/phase0-device-diagnostics.md)

Phase 1A same-stream local recording, output files, privacy boundaries, and iPhone test procedure: [`docs/phase1a-local-capture.md`](./docs/phase1a-local-capture.md)

Sanitized iPhone engineering results and unresolved gates from 2026-08-17: [`docs/test-log-2026-08-17.md`](./docs/test-log-2026-08-17.md)

GitHub Pages 503/429 deployment failures, recovery evidence, and the repeatable response procedure: [`docs/github-pages-incidents-2026-08.md`](./docs/github-pages-incidents-2026-08.md)

## Current state

- Current engineering date: **2026-08-17**
- Status: research prototype; not yet validated for training or clinical use
- Main application: [`專題程式/index.html`](./專題程式/index.html)
- Archived 2026-06-02 status: [`docs/status-2026-06-02.md`](./docs/status-2026-06-02.md)

The June snapshot is preserved for comparison. The active implementation now adds frozen experiment context, per-condition statistics, local same-stream recording, frame/inference timestamps, landmarks and signals, quality flags, baseline masking, self-hosted MediaPipe Pose assets, deterministic tests, and an iOS audio-unlock diagnostic control.

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

- The timing algorithm has not yet been validated on separately recorded iPhone 120/240 fps sessions or against motion-capture ground truth; the available equipment cannot produce simultaneous live analysis and native slow-motion recording of the same shot.
- Interpolation increases computational resolution; it does not create measurements that were absent from the source video.
- The browser audio branch can reach its feedback state, but physical phone-speaker and AirPods output still requires hands-on verification with build `phase1a-audio-unlock-v6`.
- A low-quality trial may currently reach the auditory feedback path before its quality flag is finalized.
- CV is not yet guarded against a zero or negative signed mean delta-t.
- Camera frame rate is observed rather than guaranteed; long stalls and low-FPS trials must remain visible in the evidence.
- MediaPipe Pose assets are self-hosted, but presentation libraries still use CDNs, so the prototype is not fully offline.
- Deterministic software tests exist, but there is no declared open-source license yet.

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
