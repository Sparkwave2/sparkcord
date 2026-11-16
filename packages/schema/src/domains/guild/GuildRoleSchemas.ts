// SPDX-License-Identifier: AGPL-3.0-or-later

import {PermissionStringType} from '@fluxer/schema/src/primitives/PermissionValidators';
import {Int32Type, SnowflakeStringType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

/**
 * Sparkcord: how a role's colour is drawn on member names. `solid` is the plain role
 * colour; the others use `colors` (gradient/alternating: 2-4 colours). `glow` adds a
 * soft halo (in `glow_color`, or the first colour) to any of them.
 */
export const GuildRoleStyleType = z.enum(['solid', 'gradient', 'rainbow', 'alternating']);

export const GuildRoleStyle = z.object({
	type: GuildRoleStyleType.describe('How the name is coloured'),
	colors: z
		.array(z.number().int().min(0).max(0xffffff))
		.max(4)
		.default([])
		.describe('Colours for gradient and alternating styles (2-4)'),
	animated: z.boolean().default(false).describe('Whether the colours move'),
	glow: z.boolean().default(false).describe('Whether the name glows'),
	glow_color: z.number().int().min(0).max(0xffffff).nullish().describe('Glow colour, or null to use the first colour'),
	simple_color: z
		.number()
		.int()
		.min(0)
		.max(0xffffff)
		.nullish()
		.describe('The single colour shown to people who turned on simplified role colours, or null for the mix of the colours'),
});

export type GuildRoleStyle = z.infer<typeof GuildRoleStyle>;

export const GuildRoleResponse = z.object({
	id: SnowflakeStringType.describe('The unique identifier for this role'),
	name: z.string().describe('The name of the role'),
	color: Int32Type.describe('The colour of the role as an integer'),
	position: Int32Type.describe('The position of the role in the role hierarchy'),
	hoist_position: Int32Type.nullish().describe('The position of the role in the hoisted member list'),
	permissions: PermissionStringType.describe('The permissions bitfield for the role'),
	hoist: z.boolean().describe('Whether this role is displayed separately in the member list'),
	mentionable: z.boolean().describe('Whether this role can be mentioned by anyone'),
	icon: z.string().nullable().describe('The hash of the role icon image, or null'),
	unicode_emoji: z.string().nullable().describe('The Unicode emoji used as the role icon, or null'),
	style: GuildRoleStyle.nullish().describe('Sparkcord name style (gradient, rainbow, alternating, glow), or null for plain colour'),
});

export type GuildRoleResponse = z.infer<typeof GuildRoleResponse>;

export type GuildRole = Readonly<GuildRoleResponse>;

export const GuildRoleListResponse = z.array(GuildRoleResponse);
