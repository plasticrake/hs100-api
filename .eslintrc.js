module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2018,
    project: ['./tsconfig.json', './tsconfig.eslint.json'],
  },
  env: {
    browser: false,
    commonjs: true,
    node: true,
  },
  reportUnusedDisableDirectives: true,

  ignorePatterns: ['docs'],

  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc'],
      extends: [
        'airbnb-typescript/base',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
      ],
      rules: {
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': 'allow-with-description',
            'ts-nocheck': 'allow-with-description',
            'ts-check': 'allow-with-description',
          },
        ],
        'no-restricted-syntax': [
          'off',
          {
            selector: 'ForOfStatement',
          },
        ],
        'tsdoc/syntax': 'off', // 'warn',
      },
    },

    {
      files: ['*.js'],
      extends: ['airbnb-base', 'plugin:prettier/recommended'],
      rules: {
        'no-restricted-syntax': [
          'off',
          {
            selector: 'ForOfStatement',
          },
        ],
        'import/no-unresolved': 'off',
      },
    },

    {
      files: ['examples/*.js', 'examples/*.ts'],
      rules: {
        'no-console': 'off',
        'import/no-unresolved': 'off',
      },
    },

    {
      files: ['lib/**/*.js'],
      rules: {
        // Many rules are violated by tsc output, which cannot be changed by tsc configs, or --fix by eslint.
        // Disable or modify these rules:
        'no-underscore-dangle': 'off',
        'func-names': 'off',
        'no-param-reassign': 'off',
        camelcase: 'off',
        'new-cap': 'off',
        'no-unused-expressions': 'off',
        'no-sequences': 'off',
        'no-void': 'off',
        'no-multi-assign': 'off',
        'no-cond-assign': 'off',
        'no-shadow': 'off',
        'prefer-rest-params': 'off',
      },
    },

    {
      files: ['lib/**/*.ts'],
      rules: {
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/no-shadow': 'off',
      },
    },
  ],
};
