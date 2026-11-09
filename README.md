# Empire
Online multiplayer turn-based empire conquest game.

## Main branch protection

The `.github/CODEOWNERS` file assigns all files, including itself, to
`@meanmutton`. This file alone does not enforce approval or branch protection.

A repository administrator must complete these settings on GitHub:

1. Rename the existing default branch `main` to `Main` in repository settings
   and confirm that `Main` is the default branch.
2. Ensure `.github/CODEOWNERS` is merged into `Main`; GitHub uses the file from
   the PR's base branch to determine code owners.
3. Under **Settings → Branches**, add a branch protection rule matching `Main`
   exactly, with:
   - **Require a pull request before merging**.
   - **Require approvals**, with at least **1** approval.
   - **Require review from Code Owners**.
   - **Dismiss stale pull request approvals when new commits are pushed**.
   - **Do not allow bypassing the above settings**, including administrators.
   - Force pushes and branch deletions left disabled.
4. Do not configure any pull-request bypass permissions, and check that no
   other applicable rule permits bypassing these requirements.

With these settings active, other users may still submit reviews, but their
approvals cannot substitute for `@meanmutton`'s required code-owner approval.
GitHub does not allow PR authors to approve their own PRs: PRs authored by
`@meanmutton` will therefore be blocked under this strict policy. Allowing an
administrator bypass would weaken the requirement that every merge needs an
owner-approved PR.
