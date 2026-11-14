// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: shown in the emoji/sticker info card for a personal emoji or sticker —
// whose it is, and a button to save a copy into your own collection.

import styles from '@app/features/personal_expression/PersonalExpressionInfoSection.module.css';
import PersonalExpressions, {type PersonalExpressionInfo} from '@app/features/personal_expression/PersonalExpressions';
import {Button} from '@app/features/ui/button/Button';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

/** Looks up whether an emoji/sticker id is a personal one (undefined while loading). */
export function usePersonalExpressionInfo(expressionId: string | null): PersonalExpressionInfo | null | undefined {
	const [info, setInfo] = useState<PersonalExpressionInfo | null | undefined>(expressionId ? undefined : null);
	useEffect(() => {
		if (!expressionId) {
			setInfo(null);
			return;
		}
		let cancelled = false;
		setInfo(undefined);
		PersonalExpressions.getInfo(expressionId).then((value) => {
			if (!cancelled) setInfo(value);
		});
		return () => {
			cancelled = true;
		};
	}, [expressionId]);
	return info;
}

export const PersonalExpressionInfoSection = observer(function PersonalExpressionInfoSection({
	info,
}: {
	info: PersonalExpressionInfo;
}) {
	const {t} = useLingui();
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const owner = info.owner.global_name || info.owner.username || t`someone`;
	const isMine = PersonalExpressions.isMine(info.id);

	const save = async () => {
		setSaving(true);
		try {
			await PersonalExpressions.copy(info.id);
			setSaved(true);
			ToastCommands.success(info.kind === 'emoji' ? t`Saved to your emojis` : t`Saved to your stickers`);
		} catch (error) {
			const body = (error as {body?: {message?: string; errors?: Array<{message?: string}>}})?.body;
			ToastCommands.error(body?.errors?.[0]?.message ?? body?.message ?? t`Couldn't save a copy. Try again.`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className={styles.section}>
			<span className={styles.owner}>
				{info.kind === 'emoji' ? <Trans>Personal emoji of {owner}</Trans> : <Trans>Personal sticker of {owner}</Trans>}
			</span>
			{isMine ? (
				<span className={styles.note}>
					<Trans>In your collection</Trans>
				</span>
			) : (
				<Button small submitting={saving} disabled={saved} onClick={() => void save()}>
					{saved ? <Trans>Saved</Trans> : <Trans>Save a copy</Trans>}
				</Button>
			)}
		</div>
	);
});
