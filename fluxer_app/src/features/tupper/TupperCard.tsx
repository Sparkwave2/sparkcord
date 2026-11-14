// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {http} from '@app/features/platform/transport/RestTransport';
import styles from '@app/features/tupper/TupperCard.module.css';
import {proxyColorString} from '@app/features/tupper/TupperShared';
import {Avatar} from '@app/features/ui/components/Avatar';
import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useState} from 'react';

interface TupperCardWire {
	id: string;
	user_id: string;
	name: string;
	avatar_url: string | null;
	description: string | null;
	pronouns: string | null;
	color: number | null;
	birthday: string | null;
	system_name: string | null;
	system_tag: string | null;
}

/** Cards change rarely; keep them for the session so reopening a popout is instant. */
const cardCache = new Map<string, Promise<TupperCardWire | null>>();

function loadCard(userId: string, tupperId: string): Promise<TupperCardWire | null> {
	const key = `${userId}:${tupperId}`;
	let pending = cardCache.get(key);
	if (!pending) {
		pending = http
			.get<TupperCardWire>(Endpoints.USER_TUPPER_CARD(userId, tupperId))
			.then((response) => response.body)
			.catch(() => {
				cardCache.delete(key);
				return null;
			});
		cardCache.set(key, pending);
	}
	return pending;
}

interface TupperCardProps {
	message: Message;
	onClose: () => void;
	variant?: 'popout' | 'sheet';
}

/**
 * Profile card for a proxied message. Shows the tupper (from the message snapshot right away,
 * then the live card: description, system name) and the account behind it.
 */
export const TupperCard = observer(function TupperCard({message, onClose, variant = 'popout'}: TupperCardProps) {
	const proxy = message.proxy!;
	const owner = message.proxyOwner ?? message.author;
	const [card, setCard] = useState<TupperCardWire | null>(null);
	const [deleted, setDeleted] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void loadCard(owner.id, proxy.tupper_id).then((result) => {
			if (cancelled) return;
			setCard(result);
			setDeleted(result === null);
		});
		return () => {
			cancelled = true;
		};
	}, [owner.id, proxy.tupper_id]);

	const handleOpenOwner = useCallback(() => {
		onClose();
		// Loaded on demand: the profile modal's import graph includes message rendering.
		void import('@app/features/user/commands/UserProfileCommands').then((m) => m.openUserProfile(owner.id));
	}, [onClose, owner.id]);

	// The snapshot is what the message was sent as; the card is the tupper as it is now.
	const name = proxy.name;
	const avatarUrl = proxy.avatar_url ?? card?.avatar_url ?? undefined;
	const color = proxyColorString(proxy.color ?? card?.color);
	const pronouns = card?.pronouns ?? proxy.pronouns;
	const systemTag = proxy.system_tag ?? card?.system_tag ?? null;
	const systemName = card?.system_name ?? null;
	const ownerName = owner.globalName || owner.username;

	return (
		<div
			className={clsx(styles.card, variant === 'sheet' && styles.sheetCard)}
			style={color ? ({'--tupper-color': color} as React.CSSProperties) : undefined}
			data-flx="tupper.card"
		>
			<div className={styles.banner} aria-hidden />
			<Avatar user={message.author} avatarUrl={avatarUrl} size={80} className={styles.avatar} />
			<div className={styles.body}>
				<div className={styles.nameRow}>
					<span className={styles.name} style={color ? {color} : undefined}>
						{name}
					</span>
					<span className={styles.badge}>
						<Trans comment="Badge on a tupper profile card marking it as a proxy member, not a real account">
							Tupper
						</Trans>
					</span>
				</div>
				{pronouns && <span className={styles.pronouns}>{pronouns}</span>}

				{card?.description && (
					<section className={styles.section}>
						<h3 className={styles.heading}>
							<Trans comment="Heading for a tupper's description on its profile card">About</Trans>
						</h3>
						<p className={styles.description}>{card.description}</p>
					</section>
				)}

				{(systemName || systemTag) && (
					<section className={styles.section}>
						<h3 className={styles.heading}>
							<Trans comment="Heading for the PluralKit/Tupperbox-style system a tupper belongs to, on its profile card">
								System
							</Trans>
						</h3>
						<p className={styles.system}>
							{systemName && <span>{systemName}</span>}
							{systemTag && <span className={styles.systemTag}>{systemTag}</span>}
						</p>
					</section>
				)}

				<section className={styles.section}>
					<h3 className={styles.heading}>
						<Trans comment="Heading for the account that owns a tupper, on the tupper's profile card">Account</Trans>
					</h3>
					<button type="button" className={styles.owner} onClick={handleOpenOwner}>
						<Avatar user={owner} size={24} />
						<span className={styles.ownerName}>{ownerName}</span>
						<span className={styles.ownerUsername}>@{owner.username}</span>
					</button>
				</section>

				{deleted && (
					<span className={styles.notice}>
						<Trans comment="Shown on a tupper profile card when the tupper was deleted after the message was sent">
							This tupper no longer exists.
						</Trans>
					</span>
				)}
			</div>
		</div>
	);
});
