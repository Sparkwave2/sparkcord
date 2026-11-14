// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Slash-command front end for the tp! tupper commands. Each /tp-* command collects its
// options in the composer and is turned back into the equivalent tp! text, so both forms
// run through the same handler (TupperChatCommands).

import type {Command, CommandOption} from '@app/features/devtools/hooks/useCommands';
import {useTupperNames} from '@app/features/tupper/TupperNames';
import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useMemo} from 'react';

/** How an option's value is written into the tp! command text. */
type ArgKind =
	| 'name' // an existing tupper, picked from the user's list; quoted
	| 'text' // free text; quoted so spaces survive
	| 'raw' // passed as typed (single word, e.g. a URL)
	| 'choice'; // fixed choices

interface TupperOptionSpec {
	name: string;
	kind: ArgKind;
	required: boolean;
	/** Empty value means "clear" (sent as the word clear). */
	clearable?: boolean;
	description: MessageDescriptor;
	choices?: ReadonlyArray<{name: MessageDescriptor | string; value: string}>;
}

interface TupperCommandSpec {
	sub: string;
	description: MessageDescriptor;
	options: ReadonlyArray<TupperOptionSpec>;
}

const NAME_OPTION: TupperOptionSpec = {
	name: 'tupper',
	kind: 'name',
	required: true,
	description: msg({message: 'Which tupper.', comment: 'Slash-command option: pick one of your tuppers by name.'}),
};

const TAGS_DESCRIPTION = msg({
	message: 'Proxy tag with the word text where the message goes, e.g. k:text, [text] or Kai: text. Spaces are kept.',
	comment:
		'Slash-command option for a tupper proxy tag. "text" is a literal placeholder word and must stay in English; examples k:text, [text] and Kai: text must not be translated.',
})

export const TUPPER_SLASH_COMMANDS: Readonly<Record<string, TupperCommandSpec>> = {
	'/tp-help': {
		sub: 'help',
		description: msg({message: 'Show tupper commands.', comment: 'Slash-command description for /tp-help.'}),
		options: [],
	},
	'/tp-list': {
		sub: 'list',
		description: msg({message: 'List your tuppers.', comment: 'Slash-command description for /tp-list.'}),
		options: [],
	},
	'/tp-register': {
		sub: 'register',
		description: msg({
			message: 'Create a tupper (a name you can send messages as).',
			comment: 'Slash-command description for /tp-register. A tupper is a proxy identity like in Tupperbox/PluralKit.',
		}),
		options: [
			{
				name: 'name',
				kind: 'text',
				required: true,
				description: msg({message: "The tupper's name.", comment: 'Slash-command option for a new tupper name.'}),
			},
			{name: 'tags', kind: 'text', required: true, description: TAGS_DESCRIPTION},
		],
	},
	'/tp-tags': {
		sub: 'tags',
		description: msg({
			message: "Replace a tupper's proxy tags.",
			comment: 'Slash-command description for /tp-tags.',
		}),
		options: [NAME_OPTION, {name: 'tags', kind: 'text', required: true, description: TAGS_DESCRIPTION}],
	},
	'/tp-avatar': {
		sub: 'avatar',
		description: msg({message: "Set a tupper's avatar.", comment: 'Slash-command description for /tp-avatar.'}),
		options: [
			NAME_OPTION,
			{
				name: 'url',
				kind: 'raw',
				required: true,
				clearable: true,
				description: msg({
					message: 'Image link (http or https), or leave blank to remove it.',
					comment: 'Slash-command option for a tupper avatar image URL.',
				}),
			},
		],
	},
	'/tp-rename': {
		sub: 'rename',
		description: msg({message: 'Rename a tupper.', comment: 'Slash-command description for /tp-rename.'}),
		options: [
			NAME_OPTION,
			{
				name: 'new_name',
				kind: 'text',
				required: true,
				description: msg({message: 'The new name.', comment: 'Slash-command option for renaming a tupper.'}),
			},
		],
	},
	'/tp-displayname': {
		sub: 'displayname',
		description: msg({
			message: 'Set the name shown on messages, if different from the tupper name.',
			comment: 'Slash-command description for /tp-displayname.',
		}),
		options: [
			NAME_OPTION,
			{
				name: 'display_name',
				kind: 'text',
				required: true,
				clearable: true,
				description: msg({
					message: 'Name shown on messages, or leave blank to use the tupper name.',
					comment: 'Slash-command option for a tupper display name.',
				}),
			},
		],
	},
	'/tp-remove': {
		sub: 'remove',
		description: msg({message: 'Delete a tupper.', comment: 'Slash-command description for /tp-remove.'}),
		options: [NAME_OPTION],
	},
	'/tp-auto': {
		sub: 'auto',
		description: msg({
			message: 'Autoproxy: send untagged messages as a tupper.',
			comment: 'Slash-command description for /tp-auto (autoproxy, like PluralKit).',
		}),
		options: [
			{
				name: 'mode',
				kind: 'choice',
				required: true,
				description: msg({
					message: 'Off, latch (the last tupper you used), or always one tupper.',
					comment: 'Slash-command option for the autoproxy mode.',
				}),
				choices: [
					{name: msg({message: 'Off', comment: 'Autoproxy mode choice: off.'}), value: 'off'},
					{
						name: msg({message: 'Latch (last tupper used)', comment: 'Autoproxy mode choice: latch.'}),
						value: 'latch',
					},
				],
			},
		],
	},
	'/tp-systag': {
		sub: 'systag',
		description: msg({
			message: 'Set the tag shown after every tupper name.',
			comment: 'Slash-command description for /tp-systag (system tag, like PluralKit).',
		}),
		options: [
			{
				name: 'tag',
				kind: 'text',
				required: true,
				clearable: true,
				description: msg({message: 'The tag, or leave blank to remove it.', comment: 'Slash-command option.'}),
			},
		],
	},
	'/tp-proxy': {
		sub: 'proxy',
		description: msg({
			message: 'Turn tupper proxying on or off.',
			comment: 'Slash-command description for /tp-proxy.',
		}),
		options: [
			{
				name: 'state',
				kind: 'choice',
				required: true,
				description: msg({message: 'On or off.', comment: 'Slash-command option for turning proxying on/off.'}),
				choices: [
					{name: msg({message: 'On', comment: 'Choice: turn tupper proxying on.'}), value: 'on'},
					{name: msg({message: 'Off', comment: 'Choice: turn tupper proxying off.'}), value: 'off'},
				],
			},
		],
	},
};

