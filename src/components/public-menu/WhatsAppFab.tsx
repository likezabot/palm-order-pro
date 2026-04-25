import { MessageCircle } from "lucide-react";

type Props = {
  phone: string | null;
  restaurantName: string;
};

function buildWhatsAppLink(phone: string, restaurantName: string): string {
  const digits = phone.replace(/\D/g, "");
  const text = encodeURIComponent(
    `Olá, estou vendo o cardápio online da ${restaurantName} e gostaria de ajuda.`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}

export default function WhatsAppFab({ phone, restaurantName }: Props) {
  if (!phone || phone.replace(/\D/g, "").length < 10) return null;
  const href = buildWhatsAppLink(phone, restaurantName);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Falar com ${restaurantName} no WhatsApp`}
      style={{
        bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        right: "1rem",
      }}
      className="fixed z-20 flex h-12 w-12 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg transition-transform active:scale-95 hover:scale-105"
    >
      <MessageCircle size={22} aria-hidden />
    </a>
  );
}
