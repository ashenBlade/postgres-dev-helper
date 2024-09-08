#!/usr/bin/bash


function print_help {
    cat <<EOF
Script to read NodeTag values from header file.
Pass list of files as arguments. At least one.

Usage: $0 [FILES...]
EOF
}

if [ "$#" -lt 1 ]; then
    echo "No files provided"
    print_help
    exit 1
fi

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    print_help
    exit 0
fi

awk '{
    if (index($1, "T_") != 0) {
        $1 = gensub(/T_/, "", "g", $1)
        $1 = gensub(/,/, "", "g", $1)
        if (index($1, " ") == 0) {
            print $1
        }
    }
}' $@ | sort | uniq | awk "{ print \"'\" \$1 \"',\" }"

