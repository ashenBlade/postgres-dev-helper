#!/usr/bin/bash

function print_help {
    cat <<EOM
Run database and/or PSQL with settings for current installation.
Log file is written to ./postgresql.log.

Usage: $0 [--run] --[psql] [--stop]

    --run,  -r          Run database
    --psql, -p          Run psql and connect to database
    --stop, -s          Stop database
    --help, -h          Print this help message

Example: $0 --run

NOTE: this script is intended to run in test database
      and locate in root of src directory
EOM
}

set -e

RUN_DB=""
STOP_DB=""
RUN_PSQL=""

while [[ -n "$1" ]]; do
    ARG="$1"
    case "$ARG" in
        --run|--start|-r)
            RUN_DB="1"
            ;;
        --stop|-s)
            STOP_DB="1"
            ;;
        --psql|-p)
            RUN_PSQL="1"
            ;;
        --help|-h) 
            print_help
            exit 0
            ;;
        *)
            echo "Unknown argument: $ARG"
            print_help
            exit 1
            ;;
    esac
    shift
done

# Read environment file
ENV_FILE="$(dirname ${BASH_SOURCE[0]:-$0})/env.sh"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "env.sh file not found"
    exit 1
fi

source "$ENV_FILE"

if [ "$RUN_DB" ]; then
    # Not 0 exit code can mean DB already running.
    # For tests this is valid
    pg_ctl start -l "$PGDATA/postgresql.log" -w || true
fi

if [ "$RUN_PSQL" ]; then
    psql -U postgres
fi

if [ "$STOP_DB" ]; then
    # Halt database in any circumstances (may be cases of dangling breakpoints)
    pg_ctl stop -m immediate
fi