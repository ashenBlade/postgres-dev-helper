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
To setup database `./assets` directory is used. It contains `setup.sh` script which: downloads PostgreSQL (of required version), applies patch with test function, run `./configure` script, builds binaries and creates database (with schema).

Example usage:

```bash
cd src/test/assets
./setup.sh --pg-version=17.4
```

After that, source code, binaries and database will be installed in `/tmp/pgsrc`, `/tmp/pgsrc/build` and `/tmp/pgsrc/data` accordingly.

And finally, run `test` script:

```bash
npm test
```

## Test design

There are 2 main moments, which you should take into account.

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

When performing assertions on generic variable, do not rely on `description` member (from `TreeItem`).
You can use it when working with our custom members (i.e. number from `Bitmapset`).
In other cases rely on *stable* parts - variable/member name or type.

Reason: each DAP provider uses it's own syntax, so we might get failed assertion, even though everything works correctly.
