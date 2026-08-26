export type PrintOrientation = 'portrait' | 'landscape'

export interface PrintOptions {
  title?: string
  orientation?: PrintOrientation
  extraCss?: string
  copyDocumentStyles?: boolean
}

export const PRINT_BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f2742; }
  img { max-width: 100%; }
  @media print {
    .no-print { display: none !important; }
    .print-page { break-after: page; page-break-after: always; }
    .print-page:last-child { break-after: auto; page-break-after: auto; }
  }
`

function openPrintWindow(title: string): Window {
  const printWindow = window.open('', '_blank', 'popup,width=1200,height=800')
  if (!printWindow) {
    throw new Error('Print preview was blocked by the browser')
  }
  printWindow.opener = null
  printWindow.document.title = title
  return printWindow
}

export function printNode(node: HTMLElement, options: PrintOptions = {}): void {
  const {
    title = 'Print',
    orientation = 'landscape',
    extraCss = '',
    copyDocumentStyles = true,
  } = options
  const printWindow = openPrintWindow(title)

  const pendingAssets: Array<HTMLElement> = []
  if (copyDocumentStyles) {
    node.ownerDocument.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style').forEach((source) => {
      if (source instanceof HTMLLinkElement) {
        const link = printWindow.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = source.href
        printWindow.document.head.append(link)
        pendingAssets.push(link)
      } else {
        printWindow.document.head.append(source.cloneNode(true))
      }
    })
  }
  const style = printWindow.document.createElement('style')
  style.textContent = `${PRINT_BASE_CSS}\n@page { size: A4 ${orientation}; margin: 0; }\n${extraCss}`
  printWindow.document.head.append(style)
  const content = node.cloneNode(true) as HTMLElement
  printWindow.document.body.append(content)
  pendingAssets.push(...content.querySelectorAll('img'))

  let printed = false
  const printOnce = () => {
    if (printed) return
    printed = true
    printWindow.focus()
    printWindow.print()
  }
  const incompleteAssets = pendingAssets.filter((asset) =>
    asset instanceof HTMLLinkElement || (asset instanceof HTMLImageElement && !asset.complete),
  )
  if (!incompleteAssets.length) {
    printWindow.requestAnimationFrame(printOnce)
    return
  }
  let remaining = incompleteAssets.length
  const assetReady = () => {
    remaining -= 1
    if (remaining === 0) printWindow.requestAnimationFrame(printOnce)
  }
  incompleteAssets.forEach((asset) => {
    asset.addEventListener('load', assetReady, { once: true })
    asset.addEventListener('error', assetReady, { once: true })
  })
  window.setTimeout(printOnce, 1500)
}

export interface PrintImageOptions extends PrintOptions {
  itemFg?: string
  label?: string
  marginMm?: number
  fit?: 'contain' | 'fill'
}

export function printImage(imageUrl: string, options: PrintImageOptions = {}): void {
  const {
    itemFg = '',
    label = 'Production document',
    title = [label, itemFg].filter(Boolean).join(' · '),
    orientation = 'portrait',
    marginMm = 0,
    fit = 'contain',
  } = options
  const printWindow = openPrintWindow(title)
  const style = printWindow.document.createElement('style')
  style.textContent = `${PRINT_BASE_CSS}
    @page { size: A4 ${orientation}; margin: ${marginMm}mm; }
    html, body { width: 100%; height: 100%; }
    body { display: grid; place-items: center; font-family: Arial, sans-serif; }
    img { width: 100%; height: 100%; object-fit: ${fit}; }
  `
  const image = printWindow.document.createElement('img')
  image.alt = title
  image.src = imageUrl
  image.addEventListener('load', () => printWindow.print(), { once: true })
  printWindow.document.head.append(style)
  printWindow.document.body.append(image)
}
