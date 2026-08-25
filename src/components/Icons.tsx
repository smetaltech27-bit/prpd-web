import type { SVGProps } from 'react'

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M7 22.5 15.8 5l4.1 8.2L16.8 19l-3.1-5.9-4.8 9.4H7Z" fill="currentColor" />
      <path d="m18.8 22.6 5-9.7L27 19l-1.8 3.6h-6.4Z" fill="#22A7E8" />
    </svg>
  )
}
