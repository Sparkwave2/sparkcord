// SPDX-License-Identifier: AGPL-3.0-or-later

import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import * as AccessibilityCommands from '@app/features/accessibility/commands/AccessibilityCommands';
import Accessibility, {ChannelTypingIndicatorMode} from '@app/features/accessibility/state/Accessibility';
import {SettingsTabSection} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {ChannelItemCore} from '@app/features/app/components/layout/ChannelItem';
import channelItemSurfaceStyles from '@app/features/app/components/layout/ChannelItemSurface.module.css';
import {Typing} from '@app/features/channel/components/ChannelTyping';
import TypingPrivacy from '@app/features/typing/TypingPrivacy';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {AvatarStack} from '@app/features/ui/avatars/AvatarStack';
import {MockAvatar} from '@app/features/ui/components/MockAvatar';
import type {RadioOption} from '@app/features/ui/radio_group/RadioGroup';
import {RadioGroup} from '@app/features/ui/radio_group/RadioGroup';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/user/components/modals/tabs/appearance_tab/InterfaceTab.module.css';
import {getDefaultAvatarURLForIndex} from '@app/features/user/utils/AvatarUtils';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const TYPING_INDICATOR_AVATARS_DESCRIPTOR = msg({
	message: 'Typing indicator + avatars',
	comment: 'Label in the interface tab.',
});
const SHOW_TYPING_INDICATOR_WITH_USER_AVATARS_IN_THE_DESCRIPTOR = msg({
	message: 'Show typing indicator with user avatars in the channel list',
	comment: 'Label in the interface tab.',
});
const TYPING_INDICATOR_ONLY_DESCRIPTOR = msg({
	message: 'Typing indicator only',
	comment: 'Short label in the interface tab. Keep it concise.',
});
const SHOW_JUST_THE_TYPING_INDICATOR_WITHOUT_AVATARS_DESCRIPTOR = msg({
	message: 'Show just the typing indicator without avatars',
	comment: 'Label in the interface tab.',
});
const HIDDEN_DESCRIPTOR = msg({
	message: 'Hidden',
	comment: 'Short label in the interface tab. Keep it concise.',
});
const DON_T_SHOW_TYPING_INDICATORS_IN_THE_CHANNEL_DESCRIPTOR = msg({
	message: "Don't show typing indicators in the channel list",
	comment: 'Label in the interface tab.',
});
const PLATFORM_ICONS_SECTION_DESCRIPTOR = msg({
	message: 'Platform icons',
	comment: 'Settings section about the icons that show whether someone is on the web, desktop app or mobile.',
});
const SHOW_PLATFORM_ICONS_DESCRIPTOR = msg({
	message: 'Show platform icons',
	comment: 'Setting that shows icons for the kind of app other people are using.',
});
const SHOW_PLATFORM_ICONS_HELP_DESCRIPTOR = msg({
	message:
		'Shows next to people who are online whether they are on the web, the desktop app or mobile. Only changes this device.',
	comment: 'Help text of the setting that shows platform icons.',
});
const HIDE_PLATFORM_DESCRIPTOR = msg({
	message: 'Hide my platform',
	comment: 'Setting that stops others from seeing which kind of app you are using.',
});
const HIDE_PLATFORM_HELP_DESCRIPTOR = msg({
	message:
		"Others won't see that you are using this device. Set it on each device you want hidden. Your platform is never shown while you are invisible.",
	comment: 'Help text of the setting that hides your platform from others.',
});
const TYPING_PRIVACY_SECTION_DESCRIPTOR = msg({
	message: 'Typing indicators',
	comment: 'Settings section title for the Sparkcord toggles that control sending and seeing typing indicators.',
});
const SEND_TYPING_INDICATORS_DESCRIPTOR = msg({
	message: "Let others see when I'm typing",
	comment: 'Settings toggle. When off, the app never tells anyone that the user is typing.',
});
const SEND_TYPING_INDICATORS_HELP_DESCRIPTOR = msg({
	message: 'When off, nobody sees "is typing…" for you.',
	comment: 'Help text under the toggle that controls whether other people see that the user is typing.',
});
const SHOW_TYPING_INDICATORS_DESCRIPTOR = msg({
	message: 'Show when others are typing',
	comment: 'Settings toggle. When off, typing indicators for other people are hidden everywhere.',
});
const SHOW_TYPING_INDICATORS_HELP_DESCRIPTOR = msg({
	message: 'When off, typing indicators are hidden in chats, the channel list and direct messages.',
	comment: "Help text under the toggle that hides other people's typing indicators.",
});
const CHANNEL_LIST_TYPING_INDICATORS_DESCRIPTOR = msg({
	message: 'Channel list typing indicators',
	comment: 'Label in the interface tab.',
});
const CHANNEL_LIST_TYPING_INDICATOR_MODE_DESCRIPTOR = msg({
	message: 'Channel list typing indicator mode',
	comment: 'Label in the interface tab.',
});
const ChannelListPreview = observer(({mode}: {mode: ChannelTypingIndicatorMode}) => {
	const typingIndicator =
		mode !== ChannelTypingIndicatorMode.HIDDEN ? (
			<Tooltip
				text={() => (
					<span
						className={styles.tooltipContent}
						data-flx="user.appearance-tab.interface-tab.channel-list-preview.tooltip-content"
					>
						<Trans>
							<strong data-flx="user.appearance-tab.interface-tab.channel-list-preview.strong">Kenji</strong>,{' '}
							<strong data-flx="user.appearance-tab.interface-tab.channel-list-preview.strong--2">Amara</strong> and{' '}
							<strong data-flx="user.appearance-tab.interface-tab.channel-list-preview.strong--3">Mateo</strong> are
							typing...
						</Trans>
					</span>
				)}
				data-flx="user.appearance-tab.interface-tab.channel-list-preview.tooltip"
			>
				<div
					className={styles.typingContainer}
					data-flx="user.appearance-tab.interface-tab.channel-list-preview.typing-container"
				>
					<Typing
						className={styles.typingAnimationWrapper}
						size={20}
						color="var(--surface-interactive-selected-color)"
						data-flx="user.appearance-tab.interface-tab.channel-list-preview.typing-animation-wrapper"
					/>
					{mode === ChannelTypingIndicatorMode.AVATARS && (
						<AvatarStack
							size={12}
							maxVisible={5}
							className={styles.typingAvatars}
							data-flx="user.appearance-tab.interface-tab.channel-list-preview.typing-avatars"
						>
							{[1, 2, 3].map((index) => (
								<MockAvatar
									key={index}
									size={12}
									userTag={`User ${index}`}
									avatarUrl={getDefaultAvatarURLForIndex(index)}
									data-flx="user.appearance-tab.interface-tab.channel-list-preview.mock-avatar"
								/>
							))}
						</AvatarStack>
					)}
				</div>
			</Tooltip>
		) : undefined;
	return (
		<div
			className={styles.previewContainer}
			data-flx="user.appearance-tab.interface-tab.channel-list-preview.preview-container"
		>
			<div
				className={styles.previewContent}
				data-flx="user.appearance-tab.interface-tab.channel-list-preview.preview-content"
			>
				<ChannelItemCore
					channel={{name: 'general', type: 0}}
					forceHover
					typingIndicator={typingIndicator}
					className={clsx('cursor-default', channelItemSurfaceStyles.channelItemSurface)}
					data-flx="user.appearance-tab.interface-tab.channel-list-preview.cursor-default"
				/>
			</div>
		</div>
	);
});
export const InterfaceTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	const channelTypingIndicatorOptions: ReadonlyArray<RadioOption<ChannelTypingIndicatorMode>> = [
		{
			value: ChannelTypingIndicatorMode.AVATARS,
			name: i18n._(TYPING_INDICATOR_AVATARS_DESCRIPTOR),
			desc: i18n._(SHOW_TYPING_INDICATOR_WITH_USER_AVATARS_IN_THE_DESCRIPTOR),
		},
		{
			value: ChannelTypingIndicatorMode.INDICATOR_ONLY,
			name: i18n._(TYPING_INDICATOR_ONLY_DESCRIPTOR),
			desc: i18n._(SHOW_JUST_THE_TYPING_INDICATOR_WITHOUT_AVATARS_DESCRIPTOR),
		},
		{
			value: ChannelTypingIndicatorMode.HIDDEN,
			name: i18n._(HIDDEN_DESCRIPTOR),
			desc: i18n._(DON_T_SHOW_TYPING_INDICATORS_IN_THE_CHANNEL_DESCRIPTOR),
		},
	];
	return (
		<>
		<SettingsTabSection
			title={i18n._(CHANNEL_LIST_TYPING_INDICATORS_DESCRIPTOR)}
			data-flx="user.appearance-tab.interface-tab.interface-tab-content.settings-tab-section"
		>
			<ChannelListPreview
				mode={Accessibility.channelTypingIndicatorMode}
				data-flx="user.appearance-tab.interface-tab.interface-tab-content.channel-list-preview"
			/>
			<RadioGroup
				options={channelTypingIndicatorOptions}
				value={Accessibility.channelTypingIndicatorMode}
				onChange={(value) => AccessibilityCommands.update({channelTypingIndicatorMode: value})}
				aria-label={i18n._(CHANNEL_LIST_TYPING_INDICATOR_MODE_DESCRIPTOR)}
				data-flx="user.appearance-tab.interface-tab.interface-tab-content.radio-group.update"
			/>
		</SettingsTabSection>
		<SettingsTabSection
			title={i18n._(TYPING_PRIVACY_SECTION_DESCRIPTOR)}
			data-flx="user.appearance-tab.interface-tab.typing-privacy"
		>
			<Switch
				label={i18n._(SEND_TYPING_INDICATORS_DESCRIPTOR)}
				description={i18n._(SEND_TYPING_INDICATORS_HELP_DESCRIPTOR)}
				value={TypingPrivacy.sendTypingIndicators}
				onChange={TypingPrivacy.setSendTypingIndicators}
			/>
			<Switch
				label={i18n._(SHOW_TYPING_INDICATORS_DESCRIPTOR)}
				description={i18n._(SHOW_TYPING_INDICATORS_HELP_DESCRIPTOR)}
				value={TypingPrivacy.showTypingIndicators}
				onChange={TypingPrivacy.setShowTypingIndicators}
			/>
		</SettingsTabSection>
		<SettingsTabSection
			title={i18n._(PLATFORM_ICONS_SECTION_DESCRIPTOR)}
			data-flx="user.appearance-tab.interface-tab.platform-icons"
		>
			<Switch
				label={i18n._(SHOW_PLATFORM_ICONS_DESCRIPTOR)}
				description={i18n._(SHOW_PLATFORM_ICONS_HELP_DESCRIPTOR)}
				value={SparkcordPrefs.get('showPlatformIcons')}
				onChange={(value) => SparkcordPrefs.set('showPlatformIcons', value)}
			/>
			<Switch
				label={i18n._(HIDE_PLATFORM_DESCRIPTOR)}
				description={i18n._(HIDE_PLATFORM_HELP_DESCRIPTOR)}
				value={SparkcordPrefs.get('hidePlatform')}
				onChange={(value) => SparkcordPrefs.set('hidePlatform', value)}
			/>
		</SettingsTabSection>
		</>
	);
});
