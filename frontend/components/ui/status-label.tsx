interface StatusLabelProps {
  success: boolean;
}

export default function StatusLabel({ success }: StatusLabelProps) {
  if (success) {
    return <div className='bg-green-800/20 h-[18px] w-16 justify-center flex items-center border-green-200/20 border text-green-200/60 font-medium text-xs rounded'>Success</div>
  } else {
    return <div className='bg-red-800/20 h-[18px] w-16 justify-center flex items-center border-red-600/20 border text-red-500/80 font-medium text-xs rounded'>Failed</div>
  }
}