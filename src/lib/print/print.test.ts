import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { printImage } from './print'

describe('printImage', () => {
  afterEach(() => {
    document.querySelectorAll('.direct-print-image-host, style[data-direct-print-image]').forEach((node) => node.remove())
    vi.restoreAllMocks()
  })

  it('prints from the current page with one bounded A4 host and cleans it after printing', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const open = vi.spyOn(window, 'open')
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    printImage('blob:drawing', { orientation: 'landscape', marginMm: 0, fit: 'contain', label: 'Drawing', itemFg: 'C12036A' })

    const host = document.querySelector('.direct-print-image-host')
    const image = host?.querySelector('img')
    const style = document.querySelector('style[data-direct-print-image]')
    expect(host).toBeInTheDocument()
    expect(style).toHaveTextContent('@page directDocumentPage { size: A4 landscape; margin: 0; }')
    expect(style).toHaveTextContent('width: 297mm !important')
    expect(style).toHaveTextContent('height: 210mm !important')
    expect(style).toHaveTextContent('page: directDocumentPage')
    expect(style).toHaveTextContent('position: static !important')
    expect(style).toHaveTextContent('overflow: hidden !important')

    fireEvent.load(image as HTMLImageElement)
    expect(print).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()

    fireEvent(window, new Event('afterprint'))
    expect(document.querySelector('.direct-print-image-host')).not.toBeInTheDocument()
    expect(document.querySelector('style[data-direct-print-image]')).not.toBeInTheDocument()
  })
})
