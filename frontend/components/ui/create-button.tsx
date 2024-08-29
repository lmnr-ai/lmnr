import React from 'react';
import { Button } from './button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
}

const CreateButton: React.FC<ButtonProps> = ({ onClick, className, children }) => {
  return (
    <Button variant="default" onClick={onClick} className={cn(className, 'h-7')}>
      <Plus size={16} className='mr-1' />
      {children}
    </Button>
  );
};

export default CreateButton;
