# Configuration

Extension has multiple settings to customize different aspects.

## VS Code settings

There are 4 settings:

- `postgresql-hacker-helper.logLevel` - minimum log level (for old VS Code up to 1.74.0).

  Minimum level of log messages. By default - `INFO`.
  If using VS Code 1.74.0 ang greater use `Output` channel logger settings.

- `postgresql-hacker-helper.srcPath` - Path to source code directory
  
  *Relative* path to custom PostgreSQL source code directory. Use it, if source
  code files are not in your workspace root (i.e. in `${workspaceFolder}/postgresql`).
  Used for searching files (node tag files, `pg_bsd_indent` and so on).
  If not specified search starts from workspace root.

- `postgresql-hacker-helper.pg_bsd_indentPath` - Path to `pg_bsd_indent`
  
  Path to `pg_bsd_indent` tool. Required for formatting support. Use it if you have `pg_bsd_indent` installed globally or want to use specific version.

  - If not specified, it will be searched in `*srcPath*/src/tools` directory.
  - If specified, and failed to run extension will try to build it.

- `postgresql-hacker-helper.maxContainerLength` - max length of elements shown in container types: `List`, arrays, `Bitmapset`, hash tables, etc...

  How many elements must be shown in elements of container type.
  This setting must prevent using garbage stored in fields.
  
  Default: `128`

## Configuration file

Extension has config file with custom settings - `.vscode/pgsql_hacker_helper.json`.

You can create file manually or using command `PgSQL: Open or create configuration file`. Json schema will assist you while editing.

Extension tracks changes in the file and rereads it, when necessary. Also, you can run `PgSQL: Refresh configuration file` command.

> NOTE: after debug session have started changes in configuration file will not be reflected.

### Arrays

```json
{
    "arrays": [
        {
            // struct name without any qualifiers (const, volatile, etc...)
            "typeName": "string",
            // name of member in that struct, storing array
            "memberName": "string",
            // expression to evaluate to get length
            "lengthExpression": "string"
        }
    ]
}
```

In PostgreSQL arrays can be stored in `List *` variables or as simple C-arrays: struct member storing pointer and another member storing it's length.

For given struct...

```cpp
struct Sample
{
    /* Array */
    int *array;
    /* Length of array */
    int  size;
}
```

...we have next configuration entry:

```json
{
     "arrays": [
         {
            "typeName": "Sample",
            "memberName": "array",
            "lengthExpression": "size"
         }
     ]
}
```

Length expression can be in 2 forms:

1. Member name concatenated to parent object.

   In such case `lengthExpression` is just *concatenated* to parent object as
   `parent->lengthExpression`. As it is concatenated, then you can add some
   other expressions to it.

   Example above: `size` will be evaluated as `((Sample *)0xFFFF)->size`

2. Generic expression (starts with `!`)

    `lengthExpression` represents arbitrary expression which must be evaluated to
    some number (integer). This expression starts with `!` to distinguish between
    this form and member name form.

    Example above: `!{}->size` will be evaluated as `((ParentType)0xFFFF)->size`

NOTES:

1. You can refer to parent object using `{}`, i.e. `!{}->member1 + {}->member2` or the same in member form `member1 + {}->member2`.
2. Expression can contain any other entries, i.e. for `PlannerInfo->simple_rel_array` expression is `simple_rel_array_size + 1`.

### Aliases (`typedef`)

```json
{
    "aliases": [
        {
            // Name of alias
            "alias": "string",
            // Actual type
            "type": "string"
        }
    ]
}
```

There are many `typedef`s in code and some of them may be for Node types. But, when resolving type, extension can not know that it is actually a typedef, so treat variable as simple, not Node derived.
For such cases `"aliases"` field exists.

It is array which defines aliases for different Node types - when we can not find suitable NodeTag for type we search alias and substitute type.

Example: `typedef Bitmapset *Relids` - there is no `T_Relids` in the code, but `T_Bitmapset` exist.

For it you can use this entry:

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

### Custom `List *` pointer types

```json
{
    "customListTypes": [
        {
            // Struct or function name containing this 'List *' variable
            "parent": "string",
            // Name of member/variable inside "parent"
            "member": "string",
            // Actual pointer type
            "type": "string"
        }
    ]
}
```

Usually, `List *` contains Node types, but actually it can contain any pointer. Extension treats all `List` as they contain `Node` variables, but some lists contain non-Node types.

You can specify your own custom types using `customListTypes` member.

For this code...

```c
typedef struct SampleData
{
    int value;
} SampleData;

typedef struct Sample
{
    // Contains SampleData
    List *data;
} Sample;

void do_work()
{
    List *list;
    SampleData *data;
    
    data = palloc(sizeof(SampleData));
    data->value = 1;
    list = list_make1(data);
    
    /* ... */
}

```

...you can define this configuration:

```json
{
    "customListTypes": [
        {
            "type": "SampleData *",
            // Member of struct
            "parent": "Sample",
            "member": "data"
        },
        {
            "type": "SampleData *",
            // Variable inside function
            "parent": "create_sample",
            "member": "list"
        }
    ]
}
```

> As you can mention, configuration is generalized, because it's clear from context how to handle `parent`

### HashTable entries

#### `HTAB`

```json
{
    "htab": [
        {
            // Struct or function name containing this HTAB
            "parent": "string",
            // Member/variable name inside parent
            "member": "string",
            // Stored type
            "type": "string"
        }
    ]
}
```

