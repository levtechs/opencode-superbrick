import {
  AmbientLight, Box3, Color, DirectionalLight, DoubleSide, Group, LoadingManager, Material, Mesh,
  Object3D, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/addons/materials/LDrawConditionalLineMaterial.js";

export interface CameraState { position: number[]; target: number[]; ortho?: boolean; zoom?: number }
export type ViewName = "front" | "top" | "right" | "iso";

/** SuperBrick's dark viewport colour. */
export const VIEWPORT_BG = "#2b3036";

export function disposeObject(object: Object3D): void {
  const materials = new Set<Material>();
  object.traverse((node) => {
    const drawable = node as Mesh;
    drawable.geometry?.dispose();
    if (drawable.material) for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) materials.add(material);
  });
  materials.forEach((material) => material.dispose());
}

// The same "ghost baseplate" SuperBrick draws: stud grid lines and stud rings under the lowest piece.
const GROUND_VERTEX = `
varying vec2 vPlane;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPlane = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const GROUND_FRAGMENT = `
uniform vec2 phase;
varying vec2 vPlane;
void main() {
  vec2 p = (vPlane - phase) / 20.0;
  vec2 aa = max(fwidth(p), vec2(0.0001));
  vec2 cell = abs(fract(p) - 0.5) / aa;
  float grid = 1.0 - smoothstep(0.5, 1.5, min(cell.x, cell.y));
  float studDistance = abs(length(fract(p + 0.5) - 0.5) - 0.30);
  float stud = 1.0 - smoothstep(0.015, 0.015 + max(aa.x, aa.y), studDistance);
  float detail = clamp(1.0 - max(aa.x, aa.y) * 2.0, 0.0, 1.0);
  gl_FragColor = vec4(0.42, 0.52, 0.47, 0.14 + detail * max(grid * 0.30, stud * 0.20));
}`;

/** Pure browser viewport; no filesystem, URLs, native handles or second agent runtime. */
export class Viewport {
  private scene = new Scene();
  private perspective = new PerspectiveCamera(35, 1, 0.1, 100_000);
  private orthographic = new OrthographicCamera(-1, 1, 1, -1, -100_000, 100_000);
  private camera: PerspectiveCamera | OrthographicCamera = this.perspective;
  private renderer: WebGLRenderer;
  private controls!: OrbitControls;
  private observer: ResizeObserver;
  private group?: Group;
  private ground?: Mesh;
  private generation = 0;
  private closed = false;
  private frame = 0;
  private edges = true;
  private hasCamera = false;
  private steps = 1;
  private step = Infinity;

  constructor(
    private host: HTMLElement,
    private saved: (state: CameraState) => void,
    initial?: CameraState,
  ) {
    this.scene.background = new Color(VIEWPORT_BG);
    this.scene.add(new AmbientLight(0xffffff, 2.1));
    const key = new DirectionalLight(0xffffff, 2.6);
    key.position.set(300, 600, 400);
    const fill = new DirectionalLight(0xdde6f2, 1.3);
    fill.position.set(-400, 150, -250);
    this.scene.add(key, fill);
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.setAttribute("aria-label", "Interactive LEGO build preview. Drag to orbit, right-drag to pan, scroll to zoom, F to fit.");
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.addEventListener("keydown", (event) => {
      if (event.key === "f" || event.key === "F") { event.preventDefault(); this.fit(); }
    });
    host.append(this.renderer.domElement);
    this.perspective.position.set(400, 300, 400);
    this.makeControls();
    if (initial) {
      this.perspective.position.fromArray(initial.position);
      this.controls.target.fromArray(initial.target);
      this.controls.update();
      if (initial.ortho) this.setOrtho(true, initial.zoom);
      this.hasCamera = true;
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }

  private makeControls(): void {
    const target = this.controls?.target.clone();
    this.controls?.dispose();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    if (target) this.controls.target.copy(target);
    this.controls.addEventListener("change", () => this.draw());
    this.controls.addEventListener("end", () => this.saved(this.cameraState()));
    this.controls.update();
  }

  private resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    this.updateOrthoFrustum();
    this.draw();
  }

  private updateOrthoFrustum(): void {
    const distance = this.camera.position.distanceTo(this.controls.target) || 600;
    const half = distance * Math.tan(this.perspective.fov * Math.PI / 360);
    const aspect = this.perspective.aspect || 1;
    Object.assign(this.orthographic, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.orthographic.updateProjectionMatrix();
  }

  get ortho(): boolean { return this.camera === this.orthographic; }

  setOrtho(enabled: boolean, zoom = 1): void {
    if (enabled === this.ortho) return;
    const from = this.camera;
    const to = enabled ? this.orthographic : this.perspective;
    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    this.camera = to;
    if (enabled) { this.orthographic.zoom = zoom; this.updateOrthoFrustum(); }
    this.makeControls();
    this.saved(this.cameraState());
    this.draw();
  }

  /** Loads a packed MPD. Returns the number of LDraw building steps. */
  async load(packed: string, reset = false): Promise<number> {
    const generation = ++this.generation;
    const manager = new LoadingManager();
    // Every dependency was packed by main. Never let malformed models trigger network/file requests.
    manager.setURLModifier(() => { throw new Error("An unpacked part was requested; refresh the preview or check the LDraw library."); });
    const loader = new LDrawLoader(manager);
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    // Hard-edged live previews avoid expensive full-model normal smoothing on
    // every clump (646-part house: ~0.8s vs ~6s in the local CPU smoke test).
    loader.smoothNormals = false;
    const group = await new Promise<Group>((done, fail) => loader.parse(packed, done, fail));
    if (this.closed || generation !== this.generation) { disposeObject(group); return this.steps; }
    // LDraw Y points downward. Rotate the entire scene into the conventional Y-up orbit frame.
    group.rotation.x = Math.PI;
    group.updateMatrixWorld(true);
    if (this.group) { this.scene.remove(this.group); disposeObject(this.group); }
    this.group = group;
    this.scene.add(group);
    const previous = this.steps;
    this.steps = Math.max(1, Number(group.userData.numBuildingSteps) || 1);
    // Following the latest step stays at the latest step; a scrubbed position is kept.
    if (this.step >= previous - 1) this.step = Infinity;
    this.applyStep();
    this.showEdges(this.edges);
    this.placeGround();
    if (!this.hasCamera || reset) this.fit();
    else this.draw();
    return this.steps;
  }

  private placeGround(): void {
    if (this.ground) { this.scene.remove(this.ground); disposeObject(this.ground); this.ground = undefined; }
    if (!this.group) return;
    const box = new Box3().setFromObject(this.group);
    if (box.isEmpty()) return;
    const margin = 80; // At least four studs on every side, like SuperBrick's ghost baseplate.
    const snap = (value: number, up: boolean) => (up ? Math.ceil(value / 20) : Math.floor(value / 20)) * 20;
    const minX = snap(box.min.x - margin, false), maxX = snap(box.max.x + margin, true);
    const minZ = snap(box.min.z - margin, false), maxZ = snap(box.max.z + margin, true);
    const material = new ShaderMaterial({
      vertexShader: GROUND_VERTEX, fragmentShader: GROUND_FRAGMENT,
      uniforms: { phase: { value: [box.min.x + 10, box.min.z + 10] } },
      transparent: true, depthWrite: false, side: DoubleSide,
    });
    const plane = new Mesh(new PlaneGeometry(maxX - minX, maxZ - minZ), material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((minX + maxX) / 2, box.min.y - 0.05, (minZ + maxZ) / 2);
    plane.renderOrder = -1;
    plane.raycast = () => {};
    this.ground = plane;
    this.scene.add(plane);
  }

  get stepCount(): number { return this.steps; }
  get currentStep(): number { return Math.min(this.step, this.steps); }

  /** Shows steps 1..n (1-based). */
  setStep(step: number): void {
    this.step = step >= this.steps ? Infinity : Math.max(1, Math.round(step));
    this.applyStep();
    this.draw();
  }

  private applyStep(): void {
    const last = Math.min(this.step, this.steps) - 1;
    this.group?.traverse((node) => {
      if (node === this.group || !(node as Group).isGroup) return;
      const step = node.userData.buildingStep;
      if (typeof step === "number") node.visible = step <= last;
    });
  }

  fit(): void {
    if (!this.group) return;
    const box = new Box3().setFromObject(this.group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const radius = Math.max(box.getSize(new Vector3()).length() / 2, 20);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    if (!direction.lengthSq()) direction.set(0.57, 0.47, 0.82).normalize();
    const distance = radius / Math.sin(this.perspective.fov * Math.PI / 360) * Math.max(1, 1 / this.perspective.aspect) * 1.1;
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.perspective.near = Math.max(0.1, radius / 10_000);
    this.perspective.far = Math.max(100_000, distance + radius * 100);
    this.perspective.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.orthographic.zoom = 1;
    this.updateOrthoFrustum();
    this.controls.update();
    this.hasCamera = true;
    this.saved(this.cameraState());
    this.draw();
  }

  view(kind: ViewName): void {
    const distance = this.camera.position.distanceTo(this.controls.target) || 600;
    // Scene is LDraw rotated 180° about X: LDraw front (−Z) is +Z here, LDraw right (+X) stays +X.
    const direction = kind === "front" ? new Vector3(0, 0.0001, 1)
      : kind === "top" ? new Vector3(0, 1, 0.0001)
        : kind === "right" ? new Vector3(1, 0.0001, 0)
          : new Vector3(0.57, 0.47, 0.82); // SuperBrick "iso": yaw 35°, pitch 28°
    this.camera.position.copy(this.controls.target).addScaledVector(direction.normalize(), distance);
    this.controls.update();
    this.saved(this.cameraState());
    this.draw();
  }

  showEdges(visible: boolean): void {
    this.edges = visible;
    this.group?.traverse((node) => { if ((node as Object3D & { isLineSegments?: boolean }).isLineSegments) node.visible = visible; });
    this.draw();
  }

  cameraState(): CameraState {
    return { position: this.camera.position.toArray(), target: this.controls.target.toArray(), ortho: this.ortho, zoom: this.orthographic.zoom };
  }

  private draw(): void {
    if (this.closed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.closed) this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.closed = true;
    this.generation++;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    if (this.group) disposeObject(this.group);
    if (this.ground) disposeObject(this.ground);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
