# Change Log

All notable changes to the "PostgreSQL Hacker Helper" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0]

### Added

Support for CodeLLDB debugger extension. Totally, C/C++ and CodeLLDB now supported.

Display `bitmapword` as bitmask, not integer. Also, bitmask is padded by `0` for length equal to nearest power of 2.

## [1.9.0]

### Added

Show elements of Hash Tables: `HTAB` and `simplehash` (code gen from `lib/simplehash.c`).

User can specify types of elements of custom `HTAB`/`simplehash` in configuration files.

Add basic snippets: `IsA`, `foreach`, `PG_TRY`/`PG_CATCH`/`PG_FINALLY`.

Add node tags from PG18beta1.

Add `join_rel_level` to builtin array special members.

## [1.8.2]

### Fix

`Bitmapset` elements stop iterating when encounters `0`.

### Changed

Do not show `=` in variables view.

## [1.8.1]

### Fix

`Dump Node to stdout` command not worked, because `frameId` not passed for evaluation.

## [1.8.0]

### Added

Add variable from PG Variables to `Watch` view in debug view container.

### Fix

Copy logic of `get_rte_attribute_name` function to get name of attribute for `Var` representation to prevent possible `ERROR` exceptions.

## [1.7.1]

### Fix

Binary features info was cached only for current debug session and invalidated on debugger step.
Now it used the same for whole debug session.

Typedef logic not worked correctly for `Node` variables. Specifically, `MemoryContext` - it was shown as `MemoryContext` even if it's `type` is `AllocSetContext`.

### Changed

Do not show `List` as expandable in PG Variables, if it is empty (`NIL`).

Do not show `words` member for `Bitmapset`.

Add more validity checking for `Bitmapset`: check `NodeTag` (for 16+ version) and pointer validity (for older versions).

## [1.7.0]

### Added

Support for `Value` structs with different NodeTags (for old versions) - show actual value according to it's NodeTag (not whole union, but only required field).

Custom pointer types for `List *`. Earlier, all `T_List` elements were casted to `Node *`, now some `List *` variables/members have elements with their real stored types.
I.e. `RestrictInfo->scansel_cache` is a `List *` that stores `MergeScanSelCache` structs (it is not Node).
Now such `List`s displayed with their type.

User can define their own custom pointer types using configuration file. Configuration file layout updated (new field for this feature), current version 4.

Add more checks when working with system catalog or some other functions. I.e. Oid/pointer checks, `MemoryContext` checks when allocating memory, etc...

### Fix

