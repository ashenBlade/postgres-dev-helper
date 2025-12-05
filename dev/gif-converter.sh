#!/usr/bin/bash

# Simple script to convert given video file to GIF
# This uses FFMPEG with palette generation (for more
# beautiful picture)

function print_help {
    echo "Usage: $0 VIDEO_FILE [OUTPUT_FILE]

OUTPUT_FILE (if not specified) will be generated as VIDEO_FILE with extension
changed to 'gif'

Examples:   $0 video.mkv video.gif
            $0 video.mkv
"
}

if [[ "$1" == "--help" || $1 == "-h" ]]; then
    print_help
    exit 0
fi

# Exit on first error + Echo all commands
set -ex
VIDEO_FILE="$1"

if [ ! -f "$VIDEO_FILE" ]; then
    echo "$VIDEO_FILE does not exist or empty"
    print_help
    exit 1
fi

OUTPUT_FILE="$2"

if [ -z "$OUTPUT_FILE" ]; then
    OUTPUT_FILE="${VIDEO_FILE%.*}.gif"
fi

PALETTE_FILE="$(mktemp /tmp/gif-converter-XXXXXX.png)"

# Generate palette
ffmpeg -y -i "$VIDEO_FILE"                          \
    -filter_complex "[0:v] palettegen"              \
    "$PALETTE_FILE"

# Convert to GIF
ffmpeg -i "$VIDEO_FILE" -i "$PALETTE_FILE"                                  \
    -filter_complex "[0:v] fps=15,scale=720:-1 [new];[new][1:v] paletteuse" \
    "$OUTPUT_FILE"
