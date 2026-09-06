import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  CircleGeometry,
  DoubleSide,
  EdgesGeometry,
  type Group,
  LineBasicMaterial,
  type Material,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import {
  CORNER_RADIUS,
  damp,
  drift,
  parallax,
  TITLE_BAR_HEIGHT,
  type WindowSpec,
  windows,
} from './layout';
import type { ScenePalette } from './palette';

const CURVE_SEGMENTS = 5;
const SHADOW_SPREAD = 0.22;
const SHADOW_DROP = 0.06;
const LINE_HEIGHT = 0.045;
const LINE_GAP = 0.13;
const PAD = 0.14;

interface Corners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/** A rectangle centred on the origin with per-corner radii. */
function roundedRect(w: number, h: number, c: Corners): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + c.bl, y);
  s.lineTo(x + w - c.br, y);
  if (c.br) s.quadraticCurveTo(x + w, y, x + w, y + c.br);
  s.lineTo(x + w, y + h - c.tr);
  if (c.tr) s.quadraticCurveTo(x + w, y + h, x + w - c.tr, y + h);
  s.lineTo(x + c.tl, y + h);
  if (c.tl) s.quadraticCurveTo(x, y + h, x, y + h - c.tl);
  s.lineTo(x, y + c.bl);
  if (c.bl) s.quadraticCurveTo(x, y, x + c.bl, y);
  return s;
}

const shadowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Signed-distance rounded box, faded over uSpread: a soft, colourless shadow from one quad.
const shadowFragment = /* glsl */ `
  uniform vec2 uQuad;
  uniform vec2 uHalf;
  uniform float uRadius;
  uniform float uSpread;
  uniform float uOpacity;
  varying vec2 vUv;
  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    vec2 p = (vUv - 0.5) * uQuad;
    float d = roundBox(p, uHalf, uRadius);
    float a = 1.0 - smoothstep(-uSpread * 0.35, uSpread, d);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uOpacity);
  }
`;

interface WindowParts {
  body: BufferGeometry;
  edges: BufferGeometry;
  titleBar: BufferGeometry;
  titleRule: BufferGeometry;
  sidebar: BufferGeometry | null;
  lines: { geometry: BufferGeometry; x: number; y: number }[];
  selection: { geometry: BufferGeometry; x: number; y: number } | null;
  shadow: BufferGeometry;
  shadowMaterial: ShaderMaterial;
}

function buildParts(spec: WindowSpec, shadowOpacity: number): WindowParts {
  const [w, h] = spec.size;
  const r = CORNER_RADIUS;
  const tb = TITLE_BAR_HEIGHT;
  const body = new ShapeGeometry(roundedRect(w, h, { tl: r, tr: r, br: r, bl: r }), CURVE_SEGMENTS);
  const sidebarWidth = spec.sidebar ? Math.round(w * 0.28 * 100) / 100 : 0;
  const contentLeft = -w / 2 + sidebarWidth + PAD;
  const contentWidth = w - sidebarWidth - PAD * 2;
  const firstLineY = h / 2 - tb - PAD - LINE_HEIGHT / 2;

  const lines = spec.lines.map((fraction, index) => {
    const width = contentWidth * fraction;
    return {
      geometry: new PlaneGeometry(width, LINE_HEIGHT),
      x: contentLeft + width / 2,
      y: firstLineY - index * LINE_GAP,
    };
  });

  const selection =
    spec.selection === undefined
      ? null
      : {
          geometry: new PlaneGeometry(contentWidth + PAD * 0.6, LINE_GAP * 0.78),
          x: contentLeft + contentWidth / 2,
          y: firstLineY - spec.selection * LINE_GAP,
        };

  const quad = new Vector2(w + SHADOW_SPREAD * 2, h + SHADOW_SPREAD * 2);
  const shadowMaterial = new ShaderMaterial({
    vertexShader: shadowVertex,
    fragmentShader: shadowFragment,
    uniforms: {
      uQuad: { value: quad },
      uHalf: { value: new Vector2(w / 2, h / 2) },
      uRadius: { value: r },
      uSpread: { value: SHADOW_SPREAD },
      uOpacity: { value: shadowOpacity },
    },
    transparent: true,
    depthWrite: false,
  });

  return {
    body,
    edges: new EdgesGeometry(body),
    titleBar: new ShapeGeometry(roundedRect(w, tb, { tl: r, tr: r, br: 0, bl: 0 }), CURVE_SEGMENTS),
    titleRule: new PlaneGeometry(w, 0.008),
    sidebar: spec.sidebar
      ? new ShapeGeometry(
          roundedRect(sidebarWidth, h - tb, { tl: 0, tr: 0, br: 0, bl: r }),
          CURVE_SEGMENTS,
        )
      : null,
    lines,
    selection,
    shadow: new PlaneGeometry(quad.x, quad.y),
    shadowMaterial,
  };
}

function disposeParts(parts: WindowParts) {
  parts.body.dispose();
  parts.edges.dispose();
  parts.titleBar.dispose();
  parts.titleRule.dispose();
  parts.sidebar?.dispose();
  for (const line of parts.lines) line.geometry.dispose();
  parts.selection?.geometry.dispose();
  parts.shadow.dispose();
  parts.shadowMaterial.dispose();
}

