# PostgreSQL Hacker Helper

![Logo](./img/logo.png)

This is a VS Code extension to assist PostgreSQL Hackers - source code developers.

## Features

Extension integrates with VS Code and provides several different functionalities.

### PostgreSQL Variables exploring

During debug session separate view `PG Variables` shows contents of variables with special handling of PostgreSQL related variables:

- View `Node *` variables with real type according to `NodeTag`
- Get the contents of container types: `List *`, `HTAB *`, `Bitmapset *`
- Known array variables are rendered as normal arrays
- Render `Expr` nodes by the original expression
- Show integer enums as enum values, not integers
- Render some scalar types according to their semantics:
    - `bitmapword`
    - `XLogRecPtr`
    - `RelFileLocator`
  
![Variables view](./img/overview.gif)

You can define your own custom types, i.e. your own array variable using [configuration file](./configuration.md).

### Formatting

For C files you can use custom formatter which uses `pgindent` for formatting.

The extension will download and built any required files if needed - you do not have to do anything.

![Example formatting](./img/formatter-work.gif)

### `postgresql.conf` syntax support

PostgreSQL configuration file custom syntax is supported.
This is an add-on to the standard configuration file syntax with support for units (i.e. `kB` or `s`) and highlighting of quoted values.

![Syntax example](./img/pgconf_syntax.png)

### Extension bootstrapping

For fast extension creation you can use command `Bootstrap extension` that will create all templated files, so you do not have to create ones.

## Table of contents

- [Configuration](./configuration.md)
- [PostgreSQL setup](./postgresql_setup.md)
- [Development scripts](./dev_scripts.md)
- [VS Code setup](./vscode_setup.md)
- Tutorials:
    - [Create extension](./create_extension.md)
