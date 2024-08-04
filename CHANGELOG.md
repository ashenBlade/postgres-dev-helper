# Change Log

All notable changes to the "PostgreSQL Hacker Helper" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0]

### Added

- More array special members
- Separate json configuration file where you can add custom special members
- Command and button to refresh Pg variables view
- Setting to specify log level
- Setting to specify list of NodeTag files.

### Fix

### Changed

- Real NodeTag shows up in variable name if it differs from declared

## [0.1.1]

### Fix

- Only valid pointer variables are expanded in Pg variables view

## [0.1.0]

### Added

- Separate view with `Node *` variables expanded
- Dumping `Node *` to stdout using `pprint` function
