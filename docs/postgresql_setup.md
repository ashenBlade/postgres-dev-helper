# PostgreSQL setup

PostgreSQL build is 2 staged: run `configure` script and then `make`.

## `configure`

PostgreSQL uses autoconf to setup special `pg_config.h` header file. It contains lots of macros describing target environment, compiler capabilities, etc...

To create this file you first run `./configure` script and pass various flags.
The set of flags differs between versions, but for development we can outline required:

```bash
$ ./configure --prefix=$(pwd)/build \
              --enable-debug \
              --enable-cassert \
              --enable-tap-tests \
              --enable-depend \
              CFLAGS="-O0 -g3"
```

What we used:

- `--prefix=$(pwd)/build` - tells to install all binaries inside current working directory, thus you can safely work with multiple versions of PostgreSQL without disrupting the work of others
- `--enable-debug` - add debug symbols to result binary. This is required for debugging and variable exploring.
- `--enable-cassert` - enable `Assert` macros that check state consistency. Otherwise it is easy to violate internal state.
- `--enable-tap-tests` - enable using of TAP-tests using Perl. For this you may need to install Perl on your system.
- `--enable-depend` - enable tracking of changed files in your system, so you will rebuild only required files, without rebuilding full project.
- `CFLAGS="-O0 -g3"` - tell the compiler to:
    - `-O0` - use lowest optimization level (so we can see all variables)
    - `-g3` - include as much debug symbols as we can

> Prefer using `-g3` level if you are using PostgreSQL Hacker Helper extension, because it allows to use macro definitions and other features that can significantly improve debug experience.

## `make`

The next step is actual building the sources. This is done much easier - just run `make`.

To speed up compilation you can provide number of parallel threads by `-j [THREADS]` flag (or omit to use all available - `make -j`).

When the building is done run `make install`, so all binaries will be installed in `build` directory (directory that we specified as `configure` step).
