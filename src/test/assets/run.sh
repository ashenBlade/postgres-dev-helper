#!/usr/bin/bash

function print_help {
    cat <<EOM
Run database and/or PSQL with settings for current installation.
Log file is written to ./postgresql.log

Usage: $0 [--run-db] [--stop-db]

    --run               Run database
    --stop              Stop running database
    --help, -h          Print this help message

Example: $0 --run
EOM
}

set -e

RUN_DB=""
STOP_DB=""

while [[ -n "$1" ]]; do
    ARG="$1"
    case "$ARG" in
        --run)
            RUN_DB="1"
            ;;
        --stop)
            STOP_DB="1"
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
    pg_ctl start -o '-k ""' -l ./postgresql.log -w || true
fi

if [ "$STOP_DB" ]; then
    # Halt database in any circumstances (may be cases of dangling breakpoints)
    pg_ctl stop -m immediate
fi