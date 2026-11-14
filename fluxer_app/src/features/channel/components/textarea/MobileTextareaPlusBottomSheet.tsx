// SPDX-License-Identifier: AGPL-3.0-or-later

import * as PremiumModalCommands from '@app/features/premium/commands/PremiumModalCommands';
import {useCanSendGift} from '@app/features/premium/hooks/useCanSendGift';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {MenuBottomSheet, type MenuGroupType} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {GiftIcon, PaperclipIcon, ShareNetworkIcon, UploadSimpleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useMemo} from 'react';

const UPLOAD_FILE_DESCRIPTOR = msg({
	message: 'Upload file',
	comment: 'Button or menu action label in the channel and chat mobile textarea plus bottom sheet. Keep it concise.',
});
const UPLOAD_YOUR_MESSAGE_AS_A_FILE_DESCRIPTOR = msg({
	message: 'Upload your message as a file',
	comment: 'Button or menu action label in the channel and chat mobile textarea plus bottom sheet. Keep it concise.',
});
const SHARE_P2P_DESCRIPTOR = msg({
	message: 'Share peer-to-peer',
	comment: 'Plus menu item: send a file directly from your browser (torrent) instead of uploading it.',
});
const SEND_GIFT_DESCRIPTOR = msg({
	message: 'Send gift',
	comment: 'Button or menu action label in the channel and chat mobile textarea plus bottom sheet. Keep it concise.',
});

interface MobileTextareaPlusBottomSheetProps {
	giftChannelId?: string;
	isOpen: boolean;
	onClose: () => void;
	onUploadFile: () => void;
	textareaValue?: string;
	onUploadAsFile?: () => void;
	/** Sparkcord: share a file peer-to-peer (torrent) instead of uploading it. */
	onShareP2P?: () => void;
}

export const MobileTextareaPlusBottomSheet = observer(
	({
		giftChannelId,
		isOpen,
		onClose,
		onUploadFile,
		textareaValue,
		onUploadAsFile,
		onShareP2P,
	}: MobileTextareaPlusBottomSheetProps) => {
		const {i18n} = useLingui();
		const canSendGift = useCanSendGift(isOpen);
		const groups: Array<MenuGroupType> = useMemo(() => {
			const items = [
				{
					icon: (
						<PaperclipIcon
							weight="bold"
							data-flx="channel.textarea.mobile-textarea-plus-bottom-sheet.groups.paperclip-icon"
						/>
					),
					label: i18n._(UPLOAD_FILE_DESCRIPTOR),
					onClick: () => {
						onUploadFile();
						onClose();
					},
				},
			];
			if (onShareP2P) {
				items.push({
					icon: <ShareNetworkIcon weight="bold" />,
					label: i18n._(SHARE_P2P_DESCRIPTOR),
					onClick: () => {
						// Opens the file picker straight from the tap (browsers block delayed pickers).
						onShareP2P();
						onClose();
					},
				});
			}
			const hasTextContent = textareaValue && textareaValue.trim().length > 0;
			if (hasTextContent && onUploadAsFile) {
				items.push({
					icon: (
						<UploadSimpleIcon data-flx="channel.textarea.mobile-textarea-plus-bottom-sheet.groups.upload-simple-icon" />
					),
					label: i18n._(UPLOAD_YOUR_MESSAGE_AS_A_FILE_DESCRIPTOR),
					onClick: () => {
						onUploadAsFile();
						onClose();
					},
				});
			}
			if (canSendGift) {
				items.push({
					icon: <GiftIcon data-flx="channel.textarea.mobile-textarea-plus-bottom-sheet.groups.gift-icon" />,
					label: i18n._(SEND_GIFT_DESCRIPTOR),
					onClick: () => {
						ModalCommands.runAfterBottomSheetClose(onClose, () =>
							PremiumModalCommands.open({defaultGiftMode: true, giftChannelId}),
						);
					},
				});
			}
			return [{items}];
		}, [canSendGift, onClose, onUploadFile, textareaValue, onUploadAsFile, onShareP2P, i18n.locale]);
		return (
			<MenuBottomSheet
				isOpen={isOpen}
				onClose={onClose}
				groups={groups}
				data-flx="channel.textarea.mobile-textarea-plus-bottom-sheet.menu-bottom-sheet"
			/>
		);
	},
);

MobileTextareaPlusBottomSheet.displayName = 'MobileTextareaPlusBottomSheet';
