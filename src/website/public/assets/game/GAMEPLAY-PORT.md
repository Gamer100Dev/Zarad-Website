# Souk Surfers — gameplay port notes

## Source selection

The repository supplied for this task, https://github.com/jirkavrba/vscode-subway-surfers, is a Visual Studio Code extension. Its \`src/extension.ts\` selects YouTube video IDs and creates a webview; \`src/player.template.html\` is a video player. It does not include the Subway Surfers game, WebGL renderer, coin system, player physics, models or levels. Importing it would embed a video, not produce a playable runner.

The playable gameplay reference used here is the MIT-licensed WebGL implementation at https://github.com/RohanChacko/Subway-Surfers (Copyright (c) 2019 Rohan Chacko). Its MIT notice is preserved in \`SUBWAY-SURFERS-SOURCE-LICENSE.txt\`.

## Port mapping

| Reference source | Zarad implementation |
| --- | --- |
| \`src/main.js\` — game loop and world update | \`spice-runner.js\` animation/UI loop and \`spice-runner-core.js\` authoritative simulation |
| \`src/player.js\` — lane changes and jump motion | \`move()\`, \`jump()\`, \`slide()\` and jump-velocity physics in \`spice-runner-core.js\` |
| \`src/coin.js\` — coins and collection | coin trails, magnet attraction, combo streak and scoring in \`spice-runner-core.js\`; CC0 gold coin mesh in \`spice-runner-webgl.js\` |
| \`src/obstacle.js\`, \`src/barrier.js\` — obstacles and collision | trains, crates, barriers, awnings, safe-lane patterns and collision windows in \`spice-runner-core.js\` |
| \`src/boost.js\` — power-ups | jetpack, coin magnet, super sneakers, hoverboard and 2× score in \`spice-runner-core.js\`; distinct Zarad pickup models in \`spice-runner-webgl.js\` |
| \`src/police.js\` — pursuit after a collision | stumble grace period, guard pressure and catch-up/game-over state in \`spice-runner-core.js\`; pursuing 3D character in \`spice-runner-webgl.js\` |
| \`src/track.js\`, \`src/ground.js\`, \`src/wall.js\` — endless level | repeating rails, sleepers, Moroccan souk walls, arches, stalls and palms in \`spice-runner-webgl.js\` |
| \`src/draw.js\`, \`src/camera.js\`, \`src/texture.js\` — rendering | native WebGL renderer, procedural meshes and CC0 GLB loader in \`spice-runner-webgl.js\` |

## Zarad presentation

The runner is an articulated Zarad character with its own scarf, colours and medallion, rather than the reference game's character texture. The environment is a Moroccan rail-market scene. The HUD includes score, in-run coins, distance, speed, multiplier, missions, wallet, career coins and personal best. No proprietary Subway Surfers binary, game texture, character or soundtrack is included.
