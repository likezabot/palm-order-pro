import { useNavigate } from "react-router-dom";
import { Smartphone, Monitor, DollarSign, Settings, Download, Share, User, Lock, ChefHat, LogIn } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PINPad } from "@/components/auth/PINPad";

interface Profile {
  id: string;
  name: string;
  role: 'waiter' | 'cook' | 'cashier' | 'manager' | 'owner';
  pin?: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();
  const { toast } = useToast();
  const { install, canPrompt, isIOS, showInstallBanner } = usePwaInstall();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showPinPad, setShowPinPad] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("name");
    
    if (error) {
      console.error(error);
    } else {
      setProfiles((data as any) || []);
    }
    setLoading(false);
  };

  const handleUserClick = (user: Profile) => {
    playFeedback("click");
    if (user.role === 'waiter' || user.role === 'cook') {
      login(user);
    } else {
      setSelectedUser(user);
      setShowPinPad(true);
    }
  };

  const login = (user: Profile) => {
    localStorage.setItem("user_profile", JSON.stringify(user));
    playFeedback("success");
    
    // Roteamento baseado no perfil
    if (user.role === 'waiter') navigate("/palm");
    else if (user.role === 'cook') navigate("/kitchen");
    else if (user.role === 'cashier') navigate("/cashier");
    else if (user.role === 'manager' || user.role === 'owner') navigate("/admin");
  };

  const handlePinComplete = (pin: string) => {
    if (!selectedUser) return;
    
    if (pin === selectedUser.pin) {
      login(selectedUser);
    } else {
      playFeedback("error");
      toast({
        title: "PIN Incorreto",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (showPinPad && selectedUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <button 
            onClick={() => setShowPinPad(false)}
            className="flex items-center gap-2 text-muted-foreground font-bold"
          >
            ← VOLTAR
          </button>
          <div className="text-center">
            <h2 className="text-2xl font-black text-primary uppercase">DIGITE SEU PIN</h2>
            <p className="text-muted-foreground font-bold">{selectedUser.name}</p>
          </div>
          <PINPad 
            onComplete={handlePinComplete} 
            isPassword={selectedUser.role === 'owner' && selectedUser.pin === 'Zabot'} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 bg-[#1a1a1a]">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-black tracking-tighter text-primary">
          PLANO B
        </h1>
        <p className="text-xl font-bold text-white/60 tracking-widest uppercase">ESPETARIA</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-sm font-black text-white/40 uppercase tracking-[0.2em] px-2">Quem está acessando?</h2>
        
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleUserClick(profile)}
                className="flex items-center justify-between gap-4 rounded-xl bg-[#2a2a2a] p-5 text-left transition-all duration-150 active:scale-[0.97] hover:bg-[#333] border border-white/5"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    {profile.role === 'waiter' && <Smartphone className="text-primary h-6 w-6" />}
                    {profile.role === 'cook' && <ChefHat className="text-primary h-6 w-6" />}
                    {profile.role === 'cashier' && <DollarSign className="text-primary h-6 w-6" />}
                    {profile.role === 'manager' && <Settings className="text-primary h-6 w-6" />}
                    {profile.role === 'owner' && <User className="text-primary h-6 w-6" />}
                  </div>
                  <div>
                    <span className="text-lg font-black text-white block">{profile.name}</span>
                    <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
                      {profile.role === 'waiter' && "Garçom"}
                      {profile.role === 'cook' && "Churrasqueiro"}
                      {profile.role === 'cashier' && "Caixa"}
                      {profile.role === 'manager' && "Gerente"}
                      {profile.role === 'owner' && "Dono"}
                    </span>
                  </div>
                </div>
                {(profile.role !== 'waiter' && profile.role !== 'cook') && <Lock size={18} className="text-white/20" />}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <button
            onClick={() => navigate("/print-station")}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/5 p-4 text-sm font-bold text-white/60 hover:bg-white/10 transition-colors"
          >
            <Monitor size={18} /> ABRIR ESTAÇÃO DE COZINHA (PC)
          </button>
        </div>
      </div>

      {showInstallBanner && (
        <div className="w-full max-w-sm rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-3 mt-4">
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-bold text-white text-sm uppercase">Instale o App</p>
              <p className="text-xs text-white/40 font-medium">Acesse mais rápido direto da tela inicial</p>
            </div>
          </div>
          {canPrompt ? (
            <button
              onClick={async () => {
                playFeedback("click");
                await install();
              }}
              className="w-full rounded-lg bg-primary py-3 text-sm font-black text-primary-foreground active:scale-[0.97] transition-transform"
            >
              INSTALAR AGORA
            </button>
          ) : isIOS ? (
            <p className="text-xs text-white/40 font-bold flex items-center gap-1.5">
              Toque em <Share className="h-4 w-4 inline" /> e depois em <strong>"Adicionar à Tela de Início"</strong>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default Index;
