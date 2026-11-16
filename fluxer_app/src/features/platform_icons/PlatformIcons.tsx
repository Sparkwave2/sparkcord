// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: small icons showing which kind of app someone is on. Shown for people who
// are online and didn't hide their platform; the viewer can turn the icons off.

import {type DevicePlatform, getPlatforms, watchPlatforms} from '@app/features/platform_icons/DevicePlatforms';
import styles from '@app/features/platform_icons/PlatformIcons.module.css';
import Presence from '@app/features/presence/state/Presence';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {StatusTypes} from '@fluxer/constants/src/StatusConstants';
import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {DesktopIcon, DeviceMobileIcon, GlobeIcon, type Icon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

const PLATFORM_ICONS: Record<DevicePlatform, Icon> = {
	web: GlobeIcon,
	desktop: DesktopIcon,
	mobile: DeviceMobileIcon,
};

const PLATFORM_LABELS: Record<DevicePlatform, MessageDescriptor> = {
	web: msg({message: 'On the web', comment: 'Tooltip of the icon showing a person is using the website.'}),
	desktop: msg({
		message: 'On the desktop app',
		comment: 'Tooltip of the icon showing a person is using the desktop app.',
	}),
	mobile: msg({message: 'On mobile', comment: 'Tooltip of the icon showing a person is using a phone or tablet.'}),
};

const PlatformIconsInner = observer(function PlatformIconsInner({
	userId,
	className,
}: {
	userId: string;
	className?: string;
}) {
	const {i18n} = useLingui();
	useEffect(() => watchPlatforms(userId), [userId]);
	const status = Presence.getStatus(userId);
	if (status === StatusTypes.OFFLINE || status === StatusTypes.INVISIBLE) return null;
	const platforms = getPlatforms(userId);
	if (platforms.length === 0) return null;
	return (
		<span className={clsx(styles.icons, className)} data-flx="sparkcord.platform-icons">
			{platforms.map((platform) => {
				const PlatformIcon = PLATFORM_ICONS[platform];
				const label = i18n._(PLATFORM_LABELS[platform]);
				return (
					<Tooltip key={platform} text={label}>
						<span className={styles.icon} role="img" aria-label={label} data-flx={`sparkcord.platform-icons.${platform}`}>
							<PlatformIcon weight="fill" aria-hidden="true" />
						</span>
					</Tooltip>
				);
			})}
		</span>
	);
});

/** Platform icons for one person. Renders nothing when the viewer turned them off. */
export const PlatformIcons = observer(function PlatformIcons(props: {userId: string; className?: string}) {
	if (!SparkcordPrefs.get('showPlatformIcons')) return null;
	return <PlatformIconsInner {...props} />;
});
