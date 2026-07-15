# Git Workflow

DeckForge uses Git to protect stable milestones while allowing focused feature work. The workflow should keep history understandable, preserve user work, and make recovery straightforward.

## Branches

`main` represents verified product milestones suitable for release or demonstration. `develop` integrates completed feature work for the next milestone. Short-lived branches use clear prefixes such as `feature/`, `fix/`, `docs/`, or `chore/` followed by a concise scope.

Recovery branches and tags preserve important historical states. They are not active development branches and should include documentation explaining why the snapshot matters.

## Commits

Each commit should represent one coherent change and leave the repository in a reviewable state. Use concise conventional subjects such as:

- `feat: restore pads sampler workflow`
- `fix: restart deck after global stop`
- `docs: create DeckForge Design Bible`
- `chore: preserve recovery snapshot`

Before committing, review `git status`, the staged diff, and the staged diff summary. Keep generated media, caches, virtual environments, credentials, tokens, and machine-specific settings out of version control. Large required assets need an intentional storage and licensing strategy.

## Integration

Feature branches begin from the intended integration branch and are updated carefully before merge. Verify the relevant automated tests and manual regression checklist, then merge with a history that preserves the feature boundary. Resolve conflicts by understanding both changes, never by discarding unknown work.

Working trees may contain another person's edits. Do not reset, overwrite, stage, or commit unrelated changes. If a requested commit includes mixed scopes, separate them when safe or ask for direction.

Milestone merges should update documentation, known limitations, and recovery information. Tag releases with a consistent semantic version and record user-visible changes. Remote pushes and release publication are explicit actions, not automatic consequences of a local commit.

The desired history tells the product story: what changed, why it changed, how it was verified, and where a dependable state can be recovered.
