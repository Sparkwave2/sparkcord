// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: renderers for the extended markdown nodes (rules, highlight, super/subscript,
// math, inline images, task-list markers and footnotes).

import styles from '@app/features/messaging/components/markdown/renderers/common/ExtendedElements.module.css';
import type {RendererProps} from '@app/features/messaging/components/markdown/renderers/RendererTypes';
import type {
	ExtendedFormattingNode,
	FootnoteDefinitionNode,
	FootnoteRefNode,
	FootnotesNode,
	ImageNode,
	MathNode,
	TaskMarkerNode,
} from '@app/features/messaging/utils/markdown/parser/Nodes';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {CheckSquareIcon, ImageIcon, SquareIcon} from '@phosphor-icons/react';
import type katexDefault from 'katex';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useMemo, useState} from 'react';

export function RuleRenderer({id}: RendererProps): React.ReactElement {
	return <hr key={id} className={styles.rule} />;
}

export function HighlightRenderer({node, id, renderChildren}: RendererProps<ExtendedFormattingNode>): React.ReactElement {
	return (
		<mark key={id} className={styles.highlight}>
			{renderChildren(node.children)}
		</mark>
	);
}

export function SuperscriptRenderer({node, id, renderChildren}: RendererProps<ExtendedFormattingNode>): React.ReactElement {
	return <sup key={id}>{renderChildren(node.children)}</sup>;
}

export function SubscriptRenderer({node, id, renderChildren}: RendererProps<ExtendedFormattingNode>): React.ReactElement {
	return <sub key={id}>{renderChildren(node.children)}</sub>;
}

// KaTeX is loaded only when a message contains math.
type KatexModule = typeof katexDefault;
let katexPromise: Promise<KatexModule> | null = null;
let katexModule: KatexModule | null = null;
function loadKatex(): Promise<KatexModule> {
	katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([{default: kt}]) => {
		katexModule = kt;
		return kt;
	});
	return katexPromise;
}

export function MathRenderer({node, id}: RendererProps<MathNode>): React.ReactElement {
	const [katex, setKatex] = useState<KatexModule | null>(katexModule);
	useEffect(() => {
		if (katex) return;
		let cancelled = false;
		loadKatex().then((kt) => {
			if (!cancelled) setKatex(kt);
		});
		return () => {
			cancelled = true;
		};
	}, [katex]);
	const html = useMemo(() => {
		if (!katex) return null;
		try {
			return katex.renderToString(node.content, {
				displayMode: node.display,
				throwOnError: false,
				trust: false,
				maxExpand: 512,
				output: 'htmlAndMathml',
			});
		} catch {
			return null;
		}
	}, [katex, node.content, node.display]);
	const Tag = node.display ? 'div' : 'span';
	const className = node.display ? styles.mathBlock : styles.mathInline;
	if (html === null) {
		return (
			<Tag key={id} className={className}>
				<code>{node.content}</code>
			</Tag>
		);
	}
	// biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output with trust disabled.
	return <Tag key={id} className={className} dangerouslySetInnerHTML={{__html: html}} />;
}

function findProxiedEmbedMedia(options: RendererProps['options'], url: string) {
	const embeds =
		options.embeds ??
		(options.channelId && options.messageId ? Messages.getMessage(options.channelId, options.messageId)?.embeds : null);
	for (const embed of embeds ?? []) {
		for (const media of [embed.image, embed.thumbnail]) {
			if (media?.proxy_url && (media.url === url || embed.url === url)) {
				return media;
			}
		}
	}
	return null;
}

/**
 * Inline images reuse the message's own (media-proxied) embed for that URL, so the
 * viewer's browser never fetches the image from the third-party host directly. Until
 * the embed exists (or if embeds are suppressed) the image shows as a link.
 */
export const ImageRenderer = observer(function ImageRenderer({
	node,
	id,
	options,
}: RendererProps<ImageNode>): React.ReactElement {
	const proxied = findProxiedEmbedMedia(options, node.url);
	if (!proxied?.proxy_url) {
		return (
			<a key={id} className={styles.imageLink} href={node.url} target="_blank" rel="noreferrer noopener">
				<ImageIcon size={16} weight="bold" />
				{node.alt || node.url}
			</a>
		);
	}
	return (
		<a key={id} className={styles.imageWrap} href={node.url} target="_blank" rel="noreferrer noopener">
			<img
				className={styles.image}
				src={proxied.proxy_url}
				alt={node.alt}
				title={node.alt || undefined}
				width={proxied.width}
				height={proxied.height}
				loading="lazy"
			/>
		</a>
	);
});

export function TaskMarkerRenderer({node, id}: RendererProps<TaskMarkerNode>): React.ReactElement {
	return (
		<span
			key={id}
			className={node.checked ? `${styles.task} ${styles.taskChecked}` : styles.task}
			role="img"
			aria-label={node.checked ? 'Done' : 'Not done'}
		>
			{node.checked ? <CheckSquareIcon size={18} weight="fill" /> : <SquareIcon size={18} weight="bold" />}
		</span>
	);
}

function footnoteElementId(options: RendererProps['options'], index: number, kind: 'def' | 'ref'): string {
	return `sc-fn-${options.messageId ?? 'x'}-${kind}-${index}`;
}

function scrollToId(event: React.MouseEvent, targetId: string): void {
	event.preventDefault();
	const target = document.getElementById(targetId);
	if (!target) return;
	target.scrollIntoView({block: 'center', behavior: 'smooth'});
	target.classList.remove(styles.flash);
	void target.offsetWidth;
	target.classList.add(styles.flash);
}

export function FootnoteRefRenderer({node, id, options}: RendererProps<FootnoteRefNode>): React.ReactElement {
	return (
		<sup key={id} className={styles.footnoteRef} id={footnoteElementId(options, node.index, 'ref')}>
			<a
				href={`#${footnoteElementId(options, node.index, 'def')}`}
				onClick={(event) => scrollToId(event, footnoteElementId(options, node.index, 'def'))}
			>
				{node.index}
			</a>
		</sup>
	);
}

export function FootnoteDefinitionRenderer({
	node,
	id,
	options,
	renderChildren,
}: RendererProps<FootnoteDefinitionNode>): React.ReactElement {
	return (
		<li key={id} id={footnoteElementId(options, node.index, 'def')} value={node.index} className={styles.footnote}>
			{renderChildren(node.children)}{' '}
			<a
				className={styles.footnoteBack}
				href={`#${footnoteElementId(options, node.index, 'ref')}`}
				onClick={(event) => scrollToId(event, footnoteElementId(options, node.index, 'ref'))}
				aria-label="Back to text"
			>
				↩
			</a>
		</li>
	);
}

export function FootnotesRenderer({node, id, renderChildren}: RendererProps<FootnotesNode>): React.ReactElement {
	return (
		<div key={id} className={styles.footnotes}>
			<ol className={styles.footnoteList}>{renderChildren(node.items)}</ol>
		</div>
	);
}
