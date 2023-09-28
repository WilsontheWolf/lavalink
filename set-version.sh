#!/bin/bash

# This script is used to set the version of the project in the source and package files.

# Get the version from the command line.

if [ $# -ne 1 ]; then
    echo "Usage: $0 version"
    exit 1
fi

version=$1

# Set the version in the source files.
sed -i "s/const version = '.*';/const version = '$version';/" src/functions/version.js

# Set the version in the package files.
sed -i "s/\"version\": \".*\",/\"version\": \"$version\",/" package.json

echo "Version $version set."