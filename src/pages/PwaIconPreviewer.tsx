import React, { useState } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  Layers,
  FileImage,
  FolderOpen,
  Info,
} from 'lucide-react';

type MaskType = 'circle' | 'square' | 'squircle' | 'ios';

interface MaskConfig {
  id: MaskType;
  label: string;
  borderRadius: string;
  shapeLabel: string;
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR';
  checklist: Array<{ text: string; status: 'pass' | 'warn' | 'fail' }>;
  files: string[];
  backgroundNote: string;
  safeZoneNote: string;
}

const MASKS: MaskConfig[] = [
  {
    id: 'circle',
    label: 'Circle / Adaptive',
    borderRadius: '50%',
    shapeLabel: 'Full circular clip',
    rating: 'EXCELLENT',
    checklist: [
      { text: 'Adaptive Icon Standard (Android 8+)', status: 'pass' },
      { text: 'Maskable icon specification compatible', status: 'pass' },
      { text: 'Background layer fills all canvas edges', status: 'pass' },
      { text: 'Safe zone padding is mandatory', status: 'warn' },
      { text: 'All branding contained within safe diameter', status: 'pass' },
    ],
    files: ['maskable-icon-512x512.png', 'icon-512x512.png', 'icon-192x192.png'],
    backgroundNote:
      'The outer background layer must extend fully to all four edges of the square canvas, well beyond the safe zone boundary. No transparency should be present in the background layer at any pixel.',
    safeZoneNote:
      'The safe diameter is 80% of the total icon dimension. The inner ring and central mark must not breach this boundary — any content outside it will be clipped by the circular mask.',
  },
  {
    id: 'square',
    label: 'Square',
    borderRadius: '0%',
    shapeLabel: 'No clip — full canvas',
    rating: 'FAIR',
    checklist: [
      { text: 'Basic PWA manifest compatible', status: 'pass' },
      { text: 'Adaptive mask not compatible', status: 'fail' },
      { text: 'Full canvas area remains visible', status: 'pass' },
      { text: 'Launcher may impose its own shape', status: 'warn' },
      { text: 'Background fills entire square canvas', status: 'pass' },
    ],
    files: ['icon-512x512.png', 'icon-192x192.png'],
    backgroundNote:
      'The background must be fully opaque across the entire square canvas. No pixel is cropped — all edge and corner pixels are displayed directly by the launcher. Avoid semi-transparent layers.',
    safeZoneNote:
      'The 80% safe zone is advisory only for square masks. All content is technically visible, but launcher chrome may obscure corners on some devices. Centralise all branding regardless.',
  },
  {
    id: 'squircle',
    label: 'Squircle',
    borderRadius: '27%',
    shapeLabel: 'Superellipse ~27% radius',
    rating: 'EXCELLENT',
    checklist: [
      { text: 'Modern Android launcher compatible', status: 'pass' },
      { text: 'Smooth superellipse corner crop applied', status: 'pass' },
      { text: 'Background bleed beyond safe zone sufficient', status: 'pass' },
      { text: 'Corner pixels permanently clipped', status: 'warn' },
      { text: 'All branding within safe diameter', status: 'pass' },
    ],
    files: ['safe-pwa-512x512.png', 'safe-pwa-192x192.png'],
    backgroundNote:
      'Ensure the outer background extends beyond the safe zone boundary on all sides. The squircle mask clips approximately 27% of each corner region — no critical branding element should reach those zones.',
    safeZoneNote:
      'The 80% safe diameter ensures all rendered marks clear the squircle curve. The background fills the remaining visible area automatically and should bleed fully to the canvas edge.',
  },
  {
    id: 'ios',
    label: 'iOS Shape',
    borderRadius: '22.5%',
    shapeLabel: 'iOS superellipse ~22.5%',
    rating: 'GOOD',
    checklist: [
      { text: 'Apple Touch Icon compatible', status: 'pass' },
      { text: 'Safari bookmark and web clip ready', status: 'pass' },
      { text: 'Fully opaque background required', status: 'warn' },
      { text: 'Alpha transparency not supported', status: 'fail' },
      { text: 'iOS superellipse corner radius matched', status: 'pass' },
    ],
    files: ['apple-touch-icon.png (180×180)', 'icon-192x192.png'],
    backgroundNote:
      'iOS applies its own clipping mask — the exported file must have a fully opaque background at every pixel. Any alpha transparency will render as solid black on device. The background must extend to all four canvas edges.',
    safeZoneNote:
      'The iOS mask clips at a superellipse radius of approximately 22.5%. The 80% safe zone ensures the inner ring and central mark remain fully visible after the system-level clip is applied.',
  },
];

