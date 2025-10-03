# PostgreSQL Hacker Helper

![Logo](./img/logo.png)

This is a Visual Studio Code extension to assist PostgreSQL source code developers:

- Exploring Postgres variables (`Node *`, `HTAB *`, `List *`, `Bitmapset *`, etc...)
- Code formatting using `pgindent`
- Syntax and completion support for `postgresql.conf`
- Extension bootstrapping

## Features

### Postgres Variables

Extension provides assistance with postgres variables:

- View `Node *` variables with real type according to `NodeTag`
- Get the contents of container types: `List *`, `HTAB *`, `Bitmapset *`
- Render `Expr` nodes by the original expression
- Show integer enums as enum values, not integers

> More info you can find in documentation for [`PG Variables` view](docs/pg_variables.md).

Extension creates separate view in debug section - `PG Variables`. It contains postgres variables - extended with knowledge of source code.

![Overview of extension](./img/overview.gif)

- `Node *` variables casted to types according to `NodeTag`
- Container types show their elements:
  - `List *` (with support for scalars)
  - `HTAB *`
  - simplehash (`lib/simplehash.h`)
  - `Bitmapset *`
- Render `Expr` nodes by the original expression
- `Bitmapset *` elements (numbers) store references to which they point, i.e. `Relids` will store `RelOptInfo` and `RangeTable` references
- `List *` can support custom pointer types (not `Node *` types)
- Some scalar types are rendered in more convenient way, i.e. `XLogRecPtr` displayed in `File/Offset` form - not integer
- Enum values, which defined using preprocessor (`#define`) are shown as enum values, not integers.

### Configuration file

Extension has configuration file - `.vscode/pgsql_hacker_helper.json`.
Main purpose is to allow to define container elements custom types, i.e. when you are developing a contrib.

Example json:

```json
{
    "arrays": [
        {
            "typeName": "PlannerInfo",
            "memberName": "simple_rel_array",
            "lengthExpression": "simple_rel_array_size"
        },
        {
            "typeName": "RelOptInfo",
            "memberName": "partexprs",
            "lengthExpression": "part_scheme->partnatts"
        },
        {
            "typeName": "GatherMergeState",
            "memberName": "gm_slots",
            "lengthExpression": "nreaders + 1"
        }
    ],
    "aliases": [
        {
            "alias": "PlannerRef",
            "type": "PlannerInfo *"
        }
    ],
    "customListTypes": [
        {
            "type": "char *",
            "parent": "UserData",
            "member": "knownNames",
        },
        {
            "type": "struct FileChunks *",
            "parent": "ProcessFileChunks",
            "member": "chunks"
        }
    ],
    "htab": [
        {
            "type": "HashTableEntry *",
            "parent":  "ParentStruct",
            "member": "hashtable"
        }
    ],
    "simplehash": [
        {
            "prefix": "userdata",
            "type": "UserDataHashEntry *"
        }
    ],
    "typedefs": "my.typedefs.file"
}
```

Features:

- 3 array members (pointer field used as array) - `"typeName"->"memberName"` will be shown with length `"typeName"->"lengthExpression"`, not as simple pointers.
- `PlannerRef` - custom user typedef for `PlannerInfo *` (used to correctly handle types).
- `UserData->knownNames` is a `List *` that contains pointer elements not `Node *`, but `char *` (`List` of strings).
Variable `chunks` in function `ProcessFileChunks` is a `List` that contains pointer elements not `Node *`, but `struct FileChunks *`.
- `List *UserData->knownNames` contains pointers to `char *` (not Node), and variable `List *chunks` in function `ProcessFileChunks()` contains pointers to `struct FileChunks` (not Node)
- Hash Table member `HTAB *hashtable` of struct `ParentStruct` contains entries of type `HashTableEntry *`
- Simplehash struct `hashtable_hash` contains entries of type `UserDataHashEntry *`.
- User provided custom `typedefs` list (used by formatter).

For more info check [configuration file documentation](./docs/config_file.md).

### Formatting

Extension uses `pgindent` for formatting C code. It integrates with VS Code extension and available with `Format Document` or `Ctrl + Shift + I` shortcut (or another key binding if overridden). Or you can just specify formatter manually using `Format Document With...` - select `PostgreSQL Hacker Helper` in pick up box.

![Formatter work](./img/formatter-work.gif)

Feature supported for PostgreSQL starting from 10 version.