`HTAB *` Hash Table entries can be showed using `hash_seq_search`, but it returns `void *` - no information about it's type. Extension has built-in types for some `HTAB`s.

For the following code...

```c
typedef struct SampleData
{
    int value;
} SampleData;

typedef struct Sample
{
    HTAB *data;
} Sample;

void do_work()
{
    HTAB *htab = create_htab();
    Sample *sample = palloc(sizeof(Sample));
    sample->data = htab;
    
    /* ... */
}
```

...you can define next configuration:

```json
{
    "htab": [
        {
            "parent": "Sample",
            "member": "data",
            "type": "SampleData *"
        },
        {
            "parent": "do_work",
            "member": "htab",
            "type": "SampleData *"
        }
    ]
}
```

> You can notice that configuration entry schema is the same as for custom `List *` type.

#### `_hash` - simplehash

```json
{
    "simplehash": [
        {
            // Prefix as you defined using SH_PREFIX
            "prefix": "string",
            // Stored type
            "type": "string"
        }
    ]
}
```

Also, there is support for `lib/simplehash.h` hash tables ("simplehash" further). They are code generated using macros, so for each specific hash table there are functions and structures defined.

For the following code...

```c
typedef struct SimpleHashEntry
{
    int value;
} SimpleHashEntry;

#define SH_PREFIX           custom_prefix
#define SH_ELEMENT_TYPE     SimpleHashEntry
#include "lib/simplehash.h"
```

...define next configuration:

```json
{
    "simplehash": [
        {
            "prefix": "custom_prefix",
            "type": "SimpleHashEntry *"
        }
    ]
}
```

Identifiers of structures and functions are derived from `prefix` and generated the same way, i.e. `PREFIX_iterator` - structure-state for iterator.

> NOTE: compiler can apply unused symbol stripping, so after compilation there can be no structures/functions for iteration.
> In such situation, you should add some code that uses `PREFIX_iterator`, `PREFIX_start_iterate` and `PREFIX_iterate` (i.e. wrap such code with debug macros).

### Integer enum fields

```json
{
    "enums": [
        {
            // Name of struct
            "type": "string",
            // Member of struct containing enum
            "member": "string",
            // Enum values stored in field: pair of macro name and declared value
            "flags": [
                ["Mask (macro)", "Mask (integer)"],
            ],
            // Fields stored in field, values for which is got using bitmask
            "fields": [
                ["Field name", "Mask (macro)", "Mask (integer)"]
            ]
        }
    ]
}
```

Some types may work with enums as plain `uint32` (not `enum`) and members of enum are defined using preprocessor's `#define`. For such types you can specify your own enum bitmask members.

For the following code...

```c
typedef struct ParentType
{
    int enum_member;
} ParentType;

/* Enum values */
#define EM_NOTHING  0x10
#define EM_SINGLE   0x20
#define EM_MULTIPLE 0x40

/* Mask to get length */
#define EM_LENGTH_MASK 0xF

void some_function(ParentType *parent)
{
    if (parent->enum_member & EM_MULTIPLE)
    {
        int length = parent->enum_member & EM_LENGTH_MASK;
    }
}
```

...you can use configuration:

```json
{
    "enums": [
        {
            "type": "ParentType",
            "member": "enum_member",
            "flags": [
                ["EM_NOTHING",  "0x10"],
                ["EM_SINGLE",   "0x20"],
                ["EM_MULTIPLE", "0x40"],
            ],
            "fields": [
                ["length", "EM_LENGTH_MASK", "0xF"]
            ]
        }
    ]
}
```

> NOTE: macro definitions are added to debug symbols only when using `-g3` level during compilation, otherwise debugger can not use macro names.
> If debugger can not use macros it will switch to numeric values - that because numeric values are required.

### NodeTags

```json
{
    // Array of custom NodeTag values
    "nodetags": [
        "string"
    ]
}
```

NodeTag values are required to find Node types. Extension ships with set of builtin tags, but they can be outdated or you are created new Node type. If so, just add them to this list.

> If you specify type with `T_` prefix - it will be trimmed.

Also, when debug session starts, extension will parse `nodetags.h` file to find new NodeTags. If it will find some, then extension will automatically add them to this list.

### Custom `typedefs.list`

```json
{
    "typedefs": [
        "/path/to/typedefs.list"
    ]
}
```

For formatting `src/tools/pgindent` is used. It requires `typedefs.list` file for correct work - one lies inside directory itself, but when you are developing extension you may have your own copy for extension's types.

`typedefs` setting contains list of `typedefs.list` files - each string is a path which can be in 2 forms:

- Absolute - specified file is used
- Relative - file with base folder as [postgresql-hacker-helper.srcPath](#vs-code-settings) is used

Example:

```json
{
    "typedefs": [
        "contrib/pgext1/first.typedefs.list",
        "contrib/pgext2/second.typedefs.list"
    ]
}
```

For convenience, if you will try to format file in contrib's directory, extension will try to detect `typedefs.list` in it without specifying it explicitly in configuration file. I.e. if you are formatting file `contrib/my_ext/my_ext.c`, then extension will probe `contrib/my_ext/typedefs.list`.

> There is handy command `PgSQL: Find custom typedefs.list in repository` that will execute shell command to find all `*typedefs.list` files in repository.
