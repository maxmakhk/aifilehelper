export const getWorkflowBounds = (nodes = []) => {
  if (!nodes || nodes.length === 0) return { minX: 0, minY: 0, maxX: 600, maxY: 400 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((n) => {
    const x = Number(n?.position?.x ?? 0);
    const y = Number(n?.position?.y ?? 0);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 600, maxY: 400 };
  }
  return { minX, minY, maxX, maxY };
};
