export function getRandLightColor() {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 20);
  const l = 85 + Math.floor(Math.random() * 8);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function applyGroupColorToNodes(nodes, color) {
  if (!Array.isArray(nodes)) return nodes;
  return nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      backgroundColor: color,
      textColor: '#0f172a',
    },
  }));
}
