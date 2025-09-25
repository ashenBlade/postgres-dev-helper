#!/bin/bash

function print_help {
    cat <<EOM 
Setup environment for PostgreSQL Hacker Helper extension testing.
This script downloads specified PostgreSQL version (source code), applies patch, runs build and setups database (initdb + initial schema).
Source code is installed to EXT_SRC/pgsrc/PG_VERSION, where EXT_SRC - root directory of extension and PG_VERSION - major PostgreSQL version.

Usage: $0 --pg-version=17

Options:
    -h, --help              Print this help message
    --pg-version            Major version of PostgreSQL to install.
    --threads               Number of threads to use during build
    --force                 Remove old installation if it exists.
    --get-supported         Return list of all supported versions to initialize

Supported PG versions from 18 to 9.6 inclusive.

Example:
    $0 --pg-version=18
    $0 --pg-version=15
EOM
}

MAJOR_PG_VERSION=""
THREADS="1"
FORCE=""
while [ "$1" ]; do
    ARG="$1"
    case "$ARG" in
    --pg-version=*)
        MAJOR_PG_VERSION="${ARG#*=}"
        ;;
    --threads=*)
        THREADS="${ARG#*=}"
        ;;
    --force)
        FORCE="1"
        ;;
    -j)
        shift
        THREADS="$1"
        ;;
    --help|-h)
        print_help
        exit 0
        ;;
    --get-supported)
        echo "18 17 16 15 14 13 12 11 10 9.6"
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

if [[ -z "$MAJOR_PG_VERSION" ]]; then
    echo "--pg-version is not set - specify PostgreSQL version"
    exit 1
fi

PG_VERSION=""
case "$MAJOR_PG_VERSION" in
    '18')
        PG_VERSION='18.0'
        ;;
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
        echo "Version $MAJOR_PG_VERSION is not supported"
        echo "Supported version from 18 to 9.6 inclusive"
        exit 1
        ;;
esac

# Normalize path - switch to extension root
cd "$(dirname ${BASH_SOURCE[0]:-$0})/../.."
EXT_ROOT_DIR="$PWD"

PATCH_FILE="$EXT_ROOT_DIR/src/test/patches/pg${PG_VERSION}.patch"
PATCHES_DIR="$EXT_ROOT_DIR/src/test/patches"
PG_SRC_DOWNLOAD_URL="https://ftp.postgresql.org/pub/source/v${PG_VERSION}/postgresql-${PG_VERSION}.tar.gz"
CACHEDIR="$EXT_ROOT_DIR/src/test/cache"
TARFILE="$CACHEDIR/postgresql-${PG_VERSION}.tar.gz"
SRC_PATH="$EXT_ROOT_DIR/pgsrc/$MAJOR_PG_VERSION"
INSTALL_PATH="$SRC_PATH/build"
LOGDIR="$EXT_ROOT_DIR/src/test/log"
LOGFILE="$LOGDIR/setup_$(date +%Y%m%d%H%M).log"

set -e -o pipefail
mkdir -p "$LOGDIR"

{

if [[ -d "$SRC_PATH" ]]; then
    if [[ -z "$FORCE" ]]; then
        echo "Installation already exists. Use --force to remove old src dir"
        exit 0
    else
        rm -rf "$SRC_PATH"
    fi
fi


# Download PostgreSQL source code into it's directory and apply patch
mkdir -p "$SRC_PATH"
mkdir -p "$CACHEDIR"
if [[ ! -f "$TARFILE" ]]; then
    wget -q "$PG_SRC_DOWNLOAD_URL" -O "$TARFILE"
fi
tar -xvzf "$TARFILE" -C "$SRC_PATH" --strip-components=1 1>/dev/null
cd "$SRC_PATH"
patch -p1 -i "$PATCH_FILE"

# Run configure, build and install binaries
# Keep installation slim
./configure --prefix="$INSTALL_PATH" \
            --enable-debug \
            --enable-cassert \
            --without-openssl \
            --without-readline \
            --without-python \
            --without-tcl \
            --without-pam \
            --without-selinux \
            --without-icu \
            --without-ldap \
            --without-libxml \
            --without-libxslt \
            --without-bonjour \
            --without-lz4 \
            --without-zstd \
            --without-llvm \
            --without-zlib \
            CFLAGS="-O0 -gdwarf-5 $CFLAGS" \
            CPPFLAGS="-O0 -gdwarf-5 $CPPFLAGS"

# Setup special file with 
ENV_PATH="${PWD}/env.sh"
cat <<EOF >"$ENV_PATH"
export PGINSTDIR="$INSTALL_PATH"
export PGDATA="$SRC_PATH/data"
export PGHOST="$SRC_PATH/data"
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
cat <<EOF >>"$PGDATA/postgresql.conf"
unix_socket_directories='$PGDATA'
listen_addresses=''
port=5432
log_min_messages=DEBUG1
EOF

pg_ctl start -l "$PGDATA/postgresql.log" -w
psql -c "CREATE TABLE t1(x int, y int);"
psql -c "CREATE TABLE t2(x int, y int);"
pg_ctl stop -w

# Copy utility script
cp "$EXT_ROOT_DIR/src/test/run.sh" "$SRC_PATH"

# Copy extension configuration
mkdir -p "$SRC_PATH/.vscode"
cp "$PATCHES_DIR/pgsql_hacker_helper.json" \
   "$PATCHES_DIR/settings.json"            \
   "$PATCHES_DIR/launch.json"              \
   "$SRC_PATH/.vscode"

cp "$PATCHES_DIR/custom.typedefs.list" "$SRC_PATH"
} 2>&1 | tee "$LOGFILE"