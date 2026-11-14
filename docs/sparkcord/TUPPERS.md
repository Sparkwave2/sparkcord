# Sparkcord: tuppers (proxy members)

Sparkcord is a fork of [Fluxer](https://github.com/fluxerapp/fluxer) that builds
Tupperbox/PluralKit-style "tuppers" (proxy members) into the server and web app,
instead of relying on a bot.

## What a tupper is

A tupper belongs to one user. It has a name, an optional avatar, and one or more
proxy tags (a prefix and/or suffix, e.g. `[text]` or `Kai: text`). When the owner
sends a message whose content matches a tag, the server strips the tag and marks
the message as sent *by that tupper*. Everyone sees the tupper's name and avatar.

## Design decisions

- **Native author field, not webhooks.** A proxied message is an ordinary message
  authored by the real user, with an extra `proxy` object on the message response:

  ```json
  "proxy": {
    "tupper_id": "…",
    "name": "Kai",
    "display_name": "Kai 🌙",
    "avatar_url": "https://…",
    "color": 16711680,
    "pronouns": "they/them",
    "system_tag": "| The Collective"
  }
  ```

  Because the real user stays the author, editing, deleting, replying, pinning,
  moderation and permissions all keep working unchanged. Clients that don't know
  about `proxy` simply show the real user.

- **Snapshot at send time.** The proxy info is copied into a side table
  (`tupper_messages`) keyed by `(channel_id, message_id)`, so renaming a tupper
  doesn't rewrite history (same behaviour as the bots' webhook messages).

- **Enrichment in one place.** All message JSON is produced by the Rust
  `fluxer_messages` service and returned to the API through
  `MessageResponseDataService`. The API adds the `proxy` object there, so the Rust
  services and their prebuilt images stay untouched.

- **Storage.** New tables are declared with the API's table DSL. On the Postgres
  KV backend this needs no SQL migration.

## Proxy rules

- Tags are matched longest-first; content inside the tags must be non-empty
  (attachments-only messages may use an empty body).
- A message starting with `\` is never proxied (escape, like PluralKit).
- `keep_proxy` keeps the tag text in the message.
- Autoproxy modes per user: `off`, `front` (always a chosen tupper), `latch`
  (the last tupper used keeps proxying until another tag or `\\` is used).
- Proxying applies to guild text channels, threads, DMs and group DMs.

## Interfaces

- REST, under `/users/@me/tuppers` (CRUD, settings, import).
- Chat commands typed in any channel with prefix `tp!` (`tp!help`).
- Web app: a "Tuppers" page in user settings with create/edit, import and
  autoproxy controls; messages show the tupper name, avatar and a `PROXY` badge.

## Import formats

- **Tupperbox** export: `{ "tuppers": [ { name, avatar_url, brackets: [pre, suf, …],
  description, birthday, nick, tag, show_brackets, group_id } ], "groups": [ … ] }`
- **PluralKit** export: `{ "version": 2, "name", "tag", "members": [ { name,
  display_name, avatar_url, color, pronouns, description, birthday,
  proxy_tags: [{prefix, suffix}], keep_proxy } ] }`

Import is additive by default; a tupper with the same name is updated instead of
duplicated.
