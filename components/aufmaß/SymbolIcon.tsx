import {
  Paintbrush, Building2, PanelTop, Home, BrickWall, Wrench, Camera, Ruler, Plane, ClipboardList, MapPin,
  Waypoints, Construction, Hammer, Package, Link2, Puzzle, Frame, Pencil, ShieldCheck, Disc, Lightbulb, Zap,
  Plug, Trees, Building, PersonStanding, Ban, Truck, HardHat, Umbrella, Grid3x3, Car, DoorOpen, Megaphone,
  Route, TrainFront, Waves, Square, type LucideIcon } from 'lucide-react';

// Ersetzt die Emojis in den Aufmaß-Schritten durch einheitliche Linien-Icons.
// Unbekannte Zeichen werden unverändert als Text ausgegeben (nichts geht verloren).
const ROH: Record<string, LucideIcon> = {
  '🎨': Paintbrush, '🏢': Building2, '🪟': PanelTop, '🏠': Home, '🧱': BrickWall, '🔧': Wrench,
  '📸': Camera, '📐': Ruler, '🚁': Plane, '📋': ClipboardList, '📍': MapPin, '🌉': Waypoints,
  '🚧': Construction, '⚒️': Hammer, '📦': Package, '⛓️': Link2, '🧩': Puzzle, '🖼️': Frame,
  '✏️': Pencil, '🛡️': ShieldCheck, '🛞': Disc, '💡': Lightbulb, '⚡': Zap, '🔌': Plug, '🌳': Trees,
  '🏘️': Building, '🚶': PersonStanding, '🚫': Ban, '🚛': Truck, '🏗️': HardHat, '☂️': Umbrella,
  '🕸️': Grid3x3, '🚗': Car, '🚪': DoorOpen, '📢': Megaphone, '🛣️': Route, '🚆': TrainFront, '🌊': Waves, '⬜': Square,
};
const norm = (s: string) => s.replace(/\uFE0F/g, '');
const ICONS: Record<string, LucideIcon> = Object.fromEntries(Object.entries(ROH).map(([k, v]) => [norm(k), v]));

export default function SymbolIcon({ e, className = 'w-5 h-5 shrink-0' }: { e: string; className?: string }) {
  const Icon = ICONS[norm(e)];
  if (Icon) return <Icon className={className} aria-hidden="true" />;
  return <span aria-hidden="true">{e}</span>;
}
