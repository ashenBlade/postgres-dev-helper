/**
 * ESLint configuration for the project.
 * 
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from "eslint/config";

export default defineConfig(
    /* Copied from VS Code extension samples */
    {
        ignores: [
            '.vscode-test',
            'out',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            'curly': 'warn',
            '@stylistic/semi': ['warn', 'always'],
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    'selector': 'import',
                    'format': ['camelCase', 'PascalCase'],
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    'argsIgnorePattern': '^_',
                },
            ],
        },
    },
    
    /* Custom settings */
    {
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            /* Declare variables in switch/case */
            'no-case-declarations': 'off',
            /* Features class */
            '@typescript-eslint/no-extraneous-class': [ "error", { "allowStaticOnly": true }],
            /* TestMode enum in tests */
            '@typescript-eslint/prefer-literal-enum-member': ['warn', {'allowBitwiseExpressions': true}],
            /* Indentation */
            '@stylistic/indent': ['error', 4, {
                /* Align arguments with the first argument */
                'CallExpression': {'arguments': 'first'},
                'FunctionExpression': {'parameters': 'first'},
                'ObjectExpression': 'first',
                'ArrayExpression': 'first',
                'FunctionDeclaration': {'parameters': 'first'},
                'ImportDeclaration': 'first',
                /* Member expressions should be indented by first member */
                'MemberExpression': 'off',
                'SwitchCase': 1,
            }],
            /* Use postgres-line comment style */
            '@stylistic/multiline-comment-style': ['error', 'starred-block'],
            /* Prefer trailing commas */
            '@stylistic/comma-dangle': ['warn', 'always-multiline'],
        },
    },
);