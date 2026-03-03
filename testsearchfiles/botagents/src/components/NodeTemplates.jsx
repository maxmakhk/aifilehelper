import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import '../App.css';

const TEMPLATES = [
  {
    id: 'MetalSensor',
    type: 'Sensor',
    name: 'MetalSensor',
    cssClass: 'node-sensor',
    size: [2, 1],
    css: `:self { background: url(src/assets/component_2_1_a.png); border: 0px solid rgba(255, 255, 255, 0.06); background-size: 100% 100%; } :self .node-title { font-weight:700; color:#ffffff; font-size:14px; line-height:1.1; text-shadow: 0 -1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.65); transform: translateY(1px); } :self .node-type { font-size:12px; color: rgba(255,255,255,0.95); text-shadow: 0 -0.6px 0 rgba(255,255,255,0.22), 0 1px 3px rgba(0,0,0,0.5); }`,
    config: { resolution: '1920x1080', framerate: 30, protocol: 'rtsp' }
  },
  {
    id: 'CopperInference',
    type: 'Processor',
    name: 'CopperInference',
    cssClass: 'node-processor',
    size: [2, 2],
    css: `:self { background: url(src/assets/copper_square_b.jpg); border: 0px solid rgba(255, 255, 255, 0.06); background-size: 100% 100%; } :self .node-title { font-weight:700; color:#ffffff; font-size:14px; line-height:1.1; text-shadow: 0 -1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.65); transform: translateY(1px); } :self .node-type { font-size:12px; color: rgba(255,255,255,0.95); text-shadow: 0 -0.6px 0 rgba(255,255,255,0.22), 0 1px 3px rgba(0,0,0,0.5); }`,
    config: { model: 'yolo-v8', batch: 1, device: 'cpu' }
  },
  {
    id: 'MetalDisplay',
    type: 'Display',
    name: 'MetalDisplay',
    cssClass: 'node-display',
    size: [3, 1],
    css: `:self { background: url(src/assets/3_1_b.jpg); border: 0px solid rgba(255, 255, 255, 0.06); background-size: 100% 100%; } :self .node-title { font-weight:700; color:#ffffff; font-size:14px; line-height:1.1; text-shadow: 0 -1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.65); transform: translateY(1px); } :self .node-type { font-size:12px; color: rgba(255,255,255,0.95); text-shadow: 0 -0.6px 0 rgba(255,255,255,0.22), 0 1px 3px rgba(0,0,0,0.5); }`,
    config: { layout: 'grid', refresh: 2000 }
  },
  {
    id: 'C1',
    type: 'Operator',
    name: 'C1',
    cssClass: 'node-operator',
    size: [1, 1],
    css: `:self { background: url(src/assets/copper_square_a.jpg); border: 0px solid rgba(255, 255, 255, 0.06); background-size: 100% 100%; } :self .node-title { font-weight:700; color:#ffffff; font-size:14px; line-height:1.1; text-shadow: 0 -1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.65); transform: translateY(1px); } :self .node-type { font-size:12px; color: rgba(255,255,255,0.95); text-shadow: 0 -0.6px 0 rgba(255,255,255,0.22), 0 1px 3px rgba(0,0,0,0.5); }`,
    config: { role: 'observer', alerts: true }
  },
  {
    id: 'Wooden1',
    type: 'Operator',
    name: 'Wooden1',
    cssClass: 'node-operator',
    size: [2, 1],
    css: `:self { background: url(src/assets/wooden_2_1.jpg); border: 0px solid rgba(255, 255, 255, 0.06); background-size: 100% 100%; } :self .node-title { font-weight:700; color:#ffffff; font-size:14px; line-height:1.1; text-shadow: 0 -1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.65); transform: translateY(1px); } :self .node-type { font-size:12px; color: rgba(255,255,255,0.95); text-shadow: 0 -0.6px 0 rgba(255,255,255,0.22), 0 1px 3px rgba(0,0,0,0.5); }`,
    config: { role: 'observer', alerts: true }
  },
  {
    id: 'Wooden2',
    type: 'Operator',
    name: 'Wooden2',
    cssClass: 'node-operator',
    size: [3, 1],
    css: `:self { background: url(src/assets/wooden_3_1.jpg); border: 0px solid rgba(255, 255, 255, 0.06); background-size: 100% 100%; } :self .node-title { font-weight:700; color:#ffffff; font-size:14px; line-height:1.1; text-shadow: 0 -1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.65); transform: translateY(1px); } :self .node-type { font-size:12px; color: rgba(255,255,255,0.95); text-shadow: 0 -0.6px 0 rgba(255,255,255,0.22), 0 1px 3px rgba(0,0,0,0.5); }`,
    config: { role: 'observer', alerts: true }
  },
  {
    id: 'Grass1',
    type: 'Operator',
    name: 'Grass1',
    cssClass: 'node-operator',
    size: [2, 1],
    css: `:self { background: url(src/assets/grass_2_1.png); border: 0px solid rgba(255, 255, 255, 0.06); background-size: 100% 100%; } :self .node-title { font-weight:700; color:#333; font-size:14px; line-height:1.1; text-shadow: 0 -1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.65); transform: translateY(1px); } :self .node-type { font-size:12px; color: rgba(255,255,255,0.95); text-shadow: 0 -0.6px 0 rgba(255,255,255,0.22), 0 1px 3px rgba(0,0,0,0.5); color:#333 }`,
    config: { role: 'observer', alerts: true }
  }
];

