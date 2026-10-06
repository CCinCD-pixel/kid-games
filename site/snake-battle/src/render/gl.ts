/**
 * WebGL2 instanced-sprite renderer (spec §8.6). One streaming instance VBO (one bufferSubData per
 * frame), a unit quad, drawArraysInstanced per layer (≈8 draw calls/frame). The floor is a fullscreen
 * triangle whose fragment shader draws the venue's three-tone ground, fine grain, hex grid, the glowing
 * fence, the darkened outside with stars, and the vignette — procedural, so it stays crisp at any zoom
 * and costs no texture memory. Context loss → `onLost` (the match pauses); restore → rebuild.
 */
import type { Atlas } from './art';

export const enum Blend { Normal = 0, Add = 1 }
const FLOATS = 10; // x y sx sy rot u0 v0 u1 v1 color(packed u8x4)
const STRIDE = FLOATS * 4;

const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aPos;
layout(location=2) in vec2 aSize;
layout(location=3) in float aRot;
layout(location=4) in vec4 aUV;
layout(location=5) in vec4 aColor;
uniform vec2 uCam; uniform float uZoom; uniform vec2 uView;
out vec2 vUV; out vec4 vColor;
void main(){
  float c = cos(aRot), s = sin(aRot);
  vec2 q = aCorner * aSize;
  vec2 w = aPos + vec2(q.x*c - q.y*s, q.x*s + q.y*c);
  vec2 css = (w - uCam) * uZoom;
  gl_Position = vec4(css.x / (uView.x*0.5), -css.y / (uView.y*0.5), 0.0, 1.0);
  vUV = mix(aUV.xy, aUV.zw, aCorner*0.5+0.5);
  vColor = vec4(aColor.rgb * aColor.a, aColor.a);
}`;
const SPRITE_FS = `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vColor; uniform sampler2D uTex; out vec4 o;
void main(){ o = texture(uTex, vUV) * vColor; }`;

const FLOOR_VS = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 vNdc;
void main(){ vNdc = P[gl_VertexID]; gl_Position = vec4(P[gl_VertexID], 0., 1.); }`;
const FLOOR_FS = `#version 300 es
precision highp float;
in vec2 vNdc; out vec4 o;
uniform vec2 uCam; uniform float uZoom; uniform vec2 uView; uniform float uR; uniform float uTime;
uniform vec3 uC0, uC1, uC2, uAccent; uniform int uKind; uniform float uQ;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= .5; } return s; }
float hexLine(vec2 p, float size){
  p /= size; vec2 r = vec2(1., 1.7320508); vec2 h = r*.5;
  vec2 a = mod(p, r) - h, b = mod(p - h, r) - h; vec2 g = dot(a,a) < dot(b,b) ? a : b;
  vec2 q = abs(g); float d = max(q.x*.866025 + q.y*.5, q.y);
  return smoothstep(.47, .5, d);
}
// ---- far parallax layer (§6.8): stars + one sky object per floor, in screen-px "far space" (0.15× parallax)
vec4 over(vec4 d, vec3 c, float a){ return vec4(d.a > 0. ? mix(d.rgb, c, a) : c, d.a + a*(1.-d.a)); }
vec4 farLayer(vec2 q){
  vec4 o = vec4(0.);
  vec2 sp = floor(q/23.); float st = h21(sp + 7.);
  if (st > .982) { vec2 c = (sp + .5 + (vec2(h21(sp+1.3), h21(sp+2.7)) - .5)*.6)*23.; float a = smoothstep(2.6, .5, length(q - c)) * (.7 + .3*sin(uTime*1.1 + st*50.)); o = vec4(vec3(.93,.95,1.), a); }
  if (uKind == 0) {            // Earth rising: blue-white globe, clouds, lit from the top-left, thin atmosphere
    vec2 d = q - vec2(-150., -250.); float r = length(d), R = 220.;
    o = over(o, vec3(.55,.78,1.), (smoothstep(R + 34., R, r) - smoothstep(R, R - 4., r)) * .55);
    if (r < R) { vec2 u = d / R;
      float land = smoothstep(.55, .62, fbm(u*2.1 + 11.)), cl = fbm(u*3.2 + vec2(uTime*.004, 0.));
      vec3 c = mix(vec3(.13,.36,.78), vec3(.3,.52,.28), land*.8); c = mix(c, vec3(.95,.97,1.), smoothstep(.5, .75, cl));
      float lit = clamp(dot(vec3(u, sqrt(max(0., 1.-dot(u,u)))), normalize(vec3(-.6,-.5,.62))), 0., 1.);
      o = over(o, c * (.16 + .95*lit), smoothstep(R, R - 2., r)); }
  } else if (uKind == 1) {     // Phobos + a pale pink sky glow
    o = over(o, vec3(1., .62, .6), .2*smoothstep(760., 0., length(q - vec2(-220., -380.))));
    vec2 d = q - vec2(230., -210.); float a = atan(d.y, d.x), R = 72. * (1. + .14*vnoise(vec2(a*2.2, 3.)) - .07);
    float r = length(d * vec2(1., 1.25));
    if (r < R) { vec2 u = d / R; float cr = smoothstep(.55, .75, fbm(u*3.5 + 4.));
      float lit = clamp(.55 - .45*u.x - .45*u.y, 0., 1.);
      o = over(o, mix(vec3(.55,.47,.4), vec3(.3,.25,.22), cr) * (.35 + .8*lit), smoothstep(R, R - 2., r)); }
  } else if (uKind == 2) {     // Jupiter's Great Red Spot (turns slowly) inside faint cloud bands
    vec2 d = q - vec2(150., -230.); vec2 e = d / vec2(380., 230.); float re = length(e);
    if (re < 1.) o = over(o, mix(vec3(.85,.66,.48), vec3(.62,.42,.3), .5 + .5*sin(d.y/26. + fbm(d/160.)*3.)), smoothstep(1., .9, re) * .75);
    vec2 g = d / vec2(200., 118.); float rg = length(g);
    if (rg < 1.) { float a = atan(g.y, g.x) - uTime*.03 + rg*4.;
      vec3 c = mix(vec3(.93,.72,.55), vec3(.78,.3,.2), smoothstep(.15, .85, .5 + .5*sin(a*2. + rg*9.)));
      o = over(o, mix(c, vec3(.95,.82,.68), smoothstep(.75, 1., rg)), smoothstep(1., .92, rg)); }
  } else if (uKind == 4) {     // Saturn's ring arc across the sky
    vec2 d = q - vec2(0., 560.); float t = -.18; d = vec2(d.x*cos(t) - d.y*sin(t), d.x*sin(t) + d.y*cos(t));
    float rho = length(d / vec2(1150., 330.));
    if (rho > .78 && rho < 1.02 && d.y < 0.) { float band = .55 + .25*sin(rho*140.) + .2*sin(rho*37.);
      float gap = smoothstep(.006, .0, abs(rho - .905));
      o = over(o, mix(vec3(.93,.84,.64), vec3(.7,.58,.42), band) * (1. - gap*.85), smoothstep(.78, .8, rho) * smoothstep(1.02, 1., rho) * .9); }
  } else if (uKind == 3) {     // gravitational-lensing ring (one turn per 120 s)
    vec2 d = q - vec2(0., -60.); float r = length(d), a = atan(d.y, d.x);
    float ring = exp(-pow((r - 260.)/9., 2.)) * (.55 + .45*cos(a - uTime*6.2831853/120.)) + .35*exp(-pow((r - 214.)/4., 2.));
    o = over(o, vec3(0.,0.,0.), smoothstep(212., 200., r) * .55);
    o = over(o, vec3(1., .86, .62), clamp(ring, 0., 1.));
  }
  return o;
}
void main(){
  vec2 css = vec2(vNdc.x, -vNdc.y) * uView * .5;
  vec2 p = css / uZoom + uCam;
  float r = length(p);
  float t;
  if (uKind == 1) {          // mars: dunes
    t = .55*fbm(p/650.) + .45*(.5+.5*sin((p.x*.8+p.y*.6)/70. + fbm(p/260.)*5.));
  } else if (uKind == 2) {   // jupiter: cloud bands
    t = fbm(vec2(p.x/1500., p.y/190. + fbm(p/520.)*1.4));
  } else if (uKind == 3) {   // black hole: accretion spiral
    float a = atan(p.y, p.x);
    t = .5*fbm(p/700.) + .5*(.5+.5*sin(a*2. + log(r+60.)*5. - uTime*.05));
  } else if (uKind == 4) {   // saturn: ice grain
    t = .6*fbm(p/900.) + .4*fbm(p/110.);
  } else {                   // moon: mottled regolith
    t = .7*fbm(p/800.) + .3*fbm(p/120.);
  }
  vec3 col = mix(uC0, uC1, smoothstep(.32, .58, t));
  col = mix(col, uC2, smoothstep(.6, .86, t) * .85);
  // low-frequency brightness modulation (±6 %) + paper grain (±5 %)
  col *= .94 + .12*vnoise(p/3000.);
  col *= .95 + .1*vnoise(p/4.5);
  if (uKind == 4) col += vec3(.85,.92,1.) * step(.993, h21(floor(p/6.))) * .12;   // sparkling ice grains
  // faint hex grid (α .06) for motion reference
  if (uQ > .5) col = mix(col, col*1.35 + .03, hexLine(p, 46.) * .06 * smoothstep(.0, .15, uZoom));
  // fence: glowing energy wall (24 wu) + darkened outside (−60 %) with a star field
  float edge = r - uR;
  vec4 far = vec4(0.);
  if (uQ > .5) far = farLayer(css + uCam*.19);          // 0.15× parallax (Q0: no far layer)
  if (edge > 0.) {
    // outside the fence: the floor darkened 60 % fades into open space with the far scene at α 1
    vec3 out_ = mix(col * .4, vec3(.02,.025,.06), smoothstep(40., 280., edge));
    if (uQ > .5) out_ = mix(out_, far.rgb, far.a);
    else {
      vec2 sp = floor(p/26.); float st = h21(sp);
      out_ += vec3(.9, .9, 1.) * step(.985, st) * (.6 + .4*sin(uTime*1.3 + st*40.)) * smoothstep(9., 2., length(fract(p/26.)*26. - 13.));
    }
    col = mix(col, out_, smoothstep(0., 40., edge));
  } else col = mix(col, far.rgb, far.a * .15);         // inside: the sky shows faintly, like through thin mist
  float band = exp(-pow(edge/12., 2.));
  col += uAccent * band * .85 + vec3(1.) * exp(-pow(edge/4., 2.)) * .25;
  col += uAccent * exp(-max(edge, -edge*.5)/90.) * .08;
  // vignette (corners 25 %)
  vec2 n = vNdc;
  col *= 1. - .25*smoothstep(.55, 1.45, length(n));
  o = vec4(col, 1.);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

export interface FloorParams { R: number; c: [number, number, number][]; accent: [number, number, number]; kind: number }

export class Renderer {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  private sprite!: WebGLProgram; private floor!: WebGLProgram;
  private vao!: WebGLVertexArrayObject; private ibuf!: WebGLBuffer; private tex!: WebGLTexture;
  private data: Float32Array; private u32: Uint32Array; private cap: number;
  n = 0;
  private layers: { blend: Blend; start: number; count: number }[] = [];
  private cur: { blend: Blend; start: number; count: number } | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private fu: Record<string, WebGLUniformLocation | null> = {};
  private atlasVersion = -1;
  lost = false;
  floorParams: FloorParams | null = null;
  quality = 2;
  /** CSS px size of the canvas */
  w = 1; h = 1; dpr = 1.5;
  onLost: (() => void) | null = null; onRestored: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, private atlas: Atlas, cap = 24000) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('webgl2 unavailable');
    this.gl = gl;
    this.cap = cap;
    this.data = new Float32Array(cap * FLOATS);
    this.u32 = new Uint32Array(this.data.buffer);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.onLost?.(); });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); this.atlasVersion = -1; this.onRestored?.(); });
    this.init();
  }

  setAtlas(a: Atlas) { this.atlas = a; this.atlasVersion = -1; }

  private init() {
    const gl = this.gl;
    this.sprite = compile(gl, SPRITE_VS, SPRITE_FS);
    this.floor = compile(gl, FLOOR_VS, FLOOR_FS);
    for (const k of ['uCam', 'uZoom', 'uView', 'uTex']) this.u[k] = gl.getUniformLocation(this.sprite, k);
    for (const k of ['uCam', 'uZoom', 'uView', 'uR', 'uTime', 'uC0', 'uC1', 'uC2', 'uAccent', 'uKind', 'uQ']) this.fu[k] = gl.getUniformLocation(this.floor, k);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const attr = (loc: number, size: number, off: number, type: number = gl.FLOAT, norm = false) => {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, STRIDE, off); gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 2, 0); attr(2, 2, 8); attr(3, 1, 16); attr(4, 4, 20); attr(5, 4, 36, gl.UNSIGNED_BYTE, true);
    gl.bindVertexArray(null);
    this.tex = gl.createTexture()!;
  }

  private uploadAtlas() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlasVersion = this.atlas.version;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.w = cssW; this.h = cssH; this.dpr = dpr;
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
  }

  begin() { this.n = 0; this.layers.length = 0; this.cur = null; }
  layer(blend: Blend) {
    if (this.cur && this.cur.count === 0) { this.cur.blend = blend; return; }
    this.cur = { blend, start: this.n, count: 0 }; this.layers.push(this.cur);
  }
  /** push one sprite: centre (x,y) world, half-extents (hx,hy) world, rotation, sprite key, colour RGBA 0..255 */
  push(x: number, y: number, hx: number, hy: number, rot: number, key: string, r = 255, g = 255, b = 255, a = 255) {
    if (this.n >= this.cap) return;
    const uv = this.atlas.get(key);
    const o = this.n * FLOATS, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = hx; d[o + 3] = hy; d[o + 4] = rot;
    d[o + 5] = uv.u0; d[o + 6] = uv.v0; d[o + 7] = uv.u1; d[o + 8] = uv.v1;
    this.u32[o + 9] = ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
    this.n++; if (this.cur) this.cur.count++;
  }

  draw(camX: number, camY: number, zoom: number, time: number) {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return;
    if (this.atlasVersion !== this.atlas.version) this.uploadAtlas();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // floor
    const f = this.floorParams;
    gl.disable(gl.BLEND);
    if (f) {
      gl.useProgram(this.floor);
      gl.uniform2f(this.fu.uCam, camX, camY); gl.uniform1f(this.fu.uZoom, zoom); gl.uniform2f(this.fu.uView, this.w, this.h);
      gl.uniform1f(this.fu.uR, f.R); gl.uniform1f(this.fu.uTime, time); gl.uniform1i(this.fu.uKind, f.kind); gl.uniform1f(this.fu.uQ, this.quality > 0 ? 1 : 0);
      gl.uniform3fv(this.fu.uC0, f.c[0]); gl.uniform3fv(this.fu.uC1, f.c[1]); gl.uniform3fv(this.fu.uC2, f.c[2]); gl.uniform3fv(this.fu.uAccent, f.accent);
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else { gl.clearColor(0.05, 0.06, 0.12, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (!this.n) return;
    gl.useProgram(this.sprite);
    gl.uniform2f(this.u.uCam, camX, camY); gl.uniform1f(this.u.uZoom, zoom); gl.uniform2f(this.u.uView, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(this.u.uTex, 0);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * FLOATS);
    gl.enable(gl.BLEND);
    for (const L of this.layers) {
      if (!L.count) continue;
      if (L.blend === Blend.Add) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // instanced attributes start at the layer's first instance
      const off = L.start * STRIDE;
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, off); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, off + 8);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, off + 16); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, STRIDE, off + 20);
      gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, STRIDE, off + 36);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, L.count);
    }
    gl.bindVertexArray(null);
  }
}
