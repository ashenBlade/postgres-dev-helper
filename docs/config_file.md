# Configuration file

Extension has config file with custom settings - `pgsql_hacker_helper.json`.
It stored inside `.vscode` folder.

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
- `memberName` - name of member of this type (also can be a flexible array member).
- `lengthExpression` - expression to be evaluated to get array length.

Length expression can be in 2 forms:

1. Member name concatenated to parent object.

   In such case `lengthExpression` is just *concatenated* to parent object as
   `parent->lengthExpression`. As it is concatenated, then you can add some
   other expressions to it, i.e. `some_member + 1`.
2. Generic expression

    `lengthExpression` represents any expression which must be evaluated to
    some number (integer). This expression starts with `!` to distinguish between
    this form and member name form.

Note: in both cases you can refer to parent object using `{}`, i.e. `!{}->member1 + {}->member2`
or the same in member form `member1 + {}->member2`.

Examples:

```json
{
    "arrays": {
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
            "typeName": "RelOptInfo",
            "memberName": "attr_needed",
            "lengthExpression": "!{}->max_attr - {}->min_attr + 1"
        }
    }
}
```

There are about lots registered special members - no need to create config
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

- `"alias"` - name of alias, i.e. `Relids`
- `"type"` - actual type, i.e. `Bitmapset *`

Example:

```json
{
    "aliases": [
        {
            "alias": "Relids",
            "type": "Bitmapset *"
        }
    ]
}
```

### Custom `typedefs.list` files

`typedefs.list` file is required for correct `pg_bsd_indent` work. It contains list of types that treated by formatter differently. During extension development you may want to create your own `typedefs.list` for your extension to later pass it to `./pgindent --list-of-typedefs=my.custom.typedefs.list`.

You can specify your custom `typedefs.list` files in configuration using `typedefs` setting.

> If `pg_bsd_indent` is not available extension will try to build it.
> It will perform all necessary work: building, patching, downloading (if necessary).
> To build old versions `pg_config` is required - it will be searched in `./src`, but if it missing will ask you to enter path to it manually.

`typedefs` setting can be either plain string or array of strings - each string is a path which can be in 2 forms:

- Absolute - specified file is used
- Relative - file with base folder as [postgresql-hacker-helper.srcPath](../README.md#extension-settings) is used

Example:

Read typedefs file `custom.typedefs.list` in current src path.

```json
{
    "typedefs": "custom.typedefs.list"
}
```

Read global typedefs file stored in temporary directory.

```json
{
    "typedefs": "/tmp/custom.typedefs.list"
}
```

You have created 2 extensions `pgext1` and `pgext2` which have custom `typedefs.list`:

```json
{
    "typedefs": [
        "contrib/pgext1/first.typedefs.list",
        "contrib/pgext2/second.typedefs.list"
    ]
}
```

> There is handy command `Find custom typedefs.list in repository` that will execute shell command to find all `*typedefs.list` files in repository.

### Custom `List` types

Usually, `List *` contains nodes (inherits from `Node`), but actually it can contain any pointer.
Extension treats all `List` as they contain `Node` variables, but you can say that this variable or struct member contains custom type (pointer to it).

This information stored in `customListTypes` member. This is array of objects:

```json
{
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

### Explore entries in Hash Tables

`HTAB *` Hash Table entries can be traversed using `hash_seq_search`, but it returns `void *` - no information about it's type.
Extension has built-in types for several `HTAB`s. If you want to create your own hash table and see entries, then you can add information about that hash table entries types.

This information stored in `htab` member. This is an array of objects similar to `customListTypes`:

```json
{
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

### Bitmask enum fields

Some types may work with enums as plain `uint32`, not `enum`, and members of enum are defined using preprocessor's `#define`.
For these cases you can specify your own enum bitmask members.

```json
{
    "enums": [
        {
            "type": "ParentType",
            "member": "enum_member",
            "flags": [
                ["EM_FIRST", "0x01"],
                ["EM_SECOND", "0x02"],
                ["EM_THIRD", "0x04"],
            ],
            "fields": [
                ["inner field", "EM_FIELD_MASK", "0xF"]
            ]
        }
    ]
}
```

Fields:

- `type` - name of the type to which "member" belongs
- `member` - name of the member with enum type (`type->member`)
- `flags` - array of enum value definitions: MACRO VALUE + NUMERIC VALUE
- `fields` - array of inner fields: human readable name of field + MACRO MASK for member + numeric value of mask
