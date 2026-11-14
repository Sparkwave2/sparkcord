// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: Settings > My emojis & stickers. Upload, rename and delete personal emojis
// and stickers, which you can use anywhere (any community, DM or group).

import PersonalExpressions, {
	MAX_PERSONAL_EMOJIS,
	MAX_PERSONAL_STICKERS,
	type PersonalEmojiWire,
} from '@app/features/personal_expression/PersonalExpressions';
import {Button} from '@app/features/ui/button/Button';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Spinner} from '@app/features/ui/components/Spinner';
import styles from '@app/features/user/components/modals/tabs/PersonalExpressionsTab.module.css';
import * as AvatarUtils from '@app/features/user/utils/AvatarUtils';
import {buildCustomEmojiURL} from '@app/features/expressions/utils/CustomEmojiImageUrl';
import {Trans, useLingui} from '@lingui/react/macro';
import {PencilSimpleIcon, TrashIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

type Kind = 'emoji' | 'sticker';

function errorMessage(error: unknown): string {
	const body = (error as {body?: {message?: string; errors?: Array<{message?: string}>}})?.body;
	return body?.errors?.[0]?.message ?? body?.message ?? (error instanceof Error ? error.message : String(error));
}

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

/** A valid default name from a file name: letters, numbers and underscores, 2-32 chars. */
function nameFromFile(file: File, kind: Kind): string {
	const base = file.name.replace(/\.[^.]+$/, '');
	let name = kind === 'emoji' ? base.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') : base.trim();
	name = name.slice(0, kind === 'emoji' ? 32 : 30);
	while (name.length < 2) name += '_';
	return name;
}

const ExpressionTile = observer(function ExpressionTile({item, kind}: {item: PersonalEmojiWire; kind: Kind}) {
	const {t} = useLingui();
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(item.name);
	const [busy, setBusy] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	useEffect(() => setName(item.name), [item.name]);
	const src =
		kind === 'emoji'
			? buildCustomEmojiURL({id: item.id, animated: item.animated})
			: AvatarUtils.getStickerURL({id: item.id, animated: item.animated, size: 160});

	const saveName = async () => {
		const trimmed = name.trim();
		if (trimmed === item.name || trimmed.length < 2) {
			setName(item.name);
			setEditing(false);
			return;
		}
		setBusy(true);
		try {
			await PersonalExpressions.rename(item.id, trimmed);
			setEditing(false);
		} catch (error) {
			ToastCommands.error(errorMessage(error));
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		if (!confirmDelete) {
			setConfirmDelete(true);
			window.setTimeout(() => setConfirmDelete(false), 3000);
			return;
		}
		setBusy(true);
		try {
			await PersonalExpressions.remove(item.id);
		} catch (error) {
			ToastCommands.error(errorMessage(error));
			setBusy(false);
		}
	};

	return (
		<div className={styles.tile}>
			<img className={kind === 'emoji' ? styles.emojiImage : styles.stickerImage} src={src} alt={item.name} />
			{editing ? (
				<input
					className={styles.nameInput}
					value={name}
					maxLength={kind === 'emoji' ? 32 : 30}
					disabled={busy}
					// biome-ignore lint/a11y/noAutofocus: opened by the user's click on rename.
					autoFocus
					onChange={(event) => setName(event.target.value)}
					onBlur={() => void saveName()}
					onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
						if (event.key === 'Enter') void saveName();
						if (event.key === 'Escape') {
							event.stopPropagation();
							setName(item.name);
							setEditing(false);
						}
					}}
				/>
			) : (
				<span className={styles.name} title={kind === 'emoji' ? `:${item.name}:` : item.name}>
					{kind === 'emoji' ? `:${item.name}:` : item.name}
				</span>
			)}
			<div className={styles.actions}>
				<button
					type="button"
					className={styles.iconButton}
					onClick={() => setEditing(true)}
					disabled={busy}
					aria-label={t`Rename`}
					title={t`Rename`}
				>
					<PencilSimpleIcon size={16} />
				</button>
				<button
					type="button"
					className={confirmDelete ? `${styles.iconButton} ${styles.danger}` : styles.iconButton}
					onClick={() => void remove()}
					disabled={busy}
					aria-label={confirmDelete ? t`Click again to delete` : t`Delete`}
					title={confirmDelete ? t`Click again to delete` : t`Delete`}
				>
					<TrashIcon size={16} />
				</button>
			</div>
		</div>
	);
});

