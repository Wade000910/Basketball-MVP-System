# October 2026 presentation-first plan

## Scope

The October 2026 deliverable is a working research prototype with preliminary engineering and measurement evidence. It is **not** a completed participant efficacy study. Full parameter tuning, ethics/protocol freeze, feasibility recruitment, and the 12–15-participant comparison are scheduled after the presentation.

This separation matters because temporary practice performance is not sufficient evidence of motor learning; retention or transfer evidence is required before making a learning claim [1,2].

## Available equipment

| Equipment | Current role | October requirement |
| --- | --- | --- |
| Samsung Galaxy A60 | Candidate live browser analysis and same-stream recording | Complete the five-minute diagnostic before freezing its role |
| iPhone 15 Pro | Candidate high-frame-rate consumer-phone reference camera | Confirm available native slow-motion modes |
| ASUS TUF Gaming F15 FX507ZV4 | Offline replay, comparison, reporting, and development | Produce at least one live-versus-replay case |
| Phone speaker | Primary low-complexity auditory-output path | Measure repeated physical onset observations |
| AirPods Pro 2 | Optional Bluetooth comparison path | Measure separately; do not infer latency from product or codec claims |
| One stable phone tripod | Repeatable camera placement | Required for the camera-position pilot |

There is no bone-conduction headset and no funded laboratory motion-capture system. The repository must not describe bone conduction as current equipment or as a required October deliverable. AirPods Pro 2 are conventional wireless earbuds, so any future environmental-awareness or bone-conduction rationale does not apply to them.

## Work required before the presentation

### O1 — Device diagnostics and provisional role freeze

1. Complete five-minute diagnostics on the Galaxy A60 and iPhone 15 Pro.
2. Record OS/browser versions, actual video dimensions, FPS distribution, inference duration, long frames, camera behavior, and thermal observations.
3. Confirm the iPhone native slow-motion modes.
4. Assign the live-analysis and reference-camera roles from observations rather than assumed specifications.

BlazePose was designed for real-time on-device inference and outputs 33 body landmarks, but its published benchmarks do not validate this basketball event detector, these phones, or this camera geometry [3].

### O2 — Stable presentation build

Freeze a demonstrable build that can open the camera, show the diagnostic skeleton, calculate the current knee/elbow signals, emit Ding/Buzz feedback, preserve condition labels, and export results. Fix demonstration-blocking defects before adding new analysis features.

### O3 — Same-phone analysis, recording, and export

Use one opened camera `MediaStream` for both live analysis and local source-video recording. Bind video, frame timestamps, landmarks, signals, trials, diagnostics, and the manifest with one session ID. Compare analysis-only performance with analysis-plus-recording performance.

This stage demonstrates operability, traceability, and replayability. Because live analysis and recording share the same camera stream, it does not independently establish measurement accuracy.

### O4 — Minimal deterministic replay

Replay at least one exported source video on the TUF computer, preserve the live files, and report trial matching plus knee-event, elbow-event, and `deltaT` differences. Repeat the replay with the same version and parameters to check reproducibility.

Agreement with same-stream replay is not ground-truth validation. When two measurement approaches are later compared, report differences and agreement rather than correlation alone [4].

### O5 — Small camera-placement pilot

With one stable tripod, test a small predefined grid of distance, lens height, horizontal angle, and orientation. Record full-body visibility, occlusion, landmark visibility, missing frames, and valid-shot yield. Camera angle and distance can materially affect smartphone pose-estimation performance, so geometry must be measured and reproducible [5].

Select one presentation geometry without optimizing against later efficacy outcomes.

### O6 — Preliminary audio-path characterization

1. Test the phone speaker first.
2. Test AirPods Pro 2 as a separate Bluetooth path.
3. Record repeated software-stage timestamps and externally observed physical sound onset.
4. Report the median, spread, maximum, missing output, and jitter for each device/path.
5. Keep the configured one-second terminal-feedback delay separate from processing and output latency.

