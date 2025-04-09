if (NOT TARGET Ogg::ogg)
  add_library(Ogg::ogg INTERFACE IMPORTED)
  set_target_properties(Ogg::ogg PROPERTIES
    INTERFACE_COMPILE_OPTIONS "--use-port=ogg"
    INTERFACE_LINK_OPTIONS "--use-port=ogg")
  set(Ogg_FOUND TRUE)
  set(OGG_FOUND TRUE)
endif()
