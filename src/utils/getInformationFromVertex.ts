export const getInformationFromVertexs = (vertexs: { x: number; y: number }[]) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const vertex of vertexs) {
    if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) continue
    minX = Math.min(minX, vertex.x)
    minY = Math.min(minY, vertex.y)
    maxX = Math.max(maxX, vertex.x)
    maxY = Math.max(maxY, vertex.y)
  }
  if (minX === Infinity) return { width: 0, height: 0, center: { x: 0, y: 0 } }
  return {
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (maxX + minX) / 2, y: (maxY + minY) / 2 },
  }
}
