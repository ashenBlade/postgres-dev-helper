#!/bin/bash

function print_help {
    cat <<EOM 
Setup environment for PostgreSQL Hacker Helper extension testing.
This script downloads specified PostgreSQL version (source code), applies patch, runs build and setups database (initdb + initial schema).
Source code is installed to EXT_SRC/pgsrc, where EXT_SRC - root directory of extension.

Usage: $0 --pg-version=17

Options:
    -h, --help              Print this help message
    --pg-version            Major version of PostgreSQL to install.
    --threads               Number of threads to use during build

Supported PG versions from 17 to 9.6 inclusive.

Example:
    $0 --pg-version=17
    $0 --pg-version=15
EOM
}

ARG_PG_VERSION=""
THREADS="1"
while [ "$1" ]; do
    ARG="$1"
    case "$ARG" in
    --pg-version=*)
        ARG_PG_VERSION="${ARG#*=}"
        ;;
    --threads=*)
        THREADS="${ARG#*=}"
        ;;
    -j)
        shift
        THREADS="$1"
        ;;
    --help|-h)
        print_help
        exit 0
        ;;
    *)
        echo "Unknown option: $1"
        exit 1
        ;;
    esac
    shift
done

# Exit on error
set -e -o pipefail

if [[ -z "$ARG_PG_VERSION" ]]; then
    echo "--pg-version is not set - specify PostgreSQL version"
    exit 1
fi

PG_VERSION=""
case "$ARG_PG_VERSION" in
    '17')
        PG_VERSION='17.4'
        ;;
    '16')
        PG_VERSION='16.8'
        ;;
    '15')
        PG_VERSION='15.12'
        ;;
    '14')
        PG_VERSION='14.18'
        ;;
    '13')
        PG_VERSION='13.20'
        ;;
    '12')
        PG_VERSION='12.22'
        ;;
    '11')
        PG_VERSION='11.22'
        ;;
    '10')
        PG_VERSION='10.22'
        ;;
    '9.6')
        PG_VERSION='9.6.24'
        ;;
    *)
        echo "Version $ARG_PG_VERSION is not supported"
        echo "Supported version from 17 to 9.6 inclusive"
        exit 1
        ;;
esac

# Normalize path - switch to extension root
cd "$(dirname ${BASH_SOURCE[0]:-$0})/../.."
EXT_ROOT_DIR="$PWD"

CFLAGS="-O0 -g $CFLAGS"
CPPFLAGS="-O0 -g $CPPFLAGS"
PATCH_FILE="$EXT_ROOT_DIR/src/test/patches/pg${PG_VERSION}.patch"
PG_SRC_DOWNLOAD_URL="https://ftp.postgresql.org/pub/source/v${PG_VERSION}/postgresql-${PG_VERSION}.tar.gz"
CACHEDIR="$PWD/src/test/cache"
TARFILE="$CACHEDIR/postgresql-${PG_VERSION}.tar.gz"
SRC_PATH="$EXT_ROOT_DIR/pgsrc"
INSTALL_PATH="$EXT_ROOT_DIR/pgsrc/build"
LOGDIR="$PWD/src/test/log"
LOGFILE="$LOGDIR/setup_$(date +%Y%m%d%H%M).log"
mkdir -p "$LOGDIR"

# Download PostgreSQL source code into it's directory and apply patch
{
set -e -o pipefail
rm -rf "$SRC_PATH"
mkdir -p "$SRC_PATH"
mkdir -p "$CACHEDIR"
if [[ ! -f "$TARFILE" ]]; then
    wget "$PG_SRC_DOWNLOAD_URL" -O "$TARFILE"
fi
tar -xvzf "$TARFILE" -C "$SRC_PATH" --strip-components=1
cd "$SRC_PATH"
patch -p1 -i "$PATCH_FILE"

# Run configure, build and install binaries
# Keep installation slim
./configure --prefix="$INSTALL_PATH" \
            --enable-debug \
            --enable-cassert \
            --without-openssl \
            CFLAGS="$CFLAGS" \
            CPPFLAGS="$CPPFLAGS"

# Setup special file with 
ENV_PATH="${PWD}/env.sh"
cat <<EOF >"$ENV_PATH"
export PGINSTDIR="$INSTALL_PATH"
export PGDATA="$SRC_PATH/data"
export PGHOST="localhost"
export PGPORT="5432"
export PGUSER="postgres"
export PGDATABASE="postgres"
export PATH="$INSTALL_PATH/bin:\$PATH"
LD_LIBRARY_PATH="\${LD_LIBRARY_PATH:-''}"
export LD_LIBRARY_PATH="\$PGINSTDIR/lib:\$LD_LIBRARY_PATH"
EOF

chmod +x "$ENV_PATH"
source "$ENV_PATH"

# Build binaries
make world-bin --jobs="$THREADS"
make install-world-bin

# Create database and setup schema
initdb -U "$PGUSER"
pg_ctl start -l ./postgresql.log -o '-k ""' -w
psql -c "CREATE TABLE t1(x int, y int);"
psql -c "CREATE TABLE t2(x int, y int);"
pg_ctl stop -w

# Copy test function
cp "$EXT_ROOT_DIR/src/test/run.sh" "$SRC_PATH"
} 2>&1 | tee "$LOGFILE"