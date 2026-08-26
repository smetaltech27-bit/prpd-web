import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { equipmentItems, rawMaterials } from './mockData'
import { AppShell } from '../components/AppShell'
import { PrBuilder } from '../components/PrBuilder'
import { DocumentSearch } from '../components/DocumentSearch'
import { WorkOrderPage } from '../pages/WorkOrderPage'
import { HistoryPage } from '../pages/HistoryPage'
import { SettingsPage } from '../pages/SettingsPage'
import { SettingsPasswordSetupPage } from '../pages/SettingsPasswordSetupPage'
import { ensureAppSession } from '../services/appSession'
import { listFactorySupplies, listRawMaterials } from '../services/prpdRepository'
import { initialSettingsAuthFlow } from '../services/settingsInvite'
import { isSupabaseConfigured } from '../lib/supabase'

export function App() {
  const [rawCatalog, setRawCatalog] = useState(isSupabaseConfigured ? [] : rawMaterials)
  const [equipmentCatalog, setEquipmentCatalog] = useState(isSupabaseConfigured ? [] : equipmentItems)

  useEffect(() => {
    if (initialSettingsAuthFlow) return
    void ensureAppSession().then(async (state) => {
      if (state !== 'ready') return
      try {
        const [raw, equipment] = await Promise.all([listRawMaterials(), listFactorySupplies()])
        setRawCatalog(raw)
        setEquipmentCatalog(equipment)
      } catch {
        setRawCatalog([])
        setEquipmentCatalog([])
      }
    })
  }, [])

  if (initialSettingsAuthFlow) return <SettingsPasswordSetupPage />

  return <AppShell><Routes>
    <Route path="/" element={<Navigate to="/raw-material-pr" replace />} />
    <Route path="/raw-material-pr" element={<PrBuilder category="Raw Material" items={rawCatalog} />} />
    <Route path="/equipment-pr" element={<PrBuilder category="Equipment" items={equipmentCatalog} />} />
    <Route path="/work-order" element={<WorkOrderPage />} />
    <Route path="/print/drawing" element={<DocumentSearch kind="drawing" />} />
    <Route path="/print/inprocess" element={<DocumentSearch kind="inprocess" />} />
    <Route path="/print/qc" element={<DocumentSearch kind="qc" />} />
    <Route path="/pr-history" element={<HistoryPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/raw-material-pr" replace />} />
  </Routes></AppShell>
}
