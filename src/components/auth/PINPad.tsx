import { useState } from "react";
import { Delete } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";

interface PINPadProps {
  onComplete: (pin: string) => void;
  length?: number;
  isPassword?: boolean;
}

export const PINPad = ({ onComplete, length = 4, isPassword = false }: PINPadProps) => {
  const [pin, setPin] = useState("");
  const { playFeedback } = useFeedback();

  const handlePress = (num: string) => {
    playFeedback("click");
    if (isPassword) {
      // For the owner password "Zabot", we don't limit by 4 digits
      setPin((prev) => prev + num);
      return;
    }
    if (pin.length < length) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === length) {
        setTimeout(() => {
          onComplete(newPin);
          setPin("");
        }, 100);
      }
    }
  };

  const handleDelete = () => {
    playFeedback("heavy");
    setPin((prev) => prev.slice(0, -1));
  };

  const handleConfirm = () => {
    if (isPassword) {
      onComplete(pin);
      setPin("");
    }
  };

  const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-[280px] mx-auto">
      <div className="flex gap-4 justify-center">
        {isPassword ? (
          <div className="text-3xl font-black tracking-widest text-primary border-b-4 border-primary min-h-[40px] px-4">
            {"*".repeat(pin.length)}
          </div>
        ) : (
          Array.from({ length }).map((_, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 border-primary transition-all duration-200 ${
                i < pin.length ? "bg-primary scale-110" : "bg-transparent"
              }`}
            />
          ))
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        {numbers.map((num) => (
          <button
            key={num}
            onClick={() => handlePress(num)}
            className="aspect-square rounded-full bg-[#2a2a2a] text-2xl font-black text-white active:scale-90 transition-transform flex items-center justify-center border border-white/5"
          >
            {num}
          </button>
        ))}
        <button
          onClick={handleDelete}
          className="aspect-square rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <Delete size={28} />
        </button>
        <button
          onClick={() => handlePress("0")}
          className="aspect-square rounded-full bg-[#2a2a2a] text-2xl font-black text-white active:scale-90 transition-transform flex items-center justify-center border border-white/5"
        >
          0
        </button>
        {isPassword ? (
          <button
            onClick={handleConfirm}
            className="aspect-square rounded-full bg-primary text-sm font-black text-primary-foreground active:scale-90 transition-transform flex items-center justify-center border border-white/5 uppercase"
          >
            OK
          </button>
        ) : (
          <div className="aspect-square" />
        )}
      </div>
    </div>
  );
};
