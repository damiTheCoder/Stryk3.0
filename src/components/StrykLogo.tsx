/**
 * Stryk logo mark — white checkmark on transparent background.
 * Reproduces the rounded-V checkmark from the brand identity.
 */
interface Props {
  size?: number
  className?: string
}

export default function StrykLogo({ size = 28, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Rounded checkmark / tick mark matching the Stryk brand */}
      <path
        d="M18 28
           C18 18 26 12 36 16
           L48 24
           C54 27 56 33 52 39
           L46 50
           L72 28
           C80 22 90 26 88 36
           L60 80
           C56 88 46 88 42 80
           L18 42
           C14 34 14 28 18 28Z"
        fill="white"
      />
    </svg>
  )
}
