import { useRef, useState } from 'react'

interface ImageUploadProps {
  onImageUpload: (imageUrl: string | null) => void
  uploadedImage: string | null
}

const ImageUpload = ({ onImageUpload, uploadedImage }: ImageUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        onImageUpload(e.target?.result as string)
        // TODO: API 호출하여 이미지 분석
      }
      reader.readAsDataURL(file)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  return (
    <div className="bg-cream rounded-2xl shadow-xl p-6 border border-secondary">
      <h3 className="text-xl font-semibold text-secondary mb-4">패션 아이템 이미지 업로드</h3>
      
      {!uploadedImage ? (
        <div
          className={`border border-secondary rounded-xl p-8 text-center transition-colors ${
            isDragging
              ? 'border-secondary bg-primary'
              : 'border-secondary hover:border-secondary bg-primary'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="flex flex-col items-center">
            <svg
              className="w-16 h-16 text-secondary mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-secondary mb-2">이미지를 드래그하거나 클릭하여 업로드</p>
            <p className="text-sm text-secondary">PNG, JPG, JPEG (최대 10MB)</p>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-6 py-2 bg-secondary text-white rounded-lg hover:bg-secondary-dark transition-colors"
            >
              파일 선택
            </button>
          </div>
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-primary">
          <img src={uploadedImage} alt="Preview" className="w-full h-auto" />
          <button
            onClick={() => onImageUpload(null)}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default ImageUpload

