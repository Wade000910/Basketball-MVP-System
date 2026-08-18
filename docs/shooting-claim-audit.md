# Shooting-event and technique-claim audit

## Decision

The prototype must not use the inherited 50–150 ms interval to decide whether a shot occurred or whether a shot was "correct." Those are separate questions, and the reviewed sources do not validate that interpretation.

The original proposal remains private. This document records only a sanitized audit of its literature-dependent claims and the resulting public design decisions.

## Four distinct analysis layers

| Layer | Question | Suitable evidence | Current status |
| --- | --- | --- | --- |
| 1. Shot occurrence | Did a shooting attempt occur, and where does it start/end? | Ball release or a separately validated body-motion proxy | Not yet validated. Knee flexion cannot be required because not every shot contains a deep squat. |
| 2. Data quality | Is this attempt measurable by the selected camera and pose pipeline? | Visibility, missing frames, frame timing, side lock, event-detection quality flags | Partly implemented; thresholds remain provisional. |
| 3. Technique characterization | What joint sequence and timing were estimated? | Continuous event times, angles, velocities, and within-person variability | Prototype only. Report descriptively; do not label correct/incorrect. |
| 4. Shot outcome | Did the ball enter the basket? | Ball/hoop observation or manually verified result | Not implemented as a validated automatic outcome detector. |

Passing one layer does not imply passing another. In particular, recognizing an attempt does not prove that its technique was desirable, and a made shot does not by itself validate a joint-timing rule.

## Audited claims

### Hudson (1986)

The reviewed paper studied segment coordination in vertical jumps. It supports the general existence of proximal-to-distal sequencing in that task. It does not study basketball shooting, independent elbow-extension onset, ball release, or a universal 50–150 ms knee-to-elbow interval.

The DOI previously associated with this citation in the private proposal did not match the cited article. The verified article is:

Hudson JL. Coordination of segments in the vertical jump. *Medicine & Science in Sports & Exercise*. 1986;18(2):242–251. DOI [10.1249/00005768-198604000-00015](https://doi.org/10.1249/00005768-198604000-00015).

### Mullineaux and Uhl (2010)

The reviewed study compared misses and swishes in collegiate free throws. Its abstract reports lower-than-optimal release speed in misses and greater elbow–wrist coordination variability during the final 0.01 seconds before ball release. It does not establish the current knee-peak-to-elbow-onset event definition or a 50–150 ms correct-shot band.

The DOI previously associated with this citation in the private proposal did not match the verified article. The verified article is:

Mullineaux DR, Uhl TL. Coordination-variability and kinematics of misses versus swishes of basketball free throws. *Journal of Sports Sciences*. 2010;28(9):1017–1024. DOI [10.1080/02640414.2010.487872](https://doi.org/10.1080/02640414.2010.487872).

### Templin et al. (2024)

This conference paper provides direct support for studying lower-to-upper-extremity timing as a continuous basketball variable. It studied 34 male players, used a 120 Hz nine-camera markerless system, and defined elbow extension relative to knee extension using the timing of their **peak angular velocities**. The proficient group (at least 70% made) had a reported elbow-relative-to-knee timing of `0.13 ± 0.05 s`; the nonproficient group (at most 50% made) had `0.08 ± 0.03 s`.

This does not validate the prototype's **elbow-extension onset** event. The proficient group's mean and standard deviation must not be converted into a universal 50–150 ms pass/fail range, and proficiency was defined using shooting percentage rather than a per-shot biomechanical correctness label.

Templin TJ, Mullineaux DR, Rumley J, Gibbs C. Relationship between kinematic sequence characteristics, upper extremity joint work, and free-throw shooting accuracy. *Proceedings of the 42nd Conference of the International Society of Biomechanics in Sports*. 2024. [Proceedings record](https://commons.nmu.edu/isbs/vol42/iss1/93/).

### Needham et al. (2022)

The identifiable paper describes a multi-view, high-speed markerless workflow evaluated during walking, running, and countermovement jumping. It does not validate MediaPipe for basketball, a phone-only setup, or a less-than-five-millisecond event-time error. It therefore cannot serve as accuracy validation for this implementation.

Needham L, Evans M, Cosker DP, et al. The development and evaluation of a fully automated markerless motion capture workflow. *Journal of Biomechanics*. 2022;144:111338. DOI [10.1016/j.jbiomech.2022.111338](https://doi.org/10.1016/j.jbiomech.2022.111338).

### Unverified prior citation

The repository previously linked "Okazaki and Rodacki (2012)" to a PubMed Central page. That page is an unrelated soccer article and has been removed. No claim from that citation is retained until the intended paper is identified and reviewed.

## Consequences for the prototype

1. Keep raw/derived timing values for engineering comparison, but name the exact event definition.
2. Treat 50–150 ms as a historical, unvalidated configuration value only; it must not generate `correct`, `incorrect`, `reasonable`, or equivalent scientific labels.
3. Do not require a knee squat to recognize a shot.
4. Prefer ball release for shot-occurrence ground truth. If the current phone view cannot robustly track the ball, use manual annotation during validation and describe any body-only detector as a proxy.
5. Before changing code, freeze a shot-event specification with start, release, end, timeout, rejection, and quality rules, then test one small detector change at a time.
6. Until a feedback target is scientifically selected, Ding/Buzz verifies the audio delivery path only; it is not evidence that the movement classification is valid.

## Open evidence tasks

- Identify and review the intended Okazaki/Rodacki source, if it is still needed.
- Find primary studies that explicitly define ball release and shooting-attempt segmentation for the available single-phone geometry.
- Decide whether the research intervention targets shot outcome, an individualized timing baseline, or another validated technique variable.
- Compare the prototype's elbow-onset event with Templin's peak-elbow-velocity event on the same annotated recordings before choosing either one.
