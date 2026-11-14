// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {createSystemMessage} from '@app/features/devtools/utils/CommandUtils';
import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import {http} from '@app/features/platform/transport/RestTransport';
import {refreshTupperNames} from '@app/features/tupper/TupperNames';
import {
	formatProxyTag,
	parseProxyTagLines,
	TUPPER_COMMAND_PREFIX,
	type TupperWire,
} from '@app/features/tupper/TupperShared';

const HELP = [
	'**Tupper commands** (only you see these replies)',
	'`tp!register <name> <tag>` create a tupper, e.g. `tp!register Kai k:text` or `tp!register "Mira Moon" [text]`',
	'`tp!list` list your tuppers',
	'`tp!tags <name> <tag> [tag…]` replace proxy tags. Quote a tag that has spaces: `tp!tags Kai "Kai: text"`',
	'`tp!avatar <name> <url>` set the avatar',
	'`tp!rename <name> <new name>` rename',
	'`tp!displayname <name> <display name|clear>` name shown on messages',
	'`tp!remove <name>` delete',
	'`tp!auto off|latch|<name>` autoproxy: off, keep the last tupper used, or always one tupper',
	'`tp!systag <tag|clear>` tag shown after every tupper name',
	'`tp!proxy on|off` turn proxying on or off',
	'All of these also work as slash commands: type `/tp-` to pick one.',
	'Start a message with `\\` to send it as yourself. Import Tupperbox/PluralKit files in Settings → Tuppers.',
].join('\n');

/** Splits on whitespace but keeps "quoted strings" together. */
export function tokenize(input: string): Array<string> {
	const tokens: Array<string> = [];
	const pattern = /"([^"]*)"|“([^”]*)”|(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(input))) tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
	return tokens;
}

function reply(channelId: string, content: string): void {
	MessageCommands.createOptimistic(channelId, createSystemMessage(channelId, content).toJSON());
}

function errorText(error: unknown): string {
	const body = (error as {body?: {message?: string; errors?: Array<{message?: string}>}})?.body;
	return body?.errors?.[0]?.message ?? body?.message ?? (error instanceof Error ? error.message : String(error));
}

async function findTupper(name: string): Promise<TupperWire> {
	const list = (await http.get<Array<TupperWire>>(Endpoints.USER_TUPPERS)).body;
	const lower = name.toLowerCase();
	const found = list.find((t) => t.name.toLowerCase() === lower) ?? list.find((t) => t.id === name);
	if (!found) throw new Error(`No tupper named "${name}". Use \`tp!list\` to see yours.`);
	return found;
}

function tagsFrom(templates: Array<string>): Array<{prefix: string | null; suffix: string | null}> {
	const tags = parseProxyTagLines(templates.join('\n'));
	if (tags.length === 0) throw new Error('Write the tag with the word `text` where the message goes, e.g. `k:text` or `[text]`.');
	return tags;
}

function need(args: Array<string>, count: number, usage: string): void {
	if (args.length < count) throw new Error(`Usage: \`${usage}\``);
}

