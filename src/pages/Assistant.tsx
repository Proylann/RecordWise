import { useEffect, useRef, useState, type FormEvent } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

type AssistantStatus = {
  dataset_name: string
  total_intents: number
  total_examples: number
  vocabulary_size: number
  trained_at: string | null
  model_ready: boolean
}

type AssistantReply = {
  reply: string
  matched_intent: string
  confidence: number
  route: string | null
  route_label: string | null
  suggestions: string[]
}

type AssistantTrainResponse = {
  message: string
  status: AssistantStatus
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  route?: string | null
  routeLabel?: string | null
  suggestions?: string[]
  confidence?: number
}

const starterPrompts: Record<string, string[]> = {
  resident: [
    'How do I request a barangay clearance?',
    'Where can I check my request status?',
    'How do I report a problem?',
  ],
  secretary: [
    'How do I process pending requests?',
    'Where do I review incident reports?',
    'How do I upload archive records?',
  ],
  admin: [
    'How do I manage residents?',
    'Where can I manage staff accounts?',
    'How do I open system logs?',
  ],
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not trained'
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function AssistantPage() {
  const { authenticatedFetch, user } = useAuth()
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "I can guide you through ChainWise. Ask me what you want to do, and I will point you to the correct page.",
      suggestions: starterPrompts[user?.role ?? 'resident'] ?? starterPrompts.resident,
    },
  ])
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [training, setTraining] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true

    void (async () => {
      const response = await authenticatedFetch('/assistant/status')
      const data = await parseApiJson<AssistantStatus>(response)
      if (!active) {
        return
      }
      if (response.ok && data) {
        setStatus(data)
      }
    })()

    return () => {
      active = false
    }
  }, [authenticatedFetch])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim()
    if (!trimmed || submitting) {
      return
    }

    setSubmitting(true)
    setError('')
    setMessages((current) => [...current, { id: `user-${crypto.randomUUID()}`, role: 'user', content: trimmed }])
    setPrompt('')

    try {
      const response = await authenticatedFetch('/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: trimmed }),
      })
      const data = await parseApiJson<AssistantReply | { detail?: string }>(response)
      if (!response.ok || !data || !('reply' in data)) {
        throw new Error(data && 'detail' in data && data.detail ? data.detail : 'Unable to contact the assistant.')
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: 'assistant',
          content: data.reply,
          route: data.route,
          routeLabel: data.route_label,
          suggestions: data.suggestions,
          confidence: data.confidence,
        },
      ])
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to contact the assistant.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRetrain() {
    setTraining(true)
    setError('')
    try {
      const response = await authenticatedFetch('/assistant/train', { method: 'POST' })
      const data = await parseApiJson<AssistantTrainResponse | { detail?: string }>(response)
      if (!response.ok || !data || !('status' in data)) {
        throw new Error(data && 'detail' in data && data.detail ? data.detail : 'Unable to retrain the assistant.')
      }
      setStatus(data.status)
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: 'assistant',
          content: `${data.message}\nThe model is ready to answer new prompts.`,
        },
      ])
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to retrain the assistant.')
    } finally {
      setTraining(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(prompt)
  }

  const role = user?.role ?? 'resident'
  const suggestionSet = starterPrompts[role] ?? starterPrompts.resident

  return (
    <DashboardLayout currentRoute="assistant" navItems={getWorkspaceNav(user?.role)}>
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-[1.75rem] border border-[#dbe4f0] bg-[linear-gradient(145deg,#0f172a_0%,#1d4ed8_100%)] px-6 py-6 text-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Local AI Assistant</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">ChainWise Guide Bot</h1>
            <p className="mt-3 text-sm text-slate-200">
              A local dataset-trained assistant that helps users navigate the system and understand where to go next.
            </p>
          </section>

          <section className="rounded-[1.75rem] border border-[#dbe4f0] bg-white/95 px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Model Status</p>
                <h2 className="mt-2 text-xl font-semibold text-[#111827]">{status?.dataset_name ?? 'Loading model'}</h2>
              </div>
              {user?.role === 'admin' ? (
                <button
                  type="button"
                  onClick={() => void handleRetrain()}
                  disabled={training}
                  className="rounded-2xl border border-[#cfe0ff] bg-[#f5f9ff] px-4 py-2.5 text-sm font-semibold text-[#1d4ed8] transition hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {training ? 'Training...' : 'Retrain'}
                </button>
              ) : null}
            </div>
            <div className="mt-5 grid gap-3">
              {[
                ['Intents', status?.total_intents ?? 0],
                ['Examples', status?.total_examples ?? 0],
                ['Vocabulary', status?.vocabulary_size ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-[#e1e8f3] bg-[#fbfdff] px-4 py-4">
                  <p className="text-sm text-[#64748b]">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#111827]">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-[#64748b]">Last trained: {formatDateTime(status?.trained_at ?? null)}</p>
          </section>

          <section className="rounded-[1.75rem] border border-[#dbe4f0] bg-white/95 px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <h2 className="text-lg font-semibold text-[#111827]">Suggested Prompts</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestionSet.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void sendMessage(item)}
                  className="rounded-full border border-[#d6e2f5] bg-[#f8fbff] px-4 py-2 text-sm font-medium text-[#1e3a8a] transition hover:border-[#93c5fd] hover:bg-[#eef6ff]"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="rounded-[1.75rem] border border-[#dbe4f0] bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <div className="border-b border-black/6 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Conversation</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#111827]">Ask how to use the system</h2>
            <p className="mt-2 text-sm text-[#64748b]">
              Example: "help", "where do I request a document", or "how do I review incident reports".
            </p>
          </div>

          <div ref={listRef} className="flex h-[560px] flex-col gap-4 overflow-y-auto px-6 py-6">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[88%] rounded-[1.5rem] px-5 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)] ${
                  message.role === 'user'
                    ? 'ml-auto bg-[#1d4ed8] text-white'
                    : 'bg-[#f8fbff] text-[#0f172a] ring-1 ring-[#dbe7fb]'
                }`}
              >
                <p className="whitespace-pre-line text-sm leading-7">{message.content}</p>
                {message.route && message.routeLabel ? (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#1d4ed8]">
                    Suggested page: {message.routeLabel} ({message.route})
                  </p>
                ) : null}
                {typeof message.confidence === 'number' ? (
                  <p className="mt-2 text-xs text-[#64748b]">Confidence: {(message.confidence * 100).toFixed(0)}%</p>
                ) : null}
                {message.suggestions && message.suggestions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.suggestions.map((item) => (
                      <button
                        key={`${message.id}-${item}`}
                        type="button"
                        onClick={() => void sendMessage(item)}
                        className="rounded-full border border-[#d6e2f5] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d4ed8] transition hover:bg-[#eef6ff]"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-black/6 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="Type your question about ChainWise navigation"
                className="min-h-[88px] flex-1 rounded-[1.4rem] border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none transition focus:border-[#60a5fa]"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-[1.4rem] bg-[#0f172a] px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-60 sm:w-[150px]"
              >
                {submitting ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default AssistantPage
