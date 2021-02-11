module.exports = {
  root: true,
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module' // Allows for the use of imports
  },
  extends: [
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'prettier/@typescript-eslint'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    'react/boolean-prop-naming': 'error',
    'react/destructuring-assignment': 'error',
    'react/no-array-index-key': 'error',
    'react/no-multi-comp': 'error'
  },
  settings: {
    'import/extensions': ['.js', '.jsx'],
    react: {
      version: 'detect'
    }
  }
};
