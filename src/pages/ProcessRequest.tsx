import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

type RecordRequest = {
  request_id: string
  request_type: string
  purpose: string
  status: string
  resident_name: string
  purok: string
  submitted_by: string
  created_at: string
  updated_at: string
  assigned_secretary_email?: string | null
}

const statusOptions = ['In Progress', 'Ready To Pickup', 'Claimed', 'Declined']

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function getRequestIdFromSearchParams(params: URLSearchParams) {
  const requestId = (params.get('request_id') ?? '').trim().toUpperCase()
  if (requestId.startsWith('RO-')) {
    return `RQ-${requestId.slice(3)}`
  }
  return requestId
}

function getCertificateTitle(requestType: string) {
  if (requestType === 'Certificate of Indigency') {
    return 'CERTIFICATE OF INDIGENCY'
  }
  if (requestType === 'Certificate of Residency') {
    return 'CERTIFICATE OF RESIDENCY'
  }
  if (requestType === 'Business Clearance') {
    return 'BUSINESS CLEARANCE'
  }
  return 'BARANGAY CLEARANCE'
}

const BARANGAY_NAME = 'Barangay Baloling'
const MUNICIPALITY_NAME = 'Mapandan, Pangasinan, Philippines'
const BARANGAY_HEAD_NAME = 'John B. Doe'

function normalizeStatus(value: string) {
  if (value === 'On Process') {
    return 'In Progress'
  }
  if (value === 'Ready to Pickup') {
    return 'Ready To Pickup'
  }
  return value
}


function getCertificateBodyLines(activeRequest: RecordRequest, secretaryName: string) {
  const issuedOn = formatDate(new Date().toISOString())
  const residentLine = `${activeRequest.resident_name} of ${activeRequest.purok}`

  if (activeRequest.request_type === 'Certificate of Indigency') {
    return [
      `This is to certify that ${residentLine} is a bona fide resident of ${BARANGAY_NAME}.`,
      'This office further certifies that the resident belongs to an indigent family based on barangay records and community validation.',
      `This certificate is being issued for ${activeRequest.purpose}.`,
      `Issued this ${issuedOn} upon request of the concerned resident.`,
      '',
      'Prepared by:',
      secretaryName,
      'Barangay Secretary',
      '',
      'Approved by:',
      `${BARANGAY_HEAD_NAME}, Barangay Captain`,
    ]
  }

  if (activeRequest.request_type === 'Certificate of Residency') {
    return [
      `This is to certify that ${residentLine} is a verified resident of ${BARANGAY_NAME}.`,
      'Barangay records confirm that the above-named person currently resides within the jurisdiction of this barangay.',
      `This certificate is issued for ${activeRequest.purpose}.`,
      `Issued this ${issuedOn} for whatever legal purpose it may serve.`,
      '',
      'Prepared by:',
      secretaryName,
      'Barangay Secretary',
      '',
      'Approved by:',
      `${BARANGAY_HEAD_NAME}, Barangay Captain`,
    ]
  }

  if (activeRequest.request_type === 'Business Clearance') {
    return [
      `This certifies that ${residentLine} has requested a business clearance from ${BARANGAY_NAME}.`,
      'Based on available barangay records, there is no known pending objection preventing the issuance of a barangay business clearance.',
      `This clearance is issued for ${activeRequest.purpose}.`,
      `Issued this ${issuedOn} subject to the signature and approval of the Barangay Captain.`,
      '',
      'Prepared by:',
      secretaryName,
      'Barangay Secretary',
      '',
      'Approved by:',
      `${BARANGAY_HEAD_NAME}, Barangay Captain`,
    ]
  }

  return [
    `This is to certify that ${residentLine} is a bona fide resident of ${BARANGAY_NAME}.`,
    'Barangay records show no derogatory record that would prevent the issuance of this barangay clearance.',
    `This clearance is issued for ${activeRequest.purpose}.`,
    `Issued on ${issuedOn}.`,
    '',
    'Prepared by:',
    secretaryName,
    'Barangay Secretary',
    '',
    'Approved by:',
    `${BARANGAY_HEAD_NAME}, Barangay Captain`,
  ]
}

