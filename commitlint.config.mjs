export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'scope-enum': [
      1,
      'always',
      [
        'kernel',
        'vfs',
        'shell',
        'apps',
        'ui',
        'tokens',
        'platform',
        'desktop',
        'web',
        'landing',
        'rust',
        'ci',
        'docs',
        'deps',
        'release',
        'tooling',
      ],
    ],
  },
};
