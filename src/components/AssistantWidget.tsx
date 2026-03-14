import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { parseApiJson } from '../lib/api'
import BrandMark from './BrandMark'

type AssistantReply = {
  reply: string
  matched_intent: string
  confidence: number
  route: string | null
  route_label: string | null
  suggestions: string[]
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  route?: string | null
  routeLabel?: string | null
  suggestions?: string[]
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

function AssistantWidget() {
  const { authenticatedFetch, user } = useAuth()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const role = user?.role ?? 'resident'
  const suggestionSet = starterPrompts[role] ?? starterPrompts.resident
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'I can guide you through RecordWise. Ask what you want to do and I will point you to the right page.',
      suggestions: suggestionSet,
    },
  ])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isOpen])

  useEffect(() => {
    setMessages((current) => {
      const [firstMessage, ...rest] = current
      if (!firstMessage || firstMessage.id !== 'welcome') {
        return current
      }
      return [{ ...firstMessage, suggestions: suggestionSet }, ...rest]
    })
  }, [role, suggestionSet])

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim()
    if (!trimmed || submitting) {
      return
    }

    setIsOpen(true)
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
        },
      ])
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to contact the assistant.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(prompt)
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex items-end justify-end sm:bottom-6 sm:right-6">
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {isOpen ? (
          <section className="flex h-[min(70vh,620px)] w-[min(calc(100vw-1.5rem),380px)] flex-col overflow-hidden rounded-[1.75rem] border border-[#dbe4f0] bg-white shadow-[0_22px_70px_rgba(15,23,42,0.22)]">
            <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BrandMark className="h-10 w-10" compact />
                  <h2 className="text-xl font-semibold">RecordWise AI Assistant</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-lg text-white transition hover:bg-white/20"
                  aria-label="Close assistant"
                >
                  x
                </button>
              </div>
            </div>

            <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto bg-[#f8fbff] px-4 py-4">
              {messages.map((message) => {
                const canNavigate = Boolean(message.route && message.routeLabel && message.route !== '/assistant')

                return (
                  <article
                    key={message.id}
                    className={`max-w-[90%] rounded-[1.4rem] px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
                      message.role === 'user'
                        ? 'ml-auto bg-[#1d4ed8] text-white'
                        : 'bg-white text-[#0f172a] ring-1 ring-[#dbe7fb]'
                    }`}
                  >
                    <p className="whitespace-pre-line text-sm leading-6">{message.content}</p>
                    {canNavigate ? (
                      <button
                        type="button"
                        onClick={() => navigate(message.route!)}
                        className="mt-3 rounded-full border border-[#cfe0ff] bg-[#f5f9ff] px-3 py-1.5 text-xs font-semibold text-[#1d4ed8] transition hover:bg-[#eef6ff]"
                      >
                        Open {message.routeLabel}
                      </button>
                    ) : null}
                    {message.suggestions && message.suggestions.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
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
                )
              })}
              {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-black/6 bg-white px-4 py-4">
              <div className="flex items-end gap-3">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={2}
                  placeholder="Ask how to use RecordWise"
                  className="min-h-[64px] flex-1 resize-none rounded-[1.25rem] border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm text-[#111827] outline-none transition focus:border-[#60a5fa]"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-[1.2rem] bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? '...' : 'Send'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)] text-white shadow-[0_18px_36px_rgba(37,99,235,0.34)] transition hover:scale-[1.03]"
          aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-7 w-7" aria-hidden="true">
            <path d="M12 3v3" />
            <path d="M6.3 6.3 8.4 8.4" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
            <path d="m15.6 8.4 2.1-2.1" />
            <rect x="6" y="9" width="12" height="9" rx="3" />
            <path d="M9 21h6" />
            <path d="M10 13h.01" />
            <path d="M14 13h.01" />
            <path d="M9 16c.8.7 1.8 1 3 1s2.2-.3 3-1" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default AssistantWidget
