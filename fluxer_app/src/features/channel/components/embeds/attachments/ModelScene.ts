// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the three.js side of the 3D model viewer. Loaded as its own chunk the first
// time a model attachment scrolls into view. Parses the file, frames it, and renders on
// demand (continuously only while the model animates or is being dragged).

import {
	AmbientLight,
	AnimationMixer,
	Box3,
	type BufferGeometry,
	Clock,
	Color,
	DirectionalLight,
	DoubleSide,
	Mesh,
	MeshStandardMaterial,
	NeutralToneMapping,
	type Object3D,
	PerspectiveCamera,
	PMREMGenerator,
	Points,
	PointsMaterial,
	Scene,
	Sphere,
	Vector3,
	WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'ply' | 'fbx';

export interface ModelView {
	triangles: number;
	resize(): void;
	resetView(): void;
	dispose(): void;
}

const DEFAULT_COLOR = 0xb8bcc8;

function defaultMaterial(geometry?: BufferGeometry): MeshStandardMaterial {
	return new MeshStandardMaterial({
		color: geometry?.hasAttribute('color') ? 0xffffff : DEFAULT_COLOR,
		vertexColors: geometry?.hasAttribute('color') ?? false,
		roughness: 0.6,
		metalness: 0.05,
		side: DoubleSide,
	});
}

async function parseModel(bytes: ArrayBuffer, format: ModelFormat): Promise<{object: Object3D; mixer: AnimationMixer | null}> {
	switch (format) {
		case 'glb':
		case 'gltf': {
			const {GLTFLoader} = await import('three/examples/jsm/loaders/GLTFLoader.js');
			const gltf = await new GLTFLoader().parseAsync(bytes, '');
			let mixer: AnimationMixer | null = null;
			if (gltf.animations.length > 0) {
				mixer = new AnimationMixer(gltf.scene);
				mixer.clipAction(gltf.animations[0]).play();
			}
			return {object: gltf.scene, mixer};
		}
		case 'obj': {
			const {OBJLoader} = await import('three/examples/jsm/loaders/OBJLoader.js');
			const group = new OBJLoader().parse(new TextDecoder().decode(bytes));
			group.traverse((child) => {
				if (child instanceof Mesh) {
					if (!child.geometry.hasAttribute('normal')) child.geometry.computeVertexNormals();
					child.material = defaultMaterial(child.geometry);
				}
			});
			return {object: group, mixer: null};
		}
		case 'stl': {
			const {STLLoader} = await import('three/examples/jsm/loaders/STLLoader.js');
			const geometry = new STLLoader().parse(bytes);
			if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
			const mesh = new Mesh(geometry, defaultMaterial(geometry));
			// STL files are Z-up by convention (3D printing).
			mesh.rotation.x = -Math.PI / 2;
			return {object: mesh, mixer: null};
		}
		case 'ply': {
			const {PLYLoader} = await import('three/examples/jsm/loaders/PLYLoader.js');
			const geometry = new PLYLoader().parse(bytes);
			if (geometry.index === null) {
				// A point cloud.
				geometry.computeBoundingSphere();
				const size = (geometry.boundingSphere?.radius ?? 1) / 300;
				const material = new PointsMaterial({
					size,
					color: geometry.hasAttribute('color') ? 0xffffff : DEFAULT_COLOR,
					vertexColors: geometry.hasAttribute('color'),
				});
				return {object: new Points(geometry, material), mixer: null};
			}
			if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
			return {object: new Mesh(geometry, defaultMaterial(geometry)), mixer: null};
		}
		case 'fbx': {
			const {FBXLoader} = await import('three/examples/jsm/loaders/FBXLoader.js');
			const group = new FBXLoader().parse(bytes, '');
			let mixer: AnimationMixer | null = null;
			if (group.animations.length > 0) {
				mixer = new AnimationMixer(group);
				mixer.clipAction(group.animations[0]).play();
			}
			return {object: group, mixer};
		}
	}
}

function countTriangles(object: Object3D): number {
	let triangles = 0;
	object.traverse((child) => {
		if (child instanceof Mesh) {
			const geometry = child.geometry as BufferGeometry;
			triangles += (geometry.index ? geometry.index.count : (geometry.getAttribute('position')?.count ?? 0)) / 3;
		}
	});
	return Math.round(triangles);
}

function disposeObject(object: Object3D): void {
	object.traverse((child) => {
		const node = child as Mesh;
		node.geometry?.dispose();
		const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
		for (const material of materials) {
			for (const value of Object.values(material)) {
				if (value && typeof value === 'object' && 'isTexture' in value) (value as {dispose(): void}).dispose();
			}
			material.dispose();
		}
	});
}

export async function createModelView(
	canvas: HTMLCanvasElement,
	bytes: ArrayBuffer,
	format: ModelFormat,
): Promise<ModelView> {
	const {object, mixer} = await parseModel(bytes, format);

	const renderer = new WebGLRenderer({canvas, antialias: true, alpha: true});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.toneMapping = NeutralToneMapping;

	const scene = new Scene();
	const pmrem = new PMREMGenerator(renderer);
	const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environment = environment;
	scene.add(new AmbientLight(new Color(0xffffff), 0.3));
	const camera = new PerspectiveCamera(40, 1, 0.01, 1000);
	const keyLight = new DirectionalLight(0xffffff, 1.6);
	keyLight.position.set(1, 1.5, 2);
	camera.add(keyLight);
	scene.add(camera);
	scene.add(object);

	const bounds = new Box3().setFromObject(object);
	const sphere = bounds.getBoundingSphere(new Sphere());
	const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1;
	const center = Number.isFinite(sphere.center.x) ? sphere.center : new Vector3();

	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.12;
	// Don't hijack the wheel while someone scrolls the chat past the model: zooming starts
	// once the model was clicked (or is fullscreen) and stops when the pointer leaves.
	controls.enableZoom = false;
	const enableZoom = () => {
		controls.enableZoom = true;
	};
	const disableZoom = () => {
		controls.enableZoom = document.fullscreenElement !== null;
	};
	canvas.addEventListener('pointerdown', enableZoom);
	canvas.addEventListener('pointerleave', disableZoom);
	document.addEventListener('fullscreenchange', disableZoom);

	let frame = 0;
	let disposed = false;
	const clock = new Clock();

	const render = () => {
		frame = 0;
		if (disposed) return;
		if (mixer) mixer.update(clock.getDelta());
		const moving = controls.update();
		renderer.render(scene, camera);
		if (mixer || moving) requestRender();
	};
	const requestRender = () => {
		if (!frame && !disposed) frame = requestAnimationFrame(render);
	};

	const resetView = () => {
		const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
		camera.near = Math.max(radius / 500, 0.0001);
		camera.far = distance + radius * 20;
		camera.position.copy(center).add(new Vector3(0.6, 0.45, 1).normalize().multiplyScalar(distance));
		camera.updateProjectionMatrix();
		controls.target.copy(center);
		controls.minDistance = radius / 20;
		controls.maxDistance = radius * 15;
		controls.update();
		requestRender();
	};

	const resize = () => {
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width === 0 || height === 0) return;
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		requestRender();
	};

	controls.addEventListener('change', requestRender);
	resize();
	resetView();

	return {
		triangles: countTriangles(object),
		resize,
		resetView,
		dispose() {
			disposed = true;
			if (frame) cancelAnimationFrame(frame);
			canvas.removeEventListener('pointerdown', enableZoom);
			canvas.removeEventListener('pointerleave', disableZoom);
			document.removeEventListener('fullscreenchange', disableZoom);
			controls.dispose();
			disposeObject(object);
			environment.dispose();
			pmrem.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
		},
	};
}
