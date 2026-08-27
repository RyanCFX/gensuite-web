import logo from "@/assets/logo.png";
import iso from "@/assets/iso.png";

interface LogoMarkProps {
  size?: number
  showText?: boolean
}

export default function LogoMark({ size = 36, showText = true }: LogoMarkProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
      {/*<div
        style={{
          width: size,
          height: size,
          background: 'var(--brand-primary)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <svg
          width={size * 0.5}
          height={size * 0.5}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>*/}
      {showText ? (
        // <span
        //   style={{
        //     fontSize: size * 0.47,
        //     fontWeight: 600,
        //     letterSpacing: '-0.025em',
        //     color: 'var(--text-primary)',
        //   }}
        // >
        //   GenSuite
        // </span>
        <img
          src={logo}
          className="dd-logo"
          style={{
            width: size * 4.47,
            // fontWeight: 600,
            // letterSpacing: '-0.025em',
            // color: 'var(--text-primary)',
          }}
        />
      ): <img
        src={iso}
        className="dd-logo"
        style={{
          width: size,
          // fontWeight: 600,
          // letterSpacing: '-0.025em',
          // color: 'var(--text-primary)',
        }}
      />}
    </div>
  )
}