Memory leaks when evaluating `Expr` representation (pointers got from `get_func_name` and `get_opname` were not `pfree`'d).

Caching of `Expr` representations worked incorrectly. That led to performance decrease (and more memory leaks).

### Changed

Track some binary features of postgres instance in current debug session. I.e. whether it have `bms_next_member` or not. (performance feature)

Do not show `initial_elements`, `head` and `tail` members of `List *`.

## [1.6.1]

### Fix

Errors messages appearing in bottom right corner when making debugger steps too fast and 'PG Variables' view interrupted during step.

## [1.6.0]

### Added

Show text representation of expressions in variables (separate pseudo-member `$expr$`).

Show text representation of expressions contained in `TargetEntry`, `EquivalenceMember` and `RestrictInfo` in description field (old pointer value).

## [1.5.1]

### Added

Update configuration file contents created by command. Set version to 3 and `aliases` member with empty array.

## [1.5.0]

> Pre-release

### Added

Add `typedefs` setting to configuration file. This allows to set custom typedefs.list file for using by formatter. This is helpful when you working on patch which changes this file and you do not want to constantly modify global cached (by extension) typedefs file.
This also updates version of configuration file to 3.

## [1.4.5]

No changes

## [1.4.4]

Add `typedefs.list` file preprocessing for feeding to `pg_bsd_indent`. Processed file saved in `/tmp/pg-hacker-helper.typedefs.list` file and may be reused between different sessions. Without processing raw file (downloaded from buildfarm) `pg_bsd_indent` produces invalid formatted code.

## [1.4.3]

Add pre and post steps around running `pg_bsd_indent` to handle some formatting cases, like single space between type name and `*`. Relates to bug [#3](https://github.com/ashenBlade/postgres-dev-helper/issues/3).

## [1.4.2]

### Fixed

Fix `pg_bsd_indent Path` setting not handled due to code constants misuse. Relates to bug [#2](https://github.com/ashenBlade/postgres-dev-helper/issues/2).

## [1.4.1]

### Added

Add extension files bootstrapping: Makefile, \*.c, \*.sql, \*.control, tests.
To create extension this way need to run command `Bootstrap extension` from
command palette.

Support for fixed size array expansion. Type of field must be in form `type[size]`.

### Fixed

Fix invalid struct detection in variables view: top level structs are not
expandable.

Fix variable length arrays fields displayed as expandable. I.e. for `List` last
field previously was displayed as expandable, but there are no elements shown.

## [1.4.0]

### Added

- Support for custom PostgreSQL source code directories. It can be set using `postgresql-hacker-helper.srcPath` in settings.
  This setting is used to start searching for required files (i.e. default node tag files or `pg_bsd_indent`).
  NOTE: if custom NodeTag files are set with relative path - search start from *workspace* directory, not your custom `srcPath`.

### Fixed

- Invalid message formatting for VS Code greater than 1.74.0. Caused by incompatible (with extension's) formatting logic used.

## [1.3.0]

### Added

- Formatting using `pg_bsd_indent` with `Format Document` VS Code functionality.
  Supported for PostgreSQL starting from 10 version.

- Show elements to which `Bitmapset` and `Relids` points: Relids (`RangeTblEntry` and `RelOptInfo`) or index in array (show element of that array)

### Changed

- Integration with VS Code logging (output channel). Now can specify log level in `Output` window.

## [1.2.1]

### Changed

- `aliases` parameter in configuration file now works for every type, not only
  Node types.

### Fixed

- Check breakpoint in `bms_first_member` function to avoid infinite loop when
  evaluating bms elements.
- Add support for `MemoryContext` Node

## [1.2.0]

### Added

- Compatibility with PostgreSQL starting from **8.0** version. This includes:
  - Linked List implementation of `List`
  - `Bitmapset` traversal using `bms_first_member` and temp object
  - `Bitmapset` handling for versions up to 16, when it was not Node type
- Compatibility with VS Code versions starting from **1.30**. But some features
  can be unaccessible due to API incompatibility.
  
  In example some versions do not have `Dump Node to stdout` in variables debug
  context menu.
- Add more NodeTags - searched from version 8.0 to 17. Current amount - 558.

### Fixed

- Log level not updated until restart of extension (or VS Code).
- Invalid Node casting when declared type has `struct` qualifier and NodeTag
  type do not have it.
  
  Example: `typedef JoinPath NestJoin` (for versions up to 14) - failed to show
  members when declared type is `struct Path *`.

## [1.1.2]

### Fixed

- Invalid cast to `List` - show members of declared type, not based on tag. I.e.
  when `Node *` is declared type, but `T_List` real tag value - shown members were
  for `Node` (single `type` member).

### Added

- 137 new array special members. Total amount - 170.

- Support for `Plan` structs for observing Node variables.

### Changed

- Optimize extension startup path: remove function dependencies, no depending
  on NodeTag files

- NodeTags stored as constant array in extension. Reading from file is not
  necessary for operating.

## [1.1.1]

### Fixed

- Fix Bitmapset elements not shown for postgres version below 17.
  Used function `bms_is_valid_set` was introduced in 17 version.

## [1.1.0]

### Added

- Support for `Bitmapset` and `Relids` - show elements of set and it's length
  in `$elements$` and `$length$` pseudo-members.

- User defined type alises for Node types. Roughly speaking, it specifies
  `typedef`s for types and when test for Node variable fails extension tries
  to substitute typename with given alias.
  This was introduced because of `typedef Bitmapset *Relids` - there is
  no `T_Relids` NodeTag.

### Changed

- Extension is activating automatically on presence of files:

  - `pgsql_hacker_helper.json` - extension's config file
  - `src/include/node/nodes.h`, `src/include/node/nodetags.h` - files with
    NodeTag values (vs code settings not checked)

- Update config file schema to 2 version - default version. `nodeTag` member
  replaced with `typeName`: old behaviour was designed to support only Node
  variables, but now it allows any type to specify custom arrays.
  Also, in `nodeTag` leading T_ prefix was removed, new member does not do it.

- Postgres variables view in debug container shows only when extension is
  activated and in debug mode.

## [1.0.0]

### Added

- `T_XidList` to supported List subtype

### Removed

- `EPQState` from list of array special members - it does not have NodeTag

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
