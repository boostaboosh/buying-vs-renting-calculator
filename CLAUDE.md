# Notes for Claude

- Logic lives in `src/lib/` and is specified in `docs/model-spec.md`. Work test-first:
  spec → failing test → code. Derive expected values from the spec and real-world
  rules, never from the implementation's output, and never edit an expected value
  just to make a test pass.
- Run `npm run test:run` and `npm run typecheck` before committing.
- UK tax figures live in `src/lib/uk.ts`. If they change, cite the source in the
  commit message and update the spec and tests.
