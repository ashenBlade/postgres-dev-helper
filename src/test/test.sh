#!/bin/bash

DEFAULT_VSCODE_VERSIONS="stable 1.90.2 1.80.2 1.70.2"
DEFAULT_PG_VERSIONS="18 17 16 15 14 13 12 11 10 9.6"
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
    --no-gui                Run tests without GUI (using 'xvfb')
    --tests                 Which test suites to run: "vars" (variables, default), "format", "unit".
                            Also, you can specify "all" to run all available tests.

Supported PG versions from 17 to 9.6 inclusive.
Default value: $DEFAULT_PG_VERSIONS

Supported VS Code versions all down to 1.67.0 and "stable" (refers to latest).
Default value: $DEFAULT_VSCODE_VERSIONS

Supported debuggers: cppdbg (C/C++), lldb (CodeLLDB). Using only latest version.
Default value: $DEFAULT_DEBUGGERS

Example:
    $0 --pg-versions="17 15 10"
    $0 --threads=15 --tests="vars,format,unit"
    $0 -j 15 --vscode-versions="stable 1.78.2" --debuggers="lldb"
EOM
}

# Exit on error
set -e -o pipefail

VSCODE_VERSIONS=""
THREADS=""
PG_VERSIONS=""
DEBUGGERS=""
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

if [[ -z "$TEST_MODES" ]]; then
    # MFU test mode
    TEST_MODES="vars"
fi

# Test mode flags
if [[ "$TEST_MODES" == *"all"* ]]; then
    TEST_VARS="1"
    TEST_FORMAT="1"
    TEST_UNIT="1";
elif [[ -z "$TEST_MODES" ]]; then
    # MFU test mode
    TEST_MODES="vars"
else
    if [[ "$TEST_MODES" == *"vars"* ]]; then TEST_VARS="1"; else TEST_VARS=""; fi;
    if [[ "$TEST_MODES" == *"format"* ]]; then TEST_FORMAT="1"; else TEST_FORMAT=""; fi;
    if [[ "$TEST_MODES" == *"unit"* ]]; then TEST_UNIT="1"; else TEST_UNIT=""; fi;
fi

# Use variable expansion instead of function for now
if [[ -z "$NO_GUI" ]]; then
    TEST_COMMAND='npm test'
else
    TEST_COMMAND='xvfb-run -a npm test'
fi

for PGVERSION in $PG_VERSIONS; do
    export PGHH_PG_VERSION="$PGVERSION"
    for VSCODEVERSION in $VSCODE_VERSIONS; do
        export PGHH_VSCODE_VERSION="$VSCODEVERSION"
        if [[ -n "$TEST_VARS" ]]; then
            for DEBUGGER in $DEBUGGERS; do
                {
                    echo "Variables testing: PostgreSQL $PGVERSION in VS Code $VSCODEVERSION using $DEBUGGER"
                    export PGHH_DEBUGGER="$DEBUGGER"
                    export PGHH_TEST_MODE="vars"

                    $TEST_COMMAND
                } 2>&1 | tee "$LOGFILE"
            done
        fi
        
        if [[ -n "$TEST_FORMAT" ]]; then
            {
                echo "Formatter testing: PostgreSQL $PGVERSION in VS Code $VSCODEVERSION"
                export PGHH_TEST_MODE="format"
                
                $TEST_COMMAND
            } 2>&1 | tee "$LOGFILE"
        fi
        
        if [[ -n "$TEST_UNIT" ]]; then
            {
                echo "Unit testing: PostgreSQL $PGVERSION in VS Code $VSCODEVERSION"
                export PGHH_TEST_MODE="unit"
                
                $TEST_COMMAND
            } 2>&1 | tee "$LOGFILE"
        fi
    done
    
    # Unit tests depend only on VS Code/NodeJS version, so can run only for 1 PG version
    TEST_UNIT=""
done
