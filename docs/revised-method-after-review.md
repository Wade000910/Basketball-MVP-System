# Revised method after proposal review

## Status and purpose

The related NSTC undergraduate research proposal, application `115CFD2200044`, was not approved. This document converts the reviewers' comments into a revised, independently continued research method. It is a design specification, not evidence that the system is scientifically valid or ready for participant enrollment.

The historical project identifier `c802` is retained only for traceability.

## What the reviewers said

### Reviewer 1: feasibility questions that require correction

The first reviewer considered the proposal generally complete but could not determine feasibility from several unresolved details:

1. Android phones, a Logitech C922 at 60 Hz, and an iPhone at 240 Hz appeared in the same method without distinct roles.
2. The proposal assumed that post-trial visual feedback would impose more cognitive load than auditory feedback, although auditory information presented during a movement could also divide attention.
3. Camera position, direction, and site constraints were not specified.
4. The transport path between the phone and bone-conduction headset was unclear, and Bluetooth or other output latency was not measured.

These concerns are accepted as valid design problems.

### Reviewer 2: supportive observations to preserve

The second reviewer regarded the research steps and the central combination of pose analysis, joint kinematics, and auditory feedback as reasonable. The reviewer also considered open-ear bone-conduction output potentially useful for retaining access to environmental sounds.

This is supportive expert feedback, not empirical proof that bone conduction is safer, produces lower cognitive load, or improves motor learning. Those claims remain outcomes to test.

## Corrections to the original method

### 1. Separate the equipment roles

| Equipment | Revised role | Included in efficacy data? |
| --- | --- | --- |
| Android smartphone and its built-in camera | Target deployment platform and primary measurement pipeline | Yes, after technical validation |
| Logitech C922 | Desktop development and debugging only | No |
| iPhone 240 fps or a validated high-frame-rate camera | Synchronized reference recording for manual event annotation | Validation phase only |
| Bone-conduction headset | Candidate terminal-auditory output device | Only after measured latency and reliability are acceptable |
| Phone speaker or wired audio | Comparison and fallback audio paths | During latency pilot; final choice is data-dependent |

The formal experiment must use one frozen primary capture pipeline. Development-camera results must not be pooled with smartphone trial data.

### 2. Correct the 1000 Hz terminology

The source camera produces observations at its measured frame rate. At 60 frames per second, successive source observations are nominally about 16.7 ms apart. Cubic-spline interpolation can evaluate a reconstructed curve on a 1 ms grid, but it does not add image observations, extend the measured signal bandwidth, or establish 1 ms measurement accuracy.

Use this wording:

> Filtered angle observations are reconstructed on a uniform 1 ms computational grid using cubic-spline interpolation for numerical event-time estimation. The reconstruction does not increase the physical sampling rate or create information absent from the source video.

The exported data must retain both `sourceFrameCount` and measured FPS so that reconstructed values cannot be mistaken for original high-rate measurements.

### 3. Treat cognitive load as an outcome

