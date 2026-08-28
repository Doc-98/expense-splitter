import { useNavigate } from 'react-router-dom'
import ScanSettingsSection from '../components/ScanSettingsSection'

// A thin page wrapper around ScanSettingsSection — the actual UI/logic
// lives there now, shared with its collapsed form on the Settings page.
// This route stays around for the existing deep links straight here (see
// ScanReceiptButton.jsx's "change" link and CategorizeBills.jsx).
export default function ScanSettings() {
  const navigate = useNavigate()

  // Goes back to whatever page was actually open before this one — a bill
  // you were mid-scan on, the group page, wherever — rather than always
  // landing on the groups list regardless of where you came from.
  function goBack() {
    navigate(-1)
  }

  return (
    <div className="page">
      <header className="page-header">
        <button type="button" className="btn-link" onClick={goBack}>
          ← Back
        </button>
        <h1>Scan settings</h1>
      </header>

      <ScanSettingsSection />

      <button type="button" className="btn-primary confirm-btn" onClick={goBack}>
        Confirm
      </button>
    </div>
  )
}