> This feature using tools from `src/tools`. If they are unavailable extension will try to build or download them.
>
> Primary tool required is `pg_bsd_indent` - extension will try to build it.
> For this `pg_config` is used, but if extension fails to find it you will be prompted to enter path to it.

Using command `PGHH: Show diff preview for PostgreSQL formatter` you can
preview changes made by formatter.

Also, you can add your custom `typedefs.list` files and extension will use it during formatting (`"typedefs"`). For more info check [documentation](docs/config_file.md#custom-typedefslist-files).

### Dump `Node *`

In PostgreSQL there is `pprint(Node *)` which dumps passed Node variable to
stdout with pretty printing it. Using 'Dump Node to log' option in variable
context menu you also will be able to do so.

![call pprint](img/dump.gif)

Also, you can dump `Node *` into newly created document and work with it as text file.
There is `Dump Node to document` option in variable context menu.

### Extension bootstrapping

Extension can help with creation of basic PostgreSQL extension files: Makefile, control file, source files (C, SQL) and tests.

Just run command `Bootstrap extension` and enter initial values (extension name, description, required files). Extension will be created inside `contrib` directory.

### `postgresql.conf` syntax support

PostgreSQL configuration files `postgresql.conf` and `postgresql.auto.conf` have syntax support.
Also, for there is autocompletion for configuration parameters also with default contrib's GUCs.

![Syntax example](./img/pgconf_syntax.png)

This syntax must be enabled for `postgresql[.auto].conf` files, but you can specify it using 'Change Language Mode' -> 'PostgreSQL configuration'

## Extension Settings

There are 3 settings:

- `postgresql-hacker-helper.logLevel` - Log level

  Minimum level of log messages in Output channel.
  By default - `INFO`. If using VS Code 1.74.0 ang greater use `Output` channel
  logger settings.

- `postgresql-hacker-helper.srcPath` - Path to source code directory
  
  *Relative* path to custom PostgreSQL source code directory. Use it, if source
  code files are not in your workspace root (i.e. in `${workspaceFolder}/postgresql`). Used for searching for
  required files (node tag files, `pg_bsd_indent` and so on). If not specified
  search starts from workspace root. (Next, this settings will be used as `*SrcPath*`).

- `postgresql-hacker-helper.pg_bsd_indentPath` - Path to `pg_bsd_indent`
  
  Path to `pg_bsd_indent` tool. Required for formatting support. Use it if you have `pg_bsd_indent` installed globally or want to use specific version.

  - If not specified, it will be searched in `*SrcPath*/src/tools` directory.
  - If specified, and failed to run extension will try to build it.

## Compatibility

Compatibility is ensured using testing. Minimal supported versions are **PostgreSQL 9.6** and **VS Code 1.70**.

There are 2 supported debugger extensions: [C/C++](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) and [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb).
Extension always tested on *latest version of debugger* and do not tries to be compatible with old ones due to *possible* large/breaking changes in behavior (most features implemented using hacks).
Minimal supported version for **C/C++ 1.12** and **CodeLLDB 11.0**.

For using formatter minimal supported version Postgres is `10`.

## Testing

Directory [`./src/test`](./src/test) contains multiple staff for extension testing.
You can read [README](./src/test/README.md) to look at testing process.

For variables testing is performed using matrix: PG Version x VS Code Version x Debugger.
Each dimension contains all supported values: 9 (PG Versions) x 4 (VS Code Versions) x 2 (Debuggers) = 72 tests in total.

For formatting testing is performed using matrix: PG Version x VS Code Version (36 tests in total).

## Known Issues

Known issues:

- If in pointer variable was garbage, extension will not detect it and expand this variable (may be garbage).
  Usually, this will not lead to fatal errors, just note this.
- To get `NodeTag`s extension reads all available NodeTag files (from settings),
  but these files may be not created (./configure or make not run). I assume by
  time of debugging start files will be created, so extension catch them and process.
- Sometimes formatting can misbehave. This is due to `pg_bsd_indent` internal
  logic. If formatting is not applied check logs of an extension - it may contain
  error messages.
- Some operations require data to be allocated (usually, for function invocation).
  For this, `palloc` and `pfree` are used. So if you are debugging memory subsystem
  you may want to disable extension, because it may affect debugging process.
- Some operations require for some work to be done with system catalog.
  For example, to get function name using it's Oid. So, system catalog (system cache)
  can be modified during extension work.

## Contributing

Go to [Issues](https://github.com/ashenBlade/postgres-dev-helper/issues) if you want to say something: bugs, features, etc...
