// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: dress up the cat you pet. Hats and collars unlock with milestones;
// coats unlock when you adopt a cat that wears them.

import {CafeCat} from '@app/features/catnip_cafe/CafeCat';
import Cafe from '@app/features/catnip_cafe/CafeEngine';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import {COATS, OUTFITS, type OutfitSlot} from '@app/features/catnip_cafe/CafeWorld';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

export const CafeWardrobe = observer(function CafeWardrobe({onClose}: {onClose: () => void}) {
	const {t} = useLingui();
	const outfit = Cafe.state.outfit;
	const coats = Cafe.unlockedCoats;
	const slots: Array<{slot: OutfitSlot; label: string}> = [
		{slot: 'hat', label: t`Hats`},
		{slot: 'collar', label: t`Collars`},
	];
	return (
		<div className={styles.wardrobe} role="dialog" aria-label={t`Wardrobe`}>
			<div className={styles.wardrobeHeader}>
				<span className={styles.columnTitle}>{t`Wardrobe`}</span>
				<button type="button" className={styles.smallButton} onClick={onClose}>
					{t`Done`}
				</button>
			</div>
			<div className={styles.wardrobeBody}>
				{slots.map(({slot, label}) => (
					<div key={slot}>
						<h3 className={styles.sectionTitle}>{label}</h3>
						<div className={styles.wardrobeGrid}>
							<button
								type="button"
								className={clsx(styles.wardrobeItem, outfit[slot] === null && styles.wardrobeActive)}
								onClick={() => Cafe.setOutfit(slot, null)}
							>
								<CafeCat className={styles.wardrobePreview} coat={outfit.coat} />
								<span>{t`None`}</span>
							</button>
							{OUTFITS.filter((item) => item.slot === slot).map((item) => {
								const unlocked = Cafe.outfitUnlocked(item.id);
								return (
									<button
										key={item.id}
										type="button"
										className={clsx(
											styles.wardrobeItem,
											outfit[slot] === item.id && styles.wardrobeActive,
											!unlocked && styles.wardrobeLocked,
										)}
										onClick={() => Cafe.setOutfit(slot, item.id)}
										disabled={!unlocked}
										title={unlocked ? item.name : `${item.name}: ${item.unlockText}`}
									>
										<CafeCat
											className={styles.wardrobePreview}
											coat={outfit.coat}
											hat={slot === 'hat' ? item.id : null}
											collar={slot === 'collar' ? item.id : null}
										/>
										<span>{unlocked ? item.name : `🔒 ${item.unlockText}`}</span>
									</button>
								);
							})}
						</div>
					</div>
				))}
				<h3 className={styles.sectionTitle}>{t`Coats`}</h3>
				<p className={styles.tabIntro}>{t`Adopt a cat with a coat to unlock it here.`}</p>
				<div className={styles.wardrobeGrid}>
					{COATS.map((coat) => {
						const unlocked = coats.has(coat.id);
						return (
							<button
								key={coat.id}
								type="button"
								className={clsx(
									styles.wardrobeItem,
									outfit.coat === coat.id && styles.wardrobeActive,
									!unlocked && styles.wardrobeLocked,
								)}
								onClick={() => Cafe.setCoat(coat.id)}
								disabled={!unlocked}
							>
								<CafeCat className={styles.wardrobePreview} coat={coat.id} />
								<span>{unlocked ? coat.name : `🔒 ${coat.name}`}</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
});
