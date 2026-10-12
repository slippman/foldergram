# Fork releases

## Version numbers

Use `UPSTREAM-slippman.MAJOR.MINOR.PATCH`, for example
`1.2.2-slippman.1.0.0`: upstream base 1.2.2, Slippman fork version 1.0.0.
The fork has its own semantic version, independent of upstream's version.

- **Major:** incompatible changes to existing use, configuration, stored data,
  or supported APIs. Explain what users need to do when upgrading.
- **Minor:** new features that preserve existing use.
- **Patch:** compatible bug fixes, including security and accessibility fixes.

Choose the highest applicable change for a release. A minor release resets
patch to zero; a major release resets minor and patch to zero. Updating the
upstream base does not reset the fork's version: choose the fork bump based on
the resulting changes. Keep the same upstream base while it remains unchanged.

The already published `1.2.2-slippman.1` is the historical first fork release.
Do not rename its tag or silently replace its Docker image. It is the fork's
1.0.0 baseline: the next fixes-only release is `1.2.2-slippman.1.0.1`, and the
next feature release is `1.2.2-slippman.1.1.0`.

The root package version is the app's release version; workspace versions are
internal. Git tags use `fork-vVERSION` and deployed Docker images use
`slippman/foldergram:VERSION`. The tag prefix keeps fork releases separate from
the upstream image-publishing workflow. Pin production to an exact version.

## Changelog entries

Write for someone using Foldergram to enjoy and share photos, while giving a
developer enough context to recognize the behavior that changed.

- Include only **New features** and **Bug fixes**. Omit empty sections.
- Describe what people can now do, or what was going wrong and now works.
  Name the affected view or device when that explains the change.
- Use ordinary language, short sentences, and specific outcomes. Write as a
  person explaining the update to another person; avoid promotional filler.
- Include relevant conditions and practical limits. For a bug, describe the
  trigger and corrected behavior; mention a technical cause only when useful.
- Group related changes. Do not copy commit messages or list every changed file.
- Exclude maintenance-only work: refactoring, tests, build scripts, deployment,
  version bumps, and documentation edits. A dependency update belongs only when
  it fixes a concrete bug or security issue; describe that issue's effect.
- Never claim a privacy or security improvement beyond what was implemented.
  Keep unresolved limitations in the README and project backlog, outside the
  list of completed changes.
- Add entries under **Unreleased** during development. Before release, move
  those entries under the exact version and release date. Release notes contain
  only that release's entries, not the entire changelog or these policies.

Example bug fix: "Zooming a carousel now opens the photo you selected instead
of its first slide." Example feature: "Share an album from its admin menu."
