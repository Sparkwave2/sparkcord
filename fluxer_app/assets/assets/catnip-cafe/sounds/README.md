# Catnip Café sounds

Drop sound files here, named as below (`.ogg`, `.mp3`, `.wav`, `.m4a`, `.opus`, `.webm` or `.flac`).
The build lists this folder in `index.json`, so the café only loads files that exist; a missing
one just stays silent, so you can add them one at a time. When the watcher is running, adding a
file triggers a rebuild; refresh the café afterwards.

| File name      | Plays when                                   |
| -------------- | -------------------------------------------- |
| `pet`          | you pet the cat                              |
| `pet-1` … `pet-4` | optional variants of the pet sound; one is picked at random (used instead of `pet` when present) |
| `buy`          | you buy a helper                             |
| `upgrade`      | you buy an upgrade or a Nine Lives perk      |
| `lucky-appear` | the Lucky Cat shows up                       |
| `lucky-catch`  | you catch the Lucky Cat                      |
| `achievement`  | you unlock an achievement                    |
| `new-life`     | you start a new life (Nine Lives)            |

Keep them short (under a second or two, except `new-life` and `achievement`) and small.
Pet and buy sounds are played with a slight random pitch change so repeats don't sound identical.
