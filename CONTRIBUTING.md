# Contributing

Thanks for helping improve Pi Goal.

## Before opening an issue

- Search existing issues first.
- Use a bug report for reproducible incorrect behavior.
- Use a feature request for behavior or API proposals.
- Do not disclose security vulnerabilities in a public issue; follow
  [SECURITY.md](SECURITY.md).

## Development setup

You need Node.js 20 or newer.

```bash
git clone https://github.com/beremaran/pi-goal.git
cd pi-goal
npm ci
npm run check
```

To test the extension manually:

```bash
pi -e ./extensions/pi-goal.ts
```

## Pull requests

1. Fork the repository and create a focused branch.
2. Add or update tests for behavior changes.
3. Run `npm run check`.
4. Update the README or changelog when users need to know about the change.
5. Open a pull request explaining the problem, solution, and verification.

Keep pull requests small and avoid unrelated formatting or refactors. By
contributing, you agree that your contributions are licensed under the
repository's [MIT License](LICENSE).
