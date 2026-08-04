# Low-cost validation and development roadmap

## Purpose

This roadmap defines the required order for continuing Basketball-MVP-System with the hardware currently available:

- one ASUS TUF Gaming F15 FX507ZV4 computer;
- one iPhone 15 Pro;
- one Samsung Galaxy A60;
- no funded laboratory camera or optical motion-capture system.

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

## Hardware roles

| Device | Initial role | Alternative role | Important limitation |
| --- | --- | --- | --- |
| Samsung Galaxy A60 | GitHub Pages live analysis plus same-stream recording | Secondary reference camera if its camera is better suited | Android/Chrome version, FPS, codec, and thermal behavior remain to be measured in Phase 0 |
| iPhone 15 Pro | Independently synchronized slow-motion reference recording | Live-analysis device if Galaxy A60 browser performance is inadequate | Slow-motion reference is not optical motion capture; the camera cannot normally be shared by Safari analysis and the native Camera app at the same time |
| ASUS TUF Gaming F15 FX507ZV4 | Offline replay, manual annotation, comparison, reporting, and repository development | Desktop debugging with an external camera only if one becomes available | Desktop results must not be pooled with the frozen smartphone capture pipeline |

Device roles may be swapped after Phase 0 measurements. The reason must be recorded in the device profile and changelog.

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
- [ ] Record the Samsung Galaxy A60 Android version and Chrome version.
- [ ] Record the iPhone model, iOS version, Safari version, and supported slow-motion modes shown by the native Camera app.
- [ ] Run a five-minute camera/pose diagnostic on each supported browser.
- [ ] Note overheating, throttling, permission failures, orientation problems, and camera-selection behavior.

### Outputs

- `device-profile-<device-code>.json`
- A short device decision record that assigns the live device and reference device.
- Baseline FPS, inference-duration, and thermal observations.

### Exit gate

- The live-analysis phone can run the current pose pipeline for five minutes without a crash.
- Actual resolution, FPS distribution, inference duration, browser, and OS are recorded.
- The high-frame-rate reference mode is confirmed on the selected second phone.
- Device roles are frozen for the next phases.

### Not established by this phase

Pose accuracy, event accuracy, audio latency, training benefit, or participant readiness.

---

## Phase 1A — Single-phone dual-path capture

### Goal

Use one camera stream simultaneously for live MediaPipe analysis and local source-video recording.

### Engineering work

- [ ] Feed the same `MediaStream` to the live pose pipeline and `MediaRecorder`.
- [ ] Record the actual MIME type and codec selected by the browser.
- [ ] Implement explicit Start Session and Stop Session controls.
- [ ] Freeze participant code, session, block, condition, shooting side, and build version while recording.
- [ ] Save per-frame source timestamps and pose-inference completion timestamps.
- [ ] Save all required MediaPipe landmarks and visibility values per processed frame.
- [ ] Save raw joint angles separately from filtered/reconstructed signals.
- [ ] Preserve accepted, rejected, aborted, and low-quality shots with reason codes.
- [ ] Prevent accidental navigation or refresh while an unsaved recording exists.

### Local session package

```text
session-<participant>-<session>/
├── source-video.<browser-format>
├── frame-timestamps.csv
├── landmarks.csv
├── live-signals.csv
├── live-trials.csv
├── diagnostics.json
└── manifest.json
```

The initial browser implementation may download these files individually if reliable archive generation would require an unreviewed dependency. The manifest must still bind them to one session.

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

- [ ] Use the second phone's high-frame-rate video to record the calibration flash and physical sound where feasible.
- [ ] Test phone speaker first.
- [ ] Test the bone-conduction Bluetooth headset separately.
- [ ] Test wired audio only if the available devices support it without buying additional research equipment.
- [ ] Record median, range/percentiles, maximum, missing output, and jitter for each path.

### Exit gate

- Software-stage latency is available per trial.
- Physical output latency has repeated observations for every candidate audio path.
- The selected test output and any exclusion threshold are justified by measured results, not codec marketing.
- The one-second configured delay is not confused with total end-to-end delay.

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

## Phase 2B — Dual-phone synchronized reference capture

### Goal

Record the same trial with the live-analysis phone and independently synchronized iPhone high-frame-rate reference video.

### Setup

```text
live phone
├── GitHub Pages analysis
└── same-stream source recording

iPhone 15 Pro
└── native high-frame-rate reference recording

TUF computer or visible cue
└── synchronization flash plus short sound
```

### Procedure

- [ ] Fix both phones; do not hand-hold during validation trials.
- [ ] Record device clocks only as metadata; do not assume they are synchronized accurately enough.
- [ ] Start both recordings.
- [ ] Generate a visible flash and short sound captured by both devices.
- [ ] Perform a small set of non-participant pilot shots.
- [ ] End with a second synchronization event to estimate drift.
- [ ] Copy files locally to the TUF computer using pseudonymous session IDs.

### Exit gate

- The start synchronization event is identifiable in both recordings.
- End-of-session drift can be estimated or bounded.
- Every live trial can be matched to the correct reference-video interval.
- Original videos are retained locally and never committed to GitHub.

---

## Phase 2C — Manual annotation and event validation

### Goal

Estimate how accurately and reliably the live/replay pipeline detects knee and elbow events using consumer-phone reference video.

### Annotation work

- [ ] Write operational definitions for knee peak extension velocity and elbow extension onset.
- [ ] Build or adopt a local frame-by-frame annotation workflow with recorded provenance and license.
- [ ] Blind annotation to live/replay results.
- [ ] Repeat a subset of annotations to estimate within-rater reliability.
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
- live-versus-replay differences;
- annotation reliability and uncertainty.

### Exit gate

- Event definitions are reproducible enough to annotate.
- Error and failure distributions are documented using the available hardware.
- The selected algorithm version and parameters are frozen before feedback-effect testing.
- If accuracy is inadequate, return to Phase 1B or 2A instead of proceeding.

### Claim limit

This phase provides consumer-device reference validation, not laboratory motion-capture validation.

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

The active queue is:

1. **Phase 0:** device diagnostics and role freeze.
2. **Phase 1A:** same-phone live analysis plus source-video/data capture.
3. **Phase 1B:** deterministic offline replay on the TUF computer.
4. **Phase 1C:** processing and physical audio-latency characterization.
5. **Phase 2A:** camera-placement pilot.
6. **Phase 2B:** synchronized Galaxy A60/iPhone capture.
7. **Phase 2C:** manual annotation and event validation.
8. Continue to feedback and participant phases only after their gates pass.

The next implementation PR must start with Phase 0 and must not silently include later-phase efficacy claims.

## Related documents

- [Revised method after proposal review](./docs/revised-method-after-review.md)
- [Experiment-readiness v1](./docs/experiment-readiness-v1.md)
- [Sources and provenance](./docs/SOURCES.md)
- [GitHub Pages testing checklist](./docs/testing-on-github-pages.md)
