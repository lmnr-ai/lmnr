import * as React from 'react'

import { cn } from '@/lib/utils'
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { fontSecurity, fontSans } from '@/lib/fonts';

export interface InputPasswordProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  inputKey: string;
}

/**
 * Text input field with password visibility toggle.
 * 
 * It doesn't use type=password so that it doesn't try to autofill passwords from the browser.
 * It uses text-security-disc font to hide the password.
 * Note that in this case special browser security features won't work, assuming that API keys, which are put here,
 * are not sensitive enough to be protected by the browser.
 */
const InputPassword = React.forwardRef<HTMLInputElement, InputPasswordProps>(
  ({ className, inputKey, value, onChange, placeholder, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const toggleVisibility = () => setShowPassword((prev) => !prev);

    return (
      <div {...props} className={cn(
        'flex items-center w-full bg-transparent',
        className
      )}>
        <input
          type='text'
          placeholder={placeholder ?? ""}
          className={cn((showPassword || !value) ? fontSans.variable : fontSecurity.className, 'flex h-9 px-3 w-full py-1 rounded-l-md border border-input border-r-0 text-sm transition-colors focus-visible:outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50')}
          ref={ref}
          key={inputKey}
          value={value}
          onChange={onChange}
        />
        <div onClick={toggleVisibility} className="cursor-pointer rounded-r-md border border-input border-l-0 p-1">
          <div className="p-1">
            {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </div>
        </div>
      </div>
    )
  }
)
InputPassword.displayName = 'InputPassword'

export { InputPassword }
