# Low-cost validation and development roadmap

## Purpose

This roadmap defines the required order for continuing Basketball-MVP-System with the hardware currently available:

- one ASUS TUF Gaming F15 FX507ZV4 computer;
- one iPhone 15 Pro;
- one Samsung Galaxy A60;
- phone speakers and one pair of AirPods Pro 2;
- the existing phone support used for repeatable placement;
- no additional purchased or borrowed camera, sensor, audio analyzer, or optical motion-capture system.

The project will use consumer devices for engineering and low-cost validation. iPhone slow-motion video may be described as **high-frame-rate consumer-phone reference video**, not motion-capture ground truth.

Complete the phases in order. A later phase cannot be treated as valid merely because its interface is available. Each phase has an explicit exit gate.

## Shared rules for every phase

- Work on a feature branch and merge through a reviewed Pull Request.
- Run relevant automated and static tests.
- Review citations, licenses, attribution, and claims.
- Scan changed files for credentials and unnecessary personal data before commit, push, and merge.
- Publish only reviewed `main` builds to the stable [GitHub Pages test site](https://wade000910.github.io/Basketball-MVP-System/).
- Keep recordings, participant files, CSV exports, and consent materials out of the public repository.
- Use pseudonymous IDs such as `P001`; never put names, student numbers, email addresses, or phone numbers in test data.
- Preserve raw observations separately from processed and reconstructed values.
- Record the Git commit and algorithm version with every exported session.
- Do not start formal participant collection until the measurement and protocol gates are complete.

## Evidence retention and publication layers

Completed measurements are append-only research records: later interpretations may correct or qualify them, but the original values, anomalies, device context, and failure observations must not be silently replaced or deleted.

| Layer | Contents | Storage rule |
| --- | --- | --- |
| Private raw | Source videos, exported CSV/JSON, manifests, consent records, and any identity-code key | Store locally or in access-controlled private storage; never commit to the public repository |
| Controlled derived | Landmarks, annotations, replay outputs, processed signals, and shot-level comparisons | Keep private by default; release only after de-identification, provenance review, and a specific publication decision |
| Public summary | Sanitized aggregate measurements, methods, device roles, uncertainty, failures, limitations, and analysis code | May be committed after privacy, license, and claim review |

The existing Phase 0 aggregate observations remain part of the public technical record. Their discrepancies and outliers must remain visible, including the Galaxy A60 FPS disagreement and interruption and the iPhone inference-duration outlier.

## Hardware roles

| Device | Initial role | Alternative role | Important limitation |
| --- | --- | --- | --- |
| Samsung Galaxy A60 | Secondary engineering device and coarse external observer for the flash/audio calibration setup | Ordinary-rate setup recording only after a separate check | Android 10 / Chrome 127 showed obvious lag, eventual interruption, and roughly 7–9 trial FPS; it is not the live-analysis or high-frame-rate reference device |
| iPhone 15 Pro | Provisional live-analysis device in Safari | Native 1080p/120 or 240 fps consumer-phone reference recording in a separate session | Safari live analysis and native slow-motion capture cannot use the camera simultaneously; the two validation paths are intentionally separated |
| ASUS TUF Gaming F15 FX507ZV4 | Offline replay, manual annotation, comparison, reporting, and repository development | Local inspection of Galaxy A60 calibration recordings | Results must remain linked to their source session and must not be represented as a simultaneous independent live reference |
| Phone speaker | Primary auditory-output path for engineering characterization | Presentation fallback output | Physical onset latency and outdoor audibility remain to be measured |
| AirPods Pro 2 | Separate Bluetooth comparison path | Possible later study output only if justified | Not bone conduction; latency, jitter, connection reliability, and usability must be measured on the selected phone |

These roles are frozen around the available equipment. There is no bone-conduction headset, second high-performance phone, laboratory camera, or requirement to purchase or borrow one.

---

## Phase 0 — Device inventory and architecture freeze

### Goal

Determine what the available devices can actually capture and process before designing around assumed specifications.

### Engineering work

- [x] Add a device-diagnostics view to the GitHub Pages application.
- [x] Record browser user agent, OS/browser version where exposed, viewport, screen orientation, requested camera constraints, actual video width/height, measured FPS, and audio context sample rate.
- [x] Record MediaPipe inference duration and long-frame counts during a short diagnostic run.
- [x] Add a downloadable, non-identifying device profile.
- [x] Display the current Git commit or public build identifier.

### Hands-on work

- [x] Record the exact ASUS TUF model/specifications relevant to analysis.
- [x] Record the Samsung Galaxy A60 Android version and Chrome version.
- [x] Record the iPhone model, iOS version, Safari version, and supported slow-motion modes from the device or Apple specification.
- [x] Run a five-minute camera/pose diagnostic on each supported browser.
- [x] Note overheating, throttling, permission failures, orientation problems, and camera-selection behavior.

### Outputs

- `device-profile-<device-code>.json`
- A short device decision record that assigns the live-analysis, separate high-frame-rate, replay, and coarse calibration-observer roles.
- Baseline FPS, inference-duration, and thermal observations.

### Exit gate

- The live-analysis phone can run the current pose pipeline for five minutes without a crash.
- Actual resolution, FPS distribution, inference duration, browser, and OS are recorded.
- The iPhone native high-frame-rate mode is confirmed for a separate offline-validation session.
- Device roles are frozen for the next phases.

### Current gate decision

- The iPhone passes the five-minute stability gate for the October live-analysis path.
- The Galaxy A60 does not pass the current live-analysis gate because of obvious lag and eventual interruption.
- The iPhone is also the only available high-frame-rate camera. Live Safari analysis and native slow-motion validation are therefore separate experiments, not synchronized views of the same shot.
- This fixed-equipment design cannot establish simultaneous live-versus-independent-reference accuracy. That limitation remains explicit through all later phases.

### Not established by this phase

Pose accuracy, event accuracy, audio latency, training benefit, or participant readiness.

---

## Phase 1A — Single-phone dual-path capture

### Goal

Use one camera stream simultaneously for live MediaPipe analysis and local source-video recording.

### Engineering work

- [x] Feed the same `MediaStream` to the live pose pipeline and `MediaRecorder`.
- [x] Record the actual MIME type and codec selected by the browser.
- [x] Implement explicit Start Session and Stop Session controls.
- [x] Freeze participant code, session, block, condition, shooting side, and build version while recording.
- [x] Save per-frame source timestamps and pose-inference completion timestamps.
- [x] Save all required MediaPipe landmarks and visibility values per processed frame.
- [x] Save raw joint angles separately from filtered/reconstructed signals.
- [x] Preserve accepted, aborted, and low-quality shots with reason codes; explicit operator rejection remains later workflow work.
- [x] Prevent accidental navigation or refresh while an unsaved recording exists.

### Local session package

```text
session-<participant>-<session>/
├── source-video.<browser-format>
├── frame-timestamps.csv
├── inference-timestamps.csv
├── landmarks.csv
├── live-signals.csv
├── live-trials.csv
├── diagnostics.json
└── manifest.json
```

The initial browser implementation may download these files individually if reliable archive generation would require an unreviewed dependency. The manifest must still bind them to one session.

Engineering implementation is complete in build `phase1a-local-capture-v1`; the Phase 1A exit gate remains open until the iPhone short capture and five-minute comparison runs are completed and reviewed.

### Performance comparison

Measure both configurations on the live phone:

1. live analysis only;
2. live analysis plus recording and data logging.

Compare FPS, inference duration, long frames, temperature observations, valid-shot yield, and browser stability.

### Exit gate

- One session can be stopped and downloaded without losing the source video or manifest.
- Every processed frame can be associated with a source timestamp.
- The same session ID appears in every exported file.
- Recording plus analysis does not produce an unreported failure or unacceptable degradation; any degradation is quantified.
- No file is uploaded automatically.

### Not established by this phase

The recorded video is not an independent reference. Live-versus-recorded comparison measures reproducibility and performance effects, not absolute measurement validity.

---

## Phase 1B — Offline replay on the TUF computer

### Goal

Re-run an exported source video deterministically and compare it with the result calculated live on the phone.

### Engineering work

- [ ] Add a local replay page or script that accepts a session manifest and source video.
- [ ] Process video frames in timestamp order without real-time deadlines.
- [ ] Save replay landmarks, raw angles, processed signals, detected events, and trials.
- [ ] Record replay software version, parameters, device, and runtime.
- [ ] Add live-versus-replay comparison by trial and event.
- [ ] Detect missing or duplicated frames and unmatched trials.
- [ ] Allow algorithm versions or parameter sets to be compared without overwriting prior results.

### Outputs

```text
├── replay-landmarks.csv
├── replay-signals.csv
├── replay-trials.csv
├── live-vs-replay.csv
└── replay-manifest.json
```

### Exit gate

- Replaying the same file twice with the same version and parameters gives the same result within explicitly documented numerical tolerance.
- Live and replay trials are matched by timestamps rather than row order alone.
- Differences in event time and `deltaT` are reported rather than silently replaced.
- Original live files remain unchanged.

### Not established by this phase

Agreement between live and replay cannot prove that either one matches true human motion; both share the same source video and pose model.

---

## Phase 1C — Processing and audio-latency characterization

### Goal

Measure where time is spent from frame processing through scheduled feedback and physical sound output.

### Engineering work

- [ ] Record frame arrival, inference completion, event decision, feedback scheduling, and expected audio-start timestamps with a monotonic clock.
- [ ] Store configured terminal-feedback delay separately from processing delay.
- [ ] Add a calibration mode that produces a visible flash and a short test sound.
- [ ] Provide repeated trials rather than a single latency reading.
- [ ] Export latency diagnostics without mixing them with efficacy outcomes.

### Physical measurement

- [ ] On the iPhone calibration page, generate a visible flash and sound command from the same trial while the selected output path is active.
- [ ] Place one AirPod near the Galaxy A60 microphone and record the iPhone display plus physical output; use the same geometry for the phone-speaker path.
- [ ] Disable AirPods automatic ear detection for the bench test, confirm that iOS remains routed to AirPods, and restore the user's setting afterward.
- [ ] Use a fixed, documented, clearly detectable volume that does not clip the A60 recording; do not require maximum listening volume.
- [ ] Use the same short, sharp-onset calibration sound for both output paths.
- [ ] Inspect the recording on the TUF and estimate the interval between the first visible flash frame and physical sound onset in the audio waveform.
- [ ] Test phone speaker first.
- [ ] Test AirPods Pro 2 separately as the available Bluetooth path; do not describe them as bone conduction.
- [ ] Record median, range/percentiles, maximum, missing output, and jitter for each path.
- [ ] Report the Galaxy A60 frame-period uncertainty and call the result a low-cost end-to-end estimate rather than millisecond-precision instrumentation.
- [ ] Preserve original A60 media timestamps. If a constant-frame-rate viewing copy is generated, never use its synthesized frame numbers as original capture timestamps.
- [ ] Treat absolute values as uncalibrated proxy latency and emphasize the repeated AirPods-minus-speaker difference obtained with the same observer setup; the shared A/V capture bias is not assumed to cancel perfectly.

### Exit gate

- Software-stage latency is available per trial.
- Physical output latency has repeated observations for every candidate audio path.
- The selected test output and any exclusion threshold are justified by measured results, not codec marketing.
- The one-second configured delay is not confused with total end-to-end delay.
- The report includes the observer-device resolution, FPS, audio format where available, and the resulting timing uncertainty.

---

## Phase 2A — Camera-placement pilot

### Goal

Choose a repeatable camera setup using measured quality rather than an arbitrary distance or angle.

### Pilot variables

- [ ] camera-to-shooter distance;
- [ ] lens height;
- [ ] horizontal angle relative to the shooting-side sagittal plane;
- [ ] landscape or portrait orientation;
- [ ] athlete image occupancy and full-body visibility;
- [ ] lighting and motion blur observations;
- [ ] landmark visibility and missing-frame rate;
- [ ] shooting side and occlusion pattern.

Use a small predefined grid that is feasible in the available court or practice area. Do not optimize using later efficacy results.

### Outputs

- Setup photographs or diagrams that do not identify participants.
- Camera geometry table.
- Valid-shot yield and quality results for every tested position.
- Selected SOP plus tolerances supported by the pilot.

### Exit gate

- One geometry provides acceptable full-body visibility and valid-shot yield on the frozen live device.
- The setup can be recreated from recorded measurements.
- Reasons for rejecting alternative positions are documented.

---

## Phase 2B — Separated iPhone high-frame-rate reference capture

### Goal

Use the iPhone native 120/240 fps mode to create consumer-phone reference videos for offline event validation. This is a separate session from Safari live analysis and does not provide a synchronized ground-truth view of a live trial.

### Setup

```text
iPhone live session
└── Safari analysis plus same-stream ordinary-rate recording

iPhone reference session
└── native 1080p/120 or 240 fps recording

ASUS TUF
├── local replay and frame-by-frame annotation
└── comparison of algorithm events with annotations within the reference session
```

### Procedure

- [ ] Fix the iPhone at a geometry selected in Phase 2A; do not hand-hold it.
- [ ] Record the native mode, nominal FPS, resolution, orientation, distance, height, angle, shooting side, lighting, and session code.
- [ ] Record a small set of non-participant pilot shots in native 120 or 240 fps mode.
- [ ] Copy the original videos locally to the TUF using pseudonymous session IDs without transcoding the archive copy.
- [ ] Inspect transferred video metadata, frame timestamps, duration, and decodable frame count before analysis; preserve anomalies rather than claiming that metadata alone proves zero dropped frames.
- [ ] Run offline pose/event analysis on the reference session and preserve its algorithm version and parameters.
- [ ] Keep live-session and reference-session results in separate tables; never pair different shots as if they were synchronized.

### Exit gate

- Native frame timing and recording metadata are retained or their limitations documented.
- Every offline algorithm trial can be matched to the correct interval in the same high-frame-rate reference video.
- Reference-session annotations and algorithm results use the same shot identifiers.
- Reports state that the design validates offline event detection on separate high-frame-rate recordings, not absolute accuracy of the simultaneous live output.
- Original videos are retained locally and never committed to GitHub.

---

## Phase 2C — Manual annotation and event validation

### Goal

Estimate how accurately and reliably the offline pipeline detects knee and elbow events within the separately recorded consumer-phone high-frame-rate sessions. Live-system performance remains a separate engineering result.

### Annotation work

- [ ] Write operational definitions for knee peak extension velocity and elbow extension onset.
- [ ] Build or adopt a local frame-by-frame annotation workflow with recorded provenance and license.
- [ ] Blind annotation to live/replay results.
- [ ] Repeat a randomized, relabeled subset after a documented washout interval to estimate within-rater reliability; hide prior marks and do not claim that memory bias is eliminated.
- [ ] If a second trained annotator becomes available, estimate between-rater agreement; otherwise state the limitation explicitly.
- [ ] Preserve uncertain annotations and confidence ratings.

### Algorithm comparison

- [ ] source-rate data;
- [ ] current causal fourth-order Butterworth implementation;
- [ ] candidate cutoff frequencies;
- [ ] with and without spline reconstruction;
- [ ] offline zero-phase filtering as reference analysis only;
- [ ] different event definitions where justified before efficacy analysis.

### Reported results

- knee-event timing bias and absolute error;
- elbow-event timing bias and absolute error;
- `deltaT` bias, MAE/RMSE, and agreement limits where appropriate;
- valid-trial yield and failure reasons;
- results stratified by FPS, visibility, geometry, and side;
- live-versus-same-stream replay differences, reported separately from high-frame-rate annotation error;
- annotation reliability and uncertainty.

### Exit gate

- Event definitions are reproducible enough to annotate.
- Error and failure distributions are documented using the available hardware.
- The selected algorithm version and parameters are frozen before feedback-effect testing.
- If accuracy is inadequate, return to Phase 1B or 2A instead of proceeding.

### Claim limit

This phase provides separate-session, consumer-device offline event validation. It is not laboratory motion-capture validation and does not directly validate the event time emitted during a different live shot.

### Dataset separation

- Store live engineering, same-stream replay, audio-proxy, and high-frame-rate offline-validation results as separate datasets with distinct ID namespaces.
- Do not join live and high-frame-rate trials across sessions or calculate a fabricated paired accuracy statistic.
- Public summaries may compare distributions only when the comparison question, denominators, device context, and non-paired design are explicit.

---

## Phase 3A — Feedback usability pilot

### Goal

Confirm that baseline, terminal visual, and terminal auditory conditions operate as intended before any efficacy claim.

### Engineering and protocol checks

- [ ] Baseline reveals no delta-t, result, live angles, SD/CV, chart, or sound.
- [ ] Visual and auditory conditions use matched binary information and nominal delay.
- [ ] Auditory feedback occurs after the movement, not during execution.
- [ ] Exactly one feedback event occurs per accepted trial.
- [ ] Condition order, block reset, and CSV labels remain correct.
- [ ] Add operator-visible quality warnings without revealing prohibited information to the shooter.
- [ ] Add a short post-block workload/effort rating only after choosing a licensed or properly cited instrument.

### Exit gate

- Condition behavior passes scripted tests and device smoke tests.
- Users can identify the sounds and understand the procedure.
- No serious usability or safety issue appears in non-research pilot use.
- No effectiveness conclusion is drawn.

---

## Phase 3B — Protocol, ethics, and data-management freeze

### Goal

Prepare a defensible protocol before collecting data from participants.

### Required decisions

- [ ] research question and primary outcome;
- [ ] inclusion/exclusion criteria;
- [ ] sample-size justification;
- [ ] counterbalancing and randomization;
- [ ] familiarization, trial counts, breaks, and stopping rules;
- [ ] feedback delay and target-band status;
- [ ] valid-trial and missing-data rules;
- [ ] retention or transfer test;
- [ ] cognitive-load measure and analysis plan;
- [ ] consent, withdrawal, adverse-event, and incident procedures;
- [ ] video/data access, encryption, retention, deletion, and backup plan;
- [ ] required institutional ethics or instructor approval.

### Exit gate

- The protocol and analysis plan are versioned and frozen.
- Required ethics/administrative approval is documented.
- Consent and data-management procedures are ready.
- The application build and validation profile are frozen.

No participant enrollment occurs before this gate.

---

## Phase 4 — Small feasibility study

### Goal

Test recruitment, procedure completion, data yield, and adverse events—not definitive effectiveness.

### Work

- [ ] Use the frozen build and SOP.
- [ ] Record deviations and missing data.
- [ ] Monitor valid-trial yield, duration, fatigue, discomfort, and technical failures.
- [ ] Confirm that retention/transfer and workload measures can be completed.
- [ ] Review feasibility criteria without opportunistically changing the primary outcome.

### Exit gate

- Feasibility criteria are met or the protocol is explicitly revised and re-versioned.
- No unresolved safety, privacy, measurement, or data-quality issue remains.
- A larger study is justified independently of favorable outcome direction.

---

## Phase 5 — Feedback efficacy study

### Goal

Compare baseline, terminal visual, and terminal auditory feedback under the frozen protocol.

### Minimum outputs

- participant flow and exclusions;
- protocol deviations;
- descriptive statistics and uncertainty intervals;
- primary and secondary outcomes as preregistered;
- retention/transfer results;
- workload results without assuming auditory superiority;
- device, latency, and quality summaries;
- limitations of consumer-phone validation and generalizability.

### Exit gate

- Analysis follows the frozen plan.
- Results are reported regardless of direction.
- Practice performance is not mislabeled as motor learning without retention or transfer evidence.
- Code, configuration, and non-identifying reproducibility materials are archived with source attribution.

---

## Phase 6 — Product or broader deployment decision

### Goal

Decide whether the validated research prototype should become a training product, remain a research tool, or be discontinued.

### Decision inputs

- measurement accuracy and failure cases;
- actual learning or performance evidence;
- device compatibility and thermal behavior;
- privacy and local-storage requirements;
- accessibility and environmental-awareness findings;
- maintenance cost and dependency risk;
- whether native Android development is justified over the browser version.

No clinical, injury-prevention, or guaranteed-performance claim may be made without evidence appropriate to that claim.

---

## Immediate execution order

The active queue is reorganized around the October 2026 presentation. Detailed scope and cited rationale are in [`docs/october-2026-presentation-plan.md`](./docs/october-2026-presentation-plan.md).

### Before the October 2026 presentation

1. **Phase 0:** device diagnostics and role freeze.
2. Freeze a stable presentation build; repair demonstration-blocking defects before adding analysis features.
3. **Phase 1A:** same-phone live analysis plus source-video/data capture.
4. **Phase 1B minimum:** one deterministic TUF replay and live-versus-replay comparison.
5. **Phase 2A minimum:** select one reproducible non-participant presentation geometry using one tripod.
6. **Phase 1C preliminary:** characterize the phone speaker first and AirPods Pro 2 separately.
7. Freeze the late-September build, evidence tables, claim boundaries, and fallback demonstration.

### After the presentation

1. **Phase 2B:** separated iPhone native high-frame-rate reference sessions.
2. **Phase 2C:** blinded manual annotation and event validation.
3. Complete **Phase 1C/2A** characterization and tune parameters against validation evidence.
4. Freeze the algorithm and device profile.
5. Complete **Phase 3A/3B** usability, protocol, ethics, and data-management gates.
6. Conduct **Phase 4** feasibility work, then **Phase 5** participant efficacy work.
7. Make the **Phase 6** product decision.

October materials must not make effectiveness, motor-learning, cognitive-load, or participant-readiness claims. Same-stream recording and replay demonstrate traceability and reproducibility. Separate iPhone high-frame-rate sessions can test offline event detection, but cannot be described as synchronized validation of the live output.

## Related documents

- [Revised method after proposal review](./docs/revised-method-after-review.md)
- [Experiment-readiness v1](./docs/experiment-readiness-v1.md)
- [Sources and provenance](./docs/SOURCES.md)
- [GitHub Pages testing checklist](./docs/testing-on-github-pages.md)
- [October 2026 presentation-first plan and references](./docs/october-2026-presentation-plan.md)
- [Phase 1A local capture implementation and test procedure](./docs/phase1a-local-capture.md)

## References

1. Bazarevsky V, Grishchenko I, Raveendran K, Zhu T, Zhang F, Grundmann M. BlazePose: On-device real-time body pose tracking. 2020. <https://arxiv.org/abs/2006.10204>
2. Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *The Lancet*. 1986;1(8476):307–310. <https://pubmed.ncbi.nlm.nih.gov/2868172/>
3. Dwan K, Li T, Altman DG, Elbourne D. CONSORT 2010 statement: extension to randomised crossover trials. *BMJ*. 2019;366:l4378. <https://doi.org/10.1136/bmj.l4378>
4. Oliosi E, Ferreira S, Giordano AP, Viveiros G, Parraca J, Pereira P, Guede-Fernández F, Azevedo S. Evaluation of smartphone camera positioning on artificial intelligence pose estimation accuracy for exercise detection: observational study. *JMIR mHealth and uHealth*. 2026;14:e82412. <https://doi.org/10.2196/82412>
5. Salmoni AW, Schmidt RA, Walter CB. Knowledge of results and motor learning: a review and critical reappraisal. *Psychological Bulletin*. 1984;95(3):355–386. <https://doi.org/10.1037/0033-2909.95.3.355>
6. Sigrist R, Rauter G, Riener R, Wolf P. Augmented visual, auditory, haptic, and multimodal feedback in motor learning: a review. *Psychonomic Bulletin & Review*. 2013;20:21–53. <https://doi.org/10.3758/s13423-012-0333-8>
