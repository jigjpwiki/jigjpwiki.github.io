# Non-public review queue

Run `node scripts/propose-media.cjs input.json ops/proposals/review.json [previous.json]` with a local feed or official API metadata export (`items`/array with snippet title, channelId, optional description). An optional `announcements` array takes title and official URL only. The command is offline: no API calls, credentials, crawling, song recognition or master updates.

Candidate metadata records the original URL, bounded title/timestamp excerpt, extraction method, exact channel-ID match to known talent, suggestions, existing record IDs, review status, and new/changed/unchanged/missing-from-input state. No description or lyrics body is copied. Unknown channel owners remain unlinked; chapter labels (including OP/ED) are not automatically songs. `songId` always stays null in suggestions. No title-only song matching.

A prior confirmed review is retained only if the candidate evidence is unchanged; changed candidates move to needs_review with evidence history. Missing candidates retain their review state. Missing from a partial feed or rolling collection window is **not** proof of deletion or unavailability. Recheck the official video before changing availability. Keep old approved history.

Human review must confirm identity, event vs theme, song/artist/version, timestamp, copyright/source and completeness before editing the curated masters/ID ledger in a PR. A confirmed candidate is not itself published. There is no auto-approval/import command. The separate daily collector and resumable backfill are documented in [Stage 6](../../docs/stage6/DISCOVERY.md). Never paste secrets, full lyrics, subtitles or audio here. The publishing allowlist excludes this directory, all candidate JSON and schema/fixtures.
