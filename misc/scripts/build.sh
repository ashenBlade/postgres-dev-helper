#!/usr/bin/bash

function print_help {
    cat <<EOM
Build PostgreSQL sources
Usage: $0 [--build] [-j N|--jobs=N] [--configure] [--configure-args=ARGS]

Options:

    -h, --help              Print this help message
    --build                 Run build
    --configure             Run configure script
    --bootstrap             Shortcut to specify both build and configure
    --configure-args=ARGS   Additional arguments for configure script
    -j N, --jobs=N          Number of threads to use for compilation

Example: $0 --build -j 12
         $0 --bootstrap -j 16 --configure-args='--without-openssl'
EOM
}

set -e -o pipefail

THREADS=""
CONFIGURE_ARGS=""
BUILD=""
CONFIGURE=""
while [ "$1" ]; do
    ARG="$1"
    case $ARG in
    --build)
        BUILD="1"
        ;;
    -j)
        shift
        THREADS="$1"
        ;;
    --jobs=*)
        THREADS="${$1#*=}"
        ;;
    --configure)
        CONFIGURE="1"
        ;;
    --bootstrap)
        BUILD="1"
        CONFIGURE="1"
        ;;
    --configure-args=*)
        CONFIGURE_ARGS="${ARG#*=}"
        ;;
    -h|--help)
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
source "$PWD/scripts/utils.sh"

if [[ -n "$CONFIGURE" ]]; then
    CFLAGS="-O0 -g3 $CFLAGS"
    CPPFLAGS="-O0 -g3 $CPPFLAGS"
    PGINSTDIR="$PWD/build"

    ./configure --prefix="$PGINSTDIR" \
                --enable-debug \
                --enable-cassert \
                --enable-tap-tests \
                --enable-depend \
                --with-openssl \
                CFLAGS="$CFLAGS" \
                CPPFLAGS="$CPPFLAGS" \
                $CONFIGURE_ARGS

    SHENVFILE="$PWD/scripts/env.sh"
    cat <<EOF >"$SHENVFILE"
export PGINSTDIR="$PGINSTDIR"
export PGDATA="$PWD/data"
export PGHOST="localhost"
export PGPORT="5432"
export PGUSER="postgres"
export PGDATABASE="postgres"
export PATH="$PGINSTDIR/bin:\$PATH"
LD_LIBRARY_PATH="\${LD_LIBRARY_PATH:-''}"
export LD_LIBRARY_PATH="\$PGINSTDIR/lib:\$LD_LIBRARY_PATH"
EOF
    chmod +x "$SHENVFILE"
    
    cat <<EOF >"$PWD/scripts/.env"
PGINSTDIR="$PGINSTDIR"
PGDATA="$PWD/data"
PGHOST="localhost"
PGPORT="5432"
PGUSER="postgres"
PGDATABASE="postgres"
PATH="$PGINSTDIR/bin:\$PATH"
LD_LIBRARY_PATH="\${LD_LIBRARY_PATH:-''}"
LD_LIBRARY_PATH="\$PGINSTDIR/lib:\$LD_LIBRARY_PATH"
EOF
fi

if [[ -n "$BUILD" ]]; then
    source "$PWD/scripts/utils.sh"
    source_env_file

    if [[ -n "$THREADS" ]]; then
        THREADS="-j $THREADS"
    fi

    make $THREADS
    make install
    make install-world-bin
fi
