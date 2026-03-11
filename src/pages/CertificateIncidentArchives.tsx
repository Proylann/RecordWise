import ArchivedRecordsPage from './ArchivedRecords'

function CertificateIncidentArchivesPage() {
  return (
    <ArchivedRecordsPage
      archiveType="workflow"
      currentRoute="certificate-incident-archives"
      title="Certificate and Incident Archives"
      description="Review archived certificate requests and resolved incident reports that were completed through the secretary workflow."
      emptyState="No archived certificates or incidents yet."
    />
  )
}

export default CertificateIncidentArchivesPage
