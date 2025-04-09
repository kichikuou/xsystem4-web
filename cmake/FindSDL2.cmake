if (NOT TARGET SDL2::SDL2)
  include(FetchContent)
  FetchContent_Declare(
    SDL
    GIT_REPOSITORY https://github.com/kichikuou/SDL.git
    GIT_TAG 68d5289e08b63eb0de41373e8d090e9789b7b346
  )
  option(SDL_PTHREADS "Use POSIX threads for multi-threading" ON)
  FetchContent_MakeAvailable(SDL)
endif()