The revised hypothesis does not assume that visual feedback is more demanding than auditory feedback. Reviews of augmented feedback show that modality, timing, information content, and task characteristics can all affect performance and learning ([Sigrist et al., 2013](https://doi.org/10.3758/s13423-012-0333-8); [Subramanian et al., 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8681883/)).

Both feedback conditions will therefore be terminal:

- `baseline`: no knowledge of result or performance is shown after the shot;
- `terminal_visual`: after the configured delay, show a binary result;
- `terminal_auditory`: after the same configured delay, play a binary sound.

The auditory cue must not play during movement execution. Visual and auditory conditions should carry matched information and use the same nominal delay. Cognitive load will be measured rather than presumed, initially with a short post-block rating or NASA-TLX. A secondary-task measure may be piloted later, because adding a second task could itself change shooting behavior.

### 4. Separate measurement variability from intervention outcomes

The per-trial variable is the estimated kinetic-chain timing difference:

`deltaT = elbowExtensionOnsetTime - kneePeakExtensionVelocityTime`

SD and CV are summaries computed within a single participant, session, block, and condition. They must never pool conditions. Before using them as efficacy outcomes:

- the event definitions must pass reference-video validation;
- negative or implausible values need predefined handling;
- CV should not be interpreted when the mean is close to zero;
- the protocol must specify the minimum number of valid trials per block;
- invalid and excluded trials must remain auditable through quality flags.

## Revised three-phase research plan

### Phase 1 — Architecture freeze and latency characterization

Objective: determine whether one specified phone, camera mode, processing path, and audio path can produce stable terminal feedback.

1. Select the target Android device class and record OS, browser or native runtime, camera mode, requested resolution, and measured FPS.
2. Freeze a candidate camera and audio pipeline for the pilot.
3. Timestamp the following stages using a monotonic clock where possible:
   - source frame arrival;
   - pose inference completion;
   - shot-event decision;
   - feedback scheduling;
   - expected audio start.
4. Externally measure actual sound onset for the phone speaker, wired output if supported, and the candidate Bluetooth bone-conduction headset.
5. Report latency distributions, including median, percentile range, maximum, missing output, and trial-to-trial jitter. Do not rely only on a manufacturer's codec claim.

The total path is:

```text
camera exposure
→ frame delivery
→ pose inference
→ filtering and event detection
→ configured terminal-feedback delay
→ audio scheduling
→ device and transport buffering
→ physical sound onset
```

No universal acceptable latency threshold is assumed in advance. The threshold and final output device will be chosen from pilot measurements and the intended terminal-feedback protocol.

### Phase 2 — Camera geometry and event-time validation

Objective: establish whether the primary smartphone pipeline measures the intended events with sufficient accuracy and reliability.

#### Synchronized reference

- Record the same shot with the target Android pipeline and an independently synchronized high-frame-rate reference camera.
- Use a visible and audible synchronization event where practical.
- Have at least two trained annotators independently mark the knee and elbow reference events while blinded to the MediaPipe result.
- Quantify inter-rater agreement before treating the annotation as reference data.

#### Camera-placement pilot

Do not hard-code an untested distance or height. Test a small predefined grid and record:

- distance from camera to shooting position;
- lens height;
- horizontal angle relative to the shooter's sagittal plane;
- portrait or landscape orientation;
- field of view and fraction of image occupied by the athlete;
- lighting and motion blur;
- shooting side;
- landmark visibility, missing frames, and body occlusion.

Select the final SOP using reference-event error, missing-landmark rate, valid-trial yield, and operational practicality. Publish the selected geometry and its tested tolerance only after this pilot.

#### Signal-processing comparison

Compare at least:

- source-rate angle data;
- the current causal fourth-order Butterworth implementation;
- candidate cutoff frequencies selected without inspecting efficacy outcomes;
- reconstruction with and without cubic spline;
- an offline zero-phase filtering analysis used only as a reference.

A causal real-time filter can introduce phase delay. A forward-and-backward zero-phase filter uses future samples and cannot be represented as the live algorithm. Their outputs and purposes must be reported separately.

#### Validation outputs

For knee event time, elbow event time, and `deltaT`, report:

- bias and absolute error in milliseconds;
- RMSE or MAE;
- limits of agreement where appropriate;
- valid-trial yield and failure reasons;
- error stratified by device, FPS, geometry, visibility, and shooting side;
- repeatability across sessions.

BlazePose was designed for real-time landmark inference, but its original paper does not validate this basketball event detector or camera geometry ([Bazarevsky et al., 2020](https://arxiv.org/abs/2006.10204)). Basketball kinetic sequencing is a legitimate research target, but existing work does not establish this project's event definitions or a universal 50–150 ms target ([Templin et al., 2024](https://commons.nmu.edu/isbs/vol42/iss1/93/)).

### Phase 3 — Feedback and learning evaluation

Begin this phase only if Phase 2 supplies predefined evidence that the measurements are usable.

Use a counterbalanced within-participant design unless a later power analysis supports another design. Each participant completes baseline, terminal-visual, and terminal-auditory blocks with matched trial counts, delay, and binary information.

Candidate outcomes:

- free-throw result and accuracy;
- within-block `deltaT` variability, only after validation;
- retention and transfer without feedback;
- post-block cognitive-load rating;
- feedback identification accuracy and user preference;
- adverse effects, discomfort, and environmental-awareness observations;
- measured latency and quality flags for every trial.

Condition order, familiarization, rest, exclusions, missing data, and the minimum number of valid trials must be specified before enrollment. Practice performance must not be described as motor learning without a retention or transfer test; this distinction is central to knowledge-of-results research ([Salmoni, Schmidt, and Walter, 1984](https://doi.org/10.1037/0033-2909.95.3.355)).

## Parameters that remain proposals

The following values are inherited or plausible candidates, not validated specifications:

- the 50–150 ms target band;
- the one-second feedback delay;
- the 10 Hz Butterworth cutoff;
- the filter order and causal implementation;
- the 1 ms spline evaluation grid;
- camera distance, height, and angle;
- minimum usable FPS and landmark visibility;
- Bluetooth, wired, or speaker audio transport;
- acceptable end-to-end latency and jitter;
- sample size and number of trials.

Each value must be justified by literature, technical measurements, pilot data, or a preregistered design decision before it is treated as fixed.

## Engineering consequences for this repository

The next software milestones should be:

1. export monotonic timestamps for each processing stage;
2. add a latency calibration mode and audio-onset test protocol;
3. add recorded-video replay with deterministic reference annotations;
4. expose filter and event parameters as versioned experiment configuration;
5. save camera geometry and device metadata with every session;
6. generate validation reports without mixing them with efficacy statistics;
7. block participant mode until a reviewed validation profile is selected.

No participant data should be collected under the label of a validated experiment until these technical and protocol gates are completed.

## Related project records

- [Source and provenance matrix](./SOURCES.md)
- [2026-06-02 archived prototype status](./status-2026-06-02.md)
- [Experiment-readiness v1 changes](./experiment-readiness-v1.md)
- Historical snapshot tag: `archive/c802-prototype-20260602`
