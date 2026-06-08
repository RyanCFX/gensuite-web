import * as React from 'react'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', label, id, ...props }, ref) => {
    return (
      <label htmlFor={id} className="checkbox-wrap">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className={`checkbox-input ${className}`}
          {...props}
        />
        {label && <span className="checkbox-label">{label}</span>}
      </label>
    )
  },
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
