#!/bin/sh
set -e

if [ ! -d build ]; then
  emcmake cmake -DCMAKE_BUILD_TYPE=Release -S . -B build
fi
cmake --build build

if [ ! -d build-jspi ]; then
  emcmake cmake -DCMAKE_BUILD_TYPE=Release -DENABLE_JSPI=ON -S . -B build-jspi
fi
cmake --build build-jspi
