# Configuration file

Extension has config file with custom settings - `pgsql_hacker_helper.json`.
It stored inside `.vscode` folder.

## Layout

There are 4 versions of config file layout.
Version is specified using `"version"` field.

Current version - 4.

> This file belongs to latest schema version.

## Json schema

There is file [`properties.schema.json`](../properties.schema.json) -
json schema file for config file.
It contains all layout versions.

Also, this file ships with extension and will be available when you
edit config file.

## Create/edit file

You can create file manually or using command `PgSQL: Open or create configuration file`.
Json schema will assist you while editing.

After editing, you should run `PgSQL: Refresh configuration file` command to
pick up changes in file and update extension state.

## Features

### Special members

Special member - is a member of some type, that needed to be processed
in a special way, not just get value and output.

All special members stored in `specialMembers` field.

Currently, there is only 1 special member type - array.

#### Array special member

Array special member (ASM) is a member, that represents array and hold pointer to it,
but it's length stored in another member. Like plain C array.

Example:

```cpp
struct Sample
{
    /* Array special member */
    int *array;
    /* Stores length of array */
    int  size;
}
```

ASMs stored in `array` field.
Each object of this array has 3 fields:

- `typeName` - name of type, which contains ASM.
    This must be name of type without any qualifiers, like 'const' or 'volatile'.
- `memberName` - name of member of this type.
- `lengthExpression` - expression to be evaluated to get array length.
    It is not just member name that contain array length - this is
    expression that getting evaluated.
    It evaluates using concatenation like `((typeName)variable)->${lengthExpression}`.
    I.e. if you add `+ 1` - it will be applied.

Examples:

```json
{
    "version": 3,
    "specialMembers": {
        "array": [
            {
                "typeName": "PlannerInfo",
                "memberName": "simple_rel_array",
                "lengthExpression": "simple_rel_array_size"
            },
            {
                "typeName": "GatherMergeState",
                "memberName": "gm_slots",
                "lengthExpression": "nreaders + 1"
            },
            {
                "typeName": "EPQState",
                "memberName": "relsubs_slot",
                "lengthExpression": "parentestate->es_range_table_size"
            }
        ]
    }
}
```

There are about 36 registered special members - no need to create config
file for them. If you have found special member that has no support - you
can add it to config file (also [create issue](https://github.com/ashenBlade/postgres-dev-helper/issues)
to add this to built-ins).

### Aliases

There are many `typedef`s in code and some of them may be for Node types.
But when resolving type extension can not find NodeTag for it and treat variable
as simple, not Node derived.
For such cases `"aliases"` field exists.

It is array which defines aliases for different Node types - when
we can not find suitable NodeTag for type we search alias and substitute type.

For now, there is 1 alias - `Relids`, which is alias for `Bitmapset *` -
`typedef Bitmapset *Relids`.

Aliases stored in top level `"aliases"` field.
Every object of array - is a pair of:

- `"alias"` - target alias, i.e. `Relids`
- `"type"` - original type, i.e. `Bitmapset *`

Example:

```json
{
    "version": 3,
    "aliases": [
        {
            "alias": "Relids",
            "type": "Bitmapset *"
        }
    ]
}
```

### Custom typedef file

typedef file is required for correct `pg_bsd_indent` work. It contains list of types that treated by formatter differently. Usually, it does not change, but sometimes you may want to change it manually. I.e. when creating new patches or testing new features.

By default, extension manages to create this file and cache for later you (optimization). But when this file should be changed it is not very handy to edit global file. So this setting is created for such cases - you just create own copy of typedefs file, edit it and use for specific workspace.

Path to this file can be in 2 forms:

- Absolute - specified file is used
- Relative - file with base folder as [postgresql-hacker-helper.srcPath](../README.md#extension-settings) is used

Example:

Read typedefs file `custom.typedefs.list` in current src path.

```json
{
    "version": 3,
    "typedefs": "custom.typedefs.list"
}
```

Read global typedefs file stored in temporary directory.

```json
{
    "version": 3,
    "typedefs": "/tmp/cached.custom.typedefs.list"
}
```

### Custom `List` types

Usually, `List *` contains nodes (inherits from `Node`), but actually it can contain any pointer.
Extension treats all `List` as they contain `Node` variables, but you can say that this variable or struct member contains custom type (pointer to it).

This information stored in `customListTypes` member. This is array of objects:

```json
{
    "version": 4,
    "customListTypes": [
        {
            "type": "MyCustomType *",
            "member": ["ParentStruct", "parent_member"]
        },
        {
            "type": "MyCustomType *",
            "variable": ["ParentFunction", "variable_name"]
        }
    ]
}
```

Each object contain:

- `type` - fully-qualified type name (that is `struct` or `pointer` should be included) to which pointer will be casted.
- `member` - pair of struct name and member of this struct. Definition looks like this:

    ```c
    typedef struct ParentStruct
    {
        List *parent_member;
    } ParentStruct;
    ```

- `variable` - pair of function name and variable inside it. Definition looks like this:

    ```c
    void
    ParentFunction()
    {
        List *variable_name;
    }
    ```

With this 2 strategies extension detects `List`s with custom types.
