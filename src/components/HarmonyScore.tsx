interface HarmonyScoreProps {
  score: number | undefined
}

const HarmonyScore = ({ score }: HarmonyScoreProps) => {
  const displayScore = score ?? 0
  const circumference = 2 * Math.PI * 56
  const offset = circumference - (displayScore / 100) * circumference

  return (
    <div className="bg-[#FAFAF8] rounded-2xl shadow-xl p-6 border border-secondary">
      <h3 className="text-xl font-semibold text-secondary mb-4">조화 점수</h3>
      
      <div className="text-center">
        <div className="relative inline-block mb-4">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="#e5e7eb"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="url(#gradient)"
              strokeWidth="8"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-1000"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#F4C9D6', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#3E2723', stopOpacity: 1 }} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl font-bold text-secondary">
                {score !== undefined ? score : '-'}
              </div>
              <div className="text-xs text-secondary">/ 100</div>
            </div>
          </div>
        </div>
        <p className="text-sm text-secondary">
          {score !== undefined
            ? '조화 분석 완료'
            : '이미지를 업로드하여 분석을 시작하세요'}
        </p>
      </div>
    </div>
  )
}

export default HarmonyScore

