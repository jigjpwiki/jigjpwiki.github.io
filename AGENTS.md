# jigdule development rules

- Feature or visitor-facing behavior changes must update `data/release.json` in the same PR. It is the only source of the displayed version and update banner. Keep the existing three-part version format: increment minor/reset patch for added features; increment patch for fixes. A data-only catalog addition or periodic stream collection does not require a version bump.
- Describe only routes and behavior actually implemented by that PR. Do not announce dependent future PRs as completed. `featurePaths` must resolve in the generated site. Do not edit the generated `_site/data/update_info.json`.
- Run `npm run check`, `npm test`, `npm run build`, and `npm run test:browser`. Check the version/footer and update banner on mobile and desktop. CI compares visitor-facing changes against the PR base to catch omitted release updates.
- Dependencies: merge the preceding PR into main first, retarget the following PR to main, inspect Files changed and re-run CI before merging. Never merge a dependent PR into a feature branch to finish the work.
- Preserve the schedule controls, collectors, data safeguards and publishing allowlist. Do not publish candidate ledgers, registries, schemas, fixtures or secrets. Do not merge, push main, write to the Wiki or change production settings without explicit authorization.

- A Song identity must use a work-level original/official release URL. A source-manager record is not required. Karaoke timestamps and comments never identify a Song. Unknown work identities stay draft with identityUrl=null and public performances keep songId=null; retain issued IDs. Reuse canonical identity/verified aliases across archives and singers; never infer identity from title alone.

- Source management is retired: do not reintroduce source pools, sourceRefs, per-field provenance selectors, or mandatory source URLs/dates. Keep user-facing content URLs, fixed identity anchors, exact-value review confirmation and actor/change audit. Acquisition cursors/cache timestamps and candidate origin are operational data, not a manual source registry.
