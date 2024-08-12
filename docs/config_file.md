# Configuration file

Extension has config file with custom settings - `pgsql_hacker_helper.json`.
It stored inside `.vscode` folder.

## Layout

There are 2 versions of config file layout.
Version is specified using top level `"version"` field.

Current version - 2.

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
    "version": 2,
    "aliases": [
        {
            "alias": "Relids",
            "type": "Bitmapset *"
        }
    ]
}
```
