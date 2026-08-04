# Sources, provenance, and claim boundaries

This file records why a design choice exists, where external ideas or libraries came from, and what remains unvalidated. A citation documents context; it does **not** prove that this implementation is valid.

## Project status

The related NSTC undergraduate research proposal, application `115CFD2200044`, was not approved. Continued development in this repository is independent and is not evidence of NSTC approval, funding, or endorsement. `c802` is retained only as the project's historical internal identifier.

## Traceability matrix

| Implementation item | What changed here | Source or prior project | What the source supports | Validation still required |
| --- | --- | --- | --- | --- |
| Terminal binary auditory feedback | The existing Ding/Buzz condition remains, with an explicit one-second delay | Salmoni, Schmidt, and Walter (1984), DOI [10.1037/0033-2909.95.3.355](https://doi.org/10.1037/0033-2909.95.3.355); Sigrist et al. (2013), DOI [10.3758/s13423-012-0333-8](https://doi.org/10.3758/s13423-012-0333-8) | Augmented feedback, its timing, and the distinction between temporary performance and learning must be controlled experimentally | These sources do not establish that one second, binary sound, or this task is optimal |
| Baseline blinding | Delta-t, outcome, live joint angles, SD, and CV are hidden in baseline mode | Same motor-learning sources above | A no-feedback comparison must not accidentally receive knowledge of results or performance | Protocol review and browser-level UI/audio tests |
| Knee-to-elbow sequencing | The prototype continues to estimate the interval between knee peak extension velocity and elbow extension onset | Templin et al. (2024), [ISBS Proceedings](https://commons.nmu.edu/isbs/vol42/iss1/93/); Okazaki and Rodacki (2012), [PubMed Central](https://pmc.ncbi.nlm.nih.gov/articles/PMC3588685/) | Basketball shooting involves coordinated lower- and upper-extremity kinematics; sequencing is a legitimate research variable | Neither paper validates this event definition or the universal 50–150 ms band |
| On-device pose landmarks | The existing prototype uses MediaPipe Pose | Bazarevsky et al. (2020), [BlazePose paper](https://arxiv.org/abs/2006.10204); [MediaPipe GitHub repository](https://github.com/google-ai-edge/mediapipe) | BlazePose was designed for real-time body landmark tracking and provides 33 landmarks | Compare detected events against independently annotated high-frame-rate video or motion capture for this task and camera geometry |
| Per-shot side lock | The researcher selects the shooting side; it is locked from shot start to completion | Engineering correction derived from the 2026-06-02 snapshot review; no external code copied | Prevents a left/right landmark discontinuity inside one trial | Test occlusion and incorrect-side scenarios |
| Cubic-spline reconstruction and cascaded Butterworth filter | Preserved from the archived 2026-06-02 implementation | Historical project code only; no third-party implementation copied | Produces a smooth reconstructed curve for event detection | Interpolation does not create new source measurements. Cutoff, phase delay, event timing, and numerical stability require validation |
| Per-block statistics and trial metadata | Statistics are restricted by participant + session + block + condition; CSV records context and quality fields | Engineering correction derived from the archival review | Prevents accidental pooling across experimental conditions and improves auditability | Confirm the final protocol's required identifiers before enrollment |

## Software dependencies and GitHub provenance

The project loads these libraries from public CDNs. No source code was copied from the repositories into the project in this change.

- [Google MediaPipe](https://github.com/google-ai-edge/mediapipe), Apache-2.0. Used for camera utilities, pose inference, and landmark drawing.
- [Chart.js](https://github.com/chartjs/Chart.js), MIT. Used to render the velocity chart.
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss), MIT. Used through the browser CDN for interface styling.

The CDN URLs are currently unpinned and the application still requires a network connection. Dependency pinning, notices, offline packaging, and the repository's own license remain release-readiness work.

## Claims that remain hypotheses

- Auditory feedback improves free-throw accuracy, retention, consistency, or cognitive load.
- A one-second delay is better than other delay intervals.
- A 50–150 ms knee-to-elbow interval is universally desirable.
- MediaPipe timing is interchangeable with high-speed video, inertial sensors, or motion capture.
- Values are comparable across devices, camera positions, frame rates, and participants without calibration.

## Citation policy

- Cite primary papers or authoritative repositories near the claim they support.
- Label inherited project choices separately from literature-derived decisions.
- Record copied or adapted code at function/file level with repository URL, commit or release, file path, and license. No copied/adapted third-party code was introduced in this change.
- Do not describe a design rationale as experimental evidence.
