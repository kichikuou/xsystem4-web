#!/bin/sh
set -e

if [ ! -d build ]; then
  emcmake cmake -DCMAKE_BUILD_TYPE=Release -S . -B build
fi
cmake --build build
