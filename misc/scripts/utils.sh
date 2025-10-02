#!/usr/bin/bash

# Normalize cwd - root of repository (this script inside 'scripts')
cd -- "$(dirname "${BASH_SOURCE[0]:-$0}")/.."

function source_env_file {
    # CWD must be already adjusted to top level repository directory
    CONFIG_FILE="$PWD/scripts/env.sh"
    if [[ ! -s "$CONFIG_FILE" ]]; then
        echo "ERROR: ./scripts/env.sh does not exist or empty. " \
             "Ensure you have run \"./scripts/build.sh --configure\""
        exit 1
    fi
    source "$CONFIG_FILE"
}
