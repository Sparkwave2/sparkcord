// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {setTupperNames, setTupperSettings} from '@app/features/tupper/TupperNames';
import {
	formatProxyTag,
	parseProxyTagLines,
	type TupperSettingsWire,
	type TupperWire,
} from '@app/features/tupper/TupperShared';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {Button} from '@app/features/ui/button/Button';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Input, Textarea} from '@app/features/ui/components/form/FormInput';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {Spinner} from '@app/features/ui/components/Spinner';
import styles from '@app/features/user/components/modals/tabs/TuppersTab.module.css';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {FontSpan, nameFontFamily} from '@app/features/name_font/NameFont';
import {NAME_FONTS} from '@fluxer/constants/src/NameFonts';

const logger = new Logger('Tuppers');


interface ImportResultWire {
	source: 'tupperbox' | 'pluralkit';
	created: number;
	updated: number;
	skipped: number;
	warnings: Array<string>;
	tuppers: Array<TupperWire>;
}

interface DraftState {
	id: string | null;
	name: string;
	displayName: string;
	avatarUrl: string;
	tags: string;
	pronouns: string;
	color: string;
	tag: string;
	description: string;
	keepProxy: boolean;
	font: string;
}

const EMPTY_DRAFT: DraftState = {
	id: null,
	name: '',
	displayName: '',
	avatarUrl: '',
	tags: '',
	pronouns: '',
	color: '',
	tag: '',
	description: '',
	keepProxy: false,
	font: '',
};

function toDraft(tupper: TupperWire): DraftState {
	return {
		id: tupper.id,
		name: tupper.name,
		displayName: tupper.display_name ?? '',
		avatarUrl: tupper.avatar_url ?? '',
		tags: tupper.proxy_tags.map(formatProxyTag).join('\n'),
		pronouns: tupper.pronouns ?? '',
		color: tupper.color != null ? `#${tupper.color.toString(16).padStart(6, '0')}` : '',
		tag: tupper.tag ?? '',
		description: tupper.description ?? '',
		keepProxy: tupper.keep_proxy,
		font: tupper.font ?? '',
	};
}

function errorMessage(error: unknown): string {
	const body = (error as {body?: {message?: string; errors?: Array<{message?: string}>}})?.body;
	return body?.errors?.[0]?.message ?? body?.message ?? (error instanceof Error ? error.message : String(error));
}

/** Keeps only the fields the importer reads, so huge PluralKit switch histories aren't uploaded. */
export function slimImportPayload(data: unknown): unknown {
	if (typeof data !== 'object' || data === null) return data;
	const record = data as Record<string, unknown>;
	if (Array.isArray(record.tuppers)) return {tuppers: record.tuppers, groups: record.groups ?? []};
	if (Array.isArray(record.members)) {
		return {version: record.version, name: record.name, tag: record.tag, members: record.members};
	}
	return data;
}

