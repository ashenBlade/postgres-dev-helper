# Testing

Extension is tested only using integration tests. The are 2 main reasons:

1. Difficulty with mocking of DAP behavior - this is hard to mimic every possible scenario (even harder to mock generic expression evaluation)
2. Test matrix is too large to mock every possible use case. There are lots of pair combinations: PostgreSQL version, VS Code version, Debugger extension.
3. Unit test will add extra code cohesion, so it will be hard for us to perform refactoring or change source code in some way.

So, testing is done as some form of snapshot testing: setup environment (run DB and connect to backend), attach to backend using debugger, run some query and wait until breakpoint hit.
After that we get variables from the 'PG VARIABLES' view and compare `TreeItem`s.

## Running tests

Firstly, you must setup environment.

We do not mock behavior, instead run database and perform operations on it.
To setup database `./src/test/setup.sh` script is used, which:

1. downloads PostgreSQL (of required version)
2. applies patch with test function
3. run `./configure` script
4. builds binaries
5. creates database (with schema).

Example usage:

```bash
./src/test/setup.sh --pg-version=17.4
```

> To initialize all versions at once use:
>
> ```bash
> for VERSION in $(./src/test/setup.sh --get-supported); do ./src/test/setup.sh --pg-version="$VERSION"; done
> ```

After that, source code, binaries and database will be installed in `./pgsrc/VERSION`, `./pgsrc/VERSION/build` and `./pgsrc/VERSION/data` accordingly (starting from extension directory root), where `VERSION` - is a major version of PostgreSQL.
UNIX socket is used for connection - `EXT_ROOT/pgsrc/VERSION/data/.s.PGSQL.5432`.

To run tests use `./src/test/test.sh` script:

```bash
./src/test/test.sh
```

It will run test pipeline with full matrix testing:

- PG Version: 17 - 9.6
- VS Code version: stable, 1.90, 1.80, 1.70
- Debugger: CppDbg, CodeLLDB

There are useful flags that allows to specify which value range to use:

```bash
./src/test/test.sh --pg-versions="17 16 15" \
                   --vscode-versions="stable 1.90" \
                   --debuggers="lldb"
```

Use `--help` flag to get more info about.

## Test design

There are 2 main moments, which you should take into account if you want to write tests.

### Sequential execution

Logic must be run sequentially, not in parallel. This applies both to `tests` and code in these tests.
A vivid example - do not use `Promise.all` in tests.

Reason: many operations require requests to DAP, but it access to it must be performed sequentially.

### Assertions

When performing comparisons for `assert`s use *string* representation, but other (even if you know that there will be number).

Reasons:

1. After parsing you can get i.e. `Number.NAN`. In assertions (i.e. `assert.equal`) we will not know why the value is invalid.
2. We should be flexible enough to change layout of displayed data

## Do not check `description`

When performing assertions on generic variable, do not rely on `description` member (from `vscode.TreeItem`).
You can use it when working with our custom members (i.e. number from `Bitmapset`).
In other cases rely on *stable* parts - variable/member name or type.

Reason: each DAP provider uses it's own syntax, so we might get failed assertion, even though everything works correctly.