const ExpressionSection = observer(function ExpressionSection({kind}: {kind: Kind}) {
	const {t} = useLingui();
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const items = kind === 'emoji' ? PersonalExpressions.emojis : PersonalExpressions.stickers;
	const max = kind === 'emoji' ? MAX_PERSONAL_EMOJIS : MAX_PERSONAL_STICKERS;

	const upload = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		setUploading(true);
		let added = 0;
		for (const file of Array.from(files)) {
			try {
				await PersonalExpressions.create(kind, nameFromFile(file, kind), await readAsDataUrl(file));
				added++;
			} catch (error) {
				ToastCommands.error(`${file.name}: ${errorMessage(error)}`);
			}
		}
		setUploading(false);
		if (added > 0) {
			ToastCommands.success(kind === 'emoji' ? t`Added ${added} emoji(s)` : t`Added ${added} sticker(s)`);
		}
		if (inputRef.current) inputRef.current.value = '';
	};

	return (
		<section className={styles.section}>
			<div className={styles.row}>
				<h3 className={styles.subheading}>
					{kind === 'emoji' ? (
						<Trans>
							Emojis ({items.length}/{max})
						</Trans>
					) : (
						<Trans>
							Stickers ({items.length}/{max})
						</Trans>
					)}
				</h3>
				<input
					ref={inputRef}
					type="file"
					accept="image/png,image/gif,image/webp,image/jpeg,image/avif"
					multiple
					hidden
					onChange={(event) => void upload(event.target.files)}
				/>
				<Button
					small
					submitting={uploading}
					disabled={items.length >= max}
					onClick={() => inputRef.current?.click()}
					data-flx={`user.personal-expressions-tab.upload-${kind}`}
				>
					{kind === 'emoji' ? <Trans>Upload emojis</Trans> : <Trans>Upload stickers</Trans>}
				</Button>
			</div>
			<p className={styles.hint}>
				{kind === 'emoji' ? (
					<Trans>
						PNG, GIF, WebP or JPEG. The file name becomes the emoji name (letters, numbers and underscores).
					</Trans>
				) : (
					<Trans>PNG, GIF, WebP or JPEG. Animated stickers are supported.</Trans>
				)}
			</p>
			{items.length === 0 ? (
				<p className={styles.empty}>
					{kind === 'emoji' ? <Trans>No personal emojis yet.</Trans> : <Trans>No personal stickers yet.</Trans>}
				</p>
			) : (
				<div className={kind === 'emoji' ? styles.grid : `${styles.grid} ${styles.stickerGrid}`}>
					{items.map((item) => (
						<ExpressionTile key={item.id} item={item} kind={kind} />
					))}
				</div>
			)}
		</section>
	);
});

const PersonalExpressionsTab: React.FC = observer(() => {
	useEffect(() => {
		void PersonalExpressions.reload();
	}, []);
	return (
		<div className={styles.container}>
			<section className={styles.section}>
				<h2 className={styles.heading}>
					<Trans>My emojis & stickers</Trans>
				</h2>
				<p className={styles.hint}>
					<Trans>
						Personal emojis and stickers are yours: you can use them in any community, DM or group, and they show
						up in the emoji and sticker pickers under Personal. Everyone can see them, and others can save a copy
						from the emoji or sticker info.
					</Trans>
				</p>
			</section>
			{!PersonalExpressions.loaded ? (
				<Spinner />
			) : (
				<>
					<ExpressionSection kind="emoji" />
					<ExpressionSection kind="sticker" />
				</>
			)}
		</div>
	);
});

export default PersonalExpressionsTab;
