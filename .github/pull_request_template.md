## Summary

<!-- What changed and why -->

## Test plan

<!--
Include only when manual verification is needed (e.g. new features, bug fixes).
Omit for text changes, dependency updates, and other mechanically verifiable changes.
-->

## Visual regression tests (ants-nest-simulator)

> [!IMPORTANT]
> Delete this entire section if the PR does **not** touch `ants-nest-simulator/` or `tests/ant-nest-*`. When it does, every item below must be checked before requesting review — CI does not run these.

- [ ] `npx playwright test ant-nest-evolution` was run locally (5 timestamped screenshots in `tests/screenshots/evolution-*.png`)
- [ ] Reviewed all 5 screenshots: clear horizontal surface line, gradual tunnel growth, no instantaneous bursts of dug-out space
- [ ] No regression in ant behavior: no top-edge stacking (`y<5`), no surface ants stuck rotating in place, balanced left↔right surface distribution
- [ ] `npx playwright test ant-nest-regression` 300k-step run passes (or, if a known threshold is loosened, the change is justified in the PR description)
- [ ] (Optional) `npm run test:visual` LLM-evaluation passes for spot-check
