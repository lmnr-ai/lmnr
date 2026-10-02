export interface ParagraphProps {
  progress: number;
}

const TEXT = `I realize that I need to take a closer look at the documentation. It seems important to list the files we have available while making sure to exclude any references to task.json. It's probably a good idea to ensure my output is clear and precise to avoid confusion later on. I'll check for any additional guidelines or details that might help with organizing this information effectively!`;
const WORDS = TEXT.split(' ');

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const Paragraph = ({progress}: ParagraphProps) => {
  const revealPosition = clamp01(progress) * WORDS.length;

  return (
    <p className="micro02-prompt" aria-label={TEXT}>
      {WORDS.map((word, index) => (
        <span
          key={`${index}-${word}`}
          aria-hidden="true"
          style={{opacity: clamp01(revealPosition - index)}}
        >
          {word}{index < WORDS.length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  );
};
