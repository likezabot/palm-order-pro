import { useState, useEffect } from "react";
import { X, Search, Loader2, Check, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ImageResult {
  thumbnail: string;
  url: string;
  title: string;
  source: string;
  domain: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  productSlug: string;
  onImageSelected: (url: string) => void;
  category: string;
}

export function ImageSearchModal({ isOpen, onClose, productName, productSlug, onImageSelected, category }: Props) {
  const [query, setQuery] = useState(productName);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && productName) {
      handleSearch();
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('product-image-assistant', {
        body: { action: 'search', query: query.trim() }
      });
      if (error) throw error;
      setResults(data.results || []);
    } catch (err: any) {
      toast({ title: "Erro na busca", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async (image: ImageResult) => {
    setProcessing(image.url);
    try {
      const { data, error } = await supabase.functions.invoke('product-image-assistant', {
        body: { 
          action: 'process', 
          imageUrl: image.url, 
          productSlug: productSlug || productName.toLowerCase().replace(/\s+/g, '-')
        }
      });
      if (error) throw error;
      
      onImageSelected(data.publicUrl);
      toast({ title: "Imagem aplicada!", description: "A imagem foi baixada e salva com sucesso." });
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao processar imagem", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Search size={20} className="text-primary" />
              Buscar Imagem Online
            </h2>
            <p className="text-xs text-muted-foreground">Escolha uma imagem real para o produto</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 bg-muted/10">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Ex: Skol 600ml garrafa..."
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="animate-spin" size={20} /> : "Buscar"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            Dica: Adicione palavras como "fundo branco" ou "png" para melhores resultados.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {searching ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="animate-spin text-primary" size={40} />
              <p className="animate-pulse">Buscando as melhores imagens...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {results.map((result, idx) => (
                <div key={idx} className="group relative bg-muted/20 rounded-xl border border-border overflow-hidden flex flex-col hover:border-primary/50 transition-all shadow-sm">
                  <div className="aspect-square relative overflow-hidden bg-white p-2">
                    <img
                      src={result.thumbnail || result.url}
                      alt={result.title}
                      className={`w-full h-full ${category === 'bebidas' || category === 'cervejas' ? 'object-contain' : 'object-cover'} group-hover:scale-105 transition-transform duration-300`}
                      loading="lazy"
                    />
                    {processing === result.url && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                        <Loader2 className="animate-spin text-white" size={24} />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-2 text-[10px] bg-card/50 backdrop-blur-md flex-1 flex flex-col justify-between gap-1 border-t border-border">
                    <p className="line-clamp-2 font-medium leading-tight h-7" title={result.title}>
                      {result.title}
                    </p>
                    <div className="flex items-center justify-between gap-1 mt-1">
                      <span className="text-muted-foreground truncate max-w-[60px]">{result.domain}</span>
                      <div className="flex gap-1">
                        <a 
                          href={result.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-muted rounded text-primary"
                          title="Ver maior"
                        >
                          <ExternalLink size={12} />
                        </a>
                        <button
                          onClick={() => handleSelect(result)}
                          disabled={!!processing}
                          className="px-2 py-0.5 bg-primary text-primary-foreground rounded text-[10px] font-bold hover:bg-primary/90 transition-colors flex items-center gap-1"
                        >
                          <Check size={10} />
                          Usar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
              <Search size={40} className="mb-2 opacity-20" />
              <p>Nenhuma imagem encontrada.<br/>Tente simplificar sua busca.</p>
            </div>
          )}
        </div>
        
        <div className="p-3 border-t border-border bg-muted/20 text-[10px] text-muted-foreground flex justify-between items-center">
          <span>Imagens podem estar sujeitas a direitos autorais.</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-[10px]">Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
