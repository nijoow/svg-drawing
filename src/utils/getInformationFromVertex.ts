export const getInformationFromVertexs = (vertexs: { x: number; y: number; id: string }[]) => {
  const width = Math.max(...vertexs.map((v) => v.x)) - Math.min(...vertexs.map((v) => v.x))
  const height = Math.max(...vertexs.map((v) => v.y)) - Math.min(...vertexs.map((v) => v.y))
  const center = {
    x: (Math.max(...vertexs.map((v) => v.x)) + Math.min(...vertexs.map((v) => v.x))) / 2,
    y: (Math.max(...vertexs.map((v) => v.y)) + Math.min(...vertexs.map((v) => v.y))) / 2,
  }
  return { width, height, center }
}
