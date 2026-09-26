# Notes for Claude

- Logic lives in `src/lib/` and is specified in `docs/model-spec.md`. Work test-first:
  spec → failing test → code. Derive expected values from the spec and real-world
  rules, never from the implementation's output, and never edit an expected value
  just to make a test pass.
- Run `npm run test:run` and `npm run typecheck` before committing.
- UK tax figures live in `src/lib/uk.ts`. If they change, cite the source in the
  commit message and update the spec and tests.
- After changing anything visible, run `npm run test:ui` and look at the screenshots
  (Read the PNGs in `e2e/__screenshots__` or `test-results/`). Update reference
  images with `npm run test:ui:update` only after checking the new ones look right;
  regenerate from scratch (`rm -rf e2e/__screenshots__`) if a change might sit
  inside the diff tolerance.
- Chart defaults: wealth comparisons in today's money; yearly amounts (costs,
  gains) in pounds at the time, each with its own switch.
