cmake_minimum_required(VERSION 3.14)

# Rebuild external projects when download URL changes
if (CMAKE_VERSION VERSION_GREATER_EQUAL "3.24.0")
  cmake_policy(SET CMP0135 NEW)
endif()

project(xsystem4-wasm)

option(ENABLE_JSPI "Enable JSPI" OFF)

include(ExternalProject)

set(stagingDir ${CMAKE_CURRENT_BINARY_DIR}/stage)

# XXX: We don't really need pthreads, but SDL2 and libpng of Emscripten Ports
#      currently don't support WASM_WORKERS && !pthreads.
# https://github.com/emscripten-core/emscripten/issues/19667
# https://github.com/emscripten-core/emscripten/pull/18379
set(COMMON_CFLAGS "-sWASM_WORKERS=1 -pthread")

if (ENABLE_JSPI)
  # ASYNCIFY=2 does not work with SUPPORT_LONGJMP=emscripten.
  # https://github.com/emscripten-core/emscripten/issues/19672
  set(COMMON_CFLAGS "${COMMON_CFLAGS} -sSUPPORT_LONGJMP=wasm")
endif()

set(COMMON_CMAKE_ARGS
  -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
  -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
  -DCMAKE_FIND_ROOT_PATH=${stagingDir}
  -DCMAKE_STAGING_PREFIX:PATH=${stagingDir}
  -DCMAKE_INSTALL_PREFIX:PATH=${stagingDir}
  -DCMAKE_C_FLAGS=${COMMON_CFLAGS}
)

# libogg and libvorbis are available as emscripten ports, but we build them
# so that libsndfile can find them.
ExternalProject_Add(
  libogg
  URL https://github.com/xiph/ogg/releases/download/v1.3.5/libogg-1.3.5.tar.xz
  URL_HASH SHA1=5a368421a636f7faa4c2f662857cb507dffd7c99
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
)

ExternalProject_Add(
  libvorbis
  URL https://github.com/xiph/vorbis/releases/download/v1.3.7/libvorbis-1.3.7.tar.xz
  URL_HASH SHA1=0a2dd71a999656b8091506839e8007a61a8fda1f
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
)

ExternalProject_Add_StepDependencies(libvorbis configure libogg)

ExternalProject_Add(
  flac
  URL https://github.com/xiph/flac/releases/download/1.4.3/flac-1.4.3.tar.xz
  URL_HASH SHA256=6c58e69cd22348f441b861092b825e591d0b822e106de6eb0ee4d05d27205b70
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
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

ExternalProject_Add_StepDependencies(flac configure libogg)

ExternalProject_Add(
  opus
  URL https://github.com/xiph/opus/releases/download/v1.4/opus-1.4.tar.gz
  URL_HASH SHA1=c53b3a74fc26fb2c2314afe958be30d169bd029a
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
             -DOPUS_HARDENING=OFF
             -DOPUS_STACK_PROTECTOR=OFF
             -DOPUS_FORTIFY_SOURCE=OFF
)

ExternalProject_Add(
  libjpeg-turbo
  URL https://sourceforge.net/projects/libjpeg-turbo/files/2.1.2/libjpeg-turbo-2.1.2.tar.gz/download
  URL_HASH SHA1=65c51c543b1fbba6db9ff5bee474ccb0b52a929f
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
             -DBUILD_SHARED_LIBS=OFF
             -DBUILD_PROGRAMS=OFF
             -DBUILD_EXAMPLES=OFF
             -DBUILD_TESTING=OFF
             -DENABLE_CPACK=OFF
  )

ExternalProject_Add_StepDependencies(libsndfile configure libvorbis flac opus)

if (ENABLE_JSPI)
  set(DEST_DIR dist/jspi)
else ()
  set(DEST_DIR dist)
endif ()

ExternalProject_Add(
  xsystem4
  SOURCE_DIR ${CMAKE_CURRENT_LIST_DIR}/xsystem4
  CMAKE_ARGS ${COMMON_CMAKE_ARGS}
              -DENABLE_JSPI=${ENABLE_JSPI}
              -DXSYSTEM4_INSTALL_DIR=${CMAKE_CURRENT_LIST_DIR}/${DEST_DIR}
              -DXSYSTEM4_TS_INSTALL_DIR=${CMAKE_CURRENT_LIST_DIR}/src
  BUILD_ALWAYS YES
  )

ExternalProject_Add_StepDependencies(xsystem4 configure
  libjpeg-turbo libwebp libsndfile)
