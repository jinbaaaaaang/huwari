interface CharacterDisplayProps {
  harmonyLevel?: 'happy' | 'normal' | 'angry'
}

const CharacterDisplay = ({ harmonyLevel = 'normal' }: CharacterDisplayProps) => {
  const getCharacterSrc = () => {
    switch (harmonyLevel) {
      case 'happy':
        return '/assets/happy_gini.svg'
      case 'angry':
        return '/assets/angry_gini.svg'
      default:
        return '/assets/normal_gini.svg'
    }
  }

  return (
    <div className="bg-cream rounded-2xl shadow-xl p-6 border border-secondary">
      <h3 className="text-xl font-semibold text-secondary mb-4">조화 상태</h3>
      <div className="flex justify-center">
        <img src={getCharacterSrc()} alt="Gini" className="w-32 h-32" />
      </div>
    </div>
  )
}

export default CharacterDisplay

