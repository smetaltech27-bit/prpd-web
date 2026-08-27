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
  const previousTitle = document.title
  const host = document.createElement('div')
  const style = document.createElement('style')
  const image = document.createElement('img')
  host.className = 'direct-print-image-host'
  style.dataset.directPrintImage = 'true'
  style.textContent = `
    .direct-print-image-host {
      position: fixed;
      inset: 0;
      z-index: -1;
      width: 1px;
      height: 1px;
      overflow: hidden;
      visibility: hidden;
      pointer-events: none;
    }
    @page { size: A4 ${orientation}; margin: ${marginMm}mm; }
    @media print {
      html, body {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
      body > *:not(.direct-print-image-host) { display: none !important; }
      body > .direct-print-image-host {
        position: fixed !important;
        inset: 0 !important;
        z-index: auto !important;
        display: grid !important;
        place-items: center !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        visibility: visible !important;
      }
      .direct-print-image-host > img {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        object-fit: ${fit} !important;
      }
    }
  `
  image.alt = title
  image.src = imageUrl
  host.append(image)
  document.head.append(style)
  document.body.append(host)
  document.title = title

  let printed = false
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup)
    host.remove()
    style.remove()
    document.title = previousTitle
  }
  const printOnce = () => {
    if (printed) return
    printed = true
    window.addEventListener('afterprint', cleanup, { once: true })
    window.print()
  }
  if (image.complete) window.requestAnimationFrame(printOnce)
  else {
    image.addEventListener('load', () => window.requestAnimationFrame(printOnce), { once: true })
    image.addEventListener('error', () => window.requestAnimationFrame(printOnce), { once: true })
    window.setTimeout(printOnce, 1500)
  }
}
