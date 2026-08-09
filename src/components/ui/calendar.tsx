import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { es } from 'date-fns/locale'

export type CalendarProps = DayPickerProps

function Chevron({ orientation, size = 16 }: { orientation?: 'up' | 'down' | 'left' | 'right'; size?: number }) {
  switch (orientation) {
    case 'left': return <ChevronLeft size={size} aria-hidden="true" />
    case 'up': return <ChevronUp size={size} aria-hidden="true" />
    case 'down': return <ChevronDown size={size} aria-hidden="true" />
    default: return <ChevronRight size={size} aria-hidden="true" />
  }
}

function Calendar({
  className = '',
  showOutsideDays = true,
  captionLayout = 'dropdown',
  locale = es,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      locale={locale}
      weekStartsOn={1}
      className={`calendar ${className}`}
      components={{ Chevron }}
      {...props}
    />
  )
}

export { Calendar }
