# Change Log

All notable changes to the "PostgreSQL Hacker Helper" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0]

### Added

T_XidList to supported List subtype

### Removed

EPQState from list of array special members - it does not have NodeTag

## [0.2.0]

### Added

- More array special members. Totally - 36 special members.
- Separate json configuration file where you can add custom special members.
  This file can be created manually or using command (in command palette) `PgSQL: Open or create configuration file (JSON)`
- Command and button to refresh Pg variables view: command palette and refresh button on top of Pg variables view.
  Note: normally, you don't need to run this, but when some errors happen
  and variables are not refreshed you can perform this action.
- Setting to specify log level.
  Default: `INFO`
  Available levels:
  - `DEBUG`
  - `INFO`
  - `WARNING`
  - `ERROR`
  - `DISABLE`
- Setting to specify list of NodeTag files.
  Default:
  - `src/include/nodes/nodes.h`
  - `src/include/nodes/nodetags.h`

### Changed

- Real NodeTag shows up in variable name (in square brackets) if it differs from declared.
  This can happen when type of variable `Path *`, but real path is ProjectionPath, so it show `Path * [ProjectionPath]`

## [0.1.1]

### Fix

- Only valid pointer variables are expanded in Pg variables view

## [0.1.0]

### Added

- Separate view with `Node *` variables expanded
- Dumping `Node *` to stdout using `pprint` function
