export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="60 52 400 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Palaver"
    >
      <defs>
        <linearGradient id="pg" x1="70" y1="40" x2="440" y2="460" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6dd86" />
          <stop offset="0.5" stopColor="#d4af37" />
          <stop offset="1" stopColor="#9c7714" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="244" r="176" fill="url(#pg)" />
      <path d="M98.4 307.7 Q96 380 86 414 Q140 408 192.3 401.6 Z" fill="url(#pg)" />
      <circle cx="256" cy="244" r="160" fill="none" stroke="#17130a" strokeOpacity="0.28" strokeWidth="3" />
      <path d="M305.3 191.9Q305.3 164.9 295.3 154.2Q285.3 143.5 260.0 143.5H246.7V243.8H260.7Q284.1 243.8 294.7 232.0Q305.3 220.2 305.3 191.9ZM246.7 262.4V334.1L284.2 338.7V351.0H166.6V338.7L193.4 334.1V141.7L164.4 137.3V125.0H264.0Q312.1 125.0 335.8 141.1Q359.6 157.2 359.6 191.6Q359.6 262.4 277.0 262.4Z" fill="#17130a" />
    </svg>
  );
}
