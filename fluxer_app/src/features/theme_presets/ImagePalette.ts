// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: turns a picture into a theme background (shrunk to a WebP small enough to
// keep inside the theme) and works out theme colours from it: whether it suits a dark
// or light theme, a panel tint and an accent colour.

type Rgb = [number, number, number];

/** Longest side of the stored background, and the size it should stay under. */
const MAX_SIDE = 1920;
const TARGET_BYTES = 1_500_000;

export interface ImageColours {
	/** Which base suits the picture (by its average brightness). */
	suggestedBase: 'dark' | 'light';
	/** Average colour of the whole picture. */
	average: Rgb;
	/** Average colours of the top and bottom halves (for the loading gradient). */
	top: Rgb;
	bottom: Rgb;
	/** The picture's most prominent vivid colour, or null for a grey picture. */
	vivid: Rgb | null;
}

export interface ProcessedImage {
	dataUrl: string;
	colours: ImageColours;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('This file is not an image the browser can open'));
		};
		image.src = url;
	});
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/** Shrinks the picture until its WebP (JPEG where WebP can't be made) fits the target. */
async function encodeBackground(image: HTMLImageElement): Promise<string> {
	let side = MAX_SIDE;
	for (let attempt = 0; attempt < 6; attempt++) {
		const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
		canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
		canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
		const quality = attempt < 2 ? 0.82 : 0.72;
		let blob = await canvasToBlob(canvas, 'image/webp', quality);
		if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality);
		if (!blob) throw new Error("Couldn't convert the image");
		if (blob.size <= TARGET_BYTES || attempt === 5) return blobToDataUrl(blob);
		side = Math.round(side * 0.8);
	}
	throw new Error("Couldn't make the image small enough");
}

export function luminance([r, g, b]: Rgb): number {
	const channel = (value: number) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
	else if (max === gn) h = (bn - rn) / d + 2;
	else h = (rn - gn) / d + 4;
	return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hp = (((h % 360) + 360) % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let rgb: [number, number, number];
	if (hp < 1) rgb = [c, x, 0];
	else if (hp < 2) rgb = [x, c, 0];
	else if (hp < 3) rgb = [0, c, x];
	else if (hp < 4) rgb = [0, x, c];
	else if (hp < 5) rgb = [x, 0, c];
	else rgb = [c, 0, x];
	const m = l - c / 2;
	return rgb.map((v) => Math.round((v + m) * 255)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): Rgb {
	const value = hex.replace('#', '');
	const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value.padEnd(6, '0');
	return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) || 0) as Rgb;
}

/** Samples the picture small and finds its average colours and its main vivid colour. */
function analyse(image: HTMLImageElement): ImageColours {
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext('2d', {willReadFrequently: true});
	if (!context) throw new Error('Canvas is not available');
	context.drawImage(image, 0, 0, size, size);
	const {data} = context.getImageData(0, 0, size, size);
	const sums = {all: [0, 0, 0], top: [0, 0, 0], bottom: [0, 0, 0]};
	let lightSum = 0;
	// Vivid colours are grouped by hue (24 groups) and weighted by how vivid they are.
	const buckets = Array.from({length: 24}, () => ({weight: 0, r: 0, g: 0, b: 0}));
	const pixels = size * size;
	for (let i = 0; i < pixels; i++) {
		const rgb: Rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
		const half = i < pixels / 2 ? sums.top : sums.bottom;
		for (let c = 0; c < 3; c++) {
			sums.all[c] += rgb[c];
			half[c] += rgb[c];
		}
		lightSum += luminance(rgb);
		const [h, s, l] = rgbToHsl(rgb);
		if (s < 0.25 || l < 0.12 || l > 0.92) continue;
		const weight = s * (1 - Math.abs(l - 0.5) * 1.4);
		const bucket = buckets[Math.floor(h / 15) % 24];
		bucket.weight += weight;
		bucket.r += rgb[0] * weight;
		bucket.g += rgb[1] * weight;
		bucket.b += rgb[2] * weight;
	}
	const avg = (sum: Array<number>, count: number) => sum.map((v) => Math.round(v / count)) as Rgb;
	const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
	// Ignore a "vivid" colour that only a handful of pixels have.
	const vivid =
		best.weight > pixels * 0.01
			? ([best.r, best.g, best.b].map((v) => Math.round(v / best.weight)) as Rgb)
			: null;
	return {
		suggestedBase: lightSum / pixels > 0.4 ? 'light' : 'dark',
		average: avg(sums.all, pixels),
		top: avg(sums.top, pixels / 2),
		bottom: avg(sums.bottom, pixels / 2),
		vivid,
	};
}

export async function processThemeImage(file: Blob): Promise<ProcessedImage> {
	const image = await loadImage(file);
	const colours = analyse(image);
	const dataUrl = await encodeBackground(image);
	return {dataUrl, colours};
}

export interface DerivedThemeColours {
	panel: string;
	accent: string;
	accentLight: string;
	onAccent: string;
	link: string;
	gradient: string;
}

/**
 * Theme colours for a base: the panel is the picture's average hue made very dark (or very
 * light), and the accent is its vivid colour (or `accentHex` when chosen by hand) moved to a
 * brightness that reads well on that panel.
 */
export function deriveThemeColours(
	colours: ImageColours,
	base: 'dark' | 'light',
	accentHex?: string,
): DerivedThemeColours {
	const dark = base === 'dark';
	const [avgH, avgS] = rgbToHsl(colours.average);
	const panel = hslToRgb(avgH, Math.min(avgS, 0.45), dark ? 0.08 : 0.96);
	let accent: Rgb;
	if (accentHex) {
		accent = hexToRgb(accentHex);
	} else {
		const source = colours.vivid ?? colours.average;
		const [h, s] = rgbToHsl(source);
		accent = colours.vivid ? hslToRgb(h, Math.max(s, 0.55), dark ? 0.66 : 0.46) : hslToRgb(h, s * 0.5, dark ? 0.72 : 0.4);
	}
	const [accH, accS, accL] = rgbToHsl(accent);
	const accentLight = hslToRgb(accH, accS, Math.min(0.9, accL + (1 - accL) * 0.6));
	const onAccent = luminance(accent) > 0.36 ? hslToRgb(accH, Math.min(accS, 0.5), 0.1) : ([255, 255, 255] as Rgb);
	const link = hslToRgb(accH, accS, dark ? Math.max(accL, 0.72) : Math.min(accL, 0.42));
	return {
		panel: panel.join(', '),
		accent: rgbToHex(accent),
		accentLight: rgbToHex(accentLight),
		onAccent: rgbToHex(onAccent),
		link: rgbToHex(link),
		gradient: `linear-gradient(180deg, ${rgbToHex(colours.top)} 0%, ${rgbToHex(colours.bottom)} 100%)`,
	};
}
