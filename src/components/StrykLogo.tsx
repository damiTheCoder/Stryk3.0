import logo from '../images/Logo.jpeg'

interface Props {
  size?: number
  className?: string
}

export default function StrykLogo({ size = 28, className = '' }: Props) {
  return (
    <img
      src={logo}
      alt="Stryk"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'cover', borderRadius: 'inherit' }}
    />
  )
}
