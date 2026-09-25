import logo from '../images/veo-logo.png'

interface Props {
  size?: number
  className?: string
}

export default function VeoLogo({ size = 22, className = '' }: Props) {
  return (
    <img
      src={logo}
      alt="Veo"
      className={`inline-block select-none pointer-events-none object-contain rounded-full ${className}`}
      style={{ height: size, width: size, maxHeight: size }}
    />
  )
}

export { VeoLogo as StrykLogo }


