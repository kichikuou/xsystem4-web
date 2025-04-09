if (NOT TARGET Freetype::Freetype)
  add_library(Freetype::Freetype INTERFACE IMPORTED)
  set_target_properties(Freetype::Freetype PROPERTIES
    INTERFACE_COMPILE_OPTIONS "--use-port=freetype"
    INTERFACE_LINK_OPTIONS "--use-port=freetype")
endif()