export function isTupperSlashCommand(name: string): boolean {
	return Object.hasOwn(TUPPER_SLASH_COMMANDS, name);
}

function quote(value: string): string {
	return `"${value.replace(/"/g, "'")}"`;
}

/**
 * Builds the tp! text for a /tp-* command from its option values (undefined = not given).
 * Returns null when a required option is missing.
 */
export function buildTupperCommandText(
	name: string,
	values: ReadonlyMap<string, string | undefined>,
): string | null {
	const spec = TUPPER_SLASH_COMMANDS[name];
	if (!spec) return null;
	const parts = [`tp!${spec.sub}`];
	for (const option of spec.options) {
		let value = values.get(option.name)?.trim();
		if (!value) {
			if (option.clearable) value = 'clear';
			else if (option.required) return null;
			else continue;
		}
		parts.push(option.kind === 'name' || option.kind === 'text' ? quote(value) : value);
	}
	return parts.join(' ');
}

/** Parses typed (not autocompleted) "/tp-name args" text into tp! text. */
export function plainTupperCommandText(content: string): string | null {
	const match = /^(\/tp-[a-z]+)(?:\s+([\s\S]*))?$/i.exec(content.trim());
	if (!match || !isTupperSlashCommand(match[1]!.toLowerCase())) return null;
	const spec = TUPPER_SLASH_COMMANDS[match[1]!.toLowerCase()]!;
	return `tp!${spec.sub}${match[2] ? ` ${match[2]}` : ''}`;
}

/** Slash-command entries for the composer's autocomplete. */
export function useTupperSlashCommands(): Array<Command> {
	const {i18n} = useLingui();
	const names = useTupperNames();
	return useMemo(() => {
		const nameChoices = names.map((name) => ({name, value: name}));
		return Object.entries(TUPPER_SLASH_COMMANDS).map(([commandName, spec]) => ({
			type: 'action' as const,
			name: commandName,
			description: i18n._(spec.description),
			options: spec.options.map((option): CommandOption => {
				let choices: Array<{name: string; value: string}> = [];
				if (option.kind === 'name') choices = nameChoices;
				else if (option.choices) {
					choices = option.choices.map((choice) => ({
						name: typeof choice.name === 'string' ? choice.name : i18n._(choice.name),
						value: choice.value,
					}));
					// /tp-auto also accepts a tupper name: always send as that tupper.
					if (option.name === 'mode') choices = [...choices, ...nameChoices];
				}
				return {
					name: option.name,
					description: i18n._(option.description),
					type: option.kind === 'name' || option.kind === 'choice' ? 'choice' : 'string',
					required: option.required,
					allowEmpty: option.clearable ?? false,
					choices,
				};
			}),
		}));
	}, [i18n.locale, names]);
}
