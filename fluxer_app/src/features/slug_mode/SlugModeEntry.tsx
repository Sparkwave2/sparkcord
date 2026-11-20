// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Slug Mode on the login page: makes an account that only exists on this device.
// It is created like an instant account (display name only), then tied to this device by
// the server with a device-key cookie (see fluxer_api sparkcord/SlugMode.ts). It can't be
// signed into anywhere else; adding an email later turns it into a normal account.

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {Endpoints} from '@app/features/app/constants/Endpoints';
import type {RuntimeConfigSnapshot} from '@app/features/app/state/InstanceSnapshotStore';
import * as AccountEntryCommands from '@app/features/auth/commands/AccountEntryCommands';
import * as AuthenticationCommands from '@app/features/auth/commands/AuthenticationCommands';
import {
	InstantAccountForm,
	instantAccountErrors,
	NO_INSTANT_ACCOUNT_ERRORS,
} from '@app/features/auth/flow/InstantAccountForm';
import {getRegistrationLegalConsentConfig} from '@app/features/auth/flow/RegistrationLegalNotice';
import {markSlugUser} from '@app/features/slug_mode/SlugGateway';
import styles from '@app/features/slug_mode/SlugModeEntry.module.css';
import {SnailIcon} from '@app/features/slug_mode/SnailIcon';
import {instanceRequest, instanceTargetFromSnapshot} from '@app/features/platform/transport/InstanceHTTP';
import {ButtonVariant} from '@app/features/ui/button/Button';
import {isDesktop} from '@app/features/ui/utils/NativeUtils';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type {AuthLoginMethodAction} from '@app/features/auth/flow/auth_login_core/AuthLoginMethodPicker';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CheckCircleIcon, WarningCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useMemo, useState} from 'react';

const BUTTON = msg({message: 'Use Slug Mode', comment: 'Login page button that creates an account kept only on this device.'});
const TITLE = msg({message: 'Slug Mode', comment: 'Title of the Slug Mode dialog.'});
const INTRO = msg({
	message: 'Jump in with just a name. Your account stays on this device.',
	comment: 'One-line introduction at the top of the Slug Mode dialog.',
});
const PRO_FAST = msg({message: 'No email or password needed', comment: 'Slug Mode advantage.'});
const PRO_PRIVATE = msg({message: 'Nothing personal to hand over', comment: 'Slug Mode advantage.'});
const CON_DEVICE = msg({message: 'Works only on this device and browser', comment: 'Slug Mode drawback.'});
const CON_GONE = msg({
	message: 'Signing out or clearing cookies deletes it',
	comment: 'Slug Mode drawback: the account is gone for good.',
});
const TIP = msg({
	message: 'Add an email later to keep it for good.',
	comment: 'Tip at the bottom of the Slug Mode dialog: adding an email turns it into a normal account.',
});
const FAILED = msg({
	message: 'Couldn’t set up Slug Mode. Please try again.',
	comment: 'Error in the Slug Mode dialog when the account could not be tied to the device.',
});

async function isSlugAccount(token: string, snapshot: RuntimeConfigSnapshot): Promise<boolean> {
	try {
		const response = await instanceRequest<{slug: boolean}>({
			method: 'GET',
			path: Endpoints.SPARKCORD_SLUG,
			target: instanceTargetFromSnapshot(snapshot),
			auth: 'none',
			headers: {Authorization: token},
		});
		return response.body?.slug === true;
	} catch (error) {
		console.warn('[slug] checking the account failed', error);
		return false;
	}
}

/** Signs a half-made account out again (which deletes it, as it has no way back in). */
async function abandon(token: string, snapshot: RuntimeConfigSnapshot): Promise<void> {
	await instanceRequest({
		method: 'POST',
		path: Endpoints.AUTH_LOGOUT,
		target: instanceTargetFromSnapshot(snapshot),
		auth: 'none',
		headers: {Authorization: token},
	}).catch(() => {});
}

