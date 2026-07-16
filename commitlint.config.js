// Enforce Conventional Commits (https://www.conventionalcommits.org/).
// Checked locally by the .husky/commit-msg hook and in CI on PR titles.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      ['server', 'web', 'shared', 'cli', 'ssh', 'cloudflare', 'docker', 'deps', 'release', 'ci'],
    ],
  },
};
