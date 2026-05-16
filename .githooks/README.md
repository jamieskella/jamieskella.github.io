# Git hooks for jamieskella.github.io

This directory contains hooks that guard against accidentally committing
secrets, plaintext proposal sources, or other sensitive content to this
public repo.

## One-time activation (per clone)

```bash
git config core.hooksPath .githooks
```

Verify with `git config --get core.hooksPath` (should print `.githooks`).

## What `pre-commit` checks

1. **Plaintext proposal JSON**: refuses any `proposals/*.json` or
   `proposals/**/*.json` in the commit. Plaintext lives only in the
   `skella-proposals` skill workspace, never in this repo.
2. **Secret-like patterns**: scans staged additions for Stripe keys,
   Resend API keys, GitHub tokens, Slack tokens, Google API keys, AWS
   access keys, PEM private keys, baked-in proposal passphrases, and
   common assignments of three-word passphrases to a `passphrase` field.

If a real false positive ever shows up, remove the offending line and
recommit. Use `--no-verify` only as a last resort and only if you're
certain the content is safe.

## What's not covered

These hooks run only on the local machine making the commit. They don't
prevent someone with write access from pushing without running them, so
they're a safety net for normal workflow, not a defence against a
hostile actor. The real privacy guarantees for proposals come from
client-side AES-GCM encryption with a passphrase that is never stored
anywhere in the repo.
