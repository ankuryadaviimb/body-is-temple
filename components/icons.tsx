/** Small inline SVG icon set (stroke icons, inherit currentColor). */
type IconProps = { className?: string; title?: string };

function Svg({ className = "size-6", title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const SeatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4h5v6H6z" />
    <path d="M4 10h16a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" />
    <path d="M9 16l-1 4h8l-1-4" />
  </Svg>
);
export const DropIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
  </Svg>
);
export const CupIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2" />
    <path d="M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3" />
  </Svg>
);
export const SpoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="14.5" cy="7.5" rx="3.5" ry="4.5" transform="rotate(35 14.5 7.5)" />
    <path d="M12 10.5L4 20" />
  </Svg>
);
export const LeafIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" />
    <path d="M5 19l7-7" />
  </Svg>
);
export const WindIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9h11a3 3 0 1 0-3-3" />
    <path d="M3 15h15a3 3 0 1 1-3 3" />
  </Svg>
);
export const FeatherIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 4c-7 0-12 5-12 12v4" />
    <path d="M8 16h6c3-2 5-6 6-12" />
  </Svg>
);
export const WalkIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M10 21l2-6 3 3v3M9 12l3-4 3 3 3 1M12 8l-3 1-2 4" />
  </Svg>
);
export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
);
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11l8-7 8 7v9H4z" />
    <path d="M10 20v-5h4v5" />
  </Svg>
);
export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Svg>
);
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const FlameIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.3 2.4-5.3 3.8-7.6.4 1.6 1.2 2.6 2.2 3.2.2-2.7 1.3-5 3.4-7.4.4 3.2 4.6 6.1 4.6 11.2 0 3.6-2.7 6.8-7.5 6.8z" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const CloudOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M9 6a6 6 0 0 1 8.7 3.9A4 4 0 0 1 20 17M17 18H7a4 4 0 0 1-1-7.9" />
  </Svg>
);
export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 8" />
  </Svg>
);
export const DumbbellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" />
  </Svg>
);
