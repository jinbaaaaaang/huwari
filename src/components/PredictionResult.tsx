interface PredictionResultProps {
  prediction: any
}

const PredictionResult = ({ prediction }: PredictionResultProps) => {
  return (
    <div className="bg-[#FAFAF8] rounded-2xl shadow-xl p-6 border border-secondary">
      <h3 className="text-xl font-semibold text-secondary mb-4">예측 결과</h3>
      
      <div className="space-y-4">
        {prediction ? (
          <div className="text-center py-4">
            <p className="text-secondary">{prediction.message}</p>
          </div>
        ) : (
          <div className="text-center py-8 text-secondary">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p>분석 결과가 여기에 표시됩니다</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default PredictionResult

