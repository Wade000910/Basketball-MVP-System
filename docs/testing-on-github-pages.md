# Testing on GitHub Pages

## Stable test URL

Use the same public entry point for every merged version:

<https://wade000910.github.io/Basketball-MVP-System/>

The site is published from the root of the `main` branch. A successful merge to `main` triggers a Pages rebuild, so the URL remains stable while the deployed content advances.

## Release rule

The Pages site represents the latest reviewed public development version, not every feature branch and not a scientifically validated release.

Before a change reaches the test site:

1. work on a feature branch;
2. run relevant automated and static checks;
3. review sources, licenses, attribution, and claim boundaries;
4. scan changed content for credentials and unnecessary personal data;
5. merge through a Pull Request;
6. wait for GitHub Pages to report a successful deployment;
7. perform the device/browser smoke-test checklist below.

## Device smoke-test checklist

Record the date, commit SHA, device model, OS, browser version, and network type for every test session.

- The landing page loads through HTTPS.
- The application opens from the landing-page button.
- Camera permission can be granted and denied without a crash.
- The rear camera opens where the browser supports it.
- The full body remains visible in portrait and landscape orientation.
- Participant, session, block, condition, and shooting-side controls work.
- Baseline mode does not reveal delta-t, outcome, live angles, SD, CV, chart, or sound.
- Visual mode shows the intended terminal result without sound.
- Auditory mode plays one terminal sound per accepted shot.
- CSV download completes and contains no real name or other direct identifier.
- FPS, visibility, quality flags, condition, block, side, and algorithm version are present.
- Stopping and restarting the camera does not duplicate processing loops.

## Privacy and research limits

- Use pseudonymous participant codes such as `P001`, never names, email addresses, student numbers, or phone numbers.
- GitHub Pages is public. Do not place participant CSV files, recordings, consent forms, or private test notes in the repository.
- Current browser data exists only in memory until the operator downloads CSV; the repository does not provide secure research-data storage.
- A successful browser smoke test establishes software operability only. It does not validate pose accuracy, event timing, the 50–150 ms target, the one-second delay, or training effectiveness.

## If the site appears outdated

Confirm that the expected commit is present on `main`, then check the repository's **Actions** and **Pages** status. Browser and CDN caches may require a reload. Do not bypass a failed deployment by testing an unreviewed branch as if it were the public version.
