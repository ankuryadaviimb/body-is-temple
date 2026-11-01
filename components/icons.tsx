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
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
);
export const PlateIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
  </Svg>
);
export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4M9 12h6M9 16h4" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const BulbIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1v.5h5V16c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </Svg>
);
export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
  </Svg>
);
export const DotsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" />
  </Svg>
);
export const ScaleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1.2-1.8" />
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5h14a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" />
    <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" />
  </Svg>
);
export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9L12 17.9l-1.9-5.3-5.3-1.9 5.3-1.9z" />
    <path d="M18.5 16.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
  </Svg>
);
export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19v-7M10 19V6M15 19v-5M20 19V9" />
  </Svg>
);
export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14.5H7.5A2.5 2.5 0 0 0 5 20z" />
    <path d="M5 20a1.5 1.5 0 0 0 1.5 1H19v-3.5" />
  </Svg>
);
export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5.5M6.5 11L12 5.5l5.5 5.5" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5z" />
  </Svg>
);
export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13 7l4 4" />
  </Svg>
);
export const SeedsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10l-1 15a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
    <path d="M10 11h.01M14 11h.01M12 14h.01M10 17h.01M14 17h.01" strokeWidth="2.6" />
  </Svg>
);
/** A crescent with a small "z": a daytime nap. */
export const NapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
    <path d="M15 3h4l-4 4h4" />
  </Svg>
);
/** A wrapped bar. */
export const BarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="8" rx="2" />
    <path d="M7 8v8M17 8v8M10 11h4M10 13h4" />
  </Svg>
);
/** A banana. */
export const FruitIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6c-1 6 2 12 9 13 3 .4 5-.6 6-2-6 0-11-4-12-11z" />
    <path d="M5 6l-.5-2" />
  </Svg>
);
/** A scoop of powder. */
export const ScoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11h12a6 6 0 0 1-12 0z" />
    <path d="M16 12l5-5" />
    <path d="M7 8.5c1-1.5 5-1.5 6 0" />
  </Svg>
);
/** A bowl. */
export const BowlIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11h18a9 9 0 0 1-18 0z" />
    <path d="M8 7c0-1.5 1-2 2-2M13 7c0-1.5 1-2 2-2" />
  </Svg>
);
/** Nuts. */
export const NutsIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="9" cy="13" rx="4" ry="5.5" transform="rotate(-25 9 13)" />
    <ellipse cx="16" cy="10" rx="3.2" ry="4.5" transform="rotate(20 16 10)" />
  </Svg>
);
/** An egg. */
export const EggIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c3.5 0 6.5 6 6.5 10.5a6.5 6.5 0 0 1-13 0C5.5 9 8.5 3 12 3z" />
  </Svg>
);
