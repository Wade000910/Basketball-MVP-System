# Experiment-readiness v1 changes

## Implemented

- Added required participant, session, block, and shooting-side inputs before a trial can begin.
- Locked the selected shooting side for the complete shot.
- Isolated SD/CV calculations by participant, session, block, and condition.
- Hid delta-t, outcome, live joint angles, SD, and CV in baseline mode.
- Added condition, trial order, ISO timestamp, side, source frame count, measured FPS, mean landmark visibility, quality flags, algorithm version, and the unvalidated target-range label to CSV rows.
- Replaced data-URI CSV export with UTF-8 Blob export and standards-compliant field escaping.
- Added shared pure functions and deterministic Node tests for statistics, block isolation, quality flags, and CSV escaping.
- Added a provisional arm-raise confirmation to the existing capture buffer. A knee-triggered candidate must contain a visible wrist above its corresponding shoulder before it can create a trial, feedback, delay, or cooldown. Unconfirmed candidates return silently to `IDLE`.
- Extended only the capture timeout from 1500 ms to 1700 ms after private offline replay placed two manually annotated releases at the prior boundary. The two-session engineering replay contained all 10 annotated releases with the revised timeout while suppressing the six previously audited non-shot trials.

## Intentionally unchanged

- The 10 Hz cascaded Butterworth configuration.
- Cubic-spline evaluation at one-millisecond steps.
- Knee peak-velocity and elbow-onset event definitions.
- The one-second feedback delay.
- The 50–150 ms target interval.

These are preserved as research parameters, not validated constants. The target interval must not be used to decide whether a shot occurred or to assign a scientifically meaningful `correct/incorrect` label. The current Ding/Buzz behavior is therefore an audio-path engineering test until a feedback target is independently justified.

The arm-raise confirmation and 1700 ms timeout are engineering settings supported only by a small, same-person, two-session replay. They do not detect the ball, establish general sensitivity or specificity, or replace visible ball release as validation ground truth. A hands-on phone regression remains required before deployment.

## Not ready for participant collection

This version improves internal data integrity but is not experiment-ready until the measurement pipeline is compared with independently annotated high-frame-rate recordings or motion capture, the protocol and metadata schema are frozen, browser/device behavior is tested, and the dependency/license plan is resolved.

See [SOURCES.md](./SOURCES.md) for literature, GitHub provenance, licenses, and claim boundaries.

See [Shooting-event and technique-claim audit](./shooting-claim-audit.md) for the separation of shot occurrence, data quality, technique characterization, and shot outcome.
