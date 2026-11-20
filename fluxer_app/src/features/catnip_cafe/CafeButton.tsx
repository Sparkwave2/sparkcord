// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the Catnip Café button in the server list sidebar.

import {Routes} from '@app/app/Routes';
import {GuildListActionButton} from '@app/features/app/components/layout/sidebar_nav/GuildListActionButton';
import styles from '@app/features/app/components/layout/sidebar_nav/GuildListActionButton.module.css';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CatIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

const CAFE_DESCRIPTOR = msg({
	message: 'Catnip Café',
	comment: 'Sidebar button that opens the Catnip Café idle cat game.',
});

export const CafeButton = observer(function CafeButton() {
	const {i18n} = useLingui();
	return (
		<GuildListActionButton
			label={i18n._(CAFE_DESCRIPTOR)}
			tooltip={() => i18n._(CAFE_DESCRIPTOR)}
			icon={<CatIcon weight="bold" className={styles.iconText} />}
			onClick={() => RouterUtils.transitionTo(Routes.CATNIP_CAFE)}
			onContextMenu={(event) => event.preventDefault()}
			buttonDataFlx="catnip-cafe.sidebar-button"
			data-flx="catnip-cafe.sidebar"
		/>
	);
});
