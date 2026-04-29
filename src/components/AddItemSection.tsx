import { useRef } from 'react'

const AddItemSection = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // TODO: 조화 분석 API 호출
      console.log('New item added:', file.name)
    }
  }

  return (
    <div className="bg-[#FAFAF8] rounded-2xl shadow-xl p-6 border border-secondary">
      <h3 className="text-xl font-semibold text-secondary mb-4">추가 아이템 분석</h3>
      
      <div className="border border-secondary rounded-xl p-6 text-center hover:border-secondary transition-colors bg-primary">
        <p className="text-secondary mb-4">조화를 확인할 새로운 패션 아이템 이미지를 추가하세요</p>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-2 bg-[#FAFAF8] border border-secondary text-secondary rounded-lg hover:bg-secondary hover:text-cream transition-all shadow-lg"
        >
          아이템 추가
        </button>
      </div>
    </div>
  )
}

export default AddItemSection

