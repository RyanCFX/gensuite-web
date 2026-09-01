// Modal de instalación del certificado QZ Tray ("override.crt") — pre-registrarlo evita que
// QZ Tray muestre su diálogo "Action Required" incluso la primera vez que un equipo nuevo se
// conecta. Confirmado con hardware real: para certificados autofirmados ("Untrusted website"),
// QZ Tray no permite marcar "Remember this decision" junto con "Allow" en el diálogo normal —
// override.crt es la única vía soportada para cero diálogos con este tipo de certificado.
import { useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { downloadQzCertificate } from '@/shared/printing/qz'

type Os = 'mac' | 'windows' | 'linux'

interface Props {
  open: boolean
  onClose: () => void
}

export function QzCertificateModal({ open, onClose }: Props) {
  const [os, setOs] = useState<Os>('windows')

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={17} /> Instalar certificado QZ Tray
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            Pre-registrar este certificado en QZ Tray evita que aparezca el diálogo de aprobación
            al imprimir — incluso la primera vez. Es un paso único por equipo, no por usuario.
          </p>

          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => downloadQzCertificate()}>
            <Download size={15} /> Descargar certificado (override.crt)
          </button>

          <div className="divider" />

          <div className="tabs-bar">
            <button type="button" className={`tab-btn${os === 'windows' ? ' on' : ''}`} onClick={() => setOs('windows')}>
              Windows
            </button>
            <button type="button" className={`tab-btn${os === 'mac' ? ' on' : ''}`} onClick={() => setOs('mac')}>
              macOS
            </button>
            <button type="button" className={`tab-btn${os === 'linux' ? ' on' : ''}`} onClick={() => setOs('linux')}>
              Linux
            </button>
          </div>

          {os === 'windows' && (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <li>Descarga el certificado con el botón de arriba — se guarda como <code>override.crt</code>.</li>
              <li>
                Copia el archivo a la carpeta de instalación de QZ Tray (normalmente requiere permisos de
                administrador):
                <br />
                <code>C:\Program Files\QZ Tray\override.crt</code>
              </li>
              <li>Cierra QZ Tray por completo — clic derecho en su ícono de la bandeja del sistema → "Exit".</li>
              <li>Vuelve a abrir QZ Tray desde el menú Inicio.</li>
              <li>Listo — al imprimir, ya no debería pedir aprobación.</li>
            </ol>
          )}

          {os === 'mac' && (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <li>Descarga el certificado con el botón de arriba — se guarda como <code>override.crt</code> (normalmente en la carpeta Descargas).</li>
              <li>
                Abre Terminal y ejecuta (te pedirá tu contraseña de administrador):
                <br />
                <code style={{ display: 'block', marginTop: 4, padding: '6px 8px', background: 'var(--surface-sunken, #1a1a1a)', borderRadius: 4, wordBreak: 'break-all' }}>
                  sudo cp ~/Downloads/override.crt "/Applications/QZ Tray.app/Contents/Resources/override.crt"
                </code>
              </li>
              <li>Reinicia QZ Tray — ícono en la barra de menú → "Quit", y vuelve a abrirlo.</li>
              <li>Listo — al imprimir, ya no debería pedir aprobación.</li>
            </ol>
          )}

          {os === 'linux' && (
            <>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                <li>Descarga el certificado con el botón de arriba — se guarda como <code>override.crt</code>.</li>
                <li>
                  Copia el archivo a la carpeta de instalación de QZ Tray (típicamente <code>/opt/qz-tray/</code>
                  {' '}si se instaló con el paquete oficial — ajusta la ruta si la instalaste en otro lugar):
                  <br />
                  <code style={{ display: 'block', marginTop: 4, padding: '6px 8px', background: 'var(--surface-sunken, #1a1a1a)', borderRadius: 4, wordBreak: 'break-all' }}>
                    sudo cp ~/Downloads/override.crt /opt/qz-tray/override.crt
                  </code>
                </li>
                <li>Reinicia QZ Tray por completo.</li>
                <li>Listo — al imprimir, ya no debería pedir aprobación.</li>
              </ol>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                La ruta exacta en Linux no está confirmada tan a fondo como Windows/macOS — si
                QZ Tray sigue pidiendo aprobación después de estos pasos, confirma la carpeta real
                de instalación en tu distro antes de descartar el método.
              </p>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  )
}
