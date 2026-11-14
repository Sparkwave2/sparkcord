// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: role name style editor (plain, gradient, rainbow, alternating, plus glow
// and animation), with a live preview of the name on dark and light backgrounds.

import styles from '@app/features/guild/components/modals/guild_tabs/guild_roles_tab/RoleStyleField.module.css';
import type {GuildRole} from '@app/features/guild/models/GuildRole';
import {StyledName} from '@app/features/role_style/RoleNameStyle';
import {ColorPickerField} from '@app/features/ui/components/form/ColorPickerField';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import type {GuildRoleStyle} from '@fluxer/schema/src/domains/guild/GuildRoleSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {PlusIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';

type StyleType = GuildRoleStyle['type'];

const TYPE_LABELS: ReadonlyArray<{type: StyleType; label: ReturnType<typeof msg>}> = [
	{type: 'solid', label: msg({message: 'Plain', comment: 'Role name style option: the plain role colour.'})},
	{type: 'gradient', label: msg({message: 'Gradient', comment: 'Role name style option: colours blending across the name.'})},
	{type: 'rainbow', label: msg({message: 'Rainbow', comment: 'Role name style option: rainbow colours across the name.'})},
	{
		type: 'alternating',
		label: msg({message: 'Alternating', comment: 'Role name style option: each letter takes the next colour in turn.'}),
	},
];

const ANIMATE_LABEL = msg({message: 'Animate', comment: 'Switch in the role name style editor: make the colours move.'});
const ANIMATE_DESCRIPTION = msg({
	message: 'The colours slowly move. Stays still for people who turned on reduced motion.',
	comment: 'Helper text under the Animate switch in the role name style editor.',
});
const GLOW_LABEL = msg({message: 'Glow', comment: 'Switch in the role name style editor: add a soft glow around the name.'});
const GLOW_DESCRIPTION = msg({
	message: 'Adds a soft glow around the name. Works with any style.',
	comment: 'Helper text under the Glow switch in the role name style editor.',
});
const GLOW_COLOR_LABEL = msg({message: 'Glow colour', comment: 'Colour picker label for the role name glow.'});
const COLOR_N_LABEL = msg({message: 'Colour {n}', comment: 'Label of one colour in a role name gradient or pattern. {n} is 1-4.'});
const REMOVE_COLOR_LABEL = msg({message: 'Remove colour', comment: 'Button that removes a colour from a role name gradient.'});
const STYLE_GROUP_LABEL = msg({message: 'Name style', comment: 'Accessible label for the role name style choices.'});

const DEFAULT_SECOND_COLORS = [0xff6fb1, 0x7f8cff, 0xffd166, 0x5ee6a8];

function colorsFor(role: GuildRole): Array<number> {
	const existing = role.style?.colors ?? [];
	if (existing.length >= 2) return [...existing];
	const first = existing[0] ?? (role.color || 0x5ee6ff);
	return [first, DEFAULT_SECOND_COLORS.find((c) => c !== first) ?? 0xff6fb1];
}

