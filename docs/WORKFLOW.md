# Development workflow

How work on this project is organised: branches, commits, pull requests, releases, and when a task
counts as done.

## Branching: GitHub Flow

- `main` is always green and releasable. A ruleset protects it: no direct pushes, no force pushes, no
  deletion; a PR with a passing `ci` check and an up-to-date branch is required. Nobody can bypass
  it, not even the owner.
- One branch per task, named `<type>/<task-id>-<short-name>`:
  `feat/T1.06-prisma-used-set`, `fix/T1.09-quoted-identifiers`, `docs/readme-status`, `chore/T1.01-bootstrap`.
- **Always branch from fresh `main`. Never stack PRs** (never create a branch from another unmerged
  branch). A squash merge turns the first PR into a new commit on `main`, so a PR stacked on it
  merges into a dead branch and its changes never reach `main`; they have to be re-landed from a
  fresh branch.
- **Small doc fixes don't get their own PR.** They ride along in the next task's PR as a separate
  `docs: …` commit.
- Keep branches short-lived (≤ 2 days).
- **Never force-push.** On `main` the ruleset blocks it; on a PR branch it rewrites the commits a
  reviewer has already seen. Fix mistakes with new commits; the squash merge tidies them up.

```bash
git switch main && git pull --prune
git switch -c feat/T1.06-prisma-used-set
# work, commit often
git push -u origin feat/T1.06-prisma-used-set
gh pr create --fill            # fill in the PR template
gh pr merge --auto --squash    # GitHub merges by itself once ci passes
# after it merges (GitHub deletes the remote branch):
git switch main && git pull --prune
git branch -D feat/T1.06-prisma-used-set   # -D: git doesn't see a squash merge as merged
```

## Commits: Conventional Commits

```
<type>(<scope>): <summary in imperative, ≤ 72 chars>

<body: why this change, not what — the diff shows what>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`.
Scopes: `core`, `db`, `config`, `cli`, `rehearsal`, `attest`, `policies`, `scenarios`, `review`.

Examples:
```
feat(db): resolve @map and @@map when building the used set
test(db): add scenario for dropping an @ignore column
fix(review): handle quoted identifiers in DROP COLUMN normalizer
```

`review` is the scope for corrections made after a code review, so they're easy to find:
`git log --grep="(review)"`.

## Pull requests

- One task per PR. Fill in the template (it includes a **Rollback plan** section — we dogfood).
- No scope outside `docs/ROADMAP.md`. New ideas go under "Ideas (not planned)" there instead.
- CI must pass: format check, lint (including purity and boundaries), build, tests, scenarios.
- **Squash merge only.** The squash commit's title is the PR title and its message is the PR body, so
  the title must follow Conventional Commits and the body must be accurate: it ends up in `git log`.
- **Auto-merge.** Right after the PR is opened, `gh pr merge --auto --squash` arms it. GitHub merges
  as soon as `ci` is green and deletes the branch. Nobody merges by hand.
  - Review the diff *before* arming auto-merge: once CI is green, nothing else stops the merge.
  - If `main` moved after you branched, the PR is out of date and can't merge: run
    `gh pr update-branch`, CI runs again, and auto-merge continues.
  - If CI fails, push fixes to the same branch; auto-merge stays armed.
  - To stop it: `gh pr merge --disable-auto`.

## Releases

- One tag per phase: `v0.1.0`, `v0.2.0`, … (SemVer, pre-1.0).
- `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com): add entries under
  `[Unreleased]` in every PR, move them under the version when tagging.

```bash
git switch main && git pull
git tag -a v0.1.0 -m "Phase 1: DB analyzer and check command"
git push origin v0.1.0
gh release create v0.1.0 --notes-from-tag
```

## GitHub setup (once)

Already configured. Listed here so it can be checked or recreated.

- **Repo settings:** squash merge only (merge commits and rebase off); squash commit = PR title + PR
  body; auto-merge allowed; head branches deleted automatically after merge.
- **Ruleset `main`** (Settings → Rules), enforcement active, no bypass actors: require a pull request
  (0 approvals, squash only); require status check `ci` from GitHub Actions, branch up to date; block
  force pushes; block deletion.
- **Labels:** `phase-1` … `phase-6`, `rule`, `bug`, `docs`, `adr`, `rollback-unsafe-approved`.
- Optional: one issue per task (template in `.github/ISSUE_TEMPLATE/task.md`); PRs say `Closes #N`.

## Definition of done (every task)

- [ ] Behaviour matches the task's "done when" in `docs/TASKS.md`
- [ ] Tests written and passing; new rules have an entry in `docs/RULES.md` and a scenario
- [ ] `pnpm lint && pnpm test` pass
- [ ] No architecture-rule violations (see [ARCHITECTURE.md §10](ARCHITECTURE.md#10-rules-every-change-must-follow))
- [ ] TASKS.md ticked, README status and CHANGELOG updated
- [ ] README describes only what is implemented and tested; everything else is labelled *planned*
- [ ] ADR written if a design decision was made
