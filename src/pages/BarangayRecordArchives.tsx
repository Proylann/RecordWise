import ArchivedRecordsPage from './ArchivedRecords'

function BarangayRecordArchivesPage() {
  return (
    <ArchivedRecordsPage
      archiveType="barangay"
      currentRoute="barangay-record-archives"
      title="Barangay Record Archives"
      description="Browse manually uploaded barangay archive files stored by the secretary, including resident records, ordinances, and other official documents."
      emptyState="No manually uploaded barangay archive records yet."
    />
  )
}

export default BarangayRecordArchivesPage
