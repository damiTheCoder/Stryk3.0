import logo from '../images/stryk-logo-cropped.png'

interface Props {
  size?: number
  className?: string
}

export default function StrykLogo({ size = 22, className = '' }: Props) {
  return (
    <img
      src={logo}
      alt="Stryk"
      className={`inline-block select-none pointer-events-none object-contain ${className}`}
      style={{ height: size, width: 'auto', maxHeight: size }}
    />
  )
}