const TupperEditor: React.FC<{
	draft: DraftState;
	saving: boolean;
	onChange: (draft: DraftState) => void;
	onSave: () => void;
	onCancel: () => void;
}> = ({draft, saving, onChange, onSave, onCancel}) => {
	const {t} = useLingui();
	const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) => onChange({...draft, [key]: value});
	return (
		<div className={styles.editor} data-flx="user.tuppers-tab.editor">
			<div className={styles.editorGrid}>
				<Input
					label={t`Name`}
					value={draft.name}
					maxLength={100}
					onChange={(e) => set('name', e.target.value)}
					data-flx="user.tuppers-tab.editor.name"
				/>
				<Input
					label={t`Display name (optional)`}
					value={draft.displayName}
					maxLength={100}
					onChange={(e) => set('displayName', e.target.value)}
					data-flx="user.tuppers-tab.editor.display-name"
				/>
				<Input
					label={t`Avatar URL`}
					value={draft.avatarUrl}
					placeholder="https://"
					onChange={(e) => set('avatarUrl', e.target.value)}
					data-flx="user.tuppers-tab.editor.avatar-url"
				/>
				<Input
					label={t`Pronouns`}
					value={draft.pronouns}
					maxLength={100}
					onChange={(e) => set('pronouns', e.target.value)}
					data-flx="user.tuppers-tab.editor.pronouns"
				/>
				<Input
					label={t`Colour`}
					value={draft.color}
					placeholder="#ff8800"
					maxLength={7}
					onChange={(e) => set('color', e.target.value)}
					data-flx="user.tuppers-tab.editor.color"
				/>
				<Input
					label={t`Tag (overrides system tag)`}
					value={draft.tag}
					maxLength={79}
					onChange={(e) => set('tag', e.target.value)}
					data-flx="user.tuppers-tab.editor.tag"
				/>
				<label className={styles.fontField}>
					<span className={styles.fontLabel}>{t`Name font`}</span>
					<select
						className={styles.fontSelect}
						value={draft.font}
						onChange={(e) => set('font', e.target.value)}
						style={{fontFamily: nameFontFamily(draft.font)}}
						data-flx="user.tuppers-tab.editor.font"
					>
						<option value="">{t`Default`}</option>
						{NAME_FONTS.map((font) => (
							<option key={font.id} value={font.id} style={{fontFamily: nameFontFamily(font.id)}}>
								{font.family}
							</option>
						))}
					</select>
				</label>
			</div>
			<Textarea
				label={t`Proxy tags, one per line (write "text" where the message goes, e.g. [text] or k:text)`}
				value={draft.tags}
				minRows={2}
				onChange={(e) => set('tags', e.target.value)}
				data-flx="user.tuppers-tab.editor.tags"
			/>
			<Textarea
				label={t`Description`}
				value={draft.description}
				minRows={2}
				maxLength={2000}
				onChange={(e) => set('description', e.target.value)}
				data-flx="user.tuppers-tab.editor.description"
			/>
			<Switch
				label={t`Keep proxy tags in the message`}
				value={draft.keepProxy}
				onChange={(value) => set('keepProxy', value)}
				data-flx="user.tuppers-tab.editor.keep-proxy"
			/>
			<div className={styles.row}>
				<Button
					small
					onClick={onSave}
					submitting={saving}
					disabled={!draft.name.trim()}
					data-flx="user.tuppers-tab.editor.save"
				>
					<Trans>Save</Trans>
				</Button>
				<Button small variant="secondary" onClick={onCancel} data-flx="user.tuppers-tab.editor.cancel">
					<Trans>Cancel</Trans>
				</Button>
			</div>
		</div>
	);
};

