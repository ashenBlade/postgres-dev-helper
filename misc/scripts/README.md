# PostgreSQL development scripts

This directory contains 4 scripts for PostgreSQL development:

1. `build.sh` - run `./configure` and build source code
2. `run.sh` - manage database installation and run psql
3. `clean.sh` - clean installation or database files

Development process in example is the following:

```bash
# Run configure and prepare environment
./scripts/build.sh --configure

# Build source code (using 8 threads)
./scripts/build.sh --build -j 8

# Initialize database and run it
./scripts/run.sh --init-db --run-db

# Connect to database using PSQL
./scripts/run.sh --psql

# Stop database
./script/run.sh --stop-db
```

Each file contains `--help` message describing it's capabilities.

> Also, there is `utils.sh` file, but it is for infrastructure.

After `build.sh` script is done it's work, files `.env` and `env.sh` will be created. You can `source env.sh` and it will update your env variables, so they will contain `PG**` env variables specific for current setup and database installation.

More info you can find on [documentation page](https://ashenBlade.github.io/postgres-dev-helper).
