import { For } from "solid-js";
import type { ViewName } from "./viewport";

/** CAD-style navigation cube with SuperBrick's Z-up axes (X red, Y green, Z blue). Click a face to swing there. */
const FACES: [ViewName, string][] = [["front", "Front"], ["back", "Back"], ["right", "Right"], ["left", "Left"], ["top", "Top"], ["bottom", "Bottom"]];
const HALF = 24;
// Scene frame is Y-up with the front at +Z. SuperBrick's axes: X right, Y going back, Z up.
const AXES: [string, string, number[]][] = [["X", "#e5484d", [1, 0, 0]], ["Y", "#46a758", [0, 0, -1]], ["Z", "#3e7bfa", [0, 1, 0]]];
const ORIGIN = [-HALF, -HALF, HALF]; // left, bottom, front corner
const LENGTH = HALF * 2.9;

export function ViewCube(props: {
  register: (update: (view: ArrayLike<number>) => void) => void;
  onView: (view: ViewName) => void;
  /** Drag on the cube to orbit; done marks the end of the drag. */
  onOrbit: (dx: number, dy: number, done: boolean) => void;
}) {
  let cube!: HTMLDivElement;
  // Click a face to snap; drag anywhere on the cube to orbit freely. A drag past a few pixels swallows the click.
  let drag: { id: number; x: number; y: number; moved: boolean } | undefined;
  let swallow = false;
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    swallow = false;
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
    drag.x = event.clientX; drag.y = event.clientY;
    props.onOrbit(dx, dy, false);
  };
  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved) {
      // The click that ends a drag fires right after pointerup; swallow only that one.
      swallow = true; setTimeout(() => (swallow = false), 0);
      props.onOrbit(0, 0, true);
    }
    drag = undefined;
  };
  const lines: SVGLineElement[] = [];
  const labels: SVGTextElement[] = [];
  // view is the camera's column-major world→camera matrix; R(i,j) = view[j*4+i].
  const project = (view: ArrayLike<number>, p: number[]) => {
    const x = view[0] * p[0] + view[4] * p[1] + view[8] * p[2];
    const y = view[1] * p[0] + view[5] * p[1] + view[9] * p[2];
    return [x, -y];
  };
  props.register((view) => {
    // CSS space is y-down; conjugate the rotation by diag(1,-1,1) so the cube's own frame is CSS-like.
    const f = [1, -1, 1];
    const m: number[] = [];
    for (let j = 0; j < 3; j++) { for (let i = 0; i < 3; i++) m.push(view[j * 4 + i] * f[i] * f[j]); m.push(0); }
    m.push(0, 0, 0, 1);
    cube.style.transform = `matrix3d(${m.map((v) => v.toFixed(6)).join(",")})`;
    const [ox, oy] = project(view, ORIGIN);
    AXES.forEach(([, , axis], index) => {
      const [ex, ey] = project(view, ORIGIN.map((v, k) => v + axis[k] * LENGTH));
      const line = lines[index];
      line.setAttribute("x1", `${ox}`); line.setAttribute("y1", `${oy}`);
      line.setAttribute("x2", `${ex}`); line.setAttribute("y2", `${ey}`);
      const length = Math.hypot(ex - ox, ey - oy) || 1;
      labels[index].setAttribute("x", `${ex + (ex - ox) / length * 8}`);
      labels[index].setAttribute("y", `${ey + (ey - oy) / length * 8}`);
      labels[index].style.opacity = length < 12 ? "0" : "1";
    });
  });
  return <div class="sb-cube-wrap" aria-label="View cube: click a face, or drag to orbit" title="Click a face, or drag to orbit"
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <div class="sb-cube" ref={cube}>
      <For each={FACES}>{([view, label]) =>
        <button class={`face ${view}`} title={`${label} view`} aria-label={`${label} view`} onClick={() => { if (swallow) swallow = false; else props.onView(view); }}><span>{label}</span></button>}
      </For>
    </div>
    <svg class="sb-axes" viewBox="-60 -60 120 120" aria-hidden="true">
      <For each={AXES}>{([name, color], index) => <>
        <line ref={(el) => (lines[index()] = el)} stroke={color} stroke-width="1.6" stroke-linecap="round" />
        <text ref={(el) => (labels[index()] = el)} fill={color} text-anchor="middle" dominant-baseline="central">{name}</text>
      </>}</For>
    </svg>
  </div>;
}
