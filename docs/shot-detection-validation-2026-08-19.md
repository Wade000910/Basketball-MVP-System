# Shot-detection validation and minimal correction — 2026-08-19

## Purpose and privacy boundary

This record explains why the live shot-candidate logic changed, what evidence was reviewed, what was modified, and what remains unresolved. The source sessions, videos, extracted frames, manual timestamps, and temporary replay tooling remain private and are not part of this repository.

The work is an engineering pilot on two same-person sessions. It is not a participant study, a population accuracy estimate, or evidence that the system can judge whether shooting technique is correct.

## Problem that triggered the review

The live prototype originally entered `RECORDING` when filtered knee angle was below 155 degrees while knee angular velocity was negative enough. It then ended the candidate when an elbow rule fired or after 1500 ms. Every calculated value in the inherited 50–150 ms interval was labeled in range; values outside it were labeled out of range and could drive visual or auditory feedback.

This combined several questions that must remain separate:

1. Did a real shot occur?
2. Was the camera/pose data usable?
3. What continuous movement features were measured?
4. Did the ball enter the basket?

The literature audit found no support for using the inherited 50–150 ms interval as either a shot-occurrence rule or a universal correct/incorrect technique label. Visible ball release was therefore selected as the manual occurrence reference for this pilot.

## Evidence review

Two private sessions were compared frame by frame with their exported trial, signal, timestamp, landmark, diagnostic, and manifest files.

### Session A

- Five visible ball-release attempts.
- The original state machine exported six trials.
- All five releases were inside automatic candidate windows.
- One additional trial occurred during non-shot ball handling.
- Every candidate ended through the timeout rather than the elbow completion rule.
- One release occurred near the 1500 ms boundary.

### Session B

- Five visible ball-release attempts.
- The original state machine captured three of them.
- Five exported candidates were non-shots caused by entering or approaching the camera, bending, or dribbling.
- Two genuine shots occurred while earlier false candidates occupied timeout, feedback delay, or cooldown, so those shots were missed.
- Completed candidates again ended through the timeout rather than the elbow completion rule.

### Combined engineering sample

| Observation | Count |
| --- | ---: |
| Visible genuine releases | 10 |
| Releases captured by the original logic | 8 |
| Genuine releases missed | 2 |
| Non-shot trials created by the original logic | 6 |

These counts describe only the audited sessions and must not be generalized.

## Dual-AI review and selected correction

Codex remained the implementation and verification owner. Antigravity reviewed a sanitized statement of the evidence and recommended confirming an upper-extremity shooting action after the existing knee candidate rather than adding a ball model, relaxing cooldown, or changing several thresholds at once.

A new named state was considered but rejected as unnecessary. The selected minimum change reuses `RECORDING` as a provisional buffer:

1. The existing knee rule begins buffering as before.
2. A reset-safe Boolean starts as false.
3. The candidate becomes confirmed if either visible wrist rises above its corresponding visible shoulder during the buffer.
4. A confirmed candidate follows the existing processing, delay, feedback, export, and cooldown path.
5. An unconfirmed candidate returns directly to `IDLE` without creating a trial, playing feedback, or entering delay/cooldown.
6. If pose or torso visibility is lost, only an already confirmed candidate can be exported as aborted; an unconfirmed candidate is silently discarded.

The recording pipeline, Session exports, MediaPipe model, filters, delta-t calculation, feedback delay, cooldown, three experimental modes, and audio generation were intentionally left unchanged.

## Layered implementation and verification

### Layer 1 — arm-raise confirmation

- Added the pure `hasRaisedArm` check with visibility requirements.
- Added one confirmation flag to the existing state machine.
- Added a deterministic unit test for below-shoulder, above-shoulder, and low-visibility cases.
- Full repository regression suite passed.

Private offline replay predicted five confirmed trials in each session and prevented the six audited non-shot candidates from producing trials, feedback, or cooldown. Conservative release annotation still placed two releases at or just after the prior 1500 ms boundary, so no deployment occurred at this checkpoint.

### Layer 2 — timeout boundary

Only the candidate timeout changed, from 1500 ms to 1700 ms. No other parameter changed in this layer.

With 1700 ms, private offline replay contained all 10 manually annotated releases while the six previously audited non-shot candidates remained silent. The complete automated suite passed 19 of 19 tests, including HTML and GitHub Pages validation.

## Adversarial synthetic simulation

Before deployment, Antigravity proposed adversarial scenarios and Codex executed deterministic cases plus seven reproducible 1000-run synthetic batches. The ranges intentionally stressed timing, visibility, and sampling boundaries; they are engineering inputs, not human-performance distributions.

| Synthetic batch | Result |
| --- | --- |
| Ordinary in-window shots | 1000/1000 confirmed |
| Slow shots near or beyond the boundary | 286/1000 confirmed |
| Dribble/bend without an arm raise | 0/1000 confirmed |
| Hand raise, overhead pass, or pump fake with matching proxy geometry | 1000/1000 confirmed |
| Occluded true shots below the visibility requirement | 0/1000 confirmed |
| Severe dropped-frame/timestamp stress | 584/1000 confirmed |
| Dribble candidate followed by a genuine shot across the reset boundary | 815/1000 captured; 185/1000 missed |

The deterministic cases behaved according to the implemented rule. The randomized results expose the rule's intended operating envelope and its architectural limits; they are not accuracy metrics.

## Known limitations

- MediaPipe Pose does not detect the basketball or actual separation between ball and hand.
- A pump fake, overhead pass, or other knee-plus-raised-arm action can satisfy the proxy without a release.
- A shallow/no-knee shot can fail to start a candidate.
- A slow shot can exceed the fixed window.
- Wrist/shoulder occlusion or severe frame loss can prevent confirmation.
- A real shot beginning just before an unconfirmed candidate resets can cross the boundary and be missed.
- The arm-height relationship is a shot-candidate confirmation only. It is not a literature-derived definition of standard technique.
- The 50–150 ms interval remains unvalidated and must not be interpreted as a universal correct/incorrect rule.

Solving the release/fake/pass ambiguity requires ball detection or another independently validated release signal. That would be a separate, larger change and was intentionally excluded from this patch.

## Deployment gate and next hands-on test

Deployment makes this engineering candidate available for a short iPhone regression; it does not authorize participant collection.

The next test is deliberately small:

1. Perform three non-shot actions such as holding, dribbling, or bending without shooting. Expected: zero trials and zero feedback sounds.
2. Perform five normal shots. Expected: five trials and five feedback sounds.
3. Record missing, duplicate, or early feedback and whether every source video/export file downloads successfully.
4. Stop and retain the Session if behavior differs; do not tune multiple parameters during the same test.

Only after this hands-on gate should the project decide whether another isolated correction is necessary.