const SlugModeModal = observer(function SlugModeModal({runtimeSnapshot}: {runtimeSnapshot: RuntimeConfigSnapshot}) {
	const {i18n} = useLingui();
	const consentConfig = useMemo(() => getRegistrationLegalConsentConfig(runtimeSnapshot), [runtimeSnapshot]);
	const [submitting, setSubmitting] = useState(false);
	const [errors, setErrors] = useState(NO_INSTANT_ACCOUNT_ERRORS);
	const [failure, setFailure] = useState<string | null>(null);

	const submit = async (globalName: string) => {
		if (submitting) return;
		setSubmitting(true);
		setErrors(NO_INSTANT_ACCOUNT_ERRORS);
		setFailure(null);
		try {
			const result = await AccountEntryCommands.createInstantAccount({
				globalName,
				consent: true,
				inviteCode: null,
				registrationUrlCode: null,
				snapshot: runtimeSnapshot,
				slug: true,
			});
			if (result.type !== 'success') {
				setFailure(i18n._(FAILED));
				return;
			}
			// The sign-up response set the device-key cookie; check the account is really tied.
			if (!(await isSlugAccount(result.payload.token, runtimeSnapshot))) {
				await abandon(result.payload.token, runtimeSnapshot);
				setFailure(i18n._(FAILED));
				return;
			}
			markSlugUser(result.payload.userId);
			ModalCommands.pop();
			await AuthenticationCommands.completeLogin({...result.payload, runtimeSnapshot}, {redirectPath: '/channels/@me'});
		} catch (caught) {
			setErrors(instantAccountErrors(caught, i18n));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal.Root size="small" centered data-flx="slug-mode.modal">
			<Modal.Header title={i18n._(TITLE)} />
			<Modal.Content>
				<Modal.ContentLayout>
					<p className={styles.text}>{i18n._(INTRO)}</p>
					<div className={styles.lists}>
						<div className={styles.list}>
							<span className={styles.pro}>
								<CheckCircleIcon size={18} weight="fill" />
								{i18n._(PRO_FAST)}
							</span>
							<span className={styles.pro}>
								<CheckCircleIcon size={18} weight="fill" />
								{i18n._(PRO_PRIVATE)}
							</span>
						</div>
						<div className={styles.list}>
							<span className={styles.con}>
								<WarningCircleIcon size={18} weight="fill" />
								{i18n._(CON_DEVICE)}
							</span>
							<span className={styles.con}>
								<WarningCircleIcon size={18} weight="fill" />
								{i18n._(CON_GONE)}
							</span>
						</div>
					</div>
					<p className={styles.tip}>{i18n._(TIP)}</p>
					{failure && <p className={styles.error}>{failure}</p>}
					<InstantAccountForm
						initialName=""
						consentConfig={consentConfig}
						submitting={submitting}
						errors={errors}
						onEdit={() => setErrors(NO_INSTANT_ACCOUNT_ERRORS)}
						onSubmit={(globalName) => void submit(globalName)}
						data-flx="slug-mode.form"
					/>
				</Modal.ContentLayout>
			</Modal.Content>
		</Modal.Root>
	);
});

/** Opens the Slug Mode dialog. */
export function openSlugModeDialog(runtimeSnapshot: RuntimeConfigSnapshot): void {
	ModalCommands.push(modal(() => <SlugModeModal runtimeSnapshot={runtimeSnapshot} />));
}

/**
 * Slug Mode as a secondary option in the login page's method picker, or null where it
 * isn't offered (no instance yet, or the desktop app, whose server proxy doesn't carry
 * cookies yet).
 */
export function slugModeMethodAction(
	i18n: I18n,
	runtimeSnapshot: RuntimeConfigSnapshot | null,
	disabled = false,
): AuthLoginMethodAction | null {
	if (runtimeSnapshot === null || isDesktop()) return null;
	return {
		disabled,
		id: 'sparkcord-slug-mode',
		label: i18n._(BUTTON),
		icon: <SnailIcon size={16} />,
		onSelect: () => openSlugModeDialog(runtimeSnapshot),
		stepFocus: false,
		submitting: false,
		variant: ButtonVariant.SECONDARY,
	};
}