export const RoleStyleField = observer(function RoleStyleField({
	role,
	disabled,
	onChange,
}: {
	role: GuildRole;
	disabled: boolean;
	onChange: (style: GuildRoleStyle | null) => void;
}) {
	const {i18n} = useLingui();
	const style = role.style;
	const type: StyleType = style?.type ?? 'solid';
	const usesColors = type === 'gradient' || type === 'alternating';
	const colors = usesColors ? colorsFor(role) : [];

	const emit = useCallback(
		(next: Partial<GuildRoleStyle>) => {
			const merged: GuildRoleStyle = {
				type: style?.type ?? 'solid',
				colors: style?.colors ?? [],
				animated: style?.animated ?? false,
				glow: style?.glow ?? false,
				glow_color: style?.glow_color ?? null,
				...next,
			};
			if (merged.type === 'gradient' || merged.type === 'alternating') {
				if (merged.colors.length < 2) merged.colors = colorsFor(role);
			} else {
				merged.colors = [];
			}
			if (merged.type === 'solid') merged.animated = false;
			if (!merged.glow) merged.glow_color = null;
			onChange(merged.type === 'solid' && !merged.glow ? null : merged);
		},
		[style, role, onChange],
	);

	const setColor = (index: number, value: number) => {
		const next = [...colors];
		next[index] = value >>> 0;
		emit({colors: next});
	};
	const removeColor = (index: number) => emit({colors: colors.filter((_, i) => i !== index)});
	const addColor = () =>
		emit({colors: [...colors, DEFAULT_SECOND_COLORS.find((c) => !colors.includes(c)) ?? 0xffffff]});

	const previewName = role.name || 'Role';
	const previewStyle = style ? {style, color: role.color} : null;

	return (
		<div className={styles.field}>
			<div className={styles.label}>
				<Trans>Name style</Trans>
			</div>
			<div className={styles.segmented} role="radiogroup" aria-label={i18n._(STYLE_GROUP_LABEL)}>
				{TYPE_LABELS.map(({type: option, label}) => (
					<button
						key={option}
						type="button"
						role="radio"
						aria-checked={type === option}
						className={clsx(styles.segment, type === option && styles.segmentActive)}
						disabled={disabled}
						onClick={() => emit({type: option})}
					>
						{i18n._(label)}
					</button>
				))}
			</div>

			{usesColors && (
				<div className={styles.colors}>
					{colors.map((value, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: colours are edited in place by position
						<div key={index} className={styles.colorRow}>
							<ColorPickerField
								label={i18n._(COLOR_N_LABEL, {n: index + 1})}
								value={value}
								onChange={(num) => setColor(index, num)}
								disabled={disabled}
								className={styles.colorPicker}
								descriptionClassName={styles.hiddenHint}
							/>
							{colors.length > 2 && (
								<button
									type="button"
									className={styles.iconButton}
									onClick={() => removeColor(index)}
									disabled={disabled}
									aria-label={i18n._(REMOVE_COLOR_LABEL)}
								>
									<XIcon size={16} weight="bold" />
								</button>
							)}
						</div>
					))}
					{colors.length < 4 && (
						<button type="button" className={styles.addButton} onClick={addColor} disabled={disabled}>
							<PlusIcon size={14} weight="bold" />
							<Trans>Add colour</Trans>
						</button>
					)}
				</div>
			)}

			{type !== 'solid' && (
				<Switch
					label={i18n._(ANIMATE_LABEL)}
					description={i18n._(ANIMATE_DESCRIPTION)}
					value={style?.animated ?? false}
					onChange={(value) => emit({animated: value})}
					disabled={disabled}
				/>
			)}
			<Switch
				label={i18n._(GLOW_LABEL)}
				description={i18n._(GLOW_DESCRIPTION)}
				value={style?.glow ?? false}
				onChange={(value) => emit({glow: value})}
				disabled={disabled}
			/>
			{style?.glow && (
				<ColorPickerField
					label={i18n._(GLOW_COLOR_LABEL)}
					value={style.glow_color ?? (usesColors ? colors[0] : role.color || 0xffffff)}
					onChange={(num) => emit({glow_color: num >>> 0})}
					isDefaultValue={style.glow_color == null}
					onReset={() => emit({glow_color: null})}
					descriptionClassName={styles.hiddenHint}
					disabled={disabled}
				/>
			)}

			<div className={styles.previewRow} aria-hidden="true">
				{(['dark', 'light'] as const).map((theme) => (
					<div key={theme} className={clsx(`theme-${theme}`, styles.preview)}>
						<span
							className={styles.previewName}
							style={{color: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : undefined}}
						>
							<StyledName nameStyle={previewStyle}>{previewName}</StyledName>
						</span>
					</div>
				))}
			</div>
		</div>
	);
});
