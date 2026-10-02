import {
  Type,
  QrCode,
  Barcode as BarcodeIcon,
  Sigma,
  Minus,
  Image as ImageIcon,
  Table as TableIcon,
  Rows3,
  List as ListIcon,
  CalendarDays,
  GitBranch,
  Square,
  Layers,
} from 'lucide-react'
import type { ElementType } from './types'

const ICONS: Record<ElementType, React.ComponentType<{ size?: number }>> = {
  text: Type,
  qr: QrCode,
  barcode: BarcodeIcon,
  formula: Sigma,
  line: Minus,
  logo: ImageIcon,
  table: TableIcon,
  repeater: Rows3,
  list: ListIcon,
  date: CalendarDays,
  conditional: GitBranch,
  rectangle: Square,
  group: Layers,
}

export function ElementTypeIcon({ type, size = 15 }: { type: ElementType; size?: number }) {
  const Icon = ICONS[type]
  return <Icon size={size} />
}
