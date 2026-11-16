// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the corner rounding slider. Most corner sizes in the app are fixed values
// in its stylesheets rather than shared variables, so this rewrites every border-radius
// in the loaded stylesheets to "its value times var(--sparkcord-radius-scale)". Round
// things (avatars, pills, percentages) are left alone. Nothing is touched until the
// slider is first moved away from 100%.

const SCALE_VAR = '--sparkcord-radius-scale';
const CORNERS = [
	'border-top-left-radius',
	'border-top-right-radius',
	'border-bottom-right-radius',
	'border-bottom-left-radius',
] as const;
/** Radii above this are pills or circles; scaling them would change nothing or look odd. */
const PILL_PX = 40;

const processedSheets = new WeakSet<CSSStyleSheet>();
let observer: MutationObserver | null = null;

/** Splits "a b" on top-level spaces (not inside parentheses). */
function splitTokens(value: string): Array<string> {
	const tokens: Array<string> = [];
	let depth = 0;
	let current = '';
	for (const char of value) {
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (char === ' ' && depth === 0) {
			if (current) tokens.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	if (current) tokens.push(current);
	return tokens;
}

function scaleToken(token: string): string {
	if (token.includes(SCALE_VAR) || token.endsWith('%')) return token;
	const length = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(token);
	if (length) {
		const px = Number(length[1]) * (length[2] === 'px' ? 1 : 16);
		if (px === 0 || px > PILL_PX) return token;
		return `calc(${token} * var(${SCALE_VAR}, 1))`;
	}
	if (token.startsWith('var(')) {
		if (/full|pill|circle|round/i.test(token)) return token;
		return `calc(${token} * var(${SCALE_VAR}, 1))`;
	}
	if (token.startsWith('calc(')) return `calc(${token} * var(${SCALE_VAR}, 1))`;
	return token;
}

function processRules(rules: CSSRuleList): void {
	for (const rule of Array.from(rules)) {
		const nested = (rule as CSSGroupingRule).cssRules;
		if (nested && nested.length > 0) processRules(nested);
		const style = (rule as CSSStyleRule).style;
		if (!style || typeof style.getPropertyValue !== 'function') continue;
		// A shorthand that uses var() can't be read corner by corner; rewrite it whole.
		const shorthand = style.getPropertyValue('border-radius').trim();
		if (shorthand.includes('var(') && !shorthand.includes('/')) {
			const scaled = splitTokens(shorthand).map(scaleToken).join(' ');
			if (scaled !== shorthand) style.setProperty('border-radius', scaled, style.getPropertyPriority('border-radius'));
			continue;
		}
		for (const corner of CORNERS) {
			const value = style.getPropertyValue(corner).trim();
			if (!value) continue;
			const scaled = splitTokens(value).map(scaleToken).join(' ');
			if (scaled !== value) style.setProperty(corner, scaled, style.getPropertyPriority(corner));
		}
	}
}

function processSheets(): void {
	for (const sheet of Array.from(document.styleSheets)) {
		if (processedSheets.has(sheet)) continue;
		try {
			processRules(sheet.cssRules);
			processedSheets.add(sheet);
		} catch {
			// A stylesheet from another origin, or one still loading; retried when it loads.
		}
	}
}

function watchForNewSheets(): void {
	if (observer) return;
	let queued = false;
	const schedule = () => {
		if (queued) return;
		queued = true;
		window.setTimeout(() => {
			queued = false;
			processSheets();
		}, 50);
	};
	observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of Array.from(record.addedNodes)) {
				if (node instanceof HTMLLinkElement) node.addEventListener('load', schedule, {once: true});
				if (node instanceof HTMLLinkElement || node instanceof HTMLStyleElement) schedule();
			}
			// A theme's <style> element whose text is replaced becomes a new stylesheet.
			if (record.target instanceof HTMLStyleElement || record.target.parentNode instanceof HTMLStyleElement) {
				schedule();
			}
		}
	});
	observer.observe(document.documentElement, {childList: true, subtree: true, characterData: true});
}

/** Applies the corner rounding scale (1 = the theme's own corners). */
export function applyCornerRounding(scale: number): void {
	if (typeof document === 'undefined') return;
	document.documentElement.style.setProperty(SCALE_VAR, String(scale));
	if (scale === 1 && !observer) return;
	processSheets();
	watchForNewSheets();
}
