#!/usr/bin/bash

function print_help {
    cat <<EOM 
Setup environment for PostgreSQL Hacker Helper extension testing.
This script downloads specified PostgreSQL version (source code), applies patch, runs build and setups database (initdb + initial schema).
Usage: $0 --pg-version=17.4 [--src-path=/custom/src/path]

Options:
    -h, --help              Print this help message
    --pg-version            Version of PostgreSQL to install. Only 17.4 is supported now.
    --src-path              Path to directory where source code will be installed
    --threads               Number of threads to use during build

Example:
    $0 --pg-version=17.4 --src-path=/home/user/projects/postgresql
EOM
}

SRC_PATH=""
PG_VERSION=""
THREADS="1"
while [ "$1" ]; do
    ARG="$1"
    case "$ARG" in
    --src-path=*)
        SRC_PATH="${ARG#*=}"
        ;;
    --pg-version=*)
        PG_VERSION="${ARG#*=}"
        ;;
    --threads=*)
        THREADS="${ARG#*=}"
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

set -e

if [[ -z "$PG_VERSION" ]]; then
    echo "--pg-version is not set - specify PostgreSQL version"
    exit 1
fi

if [[ "$PG_VERSION" -ne '17.4' ]]; then
    echo "only 17.4 PostgreSQL version supported"
    exit 1
fi

if [[ -z "$SRC_PATH" ]]; then
    SRC_PATH="/tmp/pgsrc"
fi

CFLAGS="-O0 -g $CFLAGS"
CPPFLAGS="-O0 -g $CPPFLAGS"
INSTALL_PATH="$SRC_PATH/build"
PG_SRC_DOWNLOAD_URL="https://ftp.postgresql.org/pub/source/v${PG_VERSION}/postgresql-${PG_VERSION}.tar.gz"
PG_SRC_PATCH_FILE="$PWD/patches/pg${PG_VERSION}.patch"

# Normalize path - switch to ./src/test/assets (where this script is located)
cd "$(dirname ${BASH_SOURCE[0]:-$0})"

# Download PostgreSQL source code into specified directory
mkdir -p "$SRC_PATH"
wget -O- "$PG_SRC_DOWNLOAD_URL" | tar xvz -C "$SRC_PATH" --strip-components=1
cp ./run.sh  "$SRC_PATH"

# Apply patch with test helper function
cd "$SRC_PATH"
patch -p1 -i "$PG_SRC_PATCH_FILE"

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
pg_ctl start
psql -c "CREATE TABLE t1(x int, y int);"
psql -c "CREATE TABLE t2(x int, y int);"
pg_ctl stop
