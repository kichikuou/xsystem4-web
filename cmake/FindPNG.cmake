set(PNG_FOUND TRUE)

if (NOT TARGET PNG::PNG)
  add_library(PNG::PNG INTERFACE IMPORTED)
  set_target_properties(PNG::PNG PROPERTIES
      INTERFACE_COMPILE_OPTIONS "--use-port=libpng"
      INTERFACE_LINK_OPTIONS "--use-port=libpng")
endif()