const RATING_BADGE: Record<string, string> = {
  EXCELLENT: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  GOOD: 'bg-sky-100 text-sky-800 border border-sky-300',
  FAIR: 'bg-amber-100 text-amber-800 border border-amber-300',
};

function StatusIcon({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  if (status === 'pass')
    return <CheckCircle size={13} className="text-emerald-500 shrink-0 mt-0.5" />;
  if (status === 'warn')
    return <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />;
  return <XCircle size={13} className="text-rose-500 shrink-0 mt-0.5" />;
}

function CQLogo({ uid }: { uid: string }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CQ Logo"
    >
      <defs>
        <linearGradient id={`bg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b0764" />
          <stop offset="45%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
        <linearGradient id={`qs-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="100%" stopColor="#fae8ff" />
        </linearGradient>
      </defs>
      {/* Background — square fill so all mask shapes reveal the gradient */}
      <rect width="200" height="200" fill={`url(#bg-${uid})`} />
      {/* Q outer ring */}
      <circle
        cx="97"
        cy="92"
        r="48"
        fill="none"
        stroke={`url(#qs-${uid})`}
        strokeWidth="16"
      />
      {/* Q tail */}
      <line
        x1="132"
        y1="128"
        x2="158"
        y2="162"
        stroke={`url(#qs-${uid})`}
        strokeWidth="15"
        strokeLinecap="round"
      />
      {/* Dark inner ring */}
      <circle cx="97" cy="92" r="27" fill="#13111c" stroke="#374151" strokeWidth="1.5" />
      {/* CQ text */}
      <text
        x="97"
        y="92"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize="19"
        fontWeight="bold"
        fontFamily="Arial, Helvetica, sans-serif"
        letterSpacing="2"
      >
        CQ
      </text>
    </svg>
  );
}

function MaskedIcon({
  uid,
  size,
  clipStyle,
  showSafe,
}: {
  uid: string;
  size: number;
  clipStyle: React.CSSProperties;
  showSafe: boolean;
}) {
  return (
    <div className="relative shadow-lg" style={{ width: size, height: size }}>
      <div className="w-full h-full" style={clipStyle}>
        <CQLogo uid={uid} />
      </div>
      {showSafe && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="rounded-full border-2 border-dashed border-amber-400"
            style={{ width: '80%', height: '80%' }}
          />
        </div>
      )}
    </div>
  );
}

