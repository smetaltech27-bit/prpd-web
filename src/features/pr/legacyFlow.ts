import type { MaterialItem } from '../../types/domain'
import type { PrLineItem } from './types'

export function calculateOrderQuantity(productionQuantity: number, usage: number): number {
  const safeProductionQuantity = Number(productionQuantity)
  const safeUsage = Number(usage)
  if (!Number.isFinite(safeProductionQuantity) || safeProductionQuantity <= 0) return 0
  return Math.ceil(safeProductionQuantity / (Number.isFinite(safeUsage) && safeUsage > 0 ? safeUsage : 1))
}

export function createRawMaterialLines(
  matches: readonly MaterialItem[],
  productionQuantity: number,
  dueDate: string,
  createLineId: (item: MaterialItem, index: number) => string,
): PrLineItem[] {
  return matches.map((item, index) => ({
    id: item.id,
    lineId: createLineId(item, index),
    itemFg: item.itemFg,
    namePart: item.partName,
    spec: item.spec,
    drawingNo: item.drawingNo,
    codeOrder: item.orderCode,
    vendor: item.vendor,
    materialType: item.materialType,
    dimension: item.dimension,
    unitPrice: item.unitPrice,
    usage: item.usage,
    comment: item.comment,
    fgQuantity: productionQuantity,
    quantity: calculateOrderQuantity(productionQuantity, item.usage),
    dueDate,
  }))
}
