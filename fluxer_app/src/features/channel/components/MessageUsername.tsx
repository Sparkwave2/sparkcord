// SPDX-License-Identifier: AGPL-3.0-or-later

import {useContextMenuHoverState} from '@app/features/app/hooks/useContextMenuHoverState';
import {CrosspostCommunityPopout} from '@app/features/channel/components/CrosspostCommunityPopout';
import {useMaybeMessageViewContext} from '@app/features/channel/components/MessageViewContext';
import {PreloadableUserPopout} from '@app/features/channel/components/PreloadableUserPopout';
import {type NameStyle, StyledName} from '@app/features/role_style/RoleNameStyle';
import {TupperPopout} from '@app/features/tupper/TupperPopout';
import type {Guild} from '@app/features/guild/models/Guild';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import type {GuildMember} from '@app/features/member/models/GuildMember';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {getProxyDisplayName, proxyColorString} from '@app/features/tupper/TupperShared';
import styles from '@app/features/theme/styles/Message.module.css';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import KeyboardMode from '@app/features/ui/state/KeyboardMode';
import type {User} from '@app/features/user/models/User';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useRef} from 'react';
import {FontSpan, NameFont} from '@app/features/name_font/NameFont';
import Channels from '@app/features/channel/state/Channels';
import {useGroupNameColor} from '@app/features/group_name_color/GroupNameColor';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';

export const MessageUsername = observer(
	({
		user,
		message,
		guild,
		member,
		className,
		previewColor,
		previewName,
		previewNameStyle,
	}: {
		user: User;
		message: Message;
		guild?: Guild;
		member?: GuildMember;
		className: string;
		isPreview: boolean;
		previewColor?: string;
		previewName?: string;
		/** Role editor preview: the style being edited. */
		previewNameStyle?: NameStyle | null;
	}) => {
		const usernameRef = useRef<HTMLSpanElement | null>(null);
		const contextMenuOpen = useContextMenuHoverState(usernameRef);
		const proxy = message.proxy;
		const displayName =
			previewName ||
			(proxy ? getProxyDisplayName(proxy) : NicknameUtils.getNickname(user, guild?.id, message.channelId));
		// Sparkcord: in group chats (no roles) names get the author's group-chat colour.
		const groupNameColor = useGroupNameColor(
			!guild && !proxy && Channels.getChannel(message.channelId)?.type === ChannelTypes.GROUP_DM ? user.id : null,
		);
		const color =
			previewColor ||
			(proxy ? proxyColorString(proxy.color) : (member?.getColorString() ?? groupNameColor));
		const onPopoutToggle = useMaybeMessageViewContext()?.onPopoutToggle;
		const handlePopoutOpen = useCallback(() => onPopoutToggle?.(true), [onPopoutToggle]);
		const handlePopoutClose = useCallback(() => onPopoutToggle?.(false), [onPopoutToggle]);
		const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
			if (e.defaultPrevented) return;
			if (!isKeyboardActivationKey(e.key)) return;
			e.preventDefault();
			(e.currentTarget as HTMLElement).click();
		}, []);
		const keyboardModeEnabled = KeyboardMode.keyboardModeEnabled;
		const usernameNode = (
			<FocusRing data-flx="channel.message-username.focus-ring">
				<span
					className={clsx(className, contextMenuOpen && styles.contextMenuUnderline)}
					style={{color}}
					data-user-id={user.id}
					data-guild-id={guild?.id}
					tabIndex={keyboardModeEnabled ? 0 : undefined}
					role="button"
					ref={usernameRef}
					onKeyDown={handleKeyDown}
					data-flx="channel.message-username.context-menu-underline.key-down"
				>
					<FontSpan font={proxy?.font}>
						<NameFont userId={proxy ? null : user.id} guildId={guild?.id ?? null}>
<StyledName nameStyle={
							previewNameStyle !== undefined
								? previewNameStyle
								: proxy || previewColor
									? null
									: member?.getNameStyle()
						}>
						{displayName}
					</StyledName>
						</NameFont>
					</FontSpan>
				</span>
			</FocusRing>
		);
		if (message.isCrosspostCopy) {
			return (
				<CrosspostCommunityPopout
					message={message}
					onPopoutOpen={handlePopoutOpen}
					onPopoutClose={handlePopoutClose}
					data-flx="channel.message-username.crosspost-community-popout"
				>
					{usernameNode}
				</CrosspostCommunityPopout>
			);
		}
		if (message.proxy) {
			return (
				<TupperPopout message={message} onPopoutOpen={handlePopoutOpen} onPopoutClose={handlePopoutClose}>
					{usernameNode}
				</TupperPopout>
			);
		}
		return (
			<PreloadableUserPopout
				user={user}
				isWebhook={message.webhookId != null}
				webhookId={message.webhookId ?? undefined}
				guildId={guild?.id}
				guildMember={member}
				channelId={message.channelId}
				message={message}
				enableLongPressActions={true}
				longPressWrapperElement="span"
				onPopoutOpen={handlePopoutOpen}
				onPopoutClose={handlePopoutClose}
				data-flx="channel.message-username.preloadable-user-popout"
			>
				{usernameNode}
			</PreloadableUserPopout>
		);
	},
);