export async function runTupperCommand(channelId: string, content: string): Promise<void> {
	const [rawCommand = 'help', ...args] = tokenize(content.trim().slice(TUPPER_COMMAND_PREFIX.length));
	const command = rawCommand.toLowerCase();
	try {
		switch (command) {
			case 'help':
			case '':
				reply(channelId, HELP);
				return;
			case 'list': {
				const list = (await http.get<Array<TupperWire>>(Endpoints.USER_TUPPERS)).body;
				reply(
					channelId,
					list.length === 0
						? 'You have no tuppers yet. Try `tp!register Kai k:text`.'
						: `**Your tuppers (${list.length})**\n${list
								.slice(0, 50)
								.map((t) => `• **${t.name}** ${t.proxy_tags.map((tag) => `\`${formatProxyTag(tag)}\``).join(' ')}`)
								.join('\n')}${list.length > 50 ? '\n…and more in Settings → Tuppers.' : ''}`,
				);
				return;
			}
			case 'register':
			case 'new':
			case 'create': {
				need(args, 2, 'tp!register <name> <tag>');
				const [name, ...templates] = args;
				const created = (
					await http.post<TupperWire>(Endpoints.USER_TUPPERS, {body: {name, proxy_tags: tagsFrom(templates)}})
				).body;
				reply(
					channelId,
					`Registered **${created.name}**. Try: \`${created.proxy_tags.map(formatProxyTag)[0]!.replace('text', 'hello!')}\``,
				);
				return;
			}
			case 'tags':
			case 'brackets': {
				need(args, 2, 'tp!tags <name> <tag> [tag…]');
				const [name, ...templates] = args;
				const tupper = await findTupper(name!);
				await http.patch(Endpoints.USER_TUPPER(tupper.id), {body: {proxy_tags: tagsFrom(templates)}});
				reply(channelId, `Updated tags for **${tupper.name}**.`);
				return;
			}
			case 'avatar': {
				need(args, 2, 'tp!avatar <name> <url>');
				const tupper = await findTupper(args[0]!);
				const url = args[1] === 'clear' ? null : args[1];
				await http.patch(Endpoints.USER_TUPPER(tupper.id), {body: {avatar_url: url}});
				reply(channelId, `Updated the avatar of **${tupper.name}**.`);
				return;
			}
			case 'rename': {
				need(args, 2, 'tp!rename <name> <new name>');
				const tupper = await findTupper(args[0]!);
				await http.patch(Endpoints.USER_TUPPER(tupper.id), {body: {name: args.slice(1).join(' ')}});
				reply(channelId, `Renamed **${tupper.name}** to **${args.slice(1).join(' ')}**.`);
				return;
			}
			case 'displayname':
			case 'nick': {
				need(args, 2, 'tp!displayname <name> <display name|clear>');
				const tupper = await findTupper(args[0]!);
				const value = args.slice(1).join(' ');
				await http.patch(Endpoints.USER_TUPPER(tupper.id), {
					body: {display_name: value === 'clear' ? null : value},
				});
				reply(channelId, `Updated the display name of **${tupper.name}**.`);
				return;
			}
			case 'remove':
			case 'delete': {
				need(args, 1, 'tp!remove <name>');
				const tupper = await findTupper(args.join(' '));
				await http.delete(Endpoints.USER_TUPPER(tupper.id));
				reply(channelId, `Deleted **${tupper.name}**.`);
				return;
			}
			case 'auto':
			case 'autoproxy': {
				need(args, 1, 'tp!auto off|latch|<name>');
				const mode = args.join(' ');
				if (mode === 'off' || mode === 'latch') {
					await http.patch(Endpoints.USER_TUPPER_SETTINGS, {body: {autoproxy_mode: mode}});
					reply(channelId, mode === 'off' ? 'Autoproxy is off.' : 'Autoproxy latches onto the last tupper you use.');
				} else {
					const tupper = await findTupper(mode);
					await http.patch(Endpoints.USER_TUPPER_SETTINGS, {
						body: {autoproxy_mode: 'front', autoproxy_tupper_id: tupper.id},
					});
					reply(channelId, `Every message is now sent as **${tupper.name}** until \`tp!auto off\`.`);
				}
				return;
			}
			case 'systag': {
				need(args, 1, 'tp!systag <tag|clear>');
				const tag = args.join(' ');
				await http.patch(Endpoints.USER_TUPPER_SETTINGS, {body: {system_tag: tag === 'clear' ? null : tag}});
				reply(channelId, tag === 'clear' ? 'System tag cleared.' : `System tag set to \`${tag}\`.`);
				return;
			}
			case 'proxy': {
				need(args, 1, 'tp!proxy on|off');
				const enabled = args[0] !== 'off';
				await http.patch(Endpoints.USER_TUPPER_SETTINGS, {body: {proxy_enabled: enabled}});
				reply(channelId, enabled ? 'Proxying is on.' : 'Proxying is off; your messages are sent as yourself.');
				return;
			}
			default:
				reply(channelId, `Unknown command \`${command}\`.\n\n${HELP}`);
		}
	} catch (error) {
		reply(channelId, `⚠ ${errorText(error)}`);
	} finally {
		if (command !== 'help' && command !== 'list' && command !== '') void refreshTupperNames();
	}
}
