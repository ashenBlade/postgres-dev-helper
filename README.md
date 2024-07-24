# PostgreSQL Hacker Helper

This is a Visual Studio Code extension to assist PostgreSQL source code developers.
It allows to investigate `Node *` variables to obtain it's real type based on `NodeTag`.

## Features

### Investigate real type of `Node *`

While debugging you can observe variables of `Node *` type with it's real type.
They appear in separate action view.

![Overview of extension](resources/overview.gif)

It behaves like Debug->Variables view, but no colorization (limitations of VS Code Extension framework) and automatically detects real type of `Node *` variables.

Also, there are intrinsics for some types:

- `List *` elements are displayed according their types

![List * expansion](resources/list.gif)

- `PlannerInfo *` simple_rte/rel_array is displayed using it's length

![Planner expansion](resources/planner.gif)

### Dump `Node *` state to log

In PostgreSQL there is `pprint(Node *)` which dumps passed Node variable to stdout with pretty printing it.
Using 'Dump Node to log' option in variable context menu you also will be able to do so.

![call pprint](resources/dump.gif)

## Extension Settings

Currently, there is not settings

## Known Issues

This is first (raw) version of extension and you can face bugs.

Known issues:

- Variable length arrays (also with Node vars) not displayed correctly (i.e. `struct Something *[]`)
- Not every `Node **` array is displayed (do not know length of array)

## Release Notes

### 0.1.0

Displaying of `Node *` variables in separate view in Debug view container.

Call `pprint(Node *)` on selected variable in `Variables` view.

## Contributing

Go to [Issues](https://github.com/ashenBlade/postgres-dev-helper/issues) if you want to say something: bugs, features, etc...