const TuppersTab: React.FC = observer(() => {
	const {t} = useLingui();
	const [tuppers, setTuppers] = useState<Array<TupperWire> | null>(null);
	// Keep slash-command autocomplete in step with edits made here.
	useEffect(() => {
		if (tuppers) setTupperNames(tuppers);
	}, [tuppers]);
	const [settings, setSettings] = useState<TupperSettingsWire | null>(null);
	const [draft, setDraft] = useState<DraftState | null>(null);
	const [saving, setSaving] = useState(false);
	const [importing, setImporting] = useState(false);
	const [replaceOnImport, setReplaceOnImport] = useState(false);
	const [importReport, setImportReport] = useState<ImportResultWire | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const load = useCallback(async () => {
		try {
			const [list, current] = await Promise.all([
				http.get<Array<TupperWire>>(Endpoints.USER_TUPPERS),
				http.get<TupperSettingsWire>(Endpoints.USER_TUPPER_SETTINGS),
			]);
			setTuppers(list.body);
			setSettings(current.body);
			setTupperSettings(current.body);
			setLoadError(null);
		} catch (error) {
			logger.error('Failed to load tuppers', error);
			setLoadError(errorMessage(error));
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const updateSettings = useCallback(async (patch: Partial<TupperSettingsWire>) => {
		try {
			const response = await http.patch<TupperSettingsWire>(Endpoints.USER_TUPPER_SETTINGS, {body: patch});
			setSettings(response.body);
			setTupperSettings(response.body);
		} catch (error) {
			ToastCommands.error(errorMessage(error));
		}
	}, []);

	const saveDraft = useCallback(async () => {
		if (!draft) return;
		const color = draft.color.trim().replace(/^#/, '');
		if (color && !/^[0-9a-f]{6}$/i.test(color)) {
			ToastCommands.error(t`Colour must look like #ff8800.`);
			return;
		}
		const body = {
			name: draft.name.trim(),
			display_name: draft.displayName.trim() || null,
			avatar_url: draft.avatarUrl.trim() || null,
			proxy_tags: parseProxyTagLines(draft.tags),
			pronouns: draft.pronouns.trim() || null,
			color: color ? Number.parseInt(color, 16) : null,
			tag: draft.tag.trim() || null,
			description: draft.description.trim() || null,
			keep_proxy: draft.keepProxy,
			font: draft.font || null,
		};
		setSaving(true);
		try {
			if (draft.id) {
				await http.patch<TupperWire>(Endpoints.USER_TUPPER(draft.id), {body});
			} else {
				await http.post<TupperWire>(Endpoints.USER_TUPPERS, {body});
			}
			setDraft(null);
			await load();
			ToastCommands.success(t`Tupper saved`);
		} catch (error) {
			ToastCommands.error(errorMessage(error));
		} finally {
			setSaving(false);
		}
	}, [draft, load, t]);

	const deleteTupper = useCallback(
		async (tupper: TupperWire) => {
			if (!window.confirm(t`Delete ${tupper.name}? Messages already sent keep their name and avatar.`)) return;
			try {
				await http.delete(Endpoints.USER_TUPPER(tupper.id));
				await load();
			} catch (error) {
				ToastCommands.error(errorMessage(error));
			}
		},
		[load, t],
	);

	const handleFile = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = '';
			if (!file) return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(await file.text());
			} catch {
				ToastCommands.error(t`That file isn't valid JSON.`);
				return;
			}
			if (
				replaceOnImport &&
				!window.confirm(t`Replace mode deletes all your current tuppers before importing. Continue?`)
			) {
				return;
			}
			setImporting(true);
			try {
				const response = await http.post<ImportResultWire>(Endpoints.USER_TUPPERS_IMPORT, {
					body: {data: slimImportPayload(parsed), replace: replaceOnImport},
				});
				setImportReport(response.body);
				setTuppers(response.body.tuppers);
				await load();
				ToastCommands.success(
					t`Imported from ${response.body.source}: ${response.body.created} new, ${response.body.updated} updated`,
				);
			} catch (error) {
				ToastCommands.error(errorMessage(error));
			} finally {
				setImporting(false);
			}
		},
		[load, replaceOnImport, t],
	);

	const exportTuppers = useCallback(async () => {
		try {
			const response = await http.get<unknown>(Endpoints.USER_TUPPERS_EXPORT);
			const blob = new Blob([JSON.stringify(response.body, null, 2)], {type: 'application/json'});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'tuppers.json';
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			ToastCommands.error(errorMessage(error));
		}
	}, []);

	if (loadError) {
		return (
			<div className={styles.container} data-flx="user.tuppers-tab.error">
				<p className={styles.error}>{loadError}</p>
				<Button small onClick={() => void load()} data-flx="user.tuppers-tab.retry">
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	}
	if (!tuppers || !settings) {
		return <Spinner data-flx="user.tuppers-tab.spinner" />;
	}
	return (
		<div className={styles.container} data-flx="user.tuppers-tab.container">
			<section className={styles.section}>
				<h2 className={styles.heading}>
					<Trans>Tuppers</Trans>
				</h2>
				<p className={styles.hint}>
					<Trans>
						Tuppers let you post as different characters or system members. Start a message with a proxy tag, such
						as k: hello, and it is shown with that tupper's name and avatar. Start a message with \ to skip proxying.
					</Trans>
				</p>
				<Switch
					label={t`Proxy my messages`}
					value={settings.proxy_enabled}
					onChange={(value) => void updateSettings({proxy_enabled: value})}
					data-flx="user.tuppers-tab.proxy-enabled"
				/>
				<div className={styles.editorGrid}>
					<Input
						label={t`System name`}
						defaultValue={settings.system_name ?? ''}
						maxLength={100}
						onBlur={(e) => void updateSettings({system_name: e.target.value || null})}
						data-flx="user.tuppers-tab.system-name"
					/>
					<Input
						label={t`System tag (shown after every tupper name)`}
						defaultValue={settings.system_tag ?? ''}
						maxLength={79}
						onBlur={(e) => void updateSettings({system_tag: e.target.value || null})}
						data-flx="user.tuppers-tab.system-tag"
					/>
				</div>
				<label className={styles.selectLabel}>
					<Trans>Autoproxy</Trans>
					<select
						className={styles.select}
						value={settings.autoproxy_mode}
						onChange={(e) => {
							const mode = e.target.value as TupperSettingsWire['autoproxy_mode'];
							if (mode === 'front' && !settings.autoproxy_tupper_id && tuppers[0]) {
								void updateSettings({autoproxy_mode: mode, autoproxy_tupper_id: tuppers[0].id});
							} else {
								void updateSettings({autoproxy_mode: mode});
							}
						}}
						data-flx="user.tuppers-tab.autoproxy-mode"
					>
						<option value="off">{t`Off`}</option>
						<option value="front" disabled={tuppers.length === 0}>
							{t`Front: always proxy as one tupper`}
						</option>
						<option value="latch">{t`Latch: keep the last tupper used`}</option>
					</select>
				</label>
				{settings.autoproxy_mode === 'front' && (
					<label className={styles.selectLabel}>
						<Trans>Fronting tupper</Trans>
						<select
							className={styles.select}
							value={settings.autoproxy_tupper_id ?? ''}
							onChange={(e) => void updateSettings({autoproxy_tupper_id: e.target.value})}
							data-flx="user.tuppers-tab.autoproxy-tupper"
						>
							{tuppers.map((tupper) => (
								<option key={tupper.id} value={tupper.id}>
									{tupper.name}
								</option>
							))}
						</select>
					</label>
				)}
			</section>

			<section className={styles.section}>
				<h3 className={styles.subheading}>
					<Trans>Import and export</Trans>
				</h3>
				<p className={styles.hint}>
					<Trans>
						Import a file from Tupperbox (tul!export) or PluralKit (pk;export). Tuppers with the same name are
						updated instead of duplicated.
					</Trans>
				</p>
				<Switch
					label={t`Replace all existing tuppers`}
					value={replaceOnImport}
					onChange={setReplaceOnImport}
					data-flx="user.tuppers-tab.replace-on-import"
				/>
				<div className={styles.row}>
					<input
						ref={fileInputRef}
						type="file"
						accept="application/json,.json"
						className={styles.hiddenInput}
						onChange={(e) => void handleFile(e)}
						data-flx="user.tuppers-tab.import-file"
					/>
					<Button
						small
						submitting={importing}
						onClick={() => fileInputRef.current?.click()}
						data-flx="user.tuppers-tab.import"
					>
						<Trans>Import JSON</Trans>
					</Button>
					<Button
						small
						variant="secondary"
						onClick={() => void exportTuppers()}
						data-flx="user.tuppers-tab.export"
					>
						<Trans>Export JSON</Trans>
					</Button>
				</div>
				{importReport && importReport.warnings.length > 0 && (
					<ul className={styles.warnings} data-flx="user.tuppers-tab.import-warnings">
						{importReport.warnings.slice(0, 20).map((warning) => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				)}
			</section>

			<section className={styles.section}>
				<div className={styles.row}>
					<h3 className={styles.subheading}>
						<Trans>Your tuppers ({tuppers.length})</Trans>
					</h3>
					<Button
						small
						onClick={() => setDraft({...EMPTY_DRAFT})}
						disabled={draft !== null}
						data-flx="user.tuppers-tab.new"
					>
						<Trans>New tupper</Trans>
					</Button>
				</div>
				{draft && draft.id === null && (
					<TupperEditor
						draft={draft}
						saving={saving}
						onChange={setDraft}
						onSave={() => void saveDraft()}
						onCancel={() => setDraft(null)}
					/>
				)}
				{tuppers.length === 0 && !draft && (
					<p className={styles.hint}>
						<Trans>No tuppers yet. Create one or import a file.</Trans>
					</p>
				)}
				<ul className={styles.list}>
					{tuppers.map((tupper) => (
						<li key={tupper.id} className={styles.item} data-flx="user.tuppers-tab.item">
							<div className={styles.itemHeader}>
								{tupper.avatar_proxy_url ? (
									<img className={styles.avatar} src={tupper.avatar_proxy_url} alt="" loading="lazy" />
								) : (
									<div className={styles.avatarPlaceholder} aria-hidden="true">
										{tupper.name.slice(0, 1).toUpperCase()}
									</div>
								)}
								<div className={styles.itemText}>
									<span
										className={styles.itemName}
										style={
											tupper.color != null
												? {color: `#${tupper.color.toString(16).padStart(6, '0')}`}
												: undefined
										}
									>
										<FontSpan font={tupper.font}>{tupper.display_name ?? tupper.name}</FontSpan>
										{tupper.pronouns ? <span className={styles.pronouns}> ({tupper.pronouns})</span> : null}
									</span>
									<span className={styles.tags}>
										{tupper.proxy_tags.length > 0
											? tupper.proxy_tags.map(formatProxyTag).join('  ·  ')
											: t`no proxy tags`}
									</span>
								</div>
								<div className={styles.itemActions}>
									<Button
										small
										variant="secondary"
										disabled={draft !== null}
										onClick={() => setDraft(toDraft(tupper))}
										data-flx="user.tuppers-tab.item.edit"
									>
										<Trans>Edit</Trans>
									</Button>
									<Button
										small
										variant="danger"
										onClick={() => void deleteTupper(tupper)}
										data-flx="user.tuppers-tab.item.delete"
									>
										<Trans>Delete</Trans>
									</Button>
								</div>
							</div>
							{draft && draft.id === tupper.id && (
								<TupperEditor
									draft={draft}
									saving={saving}
									onChange={setDraft}
									onSave={() => void saveDraft()}
									onCancel={() => setDraft(null)}
								/>
							)}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
});

export default TuppersTab;