interface SceneMaterials {
  surface: MeshBasicMaterial;
  titleBar: MeshBasicMaterial;
  edge: LineBasicMaterial;
  control: MeshBasicMaterial;
  line: MeshBasicMaterial;
  selection: MeshBasicMaterial;
}

function buildMaterials(palette: ScenePalette): SceneMaterials {
  return {
    surface: new MeshBasicMaterial({ color: palette.surface, side: DoubleSide }),
    titleBar: new MeshBasicMaterial({ color: palette.titleBar }),
    edge: new LineBasicMaterial({ color: palette.border }),
    control: new MeshBasicMaterial({ color: palette.control }),
    line: new MeshBasicMaterial({ color: palette.line }),
    selection: new MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  };
}

const disposeAll = (materials: SceneMaterials) => {
  for (const material of Object.values(materials) as Material[]) material.dispose();
};

interface WindowProps {
  spec: WindowSpec;
  parts: WindowParts;
  materials: SceneMaterials;
  control: BufferGeometry;
  groupRef: (group: Group | null) => void;
}

function Window({ spec, parts, materials, control, groupRef }: WindowProps) {
  const [w, h] = spec.size;
  const tb = TITLE_BAR_HEIGHT;
  const titleY = h / 2 - tb / 2;
  return (
    <group ref={groupRef} position={[spec.position[0], spec.position[1], spec.position[2]]}>
      <mesh
        geometry={parts.shadow}
        material={parts.shadowMaterial}
        position={[0, -SHADOW_DROP, -0.02]}
      />
      <mesh geometry={parts.body} material={materials.surface} />
      <lineSegments geometry={parts.edges} material={materials.edge} position={[0, 0, 0.004]} />
      <mesh geometry={parts.titleBar} material={materials.titleBar} position={[0, titleY, 0.001]} />
      <mesh
        geometry={parts.titleRule}
        material={materials.edge}
        position={[0, h / 2 - tb, 0.002]}
      />
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          geometry={control}
          material={materials.control}
          position={[-w / 2 + 0.13 + index * 0.095, titleY, 0.003]}
        />
      ))}
      {parts.sidebar ? (
        <mesh
          geometry={parts.sidebar}
          material={materials.titleBar}
          position={[-w / 2 + (w * 0.28) / 2, -tb / 2, 0.001]}
        />
      ) : null}
      {parts.selection ? (
        <mesh
          geometry={parts.selection.geometry}
          material={materials.selection}
          position={[parts.selection.x, parts.selection.y, 0.002]}
        />
      ) : null}
      {parts.lines.map((line, index) => (
        <mesh
          key={index}
          geometry={line.geometry}
          material={materials.line}
          position={[line.x, line.y, 0.003]}
        />
      ))}
    </group>
  );
}

interface StackProps {
  palette: ScenePalette;
  /** False under prefers-reduced-motion: the stack holds a static frame. */
  animate: boolean;
}

export function Stack({ palette, animate }: StackProps) {
  const invalidate = useThree((state) => state.invalidate);
  const stackRef = useRef<Group>(null);
  const groups = useRef<(Group | null)[]>([]);
  const pointer = useRef({ x: 0, y: 0 });

  const materials = useMemo(() => buildMaterials(palette), [palette]);
  const control = useMemo(() => new CircleGeometry(0.03, 10), []);
  const parts = useMemo(
    () => windows.map((spec) => buildParts(spec, palette.shadow)),
    [palette.shadow],
  );

  // Each set of GPU objects asks for a frame when it arrives and frees itself when replaced.
  useEffect(() => {
    invalidate();
    return () => disposeAll(materials);
  }, [materials, invalidate]);
  useEffect(() => {
    invalidate();
    return () => parts.forEach(disposeParts);
  }, [parts, invalidate]);
  useEffect(() => () => control.dispose(), [control]);

  useEffect(() => {
    if (!animate) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    };
    const onLeave = () => {
      pointer.current = { x: 0, y: 0 };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [animate]);

  useFrame(({ clock }, delta) => {
    if (!animate) return;
    const dt = Math.min(delta, 0.05);
    const stack = stackRef.current;
    if (stack) {
      const target = parallax(pointer.current);
      stack.rotation.x = damp(stack.rotation.x, target.x, 0.18, dt);
      stack.rotation.y = damp(stack.rotation.y, target.y, 0.18, dt);
    }
    const t = clock.elapsedTime;
    windows.forEach((spec, index) => {
      const group = groups.current[index];
      if (!group) return;
      const [dx, dy] = drift(t, spec);
      group.position.set(spec.position[0] + dx, spec.position[1] + dy, spec.position[2]);
    });
  });

  return (
    <group ref={stackRef}>
      {windows.map((spec, index) => {
        const windowParts = parts[index];
        if (!windowParts) return null;
        return (
          <Window
            key={index}
            spec={spec}
            parts={windowParts}
            materials={materials}
            control={control}
            groupRef={(group) => {
              groups.current[index] = group;
            }}
          />
        );
      })}
    </group>
  );
}