export default function PwaIconPreviewer() {
  const [maskId, setMaskId] = useState<MaskType>('circle');
  const [showSafe, setShowSafe] = useState(false);
  const [hoveredSize, setHoveredSize] = useState<'192' | '512' | null>(null);

  const mask = MASKS.find((m) => m.id === maskId)!;
  const clipStyle: React.CSSProperties = {
    borderRadius: mask.borderRadius,
    overflow: 'hidden',
  };

  return (
    <div
      className="flex flex-col bg-slate-50 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden select-none"
      style={{ height: 800 }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white shrink-0">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-fuchsia-400" />
          <span className="font-bold tracking-wide text-sm">PWA Icon Previewer</span>
        </div>
        <span className="text-xs text-slate-400">Mask simulator · safe zone checker</span>
      </div>

      {/* ── Middle Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: Controls */}
        <div className="w-48 shrink-0 flex flex-col gap-5 p-4 border-r border-slate-200 bg-white overflow-y-auto">
          {/* Mask selector */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Select Mask
            </p>
            <div className="space-y-1">
              {MASKS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setMaskId(opt.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    maskId === opt.id
                      ? 'bg-fuchsia-600 text-white shadow'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Safe zone toggle */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Safe Zone Overlay
            </p>
            <button
              onClick={() => setShowSafe((v) => !v)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                showSafe
                  ? 'bg-amber-50 border-amber-400 text-amber-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {showSafe ? <Eye size={13} /> : <EyeOff size={13} />}
              {showSafe ? 'Hide Overlay' : 'Show Overlay'}
            </button>
          </div>

          {/* Shape diagram */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Mask Shape
            </p>
            <div className="flex justify-center">
              <div
                className="w-14 h-14 bg-gradient-to-br from-fuchsia-500 to-purple-800 shadow-inner transition-all duration-300"
                style={{ borderRadius: mask.borderRadius }}
              />
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2 leading-tight">
              {mask.shapeLabel}
            </p>
          </div>

          {/* Current rating in sidebar */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Rating
            </p>
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${RATING_BADGE[mask.rating]}`}
            >
              {mask.rating}
            </span>
          </div>
        </div>

        {/* Center: Main Preview */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-slate-100 gap-3 px-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Live Preview
          </p>
          <MaskedIcon uid="main" size={224} clipStyle={clipStyle} showSafe={showSafe} />
          {showSafe ? (
            <p className="text-[11px] text-amber-600 text-center max-w-[200px] leading-tight">
              Dashed ring = 80% safe diameter. All branding must stay inside.
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 text-center max-w-[200px] leading-tight">
              Toggle the overlay to inspect safe zone boundaries.
            </p>
          )}
        </div>

        {/* Right: Size Thumbnails */}
        <div className="w-40 shrink-0 flex flex-col items-center justify-center gap-7 border-l border-slate-200 bg-white py-6 px-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sizes</p>

          {/* 512 representation */}
          <div
            className="flex flex-col items-center gap-2 cursor-default"
            onMouseEnter={() => setHoveredSize('512')}
            onMouseLeave={() => setHoveredSize(null)}
          >
            <div
              className={`transition-transform duration-150 ${
                hoveredSize === '512' ? 'scale-110' : ''
              }`}
            >
              <MaskedIcon uid="sz512" size={80} clipStyle={clipStyle} showSafe={showSafe} />
            </div>
            <div className="text-center">
              <p
                className={`text-xs font-bold transition-colors ${
                  hoveredSize === '512' ? 'text-fuchsia-600' : 'text-slate-700'
                }`}
              >
                512 × 512
              </p>
              <p className="text-[10px] text-slate-400">Splash / Standard</p>
            </div>
          </div>

          {/* 192 representation */}
          <div
            className="flex flex-col items-center gap-2 cursor-default"
            onMouseEnter={() => setHoveredSize('192')}
            onMouseLeave={() => setHoveredSize(null)}
          >
            <div
              className={`transition-transform duration-150 ${
                hoveredSize === '192' ? 'scale-110' : ''
              }`}
            >
              <MaskedIcon uid="sz192" size={48} clipStyle={clipStyle} showSafe={showSafe} />
            </div>
            <div className="text-center">
              <p
                className={`text-xs font-bold transition-colors ${
                  hoveredSize === '192' ? 'text-fuchsia-600' : 'text-slate-700'
                }`}
              >
                192 × 192
              </p>
              <p className="text-[10px] text-slate-400">Home Screen</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results Panel ── */}
      <div className="shrink-0 border-t border-slate-200 bg-white" style={{ height: 268 }}>
        <div className="h-full overflow-y-auto">
          <div className="p-4 space-y-3">

            {/* Rating row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {mask.label} Compatibility:
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${RATING_BADGE[mask.rating]}`}
              >
                {mask.rating}
              </span>
            </div>

            {/* Checklist */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Applicability Checklist
              </p>
              <div className="space-y-1">
                {mask.checklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <StatusIcon status={item.status} />
                    <span className="text-xs text-slate-600 leading-tight">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Required output files */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
                <FileImage size={11} />
                Required Output Files
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mask.files.map((f, i) => (
                  <span
                    key={i}
                    className="text-[11px] font-mono bg-fuchsia-50 text-fuchsia-800 rounded px-2 py-0.5 border border-fuchsia-200"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Background behaviour */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1">
                <Info size={11} />
                Background Behaviour
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">{mask.backgroundNote}</p>
            </div>

            {/* Safe zone guidance */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Safe Zone Guidance
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">{mask.safeZoneNote}</p>
            </div>

            {/* Directory */}
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <FolderOpen size={11} />
                Directory
              </p>
              <span className="text-[11px] font-mono bg-emerald-50 text-emerald-800 rounded px-2 py-0.5 border border-emerald-200">
                /public
              </span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
