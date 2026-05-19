# CRUX Implementation Protocol

This repository follows a strict implementation sequence for CRUX agent work:

1. Implement one new agent slice at a time.
2. Do not start the next agent until the current slice is:
   - implemented end to end,
   - typechecked and built,
   - covered by automated tests,
   - manually validated where practical.
3. Create a git commit before beginning the next implementation slice.
4. Preserve deterministic scoring unless the active slice explicitly changes score behavior.
5. Persist cross-chat continuity in repo docs and commit history instead of assuming chat memory.

Current sequence:

1. Research Evidence Agent
2. Verification Agent
3. Bounded score-adjustment agent
4. Additional CRUX intelligence agents only after the above are complete
