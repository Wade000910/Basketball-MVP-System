# Sources, provenance, and claim boundaries

This file records why a design choice exists, where external ideas or libraries came from, and what remains unvalidated. A citation documents context; it does **not** prove that this implementation is valid.

## Project status

The related NSTC undergraduate research proposal was not approved. Continued development in this repository is independent and is not evidence of NSTC approval, funding, or endorsement. The public record omits the application identifier, and `c802` is retained only as the project's historical internal identifier.

The current audio inventory is limited to phone speakers and AirPods Pro 2. There is no bone-conduction headset. AirPods Pro 2 are treated only as a Bluetooth output path whose end-to-end latency and jitter must be measured on the selected phone; no paper or product claim substitutes for that measurement.

## Traceability matrix

| Implementation item | What changed here | Source or prior project | What the source supports | Validation still required |
| --- | --- | --- | --- | --- |
| Terminal binary auditory feedback | The existing Ding/Buzz condition remains, with an explicit one-second delay | Salmoni, Schmidt, and Walter (1984), DOI [10.1037/0033-2909.95.3.355](https://doi.org/10.1037/0033-2909.95.3.355); Sigrist et al. (2013), DOI [10.3758/s13423-012-0333-8](https://doi.org/10.3758/s13423-012-0333-8) | Augmented feedback, its timing, and the distinction between temporary performance and learning must be controlled experimentally | These sources do not establish that one second, binary sound, or this task is optimal |
| Baseline blinding | Delta-t, outcome, live joint angles, SD, and CV are hidden in baseline mode | Same motor-learning sources above | A no-feedback comparison must not accidentally receive knowledge of results or performance | Protocol review and browser-level UI/audio tests |
| Knee-to-elbow sequencing | The prototype continues to estimate the interval between knee peak extension velocity and elbow extension onset | Templin et al. (2024), [ISBS Proceedings](https://commons.nmu.edu/isbs/vol42/iss1/93/); Okazaki and Rodacki (2012), [PubMed Central](https://pmc.ncbi.nlm.nih.gov/articles/PMC3588685/) | Basketball shooting involves coordinated lower- and upper-extremity kinematics; sequencing is a legitimate research variable | Neither paper validates this event definition or the universal 50–150 ms band |
| On-device pose landmarks | The existing prototype uses MediaPipe Pose | Bazarevsky et al. (2020), [BlazePose paper](https://arxiv.org/abs/2006.10204); [MediaPipe GitHub repository](https://github.com/google-ai-edge/mediapipe) | BlazePose was designed for real-time body landmark tracking and provides 33 landmarks | Compare detected events against independently annotated high-frame-rate video or motion capture for this task and camera geometry |
| Camera-placement pilot | Distance, lens height, horizontal angle, orientation, visibility, and occlusion are tested before freezing the SOP | Oliosi et al. (2026), DOI [10.2196/82412](https://doi.org/10.2196/82412) | Smartphone angle and distance can affect pose-estimation exercise detection, supporting an empirical placement pilot | Basketball free throws, these phones, and this event detector still require project-specific validation |
| Measurement-method agreement | Live/replay/reference differences are reported rather than replaced by correlation alone | Bland and Altman (1986), [PubMed](https://pubmed.ncbi.nlm.nih.gov/2868172/) | Method comparison requires analysis of differences and agreement | Predetermine acceptable event-time error and account for repeated shots within a person |
| Within-participant study reporting | Sequence allocation and within-participant comparison remain required after validation | Dwan et al. (2019), DOI [10.1136/bmj.l4378](https://doi.org/10.1136/bmj.l4378) | CONSORT crossover guidance supports transparent sequence and within-person reporting | Adaptation to three feedback conditions and the final analysis plan require statistical review |
| Workload measurement candidate | NASA-TLX is retained only as a candidate instrument | Hart and Staveland (1988), [NASA-hosted manuscript](https://human-factors.arc.nasa.gov/groups/TLX/downloads/Hart_Staveland_ORIGINAL_1.pdf) | Provides the original NASA-TLX development rationale | Freeze the exact instrument, administration, scoring, language, and provenance before enrollment |
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
- A source must be opened and reviewed before it is added. Put the citation next to the supported claim and include a complete reference in the relevant document's final `References` section.
- Prefer original research, the original method paper, a formal reporting guideline, or an authoritative software repository. Use reviews to frame uncertainty, not to claim that this implementation works.

## Reviewed bibliography

1. Bazarevsky V, Grishchenko I, Raveendran K, Zhu T, Zhang F, Grundmann M. BlazePose: On-device real-time body pose tracking. 2020. <https://arxiv.org/abs/2006.10204>
2. Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *The Lancet*. 1986;1(8476):307–310. <https://pubmed.ncbi.nlm.nih.gov/2868172/>
3. Dwan K, Li T, Altman DG, Elbourne D. CONSORT 2010 statement: extension to randomised crossover trials. *BMJ*. 2019;366:l4378. <https://doi.org/10.1136/bmj.l4378>
4. Hart SG, Staveland LE. Development of NASA-TLX (Task Load Index): results of empirical and theoretical research. In: Hancock PA, Meshkati N, eds. *Human Mental Workload*. 1988:139–183. <https://human-factors.arc.nasa.gov/groups/TLX/downloads/Hart_Staveland_ORIGINAL_1.pdf>
5. Oliosi E, Ferreira S, Giordano AP, Viveiros G, Parraca J, Pereira P, Guede-Fernández F, Azevedo S. Evaluation of smartphone camera positioning on artificial intelligence pose estimation accuracy for exercise detection: observational study. *JMIR mHealth and uHealth*. 2026;14:e82412. <https://doi.org/10.2196/82412>
6. Salmoni AW, Schmidt RA, Walter CB. Knowledge of results and motor learning: a review and critical reappraisal. *Psychological Bulletin*. 1984;95(3):355–386. <https://doi.org/10.1037/0033-2909.95.3.355>
7. Sigrist R, Rauter G, Riener R, Wolf P. Augmented visual, auditory, haptic, and multimodal feedback in motor learning: a review. *Psychonomic Bulletin & Review*. 2013;20:21–53. <https://doi.org/10.3758/s13423-012-0333-8>
