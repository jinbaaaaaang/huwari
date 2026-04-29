interface AnalysisResultsProps {
  analysisData: any
}

const AnalysisResults = ({ analysisData }: AnalysisResultsProps) => {
  // TODO: analysisData를 사용하여 실제 분석 결과 표시
  return (
    <div className="bg-cream rounded-2xl shadow-xl p-6 border border-secondary">
      <h3 className="text-xl font-semibold text-secondary mb-4">분석 결과</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Color Analysis */}
        <div className="bg-primary rounded-xl p-4">
          <div className="text-sm text-secondary mb-2">색상</div>
          <div className="flex space-x-1 mb-2">
            <div className="w-6 h-6 rounded-full bg-primary border-2 border-cream"></div>
            <div className="w-6 h-6 rounded-full bg-secondary border-2 border-cream"></div>
            <div className="w-6 h-6 rounded-full bg-primary-dark border-2 border-cream"></div>
          </div>
          <div className="text-xs text-secondary">주요 색상 3개</div>
        </div>

        {/* Texture Analysis */}
        <div className="bg-primary rounded-xl p-4">
          <div className="text-sm text-secondary mb-2">재질</div>
          <div className="text-2xl font-bold text-secondary mb-1">-</div>
          <div className="text-xs text-secondary">분석 대기</div>
        </div>

        {/* Pattern Analysis */}
        <div className="bg-primary rounded-xl p-4">
          <div className="text-sm text-secondary mb-2">패턴</div>
          <div className="text-2xl font-bold text-secondary mb-1">-</div>
          <div className="text-xs text-secondary">분석 대기</div>
        </div>

        {/* Style Analysis */}
        <div className="bg-primary rounded-xl p-4">
          <div className="text-sm text-secondary mb-2">스타일</div>
          <div className="text-2xl font-bold text-secondary mb-1">-</div>
          <div className="text-xs text-secondary">분석 대기</div>
        </div>
      </div>
    </div>
  )
}

export default AnalysisResults