export default function NodeTemplates({ onBack }) {
  const [templates, setTemplates] = useState(TEMPLATES);

  const copy = async (tpl) => {
    const text = JSON.stringify(tpl, null, 2);
    try { await navigator.clipboard.writeText(text); console.log('Copied', tpl.id); }
    catch (e) { console.log('Copy failed', e, text); }
  };

  const handleCssChange = (id, value) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, css: value } : t));
  };

  const styleContent = useMemo(() => {
    const tplCss = templates.map(t => {
      const trimmed = (t.css || '').trim();
      if (!trimmed) return '';
      let cssText = trimmed.replace(/:self/g, `.node-preview[data-tpl="${t.id}"]`);
      if (!trimmed.includes(':self') && trimmed.includes('.node-preview')) {
        cssText = cssText.replace(/\.node-preview/g, `.node-preview[data-tpl="${t.id}"]`);
      }
      return cssText;
    }).join('\n');

    const edgeCss = `
    .edge-cable-3d {
      position: relative;
      background-color: transparent;
      border-radius: 8px;
      overflow: visible;
      height: 40px;
      width: 320px;
      margin: 6px 0;
    }
    .edge-cable-3d::before {
      content: '';
      position: absolute;
      left: 8%;
      right: 8%;
      top: calc(50% - 2.5px);
      height: 5px;
      border-radius: 3px;
      background: linear-gradient( to right, #2f2f2f 0%, #8fa0aa 50%, #2f2f2f 100% );
      box-shadow: 0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
      pointer-events: none;
    }
    .edge-cable-3d::after {
      content: '';
      position: absolute;
      left: 9%;
      right: 9%;
      top: calc(50% - 1px);
      height: 2px;
      border-radius: 2px;
      background: linear-gradient(to right, rgba(255,255,255,0.18), rgba(255,255,255,0.02));
      filter: blur(0.6px);
      pointer-events: none;
    }
    `;

    return tplCss + '\n' + edgeCss;
  }, [templates]);

  return (
    <div className="node-templates" style={{ padding: 12 }}>
      <style>{styleContent}</style>
      <h3>Node Templates</h3>
      <div style={{ margin: '8px 0' }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Edge Preview</div>
        {/* container for previews + svg connector */}
        <EdgePreview />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 12 }}>
        {templates.map(t => {
          const UNIT = 64;
          const [wUnits, hUnits] = (t.size && Array.isArray(t.size)) ? t.size : [2, 1];
          const widthPx = Math.max(32, (wUnits || 1) * UNIT);
          const heightPx = Math.max(24, (hUnits || 1) * UNIT);
          return (
            <div className="nodeitem" key={t.id} id={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, width: 760 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 240 }}>
                <div className={`node-preview ${t.cssClass}`} data-tpl={t.id} style={{ width: widthPx, height: heightPx }}>
                  <div className="node-title">{t.name}</div>
                  <div className="node-type">{t.type}</div>
                </div>
                
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start', textAlign: 'left', width: 120 }}>
                  <strong style={{ display: 'block' }}>{t.id}</strong>
                  <div style={{ display: 'block' }}>{t.type}</div>
                </div>
              <textarea
                value={t.css}
                onChange={e => handleCssChange(t.id, e.target.value)}
                style={{ flex: 1, minWidth: 320, height: Math.max(64, heightPx), resize: 'vertical' }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function EdgePreview() {
  const containerRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    function update() {
      if (!containerRef.current || !leftRef.current || !rightRef.current) return;
      const c = containerRef.current.getBoundingClientRect();
      const l = leftRef.current.getBoundingClientRect();
      const r = rightRef.current.getBoundingClientRect();
      const x1 = l.left - c.left + l.width / 2;
      const y1 = l.top - c.top + l.height / 2;
      const x2 = r.left - c.left + r.width / 2;
      const y2 = r.top - c.top + r.height / 2;
      setPos({ x1, y1, x2, y2, w: c.width, h: c.height });
    }
    update();
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => { window.removeEventListener('resize', update); ro.disconnect(); };
  }, []);

  const pathD = pos ? (() => {
    const { x1, y1, x2, y2 } = pos;
    const dx = x2 - x1;
    const cx1 = x1 + Math.max(24, dx * 0.25);
    const cx2 = x2 - Math.max(24, dx * 0.25);
    return `M ${x1},${y1} C ${cx1},${y1} ${cx2},${y2} ${x2},${y2}`;
  })() : '';

  const fallbackBar = pos ? (() => {
    const { x1, y1, x2, y2 } = pos;
    const dx = x2 - x1; const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const barStyle = {
      position: 'absolute',
      left: x1,
      top: y1 - 3,
      width: length,
      height: 6,
      transform: `translateY(-50%) rotate(${angle}deg)`,
      transformOrigin: '0 50%',
      borderRadius: 4,
      background: 'linear-gradient(to right, #2f2f2f 0%, #8fa0aa 50%, #2f2f2f 100%)',
      boxShadow: '0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
      pointerEvents: 'none'
    };
    return <div style={barStyle} />;
  })() : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div ref={leftRef} className={`node-preview node-operator`} data-tpl="left" style={{ width: 64, height: 48 }}>
        <div className="node-title">A</div>
        <div className="node-type">Operator</div>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }} aria-hidden>
        {/* svg overlay draws between centers of left/right */}
        <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <linearGradient id="edgeGradPreview" x1="0" x2="1">
              <stop offset="0%" stopColor="#2f2f2f" />
              <stop offset="50%" stopColor="#8fa0aa" />
              <stop offset="100%" stopColor="#2f2f2f" />
            </linearGradient>
            <filter id="edgeShadowPreview" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>
          {pos && (
            <>
              <path d={pathD} fill="none" stroke="url(#edgeGradPreview)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" filter="url(#edgeShadowPreview)" />
              <path className="react-flow__edge-interaction" d={pathD} fill="none" stroke="transparent" strokeWidth={20} />
            </>
          )}
          {fallbackBar}
        </svg>
      </div>

      <div ref={rightRef} className={`node-preview node-processor`} data-tpl="right" style={{ width: 64, height: 48 }}>
        <div className="node-title">B</div>
        <div className="node-type">Processor</div>
      </div>
    </div>
  );
}
