import React from 'react';
import { Player } from '@/types';

// Using EMOJI_STATES, EMOJI_MAPPING, EMOJI_EXPLANATIONS from attendance page for now
// Ideally, these could be moved to a shared constants file if used elsewhere

interface EmojiControlsProps {
  player: Player;
  currentEmoji: string;
  emojiStates: string[];
  emojiMapping: { [key: string]: string };
  emojiExplanations: { [key: string]: string };
  onEmojiChange: (player: Player, newEmoji: string) => void;
  disabled: boolean;
}

const EmojiControls: React.FC<EmojiControlsProps> = ({
  player,
  currentEmoji,
  emojiStates,
  emojiMapping,
  emojiExplanations,
  onEmojiChange,
  disabled
}) => {

  const handleInteraction = (direction: 'left' | 'right') => {
    if (disabled) return;
    let currentIndex = emojiStates.indexOf(currentEmoji);
    if (currentIndex === -1) currentIndex = 0; // Default to first if not found

    if (direction === 'left') {
      currentIndex = (currentIndex - 1 + emojiStates.length) % emojiStates.length;
    } else {
      currentIndex = (currentIndex + 1) % emojiStates.length;
    }
    onEmojiChange(player, emojiStates[currentIndex]);
  };

  const handleClickLabel = (event: React.MouseEvent<HTMLSpanElement, MouseEvent>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const direction = (clickX < rect.width / 2) ? 'left' : 'right';
    handleInteraction(direction);
  };

  return (
    <div className="flex items-center justify-center space-x-1 h-8">
      <button 
        className="flex-shrink-0 p-1 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors w-6 h-6 flex items-center justify-center"
        aria-label={`Previous emoji for ${player.name}`}
        data-direction="left"
        onClick={() => handleInteraction('left')}
        disabled={disabled}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3 h-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <span 
        className="flex-shrink-0 text-lg cursor-pointer select-none px-1 py-1 rounded hover:bg-gray-100 transition-colors w-8 h-8 flex items-center justify-center"
        title={emojiExplanations[currentEmoji] || currentEmoji}
        data-state={currentEmoji}
        onClick={handleClickLabel}
      >
        {emojiMapping[currentEmoji] || currentEmoji}
      </span>
      <button 
        className="flex-shrink-0 p-1 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors w-6 h-6 flex items-center justify-center"
        aria-label={`Next emoji for ${player.name}`}
        data-direction="right"
        onClick={() => handleInteraction('right')}
        disabled={disabled}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3 h-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
};

export default EmojiControls; 