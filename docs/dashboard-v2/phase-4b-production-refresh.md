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

## Production activation evidence

Phase 4B was activated on 2026-08-16 after the corrected candidate received explicit 2560×1440 approval. The initial manual activation promoted the eligible `2026-08-16T201003-603Z` release and recorded `/home/pi/moore-dashboard/releases/20260815-phase3c` as its previous target. HTTP, exact-origin configuration, live sports CORS/cache/ETag behavior, layout, and a full reboot recovery passed before the recurring timer was enabled.

The enabled timer's ordinary next production run remained 8:20 PM Eastern. A separate one-time validation schedule exercised the same AWS generator and committed Pi service sooner without modifying either recurring schedule. AWS recorded generation completion at `2026-08-16T23:36:37.012Z`; the generated artifact timestamp was `2026-08-16T23:36:32.662Z`. The transient Pi timer then ran the production service, which logged staging, eligibility, atomic activation, and success and switched `current` to `/home/pi/moore-dashboard/releases/2026-08-16T233632-662Z`. The one-time AWS schedule self-deleted after completion.

Independent post-cycle validation matched the 5,225,743-byte artifact SHA-256 to its version-pinned manifest, reconfirmed the exact loopback origin, and found the eligible marker. Before-and-after captures of the physical Pi display showed the browser remain healthy through the switch and then replace household content, weather, and ticker state after its own five-minute manifest poll. The recurring Pi timer remained enabled and active. Phase 3C and the private DAKboard command/configuration were retained unchanged.
