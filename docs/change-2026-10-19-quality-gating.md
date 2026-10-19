# Quality-gated feedback and statistics — 2026-10-19

## Change

- A trial now receives feedback and enters block statistics only when both the estimated pose-result callback rate and mean landmark visibility are available and pass the existing 24 Hz / 0.70 thresholds.
- A finite timing result from a low-quality trial is retained for audit, marked `low_quality` / `not_evaluated_low_quality`, and does not produce sound or a correctness-style result.
- Standard deviation is unavailable until there are at least two accepted finite trials. The coefficient of variation is hidden as not applicable because signed timing differences can be zero or negative; no absolute-value convention has been validated.
- Feedback wording calls 50–150 ms a candidate range and an unvalidated research target. It makes no claim that this is a validated optimum or a correct-shot criterion.
- The CSV key `measuredFps` is retained for compatibility. It records the rate of pose-result callbacks during the trial, not the camera sensor's capture FPS. This remains an engineering proxy, not a validated device measurement.
- The session algorithm identifier is now `timing-validity-v3`.

## Verification

- `npm.cmd test`: 38/38 Node tests passed.
- Inline HTML and GitHub Pages landing-page validators passed.
- Added coverage for unavailable quality measurements, undefined single-sample SD, exclusion of low-quality timing from feedback/statistics, and zero-valued valid timing.

## Limits

This is a software integrity correction. It does not validate the thresholds, event timing accuracy, the 50–150 ms range, or training benefit. Physical device tests and participant/efficacy work remain outside this change. Full-text review of every citation in the original proposal is also not complete; see the local literature audit and do not represent unresolved references as verified.
