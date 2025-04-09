if (NOT TARGET Vorbis::vorbis)
  add_library(Vorbis::vorbis INTERFACE IMPORTED)
  set_target_properties(Vorbis::vorbis PROPERTIES
    INTERFACE_COMPILE_OPTIONS "--use-port=vorbis"
    INTERFACE_LINK_OPTIONS "--use-port=vorbis")
  add_library(Vorbis::vorbisenc ALIAS Vorbis::vorbis)
  set(Vorbis_FOUND TRUE)
endif()
