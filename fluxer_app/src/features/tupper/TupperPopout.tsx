// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {BottomSheet} from '@app/features/ui/bottom_sheet/BottomSheet';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {observer} from 'mobx-react-lite';
import React, {Suspense, useCallback, useState} from 'react';

// Loaded on first open: keeping the card (and its imports) out of the message components'
// static import graph avoids perturbing module init order, which has many cycles and
// fails at startup with a TDZ error when it shifts.
const TupperCard = React.lazy(() =>
	import('@app/features/tupper/TupperCard').then((m) => ({default: m.TupperCard})),
);

type ChildProps = React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>;

interface TupperPopoutProps {
	message: Message;
	children: React.ReactElement<ChildProps>;
	onPopoutOpen?: () => void;
	onPopoutClose?: () => void;
}

/** Opens the tupper's card (instead of the account's profile) from a proxied message's avatar or name. */
export const TupperPopout = observer(function TupperPopout({
	message,
	children,
	onPopoutOpen,
	onPopoutClose,
}: TupperPopoutProps) {
	const [sheetOpen, setSheetOpen] = useState(false);
	const handleSheetClose = useCallback(() => setSheetOpen(false), []);
	if (MobileLayout.enabled) {
		const {onClick: originalOnClick} = children.props;
		return (
			<>
				{React.cloneElement(children, {
					onClick: (event: React.MouseEvent<HTMLElement>) => {
						originalOnClick?.(event);
						setSheetOpen(true);
					},
				})}
				{sheetOpen && (
					<BottomSheet
						isOpen={true}
						onClose={handleSheetClose}
						disablePadding={true}
						disableDefaultHeader={true}
						data-flx="tupper.popout.bottom-sheet"
					>
						<Suspense fallback={null}>
							<TupperCard message={message} onClose={handleSheetClose} variant="sheet" />
						</Suspense>
					</BottomSheet>
				)}
			</>
		);
	}
	return (
		<Popout
			render={({onClose}) => (
				<Suspense fallback={null}>
					<TupperCard message={message} onClose={onClose} />
				</Suspense>
			)}
			position="right-start"
			animationType="profile-slide"
			constrainHeight={false}
			freezePosition
			keepOpenOnTargetUnmount
			onOpen={onPopoutOpen}
			onClose={onPopoutClose}
			data-flx="tupper.popout"
		>
			{children}
		</Popout>
	);
});
