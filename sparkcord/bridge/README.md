# Sparkcord ↔ Discord bridge

Mirrors messages between chosen channels of one Discord server and chosen Sparkcord
channels, both ways, including edits and deletes. Messages are re-posted through
webhooks, so they show the original author's name and avatar (tuppers too).

It is one script with no dependencies. It needs Node 22 or newer and runs anywhere that
can reach both Discord and your Sparkcord instance (it does not have to be the server).

## Setup

1. **Discord bot.** In the [Discord Developer Portal](https://discord.com/developers/applications)
   create an application, add a bot, copy its token, and turn on **Message Content
   Intent** (Bot page). Invite it to your server with the `bot` scope and these
   permissions: View Channels, Manage Webhooks, Read Message History.
2. **Sparkcord bot.** In Sparkcord open Settings > Developer > Applications & bots,
   create an application with a bot, and copy its token. Add the bot to your community
   and give it a role with View Channel and Manage Webhooks in the bridged channels.
3. **Config.** Copy `bridge.config.example.json` to `bridge.config.json` and fill in:
   - `discord.token`, `discord.guild_id` (the Discord server's ID)
   - `sparkcord.url` (for example `https://sparkcord.watermelon.quest`), `sparkcord.token`
   - `links`: one `{"discord": "<channel id>", "sparkcord": "<channel id>"}` per pair

   Tokens can instead come from the environment: `BRIDGE_DISCORD_TOKEN` and
   `BRIDGE_SPARKCORD_TOKEN`. `bridge.config.json` and `bridge.state.json` are ignored by
   git; never commit them.
4. **Run.**

   ```bash
   node sparkcord/bridge/bridge.mjs
   ```

   A different config path can be given as the first argument. Keep it running with
   whatever you already use (systemd, pm2, a Docker container with `node:22-alpine`).

At start the bridge checks that every Discord channel belongs to the chosen server and
creates a webhook named "Sparkcord bridge" in each linked channel on both sides. It
stops with a clear message if a token, permission or intent is wrong.

## What is mirrored

- Text, replies (as a one-line quote), attachments and stickers (as links or names).
- Edits and deletes of the last 5000 mirrored messages (remembered in `bridge.state.json`).
- Mentions are never pinged on the other side.

Not mirrored: reactions, threads, embeds from bots, voice, and messages older than the
moment the bridge started. Attachments are passed as links to the original file, so
they stop working if the original is deleted.

## Notes

- Discord does not allow webhook names containing "discord" or "clyde"; such names are
  altered slightly.
- Avatars from Sparkcord only show on Discord when the Sparkcord instance is reachable
  from the internet.
