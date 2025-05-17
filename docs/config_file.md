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

> NOTE: if your function is from extension, then you must prepend `EXT_NAME!` to your function name (`EXT_NAME` - name of shared library).
> Just like you see this extension name in `Call Stack` view in VS Code.
>
> i.e. for function `pgss_store` in `pg_stat_statements` you will use `pg_stat_statements!pgss_store` (because it's shared library name is `pg_stat_statements.so`).

### Explore entries in Hash Tables

`HTAB *` Hash Table entries can be traversed using `hash_seq_search`, but it returns `void *` - no information about it's type.
Extension has built-in types for several `HTAB`s. If you want to create your own hash table and see entries, then you can add information about that hash table entries types.

This information stored in `htab` member. This is an array of objects similar to `customListTypes`:

```json
{
    "version": 5,
    "htab": [
        {
            "type": "SampleType *",
            "member": ["ParentStruct", "parent_member"]
        },
        {
            "type": "SampleType *",
            "variable": ["ParentFunction", "variable_name"]
        }
    ]
}
```

Each object contain:

- `type` - fully qualified type name of entry in `HTAB`
- `member` - array of struct name and member inside this struct with `HTAB *` type. Definition looks like this:

    ```c
    typedef struct ParentStruct
    {
        HTAB *parent_member;
    } ParentStruct;
    ```

- `variable` - array of function name and variable inside this function with `HTAB *` type. Definition looks like this

    ```c
    void ParentFunction()
    {
        HTAB *variable_name;
    }
    ```

Also, there is support for `simplehash.c` hash tables ("simplehash" further). They are code generated using macros, so for each specific hash table there are functions and structures defined.
Several builtin simplehashes exists and using configuration file you can add your own.
To define your custom simplehash you need to specify 2 things: prefix and entry type:

```json
{
    "version": 5,
    "simplehash": [
        {
            "prefix": "sometableprefix",
            "type": "HashTableEntry *"
        }
    ]
}
```

So, `simplehash` is an array of objects with members defining simplehash:

- `prefix` - prefix for simplehash, that was specified by `SH_PREFIX` macro, when simplehash was defined in source code
- `type` - fully qualified type of entry stored in this simplehash

Identifiers of structures and functions are derived from `prefix` and generated the same way, i.e. `PREFIX_iterator` - structure-state for iterator.

> NOTE: compiler can apply unused symbol stripping, so after compilation there can be no structures/functions for iteration.
> In such situation, you should add some code that uses `PREFIX_iterator`, `PREFIX_start_iterate` and `PREFIX_iterate` (i.e. wrap such code with debug macros).
