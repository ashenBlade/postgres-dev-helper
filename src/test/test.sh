#!/bin/bash

DEFAULT_VSCODE_VERSIONS="stable 1.90.2 1.80.2 1.70.2"
DEFAULT_PG_VERSIONS="17 16 15 14 13 12 11 10 9.6"
DEFAULT_DEBUGGERS="cppdbg lldb"

function print_help {
    cat <<EOM 
Script to run full pipeline of extension testing.
Runs test matrix: PostgreSQL x VSCode x Debugger.

Usage: $0 [--threads|-j] [--vscode-versions=VSCODEVERSIONS] [--pg-versions=PGVERSIONS] [--debuggers=DEBUGGERS] [--no-rebuild]

Options:
    -h, --help              Print this help message
    --threads, -j           Number of threads to use during build
    --vscode-versions       List of VS Code versions to test against
    --pg-versions           List of PostgreSQL versions to test against
    --debuggers             List of debug extensions to tests against
    --no-rebuild            Do not rebuild PostgreSQL at first run.
                            Useful during development when installation already present.
    --no-gui                Run tests without GUI (using 'xvfb')
    --tests                 Which test suites to run: "vars" (variables, default) and/or "format"

Supported PG versions from 17 to 9.6 inclusive.
Default value: $DEFAULT_PG_VERSIONS

Supported VS Code versions all down to 1.67.0 and "stable" (refers to latest).
Default value: $DEFAULT_VSCODE_VERSIONS

Supported debuggers: cppdbg (C/C++), lldb (CodeLLDB). Using only latest version.
Default value: $DEFAULT_DEBUGGERS

Example:
    $0 --pg-versions="17 15 10"
    $0 --threads=15 --tests="vars,format"
    $0 -j 15 --vscode-versions="stable 1.78.2" --debuggers="lldb"
EOM
}

# Exit on error
set -e -o pipefail

VSCODE_VERSIONS=""
THREADS=""
PG_VERSIONS=""
DEBUGGERS=""
NO_REBUILD=""
NO_GUI=""
TEST_MODES=""
while [ "$1" ]; do
    ARG="$1"
    case "$ARG" in
    --help|-h)
        print_help
        exit 0
        ;;
    --threads=*)
        THREADS="--threads=${ARG#*=}"
        ;;
    -j)
        shift
        THREADS="--threads=$1"
        ;;
    --vscode-versions=*)
        VSCODE_VERSIONS="${ARG#*=}"
        ;;
    --pg-versions=*)
        PG_VERSIONS="${ARG#*=}"
        ;;
    --debuggers=*)
        DEBUGGERS="${ARG#*=}"
        ;;
    --no-rebuild)
        NO_REBUILD="1"
        ;;
    --no-gui)
        NO_GUI="1"
        ;;
    --tests=*)
        TEST_MODES="${ARG#*=}"
        ;;
    *)
        echo "Unknown option: $1"
        exit 1
        ;;
    esac
    shift
done

cd "$(dirname ${BASH_SOURCE[0]:-$0})/../.."

# Setup default values
if [[ -z "$VSCODE_VERSIONS" ]]; then
    VSCODE_VERSIONS="$DEFAULT_VSCODE_VERSIONS"
fi

if [[ -z "$PG_VERSIONS" ]]; then
    PG_VERSIONS="$DEFAULT_PG_VERSIONS"
fi

if [[ -z "$DEBUGGERS" ]]; then
    DEBUGGERS="$DEFAULT_DEBUGGERS"
fi

LOGDIR="$PWD/src/test/log"
LOGFILE="$LOGDIR/test_$(date +%Y%m%d%H%M).log"
mkdir -p "$LOGDIR"

for PGVERSION in $PG_VERSIONS; do
    if [[ -z "$NO_REBUILD" ]]; then
        echo "Setup PostgreSQL $PGVERSION"
        ./src/test/setup.sh --pg-version="$PGVERSION" "$THREADS"
    fi

    export PGHH_PG_VERSION="$PGVERSION"
    for VSCODEVERSION in $VSCODE_VERSIONS; do
        export PGHH_VSCODE_VERSION="$VSCODEVERSION"
        if [[ "$TEST_MODES" == *"vars"* ]]; then
            for DEBUGGER in $DEBUGGERS; do
                {
                    echo "Variables testing: PostgreSQL $PGVERSION in VS Code $VSCODEVERSION using $DEBUGGER"
                    export PGHH_DEBUGGER="$DEBUGGER"
                    export PGHH_TEST_MODE="vars"

                    if [[ -z "$NO_GUI" ]]; then
                        npm test
                    else
                        xvfb-run -a npm test
                    fi
                } 2>&1 | tee "$LOGFILE"
            done
        fi
        
        if [[ "$TEST_MODES" == *"format"* ]]; then
            {
                echo "Formatter testing: PostgreSQL $PGVERSION in VS Code $VSCODEVERSION"
                export PGHH_TEST_MODE="format"
                if [[ -z "$NO_GUI" ]]; then
                    npm test
                else
                    xvfb-run -a npm test
                fi
            } 2>&1 | tee "$LOGFILE"
        fi
    done

    NO_REBUILD=""
done