function ProcessRequestPage() {
  const { authenticatedFetch, user } = useAuth()
  const [searchParams] = useSearchParams()
  const [request, setRequest] = useState<RecordRequest | null>(null)
  const [selectedStatus, setSelectedStatus] = useState('Ready To Pickup')
  const [feedback, setFeedback] = useState('')
  const [pdfGenerated, setPdfGenerated] = useState(false)
  const requestId = useMemo(() => getRequestIdFromSearchParams(searchParams), [searchParams])

  useEffect(() => {
    const load = async () => {
      if (!requestId) {
        return
      }
      const response = await authenticatedFetch(`/record-requests/${requestId}`)
      const data = await parseApiJson<RecordRequest | { detail?: string }>(response)
      if (response.ok && data && 'request_id' in data) {
        const normalized = { ...data, status: normalizeStatus(data.status) }
        setRequest(normalized)
        if (normalized.status === 'Declined' || normalized.status === 'Claimed') {
          setSelectedStatus(normalized.status)
        }
      } else {
        setFeedback(data && 'detail' in data && data.detail ? data.detail : 'Unable to load request.')
      }
    }

    void load()
  }, [requestId])

  async function updateStatus(nextStatus: string) {
    if (!request) {
      return
    }

    const response = await authenticatedFetch(`/record-requests/${request.request_id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: nextStatus,
        notes: `Updated during request processing by ${user?.email}`,
        assigned_secretary_email: request.assigned_secretary_email ?? user?.email,
      }),
    })
    const data = await parseApiJson<RecordRequest | { detail?: string }>(response)
    if (response.ok && data && 'request_id' in data) {
      const normalized = { ...data, status: normalizeStatus(data.status) }
      setRequest(normalized)
      setFeedback(`${normalized.request_id} moved to ${normalized.status}.`)
    } else {
      setFeedback(data && 'detail' in data && data.detail ? data.detail : 'Unable to update request status.')
    }
  }

  function buildCertificatePdf(activeRequest: RecordRequest) {
    const doc = new jsPDF()
    const certificateTitle = getCertificateTitle(activeRequest.request_type)
    doc.setFont('times', 'bold')
    doc.setFontSize(16)
    doc.text('Republic of the Philippines', 105, 18, { align: 'center' })
    doc.text(BARANGAY_NAME, 105, 26, { align: 'center' })
    doc.text(MUNICIPALITY_NAME, 105, 34, { align: 'center' })

    doc.setFontSize(20)
    doc.text(certificateTitle, 105, 52, { align: 'center' })

    doc.setFont('times', 'normal')
    doc.setFontSize(12)
    const secretaryName = `${user?.firstName ?? 'Barangay'} ${user?.lastName ?? 'Secretary'}`
    const lines = getCertificateBodyLines(activeRequest, secretaryName)

    let currentY = 74
    lines.forEach((line) => {
      doc.text(line, 24, currentY, { maxWidth: 162, align: 'justify' })
      currentY += line === '' ? 10 : 9
    })

    return { doc, certificateTitle }
  }

  async function printCertificate() {
    if (!request) {
      return
    }

    let activeRequest = request
    if (request.status === 'Pending' || request.status === 'On Process') {
      const response = await authenticatedFetch(`/record-requests/${request.request_id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'In Progress',
          notes: `Moved to In Progress before printing by ${user?.email}`,
          assigned_secretary_email: request.assigned_secretary_email ?? user?.email,
        }),
      })
      const data = await parseApiJson<RecordRequest | { detail?: string }>(response)
      if (!response.ok || !data || !('request_id' in data)) {
        setFeedback(data && 'detail' in data && data.detail ? data.detail : 'Unable to start request processing.')
        return
      }
      activeRequest = { ...data, status: normalizeStatus(data.status) }
      setRequest(activeRequest)
      setSelectedStatus('Ready To Pickup')
    }

    const { doc } = buildCertificatePdf(activeRequest)
    doc.autoPrint()
    const blobUrl = doc.output('bloburl')
    window.open(blobUrl, '_blank', 'noopener,noreferrer')
    setPdfGenerated(true)
    setFeedback(`Certificate opened for printing for ${activeRequest.request_id}. After printing, set it to Ready To Pickup.`)
  }

  return (
    <DashboardLayout currentRoute="process-request" navItems={getWorkspaceNav(user?.role)}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Secretary Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Process Request</h1>
          <p className="mt-2 text-sm text-[#64748b]">
            Generate a pre-templated certificate PDF, print it for signature/stamping, then move the request to pickup.
          </p>

          {request ? (
            <div className="mt-6 space-y-6">
              <div className="rounded-[1.5rem] border border-[#dde6f3] bg-[#fbfdff] p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Resident</p>
                    <p className="mt-2 text-lg font-semibold text-[#111827]">{request.resident_name}</p>
                    <p className="mt-1 text-sm text-[#64748b]">{request.purok}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Request Type</p>
                    <p className="mt-2 text-lg font-semibold text-[#111827]">{request.request_type}</p>
                    <p className="mt-1 text-sm text-[#64748b]">{request.request_id}</p>
                    <p className="mt-1 text-sm text-[#64748b]">Assigned: {request.assigned_secretary_email ?? 'Unassigned'}</p>
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Purpose</p>
                  <p className="mt-2 text-sm leading-6 text-[#334155]">{request.purpose}</p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-[#dde6f3] bg-white p-5">
                <h2 className="text-xl font-semibold text-[#111827]">Processing Workflow</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void printCertificate()}
                    disabled={request.status === 'Declined' || request.status === 'Claimed'}
                    className="rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245de0] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Print Certificate
                  </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <select
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value)}
                    disabled={!pdfGenerated && request.status === 'In Progress'}
                    className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm text-[#111827] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void updateStatus(selectedStatus)}
                    disabled={(request.status === 'In Progress' && !pdfGenerated && selectedStatus === 'Ready To Pickup') || selectedStatus === request.status}
                    className="rounded-2xl border border-[#d8deea] bg-white px-5 py-3 text-sm font-semibold text-[#1d4ed8] transition hover:border-[#2f6df6] hover:bg-[#f5f9ff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Update Status
                  </button>
                </div>
              </div>

              {feedback ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {feedback}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4 text-sm text-[#64748b]">
              {feedback || 'Loading request...'}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[1.75rem] border border-black/6 bg-white px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold text-[#111827]">Process Rules</p>
            <ul className="mt-4 space-y-3 text-sm text-[#475569]">
              <li>Resident requests should start at `Pending` after submission.</li>
              <li>Click `Print Certificate` to open the printable certificate view.</li>
              <li>Printing automatically moves a pending request to `In Progress` before opening the certificate.</li>
              <li>After the certificate is printed and signed, set the request to `Ready To Pickup`.</li>
            </ul>
          </section>

          <section className="rounded-[1.75rem] border border-black/6 bg-white px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold text-[#111827]">Supported Templates</p>
            <div className="mt-4 space-y-2 text-sm text-[#475569]">
              <p>Barangay Clearance</p>
              <p>Certificate of Indigency</p>
              <p>Certificate of Residency</p>
              <p>Business Clearance</p>
            </div>
          </section>
        </aside>
      </div>
    </DashboardLayout>
  )
}

export default ProcessRequestPage
