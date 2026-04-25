import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type BusinessHour, formatHour, weekdayLabel } from "@/lib/public-menu";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hours: BusinessHour[];
};

export default function HoursDialog({ open, onOpenChange, hours }: Props) {
  const today = new Date().getDay();
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Horários de funcionamento</DialogTitle>
        </DialogHeader>
        <ul className="divide-y divide-border">
          {sorted.map((h) => {
            const isToday = h.weekday === today;
            return (
              <li
                key={h.weekday}
                className={`flex items-center justify-between py-2 text-sm ${
                  isToday ? "font-bold text-primary" : ""
                }`}
              >
                <span>{weekdayLabel(h.weekday)}{isToday ? " (hoje)" : ""}</span>
                <span>
                  {h.is_closed
                    ? "Fechado"
                    : `${formatHour(h.opens_at)} – ${formatHour(h.closes_at)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
