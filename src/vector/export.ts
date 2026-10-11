export type PngExportOptions = { scale: 1 | 2 | 3; background: 'transparent' | 'white' }

/** Wait for local fonts and image decoding before rasterizing the exact SVG export. */
export async function exportPng(svg: string, options: PngExportOptions): Promise<Blob> {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  const width = Number(root.getAttribute('width'))
  const height = Number(root.getAttribute('height'))
  const outputWidth = Math.ceil(width * options.scale)
  const outputHeight = Math.ceil(height * options.scale)
  if (
    !(outputWidth > 0 && outputHeight > 0) ||
    outputWidth > 16384 ||
    outputHeight > 16384 ||
    outputWidth * outputHeight > 64000000
  ) {
    throw new Error(
      'PNG export is limited to 16,384 pixels per side and 64 megapixels. Choose a smaller artboard or scale.',
    )
  }
  await document.fonts.ready
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not create a PNG canvas.')
    if (options.background === 'white') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, outputWidth, outputHeight)
    }
    context.drawImage(image, 0, 0, outputWidth, outputHeight)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this PNG.'))),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(source)
  }
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    if (named[entity]) return named[entity]
    const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

export function jsxAttribute(name: string): string {
  const aliases: Record<string, string> = {
    class: 'className',
    for: 'htmlFor',
    'xlink:href': 'xlinkHref',
    'xmlns:xlink': 'xmlnsXlink',
    'xml:space': 'xmlSpace',
  }
  if (aliases[name]) return aliases[name]
  if (/^(aria|data)-/.test(name)) return name
  return name.replace(/[-:]([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function jsxStyle(source: string): Record<string, string> {
  const style: Record<string, string> = {}
  for (const declaration of source.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const name = declaration.slice(0, colon).trim()
    const value = declaration.slice(colon + 1).trim()
    if (name && value) style[name.startsWith('--') ? name : jsxAttribute(name)] = value
  }
  return style
}

/** Convert our generated, escaped SVG XML to JSX without treating text as JSX source. */
export function exportReactComponent(svg: string, name = 'Drawing'): string {
  const componentName =
    name
      .replace(/[^a-zA-Z\d_$]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join('') || 'Drawing'
  const safeName = /^[A-Z_$]/.test(componentName) ? componentName : `Drawing${componentName}`
  const allowed = new Set([
    'svg',
    'title',
    'desc',
    'defs',
    'g',
    'path',
    'rect',
    'ellipse',
    'circle',
    'image',
    'text',
    'tspan',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'filter',
    'feColorMatrix',
    'feGaussianBlur',
    'feComponentTransfer',
    'feFuncR',
    'feFuncG',
    'feFuncB',
    'feFuncA',
    'feBlend',
    'feComposite',
    'feMerge',
    'feMergeNode',
  ])
  const xml = svg.replace(/<\?xml[^>]*\?>/g, '').trim()
  const ids = new Set(Array.from(xml.matchAll(/\bid="([^"]*)"/g), (match) => decodeXml(match[1])))
  const tokens = xml.match(/<!--[^]*?-->|<[^>]*>|[^<]+/g) ?? []
  let depth = 0
  const output = tokens
    .map((token) => {
      if (token.startsWith('<!--')) return ''
      if (!token.startsWith('<')) return token.trim() ? `{${JSON.stringify(decodeXml(token))}}` : token
      const match = token.match(/^<(\/)?([a-zA-Z][\w:-]*)([^]*?)(\/?)>$/)
      if (!match || !allowed.has(match[2])) throw new Error('The SVG contains an unsupported element for React export.')
      const [, closing, tag, attributes, selfClosing] = match
      if (closing) {
        depth--
        return `</${tag}>`
      }
      const props = Array.from(attributes.matchAll(/([\w:-]+)="([^\"]*)"/g)).map((attribute) => {
        const key = jsxAttribute(attribute[1])
        if (/^on/i.test(key)) throw new Error('Event attributes cannot be exported to React.')
        const value = decodeXml(attribute[2])
        if (key === 'id') return `id={svgId + ${JSON.stringify(`-${value}`)}}`
        const reference = value.match(/^url\(#(.+)\)$/)
        if (reference && ids.has(reference[1])) {
          return `${key}={${JSON.stringify('url(#')} + svgId + ${JSON.stringify(`-${reference[1]})`)}}`
        }
        if ((key === 'href' || key === 'xlinkHref') && value.startsWith('#') && ids.has(value.slice(1))) {
          return `${key}={${JSON.stringify('#')} + svgId + ${JSON.stringify(`-${value.slice(1)}`)}}`
        }
        return `${key}={${JSON.stringify(key === 'style' ? jsxStyle(value) : value)}}`
      })
      if (depth === 0 && tag === 'svg') props.push('{...props}')
      if (!selfClosing) depth++
      return `<${tag}${props.length ? ` ${props.join(' ')}` : ''}${selfClosing ? ' /' : ''}>`
    })
    .join('')
  return `${
    ids.size ? "import { useId, type SVGProps } from 'react'" : "import type { SVGProps } from 'react'"
  }\n\nexport default function ${safeName}(props: SVGProps<SVGSVGElement>) {\n${
    ids.size ? '  const svgId = useId()\n' : ''
  }  return (\n    ${output.replace(/\n/g, '\n    ')}\n  )\n}\n`
}