The choice between auditory paths remains empirical. The augmented-feedback literature does not establish one universally superior modality or timing schedule for this basketball task [1].

### O7 — Presentation freeze

By late September 2026:

- freeze the public build and Git commit;
- prepare a prerecorded fallback demonstration;
- retain one complete non-participant session package locally;
- prepare device-performance, replay-comparison, camera-geometry, and audio-latency summaries;
- label every result as implemented, preliminary, proposed, or unvalidated;
- present formal participant efficacy testing as future work.

## Work after the presentation

Proceed in this order:

1. synchronized dual-phone high-frame-rate reference capture;
2. blinded manual event annotation and within-rater reliability;
3. event-time error and agreement analysis;
4. camera, filter, interpolation, and event-definition tuning using validation data rather than efficacy outcomes;
5. algorithm and device-profile freeze;
6. feedback-usability pilot;
7. research question, sample size, counterbalancing, workload measure, consent, data-management, and ethics/administrative freeze;
8. small feasibility study;
9. formal baseline/visual/auditory participant study;
10. retention/transfer analysis, reporting, and product decision.

A crossover or within-participant experiment must document sequence allocation and analyze within-participant comparisons appropriately [6]. NASA-TLX is a candidate workload instrument, not an automatic choice; its version, administration, scoring, and licensing/provenance must be frozen before enrollment [7].

## Claim boundaries for October

Permitted claims:

- the repository contains an operational research prototype;
- the prototype can perform the demonstrated capture, analysis, feedback, and export operations;
- preliminary device, replay, geometry, and latency observations were obtained under the reported setup;
- a staged validation and participant-study plan exists.

Not permitted without later evidence:

- auditory feedback improves free-throw performance, retention, learning, consistency, or cognitive load;
- AirPods Pro 2 or any unavailable bone-conduction device is safer or preserves environmental awareness;
- the current one-second delay, target band, filter, or camera position is optimal;
- same-stream replay proves event accuracy;
- iPhone slow-motion video is optical motion-capture ground truth;
- the project is NSTC-approved, funded, or endorsed.

## References

1. Sigrist R, Rauter G, Riener R, Wolf P. Augmented visual, auditory, haptic, and multimodal feedback in motor learning: a review. *Psychonomic Bulletin & Review*. 2013;20:21–53. <https://doi.org/10.3758/s13423-012-0333-8>
2. Salmoni AW, Schmidt RA, Walter CB. Knowledge of results and motor learning: a review and critical reappraisal. *Psychological Bulletin*. 1984;95(3):355–386. <https://doi.org/10.1037/0033-2909.95.3.355>
3. Bazarevsky V, Grishchenko I, Raveendran K, Zhu T, Zhang F, Grundmann M. BlazePose: On-device real-time body pose tracking. 2020. <https://arxiv.org/abs/2006.10204>
4. Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *The Lancet*. 1986;1(8476):307–310. <https://pubmed.ncbi.nlm.nih.gov/2868172/>
5. Oliosi E, Ferreira S, Giordano AP, Viveiros G, Parraca J, Pereira P, Guede-Fernández F, Azevedo S. Evaluation of smartphone camera positioning on artificial intelligence pose estimation accuracy for exercise detection: observational study. *JMIR mHealth and uHealth*. 2026;14:e82412. <https://doi.org/10.2196/82412>
6. Dwan K, Li T, Altman DG, Elbourne D. CONSORT 2010 statement: extension to randomised crossover trials. *BMJ*. 2019;366:l4378. <https://doi.org/10.1136/bmj.l4378>
7. Hart SG, Staveland LE. Development of NASA-TLX (Task Load Index): results of empirical and theoretical research. In: Hancock PA, Meshkati N, eds. *Human Mental Workload*. 1988:139–183. NASA-hosted manuscript: <https://human-factors.arc.nasa.gov/groups/TLX/downloads/Hart_Staveland_ORIGINAL_1.pdf>
