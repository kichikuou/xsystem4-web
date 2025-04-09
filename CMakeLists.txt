cmake_minimum_required(VERSION 3.14)

# Rebuild external projects when download URL changes
if (CMAKE_VERSION VERSION_GREATER_EQUAL "3.24.0")
  cmake_policy(SET CMP0135 NEW)
endif()

project(xsystem4-wasm)

include(ExternalProject)

set(stagingDir ${CMAKE_CURRENT_BINARY_DIR}/stage)

set(COMMON_CFLAGS "-sWASM_WORKERS=1 -pthread --use-port=ogg --use-port=vorbis --use-port=libpng")

set(COMMON_CMAKE_ARGS
  -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
  -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
  -DCMAKE_FIND_ROOT_PATH=${stagingDir}
  -DCMAKE_STAGING_PREFIX:PATH=${stagingDir}
  -DCMAKE_INSTALL_PREFIX:PATH=${stagingDir}
  -DCMAKE_C_FLAGS=${COMMON_CFLAGS}
)

ExternalProject_Add(
  libffi
  URL https://github.com/libffi/libffi/releases/download/v3.4.7/libffi-3.4.7.tar.gz
  URL_HASH SHA1=b07136211f47fa30c0512ebd7484fde724978d99
  CONFIGURE_COMMAND emconfigure <SOURCE_DIR>/configure
                      --host=wasm32-unknown-emscripten
                      --prefix=${stagingDir}
                      --disable-shared
  BUILD_COMMAND emmake make
  INSTALL_COMMAND emmake make install
)

ExternalProject_Add(
  flac
  URL https://github.com/xiph/flac/releases/download/1.4.3/flac-1.4.3.tar.xz
  URL_HASH SHA256=6c58e69cd22348f441b861092b825e591d0b822e106de6eb0ee4d05d27205b70
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
             -DCMAKE_MODULE_PATH=${CMAKE_CURRENT_LIST_DIR}/cmake
             -DBUILD_CXXLIBS=OFF
             -DBUILD_PROGRAMS=OFF
             -DBUILD_EXAMPLES=OFF
             -DBUILD_TESTING=OFF
             -DBUILD_DOCS=OFF
             -DWITH_FORTIFY_SOURCE=OFF
             -DWITH_STACK_PROTECTOR=OFF
             -DINSTALL_MANPAGES=OFF
             -DENABLE_MULTITHREADING=OFF
  BUILD_COMMAND cmake --build <BINARY_DIR> --target FLAC
  INSTALL_COMMAND
)

ExternalProject_Add(
  opus
  URL https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz
  URL_HASH SHA256=65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
             -DOPUS_HARDENING=OFF
             -DOPUS_STACK_PROTECTOR=OFF
             -DOPUS_FORTIFY_SOURCE=OFF
)

ExternalProject_Add(
  libjpeg-turbo
  URL https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/3.1.0/libjpeg-turbo-3.1.0.tar.gz
  URL_HASH SHA1=ba3c0152f14a504018de19c9f62250d8f3351525
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
             -DENABLE_SHARED=OFF
)

ExternalProject_Add(
  libwebp
  URL https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.3.2.tar.gz
  URL_HASH SHA1=f941661a869df7347d7ca9208acb4e6d41f614de
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
             -DWEBP_LINK_STATIC=OFF
             -DWEBP_BUILD_ANIM_UTILS=OFF
             -DWEBP_BUILD_CWEBP=OFF
             -DWEBP_BUILD_DWEBP=OFF
             -DWEBP_BUILD_GIF2WEBP=OFF
             -DWEBP_BUILD_IMG2WEBP=OFF
             -DWEBP_BUILD_VWEBP=OFF
             -DWEBP_BUILD_WEBPINFO=OFF
             -DWEBP_BUILD_WEBPMUX=OFF
             -DWEBP_BUILD_EXTRAS=OFF
             -DWEBP_BUILD_WEBP_JS=OFF
             -DWEBP_USE_THREAD=OFF
)

ExternalProject_Add(
  libsndfile
  URL https://github.com/libsndfile/libsndfile/releases/download/1.0.31/libsndfile-1.0.31.tar.bz2
  URL_HASH SHA1=f16a88e7223baef7c4497536dc1b55b56811debc
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
             -DCMAKE_MODULE_PATH=${CMAKE_CURRENT_LIST_DIR}/cmake
             -DCMAKE_POLICY_VERSION_MINIMUM=3.5
             -DBUILD_SHARED_LIBS=OFF
             -DBUILD_PROGRAMS=OFF
             -DBUILD_EXAMPLES=OFF
             -DBUILD_TESTING=OFF
             -DENABLE_CPACK=OFF
  )

ExternalProject_Add_StepDependencies(libsndfile configure flac opus)

ExternalProject_Add(
  xsystem4
  SOURCE_DIR ${CMAKE_CURRENT_LIST_DIR}/xsystem4
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
              -DCMAKE_MODULE_PATH=${CMAKE_CURRENT_LIST_DIR}/cmake
              -DXSYSTEM4_INSTALL_DIR=${CMAKE_CURRENT_LIST_DIR}/dist
              -DXSYSTEM4_TS_INSTALL_DIR=${CMAKE_CURRENT_LIST_DIR}/src
  BUILD_ALWAYS YES
  )

ExternalProject_Add_StepDependencies(xsystem4 configure
  libffi libjpeg-turbo libwebp libsndfile)
