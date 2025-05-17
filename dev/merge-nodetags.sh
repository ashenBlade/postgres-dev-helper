#!/usr/bin/bash

# Primarily used to update builtin node tags after major release.
# 1. Copy contents of node tags array from src/constants.ts to one file (remove leading spaces)
#        src/constants.ts -> oldnodetags
# 2. Run 'read-nodetags.sh' on new major-released nodetags.h file to get new nodetags.
#         ./read-nodetags.sh /home/user/postgresql-major-release/src/include/nodetags.h >newnodetags
# 3. Run this script on these files and update array from src/constants.ts with output
#        ./merge-nodetags.sh newnodetags oldnodetags >mergednodetags

function print_help {
    cat <<EOF
Script to merge several files with node tags into one.
This is used to add new node tags after major release.
It is literally a wrapper around "cat | sort | uniq"

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

FILES=$@
NODETAGS=""

# Collect all nodetags from files
for FILE in $FILES; do
    NODETAGS="$NODETAGS
$(cat "$FILE")"
done;

# All we need is to add new node tags so perform merge-sort with duplicates elimination.
# Also, add leading spaces for each line - this is to easy copy-paste to src/constants.ts
echo "$NODETAGS" | sort | uniq | awk '{printf("        %s\n", $1)}'