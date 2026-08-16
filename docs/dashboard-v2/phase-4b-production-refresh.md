# Dashboard v2 Phase 4B — production household refresh

Phase 4B activates the approved Phase 4A artifact path without changing the browser origin, sports endpoint, household business rules, or preserved DAKboard configuration.

The Pi runs `moore-dashboard-refresh.service` as the unprivileged `pi` account. The service first downloads and validates a version-pinned artifact with `pull-dashboard-candidate.py`; only a successful eligible result is passed to `activate-dashboard-release`. The helper promotes a new release when necessary, records the prior resolved target, and atomically replaces the `current` symlink. Reprocessing the same manifest is idempotent. Any download, freshness, checksum, structure, configuration, secret-exclusion, or activation failure leaves the current release unchanged and is visible in the systemd journal.

`moore-dashboard-refresh.timer` runs at 4:45 AM and 8:20 AM, 12:20 PM, 4:20 PM, and 8:20 PM in the Pi's `America/New_York` system timezone, ten minutes after the corresponding AWS generators. It is installed disabled, enabled only after manual activation, display validation, and reboot recovery pass.

The permanent local rollback boundary is `/home/pi/moore-dashboard/releases/20260815-phase3c`. The independent private DAKboard rollback remains unchanged:

```text
/home/pi/moore-dashboard/bin/set-display-mode dakboard
sudo reboot
```

Neither rollback target may be deleted. Pi credentials remain owner-only at `/home/pi/.config/moore-dashboard/aws-credentials.json` and retain only `s3:GetObject` and `s3:GetObjectVersion` on the private `dashboard-v2/*` artifact prefix.
