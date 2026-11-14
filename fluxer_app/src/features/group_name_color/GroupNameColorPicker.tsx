// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: picker for the colour your name is shown in inside group chats.
// "Random" keeps the colour picked for you from your user id. Changes save straight away.

import {
	defaultGroupNameColor,
	fetchMyGroupNameColor,
	GROUP_NAME_COLORS,
	saveMyGroupNameColor,
} from '@app/features/group_name_color/GroupNameColor';
import styles from '@app/features/group_name_color/GroupNameColorPicker.module.css';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {CheckIcon, ShuffleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {useCallback, useEffect, useRef, useState} from 'react';

const FAILED = msg({
	message: "Couldn't save your group chat colour. Try again.",
	comment: 'Error under the group chat name colour picker in profile settings.',
});
const RANDOM_LABEL = msg({
	message: 'Random (picked for you)',
	comment: 'Group chat name colour option: the colour assigned automatically.',
});
const CUSTOM_LABEL = msg({
	message: 'Custom colour',
	comment: 'Group chat name colour option: choose any colour.',
});

export function GroupNameColorPicker({userId, previewName}: {userId: string; previewName: string}) {
	const {i18n} = useLingui();
	const [color, setColor] = useState<string | null | undefined>(undefined);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(false);
	const customTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetchMyGroupNameColor()
			.then((value) => {
				if (!cancelled) setColor(value);
			})
			.catch(() => {
				if (!cancelled) setColor(null);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const choose = useCallback(
		async (next: string | null) => {
			setColor(next);
			setSaving(true);
			setError(false);
			try {
				setColor(await saveMyGroupNameColor(userId, next));
			} catch {
				setError(true);
			} finally {
				setSaving(false);
			}
		},
		[userId],
	);

	// The native colour input fires continuously while dragging; save once it settles.
	const chooseCustom = useCallback(
		(next: string) => {
			setColor(next);
			if (customTimer.current) clearTimeout(customTimer.current);
			customTimer.current = setTimeout(() => void choose(next), 400);
		},
		[choose],
	);
	useEffect(() => () => void (customTimer.current && clearTimeout(customTimer.current)), []);

	const loading = color === undefined;
	const randomColor = defaultGroupNameColor(userId);
	const shown = color ?? randomColor;
	const isPalette = color != null && (GROUP_NAME_COLORS as ReadonlyArray<string>).includes(color);
	const isCustom = color != null && !isPalette;

	return (
		<div className={styles.field}>
			<div className={styles.label}>
				<Trans>Group chat colour</Trans>
			</div>
			<p className={styles.description}>
				<Trans>The colour your name is shown in inside group chats. Saves right away.</Trans>
			</p>
			<div className={styles.preview} style={{color: shown}}>
				{previewName}
			</div>
			<div className={styles.swatches} role="radiogroup" aria-busy={saving || loading}>
				<button
					type="button"
					role="radio"
					aria-checked={color === null}
					className={clsx(styles.swatch, styles.random, color === null && styles.selected)}
					style={{background: randomColor}}
					disabled={loading || saving}
					onClick={() => void choose(null)}
					title={i18n._(RANDOM_LABEL)}
					aria-label={i18n._(RANDOM_LABEL)}
				>
					{color === null ? <CheckIcon size={16} weight="bold" /> : <ShuffleIcon size={16} weight="bold" />}
				</button>
				{GROUP_NAME_COLORS.map((swatch) => (
					<button
						key={swatch}
						type="button"
						role="radio"
						aria-checked={color === swatch}
						className={clsx(styles.swatch, color === swatch && styles.selected)}
						style={{background: swatch}}
						disabled={loading || saving}
						onClick={() => void choose(swatch)}
						title={swatch}
						aria-label={swatch}
					>
						{color === swatch && <CheckIcon size={16} weight="bold" />}
					</button>
				))}
				<label
					className={clsx(styles.swatch, styles.custom, isCustom && styles.selected)}
					style={isCustom ? {background: color} : undefined}
					title={i18n._(CUSTOM_LABEL)}
				>
					<input
						type="color"
						className={styles.colorInput}
						value={shown}
						disabled={loading}
						onChange={(event) => chooseCustom(event.target.value)}
						aria-label={i18n._(CUSTOM_LABEL)}
					/>
					{isCustom ? <CheckIcon size={16} weight="bold" /> : '+'}
				</label>
			</div>
			{error && <p className={styles.error}>{i18n._(FAILED)}</p>}
		</div>
	);
}
