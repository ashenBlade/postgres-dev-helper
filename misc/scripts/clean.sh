#!/usr/bin/bash

function print_help {
    cat <<EOM
Clean files after work
Usage: $0 [--full] [--build] [--database]

    --build         Clean build artifacts: object files, etc...
    --full          Reset repository to initial state
    --database      Remove database installation
    -h, --help      Print this help message

Example: $0 --full
EOM
}

function get_cluster_status() {
    # "pg_ctl status" codes:
    # 0 - initialized, running
    # 3 - initialized, not running
    # 4 - not initialized (empty dir)
    set +e
    (pg_ctl -D "$PGDATA" status 2>&1 >/dev/null) >/dev/null
    RET_STATUS="$?"
    set -e
    echo "$RET_STATUS"
}

FULL=""
BUILD=""
DATABASE=""
while [[ "$1" ]]; do
    ARG="$1"
    case $ARG in
        --full)
            FULL="1"
            ;;
        --build)
            BUILD="1"
            ;;
        --database)
            DATABASE="1"
            ;;
        --help|-h)
            print_help
            exit 0
            ;;
        *)
            echo "Unknown argument: $ARG"
            exit 1
            ;;
    esac
    shift
done

set -e -o pipefile

source "$(dirname ${BASH_SOURCE[0]:-$0})/utils.sh"
source_env_file

if [[ -n "$BUILD" ]]; then
    make clean
fi

if [[ -n "$FULL" ]]; then
    make distclean
    rm -f "$PWD/scripts/.env"
    rm -f "$PWD/scripts/env.sh"
fi

if [[ -n "$DATABASE" ]]; then
    case "$(get_cluster_status)" in
        "3")
            echo "Removing database files =============================>"
            rm -rf "$PGDATA"
            ;;
        "0")
            echo "Database is running - you need to stop it first"
            exit 1
            ;;
        "4")
            echo "Database is not initialized - nothing to remove"
            ;;
        *)
            echo "Unknown return status of 'pg_ctl status'"
            exit 1
            ;;
    esac
fi