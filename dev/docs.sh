#!/bin/bash

# Script for working with documentation (./docs folder).
# These commands are simple, but after a few weeks off everyone will forget them,
# so this script is a lifesaver

function print_help {
    cat <<EOF
    Usage: $0 [--help] COMMAND

Wrapper around mkdocs to manage documentation folder.

--help   - show this help message

COMMAND is an action to perform:
    build - only build documentation
    serve - build documentation and start local server
    deploy - build documentation and deploy it to github pages


Examples:   $0 build
            $0 deploy
            $0 --help
EOF
}

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    print_help
    exit 0
fi

# Normalize directory - root of repository
cd -- "$(dirname "${BASH_SOURCE[0]:-$0}")/.."

# mkdocs is a python tool
source .venv/bin/activate

if [[ "$1" == "build" || "$1" == "b" ]]; then
    mkdocs build --strict
elif [[ "$1" == "serve" || "$1" == "s" ]]; then
    mkdocs serve -o
elif [[ "$1" == "deploy" || "$1" == "d" ]]; then
    mkdocs gh-deploy
else
    echo "unknown command $1"
    exit 1
fi
