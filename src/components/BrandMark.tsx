type BrandMarkProps = {
  className?: string
  compact?: boolean
}

function BrandMark({ className = 'h-11 w-11', compact = false }: BrandMarkProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)] shadow-[0_16px_30px_rgba(37,99,235,0.22)] ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-[16%] rounded-[1.1rem] border border-white/12 bg-white/10" />
      <div className="absolute left-[26%] top-[24%] h-[52%] w-[26%] rounded-l-[0.95rem] rounded-r-[0.4rem] bg-white" />
      <div className="absolute left-[26%] top-[24%] h-[52%] w-[44%] rounded-[0.95rem] border-[0.34rem] border-white" />
      <div className="absolute left-[42%] top-[40%] h-[10%] w-[17%] rounded-full bg-[#60a5fa]" />
      {!compact ? (
        <div className="absolute left-[58%] top-[57%] h-[25%] w-[8%] rotate-[-38deg] rounded-full bg-[#bfdbfe]" />
      ) : null}
    </div>
  )
}

export default BrandMark
