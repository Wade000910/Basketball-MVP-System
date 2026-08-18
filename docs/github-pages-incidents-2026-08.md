# GitHub Pages deployment incidents — August 2026

## Purpose

This record separates repository defects from external deployment-service failures. GitHub timestamps below are UTC; Taiwan time is UTC+8. No credentials, request identifiers, or local paths are retained.

## Workflow review

The repository's [Pages workflow](../.github/workflows/deploy-pages.yml) follows GitHub's custom-workflow structure:

- it runs on pushes to `main` and supports `workflow_dispatch`;
- it grants `contents: read`, `pages: write`, and `id-token: write`;
- it checks out the repository, configures Pages, uploads a Pages artifact, and deploys that artifact;
- the deployment job uses the `github-pages` environment.

See GitHub's official documentation for [custom GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [re-running workflows and jobs](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/re-running-workflows-and-jobs).

## Incident timeline

| Run | Commit | Started (UTC / Asia–Taipei) | Outcome | Evidence-based cause |
| --- | --- | --- | --- | --- |
| [32042470115](https://github.com/Wade000910/Basketball-MVP-System/actions/runs/32042470115) | `cd39304` | 2026-08-17 15:29 / 23:29 | Failed | Checkout, Pages configuration, and artifact upload succeeded. `actions/deploy-pages@v4` then received HTTP 503 while creating the Pages deployment. |
| [32043475240](https://github.com/Wade000910/Basketball-MVP-System/actions/runs/32043475240) | `8c20ad1` | 2026-08-17 15:49 / 23:49 | Failed | Job setup could not download the official `actions/configure-pages@v5` archive. GitHub returned HTTP 429 on all three attempts. Repository build steps did not begin. |
| [32144430374](https://github.com/Wade000910/Basketball-MVP-System/actions/runs/32144430374) | `8c20ad1` | 2026-08-18 13:47 / 21:47 | Succeeded | The same workflow and commit completed checkout, configuration, artifact upload, and Pages deployment without a code or workflow change. |

## Conclusion

The two failures are classified as transient GitHub infrastructure or delivery failures, not application failures:

1. the first failed after the site artifact had already uploaded successfully;
2. the second failed while downloading an official GitHub Action;
3. the unchanged commit `8c20ad1` later deployed successfully;
4. a direct post-deployment fetch confirmed that the live page contains `audio_test_btn`, the **Test audio** label, `ensureAudioReady`, and build ID `phase1a-audio-unlock-v6`.

This conclusion does not imply that all future 429 or 503 responses are external incidents. Each failure must still be classified from its failing step and logs.

## Recovery procedure

1. Preserve the failed run and inspect the exact failed step.
2. Confirm that local tests and the privacy scan already passed for the target commit.
3. Do not change application code or create an empty commit solely to hide an infrastructure failure.
4. After a reasonable delay, use the existing `workflow_dispatch` entry point or GitHub's supported rerun action.
5. Wait for the complete workflow result; a successful artifact upload alone is not a successful deployment.
6. Fetch the deployed HTML and relevant static asset directly, then verify the expected control and build ID.
7. Record unresolved external failures without claiming that the site is current.

