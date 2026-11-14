# Theme preset images

Put one background image per preset theme here, named after the theme:

| Theme            | File name (any of .jpg .png .webp .avif) |
|------------------|------------------------------------------|
| Starry Night     | `starry-night.jpg`                       |
| Forest Mist      | `forest-mist.jpg`                        |
| Ocean Depths     | `ocean-depths.jpg`                       |
| Cherry Blossom   | `cherry-blossom.jpg`                     |
| Synthwave Sunset | `synthwave-sunset.jpg`                   |
| Rainy Café       | `rainy-cafe.jpg`                         |
| Aurora           | `aurora.jpg`                             |
| Pastel Clouds    | `pastel-clouds.jpg`                      |
| Blue Diva        | `blue-diva.jpg`                          |
| Red Diva         | `red-diva.jpg`                           |

Landscape images at least 1920 px wide look best. Keep the busy part of the picture
away from the middle-right, where the messages are.

Then run `sparkcord/dev/dev.sh theme-images`, which writes compressed WebP files into
`fluxer_app/assets/assets/theme-presets/` (served as `/assets/theme-presets/`). A theme
without an image uses a gradient in its colours instead.

The images here and the generated files are git-ignored, so they are not pushed to GitHub
unless you choose to commit them. Only do that for images you have the right to publish.
