if (NOT TARGET ZLIB::ZLIB)
  add_library(ZLIB::ZLIB INTERFACE IMPORTED)
  set_target_properties(ZLIB::ZLIB PROPERTIES
    INTERFACE_COMPILE_OPTIONS "--use-port=zlib"
    INTERFACE_LINK_OPTIONS "--use-port=zlib")
endif()
