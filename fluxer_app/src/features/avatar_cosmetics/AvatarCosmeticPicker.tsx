// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: picker for the cosmetic drawn over your avatar (Settings > Profile).
// Changes save straight away.

import {
	avatarCosmeticUrl,
	fetchMyAvatarCosmetic,
	saveMyAvatarCosmetic,
} from '@app/features/avatar_cosmetics/AvatarCosmetics';
import styles from '@app/features/avatar_cosmetics/AvatarCosmeticPicker.module.css';
import {AVATAR_COSMETICS} from '@fluxer/constants/src/AvatarCosmetics';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {useCallback, useEffect, useState} from 'react';

const FAILED = msg({
	message: "Couldn't save your avatar cosmetic. Try again.",
	comment: 'Error under the avatar cosmetic picker in profile settings.',
});
const NONE_LABEL = msg({message: 'None', comment: 'Avatar cosmetic option: wear no cosmetic.'});

export function AvatarCosmeticPicker({userId, avatarUrl}: {userId: string; avatarUrl: string | null}) {
	const {i18n} = useLingui();
	// undefined while loading.
	const [current, setCurrent] = useState<string | null | undefined>(undefined);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetchMyAvatarCosmetic()
			.then((cosmetic) => {
				if (!cancelled) setCurrent(cosmetic);
			})
			.catch(() => {
				if (!cancelled) setCurrent(null);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const choose = useCallback(
		async (cosmetic: string | null) => {
			setSaving(true);
			setError(false);
			try {
				setCurrent(await saveMyAvatarCosmetic(userId, cosmetic));
			} catch {
				setError(true);
			} finally {
				setSaving(false);
			}
		},
		[userId],
	);

	const options = [
		{id: null as string | null, label: i18n._(NONE_LABEL), overlay: null as string | null, scale: 1},
		...AVATAR_COSMETICS.map((cosmetic) => ({
			id: cosmetic.id as string | null,
			label: cosmetic.name,
			overlay: avatarCosmeticUrl(cosmetic) as string | null,
			scale: cosmetic.scale,
		})),
	];

	return (
		<div className={styles.field}>
			<div className={styles.label}>
				<Trans>Avatar cosmetic</Trans>
			</div>
			<p className={styles.description}>
				<Trans>Something to wear over your avatar, shown everywhere it appears. Saves right away.</Trans>
			</p>
			<div className={styles.grid} role="radiogroup" aria-busy={saving || current === undefined}>
				{options.map((option) => {
					const selected = current !== undefined && current === option.id;
					return (
						<button
							key={option.id ?? 'none'}
							type="button"
							role="radio"
							aria-checked={selected}
							className={clsx(styles.option, selected && styles.optionSelected)}
							disabled={saving || current === undefined}
							onClick={() => void choose(option.id)}
							title={option.label}
						>
							<span className={styles.preview}>
								{avatarUrl && <img className={styles.avatar} src={avatarUrl} alt="" draggable={false} />}
								{option.overlay && (
									<img
										className={styles.overlay}
										style={{transform: `scale(${option.scale})`}}
										src={option.overlay}
										alt=""
										draggable={false}
									/>
								)}
							</span>
							<span className={styles.optionLabel}>{option.label}</span>
						</button>
					);
				})}
			</div>
			{error && <p className={styles.error}>{i18n._(FAILED)}</p>}
		</div>
	);
}
