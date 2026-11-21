// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the cats you have adopted. Some live in your café (their traits
// count), the rest wait in your collection; you can swap them, rename them or rehome them.

import {CafeCat} from '@app/features/catnip_cafe/CafeCat';
import Cafe from '@app/features/catnip_cafe/CafeEngine';
import {formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import {WaitHint} from '@app/features/catnip_cafe/CafeShop';
import {
	CAT_LEVEL_HOURS,
	CAT_MAX_LEVEL,
	type CafeCatData,
	COAT_BY_ID,
	COLLECTION_LIMIT,
	catLevel,
	describeTrait,
	RARITY_BY_ID,
	traitStrength,
} from '@app/features/catnip_cafe/CafeWorld';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

const CatCard = observer(function CatCard({cat, resident}: {cat: CafeCatData; resident: boolean}) {
	const {t} = useLingui();
	const [confirmRehome, setConfirmRehome] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [name, setName] = useState(cat.name);
	const level = catLevel(cat, Cafe.bondingSpeed);
	const nextHours = CAT_LEVEL_HOURS[level - 1];
	const hours = (cat.residentMs * Cafe.bondingSpeed) / 3_600_000;
	const rarity = RARITY_BY_ID.get(cat.rarity);
	const slotsFull = Cafe.state.residents.length >= Cafe.residentSlots;
	return (
		<div
			className={clsx(
				styles.catCard,
				cat.rarity === 'uncommon' && styles.rarity_uncommon,
				cat.rarity === 'rare' && styles.rarity_rare,
				cat.rarity === 'legendary' && styles.rarity_legendary,
				resident && styles.catResident,
			)}
		>
			<CafeCat className={styles.catCardFace} coat={cat.coat} />
			<div className={styles.catCardText}>
				{renaming ? (
					<form
						className={styles.renameRow}
						onSubmit={(event) => {
							event.preventDefault();
							Cafe.renameCat(cat.id, name);
							setRenaming(false);
						}}
					>
						<input
							className={styles.renameInput}
							value={name}
							maxLength={40}
							onChange={(event) => setName(event.target.value)}
							aria-label={t`Cat name`}
						/>
						<button type="submit" className={styles.smallButton}>
							{t`Save`}
						</button>
					</form>
				) : (
					<button
						type="button"
						className={styles.catName}
						onClick={() => setRenaming(true)}
						title={t`Rename`}
					>
						{cat.name}
					</button>
				)}
				<span className={styles.catMeta}>
					{rarity?.name} · {COAT_BY_ID.get(cat.coat)?.name} · {t`Level ${level}`}
				</span>
				<span className={styles.catTrait}>{describeTrait(cat.trait, traitStrength(cat, Cafe.bondingSpeed))}</span>
				{level < CAT_MAX_LEVEL && (
					<span className={styles.tierBar} title={t`Grows closer while living in your café`}>
						<span
							className={styles.tierFill}
							style={{
								width: `${Math.min(100, Math.round(((hours - (CAT_LEVEL_HOURS[level - 2] ?? 0)) / (nextHours - (CAT_LEVEL_HOURS[level - 2] ?? 0))) * 100))}%`,
							}}
						/>
					</span>
				)}
				<span className={styles.catActions}>
					<button
						type="button"
						className={styles.smallButton}
						onClick={() => Cafe.toggleResident(cat.id)}
						disabled={!resident && slotsFull}
					>
						{resident ? t`Move to collection` : t`Bring to café`}
					</button>
					{confirmRehome ? (
						<>
							<button
								type="button"
								className={clsx(styles.smallButton, styles.smallDanger)}
								onClick={() => Cafe.rehome(cat.id)}
							>
								{t`Rehome for ${rarity?.catnip ?? 0} catnip`}
							</button>
							<button type="button" className={styles.smallButton} onClick={() => setConfirmRehome(false)}>
								{t`Keep`}
							</button>
						</>
					) : (
						<button type="button" className={styles.smallButton} onClick={() => setConfirmRehome(true)}>
							{t`Rehome`}
						</button>
					)}
				</span>
			</div>
		</div>
	);
});

export const CatsTab = observer(function CatsTab() {
	const {t} = useLingui();
	const residents = Cafe.residentCats;
	const residentIds = new Set(Cafe.state.residents);
	const others = Cafe.state.cats.filter((cat) => !residentIds.has(cat.id));
	const cost = Cafe.adoptionCost;
	const affordable = Cafe.state.purrs >= cost && !Cafe.collectionFull;
	return (
		<>
			<div className={styles.adoptBox}>
				<p>
					{t`Adopt a cat to live in your café. Each one has a trait that helps, and grows closer (stronger) the longer it lives here. Lucky Cats sometimes bring strays.`}
				</p>
				<button
					type="button"
					className={clsx(styles.primaryButton, !affordable && styles.buttonDisabled)}
					onClick={() => Cafe.adopt()}
					disabled={!affordable}
				>
					{Cafe.collectionFull ? t`Your collection is full` : t`Adopt a cat · 🐾 ${formatPurrs(cost)}`}
				</button>
				{!Cafe.collectionFull && <WaitHint cost={cost} />}
			</div>
			<h3 className={styles.sectionTitle}>
				{t`Living in your café (${residents.length}/${Cafe.residentSlots})`}
			</h3>
			{residents.length === 0 ? (
				<p className={styles.empty}>{t`Nobody lives here yet.`}</p>
			) : (
				<div className={styles.catGrid}>
					{residents.map((cat) => (
						<CatCard key={cat.id} cat={cat} resident />
					))}
				</div>
			)}
			{others.length > 0 && (
				<>
					<h3 className={styles.sectionTitle}>
						{t`Collection (${Cafe.state.cats.length}/${COLLECTION_LIMIT})`}
					</h3>
					<div className={styles.catGrid}>
						{others.map((cat) => (
							<CatCard key={cat.id} cat={cat} resident={false} />
						))}
					</div>
				</>
			)}
		</>
	);
});
