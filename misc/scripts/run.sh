#!/usr/bin/bash

function print_help {
    cat <<EOM
Run database and/or PSQL with settings for current installation.
Log file is written to ./scripts/postgresql.log

Usage: $0 [--init-db] [--run-db] [--psql] [--stop-db] [--script=SCRIPT]

    --init-db           Initialize database files
    --run-db            Run database
    --psql              Run PSQL
    --script=SCRIPT     Script for PSQL to run
    --stop-db           Stop running database

Example: $0 --run-db --psql --stop-db
EOM
}

set -e -o pipefail

RUN_DB=""
RUN_PSQL=""
STOP_DB=""
INIT_DB=""
PSQL_SCRIPT=""
while [[ -n "$1" ]]; do
    ARG="$1"
    case "$ARG" in
        --init-db)
            INIT_DB="1"
            ;;
        --run-db)
            RUN_DB="1"
            ;;
        --psql)
            RUN_PSQL="1"
            ;;
        --stop-db)
            STOP_DB="1"
            ;;
        --script=*)
            PSQL_SCRIPT="${ARG#*=}"
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

source "$(dirname ${BASH_SOURCE[0]:-$0})/utils.sh"
source_env_file

if [[ -n "$INIT_DB" ]]; then
    initdb -U $PGUSER || true
fi

if [[ -n "$RUN_DB" ]]; then
    LOGFILE="$PWD/scripts/postgresql.log"
    
    pg_ctl start -o "-k '$PGDATA'" -l "$LOGFILE" || true
fi

if [[ -n "$PSQL_SCRIPT" ]]; then
    psql -f "$PSQL_SCRIPT"
fi

if [[ -n "$RUN_PSQL" ]]; then
    psql
fi

if [[ -n "$STOP_DB" ]]; then
    pg_ctl stop || true
fi