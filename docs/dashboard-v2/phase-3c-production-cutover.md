# Dashboard v2 — Phase 3C production cutover

Status: production cutover completed and validated on 2026-08-15. The Pi is running Dashboard v2; the preserved DAKboard launcher remains the tested rollback.

## Release and pre-cutover checks

- Source baseline: `dashboard-v2-sports-live-refresh` at `266c6da`.
- Cutover branch: `dashboard-v2-phase-3c-cutover`.
- The new worktree was clean before any change, and `266c6da` contains the required Phase 3B baseline `a6805c4a1eedfd7413622236b7986aa8f9df4251`.
- CloudFormation stack `moore-ops-sports-live-refresh` was healthy before cutover.
- The deployed endpoint returned current provider data and passed a basic allowed-origin CORS check before Pi changes.
- Read-only inspection confirmed HDMI output at 2560×1440 and identified LXDE-pi as the active desktop session.

## Final Pi configuration

The private server is a systemd service named `moore-dashboard.service`. It runs Python's static HTTP server as the unprivileged `pi` user, serves `/home/pi/moore-dashboard/current`, and listens only on `127.0.0.1:4173`. The deployed release is `/home/pi/moore-dashboard/releases/20260815-phase3c`; `current` is a symlink to that release.

Chromium is launched by the user override at `/home/pi/.config/lxsession/LXDE-pi/autostart` with the exact URL:

`http://127.0.0.1:4173/index.html`

The resulting production browser origin is exactly `http://127.0.0.1:4173`.

The global legacy file `/etc/xdg/lxsession/LXDE/autostart` was not removed or overwritten. Its original DAKboard configuration is preserved at `/home/pi/moore-dashboard/rollback/lxde-autostart.dakboard` with SHA-256 `f4af424a9a63f2439df7ac39e570f2c49d76c6ac7ce33cc8a716de6c28c37a6c`. The private, boot-ready LXDE-pi rollback template is `/home/pi/moore-dashboard/rollback/lxde-pi-autostart.dakboard` and is mode `0600`; documentation intentionally omits its private DAKboard page parameter.

## AWS endpoint

- Region: `us-east-2`
- Account: `785157630803`
- Stack: `moore-ops-sports-live-refresh` (`UPDATE_COMPLETE`)
- Artifact bucket: `moore-ops-lambda`
- Function URL: `https://zdwqeb5rsmlszvifiwdxcqz6ye0lpsys.lambda-url.us-east-2.on.aws/`
- Exact allowed origins: `http://127.0.0.1:4173`

The temporary couch origin `http://192.168.1.52:4173`, the prior DAKboard origin, and an unrelated test origin all receive 403 with no `Access-Control-Allow-Origin`. Wildcard CORS is not configured.

## Validation evidence

- The server was enabled and active after reboot, with a loopback-only listener. A deliberate service restart changed the process ID and recovered successfully.
- Chromium was automatically launched after reboot with the exact local kiosk URL. The production screenshot reported 2560×1440 at 59.95 Hz and showed the complete layout without overflow or missing panels.
- The generated artifact passed checks for exact 2560×1440 canvas dimensions, required sections, four ticker slots, absence of external images, absence of secret material, and no layout overflow.
- Browser validation showed an immediate live poll, four current provider-backed sports slots, and a current `Updated` timestamp. No CORS errors were present.
- Endpoint validation covered GET, HEAD, OPTIONS, unsupported methods, stable cache reuse, quoted ETag, bodyless conditional 304, cache and polling headers, response schema, live provider data, query-string non-bypass, and recursive exclusion of internal/non-public fields.
- A full reboot demonstrated startup persistence of the server and Chromium launcher.

An initial cutover attempt targeted the inactive global LXDE launcher. When Chromium did not start after reboot, the display was immediately returned to DAKboard. Inspection then identified the active LXDE-pi user-launch path. The corrected DAKboard template was boot-tested first, followed by the Dashboard v2 template. This failure was recovered without deleting or modifying the private DAKboard target.

## Rollback procedure

Run the preserved mode switch and reboot:

```sh
/home/pi/moore-dashboard/bin/set-display-mode dakboard
sudo reboot
```

After reconnecting, verify that Chromium was automatically launched with the DAKboard target and that the TV displays DAKboard at 2560×1440. This exact rollback path has been round-trip compared with the preserved template and boot-tested successfully.

To return to Dashboard v2 after resolving an issue:

```sh
/home/pi/moore-dashboard/bin/set-display-mode dashboard
sudo reboot
```

The mode switch atomically installs one of the two retained LXDE-pi templates. It does not delete the other configuration or the legacy global launcher.

## Costs and operational risks

The Phase 3B estimate remains pennies per month at household polling volume and normally within AWS free allowances. The public Function URL has no endpoint-specific spending cap; exact CORS is a browser control, not authentication. The provider feeds are external and may change. The service's loopback-only bind, cached endpoint response, schema validation, bounded polling/backoff, public-only response schema, preserved release directory, and tested DAKboard mode are the primary recovery controls.
