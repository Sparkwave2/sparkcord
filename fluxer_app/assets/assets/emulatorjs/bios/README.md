# BIOS files for the game player

Put BIOS files in this folder; the game player uses them automatically. Then rebuild the
web app (`sparkcord/dev/dev.sh build-app`), or with the watcher running, restart it.
They are never committed (BIOS files are copyrighted).

| System | File name (first one found is used) |
| --- | --- |
| PlayStation | `scph5501.bin`, `scph1001.bin`, `scph7001.bin`, `scph5500.bin`, `scph5502.bin`, `scph101.bin` |
| Game Boy Advance (optional) | `gba_bios.bin` |
| Atari Lynx | `lynxboot.img` |
| PC Engine CD | `syscard3.pce` |
| Atari 7800 (optional) | `7800 BIOS (U).rom` |

The other systems (NES, SNES, Game Boy, Mega Drive, Master System, Game Gear, N64, DS,
Atari 2600, Neo Geo Pocket, WonderSwan, Virtual Boy) don't need a BIOS.
