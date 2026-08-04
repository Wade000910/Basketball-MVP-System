# Experiment-readiness v1 changes

## Implemented

- Added required participant, session, block, and shooting-side inputs before a trial can begin.
- Locked the selected shooting side for the complete shot.
- Isolated SD/CV calculations by participant, session, block, and condition.
- Hid delta-t, outcome, live joint angles, SD, and CV in baseline mode.
- Added condition, trial order, ISO timestamp, side, source frame count, measured FPS, mean landmark visibility, quality flags, algorithm version, and the unvalidated target-range label to CSV rows.
- Replaced data-URI CSV export with UTF-8 Blob export and standards-compliant field escaping.
- Added shared pure functions and deterministic Node tests for statistics, block isolation, quality flags, and CSV escaping.

## Intentionally unchanged

- The 10 Hz cascaded Butterworth configuration.
- Cubic-spline evaluation at one-millisecond steps.
- Knee peak-velocity and elbow-onset event definitions.
- The one-second feedback delay.
- The 50–150 ms target interval.

These are preserved as research parameters, not validated constants.

## Not ready for participant collection

This version improves internal data integrity but is not experiment-ready until the measurement pipeline is compared with independently annotated high-frame-rate recordings or motion capture, the protocol and metadata schema are frozen, browser/device behavior is tested, and the dependency/license plan is resolved.

See [SOURCES.md](./SOURCES.md) for literature, GitHub provenance, licenses, and claim boundaries.
