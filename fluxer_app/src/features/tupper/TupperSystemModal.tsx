// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the "view system" window. Lists the tuppers of one person, with the
// system's name and tag. A private system shows a short notice to everyone but its owner.

import * as Modal from '@app/features/app/components/dialogs/Modal';
import Authentication from '@app/features/auth/state/Authentication';
import {FontSpan} from '@app/features/name_font/NameFont';
import {proxyColorString} from '@app/features/tupper/TupperShared';
import {loadTupperSystem, type TupperSystemMemberWire, type TupperSystemWire} from '@app/features/tupper/TupperSystem';
import styles from '@app/features/tupper/TupperSystemModal.module.css';
import {Spinner} from '@app/features/ui/components/Spinner';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {Plural, Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

const SYSTEM_TITLE_DESCRIPTOR = msg({
	message: 'System',
	comment: 'Title of the window listing the tuppers (system members) of a person, when the system has no name.',
});

function MemberRow({member, systemTag}: {member: TupperSystemMemberWire; systemTag: string | null}) {
	const color = proxyColorString(member.color);
	const tag = member.tag ?? systemTag;
	return (
		<li className={styles.row} data-flx="tupper.system-modal.member">
			{member.avatar_url ? (
				<img src={member.avatar_url} alt="" loading="lazy" decoding="async" className={styles.avatar} />
			) : (
				<span className={styles.avatarFallback} style={color ? {background: color} : undefined} aria-hidden="true">
					{member.name.trim().charAt(0).toUpperCase()}
				</span>
			)}
			<span className={styles.text}>
				<span className={styles.nameLine}>
					<span className={styles.name} style={color ? {color} : undefined}>
						<FontSpan font={member.font}>{member.name}</FontSpan>
					</span>
					{tag && <span className={styles.tag}>{tag}</span>}
					{member.pronouns && <span className={styles.pronouns}>{member.pronouns}</span>}
				</span>
				{member.description && (
					<span className={styles.description} dir="auto">
						{member.description}
					</span>
				)}
			</span>
		</li>
	);
}

const TupperSystemModal = observer(function TupperSystemModal({userId}: {userId: string}) {
	const {i18n} = useLingui();
	const [system, setSystem] = useState<TupperSystemWire | null>(null);
	const [failed, setFailed] = useState(false);
	const owner = Users.getUser(userId);
	const isOwn = Authentication.currentUserId === userId;

	useEffect(() => {
		let cancelled = false;
		void loadTupperSystem(userId, true).then((result) => {
			if (cancelled) return;
			setSystem(result);
			setFailed(result === null);
		});
		return () => {
			cancelled = true;
		};
	}, [userId]);

	const title = system?.system_name || i18n._(SYSTEM_TITLE_DESCRIPTOR);
	const count = system?.tuppers.length ?? 0;
	return (
		<Modal.Root size="small" centered data-flx="tupper.system-modal.modal-root">
			<Modal.Header title={title} data-flx="tupper.system-modal.modal-header" />
			<Modal.Content data-flx="tupper.system-modal.modal-content">
				{!system && !failed && <Spinner data-flx="tupper.system-modal.spinner" />}
				{failed && (
					<p className={styles.notice}>
						<Trans comment="Shown in the system window when the list of tuppers could not be loaded">
							This system couldn't be loaded. Try again in a moment.
						</Trans>
					</p>
				)}
				{system && (
					<>
						<p className={styles.summary} data-flx="tupper.system-modal.summary">
							{owner && (
								<span className={styles.owner}>
									<Trans comment="In the system window: the account the system belongs to. The placeholder is a username.">
										Account: @{owner.username}
									</Trans>
								</span>
							)}
							{system.system_tag && <span className={styles.tag}>{system.system_tag}</span>}
							{!system.private || isOwn ? (
								<span>
									<Plural value={count} one="# tupper" other="# tuppers" />
								</span>
							) : null}
						</p>
						{system.private && isOwn && (
							<p className={styles.notice} data-flx="tupper.system-modal.private-own">
								<Trans comment="Shown to the owner of a private system in their own system window">
									Your system is private. Only you can see this list.
								</Trans>
							</p>
						)}
						{system.private && !isOwn && (
							<p className={styles.notice} data-flx="tupper.system-modal.private">
								<Trans comment="Shown in the system window when the owner made their system private">
									This system is private.
								</Trans>
							</p>
						)}
						{(!system.private || isOwn) && count === 0 && (
							<p className={styles.notice} data-flx="tupper.system-modal.empty">
								<Trans comment="Shown in the system window when the person has no tuppers">No tuppers yet.</Trans>
							</p>
						)}
						{count > 0 && (
							<ul className={styles.list} data-flx="tupper.system-modal.list">
								{system.tuppers.map((member) => (
									<MemberRow key={member.id} member={member} systemTag={system.system_tag} />
								))}
							</ul>
						)}
					</>
				)}
			</Modal.Content>
		</Modal.Root>
	);
});

export function createTupperSystemModal(userId: string) {
	return <TupperSystemModal userId={userId} />;
}
