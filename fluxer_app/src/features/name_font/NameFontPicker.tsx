// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: picker for the font your name is shown in, account-wide or for one
// community (where it can also fall back to the account font or the normal font).
// Changes save straight away.

import {invalidateNameFont, nameFontFamily} from '@app/features/name_font/NameFont';
import styles from '@app/features/name_font/NameFontPicker.module.css';
import {http} from '@app/features/platform/transport/RestTransport';
import {NAME_FONT_NONE, NAME_FONTS} from '@fluxer/constants/src/NameFonts';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {useCallback, useEffect, useState} from 'react';

interface MyFonts {
	font: string | null;
	guilds: Record<string, string>;
}

const FAILED = msg({
	message: "Couldn't save your name font. Try again.",
	comment: 'Error under the name font picker in profile settings.',
});
const DEFAULT_LABEL = msg({message: 'Default', comment: 'Name font option: the normal app font.'});
const ACCOUNT_LABEL = msg({
	message: 'Account font',
	comment: 'Name font option in a community profile: use the font chosen for the whole account.',
});

export function NameFontPicker({
	userId,
	guildId,
	previewName,
	disabled,
}: {
	userId: string;
	guildId: string | null;
	previewName: string;
	disabled?: boolean;
}) {
	const {i18n} = useLingui();
	const [mine, setMine] = useState<MyFonts | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		http
			.get<MyFonts>('/users/@me/name-font')
			.then((res) => {
				if (!cancelled) setMine(res.body);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	// For a community: undefined = use account font, "none" = normal font, else a font id.
	const current = guildId ? mine?.guilds[guildId] : (mine?.font ?? null);

	const choose = useCallback(
		async (font: string | null) => {
			setSaving(true);
			setError(false);
			try {
				const res = await http.put<MyFonts>('/users/@me/name-font', {body: {font, guild_id: guildId}});
				setMine(res.body);
				invalidateNameFont(userId);
			} catch {
				setError(true);
			} finally {
				setSaving(false);
			}
		},
		[guildId, userId],
	);

	const options: Array<{key: string; label: string; font: string | null; value: string | null; selected: boolean}> = [];
	if (guildId) {
		options.push({
			key: 'account',
			label: i18n._(ACCOUNT_LABEL),
			font: mine?.font ?? null,
			value: null,
			selected: current === undefined,
		});
		options.push({
			key: 'none',
			label: i18n._(DEFAULT_LABEL),
			font: null,
			value: NAME_FONT_NONE,
			selected: current === NAME_FONT_NONE,
		});
	} else {
		options.push({key: 'none', label: i18n._(DEFAULT_LABEL), font: null, value: null, selected: current === null});
	}
	for (const font of NAME_FONTS) {
		options.push({key: font.id, label: font.family, font: font.id, value: font.id, selected: current === font.id});
	}

	return (
		<div className={styles.field}>
			<div className={styles.label}>
				<Trans>Name font</Trans>
			</div>
			<p className={styles.description}>
				{guildId ? (
					<Trans>The font your name is shown in, in this community only. Saves right away.</Trans>
				) : (
					<Trans>The font your name is shown in, everywhere. Saves right away.</Trans>
				)}
			</p>
			<div className={styles.grid} role="radiogroup" aria-busy={saving || mine === null}>
				{options.map((option) => (
					<button
						key={option.key}
						type="button"
						role="radio"
						aria-checked={option.selected}
						className={clsx(styles.option, option.selected && styles.optionSelected)}
						disabled={disabled || saving || mine === null}
						onClick={() => void choose(option.value)}
						title={option.label}
					>
						<span className={styles.sample} style={{fontFamily: nameFontFamily(option.font)}}>
							{previewName}
						</span>
						<span className={styles.optionLabel}>{option.label}</span>
					</button>
				))}
			</div>
			{error && <p className={styles.error}>{i18n._(FAILED)}</p>}
		</div>
	);
}
